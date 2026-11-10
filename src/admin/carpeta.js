// Acceso a la carpeta del proyecto desde el navegador (Chrome o Edge: File System Access API).
// El taller lee y escribe los archivos de verdad (data/*.json), asi lo que se edita queda listo para el commit.
// Sin carpeta elegida, todo se lee por fetch y "Guardar" descarga el archivo.

const BD = 'mechafighter-taller';
let carpeta = null; // FileSystemDirectoryHandle de la raiz del repo

function abrirBD() {
  return new Promise((ok, mal) => {
    const r = indexedDB.open(BD, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('h');
    r.onsuccess = () => ok(r.result);
    r.onerror = () => mal(r.error);
  });
}
async function bd(modo, fn) {
  const db = await abrirBD();
  return new Promise((ok, mal) => {
    const tx = db.transaction('h', modo);
    const r = fn(tx.objectStore('h'));
    tx.oncomplete = () => ok(r && r.result);
    tx.onerror = () => mal(tx.error);
  });
}

export const hayAcceso = () => !!carpeta;
export const soportado = () => 'showDirectoryPicker' in window;
export const nombreCarpeta = () => (carpeta ? carpeta.name : '');

// La ultima carpeta usada (el navegador pide permiso de nuevo con un clic)
export async function recordarCarpeta() {
  try {
    const h = await bd('readonly', (s) => s.get('raiz'));
    if (!h) return false;
    if ((await h.queryPermission({ mode: 'readwrite' })) === 'granted') { carpeta = h; return true; }
    return h; // hay una guardada, pero hay que pedir permiso con un clic
  } catch { return false; }
}

export async function pedirPermiso(h) {
  if ((await h.requestPermission({ mode: 'readwrite' })) === 'granted') { carpeta = h; return true; }
  return false;
}

export async function elegirCarpeta() {
  const h = await window.showDirectoryPicker({ id: 'mechafighter', mode: 'readwrite' });
  // tiene que ser la raiz del juego (la que tiene data/indice.json)
  try { await (await (await h.getDirectoryHandle('data')).getFileHandle('indice.json')).getFile(); }
  catch { throw new Error('Esa carpeta no es la del juego: elegí la carpeta MechaFighter (la que tiene data/ adentro).'); }
  carpeta = h;
  await bd('readwrite', (s) => s.put(h, 'raiz'));
  return true;
}

async function manija(ruta, crear = false) {
  const partes = ruta.split('/');
  let dir = carpeta;
  for (const p of partes.slice(0, -1)) dir = await dir.getDirectoryHandle(p, { create: crear });
  return dir.getFileHandle(partes.at(-1), { create: crear });
}

// Lee un archivo del proyecto (de la carpeta si hay acceso; si no, del servidor)
export async function leerTexto(ruta) {
  if (carpeta) return (await (await manija(ruta)).getFile()).text();
  const r = await fetch('./' + ruta, { cache: 'no-cache' });
  if (!r.ok) throw new Error('No se pudo leer ' + ruta);
  return r.text();
}
export async function leerJSON(ruta) {
  const t = await leerTexto(ruta);
  try { return JSON.parse(t); } catch (e) { throw new Error(ruta + ' tiene un error de escritura: ' + e.message); }
}
export async function existe(ruta) {
  try { await leerTexto(ruta); return true; } catch { return false; }
}

// Guarda: en la carpeta si hay acceso; si no, lo descarga para reemplazarlo a mano
export async function guardarTexto(ruta, texto) {
  if (carpeta) {
    const w = await (await manija(ruta, true)).createWritable();
    await w.write(texto);
    await w.close();
    return 'guardado';
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([texto], { type: 'application/json' }));
  a.download = ruta.split('/').at(-1);
  a.click();
  return 'descargado';
}
export const guardarJSON = (ruta, obj) => guardarTexto(ruta, JSON.stringify(obj, null, 2) + '\n');

// Lista los PNG de una carpeta del proyecto (para los sprites nuevos)
export async function listarImagenes(rutaDir) {
  if (!carpeta) return [];
  let dir = carpeta;
  try { for (const p of rutaDir.split('/').filter(Boolean)) dir = await dir.getDirectoryHandle(p); } catch { return []; }
  const out = [];
  for await (const [nombre, h] of dir.entries()) {
    if (h.kind === 'file' && /\.png$/i.test(nombre)) out.push({ nombre: nombre.replace(/\.png$/i, ''), archivo: await h.getFile() });
  }
  return out.sort((a, b) => a.nombre.localeCompare(b.nombre));
}

// Nombres (sin extension) de los archivos .json de una carpeta del proyecto
export async function listarJSON(rutaDir) {
  if (!carpeta) return [];
  let dir = carpeta;
  try { for (const p of rutaDir.split('/').filter(Boolean)) dir = await dir.getDirectoryHandle(p); } catch { return []; }
  const out = [];
  for await (const [nombre, h] of dir.entries()) if (h.kind === 'file' && nombre.endsWith('.json')) out.push(nombre.slice(0, -5));
  return out;
}

// Todas las rutas de archivos de una carpeta del proyecto y sus subcarpetas ('assets/iconos/brazo_rifle.png'...)
export async function listarTodo(rutaDir) {
  if (!carpeta) return null;
  let dir = carpeta;
  try { for (const p of rutaDir.split('/').filter(Boolean)) dir = await dir.getDirectoryHandle(p); } catch { return null; }
  const out = [];
  const recorrer = async (d, ruta) => {
    for await (const [nombre, h] of d.entries()) {
      if (h.kind === 'directory') await recorrer(h, ruta + '/' + nombre); else out.push(ruta + '/' + nombre);
    }
  };
  await recorrer(dir, rutaDir);
  return out;
}
