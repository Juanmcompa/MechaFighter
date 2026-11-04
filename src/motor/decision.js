// Como decide cada unidad en cada tick. Devuelve una INTENCION; no cambia nada del estado (eso es resolucion.js).
//
//   A. Anulaciones: ganchos "anular" (personalidad, traumas, moral) por prioridad. El primero que se cumple manda.
//   B. Lista efectiva: los gambits con correr_umbral, subir_prioridad e ignorar_condicion aplicados (copia).
//   C. De arriba abajo: condicion -> objetivo -> se puede? -> intencion. Si no se puede, el gambit siguiente.
//   D. Por defecto: ir al objetivo de la mision si no hay enemigos a la vista; si no, cubrirse; si no, quieto.
//
// El motor no sabe que es un Cobarde: solo aplica ganchos.

import { distancia, lineaDeTiro, cobertura, pasoHacia, campo, caminable, vecinos } from './espacio.js';
import { enemigosConocidos, aliados, vidaPct, porId, ganchos as ganchosDe, mods, tieneEstado } from './estado.js';

// ---------- Datos que se pueden leer en una condicion ----------

function propiedad(B, u, prop) {
  if (!u) return null;
  switch (prop) {
    case 'vida_pct': return vidaPct(u);
    case 'moral': return u.moralActual;
    case 'municion': {
      if (!u.armas.length) return 0;
      let total = 0;
      for (const a of u.armas) total += a.municionMax ? a.municion : 999;
      return total;
    }
    default: return typeof u[prop] === 'number' ? u[prop] : null;
  }
}

function leerDato(B, ctx, dato) {
  const punto = dato.indexOf('.');
  if (punto < 0) {
    if (!ctx.otro) return null;
    if (dato === 'distancia') return distancia(ctx.u, ctx.otro);
    return propiedad(B, ctx.otro, dato);
  }
  const quien = dato.slice(0, punto), prop = dato.slice(punto + 1);
  if (quien === 'yo') return propiedad(B, ctx.u, prop);
  if (quien === 'mision') return prop === 'tick' ? B.t : null;
  const sel = elegirObjetivo(B, ctx.u, quien);
  return sel && sel.id ? propiedad(B, sel, prop) : null;
}

function comparar(a, op, b) {
  switch (op) {
    case '<': return a < b;
    case '<=': return a <= b;
    case '>': return a > b;
    case '>=': return a >= b;
    case '==': return a === b;
    case '!=': return a !== b;
  }
  return false;
}

// ---------- Funciones del motor (lista cerrada, ver gambits.json > funciones) ----------

export function enAlcance(B, u, o, arma) {
  const d = distancia(u, o);
  if (d > arma.alcance) return false;
  return arma.alcance <= 1 ? d <= 1 : lineaDeTiro(B.tablero, u, o);
}

const FUNCIONES = {
  a_tiro: (B, ctx) => !!ctx.otro && ctx.u.armas.some((a) => enAlcance(B, ctx.u, ctx.otro, a)),
  aislado: (B, ctx) => !!ctx.otro && !B.unidades.some((o) => o.viva && o !== ctx.otro && o.bando === ctx.otro.bando && distancia(o, ctx.otro) <= 3),
  en_cobertura: (B, ctx) => {
    const e = elegirObjetivo(B, ctx.u, 'enemigo_cercano');
    return !!e && cobertura(B.tablero, ctx.u, e) !== null;
  },
  flanqueado: (B, ctx) => {
    if (!FUNCIONES.en_cobertura(B, ctx)) return false;
    return enemigosConocidos(B, ctx.u).some((e) => distancia(e, ctx.u) <= 8 && lineaDeTiro(B.tablero, e, ctx.u) && cobertura(B.tablero, ctx.u, e) === null);
  },
  hay_vip: (B) => !!B.vip && B.vip.viva,
  // radar: hay un enemigo cerca que no se ve (detras de una pared)
  radar_oculto: (B, ctx) => !!ctx.u.radar && B.unidades.some((o) => o.viva && o.bando !== ctx.u.bando && o.tipo !== 'invocacion' &&
    distancia(ctx.u, o) <= ctx.u.radar && !lineaDeTiro(B.tablero, ctx.u, o)),
  // escolta peleando: un aliado cerca del que pregunta (a 5 o menos) tiene a tiro a un enemigo
  escolta_peleando: (B, ctx) => aliados(B, ctx.u).some((a) => a.tipo === 'piloto' && distancia(a, ctx.u) <= 5 &&
    enemigosConocidos(B, a).some((e) => a.armas.some((w) => enAlcance(B, a, e, w)))),
  esta_marcado: (B, ctx) => !!ctx.otro && tieneEstado(ctx.otro, 'marcado')
};

