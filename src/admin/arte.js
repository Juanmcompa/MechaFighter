// Taller > Arte: el inventario. Cada pieza con sus dibujos (icono, sprite, colores, relieve, brillo) y su estado:
// propio, prestado de otra pieza o sin dibujo. Mas enemigos, retratos, terreno y los archivos que nadie usa.
// Solo mira: no guarda nada. La cuenta la hace inventario.js (la misma de tools/inventario-arte.mjs).
import { h, boton, panel } from '../ui/comun.js';
import { inventario, rutasEsperadas } from './inventario.js';
import * as C from './carpeta.js';

const X = { filtro: 'todo', bando: '', busca: '', inv: null, cargando: false };
const ESTADO = { propio: ['Propio', 'bien'], prestado: ['Prestado', 'ambar'], falta: ['Sin dibujo', 'mal'], ninguno: ['No lleva', ''] };
const FILTROS = [
  ['todo', 'Todas', () => true],
  ['falta', 'Falta arte', (p) => p.estado === 'prestado' || p.estado === 'falta'],
  ['provisoria', 'Provisorias', (p) => p.provisoria],
  ['icono', 'Sin ícono', (p) => !p.icono && p.estado !== 'ninguno'],
  ['avisos', 'Con avisos', (p) => p.avisos.length > 0]
];

async function leerMeta(ruta) { try { return await C.leerJSON(ruta); } catch { return null; } }

// Con carpeta elegida se lista todo assets/ (y se ve lo que sobra); sin carpeta, se prueba archivo por archivo
async function armar(datos) {
  const meta = { sprites: await leerMeta('assets/mecha/sprites.json'), unidades: await leerMeta('assets/unidades/unidades.json'), terreno: await leerMeta('assets/terreno/terreno.json') };
  const todo = await C.listarTodo('assets');
  if (todo) return inventario(datos, meta, new Set(todo), true);
  const esperadas = rutasEsperadas(datos, meta);
  const estan = await Promise.all(esperadas.map((r) => fetch(r, { method: 'HEAD', cache: 'no-cache' }).then((x) => x.ok).catch(() => false)));
  return inventario(datos, meta, new Set(esperadas.filter((_, i) => estan[i])), false);
}

