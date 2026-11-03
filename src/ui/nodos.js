// Nodos que no son misiones: taller, reclutamiento y eventos (incluye el descanso).
import { h, montar, ico, boton, panel, chip, barraCampana, describirParte, nombrePieza, textoPersonalidad } from './comun.js';
import { comprar, vender, contratar, seguir, precioPieza } from '../campana/partida.js';

function pie(app) {
  return h('div', { class: 'acciones' },
    boton('Hangar', () => app.ir('hangar'), { iconoNombre: 'hangar', clase: 'secundario' }),
    boton('Seguir viaje', () => { seguir(app.datos, app.partida); app.guardar(); app.continuar(); }, { iconoNombre: 'play', clase: 'principal' }));
}

export function taller(app, raiz) {
  const { datos } = app;
  const p = app.partida;
  const pintar = () => {
    raiz.innerHTML = '';
    montar(raiz, 
      barraCampana(datos, p, []),
      h('h1', { class: 'titulo-pantalla' }, ico('taller'), ' Taller'),
      panel('En venta', h('ul', { class: 'lista-partes' }, ...p.nodo.oferta.map((o, i) => h('li', { class: 'rareza-' + datos.partes[o.pieza.parte].rareza + (o.vendida ? ' vendida' : '') },
        h('div', {}, h('strong', {}, nombrePieza(datos, o.pieza)), h('small', {}, describirParte(datos, o.pieza))),
        o.vendida ? h('span', { class: 'ayuda' }, 'Vendida')
          : boton(String(o.precio), () => { comprar(datos, p, i); app.guardar(); pintar(); }, { iconoNombre: 'creditos', deshabilitado: p.creditos < o.precio, titulo: 'Comprar por ' + o.precio })))),
      ),
      panel('Tu depósito', p.inventario.length ? h('ul', { class: 'lista-partes' }, ...p.inventario.map((pz, i) => h('li', { class: 'rareza-' + datos.partes[pz.parte].rareza },
        h('div', {}, h('strong', {}, nombrePieza(datos, pz)), h('small', {}, describirParte(datos, pz))),
        boton('+' + Math.trunc((precioPieza(datos, pz) * datos.reglas.campana.venta_pct) / 100), () => { vender(datos, p, i); app.guardar(); pintar(); }, { clase: 'secundario', titulo: 'Vender' }))))
        : h('p', { class: 'ayuda' }, 'No tenés partes sueltas. Lo que está montado en los mechas se cambia en el hangar.')),
      pie(app));
  };
  pintar();
}

export function reclutamiento(app, raiz) {
  const { datos } = app;
  const p = app.partida;
  const costo = datos.reglas.campana.costo_reclutar;
  const lleno = () => p.pilotos.length >= datos.reglas.escuadra_maxima;
  const pintar = () => {
    raiz.innerHTML = '';
    montar(raiz, 
      barraCampana(datos, p, []),
      h('h1', { class: 'titulo-pantalla' }, ico('reclutamiento'), ' Reclutas'),
      lleno() ? h('p', { class: 'ayuda' }, 'El escuadrón está completo (' + datos.reglas.escuadra_maxima + ').') : null,
      h('div', { class: 'candidatos' }, ...p.nodo.candidatos.map((c, i) => {
        const clase = datos.clases[c.clase];
        const pers = textoPersonalidad(datos, c);
        return panel(null,
          h('h2', { class: 'apodo' }, '«' + c.apodo + '»'),
          h('p', { class: 'nombre-real' }, c.nombre),
          h('div', { class: 'chips' }, chip(clase.icono, clase.nombre, clase.descripcion, 'chip-clase'), chip(pers.icono || 'evento', pers.texto, pers.titulo, 'chip-personalidad')),
          h('p', { class: 'ayuda' }, clase.descripcion),
          c.contratado ? h('p', { class: 'texto-bien' }, 'Se suma al escuadrón.')
            : boton('Contratar · ' + costo, () => { contratar(datos, p, i); app.guardar(); pintar(); }, { iconoNombre: 'creditos', clase: 'principal', deshabilitado: p.creditos < costo || lleno() }));
      })),
      pie(app));
  };
  pintar();
}

export function evento(app, raiz) {
  const { datos } = app;
  const p = app.partida;
  const r = p.nodo.resultado || {};
  montar(raiz, 
    barraCampana(datos, p, []),
    h('h1', { class: 'titulo-pantalla' }, ico(p.nodo.tipo === 'descanso' ? 'descanso' : 'evento'), p.nodo.tipo === 'descanso' ? ' Descanso' : ' Señal'),
    panel(null,
      h('p', { class: 'briefing' }, r.texto),
      h('div', { class: 'chips' },
        r.creditos ? chip('creditos', '+' + r.creditos, 'Créditos') : null,
        r.parte ? chip('estrella', r.parte, 'Parte nueva en el depósito') : null,
        ...(r.curados || []).map((n) => chip('trauma', n + ' se recupera', 'Trauma curado', 'chip-bien')))),
    pie(app));
}
