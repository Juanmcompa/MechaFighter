// Hangar, pensado para el celular: cuatro secciones con una barra fija abajo.
//   Escuadron: una tarjeta por piloto (su mecha, integridad, perfil de ordenes y que hace en la proxima mision).
//   Armado: el mecha caminando con sus 6 lugares alrededor; tocar uno abre la lista de piezas, de la mejor a la peor.
//   Ordenes: perfiles de un toque y cada orden como una fila de iconos (cuando > que > a quien).
//   Info: la ficha del piloto (se llega tocando su nombre).
import { h, montar, ico, boton, botonIcono, panel, chip, barra, describirParte, nombrePieza, textoPersonalidad, retrato, NOMBRE_RAREZA, iconoParte } from './comun.js';
import { unidadDePiloto, pesoMecha, normalizarPieza } from '../motor/unidades.js';
import { dibujarMechaFicha, dibujarMechaVisor } from '../vista/dibujo.js';
import { equipar, guardarGambits, encajeDeSlot, reparar, costoReparacion, vidaDelMecha, partesRotas, vidaDeSalida } from '../campana/partida.js';
import { nombreDeMecha } from '../campana/reclutas.js';
import { relaciones } from '../campana/animo.js';
import { asignarTarea, puedeQuedarse, desplegables } from '../campana/tareas.js';
import { loBuscan } from '../campana/nemesis.js';
import { existeIcono } from './iconos.js';

const SLOTS = [['cabeza', 'Cabeza'], ['torso', 'Torso'], ['piernas', 'Piernas'], ['brazo_izq', 'Brazo izq.'], ['brazo_der', 'Brazo der.'], ['mochila', 'Mochila']];
const NOMBRE_SLOT = Object.fromEntries(SLOTS);

// Lo que se recuerda entre redibujos y entre visitas al hangar
const VISTA = { seccion: 'escuadron', piloto: null, tareaAbierta: null };
const ARMADO = { slot: null, cand: null };
const ORDEN = { abierta: null, paso: 'condicion' };

export function hangar(app, raiz, opciones = {}) {
  const { datos } = app;
  const p = app.partida;
  const ir = { mecha: 'armado', armado: 'armado', ordenes: 'ordenes', info: 'info', piloto: 'info' };
  VISTA.seccion = (opciones.pestana && ir[opciones.pestana]) || 'escuadron';
  if (opciones.piloto) VISTA.piloto = opciones.piloto;
  if (!p.pilotos.some((x) => x.id === VISTA.piloto)) VISTA.piloto = (p.pilotos[0] || {}).id;
  VISTA.tareaAbierta = null;
  ARMADO.slot = null; ARMADO.cand = null; ORDEN.abierta = null;

  const cuerpo = h('div', { class: 'hg' });
  let vivo = true;
  const pintar = () => {
    if (!vivo) return;
    const y = window.scrollY;
    const scrolls = [...cuerpo.querySelectorAll('[data-scroll]')].map((el) => [el.dataset.scroll, el.scrollTop]);
    const pi = p.pilotos.find((x) => x.id === VISTA.piloto);
    const ctx = { app, datos, p, pi, pintar, ir: (seccion, id) => { VISTA.seccion = seccion; if (id) VISTA.piloto = id; ARMADO.slot = null; ARMADO.cand = null; ORDEN.abierta = null; pintar(); window.scrollTo(0, 0); } };
    const s = VISTA.seccion;
    cuerpo.className = 'hg hg-' + s + ((s === 'armado' && ARMADO.slot) || (s === 'ordenes' && ORDEN.abierta !== null) ? ' con-hoja' : '');
    cuerpo.replaceChildren(...[].concat(s === 'armado' && pi ? vistaArmado(ctx) : s === 'ordenes' && pi ? vistaOrdenes(ctx) : s === 'info' && pi ? vistaInfo(ctx) : vistaEscuadron(ctx, opciones),
      barraSecciones(ctx)).flat().filter(Boolean));
    for (const [id, top] of scrolls) { const el = cuerpo.querySelector('[data-scroll="' + id + '"]'); if (el) el.scrollTop = top; }
    window.scrollTo(0, y);
  };
  montar(raiz, cuerpo);
  pintar();
  return () => { vivo = false; ANIM.lienzo = null; };
}

// Lo que pasa al volver a "Mapa" (o a la mision si ya hay una elegida)
const volver = (app) => (app.partida.estado === 'preparacion' ? app.ir('preparacion') : app.continuar());

function barraSecciones({ app, p, ir }) {
  const item = (id, texto, icono, accion) => h('button', {
    class: 'hg-tab' + (VISTA.seccion === id ? ' activa' : ''), 'aria-current': VISTA.seccion === id ? 'page' : null, onclick: accion
  }, ico(icono), h('span', {}, texto));
  return h('nav', { class: 'hg-tabs', 'aria-label': 'Secciones del hangar' },
    item('escuadron', 'Escuadrón', 'escuadron', () => ir('escuadron')),
    item('armado', 'Armado', 'llave', () => ir('armado')),
    item('ordenes', 'Órdenes', 'lista', () => ir('ordenes')),
    item('mapa', p.estado === 'preparacion' ? 'Misión' : 'Mapa', 'mapa', () => volver(app)));
}

// Cabecera de armado y ordenes: volver, titulo y cambiar de piloto sin salir
function cabeceraPiloto({ datos, p, pi, ir }, titulo, sub) {
  const i = p.pilotos.indexOf(pi);
  const otro = (d) => { const n = p.pilotos[(i + d + p.pilotos.length) % p.pilotos.length]; VISTA.piloto = n.id; ARMADO.cand = null; ORDEN.abierta = null; ir(VISTA.seccion); };
  return h('header', { class: 'hg-cabeza' },
    botonIcono('atras', 'Volver al escuadrón', () => ir('escuadron'), 'hg-volver'),
    h('div', { class: 'hg-titulo' }, h('h1', {}, titulo), h('span', {}, sub || (pi.apodo + ' · ' + datos.clases[pi.clase].nombre + ' · Nv ' + pi.nivel))),
    p.pilotos.length > 1 ? h('div', { class: 'hg-otro' },
      h('button', { class: 'hg-flecha', 'aria-label': 'Piloto anterior', onclick: () => otro(-1) }, '‹'),
      h('button', { class: 'hg-flecha', 'aria-label': 'Piloto siguiente', onclick: () => otro(1) }, '›')) : null);
}