// ---------- Evaluar el arbol de una condicion ----------

export function evaluar(B, ctx, e, params) {
  if (e === true || e === false) return e;
  if (e.todos) return e.todos.every((x) => evaluar(B, ctx, x, params));
  if (e.alguno) return e.alguno.some((x) => evaluar(B, ctx, x, params));
  if (e.no !== undefined) return !evaluar(B, ctx, e.no, params);
  if (e.existe) {
    const lista = e.existe === 'enemigo' ? enemigosConocidos(B, ctx.u) : aliados(B, ctx.u);
    return lista.some((o) => (e.donde ? evaluar(B, { ...ctx, otro: o }, e.donde, params) : true));
  }
  if (e.fn) return FUNCIONES[e.fn] ? FUNCIONES[e.fn](B, ctx) : false;
  if (e.dato) {
    const v = leerDato(B, ctx, e.dato);
    if (v === null || v === undefined) return false;
    let umbral = e.param !== undefined ? params[e.param] : e.valor;
    if (ctx.corrimientos && ctx.corrimientos[e.dato]) umbral += ctx.corrimientos[e.dato];
    return comparar(v, e.op, umbral);
  }
  return false;
}

// ---------- Objetivos (selectores) ----------

const masCerca = (u) => (a, b) => distancia(u, a) - distancia(u, b) || a.num - b.num;
const dps = (o) => o.armas.reduce((m, a) => Math.max(m, Math.trunc((a.danio * 10) / a.cadencia)), 0);

export function centroZona(z) {
  return { x: (z[0][0] + z[1][0]) >> 1, y: (z[0][1] + z[1][1]) >> 1, punto: true };
}

// La casilla libre de la zona mas cercana a u (si ya esta adentro, la suya): asi cada uno ocupa su lugar.
function casillaDeZona(B, u, z) {
  const ocupada = ocupadaPara(B, u);
  if (u.x >= z[0][0] && u.x <= z[1][0] && u.y >= z[0][1] && u.y <= z[1][1]) {
    // Ya adentro: se corre hacia el fondo de la zona (la esquina mas lejos de donde arranco el escuadron),
    // asi deja libre la entrada para los que vienen atras.
    const [sx, sy] = B.mapa.aparicion.jugador[0];
    let fondo = null, lejos = -1;
    for (const cx of [z[0][0], z[1][0]]) for (const cy of [z[0][1], z[1][1]]) {
      const d = distancia({ x: cx, y: cy }, { x: sx, y: sy });
      if (d > lejos) { fondo = { x: cx, y: cy }; lejos = d; }
    }
    let mejor = { x: u.x, y: u.y, punto: true }, mejorD = distancia(u, fondo);
    for (let y = z[0][1]; y <= z[1][1]; y++) {
      for (let x = z[0][0]; x <= z[1][0]; x++) {
        if (!caminable(B.tablero, x, y) || ocupada(x, y) || distancia({ x, y }, u) > 1) continue;
        const d = distancia({ x, y }, fondo);
        if (d < mejorD) { mejor = { x, y, punto: true }; mejorD = d; }
      }
    }
    return mejor;
  }
  let mejor = null, mejorD = 32767;
  for (let y = z[0][1]; y <= z[1][1]; y++) {
    for (let x = z[0][0]; x <= z[1][0]; x++) {
      if (!caminable(B.tablero, x, y) || ocupada(x, y)) continue;
      const d = distancia(u, { x, y });
      if (d < mejorD) { mejor = { x, y, punto: true }; mejorD = d; }
    }
  }
  return mejor || centroZona(z);
}

export function elegirObjetivo(B, u, sel) {
  switch (sel) {
    case 'yo': return u;
    case 'enemigo_cercano': return enemigosConocidos(B, u).sort(masCerca(u))[0] || null;
    case 'enemigo_mas_debil': return enemigosConocidos(B, u).sort((a, b) => vidaPct(a) - vidaPct(b) || masCerca(u)(a, b))[0] || null;
    case 'enemigo_mas_peligroso': return enemigosConocidos(B, u).sort((a, b) => dps(b) - dps(a) || masCerca(u)(a, b))[0] || null;
    case 'enemigo_aislado': return enemigosConocidos(B, u).filter((o) => FUNCIONES.aislado(B, { u, otro: o })).sort(masCerca(u))[0] || null;
    // (una torreta o un señuelo no son a quien seguir: no se mueven, y el resto del escuadron se iba sin el)
    case 'aliado_cercano': return aliados(B, u).filter((o) => o.tipo !== 'invocacion').sort(masCerca(u))[0] || null;
    case 'aliado_mas_herido': return aliados(B, u).filter((o) => o.vida < o.vidaMax && o.tipo !== 'invocacion').sort((a, b) => vidaPct(a) - vidaPct(b) || masCerca(u)(a, b))[0] || null;
    case 'vinculo': { const v = u.vinculo ? porId(B, u.vinculo) : null; return v && v.viva ? v : null; }
    case 'vip': return B.vip && B.vip.viva ? B.vip : null;
    case 'objetivo_mision': return objetivoMision(B, u);
    case 'lejos_de_enemigos': return { especial: 'lejos' };
    case 'enemigo_marcado': return enemigosConocidos(B, u).filter((o) => tieneEstado(o, 'marcado')).sort(masCerca(u))[0] || null;
  }
  return null;
}

