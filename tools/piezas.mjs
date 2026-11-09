// Balance de piezas: arma un escuadron parejo, le pone UNA pieza a todos y juega las mismas misiones.
// Sirve para ver si una pieza gana sola (meta) o no sirve para nada.   node tools/piezas.mjs [misiones]
import { cargarDatos } from '../src/core/datos.js';
import { simular } from '../src/motor/simular.js';
import { crearAzar } from '../src/core/azar.js';
import { crearRecluta } from '../src/campana/reclutas.js';
import { armarMision } from '../src/campana/misiones.js';
import { leerDisco } from './leer-disco.mjs';

const datos = await cargarDatos(leerDisco());
const N = Number(process.argv[2] || 40);
const SLOT = { torso: 'torso', piernas: 'piernas', cabeza: 'cabeza', mochila: 'mochila', brazo: 'brazo_der' };
const bandos = Object.values(datos.bandos.bandos).filter((b) => b.escuadras.length).concat(Object.values(datos.bandos.amenazas));
const tipos = ['defensa', 'asalto', 'escolta', 'patrulla'];
function probar(parte) {
  let g = 0;
  for (let n = 0; n < N; n++) {
    const az = crearAzar(700 + n);
    const esc = ['vanguardia', 'tirador', 'medico', 'infiltrador'].map((c, i) => crearRecluta(datos, az, 'p' + i, c));
    for (const pi of esc) { pi.nivel = 3; if (parte) pi.mecha[SLOT[datos.partes[parte].encaje]] = { parte, afijos: [] }; }
    const q = bandos[n % bandos.length];
    const mid = tipos[n % tipos.length];
    const m = armarMision(datos, mid, 3, crearAzar(90 + n), 4, { enemigos: q.escuadras, ...(datos.misiones[mid].lider ? { lider: q.lider || null } : {}) });
    if (simular(datos, { mision: m, escuadron: esc.map((p) => ({ piloto: p, mecha: p.mecha, gambits: p.gambits })), semilla: m.semilla }).victoria) g++;
  }
  return Math.round((g * 100) / N);
}
const base = probar(null);
console.log('sin cambios: ' + base + '%');
const solo = process.argv[3] || null;
const filas = Object.entries(datos.partes).filter(([id, p]) => id[0] !== '_' && p.costo > 0 && (!solo || p.encaje === solo)).map(([id, p]) => ({ id, p, v: probar(id) })).sort((a, b) => b.v - a.v);
for (const f of filas) console.log(String(f.v - base).padStart(4) + '  ' + f.id.padEnd(26) + f.p.rareza.padEnd(11) + (f.p.bando || ''));
