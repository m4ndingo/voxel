# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Esto es un ÍNDICE, no el manual.** El detalle vive en `docs/*.md` y se lee **a demanda**: este
fichero se inyecta en cada turno, así que lo que esté aquí se paga una y otra vez. Cada sección de
abajo lleva las reglas que **cuestan caro romper** y un puntero al documento con el resto. Si vas a
tocar un área, **abre su `docs/` primero**; si solo pasas por al lado, lo de aquí basta.

---

## 🗺️ MAPA RÁPIDO — para no quemar contexto navegando a ciegas

**`app.js` son 13 314 líneas / ~217 k tokens: NO cabe entero en la ventana y NO se lee entero.**
Para localizar una función usa **`SYMBOLS.md`** (mapa `función → app.js:línea`, ~2 k tokens, una sola
lectura reemplaza docenas de sondeos). Regenéralo si cambia:
`grep -nE '^[[:space:]]*(async )?function ' app.js`. Guardián: `node tests/test_symbols_sync.js`.

- **Poner/colocar un bloque:** `app.js:setVoxel(239)` · `mcSetVoxel(11756)` · `mcSetBlock(6354)` ·
  `mcCabeEnRejilla(6981)` · `mcPlace(10282)` · `mcResolveMat(11617)`/`mcMatKey(11595)`.
- **Nombre corto de un asset:** léelo de **`assets/index.json`** (22 KB, cubre los 70), **NUNCA** de un
  `*.vox.json` (taberna = 283 k tokens, más que una ventana entera; están vetados en
  `.claude/settings.json`).
- **Minas vetadas al `Read`** (binarios / blobs): `data/worlds/*.vox` (20 MB), `data/mundo.vox`,
  `data/fotos/*.png`, `releases/*`, los tres assets grandes. Verlo por otra vía (tamaño, `grep`, index).

**Flujo «revisar tickets → nuevo → implementar» sin releer `PLAN.md` entero** (6 559 líneas / ~181 k tokens):
- **Revisar abiertos:** lee **solo** el índice, `PLAN.md:74` (~108 líneas / ~8 k tokens, el 4 % del fichero).
  No hagas `grep`/`Read` del fichero completo para esto.
- **Implementar uno:** el detalle de cada ticket es una sección propia (mediana ~1 k tokens; ubícala por su
  ancla `(#id)` desde el índice, no leyendo alrededor). El **contexto y las capturas** del dueño viven en
  **`data/tickets/<ID>/contexto.md`** — ésa es la puerta, no barrer `PLAN.md`. Para el código, `SYMBOLS.md`.
- **Capturas del ticket:** `data/tickets/**/*.png` son 31 imágenes / 4,8 MB. Lee **la que necesites** para un
  ticket visual, nunca en bloque (una imagen cuesta miles de tokens).
- El índice de ABIERTOS solo lleva las filas vivas (12); los tickets cerrados están **archivados** más abajo
  en `## 🗄️ Tickets CERRADOS — archivo` (su detalle sigue en su sección, enlazado por `(#id)`). **Al cerrar
  uno, mueve su fila al archivo; al reabrirlo, devuélvela a ABIERTOS.** Así «revisar abiertos» cuesta ~1,3 k
  tokens en vez de ~8 k. (Purga de 2026-08-11: 82 filas cerradas movidas — el tachado se había quedado en 55.)

---

## 🚦 ARRANQUE — leer esto antes que nada

**1. ⛔ NUNCA borres de `data/habitantes/` ni de `data/agentes/`.** Son los dibujos y los agentes del
dueño: autoría irremplazable, no estado de runtime. Nada de `DELETE` ni de `rm`; lo que sobra se
mueve a `data/habitantes_trash/<ms>__<nombre>`. Lo mismo vale para las notas del Mundo (se les añade
`[PROCESADA]` debajo, no se reescriben) y para `data/tickets/`. Ante la duda, pregunta: no hay prisa
que justifique perder un dibujo.

