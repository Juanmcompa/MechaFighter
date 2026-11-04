// Antes de la mision: el briefing, el plano del mapa, contra que se enfrentan y quienes van.
import { h, montar, ico, boton, panel, chip, barraCampana, retrato } from './comun.js';
import { dibujarMapa } from './vistaMapa.js';
import { escuadronParaMision } from '../campana/partida.js';

// Como llega cada uno (ver campana/animo.js)
const ICONO_NOTA = { confiado: 'rayo', nervioso: 'trauma', atento: 'ojo', perdido: 'mapa', rivales: 'espadas', amigos: 'vinculo' };

export function preparacion(app, raiz) {
  const { datos } = app;
  const p = app.partida;
  const m = p.nodo.mision;
  const plano = h('canvas', { width: 480, height: 320, class: 'plano', 'aria-label': 'Plano del mapa' });

  // Cuantos de cada enemigo
  const cuenta = {};
  for (const ola of m.oleadas) for (const id of ola) cuenta[id] = (cuenta[id] || 0) + 1;
  for (const e of m.emboscadas) for (const id of e.unidades) cuenta[id] = (cuenta[id] || 0) + 1;
  const enemigos = Object.entries(cuenta).map(([id, n]) => {
    const u = datos.enemigos.unidades[id];
    const icono = u.cuerpo === 'mutante' ? 'colmillo' : u.cuerpo === 'mecha' ? 'jefe' : 'piloto';
    return chip(icono, (m.niebla ? '?' : n) + ' × ' + u.nombre + (m.lider === id ? ' (líder)' : ''), u.nombre);
  });
  const escuadron = escuadronParaMision(datos, p);

  montar(raiz, 
    barraCampana(datos, p, []),
    h('h1', { class: 'titulo-pantalla' }, ico(m.icono), ' ', m.nombre),
    h('div', { class: 'columnas-prep' },
      h('div', {},
        panel('Briefing',
          h('p', { class: 'briefing' }, m.descripcion),
          m.jefe ? h('p', { class: 'cita-jefe' }, '«' + m.jefe.frase + '»') : null,
          m.jefe ? h('p', { class: 'ayuda' }, ico('ojo'), ' Inteligencia reunida: ' + (m.inteligencia || 0) + '. ' +
            (!m.inteligencia ? 'Llegan a ciegas: los esperan con refuerzos.' : m.condiciones.includes('inteligencia') ? 'Saben dónde está: sin niebla y atentos.' : 'Datos sueltos.')) : null,
          h('div', { class: 'chips' },
            chip('mira', 'Nivel ' + m.nivel, 'Nivel de los enemigos'),
            chip('creditos', '+' + m.recompensa.creditos, 'Pago si ganan'),
            chip('estrella', m.recompensa.botin + ' partes', 'Botín si ganan'),
            m.niebla ? chip('ojo', 'Niebla', 'Solo ven lo que tienen a la vista') : null,
            m.oleadas.length > 1 ? chip('calavera', m.oleadas.length + ' oleadas', 'Oleadas') : null)),
        (m.condiciones || []).length ? panel('Atención',
          h('ul', { class: 'condiciones' }, ...m.condiciones.map((id) => {
            const c = datos.condiciones_mision[id];
            return h('li', {}, ico(c.icono), h('div', {}, h('strong', {}, c.nombre), h('span', {}, c.descripcion)));
          }))) : null,
        panel('Mapa · ' + datos.mapas[m.mapa].nombre, h('p', { class: 'ayuda' }, datos.mapas[m.mapa].descripcion || '')),
        panel('Hostiles', m.niebla ? h('p', { class: 'ayuda' }, 'Reportes confusos. Esperen emboscadas.') : null, h('div', { class: 'chips' }, ...enemigos)),
        p.nodo.animo && p.nodo.animo.notas.length ? panel('Ánimo del escuadrón',
          h('ul', { class: 'condiciones animo' }, ...p.nodo.animo.notas.map((n) => h('li', { class: 'animo-' + n.tipo }, ico(ICONO_NOTA[n.tipo] || 'piloto'), h('span', {}, n.texto)))),
          h('p', { class: 'ayuda' }, 'Si no te convence cómo viene alguno, dejalo en el banco desde el hangar.')) : null,
        panel('Escuadrón',
          h('ul', { class: 'lista-escuadron' }, ...escuadron.map(({ piloto }) => h('li', {},
            retrato(datos, piloto, 'retrato-mini'), ico(datos.clases[piloto.clase].icono), h('strong', {}, piloto.apodo), ' · ' + datos.clases[piloto.clase].nombre + ' · niv ' + piloto.nivel,
            piloto.traumas.length ? chip('trauma', String(piloto.traumas.length), 'Con traumas', 'chip-trauma') : null)))),
        h('div', { class: 'acciones' },
          boton('Hangar', () => app.ir('hangar'), { iconoNombre: 'hangar', clase: 'secundario' }),
          boton('Desplegar', () => app.ir('batalla'), { iconoNombre: 'play', clase: 'principal' }))),
      panel('Plano', plano, h('ul', { class: 'leyenda' },
        h('li', {}, h('i', { style: 'background:#4a8fd1' }), 'ustedes'),
        h('li', {}, h('i', { style: 'background:#c4473b' }), 'entrada enemiga'),
        h('li', {}, h('i', { style: 'background:#e0a43a' }), 'zonas')))));
  dibujarMapa(plano, datos.mapas[m.mapa]);
}
