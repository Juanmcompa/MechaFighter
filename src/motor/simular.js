// La batalla completa, de punta a punta, sin pantalla:
//
//   simular(datos, { mision, escuadron, semilla }) -> { victoria, motivo, ticks, registro, resumen, huella }
//
// mision: la mision ya armada por la campana (ver campana/misiones.js).
// escuadron: [{ piloto, mecha, gambits }] tal como los guarda la campana.
// Misma entrada = misma salida, en cualquier aparato. La vista solo reproduce el registro.

import { crearAzar, huellaTexto } from '../core/azar.js';
import { crearTablero, casillaLibreCerca, distancia, lineaDeTiro, tipo as tipoCasilla } from './espacio.js';
import { ordenUnidades, percibir, vidaPct, evento, aliados, quitarEstado, ponerEstado } from './estado.js';
import { decidir } from './decision.js';
import { resolverMovimientos, resolverAcciones, herir, romperParte } from './resolucion.js';
import { procesarMoral } from './moral.js';
import { unidadDePiloto, unidadEnemiga } from './unidades.js';

export function simular(datos, { mision, escuadron, semilla }) {
  const azar = crearAzar(semilla);
  const mapa = datos.mapas[mision.mapa];
  const registro = [];
  const B = {
    datos, mision, mapa,
    tablero: crearTablero(mapa),
    t: 0,
    unidades: [],
    porId: new Map(),
    niebla: !!mision.niebla,
    vistos: [new Set(), new Set()],
    azarDecision: azar.derivar('decision'),
    azarCombate: azar.derivar('combate'),
    azarPartes: azar.derivar('partes'),
    eventosTick: [],
    vip: null,
    lider: null,
    log: (e) => registro.push({ t: B.t, ...e })
  };
  let num = 0;

  B.agregarUnidad = (plantilla, bando, x, y, por = null) => {
    const ocupada = (cx, cy) => B.unidades.some((o) => o.viva && o.x === cx && o.y === cy);
    const c = casillaLibreCerca(B.tablero, x, y, ocupada);
    if (!c) return null;
    const u = {
      ...plantilla,
      // tormenta / noche: todos ven menos (nunca menos de 2 casillas)
      vision: Math.max(2, plantilla.vision + (mision.visionDelta || 0)),
      armas: plantilla.armas.map((a) => ({ ...a })),
      habilidades: [...(plantilla.habilidades || [])],
      etiquetasPartes: [...(plantilla.etiquetasPartes || [])],
      slots: plantilla.slots ? JSON.parse(JSON.stringify(plantilla.slots)) : null,
      rotas: [], danioSlot: {}, golpeCabina: false,
      mochila: plantilla.mochila ? { ...plantilla.mochila } : null,
      id: 'u' + num, num: num++, bando,
      x: c[0], y: c[1], mx: bando === 0 ? 1 : -1, my: 0,
      vida: plantilla.vidaInicial || plantilla.vidaMax, viva: true,
      moralActual: plantilla.moral,
      estados: [], cds: {}, ocupado: 0, mover: 0, vinculo: null, ultimoAtacante: null,
      s: { bajas: 0, danioHecho: 0, danioRecibido: 0, vidaMinPct: 100, reparado: 0, explosiones: 0, quedoSolo: false, vinculoMurio: false }
    };
    B.unidades.push(u);
    B.porId.set(u.id, u);
    B.log({ tipo: 'aparece', u: u.id, por, ficha: ficha(u) });
    return u;
  };

  // --- Despliegue
  const ap = mapa.aparicion;
  escuadron.forEach((m, i) => {
    const [x, y] = ap.jugador[i % ap.jugador.length];
    const base = unidadDePiloto(datos, m.piloto, m.mecha, m.gambits);
    // el mecha puede venir golpeado de la mision anterior (ver reglas.mantenimiento)
    if (m.vidaPct && m.vidaPct < 100) base.vidaInicial = Math.max(1, Math.trunc((base.vidaMax * m.vidaPct) / 100));
    const u = B.agregarUnidad(base, 0, x, y);
    if (u && u.slots) for (const [z, s] of Object.entries(u.slots)) if (s.rota) romperParte(B, u, z, true);
    // como llega a la mision (confiado, nervioso, atento, desorientado) y con quien se lleva bien o mal
    if (u) { u.rivalRef = m.rival || null; u.amigoRef = m.amigo || null; u.estadosIniciales = m.estados || []; }
  });
  // estados que lleva todo el escuadron por una condicion de la mision (interferencia, atento)
  for (const u of B.unidades) if (u.tipo === 'piloto') for (const est of mision.estadosEscuadron || []) ponerEstado(B, u, est, null);
  for (const u of B.unidades) {
    for (const est of u.estadosIniciales || []) ponerEstado(B, u, est, null);
    const buscar = (ref) => (ref ? (B.unidades.find((o) => o.ref === ref && o.bando === u.bando) || {}).id || null : null);
    u.rival = buscar(u.rivalRef); u.amigo = buscar(u.amigoRef);
  }
  // vinculos: de ref de piloto a id de unidad
  for (const u of B.unidades) {
    if (u.vinculoRef) { const v = B.unidades.find((o) => o.ref === u.vinculoRef && o.bando === u.bando); if (v) u.vinculo = v.id; }
  }
  if (mision.vip) {
    const [x, y] = ap.jugador[0];
    // el escoltado se blinda segun la mision: si no, a nivel 1 contra enemigos de nivel 5 no duraba nada
    B.vip = B.agregarUnidad(unidadEnemiga(datos, mision.vip, mision.nivel || 1), 0, x, y);
    B.vip.rol = 'vip';
  }
  // milicia aliada: aparece detras del escuadron (no cuenta para ganar ni perder; solo ayuda)
  (mision.aliados || []).forEach((id, i) => {
    const [x, y] = ap.jugador[(i + 2) % ap.jugador.length];
    const a = B.agregarUnidad({ ...unidadEnemiga(datos, id, mision.nivel || 1), tipo: 'aliado' }, 0, x, y);
    if (a) a.rol = 'milicia';
  });
  const oleadas = mision.oleadas || [];
  let siguienteOleada = 0, proximaOleadaEn = 0;
  const soltarOleada = () => {
    const lista = oleadas[siguienteOleada];
    lista.forEach((id, i) => {
      const [x, y] = ap.enemigo[i % ap.enemigo.length];
      const u = B.agregarUnidad(unidadEnemiga(datos, id, mision.nivel || 1), 1, x, y);
      if (u && mision.lider === id && !B.lider) { B.lider = u; u.rol = 'lider'; }
    });
    if (siguienteOleada > 0) for (const u of B.unidades) if (u.viva && u.bando === 0) evento(B, 'oleada_nueva', u);
    B.log({ tipo: 'oleada', n: siguienteOleada + 1, de: oleadas.length });
    siguienteOleada++;
    proximaOleadaEn = B.t + (mision.ticksEntreOleadas || 0);
  };
  if (oleadas.length) soltarOleada();
  // escuadron de otra campana, ahora del otro lado (ver campana/legado.js)
  (mision.rivales || []).forEach((r, i) => {
    const [x, y] = ap.enemigo[(i + 1) % ap.enemigo.length];
    const base = unidadDePiloto(datos, r.piloto, r.mecha, r.gambits);
    B.agregarUnidad({ ...base, tipo: 'enemigo', ref: 'ex:' + r.piloto.id, vinculoRef: null, amenaza: 3, exPiloto: true }, 1, x, y);
  });
  for (const em of mision.emboscadas || []) {
    em.unidades.forEach((id) => B.agregarUnidad(unidadEnemiga(datos, id, mision.nivel || 1), 1, em.casilla[0], em.casilla[1]));
  }
  B.log({ tipo: 'inicio', mapa: mision.mapa, niebla: B.niebla });

  // --- Bucle de ticks
  const ticksMax = Math.min(datos.reglas.ticks_maximos, mision.tiempo || Infinity);
  let fin = null, zonaPerdidaTicks = 0, refuerzosLlegaron = false;
  // minas escondidas: explotan con lo primero que las pise
  const minas = new Set((mision.minas || []).map(([x, y]) => x + ',' + y));
  for (B.t = 1; B.t <= ticksMax && !fin; B.t++) {
    B.eventosTick = [];

    // 1. mantenimiento
    for (const u of ordenUnidades(B)) {
      if (!u.viva) continue;
      for (const a of u.armas) {
        if (a.espera > 0) a.espera--;
        if (a.recargando > 0 && --a.recargando === 0) a.municion = a.municionMax;
      }
      for (const k of Object.keys(u.cds)) if (u.cds[k] > 0) u.cds[k]--;
      if (u.ocupado > 0) u.ocupado--;
      if (u.mover > 0) u.mover--;
      for (const e of u.estados.slice()) {
        if (e.resta > 0 && --e.resta === 0) {
          quitarEstado(B, u, e.id);
          const sigue = (datos.estados[e.id] || {}).al_terminar; // sobrecargado -> recalentado
          if (sigue) ponerEstado(B, u, sigue, null);
        }
      }
      // danio continuo (llamas, fugas, casillas peligrosas): se aplica cada 5 ticks para no llenar el registro
      if (B.t % 5 === 0) {
        let dot = 0;
        for (const e of u.estados) dot += (datos.estados[e.id].danio_por_tick || 0) * 5;
        if (tipoCasilla(B.tablero, u.x, u.y) === 'peligro') dot += (datos.reglas.peligro_danio_por_tick || 0) * 5;
        if (dot) { herir(B, u, dot, null); B.log({ tipo: 'vida', u: u.id, vida: Math.max(0, u.vida), dot }); }
      }
    }
    // refuerzos: otra escuadra que llega por detras a mitad de la mision
    if (mision.refuerzos && !refuerzosLlegaron && B.t >= mision.refuerzos.tick) {
      refuerzosLlegaron = true;
      mision.refuerzos.unidades.forEach((id, i) => {
        const [x, y] = ap.enemigo[(i + 2) % ap.enemigo.length];
        B.agregarUnidad(unidadEnemiga(datos, id, mision.nivel || 1), 1, x, y);
      });
      for (const u of B.unidades) if (u.viva && u.bando === 0) evento(B, 'oleada_nueva', u);
      B.log({ tipo: 'refuerzos', cantidad: mision.refuerzos.unidades.length });
    }
    if (siguienteOleada < oleadas.length) {
      const quedan = B.unidades.some((u) => u.viva && u.bando === 1);
      if (B.t >= proximaOleadaEn || !quedan) soltarOleada();
    }

    // 2. percepcion
    percibir(B);
    // primer contacto: el escuadron avisa a Control cuando ve enemigos nuevos
    const nuevos = [];
    let quienVe = null;
    for (const o of B.unidades) {
      if (!o.viva || o.bando !== 1 || o.avistado) continue;
      const ojo = B.unidades.find((u) => u.viva && u.bando === 0 && u.tipo === 'piloto' && distancia(u, o) <= u.vision && lineaDeTiro(B.tablero, u, o));
      if (ojo) { o.avistado = true; nuevos.push(o); quienVe = quienVe || ojo; }
    }
    // (si siguen apareciendo de a uno, no se repite el aviso enseguida: se cuentan en el proximo)
    if (nuevos.length) B.sinAvisar = (B.sinAvisar || 0) + nuevos.length;
    if (nuevos.length && B.t - (B.ultimoContacto ?? -999) >= 60) {
      B.ultimoContacto = B.t;
      const dx = nuevos.reduce((s, o) => s + o.x - quienVe.x, 0), dy = nuevos.reduce((s, o) => s + o.y - quienVe.y, 0);
      const dir = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'este' : 'oeste') : (dy >= 0 ? 'sur' : 'norte');
      B.log({ tipo: 'contacto', u: quienVe.id, n: B.sinAvisar, dir });
      B.sinAvisar = 0;
    }

    // 3. decision (nadie cambia nada todavia)
    const intenciones = [];
    for (const u of ordenUnidades(B)) {
      if (!u.viva) continue;
      const i = decidir(B, u);
      if (i.anula && i.anula !== u.ultimaAnulacion) B.log({ tipo: 'anula', u: u.id, motivo: i.anula });
      u.ultimaAnulacion = i.anula || null;
      if (i.tipo !== 'esperar' && i.tipo !== 'mantener') intenciones.push({ u, i });
    }

    // 4. resolucion: movimientos, acciones y muertes al final
    resolverMovimientos(B, intenciones);
    if (minas.size) {
      for (const u of ordenUnidades(B)) {
        const k = u.x + ',' + u.y;
        if (!u.viva || !minas.has(k)) continue;
        minas.delete(k);
        const danio = Math.max(datos.reglas.danio_minimo, 30 - (u.blindaje >> 1));
        B.log({ tipo: 'mina', x: u.x, y: u.y, u: u.id, danio });
        herir(B, u, danio, null);
        for (const v of B.unidades) if (v.viva && distancia(v, u) <= 2) { evento(B, 'explosion_cerca', v); v.s.explosiones++; }
      }
    }
    resolverAcciones(B, intenciones);
    for (const u of ordenUnidades(B)) {
      if (!u.viva || u.vida > 0) continue;
      u.viva = false;
      const killer = u.ultimoAtacante ? B.porId.get(u.ultimoAtacante) : null;
      // limpio: cayo por un tiro a la cabina (el resto del mecha queda para saquear)
      B.log({ tipo: 'muere', u: u.id, por: killer ? killer.id : null, ...(u.golpeCabina ? { limpio: true } : {}) });
      if (killer) {
        killer.s.bajas++;
        evento(B, 'baja_propia', killer);
        for (const a of aliados(B, killer)) evento(B, 'baja_aliada', a);
      }
      const resto = aliados(B, u);
      for (const a of resto) {
        evento(B, 'aliado_muerto', a);
        if (a.vinculo === u.id) { evento(B, 'vinculo_muerto', a); a.s.vinculoMurio = true; }
        if (a.amigo === u.id) evento(B, 'amigo_muerto', a);
      }
      const pilotosVivos = resto.filter((a) => a.tipo === 'piloto');
      if (pilotosVivos.length === 1 && !pilotosVivos[0].s.quedoSolo) { pilotosVivos[0].s.quedoSolo = true; evento(B, 'quedo_solo', pilotosVivos[0]); }
    }

    // al confiado se le pasa la confianza cuando lo lastiman en serio
    for (const u of B.unidades) {
      if (u.viva && u.vida > 0 && vidaPct(u) < 40 && u.estados.some((e) => e.id === 'confiado')) {
        quitarEstado(B, u, 'confiado');
        B.log({ tipo: 'anula', u: u.id, motivo: 'se_le_pasa' });
      }
    }

    // 5. moral
    procesarMoral(B);

    // 6. objetivos
    const pendientes = oleadas.length - siguienteOleada + (mision.refuerzos && !refuerzosLlegaron ? 1 : 0);
    const res = revisarObjetivos(B, pendientes, () => zonaPerdidaTicks, (v) => { zonaPerdidaTicks = v; });
    if (res) fin = res;
  }
  if (!fin) fin = { victoria: false, motivo: 'tiempo_agotado' };
  B.t--;
  B.log({ tipo: 'fin', victoria: fin.victoria, motivo: fin.motivo });

  return {
    victoria: fin.victoria,
    motivo: fin.motivo,
    ticks: B.t,
    registro,
    resumen: resumir(B),
    huella: huellaTexto(JSON.stringify(registro)).toString(36)
  };
}

