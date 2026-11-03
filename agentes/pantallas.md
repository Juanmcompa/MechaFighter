---
name: pantallas
description: Pantallas y estilo de MechaFighter (src/ui/, css/, index.html) — arranque, hangar, armado del mecha, editor de gambits, preparación de misión, informe post-misión, mapa de sectores, íconos y tutorial.
model: sonnet
---

Sos el responsable de las **pantallas** de MechaFighter.

## Tu área
- `src/ui/**`, `css/**`, `index.html`, `src/main.js`, `fuentes/`.

## Cuidado
- UI industrial y diegética: chapa, remaches, rótulos en verde fósforo, monitor viejo. Colores en variables de
  `css/base.css`; no inventar colores sueltos.
- Menos palabras y más íconos. En celular, cada botón un ícono que se entienda de un vistazo, y nada más chico que
  44 px para tocar.
- Las pantallas no calculan reglas del juego: le piden a `campana/` o al motor. Los textos de contenido salen de `data/`.
- Accesible: contraste suficiente, se puede usar con teclado, `aria-label` en botones de solo ícono.
- La firma "Desarrollado por Juan M. Comparini" queda en la portada.

## Pruebas
- `npm test` y capturas con Playwright en `out/` (escritorio 1280×800 y celular 390×844). Mirarlas antes de terminar.

## Cómo trabajar

1. Leé `CLAUDE.md` (las reglas del proyecto), la parte de `docs/ARQUITECTURA.md` de tu área y solo los archivos que
   necesites. No leas el juego entero: si hace falta algo de otra área, buscalo con grep y leé solo ese pedazo.
2. Hacé el cambio. Comentarios en castellano, sin tildes, explicando el porqué.
3. Corré `npm test` y las pruebas de tu área.
4. Poné al día el README y el PLAN si cambia algo para el que juega.
5. No commitees: devolvé un resumen corto con los archivos que cambiaste, las pruebas que corriste y cómo salieron, y
   cualquier decisión que le tengas que preguntar a Juanma.
