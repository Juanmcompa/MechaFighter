// Para Node (pruebas, herramientas): lee los JSON de data/ desde el disco, relativo a la raiz del repo.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export function leerDisco(raiz = RAIZ) {
  return async (ruta) => {
    const texto = await fs.readFile(path.join(raiz, ruta), 'utf8');
    try {
      return JSON.parse(texto);
    } catch (e) {
      throw new Error(ruta + ' tiene un error de escritura: ' + e.message);
    }
  };
}
