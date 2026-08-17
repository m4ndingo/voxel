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