// Ticks que le quedan a u de estar desorientado (gancho "perdido"); 0 si no lo esta.
function ticksPerdido(B, u) {
  let t = 0;
  for (const h of u.ganchos.concat(...u.estados.map((e) => (B.datos.estados[e.id] || {}).ganchos || []))) {
    if (h.tipo === 'perdido') t = Math.max(t, h.ticks);
  }
  return t > B.t ? t : 0;
}

function objetivoMision(B, u) {
  const m = B.mision;
  const real = objetivoReal(B, u);
  // Desorientado: va para el lado equivocado (el espejo del objetivo) hasta que se ubica
  if (real && u.bando === 0 && ticksPerdido(B, u)) {
    const [ancho, alto] = B.mapa.tamano;
    const x = Math.max(1, Math.min(ancho - 2, ancho - 1 - real.x)), y = Math.max(1, Math.min(alto - 2, alto - 1 - real.y));
    return { x, y, punto: true, falso: true };
  }
  return real;
}

function objetivoReal(B, u) {
  const m = B.mision;
  if (u.bando === 0) {
    // Escolta: el objetivo de los pilotos es acompanar al transporte, no meterse en la zona. Si la llenan,
    // el escoltado no puede entrar (pasaba con escuadrones de 5 o 6).
    if (B.vip && B.vip.viva && u !== B.vip) return B.vip;
    if (m.zonaMeta) return casillaDeZona(B, u, B.mapa.zonas[m.zonaMeta]);
    if (B.lider && B.lider.viva) return B.lider;
  } else {
    if (B.vip && B.vip.viva) return B.vip;
    if (m.zonaDefender) return centroZona(B.mapa.zonas[m.zonaDefender]);
  }
  // Sin nada mas que hacer y sin enemigos a la vista (tormenta, noche): salir a buscarlos hacia donde entraron.
  const lado = B.mapa.aparicion[u.bando === 0 ? 'enemigo' : 'jugador'];
  const [x, y] = lado[u.num % lado.length];
  return { x, y, punto: true, explorar: true };
}

// ---------- Acciones: si se pueden hacer, devuelven la intencion ----------

function ocupadaPara(B, u) {
  return (x, y) => B.unidades.some((o) => o.viva && o !== u && o.x === x && o.y === y);
}

// Un paso hacia algo, respetando la correa (si la hay) y si la unidad puede moverse.
function mover(B, u, gx, gy, correa) {
  if (u.mover > 0) return { tipo: 'esperar' }; // se esta moviendo: sigue con el mismo plan
  if (u.fijo || mods(B, u).inmovil) return null;
  if (u === B.vip) {
    // el escoltado no esquiva a los suyos (si los rodeaba, iba y venia sin avanzar): sigue su camino
    // y si un aliado le tapa el paso, espera a que se corra (ver abrirPaso)
    const ocupada = ocupadaPara(B, u);
    const pasoLibre = pasoHacia(B.tablero, u, gx, gy, (x, y) => B.unidades.some((o) => o.viva && o !== u && o.bando !== u.bando && o.x === x && o.y === y) || (ocupada(x, y) && B.unidades.some((o) => o.viva && o.fijo && o.x === x && o.y === y)));
    if (!pasoLibre) return null;
    return ocupada(pasoLibre[0], pasoLibre[1]) ? { tipo: 'esperar' } : { tipo: 'mover', a: pasoLibre };
  }
  const paso = pasoHacia(B.tablero, u, gx, gy, ocupadaPara(B, u));
  if (!paso) return null;
  if (correa && distancia({ x: paso[0], y: paso[1] }, correa.ancla) > correa.max && distancia(u, correa.ancla) <= correa.max) return null;
  return { tipo: 'mover', a: paso };
}

