# HANDOFF · VoxelForge (editor voxel + juego RPG)

Estado del proyecto para retomarlo en otra sesión. Última actualización: 2026-07-20.

## Qué es
Editor de assets **voxel** (HTML/CSS/JS vanilla, sin build) que ha crecido hasta tener un **modo
juego RPG** estilo Zelda: un mapa de salas, habitantes colocables dentro y un modo Jugar
(point-and-click con colisión, transiciones entre salas, sombras). Todo servido por un server
Python mínimo.

## Cómo arrancar
```bash
cd /root/voxel
python3 server.py 8500          # sirve estático + API (0.0.0.0:8500). YA ESTÁ CORRIENDO (pid via `pgrep -af server.py`)
# público en http://135.181.61.243:8500
```
- Frontend **estático**: editar `app.js`/`index.html`/`style.css` y **recargar el navegador** (no hay build).
- El server **solo** hay que reiniciarlo si tocas `server.py`: `kill <pid>; nohup python3 server.py 8500 > server.log 2>&1 &`.
- No hay tests. Se verifica con navegador o **headless** (Node): ver «Verificación» abajo.

## Documentos (léelos antes de tocar)
- **`CLAUDE.md`** — arquitectura completa, convenciones, subsistemas (render, mapa, escala, rendimiento).
- **`PLAN.md`** — hoja de ruta del juego con fases/estados/tickets y bitácora.
- **`MOVIMIENTO.md`** — sistema de movimiento del jugador (pathfinding, sprites, oclusión) con versiones.
- **`SOMBRAS.md`** — plan y estado de la proyección de sombras.

## Estado actual (todo lo hecho)
Fases del plan (ver `PLAN.md`): **F1..F6 ✅**. Falta **F7** (interacción/diálogo con NPC) y F8+ (futuro).
- **Editor**: capas 2D + 3D libre, extrude (fuera añade / dentro vacía, crece la rejilla), undo/redo,
  aislar, recorte de cercanía al zoom, selección **compartida** entre 2D y 3D, Alt+clic cuentagotas
  (2D y 3D; vuelve a la herramienta previa), rotar 3D con botón derecho.
- **Assets servidor** (`assets/index.json`): personajes `alis`, `chef`, `analista`; salas `bloque`
  `taberna`, `herreria`, `mazmorra` (RECREADAS a **112×112×52**, escala de personaje).
- **Galería** (`data/habitantes/`, server con papelera): enruta por `type` (personajes→Habitantes,
  `bloque`→Habitaciones). Guardados actuales: alis, analista, chef, taberna.
- **Mapa** (`data/mapa.json`, API `/api/mapa`): rejilla 8×8, colocar/quitar salas, miniaturas
  compuestas (sala + habitantes), colocar habitantes dentro (editor cenital).
- **Jugar**: elegir personaje, clic para caminar (A* + suavizado), orientación, transiciones por
  puertas talladas dinámicamente, oclusión por píxel (pared detrás no tapa), **sombra** proyectada.

## Mapa de subsistemas (dónde está cada cosa en `app.js`, ~2440 líneas)
- **Voxels/estado**: `state.voxels` = `Map<"x,y,z",hex>`. `getVoxel/setVoxel`, `key`.
- **Rendimiento** (modelos grandes): `voxParsed()` (lista cacheada por `voxKey()`), `bigModel()`,
  `BIG3D=15000`, `getRaster()`, `render()` coalescido por rAF. Ver §Rendimiento en CLAUDE.md.
- **Proyección 3D**: `project3d(W,H,view)` → `{screen,front,depthOf,list,occupied}`; encuadre por
  **silueta** con `view.fillX/fillY`. Iso 4 pasos: `isoProject`/`renderIso` (miniaturas).
- **Vista 3D edición**: `renderEdit3dScene` (escena) + `drawEdit3d` (cachea en `e3base`, overlays
  encima). **MAPA**: `openMapa`/`renderMapaGrid`/`openPicker`. **Habitación**: `openRoom` (cenital)
  /`drawCellComposed`/`composeRoomData`/`downsampleVox`.
- **JUGAR (F5/F6)**: objeto `play`. `openPlay`→`enterPlay`→`playLoadRoom` (carga sala, escala,
  talla puertas, sprites+sombras+depth, spawn). Bucle `playTick`; `renderPlay` (base+sombra+sprite+
  oclusión). Pathfinding `findPath` (A*)+`smoothPath`. Transiciones `roomExits`/`carveDoorways`/
  `checkExit`/`playTransition`. Escala `upscaleRoom`/`charShell`; colisión `buildWalk`/`erodeWalk`.

## Decisiones/invariantes clave
- **Escala**: la SALA es grande (112) y el personaje va **nativo** (32); nunca se reduce el personaje
  en juego. Salas 28³ legado se escalan ×4 al vuelo. `standZ=4` (losa de suelo), cuerpo ~28, huella
  erosionada r=3.
