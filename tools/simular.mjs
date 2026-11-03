// Corre batallas por consola, para ver el balance sin abrir el juego.
//   node tools/simular.mjs [mision] [dificultad] [cantidad]
//   node tools/simular.mjs defensa 1 50
import { cargarDatos } from '../src/core/datos.js';
import { crearAzar } from '../src/core/azar.js';
import { simular } from '../src/motor/simular.js';
import { armarMision } from '../src/campana/misiones.js';
import { crearRecluta } from '../src/campana/reclutas.js';
import { leerDisco } from './leer-disco.mjs';

const [plantilla = 'todas', dificultad = '1', cantidad = '20'] = process.argv.slice(2);
const datos = await cargarDatos(leerDisco());
const misiones = plantilla === 'todas' ? Object.keys(datos.misiones) : [plantilla];
const clasesIniciales = ['vanguardia', 'tirador', 'medico', 'infiltrador'];

for (const mid of misiones) {
  let victorias = 0, muertos = 0, ticks = 0, anulaciones = 0;
  const motivos = {};
  const t0 = Date.now();
  for (let n = 0; n < Number(cantidad); n++) {
    const az = crearAzar(1000 + n);
    const escuadron = clasesIniciales.map((c, i) => crearRecluta(datos, az, 'p' + i, c)).map((p) => ({ piloto: p, mecha: p.mecha, gambits: p.gambits }));
    const mision = armarMision(datos, mid, Number(dificultad), az);
    const r = simular(datos, { mision, escuadron, semilla: mision.semilla });
    if (r.victoria) victorias++;
    motivos[r.motivo] = (motivos[r.motivo] || 0) + 1;
    muertos += Object.values(r.resumen.pilotos).filter((p) => !p.viva).length;
    ticks += r.ticks;
    anulaciones += r.registro.filter((e) => e.tipo === 'anula').length;
  }
  const N = Number(cantidad);
  console.log(`${mid.padEnd(9)} dif ${dificultad}: gana ${Math.round((victorias * 100) / N)}% · ` +
    `muertos/mision ${(muertos / N).toFixed(1)} · ${Math.round(ticks / N)} ticks · desobediencias ${(anulaciones / N).toFixed(1)} · ` +
    `${Object.entries(motivos).map(([k, v]) => k + ' ' + v).join(', ')} · ${Math.round((Date.now() - t0) / N)} ms`);
}
