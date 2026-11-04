// Hangar: el escuadron, el mecha de cada piloto (partes por encaje) y sus ordenes (gambits).
import { h, montar, ico, boton, botonIcono, panel, chip, barra, barraCampana, describirParte, nombrePieza, textoPersonalidad, retrato } from './comun.js';
import { unidadDePiloto, pesoMecha, normalizarPieza } from '../motor/unidades.js';
import { dibujarMechaFicha } from '../vista/dibujo.js';
import { equipar, guardarGambits, encajeDeSlot, reparar, costoReparacion, vidaDelMecha, partesRotas, vidaDeSalida } from '../campana/partida.js';
import { nombreDeMecha } from '../campana/reclutas.js';
import { relaciones } from '../campana/animo.js';
import { existeIcono } from './iconos.js';

const SLOTS = [['cabeza', 'Cabeza'], ['torso', 'Torso'], ['piernas', 'Piernas'], ['brazo_izq', 'Brazo izq.'], ['brazo_der', 'Brazo der.'], ['mochila', 'Mochila']];

export function hangar(app, raiz, opciones = {}) {
  const { datos } = app;
  const p = app.partida;
  let sel = opciones.piloto && p.pilotos.find((x) => x.id === opciones.piloto) ? opciones.piloto : (p.pilotos[0] || {}).id;

  const volver = () => (p.estado === 'preparacion' ? app.ir('preparacion') : app.continuar());
  const lista = h('div', { class: 'lista-pilotos', role: 'tablist', 'aria-label': 'Pilotos' });
  const detalle = h('div', { class: 'detalle-piloto' });
  // En el celular se ve una cosa por vez: el piloto y su mecha, o sus ordenes. En la compu, las dos juntas.
  let pestana = opciones.pestana || 'piloto';
  const pestanas = h('div', { class: 'pestanas', role: 'tablist', 'aria-label': 'Secciones' });
  const pintarPestanas = () => {
    pestanas.innerHTML = '';
    for (const [id, texto] of [['piloto', 'Piloto y mecha'], ['ordenes', 'Órdenes']]) {
      pestanas.append(h('button', {
        class: 'pestana' + (pestana === id ? ' activa' : ''), role: 'tab', 'aria-selected': pestana === id ? 'true' : 'false',
        onclick: () => { pestana = id; pintarPestanas(); detalle.className = 'detalle-piloto ver-' + pestana; }
      }, '[ ' + texto + ' ]'));
    }
  };
  const mover = (paso) => {
    const i = p.pilotos.findIndex((x) => x.id === sel);
    sel = p.pilotos[(i + paso + p.pilotos.length) % p.pilotos.length].id;
    pintarLista(); pintarDetalle();
  };

  const pintarLista = () => {
    lista.innerHTML = '';
    for (const pi of p.pilotos) {
      lista.append(h('button', {
        class: 'tarjeta-piloto' + (pi.id === sel ? ' activa' : ''), role: 'tab', 'aria-selected': pi.id === sel ? 'true' : 'false',
        onclick: () => { sel = pi.id; pintarLista(); pintarDetalle(); }
      }, retrato(datos, pi, 'retrato-tarjeta'),
      h('span', { class: 'tp-apodo' }, pi.apodo),
      h('span', { class: 'tp-clase' }, ico(datos.clases[pi.clase].icono), datos.clases[pi.clase].nombre),
      h('span', { class: 'tp-nivel', title: 'Nivel' }, String(pi.nivel))));
    }
    const activa = lista.querySelector('.activa');
    if (activa && activa.scrollIntoView) activa.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  const pintarDetalle = () => {
    detalle.innerHTML = '';
    detalle.className = 'detalle-piloto ver-' + pestana;
    const pi = p.pilotos.find((x) => x.id === sel);
    if (!pi) return;
    detalle.append(
      h('div', { class: 'columnas-hangar' },
        h('div', { class: 'col-piloto' }, panelPiloto(app, pi), panelMecha(app, pi, () => { pintarLista(); pintarDetalle(); }), panelRelaciones(app, pi), panelHoja(pi)),
        h('div', { class: 'col-ordenes' }, panelGambits(app, pi, () => pintarDetalle()))));
  };

  montar(raiz, 
    barraCampana(datos, p, [
      boton(p.estado === 'preparacion' ? 'A la misión' : 'Al mapa', volver, { iconoNombre: 'atras', clase: 'principal' })
    ]),
    h('h1', { class: 'titulo-pantalla' }, 'Hangar'),
    opciones.primeraVez
      ? h('p', { class: 'aviso-inicial' }, ico('estrella'), ' Este es tu escuadrón. Revisá a cada piloto: su mecha y sus órdenes. Cuando estés, volvé al mapa y elegí un contrato.')
      : null,
    h('div', { class: 'carrusel' },
      botonIcono('atras', 'Piloto anterior', () => mover(-1), 'flecha'),
      lista,
      botonIcono('atras', 'Piloto siguiente', () => mover(1), 'flecha flecha-der')),
    pestanas, detalle);
  pintarPestanas();
  pintarLista();
  pintarDetalle();
}

export function fichaDe(datos, pi) {
  const u = unidadDePiloto(datos, pi, pi.mecha, pi.gambits);
  return { bando: 0, apariencia: u.apariencia, armas: u.armas.map((a) => ({ slot: a.slot, tipoVisual: a.tipoVisual })), cuerpo: 'mecha', marcas: pi.bajas || 0 };
}

function panelPiloto(app, pi) {
  const { datos } = app;
  const p = app.partida;
  const clase = datos.clases[pi.clase];
  const pers = textoPersonalidad(datos, pi);
  const vinculo = pi.vinculo ? p.pilotos.find((x) => x.id === pi.vinculo) : null;
  const R = datos.reglas;
  const xpSig = R.xp_por_nivel[pi.nivel] || null;
  const xpAnt = R.xp_por_nivel[pi.nivel - 1] || 0;
  return panel('Piloto',
    h('div', { class: 'cabecera-piloto' },
      retrato(datos, pi, 'retrato-grande'),
      h('div', { class: 'cabecera-nombre' },
        h('h2', { class: 'apodo' }, '«' + pi.apodo + '»'),
        h('p', { class: 'nombre-real' }, pi.nombre)),
      h('div', { class: 'nivel' }, h('span', {}, 'NIV'), h('strong', {}, String(pi.nivel)))),
    xpSig ? h('div', { class: 'xp', title: pi.xp + ' / ' + xpSig + ' XP' }, barra(pi.xp - xpAnt, xpSig - xpAnt, 'barra-xp'), h('small', {}, pi.xp + ' / ' + xpSig + ' XP')) : h('small', {}, 'Nivel máximo'),
    h('div', { class: 'chips' },
      chip(clase.icono, clase.nombre, clase.descripcion, 'chip-clase'),
      chip(pers.icono || 'evento', pers.texto, pers.titulo, 'chip-personalidad'),
      vinculo ? chip('vinculo', vinculo.apodo, 'Vínculo: pelean mejor cerca y les duele perderse') : chip('vinculo', 'Sin vínculo', 'No tiene a nadie cercano en el escuadrón', 'apagado')),
    (pi.cicatrices.length || pi.traumas.length || pi.medallas.length)
      ? h('div', { class: 'chips' },
        ...pi.cicatrices.map((c) => chip('cicatriz', datos.cicatrices[c].nombre, datos.cicatrices[c].texto || modsTexto(datos.cicatrices[c].mods), 'chip-cicatriz')),
        ...pi.traumas.map((t) => chip('trauma', datos.traumas[t.id].nombre, curaTexto(t), 'chip-trauma')),
        ...pi.medallas.map((m) => chip('medalla', datos.medallas[m].nombre, modsTexto(datos.medallas[m].mods), 'chip-medalla')))
      : h('p', { class: 'ayuda' }, 'Todavía sin historia. Misiones: ' + pi.misiones + ' · Bajas: ' + pi.bajas),
    pi.misiones ? h('p', { class: 'ayuda' }, 'Misiones: ' + pi.misiones + ' · Bajas: ' + pi.bajas) : null);
}

function modsTexto(mods) {
  return Object.entries(mods || {}).map(([k, v]) => k + ' ' + (v > 0 ? '+' : '') + v).join(', ');
}
function curaTexto(t) {
  return t.cura === 'nuevo_vinculo' ? 'Se cura con un vínculo nuevo' : 'Se cura descansando (' + Math.max(0, t.resta) + ' más)';
}

// Habilidades especiales del mecha: de donde salen (clase o parte) y si las puede usar con lo que tiene puesto
const ETIQUETA_HABILIDAD = { supresion: 'fuego_de_supresion', escudo: 'muro_de_escudos' };
function habilidadesDe(datos, pi) {
  const u = unidadDePiloto(datos, pi, pi.mecha, pi.gambits);
  return u.habilidades.map((id) => {
    const hab = datos.habilidades[id];
    let origen = null;
    for (const [slot] of SLOTS) {
      const pz = normalizarPieza(pi.mecha[slot]);
      const pp = pz && datos.partes[pz.parte];
      if (pp && (pp.habilidad === id || (pp.etiquetas || []).some((e) => ETIQUETA_HABILIDAD[e] === id))) { origen = pp.nombre; break; }
    }
    const falta = hab.requiere_parte && !u.etiquetasPartes.includes(hab.requiere_parte) ? hab.requiere_parte : null;
    return { id, hab, origen: origen || 'Clase ' + datos.clases[pi.clase].nombre.toLowerCase(), deParte: !!origen, falta };
  });
}

// Que acciones y condiciones puede cumplir este mecha (las demas se ven con candado en el editor)
function disponibles(datos, pi) {
  const u = unidadDePiloto(datos, pi, pi.mecha, pi.gambits);
  const habs = new Set(habilidadesDe(datos, pi).filter((x) => !x.falta).map((x) => x.id));
  const G = datos.gambits;
  const falta = {};
  for (const [id, a] of Object.entries(G.acciones)) if (a.habilidad && !habs.has(a.habilidad)) falta['a:' + id] = parteQueDa(datos, a.habilidad);
  for (const [id, c] of Object.entries(G.condiciones)) if (c.requiere_parte && !u.etiquetasPartes.includes(c.requiere_parte)) falta['c:' + id] = parteQueDaEtiqueta(datos, c.requiere_parte);
  return falta;
}
function parteQueDa(datos, hab) {
  const p = Object.values(datos.partes).find((x) => x && x.habilidad === hab);
  if (p) return p.nombre;
  const clase = Object.values(datos.clases).find((c) => c && (c.habilidades_iniciales || []).includes(hab));
  if (clase) return 'clase ' + clase.nombre;
  const req = datos.habilidades[hab].requiere_parte;
  return req ? parteQueDaEtiqueta(datos, req) : 'otra clase';
}
function parteQueDaEtiqueta(datos, etq) {
  const p = Object.values(datos.partes).find((x) => x && (x.etiquetas || []).includes(etq));
  return p ? p.nombre : etq;
}

// Estado del mecha y reparaciones (ver campana/mantenimiento.js)
const ZONA_NOMBRE = { brazo_izq: 'Brazo izq.', brazo_der: 'Brazo der.', piernas: 'Piernas', cabeza: 'Cabeza' };
function panelEstado(app, pi, refrescar) {
  const { datos } = app;
  const p = app.partida;
  const vida = vidaDelMecha(pi), rotas = partesRotas(pi), c = costoReparacion(datos, pi);
  // redibuja el hangar entero: tambien cambian los creditos de arriba
  const hacer = (que) => {
    if (!reparar(datos, p, pi.id, que)) return;
    app.guardar();
    const y = window.scrollY;
    app.ir('hangar', { piloto: pi.id, pestana: 'piloto' });
    window.scrollTo(0, y);
  };
  const btn = (texto, que, costo) => boton(texto + ' · ' + costo + ' cr', () => hacer(que),
    { iconoNombre: 'llave', clase: 'secundario', deshabilitado: p.creditos < costo });
  const salida = vidaDeSalida(datos, pi);
  return h('div', { class: 'estado-mecha' + (c.total ? ' danado' : '') },
    h('div', { class: 'fila-rep' }, ico('vida'), h('span', {}, 'Estructura ' + vida + '%'), barra(vida, 100),
      vida < salida ? h('small', {}, 'Sale igual, pegado con cinta: ' + salida + '%') : null),
    rotas.length ? h('div', { class: 'fila-rep rota' }, ico('trauma'), 'Roto: ' + rotas.map((z) => ZONA_NOMBRE[z]).join(', ') + ' — no funciona hasta repararlo o cambiarlo.') : null,
    c.total ? h('div', { class: 'fila-rep' },
      c.estructura ? btn('Estructura', 'estructura', c.estructura) : null,
      ...c.partes.map((x) => btn(ZONA_NOMBRE[x.slot], x.slot, x.costo)),
      (c.estructura ? 1 : 0) + c.partes.length > 1 ? btn('Todo', 'todo', c.total) : null) : h('small', {}, 'Sin daños.'));
}

function panelHabilidades(datos, pi) {
  const lista = habilidadesDe(datos, pi);
  return h('div', { class: 'habilidades' },
    h('h3', { class: 'sub-panel' }, ico('estrella'), ' Habilidades especiales'),
    lista.length ? h('ul', {}, ...lista.map((x) => h('li', { class: (x.deParte ? 'de-parte' : '') + (x.falta ? ' bloqueada' : '') },
      ico(existeIcono(x.hab.icono) ? x.hab.icono : 'estrella'),
      h('div', {},
        h('strong', {}, x.hab.nombre), h('small', {}, x.origen + (x.falta ? ' · le falta: ' + parteQueDaEtiqueta(datos, x.falta) : '')),
        h('span', {}, x.hab.descripcion || ''))))) : h('p', { class: 'ayuda' }, 'Ninguna.'),
    h('p', { class: 'ayuda' }, 'Algunas partes traen habilidades y órdenes nuevas (★). Si las equipás, aparecen en el editor de órdenes.'));
}

function panelMecha(app, pi, refrescar) {
  const { datos } = app;
  const p = app.partida;
  const u = unidadDePiloto(datos, pi, pi.mecha, pi.gambits);
  const { peso, capacidad } = pesoMecha(datos, pi.mecha);
  const lienzo = h('canvas', { width: 160, height: 160, class: 'mecha-grande', 'aria-label': 'Vista del mecha' });
  dibujarMechaFicha(lienzo.getContext('2d'), fichaDe(datos, pi), 160);

  const stats = [
    ['vida', 'Estructura', u.vidaMax], ['escudo', 'Blindaje', u.blindaje], ['rapido', 'Paso', u.velocidad + ' t'],
    ['mira', 'Puntería', u.punteria], ['huida', 'Evasión', u.evasion], ['ojo', 'Visión', u.vision]
  ];
  const filas = SLOTS.map(([slot, nombre]) => {
    const actual = normalizarPieza(pi.mecha[slot]);
    const opciones = [h('option', { value: 'actual', selected: true }, actual && actual.parte !== 'mochila_vacia' ? nombrePieza(datos, actual) : '— vacío —')];
    if (actual && actual.parte !== 'mochila_vacia' && slot !== 'torso' && slot !== 'piernas') opciones.push(h('option', { value: 'sacar' }, '✕ Sacar'));
    p.inventario.forEach((pz, idx) => {
      if (datos.partes[pz.parte].encaje === encajeDeSlot(slot)) opciones.push(h('option', { value: String(idx) }, '↺ ' + nombrePieza(datos, pz) + (datos.partes[pz.parte].habilidad ? ' ★' : '')));
    });
    const elegir = h('select', {
      'aria-label': nombre,
      onchange: (ev) => {
        const v = ev.target.value;
        if (v === 'actual') return;
        equipar(datos, p, pi.id, slot, v === 'sacar' ? null : Number(v));
        app.guardar();
        refrescar();
      }
    }, ...opciones);
    // Se ve una caja con el nombre y los datos de la parte; el select del navegador va encima, invisible,
    // asi en el celular se abre la lista nativa (comoda para el dedo) sin perder el diseno.
    return h('div', { class: 'fila-slot' },
      h('span', { class: 'slot-nombre' }, nombre),
      h('div', { class: 'selector rareza-' + (actual ? datos.partes[actual.parte].rareza : 'comun') },
        h('strong', {}, actual && actual.parte !== 'mochila_vacia' ? nombrePieza(datos, actual) : '— vacío —'),
        h('small', {}, actual && actual.parte !== 'mochila_vacia' ? describirParte(datos, actual) : 'Tocá para elegir'),
        h('span', { class: 'selector-flecha', 'aria-hidden': 'true' }, '▼'),
        elegir));
  });

  // El nombre del mecha: lo pone el piloto y se puede cambiar
  const nombreActual = pi.mechaNombre || nombreDeMecha(datos, pi.nombre);
  const nombreMecha = h('input', {
    class: 'nombre-mecha', type: 'text', maxlength: 18, value: nombreActual, 'aria-label': 'Nombre del mecha',
    onchange: (e) => {
      // sin signos raros ni espacios de mas; vacio vuelve al nombre de siempre
      const limpio = e.target.value.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 18);
      pi.mechaNombre = limpio || nombreDeMecha(datos, pi.nombre);
      e.target.value = pi.mechaNombre;
      app.guardar();
    }
  });
  return panel('Mecha',
    h('label', { class: 'fila-nombre-mecha' }, h('span', {}, '«'), nombreMecha, h('span', {}, '»'),
      (pi.bajas || 0) ? h('span', { class: 'marcas-texto', title: 'Marcas de bajas en el torso' }, '▮'.repeat(Math.min(10, pi.bajas)) + (pi.bajas > 10 ? '+' : '')) : null),
    h('div', { class: 'mecha-cabecera' }, lienzo,
      h('dl', { class: 'stats' }, ...stats.flatMap(([i, n, v]) => [h('dt', {}, ico(i), n), h('dd', {}, String(v))]))),
    h('div', { class: 'peso' + (peso > capacidad ? ' sobrepeso' : '') },
      h('span', {}, ico('peso'), 'Carga ' + peso + ' / ' + capacidad),
      barra(peso, capacidad), peso > capacidad ? h('small', {}, 'Sobrepeso: el mecha camina más lento.') : null),
    panelEstado(app, pi, refrescar),
    ...filas,
    panelHabilidades(datos, pi),
    h('p', { class: 'ayuda' }, ico('estrella'), ' Partes en depósito: ' + p.inventario.length + '. Las ganás en las misiones o las comprás en el taller.'));
}

