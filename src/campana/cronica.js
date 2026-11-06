// Cronica del escuadron: lo que fue pasando en la campana, para contarlo al final (sobre todo si se pierde).
// Cada entrada: { sector, texto, tipo }. Las estadisticas van en p.stats.

export function anotar(p, texto, tipo = 'hecho') {
  if (!texto) return;
  p.cronica = p.cronica || [];
  p.cronica.push({ sector: p.sector + 1, texto, tipo });
}

export function sumarStat(p, clave, n = 1) {
  p.stats = p.stats || {};
  p.stats[clave] = (p.stats[clave] || 0) + n;
}

// El relato completo, agrupado por sector, con un cierre segun como termino
export function relato(datos, p) {
  const st = p.stats || {};
  const nombre = p.nombreEscuadron || 'el escuadrón';
  const capitulos = [];
  for (const e of p.cronica || []) {
    let c = capitulos.find((x) => x.sector === e.sector);
    if (!c) {
      const s = (p.sectores || [])[e.sector - 1];
      c = { sector: e.sector, titulo: 'Sector ' + e.sector + (s ? ' · ' + s.nombre : ''), hechos: [] };
      capitulos.push(c);
    }
    c.hechos.push(e);
  }
  // los que mas hicieron: por bajas (vivos y caidos)
  const todos = p.pilotos.map((x) => ({ apodo: x.apodo, bajas: x.bajas || 0, vivo: true })).concat(p.caidos.map((x) => ({ apodo: x.apodo, bajas: x.bajas || 0, vivo: false })));
  const mejor = todos.sort((a, b) => b.bajas - a.bajas)[0];
  const jefes = st.jefes || [];
  const gano = p.resultado === 'victoria';
  const sobrevivio = p.legado && p.legado.veterano && p.legado.veterano.comoLlego === 'sobrevivio' ? p.legado.veterano.apodo : null;
  const cierre = gano
    ? 'Cruzaron el Cinturón. ' + p.pilotos.length + ' volvieron a casa para contarlo.'
    : 'Llegaron hasta el sector ' + (p.sector + 1) + ', ' + ((p.sectores || [])[p.sector] || {}).nombre + '. Ahí se terminó el contrato de ' + nombre + '.';
  const logros = [];
  logros.push((st.ganadas || 0) + ' misiones cumplidas de ' + (st.jugadas || p.misionesJugadas || 0));
  logros.push((st.bajas || 0) + ' enemigos abatidos');
  if (jefes.length) logros.push('cayeron ' + jefes.join(', '));
  if (st.rescates) logros.push(st.rescates + ' rescatados');
  if (st.dilemas) logros.push(st.dilemas + (st.dilemas === 1 ? ' decisión difícil' : ' decisiones difíciles'));
  return {
    titulo: 'La historia de ' + nombre,
    capitulos,
    cierre,
    logros,
    destacado: mejor && mejor.bajas ? '«' + mejor.apodo + '» fue el más letal: ' + mejor.bajas + ' bajas' +
      (mejor.vivo ? '.' : sobrevivio === mejor.apodo ? '. Lo encontraron vivo entre los restos.' : ', y no volvió.') : null
  };
}
