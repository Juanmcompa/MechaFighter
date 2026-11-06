// La campana roguelite: escuadron, mapa de sectores, nodos (mision, taller, reclutamiento, evento, descanso),
// informe despues de cada mision (XP, cicatrices, traumas, medallas, permadeath, botin) y fin de la partida.
//
// La partida es un objeto plano (se guarda tal cual en el aparato). Todo lo que se sortea sale de la semilla de la
// partida y de un contador de pasos: la misma semilla con las mismas elecciones da la misma campana.

import { crearAzar } from '../core/azar.js';
import { crearRecluta } from './reclutas.js';
import { armarMision, sumarCondicion } from './misiones.js';
import { saquear } from './saqueo.js';
import { sortearDilema, resolverDilema } from './dilemas.js';
import { anotar, sumarStat } from './cronica.js';
import { anotarDanios, vidaDeSalida, reparar, costoReparacion, vidaDelMecha, partesRotas } from './mantenimiento.js';
export { reparar, costoReparacion, vidaDelMecha, partesRotas, vidaDeSalida };
import { fotoPiloto, legadoDeDerrota, legadoDeVictoria, sumarPilotoDeOtraCampana, misionEncuentro } from './legado.js';
import { momentosDeMision, sumarAHoja } from './hoja.js';
import { presentar, calcularAnimo, actualizarAfinidad } from './animo.js';
import { desplegables, cumplirTareas } from './tareas.js';
import { armarLore } from './lore.js';
import { nemesisDelLegado, quizasNace, quizasAparece, resolverNemesis, reasignarObjetivos, nemesisEnNodos, elegirJefeNemesis, nemesisComoJefe } from './nemesis.js';
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
  if (legado && legado.escuadron && legado.escuadron.length) {
    // el de mas nivel del escuadron perdido no murio: vuelve como nemesis (con bronca contra el veterano, si hay)
    const [primero, ...resto] = legado.escuadron;
    const veterano = p.pilotos.find((x) => x.veterano) || null;
    nemesisDelLegado(datos, p, primero, legado.sectorNombre, veterano, azarAparte(p, 'nemesis'));
    if (resto.length) p.encuentro = { escuadron: resto, sectorNombre: legado.sectorNombre, hecho: false };
  }
  p.afinidad = {};
  const azAf = azarAparte(p, 'afinidad');
  for (const pi of p.pilotos) presentar(datos, p, pi, azAf);
  // una parte especial para empezar a probar habilidades nuevas
  p.inventario.push({ parte: 'brazo_rifle', afijos: [] }, { parte: 'mochila_municion', afijos: [] }, { parte: 'cabeza_radar', afijos: [] });
  // combustible, nombre y cronica del escuadron
  p.combustible = R.combustible.inicial;
  p.nombreEscuadron = az.elegir(datos.textos.nombres_escuadron);
  p.cronica = []; p.stats = {};
  anotar(p, 'Salieron del muelle ' + p.pilotos.map((x) => '«' + x.apodo + '»').join(', ') + '.' +
    (legado && legado.veterano ? ' «' + legado.veterano.apodo + '» venía de la campaña anterior.' : ''), 'inicio');
  generarSector(datos, p);
  return p;
}

function vincular(a, b) {
  a.vinculo = b.id; b.vinculo = a.id;
  // un vinculo nuevo cura la culpa del superviviente
  for (const x of [a, b]) x.traumas = x.traumas.filter((t) => t.cura !== 'nuevo_vinculo');
}

// ---------- Mapa de sectores ----------

// El territorio del sector n (se repiten en ronda: la campana no termina hasta que cae el escuadron)
export function territorio(datos, n) {
  const D = datos.sectores.campana_base.sectores_def;
  return D[n % D.length];
}

