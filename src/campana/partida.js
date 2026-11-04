// La campana roguelite: escuadron, mapa de sectores, nodos (mision, taller, reclutamiento, evento, descanso),
// informe despues de cada mision (XP, cicatrices, traumas, medallas, permadeath, botin) y fin de la partida.
//
// La partida es un objeto plano (se guarda tal cual en el aparato). Todo lo que se sortea sale de la semilla de la
// partida y de un contador de pasos: la misma semilla con las mismas elecciones da la misma campana.

import { crearAzar } from '../core/azar.js';
import { crearRecluta } from './reclutas.js';
import { armarMision, sumarCondicion } from './misiones.js';
import { saquear } from './saqueo.js';
import { fotoPiloto, legadoDeDerrota, legadoDeVictoria, sumarPilotoDeOtraCampana, misionEncuentro } from './legado.js';
import { momentosDeMision, sumarAHoja } from './hoja.js';
import { presentar, calcularAnimo, actualizarAfinidad } from './animo.js';
import { ENCAJES, normalizarPieza, nombrePieza } from '../motor/unidades.js';

export const VERSION_PARTIDA = 1;
const MAX_HOJA_MEMORIAL = 6;

// Azar aparte para afinidad y animo: no corre el contador de pasos, asi no cambia el resto de la campana
// (mapas, botin, contratos) por sumar estas tiradas.
function azarAparte(p, etiqueta) {
  return crearAzar(p.semilla).derivar(etiqueta + ':' + p.misionesJugadas + ':' + p.sector + ':' + p.columna + ':' + p.pilotos.length);
}

function azarDe(p, etiqueta) {
  p.paso = (p.paso || 0) + 1;
  return crearAzar(p.semilla).derivar(etiqueta + ':' + p.paso);
}
const nuevoId = (p) => 'p' + (p.siguienteId++);

// ---------- Inicio ----------

// legado: lo que dejo la campana anterior (veterano, escuadron perdido). Ver legado.js.
export function nuevaPartida(datos, semilla, legado = null) {
  const R = datos.reglas;
  const p = {
    version: VERSION_PARTIDA, versionDatos: R.version_datos, semilla, paso: 0, siguienteId: 1,
    creditos: R.recursos_iniciales.creditos, puntaje: 0,
    pilotos: [], caidos: [], inventario: [],
    sector: 0, columna: -1, sectores: [], nodo: null,
    estado: 'sectores', resultado: null, misionesJugadas: 0, ultimoInforme: null
  };
  const az = azarDe(p, 'inicio');
  const otras = Object.keys(datos.clases).filter((c) => !['vanguardia', 'tirador', 'medico'].includes(c));
  const clases = ['vanguardia', 'tirador', 'medico', az.elegir(otras)].slice(0, R.reclutas_iniciales);
  for (const c of clases) p.pilotos.push(crearRecluta(datos, az, nuevoId(p), c, p.pilotos.map((x) => x.apodo), p.pilotos.map((x) => x.retrato)));
  // Vinculos de a pares: con alguien tienen que contar (y a alguien van a extranar)
  for (let i = 0; i + 1 < p.pilotos.length; i += 2) vincular(p.pilotos[i], p.pilotos[i + 1]);
  if (legado && legado.veterano) {
    const v = legado.veterano;
    sumarPilotoDeOtraCampana(datos, p, v, nuevoId(p), v.comoLlego === 'sobrevivio'
      ? 'Sobrevivió a la caída de su escuadrón en ' + (legado.sectorNombre || 'la campaña anterior') + '. Volvió a firmar.'
      : 'Veterano de la campaña anterior. Eligió seguir.');
  }
  if (legado && legado.escuadron && legado.escuadron.length) p.encuentro = { escuadron: legado.escuadron, sectorNombre: legado.sectorNombre, hecho: false };
  p.afinidad = {};
  const azAf = azarAparte(p, 'afinidad');
  for (const pi of p.pilotos) presentar(datos, p, pi, azAf);
  // una parte especial para empezar a probar habilidades nuevas
  p.inventario.push({ parte: 'brazo_rifle', afijos: [] }, { parte: 'mochila_municion', afijos: [] }, { parte: 'cabeza_radar', afijos: [] });
  generarSector(datos, p);
  return p;
}

