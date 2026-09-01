# CLAUDE.md

Índice, no manual. Detalle → `docs/*.md`, **a demanda**. Esto se inyecta cada turno ⇒ aquí solo lo que
**cuesta caro romper** + puntero. Vas a tocar un área → abre su `docs/` primero.

⛔ **TOPE 12 KB** (era 15; bajado el 2026-08-30 tras la poda: «*cada palabra cuesta tokens*»). Al
pasarse: el detalle se mueve **VERBATIM** a su `docs/*.md`, aquí queda regla + enlace, **nada se borra**.
Guardián `tests/test_claude_tamano.js`. Estilo telegráfico **a propósito** (dueño, 2026-08-13).

---

## 🗺️ MAPA — no navegar a ciegas

`web/app.js` = **25376 líneas / ~448 k tokens** ⇒ NO cabe, NO se lee entero. Localizar función →
**`SYMBOLS.md`** (`función → web/app.js:línea`; orden de regenerar en su cabecera, guardián
`tests/test_symbols_sync.js`). ! motor **mudado a `web/` el 2026-08-13**: `app.js:1234` de antes vale
como línea, pero el fichero es `web/app.js`.

Detalle (familia de `setVoxel`, raíz mínima, URL invariantes, tickets) →
[`docs/repo.md`](docs/repo.md). Lo que **cuesta caro** romper:

- Nombre corto de asset ← **`assets/index.json`**, ⛔ NUNCA de un `*.vox.json` (283 k tokens > ventana).
  Vetados al `Read` en `.claude/settings.json`. Foto por número → **`data/fotos/mini/<id>.png`**.
- SITIO = `web/`; la URL elige carpeta por el **1er tramo** ⇒ `/server.py` y `/PLAN.md` no se sirven.
  Carpeta nueva que pida el navegador → `RAIZ_URL` o 404. Guardián `tests/test_sitio_raiz.js`.
- Tickets: abiertos = **solo** el índice `PLAN.md:32`; uno concreto = su ancla; contexto y capturas =
  `data/tickets/<ID>/contexto.md`. ⛔ `PLAN_ARCHIVO.md` (900 KB) no se abre entero. Cada sección quiere
  su `<a id="…"></a>` explícito. Guardián `tests/test_plan_enlaces.js`.

---

## 🚦 ARRANQUE

0. 🥇 **LEY DE ORO** → [`docs/desarrollo-desacoplado.md`](docs/desarrollo-desacoplado.md).
   ⛔ **`app.js` NO se modifica hasta que el cambio esté validado antes por parcheo en caliente.** Nace
   **aislado** en un snippet `data/snippets/<id>.json` (JS **dentro** de `code`, ⛔ jamás un `.js`
   suelto), envuelve el motor guardando `fn._orig` y se manda con **`game.<modulo>.on()/off()`** —
   `off()` lo devuelve **byte a byte**. Solo tras demostrar estabilidad se gradúa, y **lo mínimo**.
1. ⛔ **NUNCA borrar de `data/habitantes/` ni `data/agentes/`** — autoría del dueño, no runtime. Ni
   `DELETE` ni `rm`; sobrante → `data/habitantes_trash/<ms>__<nombre>`. Igual notas del Mundo (se añade
   `[PROCESADA]` debajo, no se reescriben) y `data/tickets/`. Duda → preguntar.
2. El trabajo entra por **`PLAN.md`** (índice `PLAN.md:32`). Cerrar ticket = **mover** su sección **y**
   su fila a `PLAN_ARCHIVO.md` + **1 commit por ticket**.
3. Servidor primero: `python3 server.py 8500` (antes `pgrep -af server.py`). Plantar/estampar de prueba →
   **`/map/test`**, ⛔ nunca `/map/default` ni `/map/agents`; lo que ya hay ahí **no se borra**.
4. Tests → [`docs/repo.md`](docs/repo.md). `node correr_tests.js --node | --area=X | --list`, **solo tu
   área**, ! **desde la raíz**, ! test que entre por `/` → **`?noauto=1`**.
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

Mínimo antes de [`docs/agentes.md`](docs/agentes.md) (el detalle bajó allí):

- **2 sistemas, no sinónimos**: `mc.agents` (NPC-cubo) vs `game.esqueletos` (rigs articulados; el zombie
  es de éstos ⇒ sale en `piezas[]`, no en `npcs[]`). Y `game.agentes` (documentos guardados) ≠
  `game.esqueletos` (lo vivo aquí): guardar no planta, plantar no guarda.
- Tocar una instancia de rig empieza SIEMPRE por **`readquirir(rig)`**: `mcRestampAll` sustituye cada
  objeto ⇒ por referencia falla **en silencio** (BUG-AG3).
