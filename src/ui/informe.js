// Informe despues de la mision: quien volvio, quien no, que hizo cada uno, que aprendieron y que se llevaron.
// Las tarjetas de los pilotos arrancan cerradas; tocando una se abre con su dano, sus bajas y que ordenes uso.
import { h, montar, ico, boton, botonIcono, panel, chip, retrato } from './comun.js';
import { costoReparacion, reparar } from '../campana/partida.js';
import { existeIcono } from './iconos.js';

const ZONA_TXT = { brazo_izq: 'brazo izq.', brazo_der: 'brazo der.', piernas: 'piernas', cabeza: 'cabeza' };
const MOTIVOS = { salvo: 'uno salvó al otro', cubrio: 'se cubrieron', huyo: 'alguien huyó', discusion: 'discutieron por radio' };
const ABIERTA = { id: null };

export function informe(app, raiz, inf) {
  const { datos } = app;
  const p = app.partida;
  inf = inf || p.ultimoInforme;
  const G = datos.gambits;
  const nuevaCosa = (n) => {
    if (n.tipo === 'cicatriz') return chip('cicatriz', datos.cicatrices[n.id].nombre, 'Cicatriz nueva', 'chip-cicatriz');
    if (n.tipo === 'trauma') return chip('trauma', datos.traumas[n.id].nombre, 'Trauma nuevo', 'chip-trauma');
    return chip('medalla', datos.medallas[n.id].nombre, 'Medalla', 'chip-medalla');
  };
  const icoDe = (cat, id) => { const o = G[cat][id]; return ico(o && existeIcono(o.icono) ? o.icono : 'evento'); };
  const nombreOrden = (o) => {
    const c = G.condiciones[o.condicion], a = G.acciones[o.accion], ob = G.objetivos[o.objetivo];
    return (c ? c.texto.replace(/\{\w+\}/g, 'N') : '?') + ' › ' + (a ? a.texto : '?') + (ob && o.objetivo !== 'yo' ? ' › ' + ob.texto.toLowerCase() : '');
  };

  const lista = h('div', { class: 'inf-cartas' });
  const pintarCartas = () => lista.replaceChildren(...inf.pilotos.map((l) => {
    const caido = l.estado === 'muerto';
    const abierta = ABIERTA.id === l.id;
    const conDatos = l.hecho !== undefined;
    const resumen = caido ? 'Caído en combate'
      : l.estado === 'herido' ? 'Herido de gravedad, sobrevive'
      : conDatos ? (l.reparado > l.hecho ? 'Reparó ' + l.reparado : l.hecho + ' daño') + (l.bajas ? ' · ' + l.bajas + (l.bajas === 1 ? ' baja' : ' bajas') : '')
      : 'Vuelve';
    const ordenes = l.ordenes || [];
    const max = Math.max(1, ...ordenes.map((o) => o.veces));
    const nunca = ordenes.map((o, i) => (o.veces ? null : i + 1)).filter(Boolean);
    const cuerpo = !abierta ? null : h('div', { class: 'inf-detalle' },
      conDatos ? h('div', { class: 'inf-numeros' },
        h('div', {}, h('strong', { class: 'bien' }, String(l.hecho)), h('small', {}, 'daño hecho')),
        h('div', {}, h('strong', { class: 'mal' }, String(l.recibido)), h('small', {}, 'recibido')),
        l.reparado ? h('div', {}, h('strong', { class: 'azul' }, String(l.reparado)), h('small', {}, 'reparado'))
          : h('div', {}, h('strong', {}, String(l.bajas || 0)), h('small', {}, 'bajas'))) : null,
      ordenes.length ? h('div', { class: 'inf-ordenes' },
        h('small', { class: 'inf-rotulo' }, 'SUS ÓRDENES'),
        ...ordenes.map((o, i) => h('div', { class: 'inf-orden' + (o.veces ? '' : ' nunca'), title: nombreOrden(o) },
          h('span', { class: 'inf-n' }, String(i + 1)),
          h('span', { class: 'inf-iconos', role: 'img', 'aria-label': nombreOrden(o) },
            h('i', { class: 'c' }, icoDe('condiciones', o.condicion)), h('i', { class: 'a' }, icoDe('acciones', o.accion)), h('i', { class: 'o' }, icoDe('objetivos', o.objetivo))),
          h('span', { class: 'inf-pista' }, h('i', { style: 'width:' + Math.round((o.veces * 100) / max) + '%' })),
          h('span', { class: 'inf-veces' }, String(o.veces)))),
        nunca.length ? h('p', { class: 'inf-nota' }, nunca.length === 1 ? 'La orden ' + nunca[0] + ' nunca se cumplió.'
          : 'Las órdenes ' + nunca.slice(0, -1).join(', ') + ' y ' + nunca[nunca.length - 1] + ' nunca se cumplieron.') : null) : null,
      !caido && l.mechaVida !== undefined && (l.mechaVida < 100 || l.rotas.length) ? h('p', { class: 'ip-mecha' + (l.mechaVida < 40 || l.rotas.length ? ' grave' : '') },
        ico('llave'), ' Mecha al ' + l.mechaVida + '%' + (l.rotas.length ? ' · roto: ' + l.rotas.map((z) => ZONA_TXT[z]).join(', ') : '')) : null,
      caido ? h('p', { class: 'epitafio' }, l.nombre + '. ' + (l.epitafio || 'Cayó en combate.')) : null,
      !caido && l.momentos && l.momentos.length ? h('ul', { class: 'hoja-servicio corta' }, ...l.momentos.map((t) => h('li', {}, t))) : null);
    return h('article', { class: 'inf-carta' + (caido ? ' caido' : l.estado === 'herido' ? ' herido' : '') + (abierta ? ' abierta' : '') },
      h('button', { class: 'inf-cabeza', 'aria-expanded': abierta ? 'true' : 'false', onclick: () => { ABIERTA.id = abierta ? null : l.id; pintarCartas(); } },
        retrato(datos, l, 'retrato-chico' + (caido ? ' caido' : '')),
        h('span', { class: 'inf-nombre' },
          h('strong', {}, l.apodo, l.subioNivel ? h('em', {}, ' ▲ NIVEL') : null),
          h('small', {}, resumen)),
        !caido ? h('span', { class: 'inf-xp' }, '+' + l.xp + ' XP') : ico('lapida'),
        h('span', { class: 'inf-flecha', 'aria-hidden': 'true' }, abierta ? '▴' : '▾')),
      l.nuevas.length ? h('div', { class: 'chips inf-nuevas' }, ...l.nuevas.map(nuevaCosa)) : null,
      cuerpo);
  }));
  pintarCartas();

  // Reparar a todos los que volvieron, mientras alcance la plata
  const costoTotal = () => p.pilotos.reduce((s, pi) => s + costoReparacion(datos, pi).total, 0);
  const pie = h('div', { class: 'inf-pie' });
  const pintarPie = () => {
    const total = costoTotal();
    const alcanza = p.pilotos.some((pi) => { const c = costoReparacion(datos, pi).total; return c && p.creditos >= c; });
    pie.replaceChildren(
      total ? boton('Reparar ₵' + total, () => {
        for (const pi of p.pilotos) { const c = costoReparacion(datos, pi).total; if (c && p.creditos >= c) reparar(datos, p, pi.id, 'todo'); }
        app.guardar(); pintarPie();
      }, { iconoNombre: 'llave', clase: 'secundario reparar-todo', deshabilitado: !alcanza, titulo: 'Reparar los mechas (tenés ₵' + p.creditos + ')' }) : null,
      p.estado !== 'fin' ? botonIcono('hangar', 'Ir al hangar', () => app.ir('hangar'), 'inf-hangar') : null,
      boton(p.estado === 'fin' ? 'Final de la campaña' : 'Seguir', () => app.continuar(), { iconoNombre: 'play', clase: 'principal' }));
  };
  pintarPie();

  const nemesisCayo = inf.nemesis && inf.nemesis.muerto;
  montar(raiz,
    h('header', { class: 'inf-encabezado' },
      h('small', {}, 'INFORME DE MISIÓN'),
      h('h1', { class: 'titulo-pantalla ' + (inf.victoria ? 'texto-bien' : 'texto-mal') }, inf.victoria ? 'Misión cumplida' : 'Misión fallida'),
      h('p', {}, inf.mision + (datos.textos.motivos_fin[inf.motivo] ? ' · ' + datos.textos.motivos_fin[inf.motivo] : '')),
      h('div', { class: 'inf-chips' },
        h('span', { class: 'ch-cred' }, '+₵ ' + inf.creditos),
        inf.botin.length ? h('span', { class: 'ch-botin' }, '+' + inf.botin.length + (inf.botin.length === 1 ? ' pieza' : ' piezas')) : null,
        inf.puntaje ? h('span', { class: 'ch-puntos' }, '+' + inf.puntaje + ' pts') : null,
        nemesisCayo ? h('span', { class: 'ch-bien' }, 'Némesis caído') : null)),
    inf.sectorCerrado ? h('p', { class: 'inf-sector' }, ico('estrella'), ' Cayó el jefe de ' + inf.sectorCerrado + '. La nave cruza al sector siguiente.') : null,
    inf.bandos && (inf.bandos.cambios.length || inf.bandos.frente || inf.bandos.amenaza) ? h('section', { class: 'inf-bandos', 'aria-label': 'Bandos' },
      ...inf.bandos.cambios.map((c) => h('span', { class: 'inf-bando' + (c.despues > c.antes ? ' sube' : ' baja') },
        h('b', { style: 'color:' + c.color }, c.nombre), ' ' + (c.despues > c.antes ? '+' : '−') + Math.abs(c.despues - c.antes) +
        (c.antesEscalon !== c.despuesEscalon ? ' · ahora te ven ' + c.despuesEscalon.toLowerCase() : ''))),
      inf.bandos.frente ? h('span', { class: 'inf-bando sube' }, 'El frente se corrió: ' + inf.bandos.frente.antes + '% → ' + inf.bandos.frente.despues + '%') : null,
      inf.bandos.amenaza ? h('span', { class: 'inf-bando sube' }, inf.bandos.amenaza) : null) : null,
    lista,
    inf.nemesis ? panel('Némesis',
      h('div', { class: 'nemesis' }, retrato(app.datos, inf.nemesis, 'retrato-mini'), h('strong', { class: 'apodo' }, '«' + inf.nemesis.apodo + '»')),
      ...inf.nemesis.textos.map((t) => h('p', { class: inf.nemesis.muerto ? 'briefing bien' : 'briefing' }, t))) : null,
    inf.nemesisNuevo ? panel('Nace un némesis',
      h('div', { class: 'nemesis' }, retrato(app.datos, inf.nemesisNuevo, 'retrato-mini'), h('strong', { class: 'apodo' }, '«' + inf.nemesisNuevo.apodo + '»')),
      h('p', { class: 'briefing' }, inf.nemesisNuevo.intro),
      h('p', { class: 'ayuda' }, 'Va a volver. Y va a venir preparado.')) : null,
    inf.tareas && inf.tareas.length ? panel('En la base',
      h('ul', { class: 'condiciones' }, ...inf.tareas.map((t) => h('li', {}, ico(t.icono), h('div', {}, h('strong', {}, '«' + t.apodo + '»'), h('span', {}, t.texto)))))) : null,
    inf.rescatado ? panel('Rescate',
      h('p', {}, ico('vinculo'), ' Entre los restos encontraron a «' + inf.rescatado + '», vivo. Vuelve al escuadrón.')) : null,
    inf.inteligencia ? panel('Inteligencia',
      h('p', {}, ico('ojo'), ' Averiguaron algo más sobre ' + inf.inteligencia.jefe + ' (' + inf.inteligencia.valor + '/' + inf.inteligencia.maxima + ').')) : null,
    inf.relaciones && inf.relaciones.length ? panel('Relaciones',
      h('ul', { class: 'relaciones' }, ...inf.relaciones.map((c) => h('li', { class: c.delta >= 0 ? 'amigo' : 'rival' },
        ico(c.delta >= 0 ? 'vinculo' : 'espadas'), h('strong', {}, c.a + ' y ' + c.b), ' ' + (c.delta > 0 ? '+' : '') + c.delta + ' · ' +
        c.motivos.filter((m) => MOTIVOS[m]).map((m) => MOTIVOS[m]).join(', '))))) : null,
    panel('Botín',
      inf.trofeo ? h('p', { class: 'trofeo' }, ico('estrella'), ' Trofeo del jefe: ' + inf.trofeo) : null,
      inf.botin.length ? h('ul', { class: 'lista-simple' }, ...inf.botin.map((b) => h('li', {}, ico('estrella'), ' ' + b))) : h('p', { class: 'ayuda' }, inf.victoria ? 'Sin partes esta vez.' : 'Sin pago ni botín.'),
      inf.partesRescatadas.length ? h('p', { class: 'ayuda' }, 'Rescatado de los caídos: ' + inf.partesRescatadas.join(', ') + '.') : null,
      inf.saqueo && inf.saqueo.length ? h('ul', { class: 'lista-simple saqueo' }, ...inf.saqueo.map((b) => h('li', {}, ico('mira'), ' Saqueado entero: ' + b))) : null,
      inf.chatarra ? h('p', { class: 'ayuda' }, ico('llave'), ' Chatarra de los mechas destrozados: +' + inf.chatarra + ' créditos.' +
        (inf.saqueo && inf.saqueo.length ? '' : ' Para llevarte sus armas enteras, apuntá a la cabina.')) : null),
    pie);
}