export function pestanaArte(T, raiz) {
  const cuerpo = h('div', { class: 'tl-arte' });
  raiz.append(cuerpo);
  const datos = T.datos;

  const celda = (hay, ruta, opcional) => h('td', { class: 'ar-celda' },
    hay ? h('img', { src: ruta, alt: 'sí', loading: 'lazy', class: 'ar-mini' })
      : h('span', { class: opcional ? 'ar-no' : 'ar-falta', title: opcional ? 'No está (es opcional)' : 'Falta' }, opcional ? '—' : '✗'));
  const marca = (hay, texto) => h('td', { class: 'ar-celda' }, h('span', { class: hay ? 'bien' : 'ar-no', title: hay ? 'Está' : texto }, hay ? '✓' : '—'));

  function fila(p) {
    const [rotulo, clase] = ESTADO[p.estado];
    const sprite = 'assets/mecha/azul/' + p.sprite + '.png';
    return h('tr', { class: p.avisos.length ? 'con-aviso' : '' },
      h('td', {}, h('strong', {}, p.nombre), h('small', {}, p.id + (p.bando ? ' · ' + p.bando : ''))),
      h('td', {}, h('span', { class: 'ar-estado ' + clase }, rotulo), p.provisoria ? h('span', { class: 'ar-estado' }, 'Provisoria') : null,
        p.prestadoDe ? h('small', {}, 'de ' + p.prestadoDe) : null),
      celda(p.icono, 'assets/iconos/' + p.id + '.png', p.estado === 'ninguno'),
      p.estado === 'ninguno' ? h('td', { class: 'ar-celda', colspan: '5' }, h('span', { class: 'ar-no' }, 'esta pieza no lleva dibujo'))
        : [celda(p.azul, sprite),
          marca(p.rojo, 'No está: el rojo se pinta solo a partir del azul'), marca(p.verde, 'No está: el verde se pinta solo a partir del azul'),
          marca(p.relieve, 'Sin relieve propio (' + p.sprite + '_n.png): se calcula solo'), marca(p.brillo, 'Sin brillos (' + p.sprite + '_e.png)')],
      h('td', { class: 'ar-avisos' }, ...p.avisos.map((a) => h('p', {}, a))));
  }

  function pintar() {
    const I = X.inv;
    if (!I) {
      cuerpo.replaceChildren(panel('Arte', h('p', { class: 'ayuda' }, X.cargando ? 'Mirando los archivos…' : 'Sin datos.')));
      return;
    }
    const R = I.resumen;
    const bandos = [...new Set(I.piezas.map((p) => p.bando).filter(Boolean))].sort();
    const pasa = FILTROS.find((f) => f[0] === X.filtro)[2];
    const busca = X.busca.trim().toLowerCase();
    const lista = I.piezas.filter((p) => pasa(p) && (!X.bando || p.bando === X.bando) && (!busca || (p.nombre + ' ' + p.id).toLowerCase().includes(busca)));
    const numero = (n, texto, clase = '') => h('div', { class: 'ar-numero ' + clase }, h('strong', {}, String(n)), h('span', {}, texto));
    const problemas = [...I.raros, ...I.sobran];
    const enemigosMal = I.unidades.filter((u) => u.faltan.length || u.sinAnotar.length);

    cuerpo.replaceChildren(...[
      panel('Inventario de arte',
        h('div', { class: 'ar-resumen' },
          numero(R.piezas, 'piezas'), numero(R.propias, 'con arte propio', 'bien'), numero(R.prestadas, 'con arte prestado', 'ambar'),
          numero(R.sinDibujo, 'sin dibujo', R.sinDibujo ? 'mal' : ''), numero(R.provisorias, 'provisorias'), numero(R.sinIcono, 'sin ícono'),
          numero(I.completo ? R.sobran + R.raros : '?', 'archivos sueltos', R.sobran + R.raros ? 'ambar' : '')),
        I.completo ? null : h('p', { class: 'ayuda' }, 'Para ver también los archivos que sobran o están mal nombrados, elegí la carpeta del proyecto (arriba).'),
        h('div', { class: 'tl-controles' },
          boton('Volver a mirar', cargar, { iconoNombre: 'dado', clase: 'secundario compacto' }))),

      panel('Piezas (' + lista.length + ' de ' + I.piezas.length + ')',
        h('div', { class: 'tl-controles' },
          ...FILTROS.map(([id, nombre, f]) => h('button', { class: 'pestana' + (X.filtro === id ? ' activa' : ''), 'aria-pressed': X.filtro === id ? 'true' : 'false',
            onclick: () => { X.filtro = id; pintar(); } }, nombre + ' · ' + I.piezas.filter(f).length)),
          h('select', { 'aria-label': 'Bando', onchange: (e) => { X.bando = e.target.value; pintar(); } },
            h('option', { value: '' }, 'Todos los bandos'), ...bandos.map((b) => h('option', { value: b, ...(X.bando === b ? { selected: '' } : {}) }, b))),
          h('input', { type: 'search', placeholder: 'Buscar pieza…', 'aria-label': 'Buscar pieza', value: X.busca,
            oninput: (e) => { X.busca = e.target.value; clearTimeout(pintar.t); pintar.t = setTimeout(() => { pintar(); const i = cuerpo.querySelector('input[type=search]'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 250); } })),
        h('div', { class: 'ar-rollo' }, h('table', { class: 'ar-tabla' },
          h('thead', {}, h('tr', {}, ...['Pieza', 'Estado', 'Ícono', 'Sprite', 'Rojo', 'Verde', 'Relieve', 'Brillo', 'Avisos'].map((t) => h('th', { scope: 'col' }, t)))),
          h('tbody', {}, ...lista.map(fila)))),
        h('p', { class: 'ayuda' }, 'Rojo y verde: si no están, el juego los pinta solo a partir del azul. Relieve y brillo son opcionales.')),

      panel('Enemigos, retratos y terreno',
        h('ul', { class: 'ar-lista' },
          h('li', {}, h('strong', {}, 'Enemigos: '), I.unidades.length + ' · ' + (enemigosMal.length ? enemigosMal.length + ' con problemas' : 'todos con sus dibujos')),
          ...enemigosMal.map((u) => h('li', { class: 'mal' }, u.nombre + ' (' + u.id + '): ' + (u.faltan.length ? 'faltan ' + u.faltan.join(', ') : '') + (u.sinAnotar.length ? ' sin anotar en unidades.json: ' + u.sinAnotar.join(', ') : ''))),
          h('li', {}, h('strong', {}, 'Retratos: '), (I.retratos.cuantos - I.retratos.faltan.length) + ' de ' + I.retratos.cuantos),
          ...I.retratos.faltan.map((r) => h('li', { class: 'mal' }, 'Falta ' + r)),
          h('li', {}, h('strong', {}, 'Terreno: '), (I.terreno.cuantos - I.terreno.faltan.length) + ' de ' + I.terreno.cuantos),
          ...I.terreno.faltan.map((r) => h('li', { class: 'mal' }, 'Falta assets/terreno/' + r + '.png')),
          ...I.avisos.map((a) => h('li', { class: 'mal' }, a)))),

      I.completo ? panel('Archivos sueltos (' + problemas.length + ')',
        problemas.length ? h('div', { class: 'ar-rollo' }, h('table', { class: 'ar-tabla' },
          h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, ''), h('th', { scope: 'col' }, 'Archivo'), h('th', { scope: 'col' }, 'Qué pasa'))),
          h('tbody', {}, ...problemas.map((x) => h('tr', {},
            h('td', { class: 'ar-celda' }, /\.png$/i.test(x.ruta) ? h('img', { src: x.ruta, alt: '', loading: 'lazy', class: 'ar-mini' }) : null),
            h('td', {}, x.ruta), h('td', {}, x.motivo))))))
          : h('p', { class: 'bien' }, 'Nada suelto: todo lo que hay en assets/ lo usa alguien.')) : null
    ].filter(Boolean));
  }

  async function cargar() {
    X.cargando = true; X.inv = null; pintar();
    try { X.inv = await armar(datos); } catch (e) { cuerpo.replaceChildren(panel('Arte', h('p', { class: 'error' }, 'No se pudo armar el inventario: ' + e.message))); X.cargando = false; return; }
    X.cargando = false; pintar();
  }
  cargar();
}
