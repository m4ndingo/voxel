# El editor de voxels (`index.html` · `app.js` · `style.css`)

<!-- Detalle de VoxelForge. NO se carga en cada turno: lo carga el agente a demanda
     desde el índice de ../CLAUDE.md. Contenido movido VERBATIM, sin reescribir. -->

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
   sobre un voxel aplica la herramienta. **Botón «Frontal»** (`toggleCamFront`): ortogonal de frente,
   `pitch=0` y `yaw=`**`MC_FRONTAL_YAW`**` = π` — **π y no 0**. Con `yaw=0` la profundidad de `+Y` sale
   positiva (`+Y` se aleja) ⇒ la cámara queda en `−Y`, asomada por el **borde de arriba** del plano de
   Capas, y desde ahí izquierda y derecha se cambian: es el «los dibujos salen espejados» que cazó el
   dueño (2026-08-25). Con π la cámara se pone en `+Y`, que además es **donde estará el jugador** en el
   mapa (`editor-Y` = profundidad → `mundo-Z`, y un jugador con yaw 0 mira hacia `−Z`). ⛔ El `-x1` de
   `project3d` («espejo horizontal…») **NO** tiene que ver, por más que lo parezca: con la cámara libre
   compensa exacto y el 2D, la miniatura iso y la 3D libre ya coincidían — quitarlo rompe esas tres para
   arreglar una. Guardián `tests/test_espejo_2d3d.js` (compara las 4 vistas con la misma marca). Cursores contextuales (`update3dCursor`+`CURSORS`):
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
añádelo a `index.json` (`{id,name,role,type,icon,file}` + `alias`/`description` opcionales). Ejemplo reproducible: `node herramientas/make_alis.js`
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
- ⛔ …y «su fichero» significa **su RUTA dentro de `assets/`**, no el nombre: el id de un asset en
  subcarpeta es `trees_mock/pino`, con la carpeta dentro. Hasta el 2026-08-27 el catálogo lo sacaba del
  nombre del fichero y tiraba la carpeta, así que `trees_mock/pino` y `pino` eran el **mismo** asset para
  todo el servidor. Lo cazó el dueño usando el editor: abrir el pino del mock, guardar → creaba
  `assets/pino.vox.json`; borrar «el antiguo» → borraba el recién guardado. **Dos síntomas, una causa.**
  Y no sobraban ficheros: conviven `trees_mock/cerezo` («Cerezo», 2165 vox) y `cerezo` («Gran Cerezo
  Imperial», 34102 vox), dos dibujos distintos que el id viejo aplastaba en uno. Los **mocks son assets
  como los demás**; lo que los distingue es dónde están.
- ⛔ Si el id admite `/`, admite `..`, y por el id pasan un POST que **escribe** y un DELETE que
  **borra**. `_asset_path` es el único sitio que decide la ruta y devuelve **`None`** si se sale de
  `assets/`; sus cuatro llamantes tienen que tratarlo. Son **dos** comprobaciones y hacen falta las dos:
  `realpath` (única que aguanta `..` a media ruta y enlaces simbólicos) y «ningún tramo empieza por
  punto» (el POST *limpia* el id borrando lo que no le vale, y `..%2f..%2fPLAN` se quedaba en
  `..2f..2fPLAN`, que no se escapa pero se colaba en la galería y en el índice).
- El id lleva la carpeta; el **rótulo no** — nadie quiere leer «Trees_Mock/Pino». Guardián:
  `tests/test_assets_subcarpeta.js` (36 comprobaciones, servidor vivo).
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
- ⚠️ **El MISMO dibujo entra por dos puertas, y exportar/importar cambia justo cuál.** Una pieza de la
  galería es `hab:<n>` y empotrada en el repo es `asset:assets/<n>.vox.json`; al exportar de una
  instancia e importar en otra pasa de la primera a la segunda. Por eso **ninguna tabla del motor puede
  llevar claves `hab:` escritas a mano**: la pieza importada no aparece en ella y deja de comportarse
  (fue BUG-RS23 en redstone y BUG-FLUID3 en los fluidos, donde el agua importada fluía con la cara de
  **roca** porque sus niveles copiaban la paleta de un `hab:agua` que aquí no existe). Los dos
  ayudantes del motor son **`mcNombreMat(clave)`** → nombre pelado (sin espacio de nombres, sin `@giro`
  y sin `-nivel` de fluido: `asset:assets/agua.vox.json-3` → `agua`) y **`mcClaveDeNombre(nombre)`** →
  la clave que le toca a ese nombre **en este mundo**: primero lo que ya está en la paleta (da igual
  por dónde entrara), luego el índice de assets, y de última `hab:<n>`. La regla es que el espacio de
  nombres **se arrastra** de lo que hay puesto, nunca se elige a mano — así el nivel de un agua de
  `assets/` sale de `assets/`, y el de una de la galería, de la galería. Ojo con el orden en
  `mcMatKey`: la rama de fluidos va **antes** que el índice de assets, así que una clave a pelo ahí lo
  tapa entero. Lo cubren `test_fluido_importado.js` y `test_piezas_importadas.js`.
Las 3 **habitaciones** (Taberna/Herrería/Mazmorra) están **a escala de personaje**: `herramientas/make_rooms.js`
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
Los dos botones de la esquina del Mundo (🧩 Código y ✕ Cerrar) y su interruptor
`game.showOSDbuttons` **ya no existen** (quitados 2026-08-13, REQ-OSD1): se llega a lo mismo con `Esc`
y `Alt+C`, y estorbaban en todas las capturas. La salida de **táctil** es `#mc-tsalir`, una línea del
menú ☰ dentro de `#mc-touch` ([`movil-y-tactil.md`](movil-y-tactil.md); hasta REQ-MOV1 era un ✕
suelto) — allí no hay `Esc`, así que el Mundo no puede quedarse sin puerta, y vivir
dentro de la capa de mandos hace que se encienda y se apague con ellos (`mcTouchShow`), sin un segundo
sitio que mantener en sincronía. `game.nearClip` (nº) y `game.nearClip = 8` regulan el umbral de zoom del recorte de cercanía (ver arriba). `project3d` hace **culling por visor** (descarta voxels con el centro fuera del
lienzo; `occupied` se deja completo), por eso `game.voxels` baja al acercar el zoom. La pisabilidad usa cuerpo ~28 y **erosión** de obstáculos r=3
(huella del personaje).
Verificación visual sin navegador: `node herramientas/render_rooms.js <asset.vox.json> <out.png>` (rasteriza un iso
propio a PNG). Ya NO hay mock de Habitaciones.
