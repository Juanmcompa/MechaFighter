// Arranque: carga los datos y los revisa. Si estan bien, abre el juego. Si no, muestra que quedo mal y donde
// (sirve para editar los JSON a mano y ver enseguida si hay un error).
import { cargarDatos, leerConFetch } from './core/datos.js';
import { validarDatos } from './core/validar.js';
import { crearApp } from './ui/app.js';

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
    datos = await cargarDatos(leerConFetch());
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
  const app = crearApp(datos, raiz);
  window.mechafighter = app; // para las pruebas y para mirar desde la consola
  app.ir('portada');
}

arrancar();
