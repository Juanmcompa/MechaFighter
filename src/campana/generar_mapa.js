// Mapas generados al azar. Devuelve un mapa con el mismo formato que los de data/mapas (filas, leyenda,
// aparicion, zonas), asi el motor y la vista no notan la diferencia. Se guarda dentro de la mision (m.plano).
//
// Reglas que siempre se cumplen:
//  - el escuadron entra por la izquierda (columnas 1-4) y los enemigos por la derecha (columnas 19-22), despejadas
//  - hay zona 'nucleo' (cerca del escuadron, para defender) y 'extraccion' (del otro lado, para escoltar)
//  - todo el piso se puede alcanzar sin pisar acido desde la entrada (si no, se abre camino o se tapa)

import { crearAzar } from '../core/azar.js';

const ANCHO = 24, ALTO = 16;
const LEYENDA = { '.': 'piso', '#': 'muro', h: 'media_cobertura', H: 'cobertura_total', '~': 'peligro' };

export function generarMapa(datos, semilla, estiloForzado = null) {
  const G = datos.generador_mapas;
  const az = crearAzar(semilla);
  const sorteado = az.elegirConPeso(Object.entries(G.estilos).map(([k, v]) => [k, v.peso]));
  const estilo = estiloForzado && G.estilos[estiloForzado] ? estiloForzado : sorteado;
  const g = [];
  for (let y = 0; y < ALTO; y++) g.push(Array(ANCHO).fill('.'));
  const poner = (x, y, c) => { if (x > 0 && y > 0 && x < ANCHO - 1 && y < ALTO - 1) g[y][x] = c; };
  const es = (x, y, c) => x >= 0 && y >= 0 && x < ANCHO && y < ALTO && g[y][x] === c;

  ESTILOS[estilo](g, az, poner, es);
  // un poco de cobertura suelta en todos (salvo donde ya hay mucho)
  if (estilo !== 'deposito') desparramar(az, poner, es, az.entero(2, 5));

  // bordes
  for (let x = 0; x < ANCHO; x++) { g[0][x] = '#'; g[ALTO - 1][x] = '#'; }
  for (let y = 0; y < ALTO; y++) { g[y][0] = '#'; g[y][ANCHO - 1] = '#'; }

  // entradas: un frente de 6 casillas a cada lado, a una altura al azar
  const yJ = az.entero(4, ALTO - 9), yE = az.entero(4, ALTO - 9);
  despejar(g, 1, yJ - 1, 4, yJ + 6);
  despejar(g, 19, yE - 1, 22, yE + 6);
  const jugador = [[2, yJ], [2, yJ + 2], [2, yJ + 4], [2, yJ + 5], [3, yJ + 1], [3, yJ + 3]];
  const enemigo = [[21, yE], [21, yE + 2], [21, yE + 4], [21, yE + 5], [20, yE + 1], [20, yE + 3]];

  // nucleo: cerca del escuadron; extraccion: arriba o abajo del otro lado
  const nx = az.entero(4, 6), ny = az.entero(3, ALTO - 7);
  const nucleo = [[nx, ny], [nx + az.entero(1, 2), ny + az.entero(2, 3)]];
  const arriba = az.tirada(50);
  const ey = arriba ? az.entero(1, 3) : az.entero(ALTO - 5, ALTO - 4);
  const extraccion = [[20, ey], [22, ey + 2]];
  despejar(g, nucleo[0][0], nucleo[0][1], nucleo[1][0], nucleo[1][1]);
  despejar(g, 20, ey, 22, ey + 2);

  conectar(g, az, jugador[0], [...enemigo, nucleo[0], extraccion[0]]);

  const nombre = az.elegir(G.estilos[estilo].nombres) + ' ' + String(az.entero(2, 98)).padStart(2, '0');
  return {
    nombre, generado: true, estilo,
    tamano: [ANCHO, ALTO],
    leyenda: { ...LEYENDA },
    filas: g.map((f) => f.join('')),
    aparicion: { jugador, enemigo },
    zonas: { nucleo, extraccion },
    descripcion: G.estilos[estilo].descripcion
  };
}

function despejar(g, x1, y1, x2, y2) {
  for (let y = Math.max(1, y1); y <= Math.min(ALTO - 2, y2); y++)
    for (let x = Math.max(1, x1); x <= Math.min(ANCHO - 2, x2); x++) g[y][x] = '.';
}