function enZona(u, z) {
  return u.x >= z[0][0] && u.x <= z[1][0] && u.y >= z[0][1] && u.y <= z[1][1];
}

function revisarObjetivos(B, oleadasPendientes, leerZona, guardarZona) {
  const m = B.mision;
  const pilotos = B.unidades.filter((u) => u.viva && u.bando === 0 && u.tipo === 'piloto');
  const enemigos = B.unidades.filter((u) => u.viva && u.bando === 1);
  const cumple = (c) => {
    switch (c.tipo) {
      case 'escuadron_eliminado': return pilotos.length === 0;
      case 'enemigos_eliminados': return enemigos.length === 0 && oleadasPendientes === 0;
      case 'sobrevivir_oleadas': return enemigos.length === 0 && oleadasPendientes === 0;
      case 'unidad_muerta': {
        const u = c.unidad === 'vip' ? B.vip : B.lider;
        return !!u && !u.viva;
      }
      case 'unidad_llega_a_zona': return !!B.vip && B.vip.viva && enZona(B.vip, B.mapa.zonas[c.zona]);
      case 'escuadron_llega_a_zona': return pilotos.length > 0 && pilotos.every((u) => enZona(u, B.mapa.zonas[c.zona]));
      case 'zona_perdida': {
        const z = B.mapa.zonas[c.zona];
        const tomada = enemigos.some((u) => enZona(u, z)) && !pilotos.some((u) => enZona(u, z));
        guardarZona(tomada ? leerZona() + 1 : 0);
        return leerZona() >= 40;
      }
      case 'tiempo_agotado': return B.t >= c.ticks;
    }
    return false;
  };
  for (const c of m.derrota || []) if (cumple(c)) return { victoria: false, motivo: c.tipo };
  for (const c of m.victoria || []) if (cumple(c)) return { victoria: true, motivo: c.tipo };
  return null;
}

