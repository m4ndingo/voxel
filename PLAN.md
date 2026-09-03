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
| [BUG-SNP4](#-bug-snp4) | los cambios hechos en el **editor de código del Mundo se revierten** al volver al mapa y reabrirlo | 🔴 abierto 2026-08-11 | **Redactado, sin investigar.** Sospecha (sin comprobar): el snippet tiene **dos copias vivas** y al reabrir el editor se relee la que se cargó al abrir el Mundo, no la editada. Ojo: el dueño dice **Ctrl+C**, `CLAUDE.md` documenta **Alt+C** |
| [BUG-SNP8](#-bug-snp8) | el **nombre corto** que promete la ficha de un asset (`espada`) **no activa** su comportamiento: `game.bloques.define` obliga a escribir la clave entera | 🟢 hecho 2026-09-03, falta que el dueño lo mire | `resolver()` se fabricaba su propio nombre corto partiendo la clave por `:` y `/` (⇒ `espada-de-diamante`) y **nunca miraba `assets/index.json`**. Ahora pregunta al motor (`mcClaveDeNombre`) y **solo acepta la respuesta si está en la paleta**, porque el motor contesta `hab:<lo que sea>` a cualquier errata. Guardián `tests/test_alias_bloques.js` |
| [REQ-RS11](#-req-rs11) | las piezas de redstone viven mezcladas con los dibujos del dueño en `data/habitantes/`: **carpeta propia**, sin romper `hab:` | 🟡 abierto 2026-08-07 | ya viajan con el repo (excepciones en `.gitignore`); lo que falta es **separarlas** — el namespace tendría que servirse desde dos carpetas. **Sin investigar a fondo** |
| [REQ-MULTI1](#-req-multi1) | **multijugador colaborativo**: varios jugadores en el mismo mapa, viéndose entre sí (con el arma en la mano y su etiqueta de nombre) y con los cambios del mundo sincronizados | 🟢 abierto 2026-08-19 | pedido por el dueño el 2026-08-19 al hilo de «pisar el mundo»: si el mapa es de todos, **nadie pisa a nadie**. Es el ticket más grande del plan. **Acotado ya por él (2026-08-19)**: tope **10** jugadores de momento (idealmente sin tope), **internet y red local**, y se **juega Y se construye** a la vez. A favor: medio camino hecho sin querer — `POST /api/mundo/edits` ya manda **el delta**, no el mundo. En contra: hoy no hay proceso servidor con estado (stdlib, un `Handler` por petición), ni identidad, ni cuerpo de jugador dibujable. Construir a la vez obliga a que **el servidor sea el árbitro**, no el navegador |
| [REQ-MUNDOS1](#-req-mundos1) | en `/map` **no se ve de quién es cada mapa ni qué permisos tiene**, y no se puede **borrar** ninguno | 🔴 abierto 2026-09-02 | **la API ya lo da todo**: `/api/mundos` devuelve `dueno`/`visibilidad`/`escritura` (server.py) y `DELETE /api/mundos/<slug>` existe con sus permisos (F3.3). Lo que falta es **sólo `web/mapas.html`** — pintarlo y poner el Borrar en el menú del botón derecho |
| [REQ-ASSET1](#-req-asset1) | un usuario recién creado ve en las ranuras los assets **`hab:` del dueño**; debería ver los suyos y los del mundo | 🟢 hecho 2026-09-03, falta que el dueño lo mire | **fases 1 y 2 cerradas**: el documento nace con `autor` dentro (`servidor/autoria.py`) y `GET /api/habitantes` devuelve **lo mío + lo del mundo**. Los 26 heredados: 17 marcados «del mundo» por `herramientas/adopta_habitantes.py` (los que están estampados en mundos/snippets) y 9 privados del dueño. Guardián `tests/test_autoria_habitantes.js`. **Fase 3** (enviar/pedir, mensajería) sigue sin diseñar |
| [REQ-MULTI2](#-req-multi2) | **invitar debería encender solo el modo colaborativo** en ese mapa, para el que invita y para el invitado | 🔴 abierto 2026-09-02 | hoy multi **sólo arranca si alguien carga el snippet `multi-verse` a mano**: crear un mundo e invitar no lo enciende. El vale de invitación ya existe (F5.6) — falta que **invitar marque el mapa** y que el arranque del mapa lo lea. Continúa [REQ-MULTI1](#-req-multi1) |
| [REQ-MULTI3](#-req-multi3) | el menú de pausa gana **MULTIJUGADOR** (activar/desactivar + INVITAR dentro), un **jugador normal** puede encenderlo, y al invitar quedan dentro **los dos** | 🟢 hecho 2026-09-03, falta que el dueño lo mire | no faltaba permiso (`jugador` ya trae `multi.entrar`/`multi.invitar`): faltaba **credencial**. `entra()` pedía el **secreto del árbitro**, que es del servidor entero y no de un jugador; ahora el menú se firma un **vale de su propio mapa** con `POST /api/invitaciones` y `entra()` no pregunta nada. **0 líneas de `app.js` y 0 de `multi-verse`**: todo en `menu-juego` v1.3. Segundo fallo, este de despliegue: el árbitro del 8510 llevaba desde el 2026-08-28 arrancado a mano **sin `VOXELFORGE_SECRETO_SESION`** ⇒ se inventaba un secreto volátil y **no verificaba ningún vale** (401, «secreto malo»). Reiniciado con el secreto del sitio; ⚠️ a mano, **no sobrevive a un reinicio de la máquina** |
| [REQ-EXTRU6](#-req-extru6) | Ctrl/Shift+rueda **machaca los bloques del otro lado** en vez de empujarlos | 🔴 abierto 2026-09-02 | ⚠️ **la guarda de «no pisar» está COMENTADA en `mcSelExtruir`** (`web/app.js:17408`), así que hoy pisa a propósito. Ojo al invariante del dueño ya escrito ahí: *«un wup seguido de un wdown debería dejar los bloques iguales»* — empujar y luego cavar **no** los devuelve. **Por parcheo en caliente** (orden del dueño) |
| [REQ-PLANT1](#-req-plant1) | crear un mapa **siempre empieza vacío**: falta un carrusel de **fichas con foto** (biomas ya hechos, «solo terreno base», «mapa vacío») y ajustes previos de tamaño y ambiente | 🔴 abierto 2026-09-02 | **los generadores ya existen y ya se autoejecutan** (`construye-badlands`, `-oceanos-y-playas`, `-monta-as`, `-fortnite-chapter-2-island`, `-fornite-tilted-towers`) y **ya aceptan `options` con `mapWidth/mapHeight/mapDepth`** ⇒ el «personalizar antes de generar» es exponer lo que ya hay. `POST /api/mundos/crear` **ignora la plantilla** y escribe `DEFAULT_WORLD` a secas (server.py:2037). ⚠️ **la cuota se cobra por 96³ y el generador redimensiona a 128³ o 512³** |
| [REQ-PLANT2](#-req-plant2) | **gestionar las fichas** del carrusel: asociar la foto, cambiar los metadatos y tener las imágenes en una **zona segura** | 🟢 hecho 2026-09-02, a falta de que el dueño lo mire | pestaña **Plantillas** en `web/panel.html` + `game.fichas.retrato()` para sacar la foto **desde dentro del juego**. La foto se resuelve **contra el disco**: si desaparece, la tarjeta vuelve a su marcador y no se rompe nada. Continúa [REQ-PLANT1](#-req-plant1) |
| [REQ-PLANT3](#-req-plant3) | el panel de plantillas **no explica cómo se da de alta una nueva ni cómo se quita una**, y quitar no se podía | 🟢 hecho 2026-09-02 | no hay catálogo que mantener: el carrusel **es** los snippets con una `ficha` dentro ⇒ el alta es publicar el generador con su ficha, y la baja es la marca **`oculta`** (⛔ no borra nada: el generador sigue vivo y vuelve con un botón). El panel lo explica y de paso edita `lado`/`ladoMax`. Guardián `tests/test_plantillas_alta_baja.js`. Continúa [REQ-PLANT2](#-req-plant2) |
| [BUG-PLANT4](#-bug-plant4) | tres pegas de camino a crear un mundo: la portada crea con un **`prompt()`** y el mapa sale **vacío**; elegir plantilla **no lleva el foco** al nombre; el mensaje de error de CREAR **empuja el asistente hacia arriba** | 🟢 hecho 2026-09-03, falta que el dueño lo mire | las tres son la misma raíz: la portada creaba mundos por su cuenta en vez de mandar al único sitio que sabe hacerlo. Ahora «Crear un mundo» es un `<a href="/map?nuevo=1">` al asistente de [REQ-PLANT1](#-req-plant1). Lo caro era el tercero: el error vivía **en el flujo** del pie con `min-height` de una línea y el texto lo escribe el SERVIDOR ⇒ 39 px de salto con la frase de la cuota. Guardián `tests/test_asistente_ui.js` |
| [BUG-PERF4](#-bug-perf4) | **caída de FPS en `/map/default`** (12,3 → 8,2 fps medidos por el dueño con `game.perfDump()`) | 🟡 investigado 2026-09-03, sin tocar nada | **no es JS** (el propio volcado del dueño: ~4 ms de JS en frames de 81-122 ms) sino la tubería de GL. Medido: **1 130 draws y 10,2 M vértices por frame**, de los que **`mcRenderRefl` pone 770 draws (68 %) y 5,1 M vértices (50 %)** — la pasada de reflejo dibuja la escena ENTERA otra vez en un FBO de 512². Pendiente de decisión del dueño |
| [REQ-ICON2](#-req-icon2) | las miniaturas de ranuras y galerías salen **siempre en la misma postura**, que deja de espaldas la cara de un personaje; falta un botón para **girarlas en horizontal** | 🔴 abierto 2026-09-02 | **el giro ya existe en el motor y la miniatura lo tira**: `renderIso` recibe `rot` y `drawThumb` (`web/app.js:1952`) le pasa **`0` a pelo**. Todo pasa por ahí (13 llamadas + `drawThumbRanura`), así que el dibujo es un punto único. Lo que falta es **dónde se guarda la postura elegida**: `getRoomData` **quita el `@rot` a propósito** (`web/app.js:4056`) porque es el mismo documento |
| [REQ-SEL2](#-req-sel2) | copiar/pegar debería llevarse el **redstone pegado a la cara** de los bloques copiados | 🔴 abierto 2026-08-20 | nota de `/map/bugfinder2`: «son difíciles de seleccionar». Toca la frontera `mc.grid` ↔ `mc.structures`, la misma que [BUG-RS10](#-bug-rs10) | 
| [REQ-TOOL9](#-req-tool9) | poder **elegir qué herramientas entran con `e` y cuáles con `E`** desde el editor (primarias / secundarias) | 🔴 abierto 2026-08-20 | nota de `/map/bugfinder2`: «cambiar el orden de las herramientas empieza a ser algo habitual». Redactado, sin investigar | 
| [REQ-CART7](#-req-cart7) | poder **elegir el tipo de cartel** de una nota desde su editor, con los carteles definidos en un sitio | 🔴 abierto 2026-08-20 | nota de `/map/bugfinder2`. Él mismo propone la puerta: categoría **«Cartel de Notas»** en la galería. Encaja con que los carteles ya **se derivan** de `mc.notes` y no viven en `mundo.json` ([BUG-CART1](PLAN_ARCHIVO.md#-bug-cart1)) | 
| [REQ-PROP1](#-req-prop1) | sección **Propuestas (uploads/proposals)** en la galería: subir assets comunitarios, votar, comentar y visualizar | ⛔ bloqueado / 🔴 abierto 2026-08-23 | Petición del dueño para subir assets sin requerir token y que la comunidad los valore/vote/comente. **Bloqueado parcialmente**: la atribución de autor requiere autenticación/identificación multiusuario ([REQ-MULTI1](#-req-multi1)). Redactado con desglose de fases | 
| [REQ-ART1](#-req-art1) | mapas temáticos de **Showcase Artístico & Atmósfera** con snippets de configuración dinámica (Santuario, Cueva, Cyberpunk) | 🟢 abierto 2026-08-23 | 3 mapas (`/map/santuario_zen`, `/map/cueva_ancestral`, `/map/neon_city`) con sus snippets `mundo-<mapa>` que configuran iluminación, reflejos, partículas, OSD y cámaras cinematográficas | 

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

<a id="-bug-snp8"></a>

### 🟢 BUG-SNP8 · El nombre corto de un asset no activa su comportamiento — 🟢 hecho 2026-09-03

**Enunciado del dueño, literal:**

> «el asset "assets/espada-de-diamante.vox.json" segun su ficha dice: *Nombres que ya funcionan hoy
> para esta pieza: espada · nombre corto; espada-de-diamante · id; espada de diamante · rótulo* — sin
> embargo, en comportamiento, solo con "espada" no se activa, me obliga a poner el nombre largo»

**Lo que pasaba.** La ficha decía la verdad **para el motor** y mentira **para `game.bloques`**. Son
dos resolvedores de nombres distintos y solo uno sabía de alias:

- El motor tiene `mcClaveDeNombre` (`web/app.js:9308`), que mira la paleta, luego `mcAssetsRegistry`
  (el índice cargado de `assets/index.json`, que es donde vive el alias `espada`) y de último cae en
  `'hab:'+nombre`. Por eso `setVoxel('espada', …)` sí funcionaba.
- `resolver()`, dentro de `data/snippets/mundo-autoarranque.json`, se fabricaba el suyo: partir la
  clave por `:` y por `/` y quitar `.vox.json`. De `asset:assets/espada-de-diamante.vox.json` sale
  `espada-de-diamante`, **nunca `espada`**. Con eso `espada` no casaba con nada, se caía al camino de
  las pistas por subcadena, encontraba **las dos** espadas y remataba con un «¿Querías…?» engañoso —
  cuando la respuesta buena no era ambigua en absoluto.

**El arreglo** (`herramientas/parche_snp_alias_bloques.py`, idempotente y por ancla única): añadir en
`resolver()` una puerta más que le pregunta al motor. **Dos decisiones que son el ticket entero:**

1. Va **después** de los dos caminos de `cand` y **antes** de las pistas: clave exacta, nombre corto
   único y nombre corto ambiguo quedan byte a byte como estaban, y los avisos de abajo solo se pisan
   cuando la respuesta del motor es firme.
2. ⛔ Solo se acepta **si la clave está en la paleta del mundo**. `mcClaveDeNombre` devuelve
   `'hab:<lo que sea>'` para cualquier nombre que no conozca, así que fiarse de ella a ciegas
   convertiría **cada errata en una clave válida** y mataría en silencio los avisos de
   BUG-SNP1 («todavía no está en este mundo») y BUG-SNP2 (la familia), los dos en `PLAN_ARCHIVO.md`.

⚠️ **Y una trampa del repo que este ticket estrena en esta zona:** dentro de `resolver()` **no puede
quedar un `}` en la columna 2**. `tests/test_material_familia.js` extrae esa función **verbatim por
texto** y la corta por el primer `\n  }\n`; el primer intento del parche metía un `if (…) { … }` de
varias líneas y partió la función en dos (`Unexpected end of input` en el `vm`). Es el mismo cuidado
que ya pide `mcFineBoxHit` con `test_rayo_apuntado.js`. Lo cazó la suite, no la revisión.

**Guardián:** `tests/test_alias_bloques.js` (9 comprobaciones). Lo que prueba de verdad no es la
línea que va bien, son las que tienen que **seguir mal**: `espadda` y un nombre inventado siguen
devolviendo `null`, y `espada-de-luz` sigue siendo la espada de luz y no la de diamante.

**Verificado:** `tests/test_alias_bloques.js` 9 ok / 0 fallos · `test_material_familia.js` todo ok ·
`test_bloques_comportamiento.js` 392 ok / 0 fallos · `correr_tests.js --node` 31 ok / 2 fallos (los
dos de siempre: `test_agentes_api` y `test_videos_api` escriben y el servidor está con token ⇒ 401).

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
3. **Reglas de convivencia**: conflictos, permisos, quién entra, y los puntos de aparición ([REQ-SPAWN1](PLAN_ARCHIVO.md#-req-spawn1)).

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
3. **Convivencia** — conflictos, permisos, quién entra, y los puntos de aparición ([REQ-SPAWN1](PLAN_ARCHIVO.md#-req-spawn1)).

**Criterio de cierre (fase 1):** dos navegadores en `/map/test` se ven el uno al otro moverse, con su
arma en la mano y su nombre encima, sin que ninguno de los dos note que los fps bajan.

**Criterio de cierre (el ticket entero):** 10 jugadores en el mismo mapa por internet, construyendo a la
vez; lo que pone uno lo ve el otro, y al cerrar todos y volver a abrir el mundo está como lo dejaron —
sin que ninguna edición se haya perdido por el camino.

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

Encaja bien con lo que se acaba de cerrar en [BUG-CART1](PLAN_ARCHIVO.md#-bug-cart1): los carteles **se derivan** de
`mc.notes` al cargar y ya **no** se guardan en `mundo.json`. Luego el tipo de cartel es un dato **de la
nota**, no un voxel del mundo — y ahí es donde debe guardarse, junto a `noteRots` / `noteTints`.

**Criterio de cierre:** dos notas del mismo mundo con carteles distintos, guardar, recargar, y siguen
distintas — sin que aparezca ni un voxel de cartel en `mundo.json`
(`herramientas/carteles_fantasma.py` en cero).

---

<a id="-req-prop1"></a>

### ⛔ REQ-PROP1 · Sección Propuestas (Uploads / Proposals) en la galería — ⛔ bloqueado / 🔴 abierto 2026-08-23

**Petición del dueño (2026-08-23):**
> «vamos a añadir una seccion nueva para los assets que sea tambien uploads, imaginemos que un usuario quiere subir un asset al mundo, pero no conoce el token, pero le gustaria que formase parte del proyecto. queremos que pueda subir su asset a una seccion donde se proponen assets (proposals) que ademas pueda ser visualizada por otros usuarios, votada, que pueda poner comentarios, e incluso atribucion del usuario (esto tendria un block hasta que se haga la parte de autenticacion/identificacion multiusuario, es un ticket). Por lo tanto, hay que añadir esta otra seccion visible en las categorias. como es algo extension con bloqueos abrir un ticket antes de peticion de implentacion»

**Propósito:**
Permitir a usuarios sin token de administrador proponer y compartir modelos/assets para que la comunidad los explore, vote y comente. Un administrador con token puede posteriormente promover una propuesta a asset oficial (`asset:assets/...`) o moverla.

**Bloqueos identificados (⛔ Dependencies):**
- **Atribución de Autor y Votos seguros**: Bloqueado por la falta de identidad / autenticación de usuario. Depende de la capa de usuarios/sesión multiusuario ([REQ-MULTI1](#-req-multi1)). Mientras no exista sistema de login o sesión, la atribución y los votos son anónimos o por alias local no verificado.

**Desglose en Fases de Implementación:**

1. **Fase A · Categoría y Almacén de Propuestas (Subida básica sin token)**:
   - Nueva categoría/sección en la galería (`proposals` / `uploads`).
   - Directorio de almacenamiento aislado: `data/propuestas/` (ficheros `.json` o `.vox.json` propuestos).
   - Endpoints en `server.py`:
     - `GET /api/propuestas` (listar propuestas con metadata, conteo de votos y comentarios).
     - `POST /api/propuestas` (subir nuevo asset propuesto sin requerir `VOXELFORGE_TOKEN`, validando schema voxelforge).
     - `GET /api/propuestas/<id>` (obtener modelo para vista previa 3D / thumbnail).
2. **Fase B · Interacción Comunitaria (Comentarios y Votos)**:
   - Sistema de votación (`POST /api/propuestas/<id>/votar`).
   - Sistema de comentarios (`GET/POST /api/propuestas/<id>/comentarios`).
   - Persistencia de interacciones en `data/propuestas/<id>.meta.json` o base de datos ligera.
3. **Fase C · Atribución y Verificación de Usuario (Desbloqueable con [REQ-MULTI1](#-req-multi1))**:
   - Vincular autoría al perfil/identidad de usuario autenticado.
   - Evitar votos duplicados por identidad única.
4. **Fase D · Aprobación y Promoción a Asset Oficial (Admin con Token)**:
   - Acción en la ficha para administradores con token: «Aprobar y mover a `asset:` públicos».

**Criterio de Cierre:**
- La galería cuenta con un filtro/sección visible de Propuestas.
- Un usuario sin token puede subir un modelo a Propuestas desde el editor.
- Los usuarios pueden visualizar los modelos propuestos en 3D, votar y dejar comentarios.

---

<a id="-req-art1"></a>

### 🟢 REQ-ART1 · Mapas Temáticos de Showcase Artístico & Atmósfera Dinámica — 🟢 abierto 2026-08-23

**Petición del dueño (2026-08-23):**
> «generes un plan para los 3 conceptos, cada uno tendra su propio mapa y snippets de arranque para configurar la escena, atmosfera, animaciones, etc. que sea parte del desarrollo, queremos ir haciendo estos conceptos cada vez mas afinados y refinados a medida que avance el desarrollo de voxelforge»

**Propósito:**
Tener 3 mapas showcase permanentes y versionados, acompañados de sus respectivos snippets de arranque (`mundo-<mapa>`), que expriman las características visuales avanzadas de VoxelForge (reflejos en agua en tiempo real, shaders de iluminación emisiva, partículas dinámicas, niebla volumétrica y contrastes de penumbra `interiorDark`). Estos mapas sirven tanto para material audiovisual de alta calidad (r/VoxelArt, Twitter/X, Reddit) como para pruebas de regresión visual en nuevos desarrollos.

---

### Desglose de los 3 Conceptos y Arquitectura de Mapas:

#### 🏯 Mapa 1: `/map/santuario_zen` (Santuario del Lago / Isla Flotante Nocturna)
- **Foco Visual**: Reflejos en agua en tiempo real ([REQ-ENV5](PLAN_ARCHIVO.md#-req-env5)), partículas flotantes suaves y contrastes de luz cálida contra el atardecer/noche.
- **Estructuras**: Santuario/pagoda oriental sobre un lago con cerezos (`cerezo`), linternas colgantes emisivas y puente de madera curvo.
- **Snippet `mundo-santuario-zen`**:
  - `await game.snippet("ambientes");` + `await game.snippet("efectos-demo");`
  - Preset: `game.entorno("ATARDECER", 0.8)` o `"NOCHE"`.
  - Reflejos: `game.reflejoEntorno = true; game.reflejoOndas = true; game.reflejoPlanoY = <nivelAgua>;`
  - Partículas: Luciérnagas / brasas flotantes (`game.efectos.estrellas.enciende()`).
  - Modo Cinemático: atajo de cámara lenta / rotación orbital suave para capturas de vídeo.

#### 🪨 Mapa 2: `/map/cueva_ancestral` (Templo Subterráneo con Haz de Luz)
- **Foco Visual**: Oclusión ambiental extrema (`game.interiorDark = 0.03`), enfoque y haz de luz direccional (`game.glowFocus = 0.85`), contraste de claroscuro y cascadas de agua en penumbra.
- **Estructuras**: Caverna profunda con una claraboya cenital natural en el techo, pilares de piedra derruidos con musgo, altar central y estanque inferior.
- **Snippet `mundo-cueva-ancestral`**:
  - `game.interiorDark = 0.05;`
  - `game.glowLevel = 15; game.glowFocus = 0.8;`
  - Efecto de niebla/polvo subterráneo y gotas/humedad.
  - Alumbrado dinámico con la antorcha o espada de luz en mano del jugador que corta la oscuridad.

#### 🏙️ Mapa 3: `/map/neon_city` (Ciudad Cyberpunk Bajo la Lluvia)
- **Foco Visual**: Clima adverso (`TORMENTA`), lluvia física con salpicaduras en el suelo, asfalto mojado reflectante y saturación de emisivos multicolor (cian, magenta, amarillo).
- **Estructuras**: Callejón estrecho de rascacielos con bloques de hormigón arquitectónico, carteles luminosos, ventanas iluminadas y tuberías metálicas.
- **Snippet `mundo-neon-city`**:
  - `game.entorno("TORMENTA", 0);`
  - Lluvia continua: `game.efectos.lluvia.enciende(160);`
  - Reflejo especular en charcos y asfalto: `game.reflejoEntorno = true;`
  - Iluminación emisiva urbana densa.

---

### Fases de Implementación del Plan:

1. **Fase 1 · Estructura de Mapas y Snippets Base (Skeleton)**:
   - Crear los 3 mapas base con sus dimensiones y spawn calibrado en `data/worlds/`.
   - Crear los 3 snippets de autoarranque: `data/snippets/mundo-santuario-zen.json`, `data/snippets/mundo-cueva-ancestral.json`, `data/snippets/mundo-neon-city.json`.
2. **Fase 2 · Modelado y Composición de Escenas**:
   - Construir la volumetría de cada mapa usando los assets oficiales (`cerezo`, `roble`, `agua`, `farol`, `ladrillo_piedra`, `hormigon`, etc.) y la herramienta de selección.
3. **Fase 3 · Calibración de Luces, Atmósfera y Menú OSD de Director**:
   - Añadir un menú OSD en cada mapa (tecla `O`) para alternar presets de hora, intensidad de lluvia/partículas, pausar animaciones o activar pase de cámara cinematográfica para grabación (Alt+V).
4. **Fase 4 · Refinamiento Continuo**:
   - Actualizar los mapas a medida que se incorporen nuevas características al motor (sombras proyectadas, nuevos emisivos, reflejos mejorados).

---

<a id="-bug-plant4"></a>

### BUG-PLANT4 · tres pegas de camino a crear un mundo — 🟢 hecho 2026-09-03

**Palabras del dueño** (2026-09-03), tres de las cuatro cosas que trajo de una vez:

> «1) cuando entras con una cuenta y le das botón de "crear mundo" sale un prompt preguntando el
> nombre del mundo y te lleva a ese vacío, la página buena donde debería de ir al darle al botón
> "crear mundo" es "map" > "nuevo mundo" y no a prompt. 2) cuando estás creando un nuevo mundo y
> seleccionas una plantilla, el foco debería ir al recuadro de texto para escribir el nombre del
> mundo automáticamente. 3) cuando le das al botón final de crear, se produce un scroll de toda la
> página empujándose el contenido hacia arriba, podría ser por algún mensaje que sale, eso no
> debería ocurrir.»

**Las tres son la misma raíz**: la portada creaba mundos por su cuenta en vez de mandar al único
sitio que sabe crearlos.

**1 · El `prompt()` y el mundo vacío.** `web/menu.html` tenía un `creaMundo()` que preguntaba el
nombre y mandaba **sólo eso** a `POST /api/mundos/crear`. Sin plantilla el mapa nace
`generado:false` y **nadie lo construye después** — quien levanta el bioma es `generador-mundo`
desde `mundo-autoarranque`, y necesita saber qué generar (REQ-PLANT1). Por eso salía vacío: no es
que la creación fallara, es que faltaba la mitad del encargo. Ahora es un **enlace**
(`<a href="/map?nuevo=1">`), no un botón con `onclick`: así vale el clic central y «abrir en pestaña
nueva», que en una portada es lo normal. Lo recoge `web/mapas.html`, que abre el asistente y
**borra el parámetro de la barra con `replaceState`** — si se quedara, volver atrás desde el mundo
recién creado, o recargar tras cancelar, lo reabriría encima del listado.

**2 · El foco.** `nom.focus({ preventScroll: true })` dentro de `elige()`. El `preventScroll` no es
adorno: `focus()` sin él desplaza a **todos** los ancestros para enseñar el campo —la misma
enfermedad que ya obligó a que `centra()` moviera la tira a mano en vez de con `scrollIntoView`— y
además pelearía con el desplazamiento suave que `centra()` acaba de lanzar.

**3 · El salto al pulsar CREAR, que es lo que costó.** Lo primero que hay que decir es que **no era
un desplazamiento de la ventana**: `scrollY` se queda en 0, medido en cuatro tamaños de ventana. Lo
que se movía era el **panel**. El mensaje de error vivía dentro del pie con `min-height:15px`, o sea
hueco para **una** línea, y el texto lo escribe el **servidor**: con «no se ha podido crear» el
salto es de 3 px y pasa por ruido —así se coló—, pero con la frase de la cuota, que son tres
líneas, el pie crecía **39 px** y la tira de fichas encogía otros tantos. Reservar más `min-height`
sólo cambia el tamaño del salto, porque el largo del texto no lo decide esta página. El arreglo es
que **el mensaje no ocupe sitio**: `position:absolute; bottom:100%` sobre el pie (que ya era
`position:relative`), con su recuadro para que se lea encima de las fichas. Medido después: **0 px**
en los cuatro tamaños.

**Guardián**: `tests/test_asistente_ui.js` (Playwright, levanta su propio servidor en modo público
con usuarios en un temporal y **no crea ningún mundo**: intercepta el POST). Manda un error **largo
a propósito**, que es el caso que rompía; con el corto el test pasaría con el fallo delante. También
vigila que no vuelva a salir un `prompt()` — con un manejador de `dialog`, porque sin él Playwright
lo descarta solo y nadie se entera. 15 comprobaciones, todas en verde.

**Tocado**: `web/menu.html` (enlace, y fuera `creaMundo()`), `web/mapas.html` (`?nuevo=1`, el foco
en `elige()`, y el CSS de `.asis-pie .err`). ⛔ Ni una línea de `app.js`.

---

<a id="-bug-perf4"></a>

### BUG-PERF4 · caída de FPS en `/map/default` — 🟡 investigado 2026-09-03, sin tocar nada

**Palabras del dueño**: «investigar la caída de fps en el mapa default», con su volcado de
`game.perfDump()` (12,3 → 8,2 fps).

**Lo primero, para no perder el tiempo donde no está**: **no es JS**. En el propio volcado del dueño
`mcTick` suma 22,30 ms y `mcRender` 18,90 ms **en seis frames** — unos 4 ms de JS por frame dentro
de frames de 81 a 122 ms. El 96 % del frame se va en la tubería de GL, donde los cronómetros de JS
no ven nada.

**Lo medido** (sonda propia que envuelve `gl.drawArrays` y agrupa las llamadas **por quién las
hace**, que es justo lo que `perfDump` no dice; contra `/map/default` de verdad, con las escrituras
al mapa abortadas desde Playwright — `tests/_probe_fps_default.js` y `tests/_probe_fps_ab.js`, que
se quedan mientras el ticket siga abierto):

| pasada | draws/frame | vértices/frame |
|---|---|---|
| **`mcRenderRefl`** (reflejo de entorno, REQ-ENV5) | **770** | **5 106 000** |
| `mcRender` (terreno opaco) | 298 | 4 592 000 |
| `draw` (estructuras) | 56 | 518 000 |
| resto (cielo, fantasma, notas) | 6 | 1 500 |
| **total** | **≈1 130** | **≈10 218 000** |

Cuadra con el volcado del dueño (7 806 `drawArrays` en 6 frames = 1 301/frame).

**El mapa**: 512×40×512, 20 MB, **467 estructuras**, 1 024 chunks mallados, `renderDist` 8, 215
entradas en `mc._geoFina`.

**El hallazgo**: la pasada de reflejo **dibuja la escena entera otra vez** (terreno + agentes +
estructuras + celdas finas) en un FBO de 512², y le cuesta **2,6 veces más llamadas que la pasada
principal** para la misma geometría. Se lleva el **68 % de los draws y el 50 % de los vértices**.
Apagarla con `game.reflejoEntorno(0)` deja el frame en 359 draws y 5,1 M vértices.

⚠️ **Y una cosa que conviene mirar aunque en `default` no sea el problema**: la puerta de la pasada
(`web/app.js:13858`) es `finoAl && mcAguaReflejo > 0 && mcReflEntorno > 0 && !mcFluidoOjo()`, o sea
«hay **alguna** geometría fina translúcida a la vista» — cristal, hojas, lo que sea—, **no** «hay
agua a la vista». En `default` sí hay agua en el spawn (`mc._lastWaterY` = 15), así que aquí el
reflejo es legítimo; en un mapa con una vidriera y ni una gota de agua se paga entero para nada.

**Lo que NO se ha hecho, a propósito**: nada. Tocar el reflejo es tocar `app.js` y la iluminación,
y las dos cosas tienen candado (ley de oro y LEY DE LA LUZ). Las palancas, de más barata a más
cara, para que el dueño elija:

1. **Probarlo en su GPU**: `game.reflejoEntorno(0)` en `/map/default`. Si los FPS suben, está
   confirmado en su máquina, que es la que importa (aquí se mide con SwiftShader, por software).
2. **Bajar `renderDist`** de 8 a 6: recorta la pasada principal a ojo un 58 % (13²/17²).
3. **Afinar la puerta**: exigir que se haya encontrado agua de verdad, no sólo `finoAl`.
4. **Cribar la pasada de reflejo por el plano del agua**: hoy los chunks enteramente por debajo de
   `waterY` se recortan **en el fragment shader**, o sea que se transforman igual. Cribarlos en CPU
   se llevaría por delante la mayor parte de esos 770 draws. Es la que más rinde y la única que
   toca el motor ⇒ por parcheo en caliente primero.

---

<a id="-req-plant1"></a>

### REQ-PLANT1 · plantillas de mundo: elegir bioma por una ficha con foto — 🔴 abierto 2026-09-02

**Palabras del dueño** (verbatim en `data/tickets/REQ-PLANT1/contexto.md`): «cuando un usuario se
registra y se le da permiso para crear nuevos mapas deberia de tener algun tipo de plantilla para no
empezar con un mapa vacio siempre… **El jugador tendría que poder llamar a esos snippets sin saber lo
que son**, basta con elegir la ficha que le guste por la imagen y la descripcion que muestra, desde
una UX atractiva… Todo el interface al estilo videojuego minecraft o mejor».

Es la última pieza que le falta al alta de un usuario nuevo: hoy se registra, se le da
`mundo.crear`, crea un mapa y **aterriza en una llanura vacía sin configurar**.

#### La mitad buena: los generadores ya están y ya se ejecutan solos

Los cinco que nombra existen en `data/snippets/` y **no son librerías: se autoejecutan**. Cada uno
define su `buildX(...)` y al final del código **se llama a sí mismo** y remata con
`game.snippet("nubes-altas")`. O sea que «llamarlos sin saber lo que son» **ya funciona hoy**:
`game.snippet("construye-badlands")` y ya está. Eso reduce el ticket a la ficha y al camino hasta
ella.

⚠️ **Ojo con el nombre**: el fichero es `construye-fornite-tilted-towers` (*fornite*, sin la `t`) y
`construye-monta-as` (la `ñ`, comida). Se copian tal cual o no se encuentran. Además hay dos más que
no nombró y que quizá quiera: `construye-casa` y `construye-esfera`.

#### «Personalizarlo antes de su generación» ya es un parámetro, sólo que nadie lo enseña

Los generadores **ya aceptan `options`** con `mapWidth`, `mapHeight` y `mapDepth`
(`buildShatteredPeaks(originX, originY, originZ, options)` y hermanos), además de los materiales
(`waterMat`, `leafMat`, `seaLevel`, `snowLine`…). El «elegir el tamaño dentro de unos límites» es
**exponer lo que ya se le pasa a mano**. Para el ambiente y los efectos atmosféricos, el vocabulario
también está: `game.entorno("TORMENTA"|"ATARDECER"|"NOCHE", …)`, `game.efectos.lluvia.enciende()`,
`game.efectos.estrellas`, `game.interiorDark`, `game.reflejoEntorno` — el mismo que inventaría
[REQ-ART1](#-req-art1) desde cero.

#### Las tres cosas que hay que resolver, y que no están

1. **`POST /api/mundos/crear` ignora la plantilla.** Escribe `dict(DEFAULT_WORLD)` a secas
   (`server.py:2037`), 96×40×96 vacío. El plan lo había previsto como `{nombre, plantilla}` (F3.2) y
   el `plantilla` **no llegó a implementarse**: hoy no aparece en `server.py`.
2. ⚠️ **La cuota se cobra por un mundo que no es el que se va a generar.** La comprobación de bytes
   usa `DEFAULT_WORLD['dim']` (96·40·96·2 ≈ 720 KB) y luego el generador hace
   `await game.resizeWorld(128, 40, 128)` — `construye-monta-as` lo trae escrito a fuego — y sus
   defectos llegan a `mapWidth 512`. **512×40×512 son ~21 MB**: la cuota diría que sí y el disco se
   llenaría igual. Los límites del selector de tamaño y la cuota **tienen que ser el mismo número**.
3. **¿Cuándo corre el generador, y una sola vez?** Los `construye-*` empiezan por `game.wipeMap()`.
   Si la plantilla se engancha como autoarranque `mundo-<slug>`, **rearrasa el mundo cada vez que
   alguien entra** y se lleva por delante lo construido. La plantilla es un **acto de nacimiento**,
   no un autoarranque: corre una vez, se guarda y no se vuelve a mirar.

#### Las fichas y las fotos

El dueño hace las capturas: «*idealmente proporciones telefono movil, yo haria esas capturas/fotos,
con un carrusel, que se vean por lo menos 4 en pantalla a la vez*», y propone meter los metadatos
**dentro del propio snippet**: «*podria haber metadatos en esos snippets para indicar la foto, el
titulo de la ficha, una descripcion, etc*».

⚠️ **Hoy eso se perdería en silencio, y hay que arreglarlo antes de usarlo.** `POST /api/snippets`
**no guarda lo que le mandas**: arma `rec` **de cero** con una lista blanca —
`{id, name, code, savedAt}` + `categoria` si viene (`server.py:2164`) — y **todo campo que no
reconoce lo tira**. Guardar el generador desde el botón del editor borraría la ficha sin avisar. Es
exactamente el fallo contra el que ya se blindó `protegido`, con su motivo escrito al lado:
*«una marca que se cae sola no protege de nada»* (`server.py:2168-2179`).

Así que la vía de los metadatos en el snippet **es buena y es barata, pero no es gratis**:

1. **Ampliar la lista blanca** de `POST /api/snippets` con los campos de ficha (`titulo`,
   `descripcion`, `foto`…) y hacerlos **pegajosos** igual que `protegido`: si el fichero ya los
   llevaba y quien guarda no dice nada, se quedan. Es el patrón que ya está escrito ahí al lado.
   ✅ Todo en `server.py`: **no roza `app.js`**.
2. **Ampliar `list_snips()`** (`server.py`), que también es lista blanca (`id`, `name`, `categoria`,
   `lines`, `savedAt`, `protegido`): sin eso el carrusel tendría que pedir los 7 generadores uno a
   uno sólo para leer un título.
3. ⛔ **La foto va por referencia, no dentro.** `/api/snippets` tiene tope de **2 MB** de cuerpo
   (`server.py:1049`) y el código de `mundo-autoarranque` ya son 300 KB: meter capturas en base64
   revienta el tope y engorda un fichero que se lee en cada arranque. El campo guarda **la ruta** de
   la foto; las imágenes ya tienen su sitio en `data/fotos/` (con miniatura en
   `data/fotos/mini/<id>.png`).

⛔ Y para ponérselos a los cinco generadores que ya existen: **se parchean** con
`herramientas/parche_snp_*.py` (idempotente, ancla única), no se reescriben — hay 2 copias vivas — y
se publican **sólo** por `POST /api/snippets`.

Alternativa descartable pero honesta: un catálogo aparte (al estilo `data/ui/ranuras.json`) no toca
`server.py` ni los generadores, pero separa la ficha de lo que describe y hay que acordarse de las
dos cosas al añadir un bioma. La del dueño mantiene la ficha pegada a su generador.

Cierran la lista, en este orden y como él los pidió: **«solo terreno base»** → `reset-map` (que ya es
`wipeMap` + `buildTerrain`, y ⚠️ hoy pregunta por `confirm()`: dentro de un asistente ese diálogo
sobra) y **«mapa vacío»**, que es exactamente lo que hace hoy `/api/mundos/crear` sin tocar nada.

**Depende de** F3.2 (crear con permiso y cuota, ya hecho) y se ve desde la portada/selector de F5.1-F5.2.
Los generadores llaman a `nubes-altas`, así que quedan **en uso** a efectos de F2.1 («está en uso, no
se borra»).

Contexto y palabras completas → `data/tickets/REQ-PLANT1/contexto.md`.

#### 🟡 Lo implementado el 2026-09-02 — el ciclo entero funciona

Sonda `tests/probe_plantillas_mundo.js` (Playwright, se limpia sola, ⛔ nunca toca `/map/default`):
las 7 fichas, ≥4 visibles a la vez, proporción 9:16, y **el mundo construido de verdad** (195 613
voxels) con el tamaño elegido respetado.

| pieza | qué hace |
|---|---|
| `servidor/plantillas.py` | catálogo + **lista CERRADA** de ambientes/efectos y los lados con su peso |
| `GET /api/plantillas` · `GET /api/mundos/<slug>/plantilla` · `POST …/generado` | catálogo, «¿está a medias?» y el aviso de «ya está» |
| `herramientas/parche_snp_plantillas.py` | la `ficha` dentro de los 5 `construye-*` (código intacto) |
| `data/snippets/generador-mundo.json` + `parche_snp_generador_mundo.py` | el corredor, enganchado al final de `mundo-autoarranque` |
| `web/mapas.html` | botón «＋ Nuevo mundo» y el asistente a pantalla completa |

**Las tres trampas que costaron encontrar** (y que hay que respetar si se toca esto):

1. ⛔ **No se puede generar dentro del autoarranque.** `window.setVoxel` (`web/app.js:22247`) reparte
   según `mc.active`, y esa bandera no se pone hasta **12 líneas después** del `await
   mcAutoarranque()` (`app.js:22707` y `22719`). Generar allí escribe **en el objeto del editor**, y
   sin fallar: el mundo salía con **0 voxels** y el generador decía «done» en 2 s. Esperar dentro es
   un interbloqueo (`openWorld` está parado en ese `await`) ⇒ el corredor lanza la generación **en
   paralelo** y espera a `mc.active` desde fuera.
2. ⛔ **`await game.snippet(...)` NO garantiza que el generador haya terminado**:
   `construye-monta-as` remata con `buildNaturalMountains(…)` **sin `await`** siendo `async`. Sin
   esperar por **asentamiento** (que la rejilla deje de crecer), se guardaba y se marcaba «generado»
   sobre un mundo vacío.
3. Los cinco generadores llevan `game.wipeMap()` y `game.resizeWorld(128,…)` **a fuego**: el primero
   saca un `confirm()` en mitad del asistente y el segundo pisa el tamaño elegido. Se resuelve
   **envolviendo las dos** durante la generación y devolviéndolas byte a byte (ley de oro) —
   ⛔ **no se edita el `code` de los generadores**, que son de otro autor y son cinco.

**Pendiente**: llevar el asistente a `web/menu.html`. Las **fotos** ya no son un pendiente: se
gestionan desde el panel, ver [REQ-PLANT2](#-req-plant2).

⚠️ Hubo un aviso del dueño de que **el mar desaparecía al recargar y el respawn quedaba enterrado**
(2026-09-02). **No se reprodujo**: el propio dueño repitió el proceso y salió bien, así que no hay
ticket. Si vuelve a pasar, el diagnóstico que estaba escrito censa la rejilla por material antes y
después de recargar — se rehace en diez minutos.

---

<a id="-req-plant2"></a>

### REQ-PLANT2 · gestionar las fichas del carrusel (foto y metadatos) — 🟢 hecho 2026-09-02

**Palabras del dueño**: «cómo hago para asociar una foto a una ficha, y qué pasa si se borra la
foto? debería de haber algún panel de administrador para gestionar esas fichas donde se pueda
modificar todos esos metadatos y poner las imágenes en una zona segura» · «también podría ser un
snippet que sirva para generar esas fichas».

Lo que había: la `ficha` vive dentro del generador (REQ-PLANT1), y para tocarla había que escribir
un `parche_snp_*.py`. La foto era una **convención sin nada detrás** — la ruta
`/data/ui/plantillas/<id>.jpg` estaba escrita en las cinco fichas y **esa carpeta ni existía**.

| pieza | qué hace |
|---|---|
| `servidor/plantillas.py` | `foto_de` / `foto_viva` / `ruta_de_url` / `imagen_cruda`: dónde vive una foto y si sigue viva |
| `servidor/panel.py` | `plantillas` · `guarda_plantilla` · `guarda_foto_plantilla` · `borra_foto_plantilla` |
| `GET/POST /api/panel/plantilla(s)` · `DELETE …/foto/<id>` | las rutas, bajo `panel.usar` |
| `web/panel.html` → pestaña **Plantillas** | retrato 9:16, textos, etiquetas, frases, orden |
| `data/snippets/fichas-plantilla.json` + `parche_snp_fichas_plantilla.py` | **la foto desde dentro del juego**: `game.fichas.retrato()` |

**Las cuatro decisiones que hay que respetar si se toca esto:**

1. **La zona segura es `data/ui/plantillas/`**, y lo es porque `ui` es una de las cuatro carpetas de
   `DATA_PUBLICA` (`server.py`): en modo público se **lee** y sólo se **escribe** con `panel.usar`.
   `ruta_de_url()` sólo admite esa carpeta y `data/fotos/` (las capturas de Alt+F), con nombre de
   fichero llano — sin ese portero, una ficha con `foto: '/data/../../etc/passwd'` convertía el
   catálogo en un lector de ficheros.
2. **La foto se resuelve contra el DISCO en cada petición del catálogo**, no se copia de la ficha.
   ⇒ Si la foto **se borra**, la tarjeta vuelve a su marcador (la inicial) y **no se rompe nada**; y
   si aparece `data/ui/plantillas/<id>.jpg` sin que nadie toque los metadatos, **se usa**. Asociar
   una foto es, literalmente, subirla con el nombre de la ficha.
3. ⛔ **El guardado del panel NO toca el `code` del generador.** Lee el documento, cambia sólo
   `ficha` y lo reescribe: comprobado byte a byte (9 034 B). Por eso **no** pasa por
   `POST /api/snippets`, que arma el registro de cero; y por eso ése conserva la `ficha` aunque no
   se la manden. Los dos caminos se respetan.
4. ⛔ **La captura del snippet es SÍNCRONA, pegada al `mcRender()`**: el canvas no lleva
   `preserveDrawingBuffer` (`app.js:5425`), así que un `await` por medio la devuelve **negra**. Es la
   misma regla de `mcFoto` (`app.js:20293`). La sonda lo comprueba midiendo el brillo de la imagen
   que quedó en el servidor, no que la petición diera 200.

Se rechaza lo que tiene que rechazarse (comprobado): un SVG disfrazado de imagen, una foto fuera de
la zona segura, editar los textos de las dos fichas del propio programa y un id que no existe.
Quitar una foto la manda a la **papelera**, no al vacío.

**Pendiente**: elegir como foto de ficha una captura que ya esté en `data/fotos/` (el servidor ya la
admite, falta el selector en el panel).

---

<a id="-req-plant3"></a>

### REQ-PLANT3 · el panel no explicaba el alta y la baja de plantillas — 🟢 hecho 2026-09-02

**Palabras del dueño**: «sobre las plantillas no se ve / entiende cual es el metodo para dar de alta
una nueva o borrar una existente, el panel de plantillas deberia explicar esto».

Tenía razón por partida doble: no se explicaba **y la baja no existía**. El alta sí, pero invisible —
el carrusel **no es una lista que alguien mantenga**, es «los snippets de `data/snippets/` que llevan
una `ficha` dentro» (más las dos del propio programa, que son constantes de `plantillas.py`). Publicas
el generador con su ficha y aparece; eso no se adivina mirando el panel.

| pieza | qué hace |
|---|---|
| `web/panel.html` → pestaña **Plantillas** | el aviso que explica alta y baja, botón **Quitar / Devolver al carrusel**, tarjeta en gris con pastilla «fuera del carrusel» y los dos desplegables de tamaño |
| `servidor/plantillas.py` → `normaliza_ficha` | el campo `oculta` |
| `server.py` → `/api/plantillas` | filtra las ocultas: es lo que ve el jugador |
| `servidor/panel.py` → `CAMPOS_FICHA` | `oculta`, `lado` y `ladoMax` guardables desde el panel |

**Las tres decisiones que costaron**:

1. ⛔ **La baja NO es quitar la `ficha`**, que era lo primero que salía. Sin ficha el snippet
   desaparece **también del panel** —que sólo ve lo que tiene ficha—, así que el alta se quedaba sin
   vuelta atrás: para devolverla había que volver a escribir Python. La marca `oculta` deja la
   plantilla donde se gestiona y la quita de donde estorba.
2. **Baja ≠ borrado, y el panel lo dice.** El generador sigue publicado y se le puede seguir llamando;
   lo único que pierde es la tarjeta. Borrar de verdad es borrar el snippet, en el editor de código,
   y eso va a la papelera.
3. **`lado`/`ladoMax` se editan aquí** porque quien descubre que un bioma deja al navegador sin
   memoria es el dueño jugando, no editando un `parche_snp_*.py` (ver el «borrame-6» de REQ-PLANT1).

El guardián comprueba lo que se rompe solo: que la dada de baja sale del carrusel pero **sigue en el
panel**, que el `code` del generador queda **byte a byte** y que `savedAt` **no se mueve** (es la
clave por la que se ordena la lista del editor de código: tocar una mayúscula no puede reordenarla).

---

<a id="-req-icon2"></a>

### REQ-ICON2 · las miniaturas salen siempre de espaldas, y no hay forma de girarlas — 🔴 abierto 2026-09-02

**Palabras del dueño**: «los iconos de las ranuras y tambien de la galería muestran la rotacion por
defecto la cual no parece ser la mas idonea para visualizar por ejemplo la cara de una cabeza, ya que
mira hacia atras. deberia de haber un boton que permita rotar en el plano horizontal los iconos para
poder ver sus otras caras en las galerias y como aparecen en las ranuras mostrados».

El ejemplo que da es el que fija el requisito: una cabeza que **enseña la nuca**. No es que la
miniatura esté mal dibujada — es que nadie ha podido elegir por dónde se la mira.

**El giro ya existe en el motor, y la miniatura lo tira a la basura.** `renderIso` recibe un `rot`
(`web/app.js:736`) que es exactamente lo que pide: cuartos de vuelta en el plano horizontal
(`rotXY`, `web/app.js:692`, `rot&3`). Y `drawThumb` (`web/app.js:1952`) le pasa **`0` escrito a
pelo**, con el comentario «rot 0 (no depende de SX/SY)».

**El dibujo es un punto único**, lo cual abarata mucho el ticket: las **13** llamadas a `drawThumb`
(galerías de habitantes y assets, picker, ficha, tarjetas del mundo) y también `drawThumbRanura`
(`web/app.js:1968`, la hotbar) pasan todas por esa misma línea. Cambiar la postura de todo es
cambiar un argumento.

**Lo que de verdad hay que decidir es dónde se guarda la postura elegida**, y ahí hay una trampa:

⚠️ **`getRoomData` quita el `@rot` de la clave a propósito** (`web/app.js:4056`): `flor@5` y `flor`
comparten documento y promesa, porque el giro se aplica **al hornear la geometría en el mundo**, no al
documento. Así que la postura del icono **no puede colarse por la clave** esperando que llegue sola:
o se le pasa a `drawThumb` aparte, o se guarda junto al objeto. Y si se guarda junto al objeto, ⛔ ojo
con `assets/index.json` (de donde sale el nombre corto) y ⛔ **nunca** tocando un `*.vox.json`.

**Y la parte de UI que pidió**: un botón de girar, en la galería y en la ficha, que se vea **en el
sitio donde se mira el icono**. Al girar en la galería tiene que cambiar **también cómo sale en la
ranura** — eso es lo que quiere decir «y como aparecen en las ranuras mostrados»: una sola postura por
objeto, no una por pantalla.

Roza, sin ser lo mismo, la tubería de iconos de aplicación de
[REQ-ICON1](PLAN_ARCHIVO.md#-req-icon1): `data/ui/ranuras.json` ya guarda `{dibujo, modo, aa}` por
ranura y su `dibujo` **ya lleva `@7`**, y quien rasteriza allí es `pinta()` de `images/index.html`,
que reimplementa las fórmulas de `drawIsoFaces`. Si la postura acaba siendo un dato del objeto, esa
página debería leer el mismo dato en vez de inventarse otro.

🥇 **Por parcheo en caliente** (ley de oro): envolver `drawThumb` guardando `fn._orig` en un snippet
antes de tocar `app.js`.

Contexto y palabras completas → `data/tickets/REQ-ICON2/contexto.md`.

---

<a id="-req-mundos1"></a>

### REQ-MUNDOS1 · en «mis mundos» no se ve la autoría, ni hay forma de borrar — 🔴 abierto 2026-09-02

**Palabras del dueño**: «desde diseñador/dueño/operador cuando se va a "mis mundos" o sea a /map, se
ven todos los mapas incluso los de otros usuarios; no es un problema que se vean todos, sí que no se
sabe la autoría o permisos de cada uno en esa pagina. falta tambien una opcion para que el operador
pueda borrar cualquier mapa y que un propietario de un mapa pueda borrar los suyos».

Fija bien el requisito: **verlos todos no es el fallo** — el fallo es que la tarjeta no dice de quién
es ni qué puedes hacer con él.

**Lo caro ya está hecho, y no hay que rehacerlo** (comprobado en el código, no supuesto):

- `GET /api/mundos` **ya devuelve la autoría y los permisos** de cada fila: `dueno`, `visibilidad` y
  `escritura` salen de `data/mundos_meta/<slug>.json` (F3.1), y la lista ya se filtra por
  `sale_en_listados`. No hay que tocar la API para pintarlo.
- `DELETE /api/mundos/<slug>` **existe** (F3.3) y ya decide el permiso en el servidor con
  `mundo.borrar_propio` (`PERMISO_POR_RUTA`, `server.py:176`); mueve **el par** `.json` + `.vox` a
  `data/papelera/mundos/` con `voxfmt`, que es quien tiene el cerrojo.

**Lo que falta es sólo `web/mapas.html`**, y son dos cosas:

1. **Pintar en cada tarjeta** el dueño y su visibilidad/escritura (privado · por enlace · público;
   solo lectura vs. escritura). Hoy la tarjeta enseña miniatura y estadísticas y nada más.
2. **Borrar en el menú del botón derecho**, junto a Duplicar y Renombrar (`web/mapas.html:225-226`,
   que hoy sólo tiene esos dos `data-a="…"`). Con confirmación: aunque va a la papelera, borrar el
   mapa de otro no debe estar a un clic de distancia.

⚠️ **El botón se esconde, pero quien prohíbe es `server.py`** (principio rector 2). No calcular en el
cliente «puedo borrar esto»: pintar según lo que ya viene en la fila y dejar que el 403 mande. Un
operador que pueda borrar cualquiera es cosa de su perfil en el panel (F9), **no** de un `if` en el
HTML.

Contexto y palabras completas → `data/tickets/REQ-MUNDOS1/contexto.md`.

---

<a id="-req-asset1"></a>

### REQ-ASSET1 · un usuario nuevo ve en las ranuras los habitantes del dueño — 🟢 hecho 2026-09-03

**Palabras del dueño**: «un usuario que se acaba de crear cuando accede a los bloques de las ranuras
ve los assets de tipo "hab:" que son del dueño, deberia de ver los suyos y los del mundo, pero no los
de otros usuarios. Podria ser que un usuario le envie un asset a otro o que solicite subirlo al
mundo, con multiverse/colaborativo».

**La causa, mirada en el código: un habitante no guarda quién lo hizo.** `POST /api/habitantes`
(`server.py`) escribe el documento tal como llega, **sin uid ni autor**, y `GET /api/habitantes`
devuelve `list_all()` — **todos, a todos** (`server.py:1690`). No es que el filtro esté mal: es que
no hay con qué filtrar.

Por eso van en este orden, y la primera bloquea a la segunda:

1. **Autoría** — que el documento nazca con su dueño (y que los ya guardados se adopten: los
   existentes son del dueño). ⛔ **Nada se borra de `data/habitantes/`** al migrar (regla del repo);
   se añade campo, no se reescribe la carpeta.
2. **El filtro** — `GET /api/habitantes` devuelve **los míos + los del mundo**; los ajenos, no.
   «Del mundo» quiere decir marcado como compartido, que es un tercer estado, no la ausencia de dueño.

**Fase 2, sin diseñar y a propósito fuera de este ticket**: «que un usuario le envie un asset a otro
o que solicite subirlo al mundo» es **mensajería entre cuentas** (enviar, pedir, aprobar) y no cabe
detrás de un campo `dueño`. Se abre su propio ticket cuando 1 y 2 estén cerrados.

Contexto y palabras completas → `data/tickets/REQ-ASSET1/contexto.md`.

---

**HECHO 2026-09-03.** Las dos fases, en el orden que pedía el ticket.

**1 · Autoría** — [`servidor/autoria.py`](servidor/autoria.py), nuevo. El campo viaja **dentro del
documento** y no en un registro lateral (al revés que los mundos): un habitante es **un** fichero y
ya se reescribe entero en cada guardado, así que meterlo dentro sale gratis, sobrevive a un `git
pull` y no puede desincronizarse. Los tres estados que pedía el ticket:

| | quién lo ve | quién lo escribe |
|---|---|---|
| `autor: "<uid>"` | sólo esa persona | sólo esa persona |
| `compartido: true` | **todos** (es «del mundo») | su autor — que sea del mundo **no** lo hace de todos |
| sin `autor` (heredado) | según `compartido` | sólo el dueño del servidor |

⚠️ **El autor no se copia nunca de lo que llega.** El editor manda el documento **entero** en cada
guardado; hacerle caso a `doc.autor` sería dejar que cualquiera se apunte la autoría de un dibujo con
un `curl`, o que la borre sin querer al reguardar uno viejo. Es el mismo cuidado que ya se tenía con
`createdAt` (REQ-GAL4): manda el fichero que hay en disco.

⚠️ **El choque de nombres es real y se frena.** El id de un habitante es su nombre pasado por
`slugify`, o sea que dos personas que llamen «casa» a su dibujo aterrizan en el **mismo fichero**.
Antes daba igual (todo era del dueño); con cuentas, dejarlo pasar es perder el dibujo de otro. Ahora
es un **409** con «ponle otro nombre», que es lo mismo que hace `mundos_meta.nombre_libre` con
`castillo-2`.

**2 · El filtro** — `GET /api/habitantes` devuelve lo mío + lo del mundo, y **`GET
/api/habitantes/<id>` aplica la misma regla**: sin eso, esconderlo de la lista sería cosmética —
bastaría con acertar el id para bajarse el dibujo entero. `DELETE` sólo lo propio. El dueño del
servidor lo sigue viendo todo (si no, el panel no serviría), y **en desarrollo sin token todo el
mundo es el dueño**, así que la galería de siempre y los 128 tests no se enteran de que esto existe.

**La trampa de los heredados, y por qué la adopción no era opcional.** De los 26 habitantes que había,
unos cuantos están **estampados dentro de mundos y snippets** (`hab:seta`, `hab:escalera`,
`hab:mesa-x2`…): dejarlos invisibles habría abierto esos mapas **con agujeros** para todo el que no
fuera el dueño. [`herramientas/adopta_habitantes.py`](herramientas/adopta_habitantes.py) marca
`compartido` justo en los que **alguien referencia** — no en una lista escrita a mano, que
envejecería mal — y deja privados los dibujos sueltos, que es lo que se pedía. Resultado: **17 del
mundo, 9 privados**. ⛔ No borra ni reescribe nada más, y es idempotente.

Guardián: [`tests/test_autoria_habitantes.js`](tests/test_autoria_habitantes.js) (19 ok). Prueba con
**dos** cuentas y no con una, porque los tres fallos posibles sólo se ven comparando: que Ana vea lo
de Bea (el agujero), que Ana no vea lo suyo (producto roto) y que nadie vea lo del mundo (mapas con
agujeros). Levanta su propio servidor en modo público con **`VOXELFORGE_HABITANTES`** desviada a un
temporal — variable nueva, del mismo corte que `VOXELFORGE_USUARIOS`/`_PERFILES`/`_MUNDOS_META`; sin
ella cada pasada le dejaría al dueño dibujos `zz-*` en la galería y una copia en la papelera.

**Lo que queda vivo (fase 3, sin abrir todavía)**: un habitante **privado estampado en un mapa
compartido** no lo ve quien entra al mapa. Hoy no muerde —no había ni un habitante con autor—, pero
en cuanto haya varios usuarios construyendo es exactamente el caso que resuelve la mensajería de la
fase 2 del dueño (enviar / pedir subirlo al mundo).

---

<a id="-req-multi2"></a>

### REQ-MULTI2 · invitar debería encender solo el modo colaborativo — 🔴 abierto 2026-09-02

Sale de la misma frase del dueño que [REQ-ASSET1](#-req-asset1) («…o que solicite subirlo al mundo,
**con multiverse/colaborativo**»): da por hecho que un mapa compartido **ya es colaborativo**, y hoy
no lo es.

**Lo que pasa hoy**: multi **sólo arranca si alguien carga el snippet `multi-verse` a mano**. Crear un
mundo e invitar a alguien **no enciende nada**: el cliente guarda su configuración en
`localStorage vf_multi_cfg` y el vale de invitación en `sessionStorage vf_multi_vale:<slug>`
(`multi/cliente.js`), pero **nadie enciende multi por el hecho de que el mapa esté compartido**.

**Lo que falta**, y es poco porque las dos piezas existen:

- **Invitar marca el mapa** como colaborativo en `data/mundos_meta/<slug>.json` — que es el fichero
  que **ya leen los dos**, `server.py` y `multi/servidor_multi.py` (F6.1). El vale firmado de la
  invitación ya está hecho (F5.6).
- **El arranque del mapa lo lee** y carga `multi-verse` solo, para **el que invita y para el
  invitado**. ⛔ Esto va en el autoarranque (`mundo-autoarranque`), **no en `app.js`**: el motor es
  agnóstico a multi y debe seguir siéndolo.

Continúa [REQ-MULTI1](#-req-multi1).

⛔ **Al probarlo, nunca contra el 8510** — es la partida en vivo del dueño y reiniciarlo echa a quien
esté jugando. Siempre `--puerto 8512 --datos /tmp/multi-datos-8512` con `VOXEL_WS=ws://localhost:8512`,
y de uno en uno.

Contexto y palabras completas → `data/tickets/REQ-MULTI2/contexto.md`.

---

<a id="-req-multi3"></a>

### REQ-MULTI3 · MULTIJUGADOR en la pausa, y encenderlo deja de ser cosa del dueño — 🟢 hecho 2026-09-03, falta que el dueño lo mire

Pedido por el dueño el 2026-09-03, tres cosas en una frase:

> el menu de usuario cuando da ESC en lugar de tener directamente invitar tendria que tener una
> opcion de multiplayer, dentro «activar/desactivar multiplayer» y la opcion de invitar ahi dentro
> tambien; la cosa es que tiene que a) el jugador por defecto no puede activar el modo multiplayer
> actualmente y deberia poder, y luego que si invita a otro jugador a su mapa, el otro jugador sí
> entra en modo multiplayer pero el que esta en el mapa que envio la invitación no

**(b) no era un problema de permisos, y ahí estaba la trampa.** El perfil `jugador` **ya** trae
`multi.entrar` y `multi.invitar` (`servidor/sesion.py:101`). Lo que pedía `entra()` era el **secreto
de la partida** (`multi-verse:2004`), que es la credencial de quien **arranca el árbitro** — una
llave del servidor entero, no de un mapa. Un jugador no la tiene y **no debe tenerla**, así que
«activar multijugador» era, para todo el que no fuera el dueño, un diálogo sin respuesta posible.

**El arreglo**: encender = **pedirse un vale del mapa en el que ya puedes escribir**. `POST
/api/invitaciones` lo firma el servidor (`server.py:2189`) y **solo** si tienes escritura ahí
(`server.py:2205`) — que es exactamente la condición que se quería. El vale se deja donde
`multi-verse` lo busca (`sessionStorage vf_multi_vale:<slug>`) y `entra()` ya no pregunta nada.

**(c)**: `invitacion-multi` arranca el cliente a quien llega con `?invita=` — el **invitado**. El
anfitrión no llegaba por ningún sitio: repartía enlaces a una fiesta a la que él no entraba. Ahora el
**mismo** vale que firma el enlace le mete a él también, en una sola petición.

⛔ **Cero líneas de `app.js` y cero de `multi-verse`**: esto es un menú (`menu-juego` v1.3, por
`herramientas/parche_snp_menu_multijugador.py`). Lo único que se toma prestado es **dónde** se guarda
el vale, anotado en los dos sitios y vigilado por `tests/test_menu_juego.js` §9.

**Y un segundo fallo, este de despliegue, que salió al probarlo con `test2`.** Con el menú ya bien,
seguía sin entrar: *«el servidor no me deja entrar (¿secreto? ¿tope de jugadores?)»*. No era el menú
ni la cuenta — el dueño lo dijo exacto: *«test2 no ha fijado ningún secreto porque no puede, no tiene
esa capacidad»*. El árbitro del 8510 llevaba desde el **2026-08-28** arrancado a mano con
`--secreto probando` y **sin `VOXELFORGE_SECRETO_SESION`**, o sea de antes de que existieran los
vales (F6.2): sin esa variable `sesion._firma` se inventa un secreto volátil por proceso, así que
**ningún vale legítimo verificaba** y el 8510 devolvía 401 a todos (`multi/servidor.log`: «secreto
malo»). Reiniciado con el secreto del sitio, sin nadie conectado. Comprobado contra el 8510 **vivo**
con un vale firmado por el 8500 vivo: `masplaya`/`test2` → `101 Switching Protocols`, y una firma
inventada sigue dando 401.

⚠️ **Ese arranque es a mano y no sobrevive a un reinicio de la máquina.** Lo definitivo es
[`despliegue/voxelforge-multi.service`](despliegue/voxelforge-multi.service), que ya comparte el
fichero de entorno con el sitio. Detalle → [`docs/osd-e-intro.md`](docs/osd-e-intro.md).

Continúa [REQ-MULTI1](#-req-multi1); no cierra [REQ-MULTI2](#-req-multi2), que es el encendido
**automático** por metadatos del mapa.

---

<a id="-req-extru6"></a>

### REQ-EXTRU6 · Ctrl/Shift+rueda machaca los bloques del otro lado en vez de empujarlos — 🔴 abierto 2026-09-02

**Palabras del dueño**: «cuando se selecciona un conjunto de bloques y se hace control+rueda arriba x
ejemplo para subirlos, se deberia de subir tambien el terreno/bloques que tienen por encima, no
machacarlo que es lo que ocurre ahora; esto para cualquier direccion o combinacion control+rueda o
shift+rueda».

⚠️ **No es un caso raro: la guarda de «no pisar» está COMENTADA** en `mcSelExtruir`
(`web/app.js:17408`): el `if (before …)` que evitaría escribir donde ya había algo está en un
comentario, y debajo `mcSetBlock(c.x, y, c.z, c.id)` escribe siempre. Lo pisado se apunta en
`edits.push({x, y, z, before, after})`, así que **deshacer lo devuelve** — pero mover la selección y
soltarla ya lo perdió.

Lo que pide es **empujar**, no ignorar: la columna que estorba sube (o baja, o se aparta) con la
selección. El criterio que da el dueño para saber si está bien es suyo y es el que vale:

> «un wup seguido de un wdown debería dejar los bloques iguales»

— es decir, **la operación y su contraria devuelven el mundo byte a byte**. Sirve las cuatro
direcciones y las dos combinaciones (Ctrl+rueda, Shift+rueda), que es lo que pidió explícitamente.

🥇 **Por parcheo en caliente** (orden del dueño, y además ley de oro): nace en un snippet que envuelve
`mcSelExtruir` guardando `fn._orig`, con `game.<modulo>.on()/off()`, y **`off()` devuelve el motor
byte a byte**. `app.js` **no se toca** hasta que esté rodado. Continúa la familia REQ-EXTRU1..5.

Contexto y palabras completas → `data/tickets/REQ-EXTRU6/contexto.md`.

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
