// Arma los numeros de una unidad a partir de los datos: piloto (clase, nivel, cicatrices, medallas) + mecha (partes y
// afijos), o un enemigo de enemigos.json. Lo usa el motor al empezar la batalla y el hangar para mostrar la ficha.
// Funcion pura: lee el catalogo y devuelve un objeto nuevo, nunca modifica el catalogo.

export const ENCAJES = ['cabeza', 'torso', 'piernas', 'brazo_izq', 'brazo_der', 'mochila'];

// Una parte equipada puede venir como "brazo_rifle" o como { parte: "brazo_rifle", afijos: ["calibrado"] }.
export function normalizarPieza(p) {
  if (!p) return null;
  return typeof p === 'string' ? { parte: p, afijos: [] } : { parte: p.parte, afijos: p.afijos || [], ...(p.rota ? { rota: true } : {}) };
}

function sumarMods(destino, mods, mult = 1) {
  for (const [k, v] of Object.entries(mods || {})) if (typeof v === 'number') destino[k] = (destino[k] || 0) + v * mult;
}

function modsDeAfijos(datos, pieza) {
  const m = {};
  for (const a of pieza.afijos) if (datos.afijos[a]) sumarMods(m, datos.afijos[a].mods);
  return m;
}

export function nombrePieza(datos, pieza) {
  const p = normalizarPieza(pieza);
  if (!p) return '';
  const base = datos.partes[p.parte] ? datos.partes[p.parte].nombre : p.parte;
  const pre = p.afijos.map((a) => datos.afijos[a]).filter((a) => a && a.tipo === 'prefijo').map((a) => a.nombre);
  const suf = p.afijos.map((a) => datos.afijos[a]).filter((a) => a && a.tipo === 'sufijo').map((a) => a.nombre);
  return [base, ...pre, ...suf].join(' ') + (p.rota ? ' (rota)' : '');
}

function armaDesde(def, mods, punteriaBase, municionPct, slot, extra = {}) {
  const danio = Math.max(1, def.danio + Math.trunc((def.danio * (mods.danio_pct || 0)) / 100));
  const municionBase = def.municion || 0;
  const municion = municionBase ? municionBase + Math.trunc((municionBase * ((mods.municion_pct || 0) + municionPct)) / 100) : 0;
  return {
    slot,
    danio,
    alcance: def.alcance,
    cadencia: Math.max(1, def.cadencia),
    municionMax: municion,
    municion,
    recarga: (def.recarga || 0) + (mods.recarga || 0),
    punteria: punteriaBase + (def.punteria || 0) + (mods.punteria || 0),
    perfora: def.perfora || 0,
    radio: def.radio || 0,
    suprime: def.suprime || 0,
    estado: def.estado || null,
    chanceEstado: def.chance_estado || 0,
    ignoraCobertura: !!def.ignora_cobertura,
    etiquetas: extra.etiquetas || [],
    tipoVisual: extra.tipoVisual || 'bala',
    espera: 0,
    recargando: 0
  };
}

function tipoVisual(etiquetas) {
  if (etiquetas.includes('fuego')) return 'llama';
  if (etiquetas.includes('explosivo')) return 'misil';
  if (etiquetas.includes('energia')) return 'riel';
  if (etiquetas.includes('cuerpo_a_cuerpo')) return 'tajo';
  if (etiquetas.includes('supresion')) return 'rafaga';
  return 'bala';
}

// Numeros del piloto solo (sin mecha): clase + nivel + cicatrices + medallas.
export function statsPiloto(datos, piloto) {
  const clase = datos.clases[piloto.clase];
  const s = { ...clase.piloto, blindaje: 0, vision: 0 };
  sumarMods(s, clase.por_nivel, (piloto.nivel || 1) - 1);
  for (const c of piloto.cicatrices || []) if (datos.cicatrices[c]) sumarMods(s, datos.cicatrices[c].mods);
  for (const m of piloto.medallas || []) if (datos.medallas[m]) sumarMods(s, datos.medallas[m].mods);
  return s;
}

// Peso total y capacidad del torso (para el hangar y para la penalizacion por sobrepeso).
export function pesoMecha(datos, mecha) {
  let peso = 0, capacidad = 0;
  for (const e of ENCAJES) {
    const pz = normalizarPieza(mecha[e]);
    if (!pz || !datos.partes[pz.parte]) continue;
    const p = datos.partes[pz.parte];
    peso += p.peso + (modsDeAfijos(datos, pz).peso || 0);
    if (e === 'torso') capacidad = p.capacidad;
  }
  return { peso, capacidad };
}

