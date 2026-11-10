// La revision completa antes de un commit, en un solo comando:  npm run revisar
//   1. datos validos   2. pruebas del nucleo y del motor   3. unas campañas con piloto automatico
//   4. el juego jugado en el navegador, en castellano y en ingles (si hay Playwright)
// Rapida (sin navegador ni campañas):  npm run revisar -- --rapido
import { spawnSync } from 'node:child_process';
import { RAIZ } from './leer-disco.mjs';

const rapido = process.argv.includes('--rapido');
const pasos = [
  ['Datos', ['tools/validar-datos.mjs']],
  ['Pruebas del núcleo', ['tests/core.test.mjs']],
  ['Pruebas del motor y la campaña', ['tests/motor.test.mjs']],
  ['Inventario de arte (informativo)', ['tools/inventario-arte.mjs', '--corto']],
  !rapido && ['Campañas con piloto automático (10)', ['tools/campana.mjs', '10']],
  !rapido && ['Navegador en castellano', ['tools/jugar.mjs', '3', 'es']],
  !rapido && ['Navegador en inglés', ['tools/jugar.mjs', '3', 'en']]
].filter(Boolean);

const resumen = [];
for (const [nombre, args] of pasos) {
  const inicio = Date.now();
  const r = spawnSync(process.execPath, args, { cwd: RAIZ, encoding: 'utf8' });
  const salida = ((r.stdout || '') + (r.stderr || '')).trim().split('\n');
  const estado = r.status === 0 ? '✓' : r.status === 3 ? '–' : '✗'; // 3: no se pudo correr (falta Playwright)
  // de lo que anduvo, solo los avisos y la ultima linea; de lo que fallo, el final entero
  const mostrar = estado === '✗' ? salida.slice(-25) : salida.filter((l, i) => /⚠/.test(l) || i === salida.length - 1);
  console.log(estado + ' ' + nombre + ' (' + ((Date.now() - inicio) / 1000).toFixed(0) + ' s)');
  for (const l of mostrar) console.log('    ' + l);
  resumen.push([estado, nombre]);
}
const mal = resumen.filter(([e]) => e === '✗');
const sinCorrer = resumen.filter(([e]) => e === '–');
console.log('\n' + (mal.length ? '✗ NO commitear: falló ' + mal.map(([, n]) => n).join(', ') : '✓ Todo en orden' + (sinCorrer.length ? ' (sin probar: ' + sinCorrer.map(([, n]) => n).join(', ') + ')' : '')));
process.exit(mal.length ? 1 : 0);
