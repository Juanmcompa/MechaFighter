// Personajes que se repiten: oficiales de cada bando, pilotos propios que se van (y vuelven del otro lado) y la
// compania rival. Todos usan el sistema de nemesis (nemesis.js): aparecen en contratos, escapan, vuelven.
// Datos: bandos.json (oficiales, rival) y reglas.json (malestar).
import { nuevo, mechaCon, activos } from './nemesis.js';
import { crearRecluta } from './reclutas.js';
import { fotoPiloto } from './legado.js';
import { relaciones } from './animo.js';
import { escalonDe, quien } from './brujula.js';
import { anotar, sumarStat } from './cronica.js';

// ---------- Oficiales ----------

const vivo = (p, clave) => !(p.nemesis || []).some((n) => n.oficial === clave && n.estado === 'muerto');

// Tu contacto en un bando: su primer oficial que siga vivo
export function contactoDe(datos, p, bando) {
  const lista = (datos.bandos.bandos[bando] || {}).oficiales || [];
  const i = lista.findIndex((_, k) => vivo(p, bando + ':' + k));
  return i < 0 ? null : lista[i];
}

// Despues de ganarle un contrato a un bando: quizas uno de sus oficiales empieza a seguirlos
export function oficialTomaNota(datos, p, m, az) {
  const O = datos.bandos.oficiales;
  const B = datos.bandos.bandos[m.objetivo];
  if (!B || !B.oficiales || !B.oficiales.length) return null;
  const hostil = escalonDe(datos, p, m.objetivo).id === 'hostil';
  // si el bando ya los caza, sus oficiales activos salen a buscarlos a cualquier contrato
  for (const n of activos(p)) if (n.origen === 'oficial' && n.bando === m.objetivo) n.caza = hostil;
  if (activos(p).filter((n) => n.origen === 'oficial' && n.bando === m.objetivo).length >= O.max_por_bando) return null;
  if (!hostil && !az.tirada(O.chance_toma_nota)) return null;
  const k = B.oficiales.findIndex((_, i) => vivo(p, m.objetivo + ':' + i) && !(p.nemesis || []).some((n) => n.oficial === m.objetivo + ':' + i));
  if (k < 0) return null;
  const o = B.oficiales[k];
  const total = (datos.reglas.arte && datos.reglas.arte.retratos) || 0;
  const base = { apodo: o.apodo, nombre: o.nombre, retrato: total ? az.entero(1, total) : 0, clase: o.clase, personalidad: o.personalidad, mecha: mechaCon(datos, o.clase, o.partes), gambits: null };
  const n = nuevo(datos, p, az, 'oficial', null, '«' + m.nombre + '»', (m.nivel || 1) + O.nivel_extra, base,
    { bando: m.objetivo, bandoNombre: B.nombre, oficial: m.objetivo + ':' + k, caza: hostil });
  anotar(p, '«' + n.apodo + '», de ' + B.nombre + ', empezó a seguirlos.', 'mision');
  return n;
}

// ---------- Malestar y desercion ----------

// Despues de cada mision: como queda cada piloto. salieron: ids de los que pelearon. Devuelve los que avisan que se van.
export function actualizarMalestar(datos, p, salieron, victoria, vinculoMurio) {
  const M = datos.reglas.malestar;
  const T = datos.reglas.tareas;
  for (const pi of p.pilotos) {
    let d = 0;
    if (salieron.has(pi.id)) d -= victoria ? M.al_ganar : 0;
    else if (!(pi.tarea && T[pi.tarea] && T[pi.tarea].cura_traumas)) d += M.por_banco;
    const r = relaciones(datos, p, pi);
    if (r.rivales.length && !r.amigos.length) d += M.por_rivales;
    if (vinculoMurio.has(pi.id)) d += M.por_vinculo_muerto;
    pi.malestar = Math.max(0, Math.min(100, (pi.malestar || 0) + d));
  }
}

export function pagarBono(datos, p, id) {
  const M = datos.reglas.malestar;
  const pi = p.pilotos.find((x) => x.id === id);
  if (!pi || p.creditos < M.bono_creditos || !(pi.malestar > 0)) return false;
  p.creditos -= M.bono_creditos;
  pi.malestar = Math.max(0, pi.malestar - M.bono_baja);
  return true;
}

