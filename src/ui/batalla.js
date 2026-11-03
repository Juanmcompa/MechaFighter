// La batalla: el motor la resuelve entera en un instante y aca se la mira, con pausa, velocidades y saltar.
import { h, montar, ico, botonIcono, boton, barra, retrato, VERSION } from './comun.js';
import { simular } from '../motor/simular.js';
import { Repeticion } from '../vista/repeticion.js';
import { escuadronParaMision, cerrarMision } from '../campana/partida.js';

export function batalla(app, raiz) {
  const { datos } = app;
  const p = app.partida;
  const m = p.nodo.mision;
  const escuadron = escuadronParaMision(datos, p);
  const pilotoDe = new Map(escuadron.map(({ piloto }) => [piloto.id, piloto]));
  const resultado = simular(datos, { mision: m, escuadron, semilla: m.semilla });
  // El resultado se anota YA, antes de mirar la repeticion: recargar la pagina no deshace una muerte.
  const informe = cerrarMision(datos, p, resultado);
  app.guardar();

  const lienzo = h('canvas', { class: 'campo', 'aria-label': 'Batalla' });
  const botonCamara = h('button', {
    class: 'boton-camara', 'aria-label': 'Cambiar cámara',
    onclick: () => { rep.alternarGeneral(); marcarCamara(); }
  });
  const envoltura = h('div', { class: 'campo-envoltura' }, lienzo, botonCamara);
  const feed = h('ol', { class: 'feed', 'aria-live': 'polite' });
  const plantel = h('ul', { class: 'plantel' });
  const reloj = h('span', { class: 'reloj' }, '00:00');
  const velocidades = [1, 2, 4];
  const botones = {};
  const final = h('div', { class: 'final oculto' });

  // Una tarjeta por piloto (retrato, nombre y vida), armadas una vez y actualizadas en cada cuadro
  const tarjetas = new Map();
  for (const { piloto } of escuadron) {
    const vida = barra(1, 1);
    // tocar la tarjeta: la camara sigue a ese piloto (tocar de nuevo: vuelve a la camara automatica)
    const li = h('li', {}, h('button', {
      class: 'pl-tarjeta', 'aria-pressed': 'false', 'aria-label': 'Seguir a ' + piloto.apodo,
      onclick: () => { rep.alternarSeguir(piloto.id); marcarCamara(); }
    }, retrato(datos, piloto, 'retrato-plantel'),
    h('span', { class: 'pl-datos' }, h('span', { class: 'pl-nombre' }, piloto.apodo), vida)));
    tarjetas.set(piloto.id, { li, vida });
    plantel.append(li);
  }

  montar(raiz,
    h('div', { class: 'barra-sistema' }, h('span', { class: 'senal' }, '▮▮▮'), h('span', {}, 'SYSTEM RUNNING'), h('span', { class: 'led' })),
    h('header', { class: 'hud-batalla' },
      h('div', { class: 'visor visor-mision' }, h('h1', { class: 'titulo-batalla' }, ico(m.icono), ' ', m.nombre)),
      h('div', { class: 'visor visor-reloj' }, reloj)),
    h('div', { class: 'controles', role: 'group', 'aria-label': 'Velocidad' },
      (botones.pausa = botonIcono('pausa', 'Pausa', () => { rep.pausado = !rep.pausado; marcar(); }, 'control')),
      ...velocidades.map((v) => (botones[v] = h('button', { class: 'boton-icono control vel', 'aria-label': 'Velocidad ' + v, onclick: () => { rep.velocidad = v; rep.pausado = false; marcar(); } }, v + 'x'))),
      botonIcono('saltar', 'Ver el final', () => rep.saltarAlFinal(), 'control')),
    h('div', { class: 'columnas-batalla' },
      h('div', { class: 'col-campo' }, plantel, envoltura),
      h('section', { class: 'taclog', 'aria-label': 'Registro de combate' }, h('h2', { class: 'taclog-titulo' }, '[ TAC-LOG ]'), feed)),
    h('footer', { class: 'pie-sistema' }, h('span', {}, '[ SECTOR ' + (p.sector + 1) + ' ]'), h('span', {}, '[ SYSTEM v' + VERSION + ' ]')),
    final);

  const nuevaLinea = (ev) => {
    feed.prepend(h('li', { class: ev.clase + (ev.importante ? ' importante' : '') }, ev.texto));
    while (feed.children.length > 40) feed.lastChild.remove();
  };

  const rep = new Repeticion({
    datos, mision: m, registro: resultado.registro, canvas: lienzo, pilotos: pilotoDe,
    alEvento: nuevaLinea,
    alTerminar: () => mostrarFinal()
  });

  const marcarCamara = () => {
    for (const [id, t] of tarjetas) {
      const sigue = rep.seguir && rep.unidades.get(rep.seguir) && rep.unidades.get(rep.seguir).ficha.ref === id;
      t.li.firstChild.classList.toggle('siguiendo', !!sigue);
      t.li.firstChild.setAttribute('aria-pressed', sigue ? 'true' : 'false');
    }
    botonCamara.innerHTML = '';
    botonCamara.append(ico(rep.seguir ? 'piloto' : rep.modoCamara === 'general' ? 'mapa' : 'mira'),
      h('span', {}, rep.seguir ? 'Siguiendo' : rep.modoCamara === 'general' ? 'Todo el mapa' : 'Acción'));
  };

  const marcar = () => {
    botones.pausa.classList.toggle('activo', rep.pausado);
    for (const v of velocidades) botones[v].classList.toggle('activo', !rep.pausado && rep.velocidad === v);
  };
  marcar();
  marcarCamara();

  const pintarPlantel = () => {
    for (const u of rep.pilotos()) {
      const t = tarjetas.get(u.ficha.ref);
      if (!t) continue;
      const pct = Math.max(0, Math.round((u.vida * 100) / u.ficha.vidaMax));
      t.vida.firstChild.style.width = pct + '%';
      t.vida.classList.toggle('critica', pct < 30);
      const b = t.li.firstChild;
      b.classList.toggle('caido', !u.viva);
      b.classList.toggle('quebrado', u.viva && u.moral === 'moral_quebrada');
      if (!u.viva && b.classList.contains('siguiendo')) marcarCamara();
      b.title = u.ficha.nombre + (u.viva ? ' · ' + pct + '%' : ' · caído');
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