**2. El trabajo entra por `PLAN.md`.** No lo leas entero (554 KB): el **índice de tickets abiertos**
está en `PLAN.md:74` y cada fila enlaza a su sección con el detalle. Un ticket se cierra editando su
sección **y** su fila, con **un commit por ticket cerrado**.

**3. Levanta el servidor antes de nada:** `python3 server.py 8500` (comprueba si ya está con
`pgrep -af server.py`). Lo que se planta o se estampa para probar va a **`/map/test`**, nunca a
`/map/default` ni a `/map/agents`, y lo que ya hay ahí **no se borra**.

**4. Sí hay tests: 106 `test_*.js` en `tests/`.** 93 abren un Chromium de verdad (Playwright +
SwiftShader) contra `http://localhost:8500`; 13 son Node puro. Hay runner
(`node correr_tests.js --node | --area=redstone | --list`) y cada fichero declara `@area` /
`@necesita`. **Corre solo los del área que tocas** — la suite entera tarda muchísimo.
⚠️ Los tests se escribieron **desde la raíz**: leen `data/…` y `assets/…` relativos al **cwd**, así
que se lanzan desde la raíz (`node tests/test_caras_mundo.js`), no desde dentro de `tests/`. El
runner ya lo hace. Lo que cuelga de `__dirname` lleva `..` por la mudanza.

⚠️ En un clon recién hecho **Playwright no está**: `node_modules/` está en `.gitignore`. Se instala a
mano y la versión importa (la 1.48+ pide Node 20):
`npm i -D playwright@1.47.2 && npx playwright install chromium`.

**5. Las dos reglas de arquitectura que más caro cuesta romper**, cada una con su sección más abajo:
`app.js` **no se toca para cambiar agentes** (§ «Agentes / NPC», es lo siguiente que hay que leer), y
un snippet del Mundo tiene **dos copias vivas** — se parchea con un `parche_snp_*.py` idempotente por
marca, nunca se reescribe entero.

---

## 📚 Índice de `docs/` — qué hay en cada uno y cuándo abrirlo

| documento | ábrelo si vas a tocar… |
|---|---|
| [`docs/editor.md`](docs/editor.md) | el **editor**: capas, vista 3D libre, herramientas (caras 🃏, pivotes 📍, extruir, seleccionar), historial, presets, salas, iso/miniaturas |
| [`docs/rejilla-y-estructuras.md`](docs/rejilla-y-estructuras.md) | `mc.grid` vs `mc.structures`, `atravesable`, geometría fina en la rejilla, las 24 posturas (`@ori`), el rayo de apuntado, `setVoxel` vs `game.stamp`, carga diferida de materiales |
| [`docs/bloques-comportamiento.md`](docs/bloques-comportamiento.md) | `game.bloques`: escaleras, trampolines, hielo/barro, `alPisar`, `mirar`, `seguir`, materiales en espera |
| [`docs/agentes.md`](docs/agentes.md) | `game.esqueletos`: rigs articulados, física del agente, empujón, shock, visión, ir montado encima, escala por instancia, el toast «Atascado» |
| [`docs/agentes-panel.md`](docs/agentes-panel.md) | la pestaña **Agentes**: formulario, preview, crear un bicho nuevo, «Guardar como…», retocar una pieza |
| [`docs/parkour.md`](docs/parkour.md) | agarrarse al canto y trepar (`game.parkour`) |
| [`docs/fluidos.md`](docs/fluidos.md) | agua y lava: hundirse, nadar, avanzar mirando, fuentes infinitas |
| [`docs/luz-y-sombra.md`](docs/luz-y-sombra.md) | skylight incremental, emisores en la rejilla, `luz:'pasa'/'tapa'`, materiales sin sombra |
| [`docs/redstone.md`](docs/redstone.md) | todo `redstone/`: motor, piezas, pistón, puerta, mapa de ejemplos |
| [`docs/notas-y-fuente.md`](docs/notas-y-fuente.md) | notas → carteles 3D, el texto horneado en la tabla, el panel `N`, la fuente Pixeloid |

---

## Qué es

**VoxelForge** — editor de assets **voxel** que ha crecido hasta tener un **Mundo** jugable. Son dos
mitades que comparten formato y conviven en `app.js`:

