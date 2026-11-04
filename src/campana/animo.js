// Afinidad entre pilotos y animo con el que llegan a cada mision.
//
// Afinidad: un numero por par de pilotos (-100 a 100). Arranca segun las personalidades y cambia con lo que viven
// juntos (salvarse, cubrirse, huir dejando al otro, discutir, ganar o perder juntos). Ver data/afinidad.json.
//
// Animo: antes de cada mision se decide como viene cada uno. Confiado si viene ganando, nervioso si arrastra un
// trauma, atento si tiene oficio, desorientado si la mision es de buscar un punto. Y con quien se lleva bien o mal.
// Todo eso se ve en el briefing y el motor lo aplica como estados (ver data/estados.json).

export const claveAf = (a, b) => (a < b ? a + '|' + b : b + '|' + a);

export function afinidad(p, a, b) {
  return (p.afinidad && p.afinidad[claveAf(a, b)]) || 0;
}

function sumarAf(p, a, b, delta) {
  if (a === b) return;
  p.afinidad = p.afinidad || {};
  const k = claveAf(a, b);
  p.afinidad[k] = Math.max(-100, Math.min(100, (p.afinidad[k] || 0) + delta));
}

// Afinidad inicial de un piloto con todos los demas
export function presentar(datos, p, nuevo, azar) {
  const A = datos.afinidad;
  for (const o of p.pilotos) {
    if (o.id === nuevo.id || p.afinidad && p.afinidad[claveAf(o.id, nuevo.id)] !== undefined) continue;
    const par = [nuevo.personalidad, o.personalidad].sort().join('|');
    let v = (A.base[par] || 0) + azar.entero(-A.azar, A.azar);
    if (nuevo.vinculo === o.id) v += A.cambios.vinculo;
    sumarAf(p, nuevo.id, o.id, v);
  }
}

export function relaciones(datos, p, piloto) {
  const U = datos.afinidad.umbrales;
  const amigos = [], rivales = [];
  for (const o of p.pilotos) {
    if (o.id === piloto.id) continue;
    const v = afinidad(p, piloto.id, o.id);
    if (v >= U.amigos) amigos.push({ piloto: o, valor: v });
    else if (v <= U.rivales) rivales.push({ piloto: o, valor: v });
  }
  return { amigos, rivales };
}

// Como llega cada piloto a la mision. Devuelve { porPiloto: { id: { estados, rival, amigo } }, notas: [...] }
export function calcularAnimo(datos, p, mision, pilotos, azar) {
  const R = datos.reglas.animo;
  const U = datos.afinidad.umbrales;
  const porPiloto = {};
  const notas = [];
  const buscaPunto = !!(mision.zonaMeta || mision.niebla);
  let hayConfiado = false; // uno solo por mision: el que mas se la cree
  for (const pi of pilotos) {
    const est = [];
    const racha = pi.racha || 0;
    if (!hayConfiado && racha >= R.racha_confiado && pi.personalidad !== 'cobarde' &&
      azar.tirada(R.chance_confiado + (racha - R.racha_confiado) * 10 + (pi.personalidad === 'temerario' ? 20 : 0))) {
      est.push('confiado');
      hayConfiado = true;
      notas.push({ id: pi.id, tipo: 'confiado', texto: pi.apodo + ' viene confiado: ' + racha + ' misiones ganadas al hilo. Puede mandarse solo.' });
    }
    if ((pi.traumas.length && azar.tirada(R.chance_nervioso_trauma)) || (pi.personalidad === 'cobarde' && azar.tirada(R.chance_nervioso_cobarde))) {
      est.push('nervioso');
      notas.push({ id: pi.id, tipo: 'nervioso', texto: pi.apodo + ' está nervioso' + (pi.traumas.length ? ' (arrastra un trauma)' : '') + '. Puede entender mal las órdenes.' });
    }
    if (!est.length && (pi.medallas.length || pi.nivel >= 3) && azar.tirada(R.chance_atento)) {
      est.push('atento');
      notas.push({ id: pi.id, tipo: 'atento', texto: pi.apodo + ' está atento: mejor puntería y reflejos.' });
    }
    if (buscaPunto) {
      const optica = pi.mecha && pi.mecha.cabeza && (pi.mecha.cabeza.parte || pi.mecha.cabeza) === 'cabeza_optica';
      const chance = Math.max(4, R.chance_perdido - 3 * (pi.nivel - 1)) >> (optica ? 1 : 0);
      if (azar.tirada(chance)) {
        est.push('perdido');
        notas.push({ id: pi.id, tipo: 'perdido', texto: pi.apodo + ' no tiene claras las coordenadas. Puede tardar en encontrar el objetivo.' });
      }
    }
    porPiloto[pi.id] = { estados: est, rival: null, amigo: null };
  }
  // Con quien se lleva peor y mejor (entre los que van)
  for (const pi of pilotos) {
    let peor = null, mejor = null;
    for (const o of pilotos) {
      if (o.id === pi.id) continue;
      const v = afinidad(p, pi.id, o.id);
      if (v <= U.rivales && (!peor || v < peor.v)) peor = { o, v };
      if (v >= U.amigos && (!mejor || v > mejor.v)) mejor = { o, v };
    }
    if (peor) porPiloto[pi.id].rival = peor.o.id;
    if (mejor) porPiloto[pi.id].amigo = mejor.o.id;
  }
  const anotados = new Set();
  for (const pi of pilotos) {
    const r = porPiloto[pi.id].rival;
    if (r && !anotados.has(claveAf(pi.id, r))) {
      anotados.add(claveAf(pi.id, r));
      notas.push({ id: pi.id, tipo: 'rivales', texto: pi.apodo + ' y ' + pilotos.find((x) => x.id === r).apodo + ' no se soportan. Juntos se distraen discutiendo.' });
    }
    const a = porPiloto[pi.id].amigo;
    if (a && !anotados.has('+' + claveAf(pi.id, a))) {
      anotados.add('+' + claveAf(pi.id, a));
      notas.push({ id: pi.id, tipo: 'amigos', texto: pi.apodo + ' y ' + pilotos.find((x) => x.id === a).apodo + ' se cubren las espaldas: cerca, apuntan mejor.' });
    }
  }
  return { porPiloto, notas };
}

