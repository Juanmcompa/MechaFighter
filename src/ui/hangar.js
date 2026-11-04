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
        h('div', { class: 'col-piloto' }, panelPiloto(app, pi), panelMecha(app, pi, () => { pintarLista(); pintarDetalle(); }),
          seccion('Relaciones', panelRelaciones(app, pi), false), seccion('Hoja de servicio', panelHoja(pi), false)),
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

// ---------- Armado del mecha ----------
// Una pantalla: el mecha con sus 6 encajes alrededor, los numeros al lado y abajo las partes del deposito
// para el encaje elegido. Tocar una parte la prueba (se ve que mejora y que empeora); "Equipar" la pone.
const ARMADO = { slot: 'brazo_der', cand: null }; // queda entre redibujos (y entre pilotos)

const STATS = [
  ['estructura', 'vida', 'Estructura', 1], ['blindaje', 'escudo', 'Blindaje', 1], ['dano', 'bala', 'Daño', 1],
  ['alcance', 'mira', 'Alcance', 1], ['punteria', 'mira', 'Puntería', 1], ['evasion', 'huida', 'Evasión', 1],
  ['paso', 'rapido', 'Paso', -1], ['vision', 'ojo', 'Visión', 1]
];

function statsDe(datos, pi, mecha) {
  const u = unidadDePiloto(datos, pi, mecha, pi.gambits);
  const { peso, capacidad } = pesoMecha(datos, mecha);
  return {
    estructura: u.vidaMax, blindaje: u.blindaje, punteria: u.punteria, evasion: u.evasion, vision: u.vision, paso: u.velocidad,
    // daño cada 10 ticks, sumando las armas (asi se comparan una ametralladora y un cañon)
    dano: u.armas.reduce((s, a) => s + Math.round((a.danio * 10) / Math.max(1, a.cadencia)), 0),
    alcance: u.armas.length ? Math.max(...u.armas.map((a) => a.alcance)) : 0,
    peso, capacidad, habilidades: u.habilidades
  };
}

function conPieza(pi, slot, cand, inventario) {
  const m = { ...pi.mecha };
  m[slot] = cand === 'sacar' ? (slot === 'mochila' ? { parte: 'mochila_vacia', afijos: [] } : null) : inventario[cand];
  return m;
}

// Lo que cambia (para las tarjetas): mejoras en verde, empeoras en rojo, las mas grandes primero
function diferencias(a, b) {
  const out = [];
  for (const [k, , nombre, dir] of STATS) {
    const d = b[k] - a[k];
    if (d) out.push({ nombre, d, bien: d * dir > 0, peso: Math.abs(d) / Math.max(1, Math.abs(a[k])) });
  }
  return out.sort((x, y) => y.peso - x.peso);
}

const imgParte = (id) => h('img', { class: 'img-parte', src: 'assets/mecha/azul/' + id + '.png', alt: '', onerror: (e) => { e.target.style.visibility = 'hidden'; } });

