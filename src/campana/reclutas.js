// Inventa reclutas: nombre, apodo, clase, personalidad, y su mecha armado con las partes sugeridas de la clase.

import { ENCAJES } from '../motor/unidades.js';

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
export function crearRecluta(datos, azar, idNuevo, clase = null, usados = []) {
  const N = datos.nombres;
  const libres = N.apodos.filter((a) => !usados.includes(a));
  const claseId = clase || azar.elegir(Object.keys(datos.clases));
  return {
    id: idNuevo,
    nombre: azar.elegir(N.nombres) + ' ' + azar.elegir(N.apellidos),
    apodo: azar.elegir(libres.length ? libres : N.apodos),
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