// ---------- Escuadron ----------
function vistaEscuadron({ app, datos, p, pintar, ir }, opciones) {
  const T = datos.reglas.tareas;
  const s = p.sectores && p.sectores[p.sector];
  const salen = desplegables(datos, p).length;
  const enMision = p.estado === 'preparacion' && p.nodo && p.nodo.mision;

  const tarjeta = (pi) => {
    const tarea = pi.tarea ? T[pi.tarea] : null;
    const vida = vidaDelMecha(pi), rotas = partesRotas(pi), c = costoReparacion(datos, pi);
    const abierta = VISTA.tareaAbierta === pi.id;
    const lienzo = h('canvas', { width: 152, height: 152, class: 'hc-lienzo', 'aria-hidden': 'true' });
    dibujarMechaFicha(lienzo.getContext('2d'), fichaDe(datos, pi), 152);
    const perfil = perfilDe(datos, pi);
    const llenos = Math.max(vida > 0 ? 1 : 0, Math.ceil(vida / 20));
    const colorVida = vida >= 60 ? 'bien' : vida >= 30 ? 'medio' : 'mal';
    const reparo = c.total ? h('button', {
      class: 'hc-reparar', disabled: p.creditos < c.total, title: p.creditos < c.total ? 'No alcanzan los créditos' : 'Reparar todo el mecha',
      onclick: () => { if (reparar(datos, p, pi.id, 'todo')) { app.guardar(); pintar(); } }
    }, ico('llave'), 'Reparar ₵' + c.total) : null;
    const iconoTarea = tarea ? tarea.icono : 'play';
    const carta = h('article', { class: 'hc' + (tarea ? ' fuera' : '') + (abierta ? ' abierta' : '') },
      h('button', { class: 'hc-mecha', 'aria-label': 'Armado de ' + pi.apodo, onclick: () => ir('armado', pi.id) }, lienzo),
      h('div', { class: 'hc-datos' },
        h('button', { class: 'hc-nombre', 'aria-label': 'Ficha de ' + pi.apodo, onclick: () => ir('info', pi.id) },
          h('strong', {}, pi.apodo), h('small', {}, datos.clases[pi.clase].nombre + ' · Nv ' + pi.nivel)),
        h('div', { class: 'hc-integridad ' + colorVida, role: 'meter', 'aria-label': 'Integridad ' + vida + '%', 'aria-valuenow': vida, 'aria-valuemax': 100, title: 'Integridad ' + vida + '%' + (rotas.length ? ' · roto: ' + rotas.map((z) => NOMBRE_SLOT[z].toLowerCase()).join(', ') : '') },
          ...[0, 1, 2, 3, 4].map((k) => h('i', { class: k < llenos ? 'lleno' : '' }))),
        h('div', { class: 'hc-fila' },
          tarea ? h('span', { class: 'hc-estado fuera' }, ico(tarea.icono), tarea.nombre.toUpperCase())
            : reparo || h('span', { class: 'hc-estado' }, rotas.length ? 'ROTO' : 'LISTO'),
          h('span', { class: 'hc-perfil' + (perfil.id === 'propio' ? ' propio' : ''), role: 'img', 'aria-label': 'Órdenes: ' + perfil.nombre, title: 'Órdenes: ' + perfil.nombre }, ico(perfil.icono)),
          h('button', { class: 'hc-ir', 'aria-label': 'Armado de ' + pi.apodo, title: 'Armado', onclick: () => ir('armado', pi.id) }, ico('llave')),
          h('button', { class: 'hc-ir', 'aria-label': 'Órdenes de ' + pi.apodo, title: 'Órdenes', onclick: () => ir('ordenes', pi.id) }, ico('lista')))),
      h('button', {
        class: 'hc-tarea' + (tarea ? ' fuera' : '') + (abierta ? ' activa' : ''), 'aria-expanded': abierta ? 'true' : 'false',
        'aria-label': 'Próxima misión: ' + (tarea ? tarea.nombre.toLowerCase() : 'sale') + '. Tocar para cambiar',
        onclick: () => { VISTA.tareaAbierta = abierta ? null : pi.id; pintar(); }
      }, ico(iconoTarea)));
    if (!abierta) return carta;
    // Que hace en la proxima mision: salir o quedarse haciendo otra cosa
    const opciones = [[null, 'Salir', 'play', 'Va a la misión con su mecha y sus órdenes.' + (vida < 100 ? ' Sale al ' + vidaDeSalida(datos, pi) + '%.' : '')],
      ...Object.entries(T).filter(([id]) => id[0] !== '_').map(([id, t]) => [id, t.nombre, t.icono, t.descripcion + ' No sale a pelear.'])];
    const actual = opciones.find(([id]) => id === (pi.tarea || null));
    const puede = puedeQuedarse(p, pi);
    return [carta, h('div', { class: 'hc-tareas', role: 'group', 'aria-label': 'Qué hace ' + pi.apodo + ' en la próxima misión' },
      h('div', { class: 'hc-opciones' }, ...opciones.map(([id, nombre, icono]) => {
        const activa = (pi.tarea || null) === id;
        const bloqueada = id && !puede && !activa;
        return h('button', {
          class: 'hc-opcion' + (activa ? ' activa' : '') + (id ? '' : ' salir'), disabled: bloqueada, 'aria-pressed': activa ? 'true' : 'false',
          'aria-label': nombre + (bloqueada ? ' (alguien tiene que salir)' : ''), title: bloqueada ? 'Alguien tiene que salir a la misión' : nombre,
          onclick: () => { if (!activa && asignarTarea(datos, p, pi.id, id)) { app.guardar(); pintar(); } }
        }, ico(icono));
      })),
      h('p', { class: 'hc-ayuda', 'aria-live': 'polite' }, h('strong', {}, actual[1]), ' · ' + actual[3]))];
  };

  const proxima = enMision
    ? h('button', { class: 'hg-proxima', onclick: () => app.ir('preparacion') }, ico('mision'),
      h('span', {}, h('small', {}, 'PRÓXIMA MISIÓN'), h('strong', {}, p.nodo.mision.nombre)), h('em', {}, 'Ver ›'))
    : h('button', { class: 'hg-proxima', onclick: () => volver(app) }, ico('mapa'),
      h('span', {}, h('small', {}, 'PRÓXIMO DESTINO'), h('strong', {}, 'Elegilo en el mapa')), h('em', {}, 'Mapa ›'));

  return [
    h('header', { class: 'hg-cabeza' },
      h('div', { class: 'hg-titulo' }, h('h1', {}, 'Escuadrón'),
        h('button', { class: 'hg-compania', onclick: () => app.ir('compania'), 'aria-label': 'La compañía: renombre, nave, bandos y némesis' }, (p.nombreEscuadron || 'La compañía') + ' ›')),
      h('span', { class: 'hg-creditos', title: 'Créditos' }, '₵ ' + p.creditos.toLocaleString('es-AR'))),
    p.remolque && p.estado !== 'sectores' ? h('p', { class: 'aviso-remolque' }, ico('combustible'), ' Sin combustible: el remolque cobró ' + p.remolque.creditos +
      ' créditos y los mechas perdieron ' + p.remolque.danio + '% de estructura.') : null,
    opciones.primeraVez ? h('p', { class: 'aviso-inicial' }, ico('estrella'),
      ' Este es tu escuadrón. Tocá un mecha para armarlo, el ícono de lista para sus órdenes y el botón de la derecha para decidir quién sale.') : null,
    proxima,
    h('div', { class: 'hg-cartas' }, ...p.pilotos.flatMap((pi) => tarjeta(pi))),
    h('div', { class: 'hg-desplegar' }, enMision
      ? boton('Desplegar · ' + salen + (salen === 1 ? ' mecha' : ' mechas'), () => app.ir('despliegue'), { iconoNombre: 'play', clase: 'principal' })
      : boton('Volver al mapa', () => volver(app), { iconoNombre: 'mapa', clase: 'principal' }))
  ];
}

