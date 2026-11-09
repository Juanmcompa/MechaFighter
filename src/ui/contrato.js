// Un contrato antes de aceptarlo: quien paga y contra quien, que hay que hacer, cuanto paga y lo que cuesta
// (como sube y baja la reputacion con cada bando, cuanto se corre el frente). Aceptar es saltar ahi.
import { h, montar, ico, botonIcono, retrato } from './comun.js';
import { destinosDeLaNave, elegirNodo, nemesisDelMapa } from '../campana/partida.js';
import { quien, esAmenaza, efectoContrato } from '../campana/brujula.js';
import { mapaDe } from '../core/datos.js';
import { enemigoDominante } from '../campana/lore.js';
import { existeIcono } from './iconos.js';
import { contactoDe } from '../campana/personajes.js';

const NOMBRE_ENEMIGO = { mecha: 'Mechas', infanteria: 'Infantería', mutante: 'Mutantes', dron: 'Drones', mixto: 'Piratas y drones' };

export function contrato(app, raiz, nodoId) {
  const { datos } = app;
  const p = app.partida;
  const s = p.sectores[p.sector];
  const d = destinosDeLaNave(datos, p).find((x) => x.nodo.i === nodoId);
  if (!d || !d.nodo.mision) return app.ir('sectores');
  const n = d.nodo, m = n.mision;
  const C = quien(datos, m.cliente), Q = quien(datos, m.objetivo);
  const contraAmenaza = esAmenaza(datos, m.objetivo);
  const ef = efectoContrato(datos, p, s, m);
  const nemId = nemesisDelMapa(datos, p)[n.i];
  const nem = nemId ? (p.nemesis || []).find((x) => x.id === nemId) : null;
  const mapa = mapaDe(datos, m);
  const contacto = contactoDe(datos, p, m.cliente);
  const plantilla = datos.misiones[m.plantilla] || {};

  const lado = (rotulo, q) => h('div', { class: 'ct-lado', style: '--c:' + q.color + ';--cl:' + q.claro + ';--f:' + q.fondo },
    ico(existeIcono(q.icono) ? q.icono : 'mision'), h('span', {}, h('small', {}, rotulo), h('strong', {}, q.nombre)));
  const dato = (rotulo, valor) => h('div', { class: 'ct-dato' }, h('small', {}, rotulo), h('span', {}, valor));
  // barra de reputacion: centro = 0, la sombra es lo que se mueve
  const fila = (c) => {
    const pos = (v) => 50 + v / 2;
    const a = Math.min(pos(c.antes), pos(c.despues)), b = Math.max(pos(c.antes), pos(c.despues));
    const base = c.antes >= 0 ? [50, pos(c.antes)] : [pos(c.antes), 50];
    const q = quien(datos, c.id);
    return h('div', { class: 'ct-rep' },
      h('span', { style: 'color:' + q.claro }, q.corto),
      h('span', { class: 'ct-pista', 'aria-hidden': 'true' }, h('i', { class: 'cero' }),
        h('i', { style: 'left:' + base[0] + '%;width:' + (base[1] - base[0]) + '%;background:' + q.color }),
        h('i', { class: 'sombra', style: 'left:' + a + '%;width:' + (b - a) + '%;background:' + q.claro })),
      h('span', { class: c.d > 0 ? 'bien' : 'mal' }, (c.antes > 0 ? '+' : '') + c.antes + ' → ' + (c.despues > 0 ? '+' : '') + c.despues));
  };
  const caeAHostil = ef.cambios.find((c) => c.antesEscalon.id !== 'hostil' && c.despuesEscalon.id === 'hostil');
  const subeEscalon = ef.cambios.find((c) => c.despuesEscalon.desde > c.antesEscalon.desde);

  const aceptar = () => { elegirNodo(datos, p, n); app.guardar(); app.continuar(); };
  montar(raiz, h('div', { class: 'ct' },
    h('header', { class: 'br-cabeza' },
      botonIcono('atras', 'Volver a la brújula', () => app.ir('sectores'), 'hg-volver'),
      h('div', { class: 'br-titulo' }, h('h1', {}, 'Contrato'), h('small', {}, (plantilla.nombre || m.nombre) + (n.vence !== undefined ? ' · vence en ' + Math.max(1, n.vence - s.saltos + 1) + ' saltos' : ''))),
      h('span', { class: 'br-comb' }, ico('combustible'), String(d.costo))),
    h('div', { class: 'ct-lados' }, lado('TE PAGA', C), h('span', { class: 'ct-vs' }, 'vs'), lado(contraAmenaza ? 'AMENAZA' : 'CONTRA', Q)),
    h('h2', { class: 'ct-titulo' }, m.nombre),
    contacto ? h('p', { class: 'ct-contacto' }, ico('piloto'), ' Tu contacto: ', h('strong', {}, contacto.nombre), ' («' + contacto.apodo + '»)') : null,
    m.lore ? h('p', { class: 'ct-porque' }, m.lore.porque) : null,
    m.lore ? h('p', { class: 'ct-busca' }, 'Buscamos: ' + m.lore.buscamos) : null,
    h('div', { class: 'ct-datos' },
      dato('PELIGRO', '●'.repeat(Math.min(3, m.dificultad)) + '○'.repeat(Math.max(0, 3 - m.dificultad)) + ' · Nivel ' + m.nivel),
      dato('ENEMIGOS', (m.cantidadEnemigos || '?') + ' · ' + (NOMBRE_ENEMIGO[enemigoDominante(datos, m)] || 'Mixto')),
      dato('TERRENO', mapa.nombre + (m.niebla ? ', con niebla' : '')),
      dato(contraAmenaza ? 'CÓMO PELEAN' : 'TECNOLOGÍA', contraAmenaza ? (m.objetivo === 'contagio' ? 'Muchos y débiles' : 'Cuerpo a cuerpo') : Q.estilo)),
    (m.condiciones || []).length ? h('div', { class: 'br-chips' }, ...m.condiciones.map((c) => h('span', { class: c.startsWith('irrumpe') ? 'alerta' : '', title: datos.condiciones_mision[c].descripcion }, datos.condiciones_mision[c].nombre))) : null,
    h('div', { class: 'ct-pago' }, h('small', {}, 'PAGO'),
      h('strong', {}, '₵ ' + m.recompensa.creditos + (m.recompensa.botin ? ' + ' + m.recompensa.botin + (m.recompensa.botin === 1 ? ' pieza' : ' piezas') + (Q.partes && Q.partes.length ? ' de ' + Q.corto : '') : '')),
      m.nido ? h('span', {}, '+1 resto de nido para mejorar la nave') : null),
    h('section', { class: 'ct-si', 'aria-label': 'Si ganás' },
      h('small', {}, 'SI GANÁS'),
      ...ef.cambios.map(fila),
      ef.frente ? h('div', { class: 'ct-rep' }, h('span', {}, 'El frente'),
        h('span', { class: 'frente-barra chica', 'aria-hidden': 'true' }, ...s.bandos.map((b) => h('i', { style: 'flex:' + s.frente[b] + ';background:' + quien(datos, b).color }))),
        h('span', { style: 'color:' + C.claro }, ef.frente.antes + '% → ' + ef.frente.despues + '%')) : null,
      ef.amenaza ? h('p', { class: 'ct-nota bien' }, ef.amenaza) : null,
      caeAHostil ? h('p', { class: 'ct-nota mal' }, 'Pasás a ', h('strong', {}, 'hostil'), ' con ' + quien(datos, caeAHostil.id).nombre + ': te cobran el doble en sus paradas y dejan de ofrecerte contratos.') : null,
      !caeAHostil && subeEscalon ? h('p', { class: 'ct-nota bien' }, quien(datos, subeEscalon.id).corto + ' te pasa a ver ' + subeEscalon.despuesEscalon.nombre.toLowerCase() + '.') : null,
      h('p', { class: 'ct-nota' }, 'Si sale mal: ' + C.corto + ' −' + Math.abs(datos.bandos.reputacion.contrato_perdido.cliente) + ' y sin pago.')),
    nem ? h('p', { class: 'br-nem' }, retrato(datos, nem, 'retrato-mini'), h('span', {}, '«' + nem.apodo + '» anda por la zona. ' + (nem.aviso || ''))) : null,
    h('div', { class: 'ct-pie' },
      h('button', { class: 'boton secundario', onclick: () => app.ir('sectores') }, 'Rechazar'),
      h('button', { class: 'boton principal', onclick: aceptar }, 'Aceptar · saltar ' + d.costo))));
}
