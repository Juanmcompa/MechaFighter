// Dilemas entre misiones (estilo FTL): una situacion, dos o tres opciones, a veces con riesgo.
// Los datos estan en data/dilemas.json; aca se sortean, se filtran por requisitos y se aplican sus efectos.

import { sortearParte, contratarGratis } from './partida.js';
import { reparar } from './mantenimiento.js';
import { sumarAfinidadTodos } from './animo.js';
import { anotar, sumarStat } from './cronica.js';

export function sortearDilema(datos, p, azar) {
  const D = datos.dilemas;
  const vistos = p.dilemasVistos || [];
  const aptos = Object.entries(D).filter(([id, d]) => id[0] !== '_' && d.desde <= p.sector + 1);
  const nuevos = aptos.filter(([id]) => !vistos.includes(id));
  const lista = nuevos.length ? nuevos : aptos;
  const id = azar.elegirConPeso(lista.map(([k, d]) => [k, d.peso]));
  p.dilemasVistos = vistos.concat(id);
  return id;
}

// Quien protagoniza: el de la clase pedida, o uno cualquiera (fijo para este dilema)
export function protagonista(datos, p, op, azar) {
  if (op.requiere && op.requiere.clase) return p.pilotos.find((x) => x.clase === op.requiere.clase) || null;
  return p.pilotos.length ? p.pilotos[azar.entero(0, p.pilotos.length - 1)] : null;
}

export function opcionDisponible(datos, p, op) {
  const r = op.requiere || {};
  if (r.clase && !p.pilotos.some((x) => x.clase === r.clase)) return { ok: false, visible: false };
  if (r.creditos && p.creditos < r.creditos) return { ok: false, visible: true, motivo: 'Faltan créditos' };
  if (r.combustible && (p.combustible || 0) < r.combustible) return { ok: false, visible: true, motivo: 'Falta combustible' };
  return { ok: true, visible: true };
}

// Aplica la opcion elegida. Devuelve { texto, cambios: [{ icono, texto, bien }] }
export function resolverDilema(datos, p, indice, azar) {
  const d = datos.dilemas[p.nodo.dilema];
  const op = d.opciones[indice];
  if (!op || !opcionDisponible(datos, p, op).ok) return null;
  const pi = protagonista(datos, p, op, azar);
  let ef = op.efectos;
  let salio = null;
  if (op.chance !== undefined) { salio = azar.tirada(op.chance); ef = salio ? op.exito : op.fracaso; }
  const apodo = pi ? '«' + pi.apodo + '»' : 'alguien';
  const res = { opcion: op.texto, texto: (ef.texto || '').replace(/\{piloto\}/g, apodo), cambios: [], salio };
  aplicarEfectos(datos, p, ef, pi, azar, res);
  if (ef.cronica) anotar(p, ef.cronica.replace(/\{piloto\}/g, apodo), 'dilema');
  sumarStat(p, 'dilemas');
  p.nodo.resultado = res;
  return res;
}

function aplicarEfectos(datos, p, ef, pi, azar, res) {
  const C = datos.reglas.combustible;
  const cambio = (icono, texto, bien) => res.cambios.push({ icono, texto, bien });
  if (ef.creditos !== undefined) {
    let n = Array.isArray(ef.creditos) ? azar.entero(ef.creditos[0], ef.creditos[1]) : ef.creditos;
    if (n < 0) n = -Math.min(p.creditos, -n);
    p.creditos += n;
    if (n) cambio('creditos', (n > 0 ? '+' : '') + n + ' créditos', n > 0);
  }
  if (ef.combustible && p.combustible !== undefined) {
    const antes = p.combustible;
    p.combustible = Math.max(0, Math.min(C.maximo, p.combustible + ef.combustible));
    const n = p.combustible - antes;
    if (n) cambio('combustible', (n > 0 ? '+' : '') + n + ' combustible', n > 0);
  }
  if (ef.parte) {
    const pz = sortearParte(datos, azar, p.sectores[p.sector].dificultad);
    p.inventario.push(pz);
    cambio('estrella', datos.partes[pz.parte].nombre, true);
  }
  if (ef.danio_mecha) {
    const quienes = ef.danio_mecha.quien === 'todos' ? p.pilotos : pi ? [pi] : [];
    for (const x of quienes) x.mechaVida = Math.max(0, (x.mechaVida === undefined ? 100 : x.mechaVida) - ef.danio_mecha.pct);
    if (quienes.length) cambio('llave', (ef.danio_mecha.quien === 'todos' ? 'Todos los mechas' : 'Mecha de ' + pi.apodo) + ' −' + ef.danio_mecha.pct + '%', false);
  }
  if (ef.trauma && pi && azar.tirada(ef.trauma.chance)) {
    const libres = Object.entries(datos.traumas).filter(([id]) => !pi.traumas.some((t) => t.id === id));
    if (libres.length) {
      const [id, t] = libres[azar.entero(0, libres.length - 1)];
      pi.traumas.push({ id, cura: t.cura.tipo, resta: t.cura.cantidad || 0 });
      cambio('trauma', pi.apodo + ': ' + t.nombre, false);
    }
  }
  if (ef.recluta) {
    const nuevo = contratarGratis(datos, p, azar);
    if (nuevo) { cambio('reclutamiento', '«' + nuevo.apodo + '» se suma', true); anotar(p, 'Se sumó «' + nuevo.apodo + '» al escuadrón.', 'recluta'); }
    else cambio('reclutamiento', 'No hay lugar en el escuadrón', false);
  }
  if (ef.inteligencia) {
    const s = p.sectores[p.sector];
    if (s && s.inteligencia !== undefined) {
      const max = datos.sectores.campana_base.inteligencia.maxima;
      s.inteligencia = Math.max(0, Math.min(max, s.inteligencia + ef.inteligencia));
      cambio('ojo', (ef.inteligencia > 0 ? '+' : '') + ef.inteligencia + ' inteligencia sobre ' + s.jefe, ef.inteligencia > 0);
    }
  }
  if (ef.reparar_todo) {
    for (const x of p.pilotos) reparar(datos, p, x.id, 'todo', true);
    cambio('llave', 'Mechas reparados', true);
  }
  if (ef.xp) {
    const R = datos.reglas;
    for (const x of p.pilotos) {
      x.xp += ef.xp;
      while (x.nivel < R.xp_por_nivel.length && x.xp >= R.xp_por_nivel[x.nivel]) x.nivel++;
    }
    cambio('estrella', '+' + ef.xp + ' XP a todos', true);
  }
  if (ef.afinidad) {
    sumarAfinidadTodos(p, ef.afinidad);
    cambio('vinculo', ef.afinidad > 0 ? 'El escuadrón se une' : 'Hay tensión en el escuadrón', ef.afinidad > 0);
  }
}
