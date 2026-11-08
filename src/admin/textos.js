// Taller > Textos e idiomas: todas las frases del juego en una tabla, con una columna por idioma.
// El castellano se guarda en su archivo de siempre (data/charlas.json, data/lore.json...); cada traduccion va en
// data/idiomas/<codigo>.json (ver src/core/idiomas.js). En las listas de frases se pueden sumar o quitar frases.
import { h, boton, panel } from '../ui/comun.js';
import { TABLAS_DE_TEXTO, textosDe, leerRuta, ponerRuta } from '../core/idiomas.js';
import * as C from './carpeta.js';

const X = { tabla: 'charlas', idioma: '', busca: '', faltan: false, mostrar: 150, idiomas: null, sucios: new Set() };

async function cargarIdiomas() {
  X.idiomas = {};
  const codigos = new Set(['en']);
  for (const im of await C.listarJSON('data/idiomas')) codigos.add(im);
  for (const c of codigos) {
    try { X.idiomas[c] = await C.leerJSON('data/idiomas/' + c + '.json'); } catch { /* todavia no existe */ }
  }
  if (!X.idioma) X.idioma = Object.keys(X.idiomas)[0] || '';
}

export function pestanaTextos(T, raiz) {
  const tablas = TABLAS_DE_TEXTO.filter((t) => T.crudos[t]);
  if (!tablas.includes(X.tabla)) X.tabla = tablas[0];
  const cuerpo = h('div', { class: 'tl-textos' });
  const estado = h('span', { class: 'chip' });

  const idiomaActual = () => (X.idioma && X.idiomas[X.idioma]) || null;
  const traduccion = (ruta) => { const I = idiomaActual(); return I && I.textos && I.textos[X.tabla] ? I.textos[X.tabla][ruta] || '' : ''; };

  const pintar = () => {
    const filas = textosDe(T.crudos[X.tabla]);
    const q = X.busca.toLowerCase();
    const vis = filas.filter((f) => (!q || f.valor.toLowerCase().includes(q) || f.ruta.toLowerCase().includes(q) || traduccion(f.ruta).toLowerCase().includes(q)) &&
      (!X.faltan || !traduccion(f.ruta)));
    const I = idiomaActual();
    const hechas = I ? filas.filter((f) => traduccion(f.ruta)).length : 0;
    estado.textContent = filas.length + ' textos' + (I ? ' · ' + (I.nombre || X.idioma) + ': ' + hechas + ' traducidos (' + Math.round((hechas * 100) / (filas.length || 1)) + '%)' : '');
    cuerpo.replaceChildren(
      h('table', { class: 'tl-tabla-textos' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Dónde'), h('th', {}, 'Castellano'), I ? h('th', {}, I.nombre || X.idioma) : null)),
        h('tbody', {}, ...vis.slice(0, X.mostrar).map((f) => fila(f, I)))),
      vis.length > X.mostrar ? boton('Mostrar más (' + (vis.length - X.mostrar) + ')', () => { X.mostrar += 300; pintar(); }, { clase: 'secundario compacto' }) : null);
  };

  const fila = (f, I) => {
    const ks = f.ruta.split('.');
    const enLista = /^\d+$/.test(ks.at(-1));
    const es = h('textarea', { rows: Math.max(1, Math.ceil(f.valor.length / 60)), onchange: (e) => {
      ponerRuta(T.crudos[X.tabla], f.ruta, e.target.value); T.rearmar(X.tabla); X.sucios.add(X.tabla); marcar();
    } }, f.valor);
    const tr = I ? h('textarea', { rows: Math.max(1, Math.ceil(f.valor.length / 60)), placeholder: '(sin traducir)', onchange: (e) => {
      I.textos = I.textos || {};
      I.textos[X.tabla] = I.textos[X.tabla] || {};
      if (e.target.value) I.textos[X.tabla][f.ruta] = e.target.value; else delete I.textos[X.tabla][f.ruta];
      X.sucios.add('idioma:' + X.idioma); marcar();
    } }, traduccion(f.ruta)) : null;
    const acciones = enLista ? h('span', { class: 'tl-acciones' },
      h('button', { class: 'boton-icono', title: 'Sumar una frase después', 'aria-label': 'Sumar frase', onclick: () => {
        const lista = leerRuta(T.crudos[X.tabla], ks.slice(0, -1).join('.'));
        lista.splice(Number(ks.at(-1)) + 1, 0, f.valor);
        T.rearmar(X.tabla); X.sucios.add(X.tabla); marcar(); pintar();
      } }, '+'),
      h('button', { class: 'boton-icono', title: 'Quitar esta frase', 'aria-label': 'Quitar frase', onclick: () => {
        const lista = leerRuta(T.crudos[X.tabla], ks.slice(0, -1).join('.'));
        if (lista.length <= 1) { T.aviso('Tiene que quedar al menos una frase.', 'error'); return; }
        lista.splice(Number(ks.at(-1)), 1);
        T.rearmar(X.tabla); X.sucios.add(X.tabla); marcar(); pintar();
      } }, '×')) : null;
    return h('tr', {}, h('td', { class: 'tl-ruta' }, h('code', {}, f.ruta), acciones), h('td', {}, es), tr ? h('td', {}, tr) : null);
  };

  const guardarTodo = async () => {
    for (const s of [...X.sucios]) {
      if (s.startsWith('idioma:')) {
        const c = s.slice(7);
        await C.guardarJSON('data/idiomas/' + c + '.json', X.idiomas[c]);
      } else if (!(await T.guardar(s))) return;
      X.sucios.delete(s);
    }
    marcar();
    T.aviso('Textos guardados.', 'bien');
  };
  const botonGuardar = boton('Guardar textos', guardarTodo, { iconoNombre: 'estrella', clase: 'principal compacto' });
  const marcar = () => { botonGuardar.classList.toggle('urgente', X.sucios.size > 0); botonGuardar.lastChild.textContent = X.sucios.size ? 'Guardar textos (' + X.sucios.size + ')' : 'Guardar textos'; };

  const selIdioma = h('select', { onchange: (e) => { X.idioma = e.target.value; pintar(); } });
  const pintarIdiomas = () => selIdioma.replaceChildren(h('option', { value: '' }, 'Solo castellano'),
    ...Object.entries(X.idiomas || {}).map(([c, I]) => h('option', { value: c, ...(c === X.idioma ? { selected: true } : {}) }, (I.nombre || c) + ' (' + c + ')')));

  raiz.append(panel('Textos e idiomas',
    h('p', { class: 'ayuda' }, 'Cada fila es un texto del juego. Lo de la izquierda dice en qué archivo y en qué parte está. En las listas de frases, + suma una frase y × la quita. Para probar un idioma en el juego: abrilo con ?idioma=en al final de la dirección. Los textos de los botones y pantallas (los que están en el código) todavía no se traducen.'),
    h('div', { class: 'tl-filtros' },
      h('select', { onchange: (e) => { X.tabla = e.target.value; X.mostrar = 150; pintar(); } }, ...tablas.map((t) => h('option', { value: t, ...(t === X.tabla ? { selected: true } : {}) }, t + '.json'))),
      h('input', { type: 'search', placeholder: 'Buscar texto...', value: X.busca, oninput: (e) => { X.busca = e.target.value; X.mostrar = 150; pintar(); } }),
      selIdioma,
      boton('Nuevo idioma', () => {
        const c = (prompt('Código del idioma (ej: en, pt, fr):') || '').trim().toLowerCase();
        if (!/^[a-z]{2}(-[a-z]{2})?$/.test(c) || X.idiomas[c]) return;
        const nombre = prompt('Nombre del idioma (ej: English):') || c;
        X.idiomas[c] = { _ayuda: 'Traducciones del juego. Ver src/core/idiomas.js. Se edita desde el taller (admin.html).', nombre, textos: {} };
        X.idioma = c; X.sucios.add('idioma:' + c); pintarIdiomas(); marcar(); pintar();
      }, { iconoNombre: 'mas', clase: 'secundario compacto' }),
      h('label', {}, h('input', { type: 'checkbox', ...(X.faltan ? { checked: true } : {}), onchange: (e) => { X.faltan = e.target.checked; pintar(); } }), ' Solo sin traducir'),
      estado, botonGuardar),
    cuerpo));

  (async () => {
    if (!X.idiomas) await cargarIdiomas();
    pintarIdiomas(); marcar(); pintar();
  })();
}