- **El editor** (`/`): se dibuja un objeto voxel (habitante, habitación, pieza) por capas o en 3D
  libre, y se guarda en la galería del servidor. Es de donde arrancó el proyecto.
- **El Mundo** (`/map/<nombre>`): un mundo de bloques en **WebGL crudo, sin three.js**, con chunks
  mallados, luz y sombras, física de jugador, agentes articulados, redstone y scripting por
  snippets. Es donde está hoy casi todo el trabajo.

⚠️ Partes de la documentación hablan todavía del proyecto como «un MVP de una sola pantalla con el
resto mockeado». Eso quedó atrás: las pestañas Habitantes / Habitaciones / Mapa son reales.

Front **sin build ni dependencias** (HTML/CSS/JS vanilla). Backend mínimo en Python:

```bash
python3 server.py 8500              # sirve el sitio + API de habitantes (0.0.0.0:8500)
#   (solo estático, sin guardar: python3 -m http.server 8500)
```

**API de habitantes** (`server.py`, almacén en `data/habitantes/<id>.json`, formato vox export):
`GET /api/habitantes` (lista con metadatos), `GET /api/habitantes/<id>` (objeto completo),
`POST /api/habitantes` (guardar; body vox, `id` opcional para sobrescribir → devuelve `{id}`),
`PATCH /api/habitantes/<id>` `{name}` (renombrar), `DELETE /api/habitantes/<id>`. En el front:
**Guardar** → POST (+copia en localStorage); `serverId` recuerda el id del objeto cargado/guardado;
la pestaña **Habitantes** y el botón *Galería* abren `#hab-modal` (tarjetas con miniatura iso vía
`drawThumb`, cargar/renombrar/borrar); `refreshHabitantesList` puebla la lista lateral.

**API de mapa** (`server.py`, almacén `data/mapa.json`): `GET /api/mapa` (mapa o default 8×8 vacío),
`POST /api/mapa` (valida mínimo, respalda con `to_trash`, guarda). Modelo:
`{cols,rows,cells:{"col,row":{room:<key>|null, habs:[{ref,x,y}]}}}`; `key` = `asset:<file>` |
`hab:<id>`. Front: pestaña/overlay **Mapa** (`#mapa-modal`, `openMapa`) = rejilla `cols×rows`; clic en
celda abre selector (`openPicker`) con el catálogo de habitaciones (`buildRoomCatalog` = assets `bloque`
+ guardadas) y miniaturas `drawThumb`; colocar/cambiar/quitar autoguarda (`saveMapa`). El mapa **nunca**
escribe en `data/habitantes/`. Roadmap completo y estados en **`PLAN.md`**.

**Listado de mundos** (`mapas.html` + `mundos.py`): `GET /map/` (y `/map`) sirve `mapas.html`, un listado de
todos los mundos con miniatura y estadísticas; **`/map/<nombre>` sigue sirviendo la SPA** (el mundo por
defecto es `/map/default`, **no** `/map/`). Los datos vienen de `GET /api/mundos` → `mundos.listar()`, que lee
`data/mundo.json` + `data/worlds/*.json`. La **miniatura** es una vista cenital sin render 3D: por columna
`(x,z)` se coge el voxel más alto y se pinta con el color **real** de su material —la media de la cara
superior de su textura (`color_de_material`, resuelve `tex:asset:…` y `tex:hab:…`)—, con luz rasante del
noroeste para el relieve. NO bajar el brillo con la altura: apaga todos los colores (las setas rojas de
`lab` salían grises). En frío cuesta ~1 s (33 MB de JSON) ⇒ **cache en `data/_thumbs/<slug>.json`**
invalidada por `mtime+tamaño` (en caliente, ~1 ms). Test: `node test_mapas.js`.

