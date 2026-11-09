// Taller del desarrollador (admin.html): una herramienta local para auditar antes de publicar.
//  - Batalla de prueba: armar un escuadron y enemigos a mano y mirar la pelea.
//  - Sprites: ver cada pieza montada en el mecha, girarla, animarla, y probar el arte nuevo desde una carpeta.
//  - Datos: ABM de piezas, enemigos, clases... con validacion antes de guardar.
//  - Textos: todas las frases del juego, editables, con columnas por idioma.
// Lee y escribe los archivos del proyecto (Chrome/Edge). Sin carpeta elegida, "Guardar" descarga el archivo.
import { h, montar, boton, ico } from '../ui/comun.js';
import { cargarDatos } from '../core/datos.js';
import { validarDatos } from '../core/validar.js';
import { cargarSprites, cargarTerreno, cargarUnidades } from '../vista/sprites.js';
import { cargarLuces } from '../vista/luz.js';
import * as C from './carpeta.js';
import { pestanaBatalla } from './batalla.js';
import { pestanaVisor } from './visor.js';
import { pestanaDatos } from './datos.js';
import { pestanaTextos } from './textos.js';

const raiz = document.getElementById('taller');

// El taller trabaja sobre una copia que se puede modificar (el juego congela los datos)
const T = {
  datos: null,     // datos para usar (copia editable, sin congelar)
  crudos: {},      // tabla -> JSON tal cual el archivo (con _ayuda), para guardar sin perder notas
  sucio: new Set(), // tablas con cambios sin guardar
  pestana: 'batalla',
  aviso: (texto, clase = '') => avisar(texto, clase)
};

const copiar = (o) => JSON.parse(JSON.stringify(o));

