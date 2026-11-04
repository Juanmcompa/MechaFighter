// Informe despues de la mision: quien volvio, quien no, que aprendieron y que se llevaron.
import { h, montar, ico, boton, panel, chip, retrato } from './comun.js';

const ZONA_TXT = { brazo_izq: 'brazo izq.', brazo_der: 'brazo der.', piernas: 'piernas', cabeza: 'cabeza' };
const MOTIVOS = { salvo: 'uno salvó al otro', cubrio: 'se cubrieron', huyo: 'alguien huyó', discusion: 'discutieron por radio' };

export function informe(app, raiz, inf) {
  const { datos } = app;
  const p = app.partida;
  inf = inf || p.ultimoInforme;
  const nuevaCosa = (n) => {
    if (n.tipo === 'cicatriz') return chip('cicatriz', datos.cicatrices[n.id].nombre, 'Cicatriz nueva', 'chip-cicatriz');
    if (n.tipo === 'trauma') return chip('trauma', datos.traumas[n.id].nombre, 'Trauma nuevo', 'chip-trauma');
    return chip('medalla', datos.medallas[n.id].nombre, 'Medalla', 'chip-medalla');
  };
  montar(raiz, 
    h('h1', { class: 'titulo-pantalla ' + (inf.victoria ? 'texto-bien' : 'texto-mal') }, inf.victoria ? 'Misión cumplida' : 'Misión fallida'),
    h('p', { class: 'ayuda' }, inf.mision + ' · ' + (datos.textos.motivos_fin[inf.motivo] || '')),
    panel('Escuadrón',
      h('ul', { class: 'informe-pilotos' }, ...inf.pilotos.map((l) => h('li', { class: 'estado-' + l.estado },
        h('div', { class: 'ip-cabeza' },
          retrato(datos, l, 'retrato-chico' + (l.estado === 'muerto' ? ' caido' : '')),
          ico(l.estado === 'muerto' ? 'lapida' : datos.clases[l.clase].icono),
          h('strong', {}, l.apodo),
          h('span', { class: 'ip-estado' }, l.estado === 'muerto' ? 'Caído en combate' : l.estado === 'herido' ? 'Herido de gravedad, sobrevive' : 'Vuelve'),
          l.estado !== 'muerto' ? h('span', { class: 'ip-xp' }, '+' + l.xp + ' XP' + (l.subioNivel ? ' · ¡sube de nivel!' : '')) : null,
          l.bajas ? h('span', { class: 'ip-bajas' }, ico('calavera'), String(l.bajas)) : null),
        l.estado !== 'muerto' && l.mechaVida !== undefined && (l.mechaVida < 100 || l.rotas.length) ? h('p', { class: 'ip-mecha' + (l.mechaVida < 40 || l.rotas.length ? ' grave' : '') },
          ico('llave'), ' Mecha al ' + l.mechaVida + '%' + (l.rotas.length ? ' · roto: ' + l.rotas.map((z) => ZONA_TXT[z]).join(', ') : '') + ' · reparar: ' + l.costoReparar + ' cr') : null,
        l.estado === 'muerto' ? h('p', { class: 'epitafio' }, l.nombre + '. ' + (l.epitafio || 'Cayó en combate.')) : null,
        l.estado !== 'muerto' && l.momentos && l.momentos.length ? h('ul', { class: 'hoja-servicio corta' }, ...l.momentos.map((t) => h('li', {}, t))) : null,
        l.nuevas.length ? h('div', { class: 'chips' }, ...l.nuevas.map(nuevaCosa)) : null)))),
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
      h('div', { class: 'chips' },
        chip('creditos', '+' + inf.creditos, 'Créditos'),
        chip('puntaje', '+' + inf.puntaje, 'Puntaje')),
      inf.trofeo ? h('p', { class: 'trofeo' }, ico('estrella'), ' Trofeo del jefe: ' + inf.trofeo) : null,
      inf.botin.length ? h('ul', { class: 'lista-simple' }, ...inf.botin.map((b) => h('li', {}, ico('estrella'), ' ' + b))) : h('p', { class: 'ayuda' }, inf.victoria ? 'Sin partes esta vez.' : 'Sin pago ni botín.'),
      inf.partesRescatadas.length ? h('p', { class: 'ayuda' }, 'Rescatado de los caídos: ' + inf.partesRescatadas.join(', ') + '.') : null,
      inf.saqueo && inf.saqueo.length ? h('ul', { class: 'lista-simple saqueo' }, ...inf.saqueo.map((b) => h('li', {}, ico('mira'), ' Saqueado entero: ' + b))) : null,
      inf.chatarra ? h('p', { class: 'ayuda' }, ico('llave'), ' Chatarra de los mechas destrozados: +' + inf.chatarra + ' créditos.' +
        (inf.saqueo && inf.saqueo.length ? '' : ' Para llevarte sus armas enteras, apuntá a la cabina.')) : null),
    h('div', { class: 'acciones' },
      boton(p.estado === 'fin' ? 'Final de la campaña' : 'Seguir', () => app.continuar(), { iconoNombre: 'play', clase: 'principal' }),
      p.estado !== 'fin' ? boton('Hangar', () => app.ir('hangar'), { iconoNombre: 'hangar', clase: 'secundario' }) : null));
}
