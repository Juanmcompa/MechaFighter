// Revisa los datos antes de jugar: que cada referencia exista, que los mapas cierren y que no haya decimales.
// Devuelve una lista de errores en castellano llano ("partes › brazo_rifle: ..."). Lista vacia = todo bien.
// Lo usan la pantalla de arranque (para que Juanma vea enseguida si un JSON quedo mal) y las pruebas.

const ENCAJES = ['cabeza', 'torso', 'piernas', 'brazo', 'mochila'];
const ENCAJES_MECHA = { cabeza: 'cabeza', torso: 'torso', piernas: 'piernas', brazo_izq: 'brazo', brazo_der: 'brazo', mochila: 'mochila' };
const RAREZAS = ['comun', 'poco_comun', 'raro', 'epico'];
const OPERADORES = ['<', '<=', '>', '>=', '==', '!='];
const GANCHOS = ['anular', 'correr_umbral', 'subir_prioridad', 'ignorar_condicion', 'cambiar_objetivo', 'correa', 'moral', 'confusion', 'perdido'];
const CUERPOS = ['mecha', 'infanteria', 'mutante'];
const VICTORIA_DERROTA = ['sobrevivir_oleadas', 'escuadron_eliminado', 'enemigos_eliminados', 'zona_perdida', 'unidad_muerta',
  'unidad_llega_a_zona', 'escuadron_llega_a_zona', 'tiempo_agotado'];
const CASILLAS_CAMINABLES = ['piso', 'peligro'];
const ID_VALIDO = /^[a-z0-9_]+$/;