**Fotos del Mundo** (tecla **F**, el botón 📷 de los mandos táctiles, o `await game.foto()`). `mcFoto`
compone la captura y la sube; galería en `GET /fotos` (`fotos.html`) sobre `GET /api/fotos` ·
`POST /api/fotos` `{png:<base64>, ficha}` · `DELETE /api/fotos/<id>` (a papelera). Almacén:
`data/fotos/<n>_<mapa>_<fecha>.png` + un `.json` hermano con la misma ficha en crudo (para ordenar y
volver a las coordenadas sin leer la imagen). Tres cosas que no son obvias:
- ⚠️ **La captura es SÍNCRONA justo detrás de un `mcRender()` propio.** El canvas se crea sin
  `preserveDrawingBuffer` (`app.js:5425`), así que leerlo tras un `await`, un `setTimeout` o un
  `requestAnimationFrame` devuelve **negro**. Misma regla que los tests de navegador.
- **`toDataURL` y no `toBlob`**: `toBlob` es asíncrono y sacaría la escritura del portapapeles fuera
  del gesto de teclado que la autoriza. Del mismo base64 salen el POST y el `Blob`.
- **El portapapeles es un extra que casi nunca se cumple**: `navigator.clipboard` solo existe en
  contexto seguro y el Mundo se sirve por HTTP plano, así que abierto por IP no está (y para una
  imagen no vale el apaño de `execCommand` de `mcCopyTraceText`). Por eso el camino que siempre
  funciona es el servidor, y la ficha va **quemada en el PNG** para sobrevivir a copiar y pegar.

**Hay 79 `test_*.js`** en la raíz del repo (ver § ARRANQUE punto 4): 66 abren un Chromium de verdad
con Playwright contra `http://localhost:8500` —compilan el GLSL, así que valen para el Mundo— y 12
son Node puro. La API también se verifica con `curl` (`/api/mapa`, `/api/habitantes`).

## Arquitectura → [`docs/editor.md`](docs/editor.md)

`index.html` (3 columnas) + `app.js` (toda la lógica, sin frameworks) + `style.css` (tema oscuro).
El modelo es **uno solo**: `state.voxels`, un `Map` disperso `"x,y,z" → color`, con dimensiones
variables por objeto (`SX,SY,SZ`); todo lo demás (capas 2D, vista 3D libre, iso, miniatura, export)
son **vistas del mismo Map**. Lo que hay que saber antes de tocarlo:

- **Claves de primer nivel del `.vox.json`** que sobreviven al guardado sin tocar `server.py`
  (`POST /api/habitantes` hace `atomic_dump` del documento entero): `pivotes`, `caras`,
  `atravesable`. Añadir una más no requiere cambios en el servidor.
- **`caras` es una máscara del OBJETO, no del voxel**: mientras esté vacía se pinta todo; en cuanto
  hay **una sola** marca, lo no marcado se oculta. De ahí las dos lecturas —`caraMask` (lo que se
  PINTA) y `caraMaskRaw` (lo que está GUARDADO)— y confundirlas es el bug.
- **El rasterizador iso sin AA no se «sella» con strokes**: las caras adyacentes cubren píxeles
  complementarios exactos y cualquier solapa de canvas deja hilos.
- **Historial**: una entrada por gesto (`beginGesture`/`endGesture`, o `edit(fn)` para las atómicas).

El resto —herramienta de caras en 3D y en Capas, pivotes dibujados, extruir/tallar, `nearClip`,
presets y assets, salas nativas 112³ y `doorTrim`, `window.room`, `window.game`— está en el doc.

## Agentes / NPC — regla de arquitectura (LEER ANTES DE TOCAR NADA)

**NO SE MODIFICA `app.js` (EL FRAMEWORK) PARA HACER CAMBIOS EN LOS AGENTES**, salvo que sea
imposible de otra manera **y esté aprobado por el dueño del proyecto. `app.js` debe ser AGNÓSTICO a
cómo son o cómo se comportan los agentes.** Orden de prioridad para cualquier cambio de agente:

1. **Mejorar la librería de agentes** (`data/snippets/base-npc-skills.json`) si sirve a más de un agente.
2. **Añadir el código al propio snippet del agente** si es muy particular de él.
3. Tocar `app.js` — solo si 1 y 2 son imposibles, y **preguntando antes**.

