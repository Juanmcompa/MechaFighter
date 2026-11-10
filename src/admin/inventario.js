// Inventario de arte: cruza lo que los datos esperan (piezas, enemigos, retratos, terreno) con los archivos que hay
// en assets/. Solo mira, no cambia nada. Lo usan la pestaña "Arte" del taller y tools/inventario-arte.mjs.
//
// archivos: Set con las rutas que existen ('assets/iconos/brazo_rifle.png'...).
// completo: true si el Set tiene TODO lo que hay en assets/ (asi se pueden ver los archivos que sobran);
//           false si solo se probaron los archivos esperados.
// meta: { sprites, unidades, terreno } = los .json de assets/ (pueden faltar).

// Cuantas letras hay que cambiar para pasar de una palabra a otra (para avisar de nombres casi iguales)
export function distancia(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const f = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previo = f[0]; f[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const guardado = f[j];
      f[j] = Math.min(f[j] + 1, f[j - 1] + 1, previo + (a[i - 1] === b[j - 1] ? 0 : 1));
      previo = guardado;
    }
  }
  return f[b.length];
}

const sinClaves = (o) => Object.entries(o || {}).filter(([k]) => k[0] !== '_');

export function inventario(datos, meta, archivos, completo) {
  const hay = (ruta) => archivos.has(ruta);
  const usados = new Set(); // rutas que alguien espera: lo demas, sobra
  const usar = (ruta) => { usados.add(ruta); return hay(ruta); };
  const avisos = [];

  // ---------- Piezas ----------
  const partes = sinClaves(datos.partes);
  const quienUsa = {}; // sprite -> ids de piezas
  for (const [id, p] of partes) if (p.sprite !== null) (quienUsa[p.sprite || id] = quienUsa[p.sprite || id] || []).push(id);
  const piezas = partes.map(([id, p]) => {
    // "sprite": null en los datos = la pieza no lleva dibujo (ej. Sin mochila)
    if (p.sprite === null) return { id, nombre: p.nombre, encaje: p.encaje, bando: p.bando || '', rareza: p.rareza, provisoria: !!p.provisoria, sprite: null, estado: 'ninguno', comparte: [], avisos: [], icono: usar('assets/iconos/' + id + '.png') };
    const sprite = p.sprite || id;
    const azul = usar('assets/mecha/azul/' + sprite + '.png');
    const fila = {
      id, nombre: p.nombre, encaje: p.encaje, bando: p.bando || '', rareza: p.rareza, provisoria: !!p.provisoria, sprite,
      icono: usar('assets/iconos/' + id + '.png'),
      azul,
      rojo: usar('assets/mecha/rojo/' + sprite + '.png'),
      verde: usar('assets/mecha/verde/' + sprite + '.png'),
      relieve: usar('assets/mecha/azul/' + sprite + '_n.png'),
      brillo: usar('assets/mecha/azul/' + sprite + '_e.png'),
      // de quien es el dibujo: propio, prestado (lo comparte con otra pieza) o falta (se dibuja por codigo)
      comparte: quienUsa[sprite].filter((x) => x !== id),
      avisos: []
    };
    const duenio = datos.partes[sprite] && sprite !== id ? sprite : null; // usa el dibujo de otra pieza
    fila.estado = !azul ? 'falta' : duenio || (fila.comparte.length && fila.provisoria) ? 'prestado' : 'propio';
    fila.prestadoDe = duenio || (fila.estado === 'prestado' ? fila.comparte[0] : null);
    if (fila.provisoria && fila.estado === 'propio') fila.avisos.push('Tiene arte propio pero sigue marcada como provisoria');
    if (!fila.provisoria && fila.estado !== 'propio') fila.avisos.push(fila.estado === 'falta' ? 'Sin dibujo y no está marcada como provisoria' : 'Usa un dibujo prestado y no está marcada como provisoria');
    // (a las provisorias no se les pide icono: ya se sabe que les falta arte)
    if (!fila.icono && !fila.provisoria) fila.avisos.push('Sin ícono: en las listas se ve el sprite' + (azul ? '' : ' (que tampoco está)'));
    if (sprite !== id && !datos.partes[sprite] && distancia(sprite, id) <= 2) fila.avisos.push('El sprite se llama «' + sprite + '» y la pieza «' + id + '»: ¿error de tipeo?');
    return fila;
  });

  // ---------- Enemigos (assets/unidades) ----------
  const UNI = meta.unidades || {};
  const unidades = sinClaves((datos.enemigos || {}).unidades).map(([id, u]) => {
    const dibujos = [...new Set([...(u.figuras || []), ...(u.sprites || []), ...(u.sprite && UNI[u.sprite] ? [u.sprite] : [])])];
    const faltan = dibujos.filter((d) => !usar('assets/unidades/' + d + '.png'));
    for (const d of dibujos) { usar('assets/unidades/' + d + '_n.png'); usar('assets/unidades/' + d + '_e.png'); }
    const sinAnotar = dibujos.filter((d) => !UNI[d]);
    return { id, nombre: u.nombre, cuerpo: u.cuerpo, dibujos, faltan, sinAnotar,
      estado: u.cuerpo === 'mecha' ? 'mecha' : !dibujos.length ? 'codigo' : faltan.length ? 'falta' : 'propio' };
  });
  usar('assets/unidades/unidades.json');
  for (const [id] of sinClaves(UNI)) if (!usar('assets/unidades/' + id + '.png')) avisos.push('unidades.json anota «' + id + '» pero no está el archivo');

  // ---------- Retratos ----------
  const cuantos = ((datos.reglas || {}).arte || {}).retratos || 0;
  const retratosFaltan = [];
  for (let n = 1; n <= cuantos; n++) { const r = 'assets/retratos/' + String(n).padStart(2, '0') + '.png'; if (!usar(r)) retratosFaltan.push(r); }

  // ---------- Terreno ----------
  const TER = meta.terreno || {};
  const idsTerreno = [...(TER.texturas || []), ...Object.values(TER.objetos || {}).flat(), ...(TER.detalles || [])];
  const terrenoFaltan = idsTerreno.filter((id) => !usar('assets/terreno/' + id + '.png'));
  const tilesets = Object.values(TER.tilesets || {});
  for (const t of tilesets) usar('assets/terreno/' + t + '.png');
  const series = Object.values(TER.series || {}).flat();
  usar('assets/terreno/terreno.json'); usar('assets/mecha/sprites.json'); usar('assets/luces.json');

  // ---------- Lo que sobra (solo con la lista completa) ----------
  const sobran = [], raros = [];
  if (completo) {
    const basesTerreno = new Set([...idsTerreno, ...tilesets]);
    for (const ruta of [...archivos].sort()) {
      if (usados.has(ruta)) continue;
      const nombre = ruta.split('/').pop();
      const m = /^(.*)\.png$/.exec(nombre);
      if (!m) { raros.push({ ruta, motivo: 'No es una imagen del juego (¿archivo de trabajo?)' }); continue; }
      if (nombre !== nombre.toLowerCase()) { raros.push({ ruta, motivo: 'Tiene mayúsculas: publicado no se va a encontrar (los nombres van en minúscula)' }); continue; }
      const base = m[1].replace(/_(n|e)$/, ''); // relieve o brillo de otra imagen
      const carpeta = ruta.split('/').slice(0, -1).join('/');
      if (base !== m[1] && (hay(carpeta + '/' + base + '.png'))) continue;
      if (carpeta === 'assets/terreno') {
        const sinNumero = base.replace(/_\d+$/, '');
        if (basesTerreno.has(sinNumero) || series.some((s) => base.startsWith(s))) continue; // variante o serie
      }
      if (carpeta === 'assets/unidades' && base.startsWith('restos_')) continue; // restos: se buscan solos
      if (carpeta === 'assets/retratos') { sobran.push({ ruta, motivo: 'Retrato fuera de la cuenta (reglas.json › arte.retratos = ' + cuantos + ')' }); continue; }
      // ¿se parece a algo que falta o a una pieza?
      const candidatos = carpeta === 'assets/iconos' || carpeta.startsWith('assets/mecha') ? partes.map(([id, p]) => [id, p.sprite || id]).flat() : carpeta === 'assets/unidades' ? Object.keys(UNI) : idsTerreno;
      const parecido = [...new Set(candidatos)].find((c) => c !== base && distancia(c, base) <= 2);
      sobran.push({ ruta, motivo: parecido ? 'Nadie lo usa. Se parece a «' + parecido + '»: ¿error de tipeo?' : 'Nadie lo usa' });
    }
  }

  const cuenta = (lista, f) => lista.filter(f).length;
  return {
    piezas, unidades, retratos: { cuantos, faltan: retratosFaltan }, terreno: { cuantos: idsTerreno.length, faltan: terrenoFaltan },
    sobran, raros, avisos, completo,
    resumen: {
      piezas: piezas.length,
      propias: cuenta(piezas, (p) => p.estado === 'propio'),
      prestadas: cuenta(piezas, (p) => p.estado === 'prestado'),
      sinDibujo: cuenta(piezas, (p) => p.estado === 'falta'),
      provisorias: cuenta(piezas, (p) => p.provisoria),
      sinIcono: cuenta(piezas, (p) => !p.icono && p.estado !== 'ninguno'),
      conAvisos: cuenta(piezas, (p) => p.avisos.length),
      enemigosSinDibujo: cuenta(unidades, (u) => u.estado === 'falta'),
      enemigosPorCodigo: cuenta(unidades, (u) => u.estado === 'codigo'),
      sobran: sobran.length, raros: raros.length
    }
  };
}

// Las rutas que hay que probar cuando no se puede listar la carpeta (taller sin carpeta elegida)
export function rutasEsperadas(datos, meta) {
  const probadas = new Set();
  inventario(datos, meta, { has: (r) => { probadas.add(r); return false; } }, false);
  return [...probadas];
}
