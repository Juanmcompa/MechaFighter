// La brujula del sector: la nodriza en el centro y los destinos alrededor (de 1 a 6), a 1, 2 o 3 de combustible.
// El color de cada destino dice de que bando es; los visitados quedan en gris (se puede volver, pagando el salto).
// Arriba, el frente del sector y como te ve cada bando. Tocar un destino muestra su tarjeta abajo.
import { h, montar, ico, botonIcono, barraJuego, retrato } from './comun.js';
import { destinosDeLaNave, elegirNodo, nemesisDelMapa } from '../campana/partida.js';
import { quien, esAmenaza, escalonDe, textoReputacion, contagioPct, combustibleMaximo, efectoContrato, textoEfecto, nodoActual, guaridaAbierta, veSenales } from '../campana/brujula.js';
import { existeIcono } from './iconos.js';

const ELEGIDO = { id: null };
const TIPO = { mision: 'Contrato', parada: 'Parada técnica', reclutamiento: 'Reclutas', evento: 'Señal', descanso: 'Refugio', jefe: 'Guarida' };

// Icono y colores de un destino
export function pintaDe(datos, nodo) {
  const m = nodo.mision;
  if (nodo.tipo === 'jefe') return { icono: 'jefe', ...colores(quien(datos, m && m.objetivo) || { color: '#d9553f', claro: '#e57a6c', fondo: '#2a1814' }) };
  if (nodo.tipo === 'mision' && m && m.cliente) {
    const contraAmenaza = esAmenaza(datos, m.objetivo);
    const q = quien(datos, contraAmenaza && m.nido ? m.objetivo : m.cliente);
    return { icono: contraAmenaza ? quien(datos, m.objetivo).icono : 'mision', ...colores(q) };
  }
  if (nodo.tipo === 'mision') return { icono: 'mision', ...colores({ color: '#e0a43a', claro: '#e0a43a', fondo: '#2a1f12' }) };
  if (nodo.tipo === 'parada') return { icono: 'combustible', ...colores(quien(datos, nodo.dueno)) };
  const neutro = { color: '#78846c', claro: '#a8b39b', fondo: '#171a14' };
  return { icono: nodo.tipo === 'evento' ? 'evento' : nodo.tipo === 'descanso' ? 'descanso' : 'reclutamiento', ...colores(neutro) };
}
const colores = (q) => ({ color: q.color, claro: q.claro, fondo: q.fondo });

// El nombre corto que va abajo del destino
function cortoDe(datos, nodo) {
  if (nodo.tipo === 'jefe') return 'Guarida';
  if (nodo.tipo === 'mision' && nodo.mision) return nodo.mision.nido ? 'Nido' : nodo.mision.encuentro ? '???' : nodo.mision.plantilla[0].toUpperCase() + nodo.mision.plantilla.slice(1);
  return TIPO[nodo.tipo] ? TIPO[nodo.tipo].split(' ')[0] : nodo.tipo;
}

const peligro = (m) => '●'.repeat(Math.min(3, m.dificultad)) + '○'.repeat(Math.max(0, 3 - m.dificultad));

// La barra del frente (tambien la usa el informe y la compania)
export function barraFrente(datos, s, chica = false) {
  const contagio = contagioPct(datos, s);
  const total = s.bandos.reduce((t, b) => t + s.frente[b], 0) || 1;
  return h('span', { class: 'frente-barra' + (chica ? ' chica' : ''), 'aria-hidden': 'true' },
    ...s.bandos.map((b) => h('i', { style: 'flex:' + Math.round((s.frente[b] * (100 - contagio)) / total) + ';background:' + quien(datos, b).color })),
    contagio ? h('i', { class: 'contagio', style: 'flex:' + contagio }) : null);
}

