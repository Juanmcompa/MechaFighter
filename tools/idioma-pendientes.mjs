// Lo que falta traducir a un idioma, en archivos chicos para repartir: uno por tabla (los grandes, en partes).
// Cada archivo es { "ruta": "texto en castellano" }. Se traduce el valor, se deja la ruta.
//   Sacar:  node tools/idioma-pendientes.mjs en carpeta/          -> carpeta/<tabla>.json
//   Juntar: node tools/idioma-pendientes.mjs en carpeta/ --juntar -> lee carpeta/<tabla>.en.json y los suma a data/idiomas/en.json
// "interfaz" son los textos del codigo (data/interfaz.json); el resto, las tablas de data/.
import fs from 'node:fs';
import path from 'node:path';
import { TABLAS_DE_TEXTO, SOLO_RUTAS, textosDe, leerRuta } from '../src/core/idiomas.js';

const [codigo, carpeta, modo] = process.argv.slice(2);
if (!codigo || !carpeta) { console.error('Uso: node tools/idioma-pendientes.mjs <codigo> <carpeta> [--juntar]'); process.exit(2); }
const NOMBRES = { en: 'English', pt: 'Português', fr: 'Français' };
const archivo = 'data/idiomas/' + codigo + '.json';
const leer = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const idioma = fs.existsSync(archivo) ? leer(archivo) : { _ayuda: 'Traducciones del juego. Ver src/core/idiomas.js y src/core/traducir.js. Se edita desde el taller (admin.html) o con tools/idioma-pendientes.mjs.', nombre: NOMBRES[codigo] || codigo, textos: {}, interfaz: {} };
idioma.textos = idioma.textos || {};
idioma.interfaz = idioma.interfaz || {};
const PARTE = 18000; // caracteres de castellano por archivo, mas o menos

function pendientes(tabla) {
  if (tabla === 'interfaz') return Object.keys(leer('data/interfaz.json').textos || {}).filter((s) => !idioma.interfaz[s]).map((s) => [s, s]);
  const ya = idioma.textos[tabla] || {};
  return textosDe(leer('data/' + tabla + '.json')).filter((x) => !ya[x.ruta] && (!SOLO_RUTAS[tabla] || SOLO_RUTAS[tabla].test(x.ruta))).map((x) => [x.ruta, x.valor]);
}

const tablas = ['interfaz', ...TABLAS_DE_TEXTO];
if (modo !== '--juntar') {
  fs.mkdirSync(carpeta, { recursive: true });
  let total = 0;
  for (const tabla of tablas) {
    const lista = pendientes(tabla);
    if (!lista.length) continue;
    // en partes de ~PARTE caracteres (sin cortar una entrada)
    const partes = [[]]; let largo = 0;
    for (const e of lista) { if (largo > PARTE) { partes.push([]); largo = 0; } partes.at(-1).push(e); largo += e[0].length + e[1].length; }
    partes.forEach((p, i) => {
      const nombre = tabla + (partes.length > 1 ? '.' + (i + 1) : '') + '.json';
      fs.writeFileSync(path.join(carpeta, nombre), JSON.stringify(Object.fromEntries(p), null, 1));
      console.log(nombre.padEnd(28) + p.length + ' textos');
    });
    total += lista.length;
  }
  console.log(total + ' textos por traducir');
} else {
  let sumados = 0; const raros = [];
  for (const f of fs.readdirSync(carpeta).filter((x) => x.endsWith('.' + codigo + '.json')).sort()) {
    const tabla = f.split('.')[0];
    const hecho = leer(path.join(carpeta, f));
    const original = tabla === 'interfaz' ? null : leer('data/' + tabla + '.json');
    for (const [ruta, texto] of Object.entries(hecho)) {
      if (typeof texto !== 'string' || !texto.trim()) continue;
      const es = tabla === 'interfaz' ? ruta : leerRuta(original, ruta);
      if (typeof es !== 'string') { raros.push(f + ': ' + ruta + ' no existe'); continue; }
      // las marcas {piloto}, {bando}... tienen que seguir estando
      const marcas = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
      if (marcas(es) !== marcas(texto)) raros.push(f + ': ' + ruta + ' cambio las marcas ' + marcas(es) + ' -> ' + marcas(texto));
      if (tabla === 'interfaz') idioma.interfaz[ruta] = texto;
      else (idioma.textos[tabla] = idioma.textos[tabla] || {})[ruta] = texto;
      sumados++;
    }
  }
  fs.mkdirSync('data/idiomas', { recursive: true });
  fs.writeFileSync(archivo, JSON.stringify(idioma, null, 1) + '\n');
  console.log(sumados + ' textos sumados a ' + archivo);
  for (const r of raros) console.log('  ! ' + r);
}
