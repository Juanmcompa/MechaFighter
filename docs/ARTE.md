# Arte de Mecha Fighter

El arte se genera con Nano Banana (Google), igual que en BeastMixer, y después un script lo recorta y lo prepara para
el juego. Mientras una imagen no esté, el juego sigue dibujando su versión provisoria por código: se puede reemplazar
de a poco.

## Estado

| Hoja | Estado |
|---|---|
| `mecha-armado`, `mecha-partes-1`, `mecha-piernas`, `mecha-cabezas-mochilas`, `mecha-armas-1`, `mecha-armas-2` | ✓ en el juego |
| `retratos-1` (6 pilotos) | ✓ en el juego |
| `retratos-2` a `retratos-4`, `retratos-jefes` | falta |
| `terreno-texturas`, `terreno-coberturas`, `terreno-detalles` | ✓ en el juego (recorte con cajas fijas: `TERRENO_*` en el script) |
| Infantería, mutantes, vehículos, restos, efectos, íconos, medallas, marca | falta |

## Cómo se procesa

```
python3 tools/procesar_arte.py
```

Lee `arte/fuentes/` (JPG o PNG de Nano Banana), quita el magenta, separa las piezas, las achica a pixeles reales
de 8 bits, calcula dónde se engancha cada una (hombro, cadera) y hace las versiones roja y verde de las partes.
Escribe `assets/mecha/<color>/`, `assets/mecha/sprites.json` y `assets/retratos/`. Qué pieza es cuál, y de qué
tamaño va, está en `HOJAS` al principio del script. Si una hoja trae otra cantidad de piezas, el script avisa.

Al sumar hojas de retratos, subir `arte.retratos` en `data/reglas.json` (hoy 6).

## Reglas para todas las imágenes