export function validarDatos(d) {
  const errores = [];
  const err = (donde, msg) => errores.push(donde + ': ' + msg);
  const existe = (tabla, id) => tabla && Object.prototype.hasOwnProperty.call(tabla, id);

  // --- 0. Todo entero (el motor no usa decimales para que el combate de igual en todos lados) e ids prolijos
  recorrer(d, [], (ruta, valor) => {
    if (typeof valor === 'number' && !Number.isInteger(valor)) err(ruta.join(' › '), 'tiene decimales (' + valor + '); usa enteros');
  });
  for (const tabla of ['clases', 'partes', 'afijos', 'personalidades', 'habilidades', 'estados', 'cicatrices', 'traumas',
    'medallas', 'misiones', 'sectores']) {
    for (const id of Object.keys(d[tabla] || {})) if (!ID_VALIDO.test(id)) err(tabla + ' › ' + id, 'el id solo puede tener minusculas, numeros y _');
  }

  const g = d.gambits || {};
  const condiciones = g.condiciones || {};
  const acciones = g.acciones || {};
  const objetivos = g.objetivos || {};
  const funciones = g.funciones || [];
  const etiquetasDeAcciones = new Set(Object.values(acciones).flatMap((a) => a.etiquetas || []));
  const eventos = (d.reglas && d.reglas.eventos) || [];

  // --- 1. Reglas
  const r = d.reglas || {};
  for (const k of ['version_datos', 'version_motor', 'ticks_maximos', 'escuadra_maxima']) {
    if (!Number.isInteger(r[k])) err('reglas', 'falta "' + k + '" (numero entero)');
  }

  // --- Expresiones (condiciones de gambits y "cuando" de los ganchos)
  function revisarExpr(donde, e, params) {
    if (e === true || e === false) return;
    if (!e || typeof e !== 'object') return err(donde, 'condicion vacia o rara');
    if (e.todos || e.alguno) {
      const lista = e.todos || e.alguno;
      if (!Array.isArray(lista) || !lista.length) return err(donde, '"todos"/"alguno" necesita una lista');
      lista.forEach((x, i) => revisarExpr(donde + ' › ' + i, x, params));
      return;
    }
    if (e.no !== undefined) return revisarExpr(donde + ' › no', e.no, params);
    if (e.existe !== undefined) {
      if (!['enemigo', 'aliado'].includes(e.existe)) err(donde, '"existe" tiene que ser enemigo o aliado');
      if (e.donde) revisarExpr(donde + ' › donde', e.donde, params);
      return;
    }
    if (e.fn !== undefined) {
      if (!funciones.includes(e.fn)) err(donde, 'la funcion "' + e.fn + '" no esta en gambits.funciones');
      return;
    }
    if (e.dato !== undefined) {
      if (!OPERADORES.includes(e.op)) err(donde, 'operador "' + e.op + '" no vale; usa ' + OPERADORES.join(' '));
      if (e.param !== undefined) {
        if (!params || !params[e.param]) err(donde, 'usa el parametro "' + e.param + '" pero no esta declarado');
      } else if (typeof e.valor !== 'number') err(donde, 'falta "valor" (numero) o "param"');
      return;
    }
    err(donde, 'no entiendo esta condicion: ' + JSON.stringify(e));
  }

  function revisarGambits(donde, lista) {
    if (!Array.isArray(lista)) return err(donde, 'los gambits tienen que ser una lista');
    lista.forEach((gm, i) => {
      const aqui = donde + ' › gambit ' + (i + 1);
      const c = condiciones[gm.condicion];
      if (!c) err(aqui, 'condicion "' + gm.condicion + '" no existe');
      if (!existe(acciones, gm.accion)) err(aqui, 'accion "' + gm.accion + '" no existe');
      if (!existe(objetivos, gm.objetivo)) err(aqui, 'objetivo "' + gm.objetivo + '" no existe');
      for (const [p, v] of Object.entries(gm.parametros || {})) {
        const decl = c && c.parametros && c.parametros[p];
        if (!decl) err(aqui, 'parametro "' + p + '" no existe en "' + gm.condicion + '"');
        else if (v < decl.min || v > decl.max) err(aqui, p + ' = ' + v + ' fuera de rango (' + decl.min + ' a ' + decl.max + ')');
      }
    });
    const max = g.maximo_por_unidad;
    if (max && lista.length > max) err(donde, 'tiene ' + lista.length + ' gambits; el maximo es ' + max);
  }

  function revisarGanchos(donde, ganchos) {
    (ganchos || []).forEach((h, i) => {
      const aqui = donde + ' › gancho ' + (i + 1);
      if (!GANCHOS.includes(h.tipo)) return err(aqui, 'tipo "' + h.tipo + '" no existe; usa ' + GANCHOS.join(', '));
      switch (h.tipo) {
        case 'anular':
          if (!Number.isInteger(h.prioridad)) err(aqui, 'falta "prioridad"');
          revisarExpr(aqui + ' › cuando', h.cuando, null);
          if (!h.hacer || !existe(acciones, h.hacer.accion)) err(aqui, 'accion de "hacer" no existe');
          if (!h.hacer || !existe(objetivos, h.hacer.objetivo)) err(aqui, 'objetivo de "hacer" no existe');
          break;
        case 'correr_umbral':
          if (typeof h.dato !== 'string' || !Number.isInteger(h.delta)) err(aqui, 'necesita "dato" y "delta"');
          break;
        case 'subir_prioridad':
          for (const et of h.etiquetas || []) if (!etiquetasDeAcciones.has(et)) err(aqui, 'ninguna accion tiene la etiqueta "' + et + '"');
          break;
        case 'ignorar_condicion':
          if (!condiciones[h.condicion]) err(aqui, 'condicion "' + h.condicion + '" no existe');
          break;
        case 'cambiar_objetivo':
          if (!existe(objetivos, h.selector)) err(aqui, 'objetivo "' + h.selector + '" no existe');
          break;
        case 'correa':
          if (!existe(objetivos, h.ancla)) err(aqui, 'ancla "' + h.ancla + '" no es un objetivo');
          break;
        case 'moral':
          if (!eventos.includes(h.evento)) err(aqui, 'evento "' + h.evento + '" no esta en reglas.eventos');
          break;
        case 'confusion':
          if (!Number.isInteger(h.chance)) err(aqui, 'confusion necesita "chance" (0 a 100)');
          break;
        case 'perdido':
          if (!Number.isInteger(h.ticks)) err(aqui, 'perdido necesita "ticks" (cuanto tarda en ubicarse)');
          break;
      }
    });
  }

  // --- 2. Gambits: cada condicion y accion bien armada
  for (const [id, c] of Object.entries(condiciones)) revisarExpr('gambits › ' + id, c.expr, c.parametros);
  for (const [id, a] of Object.entries(acciones)) {
    if (a.habilidad && !existe(d.habilidades, a.habilidad)) err('gambits › ' + id, 'habilidad "' + a.habilidad + '" no existe');
  }

  // --- 3. Partes y afijos
  for (const [id, p] of Object.entries(d.partes || {})) {
    const aqui = 'partes › ' + id;
    if (!ENCAJES.includes(p.encaje)) err(aqui, 'encaje "' + p.encaje + '" no existe; usa ' + ENCAJES.join(', '));
    if (p.rareza && !RAREZAS.includes(p.rareza)) err(aqui, 'rareza "' + p.rareza + '" no existe');
    if (!Number.isInteger(p.peso)) err(aqui, 'falta "peso"');
    if (p.encaje === 'torso' && !(p.estructura > 0 && p.capacidad > 0)) err(aqui, 'un torso necesita "estructura" y "capacidad"');
    if (p.encaje === 'piernas' && !Number.isInteger(p.velocidad)) err(aqui, 'unas piernas necesitan "velocidad"');
    if (p.arma) {
      for (const k of ['danio', 'alcance', 'cadencia']) if (!(p.arma[k] >= 0)) err(aqui, 'el arma necesita "' + k + '"');
      if (p.arma.estado && !existe(d.estados, p.arma.estado)) err(aqui, 'estado "' + p.arma.estado + '" no existe');
    }
    if (p.habilidad && !existe(d.habilidades, p.habilidad)) err(aqui, 'habilidad "' + p.habilidad + '" no existe');
  }
  for (const [id, a] of Object.entries(d.afijos || {})) {
    if (!['prefijo', 'sufijo'].includes(a.tipo)) err('afijos › ' + id, 'tipo tiene que ser prefijo o sufijo');
    if (a.rareza_minima && !RAREZAS.includes(a.rareza_minima)) err('afijos › ' + id, 'rareza "' + a.rareza_minima + '" no existe');
    revisarGanchos('afijos › ' + id, a.ganchos);
  }

  // --- 4. Clases
  for (const [id, c] of Object.entries(d.clases || {})) {
    const aqui = 'clases › ' + id;
    for (const p of c.partes_sugeridas || []) if (!existe(d.partes, p)) err(aqui, 'parte "' + p + '" no existe');
    for (const h of c.habilidades_iniciales || []) if (!existe(d.habilidades, h)) err(aqui, 'habilidad "' + h + '" no existe');
    revisarGambits(aqui, c.gambits_de_fabrica);
  }

  // --- 5. Todo lo que usa ganchos
  for (const tabla of ['personalidades', 'traumas', 'estados']) {
    for (const [id, x] of Object.entries(d[tabla] || {})) revisarGanchos(tabla + ' › ' + id, x.ganchos);
  }
  for (const [id, t] of Object.entries(d.traumas || {})) {
    if (t.origen && !eventos.includes(t.origen.evento)) err('traumas › ' + id, 'evento de origen "' + t.origen.evento + '" no esta en reglas.eventos');
  }

  // --- 6. Habilidades
  for (const [id, h] of Object.entries(d.habilidades || {})) {
    const e = h.efecto || {};
    for (const est of [e.estado, e.estado_propio, ...(e.quita_estados || [])].filter(Boolean)) {
      if (!existe(d.estados, est)) err('habilidades › ' + id, 'estado "' + est + '" no existe');
    }
    if (e.invoca && !existe(d.enemigos && d.enemigos.unidades, e.invoca)) err('habilidades › ' + id, 'invoca "' + e.invoca + '", que no esta en enemigos.unidades');
  }

  // --- 7. Enemigos
  const unidades = (d.enemigos && d.enemigos.unidades) || {};
  for (const [id, u] of Object.entries(unidades)) {
    const aqui = 'enemigos › ' + id;
    if (!CUERPOS.includes(u.cuerpo)) err(aqui, 'cuerpo "' + u.cuerpo + '" no existe; usa ' + CUERPOS.join(', '));
    if (u.personalidad && !existe(d.personalidades, u.personalidad)) err(aqui, 'personalidad "' + u.personalidad + '" no existe');
    if (u.clase && !existe(d.clases, u.clase)) err(aqui, 'clase "' + u.clase + '" no existe');
    if (u.partes) {
      for (const [encaje, tipo] of Object.entries(ENCAJES_MECHA)) {
        const pid = u.partes[encaje];
        const p = d.partes && d.partes[pid];
        if (!p) err(aqui, 'falta la parte de "' + encaje + '" o "' + pid + '" no existe');
        else if (p.encaje !== tipo) err(aqui, '"' + pid + '" no va en ' + encaje);
      }
    } else if (!u.stats) err(aqui, 'necesita "partes" (mecha) o "stats"');
    if (u.arma) {
      const p = d.partes && d.partes[u.arma];
      if (!p || !p.arma) err(aqui, 'arma "' + u.arma + '" no es una parte con arma');
    }
    if (u.gambits) revisarGambits(aqui, u.gambits);
    else if (!(u.clase && d.clases && d.clases[u.clase])) err(aqui, 'necesita "gambits" o una "clase" que los traiga');
  }
  for (const [id, e] of Object.entries((d.enemigos && d.enemigos.escuadras) || {})) {
    for (const m of e.miembros || []) if (!existe(unidades, m)) err('enemigos › escuadras › ' + id, 'unidad "' + m + '" no existe');
  }

  // --- 8. Mapas
  const leyendaValida = new Set(['piso', 'muro', 'media_cobertura', 'cobertura_total', 'peligro']);
  for (const [id, m] of Object.entries(d.mapas || {})) {
    const aqui = 'mapas › ' + id;
    const [ancho, alto] = m.tamano || [0, 0];
    const filas = m.filas || [];
    if (filas.length !== alto) err(aqui, 'tiene ' + filas.length + ' filas y "tamano" dice ' + alto);
    filas.forEach((f, y) => {
      if (f.length !== ancho) err(aqui, 'la fila ' + y + ' mide ' + f.length + ' y deberia medir ' + ancho);
      for (const letra of f) if (!m.leyenda[letra]) err(aqui, 'la letra "' + letra + '" (fila ' + y + ') no esta en la leyenda');
    });
    for (const [letra, tipo] of Object.entries(m.leyenda || {})) {
      if (!leyendaValida.has(tipo)) err(aqui, 'leyenda "' + letra + '": "' + tipo + '" no existe');
    }
    const casilla = (x, y) => (filas[y] && m.leyenda[filas[y][x]]) || null;
    for (const [bando, lista] of Object.entries(m.aparicion || {})) {
      for (const [x, y] of lista) {
        const t = casilla(x, y);
        if (!CASILLAS_CAMINABLES.includes(t)) err(aqui, 'aparicion de ' + bando + ' en [' + x + ', ' + y + '] cae sobre "' + (t || 'afuera') + '"');
      }
    }
    for (const [z, [[x1, y1], [x2, y2]]] of Object.entries(m.zonas || {})) {
      if (x1 < 0 || y1 < 0 || x2 >= ancho || y2 >= alto || x1 > x2 || y1 > y2) err(aqui, 'la zona "' + z + '" se sale del mapa');
    }
  }

  // --- 8b. Condiciones de mision
  for (const [id, c] of Object.entries(d.condiciones_mision || {})) {
    const aqui = 'condiciones_mision › ' + id;
    const e = c.efectos || {};
    if (e.estado_escuadron && !existe(d.estados, e.estado_escuadron)) err(aqui, 'estado "' + e.estado_escuadron + '" no existe');
    if (e.unidad_extra && !existe(unidades, e.unidad_extra)) err(aqui, 'unidad "' + e.unidad_extra + '" no existe');
    for (const o of c.choca || []) if (!existe(d.condiciones_mision, o)) err(aqui, 'choca con "' + o + '", que no existe');
  }

  // --- 9. Misiones y sectores
  for (const [id, mi] of Object.entries(d.misiones || {})) {
    const aqui = 'misiones › ' + id;
    for (const m of mi.mapas || []) if (!existe(d.mapas, m)) err(aqui, 'mapa "' + m + '" no existe (sumalo en data/indice.json)');
    for (const e of mi.enemigos || []) if (!existe(d.enemigos && d.enemigos.escuadras, e)) err(aqui, 'escuadra "' + e + '" no existe');
    for (const k of ['vip', 'lider']) if (mi[k] && !existe(unidades, mi[k])) err(aqui, k + ' "' + mi[k] + '" no existe');
    for (const cond of [...(mi.victoria || []), ...(mi.derrota || [])]) {
      if (!VICTORIA_DERROTA.includes(cond.tipo)) err(aqui, 'condicion "' + cond.tipo + '" no existe');
      if (cond.zona) {
        for (const m of mi.mapas || []) {
          if (d.mapas[m] && !existe(d.mapas[m].zonas, cond.zona)) err(aqui, 'el mapa "' + m + '" no tiene la zona "' + cond.zona + '"');
        }
      }
    }
    if (!(mi.victoria || []).length) err(aqui, 'no tiene ninguna forma de ganar');
  }
  for (const [id, s] of Object.entries(d.sectores || {})) {
    for (const lista of Object.values(s.misiones_por_dificultad || {})) {
      for (const m of lista) if (!existe(d.misiones, m)) err('sectores › ' + id, 'mision "' + m + '" no existe');
    }
  }

  return errores;
}

function recorrer(o, ruta, fn) {
  fn(ruta, o);
  if (o && typeof o === 'object') for (const k of Object.keys(o)) recorrer(o[k], ruta.concat(k), fn);
}
