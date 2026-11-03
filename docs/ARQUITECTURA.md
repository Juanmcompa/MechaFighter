# MechaFighter: arquitectura

## Decisiones tomadas

| Tema | Decisión | Por qué |
| --- | --- | --- |
| Tecnología | HTML, CSS y módulos JS sin compilar ni dependencias | Igual que Shakedown y BeastMixer: se publica con un Push y lo prueba cualquiera |
| Contenido | Todo en `data/*.json`, con claves en castellano | Se puede editar a mano. `node tools/validar-datos.mjs` (y la pantalla de arranque) dicen si quedó algo mal |
| Tablero | Grilla de casillas discretas | Determinismo simple, A* barato, cobertura clara |
| Combate | Motor determinista: enteros, azar con semilla, orden fijo | Repetir batallas, balizas de ayuda y que el servidor verifique puntajes |
| Mechas | Armados por partes (cabeza, torso, piernas, 2 brazos, mochila) | Lo de BeastMixer: muchas combinaciones sin dibujar cada una; las partes se rescatan si muere el piloto |
| Pilotos | Clase + personalidad + cicatrices, traumas y medallas | El apego está en el piloto; el mecha es el equipo que se puede perder |
| Servidor | Cloudflare Workers + D1, como Shakedown | El juego anda entero sin servidor; el servidor suma tablas y balizas cortas |

## Carpetas

```
MechaFighter/
├── index.html, css/, fuentes/          pantallas y estilo
├── data/                               TODO el contenido (ver "Las tablas")
│   ├── indice.json                     qué tablas y mapas se cargan
│   └── mapas/*.json
├── src/
│   ├── main.js                         arranque
│   ├── core/                           compartido, sin pantalla: azar.js, datos.js, validar.js, bus.js
│   ├── motor/                          EL COMBATE. Puro: sin DOM, sin reloj, sin Math.random
│   │   ├── simular.js                  simular(datos, { mision, escuadron, semilla }) → { victoria, registro, resumen, huella }
│   │   ├── unidades.js                 arma los números de una unidad (piloto + partes, o enemigo)
│   │   ├── espacio.js                  grilla, caminos (BFS), línea de tiro, cobertura
│   │   ├── estado.js                   ayudas sobre el estado: orden fijo, conocidos, estados, moral
│   │   ├── decision.js                 condiciones, objetivos, ganchos y gambits → intención
│   │   ├── resolucion.js               movimientos, disparos, reparaciones, invocaciones
│   │   └── moral.js
│   ├── vista/                          SOLO lee el registro: repeticion.js (reproduce) y dibujo.js (placeholders)
│   ├── ui/                             app.js (cambia de pantalla) + una pantalla por archivo
│   ├── campana/                        partida.js (sectores, nodos, informe, permadeath), misiones.js, reclutas.js, guardado.js
│   └── red/                            baliza.js (códigos de batalla), tablas.js (puntajes)
├── servidor/                           worker.js, local.mjs, prueba.mjs (Cloudflare, como Shakedown)
├── tools/                              validar-datos.mjs, simular.mjs (batallas por consola, para balance)
├── tests/
└── agentes/                            un subagente por área (ver CLAUDE.md)
```

**Regla de dependencias:** `vista/`, `ui/` y `red/` usan `motor/` y `campana/`, nunca al revés. `motor/` solo usa
`core/` y los datos que recibe. Así cada subagente trabaja su carpeta sin leer el juego entero, y el servidor puede
importar el motor tal cual para verificar una batalla.

## Las tablas (`data/`)

Convenciones: ids en minúscula con `_`; porcentajes en enteros de 0 a 100; distancias en casillas; tiempos en ticks;
**nada de decimales**. Las referencias van siempre por id. Una clave que empieza con `_` es una nota para quien edita.

