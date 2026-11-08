// Idiomas: el castellano esta en los mismos archivos de data/. Cada otro idioma es un archivo
// data/idiomas/<codigo>.json con solo las traducciones: { "textos": { "<tabla>": { "<ruta>": "texto" } } }.
// La ruta usa puntos y numeros de posicion: "control_abre.0", "clientes.cooperativa.nombre".
// Lo que no esta traducido queda en castellano. (Los textos de la interfaz que estan en el codigo, todavia no.)

// Tablas con textos para el jugador (las que se editan en el taller)
export const TABLAS_DE_TEXTO = ['textos', 'charlas', 'voces', 'lore', 'nemesis', 'misiones', 'sectores', 'dilemas',
  'condiciones_mision', 'estados', 'personalidades', 'clases', 'partes', 'habilidades', 'enemigos', 'traumas', 'gambits'];

// Un texto para el jugador (no un id): tiene espacios, mayusculas, tildes o signos
export const esTexto = (s) => typeof s === 'string' && s.length > 0 && (/\s/.test(s) || /[A-ZÁÉÍÓÚÑ¡¿«]/.test(s));

// Todos los textos de un objeto, con su ruta: [{ ruta, valor }]
export function textosDe(obj, prefijo = '') {
  const out = [];
  const ir = (o, ruta) => {
    if (typeof o === 'string') { if (esTexto(o)) out.push({ ruta, valor: o }); return; }
    if (Array.isArray(o)) { o.forEach((x, i) => ir(x, ruta ? ruta + '.' + i : String(i))); return; }
    if (o && typeof o === 'object') for (const k of Object.keys(o)) if (!k.startsWith('_')) ir(o[k], ruta ? ruta + '.' + k : k);
  };
  ir(obj, prefijo);
  return out;
}

export function leerRuta(obj, ruta) {
  let o = obj;
  for (const k of ruta.split('.')) { if (o == null) return undefined; o = o[k]; }
  return o;
}

export function ponerRuta(obj, ruta, valor) {
  const ks = ruta.split('.');
  let o = obj;
  for (const k of ks.slice(0, -1)) { if (o[k] == null) return false; o = o[k]; }
  if (!(ks.at(-1) in o)) return false;
  o[ks.at(-1)] = valor;
  return true;
}

// Aplica un idioma sobre los datos ya cargados (antes de congelarlos)
export function aplicarIdioma(datos, idioma) {
  if (!idioma || !idioma.textos) return datos;
  for (const [tabla, rutas] of Object.entries(idioma.textos)) {
    if (!datos[tabla]) continue;
    for (const [ruta, texto] of Object.entries(rutas)) if (texto) ponerRuta(datos[tabla], ruta, texto);
  }
  return datos;
}
