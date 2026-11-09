// Parada tecnica: combustible, reparacion, mejoras de la nave y piezas. Cada bando vende lo suyo, y como te vea
// cambia los precios y que piezas te vende. Las paradas libres del gremio venden de todo, a precio normal.
import { h, montar, ico, boton, iconoParte, nombrePieza, describirParte, NOMBRE_RAREZA } from './comun.js';
import { comprar, vender, seguir, precioPieza, comprarCombustible, paradaActual, precioCombustible, ofertaDe, reparar, costoReparacion, vidaDelMecha, partesRotas } from '../campana/partida.js';
import { quien, escalonDe, combustibleMaximo } from '../campana/brujula.js';

const VISTA = { pestana: 'comprar' };

export function parada(app, raiz) {
  const { datos } = app;
  const p = app.partida;
  const n = paradaActual(p);
  if (!n) return app.continuar();
  const B = quien(datos, n.dueno);
  const cuerpo = h('div', { class: 'pd' });

  const pintar = () => {
    const e = escalonDe(datos, p, n.dueno);
    const max = combustibleMaximo(datos, p);
    const precio = precioCombustible(datos, p);
    const falta = max - p.combustible;
    const costoTodo = p.pilotos.reduce((t, pi) => t + costoReparacion(datos, pi).total, 0);
    const vida = Math.round(p.pilotos.reduce((t, pi) => t + vidaDelMecha(pi), 0) / Math.max(1, p.pilotos.length));
    const rotas = p.pilotos.reduce((t, pi) => t + partesRotas(pi).length, 0);
    const llenar = () => { while (p.combustible < max && comprarCombustible(datos, p)); app.guardar(); pintar(); };
    const repararTodo = () => { for (const pi of p.pilotos) { const c = costoReparacion(datos, pi).total; if (c && p.creditos >= c) reparar(datos, p, pi.id, 'todo'); } app.guardar(); pintar(); };

    const pieza = (o, i) => {
      const of = ofertaDe(datos, p, o, n.dueno);
      const pt = datos.partes[o.pieza.parte];
      return h('li', { class: 'pd-pieza rareza-' + pt.rareza + (o.vendida ? ' vendida' : '') + (of.bloqueada ? ' bloqueada' : '') },
        iconoParte(datos, o.pieza.parte, 'pz-icono rareza-' + pt.rareza),
        h('span', { class: 'pz-textos' }, h('strong', {}, nombrePieza(datos, o.pieza)), h('small', {}, NOMBRE_RAREZA[pt.rareza] + ' · ' + describirParte(datos, o.pieza))),
        o.vendida ? h('span', { class: 'pd-nota' }, 'Vendida')
          : of.bloqueada ? h('span', { class: 'pd-nota' }, ico('candado'), ' ' + of.pide)
          : h('button', { class: 'pd-precio', disabled: p.creditos < of.precio, onclick: () => { comprar(datos, p, i); app.guardar(); pintar(); } }, '₵' + of.precio));
    };
    const venta = (pz, i) => {
      const pt = datos.partes[pz.parte];
      const valor = Math.trunc((precioPieza(datos, pz) * datos.reglas.campana.venta_pct) / 100);
      return h('li', { class: 'pd-pieza rareza-' + pt.rareza },
        iconoParte(datos, pz.parte, 'pz-icono rareza-' + pt.rareza),
        h('span', { class: 'pz-textos' }, h('strong', {}, nombrePieza(datos, pz)), h('small', {}, NOMBRE_RAREZA[pt.rareza] + ' · ' + describirParte(datos, pz))),
        h('button', { class: 'pd-precio vende', onclick: () => { vender(datos, p, i); app.guardar(); pintar(); } }, '+' + valor));
    };

    cuerpo.replaceChildren(...[
      h('header', { class: 'br-cabeza' },
        h('div', { class: 'br-titulo' }, h('small', { style: 'color:' + B.claro }, 'PARADA TÉCNICA · ' + (B.neutral ? 'PUERTO LIBRE' : B.corto.toUpperCase())),
          h('h1', {}, B.neutral ? 'Puerto del gremio' : 'Parada de ' + B.corto)),
        h('span', { class: 'br-cred' }, '₵ ' + p.creditos.toLocaleString('es-AR'))),
      h('p', { class: 'pd-trato', style: '--c:' + B.color }, B.neutral ? 'Los transportistas no se meten en la guerra: precios normales y piezas de todos.'
        : 'Te ven ' + e.nombre.toLowerCase() + (e.precio_pct !== 100 ? ': precios ' + (e.precio_pct > 100 ? '+' : '−') + Math.abs(e.precio_pct - 100) + '%.' : '.') + ' Venden ' + B.estilo + '.'),
      h('section', { class: 'pd-bloque', 'aria-label': 'Combustible' },
        h('div', { class: 'pd-fila' }, ico('combustible'), h('span', {}, 'Combustible ', h('b', {}, p.combustible + '/' + max)), h('small', {}, '₵' + precio + ' cada uno')),
        h('div', { class: 'pd-tanque', role: 'meter', 'aria-label': 'Combustible', 'aria-valuenow': p.combustible, 'aria-valuemax': max },
          ...Array.from({ length: max }, (_, k) => h('i', { class: k < p.combustible ? 'lleno' : '' }))),
        h('div', { class: 'pd-dos' },
          h('button', { class: 'boton secundario', disabled: !falta || p.creditos < precio, onclick: () => { comprarCombustible(datos, p); app.guardar(); pintar(); } }, '+1 · ₵' + precio),
          h('button', { class: 'boton secundario', disabled: !falta || p.creditos < precio, onclick: llenar }, falta ? 'Llenar · ₵' + Math.min(falta, Math.floor(p.creditos / precio)) * precio : 'Tanque lleno'))),
      h('div', { class: 'pd-bloque pd-fila' }, ico('llave'), h('span', {}, 'Escuadrón al ' + vida + '%', rotas ? h('small', {}, ' · ' + rotas + (rotas === 1 ? ' pieza rota' : ' piezas rotas')) : null),
        costoTodo ? h('button', { class: 'pd-precio', disabled: p.creditos < 1, onclick: repararTodo }, 'Reparar ₵' + costoTodo) : h('small', {}, 'Todo sano')),
      h('button', { class: 'pd-bloque pd-fila pd-nave', onclick: () => app.ir('nodriza', { desde: 'parada' }) }, ico('nave'), h('span', {}, 'Mejoras de la nave', h('small', {}, ' · se instalan acá')), h('em', {}, '›')),
      h('div', { class: 'pd-tabs', role: 'tablist' },
        ...[['comprar', 'Comprar'], ['vender', 'Vender']].map(([id, t]) => h('button', { role: 'tab', 'aria-selected': VISTA.pestana === id ? 'true' : 'false', class: VISTA.pestana === id ? 'activa' : '', onclick: () => { VISTA.pestana = id; pintar(); } }, t))),
      VISTA.pestana === 'comprar'
        ? (n.oferta && n.oferta.length ? h('ul', { class: 'pd-lista' }, ...n.oferta.map(pieza)) : h('p', { class: 'ayuda' }, 'No les queda nada para vender.'))
        : (p.inventario.length ? h('ul', { class: 'pd-lista' }, ...p.inventario.map(venta)) : h('p', { class: 'ayuda' }, 'No tenés partes sueltas. Lo montado se cambia en el armado.')),
      h('div', { class: 'hg-desplegar' },
        boton('Hangar', () => app.ir('hangar'), { iconoNombre: 'hangar', clase: 'secundario' }),
        boton('Despegar', () => { seguir(datos, p); app.guardar(); app.ir('sectores'); }, { iconoNombre: 'play', clase: 'principal' }))
    ]);
  };
  montar(raiz, cuerpo);
  pintar();
}
