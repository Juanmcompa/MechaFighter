// Reproduce el registro de una batalla en un canvas. No sabe nada de reglas: solo lee eventos y los dibuja.
// La batalla ya se jugo entera en el motor; aca se la mira a la velocidad que uno quiera (o se salta al final).

import { dibujarMapa, dibujarUnidad, COLORES, dibujarCaido, miembrosVivos, moverTropa, posicionMiembro, figuraDe, bocaEnMapa, farosDe } from './dibujo.js';
import { crearTablero, lineaDeTiro, distancia, caminable, cambiarCasilla } from '../motor/espacio.js';
import { CAPAS, crearCompositor, colorLuz, girarNormales } from './luz.js';

// Las velocidades de la batalla se cuentan desde la mitad de antes: 1x es tranquilo, 2x el viejo 1x
const ESCALA_VELOCIDAD = 0.5;

// Gira un angulo hacia otro, como mucho "paso" radianes
function girarHacia(ang, obj, paso) {
  let dif = obj - ang;
  while (dif > Math.PI) dif -= Math.PI * 2;
  while (dif < -Math.PI) dif += Math.PI * 2;
  return ang + (Math.abs(dif) <= paso ? dif : Math.sign(dif) * paso);
}

const COLOR_TRAZO = { bala: '#ffe08a', rafaga: '#ffd060', riel: '#7fe3ff', llama: '#ff8a2a', misil: '#ffb347', escupida: '#9be04a', tajo: '#ffffff', garra: '#e8dcc0' };

// Anulaciones que se cuentan por radio con la voz del piloto (ver voces.json)
const VOZ_ANULA = new Set(['se_manda', 'se_le_pasa', 'perdido', 'reubicado', 'confusion', 'discute']);

// Lo que dicen los pilotos de la campana anterior cuando aparecen del otro lado
const EX_PILOTO = ['Control... ¿sos vos? Nos dejaste ahí.', 'No me mires así. Pagan mejor que vos.', 'Nadie vino a buscarnos, Control.', 'Ahora sí vas a ver cómo peleo.'];

const ZONAS = { brazo_izq: 'Brazo izquierdo destruido', brazo_der: 'Brazo derecho destruido', piernas: 'Piernas destruidas', cabeza: 'Cabeza destruida' };

export class Repeticion {
  constructor({ datos, mision, registro, canvas, alEvento, alTerminar, pilotos }) {
    this.porPiloto = pilotos || new Map(); // id de piloto -> piloto (para voces, vinculos y marcas)
    this.ultimaVoz = -999;
    this.datos = datos;
    this.mision = mision;
    // copia propia del mapa: durante la batalla se rompen cosas y hay que redibujarlas
    const original = mision.plano || datos.mapas[mision.mapa];
    this.mapa = { ...original, filas: original.filas.slice(), leyenda: { ...original.leyenda } };
    this.tablero = crearTablero(this.mapa);
    this.registro = registro;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.alEvento = alEvento || (() => {});
    this.alTerminar = alTerminar || (() => {});
    this.msPorTick = datos.reglas.ms_por_tick_en_repeticion;
    this.T = 0;
    this.i = 0;
    this.velocidad = 1;
    this.temblor = 0; // sacudon de camara (explosiones, pasos pesados)
    this.estatica = 0; // hasta cuando se ve estatica de radio (contacto, refuerzos)
    this.pausado = false;
    this.terminado = false;
    this.unidades = new Map();
    this.efectos = [];
    this.caidos = []; // soldaditos muertos en el piso
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
    // girado (celular parado): que ocupe todo el ancho; el alto solo se limita para que no tape toda la pantalla
    const altoMax = Math.max(240, window.innerHeight * (this.girado ? 0.85 : 0.62));
    const cs = getComputedStyle(this.canvas.parentElement);
    const ancho1 = disponible - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
    const d0 = Math.min(2, window.devicePixelRatio || 1);
    // (redondeado a pixeles fisicos, para que se vea nitido)
    this.L = Math.max(10, Math.floor(Math.min(ancho1 / cw, altoMax / ch) * d0) / d0);
    const dpr = (this.dpr = Math.min(2, window.devicePixelRatio || 1));
    this.W = cw * this.L; this.H = ch * this.L;
    this.canvas.width = this.W * dpr;
    this.canvas.height = this.H * dpr;
    this.canvas.style.width = this.W + 'px';
    this.canvas.style.height = this.H + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // el mapa se dibuja una vez en un canvas aparte
    this.fondo = document.createElement('canvas');
    // El fondo se arma con suficiente detalle para la camara acercada (64 pixeles por casilla, lo que mide el
    // tileset), aunque en pantalla se vea mas chico.
    const lado = Math.max(Math.round(this.L * dpr), 64);
    this.fondo.width = ancho * lado; this.fondo.height = alto * lado;
    this.ladoFondo = lado;
    this.pintarFondo();
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
    if (!this.pausado && !this.terminado) this.T += (ms / this.msPorTick) * this.velocidad * ESCALA_VELOCIDAD;
    while (this.i < this.registro.length && this.registro[this.i].t <= this.T) this.aplicar(this.registro[this.i++]);
    this.actualizarUnidades(ms);
    this.moverCamara(ms);
    if (this.i >= this.registro.length && !this.terminado) { this.terminado = true; this.alTerminar(); }
  }

  // Cada soldadito que cae deja su cuerpo: se calcula comparando cuantos quedan en pie con los que habia
  anotarCaidos() {
    for (const u of this.unidades.values()) {
      const f = u.ficha;
      if (!f.figuras) continue;
      const vivos = u.viva ? miembrosVivos(f, u.vida) : 0;
      const antes = u.vivosVista === undefined ? f.miembros || 1 : u.vivosVista;
      if (vivos >= antes) continue;
      const fuego = u.estados.has('en_llamas');
      for (let i = vivos; i < antes; i++) {
        const [px, py] = posicionMiembro(u, i);
        const h = Number(u.id.slice(1)) * 7 + i * 13;
        // bichos: queda el mismo bicho tirado (y una mancha); personas: un cuerpo
        const bicho = f.cuerpo === 'mutante';
        const capas = [fuego ? 'mancha_quemado' : 'mancha_' + (1 + (h % 2)), fuego ? 'caido_quemado' : bicho ? figuraDe(f, u, i) : 'caido_0' + (1 + (h % 6))];
        const corridas = {};
        if (!fuego && !bicho && h % 3 === 0) { capas.push('tirado_rifle'); corridas.tirado_rifle = [5, 3]; }
        if (!fuego && !bicho && h % 5 === 1) { capas.push('tirado_casco'); corridas.tirado_casco = [-4, 4]; }
        this.caidos.push({ x: px, y: py, ang: h * 1.3, capas, corridas });
      }
      u.vivosVista = vivos;
    }
  }

