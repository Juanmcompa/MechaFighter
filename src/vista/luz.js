// Iluminacion de la batalla: el campo queda en penumbra y lo iluminan las luces (faros de los mechas,
// fogonazos, explosiones, acido...). Con WebGL ademas hay relieve: cada pixel se ilumina segun su "normal"
// (hacia donde mira su superficie). La normal sale de:
//   - un normal map dibujado a mano (nombre_n.png al lado del sprite), si existe;
//   - si no, se calcula sola a partir de la imagen (lo claro se toma como mas alto).
// Lo que brilla (nombre_e.png: solo los pixeles que dan luz) se ve a pleno aunque este oscuro y larga un halo.
// Sin WebGL hay una version simple (luces y penumbra, sin relieve).
//
// Como se usa: la escena se dibuja igual que siempre pero en un canvas aparte; mientras tanto, cada sprite que
// tiene normal map o brillo se dibuja tambien en las capas CAPAS.normal y CAPAS.brillo (ver capas()). Despues
// componer() junta todo con las luces.

// ---------- Mapas de normales y de brillo ----------
// LUZ.n[clave] / LUZ.e[clave]: imagenes. La clave sale de la ruta (ver claveDe): 'terreno/piso_a', 'mecha/brazo_x'...
export const LUZ = { n: {}, e: {}, listo: false };

// Las capas donde se dibuja a la par de la escena (null = no se esta iluminando)
export const CAPAS = { normal: null, brillo: null };

const cargar = (src) => new Promise((ok) => {
  const im = new Image();
  im.onload = () => ok(im);
  im.onerror = () => ok(null);
  im.src = src;
});

