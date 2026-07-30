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
game.bloques.info();      // clave EXACTA de lo que piso / tengo delante / detrás  ← el descubridor
game.bloques.lista(); game.bloques.quitar('hab:muelle'); game.bloques.avisos();
game.bloques.pasoSuave(0.06);   // segundos que tarda el ojo en subir un escalón; 0 = como antes
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
- **`pasoSuave` sube el ojo, no el cuerpo.** `app.js` sube los escalones **de golpe** dentro de un
  frame (`mcMoveAxis`: `p[1] += h`, hasta `MC_STEP=0.6`), y en una escalera de peldaños de 8 voxels
  eso se ve como saltos de y+0,5. Se tapa como en Minecraft: **la física no se toca** (misma colisión,
  mismo alcance de escalón, mismo tacto) y solo se **pinta** al jugador un poco más abajo, desfase que
  se consume en ~0,1 s. Mecánica: el ojo se calcula en **seis** sitios de `app.js` a partir de
  `mc.pos[1]`, así que el desfase se **resta al salir** del frame y se **repone al entrar** en el
  siguiente — entre medias solo hay dibujado. Se repone la y **guardada**, no `pos[1]+desfase`: sumar
  y restar no devuelve el mismo float y ese pelo acabaría en la colisión (el test compara los 90
  frames con `===`). Decae con `exp(-dt/τ)`, o sea igual a 30 que a 120 fps, se recorta a un escalón
  y **solo** se aplica al escalón automático: saltar (`onGround` false) y trepar (ya es continuo) no
  se suavizan. El estado vive en `mc` (`_pasoDesfase`/`_pasoReal`/`_pasoY`), no en un closure, para
  que reejecutar el snippet herede el desfase en vez de dejar al jugador medio bloque hundido; si la
  `y` no es la que se pintó, alguien movió al jugador (`game.tp`, respawn, un `alPisar`) y el desfase
  se tira.
- Solo afecta al **jugador**; los agentes siguen con su `climb`/`drop`.

**Punto de extensión `mundo-autoarranque` (excepción al §0, aprobada por el dueño).** Los snippets no
se autoejecutan (solo a mano desde Alt+C), así que la escalera dejaba de ser escalera en cada recarga.
`mcAutoarranque()` (final de `openWorld`) ejecuta ese snippet si existe: `app.js` **no sabe qué hace**,
solo ofrece dónde engancharse; si no hay snippet, el Mundo se comporta como antes. Editar el snippet
exige recargar la pestaña (o reejecutarlo a mano, que es idempotente).

Test: `node test_bloques_comportamiento.js` (headless, con un mundo de juguete; sin navegador).

## Convenciones

- Cualquier cambio de `state` termina llamando a `render()` (= `drawEdit` + `drawIso` +
  `updateInfo`). Las sincronizaciones de UI puntuales usan `syncLayer` / `syncColor`.
- El formato de export es `{format:"voxelforge-1", size, meta, voxels:{...}}`; import acepta ese
  objeto (`voxels` como mapa `"x,y,z" -> hex`).
- Idioma de UI y comentarios: **español**.
- Al ampliar el MVP (p. ej. hacer reales las pestañas Habitaciones/Mapa), mantener el mismo
  `state.voxels`/serialización como fuente de verdad y añadir vistas nuevas sin duplicar el modelo.