  // El mapa (una vez, y de nuevo si algo se rompe). Con luces, tambien sus capas de normales y de brillo.
  pintarFondo() {
    const lado = this.ladoFondo, f = this.fondo;
    const antes = { ...CAPAS };
    if (this.configLuz()) {
      for (const k of ['fondoN', 'fondoE']) {
        if (!this[k]) this[k] = document.createElement('canvas');
        this[k].width = f.width; this[k].height = f.height;
      }
      CAPAS.normal = this.fondoN.getContext('2d'); CAPAS.brillo = this.fondoE.getContext('2d');
    }
    f.getContext('2d').clearRect(0, 0, f.width, f.height);
    dibujarMapa(f.getContext('2d'), this.mapa, lado);
    // en el celular parado el mapa se dibuja girado: los normal maps del piso tambien tienen que girar
    if (this.girado && CAPAS.normal) girarNormales(this.fondoN, -Math.PI / 2);
    Object.assign(CAPAS, antes);
  }

  // ---------- Luces ----------

  // La configuracion de luces, o null si estan apagadas (reglas.arte.luz; el jugador puede bajarlas)
  configLuz() {
    const cfg = (this.datos.reglas.arte || {}).luz;
    if (!cfg || !cfg.activa) return null;
    let pref = null;
    try { pref = new URLSearchParams(location.search).get('luces') || localStorage.getItem('mf-luces'); } catch { /* sin almacenamiento */ }
    if (pref === 'no') return null;
    this.modoLuz = pref === 'simple' || (this.lucesLentas && pref !== 'completa') ? 'simple' : 'completa';
    return cfg;
  }