// Unidad de un piloto con su mecha. Devuelve la plantilla (sin posicion).
export function unidadDePiloto(datos, piloto, mecha, gambits) {
  const ps = statsPiloto(datos, piloto);
  const piezas = {};
  for (const e of ENCAJES) piezas[e] = normalizarPieza(mecha[e]) || normalizarPieza(e === 'mochila' ? 'mochila_vacia' : null);
  const parte = (e) => (piezas[e] ? datos.partes[piezas[e].parte] : null);
  const mods = (e) => (piezas[e] ? modsDeAfijos(datos, piezas[e]) : {});

  const torso = parte('torso'), piernas = parte('piernas'), cabeza = parte('cabeza'), mochila = parte('mochila');
  const { peso, capacidad } = pesoMecha(datos, mecha);
  const municionPct = mochila && mochila.municion_pct ? mochila.municion_pct : 0;
  const punteria = ps.punteria + ((cabeza && cabeza.punteria) || 0) + (mods('cabeza').punteria || 0);

  const armas = [];
  let escudo = null;
  let blindaje = ps.blindaje + torso.blindaje + (mods('torso').blindaje || 0) + ((piernas && piernas.blindaje) || 0);
  for (const e of ['brazo_izq', 'brazo_der']) {
    const p = parte(e);
    if (!p) continue;
    if (p.arma) armas.push(armaDesde(p.arma, mods(e), punteria, municionPct, e, { etiquetas: p.etiquetas, tipoVisual: tipoVisual(p.etiquetas) }));
    if (p.escudo) {
      escudo = { bloqueo: p.escudo.bloqueo };
      blindaje += p.escudo.blindaje + (mods(e).blindaje || 0);
    }
  }

  const clase = datos.clases[piloto.clase];
  const habilidades = [...(clase.habilidades_iniciales || [])];
  // Cualquier parte puede traer su habilidad especial (radar, garra, anclas, reactor...): ver partes.json
  for (const e of ENCAJES) { const pp = parte(e); if (pp && pp.habilidad && !habilidades.includes(pp.habilidad)) habilidades.push(pp.habilidad); }
  // Algunas partes traen su habilidad: la rotativa permite suprimir y el escudo, atrincherarse.
  const etiquetasTodas = ENCAJES.flatMap((e) => (parte(e) ? parte(e).etiquetas : []));
  for (const [etq, hab] of [['supresion', 'fuego_de_supresion'], ['escudo', 'muro_de_escudos']]) {
    if (etiquetasTodas.includes(etq) && !habilidades.includes(hab)) habilidades.push(hab);
  }

  const ganchos = [];
  const pers = datos.personalidades[piloto.personalidad];
  if (pers) ganchos.push(...pers.ganchos);
  for (const t of piloto.traumas || []) {
    const tid = typeof t === 'string' ? t : t.id;
    if (datos.traumas[tid]) ganchos.push(...datos.traumas[tid].ganchos);
  }
  for (const e of ENCAJES) if (piezas[e]) for (const a of piezas[e].afijos) if (datos.afijos[a] && datos.afijos[a].ganchos) ganchos.push(...datos.afijos[a].ganchos);

  return {
    tipo: 'piloto',
    ref: piloto.id,
    nombre: piloto.apodo || piloto.nombre,
    clase: piloto.clase,
    personalidad: piloto.personalidad,
    vinculoRef: piloto.vinculo || null,
    cuerpo: 'mecha',
    vidaMax: torso.estructura,
    blindaje,
    velocidad: piernas.velocidad + (peso > capacidad ? 2 : 0),
    vision: (cabeza ? cabeza.vision : 6) + (ps.vision || 0),
    radar: (cabeza && cabeza.radar) || 0,
    punteria,
    evasion: ps.evasion + ((piernas && piernas.evasion) || 0),
    iniciativa: ps.iniciativa,
    moral: ps.moral,
    moralFija: false,
    armas,
    escudo,
    mochila: mochila && mochila.usos ? { id: piezas.mochila.parte, usos: mochila.usos } : null,
    habilidades,
    etiquetasPartes: [...new Set(ENCAJES.flatMap((e) => (parte(e) ? parte(e).etiquetas : [])))],
    // zonas que se pueden romper (ver reglas.partes_mecha): que parte hay y que trae
    slots: Object.fromEntries(['brazo_izq', 'brazo_der', 'piernas', 'cabeza'].filter((e) => parte(e)).map((e) => [e, {
      parte: piezas[e].parte, etiquetas: parte(e).etiquetas, habilidad: parte(e).habilidad || null, rota: !!piezas[e].rota,
      escudoBlindaje: parte(e).escudo ? parte(e).escudo.blindaje + (mods(e).blindaje || 0) : 0,
      punteria: e === 'cabeza' ? (parte(e).punteria || 0) + (mods('cabeza').punteria || 0) : 0
    }])),
    clasesHabilidades: [...(clase.habilidades_iniciales || [])],
    ganchos,
    gambits: gambits && gambits.length ? gambits : clase.gambits_de_fabrica,
    apariencia: {
      torso: piezas.torso.parte, piernas: piezas.piernas.parte, cabeza: piezas.cabeza ? piezas.cabeza.parte : null,
      brazo_izq: piezas.brazo_izq ? piezas.brazo_izq.parte : null, brazo_der: piezas.brazo_der ? piezas.brazo_der.parte : null,
      mochila: piezas.mochila ? piezas.mochila.parte : null
    }
  };
}