function vincular(a, b) {
  a.vinculo = b.id; b.vinculo = a.id;
  // un vinculo nuevo cura la culpa del superviviente
  for (const x of [a, b]) x.traumas = x.traumas.filter((t) => t.cura !== 'nuevo_vinculo');
}

// ---------- Mapa de sectores ----------

export function generarSector(datos, p) {
  const def = datos.sectores.campana_base;
  const sdef = def.sectores_def[p.sector] || def.sectores_def.at(-1);
  const az = azarDe(p, 'sector');
  const dif = def.dificultad_por_sector[p.sector] || def.dificultad_por_sector.at(-1);
  const pesos = Object.entries(def.tipos_de_nodo);
  const misionesPosibles = def.misiones_por_dificultad[String(dif)];
  const nivel = (def.nivel_enemigo_por_sector || [])[p.sector] || dif;
  const columnas = [];
  for (let c = 0; c < def.columnas_por_sector; c++) {
    const ultima = c === def.columnas_por_sector - 1;
    const n = ultima ? 1 : az.entero(def.nodos_por_columna.min, def.nodos_por_columna.max);
    const col = [];
    for (let i = 0; i < n; i++) {
      let tipo = ultima ? 'jefe' : c === 0 ? 'mision' : az.elegirConPeso(pesos);
      if (tipo === 'mision' && col.filter((x) => x.tipo === 'mision').length >= 2) tipo = 'evento';
      const nodo = { tipo };
      if (tipo === 'mision') nodo.mision = armarMision(datos, az.elegir(misionesPosibles), dif, az, nivel);
      if (tipo === 'jefe') {
        const J = sdef.jefe;
        nodo.mision = armarMision(datos, J.plantilla, dif + 1, az, nivel + 1, { lider: J.unidad, enemigos: J.escuadras });
        nodo.mision.nombre = J.nombre;
        nodo.mision.descripcion = 'Objetivo del sector: ' + J.nombre + '. ' + nodo.mision.descripcion;
        nodo.mision.jefe = { nombre: J.nombre, frase: J.frase };
        nodo.mision.recompensa.creditos += 100;
        nodo.mision.recompensa.botin += 1;
      }
      nodo.i = i;
      col.push(nodo);
    }
    columnas.push(col);
  }
  // El escuadron de la campana anterior aparece en un contrato del sector indicado
  const L = datos.reglas.legado;
  if (p.encuentro && !p.encuentro.hecho && p.sector === Math.min(L.sector_encuentro, def.sectores - 1)) {
    const col = columnas[Math.min(L.columna_encuentro, columnas.length - 2)];
    const k = Math.max(0, col.findIndex((n) => n.tipo === 'mision'));
    col[k] = { tipo: 'mision', i: col[k].i, encuentro: true, mision: misionEncuentro(datos, p, az, dif, nivel) };
  }
  // Caminos: cada nodo lleva a 1 o 2 de la columna siguiente (los de enfrente), y a cada nodo llega al menos uno.
  for (let c = 0; c < columnas.length - 1; c++) {
    const a = columnas[c], b = columnas[c + 1];
    const frente = (i) => Math.round(((i + 0.5) / a.length) * b.length - 0.5);
    for (const nodo of a) {
      const j = Math.max(0, Math.min(b.length - 1, frente(nodo.i)));
      nodo.sig = [j];
      if (b.length > 1 && az.entero(def.enlaces_por_nodo.min, def.enlaces_por_nodo.max) > 1) {
        const otro = j + (az.tirada(50) ? 1 : -1);
        const k = otro >= 0 && otro < b.length ? otro : j + (j + 1 < b.length ? 1 : -1);
        if (!nodo.sig.includes(k)) nodo.sig.push(k);
      }
    }
    for (const nb of b) {
      if (a.some((x) => x.sig.includes(nb.i))) continue;
      // nadie llega: lo engancha el de enfrente
      const cerca = a.slice().sort((x, y) => Math.abs(x.i / a.length - nb.i / b.length) - Math.abs(y.i / a.length - nb.i / b.length))[0];
      cerca.sig.push(nb.i);
    }
    for (const nodo of a) nodo.sig.sort((x, y) => x - y);
  }
  p.sectores[p.sector] = {
    nombre: sdef.nombre, numero: p.sector + 1, de: def.sectores, objetivo: sdef.objetivo, jefe: sdef.jefe.nombre,
    dificultad: dif, columnas, inteligencia: 0
  };
  p.columna = -1;
  p.posicion = null; // en que nodo de la columna actual esta el escuadron
}

