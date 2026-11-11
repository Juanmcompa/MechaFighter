// Juega campanas enteras con un piloto automatico (va a la guarida si puede, si no al contrato mas cerca; para en
// las paradas cuando le falta combustible; contrata si puede, compra lo primero que le alcanza) para ver que tan dificil es la campana completa.
//   node tools/campana.mjs [cantidad] [legado]   (con 'legado', cada campana arranca con lo que dejo la anterior)
// Por defecto juega "pensando" (tools/jugador.mjs): rota el escuadron, elige formacion de despliegue y ordenes por
// radio comparando en batallas parecidas. Es lento (~10 s por campaña). Variables:
//   JUGADOR=tonto   el piloto de antes: sale siempre igual, sin plan ni ordenes (rapido; sirve para comparar)
//   MUESTRAS=2      en cuantas batallas parecidas prueba cada idea (1 por defecto; mas = elige mejor, mas lento)
import { cargarDatos } from '../src/core/datos.js';
import { simular } from '../src/motor/simular.js';
import { nuevaPartida, destinosDeLaNave, elegirNodo, seguir, comprar, contratar, escuadronParaMision, cerrarMision, equipar, reparar, costoReparacion, elegirOpcion, comprarCombustible, paradaActual, instalarMejora, mejoraDe } from '../src/campana/partida.js';
import { opcionDisponible } from '../src/campana/dilemas.js';
import { limitePilotos } from '../src/campana/brujula.js';
import { leerDisco } from './leer-disco.mjs';
import { rotar, pensar } from './jugador.mjs';

const PIENSA = process.env.JUGADOR !== 'tonto';
const MUESTRAS = Number(process.env.MUESTRAS || 1);
const J = { formacion: {}, radio: {}, misiones: 0, conPlan: 0, sinPlan: 0, banco: 0, desertores: 0 };

