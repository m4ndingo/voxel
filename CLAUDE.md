# CLAUDE.md

Índice, no manual. Detalle → `docs/*.md`, **a demanda**. Esto se inyecta cada turno ⇒ aquí solo lo que
**cuesta caro romper** + puntero. Vas a tocar un área → abre su `docs/` primero.

⛔ **TOPE 15 KB.** Al pasarse: el detalle se mueve **VERBATIM** a su `docs/*.md`, aquí queda regla +
enlace, nada se borra. Guardián `tests/test_claude_tamano.js`.
Estilo telegráfico **a propósito** (orden del dueño, 2026-08-13): denso > legible.

---

## 🗺️ MAPA — no navegar a ciegas

`web/app.js` = **14907 líneas / ~232 k tokens** ⇒ NO cabe, NO se lee entero. Localizar función →
**`SYMBOLS.md`** (`función → web/app.js:línea`; orden de regenerar en su cabecera, guardián
`tests/test_symbols_sync.js`). ! motor **mudado a `web/` el 2026-08-13**: `app.js:1234` de antes vale
como línea, pero el fichero es `web/app.js`.

- Poner bloque: `setVoxel` · `mcSetVoxel` · `mcSetBlock` · `mcCabeEnRejilla` · `mcPlace` ·
  `mcResolveMat`/`mcMatKey`. **Sin línea a propósito** (envejecen → sitio equivocado).
- Nombre corto de asset ← **`assets/index.json`**, ⛔ NUNCA de un `*.vox.json` (taberna = 283 k tokens >
  ventana). **Vetados al `Read`** (`.claude/settings.json`): `data/worlds/*.vox`, `data/mundo.vox`,
  `data/fotos/*.png`, los 3 assets grandes. Foto que te pasen por número → **`data/fotos/mini/<id>.png`**
  (800 px, ésa SÍ se lee; la escribe el navegador al sacarla, atrasadas con `herramientas/fotos_mini.py`).
- **Raíz mínima** (2026-08-13): `server.py`, `correr_tests.js`, `package.json`, `.md`. SITIO → **`web/`**
  (`.html`, `app.js`, `.css`); resto → `servidor/`, `herramientas/`, `performance/`, `docs/historico/`.
  Todo se lanza **desde la raíz** ⇒ su `__file__`/`__dirname` lleva `..`.
  **URL invariantes**: `Handler.translate_path` elige carpeta por el **1er tramo** (`assets`, `data`,
  `wiki`, `images` ← repo; resto ← `web/`) ⇒ `/server.py`, `/PLAN.md` ya no se sirven por HTTP. Carpeta
  nueva que pida el navegador → **a `RAIZ_URL` o 404**. Guardián `tests/test_sitio_raiz.js`.

**Tickets sin releer `PLAN.md`** (27 KB) → [`docs/repo.md`](docs/repo.md):
- Abiertos → **solo** el índice `PLAN.md:32` (14 líneas). ⛔ nada de `grep` al fichero entero.
- Uno concreto → su sección por el ancla `(#id)`. Contexto + capturas del dueño →
  **`data/tickets/<ID>/contexto.md`** (ésa es la puerta); los `*.png`, **uno a uno**.
- **2 ficheros**: `PLAN.md` = **solo abierto/pendiente** (2026-08-18: índice de cerrados y bitácora
  fuera); `PLAN_ARCHIVO.md` (900 KB) = todo lo cerrado, ⛔ no abrirlo entero. Cada sección
  necesita `<a id="-req-osd13"></a>` **explícito** antes del `###` o el enlace no salta. Guardián
  `tests/test_plan_enlaces.js`.

---

## 🚦 ARRANQUE

1. ⛔ **NUNCA borrar de `data/habitantes/` ni `data/agentes/`** — autoría del dueño, no runtime. Ni
   `DELETE` ni `rm`; sobrante → `data/habitantes_trash/<ms>__<nombre>`. Igual notas del Mundo (se añade
   `[PROCESADA]` debajo, no se reescriben) y `data/tickets/`. Duda → preguntar.
2. El trabajo entra por **`PLAN.md`** (índice `PLAN.md:32`). Cerrar ticket = **mover** su sección **y**
   su fila a `PLAN_ARCHIVO.md` + **1 commit por ticket**.
3. Servidor primero: `python3 server.py 8500` (antes `pgrep -af server.py`). Plantar/estampar de prueba →
   **`/map/test`**, ⛔ nunca `/map/default` ni `/map/agents`; lo que ya hay ahí **no se borra**.
