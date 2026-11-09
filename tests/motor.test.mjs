// Pruebas del motor y la campana (sin navegador):  node tests/motor.test.mjs
import { cargarDatos } from '../src/core/datos.js';
import { crearAzar } from '../src/core/azar.js';
import { simular } from '../src/motor/simular.js';
import { evaluar } from '../src/motor/decision.js';
import { armarMision } from '../src/campana/misiones.js';
import { crearRecluta } from '../src/campana/reclutas.js';
import { nuevaPartida, nodosSiguientes, destinosDeLaNave, elegirNodo, escuadronParaMision, cerrarMision, seguir, generarSector, elegirOpcion } from '../src/campana/partida.js';
import { relato } from '../src/campana/cronica.js';
import { fotoPiloto } from '../src/campana/legado.js';
import { saquear } from '../src/campana/saqueo.js';
import { reparar, costoReparacion, partesRotas } from '../src/campana/mantenimiento.js';
import { leerDisco } from '../tools/leer-disco.mjs';
import { nemesisDelLegado, quizasAparece, resolverNemesis } from '../src/campana/nemesis.js';
import { normalizarPieza } from '../src/motor/unidades.js';

let fallas = 0;
function ok(cond, msg) { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (!cond) fallas++; }
const datos = await cargarDatos(leerDisco());

function batalla(plantilla, semilla, dificultad = 1) {
  const az = crearAzar(semilla);
  const escuadron = ['vanguardia', 'tirador', 'medico', 'infiltrador']
    .map((c, i) => crearRecluta(datos, az, 'p' + i, c)).map((p) => ({ piloto: p, mecha: p.mecha, gambits: p.gambits }));
  const mision = armarMision(datos, plantilla, dificultad, az);
  return simular(datos, { mision, escuadron, semilla: mision.semilla });
}

console.log('Determinismo');
for (const m of Object.keys(datos.misiones)) {
  ok(batalla(m, 77).huella === batalla(m, 77).huella, m + ': misma entrada, misma batalla');
}
ok(batalla('defensa', 77).huella !== batalla('defensa', 78).huella, 'otra semilla, otra batalla');
// Huella de referencia: si cambia sin querer, se rompio el determinismo o cambio una regla.
// Si el cambio es a proposito, subir version_motor en data/reglas.json y actualizar este numero.
const ref = batalla('defensa', 4242).huella;
ok(ref === 'xmqw26', 'huella de referencia de la defensa 4242 (' + ref + ')');

console.log('Registro');
{
  const r = batalla('asalto', 9);
  const tipos = new Set(r.registro.map((e) => e.tipo));
  for (const t of ['aparece', 'inicio', 'mueve', 'dispara', 'muere', 'fin']) ok(tipos.has(t), 'tiene eventos "' + t + '"');
  ok(r.registro.every((e, i, a) => i === 0 || e.t >= a[i - 1].t), 'los eventos estan en orden de tiempo');
  ok(r.registro.every((e) => JSON.stringify(e) === JSON.stringify(JSON.parse(JSON.stringify(e)))), 'todo el registro se puede guardar como texto');
  ok(Object.keys(r.resumen.pilotos).length === 4, 'el resumen trae a los 4 pilotos');
}

console.log('Ganchos y personalidades');
{
  // Las desobediencias por panico solo las hacen los cobardes; las de "corre a cubrir", los leales.
  const motivos = { huye_en_panico: 'cobarde', corre_a_cubrir: 'leal' };
  let vistas = 0, malas = 0;
  for (let s = 1; s <= 40; s++) {
    const r = batalla('defensa', s, 2);
    const pers = {};
    for (const e of r.registro) if (e.tipo === 'aparece') pers[e.u] = e.ficha.personalidad;
    for (const e of r.registro) if (e.tipo === 'anula' && motivos[e.motivo]) { vistas++; if (pers[e.u] !== motivos[e.motivo]) malas++; }
  }
  ok(vistas > 0 && malas === 0, 'cada desobediencia viene de la personalidad que corresponde (' + vistas + ' vistas)');
}
{
  const u = { vida: 35, vidaMax: 100, moralActual: 50, armas: [] };
  const expr = { dato: 'yo.vida_pct', op: '<', param: 'valor' };
  ok(!evaluar({}, { u }, expr, { valor: 30 }), 'vida 35% no es < 30%');
  ok(evaluar({}, { u, corrimientos: { 'yo.vida_pct': 10 } }, expr, { valor: 30 }), 'con correr_umbral +10 (Cobarde) ya cuenta como < 30%');
  ok(evaluar({}, { u }, { todos: [true, { no: { dato: 'yo.moral', op: '<', valor: 40 } }] }, {}), 'todos / no / dato');
}

