// Mantenimiento critico: los mechas no se curan solos. El daño de la estructura y las partes rotas quedan de una
// mision a la otra; repararlos cuesta creditos (o un descanso). Si no alcanza, se sale como se pueda.
//
//  - pi.mechaVida: % de estructura con el que quedo el mecha (sin el dato, 100).
//  - pieza.rota: la parte esta rota (brazo sin arma, piernas lentas, cabeza ciega) hasta repararla o cambiarla.

import { normalizarPieza } from '../motor/unidades.js';

const ZONAS = ['brazo_izq', 'brazo_der', 'piernas', 'cabeza'];

export const vidaDelMecha = (pi) => (pi.mechaVida === undefined ? 100 : pi.mechaVida);

// Con cuanto sale a la proxima mision
export function vidaDeSalida(datos, pi) {
  return Math.max(datos.reglas.mantenimiento.vida_minima_salida, vidaDelMecha(pi));
}

export function partesRotas(pi) {
  return ZONAS.filter((z) => { const pz = normalizarPieza(pi.mecha[z]); return pz && pz.rota; });
}

// Cuanto sale arreglar cada cosa
export function costoReparacion(datos, pi) {
  const M = datos.reglas.mantenimiento;
  const faltante = 100 - vidaDelMecha(pi);
  const estructura = faltante > 0 ? Math.ceil((faltante * M.quintos_por_pct) / 5) : 0;
  const partes = partesRotas(pi).map((z) => {
    const pz = normalizarPieza(pi.mecha[z]);
    return { slot: z, costo: Math.ceil(((datos.partes[pz.parte].costo || 40) * M.parte_rota_pct) / 100) };
  });
  return { estructura, partes, total: estructura + partes.reduce((s, x) => s + x.costo, 0) };
}

function marcarSana(pi, z) {
  const pz = normalizarPieza(pi.mecha[z]);
  if (pz) { delete pz.rota; pi.mecha[z] = pz; }
}

// que: 'estructura', una zona ('brazo_izq'...), o 'todo'. Gratis si se pasa gratis=true (descanso).
export function reparar(datos, p, pilotoId, que, gratis = false) {
  const pi = p.pilotos.find((x) => x.id === pilotoId);
  if (!pi) return false;
  const c = costoReparacion(datos, pi);
  let costo = 0;
  if (que === 'estructura') costo = c.estructura;
  else if (que === 'todo') costo = c.total;
  else { const x = c.partes.find((y) => y.slot === que); if (!x) return false; costo = x.costo; }
  if (!costo) return false;
  if (!gratis && p.creditos < costo) return false;
  if (!gratis) p.creditos -= costo;
  if (que === 'estructura' || que === 'todo') pi.mechaVida = 100;
  if (que === 'todo') for (const z of partesRotas(pi)) marcarSana(pi, z);
  else if (que !== 'estructura') marcarSana(pi, que);
  return true;
}

// Despues de la mision: como quedo el mecha de cada piloto que volvio
export function anotarDanios(datos, p, resultado, herido) {
  const ref = new Map();
  for (const e of resultado.registro || []) {
    if (e.tipo === 'aparece' && e.ficha.bando === 0 && e.ficha.tipo === 'piloto') ref.set(e.u, e.ficha.ref);
    if (e.tipo === 'parte_rota' && !e.inicial && ref.has(e.u)) {
      const pi = p.pilotos.find((x) => x.id === ref.get(e.u));
      if (pi && pi.mecha[e.zona]) { const pz = normalizarPieza(pi.mecha[e.zona]); pz.rota = true; pi.mecha[e.zona] = pz; }
    }
  }
  for (const pi of p.pilotos) {
    const s = resultado.resumen.pilotos[pi.id];
    if (!s) continue;
    // si lo dieron por muerto y volvio, el mecha quedo en lo minimo
    pi.mechaVida = herido.has(pi.id) ? 0 : Math.max(0, Math.min(100, s.vidaFinalPct));
  }
}
