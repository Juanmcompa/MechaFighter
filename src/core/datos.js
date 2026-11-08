// Carga todas las tablas de data/ y las deja congeladas (nadie puede modificar una plantilla por error:
// lo que cambia en una partida se guarda aparte, nunca encima del catalogo).
//
// No sabe si esta en el navegador o en Node: recibe una funcion leer(ruta) que devuelve el JSON ya leido.
// En el navegador es fetch; en las pruebas y en el servidor, el disco.

import { aplicarIdioma } from './idiomas.js';

// idioma: codigo ('en', 'pt'...) o nada para castellano. Si no hay archivo de ese idioma, queda en castellano.
export async function cargarDatos(leer, idioma = null) {
  const indice = await leer('data/indice.json');
  const datos = {};
  for (const nombre of indice.tablas) {
    datos[nombre] = sinAyuda(await leer('data/' + nombre + '.json'));
  }
  datos.mapas = {};
  for (const id of indice.mapas) {
    datos.mapas[id] = sinAyuda(await leer('data/mapas/' + id + '.json'));
  }
  if (idioma && idioma !== 'es') {
    try { aplicarIdioma(datos, await leer('data/idiomas/' + idioma + '.json')); } catch { /* sin traduccion */ }
  }
  return congelar(datos);
}

// En el navegador: lee con fetch relativo a la pagina.
export function leerConFetch(base = './') {
  return async (ruta) => {
    const r = await fetch(base + ruta, { cache: 'no-cache' });
    if (!r.ok) throw new Error('No se pudo leer ' + ruta + ' (' + r.status + ')');
    try {
      return await r.json();
    } catch (e) {
      throw new Error(ruta + ' tiene un error de escritura: ' + e.message);
    }
  };
}

// Las claves que empiezan con "_" son notas para quien edita el JSON; el juego no las usa.
function sinAyuda(obj) {
  const limpio = {};
  for (const k of Object.keys(obj)) if (!k.startsWith('_')) limpio[k] = obj[k];
  return limpio;
}

function congelar(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const k of Object.keys(o)) congelar(o[k]);
  }
  return o;
}

// El mapa de una mision: el generado (guardado en la mision) o uno de data/mapas
export const mapaDe = (datos, m) => m.plano || datos.mapas[m.mapa];