**Planificador de agentes (`mcAgentsTick`, `app.js`)**: el presupuesto de CPU por frame
(`MC_AGENT_FRAME_MS`, 8 ms) se reparte **por turnos rotatorios** — el frame siguiente empieza por el agente
que se quedó sin turno, y ninguno puede pasarse de su rodaja (`presupuesto / nº de agentes vivos`). Antes se
recorría el `Map` en orden fijo y el primero se comía el presupuesto entero: con `game.agentSpeed=10` se
quedaban **a cero 4 de 6 agentes**, y a 100, 5 de 6 (medido). `game.agentSpeed` no tiene tope: el freno es el
tiempo, no el número de pasos.

Los snippets se ejecutan en ámbito global con `AsyncFunction`, así que **alcanzan los internos de
`app.js`** (`mc`, `mcAgentMesh`, `mcSurfaceY`…) sin necesidad de modificarlo — `base-npc-skills.json`
ya lo hace. Ejemplo de lo que se resuelve así: el cuerpo multi-celda de la serpiente son **agentes
extra pausados** (`autostart:false` + `pause()`), porque `mcAgentsTick` salta lo que no está
`'running'` pero `mcAgentsSmoothUpdate` solo salta `'stopped'` y el bucle de dibujo solo mira
`vbo && count`. Especificación de comportamiento: **`REGLAS_AGENTES.md`**.

### Lo mínimo antes de abrir [`docs/agentes.md`](docs/agentes.md)

- **Hay DOS sistemas de agente y no son sinónimos**: `mc.agents` (NPC-cubo 1×1×1, `game.defineAgent`,
  malla propia) y `game.esqueletos` (rigs articulados hechos de estructuras finas). Un zombie es lo
  segundo, así que **no** sale en el campo `npcs[]` del diagnóstico de atasco sino en `piezas[]`.
- **`game.agentes` ≠ `game.esqueletos`**: los primeros son los **documentos guardados**
  (`data/agentes/*.json`, qué bichos sabemos hacer), los segundos lo **vivo en este mundo**.
  Guardar no planta nada; plantar no guarda nada.
- **El bicho se edita en `data/agentes/<id>.json`**, no en el snippet que lo planta.
- **Las piezas de un rig son `efimera`**: no entran en `mundo.json` ni en el historial de deshacer.
- **`crearEsqueleto` rehace la pieza y el `seguir` campo a campo**: todo campo nuevo del documento
  hay que traerlo ahí explícitamente o no llega.
- **Toda operación sobre las instancias de un rig empieza por `readquirir(rig)`**: `mcRestampAll`
  **sustituye cada objeto** de `mc.structures` (mismo array, mismo número de elementos, ni uno es el
  de antes), así que trabajar por referencia falla en silencio (BUG-AG3).
- Tras tocar `server.py`, **reinícialo** (`python3 server.py 8500`): los endpoints nuevos dan 404
  hasta entonces, y eso se ve como «el snippet ya no planta nada».

El panel de la pestaña **Agentes** (formulario, preview, crear un bicho nuevo, guardar como…) está en
[`docs/agentes-panel.md`](docs/agentes-panel.md).

## Rejilla, estructuras finas y materiales → [`docs/rejilla-y-estructuras.md`](docs/rejilla-y-estructuras.md)

**Un material vive en UNO DE DOS SITIOS y hay que mirar los dos**: `mc.grid` (terreno, ids de paleta,
fundido en la malla del chunk) o `mc.structures` (pieza estampada, **un draw call cada una**). Lo que
decide es si **cabe en su celda** (`mcCabeEnRejilla`), no el prefijo de la clave. Reglas caras:

- **`setVoxel` vs `game.stamp`**: 200 hojas son 60 ms y 0 draw calls por la rejilla, frente a 385 ms y
  200 draw calls estampadas. Para un bosque, `setVoxel`; `game.stamp` es para lo que no cabe en una celda.
