// El sector como lo ve la nodriza: un plano redondo con la nave, los destinos a su alrededor (contratos, paradas,
// señales...), los bandos que se lo reparten como porciones de torta y las amenazas (nidos de fauna, focos de
// contagio) que atacan a todos. Nunca se ve entero: solo lo que esta cerca de la nave.
//
// Coordenadas en "saltos": un destino a distancia 1 cuesta 1 de combustible (hasta 3). El centro del sector es (0, 0).
// Datos: bandos.json (bandos, amenazas, reputacion, frente, brujula) y nodriza.json (mejoras de la nave).

const TAU = Math.PI * 2;
const recortar = (v, a, b) => Math.max(a, Math.min(b, v));

export const distancia = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const costoSalto = (a, b) => recortar(Math.round(distancia(a, b)), 1, 3);

// ---------- Quien es quien ----------

export const quien = (datos, id) => datos.bandos.bandos[id] || datos.bandos.amenazas[id] || null;
export const esAmenaza = (datos, id) => !!datos.bandos.amenazas[id];

// ---------- Reputacion ----------

export const reputacion = (p, id) => (p.reputacion && p.reputacion[id]) || 0;
const escalones = (datos) => datos.bandos.reputacion.escalones;
export const escalonPorId = (datos, id) => escalones(datos).find((e) => e.id === id);
export const indiceEscalon = (datos, id) => escalones(datos).findIndex((e) => e.id === id);

export function escalon(datos, valor) {
  let r = escalones(datos)[0];
  for (const e of escalones(datos)) if (valor >= e.desde) r = e;
  return r;
}

// Como te ve un bando (los neutrales, y las paradas libres, siempre como neutral)
export function escalonDe(datos, p, id) {
  const b = datos.bandos.bandos[id];
  if (!b || b.neutral) return escalonPorId(datos, 'neutral');
  return escalon(datos, reputacion(p, id));
}

export function sumarReputacion(datos, p, id, d) {
  if (!datos.bandos.bandos[id] || datos.bandos.bandos[id].neutral || !d) return null;
  p.reputacion = p.reputacion || {};
  const antes = reputacion(p, id);
  p.reputacion[id] = recortar(antes + d, -100, 100);
  return { id, antes, despues: p.reputacion[id] };
}

// ---------- Nodriza ----------

export function nodrizaInicial(datos) {
  const n = {};
  for (const [id, m] of Object.entries(datos.nodriza.modulos)) n[id] = m.inicial;
  return n;
}
export const nivelModulo = (datos, p, id) => (p.nodriza && p.nodriza[id] !== undefined ? p.nodriza[id] : datos.nodriza.modulos[id].inicial);
export const valorModulo = (datos, p, id) => datos.nodriza.modulos[id].niveles[nivelModulo(datos, p, id)].valor;
export const combustibleMaximo = (datos, p) => valorModulo(datos, p, 'tanque');
export const limitePilotos = (datos, p) => Math.max(valorModulo(datos, p, 'hangar'), 1);
export const destinosQueVe = (datos, p) => Math.min(datos.bandos.brujula.maximo, valorModulo(datos, p, 'sensor'));
export const veSenales = (datos, p) => valorModulo(datos, p, 'sensor') > datos.bandos.brujula.maximo;

// ---------- Territorio ----------

// De quien es un punto del sector: el contagio se come lo que toca; el resto se reparte en porciones de torta
// alrededor del centro, del tamano que diga el frente.
export function duenoEn(s, x, y) {
  for (const a of s.amenazas) if (a.tipo === 'contagio' && a.vivo && Math.hypot(x - a.x, y - a.y) < a.r) return 'contagio';
  const total = s.bandos.reduce((t, b) => t + s.frente[b], 0) || 1;
  let ang = (Math.atan2(y, x) - s.giro) / TAU;
  ang -= Math.floor(ang);
  let acum = 0;
  for (const b of s.bandos) {
    acum += s.frente[b] / total;
    if (ang < acum) return b;
  }
  return s.bandos[s.bandos.length - 1];
}

// Porcentaje del sector que se comio el contagio (para la barra del frente)
export function contagioPct(datos, s) {
  const R = datos.bandos.brujula.radio_sector;
  const area = s.amenazas.filter((a) => a.tipo === 'contagio' && a.vivo).reduce((t, a) => t + Math.PI * a.r * a.r, 0);
  return Math.round(Math.min(60, (area * 100) / (Math.PI * R * R)));
}

// ---------- Plano del sector ----------

function punto(az, rMin, rMax) {
  const a = (az.entero(0, 3599) / 3600) * TAU;
  const r = rMin + ((rMax - rMin) * az.entero(0, 1000)) / 1000;
  return { x: Math.round(Math.cos(a) * r * 100) / 100, y: Math.round(Math.sin(a) * r * 100) / 100 };
}