- **Puertas**: `carveDoorways` taladra **solo el muro** (para al llegar al interior) → no parte
  muebles, y en bordes abiertos no toca nada. Después `clearExitLanes` despeja un **carril recto**
  en la banda central de cada salida **REAL** (`play.exits`), del borde al centro, quitando el
  mueble que caiga en medio → no hay que rodear. Solo actúa en lados CON vecino y **sobre la copia
  runtime** (los assets/galería quedan intactos); un mueble céntrico (yunque, celda) se ve recortado
  en juego únicamente por el lado que tiene puerta. La **media anchura del carril** (`playTrim`,
  def 7, en localStorage, **cualquier entero sin tope**: **0 o negativo = puerta CERRADA** (muro
  intacto, no se cruza), >0 abre el vano y recorta el mueble, enorme = vano de toda la sala) se
  ajusta **por CONSOLA F12** con `room.doorTrim = 4`
  o `room.doorTrim(4)` (global `window.room`, accessor en app.js); `setPlayTrim`→`reloadPlayRoom`
  recarga en vivo conservando posición. Los bucles de carve/clear están **acotados a la rejilla**
  para que un hw extremo no cree voxels fuera ni cuelgue. Sin control en la UI (retirado a propósito).
  **Inspectores de consola** (app.js): `window.room` es un **objeto plano** (accessors enumerables,
  BUG-RM1) → `room` se ve como dict `{doorTrim,name,cell,exits,pos}`; `room.doorTrim` devuelve el nº y
  `room.doorTrim = N` lo fija+recarga; `name/cell/exits/pos` de solo lectura (`ROOM_PROPS`). Y
  `window.game` vuelca `{fps, voxels, mode, room, showFPS, showVoxels}`: `game.showFPS(false)`/`= false`
  muestra/oculta el medidor de FPS y `game.showVoxels(true)`/`= true` el de **voxels dibujados** (ambos
  persistidos, `vf_showFPS`/`vf_showVox`); `game.fps`/`voxels`/`mode`/`room` se refrescan solos. DevTools
  pinta los getters vivos de `room` como `(…)`; para valores en línea usar `game.room` o `JSON.stringify(room)`.
  **Culling por visor**: `project3d` descarta del dibujo los voxels cuyo centro cae fuera del lienzo
  (margen ~1 voxel; `occupied` se deja completo → el culling de caras no cambia), así `game.voxels` baja
  al acercar el zoom. El medidor de voxels vive arriba-izda de la vista 3D (`#e3-vox`, bajo `#e3-fps`).
- **Oclusión del jugador**: por píxel con su **depth buffer** (a la posición de referencia) + `Δd`
  por traslación; solo actúa donde el jugador tiene píxeles. Una pared detrás no lo oculta.
- **Sombra**: corta (`SHADOW_LEN=6`), gradiente de alfa, con su propio depth para que los muebles
  delante la tapen. **BUG-SH1**: usa un **campo de alturas** (`play.surfZ`, z-tope por columna) y
  proyecta cada casilla a la **tapa** de su columna, PERO con tope en la altura del personaje
  (`cap = play.standZ + ext.z`): solo trepa a columnas **más bajas** que él; sobre lo que es más
  alto (paredes) la sombra se **posa en el suelo**, no trepa. Como el decal se traslada desde el centro de referencia, se **re-hornea en la celda real** del
  jugador (`bakeShadowAt`, `play.charRot` guarda las 4 orientaciones) al cambiar de celda/orientación.
  Ver SOMBRAS.md (pendiente: cara vertical + blob de contacto + suavizado).
- **Puertas (BUG-DT1)**: el **vano del muro** (siempre pisable) es aparte del **recorte de mueble**
  (`doorTrim`). `carveDoorways` usa media anchura mínima `WALL_HW_NATIVE=3` y su `punch` **salta el
  margen vacío** exterior (el muro nativo va embutido) hasta el muro. **`doorTrim<=0` = puerta
  CERRADA** (no talla el muro; el 0 también cierra), **`>0`** abre el vano y recorta el mueble.
  `clearExitLanes` **acota la profundidad** desde el muro
  (16 nativo/4 legado) — ya NO barre hasta el centro, así muebles lejanos/céntricos quedan intactos.
- **Depuración en Play (REQ-DBG1)**: medidores `#play-fps`/`#play-vox` sobre `#play-stage`; FPS real
  por ventana en `playTick`, voxels de sala tras `project3d`; `game.showFPS/showVoxels` valen en ambos.
  El gate usa `play` (módulo, en ámbito), NO `window.play` (era `undefined` ⇒ medidores nunca visibles).