async function cargar() {
  const indice = await C.leerJSON('data/indice.json');
  T.crudos = {};
  for (const t of indice.tablas) T.crudos[t] = await C.leerJSON('data/' + t + '.json');
  const d = await cargarDatos(async (ruta) => {
    const t = ruta.replace(/^data\//, '').replace(/\.json$/, '');
    if (T.crudos[t]) return T.crudos[t];
    return C.leerJSON(ruta);
  });
  T.datos = copiar(d);
  T.indice = indice;
  T.sucio.clear();
}

// Recarga los datos editables desde los crudos (despues de editar)
T.rearmar = (tabla) => {
  const limpio = {};
  for (const k of Object.keys(T.crudos[tabla])) if (!k.startsWith('_')) limpio[k] = copiar(T.crudos[tabla][k]);
  T.datos[tabla] = limpio;
  T.sucio.add(tabla);
  pintarCabecera();
};

T.validar = () => validarDatos(T.datos);

T.guardar = async (tabla) => {
  const errores = T.validar();
  if (errores.length) {
    avisar('No se guardó: ' + errores.length + ' problema(s). ' + errores.slice(0, 3).join(' · '), 'error');
    return false;
  }
  const r = await C.guardarJSON('data/' + tabla + '.json', T.crudos[tabla]);
  T.sucio.delete(tabla);
  avisar(r === 'guardado' ? 'Guardado data/' + tabla + '.json' : 'Se descargó ' + tabla + '.json: reemplazalo en data/', 'bien');
  pintarCabecera();
  return true;
};

let cajaAviso, cabecera, cuerpo;
function avisar(texto, clase = '') {
  if (!cajaAviso) return;
  cajaAviso.textContent = texto;
  cajaAviso.className = 'taller-aviso ' + clase;
  clearTimeout(avisar.t);
  avisar.t = setTimeout(() => { cajaAviso.textContent = ''; cajaAviso.className = 'taller-aviso'; }, 7000);
}

const PESTANAS = [
  ['batalla', 'Batalla de prueba', 'espadas', pestanaBatalla],
  ['visor', 'Sprites', 'hangar', pestanaVisor],
  ['datos', 'Piezas y datos', 'llave', pestanaDatos],
  ['textos', 'Textos e idiomas', 'menu', pestanaTextos]
];

function pintarCabecera() {
  if (!cabecera) return;
  const recordada = T.recordada;
  cabecera.replaceChildren(
    h('div', { class: 'taller-titulo' }, h('strong', {}, 'TALLER'), h('span', {}, 'Mecha Fighter · herramienta local')),
    h('div', { class: 'taller-carpeta' },
      C.hayAcceso()
        ? h('span', { class: 'chip' }, ico('estrella'), ' Carpeta: ' + C.nombreCarpeta())
        : C.soportado()
          ? boton(recordada && recordada !== true ? 'Volver a abrir la carpeta' : 'Elegir carpeta del proyecto', async () => {
              try {
                if (recordada && recordada !== true) await C.pedirPermiso(recordada); else await C.elegirCarpeta();
                await cargar(); pintar();
                avisar('Listo: lo que guardes queda en la carpeta, para el commit.', 'bien');
              } catch (e) { if (e.name !== 'AbortError') avisar(e.message, 'error'); }
            }, { iconoNombre: 'llave', clase: 'principal compacto' })
          : h('span', { class: 'ayuda' }, 'Este navegador no puede escribir archivos: usá Chrome o Edge (guardar descarga el archivo).'),
      T.sucio.size ? h('span', { class: 'chip chip-alerta' }, 'Sin guardar: ' + [...T.sucio].join(', ')) : null,
      boton('Recargar', async () => {
        if (T.sucio.size && !confirm('Hay cambios sin guardar. ¿Recargar igual?')) return;
        await cargar(); pintar(); avisar('Datos recargados desde los archivos.');
      }, { iconoNombre: 'dado', clase: 'secundario compacto' }),
      h('a', { class: 'boton secundario compacto', href: './', target: '_blank' }, ico('play'), ' Abrir el juego')),
    h('nav', { class: 'taller-pestanas', role: 'tablist' }, ...PESTANAS.map(([id, nombre, icono]) =>
      h('button', { class: 'pestana' + (T.pestana === id ? ' activa' : ''), role: 'tab', 'aria-selected': T.pestana === id ? 'true' : 'false',
        onclick: () => { T.pestana = id; pintar(); } }, ico(icono), nombre))),
    cajaAviso);
}

function pintar() {
  pintarCabecera();
  const p = PESTANAS.find((x) => x[0] === T.pestana);
  if (T.limpiar) { T.limpiar(); T.limpiar = null; }
  cuerpo.replaceChildren();
  T.limpiar = p[3](T, cuerpo) || null;
}

async function arrancar() {
  cajaAviso = h('p', { class: 'taller-aviso', role: 'status', 'aria-live': 'polite' });
  cabecera = h('header', { class: 'taller-cabecera' });
  cuerpo = h('div', { class: 'taller-cuerpo' });
  T.recordada = await C.recordarCarpeta();
  try {
    await cargar();
  } catch (e) {
    raiz.replaceChildren(); montar(raiz, h('p', { class: 'error' }, e.message), h('p', { class: 'ayuda' }, 'Abrí el taller con el servidor local (igual que el juego).'));
    return;
  }
  await Promise.all([cargarSprites('./', (T.datos.reglas.arte || {}).retratos || 0, { extras: Object.fromEntries(Object.values(T.datos.partes).map((p) => [p.sprite, p.encaje])), colorEquipo: (T.datos.reglas.arte || {}).color_equipo }), cargarTerreno('./'), cargarUnidades('./', (T.datos.reglas.arte || {}).color_equipo), cargarLuces('./')]);
  raiz.replaceChildren();
  montar(raiz, cabecera, cuerpo);
  pintar();
  window.addEventListener('beforeunload', (e) => { if (T.sucio.size) { e.preventDefault(); e.returnValue = ''; } });
  const errores = T.validar();
  if (errores.length) avisar('Ojo: los datos tienen ' + errores.length + ' problema(s): ' + errores.slice(0, 2).join(' · '), 'error');
}

arrancar();