- **Un id sin espacio de nombres no identifica nada**: `hab:cable` y `asset:assets/cable.vox.json`
  son el mismo dibujo entrando por puertas distintas (exportar/importar cambia cuál). **Ninguna tabla
  del motor puede llevar claves `hab:` escritas a mano** — fue BUG-RS23 y BUG-FLUID3. Los ayudantes
  son `mcNombreMat(clave)` y `mcClaveDeNombre(nombre)`.
- **Las 24 posturas se DERIVAN, no se escriben a mano.** El giro va **en la clave** (`flor@7`), se
  decodifica siempre con `mcOriNorm`/`mcOriParts`, y **nada de `(rot|0)&15`**: ese recorte convierte
  en silencio una postura nueva en una vieja (costó BUG-RS7, BUG-RS8 y BUG-ROT2). La composición vive
  en un solo sitio, `mcOriMove`; quien no tenga la geometría delante pregunta por `mcOriPerm`.
- **Dos bitsets distintos**: `g.bits` = «¿me frena?» (colisión), `g.bitsAim` = «¿hay materia aquí?»
  (apuntar, romper). Un `atravesable` se cruza al andar y se sigue pudiendo romper de un clic.
- **`mcSolid` no se parchea nunca** (lo comparten mallado, rayo y romper/poner). Las otras preguntas
  sobre la misma rejilla van por arrays propios: `mcSolidWalk` (`mc.atraviesa`), `mcTapaCara`
  (`mc.recorte`), `mc.finoRejilla`, `mc.traspasaLuz`, `mc.sinSombra`.
- ⚠️ **Varias funciones de colisión se extraen VERBATIM por texto** desde `test_rayo_apuntado.js`, y el
  snippet las re-implementa: `mcFineBoxHit`, `mcAimBoxHit`, `mcTerrenoChoca`. Refactorizarlas
  (helpers nuevos, factorizar la rama `esc === 1`) revienta el sandbox del test con `ReferenceError`.

## Bloques con comportamiento → [`docs/bloques-comportamiento.md`](docs/bloques-comportamiento.md)

`game.bloques.define(clave, cfg)` cuelga el comportamiento del **MATERIAL**, nunca del voxel (un
script por voxel serían 442 368 closures en un mundo 96×48×96). Vive entero en el snippet
`data/snippets/mundo-autoarranque.json`; `app.js` solo expone la capacidad.

```js
game.bloques.define('hab:escalera', { trepable:true, subida:4, bajada:5 });
game.bloques.define('hab:placa',    { alPisar(c){ /* c.quien = 'jugador' | 'agente' */ } });
game.bloques.define('hab:muelle',   { impulso:12 });      // o altura:4
game.bloques.define('hab:hielo',    { velocidad:2, deslizamiento:1.2 });
game.bloques.info();   // ← el descubridor: la clave EXACTA de lo que piso / tengo delante
```

- **Una sola costura**: un envoltorio sobre `mcUpdate`. Reejecutar el snippet **desenvuelve el
  anterior por `mcUpdate._orig`**; apilar envoltorios duplica la velocidad de trepado y deja la tabla
  vieja mandando en el mundo mientras `lista()` enseña la nueva. **Si cambias el snippet, sube `VERSION`.**
- **El snippet se PARCHEA, no se reescribe**: el dueño lo edita en vivo y hay **dos copias vivas**.
  Se usa un `parche_snp_*.py` idempotente, con ancla única, que aborta si el ancla no aparece
  exactamente una vez.
- **El estado vive en `mc`, no en un closure** (`mc._pasoDesfase`, `mc._parkour`, `mc._deslizVel`):
  reejecutar el snippet a mitad de un gesto no puede dejar al jugador congelado o medio hundido.
- **`velocidad` no toca `game.playerSpeed`** (ese setter persiste en `localStorage`): se pisa
  `mc.speed` alrededor del `mcUpdate` original y se restaura en un `finally`.
- **Un material que aún no está en la paleta NO se rechaza**: se guarda **crudo** en lista de espera
  y se promueve solo cuando aparece. Rechazarlo tiraba la config entera en `/map/empty`.

## Física del jugador