// ---------- Editor de gambits ----------

function textoCondicion(c) { return c.texto.replace(/\{\w+\}/g, 'N'); }

function panelGambits(app, pi, refrescar) {
  const { datos } = app;
  const G = datos.gambits;
  const guardar = (lista) => { guardarGambits(datos, app.partida, pi.id, lista); app.guardar(); refrescar(); };
  const lista = pi.gambits;
  const falta = disponibles(datos, pi);

  const filas = lista.map((g, i) => {
    const cond = G.condiciones[g.condicion];
    const params = Object.entries((cond && cond.parametros) || {});
    const cambiar = (cambio) => { const nueva = lista.map((x) => ({ ...x })); Object.assign(nueva[i], cambio); guardar(nueva); };
    return h('li', { class: 'gambit' },
      h('span', { class: 'gambit-n' }, String(i + 1)),
      h('div', { class: 'gambit-cuerpo' },
        h('label', { class: 'gambit-parte' }, h('span', { class: 'gambit-si' }, 'SI'),
          h('select', { 'aria-label': 'Condición ' + (i + 1), onchange: (e) => cambiar({ condicion: e.target.value, parametros: undefined }) },
            ...Object.entries(G.condiciones).map(([id, c]) => h('option', { value: id, selected: id === g.condicion, disabled: !!falta['c:' + id] && id !== g.condicion },
              (falta['c:' + id] ? '🔒 ' : c.requiere_parte ? '★ ' : '') + textoCondicion(c) + (falta['c:' + id] ? ' (' + falta['c:' + id] + ')' : '')))),
          ...params.map(([pid, def]) => h('input', {
            type: 'number', min: def.min, max: def.max, step: 1, class: 'gambit-num', 'aria-label': pid,
            value: g.parametros && g.parametros[pid] !== undefined ? g.parametros[pid] : def.defecto,
            onchange: (e) => {
              const v = Math.max(def.min, Math.min(def.max, Math.round(Number(e.target.value) || def.defecto)));
              cambiar({ parametros: { ...(g.parametros || {}), [pid]: v } });
            }
          }))),
        h('label', { class: 'gambit-parte' }, h('span', { class: 'gambit-flecha' }, '→'),
          h('select', { 'aria-label': 'Acción ' + (i + 1), onchange: (e) => cambiar({ accion: e.target.value }) },
            ...Object.entries(G.acciones).map(([id, a]) => h('option', { value: id, selected: id === g.accion, disabled: !!falta['a:' + id] && id !== g.accion },
              (falta['a:' + id] ? '🔒 ' : '') + a.texto + (falta['a:' + id] ? ' (' + falta['a:' + id] + ')' : ''))))),
        h('label', { class: 'gambit-parte' }, h('span', { class: 'gambit-sobre' }, 'a'),
          h('select', { 'aria-label': 'Objetivo ' + (i + 1), onchange: (e) => cambiar({ objetivo: e.target.value }) },
            ...Object.entries(G.objetivos).map(([id, o]) => h('option', { value: id, selected: id === g.objetivo }, o.texto))))),
      falta['a:' + g.accion] || falta['c:' + g.condicion]
        ? h('p', { class: 'gambit-aviso' }, ico('trauma'), ' No la puede cumplir: le falta ' + (falta['a:' + g.accion] || falta['c:' + g.condicion]) + '.') : null,
      h('div', { class: 'gambit-botones' },
        botonIcono('arriba', 'Subir', () => { if (i === 0) return; const n = lista.slice(); [n[i - 1], n[i]] = [n[i], n[i - 1]]; guardar(n); }),
        botonIcono('abajo', 'Bajar', () => { if (i === lista.length - 1) return; const n = lista.slice(); [n[i + 1], n[i]] = [n[i], n[i + 1]]; guardar(n); }),
        botonIcono('cerrar', 'Borrar', () => guardar(lista.filter((_, k) => k !== i)), 'peligro')));
  });

  return panel('Órdenes',
    h('p', { class: 'ayuda' }, 'Se leen de arriba abajo: el mecha hace la primera que se cumpla y pueda hacer. Si ninguna sirve, se cubre. Ojo: la personalidad del piloto puede pasarlas por alto.'),
    h('ol', { class: 'gambits' }, ...filas),
    h('div', { class: 'gambit-acciones' },
      boton('Orden', () => guardar([...lista, { condicion: 'enemigo_a_rango', accion: 'disparar', objetivo: 'enemigo_cercano' }]),
        { iconoNombre: 'mas', deshabilitado: lista.length >= G.maximo_por_unidad }),
      boton('De fábrica', () => guardar(datos.clases[pi.clase].gambits_de_fabrica), { iconoNombre: 'dado', clase: 'secundario' })));
}