// assets/mecha/azul/brazo_x.png -> 'mecha/brazo_x' (los colores de bando comparten normal y brillo)
export function claveDe(ruta) {
  return ruta.replace(/^.*assets\//, '').replace(/\.png$/, '').replace(/^mecha\/(azul|rojo|verde)\//, 'mecha/').replace(/_[ne]$/, '');
}

// assets/luces.json lo arma solo el hook de git (tools/hooks/post-commit): la lista de *_n.png y *_e.png
export async function cargarLuces(base = './') {
  try {
    const r = await fetch(base + 'assets/luces.json', { cache: 'no-cache' });
    if (!r.ok) return LUZ;
    const m = await r.json();
    await Promise.all([...(m.normales || []).map((ruta) => [ruta, 'n']), ...(m.brillos || []).map((ruta) => [ruta, 'e'])]
      .map(([ruta, tipo]) => cargar(base + ruta).then((im) => {
        if (!im) return;
        // los de un color (assets/mecha/rojo/x_e.png) valen para ese bando; los de azul, ademas, para todos
        const color = (ruta.match(/assets\/mecha\/(azul|rojo|verde)\//) || [])[1];
        if (color) LUZ[tipo][claveDe(ruta).replace('mecha/', 'mecha/' + color + '/')] = im;
        if (!color || color === 'azul' || !LUZ[tipo][claveDe(ruta)]) LUZ[tipo][claveDe(ruta)] = im;
      })));
  } catch { /* sin luces a mano: todo automatico */ }
  LUZ.listo = true;
  return LUZ;
}

// Para el taller: sumar a mano un normal map o un brillo (arte nuevo a prueba)
export function registrarLuz(clave, tipo, im) { LUZ[tipo][clave] = im; girados.clear(); }

// Un normal map girado (los vectores tambien giran): se arma una vez por angulo (32 pasos) y espejo.
const girados = new Map();
function normalGirado(clave, im, m) {
  const ang = Math.atan2(m.b, m.a), espejo = m.a * m.d - m.b * m.c < 0;
  const paso = ((Math.round((ang / (Math.PI * 2)) * 32) % 32) + 32) % 32;
  const k = clave + '|' + paso + (espejo ? 'e' : '');
  let c = girados.get(k);
  if (c) return c;
  const t = (paso / 32) * Math.PI * 2, co = Math.cos(t), si = Math.sin(t);
  // columnas de la transformacion (en pantalla, y para abajo): la segunda se da vuelta si hay espejo
  const c2x = espejo ? si : -si, c2y = espejo ? -co : co;
  c = document.createElement('canvas');
  c.width = im.width; c.height = im.height;
  const x = c.getContext('2d');
  x.drawImage(im, 0, 0);
  const px = x.getImageData(0, 0, c.width, c.height), d = px.data;
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    // el normal map viene con el verde para arriba (como lo hacen Laigter o SpriteIlluminator)
    const nx = d[i] / 127.5 - 1, ny = -(d[i + 1] / 127.5 - 1);
    const sx = co * nx + c2x * ny, sy = si * nx + c2y * ny;
    d[i] = Math.round((sx + 1) * 127.5);
    d[i + 1] = Math.round((-sy + 1) * 127.5);
  }
  x.putImageData(px, 0, 0);
  girados.set(k, c);
  return c;
}

// Llamar despues de dibujar un sprite: lo repite en las capas de normales y de brillo, con la misma posicion.
// (la imagen tiene que tener ._luz, que le pone sprites.js al cargarla)
// (con recorte: capas(ctx, im, dx, dy, dw, dh, [sx, sy, sw, sh]) dibuja solo ese pedazo de la imagen)
export function capas(ctx, im, dx, dy, dw, dh, recorte = null) {
  if (!CAPAS.normal || !im || !im._luz) return;
  // ._luzColor: la version de un bando (mecha/rojo/x), que puede tener su propio brillo o normal map
  const n = LUZ.n[im._luzColor] || LUZ.n[im._luz], e = LUZ.e[im._luzColor] || LUZ.e[im._luz];
  if (!n && !e) return;
  const m = ctx.getTransform();
  if (n) {
    const c = CAPAS.normal;
    c.setTransform(m); c.globalAlpha = ctx.globalAlpha;
    const g = normalGirado(LUZ.n[im._luzColor] ? im._luzColor : im._luz, n, m);
    if (recorte) c.drawImage(g, ...recorte, dx, dy, dw, dh); else c.drawImage(g, dx, dy, dw, dh);
  }
  if (e) {
    const c = CAPAS.brillo;
    c.setTransform(m); c.globalAlpha = ctx.globalAlpha;
    if (recorte) c.drawImage(e, ...recorte, dx, dy, dw, dh); else c.drawImage(e, dx, dy, dw, dh);
  }
}

// Un pedazo de una hoja (tileset) + capas
export function pintarRecorte(ctx, im, sx, sy, sw, sh, dx, dy, dw, dh) {
  ctx.drawImage(im, sx, sy, sw, sh, dx, dy, dw, dh);
  capas(ctx, im, dx, dy, dw, dh, [sx, sy, sw, sh]);
}

// Gira los vectores de un canvas de normales (cuando todo el dibujo se gira, como el mapa en el celular parado)
export function girarNormales(c, ang) {
  const x = c.getContext('2d'), px = x.getImageData(0, 0, c.width, c.height), d = px.data;
  const co = Math.cos(ang), si = Math.sin(ang);
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const nx = d[i] / 127.5 - 1, ny = -(d[i + 1] / 127.5 - 1);
    d[i] = Math.round((co * nx - si * ny + 1) * 127.5);
    d[i + 1] = Math.round((-(si * nx + co * ny) + 1) * 127.5);
  }
  x.putImageData(px, 0, 0);
}

// drawImage + capas
export function pintar(ctx, im, dx, dy, dw, dh) {
  ctx.drawImage(im, dx, dy, dw, dh);
  capas(ctx, im, dx, dy, dw, dh);
}

// ---------- Componer: escena + normales + brillo + luces ----------

const MAX_LUCES = 40;

const VERT = `#version 300 es
in vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision mediump float;
uniform sampler2D uEscena, uNormal, uBrillo;
uniform vec2 uRes;
uniform float uPaso, uRelieve, uHalo;
uniform vec3 uAmbiente;
uniform int uN;
uniform vec4 uPos[${MAX_LUCES}];   // x, y (pixeles), altura, radio
uniform vec4 uCol[${MAX_LUCES}];   // r, g, b, intensidad
uniform vec4 uCono[${MAX_LUCES}];  // direccion x, y, coseno del borde (-2 = para todos lados), suavidad
uniform sampler2D uOcl;            // que casillas tapan la luz (muros, edificios): 1 por casilla
uniform mat3 uInv;                 // de pixel de pantalla a casilla del mapa
uniform vec2 uGrid;                // ancho y alto del mapa en casillas
uniform int uConOcl;
out vec4 color;

// Cuanta luz llega de lp a p: se recorre el camino por la grilla del mapa y se suma cuanto pasa por adentro de
// muros; con eso la luz se apaga. Las muestras van mas juntas cerca del pixel, asi el borde del muro que mira a la
// luz se ilumina y el resto del techo no (y lo que esta detras del muro queda a oscuras).
float llega(vec2 p, vec2 lp) {
  if (uConOcl == 0) return 1.0;
  vec2 a = (uInv * vec3(p, 1.0)).xy, b = (uInv * vec3(lp, 1.0)).xy;
  float largo = length(b - a);
  float dentro = 0.0, antes = 0.0;
  for (int k = 1; k <= 18; k++) {
    float f = float(k) / 18.0;
    float t = f * f;
    vec2 q = mix(a, b, t);
    dentro += smoothstep(0.5, 0.9, texture(uOcl, q / uGrid).r) * (t - antes) * largo;
    antes = t;
    if (dentro > 0.8) return 0.0;
  }
  return exp(-dentro * 5.0);
}

float alto(vec2 q) {
  vec4 c = texture(uEscena, q / uRes);
  return dot(c.rgb, vec3(0.3, 0.55, 0.15)) * c.a;
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 uv = p / uRes;
  vec4 alb = texture(uEscena, uv);
  vec4 nm = texture(uNormal, uv);
  vec3 n;
  if (nm.a > 0.5) {
    n = normalize(vec3(nm.r * 2.0 - 1.0, -(nm.g * 2.0 - 1.0), max(nm.b * 2.0 - 1.0, 0.05)));
  } else {
    // relieve automatico: lo claro esta mas alto (y para abajo, como la pantalla)
    float s = uPaso;
    float dx = alto(p + vec2(s, 0.0)) - alto(p - vec2(s, 0.0));
    float dy = alto(p + vec2(0.0, s)) - alto(p - vec2(0.0, s));
    n = normalize(vec3(-dx * uRelieve, -dy * uRelieve, 1.0));
  }
  // luz de ambiente: un poco de arriba a la izquierda, para que el relieve se lea aun en lo oscuro
  vec3 luz = uAmbiente * (0.7 + 0.45 * max(dot(n, normalize(vec3(-0.45, -0.55, 0.7))), 0.0));
  for (int i = 0; i < ${MAX_LUCES}; i++) {
    if (i >= uN) break;
    vec4 L = uPos[i];
    vec2 d = L.xy - p;
    float dist = length(d);
    if (dist > L.w) continue;
    float at = 1.0 - dist / L.w;
    at *= at;
    vec4 C = uCono[i];
    if (C.z > -1.5) {
      float c = dot(normalize(-d + vec2(0.0001)), C.xy);
      at *= smoothstep(C.z, C.z + C.w, c);
      // pegado a la fuente tambien se ve un poco (que no quede un agujero detras del faro)
      at = max(at, (1.0 - smoothstep(0.0, L.w * 0.12, dist)) * 0.5);
    }
    vec3 l = normalize(vec3(d, L.z));
    at *= llega(p, L.xy);
    luz += uCol[i].rgb * uCol[i].a * at * (0.25 + 0.75 * max(dot(n, l), 0.0));
  }
  vec4 br = texture(uBrillo, uv);
  // halo de lo que brilla: unas muestras alrededor
  vec3 halo = vec3(0.0);
  float r = uPaso * 3.0;
  for (int k = 0; k < 8; k++) {
    float a = float(k) * 0.785;
    vec4 h1 = texture(uBrillo, (p + vec2(cos(a), sin(a)) * r) / uRes);
    vec4 h2 = texture(uBrillo, (p + vec2(cos(a + 0.39), sin(a + 0.39)) * r * 2.2) / uRes);
    halo += h1.rgb * h1.a + h2.rgb * h2.a * 0.6;
  }
  vec3 fin = alb.rgb * luz + br.rgb * br.a * 1.2 + halo * uHalo / 12.8;
  color = vec4(fin, 1.0);
}`;

function hexA(h) {
  const v = parseInt(h.slice(1), 16);
  return [(v >> 16) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

// Crea el compositor (WebGL, o la version simple en 2D si no hay WebGL). Devuelve { componer(...), gl: bool }
export function crearCompositor(simple = false) {
  const lienzo = document.createElement('canvas');
  const gl = simple ? null : lienzo.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false });
  if (!gl) return compositor2D(lienzo);
  const sombreador = (tipo, fuente) => {
    const s = gl.createShader(tipo);
    gl.shaderSource(s, fuente); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  let prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, sombreador(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sombreador(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (e) {
    console.warn('Luces: sin WebGL, uso la version simple', e);
    return compositor2D(document.createElement('canvas'));
  }
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const ap = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(ap);
  gl.vertexAttribPointer(ap, 2, gl.FLOAT, false, 0, 0);
  const U = (n) => gl.getUniformLocation(prog, n);
  const u = { res: U('uRes'), paso: U('uPaso'), relieve: U('uRelieve'), halo: U('uHalo'), amb: U('uAmbiente'), n: U('uN'), pos: U('uPos'), col: U('uCol'), cono: U('uCono'), inv: U('uInv'), grid: U('uGrid'), conOcl: U('uConOcl') };
  const texturas = ['uEscena', 'uNormal', 'uBrillo'].map((nombre, i) => {
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + i);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, i === 2 ? gl.LINEAR : gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(U(nombre), i);
    return t;
  });
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  // textura de lo que tapa la luz (una casilla = un pixel; suavizada, asi las sombras no son tan cuadradas)
  const texOcl = gl.createTexture();
  gl.activeTexture(gl.TEXTURE3);
  gl.bindTexture(gl.TEXTURE_2D, texOcl);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.uniform1i(U('uOcl'), 3);
  let versionOcl = null;
  const pos = new Float32Array(MAX_LUCES * 4), col = new Float32Array(MAX_LUCES * 4), cono = new Float32Array(MAX_LUCES * 4);

  return {
    gl: true,
    // escena/normal/brillo: canvas del mismo tamano. luces: [{ x, y, z, r, color:[r,g,b], i, dir:[x,y], cono, suave }]
    // ocluye: { celdas: Uint8Array (255 = tapa), ancho, alto, version }; inv: DOMMatrix de pixel a casilla
    componer({ escena, normal, brillo, luces, ambiente, paso, relieve, halo, ocluye = null, inv = null }) {
      if (lienzo.width !== escena.width || lienzo.height !== escena.height) {
        lienzo.width = escena.width; lienzo.height = escena.height;
      }
      gl.viewport(0, 0, lienzo.width, lienzo.height);
      [escena, normal, brillo].forEach((c, i) => {
        gl.activeTexture(gl.TEXTURE0 + i);
        gl.bindTexture(gl.TEXTURE_2D, texturas[i]);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
      });
      const n = Math.min(MAX_LUCES, luces.length);
      for (let i = 0; i < n; i++) {
        const l = luces[i];
        pos.set([l.x, l.y, l.z, l.r], i * 4);
        col.set([l.color[0], l.color[1], l.color[2], l.i], i * 4);
        cono.set(l.dir ? [l.dir[0], l.dir[1], Math.cos(l.cono), l.suave || 0.15] : [0, 0, -2, 0], i * 4);
      }
      gl.uniform2f(u.res, lienzo.width, lienzo.height);
      gl.uniform1f(u.paso, Math.max(1, paso));
      gl.uniform1f(u.relieve, relieve);
      gl.uniform1f(u.halo, halo);
      gl.uniform3fv(u.amb, ambiente);
      gl.uniform1i(u.n, n);
      gl.uniform4fv(u.pos, pos);
      gl.uniform4fv(u.col, col);
      gl.uniform4fv(u.cono, cono);
      if (ocluye && inv) {
        if (versionOcl !== ocluye.version) {
          versionOcl = ocluye.version;
          gl.activeTexture(gl.TEXTURE3);
          gl.bindTexture(gl.TEXTURE_2D, texOcl);
          gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, ocluye.ancho, ocluye.alto, 0, gl.RED, gl.UNSIGNED_BYTE, ocluye.celdas);
          gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
        }
        gl.uniformMatrix3fv(u.inv, false, [inv.a, inv.b, 0, inv.c, inv.d, 0, inv.e, inv.f, 1]);
        gl.uniform2f(u.grid, ocluye.ancho, ocluye.alto);
        gl.uniform1i(u.conOcl, 1);
      } else gl.uniform1i(u.conOcl, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      return lienzo;
    }
  };
}

// Version simple (sin relieve): penumbra + manchas de luz + lo que brilla encima
function compositor2D(lienzo) {
  const luzC = document.createElement('canvas');
  return {
    gl: false,
    componer({ escena, brillo, luces, ambiente, halo }) {
      for (const c of [lienzo, luzC]) if (c.width !== escena.width || c.height !== escena.height) { c.width = escena.width; c.height = escena.height; }
      const l = luzC.getContext('2d');
      l.setTransform(1, 0, 0, 1, 0, 0);
      l.globalCompositeOperation = 'source-over';
      l.fillStyle = 'rgb(' + ambiente.map((v) => Math.round(Math.min(1, v) * 255)).join(',') + ')';
      l.fillRect(0, 0, luzC.width, luzC.height);
      l.globalCompositeOperation = 'lighter';
      for (const L of luces) {
        const g = l.createRadialGradient(L.x, L.y, 0, L.x, L.y, L.r);
        const c = L.color.map((v) => Math.round(Math.min(1, v * L.i * 0.8) * 255)).join(',');
        g.addColorStop(0, 'rgba(' + c + ',1)'); g.addColorStop(1, 'rgba(' + c + ',0)');
        l.fillStyle = g;
        l.beginPath();
        if (L.dir) {
          const a = Math.atan2(L.dir[1], L.dir[0]);
          l.moveTo(L.x, L.y); l.arc(L.x, L.y, L.r, a - L.cono, a + L.cono); l.closePath();
        } else l.arc(L.x, L.y, L.r, 0, Math.PI * 2);
        l.fill();
      }
      const x = lienzo.getContext('2d');
      x.globalCompositeOperation = 'source-over';
      x.drawImage(escena, 0, 0);
      x.globalCompositeOperation = 'multiply';
      x.drawImage(luzC, 0, 0);
      x.globalCompositeOperation = 'lighter';
      x.globalAlpha = Math.min(1, 0.6 + halo * 0.3);
      x.drawImage(brillo, 0, 0);
      x.globalAlpha = 1;
      x.globalCompositeOperation = 'source-over';
      return lienzo;
    }
  };
}

export const colorLuz = hexA;