| Archivo | Qué tiene |
| --- | --- |
| `reglas.json` | Constantes: versiones, ticks máximos, tamaño del escuadrón, moral, cobertura, XP, permadeath, eventos |
| `clases.json` | Formación del piloto (Vanguardia, Tirador, Médico, Infiltrador, Ingeniero): bonificaciones, crecimiento, habilidades y gambits de fábrica |
| `partes.json` | Partes de mecha por encaje. El torso pone estructura y capacidad de peso; las piernas, velocidad; los brazos, armas o escudo; la mochila, consumibles |
| `afijos.json` | Prefijos y sufijos del botín (“Rifle M7 Calibrado de tambor”) |
| `personalidades.json` | Cobarde, Temerario, Sanguinario, Leal… como listas de **ganchos** |
| `gambits.json` | Catálogo del editor: condiciones (árboles), acciones, objetivos y funciones del motor |
| `habilidades.json` | Habilidades activas: enfriamiento, demora, efecto |
| `estados.json` | Suprimido, en llamas, EMP… y los estados de moral (firme, tembloroso, quebrado) |
| `cicatrices.json`, `traumas.json`, `medallas.json` | Lo que el piloto se lleva de cada misión |
| `enemigos.json` | Unidades (mecha, infantería, mutante) y escuadras |
| `misiones.json` | Plantillas de contrato: defensa, asalto, escolta, patrulla, duelo |
| `sectores.json` | Cómo se arma el mapa de nodos de la campaña |
| `nombres.json` | Para inventar reclutas |
| `mapas/*.json` | Grilla con letras, leyenda, apariciones y zonas |

### Un mecha en una partida (lo que guarda la campaña, no el catálogo)

```json
{
  "id": "p_7f3a",
  "piloto": {
    "nombre": "Rocío Sosa", "apodo": "Brasa", "clase": "tirador", "personalidad": "cobarde",
    "nivel": 3, "xp": 310, "vinculo": "p_2b91",
    "cicatrices": ["mano_temblorosa"], "traumas": [], "medallas": ["ojo_de_halcon"],
    "misiones": 6, "bajas": 14
  },
  "mecha": {
    "cabeza": "cabeza_optica", "torso": "torso_ligero", "piernas": "piernas_bipode",
    "brazo_izq": { "parte": "brazo_canon_riel", "afijos": ["calibrado"] },
    "brazo_der": "brazo_rifle", "mochila": "mochila_municion"
  },
  "gambits": [
    { "condicion": "enemigo_cerca", "parametros": { "casillas": 2 }, "accion": "replegarse", "objetivo": "lejos_de_enemigos" },
    { "condicion": "enemigo_a_rango", "accion": "disparar", "objetivo": "enemigo_mas_debil" }
  ]
}
```

### Ganchos: un solo mecanismo para personalidad, traumas, cicatrices, moral y afijos

El motor no sabe qué es un Cobarde: aplica sus ganchos. Por eso un trauma nuevo o una personalidad nueva se agregan
solo con datos.

| Tipo | Qué hace | Ejemplo |
| --- | --- | --- |
| `anular` | Si se cumple `cuando`, hace otra cosa en vez de sus gambits | Cobarde con vida < 25% → se repliega |
| `correr_umbral` | Mueve los números de sus condiciones | Cobarde: “vida < 30%” cuenta como “< 40%” |
| `subir_prioridad` | Sube acciones con cierta etiqueta en su lista | Temerario: ataques un lugar más arriba |
| `ignorar_condicion` | A veces (chance) no ve una condición | Temerario: 50% de ignorar “estoy a cubierto” |
| `cambiar_objetivo` | Cambia a quién apunta | Sanguinario: 70% va por el más débil |
| `correa` | No se aleja más de N casillas de alguien | Leal: pegado a su vínculo |
| `moral` | Cuánto le suma o resta un evento | Leal: −30 si muere su vínculo |

## El motor determinista

**Garantías:** todo el azar sale de `core/azar.js` (con `derivar('combate')`, `derivar('moral')`… cada sistema tira
de su propia secuencia); solo enteros; las unidades se procesan por iniciativa, después bando y después id; el motor no
conoce el reloj. `simular()` devuelve el resultado y el registro, y la vista lo reproduce a la velocidad que quiera.
Es lo mismo que hizo andar el duelo por link de BeastMixer y los fantasmas de Shakedown.

### Cada tick

```
1. MANTENIMIENTO  enfriamientos, estados (llamas, supresión), recargas, oleadas nuevas
2. PERCEPCIÓN     línea de visión y niebla: cada bando ve solo lo que ve
3. DECISIÓN       cada unidad viva, en orden fijo, produce una INTENCIÓN (todavía no aplica nada)
4. RESOLUCIÓN     se aplican todas juntas:
                    a. movimientos (dos a la misma casilla: gana más iniciativa, después id)
                    b. disparos, reparaciones y estados
                    c. muertes al final (dos pueden matarse a la vez)
5. MORAL          eventos del tick (aliado muerto, baja, explosión) → ganchos de moral → cambios de estado
6. OBJETIVOS      ¿se cumplió alguna condición de victoria o derrota?
7. REGISTRO       los eventos del tick
```