4. **129 tests** en `tests/` (113 Chromium real vía Playwright vs `http://localhost:8500`, 16 Node puro).
   Runner `node correr_tests.js --node | --area=X | --list`; **corre solo tu área**. ! **desde la raíz**
   (leen `data/…`, `assets/…` relativos al cwd). ! test que entre por `/` → **`?noauto=1`**, o el
   autoarranque del dueño lo lleva a otro mapa y falla con un error que no se parece a la causa. Clon
   nuevo: `npm i && npx playwright install chromium` (clavado 1.47.2; 1.48+ pide Node 20).
5. Las 2 más caras (secciones abajo): `app.js` **no se toca para cambiar agentes**; un snippet del Mundo
   tiene **2 copias vivas** ⇒ `parche_snp_*.py` idempotente por ancla, **jamás reescribir entero**.

---

## Qué es

**VoxelForge** = editor de objetos vóxel (`/`) + motor de mundo estilo Minecraft (`/map/<nombre>`) en
**WebGL a pelo, sin three.js**, misma página, mismo modelo, mismo catálogo. Front **sin build ni
dependencias**; backend Python stdlib. Roadmap → `PLAN.md`.

`docs/` = 1 fichero por área (`ls docs/`); cada sección de abajo enlaza el suyo. Sin enlazar:
`servidor-y-apis` (APIs de `server.py`), `historico/` (diseño superado, trazabilidad).

**Editor** → [`docs/editor.md`](docs/editor.md). **Un solo modelo**: `state.voxels` = `Map` disperso
`"x,y,z" → color`; Capas/iso/3D son lecturas de ese `Map`. 2 reglas caras: `caras` es máscara del
**OBJETO**, no del voxel (`caraMask` = lo PINTADO vs `caraMaskRaw` = lo GUARDADO; confundirlas ES el
bug); historial **por gesto** (`beginGesture`/`endGesture`, o `edit(fn)`).

## Agentes / NPC — ARQUITECTURA (leer antes de tocar nada)

⛔ **NO SE MODIFICA `app.js` (EL FRAMEWORK) PARA CAMBIAR AGENTES**, salvo imposible **y aprobado por el
dueño**. `app.js` es **AGNÓSTICO** a cómo son/se comportan. Orden: **1** librería
`data/snippets/base-npc-skills.json` (si sirve a >1 agente) → **2** snippet del propio agente (si es muy
suyo) → **3** `app.js` solo si 1 y 2 imposibles, **preguntando antes**. Los snippets corren con
`AsyncFunction` en ámbito global ⇒ **alcanzan los internos** (`mc`, `mcAgentMesh`, `mcSurfaceY`…) sin
modificar nada. Comportamiento esperado → [`docs/REGLAS_AGENTES.md`](docs/REGLAS_AGENTES.md).

### Mínimo antes de [`docs/agentes.md`](docs/agentes.md)

- **2 sistemas, no sinónimos**: `mc.agents` (NPC-cubo 1×1×1, `game.defineAgent`) vs `game.esqueletos`
  (rigs articulados de estructuras finas). Zombie = lo 2º ⇒ **no** sale en `npcs[]` del diagnóstico de
  atasco sino en `piezas[]`. Y `game.agentes` ≠ `game.esqueletos`: los 1os = **documentos guardados**
  (`data/agentes/<id>.json`, ahí se edita el bicho), los 2os = lo **vivo en este mundo**. Guardar no
  planta; plantar no guarda.
- Toda operación sobre instancias de un rig empieza por **`readquirir(rig)`**: `mcRestampAll` **sustituye
  cada objeto** de `mc.structures` ⇒ trabajar por referencia falla **en silencio** (BUG-AG3).
- Piezas de rig = `efimera` (fuera de `mundo.json` y del deshacer); **`crearEsqueleto` las rehace campo a
  campo** ⇒ todo campo nuevo hay que traerlo ahí **explícitamente**.

## Rejilla / estructuras / materiales → [`docs/rejilla-y-estructuras.md`](docs/rejilla-y-estructuras.md)

Un material vive en **1 de 2 sitios y hay que mirar los dos**: `mc.grid` (terreno, fundido en malla de
chunk) vs `mc.structures` (pieza estampada = **1 draw call cada una**). Decide **si cabe en su celda**
(`mcCabeEnRejilla`), **no** el prefijo de la clave.

- `setVoxel` vs `game.stamp`: 200 hojas = **60 ms / 0 draw calls** por rejilla vs **385 ms / 200 draw
  calls** estampadas. Bosque → `setVoxel`.