// Despues de la mision: la afinidad cambia segun lo que vivieron juntos. Devuelve los cambios para el informe.
export function actualizarAfinidad(datos, p, registro, desplegados, victoria) {
  const C = datos.afinidad.cambios;
  const ref = new Map();
  for (const e of registro) if (e.tipo === 'aparece' && e.ficha.bando === 0 && e.ficha.tipo === 'piloto') ref.set(e.u, e.ficha.ref);
  const cambios = new Map();
  const sumar = (a, b, d, motivo) => {
    if (!a || !b || a === b) return;
    const k = claveAf(a, b);
    const c = cambios.get(k) || { a, b, delta: 0, motivos: [] };
    if (c.motivos.includes(motivo)) return; // cada cosa cuenta una vez por mision
    sumarAf(p, a, b, d);
    c.delta += d;
    c.motivos.push(motivo);
    cambios.set(k, c);
  };
  const vida = new Map(), vidaMax = new Map();
  for (const e of registro) {
    if (e.tipo === 'aparece') { vida.set(e.u, e.ficha.vidaMax); vidaMax.set(e.u, e.ficha.vidaMax); }
    if (e.tipo === 'dispara' && e.acierta) vida.set(e.o, vida.get(e.o) - e.danio);
    if (e.tipo === 'repara') {
      if (e.vida - e.cant < vidaMax.get(e.o) * 0.25) sumar(ref.get(e.u), ref.get(e.o), C.salvo, 'salvo');
      vida.set(e.o, e.vida);
    }
    if (e.tipo === 'anula' && e.motivo === 'corre_a_cubrir') {
      const pi = p.pilotos.find((x) => x.id === ref.get(e.u));
      if (pi && pi.vinculo) sumar(pi.id, pi.vinculo, C.cubrio, 'cubrio');
    }
    if (e.tipo === 'anula' && e.motivo === 'huye_en_panico') {
      for (const d of desplegados) sumar(ref.get(e.u), d.id, C.huyo, 'huyo');
    }
    if (e.tipo === 'discute') sumar(ref.get(e.u), ref.get(e.con), C.discusion, 'discusion');
  }
  for (let i = 0; i < desplegados.length; i++) {
    for (let j = i + 1; j < desplegados.length; j++) {
      sumar(desplegados[i].id, desplegados[j].id, victoria ? C.victoria_juntos : C.derrota_juntos, victoria ? 'victoria' : 'derrota');
    }
  }
  return [...cambios.values()].filter((c) => c.motivos.some((m) => m !== 'victoria' && m !== 'derrota'));
}
