// Taller > Batalla de prueba: un escuadron armado a mano contra los enemigos que se elijan, en el mapa que se elija.
// Sirve para ver como se ven las piezas y los sprites peleando, y para probar balance sin jugar una campana.
import { h, boton, botonIcono, ico, panel } from '../ui/comun.js';
import { crearAzar } from '../core/azar.js';
import { simular } from '../motor/simular.js';
import { ENCAJES, normalizarPieza } from '../motor/unidades.js';
import { armarMision } from '../campana/misiones.js';
import { crearRecluta, mechaDeClase } from '../campana/reclutas.js';
import { Repeticion } from '../vista/repeticion.js';

const NOMBRE_ENCAJE = { cabeza: 'Cabeza', torso: 'Torso', piernas: 'Piernas', brazo_der: 'Brazo der.', brazo_izq: 'Brazo izq.', mochila: 'Mochila' };

// Lo que queda armado entre visitas a la pestana
const E = {
  mechas: null, // [{ clase, nivel, mecha }]
  plantilla: 'asalto', dificultad: 2, nivel: 2, escuadras: [], mapa: 'generado', semilla: 1234
};

export function pestanaBatalla(T, raiz) {
  const d = T.datos;
  if (!E.mechas) E.mechas = ['vanguardia', 'tirador', 'medico', 'infiltrador'].filter((c) => d.clases[c]).map((c) => ({ clase: c, nivel: 2, mecha: mechaDeClase(d, c) }));
  const partesDe = (encaje) => Object.entries(d.partes).filter(([, p]) => p.encaje === (encaje.startsWith('brazo') ? 'brazo' : encaje))
    .sort((a, b) => (a[1].nombre || a[0]).localeCompare(b[1].nombre || b[0]));

  // ---- escuadron
  const listaMechas = h('div', { class: 'tl-mechas' });
  const pintarMechas = () => listaMechas.replaceChildren(...E.mechas.map((m, i) => h('fieldset', { class: 'tl-mecha' },
    h('legend', {}, 'Mecha ' + (i + 1)),
    h('label', {}, 'Clase ', h('select', { onchange: (e) => { m.clase = e.target.value; m.mecha = mechaDeClase(d, m.clase); pintarMechas(); } },
      ...Object.entries(d.clases).map(([id, c]) => h('option', { value: id, ...(id === m.clase ? { selected: true } : {}) }, c.nombre || id)))),
    h('label', {}, 'Nivel ', h('input', { type: 'number', min: 1, max: 12, value: m.nivel, onchange: (e) => { m.nivel = Number(e.target.value) || 1; } })),
    ...ENCAJES.map((enc) => {
      const actual = normalizarPieza(m.mecha[enc]);
      return h('label', {}, NOMBRE_ENCAJE[enc] + ' ', h('select', { onchange: (e) => { m.mecha[enc] = e.target.value ? { parte: e.target.value, afijos: [] } : null; } },
        h('option', { value: '' }, '—'),
        ...partesDe(enc).map(([id, p]) => h('option', { value: id, ...(actual && actual.parte === id ? { selected: true } : {}) }, (p.nombre || id) + ' · ' + (p.rareza || '')))));
    }),
    E.mechas.length > 1 ? boton('Quitar', () => { E.mechas.splice(i, 1); pintarMechas(); }, { clase: 'secundario compacto' }) : null)));
  pintarMechas();

  // ---- enemigos y mapa
  const opcion = (v, t, sel) => h('option', { value: v, ...(sel ? { selected: true } : {}) }, t);
  const escuadras = h('div', { class: 'tl-checks' }, ...Object.entries(d.enemigos.escuadras).map(([id, e]) =>
    h('label', {}, h('input', { type: 'checkbox', ...(E.escuadras.includes(id) ? { checked: true } : {}),
      onchange: (ev) => { E.escuadras = ev.target.checked ? E.escuadras.concat(id) : E.escuadras.filter((x) => x !== id); } }), ' ' + (e.nombre || id))));
  let campoSemilla = null;
  const estilos = Object.keys((d.generador_mapas || {}).estilos || {});
  const config = h('div', { class: 'tl-config' },
    h('label', {}, 'Tipo de misión ', h('select', { onchange: (e) => { E.plantilla = e.target.value; } },
      ...Object.entries(d.misiones).map(([id, m]) => opcion(id, m.nombre || id, id === E.plantilla)))),
    h('label', {}, 'Dificultad ', h('select', { onchange: (e) => { E.dificultad = Number(e.target.value); } }, ...[1, 2, 3, 4].map((n) => opcion(n, String(n), n === E.dificultad)))),
    h('label', {}, 'Nivel enemigo ', h('input', { type: 'number', min: 1, max: 15, value: E.nivel, onchange: (e) => { E.nivel = Number(e.target.value) || 1; } })),
    h('label', {}, 'Mapa ', h('select', { onchange: (e) => { E.mapa = e.target.value; } },
      opcion('generado', 'Generado (estilo al azar)', E.mapa === 'generado'),
      ...estilos.map((s) => opcion('generado:' + s, 'Generado · ' + s, E.mapa === 'generado:' + s)),
      ...Object.keys(d.mapas).map((id) => opcion(id, 'A mano · ' + (d.mapas[id].nombre || id), E.mapa === id)))),
    h('label', {}, 'Semilla ', (campoSemilla = h('input', { type: 'number', value: E.semilla, onchange: (e) => { E.semilla = Number(e.target.value) || 1; } }))));

  // ---- batalla
  const lienzo = h('canvas', { class: 'campo' });
  const envoltura = h('div', { class: 'campo-envoltura' }, lienzo);
  const feed = h('ol', { class: 'taclog-lista' });
  const resultado = h('p', { class: 'tl-resultado' });
  let rep = null, corriendo = false, ultimo = 0;
  const bucle = (t) => {
    if (!corriendo) return;
    const dt = Math.min(100, t - (ultimo || t));
    ultimo = t;
    if (rep) { rep.avanzar(dt); rep.dibujar(); }
    requestAnimationFrame(bucle);
  };

  const pelear = () => {
    const az = crearAzar(E.semilla);
    const cambios = { forzarMapa: E.mapa === 'generado' ? 'generado' : E.mapa };
    if (E.escuadras.length) cambios.enemigos = E.escuadras;
    let m;
    try { m = armarMision(d, E.plantilla, E.dificultad, az, E.nivel, cambios); }
    catch (e) { T.aviso('No se pudo armar la misión: ' + e.message, 'error'); return; }
    const azP = crearAzar(E.semilla + 7);
    const escuadron = E.mechas.map((x, i) => {
      const pi = crearRecluta(d, azP, 'p' + (i + 1), x.clase);
      pi.nivel = x.nivel;
      pi.mecha = JSON.parse(JSON.stringify(x.mecha));
      return { piloto: pi, mecha: pi.mecha, gambits: pi.gambits };
    });
    let r;
    try { r = simular(d, { mision: m, escuadron, semilla: m.semilla }); }
    catch (e) { T.aviso('El motor falló: ' + e.message, 'error'); console.error(e); return; }
    feed.replaceChildren();
    resultado.textContent = (r.victoria ? 'VICTORIA' : 'DERROTA') + ' · ' + (r.motivo || '') + ' · ' + (r.registro.at(-1) || {}).t + ' ticks · ' +
      (m.plano ? 'mapa ' + m.plano.nombre + ' (' + m.plano.estilo + ')' : 'mapa ' + m.mapa);
    resultado.className = 'tl-resultado ' + (r.victoria ? 'bien' : 'mal');
    rep = new Repeticion({
      datos: d, mision: m, registro: r.registro, canvas: lienzo, pilotos: new Map(escuadron.map((e) => [e.piloto.id, e.piloto])),
      alEvento: (ev) => { feed.prepend(h('li', { class: ev.clase + (ev.importante ? ' importante' : '') }, ev.texto)); while (feed.children.length > 60) feed.lastChild.remove(); },
      alTerminar: () => {}
    });
    if (!corriendo) { corriendo = true; ultimo = 0; requestAnimationFrame(bucle); }
  };

  const controles = h('div', { class: 'tl-controles' },
    boton('Pelear', pelear, { iconoNombre: 'espadas', clase: 'principal' }),
    boton('Otra semilla', () => { E.semilla = Math.floor(Math.random() * 99999) + 1; pestanaRepintar(); pelear(); }, { iconoNombre: 'dado', clase: 'secundario' }),
    botonIcono('pausa', 'Pausa', () => { if (rep) rep.pausado = !rep.pausado; }, 'control'),
    ...[0.5, 1, 2, 4, 8].map((v) => h('button', { class: 'boton-icono control vel', onclick: () => { if (rep) { rep.velocidad = v; rep.pausado = false; } } }, v + 'x')),
    botonIcono('saltar', 'Ver el final', () => rep && rep.saltarAlFinal(), 'control'),
    botonIcono('mapa', 'Cámara: todo el mapa / acción', () => rep && rep.alternarGeneral(), 'control'));

  // ---- luces: se ven al instante en la batalla de prueba
  const luzDe = (o) => (o.arte || {}).luz;
  const ponerLuz = (ruta, v) => {
    // (los datos del juego estan congelados: se cambia el archivo crudo y se rearman)
    if (Object.isFrozen((T.crudos.reglas.arte || {}).luz || {})) T.crudos.reglas = JSON.parse(JSON.stringify(T.crudos.reglas));
    const ks = ruta.split('.'); let x = luzDe(T.crudos.reglas);
    if (!x) return;
    for (const k of ks.slice(0, -1)) x = x[k] = x[k] || {};
    x[ks.at(-1)] = v;
    T.rearmar('reglas');
  };
  const leerLuz = (ruta) => ruta.split('.').reduce((x, k) => (x ? x[k] : undefined), luzDe(T.crudos.reglas));
  const deslizador = (etiqueta, ruta, min, max, paso) => h('label', {}, etiqueta + ' ',
    h('input', { type: 'range', min, max, step: paso, value: leerLuz(ruta) ?? min, oninput: (e) => ponerLuz(ruta, Number(e.target.value)) }));
  const colorLuz = (etiqueta, ruta) => h('label', {}, etiqueta + ' ',
    h('input', { type: 'color', value: leerLuz(ruta) || '#808080', oninput: (e) => ponerLuz(ruta, e.target.value) }));
  let modoLuz = 'completa';
  try { modoLuz = localStorage.getItem('mf-luces') || 'completa'; } catch { /* nada */ }
  const panelLuces = luzDe(T.crudos.reglas) ? panel('Luces',
    h('p', { class: 'ayuda' }, 'Se ve en vivo en la batalla de arriba. «Guardar» las deja en data/reglas.json. Normal maps: nombre_n.png; lo que brilla: nombre_e.png (al lado del sprite).'),
    h('div', { class: 'tl-config' },
      h('label', {}, 'Calidad (esta compu) ', h('select', { onchange: (e) => { try { localStorage.setItem('mf-luces', e.target.value); } catch { /* nada */ } } },
        ...[['completa', 'Completa (relieve)'], ['simple', 'Simple'], ['no', 'Apagadas']].map(([v, t]) => h('option', { value: v, ...(v === modoLuz ? { selected: true } : {}) }, t)))),
      h('label', {}, h('input', { type: 'checkbox', ...(leerLuz('activa') ? { checked: true } : {}), onchange: (e) => ponerLuz('activa', e.target.checked) }), ' Luces en el juego'),
      colorLuz('Penumbra', 'ambiente'),
      ...Object.keys(leerLuz('ambiente_por_estilo') || {}).map((k) => colorLuz('· ' + k, 'ambiente_por_estilo.' + k)),
      deslizador('Relieve', 'relieve', 0, 12, 0.5),
      deslizador('Halo', 'halo', 0, 3, 0.1),
      deslizador('Faro: alcance', 'faro.radio', 1, 10, 0.5),
      deslizador('Faro: fuerza', 'faro.intensidad', 0, 3, 0.1),
      deslizador('Faro: ancho', 'faro.cono', 10, 80, 1),
      colorLuz('Faro: color', 'faro.color'),
      deslizador('Faro enemigo: fuerza', 'faro_enemigo.intensidad', 0, 3, 0.1),
      deslizador('Aura: fuerza', 'aura.intensidad', 0, 2, 0.05),
      deslizador('Fogonazo: fuerza', 'fogonazo.intensidad', 0, 4, 0.1),
      deslizador('Explosión: fuerza', 'explosion.intensidad', 0, 5, 0.1),
      deslizador('Ácido: fuerza', 'acido.intensidad', 0, 2, 0.05)),
    boton('Guardar luces', () => T.guardar('reglas'), { iconoNombre: 'estrella', clase: 'principal compacto' })) : null;

  const pestanaRepintar = () => { if (campoSemilla) campoSemilla.value = E.semilla; };

  raiz.append(
    h('div', { class: 'tl-columnas' },
      h('div', { class: 'tl-izq' },
        panel('Escuadrón', listaMechas,
          E.mechas.length < 6 ? boton('Sumar mecha', () => { E.mechas.push({ clase: 'vanguardia', nivel: 2, mecha: mechaDeClase(d, 'vanguardia') }); pintarMechas(); }, { iconoNombre: 'mas', clase: 'secundario compacto' }) : null),
        panel('Enemigos y mapa', config,
          h('details', {}, h('summary', {}, 'Elegir escuadras enemigas (si no marcás ninguna, salen las de la misión)'), escuadras))),
      h('div', { class: 'tl-der' },
        controles, resultado, envoltura, panelLuces,
        h('section', { class: 'taclog' }, h('h2', { class: 'taclog-titulo' }, '[ TAC-LOG ]'), feed))));

  return () => { corriendo = false; };
}
