// Un piloto automatico que juega como una persona que piensa (lo usa tools/campana.mjs):
//  - rota el escuadron: salen los mas sanos y los que estan hartos de mirar; el resto descansa o entrena
//  - prueba varias formaciones de despliegue y ordenes por radio, y elige con "intuicion":
//    las compara en batallas parecidas (otras semillas), nunca en la batalla de verdad. No hace trampa.
// Sirve para medir lo que el piloto tonto no ve: cuanto pesa pensar el despliegue y si hay una jugada que gana siempre.
import { simular } from '../src/motor/simular.js';
import { escuadronParaMision } from '../src/campana/partida.js';
import { desplegables, asignarTarea, misionConTareas } from '../src/campana/tareas.js';
import { zonaDeDespliegue, planDe } from '../src/campana/plan.js';
import { vidaDeSalida } from '../src/campana/mantenimiento.js';

// ---------- Quien sale ----------
// Antes de viajar a una mision. Devuelve cuantos quedaron en el banco.
export function rotar(datos, p) {
  for (const pi of p.pilotos) pi.tarea = null;
  const max = datos.reglas.escuadra_maxima;
  if (p.pilotos.length <= max) return 0;
  const aviso = datos.reglas.malestar.aviso;
  // salen: los que estan por irse (para que no se vayan), y despues los mas sanos y de mas nivel
  const ganas = (pi) => ((pi.malestar || 0) >= aviso ? 1000 : 0) + vidaDeSalida(datos, pi) + (pi.nivel || 1) * 8 - (pi.traumas || []).length * 25;
  const orden = p.pilotos.slice().sort((a, b) => ganas(b) - ganas(a));
  const banco = orden.slice(max);
  for (const pi of banco) asignarTarea(datos, p, pi.id, (pi.traumas || []).length || vidaDeSalida(datos, pi) < 60 ? 'descansar' : 'entrenar');
  return banco.length;
}

// ---------- Formaciones ----------
const peso = (datos, pi) => { const t = datos.partes[(pi.mecha.torso && pi.mecha.torso.parte) || pi.mecha.torso] || {}; return (t.estructura || 0) + (t.blindaje || 0) * 4; };

// Elige n casillas de una lista, repartidas (no todas pegadas)
function repartir(celdas, n) {
  if (celdas.length <= n) return celdas.slice();
  return Array.from({ length: n }, (_, i) => celdas[Math.round((i * (celdas.length - 1)) / Math.max(1, n - 1))]);
}

export function formaciones(datos, p) {
  const m = p.nodo.mision;
  const { zona } = zonaDeDespliegue(datos, m);
  const celdas = [...zona].map((s) => s.split(',').map(Number));
  const salen = desplegables(datos, p);
  const n = salen.length;
  const xs = [...new Set(celdas.map((c) => c[0]))].sort((a, b) => a - b);
  const columna = (desde, sentido) => { // las n casillas mas adelantadas (o mas atrasadas), repartidas a lo alto
    const out = [];
    for (let i = desde; out.length < n && i >= 0 && i < xs.length; i += sentido) out.push(...celdas.filter((c) => c[0] === xs[i]).sort((a, b) => a[1] - b[1]));
    return repartir(out.slice(0, Math.max(n, out.length)), n);
  };
  const porAltura = (sentido) => celdas.slice().sort((a, b) => (a[1] - b[1]) * sentido || b[0] - a[0]).slice(0, n);
  const base = planDe(datos, { ...p, nodo: { ...p.nodo, plan: {} } }); // las entradas de siempre
  const armar = (lugares, rumbo = null, ordenPilotos = salen) => {
    const usadas = new Set(), plan = {};
    ordenPilotos.forEach((pi, i) => {
      let c = lugares[i] || lugares[lugares.length - 1] || base[pi.id].casilla;
      if (usadas.has(c.join(','))) c = celdas.find((x) => !usadas.has(x.join(','))) || c;
      usadas.add(c.join(','));
      plan[pi.id] = { casilla: c.slice(), rumbo };
    });
    return plan;
  };
  const pesados = salen.slice().sort((a, b) => peso(datos, b) - peso(datos, a));
  const mitad = Math.ceil(n / 2);
  return {
    'entradas (sin pensar)': base,
    'todos adelante': armar(columna(xs.length - 1, -1)),
    'todos atrás': armar(columna(0, 1)),
    'pesados adelante': armar([...columna(xs.length - 1, -1).slice(0, mitad), ...columna(0, 1).slice(0, n - mitad)], null, pesados),
    'flanco de arriba': armar(porAltura(1)),
    'flanco de abajo': armar(porAltura(-1)),
    'emboscada (esperan)': Object.fromEntries(Object.entries(base).map(([id, v]) => [id, { casilla: v.casilla.slice(), rumbo: { espera: true } }]))
  };
}

export const RADIO = {
  'sin órdenes': [],
  'carga al empezar': [{ t: 15, id: 'carga' }],
  'fuego concentrado': [{ t: 30, id: 'fuego' }, { t: 90, id: 'fuego' }],
  'aguantar y después fuego': [{ t: 20, id: 'aguanten' }, { t: 80, id: 'fuego' }],
  'replegarse y cargar': [{ t: 25, id: 'replieguen' }, { t: 85, id: 'carga' }]
};

// ---------- Elegir con intuicion ----------
// Prueba cada formacion (y despues cada juego de ordenes sobre la mejor) en 'muestras' batallas parecidas.
// Deja el plan elegido en p.nodo.plan y devuelve { formacion, radio, control }.
export function pensar(datos, p, muestras = 2) {
  const mision = misionConTareas(datos, p, p.nodo.mision);
  const probar = (plan, control) => {
    p.nodo.plan = plan;
    const escuadron = escuadronParaMision(datos, p);
    let puntos = 0;
    for (let k = 1; k <= muestras; k++) {
      const r = simular(datos, { mision, escuadron, semilla: mision.semilla + k * 7919, control });
      const vivos = Object.values((r.resumen && r.resumen.pilotos) || {}).filter((u) => u.viva).length;
      puntos += (r.victoria ? 100 : 0) + vivos; // ganar, y de paso que vuelvan
    }
    return puntos;
  };
  const F = formaciones(datos, p);
  let formacion = null, mejor = -1;
  for (const [nombre, plan] of Object.entries(F)) { const v = probar(plan, []); if (v > mejor) { mejor = v; formacion = nombre; } }
  let radio = 'sin órdenes';
  for (const [nombre, control] of Object.entries(RADIO)) { if (!control.length) continue; const v = probar(F[formacion], control); if (v > mejor) { mejor = v; radio = nombre; } }
  p.nodo.plan = F[formacion];
  return { formacion, radio, control: RADIO[radio], sinPensar: F['entradas (sin pensar)'], mision };
}
