// El plan del despliegue: antes de bajar, Control ubica cada mecha en la zona de entrada y le dice que hace primero
// (ir a un punto, aguantar en el lugar o seguir sus ordenes). Se toca un piloto y despues el mapa:
// en la zona verde lo ubica; en cualquier otra casilla le marca a donde ir.
import { h, montar, ico, boton, botonIcono, retrato } from './comun.js';
import { dibujarMapa } from './vistaMapa.js';
import { planDe, zonaDeDespliegue, ubicar, marcarRumbo } from '../campana/plan.js';
import { desplegables, misionConTareas } from '../campana/tareas.js';
import { unidadDePiloto } from '../motor/unidades.js';

const VISTA = { sel: null };

export function plan(app, raiz) {
  const { datos } = app;
  const p = app.partida;
  if (!p.nodo || !p.nodo.mision) return app.continuar();
  if (p.nodo.visto) return app.ir('batalla'); // la batalla ya empezo
  const m = misionConTareas(datos, p, p.nodo.mision);
  const salen = desplegables(datos, p);
  const P = planDe(datos, p);
  const { zona, mapa } = zonaDeDespliegue(datos, m);
  const [ancho, alto] = mapa.tamano;
  if (!salen.some((pi) => pi.id === VISTA.sel)) VISTA.sel = salen[0].id;
  const alcance = new Map(salen.map((pi) => [pi.id, unidadDePiloto(datos, pi, pi.mecha, pi.gambits).armas.reduce((mx, a) => Math.max(mx, a.alcance), 1)]));

  const lienzo = h('canvas', { class: 'pl-mapa', role: 'img', 'aria-label': 'Mapa de la misión: la zona de entrada, a la izquierda, y por dónde entra el enemigo' });
  const lista = h('div', { class: 'pl-lista' });
  const cuerpo = h('div', { class: 'pl' },
    h('header', { class: 'br-cabeza' },
      botonIcono('atras', 'Volver a la misión', () => app.ir('preparacion'), 'hg-volver'),
      h('div', { class: 'br-titulo' }, h('h1', {}, 'Despliegue'), h('small', {}, m.nombre + ' · ' + mapa.nombre))),
    h('p', { class: 'pl-ayuda' }, 'Elegí un piloto. Tocá la ', h('b', { class: 'verde' }, 'zona verde'), ' para ubicarlo, o cualquier otro lugar del mapa para marcarle ', h('b', { class: 'ambar' }, 'a dónde ir primero'), '.'),
    m.bombardeo ? h('p', { class: 'br-aviso' }, ico('explosion'), h('span', {}, h('strong', {}, 'Saben dónde bajan. '), 'Las casillas ', h('b', { class: 'rojo' }, 'rayadas en rojo'), ' las bombardean apenas empieza.')) : null,
    lienzo, lista,
    h('div', { class: 'hg-desplegar' }, boton('Desplegar', () => { app.guardar(); app.ir('despliegue'); }, { iconoNombre: 'play', clase: 'principal' })));
  montar(raiz, cuerpo);

  // el mapa se dibuja una vez; encima va el plan
  let L = 16;
  const base = document.createElement('canvas');
  const armarBase = () => {
    const anchoPx = Math.min(lienzo.parentElement.clientWidth || 360, 560);
    L = Math.max(10, Math.floor((anchoPx * 2) / ancho));
    base.width = ancho * L; base.height = alto * L;
    dibujarMapa(base, mapa);
    lienzo.width = base.width; lienzo.height = base.height;
  };
  const centro = (c) => [c[0] * L + L / 2, c[1] * L + L / 2];
  const dibujar = () => {
    const ctx = lienzo.getContext('2d');
    ctx.drawImage(base, 0, 0);
    // zona de entrada
    ctx.fillStyle = 'rgba(143, 220, 90, .16)';
    for (const k of zona) { const [x, y] = k.split(',').map(Number); ctx.fillRect(x * L + 1, y * L + 1, L - 2, L - 2); }
    // el bombardeo: donde va a caer (rayado rojo)
    if (m.bombardeo) {
      ctx.save();
      for (const [x, y] of m.bombardeo.casillas) {
        ctx.fillStyle = 'rgba(217, 85, 63, .28)'; ctx.fillRect(x * L, y * L, L, L);
        ctx.strokeStyle = 'rgba(229, 122, 108, .8)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(x * L, (y + 1) * L); ctx.lineTo((x + 1) * L, y * L); ctx.stroke();
      }
      ctx.restore();
    }
    // lo que pide la mision: a donde llegar o que defender
    ctx.setLineDash([L / 3, L / 4]); ctx.lineWidth = 2; ctx.strokeStyle = '#e0a43a'; ctx.fillStyle = '#e0a43a';
    ctx.font = Math.round(L * 0.8) + 'px VT323, monospace';
    for (const [z, rotulo] of [[m.zonaMeta, 'llegar'], [m.zonaDefender, 'defender']]) {
      if (!z || !mapa.zonas[z]) continue;
      const [[x1, y1], [x2, y2]] = mapa.zonas[z];
      ctx.strokeRect(x1 * L + 1, y1 * L + 1, (x2 - x1 + 1) * L - 2, (y2 - y1 + 1) * L - 2);
      ctx.fillText(rotulo, x1 * L + 2, y1 * L - 3 < L ? (y2 + 2) * L - 4 : y1 * L - 3);
    }
    ctx.setLineDash([]);
    // el alcance del elegido
    const sel = P[VISTA.sel];
    if (sel) {
      const [cx, cy] = centro(sel.casilla);
      ctx.strokeStyle = 'rgba(143, 220, 90, .55)'; ctx.lineWidth = 2; ctx.setLineDash([4, 6]);
      const r = (alcance.get(VISTA.sel) + 0.5) * L;
      ctx.strokeRect(cx - r, cy - r, r * 2, r * 2); // (el alcance se mide en casillas, en cuadrado)
      ctx.setLineDash([]);
    }
    // rumbos y fichas
    salen.forEach((pi, i) => {
      const x = P[pi.id];
      const el = pi.id === VISTA.sel;
      const [cx, cy] = centro(x.casilla);
      if (x.rumbo && !x.rumbo.espera) {
        const [rx, ry] = centro([x.rumbo.x, x.rumbo.y]);
        ctx.strokeStyle = el ? '#e0a43a' : 'rgba(224, 164, 58, .55)'; ctx.lineWidth = el ? 3 : 2; ctx.setLineDash([6, 5]);
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(rx, ry); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = el ? '#e0a43a' : 'rgba(224, 164, 58, .7)';
        ctx.beginPath(); ctx.moveTo(rx, ry - L * 0.4); ctx.lineTo(rx + L * 0.4, ry); ctx.lineTo(rx, ry + L * 0.4); ctx.lineTo(rx - L * 0.4, ry); ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = el ? '#8fdc5a' : '#16221a'; ctx.strokeStyle = el ? '#fff' : '#8fdc5a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, L * 0.46, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (x.rumbo && x.rumbo.espera) { ctx.strokeStyle = '#7fb6ea'; ctx.strokeRect(cx - L * 0.6, cy - L * 0.6, L * 1.2, L * 1.2); }
      ctx.fillStyle = el ? '#0d0f0b' : '#8fdc5a'; ctx.font = 'bold ' + Math.round(L * 0.7) + 'px VT323, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), cx, cy + 1); ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
    });
  };

  const textoPlan = (x) => (!x.rumbo ? 'Sigue sus órdenes' : x.rumbo.espera ? 'Aguanta hasta ver al enemigo' : 'Va primero al punto marcado');
  const pintarLista = () => {
    lista.replaceChildren(...salen.map((pi, i) => {
      const x = P[pi.id], el = pi.id === VISTA.sel;
      const fila = h('button', { class: 'pl-piloto' + (el ? ' elegido' : ''), 'aria-pressed': el ? 'true' : 'false', onclick: () => { VISTA.sel = pi.id; pintar(); } },
        h('span', { class: 'pl-num' }, String(i + 1)), retrato(datos, pi, 'retrato-mini'),
        h('span', { class: 'pl-textos' }, h('strong', {}, pi.apodo), h('small', {}, datos.clases[pi.clase].nombre + ' · alcance ' + alcance.get(pi.id))),
        h('small', { class: 'pl-plan' + (x.rumbo ? (x.rumbo.espera ? ' azul' : ' ambar') : '') }, textoPlan(x)));
      if (!el) return fila;
      const opcion = (texto, icono, activa, accion) => h('button', { class: 'pl-opcion' + (activa ? ' activa' : ''), 'aria-pressed': activa ? 'true' : 'false', onclick: accion }, ico(icono), texto);
      return h('div', { class: 'pl-grupo' }, fila, h('div', { class: 'pl-opciones', role: 'group', 'aria-label': 'Qué hace primero ' + pi.apodo },
        opcion('Sus órdenes', 'lista', !x.rumbo, () => { marcarRumbo(datos, p, pi.id, null); pintar(); }),
        opcion('Aguantar acá', 'escudo', !!(x.rumbo && x.rumbo.espera), () => { marcarRumbo(datos, p, pi.id, { espera: true }); pintar(); }),
        h('span', { class: 'pl-opcion fija' + (x.rumbo && !x.rumbo.espera ? ' activa' : '') }, ico('mira'), 'Ir a un punto: tocá el mapa')));
    }));
  };
  const pintar = () => { dibujar(); pintarLista(); };

  lienzo.addEventListener('click', (e) => {
    const r = lienzo.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * ancho), y = Math.floor(((e.clientY - r.top) / r.height) * alto);
    // tocar la ficha de otro: lo elige. En la zona verde: lo ubica. En cualquier otro lado: le marca el rumbo.
    const otro = salen.find((pi) => pi.id !== VISTA.sel && P[pi.id].casilla[0] === x && P[pi.id].casilla[1] === y);
    const mio = P[VISTA.sel];
    if (otro) VISTA.sel = otro.id;
    else if (zona.has(x + ',' + y)) ubicar(datos, p, VISTA.sel, x, y);
    else if (mio.rumbo && mio.rumbo.x === x && mio.rumbo.y === y) marcarRumbo(datos, p, VISTA.sel, null);
    else marcarRumbo(datos, p, VISTA.sel, { x, y });
    pintar();
  });

  armarBase();
  pintar();
  const alCambiar = () => { armarBase(); dibujar(); };
  window.addEventListener('resize', alCambiar);
  return () => window.removeEventListener('resize', alCambiar);
}
