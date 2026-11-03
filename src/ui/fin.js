// Fin de la campana: resultado, puntaje y el memorial de los que no volvieron.
import { h, montar, ico, boton, panel, chip, retrato } from './comun.js';

export function fin(app, raiz) {
  const { datos } = app;
  const p = app.partida;
  const gano = p.resultado === 'victoria';
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
    p.caidos.length ? panel('Memorial', h('ul', { class: 'memorial' }, ...p.caidos.map((c) => h('li', {},
      retrato(datos, c, 'retrato-chico caido') || ico('lapida'),
      h('div', {},
        h('strong', {}, '«' + c.apodo + '» ' + c.nombre),
        h('small', {}, (datos.clases[c.clase] || {}).nombre + ' · niv ' + c.nivel + ' · ' + c.misiones + ' misiones · ' + c.bajas + ' bajas · cayó en ' + c.mision + ' (sector ' + c.sector + ')'),
        c.medallas.length ? h('div', { class: 'chips' }, ...c.medallas.map((m) => chip('medalla', datos.medallas[m].nombre, '', 'chip-medalla'))) : null)))))
      : null,
    h('div', { class: 'acciones' },
      boton('Nueva campaña', () => { app.borrarGuardada(); app.ir('portada'); }, { iconoNombre: 'mas', clase: 'principal' }))
  );
}