const datos = await cargarDatos(leerDisco());
const N = Number(process.argv[2] || 20);
let pasaron = 0, maxSector = 0, jefesNemesis = 0;
let ganadas = 0, misiones = 0, ganadasM = 0, caidos = 0, sectorMax = 0, puntaje = 0;
const t0 = Date.now();
const conLegado = process.argv[3] === 'legado';
let remolques = 0, combFinal = 0, mejoras = 0, saltos = 0, emboscadas = 0;
let legado = null, encuentros = 0, encuentrosGanados = 0, rescates = 0, veteranos = 0;
for (let n = 0; n < N; n++) {
  const p = nuevaPartida(datos, 5000 + n, conLegado ? legado : null);
  if (legado && legado.veterano) veteranos++;
  let vueltas = 0, esperar = 0;
  while (p.estado !== 'fin' && vueltas++ < 600) {
    const lista = destinosDeLaNave(datos, p).filter((d) => !d.bloqueado);
    const nuevos = lista.filter((d) => !d.nodo.visitado).sort((a, b) => a.costo - b.costo);
    // la guarida si se abrio; una parada si falta combustible; reclutas si faltan pilotos; si no, el contrato mas cerca
    let d = esperar > 0 ? null : lista.find((x) => x.nodo.tipo === 'jefe');
    if (!d && p.combustible < 5 && p.creditos >= 60) d = lista.filter((x) => x.nodo.tipo === 'parada').sort((a, b) => a.costo - b.costo)[0];
    if (!d && p.pilotos.length < Math.min(limitePilotos(datos, p), datos.reglas.escuadra_maxima + 2) && p.creditos >= 90) d = nuevos.find((x) => x.nodo.tipo === 'reclutamiento');
    if (!d) d = nuevos.find((x) => x.nodo.tipo === 'mision') || nuevos[0] || lista[0];
    if (!d) break;
    if (PIENSA && (d.nodo.tipo === 'mision' || d.nodo.tipo === 'jefe')) J.banco += rotar(datos, p);
    elegirNodo(datos, p, d.nodo);
    if (p.estado === 'suceso') {
      const ops = datos.dilemas[p.suceso.dilema].opciones;
      // el piloto automatico es prudente: la ultima opcion (casi siempre "seguir")
      let k = ops.length - 1; while (k > 0 && !opcionDisponible(datos, p, ops[k]).ok) k--;
      elegirOpcion(datos, p, k); seguir(datos, p);
    }
    if (p.estado === 'preparacion') {
      let r;
      if (PIENSA) {
        const idea = pensar(datos, p, MUESTRAS);
        const plan = p.nodo.plan;
        // (para medir: la misma batalla sin pensar, con las entradas de siempre y sin ordenes)
        p.nodo.plan = idea.sinPensar;
        const tonta = simular(datos, { mision: idea.mision, escuadron: escuadronParaMision(datos, p), semilla: idea.mision.semilla });
        p.nodo.plan = plan;
        r = simular(datos, { mision: idea.mision, escuadron: escuadronParaMision(datos, p), semilla: idea.mision.semilla, control: idea.control });
        J.misiones++; J.conPlan += r.victoria ? 1 : 0; J.sinPlan += tonta.victoria ? 1 : 0;
        if (r.victoria && !tonta.victoria) J.salvadas = (J.salvadas || 0) + 1; if (!r.victoria && tonta.victoria) J.arruinadas = (J.arruinadas || 0) + 1;
        J.formacion[idea.formacion] = (J.formacion[idea.formacion] || 0) + 1; J.radio[idea.radio] = (J.radio[idea.radio] || 0) + 1;
      } else r = simular(datos, { mision: p.nodo.mision, escuadron: escuadronParaMision(datos, p), semilla: p.nodo.mision.semilla });
      misiones++; if (r.victoria) ganadasM++;
      { const m = p.nodo.mision; const k2 = p.sector + ":" + (m.objetivo || "-") + ":" + m.plantilla + (m.condiciones && m.condiciones.some((c) => c.startsWith("irrumpe")) ? "+i" : ""); (globalThis.porObj ||= {})[k2] = (globalThis.porObj[k2] || [0, 0]); globalThis.porObj[k2][0] += r.victoria ? 1 : 0; globalThis.porObj[k2][1]++; }
      const k = p.sector + (p.nodo.tipo === "jefe" ? (p.nodo.mision.nemesisJefe ? "N" : "J") : ""); (globalThis.porSector ||= {})[k] = (globalThis.porSector[k] || [0, 0]); globalThis.porSector[k][0] += r.victoria ? 1 : 0; globalThis.porSector[k][1]++;
      const enc = !!p.nodo.mision.rivales;
      if (p.nodo.tipo === 'jefe' && !r.victoria) esperar = 3; else if (esperar) esperar--;
      const inf = cerrarMision(datos, p, r);
      if (enc) { encuentros++; if (r.victoria) encuentrosGanados++; if (inf.rescatado) rescates++; }
    } else {
      if (p.estado === 'parada') {
        while (p.combustible < 8 && comprarCombustible(datos, p));
        for (const id of ['tanque', 'bahia', 'sensor', 'casco']) if (mejoraDe(datos, p, id).puede && p.creditos > 500) instalarMejora(datos, p, id);
        paradaActual(p).oferta.forEach((_, k) => comprar(datos, p, k));
        mejoras += 0;
      }
      if (p.estado === 'evento' && p.nodo.dilema) {
        const ops = datos.dilemas[p.nodo.dilema].opciones;
        elegirOpcion(datos, p, Math.max(0, ops.findIndex((op) => opcionDisponible(datos, p, op).ok)));
      }
      if (p.estado === 'reclutamiento') p.nodo.candidatos.forEach((_, k) => contratar(datos, p, k));
      seguir(datos, p);
    }
    // reparar lo que alcance (primero las partes rotas, despues la estructura)
    if (process.argv[4] !== 'sinreparar') for (const pi of p.pilotos) {
      for (const x of costoReparacion(datos, pi).partes) reparar(datos, p, pi.id, x.slot);
      reparar(datos, p, pi.id, 'estructura');
    }
    // equipar lo mejor del inventario de forma tonta: armas nuevas en brazos vacios
    for (const pi of p.pilotos) for (const slot of ['brazo_izq', 'brazo_der']) {
      if (!pi.mecha[slot]) { const k = p.inventario.findIndex((x) => datos.partes[x.parte].encaje === 'brazo'); if (k >= 0) equipar(datos, p, pi.id, slot, k); }
    }
  }
  if (p.resultado === 'victoria') ganadas++;
  J.desertores += (p.desertores || []).length;
  for (const k of ['sueldos', 'impagos', 'sucesos', 'noticias']) (globalThis.extra ||= {})[k] = ((globalThis.extra || {})[k] || 0) + ((p.stats && p.stats[k]) || 0);
  (globalThis.extra ||= {}).creditos = (globalThis.extra.creditos || 0) + p.creditos;
  remolques += (p.stats && p.stats.remolques) || 0; combFinal += p.combustible || 0;
  mejoras += (p.stats && p.stats.mejoras) || 0; emboscadas += (p.stats && p.stats.emboscadas) || 0; saltos += p.sectores.reduce((t, x) => t + ((x && x.saltos) || 0), 0);
  legado = p.legado || null;
  if (legado && p.resultado === 'victoria' && p.pilotos.length) legado.veterano = { ...p.pilotos[0], comoLlego: 'eligio' };
  caidos += p.caidos.length;
  sectorMax += p.sector + 1;
  if (p.sector >= 3) pasaron++;
  maxSector = Math.max(maxSector, p.sector + 1);
  jefesNemesis += (p.sectores || []).filter((x) => x && x.jefeNemesis).length;
  puntaje += p.puntaje;
}
console.log(`pasan el sector 3: ${Math.round((pasaron * 100) / N)}% · mejor sector ${maxSector} · jefes nemesis/campana ${(jefesNemesis / N).toFixed(1)} · misiones ganadas ${Math.round((ganadasM * 100) / misiones)}% · ` +
  `caidos/campana ${(caidos / N).toFixed(1)} · sector alcanzado ${(sectorMax / N).toFixed(1)} · puntaje ${Math.round(puntaje / N)} · ${Math.round((Date.now() - t0) / N)} ms`);
