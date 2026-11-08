// El tablero: casillas, caminos, linea de tiro y cobertura. Todo con enteros.
// Distancias en "casillas de rey" (Chebyshev): moverse en diagonal cuesta lo mismo que derecho. Es la regla que
// el jugador entiende mirando la grilla, y evita raices cuadradas.

// (edificio: tapa como un muro pero se puede romper; escombros: lo que queda, cubre a medias;
//  escombros_bajos y piso_quemado: se camina por encima; barril: cubre a medias y revienta)
const CAMINABLE = { piso: true, peligro: true, escombros_bajos: true, piso_quemado: true };
const TAPA_VISTA = { muro: true, cobertura_total: true, edificio: true };
export const VALOR_COBERTURA = { media_cobertura: 'media', cobertura_total: 'total', edificio: 'total', escombros: 'media', barril: 'media' };

// destructibles: reglas.destructibles (lo que se puede romper y en que se convierte)
export function crearTablero(mapa, destructibles = null) {
  const [ancho, alto] = mapa.tamano;
  const tipos = [];
  for (let y = 0; y < alto; y++) for (let x = 0; x < ancho; x++) tipos.push(mapa.leyenda[mapa.filas[y][x]] || 'muro');
  const vida = new Int16Array(ancho * alto);
  if (destructibles) tipos.forEach((t, i) => { if (destructibles[t]) vida[i] = destructibles[t].vida; });
  return { ancho, alto, tipos, vida, destructibles, campos: new Map() };
}

// Cambia lo que hay en una casilla (algo se rompio). Si cambia por donde se puede caminar, se olvidan los caminos.
export function cambiarCasilla(t, x, y, nuevo) {
  const k = y * t.ancho + x;
  const antes = t.tipos[k];
  t.tipos[k] = nuevo;
  t.vida[k] = t.destructibles && t.destructibles[nuevo] ? t.destructibles[nuevo].vida : 0;
  if (!!CAMINABLE[antes] !== !!CAMINABLE[nuevo]) t.campos.clear();
}

export const dentro = (t, x, y) => x >= 0 && y >= 0 && x < t.ancho && y < t.alto;
export const tipo = (t, x, y) => (dentro(t, x, y) ? t.tipos[y * t.ancho + x] : 'muro');
export const caminable = (t, x, y) => CAMINABLE[tipo(t, x, y)] === true;
export const distancia = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

// Vecinos en 8 direcciones, siempre en el mismo orden. En diagonal no se corta esquina contra un obstaculo.
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]];
export function vecinos(t, x, y) {
  const out = [];
  for (const [dx, dy] of DIRS) {
    const nx = x + dx, ny = y + dy;
    if (!caminable(t, nx, ny)) continue;
    if (dx && dy && (!caminable(t, x + dx, y) || !caminable(t, x, y + dy))) continue;
    out.push([nx, ny]);
  }
  return out;
}

// Campo de distancias desde una casilla (BFS). El mapa no cambia durante la batalla: se guarda y se reusa.
export function campo(t, gx, gy) {
  const clave = gy * t.ancho + gx;
  let c = t.campos.get(clave);
  if (c) return c;
  c = new Int16Array(t.ancho * t.alto).fill(-1);
  c[clave] = 0;
  const cola = [gx, gy];
  for (let i = 0; i < cola.length; i += 2) {
    const x = cola[i], y = cola[i + 1], d = c[y * t.ancho + x];
    for (const [nx, ny] of vecinos(t, x, y)) {
      const k = ny * t.ancho + nx;
      if (c[k] === -1) { c[k] = d + 1; cola.push(nx, ny); }
    }
  }
  t.campos.set(clave, c);
  return c;
}

