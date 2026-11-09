// Arranque: carga los datos y los revisa. Si estan bien, abre el juego. Si no, muestra que quedo mal y donde
// (sirve para editar los JSON a mano y ver enseguida si hay un error).
import { cargarInterfaz } from './core/traducir.js';
import { cargarDatos, leerConFetch } from './core/datos.js';
import { validarDatos } from './core/validar.js';
import { crearApp } from './ui/app.js';
import { cargarSprites, cargarTerreno, cargarUnidades } from './vista/sprites.js';
import { cargarLuces } from './vista/luz.js';

const raiz = document.getElementById('app');
const registro = document.getElementById('registro');
function linea(texto, clase = '') {
  const li = document.createElement('li');
  li.textContent = texto;
  if (clase) li.className = clase;
  registro.appendChild(li);
}

async function arrancar() {
  let datos;
  try {
    linea('Enlazando con el hangar...');
    // idioma: ?idioma=en en la direccion, o el que quedo elegido (castellano si no hay)
    let idioma = new URLSearchParams(location.search).get('idioma');
    try { if (idioma) localStorage.setItem('mechafighter.idioma', idioma); else idioma = localStorage.getItem('mechafighter.idioma'); } catch { /* sin guardado */ }
    datos = await cargarDatos(leerConFetch(), idioma);
    // textos de la interfaz: cambios al castellano (es.json) y la traduccion del idioma elegido
    const leer = leerConFetch();
    const opcional = async (c) => { try { return (await leer('data/idiomas/' + c + '.json')).interfaz; } catch { return null; } };
    cargarInterfaz(await opcional('es'), idioma && idioma !== 'es' ? await opcional(idioma) : null);
  } catch (e) {
    linea(e.message, 'error');
    if (location.protocol === 'file:') linea('Abrí el juego con un servidor local (ver README).', 'aviso');
    return;
  }
  const errores = validarDatos(datos);
  if (errores.length) {
    linea(errores.length + ' problema(s) en los datos:', 'error');
    for (const e of errores) linea(e, 'error');
    return;
  }
  linea('Calibrando sensores...');
  await Promise.all([cargarSprites('./', (datos.reglas.arte || {}).retratos || 0, { extras: Object.fromEntries(Object.values(datos.partes).map((p) => [p.sprite, p.encaje])), colorEquipo: (datos.reglas.arte || {}).color_equipo }), cargarTerreno('./'), cargarUnidades('./', (datos.reglas.arte || {}).color_equipo), cargarLuces('./')]);
  const app = crearApp(datos, raiz);
  window.mechafighter = app; // para las pruebas y para mirar desde la consola
  app.ir('portada');
}

arrancar();
