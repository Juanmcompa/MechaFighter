// Nodos que no son misiones: taller, reclutamiento y eventos (incluye el descanso).
import { h, montar, ico, boton, panel, chip, barraCampana, describirParte, nombrePieza, textoPersonalidad, retrato, iconoParte, NOMBRE_RAREZA } from './comun.js';
import { comprar, vender, contratar, seguir, precioPieza, elegirOpcion, comprarCombustible } from '../campana/partida.js';
import { opcionDisponible } from '../campana/dilemas.js';

function pie(app) {
  return h('div', { class: 'acciones' },
    boton('Hangar', () => app.ir('hangar'), { iconoNombre: 'hangar', clase: 'secundario' }),
    boton('Seguir viaje', () => { seguir(app.datos, app.partida); app.guardar(); app.continuar(); }, { iconoNombre: 'play', clase: 'principal' }));
}

// Una señal: el dilema y sus opciones; despues de elegir, lo que paso
function dilema(app, raiz) {
  const { datos } = app;
  const p = app.partida;
  const d = datos.dilemas[p.nodo.dilema];
  const r = p.nodo.resultado;
  const opciones = d.opciones.map((op, i) => ({ op, i, disp: opcionDisponible(datos, p, op) })).filter((x) => x.disp.visible);
  montar(raiz,
    barraCampana(datos, p, []),
    h('h1', { class: 'titulo-pantalla' }, ico('evento'), ' ' + d.titulo),
    panel(null, h('p', { class: 'briefing' }, d.texto),
      r ? null : h('div', { class: 'opciones-dilema' }, ...opciones.map(({ op, i, disp }) => h('button', {
        class: 'opcion-dilema' + (op.requiere && op.requiere.clase ? ' especial' : ''), disabled: !disp.ok,
        onclick: () => { elegirOpcion(datos, p, i); app.guardar(); app.ir('evento'); }
      }, h('strong', {}, op.texto),
      h('small', {}, [
        op.requiere && op.requiere.clase ? '★ ' + datos.clases[op.requiere.clase].nombre + ' en el escuadrón' : null,
        op.chance !== undefined ? 'Riesgo: sale bien ' + (op.chance >= 70 ? 'casi siempre' : op.chance >= 50 ? 'a veces' : 'pocas veces') : null,
        disp.motivo || null].filter(Boolean).join(' · ')))))),
    r ? panel(r.salio === false ? 'Salió mal' : r.salio ? 'Salió bien' : 'Decidido',
      h('p', { class: 'ayuda' }, '«' + r.opcion + '»'),
      h('p', { class: 'briefing' }, r.texto),
      r.cambios.length ? h('div', { class: 'chips' }, ...r.cambios.map((c) => chip(c.icono, c.texto, '', c.bien ? 'chip-bien' : 'chip-alerta'))) : null) : null,
    r ? pie(app) : null);
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
        iconoParte(datos, o.pieza.parte, 'icono-lista'),
        h('div', {}, h('strong', {}, nombrePieza(datos, o.pieza)), h('small', {}, NOMBRE_RAREZA[datos.partes[o.pieza.parte].rareza] + ' · ' + describirParte(datos, o.pieza))),
        o.vendida ? h('span', { class: 'ayuda' }, 'Vendida')
          : boton(String(o.precio), () => { comprar(datos, p, i); app.guardar(); pintar(); }, { iconoNombre: 'creditos', deshabilitado: p.creditos < o.precio, titulo: 'Comprar por ' + o.precio })))),
      ),
      p.combustible !== undefined ? panel('Combustible',
        h('p', { class: 'ayuda' }, 'Tenés ' + p.combustible + '. Cada salto gasta 1; sin combustible, el remolque sale caro.'),
        boton('+1 combustible · ' + datos.reglas.combustible.precio, () => { comprarCombustible(datos, p); app.guardar(); pintar(); },
          { iconoNombre: 'combustible', deshabilitado: p.creditos < datos.reglas.combustible.precio || p.combustible >= datos.reglas.combustible.maximo })) : null,
      panel('Tu depósito', p.inventario.length ? h('ul', { class: 'lista-partes' }, ...p.inventario.map((pz, i) => h('li', { class: 'rareza-' + datos.partes[pz.parte].rareza },
        iconoParte(datos, pz.parte, 'icono-lista'),
        h('div', {}, h('strong', {}, nombrePieza(datos, pz)), h('small', {}, NOMBRE_RAREZA[datos.partes[pz.parte].rareza] + ' · ' + describirParte(datos, pz))),
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
          h('div', { class: 'cabecera-piloto' }, retrato(datos, c, 'retrato-grande'),
            h('div', { class: 'cabecera-nombre' },
              h('h2', { class: 'apodo' }, '«' + c.apodo + '»'),
              h('p', { class: 'nombre-real' }, c.nombre))),
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
  if (p.nodo.dilema) return dilema(app, raiz);
  const r = p.nodo.resultado || {};
  montar(raiz, 
    barraCampana(datos, p, []),
    h('h1', { class: 'titulo-pantalla' }, ico(p.nodo.tipo === 'descanso' ? 'descanso' : 'evento'), p.nodo.tipo === 'descanso' ? ' Descanso' : ' Señal'),
    panel(null,
      h('p', { class: 'briefing' }, r.texto),
      h('div', { class: 'chips' },
        r.creditos ? chip('creditos', '+' + r.creditos, 'Créditos') : null,
        r.parte ? chip('estrella', r.parte, 'Parte nueva en el depósito') : null,
        ...(r.curados || []).map((n) => chip('trauma', n + ' se recupera', 'Trauma curado', 'chip-bien')),
        ...(r.reparados || []).map((n) => chip('llave', 'Mecha de ' + n + ' reparado', 'Reparación gratis', 'chip-bien')))),
    pie(app));
}
