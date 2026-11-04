// Legado entre campanas: lo que queda de una campana para la siguiente.
//
//  - Veterano: al ganar, el jugador elige un piloto que sigue con el. Al perder, con suerte alguno sobrevive
//    (lo encuentran entre los restos) y se suma igual.
//  - Escuadron anterior: si la campana se perdio, los caidos de la ultima mision no murieron todos... aparecen en
//    la campana siguiente peleando para los piratas. Si se los vence, a veces se rescata a uno.
//
// Se guarda aparte de la partida (ver guardado.js), asi sobrevive a "Nueva campana".

import { mechaDeClase } from './reclutas.js';
import { armarMision } from './misiones.js';

// Lo que se guarda de un piloto (sin referencias a ids de esta campana)
export function fotoPiloto(pi) {
  return {
    id: pi.id, nombre: pi.nombre, apodo: pi.apodo, retrato: pi.retrato, genero: pi.genero, clase: pi.clase, personalidad: pi.personalidad,
    nivel: pi.nivel, xp: pi.xp || 0, medallas: (pi.medallas || []).slice(), cicatrices: (pi.cicatrices || []).slice(),
    traumas: JSON.parse(JSON.stringify(pi.traumas || [])), hoja: (pi.hoja || []).slice(-8), bajas: pi.bajas || 0, misiones: pi.misiones || 0,
    mecha: JSON.parse(JSON.stringify(pi.mecha)), mechaNombre: pi.mechaNombre || null, gambits: JSON.parse(JSON.stringify(pi.gambits || []))
  };
}

// La campana se perdio: quien sobrevive (quiza) y quienes van a volver como enemigos
export function legadoDeDerrota(datos, p, fotos, azar) {
  const L = datos.reglas.legado;
  const leg = { resultado: 'derrota', sector: p.sector + 1, sectorNombre: (p.sectores[p.sector] || {}).nombre || '', veterano: null, escuadron: [] };
  const orden = fotos.slice().sort((a, b) => b.nivel - a.nivel || String(a.id).localeCompare(String(b.id)));
  if (orden.length && azar.tirada(L.chance_sobrevive)) {
    leg.veterano = { ...orden[0], comoLlego: 'sobrevivio' };
    orden.shift();
  }
  leg.escuadron = orden;
  return leg;
}

export function legadoDeVictoria(p) {
  return { resultado: 'victoria', sector: p.sector + 1, sectorNombre: (p.sectores[p.sector] || {}).nombre || '', veterano: null, escuadron: [] };
}

// Un piloto de otra campana entra a esta: id nuevo, mecha de fabrica (el suyo quedo atras), sin vinculo.
export function sumarPilotoDeOtraCampana(datos, p, foto, nuevoId, lineaHoja) {
  const pi = {
    id: nuevoId, nombre: foto.nombre, apodo: foto.apodo, retrato: foto.retrato, genero: foto.genero, clase: foto.clase, personalidad: foto.personalidad,
    nivel: foto.nivel, xp: foto.xp, medallas: foto.medallas.slice(), cicatrices: foto.cicatrices.slice(),
    traumas: JSON.parse(JSON.stringify(foto.traumas)), hoja: foto.hoja.concat(lineaHoja ? [lineaHoja] : []),
    bajas: foto.bajas, misiones: foto.misiones, vinculo: null, racha: 0, veterano: true,
    mecha: mechaDeClase(datos, foto.clase), mechaNombre: foto.mechaNombre,
    gambits: JSON.parse(JSON.stringify(foto.gambits && foto.gambits.length ? foto.gambits : datos.clases[foto.clase].gambits_de_fabrica))
  };
  // si el apodo ya esta en uso, se le agrega "viejo"
  if (p.pilotos.some((x) => x.apodo === pi.apodo)) pi.apodo += ' Viejo';
  p.pilotos.push(pi);
  return pi;
}

// La mision contra el escuadron anterior
export function misionEncuentro(datos, p, azar, dificultad, nivel) {
  const L = datos.reglas.legado;
  const fotos = p.encuentro.escuadron.slice(0, 4);
  const m = armarMision(datos, 'duelo', dificultad, azar, nivel);
  if (fotos.length >= 3) m.oleadas = [];
  m.nombre = 'Viejos conocidos';
  m.icono = 'calavera';
  const nombres = fotos.map((f) => '«' + f.apodo + '»').join(', ');
  m.descripcion = 'Llegan reportes de mechas con nuestras marcas peleando para los piratas. Los pilotos: ' + nombres +
    '. El escuadrón que dimos por muerto en ' + (p.encuentro.sectorNombre || 'la campaña anterior') + '. Bájenlos... y si alguno queda vivo entre los restos, tráiganlo.';
  m.rivales = fotos.map((f) => ({ piloto: { ...f, nivel: Math.min(f.nivel, L.nivel_max_rival + p.sector) }, mecha: f.mecha, gambits: f.gambits }));
  m.encuentro = true;
  m.cantidadEnemigos = m.oleadas.reduce((s, o) => s + o.length, 0) + fotos.length + (m.refuerzos ? m.refuerzos.unidades.length : 0);
  m.recompensa.creditos += 60;
  return m;
}