console.log('Escolta');
{
  // Bug de noviembre: con 5 o 6 pilotos llenaban la zona de extraccion y el transporte no podia entrar.
  let trabadas = 0;
  for (let n = 0; n < 60; n++) {
    const az = crearAzar(7000 + n);
    const k = 5 + (n % 2);
    const esc = Array.from({ length: k }, (_, i) => crearRecluta(datos, az, 'p' + i)).map((p) => ({ piloto: p, mecha: p.mecha, gambits: p.gambits }));
    const m = armarMision(datos, 'escolta', 1, az);
    const r = simular(datos, { mision: m, escuadron: esc, semilla: m.semilla });
    if (r.motivo === 'tiempo_agotado') trabadas++;
  }
  ok(trabadas === 0, 'con escuadrones grandes, el transporte siempre puede entrar a la zona (' + trabadas + ' trabadas de 60)');
}

console.log('Campana');
{
  const a = nuevaPartida(datos, 321), b = nuevaPartida(datos, 321);
  ok(JSON.stringify(a) === JSON.stringify(b), 'misma semilla, misma partida');
  ok(a.pilotos.length === datos.reglas.reclutas_iniciales && a.pilotos.every((p) => p.vinculo), 'arranca con reclutas vinculados de a pares');
  const p = nuevaPartida(datos, 99);
  const i = nodosSiguientes(datos, p).findIndex((n) => n.tipo === 'mision');
  elegirNodo(datos, p, i);
  ok(p.estado === 'preparacion', 'elegir una mision lleva a la preparacion');
  const r = simular(datos, { mision: p.nodo.mision, escuadron: escuadronParaMision(datos, p), semilla: p.nodo.mision.semilla });
  const inf = cerrarMision(datos, p, r);
  ok(inf.pilotos.length === 4 && p.sectores[0].saltos === 1 && p.estado !== 'preparacion', 'el informe cubre al escuadron y la nave sigue en el sector');
  ok(p.caidos.length === inf.caidos.length && p.pilotos.length + p.caidos.length === 4, 'los muertos pasan al memorial');
  ok(JSON.parse(JSON.stringify(p)).semilla === 99, 'la partida se puede guardar');
}

// Brujula: de 1 a 6 destinos alrededor de la nave, a 1-3 de combustible; al saltar aparecen otros y el de antes queda gris
{
  const p = nuevaPartida(datos, 77);
  const d0 = destinosDeLaNave(datos, p);
  ok(d0.length >= 1 && d0.length <= 6 && d0.every((d) => d.costo >= 0 && d.costo <= 3), 'la brujula muestra de 1 a 6 destinos a 1-3 de combustible (' + d0.length + ')');
  ok(d0.some((d) => d.nodo.tipo === 'jefe' && d.bloqueado), 'la guarida del jefe se ve, cerrada hasta tener datos');
  const s = p.sectores[0];
  const contrato = s.nodos.find((n) => n.tipo === 'mision' && n.mision.cliente);
  ok(!!contrato && s.bandos.includes(contrato.mision.cliente) && contrato.mision.objetivo !== contrato.mision.cliente, 'cada contrato es de un bando contra otro (o contra una amenaza)');
  const desde = s.actual;
  const libre = d0.findIndex((d) => !d.bloqueado && d.nodo.tipo !== 'mision');
  elegirNodo(datos, p, Math.max(0, libre));
  seguir(datos, p);
  const d1 = destinosDeLaNave(datos, p);
  ok(s.actual !== desde && d1.some((d) => d.nodo.visitado), 'despues de saltar, lo visitado queda en la brujula (gris)');
  // reputacion y frente
  const q = nuevaPartida(datos, 78);
  const sq = q.sectores[0];
  const k = destinosDeLaNave(datos, q).filter((d) => !d.bloqueado).findIndex((d) => d.nodo.tipo === 'mision' && sq.bandos.includes(d.nodo.mision.objetivo));
  if (k >= 0) {
    elegirNodo(datos, q, k);
    const m = q.nodo.mision;
    const antes = sq.frente[m.cliente];
    const inf = cerrarMision(datos, q, { victoria: true, motivo: 'objetivo', registro: [], resumen: { pilotos: {}, bajasEnemigas: 0 } });
    ok(q.reputacion[m.cliente] > 0 && q.reputacion[m.objetivo] < 0 && sq.frente[m.cliente] > antes && inf.bandos.cambios.length === 2, 'ganar un contrato sube con el cliente, baja con el rival y corre el frente');
  }
}

