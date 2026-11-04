// Despliegue: la pantalla entre la preparacion y la batalla. Los mechas bajan y los pilotos hablan por radio
// entre ellos (segun quienes son, como llegan y como se llevan). Es puro color: no cambia nada del juego.
import { h, montar, ico, boton, retrato } from './comun.js';
import { escuadronParaMision } from '../campana/partida.js';
import { dibujarMechaFicha } from '../vista/dibujo.js';
import { fichaDe } from './hangar.js';
import { nombreDeMecha } from '../campana/reclutas.js';


// Arma la charla: [{ piloto | null (control), texto }]
export function armarCharla(datos, p, m, pilotos) {
  const C = datos.charlas;
  const animo = (p.nodo && p.nodo.animo && p.nodo.animo.porPiloto) || {};
  const jefe = m.jefe ? m.jefe.nombre : '';
  const caido = p.caidos && p.caidos.length ? p.caidos[p.caidos.length - 1].apodo : '';
  // sin repetir frases en la misma charla
  const usadas = new Set();
  const elegir = (lista) => {
    const libres = lista.filter((x) => !usadas.has(JSON.stringify(x)));
    const t = (libres.length ? libres : lista)[Math.floor(Math.random() * (libres.length || lista.length))];
    usadas.add(JSON.stringify(t));
    return t;
  };
  const llenar = (t, yo, a, b) => t.replace(/\{yo\}/g, yo ? yo.apodo : '').replace(/\{a\}/g, a ? a.apodo : '').replace(/\{b\}/g, b ? b.apodo : '')
    .replace(/\{mision\}/g, m.nombre).replace(/\{jefe\}/g, jefe).replace(/\{caido\}/g, caido)
    .replace(/\{mecha\}/g, yo ? (yo.mechaNombre || nombreDeMecha(datos, yo.nombre)) : '');
  const charla = [];
  const dice = (pi, t, a, b) => charla.push({ piloto: pi, texto: llenar(t, pi, a, b) });
  const quien = () => elegir(pilotos);
  const ya = new Set();

  dice(null, elegir(C.control_abre));
  // el de mas nivel habla de la mision
  const lider = pilotos.slice().sort((a, b) => b.nivel - a.nivel)[0];
  if (m.jefe && C.jefe) dice(lider, elegir(C.jefe));
  else if (C.tipo[m.plantilla]) dice(lider, elegir(C.tipo[m.plantilla]));
  if (m.rivales && m.rivales.length) dice(quien(), elegir(C.rivales_viejos));

  // cada uno dice algo segun como viene (como mucho cinco; de los novatos habla uno solo)
  let novatoHablo = false;
  for (const pi of pilotos.slice(0, 5)) {
    const est = (animo[pi.id] || {}).estados || [];
    const e = est.find((x) => C.estado[x]);
    if (e) dice(pi, elegir(C.estado[e]));
    else if (pi.traumas && pi.traumas.length) dice(pi, elegir(C.trauma));
    else if (!pi.misiones && !novatoHablo) { dice(pi, elegir(C.novato)); novatoHablo = true; }
    else if (pi.nivel >= 4 || pi.veterano) dice(pi, elegir(C.veterano));
    else if (C.personalidad[pi.personalidad]) dice(pi, elegir(C.personalidad[pi.personalidad]));
  }
  // un par que no se soporta y un par que se banca
  for (const [tipo, clave] of [['rival', 'rivales'], ['amigo', 'amigos']]) {
    const a = pilotos.find((pi) => (animo[pi.id] || {})[tipo] && !ya.has(pi.id));
    if (!a) continue;
    const b = pilotos.find((pi) => pi.id === animo[a.id][tipo]);
    if (!b) continue;
    const [l1, l2] = elegir(C[clave]);
    dice(a, l1, a, b); dice(b, l2, a, b);
    ya.add(a.id); ya.add(b.id);
  }
  if (caido && pilotos.length) dice(quien(), elegir(C.recuerdo));
  dice(null, elegir(C.control_cierra));
  return charla;
}

export function despliegue(app, raiz) {
  const { datos } = app;
  const p = app.partida;
  const m = p.nodo.mision;
  const pilotos = escuadronParaMision(datos, p).map((e) => e.piloto);
  const charla = armarCharla(datos, p, m, pilotos);

  // los mechas en la bodega, bajando
  const bodega = h('div', { class: 'bodega' }, ...pilotos.map((pi, i) => {
    const lienzo = h('canvas', { width: 96, height: 96, class: 'mecha-baja', 'aria-hidden': 'true' });
    dibujarMechaFicha(lienzo.getContext('2d'), fichaDe(datos, pi), 96);
    return h('div', { class: 'bahia', style: '--i:' + i }, lienzo, h('span', { class: 'llama' }), h('small', {}, pi.apodo));
  }));
  const altura = h('div', { class: 'altitud-barra' }, h('i'));
  const alt = h('span', { class: 'altitud-num' }, '3000 m');
  const radio = h('ol', { class: 'radio', 'aria-live': 'polite' });
  const ir = () => { if (timer) clearTimeout(timer); app.ir('batalla'); };
  const listo = boton('¡Adentro!', ir, { iconoNombre: 'play', clase: 'principal oculto' });
  const saltar = boton('Saltar', ir, { iconoNombre: 'saltar', clase: 'secundario compacto' });

  montar(raiz,
    h('div', { class: 'despliegue' },
      h('header', { class: 'despliegue-cabecera' },
        h('div', {}, h('small', {}, 'DESPLIEGUE EN CURSO'), h('h1', { class: 'titulo-pantalla' }, ico(m.icono), ' ', m.nombre)),
        saltar),
      bodega,
      h('div', { class: 'altitud' }, ico('arriba'), altura, alt),
      radio,
      h('div', { class: 'acciones' }, listo)));

  // las lineas de a una, como si llegaran por radio
  let i = 0, timer = null;
  const paso = () => {
    if (i >= charla.length) {
      altura.firstChild.style.width = '100%';
      alt.textContent = 'EN TIERRA';
      raiz.querySelector('.despliegue').classList.add('aterrizo');
      listo.classList.remove('oculto');
      listo.focus({ preventScroll: true });
      return;
    }
    const l = charla[i++];
    const li = h('li', { class: l.piloto ? 'piloto' : 'control' },
      l.piloto ? retrato(datos, l.piloto, 'retrato-plantel') : h('span', { class: 'radio-control' }, ico('mision')),
      h('div', {}, h('strong', {}, l.piloto ? l.piloto.apodo : 'Control'), h('span', {}, l.texto)));
    radio.append(li);
    radio.scrollTop = radio.scrollHeight;
    const frac = i / charla.length;
    altura.firstChild.style.width = Math.round(frac * 100) + '%';
    alt.textContent = Math.max(0, Math.round(3000 * (1 - frac) / 50) * 50) + ' m';
    timer = setTimeout(paso, 900 + l.texto.length * 28);
  };
  timer = setTimeout(paso, 500);
  return () => clearTimeout(timer);
}
