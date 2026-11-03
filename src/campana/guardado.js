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
