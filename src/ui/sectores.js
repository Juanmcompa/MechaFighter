// Mapa del sector: columnas de nodos. Se elige uno de la columna siguiente; los demas quedan atras.
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

  const pintar = () => {
    mapa.innerHTML = '';
    s.columnas.forEach((col, c) => {
      const disponible = c === p.columna + 1;
      const columna = h('div', { class: 'columna-sector' + (disponible ? ' disponible' : c <= p.columna ? ' pasada' : '') });
      col.forEach((nodo, i) => {
        const info = NODOS[nodo.tipo];
        const sel = elegido && elegido.c === c && elegido.i === i;
        const b = h('button', {
          class: 'nodo nodo-' + nodo.tipo + (nodo.visitado ? ' visitado' : '') + (sel ? ' elegido' : ''),
          disabled: !disponible,
          'aria-label': info.nombre + (nodo.mision ? ': ' + nodo.mision.nombre : ''),
          title: info.nombre + (nodo.mision ? ': ' + nodo.mision.nombre : ''),
          onclick: () => { elegido = { c, i }; pintar(); mostrar(nodo, i); }
        }, ico(nodo.mision && nodo.tipo === 'mision' ? nodo.mision.icono : info.icono),
        nodo.mision ? h('span', { class: 'pips' }, '▮'.repeat(nodo.mision.dificultad)) : null);
        columna.append(b);
      });
      mapa.append(columna);
    });
  };

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
        m.niebla ? chip('ojo', 'Niebla', 'No se ve lo que no tenés a la vista') : null) : null,
      boton(m ? 'Aceptar contrato' : 'Ir', () => {
        elegirNodo(datos, p, i);
        app.guardar();
        app.continuar();
      }, { iconoNombre: 'play', clase: 'principal' })));
  };

  montar(raiz, 
    barraCampana(datos, p, [
      boton('Hangar', () => app.ir('hangar'), { iconoNombre: 'hangar' }),
      botonIcono('menu', 'Menú principal', () => app.ir('portada'))
    ]),
    h('h1', { class: 'titulo-pantalla' }, s.nombre),
    h('p', { class: 'ayuda' }, 'Elegí el próximo destino. Lo que no elijas queda atrás.'),
    h('div', { class: 'mapa-envoltura' }, mapa),
    detalle,
    p.ultimoInforme && p.ultimoInforme.caidos.length
      ? h('p', { class: 'recuerdo' }, ico('lapida'), ' En memoria de ' + p.ultimoInforme.caidos.join(', ') + '.') : null
  );
  pintar();
  // Si hay un solo camino, ya queda elegido
  const opciones = nodosSiguientes(p);
  if (opciones.length === 1) { elegido = { c: p.columna + 1, i: 0 }; pintar(); mostrar(opciones[0], 0); }
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
