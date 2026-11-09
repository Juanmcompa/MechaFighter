// Carga los sprites procesados (assets/). Si algo no carga, el juego sigue con los dibujos por codigo:
// por eso todo aca es "si esta, se usa".

export const SPR = { listo: false, meta: {}, escala: 2, imgs: {}, retratos: 0 };

function cargarImagen(src) {
  return new Promise((ok) => {
    const im = new Image();
    im.onload = () => ok(im);
    im.onerror = () => ok(null);
    im.src = src;
  });
}

// extras: ids de sprite que usan las piezas (data/partes.json) aunque no esten en sprites.json (arte nuevo);
// colorEquipo: reglas.arte.color_equipo, para pintar el color de bando cuando falta la version de un color
export async function cargarSprites(base = './', cantidadRetratos = 0, { extras = [], colorEquipo = null } = {}) {
  try {
    const r = await fetch(base + 'assets/mecha/sprites.json', { cache: 'no-cache' });
    if (!r.ok) return SPR;
    const meta = await r.json();
    SPR.escala = meta._escala || 1;
    delete meta._escala;
    SPR.meta = meta;
    // extras: { idDeSprite: encaje } de las piezas (pueden no estar en sprites.json, o tener arte nuevo con otra medida)
    const encajes = Array.isArray(extras) ? Object.fromEntries(extras.map((id) => [id, ''])) : extras || {};
    const ids = [...new Set([...Object.keys(meta), ...Object.keys(encajes)])].filter(Boolean);
    const f = SPR.escala * (24 / 32); // 32 pixeles = una casilla (24 unidades del dibujo)
    await Promise.all(ids.map(async (id) => {
      const azul = await cargarImagen(base + 'assets/mecha/azul/' + id + '.png');
      if (!azul) return;
      azul._luz = 'mecha/' + id;
      const viejo = meta[id];
      // si el dibujo no coincide con lo anotado en sprites.json (o no esta), es arte nuevo: se mide solo
      const nuevo = !viejo || viejo.w !== azul.width || viejo.h !== azul.height;
      if (nuevo) {
        const w = azul.width * f, h = azul.height * f;
        const papel = azul.width % 32 === 0 && azul.height % 32 === 0;
        // sin papel, los brazos se enganchan del hombro (abajo) y lo demas del centro
        const ancla = encajes[id] === 'brazo' ? [w * 0.4, h * 0.82] : [w / 2, h / 2];
        meta[id] = { w, h, ancla, ...(papel ? { papel: true } : {}) };
      }
      SPR.imgs['azul/' + id] = nuevo ? pintarEquipo(azul, 'azul', colorEquipo) : azul;
      SPR.imgs['azul/' + id]._luzColor = 'mecha/azul/' + id;
      for (const color of ['rojo', 'verde']) {
        const otra = await cargarImagen(base + 'assets/mecha/' + color + '/' + id + '.png');
        // si falta, o es de otra medida (el dibujo viejo), o es el mismo dibujo: el color de bando se pinta solo
        const sirve = otra && otra.width === azul.width && otra.height === azul.height;
        if (sirve) otra._luz = azul._luz;
        let im = !nuevo && sirve ? otra : pintarEquipo(sirve ? otra : azul, color, colorEquipo);
        // (si quedo la misma imagen que la azul, se copia para que cada bando tenga su brillo)
        if (im === azul) { const c = document.createElement('canvas'); c.width = azul.width; c.height = azul.height; c.getContext('2d').drawImage(azul, 0, 0); c._luz = azul._luz; c._puntas = azul._puntas; c._faros = azul._faros; im = c; }
        im._luzColor = 'mecha/' + color + '/' + id;
        SPR.imgs[color + '/' + id] = im;
      }
    }));
    SPR.listo = Object.keys(SPR.imgs).length > 0;
    SPR.retratos = cantidadRetratos;
  } catch { /* sin sprites: se dibuja por codigo */ }
  return SPR;
}

// ---------- Unidades enteras (camion, drones): assets/unidades ----------
export const UNI = { escala: 2, meta: {}, imgs: {} };