const armasListas = (u, filtro) => u.armas.filter((a) => filtro(a) && a.espera === 0 && a.recargando === 0 && (!a.municionMax || a.municion > 0));

function puedeHabilidad(B, u, id) {
  if (!u.habilidades.includes(id)) return false;
  if ((u.cds[id] || 0) > 0 || mods(B, u).sin_habilidades) return false;
  const h = B.datos.habilidades[id];
  if (h.consume_mochila && !(u.mochila && u.mochila.usos > 0)) return false;
  if (h.requiere_parte && !u.etiquetasPartes.includes(h.requiere_parte)) return false;
  return true;
}

function disparo(B, u, o, filtro, extra = {}) {
  const enRango = u.armas.filter((a) => filtro(a) && enAlcance(B, u, o, a));
  if (!enRango.length) return null;
  const listas = armasListas(u, (a) => enRango.includes(a));
  if (listas.length) return { tipo: 'atacar', o: o.id, armas: listas.map((a) => u.armas.indexOf(a)), ...extra };
  if (enRango.some((a) => a.municionMax && a.municion === 0 && a.recargando === 0)) return { tipo: 'recargar' };
  return { tipo: 'esperar' }; // apuntando: el arma se esta enfriando
}

const aDistancia = (a) => a.alcance > 1;
const cuerpoACuerpo = (a) => a.alcance <= 1;