// Lo que el piloto vivio: sus momentos, del mas nuevo al mas viejo
// Con quien se lleva bien y con quien no (afinidad)
function panelRelaciones(app, pi) {
  const { amigos, rivales } = relaciones(app.datos, app.partida, pi);
  const fila = (r, icono, clase) => h('li', { class: clase }, ico(icono), h('strong', {}, r.piloto.apodo), ' ' + (r.valor > 0 ? '+' : '') + r.valor);
  return panel('Relaciones',
    amigos.length || rivales.length
      ? h('ul', { class: 'relaciones' }, ...amigos.map((r) => fila(r, 'vinculo', 'amigo')), ...rivales.map((r) => fila(r, 'espadas', 'rival')))
      : h('p', { class: 'ayuda' }, 'Se lleva normal con todos. Lo que vivan juntos lo va a cambiar.'),
    h('p', { class: 'ayuda' }, 'Los amigos cerca apuntan mejor. Los rivales juntos discuten por radio.'));
}

function panelHoja(pi) {
  const hoja = (pi.hoja || []).slice().reverse();
  return panel('Hoja de servicio',
    hoja.length
      ? h('ul', { class: 'hoja-servicio' }, ...hoja.map((t) => h('li', {}, t)))
      : h('p', { class: 'ayuda' }, 'Todavía no hay nada para contar. Ya va a haber.'));
}