// Control: el despliegue a mano, el rumbo y las ordenes por radio
{
  const az = crearAzar(4242);
  const esc = ['vanguardia', 'tirador', 'medico', 'infiltrador'].map((c, i) => crearRecluta(datos, az, 'p' + i, c)).map((p) => ({ piloto: p, mecha: p.mecha, gambits: p.gambits }));
  const m = armarMision(datos, 'asalto', 2, crearAzar(11), 2);
  const libre = simular(datos, { mision: m, escuadron: esc, semilla: m.semilla });
  const conPlan = esc.map((e, i) => (i === 0 ? { ...e, casilla: [1, 8], rumbo: { x: 9, y: 8 } } : i === 1 ? { ...e, rumbo: { espera: true } } : e));
  const r = simular(datos, { mision: m, escuadron: conPlan, semilla: m.semilla });
  const ap = r.registro.filter((e) => e.tipo === 'aparece' && e.ficha.bando === 0);
  ok(Math.abs(ap[0].ficha.x - 1) <= 1 && Math.abs(ap[0].ficha.y - 8) <= 1, 'despliegue: el mecha arranca donde lo puso Control');
  const quieto = r.registro.find((e) => e.tipo === 'mueve' && e.u === ap[1].u);
  const libreQuieto = libre.registro.find((e) => e.tipo === 'mueve' && e.u === ap[1].u);
  ok(!quieto || !libreQuieto || quieto.t > libreQuieto.t, 'despliegue: el que aguanta no se mueve hasta que hay pelea');
  const T = 30;
  const conOrden = simular(datos, { mision: m, escuadron: esc, semilla: m.semilla, control: [{ t: T, id: 'replieguen' }, { t: T + 5, id: 'carga' }] });
  const antes = (reg) => JSON.stringify(reg.filter((e) => e.t < T));
  ok(antes(conOrden.registro) === antes(libre.registro), 'orden por radio: lo que paso antes de la orden no cambia');
  ok(conOrden.registro.filter((e) => e.tipo === 'control').length === 1 && conOrden.huella !== libre.huella, 'orden por radio: cambia la batalla, y la radio tiene recarga');
}

// Legado: el veterano pasa a la campana siguiente y el escuadron perdido aparece como enemigo
{
  const vieja = nuevaPartida(datos, 55);
  const fotos = vieja.pilotos.map(fotoPiloto);
  const legado = { resultado: 'derrota', sectorNombre: 'Chatarrería Sur', veterano: { ...fotos[0], nivel: 4, comoLlego: 'sobrevivio' }, escuadron: fotos.slice(1) };
  const p = nuevaPartida(datos, 56, legado);
  ok(p.pilotos.length === datos.reglas.reclutas_iniciales + 1 && p.pilotos.some((x) => x.veterano && x.nivel === 4), 'el veterano entra a la campana nueva');
  p.sector = datos.reglas.legado.sector_encuentro;
  generarSector(datos, p);
  const nodo = p.sectores[p.sector].nodos.find((n) => n.encuentro);
  ok(!!nodo && nodo.mision.rivales.length === 2, 'el escuadron anterior aparece en un contrato');
  ok(p.nemesis && p.nemesis.length === 1 && p.nemesis[0].origen === 'caido' && p.nemesis[0].apodo === fotos[1].apodo, 'el de mas nivel del escuadron perdido vuelve como nemesis');
  const r = simular(datos, { mision: nodo.mision, escuadron: escuadronParaMision(datos, p), semilla: nodo.mision.semilla });
  ok(r.registro.some((e) => e.tipo === 'aparece' && e.ficha.exPiloto && e.ficha.bando === 1), 'pelean del otro lado');
}

