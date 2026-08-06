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

**Máscara de caras (herramienta 🃏 «Caras», tecla `A`):** un voxel puede pintar **solo algunas de sus
6 caras**, que es lo que convierte un voxel en un plano — mata de hierba, bandera, cartel. Clave de
primer nivel `caras` (mismo patrón que `pivotes`: sobrevive al guardado sin tocar `server.py`):

```json
"caras": { "8,0,4": 12, "8,0,5": 48 },
"atravesable": true
```

Entero **0..63**, bit `i` = `CUBE_FACES[i]` (`app.js`): `0=+Z arriba · 1=−Z abajo · 2=+X · 3=−X ·
4=+Y · 5=−Y`. **`MC_FACES`, el mallado del Mundo, usa el MISMO orden de índices**, así que no hay
conversión editor↔mundo; lo único que cambia entre los dos es cómo se permutan al girar. En memoria
es `state.caras`, un `Map` paralelo a `state.voxels`, y viaja por `edit()`/`snapshot()` (deshacer),
`rotateModel`, `resizeGrid`, `moveSel`, copiar-pegar y `load`/`exportJSON`/`localSnap` igual que los
pivotes. `normCaras()` filtra claves mal formadas, fuera de rejilla y valores fuera de `[0,63]`.

⚠️ **La máscara es del OBJETO, no del voxel.** Mientras `state.caras` esté **vacío** el dibujo se ve
entero (`caraMask` devuelve 63 para todos); en cuanto hay **una sola** marca en cualquier voxel, todo
lo que no esté marcado se oculta — un voxel **sin entrada** en el Map ya no significa «las seis», sino
«ninguna». De ahí las dos lecturas, y confundirlas es el bug: **`caraMask(x,y,z)` = lo que se PINTA**
(63 si el objeto no tiene marcas, 0 si las tiene y este voxel no) y **`caraMaskRaw(x,y,z)` = lo que
está GUARDADO** (0 cuando no hay entrada). El render lee la primera; la herramienta edita con la
segunda. Lo que **no se guarda es el 0** (`setCaraMask(...,0)` borra la entrada); el **63 sí se
guarda**, porque «las seis marcadas a mano» no es lo mismo que «sin marcar».

**Gestos:** izquierdo marca la cara resaltada en rojo, derecho la desmarca (arrastrando barre, y todo
el trazo es UN paso de deshacer); Shift+clic marca las seis de ese voxel; **botón derecho sobre el
botón de la herramienta borra todas las marcas del objeto**, que vuelve a verse entero. El botón de la
barra alterna **«Marcadas»** (las marcadas en rojo y el resto dibujado con su color, para poder
clicarlo) y **«Ocultas»** (solo las marcadas, como se verá en el Mundo) — ocultas se siguen pudiendo
clicar, así que ocultar una cara nunca es irreversible.

**Se pinta en las DOS vistas, y no por comodidad.** En 3D hay que apuntar a una cara de verdad, y a la
de debajo y a las que dan al fondo no se llega sin girar la vista buscando el ángulo. En **Capas** la
celda enseña las seis a la vez, repartida en las mismas zonas donde se pintan las marcas: los **cuatro
bordes** son las caras de los lados (`+X` derecha, `−X` izquierda, `+Y` abajo, `−Y` arriba), el **punto
del centro** es `−Z` y **el resto de la celda** es `+Z`. Mismo gesto que en 3D (izquierdo marca,
derecho desmarca, Shift las seis, el arrastre barre) y un resalte blanco enseña la zona antes de
pulsar, porque con el objeto sin marcas no hay nada dibujado que la anuncie.

⚠️ El reparto sale de **`carasZona2d`, que es la única definición**: la usan el dibujo
(`drawCarasCell2d`), el resalte y el inverso que resuelve el clic (`caraDeCelda2d`), así que se marca
donde se ve y las tres no pueden desalinearse. La excepción a tener en cuenta al tocarlo: la zona de
`+Z` es la **celda entera** porque lo que pinta es un tinte translúcido por debajo de todo lo demás,
mientras que como región de clic es lo que **sobra** al descontar las otras cinco (por eso
`caraDeCelda2d` la deja de última). Coinciden igual —el único sitio donde ese tinte se ve a solas es
justo el sobrante—, pero un test que pulse en su centro de masas acaba dando en el punto del envés.

En Capas «Caras» **no pasa por `applyTool`**: necesita el punto exacto dentro de la celda y `applyTool`
solo recibe la celda, así que lo resuelven `pointerdown`/`pointermove` de `editCv`. Por lo mismo el
`pointermove` no puede usar el «¿ha cambiado de celda?» del resto de herramientas — dentro de una misma
celda el cursor va del borde al centro sin que `hover` se mueva.

⚠️ **Dos piezas con máscara pegadas: el envés se hunde un pelo (`mc.carasInset`, 0,08 voxels finos).**
Una cara con máscara se emite **dos veces**, una por bobinado (`dosCaras`), o el plano desaparece al
mirarlo por detrás. Pero eso rompe el árbitro de siempre: cuando dos estructuras se tocan, las dos
emiten su cara en el plano que comparten y el empate lo deshace el **culling de traseras**
(`mcStructGL`, ver más arriba) — sobrevive la que mira a la cámara. Una cara de dos caras se rasteriza
por los **dos** lados, así que las dos piezas ponen una cara mirando a la cámara **a la misma
profundidad**: con `depthFunc(LESS)` gana la que se dibujó antes, o sea el orden de estampado. El
dueño lo reportó como «se pegan las caras, no hay prioridad de cuál se pinta antes, hay un efecto de
mezcla de texturas». **No es parpadeo** (no baila al mover la cámara: el empate se resuelve igual cada
frame), y por eso `game.structBias` no lo arregla — las dos son estructura y llevan el mismo sesgo.
El desempate es geométrico: el **anverso se queda EXACTO** en el plano del voxel (así el culling sigue
arbitrando lo de siempre, y un asset sin `caras` no cambia ni un vértice) y el **envés se mete
`mc.carasInset` hacia dentro de su propio voxel**. Un envés siempre se mira desde dentro, así que
hundirlo lo **acerca** al que mira ⇒ gana siempre la pieza de este lado, decidido por geometría y no
por el orden. `mc.carasInset = 0` lo apaga (escape de reserva, como `game.structBias`); cambiarlo
exige re-mallar (`delete mc.structs[clave]`).

**Límites conocidos y aceptados**: `drawIso`, `drawIsoSlicedBig`, la vista 2D de Capas y la ficha de
material enseñan la pieza «llena» (en Capas las marcas **se pintan y se editan**, pero el voxel se
sigue dibujando entero: la celda dice qué caras hay, no cómo quedará en el Mundo). Y un **16³ macizo con `caras` deja de ser `blockLike`**: pasa a
estructura fina a propósito. Ojo, el motivo **ya no es** que el terreno pierda la máscara —desde
`mc.recorte`/`mcTapaCara` (más abajo) la respeta—, sino que **lo que se pone A MANO se prefiere fiel**:
como bloque son 6 texturas agujereadas y NADA detrás (se ve el otro lado), mientras que la pieza fina
enseña sus voxels de dentro. Desde **scripting** manda `setVoxel`, y ahí sí se usa el terreno: es la
diferencia entre poner una pieza y levantar un bosque.

Tests: `node test_caras_mascara.js` (contrato y permutación) · `node test_caras_render.js` (los tres
sitios del editor) · `node test_herramienta_caras.js` (gestos en 3D) · `node test_caras_2d.js` (el
reparto de la celda en Capas: cada zona da su cara y solo la suya) · `node test_caras_mundo.js` (mallado) ·
`node test_caras_pegadas.js` (**el guardián**: un asset sin `caras` sale píxel a píxel igual que antes
de que esto existiera, **y** dos piezas con máscara pegadas dan la misma imagen se estampen en el
orden que se estampen — con `mc.carasInset=0` el test exige que vuelva a depender del orden, o no
estaría mirando nada). Asset de referencia: `assets/hierba-alta.vox.json`.

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
añádelo a `index.json` (`{id,name,role,type,icon,file}` + `alias`/`description` opcionales). Ejemplo reproducible: `node make_alis.js`
construye el NPC «Alis la Duplicadora» con helpers `box()/set()` y regenera el índice — patrón a copiar.
`loadServerAssets` reparte el índice por `type`: los personajes/objetos van a **Assets del servidor** y
los `type:'bloque'` a **Habitaciones** (`loadRooms`); ambos cargan con `loadFromUrl` al hacer clic.
**Enrutado por tipo de lo GUARDADO** (todo se guarda en `data/habitantes/`, un solo almacén): la
galería/roster de **Habitantes** filtra `type!=='bloque'` y **Habitaciones** muestra los `type==='bloque'`
(assets + guardados, estos con badge «guardada» y carga vía `loadHabitante`). `openHabitantes(kind)`
sirve ambas galerías (`habKind` recuerda cuál); `refreshRosters()` refresca los dos tras guardar/
renombrar/borrar. Al guardar respeta el `meta.type` del desplegable, así un objeto marcado «Bloque de
habitación» aparece en Habitaciones, no en Habitantes.

**Ficha de un asset (botón 📋 en la tarjeta) — cómo se llama esa textura desde un script.** Un asset
responde a **cuatro** claves, todas registradas por `mcIndexAssets` en `mcAssetsRegistry` (lo que mira
`game.addMaterial`) **y** en `MC_MAT_ALIAS` (lo que mira `setVoxel`/`mcResolveMat`): su `id`, su rótulo
en minúsculas, el basename del fichero y su **`meta.alias`** (nombre corto). Desde la UI solo se veía el
rótulo, así que el nombre bueno había que adivinarlo — la ficha (`openFicha`, `#ficha-modal`) lista las
cuatro, enseña la clave exacta `asset:assets/<id>.vox.json` y deja editar `alias`/`icon`/`description`.
- **El alias NO puede pisar un alias de fábrica** (`MC_MAT_ALIAS_FIJOS`, foto de `MC_MAT_ALIAS` antes de
  indexar): `stone` sigue siendo roca pase lo que pase. Se valida en **los dos lados** — `ALIAS_FIJOS` +
  `validar_alias` en `server.py` (409 con motivo legible) y otra vez al indexar en el cliente. **Si
  añades un alias de fábrica, tócalo en los dos sitios.**
- Forma obligatoria `^[a-z0-9_]{2,40}$`: el sentido es poder teclearlo en un script.
- `mcAliasPrevio` borra la clave anterior al cambiar el alias: los dos mapas son de **solo-acumular**, y
  sin eso el nombre viejo seguiría funcionando para siempre.
- ⚠️ `POST /api/assets` vuelca el `.vox.json` **entero** y el editor no conoce `alias`/`icon`/
  `description` (no hay campos para ellos): el POST los **hereda del fichero existente** antes de
  volcar. Sin eso, guardar el dibujo borraba el nombre corto. Para quitar un alias se usa la ficha
  (PATCH con `alias:''`), no guardar.
- La identidad de un asset sigue siendo **su fichero**: ni renombrar ni poner alias mueven nada, porque
  cada voxel del mundo guarda `asset:assets/<id>.vox.json`.
- Solo assets del juego. Las piezas de `data/habitantes/` (`hab:<id>`) **no tienen alias**: no pasan por
  `mcIndexAssets`, así que ni su id ni su rótulo valen como clave — la única que funciona es `hab:<id>`.
  Su ficha (`openFicha(h,'hab')`, `fichaKind`) enseña eso y **esconde** la mitad editable en vez de
  ofrecer un nombre corto que no haría nada.
