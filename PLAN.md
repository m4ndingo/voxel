# PLAN · VoxelForge → Juego RPG\r
\r
Plan de construcción del modo juego sobre el editor actual. Se avanza de lo más sencillo a lo\r
más complejo; cada fase es demostrable por sí sola. Estados: `⬜ todo` · `🟨 wip` · `✅ done` · `⛔ blocked`.\r

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
| [BUG-CART1](#-bug-cart1) | **carteles de nota apilados dentro de `mundo.json`**: el cartel se DERIVA de la nota y no debería guardarse nunca, pero se colaban y al cargar ya nadie los reconoce | 🟡 arreglado 2026-08-20, **falta una pasada del dueño** | encontrado tirando de un guardián en rojo, no pedido. La causa (la marca `efimera` se ponía DESPUÉS del `await` de estampar) está arreglada y el motor se cura solo en caliente. Queda lo que ya está escrito en los ficheros: `python3 herramientas/carteles_fantasma.py` (en seco) y luego `--escribe`. **No lo puedo lanzar yo**: la caja de arena me deniega escribir en `data/worlds/` |
| [REQ-MULTI1](#-req-multi1) | **multijugador colaborativo**: varios jugadores en el mismo mapa, viéndose entre sí (con el arma en la mano y su etiqueta de nombre) y con los cambios del mundo sincronizados | 🟢 abierto 2026-08-19 | pedido por el dueño el 2026-08-19 al hilo de «pisar el mundo»: si el mapa es de todos, **nadie pisa a nadie**. Es el ticket más grande del plan. **Acotado ya por él (2026-08-19)**: tope **10** jugadores de momento (idealmente sin tope), **internet y red local**, y se **juega Y se construye** a la vez. A favor: medio camino hecho sin querer — `POST /api/mundo/edits` ya manda **el delta**, no el mundo. En contra: hoy no hay proceso servidor con estado (stdlib, un `Handler` por petición), ni identidad, ni cuerpo de jugador dibujable. Construir a la vez obliga a que **el servidor sea el árbitro**, no el navegador |
| [REQ-SPAWN1](#-req-spawn1) | **pensar el tema de los puntos de aparición** (spawn) | 🟢 **propuesta escrita 2026-08-20**, esperando su visto bueno | nota del dueño en `/map/bugfinder`, tal cual: es un **encargo de pensar**, no un arreglo. Hoy hay un único `spawn` en la cabecera del mundo |
| [BUG-SEL5](#-bug-sel5) | en selección, **Z revierte los bloques pero deja los corchetes** donde estaban | 🔴 abierto 2026-08-20 | nota de `/map/bugfinder2`. La caja de selección no entra en el gesto del historial. Redactado, sin investigar | 
| [REQ-SEL6](#-req-sel6) | **ver el pivote de la selección** sin tener que pulsar Ctrl (al pulsarlo ya cambia al apuntado) | 🔴 abierto 2026-08-20 | nota de `/map/bugfinder2`: «hay que conocerlo antes». Redactado, sin investigar | 
| [REQ-SEL2](#-req-sel2) | copiar/pegar debería llevarse el **redstone pegado a la cara** de los bloques copiados | 🔴 abierto 2026-08-20 | nota de `/map/bugfinder2`: «son difíciles de seleccionar». Toca la frontera `mc.grid` ↔ `mc.structures`, la misma que [BUG-RS10](#-bug-rs10) | 
| [REQ-TOOL9](#-req-tool9) | poder **elegir qué herramientas entran con `e` y cuáles con `E`** desde el editor (primarias / secundarias) | 🔴 abierto 2026-08-20 | nota de `/map/bugfinder2`: «cambiar el orden de las herramientas empieza a ser algo habitual». Redactado, sin investigar | 
| [REQ-CART7](#-req-cart7) | poder **elegir el tipo de cartel** de una nota desde su editor, con los carteles definidos en un sitio | 🔴 abierto 2026-08-20 | nota de `/map/bugfinder2`. Él mismo propone la puerta: categoría **«Cartel de Notas»** en la galería. Encaja con que los carteles ya **se derivan** de `mc.notes` y no viven en `mundo.json` ([BUG-CART1](#-bug-cart1)) | 
| [REQ-FX1](#-req-fx1) | **temblor de cámara al caer** desde 15 bloques o más, con altura/amplitud/duración ajustables | 🟢 abierto 2026-08-20 | nota de `/map/bugfinder2`. El sitio natural es el aterrizaje que ya detecta `mcCaidaPaso`. Redactado, sin investigar | 

---

## 🗄️ Tickets CERRADOS

El índice histórico y el detalle de todo lo cerrado viven **enteros** en
[`PLAN_ARCHIVO.md`](PLAN_ARCHIVO.md#-tickets-cerrados--archivo). Aquí no queda ni una fila:
este fichero es **solo lo abierto o pendiente** (orden del dueño, 2026-08-18).

Al cerrar un ticket: su fila **y** su sección se van al archivo de una vez.

---

## 🐛 Tickets ABIERTOS — Bugs

Errores y fallos pendientes de corrección.

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

<a id="-bug-sel5"></a>

### BUG-SEL5 · Z en selección deja los corchetes sin revertir — 🔴 abierto 2026-08-20

**Palabras del dueño** (nota de `/map/bugfinder2` en `70,14,30`): «en seleccion control+z va bien pero
deja los corchetes sin revertir, esos tambien deberian de volver a la posicion previa del historial
como sí hacen los bloques».

**Redactado, sin investigar.** Los bloques vuelven bien, luego el historial por gesto funciona; lo que
no entra en el gesto es **la caja de selección** (los corchetes). Dicho de otro modo: la posición de la
selección debería ser parte de lo que se guarda y se restaura, no solo el contenido.

**Criterio de cierre:** mover la selección, editar, Ctrl+Z → los corchetes vuelven a donde estaban a la
vez que los bloques, sin un repintado de más.

---

## 💡 Tickets ABIERTOS — Requerimientos y Mejoras

Nuevas características y peticiones de mejora pendientes.

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
**dibujo** y de **vista**, y no son la misma familia (mismo tropiezo que en [REQ-ED3](PLAN_ARCHIVO.md#-req-ed3)).
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
