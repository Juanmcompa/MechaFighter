// La nodriza: la nave que lleva al escuadron. Seis modulos con niveles (sensor, tanque, hangar, enfermeria, bahia de
// reparacion y casco). Se ven desde la compania; se mejoran en las paradas tecnicas (ver nodriza.json).
import { h, montar, ico, botonIcono } from './comun.js';
import { mejoraDe, instalarMejora, paradaActual } from '../campana/partida.js';
import { nivelModulo } from '../campana/brujula.js';
import { existeIcono } from './iconos.js';

const VISTA = { sel: 'sensor' };
// donde va cada modulo alrededor del dibujo de la nave (en % del cuadro)
const LUGAR = { sensor: [50, 9], enfermeria: [13, 32], hangar: [87, 32], bahia: [13, 64], tanque: [87, 64], casco: [50, 89] };

export function nodriza(app, raiz, opciones = {}) {
  const { datos } = app;
  const p = app.partida;
  const M = datos.nodriza.modulos;
  const enParada = !!paradaActual(p);
  const volver = () => (opciones.desde === 'parada' && enParada ? app.ir('parada') : app.ir('compania'));
  const cuerpo = h('div', { class: 'nz' });

  const pintar = () => {
    const id = VISTA.sel;
    const mod = M[id];
    const nv = nivelModulo(datos, p, id);
    const x = mejoraDe(datos, p, id);
    const max = mod.niveles.length - 1;
    const boton = (mid) => {
      const m = M[mid], n = nivelModulo(datos, p, mid), el = mid === id;
      return h('button', {
        class: 'nz-mod' + (el ? ' elegido' : '') + (n ? '' : ' vacio'), style: 'left:' + LUGAR[mid][0] + '%;top:' + LUGAR[mid][1] + '%',
        'aria-pressed': el ? 'true' : 'false', 'aria-label': m.nombre + ', nivel ' + n + ' de ' + (m.niveles.length - 1),
        onclick: () => { VISTA.sel = mid; pintar(); }
      }, ico(existeIcono(m.icono) ? m.icono : 'llave'), h('small', {}, m.corto),
      h('span', { class: 'nz-pips', 'aria-hidden': 'true' }, ...Array.from({ length: m.niveles.length - 1 }, (_, k) => h('i', { class: k < n ? 'lleno' : '' }))));
    };
    let pie;
    if (x.tope) pie = h('button', { class: 'boton secundario', disabled: true }, 'Al máximo');
    else if (!enParada) pie = h('p', { class: 'nz-nota' }, ico('combustible'), ' Se instala en una parada técnica: ₵' + x.costo + '.');
    else pie = h('button', { class: 'boton principal', disabled: !x.puede, onclick: () => { if (instalarMejora(datos, p, id)) { app.guardar(); pintar(); } } },
      x.faltas.length ? 'Bloqueado' : (nv ? 'Mejorar' : 'Instalar') + ' · ₵' + x.costo.toLocaleString('es-AR'));
    cuerpo.replaceChildren(
      h('header', { class: 'br-cabeza' },
        botonIcono('atras', 'Volver', volver, 'hg-volver'),
        h('div', { class: 'br-titulo' }, h('small', {}, enParada ? 'NODRIZA · EN LA PARADA' : 'NODRIZA'), h('h1', {}, p.nombreNave || 'Caronte')),
        h('span', { class: 'nz-recursos' }, h('span', { class: 'br-cred' }, '₵ ' + p.creditos.toLocaleString('es-AR')), h('small', {}, (p.restos || 0) + ' restos de nido'))),
      h('section', { class: 'nz-nave', 'aria-label': 'Módulos de la nave' },
        h('span', { class: 'nz-dibujo', 'aria-hidden': 'true', html: NAVE }),
        ...Object.keys(M).filter((k) => LUGAR[k]).map(boton)),
      h('section', { class: 'nz-detalle', 'aria-live': 'polite' },
        h('div', { class: 'nz-cab' }, h('span', { class: 'nz-icono' }, ico(existeIcono(mod.icono) ? mod.icono : 'llave')),
          h('span', {}, h('strong', {}, mod.nombre), h('small', {}, 'Nivel ' + nv + ' de ' + max))),
        h('p', {}, mod.que),
        h('div', { class: 'nz-antes' },
          h('div', {}, h('small', {}, 'AHORA'), h('span', {}, mod.niveles[nv].texto)),
          h('span', { class: 'nz-flecha', 'aria-hidden': 'true' }, '›'),
          h('div', { class: 'sig' }, h('small', {}, 'SIGUIENTE'), h('span', {}, x.tope ? 'Al máximo' : x.sig.texto))),
        !x.tope && x.faltas.length ? h('p', { class: 'nz-falta' }, ico('candado'), ' Necesita: ' + x.faltas.join(' · ')) : null,
        pie),
      h('p', { class: 'ayuda nz-ayuda' }, 'Las mejoras grandes piden que el bando de la parada te tenga confianza, o restos de un nido limpiado.'));
  };
  montar(raiz, cuerpo);
  pintar();
}

// La nave vista desde arriba (decorado)
const NAVE = '<svg viewBox="0 0 200 300" width="100%" height="100%" fill="none" stroke-linejoin="round">' +
  '<path d="M100 6 L124 52 L130 120 L160 150 L162 214 L140 232 L134 276 L114 294 L86 294 L66 276 L60 232 L38 214 L40 150 L70 120 L76 52 Z" fill="#121a0e" stroke="#4f7a33" stroke-width="2"/>' +
  '<path d="M100 18 L100 286 M76 120 L124 120 M70 160 L130 160 M66 214 L134 214 M80 252 L120 252" stroke="#2d3427" stroke-width="1.5"/>' +
  '<rect x="84" y="62" width="32" height="40" stroke="#2d3427" stroke-width="1.5"/>' +
  '<path d="M86 294 L82 300 M114 294 L118 300 M100 294 L100 300" stroke="#e0a43a" stroke-width="3" opacity=".7"/></svg>';
