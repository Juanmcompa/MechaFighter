// Arma una mision concreta a partir de una plantilla de misiones.json: mapa, enemigos, oleadas, recompensa.
// Todo sale del azar de la campana, asi la misma partida ofrece siempre los mismos contratos.

import { caminable } from '../motor/espacio.js';

function rango(azar, r) {
  return Array.isArray(r) ? azar.entero(r[0], r[1]) : r && r.min !== undefined ? azar.entero(r.min, r.max) : r;
}

function escuadra(datos, azar, lista, dificultad) {
  const E = datos.enemigos.escuadras;
  const aptas = lista.filter((id) => E[id].dificultad <= dificultad);
  const id = azar.elegir(aptas.length ? aptas : lista);
  return E[id].miembros.slice();
}

// dificultad: cuantas y cuales escuadras. nivel: que tan fuertes (si no se pasa, igual a la dificultad).
export function armarMision(datos, plantillaId, dificultad, azar, nivel = dificultad) {
  const tpl = datos.misiones[plantillaId];
  const mapaId = azar.elegir(tpl.mapas);
  const mapa = datos.mapas[mapaId];
  const p = tpl.parametros || {};
  const m = {
    plantilla: plantillaId,
    nombre: tpl.nombre,
    icono: tpl.icono,
    tipo: tpl.tipo,
    mapa: mapaId,
    nivel,
    dificultad,
    niebla: !!tpl.niebla,
    victoria: tpl.victoria,
    derrota: tpl.derrota,
    oleadas: [],
    emboscadas: [],
    semilla: azar.entero(1, 2147483646),
    recompensa: { creditos: rango(azar, tpl.recompensa.creditos), botin: tpl.recompensa.botin },
    puntaje: tpl.puntaje || {}
  };
  for (const c of tpl.victoria) if (c.zona) m.zonaMeta = c.zona;
  for (const c of tpl.derrota) {
    if (c.tipo === 'zona_perdida') m.zonaDefender = c.zona;
    if (c.tipo === 'tiempo_agotado') m.tiempo = c.ticks;
  }
  const extra = dificultad - 1; // escuadras de mas segun la dificultad

  switch (tpl.tipo) {
    case 'sobrevivencia': {
      const n = rango(azar, p.oleadas) + Math.max(0, extra - 1);
      // desde la tercera oleada, en dificultad 3 o mas, vienen de a dos escuadras
      m.ticksEntreOleadas = p.ticks_entre_oleadas || 120;
      for (let i = 0; i < n; i++) {
        const ola = escuadra(datos, azar, tpl.enemigos, dificultad);
        if (i >= 2 && extra > 1) ola.push(...escuadra(datos, azar, tpl.enemigos, dificultad));
        m.oleadas.push(ola);
      }
      m.parametros = { oleadas: n };
      break;
    }
    case 'patrulla': {
      const n = rango(azar, p.emboscadas) + extra;
      for (let i = 0; i < n; i++) {
        let casilla = null;
        for (let intento = 0; intento < 50 && !casilla; intento++) {
          const x = azar.entero(Math.trunc(mapa.tamano[0] * 0.35), mapa.tamano[0] - 3);
          const y = azar.entero(1, mapa.tamano[1] - 2);
          if (caminable({ ancho: mapa.tamano[0], alto: mapa.tamano[1], tipos: tiposDe(mapa) }, x, y)) casilla = [x, y];
        }
        if (casilla) m.emboscadas.push({ unidades: escuadra(datos, azar, tpl.enemigos, dificultad), casilla });
      }
      break;
    }
    default: {
      const ola = [];
      if (tpl.lider) { ola.push(tpl.lider); m.lider = tpl.lider; }
      for (let i = 0; i < 1 + Math.max(0, extra); i++) ola.push(...escuadra(datos, azar, tpl.enemigos, dificultad));
      m.oleadas.push(ola);
      if (tpl.vip) m.vip = tpl.vip;
    }
  }
  aplicarCondiciones(datos, m, sortearCondiciones(datos, dificultad, azar), azar, tpl);
  m.descripcion = (tpl.descripcion || '').replace(/\{(\w+)\}/g, (_, k) => (m.parametros && m.parametros[k] !== undefined ? m.parametros[k] : k));
  m.cantidadEnemigos = m.oleadas.reduce((s, o) => s + o.length, 0) + m.emboscadas.reduce((s, e) => s + e.unidades.length, 0);
  return m;
}

