// Bus de avisos para la interfaz (pantallas que se enteran de cosas sin llamarse entre si).
// El MOTOR no lo usa: el motor devuelve un registro de eventos y listo, asi sigue siendo puro.

export function crearBus() {
  const oyentes = new Map();
  return {
    on(evento, fn) {
      if (!oyentes.has(evento)) oyentes.set(evento, []);
      oyentes.get(evento).push(fn);
      return () => oyentes.set(evento, oyentes.get(evento).filter((f) => f !== fn));
    },
    emit(evento, datos) {
      for (const fn of (oyentes.get(evento) || []).slice()) fn(datos);
    }
  };
}

export const bus = crearBus();