export async function cargarUnidades(base = './') {
  try {
    const r = await fetch(base + 'assets/unidades/unidades.json', { cache: 'no-cache' });
    if (!r.ok) return UNI;
    const meta = await r.json();
    UNI.escala = meta._escala || 2;
    delete meta._escala;
    UNI.meta = meta;
    await Promise.all(Object.keys(meta).map(async (id) => {
      let im = await cargarImagen(base + 'assets/unidades/' + id + '.png');
      if (!im) return;
      im._luz = 'unidades/' + id;
      const m = meta[id];
      // arte nuevo (otra medida que la anotada): 32 pixeles = una casilla; las marcas (magenta = boca del arma,
      // amarillo = faro) se sacan del dibujo. Si hay id_torreta.png, la torreta gira aparte (apunta) y el casco
      // va hacia donde camina.
      if (m.w !== im.width || m.h !== im.height) {
        meta[id] = { w: im.width * 0.75 * UNI.escala, h: im.height * 0.75 * UNI.escala, nuevo: true };
        im = pintarEquipo(im, 'azul', null);
        const torreta = await cargarImagen(base + 'assets/unidades/' + id + '_torreta.png');
        if (torreta) {
          torreta._luz = 'unidades/' + id + '_torreta';
          UNI.imgs[id + '_torreta'] = pintarEquipo(torreta, 'azul', null);
        }
      }
      UNI.imgs[id] = im;
    }));
  } catch { /* sin sprites: dibujos por codigo */ }
  return UNI;
}

export const sprite = (color, id) => (id ? SPR.imgs[color + '/' + id] || null : null);

// Ruta del retrato numero n (1..cantidad)
export const rutaRetrato = (n) => 'assets/retratos/' + String(n).padStart(2, '0') + '.png';

// ---------- Terreno (tileset de los mapas) ----------
export const TER = { listo: false, casilla: 64, imgs: {}, sombras: {}, texturas: [], objetos: {}, detalles: [] };