export function generarSector(datos, p) {
  const def = datos.sectores.campana_base;
  // campana infinita: los territorios se repiten en ronda, cada vuelta mas dificil
  const sdef = territorio(datos, p.sector);
  const vuelta = Math.floor(p.sector / def.sectores_def.length);
  const az = azarDe(p, 'sector');
  const dif = def.dificultad_por_sector[p.sector] || def.dificultad_por_sector.at(-1);
  const pesos = Object.entries(def.tipos_de_nodo);
  const misionesPosibles = def.misiones_por_dificultad[String(dif)];
  const niveles = def.nivel_enemigo_por_sector || [];
  const extra = Math.max(0, p.sector - niveles.length + 1) * ((def.infinito || {}).nivel_extra_por_sector || 1);
  const nivel = p.sector < niveles.length ? niveles[p.sector] : (niveles.at(-1) || dif) + extra;
  // el jefe: el nemesis mas curtido; si no hay, el de la lista (o, en otra vuelta, uno de sus herederos)
  const jefeNemesis = elegirJefeNemesis(p, p.sector);
  const heredero = vuelta > 0 && sdef.herederos && sdef.herederos.length ? sdef.herederos[(vuelta - 1) % sdef.herederos.length] : null;
  const nombreJefe = jefeNemesis ? '«' + jefeNemesis.apodo + '», ' + (sdef.titulo_jefe || 'jefe del sector') : heredero ? heredero.nombre : sdef.jefe.nombre;
  const columnas = [];
  for (let c = 0; c < def.columnas_por_sector; c++) {
    const ultima = c === def.columnas_por_sector - 1;
    const n = ultima ? 1 : az.entero(def.nodos_por_columna.min, def.nodos_por_columna.max);
    const col = [];
    for (let i = 0; i < n; i++) {
      let tipo = ultima ? 'jefe' : c === 0 ? 'mision' : az.elegirConPeso(pesos);
      if (tipo === 'mision' && col.filter((x) => x.tipo === 'mision').length >= 2) tipo = 'evento';
      const nodo = { tipo };
      if (tipo === 'mision') {
        // fauna del sector: sus escuadras salen mas seguido (pesan doble) que las de la plantilla
        const mid = az.elegir(misionesPosibles);
        const fauna = sdef.fauna ? { enemigos: sdef.fauna.concat(sdef.fauna, datos.misiones[mid].enemigos) } : null;
        nodo.mision = armarMision(datos, mid, dif, az, nivel, fauna);
      }
      if (tipo === 'jefe') {
        const J = sdef.jefe;
        if (jefeNemesis) {
          // (la escolta un nivel abajo que la de un jefe comun: el nemesis ya pega como jefe)
          nodo.mision = armarMision(datos, J.plantilla, dif + 1, az, nivel, { lider: null, enemigos: J.escuadras });
          nemesisComoJefe(datos, p, nodo.mision, jefeNemesis, sdef.titulo_jefe || 'jefe del sector', az);
        } else {
          nodo.mision = armarMision(datos, J.plantilla, dif + 1, az, nivel + 1, { lider: J.unidad, enemigos: J.escuadras });
          nodo.mision.nombre = nombreJefe;
          nodo.mision.jefe = { nombre: nombreJefe, frase: heredero ? heredero.frase : J.frase };
        }
        nodo.mision.descripcion = 'Objetivo del sector: ' + nombreJefe + '. ' + nodo.mision.descripcion;
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
  if (p.encuentro && !p.encuentro.hecho && p.sector === L.sector_encuentro) {
    const col = columnas[Math.min(L.columna_encuentro, columnas.length - 2)];
    const k = Math.max(0, col.findIndex((n) => n.tipo === 'mision'));
    col[k] = { tipo: 'mision', i: col[k].i, encuentro: true, mision: misionEncuentro(datos, p, az, dif, nivel) };
  }
  // Lore: quien manda cada contrato y que conviene llevar
  for (const col of columnas) for (const nodo of col) if (nodo.mision) nodo.mision.lore = armarLore(datos, nodo.mision, p.sector);
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
  const nombre = sdef.nombre + (vuelta ? ' ' + ['', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][Math.min(vuelta, 9)] : '');
  const objetivo = jefeNemesis
    ? '«' + jefeNemesis.apodo + '» se quedó con ' + sdef.nombre + '. ' + (jefeNemesis.historia.slice(-1)[0] || '') + ' Encontralo y bajalo: esta vez no hay eyección.'
    : heredero ? heredero.nombre + ' se quedó con lo que dejó ' + sdef.jefe.nombre + '. Encontralo y bajalo.' : sdef.objetivo;
  p.sectores[p.sector] = {
    nombre, numero: p.sector + 1, objetivo, jefe: nombreJefe, jefeNemesis: jefeNemesis ? jefeNemesis.id : null,
    dificultad: dif, nivel, columnas, inteligencia: 0
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
  const escuadras = territorio(datos, p.sector).jefe.escuadras;
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

// Que nemesis se vieron en los contratos de la columna que viene ({ indiceDelNodo: idNemesis })
export function nemesisDelMapa(datos, p) {
  return nemesisEnNodos(datos, p, nodosSiguientes(p), (i) => azarAparte(p, 'nemesis:' + i));
}

export function elegirNodo(datos, p, i) {
  const nodo = nodosSiguientes(p)[i];
  if (!nodo) return null;
  const acecho = nemesisDelMapa(datos, p); // (antes de moverse: depende de donde estamos)
  p.columna++;
  p.posicion = nodo.i;
  gastarCombustible(datos, p);
  p.nodo = { ...nodo, indice: i };
  nodo.visitado = true;
  // al jefe se llega con lo que se averiguo en el camino
  if (nodo.tipo === 'jefe') inteligenciaAlJefe(datos, p, p.nodo);
  const R = datos.reglas.campana;
  switch (nodo.tipo) {
    case 'mision':
    case 'jefe':
      p.estado = 'preparacion';
      // quizas aparece un nemesis (la mision se copia: el cambio es solo para esta)
      if (nodo.tipo === 'mision') {
        p.nodo.mision = JSON.parse(JSON.stringify(nodo.mision));
        if (acecho[nodo.i]) quizasAparece(datos, p, p.nodo.mision, desplegables(datos, p), azarAparte(p, 'nemesis'), acecho[nodo.i]);
      }
      // como llega cada uno: queda fijo para esta mision (recargar la pagina no lo cambia)
      p.nodo.animo = calcularAnimo(datos, p, nodo.mision, desplegables(datos, p), azarAparte(p, 'animo'));
      break;
    case 'taller': {
      const az = azarDe(p, 'taller');
      p.nodo.oferta = [];
      for (let k = 0; k < R.partes_en_taller; k++) {
        const pieza = sortearParte(datos, az, p.sectores[p.sector].dificultad, p);
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
      // una señal: un dilema para decidir (ver dilemas.js); el resultado llega al elegir una opcion
      p.nodo.dilema = sortearDilema(datos, p, azarDe(p, 'evento'));
      p.nodo.resultado = null;
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
      // en el muelle se reparan los mechas gratis
      const reparados = [];
      for (const pi of p.pilotos) if (costoReparacion(datos, pi).total && reparar(datos, p, pi.id, 'todo', true)) reparados.push(pi.apodo);
      p.nodo.resultado = { texto: 'Una semana en el muelle orbital. Se reparan los mechas y se ordenan las cabezas.', curados, reparados };
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
    p.sector++;
    generarSector(datos, p);
    if (p.combustible !== undefined) p.combustible = Math.min(datos.reglas.combustible.maximo, p.combustible + datos.reglas.combustible.por_sector);
    anotar(p, 'Cruzaron a ' + p.sectores[p.sector].nombre + '.', 'sector');
  }
  p.estado = 'sectores';
}

// ---------- Combustible ----------

// Cada salto gasta combustible. Sin combustible, los remolcan: cuesta creditos y los mechas sufren.
function gastarCombustible(datos, p) {
  if (p.combustible === undefined) return; // partida vieja
  const C = datos.reglas.combustible;
  p.remolque = null;
  if (p.combustible >= C.por_salto) { p.combustible -= C.por_salto; return; }
  const cobro = Math.min(p.creditos, C.remolque_creditos);
  p.creditos -= cobro;
  for (const x of p.pilotos) x.mechaVida = Math.max(0, (x.mechaVida === undefined ? 100 : x.mechaVida) - C.remolque_danio_pct);
  p.remolque = { creditos: cobro, danio: C.remolque_danio_pct };
  sumarStat(p, 'remolques');
  if (p.stats.remolques === 1) anotar(p, 'Se quedaron sin combustible y tuvieron que pagar un remolque.', 'remolque');
}

export function comprarCombustible(datos, p) {
  const C = datos.reglas.combustible;
  if (p.combustible === undefined || p.creditos < C.precio || p.combustible >= C.maximo) return false;
  p.creditos -= C.precio;
  p.combustible++;
  return true;
}

// Elegir una opcion del dilema de la señal
export function elegirOpcion(datos, p, indice) {
  if (!p.nodo || !p.nodo.dilema || p.nodo.resultado) return null;
  return resolverDilema(datos, p, indice, azarDe(p, 'dilema'));
}

// Un recluta gratis (dilemas): si hay lugar
export function contratarGratis(datos, p, azar) {
  if (p.pilotos.length >= datos.reglas.escuadra_maxima) return null;
  const usados = p.pilotos.map((x) => x.apodo).concat(p.caidos.map((x) => x.apodo));
  const nuevo = crearRecluta(datos, azar, nuevoId(p), null, usados, p.pilotos.map((x) => x.retrato));
  const solo = p.pilotos.find((x) => !x.vinculo);
  if (solo) vincular(solo, nuevo);
  p.pilotos.push(nuevo);
  presentar(datos, p, nuevo, azarAparte(p, 'afinidad:' + nuevo.id));
  return nuevo;
}

// ---------- Botin, taller y reclutamiento ----------

// p (opcional): la partida, para no repetir las unicas. minima: rareza minima (los jefes dejan legendarias o unicas).
export function sortearParte(datos, az, dificultad = 1, p = null, minima = null) {
  const R = datos.reglas;
  const orden = Object.keys(R.rarezas);
  const pesos = Object.entries(R.rarezas).map(([r, w], i) => [r, i === 0 ? Math.max(10, w - dificultad * 10) : w + dificultad * 3])
    .filter(([r]) => !minima || orden.indexOf(r) >= orden.indexOf(minima));
  const rareza = az.elegirConPeso(pesos);
  // una unica que ya tenga el escuadron no vuelve a salir
  const tiene = new Set(p ? p.inventario.map((x) => x.parte).concat(p.pilotos.flatMap((pi) => Object.values(pi.mecha).filter(Boolean).map((x) => x.parte || x))) : []);
  const sirve = (id, pt) => pt.costo > 0 && !(pt.rareza === 'unico' && tiene.has(id));
  let candidatas = Object.entries(datos.partes).filter(([id, pt]) => pt.rareza === rareza && sirve(id, pt));
  for (let k = orden.indexOf(rareza); !candidatas.length && k >= 0; k--) {
    candidatas = Object.entries(datos.partes).filter(([id, pt]) => pt.rareza === orden[k] && sirve(id, pt));
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
  anotar(p, 'Contrataron a «' + nuevo.apodo + '».', 'recluta');
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
  return desplegables(datos, p).map((pi) => ({
    piloto: pi, mecha: pi.mecha, gambits: pi.gambits, vidaPct: vidaDeSalida(datos, pi),
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
    pi.descansado = false; // el descanso ya lo aprovecho
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
      const pieza = sortearParte(datos, az, m.dificultad, p);
      p.inventario.push(pieza);
      informe.botin.push(nombrePieza(datos, pieza));
    }
    // el jefe del sector siempre deja algo legendario (o unico)
    if (p.nodo.tipo === 'jefe') {
      const trofeo = sortearParte(datos, az, m.dificultad, p, 'legendario');
      p.inventario.push(trofeo);
      informe.botin.push(nombrePieza(datos, trofeo));
      informe.trofeo = nombrePieza(datos, trofeo);
    }
    // saqueo de los mechas enemigos: entero si cayo por la cabina, chatarra si no
    const sq = saquear(datos, resultado.registro || [], m, az);
    for (const x of sq.piezas) { p.inventario.push(x.pieza); informe.saqueo.push(nombrePieza(datos, x.pieza) + ' (de ' + x.de + ')'); }
    informe.chatarra = sq.chatarra;
    p.creditos += sq.chatarra;
  }
  // Contra el escuadron de la campana anterior: si se gana, a veces se rescata a uno de entre los restos
  if (m.encuentro && p.encuentro) {
    p.encuentro.hecho = true;
    if (resultado.victoria && az.tirada(R.legado.chance_rescate)) {
      const f = m.rivales.filter((r) => !r.nemesis).map((r) => r.piloto).sort((a, b) => b.nivel - a.nivel)[0];
      const viejo = p.encuentro.escuadron.find((x) => x.id === f.id) || f;
      const pi = sumarPilotoDeOtraCampana(datos, p, viejo, nuevoId(p), 'Rescatado de entre los restos en ' + donde + '. Volvió a casa.');
      presentar(datos, p, pi, azarAparte(p, 'afinidad:' + pi.id));
      informe.rescatado = pi.apodo;
    }
  }

  // Cronica: como fue esta mision, en una o dos lineas
  sumarStat(p, 'jugadas');
  if (resultado.victoria) sumarStat(p, 'ganadas');
  sumarStat(p, 'bajas', resultado.resumen.bajasEnemigas || 0);
  {
    const jefe = p.nodo.tipo === 'jefe';
    let linea = jefe
      ? (resultado.victoria ? 'Derrotaron a ' + m.nombre + '.' : m.nombre + ' los hizo retroceder.')
      : '«' + m.nombre + '»: ' + (resultado.victoria ? 'cumplida' : 'fallida') + '.';
    if (jefe && resultado.victoria) { p.stats.jefes = (p.stats.jefes || []).concat(m.nombre); }
    const figura = informe.pilotos.filter((l) => l.estado !== 'muerto' && l.bajas >= 3).sort((a, b) => b.bajas - a.bajas)[0];
    if (figura) linea += ' «' + figura.apodo + '» abatió ' + figura.bajas + '.';
    if (informe.caidos.length) linea += ' Cayó ' + informe.caidos.map((a) => '«' + a + '»').join(' y ') + '.';
    const volvio = informe.pilotos.find((l) => l.estado === 'herido');
    if (volvio) linea += ' A «' + volvio.apodo + '» lo dieron por muerto, y volvió.';
    if (informe.rescatado) { linea += ' Rescataron a «' + informe.rescatado + '» de entre los restos.'; sumarStat(p, 'rescates'); }
    anotar(p, linea, jefe ? 'jefe' : 'mision');
  }

  // Como quedaron los mechas: el daño queda hasta repararlo
  anotarDanios(datos, p, resultado, new Set(informe.pilotos.filter((l) => l.estado === 'herido').map((l) => l.id)));
  for (const l of informe.pilotos) {
    const pi = p.pilotos.find((x) => x.id === l.id);
    if (pi) { l.mechaVida = vidaDelMecha(pi); l.rotas = partesRotas(pi); l.costoReparar = costoReparacion(datos, pi).total; }
  }

  // Los que se quedaron haciendo otra cosa
  informe.tareas = cumplirTareas(datos, p, az);

  // Nemesis: como termino el de esta mision, y si nace uno nuevo
  const azN = azarAparte(p, 'nemesis:fin');
  informe.nemesis = resolverNemesis(datos, p, resultado, m, azN);
  if (informe.nemesis) anotar(p, informe.nemesis.muerto ? 'Terminaron con «' + informe.nemesis.apodo + '», su némesis.' : '«' + informe.nemesis.apodo + '» se les volvió a escapar.', 'mision');
  const nace = quizasNace(datos, p, resultado, m, azN);
  if (nace) {
    informe.nemesisNuevo = { apodo: nace.apodo, retrato: nace.retrato, intro: nace.intro };
    anotar(p, 'Nació un némesis: «' + nace.apodo + '».', 'mision');
  }
  reasignarObjetivos(p);

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