// Inteligencia sobre el jefe: sin datos llega con refuerzos; con suficientes, sin niebla y el escuadron atento.
function inteligenciaAlJefe(datos, p, nodo) {
  const I = datos.sectores.campana_base.inteligencia;
  const s = p.sectores[p.sector];
  if (s.inteligencia === undefined) return; // partida guardada antes de que existiera
  const m = nodo.mision = JSON.parse(JSON.stringify(nodo.mision));
  const az = azarAparte(p, 'jefe');
  const escuadras = datos.sectores.campana_base.sectores_def[p.sector] ? datos.sectores.campana_base.sectores_def[p.sector].jefe.escuadras : ['banda_con_mecha'];
  if (!s.inteligencia) sumarCondicion(datos, m, I.sin_datos, az, escuadras);
  else if (s.inteligencia >= I.datos_desde) sumarCondicion(datos, m, I.con_datos, az, escuadras);
  m.cantidadEnemigos = m.oleadas.reduce((t, o) => t + o.length, 0) + m.emboscadas.reduce((t, e) => t + e.unidades.length, 0) + (m.refuerzos ? m.refuerzos.unidades.length : 0);
  m.inteligencia = s.inteligencia;
}

// Los nodos a los que se puede ir desde donde esta el escuadron
export function nodosSiguientes(p) {
  const s = p.sectores[p.sector];
  if (!s || !s.columnas[p.columna + 1]) return [];
  const sig = s.columnas[p.columna + 1];
  if (p.columna < 0 || p.posicion === null || p.posicion === undefined) return sig;
  const aca = s.columnas[p.columna][p.posicion];
  return aca && aca.sig ? sig.filter((n) => aca.sig.includes(n.i)) : sig;
}

export function elegirNodo(datos, p, i) {
  const nodo = nodosSiguientes(p)[i];
  if (!nodo) return null;
  p.columna++;
  p.posicion = nodo.i;
  p.nodo = { ...nodo, indice: i };
  nodo.visitado = true;
  // al jefe se llega con lo que se averiguo en el camino
  if (nodo.tipo === 'jefe') inteligenciaAlJefe(datos, p, p.nodo);
  const R = datos.reglas.campana;
  switch (nodo.tipo) {
    case 'mision':
    case 'jefe':
      p.estado = 'preparacion';
      // como llega cada uno: queda fijo para esta mision (recargar la pagina no lo cambia)
      p.nodo.animo = calcularAnimo(datos, p, nodo.mision, p.pilotos.slice(0, datos.reglas.escuadra_maxima), azarAparte(p, 'animo'));
      break;
    case 'taller': {
      const az = azarDe(p, 'taller');
      p.nodo.oferta = [];
      for (let k = 0; k < R.partes_en_taller; k++) {
        const pieza = sortearParte(datos, az, p.sectores[p.sector].dificultad);
        p.nodo.oferta.push({ pieza, precio: precioPieza(datos, pieza), vendida: false });
      }
      p.estado = 'taller';
      break;
    }
    case 'reclutamiento': {
      const az = azarDe(p, 'recluta');
      const usados = p.pilotos.map((x) => x.apodo).concat(p.caidos.map((x) => x.apodo));
      const caras = p.pilotos.map((x) => x.retrato);
      const a = crearRecluta(datos, az, nuevoId(p), null, usados, caras);
      p.nodo.candidatos = [a, crearRecluta(datos, az, nuevoId(p), null, usados.concat(a.apodo), caras.concat(a.retrato))];
      p.estado = 'reclutamiento';
      break;
    }
    case 'evento': {
      const az = azarDe(p, 'evento');
      const ev = az.elegir(datos.textos.eventos);
      const res = { texto: ev.texto };
      if (ev.creditos) { res.creditos = az.entero(ev.creditos[0], ev.creditos[1]); p.creditos += res.creditos; }
      if (ev.parte) { const pz = sortearParte(datos, az, p.sectores[p.sector].dificultad); p.inventario.push(pz); res.parte = nombrePieza(datos, pz); }
      p.nodo.resultado = res;
      p.estado = 'evento';
      break;
    }
    case 'descanso': {
      const curados = [];
      for (const pi of p.pilotos) {
        for (const t of pi.traumas) if (t.cura === 'misiones_de_descanso') t.resta -= 2;
        const antes = pi.traumas.length;
        pi.traumas = pi.traumas.filter((t) => t.cura !== 'misiones_de_descanso' || t.resta > 0);
        if (pi.traumas.length < antes) curados.push(pi.apodo);
      }
      p.nodo.resultado = { texto: 'Una semana en el muelle orbital. Se reparan los mechas y se ordenan las cabezas.', curados };
      p.estado = 'evento';
      break;
    }
  }
  return p.nodo;
}

