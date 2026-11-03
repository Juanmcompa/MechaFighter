// Arranque: carga los datos, los revisa y muestra el resultado. Por ahora es tambien la herramienta para ver
// si un JSON editado a mano quedo bien (los errores salen en rojo, diciendo donde).
import { cargarDatos, leerConFetch } from './core/datos.js';
import { validarDatos } from './core/validar.js';
import { dibujarMapa, COLORES_CASILLA } from './ui/vistaMapa.js';

const registro = document.getElementById('registro');
function linea(texto, clase = '') {
  const li = document.createElement('li');
  li.textContent = texto;
  if (clase) li.className = clase;
  registro.appendChild(li);
  registro.scrollTop = registro.scrollHeight;
}

async function arrancar() {
  linea('Iniciando enlace con el hangar...');
  let datos;
  try {
    datos = await cargarDatos(leerConFetch());
  } catch (e) {
    linea(e.message, 'error');
    if (location.protocol === 'file:') linea('Abri el juego con un servidor local (ver README).', 'aviso');
    return;
  }
  document.getElementById('version').textContent = '0.' + datos.reglas.version_datos;
  const n = (t) => Object.keys(t || {}).length;
  linea(n(datos.clases) + ' clases de piloto · ' + n(datos.personalidades) + ' personalidades');
  linea(n(datos.partes) + ' partes de mecha · ' + n(datos.afijos) + ' afijos');
  linea(n(datos.gambits.condiciones) + ' condiciones · ' + n(datos.gambits.acciones) + ' acciones');
  linea(n(datos.enemigos.unidades) + ' enemigos · ' + n(datos.misiones) + ' misiones · ' + n(datos.mapas) + ' mapas');

  const errores = validarDatos(datos);
  if (errores.length) {
    linea(errores.length + ' problema(s) en los datos:', 'error');
    for (const e of errores) linea(e, 'error');
  } else {
    linea('Base de datos integra. Sistemas en linea.', 'ok');
  }

  const primerMapa = Object.keys(datos.mapas)[0];
  if (primerMapa) {
    dibujarMapa(document.getElementById('mapa'), datos.mapas[primerMapa]);
    document.getElementById('t-mapa').textContent = datos.mapas[primerMapa].nombre;
    const ley = document.getElementById('leyenda');
    for (const [tipo, color] of Object.entries(COLORES_CASILLA)) {
      const li = document.createElement('li');
      li.innerHTML = '<i style="background:' + color + '"></i>' + tipo.replace('_', ' ');
      ley.appendChild(li);
    }
  }
}

arrancar();
