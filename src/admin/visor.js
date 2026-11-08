// Taller > Sprites: el mecha armado pieza por pieza, en grande, girando y caminando.
// Tambien carga arte nuevo (PNG sueltos) para verlo montado antes de meterlo en el juego:
// las imagenes nuevas se toman como piezas "de papel" de 32x32 (todas con el centro en el centro del mecha).
import { h, boton, panel, iconoParte } from '../ui/comun.js';
import { ENCAJES, normalizarPieza } from '../motor/unidades.js';
import { mechaDeClase } from '../campana/reclutas.js';
import { fichaDe } from '../ui/hangar.js';
import { dibujarMechaVisor } from '../vista/dibujo.js';
import { SPR, UNI, TER, pintarEquipo } from '../vista/sprites.js';
import * as C from './carpeta.js';

const NOMBRE_ENCAJE = { cabeza: 'Cabeza', torso: 'Torso', piernas: 'Piernas', brazo_der: 'Brazo der.', brazo_izq: 'Brazo izq.', mochila: 'Mochila' };
const V = { clase: 'vanguardia', mecha: null, color: 'azul', angulo: 270, zoom: 1, caminar: true, fondo: 'piso', pruebas: {}, nuevos: [] };
V.zoom = 2;

// Una imagen nueva pasa a ser un sprite del juego (para los dos bandos), como pieza de papel de 32x32
function registrarNuevo(id, im, config) {
  // una sola version dibujada: el color de equipo se pinta solo (reglas.arte.color_equipo)
  for (const color of ['azul', 'rojo', 'verde']) SPR.imgs[color + '/' + id] = pintarEquipo(im, color, config);
  // 32 pixeles = una casilla (24 unidades del dibujo)
  const f = (SPR.escala || 2) * (24 / 32);
  SPR.meta[id] = { w: im.width * f, h: im.height * f, ancla: [im.width * f / 2, im.height * f / 2], papel: true };
  SPR.listo = true;
}

const cargarImagen = (archivo) => new Promise((ok) => {
  const im = new Image();
  im.onload = () => ok(im);
  im.onerror = () => ok(null);
  im.src = URL.createObjectURL(archivo);
});

