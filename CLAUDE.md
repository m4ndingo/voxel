# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es

**VoxelForge** — MVP de un editor de assets **voxel** para un videojuego RPG. El objetivo del
producto: definir habitantes y habitaciones (voxel) que luego componen un mapa mayor. Este MVP
se centra en **una sola pantalla: la edición de un objeto**; el resto del flujo (pestañas
Habitantes / Habitaciones / Mapa y la Biblioteca lateral) está **mockeado**.

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

No hay tests; verificar con un navegador (o Playwright headless: cargar `file://.../index.html`,
comprobar `#voxel-count` y capturar `screenshot`). API verificable con `curl` (`/api/mapa`, `/api/habitantes`).

## Arquitectura (por qué necesita leer varios archivos)

- `index.html` — 3 columnas: **izq** propiedades+herramientas+capas+paleta · **centro** lienzo
  de edición de la capa actual · **der** preview 3D + plantillas + biblioteca mock.
- `app.js` — toda la lógica. Sin frameworks.
- `style.css` — tema oscuro RPG mediante variables CSS.

**Modelo de datos (clave):** el objeto es una rejilla `SX×SY×SZ` (ancho·fondo·alto, **no cúbica**)
como `state.voxels: Map<"x,y,z", valor>`, donde `valor` es un hex `#rrggbb` **o** una **textura**
`tex:<clave>` (`clave` = key `getRoomData`: `asset:<file>` | `hab:<id>`; `isTex`/`texKeyOf`). Una
textura es un objeto 16³ de tipo `textura` usado como pincel (`state.tex`, `chooseTex`, tira
`#texstrip`); en 3D cada cara se rellena con la proyección ortográfica del objeto-textura desde su
normal (`buildTexFaces`→6 canvas + medias; `paintFace3d`/`drawTexFace` ruta canvas, `rasterCol`=media
por cara en ruta raster/BIG3D e iso; **2D Capas** (`drawVoxCell` en `drawEdit`) dibuja la cara superior +Z
real (`getTexFaces().faces[0]`, indexada col=x/row=y → encaja con la rejilla), con fallback a `voxFill`=color
representativo si la textura aún no cargó). Las texturas usadas se
**embeben** (`textures:{clave:{size,voxels}}`, `embeddedTextures`) en save/localStorage y se rehidratan
con `ingestTextures` al cargar (modelo autocontenido). Vacío = sin entrada en el Map. Las dimensiones son
variables por modelo (`let SX,SY,SZ`): `setSize(x,y,z)` las fija y ajusta el slider/inputs;
`resizeGrid(x,y,z)` redimensiona el objeto actual recortando voxels fuera. `rotXY` implementa la
rotación 90° válida también para base rectangular (rot1/rot3 intercambian X/Y). El tamaño viaja en
`size` de cada JSON — **número = cúbico legado**, `{x,y,z}` = rectangular; `normSize()` lo normaliza
y `load(map, meta, size)` lo aplica. Presets = 16³; assets Alis/chef = 32 (legado cúbico). Todo se
serializa del Map. UI: inputs X×Y×Z + "Aplicar" en la tarjeta Objeto.

**Pivotes dibujados (herramienta 📍, tecla `P`):** puntos de articulación que se **dibujan** en el
editor en vez de escribirse a mano en el snippet (`state.pivotes`, `[[x,y,z],…]` en coordenadas de la
rejilla). **NO son voxels**: no se estampan, no cuentan en `#voxel-count` y no se ven en el Mundo. Van
en el JSON como **clave de primer nivel `pivotes`**, que sobrevive al guardado sin tocar `server.py`
(`POST /api/habitantes` hace `atomic_dump` del documento entero). El **orden del array es el número**
que se pinta encima (el 1º dibujado es el nº1) y es lo que elige `game.bloques` con `pivote: N`; sin
número se usa el 1º. Clic pone, clic encima quita (y renumera). En **Capas** el pivote de la capa
actual sale en magenta sólido y los de otras capas tenues; en **3D** se pinta la chapa siempre encima
(son marcas, no geometría: no se ocultan tras los voxels). Viajan por `edit()`/`snapshot()` (deshacer),
`rotateModel`, `resizeGrid` (se descartan los que quedan fuera) y `load`/`exportJSON`/`localSnap`.

⚠️ **Tres conversiones separan la celda dibujada del punto de giro** (`pivoteDeDibujo` en
`mundo-autoarranque`), y saltarse una cuelga el brazo de otro sitio: el editor es **Z-arriba** y el
Mundo **Y-arriba** (el `y` del dibujo es la PROFUNDIDAD); el origen es la **esquina de la celda 16³**
que contiene el mínimo (`Math.floor(min/16)*16`), no el mínimo — es lo que hace `mcStructGeom` al
mallar; y el punto es el **centro** de la celda marcada (`+0.5`), no su esquina.

**Historial (deshacer/rehacer):** snapshots `{voxels,size}` en `undoStack`/`redoStack`, **una entrada
por gesto** (`beginGesture`/`endGesture` en trazos con arrastre; `edit(fn)` para acciones atómicas —
borrar selección, vaciar capa; `commit` directo en `resizeGrid`). `setVoxel` activa `mutated` solo si
cambia algo, para no registrar gestos nulos. `load()` llama `clearHistory()` (no se cruza historial
entre documentos). Botones ↶/↷ en la cabecera (`updateUndoUI` los habilita) + Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y.

**Rendimiento con modelos grandes** (salas ~50k voxels; umbral `BIG3D=15000`, `bigModel()`):
`voxParsed()` cachea la lista parseada {x,y,z,c}+bbox por `voxKey()` = identidad del Map
(`mapId`, WeakMap) + `voxRev` (se incrementa en `setVoxel`/recorte de `setSize`; los reemplazos
del Map cambian la identidad solos — OJO si se añade otra mutación in-place). La vista 3D de
edición separa **escena** (`renderEdit3dScene` → canvas `e3base` cacheado por clave
voxels+vista+aislar) de **overlays** (hover/selección): mover el ratón = blit + overlay, NO
re-render. Modelos grandes: raster sin AA en vez de path+stroke (también en la miniatura iso y
forzado en el modal aunque la rejilla esté activa), **media resolución** durante el arrastre de
rotar/pan (editor y modal; al soltar se repinta a completa), counting sort O(n) por buckets de
profundidad en `project3d` (bucket≪1 voxel ⇒ mismo orden pintor), set de ocupación cacheado,
`ImageData` reutilizado (`getRaster`), y `render()` coalescido por rAF (varios setVoxel en un
frame ⇒ un repintado). El corte de Capas usa `drawIsoSlicedBig` (raster + plano como un solo
rombo translúcido). **BUG-P3D1** (el coste va con el fill-rate/DPR y renders redundantes, no con el
nº de voxels): `drawEdit3d` se coalesce por rAF vía `scheduleEdit3d()` (los `pointermove` de
pan/orbit/extrude/mover/seleccionar/hover ⇒ UN repintado/frame; el pintado con doble `pick3dAt`
sigue directo por necesitar `g3d` fresco), y la **media resolución del arrastre** ya no exige
`bigModel()` — cualquier escena con caras grandes baja a ½ lado (¼ fill-rate) mientras se rota/pan.