console.log(Object.entries(globalThis.porSector).map(([k,[g,t]])=>k+": "+Math.round(g*100/t)+"% de "+t).join(" · "))
console.log(`remolques por campana ${(remolques / N).toFixed(1)} · combustible al final ${(combFinal / N).toFixed(1)} · saltos ${(saltos / N).toFixed(0)} · mejoras ${(mejoras / N).toFixed(1)} · emboscadas ${(emboscadas / N).toFixed(1)}`);
console.log('por campana: ' + Object.entries(globalThis.extra).map(([k, v]) => k + ' ' + (v / N).toFixed(1)).join(' · '));
if (PIENSA && J.misiones) {
  const pct = (n) => Math.round((n * 100) / J.misiones) + '%';
  const tabla = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + pct(v)).join(' · ');
  console.log(`\nPENSAR EL DESPLIEGUE: gana ${pct(J.conPlan)} de las misiones; las mismas batallas sin pensar, ${pct(J.sinPlan)}`);
  console.log(`de ${J.misiones} misiones: ${J.salvadas || 0} se ganaron gracias al plan (sin pensar se perdían) y ${J.arruinadas || 0} se perdieron por el plan`);
  console.log('formación elegida: ' + tabla(J.formacion));
  console.log('órdenes por radio: ' + tabla(J.radio));
  console.log(`banco: ${(J.banco / N).toFixed(1)} turnos de banco por campaña · desertores ${(J.desertores / N).toFixed(1)} por campaña`);
}
if (conLegado) console.log(`legado: ${veteranos} veteranos · ${encuentros} encuentros con el escuadron anterior (${encuentrosGanados} ganados, ${rescates} rescates)`);
// DETALLE=1: como le fue contra cada bando y tipo de mision, por sector
if (process.env.DETALLE) console.log(Object.entries(globalThis.porObj).sort().map(([k,[g,t]])=>k+" "+Math.round(g*100/t)+"%/"+t).join("\n"));
