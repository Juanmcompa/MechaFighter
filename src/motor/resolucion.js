// Aplica las intenciones de un tick. Primero todos los movimientos, despues todas las acciones, y las muertes al
// final (en simular.js): asi dos unidades pueden matarse a la vez y el orden de proceso no da ventajas escondidas.

import { distancia, cobertura } from './espacio.js';
import { vidaPct, porId, mods, ponerEstado, quitarEstado, evento, aliados } from './estado.js';
import { unidadEnemiga } from './unidades.js';

const ocupada = (B, x, y) => B.unidades.some((o) => o.viva && o.x === x && o.y === y);

function velocidadDe(B, u) {
  return Math.max(1, u.velocidad + (mods(B, u).velocidad || 0));
}

function encarar(u, x, y) {
  const dx = Math.sign(x - u.x), dy = Math.sign(y - u.y);
  if (dx || dy) { u.mx = dx; u.my = dy; }
}

export function resolverMovimientos(B, intenciones) {
  for (const { u, i } of intenciones) {
    if (i.tipo === 'mover') {
      const [x, y] = i.a;
      if (ocupada(B, x, y)) continue; // otro mas rapido llego primero
      encarar(u, x, y);
      u.x = x; u.y = y;
      u.mover = velocidadDe(B, u);
      B.log({ tipo: 'mueve', u: u.id, a: [x, y], d: u.mover });
    } else if (i.tipo === 'saltar') {
      const [x, y] = i.a;
      if (ocupada(B, x, y)) continue;
      encarar(u, x, y);
      const h = B.datos.habilidades[i.habilidad];
      usarHabilidad(B, u, i.habilidad);
      u.x = x; u.y = y;
      u.mover = velocidadDe(B, u);
      B.log({ tipo: 'salta', u: u.id, a: [x, y], d: 3 });
      u.ocupado = h.demora || 0;
    }
  }
}

function usarHabilidad(B, u, id) {
  const h = B.datos.habilidades[id];
  u.cds[id] = h.enfriamiento || 0;
  if (h.consume_mochila && u.mochila) u.mochila.usos--;
}

export function resolverAcciones(B, intenciones) {
  for (const { u, i } of intenciones) {
    switch (i.tipo) {
      case 'atacar': atacar(B, u, i); break;
      case 'recargar':
        for (const a of u.armas) if (a.municionMax && a.municion < a.municionMax && a.recargando === 0) a.recargando = a.recarga;
        B.log({ tipo: 'recarga', u: u.id });
        break;
      case 'reparar': reparar(B, u, porId(B, i.o)); break;
      case 'discutir': {
        // los dos se frenan un rato a pelearse por radio
        const r = porId(B, i.con);
        if (!r || !r.viva) break;
        u.ocupado = Math.max(u.ocupado, 10); r.ocupado = Math.max(r.ocupado, 10);
        r.discusionT = B.t;
        evento(B, 'discusion', u); evento(B, 'discusion', r);
        B.log({ tipo: 'discute', u: u.id, con: r.id });
        break;
      }
      case 'invocar': invocar(B, u, i); break;
      case 'habilidad_propia': {
        const h = B.datos.habilidades[i.habilidad];
        usarHabilidad(B, u, i.habilidad);
        if (h.efecto.estado_propio) ponerEstado(B, u, h.efecto.estado_propio, u.id);
        B.log({ tipo: 'habilidad', u: u.id, h: i.habilidad });
        u.ocupado = h.demora || 0;
        break;
      }
    }
  }
}

