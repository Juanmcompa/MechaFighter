// Guarda la partida en el aparato. Si el navegador no deja (modo privado, almacenamiento lleno), el juego sigue:
// solo que al cerrar la pestana se pierde.
const CLAVE = 'mechafighter.partida.v1';

export function guardar(partida) {
  try { localStorage.setItem(CLAVE, JSON.stringify(partida)); return true; } catch { return false; }
}

export function cargar() {
  try {
    const t = localStorage.getItem(CLAVE);
    return t ? JSON.parse(t) : null;
  } catch { return null; }
}

export function borrar() {
  try { localStorage.removeItem(CLAVE); } catch { /* nada */ }
}

// Legado entre campanas (veterano, escuadron perdido): aparte de la partida, asi no se borra con ella.
const CLAVE_LEGADO = 'mechafighter.legado.v1';

export function guardarLegado(legado) {
  try { localStorage.setItem(CLAVE_LEGADO, JSON.stringify(legado)); return true; } catch { return false; }
}

export function cargarLegado() {
  try {
    const t = localStorage.getItem(CLAVE_LEGADO);
    return t ? JSON.parse(t) : null;
  } catch { return null; }
}

export function borrarLegado() {
  try { localStorage.removeItem(CLAVE_LEGADO); } catch { /* nada */ }
}