function accion(B, u, id, obj, correa) {
  const H = B.datos.habilidades;
  const esUnidad = obj && obj.id;
  switch (id) {
    case 'disparar': {
      if (!esUnidad || obj.bando === u.bando) return null;
      // si al elegido no lo tiene a tiro (una pared en el medio), le tira al mas cercano que si tenga:
      // la condicion "enemigo a rango" se cumplia y quedaba sin hacer nada
      return disparo(B, u, obj, aDistancia) || otroATiro(B, u, obj);
    }

    case 'disparar_cabina': {
      // solo contra mechas (los que tienen partes que saquear)
      if (!esUnidad || obj.bando === u.bando || !obj.slots || obj.tipo === 'invocacion') return null;
      const i = disparo(B, u, obj, aDistancia);
      return i && i.tipo === 'atacar' ? { ...i, cabina: true } : i;
    }

    case 'atacar_cuerpo_a_cuerpo': {
      if (!esUnidad || obj.bando === u.bando || !u.armas.some(cuerpoACuerpo)) return null;
      if (distancia(u, obj) <= 1) return disparo(B, u, obj, cuerpoACuerpo);
      return mover(B, u, obj.x, obj.y, correa);
    }

    case 'suprimir': {
      if (!esUnidad || obj.bando === u.bando || !puedeHabilidad(B, u, 'fuego_de_supresion')) return null;
      const i = disparo(B, u, obj, (a) => a.etiquetas.includes('supresion'));
      return i && i.tipo === 'atacar' ? { ...i, habilidad: 'fuego_de_supresion' } : i;
    }

    case 'disparo_apuntado': {
      if (!esUnidad || obj.bando === u.bando || !puedeHabilidad(B, u, 'disparo_apuntado')) return null;
      const i = disparo(B, u, obj, aDistancia);
      if (!i || i.tipo !== 'atacar') return i;
      return { ...i, armas: [i.armas[0]], habilidad: 'disparo_apuntado' };
    }

    case 'avanzar': {
      if (!obj || obj.especial) return null;
      // a un punto se llega; a un enemigo, al lado; al escoltado se lo acompana dejandole lugar
      // a un punto se llega; a un enemigo, al lado; al escoltado se lo acompana dejandole lugar
      const meta = obj.punto ? 0 : obj === B.vip && u.bando === obj.bando ? 2 : 1;
      if (distancia(u, obj) <= meta) return null;
      return mover(B, u, obj.x, obj.y, correa);
    }

    case 'flanquear': {
      if (!esUnidad || obj.bando === u.bando) return null;
      const alcance = Math.min(6, Math.max(1, ...u.armas.map((a) => a.alcance)));
      const yaEsta = cobertura(B.tablero, obj, u) === null && u.armas.some((a) => enAlcance(B, u, obj, a));
      if (yaEsta) return disparo(B, u, obj, () => true);
      const desdeMi = campo(B.tablero, u.x, u.y);
      const ocupada = ocupadaPara(B, u);
      let mejor = null, mejorD = 32767;
      for (let y = obj.y - alcance; y <= obj.y + alcance; y++) {
        for (let x = obj.x - alcance; x <= obj.x + alcance; x++) {
          if (!caminable(B.tablero, x, y) || ocupada(x, y)) continue;
          const c = { x, y };
          if (distancia(c, obj) < 1 || cobertura(B.tablero, obj, c) !== null || !lineaDeTiro(B.tablero, c, obj)) continue;
          const d = desdeMi[y * B.tablero.ancho + x];
          if (d >= 0 && d < mejorD) { mejor = c; mejorD = d; }
        }
      }
      return mejor ? mover(B, u, mejor.x, mejor.y, correa) : null;
    }

    case 'seguir': {
      if (!esUnidad || obj === u) return null;
      // ya esta al lado: en combate se queda ahi (si devolvia "nada", bajaba a cubrirse y volvia: quedaba bailando);
      // sin enemigos a la vista, no hace nada y el resto sigue (si no, nadie arrancaba)
      if (distancia(u, obj) <= 2) return enemigosConocidos(B, u).length ? { tipo: 'mantener' } : null;
      return mover(B, u, obj.x, obj.y, correa);
    }

    case 'replegarse': {
      const enemigos = enemigosConocidos(B, u);
      if (!enemigos.length) return null;
      if (u.mover > 0) return { tipo: 'esperar' };
      if (u.fijo || mods(B, u).inmovil) return null;
      const lejania = (c) => Math.min(...enemigos.map((e) => distancia(c, e)));
      const actual = lejania(u);
      const ocupada = ocupadaPara(B, u);
      let mejor = null, mejorV = actual;
      for (const [x, y] of vecinos(B.tablero, u.x, u.y)) {
        // no volver a la casilla de recien (si no, en un rincon iba y venia entre dos)
        if (ocupada(x, y) || (u.antes && u.antes[0] === x && u.antes[1] === y)) continue;
        const v = lejania({ x, y });
        if (v > mejorV) { mejor = [x, y]; mejorV = v; }
      }
      return mejor ? { tipo: 'mover', a: mejor } : null;
    }

    case 'buscar_cobertura': {
      const e = elegirObjetivo(B, u, 'enemigo_cercano');
      if (!e) return null;
      // si nadie lo puede alcanzar ni el alcanza a nadie, no hay de que cubrirse (si no, se quedaba quieto para siempre)
      if (!amenazado(B, u)) return null;
      // cubierto y sin que nadie pueda tirarle ni el a nadie: espera un rato y despues sale a buscar (si no, quieto para siempre)
      if (hayTiro(B, u)) { u.sinTiroDesde = null; u.aburrido = false; }
      else if (u.sinTiroDesde == null) u.sinTiroDesde = B.t;
      else if (B.t - u.sinTiroDesde > 50) { u.aburrido = true; return null; }
      if (cobertura(B.tablero, u, e) !== null) return { tipo: 'mantener' };
      // recien llego a un refugio: se queda un rato (si no, saltaba entre dos casillas segun quien estuviera mas cerca)
      if (u.refugio && u.refugio.x === u.x && u.refugio.y === u.y && B.t - u.refugio.t < 40) return { tipo: 'mantener' };
      const desdeMi = campo(B.tablero, u.x, u.y);
      const ocupada = ocupadaPara(B, u);
      let mejor = null, mejorV = 32767;
      for (let y = u.y - 5; y <= u.y + 5; y++) {
        for (let x = u.x - 5; x <= u.x + 5; x++) {
          if (!caminable(B.tablero, x, y) || ocupada(x, y)) continue;
          const d = desdeMi[y * B.tablero.ancho + x];
          if (d < 0 || d > 6) continue;
          const cob = cobertura(B.tablero, { x, y }, e);
          if (!cob) continue;
          const v = d + (cob === 'total' ? 0 : 2);
          if (v < mejorV) { mejor = { x, y }; mejorV = v; }
        }
      }
      if (!mejor) return null;
      u.refugio = { x: mejor.x, y: mejor.y, t: B.t };
      return mover(B, u, mejor.x, mejor.y, correa);
    }

    case 'mantener':
      return { tipo: 'mantener' };

    case 'recargar':
      return u.armas.some((a) => a.municionMax && a.municion < a.municionMax && a.recargando === 0) ? { tipo: 'recargar' } : null;

    case 'reparar': {
      if (!esUnidad || obj.bando !== u.bando || obj === u || obj.vida >= obj.vidaMax || !puedeHabilidad(B, u, 'reparacion_de_campo')) return null;
      if (distancia(u, obj) <= H.reparacion_de_campo.alcance) return { tipo: 'reparar', o: obj.id };
      return mover(B, u, obj.x, obj.y, correa);
    }

    case 'desplegar_torreta': {
      if (!puedeHabilidad(B, u, 'desplegar_torreta') || !enemigosConocidos(B, u).length) return null;
      const ocupada = ocupadaPara(B, u);
      const libre = vecinos(B.tablero, u.x, u.y).find(([x, y]) => !ocupada(x, y));
      return libre ? { tipo: 'invocar', habilidad: 'desplegar_torreta', a: libre } : null;
    }

    case 'propulsion': {
      if (!obj || obj.especial || !puedeHabilidad(B, u, 'propulsion') || distancia(u, obj) <= 2) return null;
      if (mods(B, u).inmovil) return null;
      const salto = B.datos.habilidades.propulsion.efecto.salto;
      const ocupada = ocupadaPara(B, u);
      const c = campo(B.tablero, obj.x, obj.y);
      const actual = c[u.y * B.tablero.ancho + u.x];
      let mejor = null, mejorD = actual;
      for (let y = u.y - salto; y <= u.y + salto; y++) {
        for (let x = u.x - salto; x <= u.x + salto; x++) {
          if (!caminable(B.tablero, x, y) || ocupada(x, y) || (x === obj.x && y === obj.y)) continue;
          const d = c[y * B.tablero.ancho + x];
          if (d >= 1 && d < mejorD) { mejor = [x, y]; mejorD = d; }
        }
      }
      return mejor ? { tipo: 'saltar', a: mejor, habilidad: 'propulsion' } : null;
    }

    // ---- Habilidades especiales de las partes (ver partes.json › habilidad) ----
    case 'marcar_objetivo':
    case 'pulso_emp': {
      const hid = id;
      if (!esUnidad || obj.bando === u.bando || !puedeHabilidad(B, u, hid)) return null;
      if (obj.tipo === 'invocacion' || (hid === 'marcar_objetivo' && tieneEstado(obj, 'marcado')) || (hid === 'pulso_emp' && tieneEstado(obj, 'emp'))) return null;
      const h = H[hid];
      if (distancia(u, obj) > h.alcance) return null;
      if (!h.ve_sin_linea && !lineaDeTiro(B.tablero, u, obj)) return null;
      return { tipo: 'aplicar', o: obj.id, habilidad: hid };
    }

    case 'enganchar': {
      if (!esUnidad || obj.bando === u.bando || obj.tipo === 'invocacion' || !puedeHabilidad(B, u, 'enganchar')) return null;
      const d = distancia(u, obj);
      if (d <= 1 || d > H.enganchar.alcance || !lineaDeTiro(B.tablero, u, obj)) return null;
      return { tipo: 'enganchar', o: obj.id, habilidad: 'enganchar' };
    }

    case 'anclarse':
    case 'sobrecarga': {
      const hid = id;
      const est = H[hid].efecto.estado_propio;
      if (!puedeHabilidad(B, u, hid) || tieneEstado(u, est) || !enemigosConocidos(B, u).length) return null;
      // anclarse solo sirve si ya tiene a quien tirarle
      if (hid === 'anclarse' && !enemigosConocidos(B, u).some((e) => u.armas.some((a) => a.alcance > 1 && enAlcance(B, u, e, a)))) return null;
      return { tipo: 'habilidad_propia', habilidad: hid };
    }

    case 'desplegar_senuelo': {
      if (!puedeHabilidad(B, u, 'desplegar_senuelo')) return null;
      const e = elegirObjetivo(B, u, 'enemigo_cercano');
      if (!e) return null;
      // el holograma va entre el mecha y el enemigo, a 1 o 2 casillas
      const ocupada = ocupadaPara(B, u);
      let mejor = null, mejorD = 32767;
      for (let y = u.y - 2; y <= u.y + 2; y++) {
        for (let x = u.x - 2; x <= u.x + 2; x++) {
          if (!caminable(B.tablero, x, y) || ocupada(x, y) || (x === u.x && y === u.y)) continue;
          const d = distancia({ x, y }, e);
          if (d < mejorD) { mejor = [x, y]; mejorD = d; }
        }
      }
      return mejor ? { tipo: 'invocar', habilidad: 'desplegar_senuelo', a: mejor } : null;
    }

    case 'muro_de_escudos': {
      if (!puedeHabilidad(B, u, 'muro_de_escudos') || tieneEstado(u, 'atrincherado') || !enemigosConocidos(B, u).length) return null;
      return { tipo: 'habilidad_propia', habilidad: 'muro_de_escudos' };
    }
  }
  return null;
}