- **Id sin namespace no identifica nada**: `hab:cable` ≡ `asset:assets/cable.vox.json` (mismo dibujo, otra
  puerta). ⛔ **ninguna tabla del motor lleva claves `hab:` a mano** (BUG-RS23, BUG-FLUID3) → usar
  `mcNombreMat`/`mcClaveDeNombre`. Atar pieza↔motor: **lo declara el dibujo** en su `meta` y el motor lo
  deriva del catálogo (REQ-TOOL1).
- **24 posturas se DERIVAN**: giro **en la clave** (`flor@7`), decodificar con `mcOriNorm`/`mcOriParts`,
  ⛔ nada de `(rot|0)&15` (BUG-RS7, BUG-RS8, BUG-ROT2).
- ⛔ **`mcSolid` no se parchea nunca** (lo comparten mallado + rayo + romper/poner); las demás preguntas →
  arrays propios (`mcSolidWalk`, `mcTapaCara`, `mc.finoRejilla`, `mc.traspasaLuz`, `mc.sinSombra`).
- ! `mcFineBoxHit`, `mcAimBoxHit`, `mcTerrenoChoca` se extraen **VERBATIM por texto** desde
  `test_rayo_apuntado.js` ⇒ refactorizarlas revienta el test con `ReferenceError`.

## Bloques con comportamiento → [`docs/bloques-comportamiento.md`](docs/bloques-comportamiento.md)

`game.bloques.define(clave, cfg)` cuelga del **MATERIAL**, nunca del voxel (1 script/voxel = 442 368
closures en 96×48×96). Vive entero en `data/snippets/mundo-autoarranque.json`; `app.js` solo expone la
capacidad. `game.bloques.info()` = descubridor de la clave EXACTA de lo que piso / tengo delante.

- **2 autoarranques y el global corre en TODOS los mapas**: `mundo-autoarranque` + justo después
  `mundo-<mapa>`. ! `arranque-<mapa>` es otra cosa: la **intro**, solo con `?intro=1`.
- **1 sola costura** = envoltorio sobre `mcUpdate`; reejecutar **desenvuelve el anterior por
  `mcUpdate._orig`** (apilar duplica la velocidad de trepado). **Si lo cambias → sube `VERSION`**. Estado
  en `mc` (`mc._parkour`, `mc._deslizVel`…), ⛔ nunca en closure.
- **El snippet se PARCHEA, no se reescribe** (dueño lo edita en vivo, **2 copias vivas**):
  `parche_snp_*.py` idempotente, ancla única, **aborta si el ancla no aparece exactamente 1 vez**.

## Física del jugador

- Parkour → [`docs/parkour.md`](docs/parkour.md); `game.parkour.estado()` dice **por qué** no engancha.
- Fluidos → [`docs/fluidos.md`](docs/fluidos.md). **Fuera del agua no cambia absolutamente nada**
  (condición del dueño, 1er test de los guardianes). ! `mcCaidaPaso(vy, dt, x, y, z, nadando, mira)` =
  **LA** pieza de arquitectura: `app.js` ofrece el paso de caída, lo llama quien tenga cuerpo (jugador +
  los **2** integradores del snippet). ¿Un 4º sitio que integre velocidad vertical? **llámala**. ¿La
  envuelves? **todos** los argumentos (comerse el 6º apaga el nadar, el 7º la mirada, **sin fallar
  nada**). ! `test_hundirse.js` y `test_nadar.js` están **en rojo a propósito** desde que el dueño retuneó
  las constantes = **BUG-FLUID5**, no regresión.
- Vuelo (`F`; foto → **`Alt+F`**) → [`docs/osd-e-intro.md`](docs/osd-e-intro.md): rama propia en
  `mcUpdate` **antes** de la de fluido, vertical **no pasa por `mcCaidaPaso`**.

## OSD e intro → [`docs/osd-e-intro.md`](docs/osd-e-intro.md)

Botón = **bloque con una nota**, identificado **por su texto** ⇒ una pantalla pasa de `{html:…}` a
`{mapa:'menu1'}` sin tocar ni una acción. **`game.osd.dump()` = el descubridor.**

- Acción de botón: **CERO parámetros**, se llama sin argumentos ⇒ el volcado imprime una **receta**
  copiable entera a F12. El dueño lo devolvió **3 veces** (REQ-OSD5).
- Pantalla-mapa = **`<iframe>` con `?osd=1`** (escaparate: no guarda, sin hotbar, sin captura de puntero)
  y **el iframe se destruye al cerrar** (`mc` es singleton ⇒ eso es otro contexto WebGL vivo).
