// La batalla: el motor la resuelve entera en un instante y aca se la mira, con pausa, velocidades y saltar.
import { h, montar, ico, botonIcono, boton, barra } from './comun.js';
import { simular } from '../motor/simular.js';
import { Repeticion } from '../vista/repeticion.js';
import { escuadronParaMision, cerrarMision } from '../campana/partida.js';

export function batalla(app, raiz) {
  const { datos } = app;
  const p = app.partida;
  const m = p.nodo.mision;
  const resultado = simular(datos, { mision: m, escuadron: escuadronParaMision(datos, p), semilla: m.semilla });
  // El resultado se anota YA, antes de mirar la repeticion: recargar la pagina no deshace una muerte.
  const informe = cerrarMision(datos, p, resultado);
  app.guardar();

  const lienzo = h('canvas', { class: 'campo', 'aria-label': 'Batalla' });
  const envoltura = h('div', { class: 'campo-envoltura' }, lienzo);
  const feed = h('ol', { class: 'feed', 'aria-live': 'polite' });
  const plantel = h('ul', { class: 'plantel' });
  const reloj = h('span', { class: 'reloj' }, '00:00');
  const velocidades = [1, 2, 4];
  const botones = {};
  const final = h('div', { class: 'final oculto' });

  montar(raiz, 
    h('header', { class: 'hud hud-batalla' },
      h('h1', { class: 'titulo-batalla' }, ico(m.icono), ' ', m.nombre),
      reloj,
      h('div', { class: 'controles', role: 'group', 'aria-label': 'Velocidad' },
        (botones.pausa = botonIcono('pausa', 'Pausa', () => { rep.pausado = !rep.pausado; marcar(); })),
        ...velocidades.map((v) => (botones[v] = h('button', { class: 'boton-icono vel', 'aria-label': 'Velocidad ' + v, onclick: () => { rep.velocidad = v; rep.pausado = false; marcar(); } }, v + '×'))),
        botonIcono('saltar', 'Ver el final', () => rep.saltarAlFinal()))),
    h('div', { class: 'columnas-batalla' }, envoltura, h('aside', { class: 'lateral' }, plantel, feed)),
    final);

  const nuevaLinea = (ev) => {
    feed.prepend(h('li', { class: ev.clase + (ev.importante ? ' importante' : '') }, ev.texto));
    while (feed.children.length > 40) feed.lastChild.remove();
  };

  const rep = new Repeticion({
    datos, mision: m, registro: resultado.registro, canvas: lienzo,
    alEvento: nuevaLinea,
    alTerminar: () => mostrarFinal()
  });

  const marcar = () => {
    botones.pausa.classList.toggle('activo', rep.pausado);
    for (const v of velocidades) botones[v].classList.toggle('activo', !rep.pausado && rep.velocidad === v);
  };
  marcar();

  const pintarPlantel = () => {
    plantel.innerHTML = '';
    for (const u of rep.pilotos()) {
      plantel.append(h('li', { class: u.viva ? '' : 'caido' },
        h('span', { class: 'pl-nombre' }, u.viva ? '' : '✝ ', u.ficha.nombre),
        barra(Math.max(0, u.vida), u.ficha.vidaMax, u.vida / u.ficha.vidaMax < 0.3 ? 'critica' : ''),
        u.moral === 'moral_quebrada' ? h('span', { class: 'pl-moral', title: 'Moral quebrada' }, '!') : null));
    }
  };

  function mostrarFinal() {
    final.classList.remove('oculto');
    final.append(h('div', { class: 'final-caja ' + (resultado.victoria ? 'victoria' : 'derrota') },
      h('h2', {}, resultado.victoria ? 'MISIÓN CUMPLIDA' : 'MISIÓN FALLIDA'),
      h('p', {}, datos.textos.motivos_fin[resultado.motivo] || ''),
      informe.caidos.length ? h('p', { class: 'caidos' }, ico('lapida'), ' Caídos: ' + informe.caidos.join(', ')) : null,
      boton('Ver informe', () => app.ir('informe', informe), { iconoNombre: 'play', clase: 'principal' })));
    final.querySelector('button').focus();
  }

  let ultimo = performance.now(), cuadro = 0, vivo = true;
  const bucle = (ahora) => {
    if (!vivo) return;
    const dt = Math.min(100, ahora - ultimo);
    ultimo = ahora;
    rep.avanzar(dt);
    rep.dibujar();
    if (++cuadro % 6 === 0) {
      pintarPlantel();
      const seg = Math.floor((rep.T * datos.reglas.ms_por_tick_en_repeticion) / 1000);
      reloj.textContent = String(Math.floor(seg / 60)).padStart(2, '0') + ':' + String(seg % 60).padStart(2, '0');
    }
    requestAnimationFrame(bucle);
  };
  requestAnimationFrame(bucle);
  const alCambiarTamano = () => rep.medir();
  window.addEventListener('resize', alCambiarTamano);
  // devuelve la limpieza: cortar el bucle al salir de la pantalla
  return () => { vivo = false; window.removeEventListener('resize', alCambiarTamano); };
}