export function fichaDe(datos, pi, mecha) {
  const u = unidadDePiloto(datos, pi, mecha || pi.mecha, pi.gambits);
  return { bando: 0, apariencia: u.apariencia, armas: u.armas.map((a) => ({ slot: a.slot, tipoVisual: a.tipoVisual })), cuerpo: 'mecha', marcas: pi.bajas || 0 };
}

// ---------- Armado ----------
// El mecha camina en el centro con la pieza a prueba puesta (un solo bucle de animacion para todo el hangar)
const ANIM = { lienzo: null, ficha: null, corriendo: false };
function animarMecha(lienzo, ficha) {
  ANIM.lienzo = lienzo; ANIM.ficha = ficha;
  if (ANIM.corriendo) return;
  ANIM.corriendo = true;
  const t0 = performance.now();
  const cuadro = (t) => {
    const L = ANIM.lienzo;
    if (!L || !L.isConnected) { ANIM.corriendo = false; return; }
    const ctx = L.getContext('2d');
    const lado = L.width / 2;
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.clearRect(0, 0, lado, lado);
    ctx.imageSmoothingEnabled = false;
    dibujarMechaVisor(ctx, ANIM.ficha, lado, { ang: -Math.PI / 2, paso: ((t - t0) / 900) % 1, anda: true, zoom: 0.95 });
    requestAnimationFrame(cuadro);
  };
  requestAnimationFrame(cuadro);
}

function statsDe(datos, pi, mecha) {
  const u = unidadDePiloto(datos, pi, mecha, pi.gambits);
  const { peso, capacidad } = pesoMecha(datos, mecha);
  return {
    estructura: u.vidaMax, blindaje: u.blindaje, punteria: u.punteria, evasion: u.evasion, vision: u.vision, paso: u.velocidad,
    // dano cada 10 ticks, sumando las armas (asi se comparan una ametralladora y un canon)
    dano: u.armas.reduce((s, a) => s + Math.round((a.danio * 10) / Math.max(1, a.cadencia)), 0),
    alcance: u.armas.length ? Math.max(...u.armas.map((a) => a.alcance)) : 0,
    peso, capacidad, habilidades: u.habilidades
  };
}

// Todo lo que se compara entre piezas (dir -1: menos es mejor)
const STATS = [
  ['estructura', 'Estructura', 1], ['blindaje', 'Blindaje', 1], ['dano', 'Daño', 1], ['alcance', 'Alcance', 1],
  ['punteria', 'Puntería', 1], ['evasion', 'Evasión', 1], ['paso', 'Paso', -1], ['vision', 'Visión', 1]
];

// Topes de cada numero (lo maximo que se ve cambiando una pieza): para que las barras no salten de escala
const TOPES = new WeakMap();
function topesDe(datos, pi) {
  if (TOPES.has(datos)) return TOPES.get(datos);
  const t = { pasoMin: Infinity, pasoMax: 0 };
  for (const [k] of STATS) t[k] = 1;
  for (const [id, parte] of Object.entries(datos.partes)) {
    if (!parte || id[0] === '_' || !parte.encaje) continue;
    for (const [slot] of SLOTS) {
      if (encajeDeSlot(slot) !== parte.encaje) continue;
      const s = statsDe(datos, pi, { ...pi.mecha, [slot]: { parte: id, afijos: [] } });
      for (const [k] of STATS) t[k] = Math.max(t[k], s[k]);
      t.pasoMin = Math.min(t.pasoMin, s.paso); t.pasoMax = Math.max(t.pasoMax, s.paso);
      if (parte.encaje !== 'brazo') break;
    }
  }
  t.pasoMax = Math.max(t.pasoMax + 2, t.pasoMin + 1);
  TOPES.set(datos, t);
  return t;
}
// 0..1 de cada numero (paso al reves: menos ticks por casilla = mas rapido)
function normal(t, k, v) {
  if (k === 'paso') return Math.max(0, Math.min(1, (t.pasoMax - v) / (t.pasoMax - t.pasoMin)));
  return Math.max(0, Math.min(1, v / t[k]));
}

// Que tan bueno es un mecha para su clase (ordena la lista y lo usa "Armar solo")
function puntaje(datos, pi, s) {
  const t = topesDe(datos, pi);
  const pr = datos.clases[pi.clase].prioridades_armado || {};
  let v = 0;
  for (const [k] of STATS) v += (1 + (pr[k] || 0)) * normal(t, k, s[k]);
  if (s.peso > s.capacidad) v -= (2 * (s.peso - s.capacidad)) / Math.max(1, s.capacidad);
  return v + 0.3 * s.habilidades.length;
}

function conPieza(pi, slot, cand, inventario) {
  const m = { ...pi.mecha };
  m[slot] = cand === 'sacar' ? (slot === 'mochila' ? { parte: 'mochila_vacia', afijos: [] } : null) : cand === null ? m[slot] : inventario[cand];
  return m;
}

function diferencias(a, b) {
  const out = [];
  for (const [k, nombre, dir] of STATS) {
    const d = b[k] - a[k];
    if (d) out.push({ nombre, d, bien: d * dir > 0, peso: Math.abs(d) / Math.max(1, Math.abs(a[k])) });
  }
  if (b.peso !== a.peso) out.push({ nombre: 'Peso', d: b.peso - a.peso, bien: b.peso < a.peso, peso: 0 });
  return out.sort((x, y) => y.peso - x.peso);
}

