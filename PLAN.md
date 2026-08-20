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
| [BUG-GLOW6](#-bug-glow6) | **la luz dinámica atraviesa los sólidos**: las estrellas alumbran cuartos cerrados y la espada alumbra al otro lado de la pared | 🔴 abierto 2026-08-19 | 6 notas del dueño en `/map/bugfinder` que son **el mismo fallo**. Investigado: las luces dinámicas (`mcDynSync` → `uDynPos`) son luces de punto del shader **sin prueba de oclusión**; la luz de bloque horneada (`mcComputeBlockLight`, BFS por el aire) sí respeta sólidos. Desde [REQ-GLOW5](#-req-glow5) las estrellas de `game.voxelesUI` entran por esa misma vía |
| [REQ-SHADOW3](#-req-shadow3) | de noche la **sombra proyectada** sale tan difuminada que casi no se ve, y no se sabe si la espada de luz proyecta la suya | 🟢 abierto 2026-08-19 | 2 notas de `/map/bugfinder`. Sin investigar. Pide mandos para las sombras, no un arreglo concreto |
| [REQ-CART5](#-req-cart5) | poder **mover una nota ya plantada**, con un botón «mover» en su propio panel | 🟢 abierto 2026-08-19 | nota de `/map/bugfinder`. Hoy una nota se planta y no se recoloca. Ojo: la nota es el dato (`mc.notes`, clave = la posición) y el cartel se DERIVA, así que mover es **cambiar de clave**, no mover el cartel |
| [REQ-RANURA1](#-req-ranura1) | **guardar la selección en una ranura** para volver a plantarla: ranura 11, tecla `K` | 🟡 abierto 2026-08-19 | nota de `/map/bugfinder`. Es una galería de recortes, no un portapapeles: pide varias guardadas y poder elegir. Roza [REQ-TOOL6/7](PLAN_ARCHIVO.md) (la rosca de ranuras) y el pegado de 24 posturas |
| [REQ-MULTI1](#-req-multi1) | **multijugador colaborativo**: varios jugadores en el mismo mapa, viéndose entre sí (con el arma en la mano y su etiqueta de nombre) y con los cambios del mundo sincronizados | 🟢 abierto 2026-08-19 | pedido por el dueño el 2026-08-19 al hilo de «pisar el mundo»: si el mapa es de todos, **nadie pisa a nadie**. Es el ticket más grande del plan. **Acotado ya por él (2026-08-19)**: tope **10** jugadores de momento (idealmente sin tope), **internet y red local**, y se **juega Y se construye** a la vez. A favor: medio camino hecho sin querer — `POST /api/mundo/edits` ya manda **el delta**, no el mundo. En contra: hoy no hay proceso servidor con estado (stdlib, un `Handler` por petición), ni identidad, ni cuerpo de jugador dibujable. Construir a la vez obliga a que **el servidor sea el árbitro**, no el navegador |
| [REQ-SPAWN1](#-req-spawn1) | **pensar el tema de los puntos de aparición** (spawn) | 🟢 abierto 2026-08-19 | nota del dueño en `/map/bugfinder`, tal cual: es un **encargo de pensar**, no un arreglo. Hoy hay un único `spawn` en la cabecera del mundo |

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

<a id="-bug-glow6"></a>

### 🔴 BUG-GLOW6 · La luz dinámica atraviesa los sólidos — 🔴 abierto 2026-08-19

Seis notas del dueño en **`/map/bugfinder`** que parecen seis cosas y son **una sola**. Verbatim, con
su coordenada:

- `45,14,69` — «*como es posible que las estrellas esten iluminando un espacio cerrado al que no llega
  la luz por ninguna esquina? no deberia llegar la luz de las estrellas a los espacios cerrados*»
- `24,14,67` — «*como es posible que en una escena oscura, si me pongo pegado a una pared con la espada
  de luz, se ilumine no solo la pared y el suelo, sino los lados de la pared que tengo delante*»
- `26,14,78` — «*como es posible que si visualmente meto la espada de luz dentro de este bloque
  acercandome a él hasta que desaparezca la espada, se ilumine fuera? no es realista*»
- `15,10,76` — «*probar game.interiorDark=0.1 aqui con la espada de luz en la mano, alumbra de forma
  confusa…*»
- `34,14,46` / `34,14,51` — «*aqui se ve mas oscuro porque hay 2 bloques*» / «*aqui solo hay un bloque
  y parece mas brillante*» (las dejó como medición: el grosor de la pared cambia lo que se cuela)

**Investigado (sin tocar nada).** Hay **dos** luces artificiales y solo una respeta la materia:

- **Horneada** — `mcComputeBlockLight()` es un BFS que se propaga **por el aire**, así que un muro la
  para. Es la de una antorcha plantada.
- **Dinámica** — `mcDynSync` mete las luces vivas en `uDynPos`/`uDynDir` (`mc._dynArr`, `MC_DYN_MAX`
  plazas, las más cercanas al ojo) y el fragmento las suma **por distancia y ángulo, sin preguntar si
  hay un sólido en medio**. No hay prueba de oclusión en ningún sitio. De ahí que atraviese la pared,
  que alumbre desde dentro de un bloque y que 2 bloques de grosor se noten menos oscuros que 1.

Las **estrellas** entran justo por ahí desde [REQ-GLOW5](#-req-glow5): `mcVoxUILuces()` convierte los
voxeles emisivos de `game.voxelesUI` en luces dinámicas (agrupadas por celda). Un cielo de estrellas es
un puñado de focos sin oclusión → se cuelan en un cuarto cerrado.

**Lo caro de decidir** no es el fallo, es el arreglo: una prueba de oclusión por fragmento y por luz es
un raycast en el shader, y el dueño manda que **no bajen los fps**. Opciones a ponderar antes de
escribir una línea: (a) sombreado barato por línea de visión muestreando la luz horneada del camino;
(b) apagar la luz dinámica cuando el sólido del ojo y el de la luz no se ven (test por celda, no por
fragmento); (c) para las estrellas, que sea suficiente el interruptor `mc.voxUILuces=false` o un
alcance corto. Preguntar antes de elegir.

**Criterio de cierre:** en un cuarto cerrado de `/map/bugfinder`, de noche, con estrellas en el cielo y
la espada de luz en la mano fuera, dentro está **oscuro**; y la espada pegada a una pared no ilumina la
cara de enfrente. Sin perder fps medidos con `game.osd`.

---

<a id="-req-shadow3"></a>

### 🟢 REQ-SHADOW3 · Las sombras de noche y las de la espada, configurables — 🟢 abierto 2026-08-19

Dos notas de **`/map/bugfinder`**:

- `34,14,59` — «*╰(*°▽°*)╯ la sombra sale muy difuminada por la noche y casi no se ve*»
- `42,14,44` — «*la espada de luz proyecta alguna sombra? no definidas pero parece que sí, aunque
  podrian estar más definidas. estaria bien configurar estas sombras*»

Sin investigar. Ojo con la confusión de siempre (`docs/luz-y-sombra.md`): la **sombra proyectada del
sol** (mapa de sombra en GPU, `game.sunShade`, `game.shadowSize`) no es la **skylight** horneada en el
vértice. La segunda nota mezcla las dos: la espada es luz **dinámica** y hoy **no proyecta sombra
ninguna** — lo que ve «poco definido» es el degradado de su propia caída, no una sombra. Aclarar eso al
contestar; si de verdad quiere sombra de la espada, eso es otra luz en el mapa de sombra y es caro.

**Criterio de cierre:** de noche la sombra del sol/luna se ve tanto como él quiera, con un mando que
persista, y está escrito en la wiki qué proyecta sombra y qué no.

---

<a id="-req-cart5"></a>

### 🟢 REQ-CART5 · Mover una nota ya plantada — 🟢 abierto 2026-08-19

Nota `57,14,58` de **`/map/bugfinder`**: «*un poco lio las notas / carteles, pero parecen ir ok. me
gustaria poder moverlas una vez plantadas, que tal un boton de "mover" dentro de la nota que me permita
reposicionarla*».

⚠️ Lo que hay que entender antes de empezar (`docs/notas-y-fuente.md`): **la nota es el dato y el cartel
se deriva**. `mc.notes` es un mapa `"x,y,z" → texto`, o sea que **la posición ES la clave**: mover una
nota es borrar una entrada y crear otra (arrastrando su tinte, `noteTints`, con la misma clave). El
cartel se replanta solo (`mcSyncNoteSigns`), no hay que tocarlo.

Y la regla de arranque: **las notas del Mundo no se reescriben**. Un «mover» que pierda el texto o el
tinte por el camino es peor que no tenerlo; que pase por el mismo sitio que hoy escribe la nota.

**Criterio de cierre:** desde el panel de una nota, botón «mover», se recoloca con la mira y al soltar
el cartel está en el sitio nuevo con su texto y su tinte, y el viejo ha desaparecido.

---

<a id="-req-ranura1"></a>

### 🟡 REQ-RANURA1 · Guardar la selección en una ranura y volver a plantarla — 🟡 abierto 2026-08-19

Nota `46,14,65` de **`/map/bugfinder`**, verbatim: «*La herramienta de seleccionar deberia poder guardar
los bloques seleccionados, de forma que desde una ranura se puedan volver a cargar. Usar la ranura 11
para ello, tecla "K" por ejemplo; alt+k o pulsar ranura "K" mostraria bloques guardados y seleccionables
para usar.*»

Ojo a lo que pide de verdad: no es un portapapeles (eso ya es Ctrl+C/Ctrl+V), es una **galería de
recortes** — varios guardados, y un desplegable para elegir cuál va en la ranura. Roza la rosca de
ranuras de REQ-TOOL6/7 y el pegado de 24 posturas de `mc.structures`.

A decidir con él antes de empezar: si los recortes **sobreviven al recargar** (¿`localStorage`, o
ficheros como los habitantes?) y si son del mundo o del usuario. Sin eso, el ticket no se puede cerrar
bien.

**Criterio de cierre:** seleccionar → `K` guarda el recorte; Alt+K enseña los guardados; elegir uno lo
deja en la ranura 11 listo para plantar con las 24 posturas, como cualquier estructura.

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