export function pestanaVisor(T, raiz) {
  const d = T.datos;
  if (!V.mecha) V.mecha = mechaDeClase(d, V.clase);
  const lado = 288;
  const lienzo = h('canvas', { width: lado * 2, height: lado * 2, class: 'tl-visor', style: 'width:' + lado + 'px;height:' + lado + 'px' });
  const ctx = lienzo.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const ficha = () => {
    const f = fichaDe(d, { id: 'v', clase: V.clase, nivel: 1, mecha: V.mecha, gambits: [], bajas: 0 });
    f.bando = V.color === 'rojo' ? 1 : 0;
    for (const [slot, id] of Object.entries(V.pruebas)) if (id) f.apariencia[slot] = id; // arte nuevo a prueba
    return f;
  };

  let t0 = performance.now(), activo = true, golpe = 0;
  const dibujar = (t) => {
    if (!activo) return;
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.clearRect(0, 0, lado, lado);
    // fondo: piso del juego, oscuro o damero (para ver bordes)
    if (V.fondo === 'piso' && TER.imgs.piso_a) { const pat = ctx.createPattern(TER.imgs.piso_a, 'repeat'); ctx.fillStyle = pat; ctx.fillRect(0, 0, lado, lado); }
    else if (V.fondo === 'damero') { for (let y = 0; y < lado; y += 12) for (let x = 0; x < lado; x += 12) { ctx.fillStyle = (x + y) / 12 % 2 ? '#3a3a3a' : '#555'; ctx.fillRect(x, y, 12, 12); } }
    else { ctx.fillStyle = '#0b0f0c'; ctx.fillRect(0, 0, lado, lado); }
    // la casilla del juego (lo que ocupa un mecha), de referencia
    const casilla = (lado / 34) * 24 * V.zoom * 0.5;
    ctx.strokeStyle = 'rgba(143,220,90,.35)'; ctx.setLineDash([3, 3]);
    ctx.strokeRect(lado / 2 - casilla, lado / 2 - casilla, casilla * 2, casilla * 2); ctx.setLineDash([]);
    const paso = V.caminar ? ((t - t0) / 700) % 1 : 0.25;
    golpe = Math.max(0, golpe - 0.03);
    ctx.imageSmoothingEnabled = false;
    dibujarMechaVisor(ctx, ficha(), lado, { ang: (V.angulo * Math.PI) / 180, paso, golpe, zoom: V.zoom * 0.5 });
    requestAnimationFrame(dibujar);
  };
  requestAnimationFrame(dibujar);

  // ---- armado
  const partesDe = (enc) => Object.entries(d.partes).filter(([, p]) => p.encaje === (enc.startsWith('brazo') ? 'brazo' : enc));
  const armado = h('div', { class: 'tl-armado' });
  const pintarArmado = () => armado.replaceChildren(
    h('label', {}, 'Clase ', h('select', { onchange: (e) => { V.clase = e.target.value; V.mecha = mechaDeClase(d, V.clase); pintarArmado(); } },
      ...Object.entries(d.clases).map(([id, c]) => h('option', { value: id, ...(id === V.clase ? { selected: true } : {}) }, c.nombre || id)))),
    ...ENCAJES.map((enc) => {
      const actual = normalizarPieza(V.mecha[enc]);
      return h('div', { class: 'tl-slot' },
        actual ? iconoParte(d, actual.parte, 'tl-icono') : h('span', { class: 'tl-icono vacio' }),
        h('label', {}, NOMBRE_ENCAJE[enc] + ' ', h('select', { onchange: (e) => { V.mecha[enc] = e.target.value ? { parte: e.target.value, afijos: [] } : null; pintarArmado(); } },
          h('option', { value: '' }, '—'),
          ...partesDe(enc).map(([id, p]) => h('option', { value: id, ...(actual && actual.parte === id ? { selected: true } : {}) },
            (p.nombre || id) + ' · ' + (p.rareza || '') + ' · sprite: ' + (p.sprite || '—'))))));
    }));
  pintarArmado();

  // ---- vista
  const control = (etiqueta, campo) => h('label', {}, etiqueta + ' ', campo);
  const vista = h('div', { class: 'tl-config' },
    control('Bando', h('select', { onchange: (e) => { V.color = e.target.value; } }, ...['azul', 'rojo'].map((c) => h('option', { value: c, ...(V.color === c ? { selected: true } : {}) }, c === 'azul' ? 'Nuestro (azul)' : 'Enemigo (rojo)')))),
    control('Giro', h('input', { type: 'range', min: 0, max: 359, value: V.angulo, oninput: (e) => { V.angulo = Number(e.target.value); } })),
    control('Zoom', h('input', { type: 'range', min: 1, max: 6, step: 0.5, value: V.zoom, oninput: (e) => { V.zoom = Number(e.target.value); } })),
    control('Fondo', h('select', { onchange: (e) => { V.fondo = e.target.value; } }, ...[['piso', 'Piso del juego'], ['oscuro', 'Oscuro'], ['damero', 'Damero']].map(([v, t]) => h('option', { value: v, ...(V.fondo === v ? { selected: true } : {}) }, t)))),
    h('label', {}, h('input', { type: 'checkbox', ...(V.caminar ? { checked: true } : {}), onchange: (e) => { V.caminar = e.target.checked; } }), ' Caminando'),
    boton('Golpe', () => { golpe = 1; }, { clase: 'secundario compacto' }));

  // ---- arte nuevo
  const listaNuevos = h('div', { class: 'tl-nuevos' });
  const pintarNuevos = () => {
    const usados = new Map();
    for (const [id, p] of Object.entries(d.partes)) if (p.sprite) usados.set(p.sprite, (usados.get(p.sprite) || []).concat(id));
    listaNuevos.replaceChildren(...V.nuevos.map(({ id, im }) => h('div', { class: 'tl-nuevo' },
      h('img', { src: im.src, alt: id, class: 'tl-mini' }),
      h('div', {},
        h('strong', {}, id), h('small', {}, ' ' + im.width + '×' + im.height + (im.width !== 32 || im.height !== 32 ? ' (¿no era 32×32?)' : '')),
        h('div', { class: 'ayuda' }, usados.has(id) ? 'Lo usan: ' + usados.get(id).join(', ') : 'Ninguna pieza lo usa todavía (asignalo en Piezas y datos → sprite).'),
        h('label', {}, 'Probar como ', h('select', { onchange: (e) => {
          for (const s of Object.keys(V.pruebas)) if (V.pruebas[s] === id) delete V.pruebas[s];
          if (e.target.value) { V.pruebas[e.target.value] = id; if (e.target.value === 'brazo_der') V.pruebas.brazo_izq = id; }
        } }, h('option', { value: '' }, '—'), ...ENCAJES.map((s) => h('option', { value: s, ...(V.pruebas[s] === id ? { selected: true } : {}) }, NOMBRE_ENCAJE[s]))))))));
  };
  const sumarArchivos = async (archivos) => {
    for (const a of archivos) {
      const im = await cargarImagen(a.archivo || a);
      if (!im) continue;
      const id = (a.nombre || a.name.replace(/\.png$/i, ''));
      registrarNuevo(id, im, (d.reglas.arte || {}).color_equipo);
      V.nuevos = V.nuevos.filter((x) => x.id !== id).concat({ id, im });
    }
    pintarNuevos();
    T.aviso(V.nuevos.length + ' imagen(es) cargadas para probar (no se guardan en el juego).', 'bien');
  };
  pintarNuevos();

  // ---- galeria de unidades enemigas (sprites enteros)
  const galeria = h('div', { class: 'tl-galeria' }, ...Object.keys(UNI.imgs).sort().map((id) => {
    const im = UNI.imgs[id];
    return h('figure', {}, h('img', { src: im.src, alt: id, class: 'tl-mini' }), h('figcaption', {}, id));
  }));

  raiz.append(h('div', { class: 'tl-columnas' },
    h('div', { class: 'tl-izq' },
      panel('Armado', armado),
      panel('Arte nuevo (para probar)',
        h('p', { class: 'ayuda' }, 'PNG de 32×32 con el centro del mecha en el centro del cuadro. El brazo y la pierna, del lado derecho: el izquierdo es el mismo espejado. El nombre del archivo es el nombre del sprite. Color de equipo: lo pintado con verde puro (#00ff00 luz, #00c000 medio, #008000 sombra) se vuelve azul o rojo solo.'),
        h('div', { class: 'tl-controles' },
          C.hayAcceso() ? boton('Leer arte/partes', async () => sumarArchivos(await C.listarImagenes('arte/partes')), { iconoNombre: 'hangar', clase: 'secundario compacto' }) : null,
          C.hayAcceso() ? boton('Leer assets/iconos', async () => sumarArchivos(await C.listarImagenes('assets/iconos')), { iconoNombre: 'estrella', clase: 'secundario compacto' }) : null,
          h('label', { class: 'boton secundario compacto' }, 'Elegir archivos…', h('input', { type: 'file', accept: 'image/png', multiple: true, hidden: true, onchange: (e) => sumarArchivos([...e.target.files]) }))),
        listaNuevos)),
    h('div', { class: 'tl-der' },
      panel('Vista', h('div', { class: 'tl-visor-caja' }, lienzo), vista,
        h('p', { class: 'ayuda' }, 'El recuadro punteado es una casilla del mapa: lo que ocupa un mecha.')),
      panel('Unidades enemigas', galeria))));

  return () => { activo = false; };
}
