// Ayudas sobre el estado de la batalla que usan decision, resolucion y moral.
// El estado (B) lo crea simular.js. Las unidades se recorren SIEMPRE con ordenUnidades(): iniciativa, bando, numero.

import { distancia, lineaDeTiro } from './espacio.js';

export const viva = (u) => u.viva;
export const vidaPct = (u) => Math.trunc((Math.max(0, u.vida) * 100) / u.vidaMax);

export function ordenUnidades(B) {
  return B.unidades.slice().sort((a, b) => b.iniciativa - a.iniciativa || a.bando - b.bando || a.num - b.num);
}

export const porId = (B, id) => B.porId.get(id) || null;

// Enemigos que conoce el bando de u. Sin niebla, todos los vivos. Con niebla, los que ve alguien de su bando.
export function enemigosConocidos(B, u) {
  const out = [];
  for (const o of B.unidades) {
    if (!o.viva || o.bando === u.bando) continue;
    if (!B.niebla || B.vistos[u.bando].has(o.id)) out.push(o);
  }
  return out;
}

export function aliados(B, u, incluirseASiMismo = false) {
  return B.unidades.filter((o) => o.viva && o.bando === u.bando && (incluirseASiMismo || o !== u));
}

// Lo que cada bando ve este tick (solo importa con niebla).
export function percibir(B) {
  if (!B.niebla) return;
  for (const b of [0, 1]) {
    const s = B.vistos[b];
    s.clear();
    for (const u of B.unidades) {
      if (!u.viva || u.bando !== b) continue;
      for (const o of B.unidades) {
        if (!o.viva || o.bando === b || s.has(o.id)) continue;
        // a la vista; o por radar (atraviesa paredes); o marcado (lo ve todo el bando)
        if ((distancia(u, o) <= u.vision && lineaDeTiro(B.tablero, u, o)) || (u.radar && distancia(u, o) <= u.radar) || mods(B, o).visible) s.add(o.id);
      }
    }
  }
}

// Estado de moral segun los umbrales de reglas.json.
export function estadoMoral(B, u) {
  if (u.moralFija) return 'moral_firme';
  const m = B.datos.reglas.moral;
  if (u.moralActual < m.umbral_quebrado) return 'moral_quebrada';
  if (u.moralActual < m.umbral_tembloroso) return 'moral_temblorosa';
  return 'moral_firme';
}

// Suma de modificadores de los estados activos (incluido el de moral).
export function mods(B, u) {
  const total = {};
  const lista = u.estados.map((e) => e.id);
  lista.push(estadoMoral(B, u));
  for (const id of lista) {
    const est = B.datos.estados[id];
    if (!est || !est.mods) continue;
    for (const [k, v] of Object.entries(est.mods)) total[k] = typeof v === 'number' ? (total[k] || 0) + v : v || total[k];
  }
  return total;
}

// Todos los ganchos que pesan sobre u ahora: los fijos (personalidad, traumas, afijos) + los de sus estados.
export function ganchos(B, u) {
  const lista = u.ganchos.slice();
  for (const e of u.estados) {
    const est = B.datos.estados[e.id];
    if (est && est.ganchos) lista.push(...est.ganchos);
  }
  const em = B.datos.estados[estadoMoral(B, u)];
  if (em && em.ganchos) lista.push(...em.ganchos);
  return lista;
}

export const tieneEstado = (u, id) => u.estados.some((e) => e.id === id);

export function ponerEstado(B, u, id, origen = null) {
  const est = B.datos.estados[id];
  if (!est || !u.viva) return;
  const ya = u.estados.find((e) => e.id === id);
  if (ya) { ya.resta = est.duracion; return; }
  u.estados.push({ id, resta: est.duracion });
  B.log({ tipo: 'estado', u: u.id, estado: id, por: origen });
}

export function quitarEstado(B, u, id) {
  const i = u.estados.findIndex((e) => e.id === id);
  if (i >= 0) { u.estados.splice(i, 1); B.log({ tipo: 'estado_fin', u: u.id, estado: id }); }
}

export function evento(B, tipo, u, extra = {}) {
  B.eventosTick.push({ tipo, u, ...extra });
}
