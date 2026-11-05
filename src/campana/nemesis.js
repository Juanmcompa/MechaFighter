// Nemesis: pilotos enemigos con nombre y bronca, que vuelven. Ver data/nemesis.json.
//
//  - Nacen cuando uno de los nuestros baja un mecha enemigo con piloto (bronca o un familiar que busca venganza),
//    o vienen de la campana anterior (un caido que no estaba muerto).
//  - Aparecen en contratos aceptados, y en la batalla van a buscar a su objetivo.
//  - Si los bajan y escapan, vuelven preparados contra la tactica que los bajo (otro mecha, otras ordenes).
//
// p.nemesis = [{ id, apodo, nombre, retrato, origen, objetivo, objetivoApodo, lugar, clase, nivel, mecha, gambits,
//               historia: [texto], estado: 'activo'|'muerto', apariciones, derrotas, ultima, aviso }]

import { mechaDeClase } from './reclutas.js';
import { ENCAJES } from '../motor/unidades.js';

const llenar = (t, v) => t.replace(/\{(\w+)\}/g, (_, k) => (v[k] !== undefined ? v[k] : ''));

export const activos = (p) => (p.nemesis || []).filter((n) => n.estado === 'activo');

function mechaCon(datos, clase, partes) {
  const mecha = mechaDeClase(datos, clase);
  let brazos = 0;
  for (const pid of partes || []) {
    const pz = datos.partes[pid];
    if (!pz) continue;
    if (pz.encaje === 'brazo') { mecha[brazos++ ? 'brazo_izq' : 'brazo_der'] = { parte: pid, afijos: [] }; }
    else if (ENCAJES.includes(pz.encaje)) mecha[pz.encaje] = { parte: pid, afijos: [] };
  }
  return mecha;
}

function nuevo(datos, p, az, origen, objetivo, lugar, nivel, base = null) {
  const N = datos.nemesis;
  const usados = new Set((p.nemesis || []).map((n) => n.apodo));
  const libres = N.apodos.filter((a) => !usados.has(a));
  const clase = base ? base.clase : az.elegir(['vanguardia', 'tirador', 'infiltrador']);
  const total = (datos.reglas.arte && datos.reglas.arte.retratos) || 0;
  const n = {
    id: 'n' + ((p.nemesis || []).length + 1) + '_' + p.misionesJugadas,
    apodo: base ? base.apodo : az.elegir(libres.length ? libres : N.apodos),
    nombre: base ? base.nombre : '',
    retrato: base ? base.retrato : (total ? az.entero(1, total) : 0),
    origen, objetivo: objetivo ? objetivo.id : null, objetivoApodo: objetivo ? objetivo.apodo : null, lugar,
    clase, nivel: Math.max(1, nivel),
    mecha: base ? JSON.parse(JSON.stringify(base.mecha)) : mechaDeClase(datos, clase),
    gambits: JSON.parse(JSON.stringify(base && base.gambits && base.gambits.length ? base.gambits : datos.clases[clase].gambits_de_fabrica)),
    personalidad: base ? base.personalidad : 'sanguinario',
    historia: [], estado: 'activo', apariciones: 0, derrotas: 0, ultima: p.misionesJugadas, aviso: null
  };
  const O = N.origenes[origen];
  n.intro = llenar(az.elegir(O.intro), { yo: n.apodo, objetivo: n.objetivoApodo || 'ustedes', lugar });
  n.historia.push(n.intro);
  (p.nemesis = p.nemesis || []).push(n);
  return n;
}

// Uno del escuadron anterior vuelve como nemesis (al empezar una campana con legado)
export function nemesisDelLegado(datos, p, foto, sectorNombre, veterano, az) {
  return nuevo(datos, p, az, 'caido', veterano || null, sectorNombre || 'la campaña anterior', foto.nivel, foto);
}

