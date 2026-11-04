// Mapa del sector: columnas de nodos unidas por caminos. Desde donde esta el escuadron se puede ir a los nodos
// enlazados de la columna siguiente; los demas quedan atras. Al final espera el jefe del sector.
import { h, montar, ico, boton, botonIcono, panel, barraCampana, chip } from './comun.js';
import { nodosSiguientes, elegirNodo } from '../campana/partida.js';

const NODOS = {
  mision: { icono: 'mision', nombre: 'Contrato' },
  jefe: { icono: 'jefe', nombre: 'Jefe' },
  taller: { icono: 'taller', nombre: 'Taller' },
  reclutamiento: { icono: 'reclutamiento', nombre: 'Reclutas' },
  evento: { icono: 'evento', nombre: 'Señal' },
  descanso: { icono: 'descanso', nombre: 'Descanso' }
};

export function sectores(app, raiz) {
  const { datos } = app;
  const p = app.partida;
  const s = p.sectores[p.sector];
  let elegido = null;

  const detalle = h('div', { class: 'detalle-nodo' });
  const mapa = h('div', { class: 'mapa-sector', role: 'list' });
  const NS = 'http://www.w3.org/2000/svg';
  const lineas = document.createElementNS(NS, 'svg');
  lineas.setAttribute('class', 'caminos');
  lineas.setAttribute('aria-hidden', 'true');
  const botones = []; // [columna][i] -> boton, para trazar los caminos

  const pintar = () => {
    mapa.innerHTML = '';
    mapa.append(lineas);
    const alcanzables = nodosSiguientes(p);
    s.columnas.forEach((col, c) => {
      const disponible = c === p.columna + 1;
      const columna = h('div', { class: 'columna-sector' + (disponible ? ' disponible' : c <= p.columna ? ' pasada' : '') });
      botones[c] = [];
      col.forEach((nodo, i) => {
        const info = NODOS[nodo.tipo];
        const sel = elegido && elegido.c === c && elegido.i === i;
        const llega = disponible && alcanzables.includes(nodo);
        const b = h('button', {
          class: 'nodo nodo-' + nodo.tipo + (nodo.visitado ? ' visitado' : '') + (sel ? ' elegido' : '') + (disponible && !llega ? ' inalcanzable' : '') +
            (c === p.columna && i === p.posicion ? ' aca' : ''),
          disabled: !llega,
          'aria-label': info.nombre + (nodo.mision ? ': ' + nodo.mision.nombre : ''),
          title: info.nombre + (nodo.mision ? ': ' + nodo.mision.nombre : ''),
          onclick: () => { elegido = { c, i }; pintar(); mostrar(nodo, i); }
        }, ico(nodo.mision && nodo.tipo === 'mision' ? nodo.mision.icono : info.icono),
        nodo.mision ? h('span', { class: 'pips' }, '▮'.repeat(nodo.mision.dificultad)) : null);
        botones[c][i] = b;
        columna.append(b);
      });
      mapa.append(columna);
    });
    requestAnimationFrame(trazar);
  };

  // Los caminos se dibujan sobre las posiciones reales de los botones (sirve igual horizontal o vertical)
  const trazar = () => {
    const caja = mapa.getBoundingClientRect();
    if (!caja.width) return;
    lineas.setAttribute('viewBox', '0 0 ' + caja.width + ' ' + caja.height);
    lineas.setAttribute('width', caja.width); lineas.setAttribute('height', caja.height);
    lineas.innerHTML = '';
    const centro = (b) => { const r = b.getBoundingClientRect(); return [r.left + r.width / 2 - caja.left, r.top + r.height / 2 - caja.top]; };
    s.columnas.forEach((col, c) => col.forEach((nodo) => (nodo.sig || []).forEach((j) => {
      const a = botones[c] && botones[c][nodo.i], b = botones[c + 1] && botones[c + 1][j];
      if (!a || !b) return;
      const [x1, y1] = centro(a), [x2, y2] = centro(b);
      const hecho = nodo.visitado && s.columnas[c + 1][j].visitado;
      const abierto = c === p.columna && nodo.i === p.posicion;
      const l = document.createElementNS(NS, 'line');
      l.setAttribute('x1', x1); l.setAttribute('y1', y1); l.setAttribute('x2', x2); l.setAttribute('y2', y2);
      l.setAttribute('class', hecho ? 'hecho' : abierto || (p.columna < 0 && c === -1) ? 'abierto' : '');
      lineas.append(l);
    })));
  };
  const alCambiarTamano = () => trazar();
  window.addEventListener('resize', alCambiarTamano);
  const reloj = setInterval(() => { if (!mapa.isConnected) { window.removeEventListener('resize', alCambiarTamano); clearInterval(reloj); } }, 2000);

  const mostrar = (nodo, i) => {
    detalle.innerHTML = '';
    const info = NODOS[nodo.tipo];
    const m = nodo.mision;
    detalle.append(panel(m ? m.nombre : info.nombre,
      m ? h('p', {}, m.descripcion) : h('p', {}, textoNodo(nodo.tipo, datos)),
      m ? h('div', { class: 'chips' },
        chip('calavera', m.cantidadEnemigos + ' hostiles', 'Enemigos'),
        chip('mira', 'Nivel ' + m.nivel, 'Nivel de los enemigos'),
        chip('creditos', '+' + m.recompensa.creditos, 'Pago'),
        chip('estrella', m.recompensa.botin + ' partes', 'Botín'),
        m.niebla ? chip('ojo', 'Niebla', 'No se ve lo que no tenés a la vista') : null,
        ...(m.condiciones || []).map((id) => chip(datos.condiciones_mision[id].icono, datos.condiciones_mision[id].nombre, datos.condiciones_mision[id].descripcion, 'chip-alerta'))) : null,
      m ? h('p', { class: 'ayuda' }, ico('mapa'), ' ' + datos.mapas[m.mapa].nombre) : null,
      m && m.jefe ? h('p', { class: 'ayuda' }, ico('ojo'), ' ' + textoInteligencia(datos, s)) : null,
      m && nodo.tipo === 'mision' && s.inteligencia !== undefined ? h('p', { class: 'ayuda' }, ico('ojo'), ' Ganarla suma inteligencia sobre ' + s.jefe + '.') : null,
      boton(m ? 'Aceptar contrato' : 'Ir', () => {
        elegirNodo(datos, p, nodosSiguientes(p).indexOf(nodo));
        app.guardar();
        app.continuar();
      }, { iconoNombre: 'play', clase: 'principal' })));
  };

  montar(raiz, 
    barraCampana(datos, p, [
      boton('Hangar', () => app.ir('hangar'), { iconoNombre: 'hangar' }),
      botonIcono('menu', 'Menú principal', () => app.ir('portada'))
    ]),
    h('h1', { class: 'titulo-pantalla' }, s.nombre + (s.numero ? ' · ' + s.numero + '/' + s.de : '')),
    s.objetivo ? panel('Objetivo del sector',
      h('p', { class: 'briefing' }, s.objetivo),
      h('div', { class: 'intel' }, ico('ojo'), h('span', {}, 'Inteligencia sobre ' + s.jefe + ': '),
        h('span', { class: 'pips-intel' }, ...Array.from({ length: datos.sectores.campana_base.inteligencia.maxima }, (_, k) => h('i', { class: k < s.inteligencia ? 'lleno' : '' })))),
      h('p', { class: 'ayuda' }, textoInteligencia(datos, s))) : null,
    h('p', { class: 'ayuda' }, 'Elegí el próximo destino siguiendo los caminos. Cada salto gasta 1 de combustible. Lo que no elijas queda atrás.'),
    p.combustible === 0 ? h('p', { class: 'aviso-inicial' }, ico('combustible'), ' Sin combustible: el próximo salto es remolcado (−' + datos.reglas.combustible.remolque_creditos +
      ' créditos y los mechas pierden ' + datos.reglas.combustible.remolque_danio_pct + '%). Buscá combustible en un taller o en una señal.') : null,
    h('div', { class: 'mapa-envoltura' }, mapa),
    detalle,
    p.ultimoInforme && p.ultimoInforme.caidos.length
      ? h('p', { class: 'recuerdo' }, ico('lapida'), ' En memoria de ' + p.ultimoInforme.caidos.join(', ') + '.') : null
  );
  pintar();
  // que se vea la columna que toca elegir (en el celular el mapa es vertical y largo)
  const disponible = mapa.querySelector('.columna-sector.disponible');
  if (disponible && disponible.scrollIntoView) requestAnimationFrame(() => disponible.scrollIntoView({ block: 'center', inline: 'center' }));
  // Si hay un solo camino, ya queda elegido
  const opciones = nodosSiguientes(p);
  if (opciones.length === 1) { elegido = { c: p.columna + 1, i: opciones[0].i ?? 0 }; pintar(); mostrar(opciones[0], 0); }
}

function textoInteligencia(datos, s) {
  const I = datos.sectores.campana_base.inteligencia;
  if (s.inteligencia === undefined) return '';
  if (!s.inteligencia) return 'Sin datos: si llegan así al jefe, los van a estar esperando con refuerzos.';
  if (s.inteligencia < I.datos_desde) return 'Datos sueltos. Una misión más y llegan sabiendo dónde está.';
  return 'Saben dónde está y qué tiene: llegan sin niebla y atentos.';
}

function textoNodo(tipo, datos) {
  switch (tipo) {
    case 'taller': return 'Un desarmadero con partes a la venta. También compran lo que te sobra.';
    case 'reclutamiento': return 'Pilotos sin trabajo buscan escuadrón. Cada uno cuesta ' + datos.reglas.campana.costo_reclutar + ' créditos.';
    case 'evento': return 'Una señal sin identificar. Puede ser cualquier cosa.';
    case 'descanso': return 'Un muelle tranquilo. Ayuda a sanar los traumas.';
  }
  return '';
}
