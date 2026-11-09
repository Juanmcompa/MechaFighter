// El plan del despliegue: donde arranca cada mecha y que hace primero (ir a un punto, aguantar en el lugar o
// seguir sus ordenes). Se guarda en p.nodo.plan = { idPiloto: { casilla: [x, y], rumbo: { x, y } | { espera } | null } }.
// El motor lo recibe en cada entrada del escuadron (ver motor/simular.js). Reglas: reglas.json > control.
import { crearTablero, caminable } from '../motor/espacio.js';
import { mapaDe } from '../core/datos.js';
import { desplegables } from './tareas.js';

// Las casillas donde se puede ubicar un mecha: las caminables de las primeras columnas (y las entradas del mapa)
export function zonaDeDespliegue(datos, m) {
  const mapa = mapaDe(datos, m);
  const t = crearTablero(mapa, datos.reglas.destructibles);
  const [, alto] = mapa.tamano;
  const cols = datos.reglas.control.zona_despliegue;
  const zona = new Set(mapa.aparicion.jugador.map(([x, y]) => x + ',' + y));
  for (let y = 0; y < alto; y++) for (let x = 0; x < cols; x++) if (caminable(t, x, y)) zona.add(x + ',' + y);
  return { zona, tablero: t, mapa };
}

// El plan de esta mision (si falta alguien, arranca en la entrada que le toca y sin rumbo)
export function planDe(datos, p) {
  const m = p.nodo.mision;
  const ap = mapaDe(datos, m).aparicion.jugador;
  p.nodo.plan = p.nodo.plan || {};
  const plan = p.nodo.plan;
  const salen = desplegables(datos, p);
  const usadas = new Set(salen.filter((pi) => plan[pi.id]).map((pi) => plan[pi.id].casilla.join(',')));
  salen.forEach((pi, i) => {
    if (plan[pi.id]) return;
    let c = ap[i % ap.length];
    for (let k = 0; usadas.has(c.join(',')) && k < ap.length; k++) c = ap[(i + k + 1) % ap.length];
    usadas.add(c.join(','));
    plan[pi.id] = { casilla: c.slice(), rumbo: null };
  });
  return plan;
}

// Ubicar a un piloto. Si la casilla es de otro, cambian de lugar. Devuelve false si no es de la zona.
export function ubicar(datos, p, id, x, y) {
  const { zona } = zonaDeDespliegue(datos, p.nodo.mision);
  if (!zona.has(x + ',' + y)) return false;
  const plan = planDe(datos, p);
  const otro = Object.entries(plan).find(([k, v]) => k !== id && v.casilla[0] === x && v.casilla[1] === y);
  if (otro) plan[otro[0]].casilla = plan[id].casilla.slice();
  plan[id].casilla = [x, y];
  return true;
}

// Que hace primero: null (sus ordenes), { espera: true } (aguanta en el lugar) o { x, y } (va a ese punto)
export function marcarRumbo(datos, p, id, rumbo) {
  const plan = planDe(datos, p);
  if (!plan[id]) return false;
  if (rumbo && !rumbo.espera) {
    const { tablero } = zonaDeDespliegue(datos, p.nodo.mision);
    if (!caminable(tablero, rumbo.x, rumbo.y)) return false;
  }
  plan[id].rumbo = rumbo ? (rumbo.espera ? { espera: true } : { x: rumbo.x, y: rumbo.y }) : null;
  return true;
}
