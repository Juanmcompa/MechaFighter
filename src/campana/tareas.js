// Tareas del hangar: un piloto puede quedarse fuera de la proxima mision haciendo otra cosa
// (descansar, entrenar, chatarrear, explorar). Se cumple al cerrar esa mision. Ver reglas.json > tareas.

import { sortearParte } from './partida.js';
import { nombrePieza } from '../motor/unidades.js';

// Los que salen a la proxima mision: los que no tienen tarea, hasta el maximo del escuadron
export function desplegables(datos, p) {
  return p.pilotos.filter((pi) => !pi.tarea).slice(0, datos.reglas.escuadra_maxima);
}

// Asigna (o saca, con null) una tarea. No deja a la mision sin nadie.
export function asignarTarea(datos, p, pilotoId, tarea) {
  const pi = p.pilotos.find((x) => x.id === pilotoId);
  if (!pi) return false;
  if (tarea && (tarea[0] === '_' || !datos.reglas.tareas[tarea])) return false;
  if (tarea && !pi.tarea && p.pilotos.filter((x) => !x.tarea).length <= 1) return false;
  pi.tarea = tarea || null;
  return true;
}

export const puedeQuedarse = (p, pi) => !!pi.tarea || p.pilotos.filter((x) => !x.tarea).length > 1;

// La mision como se juega: si alguien salio a explorar, sin niebla
export function misionConTareas(datos, p, m) {
  const T = datos.reglas.tareas;
  const explora = p.pilotos.some((pi) => pi.tarea && T[pi.tarea].quita_niebla);
  return explora && m.niebla ? { ...m, niebla: false, explorada: true } : m;
}

// Al cerrar la mision: cada uno cuenta como le fue. Devuelve lineas para el informe.
export function cumplirTareas(datos, p, az) {
  const T = datos.reglas.tareas;
  const R = datos.reglas;
  const lineas = [];
  for (const pi of p.pilotos) {
    if (!pi.tarea) continue;
    const t = T[pi.tarea];
    let texto = '';
    if (t.cura_traumas) {
      const antes = pi.traumas.length;
      for (const x of pi.traumas) if (x.cura === 'misiones_de_descanso') x.resta -= t.cura_traumas;
      pi.traumas = pi.traumas.filter((x) => x.cura !== 'misiones_de_descanso' || x.resta > 0);
      texto = pi.traumas.length < antes ? 'Descansó y se le pasó el trauma.' : 'Descansó. Vuelve con la cabeza fresca.';
      if (t.atento) pi.descansado = true;
    }
    if (t.xp) {
      pi.xp += t.xp;
      let subio = false;
      while (pi.nivel < R.xp_por_nivel.length && pi.xp >= R.xp_por_nivel[pi.nivel]) { pi.nivel++; subio = true; }
      texto = 'Entrenó en el simulador: +' + t.xp + ' XP' + (subio ? ' y subió a nivel ' + pi.nivel : '') + '.';
    }
    if (t.creditos) {
      p.creditos += t.creditos;
      texto = 'Volvió de los desarmaderos con ' + t.creditos + ' créditos';
      if (t.chance_parte && az.tirada(t.chance_parte)) {
        const pieza = sortearParte(datos, az, 1, p);
        p.inventario.push(pieza);
        texto += ' y ' + nombrePieza(datos, pieza);
      }
      texto += '.';
    }
    if (t.inteligencia) {
      const sec = p.sectores[p.sector];
      const I = datos.sectores.campana_base.inteligencia;
      if (sec && sec.inteligencia !== undefined && sec.inteligencia < I.maxima) sec.inteligencia = Math.min(I.maxima, sec.inteligencia + t.inteligencia);
      texto = 'Reconoció el terreno por delante del escuadrón.';
    }
    lineas.push({ id: pi.id, apodo: pi.apodo, tarea: pi.tarea, icono: t.icono, texto });
    (pi.hoja = pi.hoja || []).push(texto);
    pi.tarea = null;
  }
  return lineas;
}
