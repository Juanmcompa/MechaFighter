// Dibujo esquematico de un mapa (para el arranque y, mas adelante, para la preparacion de la mision).
// No es el render de batalla (eso es src/vista/): es un plano, como el de una mesa de operaciones.
export const COLORES_CASILLA = {
  piso: '#1b2016',
  muro: '#3a4233',
  media_cobertura: '#5d6b4c',
  cobertura_total: '#8a9a72',
  peligro: '#6b3b22',
  aparicion_jugador: '#4a8fd1',
  aparicion_enemigo: '#c4473b'
};

export function dibujarMapa(canvas, mapa) {
  const [ancho, alto] = mapa.tamano;
  const lado = Math.floor(Math.min(canvas.width / ancho, canvas.height / alto));
  const ctx = canvas.getContext('2d');
  canvas.width = ancho * lado;
  canvas.height = alto * lado;
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      ctx.fillStyle = COLORES_CASILLA[mapa.leyenda[mapa.filas[y][x]]] || '#000';
      ctx.fillRect(x * lado, y * lado, lado, lado);
    }
  }
  // grilla tenue
  ctx.strokeStyle = 'rgba(143,220,90,0.06)';
  for (let x = 0; x <= ancho; x++) { ctx.beginPath(); ctx.moveTo(x * lado + 0.5, 0); ctx.lineTo(x * lado + 0.5, alto * lado); ctx.stroke(); }
  for (let y = 0; y <= alto; y++) { ctx.beginPath(); ctx.moveTo(0, y * lado + 0.5); ctx.lineTo(ancho * lado, y * lado + 0.5); ctx.stroke(); }
  // zonas
  ctx.setLineDash([4, 3]);
  ctx.strokeStyle = '#e0a43a';
  ctx.font = Math.max(10, lado - 4) + 'px VT323, monospace';
  ctx.fillStyle = '#e0a43a';
  for (const [nombre, [[x1, y1], [x2, y2]]] of Object.entries(mapa.zonas || {})) {
    ctx.strokeRect(x1 * lado + 1, y1 * lado + 1, (x2 - x1 + 1) * lado - 2, (y2 - y1 + 1) * lado - 2);
    // el rotulo arriba de la zona; si no entra, abajo. Y nunca afuera del mapa por los costados.
    const tx = Math.min(x1 * lado + 2, canvas.width - ctx.measureText(nombre).width - 2);
    const ty = y1 * lado - 3 < 10 ? (y2 + 2) * lado - 4 : y1 * lado - 3;
    ctx.fillText(nombre, tx, ty);
  }
  ctx.setLineDash([]);
  // apariciones
  for (const [bando, lista] of Object.entries(mapa.aparicion || {})) {
    ctx.fillStyle = COLORES_CASILLA['aparicion_' + bando] || '#fff';
    for (const [x, y] of lista) {
      ctx.fillRect(x * lado + lado * 0.25, y * lado + lado * 0.25, lado * 0.5, lado * 0.5);
    }
  }
}