function otroATiro(B, u, salvo) {
  const otro = enemigosConocidos(B, u).filter((e) => e !== salvo && u.armas.some((a) => aDistancia(a) && enAlcance(B, u, e, a))).sort(masCerca(u))[0];
  return otro ? disparo(B, u, otro, aDistancia) : null;
}

// Hay algun enemigo conocido que lo pueda alcanzar, o al que el pueda alcanzar (con un poco de margen)?
function amenazado(B, u) {
  const mio = Math.max(1, ...u.armas.map((a) => a.alcance));
  return enemigosConocidos(B, u).some((e) => distancia(u, e) <= Math.max(mio, ...e.armas.map((a) => a.alcance), 1) + 2);
}

// Alguien lo tiene a tiro, o el tiene a alguien (linea de tiro de verdad, no solo distancia)
function hayTiro(B, u) {
  return enemigosConocidos(B, u).some((e) => lineaDeTiro(B.tablero, u, e) &&
    (u.armas.some((a) => enAlcance(B, u, e, a)) || e.armas.some((a) => enAlcance(B, e, u, a))));
}

// ---------- Abrir paso al escoltado ----------

// Las dos proximas casillas del camino del escoltado hacia su meta (sin contar a nadie que lo tape).
function caminoDelEscoltado(B) {
  const v = B.vip;
  if (!v || !v.viva || !B.mision.zonaMeta) return [];
  const meta = casillaDeZona(B, v, B.mapa.zonas[B.mision.zonaMeta]);
  const c = campo(B.tablero, meta.x, meta.y);
  const out = [];
  let p = { x: v.x, y: v.y };
  for (let i = 0; i < 2; i++) {
    let mejor = null, mejorD = c[p.y * B.tablero.ancho + p.x];
    for (const [x, y] of vecinos(B.tablero, p.x, p.y)) {
      const d = c[y * B.tablero.ancho + x];
      if (d >= 0 && d < mejorD) { mejor = { x, y }; mejorD = d; }
    }
    if (!mejor) break;
    out.push(mejor);
    p = mejor;
  }
  return out;
}