// Pone en cada lugar la mejor pieza del deposito para la clase (dos vueltas: el torso cambia la carga)
function armarSolo(datos, p, pi) {
  let cambios = 0;
  for (let vuelta = 0; vuelta < 2; vuelta++) {
    for (const slot of ['torso', 'piernas', 'brazo_der', 'brazo_izq', 'cabeza', 'mochila']) {
      let mejor = null, mejorV = puntaje(datos, pi, statsDe(datos, pi, pi.mecha)) + 0.001;
      p.inventario.forEach((pz, idx) => {
        if (datos.partes[pz.parte].encaje !== encajeDeSlot(slot)) return;
        const v = puntaje(datos, pi, statsDe(datos, pi, conPieza(pi, slot, idx, p.inventario)));
        if (v > mejorV) { mejor = idx; mejorV = v; }
      });
      if (mejor !== null && equipar(datos, p, pi.id, slot, mejor)) cambios++;
    }
  }
  return cambios;
}

function vistaArmado(ctx) {
  const { app, datos, p, pi, pintar } = ctx;
  const slot = ARMADO.slot;
  if (slot && ARMADO.cand !== null && ARMADO.cand !== 'sacar' && (!p.inventario[ARMADO.cand] || datos.partes[p.inventario[ARMADO.cand].parte].encaje !== encajeDeSlot(slot))) ARMADO.cand = null;
  const actual = statsDe(datos, pi, pi.mecha);
  const mechaPrueba = slot && ARMADO.cand !== null ? conPieza(pi, slot, ARMADO.cand, p.inventario) : null;
  const prueba = mechaPrueba ? statsDe(datos, pi, mechaPrueba) : null;
  const rotas = partesRotas(pi);
  const t = topesDe(datos, pi);

  // El mecha y sus 6 lugares alrededor
  const lienzo = h('canvas', { width: 400, height: 400, class: 'ar-mecha', role: 'img', 'aria-label': 'El mecha de ' + pi.apodo + (prueba ? ', con una pieza a prueba' : '') });
  animarMecha(lienzo, fichaDe(datos, pi, mechaPrueba));
  const lugar = ([s, nombre]) => {
    const pz = normalizarPieza(pi.mecha[s]);
    const vacio = !pz || pz.parte === 'mochila_vacia';
    const parte = vacio ? null : datos.partes[pz.parte];
    const corto = parte ? (parte.nombre_corto || parte.nombre.split(' ')[0]) : 'Vacía';
    return h('button', {
      class: 'ar-lugar ar-' + s + (s === slot ? ' activo' : '') + (vacio ? ' vacio' : ' rareza-' + parte.rareza) + (rotas.includes(s) ? ' rota' : ''),
      'aria-label': nombre + ': ' + (parte ? parte.nombre : 'vacío') + (rotas.includes(s) ? ' (rota)' : ''), 'aria-expanded': s === slot ? 'true' : 'false',
      onclick: () => { ARMADO.slot = s === slot ? null : s; ARMADO.cand = null; pintar(); }
    }, vacio ? h('span', { class: 'ar-mas', 'aria-hidden': 'true' }, '+') : iconoParte(datos, pz.parte, 'ar-icono'), h('span', { class: 'ar-nombre' }, corto));
  };

  // Cinco barras que importan, con la sombra del cambio a prueba
  const fila = (nombre, k, valorTxt) => {
    const a = normal(t, k, actual[k]), b = prueba ? normal(t, k, prueba[k]) : a;
    const d = prueba ? prueba[k] - actual[k] : 0;
    const mejora = k === 'paso' ? d < 0 : d > 0;
    return h('div', { class: 'ar-barra' + (d ? (mejora ? ' mejora' : ' empeora') : '') },
      h('span', {}, nombre),
      h('div', { class: 'ar-pista' },
        h('i', { class: 'ar-base', style: 'width:' + Math.round(Math.min(a, b) * 100) + '%' }),
        d ? h('i', { class: 'ar-cambio', style: 'left:' + Math.round(Math.min(a, b) * 100) + '%;width:' + Math.round(Math.abs(b - a) * 100) + '%' }) : null),
      h('strong', {}, valorTxt(actual[k]), d ? h('em', {}, ' ' + (d > 0 ? '+' : '−') + Math.abs(k === 'paso' ? Math.round(b * 100) - Math.round(a * 100) : d)) : null));
  };
  const carga = prueba || actual;
  const sobra = carga.capacidad - carga.peso;
  const mochila = normalizarPieza(pi.mecha.mochila);
  const avisos = [];
  if (carga.peso > carga.capacidad) avisos.push(h('p', { class: 'ar-aviso mal' }, ico('peso'), ' Sobrepeso: camina más lento.'));
  else if ((!mochila || mochila.parte === 'mochila_vacia') && !prueba) avisos.push(h('p', { class: 'ar-aviso' }, ico('trauma'), ' Mochila vacía: te sobran ' + sobra + ' de carga.'));
  if (rotas.length) avisos.push(h('p', { class: 'ar-aviso mal' }, ico('llave'), ' Roto: ' + rotas.map((z) => NOMBRE_SLOT[z].toLowerCase()).join(', ') + '. No anda hasta repararlo o cambiarlo.'));

  const barras = h('section', { class: 'ar-barras', 'aria-label': 'Resumen del mecha' },
    fila('Blindaje', 'blindaje', String),
    fila('Daño', 'dano', String),
    fila('Alcance', 'alcance', String),
    fila('Velocidad', 'paso', (v) => String(Math.round(normal(t, 'paso', v) * 100))),
    h('div', { class: 'ar-barra carga' + (carga.peso > carga.capacidad ? ' empeora' : '') },
      h('span', {}, 'Carga'),
      h('div', { class: 'ar-pista' }, h('i', { class: 'ar-base', style: 'width:' + Math.min(100, Math.round((carga.peso * 100) / Math.max(1, carga.capacidad))) + '%' })),
      h('strong', {}, carga.peso + '/' + carga.capacidad)),
    ...avisos);

  // El nombre del mecha: lo pone el piloto y se puede cambiar
  const nombreMecha = h('input', {
    class: 'nombre-mecha', type: 'text', maxlength: 18, value: pi.mechaNombre || nombreDeMecha(datos, pi.nombre), 'aria-label': 'Nombre del mecha',
    onchange: (e) => {
      const limpio = e.target.value.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 18);
      pi.mechaNombre = limpio || nombreDeMecha(datos, pi.nombre);
      e.target.value = pi.mechaNombre;
      app.guardar();
    }
  });

  const pie = slot ? hojaPiezas(ctx, actual, prueba) : pieEdicion(ctx,
    botonIcono('dado', 'Armar solo: poner lo mejor del depósito para su clase', () => { if (armarSolo(datos, p, pi)) { app.guardar(); } pintar(); }, 'pe-solo'));

  return [
    cabeceraPiloto(ctx, 'Armado'),
    h('section', { class: 'ar-escena' }, lienzo, ...SLOTS.map(lugar)),
    barras,
    h('label', { class: 'fila-nombre-mecha' }, h('span', {}, '«'), nombreMecha, h('span', {}, '»'),
      (pi.bajas || 0) ? h('span', { class: 'marcas-texto', title: 'Marcas de bajas en el torso' }, '▮'.repeat(Math.min(10, pi.bajas)) + (pi.bajas > 10 ? '+' : '')) : null),
    seccion('Habilidades especiales', panelHabilidades(datos, pi), false),
    pie
  ];
}