// Cerrar un nodo que no es mision (taller, reclutamiento, evento): seguir viaje.
export function seguir(datos, p) {
  p.nodo = null;
  avanzar(datos, p);
}

function avanzar(datos, p) {
  const def = datos.sectores.campana_base;
  if (p.estado === 'fin') return;
  if (p.columna >= def.columnas_por_sector - 1) {
    p.puntaje += datos.reglas.campana.puntaje_por_sector;
    if (p.sector + 1 >= def.sectores) { p.estado = 'fin'; p.resultado = 'victoria'; p.legado = legadoDeVictoria(p); return; }
    p.sector++;
    generarSector(datos, p);
  }
  p.estado = 'sectores';
}

// ---------- Botin, taller y reclutamiento ----------

export function sortearParte(datos, az, dificultad = 1) {
  const R = datos.reglas;
  const pesos = Object.entries(R.rarezas).map(([r, w], i) => [r, i === 0 ? Math.max(10, w - dificultad * 10) : w + dificultad * 3]);
  const rareza = az.elegirConPeso(pesos);
  const orden = Object.keys(R.rarezas);
  let candidatas = Object.entries(datos.partes).filter(([id, pt]) => pt.rareza === rareza && pt.costo > 0);
  for (let k = orden.indexOf(rareza); !candidatas.length && k >= 0; k--) {
    candidatas = Object.entries(datos.partes).filter(([, pt]) => pt.rareza === orden[k] && pt.costo > 0);
  }
  const [id, parte] = az.elegir(candidatas);
  const afijos = [];
  const ranuras = parte.ranuras_afijo || (parte.encaje === 'torso' ? 1 : 0);
  if (ranuras && az.tirada(R.campana.botin_chance_afijo)) {
    const aptos = Object.entries(datos.afijos).filter(([, a]) => a.etiquetas.some((t) => parte.etiquetas.includes(t)) &&
      orden.indexOf(a.rareza_minima) <= orden.indexOf(rareza) + 1);
    if (aptos.length) afijos.push(az.elegirConPeso(aptos.map(([aid, a]) => [aid, a.peso])));
  }
  return { parte: id, afijos };
}

export function precioPieza(datos, pieza) {
  const pt = datos.partes[pieza.parte];
  const base = datos.reglas.campana.precio_parte_por_rareza[pt.rareza] || pt.costo;
  return base + pieza.afijos.length * 40;
}

export function comprar(datos, p, i) {
  const o = p.nodo && p.nodo.oferta && p.nodo.oferta[i];
  if (!o || o.vendida || p.creditos < o.precio) return false;
  p.creditos -= o.precio;
  o.vendida = true;
  p.inventario.push(o.pieza);
  return true;
}

export function vender(datos, p, i) {
  const pieza = p.inventario[i];
  if (!pieza) return 0;
  const valor = Math.trunc((precioPieza(datos, pieza) * datos.reglas.campana.venta_pct) / 100);
  p.inventario.splice(i, 1);
  p.creditos += valor;
  return valor;
}

export function contratar(datos, p, i) {
  const c = p.nodo && p.nodo.candidatos && p.nodo.candidatos[i];
  const costo = datos.reglas.campana.costo_reclutar;
  if (!c || c.contratado || p.creditos < costo || p.pilotos.length >= datos.reglas.escuadra_maxima) return false;
  p.creditos -= costo;
  c.contratado = true;
  const nuevo = JSON.parse(JSON.stringify(c));
  delete nuevo.contratado;
  const solo = p.pilotos.find((x) => !x.vinculo);
  if (solo) vincular(solo, nuevo);
  p.pilotos.push(nuevo);
  presentar(datos, p, nuevo, azarAparte(p, 'afinidad:' + nuevo.id));
  return true;
}