- **Parkour** (agarrarse al canto y trepar) → [`docs/parkour.md`](docs/parkour.md). Encendido por
  defecto; `game.parkour.estado()` dice **por qué** no engancha un canto concreto.
- **Fluidos** (hundirse, nadar, avanzar donde miras, fuentes infinitas) →
  [`docs/fluidos.md`](docs/fluidos.md). **Fuera del agua no cambia absolutamente nada** — es la
  condición del dueño y el primer test de los guardianes.
  ⚠️ `mcCaidaPaso(vy, dt, x, y, z, nadando, mira)` es **la** pieza de arquitectura: `app.js` ofrece el
  paso de caída y quien tenga un cuerpo lo llama (el jugador y los **dos** integradores del snippet).
  Si añades un cuarto sitio que integre una velocidad vertical, **llámala**; y si la envuelves, pasa
  **todos** los argumentos (comerse el 6º apaga el nadar y el 7º la mirada, sin que nada falle).
  ⚠️ `test_hundirse.js` y `test_nadar.js` están **en rojo a propósito** desde que el dueño retuneó las
  constantes: es **BUG-FLUID5** en `PLAN.md`, no una regresión.

## Luz y sombra → [`docs/luz-y-sombra.md`](docs/luz-y-sombra.md)

**Hay DOS sombras distintas y confundirlas es el bug**: el **skylight** (oclusión ambiental horneada
en el sombreado de cada vértice al mallar, `mc.light`) y la **sombra proyectada del sol** (mapa de
sombra en GPU). Son caminos separados: uno vive en la malla y el otro en el fragment shader.

- Poner un bloque **no recalcula la luz del mundo**: `mcRelightBox` trabaja en una caja acotada y es
  **exacto**, no una aproximación (las celdas de fuera valen de condición de contorno).
  `mcComputeLight` (global) y `mcRelightBox` (incremental) **tienen que usar los mismos predicados,
  sin excepciones**, o el mundo editado deja de coincidir con el recién cargado — que es exactamente
  lo que compara celda a celda `test_luz_incremental_navegador.js`.
- **Difusión ≠ siembra**: `mcTablaLuz()` gobierna por dónde se propaga la luz; `mcTablaCielo()`, hasta
  dónde baja la columna de cielo. `luz:'pasa'` **no** abre la columna.
- **Cambiar estas tablas invalida las mallas cacheadas** aunque no se mueva un voxel (el sombreado va
  horneado), así que entran en la firma del chunk.

## Redstone → [`docs/redstone.md`](docs/redstone.md)

Petición explícita del dueño: **«todo lo de redstone va en ficheros aparte»**. Los fuentes son `.js`
normales en `redstone/` y `node redstone/make_snippets.js` los publica en `data/snippets/` **por
`POST /api/snippets`** (no escribiendo el `.json` a mano: así hay respaldo en papelera y escritura
atómica). **Cero líneas de `app.js`**, y el motor no sabe qué es una antorcha: es un intérprete de
propiedades (`emite`, `conduce`, `encendida`, `invertida`, `retardo`, `manual`, `pulso`, `mira`).

- **Si tocas un fuente de `redstone/`, re-publícalo** o el mundo sigue corriendo el snippet viejo.
- **Una pieza de redstone no puede pasar de 16³**: más de una celda y `mcCabeEnRejilla` la manda a
  `mc.structures`, donde no tiene celda, ni vecinos, ni señal (fue BUG-RS6, la puerta muda). Si
  necesita más, se **apila en celdas** y una manda sobre las otras.
- **`define('apagada', {encendida:'X'})` registra TAMBIÉN `X`** con la misma cfg, o la lámpara se
  enciende una vez y no vuelve jamás.
- **Todo va con `precargar:false`**: dar de alta un material que ese mundo no usa cuesta un
  `mcMeshAll` por carga y por cambio de nada.

## Notas, carteles y la fuente del juego → [`docs/notas-y-fuente.md`](docs/notas-y-fuente.md)

