// Hangar: el escuadron, el mecha de cada piloto (partes por encaje) y sus ordenes (gambits).
import { h, montar, ico, boton, botonIcono, panel, chip, barra, barraCampana, describirParte, nombrePieza, textoPersonalidad } from './comun.js';
import { unidadDePiloto, pesoMecha, normalizarPieza } from '../motor/unidades.js';
import { dibujarMechaFicha } from '../vista/dibujo.js';
import { equipar, guardarGambits, encajeDeSlot } from '../campana/partida.js';

const SLOTS = [['cabeza', 'Cabeza'], ['torso', 'Torso'], ['piernas', 'Piernas'], ['brazo_izq', 'Brazo izq.'], ['brazo_der', 'Brazo der.'], ['mochila', 'Mochila']];

export function hangar(app, raiz, opciones = {}) {
  const { datos } = app;
  const p = app.partida;
  let sel = opciones.piloto && p.pilotos.find((x) => x.id === opciones.piloto) ? opciones.piloto : (p.pilotos[0] || {}).id;

  const volver = () => (p.estado === 'preparacion' ? app.ir('preparacion') : app.continuar());
  const lista = h('div', { class: 'lista-pilotos', role: 'tablist', 'aria-label': 'Pilotos' });
  const detalle = h('div', { class: 'detalle-piloto' });

  const pintarLista = () => {
    lista.innerHTML = '';
    for (const pi of p.pilotos) {
      const lienzo = h('canvas', { width: 64, height: 64, class: 'mini-mecha', 'aria-hidden': 'true' });
      const ficha = fichaDe(datos, pi);
      dibujarMechaFicha(lienzo.getContext('2d'), ficha, 64);
      lista.append(h('button', {
        class: 'tarjeta-piloto' + (pi.id === sel ? ' activa' : ''), role: 'tab', 'aria-selected': pi.id === sel ? 'true' : 'false',
        onclick: () => { sel = pi.id; pintarLista(); pintarDetalle(); }
      }, lienzo,
      h('span', { class: 'tp-apodo' }, pi.apodo),
      h('span', { class: 'tp-clase' }, ico(datos.clases[pi.clase].icono), datos.clases[pi.clase].nombre),
      h('span', { class: 'tp-nivel', title: 'Nivel' }, String(pi.nivel))));
    }
  };

  const pintarDetalle = () => {
    detalle.innerHTML = '';
    const pi = p.pilotos.find((x) => x.id === sel);
    if (!pi) return;
    detalle.append(
      h('div', { class: 'columnas-hangar' },
        h('div', {}, panelPiloto(app, pi), panelMecha(app, pi, () => { pintarLista(); pintarDetalle(); })),
        panelGambits(app, pi, () => pintarDetalle())));
  };

  montar(raiz, 
    barraCampana(datos, p, [
      boton(p.estado === 'preparacion' ? 'A la misión' : 'Al mapa', volver, { iconoNombre: 'atras', clase: 'principal' })
    ]),
    h('h1', { class: 'titulo-pantalla' }, 'Hangar'),
    opciones.primeraVez
      ? h('p', { class: 'aviso-inicial' }, ico('estrella'), ' Este es tu escuadrón. Revisá a cada piloto: su mecha y sus órdenes. Cuando estés, volvé al mapa y elegí un contrato.')
      : null,
    lista, detalle);
  pintarLista();
  pintarDetalle();
}

export function fichaDe(datos, pi) {
  const u = unidadDePiloto(datos, pi, pi.mecha, pi.gambits);
  return { bando: 0, apariencia: u.apariencia, armas: u.armas.map((a) => ({ slot: a.slot, tipoVisual: a.tipoVisual })), cuerpo: 'mecha' };
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
      h('div', {},
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
      if (datos.partes[pz.parte].encaje === encajeDeSlot(slot)) opciones.push(h('option', { value: String(idx) }, '↺ ' + nombrePieza(datos, pz)));
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
    return h('div', { class: 'fila-slot' },
      h('span', { class: 'slot-nombre' }, nombre),
      elegir,
      h('small', { class: 'slot-datos rareza-' + (actual ? datos.partes[actual.parte].rareza : 'comun') }, actual ? describirParte(datos, actual) : ''));
  });

  return panel('Mecha',
    h('div', { class: 'mecha-cabecera' }, lienzo,
      h('dl', { class: 'stats' }, ...stats.flatMap(([i, n, v]) => [h('dt', {}, ico(i), n), h('dd', {}, String(v))]))),
    h('div', { class: 'peso' + (peso > capacidad ? ' sobrepeso' : '') },
      h('span', {}, ico('peso'), 'Carga ' + peso + ' / ' + capacidad),
      barra(peso, capacidad), peso > capacidad ? h('small', {}, 'Sobrepeso: el mecha camina más lento.') : null),
    ...filas,
    h('p', { class: 'ayuda' }, ico('estrella'), ' Partes en depósito: ' + p.inventario.length + '. Las ganás en las misiones o las comprás en el taller.'));
}

// ---------- Editor de gambits ----------

function textoCondicion(c) { return c.texto.replace(/\{\w+\}/g, 'N'); }

function panelGambits(app, pi, refrescar) {
  const { datos } = app;
  const G = datos.gambits;
  const guardar = (lista) => { guardarGambits(datos, app.partida, pi.id, lista); app.guardar(); refrescar(); };
  const lista = pi.gambits;

  const filas = lista.map((g, i) => {
    const cond = G.condiciones[g.condicion];
    const params = Object.entries((cond && cond.parametros) || {});
    const cambiar = (cambio) => { const nueva = lista.map((x) => ({ ...x })); Object.assign(nueva[i], cambio); guardar(nueva); };
    return h('li', { class: 'gambit' },
      h('span', { class: 'gambit-n' }, String(i + 1)),
      h('div', { class: 'gambit-cuerpo' },
        h('label', { class: 'gambit-parte' }, h('span', { class: 'gambit-si' }, 'SI'),
          h('select', { 'aria-label': 'Condición ' + (i + 1), onchange: (e) => cambiar({ condicion: e.target.value, parametros: undefined }) },
            ...Object.entries(G.condiciones).map(([id, c]) => h('option', { value: id, selected: id === g.condicion }, textoCondicion(c)))),
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
            ...Object.entries(G.acciones).map(([id, a]) => h('option', { value: id, selected: id === g.accion }, a.texto)))),
        h('label', { class: 'gambit-parte' }, h('span', { class: 'gambit-sobre' }, 'a'),
          h('select', { 'aria-label': 'Objetivo ' + (i + 1), onchange: (e) => cambiar({ objetivo: e.target.value }) },
            ...Object.entries(G.objetivos).map(([id, o]) => h('option', { value: id, selected: id === g.objetivo }, o.texto))))),
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
