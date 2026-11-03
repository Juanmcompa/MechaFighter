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

export async function cargarSprites(base = './', cantidadRetratos = 0) {
  try {
    const r = await fetch(base + 'assets/mecha/sprites.json', { cache: 'no-cache' });
    if (!r.ok) return SPR;
    const meta = await r.json();
    SPR.escala = meta._escala || 1;
    delete meta._escala;
    SPR.meta = meta;
    const pedidos = [];
    for (const color of ['azul', 'rojo', 'verde']) {
      for (const id of Object.keys(meta)) {
        pedidos.push(cargarImagen(base + 'assets/mecha/' + color + '/' + id + '.png').then((im) => { if (im) SPR.imgs[color + '/' + id] = im; }));
      }
    }
    await Promise.all(pedidos);
    SPR.listo = Object.keys(SPR.imgs).length > 0;
    SPR.retratos = cantidadRetratos;
  } catch { /* sin sprites: se dibuja por codigo */ }
  return SPR;
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
      TER.imgs[id] = im;
      if (id.startsWith('obj_')) TER.sombras[id] = silueta(im);
    })));
    Object.assign(TER, { casilla: m.casilla, texturas: m.texturas, objetos: m.objetos, detalles: m.detalles });
    TER.listo = ['piso_a', 'muro_a'].every((id) => TER.imgs[id]);
  } catch { /* sin terreno: se dibuja por codigo */ }
  return TER;
}