// Lo que la vista necesita para dibujar una unidad desde el principio.
function ficha(u) {
  return {
    bando: u.bando, nombre: u.nombre, tipo: u.tipo, cuerpo: u.cuerpo, clase: u.clase, personalidad: u.personalidad,
    // si el tipo tiene varios dibujos, cada unidad usa uno (fijo por su numero)
    sprite: u.variantes ? u.variantes[Number(u.id.slice(1)) % u.variantes.length] : u.sprite || null,
    apariencia: u.apariencia, x: u.x, y: u.y, vidaMax: u.vidaMax, rol: u.rol || null, ref: u.ref, exPiloto: !!u.exPiloto, vida: u.vida,
    miembros: u.miembros || 1, figuras: u.figuras || null,
    armas: u.armas.map((a) => ({ slot: a.slot, tipoVisual: a.tipoVisual }))
  };
}

// Lo que la campana necesita para el informe: como le fue a cada piloto.
function resumir(B) {
  const pilotos = {};
  let bajasEnemigas = 0;
  for (const u of B.unidades) {
    if (u.bando === 1 && !u.viva) bajasEnemigas++;
    if (u.tipo !== 'piloto' || u.bando !== 0) continue;
    pilotos[u.ref] = { ...u.s, viva: u.viva, vidaFinalPct: u.viva ? vidaPct(u) : 0, moralFinal: u.moralActual };
  }
  return { pilotos, bajasEnemigas, vipVivo: B.vip ? B.vip.viva : null };
}

export { distancia };