function panelMecha(app, pi, refrescar) {
  const { datos } = app;
  const p = app.partida;
  const actual = statsDe(datos, pi, pi.mecha);
  if (!SLOTS.some(([s]) => s === ARMADO.slot)) ARMADO.slot = 'brazo_der';
  const slot = ARMADO.slot;
  // si la candidata ya no esta (se equipo o cambio el piloto), se limpia
  if (ARMADO.cand !== null && ARMADO.cand !== 'sacar' && (!p.inventario[ARMADO.cand] || datos.partes[p.inventario[ARMADO.cand].parte].encaje !== encajeDeSlot(slot))) ARMADO.cand = null;
  const prueba = ARMADO.cand !== null ? statsDe(datos, pi, conPieza(pi, slot, ARMADO.cand, p.inventario)) : null;
  const rotas = partesRotas(pi);

  const lienzo = h('canvas', { width: 150, height: 150, class: 'mecha-grande', 'aria-label': 'Vista del mecha' });
  dibujarMechaFicha(lienzo.getContext('2d'), fichaDe(datos, pi), 150);
  const botonSlot = ([s, nombre]) => {
    const pz = normalizarPieza(pi.mecha[s]);
    const vacio = !pz || pz.parte === 'mochila_vacia';
    return h('button', {
      class: 'slot-boton' + (s === slot ? ' activo' : '') + (rotas.includes(s) ? ' rota' : '') + (vacio ? ' vacio' : '') + (!vacio && datos.partes[pz.parte].habilidad ? ' especial' : ''),
      'aria-pressed': s === slot ? 'true' : 'false',
      onclick: () => { ARMADO.slot = s; ARMADO.cand = null; refrescar(); }
    }, h('small', {}, nombre), h('strong', {}, vacio ? '— vacío —' : datos.partes[pz.parte].nombre + (rotas.includes(s) ? ' ✕' : '')));
  };
  const izq = [SLOTS[0], SLOTS[3], SLOTS[5]], der = [SLOTS[1], SLOTS[4], SLOTS[2]]; // cabeza, brazo izq, mochila | torso, brazo der, piernas

  const filaStat = ([k, icono, nombre, dir]) => {
    const v = actual[k], n = prueba ? prueba[k] : v, d = n - v;
    return h('div', { class: 'stat-fila' + (d ? (d * dir > 0 ? ' mejora' : ' empeora') : '') },
      h('span', { class: 'stat-nombre' }, ico(icono), nombre),
      h('span', { class: 'stat-valor' }, String(v) + (k === 'paso' ? ' t' : ''),
        d ? h('em', {}, ' → ' + n + ' ' + (d * dir > 0 ? '▲' : '▼')) : null));
  };
  const carga = prueba || actual;
  const panelStats = h('div', { class: 'armado-stats' },
    ...STATS.map(filaStat),
    h('div', { class: 'stat-fila carga' + (carga.peso > carga.capacidad ? ' empeora' : '') },
      h('span', { class: 'stat-nombre' }, ico('peso'), 'Carga'),
      h('span', { class: 'stat-valor' }, carga.peso + ' / ' + carga.capacidad)),
    barra(carga.peso, carga.capacidad, carga.peso > carga.capacidad ? 'sobrepeso' : ''),
    carga.peso > carga.capacidad ? h('small', { class: 'aviso-peso' }, 'Sobrepeso: camina más lento.') : null);

  // Tarjetas del encaje elegido: lo puesto, sacarlo, y lo que hay en el deposito
  const puesta = normalizarPieza(pi.mecha[slot]);
  const tarjetas = [];
  const tarjeta = (cand, pz, titulo, extra) => {
    const dif = cand === null ? [] : diferencias(actual, statsDe(datos, pi, conPieza(pi, slot, cand, p.inventario)));
    const pp = pz ? datos.partes[pz.parte] : null;
    return h('button', {
      class: 'tarjeta-parte rareza-' + (pp ? pp.rareza : 'comun') + (ARMADO.cand === cand ? ' elegida' : '') + (cand === null ? ' puesta' : ''),
      onclick: () => { ARMADO.cand = cand === ARMADO.cand ? null : cand; refrescar(); }
    },
    pz ? imgParte(pz.parte) : h('span', { class: 'img-parte' }, ico('cerrar')),
    h('strong', {}, titulo),
    extra ? h('small', { class: 'tp-extra' }, extra) : null,
    pp && pp.habilidad ? h('small', { class: 'tp-hab' }, '★ ' + datos.habilidades[pp.habilidad].nombre) : null,
    cand === null ? h('small', { class: 'tp-puesta' }, 'Puesta') : h('span', { class: 'tp-difs' },
      ...dif.slice(0, 3).map((x) => h('span', { class: x.bien ? 'bien' : 'mal' }, (x.bien ? '▲ ' : '▼ ') + x.nombre + ' ' + (x.d > 0 ? '+' : '') + x.d)),
      dif.length ? null : h('span', {}, 'Igual')));
  };
  if (puesta && puesta.parte !== 'mochila_vacia') tarjetas.push(tarjeta(null, puesta, nombrePieza(datos, puesta), rotas.includes(slot) ? 'ROTA' : null));
  p.inventario.forEach((pz, idx) => { if (datos.partes[pz.parte].encaje === encajeDeSlot(slot)) tarjetas.push(tarjeta(idx, pz, nombrePieza(datos, pz))); });
  if (puesta && puesta.parte !== 'mochila_vacia' && slot !== 'torso' && slot !== 'piernas') tarjetas.push(tarjeta('sacar', null, 'Sacar'));

  // La elegida: que es y el boton para ponerla
  let detalleCand = null;
  if (ARMADO.cand !== null) {
    const pz = ARMADO.cand === 'sacar' ? null : p.inventario[ARMADO.cand];
    const pp = pz ? datos.partes[pz.parte] : null;
    const habNueva = prueba.habilidades.filter((x) => !actual.habilidades.includes(x));
    const habPierde = actual.habilidades.filter((x) => !prueba.habilidades.includes(x));
    detalleCand = h('div', { class: 'armado-detalle' },
      h('strong', {}, pz ? nombrePieza(datos, pz) : 'Dejar el encaje vacío'),
      pz ? h('p', {}, (pp.descripcion ? pp.descripcion + ' ' : '') + describirParte(datos, pz)) : null,
      habNueva.length ? h('p', { class: 'bien' }, '★ Gana: ' + habNueva.map((x) => datos.habilidades[x].nombre).join(', ') + ' (y sus órdenes)') : null,
      habPierde.length ? h('p', { class: 'mal' }, '✕ Pierde: ' + habPierde.map((x) => datos.habilidades[x].nombre).join(', ')) : null,
      h('div', { class: 'acciones' },
        boton('Probar otra', () => { ARMADO.cand = null; refrescar(); }, { clase: 'secundario' }),
        boton(pz ? 'Equipar' : 'Sacar', () => {
          equipar(datos, p, pi.id, slot, ARMADO.cand === 'sacar' ? null : ARMADO.cand);
          ARMADO.cand = null; app.guardar(); refrescar();
        }, { iconoNombre: 'llave', clase: 'principal' })));
  }

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
  const nombreSlot = SLOTS.find(([s]) => s === slot)[1];
  return panel('Mecha',
    h('label', { class: 'fila-nombre-mecha' }, h('span', {}, '«'), nombreMecha, h('span', {}, '»'),
      (pi.bajas || 0) ? h('span', { class: 'marcas-texto', title: 'Marcas de bajas en el torso' }, '▮'.repeat(Math.min(10, pi.bajas)) + (pi.bajas > 10 ? '+' : '')) : null),
    h('div', { class: 'armado' },
      h('div', { class: 'armado-mecha' },
        h('div', { class: 'slots-col' }, ...izq.map(botonSlot)), lienzo, h('div', { class: 'slots-col' }, ...der.map(botonSlot))),
      panelStats),
    h('div', { class: 'armado-encaje' },
      h('h3', { class: 'sub-panel' }, ico('llave'), ' ' + nombreSlot + (tarjetas.length > 1 ? ' · tocá una parte para comparar' : '')),
      tarjetas.length > (puesta && puesta.parte !== 'mochila_vacia' ? 1 : 0)
        ? h('div', { class: 'tarjetas-partes' }, ...tarjetas)
        : h('p', { class: 'ayuda' }, 'No hay partes de este tipo en el depósito. Se ganan en las misiones o se compran en el taller.'),
      detalleCand),
    seccion('Estado y reparación', panelEstado(app, pi, refrescar), costoReparacion(datos, pi).total > 0),
    seccion('Habilidades especiales', panelHabilidades(datos, pi), false));
}