// La hoja de abajo: las piezas para el lugar elegido, de la mejor a la peor para su clase
function hojaPiezas({ app, datos, p, pi, pintar }, actual, prueba) {
  const slot = ARMADO.slot;
  const puesta = normalizarPieza(pi.mecha[slot]);
  const hayPuesta = puesta && puesta.parte !== 'mochila_vacia';
  const filas = [];
  if (hayPuesta) filas.push({ cand: null, pz: puesta, v: puntaje(datos, pi, actual) });
  p.inventario.forEach((pz, idx) => {
    if (datos.partes[pz.parte].encaje !== encajeDeSlot(slot)) return;
    const s = statsDe(datos, pi, conPieza(pi, slot, idx, p.inventario));
    filas.push({ cand: idx, pz, s, v: puntaje(datos, pi, s) });
  });
  filas.sort((a, b) => b.v - a.v);
  if (hayPuesta && slot !== 'torso' && slot !== 'piernas') filas.push({ cand: 'sacar', pz: null, s: statsDe(datos, pi, conPieza(pi, slot, 'sacar', p.inventario)) });

  const fila = ({ cand, pz, s }) => {
    const pp = pz ? datos.partes[pz.parte] : null;
    const elegida = ARMADO.cand === cand && cand !== null;
    const dif = cand === null ? [] : diferencias(actual, s);
    return h('button', {
      class: 'pz' + (elegida ? ' elegida' : '') + (cand === null ? ' puesta' : ''), 'aria-pressed': elegida ? 'true' : 'false',
      onclick: () => { if (cand === null) return; ARMADO.cand = elegida ? null : cand; pintar(); }
    },
    pz ? iconoParte(datos, pz.parte, 'pz-icono rareza-' + pp.rareza) : h('span', { class: 'pz-icono vacio' }, ico('cerrar')),
    h('span', { class: 'pz-textos' },
      h('strong', {}, pz ? nombrePieza(datos, pz) : 'Dejar vacío'),
      h('small', { class: pp ? 'rareza-' + pp.rareza : '' }, (pp ? NOMBRE_RAREZA[pp.rareza] : '') + (cand === null ? ' · puesta' : elegida ? ' · probando' : '') +
        (pp && pp.habilidad && datos.habilidades[pp.habilidad] ? ' · ★ ' + datos.habilidades[pp.habilidad].nombre : ''))),
    h('span', { class: 'pz-difs' }, ...(cand === null ? [] : dif.length ? dif.slice(0, 3).map((x) => h('span', { class: x.bien ? 'bien' : 'mal' }, x.nombre + ' ' + (x.d > 0 ? '+' : '−') + Math.abs(x.d))) : [h('span', {}, 'igual')])));
  };

  const cand = ARMADO.cand;
  const pzCand = cand !== null && cand !== 'sacar' ? p.inventario[cand] : null;
  let detalle = null;
  if (prueba) {
    const gana = prueba.habilidades.filter((x) => !actual.habilidades.includes(x));
    const pierde = actual.habilidades.filter((x) => !prueba.habilidades.includes(x));
    detalle = h('p', { class: 'pz-detalle' }, pzCand ? describirParte(datos, pzCand) : 'Queda el lugar vacío.',
      gana.length ? h('span', { class: 'bien' }, ' ★ Gana: ' + gana.map((x) => datos.habilidades[x].nombre).join(', ') + ' (y sus órdenes).') : null,
      pierde.length ? h('span', { class: 'mal' }, ' ✕ Pierde: ' + pierde.map((x) => datos.habilidades[x].nombre).join(', ') + '.') : null);
  }
  const cantidad = filas.filter((f) => f.cand !== null && f.cand !== 'sacar').length;
  return h('section', { class: 'hg-hoja', 'aria-label': 'Piezas para ' + NOMBRE_SLOT[slot] },
    h('div', { class: 'hoja-cabeza' },
      h('strong', {}, NOMBRE_SLOT[slot] + ' · ' + (cantidad ? cantidad + (cantidad === 1 ? ' pieza' : ' piezas') : 'sin piezas')),
      h('small', {}, 'Mejor para ' + datos.clases[pi.clase].nombre),
      botonIcono('cerrar', 'Cerrar', () => { ARMADO.slot = null; ARMADO.cand = null; pintar(); }, 'hoja-cerrar')),
    h('div', { class: 'hoja-lista', 'data-scroll': 'piezas-' + slot },
      ...filas.map(fila),
      cantidad ? null : h('p', { class: 'ayuda' }, 'No hay piezas de este tipo en el depósito. Se ganan en las misiones o se compran en las paradas técnicas.')),
    detalle,
    h('div', { class: 'hoja-botones' },
      boton('Armar solo', () => { ARMADO.cand = null; if (armarSolo(datos, p, pi)) app.guardar(); pintar(); }, { iconoNombre: 'dado', clase: 'secundario' }),
      boton(cand === null ? 'Elegí una pieza' : pzCand ? 'Equipar ' + (datos.partes[pzCand.parte].nombre_corto || datos.partes[pzCand.parte].nombre) : 'Sacar', () => {
        if (cand === null) return;
        equipar(datos, p, pi.id, slot, cand === 'sacar' ? null : cand);
        ARMADO.cand = null; app.guardar(); pintar();
      }, { iconoNombre: 'llave', clase: 'principal', deshabilitado: cand === null })));
}

