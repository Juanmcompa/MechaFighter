// Fin de la campana: resultado, puntaje y el memorial de los que no volvieron.
import { h, montar, ico, boton, panel, chip, retrato } from './comun.js';
import { elegirVeterano } from '../campana/partida.js';
import { guardarLegado } from '../campana/guardado.js';
import { relato } from '../campana/cronica.js';

export function fin(app, raiz) {
  const { datos } = app;
  const p = app.partida;
  const gano = p.resultado === 'victoria';
  // lo que queda para la proxima campana se guarda ya (aunque cierren la pestana)
  if (p.legado) guardarLegado(p.legado);
  const L = p.legado;
  const elegir = (id) => { elegirVeterano(p, id); app.guardar(); app.ir('fin'); };
  montar(raiz, 
    h('h1', { class: 'titulo-pantalla ' + (gano ? 'texto-bien' : 'texto-mal') }, gano ? 'Campaña cumplida' : 'Escuadrón perdido'),
    h('p', { class: 'bajada' }, gano
      ? 'El Cinturón quedó atrás. ' + p.pilotos.length + ' piloto(s) vuelven a casa.'
      : 'No quedó nadie para seguir. El contrato se cierra sin firmas.'),
    h('div', { class: 'chips grande' },
      chip('puntaje', p.puntaje + ' puntos', 'Puntaje final'),
      chip('mision', p.misionesJugadas + ' misiones', 'Misiones jugadas'),
      chip('lapida', p.caidos.length + ' caídos', 'Caídos')),
    gano && p.pilotos.length ? panel('Vuelven', h('ul', { class: 'lista-simple' }, ...p.pilotos.map((pi) =>
      h('li', {}, ico(datos.clases[pi.clase].icono), ' «' + pi.apodo + '» ' + pi.nombre + ' · niv ' + pi.nivel + ' · ' + pi.bajas + ' bajas')))) : null,
    L && gano && p.pilotos.length ? panel('¿Quién sigue con vos?',
      h('p', { class: 'ayuda' }, 'Uno de ellos puede arrancar la próxima campaña con su nivel, sus medallas y sus cicatrices.'),
      h('div', { class: 'veteranos' }, ...p.pilotos.map((pi) => h('button', {
        class: 'tarjeta-veterano' + (L.veterano && L.veterano.id === pi.id ? ' elegido' : ''), onclick: () => elegir(pi.id)
      }, retrato(datos, pi, 'retrato-chico'), h('strong', {}, '«' + pi.apodo + '»'), h('small', {}, datos.clases[pi.clase].nombre + ' · niv ' + pi.nivel))))) : null,
    L && !gano ? panel('Lo que queda',
      L.veterano ? h('p', { class: 'legado-linea' }, retrato(datos, L.veterano, 'retrato-chico'),
        h('span', {}, h('strong', {}, '«' + L.veterano.apodo + '»'), ' apareció entre los restos, vivo. Va a estar en la próxima campaña.')) : null,
      L.escuadron.length ? h('p', { class: 'legado-linea' }, ico('calavera'),
        h('span', {}, 'Nunca encontraron los cuerpos de ' + L.escuadron.map((f) => '«' + f.apodo + '»').join(', ') + '.')) : null) : null,
    panelCronica(datos, p),
    p.caidos.length ? panel('Memorial', h('ul', { class: 'memorial' }, ...p.caidos.map((c) => h('li', {},
      retrato(datos, c, 'retrato-chico caido') || ico('lapida'),
      h('div', {},
        h('strong', {}, '«' + c.apodo + '» ' + c.nombre),
        h('small', {}, (datos.clases[c.clase] || {}).nombre + ' · niv ' + c.nivel + (c.mechaNombre ? ' · piloteaba «' + c.mechaNombre + '»' : '') + ' · ' + c.misiones + ' misiones · ' + c.bajas + ' bajas'),
        h('p', { class: 'epitafio' }, c.epitafio || ('Cayó en ' + c.mision + ' (sector ' + c.sector + ').')),
        c.hoja && c.hoja.length ? h('ul', { class: 'hoja-servicio corta' }, ...c.hoja.filter((t) => t !== c.epitafio).slice(-3).map((t) => h('li', {}, t))) : null,
        c.medallas.length ? h('div', { class: 'chips' }, ...c.medallas.map((m) => chip('medalla', datos.medallas[m].nombre, '', 'chip-medalla'))) : null)))))
      : null,
    h('div', { class: 'acciones' },
      boton('Nueva campaña', () => { app.borrarGuardada(); app.ir('portada'); }, { iconoNombre: 'mas', clase: 'principal' }))
  );
}

// La historia del escuadron, capitulo por capitulo (sector por sector)
function panelCronica(datos, p) {
  if (!p.cronica || !p.cronica.length) return null;
  const r = relato(datos, p);
  return panel(r.titulo,
    h('div', { class: 'cronica' },
      ...r.capitulos.flatMap((c) => [h('h3', {}, c.titulo), h('ul', {}, ...c.hechos.map((e) => h('li', { class: e.tipo }, e.texto)))]),
      h('p', { class: 'cierre' }, r.cierre),
      r.destacado ? h('p', {}, ico('calavera'), ' ' + r.destacado) : null,
      h('div', { class: 'logros' }, ...r.logros.map((t) => chip('medalla', t, '')))));
}
