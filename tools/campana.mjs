// Juega campanas enteras con un piloto automatico (elige el primer nodo, contrata si puede, compra lo primero que
// le alcanza) para ver que tan dificil es la campana completa.
//   node tools/campana.mjs [cantidad] [legado]   (con 'legado', cada campana arranca con lo que dejo la anterior)
import { cargarDatos } from '../src/core/datos.js';
import { simular } from '../src/motor/simular.js';
import { nuevaPartida, nodosSiguientes, elegirNodo, seguir, comprar, contratar, escuadronParaMision, cerrarMision, equipar, reparar, costoReparacion, elegirOpcion, comprarCombustible } from '../src/campana/partida.js';
import { opcionDisponible } from '../src/campana/dilemas.js';
import { leerDisco } from './leer-disco.mjs';

const datos = await cargarDatos(leerDisco());
const N = Number(process.argv[2] || 20);
let ganadas = 0, misiones = 0, ganadasM = 0, caidos = 0, sectorMax = 0, puntaje = 0;
const t0 = Date.now();
const conLegado = process.argv[3] === 'legado';
let remolques = 0, combFinal = 0;
let legado = null, encuentros = 0, encuentrosGanados = 0, rescates = 0, veteranos = 0;
for (let n = 0; n < N; n++) {
  const p = nuevaPartida(datos, 5000 + n, conLegado ? legado : null);
  if (legado && legado.veterano) veteranos++;
  let vueltas = 0;
  while (p.estado !== 'fin' && vueltas++ < 200) {
    const nodos = nodosSiguientes(p);
    // preferir misiones, despues reclutamiento si faltan pilotos, despues lo que sea
    let i = nodos.findIndex((x) => x.tipo === 'reclutamiento' && p.pilotos.length < 4);
    if (i < 0) i = nodos.findIndex((x) => x.tipo === 'mision' || x.tipo === 'jefe');
    if (i < 0) i = 0;
    elegirNodo(datos, p, i);
    if (p.estado === 'preparacion') {
      const r = simular(datos, { mision: p.nodo.mision, escuadron: escuadronParaMision(datos, p), semilla: p.nodo.mision.semilla });
      misiones++; if (r.victoria) ganadasM++;
      const k = p.sector + (p.nodo.tipo === "jefe" ? "J" : ""); (globalThis.porSector ||= {})[k] = (globalThis.porSector[k] || [0, 0]); globalThis.porSector[k][0] += r.victoria ? 1 : 0; globalThis.porSector[k][1]++;
      const enc = !!p.nodo.mision.rivales;
      const inf = cerrarMision(datos, p, r);
      if (enc) { encuentros++; if (r.victoria) encuentrosGanados++; if (inf.rescatado) rescates++; }
    } else {
      if (p.estado === 'taller') { while (p.combustible < 4 && comprarCombustible(datos, p)); p.nodo.oferta.forEach((_, k) => comprar(datos, p, k)); }
      if (p.estado === 'evento' && p.nodo.dilema) {
        const ops = datos.dilemas[p.nodo.dilema].opciones;
        elegirOpcion(datos, p, Math.max(0, ops.findIndex((op) => opcionDisponible(datos, p, op).ok)));
      }
      if (p.estado === 'reclutamiento') p.nodo.candidatos.forEach((_, k) => contratar(datos, p, k));
      seguir(datos, p);
    }
    // reparar lo que alcance (primero las partes rotas, despues la estructura)
    if (process.argv[4] !== 'sinreparar') for (const pi of p.pilotos) {
      for (const x of costoReparacion(datos, pi).partes) reparar(datos, p, pi.id, x.slot);
      reparar(datos, p, pi.id, 'estructura');
    }
    // equipar lo mejor del inventario de forma tonta: armas nuevas en brazos vacios
    for (const pi of p.pilotos) for (const slot of ['brazo_izq', 'brazo_der']) {
      if (!pi.mecha[slot]) { const k = p.inventario.findIndex((x) => datos.partes[x.parte].encaje === 'brazo'); if (k >= 0) equipar(datos, p, pi.id, slot, k); }
    }
  }
  if (p.resultado === 'victoria') ganadas++;
  remolques += (p.stats && p.stats.remolques) || 0; combFinal += p.combustible || 0;
  legado = p.legado || null;
  if (legado && p.resultado === 'victoria' && p.pilotos.length) legado.veterano = { ...p.pilotos[0], comoLlego: 'eligio' };
  caidos += p.caidos.length;
  sectorMax += p.sector + 1;
  puntaje += p.puntaje;
}
console.log(`campanas ganadas ${Math.round((ganadas * 100) / N)}% · misiones ganadas ${Math.round((ganadasM * 100) / misiones)}% · ` +
  `caidos/campana ${(caidos / N).toFixed(1)} · sector alcanzado ${(sectorMax / N).toFixed(1)} · puntaje ${Math.round(puntaje / N)} · ${Math.round((Date.now() - t0) / N)} ms`);
console.log(Object.entries(globalThis.porSector).map(([k,[g,t]])=>k+": "+Math.round(g*100/t)+"% de "+t).join(" · "))
console.log(`remolques por campana ${(remolques / N).toFixed(1)} · combustible al final ${(combFinal / N).toFixed(1)}`);
if (conLegado) console.log(`legado: ${veteranos} veteranos · ${encuentros} encuentros con el escuadron anterior (${encuentrosGanados} ganados, ${rescates} rescates)`);
