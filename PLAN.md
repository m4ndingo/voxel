# PLAN · VoxelForge → Juego RPG

Plan de construcción del modo juego sobre el editor actual. Se avanza de lo más sencillo a lo
más complejo; cada fase es demostrable por sí sola. Estados: `⬜ todo` · `🟨 wip` · `✅ done` · `⛔ blocked`.

## Base disponible (hecho antes de este plan)
- Editor voxel completo (capas + 3D libre, extrude, undo/redo, aislar, recorte de cercanía).
- Habitantes (personajes 32³) y Habitaciones (bloques 28×28×16) como assets del servidor + guardados.
- Galerías separadas por `type`; server con CRUD + papelera (`to_trash`, nada se borra de verdad).
- Motores de render reutilizables: `drawThumb`, `renderIso`, `renderFree3d`/`project3d`.

## Decisiones ponderadas (invariantes del plan)
- Mapa = **rejilla de pantallas** estilo Zelda; celda = 1 habitación. Rejilla inicial **8×8 fija**.
- Habitaciones y habitantes se colocan **por referencia (id)**, no por copia → editar el original propaga.
- **Escala**: NPCs 32³ vs paredes ~10 → al componer se hace **downsample 4×** (el original NO se toca).
- Persistencia del mapa en `data/mapa.json` con API propia y **respaldo a papelera** en cada guardado.
- ⚠️ El mapa **NUNCA** escribe en `data/habitantes/` (galería sagrada). Riesgo cero para los datos del usuario.

---

## Fases y tickets

### F7 · Interacción con NPC  —  ⬜ todo
- [ ] T7.1 Proximidad + tecla acción → bocadillo con nombre/rol (`meta`).
**Verifica**: hablo con el Cocinero y me dice quién es.

### F8+ · Futuro (no planificado en detalle)
Objetos/inventario · combate · misiones · guardado de partida · editor de puertas · mapa NxM configurable.

---

## 🎫 Tickets ABIERTOS — índice