// Arma el plano vacio: bandos y frente, amenazas, nodo de inicio (en el borde) y la guarida (del otro lado).
export function crearPlano(datos, s, sdef, az) {
  const R = datos.bandos.brujula.radio_sector;
  s.bandos = (sdef.bandos || Object.keys(datos.bandos.bandos).filter((b) => !datos.bandos.bandos[b].neutral).slice(0, 2)).slice();
  s.frente = {};
  const parte = Math.floor(100 / s.bandos.length);
  s.bandos.forEach((b, k) => { s.frente[b] = parte + (k === 0 ? 100 - parte * s.bandos.length : 0); });
  s.giro = (az.entero(0, 359) / 360) * TAU;
  s.amenazas = [];
  for (const id of sdef.amenazas || []) {
    const A = datos.bandos.amenazas[id];
    const n = az.entero(A.focos[0], A.focos[1]);
    for (let k = 0; k < n; k++) {
      const q = punto(az, R * 0.3, R * 0.8);
      s.amenazas.push({ id: id + k, tipo: id, x: q.x, y: q.y, r: A.radio_inicial || 0, vivo: true });
    }
  }
  s.nodos = [];
  s.sigId = 0;
  const angInicio = (az.entero(0, 359) / 360) * TAU;
  const inicio = agregar(s, { tipo: 'inicio', x: Math.round(Math.cos(angInicio) * R * 0.9 * 100) / 100, y: Math.round(Math.sin(angInicio) * R * 0.9 * 100) / 100 });
  inicio.visitado = true;
  s.actual = inicio.i;
  s.ruta = [[inicio.x, inicio.y]];
  s.saltos = 0;
  // la guarida del jefe, del otro lado del sector
  const angG = angInicio + Math.PI + ((az.entero(0, 60) - 30) / 180) * Math.PI;
  s.guarida = { x: Math.round(Math.cos(angG) * R * 0.65 * 100) / 100, y: Math.round(Math.sin(angG) * R * 0.65 * 100) / 100 };
  return inicio;
}

export function agregar(s, nodo) {
  nodo.i = s.sigId++;
  s.nodos.push(nodo);
  return nodo;
}

export const nodoActual = (p) => {
  const s = p.sectores[p.sector];
  return s && s.nodos ? s.nodos.find((n) => n.i === s.actual) : null;
};

// Rodea a la nave de destinos nuevos hasta que vea los que su sensor alcanza. Los contratos vencidos se van.
// crear(x, y): arma el nodo (lo hace partida.js, que sabe armar misiones y paradas).
export function rodear(datos, p, az, crear) {
  const s = p.sectores[p.sector];
  const Bj = datos.bandos.brujula;
  const R = Bj.radio_sector;
  const aca = nodoActual(p);
  s.nodos = s.nodos.filter((n) => n === aca || n.visitado || n.vence === undefined || n.vence >= s.saltos);
  const quiere = destinosQueVe(datos, p);
  const libres = () => s.nodos.filter((n) => n !== aca && !n.visitado && n.tipo !== 'jefe' && distancia(n, aca) <= Bj.visible).length;
  for (let intento = 0; libres() < quiere && intento < 60; intento++) {
    const d = az.elegirConPeso(Bj.distancias) + (az.entero(-25, 25) / 100);
    const ang = (az.entero(0, 359) / 360) * TAU;
    const x = Math.round((aca.x + Math.cos(ang) * d) * 100) / 100, y = Math.round((aca.y + Math.sin(ang) * d) * 100) / 100;
    if (Math.hypot(x, y) > R) continue;
    if (s.nodos.some((n) => Math.hypot(n.x - x, n.y - y) < Bj.separacion) || Math.hypot(s.guarida.x - x, s.guarida.y - y) < Bj.separacion) continue;
    crear(x, y);
  }
}

// La guarida se abre con suficiente inteligencia sobre el jefe
export function guaridaAbierta(datos, s) {
  const I = datos.sectores.campana_base.inteligencia;
  return s.inteligencia >= (I.para_guarida || I.maxima);
}

// Los destinos que se ven desde la nave: los nuevos primero (hasta lo que alcanza el sensor), despues los ya
// visitados que quedan cerca (en gris: se puede volver, pagando el salto), y la guarida del jefe.
export function destinos(datos, p) {
  const s = p.sectores[p.sector];
  if (!s || !s.nodos) return [];
  const Bj = datos.bandos.brujula;
  const aca = nodoActual(p);
  const cerca = s.nodos.filter((n) => n !== aca && n.tipo !== 'jefe' && distancia(n, aca) <= Bj.visible)
    .sort((a, b) => (a.visitado ? 1 : 0) - (b.visitado ? 1 : 0) || distancia(a, aca) - distancia(b, aca));
  const nuevos = cerca.filter((n) => !n.visitado).slice(0, destinosQueVe(datos, p));
  const viejos = cerca.filter((n) => n.visitado);
  const jefe = s.nodos.find((n) => n.tipo === 'jefe');
  const lugar = Bj.maximo - (jefe ? 1 : 0);
  const lista = nuevos.concat(viejos).slice(0, lugar).map((n) => ({ nodo: n, costo: costoSalto(n, aca), bloqueado: false }));
  if (jefe) {
    const abierta = guaridaAbierta(datos, s);
    lista.push({ nodo: jefe, costo: abierta ? recortar(Math.ceil(distancia(jefe, aca) / 3), 1, 3) : 0, bloqueado: !abierta });
  }
  // en el orden de la brujula (por angulo), asi no saltan de lugar al tocarlos
  for (const d of lista) d.angulo = Math.atan2(d.nodo.y - aca.y, d.nodo.x - aca.x);
  return lista;
}

