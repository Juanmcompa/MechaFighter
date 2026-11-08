# Mecha Fighter

**Armá tu escuadrón de mechas, programalo y mirá cómo pelea solo.**

Auto-battler táctico sci-fi con progresión roguelite, para jugar en el navegador. Antes de cada misión equipás a cada
mecha por partes y le das órdenes del tipo *“si un aliado baja del 30% → repararlo”*. Después la batalla se juega
sola. Los pilotos tienen personalidad propia (un Cobarde puede desobedecerte y huir), ganan cicatrices, traumas y
medallas, y si mueren no vuelven.

Inspirado en *Mechabellum* (preparación táctica sin control en tiempo real), *Wartales* (escuadrón, moral, heridas),
*Door Kickers* (planificar antes de entrar) y los gambits de *Final Fantasy XII*.

**Jugar:** https://juanmcompa.github.io/MechaFighter/

## Estado

**MVP jugable** (Early Access). Una campaña de 3 sectores con mapa de nodos (contratos, taller, reclutas, señales,
descanso y un jefe por sector); 5 tipos de misión (defensa por oleadas, asalto, escolta, patrulla con niebla, duelo);
hangar con partes de mecha y editor de órdenes; batalla automática con pausa, velocidades y salto al final; informe con
experiencia, cicatrices, traumas, medallas, botín y muerte permanente; memorial de caídos; guardado automático.
Los gráficos son provisorios, dibujados con código. Ver [PLAN.md](PLAN.md).

## Editar el contenido

Todo está en `data/`, en archivos JSON con nombres en castellano: clases, partes de mecha, personalidades, gambits,
enemigos, misiones y mapas. Cada archivo arranca con una nota `_ayuda` que explica sus campos.

Después de editar, para ver si quedó bien:

```
node tools/validar-datos.mjs
```

o abrir el juego: la pantalla de arranque lista los problemas en rojo, diciendo en qué archivo y dónde.

## Correrlo en tu compu

Hace falta un servidor local (el navegador no lee los JSON con doble clic). Desde la carpeta del repo:

```
npx serve .
```

y abrir la dirección que muestra. Para las pruebas, con [Node.js](https://nodejs.org) 22 o más nuevo: `npm test`.

## Taller (herramienta local)

`admin.html` es el taller del desarrollador, para revisar todo antes de publicar. Con el servidor local corriendo,
abrir `http://localhost:3000/admin.html` (o la dirección que muestre) en **Chrome o Edge** y tocar
*Elegir carpeta del proyecto* (la carpeta MechaFighter): así lo que se guarda queda directo en los archivos, listo
para el commit. Sin carpeta, *Guardar* descarga el archivo.

- **Batalla de prueba:** escuadrón armado pieza por pieza contra las escuadras que elijas, en el mapa que elijas.
- **Sprites:** el mecha montado en grande, girando y caminando; carga arte nuevo (PNG de 32×32) para probarlo.
- **Piezas y datos:** alta, baja y modificación de piezas, enemigos, escuadras, clases, habilidades y misiones.
  Valida antes de guardar.
- **Textos e idiomas:** todas las frases del juego, con una columna por idioma (`data/idiomas/<código>.json`).
  Para jugar en otro idioma: `?idioma=en` al final de la dirección.

## Cómo está hecho

HTML, CSS y JavaScript sin dependencias ni compilación. El combate es **determinista**: mismo escuadrón, misma misión
y misma semilla dan siempre la misma batalla, en cualquier aparato. Eso permite repetir batallas, mandar una
**baliza de ayuda** para que un amigo intente salvar tu misión y que el servidor verifique los puntajes re-simulando.
Detalle en [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).

## Créditos

Diseño y desarrollo: **Juan M. Comparini**.

Fuentes: Pixelify Sans y VT323, con licencia SIL Open Font License (ver `fuentes/`).

Arte generado con IA (Nano Banana, de Google) a partir de los prompts de [docs/ARTE.md](docs/ARTE.md), y procesado para el juego con `tools/procesar_arte.py`.
