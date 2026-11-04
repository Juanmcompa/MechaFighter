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
// Primero sale la cara (sin repetir dentro del escuadron) y el nombre va con ella: hombre, mujer o alien
// segun lo anotado en nombres.json > retratos. Asi no hay caras de mujer con nombre de hombre.
export function crearRecluta(datos, azar, idNuevo, clase = null, usados = [], retratosUsados = []) {
  const N = datos.nombres;
  const libres = N.apodos.filter((a) => !usados.includes(a));
  const claseId = clase || azar.elegir(Object.keys(datos.clases));
  const total = (datos.reglas.arte && datos.reglas.arte.retratos) || 0;
  const caras = [];
  for (let n = 1; n <= total; n++) if (!retratosUsados.includes(n)) caras.push(n);
  const retrato = total ? azar.elegir(caras.length ? caras : [...Array(total)].map((_, i) => i + 1)) : 0;
  let genero = generoDeRetrato(datos, retrato);
  if (!N.nombres[genero]) genero = azar.elegir(['h', 'm']); // casco o cyborg: cualquiera
  const apellidos = genero === 'a' && N.apellidos_alien ? N.apellidos_alien : N.apellidos;
  const nombre = azar.elegir(N.nombres[genero]) + ' ' + azar.elegir(apellidos);
  return {
    id: idNuevo,
    nombre,
    apodo: azar.elegir(libres.length ? libres : N.apodos),
    retrato,
    genero,
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

// Que es la cara numero n: 'h', 'm', 'a' o 'x' (casco/cyborg, sirve para cualquiera)
export function generoDeRetrato(datos, n) {
  const R = datos.nombres.retratos || {};
  for (const g of Object.keys(R)) if (R[g].includes(n)) return g;
  return 'x';
}

// Genero de un nombre de pila (para pilotos viejos que no lo tienen guardado)
export function generoDeNombre(datos, nombre) {
  const pila = String(nombre || '').split(' ')[0];
  const N = datos.nombres.nombres;
  for (const g of Object.keys(N)) if (N[g].includes(pila)) return g;
  return 'x';
}

// Retrato para alguien que no tiene uno guardado: sale de su nombre (no gasta azar), respeta el genero
// y evita repetir caras dentro del escuadron mientras alcancen.
export function elegirRetrato(datos, nombre, usados = []) {
  const total = (datos.reglas.arte && datos.reglas.arte.retratos) || 0;
  if (!total) return 0;
  const g = generoDeNombre(datos, nombre);
  const R = datos.nombres.retratos || {};
  let pool = g === 'x' ? [] : (R[g] || []).concat(g === 'a' ? [] : R.x || []);
  pool = pool.filter((n) => n <= total);
  if (!pool.length) pool = [...Array(total)].map((_, i) => i + 1);
  const inicio = huellaTexto(nombre) % pool.length;
  for (let k = 0; k < pool.length; k++) {
    const n = pool[(inicio + k) % pool.length];
    if (!usados.includes(n)) return n;
  }
  return pool[inicio];
}

// Nombre con el que el piloto bautiza su mecha: sale de su nombre (sin gastar azar). Se cambia en el hangar.
export function nombreDeMecha(datos, nombre) {
  const lista = datos.nombres.mechas || [];
  return lista.length ? lista[huellaTexto('mecha:' + nombre) % lista.length] : '';
}