**Dos vistas del mismo `state.voxels`:**
0. **Dos modos de edición** conmutables (`mode` = `'capas'|'3d'`, pestañas en `.stage-bar`,
   `setMode`). La vista **3D es un render 3D real con ROTACIÓN LIBRE** (`drawEdit3d` sobre `#edit3d`,
   independiente del iso de 4 pasos que usan la miniatura/modal). `view3d={yaw,pitch}` (radianes);
   `project3d(W,H)` construye la proyección ortográfica (rotación yaw sobre Z + pitch sobre X),
   auto-encuadre por bbox, orden pintor por profundidad del centro y **backface culling por normal**
   (`front[fi]`) + culling de caras con vecino (`faceVis3d`). **Recorte de cercanía** (`nearClipT`):
   al hacer zoom más allá de `_clipStart` (umbral ajustable en vivo: **`game.nearClip`** devuelve el nº y
   **`game.nearClip = 8`** lo ajusta, persistido en `vf_clipStart`; subirlo = los voxels desaparecen más tarde, 0 =
   pelar desde el principio; ramp de ancho `CLIP_SPAN`) se van pelando los voxels con menor
   profundidad (los más cerca de la cámara) — `project3d` filtra `list`/`occupied`, así que render, caras interiores
   (se destapan al faltar el vecino recortado) y picking ven el **interior** del objeto sin más
   código. Zoom hasta 32 (3200%) en edición y modal; `game.nearClip` por defecto 40 (el pelado no empieza hasta 4000%, o sea nunca con el zoom tope de 32). El encuadre (`S`) sigue usando el bbox completo. Las 6 caras del cubo unidad están en
   `CUBE_FACES` (normal, vecino, sombra, esquinas). **Controles 3D**: **botón derecho o central +
   arrastre** rota libre (con la herramienta Selección el derecho se cede a deseleccionar);
   **Ctrl+arrastre** = pan; **Alt+clic** = cuentagotas momentáneo (toma el color y MANTIENE la
   herramienta actual — igual que Alt+clic en la vista Capas); **herramienta Mano** (`tool='hand'`, 1ª en las
   barras) arrastra = pan; rueda = zoom al cursor (`zoom3dAt`); botones ⟲⟳ giran yaw 45°; arrastrar
   sobre un voxel aplica la herramienta. Cursores contextuales (`update3dCursor`+`CURSORS`):
   lápiz/goma/… sobre voxel, mano con Mano, cuentagotas con Alt. Nota: los SVG de cursor usan `#`
   real (encodeURIComponent los codifica una vez); NO poner `%23` o quedan en negro.
   `pickVoxel3d` recorre de cerca→lejos y usa `inQuad` sobre `facePoly3d` de las caras visibles;
   `drawHover3d` (contorno amarillo) y `drawSelection3d` (relleno cian por cara) reproyectan igual.
   Clic/arrastre
   aplica la herramienta activa al voxel elegido (`applyTool3d`: paint/erase/pick/`flood3d`). Herramienta
   **`build`** («Construir», estilo Minecraft, tecla **C**, solo 3D): clic sobre una CARA coloca un voxel
   en la celda vacía adyacente en la dirección de la normal (`pickFace3d`→`buildTargetAt` = voxel+`CUBE_FACES[fi].nb`,
   con `paintValue()`); arrastrar apila contra las caras que se tocan; `drawBuildGhost` pinta el hueco destino
   en verde antes de soltar. En Capas `build` solo rellena huecos de la capa actual (no repinta). Las
   herramientas viven en el panel izq **y** en una **barra flotante** (`#tool-float`, visible en 3D);
   `setTool` mantiene ambas sincronizadas. Herramienta **`select`** (3D **y** Capas; la `selection`
   es un Set **compartido** entre vistas — cambiar de modo no la pierde; en Capas se pinta tinte
   cian sobre la capa actual con aviso de «N seleccionados en otras capas», izq añade / der quita
   pincelando, clic izq en vacío deshace, y con la herramienta activa el pan de botón derecho se
   cede a deseleccionar): clic izq añade a
   `selection` (Set; se **rellena** cada voxel con tinte cian + borde por voxel — NO solo contorno:
   el contorno se fundía entre vecinos y parecía seleccionar de más/ocultaba huecos) y clic der quita.
   En 3D el **arrastre** (izq o der) hace una **caja**: del voxel del clic (A) al voxel actual (B) se
   (des)seleccionan todos los voxels OCUPADOS dentro de `[min..max]` en cada eje (`selBox`+`applySelBox`,
   rehecha desde `base` cada frame). Si el arrastre se queda en una cara (Y o Z constante) sale un plano
   —vertical u horizontal—; si cruza a otra cara sale un volumen. Un clic sin mover = caja A..A = 1 voxel.
   `selecting`='add'|'remove'; clic izq fuera del objeto la deshace; **Shift+arrastre** (solo en Capas)
   dibuja un **recuadro** (`marquee`, celdas, rombo punteado cian en `drawEdit`) y al soltar **añade** a
   `selection` todos los voxels de la capa actual dentro del rectángulo (`commitMarquee`); **Ctrl+C**
   (`copySelection`) copia los voxels seleccionados a `clipboard` (offsets relativos al mínimo + color +
   punto de agarre `gx,gy`) y **Ctrl+V** (`startPaste`, solo en Capas) entra en **modo colocación**
   (`pasting`): un fantasma sigue al cursor (cursor `move`, preview en `drawEdit` de lo que cae en la
   capa visible dz=0), **clic izq pega** (`pasteAt`: mínimo en el cursor, Z anclado a la capa actual,
   un solo `edit()` para deshacer, la selección pasa a lo pegado), botón der/**Esc** cancela
   (`cancelPaste`); arrastre/flechas **mueven** la
   selección en su capa (`moveSel`); herramienta **`extrude`** añade volumen adyacente a la selección
   (arrastre hacia frente/fondo=eje Y con `applyExtrudeDrag` reconstruyendo capas, o flechas con
   `extrudeOnce`; solo rellena huecos, la selección pasa a la nueva cara). Extruir **más allá del
   borde de la rejilla NO se topa con el máximo de capas**: `ensureExtrudeRoom` agranda la dimensión
   por el lado positivo, o `worldShift` desplaza TODO (voxels+selección+estado de extrude) por el
   negativo, agrandando la dimensión (cap `MAXDIM=128`); todo dentro del mismo gesto/`edit`, así que
   deshacer restaura tamaño y voxels (el snapshot lleva `size`). Extruir **HACIA DENTRO** (arrastre
   con `steps<0` contra la normal, o ↓ con `carveOnce`) **vacía** los voxels por donde se hunde la
   cara (profundidad 0..n-1) en vez de intentar añadir; la selección recede a la nueva cara. El
   arrastre es reversible: `exCarved` (Map coord→color) guarda lo vaciado y se restaura cada frame
   (igual que `exCells` deshace lo añadido).
   **Borrar** (botón) o Supr/Backspace con selección activa llama `deleteSelection`.
1. **Edición por capas** (`drawEdit`): vista cenital 2D de la capa Z actual (`state.layer`). La
   capa inferior se dibuja tenue como fantasma para alinear. Aquí se pinta (pointer events →
   `applyTool` → herramientas paint/erase/pick/fill; `floodFill` es por capa). El canvas **llena
   el contenedor** (`resizeEdit` fija `width/height` internos = `canvas-wrap` × dpr) y tiene
   **zoom/pan** (`view={zoom,panX,panY}`): `viewGeom()` deriva celda+origen y es la única fuente
   de verdad compartida por dibujo y hit-test (`cellFromEvent`). Rueda = zoom al cursor
   (`zoomAt`), botón central/derecho o Espacio = pan. Cambiar de modelo resetea la vista.
   En modo Capas, la miniatura iso dibuja un **plano de corte cian** a la altura de `state.layer`
   (`drawLayerPlane` con la geometría cacheada `isoGeom`) y es interactiva: **arrastre vertical o
   rueda** sobre `#iso` cambian de capa (1 capa = `isoGeom.V` px). Botones flotantes ▲/▼ (`#layer-float`,
   arriba-dcha) también; se ocultan en 3D. El slider/`#lf-label`/título se sincronizan en `syncLayer`.

   **Vista grande** (modal Ampliar/F): usa el motor 3D libre (`renderFree3d` con `project3d(W,H,view)`
   y su propio `modalView={yaw,pitch,zoom,panX,panY}`). **Ctrl+arrastre rota**, arrastre = pan, rueda =
   zoom, ⟲⟳ = yaw±45°, Girar = turntable. Rejilla oculta usa el rasterizador sin AA compartido
   (`col32`+`scanQuad`, extraídos a nivel de módulo). `renderIso` (iso 4 pasos) ya solo lo usan las
   miniaturas de la galería de habitantes (`drawThumb`).

2. **Preview isométrico** (`renderIso`, usado por la miniatura y el modal grande): rotar XY con
   `rotXY(x,y,rot)` (4 orientaciones), **orden pintor** por `(rx+ry)` y luego `z`, autoescalado
   `S`×zoom, centrado + pan. Dos modos:
   - `seams=true` (con rejilla): cada cubo con 3 caras vía canvas paths + borde oscuro.
   - `seams=false` (sin rejilla): **rasterizador propio sin antialiasing** — culling de caras
     ocultas (una cara solo se dibuja si no hay vecino delante: top↔`z+1`, izq↔`ry+1`,
     der↔`rx+1`) y scanline sobre `ImageData`/`Uint32Array` con regla half-open. Caras
     adyacentes cubren píxeles complementarios exactos ⇒ **cero costuras por construcción**.
     NO volver a "sellar" con strokes/solapes de canvas: el AA de los paths siempre deja
     hilos o sangrados (ya se intentó 3 veces).

**Plantillas** (`PRESETS`: `barril`, `slime`, `vacio`) generan un Map por procedimiento — son el
punto de partida para nuevos assets y el ejemplo de cómo se construye geometría voxel.

**Assets del servidor** (`assets/`, requiere servir por HTTP): la app hace `fetch('assets/index.json')`
(`loadServerAssets`) y carga cada `.vox.json` por URL (`loadFromUrl`). Para añadir un NPC/objeto:
escribe su `.vox.json` (formato export, con `meta.role`/`meta.description`/`meta.icon` opcionales) y
añádelo a `index.json` (`{id,name,role,type,icon,file}`). Ejemplo reproducible: `node make_alis.js`
construye el NPC «Alis la Duplicadora» con helpers `box()/set()` y regenera el índice — patrón a copiar.
`loadServerAssets` reparte el índice por `type`: los personajes/objetos van a **Assets del servidor** y
los `type:'bloque'` a **Habitaciones** (`loadRooms`); ambos cargan con `loadFromUrl` al hacer clic.
**Enrutado por tipo de lo GUARDADO** (todo se guarda en `data/habitantes/`, un solo almacén): la
galería/roster de **Habitantes** filtra `type!=='bloque'` y **Habitaciones** muestra los `type==='bloque'`
(assets + guardados, estos con badge «guardada» y carga vía `loadHabitante`). `openHabitantes(kind)`
sirve ambas galerías (`habKind` recuerda cuál); `refreshRosters()` refresca los dos tras guardar/
renombrar/borrar. Al guardar respeta el `meta.type` del desplegable, así un objeto marcado «Bloque de
habitación» aparece en Habitaciones, no en Habitantes.
Las 3 **habitaciones** (Taberna/Herrería/Mazmorra) están **a escala de personaje**: `make_rooms.js`
dibuja en unidades gruesas (geometría 28×28×13) pero escribe bloques finos S=4 → assets
**112×112×52** con paredes de 40 frente a personajes 32³; solo guarda la **cáscara** (superficie,
~50k vox) y JSON compacto (~1MB). En el juego/composición el personaje va SIEMPRE a resolución
nativa: salas `dim.x>=64` se usan tal cual (suelo = losa z0..3, pies a z=4); salas pequeñas
(guardadas 28³ legado) se escalan ×4 al vuelo (`upscaleRoom`, solo superficie). **BUG-DT1**: el
**vano del muro** (siempre pisable) es aparte del **recorte de mueble** (`doorTrim`). `carveDoorways`
**taladra SOLO EL MURO** con media anchura MÍNIMA `WALL_HW_NATIVE=3` (`wallHwC=max(trimC,wallMin)`);
su `punch` **salta el margen vacío** exterior (el muro nativo va embutido, no en el borde de la
rejilla), taladra la banda sólida y para en el interior — así `doorTrim=0` abre igual un vano de 7
sin cortar muebles, y `doorTrim<0` = puerta cerrada (no se talla). Tras taladrar, `clearExitLanes`
(solo si `doorTrim>0`) despeja el carril de cada salida REAL del muro hacia dentro pero **acotado a
`depthC` casillas** (16 nativo / 4 legado), NO hasta el centro ⇒ un mueble LEJANO/CÉNTRICO (celda,
yunque) queda intacto; solo actúa en lados con vecino (`play.exits`) y sobre la copia runtime, así
que los assets/galería no se tocan. `play.doorHw` (disparo de salida en `checkExit`) es el vano real
`wallHwC·f`, no el trim. La media anchura del carril de mueble es `playTrim` (def 7, en localStorage,
**cualquier entero sin tope**; 0 = mueble intacto, <0 = cerrada), ajustable **por consola F12** vía `room.doorTrim = 4`
(`window.room` es un **objeto plano** inspector — accessors enumerables, se ve como dict `{doorTrim,
name,cell,exits,pos}`; `room.doorTrim` devuelve el nº; `ROOM_PROPS` en app.js; `setPlayTrim`→
`reloadPlayRoom` recarga en vivo). Los bucles de carve/clear están acotados a la rejilla. No hay
control en la UI. Además `window.game` vuelca `{fps,voxels,mode,room,showFPS,showVoxels,nearClip}`; `game.showFPS(false)`/`=false`
y `game.showVoxels(true)`/`=true` muestran/ocultan los medidores de FPS y de voxels dibujados de la
vista 3D (persistidos). `game.nearClip` (nº) y `game.nearClip = 8` regulan el umbral de zoom del recorte de cercanía (ver arriba). `project3d` hace **culling por visor** (descarta voxels con el centro fuera del
lienzo; `occupied` se deja completo), por eso `game.voxels` baja al acercar el zoom. La pisabilidad usa cuerpo ~28 y **erosión** de obstáculos r=3
(huella del personaje).
Verificación visual sin navegador: `node render_rooms.js <asset.vox.json> <out.png>` (rasteriza un iso
propio a PNG). Ya NO hay mock de Habitaciones.

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

## El rayo de apuntado y las estructuras finas

`mcRaycast(maxd, hitStruct)` decide **dónde cae el bloque que colocas** (`cell + normal`). Con
`hitStruct` mira también las estructuras finas, y ahí está la trampa: `mcStructCellSolid` responde por
la **caja de la celda entera** (`mcFineBoxHit` de `x*T` a `x*T+T-1`), o sea que **una escalera daba por
sólida su celda estando casi toda hueca**. El rayo se paraba en la caja, la normal era la de la celda y
el bloque nuevo salía **flotando delante** en vez de pegarse a la pared del fondo a la que apuntabas.

`mcStructRayHit(x,y,z, o,d, t0)` lo arregla: sub-DDA a **resolución fina** acotado a esa celda (≤48
pasos), y solo cuenta como impacto si el rayo cruza un voxel fino **lleno**. Solo se entra ahí si
`mcStructCellSolid` ya dijo que sí, así que el coste va con las celdas de estructura que cruza el rayo,
**no** con el alcance. `mcRaycast` devuelve además `point` (impacto exacto), `dist` y `fina`.

**Depuración (tecla `X`)**: rayos-X dibuja el rayo (magenta), un cubo en el impacto, la celda que lo
**para** (blanco) y la celda donde **iría el bloque** (verde), sin test de profundidad para verlo a
través de la estructura. ⚠️ **Desde el ojo el rayo se proyecta justo en la mira, o sea que se ve como un
punto**: para verlo como segmento hay que congelarlo con **`game.rayoFijo()`** y apartarse a mirarlo de
lado. La etiqueta DOM del impacto dice si paró en `voxel fino` o en `bloque` y en qué celda pone.

**Cuarta línea de la etiqueta = punto de extensión `mcXrayExtra`.** `app.js` pinta tres líneas
(coordenadas · tipo · material) y deja un hueco: `mcXrayExtra(clave, s|null) => 'texto'`, que rellena quien
sepa algo que el framework no sabe. Hoy lo engancha `mundo-autoarranque`, y muestra **el comportamiento del
material y los giros de ESA instancia** (`X` cabeceo · `Y` giro · `Z —`, más `(origen …°)` con el horneado
de `rot`+`frente`). Si la pieza está parada dice **por qué**: `en reposo (pide 90°, cono -90..30°)` o
`en reposo (a 14 bloques, alcance 12)` — son arreglos distintos (abrir `limites` / recolocar la pieza vs
subir `alcance`). **`limites` se cuenta desde la pose horneada de CADA instancia**, así que dos piezas del
mismo material puestas con `rot` distinto tienen conos que apuntan a sitios distintos del mundo: es la
causa de «un brazo me sigue y el otro solo si paso por detrás», y se ve comparando sus `(origen …°)`. Es `var` y no `let` a propósito: un `let` de nivel superior **no** es propiedad de
`window`, así que un snippet (que corre en `new Function`) no podría engancharse. Si el hook lanza, `app.js`
lo **desengancha y avisa una vez** — si no, sería un warning por etiqueta y frame.

Test: `node test_rayo_apuntado.js` (extrae las funciones verbatim de `app.js`; fija la regresión
comprobando que la celda **sí** da sólida por AABB pero el rayo **no** cruza voxel lleno).

**Coste de rayos-X: se recorre la ESTRUCTURA, nunca el voxel.** `mcXrayVolume` dibujaba las cajas
naranjas preguntando `mcFineSolidAt` **voxel fino a voxel fino** de la caja del jugador, y cada pregunta
recorre todas las estructuras del mundo: `|caja| × |estructuras|` = ~17 600 × 48 ≈ **850 000 pruebas por
frame** (17 ms medidos: el frame entero), y crecía con `playerScale³`. Ahora se itera **estructura a
estructura recortando** la caja del jugador contra la suya (mismo recorte que `mcFineBoxHit`) y solo se
recorren los voxels que de verdad caen dentro: 17 ms → **0,23 ms**. Es la misma lección de la colisión
fina — **barrer el AABB en voxels finos no escala**. Test: `node test_rayos_x.js` (dibuja el mismo
conjunto que la versión ingenua, no llama a `mcFineSolidAt` ni una vez, y 200 estructuras lejanas no
reciben ni una lectura).

## Bloques con comportamiento (`game.bloques`) — el material manda, no el voxel

Una escalera que se trepa, un muelle que impulsa, una placa que dispara algo al pisarla. El
comportamiento cuelga del **MATERIAL** (`hab:escalera`), **nunca del voxel**: es el modelo de
Minecraft (índice de paleta por voxel + comportamiento compartido por tipo). Un script por voxel
serían **442 368** closures en un mundo 96×48×96.

⚠️ **Un material vive en UNO DE DOS SITIOS y hay que mirar los dos.** Solo un asset **16³ macizo**
(`blockLike`, `app.js:4006`: `nvox >= 4096`, o sea hierba/roca) entra en `mc.grid`; cualquier cosa
**con forma o huecos** — `escalera.json` son 160 voxels — se estampa como **estructura fina**
(`mc.structures`), con malla propia a **1/16 de bloque** y **fuera de la rejilla**. Rayos-X lo canta:
`bloque · asset` vs `estructura · guardada`. `materialEn(x,y,z)` resuelve las dos vías —
`mc.grid[idx]` → id → `mc.blockKey[id]`, y si ahí hay aire, `claveFinaEn` (calco de `mcFineBoxHit`,
`app.js:4935`, devolviendo `s.key`). **Mirar solo `mc.grid` es ver medio mundo.**

```js
game.bloques.define('hab:escalera', { trepable:true, subida:4, bajada:5 });  // u/s
game.bloques.define('hab:placa',    { alPisar(c){ game.tp(51,20,50); } });   // c = {x,y,z,clave,cfg,veces,pos}
game.bloques.define('hab:muelle',   { impulso:12 });        // trampolín: u/s verticales al pisarlo
game.bloques.define('hab:muelle',   { altura:4 });          // lo mismo, dicho en bloques de altura
game.bloques.define('arena',        { impulso:12 });        // vale el nombre CORTO si no es ambiguo
game.bloques.define('hab:hielo',    { velocidad:2 });       // ×2 la marcha MIENTRAS se pisa (0.5 = barro)
game.bloques.define('hab:hielo',    { deslizamiento:1.2 }); // hielo de Minecraft: al soltar ASWD sigues rodando
game.bloques.info();      // clave EXACTA de lo que piso / tengo delante / detrás  ← el descubridor
game.bloques.lista(); game.bloques.quitar('hab:muelle'); game.bloques.avisos();
game.bloques.pasoSuave(0.06);   // segundos que tarda el ojo en subir un escalón; 0 = como antes
game.bloques.inercia(0.7);      // segundos que tarda la marcha en bajar al salir de un bloque rápido
game.bloques.define('asset:assets/cabeza.vox.json', { mirar:{ ejes:'xy', limites:{y:[-70,70]}, alcance:12 } });
game.bloques.define('asset:assets/guardian.vox.json', { seguir:{ objetivo:'jugador',   // 'jugador' · [x,y,z] · otra clave
  deteccion:16, distancia:2.5, velocidad:3, correa:24, volver:true, ejes:'xz', suavidad:0.12 } });   // la pieza te PERSIGUE
game.bloques.define('hab:cria', { seguir:{ objetivo:'hab:abeja' } });   // ...o persigue a OTRA pieza (la más cercana)
game.bloques.seguidores();   // quién persigue a quién, cuánto se ha ido del ancla y por qué está parada
game.bloques.recoger();      // todas a su ancla (botón de pánico); no les quita el cfg, siguen persiguiendo
game.bloques.mirones();      // qué piezas están girando ahora y cuánto
// tecla X (rayos-X): cada etiqueta lleva una cuarta línea con su comportamiento y sus giros X/Y/Z
game.bloques.roce(0.08);        // lo que se sigue patinando UNA VEZ FUERA del bloque deslizante
```

Todo vive en el snippet **`data/snippets/mundo-autoarranque.json`** (el JSON *es* la fuente; se edita
con Alt+C o reempaquetando el `code`, como `base-npc-skills.json`). Claves del diseño:

- **Caché densa `id → cfg`** invalidada por `mc.blockKey.length` (mismo truco que `mcXnameCache`,
  `app.js:5429`) ⇒ la consulta por frame es un índice de array.
- **Una sola costura**: envoltorio sobre `mcUpdate` (`app.js:5053`, única llamada en `app.js:6323`).
  Reejecutar el snippet **desenvuelve el anterior por `mcUpdate._orig` y reinstala el nuevo**; ni se
  apilan envoltorios (duplicaría la velocidad de trepado) ni se deja el viejo. Dejarlo puesto era peor
  de lo que parece: el envoltorio viejo sigue leyendo **su** tabla por closure, así que todo lo que se
  definiera después salía en `lista()`/`info()` y **no hacía nada en el mundo**. Al reinstalar, las
  definiciones anteriores se heredan pasándolas otra vez por `define()` (se renormalizan con el código
  actual). Si cambias el snippet, **sube `VERSION`**.
- **`mcSolid` NO se parchea** (lo usan mallado, raycast y romper/poner): la escalera es **sólida** y
  se sube *pegado* a ella ⇒ una escalera embutida en un hueco de 1×1 no se puede trepar.
- **Barrido acotado, no punto suelto**: desde el borde del cuerpo hacia delante, en pasos de **un
  voxel fino** hasta `ALCANCE` (0,45) — un panel fino de 1/16 casi nunca cae bajo un sondeo de un
  solo punto. El coste es **lineal** con `playerScale` y está topado (≤64 muestras); NO barrer el
  AABB del jugador, que crece con `playerScale³` (lección de la colisión fina).
- **Se sondea la COLUMNA ENTERA del cuerpo, no una altura fija.** `escalera.json` es una escalera de
  verdad: largueros en los bordes y peldaños solo en 2 de cada 4 filas, o sea **aire a la altura del
  pecho** en la mayoría de las alturas. Sondeando una sola altura solo se agarran los largueros — el
  dueño lo reportó como «sube por los laterales pero no por los escalones». `trepableEnColumna`
  recorre de los pies a la cabeza y se agarra al primer material trepable que encuentre, así que la
  **forma del dibujo deja de importar**. Es también lo que permite coronar: sondeando solo al pecho,
  el agarre se pierde con los pies 0,9 por debajo del remate, más de lo que sube el auto-escalón.
- **Soltar la tecla NO suelta la escalera**: sin `W`/`S` uno se queda **colgado** donde estaba, como
  en Minecraft. Caerse al dejar de pulsar (reportado por el dueño) obliga a subirlo todo de una
  tirada y convierte cualquier pausa en una caída desde lo alto. Solo sostiene a quien **ya venía
  agarrado**, para no enganchar a quien está de pie al lado; y si la física original encontró suelo
  (`mc.onGround`) se suelta, para no dejarlo flotando a un pelo del piso sin poder saltar.
- **Soltarse siempre tiene que ser posible**, o el jugador se queda pegado (reportado por el dueño).
  Bajando con S se anula la componente que despega de la escalera **solo mientras se está colgado**;
  en cuanto hay suelo debajo se suelta el agarre entero y se anda normal. Y el **espacio** es la
  salida de emergencia: estando agarrado `mc.onGround` es `false`, así que el salto de `app.js` no
  puede dispararse nunca y hay que reproducirlo en el snippet (por flanco, para no reimpulsar).
- El sondeo va **partido en dos** alrededor del `mcUpdate` original (`sondearAgarre` antes,
  `aplicarTrepado` después). Anular la gravedad *después* de aplicada pierde `22·dt²` por frame ⇒ la
  velocidad de trepado dependería de los fps (a 30 fps, el doble de pérdida que a 60).
- Se sondea **hacia donde MIRA el jugador**, también al bajar (con S se mira igualmente la escalera);
  sondear hacia atrás mira aire y «bajar» pasa a ser caída libre disfrazada.
- **`alPisar` es por flanco**, como `onEntityCollision` de Minecraft, en `try/catch` con aviso acotado
  — nunca una línea por frame (§22). La identidad del flanco es **celda + clave de lo pisado**, no
  solo la celda: una placa fina de 1/16 no cambia la celda de debajo al caer sobre ella.
- **`impulso` = trampolín estilo Quake**, y es *exactamente* el salto de `app.js:5090` (fijar
  `mc.vel[1]` + `mc.onGround=false`) pero sin pulsar espacio y con la fuerza que diga el material. Va
  por el mismo flanco que `alPisar`, así que se dispara al **entrar** en la celda, no cada frame, y
  rebota solo al volver a caer encima. Unidades: **u/s verticales** (el salto normal son `8.0`);
  `altura:N` es azúcar y se convierte con `v = √(2·g·h)`, `g = 22` ⇒ la altura sube con el **cuadrado**
  del impulso (`h = v²/2g`), doblar la fuerza cuadruplica el salto. Escala `∝√escala` como la marcha y
  el salto. La **inercia horizontal es gratis**: `app.js` conserva `vel[0]/vel[2]` intactos mientras no
  haya suelo, así que sales despedido con la velocidad que llevabas — pero eso depende de
  `game.airControl`; apagado, `define` avisa de que el tiro parabólico se convierte en salto vertical.
- **`define` acepta el nombre corto**: sin namespace, sin carpeta y sin extensión (`arena` →
  `asset:assets/arena.vox.json`, `escalera` → `hab:escalera`), y dice por consola cuál ha elegido. Lo
  que **registra** es siempre la clave larga, que es la que traen los voxels. Si el nombre corto vale
  para dos materiales **no elige**: enseña los candidatos y no registra nada. `quitar` entiende lo
  mismo. Un material inexistente sigue avisando y mandando a `info()`.
- **`velocidad` es CONTINUO, no un disparo por flanco** como `alPisar`/`impulso`: manda mientras el pie
  esté encima. Al salir, la marcha **no se corta en seco**: decae con `exp(-dt/τ)`, `τ` = `game.bloques
  .inercia(0.7)` s (`0` = como antes). Sin eso, **un solo bloque** de suelo normal entre el hielo y un
  trampolín te hacía llegar a marcha base (medido: 10 → 5 en un frame; con inercia, 9,4), que es como
  lo reportó el dueño: «llega al bloque impulso y pierde la velocidad». Es inercia de **rapidez, no de
  patinaje**: soltar las teclas sigue parando en seco, porque en el suelo `app.js:5089` pone `vel=0`
  cuando no hay dirección. El estado (`mc._velInercia`) vive en `mc`, así que **se arrastra entre
  pasadas de un test**: hay que reponerlo a 0 igual que `_pasoDesfase`. Se implementa poniendo **`mc.speed`**
  a pelo justo antes del `mcUpdate` original y restaurándolo en un `finally`, porque `app.js:5060` lo
  lee **una vez por frame** y de ahí salen tanto la marcha en el suelo como la aceleración en el aire.
  **NO se toca `game.playerSpeed`**: ese setter **persiste en `localStorage`**, así que un bloque le
  cambiaría la marcha al jugador para siempre. El producto se topa a **40 u/s** (el mismo techo que el
  setter): más rápido que eso y un frame de 1/60 avanza ~0,7 bloques, más que la media anchura del
  cuerpo ⇒ se atraviesan paredes. `define` avisa si el factor pide más de ese techo. Como el factor
  vive en el material, `velocidad:0` **no existe** — se dice `quitar(clave)`; tratar el 0 como «sin
  valor» es lo que mantiene `define` idempotente cuando el snippet se reejecuta y hereda la tabla ya
  normalizada. La inercia es marcha **llevada**, así que **pararse del todo la gasta**: si estás en el suelo
  sin tecla de rumbo y sin derrape, se pone a 0 en el acto. Antes decaía por **reloj** aunque estuvieras
  quieto, y con `×10` (recortado a 40 u/s) tardaba ~3 s: parabas, volvías a pulsar W y arrancabas a **×4,96**
  la marcha normal habiendo parado antes.
- **`deslizamiento` es lo otro: patinar al SOLTAR las teclas** (el hielo de Minecraft), y es *ortogonal* a
  `velocidad`/`inercia` — aquéllas cambian cuánto corres, ésta qué pasa cuando dejas de pilotar. **No se
  puede hacer dejando puesta `mc.vel`**, y ahí está el motivo de que sea la única parte de la librería que
  mueve al jugador a mano: en el suelo `app.js:5094` **reescribe `vel[0]/vel[2]` cada frame** desde las
  teclas y sin teclas los pone a **0 antes de mover**, así que cualquier velocidad que dejemos puesta se
  borra al frame siguiente sin haber avanzado nada. Por eso `deslizar(dt)` corre **después** del `mcUpdate`
  original: guarda la marcha llevada en `mc._deslizVel`, la decae con `exp(-dt/τ)` (igual a 30 que a 120 fps)
  y avanza con el **mismo `mcMoveAxis`** que usa `app.js`, para que muros y auto-escalón se comporten
  idéntico; si un eje no se movió, se anula esa componente. `τ` = los segundos del propio bloque mientras lo
  pisas, y `game.bloques.roce(0.08)` **una vez fuera** (sales patinando, no flotando). **Con una tecla de
  rumbo pulsada no se conduce nada**: `app.js` ya movió al jugador ese frame, así que empujar además lo
  movería **dos veces** — se notaba como un acelerón (×1,56 medido) al salir de una pista rápida con W
  puesta. Patinar es lo que pasa **cuando sueltas**, no un extra que se suma a andar. En el aire **no toca
  nada**: `app.js` ya conserva la inercia horizontal él solo, solo sigue el vector para retomar el derrape al
  aterrizar. La marcha llevada solo se **crea** encima del bloque y se apaga por debajo de 0,05 u/s, así que
  andar normal queda exactamente igual (medido: tras soltar ASWD, 0,773 de los 0,833 de un tramo a marcha
  entera con `deslizamiento:1.2`; **0,000** sin él). Colgado de una escalera no se patina. `mc._deslizVel`
  vive en `mc` — mismo cuidado que `_velInercia`: **reponerlo a `null` entre pasadas de un test**.
- **`pasoSuave` sube el ojo, no el cuerpo.** `app.js` sube los escalones **de golpe** dentro de un
  frame (`mcMoveAxis`: `p[1] += h`, hasta `MC_STEP=0.6`), y en una escalera de peldaños de 8 voxels
  eso se ve como saltos de y+0,5. Se tapa como en Minecraft: **la física no se toca** (misma colisión,
  mismo alcance de escalón, mismo tacto) y solo se **pinta** al jugador un poco más abajo, desfase que
  se consume en ~0,1 s. Mecánica: el ojo se calcula en **seis** sitios de `app.js` a partir de
  `mc.pos[1]`, así que el desfase se **resta al salir** del frame y se **repone al entrar** en el
  siguiente — entre medias solo hay dibujado. Se repone la y **guardada**, no `pos[1]+desfase`: sumar
  y restar no devuelve el mismo float y ese pelo acabaría en la colisión (el test compara los 90
  frames con `===`). Decae con `exp(-dt/τ)`, o sea igual a 30 que a 120 fps, y se recorta a un escalón.
  **El escalón se mide dentro de `mcMoveAxis`** (segundo envoltorio del snippet), porque ahí el único
  efecto sobre la `y` es el `p[1]+=h` del auto-escalón y sus dos únicos llamantes son las dos líneas
  horizontales de `mcUpdate`; así saltar y trepar no se cuelan sin necesidad de ninguna heurística.
  **No se puede deducir al final del frame preguntando `mc.onGround`**: en `app.js:5089-5098` la
  gravedad va **antes** del horizontal, así que el frame del escalón acaba con `vel[1]=0`,
  `ny === p[1]`, sin colisión y con **`onGround` false** — una guarda de «estar en el suelo» se apaga
  justo en el único frame que hay que suavizar. El estado vive en `mc`
  (`_pasoDesfase`/`_pasoReal`/`_pasoY`/`_pasoSubido`), no en un closure, para
  que reejecutar el snippet herede el desfase en vez de dejar al jugador medio bloque hundido; si la
  `y` no es la que se pintó, alguien movió al jugador (`game.tp`, respawn, un `alPisar`) y el desfase
  se tira.
- **`mirar` gira la pieza hacia algo, y es lo ÚNICO de la librería que necesitó tocar `app.js`.** Los
  `rot` del mundo son de **90° en 90°** y cada paso se **hornea en su propia malla**
  (`mcStructGeom`, cacheada en `mc.structs[srcKey].meshRot[rot]`): girar así es un tirón y encima
  recompila geometría. Por eso el giro continuo va **encima**, como matriz por instancia. El reparto
  es el mismo que con `mc.sunExtra`: **`app.js` expone la capacidad, el snippet decide el
  comportamiento** — `app.js` no sabe qué es `mirar`, solo aplica `s.model` si está.
  - Lo que se añadió a `app.js`: `uniform mat4 uModel` en los **dos** programas de estructura
    (`MC_STRUCT_VS` y `MC_STEX_VS`) y en la pasada del sol; `mcModelOf(s)` (identidad si no hay
    matriz) puesto **siempre** antes de cada `drawArrays` de estructura, porque el uniform es estado
    y si no se pone se hereda el de la instancia anterior. `vWorld` pasa a ser la posición **ya
    transformada**, o sea que la búsqueda de sol/sombra sigue al giro.
  - **Culling:** `s.aabb` se calculó de los vértices, que van en **coordenadas de mundo y sin girar**,
    así que una pieza rotada se sale de esa caja y el frustum la borraría al asomar por el borde.
    `mcStructVisible` infla: centro pasado por la matriz **± la semidiagonal** (vale para cualquier
    giro). Sin `s.model` llama a `mcChunkVisible` tal cual: mismo coste de siempre.
  - **Sombra:** una pieza que gira **no cambia ni un vértice**, así que sin más su sombra se quedaba
    clavada en la pose horneada. La matriz entra en la firma de **movimiento** (no la de geometría):
    se re-hornea a ~22 Hz, igual que los agentes que andan.
  - **Lo que NO gira, a propósito:** la **colisión** (el bitset se horneó con la orientación de `rot`:
    sigues chocando con la pose original — da igual para una cabeza en un pedestal, no para un puente
    giratorio) y el **sombreado por cara**, que también viene horneado, así que la cara iluminada gira
    con la pieza.
  - **Solo estructuras, y eso no se ve en el prefijo**: el mundo del dueño está lleno de estructuras
    `hab:` (`hab:cubo-trans`…). Se valida mirando si hay alguna instancia viva con esa clave, no por
    `asset:`. Un material de terreno está fundido en la malla de su chunk junto a miles de celdas.
  - `limites` se mide **desde la orientación de origen**: el motor descuenta el cuarto de vuelta ya
    horneado en `rot` (`yaw = rot&3`), y el sentido del giro es el de `mcRotXZ` para que la capa
    continua y los pasos horneados vayan en la misma dirección. `frente` corrige en grados si el
    dibujo no mira hacia `-Z`.
  - **Dejar de mirar tiene dos motivos y los dos acaban igual: volviendo despacio a la pose de
    origen** y **soltando la matriz** (`model = null`), para que `app.js` recupere su camino de
    siempre. Uno es salirse de `alcance`; el otro es **no poder girar tanto** — si el ángulo pedido
    se sale de `limites`, la pieza se **rinde** en vez de quedarse clavada en el tope, que es la
    postura de un maniquí mirando a la pared (el dueño lo reportó así: se le ponía detrás y la cabeza
    se quedaba en `-70,00°` para siempre). O sea que `limites` es un **cono de atención**, no un
    recorte: dentro se sigue al objetivo con el ángulo exacto, fuera se vuelve a casa.
  - El **cabeceo** al tope **no** cuenta como rendirse: llegar al límite del cuello mirando hacia
    arriba es seguir mirándote, y si contara, pegar un salto apagaría la cabeza entera de golpe.
  - **El pivote elige por dónde se engancha.** Sin él se gira sobre el centro de la caja, que en una
    pieza de dos bloques cae en el **codo** y no en el **hombro** — así lo reportó el dueño con
    `brazo.vox.json`. Se dice de tres maneras, y **el literal gana** por ser lo más concreto:
    - **`pivote: 2`** = el nº2 de los **DIBUJADOS con la herramienta 📍** del editor (ver abajo). Sin
      poner nada se usa **el primero que haya dibujado**, así que lo normal es no escribir la línea.
    - **`pivote: 'auto'`** = el de la cara por la que **esa instancia** está pegada a algo (abajo).
    - **`pivote: [x,y,z]`** a mano, en **coordenadas del objeto** (bloques desde su esquina; 1 bloque
      = 16 voxels del dibujo).
    - Va en coordenadas del objeto y **no** del mundo porque la tabla es por MATERIAL: hay que
      deshacer el `rot` (con `rot` impar los lados X y Z de `s.aabb` salen intercambiados) para que
      una sola línea sirva estampes la pieza donde la estampes. Salirse de la caja vale: un hombro
      puede caer en el cuerpo. El culling no necesita nada: `mcStructVisible` pasa el centro **por la
      matriz**, que ya lleva la traslación del pivote.
    - El dibujado **no se puede resolver en `define()`**: es síncrono y el JSON del objeto viaja por
      red. Se pide con `getRoomData(clave)` y se le pone el `piv` a la config que **ya está viva**, o
      sea que la pieza arranca girando sobre el centro de su caja y se recoloca sola en el primer
      frame que haya datos. Si el objeto no trae ese pivote, avisa **solo si se pidió por número**
      (no ponerlo significa «si lo hay»).
    - ⚠️ **Con `ejes:'y'` la altura del pivote no se nota.** El giro es sobre la vertical **del
      pivote**, y todo punto de esa vertical queda fijo: subir el enganche de un brazo que cuelga no
      mueve ni un voxel. El pivote alto solo se ve cuando hay **cabeceo** (`ejes:'xy'`).
  - **`pivote: 'auto'` — manda la cara por la que la pieza está PEGADA.** La tabla es por MATERIAL,
    pero contra qué está pegada cada pieza es cosa de la **instancia**: el `brazo.vox.json` del dueño
    lleva sus dos pivotes en **caras opuestas** (x=15 y x=0) justo porque el mismo brazo se estampa a
    un lado o al otro del cuerpo y tiene que colgar del hombro **que toca**. Con `'auto'` se mira
    contra qué está pegada cada una y se coge el pivote de esa cara; **si no toca nada por una cara
    con pivote, cae al nº1** (o sea, lo mismo que no poner nada). Reglas y por qué:
    - Un pivote **pertenece a la cara más cercana** del bbox del dibujo (sin umbral: siempre hay
      respuesta, y para uno dibujado en el borde la distancia es 0). Varios en la misma cara: manda
      el de **menor número**.
    - Con **varios contactos gana el de más superficie pegada**; a igual superficie, **abajo → lados
      → arriba** (`PRIO_CARA`). Una cara pegada **sin pivote dibujado no cuenta**.
    - **La normal con la que se estampó NO se guarda**, así que el contacto se deduce del mundo:
      se sondea **medio voxel fino más allá del plano** de cada cara, no el centro de la celda
      vecina — un panel de 1/16 pegado a ras ocupa 1/16 de su celda y desde el centro no se ve. Va
      por `materialEn`, o sea que también detecta **estructuras finas** (pegarse al cuerpo de un NPC).
    - ⚠️ **`rot` no son solo cuartos de vuelta**: `(rot>>2)&3` es el **vuelco**, y con él el «abajo»
      del dibujo puede acabar tocando **de lado**. La cara objeto→mundo se convierte por el mismo
      camino que `mcStructGeom` (vuelco y luego giro); mirar solo `rot&3` elige el pivote equivocado.
    - **Se resuelve UNA vez por instancia** y se cachea **en la instancia** (nunca en una lista
      aparte: `mcRestampAll`, ver abajo). Si cambia el **mundo** (rompes el suelo bajo una pieza),
      `game.bloques.repivotar()` lo vuelve a abrir; si cambia la **config**, `define()` ya lo olvida
      solo — sin eso, redefinir el brazo con `'auto'` en la consola no movía ni una pieza y parecía
      que la opción no existía (salió en el Mundo de verdad, no en el de juguete).
    - Rayos-X lo dice por instancia: `· pivote nº2 (pegada por -X)` o `(por defecto: no toca nada)`.
      Sin eso, dos piezas del mismo material girando distinto se leen como un fallo.
  - **`pivotes: { 1:{…}, 2:{…} }` — giros y límites propios de CADA pivote.** Lo de fuera es la base
    y cada bloque la pisa, así que lo común (`objetivo`, `alcance`…) se escribe **una sola vez**.
    Cada variante se normaliza con la misma función, o sea que valen todas las claves y todos los
    avisos. Es lo que permite que el hombro nº1 tenga un cono cerrado y el nº2 uno abierto **sin
    duplicar el material**. Pedir un bloque para un pivote que el dibujo no trae avisa y dice con qué
    herramienta ponerlo.
    - ⚠️ Reejecutar el snippet **re-define cada material desde la tabla YA NORMALIZADA** (el bloque
      `heredado` del final), así que `normalizarMirar` tiene que **saber leerse a sí misma**: además
      de `pivote`/`limites` ya lo hacen `vars` (los bloques por pivote), `frenteX` y `senX/senY`. Sin
      eso lo escrito en la consola **se degrada solo** al recargar y la pieza cambia de postura sin
      que nadie haya tocado nada.
  - **`mirar` apunta la CARA de la pieza (su `-Z`), no su eje largo**, y eso invierte el cabeceo de
    todo lo que apunta con el eje largo. Un brazo que cuelga apunta hacia **`-Y`**: el mismo cabeceo
    que le sube la cara a una cabeza le **aparta la punta** al brazo, así que con el jugador por
    debajo del hombro (el caso normal, andando por el suelo) el brazo se iba hacia atrás — el dueño
    lo reportó así. Se arregla con **`sentido: { x:-1 }`** (y `{ y:-1 }` espeja el giro). Es un
    signo, no un parche a un caso: invierte los dos lados.
    - ⚠️ Pero `sentido` **inclina, no apunta**: la pieza se ladea tantos grados como la elevación del
      objetivo, o sea **casi nada de lejos y un barrido de golpe al acercarse** (medido en el mundo
      del dueño andando hacia el brazo: cabeceo de −5° a 11 bloques → +64° a 1 bloque). Así lo
      reportó: «al acercarme el brazo gira y entonces ya apunta».
  - **`frente: { x:-90 }` es lo que separa APUNTAR de INCLINARSE.** `frente` (que ya existía como
    número para el giro) pasa a admitir `{ x, y }`: son los grados hacia los que **ya apunta el
    dibujo**, para descontarlos. Una pieza que apunta con su **eje largo** — brazo, cañón, aguja —
    apunta hacia abajo, o sea `{ x:-90 }`, y entonces el cabeceo que sale es `elevación + 90°`, que
    es el que la deja apuntando **a cualquier distancia** (medido: desvío 0° de 11 a 1 bloque). Con
    esto `sentido` sobra para el brazo; el número suelto sigue significando el giro de siempre.
    - Los `limites` se miden desde la pose de origen, así que con `frente:{x:-90}` el `x:[-90,90]` de
      serie deja la pieza sin poder pasar de la horizontal: para que se levante hay que abrirlo
      (`limites:{ x:[-90,180] }`). Con ese `frente` el cabeceo se lee así: **0 = colgando, 90 =
      horizontal, 180 = tieso hacia arriba**.
    - ⚠️ **`frente.x` tiene que ser el HONESTO, no el que "queda bien".** El dueño lo tuvo en `-180`
      y el brazo parecía apuntar: en realidad el cabeceo pedido era `elevación+180` (90..270), o sea
      **siempre pinzado en el tope de arriba**, clavado en la horizontal a cualquier distancia y con
      `limites.x[0]` que no llegaba a tocarse nunca (su «xmax sube el brazo, xmin no parece ir»).
      Medido: con `{x:-180}` el cabeceo vale 90° a cualquier altura del jugador; con `{x:-90}`, 59°→90°.
  - **`sinVolteo: true` para piezas ESPEJO (dos brazos con `rot` opuesto).** Una misma dirección se
    apunta con **dos** posturas — `(giro, cab)` y `(giro+180, 180−cab−2·frenteX)` — y dejan la punta
    exactamente igual. Por defecto se coge la primera, que es la natural para una cabeza; pero dos
    piezas iguales puestas con `rot` opuesto acaban las dos en la **misma orientación absoluta**, así
    que una tiene que **darse media vuelta sobre sí misma** para llegar: el dueño lo reportó como «el
    brazo izquierdo gira por la espalda y acaba con los dedos del revés». Con `sinVolteo` se elige la
    postura que **menos gira** sobre su eje vertical y lo que sobra sale por el cabeceo, que es lo que
    hace un hombro: el brazo espejo se queda con el giro casi a cero y **sube por delante**, el mismo
    movimiento que el otro. Detalles que no son opcionales:
    - Exige `ejes:'xy'` (sin cabeceo no hay con qué compensar la media vuelta) y **el `frente.x`
      honesto**, porque la postura alternativa se calcula con él.
    - El cabeceo se **pinza con `limites.x` ANTES** de convertirlo, para que `x:[30,90]` signifique
      «cuánto levanta el brazo» en los dos y no una cosa y su negativa.
    - **Banda muerta 80/100°** en vez de 90 pelado: en la frontera las dos posturas son igual de
      válidas y sin histéresis plantarse ahí hace **aletear** la pieza. Rayos-X marca con **`↺`** la
      instancia que está en la otra postura (si no, un cabeceo negativo parece un error).
  - **El cabeceo va sobre el eje izquierda-derecha DE LA PIEZA, no sobre el X del mundo.** La matriz
    es `Ry(giro)·Rx(cabeceo)·Ry(-horneado)`: hay que **deshacer** el cuarto de vuelta ya horneado en
    `rot`, cabecear, y volver a ponerlo. Con el `Rx` a secas solo acierta la pieza estampada sin
    girar — a media vuelta cabecea **al revés** (el dueño lo reportó como «salto y la cabeza mira
    hacia abajo») y de perfil no cabecea nada, **rueda de lado**. El **yaw** no lo delata porque gira
    sobre el mismo eje que lo horneado y los dos conmutan, así que el bug se esconde hasta que se usa
    `ejes:'xy'`. Al probarlo hay que aplicar la matriz a la **cara ya horneada**, no a `(0,0,-1)`:
    contra `-Z` el error se cuela entero.
  - **NO se puede cachear qué piezas miran.** Al terminar de cargar, `mcRestampAll` desestampa y
    vuelve a estampar **cada** instancia (`splice` en `app.js:5772` + `push` en `app.js:6096`): el
    array de `mc.structures` es **el mismo**, tiene **el mismo número** de elementos, y **ni uno**
    es el objeto de antes. Ninguna firma barata lo ve (ni el recuento, ni la identidad del array —
    las dos se probaron y las dos fallan), así que una lista cacheada acaba poniéndole la matriz a
    instancias **muertas**, que ya no se dibujan: el dueño lo reportó como «la cabeza no me mira al
    cargar, solo si reejecuto el snippet». Se recorre `mc.structures` entera cada frame, que al lado
    de lo que ya hay sale gratis: `mcRender` la recorre **cuatro veces por frame** solo para cullear.
- Solo afecta al **jugador**; los agentes siguen con su `climb`/`drop`.

### `seguir` — la pieza se mueve de sitio (v1.18)

Es la primera capacidad que **desplaza** una estructura. Mover una estructura en este motor tiene dos
mitades que se pueden desincronizar, y casi todo el diseño va de mantenerlas pegadas:

| | dónde vive | ¿sabe de `s.model`? |
|---|---|---|
| lo que se **ve** | `s.model` (matriz por instancia) | sí: culling (`app.js:5249`) y sombra del sol (`app.js:4758`, `4789`) ya transforman por ella |
| lo que se **toca** | bitset fino de `mc.structs[key]` | **no**: se sondea con base `bx = s.ox*T` (`app.js:5064`) |

**Por qué el movimiento NO toca `s.ox/oy/oz`.** El ancla es lo que `mcSerialize` escribe en
`mundo.json` (`app.js:6333`) y lo que al cargar se trunca con `|0` (`app.js:6358`). Moverla dejaría la
pieza dando saltos de bloque entero y **guardaría una posición que el dueño no puso**. Así que el
desplazamiento va en `s.model` (traslación en la última columna) y el ancla se queda quieta.
Consecuencia buscada: **al recargar el mundo la pieza vuelve a su ancla**.

**La solidez son tres envoltorios, ninguno en `app.js`** (§0). Todo el sondeo fino del motor entra por
dos globales, así que basta envolverlas:

1. `mcStructColl(s)` → `null` si la instancia está desplazada. Con eso **el ancla deja de ser sólida**
   en cuanto la pieza se va (si no, quedaría un muro invisible donde estaba), y vale de golpe para
   colisión, raycast, pegar bloques y el resaltado.
2. `mcFineBoxHit(...)` → si el original dice que no, resta el desplazamiento (redondeado a voxel fino)
   a la caja de consulta y prueba el mismo bitset. Como **toda** la colisión fina pasa por aquí, con
   un solo envoltorio la pieza es sólida para el jugador, para el rayo de romper y para pegar bloques.
3. `mcStructAt(...)` → lo mismo, para poder **romperla donde se la ve**.

Salida rápida: si no hay ninguna desplazada, los tres devuelven lo del original sin mirar nada
(`mcCollides` se llama varias veces por frame **y por eje**).

**Detalles que no se adivinan:**

- Con `ejes:'xz'` la distancia se mide **en planta**, y la Y la manda el suelo (`mcSurfaceNear` sobre
  la **huella entera**, quedándose con la columna más alta). Sondeando solo la columna del centro, un
  escalón se comporta como un muro: lo tiene bajo el morro y no bajo el centro.
- Seguir a **otra pieza** usa los centros **leídos antes de mover a nadie**. Ese desfase de un frame
  es lo que hace que el orden del array no importe y que un ciclo (A sigue a B y B sigue a A) sea una
  pareja que se persigue, no un cuelgue.
- `distancia` es un **sitio donde estar**, no un mínimo: si te acercas de más, retrocede.
- La `correa` pinza la **meta**, no el resultado: pinzar el desplazamiento después de moverse sería un
  tirón hacia el ancla sin comprobar el terreno por el camino.
- Quitar `seguir` (o `quitar()`, o redefinir sin él) **recoge la pieza**. Es obligatorio: una pieza
  desplazada sin nadie que la mueva se quedaría ahí para siempre y, como el ancla ya no es sólida,
  sería un fantasma permanente. Un `define` que **sí** trae `seguir` no la recoge, para que afinar
  `velocidad` no sea un teletransporte a media persecución.

**Límites conocidos** (a propósito, no pendientes):

1. **Sin pathing**: va en línea recta y resbala por las paredes; un laberinto la atasca (`por = 3`).
2. **La luz emisiva no se mueve**: `emitCells` se siembra desde `s.ox` (`app.js:4908`), así que el
   brillo de una pieza emisiva se queda en el ancla.
3. **La sombra de suelo del aabb** (`app.js:6433`) usa `s.aabb`: se queda en el ancla.
4. **No te lleva encima**: si estás subido y se mueve, no te arrastra (no hay plataformas móviles).
5. **La colisión no gira**: con `mirar`, la forma sólida es la horneada sin el giro — igual que hoy.
6. **Dos seguidores no chocan entre sí**: a propósito. Sí chocan con el **decorado** desde v1.24
   (abajo); lo que no se sondea son las estructuras **desplazadas**, que son justo los demás
   seguidores.
7. **Se guarda el ancla, no el sitio.**

#### El decorado también para a un agente (v1.24)

Hasta v1.23 un seguidor —el zombie, el perro— **atravesaba las casas**: el sondeo miraba solo
`mc.grid`, así que el terreno le paraba y las estructuras no. Ahora `pasoSeguir` prueba **las dos
solideces** (`chocaMundo = chocaTerreno || chocaEstructura`), y la fina pasa por
**`mcFineBoxHit._orig`** — el original, no el envoltorio de v1.18. Es lo que mantiene el límite 6: el
envoltorio es quien añade las estructuras **desplazadas**, o sea los demás seguidores, y saltárselo
evita además pagar un barrido fino por eje y frame sobre piezas que se están moviendo. Lo que se
sondea es el **decorado**, que es lo que se queda quieto. El sondeo se marca con el mismo centinela
`yoSondeando` que ya evitaba que una pieza se encontrara a sí misma.

**«Como hacen los bloques» tiene dos mitades**, y la segunda es igual de importante: un bloque de 1 de
alto **se sube**, no para. Así que en `asentar`, si lo que estorba es **solo** estructura
(`!chocaTerreno && chocaEstructura`), se prueba a treparla en pasos de 1/16 hasta 1 bloque —
exactamente lo que el jugador hace con `mcMoveAxis`/`MC_STEP` y lo que `mcSurfaceNear` ya le sube al
agente por el terreno. Sin esto, una alfombra o un bordillo de 1/16 sería un muro invisible. Un muro
de más de un bloque sigue parando, porque ninguna de las 16 alturas queda libre.

⚠️ **Consecuencia nueva: un agente plantado DENTRO de una estructura nace atascado para siempre.**
`mcSurfaceY`/`mcSurfaceNear` solo leen `mc.grid`, así que eligen una altura ciega al decorado; antes
daba igual porque se atravesaba, y ahora no. Se ve en `game.esqueletos.lista()` como `por: 3`
(`estado: "bloqueada"`) sin haberse movido nunca. Si pasa, plantar el bicho en otro sitio.

#### El clic izquierdo sobre un agente es un GOLPE, no un roto (v1.25)

Un agente **no se rompe a clics**. Antes sí: `mcBreak` (`app.js:6414`) marcha el rayo fino desde el
ojo y **retira entera** la primera estructura que toca, y si es `efimera` se va además **sin historial
y sin guardar** (`app.js:6426`) — que es exactamente lo que son sus piezas. Y como la única pieza
**sólida** de un rig es su **raíz** (las extremidades no tienen colisión), lo que el rayo encontraba
era el torso: el clic se llevaba *el cuerpo* y quedaban cinco miembros congelados en el aire.

Ahora ese clic **empuja**, como pegarle a un mob de Minecraft: el bicho sale despedido hacia atrás,
**pega un brinco** y vuelve andando. Se hace envolviendo `mcBreak` desde la librería (**ni una línea
de `app.js`**, §0), repitiendo **su mismo rayo** — mismo ojo, mismo paso de 1/16, mismo alcance — para
saber qué gana: si lo primero que toca es una pieza de agente, el clic **se come ahí**, así que
tampoco se rompe el terreno de detrás. Cualquier otra cosa va al original y se rompe como siempre.
**Para retirar un agente está `game.esqueletos.quitar(id)`**, no el pico.

```js
game.esqueletos.empujar(rig)              // el golpe a mano: lo aleja del jugador (lo que hace el clic)
game.esqueletos.empujar(rig, 20)          // ...con la fuerza que se diga (0 = la del documento)
game.esqueletos.empujar(rig, 8, 1, 0)     // ...o en la dirección que se diga (en planta)
```

En el documento del agente, opcional: `empuje: { fuerza: 8, freno: 0.15, salto: 4.5 }` (u/s, τ del
frenado en s, y velocidad vertical del brinco). Sin ponerlo, todos los bichos ya golpean igual.

**Dos cosas que no son detalles:**

1. **El empujón es una velocidad que se frena sola, no un teletransporte.** De ahí salen gratis que
   se pare contra una pared (mueve la raíz por `moverRaiz` → `asentar`, la misma colisión que un
   paso) y que el bicho **vuelva solo**, porque el que persigue sigue persiguiendo mientras vuela.
2. **El brinco no puede vivir en `g.y`.** Con `ejes:'xz'`, `asentar()` **reescribe** la Y de la raíz
   desde el suelo cada vez que la pieza se mueve — pero *solo* cuando se mueve. Va aparte (`alto`,
   altura sobre el suelo), se **descuenta antes de andar** y se vuelve a sumar después; dejándolo
   puesto se acumula en los frames en que el bicho está quieto y el zombie acaba en el cielo.

Y el efecto colateral que faltaba: si a un rig le desaparece la raíz por cualquier otro camino (un
script, una versión vieja), **se retiran sus piezas sueltas y el agente se da de baja** en vez de
quedarse a medias. La condición distingue eso de un `mcRestampAll`, donde faltan **todas** a la vez y
lo correcto es esperar a que vuelvan.

**Límites, a propósito:** el empujón avanza **eje a eje y sin sub-paso**, igual que andar, así que un
golpe fuerte contra una pared muy cerca lo deja quieto en vez de pegarlo a ella; el golpe **no hace
daño** (no hay vida ni combate) y **no hay animación de dolor**.

#### Los agentes pisan el mismo suelo que tú (v1.26)

Las conductas de `game.bloques.define` (`velocidad`, `altura`, `deslizamiento`, `impulso`) estaban
escritas **solo para el jugador**: son envoltorios de `mcPlayerStep` que tocan `mc.speed`,
`mc.vel[1]` y `mc._deslizVel`. Un agente articulado andaba por encima de todo eso: sobre hielo iba
igual de lento, el trampolín no le hacía nada y un borde no le hacía caer.

v1.26 lee **esa misma tabla** desde los pies del bicho, con `sueloDe(aabb, g)`: medio voxel **bajo**
su caja, en el centro de la huella y con la **misma identidad de flanco** (celda + clave de
material) que usa `pieEn` para el jugador. Va **encendida por defecto** — un agente que ignora el
suelo que pisa es el fallo, no la conducta normal. En el documento del agente:

```js
fisica: { marcha:true, desliza:true, impulso:true, cae:true, placas:false, peso:1, caida:12 }
fisica: false   // apagada entera
```

- **`marcha`** — el `velocidad` del bloque multiplica su paso (hielo ×2, barro ×0.5).
- **`cae`** — `asentar()` pega la raíz al suelo de su nueva columna **de golpe**; ese salto hacia
  abajo se convierte en altura sobre el suelo (`mov.alto`) y **cae**, con la misma `GRAVEDAD` (22)
  que tú. `caida` son los bloques que **se atreve a bajar**: más que eso y no da el paso.
- **`impulso`** — el trampolín lo lanza, dividido por `peso` (un bicho pesado bota menos). Dispara
  **una vez por flanco**, con la misma clave `pisada` que evita el rebote infinito del jugador.
- **`desliza`** — al dejar de andar sigue rodando; el `deslizamiento` del material es la τ del
  frenado exponencial, no una distancia.

**Tres decisiones que no son detalles:**

1. **`alPisar` NO se dispara** (`placas:false` por defecto). Los `alPisar` ya escritos están
   pensados para el jugador y llaman a `game.tp(...)`: un zombie pisando una placa **te
   teletransportaría a ti**. Se enciende a sabiendas, con un `alPisar` que mire quién pisa.
2. **El brinco y la caída viven en `mov.alto`, no en `g.y`**, por lo mismo que el golpe de v1.25: en
   `xz` la Y de la raíz la **reescribe** `asentar()` desde el suelo cada vez que la pieza se mueve.
3. **El camino del jugador queda byte a byte igual**: la física del agente entra por un parámetro
   opcional al final (`F`) que solo pasan los esqueletos, así que `seguir` por material no cambia de
   comportamiento.

**Trepar (escaleras) se queda fuera a propósito**: `trepableEnColumna()` está atado a las claves de
`mc.pos` y hay que extraerlo para que acepte una caja cualquiera. Es un trabajo aparte, no un olvido.

Test: `§18` de `node test_bloques_comportamiento.js` — velocidad ×1/×2/×0.5, caída de 4 bloques,
`impulso:12` subiendo los 3,17 bloques que predice `v²/2g`, y el patinazo de hielo pasándose de largo
(1,199 frente a 0,716 en seco).

**Punto de extensión `mundo-autoarranque` (excepción al §0, aprobada por el dueño).** Los snippets no
se autoejecutan (solo a mano desde Alt+C), así que la escalera dejaba de ser escalera en cada recarga.
`mcAutoarranque()` (final de `openWorld`) ejecuta ese snippet si existe: `app.js` **no sabe qué hace**,
solo ofrece dónde engancharse; si no hay snippet, el Mundo se comporta como antes. Editar el snippet
exige recargar la pestaña (o reejecutarlo a mano, que es idempotente).

Test: `node test_bloques_comportamiento.js` (headless, con un mundo de juguete; sin navegador),
`node test_giro_navegador.js` (el `mirar` de arriba: comprueba en Chromium que la **identidad dibuja
exactamente lo mismo** que no poner matriz, que una traslación **sí** mueve la pieza — o sea que
`uModel` llega al shader y no se queda en una variable que nadie lee — y que a la distancia donde la
caja cruda ya sale del visor la inflada sigue dibujando; los ángulos y límites se prueban headless,
porque lo que el navegador aporta es que **se dibuje**) y
`node test_fisica_navegador.js` (**el `app.js` de verdad** con playwright: monta una plataforma con un
escalón, anda contra él llamando al `mcUpdate` real, lee la altura de la cámara de la matriz de vista y
cronometra el avance con y sin `velocidad`; deshace los bloques y bloquea `POST /api/mundo`). El segundo
existe porque el juguete **calcaba mal el orden de `mcUpdate`** (gravedad después del horizontal) y dio
81 ok a un suavizado que en el juego no hacía nada: cuando la física del juguete se separa de la real,
esa diferencia es exactamente el bug. Todo lo que dependa de la **secuencia** de `mcUpdate` (o de que un
enganche corra en el sitio correcto) se prueba ahí, no en el juguete.

### `game.esqueletos` — agentes articulados (v1.19)

`seguir` cuelga del **material**: dos brazos de la misma clave perseguirían cada uno por su cuenta y
acabarían amontonados en el mismo punto. Un muñeco necesita lo contrario — varias piezas que se mueven
como **un solo cuerpo** —, así que un rig es **por instancia** y vive en un registro aparte
(`esqueletos[]`), no en la tabla por material. El primero es un zombie
(`data/agentes/zombie.json`), pero la librería **no sabe qué es un zombie**: recibe un
documento con piezas, articulaciones y guion.

```js
game.esqueletos.crear(doc, x, y, z)   // lo planta de pie ahí; promesa con su handle
game.esqueletos.crear('zombie', ...)  // …o el id de uno guardado, que es lo normal
game.esqueletos.lista()               // quién hay vivo, dónde, y qué está haciendo
game.esqueletos.quitar(id)            // o .quitar() para llevárselos a todos
```

**`game.agentes` y `game.esqueletos` no son sinónimos** (v1.21): `game.agentes` son los **documentos
guardados** en `data/agentes/*.json` (qué bichos sabemos hacer) y `game.esqueletos` es lo **vivo en este
mundo** (qué bichos hay ahora y dónde). Guardar no planta nada; plantar no guarda nada.

```js
game.agentes.lista()            // [{id, nombre, piezas, savedAt}] — GET /api/agentes
game.agentes.cargar('zombie')   // el documento entero
game.agentes.guardar(doc)       // POST; el id sale del slug de `nombre`
```

El almacén es el de habitantes clonado (`/api/agentes`, GET·POST·PATCH·DELETE, a papelera y nunca
borrado real), con **una diferencia que importa**: al guardar, el documento se copia **entero** y el
servidor solo le impone `id` y `savedAt`. Las claves que no conoce **viajan intactas**, para que ampliar
el formato no vacíe los agentes ya guardados al reguardarlos desde una versión vieja del panel. Es lo
único de esta parte que no se ve en pantalla y lo que más caro costaría descubrir tarde, así que tiene su
prueba: `node test_agentes_api.js`.

⚠️ **El bicho se edita en `data/agentes/zombie.json`**, no en el snippet. `agente-zombie.json` ya solo
dice *dónde* y *cuándo* se planta (`game.esqueletos.crear('zombie', …)`); hasta la fase 2 llevaba dentro
una segunda copia del documento y tocar una dejaba a la otra mandando en el test.

⚠️ Después de tocar `server.py` **hay que reiniciarlo** (`python3 server.py 8500`): Python no recarga el
fichero solo y los endpoints nuevos dan 404 hasta entonces — con el zombie eso se ve como «el snippet ya
no planta nada», que no se parece en nada a la causa.

**Sus piezas son efímeras.** `s.efimera` (la única marca del rig que vive en `app.js`, §0 aprobado) hace
que `mcSerialize` las salte y que no entren en el historial de deshacer: el zombie existe mientras
juegas y desaparece al recargar, y `mundo.json` queda byte a byte como estaba. Verificado en el Mundo del
dueño: con el zombie plantado, `mcSerialize()` sigue devolviendo sus **269** estructuras de siempre.

**Dos centros de giro, dos matrices.** El cuerpo gira sobre el eje vertical de su raíz y la extremidad
cabecea sobre **su** hombro, así que `M = T(g) · Ryaw(cuerpo) · T(o) · Rart(articulación)`. Con un solo
centro el hombro se despega del torso en cuanto el cuerpo gira 90°, que es justo lo que prueba §17.

**El ciclo de andar avanza con la DISTANCIA recorrida, no con el reloj** (`fase += avance · cadencia`).
Con el reloj, un zombie frenado contra una pared seguiría pedaleando en el sitio; así las piernas se
paran solas cuando el cuerpo no avanza, sin ninguna condición especial.

**`activo` y `andando` son dos interruptores distintos**, y confundirlos fue el bug v1.20: `activo` = *te
ve* (los brazos suben a su `base`), `andando` = *se está moviendo* (el vaivén). Con el vaivén colgado de
`activo`, al perderte y volver a su ancla el zombie se deslizaba de lado con las piernas rectas, como un
mueble empujado. Por lo mismo, si no persigue pero anda, mira **hacia donde va**.

**Tres costuras que no se pueden saltar** (las tres tienen su prueba en §17):

1. `mirarObjetivos` le pondría `s.model = null` a cada pieza en cada frame: lleva una guarda `if (s._rig)
   continue` — sobre una instancia del rig manda el rig.
2. `mcRestampAll` **sustituye cada objeto** de `mc.structures`; el rig **re-adquiere** sus piezas por
   `(key, ox, oy, oz)` en vez de animar objetos muertos.
3. **La celda es entera y el cuerpo no**: el resto fraccionario del plantado viaja en la matriz, así que
   una pieza del rig lleva `s.model` **siempre**, también parada. De ahí que `mcStructColl(raíz)` sea
   siempre `null` y la solidez salga del envoltorio de `mcFineBoxHit` — donde se la dibuja, no donde
   está su celda. Las extremidades van **sin colisión** a propósito: el rig las gira y los envoltorios
   solo trasladan; una caja invisible que no acompaña al dibujo es peor que ninguna. **El zombie choca
   por su torso.**

⚠️ La cabeza es **15³ a propósito**: un asset de 1×1×1 bloque con ≥4096 voxels macizos es **terreno**
(`blockLike`, `app.js:4126`) y el terreno no se puede animar. Con cualquier lado ≤15 el máximo posible es
3375 < 4096, así que no puede volverse terreno por mucho que se rellene.

Tests: `node test_bloques_comportamiento.js` **§17** (el motor, sobre el mundo de juguete: cuerpo rígido,
hombro orbitando, fase por distancia contra un muro, piernas y brazos en oposición, vuelta a casa
andando, `mcRestampAll`, solidez) y `node test_esqueleto_navegador.js` (Chromium + SwiftShader: que las 6
piezas **se dibujan** —píxeles, no `mc.structures.length`—, que sus matrices llegan al shader, que
`mcSerialize()` no las ve y que plantar un zombie **no dispara ningún guardado**). Los dos leen el
**documento de verdad** (`data/agentes/zombie.json`) y las **piezas de verdad** (`assets/*-zombie.vox.json`):
mover un pivote o regenerar un asset con otras medidas se entera aquí. El almacén, aparte:
`node test_agentes_api.js` (necesita el servidor vivo).

### El panel de agentes (pestaña **Agentes**, v1.22)

Lista de agentes guardados, formulario por pieza (dibujo, `rot`, pivote / eje / base / reposo /
amplitud / fase) y **preview 3D animado** con los dos interruptores de verdad (*te ve* / *anda*), un
mando de giro y un botón **Plantar** que lo suelta delante del jugador.

**El preview NO calcula la pose: se la pide a la librería.** `app.js` llama a

```js
const pl = await game.esqueletos.preparar(doc);        // no planta nada ni deja esqueletos vivos
game.esqueletos.pose(pl, {fase, giro, activo, andando});   // devuelve las piezas con su `m` puesta
```

y solo **dibuja** esas matrices. Es lo que mantiene el §0 en pie (el framework sigue sin saber qué es
un zombie) y, sobre todo, lo que hace **imposible que la pose del panel se desvíe de la del Mundo**:
las dos salen de la misma `matrizPieza`. Por eso el refactor que extrajo `matrizPieza`/`centroGiro`
va **antes** que el panel — con dos composiciones parecidas, la divergencia es cuestión de tiempo.

**La única divergencia, y es a propósito:** en el Mundo la fase del ciclo de andar avanza con la
**distancia** recorrida; en el panel no hay distancia, así que la adelanta el **reloj**. El panel es
un maniquí, no un bicho andando.

Lo que sí vive en `app.js` es un **rasterizador** (`agDibujar`), y ahí hay cuatro cosas que costaron:

- **Backface culling por la normal GIRADA** contra el gradiente de profundidad, no por el orden de los
  vértices: la matriz de una pieza puede **espejar** y entonces el winding miente.
- **Fusión ávida de caras coplanares** (`agGeom`): el zombie entero baja de ~3.300 caras a **803
  cuadros**. No es solo velocidad — menos cuadros son menos bordes tocándose, o sea menos costuras del
  antialias de canvas (la misma lección que el rasterizador del iso).
- ⚠️ **`s.aabb` es CEÑIDO, no la celda 16³**, así que el atajo de «con `rot` impar se intercambian X y
  Z» **es falso** para cualquier dibujo que no llene su celda (el brazo del zombie es 5×5×14 centrado).
  Hay que pasar la caja **redondeada a celda** por `mcRotXZ`, igual que `mcStructGeom`.
- ⚠️ **La luz va atada a la CÁMARA**, no al mundo (`AG_LUZ` = `[derecha, arriba, hacia el
  espectador]`). Con un sol fijo en coordenadas de mundo, girar el preview a un **perfil** dejaba las
  caras visibles en el suelo del término ambiente y el muñeco se veía casi negro.

El lienzo se estira por CSS y su resolución la fija `agResize` (caja × `dpr`); apilado en móvil el
escenario lleva **su** alto (`46vh`), porque con `flex:1` la lista y el formulario lo dejaban en una
banda de ~80 px.

### Hacer un agente NUEVO desde el panel (v1.23) — y el segundo bicho, un perro

Hasta v1.22 el panel **editaba** agentes pero no dejaba **crear** uno: el zombie existía porque su
documento se escribió a mano. Montar el perro entero desde el formulario destapó dos huecos, los dos
genéricos (ni una línea de `app.js` sabe qué es un perro):

1. **El desplegable de dibujos no ofrecía ni una pieza de agente.** `agCatalogo` filtraba
   `type!=='textura'` — un filtro que está para no listar los 34 azulejos de 1×1 como piezas de un
   muñeco — y las piezas del zombie **son** `type:'textura'`, así que se las llevaba por delante. Y
   tienen que serlo: ese tipo es lo que enruta el guardado del editor a `/api/assets`, que es lo
   único que deja **reponer un pivote** con 📍 y guardar la pieza de vuelta. Se salva el `group`:
   `a.type!=='textura' || a.group==='Agentes'`.
2. **Faltaba la mitad del documento.** El formulario cubría las piezas pero no la **conducta**, que
   no es de ninguna pieza sino del bicho entero: `seguir` (detección / se para a / velocidad),
   `andar.cadencia`, `cuerpo` (caja de choque) y el `mirar` de la cabeza. Sin eso, un agente nuevo
   nacía sin perseguir nada. Van en un bloque aparte, **«El bicho entero»**, separado del de la pieza.

⚠️ Los números que enseña ese bloque cuando el documento **no** trae la clave son los que de verdad
usará `normalizarSeguir` (detección 16, se para a 2.5, velocidad 3), no ceros: un 0 en «se para a»
diría que se te echa encima, que es justo lo contrario de lo que hace un agente sin `seguir`.

**«Seguir a una distancia» ya lo sabía hacer el motor**, y conviene no reimplementarlo: `distancia`
no es un mínimo, es **un sitio donde estar** — si te acercas más, `pasoSeguir` hace retroceder al
agente. Medido en el Mundo del dueño con el perro: 3.06 → 4.33 → 3.02 → 3.00 y ahí se queda clavado,
con `teVe=1` y `andando` decayendo a 0.

`data/agentes/perro.json` es el primer **cuadrúpedo**: 4 patas del mismo dibujo, en diagonal (`fase`
0 / 180 / 180 / 0), cabeza con `mirar` y cola meneando sobre el eje **y**. Que salga de la misma
librería sin tocarla es la prueba de que el rig **por instancia** era la decisión correcta: la pata
delantera izquierda y la trasera derecha son el mismo material con distinta fase.

`node test_panel_agentes.js` (18 ok) fija las dos cosas: que el desplegable ofrece las piezas de
agente **sin** comerse el resto del catálogo, y que al agente montado por el formulario no le falta
ningún campo — construye un bicho de usar y tirar entero por la UI, comprueba el JSON resultante
campo a campo, comprueba que esos campos también **leen** un agente guardado (el zombie) y **no
hace ni un POST**.

## Convenciones

- Cualquier cambio de `state` termina llamando a `render()` (= `drawEdit` + `drawIso` +
  `updateInfo`). Las sincronizaciones de UI puntuales usan `syncLayer` / `syncColor`.
- El formato de export es `{format:"voxelforge-1", size, meta, voxels:{...}}`; import acepta ese
  objeto (`voxels` como mapa `"x,y,z" -> hex`).
- Idioma de UI y comentarios: **español**.
- Al ampliar el MVP (p. ej. hacer reales las pestañas Habitaciones/Mapa), mantener el mismo
  `state.voxels`/serialización como fuente de verdad y añadir vistas nuevas sin duplicar el modelo.