function tiposDe(mapa) {
  const out = [];
  for (const fila of mapa.filas) for (const letra of fila) out.push(mapa.leyenda[letra]);
  return out;
}

// Cuantas condiciones le tocan a una mision segun la dificultad, sin repetir ni juntar las que chocan.
// Chances (en %): una condicion y una segunda, por dificultad.
const CHANCE_CONDICIONES = { 1: [35, 0], 2: [60, 20], 3: [80, 40], 4: [90, 55] };

function sortearCondiciones(datos, dificultad, azar) {
  const todas = datos.condiciones_mision || {};
  const [c1, c2] = CHANCE_CONDICIONES[Math.min(4, dificultad)] || [0, 0];
  const cantidad = azar.tirada(c1) ? (azar.tirada(c2) ? 2 : 1) : 0;
  const elegidas = [];
  for (let k = 0; k < cantidad; k++) {
    const aptas = Object.entries(todas).filter(([id, c]) => c.desde <= dificultad && !elegidas.includes(id) &&
      !elegidas.some((e) => (c.choca || []).includes(e) || (todas[e].choca || []).includes(id)));
    if (!aptas.length) break;
    elegidas.push(azar.elegirConPeso(aptas.map(([id, c]) => [id, c.peso])));
  }
  return elegidas;
}

// Pasa las condiciones a datos concretos de la mision, que el motor entiende.
function aplicarCondiciones(datos, m, ids, azar, tpl) {
  m.condiciones = ids;
  m.estadosEscuadron = [];
  m.visionDelta = 0;
  const mapa = datos.mapas[m.mapa];
  for (const id of ids) {
    const e = datos.condiciones_mision[id].efectos;
    if (e.vision) m.visionDelta += e.vision;
    if (e.niebla !== undefined) m.niebla = e.niebla;
    if (e.estado_escuadron) m.estadosEscuadron.push(e.estado_escuadron);
    if (e.refuerzos) m.refuerzos = { tick: e.refuerzos, unidades: escuadra(datos, azar, tpl.enemigos, m.dificultad) };
    if (e.unidad_extra) {
      if (m.oleadas.length) m.oleadas[0].push(e.unidad_extra);
      else m.emboscadas.push({ unidades: [e.unidad_extra], casilla: mapa.aparicion.enemigo[0] });
    }
    if (e.minas) {
      // en el medio del mapa (ni en las entradas ni en las zonas), sobre piso
      m.minas = [];
      const [ancho, alto] = mapa.tamano;
      const enZona = (x, y) => Object.values(mapa.zonas || {}).some(([[x1, y1], [x2, y2]]) => x >= x1 && x <= x2 && y >= y1 && y <= y2);
      for (let intento = 0; intento < 200 && m.minas.length < e.minas; intento++) {
        const x = azar.entero(5, ancho - 6), y = azar.entero(1, alto - 2);
        if (mapa.leyenda[mapa.filas[y][x]] !== 'piso' || enZona(x, y) || m.minas.some(([a, b]) => a === x && b === y)) continue;
        m.minas.push([x, y]);
      }
    }
  }
  m.cantidadEnemigos = m.oleadas.reduce((s, o) => s + o.length, 0) + m.emboscadas.reduce((s, e) => s + e.unidades.length, 0) +
    (m.refuerzos ? m.refuerzos.unidades.length : 0);
}
