// Ayudas compartidas por las pantallas: armar elementos, describir partes y pilotos, la barra de arriba.
import { icono } from './iconos.js';
import { nombrePieza, normalizarPieza } from '../motor/unidades.js';
import { rutaRetrato } from '../vista/sprites.js';
import { elegirRetrato } from '../campana/reclutas.js';
import { limitePilotos, combustibleMaximo } from '../campana/brujula.js';
import { tr } from '../core/traducir.js';

// Version que se muestra en la barra de estado de abajo
// Version del juego (data/version.json, la suma sola tools/hooks/post-commit en cada commit)
export const version = (datos) => (datos && datos.version ? datos.version.mayor + '.' + datos.version.numero : '0');

const TRADUCIBLES = new Set(['title', 'aria-label', 'placeholder', 'alt']);

// h('div', { class: 'x', onclick: fn }, hijo1, 'texto', ...). html: '...' para meter iconos.
export function h(tag, attrs = {}, ...hijos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'class') el.className = v;
    else el.setAttribute(k, v === true ? '' : TRADUCIBLES.has(k) ? tr(String(v)) : v);
  }
  // (los textos pasan por tr: si hay traduccion o cambio en data/idiomas, se usa ese)
  for (const c of hijos.flat()) if (c !== null && c !== undefined && c !== false) el.append(c.nodeType ? c : tr(String(c)));
  return el;
}

// Como raiz.append, pero salteando lo que no va (null, false): asi se pueden armar pantallas con condiciones.
export function montar(raiz, ...hijos) {
  for (const c of hijos.flat()) if (c !== null && c !== undefined && c !== false) raiz.append(c);
}

export const ico = (nombre, clase) => h('span', { class: 'ico-envoltura', html: icono(nombre, clase) });

export function boton(texto, onclick, { iconoNombre, clase = '', deshabilitado = false, titulo } = {}) {
  return h('button', { class: 'boton ' + clase, onclick, disabled: deshabilitado, title: titulo, 'aria-label': titulo || null },
    iconoNombre ? ico(iconoNombre) : null, texto ? h('span', {}, texto) : null);
}

export function botonIcono(nombre, titulo, onclick, clase = '') {
  return h('button', { class: 'boton-icono ' + clase, onclick, title: titulo, 'aria-label': titulo, html: icono(nombre) });
}

export function chip(nombreIcono, texto, titulo, clase = '') {
  return h('span', { class: 'chip ' + clase, title: titulo || texto, tabindex: titulo ? '0' : null }, nombreIcono ? ico(nombreIcono) : null, texto);
}

export function barra(valor, maximo, clase = '') {
  const pct = maximo > 0 ? Math.max(0, Math.min(100, Math.round((valor * 100) / maximo))) : 0;
  return h('span', { class: 'barra ' + clase, role: 'meter', 'aria-valuenow': valor, 'aria-valuemax': maximo },
    h('span', { class: 'barra-relleno', style: 'width:' + pct + '%' }));
}

export function panel(titulo, ...hijos) {
  return h('section', { class: 'panel' }, titulo ? h('h2', { class: 'rotulo' }, titulo) : null, ...hijos);
}

// Una linea de numeros de una parte: lo que importa para elegirla.
export function describirParte(datos, pieza) {
  const pz = normalizarPieza(pieza);
  if (!pz) return '';
  const p = datos.partes[pz.parte];
  const out = [];
  if (p.habilidad && datos.habilidades[p.habilidad]) out.push('★ ' + datos.habilidades[p.habilidad].nombre);
  if (p.radar) out.push('Radar ' + p.radar);
  if (p.encaje === 'torso') out.push('Estructura ' + p.estructura, 'Blindaje ' + p.blindaje, 'Carga ' + p.capacidad);
  if (p.encaje === 'torso' && p.velocidad) out.push('Paso +' + p.velocidad);
  if (p.encaje === 'torso' && p.evasion) out.push('Evasión ' + (p.evasion > 0 ? '+' : '') + p.evasion);
  if (p.encaje === 'piernas') out.push('Paso ' + p.velocidad, 'Evasión ' + p.evasion + (p.blindaje ? ' · Blindaje +' + p.blindaje : ''));
  if (p.encaje === 'cabeza') out.push('Visión ' + p.vision + (p.punteria ? ' · Puntería +' + p.punteria : ''));
  if (p.arma) out.push('Daño ' + p.arma.danio, 'Alcance ' + p.arma.alcance, 'Cadencia ' + p.arma.cadencia + (p.arma.municion ? ' · Cargador ' + p.arma.municion : ''));
  if (p.escudo) out.push('Bloqueo ' + p.escudo.bloqueo + '%', 'Blindaje +' + p.escudo.blindaje);
  if (p.usos) out.push(p.usos + ' usos');
  if (p.municion_pct) out.push('Munición +' + p.municion_pct + '%');
  out.push('Peso ' + p.peso);
  const mods = pz.afijos.map((a) => datos.afijos[a]).filter(Boolean).map((a) => Object.entries(a.mods).map(([k, v]) => k.replace('_pct', '%').replace('_', ' ') + ' ' + (v > 0 ? '+' : '') + v).join(', '));
  if (mods.length) out.push(mods.join(' · '));
  return out.join(' · ');
}

