// Taller > Piezas y datos: alta, baja y modificacion de piezas, enemigos, escuadras, clases, habilidades y misiones.
// Cada cambio se valida con las mismas reglas que el juego al arrancar; si algo queda mal, no deja guardar.
import { h, boton, panel, iconoParte } from '../ui/comun.js';
import { dibujarMechaFicha } from '../vista/dibujo.js';
import { mechaDeClase } from '../campana/reclutas.js';
import { fichaDe } from '../ui/hangar.js';
import { UNI } from '../vista/sprites.js';

// [nombre, tabla, ruta dentro del archivo (vacia = la raiz)]
const COLECCIONES = [
  ['Piezas de mecha', 'partes', []],
  ['Enemigos', 'enemigos', ['unidades']],
  ['Escuadras enemigas', 'enemigos', ['escuadras']],
  ['Clases', 'clases', []],
  ['Habilidades', 'habilidades', []],
  ['Tipos de misión', 'misiones', []],
  ['Personalidades', 'personalidades', []]
];
const S = { col: 0, sel: null, busca: '', encaje: '', rareza: '' };

const copiar = (o) => JSON.parse(JSON.stringify(o));

export function pestanaDatos(T, raiz) {
  const [nombreCol, tabla, ruta] = COLECCIONES[S.col];
  const contenedor = () => ruta.reduce((o, k) => o[k], T.crudos[tabla]);
  const items = () => Object.entries(contenedor()).filter(([k]) => !k.startsWith('_'));
  const cambiado = () => { T.rearmar(tabla); pintarLista(); pintarErrores(); };

  const lista = h('ul', { class: 'tl-lista' });
  const editor = h('div', { class: 'tl-editor' });
  const errores = h('div', { class: 'tl-errores' });

  const pintarErrores = () => {
    const e = T.validar();
    errores.replaceChildren(e.length
      ? h('details', { class: 'error' }, h('summary', {}, e.length + ' problema(s) en los datos (no se puede guardar así)'), h('ul', {}, ...e.slice(0, 30).map((x) => h('li', {}, x))))
      : h('p', { class: 'bien' }, 'Los datos están bien.'));
  };

  const pintarLista = () => {
    const q = S.busca.toLowerCase();
    const filtrados = items().filter(([id, v]) => (!q || id.includes(q) || String(v.nombre || '').toLowerCase().includes(q)) &&
      (!S.encaje || v.encaje === S.encaje) && (!S.rareza || v.rareza === S.rareza));
    lista.replaceChildren(...filtrados.map(([id, v]) => h('li', {},
      h('button', { class: 'tl-item' + (id === S.sel ? ' activa' : ''), onclick: () => { S.sel = id; pintarLista(); pintarEditor(); } },
        tabla === 'partes' ? iconoParte(T.datos, id, 'tl-icono') : null,
        h('span', {}, h('strong', {}, v.nombre || id), h('small', {}, id + (v.rareza ? ' · ' + v.rareza : '') + (v.encaje ? ' · ' + v.encaje : '')))))));
  };

  // Un campo editable segun su tipo
  const campo = (obj, k, alCambiar) => {
    const v = obj[k];
    if (typeof v === 'number') return h('input', { type: 'number', value: v, step: 'any', onchange: (e) => { obj[k] = Number(e.target.value); alCambiar(); } });
    if (typeof v === 'boolean') return h('input', { type: 'checkbox', ...(v ? { checked: true } : {}), onchange: (e) => { obj[k] = e.target.checked; alCambiar(); } });
    if (typeof v === 'string') return h('input', { type: 'text', value: v, onchange: (e) => { obj[k] = e.target.value; alCambiar(); } });
    const area = h('textarea', { rows: Math.min(8, JSON.stringify(v, null, 1).split('\n').length + 1), spellcheck: 'false' }, JSON.stringify(v, null, 1));
    area.onchange = () => {
      try { obj[k] = JSON.parse(area.value); area.classList.remove('mal'); alCambiar(); }
      catch (e) { area.classList.add('mal'); T.aviso(k + ': no es un valor válido (' + e.message + ')', 'error'); }
    };
    return area;
  };

  const vistaPrevia = (id) => {
    if (tabla === 'partes') {
      const p = T.datos.partes[id];
      if (!p) return null;
      const lienzo = h('canvas', { width: 192, height: 192, class: 'tl-previa' });
      const clase = Object.keys(T.datos.clases)[0];
      const mecha = mechaDeClase(T.datos, clase);
      const slot = p.encaje === 'brazo' ? 'brazo_der' : p.encaje;
      mecha[slot] = { parte: id, afijos: [] };
      if (p.encaje === 'brazo') mecha.brazo_izq = { parte: id, afijos: [] };
      try {
        const c = lienzo.getContext('2d'); c.imageSmoothingEnabled = false;
        dibujarMechaFicha(c, fichaDe(T.datos, { id: 'x', clase, nivel: 1, mecha, gambits: [] }), 192);
      } catch { /* pieza a medio armar */ }
      return h('div', { class: 'tl-previas' }, iconoParte(T.datos, id, 'tl-icono-grande'), lienzo);
    }
    if (tabla === 'enemigos' && ruta[0] === 'unidades') {
      const u = T.datos.enemigos.unidades[id];
      const ids = u ? [u.sprite].concat(u.sprites || [], (u.figuras || []).slice(0, 4)).filter((x) => UNI.imgs[x]) : [];
      return h('div', { class: 'tl-previas' }, ...ids.map((x) => h('img', { src: UNI.imgs[x].src, alt: x, class: 'tl-mini', title: x })));
    }
    return null;
  };

  const pintarEditor = () => {
    const obj = S.sel && contenedor()[S.sel];
    if (!obj) { editor.replaceChildren(h('p', { class: 'ayuda' }, 'Elegí algo de la lista, o creá uno nuevo.')); return; }
    const filas = Object.keys(obj).map((k) => h('div', { class: 'tl-campo' },
      h('label', {}, k), campo(obj, k, cambiado),
      h('button', { class: 'boton-icono', title: 'Quitar el campo', 'aria-label': 'Quitar ' + k, onclick: () => { delete obj[k]; cambiado(); pintarEditor(); } }, '×')));
    const nuevoCampo = h('input', { type: 'text', placeholder: 'campo nuevo' });
    const nuevoValor = h('input', { type: 'text', placeholder: 'valor (número, texto o JSON)' });
    editor.replaceChildren(
      h('div', { class: 'tl-editor-cabecera' },
        h('h3', {}, obj.nombre || S.sel), h('code', {}, S.sel),
        boton('Duplicar', () => {
          const id = prompt('Id de la copia:', S.sel + '_copia');
          if (!id || contenedor()[id]) return;
          contenedor()[id] = copiar(obj); S.sel = id; cambiado(); pintarEditor();
        }, { clase: 'secundario compacto' }),
        boton('Renombrar id', () => {
          const id = prompt('Nuevo id (sin espacios ni tildes):', S.sel);
          if (!id || id === S.sel || contenedor()[id]) return;
          const usos = buscarUsos(T, S.sel);
          if (usos.length && !confirm('«' + S.sel + '» se usa en: ' + usos.join(', ') + '. Esos lugares no se cambian solos. ¿Renombrar igual?')) return;
          const c = contenedor(); const nuevo = {};
          for (const k of Object.keys(c)) nuevo[k === S.sel ? id : k] = c[k];
          for (const k of Object.keys(c)) delete c[k];
          Object.assign(c, nuevo); S.sel = id; cambiado(); pintarEditor();
        }, { clase: 'secundario compacto' }),
        boton('Borrar', () => {
          const usos = buscarUsos(T, S.sel);
          if (!confirm(usos.length ? '«' + S.sel + '» se usa en: ' + usos.join(', ') + '. ¿Borrar igual? (el juego va a marcar error)' : '¿Borrar «' + S.sel + '»?')) return;
          delete contenedor()[S.sel]; S.sel = null; cambiado(); pintarEditor();
        }, { clase: 'secundario compacto peligro' })),
      vistaPrevia(S.sel),
      h('div', { class: 'tl-campos' }, ...filas),
      h('div', { class: 'tl-campo nuevo' }, nuevoCampo, nuevoValor, boton('Agregar campo', () => {
        const k = nuevoCampo.value.trim(); if (!k) return;
        let v = nuevoValor.value; try { v = JSON.parse(v); } catch { /* texto */ }
        obj[k] = v; cambiado(); pintarEditor();
      }, { clase: 'secundario compacto' })));
  };

  const filtros = h('div', { class: 'tl-filtros' },
    h('select', { onchange: (e) => { S.col = Number(e.target.value); S.sel = null; S.encaje = ''; S.rareza = ''; raiz.replaceChildren(); pestanaDatos(T, raiz); } },
      ...COLECCIONES.map(([n], i) => h('option', { value: i, ...(i === S.col ? { selected: true } : {}) }, n))),
    h('input', { type: 'search', placeholder: 'Buscar...', value: S.busca, oninput: (e) => { S.busca = e.target.value; pintarLista(); } }),
    tabla === 'partes' ? h('select', { onchange: (e) => { S.encaje = e.target.value; pintarLista(); } },
      h('option', { value: '' }, 'Todos los encajes'), ...['cabeza', 'torso', 'piernas', 'brazo', 'mochila'].map((x) => h('option', { value: x, ...(S.encaje === x ? { selected: true } : {}) }, x))) : null,
    tabla === 'partes' ? h('select', { onchange: (e) => { S.rareza = e.target.value; pintarLista(); } },
      h('option', { value: '' }, 'Todas las rarezas'), ...['normal', 'raro', 'muy_raro', 'legendario', 'unico'].map((x) => h('option', { value: x, ...(S.rareza === x ? { selected: true } : {}) }, x))) : null,
    boton('Nuevo', () => {
      const id = prompt('Id (sin espacios ni tildes, ej: brazo_rifle_raro_01):');
      if (!id || contenedor()[id]) return;
      // arranca como copia del elegido (o del primero de la lista), para no empezar de cero
      const base = (S.sel && contenedor()[S.sel]) || (items()[0] || [])[1] || {};
      contenedor()[id] = { ...copiar(base), ...(base.nombre ? { nombre: 'Nuevo ' + (base.nombre || '') } : {}) };
      S.sel = id; cambiado(); pintarEditor();
    }, { iconoNombre: 'mas', clase: 'secundario compacto' }),
    boton('Guardar ' + tabla + '.json', async () => { if (await T.guardar(tabla)) pintarErrores(); }, { iconoNombre: 'estrella', clase: 'principal compacto' }));

  const ayuda = contenedor()._ayuda || T.crudos[tabla]._ayuda;
  raiz.append(
    panel(nombreCol, filtros, ayuda ? h('details', { class: 'ayuda' }, h('summary', {}, 'Qué es cada campo'), h('p', {}, ayuda)) : null, errores),
    h('div', { class: 'tl-columnas datos' }, h('div', { class: 'tl-izq' }, lista), h('div', { class: 'tl-der' }, editor)));
  pintarLista(); pintarEditor(); pintarErrores();
}

// Donde aparece un id en el resto de los datos (para avisar antes de borrar o renombrar)
function buscarUsos(T, id) {
  const re = new RegExp('"' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"');
  const usos = [];
  for (const [t, obj] of Object.entries(T.crudos)) {
    const sinPropio = JSON.stringify(obj).replace(new RegExp('"' + id + '":'), '');
    if (re.test(sinPropio)) usos.push(t);
  }
  return usos;
}
