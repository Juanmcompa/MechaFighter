// Pruebas del nucleo (sin navegador):  node tests/core.test.mjs
import { crearAzar, huellaTexto } from '../src/core/azar.js';
import { cargarDatos } from '../src/core/datos.js';
import { validarDatos } from '../src/core/validar.js';
import { leerDisco } from '../tools/leer-disco.mjs';

let fallas = 0;
function ok(cond, msg) {
  console.log((cond ? '  ✓ ' : '  ✗ ') + msg);
  if (!cond) fallas++;
}
const tiradas = (az, n) => Array.from({ length: n }, () => az.entero(1, 1000));

console.log('Azar');
ok(tiradas(crearAzar(1234), 50).join() === tiradas(crearAzar(1234), 50).join(), 'misma semilla, misma secuencia');
ok(tiradas(crearAzar(1234), 50).join() !== tiradas(crearAzar(1235), 50).join(), 'otra semilla, otra secuencia');
ok(tiradas(crearAzar('baliza-x'), 10).join() === tiradas(crearAzar('baliza-x'), 10).join(), 'acepta texto como semilla');
// Huella fija: si esto cambia, cambio el azar y todas las batallas guardadas darian otra cosa.
ok(tiradas(crearAzar(42), 5).join() === '957,291,705,806,979', 'huella del azar sin cambios');
{
  const a = crearAzar(7), b = crearAzar(7);
  a.derivar('moral').entero(1, 100); // tirar en otro sistema...
  ok(a.derivar('combate').entero(1, 1e6) === b.derivar('combate').entero(1, 1e6), 'derivar: un sistema no corre las tiradas de otro');
}
{
  const az = crearAzar(99);
  let min = Infinity, max = -Infinity, sumaTiradas = 0;
  for (let i = 0; i < 20000; i++) {
    const v = az.entero(1, 6); min = Math.min(min, v); max = Math.max(max, v);
    if (az.tirada(30)) sumaTiradas++;
  }
  ok(min === 1 && max === 6, 'entero respeta los bordes');
  ok(sumaTiradas > 5600 && sumaTiradas < 6400, 'tirada(30) sale ~30% (' + (sumaTiradas / 200).toFixed(1) + '%)');
}
ok(huellaTexto('mecha') === huellaTexto('mecha') && huellaTexto('mecha') !== huellaTexto('Mecha'), 'huella de texto estable');

console.log('Datos');
const datos = await cargarDatos(leerDisco());
const errores = validarDatos(datos);
ok(errores.length === 0, 'los datos del repo pasan la validacion' + (errores.length ? ': ' + errores.join(' | ') : ''));
ok(Object.isFrozen(datos.partes.brazo_rifle.arma), 'las plantillas quedan congeladas');

// La validacion tiene que atrapar errores tipicos de edicion a mano.
function conCambio(cambio) {
  const copia = structuredClone(datos);
  cambio(copia);
  return validarDatos(copia);
}
const atrapa = (msg, cambio, texto) => {
  const e = conCambio(cambio);
  ok(e.some((x) => x.includes(texto)), 'atrapa: ' + msg);
};
atrapa('parte inexistente en una clase', (d) => d.clases.tirador.partes_sugeridas.push('brazo_que_no_existe'), 'brazo_que_no_existe');
atrapa('accion mal escrita en un gambit', (d) => { d.clases.medico.gambits_de_fabrica[0].accion = 'curar'; }, '"curar" no existe');
atrapa('parametro fuera de rango', (d) => { d.clases.tirador.gambits_de_fabrica[0].parametros.casillas = 50; }, 'fuera de rango');
atrapa('decimales', (d) => { d.partes.brazo_rifle.arma.danio = 14.5; }, 'decimales');
atrapa('evento de moral desconocido', (d) => { d.personalidades.cobarde.ganchos[2].evento = 'se_asusta'; }, 'se_asusta');
atrapa('fila de mapa de otro largo', (d) => { d.mapas.puesto_01.filas[3] += '.'; }, 'deberia medir');
atrapa('escuadra con unidad inexistente', (d) => d.enemigos.escuadras.nido.miembros.push('dragon'), 'dragon');
atrapa('parte en el encaje equivocado', (d) => { d.enemigos.unidades.mecha_pirata.partes.cabeza = 'brazo_rifle'; }, 'no va en cabeza');

console.log(fallas ? '\n' + fallas + ' falla(s)' : '\nTodo bien');
process.exit(fallas ? 1 : 0);