- Piezas de rig = `efimera`; **`crearEsqueleto` las rehace campo a campo** ⇒ campo nuevo, tráelo ahí.

## Rejilla / estructuras / materiales → [`docs/rejilla-y-estructuras.md`](docs/rejilla-y-estructuras.md)

Un material vive en **1 de 2 sitios y hay que mirar los dos**: `mc.grid` (terreno, fundido en malla de
chunk) vs `mc.structures` (pieza estampada = **1 draw call cada una**). Decide **si cabe en su celda**
(`mcCabeEnRejilla`), **no** el prefijo de la clave.

- Bosque → `setVoxel`, ⛔ no `game.stamp` (200 hojas: 60 ms/0 draw calls vs 385 ms/200).
- **Id sin namespace no identifica nada** (`hab:cable` ≡ `asset:assets/cable.vox.json`): ⛔ ninguna tabla
  del motor lleva claves `hab:` a mano → `mcNombreMat`/`mcClaveDeNombre` (BUG-RS23, BUG-FLUID3).
- **24 posturas se DERIVAN**: el giro va **en la clave** (`flor@7`) → `mcOriNorm`/`mcOriParts`, ⛔ nada de
  `(rot|0)&15` (BUG-RS7, BUG-RS8, BUG-ROT2).
- ⛔ **`mcSolid` no se parchea nunca** (mallado + rayo + romper/poner lo comparten); lo demás va a arrays
  propios (`mcSolidWalk`, `mcTapaCara`, `mc.finoRejilla`, `mc.traspasaLuz`, `mc.sinSombra`).
- ! `mcFineBoxHit`, `mcAimBoxHit`, `mcTerrenoChoca` se extraen **VERBATIM por texto** desde
  `test_rayo_apuntado.js` ⇒ refactorizarlas revienta el test con `ReferenceError`.

## Bloques con comportamiento → [`docs/bloques-comportamiento.md`](docs/bloques-comportamiento.md)

`game.bloques.define` cuelga del **MATERIAL**, nunca del voxel. Vive en
`data/snippets/mundo-autoarranque.json`; `app.js` solo expone la capacidad. Clave exacta de lo que piso →
`game.bloques.info()`.

- **2 autoarranques y el global corre en TODOS los mapas**: `mundo-autoarranque` y luego `mundo-<mapa>`.
  ! `arranque-<mapa>` es otra cosa: la **intro**, solo con `?intro=1`.
- **1 sola costura** sobre `mcUpdate`; reejecutar desenvuelve por `mcUpdate._orig` (apilar duplica el
  trepado). Lo cambias → **sube `VERSION`**. Estado en `mc`, ⛔ nunca en closure.
- **El snippet se PARCHEA, no se reescribe** (2 copias vivas): `parche_snp_*.py` idempotente, ancla única.

## Partículas y efectos → [`docs/particulas-y-efectos.md`](docs/particulas-y-efectos.md)

3 snippets, **0 líneas de `app.js`**: `sondas-mundo` (mundo por **FORMA**, no por celda) + `particulas-voxel`
(motor) + `efectos-demo` (7 efectos: nieve, lluvia, estrellas, chispas, polvo, hojas, humo).
- ⛔ `mcSolid` dice **celda**: lo que caiga se posa en la caja invisible de una antorcha. Forma real =
  `mc._geoFina[id]`; estructuras con **`mcFineBoxHit._orig`** (la envuelta trae agentes, BUG-AG19).
- Agrandar = **`game.voxelesUI.grosor(grupo,n)`**, ⛔ NUNCA apilar voxeles: `mcDrawArr` sube la capa
  entera a la GPU cada frame (240 estrellas g16 = 983 040 vox vs **240**).
- Se dibuja **con el mundo** (`mcDrawVoxUI`), NO en el overlay: el translúcido no escribe z (BUG-VOXUI1).
- Vuelo en tiempo **simulado**, reposo en el de **reloj**. ⛔ los fps del navegador de pruebas (1,4) no
  miden nada.

## Física del jugador

- Parkour → [`docs/parkour.md`](docs/parkour.md); `game.parkour.estado()` dice **por qué** no engancha.
- Fluidos → [`docs/fluidos.md`](docs/fluidos.md). **Fuera del agua no cambia nada** (condición del
  dueño). ! `mcCaidaPaso(vy, dt, x, y, z, nadando, mira)` = **LA** pieza: quien integre velocidad
  vertical la **llama**; quien la envuelva pasa **todos** los argumentos (comerse uno apaga el nadar o la
  mirada **sin fallar nada**). `test_hundirse.js` y `test_nadar.js`: rojo **a propósito** (BUG-FLUID5).
