// Dibujos provisorios hechos con codigo (placeholders). Cuando esten los sprites finales (Nano Banana, como en
// BeastMixer), cada funcion dibujarX puede usar la imagen y, si no cargo, volver a esto.
// Vista cenital: el "frente" de cada unidad mira hacia +x antes de rotar.

import { SPR, sprite, TER, UNI } from './sprites.js';
import { pintar, pintarRecorte, CAPAS, LUZ } from './luz.js';

export const COLORES = {
  piso: '#1a1e16', pisoLinea: 'rgba(143,220,90,0.05)',
  muro: '#3a4233', muroLuz: '#4d5843', muroSombra: '#252b20',
  media: '#5a5240', mediaLuz: '#76694f',
  total: '#6e7a5e', totalLuz: '#8c9a78',
  peligro: '#3b2416', peligroRaya: '#a8582a',
  zona: '#e0a43a',
  bando: [
    { base: '#4a8fd1', luz: '#7fb6ea', sombra: '#2b5a88' },
    { base: '#c4473b', luz: '#e57a6c', sombra: '#7e2a22' }
  ],
  metal: '#59615a', metalOscuro: '#2e332f', visor: '#cfeaff',
  mutante: { base: '#7a9a4a', luz: '#a9c46e', sombra: '#4d6430' },
  carne: { base: '#b08070', luz: '#d6a796', sombra: '#73503f' }
};

// Numero fijo por casilla (siempre el mismo para el mismo mapa): elige variantes sin usar azar.
function ruido(x, y, sal = 0) {
  let h = (x * 374761393 + y * 668265263 + sal * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) % 1000;
}

const ALTO = { muro: true, cobertura_total: true, edificio: true };

// El mapa con el tileset: pisos y muros que se repiten, coberturas con su sombra y detalles sueltos.
function mapaConArte(ctx, mapa, L) {
  const [ancho, alto] = mapa.tamano;
  const T = (x, y) => (x < 0 || y < 0 || x >= ancho || y >= alto ? 'muro' : mapa.leyenda[mapa.filas[y][x]]);
  const enZona = (x, y) => {
    for (const [nombre, [[x1, y1], [x2, y2]]] of Object.entries(mapa.zonas || {})) {
      if (x >= x1 && x <= x2 && y >= y1 && y <= y2) return nombre;
    }
    return null;
  };
  const img = (id) => TER.imgs[id];
  ctx.imageSmoothingEnabled = false;
  // 1. suelo
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const t = T(x, y), r = ruido(x, y), px = x * L, py = y * L;
      let id;
      // muros con tileset: abajo va piso (la hoja tiene partes transparentes) y arriba la pieza que encaja
      const hoja = tileset(t, x, y);
      if (hoja) id = r < 250 && img('piso_b') ? 'piso_b' : 'piso_a';
      else if (t === 'muro') id = r < 160 && img('muro_b') ? 'muro_b' : 'muro_a';
      else if (t === 'peligro') id = 'acido';
      else {
        const z = enZona(x, y);
        if (z === 'extraccion' && img('franjas')) id = 'franjas';
        else if (z && img('concreto')) id = 'concreto';
        else id = r < 30 && img('rejilla') ? 'rejilla' : r < 250 && img('piso_b') ? 'piso_b' : 'piso_a';
      }
      const im = img(variante(id, x, y)) || img('piso_a');
      pintar(ctx, im, px, py, L, L);
      // el acido brilla solo (si no tiene su propio _e.png)
      if (t === 'peligro' && CAPAS.brillo && im && !LUZ.e[im._luz]) {
        const b = CAPAS.brillo;
        b.setTransform(ctx.getTransform()); b.globalAlpha = 0.12; b.drawImage(im, px, py, L, L); b.globalAlpha = 1;
      }
    }
  }
  // 2. sombras de lo alto sobre el piso (la luz viene de arriba a la izquierda) y borde de los muros
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      if (T(x, y) === 'muro') continue;
      const px = x * L, py = y * L, s = Math.max(2, L * 0.16);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      // (lo que tiene tileset hace su propia sombra, con su forma: ver abajo)
      const alto = (t) => ALTO[t] && !(TER.tilesets && TER.tilesets[t]);
      if (alto(T(x - 1, y))) ctx.fillRect(px, py, s, L);
      if (alto(T(x, y - 1))) ctx.fillRect(px, py, L, s);
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      if (TER.tilesets && TER.tilesets.muro) continue; // el tileset ya trae su borde
      if (T(x - 1, y) === 'muro') ctx.fillRect(px, py, Math.max(1, L / 32), L);
      if (T(x + 1, y) === 'muro') ctx.fillRect(px + L - Math.max(1, L / 32), py, Math.max(1, L / 32), L);
      if (T(x, y - 1) === 'muro') ctx.fillRect(px, py, L, Math.max(1, L / 32));
      if (T(x, y + 1) === 'muro') ctx.fillRect(px, py + L - Math.max(1, L / 32), L, Math.max(1, L / 32));
    }
  }
  // 2b. muros y edificios con tileset: primero la sombra (su silueta corrida abajo a la derecha), despues la pieza
  if (TER.tilesets && Object.keys(TER.tilesets).length) {
    // las sombras se juntan en un lienzo aparte y se pasan una sola vez (si no, donde se pisan queda mas oscuro)
    const capa = document.createElement('canvas');
    capa.width = ctx.canvas.width; capa.height = ctx.canvas.height;
    const cs = capa.getContext('2d');
    cs.setTransform(ctx.getTransform()); cs.imageSmoothingEnabled = false;
    for (const sombra of [true, false]) {
      for (let y = 0; y < alto; y++) {
        for (let x = 0; x < ancho; x++) {
          const hoja = tileset(T(x, y), x, y);
          if (hoja) pintarTile(sombra ? cs : ctx, hoja, T, T(x, y), x, y, L, sombra);
        }
      }
      if (sombra) {
        ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 0.45; ctx.drawImage(capa, 0, 0); ctx.restore();
      }
    }
  }
  // 3. detalles sueltos sobre el piso libre
  const det = TER.detalles;
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      if (T(x, y) !== 'piso' || !det.length || ruido(x, y, 7) >= 65 || enZona(x, y)) continue;
      const im = img(det[ruido(x, y, 3) % det.length]);
      if (!im) continue;
      const k = escalaArte(im, L);
      const w = im.width * k, h = im.height * k;
      ctx.globalAlpha = 0.85;
      pintar(ctx, im, x * L + (L - w) / 2, y * L + (L - h) / 2, w, h);
      ctx.globalAlpha = 1;
    }
  }
  // 4. coberturas, con su sombra
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const t = T(x, y);
      const lista = t === 'media_cobertura' ? TER.objetos.baja : t === 'cobertura_total' ? TER.objetos.alta : null;
      if (!lista || !lista.length) continue;
      objeto(ctx, lista[ruido(x, y, 5) % lista.length], x, y, L, t === 'cobertura_total' ? 0.14 : 0.08);
    }
  }
  rompibles(ctx, T, ancho, alto, L);
}