// Seccion que se abre y se cierra (asi el celular no es un scroll infinito)
function seccion(titulo, contenido, abierta) {
  return h('details', { class: 'seccion', ...(abierta ? { open: true } : {}) }, h('summary', {}, titulo), contenido);
}

// ---------- Pasivas: lo que el piloto lleva puesto sin que se lo pidan ----------
const NOMBRE_MOD = { punteria: 'Puntería', evasion: 'Evasión', moral: 'Moral', danio_pct: 'Daño %', recarga: 'Recarga', blindaje: 'Blindaje',
  vision: 'Visión', iniciativa: 'Iniciativa', alcance: 'Alcance', cadencia: 'Cadencia', velocidad: 'Paso', estructura: 'Estructura', municion: 'Cargador' };
function efectos(mods) {
  return Object.entries(mods || {}).map(([k, v]) => (NOMBRE_MOD[k] || k) + ' ' + (v > 0 ? '+' : '') + v).join(' · ');
}

function panelPasivas(app, pi) {
  const { datos } = app;
  const p = app.partida;
  const filas = [];
  const fila = (icono, titulo, texto, clase = '') => filas.push(h('li', { class: clase }, ico(icono), h('div', {}, h('strong', {}, titulo), h('span', {}, texto))));
  const pers = textoPersonalidad(datos, pi);
  fila(pers.icono || 'evento', 'Personalidad: ' + pers.texto, pers.titulo + (pers.texto === '???' ? '' : ' A veces pasa por alto tus órdenes.'), 'personalidad');
  const vinculo = pi.vinculo ? p.pilotos.find((x) => x.id === pi.vinculo) : null;
  if (vinculo) fila('vinculo', 'Vínculo con «' + vinculo.apodo + '»', 'Cerca de su vínculo pelea mejor; si lo pierde, se derrumba.', 'bien');
  for (const c of pi.cicatrices) fila('cicatriz', datos.cicatrices[c].nombre, datos.cicatrices[c].texto || efectos(datos.cicatrices[c].mods), 'mal');
  for (const t of pi.traumas) fila('trauma', datos.traumas[t.id].nombre, (datos.traumas[t.id].texto || 'Le pesa en combate: puede quebrarse.') + ' ' + curaTexto(t) + '.', 'mal');
  for (const m of pi.medallas) fila('medalla', datos.medallas[m].nombre, efectos(datos.medallas[m].mods), 'bien');
  for (const [s, nombre] of SLOTS) {
    const pz = normalizarPieza(pi.mecha[s]);
    for (const a of (pz && pz.afijos) || []) if (datos.afijos[a]) fila('estrella', datos.afijos[a].nombre + ' (' + nombre.toLowerCase() + ')', efectos(datos.afijos[a].mods), 'bien');
  }
  return h('ul', { class: 'pasivas' }, ...filas);
}

