// Saqueo quirurgico: lo que se rescata de los mechas enemigos depende de como cayeron.
//  - Cayo por un tiro a la cabina ("limpio"): se rescata entera una de sus partes de brazo que no se haya roto.
//  - Cayo de cualquier otra forma: queda chatarra, que se vende por unos creditos.
// Solo cuenta si se gano la mision (si no, nadie se queda a juntar nada).

import { normalizarPieza } from '../motor/unidades.js';

export function saquear(datos, registro, mision, azar) {
  const P = datos.reglas.partes_mecha;
  const fichas = new Map(), rotas = new Map();
  const res = { piezas: [], chatarra: 0, limpios: 0 };
  for (const e of registro) {
    if (e.tipo === 'aparece') fichas.set(e.u, e.ficha);
    if (e.tipo === 'parte_rota') rotas.set(e.u, (rotas.get(e.u) || []).concat(e.zona));
    if (e.tipo !== 'muere') continue;
    const f = fichas.get(e.u);
    if (!f || f.bando !== 1 || f.cuerpo !== 'mecha' || f.tipo === 'invocacion') continue;
    const partes = partesDe(datos, f, mision);
    if (!partes) continue;
    if (!e.limpio) { res.chatarra += P.chatarra_creditos; continue; }
    res.limpios++;
    const sanas = ['brazo_izq', 'brazo_der'].filter((z) => partes[z] && !(rotas.get(e.u) || []).includes(z))
      .map((z) => normalizarPieza(partes[z])).filter((pz) => pz && datos.partes[pz.parte]);
    if (!sanas.length) { res.chatarra += P.chatarra_creditos; continue; }
    const pieza = sanas[azar.entero(0, sanas.length - 1)];
    res.piezas.push({ pieza: { parte: pieza.parte, afijos: (pieza.afijos || []).slice() }, de: f.nombre });
  }
  return res;
}

// Las partes de un mecha enemigo: las de enemigos.json, o las del escuadron anterior (legado)
function partesDe(datos, f, mision) {
  if (typeof f.ref === 'string' && f.ref.startsWith('ex:')) {
    const r = (mision.rivales || []).find((x) => 'ex:' + x.piloto.id === f.ref);
    return r ? r.mecha : null;
  }
  const def = datos.enemigos.unidades[f.ref];
  return def && def.partes ? def.partes : null;
}