// Sombra de un objeto: su silueta en negro (se dibuja corrida, abajo a la derecha). Se arma una vez.
function silueta(im) {
  const c = document.createElement('canvas');
  c.width = im.width; c.height = im.height;
  const x = c.getContext('2d');
  x.drawImage(im, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = '#000';
  x.fillRect(0, 0, c.width, c.height);
  return c;
}

export async function cargarTerreno(base = './') {
  try {
    const r = await fetch(base + 'assets/terreno/terreno.json', { cache: 'no-cache' });
    if (!r.ok) return TER;
    const m = await r.json();
    const ids = [...m.texturas, ...Object.values(m.objetos).flat(), ...m.detalles];
    await Promise.all(ids.map((id) => cargarImagen(base + 'assets/terreno/' + id + '.png').then((im) => {
      if (!im) return;
      im._luz = 'terreno/' + id;
      TER.imgs[id] = im;
      if (id.startsWith('obj_')) TER.sombras[id] = silueta(im);
    })));
    Object.assign(TER, { casilla: m.casilla, texturas: m.texturas, objetos: m.objetos, detalles: m.detalles });
    // variantes: piso_a_2, piso_a_3... (o obj_cajones_2...) se suman solas a las de su nombre base,
    // y cada casilla elige una. Se buscan hasta que falta un numero.
    TER.variantes = {};
    await Promise.all([...m.texturas, ...Object.values(m.objetos).flat()].map(async (id) => {
      if (!TER.imgs[id]) return;
      const lista = [id];
      for (let n = 2; n <= 40; n++) {
        const im = await cargarImagen(base + 'assets/terreno/' + id + '_' + n + '.png');
        if (!im) break;
        im._luz = 'terreno/' + id + '_' + n;
        TER.imgs[id + '_' + n] = im;
        if (id.startsWith('obj_')) TER.sombras[id + '_' + n] = silueta(im);
        lista.push(id + '_' + n);
      }
      if (lista.length > 1) TER.variantes[id] = lista;
    }));
    // tilesets (muro_tiles.png: hoja de 4x5 casillas, ver dibujo.js > tileset) y sus variantes muro_tiles_2...
    TER.tilesets = {};
    await Promise.all(Object.entries(m.tilesets || {}).map(async ([tipo, nombre]) => {
      const lista = [];
      for (let n = 1; n <= 40; n++) {
        const id = n === 1 ? nombre : nombre + '_' + n;
        const im = await cargarImagen(base + 'assets/terreno/' + id + '.png');
        if (!im) break;
        im._luz = 'terreno/' + id;
        TER.imgs[id] = im;
        TER.sombras[id] = silueta(im);
        lista.push(id);
      }
      if (lista.length) TER.tilesets[tipo] = lista;
    }));
    // series numeradas (obj_m_cover_barrels_001, _002... u obj_explosive_barrel_1, _2...): se buscan solas
    // hasta que falta un numero, asi para sumar variantes alcanza con dejar el PNG con el numero que sigue
    await Promise.all(Object.entries(m.series || {}).flatMap(([grupo, prefijos]) => prefijos.map(async (pre) => {
      const lista = (TER.objetos[grupo] = TER.objetos[grupo] || []);
      for (let i = 1; i <= 60; i++) {
        let id = null, im = null;
        for (const n of [String(i).padStart(3, '0'), String(i)]) {
          im = await cargarImagen(base + 'assets/terreno/' + pre + n + '.png');
          if (im) { id = pre + n; break; }
        }
        if (!im) break;
        im._luz = 'terreno/' + id;
        TER.imgs[id] = im;
        TER.sombras[id] = silueta(im);
        lista.push(id);
      }
    })));
    TER.listo = ['piso_a', 'muro_a'].every((id) => TER.imgs[id]);
  } catch { /* sin terreno: se dibuja por codigo */ }
  return TER;
}

// Color de equipo del arte nuevo: cambia los pixeles pintados con los colores de marca (reglas.arte.color_equipo)
// por los del bando. Devuelve un lienzo listo para dibujar (o la misma imagen si no hay nada que cambiar).
// (de paso: los pixeles magenta #ff00ff marcan las puntas de las armas -uno por cañon-; se anotan en ._puntas
// y se borran del dibujo). Los amarillos #ffff00 marcan los faros (en la cabeza o el torso): van a ._faros.
export function pintarEquipo(im, bando, config) {
  const aRGB = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const conColor = !!(config && config.marca && config[bando]);
  const marca = conColor ? config.marca.map(aRGB) : [], destino = conColor ? config[bando].map(aRGB) : [];
  const c = document.createElement('canvas');
  c.width = im.width; c.height = im.height;
  const x = c.getContext('2d');
  x.drawImage(im, 0, 0);
  const px = x.getImageData(0, 0, c.width, c.height);
  const d = px.data;
  let cambios = 0;
  const puntas = [], faros = [];
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    if (d[i] >= 215 && d[i + 1] <= 40 && d[i + 2] >= 215) {
      const p = i / 4;
      puntas.push([(p % c.width) + 0.5, Math.floor(p / c.width) + 0.5]);
      d[i + 3] = 0;
      cambios++;
      continue;
    }
    if (d[i] >= 215 && d[i + 1] >= 215 && d[i + 2] <= 40) {
      const p = i / 4;
      faros.push([(p % c.width) + 0.5, Math.floor(p / c.width) + 0.5]);
      d[i + 3] = 0;
      cambios++;
      continue;
    }
    for (let k = 0; k < marca.length; k++) {
      const [r, g, b] = marca[k];
      // (tolera una diferencia minima por si el programa de dibujo redondeo el color)
      if (Math.abs(d[i] - r) <= 6 && Math.abs(d[i + 1] - g) <= 6 && Math.abs(d[i + 2] - b) <= 6) {
        [d[i], d[i + 1], d[i + 2]] = destino[Math.min(k, destino.length - 1)];
        cambios++;
        break;
      }
    }
  }
  if (!cambios) return im;
  x.putImageData(px, 0, 0);
  c._luz = im._luz;
  if (puntas.length) c._puntas = puntas;
  if (faros.length) c._faros = faros;
  return c;
}