Decidir y resolver por separado hace que nadie decida con algo que “ya cambió” en el mismo tick: el orden de proceso
no da ventajas escondidas.

### Cómo decide cada unidad (fase 3)

```
A. ANULACIONES   Junta los ganchos "anular" de personalidad + traumas + estado de moral, los ordena por prioridad
                 y toma el primero cuyo "cuando" se cumple. Si hay uno, ESA es la intención, y se registra el motivo
                 para que el jugador vea que el Cobarde desobedeció.
                       ↓ si ninguno aplica
B. LISTA EFECTIVA Copia la lista de gambits (los del jugador o los de fábrica) y le aplica correr_umbral,
                 subir_prioridad e ignorar_condicion. La lista original no se toca.
                       ↓
C. DE ARRIBA ABAJO (como Final Fantasy XII). Para cada gambit:
                   1. ¿se cumple la condición? (condiciones.js evalúa el árbol)
                   2. elige el objetivo (cambiar_objetivo puede cambiarlo)
                   3. ¿se puede hacer? enfriamiento, munición, alcance, línea de tiro, usos de mochila, correa
                   4. si todo da, esa es la intención. Si falla el 3, sigue con el próximo gambit
                       ↓ si nada aplica
D. POR DEFECTO   mantener posición y buscar cobertura
```

Las condiciones son árboles de JSON (`todos`, `alguno`, `no`, `dato`, `existe`, `fn`). Las `fn` son una lista cerrada
de funciones del motor (`a_tiro`, `en_cobertura`, `flanqueado`…): una nueva lleva código y prueba, y se anota en
`gambits.json › funciones`.

### Registro (lo que pasa del motor a la vista y a la campaña)

```json
{ "t": 42, "tipo": "anula", "unidad": "u3", "motivo": "huye_en_panico", "por": "cobarde" }
{ "t": 42, "tipo": "mueve", "unidad": "u3", "desde": [5, 7], "hasta": [4, 7] }
{ "t": 42, "tipo": "dispara", "unidad": "u1", "objetivo": "e2", "acierta": true, "danio": 14, "cobertura": "media" }
{ "t": 43, "tipo": "muere", "unidad": "e2", "por": "u1" }
```

## Servidor y balizas

Igual que Shakedown: Cloudflare Workers + D1, sin cuentas (cada aparato inventa una llave; el servidor guarda su
huella), topes por día y nada de direcciones de internet guardadas.

- **Baliza de ayuda.** El código de batalla lleva versión de datos y de motor, semilla, la misión armada y el escuadrón.
  Con servidor, el link queda corto (`#b=k7Qx2Mp`); sin servidor, va entero en el link. Quien lo abre arma un escuadrón
  de refuerzo, el motor re-simula la misma batalla con los refuerzos y, si se gana, los dos cobran.
- **Tablas.** Puntaje por misiones, recursos ahorrados y bajas. **Ventaja sobre Shakedown:** como el motor es puro,
  el Worker lo importa y **re-simula cada batalla antes de aceptar un puntaje**. No se puede inventar un resultado.

## Arte

Vista cenital 2D. Las imágenes de referencia marcan la dirección: mechas por partes en tres esquemas de color (azul,
rojo, verde), infantería con animaciones por arma (caminar, disparar, morir) y mutantes armados por piezas, con retratos
para las fichas. Esos packs son de Envato y las vistas previas tienen marca de agua: para usarlos hay que comprar la
licencia; si no, se generan propios con el método de BeastMixer (`tools/procesar_arte.py`: fondo magenta, recorte por
pieza y anclajes calculados). Mientras tanto la vista dibuja formas simples por código.

## Orden de trabajo

1. `core/` (azar, datos, validación) ✓
2. `motor/` completo + `tools/simular.mjs` ✓
3. `vista/`: repetición del registro en canvas, con dibujos provisorios ✓
4. `ui/`: portada, sectores, hangar con editor de gambits, preparación, batalla, informe, taller, reclutas, fin ✓
5. `campana/`: sectores, permadeath, progresión, botín, guardado ✓ (MVP publicado)
6. Arte final con Nano Banana (método BeastMixer) reemplazando `vista/dibujo.js`
7. `servidor/` + `red/`: balizas y tablas