// Seccion que se abre y se cierra (asi el celular no es un scroll infinito)
const ABIERTAS = {};
function seccion(titulo, contenido, abierta) {
  const open = ABIERTAS[titulo] !== undefined ? ABIERTAS[titulo] : abierta;
  return h('details', { class: 'seccion', ...(open ? { open: true } : {}), ontoggle: (e) => { ABIERTAS[titulo] = e.target.open; } },
    h('summary', {}, titulo), contenido);
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

function panelHabilidades(datos, pi) {
  const lista = habilidadesDe(datos, pi);
  return h('div', { class: 'habilidades' },
    lista.length ? h('ul', {}, ...lista.map((x) => h('li', { class: (x.deParte ? 'de-parte' : '') + (x.falta ? ' bloqueada' : '') },
      ico(existeIcono(x.hab.icono) ? x.hab.icono : 'estrella'),
      h('div', {},
        h('strong', {}, x.hab.nombre), h('small', {}, x.origen + (x.falta ? ' · le falta: ' + parteQueDaEtiqueta(datos, x.falta) : '')),
        h('span', {}, x.hab.descripcion || ''))))) : h('p', { class: 'ayuda' }, 'Ninguna.'),
    h('p', { class: 'ayuda' }, 'Algunas partes traen habilidades y órdenes nuevas (★). Si las equipás, aparecen en las órdenes.'));
}

// ---------- Ordenes ----------
// Que acciones y condiciones puede cumplir este mecha (las demas se ven con candado)
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

// Cuantas ordenes puede tener segun su nivel (gambits.json > lugares_por_nivel). Las que ya tenia no se pierden.
export function lugaresDe(datos, pi) {
  const G = datos.gambits;
  let n = 0;
  for (const [nv, l] of Object.entries(G.lugares_por_nivel || {})) if (nv[0] !== '_' && pi.nivel >= Number(nv)) n = Math.max(n, l);
  return Math.min(G.maximo_por_unidad || 8, n || G.maximo_por_unidad || 8);
}
function proximoLugar(datos, pi) {
  const G = datos.gambits;
  const lugares = lugaresDe(datos, pi);
  const sig = Object.entries(G.lugares_por_nivel || {}).filter(([nv, l]) => nv[0] !== '_' && l > lugares).sort((a, b) => a[1] - b[1]);
  return sig.map(([nv, l]) => ({ lugar: l, nivel: Number(nv) }));
}

const igualOrden = (a, b) => a.condicion === b.condicion && a.accion === b.accion && a.objetivo === b.objetivo &&
  JSON.stringify(a.parametros || {}) === JSON.stringify(b.parametros || {});
function listaDePerfil(datos, pi, id) {
  const lista = id === 'fabrica' ? datos.clases[pi.clase].gambits_de_fabrica : datos.gambits.perfiles[id].ordenes;
  return lista.slice(0, Math.max(1, lugaresDe(datos, pi)));
}
// Que perfil son sus ordenes ahora (o "propias" si las armo a mano)
function perfilDe(datos, pi) {
  const lista = pi.gambits && pi.gambits.length ? pi.gambits : datos.clases[pi.clase].gambits_de_fabrica;
  const P = datos.gambits.perfiles || {};
  for (const id of ['fabrica', ...Object.keys(P).filter((k) => k[0] !== '_')]) {
    const pf = listaDePerfil(datos, pi, id);
    if (pf.length === lista.length && pf.every((g, i) => igualOrden(g, lista[i])))
      return id === 'fabrica' ? { id, nombre: 'De fábrica', icono: 'dado', descripcion: 'Las órdenes con las que viene un ' + datos.clases[pi.clase].nombre.toLowerCase() + '.' } : { id, ...P[id] };
  }
  return { id: 'propio', nombre: 'Propias', icono: 'lista', descripcion: 'Órdenes armadas a mano.' };
}

function textoCondicion(c, params) {
  return c.texto.replace(/\{(\w+)\}/g, (_, k) => (params && params[k] !== undefined ? params[k] : c.parametros && c.parametros[k] ? c.parametros[k].defecto : 'N'));
}
// El numero chiquito abajo del icono de una condicion con parametro (<30%, 3c)
function marcaParametro(c, params) {
  const [k, def] = Object.entries((c && c.parametros) || {})[0] || [];
  if (!k) return null;
  const v = params && params[k] !== undefined ? params[k] : def.defecto;
  return k === 'casillas' ? '≤' + v : k === 'valor' && /%/.test(c.texto) ? '<' + v + '%' : '<' + v;
}

const TIPOS = [['condicion', 'cuándo', 'condiciones', 'c'], ['accion', 'qué', 'acciones', 'a'], ['objetivo', 'a quién', 'objetivos', 'o']];

function vistaOrdenes(ctx) {
  const { app, datos, pi, pintar } = ctx;
  const G = datos.gambits;
  const lugares = lugaresDe(datos, pi);
  const lista = pi.gambits && pi.gambits.length ? pi.gambits : datos.clases[pi.clase].gambits_de_fabrica;
  const falta = disponibles(datos, pi);
  const guardar = (nueva) => { guardarGambits(datos, app.partida, pi.id, nueva); app.guardar(); pintar(); };
  if (ORDEN.abierta !== null && ORDEN.abierta >= lista.length) ORDEN.abierta = null;
  // lo que ya vio en el editor (lo nuevo lleva un punto verde hasta que lo mira)
  if (!pi.opcionesVistas) { pi.opcionesVistas = opcionesLibres(datos, falta); app.guardar(); }

  const perfil = perfilDe(datos, pi);
  const perfiles = [['fabrica', { nombre: 'De fábrica', icono: 'dado' }], ...Object.entries(G.perfiles || {}).filter(([k]) => k[0] !== '_')];
  const botonesPerfil = h('div', { class: 'or-perfiles', role: 'group', 'aria-label': 'Perfiles' }, ...perfiles.map(([id, pf]) => h('button', {
    class: 'or-perfil' + (perfil.id === id ? ' activo' : ''), 'aria-pressed': perfil.id === id ? 'true' : 'false', 'aria-label': 'Perfil ' + pf.nombre, title: pf.nombre,
    onclick: () => { ORDEN.abierta = null; guardar(listaDePerfil(datos, pi, id)); }
  }, ico(pf.icono))));

  const filas = lista.map((g, i) => {
    const abierta = ORDEN.abierta === i;
    const bloqueo = falta['a:' + g.accion] || falta['c:' + g.condicion];
    const fichaDeTipo = ([campo, nombreTipo, catalogo, letra]) => {
      const o = G[catalogo][g[campo]];
      const elegida = abierta && ORDEN.paso === campo;
      const bloq = falta[letra + ':' + g[campo]];
      const nombre = !o ? '?' : campo === 'condicion' ? textoCondicion(o, g.parametros) : o.texto;
      return h('button', {
        class: 'or-ficha or-' + campo + (elegida ? ' elegida' : '') + (bloq ? ' bloqueada' : ''),
        'aria-label': nombreTipo[0].toUpperCase() + nombreTipo.slice(1) + ': ' + nombre + (bloq ? ' (le falta ' + bloq + ')' : ''), title: nombre,
        onclick: () => { ORDEN.abierta = i; ORDEN.paso = campo; pintar(); }
      }, ico(o && existeIcono(o.icono) ? o.icono : 'evento'), campo === 'condicion' && o ? h('small', {}, marcaParametro(o, g.parametros)) : null,
      bloq ? h('span', { class: 'or-candado' }, ico('candado')) : null);
    };
    return h('li', { class: 'or-fila' + (abierta ? ' abierta' : '') + (bloqueo ? ' con-bloqueo' : ''), 'data-i': i },
      h('span', { class: 'or-n' }, String(i + 1)),
      fichaDeTipo(TIPOS[0]), h('span', { class: 'or-sep', 'aria-hidden': 'true' }, '›'),
      fichaDeTipo(TIPOS[1]), h('span', { class: 'or-sep', 'aria-hidden': 'true' }, '›'),
      fichaDeTipo(TIPOS[2]),
      h('span', { class: 'or-agarre', role: 'button', tabindex: '0', 'aria-label': 'Arrastrar la orden ' + (i + 1) + ' para cambiarla de lugar', title: 'Arrastrá para cambiar el orden',
        onpointerdown: (e) => arrastrar(e, i, lista, guardar),
        onkeydown: (e) => {
          const d = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
          if (!d || i + d < 0 || i + d >= lista.length) return;
          e.preventDefault(); const n = lista.slice(); [n[i], n[i + d]] = [n[i + d], n[i]]; guardar(n);
        } }, ico('agarre')));
  });
  // Lugares libres y los que se ganan con nivel
  if (lista.length < lugares) filas.push(h('li', { class: 'or-fila libre' }, h('button', {
    class: 'or-agregar', onclick: () => { ORDEN.abierta = lista.length; ORDEN.paso = 'condicion'; guardar([...lista, { condicion: 'enemigo_a_rango', accion: 'disparar', objetivo: 'enemigo_cercano' }]); }
  }, ico('mas'), h('span', {}, 'Orden ' + (lista.length + 1)))));
  for (const x of proximoLugar(datos, pi)) if (x.lugar > lista.length) filas.push(h('li', { class: 'or-fila cerrada', 'aria-label': 'Orden ' + x.lugar + ': se gana en el nivel ' + x.nivel },
    ico('candado'), h('span', { class: 'or-n' }, String(x.lugar)), h('span', {}, '· Nv ' + x.nivel)));

  return [
    cabeceraPiloto(ctx, 'Órdenes', pi.apodo + ' · ' + Math.min(lista.length, Math.max(lista.length, lugares)) + ' de ' + Math.max(lugares, lista.length) + ' lugares'),
    h('section', { class: 'or-arriba' },
      botonesPerfil,
      h('p', { class: 'or-perfil-texto' }, h('strong', {}, perfil.nombre), ' · ' + (perfil.descripcion || '')),
      h('div', { class: 'or-leyenda', 'aria-hidden': 'true' },
        h('span', { class: 'c' }, '■ cuándo'), h('span', { class: 'a' }, '■ qué'), h('span', { class: 'o' }, '■ a quién'), h('span', { class: 'fin' }, '↓ en orden'))),
    h('ol', { class: 'or-lista', 'aria-label': 'Órdenes, de arriba abajo: hace la primera que se cumpla' }, ...filas),
    seccion('Pasivas', h('div', {}, h('p', { class: 'ayuda' }, 'Lo que lleva encima siempre, sin que se lo ordenes.'), panelPasivas(app, pi)), false),
    ORDEN.abierta !== null ? hojaOpciones(ctx, lista, falta, guardar)
      : pieEdicion(ctx)
  ];
}

// Pie de armado y ordenes: saltar de uno a otro sin volver al escuadron, y Listo cuando terminaste los dos
function pieEdicion({ ir }, extra) {
  const lado = (id, texto, icono) => h('button', {
    class: 'pe-lado' + (VISTA.seccion === id ? ' activo' : ''), 'aria-pressed': VISTA.seccion === id ? 'true' : 'false',
    onclick: () => { if (VISTA.seccion !== id) ir(id); }
  }, ico(icono), h('span', {}, texto));
  return h('div', { class: 'hg-desplegar pie-edicion' },
    extra || null,
    h('div', { class: 'pe-cambio', role: 'group', 'aria-label': 'Editar' }, lado('armado', 'Armado', 'llave'), lado('ordenes', 'Órdenes', 'lista')),
    boton('Listo', () => ir('escuadron'), { iconoNombre: 'play', clase: 'principal' }));
}

// Opciones que puede usar hoy (para saber cuales son nuevas despues)
function opcionesLibres(datos, falta) {
  const out = [];
  for (const [, , catalogo, letra] of TIPOS) for (const id of Object.keys(datos.gambits[catalogo])) if (!falta[letra + ':' + id]) out.push(letra + ':' + id);
  return out;
}

// Arrastrar una orden por la manija: se mueve con el dedo y se suelta en su nuevo lugar
function arrastrar(e, i, lista, guardar) {
  const fila = e.currentTarget.closest('.or-fila');
  const ol = fila.parentElement;
  const filas = [...ol.querySelectorAll('.or-fila[data-i]')];
  const centros = filas.map((f) => { const r = f.getBoundingClientRect(); return r.top + r.height / 2; });
  const y0 = e.clientY;
  let destino = i;
  e.preventDefault();
  fila.classList.add('arrastrando');
  e.currentTarget.setPointerCapture(e.pointerId);
  const mover = (ev) => {
    const dy = ev.clientY - y0;
    fila.style.transform = 'translateY(' + dy + 'px)';
    const y = centros[i] + dy;
    destino = centros.filter((c, k) => k !== i && c < y).length;
  };
  const soltar = () => {
    e.target.removeEventListener('pointermove', mover);
    fila.classList.remove('arrastrando');
    fila.style.transform = '';
    if (destino === i) return;
    const n = lista.slice();
    const [g] = n.splice(i, 1);
    n.splice(destino, 0, g);
    ORDEN.abierta = null;
    guardar(n);
  };
  e.target.addEventListener('pointermove', mover);
  e.target.addEventListener('pointerup', soltar, { once: true });
  e.target.addEventListener('pointercancel', soltar, { once: true });
}

// La hoja de abajo de una orden: todas las opciones del tipo tocado como grilla de iconos
function hojaOpciones({ app, datos, pi, pintar }, lista, falta, guardar) {
  const G = datos.gambits;
  const i = ORDEN.abierta;
  const g = lista[i];
  const [campo, nombreTipo, catalogo, letra] = TIPOS.find((x) => x[0] === ORDEN.paso);
  const cambiar = (cambio) => { const n = lista.map((x) => ({ ...x })); Object.assign(n[i], cambio); guardar(n); };
  const vistas = new Set(pi.opcionesVistas || []);
  const opciones = Object.entries(G[catalogo]).sort(([a], [b]) => (falta[letra + ':' + a] ? 1 : 0) - (falta[letra + ':' + b] ? 1 : 0));
  // las que esta viendo dejan de ser nuevas (se guarda para la proxima)
  const nuevas = opciones.filter(([id]) => !falta[letra + ':' + id] && !vistas.has(letra + ':' + id)).map(([id]) => letra + ':' + id);
  if (nuevas.length) { pi.opcionesVistas = [...vistas, ...nuevas]; app.guardar(); }
  const elegido = G[catalogo][g[campo]];
  const cond = G.condiciones[g.condicion];
  const params = campo === 'condicion' ? Object.entries((cond && cond.parametros) || {}) : [];
  const mover = (d) => { if (i + d < 0 || i + d >= lista.length) return; const n = lista.slice(); [n[i], n[i + d]] = [n[i + d], n[i]]; ORDEN.abierta = i + d; guardar(n); };
  return h('section', { class: 'hg-hoja hoja-' + campo, 'aria-label': 'Orden ' + (i + 1) + ': elegir ' + nombreTipo },
    h('div', { class: 'hoja-cabeza' },
      h('div', { class: 'hoja-tipos', role: 'tablist' }, ...TIPOS.map(([c, t]) => h('button', {
        class: 'hoja-tipo t-' + c + (c === campo ? ' activo' : ''), role: 'tab', 'aria-selected': c === campo ? 'true' : 'false',
        onclick: () => { ORDEN.paso = c; pintar(); }
      }, t))),
      botonIcono('cerrar', 'Cerrar', () => { ORDEN.abierta = null; pintar(); }, 'hoja-cerrar')),
    h('div', { class: 'hoja-grilla', 'data-scroll': 'opciones-' + campo }, ...opciones.map(([id, o]) => {
      const bloq = falta[letra + ':' + id];
      const nombre = campo === 'condicion' ? textoCondicion(o) : o.texto;
      return h('button', {
        class: 'op' + (id === g[campo] ? ' elegida' : '') + (bloq ? ' bloqueada' : ''), disabled: !!bloq && id !== g[campo],
        'aria-label': nombre + (bloq ? ' (bloqueada: ' + bloq + ')' : nuevas.includes(letra + ':' + id) ? ' (nueva)' : ''), title: nombre,
        onclick: () => cambiar(campo === 'condicion' ? { condicion: id, parametros: undefined } : { [campo]: id })
      }, ico(existeIcono(o.icono) ? o.icono : 'evento'),
      bloq ? h('span', { class: 'op-candado' }, ico('candado')) : null,
      nuevas.includes(letra + ':' + id) ? h('span', { class: 'op-nueva', 'aria-hidden': 'true' }) : null);
    })),
    h('div', { class: 'hoja-ayuda', 'aria-live': 'polite' },
      h('strong', {}, elegido ? (campo === 'condicion' ? textoCondicion(elegido, g.parametros) : elegido.texto) : '?'),
      h('span', {}, elegido ? (elegido.ayuda || '') : ''),
      falta[letra + ':' + g[campo]] ? h('span', { class: 'mal' }, 'No la puede cumplir: le falta ' + falta[letra + ':' + g[campo]] + '.') : null),
    ...params.map(([pid, def]) => {
      const v = g.parametros && g.parametros[pid] !== undefined ? g.parametros[pid] : def.defecto;
      const paso = pid === 'casillas' ? 1 : 5;
      const poner = (n) => cambiar({ parametros: { ...(g.parametros || {}), [pid]: Math.max(def.min, Math.min(def.max, n)) } });
      return h('div', { class: 'hoja-param' },
        botonIcono('menos', 'Menos', () => poner(v - paso)), h('strong', {}, pid === 'casillas' ? v + ' casillas' : /%/.test(cond.texto) ? v + '%' : String(v)), botonIcono('mas', 'Más', () => poner(v + paso)));
    }),
    h('div', { class: 'hoja-botones' },
      botonIcono('arriba', 'Subir la orden', () => mover(-1)),
      botonIcono('abajo', 'Bajar la orden', () => mover(1)),
      botonIcono('cerrar', 'Borrar la orden', () => { ORDEN.abierta = null; guardar(lista.filter((_, k) => k !== i)); }, 'peligro'),
      boton('Listo', () => { ORDEN.abierta = null; pintar(); }, { iconoNombre: 'play', clase: 'principal' })));
}

// ---------- Pasivas: lo que el piloto lleva puesto sin que se lo pidan ----------
const NOMBRE_MOD = { punteria: 'Puntería', evasion: 'Evasión', moral: 'Moral', danio_pct: 'Daño %', recarga: 'Recarga', blindaje: 'Blindaje',
  vision: 'Visión', iniciativa: 'Iniciativa', alcance: 'Alcance', cadencia: 'Cadencia', velocidad: 'Paso', estructura: 'Estructura', municion: 'Cargador' };
function efectos(mods) {
  return Object.entries(mods || {}).map(([k, v]) => (NOMBRE_MOD[k] || k) + ' ' + (v > 0 ? '+' : '') + v).join(' · ');
}
function curaTexto(t) {
  return t.cura === 'nuevo_vinculo' ? 'Se cura con un vínculo nuevo' : 'Se cura descansando (' + Math.max(0, t.resta) + ' más)';
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

// ---------- Info: la ficha del piloto ----------
function vistaInfo(ctx) {
  const { app, datos, p, pi } = ctx;
  const clase = datos.clases[pi.clase];
  const pers = textoPersonalidad(datos, pi);
  const vinculo = pi.vinculo ? p.pilotos.find((x) => x.id === pi.vinculo) : null;
  const R = datos.reglas;
  const xpSig = R.xp_por_nivel[pi.nivel] || null;
  const xpAnt = R.xp_por_nivel[pi.nivel - 1] || 0;
  return [
    cabeceraPiloto(ctx, 'Piloto', pi.nombre),
    panel(null,
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
        vinculo ? chip('vinculo', vinculo.apodo, 'Vínculo: pelean mejor cerca y les duele perderse') : chip('vinculo', 'Sin vínculo', 'No tiene a nadie cercano en el escuadrón', 'apagado'),
        ...loBuscan(p, pi.id).map((n) => chip('calavera', 'Lo busca «' + n.apodo + '»', n.intro, 'chip-alerta'))),
      h('p', { class: 'ayuda' }, 'Misiones: ' + pi.misiones + ' · Bajas: ' + pi.bajas)),
    panel('Lo que lleva encima', panelPasivas(app, pi)),
    panel('Relaciones', panelRelaciones(app, pi)),
    panel('Hoja de servicio', panelHoja(pi))
  ];
}

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

// Lo que el piloto vivio: sus momentos, del mas nuevo al mas viejo
function panelHoja(pi) {
  const hoja = (pi.hoja || []).slice().reverse();
  return h('div', {},
    hoja.length
      ? h('ul', { class: 'hoja-servicio' }, ...hoja.map((t) => h('li', {}, t)))
      : h('p', { class: 'ayuda' }, 'Todavía no hay nada para contar. Ya va a haber.'));
}