- **Rendimiento editor 3D (BUG-P3D1)**: `scheduleEdit3d()` coalesce los `pointermove` por rAF y el
  arrastre de vista baja a ½ resolución también en modelos pequeños. El **pincel** sobre un modelo
  grande (sala ~50k voxels con solo ~300 dibujados) era el caso duro: el coste era **O(modelo) por
  trazo**, no O(dibujado). Arreglos (4ª ronda): (1) `setVoxel` **parchea las cachés en O(1)**
  (`_vl`/`_vlIdx`/`_vlBox`/`_occSet`) en vez de invalidar `voxKey()` ⇒ ya no se re-parsea todo el
  modelo por trazo (fuzz 20k ops OK); (2) la **silueta de encuadre** de `project3d` (8×`rotP` por
  voxel de corteza) se cachea por (modelo, caja, orientación) — no depende de `voxRev`, y de paso el
  encuadre no tiembla al pintar; (3) con recorte de cercanía, el Set de ocupación de "solo lo
  visible" se construía CADA frame ⇒ con `_fast3d` (pincel) se usa la ocupación completa cacheada;
  (4) al pintar `drawEdit3d` hace **UNA proyección** (resolución real, sirve para el picking) y
  rasteriza a ½ escala con `scanQuad` desde esa misma geometría (sin `fill+stroke` por cara);
  (5) los paneles 2D/mini/info (`drawIso` es O(modelo)) se **difieren a pointerup**
  (`scheduleAux2d`+`_aux2dDefer`). Al soltar (`end3d`) se repinta todo a calidad completa.
- **Interruptor del PREVIEW 3D (botón 👁 en la tarjeta «Vista 3D» del panel derecho)**: switch que
  **oculta/muestra la miniatura iso** (`#iso`, la tarjeta del panel derecho) — NO toca el lienzo de
  edición 3D del centro (`#edit3d`). La miniatura se repinta con `drawIso` (O(modelo)) en cada cambio
  de estado; con salas enormes (~50k voxels) eso pesa, así que el switch la esconde y ahorra ese
  coste. Oculto ⇒ `#iso-body` (`hidden`, envuelve lienzo + controles) desaparece y `drawIso` hace
  no-op (`if(!_showPreview) return;`, salvo el modal «Ampliar» que sigue siendo independiente).
  Estado en `localStorage vf_showpreview` (`applyShowPreview`/`updateTogglePreview`, botón
  `#toggle-preview`). Es un botón a propósito (lo pidió el usuario), no variable de consola.
- **Datos SAGRADOS**: `data/habitantes/` y `data/mapa.json` NUNCA se borran; el server usa papelera
  (`to_trash`). No probar la API de guardar/borrar con nombres reales.

## Regenerar assets
- Personajes: `node make_alis.js` · `make_chef.js` · `make_analista.js` (patrón `box()/set()`, 32³).
- Salas: `node make_rooms.js` (dibuja en unidades gruesas 28³, escribe bloques finos S=4 → 112³,
  guarda solo la cáscara). Actualizan `assets/index.json`.

## Verificación sin navegador (headless)
- Render iso a PNG: `node render_rooms.js <asset.vox.json> <out.png>`.
- Lógica (pathfinding, puertas, escala, encuadre, oclusión): scripts en el scratchpad de la sesión
  (`/tmp/claude-*/scratchpad/*.js`) reproducen `buildWalk`/A*/`carveDoorways`/`project3d`. Patrón:
  copiar la función pura y probarla contra los `.vox.json` reales.
- API: `curl` a `/api/mapa` y `/api/habitantes`.

## Pendiente / próximos pasos
1. **F7 · Interacción con NPC**: proximidad + tecla acción → bocadillo con `meta.name/role`.
2. **Sombras (pulido)**: blob de contacto explícito + suavizado/dilatación del borde (SOMBRAS.md §7).
3. **F8+**: objetos/inventario, combate, misiones, guardado de partida, mapa NxM configurable.

Hecho (2026-07-20): **carriles de puerta** — `clearExitLanes` (app.js) despeja el carril central
de cada salida real; verificado headless que las 4 celdas del mapa tienen corredor recto ≥ huella.

Hecho (2026-07-20): cerradas **5 incidencias** (ver PLAN.md §Incidencias): BUG-TR1 (pantalla negra al
cruzar), BUG-DT1 (`doorTrim` recorta de más), REQ-DBG1 (medidores F12 en Play), BUG-SH1 (sombra que
trepa a objetos altos), BUG-P3D1 (rendimiento editor 3D). Cambios solo en `app.js`/`index.html`.

## Trampas conocidas (gotchas)
- El repo git está en `/root` (no `/root/voxel`): añadir con rutas `voxel/...` desde `/root`, o `git
  add` fallará con `voxel/voxel/`. `data/` está gitignored (estado del usuario, no se commitea).
- `voxRev` se incrementa en toda mutación in-place de `state.voxels` (`setVoxel`, recorte de
  `setSize`); si añades otra mutación in-place, **incrementa `voxRev`** o las cachés quedan obsoletas.
- SVG de cursores usan `#` literal (no `%23`).
- Tras editar `static`/`app`, recargar navegador; el server no cachea pero el navegador sí (mtime
  cache-bust en index.html).
