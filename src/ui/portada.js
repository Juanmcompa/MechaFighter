import { h, montar, boton, panel } from './comun.js';
import { nuevaPartida } from '../campana/partida.js';

export function portada(app, raiz) {
  const guardada = app.partida || app.cargarGuardada();
  const enCurso = guardada && guardada.estado !== 'fin';
  const empezar = () => {
    // La semilla sale del reloj: es lo unico que no tiene que repetirse. De ahi en adelante, todo es determinista.
    app.partida = nuevaPartida(app.datos, (Date.now() % 2147483646) + 1);
    app.guardar();
    app.ir('hangar', { primeraVez: true });
  };
  montar(raiz, 
    h('div', { class: 'portada' },
      h('div', { class: 'marquesina' },
        h('h1', {}, 'MECHA', h('span', {}, 'FIGHTER')),
        h('p', { class: 'sub' }, 'Escuadrón táctico autónomo')),
      h('p', { class: 'bajada' }, 'Armá tus mechas, programalos y mirá cómo pelean solos. Los pilotos tienen personalidad propia, y si caen no vuelven.'),
      h('div', { class: 'acciones-portada' },
        guardada && guardada.estado !== 'fin'
          ? boton('Continuar', () => app.continuar(), { iconoNombre: 'play', clase: 'principal' }) : null,
        enCurso
          ? boton('Nueva campaña', (ev) => {
            // Confirmacion en la misma pantalla (sin ventanitas del navegador)
            ev.currentTarget.replaceWith(h('div', { class: 'confirmar' },
              h('span', {}, 'Se pierde la campaña en curso.'),
              boton('Empezar de cero', empezar, { clase: 'peligro' })));
          }, { iconoNombre: 'mas', clase: 'secundario' })
          : boton('Nueva campaña', empezar, { iconoNombre: 'mas', clase: 'principal' })),
      panel('Cómo se juega',
        h('ol', { class: 'pasos' },
          h('li', {}, h('strong', {}, 'Elegí un contrato'), ' en el mapa del sector.'),
          h('li', {}, h('strong', {}, 'En el hangar'), ' cambiá partes y programá cada mecha: SI pasa algo → HACÉ algo.'),
          h('li', {}, h('strong', {}, 'Mirá la batalla.'), ' No hay control: lo que programaste, y lo que el piloto decida, es lo que pasa.'),
          h('li', {}, h('strong', {}, 'Cuidá a tu gente.'), ' Ganan experiencia, cicatrices y medallas. La muerte es permanente.'))),
      h('p', { class: 'firma' }, 'App en desarrollo · Early Access')));
}