export { nombrePieza };

export const rarezaDe = (datos, pieza) => datos.partes[normalizarPieza(pieza).parte].rareza;
// Icono de una parte (assets/iconos, ya pintado del color de su rareza). Si no hay, el sprite del mecha.
export function iconoParte(datos, id, clase = 'img-parte') {
  const sprite = (datos.partes[id] && datos.partes[id].sprite) || id;
  return h('img', { class: clase, src: 'assets/iconos/' + id + '.png', alt: '', loading: 'lazy',
    onerror: (e) => { if (!e.target.dataset.otra) { e.target.dataset.otra = '1'; e.target.src = 'assets/mecha/azul/' + sprite + '.png'; } else e.target.style.visibility = 'hidden'; } });
}

export const NOMBRE_RAREZA = { normal: 'Normal', raro: 'Rara', muy_raro: 'Muy rara', legendario: 'Legendaria', unico: 'Única' };

export function textoPersonalidad(datos, piloto) {
  const pe = datos.personalidades[piloto.personalidad];
  if (!pe) return { texto: '—', titulo: '' };
  if (!pe.visible && (piloto.misiones || 0) < 3) return { texto: '???', titulo: pe.pista + ' (se revela con la experiencia)', icono: 'evento' };
  return { texto: pe.nombre, titulo: pe.pista, icono: pe.icono };
}

// De que bando es una pieza, para las listas ("Rara · Vesta")
export function origenParte(datos, id) {
  const b = datos.partes[id] && datos.partes[id].bando;
  const q = b && datos.bandos ? datos.bandos.bandos[b] || datos.bandos.amenazas[b] : null;
  return q ? ' · ' + q.corto : '';
}

// Barra de abajo de la campana (la misma del hangar): Escuadron, Armado, Ordenes y Mapa
export function barraJuego(app, activa) {
  const p = app.partida;
  const item = (id, texto, icono, accion) => h('button', {
    class: 'hg-tab' + (activa === id ? ' activa' : ''), 'aria-current': activa === id ? 'page' : null, onclick: accion
  }, ico(icono), h('span', {}, texto));
  return h('nav', { class: 'hg-tabs', 'aria-label': 'Secciones' },
    item('escuadron', 'Escuadrón', 'escuadron', () => app.ir('hangar')),
    item('armado', 'Armado', 'llave', () => app.ir('hangar', { pestana: 'armado' })),
    item('ordenes', 'Órdenes', 'lista', () => app.ir('hangar', { pestana: 'ordenes' })),
    item('mapa', p && p.estado === 'preparacion' ? 'Misión' : 'Mapa', 'mapa', () => (p && p.estado === 'preparacion' ? app.ir('preparacion') : app.ir('sectores'))));
}

// Barra de arriba de la campana: creditos, puntaje, sector, pilotos.
export function barraCampana(datos, p, acciones = []) {
  const s = p.sectores[p.sector];
  return h('header', { class: 'hud' },
    h('div', { class: 'hud-datos' },
      chip('creditos', String(p.creditos), 'Créditos'),
      chip('puntaje', String(p.puntaje), 'Puntaje'),
      chip('piloto', p.pilotos.length + '/' + limitePilotos(datos, p), 'Pilotos'),
      p.combustible !== undefined ? chip('combustible', p.combustible + '/' + combustibleMaximo(datos, p), 'Combustible: cada salto gasta de 1 a 3', p.combustible <= 1 ? 'chip-alerta' : '') : null,
      s ? chip('mision', 'Sector ' + (p.sector + 1), s.nombre) : null),
    h('div', { class: 'hud-acciones' }, ...acciones),
    // recien remolcados (se quedaron sin combustible en el ultimo salto)
    p.remolque && p.estado !== 'sectores' ? h('p', { class: 'aviso-remolque' }, ico('combustible'), ' Sin combustible: el remolque cobró ' + p.remolque.creditos +
      ' créditos y los mechas perdieron ' + p.remolque.danio + '% de estructura.') : null);
}

// Retrato pixelado del piloto (los guardados viejos no lo tienen: se calcula del nombre).
export function retrato(datos, piloto, clase = '') {
  const n = piloto.retrato || elegirRetrato(datos, piloto.nombre || piloto.apodo || '');
  if (!n) return null;
  return h('img', { class: 'retrato ' + clase, src: rutaRetrato(n), alt: '', width: 48, height: 54, loading: 'lazy' });
}