export function sectores(app, raiz) {
  const { datos } = app;
  const p = app.partida;
  const s = p.sectores[p.sector];
  const aca = nodoActual(p);
  const lista = destinosDeLaNave(datos, p);
  const acecho = nemesisDelMapa(datos, p);
  if (!lista.some((d) => d.nodo.i === ELEGIDO.id)) ELEGIDO.id = (lista.find((d) => !d.nodo.visitado && !d.bloqueado) || lista[0] || {}).nodo?.i ?? null;
  const I = datos.sectores.campana_base.inteligencia;
  const maxComb = combustibleMaximo(datos, p);

  const cuerpo = h('div', { class: 'br' });
  const pintar = () => {
    const sel = lista.find((d) => d.nodo.i === ELEGIDO.id);
    cuerpo.replaceChildren(...[
      h('header', { class: 'br-cabeza' },
        h('div', { class: 'br-titulo' }, h('small', {}, 'SECTOR ' + s.numero + ' · SALTO ' + s.saltos), h('h1', {}, s.nombre)),
        h('span', { class: 'br-comb' + (p.combustible <= 2 ? ' poco' : ''), title: 'Combustible', 'aria-label': 'Combustible ' + p.combustible + ' de ' + maxComb }, ico('combustible'), p.combustible + '/' + maxComb),
        h('span', { class: 'br-cred', title: 'Créditos' }, '₵ ' + p.creditos.toLocaleString('es-AR')),
        botonIcono('menu', 'Menú principal', () => app.ir('portada'), 'br-menu')),
      h('button', { class: 'br-frente', onclick: () => app.ir('frente'), 'aria-label': 'El frente del sector y cómo te ve cada bando' },
        barraFrente(datos, s),
        h('span', { class: 'br-reps' }, ...s.bandos.map((b) => h('span', {}, h('b', { style: 'color:' + quien(datos, b).claro }, quien(datos, b).corto), ' ' + escalonDe(datos, p, b).nombre.toLowerCase())),
          h('em', {}, 'Frente ›'))),
      h('p', { class: 'br-intel' }, ico('ojo'), h('span', {}, s.jefe),
        h('span', { class: 'pips-intel', title: 'Inteligencia: cada contrato ganado da datos' }, ...Array.from({ length: I.maxima }, (_, k) => h('i', { class: k < s.inteligencia ? 'lleno' : '' }))),
        h('small', {}, guaridaAbierta(datos, s) ? 'guarida a la vista' : 'cada contrato ganado da datos')),
      p.remolque ? h('p', { class: 'br-aviso' }, ico('combustible'), ' Sin combustible: el remolque cobró ₵' + p.remolque.creditos + ' y los mechas perdieron ' + p.remolque.danio + '%.') : null,
      p.emboscada ? h('p', { class: 'br-aviso violeta' }, ico('enjambre'), ' En el salto largo se les pegó fauna al casco: los mechas perdieron ' + p.emboscada.danio + '%.') : null,
      radar(),
      sel ? tarjeta(sel) : h('p', { class: 'ayuda' }, 'No hay destinos a la vista.'),
      barraJuego(app, 'mapa')
    ].filter(Boolean));
  };

  // La brujula: anillos a 1, 2 y 3 saltos, las lineas a cada destino y los destinos
  const radar = () => {
    const VIS = datos.bandos.brujula.visible;
    // los anillos no van parejos: el primero bien separado de la nave, asi no se pisan (la guarida lejos, al borde)
    const radio = (dist) => Math.min(0.94, 0.17 + 0.25 * dist);
    let pos = (n) => {
      const dx = n.x - aca.x, dy = n.y - aca.y;
      const r = radio(Math.hypot(dx, dy));
      const a = Math.atan2(dy, dx);
      return { x: 50 + Math.cos(a) * r * 50, y: 50 + Math.sin(a) * r * 50, a, r };
    };
    // que no se pisen: se empujan de a pares hasta que entren (en % del cuadro; un destino ocupa ~15%)
    const P = new Map(lista.map((d) => [d.nodo.i, pos(d.nodo)]));
    const MIN = 23;
    for (let vuelta = 0; vuelta < 60; vuelta++) {
      let movio = false;
      for (const a of P.values()) for (const b of P.values()) {
        if (a === b) continue;
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01;
        if (d >= MIN) continue;
        const e = (MIN - d) / 2;
        a.x -= (dx / d) * e; a.y -= (dy / d) * e; b.x += (dx / d) * e; b.y += (dy / d) * e;
        movio = true;
      }
      for (const q of P.values()) {
        // ni muy cerca de la nave ni afuera del circulo
        const r = Math.hypot(q.x - 50, q.y - 50) || 0.01, ang = Math.atan2(q.y - 50, q.x - 50);
        const rr = Math.max(20, Math.min(45, r));
        q.x = 50 + Math.cos(ang) * rr; q.y = 50 + Math.sin(ang) * rr; q.a = ang; q.r = rr / 50;
      }
      if (!movio) break;
    }
    pos = (n) => P.get(n.i);
    return h('section', { class: 'br-radar', 'aria-label': 'Brújula: destinos al alcance de la nave' },
      ...[1, 2, 3].map((k) => h('i', { class: 'br-anillo', style: 'width:' + radio(k) * 100 + '%;height:' + radio(k) * 100 + '%' })),
      ...lista.map((d) => {
        const q = pos(d.nodo), pz = pintaDe(datos, d.nodo), el = d.nodo.i === ELEGIDO.id;
        return h('i', { class: 'br-linea' + (el ? ' elegida' : ''), style: 'width:' + (q.r * 50) + '%;transform:rotate(' + q.a + 'rad);border-color:' + (el ? '#8fdc5a' : d.nodo.visitado ? '#4f5a46' : pz.color) });
      }),
      h('div', { class: 'br-nave', role: 'img', 'aria-label': 'La nodriza, con el escuadrón' }, ico('nave'), h('small', {}, 'NODRIZA')),
      ...lista.map((d) => {
        const n = d.nodo, q = pos(n), pz = pintaDe(datos, n), el = n.i === ELEGIDO.id;
        const forma = n.tipo === 'mision' ? (n.mision && n.mision.nido ? ' nido' : '') : ' redondo';
        return h('button', {
          class: 'br-nodo' + forma + (el ? ' elegido' : '') + (n.visitado ? ' visitado' : '') + (d.bloqueado ? ' bloqueado' : ''),
          style: 'left:' + q.x + '%;top:' + q.y + '%;--c:' + pz.color + ';--cl:' + pz.claro + ';--f:' + pz.fondo,
          'aria-pressed': el ? 'true' : 'false',
          'aria-label': (TIPO[n.tipo] || n.tipo) + ': ' + tituloDe(n) + (d.bloqueado ? ' (cerrada)' : '. ' + d.costo + ' de combustible') + (n.visitado ? '. Ya estuviste' : ''),
          onclick: () => { ELEGIDO.id = n.i; pintar(); }
        }, ico(existeIcono(pz.icono) ? pz.icono : 'mision'),
        d.bloqueado ? null : h('span', { class: 'br-costo' }, String(d.costo)),
        acecho[n.i] ? h('span', { class: 'br-nemesis', title: 'Se vio a un némesis' }) : null,
        h('span', { class: 'br-etiqueta' }, cortoDe(datos, n)));
      }));
  };

  const tituloDe = (n) => n.tipo === 'jefe' ? s.jefe : n.mision ? (n.mision.encuentro ? 'Una señal conocida' : n.mision.lore && n.mision.lore.titulo ? n.mision.lore.titulo : n.mision.nombre)
    : n.tipo === 'parada' ? (quien(datos, n.dueno).neutral ? 'Puerto del gremio' : 'Parada de ' + quien(datos, n.dueno).corto) : TIPO[n.tipo] || n.tipo;

  // La tarjeta del destino elegido
  const tarjeta = (d) => {
    const n = d.nodo, m = n.mision, pz = pintaDe(datos, n);
    const nem = acecho[n.i] ? (p.nemesis || []).find((x) => x.id === acecho[n.i]) : null;
    const busca = nem && nem.objetivo ? p.pilotos.find((x) => x.id === nem.objetivo) : null;
    let rotulo = (TIPO[n.tipo] || n.tipo).toUpperCase(), texto = '', chips = [];
    if (n.tipo === 'jefe') {
      rotulo = 'GUARIDA · ' + (quien(datos, m.objetivo) || { nombre: 'jefe del sector' }).nombre.toUpperCase();
      texto = d.bloqueado ? 'Sabemos que está por acá. Con ' + (I.para_guarida - s.inteligencia) + ' contrato' + (I.para_guarida - s.inteligencia === 1 ? '' : 's') + ' ganado' + (I.para_guarida - s.inteligencia === 1 ? '' : 's') + ' más aparece la ruta.'
        : 'Bajarlo cierra el sector y se cruza al siguiente. Si sale mal, se puede volver a intentar.';
      chips = [m ? 'Peligro ' + peligro(m) : null, m ? '₵ ' + m.recompensa.creditos + ' + trofeo' : null];
    } else if (m && m.cliente) {
      const contraAmenaza = esAmenaza(datos, m.objetivo);
      rotulo = 'CONTRATO · ' + quien(datos, m.cliente).nombre.toUpperCase();
      texto = (contraAmenaza ? 'Contra ' + quien(datos, m.objetivo).nombre.toLowerCase() + '. ' : 'Contra ' + quien(datos, m.objetivo).nombre + '. ') + textoEfecto(datos, efectoContrato(datos, p, s, m)) + '.';
      chips = ['Peligro ' + peligro(m), '₵ ' + m.recompensa.creditos + (m.recompensa.botin ? ' + ' + m.recompensa.botin + (m.recompensa.botin === 1 ? ' pieza' : ' piezas') : ''),
        n.vence !== undefined && !n.visitado ? (n.vence - s.saltos <= 0 ? 'vence ahora' : 'vence en ' + (n.vence - s.saltos + 1) + ' saltos') : null,
        ...(m.condiciones || []).filter((c) => c.startsWith('irrumpe')).map((c) => datos.condiciones_mision[c].nombre)];
    } else if (m) {
      texto = 'Una frecuencia que el escuadrón reconoce. No dice quién manda.';
    } else if (n.tipo === 'parada') {
      const q = quien(datos, n.dueno);
      rotulo = 'PARADA TÉCNICA · ' + q.nombre.toUpperCase();
      const e = escalonDe(datos, p, n.dueno);
      texto = 'Combustible, reparaciones, mejoras de la nave y piezas de ' + (q.neutral ? 'todos los bandos' : q.corto + ' (' + q.estilo + ')') + '. ' +
        (q.neutral ? 'Precios normales.' : 'Te ven ' + e.nombre.toLowerCase() + (e.precio_pct !== 100 ? ': precios ' + (e.precio_pct > 100 ? '+' : '−') + Math.abs(e.precio_pct - 100) + '%.' : '.'));
    } else if (n.tipo === 'reclutamiento') texto = 'Pilotos sin trabajo buscan escuadrón. Cada uno cuesta ' + datos.reglas.campana.costo_reclutar + ' créditos.';
    else if (n.tipo === 'evento') texto = veSenales(datos, p) ? 'El sensor la identifica: alguien pide ayuda (o eso dice).' : 'Una señal sin identificar. Puede ser gente, chatarra o una trampa.';
    else if (n.tipo === 'descanso') texto = 'Un refugio tranquilo: se reparan los mechas y se ordenan las cabezas.';
    if (n.visitado && n.tipo !== 'parada' && n.tipo !== 'jefe') { texto = 'Ya estuviste acá. Volver cuesta el salto, pero no hay nada nuevo.'; chips = []; }
    const saltar = () => { elegirNodo(datos, p, n); app.guardar(); app.continuar(); };
    return h('section', { class: 'br-tarjeta', style: '--c:' + (n.visitado ? '#2d3427' : pz.color) + ';--cl:' + pz.claro, 'aria-live': 'polite' },
      h('small', { class: 'br-rotulo' }, rotulo),
      h('strong', { class: 'br-nombre' }, tituloDe(n)),
      h('div', { class: 'br-chips' }, d.bloqueado ? null : h('span', { class: 'comb' }, ico('combustible'), d.costo + ' de combustible'), ...chips.filter(Boolean).map((c) => h('span', {}, c))),
      texto ? h('p', {}, texto) : null,
      nem ? h('p', { class: 'br-nem' }, retrato(datos, nem, 'retrato-mini'), h('span', {}, 'Se vio a «' + nem.apodo + '» por acá. ' + (busca ? 'Busca a «' + busca.apodo + '».' : 'Viene por el escuadrón.'))) : null,
      h('div', { class: 'br-botones' },
        m && m.cliente && !n.visitado
          ? [h('button', { class: 'boton secundario', onclick: saltar }, 'Saltar · ' + d.costo), h('button', { class: 'boton principal', onclick: () => app.ir('contrato', n.i) }, 'Ver contrato')]
          : h('button', { class: 'boton principal', disabled: d.bloqueado, onclick: saltar }, d.bloqueado ? 'Faltan datos (' + s.inteligencia + '/' + I.para_guarida + ')' : 'Saltar · ' + d.costo)));
  };

  montar(raiz, cuerpo);
  pintar();
}
