// Reproduce el registro de una batalla en un canvas. No sabe nada de reglas: solo lee eventos y los dibuja.
// La batalla ya se jugo entera en el motor; aca se la mira a la velocidad que uno quiera (o se salta al final).

import { dibujarMapa, dibujarUnidad, COLORES } from './dibujo.js';
import { crearTablero, lineaDeTiro, distancia } from '../motor/espacio.js';

const COLOR_TRAZO = { bala: '#ffe08a', rafaga: '#ffd060', riel: '#7fe3ff', llama: '#ff8a2a', misil: '#ffb347', escupida: '#9be04a', tajo: '#ffffff', garra: '#e8dcc0' };

export class Repeticion {
  constructor({ datos, mision, registro, canvas, alEvento, alTerminar }) {
    this.datos = datos;
    this.mision = mision;
    this.mapa = datos.mapas[mision.mapa];
    this.tablero = crearTablero(this.mapa);
    this.registro = registro;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.alEvento = alEvento || (() => {});
    this.alTerminar = alTerminar || (() => {});
    this.msPorTick = datos.reglas.ms_por_tick_en_repeticion;
    this.T = 0;
    this.i = 0;
    this.velocidad = 2;
    this.pausado = false;
    this.terminado = false;
    this.unidades = new Map();
    this.efectos = [];
    this.flotantes = [];
    this.ultimoTick = registro.length ? registro[registro.length - 1].t : 0;
    // Camara (en pixeles del mapa): centro y zoom. modo 'auto' se acerca a donde estan peleando;
    // 'general' muestra todo; seguir = id de una unidad (se toca su retrato).
    this.cam = null;
    this.modoCamara = 'auto';
    this.seguir = null;
    this.accion = new Map(); // id de unidad -> ultimo tick en que disparo, recibio o reparo
    this.medir();
  }

  medir() {
    const [ancho, alto] = this.mapa.tamano;
    const disponible = this.canvas.parentElement.clientWidth || 640;
    // En un celular parado, el mapa (que es apaisado) se gira 90 grados: asi ocupa la pantalla en vez de quedar
    // como una tira chiquita. El lado izquierdo del mapa (donde arranca el escuadron) queda abajo.
    this.girado = window.innerHeight > window.innerWidth && ancho > alto;
    const [cw, ch] = this.girado ? [alto, ancho] : [ancho, alto];
    const altoMax = Math.max(240, window.innerHeight * (this.girado ? 0.5 : 0.62));
    this.L = Math.max(10, Math.floor(Math.min(disponible / cw, altoMax / ch)));
    const dpr = (this.dpr = Math.min(2, window.devicePixelRatio || 1));
    this.W = cw * this.L; this.H = ch * this.L;
    this.canvas.width = this.W * dpr;
    this.canvas.height = this.H * dpr;
    this.canvas.style.width = this.W + 'px';
    this.canvas.style.height = this.H + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // el mapa se dibuja una vez en un canvas aparte
    this.fondo = document.createElement('canvas');
    this.fondo.width = ancho * this.L * dpr; this.fondo.height = alto * this.L * dpr;
    const fc = this.fondo.getContext('2d');
    fc.setTransform(dpr, 0, 0, dpr, 0, 0);
    dibujarMapa(fc, this.mapa, this.L);
    this.cam = { x: (ancho * this.L) / 2, y: (alto * this.L) / 2, z: 1 };
  }

  // ---------- Camara ----------