// Despues de una mision: si uno de los nuestros bajo un mecha con piloto, puede nacer un nemesis
export function quizasNace(datos, p, resultado, m, az) {
  const N = datos.nemesis;
  if (activos(p).length >= N.max_activos) return null;
  // el primero de la campana nace seguro (si no, hay campanas enteras sin ninguno)
  const chance = (p.nemesis || []).length === 0 && p.misionesJugadas >= 1 ? 100 : N.chance_nace;
  const reg = resultado.registro || [];
  const fichas = new Map();
  for (const e of reg) if (e.tipo === 'aparece' && e.ficha) fichas.set(e.u, e.ficha);
  for (const e of reg) {
    if (e.tipo !== 'muere' || !e.por) continue;
    const f = fichas.get(e.u), k = fichas.get(e.por);
    if (!f || !k || f.bando !== 1 || f.cuerpo !== 'mecha' || f.exPiloto || f.rol === 'vip' || k.bando !== 0) continue;
    if (['torreta_ligera', 'transporte', 'senuelo'].includes(f.ref)) continue;
    const objetivo = p.pilotos.find((x) => x.id === k.ref);
    if (!objetivo || !az.tirada(chance)) continue;
    const lugar = '«' + m.nombre + '»';
    return nuevo(datos, p, az, az.tirada(50) ? 'bronca' : 'familiar', objetivo, lugar, (m.nivel || 1) + 1);
  }
  return null;
}

// En el mapa: en que contratos de la columna que viene se vio a un nemesis ({ indiceDelNodo: idNemesis }).
// Se decide antes de elegir (azar fijo por nodo), asi el jugador lo ve y puede ir a buscarlo o esquivarlo.
export function nemesisEnNodos(datos, p, nodos, azarDeNodo) {
  const N = datos.nemesis;
  const res = {};
  const cand = activos(p).filter((n) => p.misionesJugadas - n.ultima >= N.misiones_entre_apariciones);
  for (const nodo of nodos) {
    const libres = cand.filter((n) => !Object.values(res).includes(n.id));
    if (!libres.length) break;
    if (nodo.tipo !== 'mision' || !nodo.mision || nodo.mision.encuentro) continue;
    const az = azarDeNodo(nodo.i);
    const n = az.elegir(libres);
    const busca = p.pilotos.some((pi) => pi.id === n.objetivo);
    if (az.tirada(N.chance_aparece + (busca ? N.chance_aparece_si_va_su_objetivo : 0))) res[nodo.i] = n.id;
  }
  return res;
}

// Al aceptar un contrato donde se vio a un nemesis: se suma a la mision
export function quizasAparece(datos, p, m, desplegados, az, nemesisId) {
  const N = datos.nemesis;
  const n = activos(p).find((x) => x.id === nemesisId);
  if (!n || m.encuentro || m.jefe) return null;
  const va = desplegados.some((pi) => pi.id === n.objetivo);
  const O = N.origenes[n.origen];
  const frase = llenar(az.elegir(O.frases), { objetivo: n.objetivoApodo || 'Control' });
  const piloto = { id: n.id, nombre: n.nombre || n.apodo, apodo: n.apodo, retrato: n.retrato, clase: n.clase, personalidad: n.personalidad,
    nivel: Math.min(n.nivel, (m.nivel || 1) + 2), xp: 0, medallas: [], cicatrices: [], traumas: [], hoja: [], bajas: 0, misiones: 0 };
  m.rivales = (m.rivales || []).concat({ piloto, mecha: n.mecha, gambits: n.gambits, odia: va ? n.objetivo : null, nemesis: true, frase });
  m.nemesis = n.id;
  m.cantidadEnemigos = (m.cantidadEnemigos || 0) + 1;
  m.recompensa.creditos += N.premio;
  return n;
}

// Que arma le hizo mas dano en la batalla
function tacticaQueLoBajo(datos, reg, uid) {
  const porTipo = {};
  for (const e of reg) if (e.tipo === 'dispara' && e.o === uid && e.acierta && e.danio) porTipo[e.arma] = (porTipo[e.arma] || 0) + e.danio;
  const top = Object.entries(porTipo).sort((a, b) => b[1] - a[1])[0];
  if (!top) return null;
  for (const [id, t] of Object.entries(datos.nemesis.tacticas)) if (t.tipos.includes(top[0])) return id;
  return null;
}