- **8 bits** con la paleta común (ver abajo), píxeles grandes y duros.
- **Vista cenital de plano** (cámara en el techo mirando para abajo), sin perspectiva ni vista de 3/4.
- Las piezas miran **hacia ARRIBA** de la imagen (el juego las rota).
- **Fondo magenta plano (#FF00FF)** en todo lo que no sea pieza: así el script lo quita sin dudas.
- **Piezas separadas, con mucho espacio entre ellas**, en una sola fila salvo que se diga otra cosa. El script cuenta
  las piezas: si se tocan, falla.
- Sin texto, números, grilla, marcos ni sombras en el piso.
- La primera imagen de cada grupo define el estilo: en las siguientes **se adjunta esa primera** como referencia.
- No adjuntar las imágenes de referencia compradas o de otros juegos: el arte tiene que ser nuestro.
- Guardar cada resultado en `arte/fuentes/` con el nombre que dice cada prompt (en `.png`).

---

## Paleta y estilo (todo el juego)

**8 bits**, como los retratos: píxeles grandes y visibles, contorno de 1 píxel casi negro, sin degradés suaves ni
antialias, paleta cerrada. Los mechas de 32×32 píxeles, la infantería de 16×16 y las casillas de 32×32.

Paleta común (los azules son los mismos de los retratos, así todo combina):

| Uso | Colores |
|---|---|
| Contorno y sombras | `#0A0F2C` casi negro azulado |
| Pintura del jugador (azules) | `#1B2F7A` `#2E55C9` `#6F9BFF` `#D6E4FF` |
| Metal (grises) | `#2B2E33` `#4A4F57` `#7C838C` `#B8BEC6` |
| Acentos | amarillo `#F2C94C`, naranja `#E07B2A`, rojo `#C4473B`, verde `#5FB84A`, cian `#4FD6E8` |

El rojo de los enemigos y el verde salen del azul con el script (cambia solo los azules): las partes se generan una sola vez.

## 1. Partes de mecha

La IA dibuja mucho mejor un personaje cenital **entero** que piezas sueltas. Por eso son dos pasos: primero un mecha
armado, visto bien desde arriba; después se le pide que lo "despiece" usando esa imagen.

### 1A · Mechas armados — `mecha-armado.png` (define el estilo, va primero)

```
8-bit pixel art sprite sheet for a retro top-down shooter, like the overhead sprites of early GTA, Alien Breed or Chaos Engine. ORTHOGRAPHIC TOP-DOWN PLAN VIEW: the camera is on the ceiling looking straight down, as in a blueprint or a floor plan. We see only the TOP surfaces: the roof of the cockpit, the tops of the shoulders, the top of the weapons. We do NOT see any face, any front, any side, no legs standing below, no 3/4 view, no isometric angle.

Draw 3 small combat mechs, each one facing UP (front toward the top of the image), side by side in one row with lots of empty space between them:
1. LIGHT scout mech: narrow body, a rifle arm on each side, small round cockpit hatch, two small feet barely peeking out from under the body.
2. MEDIUM mech: square body, a rotary minigun on the right arm, a flat shield on the left arm, a backpack visible at the bottom edge.
3. HEAVY mech: wide body, a missile pod on each shoulder, caterpillar tracks visible on both sides.

Seen from above each mech reads as: body in the center, an arm on the LEFT and an arm on the RIGHT with the weapon barrels pointing UP, the cockpit hatch near the top, the backpack at the bottom.

Pixel art: each mech about 32x32 pixels, scaled up 8x with hard square pixels, 1-pixel near-black outline (#0A0F2C), no anti-aliasing, no gradients, flat shading with 2 tones, light from the top-left. STRICT PALETTE: blues #1B2F7A #2E55C9 #6F9BFF #D6E4FF for painted armor, greys #2B2E33 #4A4F57 #7C838C #B8BEC6 for metal, tiny yellow #F2C94C details.

Background: solid flat pure magenta (#FF00FF) everywhere. No ground, no shadows, no text, no labels, no grid.
```

Si sale en perspectiva o de frente, repetir sumando al principio: `Strictly from directly above, like looking down at a toy on a table from the ceiling.`

### 1B · Despiece — `mecha-partes-1.png` y `mecha-partes-2.png` (adjuntando `mecha-armado.png`)

```
Using the attached image as the exact reference (same 8-bit pixel art, same pixel size, same palette, same outline, same top-down plan view seen from directly above, everything facing UP), draw the following mech parts as SEPARATE pieces, NOT assembled, in one row from left to right with lots of empty magenta space between them, so no piece touches another:

[PIEZAS]

Every piece keeps exactly the same scale it has on the assembled mechs. Background solid flat pure magenta (#FF00FF). No shadows, no text, no labels, no grid.
```

| Archivo | [PIEZAS] |
|---|---|
| `mecha-partes-1.png` | 1. LIGHT body (no arms, no head, no legs). 2. MEDIUM body. 3. HEAVY body. 4. Small round COCKPIT HATCH with a cyan visor. 5. Angular COCKPIT HATCH with a yellow targeting lens. 6. Pair of FEET seen from above (one piece). 7. Pair of CATERPILLAR TRACKS (one piece). 8. Pair of digitigrade SPRING LEGS with claws (one piece). |
| `mecha-partes-2.png` | Each arm with the shoulder joint at the BOTTOM and the weapon pointing UP: 1. RIFLE arm. 2. ROTARY MINIGUN arm. 3. RAILGUN arm with cyan coils. 4. FLAMETHROWER arm with an orange fuel tank. 5. VIBRO BLADE arm. 6. MISSILE POD arm with red tips. 7. SHIELD arm (flat plate). |
| `mecha-mochilas.png` | Each BACKPACK seen from above, attaching edge at the TOP: 1. REPAIR pack with a green cross. 2. JETPACK with two nozzles. 3. AMMO box with a belt. 4. folded TURRET pack. |

## 2. Retratos de pilotos

Cuatro hojas de 6 retratos (24 en total), más una de jefes. Paleta cerrada de azules: así todos combinan, y el juego
puede mostrar a un caído en gris o a un herido en rojo sin dibujar otra versión.

### 2A · Primera hoja — `retratos-1.png` (define el estilo)

```
Pixel art character portraits for a retro sci-fi tactical game, in the style of 1990s DOS strategy games. A sheet of 6 portraits arranged in a grid of 3 columns and 2 rows, each portrait in its own square frame, separated by thick solid magenta (#FF00FF) gutters, with a magenta border around the whole sheet.

Each portrait: head and shoulders of a mech pilot, front view, slightly turned, dramatic lighting from the top-left, dark navy background inside the frame. Every pilot wears a small comm implant or headset with a tiny light on the head. Gritty, serious, weathered faces.

STRICT PALETTE: only 5 colors, all blues: near-black navy (#0A0F2C), dark blue (#1B2F7A), mid blue (#2E55C9), light blue (#6F9BFF) and pale highlight (#D6E4FF). No other colors at all. Visible chunky pixels (about 48x56 pixel art per portrait, scaled up with hard edges), dithering allowed.

The 6 pilots, left to right, top to bottom:
1. Middle-aged man, shaved head, scar across the cheek, stubble.
2. Young woman, short undercut hair, sharp eyes.
3. Big bald man with a thick beard and a broad neck.
4. Woman with long straight dark hair, calm expression.
5. Young man with a buzzcut and a square jaw.
6. Woman with a cybernetic eye implant and braided hair.

No text, no names, no numbers.
```

### 2B a 2E · Las demás hojas (adjuntando `retratos-1.png`)

```
Using the attached image as the exact style reference (same pixel art style, same 5-color blue palette and nothing else, same frame layout of 3 columns by 2 rows, same magenta gutters and border, same lighting and comm implant detail), draw 6 NEW different mech pilots:

[PILOTS]

No text, no names, no numbers.
```

| Archivo | [PILOTS] |
|---|---|
| `retratos-2.png` | 1. Older woman with grey short hair and deep wrinkles. 2. Young man with curly hair and freckles. 3. Man with a mohawk and a nose piercing. 4. Woman with a buzzcut and a burn scar on the neck. 5. Thin man with glasses and a nervous look. 6. Muscular woman with a high ponytail. |
| `retratos-3.png` | 1. Man with long hair tied back and a goatee. 2. Woman with afro hair and a confident smile. 3. Old man with a white mustache and a cap. 4. Young woman with bangs and a bandage on the forehead. 5. Man with a metal jaw implant. 6. Woman with a shaved side and tattoos on the neck. |
| `retratos-4.png` | 1. Teen-looking young man with messy hair (an adult, just young). 2. Woman with short curly hair and earrings. 3. Heavyset man with a double chin and a friendly face. 4. Woman with an eyepatch. 5. Man with dreadlocks and a headband. 6. Androgynous pilot with a tight hood and a breathing mask hanging. |
| `retratos-jefes.png` | Enemy leaders, more menacing: 1. Pirate captain with a scarred face and a cybernetic eye. 2. Raider with a skull-painted helmet. 3. Mutant cult leader with grotesque swollen skin. 4. Mercenary commander with a gas mask. 5. Arsonist with burn scars and goggles. 6. Old warlord with a long braided beard. |

---

## 3. Enemigos

### 3A · Infantería — `infanteria.png` (adjuntar `mecha-armado.png` como referencia de estilo)

```
Using the attached image as the style reference (same 8-bit pixel art, same pixel size, palette, outline, lighting, top-down plan view seen from directly above, and magenta background), draw 4 separate top-down soldier sprites, strictly top-down view, each facing UP, in one row with lots of space between them. Each soldier is seen from directly above: helmet, shoulders and the weapon held forward pointing UP. Small scale: about 16x16 pixels each, half the size of a mech. Use rusty red #C4473B and browns instead of blue.
1. RAIDER with a rifle, rusty red-brown armor.
2. ARSONIST with a flamethrower and a fuel tank on the back.
3. RAIDER with a submachine gun and a bandana.
4. HEAVY RAIDER with a big shoulder-mounted rocket launcher.
Background solid flat pure magenta (#FF00FF). No shadows, no text.
```

### 3B · Mutantes (como las bestias de BeastMixer) — `mutante-rastrero.png` y `mutante-escupidor.png`

```
Using the attached image as the style reference (same 8-bit pixel art, same pixel size, palette, outline, lighting, top-down plan view seen from directly above, and magenta background), draw the body parts of a [MUTANT] as SEPARATE pieces, not assembled, with lots of empty space between them, in one row from left to right, strictly top-down view facing UP:
1. HEAD seen from above, with a short neck stub at the bottom.
2. TORSO seen from above, without head or legs.
3. FRONT LEG: one single front limb, attached end at the top.
4. BACK LEG: one single hind limb, attached end at the top.
Details: [DETAILS]
Background solid flat pure magenta (#FF00FF). No shadows, no text, no grid.
```

| Archivo | [MUTANT] | [DETAILS] |
|---|---|---|
| `mutante-rastrero.png` | FAST CRAWLING MUTANT | lean sickly green body with exposed ribs and pustules; head with wide jaws full of yellowed teeth and small glowing yellow eyes; long clawed limbs |
| `mutante-escupidor.png` | BLOATED SPITTING MUTANT | swollen pinkish-flesh body with stitches and acid sacs; head with a big round mouth dripping green acid; short thick limbs |

### 3C · Torreta y transporte — `vehiculos.png`

```
Using the attached image as the style reference (same 8-bit pixel art, palette, outline and top-down plan view), draw 3 separate pieces, strictly top-down view, facing UP, in one row with lots of space between them:
1. TURRET BASE: a square armored base with four small stabilizer legs.
2. TURRET GUN: a small rotating gun head with a twin barrel pointing UP.
3. ARMORED TRANSPORT: a long six-wheeled cargo truck seen from above, sand-yellow cargo bed with crates, blue armored cabin at the top.
Background solid flat pure magenta (#FF00FF). No shadows, no text.
```

---

## 4. Restos — `restos.png`

```
Using the attached image as the style reference (same 8-bit pixel art, palette, outline and top-down plan view), draw 5 separate top-down debris pieces on the ground, in one row with lots of space between them:
1. Small destroyed mech wreck: scattered blue armor plates and a broken frame, burnt black edges.
2. Medium destroyed mech wreck, more scattered pieces and some smoke stains.
3. Heavy destroyed mech wreck, torn thick armor and an exposed reactor.
4. A fallen soldier seen from above, lying down, gear scattered (no blood).
5. A dead mutant splatter: flattened green body with acid puddle.
Background solid flat pure magenta (#FF00FF). No text.
```

## 5. Efectos — `efectos.png`

```
Using the attached image as the style reference (same 8-bit pixel art, palette, outline and top-down plan view), draw a row of separate visual effect frames for a top-down game, with lots of space between them, each roughly square:
1-6. EXPLOSION animation in 6 frames from left to right: tiny flash, growing fireball, big fireball, fireball breaking into smoke, dark smoke cloud, fading smoke wisps.
7. MUZZLE FLASH pointing UP.
8. IMPACT SPARKS burst.
9. FLAME BURST (a cone of fire pointing UP).
10. SMALL MISSILE pointing UP with a short flame trail.
11. ACID SPIT GLOB, bright green.
Background solid flat pure magenta (#FF00FF). No text, no numbers.
```

## 6. Terreno (tileset de los mapas)

Los mapas se arman con letras en `data/mapas/*.json` y cada letra es una casilla. Por eso el terreno va en **piezas
cuadradas** y no como un fondo pintado: cualquier mapa nuevo que se escriba con letras queda vestido solo.

Tres hojas, en este orden. La primera define el estilo del terreno; en las otras dos se adjunta esa primera.

- **Colores apagados, verde grisáceo**, más oscuros que los mechas: el piso no compite con las unidades (azules y rojas).
- **Sin sombras proyectadas**: las pone el juego, para que todas caigan para el mismo lado.
- El juego dibuja el borde entre muro y piso; los muros solo necesitan su "techo".

### 6A · Texturas que se repiten — `terreno-texturas.png` (define el estilo)

```
8-bit pixel art TILESET for a retro top-down tactical game set in a derelict industrial space outpost. ORTHOGRAPHIC TOP-DOWN PLAN VIEW, camera directly above looking straight down, no perspective, no isometric angle, no visible walls sides.

A sheet of 8 SQUARE tiles in a grid of 4 columns and 2 rows. Every tile is exactly the same size: 32x32 pixel art, scaled up 8x with hard square pixels (256x256 each). Tiles are separated by thick solid magenta (#FF00FF) gutters, with a magenta border around the whole sheet.

Every tile must be SEAMLESS: its left edge continues into its right edge and its top edge into its bottom edge, so it can repeat in a grid with no visible seams. No object, crack or detail may touch or cross the tile edges except the continuous pattern itself.

Row 1:
1. METAL FLOOR: dark riveted steel plates, subtle panel seams, a little wear.
2. METAL FLOOR VARIANT: same plates with a few scratches and one small bolt cluster, same colors.
3. FLOOR GRATE: metal grating with dark gaps showing depth below.
4. CONCRETE FLOOR: worn concrete with faint cracks and stains.
Row 2:
5. WALL TOP: the flat roof of a thick industrial wall seen from above, heavy riveted plating, slightly lighter than the floor.
6. WALL TOP VARIANT: same wall roof with pipes and a small vent running across it.
7. ACID POOL: glowing toxic green liquid with a few bubbles, darker green edges blending into the liquid (the whole tile is liquid).
8. HAZARD FLOOR: steel floor with diagonal yellow and black hazard stripes, worn paint.

STRICT LIMITED PALETTE, muted and desaturated so units stand out on top: dark greens and grey-greens #0E1712 #1A261E #2B3A30 #3F5245 #5E7564 #8A9E8C, rust #6B4A2F, worn yellow #C9A83C, black #070B08, toxic green #7FE05A only for the acid. 1-pixel dark outlines only where needed, no anti-aliasing, no gradients, no drop shadows, light from the top-left.

No text, no numbers, no labels, no grid lines inside the tiles.
```

### 6B · Coberturas — `terreno-coberturas.png` (adjuntando `terreno-texturas.png`)

Cada objeto ocupa **una casilla** y se apoya sobre el piso. Los de media cobertura son bajos; los de cobertura total,
altos y macizos.

```
Using the attached image as the exact style reference (same 8-bit pixel art, same pixel size, same muted grey-green palette, same top-down plan view seen from directly above), draw 8 separate OBJECTS for the same industrial outpost, in one row from left to right, with lots of empty magenta space between them so no object touches another.

Each object fits inside one 32x32 pixel tile (scaled 8x) and is seen strictly from directly above: we see its TOP, not its sides.

LOW COVER (soldiers crouch behind them):
1. Stack of 2 wooden supply CRATES with metal corners.
2. Group of 3 metal BARRELS, one with a hazard symbol on the lid.
3. Curved row of SANDBAGS.
4. Low concrete JERSEY BARRIER with yellow paint stripes.
HIGH COVER (they block line of sight):
5. Section of a big rusty SHIPPING CONTAINER roof with corrugated lines.
6. Thick square concrete PILLAR top with exposed rebar.
7. Industrial GENERATOR seen from above with cooling fans and cables.
8. Tall stack of steel girders and pipes.

No drop shadows, no ground under the objects. Background solid flat pure magenta (#FF00FF). No text, no labels, no grid.
```

### 6C · Detalles sueltos — `terreno-detalles.png` (adjuntando `terreno-texturas.png`)

Manchas y marcas que el juego desparrama sobre el piso al azar, así dos mapas iguales no se ven iguales.

```
Using the attached image as the exact style reference (same 8-bit pixel art, same pixel size, same palette, top-down plan view), draw 10 small separate FLOOR DECALS that will be placed on top of floor tiles, in one row from left to right with lots of empty magenta space between them. Each one fits inside a 32x32 pixel tile and leaves transparent space around its shape:
1. Dark OIL STAIN puddle.
2. Black SCORCH MARK from an explosion.
3. Spiderweb of CRACKS in the floor.
4. Scattered BOLTS and small debris.
5. Painted floor ARROW, worn white paint.
6. Painted large number "07" stencil, worn yellow paint.
7. Small square FLOOR VENT.
8. Tire and TRACK MARKS crossing.
9. Small cluster of BULLET CASINGS.
10. Small puddle of green ACID.
Background solid flat pure magenta (#FF00FF) everywhere around the shapes. No shadows, no labels.
```

Si en `terreno-texturas` alguna casilla no repite bien (se nota el corte), no hace falta regenerar todo: el script
recorta el centro de cada casilla y empareja los bordes.

## 7. Íconos — `iconos-1.png` a `iconos-4.png`

```
Pixel art icons for a retro sci-fi tactical game UI, 24x24 pixel art each scaled up with hard edges, phosphor green (#8FDC5A) on transparent, with darker green shading (#4F7A33) and a 1-pixel near-black outline. Grid of 6 columns, each icon separated by thick solid magenta (#FF00FF) gutters, magenta background everywhere else. One clear simple symbol per icon, readable at small size. No text.
Icons, left to right, top to bottom: [ICONS]
```

| Archivo | [ICONS] |
|---|---|
| `iconos-1.png` (clases, personalidades, nodos) | shield; crosshair; medical cross; dagger; wrench; running figure (fleeing); lightning bolt; fang; chain link; contract target; skull with horns (boss); wrench and gear (workshop); person with plus (recruits); radio signal with question mark; crescent moon (rest); empty |
| `iconos-2.png` (órdenes: acciones) | bullet; knife slash; burst of bullets (suppression); scope with dot (aimed shot); arrow forward; curved arrow around (flank); footsteps (follow); arrow backwards (retreat); low wall (take cover); anchor (hold); magazine (reload); wrench with sparkles (repair); small turret; rocket (jetpack); shield wall |
| `iconos-3.png` (órdenes: condiciones y objetivos) | infinity; crosshair; exclamation alert; lone figure; heart with plus; heart cracked; empty magazine; wall with figure behind; arrow hitting side; skull (morale); star (VIP); self figure; nearest enemy (figure with small arrow); weakest enemy (figure with broken bar); most dangerous enemy (figure with flame) |
| `iconos-4.png` (estados y recursos) | suppression lines; flames; electric EMP spark; hydraulic drop leak; entrenched shield; steady anchor; shaking figure; broken skull; credit chip; trophy; scar; brain with crack (trauma); bandage; tombstone; weight; dice |

## 8. Medallas — `medallas.png`

```
Pixel art military medals for a retro sci-fi game, 4 medals in one row with lots of space between them, front view, ribbon at the top, metal medal at the bottom, chunky pixels with hard edges and dark outline:
1. "Steel Heart": silver heart-shaped medal on a red ribbon.
2. "Hawk Eye": gold medal with a stylized eye on a blue ribbon.
3. "Guardian Angel": white-silver winged cross on a green ribbon.
4. "Veteran": bronze star with laurel on a striped black-and-yellow ribbon.
Background solid flat pure magenta (#FF00FF). No text.
```

## 9. Marca

### Logo — `logo.png`

```
8-bit pixel art logo for a retro sci-fi tactical video game called "MECHA FIGHTER". Bold blocky pixel lettering: "MECHA" in off-white metal and "FIGHTER" in phosphor green (#8FDC5A), heavy dark outline, slight industrial stencil cuts, small rivets. Behind the letters, the top-down silhouette of a blue combat mech. Centered, wide format, solid flat pure magenta (#FF00FF) background. No other text.
```

### Ícono de la app — `icono.png`

```
8-bit pixel art app icon for a retro sci-fi game: a blue combat mech seen from directly above with two weapon arms, centered, chunky pixels with a 1-pixel dark outline, on a near-black green-tinted square background (#0D0F0B) with a thin phosphor green (#8FDC5A) border. Square, simple, readable at 48 pixels. No text.
```

---

## Orden sugerido

1. `mecha-armado.png` (define el estilo), después el despiece y las mochilas.
2. `retratos-1.png` (define el estilo de los retratos) y las demás hojas.
3. Enemigos, restos y efectos.
4. Terreno.
5. Íconos, medallas y marca.

Después de cada tanda, el script `tools/procesar_arte.py` las recorta, quita el magenta, calcula los anclajes y genera
los colores rojo y verde de las partes.