Se acumulan aquí y el dueño va diciendo cuáles se resuelven y en qué orden, según complejidad.
Al cerrar uno: `⬜ todo` → `✅ done (fecha)` y **su fila y su sección se van a**
[`PLAN_ARCHIVO.md`](PLAN_ARCHIVO.md#-tickets-cerrados--archivo) — de este fichero se quitan.

| ticket | qué es | pinta | decisiones |
|---|---|---|---|
| [BUG-RS10](#-bug-rs10) | el pistón **no empuja estructuras** (sí bloques, sí jugador, sí agentes) | 🟡 abierto 2026-08-07 | **el caso de la captura ya no ocurre** (era [BUG-STR1](PLAN_ARCHIVO.md#-bug-str1)): el pistón empuja `mc.grid` y no mira `mc.structures`, y eso está escrito como límite conocido de la v1. Preguntar al dueño si aún le molesta antes de tocar nada |
| [REQ-GAL3](#-req-gal3) | poder **cambiar el espacio de nombres de una pieza desde la galería** (mover `asset:` ↔ `hab:`) | 🔴 abierto 2026-08-10 | idea del dueño al hilo de BUG-FLUID3. No es el arreglo de los importados (el motor ya no depende del espacio), sino la herramienta para **colocar** una pieza donde la quieres. Redactado, sin investigar |
| [BUG-SNP4](#-bug-snp4) | los cambios hechos en el **editor de código del Mundo se revierten** al volver al mapa y reabrirlo | 🔴 abierto 2026-08-11 | **Redactado, sin investigar.** Sospecha (sin comprobar): el snippet tiene **dos copias vivas** y al reabrir el editor se relee la que se cargó al abrir el Mundo, no la editada. Ojo: el dueño dice **Ctrl+C**, `CLAUDE.md` documenta **Alt+C** |
| [REQ-RS11](#-req-rs11) | las piezas de redstone viven mezcladas con los dibujos del dueño en `data/habitantes/`: **carpeta propia**, sin romper `hab:` | 🟡 abierto 2026-08-07 | ya viajan con el repo (excepciones en `.gitignore`); lo que falta es **separarlas** — el namespace tendría que servirse desde dos carpetas. **Sin investigar a fondo** |
| [REQ-DOC2](#-req-doc2) | falta un **mapa del estado interno** de `app.js` (749 KB, 11 437 líneas) | 🟡 abierto 2026-08-07 | la crítica mejor puesta de la auditoría; no es partir el fichero, es documentar qué vive en `state`, `mc` y `game`. **Sin investigar a fondo** |
| [REQ-MAP1](#-req-map1) | Alt+M = pantalla de mapas conmutable sin perder el mundo abierto | medio | — |
| [BUG-GLOW4](#-bug-glow4) | un objeto emisivo **ilumina plantado pero no en la mano** (ni montado en nada que no sea un agente) | 🔴 abierto 2026-08-19 | pedido del dueño: la luz es del **dibujo**, no del sitio. Investigado a fondo: **3 fallos encadenados**, uno en `mundo-autoarranque` y dos en `app.js`. Con los tres puestos, la Espada de Luz alumbra (luminancia del suelo 10,4 → 120) | 
| [REQ-GLOW5](#-req-glow5) | poder decir desde un snippet que un **voxel de `game.voxelesUI` emite luz** (fuego, partículas) | 🔴 abierto 2026-08-19 | mismo principio que BUG-GLOW4: se declara con el prefijo `*` del color, igual que en un dibujo. Se apoya en la luz dinámica ya existente | 
| [REQ-MOV1](#-req-mov1) | en el **móvil** el Mundo es inmanejable: sobran 📷/🎬, faltan los **3 botones del ratón**, pantalla completa, y el ✕ debe ser un **menú** | 🔴 abierto 2026-08-19 | captura y palabras del dueño en [`data/tickets/REQ-MOV1/`](data/tickets/REQ-MOV1/contexto.md). Revierte el «a propósito NO hay botones de romper/poner» que estaba escrito en `app.js`. El central **no es duda**: es el de redstone. Ojo al `pointerLockElement`: pantalla completa lo suelta |
| [REQ-ED3](#-req-ed3) | **guías de rejilla** en el editor 2D (líneas azul claro que parten la capa en 2×2, 4×4…), conmutables | 🟢 abierto 2026-08-18 | pedido por el dueño como «tool que rote entre sin grid / ÷2 / ÷4». **Investigado**: el sitio es `drawEdit` (`app.js:565`), que ya pinta una rejilla por celda. Ojo con lo de «tool»: las del panel son de DIBUJO y elegirla te dejaría sin pincel — el precedente correcto es el interruptor de Caras (`vf_caras_marcar`), estado de VISTA que no viaja en el documento |
| [BUG-CART1](#-bug-cart1) | **carteles de nota apilados dentro de `mundo.json`**: el cartel se DERIVA de la nota y no debería guardarse nunca, pero se colaban y al cargar ya nadie los reconoce | 🟡 arreglado 2026-08-20, **falta una pasada del dueño** | encontrado tirando de un guardián en rojo, no pedido. La causa (la marca `efimera` se ponía DESPUÉS del `await` de estampar) está arreglada y el motor se cura solo en caliente. Queda lo que ya está escrito en los ficheros: `python3 herramientas/carteles_fantasma.py` (en seco) y luego `--escribe`. **No lo puedo lanzar yo**: la caja de arena me deniega escribir en `data/worlds/` |
| [REQ-MULTI1](#-req-multi1) | **multijugador colaborativo**: varios jugadores en el mismo mapa, viéndose entre sí (con el arma en la mano y su etiqueta de nombre) y con los cambios del mundo sincronizados | 🟢 abierto 2026-08-19 | pedido por el dueño el 2026-08-19 al hilo de «pisar el mundo»: si el mapa es de todos, **nadie pisa a nadie**. Es el ticket más grande del plan. **Acotado ya por él (2026-08-19)**: tope **10** jugadores de momento (idealmente sin tope), **internet y red local**, y se **juega Y se construye** a la vez. A favor: medio camino hecho sin querer — `POST /api/mundo/edits` ya manda **el delta**, no el mundo. En contra: hoy no hay proceso servidor con estado (stdlib, un `Handler` por petición), ni identidad, ni cuerpo de jugador dibujable. Construir a la vez obliga a que **el servidor sea el árbitro**, no el navegador |
| [REQ-SPAWN1](#-req-spawn1) | **pensar el tema de los puntos de aparición** (spawn) | 🟢 **propuesta escrita 2026-08-20**, esperando su visto bueno | nota del dueño en `/map/bugfinder`, tal cual: es un **encargo de pensar**, no un arreglo. Hoy hay un único `spawn` en la cabecera del mundo |
| [BUG-VID1](#-bug-vid1) | un clip de vídeo **muy corto se guarda con 0 bytes** y el servidor lo acepta tan tranquilo | 🔴 abierto 2026-08-20 | nota de `/map/bugfinder2`. **Reproducido en disco**: `data/videos/0001…mp4` y `0002…mp4` pesan 0 B, con `"duracion": 0.05` en su ficha. Dos fallos, uno cada lado: `start(100)` no llega a soltar un solo trozo en 50 ms, y el `POST /api/videos` mira que el base64 no esté vacío **antes** de quitarle el prefijo `data:` ⇒ una carga vacía se cuela | 
| [BUG-RANURA2](#-bug-ranura2) | con un recorte de `K` cargado, pulsar **1-9 repinta el recorte** en vez de elegir bloque para construir | 🔴 abierto 2026-08-20 | nota de `/map/bugfinder2`, estrena [REQ-RANURA1](PLAN_ARCHIVO.md#-req-ranura1) (commit `dcfabf7`, de anteanoche). **Localizado**: `mcPasteMaterial` (`app.js:16003`) dispara con solo `mc.pasteActive`, sin mirar qué herramienta hay en la mano. El repintado se escribió a propósito para el Ctrl+V; lo que falta es acotarlo | 
| [BUG-GLOW9](#-bug-glow9) | las **estrellas del cielo no parecen autoiluminadas** (puntitos oscuros y cúbicos) y la **niebla no las tapa** | 🔴 abierto 2026-08-20 | **dos** notas de `/map/bugfinder2` sobre lo mismo. Lo de la niebla está escrito a propósito en `mcDrawVoxUI` (`app.js:14026`: `uFogNear = far*8`, `aEmit=1`) ⇒ es una **decisión que él quiere revisar**, no un descuido. Lo de «se nota que son voxels» es otra cosa y falta medirlo. Vecino de [REQ-GLOW5](#-req-glow5) | 
| [REQ-GLOW10](#-req-glow10) | el brillo de los **emisivos debe adaptarse a la luz ambiente**: de noche brillan, de día no hace falta tanto | 🔴 abierto 2026-08-20 | nota de `/map/bugfinder2`. Pide **dos tunables**: la adaptación y el brillo máximo. Redactado, sin investigar. Se apoya en lo que salga de [BUG-GLOW8](#-bug-glow8) — conviene no tocarlo antes | 
| [BUG-SEL5](#-bug-sel5) | en selección, **Ctrl+Z revierte los bloques pero deja los corchetes** donde estaban | 🔴 abierto 2026-08-20 | nota de `/map/bugfinder2`. La caja de selección no entra en el gesto del historial. Redactado, sin investigar | 
| [BUG-SEL3](#-bug-sel3) | al **rotar una selección**, las piezas finas u orientadas no giran con ella (la puerta se sale de su marco) | 🔴 abierto 2026-08-20 | nota de `/map/bugfinder2`, con su ejemplo: marco de bloques bien, puerta no. Es el giro **local** de cada pieza, no el de la caja. Ojo: las 24 posturas van **en la clave** (`mcOriNorm`/`mcOriParts`), ⛔ nada de `(rot\|0)&15` | 
| [REQ-SEL4](#-req-sel4) | con selección, **`r` debe girar en horizontal y `R` en profundidad** (4×4 posturas) | 🔴 abierto 2026-08-20 | nota de `/map/bugfinder2`: «así se puede con `r` abrir una ventana de bloques, o con `R` levantar una cornisa». Hermano de [BUG-SEL3](#-bug-sel3): el mismo giro, visto desde el mando | 
| [REQ-SEL6](#-req-sel6) | **ver el pivote de la selección** sin tener que pulsar Ctrl (al pulsarlo ya cambia al apuntado) | 🔴 abierto 2026-08-20 | nota de `/map/bugfinder2`: «hay que conocerlo antes». Redactado, sin investigar | 
| [REQ-SEL2](#-req-sel2) | copiar/pegar debería llevarse el **redstone pegado a la cara** de los bloques copiados | 🔴 abierto 2026-08-20 | nota de `/map/bugfinder2`: «son difíciles de seleccionar». Toca la frontera `mc.grid` ↔ `mc.structures`, la misma que [BUG-RS10](#-bug-rs10) | 
| [REQ-TOOL9](#-req-tool9) | poder **elegir qué herramientas entran con `e` y cuáles con `E`** desde el editor (primarias / secundarias) | 🔴 abierto 2026-08-20 | nota de `/map/bugfinder2`: «cambiar el orden de las herramientas empieza a ser algo habitual». Redactado, sin investigar | 
| [REQ-CART7](#-req-cart7) | poder **elegir el tipo de cartel** de una nota desde su editor, con los carteles definidos en un sitio | 🔴 abierto 2026-08-20 | nota de `/map/bugfinder2`. Él mismo propone la puerta: categoría **«Cartel de Notas»** en la galería. Encaja con que los carteles ya **se derivan** de `mc.notes` y no viven en `mundo.json` ([BUG-CART1](#-bug-cart1)) | 
| [REQ-FX1](#-req-fx1) | **temblor de cámara al caer** desde 15 bloques o más, con altura/amplitud/duración ajustables | 🟢 abierto 2026-08-20 | nota de `/map/bugfinder2`. El sitio natural es el aterrizaje que ya detecta `mcCaidaPaso`. Redactado, sin investigar | 
| [BUG-GLOW8](#-bug-glow8) | la luz de un emisivo **en la mano** es un **círculo pintado encima**, no la luz del mundo: halo redondo donde el mundo hace rombos, se apaga entera al meter la pieza en un bloque, y no lleva el color del voxel | 🔴 abierto 2026-08-20 | el dueño, tras [BUG-GLOW6](PLAN_ARCHIVO.md#-bug-glow6): «*la iluminación debe ser real y consistente para todo el motor, no puede haber apaños o trucos para quedar bien*». **Investigado y medido**: la causa es que hay **dos modelos de luz** (BFS por el aire vs punto analítico en el shader) y el arreglo es dejar **uno**. Propuesta escrita, esperando su visto bueno |

---

## 🗄️ Tickets CERRADOS

El índice histórico y el detalle de todo lo cerrado viven **enteros** en
[`PLAN_ARCHIVO.md`](PLAN_ARCHIVO.md#-tickets-cerrados--archivo). Aquí no queda ni una fila:
este fichero es **solo lo abierto o pendiente** (orden del dueño, 2026-08-18).

Al cerrar un ticket: su fila **y** su sección se van al archivo de una vez.

---

## 🎫 Tickets ABIERTOS — detalle

Una sección por ticket vivo. Al cerrar uno, su sección se va **entera** a
[`PLAN_ARCHIVO.md`](PLAN_ARCHIVO.md), junto con su fila: aquí solo queda lo que sigue pendiente.

<a id="-bug-glow4"></a>

### 🔴 BUG-GLOW4 · Un objeto emisivo ilumina plantado, pero no en la mano — 🔴 abierto 2026-08-19

Orden del dueño (2026-08-19): **«si un objeto brilla porque tiene voxels que emiten, cuando se planta en el
terreno ilumina; lo mismo tiene que pasar cuando se lleva como herramienta en la mano»**. O sea: la luz la
declara el **DIBUJO** (color `*#rrggbb`), y viaja con el objeto — el motor no pregunta dónde está.

Hoy no pasa. `data/habitantes/espada-de-luz.json` tiene **45 voxeles emisivos** y en la mano no alumbra nada.
No es una cosa: son **tres fallos encadenados**, cada uno tapando al siguiente. Medido en `/map/test?noauto=1`
de noche (`game.luz(0.12)`), luminancia media del suelo:

| | luminancia | luz dinámica |
|---|---|---|
| hoy | 10,41 | `dynN=0` — no hay |
| solo (1) | 9,76 | `dynN=1`, pero en `(17, 45, 83)` ← a **55 bloques** del jugador |
| (1)+(2) | 11,01 | ya en `(49,4 · 15,5 · 47,9)`, correcta — pero el haz apunta a otro lado |
| (1)+(2)+(3) | **120,07** | ✅ |

1. **`mundo-autoarranque` borra la matriz de la herramienta cada frame.** `mirarObjetivos` recorre TODAS las
   estructuras y a las que no están en su tabla les hace `s.model = null` («dejo de mirar: a su pose horneada»).
   La herramienta en mano **es una estructura real** (`_isHeldTool`), así que cae ahí. Como `mcSyncHeldToolStruct`
   la repone 9 líneas después —y antes de `mcRender`— el **dibujo y la sombra salen bien** (de ahí que el dueño
   viera la espada proyectando sombra correctamente de día); el que se come el `null` es `mcDynSync`, que corre
   ANTES (`app.js:17786` vs `17795`). Ese fichero ya tiene dos guardas para lo mismo (`s._rig` para las piezas
   de esqueleto, `desplazada(s)` para `seguir`): falta la tercera.
2. **`mcDynSync` le suma `s.ox`.** La malla de la herramienta se hornea en `ox:0,0,0` (`app.js:12107`) pero
   `mcSyncHeldToolStruct` **pisa `s.ox` con `mc.pos`** (12134-12136) para el culling. `mcDynSync` hace
   `model · (s.ox + celda)` como para una estructura normal ⇒ el ancla se rota y se suma dos veces. Hace falta
   que la struct diga con qué origen se horneó su malla, en vez de suponer que es `ox`.
3. **El haz apaga en vez de atenuar, y ahí las dos luces no se parecen.** Plantada, el emisor va por
   `mcComputeBlockLight`: BFS por el aire con **coste variable (≥1) según el haz** ⇒ en contra llega más débil,
   pero **llega** (medido alrededor de la espada plantada: `15` en su celda y `11, 9, 7` alejándose). En la mano
   va por el shader, que hace `pow(cos, 1+foco*8)` y **anula** todo lo que quede fuera del cono. Mismo dibujo,
   dos leyes distintas: eso es justo lo que el ticket viene a quitar.

**Criterio de cierre**: el mismo dibujo alumbra igual plantado que en la mano, **sin mandos nuevos** y sin que
el snippet tenga que declarar nada. `game.glowFocus` sigue existiendo para quien quiera enfocar.

**Hecho 2026-08-19** (a falta del visto bueno del dueño). Los tres, en su sitio:
1. `herramientas/parche_snp_glow4.py` → guarda `if (s._isHeldTool) continue;` en `mirarObjetivos`; snippet a `v1.36`.
2. `mcDynSync` usa `s.mox/moy/moz` (el ancla con la que se horneó la malla) cuando la struct lo declara; quien no
   lo ponga se comporta exactamente igual que antes. `mcSyncHeldToolStruct` lo pone a 0.
3. `MC_DYNLIGHT_LIB`: el haz **encarece el camino** (`coste = 1 + foco*5*(1−max(cos,0))`) en vez de anularlo — la
   misma ley que el BFS estático, escrita como coste por bloque.

Verificado en `/map/test?noauto=1` de noche con `mundo-autoarranque` cargado: Espada de Luz **luminancia 108,4**
(`dynN=1`, luz en `49,42 · 15,55 · 47,86` con el jugador en `48,5 · 15 · 48,5`) contra un control de espada de
diamante sin emisivos, **9,79** y `dynN=0`. Regresión: `test_agente_luz_sigue.js` da **exactamente la misma
salida con y sin los parches** (3 fallos, todos de siembra estática `suma=0`, **preexistentes en HEAD** —
comprobado con `git stash`); sus asertos de luz dinámica (posición viva, 0 recálculos, delante/detrás del haz)
siguen en verde.

---

<a id="-req-glow5"></a>

### 🔴 REQ-GLOW5 · Un voxel de `game.voxelesUI` puede emitir luz — 🔴 abierto 2026-08-19

Dueño (2026-08-19): **«si desde un snippet digo que quiero poner un voxelui de esos, quiero poder indicar que
emite luz»**, con el caso de uso encima de la mesa: **fuego realista que ilumine el jardín** y partículas.

Hoy `game.voxelesUI` se dibuja con `aEmit=1` (`mcDrawVoxUI`): se ve a pleno color de noche —autoiluminado— pero
no está ni en `mc.grid` ni en `mc.structures`, así que **no ilumina nada**. Autoiluminado ≠ ilumina; el propio
`efectos-demo` lo dice en su cabecera.

Forma acordada, la misma que en un dibujo y que en el editor: **el prefijo `*` del color**.
`game.voxelesUI.pon(x, y, z, '*#ffaa00', grupo)` = ese voxel emite. Nada de una API aparte de luces.

Se apoya en la luz dinámica por fragmento que ya existe (`mcDynSync` + `MC_DYNLIGHT_LIB`), que es la única que
no exige re-mallar ni re-sembrar y por tanto aguanta partículas que se mueven cada frame. Dos límites que hay
que respetar y medir:
- **`MC_DYN_MAX = 8`** luces simultáneas (array fijo de uniforms). Las llamas de una hoguera son muchas: hay que
  quedarse con las más cercanas al ojo (`mcDynSync` ya ordena por distancia) y ver si 8 se queda corto.
- La luz dinámica **no tiene color propio**: hoy es siempre cálida fija (`vec3(1.15, 0.98, 0.75)`). Un fuego
  saldrá cálido, pero no rojo, hasta que se le meta el color por luz (`emitCol` ya está horneado para la luz
  de bloque, así que el dato existe).

Depende de [BUG-GLOW4](#-bug-glow4): arregla el camino que esto necesita.

**Hecho 2026-08-19** (a falta del visto bueno del dueño). Todo en `app.js`, 0 líneas en ningún snippet:
- **Por CLAVES, no por prefijo de color** (corrección del dueño el mismo día: «igual sería mejor indicar claves
  para los efectos de material, porque luego quiero poner efectos de alpha, metal, etc»).
  `game.voxelesUI.material(grupo, {emite:true, luz:6})` es la puerta —lo barato y lo normal, un sistema de
  partículas entero—; por voxel, `pon(x,y,z,{col:…, emite:true})`. El `*` de siempre (`'*#hex'`, `isGlow`) se
  sigue entendiendo. Añadir `alfa`/`metal` mañana = una clave más, **sin tocar ninguna llamada existente**.
- `mcVoxUIColor` guarda un hueco «emite» detrás del rgb, y **avisa por consola** si el color no se entiende:
  `'*' + [r,g,b]` concatena el array (`'*0.6,0.7,0.9'`), no es hex, y antes se comía el tinte y pintaba blanco
  en silencio — le pasó al dueño en las estrellas de `efectos-demo`.
- `mcVoxUILuces()` saca las luces de la capa en coordenadas de mundo, **agrupadas por celda de bloque**: 200
  voxeles de fuego pegados son 1 luz en su centroide, no 200 candidatas que se comerían las 8 plazas de
  `MC_DYN_MAX` sin alumbrar más. Cacheado con el mismo `mc.voxUISucio` que la geometría.
- `mcDynSync` las mete en la **misma cola** que las estructuras emisivas (vía dinámica, por fragmento): una
  partícula se mueve cada frame y la siembra estática es un BFS + re-mallado, igual que en BUG-GLOW3. Sin haz
  (isótropas). El array plano de candidatas pasa de 7 a 8 huecos para llevar **nivel por luz**.
- **`luz` es ALCANCE EN BLOQUES y NO topa en `MC_MAXLIGHT`** (corregido el mismo día: el dueño puso `luz: 600` a
  unas estrellas a 34 bloques y no pasaba nada, porque yo lo capaba a 15 «por analogía» con `glowLevel`). El 15
  es el tope de la siembra **estática** —BFS, textura de luz, mallas cacheadas—; la vía **dinámica** es aritmética
  por fragmento y admite el alcance que se pida.
- **La caída pasa a ser RELATIVA al alcance**: `rad = clamp(1 − d*coste/nivel, 0, 1)` en vez de una rampa fija de
  15 bloques. Con alcance 15 es **la misma cuenta** (`(15−d)/15 == 1−d/15`) ⇒ la ley del BFS que exige BUG-GLOW4
  se conserva exacta y nada de lo existente se mueve (comprobado: `delante=0.800` / `detras=0.000` idénticos, y la
  Espada de Luz sigue en **106,8** contra **10,3** del control). Segunda queja del dueño, y con razón: «en 40 veo
  mucha luz, en 30 nada, en 35 un poco, el ajuste es complejo» — con la rampa fija, una estrella a 34 bloques
  pasaba de nada (`luz:34`) a saturada (`luz:49`), todo el margen útil en una ventana de 15 y lejos del origen.
  Curva nueva sobre el suelo (apagadas 7,4): `15`→7,5 · `35`→6,9 · `40`→**18,7** · `50`→39,5 · `60`→56,0 ·
  `80`→76,1 · `120`→94,7 · `200`→108,7. Las estrellas están a **33,7 / 62,1 / 78,6** bloques del ojo (mínima,
  mediana, máxima), así que por debajo de ~34 no llega ninguna y hace falta ~78 para que lleguen todas.
- ⚠️ **Techo que queda en pie: `MC_DYN_MAX = 8`**, y se eligen las 8 más cercanas al ojo ⇒ con 240 focos
  candidatos la luz es un charco que **se recoloca al andar** (medido: tras 25 bloques, otras 8). Para un cielo
  coherente, emisoras solo unas pocas; subir `MC_DYN_MAX` cuesta bucle por fragmento y hay que medirlo en la
  máquina del dueño (el navegador de pruebas va a 1,4 fps y sus fps no miden nada).
- Mandos: `game.voxelesUI.material(grupo, {emite, luz})` (mezcla, no reemplaza; `null` borra; clave desconocida
  **avisa**), `game.voxelesUI.luz(grupo, n)` como atajo de `{luz:n}`, y `game.voxelesUI.luces = false` para apagar
  toda la luz de la capa sin borrar nada (medir fps). `game.voxelesUI.info()` añade `luces`, `materiales` y
  `focosVivos`.

Verificado en `/map/test?noauto=1` de noche, control con **los mismos cubos** con y sin la clave (el dibujo es
idéntico, así que toda diferencia es luz sobre el suelo): sin nada **8,73** · cubos sin `emite` **8,47**
(`dynN=0`, 0 focos) · `material('fuego',{emite:true})` **80,37** (`dynN=1`, 1 foco en el centroide) ·
`{luz:4}` **8,44** (no llega al ojo; el material queda `{emite:true, luz:4}`, o sea que mezcló) ·
`{emite:false}` **9,17** y `dynN=0` · por voxel (`{col, emite:true}`, sin material de grupo) **80,29**.
El tinte se conserva en todas las formas: `[r,g,b]` → `[1, 0.66, 0]`, `{col,emite}` → `[1, 0.66, 0, 1]`,
`'*#ffaa00'` → `[1, 0.667, 0, 1]`; y `'*'+[r,g,b]` sale blanco **avisando por consola**.

Y las estrellas de `efectos-demo`, que el dueño había marcado `"*"+col` y salían todas blancas
(`herramientas/parche_snp_estrellas_tinte.py`, publicado): 240 plantadas, **0 blancas puras** (34 azuladas,
20 cálidas), **0 emisoras** y `dynN=0` —no gastan plaza de las 8 luces dinámicas—, y a `game.luz(0.05)`
siguen viéndose: luminancia máxima **152,1**, 245 píxeles brillantes. Autoiluminadas, que era lo que quería.

---

<a id="-req-map1"></a>

### ⬜ REQ-MAP1 · Alt+M = pantalla de mapas conmutable, sin perder el mundo abierto — ⬜ todo
**Reportado** 2026-08-06 por el dueño: «quiero que Alt+M me muestre la pantalla de elección de mapas,
si es posible que sea conmutable, sin perder el que tengo actualmente; una segunda vez a Alt+M cierra
la pantalla para seguir donde estaba; esto desde cualquier parte de la app».

**Estado actual**
La pantalla de elección de mapas es **`/map/`** (sin nombre), una **página aparte** servida por el
servidor (`server.py:421-424`, `mundos.listar()` con estadísticas y miniatura cenital). Llegar a ella
es una **navegación completa**: se pierde el mundo abierto y volver cuesta la recarga entera de la SPA
—con los ~2 s que documenta PERF-MC3—. No hay ningún atajo de teclado para ella.

**Lo bueno: el servidor ya está hecho.** `GET /api/mundos` (`server.py:433`) devuelve el listado con
las miniaturas cacheadas en `data/_thumbs/`. Esto es **solo cliente**: un overlay que pinte ese JSON.

**Precedente exacto a copiar: Alt+C y Alt+A** (`app.js:3196-3217`), que ya resuelven «conmutable desde
cualquier parte, incluido el Mundo». De ahí salen las cautelas, que están comentadas en el propio
código y **no** hay que redescubrir:
- mirar `e.code` (tecla física) porque con Alt pulsado `e.key` llega compuesto en varios teclados, y
  excluir Ctrl/⌘ para no pisar AltGr;
- ir **antes** del corte de Mundo y del de `input/textarea`, para que cierre igual con el foco dentro;
- `exitPointerLock()` al abrir, que en el Mundo el ratón está capturado.
- `m` **no está asignada a nada** hoy (a diferencia de la `a` de Alt+A, que es andar a la izquierda), así
  que aquí no hace falta `stopImmediatePropagation`. Comprobarlo igualmente al implementar.
- Añadir el overlay a la **guardia de teclas del Mundo** (`app.js:9922`, la lista de modales abiertos):
  si no, el jugador **sigue andando por detrás** mientras elige mapa.
- Cerrar también con **Esc**, como los demás modales (`app.js:3192`, `3224`, `3227`).

**«Sin perder el que tengo actualmente»** — dos mitades que conviene no confundir:
1. **Abrir/cerrar el overlay** no toca `mc.*`: el mundo sigue vivo detrás y al cerrar se continúa donde
   se estaba. Esto es lo que pide el dueño y es barato.
2. **Elegir otro mapa** sí es un cambio de mundo. Opciones: (a) navegar a `/map/<otro>` —simple y
   honesto, pero paga la recarga—; (b) cambiar el mundo **en caliente** sin recargar la página. (b) es
   bastante más trabajo (soltar VBOs, paleta, estructuras, agentes, snippets) y es donde se esconden las
   fugas. **Recomiendo (a)**, y que **guarde antes de irse**; (b) solo si al dueño le sigue molestando.

**Móvil**: no hay tecla Alt. El dueño juega en móvil (≈390 px), así que hace falta una entrada
equivalente —un botón—; encaja con REQ-OSD1, que está decidiendo justo qué botones se ven en el Mundo.

**Verificación esperada**
- Alt+M abre el overlay desde el editor, desde el Mapa, desde Play y desde el Mundo; segundo Alt+M lo
  cierra y se sigue exactamente donde se estaba (misma posición y vista en el Mundo).
- Con el overlay abierto, **el jugador no se mueve** aunque se tecleen WASD, y Esc cierra.
- El listado sale de `/api/mundos` (mismas miniaturas y estadísticas que `/map/`), sin recargar la SPA.
- Abrir y cerrar el overlay 20 veces no cambia `game.fps` ni deja peticiones colgando.
- Elegir otro mapa guarda el actual antes de irse.

---

<a id="-req-mov1"></a>

### ⬜ REQ-MOV1 · Mandos táctiles: los 3 botones del ratón, pantalla completa y menú — ⬜ todo
**Reportado** 2026-08-19 por el dueño, con captura: «en el móvil el juego es prácticamente
inmanejable, sobran los botones de video y tomar foto, faltarían controles/botones como tiene el
ratón o un mando de videoconsola para saltar, botón izquierdo, derecho y central. también poder
ponerlo a pantalla completa. el botón de cerrar debería de ser un menú para poder parte de cerrar
poder poner pantalla completa».

Captura y transcripción → [`data/tickets/REQ-MOV1/contexto.md`](data/tickets/REQ-MOV1/contexto.md).

**Qué se cambia**
1. 📷 y 🎬 **fuera del pad** — no se pierden: se van al menú.
2. Botones de acción **⛏ / ▣ / ⚡** = clic izquierdo / derecho / central del ratón. El ⤒ de saltar
   ya existía; se queda con ellos, en pila de mando.
3. El ✕ pasa a ser **☰**, y despliega: pantalla completa · foto · vídeo · salir.

**Decisiones que no hay que volver a tomar**
- **Revierte una decisión escrita**: `app.js` decía «a propósito NO hay botones de romper/poner: un
  toque de más sería una edición de verdad, con su autoguardado en `mundo.json`». El dueño los pide.
  El comentario se sustituye, no se borra sin más: el riesgo (tocar de más = editar el mundo de
  verdad) sigue siendo cierto, y por eso los de acción van **arriba**, lejos del pulgar que anda.
- **El central es el de redstone**, no una pregunta abierta: lo dice `redstone/redstone-piezas.js`,
  que ya escucha `mousedown` con `button:1` en `window`. El botón táctil manda ese mismo evento en
  vez de duplicar la lógica.
- **`mcMandoActivo()`**: hasta ahora «¿manda el jugador?» se escribía `pointerLockElement===mc.canvas`
  repetido por media docena de sitios. En táctil no hay ratón que capturar, y **entrar en pantalla
  completa suelta el pointer-lock** ⇒ sin esto, cumplir la mitad del ticket (pantalla completa)
  apagaría la otra mitad (los botones). Un solo predicado, y el táctil entra por la puerta.

<a id="-req-ed3"></a>

### ⬜ REQ-ED3 · Guías de rejilla conmutables en el editor 2D — ⬜ todo
**Reportado** 2026-08-18 por el dueño: «en modo de edición 2d debería de haber una separación visual
(línea de color azul clarito ligeramente visible por ejemplo) que sea como un grid, inicialmente 2
divisiones en el plano horizontal y 2 en el vertical de la capa, así por defecto un bloque de 16x16
tendría 4 cajas visibles de 8x8 (vista superior de la capa), pero podría ser interesante poder elegir
el tamaño de grid, además de mostrarlo/ocultarlo. Podría ser una nueva tool para el editor 2d que rote
entre: sin grid, división por 2 horizontal y vertical, y por 4».

**Estado actual**
`drawEdit` (`app.js:537`) ya pinta **una rejilla por celda** al terminar los voxels: un solo
`beginPath` con `SX+1` verticales y `SY+1` horizontales en `rgba(255,255,255,0.06)`
(`app.js:565-570`). Las guías nuevas son **otra pasada igual pero cada N celdas**, más marcada y azul,
encima de esa. El ancla de coordenadas ya existe y no hay que recalcular nada: `px(i)`/`py(j)` y
`viewGeom()`, que respetan zoom y paneo.

**Decisión de diseño: ⛔ que NO sea una `data-tool`.** El panel HERRAMIENTAS (`index.html:142`,
`index.html:220`) es de herramientas de **dibujo**, y `setTool` (`app.js:3231`) es excluyente: elegir
«Rejilla» te dejaría sin Pincel y habría que volver a pulsarlo después de cada cambio de guía. Esto no
edita nada, es **estado de VISTA**.

El precedente exacto es el **interruptor de Caras** (`app.js:345-351`): un botón en la `stage-bar`
(`index.html:194-203`), preferencia en `localStorage` (`vf_caras_marcar`), y el comentario de
`app.js:340-343` deja escrita la regla — *«es estado de VISTA: no toca el documento, no viaja en él y
no cambia nada del Mundo»*. Aquí igual: `vf_grid_div`, y **⛔ nunca dentro de `state`**, o la guía se
guardaría en el `.vox.json` y viajaría a quien abra la pieza.

Un botón que **rota** los tres valores (sin guías → ÷2 → ÷4 → sin guías) es exactamente lo que pide el
dueño y cabe en un solo botón de la barra, sin selector.

**A decidir con el dueño al implementar**
- **Tamaños no divisibles.** El editor no es siempre 16³ (el panel Objeto deja poner 16×16×16 a mano).
  Con `SX=10` y ÷4 las guías caerían en 2,5 celdas. Propuesta: dibujar solo en los múltiplos enteros y,
  si no hay ninguno, no dibujar esa guía — mejor que una línea a mitad de celda, que engaña.
- **¿Solo Capas, o también la vista 3D del editor?** El dueño dice «modo de edición 2d», así que se
  hace solo en `drawEdit`. `drawEdit3d` queda fuera salvo que lo pida.

**Cómo se comprueba**
- Con ÷2 en una capa de 16×16 se ven **4 cajas de 8×8**; con ÷4, **16 de 4×4**; el borde exterior no
  se dobla con la rejilla que ya había.
- Las guías **se pegan a las celdas** al hacer zoom y paneo (no se despegan de la rejilla fina).
- El ajuste **sobrevive a recargar** la página, y **no aparece** en el JSON que se guarda de la pieza.
- No se ven guías en el Mundo ni en la ficha de la pieza: es solo el lienzo del editor.

---

<a id="-req-rs11"></a>

### 🟡 REQ-RS11 · Las piezas de redstone, en carpeta propia — 🟡 abierto 2026-08-07

**Abierto 2026-08-07.** El dueño hizo un `pull` desde otra máquina y las piezas de redstone no
estaban:

> «no entiendo qué sentido tiene la carpeta habitantes, muévelas a redstone y súbelas»

**Ya está hecha la mitad urgente** (que viajen): las 22 piezas están exceptuadas en `.gitignore` y
versionadas, 336 KB. Un clon nuevo ya abre el mundo con su redstone. Esto es **la otra mitad**:
separarlas de verdad.

⚠️ **Lo que impide moverlas sin más, y es el motivo de que esto sea un ticket y no un `mv`:**
`hab:` **no es una ruta, es un espacio de nombres**, y está **grabado dentro de los mundos
guardados**. `server.py:11` lo ata a una sola carpeta (`STORE = data/habitantes`) y `app.js:3450`
resuelve la clave con `fetch('/api/habitantes/' + key.slice(4))`. Referencias vivas hoy:

| dónde | refs a `hab:<pieza de redstone>` |
|---|---|
| `data/mundo.json` | 88 |
| `data/worlds/` (test 65, redstone 44, cubes 34, favicon 25, agents 10, fps 10, lab 8, empty 1) | 197 |
| código versionado (`redstone-ejemplos.js` 92, `test_redstone_dsl.js` 54, `redstone-piezas.js` 40, …) | ~450 |

O sea: **cambiar la clave no es una opción** — dejaría 285 bloques de mundos reales sin material. La
carpeta se puede mover, la clave no.

**El camino, entonces:** `data/redstone/` versionada, y el namespace `hab:` **servido desde las dos
carpetas**. Hay que tocar listar / cargar / guardar / renombrar / borrar en `server.py` y las
miniaturas de `mundos.py`.

**Sin decidir, y hay que preguntar al dueño:** qué pasa si **editas** una pieza de redstone desde el
editor — ¿se escribe en la carpeta versionada (y entonces el editor ensucia el repo) o se copia a
`data/habitantes/` y esa gana (y entonces hay dos verdades)? Y si al listar la galería siguen
saliendo mezcladas o en un grupo aparte.

**Nota aparte, sin resolver:** el código versionado también referencia otras 9 claves `hab:` que
**tampoco viajan** (`agua`, `agua-profunda`, `cristal`, `cubo-trans`, `escalera`, `likelava`,
`like-water`, `rejilla`, `tejado`, ~630 KB). Las usan tests como `test_cubo_translucido.js` o
`test_escalera_inercia.js`. No se han versionado porque el encargo era el redstone; decidir si
entran.

---

<a id="-req-doc2"></a>

### 🟡 REQ-DOC2 · Un mapa del estado interno de `app.js` — 🟡 abierto 2026-08-07

**Redactado sin investigar.** Tercera fila de la auditoría externa: «Frontend (`app.js`) — Legible
pero Denso — Monolito de 778 KB; vendría bien un esquema/mapa de estado interno». La cifra real es
**749 KB / 11 437 líneas**; la crítica es la mejor puesta de la tabla.

**Esto NO es un ticket para partir `app.js`**, ni para refactorizarlo. Es para escribir el mapa que
hoy hay que reconstruir a `grep` cada vez: qué vive en `state` (editor), qué en `mc` (mundo) y qué en
`game` (scripting), quién invalida qué, y dónde está la frontera entre los tres.

Candidatos a entrar, por ser los que ya han costado tickets o me han mordido en sesión:

- `state.voxels` / `state.caras` y el contador `voxRev` que invalida las cachés de render.
- `mc.grid` (assets 16³ macizos) **vs** `mc.structures` (todo lo que tiene forma, 1/16 de grosor) —
  ya documentado como concepto, pero sin mapa de qué campo lo decide.
- `bits` (colisión) vs `bitsAim` (apuntado), y las tres capas de envoltorios de solidez.
- `mc.blockKey` / la paleta que se re-hornea en cada arranque (los ids **no son estables**).
- Los ganchos que `app.js` expone sin saber qué son: `mc.sunExtra`, `mcXrayExtra`, `mc.atraviesa`.

Sitio natural: sección nueva en `CLAUDE.md`, lo que lo hace hermano de [REQ-DOC1](PLAN_ARCHIVO.md#-req-doc1) — si el
fichero no se vuelve navegable antes, este mapa se entierra igual que lo demás.

---

<a id="-bug-rs10"></a>

### 🔴 BUG-RS10 · El pistón no empuja estructuras — 🔴 abierto 2026-08-07

**Reportado** 2026-08-07 por el dueño, con dos capturas (`data/tickets/BUG-RS10/01.png` y `02.png`):

> «bug, el pistón no empuja estructuras»

En la captura: un cubo de cristal (`hab:cubo-trans`) plantado justo delante de un pistón, con su cable
de redstone y su botón al lado. La vista de rayos-X del otro pantallazo enseña `pistón@16` y `cable`
en las celdas de al lado, o sea que el circuito está montado y reconocido.

**Es el que faltaba de la familia.** El empuje del pistón se ha ido arreglando por tipos de cosa
empujada, uno por ticket: bloques (funciona), el **jugador** ([BUG-RS9](PLAN_ARCHIVO.md#-bug-rs9), `mcUnstick`), los
**agentes articulados** ([BUG-AG1](PLAN_ARCHIVO.md#-bug-ag1), tres fallos a la vez, más `aturdir` en
[BUG-AG5](PLAN_ARCHIVO.md#-bug-ag5)). Las **estructuras finas** son la cuarta familia y no se ha tocado nunca. Vale
la pena mirar si el pistón las ve siquiera: son la mitad del mundo que no está en `mc.grid`, y ése es
exactamente el olvido que ya mordió en el diagnóstico del atasco (REQ-DBG2, pasada 2b).

**Actualizado 2026-08-07, tras cerrar [BUG-STR1](PLAN_ARCHIVO.md#-bug-str1).** Se responde a la mitad de lo que estaba
sin verificar, y **el caso de la captura ya no ocurre**:

- **El pistón no las ve.** Es la primera de las tres hipótesis, y está escrito en el propio código
  (`redstone/redstone-piezas.js`, `accionar`): *«empuja lo que hay en `mc.grid` […] una estructura
  estampada ocupa varias celdas y no vive en la rejilla: delante del pistón se ve como aire y la cabeza
  se le mete dentro. Límite conocido de la v1»*. No es que no sepa moverlas ni que se quede sin
  remallar: no llega a mirarlas.
- **El caso de la captura estaba contaminado por BUG-STR1**, como se sospechaba. `hab:cubo-trans` ya no
  es una estructura sino una celda de rejilla, y el pistón lo empuja: medido con `sonda_str1_piston.js`
  (antes `enX4:""`, ahora `enX4:"hab:cubo-trans"`). Si el cubo de cristal era todo lo que el dueño
  quería mover, **este ticket ya no le afecta**.
- Lo que queda vivo es lo que de verdad *tiene* que ser una estructura: varias celdas (una sala, un
  árbol), o una pieza con `caras` sobre un macizo. Ahí sigue sin empujarse.

⚠️ **SIGUE SIN VERIFICAR**: si tiene sentido que las empuje (una estructura tiene origen, giro y AABB
propios: moverla es escribir en `mc.structures` y remallar, no copiar un id de celda a celda), ni qué
pasa con una que ocupe varias celdas y solo una esté delante del pistón. **Antes de programar nada hay
que preguntarle al dueño si esto le sigue molestando**, porque el ejemplo que dio ya está resuelto.

---

<a id="-req-gal3"></a>

### 🔴 REQ-GAL3 · Cambiar el espacio de nombres de una pieza desde la galería — 🔴 abierto 2026-08-10

**Petición del dueño, literal:**

> «tal vez deberia de poderse modificar el espacio de nombres desde la galeria»

**Sin investigar.** Salió al hilo de [BUG-FLUID3](PLAN_ARCHIVO.md#-bug-fluid3), pero es otra cosa: aquello era que el
motor dependiera del espacio de nombres (ya no depende); esto es poder **decidir** en cuál vive una
pieza — mover `asset:assets/<n>.vox.json` ↔ `hab:<n>` desde la ficha, sin exportar e importar a mano.

**Lo que habrá que mirar cuando toque:** guardar ya enruta por el ORIGEN del dibujo (`serverKind`, ver
BUG-GAL1/GAL2 y `test_galeria_namespace.js`), así que la pieza que falta es un «mover a la otra
galería» explícito. Y lo caro no es copiar el fichero: es que **los voxels del mundo guardan la clave
larga**, así que mover una pieza deja el mundo apuntando a una clave que ya no existe — o hace falta
reescribir el mundo, o dejar la vieja como alias.

---

<a id="-bug-snp4"></a>

### 🔴 BUG-SNP4 · Los cambios en el editor de código del Mundo se revierten — 🔴 abierto 2026-08-11

**Enunciado del dueño, literal:**

> «cuando esto en el mapa y hago control+C si edito el codigo, vuelvo al mapa, vuelvo con control+C al
> editor, los cambios que hice en el script se revierten y no deberia»

**Área:** el editor de snippets del Mundo (el modal de código que se abre desde dentro de `/map/<n>`).

⚠️ **Discrepancia de tecla, sin resolver:** el dueño dice **Ctrl+C**; `CLAUDE.md` documenta que el
editor de snippets se abre con **Alt+C** («con teclado sobran, porque Esc cierra y Alt+C abre los
snippets»), y `Ctrl+C` está además cogido en el editor de voxels por `copySelection`. Puede ser que
el atajo real sea otro, que haya dos, o simplemente que el dueño lo llame así. Hay que mirarlo antes
de tocar nada, porque de eso depende **qué código abre el modal** y por tanto dónde está el fallo.

**Sospecha, NO verificada:** un snippet del Mundo tiene **dos copias vivas** (el `.json` en disco y lo
que el Mundo cargó al arrancar), y es la trampa recurrente de esta zona. Si al reabrir el modal se
relee la copia que se cargó al abrir el Mundo en vez de la editada, lo escrito «desaparece» sin que
nadie haya borrado nada.

**Lo que NO se ha comprobado** (esto es un ticket redactado, no investigado):

- si lo que se pierde es solo lo **no guardado**, o también lo que se guardó desde el modal;
- si recargar la pestaña muestra el texto nuevo o el viejo (o sea: si el `.json` de disco llegó a
  cambiar);
- si el modal relee el snippet en cada apertura o conserva un buffer;
- cuál es el atajo real y si abre el mismo modal en los dos casos.

**Cuidado al arreglarlo:** el snippet es autoría del dueño y lo edita en vivo. Nada de reescribirlo
entero; los cambios de código van por parche idempotente por marca, como el resto de esta zona.

---

<a id="-bug-cart1"></a>

### 🟡 BUG-CART1 · Carteles de nota apilados dentro de `mundo.json` — 🟡 arreglado 2026-08-20, falta una pasada del dueño

No lo pidió nadie: salió tirando de un guardián en rojo mientras se cerraba
[REQ-CART5](PLAN_ARCHIVO.md#-req-cart5). En `data/worlds/test.json` había **siete carteles apilados de
tres en tres** encima de las notas.

**La causa.** El cartel de una nota se **deriva** de `mc.notes` y va marcado `efimera`, así que
`mcStructuresDoc()` lo filtra y `mundo.json` no debería llevar ninguno jamás. Pero la marca se ponía
**después** del `await` de `mcStampStruct`, y estampar tarda (atlas, malla, a veces red): cualquier
guardado que cayera en ese hueco se llevaba el cartel al fichero. Y de ahí ya no salía solo — al cargar
vuelve **sin `nota` ni `efimera`**, nadie lo reconoce como cartel de nota, y el guardado siguiente
añadía otro encima.

**Lo hecho.** Dos mitades, las dos necesarias:

- La marca **viaja en la llamada** (`mcStampStruct(..., marca)`) y se aplica antes de que la instancia
  entre en `mc.structures`: ya no hay hueco que aprovechar.
- El motor **se cura solo**: `mcSyncNoteSignsRun` retira los carteles sin marcar que estén justo donde
  va el de una nota viva, y `mcNoteSignsDesfasados` los ve (si no, la limpieza no llegaría a correr
  nunca, porque todo lo demás cuadra).

Guardián `tests/test_cart1_carteles_fantasma.js`, en verde. `/map/test` ya está limpio (7 notas del
dueño, `carteles: []`).

**Lo que queda, y por qué no lo cierro yo.** Los **huérfanos** —carteles de un bloque que ya no tiene
nota— no se tocan a propósito: no se distinguen de uno puesto a mano como decoración, así que borrarlos
adivinando iría contra la regla de arranque. Para ésos está
`herramientas/carteles_fantasma.py`, que hace pasada en seco por defecto:

```
python3 herramientas/carteles_fantasma.py                    # lista lo que hay en todos los mapas
python3 herramientas/carteles_fantasma.py --escribe          # borra (idempotente)
```

**No lo puedo lanzar yo**: escribe en `data/worlds/` y la caja de arena me lo deniega.

**Criterio de cierre:** el dueño lanza la pasada en seco, mira la lista, decide si algún huérfano es
decoración suya y corre `--escribe` con lo demás.

---

<a id="-req-spawn1"></a>

### 🟢 REQ-SPAWN1 · Pensar el tema de los puntos de aparición — 🟢 abierto 2026-08-19

Nota `52,14,45` de **`/map/bugfinder`**, entera: «*pensar un poco en el tema de spawn points*».

Es un **encargo de pensar**, no un arreglo: no hay bug que reproducir. Lo que hay hoy es **un único**
`spawn` en la cabecera del mundo (`{x,y,z}`, se ve en `/api/mundo?map=…`), que es donde apareces al
entrar y a donde vuelves. Lo que no hay: varios puntos, punto por agente/criatura, reaparecer donde
moriste, ni marcarlos desde el Mundo.

**Criterio de cierre:** una propuesta corta escrita (aquí mismo) con lo que él quiera de eso, y los
tickets que salgan. No se toca código hasta que la apruebe.

Engancha con [REQ-MULTI1](#-req-multi1): con varios jugadores, «dónde aparece cada uno» deja de ser un
punto y pasa a ser una regla.

---

#### 📝 Propuesta escrita (2026-08-20) — pendiente de su visto bueno

**Lo que hay hoy, comprobado, no de oídas.** `mc.spawn` = `{x,y,z}`, un solo punto, en la cabecera del
mundo. Lo escribe `mcNewWorld` (centro del mapa, sobre la hierba) y lo recoloca `mcResizeWorld` si el
mundo encoge. Lo leen dos sitios: la carga del mundo (`mc.pos = spawn`) y `mcForceUnstick` (tecla `U`),
que te teletransporta ahí si no consigue sacarte hacia arriba. Y ahí se acaba:

- **no hay `game.spawn`** — ni para leerlo ni para moverlo. Ni desde un snippet ni desde la UI. Cambiar
  dónde apareces hoy pasa por editar `mundo.json` a mano.
- **no se valida**: si construyes encima del spawn, apareces dentro de la roca. Lo tapa `mcUnstick` por
  casualidad, no por diseño.
- **no hay muerte**: no existe vida ni morir, así que «reaparecer al morir» hoy **no tiene dónde
  engancharse**. La espada y los esqueletos no matan al jugador.

**Cuatro cosas distintas se llaman «spawn point»; van por separado y en este orden.**

**A · Poder mover el punto (lo que falta de verdad, y es pequeño).** `game.spawn` como lectura y
escritura, más un «aquí se aparece» desde el Mundo (⋯ del menú, o `Alt`+tecla) que lo fija donde estás
mirando y guarda la cabecera. Con dos cautelas: pasar el sitio por el mismo buscador de hueco que ya usa
el desatasco (aparecer dentro de una pared es el fallo que se va a dar), y guardar también **hacia dónde
miras** — hoy apareces siempre con la misma orientación. **Recomendación: hacer esto ya, independiente
de todo lo demás.** Ticket propio, chico.

**B · Varios puntos con nombre.** `mc.spawns` = lista de `{nombre,x,y,z,mira}` en la cabecera, con el
`spawn` de hoy como el primero de la lista (así los mundos viejos siguen valiendo). Sirve para dos cosas
a la vez: elegir dónde entras, y **viaje rápido** entre sitios de un mapa grande — que es probablemente
lo que más se va a usar. Se pega bien con la galería de recortes de [REQ-RANURA1](PLAN_ARCHIVO.md#-req-ranura1): misma
idea de «cosas guardadas con nombre a las que se vuelve». **Recomendación: sí, pero después de A**, y
preguntándole antes si lo quiere como *viaje rápido* (mi apuesta) o solo como *punto de entrada*.

**C · Reaparecer donde moriste / cama.** **Recomendación: NO ahora.** No es un ticket de spawn, es un
ticket de reglas de juego: primero hace falta vida, daño y morir. Si algún día se hace, el punto de
reaparición es un dato del **jugador**, no del mundo, y no debe ir en `mundo.json`.

**D · Con varios jugadores ([REQ-MULTI1](#-req-multi1)).** Ahí «dónde aparece cada uno» deja de ser un
punto y pasa a ser una **regla del servidor**: o todos en el mismo sitio (se apilan y se empujan), o
repartidos en un anillo alrededor, o cada uno **donde lo dejó** (mi apuesta: es lo que espera cualquiera
que vuelve a un mundo). Eso es **estado por jugador en el servidor**, o sea que pertenece a REQ-MULTI1 y
no a este ticket; lo único que hay que hacer aquí es no cerrarle la puerta — y A + B no se la cierran.

**Tickets que saldrían si lo aprueba:** `REQ-SPAWN2` (A, chico), `REQ-SPAWN3` (B, mediano), y nada más:
C y D son de otros dueños.

---

<a id="-bug-glow8"></a>

### 🔴 BUG-GLOW8 · La luz de un emisivo en la mano es un parche, no la luz del mundo — 🔴 abierto 2026-08-20

**De dónde sale.** Del dueño, 2026-08-20, mirando el arreglo de [BUG-GLOW6](PLAN_ARCHIVO.md#-bug-glow6)
con **dos voxeles del mango de la varita de selección puestos a emisivos por él mismo**
(`data/habitantes/varita-de-selecci-n.json`, `13,2,2` y `13,3,2` → `*#8a5a3b`, guardado a las 09:50; las
capturas son de las 09:58). Palabras suyas, y son el criterio del ticket:

> «*la corrección funciona a medias […] como iluminan los bloques del mundo de su derecha no es
> realista, sale una especie de "círculo" que es imposible, la emisión de luz tiene que ser como la que
> hacen los bloques/voxels del mundo y no un parche […] si la voy metiendo más, se va la luz, cuando en
> realidad lo que ilumina está en el mango, no está dentro del bloque, se nota demasiado que es un
> "truco visual" […] la iluminación debe de ser real y consistente para todo el motor, no puede haber
> apaños o trucos para quedar bien*»

Capturas y texto entero en [`data/tickets/BUG-GLOW8/`](data/tickets/BUG-GLOW8/contexto.md).

**Diagnóstico (leído en el código y medido en el navegador, no de oídas).** No son tres fallos: es
**uno**, y BUG-GLOW6 no lo tocó porque lo dio por bueno. **Hay dos modelos de luz artificial distintos y
el dueño está viendo la costura entre ellos**:

| | **luz horneada** (una antorcha plantada) | **luz dinámica** (lo que llevas en la mano) |
|---|---|---|
| dónde | `mcComputeBlockLight` → `mc.blockLight` → textura 3D → `blkLuz(w)` por fragmento | `mcDynSync` → `uDynPos[]` → `dynLuz(w)` por fragmento |
| forma | **BFS por el aire**, 6 vecinos, −1 por paso ⇒ **rombo escalonado**, celda a celda | `rad = 1 − d·coste/nivel` con `d = distance()` ⇒ **esfera perfecta** |
| materia | la para: no se propaga por sólido | no la ve: se sumaba a través de la pared (eso es lo que BUG-GLOW6 recortó **por fuera**) |
| color | lleva el rgb del voxel emisivo (`s.emitCol`) | **no lo lleva**: `mcLitGlow` pinta un blanco cálido fijo `vec3(1.15,0.98,0.75)` |

De ahí salen, una por una, las cuatro cosas que él ve:

1. **El «círculo imposible».** Es literal: el halo dinámico es una **esfera euclídea** cortada por la
   pared ⇒ un disco redondo y liso, mientras que a un palmo, la misma pared, iluminada por cualquier
   antorcha del mundo, hace **rombos escalonados por celdas**. No es que esté mal calculado: es que es
   **otra ley**. Ninguna cantidad de afinado lo va a hacer parecerse al mundo, porque no es la del mundo.
2. **El segundo círculo, con borde duro.** `MC_DYN_CERCA = 0.6`: por debajo de esa distancia una cara
   recibe luz **aunque le dé por detrás** (margen que BUG-GLOW6 metió para que la propia pieza en la
   mano no se apagara). Cuando el emisivo cruza el plano de la pared, lo único que sigue iluminado es la
   esfera de radio 0,6 recortada contra la cara ⇒ **un disco con borde de cuchillo**. Es el parche del
   parche.
3. **«Si la voy metiendo más, se va la luz».** `mcLuzLibre` juzga la luz **entera, sí o no**, y por la
   línea que va **del emisivo al OJO**; su primera comprobación es la celda del propio emisivo
   (comprobado en el navegador: emisor en celda sólida ⇒ `false`). En cuanto el voxel del mango entra en
   la celda del bloque, **la luz se apaga del todo** — no se ocluye por un lado: desaparece. Y por eso
   da igual dónde ponga los emisivos: no es «un fallo del mango», es que el modelo apaga la luz entera.
4. **No tiñe.** Sus `*#8a5a3b` deberían dar luz parda; en la mano dan el mismo blanco cálido que
   cualquier otra cosa. Plantado el mismo dibujo, tiñe. Es la misma costura.

**Lo que propongo, y es lo que él pide: quitar el segundo modelo, no mejorarlo.** Que la luz de lo que
llevas en la mano **sea luz de bloque**, la misma tabla, el mismo BFS, el mismo color, la misma textura
3D — la pieza en la mano deja de tener luz «suya» y pasa a sembrar en el mundo como una antorcha. Con
eso los cuatro puntos de arriba se caen solos, y `dynLuz`, `uDynPos`, `uDynDir`, `uDynCara`,
`uDynCerca`, `mcLuzLibre` y `MC_DYN_CERCA` **se borran**: menos motor, no más.

Lo que en su día lo impidió ([BUG-GLOW2](PLAN_ARCHIVO.md#-bug-glow2)) **ya no existe**: entonces mover
la luz horneada obligaba a **re-mallar** el halo (la luz iba horneada en el vértice) y eso sí tiraba los
fps. Desde [REQ-ENV4](PLAN_ARCHIVO.md#-req-env4) la luz de bloque se lee **por fragmento de una textura
3D** (`blkLuz`): mover una luz es re-sembrar un array y subir una caja de téxeles. **Nada de mallas.**

**Medido hoy en `/map/bugfinder` (96×40×96), no estimado:**

| | coste |
|---|---|
| BFS completo del mundo (lo que ya se paga al poner un bloque) | **7,8 ms** |
| BFS acotado a la caja de la luz (31³, alcance 15), buffers reusados | **1,09 ms** |
| subir esa caja a la textura 3D (`texSubImage3D`, 119 KB) | **0,22 ms** |

Y **solo hay que pagarlo cuando la luz cambia de celda**, no cada frame: andando son 2–4 veces por
segundo ⇒ **≈0,05 ms/frame amortizado**. La pieza clave a escribir es una **re-siembra exacta en caja**
para la luz de bloque, hermana de la que ya existe para el cielo (`mcRelightBox`): se recalcula la caja
`[celda vieja, celda nueva] ± alcance`, sembrando el **borde** con lo que ya hay. Es exacta —la luz que
se mueve no puede influir más allá de su alcance, o sea que el borde no está contaminado— y de regalo
arregla que **plantar o romper una antorcha hoy relance el BFS del mundo entero** (7,8 ms).

**El único punto que quiero que decida él, porque es de gusto y no de código:** hecho así, la luz que
llevas en la mano **avanza a saltos de una celda** (rombo que salta un bloque al cruzar la frontera),
igual que si fueras plantando y quitando una antorcha. Es exactamente «*como la que hacen los
bloques/voxels del mundo*», que es lo que pide, pero es **menos suave** que el foco de hoy. Yo lo haría
así (consistencia > suavidad, y él lo ha escrito con todas las letras). Si el salto le molesta, la
salida **no** es volver al parche: es sembrar en las 8 celdas vecinas con peso por la posición
fraccionaria, que quita el salto sin cambiar de modelo — más caro y lo dejaría para un segundo paso, con
su ticket.

**Criterio de cierre:** con los dos voxeles emisivos del mango, (a) el halo en la pared es **del mismo
tipo** que el de una antorcha plantada al lado —rombos por celda, no un disco—, (b) meter la punta o la
cabeza de la herramienta dentro de un bloque **no apaga la luz**, sigue alumbrando desde donde está el
voxel emisivo, (c) la luz **tiñe** con el color del voxel, y (d) los fps con `game.osd` no bajan
respecto a hoy andando con la herramienta en la mano. Guardián nuevo del estilo de
`test_luz_incremental_navegador.js`: la caja re-sembrada tiene que dar **celda por celda** lo mismo que
un `mcComputeBlockLight` desde cero.

---

<a id="-req-multi1"></a>

### 🟢 REQ-MULTI1 · Multijugador colaborativo: el mismo mapa, varios jugadores — 🟢 abierto 2026-08-19

**De dónde sale.** Del dueño, 2026-08-19, contestando a que marcar sus notas podía «pisarle el mundo»:
«*a la larga hay que hacer que el sistema permita a varios jugadores jugar el mismo mapa de forma
colaborativa, por lo tanto, nadie pisaría a nadie; valorar opción websockets para sincronizar cambios en
el mapa que estén jugando varios y que puedan verse los jugadores entre sí con sus armas en mano y un
nombre/etiqueta que les identifique*».

Ojo a **por qué** nació: hoy dos que editen el mismo mundo **se pisan**, y eso ya duele con un solo
jugador y un asistente escribiendo notas. El multijugador no es solo una función nueva: es la respuesta
a un fallo que ya está pasando.

**Lo que hay a favor (medio camino andado sin querer):**

- **El delta ya existe.** `POST /api/mundo/edits` manda **solo las celdas que cambian**
  (`[[x,y,z,'asset:…'], …]`, `''`/`null` = aire) y el servidor hace *seek* + 2 bytes por celda; el
  mundo entero no se lee ni se reescribe. Eso es exactamente el mensaje que habría que **retransmitir**
  a los demás. Lo mismo `POST /api/mundo/cabecera` para notas/estructuras/spawn (kilobytes, con cerrojo
  y copia a la papelera).
- **Ya hay cuerpos que se mueven y se dibujan**: los agentes-esqueleto (`game.esqueletos`) son
  justo eso —un cuerpo articulado con cosas en la mano—, y las notas ya saben pintar texto en el mundo,
  que es de donde puede salir la etiqueta del nombre.
- **Ya hay reloj compartido**: el mundo simula en tiempo simulado y el servidor guarda el estado.

**Lo que NO hay, y es lo caro:**

- **No hay proceso con estado.** `server.py` es la librería estándar de Python: un `Handler` por
  petición, sin sesión, sin bucle. Un WebSocket pide un servidor que se quede escuchando y una tabla de
  quién está conectado — es *la* decisión de arquitectura del ticket, y toca el «backend Python stdlib,
  sin dependencias» que es una regla del repo. **Decidir con el dueño** si eso se rompe (biblioteca de
  websockets) o se hace a mano sobre `socket` (el apretón de manos de WebSocket son ~40 líneas; los
  marcos, otras tantas).
- **No hay identidad.** Ni nombre, ni color, ni sesión. Hace falta lo mínimo: un nombre que el jugador
  escribe y un id por conexión.
- **No hay jugador dibujable.** El jugador es hoy una cámara con física; nadie ha modelado su cuerpo
  visto desde fuera, ni el arma en la mano vista por otro.
- **No hay resolución de conflictos.** Dos que ponen un bloque distinto en la misma celda: hoy gana el
  último que escribe y el otro se queda con el mundo mal. Con el delta viajando por el socket, la regla
  natural es «el servidor ordena y devuelve; el cliente pinta lo que le devuelven», no «pinto y aviso».

**Cómo trocearlo** (propuesta, a aprobar antes de tocar nada):

1. **Ver a los demás** (sin editar): un socket que solo lleva posición/mirada/arma/nombre. Es visible,
   se disfruta enseguida y no puede corromper ningún mundo.
2. **Ver los cambios de los demás**: retransmitir los `edits` que ya se mandan. Ahí aparecen la luz
   incremental (`mcRelightBox`) y el re-mallado del chunk del vecino.
3. **Reglas de convivencia**: conflictos, quién puede editar, y los spawn points ([REQ-SPAWN1](#-req-spawn1)).

**Acotado por el dueño (2026-08-19), sus palabras:**

- **Cuántos** — «*infinitos idealmente, pero vamos a ponerle límite 10 de momento*». Se diseña sin
  suponer 10: 10 es el **tope de hoy**, no el número que puede meterse en un `for` de tamaño fijo.
- **Dónde** — «*por internet o red local*». Las dos. O sea: nada de suponer 1 ms de ida y vuelta, y hay
  que contar con que un jugador se queda colgado a media edición.
- **Para qué** — «*podrán jugar y construir a 4 manos o las que hagan falta si se desea*». **Construir
  también.** Esto es lo que más cambia el ticket: la fase 2 (los cambios del mundo viajando) deja de ser
  opcional y las **reglas de conflicto** dejan de ser un detalle.

**Consecuencias de ese acotado, ya:**

- **Con edición compartida, el cliente no puede ser la verdad.** Hoy cada navegador escribe en su
  `mc.grid` y luego avisa. Con dos construyendo, la regla tiene que ser **el servidor ordena**: llega el
  delta, el servidor lo aplica en orden y lo devuelve a todos (al que lo mandó también). El cliente
  puede pintarlo antes para que no se note el viaje, pero si el servidor le contesta otra cosa, manda el
  servidor.
- **Identidad: nombre + secreto de la partida** (decidido por el dueño, 2026-08-19: «*nombre y secreto
  me parece bien*»). Ni cuentas, ni registro, ni contraseña por persona: **un** secreto por mundo
  abierto a la red, y cada quien dice cómo se llama. El nombre es **etiqueta, no permiso** —quien tiene
  el secreto construye—, así que puede repetirse y no hace falta reservarlo; el id de verdad es la
  conexión.
  ⚠️ Consecuencias que no se pueden olvidar al implementarlo: el secreto se comprueba **en el apretón de
  manos**, antes de aceptar el socket (no después, ni en cada mensaje); no viaja en la URL (queda en el
  historial del navegador y en los logs); y como sin HTTPS va en claro, esto vale para una partida entre
  conocidos, **no** para un mundo público. Decirlo en la wiki cuando se escriba, sin adornos.
- **10 sockets abiertos ⇒ hace falta un proceso que se quede escuchando**, y eso choca con «backend
  Python stdlib, sin dependencias». **Recomendación**: hacerlo a mano —el apretón de manos de WebSocket
  es un SHA-1 + base64 de una cabecera, y leer un marco son unas decenas de líneas—, en un hilo del
  mismo `server.py` y en su mismo puerto (la petición de *upgrade* llega por HTTP). Mismo proceso, no
  otro servicio: así el orden de los `edits` lo pone quien ya tiene el cerrojo del fichero
  (`voxfmt._cerrojo`) y no hay dos escritores compitiendo. Fichero nuevo `servidor/multi.py`, que
  `server.py` importa — el resto del servidor no se entera.

**Las fases, con eso dentro** (a aprobar antes de escribir código):

1. **Verse** — un socket que solo lleva nombre, posición, mirada y qué arma. No puede corromper nada.
2. **Construir juntos** — retransmitir los `edits` con el servidor de árbitro. Aquí aparecen la luz
   incremental (`mcRelightBox`) y el re-mallado del chunk del vecino, que ya son incrementales y exactos:
   es la pieza que hace esto viable.
3. **Convivencia** — conflictos, permisos, quién entra, y los puntos de aparición ([REQ-SPAWN1](#-req-spawn1)).

**Criterio de cierre (fase 1):** dos navegadores en `/map/test` se ven el uno al otro moverse, con su
arma en la mano y su nombre encima, sin que ninguno de los dos note que los fps bajan.

**Criterio de cierre (el ticket entero):** 10 jugadores en el mismo mapa por internet, construyendo a la
vez; lo que pone uno lo ve el otro, y al cerrar todos y volver a abrir el mundo está como lo dejaron —
sin que ninguna edición se haya perdido por el camino.

---

<a id="-bug-vid1"></a>

### BUG-VID1 · un vídeo muy corto se guarda con 0 bytes — 🔴 abierto 2026-08-20

**Palabras del dueño** (nota de `/map/bugfinder2` en `38,14,76`): «al intentar grabar un video muy
corto, se ha guardado como 0 bytes en el servidor, a pesar de que dice que dura 0.1s».

**Reproducido sin tocar nada**, está en el disco:

| fichero | tamaño | `duracion` de su ficha |
|---|---|---|
| `data/videos/0001_bugfinder2_20260820-121514.mp4` | **0 B** | 0.05 s |
| `data/videos/0002_bugfinder2_20260820-121616.mp4` | **0 B** | 0.05 s |
| `data/videos/0003_bugfinder2_20260820-121700.mp4` | 1,2 MB | (bien) |

Y las fichas de los dos primeros lo dicen a la cara: `"bytes": 0`.

**Son dos fallos encadenados, uno a cada lado:**

1. **Navegador** — `mcIniciarGrabacion` (`app.js:17868`) arranca con `mcMediaRecorder.start(100)`:
   el `MediaRecorder` suelta un trozo **cada 100 ms**. Parar a los 50 ms ⇒ `ondataavailable`
   (`app.js:17855`) no llega a correr ni una vez ⇒ `mcVideoChunks` vacío ⇒ `Blob` de tamaño 0. La
   duración que se enseña sale de `performance.now()`, no del vídeo, y por eso dice «0.1 s» de algo
   que no existe.
2. **Servidor** — `POST /api/videos` (`server.py:825`) valida `if not isinstance(vid, str) or not vid`
   **antes** de quitarle el prefijo `data:`. Un `data:video/mp4;base64,` con la carga vacía es una
   cadena no vacía ⇒ pasa el filtro, `b64decode('')` devuelve `b''`, y se escribe el fichero de 0 B
   con su ficha al lado. La comprobación tiene que ser sobre `crudo`, después de decodificar.

**Criterio de cierre:** parar la grabación antes de que haya un solo fotograma avisa («clip demasiado
corto») y **no** deja fichero; y un `POST /api/videos` con carga vacía contesta 400 en vez de crear un
0 B. Los dos `.mp4` vacíos que ya están en `data/videos/` los borra el dueño desde `/videos`, no yo.

---

<a id="-bug-ranura2"></a>

### BUG-RANURA2 · con un recorte cargado, 1-9 repinta el recorte en vez de elegir bloque — 🔴 abierto 2026-08-20

**Palabras del dueño** (nota de `/map/bugfinder2` en `69,14,59`): «cuando elijo un conjunto de bloques
con "k" y la herramienta de construir (pico), si luego cambio de ranura ej pulsando "1" se ha de elegir
ese bloque para construir; no reemplazar los bloques de la estructura seleccionada por bloques de esa
ranura nueva elegida».

**Localizado.** El repintado no es un accidente: se escribió a propósito para el Ctrl+V y está
razonado en el comentario de `app.js:15999` — sin él, el número caía en `mcSelectFill` y le cambiaba el
material a la selección de atrás, «lo de su espalda», que ya no es la caja que ve. Y el commit de
[REQ-RANURA1](PLAN_ARCHIVO.md#-req-ranura1) (`dcfabf7`, 2026-08-20) presume justo de eso: armar un
recorte = ponerlo en `clipboard` y llamar a `mcPasteWorld()`, y de ahí salen «gratis» las 24 posturas,
el plantado con el derecho **y el material con 1-9**.

El precio de esa herencia es este ticket: `mcPasteMaterial` (`app.js:16003`) dispara mirando **solo**
`mc.pasteActive`, sin preguntar qué herramienta hay en la mano, y quien llama es la línea
`app.js:20998`:

```js
if(i<mc.hotbar.length){ if(e.altKey) mcOpenPicker(i); else { mc.sel=i; mcSelectSlot(); if(!mcPasteMaterial(i)) mcSelectFill(i); } }
```

⚠️ **No es «quitar el repintado»**: en el Ctrl+V lo quiere. Lo que hay que acotar es **cuándo** se
repinta y cuándo el número es simplemente cambiar de ranura. Preguntarle si la línea que separa los dos
casos es la herramienta (pico ⇒ elegir bloque) o el origen del cúmulo (recorte de `K` ⇒ elegir bloque,
Ctrl+V ⇒ repintar), porque no son la misma regla y él ha descrito solo el primer caso.

**Criterio de cierre:** con el recorte de `K` cargado y el pico en la mano, pulsar `1` cambia el bloque
de construcción y **el recorte no cambia de material**; con Ctrl+V, `1` sigue repintando el cúmulo como
hasta ahora (`tests/test_ranura1_recortes.js` en verde).

---

<a id="-bug-glow9"></a>

### BUG-GLOW9 · las estrellas ni parecen emisivas ni las tapa la niebla — 🔴 abierto 2026-08-20

**Dos notas del dueño en `/map/bugfinder2`, sobre lo mismo:**

- `51,14,58`: «aunque ponga efecto de niebla, se siguen viendo las estrellas en el cielo, ademas se
  nota que son voxels, teoricamente son autoiluminadas, no deberian verse como puntitos oscuros, a lo
  sumo puntos luminosos si se hace bien y sin trucos ya que son emisivas de luz».
- `37,39,62` (puesta arriba del todo, `y=39`, al lado de las estrellas): «Estas estrellas no parecen
  autoiluminadas».

**Son tres quejas, y conviene no mezclarlas:**

1. **La niebla no las toca — y eso está escrito a propósito.** `mcDrawVoxUI` (`app.js:14026`) dibuja
   la capa VIVA con `uFogNear = pj.far*8`, `uFogFar = pj.far*10` y `aEmit = 1.0`, y el comentario de
   `app.js:14049` dice literalmente que con `emit=1` «la niebla sale 0», que es «lo que quieren las
   estrellas de la capa viva». O sea: **es una decisión que él quiere revisar**, no un descuido.
   Preguntarle qué quiere exactamente — ¿que la niebla las apague, o que se apaguen solo con la niebla
   de `game.niebla` y no con la del agua?
2. **«Se nota que son voxels».** Una estrella es **un voxel fino** y `game.voxelesUI.grosor` la
   engorda; a `grosor 16` es un bloque entero en el cielo. Hay que medir con qué grosor las está
   viendo antes de tocar nada.
3. **«Puntitos oscuros».** Ésta es la que no cuadra con el código y la que hay que reproducir primero:
   con `aEmit=1` deberían salir a pleno color. Sospechas sin comprobar: `mc.voxUIAlfa < 1` mezcla la
   estrella con el cielo (`app.js:14039`, `blendFunc(CONSTANT_ALPHA, …)`), o las está viendo por la
   capa **horneada** (`mc.voxFino`), que sí va con `aEmit = 0.0` y niebla normal (`app.js:14052`) —
   y ésa sí saldría oscura.

Vecino de [REQ-GLOW5](#-req-glow5) (declarar emisivo un voxel de `game.voxelesUI` con el prefijo `*`),
que probablemente sea media respuesta a la queja 3.

**Criterio de cierre:** una captura de noche con niebla puesta, y él diciendo que las estrellas se ven
como quiere. Sin su visto bueno esto no se cierra: es un juicio suyo, no una medida.

---

<a id="-req-glow10"></a>

### REQ-GLOW10 · el brillo de los emisivos debe adaptarse a la luz ambiente — 🔴 abierto 2026-08-20

**Palabras del dueño** (nota de `/map/bugfinder2` en `51,14,64`): «la iluminacion de las herramientas,
voxels emisivos, deben ser más brillantes cuando las condiciones de luz son bajas, han de ser
adaptativos. Ej: de noche esta bien que brillen, de dia no hace falta que brillen tanto. que sea un
tunnable, que se pueda elegir el brillo maximo tmb».

**Redactado, sin investigar.** Pide **dos** mandos: la adaptación (cuánto sube el brillo al bajar la
luz) y el **brillo máximo**.

⚠️ **No empezar esto antes de cerrar [BUG-GLOW8](#-bug-glow8)**: ahí se está decidiendo cómo se dibuja
la luz de un emisivo en la mano, y este ticket es un tunable **encima** de eso. Hacerlos a la vez
significa retocar dos veces la misma fórmula.

---

<a id="-bug-sel5"></a>

### BUG-SEL5 · Ctrl+Z en selección deja los corchetes sin revertir — 🔴 abierto 2026-08-20

**Palabras del dueño** (nota de `/map/bugfinder2` en `70,14,30`): «en seleccion control+z va bien pero
deja los corchetes sin revertir, esos tambien deberian de volver a la posicion previa del historial
como sí hacen los bloques».

**Redactado, sin investigar.** Los bloques vuelven bien, luego el historial por gesto funciona; lo que
no entra en el gesto es **la caja de selección** (los corchetes). Dicho de otro modo: la posición de la
selección debería ser parte de lo que se guarda y se restaura, no solo el contenido.

**Criterio de cierre:** mover la selección, editar, Ctrl+Z → los corchetes vuelven a donde estaban a la
vez que los bloques, sin un repintado de más.

---

<a id="-bug-sel3"></a>

### BUG-SEL3 · rotar una selección no rota las piezas finas u orientadas — 🔴 abierto 2026-08-20

**Palabras del dueño** (nota de `/map/bugfinder2` en `48,14,11`): «Cuando se rotan selecciones, se han
de rotar tambien las posiciones de las estructuras finas o con huecos localmente, ya que por ejemplo,
si se selecciona una puerta con su marco, el marco si son bloques quedan bien, pero la puerta no rota
y se sale del marco».

Son **dos giros distintos** y hoy solo se aplica uno: el de la **caja** (dónde cae cada celda) sí, el
**local de cada pieza** (hacia dónde mira la puerta) no. Por eso el marco —bloques macizos, sin
orientación— aguanta y la puerta se desencaja.

⛔ **Ojo al tocarlo**: las 24 posturas **se derivan de la clave** (`flor@7`) y se decodifican con
`mcOriNorm` / `mcOriParts` — nada de `(rot|0)&15` (ver BUG-RS7, BUG-RS8, BUG-ROT2 en el archivo).

**Criterio de cierre:** el ejemplo que él da — seleccionar puerta + marco, rotar, y la puerta sigue en
su hueco mirando a donde toca. Vale como test automático.

---

<a id="-req-sel4"></a>

### REQ-SEL4 · `r` gira en horizontal y `R` en profundidad — 🔴 abierto 2026-08-20

**Palabras del dueño** (nota de `/map/bugfinder2` en `71,14,27`): «seleccion y "r" deberia de rotar en
el plano horizontal (eje de giro vertical), y "R" en el plano profundidad. se limitaria entonces a 4
horizontal x 4 profundidad, asi se puede con "r" abrir una ventana de bloques, o con "R" levantar una
cornisa».

Hermano de [BUG-SEL3](#-bug-sel3): el mismo giro, visto desde el mando en vez de desde la pieza. El
**4×4 = 16** que él describe encaja con las 24 posturas que ya existen (`mcOriNorm`), así que casi
seguro no hay que inventar geometría nueva, solo atar las dos teclas a los dos ejes.

**Redactado, sin investigar.** Conviene hacerlo **después** de BUG-SEL3, o se estará girando bien una
caja cuyo contenido aún no gira.

---

<a id="-req-sel6"></a>

### REQ-SEL6 · ver el pivote de la selección sin pulsar Ctrl — 🔴 abierto 2026-08-20

**Palabras del dueño** (nota de `/map/bugfinder2` en `72,14,38`): «cuando se seleccionan los bloques,
deberia de verse de alguna forma cual es el pivote sin necesidad de pulsar control y apuntar, ya que en
el momento en el que se pulsa cambia al apuntado; hay que conocerlo antes».

El problema es que el único modo de **ver** el pivote es el mismo gesto que lo **cambia** — mirarlo ya
lo mueve. Hace falta que se vea en reposo.

**Redactado, sin investigar.** Si acaba siendo un adorno que se dibuja cada frame, mirar
`game.voxelesUI` antes que el overlay ([BUG-VOXUI1](PLAN_ARCHIVO.md#-bug-voxui1): el translúcido del
overlay no escribe z).

---

<a id="-req-sel2"></a>

### REQ-SEL2 · copiar/pegar debe llevarse el redstone pegado a las caras — 🔴 abierto 2026-08-20

**Palabras del dueño** (nota de `/map/bugfinder2` en `41,14,38`): «la herramienta de seleccion cuando
hace copia y pega deberia comprobar si hay elementos redstone pegados a la superficie de los bloques a
copiar, en tal caso, copiarlos tambien ya que son dificiles de seleccionar».

El motivo que da es de manejo, no de modelo: una palanca o un cable pegado a una cara es **difícil de
meter en la caja** a mano, y al pegar el resultado llega desnudo.

Toca la misma frontera que [BUG-RS10](#-bug-rs10): el portapapeles trabaja sobre `mc.grid` y el redstone
adherido vive en `mc.structures`. Cerrar uno de los dos abarata el otro.

**Redactado, sin investigar.** Preguntarle si quiere que sea **siempre** o un modificador, porque
«copiar lo que no seleccioné» sorprende a quien no lo espera.

---

<a id="-req-tool9"></a>

### REQ-TOOL9 · elegir qué herramientas entran con `e` y cuáles con `E` — 🔴 abierto 2026-08-20

**Palabras del dueño** (nota de `/map/bugfinder2` en `55,14,10`): «cambiar el orden de las herramientas
empieza a ser algo habitual, se deberia poder elegir que herramientas entran con "e" y cuales con "E"
desde el editor. Separar categorias en "herramientas primarias" y "herramientas secundarias"».

Lo importante de la nota es la primera frase: **el orden ya se lo cambia a menudo a mano**, y eso es lo
que quiere dejar de hacer.

**Redactado, sin investigar.** Ojo con la palabra «herramientas»: en el panel del editor las hay de
**dibujo** y de **vista**, y no son la misma familia (mismo tropiezo que en [REQ-ED3](#-req-ed3)).
Aclarar con él a cuáles se refiere antes de empezar.

---

<a id="-req-cart7"></a>

### REQ-CART7 · elegir el tipo de cartel de una nota — 🔴 abierto 2026-08-20

**Palabras del dueño** (nota de `/map/bugfinder2` en `45,14,43`): «feature nueva: poder elegir entre
diferentes carteles para las notas. La idea es que se elija el tipo de cartel desde el editor de notas,
deberia de haber algun sitio donde se definan los carteles. Propongo: categoria "Cartel de Notas" ya
que son elementos especiales».

Trae la puerta ya propuesta por él: una **categoría propia en la galería**, «Cartel de Notas», como
tienen los habitantes y las habitaciones.

Encaja bien con lo que se acaba de cerrar en [BUG-CART1](#-bug-cart1): los carteles **se derivan** de
`mc.notes` al cargar y ya **no** se guardan en `mundo.json`. Luego el tipo de cartel es un dato **de la
nota**, no un voxel del mundo — y ahí es donde debe guardarse, junto a `noteRots` / `noteTints`.

**Criterio de cierre:** dos notas del mismo mundo con carteles distintos, guardar, recargar, y siguen
distintas — sin que aparezca ni un voxel de cartel en `mundo.json`
(`herramientas/carteles_fantasma.py` en cero).

---

<a id="-req-fx1"></a>

### REQ-FX1 · temblor de cámara al caer desde alto — 🟢 abierto 2026-08-20

**Palabras del dueño** (nota de `/map/bugfinder2` en `45,14,50`): «Al caer desde una gran atura,
pongamos que 15 bloques o más, deberia de haber algun efecto de temblor en la escena; que sea un
tunable ajustable la altura, aplitud del temblor y duracion».

Tres tunables, dichos por él: **altura** a partir de la cual tiembla, **amplitud** y **duración**.

**Redactado, sin investigar.** El sitio natural es el aterrizaje que ya conoce `mcCaidaPaso` — que es
**la** pieza por la que pasan el jugador y los dos integradores del snippet, así que la altura de caída
ya está a mano ahí. ⛔ Y por lo mismo, ojo: si se la envuelve hay que pasarle **todos** los argumentos
(comerse el 6º apaga el nadar, el 7º la mirada, sin fallar nada).

Verde y no rojo porque es adorno: no rompe nada mientras no exista.

---

## Backlog Mundo (REQ-MC) · Olas B y C — pendiente

### 🖱️ Ola B · Input / UX (bajo–medio, alto valor diario)
- ✅ **t9 · construir con mousedown mantenido** — hecho (Ola 1: `MC_ACT_MS=140ms`, `mc.heldBtn`/`mc.actAt`).
- ✅ **t11 · auto pointer-lock al moverse con WASD sin foco** — hecho (Ola 1/F4).
- ✅ **t5 · galería: bloques más pequeños + ventana más grande** — hecho (Ola 1, CSS `.mc-picker`).
- ✅ **t12 · indicador de carga del mundo** — hecho (overlay `#mc-loading` con spinner + fases; `mcYield` deja pintar antes del horneado).
- ✅ **t4 · z=undo / Z=redo en el Mundo** — hecho (pila `mc.hist`/`histRedo`; registra romper/poner/pintar/estampar/retirar).

### 🧩 Ola C · Sistemas nuevos (medio–alto, decisiones de arquitectura)
- ❌ **t6 · tecla C: bloque en el aire a la altura del suelo del jugador** (M) — descartado 2026-07-22 (el modo «big» / `game.playerScale`, tecla b, ya cubre estos usos: puentes/estructuras lejanas).
- ✅ **t1 · notas post-it en un bloque** (M–L) — hecho 2026-07-22 (tecla N: crear/ver/editar; marcador flotante + texto al mirar; persiste en `mundo.json`).
- ✅ **t7 · iluminación interior más oscura (pasillos) automática** — hecho 2026-07-22 (oclusión por techo en el meshing; `game.interiorDark`).
- ✅ **t8 · límites del mundo modificables en vivo** — hecho 2026-07-22 (`mcResizeWorld` / `game.resizeWorld(x,y,z)` + `game.worldSize`).

---

## 🔴 Redstone (REQ-RS) — en curso 2026-08-05

**Petición del dueño:** «quiero que todo lo de redstone vaya en ficheros aparte aunque luego sean
llamadas desde otros de scripting para que sea más fácil mantenerlo». De ahí `redstone/`, con los `.js`
como fuente y `redstone/make_snippets.js` publicándolos en `data/snippets/`. El precedente de que un
snippet cargue a otro ya existía (`agente-nube` lo hace por `/api/snippets/<id>`).

**Las tres decisiones de arquitectura** (del dueño, contra un primer boceto de clase por voxel):
1. **Una instancia por voxel no cabe** — 96×48×96 = 442 368 celdas. El comportamiento cuelga del
   **material** (una entrada por tipo, como `game.bloques`); lo único por celda es el nivel de señal,
   en un `Map` **disperso**. Un mundo sin redstone gasta cero.
2. **La vecindad es una COLA**, no una llamada recursiva: un cable largo en recursión se come el
   frame y un anillo cuelga. Se drena en el `rAF` con tope por pasada.
3. **Encendida y apagada son DOS MATERIALES** (como `redstone_lamp`/`lit_redstone_lamp`), dados de
   alta en `define()` y no al encenderse: dar de alta un material cuesta ~3 873 ms en 512×40×512.

**Orden acordado:** luces de rejilla → señal → cable.

- ✅ **rs1 · luces de rejilla** — ya estaba hecho (el arreglo de la antorcha: una pieza fina en
  `mc.grid` siembra luz por `mc._glowCeldas`). Encender = cambiar el id de la celda, y la luz va
  detrás sola porque `mcSetBlock` → `mcGlowTocada` → `mcComputeBlockLight`. Guardado por
  `test_luz_en_rejilla.js`.
- ✅ **rs2 · señal y propagación** — `redstone/redstone.js` (`r1.0`). `game.redstone.define/quitar/
  lista/info/revisar/tick/revisarCaja`. Se engancha envolviendo `mcSetBlock`, que es el embudo de
  poner/romper/pintar/deshacer/`setVoxel`; el envoltorio se desenvuelve por `_orig` al reejecutar en
  vez de apilarse. Sin materiales declarados sale por `hayCircuito` y no cuesta nada.
  Demo pedida por el dueño (**«una antorcha que siempre esté apagada y que al ponerle un bloque de
  redstone se encienda, hazlo en el mapa test»**): `redstone/redstone-demo-antorcha.js` +
  `data/habitantes/antorcha-apagada.json` (copia de `antorcha.json` sin los 12 voxels emisores; la
  original **no se toca**). Verificado con `test_redstone_antorcha.js` (20 ok).
  Dos fallos encontrados al montarla, los dos de ida y vuelta:
  · `define()` no registraba la **variante encendida** en la tabla → al cambiar de material la celda
  dejaba de ser circuito y la antorcha no se apagaba nunca. Ahora entra como alias de la misma cfg.
  · `hayCircuito` se declaraba **después** del envoltorio que lo lee: funcionaba de casualidad por el
  izado de `var` (valía `undefined`, o sea falso).
- ✅ **rs2b · que se cargue solo** (pedido por el dueño: «me gustaría que por defecto todo lo de
  redstone se cargue solo»). `redstone/redstone-arranque.js` + `make_snippets.js` parchea
  `mundo-autoarranque` entre marcadores (idempotente, sin reescribir el fichero del dueño). Como pasa
  a correr en **todos los mapas**, lo que costaba poco tuvo que pasar a costar **nada**: circuitos de
  serie con `precargar:false` (+ carga perezosa al primer encendido), `encolarVecinos` filtrando antes
  de encolar (1000 `setVoxel` = 3,8 ms y cola vacía) y `repasarMundo()` con guarda por paleta.
  Verificado con `test_redstone_arranque.js` (20 ok) y, por ser el guardián del autoarranque,
  `test_bloques_comportamiento.js` (373 ok), más `test_luz_incremental_navegador.js` (19 ok) y
  `test_setvoxel_autocarga.js` (21 ok).
- ✅ **rs3 · cable y las piezas** (`r1.1`) — pedido del dueño: **«si de paso creas algún nuevo
  componente redstone mejor, me faltan cables, placas de presión, puertas e interruptores»**. El cable
  es lo que se dijo: `max(vecinos) − perdida` dentro de `señalQueLlega()`, sin que el resto se entere.
  Las cinco piezas (cable, palanca, placa, puerta, repetidor) viven en `redstone/redstone-piezas.js` y
  son **combinaciones** del vocabulario, no motor: `redstone-piezas.js` no añade ni una línea a
  `app.js` — la física sale de `game.bloques` (`atravesable`, `alPisar`, v1.29) y el clic derecho de un
  envoltorio de `mcUseRight` dentro del propio snippet. Los 10 dibujos los genera
  `redstone/make_piezas.py` (nunca pisa un fichero existente sin `--forzar`).
  Al motor solo le hicieron falta **dos ideas nuevas**, y son justo las que faltaban para que el
  sistema sea Turing-completo: `retardo` (TIEMPO: la realimentación deja de ser un bucle combinacional
  y pasa a ser un **reloj**) y `manual` (ENTRADA: la celda la pone el jugador, no la señal). Más
  `pulso` (la placa se suelta sola) y `mira` (escuchar solo por la espalda, con el lado sacado del
  giro de la clave), que es **lo que hace posible la memoria**: sin él un anillo de inversores se
  realimenta a sí mismo y oscila en vez de acordarse.
  Verificado con `test_redstone_dsl.js` (29 ok, incluido un biestable con SET/RESET que sobrevive a
  que le quiten la fuente) + `test_redstone_antorcha.js` (20 ok) y `test_redstone_arranque.js` (20 ok).
  Dos fallos encontrados al montarlo:
  · una pieza **recién puesta** se quedaba apagada: el atajo «nivel igual → nada que hacer» comparaba
  solo la señal, y lo que había cambiado era el otro lado de la ecuación (el material). Arreglado con
  el conjunto `estrenadas`, que también tuvo que colarse por delante del dedup de `retardo`.
  · al encenderse, una pieza girada se **enderezaba sola** y dejaba de escuchar por donde escuchaba:
  ahora `aplicar()` arrastra el giro y `encendidaEn()` compara por base.

---

## ⚡ Rendimiento de estructuras (PERF-MC) — diagnóstico 2026-07-22

**Diagnóstico (medido, DevTools CERRADO, RTX 4070):** pegado a una pared de una estructura el contador daba
**893 689 vox** a 93 fps; mirando al cielo caía a ~8 k. El terreno plano completo son ~24 k caras → el grueso
son las **estructuras estampadas** (mallas finas 1/16: Taberna ~119 720 + Herrería ~99 016). Causas:
1. **Sin occlusion culling**: la pared de delante tapa el 99% pero el motor dibuja la estructura entera (interior
   + paredes del fondo) y el depth-test la descarta *después* de procesarla -> overdraw tirado.
2. **Sin sub-chunk culling**: cada estructura es **un solo AABB grueso** (`mcChunkVisible`); o entra toda o nada.
3. **Malla cara a cara**: una pared lisa son miles de cuadraditos 1/16 en vez de un punado de quads.
(Nota aparte: medir con DevTools ABIERTO capaba de 93->47 fps; artefacto de medicion, no del motor.)

### 🟨 PERF-MC1 · Greedy meshing de estructuras — 🟨 wip (2026-07-22)
Fusiona caras coplanares del mismo material (misma textura+cara, o mismo color+cara) en rectangulos maximales
-> una pared lisa pasa de miles de caras a unos pocos quads. **Sin perder el pixel-art**: el tile se **repite por
voxel** en el shader (`fract`), no se estira. Shader propio `mc.stexProg` (aPos/aTile/aRect/aShade, stride 10,
`highp` para no perder precision en paredes grandes/movil). Los `#hex` (color plano) tambien se fusionan por
color+cara (`mc.structProg`). Switch `game.structGreedy` (def **true**; false = una cara por voxel, como antes)
re-malla en vivo y persiste (`vf_mcStructGreedy`) -> escape si algo se viera raro. Non-greedy usa el MISMO
layout/shader (solo cambia si fusiona) => el switch no puede descuadrar el VBO. **Pendiente**: verificacion visual
en navegador (Taberna/Herreria con textura completa por voxel, sin costuras; `game.voxels` cae mucho pegado a
una pared; `game.structGreedy=false` recupera el render actual).

## Bitácora

La bitácora completa (desde 2026-07-21) se movió a
[`PLAN_ARCHIVO.md`](PLAN_ARCHIVO.md#-bitacora) el 2026-08-18: es narración de trabajo **ya
cerrado** y ocupaba el 80 % de este fichero. Lo pendiente del Mundo sigue aquí arriba, en
[Backlog Mundo (REQ-MC)](#backlog-mundo-req-mc--olas-b-y-c--pendiente).