// Despues de la mision con nemesis: como termino, y si vuelve, con que
export function resolverNemesis(datos, p, resultado, m, az) {
  if (!m.nemesis) return null;
  const N = datos.nemesis;
  const n = (p.nemesis || []).find((x) => x.id === m.nemesis);
  if (!n) return null;
  const reg = resultado.registro || [];
  const fichas = new Map();
  let uid = null;
  for (const e of reg) if (e.tipo === 'aparece' && e.ficha) { fichas.set(e.u, e.ficha); if (e.ficha.ref === 'ex:' + n.id) uid = e.u; }
  n.apariciones++;
  n.ultima = p.misionesJugadas;
  n.aviso = null;
  const out = { apodo: n.apodo, retrato: n.retrato, textos: [] };
  // a quien bajo
  for (const e of reg) {
    if (e.tipo !== 'muere' || e.por !== uid) continue;
    const f = fichas.get(e.u);
    if (f && f.bando === 0 && f.ref) {
      const victima = p.pilotos.find((x) => x.id === f.ref) || { apodo: f.nombre };
      out.textos.push(llenar(az.elegir(N.final.cobra), { yo: n.apodo, victima: victima.apodo }));
      n.historia.push('Bajó a «' + victima.apodo + '» en «' + m.nombre + '».');
    }
  }
  const muerte = reg.find((e) => e.tipo === 'muere' && e.u === uid);
  if (!muerte) {
    n.nivel++;
    out.textos.push(llenar(az.elegir(N.final.sigue), { yo: n.apodo }));
    n.historia.push('Salió entero de «' + m.nombre + '».');
    return out;
  }
  const k = muerte.por ? fichas.get(muerte.por) : null;
  const asesino = k && k.bando === 0 ? (p.pilotos.find((x) => x.id === k.ref) || { apodo: k.nombre, id: null }) : null;
  n.derrotas++;
  if (muerte.limpio || az.tirada(N.chance_muere + N.chance_muere_por_derrota * (n.derrotas - 1))) {
    n.estado = 'muerto';
    out.muerto = true;
    out.textos.push(llenar(az.elegir(N.final.muere), { yo: n.apodo, asesino: asesino ? asesino.apodo : 'el escuadrón' }));
    n.historia.push('Cayó para siempre en «' + m.nombre + '»' + (asesino ? ', a manos de «' + asesino.apodo + '»' : '') + '.');
    if (asesino && asesino.id) (asesino.hoja = asesino.hoja || []).push('Terminó con «' + n.apodo + '», su némesis, en «' + m.nombre + '».');
    return out;
  }
  // escapo: vuelve preparado contra lo que lo bajo, y con bronca contra quien lo bajo
  out.textos.push(llenar(az.elegir(N.final.escapa), { yo: n.apodo }));
  n.nivel++;
  const tac = tacticaQueLoBajo(datos, reg, uid);
  if (tac) {
    const T = N.tacticas[tac];
    n.clase = T.clase;
    n.mecha = mechaCon(datos, T.clase, T.partes);
    n.gambits = JSON.parse(JSON.stringify(datos.clases[T.clase].gambits_de_fabrica));
    n.aviso = T.aviso;
    out.textos.push(T.aviso);
    n.historia.push('En «' + m.nombre + '» ' + T.como + '. ' + T.aviso);
  } else n.historia.push('Escapó de «' + m.nombre + '».');
  if (asesino && asesino.id && asesino.id !== n.objetivo) {
    n.objetivo = asesino.id; n.objetivoApodo = asesino.apodo;
    out.textos.push('Ahora la tiene con «' + asesino.apodo + '».');
  }
  return out;
}

// Si su objetivo cae (en cualquier lado), el nemesis busca a otro del escuadron
export function reasignarObjetivos(p) {
  for (const n of activos(p)) {
    if (!n.objetivo || p.pilotos.some((x) => x.id === n.objetivo)) continue;
    n.historia.push('«' + n.objetivoApodo + '» ya no está. Ahora va por todo el escuadrón.');
    n.objetivo = null; n.objetivoApodo = null;
  }
}

// Los nemesis que buscan a este piloto
export const loBuscan = (p, pilotoId) => activos(p).filter((n) => n.objetivo === pilotoId);
