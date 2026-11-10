// Lo que pasa solo entre mision y mision: sucesos de viaje (un dilema en pleno salto), noticias del sector
// (algo que cambia todo el sector por un rato), la nomina de los pilotos y los rasgos de cada sector.
// Datos: dilemas.json ('viaje'), bandos.json (brujula.suceso_chance, noticias), reglas.json (sueldos),
// sectores.json (rasgos).
import { modSector, correrFrente, reputacion, sumarReputacion, quien } from './brujula.js';
import { sortearDilema } from './dilemas.js';
import { anotar, sumarStat } from './cronica.js';

// ---------- Rasgos ----------

// Los rasgos de un sector nuevo: el suyo (fijo) y uno mas al azar
export function rasgosDelSector(datos, sdef, numero, az) {
  const R = datos.sectores.campana_base.rasgos || {};
  const lista = [];
  if (sdef.rasgo && R[sdef.rasgo]) lista.push({ id: sdef.rasgo, ...R[sdef.rasgo] });
  const azar = Object.entries(R).filter(([id, r]) => id[0] !== '_' && r.peso && (r.desde || 1) <= numero && id !== sdef.rasgo);
  if (azar.length) { const id = az.elegirConPeso(azar.map(([k, r]) => [k, r.peso])); lista.push({ id, ...R[id] }); }
  return lista.map(({ id, nombre, texto, efectos }) => ({ id, nombre, texto, efectos }));
}

// Condiciones que el sector mete seguido en sus contratos: [{ id, chance }]
export function condicionesDelSector(s) {
  return (s.rasgos || []).map((r) => r.efectos && r.efectos.condicion).filter(Boolean);
}

// ---------- Sueldos ----------

export function nomina(datos, p) {
  const S = datos.reglas.sueldos;
  if (!S) return 0;
  const base = p.pilotos.reduce((t, x) => t + S.por_piloto + S.por_nivel * (x.nivel || 1), 0);
  return Math.round((base * (100 + modSector(p.sectores[p.sector], 'sueldos_pct'))) / 100);
}

export const saltosParaCobrar = (datos, p) => (p.nomina === undefined ? datos.reglas.sueldos.cada : p.nomina);

// En cada salto: si toca dia de pago, se paga todo o no se paga nada (y a todos les sube el malestar)
export function diaDePago(datos, p) {
  const S = datos.reglas.sueldos;
  p.sueldo = null;
  if (!S) return;
  p.nomina = saltosParaCobrar(datos, p) - 1;
  if (p.nomina > 0) return;
  p.nomina = S.cada;
  const total = nomina(datos, p);
  if (p.creditos >= total) {
    p.creditos -= total;
    p.sueldo = { total, pagado: true };
    sumarStat(p, 'sueldos', total);
  } else {
    for (const x of p.pilotos) x.malestar = Math.min(100, (x.malestar || 0) + datos.reglas.malestar.por_sueldo_impago);
    p.sueldo = { total, pagado: false };
    sumarStat(p, 'impagos');
    if (p.stats.impagos === 1) anotar(p, 'No alcanzó para pagar los sueldos.', 'sueldo');
  }
}

// ---------- Noticias del sector ----------

export function noticiaDelSector(datos, p, az) {
  const N = datos.bandos.noticias;
  const s = p.sectores[p.sector];
  s.novedad = null;
  if (!N || !s.saltos || s.saltos % N.cada) return;
  const vale = (n) => {
    const r = n.requiere || {};
    if (r.bandos && s.bandos.length < r.bandos) return false;
    if (r.amenaza && !s.amenazas.some((a) => a.tipo === r.amenaza && a.vivo)) return false;
    return true;
  };
  const aptas = Object.entries(N.lista).filter(([id, n]) => vale(n) && !(s.noticia && s.noticia.id === id));
  if (!aptas.length) return;
  const id = az.elegirConPeso(aptas.map(([k, n]) => [k, n.peso]));
  const n = N.lista[id];
  let bando = az.elegir(s.bandos), otro = az.elegir(s.bandos.filter((b) => b !== bando).concat(s.bandos.length > 1 ? [] : [bando]));
  if (n.reputacion) bando = s.bandos.slice().sort((a, b) => reputacion(p, a) - reputacion(p, b))[0];
  if (n.frente) correrFrente(datos, s, bando, otro, n.frente);
  if (n.amenaza) for (const a of s.amenazas) if (a.tipo === n.amenaza.tipo && a.vivo) {
    const tope = datos.bandos.amenazas[a.tipo].radio_maximo || 99;
    a.r = Math.round(Math.min(tope, (a.r || 0) + n.amenaza.crece) * 100) / 100;
  }
  if (n.reputacion) sumarReputacion(datos, p, bando, n.reputacion);
  const texto = n.texto.replace(/\{bando\}/g, quien(datos, bando).nombre).replace(/\{otro\}/g, quien(datos, otro).nombre);
  const nota = { id, titulo: n.titulo, texto, mods: n.mods || null, hasta: n.dura ? s.saltos + n.dura : s.saltos };
  if (n.mods) s.noticia = nota;
  s.novedad = nota;
  s.noticias = (s.noticias || []).concat({ salto: s.saltos, titulo: n.titulo, texto }).slice(-6);
  sumarStat(p, 'noticias');
}

// La noticia que sigue corriendo (con efectos), o null
export const noticiaActiva = (s) => (s && s.noticia && s.noticia.hasta > s.saltos ? s.noticia : null);

// ---------- Sucesos de viaje ----------

// Quizas pasa algo en el salto: queda en p.suceso y se resuelve antes de llegar. Devuelve el id o null.
export function sucesoDeViaje(datos, p, az) {
  const chance = datos.bandos.brujula.suceso_chance || 0;
  p.suceso = null;
  if (!p.pilotos.length || !az.tirada(chance)) return null;
  const dilema = sortearDilema(datos, p, az, true);
  if (!dilema) return null;
  p.suceso = { dilema, resultado: null, piloto: p.pilotos[az.entero(0, p.pilotos.length - 1)].id };
  sumarStat(p, 'sucesos');
  return dilema;
}