// Piezas de cobertura: sueltas, en fila, en L o bloque
function pieza(az, poner, x, y) {
  const tipo = az.entero(0, 5);
  const c = az.tirada(55) ? 'h' : 'H';
  if (tipo === 0) poner(x, y, c);
  else if (tipo === 1) { poner(x, y, c); poner(x + 1, y, c); }
  else if (tipo === 2) { poner(x, y, c); poner(x, y + 1, c); }
  else if (tipo === 3) { poner(x, y, 'H'); poner(x + 1, y, 'H'); poner(x, y + 1, 'H'); poner(x + 1, y + 1, 'H'); }
  else if (tipo === 4) { poner(x, y, c); poner(x + 1, y, c); poner(x, y + 1, c); }
  else { poner(x, y, c); poner(x, y + 1, c); poner(x, y + 2, c); }
}

function desparramar(az, poner, es, n) {
  for (let i = 0; i < n; i++) {
    const x = az.entero(5, ANCHO - 7), y = az.entero(1, ALTO - 3);
    if (es(x, y, '.')) pieza(az, poner, x, y);
  }
}

function charco(az, poner, cx, cy, r) {
  for (let y = cy - r; y <= cy + r; y++)
    for (let x = cx - r - 1; x <= cx + r + 1; x++) {
      const d = ((x - cx) * (x - cx)) / ((r + 1) * (r + 1)) + ((y - cy) * (y - cy)) / (r * r || 1);
      if (d <= 1 && az.entero(0, 9) < 8) poner(x, y, '~');
    }
}

const ESTILOS = {
  campo(g, az, poner, es) {
    desparramar(az, poner, es, az.entero(7, 11));
    for (let i = az.entero(0, 2); i > 0; i--) charco(az, poner, az.entero(7, 16), az.entero(3, ALTO - 4), az.entero(1, 2));
  },
  rio(g, az, poner, es) {
    // cauce de 2 que serpentea de arriba a abajo, con 1 a 3 puentes
    let x = az.entero(9, 13);
    const puentes = new Set();
    for (let i = az.entero(1, 3); i > 0; i--) puentes.add(az.entero(2, ALTO - 3));
    for (let y = 1; y < ALTO - 1; y++) {
      if (az.tirada(35)) x = Math.max(7, Math.min(15, x + az.elegir([-1, 1])));
      const ancho = az.tirada(25) ? 3 : 2;
      for (let k = 0; k < ancho; k++) poner(x + k, y, puentes.has(y) || puentes.has(y - 1) ? '.' : '~');
    }
    desparramar(az, poner, es, az.entero(4, 7));
  },
  ruinas(g, az, poner, es) {
    const n = az.entero(3, 5);
    for (let i = 0; i < n; i++) {
      const w = az.entero(4, 7), h = az.entero(3, 5);
      const x1 = az.entero(5, ANCHO - 6 - w), y1 = az.entero(1, ALTO - 2 - h);
      const x2 = x1 + w, y2 = y1 + h;
      for (let x = x1; x <= x2; x++) { poner(x, y1, '#'); poner(x, y2, '#'); }
      for (let y = y1; y <= y2; y++) { poner(x1, y, '#'); poner(x2, y, '#'); }
      for (let y = y1 + 1; y < y2; y++) for (let x = x1 + 1; x < x2; x++) poner(x, y, '.');
      // puertas (y paredes caidas)
      for (let p = az.entero(2, 3); p > 0; p--) {
        const lado = az.entero(0, 3);
        if (lado < 2) poner(az.entero(x1 + 1, x2 - 1), lado ? y2 : y1, '.');
        else poner(lado === 2 ? x1 : x2, az.entero(y1 + 1, y2 - 1), '.');
      }
      if (az.tirada(60)) poner(az.entero(x1 + 1, x2 - 1), az.entero(y1 + 1, y2 - 1), 'h');
    }
    if (az.tirada(40)) charco(az, poner, az.entero(8, 15), az.entero(3, ALTO - 4), 1);
  },
  canon(g, az, poner, es) {
    // paredes de arriba y de abajo con borde irregular
    let a = az.entero(2, 4), b = az.entero(2, 4);
    for (let x = 1; x < ANCHO - 1; x++) {
      a = Math.max(1, Math.min(5, a + az.entero(-1, 1)));
      b = Math.max(1, Math.min(5, b + az.entero(-1, 1)));
      const borde = x < 5 || x > 18 ? 1 : 0; // en las entradas se abre un poco
      for (let y = 1; y < 1 + a - borde; y++) poner(x, y, '#');
      for (let y = ALTO - 2; y > ALTO - 2 - b + borde; y--) poner(x, y, '#');
    }
    for (let i = az.entero(3, 5); i > 0; i--) {
      const x = az.entero(6, ANCHO - 8), y = az.entero(5, ALTO - 6);
      poner(x, y, 'H'); if (az.tirada(50)) poner(x + 1, y, 'H'); if (az.tirada(40)) poner(x, y + 1, 'h');
    }
    if (az.tirada(50)) charco(az, poner, az.entero(8, 15), az.entero(6, ALTO - 7), 1);
  },
  deposito(g, az, poner, es) {
    // filas de contenedores con pasillos; algunos faltan
    const vertical = az.tirada(50);
    const paso = az.entero(3, 4);
    for (let x = 6; x <= ANCHO - 7; x += paso) {
      for (let y = az.entero(1, 2); y <= ALTO - 3; y += az.entero(3, 4)) {
        if (az.tirada(20)) continue;
        if (vertical) { poner(x, y, 'H'); poner(x, y + 1, 'H'); if (az.tirada(60)) poner(x, y + 2, 'H'); }
        else { poner(x, y, 'H'); poner(x + 1, y, 'H'); if (az.tirada(50)) poner(x, y + 1, 'h'); }
      }
    }
    if (az.tirada(30)) charco(az, poner, az.entero(8, 15), az.entero(3, ALTO - 4), 1);
  },
  crater(g, az, poner, es) {
    const cx = az.entero(10, 13), cy = az.entero(6, 9), r = az.entero(2, 3);
    const relleno = az.tirada(50) ? '~' : '#';
    for (let y = cy - r; y <= cy + r; y++)
      for (let x = cx - r - 1; x <= cx + r + 1; x++) {
        const d = ((x - cx) * (x - cx)) / ((r + 1.5) * (r + 1.5)) + ((y - cy) * (y - cy)) / ((r + 0.5) * (r + 0.5));
        if (d <= 1) poner(x, y, relleno);
        else if (d <= 1.6 && az.tirada(35)) poner(x, y, 'h');
      }
    desparramar(az, poner, es, az.entero(3, 6));
  }
};

