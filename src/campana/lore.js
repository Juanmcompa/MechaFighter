// Lore de cada mision: quien nos manda, por que estamos ahi, que buscamos y que armas convienen (y por que).
// Sale de data/lore.json. Usa un azar propio de la mision (su semilla), asi no cambia nada mas de la campana.

import { crearAzar } from '../core/azar.js';

// Que hay enfrente: el tipo de cuerpo que mas se repite
export function enemigoDominante(datos, m) {
  const cuenta = {};
  const sumar = (id) => { const u = datos.enemigos.unidades[id]; if (u && u.cuerpo) cuenta[u.cuerpo] = (cuenta[u.cuerpo] || 0) + 1; };
  for (const ola of m.oleadas || []) ola.forEach(sumar);
  for (const e of m.emboscadas || []) e.unidades.forEach(sumar);
  if (m.refuerzos) m.refuerzos.unidades.forEach(sumar);
  if (m.rivales && m.rivales.length) cuenta.mecha = (cuenta.mecha || 0) + m.rivales.length * 2;
  if (m.lider) { const u = datos.enemigos.unidades[m.lider]; if (u) cuenta[u.cuerpo] = (cuenta[u.cuerpo] || 0) + 2; }
  const orden = Object.entries(cuenta).sort((a, b) => b[1] - a[1]);
  if (!orden.length) return 'mecha';
  // mezclados parejo: piratas con drones
  if (orden.length > 1 && orden[1][1] >= orden[0][1] * 0.7 && orden.some(([k]) => k === 'dron')) return 'mixto';
  return orden[0][0];
}

export function estiloDe(datos, m) {
  return m.plano ? m.plano.estilo : (datos.lore.estilo_de_mapa[m.mapa] || 'campo');
}

// clienteFijo: { id, nombre, quien } cuando el contrato ya es de un bando (bandos.json)
export function armarLore(datos, m, sector, jefeDelSector = null, clienteFijo = null) {
  const L = datos.lore;
  const az = crearAzar((m.semilla ^ 0x2f6b1) >>> 0 || 1);
  const tipo = m.plantilla;
  const clientes = Object.entries(L.clientes).filter(([, c]) => c.sectores.includes(Math.min(sector, 2)) && c.tipos.includes(tipo));
  const [cid, cliente] = clienteFijo ? [clienteFijo.id, clienteFijo] : clientes.length ? az.elegir(clientes) : ['resistencia', L.clientes.resistencia];
  const dom = enemigoDominante(datos, m);
  const enemigo = L.enemigos[dom] || L.enemigos.mecha;
  const lugar = m.plano ? m.plano.nombre : ((datos.mapas[m.mapa] || {}).nombre || 'la zona');
  const llenar = (t) => t.replace(/\{cliente\}/g, cliente.quien).replace(/\{lugar\}/g, lugar).replace(/\{enemigo\}/g, enemigo)
    .replace(/\{jefe\}/g, jefeDelSector || '')
    .replace(/(^|[.!?]\s+)(\p{Ll})/gu, (_, a, c) => a + c.toUpperCase()); // mayuscula al empezar cada oracion
  const posibles = (L.encargos[tipo] || L.encargos.asalto).filter((e) => !e.solo || e.solo.includes(cid));
  const enc = az.elegir(posibles.length ? posibles : L.encargos[tipo] || L.encargos.asalto);

  // armas: lo que pide el terreno y lo que pide el enemigo (sin repetir arma ni contradecirse)
  const estilo = estiloDe(datos, m);
  const C = L.consejos;
  const tipoEnemigo = dom === 'mixto' ? 'dron' : dom;
  const conviene = [], evitar = [];
  const usadas = new Set();
  const poner = (lista, destino, max) => {
    for (const [arma, porque] of lista || []) {
      if (destino.length >= max || usadas.has(arma)) continue;
      usadas.add(arma);
      destino.push({ arma: L.armas[arma] || arma, porque });
    }
  };
  poner((C.enemigo[tipoEnemigo] || {}).conviene, conviene, 1);
  poner((C.estilo[estilo] || {}).conviene, conviene, 2);
  poner((C.enemigo[tipoEnemigo] || {}).evitar, evitar, 1);
  poner((C.estilo[estilo] || {}).evitar, evitar, 1);

  return {
    cliente: cliente.nombre, clienteId: cid,
    porque: m.jefe ? llenar(enc.porque) + ' Y detrás de todo está ' + m.jefe.nombre + '.' : llenar(enc.porque),
    buscamos: enc.buscamos,
    conviene, evitar
  };
}