  // Lo que la camara quiere mostrar ahora: { x, y, z } en pixeles del mapa.
  objetivoCamara() {
    const [ancho, alto] = this.mapa.tamano;
    const L = this.L, Wm = ancho * L, Hm = alto * L;
    const general = { x: Wm / 2, y: Hm / 2, z: 1 };
    const ZOOM_MAX = 2.4;
    if (this.seguir) {
      const u = this.unidades.get(this.seguir);
      if (u && u.viva) return { x: (u.x + 0.5) * L, y: (u.y + 0.5) * L, z: 2.1 };
      this.seguir = null;
    }
    if (this.modoCamara === 'general') return general;
    // la accion: quienes dispararon o recibieron en los ultimos ticks; si no hay, el escuadron
    let lista = [...this.unidades.values()].filter((u) => u.viva && this.T - (this.accion.get(u.id) ?? -999) < 25);
    if (!lista.length) lista = [...this.unidades.values()].filter((u) => u.viva && u.ficha.bando === 0);
    if (!lista.length) return general;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const u of lista) { x0 = Math.min(x0, u.x); x1 = Math.max(x1, u.x); y0 = Math.min(y0, u.y); y1 = Math.max(y1, u.y); }
    const margen = 3; // casillas alrededor
    const z = Math.max(1, Math.min(ZOOM_MAX, Math.min(ancho / (x1 - x0 + 1 + margen * 2), alto / (y1 - y0 + 1 + margen * 2))));
    return { x: ((x0 + x1) / 2 + 0.5) * L, y: ((y0 + y1) / 2 + 0.5) * L, z };
  }

  moverCamara(ms) {
    const obj = this.objetivoCamara();
    const k = 1 - Math.pow(this.seguir ? 0.88 : 0.95, ms / 16);
    const c = this.cam;
    c.z += (obj.z - c.z) * k;
    c.x += (obj.x - c.x) * k;
    c.y += (obj.y - c.y) * k;
    // que la vista no se salga del mapa
    const [ancho, alto] = this.mapa.tamano;
    const Wm = ancho * this.L, Hm = alto * this.L;
    const mx = Wm / (2 * c.z), my = Hm / (2 * c.z);
    c.x = Math.max(mx, Math.min(Wm - mx, c.x));
    c.y = Math.max(my, Math.min(Hm - my, c.y));
  }

  // Tocar un retrato: seguir a ese piloto; tocarlo de nuevo, volver a la camara automatica.
  alternarSeguir(ref) {
    const u = [...this.unidades.values()].find((x) => x.ficha.ref === ref && x.ficha.bando === 0);
    this.seguir = u && u.viva && this.seguir !== u.id ? u.id : null;
    return this.seguir;
  }

  alternarGeneral() {
    this.seguir = null;
    this.modoCamara = this.modoCamara === 'general' ? 'auto' : 'general';
    return this.modoCamara;
  }

  // Avanza el reloj (ms reales) y aplica los eventos que van tocando.
  avanzar(ms) {
    if (!this.pausado && !this.terminado) this.T += (ms / this.msPorTick) * this.velocidad;
    while (this.i < this.registro.length && this.registro[this.i].t <= this.T) this.aplicar(this.registro[this.i++]);
    this.actualizarUnidades(ms);
    this.moverCamara(ms);
    if (this.i >= this.registro.length && !this.terminado) { this.terminado = true; this.alTerminar(); }
  }

  saltarAlFinal() {
    this.T = this.ultimoTick + 1;
    this.avanzar(0);
    this.efectos = []; this.flotantes = [];
  }

  pos(id) {
    const u = this.unidades.get(id);
    return u ? { x: u.x, y: u.y } : { x: 0, y: 0 };
  }

  aplicar(e) {
    const U = this.unidades;
    const u = e.u ? U.get(e.u) : null;
    switch (e.tipo) {
      case 'aparece': {
        const f = e.ficha;
        U.set(e.u, { id: e.u, ficha: f, x: f.x, y: f.y, desde: [f.x, f.y], hacia: [f.x, f.y], t0: 0, dur: 0, salto: false,
          ang: f.bando === 0 ? 0 : Math.PI, paso: 0, vida: f.vidaMax, viva: true, golpe: 0, estados: new Set(), moral: 'moral_firme',
          grito: null, semilla: (Number(e.u.slice(1)) * 1.7) % 6 });
        if (e.por) this.alEvento({ texto: (U.get(e.por) || {}).ficha?.nombre + ' despliega una torreta', clase: 'info' });
        break;
      }
      case 'mueve':
      case 'salta':
        if (!u) break;
        u.desde = [u.x, u.y]; u.hacia = e.a; u.t0 = e.t; u.dur = Math.max(1, e.d); u.salto = e.tipo === 'salta';
        u.ang = Math.atan2(e.a[1] - u.y, e.a[0] - u.x);
        break;
      case 'dispara': {
        const o = U.get(e.o);
        if (!u || !o) break;
        this.efectos.push({ tipo: 'fijado', id: o.id, t0: this.T, dur: 5, propio: o.ficha.bando === 0 });
        this.accion.set(u.id, e.t); this.accion.set(o.id, e.t);
        u.ang = Math.atan2(o.hacia[1] - u.y, o.hacia[0] - u.x);
        const desvio = e.acierta ? 0 : 0.6;
        this.efectos.push({ tipo: e.arma, de: [u.x, u.y], a: [o.hacia[0] + desvio * Math.sin(e.t), o.hacia[1] + desvio * Math.cos(e.t)], t0: this.T, dur: e.arma === 'riel' ? 4 : 3 });
        if (e.acierta) {
          o.vida -= e.danio; o.golpe = 1;
          this.flotante(o, '-' + e.danio + (e.bloqueo ? ' ▣' : ''), e.cob ? '#ffd27a' : '#ff7a6a');
        } else this.flotante(o, 'falla', '#8a9488', true);
        break;
      }
      case 'esquirla': if (u) { u.vida -= e.danio; u.golpe = 1; this.flotante(u, '-' + e.danio, '#ff9a5a'); } break;
      case 'explota': this.efectos.push({ tipo: 'explosion', a: [e.x, e.y], r: e.r + 0.6, t0: this.T, dur: 6 }); break;
      case 'vida': if (u) { u.vida = e.vida; this.flotante(u, '-' + e.dot, '#ff9a3a', true); } break;
      case 'repara': {
        const o = U.get(e.o);
        if (o) { o.vida = e.vida; this.flotante(o, '+' + e.cant, '#8fdc5a'); this.efectos.push({ tipo: 'reparar', a: [o.x, o.y], t0: this.T, dur: 6 }); }
        if (u && o) this.alEvento({ texto: u.ficha.nombre + ' repara a ' + o.ficha.nombre, clase: 'bien' });
        break;
      }
      case 'muere': {
        if (!u) break;
        u.viva = false; u.vida = 0; u.grito = null;
        this.efectos.push({ tipo: 'explosion', a: [u.hacia[0], u.hacia[1]], r: 0.8, t0: this.T, dur: 7 });
        const k = e.por ? U.get(e.por) : null;
        const propio = u.ficha.bando === 0;
        this.alEvento({ texto: k ? k.ficha.nombre + ' abatió a ' + u.ficha.nombre : u.ficha.nombre + ' cae', clase: propio ? 'mal' : 'bien', importante: propio && u.ficha.tipo === 'piloto' });
        break;
      }
      case 'anula': {
        if (!u) break;
        const texto = this.datos.textos.gritos[e.motivo] || '…';
        u.grito = { texto, hasta: this.T + 22 };
        // el mismo grito seguido no se repite en la lista
        if (u.ultimoGrito !== e.motivo || this.T - u.ultimoGritoT > 60) this.alEvento({ texto: u.ficha.nombre + ': «' + texto + '»', clase: 'aviso' });
        u.ultimoGrito = e.motivo; u.ultimoGritoT = this.T;
        break;
      }
      case 'estado':
        if (u) {
          u.estados.add(e.estado);
          if (e.estado === 'en_llamas') this.alEvento({ texto: u.ficha.nombre + ' se prende fuego', clase: u.ficha.bando === 0 ? 'mal' : 'info' });
        }
        break;
      case 'estado_fin': if (u) u.estados.delete(e.estado); break;
      case 'moral':
        if (!u) break;
        u.moral = e.estado;
        if (e.estado === 'moral_quebrada') this.alEvento({ texto: u.ficha.nombre + ' se quiebra', clase: 'aviso' });
        break;
      case 'habilidad': if (u) this.flotante(u, (this.datos.habilidades[e.h] || {}).nombre || e.h, '#9fd7ff', true); break;
      case 'oleada': if (e.n > 1) this.alEvento({ texto: 'Oleada ' + e.n + ' de ' + e.de, clase: 'aviso', importante: true }); break;
      case 'fin': break;
    }
  }

  flotante(u, texto, color, chico = false) {
    this.flotantes.push({ x: u.hacia[0], y: u.hacia[1], texto, color, chico, t0: this.T, dur: 10 });
  }

  actualizarUnidades(ms) {
    for (const u of this.unidades.values()) {
      if (u.dur && this.T < u.t0 + u.dur) {
        const k = Math.max(0, (this.T - u.t0) / u.dur);
        u.x = u.desde[0] + (u.hacia[0] - u.desde[0]) * k;
        u.y = u.desde[1] + (u.hacia[1] - u.desde[1]) * k;
        u.paso = (u.paso + (ms / 400) * this.velocidad) % 1;
      } else { u.x = u.hacia[0]; u.y = u.hacia[1]; }
      if (u.golpe > 0) u.golpe = Math.max(0, u.golpe - ms / 180);
      if (u.grito && this.T > u.grito.hasta) u.grito = null;
    }
    this.efectos = this.efectos.filter((f) => this.T < f.t0 + f.dur);
    this.flotantes = this.flotantes.filter((f) => this.T < f.t0 + f.dur);
  }

  // Casillas que ve el escuadron (solo en misiones con niebla).
  visibles() {
    if (!this.mision.niebla) return null;
    const vistas = new Set();
    const ojos = [...this.unidades.values()].filter((u) => u.viva && u.ficha.bando === 0);
    const [ancho, alto] = this.mapa.tamano;
    for (let y = 0; y < alto; y++) {
      for (let x = 0; x < ancho; x++) {
        for (const o of ojos) {
          const p = { x: o.hacia[0], y: o.hacia[1] };
          if (distancia(p, { x, y }) <= 7 && lineaDeTiro(this.tablero, p, { x, y })) { vistas.add(y * ancho + x); break; }
        }
      }
    }
    return vistas;
  }

  // De coordenadas del mapa (en pixeles) a la pantalla, teniendo en cuenta si esta girado.
  aPantalla(px, py) {
    const [ancho, alto] = this.mapa.tamano;
    const c = this.cam;
    const x = (px - c.x) * c.z + (ancho * this.L) / 2, y = (py - c.y) * c.z + (alto * this.L) / 2;
    return this.girado ? [y, ancho * this.L - x] : [x, y];
  }

  dibujar() {
    const ctx = this.ctx, L = this.L, dpr = this.dpr;
    const [ancho, alto] = this.mapa.tamano;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);
    // todo lo del mapa se dibuja en coordenadas del mapa; el giro lo hace la transformacion
    if (this.girado) { ctx.translate(0, ancho * L); ctx.rotate(-Math.PI / 2); }
    // camara: acercar y centrar
    const c = this.cam;
    ctx.translate((ancho * L) / 2, (alto * L) / 2);
    ctx.scale(c.z, c.z);
    ctx.translate(-c.x, -c.y);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.fondo, 0, 0, ancho * L, alto * L);
    const vistas = this.visibles();
    const seVe = (u) => !vistas || u.ficha.bando === 0 || vistas.has(Math.round(u.y) * ancho + Math.round(u.x));

    const lista = [...this.unidades.values()].sort((a, b) => (a.viva - b.viva) || a.y - b.y);
    for (const u of lista) if (seVe(u)) dibujarUnidad(ctx, u, L, this.T);

    // efectos
    for (const f of this.efectos) {
      const k = (this.T - f.t0) / f.dur;
      ctx.globalAlpha = Math.max(0, 1 - k);
      if (f.tipo === 'fijado') { ctx.globalAlpha = 1; continue; }
      if (f.tipo === 'explosion') {
        const r = f.r * L * (0.4 + k);
        ctx.fillStyle = k < 0.3 ? '#fff2b0' : '#ff7a2a';
        ctx.beginPath(); ctx.arc((f.a[0] + 0.5) * L, (f.a[1] + 0.5) * L, r, 0, Math.PI * 2); ctx.fill();
      } else if (f.tipo === 'reparar') {
        ctx.fillStyle = '#8fdc5a';
        const cx = (f.a[0] + 0.5) * L, cy = (f.a[1] + 0.5 - k) * L;
        ctx.fillRect(cx - L * 0.06, cy - L * 0.2, L * 0.12, L * 0.4); ctx.fillRect(cx - L * 0.2, cy - L * 0.06, L * 0.4, L * 0.12);
      } else {
        const x0 = (f.de[0] + 0.5) * L, y0 = (f.de[1] + 0.5) * L, x1 = (f.a[0] + 0.5) * L, y1 = (f.a[1] + 0.5) * L;
        ctx.strokeStyle = COLOR_TRAZO[f.tipo] || '#fff';
        if (f.tipo === 'llama') {
          ctx.lineWidth = L * 0.35; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + (x1 - x0) * Math.min(1, k * 2), y0 + (y1 - y0) * Math.min(1, k * 2)); ctx.stroke();
        } else if (f.tipo === 'misil' || f.tipo === 'escupida') {
          ctx.fillStyle = COLOR_TRAZO[f.tipo];
          ctx.beginPath(); ctx.arc(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, L * 0.12, 0, Math.PI * 2); ctx.fill();
        } else if (f.tipo === 'tajo' || f.tipo === 'garra') {
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(x1, y1, L * 0.35, k * 3, k * 3 + 1.8); ctx.stroke();
        } else {
          ctx.lineWidth = f.tipo === 'riel' ? 3 : f.tipo === 'rafaga' ? 1 : 1.5;
          ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        }
        ctx.lineCap = 'butt'; ctx.lineWidth = 1;
      }
      ctx.globalAlpha = 1;
    }

    // niebla
    if (vistas) {
      ctx.fillStyle = 'rgba(5,7,4,0.72)';
      for (let y = 0; y < alto; y++) for (let x = 0; x < ancho; x++) if (!vistas.has(y * ancho + x)) ctx.fillRect(x * L, y * L, L, L);
    }

    // Desde aca, todo en coordenadas de pantalla (los textos nunca se giran)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const centro = (u) => this.aPantalla((u.x + 0.5) * L, (u.y + 0.5) * L);
    const Lz = L * c.z; // una casilla, ya con el zoom

    // miras amarillas sobre quien esta siendo apuntado
    for (const f of this.efectos) {
      if (f.tipo !== 'fijado') continue;
      const u = this.unidades.get(f.id);
      if (!u || !u.viva || !seVe(u)) continue;
      const [cx, cy] = centro(u);
      const r = Lz * 0.62, c = Lz * 0.22;
      ctx.strokeStyle = f.propio ? '#d9553f' : '#f2c94c';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        ctx.moveTo(cx + sx * r, cy + sy * (r - c)); ctx.lineTo(cx + sx * r, cy + sy * r); ctx.lineTo(cx + sx * (r - c), cy + sy * r);
      }
      ctx.stroke();
      ctx.lineWidth = 1;
    }

    ctx.font = `${Math.max(12, Lz * 0.5)}px VT323, monospace`;
    ctx.textAlign = 'center';
    for (const u of lista) {
      if (!u.viva || !seVe(u)) continue;
      const [cx, cy] = centro(u);
      const top = cy - Lz * 0.5 - 2;
      const pct = Math.max(0, u.vida / u.ficha.vidaMax);
      if (pct < 1 || u.ficha.bando === 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(cx - Lz * 0.4, top - 4, Lz * 0.8, 4);
        ctx.fillStyle = pct > 0.5 ? '#8fdc5a' : pct > 0.25 ? '#e0a43a' : '#d9553f';
        ctx.fillRect(cx - Lz * 0.4 + 1, top - 3, (Lz * 0.8 - 2) * pct, 2);
      }
      if (u.estados.has('en_llamas')) { ctx.fillStyle = '#ff8a2a'; ctx.fillRect(cx + Lz * 0.42, top - 4, 3, 3); }
      if (u.estados.has('suprimido')) { ctx.fillStyle = '#b8b8b8'; ctx.fillRect(cx + Lz * 0.42, top, 3, 3); }
      if (u.moral === 'moral_quebrada') { ctx.fillStyle = '#e0a43a'; ctx.fillText('!', cx - Lz * 0.5, top + 4); }
      if (u.grito) {
        const w = ctx.measureText(u.grito.texto).width + 10;
        const hb = Math.max(14, Lz * 0.62);
        const bx = Math.min(Math.max(cx, w / 2 + 2), this.W - w / 2 - 2), by = Math.max(hb, top - 4);
        ctx.fillStyle = '#e8edd8'; ctx.fillRect(bx - w / 2, by - hb + 2, w, hb);
        ctx.fillStyle = '#121510'; ctx.fillText(u.grito.texto, bx, by - 2);
      }
    }
    for (const f of this.flotantes) {
      const k = (this.T - f.t0) / f.dur;
      const [fx, fy] = this.aPantalla((f.x + 0.5) * L, (f.y + 0.5) * L);
      const y = fy - Lz * 0.5 - k * Lz * 0.8;
      ctx.globalAlpha = 1 - k;
      ctx.font = `${Math.max(11, Lz * (f.chico ? 0.42 : 0.55))}px VT323, monospace`;
      ctx.fillStyle = '#000'; ctx.fillText(f.texto, fx + 1, y + 1);
      ctx.fillStyle = f.color; ctx.fillText(f.texto, fx, y);
      ctx.globalAlpha = 1;
    }
    ctx.textAlign = 'start';
  }

  // Estado actual de los pilotos (para la lista al costado).
  pilotos() {
    return [...this.unidades.values()].filter((u) => u.ficha.bando === 0 && u.ficha.tipo === 'piloto');
  }
}

export { COLORES };
