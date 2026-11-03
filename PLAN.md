# Plan

## Hecho

- [x] Estructura del repo, reglas de trabajo (CLAUDE.md) y subagentes por área
- [x] Datos de ejemplo: 5 clases, 20 partes, 4 personalidades, 11 condiciones, 15 acciones, 6 enemigos, 5 misiones, 1 mapa
- [x] Núcleo: azar con semilla (`src/core/azar.js`), carga de datos congelados y validación de referencias
- [x] Pantalla de arranque que dice si los datos están bien y dibuja el mapa

## Próximo

- [ ] Motor, decisión: evaluar condiciones, aplicar ganchos de personalidad y elegir el gambit (con pruebas)
- [ ] Motor, resto: grilla, caminos, línea de tiro, disparos, moral, objetivos de misión, registro
- [ ] `tools/simular.mjs`: correr batallas por consola para balancear
- [ ] Vista: repetir el registro en canvas (formas simples primero, sprites después)
- [ ] Hangar y editor de gambits
- [ ] Campaña: mapa de sectores, reclutas, permadeath, informe con cicatrices y medallas, guardado
- [ ] Servidor (Cloudflare) y balizas de ayuda; tablas con puntajes verificados re-simulando

## Para decidir

- Arte: comprar los packs de referencia o generar propios (método BeastMixer)
- Nombre definitivo y logo