- Vuelo (`F`; foto → **`Alt+F`**) → [`docs/osd-e-intro.md`](docs/osd-e-intro.md): rama propia en
  `mcUpdate` **antes** de la de fluido, vertical **no pasa por `mcCaidaPaso`**.

## OSD e intro → [`docs/osd-e-intro.md`](docs/osd-e-intro.md)

Botón = **bloque con una nota**, identificado **por su texto** ⇒ una pantalla pasa de `{html:…}` a
`{mapa:'menu1'}` sin tocar ni una acción. **`game.osd.dump()` = el descubridor.**

- Las **4 reglas caras** (acción sin parámetros · iframe `?osd=1` · tamaño en `cfg` · `?intro=1` nunca
  en `app.js`) → su `docs/` (movidas verbatim el 2026-08-21).

## 🔒 Luz y sombra — CANDADO → [`wiki/paginas/ley-de-la-luz.md`](wiki/paginas/ley-de-la-luz.md)

⛔ **NO SE TOCA LA ILUMINACIÓN SIN ENTENDER LA LEY DE LA LUZ** (orden del dueño, 2026-08-20). Se lee
**entera** (10 mandamientos + 8 leyes + Sótano) y se **cita el artículo**. Dueño: «iluminación real y
consistente; **cero apaños**». Si algo se ve mal, infringe un artículo. **2 sombras** (skylight horneada
vs proyectada en GPU) y **2 bakes** de luz móvil → [`docs/luz-y-sombra.md`](docs/luz-y-sombra.md).

## Cuentas y permisos → [`docs/cuentas-y-permisos.md`](docs/cuentas-y-permisos.md)

**El permiso se decide en `server.py`**: el cliente esconde, el servidor prohíbe.
`VOXELFORGE_PUBLICO=1` **enciende** el modo estricto (en desarrollo nada cambia ⇒ probarlo exige
servidor propio en otro puerto). 2 puertas: `PERMISO_POR_RUTA` + `_mundo_ok` (¿**este** mapa?).
Mapa sin registro = oculto y solo lectura.

## Redstone → [`docs/redstone.md`](docs/redstone.md)

Dueño: **«todo lo de redstone va en ficheros aparte»**. Fuentes `.js` en `redstone/`;
`node redstone/make_snippets.js` publica **por `POST /api/snippets`** (⛔ nunca el `.json` a mano: así hay
papelera + escritura atómica). **Cero líneas de `app.js`**: el motor no sabe qué es una antorcha, es un
intérprete de propiedades. Tocas un fuente → **re-publícalo**. Pieza **≤ 16³** o se va a `mc.structures`,
sin celda ni vecinos ni señal (BUG-RS6).

## Notas · iconos · wiki

- Carteles → [`docs/notas-y-fuente.md`](docs/notas-y-fuente.md): **se DERIVAN de `mc.notes`**, no son
  datos del mundo. Pixeloid nítida solo en **múltiplos de 9 px** (`MC_NOTE_TEXT_MIN=9`).
- Iconos (`/images`) → [`docs/iconos.md`](docs/iconos.md): verdad = **DIBUJO + `data/ui/ranuras.json`**;
  los `data/ui/<ranura>-<px>.png` son **derivados, ⛔ no se editan a mano nunca**.
- Wiki (`/wiki`) → [`docs/wiki.md`](docs/wiki.md): manual del dueño, ⛔ **no se edita salvo que lo pida**;
  la desfasas → 1 línea en [`wiki/PENDIENTE.md`](wiki/PENDIENTE.md) y sigues.
- Ciudad-MD (`herramientas/md_a_ciudad.py`/`ciudad_a_md.py`) → [`docs/ciudad-md.md`](docs/ciudad-md.md):
  cada rasgo es **PORTADOR** (`y=GH` + notas) o **DERIVADO**. ⛔ Derivado en `y=GH` o en nota = el `.md`
  regenerado sale corrupto **sin que nada falle a gritos**. Guardián `test_ciudad_md.js`.

## Convenciones → [`docs/repo.md`](docs/repo.md)

- Todo cambio de `state` acaba en `render()`, que **no pinta: encola un rAF**. `setMode()` sí pinta
  síncrono ⇒ los 2 seguidos rasterizan 2 veces: llama **solo** a `setMode()`.
- Export `{format:"voxelforge-1", size, meta, voxels}`. UI y comentarios: **español**.
- **Capturas de ticket → disco, no al chat**: `data/tickets/<ID>/` + `contexto.md`.
