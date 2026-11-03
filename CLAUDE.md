# MechaFighter — instrucciones para Claude

Auto-battler táctico sci-fi con progresión roguelite: armás un escuadrón de hasta 6 mechas (cada uno con su piloto),
los programás con *gambits* antes de la misión y la batalla se juega sola. Los pilotos tienen personalidad, ganan
cicatrices, traumas y medallas, y mueren de verdad (permadeath).

HTML, CSS y módulos de JavaScript sin compilar ni dependencias. Se publica en GitHub Pages. El servidor (tablas,
balizas de ayuda) va en `servidor/` y corre en Cloudflare Workers + D1, igual que Shakedown.

Lo hace Juanma (Juan M. Comparini), docente de diseño gráfico. No programa: sube los cambios con GitHub Desktop.

## Cómo se trabaja

- **Hablarle en castellano rioplatense**, corto y con lo importante primero. Sin jerga de programación.
- Cada pedido se resuelve dejando los cambios listos en su carpeta con un **resumen y una descripción para el commit**;
  el commit y el Push los hace él desde GitHub Desktop. Mensaje en castellano, que diga qué cambia para el que juega.
- Tocar **solo los archivos del pedido**: si hay cambios suyos sin guardar, no se tocan (avisale si ves algo roto).
- Comentarios del código en castellano, sin tildes, explicando el porqué. README y PLAN al día (en el PLAN, lo hecho
  va como `- [x]`).

## Arquitectura en una línea

`data/` (todo el contenido, JSON editable a mano) → `src/motor/` (combate determinista, puro) → registro de eventos →
`src/vista/` (lo dibuja) y `src/campana/` (lo usa para XP, cicatrices, medallas). Detalle en `docs/ARQUITECTURA.md`.

**Regla de dependencias:** `vista/`, `ui/` y `red/` pueden usar `motor/` y `campana/`; nunca al revés. `motor/` solo
usa `core/` y los datos que recibe. Nada de `document`, `window`, `Date.now()` ni `Math.random()` dentro de `motor/`.

## Subagentes (`agentes/`)

Uno por área (para que Claude Code los use como subagentes, se copian a `.claude/agents/`). Para un pedido se llama **solo** al del área que hay que cambiar; si toca dos, a los dos, cada uno con
su parte. Cada subagente lee este archivo y sus propios archivos, no el juego entero. Devuelven un resumen corto:
qué cambiaron, qué pruebas corrieron y cómo salieron.

| Área | Subagente |
| --- | --- |
| Contenido: clases, partes de mecha, personalidades, gambits, enemigos, misiones, mapas; balance | `datos` |
| El combate: ticks, decisión (gambits + personalidad + moral), movimiento, disparos, objetivos, registro | `motor` |
| Lo que se ve de la batalla: canvas, repetición del registro, sprites, efectos | `vista` |
| Pantallas y estilo: hangar, editor de gambits, preparación, informe, mapa de sectores | `pantallas` |
| La campaña: sectores, escuadrón, permadeath, progresión, botín, guardado | `campana` |
| Servidor, balizas de ayuda y tablas | `servidor` |

## Reglas que no se cambian sin preguntarle

- **El combate es determinista.** Mismo escuadrón + misma misión + misma semilla = mismo combate en cualquier aparato.
  Todo el azar sale de `src/core/azar.js`; dentro del motor solo enteros. Si un cambio hace que una batalla guardada
  dé otro resultado, hay que subir `version_motor` en `data/reglas.json` (las balizas viejas lo detectan).
- **Los datos no van en el código.** Un número de balance o un texto del juego va en `data/`. Si falta un campo, se
  agrega al JSON y a `src/core/validar.js`.
- Ids en minúscula con guion bajo (`brazo_rifle`). **Un id publicado no se renombra** (rompe partidas y balizas):
  se agrega uno nuevo.
- Personalidades, traumas, cicatrices y estados de moral usan **el mismo formato de ganchos**. No se programa una
  personalidad a mano en el motor.
- La firma "Desarrollado por Juan M. Comparini" va en la portada.
- Menos palabras y más íconos; UI industrial y diegética; colores apagados con acentos de fósforo verde.
- **Nunca** publicar pruebas en el servidor de verdad: las pruebas usan `node servidor/local.mjs 8787`.

## Pruebas

Desde la raíz del repo, con Node 22:

- `npm test` corre todas.
- `node tools/validar-datos.mjs`: revisa que todos los JSON estén bien y que cada referencia exista. **Correrlo
  después de tocar cualquier cosa en `data/`.**
- `node tests/core.test.mjs`: el azar es repetible y la validación atrapa errores.
- `node tests/motor.test.mjs`: determinismo de cada tipo de misión, **huella de referencia** (si cambia sin querer, se
  rompió algo), ganchos de personalidad y campaña.
- `npm run balance`: `tools/simular.mjs` (cada misión por dificultad) y `tools/campana.mjs` (campañas enteras con piloto
  automático). Referencia actual: el piloto automático gana ~35% de las campañas y pierde ~4 pilotos por campaña.

Publicado en GitHub Pages: https://juanmcompa.github.io/MechaFighter/ (se actualiza solo con cada Push).

Para ver el juego en la compu hace falta un servidor local (los navegadores no leen JSON con doble clic):
`npx serve .` o `python -m http.server`, y abrir la dirección que muestra.
