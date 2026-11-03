// Azar con semilla: TODO lo aleatorio del juego sale de aca (en el motor esta prohibido Math.random).
// Con la misma semilla da siempre la misma secuencia, en cualquier navegador y en Node. Eso es lo que permite
// repetir una batalla, compartirla por baliza y que el servidor la verifique.
//
// derivar('combate'), derivar('moral')... crea secuencias separadas: si un sistema agrega una tirada, no corre
// las tiradas de los otros (y una batalla vieja de otro sistema sigue dando lo mismo).

// Huella FNV-1a de 32 bits: convierte un texto en un numero, igual en todos lados.
export function huellaTexto(texto) {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// Mezcla dos numeros en uno (para derivar sub-secuencias).
function mezclar(a, b) {
  let h = (a ^ Math.imul(b, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

export function crearAzar(semilla) {
  const origen = typeof semilla === 'string' ? huellaTexto(semilla) : (semilla >>> 0);
  let a = origen || 1;

  // mulberry32: el mismo de BeastMixer. Devuelve un entero de 32 bits.
  function siguiente32() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  return {
    semilla: origen,
    // Entero entre min y max, los dos incluidos. Sin decimales: el motor trabaja solo con enteros.
    entero(min, max) {
      const rango = max - min + 1;
      if (rango <= 0) throw new Error('azar.entero: rango vacio ' + min + '..' + max);
      return min + (siguiente32() % rango);
    },
    // true con probabilidad pct (0 a 100).
    tirada(pct) {
      if (pct <= 0) return false;
      if (pct >= 100) return true;
      return this.entero(1, 100) <= pct;
    },
    elegir(lista) {
      if (!lista.length) return undefined;
      return lista[this.entero(0, lista.length - 1)];
    },
    // Elige segun pesos enteros: [['mision', 60], ['taller', 12]].
    elegirConPeso(pares) {
      let total = 0;
      for (const [, p] of pares) total += p;
      if (total <= 0) return undefined;
      let r = this.entero(1, total);
      for (const [valor, p] of pares) {
        r -= p;
        if (r <= 0) return valor;
      }
      return pares[pares.length - 1][0];
    },
    // Mezcla una copia de la lista (Fisher-Yates). No toca la original.
    mezclar(lista) {
      const copia = lista.slice();
      for (let i = copia.length - 1; i > 0; i--) {
        const j = this.entero(0, i);
        [copia[i], copia[j]] = [copia[j], copia[i]];
      }
      return copia;
    },
    // Sub-secuencia independiente: depende solo de la semilla original y la etiqueta.
    derivar(etiqueta) {
      return crearAzar(mezclar(origen, huellaTexto(String(etiqueta))));
    }
  };
}