// ---------- Frente y amenazas que se mueven solas ----------

// El frente corre (bando que gana +n, el que pierde -n, nunca debajo del minimo)
export function correrFrente(datos, s, gana, pierde, n) {
  const F = datos.bandos.frente;
  if (!s.frente || s.frente[gana] === undefined) return 0;
  const perdedores = pierde && s.frente[pierde] !== undefined ? [pierde] : s.bandos.filter((b) => b !== gana);
  let movido = 0;
  for (const b of perdedores) {
    const q = Math.min(Math.ceil(n / perdedores.length), Math.max(0, s.frente[b] - F.minimo));
    s.frente[b] -= q; s.frente[gana] += q; movido += q;
  }
  return movido;
}

// Lo que cambia en este sector: suma de sus rasgos (sectores.json) y de la noticia que este corriendo (bandos.json)
export function modSector(s, clave) {
  if (!s) return 0;
  let n = 0;
  for (const r of s.rasgos || []) n += (r.efectos && r.efectos[clave]) || 0;
  if (s.noticia && s.noticia.mods && s.noticia.hasta > s.saltos) n += s.noticia.mods[clave] || 0;
  return n;
}

// En cada salto la guerra sigue: el frente se mueve un poco y el contagio crece
export function pasaElTiempo(datos, s, az) {
  const F = datos.bandos.frente;
  if (s.bandos.length > 1 && F.deriva_por_salto) {
    const gana = az.elegir(s.bandos);
    correrFrente(datos, s, gana, az.elegir(s.bandos.filter((b) => b !== gana)), F.deriva_por_salto + modSector(s, 'deriva'));
  }
  for (const a of s.amenazas) {
    const A = datos.bandos.amenazas[a.tipo];
    if (a.vivo && A.crece_por_salto) a.r = Math.round(Math.min(A.radio_maximo, a.r + A.crece_por_salto) * 100) / 100;
  }
}

// Amenazas cerca de un punto (para que se cuelen en las misiones de alrededor)
export function amenazasCerca(datos, s, x, y) {
  return s.amenazas.filter((a) => a.vivo && Math.hypot(a.x - x, a.y - y) < (a.r || 0) + datos.bandos.amenazas[a.tipo].radio);
}

// Un nombre de escalon con su numero ("Confiable +34")
export function textoReputacion(datos, p, id) {
  const v = reputacion(p, id);
  return escalonDe(datos, p, id).nombre + ' ' + (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v);
}

// Lo que pasaria si se gana un contrato: reputacion con cada bando y frente (para mostrarlo antes de aceptar)
export function efectoContrato(datos, p, s, m) {
  const RP = datos.bandos.reputacion;
  const out = { cambios: [], frente: null, amenaza: null };
  if (!m || !m.cliente) return out;
  const poner = (id, d) => {
    if (!datos.bandos.bandos[id] || datos.bandos.bandos[id].neutral) return;
    const antes = reputacion(p, id), despues = recortar(antes + d, -100, 100);
    out.cambios.push({ id, antes, despues, d, antesEscalon: escalon(datos, antes), despuesEscalon: escalon(datos, despues) });
  };
  if (esAmenaza(datos, m.objetivo)) {
    poner(m.cliente, RP.contrato_ganado.contra_amenaza_cliente);
    for (const b of s.bandos) if (b !== m.cliente) poner(b, RP.contrato_ganado.contra_amenaza_todos);
    out.amenaza = m.nido ? 'Limpia el nido y deja restos.' : m.objetivo === 'contagio' ? 'Hace retroceder el contagio.' : null;
  } else {
    poner(m.cliente, RP.contrato_ganado.cliente);
    poner(m.objetivo, RP.contrato_ganado.rival);
    const F = datos.bandos.frente;
    const q = Math.min(F.por_contrato, Math.max(0, (s.frente[m.objetivo] || 0) - F.minimo));
    if (q && s.frente[m.cliente] !== undefined) out.frente = { bando: m.cliente, antes: s.frente[m.cliente], despues: s.frente[m.cliente] + q };
  }
  return out;
}

// Texto corto de lo que mueve un contrato ("Cooperativa +8 · La Grúa −10 · frente +4%")
export function textoEfecto(datos, ef) {
  const partes = ef.cambios.map((c) => quien(datos, c.id).corto + ' ' + (c.d > 0 ? '+' : '−') + Math.abs(c.d));
  if (ef.frente) partes.push('frente +' + (ef.frente.despues - ef.frente.antes) + '%');
  if (ef.amenaza) partes.push(ef.amenaza);
  return partes.join(' · ');
}