// ---------- Tilesets (muros y edificios que encajan entre si) ----------
// Hoja de 4 columnas x 5 filas de 32 px. Las 16 primeras: el cuadro numero N (columna + fila x 4) es la pieza que
// sigue hacia los lados de N, sumando N=1, E=2, S=4, O=8. La fila 5: rincones de adentro NE, SE, SO, NO
// (se usa su cuarto de la esquina, cuando dos lados siguen pero la diagonal no).
function tileset(t, x, y) {
  const v = TER.tilesets && TER.tilesets[t];
  return v ? TER.imgs[v[ruido(x, y, 17) % v.length]] : null;
}

function pintarTile(ctx, im, T, t, x, y, L, sombra = false) {
  const mismo = (dx, dy) => T(x + dx, y + dy) === t;
  const n = (mismo(0, -1) ? 1 : 0) | (mismo(1, 0) ? 2 : 0) | (mismo(0, 1) ? 4 : 0) | (mismo(-1, 0) ? 8 : 0);
  const c = im.width / 4; // lado de un cuadro en la hoja (32)
  // la sombra es la silueta de la pieza, corrida (asi sigue la forma de la pared y no toda la casilla)
  const d = sombra ? L * 0.14 : 0;
  const fuente = sombra ? TER.sombras[im._luz.replace('terreno/', '')] : im;
  if (!fuente) return;
  const pinta = (sx, sy, sw, sh, dx, dy, dw, dh) => {
    if (sombra) ctx.drawImage(fuente, sx, sy, sw, sh, dx + d, dy + d, dw, dh);
    else pintarRecorte(ctx, im, sx, sy, sw, sh, dx, dy, dw, dh);
  };
  pinta((n % 4) * c, Math.floor(n / 4) * c, c, c, x * L, y * L, L, L);
  if (im.height < c * 5) return;
  // rincones de adentro: [lado 1, lado 2, diagonal, columna en la fila 5, cuarto (0/1 en x, 0/1 en y)]
  for (const [a, b, dx, dy, col] of [[1, 2, 1, -1, 0], [4, 2, 1, 1, 1], [4, 8, -1, 1, 2], [1, 8, -1, -1, 3]]) {
    if ((n & a) && (n & b) && !mismo(dx, dy)) {
      const qx = dx > 0 ? 1 : 0, qy = dy > 0 ? 1 : 0, h = c / 2;
      pinta(col * c + qx * h, 4 * c + qy * h, h, h, x * L + qx * L / 2, y * L + qy * L / 2, L / 2, L / 2);
    }
  }
}

// Si hay variantes de esa imagen (nombre_2, nombre_3...), cada casilla elige una (siempre la misma)
function variante(id, x, y) {
  const v = TER.variantes && TER.variantes[id];
  return v ? v[ruido(x, y, 13) % v.length] : id;
}

// Cuanto se agranda una imagen del terreno: el arte nuevo (medidas multiplo de 32) va a 32 pixeles por casilla;
// el viejo, a terreno.json "casilla" (64)
const escalaArte = (im, L) => (im.width % 32 === 0 && im.height % 32 === 0 ? L / 32 : L / (TER.casilla || 64));

// Un objeto del terreno centrado en su casilla, con su sombra (alto: cuanto se corre la sombra, en casillas)
function objeto(ctx, id, x, y, L, alto) {
  id = variante(id, x, y);
  const im = TER.imgs[id];
  if (!im) return false;
  const k = escalaArte(im, L);
  const w = im.width * k, h = im.height * k, ox = x * L + (L - w) / 2, oy = y * L + (L - h) / 2;
  if (TER.sombras[id]) {
    ctx.globalAlpha = 0.5;
    ctx.drawImage(TER.sombras[id], ox + L * alto, oy + L * alto, w, h);
    ctx.globalAlpha = 1;
  }
  pintar(ctx, im, ox, oy, w, h);
  return true;
}