// ---------- Hangar ----------

export const encajeDeSlot = (slot) => (slot.startsWith('brazo') ? 'brazo' : slot);

// Cambia la pieza de un encaje por una del inventario (indice) o la saca (null). La vieja vuelve al inventario.
export function equipar(datos, p, pilotoId, slot, indice) {
  const pi = p.pilotos.find((x) => x.id === pilotoId);
  if (!pi) return false;
  if (indice !== null) {
    const pieza = p.inventario[indice];
    if (!pieza || datos.partes[pieza.parte].encaje !== encajeDeSlot(slot)) return false;
  }
  if (indice === null && (slot === 'torso' || slot === 'piernas')) return false; // sin torso o piernas no anda
  const vieja = normalizarPieza(pi.mecha[slot]);
  const nueva = indice !== null ? p.inventario.splice(indice, 1)[0] : null;
  if (vieja && vieja.parte !== 'mochila_vacia') p.inventario.push(vieja);
  pi.mecha[slot] = nueva || (slot === 'mochila' ? { parte: 'mochila_vacia', afijos: [] } : null);
  return true;
}

export function guardarGambits(datos, p, pilotoId, lista) {
  const pi = p.pilotos.find((x) => x.id === pilotoId);
  if (!pi) return false;
  pi.gambits = lista.slice(0, datos.gambits.maximo_por_unidad).map((g) => JSON.parse(JSON.stringify(g)));
  return true;
}

// ---------- Mision ----------

export function escuadronParaMision(datos, p) {
  const animo = (p.nodo && p.nodo.animo && p.nodo.animo.porPiloto) || {};
  return p.pilotos.slice(0, datos.reglas.escuadra_maxima).map((pi) => ({
    piloto: pi, mecha: pi.mecha, gambits: pi.gambits,
    estados: (animo[pi.id] || {}).estados || [], rival: (animo[pi.id] || {}).rival || null, amigo: (animo[pi.id] || {}).amigo || null
  }));
}