  // Prepara los lienzos de la escena y de las capas; devuelve false si no hay luces
  prepararLuz() {
    const cfg = this.configLuz();
    if (!cfg) return false;
    if (!this.compositor || this.compositor.modo !== this.modoLuz) {
      this.compositor = crearCompositor(this.modoLuz === 'simple');
      this.compositor.modo = this.modoLuz;
    }
    // como mucho unos 2 millones de pixeles (si no, en pantallas grandes la placa no da)
    this.qLuz = Math.min(1, Math.sqrt(2.0e6 / (this.canvas.width * this.canvas.height)));
    const w = Math.round(this.canvas.width * this.qLuz), h = Math.round(this.canvas.height * this.qLuz);
    for (const k of ['escena', 'capaN', 'capaE']) {
      if (!this[k]) this[k] = document.createElement('canvas');
      const c = this[k];
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      if (k !== 'escena') { const x = c.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, c.width, c.height); }
    }
    if (!this.fondoN) this.pintarFondo();
    CAPAS.normal = this.capaN.getContext('2d'); CAPAS.brillo = this.capaE.getContext('2d');
    return true;
  }

  // Junta la escena con las luces y la pasa al canvas de verdad. M: la transformacion del mapa a la pantalla.
  componerLuz(M, seVe) {
    CAPAS.normal = null; CAPAS.brillo = null;
    const cfg = this.configLuz();
    const L = this.L, s = Math.hypot(M.a, M.b), celda = L * s;
    const aPx = (x, y) => [M.a * x + M.c * y + M.e, M.b * x + M.d * y + M.f];
    const direccion = (ang) => {
      const vx = Math.cos(ang), vy = Math.sin(ang), X = M.a * vx + M.c * vy, Y = M.b * vx + M.d * vy, n = Math.hypot(X, Y) || 1;
      return [X / n, Y / n];
    };
    const luces = [];
    const sumar = (cx, cy, def, extra = {}, fuerza = 1) => {
      if (!def || fuerza <= 0) return;
      const [X, Y] = aPx(cx * L, cy * L);
      luces.push({ x: X, y: Y, z: (def.altura ?? 0.8) * celda, r: def.radio * celda, color: colorLuz(def.color), i: def.intensidad * fuerza, ...extra });
    };
    // en orden de importancia (entran 40)
    for (const f of this.efectos) {
      const k = (this.T - f.t0) / f.dur;
      if (f.tipo === 'explosion') sumar(f.a[0] + 0.5, f.a[1] + 0.5, cfg.explosion, {}, 1 - k);
    }
    for (const f of this.efectos) {
      if (f.tipo !== 'fogonazo') continue;
      const u = this.unidades.get(f.id);
      if (!u || !seVe(u)) continue;
      const k = (this.T - f.t0) / f.dur;
      const [bx, by] = bocaEnMapa(u, f.slot, u.ang, f.n);
      sumar(bx + 0.5, by + 0.5, cfg.fogonazo, {}, 1 - k);
    }
    const vivas = [...this.unidades.values()].filter((u) => u.viva && seVe(u));
    for (const u of vivas) {
      if (!u.ficha.apariencia) continue; // solo los mechas tienen faro
      const def = u.ficha.bando === 0 ? cfg.faro : cfg.faro_enemigo || cfg.faro;
      // el faro va con la cabeza (que mira al enemigo mas cerca)
      const ac = u.angCabeza ?? u.ang;
      const extra = { dir: direccion(ac), cono: ((def.cono || 35) * Math.PI) / 180, suave: 0.12 };
      // faros marcados en el dibujo (amarillo #ffff00), o uno en el medio
      if (u.faros === undefined) u.faros = farosDe(u.ficha);
      const c = Math.cos(ac), s = Math.sin(ac);
      if (u.faros) for (const [fw, rt] of u.faros) sumar(u.x + 0.5 + c * fw - s * rt, u.y + 0.5 + s * fw + c * rt, def, extra, u.faros.length > 1 ? 0.7 : 1);
      else sumar(u.x + 0.5 + c * 0.25, u.y + 0.5 + s * 0.25, def, extra);
    }
    for (const u of vivas) sumar(u.x + 0.5, u.y + 0.5, u.ficha.bando === 0 ? cfg.aura : cfg.aura_enemigo || cfg.aura);
    if (!this.acidos) {
      this.acidos = [];
      const [an, al] = this.mapa.tamano;
      for (let y = 0; y < al; y++) for (let x = 0; x < an; x++) if (this.tablero.tipos[y * an + x] === 'peligro' && x % 2 === 0 && y % 2 === 0) this.acidos.push([x, y]);
    }
    for (const [x, y] of this.acidos) sumar(x + 0.5, y + 0.5, cfg.acido);
    // lo que tapa la luz: muros, coberturas altas y edificios (se rearma cuando algo se rompe)
    if (!this.ocluye || this.ocluye.version !== this.versionMapa) {
      const [an, al] = this.mapa.tamano;
      const tapa = { muro: 1, cobertura_total: 1, edificio: 1 };
      this.ocluye = { ancho: an, alto: al, version: this.versionMapa, celdas: Uint8Array.from(this.tablero.tipos, (t) => (tapa[t] ? 255 : 0)) };
    }
    // de pixel de la escena a casilla: la inversa de M, y despues dividido por el lado de la casilla
    const inv = M.inverse();
    const invCasilla = new DOMMatrix([inv.a / L, inv.b / L, inv.c / L, inv.d / L, inv.e / L, inv.f / L]);
    const amb = colorLuz((cfg.ambiente_por_estilo || {})[this.mapa.estilo] || cfg.ambiente || '#808080');
    const t0 = performance.now();
    const hecho = this.compositor.componer({
      escena: this.escena, normal: this.capaN, brillo: this.capaE, luces,
      ambiente: amb, paso: celda / 32, relieve: cfg.relieve ?? 4, halo: cfg.halo ?? 1, ocluye: this.ocluye, inv: invCasilla
    });
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(hecho, 0, 0, this.canvas.width, this.canvas.height);
    // si la compu (o el celular) no da, se pasa a las luces simples
    if (this.modoLuz === 'completa') {
      this.msLuz = (this.msLuz ?? 8) * 0.95 + (performance.now() - t0) * 0.05;
      if (this.msLuz > 20 && !this.lucesLentas) { this.lucesLentas = true; console.warn('Luces: paso a las simples (' + this.msLuz.toFixed(1) + ' ms)'); }
    }
  }

  // Algo del mapa se rompio: cambia la letra en la copia del mapa y se vuelve a pintar el fondo
  romper(x, y, queda) {
    const M = this.mapa;
    let letra = Object.keys(M.leyenda).find((k) => M.leyenda[k] === queda);
    if (!letra) { letra = String.fromCharCode(0x2460 + Object.keys(M.leyenda).length); M.leyenda[letra] = queda; }
    const f = M.filas[y];
    M.filas[y] = f.slice(0, x) + letra + f.slice(x + 1);
    cambiarCasilla(this.tablero, x, y, queda);
    this.fondoSucio = true;
    this.versionMapa = (this.versionMapa || 0) + 1;
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
        const torso = (f.apariencia && f.apariencia.torso) || '';
        // peso: 0 liviano (infanteria, mutantes) .. 3 pesado. Define giro, pisada y sacudon.
        const peso = f.cuerpo !== 'mecha' ? 0 : torso.includes('pesado') ? 3 : torso.includes('medio') ? 2 : torso ? 1 : 2;
        U.set(e.u, { id: e.u, ficha: f, x: f.x, y: f.y, desde: [f.x, f.y], hacia: [f.x, f.y], t0: 0, dur: 0, salto: false,
          ang: f.bando === 0 ? 0 : Math.PI, paso: 0, vida: f.vida ?? f.vidaMax, viva: true, golpe: 0, estados: new Set(), moral: 'moral_firme',
          grito: null, semilla: (Number(e.u.slice(1)) * 1.7) % 6,
          peso, angObj: f.bando === 0 ? 0 : Math.PI, pasos: 0, alza: 0, retroceso: 0,
          armas: (f.armas || []).map((x) => ({ ...x, recargaHasta: 0 })), // para la barra de municion
          marcas: f.bando === 0 && this.porPiloto.get(f.ref) ? this.porPiloto.get(f.ref).bajas || 0 : 0, vozT: -999 });
        if (e.por) this.alEvento({ texto: (U.get(e.por) || {}).ficha?.nombre + (f.sprite === 'senuelo' ? ' proyecta un señuelo' : ' despliega una torreta'), clase: 'info' });
        // el escuadron de la campana anterior, del otro lado
        if (f.exPiloto) {
          const r = (this.mision.rivales || []).find((x) => 'ex:' + x.piloto.id === f.ref);
          const frase = r && r.frase ? r.frase : EX_PILOTO[Number(e.u.slice(1)) % EX_PILOTO.length];
          this.alEvento({ texto: (f.nemesis ? 'NÉMESIS · ' : '') + f.nombre.toUpperCase() + ' (canal abierto): «' + frase + '»', clase: 'mal', importante: true });
        }
        break;
      }
      case 'mueve':
      case 'salta':
        if (!u) break;
        u.desde = [u.hacia[0], u.hacia[1]]; u.hacia = e.a; u.t0 = e.t; u.dur = Math.max(1, e.d); u.salto = e.tipo === 'salta';
        u.angMov = Math.atan2(e.a[1] - u.desde[1], e.a[0] - u.desde[0]);
        // el torso sigue al que esta encañonando (si no, mira hacia donde camina)
        if (!(u.apunta && this.T < u.apunta.hasta)) u.angObj = u.angMov;
        u.pisoPendiente = true;
        break;
      case 'dispara': {
        const o = U.get(e.o);
        if (!u || !o) break;
        this.efectos.push({ tipo: 'fijado', id: o.id, t0: this.T, dur: 5, propio: o.ficha.bando === 0 });
        this.accion.set(u.id, e.t); this.accion.set(o.id, e.t);
        u.angObj = Math.atan2(o.hacia[1] - u.y, o.hacia[0] - u.x);
        u.apunta = { id: o.id, hasta: e.t + 14 };
        // cuerpo a cuerpo: embestida y el brazo que pega sale para adelante; a distancia: retroceso
        if (e.arma === 'tajo' || e.arma === 'garra') { u.retroceso = -1.6; u.estocada = 1; u.estocadaSlot = e.slot; }
        else u.retroceso = 1;
        const tiro = u.tiros = (u.tiros || 0) + 1; // para turnar los cañones
        gastarBala(u, e.slot, e.t);
        this.efectos.push({ tipo: 'fogonazo', id: u.id, slot: e.slot, n: tiro, t0: this.T, dur: 1.6 });
        const desvio = e.acierta ? 0 : 0.6;
        this.efectos.push({ tipo: e.arma, de: bocaEnMapa(u, e.slot, u.angObj, tiro), a: [o.hacia[0] + desvio * Math.sin(e.t), o.hacia[1] + desvio * Math.cos(e.t)], t0: this.T, dur: e.arma === 'riel' ? 4 : 3 });
        if (e.acierta) {
          o.vida -= e.danio; o.golpe = 1;
          if (o.ficha.tipo === 'piloto' && o.ficha.bando === 0 && !o.dijoHerido && o.vida > 0 && o.vida < o.ficha.vidaMax * 0.3) {
            o.dijoHerido = true;
            this.decir(o, 'herido');
          }
          this.flotante(o, '-' + e.danio + (e.bloqueo ? ' ▣' : ''), e.cob ? '#ffd27a' : '#ff7a6a');
        } else this.flotante(o, 'falla', '#8a9488', true);
        break;
      }
      case 'rompe':
        this.romper(e.x, e.y, e.queda);
        this.efectos.push({ tipo: 'explosion', a: [e.x, e.y], r: e.antes === 'edificio' ? 1.1 : 0.6, t0: this.T, dur: 8 });
        this.temblor = Math.max(this.temblor, e.antes === 'edificio' ? 0.8 : 0.3);
        if (e.antes === 'edificio') this.alEvento({ texto: 'Se viene abajo un edificio', clase: '' });
        break;
      case 'recarga':
        if (u) for (const a of u.armas || []) if (a.municionMax && a.municion < a.municionMax && !a.recargaHasta) a.recargaHasta = e.t + a.recarga;
        break;
      case 'tira_casilla': {
        if (!u) break;
        u.angObj = Math.atan2(e.y - u.y, e.x - u.x);
        u.retroceso = 1;
        this.accion.set(u.id, e.t);
        const tiro = u.tiros = (u.tiros || 0) + 1;
        gastarBala(u, e.slot, e.t);
        this.efectos.push({ tipo: 'fogonazo', id: u.id, slot: e.slot, n: tiro, t0: this.T, dur: 1.6 });
        const d = e.acierta ? 0 : 0.6;
        this.efectos.push({ tipo: e.arma, de: bocaEnMapa(u, e.slot, u.angObj, tiro), a: [e.x + d * Math.sin(e.t), e.y + d * Math.cos(e.t)], t0: this.T, dur: e.arma === 'riel' ? 4 : 3 });
        break;
      }
      case 'esquirla': if (u) { u.vida -= e.danio; u.golpe = 1; this.flotante(u, '-' + e.danio, '#ff9a5a'); } break;
      case 'explota':
        this.efectos.push({ tipo: 'explosion', a: [e.x, e.y], r: e.r + 0.6, t0: this.T, dur: 9 });
        this.temblor = Math.max(this.temblor, 1);
        break;
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
        this.efectos.push({ tipo: 'explosion', a: [u.hacia[0], u.hacia[1]], r: u.peso ? 0.9 + u.peso * 0.15 : 0.6, t0: this.T, dur: 10 });
        if (u.peso) this.temblor = Math.max(this.temblor, 0.5 + u.peso * 0.2);
        const k = e.por ? U.get(e.por) : null;
        const propio = u.ficha.bando === 0;
        // voces: el que mato festeja (a veces); si cae uno de los nuestros, habla su vinculo o algun otro
        if (k && k.ficha.bando === 0 && k.ficha.tipo === 'piloto' && this.azarVoz(e.t, k) < 55) this.decir(k, 'baja');
        if (propio && u.ficha.tipo === 'piloto') {
          const pil = this.porPiloto.get(u.ficha.ref);
          const vinc = pil && pil.vinculo ? [...U.values()].find((x) => x.viva && x.ficha.ref === pil.vinculo && x.ficha.bando === 0) : null;
          if (vinc) this.decir(vinc, 'vinculo_cae', true);
          else {
            const otros = [...U.values()].filter((x) => x.viva && x.ficha.bando === 0 && x.ficha.tipo === 'piloto');
            if (otros.length) this.decir(otros[this.azarVoz(e.t, u) % otros.length], 'aliado_cae', true);
          }
        }
        this.alEvento({ texto: (k ? k.ficha.nombre + ' abatió a ' + u.ficha.nombre : u.ficha.nombre + ' cae') + (e.limpio && !propio ? ' · tiro a la cabina, queda entero' : ''), clase: propio ? 'mal' : 'bien', importante: propio && u.ficha.tipo === 'piloto' });
        this.nemesisAlCaer(u, k, e, U, propio);
        break;
      }
      case 'anula': {
        if (!u) break;
        // lo que se vive por radio (se manda, se pierde, discute...) lo dice el piloto con su voz
        if (VOZ_ANULA.has(e.motivo)) {
          // lo mismo no lo repite por radio a cada rato
          u.vozAnula = u.vozAnula || {};
          if (this.T - (u.vozAnula[e.motivo] ?? -999) < 150) break;
          u.vozAnula[e.motivo] = this.T;
          if (this.decir(u, e.motivo, true)) break;
        }
        const texto = this.datos.textos.gritos[e.motivo] || '…';
        u.grito = { texto, hasta: this.T + 22, desde: this.T };
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
      case 'parte_rota': {
        if (!u) break;
        const nombre = ZONAS[e.zona] || e.zona;
        this.efectos.push({ tipo: 'explosion', a: [u.hacia[0], u.hacia[1]], r: 0.6, t0: this.T, dur: 7 });
        this.temblor = Math.max(this.temblor, 0.4);
        this.flotante(u, nombre, '#ffb04a', true);
        // el brazo roto deja de verse
        if (e.zona.startsWith('brazo')) u.ficha = { ...u.ficha, apariencia: { ...u.ficha.apariencia, [e.zona]: null } };
        const propio = u.ficha.bando === 0;
        this.alEvento({ texto: u.ficha.nombre + ': ' + nombre.toLowerCase() + '.', clase: propio ? 'mal' : 'bien', importante: propio });
        if (propio) this.decir(u, 'parte_rota', true);
        break;
      }
      case 'habilidad': {
        if (!u) break;
        this.flotante(u, (this.datos.habilidades[e.h] || {}).nombre || e.h, '#9fd7ff', true);
        // las que van a un enemigo (marcar, EMP, garra) se ven como un haz hasta el objetivo
        const o = e.o ? U.get(e.o) : null;
        if (o) {
          this.efectos.push({ tipo: 'riel', de: [u.x, u.y], a: [o.hacia[0], o.hacia[1]], t0: this.T, dur: 4 });
          this.efectos.push({ tipo: 'fijado', id: o.id, t0: this.T, dur: 8, propio: o.ficha.bando === 0 });
          u.angObj = Math.atan2(o.hacia[1] - u.y, o.hacia[0] - u.x);
        }
        break;
      }
      case 'oleada': {
        if (e.n <= 1) break;
        this.alEvento({ texto: 'CONTROL › ESCUADRÓN: Oleada ' + e.n + ' de ' + e.de + ' en camino.', clase: 'control', importante: true });
        const vivos = this.nuestros(true);
        if (vivos.length) this.decir(vivos[this.azarVoz(e.t, vivos[0]) % vivos.length], 'oleada', true);
        break;
      }
      case 'contacto': {
        this.estatica = this.T + 8;
        this.decir(u, 'contacto', true, { dir: e.dir, n: e.n });
        break;
      }
      case 'discute': {
        const o = U.get(e.con);
        if (o) this.alEvento({ texto: 'CONTROL: ' + u.ficha.nombre + ', ' + o.ficha.nombre + ', ¡corten la radio y concéntrense!', clase: 'control' });
        break;
      }
      case 'refuerzos': this.estatica = this.T + 10; this.alEvento({ texto: 'CONTROL › ESCUADRÓN: ¡Refuerzos enemigos por detrás! ' + e.cantidad + ' contactos.', clase: 'control', importante: true }); this.temblor = Math.max(this.temblor, 0.3); break;
      case 'mina': {
        this.efectos.push({ tipo: 'explosion', a: [e.x, e.y], r: 1.2, t0: this.T, dur: 10 });
        this.temblor = Math.max(this.temblor, 0.9);
        const v = U.get(e.u);
        if (v) { v.vida -= e.danio; v.golpe = 1; this.flotante(v, '-' + e.danio, '#ff7a6a'); }
        this.alEvento({ texto: '¡MINA! ' + (v ? v.ficha.nombre + ' pisó una mina.' : ''), clase: v && v.ficha.bando === 0 ? 'mal' : 'aviso', importante: true });
        break;
      }
      case 'inicio': {
        this.alEvento({ texto: 'CONTROL › ESCUADRÓN: ' + this.lineaControl('inicio', e.t), clase: 'control' });
        const milicia = [...U.values()].filter((x) => x.ficha.rol === 'milicia').length;
        if (milicia) this.alEvento({ texto: 'CONTROL › ESCUADRÓN: La milicia local pelea con ustedes (' + milicia + (milicia > 1 ? ' pelotones' : ' pelotón') + '). No los dejen solos.', clase: 'control' });
        if (this.mision && this.mision.jefe) {
          this.alEvento({ texto: 'CONTROL › ESCUADRÓN: Objetivo confirmado: ' + this.mision.jefe.nombre + '. No vuelvan sin su cabeza.', clase: 'control', importante: true });
          this.alEvento({ texto: this.mision.jefe.nombre.toUpperCase() + ' (canal abierto): «' + this.mision.jefe.frase + '»', clase: 'mal', importante: true });
        }
        const nuestros = this.nuestros(false);
        if (nuestros.length) this.decir(nuestros[(nuestros.length * 7 + this.registro.length) % nuestros.length], 'inicio', true);
        break;
      }
      case 'fin': {
        this.alEvento({ texto: 'CONTROL › ESCUADRÓN: ' + this.lineaControl(e.victoria ? 'victoria' : 'derrota', e.t), clase: 'control', importante: true });
        if (!e.victoria) break;
        const vivos = [...U.values()].filter((x) => x.viva && x.ficha.bando === 0 && x.ficha.tipo === 'piloto');
        if (vivos.length) this.decir(vivos[this.azarVoz(e.t, vivos[0]) % vivos.length], 'victoria', true);
        break;
      }
    }
  }

  // Numero fijo (0..99) para elegir frases sin azar: la misma batalla se ve igual cada vez.
  azarVoz(t, u) {
    let h = (t * 2654435761 + Number(String(u.id).slice(1)) * 40503) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    return ((h ^ (h >>> 13)) >>> 0) % 100;
  }

  // Un piloto dice algo segun su personalidad. Para no llenar todo de globos: cada uno espera un rato entre
  // frase y frase, y entre todos tambien (salvo lo importante: forzar).
  nuestros(soloVivos) {
    return [...this.unidades.values()].filter((x) => x.ficha.bando === 0 && x.ficha.tipo === 'piloto' && (!soloVivos || x.viva));
  }

  // Lo que dice Control (el jugador) al abrir y cerrar la mision
  lineaControl(momento, t) {
    const lista = ((this.datos.voces || {}).control || {})[momento] || [];
    return lista.length ? lista[(t * 7 + this.registro.length) % lista.length] : '';
  }

  decir(u, momento, forzar = false, vars = null) {
    if (!u || !u.viva && momento !== 'vinculo_cae') return false;
    const V = this.datos.voces || {};
    const pers = u.ficha.personalidad;
    const lista = (V[pers] && V[pers][momento]) || (V.comun && V.comun[momento]);
    if (!lista || !lista.length) return false;
    if (!forzar && (this.T - this.ultimaVoz < 14 || this.T - u.vozT < 45)) return false;
    if (u.grito && this.T < u.grito.hasta && !forzar) return false;
    let texto = lista[this.azarVoz(Math.floor(this.T), u) % lista.length];
    if (vars) texto = texto.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : k));
    u.grito = { texto, hasta: this.T + 24, desde: this.T };
    u.vozT = this.T; this.ultimaVoz = this.T;
    // los nuestros hablan por radio con Control
    const quien = u.ficha.bando === 0 ? u.ficha.nombre.toUpperCase() + ' › CONTROL' : u.ficha.nombre;
    this.alEvento({ texto: quien + ': «' + texto + '»', clase: 'voz', importante: momento === 'vinculo_cae' || momento === 'contacto' });
    return true;
  }

  // El nemesis de la mision (lo que dice esta armado en campana/nemesis.js > quizasAparece)
  rivalNemesis(x) {
    return x && x.ficha.nemesis ? (this.mision.rivales || []).find((r) => r.nemesis && 'ex:' + r.piloto.id === x.ficha.ref) : null;
  }

  // Lo que se dicen el nemesis y su rival cuando cae alguno de los dos
  nemesisAlCaer(u, k, e, U, propio) {
    const canal = (x, texto) => this.alEvento({ texto: 'NÉMESIS · ' + x.ficha.nombre.toUpperCase() + ' (canal abierto): «' + texto + '»', clase: 'mal', importante: true });
    const nuestro = (x, texto) => {
      x.grito = { texto, hasta: this.T + 30 };
      this.alEvento({ texto: x.ficha.nombre.toUpperCase() + ' › CONTROL: «' + texto + '»', clase: 'voz', importante: true });
    };
    const rv = this.rivalNemesis(u);
    if (rv && rv.lineas) {
      const cae = e.limpio || rv.cae;
      if (!cae) this.flotante(u, '¡EYECCIÓN!', '#ffd27a');
      canal(u, cae ? rv.lineas.cae : rv.lineas.escapa);
      const vivos = [...U.values()].filter((x) => x.viva && x.ficha.bando === 0 && x.ficha.tipo === 'piloto');
      const contesta = vivos.find((x) => x.ficha.ref === rv.objetivo) || (k && k.viva && k.ficha.bando === 0 ? k : vivos[0]);
      if (contesta) nuestro(contesta, cae ? rv.lineas.respCae : rv.lineas.respEscapa);
      return;
    }
    const rk = this.rivalNemesis(k);
    if (rk && rk.lineas && propio && u.ficha.tipo === 'piloto') canal(k, u.ficha.ref === rk.objetivo ? rk.lineas.bajaObjetivo : rk.lineas.baja);
  }

  flotante(u, texto, color, chico = false) {
    this.flotantes.push({ x: u.hacia[0], y: u.hacia[1], texto, color, chico, t0: this.T, dur: 10 });
  }

  actualizarUnidades(ms) {
    for (const u of this.unidades.values()) {
      const dtTicks = this.pausado ? 0 : (ms / this.msPorTick) * this.velocidad * ESCALA_VELOCIDAD;
      // Cada parte gira por su lado (se nota el peso):
      //  - las piernas, hacia donde camina, rapido;
      //  - el torso (con los brazos), hacia el que esta atacando mientras lo tiene encañonado; si no, hacia donde
      //    camina. Es lo mas lento: los pesados tardan en encarar;
      //  - la cabeza, siempre al enemigo mas cerca, rapida (y sin pasarse de lo que da el cuello).
      if (u.apunta && this.T < u.apunta.hasta) {
        const o = this.unidades.get(u.apunta.id);
        if (o && o.viva) u.angObj = Math.atan2(o.y - u.y, o.x - u.x);
        else u.apunta = null;
      }
      const giro = [0.7, 0.4, 0.3, 0.22][u.peso] * dtTicks;
      u.ang = girarHacia(u.ang, u.angObj, giro * 0.75);
      if (u.angPiernas === undefined) { u.angPiernas = u.ang; u.angCabeza = u.ang; }
      u.angPiernas = girarHacia(u.angPiernas, u.angMov ?? u.angPiernas, giro * 1.8);
      if (u.viva && u.ficha.apariencia) {
        let cerca = null, dMin = 81;
        for (const o of this.unidades.values()) {
          if (!o.viva || o.ficha.bando === u.ficha.bando) continue;
          const d = (o.x - u.x) ** 2 + (o.y - u.y) ** 2;
          if (d < dMin) { dMin = d; cerca = o; }
        }
        let quiere = cerca ? Math.atan2(cerca.y - u.y, cerca.x - u.x) : u.ang;
        // el cuello da hasta 100 grados para cada lado del torso
        let rel = quiere - u.ang;
        while (rel > Math.PI) rel -= Math.PI * 2;
        while (rel < -Math.PI) rel += Math.PI * 2;
        quiere = u.ang + Math.max(-1.75, Math.min(1.75, rel));
        u.angCabeza = girarHacia(u.angCabeza, quiere, giro * 2.5);
      }
      // municion: las recargas terminan solas
      for (const a of u.armas || []) if (a.recargaHasta && this.T >= a.recargaHasta) { a.municion = a.municionMax; a.recargaHasta = 0; }
      // estocada (cuerpo a cuerpo): el brazo sale para adelante y vuelve
      if (u.estocada > 0) u.estocada = Math.max(0, u.estocada - dtTicks / 3);
      // sacudon de lo que va arriba de las piernas, al ritmo de los pasos (los pesados se sacuden mas)
      if (u.anda && u.peso && u.viva) {
        const tic = Math.floor(this.T * 3), sem = (u.semilla ??= [...u.id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) % 997);
        const r = (n) => (((tic * 9301 + sem * 49297 + n * 233) % 233280) / 233280 - 0.5);
        const amp = [0, 0.25, 0.4, 0.6][u.peso] * (0.6 + Math.abs(Math.sin(u.paso * Math.PI * 2)));
        u.sacude = [r(1) * amp, r(2) * amp];
      } else u.sacude = null;
      if (u.dur && this.T < u.t0 + u.dur && u.viva) {
        const k = Math.max(0, Math.min(1, (this.T - u.t0) / u.dur));
        // Un mecha da pasos: arranca, carga el peso y frena en cada casilla (curva suave). La infanteria corre parejo.
        const e = u.peso ? 0.5 - Math.cos(k * Math.PI) / 2 : k;
        u.x = u.desde[0] + (u.hacia[0] - u.desde[0]) * e;
        u.y = u.desde[1] + (u.hacia[1] - u.desde[1]) * e;
        // la zancada sigue al paso: media vuelta de piernas por casilla
        u.paso = ((u.pasos + e) * 0.5) % 1;
        u.anda = true;
        u.alza = u.peso ? Math.sin(k * Math.PI) : 0;
        if (u.salto) u.alza = Math.sin(k * Math.PI) * 3;
      } else {
        u.x = u.hacia[0]; u.y = u.hacia[1]; u.alza = 0; u.anda = false;
        if (u.pisoPendiente) {
          // la pisada: polvo, y en los pesados un sacudon chico
          u.pisoPendiente = false;
          u.pasos++;
          if (u.peso && u.viva) {
            this.efectos.push({ tipo: 'polvo', a: [u.x, u.y], t0: this.T, dur: 6, peso: u.peso, lado: u.pasos % 2 ? 1 : -1, ang: u.ang });
            if (u.peso >= 3) this.temblor = Math.max(this.temblor, 0.25);
          }
        }
      }
      if (u.ficha.figuras && u.viva) moverTropa(u, this.T, dtTicks, (x, y) => caminable(this.tablero, x, y));
      if (u.retroceso > 0) u.retroceso = Math.max(0, u.retroceso - dtTicks / 2.5);
      else if (u.retroceso < 0) u.retroceso = Math.min(0, u.retroceso + dtTicks / 2.5); // la embestida del cuerpo a cuerpo
      if (u.golpe > 0) u.golpe = Math.max(0, u.golpe - ms / 180);
      if (u.grito && this.T > u.grito.hasta) u.grito = null;
    }
    this.temblor = Math.max(0, this.temblor - ms / 450);
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
          if (distancia(p, { x, y }) <= Math.max(2, 7 + (this.mision.visionDelta || 0)) && lineaDeTiro(this.tablero, p, { x, y })) { vistas.add(y * ancho + x); break; }
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
    // con luces, el mapa y las unidades se dibujan en un lienzo aparte y despues se iluminan
    const iluminar = this.prepararLuz();
    let ctx = iluminar ? this.escena.getContext('2d') : this.ctx;
    const L = this.L, dpr = this.dpr;
    const [ancho, alto] = this.mapa.tamano;
    const q = iluminar ? this.qLuz : 1; // la escena iluminada puede ir a menos resolucion (pantallas enormes)
    ctx.setTransform(dpr * q, 0, 0, dpr * q, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);
    // todo lo del mapa se dibuja en coordenadas del mapa; el giro lo hace la transformacion
    if (this.girado) { ctx.translate(0, ancho * L); ctx.rotate(-Math.PI / 2); }
    // camara: acercar y centrar
    const c = this.cam;
    if (this.temblor > 0) {
      const t = this.temblor * this.temblor * L * 0.18;
      ctx.translate((Math.random() - 0.5) * t, (Math.random() - 0.5) * t);
    }
    ctx.translate((ancho * L) / 2, (alto * L) / 2);
    ctx.scale(c.z, c.z);
    ctx.translate(-c.x, -c.y);
    ctx.imageSmoothingEnabled = false;
    if (this.fondoSucio && this.ladoFondo) { this.fondoSucio = false; this.pintarFondo(); }
    ctx.drawImage(this.fondo, 0, 0, ancho * L, alto * L);
    if (iluminar) for (const [capa, f] of [[CAPAS.normal, this.fondoN], [CAPAS.brillo, this.fondoE]]) {
      capa.setTransform(ctx.getTransform()); capa.imageSmoothingEnabled = false;
      capa.drawImage(f, 0, 0, ancho * L, alto * L);
    }
    const vistas = this.visibles();
    const seVe = (u) => !vistas || u.ficha.bando === 0 || vistas.has(Math.round(u.y) * ancho + Math.round(u.x));

    const lista = [...this.unidades.values()].sort((a, b) => (a.viva - b.viva) || a.y - b.y);
    // polvo de las pisadas, debajo de las unidades
    for (const f of this.efectos) {
      if (f.tipo !== 'polvo') continue;
      const k = (this.T - f.t0) / f.dur;
      ctx.globalAlpha = 0.45 * (1 - k);
      ctx.fillStyle = '#9aa58e';
      const cx = (f.a[0] + 0.5) * L - Math.sin(f.ang) * f.lado * L * 0.22, cy = (f.a[1] + 0.5) * L + Math.cos(f.ang) * f.lado * L * 0.22;
      for (let i = 0; i < 4; i++) {
        const a = i * 1.7 + f.t0;
        const r = L * (0.06 + 0.05 * f.peso) * (0.6 + k);
        ctx.beginPath(); ctx.arc(cx + Math.cos(a) * L * 0.18 * (0.4 + k), cy + Math.sin(a) * L * 0.18 * (0.4 + k), r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    // los caidos de la infanteria, en el piso (debajo de todos)
    this.anotarCaidos();
    for (const c of this.caidos) dibujarCaido(ctx, c, L);
    // con luces: lo que brilla del piso (y su relieve) no puede quedar encima de las unidades: se borra donde estan
    if (iluminar) {
      const capas = { ...CAPAS };
      CAPAS.normal = null; CAPAS.brillo = null;
      if (!this.mascara) this.mascara = document.createElement('canvas');
      const mk = this.mascara;
      if (mk.width !== this.escena.width || mk.height !== this.escena.height) { mk.width = this.escena.width; mk.height = this.escena.height; }
      const mc = mk.getContext('2d');
      mc.setTransform(1, 0, 0, 1, 0, 0); mc.clearRect(0, 0, mk.width, mk.height);
      mc.setTransform(ctx.getTransform()); mc.imageSmoothingEnabled = false;
      for (const u of lista) if (seVe(u)) dibujarUnidad(mc, u, L, this.T);
      for (const c of [capas.normal, capas.brillo]) {
        c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'destination-out'; c.drawImage(mk, 0, 0); c.restore();
      }
      Object.assign(CAPAS, capas);
    }
    for (const u of lista) if (seVe(u)) dibujarUnidad(ctx, u, L, this.T);
    // lo de arriba queda iluminado; los fogonazos y efectos de abajo dan luz, asi que van encima, a pleno
    if (iluminar) {
      const M = ctx.getTransform();
      this.componerLuz(M, seVe);
      ctx = this.ctx;
      ctx.setTransform(M.a / q, M.b / q, M.c / q, M.d / q, M.e / q, M.f / q);
      ctx.imageSmoothingEnabled = false;
    }
    // fogonazos en la boca del arma
    for (const f of this.efectos) {
      if (f.tipo !== 'fogonazo') continue;
      const u = this.unidades.get(f.id);
      if (!u || !seVe(u)) continue;
      const k = (this.T - f.t0) / f.dur;
      const [bx, by] = bocaEnMapa(u, f.slot, u.ang, f.n);
      const fx = (bx + 0.5) * L, fy = (by + 0.5) * L;
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = '#fff3b0';
      ctx.beginPath(); ctx.arc(fx, fy, L * 0.14 * (1.2 - k), 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffb347';
      ctx.beginPath(); ctx.arc(fx, fy, L * 0.24 * (1.2 - k), 0, Math.PI * 2); ctx.globalAlpha = 0.5 * (1 - k); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // efectos
    for (const f of this.efectos) {
      const k = (this.T - f.t0) / f.dur;
      ctx.globalAlpha = Math.max(0, 1 - k);
      if (f.tipo === 'fijado' || f.tipo === 'polvo' || f.tipo === 'fogonazo') { ctx.globalAlpha = 1; continue; }
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
          // un tajo ancho que barre de un lado al otro, cruzando al que recibe
          const a0 = Math.atan2(y1 - y0, x1 - x0) - Math.PI / 2;
          const barrido = a0 - 1.2 + Math.min(1, k * 2.2) * 2.4;
          ctx.lineCap = 'round';
          for (const [ancho, alfa, r] of [[L * 0.16, 0.35, 0.5], [L * 0.07, 0.9, 0.48]]) {
            ctx.globalAlpha = (1 - k) * alfa;
            ctx.lineWidth = ancho;
            ctx.beginPath(); ctx.arc(x1, y1, L * r, Math.min(barrido, a0 - 1.2 + 0.2), barrido); ctx.stroke();
          }
          ctx.globalAlpha = 1;
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
      barraDeVida(ctx, u, cx, top, Lz, this.T);
      if (u.estados.has('en_llamas')) { ctx.fillStyle = '#ff8a2a'; ctx.fillRect(cx + Lz * 0.42, top - 4, 3, 3); }
      if (u.estados.has('suprimido')) { ctx.fillStyle = '#b8b8b8'; ctx.fillRect(cx + Lz * 0.42, top, 3, 3); }
      if (u.moral === 'moral_quebrada') { ctx.fillStyle = '#e0a43a'; ctx.fillText('!', cx - Lz * 0.5, top + 4); }
      if (u.grito) radio(ctx, u, cx, top - (Math.max(5, Lz * 0.16) * 1.5 + 7), Lz, this.W, this.T);
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
    // estatica de radio: rayas que titilan unos instantes (determinista, segun el tiempo)
    if (this.T < this.estatica) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const k = (this.estatica - this.T) / 8;
      for (let i = 0; i < 14; i++) {
        const h = ((Math.floor(this.T * 3) * 97 + i * 131) % 1000) / 1000;
        ctx.fillStyle = i % 3 ? 'rgba(200,220,200,' + (0.08 * k) + ')' : 'rgba(0,0,0,' + (0.18 * k) + ')';
        ctx.fillRect(0, h * this.H, this.W, 1 + (i % 4));
      }
    }
  }

  // Estado actual de los pilotos (para la lista al costado).
  pilotos() {
    return [...this.unidades.values()].filter((u) => u.ficha.bando === 0 && u.ficha.tipo === 'piloto');
  }
}

export { COLORES };

// Barra de vida estilo MOBA: todas del mismo ancho, con una rayita cada 10 puntos (y una mas marcada cada 50),
// asi a simple vista se ve cuanta vida tiene. El pedazo recien perdido queda claro un momento y despues se va.
const SEGMENTO = 10;
// Lo que dice una unidad, como si llegara por radio: globo oscuro con los colores de la consola
// (verde fosforo los nuestros, rojo los enemigos), letra chica y una flechita hacia quien habla.
// Al aparecer titila un instante, como una transmision que entra.
function radio(ctx, u, cx, abajo, Lz, W, T) {
  const nuestro = u.ficha.bando === 0;
  const texto = u.grito.texto;
  const tam = Math.round(Math.max(11, Lz * 0.34));
  ctx.save();
  ctx.font = `${tam}px VT323, monospace`;
  ctx.textAlign = 'left';
  const marca = nuestro ? '▸ ' : '◂ ';
  const w = Math.ceil(ctx.measureText(marca + texto).width) + 10, h = tam + 4;
  const bx = Math.round(Math.min(Math.max(cx - w / 2, 2), W - w - 2)), by = Math.round(Math.max(2, abajo - h - 4));
  const recien = u.grito.desde !== undefined ? T - u.grito.desde : 9;
  if (recien < 1.5 && Math.floor(recien * 8) % 2) ctx.globalAlpha = 0.45;
  const borde = nuestro ? '#4f7a33' : '#7e2a22', letra = nuestro ? '#8fdc5a' : '#e57a6c';
  ctx.fillStyle = 'rgba(13,15,11,0.9)'; ctx.fillRect(bx, by, w, h);
  ctx.strokeStyle = borde; ctx.lineWidth = 1; ctx.strokeRect(bx + 0.5, by + 0.5, w - 1, h - 1);
  // flechita hacia la unidad
  const fx = Math.round(Math.min(Math.max(cx, bx + 6), bx + w - 6));
  ctx.fillStyle = 'rgba(13,15,11,0.9)';
  ctx.beginPath(); ctx.moveTo(fx - 4, by + h - 1); ctx.lineTo(fx + 4, by + h - 1); ctx.lineTo(fx, by + h + 4); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = borde; ctx.beginPath(); ctx.moveTo(fx - 4, by + h - 0.5); ctx.lineTo(fx, by + h + 4); ctx.lineTo(fx + 4, by + h - 0.5); ctx.stroke();
  // lineas de barrido, muy suaves
  ctx.fillStyle = 'rgba(143,220,90,0.05)';
  for (let y = by + 2; y < by + h - 1; y += 2) ctx.fillRect(bx + 1, y, w - 2, 1);
  ctx.fillStyle = borde === '#4f7a33' ? '#4f7a33' : '#7e2a22';
  ctx.fillText(marca, bx + 5, by + h - 4);
  ctx.fillStyle = letra;
  ctx.fillText(texto, bx + 5 + ctx.measureText(marca).width, by + h - 4);
  ctx.restore();
}

// Un disparo de esa arma: una bala menos (y si se vacia, a recargar)
function gastarBala(u, slot, t) {
  const a = (u.armas || []).find((x) => x.slot === slot && x.municionMax);
  if (!a || a.recargaHasta) return;
  a.municion = Math.max(0, a.municion - 1);
  if (a.municion === 0) a.recargaHasta = t + a.recarga;
}

// Barra de municion (solo los nuestros, debajo de la vida, la mitad de alta): un tramo por arma con cargador
// (izquierda, lo del medio, derecha), asi se ve cual recarga mientras la otra sigue tirando. Una rayita por bala si
// entran, si no cada 5. Mientras recarga, el tramo se va llenando mas apagado.
const ORDEN_SLOT = { brazo_izq: 0, torso: 1, cabeza: 1, mochila: 1, brazo_der: 2 };
function barraDeMunicion(ctx, u, x0, y0, w, hb, T) {
  const armas = (u.armas || []).filter((a) => a.municionMax).sort((a, b) => (ORDEN_SLOT[a.slot] ?? 1) - (ORDEN_SLOT[b.slot] ?? 1));
  if (!armas.length) return 0;
  ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(x0, y0, w, hb + 2);
  const hueco = 2, ancho = (w - 2 - hueco * (armas.length - 1)) / armas.length;
  armas.forEach((a, k) => {
    const x = x0 + 1 + k * (ancho + hueco), max = a.municionMax;
    ctx.fillStyle = '#1f1a14'; ctx.fillRect(x, y0 + 1, ancho, hb);
    if (a.recargaHasta) {
      const prog = Math.max(0, Math.min(1, 1 - (a.recargaHasta - T) / (a.recarga || 1)));
      ctx.fillStyle = 'rgba(217,160,102,0.35)'; ctx.fillRect(x, y0 + 1, ancho * prog, hb);
    } else {
      ctx.fillStyle = '#d9a066'; ctx.fillRect(x, y0 + 1, (ancho * a.municion) / max, hb);
    }
    const cada = ancho / max >= 2.5 ? 1 : 5;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    for (let v = cada; v < max; v += cada) ctx.fillRect(Math.round(x + (ancho * v) / max), y0 + 1, 1, hb);
  });
  return hb + 2;
}

function barraDeVida(ctx, u, cx, top, Lz, T = 0) {
  const max = u.ficha.vidaMax, vida = Math.max(0, u.vida);
  // lo que se ve baja de a poco hasta la vida real (el "rastro" del golpe)
  if (u.vidaVista === undefined || u.vidaVista < vida) u.vidaVista = vida;
  else u.vidaVista += (vida - u.vidaVista) * 0.08;
  const w = Math.round(Math.max(26, Lz * 0.92)), hb = Math.round(Math.max(5, Lz * 0.16));
  // la de municion va abajo, pegada a la unidad, y la vida encima
  const hm = Math.max(2, Math.round(hb / 2));
  const conMunicion = u.ficha.bando === 0 && (u.armas || []).some((a) => a.municionMax);
  const x0 = Math.round(cx - w / 2), y0 = Math.round(top - hb - 2 - (conMunicion ? hm + 1 : 0));
  if (conMunicion) barraDeMunicion(ctx, u, x0, y0 + hb + 2 - 1, w, hm, T);
  const ancho = w - 2;
  const bueno = u.ficha.bando === 0;
  const pct = vida / max;
  ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(x0, y0, w, hb + 2);
  ctx.fillStyle = '#1b1f18'; ctx.fillRect(x0 + 1, y0 + 1, ancho, hb);
  ctx.fillStyle = '#f2e6b0'; ctx.fillRect(x0 + 1, y0 + 1, ancho * Math.min(1, u.vidaVista / max), hb);
  ctx.fillStyle = bueno ? (pct > 0.3 ? '#6fc24a' : '#e0a43a') : '#d24a38';
  ctx.fillRect(x0 + 1, y0 + 1, ancho * pct, hb);
  // brillo arriba para que se lea como barra
  ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x0 + 1, y0 + 1, ancho * pct, Math.max(1, hb / 3));
  // rayitas: cada 10 (si entran) y cada 50 mas largas
  const paso = (ancho * SEGMENTO) / max;
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  for (let v = SEGMENTO; v < max; v += SEGMENTO) {
    const grande = v % 50 === 0;
    if (!grande && paso < 2.5) continue;
    const x = Math.round(x0 + 1 + (ancho * v) / max);
    ctx.fillRect(x, y0 + 1, 1, grande ? hb : Math.ceil(hb * 0.55));
  }
}

