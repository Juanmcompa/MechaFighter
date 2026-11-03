// Moral: los eventos del tick (alguien murio, una explosion cerca...) suben o bajan la moral de cada unidad segun
// las reglas base y los ganchos "moral" de su personalidad y traumas. Al cruzar umbrales cambia su estado de moral,
// que a su vez trae ganchos propios (un Quebrado se esconde). Mismo mecanismo que las personalidades.

import { ganchos, estadoMoral } from './estado.js';

export function procesarMoral(B) {
  const M = B.datos.reglas.moral;
  const base = M.eventos_base || {};
  const antes = new Map();
  for (const u of B.unidades) if (u.viva) antes.set(u, estadoMoral(B, u));

  for (const ev of B.eventosTick) {
    const u = ev.u;
    if (!u || !u.viva || u.moralFija) continue;
    let delta = base[ev.tipo] || 0;
    for (const h of ganchos(B, u)) if (h.tipo === 'moral' && h.evento === ev.tipo) delta += h.delta;
    if (delta) u.moralActual = Math.max(0, Math.min(M.maxima, u.moralActual + delta));
  }

  // Con el tiempo se recuperan, de a poco, hasta su moral normal
  if (M.recupera_cada_ticks && B.t % M.recupera_cada_ticks === 0) {
    for (const u of B.unidades) if (u.viva && !u.moralFija && u.moralActual < u.moral) u.moralActual++;
  }

  for (const [u, e] of antes) {
    const ahora = estadoMoral(B, u);
    if (ahora !== e) B.log({ tipo: 'moral', u: u.id, estado: ahora, valor: u.moralActual });
  }
}
