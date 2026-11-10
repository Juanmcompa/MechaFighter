// El frente: lo que la nodriza ya escaneo del sector (nunca todo). Hexagonos con el color del bando que los
// controla, la mancha de contagio, los nidos, las paradas que se vieron, la ruta de la nave y la guarida del jefe.
// Abajo, cada bando con su parte del sector y como te ve, y las amenazas.
import { h, montar, ico, botonIcono, barraJuego } from './comun.js';
import { quien, duenoEn, reputacion, escalonDe, contagioPct, nodoActual, guaridaAbierta, textoReputacion } from '../campana/brujula.js';
import { barraFrente } from './sectores.js';
import { tr } from '../core/traducir.js';

const HEX = 0.62; // radio de cada hexagono, en saltos

export function frente(app, raiz) {
  const { datos } = app;
  const p = app.partida;
  const s = p.sectores[p.sector];
  const R = datos.bandos.brujula.radio_sector;
  const aca = nodoActual(p);
  const VIS = datos.bandos.brujula.visible;

  // lo escaneado: alrededor de la ruta y lo que se ve desde donde esta la nave
  const conocido = (x, y) => Math.hypot(x - aca.x, y - aca.y) <= VIS || s.ruta.some(([a, b]) => Math.hypot(x - a, y - b) <= 2.1);
  const dx = Math.sqrt(3) * HEX, dy = 1.5 * HEX;
  const hexes = [], borde = [];
  const puntos = (x, y, r) => Array.from({ length: 6 }, (_, i) => { const a = (Math.PI / 3) * i - Math.PI / 6; return (x + r * Math.cos(a)).toFixed(2) + ',' + (y + r * Math.sin(a)).toFixed(2); }).join(' ');
  const visto = {};
  for (let fila = -Math.ceil(R / dy) - 1; fila <= Math.ceil(R / dy) + 1; fila++) {
    for (let col = -Math.ceil(R / dx) - 1; col <= Math.ceil(R / dx) + 1; col++) {
      const x = col * dx + (fila % 2 ? dx / 2 : 0), y = fila * dy;
      if (Math.hypot(x, y) > R) continue;
      if (conocido(x, y)) {
        const d = duenoEn(s, x, y);
        visto[d] = visto[d] || [0, 0, 0]; visto[d][0] += x; visto[d][1] += y; visto[d][2]++;
        hexes.push(`<polygon points="${puntos(x, y, HEX * 0.94)}" fill="url(#t-${d})" stroke="${(quien(datos, d) || {}).color || '#4f5a46'}" stroke-opacity=".35" stroke-width=".04"/>`);
      } else if (s.ruta.some(([a, b]) => Math.hypot(x - a, y - b) <= 3.1) || Math.hypot(x - aca.x, y - aca.y) <= VIS + 1) {
        borde.push(`<polygon points="${puntos(x, y, HEX * 0.94)}" fill="none" stroke="#1e2619" stroke-width=".04"/>`);
      }
    }
  }
  const tramas = [...s.bandos, 'contagio'].map((id) => {
    const q = quien(datos, id);
    return id === 'contagio'
      ? `<pattern id="t-contagio" width=".3" height=".3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width=".3" height=".3" fill="${q.fondo}"/><line x1="0" y1="0" x2="0" y2=".3" stroke="${q.color}" stroke-width=".12" opacity=".8"/></pattern>`
      : `<pattern id="t-${id}" width=".3" height=".3" patternUnits="userSpaceOnUse" patternTransform="rotate(${s.bandos.indexOf(id) % 2 ? -45 : 45})"><rect width=".3" height=".3" fill="${q.fondo}"/><line x1="0" y1="0" x2="0" y2=".3" stroke="${q.color}" stroke-width=".08" opacity=".55"/></pattern>`;
  }).join('');
  const texto = (x, y, t, color, ancla = 'middle', tam = 0.55) => `<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" text-anchor="${ancla}" font-family="VT323, monospace" font-size="${tam}" fill="${color}">${t}</text>`;
  const etiquetas = Object.entries(visto).filter(([, v]) => v[2] >= 3).map(([id, v]) => texto(v[0] / v[2], v[1] / v[2], (quien(datos, id) || {}).corto ? quien(datos, id).corto.toUpperCase() : id, (quien(datos, id) || {}).claro || '#a8b39b')).join('');
  const ruta = `<polyline points="${s.ruta.map(([a, b]) => a + ',' + b).join(' ')}" fill="none" stroke="#8fdc5a" stroke-width=".09" stroke-dasharray=".15 .2"/>` +
    s.ruta.slice(0, -1).map(([a, b]) => `<circle cx="${a}" cy="${b}" r=".1" fill="#8fdc5a"/>`).join('');
  const marcas = [];
  for (const n of s.nodos) {
    if (!conocido(n.x, n.y)) continue;
    if (n.tipo === 'parada') marcas.push(`<rect x="${n.x - 0.22}" y="${n.y - 0.22}" width=".44" height=".44" fill="#2a1f12" stroke="#e0a43a" stroke-width=".06"/>`);
  }
  for (const a of s.amenazas) {
    if (a.tipo === 'fauna' && a.vivo && conocido(a.x, a.y)) marcas.push(`<path d="M${a.x} ${a.y - 0.35}c.2 0 .32.17.32.4s-.13.46-.32.66c-.2-.2-.32-.43-.32-.66s.12-.4.32-.4z" fill="#1f1830" stroke="#a77fe0" stroke-width=".06"/>`);
  }
  // la guarida: con datos se intuye por donde anda; abierta, se sabe donde esta
  if (s.inteligencia > 0) {
    const g = s.guarida;
    const abierta = guaridaAbierta(datos, s);
    marcas.push(abierta ? `<circle cx="${g.x}" cy="${g.y}" r=".38" fill="#2a1814" stroke="#d9553f" stroke-width=".07"/>` + texto(g.x, g.y + 0.2, '!', '#e57a6c')
      : `<circle cx="${g.x}" cy="${g.y}" r="${(1.8 - s.inteligencia * 0.4).toFixed(2)}" fill="none" stroke="#d9553f" stroke-width=".05" stroke-dasharray=".15 .15"/>` + texto(g.x, g.y + 0.2, '?', '#e57a6c'));
  }
  const nave = `<circle cx="${aca.x}" cy="${aca.y}" r=".34" fill="#121a0e" stroke="#8fdc5a" stroke-width=".07"/><circle cx="${aca.x}" cy="${aca.y}" r="${VIS}" fill="none" stroke="#4f7a33" stroke-width=".04" stroke-dasharray=".08 .2" opacity=".7"/>`;
  // vecinos: el sector que sigue (y el anterior), en el borde
  const def = datos.sectores.campana_base.sectores_def;
  const sigNombre = def[(p.sector + 1) % def.length].nombre;
  // encuadre: lo escaneado (con margen), nunca menos de 9 saltos de lado
  const xs = s.ruta.map((q) => q[0]).concat(aca.x - VIS - 1, aca.x + VIS + 1), ys = s.ruta.map((q) => q[1]).concat(aca.y - VIS - 1, aca.y + VIS + 1);
  let x0 = Math.min(...xs) - 1, x1 = Math.max(...xs) + 1, y0 = Math.min(...ys) - 1, y1 = Math.max(...ys) + 1;
  const lado = Math.max(9, x1 - x0, y1 - y0);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  x0 = cx - lado / 2; y0 = cy - lado / 2;
  const svg = `<svg viewBox="${x0.toFixed(2)} ${y0.toFixed(2)} ${lado.toFixed(2)} ${lado.toFixed(2)}" width="100%" height="100%" role="img" aria-label="${tr('Lo escaneado del sector: territorios de cada bando, contagio, nidos, paradas, la ruta de la nave y la guarida del jefe')}">` +
    `<defs>${tramas}</defs><circle cx="0" cy="0" r="${R}" fill="none" stroke="#2d3427" stroke-width=".05" stroke-dasharray=".2 .3"/>` +
    borde.join('') + hexes.join('') + ruta + marcas.join('') + nave + etiquetas + texto(x0 + lado - 0.2, y0 + lado - 0.25, sigNombre + ' →', '#78846c', 'end', 0.5) + '</svg>';

  const filaBando = (b) => {
    const q = quien(datos, b);
    const v = reputacion(p, b);
    const izq = v >= 0 ? 50 : 50 + v / 2;
    return h('div', { class: 'fr-bando', style: '--c:' + q.color + ';--f:' + q.fondo },
      h('span', { class: 'fr-nombre' }, h('strong', {}, q.nombre), h('small', {}, q.estilo + (s.bandoJefe === b ? ' · jefe: ' + s.jefe : ''))),
      h('span', { class: 'fr-pct', style: 'color:' + q.claro }, s.frente[b] + '%'),
      h('span', { class: 'fr-rep' }, h('span', { class: 'ct-pista', 'aria-hidden': 'true' }, h('i', { class: 'cero' }), h('i', { style: 'left:' + izq + '%;width:' + Math.abs(v) / 2 + '%;background:' + q.color })),
        h('small', { class: escalonDe(datos, p, b).id }, textoReputacion(datos, p, b))));
  };
  const nidos = s.amenazas.filter((a) => a.tipo === 'fauna' && a.vivo).length;
  const contagio = contagioPct(datos, s);
  montar(raiz, h('div', { class: 'fr' },
    h('header', { class: 'br-cabeza' },
      botonIcono('atras', 'Volver a la brújula', () => app.ir('sectores'), 'hg-volver'),
      h('div', { class: 'br-titulo' }, h('h1', {}, 'El frente'), h('small', {}, s.nombre + ' · lo que escaneamos'))),
    h('div', { class: 'fr-mapa', html: svg }),
    h('div', { class: 'fr-leyenda', 'aria-hidden': 'true' },
      h('span', {}, h('b', { style: 'color:#8fdc5a' }, '- -'), ' tu ruta'), h('span', {}, h('b', { style: 'color:#e0a43a' }, '■'), ' parada'),
      h('span', {}, h('b', { style: 'color:#a77fe0' }, '◆'), ' nido'), h('span', {}, h('b', { style: 'color:#c9c23a' }, '▨'), ' contagio'), h('span', {}, h('b', { style: 'color:#e57a6c' }, '?'), ' guarida')),
    barraFrente(datos, s),
    (s.rasgos || []).length ? h('small', { class: 'fr-rotulo' }, 'ESTE SECTOR') : null,
    ...(s.rasgos || []).map((r) => h('div', { class: 'fr-rasgo' }, h('strong', {}, r.nombre), h('small', {}, r.texto))),
    (s.noticias || []).length ? h('small', { class: 'fr-rotulo' }, 'NOTICIAS') : null,
    ...(s.noticias || []).slice().reverse().map((n) => h('div', { class: 'fr-rasgo' }, h('strong', {}, n.titulo + ' · salto ' + n.salto), h('small', {}, n.texto))),
    h('small', { class: 'fr-rotulo' }, 'BANDOS · cuánto controlan y cómo te ven'),
    ...s.bandos.map(filaBando),
    s.amenazas.length ? h('small', { class: 'fr-rotulo' }, 'AMENAZAS · atacan a todos por igual') : null,
    s.amenazas.some((a) => a.tipo === 'fauna') ? h('div', { class: 'fr-amenaza', style: '--c:#a77fe0;--f:#1f1830' },
      ico('enjambre'), h('span', {}, h('strong', {}, 'Fauna del vacío'), h('small', {}, nidos ? nidos + (nidos === 1 ? ' nido vivo' : ' nidos vivos') + ' · se cuelan en las misiones de alrededor' : 'Sin nidos vivos'))) : null,
    s.amenazas.some((a) => a.tipo === 'contagio') ? h('div', { class: 'fr-amenaza', style: '--c:#c9c23a;--f:#24230f' },
      ico('calavera'), h('span', {}, h('strong', {}, 'Contagio'), h('small', {}, contagio ? contagio + '% del sector · crece en cada salto si nadie lo frena' : 'Contenido'))) : null,
    h('p', { class: 'ayuda' }, 'El frente se mueve un poco con cada salto: la guerra sigue aunque no estés. Tus contratos lo empujan más.'),
    barraJuego(app, 'mapa')));
}
