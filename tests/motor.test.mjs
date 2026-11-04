// Pruebas del motor y la campana (sin navegador):  node tests/motor.test.mjs
import { cargarDatos } from '../src/core/datos.js';
import { crearAzar } from '../src/core/azar.js';
import { simular } from '../src/motor/simular.js';
import { evaluar } from '../src/motor/decision.js';
import { armarMision } from '../src/campana/misiones.js';
import { crearRecluta } from '../src/campana/reclutas.js';
import { nuevaPartida, nodosSiguientes, elegirNodo, escuadronParaMision, cerrarMision, seguir } from '../src/campana/partida.js';
import { leerDisco } from '../tools/leer-disco.mjs';

let fallas = 0;
function ok(cond, msg) { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (!cond) fallas++; }
const datos = await cargarDatos(leerDisco());

function batalla(plantilla, semilla, dificultad = 1) {
  const az = crearAzar(semilla);
  const escuadron = ['vanguardia', 'tirador', 'medico', 'infiltrador']
    .map((c, i) => crearRecluta(datos, az, 'p' + i, c)).map((p) => ({ piloto: p, mecha: p.mecha, gambits: p.gambits }));
  const mision = armarMision(datos, plantilla, dificultad, az);
  return simular(datos, { mision, escuadron, semilla: mision.semilla });
}

console.log('Determinismo');
for (const m of Object.keys(datos.misiones)) {
  ok(batalla(m, 77).huella === batalla(m, 77).huella, m + ': misma entrada, misma batalla');
}
ok(batalla('defensa', 77).huella !== batalla('defensa', 78).huella, 'otra semilla, otra batalla');
// Huella de referencia: si cambia sin querer, se rompio el determinismo o cambio una regla.
// Si el cambio es a proposito, subir version_motor en data/reglas.json y actualizar este numero.
const ref = batalla('defensa', 4242).huella;
ok(ref === 'pgy3hp', 'huella de referencia de la defensa 4242 (' + ref + ')');

console.log('Registro');
{
  const r = batalla('asalto', 9);
  const tipos = new Set(r.registro.map((e) => e.tipo));
  for (const t of ['aparece', 'inicio', 'mueve', 'dispara', 'muere', 'fin']) ok(tipos.has(t), 'tiene eventos "' + t + '"');
  ok(r.registro.every((e, i, a) => i === 0 || e.t >= a[i - 1].t), 'los eventos estan en orden de tiempo');
  ok(r.registro.every((e) => JSON.stringify(e) === JSON.stringify(JSON.parse(JSON.stringify(e)))), 'todo el registro se puede guardar como texto');
  ok(Object.keys(r.resumen.pilotos).length === 4, 'el resumen trae a los 4 pilotos');
}

console.log('Ganchos y personalidades');
{
  // Las desobediencias por panico solo las hacen los cobardes; las de "corre a cubrir", los leales.
  const motivos = { huye_en_panico: 'cobarde', corre_a_cubrir: 'leal' };
  let vistas = 0, malas = 0;
  for (let s = 1; s <= 40; s++) {
    const r = batalla('defensa', s, 2);
    const pers = {};
    for (const e of r.registro) if (e.tipo === 'aparece') pers[e.u] = e.ficha.personalidad;
    for (const e of r.registro) if (e.tipo === 'anula' && motivos[e.motivo]) { vistas++; if (pers[e.u] !== motivos[e.motivo]) malas++; }
  }
  ok(vistas > 0 && malas === 0, 'cada desobediencia viene de la personalidad que corresponde (' + vistas + ' vistas)');
}
{
  const u = { vida: 35, vidaMax: 100, moralActual: 50, armas: [] };
  const expr = { dato: 'yo.vida_pct', op: '<', param: 'valor' };
  ok(!evaluar({}, { u }, expr, { valor: 30 }), 'vida 35% no es < 30%');
  ok(evaluar({}, { u, corrimientos: { 'yo.vida_pct': 10 } }, expr, { valor: 30 }), 'con correr_umbral +10 (Cobarde) ya cuenta como < 30%');
  ok(evaluar({}, { u }, { todos: [true, { no: { dato: 'yo.moral', op: '<', valor: 40 } }] }, {}), 'todos / no / dato');
}

console.log('Escolta');
{
  // Bug de noviembre: con 5 o 6 pilotos llenaban la zona de extraccion y el transporte no podia entrar.
  let trabadas = 0;
  for (let n = 0; n < 60; n++) {
    const az = crearAzar(7000 + n);
    const k = 5 + (n % 2);
    const esc = Array.from({ length: k }, (_, i) => crearRecluta(datos, az, 'p' + i)).map((p) => ({ piloto: p, mecha: p.mecha, gambits: p.gambits }));
    const m = armarMision(datos, 'escolta', 1, az);
    const r = simular(datos, { mision: m, escuadron: esc, semilla: m.semilla });
    if (r.motivo === 'tiempo_agotado') trabadas++;
  }
  ok(trabadas === 0, 'con escuadrones grandes, el transporte siempre puede entrar a la zona (' + trabadas + ' trabadas de 60)');
}

console.log('Campana');
{
  const a = nuevaPartida(datos, 321), b = nuevaPartida(datos, 321);
  ok(JSON.stringify(a) === JSON.stringify(b), 'misma semilla, misma partida');
  ok(a.pilotos.length === datos.reglas.reclutas_iniciales && a.pilotos.every((p) => p.vinculo), 'arranca con reclutas vinculados de a pares');
  const p = nuevaPartida(datos, 99);
  const i = nodosSiguientes(p).findIndex((n) => n.tipo === 'mision');
  elegirNodo(datos, p, i);
  ok(p.estado === 'preparacion', 'elegir una mision lleva a la preparacion');
  const r = simular(datos, { mision: p.nodo.mision, escuadron: escuadronParaMision(datos, p), semilla: p.nodo.mision.semilla });
  const inf = cerrarMision(datos, p, r);
  ok(inf.pilotos.length === 4 && p.columna === 0, 'el informe cubre al escuadron y se avanza una columna');
  ok(p.caidos.length === inf.caidos.length && p.pilotos.length + p.caidos.length === 4, 'los muertos pasan al memorial');
  ok(JSON.parse(JSON.stringify(p)).semilla === 99, 'la partida se puede guardar');
}

console.log(fallas ? '\n' + fallas + ' falla(s)' : '\nTodo bien');
process.exit(fallas ? 1 : 0);