Cada nota de `mc.notes` planta `assets/cartel.vox.json` encima de su bloque. **Los carteles no son
datos del mundo: se DERIVAN de `mc.notes`** y van `efimera`, así que `mundo.json` sigue llevando solo
notas — no hay dos fuentes de verdad ni forma de que un cartel se quede huérfano. La fuente del juego
(Pixeloid) **solo se lee nítida en múltiplos de 9 px**, y de ahí salen `MC_NOTE_TEXT_MIN=9` y todos
los cuerpos de `--font-game`.

## 🧪 Batería de Pruebas y Runner (`correr_tests.js`)

El repositorio contiene **85 ficheros `test_*.js`** en la raíz. Cada fichero incluye una cabecera declarativa:
```javascript
// @area: redstone | agentes | caras | fisica | render | editor | materiales | general
// @necesita: node | servidor, playwright
```

Para ejecutar las pruebas se utiliza el runner CLI `correr_tests.js`:
```bash
node correr_tests.js --node               # ejecuta solo los tests de Node puro (~8.9s)
node correr_tests.js --playwright         # ejecuta solo los tests con Chromium / servidor
node correr_tests.js --area=redstone       # ejecuta tests de una o varias áreas
node correr_tests.js --list                # muestra el catálogo e inventario completo
```

El runner incluye comprobación *pre-flight* automática del servidor `:8500` y de `playwright` antes de arrancar los tests de navegador.

## Convenciones

- Cualquier cambio de `state` termina llamando a `render()` (= `drawEdit` + `drawIso` +
  `updateInfo` + `drawEdit3d` si `mode==='3d'`). Las sincronizaciones de UI puntuales usan
  `syncLayer` / `syncColor`.
  ⚠️ **`render()` no pinta: encola un rAF** (y coalesce con `_renderPending`). `setMode()`, en cambio,
  pinta **síncrono**. Llamar a los dos seguidos rasteriza el modelo **dos veces enteras**, y la segunda
  cae un frame más tarde: en un escritorio rápido ni se nota, pero con la CPU lenta y un modelo grande
  es un congelado de segundos que aparece *después* de que la página ya pareciera lista. Si hace falta
  pintar y además fijar el modo, llama solo a `setMode()`.
- El formato de export es `{format:"voxelforge-1", size, meta, voxels:{...}}`; import acepta ese
  objeto (`voxels` como mapa `"x,y,z" -> hex`).
- Idioma de UI y comentarios: **español**.
- **Las capturas de un ticket se guardan en disco, no se dejan en el chat.** Cuando el dueño abre un
  ticket adjuntando imágenes, van a `data/tickets/<ID>/` con un `contexto.md` al lado (fecha, uuid del
  mensaje y el enunciado literal), y el ticket de `PLAN.md` las enlaza por nombre de fichero. El
  motivo es de calendario: un ticket se abre hoy y se resuelve semanas después, cuando la conversación
  donde venían ya no está en contexto — y una captura descrita de memoria no es la captura. Se
  rescatan con `python3 guardar_imagenes_ticket.py <ID> [--uuid <prefijo>]`, que las saca del
  transcript de la sesión (`~/.claude/projects/-root/*.jsonl`, donde Claude Code las deja en base64)
  sin tener que pedírselas otra vez al dueño; `--listar` enseña los últimos mensajes con imagen. Si un
  mensaje abre **varios** tickets, las imágenes se guardan **una sola vez** y los demás apuntan a esa
  carpeta. `data/tickets/` está exceptuado en `.gitignore` a propósito: es autoría, como
  `data/agentes/`, no estado de runtime.
- **La documentación se escribe en `docs/`, no aquí.** `CLAUDE.md` se inyecta en cada turno: lo que se
  añada se paga en todos. Si una sección crece más de ~15 líneas, muévela a su `docs/*.md` y deja aquí
  el puntero con la regla que cuesta caro romper. Nada se borra al mover: se mueve verbatim.
- Al ampliar el MVP (p. ej. hacer reales las pestañas Habitaciones/Mapa), mantener el mismo
  `state.voxels`/serialización como fuente de verdad y añadir vistas nuevas sin duplicar el modelo.