- ⚠️ **Guardar enruta por el ORIGEN del dibujo, no por su tipo.** `serverKind` (`'hab'|'asset'|null`)
  viaja junto a `serverId` y lo lee `vaAAssets()`; `meta.type` solo decide cuando no hay origen (dibujo
  nuevo). Enrutar por tipo mandaba a `/api/assets` cualquier habitante de tipo `textura` —el cable de
  redstone, sin ir más lejos— y lo **duplicaba** en la otra galería con el mismo id, donde el circuito
  (`hab:cable`) ya no lo encontraba. Un id sin espacio de nombres no identifica nada: `cable` puede
  existir en las dos galerías a la vez. Lo cubre `test_galeria_namespace.js`.
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
y `game.showVoxels(true)`/`=true` muestran/ocultan los medidores de FPS y de voxels dibujados —**cada
uno el suyo, y en los tres modos** (editor 3D `#e3-*`, Play `#play-*`, Mundo `#mc-*`); persistidos.
`game.showOSDbuttons(true)`/`=true` enseña los dos botones de la esquina del Mundo (🧩 Código y
✕ Cerrar), que **nacen ocultos** para que no salgan en las capturas — con teclado sobran, porque Esc
cierra y Alt+C abre los snippets. ⚠️ **En táctil `✕ Cerrar` no se puede esconder**: sin teclado no hay
Esc y el Mundo se quedaría sin salida, así que `updateOSDbuttons` lo fuerza visible. El «¿es táctil?»
lo da **`mcTouchOn`** (lo que decide `game.touchControls`), no la constante `MC_TOUCH`, para que las
dos cosas no digan lo contrario en un portátil táctil. `game.nearClip` (nº) y `game.nearClip = 8` regulan el umbral de zoom del recorte de cercanía (ver arriba). `project3d` hace **culling por visor** (descarta voxels con el centro fuera del
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

⚠️ **El volumen se marca con ARISTAS, no con relleno** (REQ-XR1), y las cajas van a las cotas
**exactas** de la celda. Los cubos macizos a alfa constante 0.38 componían capa sobre capa
(`1 − 0.62^k`, y con `CULL_FACE` apagado cada caja cuenta **dos**), así que tres bloques en la línea
de visión saturaban a blanco: medido, tapaban el **92,2 %** de la pantalla; con aristas, el 4,9 %.
Bajar el alfa no lo arregla, solo mueve dónde satura. Lo de las cotas exactas tampoco es cosmético:
con el margen viejo (`x+0.03 … x+0.97`) dos celdas vecinas dibujan **dos líneas paralelas** donde
debe verse una. Y `gl.lineWidth` está topado a 1 en Chrome/ANGLE, así que el grosor **no** es una
palanca disponible. Guardián: `node test_rayos_x_lineas.js`, con cota por arriba y **por abajo**.

⚠️ **El volumen son 7×5×7 celdas alrededor de los PIES.** Mirando al horizonte no entra nada en
cuadro y parece que la tecla `X` no hace nada: hay que mirar hacia abajo, y para verlo sobre una
pieza concreta hay que **plantarse encima**.

**Cuarta línea de la etiqueta = punto de extensión `mcXrayExtra`.** `app.js` pinta tres líneas
(coordenadas · tipo · material) y deja un hueco: `mcXrayExtra(clave, s|null, x, y, z) => 'texto'`, que
rellena quien sepa algo que el framework no sabe. `(x,y,z)` es la **celda** de la etiqueta —de la rejilla,
o el origen de la estructura— y va suelta y no en un array a propósito: esto corre una vez por etiqueta y
frame (hasta ~250), y un array por llamada es basura para el GC a 60 fps. El texto puede llevar **varias
líneas** (`\n`): `.mc-xlbl-extra` es `white-space:pre-line` contra el `nowrap` del padre.

⚠️ **El hueco lo comparten dos enganches, y no de la misma forma.** `mundo-autoarranque` lo **asigna**
(`window.mcXrayExtra = etiquetaRayosX`) y `redstone/redstone.js` lo **envuelve** encadenando al anterior
(sello `_redstone` para no apilarse al re-ejecutarse, `_orig` debajo). Funciona porque el orden es fijo:
el snippet asigna en su línea 3189 y arranca redstone en la 3366, así que el motor siempre llega después;
y si el snippet se re-ejecuta y borra el envoltorio, vuelve a cargar redstone y se rehace solo. **Un
enganche nuevo debe envolver, no asignar** — asignar borra en silencio las líneas de los demás.

`mundo-autoarranque` muestra **el comportamiento del
material y los giros de ESA instancia** (`X` cabeceo · `Y` giro · `Z —`, más `(origen …°)` con el horneado
de `rot`+`frente`). Si la pieza está parada dice **por qué**: `en reposo (pide 90°, cono -90..30°)` o
`en reposo (a 14 bloques, alcance 12)` — son arreglos distintos (abrir `limites` / recolocar la pieza vs
subir `alcance`). **`limites` se cuenta desde la pose horneada de CADA instancia**, así que dos piezas del
mismo material puestas con `rot` distinto tienen conos que apuntan a sitios distintos del mundo: es la
causa de «un brazo me sigue y el otro solo si paso por detrás», y se ve comparando sus `(origen …°)`. Es `var` y no `let` a propósito: un `let` de nivel superior **no** es propiedad de
`window`, así que un snippet (que corre en `new Function`) no podría engancharse. Si el hook lanza, `app.js`
lo **desengancha y avisa una vez** — si no, sería un warning por etiqueta y frame.

**Quinta línea: el NIVEL de señal (`redstone/redstone.js`, REQ-XR2).** Es lo único de un circuito que no
se ve mirándolo — la clave dice si una lámpara está encendida, pero no con cuánto, y un cable a 1 y otro a
14 son el mismo bloque. Dos casos, y son dos a propósito:

- **pieza de circuito** → `⚡ recibe`, y `⚡ recibe → saca` si entrega algo distinto. Un repetidor sale
  `⚡ 13 → 15`, que es justo la respuesta a «por qué el tendido de después no se acorta».
- **bloque macizo cualquiera** → solo si de verdad está haciendo de **puente** (r1.2), y la energía
  **débil** se marca como tal: un cable no la lee, así que «le llega 12 débil, la lámpara de al lado
  enciende y el cable no» deja de ser un misterio. **El 0 no se pinta**: serían ~245 etiquetas de ruido.
  Válvula de escape si un material no debería transportar: `game.redstone.aislante(clave)`.

Solo bloques de rejilla: el motor lee `mc.grid`, así que una estructura fina (`s` no nulo) no lleva línea
—su celda de origen contendría otra cosa y la cifra sería mentira—. Y salida rápida por `hayCircuito`: un
mundo sin redstone no paga nada.

Test: `node test_rayo_apuntado.js` (extrae las funciones verbatim de `app.js`; fija la regresión
comprobando que la celda **sí** da sólida por AABB pero el rayo **no** cruza voxel lleno) ·
`node test_rayos_x_power.js` (la línea de señal, el encadenado con `mundo-autoarranque` y que app.js
pase la celda de verdad en las ~100 etiquetas de una vuelta real de `mcUpdateXrayLabels`).

**Coste de rayos-X: se recorre la ESTRUCTURA, nunca el voxel.** `mcXrayVolume` dibujaba las cajas
naranjas preguntando `mcFineSolidAt` **voxel fino a voxel fino** de la caja del jugador, y cada pregunta
recorre todas las estructuras del mundo: `|caja| × |estructuras|` = ~17 600 × 48 ≈ **850 000 pruebas por
frame** (17 ms medidos: el frame entero), y crecía con `playerScale³`. Ahora se itera **estructura a
estructura recortando** la caja del jugador contra la suya (mismo recorte que `mcFineBoxHit`) y solo se
recorren los voxels que de verdad caen dentro: 17 ms → **0,23 ms**. Es la misma lección de la colisión
fina — **barrer el AABB en voxels finos no escala**. Test: `node test_rayos_x.js` (dibuja el mismo
conjunto que la versión ingenua, no llama a `mcFineSolidAt` ni una vez, y 200 estructuras lejanas no
reciben ni una lectura).

## `atravesable` — se ve, se apunta y se rompe, pero no frena (`bits` vs `bitsAim`)

Una mata de hierba se cruza al andar y sin embargo tiene que seguir pudiéndose romper de un clic. Son
**dos preguntas distintas sobre la misma materia**, y por eso hay dos bitsets, no uno:

| | qué significa | quién lo lee |
|---|---|---|
| `g.bits` | **¿me frena?** (colisión) | `mcFineSolidAt` → `mcCollidesWorld` → `mcCollides` |
| `g.bitsAim` | **¿hay materia aquí?** (ocupación real) | `mcStructCellSolid`, `mcStructRayHit`, `mcStructAt`, `mcBreak`, `mcXrayVolume` |

Por defecto **`bitsAim` es la MISMA referencia** que `bits` (cero memoria, cero divergencia). Solo
divergen las piezas atravesables: `bits` = `Uint8Array` de **ceros**, `bitsAim` = la ocupación real.

⚠️ **`bits` nunca es `null`.** `mcStructColl` devuelve `null` si la pieza no tiene `bits`, y entonces
la hierba desaparecería también del **apuntado** — no se podría romper. Además
`data/snippets/mundo-autoarranque.json` **re-implementa el bucle leyendo `g.bits`** (`golpe`,
`claveFinaEn`, el barrido de `trepable`), con un `if(!g || !g.bits) continue`. Por eso `mcFineBoxHit`,
`mcFineSolidAt` y `mcStructColl` quedan **byte-idénticas**: la capa de apuntado va **encima** de ellas.

**Un material se declara atravesable por dos vías que producen la MISMA forma**, así que `app.js` no
necesita saber de cuál vino:

1. **El documento** — `"atravesable": true` en su `.vox.json` (casilla en la tarjeta *Objeto*). Es
   intrínseco del material. **No se deriva de la máscara de `caras`**, y los dos casos reales dicen por
   qué: el tallo de la mata es un voxel normal de 6 caras y debe atravesarse igual, mientras que una
   vidriera enmascarada tiene que seguir chocando. Derivarlo daría lo contrario en ambos.
2. **El mundo** — `game.bloques.define('hab:hierba', { atravesable:true })` en el snippet, que envuelve
   `mcStructColl` y clona el `g` (cacheado por `clave|rot`). `game.bloques.quitar()` lo deshace.

Y **también hay dos mitades por material**, porque un material vive en uno de dos sitios:

- **Estructura fina** — lo de arriba, cero líneas de `app.js` para la vía 2.
- **Bloque de terreno (`mc.grid`)** — `mcSolid` **NO se parchea** (lo usan a la vez el mallado, el rayo
  de apuntar y romper/poner: apagarlo ahí descosería las caras de los vecinos y borraría la pieza del
  apuntado). Va por **otra pregunta sobre la misma rejilla**, `mcSolidWalk` («¿me frena al andar?»),
  que consulta **dos** arrays indexados por id de bloque, los dos `null` mientras nadie sea atravesable:
  `mc.atraviesa` (lo escribe el **snippet**) y `mc.atraviesaDoc` (lo hornea **`mcBuildPalette`** desde
  el `"atravesable"` del propio documento). Se leen en **ese solo sitio**. Para que un material del
  documento vuelva a chocar hay que quitarle el flag al `.vox.json`: `game.bloques.quitar()` solo
  deshace lo que puso el snippet.

### Desde scripting: una hoja es un BLOQUE, como en Minecraft (`setVoxel`)

`setVoxel` escribe siempre en `mc.grid`, y ahí un material se dibuja proyectando su dibujo sobre las 6
caras del cubo (`buildTexFaces`). Eso **ya no pierde** la máscara de `caras` ni el `atravesable`, así
que un bosque entero de hojas se planta desde un script **sin un solo draw call extra**:

```js
setVoxel(x, y, z, 'leaves');          // TERRENO: bloque de RECORTE, con sus agujeros, y se cruza al andar
game.stamp('leaves', x, y, z, rot);   // PIEZA FINA: para lo que NO cabe en una celda (forma, alpha real)
```

Medido con 200 hojas (`test_stamp_scripting.js`): **`setVoxel` = 60 ms y 0 draw calls extra**;
`game.stamp` = **385 ms y 200 draw calls**. Con 2000, `game.stamp` son ~2,4 s — el snippet de montañas
del dueño se colgaba con eso. Son **cuatro piezas**, y las cuatro hacen falta:

1. **La máscara llega a la textura** — `buildTexFaces` respeta `caras`: si el bit de esa cara está
   apagado, el texel sale con **alpha 0** y la textura pasa a ser de **RECORTE**. ⚠️ Manda el **primer**
   voxel de la columna, tenga la cara encendida o apagada: seguir buscando detrás rellenaría el agujero
   con la cara opuesta de la cáscara y el bloque volvería a salir macizo. Un solo texel transparente
   enciende `mc.atlasHasAlpha` ⇒ el shader del terreno hace `discard`.
2. **Un bloque de recorte NO tapa** — `mcTapaCara(x,y,z)` es la **tercera** pregunta sobre la misma
   rejilla (`mcSolid` = «¿hay materia?», `mcSolidWalk` = «¿me frena?» —que en las celdas finas se afina
   por la FORMA, ver `mcTerrenoChoca`—, `mcTapaCara` = «¿tapa esta cara?»), y otra vez lo que la separa
   de `mcSolid` es un array: **`mc.recorte`**, `Uint8Array` por id
   de bloque que hornea `mcBuildPalette` junto al alpha del atlas. La lee **un solo sitio**, el mallado
   del chunk; **`mcSolid` queda byte-idéntico** porque lo comparten el rayo de apuntar y romper/poner.
   Sin esto, por los agujeros de una copa se ve el **vacío**: las caras de dentro estaban peladas. Es la
   regla de las hojas «fancy» de Minecraft. Medido sobre una copa de 311 bloques: **+15,8 % de
   vértices, los MISMOS 36 draw calls y el mismo ms/frame** — el culling de chunk cambia el tamaño del
   VBO, no el número de llamadas. Con `mc.recorte = null` (nadie tiene agujeros) es `mcSolid` pelado.
3. **`mc.atraviesaDoc`** — el `"atravesable"` del documento vale también en la rejilla (arriba).
4. **`mc.finoRejilla` — lo que NO llena su celda se dibuja con su GEOMETRÍA DE VERDAD, dentro de la
   malla del chunk.** Proyectar sobre las 6 caras solo es fiel si el dibujo **toca las paredes** de la
   celda (`leaves` va de 0 a 15: es una cáscara). Una **flor** vive en x 6..10, y 6..10: su silueta se
   pega a las 4 paredes y de lejos se veían **cuatro tiras verticales separadas** con un **cuadrado
   oscuro** debajo. La señal que las separa ya existía: **`rec.pielCubre`** de `mcStructCells`. Con
   ella `mcBuildPalette` hornea `mc.finoRejilla` (`app.js:5469`), `Uint8Array` por id de bloque,
   1 = «este material no llena su celda», y deja la geometría de `rot 0` lista en `mc.finoGeom`
   (`:5476`, caché **aparte** de `mc.structs[k].meshRot`, que `mcRestampAll` borra en cada estampado).
   ⚠️ **La celda sigue siendo celda de rejilla; lo que cambia es lo que emite el mallador.**
   `mcMeshChunk` (`:6512`) pide la tabla a `mcTablaFina()`, aparta esas celdas del bucle de cubos y
   copia su geometría real —trasladada a coordenadas de mundo y con la luz de la celda horneada por
   cara— a **dos lotes por chunk**, `finoVbo` (opaco) y `finoAVbo` (con alfa), que se dibujan con
   `mc.structProg` (stride 9: pos3, rgb3, shade, emit, alpha). Es el **mismo programa que las piezas
   finas**, y por eso geometrías distintas caben en un mismo buffer: va a **color por vértice**, no al
   atlas del terreno. **Un lote por chunk, no uno por flor** ⇒ 200 flores siguen costando **0 draw
   calls** (medido: 60 ms en rejilla frente a 397 ms y 200 draw calls como piezas sueltas).
   El lote entra **también en el pase del sol** (`:6468`), así que la flor proyecta la sombra de su
   silueta y no la de un cubo. `mcTapaCara` (`:5507`) devuelve `false` sobre una celda fina: no es un
   cubo, no puede tapar la cara del vecino.
   Válvula: `mc.finoExtra[id]`, en los dos sentidos y con el idioma de `mc.traspasaLuz` (1 = geometría
   real siempre, 2 = nunca, proyéctalo como cubo). Guardián: `test_flor_en_rejilla.js`.

**Lo que `setVoxel` avisa se reduce a lo que de verdad no cabe en una celda**, y son dos cosas:
la **FORMA** (la piel no cubre el cubo **y ocupa varias celdas**, así que cada una se proyecta suelta
como un cubo lleno) y la **transparencia real** (el atlas recorta, no mezcla).
Una mata o una flor **ya no avisan**: caben en una celda, el mallador emite su geometría de verdad y
se ven como el documento (punto 4 de arriba). Lo decide `rec.pielCubre`, que
`mcStructCells` calcula con las tres proyecciones de 16×16 del dibujo. `caras` y `atravesable` **ya no
son motivo de aviso**. Se avisa una sola vez por material, por consola **y por toast**: el dueño
construye desde el móvil y ahí un `console.warn` es indistinguible de «el script no hace nada».

⚠️ **`buildTexFaces` tiene que aplicar la regla del OBJETO, y no aplicarla fue el «cubo verde».**
El dueño reportó con una captura que las mismas hojas puestas por script salían como un cubo verde
macizo y puestas a mano salían frondosas. La causa era **una línea** del horneado de la textura
(`app.js:1078`): al buscar el primer voxel opaco de cada columna trataba «este voxel **no tiene**
entrada en `caras`» como **63** (pinta las seis) en vez de **0** (no pinta ninguna), que es la regla
que sí siguen `caraMask` y `mcStructGeom`. Efecto: los voxels **de dentro** del follaje, que en la
pieza fina no pintan nada, al proyectarse **tapaban todos los agujeros de la cáscara**. Medido sobre
`assets/leaves.vox.json`: las 6 caras salían **85-93 % opacas**; con la regla correcta salen
**34-45 %** y `hueco` pasa a `true`, o sea el shader del terreno hace `discard` y se ve a través.
**Era un fallo del motor, no de autoría del asset.** La zona de pruebas de `/map/test` deja el A/B
plantado (ver abajo).

⚠️ **Límite que sí sigue en pie: `pielCubre` mide la SILUETA, no el aspecto.** Un dibujo volumétrico
y denso —un follaje— cubre sus 16×16 columnas en los tres ejes, así que pasa el test y `setVoxel`
**no avisa**, aunque el terreno solo pueda pintar su cáscara sobre 6 caras. Con el horneado ya
correcto eso deja de doler para un asset con `caras`, pero para uno **sin** máscara y con interior
interesante el aviso sigue sin saltar: `pielCubre` responde «¿cabe la silueta?» y la pregunta que
importa es «¿se parece?». Es un límite conocido, no un pendiente.

`game.stamp(material, x,y,z, rot)` sigue siendo lo mismo que hace la mano (`mcPlace` →
`mcStampStruct`): acepta nombre corto (mismo `mcResolveMat` que `setVoxel`) o clave exacta
`asset:…`/`hab:…`, respeta `beginBatch`/`endBatch` y devuelve `false` fuera de límites. **Precio
explícito: cada pieza es una entrada de `mc.structures` = UN DRAW CALL y una línea en el `structures[]`
de `mundo.json`.** Es la vía para una mata de hierba o una llama; para un bosque, `setVoxel`.

**Colocar A MANO usa la MISMA función**, desde que el punto 4 hace fiel a la rejilla lo que no llena su
celda: el clic derecho sobre una ranura de estructura ya no estampa siempre una instancia, sino que
pregunta **`mcCabeEnRejilla(key)`** y, si cabe, llama a `mcSetVoxel`. Una flor puesta a mano deja de
costar un draw call y de ocupar una línea del `structures[]` de `mundo.json`. Dice que **no** cabe —y
entonces se estampa como siempre— en tres casos: **varias celdas** (una sala, un árbol), la piel cubre
el cubo **y** es translúcida o tiene `caras` (el atlas recorta y no enseña lo de dentro), y **sin huella
todavía** (se calienta `mcStructCells` y esa vez va de pieza).

**El giro también cabe: va en la CLAVE.** Una celda de `mc.grid` es un `Uint16` con el id del bloque y no
tiene hueco para la orientación — pero sí puede guardar **otro id**. «Esta pieza, girada así» entra en la
paleta como un material más, con la clave del original y el sufijo **`@<ori>`**, donde `ori = giro |
vuelco<<2` (1..15; el 0 no se escribe). Puesto ahí, el giro viaja **solo** por todo lo que ya existía, sin
tocar una línea: `mc.grid` sigue siendo ids, el guardado sigue escribiendo `tex:<clave>`, la paleta del
`.vox` v2 y `/api/mundo/edits` tratan la clave como cadena opaca (`server.py` ni se entera) y al recargar
el mundo la variante se da de alta sola como cualquier material que venga del fichero. Y como
`mc._geoFina[id]` devuelve la geometría horneada **de ese id**, el mallado, la sombra y la colisión por
forma salen girados gratis. Las tres piezas: `mcClaveBase` / `mcClaveOri` / `mcClaveConOri`; `getRoomData`
comparte el documento con la clave base (ni un `fetch` de más) y `mcBuildPalette` hornea
`mcStructGeom(base, ori)`. `setVoxel(x,y,z,'flor@1')` también lo entiende (`mcMatKey`), y rayos-X enseña
ese mismo nombre. `R`/`Shift+R` **precargan** la variante mientras miras el fantasma
(`mcPrecargaGirada`), para que el clic sea el camino normal y no el de «material pendiente».

⚠️ **Dar de alta una variante NO puede pasar por el camino largo de `mcAddBlock`.** Medido en el mapa de
512×40×512: **3 873 ms** por `mcBuildPalette` (re-hornea los N materiales) + el atlas creciendo de alto,
que cambia las UV de **todos** los bloques y obliga a `mcMeshAll`. El atajo es `mcAltaVariante`: apende las
casillas de la paleta a mano y le pasa **las UV del original**, así que el atlas no crece, nada de lo ya
mallado caduca y no se re-malla nada → **6 ms en frío** (hornear la geometría girada incluida). Es la regla
general: *si el atlas no cambia de alto, no hay que re-mallar el mundo*.

Lo único que sí se sigue estampando al girarlo es **lo que se proyecta sobre las 6 caras del cubo**
(`mcEsFinaEnRejilla` en `false`: `blockLike` o `pielCubre`): ahí el giro no se vería, y perderlo en
silencio sería peor que gastar el draw call.

Y **la celda fina también choca por su FORMA**, no como el cubo de 16/16 — que fue justo lo que se rompió
al estrenar esto: una placa de **un voxel de alto** puesta con el clic derecho se convertía en un muro de
bloque entero y ya no se podía pisar. `mcTerrenoChoca` (el bucle de terreno que comparten `mcCollides` y
`mcCollidesWorld`, extraído para que la regla viva en **un solo sitio**) sondea el mismo bitset `bits` que
usa la instancia estampada, en 1/16, cuando la celda está en `mc._geoFina`. Sin materiales finos esa tabla
es `null` y el bucle es el de siempre; con ellos, el sondeo fino solo entra en las celdas que lo son y no
reserva memoria (el pecado histórico de esta zona fue sondear el AABB fino con claves `string`).
Válvula por si acaso: `game.useOldStructBuildCall = true` (persiste en `localStorage`,
`vf_mcOldStructBuild`) devuelve el `mcStampStruct` de siempre. El único punto de decisión es `mcPlace`:
los dos gestos que construyen (`pointerdown` y `mouseup` con el botón derecho) pasan por ahí. Guardianes:
`test_clic_derecho_rejilla.js` y el §6 de `test_flor_en_rejilla.js`.

⚠️ Lo que **no** hereda la celda: el par `bits`/`bitsAim` — en la rejilla, `atravesable` lo resuelve
`mc.atraviesaDoc`, que hace la celda caminable entera (`mcSolidWalk`), y ahí ni se llega a mirar la forma.

### La textura que falta se carga sola (`setVoxel` ya no pone roca por ti)

`setVoxel(x,y,z,'flor_amarilla')` **sin haber llamado antes a `game.addMaterial`** ponía un bloque de
**roca gris**. Y no por falta de información: `assets/index.json` ya decía que `flor_amarilla` es
`assets/flor-amarilla.vox.json`. El motor sabía exactamente qué fichero querías y aun así ponía piedra,
porque `mcResolveMat` solo mira la **paleta cargada** y su fallback es roca. Ahora:

```js
setVoxel(x, y, z, 'flor_amarilla');   // se carga la textura sola; NO hace falta el addMaterial de antes
```

La mitad de `mcResolveMat` que traduce motes está separada en **`mcMatKey(m, mLow)`** (alias →
`asset:…`/`hab:…`), y sobre ella se apoya **`mcMatPendiente`**: si el nombre resuelve a una clave que se
puede ir a buscar a disco y **no** está cargada, la celda se **apunta** en `mcPendCel`, se pide la
textura en segundo plano (**una carga por material**, `mcPendCarga`, no una por voxel) y al llegar se
pintan de golpe todas las celdas apuntadas + `mcFlushBuild()`. Reglas que hay que respetar al tocar esto:

- **El nombre inventado sigue cayendo a roca al momento, con su aviso.** Solo se difiere lo que empieza
  por `asset:`/`hab:` o acaba en `.json`; si no hay fichero que pedir, no hay nada que esperar.
- **Manda la última escritura.** Un `setVoxel` normal sobre una celda apuntada la desapunta.
- **Antes de dar de alta el material se comprueba que el fichero existe y trae voxels** (`getTexDef`,
  que cachea, así que el `game.addMaterial` de después no re-descarga). `mcBuildPalette` se **traga** una
  textura que falla —la pinta fucsia— y el bloque se quedaría para siempre en la lista de materiales del
  mundo, **que se guarda en disco**: una errata no puede ensuciar el mundo.
- **Se carga por `game.addMaterial` y no por `mcAddBlock`**: es quien invalida la caché `mcMat2id`.
- `mcStampSrc` usa la misma pregunta, así que `game.stamp('flor_amarilla', …)` con la textura sin cargar
  tampoco da roca — ahí no hay que esperar a nada, porque estampar no necesita la paleta.

⚠️ **Efecto visible, y es el precio de todo esto: el bloque aparece un instante después.** `setVoxel` es
**síncrono** y cargar una textura es **asíncrono**, así que un `getVoxel` inmediatamente después de un
`setVoxel` con material sin cargar todavía devuelve **lo que había** (aire, normalmente). Lo que no hace
es mentir poniendo otro bloque.

⚠️ **`mcBuildPalette` vacía `mc.palette`/`mc.blockKey`/`mc.name2id` de golpe** y los rellena textura a
textura: **mientras corre, TODO material parece «sin cargar»** (y `mcResolveMat` devuelve el fallback).
Por eso la pregunta «¿está cargado?» se le hace a **`mc.blocks`** (`mcClaveCargada`), que es estable, y
por eso existe **`mc.paletaEnObra`**: durante esa ventana la celda también se apunta y se espera a que
la paleta termine (`mcEsperaPaleta`) en vez de escribir el bloque equivocado — pedir otra vez un
material que ya está en `mc.blocks` lo **duplicaría**. El cuerpo real vive en `mcBuildPaletteImpl`; el
`mcBuildPalette` de fuera solo lleva la cuenta con `try/finally`.

Guardián: `node test_setvoxel_autocarga.js` (21 ok). Busca solo él un mote del índice que **no** esté
ya en la paleta del mundo, porque las flores ya están plantadas en `/map/test`.

### La zona de pruebas de `/map/test`

`monta_zona_caras.js` (raíz del repo) planta en **`/map/test`** cinco puestos en fila con una **nota
post-it** al lado de cada uno, para poder mirar con los ojos lo que los tests miden. Es idempotente:
barre lo fino que hubiera en la caja `x 34-62 · z 40-46` antes de repoblar, porque `game.stamp` **no**
lo es (cada pasada apila otra estructura en la misma celda).

| puesto | x | qué enseña |
|---|---|---|
| 1 | 36 | hojas por `setVoxel` → bloque de terreno con la textura **calada** por `caras` |
| 2 | 42 | las mismas por `game.stamp` → pieza fina; tiene que **parecerse** al 1 |
| 3 | 48 | `demo-hojas-sin-caras` = el mismo dibujo **sin** la clave `caras` → el cubo verde de antes |
| 4 | 54 | `hierba-alta`: 2 caras por voxel, se ve por los 4 lados y se **atraviesa** |
| 5 | 60 | muro de tablones para probar a mano `game.bloques.define(…,{atravesable:true})` |

Medido con la cámara a 5 bloques y un recuadro central de 64 px: por el puesto 1 se ve **11,8 % de
cielo** a través del follaje y por el puesto 3 **0 %**. `assets/demo-hojas-sin-caras.vox.json` existe
**solo** para ese A/B y está dado de alta en `assets/index.json` (el registro del cliente se alimenta
de ese índice, no del directorio: un `.vox.json` suelto **no** se resuelve por nombre corto).

Test: `node test_stamp_scripting.js` (que la hoja es de recorte y **ya no avisa**; que dos hojas
pegadas emiten sus 12 caras y dos rocas solo 10; que la mata va al lote fino del chunk y ya no avisa;
que `mcSolid` no cambia; que `game.stamp` crea la pieza con `bits` en ceros y `bitsAim` ocupado; y el
precio de cada vía en ms y draw calls).

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

#### El panel enseña TODAS las capacidades, una tarjeta cada una

El formulario del panel de Agentes enseñaba 4 de los ~20 parámetros del bicho entero, y `empuje`
(v1.25) y `fisica` (v1.26) **no aparecían por ninguna parte** aunque el agente las tuviera: se podía
tener encendido algo que el panel no sabía contar. Ahora el bloque «El bicho entero» son **tarjetas
plegables**, una por capacidad (`seguir` 👁, `andar` 🚶, `empuje` 👊, `fisica` 🧊, `cuerpo` 🧱), más las
dos por pieza que ya existían (`articula` 🔩, `mirar` 👀). Plegada, la tarjeta dice si está encendida y
con qué valores; abierta, saca **todos** sus parámetros. Bajo el preview hay una fila de **chips** con
lo mismo resumido, para leerlo sin abrir nada.

**Tres reglas que no son cosméticas:**

1. **Los valores por defecto son los de la librería, y salen en gris (`.def`).** Un campo vacío o a 0
   mentiría: `distancia:0` significa «se te echa encima» y es lo contrario de «no lo he tocado». Los
   números que ves cuando el documento no trae la clave son los que `normalizarSeguir`/`crearEsqueleto`
   /`normalizarFisica` van a usar de verdad.
2. **Abrir el panel no engorda el documento.** Una capacidad encendida en su valor por defecto se
   guarda **sin la clave**; tocar un campo escribe solo esa clave; apagar y volver a encender la borra.
   Los defectos viven en un sitio (la librería), no duplicados en el panel.
3. **El panel no ofrece lo que la librería va a rechazar.** `seguir.objetivo` solo da «el jugador» y «un
   punto fijo»: seguir a **otra clave de material** busca la instancia más cercana con ese material y un
   rig no es una instancia. Y «trepa por las escaleras» sale **deshabilitada** — todavía no existe para
   un agente; quitarla de la lista haría pensar que se olvidó.

Apagar una capacidad que no tiene clave de apagado se escribe con sus valores neutros: `empuje` off es
`{fuerza:0, salto:0}` (aguanta el golpe sin moverse) y `andar` off es `{cadencia:0}` (no mueve las
patas). `seguir` off sí es `false`, y la tarjeta avisa de que **la librería se niega a plantarlo**.

Qué tarjetas quedan abiertas vive en `agAbiertas`, **no en el DOM**: el formulario se reconstruye
entero en cada cambio y cualquier estado guardado en el nodo se perdería a la primera tecla. Y
`agCargar` lleva billete (`agCargaId`, como el `agPrepId` de `agPreparar`): elegir dos agentes seguidos
no puede dejar que la respuesta vieja pise a la nueva.

Test: `node test_panel_agentes.js` (Chromium real, 30 casos).

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

**Cada campo se explica solo.** `base` / `reposo` / `amplitud` / `desfase` no se adivinan mirándolos
(«en edición de agentes articulados no queda claro qué es cada una de estas opciones»), así que la
etiqueta de un campo puede ser `'amplitud'` o **`{t:'amplitud', ayuda:'…'}`**. Va como objeto y no
como un argumento más porque en `agCampoNum` el último ya lo tiene pillado `esDef`: así cualquier
campo se explica sin tocar ninguna firma. La ayuda sale por **dos vías** — el `title` del `<label>`
(el globo de siempre) y un **«?» que la despliega debajo**, porque en el móvil no hay hover ni globo —
y se abre con **`:focus` y no con `:hover`** para que las dos no se pisen. Nada de estado en el DOM:
el formulario se reconstruye entero en cada tecla (por eso `agAbiertas` vive fuera), y el foco se
pierde solo, que es justo lo que se quiere. ⚠️ El «?» es un `<button>` **dentro del `<label>`**: se
salva de robarle el clic al campo porque es *contenido interactivo* y la activación del label lo
salta — lo prueba `test_panel_agentes.js`. Efecto lateral querido: `.ag-fld.con-ayuda` lleva
`flex-wrap:wrap`, así que en el móvil una terna como `en (x, alto, z)` cae a su propia fila entera en
vez de partir el rótulo por la mitad.

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
   único que deja **reponer un pivote** con 📍 y guardar la pieza de vuelta. Se salvó el `group`:
   `a.type!=='textura' || a.group==='Agentes'`. ⚠️ **Ese filtro ya no está** — ver abajo por qué.
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

#### «Guardar como…» — el `id` manda sobre el nombre

`POST /api/agentes` deriva el fichero de **`d.id || d.nombre`** (`server.py:437`), así que **el `id`
gana**: cargar el zombie, renombrarlo y darle a **Guardar** reescribía `data/agentes/zombie.json` con
otro nombre dentro. No había forma de sacar una copia ni de partir de un bicho que ya funciona para
hacerle una variante. `agGuardarComo()` **le quita el `id` al documento** — eso, y solo eso, es lo
que convierte el guardado en un «como…».

- El aviso de «ya existe» usa `slug()` (`app.js:1680`), que es **el mismo** que `slugify` de
  `server.py:33-35`; calculado de otra forma mentiría justo en los casos raros (acentos, símbolos) y
  la copia pisaría un agente en silencio. Sobrescribir se confirma, y la versión anterior va a la
  papelera igual (`to_trash`).
- **Si el POST falla se deshace el cambio** (`id` y `nombre` vuelven a los de antes, y el campo
  también): si no, el panel se quedaría apuntando a un fichero que no existe y el siguiente
  **Guardar** escribiría en el sitio equivocado.
- El nombre propuesto es el primero libre (`zombie 2`, `zombie 3`…), comprobado contra `agLista`.

⚠️ **Renombrar sigue sin estar cableado.** `PATCH /api/agentes/<id>` sabe mover el fichero
(`server.py:539-545`) pero **nada en `app.js` lo llama**: cambiar el nombre y pulsar Guardar deja el
fichero con el id viejo y el nombre nuevo dentro. El toast lo dice (`guardado en
data/agentes/<id>.json`), y con «Guardar como…» ya hay una salida, pero es un cabo suelto.

#### El desplegable «dibujo» no esconde nada, y el catálogo no se cachea de por vida

El filtro de v1.23 (`a.type!=='textura' || a.group==='Agentes'`) tenía una consecuencia que solo se ve
al **crear una pieza nueva**: `POST /api/assets` guarda todo como `type:'textura'` +
`group:'Bloques de construcción'` (`server.py:484-485`) y **no hay UI para elegir el grupo**, así que
copiar la cabeza, llamarla «Cabeza de Personaje» y guardarla la dejaba **invisible para siempre** en
el desplegable. Les pasaba también a `cabeza` y `brazo`, las dos piezas del zombie original. Ahora
`agCatalogo()` ofrece **todo**, repartido en `<optgroup>` con **Agentes primero** (`AG_GRUPOS`): eso
resuelve lo que el filtro resolvía de verdad — que los azulejos no tapen los brazos — sin ocultar
nada. `sort` es estable, así que dentro de cada grupo manda el orden del índice, o sea el orden en
que se fueron guardando.

(Que exista una «Cabeza de Personaje» aparte de la del zombie es la otra mitad del mismo defecto: el
guardado deducía el id del rótulo y bifurcaba. Ver **«Retocar una pieza y que el bicho vivo se
entere»**, más abajo.)

Y `agCat` se **invalida al abrir el panel** (`openAgentes`). Se cacheaba una sola vez por carga de
página: guardabas una pieza en el editor, volvías al panel y seguía sin estar. Refrescarlo cuesta un
`fetch` del índice por apertura.

⚠️ La pieza que el documento ya trae se antepone al catálogo aunque este no la conozca (grupo «En el
documento»): si no, elegir otra pieza y volver dejaría el `<select>` apuntando a un dibujo distinto
del que dice el JSON.

Test: `node test_panel_agentes.js` (**40 ok**) — que el catálogo ofrece un `textura` fuera del grupo
Agentes (`adoquin`), que el primer `<optgroup>` es «Agentes» y que cada grupo sale ordenado. El
«Guardar como…» se prueba **sin escribir nada**: los `POST` van abortados y se inspecciona el
documento que *habría* salido (sin `id`, con el nombre nuevo) más la marcha atrás al fallar. Las
ayudas se comprueban por las dos vías a la vez (que el `title` y la nota digan **lo mismo**) y con un
**clic de verdad** de Playwright, no solo con un `focus()` a mano: lo que se quiere saber es que un
dedo llega a ellas.

#### Retocar una pieza y que el bicho vivo se entere — el asset se identifica por su FICHERO

La queja: «los cambios que se realizan en el bloque/estructura una vez guardado no se reflejan en el
personaje». **No era el refresco**: `mcRefreshSavedKey()` funcionaba (una sonda le cambió a un rig
vivo el `colCount` de 1578 a 8472 en caliente). Era **dónde aterrizaba el dibujo**.

Un agente guarda sus piezas como `asset:assets/<id>.vox.json`. Pero al guardar, el id se deducía del
**rótulo**: `POST /api/assets` hacía `idd = slugify(meta.name)`. Retocar «Torso de zombie» escribía
en `torso-de-zombie.vox.json` — **un asset nuevo que no usaba nadie** — mientras el agente seguía
leyendo `torso-zombie.vox.json`, y el refresco se mandaba con la clave del fichero nuevo, así que
tampoco había forma de que se notara. **17 de los 49 assets** tenían `id != slug(nombre)`,
**incluidas las 8 piezas de agente**: ninguna se podía retocar. Los `assets/*-de-personaje.vox.json`
del dueño son las esquirlas de esto.

Es **el mismo defecto que ya se arregló para los agentes** («Guardar como…», arriba): el `id` manda
sobre el nombre. Ahora:

- **`POST /api/assets` respeta `d.id`** si viene (acotado a `[A-Za-z0-9_.-]`, así que un
  `../../data/habitantes/diana` se queda en `assets/`); sin `id`, alta nueva y ahí sí manda el nombre
  — que es justo lo que hace **«Guardar como…»**, y por eso sigue bifurcando.
- **Cargar un asset de la galería se queda con su id** (`loadFromUrl(url, id)`). Antes lo ponía a
  `null` a propósito («punto de partida»), y eso era lo que forzaba la bifurcación.
- **El id viaja en la copia local** (`localSnap`/`restore`): sin eso, recargar la página perdía el
  origen y el siguiente Guardar volvía a bifurcar.
- **Se respalda antes de pisar** (`to_trash(..., move=False)`): ahora que Guardar reescribe assets,
  perder la versión anterior sería un roto de verdad. Y el índice refresca también el `size` (el
  dibujo pudo cambiar de tamaño), pero **nunca el `group`**: no hay UI para elegirlo y machacarlo
  mandaría una pieza de «Agentes» a «Bloques de construcción».
- El toast dice **el fichero**, no solo el rótulo: es lo que enseña de un vistazo que el dibujo fue
  donde lo buscan los agentes.

⚠️ **Renombrar y darle a Guardar pregunta.** Es el otro camino que usa el dueño (cargar una pieza del
zombie, llamarla «de personaje» y guardar) y las dos lecturas son razonables: *retoco esta* o *parto
de ella para hacer otra*. Manda el id, así que sin el aviso ese «hazme una variante» se habría
convertido en **pisar el original**. Sin cambio de nombre no se pregunta nada.

**Y una segunda mitad, la del panel** («en el Mundo al guardar se ven los cambios, es en el editor de
agentes donde no»): el preview del panel **no pasa por el Mundo** y tiene sus propias cachés —
`agGeomCache` (caras ya fusionadas, por `clave|rot`) en `app.js` y `docsCache` (el doc del dibujo)
dentro de la librería de esqueletos, en el snippet. `mcRefreshSaved` las suelta ahora **antes** del
corte por `mc.gl` (el panel tira con el Mundo sin abrir, si no no se llegaría nunca) y le pide al
snippet que olvide lo suyo con **`game.esqueletos.olvidarDibujo(clave)`** — se le pide, no se le
hurga dentro.

⚠️ Y el sitio donde se vacía `agGeomCache` importa: tiene que ser **justo cuando entra el plan nuevo**
(dentro del `.then` de `agPreparar`), no al guardar. Entre la petición y la respuesta el bucle de
dibujo sigue pintando el plan viejo y **vuelve a llenar la caché con el dibujo de antes**; limpiando
solo al guardar, el torso viejo sobrevivía igual. La sonda lo enseñó sin ambigüedad: el doc ya traía
el dibujo nuevo (1320 → 660 voxels) y las caras dibujadas seguían clavadas en 803.

Test: `node test_guardar_pieza.js` (**13 ok**) — se crea **su propia** pieza con `id != slug(nombre)`
(y la borra en el `finally`, comprobando que los 49 assets del dueño siguen enteros), la carga desde
la galería con un clic de verdad, la retoca, guarda, y mira **el fichero en disco**: que cambió el de
siempre, que **no** apareció el bifurcado, y que la clave que se manda refrescar es exactamente la
que usa un agente. Más el F5, y las dos ramas del aviso al renombrar.

### 🧗 Parkour: agarrarse al canto y trepar (v1.27, agarre sin tirón en v1.28)

Lo único de la librería que es **del jugador** y no de un material. Hasta v1.26 un bloque a **3 de
altura** era inalcanzable: el salto de Minecraft sube `h = v²/2g = (8√s)²/44 = 1,4545·s` y el
auto-escalón llega a `MC_STEP=0.6`. Ahora, si el salto se queda corto y **el espacio sigue pulsado**,
el jugador se queda **colgado del canto** (el apoyo de brazos que no se ven es el congelado) y desde
ahí **`W` lo sube en una curva suave** hasta dejarlo de pie encima. Colgado, **`A`/`D` desplazan por
el borde**. Encendido por defecto y sobre **cualquier canto sólido** — terreno y estructuras.

`libre → colgado → subiendo → libre`, con veda de `0,25 s` al coronar. El estado vive en
`mc._parkour` (**nunca en un closure**, igual que `mc._pasoDesfase`: reejecutar el snippet a media
escalada no puede dejar al jugador congelado en el aire) y todo va **dentro del `envuelto` que ya
existe**, no en un segundo envoltorio.

```js
game.parkour.activo      // on/off (por defecto ON)
game.parkour.alturaMin   // 1.5 · altura mínima del canto sobre los pies, en unidades de jugador
game.parkour.alturaMax   // 2.2 · hasta dónde llega el brazo (el jugador mide 1,8)
game.parkour.caida       // 0   · velocidad de caída mínima para permitir el agarre
game.parkour.velLateral  // 1.6 · shimmy con A/D, u/s a escala 1
game.parkour.duracion    // 0.45 s de subida
game.parkour.alcance     // 0.45 · cuánto se asoma el sondeo más allá del cuerpo
game.parkour.calado      // 1.2 · v1.28 · cuánto cuerpo queda SIEMPRE por debajo del canto
game.parkour.acomodo     // 0.06 s · v1.28 · constante de tiempo del acercamiento al canto (0 = seco)
game.parkour.estado()    // ← el diagnóstico: en qué estado está y POR QUÉ no engancha
```

`estado()` **vuelve a sondear desde donde estás saltándose las condiciones de entrada**, para poder
plantarse delante de un saliente rebelde y preguntar: `'el canto ya no está ahí'` / `'hay pared
encima del canto'` / `'sin apoyo bajo la huella'` / `'no cabe de pie arriba'` / `'la pose de colgado
no cabe'` / `'de pie en el suelo'` / `'enfriando'`. Sin eso la única forma de depurar un canto que no
engancha es a ciegas, y el dueño juega en el móvil. Tunables al estilo `window.room` (objeto plano
con accesores enumerables — **no un Proxy**, BUG-RM1), persistidos en `localStorage` (`vf_pk_*`) y
con avisos por **`toast()`**.

**Tres consecuencias del orden de `mcUpdate` que dictan el diseño** — leídas, no supuestas:

- **(A) `mcUnstick` corre al PRINCIPIO de `mcUpdate`** (`app.js:5841`, llamado en `app.js:5898`):
  busca hacia arriba en pasos de 1/16 la primera `y` libre y pone `onGround=true`. Una pose de
  colgado que solape la pared **aunque sea 1e-9** se convierte al frame siguiente en un trepado
  instantáneo falso. Por eso la pose se **valida con `mcCollides`** y se **retrae por la normal**
  hasta `PK_RETRAE = 8` pasos de 1/16; si nunca cabe, **se rechaza el agarre**.
- **(B) Colgado y subiendo, `orig(dt)` NO se llama.** El plan decía «correr la física y restaurar la
  posición»; no vale, precisamente por (A) — `mcUnstick` va antes de que podamos restaurar nada.
  Saltarse `orig(dt)` entero es estrictamente más fuerte. El mundo no se congela porque el envoltorio
  sigue llamando a `seguirObjetivos` / `mirarObjetivos` / `esqueletosPaso`.
- **(C) El envoltorio recibe el `dt` CRUDO**: el tope de 0,05 está **dentro** de `mcUpdate`
  (`app.js:5894`), y el parkour se salta `mcUpdate`. Sin un tope propio (`dtp`), una pestaña en
  segundo plano corona el canto de un tirón. Tiene su prueba.

**El sondeo, por qué así:**

- **Dirección encajada al eje** (la de mayor componente de `mc.yaw`): así está hecho el mundo y evita
  agarres en diagonal contra una esquina.
- **La cara de la pared no se adivina**: se barre de **cerca a lejos** en pasos de 1/16, y el borde
  interior de la primera columna sólida **es** la cara.
- **Suelo de altura `max(alturaMin·esc, MC_STEP·esc + inc)`**, con el mismo `inc` del auto-escalón
  (`app.js:5754`). Sin ese margen el parkour y el escalón automático se pelearían por el mismo
  bloque y un bordillo daría un agarre en vez de una zancada; y `alturaMin = 1.5` va justo por encima
  de `1,4545·s`, así que **un bloque de 1 se sigue subiendo de un salto**.
- **Apoyo bajo las CUATRO esquinas** de la huella: un labio de 1/16 pasa el test del canto y te
  dejaría de pie sobre el aire.
- **Ayuda de puntería**: si en la vertical exacta del jugador la huella no apoya, se prueban 1/16 a
  cada lado hasta medio cuerpo — lo mismo que haría el shimmy, sin obligar al dueño a pelearse con
  `A`/`D`.
- **Se miran los dos sitios donde vive el mundo** (`mcSolid` + `mcFineSolidAt`): la rejilla sola es
  medio mundo.

**La subida es una L** (Bézier cuadrática con `smoothstep`, `P1.xz = P0.xz`): a mitad de camino se ha
subido el 75 % y avanzado el 25 %. Es la curva que pidió el dueño («sube y avanza en una curva
suave») y de paso impide atravesar una pared de 1 de grosor y aparecer **dentro de una habitación
sellada**.

**v1.28 · te cuelgas A LA ALTURA A LA QUE ESTÁS, no en una pose fija.** Hasta v1.27 `pkPose` clavaba
`y = canto − 1.8·esc`; como el agarre se permite desde `alturaMin = 1.5`, engancharse cerca del punto
alto del salto **te bajaba hasta 0,3 de golpe en un frame**, un tirón muy visible. Ahora la altura de
colgado es `min(p[1], canto − calado·esc)`: tu propia `y`, con el único tope de que quede `calado`
(1,2) de cuerpo por debajo del canto — si no, con un `alturaMin` bajo te «colgarías de las rodillas».
Por abajo no hace falta tope porque el sondeo ya acota a `alturaMax`. Si esa altura no cabe
(la retracción de (A) la rechaza) **se reintenta la pose canónica** antes de descartar el canto, así
que no se pierde ningún agarre que funcionara antes. El shimmy y el arranque de `W` usan **esa misma
`pk.y`**, no la canónica: desplazarse por el canto no sube ni baja.

Y el resto del encaje (el ajuste en **XZ** contra la pared, que sigue siendo instantáneo por
definición) se suaviza con un **desfase que decae exponencialmente**: al agarrarte se guarda
`des = posición_real − pose` y cada frame se multiplica por `exp(−dt/acomodo)`, el mismo patrón
frame-rate-independiente de `pasoSuave`. Con `acomodo = 0` el agarre vuelve a ser seco. Ojo al leer
el código: en el caso normal `pk.y === p[1]`, así que **`des[1]` es 0** y el acomodo solo trabaja en
XZ; la prueba de «60 frames sin deriva» sigue pasando porque el desfase muere por debajo de
`1/(16·MC_T)` en unos pocos frames.

**Se suelta el agarre en cuanto alguien de fuera mueve al jugador**: se compara `mc.pos` con la
posición que escribimos (`pk.esp`, ±1e-6, el mismo truco de `restaurarPaso`), lo que cubre `game.tp`,
respawn, `mcUnstick`, `alPisar`, salir del Mundo y el cambio de `mc.scale`. Y **coordenada no finita
⇒ abortar**: un `NaN` hace que `Math.floor(NaN)` se salte los bucles de `mcCollides` («no hay
colisión en ninguna parte») y la caída sería infinita.

**El signo de `A`/`D` se FIJA al agarrarse** y solo se reevalúa si `|dot(right, tangente)| > 0.5`:
reevaluarlo por frame da bandazos justo cuando miras a lo largo de la pared, porque ahí el producto
escalar cruza el cero. El desplazamiento avanza en **sub-pasos de 1/16 revalidando el test de agarre
entero**, así que se para solo en el final del canto, en una esquina o en un hueco.

**Límites, a propósito:** (1) solo **cantos encajados al eje**, nada de diagonales ni superficies
inclinadas; (2) **sin animación visible de brazos** — es primera persona, el «apoyo» es el congelado
más la curva; (3) **el shimmy no dobla esquinas**, se para donde acaba el canto; (4) **nada de esto
entra en `mundo.json`**: es comportamiento del snippet, no geometría.

Test: `node test_parkour_navegador.js` (Chromium + SwiftShader, 18 ok) — monta su propio patio con un
muro de 3, y cubre que sin parkour el salto no llega, que el espacio deja colgado sin deriva 60
frames, que soltarlo cae, que `W` acaba de pie encima, que la trayectoria es una L, la veda, el
shimmy y su parada, que un escalón de 1 **no** dispara parkour, que un vano de 1 de alto se rechaza,
que un `dt` gigante no corona de un tirón, y que el mundo del dueño queda como estaba. Desde v1.28 el
agarre **no se comprueba contra una `y` fija** (sería clavar el bug): se exige que caiga en la banda
`[canto − alturaMax, canto − calado]` y que **el salto en `y` del frame del agarre no sea mayor que
la caída que ya llevabas**. ⚠️ La altura
hay que leerla **antes** de `suavizarPaso` (`yFisica()` en el test): `mc.pos[1]` lleva el desfase del
ojo y medir ahí da `31.996` donde el canto está en `32`.

### 💡 Poner un bloque no puede costar el mundo entero (skylight incremental)

Hasta aquí, **cada bloque puesto o roto recalculaba la luz del mundo entero**: `mcRemeshAround` llamaba
a `mcComputeLight()`, que barre las `NX·NY·NZ` celdas. Medido con SwiftShader, una sola edición:

| mundo | celdas | skylight global | edición entera (hoy) |
|---|---|---|---|
| 96×40×96 | 368 640 | 42 ms | **7,2 ms** |
| 256×40×256 | 2 621 440 | 199 ms | **6,0 ms** |
| 512×40×512 | 10 485 760 | **680 ms** | **8,5 ms** |

O sea que el coste **crecía con el volumen del mundo aunque el bloque tocado fuera uno**, y en un mundo
grande se comía 40 frames de golpe. Ahora `mcRelightBox(x,z)` recalcula solo **una caja**: `±17` en X/Z y
la **columna entera** en Y. Esa forma no es arbitraria — la luz pierde 1 nivel por paso, así que una
edición no llega a más de `MC_MAXLIGHT`=15 pasos por aire, **salvo hacia abajo**, donde abrir o tapar una
columna le cambia el cielo de arriba abajo de una vez.

**Es exacto, no una aproximación.** Las celdas de fuera de la caja no han podido cambiar, así que valen
de condición de contorno: se siembran hacia dentro con su nivel actual −1. Cualquier camino de luz que
salga y vuelva pasa por el borde, y el borde ya trae su mejor valor. Eso no se cree, **se comprueba**:
`node test_luz_incremental_navegador.js` compara `mc.light` **celda a celda** contra `mcComputeLight()`
tras 120 ediciones al azar más los casos que duelen (abrir el techo de una cueva y taparlo, las caras del
mundo, la frontera de un chunk, el fondo).

Dos cosas más que iban en el mismo frame:

- **Se re-malla lo que cambió, no un 3×3 fijo.** `mcRelightBox` devuelve el AABB de las celdas que
  *realmente* cambiaron de luz; normalmente es **1 chunk en vez de 9**. El `±1` en bloques que se le une
  es la **geometría**: si la celda tocada está en el borde del chunk, la cara que se ve es la del vecino.
  ⚠️ Si esa caja se quedara corta el síntoma no sería un error sino **sombras viejas pegadas** en
  pantalla, así que tiene aserción propia.
- **`mcComputeBlockLight` ya no pone a cero lo que ya estaba a cero.** Sin emisivos hacía un `fill(0)` de
  N bytes por edición (3 ms en 512²) para no cambiar ni un byte; lo corta la bandera `mc._blCero`, que
  vive junto al único sitio que escribe `BL`.

#### …y una ráfaga de script tampoco (`mcBuildBox`)

Lo de arriba arregla **el clic**, que va por `mcRemeshAround`. Una **ráfaga de `setVoxel`** iba por otro
camino —`mcFlushBuild`— y ese seguía llamando a **`mcMeshAll()`**, o sea el mundo entero: skylight global
más los 1024 chunks. Con `beginBatch`/`endBatch` eso es **un `mcMeshAll` por lote**, y un snippet que
anima algo hace un lote **por fotograma**. El dueño lo reportó con el suyo de TNT: «en mundos grandes va
suuuper lento, llegando a tardar unos 40 seg», y su propia teoría era la correcta — «se actualiza el mapa
cada vez que se borran voxels… los fps caen a 0».

La ráfaga apunta su **caja en planta** (`mcBuildBox`, poblada por `mcMarcaBuild` en los dos únicos sitios
que escriben contando: `mcSetVoxel` y el volcado de `mcApuntaPendiente`) y el flush re-malla **solo eso**.
Las tres funciones de la edición de un bloque aceptan ahora una **segunda esquina** opcional —
`mcRelightBox(x,z,x1,z1)`, `mcRemeshAround(x,z,x1,z1)`, `mcRebakeStructsNear(x,z,x1,z1)` —; sin ella se
comportan **exactamente** como antes, que es lo que mantiene intacto el camino del clic.

- **Sigue habiendo vuelta a `mcMeshAll`**, y no es cosmética: `mcCajaCompensa` compara la caja **más el
  halo de ±`MC_RELIGHT_R`** que necesita el skylight contra media planta del mundo. Un script que reescribe
  el mundo entero de un lote no puede pagar el halo dos veces.
- **El razonamiento de exactitud no cambia** al pasar de celda a caja: lo que vale es que el halo quede
  dentro, no que la edición sea un solo bloque. Lo comprueba celda a celda el mismo
  `test_luz_incremental_navegador.js`.
- **`mcPonEnRejilla` limpia `mcBuildBox`** al quedarse él con el volcado; y en la otra rama (había
  escrituras de script a medio volcar) su `mcSetVoxel` ya metió la celda en la caja, así que el flush
  ajeno la incluye. Antes eso lo garantizaba el `mcMeshAll`.
- **Lo que el camino de la caja NO hace**, igual que ya pasaba con el clic: re-mallar los cuerpos de
  agente por si creció el atlas, y refrescar `mc.blockLightMeshed`. No hace falta porque la paleta **no
  puede crecer dentro de un lote** (`mcResolveMat` manda a roca lo desconocido); lo que sí la hace crecer
  —una textura que llega tarde por `mcApuntaPendiente`— pasa por `game.addMaterial`, que ya re-malla entero
  **antes** de escribir sus celdas.

Medido en 512×40×512 (SwiftShader, ~10× una GPU), con el snippet `explosion-tnt` del dueño: la segunda
explosión pasa de **36 209 ms y 9 `mcMeshAll`** a **5 689 ms y 0**. Repartido: de los 35 789 ms que se
iban en mallado quedan **304 ms** en los 9 flushes (74 ms de skylight, 42 de luz de bloque, 185 en **4
chunks por flush** en vez de 1024). Lo que queda es tiempo de **fotograma**, no de edición: en reposo ese
mundo ya cuesta 196 ms/frame con SwiftShader.

**El tope de `game.resizeWorld` sigue en 512×256×512, y es de memoria, no de capricho.** Las cuatro
rejillas densas son `grid` Uint16 + `light` Uint8 + `blockLight` Uint8 + `blockLightDir` Int8×3 = **7
bytes por celda**: 512×40×512 son 73 MB, pero un `1000×40×1000` serían **280 MB** solo en arrays, antes
de las mallas de 3 844 chunks. Subir el tope es una decisión de presupuesto de memoria, aparte de esta.

### Una antorcha alumbra esté donde esté (emisores en la rejilla)

`mcComputeBlockLight` nació cuando una pieza luminosa **solo podía existir estampada suelta**, así que
sembraba la luz recorriendo `mc.structures` y leyendo sus `emitCells`. Desde que el clic derecho mete
en `mc.grid` todo lo que cabe en su celda, una antorcha puesta ahí **se veía encendida pero no
alumbraba nada**: no estaba en esa lista, así que no existía como foco. Es el mismo patrón que el giro
en la clave — la pieza no cambió, cambió por dónde entra.

La geometría fina de la rejilla **ya trae** `emitCells`/`emitDir` horneados (los mismos que consume la
siembra), así que la corrección es dónde mirar, no cómo alumbrar: `siembra(cx,cy,cz,ed,k)` es una sola
función con **dos fuentes**, las estructuras y la rejilla. Una antorcha en cualquiera de las dos vías da
el **mismo perfil de luz**, y eso es lo que fija `node test_luz_en_rejilla.js`.

⚠️ **Encontrarlas es el problema, no sembrarlas.** Barrer `mc.grid` entera en cada edición cuesta ~60 ms
en 512×40×512 (medido), y la luz se recalcula en **cada bloque puesto o roto**. Por eso hay un índice
disperso, `mc._glowCeldas` (Set de índices de celda), con dos reglas:

- Se **rehace de cero** solo cuando cambia *qué materiales emiten* (`mc._glowFirma`: paleta nueva o
  geometría fina recién horneada) o cuando cambia la rejilla entera (`mc._glowRef`: cargar o
  redimensionar). Ése es el único barrido O(celdas) que existe.
- Se **corrige celda a celda** en `mcGlowTocada(x,y,z)`, que se llama **después** de escribir en
  `mc.grid`. `mcDirty` no vale de embudo: se corta sola cuando el guardado ya está marcado entero.

Dos consecuencias que no se ven en el diff: `mcRecomputeHasGlow` mira también la rejilla (si no, quitar
una estructura apagaría una antorcha que sigue puesta), y `mcAgentSetBlock` ya no puede saltarse el BFS
en un sólido→sólido si la celda **gana o pierde** un emisor (pintar una antorcha encima de piedra).
`mc.hasGlow` solo se **enciende** aquí, nunca se apaga: con `BL` a cero se ve igual (`lv=max(L,BL)`) y
apagarla pisaría el mallado a medio poblar.

### Si se ve a través, la luz pasa (`mc.recorte` por defecto · `luz:'pasa'`/`'tapa'` a mano)

`leaves` estampada como **bloque** se ve negra por dentro; la **misma** pieza estampada como
estructura fina se ve iluminada. No es el mapa de sombras del sol, es el **skylight**: el bloque ocupa
la celda 16³ y corta la difusión (dentro `mc.light=0` ⇒ factor `interiorDark^1` = ×0,1), mientras que
la estructura fina deja la celda como **aire** y la luz la cruza (`mc.light=15` ⇒ ×1). Por eso el
mismo dibujo se veía de dos maneras según cómo se hubiera puesto.

**Va POR DEFECTO y no hay que declarar nada**: el criterio es `mc.recorte` — si la textura del bloque
tiene **agujeros**, la luz pasa. Es el mismo sí/no que ya usa el shader para hacer `discard` y el
mesher para dejar de pelar caras contra él, o sea: **«si se ve a través, se ve a través»**. Roca,
tierra y hierba son macizas y siguen tapando, así que **las cuevas siguen a oscuras**.

⚠️ **Lo mide la PROYECCIÓN a las 6 caras del cubo (`buildTexFaces`), no el número de voxels.** Una
pieza dispersa cuya cáscara tapa las seis caras **no** es de recorte y **no** es permeable por
defecto. Se ve en los dos assets gemelos: `leaves.vox.json` (con máscara de `caras`) es de recorte;
`demo-hojas-sin-caras.vox.json`, mismos 1548 voxels **sin** máscara, no lo es.

Para la excepción está `game.bloques`, con `mc.traspasaLuz` como gancho — `Uint8Array` por id,
**1 = pasa, 2 = tapa, 0 = lo que diga el defecto** (o `null` = nadie ha dicho nada, lo normal):

```js
game.bloques.define('hab:vidriera', { luz:'tapa' });   // es de recorte pero SÍ debe dar sombra
game.bloques.define('hab:reja',     { luz:'pasa' });   // es maciza pero debe dejar pasar la luz
game.bloques.quitar('hab:vidriera');                    // vuelve al defecto
```

El `'tapa'` no es adorno: desde que el defecto está encendido, sin él **no habría forma** de decir que
una vidriera de recorte tiene que sombrear.

Las dos fuentes se combinan en **`mcTablaLuz()`** (primero `mc.recorte`, encima `mc.traspasaLuz`), que
se lee en **dos sitios y solo dos**: `mcComputeLight` (barrido global) y `mcRelightBox` (incremental).
Añade el aire (id 0) pase lo que pase y tolera que la paleta haya crecido después. Se construye **una
por llamada** a propósito: `mc.recorte` lo rehornea `mcBuildPalette` y `mc.traspasaLuz` lo escribe el
snippet, así que una tabla cacheada se quedaría vieja sin que nadie la invalidara. Que el defecto no se
quede viejo lo garantiza `mcAddBlock` → `mcMeshAll` → `mcComputeLight`.

⚠️ **Los dos tienen que usar los MISMOS predicados, sin excepciones.** En cuanto difieran en un solo
`if`, el mundo editado deja de coincidir con el recién cargado — que es exactamente lo que compara
celda a celda `test_luz_incremental_navegador.js`.

⚠️ **`luz:'pasa'` NO abre la columna de cielo.** Los dos bucles de siembra vertical conservan su
`if(g[i]!==0) break;`, así que un dosel de hojas **sigue dando sombra** a lo que tiene debajo (medido:
bajo el dosel 11, al aire libre 15). Es una decisión, no un olvido: si la columna se abriera, un
bosque dejaría de dar sombra.

**No cuesta nada.** Medido en los dos mundos reales (96×40×96), el barrido de skylight va de 23,6 a
23,6 ms en `/map/test` y de 20,5 a 16,5 ms en `/map/agents`. Y la fuga está acotada: encender el
defecto solo sube la luz de **98 celdas de aire de 230 821**, porque el único material de recorte que
hay en los dos mapas es `leaves`.

Cambiar la lista de excepciones obliga a recalcular la luz y **re-hornearla en las mallas**
(`mcMeshAll` + `mcRestampAll`), que es lo más caro del snippet. Por eso solo se dispara cuando cambia
de verdad la **lista de ids** (`luzFirma`, con el `id:valor` para distinguir `pasa` de `tapa`), no el
array: `reconstruirCache()` también salta cuando la paleta crece por `game.addMaterial`, y comparar
arrays de distinto largo remallaría el mundo entero por un material que no tiene nada que ver.

Test: `node test_luz_traspasa.js` (24 ok) — el interior de una masa de hojas pasa de 0 a 12 y
**ninguna** celda de aire pierde luz; el dosel sigue sombreando; el incremental coincide con el global;
un material de recorte se ilumina **sin declarar nada** y `luz:'tapa'` lo devuelve a 0; y, metiendo la
cámara en un hueco rodeado de hojas (la foto del dueño), el brillo de pantalla va de **2,4 a 16,9**.

⚠️ Para VER la diferencia hay que estar en un **hueco de aire** rodeado del material, no en el macizo:
las caras interiores de una masa maciza no se mallan (el greedy solo emite la que da a aire), así que
desde dentro del macizo no se ve la masa sino el mundo de fuera, y la medida sale idéntica. Es el
error que dio 46,4 → 46,4 en la primera versión del test.

## 🔴 Redstone — vive FUERA de `app.js`, en `redstone/`

Petición explícita del dueño: **«todo lo de redstone va en ficheros aparte, aunque luego se llamen
desde otros de scripting»**. Los fuentes son `.js` normales en `redstone/` (editables, con resaltado,
comparables en git) y `node redstone/make_snippets.js` los publica en `data/snippets/` por
`POST /api/snippets` — por la API y no escribiendo el `.json` a mano, que es lo que da el respaldo en
papelera y la escritura atómica. Que un snippet cargue a otro no es nuevo: `agente-nube` ya se traía
código por `/api/snippets/<id>` y lo corría con `AsyncFunction` en el ámbito global.

| fichero | qué es |
|---|---|
| `redstone/redstone.js` | el **motor**: mueve señal. No sabe qué es una antorcha. |
| `redstone/redstone-arranque.js` | lo que **carga solo** el mundo: motor + tabla `DEFECTOS` de circuitos de serie. |
| `redstone/redstone-piezas.js` | las **piezas** (cable, palanca, placa, puerta, repetidor, bloque de redstone): circuito + física + clic derecho. |
| `redstone/redstone-demo-antorcha.js` | el **circuito** de ejemplo: planta la antorcha y te da el bloque rojo. |
| `redstone/redstone-ejemplos.js` | monta las **nueve parcelas** de `/map/redstone`, cada una con su cartel. |
| `redstone/montar_ejemplos.js` | lo lanza en un navegador de verdad, lo **acciona y lo comprueba**, y guarda. |
| `redstone/make_piezas.py` | genera los 14 dibujos de las piezas en `data/habitantes/`. **No pisa un fichero existente sin `--forzar`** (ahí viven los dibujos del dueño). |
| `data/habitantes/antorcha-apagada.json` | copia de `antorcha.json` con los 12 voxels emisores **sin el `*`**. |
| `data/habitantes/{cable,placa,palanca,puerta,repetidor}[-on|-abierta].json` | las 10 piezas. El `*` del color encendido no es decorativo: es lo que hace que `mcGlowTocada` indexe la celda y la pieza **alumbre**. |

**Para añadir un material al redstone del mundo se toca la tabla `DEFECTOS` de `redstone-arranque.js`
y nada más** — ni el motor ni `mundo-autoarranque` se abren.

**El comportamiento cuelga del MATERIAL, igual que `game.bloques`** (misma razón: 442 368 celdas no
admiten un objeto por voxel). Lo único por celda es el nivel de señal, en un `Map` **disperso** que solo
tiene entradas donde hay circuito. Y la vecindad es una **cola** drenada en el `rAF` con tope
(`MAX_POR_DRENADO`), no una llamada recursiva: en recursión, un cable largo se come el frame y un anillo
de cable cuelga el navegador.

```js
game.redstone.define('asset:assets/bloque_redstone.vox.json', { emite: 15 }); // fuente
game.redstone.define('hab:antorcha-apagada', { encendida: 'hab:antorcha' }); // lámpara
game.redstone.info(x, y, z);   // el descubridor: qué material hay ahí y con cuánta señal
```

**«Encender» y «alumbrar» son la MISMA operación**, y por eso el sistema de luz no se toca: encender es
cambiar el id de la celda por el del material encendido, y esa escritura ya pasa por `mcSetBlock` →
`mcGlowTocada` → `mcComputeBlockLight` (ver «Una antorcha alumbra esté donde esté»). Los dos materiales
se dan de alta en `define()` **y no al encenderse**: `game.addMaterial` cuesta ~3 873 ms en 512×40×512
(la paleta se re-hornea y el atlas crece ⇒ `mcMeshAll`), o sea un congelado de 4 s en el primer clic.

⚠️ **`define('apagada', {encendida:'X'})` registra TAMBIÉN `X` en la tabla, con la misma cfg.** Sin eso
la lámpara se enciende una vez y **no vuelve jamás**: en cuanto la celda cambia de material su clave
pasa a ser la encendida, la tabla no la reconoce y la celda se cae del circuito. Minecraft registra
`redstone_lamp` y `lit_redstone_lamp` como dos bloques del mismo comportamiento por esto mismo.
`quitar()` se lleva el alias con él.

### Un bloque macizo TRANSPORTA la señal (r1.2) — fuerte / débil

Hasta r1.1 una celda sin `cfg` era un **agujero**: `señalQueLlega` la saltaba y ahí se acababa el
circuito. Desde r1.2 **cualquier bloque de la rejilla que no sea circuito hace de puente**: recibe de
sus vecinos y alimenta a lo que tenga pegado por las otras cinco caras (REQ-RS4, la regla de
Minecraft). No hay estado nuevo — la energía del bloque **se calcula al vuelo** en `energiaDeBloque()`
y no se guarda en `potencia`.

⚠️ **Nunca bloque → bloque.** Un bloque solo mira vecinos *con* `cfg`. Eso acota el coste a un salto y
evita que un cable suelto energice un muro entero por efecto dominó. Dos bloques en fila **no** llevan
la señal, y eso es a propósito.

⚠️ **La asimetría FUERTE/DÉBIL es lo que impide que el cambio se coma el modelo de señal.** Un
**cable** energiza el bloque solo **DÉBILMENTE** y otro cable **no lee** lo débil; todo lo demás
(antorcha, palanca, repetidor) energiza **FUERTE**, y eso lo lee todo el mundo. Sin esa asimetría dos
tendidos separados por un bloque se contagiarían **saltándose la pérdida**, y peor: un tendido se
realimentaría a través del bloque que él mismo alimenta y no bajaría de nivel nunca. Una pieza que no
es cable (una lámpara) **sí** lee lo débil — de ahí que una lámpara bajo un cable se encienda. Lo que
llega por un bloque **no paga pérdida**: se sigue cobrando solo en el salto cable→cable.

⚠️ **El aviso salta a DOS celdas a través del bloque, y salta SIEMPRE** (`encolarPuenteando`). Es
tentador ahorrárselo cuando quien cambia es un bloque normal, pero **«¿era esta celda circuito?» no se
puede responder después de la escritura**: una *fuente* (una palanca) no deja entrada en `potencia`,
así que al arrancarla parecía un bloque cualquiera y la lámpara del otro lado del muro se quedaba
encendida. El filtro que importa sigue en pie — **solo se encola lo que tiene `cfg`**, así que la
ráfaga del TNT deja la cola vacía igual que antes; lo que sube son lecturas de array (7 → 43), y 600
escrituras siguen midiendo <1 ms.

Válvula de escape: **`game.redstone.aislante('hab:cristal')`** (y `(clave, false)` para quitarlo,
`aislante()` para listarlos). Vive en su propia tabla y **no** en `define()` a propósito: un aislante
no es una pieza de circuito y no debe entrar en la cola ni gastar una entrada de `potencia`.

Para depurar, `game.redstone.info(x,y,z)` añade `vecinos[i].bloque = {fuerte, debil}` en los vecinos
que son bloques macizos — sin eso, «le llega corriente y no enciende» se mira a ciegas justo en el
caso nuevo.

Test: **`node test_redstone_bloques.js`** (transporte, fuerte/débil, un solo salto, `aislante()`, el
despertar a 2 celdas y el coste de la ráfaga). Medido además contra los nueve circuitos reales con
`node redstone/montar_ejemplos.js`.

### El bloque de redstone (la fuente permanente) — y los dos rojos que no son lo mismo

`asset:assets/bloque_redstone.vox.json`, declarado con **`{ emite: 15 }` y nada más**. Es la pieza más
corta de la tabla y cada cosa que le falta es deliberada:

- **sin `encendida`/`apagada`** → no tiene dos estados, así que `aplicar()` no le cambia el material
  nunca y no hay nada que persistir. Una fuente que no se apaga es literalmente eso.
- **sin `manual`** → no se conmuta con clic; no es una entrada del circuito, es un cimiento.
- **sin `mira` ni `soloAlFrente`** → reparte 15 por sus **seis** caras. Es el opuesto exacto del
  repetidor, y es lo que lo hace útil: pegas cable a cualquier lado y arrancas a 15.

⚠️ **Un repetidor ENCIMA de un bloque de redstone no se enciende, y no es un fallo.** Un repetidor
solo escucha por su espalda (`mira`), y `FRENTE = [0,4,1,5]` es **horizontal**: el `−Y` no entra ahí
jamás. En Minecraft pasa lo mismo — el bloque de debajo de un repetidor es *solo soporte*, la entrada
se lee del bloque de **detrás**. Abrir el `−Y` rompería la asimetría que impide que un repetidor se
realimente por su propia salida, que es lo que costó el BUG-RS2. `info(x,y,z)` ya lo explica solo:
devuelve `escuchaPor: '−X'` y una `pista` del tipo *«tiene señal por −Y, pero esta pieza solo escucha
por −X»*.

⚠️ **No confundir con `asset:assets/red_concrete.vox.json`**, que es **decoración y no emite nada**.
Hasta 2026-08-06 sí emitía: `redstone/redstone-arranque.js` lo traía en su tabla `DEFECTOS` con
`{ power: 15 }`, o sea que **cualquier pared roja de cualquier mapa era una fuente permanente** y no
había forma de mirar un circuito y saber de dónde salía la señal. Se quitó de `DEFECTOS`. Si hoy un
hormigón rojo enciende algo es porque alguien le ha pegado un cable y está **haciendo de puente**,
como cualquier otro bloque macizo desde r1.2 — y por eso **no** se declara aislante: el puente es el
comportamiento general de los bloques, no algo suyo. Para distinguirlos de un vistazo el bloque de
redstone va **moteado** y el hormigón es **liso** — se generan los dos con `node assets/make_blocks.js`.

Test: **`node test_redstone_bloque_fuente.js`** (las seis caras, que no tiene estado, detrás sí /
debajo no, y que el `red_concrete` no emite pero sigue haciendo de puente).

### El vocabulario de `define()` (r1.1) — y por qué es Turing-completo

`define()` es un **intérprete de reglas**, no una lista de piezas: cada pieza del mundo es una
combinación de estas propiedades, y añadir una no abre el motor.

| propiedad | qué hace | la usa |
|---|---|---|
| `emite: 0..15` | es una fuente mientras esté encendida | palanca, placa, antorcha, repetidor |
| `conduce: {perdida}` | es cable: se queda con el **máximo** de sus vecinas menos la pérdida | cable |
| `encendida` / `apagada` | el par de materiales; **el estado ES la clave de la rejilla**, no hay nada que persistir | todas |
| `invertida` + `umbral` | enciende con señal **por debajo** del umbral ⇒ NOT | antorcha |
| `retardo: 0..64` | el cambio espera N pasadas ⇒ **TIEMPO** | repetidor |
| `manual` | la celda es una **ENTRADA**: la pone el jugador con `conmutar()`, no la señal | palanca, placa |
| `pulso: ms` | se suelta sola pasados N ms | placa, botón |
| `mira` | escucha **solo por su espalda**, y no emite por ahí; el lado sale del giro de la clave (`FRENTE[rot]`) | antorcha |

**`mira` no es cosmético: es lo que hace posible la MEMORIA.** Sin él una antorcha leería el mismo
cable que ella alimenta, se realimentaría a sí misma y un anillo de inversores sería un oscilador en
vez de un biestable. Como el lado sale del **giro**, no hay tabla que mantener — y por eso `aplicar()`
**arrastra el giro** al encender (`'hab:antorcha@3'` → `'hab:antorcha-on@3'`): si no, la pieza se
enderezaría sola al encenderse y dejaría de escuchar por donde escuchaba. Por lo mismo `encendidaEn()`
compara por **base** (`claveBase`), no por clave exacta.

**El flanco de bajada del cable tiene DOS mitades, y la segunda se llama REPESCA.** Un cable se queda
con el máximo de sus vecinas menos la pérdida, así que al quitar la fuente cada celda ve a su vecina
con el valor viejo, calcula uno menos y **se alimenta a sí misma**. La primera mitad es no fiarse de
una bajada: `nivel < antes` ⇒ la celda cae a **0** y avisa, y el tendido se desploma entero hasta que
una fuente de verdad lo rellena. Eso funciona cuando la fuente se ha ido *de verdad*, y falla justo
cuando no: si el desplome lo provoca un botón que se suelta en un tendido que **otra** fuente sigue
alimentando, la celda cae a 0 y ya **nadie la vuelve a mirar** — las vecinas avisan cuando *cambian*,
y la vecina que sigue teniendo el valor bueno no cambia. Quedaba un cable con `recibe=0` y su propio
recálculo diciendo `llega=12`, para siempre. Por eso el cable que se tira a 0 **teniendo señal real**
se anota en `repesca` y se vuelve a encolar **cuando la cola se vacía**: para entonces el desplome ha
terminado y las vecinas presentan su valor definitivo. Se veía en el biestable del ejemplo 6: al
soltar el botón de RESET el anillo entero se moría y el bit se le olvidaba.

**¿Turing-completo?** Sí, con la misma letra pequeña que Minecraft, y hacen falta tres cosas que están:
(1) **juego de puertas completo** — `invertida` da el NOT y el cable da el OR, luego NOR, y NOR sola
genera cualquier booleana (no hay que añadir AND/XOR: se construyen); (2) **tiempo** — sin `retardo`
todo se estabiliza dentro de la misma pasada y una realimentación es un bucle combinacional que el
guardia de oscilación corta, con `retardo` es un **reloj**; (3) **memoria** — dos inversores cruzados =
biestable. La letra pequeña: la cinta son `mc.dim.x·y·z` celdas, o sea **finita** — autómata
linealmente acotado, la misma salvedad que se le pone a Minecraft, a una FPGA o a cualquier ordenador
real. El bloque de cabecera de `redstone.js` lo explica entero.

### Las piezas (`redstone-piezas.js`) — cero líneas de `app.js`

Cable, palanca, placa de presión, puerta y repetidor. Las tres mitades de una pieza salen de sitios
que ya existían:

- **circuito** → `game.redstone.define(...)`, todas con `precargar:false`.
- **física** → `game.bloques.define(k, { atravesable:true })` y `alPisar` (v1.29) para que la placa se
  hunda al pisarla.
- **gesto** → un envoltorio de `mcUseRight` **dentro del snippet**. `conmutar()` devuelve `false` sin
  protestar cuando la celda no es manual, así que el clic derecho **no se pierde nunca**: si no había
  palanca debajo, se pone bloque como siempre.

`encender(x,y,z,on)` sí protesta (una vez) si la celda no es `manual` — porque ahí sí es un error de
quien escribe el circuito.

**El enganche es un envoltorio de `mcSetBlock`**, que es el embudo de poner, romper, pintar,
deshacer/rehacer, `setVoxel` y la carga diferida de una textura. Lo que **no** pasa por ahí es generar
o cargar el mundo entero (escriben `mc.grid` directo) — y ahí no queremos notificaciones: 10⁷ celdas se
revisan al final, no una a una. Dos detalles que no se ven en el diff:

- Reejecutar el snippet **desenvuelve** el envoltorio anterior por `_orig` en vez de apilar otro; si no,
  cada recarga multiplicaría el trabajo por escritura.
- Salida rápida por `hayCircuito`: sin materiales declarados el envoltorio es una llamada de más y nada
  más (una ráfaga de TNT de 1000 bloques no puede pagar un `Map.set` por vecino). La bandera se declara
  **arriba, con el resto del estado**: declarada después del envoltorio que la lee funcionaba solo por
  el izado de `var` (valía `undefined`).

Un drenado entero re-malla **una sola vez**, con la caja envolvente de todas las celdas que cambiaron —
`mcRemeshAround` acepta dos esquinas desde el arreglo de BUG-TNT1. Un circuito cuesta su caja, no una
pasada por lámpara.

### Se carga solo, y por eso tiene que costar cero

`node redstone/make_snippets.js` publica los tres snippets **y parchea `mundo-autoarranque`** entre dos
marcadores (`// ==REDSTONE-ARRANQUE==`), que es lo que lo hace re-ejecutable sin acumular copias. Ese
snippet es del dueño y lo edita en vivo: **se inserta el bloque, no se reescribe el fichero**. El
`fetch` del bloque **no se espera** a propósito — no puede retrasar la entrada al Mundo.

La consecuencia es que esto corre **en todos los mapas**, así que las tres cosas que costaban poco
pasaron a tener que costar **nada**:

- **`precargar:false`** en los circuitos de serie. Dar de alta un material que ese mundo no usa cuesta
  un `mcMeshAll` **por carga y a cambio de nada**. Sin precarga el coste es cero: si el material no
  está en la paleta, ninguna celda puede tener su id, así que el circuito no existe. Si aparece más
  tarde (el dueño lo coge de la galería), `cargarYReintentar()` carga lo que falte **la primera vez que
  haya que encender algo**, una sola vez y avisando por `toast`.
  ⚠️ Ese reintento va **forzado**: `drenar()` apunta la potencia *antes* de llamar a `aplicar()`, así
  que al volver la celda ya tiene su nivel y `nivel === antes` la descartaría — la señal habría llegado
  y el bloque no habría cambiado nunca.
- **`encolarVecinos` filtra antes de encolar.** Solo entran celdas que son circuito (o que lo eran y
  hay que limpiarles la señal). Sin el filtro, una explosión de 1000 bloques serían 7000 `Map.set` y un
  drenado de 7000 celdas **para no hacer nada**; con él son 7 lecturas de array por bloque y la cola se
  queda vacía. Es semánticamente idéntico: `drenar()` ya descartaba las celdas sin cfg.
- **`repasarMundo()`** en el arranque, porque un mapa puede traer el circuito ya montado en disco y
  `potencia` nace vacía — una lámpara guardada encendida cuya fuente ya no está se quedaría encendida
  para siempre. Barrer `mc.grid` cuesta ~60 ms en 512×40×512 y **no se puede pagar en cada carga**: la
  guarda es que si ningún material del circuito está en la paleta no hay nada que buscar y se sale sin
  tocar la rejilla (un bucle sobre la paleta, ~50 iteraciones). El repaso arranca con `forzar` por el
  mismo motivo que el reintento.

Test: `node test_redstone_arranque.js` (20 ok). Mide **deltas**, no valores absolutos, y usa materiales
**ajenos elegidos en caliente**: `/map/test` ya tiene el circuito del dueño montado de verdad, así que
afirmar «la paleta no tiene la antorcha» ahí no probaría nada.

Test: `node test_redstone_antorcha.js` (20 ok) — inyecta `redstone/redstone.js` **desde el fichero
fuente**, no desde el snippet publicado, para que falle cuando se rompa el motor y no cuando alguien
olvide re-publicarlo. Cubre los dos sentidos (encender **y** apagar, dos veces seguidas), que la
diagonal no cuente, que `quitar()` desmonte, y que sin circuito 200 escrituras no encolen nada.

Test: `node test_redstone_dsl.js` (29 ok) — el del **vocabulario**, también desde el fuente. Prueba lo
que de verdad hay que demostrar: cable con pérdida y flanco de bajada, que una `manual` no se la lleve
el drenado, NOR completo, que `retardo` convierta la realimentación en un **reloj** (y que sin él el
guardia de oscilación la corte rápido en vez de colgar), `pulso`, y el **biestable**. El biestable se
prueba con SET desde el principio y midiendo lo único que importa —que al **retirar** la fuente se
quede donde lo dejaron, y que RESET lo deje en el otro estado—: arrancar el anillo en seco es su punto
metaestable y con el mismo `retardo` los dos inversores bascularían al unísono. Un biestable real
tampoco elige solo al darle corriente.

### El mapa de ejemplos (`/map/redstone`)

`node redstone/montar_ejemplos.js` **construye, acciona y comprueba** las nueve parcelas de
`redstone/redstone-ejemplos.js`, y luego guarda. No es un test aparte: es el propio montador el que
verifica, porque **un circuito mal orientado se ve igual de bonito y no hace nada**. Reglas que se
pagaron caras:

- **Los lazos realimentados (5 reloj, 6 memoria, 8 XOR) necesitan un repetidor de VUELTA.** El cable
  pierde 1 por bloque y muere a los 15; un lazo que le da la vuelta a una parcela de 26×16 mide más
  que eso, así que **no cierra**: la señal llega a cero antes de volver. El reloj no oscilaba y el
  biestable no se acordaba.
- **Un reloj se mide contando CAMBIOS, no estados distintos.** `new Set(muestras).size > 1` lo cumple
  también un circuito que cambia **una** vez y se queda quieto — que es exactamente lo que pasaba:
  se estaba midiendo el pulso de soltar el freno. La prueba pasaba y el reloj no existía.
- **Las piezas giradas son otra entrada de paleta** (`hab:repetidor@2`), no la misma con un atributo:
  si no se precargan en `CLAVES`, salen roca.
- **Las parcelas no se mudan de sitio.** Las notas de los carteles van indexadas por coordenada, así
  que mover una parcela deja su nota vieja colgada en la bandeja del dueño para siempre. Las calles
  nuevas se abren **delante** (z menor); `FILAS = [30, 52, 72]`.
- **Ningún cable flota en el aire.** El motor lo permite (dos celdas separadas por un hueco no se
  tocan, así que un «puente» por arriba resuelve un cruce en dos líneas), pero es justo lo que en
  Minecraft no se ve nunca y el dueño lo cazó a la primera. Los cruces se rodean **por el suelo**
  aunque salga más largo que 15 y haya que pagar un repetidor de vuelta (ejemplo 8), y un cable que
  sube va **pegado a una pared** que lo sujete (ejemplo 9).
- **La puerta son dos celdas pero UNA puerta:** `hab:puerta` lleva `conduce: {perdida: 1}`, así que
  se alimenta la hoja de abajo y la señal sube sola. Antes hacía falta un cable para cada hoja, y el
  de la de arriba salía flotando a media altura. ⚠️ **La pérdida tiene que ser 1**: con `perdida: 0`
  las dos hojas se sostienen la una a la otra —sin gradiente ninguna baja nunca— y la puerta **no se
  cierra** al soltar la placa. Lo cazó «se cierra sola al soltarse la placa» en el montador.

## 🔠 La fuente del juego (`--font-game`) es solo del Mundo

Los textos que se leen **jugando** van en **Pixeloid Sans** (`assets/fonts/`, licencia SIL OFL en
`Pixeloid-OFL.txt`): el visor de notas, el panel de la nota, los toast del modo Mundo, el
fps/vox flotante, las teclas de la barra rápida y el rótulo de un cartel. **La UI del editor sigue con
la del sistema**, que es la que aguanta formularios densos — la de pixel art es muy ancha.

⚠️ **Solo los múltiplos de 9 salen nítidos.** Pixeloid tiene 1836 unidades por em y su píxel de
diseño mide 204, o sea `font-size/9`; a 13px o a 10px las letras caen entre rejilla y empastan. Por
eso *todos* los cuerpos de `--font-game` son `9px` y la jerarquía se hace con peso y color, no con el
tamaño (el escalón siguiente, 18px, es el doble). Lo mismo obliga a `MC_NOTE_TEXT_MIN=9` en `app.js`
y a que la búsqueda de tamaño de `mcNoteTexture` baje **de 9 en 9**.

⚠️ **Y obliga a que el lienzo del rótulo NO tenga un tamaño fijo: se elige por texto.** Con el escalón
atado a 9 y el lienzo fijo, el cuerpo se redondea siempre hacia abajo, y eso se paga entero en tamaño
de letra: en la tabla del cartel (2,14:1) el cuerpo que llena la caja es 25,2 px sobre un lienzo de
256, pero solo valen 9/18/27… así que se horneaba a **18 → un 29 % más pequeño de lo que cabía**.
`mcNoteTexture` lo resuelve al revés, en dos pasos:

1. **Mide la razón**, no el cuerpo. El ajuste es invariante de escala, así que busca por bisección —a
   `MC_NOTE_TEXT_REF=1024`, donde no se dibuja nada: `measureText` no depende del lienzo— la razón
   continua `cuerpo/alto-de-lienzo` con la que el texto llena la caja.
2. **Estira el lienzo para que un múltiplo de 9 caiga justo en esa razón**: coge el mayor múltiplo de
   9 que quepa bajo los topes (`MC_NOTE_TEXT_H=384` de alto, `MC_NOTE_TEXT_WMAX` de ancho, el ancho
   sale del aspecto de la tabla) y pone el alto en `cuerpo/razón`. Re-comprueba en la caja definitiva
   y baja de 9 en 9 si el redondeo a entero de márgenes e interlineado se lo come.

Medido en la tabla real: una nota de 271 caracteres pasa de ocupar 0,070 del alto a **0,096 (+36 %)**;
los mensajes cortos ya estaban cerca del óptimo y suben un 1-2 %. El tope de alto es 384 y no 256
porque a más lienzo, más múltiplos de 9 donde elegir y más píxeles de lienzo por píxel de diseño (4 en
vez de 2), que es lo que se ve al acercarse. La clave de la caché es `texto|aspecto` **y no
`texto|alto`**, justamente porque el alto ya es una consecuencia del texto.

Vino a sustituir a Press Start 2P por petición del dueño («parece más compacta») y lo es de verdad:
es **proporcional** — la `A` gasta 0.67 em y la `i` 0.22 — frente al **1.0 em de TODO carácter** en
Press Start 2P. Los ficheros de Press Start 2P siguen en `assets/fonts/` sin referenciar.

⚠️ Cuatro trampas al tocarlo en `style.css`: (1) el bloque que aplica `--font-game` tiene que ir
**DESPUÉS** de las reglas de `.mc-note*`, o gana la que se declaró luego; (2) `.mc-note textarea`
usa la taquigrafía `font:`, que **también reinicia la familia**; (3) el `:root` lleva
`font-synthesis:none`, así que la negrita **no existe** si falta la cara `@font-face` de peso 700; y
(4) el mismo nombre lo pide `app.js` como `MC_GAME_FONT` para hornear el rótulo de los carteles: si
cambia aquí, cambia allí.

## 📝 Una nota se ve como un CARTEL de verdad

Petición del dueño: «reemplaza la forma que sale para las notas/posits por el asset "cartel" que he
creado». Cada nota de `mc.notes` planta **`assets/cartel.vox.json`** (poste + tabla, 2×2 celdas de
1/16 de canto) **encima** de su bloque, en vez del post-it amarillo que se dibujaba a mano; y el
cartel responde a la **tecla `N`** igual que el bloque anotado (ver / editar / borrar).

**Los carteles NO son datos del mundo: se DERIVAN de `mc.notes`.** Van marcados `efimera`, así que
`mcStructuresDoc` no los guarda y `mundo.json` sigue llevando **solo notas** — no hay dos fuentes de
verdad ni forma de que un cartel se quede huérfano en el fichero. Se sincronizan solos
(`mcSyncNoteSigns`), o sea que **quien escriba en `mc.notes` planta su cartel sin enterarse**: el
panel de la `N`, un snippet o un agente que va dejando notas.

- **Apuntar al cartel NO es apuntar a la nota**, y ése es el nudo: el cartel ocupa 2×2 celdas
  **encima** del bloque anotado. `mcNoteAnchor(celda)` es la vuelta —la celda misma si está anotada,
  o el bloque del cartel que la contiene— y es lo que hace que la `N` abra **esa** nota en vez de una
  nueva en el aire, y que el visor de texto se encienda mirando el cartel, que es justo lo que uno
  mira. Lo usan `mcOpenNote` y `mcUpdateNoteView`.
- ⚠️ **El rayo hay que pedirlo con `mcRaycast(alcance, true)`**: sin `hitStruct` una estructura fina
  no cuenta y el rayo **atraviesa el cartel**, así que la `N` anotaba la pared del fondo.
- ⚠️ **El cartel es `atravesable`** (clave en su `.vox.json`). Si cortara el paso, anotar el bloque
  que pisas te dejaría encerrado y un agente que va dejando notas se levantaría un muro a su espalda.
  Sigue siendo apuntable, rompible y visible en rayos-X — es exactamente para lo que está el par
  `bits`/`bitsAim` (ver más arriba).
- **Se plantan por tandas** (`MC_NOTE_SIGN_LOTE`, 8 por repaso) y con tope (`MC_NOTE_SIGN_MAX`, 64):
  cada cartel es una malla y **un draw call**, y estampar veinte de golpe congelaría el cuadro. Lo que
  se pase del tope se queda con el **post-it de siempre**, que sigue dibujándose para las notas **sin**
  cartel (`conCartel` en el overlay).
- **Las sincronizaciones se ENCOLAN, no se descartan** (`mcNoteSignQ`). Estampar es asíncrono; con una
  bandera de «ocupado» una nota escrita mientras se planta otra se quedaba sin cartel hasta el
  siguiente repaso, y un `await mcSyncNoteSigns()` volvía sin haber hecho nada — que fue justo lo que
  hizo fallar el interruptor en el test.
- El bucle paga un chequeo **barato** cada 500 ms (`mcNoteSignsDesfasados`, que recorre estructuras y
  no notas) y solo entonces sincroniza de verdad.
- Interruptor: **`game.noteSigns = false`** retira los carteles y devuelve el post-it (persistido en
  `vf_mcNoteSigns`).

En **`/map/redstone`** las diez notas ya montadas son carteles: `redstone-ejemplos.js` cuelga la nota
de la **losa del suelo** y el Mundo planta el cartel encima, así que ya no se levanta un poste de
tablones a mano. ⚠️ Al mover una nota hay que **borrar la vieja** (`delete mc.notes[…]`): una nota
sobrevive a que le quiten el bloque y se quedaría flotando —con su cartel— en la bandeja del dueño.

Test: `node test_notas_cartel.js` (en `/map/test`, sin persistir nada) — que la nota planta el cartel
y que va `efimera` y fuera de `mcStructuresDoc`, que las 4 celdas del cartel resuelven a la nota y el
aire de al lado no, que no corta el paso, que la `N` abre **esa** nota con su texto y su «Borrar», el
interruptor en los dos sentidos, y que borrar la nota se lleva el cartel sin dejar la estructura
suelta. `node redstone/montar_ejemplos.js` comprueba además que las 10 notas del mapa plantan sus 10
carteles y que **ninguno** entra en el documento.

### El texto de la nota, escrito en la tabla

Segunda petición: «me gustaría ver el contenido de la nota sobre el cartel cuando sea posible, de muy
lejos no haría falta». El texto se **hornea en una textura** y se pega como **calcomanía** sobre la
cara de la tabla que da al ojo (`mcDrawNoteTexts`, una pasada propia justo antes de `mcDrawPreview`,
con `depthMask` apagado: un muro por delante lo tapa, pero el rótulo no escribe profundidad).

- **La tabla no se declara en ninguna parte: se DERIVA de la pieza estampada** (`mcNoteBoardRect`,
  cacheada en la instancia por `key|rot|origen`). Lee el bitset fino de la malla —**`bitsAim`**, la
  ocupación real, porque el cartel es `atravesable` y su `bits` de colisión son ceros— que ya viene en
  orientación de mundo, o sea que **el giro no hay que aplicarlo otra vez**. De ahí saca el eje normal
  (el horizontal delgado, ≤ 4 voxels finos), y llama tabla a las filas **anchas de arriba**, hasta la
  primera que baja del 70 % del ancho máximo: el poste. Si los dos ejes horizontales son gruesos, eso
  no es un cartel y **no se rotula** — y si alguien redibuja `cartel.vox.json`, el rótulo se
  re-encuadra solo.
- **Fuente del juego**: `MC_GAME_FONT` = `--font-game` de `style.css` (Pixeloid Sans, en
  `assets/fonts/`). ⚠️ Es un `@font-face`: hornear antes de que llegue dejaría la de reserva **pegada
  en la textura** hasta recargar, así que se espera a `document.fonts.load` y **se tira la caché**
  cuando está lista. Las dos constantes tienen que decir lo mismo.
- El tamaño de letra **lo fija la caja**, no un número mágico: un texto corto se lee de lejos y uno
  largo encoge, como un cartel de verdad (bisección + lienzo a medida, ver arriba). Lo que no cabe ni
  a la mínima se recorta con `…` — Pixeloid **sí** trae el U+2026, que gasta un carácter en vez de
  tres en un cartel ya justo; con Press Start 2P no lo traía y había que usar `...`.
- **El rótulo releva al visor de debajo de la mira** (`mc._noteTextDrawn` → `mcUpdateNoteView`), pero
  solo si se lee **entero y a tamaño legible**: se mide en **píxeles de pantalla por letra**
  (`MC_NOTE_TEXT_LEGIBLE`), no en «¿cupo?». Una parrafada cabe encogida hasta ser un borrón, y ahí el
  visor es lo único que salva — pasa con las notas largas de `/map/redstone`.
- Caché LRU de texturas (`MC_NOTE_TEXT_CACHE`, 24) por `texto|aspecto`, con `deleteTexture` al desalojar
  y al cerrar el Mundo.
- Tunables: **`game.noteText`** (apaga el rótulo; el cartel queda en blanco y se lee apuntando) y
  **`game.noteTextDist`** (14 bloques, escala con `game.playerScale`; el último cuarto se desvanece y
  más allá no se dibuja — «de muy lejos no haría falta»). Persistidos y en `game.dumpVars()`.

### El panel DOM de la nota (≠ el cartel 3D)

Lo de arriba es el **cartel del mundo**. El diálogo de la tecla `N` (`#mc-note`) y el visor que sale
al apuntar (`#mc-noteview`) son **DOM**, y su tamaño sale de dos variables CSS con fallback en la
propia regla, `--note-fs` (18px) y `--note-w` (720px). El alto del `textarea` **no es un número
suelto**: es `min(calc(var(--note-fs) * 18), 46vh)`, o sea 10 líneas del cuerpo actual, así que subir
la letra agranda la caja sola.

- **`game.noteFont`** ⚠️ **redondea a múltiplo de 9** y topa en 9..45. El píxel de diseño de Pixeloid
  es `font-size/9`: un 20 saldría borroso y nadie lo ataría a haber tocado esto. Escalones reales:
  9 · 18 · 27 · 36 · 45. El 9 era el valor de antes de REQ-CART2 y es el que resultó ilegible.
- **`game.noteWidth`** (240..1600) mueve el ancho del diálogo y, con él, el `max-width` del visor
  (60 %). Los dos persisten y salen en `game.dumpVars()`.

Las notas son **la excepción** a la regla de «todo a 9px» del bloque `--font-game` de `style.css`, y
está escrito allí: las notas de los agentes son volcados largos que hay que leer enteros.
La media query de 680px **ya no toca el cuerpo** — el móvil dejó de ser un caso especial cuando 18
pasó a ser el valor general. Guardián: `node test_notas_panel.js`.

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
- Al ampliar el MVP (p. ej. hacer reales las pestañas Habitaciones/Mapa), mantener el mismo
  `state.voxels`/serialización como fuente de verdad y añadir vistas nuevas sin duplicar el modelo.
