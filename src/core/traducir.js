// Textos de la interfaz (los que estan escritos en el codigo: botones, titulos, avisos).
// Se traducen "por el texto mismo": la clave es el texto original en castellano, como hace gettext.
// El catalogo de todos esos textos lo arma tools/extraer_textos.mjs en data/interfaz.json, y las traducciones
// (o cambios al castellano) van en data/idiomas/<codigo>.json > "interfaz": { "texto original": "texto nuevo" }.
// Asi no hace falta tocar el codigo para cambiar o traducir un texto.

let EXACTOS = null;   // texto original -> texto nuevo
let PEDAZOS = [];     // [original, nuevo] de pedazos que se arman pegando partes ('Nivel ' + n), del mas largo al mas corto

export function cargarInterfaz(...mapas) {
  EXACTOS = Object.assign({}, ...mapas.filter(Boolean));
  if (!Object.keys(EXACTOS).length) { EXACTOS = null; PEDAZOS = []; return; }
  PEDAZOS = Object.entries(EXACTOS).filter(([o, n]) => n && o.trim().length >= 3 && o !== n).sort((a, b) => b[0].length - a[0].length);
}

// El texto en el idioma elegido (o el mismo, si no hay cambio para el)
export function tr(s) {
  if (!EXACTOS || typeof s !== 'string' || !s) return s;
  const exacto = EXACTOS[s];
  if (exacto) return exacto;
  // textos armados pegando pedazos: se cambia cada pedazo conocido que aparezca entero
  let out = s;
  for (const [o, n] of PEDAZOS) if (out.includes(o)) out = out.split(o).join(n);
  return out;
}