function atacar(B, u, i) {
  const o = porId(B, i.o);
  if (!o || !o.viva || o.vida <= 0) return;
  const R = B.datos.reglas;
  const az = B.azarCombate;
  const hab = i.habilidad ? B.datos.habilidades[i.habilidad] : null;
  const ef = hab ? hab.efecto : {};
  if (hab) { usarHabilidad(B, u, i.habilidad); B.log({ tipo: 'habilidad', u: u.id, h: i.habilidad }); u.ocupado = hab.demora || 0; }
  encarar(u, o.x, o.y);
  const mu = mods(B, u), mo = mods(B, o);

  for (const idx of i.armas) {
    const a = u.armas[idx];
    if (o.vida <= 0) break;
    const melee = a.alcance <= 1;
    const cob = melee || a.ignoraCobertura ? null : cobertura(B.tablero, o, u);
    const castigo = cob ? R.cobertura[cob] : 0;
    // pelear al lado de un amigo da confianza
    const amigo = u.amigo ? porId(B, u.amigo) : null;
    const bonusAmigo = amigo && amigo.viva && distancia(u, amigo) <= 3 ? B.datos.reglas.animo.bonus_amigo_punteria : 0;
    let chance = a.punteria + (mu.punteria || 0) + (ef.punteria || 0) + bonusAmigo - o.evasion - (mo.evasion || 0) - castigo;
    chance = Math.max(R.punteria_minima, Math.min(R.punteria_maxima, chance));
    const acierta = az.tirada(chance);
    let danio = 0, bloqueo = false;
    if (acierta) {
      danio = golpear(B, u, o, a, ef.multiplica_danio_pct || 100);
      if (danio < 0) { bloqueo = true; danio = -danio; }
    }
    B.log({ tipo: 'dispara', u: u.id, o: o.id, arma: a.tipoVisual, slot: a.slot, acierta, danio, cob, bloqueo });

    // Efectos que pueden caer aunque no pegue (la supresion asusta igual)
    if (a.estado && acierta && az.tirada(a.chanceEstado)) ponerEstado(B, o, a.estado, u.id);
    if (a.suprime && az.tirada(a.suprime)) ponerEstado(B, o, 'suprimido', u.id);
    if (ef.estado && az.tirada(ef.chance || 100)) {
      for (const v of B.unidades) {
        if (v.viva && v.bando === o.bando && distancia(v, o) <= (ef.area || 0)) ponerEstado(B, v, ef.estado, u.id);
      }
    }
    if (a.radio) explosion(B, u, o, a);

    a.espera = a.cadencia;
    if (a.municionMax) {
      a.municion--;
      if (a.municion <= 0) a.recargando = a.recarga;
    }
  }
}

// Aplica el danio de un golpe y devuelve cuanto hizo (negativo si el escudo lo freno a la mitad).
function golpear(B, u, o, a, multPct) {
  const R = B.datos.reglas;
  const base = Math.trunc((a.danio * multPct) / 100);
  const blindaje = Math.max(0, o.blindaje + (mods(B, o).blindaje || 0) - a.perfora);
  let danio = Math.max(R.danio_minimo, base - blindaje);
  let bloqueo = false;
  if (o.escudo && a.alcance > 1 && B.azarCombate.tirada(o.escudo.bloqueo)) { danio = Math.max(1, danio >> 1); bloqueo = true; }
  herir(B, o, danio, u);
  return bloqueo ? -danio : danio;
}

export function herir(B, o, danio, autor) {
  const antes = vidaPct(o);
  o.vida -= danio;
  o.s.danioRecibido += danio;
  o.s.vidaMinPct = Math.min(o.s.vidaMinPct, vidaPct(o));
  if (autor) { autor.s.danioHecho += danio; o.ultimoAtacante = autor.id; }
  evento(B, 'recibio_impacto', o);
  if (B.vip === o && antes >= 50 && vidaPct(o) < 50) for (const v of aliados(B, o)) evento(B, 'vip_herido', v);
  // Quien tiene a "o" de vinculo se preocupa si cae a menos de la mitad
  if (antes >= 50 && vidaPct(o) < 50) for (const v of B.unidades) if (v.viva && v.vinculo === o.id) evento(B, 'vinculo_herido', v);
}

function explosion(B, u, o, a) {
  B.log({ tipo: 'explota', x: o.x, y: o.y, r: a.radio });
  for (const v of B.unidades) {
    if (!v.viva) continue;
    const d = distancia(v, o);
    if (v !== o && v.bando === o.bando && d <= a.radio) {
      const blindaje = Math.max(0, v.blindaje - a.perfora);
      const danio = Math.max(B.datos.reglas.danio_minimo, (a.danio >> 1) - blindaje);
      herir(B, v, danio, u);
      B.log({ tipo: 'esquirla', u: v.id, danio });
    }
    if (d <= a.radio + 1) { evento(B, 'explosion_cerca', v); v.s.explosiones++; }
  }
}

function reparar(B, u, o) {
  if (!o || !o.viva) return;
  const h = B.datos.habilidades.reparacion_de_campo;
  usarHabilidad(B, u, 'reparacion_de_campo');
  const cant = Math.min(h.efecto.repara, o.vidaMax - o.vida);
  o.vida += cant;
  u.s.reparado += cant;
  for (const est of h.efecto.quita_estados || []) quitarEstado(B, o, est);
  u.ocupado = h.demora || 0;
  B.log({ tipo: 'repara', u: u.id, o: o.id, cant, vida: o.vida });
}

function invocar(B, u, i) {
  const [x, y] = i.a;
  if (ocupada(B, x, y)) return;
  const h = B.datos.habilidades[i.habilidad];
  usarHabilidad(B, u, i.habilidad);
  B.agregarUnidad(unidadEnemiga(B.datos, h.efecto.invoca, 1), u.bando, x, y, u.id);
  u.ocupado = h.demora || 0;
}
