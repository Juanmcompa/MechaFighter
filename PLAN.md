# Plan

## Hecho

- [x] Estructura del repo, reglas de trabajo (CLAUDE.md) y subagentes por área
- [x] Datos de ejemplo: 5 clases, 20 partes, 4 personalidades, 11 condiciones, 15 acciones, 6 enemigos, 5 misiones, 1 mapa
- [x] Núcleo: azar con semilla (`src/core/azar.js`), carga de datos congelados y validación de referencias
- [x] Pantalla de arranque que dice si los datos están bien y dibuja el mapa
- [x] Motor de combate determinista: gambits, ganchos de personalidad, moral, cobertura, línea de tiro, oleadas, niebla
- [x] Campaña: 3 sectores, nodos (contrato, taller, reclutas, señal, descanso, jefe), informe, permadeath, memorial
- [x] Hangar con partes por encaje y editor de órdenes; preparación; batalla repetida en canvas; informe
- [x] Simuladores de balance por consola (`npm run balance`)
- [x] Primer deploy en GitHub Pages
- [x] Arte 8 bits: mechas por partes, retratos y tileset de los mapas
- [x] Consola para el celular: batalla vertical, cámara que sigue la acción, hangar con pestañas
- [x] Personalidad: voces por personalidad, hoja de servicio, memorial que cuenta cómo cayó cada uno, nombre y marcas de bajas del mecha

## Próximo

- [ ] Arte que falta: infantería, mutantes, restos, efectos, más retratos
- [ ] Más personalidad: peculiaridades ocultas, vínculos y rivalidades que nacen en combate, personalidad que cambia
- [ ] Más mapas (hoy hay uno) y más enemigos
- [ ] Elegir quién va a cada misión y dónde se despliega cada uno
- [ ] Sonido
- [ ] Tutorial corto la primera vez
- [ ] Servidor (Cloudflare) y balizas de ayuda; tablas con puntajes verificados re-simulando

## Para decidir

- Nombre definitivo y logo
- Batalla en celular vertical: hoy el mapa queda chico; ¿rotarlo o pedir girar el teléfono?