// Nemesis: aparece en un contrato, va a buscar a su objetivo, y si escapa vuelve preparado contra lo que lo bajo
{
  const p = nuevaPartida(datos, 91);
  const objetivo = p.pilotos[0];
  const az = crearAzar(3);
  p.nemesis = [];
  const n = nemesisDelLegado(datos, p, { ...fotoPiloto(p.pilotos[1]), apodo: 'Prueba', id: 'x9' }, 'acá', objetivo, az);
  n.ultima = -10;
  const m = armarMision(datos, 'asalto', 2, crearAzar(4), 2);
  const dn = { ...datos, nemesis: { ...datos.nemesis, chance_aparece: 100 } }; // (solo para la prueba)
  quizasAparece(dn, p, m, p.pilotos, crearAzar(5), n.id);
  ok(m.nemesis === n.id && m.rivales.some((r) => r.nemesis && r.odia === objetivo.id), 'el nemesis aparece en el contrato y busca a su objetivo');
  const r = simular(datos, { mision: m, escuadron: p.pilotos.map((x) => ({ piloto: x, mecha: x.mecha, gambits: x.gambits })), semilla: m.semilla });
  ok(r.registro.some((e) => e.tipo === 'aparece' && e.ficha.ref === 'ex:' + n.id), 'el nemesis pelea en la batalla');
  // lo bajan a riel desde lejos y escapa: vuelve con escudo y propulsores
  const uid = 'u99';
  const reg = [{ tipo: 'aparece', u: uid, ficha: { ref: 'ex:' + n.id, bando: 1, cuerpo: 'mecha' } }, { tipo: 'aparece', u: 'u1', ficha: { ref: objetivo.id, bando: 0, cuerpo: 'mecha' } },
    { tipo: 'dispara', u: 'u1', o: uid, arma: 'riel', acierta: true, danio: 90 }, { tipo: 'muere', u: uid, por: 'u1' }];
  const out = resolverNemesis(dn, p, { registro: reg }, m, crearAzar(6));
  ok(!out.muerto && n.estado === 'activo' && n.clase === 'infiltrador' && normalizarPieza(n.mecha.brazo_izq).parte === 'brazo_escudo', 'escapa y vuelve preparado contra el riel');
  // a la tercera derrota (o con un tiro a la cabina) cae para siempre
  n.derrotas = dn.nemesis.derrotas_para_caer - 1;
  ok(resolverNemesis(dn, p, { registro: reg }, m, crearAzar(7)).muerto && n.estado === 'muerto', 'a la tercera cae para siempre');
}

// Campana infinita: despues del tercer sector vuelve el primero (mas dificil) y el jefe es el nemesis mas curtido
{
  const p = nuevaPartida(datos, 92);
  p.nemesis = [];
  const n = nemesisDelLegado(datos, p, { ...fotoPiloto(p.pilotos[1]), apodo: 'Jefazo', id: 'x8' }, 'acá', p.pilotos[0], crearAzar(2));
  p.sector = 3; generarSector(datos, p);
  const s = p.sectores[3];
  const jefe = s.nodos.find((n) => n.tipo === 'jefe').mision;
  ok(s.nombre.endsWith(' II') && s.nivel > datos.sectores.campana_base.nivel_enemigo_por_sector.at(-1), 'el sector 4 repite el primer territorio, mas dificil');
  ok(s.jefeNemesis === n.id && jefe.nemesisJefe && jefe.rivales.some((r) => r.nemesis && r.lider && r.cae), 'el nemesis se queda con el sector y es el jefe (y si cae, cae)');
  const r = simular(datos, { mision: jefe, escuadron: p.pilotos.map((x) => ({ piloto: x, mecha: x.mecha, gambits: x.gambits })), semilla: jefe.semilla });
  ok(r.registro.some((e) => e.tipo === 'aparece' && e.ficha.ref === 'ex:' + n.id), 'el jefe nemesis pelea');
}

// Daño por partes: un brazo roto no vuelve a disparar; un tiro a la cabina deja el mecha para saquear
{
  let rotos = 0, dispararonRotos = 0, limpios = 0, piezas = 0;
  for (let s = 1; s <= 30; s++) {
    const az = crearAzar(s * 7);
    const esc = ['vanguardia', 'tirador', 'medico', 'infiltrador'].map((c, i) => crearRecluta(datos, az, 'p' + i, c));
    esc[1].gambits = [{ condicion: 'enemigo_a_rango', accion: 'disparar_cabina', objetivo: 'enemigo_mas_peligroso' }, ...esc[1].gambits];
    const m = armarMision(datos, s % 2 ? 'asalto' : 'duelo', 2, crearAzar(s), 3);
    const r = simular(datos, { mision: m, escuadron: esc.map((p) => ({ piloto: p, mecha: p.mecha, gambits: p.gambits })), semilla: m.semilla });
    const roto = new Map();
    for (const e of r.registro) {
      if (e.tipo === 'parte_rota') { rotos++; roto.set(e.u + e.zona, e.t); }
      if (e.tipo === 'dispara' && roto.has(e.u + e.slot) && e.t > roto.get(e.u + e.slot)) dispararonRotos++;
      if (e.tipo === 'muere' && e.limpio) limpios++;
    }
    if (r.victoria) piezas += saquear(datos, r.registro, m, crearAzar(s)).piezas.length;
  }
  ok(rotos > 0 && dispararonRotos === 0, 'un brazo roto deja de disparar (' + rotos + ' partes rotas)');
  ok(limpios > 0 && piezas > 0, 'tiro a la cabina: mechas enteros para saquear (' + piezas + ' piezas)');
}

