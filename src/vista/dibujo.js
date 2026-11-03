// Dibujos provisorios hechos con codigo (placeholders). Cuando esten los sprites finales (Nano Banana, como en
// BeastMixer), cada funcion dibujarX puede usar la imagen y, si no cargo, volver a esto.
// Vista cenital: el "frente" de cada unidad mira hacia +x antes de rotar.

import { SPR, sprite, TER } from './sprites.js';

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

const ALTO = { muro: true, cobertura_total: true };

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
      if (t === 'muro') id = r < 160 && img('muro_b') ? 'muro_b' : 'muro_a';
      else if (t === 'peligro') id = 'acido';
      else {
        const z = enZona(x, y);
        if (z === 'extraccion' && img('franjas')) id = 'franjas';
        else if (z && img('concreto')) id = 'concreto';
        else id = r < 30 && img('rejilla') ? 'rejilla' : r < 250 && img('piso_b') ? 'piso_b' : 'piso_a';
      }
      ctx.drawImage(img(id) || img('piso_a'), px, py, L, L);
    }
  }
  // 2. sombras de lo alto sobre el piso (la luz viene de arriba a la izquierda) y borde de los muros
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      if (T(x, y) === 'muro') continue;
      const px = x * L, py = y * L, s = Math.max(2, L * 0.16);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      if (ALTO[T(x - 1, y)]) ctx.fillRect(px, py, s, L);
      if (ALTO[T(x, y - 1)]) ctx.fillRect(px, py, L, s);
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      if (T(x - 1, y) === 'muro') ctx.fillRect(px, py, Math.max(1, L / 32), L);
      if (T(x + 1, y) === 'muro') ctx.fillRect(px + L - Math.max(1, L / 32), py, Math.max(1, L / 32), L);
      if (T(x, y - 1) === 'muro') ctx.fillRect(px, py, L, Math.max(1, L / 32));
      if (T(x, y + 1) === 'muro') ctx.fillRect(px, py + L - Math.max(1, L / 32), L, Math.max(1, L / 32));
    }
  }
  // 3. detalles sueltos sobre el piso libre
  const det = TER.detalles;
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      if (T(x, y) !== 'piso' || !det.length || ruido(x, y, 7) >= 65 || enZona(x, y)) continue;
      const im = img(det[ruido(x, y, 3) % det.length]);
      if (!im) continue;
      const k = L / TER.casilla;
      const w = im.width * k, h = im.height * k;
      ctx.globalAlpha = 0.85;
      ctx.drawImage(im, x * L + (L - w) / 2, y * L + (L - h) / 2, w, h);
      ctx.globalAlpha = 1;
    }
  }
  // 4. coberturas, con su sombra
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const t = T(x, y);
      const lista = t === 'media_cobertura' ? TER.objetos.baja : t === 'cobertura_total' ? TER.objetos.alta : null;
      if (!lista || !lista.length) continue;
      const id = lista[ruido(x, y, 5) % lista.length];
      const im = img(id);
      if (!im) continue;
      const k = L / TER.casilla;
      const w = im.width * k, h = im.height * k, ox = x * L + (L - w) / 2, oy = y * L + (L - h) / 2;
      const d = t === 'cobertura_total' ? L * 0.14 : L * 0.08;
      ctx.globalAlpha = 0.5;
      ctx.drawImage(TER.sombras[id], ox + d, oy + d, w, h);
      ctx.globalAlpha = 1;
      ctx.drawImage(im, ox, oy, w, h);
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
  ctx.save();
  ctx.translate((u.x + 0.5) * L, (u.y + 0.5) * L);
  // sombra
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(L * 0.04, L * 0.08, L * 0.38, L * 0.3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.rotate(u.ang);
  if (!u.viva) ctx.globalAlpha = 0.85;
  const s = L / 24; // todo se dibuja en una grilla de 24 y se escala (ocupa casi toda la casilla)
  ctx.scale(s, s);
  if (!u.viva) dibujarRestos(ctx, f);
  else if (f.cuerpo === 'mutante') dibujarMutante(ctx, f, u, t);
  else if (f.cuerpo === 'infanteria') dibujarSoldado(ctx, f, u);
  else if (f.sprite === 'torreta') dibujarTorreta(ctx, f, u);
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
  // dibuja la parte id con su punto de enganche en (x, y); espejo = del lado izquierdo
  const pieza = (id, x, y, espejo = false) => {
    const im = sprite(color, id);
    if (!im) return;
    const m = M(id);
    const w = m.w / E, h = m.h / E, ax = m.ancla[0] / E, ay = m.ancla[1] / E;
    ctx.save();
    ctx.translate(x, y);
    if (espejo) ctx.scale(-1, 1);
    ctx.drawImage(im, -ax, -ay, w, h);
    ctx.restore();
  };
  const zancada = Math.sin(u.paso * Math.PI * 2) * 1.6;
  const piernas = a.piernas;
  if (piernas) {
    const orugas = piernas.includes('orugas');
    const dx = orugas ? tw * 0.42 : tw * 0.26;
    const dy = orugas ? 0 : th * 0.05;
    pieza(piernas, dx, dy + (orugas ? 0 : zancada), false);
    pieza(piernas, -dx, dy - (orugas ? 0 : zancada), true);
  }
  if (a.mochila && a.mochila !== 'mochila_vacia') pieza(a.mochila, 0, th * 0.38);
  ctx.drawImage(torso, -tw / 2, -th / 2, tw, th);
  if (a.brazo_der) pieza(a.brazo_der, tw * 0.5, -th * 0.05, false);
  if (a.brazo_izq) pieza(a.brazo_izq, -tw * 0.5, -th * 0.05, true);
  if (a.cabeza) pieza(a.cabeza, 0, -th * 0.12);
  if (u.golpe > 0) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = u.golpe * 0.6;
    ctx.drawImage(torso, -tw / 2, -th / 2, tw, th);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();
  return true;
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

function dibujarTransporte(ctx, f, u) {
  const c = colorBando(f);
  rect(ctx, -15, -11, 30, 4, COLORES.metalOscuro, '#000'); rect(ctx, -15, 7, 30, 4, COLORES.metalOscuro, '#000');
  rect(ctx, -13, -9, 26, 18, '#b9a36a', '#000');
  rect(ctx, 6, -7, 7, 14, c.base, '#000');
  rect(ctx, 9, -5, 3, 10, COLORES.visor);
  ctx.fillStyle = '#e0a43a'; ctx.beginPath(); ctx.arc(-4, 0, 3, 0, Math.PI * 2); ctx.fill();
  if (u.golpe > 0) { ctx.fillStyle = `rgba(255,255,255,${u.golpe * 0.7})`; ctx.fillRect(-13, -9, 26, 18); }
}

function dibujarRestos(ctx, f) {
  ctx.fillStyle = f.cuerpo === 'mutante' ? '#3d4a26' : '#24221d';
  ctx.beginPath(); ctx.ellipse(0, 0, 12, 9, 0.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = f.cuerpo === 'mutante' ? '#5b6b33' : '#3d3a32';
  ctx.fillRect(-8, -4, 7, 5); ctx.fillRect(1, 1, 6, 4);
  if (f.cuerpo !== 'mutante') { ctx.fillStyle = colorBando(f).sombra; ctx.fillRect(-3, -3, 6, 6); }
}

// Mecha grande para el hangar (sin rotar, mirando a la derecha).
export function dibujarMechaFicha(ctx, ficha, lado) {
  ctx.clearRect(0, 0, lado, lado);
  ctx.save();
  ctx.translate(lado / 2, lado / 2);
  ctx.scale(lado / 34, lado / 34);
  ctx.rotate(-Math.PI / 2);
  dibujarMecha(ctx, ficha, { paso: 0.25, golpe: 0 });
  ctx.restore();
}
