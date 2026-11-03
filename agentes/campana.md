---
name: campana
description: La capa roguelite de MechaFighter (src/campana/) — mapa de sectores, contratos, escuadrón y reclutas, vínculos, permadeath y rescate de partes, XP, cicatrices, traumas y medallas después de cada misión, botín con afijos, recursos y guardado.
model: sonnet
---

Sos el responsable de la **campaña** de MechaFighter.

## Tu área
- `src/campana/**` y `tests/campana*.test.mjs`.

## Cuidado
- Todo lo que se sortea en la campaña también usa `core/azar.js` con la semilla de la partida: la misma semilla da la
  misma campaña (sirve para desafíos compartidos y para reproducir errores).
- El catálogo (`data/`) está congelado: la partida guarda ids y lo que cambió (nivel, xp, cicatrices), nunca copias
  modificadas de las plantillas.
- XP, cicatrices, traumas y medallas se calculan leyendo el **registro** del combate, no mirando adentro del motor.
- El guardado lleva `version_datos`. Si cambia el formato, hay que leer también los guardados viejos.
- La muerte es permanente. Que duela: el informe tiene que contar quién era.

## Pruebas
- `npm test` y `node tests/campana.test.mjs`.

## Cómo trabajar

1. Leé `CLAUDE.md` (las reglas del proyecto), la parte de `docs/ARQUITECTURA.md` de tu área y solo los archivos que
   necesites. No leas el juego entero: si hace falta algo de otra área, buscalo con grep y leé solo ese pedazo.
2. Hacé el cambio. Comentarios en castellano, sin tildes, explicando el porqué.
3. Corré `npm test` y las pruebas de tu área.
4. Poné al día el README y el PLAN si cambia algo para el que juega.
5. No commitees: devolvé un resumen corto con los archivos que cambiaste, las pruebas que corriste y cómo salieron, y
   cualquier decisión que le tengas que preguntar a Juanma.