// Mantenimiento: el daño queda, se paga para arreglarlo y el mecha sale como quedo
{
  const p = nuevaPartida(datos, 91);
  const pi = p.pilotos[0];
  pi.mechaVida = 50;
  pi.mecha.brazo_der = { ...pi.mecha.brazo_der, rota: true };
  const esc = escuadronParaMision(datos, p);
  const r = simular(datos, { mision: armarMision(datos, 'defensa', 1, crearAzar(3)), escuadron: esc, semilla: 3 });
  const ap = r.registro.find((e) => e.tipo === 'aparece' && e.ficha.ref === pi.id);
  ok(ap.ficha.vida < ap.ficha.vidaMax && r.registro.some((e) => e.tipo === 'parte_rota' && e.u === ap.u && e.inicial), 'el mecha sale dañado y con el brazo roto');
  const c = costoReparacion(datos, pi);
  const antes = p.creditos;
  ok(reparar(datos, p, pi.id, 'todo') && p.creditos === antes - c.total && !partesRotas(pi).length && pi.mechaVida === 100, 'reparar todo cobra y deja el mecha sano');
}

// Dilemas, combustible y cronica
{
  const p = nuevaPartida(datos, 123);
  const comb = p.combustible;
  const costo = destinosDeLaNave(datos, p).filter((d) => !d.bloqueado)[0].costo;
  elegirNodo(datos, p, 0);
  ok(p.combustible === comb - costo, 'cada salto gasta el combustible de la distancia');
  p.nodo = { tipo: 'evento', dilema: 'chatarrero', resultado: null };
  const r = elegirOpcion(datos, p, 2);
  ok(r && r.cambios.some((c) => c.icono === 'combustible') && p.combustible > comb - 1, 'una opcion del dilema da combustible');
  p.combustible = 0;
  const cred = p.creditos;
  p.nodo = null; seguir(datos, p);
  elegirNodo(datos, p, 0);
  ok(p.remolque && p.creditos < cred && p.pilotos.every((x) => x.mechaVida < 100), 'sin combustible, remolque: cobra y daña los mechas');
  p.resultado = 'derrota';
  const h = relato(datos, p);
  ok(h.capitulos.length && h.cierre.includes('Ahí se terminó'), 'la cronica cuenta la historia del escuadron');
}

// Escolta: el transporte no se queda trabado y nadie baila en el lugar (torretas quietas)
{
  let peorQuieto = 0, torretaMovida = 0, bailes = 0;
  for (let n = 0; n < 40; n++) {
    const az = crearAzar(9000 + n);
    const esc = Array.from({ length: 4 }, (_, i) => crearRecluta(datos, az, 'p' + i)).map((p) => ({ piloto: p, mecha: p.mecha, gambits: p.gambits }));
    const m = armarMision(datos, 'escolta', 1 + (n % 3), az, 2 + (n % 3));
    const r = simular(datos, { mision: m, escuadron: esc, semilla: m.semilla });
    const f = {}; let tr = null, ultimo = 0; const hist = {};
    for (const e of r.registro) {
      if (e.tipo === 'aparece') { f[e.u] = e.ficha; if (e.ficha.sprite === 'transporte') tr = e.u; }
      if (e.tipo !== 'mueve') continue;
      if (f[e.u].sprite === 'torreta') torretaMovida++;
      if (e.u === tr) { peorQuieto = Math.max(peorQuieto, e.t - ultimo); ultimo = e.t; }
      if (f[e.u].bando === 0) (hist[e.u] ||= []).push(e.a.join(','));
    }
    for (const h of Object.values(hist)) { let k = 0; for (let i = 2; i < h.length; i++) if (h[i] === h[i - 2] && h[i] !== h[i - 1]) k++; if (k > 20) bailes++; }
  }
  ok(peorQuieto <= 120, 'escolta: el transporte nunca queda parado mucho (' + peorQuieto + ' ticks)');
  ok(torretaMovida === 0 && bailes === 0, 'escolta: las torretas no caminan y nadie baila en el lugar');
}

console.log(fallas ? '\n' + fallas + ' falla(s)' : '\nTodo bien');
process.exit(fallas ? 1 : 0);