// Despues de la batalla: aplica todo lo que paso y devuelve el informe para mostrar.
export function cerrarMision(datos, p, resultado) {
  const R = datos.reglas;
  const az = azarDe(p, 'informe');
  const m = p.nodo.mision;
  const informe = { victoria: resultado.victoria, motivo: resultado.motivo, mision: m.nombre, pilotos: [], botin: [], creditos: 0, puntaje: 0, caidos: [], partesRescatadas: [], saqueo: [], chatarra: 0 };
  const eliminados = resultado.motivo === 'escuadron_eliminado';
  p.misionesJugadas++;
  // los momentos para recordar salen del registro, con los pilotos como estaban antes de la mision
  const sector = p.sector + 1;
  const donde = m.nombre + ' (sector ' + sector + ')';
  const desplegados = p.pilotos.filter((x) => resultado.resumen.pilotos[x.id]);
  const fotos = desplegados.map(fotoPiloto); // como estaban antes de la mision (para el legado)
  const apodos = new Map(p.pilotos.map((x) => [x.id, x.apodo]));
  const nombreDe = (id) => apodos.get(id) || '?';
  const hoja = momentosDeMision(resultado.registro || [], m, sector, new Map(p.pilotos.map((x) => [x.id, x])));

  for (const pi of p.pilotos.slice()) {
    const s = resultado.resumen.pilotos[pi.id];
    if (!s) continue;
    const linea = { id: pi.id, apodo: pi.apodo, nombre: pi.nombre, retrato: pi.retrato, clase: pi.clase, xp: 0, subioNivel: false, nuevas: [], estado: 'ok', bajas: s.bajas,
      momentos: (hoja.momentos.get(pi.id) || []).slice() };
    let vivo = s.viva;

    if (!vivo && az.tirada(R.permadeath.chance_herida_en_vez_de_muerte)) {
      vivo = true;
      linea.estado = 'herido';
      const graves = Object.entries(datos.cicatrices).filter(([id, c]) => c.origen.evento === 'herida_grave' && !pi.cicatrices.includes(id));
      if (graves.length) { const [id] = az.elegir(graves); pi.cicatrices.push(id); linea.nuevas.push({ tipo: 'cicatriz', id }); }
    }

    if (!vivo) {
      linea.estado = 'muerto';
      const rescate = eliminados ? R.permadeath.chance_recuperar_partes >> 1 : R.permadeath.chance_recuperar_partes;
      for (const slot of ENCAJES) {
        const pz = normalizarPieza(pi.mecha[slot]);
        if (!pz || !datos.partes[pz.parte].recuperable) continue;
        if (az.tirada(rescate)) { p.inventario.push(pz); informe.partesRescatadas.push(nombrePieza(datos, pz)); }
      }
      p.pilotos.splice(p.pilotos.indexOf(pi), 1);
      const epitafio = hoja.caida.get(pi.id) || 'Cayó en combate, en ' + donde + '.';
      linea.epitafio = epitafio;
      p.caidos.push({ nombre: pi.nombre, apodo: pi.apodo, retrato: pi.retrato, clase: pi.clase, personalidad: pi.personalidad, nivel: pi.nivel,
        misiones: pi.misiones + 1, bajas: pi.bajas + s.bajas, medallas: pi.medallas.slice(), mision: m.nombre, sector: p.sector + 1,
        mechaNombre: pi.mechaNombre || null, epitafio, hoja: (pi.hoja || []).concat(linea.momentos).slice(-MAX_HOJA_MEMORIAL) });
      informe.caidos.push(pi.apodo);
      // su vinculo queda solo
      for (const o of p.pilotos) if (o.vinculo === pi.id) o.vinculo = null;
      informe.pilotos.push(linea);
      continue;
    }

    pi.misiones++;
    // racha: misiones ganadas al hilo (y sin terminar herido de gravedad). Con racha, llegan confiados.
    pi.racha = resultado.victoria && linea.estado === 'ok' ? (pi.racha || 0) + 1 : 0;
    if (linea.estado === 'herido') linea.momentos.push('Lo dieron por muerto en ' + donde + ', y volvió.');
    else if (s.vidaMinPct < 10) linea.momentos.push('Volvió de ' + donde + ' con el mecha hecho trizas.');
    if (s.quedoSolo) linea.momentos.push('Quedó solo contra todos en ' + donde + '.');
    sumarAHoja(pi, linea.momentos);
    pi.bajas += s.bajas;
    // XP
    let xp = s.bajas * R.xp.por_baja + Math.trunc(s.reparado / 40) * R.xp.por_curar;
    if (resultado.victoria) xp += R.xp.por_mision;
    if (s.vidaMinPct < 30) xp += R.xp.por_sobrevivir_herido;
    pi.xp += xp;
    linea.xp = xp;
    while (pi.nivel < R.xp_por_nivel.length && pi.xp >= R.xp_por_nivel[pi.nivel]) { pi.nivel++; linea.subioNivel = true; }

    // Cicatrices (una por mision como mucho)
    for (const [id, c] of Object.entries(datos.cicatrices)) {
      if (pi.cicatrices.includes(id) || linea.nuevas.some((n) => n.tipo === 'cicatriz')) continue;
      if (c.origen.evento === 'quedo_bajo_pct' && s.vidaMinPct < c.origen.valor && az.tirada(c.origen.chance)) {
        pi.cicatrices.push(id); linea.nuevas.push({ tipo: 'cicatriz', id });
      }
    }
    // Traumas
    const paso = { explosion_cerca: s.explosiones > 0, vinculo_muerto: s.vinculoMurio, quedo_solo: s.quedoSolo };
    for (const [id, t] of Object.entries(datos.traumas)) {
      if (pi.traumas.some((x) => x.id === id) || !paso[t.origen.evento]) continue;
      if (az.tirada(t.origen.chance)) {
        pi.traumas.push({ id, cura: t.cura.tipo, resta: t.cura.cantidad || 0 });
        linea.nuevas.push({ tipo: 'trauma', id });
      }
    }
    // Medallas
    for (const [id, md] of Object.entries(datos.medallas)) {
      if (pi.medallas.includes(id)) continue;
      const q = md.requisito;
      const gana = (q.sobrevivio_con_vida_pct_menor && s.vidaMinPct < q.sobrevivio_con_vida_pct_menor) ||
        (q.bajas_en_mision && s.bajas >= q.bajas_en_mision) ||
        (q.reparado_total && s.reparado >= q.reparado_total) ||
        (q.misiones_sobrevividas && pi.misiones >= q.misiones_sobrevividas);
      if (gana) { pi.medallas.push(id); linea.nuevas.push({ tipo: 'medalla', id }); }
    }
    informe.pilotos.push(linea);
  }

  // Inteligencia sobre el jefe del sector: cada mision ganada en el camino suma
  const sec = p.sectores[p.sector];
  if (resultado.victoria && p.nodo.tipo === 'mision' && sec && sec.inteligencia !== undefined) {
    const I = datos.sectores.campana_base.inteligencia;
    if (sec.inteligencia < I.maxima) { sec.inteligencia += I.por_mision; informe.inteligencia = { valor: sec.inteligencia, maxima: I.maxima, jefe: sec.jefe }; }
  }

  // Afinidad: lo que vivieron juntos los acerca o los separa
  informe.relaciones = actualizarAfinidad(datos, p, resultado.registro || [], desplegados, resultado.victoria)
    .map((c) => ({ ...c, a: nombreDe(c.a), b: nombreDe(c.b) }));

  // Recompensa y puntaje
  const pz = m.puntaje || {};
  const vivos = informe.pilotos.filter((l) => l.estado !== 'muerto').length;
  let puntos = resultado.resumen.bajasEnemigas * (pz.por_baja || 0);
  if (resultado.victoria) {
    puntos += vivos * (pz.por_superviviente || 0) + (resultado.resumen.vipVivo ? pz.vip_intacto || 0 : 0);
    informe.creditos = m.recompensa.creditos;
    p.creditos += informe.creditos;
    for (let k = 0; k < m.recompensa.botin; k++) {
      const pieza = sortearParte(datos, az, m.dificultad);
      p.inventario.push(pieza);
      informe.botin.push(nombrePieza(datos, pieza));
    }
    // saqueo de los mechas enemigos: entero si cayo por la cabina, chatarra si no
    const sq = saquear(datos, resultado.registro || [], m, az);
    for (const x of sq.piezas) { p.inventario.push(x.pieza); informe.saqueo.push(nombrePieza(datos, x.pieza) + ' (de ' + x.de + ')'); }
    informe.chatarra = sq.chatarra;
    p.creditos += sq.chatarra;
  }
  // Contra el escuadron de la campana anterior: si se gana, a veces se rescata a uno de entre los restos
  if (m.rivales) {
    p.encuentro.hecho = true;
    if (resultado.victoria && az.tirada(R.legado.chance_rescate)) {
      const f = m.rivales.map((r) => r.piloto).sort((a, b) => b.nivel - a.nivel)[0];
      const viejo = p.encuentro.escuadron.find((x) => x.id === f.id) || f;
      const pi = sumarPilotoDeOtraCampana(datos, p, viejo, nuevoId(p), 'Rescatado de entre los restos en ' + donde + '. Volvió a casa.');
      presentar(datos, p, pi, azarAparte(p, 'afinidad:' + pi.id));
      informe.rescatado = pi.apodo;
    }
  }

  informe.puntaje = puntos;
  p.puntaje += puntos;
  p.ultimoInforme = informe;
  p.nodo = null;

  // Perder un contrato no termina la partida: se sigue viaje sin recompensa. Sin pilotos, si.
  if (!p.pilotos.length) {
    p.estado = 'fin'; p.resultado = 'derrota';
    p.legado = legadoDeDerrota(datos, p, fotos, azarAparte(p, 'legado'));
  }
  else avanzar(datos, p);
  return informe;
}

// Al ganar la campana: quien sigue en la proxima (uno solo)
export function elegirVeterano(p, pilotoId) {
  if (!p.legado || p.resultado !== 'victoria') return;
  const pi = p.pilotos.find((x) => x.id === pilotoId);
  p.legado.veterano = pi ? { ...fotoPiloto(pi), comoLlego: 'eligio' } : null;
}
