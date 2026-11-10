// Inventario de arte por consola: que piezas tienen dibujo propio, cuales lo piden prestado, que falta y que sobra.
//   node tools/inventario-arte.mjs            resumen y problemas
//   node tools/inventario-arte.mjs --todo     ademas, la lista de piezas una por una
//   node tools/inventario-arte.mjs --corto    una sola linea
// Lo mismo, con miniaturas y filtros: admin.html › Arte.
import fs from 'node:fs';
import path from 'node:path';
import { RAIZ, leerDisco } from './leer-disco.mjs';
import { cargarDatos } from '../src/core/datos.js';
import { inventario } from '../src/admin/inventario.js';

const datos = await cargarDatos(leerDisco());
const leer = (f) => { try { return JSON.parse(fs.readFileSync(path.join(RAIZ, f), 'utf8')); } catch { return null; } };
const meta = { sprites: leer('assets/mecha/sprites.json'), unidades: leer('assets/unidades/unidades.json'), terreno: leer('assets/terreno/terreno.json') };
const archivos = new Set();
(function recorrer(dir) {
  for (const e of fs.readdirSync(path.join(RAIZ, dir), { withFileTypes: true })) {
    const ruta = dir + '/' + e.name;
    if (e.isDirectory()) recorrer(ruta); else archivos.add(ruta);
  }
})('assets');

const I = inventario(datos, meta, archivos, true);
const R = I.resumen;
console.log(`Piezas: ${R.piezas} · con arte propio ${R.propias} · prestado ${R.prestadas} · sin dibujo ${R.sinDibujo} · provisorias ${R.provisorias} · sin ícono ${R.sinIcono}`);
console.log(`Enemigos: ${I.unidades.length} · les falta algún dibujo ${R.enemigosSinDibujo} · dibujados por código ${R.enemigosPorCodigo}`);
console.log(`Retratos: ${I.retratos.cuantos - I.retratos.faltan.length} de ${I.retratos.cuantos} · Terreno: ${I.terreno.cuantos - I.terreno.faltan.length} de ${I.terreno.cuantos}`);
// --corto: una sola linea (para npm run revisar)
if (process.argv.includes('--corto')) {
  console.log(`${R.propias} piezas con arte propio, ${R.prestadas} prestado, ${R.sinDibujo} sin dibujo · ${R.conAvisos} con avisos · ${R.sobran + R.raros} archivos sueltos (detalle: node tools/inventario-arte.mjs)`);
  process.exit(0);
}
const lista = (titulo, filas) => { if (filas.length) { console.log('\n' + titulo + ' (' + filas.length + ')'); for (const f of filas) console.log('  ' + f); } };
lista('Piezas con avisos', I.piezas.filter((p) => p.avisos.length).map((p) => p.id + ': ' + p.avisos.join(' · ')));
lista('Enemigos con dibujos que faltan', I.unidades.filter((u) => u.faltan.length).map((u) => u.id + ': ' + u.faltan.join(', ')));
lista('Retratos que faltan', I.retratos.faltan);
lista('Terreno que falta', I.terreno.faltan);
lista('Otros avisos', I.avisos);
lista('Archivos raros', I.raros.map((x) => x.ruta + ' · ' + x.motivo));
lista('Archivos que nadie usa', I.sobran.map((x) => x.ruta + ' · ' + x.motivo));
if (process.argv.includes('--todo')) lista('Piezas', I.piezas.map((p) => p.id.padEnd(30) + p.estado.padEnd(9) + (p.prestadoDe ? '← ' + p.prestadoDe : '') + (p.provisoria ? ' (provisoria)' : '')));
