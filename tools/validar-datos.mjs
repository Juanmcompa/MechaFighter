// Revisa todos los JSON de data/. Correrlo despues de tocar cualquier dato:  node tools/validar-datos.mjs
import { cargarDatos } from '../src/core/datos.js';
import { validarDatos } from '../src/core/validar.js';
import { leerDisco } from './leer-disco.mjs';

try {
  const datos = await cargarDatos(leerDisco());
  const errores = validarDatos(datos);
  const cuenta = (t) => Object.keys(t || {}).length;
  console.log('Datos: ' + cuenta(datos.clases) + ' clases, ' + cuenta(datos.partes) + ' partes, ' +
    cuenta(datos.personalidades) + ' personalidades, ' + cuenta(datos.gambits.condiciones) + ' condiciones, ' +
    cuenta(datos.enemigos.unidades) + ' enemigos, ' + cuenta(datos.misiones) + ' misiones, ' + cuenta(datos.mapas) + ' mapas');
  if (errores.length) {
    console.log('\n' + errores.length + ' problema(s):');
    for (const e of errores) console.log('  ✗ ' + e);
    process.exit(1);
  }
  console.log('✓ Todo en orden');
} catch (e) {
  console.log('✗ ' + e.message);
  process.exit(1);
}