// Lo que se puede romper (dibujo provisorio hasta que llegue el arte): edificios, escombros, barriles, quemaduras.
// Si en assets/terreno hay una imagen con el nombre del tipo (edificio, escombros, barril...), se usa esa.
function rompibles(ctx, T, ancho, alto, L) {
  const R = (x, y, s) => ruido(x, y, s) / 1000;
  const cascotes = (px, py, x, y, n, tam, colores) => {
    for (let i = 0; i < n; i++) {
      const cx = px + L * (0.15 + 0.7 * R(x, y, 20 + i)), cy = py + L * (0.15 + 0.7 * R(x, y, 40 + i));
      const w = L * tam * (0.6 + 0.8 * R(x, y, 60 + i)), h = w * (0.5 + 0.6 * R(x, y, 80 + i));
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(cx - w / 2 + L * 0.04, cy - h / 2 + L * 0.04, w, h);
      ctx.fillStyle = colores[i % colores.length]; ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
    }
  };
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const t = T(x, y), px = x * L, py = y * L;
      // arte cargado: una serie (terreno.json "series") o una imagen con el nombre del tipo
      const serie = TER.objetos && TER.objetos[t];
      if (serie && serie.length && objeto(ctx, serie[ruido(x, y, 5) % serie.length], x, y, L, t === 'edificio' ? 0.14 : 0.08)) continue;
      if (t !== 'piso' && t !== 'muro' && t !== 'peligro' && TER.imgs && TER.imgs[t]) { pintar(ctx, TER.imgs[t], px, py, L, L); continue; }
      if (t === 'edificio' && !tileset(t, x, y)) {
        // techo visto desde arriba; borde mas oscuro donde termina el edificio
        const b = L * 0.14;
        ctx.fillStyle = '#2c333b'; ctx.fillRect(px, py, L, L);
        ctx.fillStyle = '#4f5a66';
        const iz = T(x - 1, y) === 'edificio' ? 0 : b, de = T(x + 1, y) === 'edificio' ? 0 : b;
        const ar = T(x, y - 1) === 'edificio' ? 0 : b, ab = T(x, y + 1) === 'edificio' ? 0 : b;
        ctx.fillRect(px + iz, py + ar, L - iz - de, L - ar - ab);
        ctx.fillStyle = '#5f6b78'; if (ar) ctx.fillRect(px + iz, py + ar, L - iz - de, Math.max(1, L * 0.04));
        // ventilaciones y cajas del techo
        const r = ruido(x, y, 9);
        ctx.fillStyle = '#39424b';
        if (r < 400) ctx.fillRect(px + L * 0.3, py + L * 0.3, L * 0.28, L * 0.2);
        else if (r < 650) { ctx.fillRect(px + L * 0.55, py + L * 0.25, L * 0.14, L * 0.14); ctx.fillRect(px + L * 0.25, py + L * 0.6, L * 0.14, L * 0.14); }
        ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = Math.max(1, L / 40);
        ctx.beginPath(); ctx.moveTo(px + iz, py + L * 0.5); ctx.lineTo(px + L - de, py + L * 0.5); ctx.stroke(); ctx.lineWidth = 1;
      } else if (t === 'escombros') {
        cascotes(px, py, x, y, 7, 0.26, ['#5a5f63', '#6d7175', '#4a4e52', '#7b6f60']);
      } else if (t === 'escombros_bajos') {
        cascotes(px, py, x, y, 4, 0.13, ['#5a5f63', '#6d7175', '#4a4e52']);
      } else if (t === 'piso_quemado') {
        const g = ctx.createRadialGradient(px + L / 2, py + L / 2, 0, px + L / 2, py + L / 2, L * 0.62);
        g.addColorStop(0, 'rgba(10,8,6,0.75)'); g.addColorStop(0.7, 'rgba(20,15,10,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.fillRect(px - L * 0.2, py - L * 0.2, L * 1.4, L * 1.4);
        cascotes(px, py, x, y, 3, 0.1, ['#3a2a20', '#2a2420']);
      } else if (t === 'barril') {
        // tambor rojo con franja amarilla: revienta
        const tambor = (cx, cy, r) => {
          ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.arc(cx + r * 0.25, cy + r * 0.25, r, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#8e2f1f'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#e2b23a'; ctx.lineWidth = Math.max(1, r * 0.22); ctx.beginPath(); ctx.arc(cx, cy, r * 0.72, 0, Math.PI * 2); ctx.stroke();
          ctx.fillStyle = '#c4452c'; ctx.beginPath(); ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#2a1a14'; ctx.beginPath(); ctx.arc(cx + r * 0.2, cy - r * 0.2, r * 0.12, 0, Math.PI * 2); ctx.fill();
          ctx.lineWidth = 1;
        };
        tambor(px + L * 0.4, py + L * 0.42, L * 0.24);
        if (ruido(x, y, 11) < 600) tambor(px + L * 0.7, py + L * 0.68, L * 0.17);
      }
    }
  }
}

export function dibujarMapa(ctx, mapa, L) {
  if (TER.listo) { mapaConArte(ctx, mapa, L); zonas(ctx, mapa, L); return; }
  const [ancho, alto] = mapa.tamano;
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const t = mapa.leyenda[mapa.filas[y][x]];
      const px = x * L, py = y * L;
      ctx.fillStyle = COLORES.piso;
      ctx.fillRect(px, py, L, L);
      ctx.strokeStyle = COLORES.pisoLinea;
      ctx.strokeRect(px + 0.5, py + 0.5, L - 1, L - 1);
      if (t === 'muro') bloque(ctx, px, py, L, L, COLORES.muro, COLORES.muroLuz, COLORES.muroSombra);
      else if (t === 'cobertura_total') bloque(ctx, px + L * 0.08, py + L * 0.08, L * 0.84, L * 0.84, COLORES.total, COLORES.totalLuz, COLORES.muroSombra);
      else if (t === 'media_cobertura') {
        // cajones bajos
        bloque(ctx, px + L * 0.15, py + L * 0.2, L * 0.7, L * 0.6, COLORES.media, COLORES.mediaLuz, COLORES.muroSombra);
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath(); ctx.moveTo(px + L * 0.15, py + L * 0.2); ctx.lineTo(px + L * 0.85, py + L * 0.8); ctx.stroke();
      } else if (t === 'peligro') {
        ctx.fillStyle = COLORES.peligro;
        ctx.fillRect(px, py, L, L);
        ctx.strokeStyle = COLORES.peligroRaya;
        ctx.lineWidth = Math.max(1, L / 10);
        ctx.beginPath();
        for (let k = -L; k < L; k += L / 3) { ctx.moveTo(px + k, py + L); ctx.lineTo(px + k + L, py); }
        ctx.save(); ctx.clip(new Path2D(`M${px} ${py}h${L}v${L}h${-L}z`)); ctx.stroke(); ctx.restore();
        ctx.lineWidth = 1;
      }
    }
  }
  rompibles(ctx, (x, y) => (x < 0 || y < 0 || x >= ancho || y >= alto ? 'muro' : mapa.leyenda[mapa.filas[y][x]]), ancho, alto, L);
  zonas(ctx, mapa, L);
}

function zonas(ctx, mapa, L) {
  ctx.setLineDash([L / 4, L / 6]);
  ctx.strokeStyle = COLORES.zona;
  ctx.lineWidth = Math.max(1.5, L / 16);
  for (const [, [[x1, y1], [x2, y2]]] of Object.entries(mapa.zonas || {})) {
    ctx.strokeRect(x1 * L + 2, y1 * L + 2, (x2 - x1 + 1) * L - 4, (y2 - y1 + 1) * L - 4);
  }
  ctx.setLineDash([]);
  ctx.lineWidth = 1;
}

function bloque(ctx, x, y, w, h, base, luz, sombra) {
  ctx.fillStyle = sombra;
  ctx.fillRect(x, y + h * 0.12, w, h * 0.88);
  ctx.fillStyle = base;
  ctx.fillRect(x, y, w, h * 0.86);
  ctx.fillStyle = luz;
  ctx.fillRect(x, y, w, Math.max(1, h * 0.12));
}

// ---------- Unidades ----------