// ---------- Editor de ordenes ----------
// Cada orden se lee como una frase. Tocandola se abre: tres pasos (SI / HACER / A QUIEN) con todas las
// opciones a la vista, lo que hace cada una, y lo que no se puede (con la parte que lo habilita).
const ORDEN = { abierta: null, paso: 'condicion' };

function textoCondicion(c, params) {
  return c.texto.replace(/\{(\w+)\}/g, (_, k) => (params && params[k] !== undefined ? params[k] : c.parametros && c.parametros[k] ? c.parametros[k].defecto : 'N'));
}

function panelGambits(app, pi, refrescar) {
  const { datos } = app;
  const G = datos.gambits;
  const guardar = (lista) => { guardarGambits(datos, app.partida, pi.id, lista); app.guardar(); refrescar(); };
  const lista = pi.gambits;
  const falta = disponibles(datos, pi);
  if (ORDEN.abierta !== null && ORDEN.abierta >= lista.length) ORDEN.abierta = null;

  const filas = lista.map((g, i) => {
    const cond = G.condiciones[g.condicion], acc = G.acciones[g.accion], obj = G.objetivos[g.objetivo];
    const bloqueo = falta['a:' + g.accion] || falta['c:' + g.condicion];
    const abierta = ORDEN.abierta === i;
    const cambiar = (cambio) => { const nueva = lista.map((x) => ({ ...x })); Object.assign(nueva[i], cambio); guardar(nueva); };
    const frase = h('button', { class: 'orden-frase', 'aria-expanded': abierta ? 'true' : 'false', onclick: () => { ORDEN.abierta = abierta ? null : i; ORDEN.paso = 'condicion'; refrescar(); } },
      h('span', { class: 'gambit-n' }, String(i + 1)),
      h('span', { class: 'of-texto' },
        h('em', {}, 'SI '), cond ? textoCondicion(cond, g.parametros) : '?',
        h('em', {}, ' → '), acc ? acc.texto : '?',
        g.objetivo !== 'yo' && obj ? h('span', {}, h('em', {}, ' a '), obj.texto.toLowerCase()) : null),
      bloqueo ? h('span', { class: 'of-bloqueo' }, '🔒') : null);
    let editor = null;
    if (abierta) {
      const pasos = [['condicion', 'SI', G.condiciones, 'c'], ['accion', 'HACER', G.acciones, 'a'], ['objetivo', 'A QUIÉN', G.objetivos, 'o']];
      const [campo, , catalogo, letra] = pasos.find((x) => x[0] === ORDEN.paso);
      const opciones = Object.entries(catalogo).sort(([a], [b]) => (falta[letra + ':' + a] ? 1 : 0) - (falta[letra + ':' + b] ? 1 : 0));
      const elegido = catalogo[g[campo]];
      const params = campo === 'condicion' ? Object.entries((cond && cond.parametros) || {}) : [];
      editor = h('div', { class: 'orden-editor' },
        h('div', { class: 'orden-pasos', role: 'tablist' }, ...pasos.map(([c, t]) => h('button', {
          class: 'orden-paso' + (ORDEN.paso === c ? ' activo' : ''), role: 'tab', onclick: () => { ORDEN.paso = c; refrescar(); }
        }, t))),
        h('div', { class: 'orden-opciones' }, ...opciones.map(([id, o]) => {
          const bloq = falta[letra + ':' + id];
          return h('button', {
            class: 'orden-opcion' + (id === g[campo] ? ' elegida' : '') + (bloq ? ' bloqueada' : ''), disabled: !!bloq && id !== g[campo],
            title: o.ayuda || '', onclick: () => cambiar(campo === 'condicion' ? { condicion: id, parametros: undefined } : { [campo]: id })
          }, ico(existeIcono(o.icono) ? o.icono : 'evento'), h('span', {}, campo === 'condicion' ? textoCondicion(o) : o.texto),
          bloq ? h('small', {}, '🔒 ' + bloq) : (o.requiere_parte || o.habilidad) && letra !== 'o' ? h('small', {}, '★') : null);
        })),
        h('p', { class: 'orden-ayuda' }, elegido ? (elegido.ayuda || '') : ''),
        ...params.map(([pid, def]) => {
          const v = g.parametros && g.parametros[pid] !== undefined ? g.parametros[pid] : def.defecto;
          const poner = (n) => cambiar({ parametros: { ...(g.parametros || {}), [pid]: Math.max(def.min, Math.min(def.max, n)) } });
          return h('div', { class: 'orden-param' }, h('span', {}, 'Distancia'),
            botonIcono('menos', 'Menos', () => poner(v - 1)), h('strong', {}, v + ' casillas'), botonIcono('mas', 'Más', () => poner(v + 1)));
        }),
        bloqueo ? h('p', { class: 'gambit-aviso' }, ico('trauma'), ' No la puede cumplir: le falta ' + bloqueo + '.') : null,
        h('div', { class: 'gambit-botones' },
          botonIcono('arriba', 'Subir', () => { if (i === 0) return; const n = lista.slice(); [n[i - 1], n[i]] = [n[i], n[i - 1]]; ORDEN.abierta = i - 1; guardar(n); }),
          botonIcono('abajo', 'Bajar', () => { if (i === lista.length - 1) return; const n = lista.slice(); [n[i + 1], n[i]] = [n[i], n[i + 1]]; ORDEN.abierta = i + 1; guardar(n); }),
          botonIcono('cerrar', 'Borrar', () => { ORDEN.abierta = null; guardar(lista.filter((_, k) => k !== i)); }, 'peligro'),
          boton('Listo', () => { ORDEN.abierta = null; refrescar(); }, { clase: 'secundario' })));
    }
    return h('li', { class: 'orden' + (abierta ? ' abierta' : '') + (bloqueo ? ' con-bloqueo' : '') }, frase, editor);
  });

  return h('div', {},
    panel('Órdenes',
      h('p', { class: 'ayuda' }, 'Se leen de arriba abajo: hace la primera que se cumpla y pueda hacer. Tocá una para cambiarla.'),
      h('ol', { class: 'ordenes' }, ...filas),
      h('div', { class: 'gambit-acciones' },
        boton('Orden', () => { ORDEN.abierta = lista.length; ORDEN.paso = 'condicion'; guardar([...lista, { condicion: 'enemigo_a_rango', accion: 'disparar', objetivo: 'enemigo_cercano' }]); },
          { iconoNombre: 'mas', deshabilitado: lista.length >= G.maximo_por_unidad }),
        boton('De fábrica', () => { ORDEN.abierta = null; guardar(datos.clases[pi.clase].gambits_de_fabrica); }, { iconoNombre: 'dado', clase: 'secundario' }))),
    panel('Pasivas', h('p', { class: 'ayuda' }, 'Lo que lleva encima siempre, sin que se lo ordenes.'), panelPasivas(app, pi)));
}

