// Nodos que no son misiones: reclutamiento y eventos (incluye el refugio). Las paradas tecnicas: parada.js.
import { h, montar, ico, boton, panel, chip, barraCampana, describirParte, nombrePieza, textoPersonalidad, retrato, iconoParte, NOMBRE_RAREZA } from './comun.js';
import { contratar, seguir, elegirOpcion } from '../campana/partida.js';
import { limitePilotos } from '../campana/brujula.js';
import { opcionDisponible, dilemaAbierto, textoDilema } from '../campana/dilemas.js';

function pie(app) {
  return h('div', { class: 'acciones' },
    boton('Hangar', () => app.ir('hangar'), { iconoNombre: 'hangar', clase: 'secundario' }),
    boton(app.partida.suceso ? 'Seguir el salto' : 'Seguir viaje', () => { seguir(app.datos, app.partida); app.guardar(); app.continuar(); }, { iconoNombre: 'play', clase: 'principal' }));
}

// Una señal: el dilema y sus opciones; despues de elegir, lo que paso
function dilema(app, raiz) {
  const { datos } = app;
  const p = app.partida;
  const donde = dilemaAbierto(p);
  const d = datos.dilemas[donde.dilema];
  const r = donde.resultado;
  const T = (t) => textoDilema(datos, p, t);
  const opciones = d.opciones.map((op, i) => ({ op, i, disp: opcionDisponible(datos, p, op) })).filter((x) => x.disp.visible);
  montar(raiz,
    barraCampana(datos, p, []),
    h('h1', { class: 'titulo-pantalla' }, ico(p.suceso ? 'nave' : 'evento'), ' ' + T(d.titulo)),
    p.suceso ? h('p', { class: 'ayuda' }, 'En pleno salto · después siguen viaje a donde iban.') : null,
    panel(null, h('p', { class: 'briefing' }, T(d.texto)),
      r ? null : h('div', { class: 'opciones-dilema' }, ...opciones.map(({ op, i, disp }) => h('button', {
        class: 'opcion-dilema' + (op.requiere && op.requiere.clase ? ' especial' : ''), disabled: !disp.ok,
        onclick: () => { elegirOpcion(datos, p, i); app.guardar(); app.ir('evento'); }
      }, h('strong', {}, T(op.texto)),
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

export function reclutamiento(app, raiz) {
  const { datos } = app;
  const p = app.partida;
  const costo = datos.reglas.campana.costo_reclutar;
  const lleno = () => p.pilotos.length >= limitePilotos(datos, p);
  const pintar = () => {
    raiz.innerHTML = '';
    montar(raiz, 
      barraCampana(datos, p, []),
      h('h1', { class: 'titulo-pantalla' }, ico('reclutamiento'), ' Reclutas'),
      lleno() ? h('p', { class: 'ayuda' }, 'No entran más pilotos en la nave (' + limitePilotos(datos, p) + '). El hangar de la nodriza se puede agrandar en las paradas.') : null,
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
  if (dilemaAbierto(p)) return dilema(app, raiz);
  if (!p.nodo) return app.continuar();
  const r = p.nodo.resultado || {};
  montar(raiz, 
    barraCampana(datos, p, []),
    h('h1', { class: 'titulo-pantalla' }, ico(p.nodo.tipo === 'descanso' ? 'descanso' : 'evento'), p.nodo.tipo === 'descanso' ? ' Refugio' : ' Señal'),
    panel(null,
      h('p', { class: 'briefing' }, r.texto),
      h('div', { class: 'chips' },
        r.creditos ? chip('creditos', '+' + r.creditos, 'Créditos') : null,
        r.parte ? chip('estrella', r.parte, 'Parte nueva en el depósito') : null,
        ...(r.curados || []).map((n) => chip('trauma', n + ' se recupera', 'Trauma curado', 'chip-bien')),
        ...(r.reparados || []).map((n) => chip('llave', 'Mecha de ' + n + ' reparado', 'Reparación gratis', 'chip-bien')))),
    pie(app));
}
