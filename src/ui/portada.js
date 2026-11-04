import { h, montar, boton, panel, ico, retrato, version } from './comun.js';
import { nuevaPartida } from '../campana/partida.js';
import { cargarLegado, borrarLegado } from '../campana/guardado.js';

export function portada(app, raiz) {
  const guardada = app.partida || app.cargarGuardada();
  const enCurso = guardada && guardada.estado !== 'fin';
  const legado = cargarLegado();
  const empezar = () => {
    // La semilla sale del reloj: es lo unico que no tiene que repetirse. De ahi en adelante, todo es determinista.
    app.partida = nuevaPartida(app.datos, (Date.now() % 2147483646) + 1, legado);
    borrarLegado(); // el legado se usa una vez
    app.guardar();
    app.ir('hangar', { primeraVez: true });
  };
  montar(raiz, 
    h('div', { class: 'portada' },
      noticias(app.datos),
      h('div', { class: 'marquesina' },
        h('h1', {}, 'MECHA', h('span', {}, 'FIGHTER')),
        h('p', { class: 'sub' }, 'Escuadrón táctico autónomo')),
      h('p', { class: 'bajada' }, 'Armá tus mechas, programalos y mirá cómo pelean solos. Los pilotos tienen personalidad propia, y si caen no vuelven.'),
      h('div', { class: 'acciones-portada' },
        guardada && guardada.estado !== 'fin'
          ? boton('Continuar', () => app.continuar(), { iconoNombre: 'play', clase: 'principal' }) : null,
        // la campana termino pero quedo abierta (por ejemplo, sin elegir veterano)
        guardada && guardada.estado === 'fin'
          ? boton('Ver el final', () => app.continuar(), { iconoNombre: 'lapida', clase: 'secundario' }) : null,
        enCurso
          ? boton('Nueva campaña', (ev) => {
            // Confirmacion en la misma pantalla (sin ventanitas del navegador)
            ev.currentTarget.replaceWith(h('div', { class: 'confirmar' },
              h('span', {}, 'Se pierde la campaña en curso.'),
              boton('Empezar de cero', empezar, { clase: 'peligro' })));
          }, { iconoNombre: 'mas', clase: 'secundario' })
          : boton('Nueva campaña', empezar, { iconoNombre: 'mas', clase: 'principal' })),
      legado && (legado.veterano || (legado.escuadron && legado.escuadron.length)) ? panel('De la campaña anterior',
        legado.veterano ? h('p', { class: 'legado-linea' }, retrato(app.datos, legado.veterano, 'retrato-mini'),
          h('span', {}, h('strong', {}, '«' + legado.veterano.apodo + '»'), legado.veterano.comoLlego === 'sobrevivio'
            ? ' sobrevivió y vuelve a firmar con vos (niv ' + legado.veterano.nivel + ').'
            : ' sigue con vos en la próxima campaña (niv ' + legado.veterano.nivel + ').')) : null,
        legado.escuadron && legado.escuadron.length ? h('p', { class: 'legado-linea' }, ico('calavera'),
          h('span', {}, 'No se encontraron los cuerpos de ' + legado.escuadron.map((f) => '«' + f.apodo + '»').join(', ') + '. Hay rumores.')) : null) : null,
      panel('Cómo se juega',
        h('ol', { class: 'pasos' },
          h('li', {}, h('strong', {}, 'Elegí un contrato'), ' en el mapa del sector.'),
          h('li', {}, h('strong', {}, 'En el hangar'), ' cambiá partes y programá cada mecha: SI pasa algo → HACÉ algo.'),
          h('li', {}, h('strong', {}, 'Mirá la batalla.'), ' No hay control: lo que programaste, y lo que el piloto decida, es lo que pasa.'),
          h('li', {}, h('strong', {}, 'Cuidá a tu gente.'), ' Ganan experiencia, cicatrices y medallas. La muerte es permanente.'))),
      h('p', { class: 'firma' }, 'App en desarrollo · Early Access')));
}

// Cinta de noticias arriba de todo: las ultimas versiones pasando de derecha a izquierda (data/version.json)
function noticias(datos) {
  const V = datos.version;
  if (!V) return null;
  const lista = V.novedades && V.novedades.length ? V.novedades : ['v' + version(datos) + ' · ' + V.cambio];
  // dos copias seguidas: cuando la primera termina de pasar, la segunda ocupa su lugar y no se nota el salto
  const tira = () => h('span', { class: 'noticias-tira' }, ...lista.map((t) => {
    const [v, ...resto] = t.split(' · ');
    return h('span', { class: 'noticia' }, h('strong', {}, v), ' ' + resto.join(' · '));
  }));
  const pista = h('div', { class: 'noticias-pista' }, tira(), tira());
  pista.style.setProperty('--duracion', Math.max(20, lista.join('').length * 0.22) + 's');
  return h('div', { class: 'noticias', role: 'marquee', 'aria-label': 'Novedades: ' + lista.join('. ') },
    h('span', { class: 'noticias-titulo' }, 'NOVEDADES'),
    h('div', { class: 'noticias-ventana', 'aria-hidden': 'true' }, pista));
}