// Al saltar: el que llego al limite se va con su mecha y firma con la compania rival. Devuelve [{ apodo }]
export function desertar(datos, p, az) {
  const M = datos.reglas.malestar;
  const idos = [];
  for (const pi of p.pilotos.slice()) {
    if ((pi.malestar || 0) < 100 || p.pilotos.length <= M.minimo_pilotos) continue;
    p.pilotos.splice(p.pilotos.indexOf(pi), 1);
    for (const o of p.pilotos) if (o.vinculo === pi.id) o.vinculo = null;
    // se la agarra con el que peor se llevaba (si habia)
    const peor = relaciones(datos, { ...p, pilotos: p.pilotos.concat(pi) }, pi).rivales.sort((a, b) => a.valor - b.valor)[0];
    const rival = rivalDe(datos, p);
    const n = nuevo(datos, p, az, 'desertor', peor ? peor.piloto : null, 'la nave', pi.nivel, fotoPiloto(pi), { bandoNombre: rival.nombre, desertor: true });
    idos.push({ apodo: pi.apodo, nemesis: n.id, rival: rival.nombre });
    sumarStat(p, 'desertores');
    anotar(p, '«' + pi.apodo + '» se fue de la compañía con su mecha. Firmó con ' + rival.nombre + '.', 'recluta');
  }
  return idos;
}

// ---------- Compania rival ----------

export function rivalDe(datos, p) {
  if (!p.rival) {
    const R = datos.bandos.rival;
    let h = 0;
    for (const c of String(p.semilla)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    p.rival = { nombre: R.nombres[h % R.nombres.length], fuerza: 0, contratos: 0, cruces: 0, ganados: 0 };
  }
  return p.rival;
}

// Un contrato que dejaste vencer: se lo queda la competencia
export function rivalTomaContrato(datos, p, cuantos) {
  if (!cuantos) return;
  const r = rivalDe(datos, p);
  r.contratos += cuantos;
  r.fuerza = Math.min(100, r.fuerza + cuantos * datos.bandos.rival.fuerza_por_contrato);
}

// Al aceptar un contrato contra un bando: quizas la compania rival trabaja para el otro lado
export function rivalEnContrato(datos, p, m, az) {
  const R = datos.bandos.rival;
  const r = rivalDe(datos, p);
  if (!m.cliente || !datos.bandos.bandos[m.objetivo] || m.rivales || p.misionesJugadas < R.desde_mision) return false;
  if (!az.tirada(Math.min(R.chance_max, R.chance_base + (r.fuerza >> 1)))) return false;
  const n = az.entero(R.mercenarios[0], R.mercenarios[1]);
  const usados = p.pilotos.map((x) => x.apodo);
  m.rivales = [];
  for (let k = 0; k < n; k++) {
    const pi = crearRecluta(datos, az, 'rv' + p.misionesJugadas + '_' + k, null, usados);
    usados.push(pi.apodo);
    pi.nivel = Math.max(1, Math.min(6, (m.nivel || 1) - 1 + (r.fuerza >= 50 ? 1 : 0)));
    m.rivales.push({ piloto: pi, mecha: pi.mecha, gambits: pi.gambits });
  }
  m.rival = r.nombre;
  m.cantidadEnemigos = (m.cantidadEnemigos || 0) + n;
  return true;
}

// Despues de cruzarlos: si ganaste, premio y pierden fuerza
export function rivalDespues(datos, p, m, victoria) {
  if (!m.rival) return null;
  const R = datos.bandos.rival;
  const r = rivalDe(datos, p);
  r.cruces++;
  if (!victoria) { r.fuerza = Math.min(100, r.fuerza + R.fuerza_por_contrato); return { nombre: r.nombre, gano: false }; }
  r.ganados++;
  r.fuerza = Math.max(0, r.fuerza - R.fuerza_al_perder);
  p.creditos += R.premio;
  return { nombre: r.nombre, gano: true, premio: R.premio };
}

export { quien };