// Lo que el piloto vivio: sus momentos, del mas nuevo al mas viejo
// Con quien se lleva bien y con quien no (afinidad)
function panelRelaciones(app, pi) {
  const { amigos, rivales } = relaciones(app.datos, app.partida, pi);
  const fila = (r, icono, clase) => h('li', { class: clase }, ico(icono), h('strong', {}, r.piloto.apodo), ' ' + (r.valor > 0 ? '+' : '') + r.valor);
  return h('div', {},
    amigos.length || rivales.length
      ? h('ul', { class: 'relaciones' }, ...amigos.map((r) => fila(r, 'vinculo', 'amigo')), ...rivales.map((r) => fila(r, 'espadas', 'rival')))
      : h('p', { class: 'ayuda' }, 'Se lleva normal con todos. Lo que vivan juntos lo va a cambiar.'),
    h('p', { class: 'ayuda' }, 'Los amigos cerca apuntan mejor. Los rivales juntos discuten por radio.'));
}

function panelHoja(pi) {
  const hoja = (pi.hoja || []).slice().reverse();
  return h('div', {},
    hoja.length
      ? h('ul', { class: 'hoja-servicio' }, ...hoja.map((t) => h('li', {}, t)))
      : h('p', { class: 'ayuda' }, 'Todavía no hay nada para contar. Ya va a haber.'));
}