- **Tamaño del panel se pide en `cfg`, ⛔ no se toca el CSS** (REQ-OSD13) y se aplica en **los 2** sitios
  de montaje (`mcOsdAbrir`, `mcOsdHtml`) o repintar un botón le cambia la talla.
- **`?intro=1` = única forma de disparar la intro**; vive en el snippet `arranque-<mapa>` o el genérico
  `arranque-intro`, ⛔ **nunca en `app.js`**; su bucle (`mc._intro`) se **desmonta antes de montar otro**.
  **Ni JUGAR ni CONSTRUIR recargan**: editor y Mundo son **la misma página** (`closeWorld()` /
  `mcVolverAIntro()`, ⛔ jamás `location.href`).

## Luz y sombra → [`docs/luz-y-sombra.md`](docs/luz-y-sombra.md)

**2 sombras distintas, confundirlas ES el bug**: **skylight** (horneado en el sombreado de cada vértice al
mallar, `mc.light`) vs **sombra proyectada del sol** (mapa de sombra en GPU).

- Poner un bloque **no recalcula la luz del mundo**: `mcRelightBox` trabaja en caja acotada y es
  **exacto**. `mcComputeLight` y `mcRelightBox` **usan los mismos predicados, sin excepción**, o el mundo
  editado deja de coincidir con el recién cargado → es lo que compara celda a celda
  `test_luz_incremental_navegador.js`.
- **Difusión ≠ siembra**: `mcTablaLuz()` = por dónde se propaga; `mcTablaCielo()` = hasta dónde baja la
  columna de cielo (`luz:'pasa'` **no** la abre). **Cambiarlas invalida las mallas cacheadas** aunque no
  se mueva un voxel: entran en la firma del chunk.

## Redstone → [`docs/redstone.md`](docs/redstone.md)

Dueño: **«todo lo de redstone va en ficheros aparte»**. Fuentes `.js` en `redstone/`;
`node redstone/make_snippets.js` publica **por `POST /api/snippets`** (⛔ no escribir el `.json` a mano:
así hay papelera + escritura atómica). **Cero líneas de `app.js`**: el motor no sabe qué es una antorcha,
es un intérprete de propiedades.

- Tocas un fuente de `redstone/` → **re-publícalo** o el mundo sigue con el snippet viejo.
- **Pieza ≤ 16³**: más de una celda y `mcCabeEnRejilla` la manda a `mc.structures`, donde no tiene celda,
  ni vecinos, ni señal (BUG-RS6, la puerta muda).
- `define('apagada', {encendida:'X'})` **registra TAMBIÉN `X`**, o la lámpara se enciende una vez y no
  vuelve jamás. Todo con **`precargar:false`**.

## Notas · iconos · wiki

- Carteles → [`docs/notas-y-fuente.md`](docs/notas-y-fuente.md): **se DERIVAN de `mc.notes`**, no son
  datos del mundo. Pixeloid nítida solo en **múltiplos de 9 px** (`MC_NOTE_TEXT_MIN=9`).
- Iconos (`/images`) → [`docs/iconos.md`](docs/iconos.md): verdad = **DIBUJO + `data/ui/ranuras.json`**;
  los `data/ui/<ranura>-<px>.png` son **derivados, ⛔ no se editan a mano nunca**. **Rasteriza el
  navegador**; `server.py` solo valida y escribe. Sin publicar, todo se ve como antes.
- Wiki (`/wiki`, manual de producto del dueño) → [`docs/wiki.md`](docs/wiki.md). ⛔ **NO se edita salvo
  que él lo pida.** Tu cambio la desfasa → 1 línea en [`wiki/PENDIENTE.md`](wiki/PENDIENTE.md) y sigues.
  En `api.json`, `fuente` lleva el **SÍMBOLO, nunca el número de línea**; `tests/test_wiki.js` comprueba
  que cada símbolo sigue existiendo.

## Convenciones → [`docs/repo.md`](docs/repo.md)

- Todo cambio de `state` acaba en `render()`. ! **`render()` no pinta: encola un rAF**; `setMode()` sí
  pinta **síncrono**. Los 2 seguidos rasterizan el modelo **2 veces** ⇒ llama **solo** a `setMode()`.
- Export: `{format:"voxelforge-1", size, meta, voxels:{...}}`. UI y comentarios: **español**.
- **Capturas de ticket → disco, no al chat**: `data/tickets/<ID>/` + `contexto.md` (un ticket se resuelve
  semanas después de abrirse). Las rescata `herramientas/guardar_imagenes_ticket.py`.