// u: { ficha, x, y (en casillas, con decimales), ang, paso (0..1 del caminar), vida, viva, golpe (0..1) }
export function dibujarUnidad(ctx, u, L, t) {
  const f = u.ficha;
  // infanteria: cada soldadito se dibuja donde esta (no en la casilla del peloton)
  if (f.figuras && UNI.imgs[f.figuras[0]]) { if (u.viva) dibujarPeloton(ctx, f, u, L); return; }
  ctx.save();
  ctx.translate((u.x + 0.5) * L, (u.y + 0.5) * L);
  // sombra
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(L * 0.04, L * 0.08, L * 0.38, L * 0.3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.rotate(u.ang);
  // peso: retroceso al disparar (hacia atras) y el cuerpo que sube un poco a mitad de cada paso
  if (u.retroceso) ctx.translate(-u.retroceso * L * 0.07, 0);
  if (u.alza) { const k = 1 + u.alza * 0.035; ctx.scale(k, k); }
  if (!u.viva) ctx.globalAlpha = 0.85;
  const s = L / 24; // todo se dibuja en una grilla de 24 y se escala (ocupa casi toda la casilla)
  ctx.scale(s, s);
  if (!u.viva) dibujarRestos(ctx, f, u);
  else if (UNI.imgs[f.sprite]) dibujarUnidadSprite(ctx, f, u, t);
  else if (f.cuerpo === 'dron') dibujarDronSimple(ctx, f);
  else if (f.cuerpo === 'mutante') dibujarMutante(ctx, f, u, t);
  else if (f.cuerpo === 'infanteria') dibujarSoldado(ctx, f, u);
  else if (f.sprite === 'torreta') dibujarTorreta(ctx, f, u);
  else if (f.sprite === 'senuelo') dibujarSenuelo(ctx, f, u, t);
  else if (f.sprite === 'transporte') dibujarTransporte(ctx, f, u);
  else dibujarMecha(ctx, f, u);
  ctx.restore();
}

function colorBando(f) { return COLORES.bando[f.bando] || COLORES.bando[1]; }

function rect(ctx, x, y, w, h, fill, borde) {
  ctx.fillStyle = fill; ctx.fillRect(x, y, w, h);
  if (borde) { ctx.strokeStyle = borde; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); }
}

function dibujarArma(ctx, tipo, lado) {
  // lado: -1 izquierda (arriba en pantalla antes de rotar), 1 derecha
  const y = lado * 9;
  switch (tipo) {
    case 'rafaga': rect(ctx, 2, y - 3, 13, 6, COLORES.metalOscuro, '#000'); rect(ctx, 13, y - 2, 4, 1.5, '#888'); rect(ctx, 13, y + 0.5, 4, 1.5, '#888'); break;
    case 'riel': rect(ctx, 0, y - 2, 18, 4, '#3d4a52', '#000'); rect(ctx, 4, y - 1, 12, 2, '#6fd3ff'); break;
    case 'llama': rect(ctx, -2, y - 3, 6, 6, '#a8452a', '#000'); rect(ctx, 3, y - 1.5, 10, 3, COLORES.metalOscuro); break;
    case 'misil': rect(ctx, -1, y - 4, 12, 8, '#5a5f45', '#000'); for (let k = 0; k < 3; k++) rect(ctx, 9, y - 3 + k * 2.4, 3, 1.6, '#d9553f'); break;
    case 'tajo': ctx.fillStyle = '#d8e6f0'; ctx.beginPath(); ctx.moveTo(2, y - 1); ctx.lineTo(17, y); ctx.lineTo(2, y + 2); ctx.fill(); break;
    case 'escudo': ctx.fillStyle = COLORES.metal; ctx.beginPath(); ctx.arc(2, y, 7, -0.9, 0.9); ctx.lineTo(2, y); ctx.fill(); ctx.strokeStyle = '#000'; ctx.stroke(); break;
    default: rect(ctx, 2, y - 1.5, 12, 3, COLORES.metalOscuro, '#000');
  }
}