// Unidad enemiga (o invocada) de enemigos.json, al nivel pedido.
export function unidadEnemiga(datos, id, nivel = 1) {
  const def = datos.enemigos.unidades[id];
  if (def.partes) {
    const piloto = { id, nombre: def.nombre, clase: def.clase, personalidad: def.personalidad, nivel: Math.max(nivel, def.nivel || 1) };
    const u = unidadDePiloto(datos, piloto, def.partes, def.gambits);
    return { ...u, tipo: 'enemigo', ref: id, nombre: def.nombre, amenaza: def.amenaza || 1 };
  }
  const mejora = (datos.reglas.enemigos && datos.reglas.enemigos.mejora_por_nivel_pct) || 0;
  const escala = (v) => v + Math.trunc((v * mejora * (nivel - 1)) / 100);
  const s = def.stats;
  const armas = [];
  if (def.arma) {
    const p = datos.partes[def.arma];
    const a = armaDesde(p.arma, {}, s.punteria, 0, 'brazo_der', { etiquetas: p.etiquetas, tipoVisual: tipoVisual(p.etiquetas) });
    a.danio = escala(a.danio);
    armas.push(a);
  }
  if (def.arma_natural) {
    const n = def.arma_natural;
    const a = armaDesde(n, {}, s.punteria, 0, 'natural', {
      etiquetas: n.alcance > 1 ? ['arma'] : ['arma', 'cuerpo_a_cuerpo'], tipoVisual: n.alcance > 1 ? 'escupida' : 'garra'
    });
    a.danio = escala(a.danio);
    armas.push(a);
  }
  const pers = datos.personalidades[def.personalidad];
  return {
    tipo: def.invocacion ? 'invocacion' : 'enemigo',
    ref: id,
    nombre: def.nombre,
    clase: null,
    personalidad: def.personalidad || null,
    vinculoRef: null,
    cuerpo: def.cuerpo,
    sprite: def.sprite || id,
    variantes: def.sprites || null, // la vista elige una (mismo tipo, otro dibujo)
    // infanteria: un peloton de varios soldaditos; con menos vivos, pega menos
    miembros: def.miembros || 1,
    danioPct: def.danio_pct || 100,
    figuras: def.figuras || null,
    amenaza: def.amenaza || 1,
    vidaMax: escala(s.estructura),
    blindaje: s.blindaje,
    velocidad: s.velocidad,
    fijo: s.velocidad === 0, // torretas y señuelos: no se mueven nunca
    vision: s.vision,
    punteria: s.punteria,
    evasion: s.evasion,
    iniciativa: s.iniciativa,
    moral: s.moral,
    moralFija: def.cuerpo === 'mutante' || def.cuerpo === 'dron' || !!def.invocacion || id === 'transporte',
    armas,
    escudo: null,
    mochila: null,
    habilidades: [],
    etiquetasPartes: [],
    ganchos: pers ? [...pers.ganchos] : [],
    gambits: def.gambits || (def.clase ? datos.clases[def.clase].gambits_de_fabrica : []),
    apariencia: null
  };
}