// Si este piloto esta parado en el camino del escoltado, se corre a un costado. Solo sin enemigos a la vista:
// en pleno tiroteo, el que esta adelante le hace de escudo.
function abrirPaso(B, u) {
  if (!B.vip || u === B.vip || u.bando !== B.vip.bando || u.mover > 0) return null;
  // con enemigos, solo se corre si no esta peleando (si tiene a quien tirarle, primero tira)
  if (enemigosConocidos(B, u).some((e) => u.armas.some((a) => enAlcance(B, u, e, a)))) return null;
  const camino = caminoDelEscoltado(B);
  if (!camino.some((c) => c.x === u.x && c.y === u.y)) return null;
  const ocupada = ocupadaPara(B, u);
  for (const [x, y] of vecinos(B.tablero, u.x, u.y)) {
    if (ocupada(x, y) || camino.some((c) => c.x === x && c.y === y)) continue;
    return { tipo: 'mover', a: [x, y], anula: 'abre_paso' };
  }
  return null;
}

// ---------- La decision completa ----------

export function decidir(B, u) {
  const i = decidirSinLimite(B, u);
  // el escoltado no espera para siempre: si lleva mucho parado, arranca igual por un rato
  if (u === B.vip) {
    if (u.apuro > 0) {
      u.apuro--;
      const meta = objetivoMision(B, u);
      const j = meta ? accion(B, u, 'avanzar', meta, null) : null;
      if (j) return j;
    }
    u.quieto = i.tipo !== 'mover' && u.mover === 0 ? (u.quieto || 0) + 1 : 0;
    if (u.quieto > 45) { u.quieto = 0; u.apuro = 25; }
  }
  return i;
}