// Un paso hacia (gx, gy) evitando casillas ocupadas. Devuelve [x, y] o null si no hay paso que acerque.
// Primero prueba con el campo fijo (rapido). Si el camino esta tapado por otras unidades, calcula uno que las
// rodee (asi un convoy no se queda trabado detras de un aliado quieto).
export function pasoHacia(t, desde, gx, gy, ocupada) {
  const c = campo(t, gx, gy);
  const actual = c[desde.y * t.ancho + desde.x];
  let mejor = null, mejorD = actual === -1 ? 32767 : actual;
  for (const [nx, ny] of vecinos(t, desde.x, desde.y)) {
    const d = c[ny * t.ancho + nx];
    if (d === -1 || d >= mejorD || ocupada(nx, ny)) continue;
    mejor = [nx, ny]; mejorD = d;
  }
  if (mejor || actual <= 1) return mejor;
  return pasoRodeando(t, desde, gx, gy, ocupada);
}

function pasoRodeando(t, desde, gx, gy, ocupada) {
  const c = new Int16Array(t.ancho * t.alto).fill(-1);
  c[gy * t.ancho + gx] = 0;
  const cola = [gx, gy];
  const origen = desde.y * t.ancho + desde.x;
  for (let i = 0; i < cola.length && c[origen] === -1; i += 2) {
    const x = cola[i], y = cola[i + 1], d = c[y * t.ancho + x];
    for (const [nx, ny] of vecinos(t, x, y)) {
      const k = ny * t.ancho + nx;
      if (c[k] !== -1) continue;
      if (k !== origen && ocupada(nx, ny)) continue;
      c[k] = d + 1;
      cola.push(nx, ny);
    }
  }
  if (c[origen] === -1) return null;
  let mejor = null, mejorD = c[origen];
  for (const [nx, ny] of vecinos(t, desde.x, desde.y)) {
    const d = c[ny * t.ancho + nx];
    if (d === -1 || d >= mejorD || ocupada(nx, ny)) continue;
    mejor = [nx, ny]; mejorD = d;
  }
  return mejor;
}

// Linea de casillas entre dos puntos (Bresenham), sin la de partida.
export function linea(x0, y0, x1, y1) {
  const out = [];
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy, x = x0, y = y0;
  while (x !== x1 || y !== y1) {
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
    out.push([x, y]);
  }
  return out;
}

// Hay linea de tiro si nada la tapa en el medio. Lo que esta pegado a cualquiera de los dos no tapa:
// es cobertura (te protege, pero desde ahi podes asomarte a disparar).
export function lineaDeTiro(t, a, b) {
  for (const [x, y] of linea(a.x, a.y, b.x, b.y)) {
    if (x === b.x && y === b.y) return true;
    if (Math.max(Math.abs(x - a.x), Math.abs(y - a.y)) <= 1) continue;
    if (Math.max(Math.abs(x - b.x), Math.abs(y - b.y)) <= 1) continue;
    if (TAPA_VISTA[tipo(t, x, y)]) return false;
  }
  return true;
}

// Cobertura que tiene "objetivo" frente a un disparo desde "tirador": la primera casilla de la linea que sale del
// objetivo hacia el tirador. Devuelve 'total', 'media' o null.
export function cobertura(t, objetivo, tirador) {
  const c = casillaDeCobertura(t, objetivo, tirador);
  return c ? VALOR_COBERTURA[tipo(t, c[0], c[1])] : null;
}

// La casilla que cubre al objetivo de ese disparo (la que se come el tiro si falla), o null
export function casillaDeCobertura(t, objetivo, tirador) {
  if (distancia(objetivo, tirador) <= 1) return null; // cuerpo a cuerpo: no hay donde esconderse
  const l = linea(objetivo.x, objetivo.y, tirador.x, tirador.y);
  return VALOR_COBERTURA[tipo(t, l[0][0], l[0][1])] ? l[0] : null;
}

// Casilla caminable y libre mas cercana a (x, y), en un orden fijo.
export function casillaLibreCerca(t, x, y, ocupada) {
  if (caminable(t, x, y) && !ocupada(x, y)) return [x, y];
  for (let r = 1; r < Math.max(t.ancho, t.alto); r++) {
    for (let yy = y - r; yy <= y + r; yy++) {
      for (let xx = x - r; xx <= x + r; xx++) {
        if (Math.max(Math.abs(xx - x), Math.abs(yy - y)) !== r) continue;
        if (caminable(t, xx, yy) && !ocupada(xx, yy)) return [xx, yy];
      }
    }
  }
  return null;
}
