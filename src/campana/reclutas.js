// Inventa reclutas: nombre, apodo, clase, personalidad, y su mecha armado con las partes sugeridas de la clase.

import { ENCAJES } from '../motor/unidades.js';
import { huellaTexto } from '../core/azar.js';

const POR_DEFECTO = { cabeza: 'cabeza_sensor', torso: 'torso_medio', piernas: 'piernas_bipode', mochila: 'mochila_vacia' };

export function mechaDeClase(datos, claseId) {
  const mecha = { cabeza: null, torso: null, piernas: null, brazo_izq: null, brazo_der: null, mochila: null };
  for (const pid of datos.clases[claseId].partes_sugeridas) {
    const p = datos.partes[pid];
    if (!p) continue;
    if (p.encaje === 'brazo') {
      if (!mecha.brazo_der) mecha.brazo_der = { parte: pid, afijos: [] };
      else if (!mecha.brazo_izq) mecha.brazo_izq = { parte: pid, afijos: [] };
    } else if (!mecha[p.encaje]) mecha[p.encaje] = { parte: pid, afijos: [] };
  }
  for (const e of ENCAJES) if (!mecha[e] && POR_DEFECTO[e]) mecha[e] = { parte: POR_DEFECTO[e], afijos: [] };
  return mecha;
}

// usados: apodos que ya estan en el escuadron (para no tener dos "Brasa").
export function crearRecluta(datos, azar, idNuevo, clase = null, usados = [], retratosUsados = []) {
  const N = datos.nombres;
  const libres = N.apodos.filter((a) => !usados.includes(a));
  const claseId = clase || azar.elegir(Object.keys(datos.clases));
  const nombre = azar.elegir(N.nombres) + ' ' + azar.elegir(N.apellidos);
  return {
    id: idNuevo,
    nombre,
    apodo: azar.elegir(libres.length ? libres : N.apodos),
    retrato: elegirRetrato(datos, nombre, retratosUsados),
    mechaNombre: nombreDeMecha(datos, nombre),
    clase: claseId,
    personalidad: azar.elegir(Object.keys(datos.personalidades)),
    nivel: 1, xp: 0,
    vinculo: null,
    cicatrices: [], traumas: [], medallas: [],
    misiones: 0, bajas: 0,
    mecha: mechaDeClase(datos, claseId),
    gambits: datos.clases[claseId].gambits_de_fabrica.map((g) => JSON.parse(JSON.stringify(g)))
  };
}

// Retrato de un piloto: sale de su nombre (no gasta azar, asi la campana sigue igual) y evita repetir caras
// dentro del escuadron mientras alcancen.
export function elegirRetrato(datos, nombre, usados = []) {
  const total = (datos.reglas.arte && datos.reglas.arte.retratos) || 0;
  if (!total) return 0;
  const inicio = huellaTexto(nombre) % total;
  for (let k = 0; k < total; k++) {
    const n = ((inicio + k) % total) + 1;
    if (!usados.includes(n)) return n;
  }
  return inicio + 1;
}

// Nombre con el que el piloto bautiza su mecha: sale de su nombre (sin gastar azar). Se cambia en el hangar.
export function nombreDeMecha(datos, nombre) {
  const lista = datos.nombres.mechas || [];
  return lista.length ? lista[huellaTexto('mecha:' + nombre) % lista.length] : '';
}