function decidirSinLimite(B, u) {
  if (u.ocupado > 0) return { tipo: 'esperar' };
  const az = B.azarDecision;
  const lista = ganchosDe(B, u);
  const G = B.datos.gambits;

  // Correa (Leal, traumas): de quien no se puede alejar.
  let correa = null;
  for (const h of lista) {
    if (h.tipo !== 'correa') continue;
    const ancla = elegirObjetivo(B, u, h.ancla);
    if (ancla && ancla.id) { correa = { ancla, max: h.distancia_maxima }; break; }
  }

  // A. Anulaciones
  const anulaciones = lista.filter((h) => h.tipo === 'anular').map((h, i) => ({ h, i }))
    .sort((a, b) => b.h.prioridad - a.h.prioridad || a.i - b.i);
  for (const { h } of anulaciones) {
    if (!evaluar(B, { u }, h.cuando, {})) continue;
    const intencion = accion(B, u, h.hacer.accion, elegirObjetivo(B, u, h.hacer.objetivo), null);
    if (intencion) return { ...intencion, anula: h.registro || h.hacer.accion };
  }
  // Abrir paso al escoltado le gana a las ordenes (pero no al panico)
  const paso = abrirPaso(B, u);
  if (paso) return paso;

  // Rivales: si estan cerca y no hay tiros, a veces se ponen a discutir y pierden tiempo
  // (como mucho una pelea por piloto en cada mision: despues se la guardan)
  if (u.rival && !u.discutio && !enemigosConocidos(B, u).length) {
    const r = porId(B, u.rival);
    if (r && r.viva && !r.discutio && distancia(u, r) <= 3 && az.tirada(B.datos.reglas.animo.chance_discusion)) {
      u.discutio = true; r.discutio = true;
      return { tipo: 'discutir', con: r.id, anula: 'discute' };
    }
  }

  if (correa && distancia(u, correa.ancla) > correa.max) {
    const i = mover(B, u, correa.ancla.x, correa.ancla.y, null);
    if (i) return { ...i, anula: 'correa' };
  }

  // B. Lista efectiva
  const corrimientos = {};
  for (const h of lista) if (h.tipo === 'correr_umbral') corrimientos[h.dato] = (corrimientos[h.dato] || 0) + h.delta;
  const etiquetas = (g) => (G.acciones[g.accion] && G.acciones[g.accion].etiquetas) || [];
  const claves = u.gambits.map((g, i) => {
    let k = 2 * i;
    for (const h of lista) {
      if (h.tipo === 'subir_prioridad' && etiquetas(g).some((t) => h.etiquetas.includes(t))) k -= 2 * h.delta + 1;
    }
    return { g, i, k };
  });
  claves.sort((a, b) => a.k - b.k || a.i - b.i);

  // C. De arriba abajo. Con "confusion" (interferencia, nervios) a veces entiende mal una orden y se la saltea.
  const ctx = { u, corrimientos };
  const confusion = lista.filter((h) => h.tipo === 'confusion').reduce((s, h) => s + h.chance, 0);
  let confundido = false;
  for (const { g, i } of claves) {
    const cond = G.condiciones[g.condicion];
    if (!cond) continue;
    // condiciones que da una parte (el radar): sin esa parte, el mecha no sabe leerlas
    if (cond.requiere_parte && !u.etiquetasPartes.includes(cond.requiere_parte)) continue;
    const ignora = lista.some((h) => h.tipo === 'ignorar_condicion' && h.condicion === g.condicion && az.tirada(h.chance));
    if (ignora) continue;
    const params = {};
    for (const [p, def] of Object.entries(cond.parametros || {})) params[p] = g.parametros && g.parametros[p] !== undefined ? g.parametros[p] : def.defecto;
    if (!evaluar(B, ctx, cond.expr, params)) continue;

    let sel = g.objetivo;
    for (const h of lista) {
      if (h.tipo === 'cambiar_objetivo' && etiquetas(g).some((t) => h.etiquetas.includes(t)) && az.tirada(h.chance)) {
        if (elegirObjetivo(B, u, h.selector)) sel = h.selector;
      }
    }
    const intencion = accion(B, u, g.accion, elegirObjetivo(B, u, sel), correa);
    if (intencion && confusion && intencion.tipo !== 'esperar' && az.tirada(confusion)) { confundido = true; continue; }
    if (intencion) return confundido ? { ...intencion, gambit: i, anula: 'confusion' } : { ...intencion, gambit: i };
  }

  // D. Por defecto
  if (enemigosConocidos(B, u).length && (!amenazado(B, u) || u.aburrido)) {
    // hay enemigos pero lejos: acercarse (al objetivo de la mision si hay; si no, al enemigo)
    const meta = objetivoMision(B, u) || elegirObjetivo(B, u, 'enemigo_cercano');
    const i = meta ? accion(B, u, 'avanzar', meta, correa) : null;
    if (i) return i;
    const e = elegirObjetivo(B, u, 'enemigo_cercano');
    const j = e ? accion(B, u, 'avanzar', e, correa) : null;
    if (j) return j;
  }
  if (!enemigosConocidos(B, u).length) {
    const meta = objetivoMision(B, u);
    if (meta) {
      const i = accion(B, u, 'avanzar', meta, correa);
      if (meta.falso) { u.estuvoPerdido = true; if (i) return { ...i, anula: 'perdido' }; }
      else if (u.estuvoPerdido && !u.reubicado) { u.reubicado = true; if (i) return { ...i, anula: 'reubicado' }; }
      if (i) return i;
    }
  }
  return accion(B, u, 'buscar_cobertura', null, correa) || { tipo: 'mantener' };
}