// Mecha armado con los sprites de sus partes (si cargaron todas las que necesita).
// Los sprites miran hacia ARRIBA: se gira 90 grados para que miren hacia +x como el resto del dibujo.
function mechaConSprites(ctx, f, u) {
  if (!SPR.listo || !f.apariencia) return false;
  const color = f.bando === 0 ? 'azul' : 'rojo';
  const a = f.apariencia;
  const torso = sprite(color, a.torso);
  if (!torso) return false;
  const E = SPR.escala;
  const M = (id) => SPR.meta[id];
  const T = M(a.torso);
  const tw = T.w / E, th = T.h / E;
  ctx.save();
  ctx.rotate(Math.PI / 2);
  ctx.imageSmoothingEnabled = false;
  // dibuja la parte id con su punto de enganche en (x, y); espejo = del lado izquierdo.
  // Piezas "de papel" (el arte nuevo de 32x32): todas comparten el centro del mecha y ya vienen ubicadas
  // (el brazo y la pierna se dibujan del lado derecho; el izquierdo es el mismo espejado). Solo se mueve el paso.
  const pieza = (id, x, y, espejo = false, pasoPapel = 0) => {
    const im = sprite(color, id);
    if (!im) return;
    const m = M(id);
    const w = m.w / E, h = m.h / E;
    const [ax, ay] = m.papel ? [w / 2, h / 2] : [m.ancla[0] / E, m.ancla[1] / E];
    if (m.papel) { x = 0; y = pasoPapel; }
    ctx.save();
    ctx.translate(x, y);
    if (espejo) ctx.scale(-1, 1);
    pintar(ctx, im, -ax, -ay, w, h);
    ctx.restore();
  };
  const zancada = Math.sin(u.paso * Math.PI * 2) * 1.6;
  const piernas = a.piernas;
  // cada parte puede mirar para otro lado (ver repeticion: angPiernas, angCabeza): se giran respecto del torso
  const rel = (x) => { let d = (x ?? u.ang ?? 0) - (u.ang ?? 0); while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
  ctx.save();
  ctx.rotate(rel(u.angPiernas));
  // Piernas animadas: si existen <piernas>_1, _2 (y _3), son los cuadros del caminar de UNA pierna (la derecha).
  // La izquierda usa el mismo dibujo espejado, medio paso corrido. Quieto, se usa el dibujo de siempre.
  const cuadros = [];
  if (piernas) for (let i = 1; i <= 4 && sprite(color, piernas + '_' + i); i++) cuadros.push(piernas + '_' + i);
  if (cuadros.length) {
    const n = cuadros.length;
    const k = Math.floor(u.paso * n * 2);
    const der = u.anda === false ? piernas : cuadros[k % n];
    const izq = u.anda === false ? piernas : cuadros[(k + Math.max(1, n >> 1)) % n];
    pieza(der, tw * 0.26, th * 0.05, false);
    pieza(izq, -tw * 0.26, th * 0.05, true);
  } else if (piernas) {
    const orugas = piernas.includes('orugas');
    const dx = orugas ? tw * 0.42 : tw * 0.26;
    const dy = orugas ? 0 : th * 0.05;
    pieza(piernas, dx, dy + (orugas ? 0 : zancada), false, orugas ? 0 : zancada);
    pieza(piernas, -dx, dy - (orugas ? 0 : zancada), true, orugas ? 0 : -zancada);
  }
  ctx.restore();
  // de las piernas para arriba: se sacude con los pasos
  if (u.sacude) ctx.translate(u.sacude[0], u.sacude[1]);
  pintar(ctx, torso, -tw / 2, -th / 2, tw, th);
  // la mochila va encima del torso (se ve desde arriba, colgada en la espalda)
  if (a.mochila && a.mochila !== 'mochila_vacia') pieza(a.mochila, 0, th * 0.38);
  // brazos; el que pega cuerpo a cuerpo sale para adelante y barre
  const brazo = (slot, x, espejo) => {
    const id = a[slot];
    if (!id) return;
    if (u.estocada > 0 && u.estocadaSlot === slot) {
      const k = 1 - u.estocada; // 0 -> 1
      const avance = Math.sin(k * Math.PI) * th * 0.55;
      const barre = (0.7 - k * 1.4) * (espejo ? -1 : 1);
      ctx.save();
      // (las piezas de papel ya vienen ubicadas: solo se corren para adelante)
      if (M(id).papel) ctx.translate(0, -avance); else ctx.translate(x, -th * 0.05 - avance);
      ctx.rotate(barre);
      pieza(id, 0, 0, espejo);
      ctx.restore();
    } else pieza(id, x, -th * 0.05, espejo);
  };
  brazo('brazo_der', tw * 0.5, false);
  brazo('brazo_izq', -tw * 0.5, true);
  if (a.cabeza) {
    ctx.save();
    if (!M(a.cabeza).papel) ctx.translate(0, -th * 0.12);
    ctx.rotate(rel(u.angCabeza));
    pieza(a.cabeza, 0, 0);
    ctx.restore();
  }
  // marcas de bajas pintadas en la espalda del torso: palitos de a cinco, como en una celda
  const marcas = Math.min(u.marcas || f.marcas || 0, 15);
  if (marcas) {
    ctx.fillStyle = '#f2c94c';
    const x0 = -tw / 2 + 1.2, y0 = th * 0.22;
    for (let i = 0; i < marcas; i++) {
      const grupo = Math.floor(i / 5), j = i % 5;
      const x = x0 + grupo * 4.2 + j * 0.75;
      if (j === 4) { ctx.save(); ctx.translate(x - 1.5, y0 + 0.9); ctx.rotate(-0.9); ctx.fillRect(-1.8, -0.2, 3.6, 0.45); ctx.restore(); }
      else ctx.fillRect(x, y0, 0.45, 1.8);
    }
  }
  if (u.golpe > 0) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = u.golpe * 0.6;
    pintar(ctx, torso, -tw / 2, -th / 2, tw, th);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();
  return true;
}

// ---------- Boca de las armas ----------
// Donde estan las puntas del arma en la imagen (en pixeles): los pixeles magenta si los tenia (ver pintarEquipo;
// uno por cañon, y los disparos se turnan entre ellos), si no el medio de la fila de mas arriba
// (los brazos apuntan para arriba en el dibujo)
const PUNTAS = new WeakMap();
function puntasEnImagen(im) {
  if (im._puntas) return im._puntas;
  let p = PUNTAS.get(im);
  if (p) return p;
  const c = document.createElement('canvas');
  c.width = im.width; c.height = im.height;
  const x = c.getContext('2d');
  x.drawImage(im, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height).data;
  p = [[im.width / 2, 0]];
  fila: for (let y = 0; y < c.height; y++) {
    let suma = 0, n = 0;
    for (let xx = 0; xx < c.width; xx++) if (d[(y * c.width + xx) * 4 + 3] > 40) { suma += xx; n++; }
    if (n) { p = [[suma / n + 0.5, y + 0.5]]; break fila; }
  }
  PUNTAS.set(im, p);
  return p;
}

// Donde sale el disparo del arma de ese encaje (brazo_der, brazo_izq, mochila...), en casillas, respecto del
// centro de la unidad y mirando para la derecha: [hacia adelante, hacia el costado derecho]. null = no se sabe.
// Usa las mismas posiciones con las que se arma el mecha en mechaConSprites. n: numero de disparo (para turnar cañones).
export function bocaDeArma(f, slot, n = 0) {
  // unidades de un solo dibujo (tanques, drones): las marcas magenta de la torreta o del cuerpo
  if (!f.apariencia && UNI.imgs[f.sprite] && UNI.meta[f.sprite] && UNI.meta[f.sprite].nuevo) {
    const im = UNI.imgs[f.sprite + '_torreta'] || UNI.imgs[f.sprite];
    if (!im._puntas) return null;
    const [px, py] = im._puntas[n % im._puntas.length];
    const k = 0.75 / 24; // pixeles de la imagen -> casillas
    return [-(py - im.height / 2) * k, (px - im.width / 2) * k];
  }
  const a = f.apariencia;
  if (!a || !a.torso || !SPR.listo) return null;
  const M = (id) => SPR.meta[id];
  const id = a[slot];
  if (!M(a.torso) || !id || !M(id)) return null;
  const im = sprite('azul', id);
  if (!im || !['brazo_der', 'brazo_izq', 'mochila', 'cabeza', 'torso'].includes(slot)) return null;
  const puntas = puntasEnImagen(im);
  return puntoEnPieza(f, slot, puntas[n % puntas.length]);
}

// Un punto (en pixeles de la imagen de la pieza de ese encaje) pasado a casillas: [adelante, costado derecho]
function puntoEnPieza(f, slot, [px, py]) {
  const a = f.apariencia;
  const E = SPR.escala, M = (id) => SPR.meta[id];
  const T = M(a.torso), id = a[slot];
  const im = sprite('azul', id);
  const tw = T.w / E, th = T.h / E;
  const lugar = { brazo_der: [tw * 0.5, -th * 0.05, 1], brazo_izq: [-tw * 0.5, -th * 0.05, -1], mochila: [0, th * 0.38, 1], cabeza: [0, -th * 0.12, 1], torso: [0, 0, 1] }[slot];
  let [x, y, lado] = lugar;
  const m = M(id), w = m.w / E, h = m.h / E;
  const [ax, ay] = m.papel || slot === 'torso' ? [w / 2, h / 2] : [m.ancla[0] / E, m.ancla[1] / E];
  if (m.papel) { x = 0; y = 0; }
  const lx = x + lado * (px * (w / im.width) - ax), ly = y + (py * (h / im.height) - ay);
  // el mecha se dibuja girado 90 grados y en una grilla de 24 por casilla
  return [-ly / 24, lx / 24];
}

// Los faros del mecha (pixeles amarillos #ffff00 en la cabeza o, si no, en el torso): [[adelante, costado], ...]
// o null si no tiene (entonces el faro sale del centro)
export function farosDe(f) {
  const a = f.apariencia;
  if (!a || !a.torso || !SPR.listo || !SPR.meta[a.torso]) return null;
  for (const slot of ['cabeza', 'torso']) {
    const im = a[slot] && SPR.meta[a[slot]] && sprite('azul', a[slot]);
    if (im && im._faros) return im._faros.slice(0, 2).map((p) => puntoEnPieza(f, slot, p));
  }
  return null;
}

// La boca del arma en el mapa (en casillas) para una unidad mirando con angulo ang
export function bocaEnMapa(u, slot, ang = u.ang, n = 0) {
  const b = bocaDeArma(u.ficha, slot, n) || [0.62, 0];
  const c = Math.cos(ang), s = Math.sin(ang);
  return [u.x + c * b[0] - s * b[1], u.y + s * b[0] + c * b[1]];
}

function dibujarMecha(ctx, f, u) {
  if (mechaConSprites(ctx, f, u)) return;
  const c = colorBando(f);
  const a = f.apariencia || {};
  const pesado = (a.torso || '').includes('pesado'), ligero = (a.torso || '').includes('ligero');
  const ancho = pesado ? 18 : ligero ? 13 : 15;
  // piernas: se balancean al caminar
  const zancada = Math.sin(u.paso * Math.PI * 2) * 3;
  if ((a.piernas || '').includes('orugas')) {
    rect(ctx, -11, -11, 22, 5, COLORES.metalOscuro, '#000'); rect(ctx, -11, 6, 22, 5, COLORES.metalOscuro, '#000');
  } else {
    rect(ctx, -4 + zancada, -8, 9, 5, COLORES.metal, '#000'); rect(ctx, -4 - zancada, 3, 9, 5, COLORES.metal, '#000');
  }
  // mochila
  if (a.mochila && a.mochila !== 'mochila_vacia') rect(ctx, -12, -5, 6, 10, (a.mochila || '').includes('reparacion') ? '#5fb84a' : COLORES.metalOscuro, '#000');
  // brazos y armas
  const armas = f.armas || [];
  const tipoDe = (slot) => (armas.find((w) => w.slot === slot) || {}).tipoVisual || null;
  const izq = a.brazo_izq ? (a.brazo_izq.includes('escudo') ? 'escudo' : tipoDe('brazo_izq')) : null;
  const der = a.brazo_der ? (a.brazo_der.includes('escudo') ? 'escudo' : tipoDe('brazo_der')) : null;
  if (izq) dibujarArma(ctx, izq, -1);
  if (der) dibujarArma(ctx, der, 1);
  rect(ctx, -3, -ancho / 2 - 3, 6, 4, c.sombra, '#000');
  rect(ctx, -3, ancho / 2 - 1, 6, 4, c.sombra, '#000');
  // torso
  ctx.fillStyle = c.sombra;
  ctx.fillRect(-ancho / 2, -ancho / 2 + 1, ancho, ancho);
  ctx.fillStyle = c.base;
  ctx.fillRect(-ancho / 2, -ancho / 2, ancho, ancho - 1);
  ctx.fillStyle = c.luz;
  ctx.fillRect(-ancho / 2, -ancho / 2, ancho, 2);
  ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
  ctx.strokeRect(-ancho / 2 + 0.5, -ancho / 2 + 0.5, ancho - 1, ancho - 1);
  // cabeza con visor
  rect(ctx, 0, -3.5, 7, 7, COLORES.metal, '#000');
  rect(ctx, 4, -2.5, 2.5, 5, (a.cabeza || '').includes('optica') ? '#ffcf5a' : COLORES.visor);
  if (u.golpe > 0) { ctx.fillStyle = `rgba(255,255,255,${u.golpe * 0.7})`; ctx.fillRect(-ancho / 2, -ancho / 2, ancho, ancho); }
}

function dibujarSoldado(ctx, f, u) {
  const c = colorBando(f);
  const zancada = Math.sin(u.paso * Math.PI * 2) * 2;
  rect(ctx, -2 + zancada, -5, 5, 3, '#3a3a30'); rect(ctx, -2 - zancada, 2, 5, 3, '#3a3a30');
  dibujarArma(ctx, (f.armas[0] || {}).tipoVisual || 'bala', 0.4);
  ctx.fillStyle = c.sombra; ctx.beginPath(); ctx.ellipse(0, 0, 6, 8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#4d5a3a'; ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#000'; ctx.stroke();
  ctx.fillStyle = c.base; ctx.fillRect(-1, -4, 2, 8);
  if (u.golpe > 0) { ctx.fillStyle = `rgba(255,255,255,${u.golpe * 0.7})`; ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill(); }
}

function dibujarMutante(ctx, f, u, t) {
  const c = f.sprite === 'mutante_carne' ? COLORES.carne : COLORES.mutante;
  const late = 1 + Math.sin(t / 3 + u.semilla) * 0.06;
  const zancada = Math.sin(u.paso * Math.PI * 2) * 4;
  ctx.fillStyle = c.sombra;
  for (const [x, y] of [[6 + zancada, -9], [6 - zancada, 9], [-5 - zancada, -10], [-5 + zancada, 10]]) {
    ctx.beginPath(); ctx.ellipse(x, y, 4, 2.5, 0.4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.save(); ctx.scale(late, late);
  ctx.fillStyle = c.base; ctx.beginPath(); ctx.ellipse(0, 0, 11, 9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = c.luz; ctx.beginPath(); ctx.ellipse(-2, -3, 6, 3.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#1d2412'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(0, 0, 11, 9, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
  // cabeza y fauces
  ctx.fillStyle = c.sombra; ctx.beginPath(); ctx.arc(10, 0, 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e8dcc0'; ctx.fillRect(13, -2, 3, 1.2); ctx.fillRect(13, 1, 3, 1.2);
  ctx.fillStyle = '#ffdf4a'; ctx.fillRect(9, -3, 1.5, 1.5); ctx.fillRect(9, 1.5, 1.5, 1.5);
  if (u.golpe > 0) { ctx.fillStyle = `rgba(255,255,255,${u.golpe * 0.6})`; ctx.beginPath(); ctx.ellipse(0, 0, 12, 10, 0, 0, Math.PI * 2); ctx.fill(); }
}

function dibujarTorreta(ctx, f, u) {
  const c = colorBando(f);
  rect(ctx, -9, -9, 18, 18, COLORES.metalOscuro, '#000');
  rect(ctx, -6, -6, 12, 12, c.base, '#000');
  rect(ctx, 2, -1.5, 13, 3, '#222', '#000');
  if (u.golpe > 0) { ctx.fillStyle = `rgba(255,255,255,${u.golpe * 0.7})`; ctx.fillRect(-9, -9, 18, 18); }
}

// ---------- Infanteria: pelotones de hormiguitas ----------
// Cada soldadito tiene su propia posicion en el mapa (en casillas) y sigue al peloton a su ritmo: unos se
// adelantan, otros quedan atras, se abren y se juntan. El motor solo sabe en que casilla esta el peloton.
const ESCALA_SOLDADO = 0.72; // mas chiquitos que el dibujo original: son hormigas al lado de un mecha

export function miembrosVivos(f, vida) {
  const m = f.miembros || 1;
  return m <= 1 ? (vida > 0 ? 1 : 0) : Math.max(0, Math.ceil((Math.max(0, vida) * m) / f.vidaMax));
}

// Que dibujo usa el soldadito i de la unidad (fijo por unidad)
export function figuraDe(f, u, i) {
  const off = Math.floor(u.semilla * 10);
  return f.figuras[(i + off) % f.figuras.length];
}

// numero "al azar" fijo por unidad y soldadito (la vista no usa el azar del motor)
const azarVista = (a, b) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };

// Donde le gustaria estar al soldadito i respecto del centro del peloton (en casillas, mirando a +x)
function lugarMiembro(u, i, n) {
  const id = Number(u.id.slice(1));
  const radio = 0.18 + 0.09 * n;
  const ang = (i / n) * Math.PI * 2 + azarVista(id, i) * 1.4;
  const r = radio * (0.45 + 0.55 * azarVista(id + 3, i));
  return { fx: Math.cos(ang) * r * 1.2, fy: Math.sin(ang) * r, ritmo: 0.1 + 0.16 * azarVista(id + 7, i), fase: azarVista(id + 11, i) * 6.28 };
}

// Se llama en cada cuadro: mueve a cada soldadito hacia su lugar (con su ritmo y un vaiven propio)
export function moverTropa(u, T, dt, libre = null) {
  const f = u.ficha;
  const n = f.miembros || 1;
  const cx = u.x + 0.5, cy = u.y + 0.5;
  const cos = Math.cos(u.ang), sin = Math.sin(u.ang);
  if (!u.tropa) {
    u.tropa = [];
    for (let i = 0; i < n; i++) {
      const L = lugarMiembro(u, i, n);
      u.tropa.push({ ...L, x: cx + L.fx * cos - L.fy * sin, y: cy + L.fx * sin + L.fy * cos, ang: u.ang, paso: L.fase });
    }
  }
  const moviendo = u.dur && T < u.t0 + u.dur;
  for (const m of u.tropa) {
    // al avanzar se estiran en fila detras del que va adelante; quietos se abren y van y vienen un poco
    const fx = moviendo ? m.fx * 0.6 - 0.25 : m.fx;
    const fy = moviendo ? m.fy * 0.7 : m.fy;
    const vx = Math.sin(T * 0.045 + m.fase) * 0.1, vy = Math.cos(T * 0.037 + m.fase * 1.3) * 0.1;
    let tx = cx + fx * cos - fy * sin + vx, ty = cy + fx * sin + fy * cos + vy;
    // no se meten adentro de paredes ni contenedores: si el lugar esta tapado, se pegan al centro
    if (libre && !libre(Math.floor(tx), Math.floor(ty))) { tx = cx + (tx - cx) * 0.3; ty = cy + (ty - cy) * 0.3; }
    const k = 1 - Math.pow(1 - m.ritmo, dt);
    const dx = (tx - m.x) * k, dy = (ty - m.y) * k;
    m.x += dx; m.y += dy;
    const d = Math.hypot(dx, dy);
    m.paso += d * 9;
    // mira hacia donde camina; si esta quieto, hacia donde mira el peloton (con un poco de desorden)
    const objetivo = d > 0.004 * Math.max(dt, 0.01) ? Math.atan2(dy, dx) : u.ang + Math.sin(m.fase * 3) * 0.35;
    let dif = objetivo - m.ang;
    while (dif > Math.PI) dif -= Math.PI * 2;
    while (dif < -Math.PI) dif += Math.PI * 2;
    m.ang += dif * Math.min(1, 0.25 * dt);
  }
}

// Posicion actual (en casillas) del soldadito i, para dejar su cuerpo donde cayo
export function posicionMiembro(u, i) {
  const m = u.tropa && u.tropa[i];
  return m ? [m.x, m.y] : [u.x + 0.5, u.y + 0.5];
}

function dibujarPeloton(ctx, f, u, L) {
  const vivos = miembrosVivos(f, u.vida);
  if (!u.tropa) return;
  ctx.imageSmoothingEnabled = false;
  const s = (L / 24) * ESCALA_SOLDADO;
  for (let i = 0; i < vivos && i < u.tropa.length; i++) {
    const id = figuraDe(f, u, i);
    const im = UNI.imgs[id];
    if (!im) continue;
    const meta = UNI.meta[id];
    const w = meta.w / UNI.escala, h = meta.h / UNI.escala;
    const m = u.tropa[i];
    ctx.save();
    ctx.translate(m.x * L, m.y * L);
    ctx.scale(s, s);
    // trote: un saltito al ritmo de sus pasos
    const trote = Math.abs(Math.sin(m.paso)) * 0.5;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(0.6, 0.8, w * 0.32, h * 0.26, 0, 0, Math.PI * 2); ctx.fill();
    ctx.rotate(m.ang + Math.PI / 2);
    ctx.translate(0, -trote);
    if (u.golpe > 0) ctx.filter = 'brightness(' + (1 + u.golpe * 1.5) + ')';
    pintar(ctx, im, -w / 2, -h * 0.62, w, h); // el arma sobresale adelante: el cuerpo queda en el centro
    ctx.filter = 'none';
    ctx.restore();
  }
}

// Los caidos quedan en el piso: cuerpo (o quemado), su mancha y a veces el arma o el casco
export function dibujarCaido(ctx, c, L) {
  const s = L / 24;
  ctx.save();
  ctx.translate(c.x * L, c.y * L);
  ctx.scale(s, s);
  ctx.rotate(c.ang);
  ctx.imageSmoothingEnabled = false;
  for (const id of c.capas) {
    const im = UNI.imgs[id];
    if (!im) continue;
    const m = UNI.meta[id];
    const w = m.w / UNI.escala, h = m.h / UNI.escala;
    const o = c.corridas[id] || [0, 0];
    pintar(ctx, im, o[0] - w / 2, o[1] - h / 2, w, h);
  }
  ctx.restore();
}

// Camion y drones: una imagen entera (assets/unidades), mirando para adelante.
// Los drones flotan: suben y bajan un poco y su sombra queda abajo, corrida.
function dibujarUnidadSprite(ctx, f, u, t) {
  const im = UNI.imgs[f.sprite];
  const m = UNI.meta[f.sprite];
  const w = m.w / UNI.escala, h = m.h / UNI.escala;
  // los drones viejos flotan; el arte nuevo (tanques, acorazados) va por el piso
  const dron = f.cuerpo === 'dron' && !m.nuevo;
  const torreta = UNI.imgs[f.sprite + '_torreta'];
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (dron) {
    const flota = Math.sin((t || 0) / 260 + u.semilla) * 0.8;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.ellipse(3, 4, w * 0.36, h * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.translate(-1.5 + flota * 0.3, -1.5 + flota);
  }
  ctx.rotate(Math.PI / 2);
  if (u.golpe > 0) ctx.filter = 'brightness(' + (1 + u.golpe * 1.5) + ')';
  if (torreta) {
    // casco hacia donde camina (angPiernas), torreta hacia donde apunta (el angulo de la unidad)
    let d = (u.angPiernas ?? u.ang) - u.ang;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    ctx.save(); ctx.rotate(d); pintar(ctx, im, -w / 2, -h / 2, w, h); ctx.restore();
    const tw = torreta.width * 0.75, th = torreta.height * 0.75;
    pintar(ctx, torreta, -tw / 2, -th / 2, tw, th);
  } else pintar(ctx, im, -w / 2, -h / 2, w, h);
  ctx.filter = 'none';
  ctx.restore();
}

// Dron sin sprite (por si no cargo el arte): cruz con cuatro rotores
function dibujarDronSimple(ctx, f) {
  const c = colorBando(f);
  ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-7, -7); ctx.lineTo(7, 7); ctx.moveTo(-7, 7); ctx.lineTo(7, -7); ctx.stroke();
  for (const [x, y] of [[-7, -7], [7, 7], [-7, 7], [7, -7]]) { ctx.fillStyle = 'rgba(200,200,200,0.5)'; ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill(); }
  rect(ctx, -4, -4, 8, 8, c.base, '#000');
}

// Holograma: silueta de mecha en lineas, que titila
function dibujarSenuelo(ctx, f, u, t) {
  const titila = 0.45 + 0.25 * Math.sin((t || 0) / 90 + u.semilla);
  ctx.globalAlpha = titila;
  ctx.strokeStyle = '#7fe8ff'; ctx.lineWidth = 1.5;
  ctx.strokeRect(-8, -9, 16, 18);
  ctx.strokeRect(-12, -6, 4, 12); ctx.strokeRect(8, -6, 4, 12);
  ctx.strokeRect(-3, -3, 6, 6);
  ctx.fillStyle = 'rgba(127,232,255,0.18)'; ctx.fillRect(-8, -9, 16, 18);
  for (let y = -9; y < 9; y += 3) { ctx.fillStyle = 'rgba(127,232,255,0.25)'; ctx.fillRect(-8, y, 16, 1); }
  ctx.globalAlpha = 1;
}

function dibujarTransporte(ctx, f, u) {
  const c = colorBando(f);
  rect(ctx, -15, -11, 30, 4, COLORES.metalOscuro, '#000'); rect(ctx, -15, 7, 30, 4, COLORES.metalOscuro, '#000');
  rect(ctx, -13, -9, 26, 18, '#b9a36a', '#000');
  rect(ctx, 6, -7, 7, 14, c.base, '#000');
  rect(ctx, 9, -5, 3, 10, COLORES.visor);
  ctx.fillStyle = '#e0a43a'; ctx.beginPath(); ctx.arc(-4, 0, 3, 0, Math.PI * 2); ctx.fill();
  if (u.golpe > 0) { ctx.fillStyle = `rgba(255,255,255,${u.golpe * 0.7})`; ctx.fillRect(-13, -9, 26, 18); }
}

function dibujarRestos(ctx, f, u = {}) {
  // con arte: los restos de esa unidad (restos_<sprite>) o uno de la serie de su tipo (restos_mecha_N...)
  const R = UNI.restos || {};
  const lista = R[f.sprite] || R[f.cuerpo || 'mecha'] || (f.apariencia ? R.mecha : null);
  if (lista) {
    const h = [...String(u.id || f.nombre || '')].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0;
    const r = lista[h % lista.length];
    const im = f.bando === 0 ? r.azul : r.rojo;
    ctx.save();
    ctx.rotate(Math.PI / 2);
    const w = im.width * 0.75, hh = im.height * 0.75; // 32 px = 24 unidades = una casilla
    pintar(ctx, im, -w / 2, -hh / 2, w, hh);
    ctx.restore();
    return;
  }
  ctx.fillStyle = f.cuerpo === 'mutante' ? '#3d4a26' : '#24221d';
  ctx.beginPath(); ctx.ellipse(0, 0, 12, 9, 0.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = f.cuerpo === 'mutante' ? '#5b6b33' : '#3d3a32';
  ctx.fillRect(-8, -4, 7, 5); ctx.fillRect(1, 1, 6, 4);
  if (f.cuerpo !== 'mutante') { ctx.fillStyle = colorBando(f).sombra; ctx.fillRect(-3, -3, 6, 6); }
}

// Mecha grande para el hangar (sin rotar, mirando a la derecha).
// Para el taller: un mecha girado (ang en radianes, 0 = mirando a la derecha), con el paso y el golpe que se pida
export function dibujarMechaVisor(ctx, ficha, lado, { ang = -Math.PI / 2, paso = 0.25, golpe = 0, zoom = 1, anda = true } = {}) {
  ctx.save();
  ctx.translate(lado / 2, lado / 2);
  ctx.scale((lado / 34) * zoom, (lado / 34) * zoom);
  ctx.rotate(ang);
  dibujarMecha(ctx, ficha, { paso, golpe, anda, marcas: ficha.marcas || 0 });
  ctx.restore();
}

export function dibujarMechaFicha(ctx, ficha, lado) {
  ctx.clearRect(0, 0, lado, lado);
  ctx.save();
  ctx.translate(lado / 2, lado / 2);
  ctx.scale(lado / 34, lado / 34);
  ctx.rotate(-Math.PI / 2);
  dibujarMecha(ctx, ficha, { paso: 0.25, golpe: 0, anda: false, marcas: ficha.marcas || 0 });
  ctx.restore();
}
