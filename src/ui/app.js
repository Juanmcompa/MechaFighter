// La aplicacion: guarda los datos y la partida, y cambia de pantalla. Cada pantalla es una funcion que recibe
// (app, raiz, ...argumentos) y dibuja lo suyo adentro de raiz.

import { guardar, cargar, borrar } from '../campana/guardado.js';
import { portada } from './portada.js';
import { sectores } from './sectores.js';
import { hangar } from './hangar.js';
import { preparacion } from './preparacion.js';
import { batalla } from './batalla.js';
import { informe } from './informe.js';
import { taller, reclutamiento, evento } from './nodos.js';
import { fin } from './fin.js';

const PANTALLAS = { portada, sectores, hangar, preparacion, batalla, informe, taller, reclutamiento, evento, fin };

export function crearApp(datos, raiz) {
  const app = {
    datos,
    partida: null,
    actual: null,
    limpieza: null,
    ir(nombre, ...args) {
      if (app.limpieza) { app.limpieza(); app.limpieza = null; }
      app.actual = nombre;
      raiz.innerHTML = '';
      raiz.className = 'pantalla pantalla-' + nombre;
      window.scrollTo(0, 0);
      const r = PANTALLAS[nombre](app, raiz, ...args);
      if (typeof r === 'function') app.limpieza = r;
      const titulo = raiz.querySelector('h1, h2');
      if (titulo) { titulo.setAttribute('tabindex', '-1'); titulo.focus({ preventScroll: true }); }
    },
    // La pantalla que corresponde al estado de la partida
    continuar() {
      const p = app.partida;
      if (!p) return app.ir('portada');
      const destino = { sectores: 'sectores', preparacion: 'preparacion', taller: 'taller', reclutamiento: 'reclutamiento', evento: 'evento', fin: 'fin' }[p.estado];
      app.ir(destino || 'sectores');
    },
    guardar() { if (app.partida) guardar(app.partida); },
    cargarGuardada() {
      const p = cargar();
      if (p && p.versionDatos === datos.reglas.version_datos) app.partida = p;
      return app.partida;
    },
    borrarGuardada() { borrar(); app.partida = null; }
  };
  return app;
}