// Todo lo importante tiene que poder alcanzarse caminando sin pisar acido. Si algo queda aislado, se abre un
// camino; despues el piso que sigue aislado se tapa (para que no aparezca nada ahi).
function conectar(g, az, desde, destinos) {
  const pisable = (x, y) => g[y][x] === '.';
  const alcance = () => {
    const vis = new Set([desde[1] * ANCHO + desde[0]]);
    const cola = [desde];
    while (cola.length) {
      const [x, y] = cola.shift();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, k = ny * ANCHO + nx;
        if (nx > 0 && ny > 0 && nx < ANCHO - 1 && ny < ALTO - 1 && !vis.has(k) && pisable(nx, ny)) { vis.add(k); cola.push([nx, ny]); }
      }
    }
    return vis;
  };
  for (const [tx, ty] of destinos) {
    if (alcance().has(ty * ANCHO + tx)) continue;
    // camino en L desde el destino hacia la entrada, rompiendo lo que haya (el acido se vuelve puente)
    let x = tx, y = ty;
    const primeroX = az.tirada(50);
    const pasos = [];
    if (primeroX) { while (x !== desde[0]) { x += Math.sign(desde[0] - x); pasos.push([x, y]); } }
    while (y !== desde[1]) { y += Math.sign(desde[1] - y); pasos.push([x, y]); }
    while (x !== desde[0]) { x += Math.sign(desde[0] - x); pasos.push([x, y]); }
    for (const [px, py] of pasos) g[py][px] = '.';
  }
  const vis = alcance();
  for (let y = 1; y < ALTO - 1; y++)
    for (let x = 1; x < ANCHO - 1; x++) {
      if (g[y][x] === '.' && !vis.has(y * ANCHO + x)) g[y][x] = '#';
      // un charco de acido rodeado sin piso alcanzable al lado tambien se tapa
    }
}
