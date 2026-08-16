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

### F1 · Modelo + API de mapa  —  ✅ done
Modelo: `{cols, rows, cells:{"i,j":{room:<key>|null, habs:[{ref,x,y}]}}}`.
- [x] T1.1 `server.py`: `GET /api/mapa` (devuelve mapa o default 8×8 vacío). ✅
- [x] T1.2 `server.py`: `POST /api/mapa` (valida mínimo, respalda con `to_trash`, guarda). ✅
- [x] T1.3 Verificación `curl`: guardar y recuperar; comprobar respaldo en papelera. ✅
**Verifica**: `curl` guarda un mapa y lo recupera idéntico; el anterior queda respaldado.

### F2 · Pestaña Mapa: colocar habitaciones  —  ✅ done
- [x] T2.1 Overlay `#mapa-modal` con rejilla `cols×rows` (celdas clicables). ✅
- [x] T2.2 Catálogo de habitaciones (assets `bloque` + guardadas) con miniaturas `drawThumb`. ✅
- [x] T2.3 Clic en celda → selector; colocar / cambiar / quitar habitación. ✅
- [x] T2.4 Miniatura de la habitación en cada celda ocupada. ✅
- [x] T2.5 Autoguardado (POST /api/mapa) tras cada cambio. ✅
**Verifica**: coloco Taberna y Mazmorra, recargo el navegador y siguen colocadas.

### F3 · Habitantes dentro de la habitación  —  ✅ done
- [x] T3.1 Botón 🧍+ en celda ocupada → editor con **vista cenital** de la habitación (`openRoom`). ✅
- [x] T3.2 Panel con lista de habitantes (personajes) → clic añade a la habitación (x,y). ✅
- [x] T3.3 Arrastrar para mover · clic selecciona · der/Supr quita · autoguardado en `cells[ij].habs`. ✅
**Verifica**: pongo a Alis en la Taberna, recargo, sigue en su sitio. (Flujo verificado por `curl`.)

### F4 · Composición con escala  —  ✅ done
- [x] T4.1 `downsampleVox(d,4)` por color mayoritario con umbral de llenado (no destructivo). ✅
- [x] T4.2 `composeRoomData` = habitación + habitantes escalados de pie sobre el suelo (z=1). ✅
- [x] T4.3 La miniatura de la celda del mapa (`drawCellComposed`) refleja los habitantes dentro. ✅
**Verifica**: en la miniatura de la Taberna se ven Alis y el Cocinero pequeños dentro. (Render verificado.)

### F5 · Jugar (MVP)  —  ✅ done
Decisiones del usuario: movimiento por **clic (point-and-click con pathfinding)**, personaje **elegido de la galería**, **orientación** al andar.
- [x] T5.1 Botón ▶ Jugar en el editor de habitación + selector de personaje (galería). ✅
- [x] T5.2 Clic en el suelo → ruta BFS 8-dir (esquiva sólidos, no corta esquinas); rejilla pisable = suelo sin sólido a z1..5. ✅
- [x] T5.3 Render iso en vivo (sala cacheada + jugador reducido 4× encima) con **orientación** (4 giros). ✅
**Verifica**: en la Taberna, la ruta rodea la barra (no la atraviesa); clic sobre un sólido va a la casilla pisable más cercana. (Lógica verificada headless.)
**Pendiente menor**: `PLAY_FACING_OFFSET` por si el modelo mira al revés; el jugador se dibuja sobre la sala (sin oclusión por props delante) — mejora futura.

### F6 · Transiciones entre habitaciones  —  ✅ done
- [x] T6.1 Puertas **talladas dinámicamente** (`carveDoorways`) solo en los lados con sala vecina
  (`roomExits`), no destructivo (sobre copia); banda central de 5 casillas, alineadas entre vecinas. ✅
- [x] T6.2 Pisar la puerta (`checkExit`) → `playTransition` carga la sala vecina (`playLoadRoom`) y
  spawnea en la puerta **opuesta**, con **fundido** a negro. El personaje se mantiene. ✅
**Verifica**: Taberna(3,2)→Herrería(4,2) por la puerta E↔O alineada en y=14; spawn correcto. (Headless.)

### F7 · Interacción con NPC  —  ⬜ todo
- [ ] T7.1 Proximidad + tecla acción → bocadillo con nombre/rol (`meta`).
**Verifica**: hablo con el Cocinero y me dice quién es.

### F8+ · Futuro (no planificado en detalle)
Objetos/inventario · combate · misiones · guardado de partida · editor de puertas · mapa NxM configurable.

---

## 🎫 Tickets ABIERTOS — índice

Se acumulan aquí y el dueño va diciendo cuáles se resuelven y en qué orden, según complejidad.
Al cerrar uno: `⬜ todo` → `✅ done (fecha)` y quitarlo de esta tabla.

| ticket | qué es | pinta | decisiones |
|---|---|---|---|
| [BUG-RS10](#-bug-rs10) | el pistón **no empuja estructuras** (sí bloques, sí jugador, sí agentes) | 🟡 abierto 2026-08-07 | **el caso de la captura ya no ocurre** (era [BUG-STR1](#-bug-str1)): el pistón empuja `mc.grid` y no mira `mc.structures`, y eso está escrito como límite conocido de la v1. Preguntar al dueño si aún le molesta antes de tocar nada |
| [BUG-IMP1](#-bug-imp1) | **crash al importar objetos**: `TypeError: hex.slice is not a function` en `shade` → el editor no pinta el modelo importado | 🟡 en curso 2026-08-13 | el color venía como **entero empaquetado**, no `'#rrggbb'`. **Arreglado el crash** en `hex6`/`shade`: un entero se recupera como su hex (`0xff8844`→`#ff8844`), y cualquier otro tipo raro → magenta de error sin tumbar el editor. `test_importar_color.js`. **Pendiente:** que el dueño confirme que los colores importados salen BIEN (si el entero no fuera `0xRRGGBB` sino otro empaquetado, saldría mal; entonces mande el fichero) |
| [REQ-GAL3](#-req-gal3) | poder **cambiar el espacio de nombres de una pieza desde la galería** (mover `asset:` ↔ `hab:`) | 🔴 abierto 2026-08-10 | idea del dueño al hilo de BUG-FLUID3. No es el arreglo de los importados (el motor ya no depende del espacio), sino la herramienta para **colocar** una pieza donde la quieres. Redactado, sin investigar |
| [REQ-FLUID4](#-req-fluid4) | **«ilusión de agua»**: un lago se ve como cubos transparentes con caras internas, no como una masa continua | 🟡 en curso 2026-08-11 | **fases 1-2 (culling en el camino fino) y 3 (vista subacuática) hechas** — `test_caras_fluido.js` + `test_vista_subacuatica.js`. Queda la **fase 4 (reflejos)**, aplazada por el dueño ⇒ [REQ-FLUID5](PLAN_ARCHIVO.md#-req-fluid5) |
| [REQ-ENV1](#-req-env1) | **ambientes realistas**: presets de iluminación (amanecer, mediodía, atardecer, noche, niebla, tormenta, invierno, verano) aplicables con un mando, `game.entorno(nombre)` | 🟡 en curso 2026-08-13 | hecho como **snippet** (`data/snippets/ambientes.json`, `game.entorno`), no `app.js`: compone los mandos que ya existen (`cieloColor` + `reflejoAgua` + `vistaAgua` + `sunShade`) con transición suave. Los 8 presets aplican y transicionan. Fase de **probar y afinar** con el dueño; lo que la iteración destape sale a [REQ-ENV2](PLAN_ARCHIVO.md#-req-env2)/[REQ-ENV3](PLAN_ARCHIVO.md#-req-env3) |
| [REQ-ENV5](#-req-env5) | **reflejos realistas en fluidos**: reflejar objetos del entorno, nubes y terreno en la superficie del agua (no solo el color del cielo) | 🟢 resuelto 2026-08-15 | amplía [REQ-FLUID5](PLAN_ARCHIVO.md#-req-fluid5). Implementado vía **pase especular planar (FBO + cámara invertida en Y + inversión de winding)** y **micro-ondulaciones animadas** en fragment shader (`MC_STRUCT_FS`). Mandos `game.reflejoEntorno`, `game.reflejoOndas`, `game.reflejoPlanoY`. Guardián `tests/test_req_env5_reflejo_entorno.js` |
| [BUG-SNP4](#-bug-snp4) | los cambios hechos en el **editor de código del Mundo se revierten** al volver al mapa y reabrirlo | 🔴 abierto 2026-08-11 | **Redactado, sin investigar.** Sospecha (sin comprobar): el snippet tiene **dos copias vivas** y al reabrir el editor se relee la que se cargó al abrir el Mundo, no la editada. Ojo: el dueño dice **Ctrl+C**, `CLAUDE.md` documenta **Alt+C** |
| [BUG-FLUID5](#-bug-fluid5) | `test_nadar.js` (4 fallos) y `test_hundirse.js` (4 fallos) **miden el fondo del pozo, no el fluido**: son guardianes viejos frente a las constantes **retuneadas** por el dueño | 🔴 abierto 2026-08-11 | **Investigado, sin decidir.** No es una regresión: A/B revirtiendo REQ-FLUID9 sobre `app.js` da el **mismo resultado exacto**. Los dos se escribieron para `gravedad 1/16, empuje 8` y hoy el motor lleva `WATER {0.5, 0.22, 3}` / `LAVA {1, 0.11, 2}` ⇒ con **8× la gravedad de dentro** sus tramos de 120/240 frames cruzan enteros un pozo de 9 y leen `vy = 0`. **Falta que el dueño diga qué manda**: los tests codifican sus decisiones de REQ-FLUID6/7 y las constantes también son suyas. `CLAUDE.md` §🏊 cita las cifras viejas |
| [PERF-RS1](#-perf-rs1) | los observadores **bajan mucho los fps** cuando se encadenan varios; y también con **1 solo botón + 1 observador** | 🟡 reabierto 2026-08-10 (v4) | 4 pasadas hechas — `mcRemeshAround` optimizado (coalescencia por rAF, saltos de `mcComputeBlockLight`, `mcRelightBox`, `mcRebakeStructsNear`, firma en `mcMeshChunk`, tunable `game.redstone.pulsoVisible`). Con la sonda Playwright bajo SwiftShader mejora del 33%, pero el dueño sigue reportando caídas en GPU real. Espera medida en su hardware, ver [REQ-PERF1](#-req-perf1) |
| [REQ-RS11](#-req-rs11) | las piezas de redstone viven mezcladas con los dibujos del dueño en `data/habitantes/`: **carpeta propia**, sin romper `hab:` | 🟡 abierto 2026-08-07 | ya viajan con el repo (excepciones en `.gitignore`); lo que falta es **separarlas** — el namespace tendría que servirse desde dos carpetas. **Sin investigar a fondo** |
| [REQ-DOC2](#-req-doc2) | falta un **mapa del estado interno** de `app.js` (749 KB, 11 437 líneas) | 🟡 abierto 2026-08-07 | la crítica mejor puesta de la auditoría; no es partir el fichero, es documentar qué vive en `state`, `mc` y `game`. **Sin investigar a fondo** |
| [BUG-PERF3](#-bug-perf3) | en un mapa complejo, **colocar un bloque hunde los fps — y depende de DÓNDE se coloque** | 🟨 medido y mejorado ×2,9 (2026-08-12) | **medido**: el 97 % era `mcMeshChunk`, que emitía 594 k vértices finos con `push` de 9 en 9. Ahora reserva el `Float32Array` exacto y escribe por índice: 162 → 57 ms por gesto, geometría byte a byte idéntica. Quedan ×5,3 contra terreno liso ⇒ falta la **medida del dueño** y decidir si se va al mesh incremental. El protocolo ya estaba escrito (`performance/PROTOCOLO_TEST_DUENO.md`) **citando este id, pero el ticket nunca se abrió**. No es [PERF-RS1](#-perf-rs1): allí el trabajo lo dispara el motor de redstone oscilando (`rs.procesarRemallar`), aquí lo dispara **una edición manual** por el camino de `app.js` (`mcSetBlock` → `mcRemeshAround`), así que el *budget* propuesto en `PROPUESTA_PERF-RS1_pasada9.md` **no lo cubre** |
| [REQ-MAP1](#-req-map1) | Alt+M = pantalla de mapas conmutable sin perder el mundo abierto | medio | — |

---

## 🗄️ Tickets CERRADOS — archivo

Movidos aquí para no engordar el índice de arriba (regla: se quitan de la tabla de ABIERTOS al
cerrar). Esto es **solo el índice histórico**: desde el 2026-08-13 el **detalle** de cada uno vive
en **[`PLAN_ARCHIVO.md`](PLAN_ARCHIVO.md)** y su fila enlaza allí. Eran el 69 % de este fichero.
Reabrir uno = devolver su fila a la tabla de arriba **y** su sección desde el archivo.

La columna «pinta» es una **impresión al redactar, no una estimación medida** — varias se escribieron
sin abrir apenas los ficheros, a propósito. La columna «decisiones» recoge lo que el dueño cerró el
2026-08-06 al revisar la cola; el detalle y sus consecuencias están en cada ticket.

| ticket | qué es | pinta | decisiones |
|---|---|---|---|
| ~~[BUG-GLOW1](PLAN_ARCHIVO.md#-bug-glow1)~~ | ~~**revisar si `game.glowLevel` y `game.glowFocus` funcionan bien**~~ | ✅ resuelto 2026-08-14 | la sonda «15 y 5 idénticos» era el **setter que no refrescaba**: llamaba a `mcComputeBlockLight` pero éste se saltaba por su firma `_blEmiSig` (que no incluye glowLevel/glowFocus) ⇒ el cambio no se veía hasta editar un bloque. Arreglado (`mc._blEmiSig=null` en ambos setters). Verificado en vivo: glowLevel 3/6/15 → luz 88/601/4383 (escala), y glowFocus 0→0.9 estrecha el haz (perpendicular 176→0). El dueño lo confirma |
| ~~[BUG-GLOW2](PLAN_ARCHIVO.md#-bug-glow2)~~ | ~~la **luz emisiva de un agente NO le sigue al moverse** (seguir al jugador): se queda en la celda del spawn~~ | ✅ resuelto 2026-08-14 | la siembra de `mcComputeBlockLight` ahora transforma cada `emitCell` por la pose viva `s.model` (misma fórmula col-major que `mcStructVisible`) cuando el emisor va montado en un agente; `mcTrackAgentLights()` (en `mcTick`, tras `mcUpdate`) detecta el cambio de celda y re-siembra + re-malla SOLO el halo viejo∪nuevo. **Conmutable**: `game.agentsLightTracking(true/false)` (defecto on) para medir el coste o desactivarlo. Guardián `tests/test_agente_luz_sigue.js`. Colateral (NPC-cubo `mc.agents` sin luz) queda fuera, anotado en la sección |
| ~~[BUG-GLOW3](PLAN_ARCHIVO.md#-bug-glow3)~~ | ~~la luz del agente que SÍ le sigue (BUG-GLOW2) **hunde los fps** y va **a trompicones** (salta de celda en celda con retardo, no avanza suave con él)~~ | ✅ resuelto 2026-08-14 | sustituido el seguimiento por luz de bloque (granular + BFS por paso) por una **luz DINÁMICA por-fragmento** (`MC_DYNLIGHT_LIB` en los 4 shaders; `mcDynSync` recolecta las 8 celdas emisivas vivas más cercanas al ojo → uniform, sin cuantizar). `mcComputeBlockLight` salta a los emisores montados; solo re-siembra al pasar montado↔quieto. Se comporta como la luz de bloque (resiste noche + `dynLift` repone el brillo horneado; sin sombra). Guardián `tests/test_agente_luz_sigue.js`: sigue **continua** (err 1e-6) y **cero** BFS por paso. `game.agentsLightTracking(true/false)` |
| ~~[REQ-AG17](PLAN_ARCHIVO.md#-req-ag17)~~ | ~~un agente **no debe meterse en el espacio de otro**: lo empuja como mucho, y **se detiene** si el otro no le deja pasar~~ | ✅ resuelto 2026-08-13 | solo `game.esqueletos` (lo acotó el dueño), **todo en el snippet**, cero `app.js`: `parche_snp_ag17.py` → `ag17b.py` → `ag17c.py` (v1.32→v1.35). Un solo embudo, `moverRaiz`, cubre andar + puñetazo + hielo. Pararse sale como `g.por = 3` «bloqueada», que ya estaba en el diagnóstico. Hicieron falta **tres pasadas**: el perdón al que ya estorbaba tenía que ser **condicional**, faltaba **desatasco**, y validar el destino **no es** validar el camino (el golpe da pasos de 0,67 con un cuerpo de 0,8 → atravesaba). `test_agentes_empujan_y_trepan.js` A/B/C/F/G |
| ~~[REQ-AG18](PLAN_ARCHIVO.md#-req-ag18)~~ | ~~**límite de escalada** del agente, editable en el panel dentro de la capacidad **«anda»** (dueño: «max escalar bloques: 3»)~~ | ✅ resuelto 2026-08-13 | medido primero: hoy **se teletransporta hasta arriba** sin importar lo hondo que cayó. La ambigüedad se deshizo al medir — es lo que trepa **de una vez al atascarse**, `def.andar.escalar` **0..8, por defecto 3**; el escalón de andar sigue siendo **uno** y no se toca. `parche_snp_ag18.py` (v1.31→v1.32) + campo en el panel. `test_agentes_empujan_y_trepan.js` D/E |
| ~~[REQ-FLY2](PLAN_ARCHIVO.md#-req-fly2)~~ | ~~en **modo vuelo**, subir/bajar debería ir proporcional a `playerSpeed` y va **mucho más lento**~~ | ✅ resuelto 2026-08-13 | la vertical pasa a `playerSpeed·√scale·volarVel`, como la horizontal; `game.volarVel` es ahora un **multiplicador** (defecto 1, acotado 0,1..10) en vez de u/s absolutos. `test_vuelo.js` §3 mide que subir `playerSpeed` acelera la vertical en la misma proporción (×4 con speed 5→20) |
| ~~[REQ-FLUID5](PLAN_ARCHIVO.md#-req-fluid5)~~ | ~~**reflejos de cielo en la superficie del agua** — la fase 4 de REQ-FLUID4, sacada a ticket propio~~ | ✅ resuelto 2026-08-13 | **enfoque 1** (Fresnel hacia el color de cielo), sin pasada extra ni FBO — nubes/terreno (enfoque 3) no, con PERF-RS1 encima no se doblan draw calls sin medir. Cambio de shader + **una bandera horneada en el canal `emit`** de la cara de arriba del agua: cero atributos/VBO/costuras de caché nuevos, y el uniforme la escala sin re-mallar. Solo agua, solo desde arriba. Playground F12: `game.reflejoAgua/Curva/Opacidad/Color` + `game.cieloColor`. `test_reflejo_agua.js` |
| ~~[REQ-ENV2](PLAN_ARCHIVO.md#-req-env2)~~ | ~~**niebla atmosférica sobre el agua** (fuera del agua), para que NIEBLA/NUBLADO/TORMENTA de [REQ-ENV1](#-req-env1) se vean de verdad~~ | ✅ resuelto 2026-08-13 | `game.niebla({near,far,tinte})`, reusa los uniformes de niebla que ya estaban (`uFog*`): near/far en bloques, tiñe hacia el cielo. Por defecto apagada ⇒ fuera del agua no cambia nada. Cableado en los 8 presets de [REQ-ENV1](#-req-env1). `test_niebla_mundo.js` |
| ~~[REQ-ENV3](PLAN_ARCHIVO.md#-req-env3)~~ | ~~**oscurecer el mundo de noche / nivel de luz global**, para que NOCHE y TORMENTA de [REQ-ENV1](#-req-env1) no salgan con el terreno a plena luz~~ | ✅ resuelto 2026-08-13 | `game.luz(factor)` = **exposición** en el shader (multiplica el color de las superficies), instantánea y **sin re-mallar**; 1 = pleno día (idéntico a hoy), 0 = negro. Las FUENTES emisivas no se apagan (una lámpara sigue de noche). Un uniforme `uExpo` en los 3 programas de color, subido por `mcSunUniforms`. Cableado en los 8 presets. `test_luz_global.js` |
| ~~[REQ-ENV4](PLAN_ARCHIVO.md#-req-env4)~~ | ~~**la luz artificial (antorchas) debe alumbrar de noche también «en la calle»** — `game.luz` oscurecía todo por igual y las fuentes no destacaban al aire libre~~ | ✅ resuelto 2026-08-13 | la luz de bloque va en una **textura 3D** (`mc.blockLight` → `sampler3D`) que el shader lee por posición; la exposición de noche la RESISTE: `mix(uExpo,1,luzDeBloque)`. Se eligió textura (no vértice) para **no tocar formatos de malla** ni sus guardianes. ⚠️ Casi rompe TODO (un `sampler3D` en la unidad 0 choca con el atlas `sampler2D`): siempre a la unidad 2 + 3D dummy. `test_luz_artificial.js` |
| ~~[BUG-SNP3](PLAN_ARCHIVO.md#-bug-snp3)~~ | ~~**`game.bloques.quitar()` está roto**: lanza `ReferenceError: g is not defined` siempre, por ~12 líneas de física pegadas por error en medio de la función~~ | ✅ resuelto 2026-08-13 | las 12 líneas eran un **borrador que nunca se enchufó** en `asentar()` (no se movieron de allí: nacen ya mal puestas en `4fcab25`), así que se borran y ya. Quitarlas **destapa 25 fallos preexistentes** de `test_bloques_comportamiento.js` que el `throw` escondía: son la física de esqueletos de [REQ-AG17](PLAN_ARCHIVO.md#-req-ag17) |
| ~~[REQ-ICON1](PLAN_ARCHIVO.md#-req-icon1)~~ | ~~**`/images`**: que los iconos de la aplicación (favicon, marca, las 11 herramientas) salgan de dibujos vóxel del catálogo, con un sandbox para exportar cualquier dibujo al tamaño y postura que se quiera~~ | ✅ resuelto 2026-08-13 | **rasteriza el navegador** (`pinta()`, las mismas fórmulas que `drawIsoFaces`) y el servidor solo valida y escribe, como `/api/fotos`: llevarse el rasterizador a Python sería el mismo dibujo escrito dos veces. La fuente de verdad es `data/ui/ranuras.json` (asignación); los `.png` son derivados y se **versionan igual**, o un clon recién hecho enseñaría la pestaña rota. **Cero `<img>` a mano en los HTML**: `/favicon.ico` lo sirve `server.py` desde el PNG horneado y `iconos.js` hace el cambiazo de marca y herramientas — **sin publicar, todo se ve exactamente como antes**. `tests/test_images_ui.js` · `tests/test_images_consumo.js` |
| ~~[REQ-OSD13](PLAN_ARCHIVO.md#-req-osd13)~~ | ~~el panel de `game.osd.define({html:…})` es **excesivamente grande**: poder escalarlo, apretar el hueco entre botones y los rellenos~~ | ✅ resuelto 2026-08-13 | las medidas salen a **variables CSS** (`--osd-*`) que el panel consume, y `cfg` solo las escribe: quien no pide nada se ve **byte a byte como antes** (§1 del guardián, que el dueño ya tiene menús en marcha). El espaciado escala continuo, pero **los cuerpos de letra se pegan a la rejilla de 9** de Pixeloid — un menú pequeño y borroso es peor que uno grande. Se aplica en **los dos** sitios de montaje (`mcOsdAbrir` y `mcOsdHtml`), o repintar un botón le cambiaría la talla. `tests/test_osd_medidas.js` |
| ~~[REQ-WIKI1](PLAN_ARCHIVO.md#-req-wiki1)~~ | ~~la **wiki** de `/wiki`: manual de scripting con panel lateral, aspecto wiki y **referencia de API consultable** desde cada ejemplo~~ | ✅ resuelto 2026-08-13 | enrutado por **hash** ⇒ cero rutas nuevas en `server.py` (el estático ya redirige `/wiki` → `/wiki/`). El contenido son `.md` y `api.json` servidos crudos: sin compilación, se editan y se recarga. El enlazado de API es **automático** sobre los `<code>`, así que documentar es añadir la ficha a `api.json` y nada más. `fuente` lleva **símbolo, no línea**, y el guardián lo comprueba contra `app.js`. `tests/test_wiki.js` |
| ~~[REQ-FLY1](PLAN_ARCHIVO.md#-req-fly1)~~ | ~~**modo vuelo** con la tecla `F` (la foto pasa a `Alt+F`): moverse «como dentro de un fluido pero sin caída»~~ | ✅ resuelto 2026-08-12 | rama propia en `mcUpdate` antes de la de fluido: la vertical **no pasa por `mcCaidaPaso`** y es **cero exacto** sin teclas. Las colisiones se mantienen — atravesar es `game.fantasma`, y solo volando. `Alt+F` se detecta por `e.code`, no por `e.key` (con Alt el carácter llega compuesto). `tests/test_vuelo.js` |
| ~~[REQ-OSD2](PLAN_ARCHIVO.md#-req-osd2)~~ | ~~una **capa OSD** encima del juego (`#mc-osd`) y su API `game.osd`, para poner pantallas de menú sobre cualquier mapa~~ | ✅ resuelto 2026-08-12 | `game.osd` (pantalla) ≠ `game.showOSDbuttons` ([REQ-OSD1](PLAN_ARCHIVO.md#-req-osd1), los botones de la esquina). Un botón se identifica **por su texto**, así que una pantalla pasa de `{html:…}` a `{mapa:…}` sin tocar ni una acción. `Esc` de dos pasos: cierra el menú, no el Mundo. `tests/test_osd_capa.js` |
| ~~[REQ-OSD3](PLAN_ARCHIVO.md#-req-osd3)~~ | ~~que una **pantalla OSD sea otro mapa** (`/map/menu1` encima de `/map/test`)~~ | ✅ resuelto 2026-08-12 | `<iframe src="/map/<mapa>?osd=1">` (modo **escaparate**: no guarda, sin hotbar, sin captura de puntero) y **se destruye al cerrar** — es un segundo contexto WebGL. La acción se ejecuta **en el padre**; la pantalla solo dice qué botón se pulsó. `tests/test_osd_mapa.js` |
| ~~[REQ-OSD4](PLAN_ARCHIVO.md#-req-osd4)~~ | ~~los **botones del menú son bloques con texto**: clic en el bloque ⇒ acción (cargar mapa, teleportar, cerrar)~~ | ✅ resuelto 2026-08-12 | la acción se declara **por el texto de la nota** (`mc.notes`): cero infra nueva. **Pulsar no rompe.** Sin mira, la dirección del rayo se deriva del píxel del clic y se reutiliza `mcRaycast` VERBATIM. `tests/test_osd_boton.js` |
| ~~[REQ-INTRO1](PLAN_ARCHIVO.md#-req-intro1)~~ | ~~la **intro de `/map/fps`**: la cámara sobrevuela el mapa en tiempo real y el OSD ofrece **JUGAR** / **CONSTRUIR**~~ | ✅ resuelto 2026-08-12 | se dispara **solo con `?intro=1`** (`/map/fps` a secas no cambia). La animación vive en el snippet **`arranque-<mapa>`**, no en `app.js`, y su bucle (`mc._intro`) se desmonta antes de montar otro. JUGAR **no recarga** y captura el puntero dentro del propio manejador del clic. `tests/test_intro.js` |
| ~~[REQ-INTRO2](PLAN_ARCHIVO.md#-req-intro2)~~ | ~~la intro en **cualquier mapa** (no solo `fps`) y volver a ella desde el editor pulsando **«VOXELFORGE»**, sin recargar~~ | ✅ resuelto 2026-08-12 | respaldo **`arranque-intro`** cuando no hay `arranque-<mapa>` (una sola intro que arreglar); CONSTRUIR pasa de `location.href='/'` a **`closeWorld()`** y la marca llama a **`mcVolverAIntro()`** — editor y Mundo son la misma página. `tests/test_intro.js` §7 |
| ~~[REQ-OSD5](PLAN_ARCHIVO.md#-req-osd5)~~ | ~~**`game.osd.dump()`**: volcar las pantallas definidas con su configuración y las acciones registradas, para que quien no conoce el OSD pueda definir pantallas nuevas~~ | ✅ resuelto 2026-08-12 | imprime **y devuelve** el volcado, y de cada botón enseña su HTML exacto y una **receta que se copia entera a F12 y corre** (entorno resuelto + código + llamada); las acciones tienen **cero parámetros**. Devuelto 3 veces por el dueño hasta llegar a eso. `tests/test_osd_capa.js` §8, 26 ok |
| ~~[REQ-OSD6](PLAN_ARCHIVO.md#-req-osd6)~~ | ~~abrir una pantalla-mapa es **un parpadeo de información**: todo azul, mensajes de carga, y luego el mapa. Un OSD tiene que ponerse **encima**, verse a través, y aparecer **ya cargado**~~ | ✅ resuelto 2026-08-12 | en escaparate el frame se limpia con **alpha 0** (`mcClearFondo`), `#mc-modal`/`body`/`<html>` transparentes, y **ni cartel de carga ni toasts**. El iframe nace invisible con una ruedecita sin fondo y se descubre **de una vez** cuando el hijo manda `{vf:'osd-listo'}` (reloj de 12 s por si no llega). `tests/test_osd_mapa.js` §5 |
| ~~[REQ-OSD7](PLAN_ARCHIVO.md#-req-osd7)~~ | ~~poder indicar en una pantalla-mapa **las coordenadas y la rotación de la cámara**, para encuadrar el menú~~ | ✅ resuelto 2026-08-12 | se declara en el `define` (`pos:[x,y,z], yaw, pitch` — coords como `game.tp`, grados como `game.yaw`) y viaja **en la URL del iframe**, que es el único sitio que llega antes del primer fotograma. **`game.osd.encuadre()`** imprime el `define` ya escrito con la cámara de ahora mismo. `tests/test_osd_mapa.js` §6 |
| ~~[REQ-TOOL1](PLAN_ARCHIVO.md#-req-tool1)~~ | ~~en el Mundo, **una ranura 10** detrás de la 9 que enseña la **herramienta activa** con su dibujo y sirve para cambiarla (**clic** o **alt+P** abren el picker filtrado a herramientas); `P` sigue rotando. Más: **una categoría por pieza** (herramienta, construcción, fluido, redstone…) **elegible desde el editor 2D/3D**~~ | ✅ resuelto 2026-08-12 | el dibujo declara qué herramienta es (`meta.categoria`+`meta.herramienta`), el motor lo deriva del catálogo: nada de claves `hab:` a mano. Ranura 10 con `P`; izquierdo rota, derecho abre el picker de siempre filtrado. De propina, los iconos de las 10 ranuras pasan a ser el dibujo en iso sobre transparente |
| ~~[REQ-GAL4](PLAN_ARCHIVO.md#-req-gal4)~~ | ~~en **la galería 2D/3D y en el picker del mapa**: que el buscador exija **3 letras mínimo**, y **ordenación** — «recientes» por defecto, más «fecha creación», «nombre» y «tamaño»~~ | ✅ hecho 2026-08-12 | Los dos puntos, y los dos **compartidos por las dos galerías**, que es lo que el dueño quiere a la larga: `GAL_MIN_BUSCA`+`galConsulta()` (con menos de 3 letras **no filtra** y avisa) y `GAL_ORDENES`+`galCompara()`+`galMontaOrden()`. «Recientes»=`savedAt` (importado o modificado), «creación»=`createdAt` (que **no se pisa** al reguardar), «tamaño»=nº de voxels; el orden se recuerda en `localStorage`. `server.py` rellena las fechas y el recuento que faltaban en los 70 assets viejos (del mtime) y los persiste. Guardianes: `tests/test_gal4_buscador_min.js` y `tests/test_gal4_orden.js` |
| ~~[REQ-PICK4](PLAN_ARCHIVO.md#-req-pick4)~~ | ~~la tecla **`P`** del Mundo necesita una entrada más: un **«block picker»** — clic en un bloque del mapa y ese material pasa a la ranura elegida del cajón~~ | ✅ cerrado 2026-08-12 | Implementado como **Cuentagotas**, cuarta entrada de `P`. `mcPickBlock()` recorre el rayo con la **misma marcha fina que el pico**, guarda la **clave base** (sin `@ori` ni nivel de fluido) y, si el material ya está en el cajón, **selecciona esa ranura** en vez de duplicarlo. `mcToolPasiva()` deja `select`/`pick` fuera de las tres rutas que colocaban. **Tras pillar, la mano pasa sola a Pintar** (ampliación del dueño del 2026-08-12) y el botón se suelta, o ese mismo clic seguiría pintando. Guardián: `tests/test_cuentagotas.js` |
| ~~[BUG-RS25](PLAN_ARCHIVO.md#-bug-rs25)~~ | ~~la **placa de presión no se desactiva al bajarse** de ella: se queda pegada encendida~~ | ✅ resuelto 2026-08-11 | el latido no se pega: para en seco al bajarse (medido de 4 maneras y en 16 ciclos). Lo roto era el **arranque**: el estado de la placa ES la clave de la rejilla, pero lo que la suelta es un `setTimeout` que **no se guarda con el mundo** — un mundo guardado con la placa pisada volvía pegado para siempre (así estaba `/map/default`). `repasarMundo()` ya hacía esto con el observador guardado encendido; ahora suelta también toda entrada `manual`+`pulso` (cubre el **botón**). Con alguien encima el latido la re-enciende en el mismo frame, así que no reabre BUG-RS22. `tests/test_placa_pegada.js` |
| ~~[PERF-MC3](PLAN_ARCHIVO.md#-perf-mc3)~~ | ~~abrir un mundo VACÍO cuesta 2,2 s; el 81 % es bajar la paleta EN SERIE~~ | ❌ cerrado 2026-08-07 | lo hecho se queda (383 → 63 ms en local, el cartel ya no miente); las propuestas 3 y 4 **no se hacen**: en el enlace del dueño el cuello es la RED, no el motor |
| ~~[BUG-SNP1](PLAN_ARCHIVO.md#-bug-snp1)~~ | ~~«no existe el material X» miente, llena la consola y PIERDE la definición~~ | ✅ resuelto 2026-08-06 | lo que no está **todavía** espera en silencio y entra solo al colocarlo; lo que está **mal escrito** sigue avisando |
| ~~[REQ-PICK1](PLAN_ARCHIVO.md#-req-pick1)~~ | ~~el selector de bloque/textura: ancho, nombres, fuente, menú contextual y filtros~~ | ✅ resuelto 2026-08-08 | ventana a `min(1200px,96vw)`, rejilla `minmax(110px,1fr)`, buscador por texto, filtros por categoría (Bloques, Texturas, Estructuras, Redstone), menú contextual (`ℹ️ Ver ficha`, `✏️ Editar material`), fuente `--font-game` a 9px en 2 líneas con `title` completo |
| ~~[BUG-RS9](PLAN_ARCHIVO.md#-bug-rs9)~~ | ~~el pistón **no empuja al jugador**: te subes encima de la cabeza extendida~~ | ✅ cerrado 2026-08-07 | era `mcUnstick`, que solo busca salida hacia arriba |
| ~~[BUG-RS19](PLAN_ARCHIVO.md#-bug-rs19)~~ | ~~el **observador** se coloca como **bloque** sin girar pero como **estructura** al rotarlo con `R`; y al activarlo, la variante encendida **pierde el `@n`** y apunta a otra dirección~~ | ✅ resuelto 2026-08-10 | **dos arreglos**: (1) `mcRecFina` en `app.js` — una línea: la única pieza de redstone con `pielCubre=true` y `blockLike=false` (observador, 4092 vox) ya entra por ruta fina; (2) `dispararObservador` en `redstone/redstone.js` — quitar el fallback `mc.name2id[quieroOn] \|\| mc.name2id[par.on]` que caía a la clave sin girar cuando `observador-on@n` aún no estaba en la paleta |
| ~~[BUG-RS20](PLAN_ARCHIVO.md#-bug-rs20)~~ | ~~dos **observadores en fila** no se propagan: el de atrás no detecta que el de delante cambió de estado~~ | ✅ resuelto 2026-08-10 | confirmada la sospecha: `dispararObservador` escribe con `yoEscribiendo=true` y el envoltorio de `mcSetBlock` se salta `encolarVecinos`. Se extrae el bucle a `notificarObservadoresVecinos(x,y,z)` y se llama explícitamente tras el `mcSetBlock` protegido (encendido **y** apagado). Cascada A→B→A cortada por `apagones.has(...)` |
| ~~[BUG-RS21](PLAN_ARCHIVO.md#-bug-rs21)~~ | ~~dos observadores en serie con antorcha al final: al **poner** un bloque delante hay **1 parpadeo**, al **quitar** hay **2**. Los correctos son **2 en ambos casos** (Minecraft)~~ | ✅ resuelto 2026-08-10 | el corte por `apagones.has(...)` **descartaba** flancos legítimos durante el pulso del observador. Ahora se **encolan** en `pendientesObs` y se re-disparan al terminar el pulso. Efecto secundario buscado: dos observadores enfrentados oscilan a 100 ms (reloj cara a cara de Minecraft). La marca temporal `apagones.set('obs:'+k, 1)` **antes** de notificar corta la recursión síncrona sin descartar el flanco |
| [BUG-RS22](PLAN_ARCHIVO.md#-bug-rs22) | el **observador mirando una placa de presión pisada** emite **1 pulso cada ~1 s** aunque la placa no cambie de estado (el flanco de subida sí es correcto) | ✅ resuelto 2026-08-10 | la sospecha era buena y se quedó corta: la placa SÍ parpadeaba (`pulso` vencía y el despachador la re-encendía), y además `encender()` avisaba a los observadores aunque no cambiara el bloque. Capacidad nueva `alSeguirPisando` + sin cambio de bloque no hay flanco. `test_placa_observador.js` |
| [BUG-RS23](PLAN_ARCHIVO.md#-bug-rs23) | una pieza **exportada de otra instancia e importada aquí** deja de ser circuito: llega como `asset:assets/piston-pegajoso-on.vox.json` y la tabla solo conocía `hab:piston-pegajoso-on` | ✅ resuelto 2026-08-10 | las piezas se identifican por NOMBRE y se registran en los dos espacios de nombres; el espacio se arrastra a las parejas (cabeza, hoja alta, variante -on). `test_piezas_importadas.js` |
| [BUG-FLUID3](PLAN_ARCHIVO.md#-bug-fluid3) | un **fluido exportado de otra instancia** (`hab:agua`) se importa aquí como `asset:assets/agua.vox.json` y **no se ve bien**; pasa igual con la lava | ✅ resuelto 2026-08-10 | no era el motor de fluidos: era que `setFluid` y `mcMatKey` tenían `hab:agua`/`hab:lava` escritos a mano, así que los niveles copiaban la paleta de un material inexistente → **roca**. `mcNombreMat` + `mcClaveDeNombre` en `app.js`. `test_fluido_importado.js` |
| [REQ-SHADOW2](PLAN_ARCHIVO.md#-req-shadow2) | materiales **sin sombra**: que `white-wool` (y el que se elija) no **reciba** ni **proyecte** sombra, para nubes semirrealistas | ✅ resuelto 2026-08-10 | `define(clave,{recibeSombra:false,proyectaSombra:false})` desde el autorun; banderas sumadas al `aShade`. `test_sin_sombra.js` |
| [BUG-SH2](PLAN_ARCHIVO.md#-bug-sh2) | las nubes con `proyectaSombra:false` **siguen dejando pegote** de sombra debajo | ✅ resuelto 2026-08-11 | era la otra sombra: la SIEMBRA de skylight cortaba la columna en todo lo que no fuera aire. `mcTablaCielo()` la abre solo para `proyectaSombra:false`; `luz:'pasa'` sigue sin abrirla. Cierra la mitad que le faltaba a [REQ-SHADOW2](PLAN_ARCHIVO.md#-req-shadow2) |
| ~~[REQ-FLUID6](PLAN_ARCHIVO.md#-req-fluid6)~~ | ~~**hundirse despacio**: dentro de un líquido la gravedad y la velocidad terminal se reducen~~ | ✅ cerrado 2026-08-11 | cifras tomadas como **RELATIVAS**: fuera no cambia ni un float, dentro gravedad **×1/16** + rozamiento exponencial (la terminal la da el rozamiento, no un tope). **Una sola `mcCaidaPaso` y tres puntos de llamada**, así los agentes caen por donde cae el jugador. Lava más espesa con una sola perilla. `test_hundirse.js` |
| ~~[REQ-FLUID7](PLAN_ARCHIVO.md#-req-fluid7)~~ | ~~**nadar hacia arriba**: dentro, MANTENER salto empuja de forma continua en vez de dar un impulso y caer~~ | ✅ cerrado 2026-08-11 | `mc.keys` ya era **estado**, no flanco: el trabajo estaba en la física. Sexto argumento `nadando` en la misma `mcCaidaPaso`; el tope de subida lo da **el rozamiento que ya existía**, sin techo a mano. Mandan los **pies**, y con suelo debajo gana el salto de siempre. `test_nadar.js` |
| ~~[REQ-FLUID8](PLAN_ARCHIVO.md#-req-fluid8)~~ | ~~**fuentes infinitas**: una celda rodeada de fuentes por los lados y con suelo sólido debajo se vuelve fuente ella también~~ | ✅ cerrado 2026-08-11 | umbral **≥2** (con 1 se inunda el plano entero); «sólido» **estricto**, otra fuente debajo no vale; vale para **cualquier** fluido; las derivadas son fuentes de pleno derecho y romper la original no las degrada. 25 líneas dentro de `processCell`, que **ya iba por cola de eventos**: cuatro sondeos, cero barridos. Válvula `mc.sinFuentesInfinitas`. `test_fuentes_infinitas.js` |
| ~~[REQ-FLUID9](PLAN_ARCHIVO.md#-req-fluid9)~~ | ~~dentro de un fluido, **`W` te lleva donde MIRAS** y **Shift izquierdo hunde** más rápido~~ | ✅ cerrado 2026-08-11 | **séptimo argumento `mira`** en la misma `mcCaidaPaso`: `W`/`S` reparten su empuje entre avanzar (×`cos` del cabeceo) y hundirse/emerger (×`sen`), y Shift es `mira -= 1`. **Un solo presupuesto acotado a ±1** compartido con la tecla de nadar ⇒ salto+Shift se cancelan y mirar arriba saltando no empuja el doble. El rumbo se **acota, no se normaliza** (a plomo, todo lo que aporta `W` va a descenso). Rama propia **antes** del reparto por `mc.onGround`, porque el **air-strafe** que gobernaba el agua no reescribe la velocidad (BUG-ESC1 por el otro lado). Bajar sale más rápido que subir sin cifras nuevas: `−(empuje+1)·g` contra `(empuje−1)·g`. `test_nadar_avance.js` (14 ok). ⚠️ `k['shift']` son las **dos** teclas Shift. Fuera del scope, sin pedir: factor de marcha e inercia al soltar |
| [BUG-FLUID4](PLAN_ARCHIVO.md#-bug-fluid4) | **caras traslúcidas marcadas** bajo un fluido en los bloques que **no llenan el lateral de su celda** | ✅ resuelto 2026-08-11 | la sospecha era correcta: `mcTapaCara` dice `false` sobre **toda** celda fina (la regla de las hojas «fancy»), así que una flor metida en el lago no tapaba ninguna cara y el fluido emitía **las 5** que la rodean — láminas sueltas marcando el hueco, que es lo de las capturas (`data/tickets/BUG-FLUID4/`). La pregunta dentro de `tapadasFluido` es otra: no «¿tapa la cara del vecino?» sino **«¿ocupa la celda?»** (sin waterlogging, una pieza fina ha REEMPLAZADO al líquido). `tapaAlFluido`, local al culling de REQ-FLUID4; `mcTapaCara` **sin tocar**. Medido +5 → **0** caras extra en agua y lava, igual que la roca; el aire (`nId 0`) sigue emitiendo. §5 de `test_caras_fluido.js` |
| [BUG-RAY2](PLAN_ARCHIVO.md#-bug-ray2) | el aim **choca con la celda entera** de un cable o una alfombra en el suelo: apuntando al muro de detrás se borra el cable, o el bloque nuevo sale encima de él | ✅ resuelto 2026-08-11 | es **[BUG-RAY1](#-bug-ray1) en la otra mitad del mundo**: desde que el clic derecho mete en `mc.grid` lo que cabe en su celda, el rayo preguntaba `mcSolid` (celda 16³) por una pieza de 1 voxel de alto. `mcRejillaSolidAt` + `mcRejillaRayHit` (sub-DDA fino acotado a la celda, como el de estructuras) en `mcRaycast` y `mcBreak`. Sin materiales finos, byte-idéntico. `test_rayo_apuntado.js` |
| [BUG-RS24](PLAN_ARCHIVO.md#-bug-rs24) | **no se puede hacer clic (botón central) sobre una pieza de redstone que está dentro de un fluido**: el rayo se para en el agua | ✅ resuelto 2026-08-11 | el rayo del snippet (`miraFina`, en `redstone/redstone-piezas.js`) es una **re-implementación** del de `app.js` a la que nunca le llegó la guarda `!mcIsCellReplaceable`; desde REQ-FLUID4 un fluido es fino-en-la-rejilla con el bitset **LLENO** (4096/4096), así que «¿cruzo un voxel fino lleno?» dice que sí en la primera celda de líquido. `VERSION` a `piezas-1.5`. `test_clic_bajo_fluido.js` |
| ~~[REQ-PERF1](#-req-perf1)~~ | ~~**profiler con callstack automático** que se activa cuando los fps caen por debajo de un umbral, con niveles de verbosidad, para identificar el cuello real~~ | ✅ resuelto 2026-08-10 | `game.perfAssert = 120` (fps mínimo), `game.perfVerbosity = 1..3`. `mcTick` mide su duración; si el frame cae bajo el assert, vuelca al `console.log` las funciones llamadas + calls + ms + max. Se desarma tras un dump; `game.perfDump()` re-arma. Con `perfAssert = 0` (defecto) las envolturas se retiran → coste 0 |
| ~~[REQ-PERF2](PLAN_ARCHIVO.md#-req-perf2)~~ | ~~**modo de renderizado "fast" (unlit)** desde F12 — sin luces ni sombras, para depurar el motor bajando todo el coste de renderizado~~ | ✅ resuelto 2026-08-10 | `game.renderMode = 'fast'`/`'normal'`. `fast` combina `sunShade=1` (sin sombra) + `interiorDark=1` (sin skylight) + short-circuit en `mcComputeBlockLight` (sin luz de bloque). Al cambiar re-malla el mundo para reflejar el shading. Restaura los valores al volver a `normal` |
| ~~[REQ-TEST1](PLAN_ARCHIVO.md#-req-test1)~~ | ~~79 `test_*.js` sueltos en la raíz y **ningún runner**: no hay forma de correr la suite ni de saber cuáles necesitan servidor~~ | ❌ archivado 2026-08-10 | archivado a petición del dueño. Fila **duplicada**: el mismo id ya figura ✅ resuelto más abajo, y lo que pedía está hecho — `correr_tests.js` con `--list`/`--node`/`--pw`/`--area=`, y los **96** tests etiquetados |
| ~~[REQ-DOC1](PLAN_ARCHIVO.md#-req-doc1)~~ | ~~`CLAUDE.md` son 239 KB con **12 encabezados `##`**: lo que está documentado no se encuentra~~ | ❌ archivado 2026-08-10 | archivado a petición del dueño. Fila **duplicada**: el mismo id ya figura ✅ resuelto más abajo (Mapa de Navegación en la cabecera de `CLAUDE.md`) |
| ~~[BUG-STR1](#-bug-str1)~~ | ~~`hab:cubo-trans` acaba como **estructura fina** y no como **bloque** de rejilla~~ | ✅ cerrado 2026-08-07 | no era la válvula ni «el cubo es hueco»: era el **alpha**. Un macizo translúcido ya entra en `mc.grid` con geometría real y pasada de BLEND; `mcRecFina` es ahora la fuente única de esa regla |
| [REQ-MNT2](PLAN_ARCHIVO.md#-req-mnt2) | marcar desde el **editor de agentes** qué pieza es **montable**, sin `game.esqueletos.montable(…)` a mano | ✅ cerrado 2026-08-07 | Casilla «te lleva montado» por pieza (también en la raíz); la marca vive en el **documento** y la aplica el snippet al plantar. La API queda como válvula por instancia |
| ~~[BUG-AG1](PLAN_ARCHIVO.md#-bug-ag1)~~ | ~~los **agentes articulados** no los empuja el pistón ni pueden pisar placas~~ | ✅ cerrado 2026-08-07 | eran **tres** fallos; BUG-AG2 hacía falta pero no bastaba |
| ~~[BUG-AG2](PLAN_ARCHIVO.md#-bug-ag2)~~ | ~~los **agentes articulados** no respetan el cuerpo real de los bloques: placa de 1 voxel ⇒ suben 16~~ | ✅ cerrado 2026-08-07 | `asentar()` los plantaba en el techo de la celda |
| ~~[BUG-AG3](PLAN_ARCHIVO.md#-bug-ag3)~~ | ~~un agente articulado **sin la capacidad «te persigue»** sale roto: piezas sueltas, no mira, no se le empuja~~ | ✅ | eran dos: `quitarEsqueleto` borraba por referencia y perdía las piezas tras un `mcRestampAll`, y apagar «te persigue» se negaba a plantar el rig; ahora es una estatua que te mira |
| [BUG-AG4](PLAN_ARCHIVO.md#-bug-ag4) | te subes al **torso** de un agente pero **la cabeza no es sólida**: la traspasas y caes al torso | ✅ hecho | la solidez sigue ahora la **matriz** de cada pieza, no su desplazamiento |
| [BUG-AG5](PLAN_ARCHIVO.md#-bug-ag5) | el agente **anda contra el pistón** que lo empuja: no llega al desplazamiento pedido o se sube encima | ✅ hecho | `game.esqueletos.aturdir(rig, s)`; el pistón la usa, `game.redstone.shockPiston` la ajusta |
| [BUG-AG7](PLAN_ARCHIVO.md#-bug-ag7) | te **subes solo a los brazos** de un agente al rozarlos; el dueño pide el «unstick» automático apagado | ✅ hecho | `game.autoUnstick = false` por defecto; a mano con la tecla **U**. Era secuela de [BUG-AG4](PLAN_ARCHIVO.md#-bug-ag4) |
| ~~[BUG-AG9](PLAN_ARCHIVO.md#-bug-ag9)~~ | ~~la capacidad **`mirar`** no tiene tope VERTICAL: encima de su cabeza el cuello te sigue apuntando~~ | ✅ resuelto 2026-08-07 | `mirar.limites.x`, defecto `[-70,70]`; fuera del cono la pieza **se rinde** (un rig no cabecea, pinzarlo lo deja de maniquí) |
| ~~[BUG-AG10](PLAN_ARCHIVO.md#-bug-ag10)~~ | ~~la capacidad **`seguir`** detecta en **esfera**: te ve por la espalda y arranca a perseguirte~~ | ✅ resuelto 2026-08-07 | `seguir.vision`, defecto 180°; acota **EMPEZAR** y solo tras el jugador — ya persiguiendo manda `deteccion`, así que rodearle no le hace perderte |
| ~~[REQ-AG12](PLAN_ARCHIVO.md#-req-ag12)~~ | ~~**`cabalgable`**: montado en él **se queda quieto** y además **lo conduces** — hoy montado te lleva de vuelta al ancla~~ | ✅ resuelto 2026-08-08 | `G.cabalgable` + tarjeta `🏇 Cabalgable` en el editor; A/D giran montura y vista del jugador (`mc.yaw`), W/S avanzan de frente |
| ~~[BUG-RS12](#-bug-rs12)~~ | ~~la **cabeza del pistón** de redstone tiene energía y no debería~~ | ✅ resuelto 2026-08-08 | `hab:piston-cabeza: {}` en `CIRCUITOS` (`redstone-piezas`); ya no actúa de bloque puente ni propaga energía |
| ~~[BUG-RS13](#-bug-rs13)~~ | ~~al **empujar una placa con pistón**: a) la placa queda encendida (`placa-on`) b) el jugador no es empujado~~ | ✅ resuelto 2026-08-08 | restaura a `hab:placa` al desplazarla + `apartarJugador` evalúa si el jugador está en las celdas barridas |
| ~~[BUG-RS14](#-bug-rs14)~~ | ~~al **empujar un bloque de redstone con pistón**: el pistón lo desplaza pero se vuelve a cerrar instantáneamente~~ | ✅ cerrado 2026-08-08 | pretendido / comportamiento idéntico a Minecraft (se retrae al perder el contacto directo de señal) |
| ~~[BUG-AG14](#-bug-ag14)~~ | ~~**toast Atascado (tecla U) salta en micro-falsos positivos**: necesita umbral de tiempo mínimo (ej: `game.minStickedTime = 1`)~~ | ✅ resuelto 2026-08-08 | `mc.stuckTime` acumula colisión continuada; sólo muestra toast si `stuckTime >= game.minStickedTime` (defecto 1,0 s) |
| ~~[REQ-AG15](#-req-ag15)~~ | ~~**reposicionarse en la montura**: manteniendo `Shift` + WASD mover al jugador sobre la superficie de la montura sin mover al agente~~ | ✅ resuelto 2026-08-08 | `repos = (Shift)` ignora conducción del agente en `pasoSeguir` y habilita marcha del jugador en `app.js` (`mcUpdate`) |
| ~~[REQ-DOC1](PLAN_ARCHIVO.md#-req-doc1)~~ | ~~`CLAUDE.md` está documentado pero **no es navegable** (239 KB sin índice ni TOC)~~ | ✅ resuelto 2026-08-08 | Mapa de Navegación del Documento (TOC) en cabecera + sección `🧪 Batería de Pruebas` |
| ~~[REQ-AG13](PLAN_ARCHIVO.md#-req-ag13)~~ | ~~**dibujar el cono de visión** de un agente: hoy no hay forma de VERLO, solo la tabla~~ | ✅ resuelto 2026-08-08 | `mcPushVisionCones` proyecta conos 3D de `seguir.vision` (ámbar) y `mirar.limites` (cian); activable con `game.verConos = true` o `game.conosVision` o `mc.xray` |
| [BUG-AG16](#-bug-ag16) | el **cono de visión cian** (`mirar.limites`) se ve como un plano: ajustar pirámide/proyección 3D | 🟡 archivado 2026-08-08 | ticket anotado a petición del usuario para resolver más adelante |
| ~~[BUG-PICK2](#-bug-pick2)~~ | ~~la detección de componentes **redstone** en el picker usa una lista de palabras clave hardcodeada (`rsTerms`): debería basarse en una **propiedad del dato**~~ | ✅ resuelto 2026-08-08 | `meta.categoria: "redstone"` en 21 habitantes + 1 asset; `list_all()` y `index.json` propagan `categoria`; `mcRenderPickerGrid` usa `c.categoria === 'redstone'` sin hardcodeo |
| [REQ-ED1](#-req-ed1) | permitir ver y cambiar la **categoría de un bloque a redstone** desde el editor 3D/2D y mostrarla en su ficha | ✅ done 2026-08-09 | Añadido selector `<select id="meta-categoria">` en el panel de Objeto, sincronizado con `state.meta.categoria`, y mostrado en la Ficha del Material (`mcShowItemCard`) |
| [REQ-PICK3](#-req-pick3) | filtrar las fichas de la galería del mapa exclusivamente por **categoría del objeto** (`categoria`: "general" / "redstone"), eliminando el filtrado por tipo ("bloques", "texturas", "estructuras") | ✅ done 2026-08-09 | Simplificados los botones de filtro a `Todos`, `General` y `⚡ Redstone`. La lógica de `mcRenderPickerGrid` filtra ahora por `c.categoria === 'redstone'` vs `general` |
| [REQ-ED2](#-req-ed2) | implementar en las galerías de carga del editor 3D/2D (habitantes, assets, habitaciones) el mismo formato de **búsqueda por texto y filtrado por categoría** ("Todos", "General", "⚡ Redstone") que el picker del mapa | ✅ done 2026-08-09 | Añadida barra de búsqueda `#hab-picker-search` y botones `#hab-picker-filters` (`Todos`, `General`, `⚡ Redstone`) en `#hab-modal` (`index.html`) e integrada la lógica en `renderHabGrid` de `app.js` |
| [BUG-RS10](#-bug-rs10) | **botón → cable → repetidor**: al apagar el botón, el cable se apaga pero el repetidor permanece encendido | ❌ archivado 2026-08-08 | Archivado a petición del usuario |
| [BUG-RS11](#-bug-rs11) | **bloque de redstone → inversor**: el inversor permanece encendido cuando debería aparecer apagado | ❌ archivado 2026-08-08 | Archivado a petición del usuario |
| [BUG-RS12](#-bug-rs12) | **placa → cable → inversor**: no se invierte sin rotación `@` (funciona en `inversor-on@3` pero falla en `inversor-on`) | ❌ archivado 2026-08-08 | Archivado a petición del usuario |
| [REQ-RS13](#-req-rs13) | añadir **retardo de señal (mínimo 1 tick)** al repetidor redstone y a la antorcha redstone / inversor | ❌ archivado 2026-08-09 | Archivado a petición del usuario |
| [REQ-RS14](#-req-rs14) | **Rayos-X** debe mostrar el **retardo que introducen los bloques de redstone** (igual que muestra el power) | ✅ done 2026-08-08 | Implementado el retardo en ticks `(Nt)` para componentes con retardo en `señalRayosX` de `redstone.js` y adaptado `test_rayos_x_power.js` |
| [BUG-RS18](#-bug-rs18) | pistones enfrentados con cableado (arena se queda pegada al pistón contraído con inversor) — retardo del inversor desincroniza | ❌ archivado 2026-08-08 | archivado a petición del usuario |
| ~~[REQ-RS18](#-req-rs18)~~ | ~~implementar bloque **observador** (observer): detecta cambio de bloque DELANTE y emite pulso de 15 por DETRÁS~~ | ✅ resuelto 2026-08-09 | `dispararObservador` en `redstone.js`; `soloAlAtras` en `salidaDe`; `repasarMundo` devuelve a OFF los observadores-on persistidos; snippets actualizados con `make_snippets.js`; ejemplo 10 en `/map/redstone` |
| ~~[BUG-FLUID2](#-bug-fluid2)~~ | ~~los **agentes articulados no caen por huecos ni en fluidos**: reescrito `asentar` con gravedad real y búsqueda de suelo arriba+abajo~~ | ✅ resuelto 2026-08-10 | `asentar` simplificado con gravedad (22 bloques/s²), búsqueda de superficie con "aire encima" arriba y sin condición abajo, recuperación cuando `footY<0`, colisión horizontal a `_yEntry`, tope en Y=0 |
| [REQ-RS15](#-req-rs15) | implementar bloque de redstone **pistón pegajoso** (sticky piston) | ✅ done 2026-08-08 | `hab:piston-pegajoso` / `-on` / `-cabeza`: extiende como el normal, al retraerse tira del bloque que tenía delante (1 bloque, como Minecraft); no tira de inamovibles ni de otros pistones extendidos; JSON tintados de verde |
| [REQ-RS16](#-req-rs16) | permitir hacer bloques con propiedad aislante desde su definición .json (p.ej: `cubo-trans` es aislante y no conduce redstone) | ✅ done 2026-08-08 | Cargada propiedad `aislante` en `getTexDef` y `mcBuildPaletteImpl`, propagada a `mc.aislanteDoc`, evaluada en `redstone.js` (`cacheIds`) e inyectada en `cubo-trans.vox.json` |
| [REQ-RS17](#-req-rs17) | hacer que la obsidiana sea inamovible (bloquea la extensión del pistón) desde la propiedad `inamovible` del material | ✅ done 2026-08-08 | Añadida propiedad `inamovible` en `obsidiana.vox.json`, propagada en `getTexDef` y `mcBuildPaletteImpl` de `app.js` a `mc.inamovibleDoc`, y validada en `accionar` de `redstone-piezas.js` |
| ~~[REQ-FLUID1](#-req-fluid1)~~ | ~~implementar **sistema de fluidos estilo Minecraft (agua y lava)** con niveles (0 a 7), desplazamiento por pistones/bloques y propagación por autómata celular tick-based~~ | ✅ resuelto 2026-08-08 | Implementado `game.fluidos` (`mcFluids`) en `app.js`, `agua.json` y `lava.json` en habitantes; soporte para niveles 0..7, propagación vertical y horizontal, recesión por recálculo, reemplazo directo en pistones y `test_req_fluid1_sistema_fluidos.js` (12/12 ok) |
| ~~[REQ-TEST1](PLAN_ARCHIVO.md#-req-test1)~~ | ~~85 `test_*.js` sueltos en la raíz y **ningún runner**: no hay forma de correr la suite ni de saber cuáles necesitan servidor~~ | ✅ resuelto 2026-08-08 | `correr_tests.js` runner CLI con `--node`, `--pw`, `--area=...`, `--list`, pre-flight HTTP `:8500` y cabeceras declarativas `@area` / `@necesita` en los 85 tests |
| ~~[BUG-AG11](PLAN_ARCHIVO.md#-bug-ag11)~~ | ~~montado en su cabeza **te sigue viendo**, y con el cuello a 0 se pone a **dar vueltas en círculo**~~ | ✅ resuelto 2026-08-07 | no hay parámetro: `rig.llevando` ⇒ **no te ve** (ni persigue ni encara) + guardia del `atan2(0,0)` para la distancia horizontal ~0. Sí sigue aplicando `volver`: **montado ≠ cabalgable** (dueño) |
| ~~[BUG-AG8](PLAN_ARCHIVO.md#-bug-ag8)~~ | ~~`test_esqueleto_navegador.js` falla 3 casos en `/map/agents`: quedan piezas de rig **sin recoger**~~ | ✅ resuelto 2026-08-07 | no había basura ninguna: eran los **49 carteles de las notas**. Fallo del test, motor intacto; **15 ok, 0 fallos** |
| ~~[REQ-DBG2](PLAN_ARCHIVO.md#-req-dbg2)~~ | ~~el toast **«Atascado»** no dice **por qué**: hay que poder saber quién te atrapa (casi siempre un agente)~~ | ✅ resuelto | ~~nace del aviso que añadió [BUG-AG7](PLAN_ARCHIVO.md#-bug-ag7)~~ · dice la pieza Y el agente; `game.atasco()` |
| ~~[REQ-MNT1](PLAN_ARCHIVO.md#-req-mnt1)~~ | ~~el `passengers:true` de los NPC-cubo **no existe** para un agente articulado: te subes a la cabeza y se va sin ti~~ | ✅ resuelto 2026-08-07 | `game.esqueletos.montable(id,'cabeza')`; acarreo **rígido** (el giro también te lleva). Cero líneas de `app.js` |
| [BUG-AG6](PLAN_ARCHIVO.md#-bug-ag6) | con `escala` puesta, el **preview** del editor de agentes se ve roto; debe verse como siempre | ✅ hecho | `prepararEsqueleto` ya no lee `def.escala`; **revirtió** una decisión de [REQ-AGESC1](PLAN_ARCHIVO.md#-req-agesc1) |
| ~~[BUG-ROT2](PLAN_ARCHIVO.md#-bug-rot2)~~ | ~~las piezas de un esqueleto siguen **recortadas a 16 posturas** (`rot & 15`)~~ | ✅ resuelto 2026-08-07 | `oriDePieza` = `mcOriNorm`: era el **último `& 15`** vivo del repo |
| [REQ-AGESC1](PLAN_ARCHIVO.md#-req-agesc1) | **escala del agente** en el editor de agentes: enanos y gigantes del mismo dibujo | ✅ hecho | escalas **libres** (×1,4); la caché por clave+rot **no** hacía falta tocarla |
| ~~[BUG-RS7](PLAN_ARCHIVO.md#-bug-rs7)~~ | ~~el pistón no se puede poner **apuntando hacia arriba**: se coloca de lado~~ | ✅ resuelto 2026-08-06 | el circuito lo acostaba al soltarlo; ahora el frente sale de `mcOriPerm` y puede ser `±Y` |
| ~~[BUG-RS8](PLAN_ARCHIVO.md#-bug-rs8)~~ | ~~accionar la palanca la **mueve de celda** y le cambia el giro~~ | ✅ resuelto 2026-08-06 | **el mismo fallo que BUG-RS7**: redstone recortaba la postura a 4 bits y hay 24 |
| ~~[BUG-RS6](PLAN_ARCHIVO.md#-bug-rs6)~~ | ~~agrandar la puerta a 16×16×24 la convierte en **estructura** y deja de ser redstone~~ | ✅ resuelto 2026-08-06 | la puerta son **dos celdas de rejilla** que se mueven en la misma pasada; muere el apaño de `conduce` |
| ~~[REQ-NAV1](PLAN_ARCHIVO.md#-req-nav1)~~ | ~~la barra superior se reduce a `[Galería] [🌍 Mundo] [⋯]`~~ | ✅ resuelto 2026-08-07 | de 15 botones a 3; la cabecera baja a **una fila de 70,6 px** a 390 px; la Galería lo enseña **todo, sin clasificar**; `test_barra_tres_botones.js` **22 ok** |
| ~~[REQ-XR1](PLAN_ARCHIVO.md#-req-xr1)~~ | ~~rayos-X tapa lo que marca: inservible para capturas~~ | ✅ resuelto 2026-08-06 | solo aristas: del 92,2 % de pantalla tapada al 4,9 % |
| ~~[REQ-XR2](PLAN_ARCHIVO.md#-req-xr2)~~ | ~~rayos-X: una línea más en la etiqueta con el **power** del bloque~~ | ✅ resuelto 2026-08-06 | `⚡ recibe → saca` en las piezas y `⚡ n débil` en los bloques que hacen de puente; el 0 no se pinta |
| ~~[BUG-RS2](PLAN_ARCHIVO.md#-bug-rs2)~~ | ~~los repetidores de redstone girados no funcionan~~ | ✅ resuelto 2026-08-06 | el giro estaba BIEN; lo que fallaba era que el repetidor emitía por 5 lados, y los 3 «rotos» miraban a otro lado |
| ~~[REQ-CART2](PLAN_ARCHIVO.md#-req-cart2)~~ | ~~la ventana de editar nota (tecla `N`) es diminuta y su letra también~~ | ✅ resuelto 2026-08-06 | 720px y 18px de serie + `game.noteFont`/`game.noteWidth` por consola |
| ~~[REQ-CART3](PLAN_ARCHIVO.md#-req-cart3)~~ | ~~los carteles de las notas, que ahora son botones de menú, apenas se configuran (escala, palo, sitio) y su rótulo se desvanece~~ | ✅ resuelto 2026-08-12 | `game.carteles` (escala/palo/desvío/giro) replantando por firma; `noteTextDist` 14 → **21** y **sin límite** en pantalla-menú; `test_carteles.js` **26 ok** |
| ~~[REQ-ARR1](PLAN_ARCHIVO.md#-req-arr1)~~ | ~~definir comportamientos **por mapa**: el único autoarranque que hay es global y avisa en los mapas donde la pieza no está~~ | ✅ resuelto 2026-08-13 | **`mundo-<mapa>`** corre justo después del global, hereda lo suyo y no se avisa si no existe. NO es `arranque-<mapa>` (la intro, atada a `?intro=1`). `tests/test_arranque_mapa.js` **11 ok** |
| ~~[REQ-SNIP1](PLAN_ARCHIVO.md#-req-snip1)~~ | ~~depurar un snippet que revienta es una caza a ciegas: el navegador dice «VM2571» y una línea que no es la del panel~~ | ✅ resuelto 2026-08-13 | informe con la línea **del panel**, su texto y el contexto; la línea viaja en `err.vfLinea` y el panel **lleva el cursor** hasta ella. El desfase del preámbulo se **mide**, no se cablea. `tests/test_snippet_depurar.js` **13 ok** |
| ~~[REQ-RS4](PLAN_ARCHIVO.md#-req-rs4)~~ | ~~un bloque que recibe energía debe **energizarse** y alimentar lo que tenga pegado~~ | ✅ resuelto 2026-08-06 | r1.2: fuerte/débil, `aislante()`, `test_redstone_bloques.js` |
| ~~[REQ-RS5](PLAN_ARCHIVO.md#-req-rs5)~~ | ~~el **bloque de redstone** (fuente permanente); un repetidor encima no se activaba~~ | ✅ resuelto 2026-08-06 | pieza nueva + `red_concrete` **estaba declarado fuente** en `DEFECTOS` (quitado). Repetidor encima = solo soporte, como en Minecraft |
| ~~[BUG-GAL1](PLAN_ARCHIVO.md#-bug-gal1)~~ | ~~editar el cable de redstone creó una pieza **nueva** en vez de reemplazar la vieja~~ | ✅ resuelto 2026-08-06 | Guardar enrutaba por `meta.type`, no por la galería de la que salió la pieza |
| ~~[BUG-GAL2](PLAN_ARCHIVO.md#-bug-gal2)~~ | ~~el botón «Ficha» solo sale en una de las dos copias del cable~~ | ✅ resuelto 2026-08-06 | la ficha era solo de assets; ahora también de habitantes, diciendo que su única clave es `hab:<id>` |
| ~~[BUG-RS5](PLAN_ARCHIVO.md#-bug-rs5)~~ | ~~el cable de redstone modificado no conduce~~ | ✅ resuelto 2026-08-06 | era consecuencia de BUG-GAL1, como decía el ticket: el dibujo acabó en `asset:` y el circuito es `hab:` |
| ~~[BUG-ESC1](PLAN_ARCHIVO.md#-bug-esc1)~~ | ~~al montar en una escalera se conserva el movimiento lateral: te mueve solo y te tira~~ | ✅ | colgado mandaba la rama de aire de `app.js` (sin rozamiento ni reescritura desde teclas); agarrado se manda por la de tierra |
| ~~[BUG-ROT1](PLAN_ARCHIVO.md#-bug-rot1)~~ | ~~`R` y `Shift+R` no alcanzan las 24 orientaciones: hay colocaciones imposibles~~ | ✅ resuelto 2026-08-06 | eran 16 (faltaba el tercer cuarto de vuelta); `MC_ORI` se **deriva**, y sale agrupada de 4 en 4 ⇒ `ori = cara*4 + giro` es el gesto que pidió el dueño |
| ~~[PERF-MC2](PLAN_ARCHIVO.md#-perf-mc2)~~ | ~~sub-chunk culling de estructuras~~ | ❌ cerrado 2026-08-07 | **sin hacer, por decisión del dueño**: nadie ha vuelto a reportar fps bajos por estructuras desde que se midió que el cuello era otro |

---

## Incidencias — todas RESUELTAS (2026-07-20)

### ✅ BUG-DT1 · `room.doorTrim` recorta de más: parte muebles del centro y atraviesa muros/objetos lejanos — ✅ done (2026-07-20)
**Resuelto**: se separa el **vano del muro** (siempre pisable) del **recorte de mueble** (`doorTrim`).
`carveDoorways` usa una media anchura MÍNIMA `WALL_HW_NATIVE=3` (`wallHwC=max(trimC,wallMin)`) y su
`punch` ahora **salta el margen vacío** exterior (las salas nativas tienen el muro embutido, no en el
borde) y para en el primer hueco interior ⇒ `doorTrim=0` abre igualmente un vano de 7 sin cortar
muebles (antes cortaba en el margen y no llegaba al muro, o dejaba una ranura de 1 vóxel). `doorTrim<0`
= puerta cerrada (no se talla). `clearExitLanes` solo se llama con `doorTrim>0` y **acota la profundidad**
a `depthC` casillas desde el muro (16 nativo / 4 legado) en vez de barrer hasta el centro ⇒ un mueble
LEJANO/CÉNTRICO (celda, yunque) queda intacto. `play.doorHw` (zona de disparo de salida) pasa a ser el
vano real (`wallHwC·f`), no el trim. Verificado headless con taberna/mazmorra/herrería: `trim=-1`⇒0
borrados, `trim=0`⇒solo el muro del vano (muebles intactos, `minX`=muro), `trim=4/7`⇒vano+carril
acotado (nada por debajo de `x<96`, centro=56 intacto).
Reportado 2026-07-20 (con capturas). Afecta a `clearExitLanes`/`carveDoorways` (app.js) y al mando
`room.doorTrim`.

**Síntomas observados**
1. `room.doorTrim = 0` **no deja el mueble intacto**: en la taberna se ve la **mesa/barra partida**
   (una rebanada por el centro).
2. `room.doorTrim = 0` en la mazmorra abre un **"láser"** — una ranura de 1 vóxel que **atraviesa el
   muro** de lado a lado.
3. `room.doorTrim = 4` abre el vano del muro **pero también rompe objetos de la escena LEJANOS** a la
   puerta (p. ej. la celda de barrotes, en el lado opuesto de la sala).

**Causa raíz (análisis)**
- La banda del carril se acota con `Math.max(0,cym-hw)..Math.min(dim-1,cym+hw)`, así que `hw=0`
  produce **1 fila** (no 0). Resultado: a `doorTrim=0` sigue habiendo carril de 1 de ancho → corta el
  mueble que cruza `y=cym` y `carveDoorways` perfora el muro 1 vóxel (el "láser"). **`0` debería ser
  "sin recorte" (nada que cortar).**
- `clearExitLanes` despeja **desde el borde hasta el CENTRO** (`x` de `cxm` a `dim.x`, etc.). Es decir,
  vacía la banda central en **media sala entera**, no solo junto a la puerta → parte muebles lejanos
  (la celda). El despeje debería **pararse al reconectar con el interior pisable**, no llegar al centro.
- El **ancho del vano del muro** (necesario para pasar) y el **despeje de mueble** (cosmético/holgura)
  comparten el mismo `hw`. Convendría separarlos: la puerta del muro con un ancho mínimo sensato propio,
  y `doorTrim` controlando SOLO cuánto mueble se aparta (0 = nada).

**Propuesta de arreglo (a decidir)**
- `doorTrim<=0` ⇒ **no** llamar a `clearExitLanes` (mueble intacto); la puerta del muro se sigue
  abriendo con un ancho mínimo propio (no atado a `doorTrim`) para poder pasar.
- Limitar la **profundidad** del despeje: avanzar desde el borde y **parar** al alcanzar suelo pisable
  abierto (o un tope pequeño), en vez de barrer hasta el centro.
- Separar `wallDoorHw` (abrir muro, fijo/mínimo) de `doorTrim` (apartar mueble, ajustable, 0=off).

**Verificación esperada**
- `doorTrim=0` ⇒ ningún mueble cortado y ninguna ranura en el muro (headless: la sala tras carve/clear
  == asset original salvo el vano de puerta mínimo).
- `doorTrim=4` ⇒ vano abierto y corredor recto junto a la puerta, **sin** tocar muebles a >N celdas
  del vano.
- Sigue habiendo paso pisable por cada salida real (test de corredor ≥ huella).

> **Reconfirmado 2026-07-20**: el usuario reporta que `room.doorTrim = 0` **SIGUE rompiendo voxels**
> (mesa/muebles partidos). Sigue abierto y sin arreglar; **subir prioridad**. Recordatorio: al tocar
> `doorTrim` la recarga es en vivo, así que se ve al instante.

### ✅ BUG-RM1 · `room` en la consola muestra el Proxy, no el diccionario de propiedades — ✅ done (2026-07-20)
Reportado 2026-07-20. Afecta a `window.room` (Proxy inspector en app.js).
**Resuelto**: `room` pasa de `Proxy({},…)` a **OBJETO PLANO** con `Object.defineProperty` (accessors
enumerables), así la consola lo muestra como diccionario `{doorTrim, name, cell, exits, pos}` (no los
slots del Proxy). `room.doorTrim` sigue devolviendo el nº y `room.doorTrim = N` ajusta+recarga.
Verificado headless: `Object.keys/JSON.stringify(room)` dan el dict con valores; `room` es
`[object Object]`. Nota: DevTools pinta los getters vivos como `(…)` (estándar); para ver los valores
en línea usar `game.room` (snapshot) o `JSON.stringify(room)`. Añadido de paso el inspector `game`.

**Síntoma**
Teclear `room` a secas en la consola devuelve el objeto Proxy con sus slots internos, no las props:
```
room
Proxy(Object) {}
  [[Handler]]: Object   get / set / has / ownKeys / getOwnPropertyDescriptor: ƒ …
  [[Target]]: Object {}
  [[IsRevoked]]: false
```
Debería mostrarse como un diccionario: `room  →  {doorTrim: 4, name: 'Taberna', cell: '2,2', exits: […], pos: {…}}`.

**Causa raíz**
`window.room = new Proxy({}, handler)` con **target vacío**. DevTools pinta los objetos Proxy por sus
slots internos (`[[Handler]]`/`[[Target]]`/`[[IsRevoked]]`) en lugar de enumerar con `ownKeys`+
`getOwnPropertyDescriptor`, y como el `[[Target]]` es `{}` no sale ninguna propiedad. (Nota: el acceso
SÍ funciona — `room.doorTrim` da 4, `Object.keys(room)` y `JSON.stringify(room)` devuelven el dict;
solo la **vista** de `room` a secas es la del Proxy.)

**Propuesta de arreglo (a decidir)**
- Cambiar a un **objeto plano** con `Object.defineProperty` (accessors get/set enumerables): DevTools
  mostraría `{doorTrim: (…), name: (…), …}` (claves visibles; el valor tras `(…)` por ser getter). o
- Mantener el Proxy pero **poblar el `[[Target]]`** con los valores actuales (sincronizar en cada
  `set`/lectura) para que DevTools muestre `Proxy(Object) {doorTrim: 4, …}`. o
- Exponer una vista de solo lectura con valores en línea (p. ej. `room.snapshot` o que `console.log`
  reciba un objeto plano) además del acceso vivo.
- Workaround actual: `JSON.stringify(room)` ya devuelve el diccionario correcto.

**Verificación esperada**
- `room` a secas (o `console.log(room)`) muestra las props con sus valores, y sigue funcionando
  `room.doorTrim` (lee), `room.doorTrim = N` (fija + recarga) y las de solo lectura.

### ✅ BUG-P3D1 · Rendimiento muy bajo en el editor 3D pese a pocos voxels — ✅ done (2026-07-20)
**Resuelto** con dos cambios que atacan el coste real (fill-rate/DPR + renders redundantes), no el nº
de voxels: (1) **coalescencia por rAF** — `scheduleEdit3d()` junta varios `pointermove` en UN repintado
por frame (antes cada evento llamaba a `drawEdit3d` síncrono ⇒ N renders/frame); se aplica a
pan/orbit/extrude/mover/seleccionar/hover (el pintado con doble `pick3dAt` sigue directo por necesitar
`g3d` fresco). (2) **media resolución en el arrastre también para modelos pequeños**: `interact` pierde
el gate `bigModel()` ⇒ durante orbit/pan el escenario se rasteriza a ½ lado (¼ de fill-rate) aunque
tenga pocos voxels con caras grandes; al soltar, `end3d` repinta a resolución completa. El medidor
`#e3-fps` pasa a contar frames reales. Verificar en navegador (dpr2): escena plana ~300 vox con caras
grandes debe subir de ~7 fps a fluido durante el arrastre.
Reportado 2026-07-20 (captura: **271 vox → 7 fps** en «Edición 3D» sobre una escena/suelo extendido).

**Síntoma**
Los FPS del editor 3D se hunden (7 fps) con un modelo de pocos voxels (271), sobre todo en escenas
«planas»/extendidas (suelos, mesas) donde las caras ocupan mucha pantalla. No es proporcional al nº de
voxels.

**Mediciones (headless, medidor `#e3-fps`)**
- Barril **compacto** 300 vox: dpr1 **122 fps** → dpr2 **78 fps** (2× píxeles ⇒ ½ fps ⇒ **fill-rate**).
- Barril con zoom (caras más grandes, menos voxels por culling): 79→60 fps. El barril **no** baja a 7
  fps porque sus caras son pequeñas ⇒ el coste va con el **ÁREA de caras en pantalla**, no con el nº de
  voxels. Una escena de suelo (pocas caras pero ENORMES + solapadas) es el peor caso.

**Causa raíz (análisis)**
- Para modelos **≤ `BIG3D` (15000)** el editor dibuja con **canvas `fill()` + `stroke()` por cara**
  (`renderEdit3dScene`, rama de líneas ~659; también `renderFree3d` con `seams`). Es caro por: (a)
  **fill-rate** (área de píxeles), (b) **AA** de cada path, (c) un **`stroke()` por cara**, y (d)
  **overdraw** del algoritmo del pintor (todas las caras visibles se pintan de atrás→adelante; en un
  plano a contrapicado se solapan mucho). El rasterizador rápido **sin AA** (`scanQuad`) solo se usa
  con modelos **> 15000** ⇒ irónicamente una escena pequeña de caras grandes es MÁS lenta que un modelo
  denso enorme.
- **DPR alto** (retina) multiplica el trabajo ×4 (medido: dpr2 = ½ fps).
- Overlays por frame de hover: `drawSelection3d` hace `fill`+`stroke` grueso (`lineWidth=g.S*0.05`) por
  cara seleccionada; una selección grande (como el suelo de la captura) es cara.
- `drawEdit3d` se llama **síncrono en cada `pointermove`** (los handlers lo invocan directo, sin
  coalescer por rAF) ⇒ si el ratón emite ráfagas, se repinta de más.

**Propuesta de arreglo (a decidir)**
- Usar el **rasterizador `scanQuad`** (sin AA) también en el editor para tamaños pequeños (bajar/quitar
  el umbral `BIG3D` para la vista de edición, o cambiar a raster cuando el **área media de cara** supere
  un umbral). La rejilla/seams puede ir como overlay barato o con el borde que ya trae el raster.
- **Coalescer `drawEdit3d` por rAF** (varios pointermove ⇒ un repintado).
- **Media resolución durante el arrastre** también para modelos pequeños si las caras son grandes (ya se
  hace para `bigModel()`); o cap del backing-store a dpr efectivo 1 en interacción.
- Overlays: cachear/abaratar `drawSelection3d` (una pasada raster) para selecciones grandes.
- Largo plazo: renderer **WebGL** para el editor 3D.

**Verificación esperada**
- Escena plana de ~300 voxels con caras grandes a ≥30–60 fps en dpr2; medido con `#e3-fps`.

### ✅ REQ-DBG1 · Las variables/medidores de depuración F12 deben funcionar también en modo Play — ✅ done (2026-07-20)
**Resuelto**: `#play-fps` / `#play-vox` (mismas clases `.fps-float`/`.vox-float`) viven sobre
`#play-stage` (que ya es `position:relative`). Los toggles existentes valen en Play: `applyShowFPS`/
`applyShowVox` llaman a `updatePlayMeters()`, que muestra/oculta los medidores según `_showFPS/_showVox`
y `play.active`. El **FPS real de pantalla** se mide en `playTick` por ventana de ~0.5 s (→ `game.fps`) y
los **voxels dibujados de la sala** (tras culling) se toman de `_voxDrawnLast` justo tras el `project3d`
de `playLoadRoom` (→ `game.voxels`). Se refresca al cargar sala, al activar/cerrar Play y en cada
ventana de FPS. `game.showFPS(false)`/`game.showVoxels(true)` desde F12 afectan a ambos modos por igual.
Reportado 2026-07-20.

**Petición**
`game.showVoxels(true)`, `game.showFPS(true)` y `game.voxels` (y **en general TODO lo que se exponga
como variable de depuración `game.*`/`room.*` en el inspector F12**) deben aplicar también al **modo
Play** (`#play-modal`/`#play-canvas`), no solo al editor 3D. **Principio a fijar**: cualquier
toggle/lectura de depuración tiene efecto en Play y en el editor por igual.

**Estado actual**
- Los medidores `#e3-fps`/`#e3-vox` viven en `.canvas-wrap` (editor) y se activan solo con
  `mode==='3d'`; `game.fps`/`game.voxels` se actualizan en `drawEdit3d`/`updateVoxMeter` (editor). En
  Play no se muestran ni se actualizan → `game.showFPS/showVoxels(true)` no hacen nada visible y
  `game.fps`/`game.voxels` quedan con el último valor del editor.

**Notas de diseño**
- Play tiene su propio lienzo (`#play-canvas`) y un **bucle continuo** (`playTick` con rAF), a
  diferencia del editor que repinta bajo demanda ⇒ el FPS en Play sería el **real de pantalla**.
- La sala se **pre-renderiza una vez** a `play.base` (`renderFree3d`) y cada frame es blit + sprite del
  jugador ⇒ "voxels dibujados" = los de la sala tras culling (`project3d` en `playLoadRoom` ya deja
  `_voxDrawnLast`); habría que exponerlo/actualizarlo en el ciclo de Play.

**Propuesta**
- Overlays `#play-fps`/`#play-vox` (o reutilizar los del editor) sobre `#play-stage`, visibles según
  `_showFPS`/`_showVox`.
- Medir FPS en `playTick` (contador por ventana, como `e3fpsTick`) y actualizar `game.voxels` con los
  voxels de la sala; pintar los overlays en `renderPlay`.
- **Unificar el estado de depuración** (`_showFPS`, `_showVox`, `game.*`) para que un solo toggle
  aplique a ambos modos; futuras variables de depuración deben nacer ya compartidas.

**Verificación esperada**
- En Play: `game.showFPS(true)` y `game.showVoxels(true)` muestran sus medidores sobre el escenario;
  `game.fps` refleja el FPS real del bucle de juego y `game.voxels` los voxels dibujados de la sala.

### ✅ BUG-SH1 · La sombra se proyecta en el suelo pero no trepa a objetos cercanos más altos — ✅ done (2026-07-20)
**Resuelto** con un **campo de alturas** de la sala: `playLoadRoom` calcula `play.surfZ` (z-tope de la
superficie por columna). `renderShadowSprite` proyecta cada casilla de la sombra al `surfAt(x,y)` de su
columna (tapa del mueble/pared, `z=tope+1`) en vez de a un plano de suelo fijo ⇒ la profundidad horneada
coincide con la superficie del mueble y la oclusión (`dep[i] < sh.depth+dd-0.6`) ya no la borra: la sombra
**reposa sobre la tapa**. Como el sprite de sombra se horneaba en el centro de referencia y solo se
trasladaba (las alturas del centro no sirven junto a una pared), ahora se **re-hornea en la CELDA real**
del jugador (`bakeShadowAt`, `play.charRot` guarda las 4 orientaciones) solo al cambiar de celda/orientación
(barato) y entre medias se traslada por la fracción sub-celda. Verificado headless: en taberna hay 7565
columnas con tope > suelo (z 11..43) que ahora reciben la sombra. Pendiente fino (SOMBRAS.md): cara
VERTICAL del objeto + blob de contacto.
Reportado 2026-07-20.

**Síntoma**
La sombra del personaje cae bien sobre el **suelo**, pero cuando debería caer sobre un objeto cercano
**más alto que el suelo** (mueble, escalón, pared), no aparece sobre él: se corta/desaparece en vez de
treparse a su cara o su parte superior.

**Causa raíz**
`renderShadowSprite` (app.js) proyecta cada voxel del personaje **a un ÚNICO plano: el suelo**
(`g.screen(sx,sy, Z)` con `Z=play.standZ`) y hornea un decal 2D cuya profundidad por píxel es la del
**punto de suelo** (`g.depthOf(sx+.5,sy+.5,Z)`). En el composite de `renderPlay`, donde la sala está
más cerca que ese punto de suelo (`dep[i] < sh.depth[lp]+dd-0.6`) se **restaura la base** (un mueble
delante tapa la sombra). Es decir: la sombra es un **decal plano a la altura del suelo**, sin noción de
la superficie 3D sobre la que cae; donde su huella coincide con un objeto más alto, ese objeto la
**oculta** en vez de recibir la sombra en su cara/tapa.

**Propuesta de arreglo (a decidir)**
- **Height-field por columna**: para cada celda de la huella de sombra, proyectar a la **z de la
  superficie** de esa columna (máx z ocupado de la sala) en vez de a `Z` fijo ⇒ la sombra sube a la
  tapa de los muebles. Barato usando la ocupación de la sala ya disponible.
- Para caras **verticales** (que la sombra baje por el lateral) hace falta más: raymarch por píxel
  contra la profundidad de la sala, o un **shadow map** desde la luz (proyección/prueba de profundidad).
- Alternativa sencilla intermedia: “escalonar” la sombra por altura de columna (climb sobre tapas),
  aceptando que no cubra las caras laterales.
- Relacionado con el rediseño ya analizado en **`SOMBRAS.md`** (silueta desde la luz, anclaje de
  contacto, longitud/alfa) — encajar este arreglo ahí.

**Verificación esperada**
- Con el personaje junto a un mueble bajo, su sombra se ve **sobre la tapa** del mueble (y idealmente
  bajando por la cara que da a la luz), no cortada al llegar a él.

### ✅ BUG-TNT1 · El snippet «Explosión TNT 🧨» tarda ~40 s en mundos grandes — ✅ done (2026-08-05)
**Reportado** por el dueño con su log: explosión 1 = 1054 bloques en 387,20 ms, explosión 2 = 773 bloques
en **21 398,60 ms**. Y con la teoría correcta de su parte: «podría ser porque se actualiza el mapa cada
vez que se borran voxels generando mucho retraso porque los fps caen a 0, pero solo es una teoría».

**Causa raíz** — confirmada midiendo, no supuesta. El snippet anima la onda con un
`beginBatch()`/`endBatch()` **por anillo**, o sea por fotograma, y `mcFlushBuild` remataba cada lote con
**`mcMeshAll()`**: skylight global + los **1024 chunks** del mundo. El coste iba con el **volumen del
mundo**, no con el tamaño del cráter — 1054 bloques en 17×17 columnas disparaban 10 barridos completos.
Medido en 512×40×512: 41 535 ms de explosión, de los cuales **35 789 ms eran los 10 `mcMeshAll`**.
No era regresión de nada reciente: la lava no tiene colores emisivos, así que el índice `mc._glowCeldas`
de la antorcha ni entra.

**Arreglo** — la ráfaga apunta su caja en planta (`mcBuildBox`) y el flush re-malla solo eso, con vuelta
a `mcMeshAll()` cuando la caja más su halo pasa de media planta (`mcCajaCompensa`). Las tres funciones de
la edición de un bloque aceptan una segunda esquina opcional y **sin ella se comportan igual que antes**,
que es lo que deja intacto el camino del clic. Detalle en `CLAUDE.md` §«…y una ráfaga de script tampoco».

**Resultado** (512×40×512, SwiftShader ≈10× una GPU): explosión 2 de **36 209 ms y 9 `mcMeshAll`** a
**5 689 ms y 0**. Los 9 flushes suman **304 ms** (4 chunks cada uno en vez de 1024). Lo que queda es
tiempo de fotograma, no de edición: ese mundo ya cuesta 196 ms/frame en reposo con SwiftShader.

**Verificado**: `test_luz_incremental_navegador.js` (19 ok, compara celda a celda contra el barrido
global), `test_luz_en_rejilla.js`, `test_luz_al_estampar.js`, `test_luz_traspasa.js`,
`test_setvoxel_autocarga.js` (21 ok), `test_flor_en_rejilla.js`, `test_clic_derecho_rejilla.js`.

### ✅ BUG-TR1 · A veces al cruzar de sala la pantalla se queda NEGRA hasta el siguiente clic — ✅ done (2026-07-20)
**Resuelto**: la carrera estaba en `playTick`, que **decrementaba `play.fade` durante la transición**
(carga async) sin repintar (el bloque de render exige `!transitioning`). Si `playLoadRoom` tardaba, el
fade llegaba a 0 antes de acabar y, al terminar, el `else if(play.fade>0 …)` era falso ⇒ nada repintaba y
quedaba el frame negro hasta el siguiente clic. Ahora el fade **solo se disuelve tras** la transición
(`if(!play.transitioning && play.fade>0) …`) y `playTransition` hace un `renderPlay()` inmediato al cargar
la sala nueva ⇒ el fundido se resuelve en los ticks siguientes y nunca se queda negro.
Reportado 2026-07-20. Coords donde se vio negro: `game.room` = Herrería `cell:"3,2"`, `pos:{x:5,y:56}`
(spawn en el borde W tras cruzar por la puerta), `exits:['W','E']`, `doorTrim:0`.

**Síntoma**
Al cruzar de una habitación a otra, a veces queda **todo negro**; solo al **volver a hacer clic** el
jugador avanza y se muestra el entorno. Intermitente (“a veces”).

**Causa raíz**
En `playTick` (app.js) **durante la transición no se repinta**: la rama de movimiento exige
`!play.transitioning` y la de fundido exige `play.fade>0 && !play.transitioning` ⇒ con
`transitioning=true` ninguna llama a `renderPlay`. Pero `play.fade` **sí se decrementa cada frame**
(`fade-=dt*2.5`, ~0.4 s de 1→0). `playTransition` hace `await playLoadRoom(...)` (async; **tarda**
según la sala — Herrería ~48k voxels se rasteriza a `play.base`). Si la carga dura **más** que el
fundido, al poner `transitioning=false` el `fade` ya llegó a **0** ⇒ la rama `else if(fade>0 &&
!transitioning)` **no dispara** y la sala nueva **no se pinta nunca** hasta que otra cosa llame a
`renderPlay`. Un clic crea `play.path` ⇒ la rama de movimiento repinta ⇒ aparece todo. De ahí el
“negro hasta el clic”. Es intermitente porque depende de si la carga async gana o pierde la carrera
contra el fundido.

**Propuesta de arreglo (a decidir)**
- **No decrementar `fade` mientras `transitioning`** (congelar el fundido durante la carga) ⇒ al
  terminar sigue en ~1 y la rama de fundido hace el fade-in completo. o
- `playTransition`: tras `await playLoadRoom`, **llamar `renderPlay()`** (garantiza ≥1 repintado del
  entorno nuevo, como hace `enterPlay`). o
- En `playTick`, repintar **siempre** al menos una vez tras salir de la transición (p.ej. flag
  `justEntered`), independientemente de `fade`.

**Verificación esperada**
- Cruzar repetidamente entre salas (incl. Herrería, que carga lenta) nunca deja pantalla negra: el
  entorno nuevo aparece sin necesidad de clic. Reproducir forzando una carga lenta.

### ✅ BUG-MCB1 · `game.buildTerrain()` prometía construir el terreno y en realidad estrenaba mundo — ✅ done (2026-07-28)
**Resuelto**: por defecto ahora **solo rellena el AIRE** hasta Y=14 (roca 0..10 / tierra 11..13 / hierba 14). No
pisa ni un bloque existente, no toca estructuras, notas, spawn ni el historial de deshacer. El comportamiento
destructivo de siempre sigue estando, pero hay que pedirlo: `game.buildTerrain({reset:true})`.
Reportado 2026-07-28: «parece que va a construir el terreno sobre lo que hay y en realidad lo borra todo».

**Causa raíz**
`game.buildTerrain` llamaba a `mcGenFlat()` a secas, que **no rellena: estrena mundo** —
`mcClearStructures()`, `mc.notes={}`, `mc.grid=new Uint16Array(...)` con dim fija 96×40×96, spawn/pos
reubicados e historial vaciado. El nombre no daba ninguna pista de eso.

**Arreglo**
Barrido de `y=0..min(14, dim.y-1)` saltando toda celda con bloque (`if(mc.grid[i]) continue`). Respeta la `dim`
actual (no la fuerza a 96³). Como las estructuras finas **no viven en `mc.grid`**, se salta también el AABB de
las que bajan de Y=14, para no emparedar una metida en un sótano. Al terminar, `mcMeshAll()` (recalcula luz) y
`mcScheduleSave()`; el log dice cuántas celdas rellenó y cuántas respetó, y recuerda la forma `{reset:true}`.

**Verificación** (arnés sobre rejilla sintética con torre, adoquín de superficie, bloque enterrado, hoyo cavado
y estructura en sótano): 0 bloques existentes pisados; el hoyo queda tapado y con césped arriba; torre, adoquín,
bloque enterrado y hueco de la estructura, intactos.

---

### ✅ BUG-MCA1 · Un bloque translúcido se ve MACIZO en el Mundo y no sale su fantasma de estructura — ✅ done (2026-07-28)
**Resuelto**: `mcStructCells` ya no clasifica como `blockLike` un 16³ macizo **con alpha**: se estampa como
**estructura fina**, que sí mezcla de verdad (`aAlpha`/`vAlpha` + pasada con `BLEND`). Además rayos-X gana una
**línea de TIPO** (`bloque · textura` / `estructura · guardada`) entre las coordenadas y el material, porque a
simple vista un 16³ macizo se ve idéntico colocado de las dos formas.
Reportado 2026-07-28 con `assets/cubo-trans.vox.json` y `hab:cubo-trans` (4096 voxels, todos `#4ab8d924`, alpha 0x24 ≈ 14 %).

**Síntoma**
Un asset guardado **con alpha** se ve sólido al colocarlo en el mapa. Guardado además **como estructura**, al
seleccionarlo del selector y mantener el clic derecho **no aparece el fantasma**: se comporta como si se hubiera
elegido la textura. Rayos-X muestra la clave del material pero **no dice si esa celda es bloque o estructura**.

**Causa raíz** (dos, encadenadas)
1. `mcStructCells` decidía `blockLike` solo por geometría: `w,h,d ≤ 1 && nvox ≥ 16³`. Un cubo macizo de 16³ es
   `blockLike` **lleve alpha o no**, así que `mcAssignSlot` ponía `mc.slotStruct[slot]=null` ⇒ ruta de terreno,
   sin `mc.preview` (el fantasma solo existe con ranura de estructura) — de ahí «como si eligiera la textura».
   Las dos entradas de la galería (`type:'textura'` y `type:'bloque'`) son geométricamente idénticas: la regla
   no podía distinguirlas.
2. La ruta de terreno **no puede** representar alpha: `buildTexFaces` hornea el atlas con `d[o+3]=255`
   (y `parseInt(hex.slice(1,7),16)`, solo `#rrggbb`) ⇒ `mc.atlasHasAlpha=false` ⇒ `mcRender` elige `MC_FS_OPAQUE`.
   Aunque se conservara el alpha, el shader del terreno solo hace **recorte binario** (`if(t.a<0.5) discard`) y
   nunca mezcla: con alpha 0.14 el bloque **desaparecería**, no se volvería translúcido.

**Arreglo**
- `mcStructCells`: detecta `translucido` en el barrido de voxeles (filtro por longitud ≥ 9 antes de llamar a
  `colorAlpha`, para no pagarlo 2,5 M de veces en la taberna) y `blockLike = … && !translucido`. Se expone en
  el `rec` por si hace falta más adelante.
- `mcUpdateXrayLabels`: etiqueta de **tres** líneas; nueva `mcMatKind(key,isStruct)` memoizada (invalidada al
  recargar el catálogo) → `bloque|estructura · badge de la galería`.

**Verificación**
- Los 6 bloques básicos (hierba, tierra, roca, arena…) y `agua` (4096 vox opacos) **siguen** siendo bloque de
  terreno; solo cambian de lado `assets/cubo-trans.vox.json` y `hab:cubo-trans`. Comprobado con arnés sobre los
  ficheros reales.
- En el Mundo: elegir el cubo translúcido ⇒ mantener clic derecho **muestra el fantasma**; al soltar se estampa
  y **se ve a través**. Rayos-X (X) distingue `bloque · …` de `estructura · …`.

**Limitación conocida (no arreglada)**
El **terreno** sigue sin translucidez real: atlas sin alpha + shader de recorte binario. Darle vidrio de verdad
al terreno exige conservar el alpha en `buildTexFaces`, marcar bloques translúcidos en la paleta, partir el VBO
de cada chunk en opaco+alpha (y dejar de pelar caras contra vecinos translúcidos) y una segunda pasada ordenada
de atrás hacia delante. Toca el camino caliente del render ⇒ pendiente de decisión.

### ✅ BUG-DBG2 · En el Mundo, `game.showFPS()` conmuta también el contador de voxels y `game.showVoxels()` no hace nada — ✅ hecho 2026-08-06
**Reportado** 2026-08-06 por el dueño: «la función `game.showFPS()` muestra tanto los fps como los
voxels (conmuta on/off), debería de ser solo para los fps; la función `game.showVoxels()` no parece
hacer nada».

**Síntoma**
En el modo Mundo los dos medidores flotantes (`#mc-fps` «— fps» y `#mc-vox` «— vox») van pegados: se
encienden y se apagan juntos con `game.showFPS()`. `game.showVoxels(true/false)` no cambia nada en
pantalla, aunque el valor sí se guarda y sí sale en `game.dumpVars()` — o sea que parece rota.

**Causa raíz** (leída, no supuesta)
`updateWorldMeters` (`app.js:5654`) rige **los dos** medidores con la misma variable:
```js
const ef=$('#mc-fps'); ... ef.hidden=!(_showFPS && mc.active);
const ev=$('#mc-vox'); ... ev.hidden=!(_showFPS && mc.active);   // ← debería ser _showVox
```
El comentario de encima ya lo confiesa («Reusa `game.showFPS` (`_showFPS`)»). El estado `_showVox`
existe, se persiste (`vf_showVox`) y funciona en los **otros dos** modos —`#e3-vox` en el editor 3D
(`app.js:2420`, `4734`) y `#play-vox` en Play (`4742`)—, pero el Mundo nunca lo mira.

**Segunda mitad, más callada**: `applyShowFPS`/`applyShowVox` (`4726`/`4732`) llaman a
`updatePlayMeters()` pero **no** a `updateWorldMeters()`. Hoy no se nota porque `mcTick` la llama en
cada frame (`app.js:9504`), así que el cambio entra al fotograma siguiente; pero es exactamente la
asimetría que REQ-DBG1 quitó para Play, y deja el medidor desincronizado con el bucle parado.

**Arreglo propuesto**
1. `#mc-vox` pasa a regirse por `_showVox` en `updateWorldMeters`.
2. `applyShowFPS` y `applyShowVox` llaman también a `updateWorldMeters()`, para que los tres modos
   (editor 3D, Play, Mundo) obedezcan a los dos toggles por igual — el **principio que fija REQ-DBG1**:
   *cualquier toggle de depuración tiene el mismo efecto en todos los modos*.

**⚠️ Cambio de comportamiento visible que hay que avisar**
`_showVox` **nace en `false`** y `_showFPS` en `true`. Hoy, en el Mundo, el contador de vox sale porque
va colgado del de FPS; después del arreglo **desaparecerá** hasta que se pida `game.showVoxels(true)`.
Es lo correcto y es lo que pide el dueño, pero el que abra el Mundo mañana verá un medidor menos.

**De paso (decidir, no urgente)**: `#mc-vox` del Mundo no cuenta voxels sino **caras (quads)** dibujadas
por la GPU —lo dice su propio `title` en `index.html:502`, y `game.voxels` se rellena desde `mc.quads`—.
La etiqueta «vox» miente un poco; renombrarla a «quads» o dejarla como está es decisión del dueño.

**Verificación esperada**
- Prueba de navegador nueva (hoy **ningún** test toca los medidores): con el Mundo abierto,
  `game.showVoxels(true)` enseña **solo** `#mc-vox`; `game.showFPS(false)` apaga **solo** `#mc-fps`; las
  cuatro combinaciones se ven bien y sobreviven a recargar (localStorage).
- Y el mismo cuadro de cuatro combinaciones en editor 3D y en Play, para que quede fijada la simetría.

---

**RESUELTO** 2026-08-06. Dos líneas de `app.js` y un test que no existía:

1. `updateWorldMeters` (`app.js:5656`): `#mc-vox` pasa de `_showFPS` a **`_showVox`**.
2. `applyShowFPS` (`:4729`) y `applyShowVox` (`:4736`) llaman también a `updateWorldMeters()`, no solo
   a `updatePlayMeters()`. Con esto los tres modos —editor 3D, Play y Mundo— obedecen los dos toggles,
   que es el principio que fijó REQ-DBG1.

⚠️ **Corrección al propio ticket**: el fragmento que cité al diagnosticar decía
`const ev=$('#mc-vox'); ... ef.hidden=...` — o sea, apuntaba a **dos** errores (variable equivocada
*y* elemento equivocado). El código real siempre puso `ev.hidden`; el error era **solo** `_showFPS` en
vez de `_showVox`. La causa estaba bien identificada, pero la transcripción del ticket no era fiel, y
un fragmento citado de memoria en un ticket puede mandar a arreglar algo que no está roto.

**Cambio visible avisado**: `_showVox` nace en `false`, así que en el Mundo **el contador de vox ya no
sale de partida**. Se pide con `game.showVoxels(true)` y se recuerda entre sesiones.

**Verificado** — `node test_medidores_depuracion.js` nuevo, 14 ok: las cuatro combinaciones en el
Mundo, que ninguno de los dos interruptores toque al otro, que el cambio se vea **sin esperar al
siguiente frame** (era la segunda mitad, la callada), que sobrevivan a recargar, y el mismo cuadro en
el editor 3D. Play quedó fuera del test: entrar en el modo pide montar una sala y el bug no estaba
ahí; los dos toggles ya lo cubrían vía `updatePlayMeters`.

**Sigue abierto para el dueño** (no urgente): `#mc-vox` cuenta **quads**, no voxels — su propio `title`
lo dice. Renombrar la etiqueta o dejarla es decisión suya.

### ✅ BUG-SNP2 · `hab:placa-on` se avisa como si fuera un typo de `hab:palanca-on` — ✅ resuelto 2026-08-07

**Reportado** 2026-08-06, visto en el log de carga del dueño en `/map/empty`:
`game.bloques.define: no existe el material "hab:placa-on". ¿Querías "hab:palanca-on"?`

Es un **falso positivo de BUG-SNP1**. `hab:placa-on` existe de verdad (`data/habitantes/placa-on.json`)
y lo que pasa es lo de siempre: no está *colocado* en `/map/empty`, así que no está en la paleta y
tendría que **esperar en silencio**. Pero `parecidos()` encuentra `hab:palanca-on`, que sí está en la
paleta, a **distancia 2** (`placa-on` → `pal**a**ca-on` → `pala**n**ca-on`), y el tope a partir de 8
letras es 2 ⇒ lo canta como dedo torcido.

O sea que la regla «dos cambios en una palabra larga siguen siendo el mismo dedo torcido» **se rompe
cuando las dos palabras existen**. Y aquí hay una señal que la heurística no está mirando y que decide
el caso sin ambigüedad: `placa` **ya está en la paleta**, así que `placa-on` es un sufijo de algo
conocido, no un typo de otra cosa. Mismo patrón que `cable`/`cable-on`, `boton`/`boton-on`.

⚠️ Esto **no es `app.js`**: vive en `data/snippets/mundo-autoarranque.json`, que el dueño edita en vivo
(Alt+C) y tiene **dos copias vivas**; se aplica con un parche idempotente, no reescribiendo el fichero.

**Verificación esperada** — `/map/empty` no avisa de `hab:placa-on` (ni de ningún `X-on` cuyo `X` esté
en la paleta) y sigue apareciendo en `game.bloques._pendientes()`; un typo de verdad (`eskalera`) sigue
avisando. Caso nuevo en `test_bloques_comportamiento.js` y `test_materiales_en_espera.js` en verde.

**✅ Resuelto 2026-08-07.** `deLaFamilia(corto, conocidas)`: si el nombre pedido es **un nombre conocido
más un guion** (`placa` ⇒ `placa-on`), se aplaza en silencio **antes** de preguntar por parecidos. Se
aplica con `parche_snp_familia_material.py`, idempotente.

Lo que **no** se hizo, a propósito: **apretar la distancia de edición**. Era la reacción obvia y habría
apagado este aviso rompiendo los typos de verdad (`eskalera` está a 1). La familia es una señal
**distinta y exacta**, y por eso se mira primero y no en vez de.

Dos límites conocidos, los dos a favor de no callar de más:
- **Un guion no es un salvoconducto.** Si el «padre» no está en la paleta, se sigue avisando: pedir
  `hab:palanca-on` en un mundo donde solo está `hab:placa` sigue sugiriendo `hab:placa-on`. Solo exime
  el pariente de algo que **de verdad** está.
- Si un día alguien escribe mal la parte de después del guion (`hab:placa-onn`) tampoco se cantará,
  porque el padre existe. Es el precio, y es el lado correcto: aplazar de más es silencio; avisar de
  más es lo que motivó BUG-SNP1.

**Verificado** — `test_material_familia.js` **nuevo** (21 ok), que saca `resolver`/`parecidos`/
`nombreCorto`/`deLaFamilia` **verbatim** del snippet y les pone una paleta de mentira: el caso del
dueño, los cinco pares que existen en el disco (`cable`, `boton`, `puerta`, `antorcha`, `repetidor`),
que un typo auténtico siga cantando, que el guion sobre un desconocido **no** exima, y que el alias por
nombre corto y el mundo sin abrir sigan igual. Más `test_materiales_en_espera.js` en verde (8 ok):
`hab:placa-on` sale entre los 12 en espera de `/map/empty` y no deja ni un aviso.

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

### ✅ REQ-CART1 · El cartel como monitor: sobra aire, las letras tienen que crecer — ✅ hecho 2026-08-06
**Reportado** 2026-08-06 por el dueño, con captura anotada (recuadro rojo = lo que ocupa el texto hoy,
recuadro verde = la tabla disponible, flechas = el aire que sobra por los cuatro lados): «hay mucho
aire en los carteles/notas/posits, quiero que se aproveche mejor el espacio, que las letras sean más
grandes; imagínate que el cartel es como un monitor, queremos leer el mensaje de lejos sin necesidad
de pegarnos a él».

**Reflexión** — este ticket llega **justo después** de subir el tamaño 1,5× ese mismo día (de `size=9`
a `27`, aprovechamiento del alto del 39-52 % al 59-74 %). Que siga sobrando aire después de esa mejora
es la información importante: **lo que queda no es una constante mal elegida, es estructural**. Y el
encuadre del dueño —«como un monitor»— reencuadra el objetivo: no es «letras un poco más grandes», es
**legibilidad a distancia**, que es una métrica distinta y que no depende solo del cuerpo de la letra.

**Las tres cosas que sospecho, por orden de sospecha** (de lo que recuerdo de haber tocado
`mcNoteTexture` y `mcBoardRect` hoy; **nada de esto está verificado para este ticket**):
1. **Dos márgenes anidados que se suman.** `MC_NOTE_TEXT_PAD` recorta la tabla en **voxels finos**
   antes de nada, y luego `mcNoteTexture` vuelve a meter un **5 % de margen** por dentro del lienzo.
   Son dos recortes independientes sobre la misma caja y **compuestos** explican bastante bien el aire
   de la captura. Sospecho que es el grueso del ticket y el arreglo más barato.
2. **El tope de tamaño `H/2.5`.** Limita la letra a ~2,5 líneas de alto pase lo que pase; un mensaje
   corto no puede llenar la tabla aunque le sobre sitio.
3. **Composición ciega a la forma.** El algoritmo busca «el mayor cuerpo con el que cabe TODO» y
   centra; nunca reconsidera el reparto. La última línea suele quedar corta (se ve en la captura), o
   sea que hay hueco que no se está repartiendo.

**La restricción que no se puede saltar** — la fuente del juego (Pixeloid) solo es nítida en
**múltiplos de 9** (su píxel de diseño es `font-size/9`, ver «🔠 La fuente del juego» en `CLAUDE.md`).
Eso obliga a que la escalera de tamaños sea discreta, así que «crecer un poco» no existe: se crece un
escalón entero o nada. De ahí que el lienzo se dimensione por el alto (`MC_NOTE_TEXT_H`), que es lo
que hace fino el escalón. Cualquier propuesta tiene que respetar esto o el rótulo sale borroso, que es
peor que pequeño.

**«Leer de lejos» no es solo el cuerpo de la letra** — hay al menos dos cosas más en juego, y conviene
mirarlas juntas o el ticket se queda a medias:
- `game.noteTextDist`, la distancia a partir de la cual el rótulo **deja de dibujarse**;
- `MC_NOTE_TEXT_LEGIBLE`, el umbral de px por letra por debajo del cual se cede al visor de la mira;
- y el filtrado de la textura, que hoy es `LINEAR`: para una fuente de píxeles ampliada, `NEAREST`
  mantiene el borde duro y puede leerse mejor de lejos que un `LINEAR` emborronado. **Sin comprobar.**

**Tensión que hay que resolver, no esconder** — un texto largo y letras grandes son incompatibles en
una tabla 4:1. Hoy se resuelve encogiendo hasta que cabe. Alternativas que el dueño tendría que elegir:
recortar antes con «…» y fiar el resto al visor de la mira; o que el cartel **crezca** con el texto;
o dos tamaños según se mire de cerca o de lejos. **Es una decisión suya, no la cierro yo.**

**Verificación esperada**
- Sobre la misma nota de la captura, el texto ocupa una fracción claramente mayor del recuadro verde,
  y el aire de los cuatro lados baja a un marco fino y parejo.
- Se lee el mensaje desde una distancia a la que hoy no se lee (medir con `game.tp` a una distancia
  fija antes y después, misma nota, misma resolución).
- El rótulo sigue **nítido**: el cuerpo elegido sigue siendo múltiplo de 9.

---

**RESUELTO** 2026-08-06. La unidad de medida es `frac` = alto del cuerpo en fracción del alto de la
tabla (lo que ya guarda `mcNoteTexture` para decidir si el rótulo se lee). La tabla real es de
**1,875 × 0,875 = aspecto 2,143**, no 4:1.

⚠️ **Aviso metodológico, porque casi cuesta el ticket**: la primera sonda hacía
`typeof mcBoardRect==='function' ? mcBoardRect(s) : null` con un `aspecto = 4` de reserva. La función
se llama **`mcNoteBoardRect`**, así que la rama nunca se cumplía y *todas* las medidas salieron contra
una tabla imaginaria de 4:1. Un `typeof` con reserva silenciosa convierte un nombre mal escrito en
números plausibles. Si una sonda tiene reserva, que **avise** cuando la use.

De las tres sospechas, **la 1 y la 2 eran ciertas pero menores**, y la 3 no era el problema:

| | ancho | alto |
|---|---|---|
| tabla en voxels finos | 32 | 16 |
| tras `MC_NOTE_TEXT_PAD=2` por lado | 28 (−12,5 %) | **12 (−25 %)** |
| más el 5 % del lienzo por lado | ×0,90 | ×0,90 |
| **utilizable antes de escribir una letra** | 78,8 % | **67,5 %** |

Se arreglaron (`PAD` 2→1, margen del lienzo 5 %→2 %, tope `H/2.5` → `altoU/1.25`, que es el mayor
cuerpo con el que UNA línea cabe de alto), y eso llevó los mensajes **cortos** a su óptimo (0,35–0,46).
Pero la nota larga **no se movió de 0,070**, y ahí estaba el ticket de verdad.

**La causa era la rejilla de múltiplos de 9 contra un lienzo de tamaño fijo.** Con el alto clavado en
256, el cuerpo que llena la caja es 25,2 px, pero solo valen 9/18/27… así que se horneaba a 18: **un
29 % de tamaño tirado al redondear**, y ninguna constante que tocar lo recuperaba. La salida es
invertir la dependencia — **el lienzo no es un dato, es una incógnita**:

1. El ajuste es invariante de escala, así que lo que se mide no es un cuerpo sino una **razón**
   `cuerpo/alto-de-lienzo`: bisección (~10 pruebas, no 40) a `MC_NOTE_TEXT_REF=1024`, donde no se
   dibuja nada porque `measureText` no depende del lienzo.
2. Luego se coge el mayor **múltiplo de 9** que quepa bajo los topes y se estira el lienzo a
   `cuerpo/razón`, con re-comprobación en la caja definitiva (los márgenes y el interlineado se
   redondean a entero, y a poco lienzo eso mueve el resultado). El tope de alto sube de 256 a **384**:
   no cambia el tamaño de la letra —la razón manda— pero da más múltiplos donde elegir y 4 píxeles de
   lienzo por píxel de diseño en vez de 2, que es lo que se nota al acercarse.

La clave de la caché pasa de `texto|WxH` a `texto|aspecto`, porque el tamaño ya es consecuencia del texto.

**Medido** (tabla real, 2,143):

| texto | antes | después | |
|---|---|---|---|
| nota larga, 271 caracteres | 0,0703 | **0,0957** | **+36 %** |
| «PUESTO 4 · hierba» | 0,3516 | **0,3835** | +9 % |
| «SALIDA →» | 0,4219 | **0,4297** | +2 % |
| «PELIGRO» | 0,4570 | **0,4622** | +1 % |

**Sobre la tensión que dejé sin cerrar** (texto largo vs. letras grandes): no hubo que pedirle al
dueño que eligiera. Era una falsa disyuntiva mientras se tirase un 29 % en el redondeo; recuperado
eso, la nota de 271 caracteres se lee entera a 2,5 m sin recortar ni agrandar el cartel. La decisión
sigue disponible si algún día aparece un texto que de verdad no quepa.

**Lo que NO se tocó**: `game.noteTextDist`, y el filtro sigue en `LINEAR`. Con 4 píxeles de lienzo por
píxel de diseño el borde ya sale duro; `NEAREST` queda como idea si alguna vez se ve borroso.

**Verificado** — `node test_notas_cartel.js` en verde (23 ok), con dos casos nuevos: la nota larga
normal aprovecha la tabla (`frac ≥ 0,09`) y por tanto releva al visor de la mira desde 2,5 m. El caso
«una parrafada encogida NO releva al visor» **cambió de fixture y hay que saber por qué**: con 40
repeticiones el rótulo pasó de 6,9 px a 13,5 px de pantalla por letra, o sea que **ya se lee** y
relevar al visor es lo correcto; el borrón que ese caso vigila hay que buscarlo ahora en 120
repeticiones (8,2 px, por debajo de `MC_NOTE_TEXT_LEGIBLE=10` y sin llegar al recorte). Capturas a
1280 px y a 390 px, con nota larga y corta.
- `node test_notas_cartel.js` en verde.
- Comprobado también a **390 px** (el dueño lee en móvil) y en un cartel con nota corta y otra larga.

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

### ✅ REQ-RS3 · Crear el pistón de redstone y plantarlo en `/map/test` — ✅ hecho (2026-08-06)
**Reportado** 2026-08-06 por el dueño: «crear "pistón" redstone y añadirlo a mapa test para probarlo».

**Redactado sin investigar** (regla del dueño para «nuevo ticket»): lo de abajo es lo que sé de haber
trabajado en la zona, **no** una exploración. Todo lo que lleva «¿?» hay que comprobarlo al abordarlo.

**Qué es** — la pieza de redstone que, al recibir señal, **empuja** el bloque (o los bloques) que tiene
delante una celda en la dirección a la que mira. Es la primera pieza de redstone que **mueve el mundo**
en vez de solo propagar señal: hasta ahora todo el redstone es estado, no geometría.

**Por qué esto no es «un repetidor más»** — y es lo que hace que la pinta esté sin acotar:
- ⚠️ **Es todo orientación.** Un pistón sin dirección no es nada. Y hay un ticket abierto que dice que
  **las piezas de redstone giradas no funcionan** (BUG-RS2). Empezar el pistón antes de entender RS2
  es construir encima de lo que ya está roto: **lo razonable es resolver BUG-RS2 primero, o al menos
  su diagnóstico**, que además es barato (plantar `@0/@1/@2/@3` y ver cuáles propagan).
- ⚠️ **Mover un bloque cruza la frontera de los dos sitios donde vive un material** (CLAUDE.md): lo
  macizo 16³ está en `mc.grid` y lo que tiene forma está en `mc.structures`. Un pistón que empuja tiene
  que saber mover **las dos cosas**, y no es el mismo código. ¿Empuja solo rejilla en v1?
- ⚠️ **Y REQ-RS4 es probablemente anterior a esto.** Un pistón se activa **por energía**, y REQ-RS4
  cambia el modelo de propagación (cualquier bloque puede energizarse). Hacer el pistón antes obliga a
  rehacerle la entrada después.
- ⚠️ **El comportamiento va en los snippets, no en `app.js`** (CLAUDE.md §0). Pero «empujar» puede
  necesitar una **capacidad** nueva del motor. Si hace falta, el patrón es el de siempre: `app.js`
  expone la capacidad, el snippet decide el comportamiento (`mc.sunExtra`, `mcXrayExtra`,
  `mc.atraviesa`). Hay que resistir la tentación de meter «pistón» en `app.js`.

**Decisiones que necesita el dueño** (ninguna la cierro yo)
1. ¿**Pistón normal** solo, o también **pegajoso** (que al retraerse se trae el bloque)? Recomiendo
   normal en v1: el pegajoso duplica los casos.
2. ¿Cuántos bloques empuja en fila? (Minecraft: 12). Recomiendo **1** en v1.
3. ¿La **cabeza extendida** es un bloque propio, o el pistón cambia de forma? Esto decide si son dos
   claves (`piston` / `piston-on`, como `repetidor`/`repetidor-on`) o una con estado.
4. ¿**Animación** de extensión, o instantáneo? Instantáneo es mucho más barato y probablemente basta.
5. ¿Qué pasa con lo que **no es un bloque** delante: el jugador, un agente, una nota? Lo más simple y
   defendible es «no empuja nada que no sea bloque, y si hay un agente el pistón no actúa».
6. ¿Qué pasa si delante hay **hueco**, **borde del mundo** o algo **atravesable** (`hierba`)?

**Dónde caerá, sin haberlo abierto** — el comportamiento en la familia de snippets de redstone
(`data/snippets/redstone*.json`); el aspecto, un asset en `assets/`. Hay tests hermanos ya escritos
(`test_redstone_*.js`) que sirven de molde.

**«Añadirlo a mapa test»** — la instalación de prueba va a **`/map/test`**, que es donde van todas las
pruebas del Mundo, y **no se borra al terminar**. Ojo: existe además un `/map/redstone` con montaje de
redstone; si el dueño lo prefiere ahí, que lo diga — el enunciado dice `test`.

**Verificación esperada**
- Un pistón plantado en `/map/test`, alimentado desde una palanca/antorcha, **empuja** el bloque de
  delante una celda; al cortar la señal se retrae (y el bloque **no** vuelve, si es normal y no pegajoso).
- Funciona en **las cuatro orientaciones** — es el criterio que lo separa de BUG-RS2.
- Empujar contra el borde, contra hueco y contra un bloque irrompible no rompe nada ni pierde bloques.
- El mundo guardado y releído conserva lo que el pistón movió.
- Sin regresión en los `test_redstone_*.js` que ya existen.

**Cómo se resolvió** (2026-08-06) — **cero líneas de `app.js` y cero líneas del motor.**

Las dos decisiones que el ticket dejaba abiertas las cerró el dueño: **v1 normal, 1 bloque, 1 celda**
(no pegajoso, sin retardo) y **la cabeza extendida es un bloque propio** que ocupa la celda de delante.

1. **Los dibujos** — `redstone/make_piezas.py` gana `piston(extendido)` y `piston_cabeza()`, y con
   ellas tres habitantes: `hab:piston` (3856 voxels), `hab:piston-on` (3072) y `hab:piston-cabeza`
   (976). El marco de la placa va **rehundido a propósito**: a 4096 voxels el Mundo trata la pieza
   como bloque de rejilla y la dibuja proyectando 6 caras planas, con lo que se perdería la placa de
   madera — que es lo único que enseña hacia dónde empuja.
2. **El comportamiento** — `redstone/redstone-piezas.js` (`piezas-1.3`), en `alRecibirSeñal`. Es la
   primera pieza que **mueve materia** en vez de combinar capacidades del motor, y por eso la primera
   que usa ese gancho.
3. **Dónde empuja se DERIVA, no se tabula.** El vector +X (donde el dibujo pone la placa) se pasa por
   el mismo `mcRotXZ` que gira la geometría al estampar. Una tabla escrita a mano se desincroniza del
   dibujo — que es exactamente lo que costó BUG-RS2.

**El hallazgo que gobierna el diseño: el pistón NO puede usar `encendida`.** Con `encendida`, el
motor cambia el bloque **él** (`redstone.js:448`) *antes* de avisar al callback, así que un pistón que
no puede extenderse ya se habría pintado abierto — y devolverlo a su sitio no aguanta: escribir la
celda la re-encola como «estrenada» (`redstone.js:265`), lo que salta el atajo `nivel === antes` y la
siguiente pasada la vuelve a abrir. Solución: **dos `define()`, uno por material**, con la misma
configuración. Así `apagada` es cada uno sí mismo, el motor no toca el bloque, y quien decide si se
extiende es el callback — que es el único que sabe si cabe. Los dos siguen siendo circuito, que es lo
que impide que el pistón extendido se caiga de la cola y no se recoja jamás.

Detalles que costaron su rato: el motor solo re-malla lo que ha tocado **él** (`redstone.js:421`) y
aquí las celdas que cambian están una y dos casillas más allá, así que el callback llama a
`mcRemeshAround` por su cuenta; y como ningún material del snippet se precarga, el cuerpo abierto y la
cabeza no existen en la paleta hasta la primera extensión de la partida — se cargan ahí y la extensión
se reintenta sola al llegar (es idempotente, llegar tarde no rompe nada).

**Límite conocido de la v1, no un descuido:** empuja lo que hay en `mc.grid`. Una **estructura
estampada** (`mc.structures`) ocupa varias celdas y no vive en la rejilla: delante del pistón se ve
como aire y la cabeza se le mete dentro.

**Verificación** — `node test_redstone_piston.js` (nuevo, **TODO OK**): los cuatro giros empujan hacia
su frente y el bloque **cambia de celda**; volver a alimentarlo abierto no empuja otra vez; al apagar
recoge su cabeza y **no** tira de lo que empujó; con dos bloques delante o contra el borde del mundo
**no se abre** y el cuerpo se queda cerrado. Sin regresión: `antorcha`, `arranque`, `bloque_fuente`,
`bloques`, `dsl` y `giro`, los seis en verde.

**Plantado** — `node redstone/plantar_piston.js` monta palanca → cable → cable → pistón → ladrillo en
`/map/test` (**x=70..81, z=45..49**, a la derecha de todo lo que ya había), lo acciona para comprobar
que empuja de verdad, lo deja en posición de partida y guarda. El script **aborta sin tocar nada** si
la parcela tiene algo que no sea suyo. Cambios en el mapa: 65 celdas, **ninguna fuera de la parcela**,
y una nota nueva (el cartel); ninguna nota del dueño borrada.

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

**Actualizado 2026-08-07, tras cerrar [BUG-STR1](#-bug-str1).** Se responde a la mitad de lo que estaba
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

<a id="-bug-str1"></a>

### ✅ BUG-STR1 · `hab:cubo-trans` se coloca como estructura fina y no como bloque — ✅ cerrado 2026-08-07

**Reportado** 2026-08-07 por el dueño, con captura de rayos-X (`data/tickets/BUG-STR1/01.png`):

> «¿por qué se pinta "cubo-trans" como estructura y no como bloque? ¿no habíamos dicho que íbamos a
> usar siempre `setVoxel` para colocar bloques o estructuras salvo que `game.useOldStructBuildCall`
> fuera `true`?»

En la etiqueta de rayos-X de `269,15,263` pone **`estructura · guardada · hab:cubo-trans`**, mientras
que todas las de alrededor (`cable`, `piston@16`, `boton@8`) ponen **`bloque · guardada`**. La regla
que cita existe y está escrita en `CLAUDE.md:826` («válvula por si acaso:
`game.useOldStructBuildCall = true`, persiste en `localStorage`»), así que el camino por defecto
debería ser el de `setVoxel`.

**Al abrir el ticket se apuntaron dos lecturas posibles. No era ninguna de las dos.**

1. ~~Se colocó por el camino viejo (fallo de enrutado)~~ — no: la válvula estaba apagada, y la decisión
   se toma **antes** de que `useOldStructBuildCall` llegue a opinar (`mcPlace` pregunta primero a
   `mcCabeEnRejilla`, que decía «no cabe» y mandaba a `mcStampStruct`).
2. ~~Un cubo de cristal **hueco** tiene forma, y lo que tiene forma va a `mc.structures`~~ — tampoco:
   `data/habitantes/cubo-trans.json` son **4096 voxels**, el 16³ **completo**. De hueco, nada.

**Lo que le echaba del terreno era el ALPHA.** Su color es `#4ab8d924` (α = 0x24 ≈ 14 %). `mcStructCells`
marca `translucido=true`, y eso apagaba `blockLike` **y** hacía que `mcCabeEnRejilla` devolviera `false`.
De los 16³ del proyecto es el único con alpha: `agua`, `agua-profunda`, `like-water` y `likelava` son
todos opacos, por eso nadie se había topado con esto.

**Y el motivo de aquella exclusión era cierto a medias.** La **proyección a las 6 caras del cubo** —que
era el único camino al terreno cuando se escribió— efectivamente no sirve: `buildTexFaces` hornea el
atlas con `d[o+3]=255`, tira el alpha, y el shader del terreno solo hace recorte binario, así que el
cubo saldría **macizo**. Pero entrar en `mc.grid` **ya no obliga a proyectarse**: desde `mc.finoRejilla`
el mallador emite la geometría de verdad dentro de la malla del chunk, y ese flujo tiene **su propia
pasada con `BLEND`** (`finoAVbo`/`finoACount`, hermana del `aAlpha`/`vAlpha` de las piezas sueltas). La
regla se quedó vieja: prohibía el terreno entero cuando lo que no vale es una de sus dos mitades.

**El arreglo.** La condición vivía **copiada en tres sitios** (`mcCabeEnRejilla`, `mcEsFinaEnRejilla` y
el horneado de `mc.finoRejilla` en `mcBuildPalette`), que es justo por lo que pudo quedarse a medias. Se
recoge en una **fuente única**, `mcRecFina(rec)`, y los tres la llaman:

| pieza | camino dentro de `mc.grid` |
|---|---|
| `blockLike` (16³ macizo **y opaco**) | proyección a 6 caras — fiel y cuesta 6 quads |
| la piel **no** cubre (una flor, una llama) | geometría real (ya era así) |
| la piel cubre pero es **translúcida** | **geometría real** ← lo que abre este ticket |
| la piel cubre y tiene `caras` | sigue **fuera** del terreno: una máscara sobre un macizo enseñaría el otro lado, que es otro problema y no se toca |

`blockLike` **no** cambia: sigue en `false` para el translúcido, porque lo que dice es «la proyección es
fiel», y no lo es.

**La luz, que era la regresión escondida.** Estampado suelto, el cubo no está en `mc.grid` y la luz del
cielo le pasaba entera; metido en la rejilla sin más, un techo de cristal habría dejado a oscuras lo de
debajo — peor que antes. `mcBuildPalette` marca ahora `mc.recorte[id]=1` para **toda** celda que se
dibuje con geometría fina, que es lo que ya afirmaba `mcTapaCara` por su lado (`mc._geoFina`) y lo que
lee `mcTablaLuz`. `hueco` no se toca: eso enciende el `discard` del shader para **todo** el terreno, y a
una celda fina el atlas ni se le mira. La válvula del snippet
(`game.bloques.define(clave,{luz:'tapa'})`) sigue mandando encima.

**Medido con la misma sonda antes y después** (`sonda_str1_piston.js`, camino entero del dueño: ranura +
clic derecho, y luego un pistón delante):

| | antes | ahora |
|---|---|---|
| `mcCabeEnRejilla('hab:cubo-trans')` | `false` | `true` |
| clic derecho → ¿queda en `mc.grid`? | no | sí |
| instancias sueltas creadas (draw calls propios) | 1 | **0** |
| **el pistón lo empuja** | **no** | **sí** |
| luz bajo un techo de 13×13 | (no aplicaba: no era bloque) | 13, frente a 8 del opaco |

`test_cubo_translucido.js` nuevo (**33 ok**), con el diagnóstico metido como asertos: que son 4096
voxels y no una cáscara, que lo que tiene es alpha, que la geometría crece en el lote **translúcido**
del chunk y no en el opaco (+468 de 468), que **sigue chocando** como un cubo entero, y que `hab:agua` y
`hab:likelava` no se enteran de nada. Sin regresiones en `test_clic_derecho_rejilla.js`,
`test_flor_en_rejilla.js`, `test_luz_traspasa.js`, `test_luz_al_estampar.js`,
`test_luz_incremental_navegador.js`, `test_atlas_estructuras.js`, `test_ficha_material.js`,
`test_caras_mundo.js`, `test_atravesable.js`, `test_piston_empuja.js` y `test_redstone_piston.js`.

⚠️ **Lo que NO se ha hecho.** Un 16³ translúcido cuesta ahora geometría fina (≈800 vértices por celda
frente a los 36 de un bloque proyectado): sigue sin costar draw calls, pero un muro largo de cristal
pesa. Dentro del lote translúcido del chunk no hay ordenación por profundidad, igual que ya pasaba con
cualquier celda fina con alpha. Y **no** se ha tocado `caras` sobre un macizo, que sigue fuera del
terreno a propósito.

---

### La secuela: el `-on` perdía el `@n` al activarse

**Reportado** 2026-08-10 por el dueño, justo después de comprobar el primer arreglo:

> «giro el observador y rayos-X muestra como `observador@2` hasta ahi bien, pero cuando lo activo
> poniendo un bloque delante de el, el bloque de observador activado aparece girado, no aparece en
> la direccion que esta»

**Causa** en `dispararObservador` (`redstone/redstone.js`):

```js
var idOn = mc.name2id ? (mc.name2id[quieroOn] || mc.name2id[par.on]) : 0;
```

El fallback `mc.name2id[par.on]` es la clave **sin girar** (`asset:...observador-on.vox.json`). Antes
del primer arreglo daba igual porque los observadores solo cabían en la rejilla con `rot=0`. Ahora
que `observador@2` sí cabe:

1. `quieroOn` = `asset:...observador-on.vox.json@2` — **no existe en la paleta todavía** (nunca se ha
   disparado esta variante girada; `mcAltaVariante` solo registra la del apagado al colocarla).
2. Cae al fallback `mc.name2id[par.on]` = clave **sin girar** — sí existe si el material se ha
   cargado alguna vez.
3. `mcSetBlock` escribe el id sin girar en la celda.
4. El observador activado aparece **con la orientación del `@0`**, no la del `@2` que había.

La comprobación `if (!idOn)` solo protegía del caso «nada existe», no del caso «existe la sin girar
pero no la orientada» — que es justo lo que activó este bug al arreglar el primero.

**Arreglo** (`redstone/redstone.js`, dos sitios):

```diff
- var idOn  = mc.name2id ? (mc.name2id[quieroOn]  || mc.name2id[par.on])  : 0;
- var idOff = mc.name2id ? (mc.name2id[quieroOff] || mc.name2id[par.off]) : 0;
+ var idOn  = mc.name2id ? mc.name2id[quieroOn]  : 0;
+ var idOff = mc.name2id ? mc.name2id[quieroOff] : 0;
  ...
- cargarYReintentar(par.on, nx, ny, nz, function () { ... });
+ cargarYReintentar(quieroOn, nx, ny, nz, function () { ... });
```

`cargarYReintentar` acepta cualquier clave y llama a `game.addMaterial(clave)`, que rutea por
`mcAltaVariante` (la ruta rápida sin re-hornear el atlas si la base ya está — y siempre lo está,
porque colocar el observador orientado la registra primero).

Y el mismo patrón en **`repasarMundo`** (`redstone/redstone.js`), que devuelve a off cualquier
observador-on persistido en disco: se quita el fallback `|| mc.name2id[par.off]` para que el
observador vuelva a la orientación que tenía, no a la sin girar.

**Republicado** con `node redstone/make_snippets.js` (motor `redstone` → 58.6 KB, snippets al día).

**Verificación**
- Sintaxis: `node --check redstone/redstone.js` OK.
- El test guardián `test_observador_rotacion.js` gana el tramo **§3d**: coloca `observador@1` en la
  rejilla «a mano» (bypass del clic), pone un bloque delante para dispararlo, y comprueba que la
  clave que queda en la celda es `observador-on@1` (no `observador-on` sin girar), y que tras el
  pulso vuelve a `observador@1`. Como el §3, sigue **pendiente de ejecutar** hasta que se instale
  Playwright.
- Como anti-falso-verde del test: **antes de correr `dispararObservador`, el test carga a propósito
  la clave sin girar** (`OBS_ON`) para asegurarse de que `mc.name2id[par.on]` está indexada — así el
  fallback tendría a dónde caer. El único motivo por el que la clave escrita tras el disparo puede
  llevar `@1` es que el motor haya dejado de usar ese fallback. Si algún día alguien lo restaura, el
  test falla justo aquí.

⚠️ **Nota metodológica**: el arreglo de la secuela **no lo pilla la sonda `sonda_bug_rs19.js`**, porque
esa sonda es puramente A/B sobre `mcRecFina` — no sabe nada de `mc.name2id` ni del ciclo del
observador. El fallo secuela **solo se ve** con el motor de redstone corriendo sobre una celda real
de la rejilla, o sea en navegador.

### El precedente que hay que recordar

Cada vez que se cambia el enrutado de un material entre `mc.grid` y `mc.structures`, hay que
**auditar todo sitio que asuma qué claves están en `mc.name2id`**. Este ticket enseña que un fallback
razonable en un motor auxiliar (aquí `redstone.js`) puede convertirse en un fallo cuando el flujo de
alta de variantes cambia. Para futuros tickets del mismo estilo: buscar en los snippets llamadas de
la forma `mc.name2id[claveOrientada] || mc.name2id[claveBase]` antes de dar por cerrado el arreglo
del motor.

---

### Lección para futuros tickets

**Un centinela como `yoEscribiendo` protege UNA cosa pero suele silenciar VARIAS**. Cuando el
envoltorio de una función tiene varias responsabilidades (aquí: encolar circuito **+** notificar
observadores) y una salida temprana común, saltarse el envoltorio se salta todas. Si hace falta
saltar solo una, hay que **partir el trabajo** — sea moviendo la responsabilidad al llamador (como
aquí, con la llamada explícita) o descomponiendo el envoltorio en dos funciones separadas con
guardas independientes.

---

### Lección para futuros tickets

**Un corte que descarta un evento (`return` sin encolar) es una mentira sobre el flujo del sistema**.
El `apagones.has(...) → return` original decía «te ignoro porque estás ocupado», y eso es correcto
para evitar recursión síncrona. Pero un flanco es un evento real: si se descarta, se pierde para
siempre y el sistema queda desincronizado. La opción correcta es **encolar** el evento y procesarlo
cuando el sistema esté listo (aquí: al terminar el pulso). Es el mismo patrón que usa el propio
motor con su cola `cola`/`drenar` para la propagación de señal — y aquí se replica a escala del
observador con `pendientesObs`.

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

### Respuesta del dueño (2026-08-12) — las cinco contestadas

> «1) sería la 10 claramente, 2) lo que hace la tecla "p" es cambiar de tool como hasta ahora, "p"
> rota, clic de raton abre galeria para elegir entre las que hay o bien alt+p 3) solo se tienen que
> mostrar las herramientas para "2)" 4) solo una y que se pueda elegir la categoria desde el editor
> 2d/3d 5) por defecto el pico»

Queda **cerrado el diseño**:

1. **Es la ranura 10**, nueva, detrás de la 9. No se toca la 9 ni se pierde ninguna ranura de bloques.
   (Las frases del enunciado que decían «9» eran el lapsus que se sospechaba.)
2. **`P` sigue rotando** como hasta ahora — no cambia nada de lo que ya existe. Lo que abre la galería
   es el **clic** sobre la ranura o **alt+P**. El dueño **no ha pedido tecla numérica** para
   seleccionarla (`0` u otra): queda fuera salvo que lo pida.
3. La galería que se abre desde ahí **enseña solo herramientas** — es el picker de siempre con un
   filtro, no una galería nueva.
4. **Una sola categoría por pieza** (es una «carpeta», no etiquetas), y **se elige desde el editor
   2D/3D**. Esto es lo que convierte el punto de las categorías en trabajo de verdad: no basta con
   leer `meta.categoria`, hay que **poder ponerlo desde la interfaz** del editor y que se guarde.
5. **La herramienta por defecto es el pico** (`build`). Con eso se disuelve la asimetría de
   `vf_mcTool` —que restauraba `build`/`paint` pero no `select`/`pick`— sin tener que decidir si se
   restauran las cuatro: se arranca siempre con el pico.

**Comprobado (2026-08-12): las cuatro piezas existen** con las claves exactas que dio el dueño —
`hab:pico-de-piedra` («Pico de Piedra»), `hab:pincel-de-texturizado`, `hab:cuentagotas` y
`hab:varita-de-selecci-n` («Varita de Selección»)—, las cuatro con `type: objeto` y **`categoria`
vacía**, así que hoy no las distingue nada: clasificarlas es parte del trabajo.

**Lo único que queda sin decidir, y es menor:** con la categoría elegible desde el editor, cualquiera
puede marcar como «herramienta» un dibujo **al que no corresponde ninguna herramienta del motor** (las
herramientas siguen siendo cuatro y viven en el código). Lo natural es **no ofrecerlo** en la ranura —
que la galería liste lo que es herramienta *y* tiene herramienta detrás—, pero se confirmará al
implementar, porque la alternativa (enseñarlo apagado) también se defiende.

---

### Cómo quedó (2026-08-12) — ✅ hecho

**El vínculo herramienta → dibujo lo declara EL DIBUJO, no el motor.** Es la decisión de la que cuelga
todo lo demás, y la que evita repetir [BUG-RS23](PLAN_ARCHIVO.md#-bug-rs23) / [BUG-FLUID3](PLAN_ARCHIVO.md#-bug-fluid3). Cada una de
las cuatro piezas lleva en su `meta` **`categoria:'herramienta'` y `herramienta:'build'|'paint'|
`'select'|'pick'`**, y el motor **busca en `mc.catalog`** cuál lo dice (`mcHerramientaKey(tool)`). En
ninguna tabla hay una clave escrita a mano, así que exportar el pico de `hab:` a `asset:` **no rompe
nada**: la ranura lo sigue. El test lo comprueba cambiándole la clave al catálogo en caliente.

**La taxonomía es una sola lista, `GAL_CATEGORIAS`** (`app.js`), con 7 entradas: sin clasificar,
herramienta, construcción, fluido, redstone, decoración, personaje. De ahí se pinta **el desplegable
del editor 2D/3D** (`#meta-categoria`), y cuando la categoría es «herramienta» aparece un sub-selector
(`#meta-herramienta`, de `MC_HERRAMIENTAS`) — porque preguntarle a un adoquín qué herramienta es no
tiene sentido. Cambiar de categoría **suelta** el vínculo: un dibujo que pasa a decoración deja de
reclamar que es el pincel. `server.py` persiste los dos campos y los devuelve en `/api/habitantes`.

**La ranura 10** va detrás de la 9, separada por un hueco, etiquetada **`P`** y **nunca marcada como
activa** (la herramienta siempre lo está). **`P` rota** exactamente como antes. Reparto del ratón, a
petición del dueño y **igual que en las ranuras de bloque**: **izquierdo rota** (la misma tabla que la
tecla, extraída a `mcRotaHerramienta()` para que no haya dos) y **derecho abre la galería**; `alt+P`
también abre, sin rotar. La galería es **el picker de siempre** con `mc.pickTool`: mismo buscador,
mismo orden de [REQ-GAL4](PLAN_ARCHIVO.md#-req-gal4), sin botón «quitar» (siempre hay herramienta activa).

**Se decidió lo que quedaba abierto:** un dibujo marcado «herramienta» con un valor que el motor no
conoce **no se ofrece** (`mcHerramientasConDibujo` cruza con `MC_HERRAMIENTAS`). Enseñar algo que al
pulsarlo no hace nada es peor que no enseñarlo.

**`vf_mcTool` se borra y ya no se persiste.** Con el pico por defecto (punto 5), la asimetría vieja
—guardaba las cuatro, restauraba dos— desaparece en vez de arreglarse.

**Los iconos de la hotbar, de propina y a petición del dueño sobre la marcha.** Al ver la ranura P al
lado, las nueve de bloque cantaban: recortaban **una cara del atlas a 16 px** y el CSS la estiraba a 42
(factor 2,625, ni entero ni suavizado). Ahora **las diez** pintan **el dibujo en iso sobre
transparente** (`mcPintaIconoRanura` → `drawThumbRanura`), con dos arreglos que solo hacen falta a ese
tamaño: **supersampling ×4** (`renderIso` no suaviza nada; a 120 px son 4 px por voxel y todo filo sale
en escalera) y **recorte a lo dibujado** (`drawThumb` encuadra la *caja*, y un pico de 58 voxels dentro
de su lienzo de 16³ ocupa la mitad: en 42 px, un garabato). El atlas queda de reserva para lo que no
tenga dibujo. **La galería NO pasa por ahí, por decisión del dueño**: sus tarjetas son grandes, el
encuadre común es lo que deja compararlas, y ahí ya se veía bien. `.mc-slot` pierde el fondo oscuro y
la barra baja de `.72` a `.36` de opacidad, que es lo que deja ver los iconos.

**Guardián: `tests/test_tool1_ranura_herramienta.js`** (área `editor`, 41 comprobaciones, verde). El
que de verdad importa es el penúltimo —cambiar la clave del catálogo y exigir que la ranura la siga—,
porque es el único que se rompería si alguien vuelve a escribir `hab:…` a mano. Los demás cubren el
servidor sirviendo el vínculo, el desplegable del editor pintado desde `GAL_CATEGORIAS`, el
sub-selector apareciendo/soltándose, las 10 ranuras con la de herramienta **la última**, `P` dando la
vuelta entera, el reparto izquierdo/derecho del ratón, la galería listando **4 y solo 4**, elegir la
varita **activando** `select`, el intruso desconocido que no se ofrece, y la calidad del icono (llena
la ranura, cabe entera, 120 px de lienzo, esquinas transparentes).

**Área `editor` completa: 17 ok / 2 fallos**, los dos **ajenos** — `test_flor_en_rejilla.js` ya fallaba
antes de tocar nada (comprobado con `git stash`) y `test_suelo_al_estampar.js` es el intermitente de
siempre (verde en solitario, rojo en tanda).

---
### Respuesta del dueño (2026-08-12) y estado

> «sobre "REQ-GAL4" punto 1) a la larga hay que intentar hacer que ambas galerías sean una sola, que
> compartan su funcionalidad y codigo para no mantener más codigo del necesario. ahora implementalo»

Queda contestada la primera pregunta: **son dos copias, y a la larga hay que fundirlas en una**. Pero
la fusión es **objetivo a largo plazo, no ahora** — lo de ahora era el punto 1.

**✅ Punto 1 hecho (2026-08-12) · el buscador exige 3 letras.** Con menos de 3 **no filtra**: se sigue
viendo el catálogo entero. Se eligió así porque vaciar la rejilla mientras tecleas parece un buscador
roto, y porque el catálogo es justo lo que quiere ver quien viene a curiosear en vez de a buscar algo
concreto. Para que no parezca que la caja no responde, sale un aviso —«Falta 1 letra para buscar»—
debajo, y el `placeholder` de las dos cajas ya lo anuncia («3 letras mín.»).

**Lo importante es DÓNDE está la regla, no la regla.** Hay dos buscadores casi idénticos
(`#hab-picker-search` en la galería del editor y `#mc-picker-search` en el picker del Mundo), así que
el mínimo vive en **una sola constante y una sola función** que los dos llaman:

- `GAL_MIN_BUSCA = 3` y `galConsulta(input)` → devuelve la consulta **efectiva** (`''` mientras no
  llegue al mínimo, o sea «no filtres»). Los dos `oninput` se reducen a `galConsulta(...)`.
- `galAvisoMinimo(input, txt)` crea el aviso **al vuelo** colgando de `.mc-picker-bar`, que es el trozo
  de DOM que las dos galerías **sí** comparten — así no hay que tocar el HTML de cada una por separado.
  El CSS es `.gal-aviso-min` con `flex:1 0 100%`, para que caiga en su propia línea: como hermano
  normal se metía entre la caja y los filtros y los empujaba.

Esto es, a propósito, **el primer trozo compartido** entre las dos galerías: el camino hacia la fusión
que pide el dueño, empezado por donde tocaba en este ticket.

**Guardián: `tests/test_gal4_buscador_min.js`** (área `editor`, 18 comprobaciones, verde). Prueba **las
dos** galerías, tecleando de verdad (`page.type`, no asignar `.value`: lo que se vigila es el
`oninput`): con 2 letras el número de tarjetas **no cambia** y sale el aviso, a la 3ª filtra y el aviso
desaparece, y **borrar hasta 2 vuelve a enseñarlo todo** — que es la regresión fácil, quedarse con el
filtro viejo puesto.

---

### Respuesta del dueño (2026-08-12) al punto 2, y cierre

> «sobre punto 2: reciente es cuando se ha importado o modificado recientemente ese asset, y sobre
> tamaño me vale el nº de voxels»
>
> «el orden debe recordarse entre sesiones, si»

Contestadas las tres que faltaban: **«recientes» = importado o modificado** (`savedAt`), distinta de
**«creación»** (`createdAt`, el alta); **«tamaño» = número de voxels** (`count`), ni la caja del dibujo
ni los bytes; y el orden **se recuerda entre sesiones**.

**✅ Punto 2 hecho (2026-08-12) · ordenación en las dos galerías.**

**Lo que costó no fue ordenar, fue tener por qué ordenar.** Las dos fechas y el recuento **no
existían** en las dos fuentes: `assets/index.json` no llevaba ninguna de las tres, y `/api/habitantes`
no devolvía `createdAt`. Así que `server.py` ahora:

- **Rellena lo que falte al vuelo, una sola vez**, al listar: `savedAt`/`createdAt` ausentes salen del
  **mtime** del fichero y `count` de contar `voxels`. Es un apaño honesto para los 70 assets viejos —
  el mtime no es la fecha de alta real, pero es la única que existe— y se **persiste** al reescribir el
  índice, así que no se paga en cada listado.
- **`createdAt` no se toca al reguardar.** El `POST` de un habitante **relee el fichero previo** y
  conserva su `createdAt`; solo `savedAt` avanza. Si se pisara, «creación» y «recientes» serían la
  misma columna con dos nombres, que es exactamente lo que el dueño no pidió. Esto **no lo cubre el
  test de navegador** —probarlo exige guardar dos veces, y en `data/habitantes/` no se escribe basura de
  prueba ni se borra nada—: se verificó levantando el propio `server.py` en el puerto 8599 con
  `server.STORE` apuntando a un directorio de usar y tirar en `/tmp`, guardando dos veces el mismo
  dibujo y viendo que `createdAt` se queda quieto mientras `savedAt` avanza.

En el front, el orden vive **en un solo sitio** que llaman las dos galerías —segundo trozo compartido,
detrás de `GAL_MIN_BUSCA`—: `GAL_ORDENES` (las cuatro opciones), `galCompara(orden)`,
`galOrdenaLista(items)` y `galMontaOrden(barra, onCambio)`, que **inyecta el `<select>`** en
`.mc-picker-bar` en vez de escribirlo dos veces en `index.html`. Detalles que cuestan caro:

- **Las fechas se comparan como CADENA, a propósito.** Son ISO (`2026-08-12T…`), donde el orden
  alfabético **es** el cronológico; y así una fecha vacía cae al final sola, sin que un `new Date('')`
  → `NaN` envenene el `sort`. Hay un test justo para eso.
- **Los dos órdenes se COMPONEN, no compiten.** La galería del editor agrupa por tipo (`habOrdena`), y
  ese agrupado se mantiene: se ordena primero por lo que eligió el dueño y encima se agrupa, que es
  estable. Si el orden ganase al agrupado, «nombre» dejaría las **86 texturas** comiéndose la pantalla,
  que es justo lo que el agrupado existe para evitar. Se ordena la lista **ya mezclada** (assets +
  guardados) para que dentro de un tipo se intercalen por fecha, en vez de salir en dos bloques.
- **Cambiar el orden en una galería sincroniza el `<select>` de la otra**, además de guardarlo en
  `localStorage['vf_galOrden']`: si no, al abrir la segunda enseñaría un orden que no es el aplicado.

**Guardián: `tests/test_gal4_orden.js`** (área `editor`, 24 comprobaciones, verde). Comprueba primero
que **el servidor sirve los tres campos** en las dos fuentes (si no, todo lo demás «pasaría» ordenando
por campos vacíos); luego `galOrdenaLista` en seco con una muestra donde cada orden da un resultado
**distinto** —si no, un comparador que no ordenase nada pasaría el test—; y luego las dos galerías de verdad:
agrupado intacto, orden dentro del grupo, que cambiar de orden **mueve** las tarjetas, que sobrevive a
**recargar la página**, y que el picker del Mundo abre con el orden elegido en la otra.

---

### Correcciones del dueño (2026-08-12), ya aplicadas

> «cuando se escribe en el buscador 1 letra o 2, hacen falta 3 para buscar, cada pulsacion de esa tecla
> produce un ralentizamiento exagerado del entorno; si no hace busqueda no deberia ralentizarse nada,
> de fondo se ve hasta como caen los fps. Por otro lado, "creacion" y "recientes" muestra basicamente
> lo mismo, se puede borrar "creacion" y dejar unicamente recientes.»

**1 · El buscador se frenaba justo cuando había decidido no buscar. Arreglado.** El punto 1 del ticket
se implementó a medias: `galConsulta()` devolvía `''` («no filtres») pero el `oninput` **repintaba
igual**. Y repintar no es barato: son **114 tarjetas**, cada una con su `<canvas>`, su `getRoomData()`
y su `drawThumb()`, y en el picker del Mundo además un `mcStructCells()` por ítem. Con la galería
abierta encima del Mundo, eso se ve como una caída de fps **del entorno de detrás**, que es lo que
describe el dueño. O sea: se pagaba el precio entero de buscar **precisamente cuando se había decidido
no buscar**.

El arreglo es el corte que faltaba, y va en el mismo sitio compartido que el resto:
`galConsultaNueva(input, anterior)` devuelve la consulta efectiva **solo si ha cambiado**, y `null`
cuando no —y entonces el `oninput` sale sin tocar la rejilla. El **aviso sí se sigue actualizando** con
cada tecla, porque su texto es lo único que de verdad cambia («Faltan 2 letras» → «Falta 1 letra»).
Cubre de paso el caso simétrico: borrar de 2 letras a 1, o teclear algo que no cambia el texto
normalizado.

**Lección, que es lo que hay que recordar:** «no filtrar» y «no repintar» son **dos cosas distintas**, y
la primera sin la segunda es un bug de rendimiento con toda la pinta de estar arreglado.

**2 · Fuera «creación». Aplicado.** Enseñaba prácticamente lo mismo que «recientes», y **tiene una
explicación**: el relleno de lo viejo no tenía de dónde sacar dos fechas distintas y puso
`createdAt = savedAt` en los 70 assets y en los guardados que no la traían. Las dos fechas solo se
separan **a partir de que algo se reguarde**. Quedan tres órdenes: recientes (defecto), nombre, tamaño.

⚠️ **Se ha quitado la opción, NO el dato.** `server.py` sigue guardando y sirviendo `createdAt`, a
propósito: cuesta cero, se separa solo con el uso, y es información que **no se puede reconstruir
después** —salió del **mtime**, y ese mtime ya no volverá a ser el de entonces—. Si algún día el dueño
quiere «fecha de alta», el dato estará ahí; si se borrase hoy, se perdería para siempre. Por eso el
test **sigue exigiendo** `createdAt` en las dos fuentes: es lo que impide que alguien lo borre más
adelante por parecer código muerto. Si el dueño prefiere quitarlo del todo, es un cambio aparte y
consciente.

**Guardianes actualizados.** `tests/test_gal4_buscador_min.js` sube a **18 comprobaciones** con lo que
faltaba: se **marcan** las tarjetas, se teclea por debajo del mínimo y se exige que sigan ahí **los
mismos nodos** (si alguien vacía la rejilla para volver a llenarla igual, la marca desaparece) — en las
dos galerías, y comprobando además que a la 3ª letra **sí** repinta. Se verificó que el test **falla
sin el arreglo** (0 de 114 tarjetas sobreviven), que es la única forma de saber que vigila algo.
`tests/test_gal4_orden.js` se queda en **24**: sin «creación», y con la muestra en seco rehecha para que los
tres órdenes den **tres resultados distintos** —y distintos del orden de entrada—, porque si no un
comparador que no ordenase nada pasaría el test.

---

<a id="-req-fluid4"></a>

### 🔴 REQ-FLUID4 · «Ilusión de agua»: que un lago parezca una masa continua, no cubos transparentes — 🔴 abierto 2026-08-10

**Petición del dueño:** que el agua se vea como en Minecraft —una masa continua y cristalina— en vez
de una cuadrícula de cubos transparentes con las **aristas y caras internas** a la vista. Aporta un
análisis de **otra IA** con tres pilares:

1. **Culling de caras internas** — una cara de agua que colinda con **otra agua** no se emite; solo
   queda la «cáscara» (superficie + bordes contra aire o sólido). Es lo que mata el entramado de
   líneas internas.
2. **Altura de la capa superior** — un bloque fuente expuesto al aire **no llena el cubo**: se
   renderiza a ~87,5 % de alto, lo que además evita Z-fighting con lo que flote encima.
3. **Mezcla α y tintado** — el agua se pinta en una **pasada final**, después de los opacos y
   **ordenada de atrás hacia delante** (`SRC_ALPHA, 1-SRC_ALPHA`); y la textura es en **escala de
   grises**, tintada por bioma (turquesa en picos helados, verde/marrón en pantano).

**Alcance aclarado por el dueño (2026-08-10), en cuatro mensajes:** los fluidos **ya existen y
funcionan**, no se toca la simulación. Lo que falta es el **aspecto**: «desde fuera o desde dentro
tiene que parecer agua cristalina», incluida la **vista subacuática**. **Fuera de alcance de
momento:** reflejar el cielo y las nubes — «más adelante». Y permiso explícito para los datos que
haga falta: «si necesitas hacer un bloque sólido de agua de 16×16×16 con alpha, hazlo».

### Causa raíz (investigada, 2026-08-10)

**No es que falte culling en el mallado del cubo: es que el agua no pasa por ahí.**

`assets/agua.vox.json` son **2784 voxels** de un solo color `#3377ff1a` (alpha 26/255 ≈ 10 %). Con
`translucido=true` y `nvox < 4096`, `blockLike` sale **false** (`app.js:6673`), así que el agua entra
por el **camino fino de la rejilla** (`mc.finoRejilla`), no por el del bloque. Y eso es correcto y
deliberado —lo explica `mcRecFina` (`app.js:6710-6713`)—: **el atlas del terreno se hornea sin
alpha** (`buildTexFaces` fija `d[o+3]=255`) y el shader del terreno **recorta**, no mezcla, así que un
translúcido proyectado al cubo saldría **macizo**. Para eso existe la pasada `finoAVbo` con BLEND.

⚠️ **Ahí está el fallo:** el camino del cubo **sí** culla contra el vecino (`mcTapaCara`,
`app.js:7952-7967`, con altura de fluido incluida), pero el camino **fino no culla nada entre
celdas**: `copia()` (`app.js:7999`) vuelca **todas** las caras de la cáscara de cada celda. Dos celdas
de agua contiguas dibujan **dos paredes translúcidas pegadas** en su frontera y, con alpha 0,10 cada
una, eso es exactamente la cuadrícula de aristas que se ve. `mcTapaCara` además devuelve **false** a
propósito para toda celda fina (`app.js:6053-6058`) — la regla de las hojas «fancy», correcta para
hojas y ruinosa para un fluido contra sí mismo.

O sea: **el pilar 1 del análisis es el problema real, pero vive en el camino fino**, no en el del cubo.

### Plan por fases (no todo de golpe)

1. ✅ **Culling agua-agua en el camino fino — HECHO (2026-08-11).** Ver abajo.
2. ✅ **Bloque de agua 16³ con alpha — HECHO por el dueño (2026-08-11).** `assets/agua.vox.json` y
   `assets/lava.vox.json` son ya 16×16×16 = 4096 voxels de un color con alpha.
3. ✅ **Vista subacuática — HECHA (2026-08-11).** Ver abajo.
4. **Reflejos de cielo y nubes** — aplazado por el dueño ⇒ sale de aquí y vive en
   **[REQ-FLUID5](PLAN_ARCHIVO.md#-req-fluid5)** (2026-08-11). Este ticket queda **cerrado en lo suyo**.

⚠️ Del análisis original de la otra IA, lo que **sigue sin comprobar** (y no hace falta para 1-3):

- **Contrastar el punto 2 con fuente.** El «~87,5 %» y el «nivel 8/8» del análisis **no cuadran entre
  sí**: en Minecraft la fuente es el nivel **0**, y 8/8 sería lo contrario de lleno. El número puede
  ser bueno y la etiqueta mala, pero hay que verificarlo, no copiarlo.
- El **tintado por bioma** es un rasgo aparte y más gordo (no tenemos biomas): probablemente sea
  ticket propio, o un tinte por material. Preguntar al dueño si lo quiere dentro de éste.
### ✅ Fases 1-2 · Que parezca agua **desde fuera** — hechas (2026-08-11)

Petición del dueño tras probar la fase 3: «vale, tiene mejor pinta, ahora quiero que parezca agua
también desde fuera».

**Lo que se emite ahora.** El camino fino ya sabe **a dónde mira cada cara**: `mcStructGeom` guarda,
en arrays paralelos a los `…SC` de luz, un byte por cara (`colFD`/`alphaFD`/`texFD`) con el índice de
`MC_FACES`… **o 6 si el quad no está en la piel de la pieza**. Esa distinción no es adorno: un quad
que mira a +Y puede estar en el interior del modelo (el techo de una cueva dentro de la pieza), y a
ése no lo tapa ningún vecino. Con eso, el bucle fino de `mcMeshChunk` calcula una máscara de 6 bits
por celda y `copia()` se salta las caras marcadas. **Una charca de 9×9×3 pasa de 1458 caras a 81** —
justo la lámina de arriba.

Las tres reglas, que son las mismas que el camino de cubo llevaba desde siempre:

- vecino **opaco** que tapa la cara entera (`mcTapaCara`), y solo con el bloque lleno;
- **arriba/abajo** contra el mismo fluido: siempre (`mcGetFluidHeight` ya devuelve 1.0 cuando hay
  fluido encima, así que los dos planos coinciden exactos);
- **de lado** contra el mismo fluido: solo si el vecino **llega tan alto** como uno mismo; si no,
  asoma una franja y hay que dibujarla.

⚠️ **Se compara TIPO de fluido, nunca id.** `hab:agua` y `hab:agua-1..7` son ids distintos de la
**misma** masa de agua, y agua contra lava son tipos distintos y sí se ven. Para eso está
`mcTablaFluido()` — tabla densa `id → 'WATER'|'LAVA'|''` sacada de `game.fluidos.getProps()`, con la
caché invalidada por el tamaño de la paleta **y por la identidad de `game.fluidos`**: la instala un
snippet y puede llegar **después** del primer mallado, así que sin esa segunda condición el «aquí no
hay fluidos» se quedaba cacheado para siempre.

⚠️ **La regresión que destapó todo esto (y que era la mitad del problema visible):** los niveles de
fluido se apendan a la paleta en `setFluid`, **después** de que `mcBuildPalette` hornee
`mc.finoRejilla`. Ese `mc.finoRejilla[id] = …` escribía **pasado el final de un `Uint8Array`**, y JS
lo tira sin decir nada. Resultado: `agua-3` perdía «me dibujo con mi geometría fina» y volvía al
camino de cubo… que proyecta desde el **atlas del terreno, horneado sin alpha** ⇒ un cubo azul
**opaco** en medio de un lago translúcido. Ahora los cuatro arrays (`finoRejilla`, `finoExtra`,
`recorte`, `atraviesaDoc`) **crecen**, como ya hacía `mcAltaVariante`.

**Y el alpha del agua.** Con las caras internas fuera, un lago es **una sola lámina**, no dieciocho
apiladas; con `#3377ff1a` (α = 0,10) el agua se volvía casi invisible. `assets/agua.vox.json` pasa a
**`#3377ff66`** (α = 0,40): cristalina —se ve el fondo y lo que hay dentro— pero se lee como agua.
Es un valor de asset: se cambia en el editor sin tocar el motor. Lava se queda como estaba (α = 0,74).

Válvula: **`mc.sinCullingFluido = true`** devuelve el lago-rejilla de antes (y está metida en la firma
de la caché de chunks, o sea que re-malla de verdad).

**Verificado** — `node test_caras_fluido.js`, TODO OK: mide la **malla** (caras del VBO translúcido
del chunk), no una variable; la expectativa del caso agua-contra-lava se **deriva de la rejilla de
verdad** en vez de escribirse a mano, porque si no se estaría midiendo al simulador de fluidos. Sin
regresión en `test_vista_subacuatica.js`, `test_fluido_importado.js`, `test_atlas_estructuras.js`,
`test_luz_al_estampar.js`, `test_caras_pegadas.js` ni `test_caras_mundo.js`. Comparativa en
`data/tickets/REQ-FLUID4/` (`4-fuera-sin-culling.png` / `5-fuera-con-culling.png` y `6-`/`7-` para
lava). Fallos previos que **no** son de esto y siguen igual que en HEAD: `test_cubo_translucido.js`
§6 (2), `test_flor_en_rejilla.js` (3), `test_luz_en_rejilla.js` (3).

### ✅ Fase 3 · Vista subacuática — hecha (2026-08-11)

Empezada la primera por petición del dueño. **`app.js` no reconoce ningún material por su nombre:**
pregunta a `game.fluidos.getProps()`, que es quien ya distingue agua de lava y entiende los niveles
(`hab:agua-3`). Por eso agua y lava salen del **mismo mecanismo** y solo cambian color y distancia,
como pidió («es como el agua pero cambia el color nada más»).

- `mcFluidoOjo()` mira la celda del **ojo**, no la de los pies (`mc.pos[1] + MC_EYE*mc.scale`, la
  misma altura que `mcViewMatrix`). Andar por un charco no tiñe; agacharse dentro, sí. Hay caso de
  test para eso.
- `mcActualizaVista()` corre **una vez por fotograma**, al principio de `mcRender()` y **antes del
  clear** — el color de fondo es la mitad del efecto, porque lo que queda más allá de la niebla es
  fondo, no cielo.
- Las dos palancas ya existían (`uSky`, `uFogNear`/`uFogFar`) pero **`MC_SKY` se leía suelto en 9
  sitios** y la niebla se fijaba a mano en 6. Ahora todos pasan por `mcCieloEf` / `mcFogNear()` /
  `mcFogFar()`. El **séptimo** sitio de niebla (el del overlay) se deja fuera a propósito: allí está
  desactivada y bajo el agua tampoco debe volver.

⚠️ **Las dos lecciones de esta fase, cada una de una ronda fallida:**

1. La niebla submarina va en **bloques absolutos**, NO en fracción del `far` de proyección como la de
   fuera. Con fracciones y `renderDist` alto la niebla acababa a ~50 bloques y no teñía nada: el
   efecto se quedaba en «he cambiado el color del fondo».
2. **Tinte y alcance son cosas distintas y hay que separarlas.** Arreglar (1) cerrando la niebla a 11
   bloques sí parecía agua, pero **borraba las paredes** — dicho por el dueño: «no se ven las paredes
   o bloques que no son agua cuando está buceando, deberían verse», y «quiero por lo menos un far
   100». Con una sola palanca hay que elegir entre las dos, y las dos hacen falta. La salida es un
   **suelo de niebla** (`uFogMin`, uniforme nuevo en los cuatro shaders con niebla): un tinte
   constante que se aplica igual a un bloque pegado a la cara que a uno lejano. Así `far` puede ser
   100 y el agua notarse igual. Fuera del agua vale **0**, o sea `f = 0 + 1·f`: idéntico al de antes,
   ni un float de diferencia. El overlay lo fija a 0 a mano, para que bucear no le eche un velo azul
   a la interfaz.

Comparativa en `data/tickets/REQ-FLUID4/` (`1-fuera.png` / `2-agua.png` / `3-lava.png`).

Valores estéticos ⇒ **tunables por consola**, no UI: `game.vistaAgua({far:60})`,
`game.vistaAgua({tinte:0.5})` (más azul **sin** perder alcance), `game.vistaAgua({sky:[0,0.4,0.6]})`,
`game.vistaLava({far:1})`, `game.vistaAgua('reset')`. Para probar sin nadar:
`mc.vistaFluido = 'WATER' | 'LAVA' | null` (y `undefined` para devolvérselo al motor).
Defectos: agua `far:100, tinte:0.30`; lava `far:6, tinte:0.80` — en lava se ve poco a propósito.

**Verificado** — `node test_vista_subacuatica.js`, 35 comprobaciones, TODO OK. Mide la **pantalla**
con `readPixels`, no variables. §6 corre en **`/map/voxelforge`** a propósito: `/map/test` no tiene
agua en la paleta, así que la detección automática —lo que puede romperse sin que nadie se entere—
se quedaba sin probar. Sin regresión en `test_sin_sombra.js` (fuera del agua los valores son los de
siempre, así que el render no cambia ni un float).

**Pendiente de este ticket:** fases 1 y 2 (el culling agua-agua y el bloque 16³), que son las que
quitan la cuadrícula vista **desde fuera**. El agua y la lava ya son 16³ de 4096 voxels.

- Materiales de agua que hay hoy, por si el arreglo debe cubrirlos a todos: `hab:agua`,
  `hab:agua-profunda`, `hab:like-water`, `asset:assets/agua.vox.json` y `assets/lava.vox.json` (256
  voxels, `#ff5500bd`). Antecedente **BUG-FLUID3**: allí el síntoma parecía del motor de fluidos y
  era de resolución de claves.

---


<a id="-req-env1"></a>

### 🟡 REQ-ENV1 · Ambientes realistas: presets de iluminación con un mando — 🟡 en curso 2026-08-13

**Petición del dueño.** Que el renderizado pueda componer **ambientes** completos —amanecer, mediodía,
atardecer, noche, niebla, tormenta, invierno, verano— aplicando de una vez todos los efectos estéticos
que hay. Aportó un esqueleto (`Entornos = {...}` + `aplicarEntorno`) y pidió **completarlo con todos
los efectos disponibles, hacerlo snippet, y probar cada entorno para ir corrigiendo**.

**Hecho como snippet, no en `app.js`** (`data/snippets/ambientes.json`) — es composición de mandos que
**ya existen**, justo lo que va en un snippet y no en el motor. Expone:

- `game.entorno(nombre)` — aplica el preset ya.
- `game.entorno(nombre, segundos)` — transición suave (smoothstep) desde el estado actual.
- `game.entorno()` — lista los nombres. `game.entornosTabla` deja la tabla a mano para trastear.

Cada preset compone **`game.cieloColor` + `game.reflejoAgua`{fuerza,curva,opacidad,color} +
`game.vistaAgua`{sky,tinte,far} + `game.sunShade`**. La transición interpola todo eso por fotograma;
el color de reflejo `'cielo'` se resuelve a RGB para poder interpolarlo y se restaura al final. El
bucle se **desmonta antes de montar otro** (`mc._entornoRAF`, misma regla que `mc._intro`).

**Verificado a mano con sonda**: los 8 presets aplican todos los mandos y la transición aterriza
**exacta** en el destino (`game.entorno('NOCHE', 1)` deja el estado clavado en NOCHE). Sin errores de
página.

⚠️ **Lo que la iteración ya deja ver que FALTA en el motor** (dos mandos que hoy no hay, y por eso
NIEBLA/TORMENTA/NOCHE se quedan a medias). No se inventan aquí: salen a ticket propio para no meter
efectos a medio hacer en el snippet.

- **Niebla atmosférica sobre el agua** → ✅ [REQ-ENV2](PLAN_ARCHIVO.md#-req-env2), hecho: `game.niebla({near,far,tinte})`,
  ya cableada en los presets (NIEBLA sale espesa de verdad).
- **Oscurecer el mundo de noche** → ✅ [REQ-ENV3](PLAN_ARCHIVO.md#-req-env3), hecho: `game.luz(factor)` (exposición),
  ya cableada en los presets (NOCHE sale oscura de verdad, las lámparas siguen encendidas).

**Estado:** el snippet está y aplica; queda la **ronda de probar y afinar** los números con el dueño
(por eso «en curso», no «resuelto»). Guardián: pendiente de que cerremos los valores — cuando estén,
uno de `@area: render` que mida la **pantalla** con un preset frente a otro, como `test_reflejo_agua`.

---


<a id="-req-env5"></a>

### 🟢 REQ-ENV5 · Reflejos realistas en fluidos: reflejar entorno, nubes y terreno — 🟢 resuelto 2026-08-15

> **Resuelto (2026-08-15).** Implementado mediante **pase especular planar (FBO + cámara invertida en Y + inversión de winding)** y **micro-ondulaciones animadas** en fragment shader (`MC_STRUCT_FS`). El agua refleja ahora de forma continua la geometría real del entorno (terreno, nubes de lana blanca, montañas, estructuras, agentes) con atenuación Fresnel y deformación sinusoidal superficial. Mandos expuestos en `game` (`reflejoEntorno`, `reflejoOndas`, `reflejoPlanoY`, `reflejoAgua`). Guardián: `tests/test_req_env5_reflejo_entorno.js`.

**Enunciado del dueño, literal:**

> «las superficies de fluidos como agua reflejan el cielo actualmente, pero han de comportarse de forma mas realista, han de reflejar tambien los objetos del entorno, ya sean cercanos, nubes, etc. como hace el agua en la realidad en su superficie»

**Área:** shader de fluidos / render de agua y entorno / composición visual.

**De dónde sale y qué amplía:**
- En [REQ-FLUID5](PLAN_ARCHIVO.md#-req-fluid5) se implementó la **fase 1 (Fresnel hacia el color del cielo `uSky`)**, que fue una solución económica y sin draw calls extra (uniforme `uReflejo` sobre caras superiores con marca `emit=2`).
- Con REQ-ENV5 el comportamiento se extiende para reflejar la **geometría real del entorno**: nubes (bloques de lana blanca), orillas del terreno, árboles, edificios o estructuras cercanas.

**Implementación técnica:**
1. **Pase especular planar (FBO + cámara invertida):**
   - Cuando hay agua visible y `mcReflEntorno > 0` (y no sumergido), se ejecuta un pase preliminar a `mc.refl.fbo` (512×512) reflejando la cámara respecto a la cota del agua ($Y = y_{agua}$, autodetectado mediante `mcDetectWaterY` o fijado con `game.reflejoPlanoY`).
   - La matriz de vista reflejada invierte $pitch \to -pitch$ y traslada el ojo a $2 y_w - eye_y$.
   - Se invierte el front face a `gl.CW` durante el pase para respetar el orden de los triángulos reflejados.
2. **Textura unidad 3:**
   - La textura de reflexión 2D se enlaza a `TEXTURE3` (`uReflTex`), conviviendo limpiamente con atlas (`TEXTURE0`), sombra (`TEXTURE1`) y luz 3D (`TEXTURE2`).
3. **Mapeo proyectivo y micro-ondulaciones en `MC_STRUCT_FS`:**
   - En el fragment shader, `gl_FragCoord.xy / uScreenSize` con coordenada Y invertida (`1.0 - suv.y`) mapea con precisión matemática 1:1 el rayo reflejado.
   - Se aplican ondas animadas `uReflOndas` dependientes de `vWorld.xz` y `uTime`.
4. **Mandos de consola (`game`):**
   - `game.reflejoEntorno(true / false)`: activa o desactiva la pasada y el reflejo de objetos del entorno (defecto activo, 1).
   - `game.reflejoOndas(factor)`: modula la intensidad de las micro-ondulaciones en la lámina de agua.
   - `game.reflejoPlanoY(y / 'auto')`: fija manualmente la altura del plano de agua o auto-detecta la masa más cercana.
   - `game.reflejoAgua('reset')`: restaura todas las propiedades a sus valores de fábrica.

---


<a id="-bug-imp1"></a>

### 🟡 BUG-IMP1 · Crash al importar objetos (`hex.slice is not a function`) — 🟡 en curso 2026-08-13

> **Crash arreglado (2026-08-13).** La pista fina de la traza: petó en `hex.slice` (línea 412), NO en
> `hex.length` (411) — o sea que `hex` **tenía** `.length` pero no `.slice`, y eso lo cumple un **número**
> (`number.length` es `undefined`, no lanza; `number.slice` no existe). Los colores importados eran
> **enteros empaquetados**. Arreglo en `hex6`/`shade`/`shadeBelow`: un entero finito se convierte a
> `'#rrggbb'` (`(c>>>0)&0xFFFFFF`), y cualquier otro no-string (objeto, `null`) cae en un **magenta de
> error** en vez de crashear — un import malo nunca debe tumbar el editor. Guardián
> `tests/test_importar_color.js`. **Queda por confirmar con el dueño** que los colores salen bien: si sus
> enteros no fueran `0xRRGGBB` sino otro empaquetado (con alpha, o índice de paleta), no crashearían pero
> saldrían con color equivocado; en ese caso, que mande el `.vox.json` y se ajusta la conversión.

**Reporte del dueño (traza literal):**

```
app.js Uncaught TypeError: hex.slice is not a function
    at shade (app.js:412) at isoFace (app.js:763) at drawIsoSliced (app.js:856)
    at drawIso (app.js:779) at render→rAF (app.js:1662)
```

**Causa raíz (encontrada):** al importar (`importJSON`) se hace `new Map(Object.entries(d.voxels))` y los
valores de color entran **tal cual** del fichero. El pipeline de color asume strings:

- `hex6(c)` (`app.js:274`): `if(typeof c!=='string' || c[0]!=='#') return c;` — un color que **no es
  string devuelve el no-string SIN TOCAR**.
- `shade(hex,f)` (`app.js:409`): `hex=hex6(hex)` (sigue sin ser string) → `hex.slice(1)` → **crash**, y
  como cae dentro del `render()` (la miniatura iso), revienta el editor entero al pintar.

O sea: el `.vox.json` que importa el dueño trae **algún color de voxel que no es `'#rrggbb'`** (un
número empaquetado, un objeto, `null`…). Falta:

1. **Blindar el pipeline** para que un color en formato raro **no crashee** (fallback + aviso), porque un
   import malo nunca debe tumbar el editor.
2. **Normalizar en la importación** al formato del editor. Pero para hacerlo BIEN (recuperar el color de
   verdad, no un gris de relleno) **hace falta un fichero de ejemplo** del dueño: hay que ver si los
   colores vienen como entero (`0xRRGGBB`), como `[r,g,b]`, bajo otra clave, o si el esquema del fichero
   es otro (p.ej. un doc de agente/habitante donde `voxels` no es un mapa plano de color).

**Pendiente:** el dueño pasa el `.vox.json` que peta (o su estructura) → se ve el formato → se normaliza.

---


<a id="-bug-fluid5"></a>

### 🔴 BUG-FLUID5 · Los guardianes de REQ-FLUID6/7 miden el fondo del pozo, no el fluido — 🔴 abierto 2026-08-11

**Investigado, sin decidir.** Salió al cerrar [REQ-FLUID9](PLAN_ARCHIVO.md#-req-fluid9), y lo primero que había que
descartar era haberlo roto yo: **no**. Se revirtieron las tres costuras de REQ-FLUID9 sobre `app.js` y
se volvieron a correr los dos ficheros ⇒ **mismo resultado exacto**, los mismos 4 fallos cada uno. Hoy:

| test | resultado |
|---|---|
| `node test_nadar.js` | 15 ok / **4 fallos** |
| `node test_hundirse.js` | 16 ok / **4 fallos** |

**La causa es que las constantes cambiaron de dueño y los tests no se enteraron.** Los dos se
escribieron contra el `MC_FISICA_FLUIDO` original de REQ-FLUID6 (`gravedad: 1/16`, `empuje: 8`, la
misma gravedad para agua y lava) y el motor lleva hoy los valores que **retuneó el dueño**:

```js
WATER: { gravedad: 0.5, arrastre: 0.22, empuje: 3 }
LAVA:  { gravedad: 1,   arrastre: 0.11, empuje: 2 }
```

De ahí salen los dos síntomas, y ninguno es un fallo del motor:

1. **Los tramos se salen del agua.** Con **8×** la gravedad de dentro, los tramos de 120 y 240 frames
   que antes se quedaban a media columna cruzan **enteros** un pozo de 9 de hondo: lo que miden es el
   fondo o la superficie, no el fluido. Se ve en los `vy = 0` de las lecturas.
2. **Las comparaciones agua↔lava dicen ahora lo contrario.** Con la gravedad ya distinta por tipo, la
   lava se hunde **igual** que el agua (2,42 las dos) y se nada en ella **más despacio** (2,42 contra
   4,84). Los tests exigen la relación de cuando la única perilla que separaba los dos líquidos era el
   `arrastre`.

**Lo que falta es una decisión del dueño, no código**, y por eso el ticket se queda abierto en vez de
«arreglarse»: los tests codifican **sus** decisiones de REQ-FLUID6/7 (cómo se siente hundirse, en qué
se diferencia la lava) y las constantes de hoy también son **suyas**. Reescribir los guardianes para que
pasen con los números nuevos es borrar la única copia escrita del criterio anterior; y volver los
números al original es deshacerle el tuneo. Las dos preguntas concretas:

- **¿Los pozos se hacen más hondos o los tramos más cortos?** Es lo que arregla el síntoma 1 sin tocar
  ninguna cifra de física — el fallo ahí es del **banco de pruebas**, no del criterio.
- **¿La lava tiene que seguir distinguiéndose del agua, y en qué?** Hoy se hunde igual y se nada peor.
  Si eso es lo buscado, los dos tramos de comparación se reescriben; si no, es la tunería la que falla.

⚠️ **Y hay una tercera copia de los números viejos: `CLAUDE.md`.** Su § «🏊 Física dentro de un líquido»
sigue citando `gravedad: 1/16` y `empuje: 8` para los dos fluidos. Esa parte **sí** se corrige sin
preguntar a nadie —la documentación tiene que decir lo que hay en el código— y va con este ticket.

**No se tocan mientras tanto.** Un guardián en rojo por un criterio que caducó es ruido, pero un
guardián borrado o relajado a la callada es peor: la próxima vez que alguien toque `mcCaidaPaso` no
habrá nada que le diga que se ha cargado el tacto del agua. Quedan en rojo **y anotados aquí**.

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

<a id="-bug-perf3"></a>

### 🟨 BUG-PERF3 · Colocar un bloque hunde los fps, y depende de DÓNDE se coloque — 🟨 medido y mejorado ×2,9 (2026-08-12), pendiente de la medida del dueño

**Reportado** 2026-08-12 por el dueño:

> «en un mapa complejo colocar un bloque, dependiendo de dónde se haga, genera una caída importante
> de fps.»

**El ticket llega con los deberes medio hechos y con una trampa.** En `performance/` ya estaba
escrito `PROTOCOLO_TEST_DUENO.md`, un guion paso a paso para medir esto **en la GPU del dueño**, y
dice en su línea 4 `Ticket: BUG-PERF3 en PLAN.md`. Ese ticket **no existía**: el protocolo se escribió
apuntando a un id que nadie llegó a dar de alta. Esta sección lo abre.

**Qué NO es.** Es fácil archivarlo como duplicado de [PERF-RS1](#-perf-rs1) porque el síntoma
(«caen los fps», «`mcMeshChunk` cuesta 20-124 ms») es el mismo, pero **el disparador es otro**:

| | [PERF-RS1](#-perf-rs1) | BUG-PERF3 (esto) |
|---|---|---|
| quién genera el trabajo | el motor de redstone oscilando solo | **el dueño colocando un bloque** |
| por dónde entra | `rs.procesarRemallar` (`redstone/redstone.js`) | `mcSetBlock` → `mcRemeshAround` (`app.js`) |
| lo arregla el *budget* de `PROPUESTA_PERF-RS1_pasada9.md` | sí, ahí es donde se instala | **no**: ese presupuesto vive en el snippet de redstone y una edición manual no pasa por él |

**La hipótesis, y por qué el «depende de dónde» es la pista buena.** Colocar un bloque **cambia la
topología** (aire↔sólido), y ese es justo el caso que `mcRemeshAround` (`app.js:8705`) no puede
saltarse: cuando `mc.gridGen` cambia hace las tres cosas caras —`mcRelightBox`, `mcMeshChunk` de cada
chunk tocado y `mcRebakeStructsNear`—, mientras que un observador pulsando no toca `gridGen` y se las
salta todas. De ahí que el coste dependa del **sitio**: en terreno liso el chunk es barato, y en un
chunk con estructuras finas dentro (pistones, observadores, cables, flores, agua) el mismo gesto
re-malla geometría cara y además re-hornea las estructuras del vecindario.

Está sin confirmar cuál de las tres domina, y son arreglos distintos:

- si manda **`mcMeshChunk`** → presupuesto/troceado del mallado, o caché por firma que hoy va al
  25-33 % de aciertos (`PROPUESTA_PERF-RS1_pasada9.md` §3);
- si manda **`mcRebakeStructsNear`** → acotar mejor qué estructuras se re-hornean de verdad;
- si manda **`mcRelightBox`** → el BFS de luz sobre la caja.

**Lo que falta para pasar de hipótesis a causa.** Dos caminos, y no se estorban:

1. **La medida del dueño** — `performance/PROTOCOLO_TEST_DUENO.md`, que pide exactamente lo que hace
   falta: dos volcados del **mismo** mundo y el **mismo** bloque, en un sitio malo y en uno bueno.
   Un volcado suelto no distingue «este bloque es caro» de «este sitio es caro». El paso 4
   (`game.renderMode='fast'`) reparte la culpa entre CPU y GPU en una línea. Los ayudantes que pide
   están verificados en `app.js` (`perfDump`, `perfAssert`, `perfContinuo`, `perfVerbosity`,
   `cacheStats`, `chunksActivos`, `chunkCacheSlots`, `shadowSize`, `renderMode`).
2. **Una sonda headless** en `performance/` que coloque el mismo bloque en un chunk liso y en uno
   cargado de estructuras y cronometre el desglose. Bajo SwiftShader los números absolutos no valen,
   pero **la razón malo/bueno y el reparto entre las tres funciones sí**, y eso es lo que decide qué
   se arregla.

---

#### Medido 2026-08-12 (camino 2, sonda headless) — y la hipótesis se quedó corta

`performance/sonda_perf3_colocar.js` coloca y quita el mismo bloque 24 veces en cuatro chunks que
solo se diferencian en lo que ya tenían dentro. **De las tres candidatas manda una sola, y por
goleada**: `mcMeshChunk` se lleva el **97 %**; `mcRebakeStructsNear` y `mcRelightBox` son ruido
(0,04 y 2,2 ms). Así que acotar el re-horneado o el BFS de luz **no habría movido la aguja**.

| chunk sembrado con | ms/gesto | de eso, meshChunk | razón contra «liso» |
|---|---|---|---|
| liso (terreno pelado) | 13,1 | 6,2 | — |
| flores (finas en rejilla) | 56,4 | 50,3 | ×4,3 |
| observadores + cables | **161,9** | **156,5** | **×12,3** |

Ese ×12,3 **es** el «depende de dónde» del enunciado.

**La causa, medida y no supuesta** (`performance/sonda_perf3_finos.js`): el chunk denso produce
**594 000 vértices finos**, y el emisor de geometría fina los acumulaba con
`out.push(9 valores)` **por vértice** sobre un array normal —5,3 millones de floats empujados de
nueve en nueve— para acabar copiándolo entero con `new Float32Array(arr)`. El chunk liso produce
**0** vértices finos y cuesta 3 ms. No es que el bloque sea caro: es que **colocar cambia la
topología**, y eso obliga a re-mallar el chunk entero pagando esos 594 000 vértices otra vez.

**Arreglo** (`app.js`, `mcMeshChunk`): el tamaño se conoce antes de emitir —cada cara son 6 vértices
× 9 floats, o sea `count*9` por flujo—, así que se reserva el `Float32Array` exacto de antemano y se
escribe **por índice**. Se acabaron el `push` variádico y la copia final. A la GPU se sube
`subarray(0,n)` porque la reserva es cota superior (el culling de caras por fluido puede saltarse
alguna).

| | antes | después |
|---|---|---|
| `mcMeshChunk` de un chunk denso, aislado | 147-224 ms | **39-45 ms** |
| colocar un bloque en el chunk de redstone | 161,9 ms/gesto | **56,7 ms/gesto** |
| razón contra «liso» | ×12,3 | **×5,3** |

**La geometría no cambia ni un vértice**, y eso está comprobado y no razonado:
`performance/sonda_perf3_verifica.js` saca una huella (longitud + hash + suma) de lo que se sube a
la GPU, y sale **idéntica** con el `app.js` de antes y el de después
(`5055534:b7e09a90:63151533.409` y `4320:7cf665d0:54809.776`).

**Sin regresiones**: las áreas `render` (14) y `caras` (7) dan **exactamente el mismo resultado**
antes y después del cambio (A/B con `git stash`), incluidos los que ya estaban en rojo. `--node`
sigue en 13/13 tras regenerar `SYMBOLS.md`, que se desincronizó porque el cambio mueve líneas de
`app.js` — lo canta `test_symbols_sync.js`, que hizo su trabajo.

**Lo que queda, y por qué no se cierra:**

- Siguen siendo **×5,3 frente al terreno liso** y ~50 ms de tirón: mejor, pero un chunk cargado
  todavía se nota. El techo de este camino ya se tocó; lo siguiente es no re-mallar el chunk entero
  por un bloque (**mesh incremental por celda**, §5.1 de `PROPUESTA_PERF-RS1_pasada9.md`), que es un
  refactor grande y **no se hace sin que el dueño lo apruebe**.
- **Falta la medida del dueño** (`performance/PROTOCOLO_TEST_DUENO.md`). Todo lo de arriba es
  SwiftShader: valen las razones y el reparto, **no los milisegundos**. En particular el paso 4
  (`renderMode='fast'`) es el que diría si en su GPU además hay un componente de fill-rate que aquí
  no se ve.

---

<a id="-perf-rs1"></a>

### 🔴 PERF-RS1 · Los observadores bajan mucho los fps cuando se encadenan varios — ✅ resuelto 2026-08-10

**Reportado** 2026-08-10 por el dueño:

> «los observadores bajan mucho los fps cuando se encadenan varios, requiere optimizacion»

**Por qué el problema aparece ahora.** Los arreglos de esta sesión levantaron dos límites que
escondían el coste:

- **BUG-RS19**: los observadores caben girados en la rejilla, así que se pueden hacer cadenas en
  cualquier dirección.
- **BUG-RS20**: un observador propaga su cambio a otros observadores vecinos.
- **BUG-RS21**: cada pulso genera **dos flancos** (subida y bajada) que propagan. Consecuencia:
  **N observadores en cadena → 2^N pulsos por evento**. Con N=4 son 16 pulsos, N=6 son 64, N=8 son
  256. Un reloj cara a cara oscila indefinidamente a 100 ms.

**Causa medible** (leída, no supuesta). En `redstone/redstone.js`, `dispararObservador` llamaba a
`remallar([[nx,ny,nz]])` **inmediatamente** tras cada `mcSetBlock` protegido, dos veces por pulso
(encendido y apagado, líneas 355 y 380). `remallar` acababa en `mcRemeshAround(x0,z0,x1,z1)`, que
re-malla el chunk 16×48×16 y sus vecinos. Con 2^N pulsos por evento, eran **2·2^N llamadas a
mcRemeshAround por evento**.

`drenar()` ya tenía un mecanismo de coalescencia (`tocadas[]` local, línea 597 antes del arreglo)
pero solo cubría las escrituras del propio drenado, no las de `dispararObservador` — que llama a
`remallar` fuera de esa vía.

**Arreglo** (`redstone/redstone.js`, republicado a 64.2 KB):

1. **Buffer global `tocadasRemallar`** que acumula celdas tocadas por el motor.
2. **`pedirRemallar(x, y, z)`** — añade al buffer y agenda un `rAF` (`rafRemallar`) si no hay uno
   pendiente.
3. **`procesarRemallar()`** — al final del rAF, calcula la caja envolvente de todas las celdas
   acumuladas y hace **UNA sola** llamada a `mcRemeshAround`. Después limpia el buffer.
4. **`remallar(tocadas)`** — reciclada como pass-through al buffer. Todas las llamadas existentes
   (`dispararObservador`, `drenar`, `apagones` de `revisar`, etc.) coalescen sin cambiar más.
5. **`game.redstone.tick()`** — el drenado síncrono usado por los tests procesa también el buffer
   inmediatamente tras `drenar()`, así el efecto visual se ve en el mismo tick.

**Coste después del arreglo**. Todos los pulsos de un mismo tick del event loop se combinan en
**una** re-mallada. Un evento en una cadena de N observadores, que antes costaba 2·2^N llamadas,
ahora cuesta **1** llamada. En un reloj cara a cara: antes 4 re-malladas cada 200 ms (2 por
observador × 2 flancos); ahora 1 cada 200 ms. El coste del mallado en sí (~ms por chunk) no cambia,
pero el número de veces que se paga baja drásticamente.

**Trade-off consciente**: el re-mallado se difiere al próximo `rAF` (≤ 16 ms). Los cambios de
material en `mc.grid` son inmediatos (no cambia el `mcSetBlock`), lo único diferido es la geometría
en pantalla. En la práctica, es invisible: el mundo se re-dibuja en el siguiente frame de todos
modos.

**Verificación**
- `node --check redstone/redstone.js` OK.
- `node redstone/make_snippets.js` — motor `redstone` republicado a 64.2 KB.
- `node sonda_bug_rs19.js` sigue en verde (sonda de humo, no depende de este cambio).
- El **test `test_observador_rotacion.js` §3f/§3g** (BUG-RS20/21) sigue midiendo transiciones de
  material en `mc.grid`, no la geometría. La coalescencia del re-mallado no afecta a la lógica
  medida: los pulsos siguen contando `2` al poner y `2` al quitar, y el reloj cara a cara sigue
  oscilando. Pendiente de ejecutar en Playwright cuando se instale.

**Verificación manual sugerida** (con DevTools cerrado, como manda el proyecto):
- Cadena de 4-8 observadores en fila con antorcha al final. Pulsar. Los fps no deberían caer
  visiblemente durante el pico.
- Reloj cara a cara + cadena adyacente. Los fps deberían quedarse cerca del baseline del Mundo.
- El comportamiento arreglado por BUG-RS19/20/21 sigue exactamente igual (mismos parpadeos, misma
  propagación).

**Lo que NO se ha hecho, a propósito**
- **No se han pre-horneado las variantes on/off en el mismo lote** ni se ha tocado el mecanismo de
  `mc.finoGeom` por variante `@n`. Si el mallado en sí (el coste de un `mcRemeshAround`) sigue
  siendo alto en cadenas muy largas, ese es el siguiente sitio a mirar — pero primero hay que medir
  si sigue haciendo falta. La coalescencia por sí sola quita 2·2^N llamadas y probablemente basta.
- **No se ha añadido presupuesto de pulsos por frame**: si un reloj cara a cara con muchas piezas
  aún baja fps, se puede acotar 2^N con un tope. Requiere mediciones antes de decidir.

### Segunda pasada — el cuello real era `mcComputeBlockLight` global

**Reportado** 2026-08-10 por el dueño tras la primera pasada:

> «sigue cayendo los fps, un solo observador con un boton delante y un cable detras, provoca
> caidas de hasta 30fps»

**Un solo observador** con la primera pasada ya no llama a `mcRemeshAround` más de 1 vez por frame,
así que la coalescencia no arregla nada aquí. El cuello estaba **dentro** de `mcRemeshAround` en
`app.js:7818`: la línea `mcComputeBlockLight()` sin argumentos, que recalcula la luz de bloque
emisiva del **mundo entero**. Con un observador pulsando cada 100 ms y **cualquier** emisor en el
mundo (`mc.hasGlow=true`), esta función hacía un BFS anisótropo sobre `N=dim.x*dim.y*dim.z` celdas
cada 100 ms. En 96×48×96 son ~442 k celdas por vuelta; en 512×40×512 son 10⁷.

Y encima, el observador **no emite luz** (ninguno de sus dos estados tiene voxels con `*`). El BFS
produce **exactamente el mismo `BL`** que antes del pulso: puro trabajo tirado.

**Arreglo**: short-circuit en `mcComputeBlockLight` por firma:

1. **Contador `mc.gridGen`** en `mcSetBlock` (`app.js:5817`). Solo incrementa cuando cambia entre
   aire y sólido (`(oldId===0) !== (id===0)`). Un observador pulsando cambia dos ids sólidos: NO
   incrementa. Romper/poner un bloque sí. Este es el criterio: la topología del BFS de luz de
   bloque solo cambia cuando cambia la geometría (dónde hay bloques y dónde no).
2. **Firma de emisores en `mcComputeBlockLight`**: hash rápido del Set `mc._glowCeldas` (emisores
   en rejilla, con posición) más un hash de `mc.structures` con `emitCells`. Es O(emisores +
   estructuras), no O(celdas del mundo).
3. **Salida rápida**: si `emiSig` y `mc.gridGen` no han cambiado desde la última pasada Y `mc.blockLight`
   ya existe, salir sin tocar nada. `BL` sigue siendo válido byte a byte.

**Coste después del arreglo** (analítico, pendiente de medición navegador):
- Antes: cada pulso → BFS global sobre N celdas ≈ 10-100 ms según tamaño del mundo. A 10 pulsos/s
  = 100-1000 ms/s de CPU perdida.
- Después: cada pulso → O(emisores + estructuras) ≈ decenas de operaciones. Prácticamente cero.

**Seguridad**:
- Si se rompe un bloque, `mc.gridGen` incrementa (aire↔sólido cambió) → firma cambia → BFS completo.
- Si se pone/quita un emisor, `mc._glowCeldas` cambia y el hash cambia → BFS completo.
- Si se estampa/quita una estructura, `mc.structures.length` cambia → hash cambia → BFS completo.
- El observador pulsando entre `observador@n` y `observador-on@n` (ambos sólidos, ninguno emisor) →
  ni la firma ni `gridGen` cambian → BFS se salta. **Es exactamente el caso del bug.**

**Verificación**:
- `node --check app.js` OK.
- `node sonda_bug_rs19.js` OK (sonda de humo, no depende de este cambio).
- Los tests de rejilla existentes (`test_luz_incremental_navegador.js`, `test_luz_traspasa.js`,
  `test_cubo_translucido.js`) siguen comparando celda a celda contra el BFS global; si el
  short-circuit hiciera algo incorrecto se rompería alguno. Pendiente ejecutar en navegador cuando
  Playwright esté disponible.

**Verificación manual sugerida** (DevTools cerrado):
- **El caso mínimo del dueño**: 1 observador + botón delante + cable detrás. Pulsar el botón. Los
  fps deberían mantenerse cerca del baseline (antes caían hasta 30 fps).
- **Regresión de luz de bloque**: colocar una antorcha, apagarla (poniéndola en una celda distinta),
  la luz debe refrescar correctamente. Romper una pared entre dos habitaciones con antorcha en una,
  la luz debe llegar a la otra (cambio de topología → `gridGen` incrementa → BFS se recalcula).

### Tercera pasada — `mcRelightBox` y `mcRebakeStructsNear` también saltables

**Reportado** 2026-08-10 por el dueño tras la segunda pasada:

> «siguen cayendo los fps mucho. si pongo un boton y un observador y empiezo a hacer pulsaciones
> del boton caen bastante los fps»

**Causa** — `mcRemeshAround` llama a **tres** cosas caras en cada pulso: `mcComputeBlockLight`
(arreglado en la pasada 2), **`mcRelightBox`** (BFS incremental de skylight sobre caja ±16 bloques ×
NY ≈ 33² × NY celdas) y **`mcRebakeStructsNear`** (re-hornea la malla de cada estructura cercana con
`mcBuildStructMesh`). Un observador pulsando entre `observador@n` y `observador-on@n` no cambia la
luz ni las estructuras — los tres son puro trabajo tirado.

**Arreglo** — misma técnica que la pasada 2, extendida a las otras dos funciones. `mcRemeshAround`
ahora usa `mc.gridGen` (que solo cuenta cambios de topología aire↔sólido) para decidir:

```js
const genActual = mc.gridGen | 0;
const topologia = mc._reLastGen !== genActual;
const luz = topologia ? mcRelightBox(bx0,bz0,bx1,bz1) : null;
mcComputeBlockLight();  // ya se salta por su propia firma
...
for (chunks) mcMeshChunk(nx, nz);   // el mallado SÍ hay que hacerlo — cambia el UV del atlas
if (topologia && mc.structures.length) mcRebakeStructsNear(bx0, bz0, bx1, bz1);
if (topologia) mc._reLastGen = genActual;
```

**Qué se salta y qué no**, para un pulso de observador (sólido→sólido, sin emisión):
| pieza | antes | ahora |
|---|---|---|
| `mcRelightBox` (skylight de la caja) | ~33² × NY celdas | **saltado** |
| `mcComputeBlockLight` (BFS global de luz de bloque) | O(NX·NY·NZ) | **saltado** (pasada 2) |
| `mcMeshChunk` (mallado del chunk) | O(chunk) | igual — es lo mínimo que hay que hacer |
| `mcRebakeStructsNear` (re-hornear estructuras) | O(estructuras cerca × malla) | **saltado** |

**Lo que sí se paga**: `mcMeshChunk` sobre el chunk del observador (16×48×16 celdas iteradas + emisión
de VBO). Es lo que hay que hacer para que se vea el cambio de textura del atlas.

**Seguridad**:
- Se rompe/pone un bloque real (aire↔sólido) → `gridGen` incrementa → `topologia = true` → los tres
  pasos se ejecutan como antes.
- Se cambia de material entre dos sólidos (observador, palanca, botón) → `gridGen` no cambia →
  `topologia = false` → se saltan los tres. Correcto: la luz y las estructuras cercanas siguen
  válidas byte a byte.

**Verificación**:
- `node --check app.js` OK.
- `node sonda_bug_rs19.js` OK.
- Los tests de rejilla existentes (`test_luz_incremental_navegador.js`, `test_luz_traspasa.js`,
  `test_cubo_translucido.js`) comparan celda a celda contra el BFS global — cualquier regresión de
  luz se detecta ahí. Pendientes de ejecutar en Playwright.

**Verificación manual esperada** (DevTools cerrado): pulsar rápido un botón con un observador cerca
debería mantener los fps cerca del baseline del Mundo. La regresión de luz sigue cubierta: cualquier
cambio real de topología (romper/poner un bloque de verdad) recalcula todo.

**Lo que queda por medir**, si aún cae con muchos observadores:
- **`mcMeshChunk` en sí**: 12288 celdas por chunk × N chunks re-mallados. Es lo mínimo posible con la
  arquitectura actual. Optimizar exigiría re-mallado incremental por celda (refactor grande).
- **Subida de VBO a la GPU**: cada `mcMeshChunk` hace `bufferData` sobre el VBO del chunk. Con
  chunks grandes o muchos re-mallados por frame puede ser el cuello siguiente. Se puede medir con
  `game.perf()` (existe según memoria del proyecto).

### Cuarta pasada — Medido con Playwright: `mcMeshChunk` es el cuello real

**Reportado** 2026-08-10 por el dueño tras la tercera pasada:

> «no ha mejorado, haz tu mismo las pruebas, solamente un boton hace que caigan mucho los fps,
> caen como 30 fps, si se sigue dando seguido como para hacer señales de morse se caen como 100 los
> fps. un boton+un observador del boton»

**Medida en SwiftShader** (Playwright, sonda propia con 10 pulsaciones y `game.redstone.conmutar()`):

| fase | llamadas | ms/llamada | ¿saltado por v3? |
|---|---|---|---|
| `mcRemeshAround` | 10 | 17.66 | (padre) |
| **`meshChunk`** | 10 | **11.72** | NO — es el mínimo necesario |
| `blockLight` | 10 | 1.60 | NO — el **botón** emite luz al encenderse, la firma sí cambia |
| `relight` | **1** | 42.40 | **9 de 10 saltadas** por v3 ✓ |
| `rebake` | 0 | — | **todas saltadas** por v3 ✓ |

**Conclusión**: **`mcMeshChunk` es ~66% del coste** por pulso. Con 5-6 pulsos/segundo del dueño, esto
son ~65 ms/segundo de CPU pura en mallado (2 ms × 12 pulsos en GPU real; 12 ms × 12 en SwiftShader).
Es el cuello real. `mcComputeBlockLight` no se salta porque el **botón encendido `hab:boton-on`**
tiene voxels emisivos (`*`), así que su cambio de estado sí modifica el índice `mc._glowCeldas` y la
firma sí cambia — el BFS es legítimo.

**Arreglos de esta pasada** (`app.js` y `redstone/redstone.js`):

1. **Short-circuit por firma en `mcMeshChunk`**. Al principio del mallado se calcula un hash rápido
   del chunk (12288 celdas: id + luz + luz de bloque) y se compara con la última pasada. Si es
   igual, salir sin recomputar verts ni subir VBOs. Ayuda cuando `mcRemeshAround` recibe una caja
   grande que abarca chunks intactos, y en pulsos que vuelven a un estado ya cacheado.

2. **Tunable `game.redstone.pulsoVisible`** (defecto `true`). Si `false`, el observador cambia de
   material en `mc.grid` pero **no dispara `remallar`**. El circuito sigue funcionando (la señal
   propaga, la antorcha se enciende, el redstone reacciona), pero el observador no se refresca
   visualmente durante su pulso. Ahorra `mcMeshChunk` por flanco.

**Medido con la sonda** (SwiftShader, 10 pulsaciones):
- `pulsoVisible=true`: **288 ms totales** de CPU en mallado/luz.
- `pulsoVisible=false`: **193 ms totales**, **33% menos**.

En GPU real la ganancia absoluta es más pequeña (SwiftShader infla los números) pero la ganancia
relativa debería ser similar.

**Uso**:
```js
game.redstone.pulsoVisible = false;   // rendimiento máximo, pulso del observador invisible
game.redstone.pulsoVisible = true;    // defecto: pulso visible pero paga re-mesh
```

⚠️ **Limitación del tunable**: si el observador está en el **mismo chunk** que un cable/botón que
sí re-mesh (por su propia lógica de encolar en `drenar()`), el chunk se re-mesh igualmente por esa
vía, y el observador se ve encendido visualmente por casualidad. El tunable solo ahorra 100% en
observadores lejanos de otras piezas que cambian.

**Lo que quedaría por hacer** (refactor grande, no ahora):
- **Mesh incremental por celda**: cambiar el material de una celda solo actualiza el rango de vértices
  correspondiente en el VBO, sin recomputar el chunk entero. Es como funciona Minecraft real. Es un
  refactor significativo del pipeline de rendering.
- **Cachear el atlas UV por par (id, cara)** de forma que cambiar de material entre `observador@n` y
  `observador-on@n` solo actualice UVs sin regenerar geometría. También requiere refactor.

**Pide medición al dueño**: en su GPU real, con `game.showFPS(true)` y DevTools cerrado, comparar:
- Con 1 botón + 1 observador quietos → baseline fps.
- Pulsando el botón rápido (Morse) con `game.redstone.pulsoVisible = true` (defecto).
- Idem con `game.redstone.pulsoVisible = false`.
Si la diferencia es grande, sabemos que `mcMeshChunk` era el cuello real. Si sigue cayendo mucho
con `pulsoVisible=false`, hay otro cuello que la sonda de SwiftShader no ha capturado.

### Quinta pasada — Cache LRU de VBOs por chunk

**Reportado** 2026-08-10 por el dueño tras la cuarta pasada + añadir `pulsoVisible`:

> «siguen cayendo los fps mucho»

Y midió con [REQ-PERF1](#-req-perf1) recién implementado:
```
CAÍDA DE FPS: 36.6 fps  (umbral 120)
  mcRemeshAround       1  30.10 ms
  mcMeshChunk          2  27.90 ms  (max 16.90 ms/call)
  mcComputeBlockLight  1   2.20 ms
```

**Diagnóstico definitivo con datos de GPU real**: cada pulsación paga **2 × `mcMeshChunk` a 14-17 ms cada uno**. La coalescencia por rAF ya reduce a 1 llamada de `mcRemeshAround` por frame, pero esa llamada toca 2 chunks (el botón/observador están cerca del borde) y cada chunk cuesta 14-17 ms. `pulsoVisible=false` **no ayuda** porque el BOTÓN mismo re-mesh (cambia de `hab:boton` a `hab:boton-on`), y como el observador está en el mismo chunk, se refresca por esa vía.

**Arreglo — Cache LRU de VBOs por chunk** (`app.js`, `mcMeshChunk`):

Un chunk con observador oscila entre 2 estados (encendido / apagado). En vez de regenerar los verts en cada cambio, cachear los VBOs de los últimos 2 estados y hacer SWAP cuando el chunk vuelve a un estado conocido.

- **Estado activo**: `ch.vbo`, `ch.finoVbo`, `ch.finoAVbo` con la firma `ch._meshSig`.
- **Cache**: `ch._cache` = array de hasta 2 objetos `{sig, vbo, count, finoVbo, finoCount, finoAVbo, finoACount}` (LRU: al llenar 2, se descarta el más viejo con `deleteBuffer`).
- **Al llegar `mcMeshChunk`**:
  1. Calcular firma (12288 accesos: rejilla + luz + luz de bloque + gridGen + paleta).
  2. Si `sig === ch._meshSig` → nada que hacer, return.
  3. Si `sig` está en `ch._cache[i]` → **SWAP**: `ch.vbo` viejo pasa al slot, VBO del slot pasa a `ch.vbo`. Return. **Coste: 4 asignaciones + `mcShadowDirty()`**.
  4. Miss: guardar `ch.vbo` viejo en el cache (evict LRU si hay 2), crear `ch.vbo = gl.createBuffer()` nuevo, y proseguir con el mesh normal. Los VBOs cacheados sobreviven al `bufferData` posterior porque son buffers separados.

**Medido en la sonda Playwright/SwiftShader** (10 pulsaciones con `game.redstone.conmutar`):

| escenario | v4 total | v5 total | mejora | `mcMeshChunk` ms/call |
|---|---|---|---|---|
| pulsoVisible=true | 288 ms | **185 ms** | −36% | 10.73 → **5.37** |
| pulsoVisible=false | 193 ms | **77 ms** | **−60%** | 6.34 → **1.77** |

`mcMeshChunk` promedia 5.37 ms porque los primeros 2 pulsos son cache miss (regeneran verts) y los 8 siguientes son cache hit (swap ~0.1 ms).

**En GPU real** (dueño): con los mismos números proporcionales, `mcMeshChunk` bajaría de 14-17 ms a
**~7 ms el primer pulso, luego ~0.1 ms** — cada pulso repetido casi gratis.

**Seguridad**:
- La firma incluye `mc.palette.length`, `mc.gridGen`, y hash de `mc.grid` + `mc.light` + `mc.blockLight` del chunk. Cualquier cambio real invalida el cache.
- Los VBOs cacheados están intactos: el `bufferData` va a un `ch.vbo` nuevo, no al cacheado.
- Al hacer swap, `mcShadowDirty()` marca la sombra sucia porque el terreno visible ha cambiado.

**Regresiones**: `node test_luz_incremental_navegador.js` (guardián de coherencia de luz vs BFS global) sigue en **19 ok, 0 fallos** — el cache no rompe la coherencia. `sonda_bug_rs19.js` en verde (10/10).

⚠️ **`test_observador_rotacion.js` tiene 6-7 fallos, pero son PRE-EXISTENTES**: se reproducen exactamente igual revirtiendo mi cambio de v5. Son bugs de:
- §3: `mcCabeEnRejilla` con clave `@n` no está cacheada la primera vez (async race).
- §3d/§3e: timings del pulso del observador en el test.
- §4: `hab:agua` y `hab:likelava` dan `mcRecFina=true` en vez de `false` (algo de fluidos cambió).

Estos fallos no bloquean PERF-RS1. Ticket aparte cuando toque.

### Sexta pasada — Medido en GPU real: el cache LRU no basta para circuitos complejos

**Reportado** 2026-08-10 por el dueño tras probar la 5ª pasada:

> «siguen cayendo los fps mucho»

Con la instrumentación de [REQ-PERF1](#-req-perf1) y los contadores `game.cacheStats()`, la evolución
del ratio de hits con distintos números de slots (circuito real de 3 pistones + 3 observadores):

| slots por chunk | hit rate | slots del chunk saturado |
|---|---|---|
| 6 (v5 inicial) | 25.0% | 6 (lleno) |
| 16 | 29.1% | 16 (lleno) |
| 32 | 29.6% | 32 (lleno) |
| 64 | 33.8% | 64 (lleno) |
| **200** | **31.8%** | **200 (lleno)** |

**Conclusión definitiva**: los chunks centrales del circuito visitan **más de 200 estados distintos**
por causa de las cabezas de pistón que aparecen/desaparecen en celdas vecinas y los bloques
empujados. **El cache LRU no puede almacenar tantos**, y no es una cuestión de subir el número de
slots — el patrón no se repite.

Probé también con `game.cacheStrict = false` (quitar `mc.blockLight` de la firma, por si el BFS de
luz de bloque producía firmas inestables): ratio bajó a 26.9%, **no era ese el problema**. Los
estados son reales, no artefactos de la firma.

**Solución pragmática — Throttle por chunk** (`game.chunkThrottleMs`, default `0`):

Cada chunk no se re-mesh más de una vez cada `chunkThrottleMs` ms. Si un cambio llega dentro de la
ventana de throttle, se agenda un `setTimeout` con el mesh futuro (coalesced: solo uno por chunk).
Los cambios intermedios **no se ven**: solo se pinta el último estado cuando el throttle pasa.

**Trade-off**:
- Con `chunkThrottleMs = 50`: máximo 20 mesh/s por chunk. Pulsos rápidos (Morse) se ven a menor
  cadencia visual pero los fps se mantienen. Bien para circuitos complejos.
- Con `chunkThrottleMs = 33`: 30 mesh/s. Casi todos los pulsos visibles con margen de fps.
- Con `chunkThrottleMs = 0` (defecto): sin throttle. Fidelidad visual total pero fps caen con
  circuitos complejos.

**Solución de fondo (no implementada)**: mallado incremental por celda con `bufferSubData` — es lo
que hace Minecraft real. En vez de regenerar el VBO cuando cambia una celda, actualizar solo el
rango de vértices correspondiente. Trackear el offset de cada celda dentro del VBO. **Refactor
grande** (días de trabajo). Es la única forma real de resolver el problema sin trade-off visual.

**Estado del ticket PERF-RS1**:
- ✅ **Botón + observador simple**: resuelto por el cache LRU (86.7% hit rate en la sonda, hits
  visibles a partir del 3er click).
- ⚠️ **Circuitos complejos (3+ pistones/observadores)**: mitigable con `chunkThrottleMs`, sin
  arreglo definitivo hasta el refactor a mallado incremental.

Documentado con:
- `game.chunkCacheSlots` — tamaño del cache LRU por chunk.
- `game.cacheStrict` — modo estricto (default true).
- `game.chunkThrottleMs` — throttle por chunk.
- `game.cacheStats()` — hits/misses y distribución.
- `game.chunksActivos()` — qué chunks tienen slots ocupados.

### Séptima pasada — El cuello REAL era el mapa de sombra

**Descubierto** 2026-08-10 gracias a la instrumentación de `gl.bufferData` y `gl.drawArrays` en
[REQ-PERF1](#-req-perf1). En el volcado del dueño con circuito complejo:

| frame | fps | `gl.drawArrays` | vertices totales |
|---|---|---|---|
| normal | 71.4 | 25 llamadas | 412 260 |
| lento | **11.1** | **75 llamadas** | **996 720** |

**Casi 1 MILLÓN de vertices por frame lento**. Ninguna función CPU consumía tiempo real (todas 0
ms). Los 50 draws extra + 585k vertices extra estaban en la pasada del **mapa de sombra**.

**Causa** — `mcRenderShadow` mantenía dos firmas:
- **sigGeo** (geometría): cualquier cambio → `dirty=true` INMEDIATO → re-hornea toda la escena al
  FBO de sombra en el próximo frame.
- **sigMov** (movimiento de agentes): cambia → espera `mc.shadowMoveMs` (~46 ms, 22 Hz).

Con circuitos oscilando, cada frame **cambia la geometría del chunk** (aparece/desaparece la cabeza
del pistón, cambia el material del observador). `sigGeo` cambia → mapa de sombra se re-hornea cada
frame → +50 draws + 585k vertices extra por frame → GPU saturada.

**Arreglo** (`app.js`, `mcRenderShadow`): los cambios de geometría respetan ahora el MISMO throttle
que los movimientos de agentes. `S.geoChanged=true` marca que hay que rehornear, pero solo si pasan
`game.shadowGeoMs` ms desde el último bake. Por defecto = `mc.shadowMoveMs` (~46 ms → 22 Hz).

**Trade-off**: la sombra tarda hasta 46 ms en actualizarse tras un cambio de geometría. Invisible al
ojo — es el mismo throttle que ya se usa para agentes corriendo. Con `game.shadowGeoMs = 0` se vuelve
al comportamiento antiguo (rehorneo inmediato, fps caen).

**Tunables añadidos**:
- `game.shadowGeoMs = undefined` (usa `mc.shadowMoveMs`). Poner a `100` para 10 Hz, `0` para
  inmediato, o `Infinity` para congelar la sombra.
- Los tunables anteriores (`chunkThrottleMs`, `chunkCacheSlots`, `cacheStrict`) siguen disponibles
  pero **ya no hacen falta** si el problema real era la sombra.

**Estado revisado del ticket**:
- ✅ **Botón + observador simple**: resuelto (cache LRU + throttle sombra).
- ✅ **Circuitos complejos**: resuelto por el throttle de sombra. El cache LRU y el `chunkThrottleMs`
  quedan como palancas adicionales pero ya no imprescindibles.

**Lección**: hasta la pasada 6 se estaba atacando síntomas (cache, throttle chunks). **El cuello
real estaba en el re-render completo de la escena al FBO de sombra cada vez que la geometría del
mundo cambiaba**. Sin la instrumentación de `gl.drawArrays` de REQ-PERF1, era imposible verlo desde
CPU — el tiempo GPU no es medible con `performance.now()`.

### Octava pasada — Trade-off del throttle: sombra saltando (revertido por defecto)

**Reportado** 2026-08-10 tras la v7:

> «ahora a parte de bajar los fps no se actualizan las sombras... queda feo»

**Causa**: el throttle a 22 Hz produce sombra saltando visualmente (cada 46 ms toca rehornear, en
medio la sombra queda desincronizada). Y aunque redujo la **frecuencia** de rehorneos, **cada
rehorneo sigue costando lo mismo** (~50 draws al FBO de 2048², ~600k vertices). Los frames en los que
toca rehornear siguen cayendo a 14 fps. Percibido como stutter.

**Realidad del problema**: sin refactor a mapa de sombra incremental, cada rehorneo tiene un coste
mínimo. La única palanca sin refactor es **reducir el coste por rehorneo**:
- **`game.shadowSize`** (ya existía): 2048 → 1024 = 4× más barato. 2048 → 512 = 16× más barato pero
  sombra pixelada visible al acercarse.
- **`game.sunShade = 1`**: apaga la sombra del todo.
- **`game.shadowGeoMs`**: mantener default 0 (rehorneo inmediato, fluidez). Subir SOLO si el usuario
  acepta sombra retrasada.

**Cambio en v8**: **default de `game.shadowGeoMs` vuelve a 0** (sombra fluida). El tunable se
mantiene para el usuario que quiera sacrificar fidelidad por fps.

**Recomendación al usuario en circuitos complejos**:
```js
game.shadowSize = 1024;      // sombra un poco menos nítida, 4× más barata
// o
game.sunShade = 1;           // apaga la sombra del sol
```

**Sigue abierto** el refactor real: **mapa de sombra incremental por chunk** (dibujar al FBO solo
los chunks cuya geometría cambió, no toda la escena). Es lo que hace Minecraft real. Días de trabajo,
pero es la única forma de tener sombra fluida + fps altos en circuitos que cambian mucho.

**Estado final del ticket**:
- ✅ Escenarios simples: resueltos por las pasadas 1-6.
- ⚠️ Escenarios de circuitos complejos oscilando cada frame: el usuario tiene tunables
  (`shadowSize`, `sunShade`, `shadowGeoMs`) para gestionar el trade-off entre fidelidad visual y
  fps. Solución definitiva (mapa de sombra incremental) queda pendiente como refactor grande.

---

<a id="-req-perf1"></a>

### ✅ REQ-PERF1 · Profiler con callstack automático al caer los fps — ✅ resuelto 2026-08-10

**Reportado** 2026-08-10 por el dueño tras la cuarta pasada de [PERF-RS1](#-perf-rs1):

> «siguen cayendo los fps, nuevo ticket: implementar un callstack que permita depurar la caida de
> fps, si por ejemplo el motor da 140fps y caen 30fps, si esta activado un assert minimo 120fps, se
> tiene que volcar la traza/callstack para identificar que funciones se han llamado, cuantas veces,
> etc. una especie de profiling pero con un callstack que se muestra para poder depurar el verdadero
> cuello de botella. que permita elegir el nivel de verbosidad para poder aumentar la granularidad
> del profiling. El profiling se tiene que poder deshabilitar si el assert esta desactivado.»

Y las tres decisiones de diseño confirmadas:
1. Assert es **absoluto** (fps < 120, no una caída relativa).
2. Dispara al caer, y **se puede re-armar manualmente**.
3. Salida al `console.log`, de momento.

**Por qué hace falta.** Las cuatro pasadas de [PERF-RS1](#-perf-rs1) se hicieron con Playwright bajo
SwiftShader — CPU-only, 5-10× más lento que la GPU real. La proporción entre fases puede no
coincidir con la GPU real del dueño. Sin medir donde el problema ocurre, se optimiza a ciegas.

**Uso** (`app.js`, cerca de `game.showFPS`):

```js
game.perfAssert = 120;    // fps mínimo. Si el frame baja de aquí, dispara y vuelca al console.log
game.perfVerbosity = 1;   // 1 = render principal · 2 = + motor/agentes · 3 = todo (más ruido)
// Se juega un rato / pulsa el botón / lo que sea que hace caer los fps
// → si un frame cayó, salió por consola algo como:
// [perf] === CAÍDA DE FPS: 42.3 fps  (umbral 120, verbosidad 1)  2026-08-10T18:57:00.000Z ===
// [perf]  funcion                       llamadas   ms total  max ms/call
// [perf]  mcMeshChunk                          3      18.42          9.51
// [perf]  mcRemeshAround                       1       9.72          9.72
// [perf]  mcRender                             1       2.30          2.30
// [perf] === game.perfDump() re-arma; game.perfDump.reset() limpia; game.perfAssert=0 apaga ===

game.perfDump();          // re-arma y re-imprime el último dump
game.perfDump.forzar();   // vuelca AHORA MISMO el acumulador (sin esperar a otro frame lento)
game.perfDump.reset();    // limpia contadores y re-arma
game.perfAssert = 0;      // apaga el profiler: envolturas fuera, coste 0
```

**Semántica**:
- **`fpsFrame = 1000 / duración del frame`**, no el promedio de 500 ms de `game.fps`. Un frame concreto
  lento se detecta aunque el promedio esté alto.
- **Se desarma tras cada dump**: no inunda la consola con caídas repetidas. Al llamar `game.perfDump()`
  se re-arma.
- **Coste 0 con `perfAssert = 0`**: las envolturas de las funciones caras se retiran (`_perfInstalar`
  con `assert=0` restaura los originales), así que el motor corre exactamente como sin el sistema.

**Niveles de verbosidad** (`_perfNombres` en `app.js`):
- **1** (defecto): las 10 funciones caras del render — `mcTick`, `mcRender`, `mcUpdate`,
  `mcRemeshAround`, `mcMeshChunk`, `mcComputeBlockLight`, `mcRelightBox`, `mcRebakeStructsNear`,
  `mcBuildPalette`, `mcMeshAll`.
- **2**: añade motor + agentes — `mcSetBlock`, `mcCollides`, `mcRaycast`, `mcAgentsTick`,
  `mcAgentsSmoothUpdate`, `mcRestampAll`, `mcRebuildChunk`.
- **3**: añade capa fina — `mcResolveMat`, `mcPushHist`, `mcScheduleSave`, `mcDirty`, `mcGlowTocada`,
  `mcRenderShadow`, `mcShadowDirty`.

Cambiar `perfVerbosity` re-instala envolturas al vuelo. Subir el nivel añade granularidad a cambio
de un poco más de sobrecoste (unos microsegundos por envoltura por llamada).

**Detalles de implementación** (`app.js`):
- **Estado**: `_perfState = { armed, frame, lastDump, wrapping, origs }`.
- **Envoltorio**: `_perfWrap(nombre)` mide con `performance.now()` y acumula `{calls, ms, maxMs}` en
  `_perfState.frame[nombre]`. Marca la función envuelta con `w._perf = true` para no envolverla dos
  veces si se re-instala.
- **`mcTick`**: si el profiler está armado, limpia `_perfState.frame = {}` al principio y comprueba
  `fpsFrame` al final. Si baja del assert, congela el snapshot en `lastDump`, imprime, y pone
  `armed = false`.
- **Instalación por scope de `window`**: las funciones instrumentadas se resuelven contra `window`
  (son globales top-level). Sustituir `window.mcMeshChunk` con un envoltorio captura todas las
  llamadas desde `app.js` y desde los snippets — probado en la sonda.

**Verificado**:
- `node --check app.js` OK.
- `node performance/sonda_req_perf1.js` (nuevo): activa `perfAssert = 60` en Chromium bajo SwiftShader (~15 fps),
  el profiler dispara automáticamente y vuelca la tabla al `console.log`. Con `perfAssert = 0` el
  volcado no se produce. La API responde a asignación (`= N`) y devuelve valores correctos por
  getter. Snapshot capturado (SwiftShader):
  ```
  [perf] === CAÍDA DE FPS: 15.0 fps  (umbral 60, verbosidad 1)  ... ===
  [perf]  mcTick        1  0.80 ms
  [perf]  mcRender      1  0.40 ms
  [perf]  mcUpdate      1  0.20 ms
  ```
  (En SwiftShader el coste no está en la lógica sino en el render puro del navegador,
  por eso los tiempos son bajos — que es exactamente el tipo de información que este sistema debe
  darle al dueño en su GPU real, donde los tiempos serán distintos.)

**Para PERF-RS1**: el dueño puede ahora ejecutar en su navegador
```js
game.perfAssert = 120;
game.perfVerbosity = 2;
// pulsar botón + observador
```
y pegar el volcado. Con eso identificamos el cuello real de la caída sin adivinar contra SwiftShader.

**Lo que NO se hizo, a propósito**
- **No es un callstack profundo** (con árbol de llamadas quién llamó a quién). Es un perfil plano por
  frame: lista de funciones con sus tiempos y contadores. Para detectar el cuello es suficiente; un
  callstack profundo con push/pop en cada envoltorio cuesta más y complica el volcado.
- **No hay panel en pantalla**. Salida al `console.log` — es lo que el dueño pidió («de momento al
  console.log»). Un panel visible se puede añadir después si hace falta.

### Corrección tras el primer volcado del dueño

**Reportado 2026-08-10 (mismo día):** el dueño activó `perfAssert = 120`, pulsó el botón y el
profiler disparó con `41.2 fps` y solo mostró `mcRender: 6.8 ms + mcUpdate + mcCollides + mcRaycast`
= ~7 ms. Pero el frame duró **24.3 ms** (1000/41.2). **17 ms del frame no aparecían.**

**Causa**: la versión inicial medía solo la duración de `mcTick` con `performance.now()` local. Todo
lo que corre DESPUÉS de `mcTick` en el mismo frame (otros callbacks rAF como `procesarRemallar` del
snippet de redstone, composite del navegador, sync de GPU) quedaba fuera.

**Arreglo**: medir de **rAF a rAF**. Al inicio de cada `mcTick`, se cierra el frame anterior con
`now - mc.last` (que es el tiempo total transcurrido desde el rAF anterior, incluyendo todos los
callbacks intermedios) y se limpia el acumulador. Todo lo instrumentado durante el frame entero
—dentro de `mcTick` o fuera— se acumula, y al llegar el siguiente rAF se vuelca si fue lento.

Y se expandió la lista de niveles:
- **N1** añade: `mcUpdatePreview`, `mcUpdateXrayLabels`, `mcRenderShadow`.
- **N2** añade: `mcBuildStructMesh`, `mcMeshChunkFino`, `mcComputeLight`, `mcUpdateHotbar`, `updateWorldMeters`.
- **N3** añade: `mcSyncNoteSigns`, `mcGetFluidHeight`, `mcTapaCara`, `mcSolid`, `mcInside`, `mcIdx`.

Con esto el próximo volcado del dueño debería mostrar las 17 ms faltantes, y saber si vienen de
`mcRemeshAround`/`mcMeshChunk` (el cuello sospechado) o de otro sitio (composite, GPU sync…).

---


## Bitácora
- 2026-08-13 · 🐛 **[BUG-IMP1](#-bug-imp1): importar objetos tumbaba el editor, y lo cazó una línea de la traza** · `TypeError: hex.slice is not a function` al importar. La clave estaba en QUÉ línea petó: `hex.slice` (412) y no `hex.length` (411), así que `hex` tenía `.length` pero no `.slice` — un **número**. Los colores del `.vox.json` venían como **enteros empaquetados**, no `'#rrggbb'`, y `hex6` los devolvía tal cual para que `shade` reventara dentro del render de la miniatura → caía el editor entero. Arreglado en el pipeline de color: entero → se recupera su hex, cualquier otro tipo raro → magenta de error, nunca un crash. `test_importar_color.js`. Falta que el dueño confirme que los colores salen bien (por si el empaquetado no fuera `0xRRGGBB`). También cerrado [REQ-FLY2](PLAN_ARCHIVO.md#-req-fly2) de paso (vuelo vertical ∝ playerSpeed).
- 2026-08-13 · 📋 **Dos tickets nuevos del dueño, redactados con investigación:** [REQ-FLY2](PLAN_ARCHIVO.md#-req-fly2) — en modo vuelo el subir/bajar usa el fijo `mc.volarVel=6` mientras el horizontal usa `playerSpeed`, así que con velocidad alta la vertical se queda corta (confirmado en el código, fix a decidir si `game.volarVel` pasa a ser multiplicador). Y [BUG-GLOW1](PLAN_ARCHIVO.md#-bug-glow1) — revisar `game.glowLevel`/`glowFocus`: los setters recalculan+re-mallan bien, pero una sonda rápida dio `glowLevel` 15 y 5 con luz **idéntica** (sospechoso), y plantar una antorcha para probar resultó no trivial (`setVoxel('antorcha')` cae en roca); necesita un escenario limpio de una sola antorcha para confirmar.
- 2026-08-13 · 🔦 **[REQ-ENV4](PLAN_ARCHIVO.md#-req-env4): las antorchas alumbran de noche «en la calle» — y un sampler3D que casi deja el mundo en negro** · El dueño notó que el modo noche apagaba TODO por igual y una antorcha no destacaba al aire libre (fuera, el skylight está al máximo y la tapa). El arreglo: la luz de bloque va a una **textura 3D** que el shader lee por posición, y la exposición la **resiste** (`mix(uExpo,1,blkLuz)`). Elegí textura sobre el «por vértice» que había redactado porque el vértice obligaba a cambiar el formato de malla del terreno + NPC-cubo + fino y movía offsets de varios guardianes de luz; la textura no toca ningún formato. **Pero casi la lío**: el `sampler3D` nuevo caía por defecto en la unidad 0, la misma que el atlas `sampler2D` — WebGL lo prohíbe e invalida el draw ⇒ **no se veía ni un bloque**. **SwiftShader lo tolera**, así que mis guardianes seguían en verde mientras el dueño, en su GPU real, no veía nada; lo cazó él, no el test. Lección para el futuro: sampler3D **siempre** a unidad propia (con dummy 1×1×1 para que nunca esté incompleto), y **SwiftShader no valida como una GPU real**. Medido: de noche la antorcha retiene el 82 % del brillo y la calle lejana el 20 %. `test_luz_artificial.js`. Con esto, los cuatro ambientes «de verdad» (cielo, niebla, luz global, luz artificial) están completos.
- 2026-08-13 · 🌙 **[REQ-ENV3](PLAN_ARCHIVO.md#-req-env3): oscurecer el mundo de noche (luz global) — y las lámparas no se apagan** · NOCHE salía «de día con el cielo negro»: `cieloColor` apaga el cielo pero el terreno bajo skylight seguía a plena luz. El candidato obvio (`interiorDark`) **re-malla** y solo toca interiores, fatal para transiciones. La vía buena fue una **exposición** en el shader: un uniforme `uExpo` que multiplica el color de las superficies — instantáneo, no toca la malla, interpolable. Vive en los tres programas de color y se sube en **un solo sitio** (arriba de `mcSunUniforms`, por donde pasan los tres). Dos disciplinas: por defecto **1 = idéntico a hoy** (`col*1.0`, ni un float), y **las fuentes emisivas NO se apagan** (en el shader de estructuras la exposición multiplica solo la parte sombreada, así que una antorcha sigue encendida de noche). Medido: `game.luz(0.3)` deja el suelo al 31% y `luz(1)` lo devuelve al pixel. Con esto **los tres huecos de motor de los ambientes están cerrados** (cielo, niebla, luz); el snippet ya compone TODO. `test_luz_global.js`, TODO OK.
- 2026-08-13 · 🌫️ **[REQ-ENV2](PLAN_ARCHIVO.md#-req-env2): niebla atmosférica de verdad sobre el agua** · El dueño probó NIEBLA y dijo lo obvio: el cielo gris está pero «falta la niebla de verdad». No se podía desde el snippet porque `mcActualizaVista` **borra la niebla cada fotograma** fuera del agua. El arreglo fue chico y limpio: `game.niebla({near,far,tinte})` reusa **los mismos uniformes** (`uFog*`) que la niebla de dentro del agua — un `mc.nieblaMundo` que la rama de fuera respeta si está puesto. Por defecto null ⇒ fuera del agua no cambia ni un float. Medido: el terreno lejano pasa de verde a gris (el color del cielo), Δ=119, y apagarla vuelve **exacta**. Cableada en los 8 presets. `test_niebla_mundo.js`, TODO OK.
- 2026-08-13 · 🌅 **[REQ-ENV1](#-req-env1): ambientes realistas como snippet, y los dos huecos de motor que destapa** · El dueño dio un esqueleto (`Entornos` + `aplicarEntorno`) y pidió completarlo con **todos** los efectos, hacerlo snippet y ponerse a probar. Salió `data/snippets/ambientes.json` con **8 presets** (amanecer→verano) y `game.entorno(nombre[, segundos])` con transición suave — **en el snippet, no en `app.js`**, porque es pura composición de mandos que ya existen (`cieloColor` + `reflejoAgua` + `vistaAgua` + `sunShade`). Los 8 aplican y la transición aterriza clavada en el destino (sonda). **Lo valioso del ticket es lo que la iteración deja ver que FALTA**: hoy no hay ni **niebla atmosférica sobre el agua** (NIEBLA/NUBLADO se quedan en «cielo gris», sin difuminar el mundo) ni forma de **oscurecer el terreno de noche** (`cieloColor` apaga el cielo pero la pradera sigue a plena luz ⇒ NOCHE parece «de día con el cielo negro»). En vez de meter efectos a medias en el snippet, salen a [REQ-ENV2](PLAN_ARCHIVO.md#-req-env2) (niebla de fuera, reusando los uniformes `uFog*`) y [REQ-ENV3](PLAN_ARCHIVO.md#-req-env3) (atenuación global barata, sin re-mallar). El snippet queda **en curso**: falta cerrar los números con el dueño y, con ellos, un guardián que mida la pantalla de un preset frente a otro.
- 2026-08-13 · 🪞 **[REQ-FLUID5](PLAN_ARCHIVO.md#-req-fluid5): el agua refleja el cielo, y un playground para jugar con ello** · Enfoque 1 (Fresnel hacia el color de cielo), **sin pasada extra ni FBO** — nubes/terreno de verdad era el enfoque 3 y con [PERF-RS1](#-perf-rs1) encima no se doblan draw calls sin medir. Lo que salió elegante: la cara de arriba del agua **ya se distingue al mallar** (tipo de fluido + `alphaFD`), así que la marca de «refleja» se hornea en el **canal `emit`** (emit=2; el agua no es emisiva) — **cero atributos nuevos, cero VBO, cero costuras en la caché de chunks**, que es donde REQ-FLUID4 se pinchó una vez; y como el uniforme `uReflejo` la escala, encender/apagar **no re-malla**. La normal y el ojo que pide el Fresnel ya los tenía `MC_SUN_LIB` gratis. Solo agua (la lava no), solo la cara de arriba, solo desde arriba (buceando se apaga). El proceso tuvo su lección de método: el guardián lo di por bueno con «no solapan» y una sonda fotograma a fotograma enseñó que era un espejismo de framing —el reflejo Fresnel⁵ está muy concentrado a rasante y llenaba pocos píxeles—; con la charca grande y la cámara a ras salta claro (Δ=28, aclara y azula). El dueño pidió **mandos para jugar** y se añadieron a `game`: `reflejoAgua/Curva/Opacidad/Color` y **`cieloColor`** (cambia `MC_SKY` = fondo **y** reflejo a la vez). `tests/test_reflejo_agua.js`, TODO OK.
- 2026-08-13 · 🚧 **[REQ-AG17](PLAN_ARCHIVO.md#-req-ag17): un agente ya no se mete dentro de otro — y las tres pasadas que costó** · Cerrado **en el snippet** (`parche_snp_ag17.py` → `ag17b.py` → `ag17c.py`, v1.32→v1.35), **cero líneas de `app.js`**, que es la regla de esta zona. Salió barato porque hay **un solo embudo**: andar, el brinco del puñetazo y el patinaje sobre hielo pasan todos por `moverRaiz`. Lo que merece quedar escrito son los **dos errores míos**, porque los destapó el dueño y una sonda, no el guardián: **(1)** perdonar al que ya estorbaba antes del paso lo hice **incondicional**, y eso vuelve a un par embutido invisible el uno para el otro **para siempre** — un par que se consigue solo, con dos agentes persiguiéndote a la misma `distancia`; ahora el paso vale **solo si aleja los centros**, más un desatasco de 1,5 bloques/s por cabeza, porque validar pasos no saca a quien ya está dentro. **(2)** Di por bueno que el golpeado «rodeaba» al de delante, y era **falso**: `avanzar` valida **dónde se aterriza, no el camino**, y el puñetazo da pasos de **0,67 bloques a 60 fps** (3 o 4 en un fotograma lento) con un cuerpo de **0,8** — o sea que se lo atravesaba limpiamente y **ningún fotograma los veía solapados**. Lo cazó `data/tickets/REQ-AG17/sonda_punetazo.js` mirando el **tamaño del paso**, no el solape: `x=34,4 → 37,2` con el otro clavado en `36,4`. Arreglado partiendo el desplazamiento en **trozos de medio cuerpo**; el empujón que transmite el golpe pasó de **1,99 a 6,45 bloques**. **La lección: «no solapan en ningún fotograma» no demuestra nada si el paso puede medir más que el cuerpo.**
- 2026-08-13 · 🧗 **[REQ-AG18](PLAN_ARCHIVO.md#-req-ag18): `escalar`, y por qué medir primero deshizo la ambigüedad** · El enunciado («max escalar bloques: 3») admitía dos lecturas y el ticket avisaba de que llevaban a interfaces distintas. **Medir lo resolvió sin preguntar**: hoy un agente atascado **se teletransporta hasta arriba sin importar lo hondo que hubiera caído**, así que lo que falta es acotar **lo que trepa de una vez al atascarse** — `def.andar.escalar`, **0..8, por defecto 3**, en el documento y editable **dentro de la capacidad «anda»**. La otra lectura, «altura de escalón», ni aplica: andando se sube **siempre uno** y eso no se toca (caso E del guardián lo fija). `escalar: 0` es «no trepa» ni el escalón.
- 2026-08-13 · ✂️ **`CLAUDE.md` con tope de 15 KB, y escrito en telegráfico** (petición del dueño: «está creciendo en exceso… deja únicamente lo útil mínimamente necesario», y después «puede ser algo que tú entiendas bien, más compacto, no hace falta que lo entienda al 100 % un humano») · De **39 442 B a 14 009 B**, un **−64 %** — y ese ahorro se cobra **en cada turno de cada conversación**, porque `CLAUDE.md` se inyecta entero siempre; es la fuga de contexto más cara del repo y la única que no falla nunca, así que nadie la ve. **Nada se borró: se movió.** El detalle bajó **verbatim** a `docs/servidor-y-apis.md`, `docs/repo.md` y `docs/wiki.md` (nuevos) y a `docs/agentes.md` / `docs/rejilla-y-estructuras.md`, cada trozo con su nota «(movido verbatim desde `CLAUDE.md` el 2026-08-13)». La segunda pasada cambió el **estilo**, no el contenido: prosa → telegráfico (`⛔` prohibición, `!` trampa, `→` puntero), que es lo que pagó los últimos 1 600 B. **La comprobación de que no se perdió nada fue mecánica**, no a ojo: se extrajeron los **429 identificadores entre backticks** del fichero viejo y se exigió que cada uno siguiera en el nuevo `CLAUDE.md` **o** en algún `docs/*.md`; los 30 que no estaban resultaron ser 28 rutas y variantes de comando, más **2 pérdidas reales** —el párrafo de `mcSnippetInforme`/«VM2571» (REQ-SNIP1) y los identificadores `meta.categoria:'herramienta'` + `meta.herramienta` (REQ-TOOL1)— que se recuperaron verbatim en sus docs. Guardián nuevo `tests/test_claude_tamano.js` (**17 ok**, Node puro): el tope, que **los 14 punteros a `docs/` resuelvan a ficheros que existen** (un índice que enlaza a la nada es peor que no tener índice) y que **ninguna sección pase de 2 600 B**, que es lo que detecta que alguien ha vuelto a escribir el manual aquí dentro. Hoy queda al **91 % del tope**: el siguiente que lo pase tiene la receta escrita en el propio mensaje de fallo.
- 2026-08-13 · 🧹 **La raíz, al mínimo: el sitio a `web/` y los módulos del servidor a `servidor/`** (petición del dueño, antes de subir a GitHub) · Bajan a **`web/`** los siete ficheros que se sirven por URL (`index.html`, `mapas.html`, `fotos.html`, `app.js`, `style.css`, `scrollbars.css`, `iconos.js`) y a **`servidor/`** los dos `import` de `server.py` (`mundos.py`, `voxfmt.py`), que gana un `__init__.py` y un `try/except ImportError` para que `python3 servidor/mundos.py` a pelo siga funcionando. En la raíz quedan `server.py`, `correr_tests.js`, `package.json` y los `.md`. **Las URL no cambian ni una**: quien elige la carpeta de disco es `Handler.translate_path`, por el **primer tramo** de la ruta (`assets`, `data`, `wiki`, `images` salen del repo; el resto, de `web/`), y se hace moviendo `self.directory` en vez de rehacer la ruta a mano para no perder el confinamiento contra `..` que ya trae `SimpleHTTPRequestHandler`. Efecto colateral **buscado**: `/server.py`, `/PLAN.md` y `/tests/…` dejan de estar servidos por HTTP — antes el docroot era el repo entero. `SYMBOLS.md` se regenera a `web/app.js:línea` (+700 tokens por lectura, pero un `app.js:6693` que ya no existe cuesta mucho más que eso). Guardián nuevo `tests/test_sitio_raiz.js` (**35 ok**): las URL de §1 **no van escritas a mano**, se sacan de los `href=`/`src=` de las cinco páginas reales, así que una página nueva entra sola.
- 2026-08-13 · 📷 **Cuarto enlace en el menú «⋯»: Fotos** (petición del dueño, junto a Mundos / Iconos / Wiki) · `/fotos` en pestaña nueva con `rel=noopener`, como los otros tres. Detalle que no es obvio: los otros llevan **barra final** para esquivar el 301 del servidor estático, pero `/fotos` **no la lleva** porque no es un directorio sino una ruta propia de `server.py` — con barra y sin ella devuelve 200, y se dejó sin barra por coherencia con lo que sirve el backend. Los dos guardianes **derivan** el número de enlaces en vez de llevar un `3` escrito (`ESPERADOS.length` en `test_menu_enlaces.js`, `esperadas + enlaces` en `test_barra_tres_botones.js`), así que añadir el quinto no obligará a tocarlos: 4 rutas verificadas a 200 sin redirección, 23 ok en la barra.
- 2026-08-12 · 🧱 **Los iconos de la hotbar son el dibujo, no una cara de la textura ([REQ-TOOL1](PLAN_ARCHIVO.md#-req-tool1), de propina)** · Con la ranura P al lado, las nueve de bloque cantaban: recortaban una cara del atlas a **16 px** y el CSS la estiraba a 42 —factor 2,625, ni entero ni suavizado—, así que media pieza de redstone era un cuadro oscuro con una mota. Ahora **las diez** pintan el objeto en **iso sobre transparente** con el mismo `drawThumb` de las galerías, más dos arreglos que solo hacen falta a ese tamaño: **supersampling ×4** (`renderIso` reparte píxeles enteros por voxel y no suaviza nada) y **recorte a lo dibujado** (`drawThumb` encuadra la *caja*, y un pico de 58 voxels dentro de su lienzo de 16³ ocupa la mitad de ella). El atlas queda de reserva para lo que no tenga dibujo, así que ninguna ranura puede quedarse en blanco. **La galería no pasa por ahí, por decisión del dueño** («donde se tiene que ver nítido es en la ranura, la galería estaba bien»): sus tarjetas son grandes y el encuadre común es justo lo que deja compararlas entre sí.
- 2026-08-12 · 🔧 **La ranura 10: la herramienta activa se ve, y es el dibujo quien dice cuál es ([REQ-TOOL1](PLAN_ARCHIVO.md#-req-tool1) — ticket cerrado)** · Detrás de la 9, etiquetada `P`, con el dibujo de la herramienta puesta; `P` sigue rotando, el **clic izquierdo rota también** y el **derecho abre el picker de siempre** filtrado a herramientas (`alt+P` también). Lo que importa no se ve: **el vínculo herramienta → dibujo lo declara el dibujo** (`meta.categoria:'herramienta'` + `meta.herramienta`) y el motor lo **deriva del catálogo**. Una tabla con `build → 'hab:pico-de-piedra'` escrita a mano es literalmente [BUG-RS23](PLAN_ARCHIVO.md#-bug-rs23) y [BUG-FLUID3](PLAN_ARCHIVO.md#-bug-fluid3) otra vez, porque `hab:` y `asset:` son el mismo dibujo por dos puertas; el test lo vigila cambiándole la clave al catálogo en caliente y exigiendo que la ranura la siga. De paso entra la taxonomía (`GAL_CATEGORIAS`, 7 entradas, **elegible desde el editor 2D/3D**, con sub-selector solo cuando la categoría es «herramienta») y `vf_mcTool` deja de persistirse: se arranca siempre con el pico.
- 2026-08-12 · 🐌 **«No filtrar» y «no repintar» son dos cosas distintas ([REQ-GAL4](PLAN_ARCHIVO.md#-req-gal4), corrección del dueño)** · El buscador con 1 o 2 letras **no buscaba, pero repintaba igual**: 114 tarjetas con su `<canvas>`, su `getRoomData()` y su `drawThumb()` —y en el picker, un `mcStructCells()` por ítem— para acabar dibujando exactamente lo mismo. Con la galería abierta encima del Mundo se veía **caer los fps del entorno de detrás**. Se pagaba el precio entero de buscar **justo cuando se había decidido no buscar**, y el punto 1 parecía terminado. Arreglado con el corte que faltaba, en el mismo sitio compartido: `galConsultaNueva(input, anterior)` devuelve la consulta efectiva **solo si ha cambiado** y `null` cuando no; el **aviso sí sigue actualizándose** con cada tecla, que es lo único que de verdad cambia. El guardián se comprueba **saboteándolo**: se marcan las tarjetas y se exige que sigan siendo **los mismos nodos**, y sin el arreglo sobreviven **0 de 114**. · Y **fuera «creación»**: enseñaba lo mismo que «recientes» porque el relleno de lo viejo puso `createdAt = savedAt` en todo, y las dos fechas solo se separan a partir del primer reguardado. ⚠️ Se quitó **la opción, no el dato**: `server.py` sigue guardando `createdAt` porque **no se puede reconstruir después** (salió del mtime, que ya no volverá), y el test lo sigue exigiendo para que nadie lo borre luego por parecer código muerto.
- 2026-08-12 · ✍️ [REQ-TOOL1](PLAN_ARCHIVO.md#-req-tool1) · **Diseño cerrado**: el dueño contesta las cinco. Es la **ranura 10** (no la 9 — era el lapsus que se sospechaba, y de la lectura mala se perdía una ranura de bloques); `P` **sigue rotando igual** y lo que abre la galería es el **clic** o **alt+P**, sin tecla numérica; la galería enseña **solo herramientas**; **una sola categoría** por pieza y **elegible desde el editor 2D/3D** —eso es lo que convierte las categorías en trabajo de verdad: no basta con leer `meta.categoria`, hay que poder ponerlo desde la interfaz—; y **por defecto el pico**, que de paso disuelve la asimetría de `vf_mcTool` (restauraba `build`/`paint` pero no `select`/`pick`) sin tener que decidir nada. Comprobado que **las cuatro piezas existen** con las claves exactas del dueño y las cuatro con **`categoria` vacía**: hoy no las distingue nada.
- 2026-08-12 · 🎯 [REQ-TOOL1](PLAN_ARCHIVO.md#-req-tool1) · Abierto: **una ranura para la herramienta activa** (detrás de la 9, enseña su dibujo, y clic o **alt+P** abren el picker **filtrado a herramientas**; `P` sigue rotando) y, aparte, **valorar una taxonomía de categorías** de bloque —herramienta, construcción, fluido, redstone…—, «como si fuese una estructura de carpetas». **Redactado, sin investigar**, que es la regla del dueño para «nuevo ticket». Lo que se deja anotado para no tropezar: la galería **no es una galería nueva** (el picker ya filtra por `meta.categoria`, hoy `redstone`/`general`) y el campo `categoria` **ya existe**, así que el trabajo real es decidir la lista y **clasificar 70 assets + 44 guardados**; ⚠️ las cuatro claves `hab:` que da el dueño (`hab:pico-de-piedra` y compañía) **no pueden acabar escritas a mano en una tabla del motor** —es literalmente lo que costó BUG-RS23 y BUG-FLUID3, porque `hab:` y `asset:` son el mismo dibujo por dos puertas—, lo que empuja a que **sea el dibujo el que declare** qué herramienta es; y el enunciado **se contradice** entre «la ranura P» (la 10ª) y «la ranura 9», que hay que confirmar antes de tocar nada porque de la lectura mala se pierde una ranura de bloques. Más una sorpresa que la ranura haría **visible**: hoy `mc.tool` se persiste pero al cargar solo se restauran `build` y `paint`, así que la herramienta cambiaría sola al recargar.
- 2026-08-12 · 🔢 **Las galerías se ordenan, y por fin tienen por qué ([REQ-GAL4](PLAN_ARCHIVO.md#-req-gal4), punto 2 — ticket cerrado)** · Cuatro órdenes en las dos galerías: «recientes» (defecto), «creación», «nombre» y «tamaño». Lo caro no fue ordenar: **los campos no existían**. `assets/index.json` no llevaba ninguno de los tres y `/api/habitantes` no devolvía `createdAt`, así que `server.py` los **rellena al vuelo** para lo viejo —fechas del **mtime**, `count` contando voxels— y los **persiste**, para no pagarlo en cada listado. La regla que cuesta caro romper: **`createdAt` no se pisa al reguardar** (el `POST` relee el fichero previo y lo conserva); si se pisara, «creación» y «recientes» serían la misma columna con dos nombres. Del lado del front, segundo trozo **compartido** por las dos galerías detrás de `GAL_MIN_BUSCA`: `GAL_ORDENES` + `galCompara()` + `galOrdenaLista()` + `galMontaOrden()`, que **inyecta el `<select>`** en `.mc-picker-bar` en vez de duplicarlo en `index.html`, guarda la elección en `localStorage['vf_galOrden']` y **sincroniza el desplegable de la otra**. Dos decisiones no obvias: las fechas se comparan **como cadena** (son ISO, el orden alfabético es el cronológico, y una fecha vacía cae al final sin `NaN` envenenando el `sort`), y el orden **se compone con el agrupado por tipo** en vez de ganarle —si no, «nombre» dejaría las 86 texturas comiéndose la pantalla, que es lo que el agrupado evita. Guardián: `tests/test_gal4_orden.js` (24 comprobaciones, verde), que empieza comprobando que el servidor sirve los tres campos: sin eso, ordenar por campos vacíos «pasaría» sin ordenar nada.
- 2026-08-12 · 🔍 **El buscador de las galerías exige 3 letras ([REQ-GAL4](PLAN_ARCHIVO.md#-req-gal4), punto 1)** · Con menos de 3 **no filtra** —se sigue viendo el catálogo entero— en vez de vaciar la rejilla: una lista en blanco mientras tecleas parece un buscador roto. Sale un aviso («Falta 1 letra para buscar») y las dos cajas lo anuncian en el `placeholder`. Lo que importa no es la regla sino **dónde vive**: había **dos buscadores casi idénticos** (galería del editor y picker del Mundo), así que el mínimo está en **una sola constante y una sola función** (`GAL_MIN_BUSCA`, `galConsulta`, `galAvisoMinimo`) que los dos llaman, y el aviso se cuelga de `.mc-picker-bar`, el trozo de DOM que **sí** comparten — sin tocar el HTML de cada una por separado. Es el **primer trozo compartido** de camino a fundir las dos galerías, que es lo que el dueño quiere «a la larga». Guardián nuevo `tests/test_gal4_buscador_min.js` (15 comprobaciones, verde), que teclea de verdad en **las dos** y vigila la regresión fácil: borrar hasta 2 letras tiene que volver a enseñarlo todo. El **punto 2 (ordenación) sigue abierto**, a la espera de qué fecha es «recientes», qué es «tamaño» y si el orden se recuerda.
- 2026-08-12 · 🖌️ **Pillar deja la mano en Pintar ([REQ-PICK4](PLAN_ARCHIVO.md#-req-pick4), ampliación del dueño)** · «después de elegir el material la herramienta se pone en modo pintar»: el gesto que quiere es el de un editor de imagen —cuentagotas y a repintar—, no el de Minecraft, donde el pick block solo llena la mano. Va en el **mismo toast** que el material, porque el aviso propio de `mcSetPlayerTool` pisaría el nombre de lo pillado. Lo que no se ve venir: **el cambio de herramienta reabre solo las dos puertas que `mcToolPasiva()` cerraba** — en cuanto la mano es `paint`, el mismo clic que pilló **sigue pulsado**, así que la repetición de `mcTick` se pondría a **pintar sobre el bloque recién pillado** y el `mouseup` con una ranura-estructura armada lo **estamparía**. De ahí el `mc.heldBtn=-1` **antes** del `await` de `mcAssignSlot`. `tests/test_cuentagotas.js` sube a 17 comprobaciones, verde.
- 2026-08-12 · 🎯 [REQ-GAL4](PLAN_ARCHIVO.md#-req-gal4) · Abierto: **buscador con mínimo de 3 letras y ordenación** en la galería 2D/3D y en el picker del mapa — por defecto «recientes», y además «fecha creación», «nombre» y «tamaño». **Redactado, sin investigar**, que es la regla del dueño para «nuevo ticket». Anotado lo que hay que decidir antes de tocar nada: si las tres superficies comparten buscador o son copias (decide si esto es un cambio o tres); qué hace la caja con **menos de 3 letras** (no filtrar, o no mostrar nada); que «recientes» y «fecha creación» son **dos fechas distintas** y está por ver cuál guarda hoy cada almacén; y qué se entiende por **«tamaño»** (voxels, caja del dibujo o bytes del fichero). Más una cuarta, técnica: el defecto «recientes» puede cambiar el orden actual, y hay que decidir si el orden elegido se recuerda entre sesiones.
- 2026-08-12 · 🎨 **Cuentagotas: la cuarta entrada de la tecla `P` ([REQ-PICK4](PLAN_ARCHIVO.md#-req-pick4))** · Apuntar y clic, y el material de lo apuntado pasa al cajón — el *pick block* de Minecraft. El ciclo de `P` queda **Construir → Pintar → Seleccionar → Cuentagotas**. `mcPickBlock()` recorre el rayo con la **misma marcha fina que el pico** (estructura primero, luego rejilla con el recorte de `mcRejillaSolidAt`), así que se pilla exactamente lo que se habría roto; la clave sale de `s.key` o de `mc.blockKey[id]`, o sea **con espacio de nombres**, y se guarda **base**: sin el `@ori` de las 24 posturas (la orientación la pone la mano con R, arrastrarla pelearía con ella) y sin el nivel del fluido. Si el material **ya está en el cajón se selecciona esa ranura** en vez de duplicarlo encima de la activa, así el cuentagotas no puede pisar nada de lo que el dueño tenía preparado. Lo que se escapaba: el `mouseup` que estampa una estructura al soltar preguntaba por `tool!=='select'` y con la herramienta nueva habría **colocado una pieza por la puerta de atrás** — de ahí `mcToolPasiva()`, que ahora cubre las tres rutas que colocan. Guardián nuevo: `tests/test_cuentagotas.js` (15 comprobaciones, verde), con las dos trampas anotadas: `/map/test` **no está vacío** (la primera pasada pillaba `demo-hojas-sin-caras` porque el rayo tropezaba antes) y **una flor no llena su celda**, así que en horizontal el rayo le pasa por encima y hay que apuntar a su geometría.
- 2026-08-11 · 🎯 [REQ-PICK4](PLAN_ARCHIVO.md#-req-pick4) · Abierto: un **«block picker» en la rotación de la tecla `P`** del Mundo — clic en un bloque del mapa y ese material pasa a la ranura elegida del cajón, o sea el *pick block* de Minecraft. **Redactado, sin investigar**, que es la regla del dueño para «nuevo ticket». Lo único que hubo que decidir es el **nombre**: lo pidió como «color picker» y se corrigió él mismo en el acto («seria mas block picker en este caso»), y la corrección es la buena — lo que se coge es la **clave del material**, no un color. Anotado en el ticket que **no** es duplicado de [REQ-PICK1](PLAN_ARCHIVO.md#-req-pick1) ni de [REQ-PICK3](#-req-pick3) (aquéllos son el selector del **editor**; éste es del **Mundo**) y las cuatro preguntas que habrá que resolver al implementarlo: qué rota hoy la tecla `P`, que la clave puede venir de `mc.grid` **o** de `mc.structures`, qué hacer con el giro horneado en la clave (`clave@n`), y si sustituye la ranura activa o busca antes si el material ya está en el cajón.
- 2026-08-11 · 🎯 **El aim ya no choca con la celda entera de un cable ni de una alfombra ([BUG-RAY2](PLAN_ARCHIVO.md#-bug-ray2), cerrado)** (dueño: «aunque no este apuntando los voxels del cable sino al objeto que se ve detras, es como si el aim colisionase con el rigidbody del bloque del cable»). El ticket **no existía**: se redactó y se arregló en la misma pasada, por petición expresa («revisar si este ticket existe, sino crearlo y corregirlo, es prioritario»). Lo que hizo el trabajo fue **reconocerlo como [BUG-RAY1](#-bug-ray1) en la otra mitad del mundo** en vez de investigarlo de cero: aquél ya había arreglado exactamente esto para las estructuras finas (la celda respondía por su caja de 16³ ⇒ sub-DDA a 1/16 acotado a la celda), y la rejilla se quedó fuera porque entonces en `mc.grid` solo había macizos. Desde `mcCabeEnRejilla`, un cable de **1 voxel de alto** es **terreno**, y `mcRaycast` seguía preguntando `mcSolid`, que responde por la celda entera. Así que el arreglo es el mismo patrón, no uno nuevo: `mcRejillaSolidAt` (sondeo fino con **la misma indexación que `mcTerrenoChoca`**, leyendo `bitsAim`) + `mcRejillaRayHit` (sub-DDA acotado, `3·T+3` pasos), cableados en **dos sitios y solo dos** — `mcRaycast` y `mcBreak`; colocar salió gratis porque `mcPlace` consume el `cell + normal` del rayo. **Ninguna de las nueve funciones que envuelve `mundo-autoarranque` o que extrae *verbatim* el test se ha tocado**, y sin materiales finos (`mc._geoFina` a `null`) el camino es byte-idéntico. `test_rayo_apuntado.js` pasa de 12 a **19 ok**, y que los 7 casos nuevos no sean un verde vacío se probó por **A/B**: revirtiendo los dos puntos de llamada de `mcRaycast` en una copia, el test cae a 17 ok / 2 fallos reproduciendo el síntoma exacto del reporte (el rayo para en la celda del cable y el bloque nuevo iría **encima** de él). Vecinos sin regresión: `test_clic_derecho_rejilla.js` (incluido su §0, «el mundo del dueño queda como estaba») y `test_rayos_x.js`. ⚠️ `test_flor_en_rejilla.js` falla **3**, pero falla **igual con el `app.js` de antes**: son de mallado/proyección (`mc.finoExtra`), previos y ajenos a esto.
- 2026-08-11 · ♾️ **Fuentes infinitas: el hoyo de 2×2 se cierra solo ([REQ-FLUID8](PLAN_ARCHIVO.md#-req-fluid8), cerrado)** (dueño: «si un bloque está tocando por los lados fuentes de fluido, y por debajo tiene un bloque sólido, entonces se convierte también en una fuente»). Una celda de corriente que toca **dos o más** fuentes por los lados y tiene roca debajo asciende a fuente. Lo que hizo el trabajo fue **preguntar antes de teclear**: el enunciado se podía leer como «≥1», y con ≥1 cada fuente convierte a su vecina y ésa a la suya hasta volver fuente el llano entero — no es una fuente infinita, es una inundación. Las otras tres respuestas del dueño (sólido es sólido y no vale otra fuente; vale para cualquier fluido; romper la original no degrada a las demás) cerraron el diseño antes de escribir nada. Y el ticket salió **barato porque el motor ya estaba preparado**: «fuente» ya era `fluidLevel === 0` —así que convertir es `setFluid(...,0)` y no hay concepto nuevo ni cambio de formato— y el simulador ya iba por **cola de eventos**, así que la regla son cuatro sondeos dentro de `processCell` sobre una celda que ya se estaba procesando, sin barrer el mundo. 25 líneas en `app.js` + válvula `mc.sinFuentesInfinitas`. `test_fuentes_infinitas.js` (8 ok), con la bandeja partida en **cuatro compartimentos estancos**: en la primera versión el agua de un caso se coló en el de al lado y la lava ni se asentó — un charco que se filtra de un caso a otro convierte un verde en una casualidad. Sin regresión en `test_caras_fluido.js` ni `test_vista_subacuatica.js`. ⚠️ `test_fluido_importado.js` falla **2** (paleta compartida entre `agua.vox.json` y su nivel `-1`), pero falla **igual con el `app.js` de HEAD**: es previo y no de aquí — ojo, porque ese fichero es el guardián de [BUG-FLUID3](PLAN_ARCHIVO.md#-bug-fluid3), que está dado por resuelto.
- 2026-08-11 · ♾️ [REQ-FLUID8](PLAN_ARCHIVO.md#-req-fluid8) · Abierto: **fuentes de fluido infinitas**. Una celda que toca fuentes por los lados y tiene un bloque sólido debajo se convierte ella misma en fuente; el ejemplo del dueño es el hoyo de 2×2×1 con dos fuentes en diagonal que se cierra solo. **Redactado sin investigar**, salvo dos minutos para localizar dónde cae: el simulador de fluidos vive **en `app.js`** (`fluidLevels`, `getProps`, `setFluid`, `processCell`, `queueTick`), «fuente» **ya existe** como `fluidLevel === 0`, y el bucle **ya es dirigido por eventos**, así que la regla son cuatro sondeos dentro de `processCell` y no un barrido del mundo. ⚠️ Queda **una pregunta bloqueante**: el enunciado dice «tocando fuentes» en plural y el ejemplo tiene exactamente **dos** por celda, pero la frase también se lee como «≥1» — y con ≥1 una fuente suelta convierte a su vecina, y ésta a la suya, hasta **inundar el plano entero**. Se implementará **≥2** salvo que el dueño diga otra cosa, por ser lo único compatible con su propio ejemplo. Anotadas además tres decisiones que el enunciado no fija: si «sólido debajo» admite otra fuente (o la regla solo vale en la capa del fondo), si vale para la lava (mejor bandera por tipo, como las perillas de REQ-FLUID6/7), y si es reversible al romper una de las fuentes originales — que es justo lo que decide si el cubo infinito sirve para algo.
- 2026-08-11 · 🏊 **Nadar: hundirse despacio y subir manteniendo la tecla ([REQ-FLUID6](PLAN_ARCHIVO.md#-req-fluid6) + [REQ-FLUID7](PLAN_ARCHIVO.md#-req-fluid7), cerrados)** (dueño: «los agentes tienen que comportarse a nivel de físicas como los jugadores en todos los casos. la lava puede ser un poco más espesa»). Dentro de un líquido la gravedad baja a **×1/16** y aparece un **rozamiento vertical**; mantener la tecla de salto invierte el signo de esa aceleración. Tres cosas que gobernaron el resultado y no estaban en los tickets. **(1) Una sola función de caída, tres puntos de llamada.** Los agentes articulados tienen sus **propios** integradores en el snippet —dos, `asentar` y `movPaso`—, así que la petición del dueño se podía cumplir copiando la fórmula tres veces… y quedaría rota al primer retoque. En vez de eso `app.js` **ofrece** `mcCaidaPaso` y quien tenga cuerpo la llama, igual que `mc.sunExtra`. Es lo que hace que «como los jugadores» siga siendo verdad mañana. **(2) El tope de subida no hubo que inventarlo**: es el mismo rozamiento que frena la caída, así que salió gratis y sin techos escritos a mano — y el empuje se ancló a la gravedad de dentro, no a un número absoluto, para que las perillas no se descoloquen entre sí. **(3) Mandan los pies, salvo que haya suelo debajo.** Lo primero deja salir a la orilla; lo segundo, que no estaba en el ticket, evita que vadear un charco de un bloque se convierta en andar por pegamento: en Minecraft nadar es «en agua **y sin suelo**», no «en agua». Y una lección que costó cinco tests en rojo: **el motor integra en pasos discretos**, así que la terminal real no es `a·τ` sino `a·dt·k/(1−k)` (un 3,7 % a 60 fps) y la caída no es `½gt²` sino la suma discreta. Las cinco veces el motor tenía razón y la equivocada era mi expectativa; ahora las tolerancias se derivan de la cola calculada `|v₀−v*|·kⁿ` en lugar de ser un porcentaje a ojo. `test_hundirse.js` (20 ok) + `test_nadar.js` (19 ok), los dos con un §1 que exige que **fuera del agua no cambie ni un float**, que era la condición del dueño.
- 2026-08-11 · 🏊 [REQ-FLUID6](PLAN_ARCHIVO.md#-req-fluid6) y [REQ-FLUID7](PLAN_ARCHIVO.md#-req-fluid7) · Abiertos: la **física dentro de un líquido**. El dueño manda dos mecánicas con cifras de Minecraft —gravedad 0,08 → 0,005 bloques/tick² dentro (velocidad terminal ≈3,92 fuera), y el salto que fuera es un impulso de 0,42 y dentro pasa a ser una aceleración sostenida de 0,04 mientras se mantiene la tecla—. **Son dos tickets porque son dos cosas distintas**: el 6 cambia una **constante** (la gravedad se multiplica por 1/16), el 7 cambia el **gesto de entrada** (la tecla de salto deja de ser un evento y pasa a ser un estado), y sin el 6 el 7 ni se nota, porque contra la gravedad de fuera un empuje de media gravedad no sube, frena. ⚠️ La instrucción que gobierna los dos: **las velocidades son RELATIVAS y fuera del líquido no se toca nada** — nuestro motor no va en ticks sino en bloques/segundo, así que lo que se implementa es la **razón** (×1/16 la gravedad; el empuje de subida = 8× la gravedad de dentro = ½ la de fuera, que deja un neto de +7× hacia arriba con la tecla pulsada). Tabla de razones escrita en el ticket para no re-derivarla. Anotadas dos incoherencias de unidades del enunciado (el impulso llega en m/s entre cifras en bloques/tick; el empuje llega en bloques/tick cuando una aceleración es bloques/tick²). Y una trampa que ya conocemos de la fase 3: **quién decide que estás «dentro»** — allí se mira el **OJO** a propósito (andar por un charco no debe teñir la pantalla), pero la física querrá los **pies**, y de eso depende que se pueda salir a la orilla. **Redactados, sin investigar**, a petición del dueño. Sin verificar y anotado como tal: si el jugador ya tiene hoy algún trato dentro del agua, si el motor sabe que una tecla **sigue** pulsada o solo ve el flanco, cuál es la velocidad terminal de dentro (el dueño no la da; probablemente arrastre y no tope duro), y si esto alcanza a los **agentes** (antecedente BUG-FLUID2) y si la **lava** es más espesa — las dos últimas, a preguntar.
- 2026-08-11 · 🪞 [REQ-FLUID5](PLAN_ARCHIVO.md#-req-fluid5) · Abierto: **reflejos de cielo y nubes en la superficie del agua**. Era la fase 4 de REQ-FLUID4; el dueño la aplazó al acotar aquel ticket («más adelante») y ahora pide sacarla a ticket propio. **Redactado, sin investigar** — a petición suya, nada de código todavía. Lo que sí se anota, por venir de lo aprendido en las fases 1-3 y no de una investigación nueva: es un cambio de **shader**, no de mallado (el culling ya dejó **una sola lámina** donde pintar, en vez de dieciocho planos apilados); la cara de arriba **ya se puede identificar** en el shader gracias a `alphaFD`, el byte de dirección que se añadió en la fase 1; y las nubes son **geometría de verdad** (`white-wool` de REQ-SHADOW2), no una textura de cielo, lo que separa el enfoque barato del caro. Tres enfoques anotados sin decidir: Fresnel hacia `uSky` (sin pasada extra, no refleja nubes), + normales onduladas, o **reflexión planar** a un FBO —que es lo único que refleja nubes de verdad y también lo que **dobla los draw calls**, así que con PERF-RS1 encima no se elige sin medir, y además un plano único no vale para dos lagos a cotas distintas—. Sin verificar, y dicho en el ticket: si el shader translúcido tiene ya a mano la normal y la dirección a cámara, cómo se lleva un reflejo con el `uFogMin` de la fase 3 al mirar la superficie **desde debajo**, y si la lava entra aquí (es emisiva: puede que lo suyo sea brillo y no reflejo) — eso último **a preguntar al dueño**.
- 2026-08-11 · 💧 **Que parezca agua también desde fuera: culling de caras internas en el camino fino (REQ-FLUID4, fases 1-2)** (dueño: «vale, tiene mejor pinta, ahora quiero que parezca agua también desde fuera», y antes «no deben de verse las caras de los cubos, tiene que parecer agua o lava líquida»). Un fluido es un 16³ macizo **translúcido**, así que por BUG-STR1 va siempre por el **camino fino** (`finoAVbo`) — y ese camino **no tenía culling ninguno**: cada celda de un lago copiaba su geometría entera, las seis caras, y desde fuera se veía exactamente lo que era, cubos apilados con las costuras marcadas. Una charca de 9×9×3 emitía **1458 caras**; ahora **81** (18×). El mallador de cubos lleva su regla desde siempre, pero aquí no se podía reusar: la geometría fina se copia como bloque opaco de vértices y no sabía **hacia dónde mira** cada quad. Se añade eso, `colFD`/`alphaFD`/`texFD`, un byte por quad: **0..5 = está en la piel de la pieza y mira hacia ahí**, **6 = no está en la piel**. El 6 no es relleno — un quad interior (el techo de una cueva dentro del propio dibujo) no lo tapa ningún vecino y hay que poder decir «a éste no lo mires»; y el envés de una cara con `caras` hereda la dirección de su anverso, porque viven en el mismo plano. Con eso, tres reglas: vecino **opaco** (`mcTapaCara`, la misma pregunta del camino de cubo, y **solo con la celda llena** — un fluido que no llega arriba no alcanza el plano que el vecino tapa), mismo fluido **en vertical** (dos celdas apiladas comparten el plano exacto: `mcGetFluidHeight` ya devuelve 1.0 cuando hay fluido encima), y mismo fluido **en horizontal** solo si **llega tan alto**. ⚠️ La identidad de un fluido es su **TIPO y no su id**: `hab:agua-1`…`hab:agua-7` son ids distintos de la misma agua, así que comparando ids no se habría cullado ni un lago con corriente — `mcTablaFluido()` lo pregunta a `game.fluidos.getProps` y su caché se invalida por **dos** cosas, el tamaño de la paleta **y la identidad de `game.fluidos`**, porque si no el `null` de antes de que el snippet instale la API se queda cacheado para siempre y el culling no se enciende jamás. **Y debajo había un bug latente que era la mitad visible del problema**: `setFluid` apenda el id del nivel a la paleta y escribía sus flags en `mc.finoRejilla[id]`, `finoExtra`, `recorte` y `atraviesaDoc` — `Uint8Array` dimensionados **cuando los horneó `mcBuildPalette`** — o sea **fuera del array**, y JS lo tira sin decir nada: el nivel perdía «me dibujo con mi geometría fina», volvía al camino de cubo y salía un **cubo azul opaco** (el atlas de terreno se hornea con `d[o+3]=255`) en medio de un lago translúcido. Ahora crecen, como ya hacía `mcAltaVariante`. Válvula `mc.sinCullingFluido`, **sumada a la firma del chunk** en los dos sitios donde se calcula: cambia la malla, y sin eso el caché LRU de PERF-RS1 devolvía el VBO de antes — la A/B daba el mismo número las dos veces y costó un rato darse cuenta de que el instrumento mentía, no el código. El alpha del agua es del **asset** (`assets/agua.vox.json`, `#3377ff1a → #3377ff66`, porque una lámina de una celda era invisible; la lava se queda en `#ff5500bd`) y se retoca en el editor. Guardián nuevo `test_caras_fluido.js`: las 1458→81 y el ida y vuelta de la válvula, que los niveles siguen por el camino fino, que agua y lava cullean igual —con la cuenta **derivada de la rejilla real** usando los propios ayudantes del motor, no un número escrito a mano, que mediría el simulador de fluidos y no el culling— y que una pieza sin fluido (`flor-roja`) da una malla **byte a byte idéntica**. Sin regresión en `test_vista_subacuatica`, `test_fluido_importado`, `test_atlas_estructuras` (13), `test_luz_al_estampar` (9), `test_caras_pegadas` (15) y `test_caras_mundo`. ⚠️ `test_cubo_translucido` (2), `test_flor_en_rejilla` (3) y `test_luz_en_rejilla` (3) fallan **igual que en HEAD**: vienen de antes y no de aquí. Capturas del A/B en `data/tickets/REQ-FLUID4/4-…` a `7-…`. Queda la **fase 4 (reflejos)**, aplazada por el dueño ⇒ ticket aparte.
- 2026-08-06 · 🔌 **El Mundo hacía cola detrás de miniaturas que nadie veía (PERF-MC3, segunda vuelta)** (dueño: «mira ver si estás midiendo las cosas bien», y luego «no puede ser que el mapa empty tarde si no tiene ni un voxel»). Tras arreglar el serie→paralelo, en su máquina la paleta seguía costando **10032 ms de 11287**, y **9905 se los comía el PRIMER bloque** (`hierba`) mientras los otros catorce salían a 4-18 ms. **Mi diagnóstico anterior era falso, y el culpable era mi propio instrumento**: la línea `RED ·` sacaba el veredicto de los KB/s y acusó al **ancho de banda** de una fase cuyas descargas habían terminado en **1265 ms**. Un caudal bajo solo dice que los documentos son pequeños para lo que tarda un viaje, no que la red sea el cuello. Segundo error encadenado: el dueño **no está en el móvil**, está en un portátil potente con buena red, así que la hipótesis de CPU (rasterizar las miniaturas de las galerías) tampoco se sostenía — la medí estrangulando la CPU ×8 por CDP y todo escalaba **uniforme**, nunca aparecía un bloque comiéndose el 99 %. La causa real estaba en el **orden de arranque**, en las tres últimas líneas del fichero: en `/map/<nombre>` se llamaba a `loadServerAssets()` + `refreshHabitantesList()` **antes** de `openWorld()`, así que el editor entero arrancaba primero aunque el Mundo lo tape entero, y sus galerías bajan **un documento por miniatura** (43 habitantes, 6,3 MB) **por el mismo host**, del que el navegador solo abre **~6 sockets**. La paleta no estaba descargando: estaba **esperando turno**. Arreglo: se parte el índice de assets en sus dos trabajos —`mcIndexAssets` (los nombres cortos que usan los snippets, hace falta ANTES) y llenar las galerías (solo lo mira el editor, va DESPUÉS)— compartiendo la promesa de `assets/index.json` para no pedirlo dos veces; y de propina **se cierra una carrera que ya existía**: `openWorld()` salía sin esperar a `loadServerAssets()`, así que el autoarranque podía encontrarse el registro de alias a medias. Medido en local: peticiones **ajenas compitiendo por el cable 3 → 0** y el pico de simultáneas de la paleta **5 → 8**. Confirmado por el dueño en su máquina: «ya carga rápido». **Y el instrumento se arregló para que no vuelva a mentir**: `RED ·` ya no calcula KB/s, sino que **solapa** la ventana de red con la duración real de la fase (comparar los dos relojes de largo daba 233 %, porque parte de esos documentos los pide la galería antes de que la fase empiece); el `ms` de cada bloque se reparte en **`doc` / `caras` / `geom`** —esperar el documento, rasterizar las 6 caras, hornear geometría fina: un bloque de 9905 ms es un problema distinto según cuál de las tres sea—; y se añade **`esperando TURNO de socket`** (`requestStart − fetchStart`) junto a cuántas **peticiones ajenas** competían en esa misma ventana, que es exactamente la cifra que distingue «la red va lenta» de «la red no era para ti» y que no aparecía en ninguna otra parte. Sin regresiones: `test_paleta_paralela` (12), `test_informe` (34), `test_galeria_assets` (7), `test_galeria_namespace` (8), `test_mapas` (18), `test_materiales_en_espera`, `test_setvoxel_autocarga` (21), `test_stamp_scripting`, `test_redstone_arranque`.
- 2026-08-06 · ⏳ **Un mundo vacío tardaba 2,2 s porque los 15 materiales bajaban de uno en uno (PERF-MC3)** (dueño: «cargo `/map/empty`, que no tiene ni un voxel, y se tira en "Preparando bloques (0/15)…" un buen rato, cosa que no tiene sentido; quiero saber qué pasa»). Lo primero fue **medirlo con su propio informe**, no suponer: de 2178 ms, **1775 eran la paleta** y dentro de ella los 15 documentos salían **estrictamente consecutivos** (`roca` 868 ms, luego `hierba` 162, luego `tierra` 149…). El bucle de `mcBuildPaletteImpl` esperaba la `fetch` de cada bloque antes de pedir el siguiente. El arreglo es de seis líneas y **no toca el bucle**: `mcPrecargarDocs` suelta las peticiones en tandas con tope 8 y **no se espera a que acaben**, así que el bucle sigue yendo en serie —tiene que ir, rasteriza sobre un canvas compartido y escribe `mc.palette[id]` en orden— pero cuando le toca el bloque 5 su documento ya está bajando. Lo que lo hace posible es que **`getRoomData` cachea la PROMESA y no el resultado**: pedir un documento dos veces no lo baja dos veces, así que precalentar es literalmente pedirlos antes. Medido en local con caché fría, tres vueltas cada uno: **383 ms de media → 63 ms**, ≈6×. Y de paso **desmiente la sospecha del propio ticket**: si una parte gorda hubiera sido CPU (`JSON.parse` + rasterizar 6 caras), esos 383 ms no se caerían a 63 con latencia ≈ 0 — era espera en serie casi entera. El segundo síntoma era el cartel: `onProgress` se llamaba **después** de terminar cada bloque y con el nombre del bloque **ya hecho**, así que los 868 ms de `roca` transcurrían enteros diciendo «(0/15)» — justo mientras más se trabajaba, el número no se movía, y eso es lo que se lee como un cuelgue. Ahora avisa dos veces por bloque y la de «empezando» dice el que se está bajando; la de después es la única que trae el `ms` y por tanto la única que entra en el informe. Las **descargas que nadie pidió** que apuntaba el ticket resultaron ser dos cosas distintas al medirlas con la pila de llamadas: `/api/habitantes` ×3 son **tres inicializadores del editor** disparando a la vez (`refreshHabitantesList`, `loadRooms`, `refreshTexturas`), que ahora **comparten la petición en vuelo** —no el resultado, que daría listas rancias tras guardar o borrar—; y los dos assets de fuera de la paleta los pide `renderTexStrip`, la tira de texturas **del editor**, que se pinta detrás mientras el Mundo carga: no sobran, son de otra pantalla, y lo único que hacían era ocupar dos de las ~6 conexiones del navegador. Verificado con `test_paleta_paralela.js` **nuevo** (12 ok, estable en tres vueltas), que mide la **forma y no el reloj**: pico de peticiones en vuelo ≥ 4 (en serie sería 1 por definición), paleta completa **y en el mismo orden** (el id de bloque es la posición en `mc.blockKey` y los mundos guardados llevan ids dentro), primer cartel `(0/8) hierba ⬇`, y `/api/habitantes` una sola vez. Deliberadamente **no** compara reloj de pared contra suma de las partes: en localhost lo que domina es la cola de conexiones del navegador, no el código, así que aprobaría y suspendería sola. Sin regresiones en `test_informe` (34), `test_materiales_en_espera`, `test_atlas_estructuras` (13), `test_galeria_assets` (7), `test_bloques_comportamiento` (384) y `test_navegador` (15). ⚠️ **En el host remoto del dueño no está medido**: allí eran 1774 ms de idas y vueltas, así que debería ganarse más que en local, pero es previsión y no dato. Las propuestas 3 y 4 del ticket (paleta perezosa, caras ya rasterizadas por el servidor) quedan **abiertas a propósito**: ahora la paleta son ~60 ms en local y conviene volver a medir en remoto antes de decidir si sigue siendo el cuello.
- 2026-08-06 · 🚪 **La puerta alta son DOS celdas, no una estructura (BUG-RS6)** (dueño: «al modificar la puerta usada en redstone de 16x16x16 a un tamaño 16x16x24 por que era demasiado baja, ahora se plancha como estructura y no como bloque, y deja de funcionar como elemento de redstone», y luego «si se puede hacer en varias celdas parecería mejor ya que las estructuras son lentas, eso sí, tendrían que moverse al unísono si es una puerta que se abre»). El circuito nunca estuvo roto: lo que se rompió fue **dónde vive la pieza**. `mcCabeEnRejilla` exige `w/h/d ≤ 1` celda para entrar en `mc.grid`, y 24 de alto son dos — así que el clic derecho pasó a estamparla como **estructura suelta**, y una estructura no tiene celda, ni vecinos, ni señal. Medido de frente antes de tocar nada: `hab:puerta` daba `finoRejilla=false` mientras `hab:puerta-abierta` (todavía 16³) daba `true`. La salida que puso el dueño —celdas de rejilla, no estructuras— trae su propia condición: **al unísono**, porque media puerta abierta es peor que una puerta lenta. Dos decisiones sostienen el arreglo. La primera: **el dibujo se parte, no se rehace**. `redstone/partir_puerta.py` corta la puerta que él tenía **hoy** en la galería (776 voxels, con su listón claro y el tirador recolocado a media altura) en `puerta` (z 0..15) y `puerta-alta` (z 16..23), y **deriva la hoja abierta girando la cerrada 90° sobre la jamba** en vez de dibujarla aparte — que es exactamente el fallo que ya había ocurrido: él subió la cerrada a 24 y `puerta-abierta.json` se quedó en 16 y con otro grosor. La segunda: **una manda sobre la otra**, el patrón del pistón. `hab:puerta` y `hab:puerta-abierta` van con **dos `define()` y `alRecibirSeñal`**, sin `encendida`, y el callback escribe las dos celdas y remalla **una sola vez**; la mitad de arriba no es pieza de redstone (no tiene señal, no conduce, no hace cola). Lo que compra no usar `encendida` se ve en el caso feo: como todo va con `precargar:false`, si a la hoja de arriba le falta el material en la paleta **no se mueve ninguna de las dos** y se reintenta entero — con `encendida` el motor habría abierto la de abajo él mismo antes de avisar. De regalo muere el apaño de `conduce`: se va el `perdida: 1` obligatorio (con 0 las dos hojas se sostenían la una a la otra y la puerta **no se cerraba jamás**), el tick de diferencia entre hojas y el abrir-solo-media al final del alcance; una puerta de Minecraft tampoco conduce. **Sin tocar `app.js`.** Verificado con `test_redstone_puerta.js` **nuevo**, que no pregunta «¿se abrió?» sino **«¿en qué pasada se abrió cada hoja?»**: tickea de una en una y las dos cambian en la **misma** (1 y 1) en los cuatro giros, al abrir y al cerrar. Más: las cuatro piezas caben en la rejilla, media puerta sola funciona y no escribe encima, un bloque ajeno arriba queda intacto, y el cable del otro lado se queda apagado. Sin regresión en `test_redstone_piston`, `test_redstone_giro`, `test_redstone_bloques` y `test_redstone_arranque`. Lo que **no** se hizo, y es la causa raíz de que esto se rompiera en silencio: avisar en el editor al agrandar un asset que **es** pieza de redstone.
- 2026-08-06 · ⚡ **Un muro también lleva corriente: bloques macizos como puente (redstone r1.2)** (dueño: «los bloques que reciben energía de redstone deben energizarse, por lo tanto, una antorcha pegada a un bloque que recibe energía como el de la imagen debería encenderse; salvo que se haya indicado como bloque aislante»). Hasta r1.1 una celda sin `cfg` era un **agujero**: `señalQueLlega` la saltaba y el circuito se acababa ahí, así que la antorcha de la captura —pegada a un bloque, no al polvo— no tenía forma de enterarse. El ticket temía **estado nuevo por celda** (`energizado` en `mundo.json`) y **un barrido que ya no puede limitarse a las claves de redstone**; no hizo falta ninguno de los dos: la energía del bloque **se calcula al vuelo** desde sus seis vecinos y **nunca se encadena bloque → bloque**, lo que acota el coste a un salto y evita el dominó de un cable suelto energizando un muro entero (precio explícito: dos bloques en fila no conducen, igual que en Minecraft). Lo que sostiene todo es la asimetría **FUERTE/DÉBIL**: el **cable** energiza el bloque solo débilmente y otro cable **no lee lo débil**; sin eso, dos tendidos separados por un bloque se contagiarían **saltándose la pérdida** y un tendido se realimentaría a través del bloque que él mismo alimenta, sin bajar nunca de nivel. Una lámpara (que no es cable) sí lee lo débil, y por eso se enciende colgada bajo un cable. **El error que casi se cuela**: el aviso a vecinos tiene que saltar **dos** celdas a través del bloque, y la primera versión se lo ahorraba cuando quien cambiaba «no era circuito», para que un TNT de mil voxels no costara 36 lecturas cada uno — pero **«¿era esta celda circuito?» no se puede responder después de la escritura**, porque una *fuente* (una palanca) no deja entrada en `potencia`; al arrancarla parecía un bloque cualquiera y la lámpara del otro lado del muro **se quedaba encendida**. Ahora salta siempre y el filtro que de verdad importaba sigue en pie (solo se **encola** lo que tiene `cfg`): la cola sigue vacía en una ráfaga y lo único que sube son lecturas de array, 7 → 43, con **600 escrituras en 0,9 ms**. El «bloque aislante» que pedía el dueño quedó en `game.redstone.aislante(clave)` y no en `game.bloques.define(…, {aislante:true})` como se apuntó al redactar el ticket: la tabla de materiales de redstone ya vive en el motor, y meterlo en `define()` lo convertiría en pieza de circuito —cola y entrada de `potencia`— para no hacer nada. `info()` enseña ahora `vecinos[i].bloque = {fuerte, debil}`, sin lo cual «le llega corriente y no enciende» se mira a ciegas justo en el caso nuevo. Todo en `redstone/redstone.js`, **sin tocar `app.js`**. Verificado con `test_redstone_bloques.js` (nuevo), los cuatro `test_redstone_*` de antes, `test_bloques_comportamiento.js` (373 ok) y —lo que de verdad medía el riesgo— los **nueve circuitos reales** de `redstone/montar_ejemplos.js`, que van montados **sobre el suelo**, que es donde el transporte por bloques podía romperlos: todo ok.
- 2026-08-06 · 🔌 **El lío del cable: un id sin espacio de nombres no identifica nada** (dueño: «he querido modificar el cable de redstone por una forma más interesante y en lugar de reemplazar el actual se ha creado uno nuevo… además parece que se llama igual viendo los rayos-X, solamente el nuevo tiene ficha… y lo que es peor, el modificado no funciona»). Tres quejas, **una sola línea de causa**. El disco lo dijo todo antes de teorizar: dos ficheros de verdad, `data/habitantes/cable.json` (112 vox, la cruz gorda, de ayer) y `assets/cable.vox.json` (44 vox, la cruz irregular que él redibujó, de hoy a las 12:10). `save()` elegía destino por `state.meta.type` —`'textura'` → `/api/assets`— **en vez de por la galería de la que salió el dibujo**; y como el cable es un habitante de tipo `textura`, cargarlo y darle a Guardar lo escupía a `assets/` con el mismo `id`, dejando el original intacto. `serverId` recordaba el **id** pero no el **espacio de nombres**, y ahí está el fondo del asunto: `cable` existía a la vez como habitante y como asset, o sea que el id solo no identificaba nada. Las otras dos quejas caen de ahí: el «no funciona» es que el circuito se declara sobre `'hab:cable'` y la copia era `asset:assets/cable.vox.json` —la propia captura `02.png` del dueño lo decía, no hizo falta tocar el motor de redstone—, y encima el duplicado **secuestró el nombre corto `cable`** para todos los scripts, porque `mcIndexAssets` registra el basename de cada asset. Lo de la ficha resultó ser **otro bug**, y por eso iba aparte: el botón `📋 Ficha` estaba escrito solo en el bucle que pinta assets, así que **ningún habitante ha tenido ficha nunca**. No bastó con añadirlo, porque la ficha estaba escrita entera en forma de asset (clave `'asset:'+file`, nombres derivados del basename, alias por `PATCH /api/assets`) y un habitante **no pasa por `mcIndexAssets`**: su id y su rótulo **no valen como clave**, solo `hab:<id>`. Ofrecérselos habría sido mentir, que es exactamente el error que dejó el cable mudo — así que para habitantes la ficha enseña su clave entera y **esconde** la mitad editable en vez de fingir que se puede editar. Arreglo: `serverKind` (`'hab'|'asset'|null`) viaja junto a `serverId`, sobrevive al `localStorage`, y `vaAAssets()` enruta por él; el tipo solo decide cuando **no hay origen**, o sea en un dibujo nuevo. Verificado con `test_galeria_namespace.js` **nuevo** (8 ok), que además se comprobó **contra el código viejo** para asegurar que de verdad detecta el fallo (2 fallos: aparece el asset gemelo y el voxel nuevo no llega al habitante); sin regresión en `test_galeria_assets` (7), `test_guardar_pieza` (17) y los tres de redstone. Los datos del dueño se recolocaron con respaldo previo en `data/habitantes_trash/1786012950832__*`: su dibujo nuevo pasó a `hab:cable`, `cable-on` recibió la misma forma heredando el color emisivo que ya usaba (si no, el cable **cambiaba de forma al encenderse**) y el duplicado se retiró por `DELETE /api/assets/cable`, que lo deja en la papelera y libera el nombre corto. Nota aparte: `test_ficha_material` tiene **1 fallo previo** («un nombre corto nuevo resuelve sin recargar la página»), comprobado que ya venía de antes y no lo causa este cambio.
- 2026-08-05 · 🔦 **La antorcha vuelve a alumbrar: la luz de bloque también se siembra desde la rejilla** (dueño: «jumper ya funciona, pero la antorcha no ilumina, mira las fotos de la galería #10 y #11», y luego «todo esto funcionaba cuando era una estructura, ha dejado de iluminar al pasar a setVoxel»). Las dos fotos son una A/B perfecta: en la #10 la antorcha está puesta en `51,6,59` del mapa `test` y **se ve encendida**, pero el pasillo está exactamente igual de negro que en la #11, donde no hay antorcha. El dueño tenía razón y el motivo es de nacimiento: `mcComputeBlockLight` se escribió cuando una pieza luminosa **solo podía existir estampada suelta**, así que sembraba recorriendo `mc.structures` y leyendo sus `emitCells` — desde que el clic derecho mete en `mc.grid` todo lo que cabe en su celda, la antorcha ya no está en esa lista y **no existe como foco**. Mismo patrón que el giro en la clave: la pieza no cambió, cambió por dónde entra. Medido antes de tocar nada, con la misma antorcha en la misma celda: rejilla `hasGlow=false` y luz `[0,0,0,0]`; estructura `hasGlow=true` y luz `[15,11,9,7]`. **No hubo que inventar luz nueva**: la geometría fina de la rejilla ya trae `emitCells:[0,0,0]` y `emitDir:[0,4,0]` horneados, que es justo lo que consume la siembra, así que el arreglo es *dónde mirar* — `siembra(cx,cy,cz,ed,k)` sale a función y se llama desde las **dos** fuentes. Lo que sí costó pensar es **encontrarlas**: barrer `mc.grid` entera en cada edición son ~60 ms en 512×40×512 (extrapolado de 2,07 ms medidos en 96³) y la luz se recalcula en **cada bloque puesto o roto**, o sea que la solución ingenua devolvía el lag que se quitó el 2026-08-04. De ahí un índice disperso (`mc._glowCeldas`) que solo se rehace de cero cuando cambia *qué materiales emiten* (`mc._glowFirma`: paleta nueva o geometría recién horneada) o la rejilla entera (`mc._glowRef`: cargar/redimensionar), y que se corrige celda a celda en `mcGlowTocada` **después** de escribir. ⚠️ `mcDirty` **no vale de embudo** aunque lo llamen todos los caminos: se corta sola cuando el guardado ya está marcado entero (`p.full`). Dos efectos laterales obligados: `mcRecomputeHasGlow` mira también la rejilla (si no, quitar una estructura apagaba una antorcha que sigue puesta), y `mcAgentSetBlock` ya no puede saltarse el BFS en un sólido→sólido si la celda gana o pierde emisor (pintar una antorcha encima de piedra). Verificado con `test_luz_en_rejilla.js` **nuevo** (17 ok: rejilla y estructura dan el **mismo perfil** `[15,11,9,7]`, romperla devuelve el pasillo a `[0,0,0,0]`, una flor fina no emisiva sigue sin encender nada, y 20 ediciones seguidas = **0 re-barridos**), más `test_luz_al_estampar` (9), `test_luz_incremental_navegador` (19), `test_luz_traspasa`, `test_flor_en_rejilla`, `test_clic_derecho_rejilla`, `test_atlas_estructuras` (13), `test_suelo_al_estampar` y `test_bloques_comportamiento` (**373 ok, 0 fallos**). Falta la confirmación visual del dueño en su mundo.
- 2026-08-04 · 🏷️ **Ficha de textura y nombre corto para scripting** (dueño: «el script que he creado "Construye Montañas" hace uso de una textura llamada "Hormigón Verde / Hojas"… la cargo con `game.addMaterial("hormig-n-verde-hojas")`… me parece innecesario, podría deducirse solo… necesito saber desde el editor y la galería cuál es el nombre bueno para usar en los scripts»). Lo primero fue **descartar el bug que no era**: con el registro caliente en el navegador, `hormig-n-verde-hojas` **ya resolvía** (`addMaterial` → id 9, clave `asset:assets/hormig-n-verde-hojas.vox.json`), o sea que su script era correcto — él ya lo había dicho. Lo que faltaba era otra cosa: (a) **descubrir** el nombre bueno, porque desde el editor y la galería solo se ve el rótulo, y (b) **declarar uno corto propio**, porque la textura la generó otro programa como `green_concrete` y ese nombre no valía aquí. Ahora un asset responde a **cuatro** claves —id, rótulo, basename y el nuevo `meta.alias`— y la **ficha** (botón 📋 en la tarjeta de la galería) las lista todas, enseña la clave exacta `asset:assets/<id>.vox.json` copiable y deja editar alias/icono/descripción. El alias **no puede pisar un alias de fábrica** (decisión del dueño: rechazar y avisar), y eso se valida en las dos puntas: `validar_alias`/`ALIAS_FIJOS` en el servidor devuelve 409 con motivo legible («"stone" ya es un material de fábrica»), y el cliente lo vuelve a comprobar contra `MC_MAT_ALIAS_FIJOS` al indexar, así que un servidor desactualizado no puede corromper un material de fábrica. Dos trampas que costaron su rato: los dos mapas de materiales son de **solo-acumular**, así que cambiar el alias dejaba el anterior valiendo para siempre (`mcAliasPrevio` borra el viejo); y `POST /api/assets` vuelca el `.vox.json` **entero**, de modo que **guardar la textura desde el editor le borraba el alias** —el editor no tiene campo para él— así que el POST ahora hereda `alias`/`icon`/`description` del fichero existente antes de volcar. De paso, el aviso de material desconocido de `mcResolveMat` sale también por **toast**: era `console.warn` a secas, y desde el móvil un muro entero de roca por un nombre mal escrito se ve exactamente igual que «el script no hace nada». Verificado con `test_ficha_material.js` (11 ok) y `test_galeria_assets.js` (7 ok).
- 2026-08-04 · 🥶 **El editor se pintaba entero dos veces al arrancar** (dueño: «cuando se refresca la página apareces en el modo editor, funciona durante 1s todo rápido pero de golpe todo se congela, tienen que pasar varios segundos hasta que el frontend responde»). El arranque hacía `render(); resizeEdit();` y **acto seguido** `setMode('3d')`. `setMode` ya pinta lo suyo de forma síncrona (`resizeEdit3d` + `drawEdit3d` + `drawIso`), y `render()` no pinta al momento: encola un rAF que vuelve a hacer `drawEdit` + `drawIso` + `updateInfo` + `drawEdit3d`. O sea que el modelo se rasterizaba **dos veces enteras**, y la segunda caía un frame más tarde — de ahí el «primer segundo va fino y luego se congela»: el rAF todavía no había entrado. Encima `resizeEdit()` dibujaba el lienzo 2D que `setMode('3d')` oculta en la línea siguiente. Ahora el arranque solo hace `updateInfo()` y deja pintar a `setMode`; volver a Capas pasa por `setMode`, que llama a `resizeEdit()` por su rama, así que el lienzo 2D se dimensiona y se pinta cuando de verdad se ve (comprobado: 890×765 y con contenido al pulsar Capas, en la ida y vuelta y tras redimensionar). De paso, `updateInfo()` ya no vuelve a partir las claves de los N voxels para sacar la bbox: se la pide a `voxParsed()`, que la calcula y la **cachea**.
  Lo que despistaba: en un escritorio rápido **no se reproduce** (0 ms de bloqueo), y tampoco depende del móvil ni del DPR. La matriz de sondas lo dejó claro — es **CPU lenta × tamaño del dibujo restaurado de localStorage**; con la CPU frenada ×6 y un dibujo de 48 171 voxels, A/B de 5 repeticiones intercaladas: bloqueo total 2651 → **1743 ms** y la peor congelación 2157 → **1446 ms**, sin solape entre las dos series. Lo que queda es trabajo real que se ve (`drawEdit3d` ~610 ms, la miniatura `drawIso` ~390 ms). Se probó apartar `drawIso` un frame con un rAF y **no compra nada** (1518 vs 1503 ms: el rAF se encadena al mismo bloqueo sin dejar pintar en medio), así que se descartó en vez de dejar un truco que no mide.
- 2026-08-04 · 🎛️ **Girar objeto 90° se muda al borde del lienzo, pegado a subir/bajar capa** (dueño: «quiero los botones de giro abajo a la derecha donde te indico, que sean compactos y alineados con subir y bajar de capa»). Estaban en el formulario del panel izquierdo, o sea mirando a otro lado mientras giras el dibujo. Ahora ↧X ↻Y ⟳Z van en una caja flotante debajo de ▲ 1/16 ▼, dentro de una **columna común** (`#stage-side`) en vez de posicionarse cada una por su cuenta: así se alinean solas (mismo ancho, mismo borde) y cuando la capa se oculta —en 3D— el giro sube sin dejar hueco, que es justo lo que hacía falta para no perder los botones fuera de 2D. En 3D la paleta de herramientas (`.tool-float`) ocupa esa misma esquina y el giro le caía encima, así que se aparta a su izquierda **mientras la paleta esté a la vista** (`#tool-float:not([hidden]) ~ .stage-side`): por hermano posterior y no por una clase de modo, para que dependa de lo que SE VE y no de un estado que haya que acordarse de sincronizar. Comprobado a 1500 px y a 390 px, en 2D y en 3D, que las dos cajas no se tocan; y que los tres botones siguen girando de verdad (6×10×4 → 4×10×6 → 4×6×10 → 6×4×10).
- 2026-08-04 · 🧟 **El editor de agentes también se entera: tres cachés entre el fichero y el preview** (dueño: «en el Mundo al guardar se ven los cambios, eso está ok, es en el editor de agentes donde no se ven»). El preview del panel no pasa por el Mundo: se lo montan `agGeomCache` (caras fusionadas, en app.js) y `docsCache` (el doc del dibujo, dentro de la librería de esqueletos del snippet), y ninguna se soltaba al guardar. Se sueltan ahora **antes** del corte por `mc.gl` —el panel tira con el Mundo cerrado— y al snippet se le pide con un `game.esqueletos.olvidarDibujo(clave)` nuevo en vez de hurgarle la caché desde fuera. Lo que no era obvio y costó una sonda: **el sitio donde se vacía `agGeomCache`**. Limpiándola al guardar no bastaba, porque entre la petición y la respuesta el bucle de dibujo sigue pintando el plan viejo y **la vuelve a llenar con el dibujo de antes**; la traza lo enseñó sin discusión (el doc ya venía con 660 voxels en vez de 1320 y las caras dibujadas seguían clavadas en 803). Vaciarla dentro del `.then` de `agPreparar`, justo cuando entra el plan nuevo: 803 → 1983 caras.
- 2026-08-04 · 🧟 **Retocar una pieza de un agente ya se nota en el personaje: el asset se identifica por su FICHERO, no por su rótulo** (dueño: «hay algo que no se sincroniza bien, cuando se está editando un bloque/estructura que forma parte de un agente articulado, los cambios que se realizan en el bloque/estructura una vez guardado no se reflejan en el personaje»). Lo primero fue descartar al sospechoso obvio: una sonda montó un zombie vivo y llamó a `mcRefreshSavedKey('asset:assets/torso-zombie.vox.json')` a mano — el rig cambió en caliente (`colCount` 1578 → 8472). **El refresco funcionaba**; el fallo estaba aguas arriba, en **dónde aterrizaba el dibujo**. Un agente guarda sus piezas como `asset:assets/<id>.vox.json`, pero `POST /api/assets` deducía el id del **nombre** (`slugify(meta.name)`): guardar «Torso de zombie» escribía `torso-de-zombie.vox.json`, un asset nuevo que no usaba nadie, y encima mandaba a refrescar **esa** clave, así que no había forma de que se notara ni por casualidad. No era un caso raro: **17 de los 49 assets** tenían `id != slug(nombre)` y entre ellos estaban **las 8 piezas de agente**, o sea que ninguna se podía retocar. Los `assets/*-de-personaje.vox.json` del dueño (escritos entre las 10:13 y las 11:43 de hoy, mientras esto se depuraba) son las esquirlas: el torso quedó bifurcado y «personaje 1» siguió con el del zombie. Es **el mismo defecto que ya se había arreglado para los agentes** («Guardar como…»: el `id` manda sobre el nombre), así que el arreglo es ponerlos de acuerdo — `POST /api/assets` respeta `d.id` si viene (acotado a `[A-Za-z0-9_.-]`: un `../../data/habitantes/diana` se queda en `assets/`), cargar de la galería se queda con el id, y el id viaja en la copia local para que un F5 no lo pierda. Como ahora Guardar **pisa** el asset, se respalda antes en la papelera. Y como renombrar-y-guardar es genuinamente ambiguo (*retoco esta* vs *parto de ella para otra*, que es lo que el dueño estaba haciendo esta mañana), ese caso —y solo ese— **pregunta**. Prueba nueva y dedicada: `test_guardar_pieza.js` (**13 ok**), que se crea su propia pieza con el id y el rótulo descasados a propósito, la carga con un clic de verdad en la galería y comprueba **el fichero en disco**. De paso, `test_agentes_api.js` tenía una aserción que se caía sola desde la trigésima vez que se corría (contaba ficheros de la papelera, acotada a 30 **por origen**): ahora mira la marca de tiempo del respaldo, no cuántos hay.
- 2026-08-04 · 💡 **Poner o quitar un bloque ya no recalcula la luz del mundo entero: de 680 ms a 8,5 ms en 512×40×512** (dueño: «cuando hago un game.resizeWorld("1000x40x1000") hay un clamp a 512×40×512 pero lo peor no es eso, es que poner un bloque o quitarlo del mapa produce un lag enorme, caen los fps a ~24 y esto no se puede permitir, no tendría que caer un solo frame o debería de ser inapreciable»). Medido antes de tocar nada, con una sonda que cronometra cada tramo de `mcRemeshAround` a cuatro tamaños de mundo: el skylight global era **el 98 % del frame** y crecía con el VOLUMEN del mundo aunque el bloque tocado fuera uno — 42 ms en 96×40×96, 199 ms en 256², **680 ms en 512×40×512** (≈40 frames de golpe). Ni el mallado (6 ms, local y plano) ni las estructuras (0,1 ms) tenían nada que ver. Arreglado con `mcRelightBox(x,z)`: recalcula solo una caja de ±17 en X/Z y la COLUMNA ENTERA en Y. Esa forma sale de la física del asunto y no de un número al azar: la luz pierde 1 nivel por paso, así que una edición no llega a más de MC_MAXLIGHT=15 pasos por aire, salvo hacia abajo, donde abrir o tapar una columna le cambia el cielo de arriba abajo de una vez. Y es EXACTO, no una aproximación: las celdas de fuera de la caja no han podido cambiar, así que sirven de condición de contorno sembrando hacia dentro con su nivel −1, y cualquier camino que salga y vuelva pasa por el borde, que ya trae su mejor valor. Eso tiene prueba nueva y dedicada (`test_luz_incremental_navegador.js`, 19 ok): compara `mc.light` **celda a celda** contra `mcComputeLight()` tras 120 ediciones al azar más los casos que de verdad duelen — abrir el techo de una cueva tapada y volver a taparlo, las cuatro caras del mundo, la frontera de un chunk, el fondo. De regalo, dos cosas más del mismo frame: (a) ahora se re-malla **lo que cambió** y no un 3×3 fijo, porque `mcRelightBox` devuelve el AABB de las celdas que de verdad cambiaron de luz —normalmente 1 chunk en vez de 9—, con aserción propia de que esa caja no se queda corta (quedarse corta no daría un error, daría sombras viejas pegadas en pantalla, que es lo peor de depurar); y (b) `mcComputeBlockLight` ya no hace un `fill(0)` de N bytes por edición cuando no hay emisivos y todo estaba ya a cero. Resultado: la edición pasa a costar **6-8,5 ms en CUALQUIER tamaño de mundo** (ya no crece), medido como mediana de 30 ediciones seguidas y bajo SwiftShader, que es software puro: en la GPU del dueño será bastante menos. Falta que lo confirme él con DevTools CERRADO. En verde también `test_luz_al_estampar` (9), `test_shadow_map` (20), `test_sombra_movil` (8), `test_suelo_al_estampar` (9), `test_navegador` (15) y `test_fisica_navegador`. El **tope de 512 no se toca**: es presupuesto de memoria, no capricho — entre `grid` (Uint16), `light`, `blockLight` y `blockLightDir` (Int8×3) son 7 bytes por celda, o sea 73 MB en 512×40×512 y **280 MB** en el 1000×40×1000 que pedía, antes de las mallas de 3 844 chunks. Decisión aparte y del dueño.
- 2026-08-04 · ❓ **Cada campo del editor de agentes explica qué es** (dueño: «en edición de agentes articulados no queda claro qué es cada una de estas opciones, estaría bien un tooltip para cada una», con la tarjeta «Se articula» a la vista). `base` / `reposo` / `amplitud` / `desfase` son exactamente los términos de `ang = reposo + (base − reposo)·activo + amplitud·andando·sin(fase + desfase°)`, y mirando la caja de texto no hay forma de adivinarlo. Ahora la etiqueta de un campo puede ser `'amplitud'` o `{t:'amplitud', ayuda:'…'}` — objeto y no un argumento más, porque en `agCampoNum` el último ya lo tiene pillado `esDef`, así que cualquier campo se explica sin cambiar ninguna firma ni el orden de las que ya había. La ayuda sale por **dos vías**: el `title` del `<label>` (el globo de siempre en escritorio) y un **«?» que la despliega debajo del campo**, porque en el móvil —donde el dueño edita— no hay hover ni globo; se abre con `:focus` y no con `:hover` para que las dos no se pisen, y como el formulario se reconstruye entero en cada tecla no hay ningún estado que guardar: el foco se pierde solo. El «?» es un `<button>` **dentro del `<label>`** y no le roba el clic al campo porque es contenido interactivo y la activación del label lo salta; eso tiene prueba propia, que es lo que se rompería sin darse cuenta. Escritas las 10 ayudas del formulario de pieza: `nombre`, `dibujo` (con el aviso de que un bloque de 16³ macizo es TERRENO y no se puede animar), `rot`, `en`, las seis de `articula` y las tres de `mira`. Efecto lateral querido de `flex-wrap:wrap`: en el móvil la terna `en (x, alto, z)` cae a su propia fila entera en vez de partir el rótulo por la mitad. `node test_panel_agentes.js` 40 ok (dos casos nuevos), y comprobado a la inversa —rompiendo la regla de CSS a propósito— que el caso falla de verdad.
- 2026-08-04 · 🧗 **El agarre de parkour ya no da un tirón hacia abajo: te cuelgas a la altura a la que estás** (dueño: «hay algo extraño en el agarre con espacio de parkour, saltas y cuando se agarra, estando en lo alto del salto, la altura cambia de golpe mas hacia abajo, lo ideal es que conservase la altura ya que ese cambio es muy brusco; o cambiarla y/o suavizar el agarre para que no sea un cambio brusco en y»). Causa exacta: `pkPose` clavaba `y = canto − 1.8·esc` (la pose «canónica», el jugador colgado con los ojos justo bajo el canto), pero el agarre se permite desde `alturaMin = 1.5`; engancharse cerca del punto alto del salto significaba **caer hasta 0,3 de golpe en un solo frame**. Arreglado en el snippet (`data/snippets/mundo-autoarranque.json`, **v1.28**, cero líneas de `app.js`): la altura de colgado pasa a ser `min(p[1], canto − calado·esc)` — tu propia `y`, con el único tope de que quede `calado = 1.2` de cuerpo por debajo del canto para no colgarse de las rodillas; por abajo ya acota el sondeo con `alturaMax`. Si esa altura no cabe tras la retracción por la normal, **se reintenta la pose canónica** antes de descartar el canto, así que no se pierde ningún agarre de v1.27. El shimmy con `A`/`D` y el arranque de `W` usan esa misma `pk.y` (el desplazamiento por el canto no sube ni baja). El encaje en **XZ**, que es instantáneo por definición, se suaviza con un desfase que decae `exp(−dt/acomodo)` — el patrón frame-rate-independiente de `pasoSuave` —, con `acomodo = 0.06 s` y `0` para volver al agarre seco. Dos tunables nuevos por consola: `game.parkour.calado` y `game.parkour.acomodo`, persistidos en `localStorage` como el resto. En las pruebas hubo que **cambiar tres aserciones que comprobaban la `y` fija** (comprobar `canto − 1.8` era clavar el bug): ahora se exige que la altura de colgado caiga en la banda `[canto − alturaMax, canto − calado]` y, sobre todo, que **el salto en `y` del frame del agarre no sea mayor que la caída por frame que ya llevabas**, que es literalmente lo que se pedía. `node test_parkour_navegador.js` 18 ok y `node test_fisica_navegador.js` en verde; el mundo del dueño queda intacto.
- 2026-08-04 · 🧗 **Parkour: si el salto se queda corto y el espacio sigue pulsado, el jugador se agarra al canto y trepa** (dueño: «me gustaría añadirle una nueva funcionalidad al jugador que no es de minecraft, más de juegos de escalada o parkour… que cuando el jugador no llegue saltando hasta un bloque, por ejemplo uno que está a 3 alturas del suelo, si la tecla de saltar (espacio) sigue pulsada, el jugador haga un movimiento de apoyo y empuje simulado con los brazos (que no se ven) para subirse al bloque… inicialmente se queda sujeto al bloque, y luego hace un efecto de subida suave hasta ponerse de pie encima»; y luego «la 3, además así puede moverse lateralmente con A y D mientras está colgado sujeto con espacio», «cualquier borde sólido, encendido por defecto», «sube y avanza en una curva suave»). En el snippet (**v1.27**), **cero líneas de `app.js`**: máquina de estados `libre → colgado → subiendo → libre` en `mc._parkour`, dentro del envoltorio de `mcUpdate` que ya existía. Lo que dictó el diseño fue el **orden de `mcUpdate`**, no la geometría: **`mcUnstick` corre al principio** (`app.js:5841`) y sube al jugador a la primera `y` libre, así que una pose de colgado que solapase la pared 1e-9 se convertía en un trepado instantáneo falso — la pose se valida con `mcCollides` y se **retrae por la normal** en pasos de 1/16, y colgado/subiendo **`orig(dt)` no se llama en absoluto** (el plan decía «correr la física y restaurar»: no vale, `mcUnstick` va antes de poder restaurar nada). Como saltarse `mcUpdate` es saltarse también su tope de `dt`, el envoltorio pone **el suyo** o una pestaña en segundo plano corona de un tirón. `alturaMin = 1.5` va justo por encima de lo que se alcanza saltando (`h = v²/2g = 1,4545·s`), así que un bloque de 1 se sigue subiendo de un salto y esto **no compite con el auto-escalón**. La subida es una **L** (Bézier con `P1.xz = P0.xz`: a mitad de camino 75 % de subida y 25 % de avance), que además impide atravesar una pared de 1 de grosor y aparecer dentro de una habitación sellada. Tunables + `game.parkour.estado()` (dice **por qué** un canto no engancha, con `toast()`). Verificado con `node test_parkour_navegador.js` (18 ok) y con una **sonda en el Mundo VIVO del dueño** sin poner ni un voxel: canto real en (5,15,49) sobre suelo `y=12`, colgado en el frame 27 a `y=13.200`, coronado a `y=15.000` con `onGround`, `mcSerialize()` idéntico byte a byte (4 837 451 bytes, 450 estructuras) y **0 POST**. Regresiones verdes: física 18 ok, bloques 357 ok, esqueleto 15 ok.
- 2026-08-01 · 🏃 **`seguir`: una estructura te persigue (o persigue a otra), y es SÓLIDA donde se la ve** (dueño: «crea una nueva capacidad que sea follow o seguir de forma que pueda hacer cosas como que una estructura siga al jugador hasta una distancia como con opción de detección a partir de una distancia» + «o que una estructura siga a otra»; preguntado si la pieza perseguidora debía ser sólida o atravesable, eligió **Sólida**). En el snippet (**v1.18**): `seguir:{ objetivo, deteccion, distancia, velocidad, correa, volver, ejes, suavidad }`, con `objetivo` = `'jugador'` · `[x,y,z]` · **otra clave de material** (la instancia más cercana). Es la primera capacidad que **mueve** una estructura, y ahí está todo el problema: mover una estructura tiene **dos mitades que se desincronizan**. Lo que se **ve** ya sabía de `s.model` (el culling transforma el centro del aabb, `app.js:5249`, y la firma de movimiento de la sombra del sol ya hashea `m[12]`/`m[14]`, `app.js:4758`), pero lo que se **toca** no: la colisión fina sondea el bitset con base `bx = s.ox*T` (`app.js:5064`) y no mira la matriz — una pieza movida por matriz sería un **fantasma que se ve perseguirte y atraviesas**, y encima dejaría un **muro invisible en el ancla**. **Y `s.ox` no se puede tocar**: es lo que `mcSerialize` escribe en `mundo.json` (`app.js:6333`) y lo que al cargar se trunca con `|0` (`app.js:6358`), así que moverlo daría saltos de bloque entero **y guardaría una posición que el dueño no puso**. Solución sin tocar `app.js` (§0): el desplazamiento vive en `s.model` (traslación sumada en la última columna = `T·R`, o sea **girar sobre el pivote y DESPUÉS trasladar**; al revés la pieza orbitaría el pivote en vez de perseguir) y la solidez sale de **tres envoltorios** sobre las globales por las que pasa TODO el sondeo fino: `mcStructColl` devuelve `null` para una instancia desplazada (**el ancla deja de ser sólida en cuanto se va**, y eso vale de golpe para colisión, raycast, pegar bloques y resaltado), `mcFineBoxHit` resta el desplazamiento a la caja de consulta y prueba el mismo bitset (un solo envoltorio ⇒ sólida para el jugador, para el rayo de romper y para pegar), y `mcStructAt` lo mismo **para poder romperla donde se la ve**. Salida rápida por contador de desplazadas: sin ninguna, los tres devuelven lo del original — `mcCollides` se llama varias veces por frame **y por eje**. **Cuatro decisiones que los tests obligaron a cambiar sobre lo planeado**: (1) con `ejes:'xz'` la distancia se mide **en planta**, no en 3D — la Y de una pieza pegada al suelo la manda el terreno, así que contarla hacía que «`distancia: 2.5`» fuese 2,4 en el suelo y, **si te subías encima, la única salida que encontraba era hacia arriba**, o sea quedarse quieta; (2) el suelo se sondea sobre la **huella entera** quedándose con la columna más alta, porque sondeando solo la columna del centro **un escalón se comporta como un muro** (lo tiene bajo el morro y no bajo el centro, así que se calcula la altura vieja y la caja choca con el peldaño que justo iba a subir); (3) el paso se prueba **eje a eje** para que resbale por las paredes, y en `'xz'` la altura se resuelve **antes** de probar el terreno; (4) `recoger()`/`quitar()` devuelven la pieza al ancla **en el acto y sin esperar un frame** — si hiciera falta un frame habría un instante en que no choca ni donde estaba ni donde está. Quitar `seguir` **tiene** que recoger: una pieza desplazada sin nadie que la mueva se quedaría ahí para siempre y, como el ancla ya no es sólida, sería un fantasma permanente; en cambio un `define` que **sí** trae `seguir` no la recoge, para que afinar `velocidad` desde la consola no sea un teletransporte a media persecución. Seguir a **otra pieza** usa los centros **leídos antes de mover a nadie**: ese desfase de un frame hace que el orden del array no importe y que un ciclo (A sigue a B y B sigue a A) sea una pareja que se persigue y no un cuelgue. Informes: `game.bloques.seguidores()` (ancla · desplazamiento · objetivo · estado), 4ª línea de rayos-X (`seguir: a 3 del ancla (3,0,0) · con la correa tensa`) y `lista()`. **Límites a propósito, documentados en `CLAUDE.md`**: sin pathing (línea recta, resbala, `por = 3` si se atasca), la luz emisiva y la sombra de suelo del aabb se quedan en el ancla (`app.js:4908`/`6433`), no te lleva encima, la colisión no gira con `mirar`, dos seguidores no chocan entre sí, y **se guarda el ancla, no el sitio**. Verificado: **63 casos nuevos** en `test_bloques_comportamiento.js` (§16, con un mundo de juguete al que hubo que darle `mcSolid`/`mcSurfaceNear`/`mcFineBoxHit`/`mcStructAt` **y sustituirle `mcCollides`**, porque el suyo llamaba a su copia local de `mcFineBoxHit` y se saltaba el envoltorio — habría dado verde sin probar nada), **suite entera verde** (19 ficheros, **506 ok, 0 fallos**) y sonda en Chromium sobre el mundo del dueño (`POST /api/mundo` y `/api/habitantes` bloqueados): la losa se desplaza `3,09 / 1 / −0,77` (sube un bloque ella sola), `s.ox` intacto, `mcSerialize()` sigue guardando el ancla, choca donde se la ve, **hueca en el ancla**, `mcStructAt` la encuentra en su sitio nuevo y `quitar()` la recoge. Sigue ahí el 404 de `api/habitantes/llama-textura`, **sin relación con esto** (sale igual en una carga limpia).
- 2026-08-01 · 🧲 **Pivote automático por la cara pegada + giros y límites propios de cada pivote** (dueño: «me gustaría también un modo de pivote automático de forma que en función de donde se pegue la estructura se active ese pivote… también me gustaría tener una definición de giros y limites para cada pivote en la definición del comportamiento en el snippet»). En el snippet (**v1.17**): `pivote: 'auto'` y `pivotes: { 1:{…}, 2:{…} }`. La tabla es por MATERIAL pero **contra qué está pegada cada pieza es cosa de la instancia** — el `brazo.vox.json` del dueño tiene sus dos pivotes en **caras opuestas** (x=15 y x=0) justo por eso —, así que `'auto'` se resuelve **por instancia** y se cachea en ella (nunca en una lista aparte: `mcRestampAll` reemplaza los objetos). Reglas aprobadas: el pivote pertenece a la **cara más cercana** del bbox; con varios contactos gana **más superficie**, y a igual superficie **abajo → lados → arriba**; una cara pegada **sin pivote no cuenta**; sin contacto útil, **nº1**. La normal con la que se estampó **no se guarda**, así que el contacto se deduce del mundo sondeando **medio voxel fino más allá del plano** de cada cara (un panel de 1/16 pegado a ras no se ve desde el centro de la celda vecina) y por `materialEn`, o sea que cuenta también **estructuras finas**. `rot` lleva **vuelco** en los bits 2-3: la cara objeto→mundo se convierte por el mismo camino que `mcStructGeom`, porque mirar solo `rot&3` elige el pivote equivocado en una pieza tumbada. Rayos-X dice por instancia `· pivote nº2 (pegada por -X)`. **Dos cosas salieron en el Mundo de verdad y no en el de juguete**: (a) redefinir el material **no** re-elegía pivote (el número vive cacheado en la instancia), así que pasar a `'auto'` desde la consola no movía nada y parecía que la opción no existía — ahora `define()` lo olvida solo, y `repivotar()` queda para cuando lo que cambia es el mundo; (b) reejecutar el snippet **re-define desde la tabla ya normalizada**, y `normalizarMirar` no sabía leerse a sí misma en `vars`, `frenteX` ni `senX/senY`: lo escrito en la consola **se degradaba solo** al recargar. Verificado: **26 casos nuevos** en `test_bloques_comportamiento.js` (§15), **suite entera verde** (19 ficheros, 443 ok, 0 fallos) y sonda en Chromium sobre el mundo del dueño (`POST /api/mundo` y `/api/habitantes` bloqueados), donde los dos brazos eligen su pivote por contacto (`pegada por -Z` / `+Z`, ambos al nº1 por ser espejo). Pendiente ahí, **sin relación con esto**: `/map/default` pide `api/habitantes/llama-textura` y da **404**.
- 2026-07-31 · 📍 **El pivote se DIBUJA en el editor y lleva número visible** (dueño: «quiero cambiar el mecanismo de elección de pivote. Que sea desde el editor 2d/3d con un color especial o herramienta para colocar pivotes, puede haber varios, en el script se elegiría el pivote a usar, por defecto el primero. en el editor tiene que aparecer la numeración de los pivotes visible»). Nueva herramienta **📍 (tecla `P`)** en el panel y en la barra flotante 3D: clic pone un pivote en la celda, clic encima lo quita y renumera; el **orden del array es el número** que se pinta. **No son voxels y ese fue el motivo de no usar «un color especial»**: un voxel mágico habría que filtrarlo en `mcStructGeom`, `mcStructCells`, `getTexDef`, el contador, el bbox/`ext` y el test de `blockLike` — con saltarse uno, un cubo suelto en el mundo y la geometría desplazada. Van en **clave de primer nivel `pivotes`** del JSON, que sobrevive al guardado **sin tocar `server.py`** (`POST /api/habitantes` hace `atomic_dump` del documento entero). En el snippet (**v1.16**): `pivote: N` elige el dibujado, sin nada se usa **el primero**, y el literal `[x,y,z]` sigue ganando. La resolución **no puede ser síncrona** — `define()` lo es y el JSON viaja por red —, así que `getRoomData` rellena el `piv` de la config **ya viva** y la pieza se recoloca sola en el primer frame con datos. Las tres conversiones que separan la celda del punto de giro (Z-arriba→Y-arriba, origen en la esquina de la celda 16³ vía `Math.floor(min/16)*16`, centro `+0.5`) están en `pivoteDeDibujo` y documentadas en `CLAUDE.md`, porque saltarse cualquiera cuelga el brazo de otro sitio. Los pivotes viajan por deshacer, `rotateModel`, `resizeGrid` (se descartan los que quedan fuera) y todas las rutas de guardado/carga. Verificado: **10 casos nuevos** en `test_bloques_comportamiento.js` (§14), **suite entera verde** (19 ficheros, 417 ok, 0 fallos), sonda de navegador sin errores de página y **capturas** de las dos vistas confirmando la numeración (magenta sólido en la capa actual, tenue en las demás; en 3D la chapa va siempre encima porque es una marca, no geometría).
- 2026-07-31 · 💪 **`mirar` + `sinVolteo`: el brazo espejo sube por delante en vez de darse media vuelta** (dueño, con capturas: «el brazo izquierdo se rota para hacer el seguimiento en el plano horizontal y no debería… al subir el brazo ha girado 180 grados los dedos de la mano», «el otro brazo debería hacer lo mismo pero realiza un giro por la espalda del personaje hasta apuntar al frente quedando girado», «ambos deberían moverse igual, lo único que cambia es el pivote»). **Causa, y no era un signo mal puesto:** una dirección se apunta con **dos** posturas, `(giro, cab)` y `(giro+180, 180−cab−2·frenteX)`, que dejan la punta exactamente igual. Apuntar la CARA elige siempre la primera, así que **dos piezas iguales puestas con `rot` opuesto acaban en la misma orientación absoluta** — geométricamente inevitable — y a una le toca girar 180° sobre sí misma: llegaba apuntando bien pero con el pulgar del revés y barriendo por la espalda. Arreglo: **`mirar:{ sinVolteo:true }`** elige la postura que menos gira sobre el eje vertical y saca el resto por el cabeceo, que es lo que hace un hombro. Tres detalles que no son opcionales: el cabeceo se **pinza con `limites.x` ANTES** de convertirlo (si no, `x:[30,90]` significaría una cosa en un brazo y su negativa en el otro), **banda muerta 80/100°** en vez de 90 pelado (en la frontera las dos posturas valen igual y sin histéresis la pieza **aletea**), y rayos-X marca con **`↺`** la instancia que está en la otra postura. De paso, el `frente:{x:-180}` que tenía puesto el brazo pasa a `{x:-90}`, que es lo que ES el dibujo: con −180 el cabeceo pedido era `elevación+180` (90..270), **siempre pinzado en el tope de arriba**, o sea el brazo clavado en la horizontal a cualquier altura del jugador y con `xmin` que no llegaba a tocarse nunca (su «xmax sube el brazo, xmin no parece ir»); y como la postura alternativa se calcula con ese `frente`, con el deshonesto el arreglo apuntaría al lado contrario. Verificado **en el mundo del dueño** con fotos antes/después del mismo encuadre (`POST /api/mundo` bloqueado y la posición del jugador fijada en cada frame, que si no la gravedad lo tira al suelo y las fotos no son comparables): el brazo espejo pasa de `giro −152°` (cruzado por delante del torso, mano del revés) a `giro 28°, cabeceo −90°` (extendido y simétrico con el otro, mano en espejo como debe ser). `node test_bloques_comportamiento.js` → **160 ok** (7 nuevas: las dos posturas apuntan igual, ninguna se da media vuelta, el **pulgar** —el eje izquierda-derecha de la pieza, que el cabeceo no mueve— sigue donde estaba, la regresión de lo de antes, la banda muerta, `sinVolteo` sin `ejes:'xy'` avisa y no registra, y la etiqueta `↺`). Suite completa: **19 ficheros, 280 ok, 0 fallos**.
- 2026-07-31 · 🏃 **Comportamiento `velocidad`: el suelo que pisas te cambia la marcha** (pedido por el dueño: «quiero un nuevo comportamiento de bloque, que sea velocidad, cuando se está en contacto con el bloque la velocidad del jugador se incrementa ×factor»). `game.bloques.define('hab:hielo', {velocidad:2})` ⇒ ×2 mientras el pie esté encima; `0.5` = barro. A diferencia de `alPisar`/`impulso`, que van **por flanco** (se disparan al ENTRAR en la celda), este es **continuo**: se lee la celda del pie cada frame y el efecto se acaba al salir de ella. La implementación es de una línea y media, y el sitio importa: `app.js:5060` lee `mc.speed` **una vez por frame** y de ahí salen tanto la marcha en el suelo como la aceleración en el aire, así que basta con poner el valor multiplicado justo antes del `mcUpdate` original y restaurarlo en un `finally`. Se escribe **`mc.speed` a pelo y NUNCA `game.playerSpeed`**: ese setter **persiste en `localStorage`**, o sea que pisar un bloque le habría cambiado la marcha al jugador para siempre. Tope de **40 u/s** (el mismo del setter) por tunelado: a más de eso un frame de 1/60 avanza ~0,7 bloques, más que la media anchura del cuerpo, y se cruzan paredes; `define` avisa si el factor pide pasarse. Dos trampas que costaron sendos rojos: (1) `velocidad:0` **no puede existir** como valor registrado — al reejecutar el snippet la tabla heredada se vuelve a pasar por `define()` ya normalizada, así que rechazar el 0 borraba media tabla; se trata como «sin valor» y para quitarlo está `quitar()`; (2) el test del tope medía 11,67 en vez de 20 bloques porque a 40 u/s el jugador **se salía del mundo de juguete y lo medido era la caída** — otra vez la misma piedra, ahora con `mc.onGround` aseverado en cada pasada. Verificación en el `app.js` de verdad (`test_fisica_navegador.js`, renombrado desde `test_paso_navegador.js` porque ya no va solo del paso): avance en 10 frames `0.833 / 1.667 / 0.417` para factores `1 / 2 / 0.5`, razones exactas a `1e-9`, `mc.speed` intacto al salir del frame y las tres pasadas comprobadamente **llanas**. Con el snippet del commit anterior ese test dice «la razón fue 1», o sea reproduce la ausencia de la función. Suite completa **324 ok, 0 fallos** en 17 ficheros.
- 2026-07-30 · 🧨 **El suavizado de escalones no hacía NADA en el juego, y el juguete lo había dado por bueno** (dueño: «esto no hace absolutamente nada, no hay diferencia entre paso suave 0 o 1000 o 1 o 10»). Tenía razón, y el fallo no estaba en el suavizado sino en **cómo detectaba el escalón**: me guardaba con `mc.onGround`. En `app.js:5089-5098` la gravedad se aplica **ANTES** del movimiento horizontal, así que el frame que sube un escalón termina con `vel[1]=0` (lo pone el propio auto-escalón), `ny === p[1]`, sin colisión, y por tanto con **`onGround = false`**: la guarda se apagaba justo en el único frame que había que suavizar, nunca se acumulaba desfase, y por eso τ=1000 se veía igual que τ=0. **El mundo de juguete aplicaba la gravedad al final**, con lo que ahí el mismo frame acababa con `onGround = true` y los 81 tests salían verdes probando lo contrario de lo que pasa en el juego. Arreglado midiendo el escalón **donde se da**: un segundo envoltorio sobre `mcMoveAxis`, cuyo único efecto sobre la `y` es el `p[1] += h` del auto-escalón (`app.js:4919`) y cuyos únicos dos llamantes son las dos líneas horizontales de `mcUpdate`. Eso elimina la heurística entera: saltar y trepar no pasan por ahí, así que no hace falta preguntar por `onGround`, ni por `vel[1]`, ni excluir el trepado a mano. El juguete ahora **calca el orden real** (velocidad horizontal → gravedad → `mcMoveAxis` → vertical) y tiene un `mcMoveAxis` global de verdad para que el snippet lo envuelva, con un test que **fija el orden**: «el frame del escalón acaba SIN suelo». Y sobre todo: **`test_paso_navegador.js`** (nuevo, 10 ok), que abre el `app.js` de verdad con playwright, monta una plataforma con un escalón de un bloque, pone al jugador a escala 2 (`MC_STEP·2 = 1,2` ⇒ el escalón se sube) y anda contra él llamando al `mcUpdate` real, leyendo la altura de la cámara de la **matriz de vista** (`yaw=pitch=0` ⇒ `m[13] = −ojo`). Mide **tirón de cámara 1,000 → 0,243** y la `y` física **idéntica al bit** en los 60 frames. Con el snippet del commit anterior ese test dice «el mayor salto de cámara sigue siendo 1.000», o sea que reproduce la queja del dueño en vez de darla por buena. Deshace los bloques que pone y bloquea `POST /api/mundo`. De paso el test destapó dos trampas del escenario que también habrían mentido: heredar `mc.onGround` de la pasada anterior (la segunda arrancaba en control de aire) y una plataforma tan corta que el jugador se salía por el otro lado y lo medido era la caída. Suite completa **307 ok, 0 fallos** en 17 ficheros. **Lección:** cuando el juguete y el juego difieren en el ORDEN de las operaciones, el test verde es una mentira exacta; para cualquier cosa que dependa de la secuencia de `mcUpdate`, la prueba tiene que ejecutar el `app.js` de verdad.
- 2026-07-30 · 🪜 **Los escalones ya no se suben a tirones: `game.bloques.pasoSuave`** (dueño: «cuando el jugador sube estructuras con forma de escalones el cambio entre escalón y escalón es brusco… pasa de estar instantáneamente en y, a y+8, luego y+16; estaría bien que si se puede subir el escalón la subida fuese más suave, ¿es posible? ¿quedaría natural?»). Sí, y es **exactamente** lo que hace Minecraft. `app.js` sube el escalón **entero dentro de un frame** (`mcMoveAxis`, `p[1] += h`, hasta `MC_STEP=0.6`), que es lo correcto para el tacto —el jugador nunca se queda a medias en una pared—, pero visualmente es un teletransporte de medio bloque. La tentación era interpolar la posición **física**: eso vuelve blando el juego (colisiones a media altura, el jugador «dentro» del peldaño). Lo implementado en el snippet, **sin tocar `app.js`**: la física salta igual y solo se **pinta** al jugador por debajo, desfase que se consume con `exp(-dt/τ)`, τ=0,06 s por defecto. Como el ojo se calcula en **seis** sitios distintos de `app.js` a partir de `mc.pos[1]`, no hay una función que envolver: el desfase se **resta al salir** del `mcUpdate` envuelto y se **repone al entrar** en el siguiente, y entre esos dos puntos lo único que pasa es el dibujado. Detalle que parece pedantería y no lo es: se repone la `y` **guardada** (`mc._pasoReal`), no `pos[1] + desfase`, porque restar y sumar un float no devuelve el mismo bit y esa basura acabaría entrando en la colisión — el test compara los 90 frames con `===` y así sale idéntica. Tres guardas: solo el **escalón automático** (saltar tiene `onGround` false, y trepar ya era continuo); se recorta a un escalón, así que un fallo nunca puede hundir el ojo medio mundo; y si la `y` no es la que se pintó, es que alguien movió al jugador (`game.tp`, respawn, un `alPisar`) y el desfase pendiente **se tira** en vez de sumarse. El estado vive en `mc`, no en un closure, para no repetir el fallo de las 👻 dos copias vivas: reejecutar el snippet **hereda** el desfase (y el τ que hubiera ajustado el dueño) en lugar de dejar al jugador medio bloque hundido para siempre. `pasoSuave(0)` devuelve el comportamiento de antes al bit, reponiendo la `y` de verdad al instante. En el mundo de juguete hubo que **darle escalones al juguete** (calco de `mcMoveAxis` con `MC_STEP` + una escalera de peldaños de medio bloque, 8 voxels finos, como la de su captura); la primera versión medía la **caída** por el otro lado de la escalera en vez de la subida (`y=5.003` al final: 90 frames daban de sobra para pasarse de largo), así que el último peldaño se prolonga como meseta. Medido: tirón de cámara **0,500 → 0,124** por frame, y la `y` física **idéntica en los 90 frames**; mismo desfase a 30 que a 120 fps. `VERSION` → v1.2. `node test_bloques_comportamiento.js` → **81 ok**; suite completa **296 ok, 0 fallos** en 16 ficheros.
- 2026-07-30 · 👻 **El snippet se podía reejecutar, pero la física se quedaba con la ejecución VIEJA** (dueño: «probé lo del impulso con un bloque arena y funcionó, luego creé una estructura pero no me ha funcionado el impulso… estoy encima de ella pero no salta, ¿igual no funciona con estructuras y solo con bloques?»). **No era cosa de las estructuras**: caer sobre una estructura fina con `impulso` lanza perfectamente (comprobado en el mundo de juguete: 3 despegues). El culpable era la guarda de idempotencia: `if (!mcUpdate._bloques)` impedía apilar envoltorios, pero al reejecutar el snippet dejaba puesto el envoltorio VIEJO, que sigue leyendo **su** `tabla` por closure. La ejecución nueva creaba una tabla que **no miraba nadie** y reemplazaba `game.bloques`, así que `define`/`lista`/`info` operaban sobre la tabla nueva (por eso su consola decía `impulso ↑12 (~3.3 bloques)`) mientras la física seguía consultando la vieja. La pista definitiva estaba en su propio volcado: **`lista()` no mostraba la arena**, que sí funcionaba en el juego — dos tablas distintas a la vez. Arreglado desenvolviendo por `mcUpdate._orig` (que ya se guardaba justo para esto) y reinstalando siempre el envoltorio de la ejecución actual; las definiciones previas se heredan volviéndolas a pasar por `define()`, que las renormaliza con el código de ahora, así que reejecutar ya no borra lo que el dueño tenía puesto. `VERSION` → v1.1. Test nuevo que **falla con el código viejo** (`subió 0.00`) y pasa con el arreglo: definir un trampolín DESPUÉS de recargar el snippet tiene que lanzar de verdad, y lo definido ANTES tiene que sobrevivir. Lección: una guarda de idempotencia que protege el *estado* pero no reinstala el *código* convierte cada reedición del snippet en un fantasma — la API dice una cosa y el mundo hace otra. `node test_bloques_comportamiento.js` → **65 ok**; suite completa **280 ok, 0 fallos** en 16 ficheros.
- 2026-07-30 · 🩻 **Rayos-X iba a tirones: `mcXrayVolume` costaba |caja del jugador| × |estructuras|** (dueño: «ahora rayos-X va muy lento, lo quiero como estaba antes del último cambio, caen demasiado los fps»). **No era el último cambio**: el rayo de apuntado que dibujé ayer cuesta 0,02 ms y las etiquetas 0,3 ms — medido en el mundo del dueño con el arnés de playwright, no a ojo. El culpable estaba ahí desde el commit inicial: la rama fina de `mcXrayVolume` preguntaba `mcFineSolidAt` **voxel fino a voxel fino** de la caja del jugador (~17 600 a escala 1) y cada pregunta recorre TODAS las estructuras → 850 000 pruebas por frame con las 48 del mundo, **17 ms, el frame entero**. Lo que cambió no fue el código sino el mundo: colocando escaleras y muelles para probar `game.bloques` el dueño subió el número de estructuras, y el coste es lineal en ellas. Arreglado invirtiendo los bucles: se itera **estructura a estructura recortando** la caja del jugador contra la suya (el mismo recorte que ya hacía `mcFineBoxHit`) y solo se recorren los voxels que caen dentro. **17,6 → 0,23 ms (×78)**; a escala 4 en campo abierto, 258 → 0,10 ms (×2 459), porque el barrido viejo crecía con `playerScale³` y el nuevo no crece con nada que no esté cerca. `mcRender` en rayos-X pasa de 17,6 a 1,6 ms, o sea que rayos-X ya no cuesta más que el render normal (1,2 ms). Queda un caso caro honesto: **dentro** de una estructura 16³ maciza son 4 096 cubos que empujar (19 ms), inherente a dibujar cada voxel como un cubo; antes eran 33. Test nuevo `test_rayos_x.js` (11 ok), que extrae la función verbatim de `app.js`: dibuja el **mismo conjunto** de voxels que la versión ingenua (comparado como conjunto, escalas 1 y 4, incluido un 16³ macizo), **no llama a `mcFineSolidAt` ni una vez**, y 200 estructuras lejanas no reciben **ni una lectura** de sus bits (espiadas con un Proxy). Lección repetida por tercera vez, ya en CLAUDE.md: **barrer el AABB del jugador en voxels finos no escala** — es lo que hundió la colisión, y lo que evita a propósito el sondeo de `game.bloques`.
- 2026-07-30 · 🏷️ **`game.bloques.define` acepta el nombre CORTO** (dueño: «podría ser "arena" en lugar de la ruta larga»; la consola le contestaba `no existe el material "arena". ¿Querías "asset:assets/arena.vox.json"?`, o sea que ya sabía la respuesta y aun así le hacía copiarla). Ahora `nombreCorto` quita namespace, carpeta y extensión (`asset:assets/arena.vox.json` → `arena`, `hab:escalera` → `escalera`) y `resolver` acepta el corto **si señala a un solo material**, diciendo por consola cuál ha elegido. Lo que se **registra** es siempre la clave larga: es la que traen los voxels del mundo, y la caché densa `id→cfg` sigue resolviendo por id. Si el corto es **ambiguo no se elige por el dueño** — se enseñan los candidatos y no se registra nada (adivinar aquí es peor que preguntar). `quitar` entiende lo mismo. Un material inexistente sigue avisando y mandando a `info()`. Esto **cambia a propósito** un test que fijaba el rechazo de `define('escalera')`: ahora se comprueba lo contrario (registra `hab:escalera`) más los dos casos que sí deben plantarse. `node test_bloques_comportamiento.js` → **63 ok**; suite completa **278 ok, 0 fallos** en 16 ficheros.
- 2026-07-31 · 🗿 **`mirar`: piezas que giran hacia el jugador sin tirones** (dueño: «un bloque-cabeza que mire a un usuario al pasar… en el plano x, y, o z, o varios de ellos a la vez, con límites de ángulos», y al explicarle que eso sí exigía tocar `app.js`: «pues permite que desde los snippets se puedan hacer giros que no sean tirones»). **Es el único caso de toda la librería que ha necesitado tocar `app.js`, y se enmarcó exactamente como pidió el dueño**: `app.js` expone una *capacidad* genérica (una matriz de modelo por instancia) y el snippet decide el *comportamiento* — mismo contrato que `mc.sunExtra`, `app.js` no sabe qué es `mirar`. El motivo de que no valiera el mecanismo existente: los `rot` del mundo son de **90° en 90°** y cada paso **se hornea en su propia malla** (`mcStructGeom`, cacheada en `mc.structs[srcKey].meshRot[rot]`), o sea que girar «como hasta ahora» es un tirón **y** una recompilación de geometría. Lo añadido a `app.js`: `uniform mat4 uModel` en los **dos** programas de estructura y en la pasada del sol, y `mcModelOf(s)` puesto **siempre** antes de cada `drawArrays` (el uniform es estado: si no se pone, se hereda el de la instancia anterior). Dos consecuencias que había que pagar aparte y que no se ven hasta que fallan: (1) **culling** — `s.aabb` se calculó de los vértices, que van en coordenadas de mundo **y sin girar**, así que la pieza rotada se sale de su caja y el frustum la borraría al asomar por el borde; `mcStructVisible` infla a centro-por-la-matriz ± semidiagonal y sin `s.model` llama al `mcChunkVisible` de siempre; (2) **sombra** — una pieza que gira no cambia ni un vértice, así que su sombra se quedaba clavada en la pose horneada: la matriz entra en la firma de **movimiento** (~22 Hz, como los agentes que andan), no en la de geometría. **Lo que NO gira, dicho por delante**: la colisión (el bitset se horneó con `rot`) y el sombreado por cara. Del lado del snippet, `mirar { objetivo, ejes:'y'|'xy', limites, alcance, suavidad, frente }`, con `lookAt` como alias porque así se llamó al proponerlo. Tres cosas se torcieron: el **prefijo no sirve para decidir si algo es estructura** — la primera versión exigía `asset:` y el mundo del dueño está lleno de `hab:cubo-trans`, así que ahora se valida mirando si hay alguna instancia viva con esa clave; una instancia **sin `aabb`** tumbaba `mcTick` entero (guardado con un `continue`); y el yaw acumulado había que **acotar a ±180**, o dar vueltas lo alejaba de sus propios `limites` para siempre. `node test_bloques_comportamiento.js` → **110 ok** (11 nuevas: matriz puesta, frente apuntando al jugador, pivote sin desplazar la pieza, límites que recortan, `rot=1` descontando el cuarto ya horneado, suavizado medido **moviendo al jugador** y no en el frame de arranque, fuera de alcance suelta la matriz, `quitar()` la devuelve a su sitio). `node test_giro_navegador.js` → **7 ok** (nuevo, y es el que prueba lo que el juguete no puede: que la **identidad dibuja exactamente lo mismo** que no poner matriz, que una traslación **sí** mueve la pieza —o sea que `uModel` llega al shader— y que a la distancia donde la caja cruda ya sale del visor la inflada sigue dibujando). `test_shadow_map.js` exigía literalmente `vWorld = aPos;`: se actualizó a «`aPos`, o `aPos` pasado por `uModel`», comprobando **además** que nunca salga de `uView`, y se verificó que el guardián nuevo sigue rechazando las dos regresiones. Al ser `app.js` + shader, **suite completa**: **357 ok, 0 fallos** en 19 ficheros, incluido `test_navegador.js` compilando el GLSL en WebGL2 y en WebGL1 forzado (el riesgo de pantalla negra de ESSL1).
- 2026-07-30 · 🦘 **Trampolín: bloques que te lanzan al pisarlos (`impulso` / `altura`)** (dueño: «me gustaría poder asignar el comportamiento de jumper a un bloque… que al pisarlo/pasar por encima proyecte al jugador con un tiro parabólico hacia arriba conservando la inercia que tenía en ese momento, como una plataforma de Quake… se tiene que poder especificar la fuerza de empuje», y luego: «es como hacer saltar al jugador (que pulse la tecla de espacio) pero con fuerza del salto ajustable»). Implementado en el snippet `mundo-autoarranque`, **sin tocar `app.js`**: es literalmente el salto de `app.js:5090` (`mc.vel[1] = fuerza`, `mc.onGround = false`) disparado por el mismo **flanco** que `alPisar` en vez de por la barra espaciadora. Tres decisiones que ahorran código: (1) **la inercia horizontal sale gratis** — `app.js:5069` solo pisa `vel[0]/vel[2]` si `mc.onGround || !mc.airControl`, y el comentario de `app.js:5088` ya dice que en el aire sin input la velocidad horizontal se conserva intacta; el tiro parabólico es lo que hace `app.js` por defecto, así que el snippet **no toca el eje horizontal**. Si el dueño apaga `game.airControl`, `define` **avisa** de que se convertirá en un salto vertical. (2) `mc.onGround = false` es obligatorio: sin él, el frame siguiente vuelve a clavar al jugador en el suelo. (3) `impulso` son **u/s verticales** (misma magnitud que el `8.0` del salto) y `altura:N` es azúcar para quien piensa en bloques (`v = √(2·g·h)`, `g = 22`) — conviene documentar que la altura crece con el **cuadrado**: doblar el impulso **cuadruplica** el salto. Escala `∝√escala` como la marcha, el salto y el trepado. Convive con `alPisar` en el mismo material y `define` acepta un material que **solo** tenga `impulso`. **El mundo de juguete volvió a mentir, y esta vez en rojo**: los cuatro tests medían la cima soltando al jugador desde `y=7` sobre la placa e inicializando `cima = pos[1]`, o sea que **la cima arrancaba ya en 7** y con impulso 8 (que sube 1,45) el trampolín nunca superaba la altura desde la que se le había soltado → «FALLA, subió 2.00» con el código correcto. Encima el juguete **no encaja al suelo** al aterrizar, así que ni siquiera se despegaba desde una `y` conocida. Arreglado midiendo lo que de verdad hace el dueño: se **anda** sobre una placa **rasante** (`placaRasante`, sustituye un bloque del suelo en vez de ser un escalón), se despega desde `y=5` exacto y se mide `cima − 5`. Los números cuadran con la integración discreta, no solo con la fórmula: `v²/2g − v·dt/2` da 1,39 / 5,69 / 3,89 y eso es lo medido. `node test_bloques_comportamiento.js` → **57 ok, 0 fallos**; suite completa **261 ok, 0 fallos** en 15 ficheros.
- 2026-07-30 · 🎯 **BUG-RAY1 · el rayo de apuntado se paraba en la CAJA de una estructura, no en su geometría** (dueño, con dos capturas: apuntando a la pared gris del fondo, el bloque de tierra acababa flotando pegado a la escalera). Causa: `mcRaycast(…, hitStruct)` daba la celda por sólida con `mcStructCellSolid`, que pregunta por la **caja de la celda entera** (`mcFineBoxHit` de `x*T` a `x*T+T-1`). Una escalera es casi toda aire dentro de su celda ⇒ el rayo se paraba en su AABB, la normal era la de la celda y el bloque nuevo salía flotando delante en vez de pegarse a la pared del fondo. Es la misma trampa de «un material vive en dos sitios», ahora en el apuntado: la rejilla se sondea fina y las estructuras no. Arreglo: **`mcStructRayHit`**, sub-DDA a resolución fina (1/16) **acotado a la celda** (≤48 pasos), que solo cuenta impacto si el rayo cruza un voxel fino **lleno**; se entra solo si `mcStructCellSolid` ya dijo que sí, así que el coste va con las celdas de estructura que cruza el rayo, **no** con el alcance. `mcStructCellSolid` tenía **un único llamante**, así que mallado, colisión y romper/poner quedan intactos. `mcRaycast` devuelve ahora también `point`, `dist` y `fina`. **Depuración pedida por el dueño (tecla X)**: rayos-X dibuja el rayo (magenta), un cubo en el impacto, la celda que lo para (blanco) y la celda donde iría el bloque (verde), sin test de profundidad. **Límite honesto**: desde el ojo el rayo se proyecta justo en la mira —se ve como un PUNTO, no como un segmento—, así que se añade **`game.rayoFijo()`** para congelarlo y poder apartarse a mirarlo de lado. `node test_rayo_apuntado.js` → **12 ok** (nuevo; extrae las funciones verbatim de `app.js` y **fija la regresión**: la celda sí da sólida por AABB pero el rayo no cruza voxel lleno — si vuelven a coincidir, el bloque flotante ha vuelto). `node test_navegador.js` → **15 ok**, con 3 casos nuevos que dibujan el rayo en un GL de verdad (`gl.getError()==0`) y comprueban `place == cell+normal`. Suite completa **248 ok, 0 fallos** en 15 ficheros.
- 2026-07-30 · 🪜 **La escalera SOSTIENE al soltar la tecla** (dueño: «ahora sí sube, pero si dejo de pulsar se cae al suelo»). `sondearAgarre` solo devolvía agarre con `W` o `S` pulsada, así que **sin tecla no había agarre** y la gravedad se llevaba al jugador: subir exigía una sola tirada sin pausas y cualquier pausa era una caída desde lo alto. Ahora sin tecla el agarre se mantiene con **v=0** —uno se queda colgado donde estaba, como en Minecraft—, con dos guardas para que no sea pegajoso: solo sostiene a quien **ya venía agarrado** (de pie junto a una escalera manda la física normal, y pasar al lado no engancha), y si el `mcUpdate` original encontró suelo (`mc.onGround`, sin sondeo extra) se suelta, para no dejar al jugador flotando a un pelo del piso y sin poder saltar. `node test_bloques_comportamiento.js` → **44 ok, 0 fallos** (nuevas: colgado 2 s sin moverse ni un centímetro, S sigue bajando desde colgado, quieto al pie NO se engancha, y tras bajar del todo se aterriza). Suite completa **233 ok, 0 fallos**.
- 2026-07-30 · 🪜 **REQ-MC · bloques con COMPORTAMIENTO (`game.bloques`): escalera trepable + disparadores al pisar**. El dueño creó `hab:escalera` y pidió que «al avanzar contra ella el jugador suba y al retroceder baje», con velocidades por objeto y, más adelante, bloques que «al pisarlos pase algo» (respawn, activar algo). **Modelo copiado de Minecraft**: el comportamiento cuelga del **MATERIAL**, no del voxel — MC guarda solo un índice de paleta por voxel y el comportamiento vive en un objeto compartido por tipo (tag `#minecraft:climbable`); un script por voxel aquí serían 96×48×96 = **442 368** closures. Aquí se pudo hacer igual porque la identidad del material sobrevive en el mundo, **pero vive en uno de dos sitios**: solo un asset **16³ MACIZO** (`blockLike`, app.js:4006, `nvox>=4096`) entra en `mc.grid`; lo que tiene forma o huecos —`escalera.json`, 160 voxels— se estampa como **estructura fina** en `mc.structures`, con malla a 1/16 de bloque y FUERA de la rejilla. `materialEn()` mira las dos vías: `mc.grid[idx]`→id→`mc.blockKey[id]`, y si ahí hay aire, `claveFinaEn` (calco de `mcFineBoxHit`, app.js:4935, devolviendo `s.key`). Registro `game.bloques.define('hab:escalera',{trepable:true,subida:4,bajada:5})` + caché **densa** `id→cfg` invalidada por `mc.blockKey.length` (mismo truco que `mcXnameCache`, app.js:5429) ⇒ consulta por frame = un índice de array. `info()` chiva la clave EXACTA del bloque bajo los pies / delante / detrás (ataca el error de namespace: `hab:escalera`, no `escalera`); `lista()`, `quitar()`, `avisos()`. **Costura única**: un envoltorio sobre `mcUpdate` (definido en app.js:5053, **una sola llamada** en app.js:6323), idempotente por `mcUpdate._bloques` — sin la guarda, reejecutar el snippet al afinar `subida` duplicaría la velocidad. **`mcSolid` NO se toca** (lo usan mallado, raycast y romper/poner): la escalera es SÓLIDA y se sube *pegado* a ella (decisión del dueño). Trepado de **coste fijo**: UNA celda sondeada a la altura del pecho, sin barrer el AABB — ese barrido crece con `playerScale³` y es justo lo que hundió los fps con la colisión fina. `alPisar` es por **flanco** (cambia la celda bajo los pies), como `onEntityCollision` de MC, en try/catch con aviso **acotado** (§22: nada de una línea por frame). **Excepción al §0 (`app.js` agnóstico), aprobada explícitamente por el dueño**: los snippets no se autoejecutan (solo a mano con Alt+C), así que la escalera dejaba de ser escalera en cada recarga → se añade el punto de extensión `mcAutoarranque()` (~10 líneas, al final de `openWorld`) que ejecuta el snippet `mundo-autoarranque` si existe; `app.js` no sabe qué hace ese snippet. Fallar es inocuo. **Dos trampas cazadas por los tests**: (1) anular la gravedad *después* de que el frame la aplique pierde `22·dt²` por frame → a 60 fps subías 3,64 en vez de 4 y **a 30 fps la mitad**: la escalera iba más lenta en un PC lento. Arreglado partiendo en `sondearAgarre()` (antes de mover) + `aplicarTrepado()` (después), velocidad exacta pasen los fps que pasen. (2) el sondeo con S miraba la celda de **detrás** (aire) ⇒ «bajar» era **caída libre** disfrazada; pasaba el test solo porque 2,75 caía dentro de una tolerancia de ±0,35. Ahora se sondea siempre **hacia donde se mira** y, bajando, se anula la componente que despega de la escalera (el desplazamiento lateral se respeta); al pie, si hay suelo, se aterriza normal en vez de quedar flotando. **(3) La escalera del dueño NO estaba en `mc.grid`**: el dueño reportó que no subía y rayos-X lo cantaba («estructura · guardada · hab:escalera»). El sondeo solo leía la rejilla, donde solo hay aire; y la prueba daba verde porque su mundo de juguete solo montaba bloques de rejilla — el punto ciego exacto. Arreglado con `claveFinaEn`/`materialEn` (las dos vías) + **barrido** de un voxel fino en vez de un punto suelto (un panel de 1/16 de grosor casi nunca cae bajo un punto), y la identidad del flanco de `alPisar` pasa a ser **celda + clave** (una placa fina no cambia la celda de debajo al caer sobre ella). El mundo de juguete gana estructuras finas de verdad (bits+fdim+`mcStructColl`, colisión fina calcada). **(4) Y con la escalera ya detectada, el dueño reportó que subía «solo por los laterales, no por los escalones», y que con S «a veces no se libera, se queda pegado».** Las dos cosas tenían causa propia. Lo primero: `escalera.json` es una escalera **de verdad** —largueros en los bordes y peldaños solo en 2 de cada 4 filas—, o sea que **a la altura del pecho casi siempre hay aire**; sondear una altura fija solo agarraba los largueros. Ahora `trepableEnColumna` barre **toda la columna del cuerpo**, de los pies a la cabeza, así que la **forma del dibujo deja de importar** (que es justo lo que pedía el dueño: «tenga la forma que tenga debería ser trepable»); de paso arregla el coronar, porque sondeando solo al pecho el agarre se perdía con los pies 0,9 por debajo del remate, más de lo que sube el auto-escalón (0,6). Lo segundo era **defecto mío**: la anulación del retroceso corría **antes** de la salida temprana, así que se aplicaba también con el jugador ya de pie en el suelo — pegado para siempre. Ahora solo corre **mientras se está colgado**, y en cuanto hay suelo debajo se suelta el agarre entero. Añadida además una salida de emergencia con **espacio**: estando agarrado `mc.onGround` es `false`, o sea que el salto de `app.js` no podía dispararse **nunca**, y hay que reproducirlo en el snippet (por flanco, para no reimpulsar). **Dos verdes que eran mentira del mundo de juguete**, cazadas al depurar esto: la placa de prueba es un bloque **macizo** de la rejilla dos celdas por detrás de la escalera, o sea un **muro** que frenaba el retroceso a 0,36 (→ opción `sinPlaca`); y el test de coronar medía la cota **final** tras 600 frames, cuando al coronar el panel no hay rellano y el jugador sigue andando hasta salirse del mundo de 24 de ancho y caer a y=−173 (→ se mide la cota **máxima**). `node test_bloques_comportamiento.js` → **38 ok, 0 fallos**; suite completa **227 ok, 0 fallos** en 14 ficheros (incluido `test_navegador.js`, que abre el Mundo de verdad y confirma que el hook nuevo no lo rompe). Pendiente: verificación en navegador (recargar → 🌍 Mundo → `game.bloques.info()` sobre la escalera; **fps con DevTools cerrado**).
- 2026-07-23 · ✨ **REQ-MC · colores alpha (translúcidos) y emisivos (que brillan) para los `#hex`**. El usuario quería «usar colores alpha y colores que emitan luz, algo sencillo que no cargue el motor». **Codificación** (retrocompatible, un solo string, elegida con el usuario): `#rrggbb` = opaco iluminado (como siempre); `#rrggbbaa` = translúcido; prefijo `*` = emisivo (`*#rrggbb` / `*#rrggbbaa`). Helpers nuevos junto a `paintValue`: `isGlow`/`bareColor`/`hex6`/`colorAlpha`/`alphaHex`; `paintValue` compone el valor desde `state.color` (base) + `state.alpha` + `state.emit`. **Autoría** (dos vías, como pidió): panel de Paleta (slider **Opacidad** + botón **✨ Emisivo**, con `syncColor`) y consola F12 (`game.paintAlpha(0.5)`, `game.paintGlow(true)`). El cuentagotas (`pickColorTool`) recupera alpha+emisivo del voxel. **Render en el Mundo (barato, sin bajar fps)**: solo afecta al camino de color por vértice de estructuras (`MC_STRUCT`), terreno y `tex:` intactos. *Emisivo* = flag por vértice `aEmit` → el FS hace `mix(color*shade, color, emit)` y anula la niebla (`f*(1-emit)`): a pleno brillo, coste ~0 en GPU, sin draw-call extra. *Alpha* = la malla fina se parte en dos VBO (opaco + translúcido); el translúcido se dibuja en **una sola pasada con blend** (`SRC_ALPHA`, `depthMask(false)`, sin ordenar → order-independent, apto pixel-art) DESPUÉS de todo lo opaco. Vértice de estructura unificado a 9 floats `x,y,z,r,g,b,shade,emit,alpha` (era 7); `mcStructAttrib` centraliza los punteros; el greedy no fusiona colores/emit/alpha distintos (van en el `id`). Los parsers de la vista 2D/3D/iso (`shade`, `col32`, `shadeBelow`, `voxFill`, `computeTexRepr`, horneado de textura) se blindaron para tolerar `*` y `#rrggbbaa`. `node --check app.js` OK + tests de codificación (paint/colorAlpha/hex6/mcHexRGB) OK; index.html servido con el markup nuevo. Pendiente verificación visual (hard-refresh → «Mundo», estampar una sala con vidrio/emisivo; **fps con DevTools cerrado**).
- 2026-07-23 · 🔎 **REQ-MC · rayos-X también etiqueta las estructuras finas**. La capa naranja de rayos-X ya dibujaba la caja de cada estructura, pero `mcUpdateXrayLabels` solo recorría `mc.grid` → los objetos/salas (cristal, llama…) no llevaban etiqueta de coord+clave como los bloques. Refactor: la proyección se extrae a un `emit(wx,wy,wz,coords,mat,isStruct)` (reusa el pool `mcXlbls`), un primer pase recorre los bloques del entorno y un segundo pase recorre `mc.structures` cercanas (centro de su AABB), etiquetando con la **celda de origen** y la **clave cruda** (`hab:cristal`, `asset:…`) — igual que los bloques muestran `hab:tejado`. Las etiquetas de estructura llevan la clase `.mc-xlbl-struct` (fondo naranja, a juego con su caja de rayos-X) para distinguirlas del rojo de los bloques. `node --check app.js` OK; CSS servido.
- 2026-07-23 · 🎯 **REQ-MC · fix: los objetos (llama) se estampaban pegados a una esquina, no centrados como en el editor**. `mcStructGeom` normalizaba el contenido restando el **mínimo del contenido** (llama en x4..14/z5..9 → se desplazaba a x0..10/z0..4 → esquina de la celda), aunque en el editor 2D la base está centrada en la rejilla 16×16. Fix: normalizar al **origen de la CELDA que contiene el mínimo** (`floor(min/16)*16`), no al mínimo del contenido → quita solo el desplazamiento de celdas enteras (la huella sigue empezando en la celda 0) pero **conserva la posición dentro del 16³**, así un objeto centrado queda centrado sobre la celda destino; para salas (autoradas desde 0) es un no-op. La caja de rotación se redondea a múltiplos de 16 (celda entera) → un objeto centrado gira sobre el centro de su celda sin irse. La geometría fina se recacha por (srcKey,rot); recargar «Mundo» aplica el nuevo centrado (las instancias ya colocadas se re-centran dentro de su misma celda, sin cruzar límites). `node --check app.js` OK.
- 2026-07-23 · 🧲 **REQ-MC · fix: pegar bloques/estructuras a las caras de una ESTRUCTURA fina (cristal, llama…)**. El usuario: «estaba mejor antes; lo único que no podía era pegar ese tipo de objetos entre sí». Un habitante calado/con forma (cristal 584 vox, llama 191 vox) se estampa como **estructura fina** (malla real, se ve bien) que vive FUERA de `mc.grid`. `mcBreak` ya marchaba fino contra estructuras, pero `mcPlace` trazaba con `mcRaycast` que solo prueba `mcSolid` (rejilla del terreno) → apuntar a la cara de una estructura no daba superficie donde anclar (solo pegabas donde había terreno detrás; nada en el aire ni encima). Fix SIN tocar el render: `mcRaycast(maxd, hitStruct)` — con `hitStruct` una celda de bloque también cuenta como sólida si una estructura fina la ocupa (`mcStructCellSolid`, que reusa `mcFineBoxHit` con recorte por AABB → barato). `mcPlace` y los dos caminos de vista-previa/fantasma (`mcUpdatePreview`, overlay de `mcDrawOverlays`) pasan `hitStruct:true` ⇒ apuntas a la cara de un cristal/llama y colocas (bloque O estructura) en la celda vacía adyacente; el fantasma verde aparece ahí, lo que ves = lo que colocas. `mcCollides` (que ya conoce las estructuras finas) evita encajonar. Paint/nota/`game.aim` siguen solo-terreno. **Descartado** el intento previo de reclasificar texturas caladas como bloques de rejilla: rompía el render (llamas → siluetas planas; caras de cristal culleadas dejaban ver a través) — el usuario confirmó que la malla fina se veía mejor. `node --check app.js` OK; pendiente verificación visual (hard-refresh + «Mundo»).
- 2026-07-23 · 🧭 **REQ-MC · fix orientación de `hab:tejado` (tejas salían rotadas 90°)**. Un material `hab:` direccional se autora por cara, pero la orientación final depende de 3 capas: `buildTexFaces` (bobinado NO homogéneo de `CUBE_FACES` → `du`=col, `dv`=fila por cara), el mapeo `MC_FACES[f].tex` (cara-mundo→lienzo del asset; **world +Y = asset +Z** por el swap `world=(ax,az,ay)`) y el UV del mesher (`uv=[[u0,v0]…]`, fila0=arriba del lienzo). Yo había pintado las hiladas a lo largo de **asset-Y** en los planos laterales → en el mundo salían como rayas verticales. Fix: en los planos laterales del 16³ (asset x=0/15 e y=0/15) la hilada avanza a lo largo de **asset-Z** (= arriba del mundo); los planos z=0/15 (cara superior/inferior del bloque) llevan rejilla de tejas en (x,y). Verificado con un **simulador Python exacto** (replica buildTexFaces+MC_FACES+UV, ASCII por cara): las 4 caras laterales dan hiladas horizontales. Republicado `hab:tejado`. Recargar «Mundo» (getTexDef cachea; el fetch fresco al recargar lo recoge).
- 2026-07-23 · 🗒️ **REQ-MC · procesadas las 4 notas post-it del Mundo** (agua, tejado, escalera de cristal + 1 informativa). Los `tex:hab:*` NO se embeben en `mundo.json` → se cargan de la galería al hornear (`getTexDef`→`/api/habitantes/<id>`), así que basta crear el material en la galería y referenciarlo en los voxels. **Materiales nuevos** (POST `/api/habitantes`, `meta.type:'textura'`, 16³): `hab:agua` y `hab:agua-profunda` (agua rizada maciza), `hab:tejado` (tejas de terracota con juntas/brillos), `hab:cristal` (**calado**: solo marco+cruceros+brillo diagonal, el resto voxels vacíos → el proyector de caras da alpha 0 y el shader del terreno lo **descarta** → cristal que se ve a través de verdad). **Edición del mundo** (atómica + respaldo a papelera, calca `server.py`): nota 1 `74,14,11` → `tex:hab:agua`; nota 2 `63,16,27` (tierra) → `tex:hab:tejado`; nota 3 → **escalera de caracol de cristal** en (39,53), 75 bloques, y15..37, radio 3, 12 peldaños/vuelta, columna central + rellano 3×3. Nota 0 (obsidiana) era informativa. Las 4 notas conservan su texto + `[PROCESADA]` con lo hecho. Recordatorio de motor: el Mundo **rechaza `#hex`** (`app.js:5044`) y **no hay alpha en `#hex`** (huecos = transparencia). Pendiente: verificación visual en navegador (recargar «Mundo»).
- 2026-07-23 · 🎆 **REQ-MC · «Explosion TNT» ANIMADA (solo editando el snippet, sin tocar el motor)**. El usuario pedía «vidilla» en la explosión: la versión anterior reventaba todos los bloques en un único triple-bucle síncrono → aparecía el cráter entero de golpe. Reescrito `throwAndExplodeTNT` **solo con la API existente** (`getVoxel`/`setVoxel`/`beginBatch`/`endBatch`/`game.aim`/`game.onKey`), 0 cambios en `app.js`/motor. Diseño: `executeSphericalExplosion` **precalcula** los bloques a destruir y los agrupa por **anillo** = `floor(distancia)` al centro (misma física de impacto: cerca siempre revienta, lejos probabilístico). Luego anima **un anillo por fotograma** con un `setTimeout(waveMs=45)` por anillo; cada fotograma es **un** `beginBatch()…endBatch()` = un solo re-mallado visible. El anillo actual se pinta como **frente de fuego** (`fireMat='likelava'`) y el anterior se apaga a aire → el cráter se forma **detrás** de la onda que avanza; barrido final apaga el fuego restante. Ligado a la tecla **T** apuntando con la mira (`throwAndExplodeTNT(...game.aim(), {radius:8, ...})`). `tntMat` por defecto pasa a `'roca'` (material real de paleta) para no disparar el aviso de «material desconocido» del viejo `'tnt_active'`. Cambio **solo en el JSON del snippet** (`data/snippets/explosion-tnt.json`, gitignoreado): escritura atómica (temp+fsync+`os.replace`) y respaldo del anterior en `data/habitantes_trash/<ms>__explosion-tnt.json`; `node --check` del JS OK. Pendiente: verificación visual en navegador (reabrir el snippet, ejecutarlo para registrar la tecla T, y pulsar T apuntando en el Mundo).
- 2026-07-23 · 🏷️ **REQ-MC · rayos-X muestra el NOMBRE del material bajo las coordenadas**. Para poder elegir el `tntMat` (u otro material de script) sin adivinar, cada etiqueta de rayos-X pasa a tener dos líneas: `x,y,z` y debajo el nombre del material (`.mc-xlbl-mat`, ámbar). El nombre sale de `mcMatName(id)`: reverse `name2id` (id→nombre de paleta, exactamente lo que acepta `setVoxel`/`tntMat`) cacheado por tamaño de paleta (`mcXnameCache`); si no hay nombre, acorta la clave (`asset:assets/roca.vox.json`→`roca`, `hab:like-water`→`like-water`). El pool de nodos ahora crea dos `<span>` por etiqueta (`_c`/`_m`) y solo reescribe `textContent` si cambió (sin coste extra por frame). CSS: `.mc-xlbl` pasa a columna centrada. `node --check app.js` OK.
- 2026-07-23 · ⌨️ **REQ-MC · `game.onKey(tecla, fn)`: ligar teclas a scripts en el Mundo**. Hook para disparar código con una tecla sin pelearse con `addEventListener` (acumula listeners al re-ejecutar el snippet) ni con el pointer-lock. Registro `mcUserKeys` (tecla→fn) que consulta el keydown del Mundo justo antes del bloque de movimiento (`MC_KEYS`): si hay handler de usuario, lo llama (try/catch), `preventDefault` y `return`. Re-registrar reemplaza (no acumula); `game.onKey('t', null)` quita; `game.keys()` lista. `MC_RESERVED` (WASD/espacio/shift/1-9/p/b/x/u/n/r/z/Esc) no se puede re-ligar (protege los controles). Solo actúa con el Mundo activo (es el mismo handler que ya sale temprano si no `mc.active` o hay picker/nota abiertos). Uso: `game.onKey('t', ()=> throwAndExplodeTNT(...game.aim(), {radius:8}))`. `node --check app.js` OK.
- 2026-07-23 · 🎯 **REQ-MC · `game.aim()`: coordenadas del bloque apuntado por la mira (para scripts)**. Nuevo helper `game.aim([alcance])` que hace `mcRaycast` desde el ojo en la dirección de mirada y devuelve `[x,y,z]` del primer sólido bajo el crosshair — pensado para el spread `throwAndExplodeTNT(...game.aim(), {radius:8})`. Alcance por defecto 64 bloques (más largo que romper/poner, para apuntar a paredes lejanas). Si no hay sólido en el alcance, proyecta la mira al aire a `alcance` bloques (así el spread nunca rompe con `null`); solo devuelve `null` (con aviso) si el Mundo no está abierto. Reutiliza `mcRaycast`/`MC_EYE`/`mc.scale`. `node --check app.js` OK.
- 2026-07-23 · 💥 **REQ-MC · API de scripting para snippets: `getVoxel` + `beginBatch`/`endBatch` (contrato para «Explosion TNT»)**. Faltaban los helpers de lectura y de renderizado diferido que un script complejo (una explosión) necesita. Añadidos y expuestos en `window.*`+`game.*` junto a `setVoxel` (los snippets corren con `new Function` en ámbito global → ven `window.*`, NO el `const getVoxel` léxico del editor). **`getVoxel(x,y,z)`** (`mcGetVoxel`) redondea, comprueba límites y devuelve el **id de material** del bloque (>0, reutilizable tal cual en `setVoxel`) o **`0` = aire** (también fuera del mundo). **`beginBatch()`/`endBatch()`** (`mcBeginBatch`/`mcEndBatch`, anidables por contador `mcBatchDepth`): entre ambos `setVoxel` solo escribe la rejilla densa (bandera `mc.batching` corta el `setTimeout(mcFlushBuild,80)` por bloque); `endBatch` re-malla TODOS los chunks tocados de una vez + guarda. Además `mcResolveMat` ahora trata `0`/`null`/`undefined`/`false`/`'air'`/`'aire'`/`''` como **aire (id 0)** → `setVoxel(x,y,z,0)` **rompe** el bloque (antes lo convertía en roca con aviso), imprescindible para que la explosión destruya. Flujo destino: `beginBatch()` → bucle con `getVoxel`/`setVoxel(...,0)` → `endBatch()` (un solo re-mallado). `node --check app.js` OK. Pendiente: verificación visual en navegador (hard-refresh) ejecutando el snippet «Explosion TNT».
- 2026-07-23 · 🐞 **REQ-MC · fix: `getVoxel` en snippets leía el grid vacío del editor (explosión destruía 0 bloques)**. Síntoma: «Explosion TNT» apuntada a roca sólida real (confirmada por las etiquetas de rayos-X) reportaba `Bloques destruidos: 0`. Causa = **sombreado léxico de JS**: `getVoxel` es un `const` de nivel superior (app.js:182, lector del `state.voxels` del EDITOR); un `const`/`let` global vive en el entorno léxico global y **sombrea a `window.getVoxel`** para TODO el ámbito global (consola y snippets con `new Function`). Así que exponer `window.getVoxel=mcGetVoxel` no servía de nada: los scripts seguían llamando al `getVoxel` del editor, que en el Mundo lee un grid de asset vacío → aire en todas partes → 0 destruidos. (`setVoxel` NO sufría esto porque es una `function` en `window`, reasignable a `mcSetVoxel`; por eso colocar el bloque de TNT sí funcionaba.) Fix: el `const getVoxel` **delega en `mcGetVoxel`** cuando `mc.active && mc.grid` (Mundo) y mantiene `state.voxels` en el editor; se retira `window.getVoxel` (inútil por el sombreado). `beginBatch`/`endBatch` no tienen ese problema (no hay binding léxico homónimo → `window.*` gana). `node --check app.js` OK. Nota aparte: el material `'tnt_active'` del snippet no existe en la paleta → cae en roca con aviso; no es un bug del motor (usar un nombre de la paleta o `game.addMaterial`).
- 2026-07-22 · 🧩 **REQ-MC · gestor de snippets de código («editor chulo estilo Minecraft»)**. Nueva pestaña 🧩 **Código** que abre `#snip-modal`: lista lateral de snippets guardados + editor con nombre, textarea de código (`#snip-code`, tabulador = 2 espacios, Ctrl+S guarda, Ctrl+Enter ejecuta) y botones Guardar/Ejecutar/Borrar, todo con CSS `.snip-*` al estilo bloque pixel-art. Persisten en el servidor: `server.py` gana `/api/snippets` (GET lista, GET `/<id>` uno, POST crea/guarda, DELETE) → `data/snippets/<id>.json` (`{id,name,code,savedAt}`) con `atomic_dump` + `to_trash` (nada se borra de verdad, va a papelera), gemelo del patrón `/api/habitantes`. `snipRun` ejecuta el código con `new Function(code)()` en ámbito global (ve `setVoxel`/`game`), auto-abriendo el Mundo si hace falta. Sembrado el snippet `pir-mide-maya` (script `buildMayanPyramid` que usa el helper global `setVoxel`). `node --check app.js` OK, `ast.parse(server.py)` OK, `/api/snippets` probado por curl (POST/LIST/GET/DELETE). `data/` gitignoreado → los snippets no se comitean. Pendiente: verificación visual en navegador con **hard-refresh y el servidor reiniciado** para que sirva las rutas nuevas.
- 2026-07-22 · 🛟 **RECUPERACIÓN + escritura atómica del servidor**. El `mundo.json` se corrompió (JSON truncado → mundo vacío al recargar): `server.py` es multihilo (`ThreadingMixIn`) y guardaba con `open('w')` NO atómico, así que los POST de autoguardado solapados de ~5MB (resize + re-estampado) se pisaban y truncaban el fichero. Restaurado desde el respaldo íntegro más reciente en `data/habitantes_trash/<ms>__mundo.json` (100×40×100, 113 156 vox, 12 estructuras; el corrupto preservado como `mundo.json.corrupt-<ts>`). Raíz arreglada: nueva `atomic_dump()` (temp en el mismo dir + `fsync` + `os.replace`, atómico POSIX) en las 5 escrituras JSON (mundo/mapa/habitantes) → dos guardados solapados ya no truncan, gana el último write completo. `ast.parse` OK, servidor reiniciado, `/api/mundo` 200.
- 2026-07-22 · 🦙 **REQ-MC · objetos pequeños se estampan como voxeles reales, no como bloque 16³** (usuario: un objeto guardado —llama 191 vox— salía «raro» en el Mundo: silueta plana con cielo colándose, y ni greedy ni structTextures lo cambiaban). Causa: la decisión bloque-vs-estructura de `mcAssignSlot` era `w>1||h>1||d>1` medida en **bloques de mundo (÷16)**, así que cualquier objeto que cabe en <1 bloque se forzaba a **bloque suelto** y se renderizaba proyectando su silueta en las 6 caras de un cubo (con huecos → fondo). Fix (3): (1) regla por **relleno** — solo un 16³ MACIZO completo (`nvox≥16³`, p.ej. hierba/roca=4096) es bloque; lo demás va como estructura fina con voxeles reales (`mcStructCells` calcula `blockLike`). (2) `mcStructGeom` **normaliza el contenido a (0,0,0)** (el llama vivía en x4..14,z5..9 de su caja) → se estampa pegado a la mira y la colisión cuadra. (3) `slotStruct` se **recalcula al cargar** desde la clave (corrige loadouts viejos guardados como bloque). Verificado por el usuario en navegador. `node --check` OK.
- 2026-07-22 · 📐 **REQ-MC · resizeWorld centrado + admite cadena "AxBxC"**. `game.resizeWorld("90x40x90")` no hacía nada (esperaba 3 números; la cadena → NaN → dims sin cambio): ahora si el 1er arg es cadena la parte por `x/×/X/*/,`/espacios. Y el redimensionado pasa a ser **centrado en XZ** (antes anclaba en el origen y «se comía dos esquinas» al reducir): calcula `dx=⌊(nx−old.x)/2⌋`, `dz` análogo, y desplaza terreno, **estructuras** (ox/oz + `mcRestampAll`), spawn y jugador; la vertical sigue anclada al suelo. `node --check` OK.
- 2026-07-22 · 🟨 **PERF-MC1 (greedy meshing de estructuras)** implementado. `mcStructGeom` deja de emitir una cara por voxel: por cada cara construye la mascara de la capa (celdas solidas + expuestas + material) y fusiona rectangulos maximales del mismo material (greedy). Textura sin subdividir ni estirar: shader nuevo `mc.stexProg` (aPos/aTile/aRect/aShade, stride 10, `highp`) que **repite el tile por voxel** con `fract(aTile)` sobre el rect del atlas -> una pared de N voxeles muestra N copias del tile (detalle identico) con geometria de un puñado de quads. Los `#hex` se fusionan por color+cara (`mc.structProg`, stride 7). `mcBuildStructMesh` sube el stream texturado a stride 10; `mcRender`/`mcDrawPreview` (pasada 2) usan `mc.stexProg`. Switch `game.structGreedy` (def true, persiste `vf_mcStructGreedy`, re-malla en vivo con `mcRestampAll`); false = una cara por voxel con el MISMO shader (identico al render actual) -> escape seguro, el VBO nunca se descuadra. `node --check` OK; **falta verificacion visual en navegador**.
- 2026-07-22 · 🔀 **REQ-MC · chunks del terreno ordenados front-to-back** (sugerencia de Fable, complemento del early-z ya montado). `mcRender` recolecta los chunks que pasan distancia+frustum en un scratch reutilizado (`mc._visChunks`, sin GC por frame), les calcula la distancia² horizontal al jugador y los ordena **cercano→lejano** antes de dibujar. Así el terreno próximo escribe profundidad primero y el early-z (shader opaco sin `discard`) rechaza los fragmentos tapados de detrás **antes** de sombrearlos → menos overdraw. Coste: un `sort` de un par de cientos de elementos, despreciable; **cero cambio visual** (compatible con el look pixel-art). Verificado: el cielo ya era solo `gl.clear` (sin quad/skybox) y no hay geometría translúcida en el pase opaco (el único BLEND son fantasma/preview, al final con depthMask off) — ambos ya óptimos. `node --check` OK.
- 2026-07-22 · ↩️ **REQ-MC · revertidos los mipmaps + el suavizado de renderScale** (usuario: «se ha perdido todo el encanto pixelart»). Los mipmaps/anisotropía suavizaban el terreno a distancia y el `image-rendering:auto` al reducir `renderScale` emborronaba la ampliación → adiós look pixel-art. Vuelto todo a `NEAREST` puro en `mcUploadAtlas` (sin mipmaps ni aniso) y el canvas se queda SIEMPRE `pixelated` (CSS) también con `renderScale<1` (píxeles grandes y nítidos al ampliar, no borrosos). Se acepta el aliasing/shimmer a cambio de conservar el encanto. `game.renderScale` y el early-z se MANTIENEN (no afectan al look; el early-z es invisible). `node --check` OK.
- 2026-07-22 · 📝 **REQ-MC · Ola C · t1 notas post-it sobre un bloque + t6 descartado**. **t1** (usuario: «notas post-it en un bloque»): estado `mc.notes` (`"x,y,z"→texto`, ≤280) + `mc.noteCell`. **Tecla N** apunta con `mcRaycast(mcReach())` al bloque y abre `#mc-note` (editor: textarea + Guardar/Cancelar/Borrar; suelta el pointer-lock para escribir, `Ctrl+Enter` guarda, Esc cierra antes que el selector); guardar en blanco borra la nota. Cada bloque anotado muestra un **marcador flotante** (relleno en `mcDrawOverlays`, ocluido por muros, opacidad `game.noteAlpha`/`vf_mcNoteAlpha` def 0.85) y, al mirarlo, `mcUpdateNoteView` pinta su texto en el visor `#mc-noteview` junto a la mira. Persiste en `mundo.json`: `mcSerialize` añade `notes:{…}` (el servidor lo vuelca verbatim, solo valida `voxels`+`dim`), `mcBake` lo re-hornea filtrando pares válidos dentro de los límites, y `mcResizeWorld` desplaza las claves con `dx/dz` (descarta las que caen fuera). `noteAlpha` entra en `game.dumpVars()`. Una nota sobre un bloque que se rompe se conserva (es del bloque, no exige sólido). **t6** (tecla C: bloque en el aire a la altura del suelo) **descartado**: el modo «big» (`game.playerScale`, tecla b) ya cubre puentes/estructuras lejanas. `node --check` OK (GL/UI → verificación visual).
- 2026-07-22 · 🖼️ **REQ-MC · mipmaps en el atlas del terreno** (usuario: «al bajar renderScale la calidad se vuelve muy pobre»). La causa era aliasing por minificación: el atlas se filtraba con `NEAREST` sin mipmaps, así que el terreno lejano/rasante (más aún al reducir la resolución de render) parpadeaba/ruidaba. `mcUploadAtlas` ahora, en WebGL2, genera mipmaps con **`NEAREST_MIPMAP_LINEAR`** (NEAREST dentro del nivel → sin mezcla horizontal entre caras del atlas, sin costuras, look pixel-art; interpola ENTRE niveles → mata el shimmer), `MAG NEAREST` (nítido de cerca) y **`TEXTURE_MAX_LEVEL=4`** (2⁴=MC_TILE=16 ⇒ las fronteras de tile caen en la rejilla del mip → sin sangrado de color entre caras/bloques). Anisotropía `EXT_texture_filter_anisotropic` (×8) para el suelo en rasante. En WebGL1 (atlas NPOT) se queda en NEAREST. Solo el atlas del TERRENO; el de estructuras sigue NEAREST (tiene alpha/huecos). Resultado: renderScale más bajo se ve mucho más limpio. `node --check` OK.
- 2026-07-22 · ⚡ **REQ-MC · rendimiento del Mundo = fill-rate, no geometría** (usuario: «con renderDist=1 y fov=30 sigo sin llegar a 60fps; playerScale=3 → 25fps»). Diagnóstico: el canvas se pinta a `clientWidth·dpr` (`mcResize`), hasta ~8 Mpx en Retina a pantalla completa; `renderDist`/`fov` recortan triángulos pero **no píxeles**, y `playerScale` alto (ojo más alto) llena más pantalla de terreno texturizado → más fragmentos. Dos arreglos: **(1) `game.renderScale`** (0.25..1, def 1, `vf_mcRScale`): multiplica la resolución interna en `mcResize` (0.7 ≈ mitad de píxeles) y reescala a pantalla con filtrado suave (`imageRendering:auto` si <1, `pixelated` si nativa) → sube fps sin tocar geometría, pase lo que pase. **(2) early-z**: el `discard` del shader del terreno (`MC_FS`) desactivaba el early depth-test → overdraw. Nuevo `MC_FS_OPAQUE` (gemelo **sin** `discard`) + `mc.progOpaque`/`mc.locOpaque`; `mcBuildPalette` detecta si el atlas tiene texels translúcidos (`mc.atlasHasAlpha`, un `getImageData` en la construcción del atlas) y `mcRender` usa el shader opaco cuando NO hay alpha (hierba/tierra/roca…) → early-z rechaza los ocultos. El 2º pase (estructuras texturadas) y `mcDrawPreview` usan SIEMPRE `mc.prog` (alpha-test) porque su atlas tiene huecos; se hicieron autónomos en sus uniformes. `game.renderScale` entra en `game.dumpVars()`. `node --check` OK (GL/GLSL → verificación visual).
- 2026-07-22 · 🎚️ **REQ-MC · defaults del código = valores afinados en F12** (vía `game.dumpVars()`). El usuario volcó sus tunables y confirmó fijar los 8 que diferían como nuevos defaults (solo afecta a usuario nuevo / `localStorage` limpio; los suyos ya persisten): `nearClip` 32→**40**, `perspStrength` 3.4→**10**, `playFill` 1.8→**0.8**, `reach` 6→**16**, `ghostAlpha` 0.6→**0** (fantasma de colocación invisible por defecto, elección del usuario), `structGhostAlpha` 0.5→**1**, `playerSpeed` 5.2→**10**, `interiorDark` 0.55→**0.08** (interiores casi negros). Actualizado el default inicial Y el fallback del setter (revertir con entrada inválida) de cada uno para que queden coherentes. `yaw`/`pitch` (orientación viva de la cámara) NO se fijan. `node --check` OK.
- 2026-07-22 · 🔧 **REQ-MC · `game.dumpVars()`** (usuario: «estaría bien un `game.dumpVars()` para volcar las variables que estoy cambiando desde el inspector F12 y así las usas como valores por defecto; ahora mismo `game` muestra las funciones/prototipos»). Los tunables están expuestos como accesores (`Object.defineProperty` con get/set) ⇒ el inspector pinta `game` como `(...)`/`ƒ` y no se leen sus valores. Nuevo **`game.dumpVars()`** (junto a `game.resizeWorld`, app.js) recorre la lista de tunables *de valor* y lee cada **getter** (fuente única, ya redondeado/clampeado como se muestra) a un objeto plano: `nearClip, perspStrength, playFill, playZoom, playLift` (edición 3D/jugar) + `fov, renderDist, mouseSpeed, yaw, pitch, hotbarHide, reach, ghostAlpha, structGhostAlpha, playerSpeed, playerScale, playerTool, structTextures, interiorDark, worldSize` (Mundo). `showFPS`/`showVoxels` se resuelven a su booleano subyacente (sus getters devuelven la función invocable). Vuelca con `console.table` + `console.log(JSON.stringify(...,null,2))` (copiable como literal) y **devuelve** el objeto. `node --check` OK.
- 2026-07-22 · 🌍 **REQ-MC · Ola C · t7 penumbra automática de interiores + t8 límites del mundo en vivo**.
  **t7** (usuario: «iluminación interior más oscura, pasillos, automática»; seguimientos: «más oscuro cuantas más capas haya por encima», «bajo estructuras externas hay zonas negras confusas — es superficie», «en un túnel hay bandas de luz a media altura», «una figura flotante deja sombra oscura en el suelo lejano»). Los dos primeros intentos (grosor de tierra encima) daban el mismo N a «enterrado» y a «torre alta en superficie» ⇒ mal. **Rehecho como SKYLIGHT** (modelo correcto, tipo Minecraft): **`mcComputeLight()`** difunde la luz del cielo por el aire → `mc.light` (Uint8Array 0..`MC_MAXLIGHT`=15): reciben 15 el aire abierto por arriba (cada columna hasta topar con sólido) **y el de las 4 caras laterales del mundo** (el vacío del borde también es cielo → seguimiento del usuario: «una ventana al vacío debería dejar entrar luz»), y luego se propaga a los 6 vecinos de aire perdiendo 1 por paso (buckets por nivel, cada celda se fija una vez). En `mcMeshChunk` la sombra de cada cara se atenúa por `lightLut[luz del hueco de aire vecino]` = `interiorDark^((15-lv)/15)` (mapeo **exponencial** en el déficit de luz; seguimiento del usuario: «interiorDark 0 no basta para salas que deberían estar más oscuras» — el mapeo lineal previo dejaba las salas iluminadas por una puerta en ~`lv/15`, nunca negras): **plena luz junto a una boca / a cielo abierto** (lv=15 → 1), y cada nivel de menos luz multiplica más por `interiorDark`, de modo que **`interiorDark=0` apaga hasta negro el interior de una sala** (no solo el fondo con luz 0); el default 0.55 queda casi como el lineal. Al basarse en la LUZ real: (1) el túnel se ilumina desde sus bocas, sin bandas por el grosor del techo; (2) el suelo bajo una figura flotante queda claro (la luz entra de lado, `-1`/bloque). `mcComputeLight` corre en `mcMeshAll` (carga/resize/cambio de mando) y en `mcRemeshAround` (una edición reabre/tapa el paso de luz) — ahí se re-malla el vecindario **3×3** de chunks para no dejar costuras de sombra. Tunable **`game.interiorDark`** (0..1, `vf_mcInteriorDark`; 1 = desactivado; más bajo = fondos más oscuros) re-malla en vivo. **Alcance: solo terreno** (las estructuras no bloquean el skylight; conservan su sombreado del editor). **t8** (usuario: «límites del mundo modificables en vivo»): **`mcResizeWorld(nx,ny,nz)`** reasigna la rejilla densa `Uint16Array` conservando los bloques anclados en el origen (región solapada), **libera las VBO de todos los chunks** + vacía `mc.chunks`, recoloca spawn/jugador dentro de los nuevos límites, re-malla entero (`mcMeshAll`), `mcUnstick` y `mcScheduleSave`. Clamps x/z **16..512**, y **8..256**. Expuesto por consola: **`game.worldSize`** (lectura `'96×40×96'`) y **`game.resizeWorld(x,y,z)`** (redimensiona + toast). Las estructuras estampadas mantienen sus coords de mundo; el nuevo `dim` viaja en el guardado del servidor (`mcSerialize`/`mcBake` ya lo llevan) ⇒ persiste al recargar. `node --check` OK.
- 2026-07-22 · 🌍 **REQ-MC · Ola B · t4 deshacer/rehacer (z / Z) + t12 indicador de carga del Mundo**.
  **t4**: historial de edición en `mc.hist`/`mc.histRedo` (cap 200). Cada mutación registra su inverso vía `mcPushHist`: bloques `{t:'b',x,y,z,before,after}` (romper=after 0, poner=before 0, pintar=before→after) en `mcBreak`/`mcPlace`/`mcPaint`; estructuras `{t:'s+'|'s-',sp:{key,ox,oy,oz,rot}}` en `mcStampStruct` (solo `!quiet`) / `mcBreak`→`mcRemoveStruct`. **`mcApplyHist(en,forward)`** reproduce (forward) o invierte una entrada —bloque: `mcSetBlock`+`mcRemeshAround`; estructura: estampar `mcStampStruct(...,quiet)` o localizar por `mcFindStruct` y `mcRemoveStruct(s,quiet)`— con `mc.histLock` para no re-registrar y `mc.histBusy` para no solapar (async por el estampado). **z** = deshacer, **Z (shift)** = rehacer (keydown del Mundo; toast «Deshecho/Rehecho/Nada que…»). `mcRemoveStruct` gana parámetro `quiet` (sin toast/save en undo). `mcClearStructures` vacía el historial al (re)generar el mundo. **t12**: overlay `#mc-loading` (spinner CSS + `#mc-loading-text`, fondo cielo) en `#mc-modal`; `openWorld` lo muestra por fases («Cargando mundo…»→«Preparando bloques…»→«Construyendo/Generando…») con **`mcYield()`** (2 rAF) antes del trabajo síncrono para que el navegador lo pinte, y lo oculta tras hornear el terreno (las estructuras siguen apareciendo async). Solo en la 1ª entrada (`!mc.grid`); reabrir es instantáneo. `node --check` OK.
- 2026-07-22 · 🌍 **REQ-MC · la hotbar se oculta en carrera y reemerge al pararse + mover el ratón** (usuario: «si se recorre bastante distancia sin dibujar, la barra de ranuras debería desaparecer poco a poco hacia abajo desvaneciéndose —modo ocultación en carrera—; si el jugador se detiene y mueve el ratón, debería emerger de nuevo desde abajo, transparente, hasta su sitio»). Estado en `mc`: `hotbarShown` (0..1, animado), `hbTarget` (0/1), `hbRunDist` (distancia acumulada). **`mcUpdateHotbar(dt)`** (en `mcTick`): mientras la velocidad horizontal >0.6 acumula `hbRunDist`; al pasar **`game.hotbarHide`** (bloques, def **14**, `vf_mcHotbarHide`; **0** desactiva) pone `hbTarget=0`; interpola `hotbarShown` hacia el objetivo (~7/s) y lo vuelca al nodo `#mc-hotbar` como `translateX(-50%) translateY((1-s)·(alto+24)px)` + `opacity=s` (+`pointer-events:none` cuando casi invisible), preservando el centrado. **`mcRevealHotbar()`** (target=1, dist=0) la trae de vuelta: al **dibujar/romper** (`mcDoAction`), **colocar/estampar** (`mcPlace`), **cambiar de ranura** (`mcSelectSlot`) y al **mover el ratón estando parado** (mousemove con `|vel|<0.6`). Arranca visible en `openWorld`. `node --check` OK.
- 2026-07-22 · 🌍 **REQ-MC · elegir un bloque en el selector devuelve el foco (pointer-lock) al juego** (usuario: «con Alt+1 elijo un bloque de la galería y al elegirlo el ratón ha perdido el foco del juego; debería recuperarlo»). Al abrir el selector (`mcOpenPicker`) se hace `exitPointerLock` para poder navegar la galería, pero al asignar (`mcAssignSlot`) o vaciar (`mcRemoveSlot`) la ranura no se recapturaba el ratón. Nuevo helper **`mcRelock()`** (`mc.canvas.requestPointerLock()` con guarda `mc.active` + `try/catch`) llamado tras cerrar el selector **por una acción** (elegir/vaciar), **no** por Esc/✕ —donde el usuario quiere el ratón libre—. El clic del ítem es gesto de usuario y la activación pegajosa persiste tras los `await` de `mcAddBlock`/`mcStructCells`, así que Chrome permite la recaptura; el clic en el canvas sigue siendo respaldo. `node --check` OK.
- 2026-07-22 · 🌍 **REQ-MC · giro MANUAL de estructuras con la tecla R (se retira el auto-giro «mirando al jugador»)** (usuario: «las estructuras tienden a no colocarse mirando al usuario; mejor colocarlas por defecto y, mientras se mantiene el clic derecho para ver la vista-previa, pulsar R rota 90° en el plano; al soltar se coloca con esa orientación»). Se **sustituye** el auto-giro `mcYawToRot()` (orientaba la sala hacia el jugador según `mc.yaw`, y a menudo caía mal) por un estado **`mc.previewRot`** (0..3 = 0/90/180/270°, def **0**, persiste entre colocaciones). La tecla **R** (con una ranura-estructura activa) hace `previewRot=(previewRot+1)&3` y avisa por toast «Giro: N°». Los **tres** flujos leen ahora `mc.previewRot`: caja-huella del overlay, `mcUpdatePreview` (la vista-previa renderizada gira en vivo) y `mcStampStruct` vía `mcPlace` (al soltar estampa con ese giro). Toast de descubrimiento al empezar a mantener clic derecho: «Mantén clic derecho · R gira · suelta coloca». Se **elimina** `mcYawToRot` (código muerto). `node --check` OK.
- 2026-07-22 · 🌍 **REQ-MC · la estructura se ancla por el CENTRO de su base, no por la esquina** (usuario: «la estructura debería colocarse desde aproximadamente el centro de su base, no desde una esquina, para facilitar su colocación»). Nuevo helper **`mcStructOrigin(sk,tx,ty,tz,rot)`**: convierte la celda apuntada por la mira en la esquina min de estampado restando **media huella horizontal** (`w/2`, `d/2` con `|0`), intercambiando ancho↔fondo en giros impares (90°/270°); la **Y (base) no se desplaza** —la sala se apoya en la celda apuntada—. Se aplica en los **tres** flujos que usaban la esquina: la caja-huella del overlay, `mcUpdatePreview` (que ahora `await mcStructCells` para tener la huella antes de centrar) y `mcStampStruct` vía `mcPlace`. La huella la calienta el overlay cada frame (mcStructCells cacheada); sin caché ⇒ 1×1 (comportamiento anterior de esquina, transitorio). `node --check` OK.
- 2026-07-22 · 🌍 **REQ-MC · vista-previa RENDERIZADA de la habitación al mantener clic derecho + `game.structGhostAlpha`** (usuario: «1) quiero un ghostAlpha configurable aparte para colocar conjuntos de bloques / habitaciones; 2) cuando se va a poner una habitación y se mantiene el botón derecho se ha de mostrar la habitación ya renderizada, no solamente el ghostAlpha»). **(1)** Se separa la transparencia: la caja-huella de estructuras deja de ir en el flujo `lines` (que gobierna `game.ghostAlpha`) y pasa a `structLines`, dibujado con su **propia mezcla por alfa constante** `blendColor(0,0,0,mc.structGhostAlpha)`. Nuevo tunable **`game.structGhostAlpha`** (0..1, def **0.5**, `enumerable`, persistido en `vf_mcStructGhostAlpha`); regula solo la vista-previa de estructuras/habitaciones, independiente del fantasma de bloque suelto (`game.ghostAlpha`). **(2)** Mientras se mantiene el clic derecho con una ranura de estructura, se muestra la habitación **como malla renderizada de verdad** (no solo la caja): `mcUpdatePreview()` (llamada en `mcTick` antes de `mcRender`) construye/cachea la instancia `mc.preview` con `mcBuildStructMesh(sk,ox,oy,oz,rot)` —mismo objetivo (`hit.cell+normal`) y giro (`mcYawToRot()`) que el estampado real, así **la vista-previa coincide con lo que se colocará**— memoizando por `sk|ox|oy|oz|rot` para no re-mallar cada frame; una sala nunca estampada mete sus texturas al atlas una vez (`mcRoomNeedsAtlas`→`mcRestampAll`). `mcDrawPreview()` la dibuja translúcida (dos pasadas: color por vértice + textura vía atlas de estructuras) con `game.structGhostAlpha`, sin escribir profundidad. Se **limpia** (`mcClearPreview`, libera las dos VBO) al soltar el botón, al perder el pointer-lock y al cerrar el Mundo. `node --check` OK.
- 2026-07-21 · 🧭 **FIX-SKY5** (usuario: «se medio-comporta bien, pero si hago pan del objeto la línea del horizonte no lo sigue»): el horizonte por pitch estaba clavado al centro de pantalla e ignoraba el paneo. Se le suma `view.panY` (mismo signo/escala que la `oy` de `project3d`, línea 691: `oy=H/2−centro·S+panY`), así el horizonte se traslada 1:1 con el objeto al arrastrar y sigue al zoom-al-cursor (que ajusta `panY`). La proporción cielo/tierra la sigue fijando el pitch. Consistente en media y full res (la media usa `panY/2` con `H/2`). `node --check` OK.
- 2026-07-21 · 🧭 **FIX-SKY4** (usuario: «esta perspectiva no tiene sentido: si mirase la habitación desde el cielo solo vería tierra, desde abajo vería el cielo»): el horizonte era un corte fijo ligado a la proyección de z=0, que no respondía al ángulo de cámara. Ahora la proporción cielo/tierra depende SOLO del `pitch`: `hy = H/2·(1−sin(pitch))`. Cenital (pitch→+1.45) ⇒ `hy→0` = toda tierra; desde abajo (pitch→−1.45) ⇒ `hy→H` = todo cielo; de lado (pitch 0) ⇒ horizonte al centro; iso por defecto (0.62) ⇒ ~21% cielo arriba. Independiente de zoom/pan/objeto ⇒ nunca se descoloca (elimina de paso la deriva del horizonte al hacer zoom). `node --check` OK.
- 2026-07-21 · 🌅 **FIX-SKY3** (usuario: «todo se ve como cielo, no hay horizonte»): el telón pasó de un solo tono (todo cielo, el objeto flotaba) a **dos tonos con horizonte** en el plano tierra z=0. Se recupera `g.groundY` (y-en-pantalla de z=0 en el centro) y se calcula `hy=clamp(groundY,0,H)`. Ruta path: 2 `fillRect` (cielo sobre `hy`, tierra `SKY_GROUND=#6f8f4e` debajo). Ruta raster (modelos grandes): el buffer se rellena en dos tramos con `col32` (cielo filas 0..hy, tierra hy..H) antes del `scanQuad`. Los voxels (que arrancan en z=0) se pintan encima, así el horizonte casa con la base del objeto. Coste nulo en ambas rutas. `node --check` OK.
- 2026-07-21 · 🐞 **FIX-SKY2** (usuario: «solo sale a partir de 197% y no veo la línea del horizonte antes»): el telón `fillRect` solo servía en la ruta **path por cara**. Con modelos grandes (terreno ~50k vox) `renderFree3d` usa la ruta **raster** (`scanQuad`+`putImageData`), y `putImageData` **reemplaza** píxeles (no compone) ⇒ borraba el cielo; solo reaparecía al acercar zoom, cuando el culling por visor baja `g.list` de `BIG3D` y se vuelve a la ruta path. Fix: el buffer del raster se rellena con `col32(skyColor,1)` en vez de 0 cuando el cielo está activo ⇒ los píxeles sin voxel quedan de color cielo. Ahora el cielo se ve en ambas rutas y el horizonte = silueta del objeto, a cualquier zoom. `node --check` OK.
- 2026-07-21 · 🐞 **FIX-SKY1** (usuario: «con zoom ≤120% no veo el cielo, entre ese valor y 236% sí, a partir de ahí no; debería verlo siempre»): el horizonte se basaba en `groundY`=proyección del centro del modelo a z=0, pero el zoom-al-cursor del modal desplaza el pan, así que `groundY` se salía de `[0,H]` a ciertos zooms y la franja de cielo colapsaba (o la tierra tapaba todo). Solución robusta y sin coste: el cielo pasa a ser un **telón de fondo a pantalla completa** (1 `fillRect` antes de los voxels); la «tierra» la forman los propios voxels en z=0 que se pintan encima, así el horizonte lo marca la silueta del objeto y el cielo se ve **siempre**. Se elimina `groundY` de `project3d` (ya no hace falta). `node --check` OK.
- 2026-07-21 · 🌤️ **REQ-SKY** (usuario: «en modo 3D pantalla completa quiero poder activar el cielo con su color azul; selector de color; en altura 0 está la tierra y todo lo que quede por encima del horizonte se muestra como cielo; casi sin coste de cálculo»): en la vista **Ampliar** (`renderFree3d`) botón **☁️ Cielo** + `<input type=color>` en la barra del modal. `project3d` expone `groundY` = y-en-pantalla del plano tierra (z=0) en el centro del modelo (`screen(cx,cyc,0)[1]`, ya se calculaba todo). Con el cielo activo, `renderFree3d(...,skyColor)` pinta **2 fillRect** antes de los voxels: color de cielo por encima de `groundY` (horizonte) y `#0e1119` (tierra/subsuelo) por debajo — coste nulo, sin tocar el bucle de caras. Estado `skyOn`/`skyColor` persistidos (`vf_sky`/`vf_sky_color`, def `#77b6f0`); `skyArg()` solo se pasa en las 2 llamadas del modal (media y full res), **no** en la vista de edición ni en Play (3151), así el scope es exactamente «pantalla completa». Highlight `.btn.on`; el selector de color se oculta si el cielo está apagado. `node --check` OK + curl 200.
- 2026-07-21 · 🎥 **REQ-CAM-FRONT** (usuario: «para el modo de edición 3D quiero poder cambiar la perspectiva de la cámara entre la actual y "proyección ortogonal frontal"»): botón **Frontal/Libre** en `#rot-float` (junto a ⟲⟳, solo visible en 3D). `toggleCamFront` alterna entre la orientación libre y la **proyección ortogonal frontal** (`view3d.yaw=pitch=0` ⇒ se ve X↔horizontal, Z↔vertical mirando por el eje Y; la proyección ya era ortográfica, esto solo fija el ángulo). Al activar guarda la orientación libre en `camSaved` y snap a 0,0; al desactivar la restaura. Cualquier rotación manual (orbitar con >3px o los botones ⟲⟳) llama `leaveCamFront()` y sale del bloqueo (botón vuelve a «Frontal»). El zoom/pan se conservan. Highlight ámbar `.rot-float .btn.on`. Solo afecta a la vista de edición (`view3d`), no al modal Ampliar. `node --check` OK + curl 200.
- 2026-07-21 · 🔲 **REQ-SEL2D-BOX** (usuario: «quiero poder hacer selecciones en modo 2D tal y como se hace en 3D: que si arrastro pueda marcar una zona de voxel inicio y otro fin para seleccionar varios a la vez»): en Capas la herramienta Selección pasa de pincelar voxel a voxel a **caja arrastrable** como en 3D. `marquee` ahora es `{x0,y0,x1,y1,base:Set,mode,moved,emptyStart}`; `applyMarquee()` (antes `commitMarquee`) recalcula la selección **en vivo** = `base` congelada ± los voxels OCUPADOS de la capa actual dentro del rectángulo (izq añade, der quita). En `pointerdown` cualquier arrastre izq/der inicia la caja partiendo de `base=new Set(selection)` (respeta lo ya seleccionado en otras capas); `pointermove` marca `moved` y reaplica cada vez que cambia la celda; al soltar, un clic sin mover sobre celda vacía en modo add deshace la selección (como el clic izq en vacío de 3D). Un clic simple = caja 1×1 (1 voxel). El recuadro punteado cian de `drawEdit` se conserva. Shift ya no es necesario (arrastre normal = caja). `node --check` OK + servido por curl (200).
- 2026-07-21 · 🌳 **REQ-TREES-MOCK** (usuario: «genérame un mock/artefacto con árboles: tronco y ramas, 3 diferentes bonitos»): mock en `assets/trees_mock/` SIN tocar `index.json`. `make_trees.js` (procedimental, PRNG determinista) genera 3 árboles 32³ `type:'objeto'` con helpers trunk/branch/blob(esfera)/skirt(cono): **roble** (tronco grueso + 5 ramas + copa verde en racimos, 3428 vox), **pino** (tronco fino + faldas cónicas apiladas, 1408 vox), **cerezo** (tronco inclinado + ramas abiertas + copa rosa, 2165 vox). Todos con base en z=0, dentro de 0..31. `catalog.html` = previsualización con render iso de voxels dispersos (culling de caras + botón girar), servida en `/assets/trees_mock/catalog.html`. `README.md` documenta preview/regenerar/promover. Verificado: JSON válido, extents OK, follaje 85/87/69%, curl 200, `index.json` real intacto.
- 2026-07-21 · 👁️ **REQ-TEX-PREVIEW** (usuario: «al pasar por encima de una textura quiero un preview grande porque el chip es muy pequeño; y que Pincel/Construir muestren la imagen —ahora el pincel sale plano y construir es estático»): (1) popup `#tex-preview` (canvas 192, css 160) que aparece al `mouseenter` de cada `.texchip` con la miniatura iso grande + nombre, posicionado junto al chip (`showTexPreview`/`hideTexPreview`). (2) el chip `.tool-swatch` del Pincel y ahora también del Construir (nuevo `<i class="tool-swatch">` en ambas barras) muestran la **miniatura iso real** de la textura activa en vez del color plano: `texSwatchUrl(key,cb)` cachea `drawThumb`→`toDataURL` y `syncColor` lo pone como `background-image` (`.tool-swatch.is-tex`, 20px); sin textura vuelve al color plano. `node --check` OK + servido por curl.
- 2026-07-21 · 🧱 **REQ-BLOCKS-ASSETS** (usuario: «añádelos como assets en Texturas dentro de una categoría "bloques de construcción", con desplegable como se hizo para las paletas»): promovidos los 10 bloques del mock a `assets/*.vox.json` (meta sin la nota MOCK) e inscritos en `assets/index.json` como `type:'textura'` con nuevo campo `group:"Bloques de construcción"`; las 4 texturas base (hierba/tierra/madera/roca) etiquetadas `group:"Básicas"`. UI: nuevo `<select id="tex-cat" class="palette-picker">` en la sección Texturas (calca el `#palette-picker`). `refreshTexturas` ahora llena `texItems` con `group` por textura; `buildTexCatPicker()` construye el desplegable (categorías por orden de aparición, recuerda la elegida en `localStorage vf_texcat`, oculto si <2 categorías) y `renderTexStrip()` pinta solo la categoría activa. Saved habitantes de tipo textura → categoría «Mis texturas». `node --check` OK + assets/UI servidos por curl (200).
- 2026-07-21 · 🧱 **REQ-BLOCKS-MOCK** (usuario: «prepara un mock/artefacto para bloques tipo Minecraft de construcción que luego igual añadimos como assets»): mock en `assets/blocks_mock/` SIN tocar el `index.json` real. `make_blocks.js` (calca `make_textures.js`, PRNG determinista) genera 10 bloques 16³ `type:'textura'` con patrones por voxel: adoquín, ladrillo de piedra, ladrillo, tablones, tronco (corteza + anillos en tapas z=0/15), arena, arenisca, grava, adoquín musgoso, obsidiana. Salida: `<id>.vox.json` + `index.json` mock (formato de entrada del registro real, `file:assets/blocks_mock/…`). `catalog.html` = previsualización iso autocontenida (top/2 laterales, sombreado 1.10/0.72/0.55) servida en `/assets/blocks_mock/catalog.html`. `README.md` documenta previsualizar/regenerar/promover. Verificado: 10× 4096 voxels, curl 200, `index.json` real intacto. Promover = mover el `.vox.json` a `assets/` + añadir su entrada a `assets/index.json`.
- 2026-07-21 · 🖼️ **REQ-TEX-ISO** (usuario: «en la vista 3D en miniatura no se están mostrando las texturas, sale aplanado»): las rutas iso (miniatura 3D `drawIso`/`drawIsoIsolate` y thumbnails de galería `drawThumb`→`renderIso`) rellenaban cada cara con `shade(voxFill(v.c),f)` = color representativo plano (y la ruta raster con `rasterCol`=color medio). Nuevo helper `isoFace(ctx,v,fi,poly,factor)`: si `isTex(v.c)`, proyecta la cara real con `drawTexFace(fc.faces[fi],factor,poly)` (mismo mecanismo que la vista 3D libre); si no, `face()` plano como antes. Los `poly` se reordenan al orden de esquinas `CUBE_FACES[fi].c` (top=fi0, izq=fi4, dcha=fi2) para que la textura quede bien orientada (borde de hierba arriba en los laterales). En `drawIsoFaces` la ruta raster rápida solo se usa si NO hay texturas (`seams===false && !hasTex`); con texturas cae a la ruta canvas. `node --check` OK + servido por curl.
- 2026-07-21 · 🖼️ **REQ-TEX-ISO** (cont., usuario: «en la miniatura 3D sin los modos de aislar, cuando se edita en modo 2D, no se ven las texturas»): la vista de **corte** de Capas (`drawIsoSliced`) rellenaba con `sf(it.c,f)` (shade/shadeBelow) = plano. Ahora usa `isoFace` con un flag `below` (voxel bajo el plano de corte): plano → `shadeBelow` como antes; textura → `drawTexFace` con el factor atenuado (`×0.55`) para imitar el tinte del corte. `drawIsoSlicedBig` (>BIG3D=15000 vox) sigue en raster/color medio como límite conocido. `node --check` OK + servido por curl.
- 2026-07-21 · 🧭 **REQ-LAST-LAYER-3D** (usuario: «cuando se ha pintado algo en el modo 3D ya sea por construir o por la herramienta pintar, al pasar a modo 2D tiene que activarse justo esa última capa de edición»): nueva variable `last3dLayer` que registra la `z` de cada edición en 3D — `applyTool3d` (pintar/borrar/rellenar) y las dos rutas de Construir (clic + arrastre) la fijan. En `setMode`, al conmutar a Capas (`!is3`), si hay `last3dLayer`, `state.layer` salta a esa capa (acotada a `0..SZ-1`) + `syncLayer()`; el `resizeEdit()`/`drawEdit()` posterior ya dibuja la capa correcta. `node --check` OK + verificado servido por curl.
- 2026-07-19 · Plan creado (10 rondas de crítica). Arranca F1+F2.
- 2026-07-19 · F1 completada: API `GET/POST /api/mapa` con respaldo a papelera; verificada por `curl`.
- 2026-07-19 · F2 completada: pestaña Mapa 8×8, catálogo con miniaturas, colocar/cambiar/quitar, autoguardado.
- 2026-07-19 · Mapa: overlay opaco + banda de ayuda + celdas legibles (no se entendía la pantalla).
- 2026-07-19 · F3 completada: editor de habitación (vista cenital), añadir/mover/quitar habitantes, autoguardado en cells[].habs.
- 2026-07-19 · F3 pulido: marcadores con la CARA del habitante (renderFace) + clic no mueve (umbral de arrastre).
- 2026-07-19 · F4 completada: downsample 4× por color mayoritario + composición habitación+habitantes en la miniatura del mapa.
- 2026-07-19 · Mapa: casillas más grandes/nítidas; arreglado recorte por arriba (flex + margin:auto).
- 2026-07-19 · F5 completada: modo Jugar (clic+pathfinding BFS, personaje de galería, orientación, render iso sala+jugador).
- 2026-07-19 · F5 v2: movimiento revisado — A* octile + suavizado (string-pulling), penalización de pared, oclusión por profundidad; MOVIMIENTO.md.
- 2026-07-19 · F6 completada: transiciones entre salas (puertas talladas dinámicas alineadas, cruce con fundido, spawn en puerta opuesta).
- 2026-07-19 · ESCALA: salas recreadas a escala de personaje (assets 112×112×52, paredes 40 vs personaje 32); el personaje ya NO se reduce — va nativo en juego y composición; salas 28³ legado se escalan ×4 al vuelo; posiciones de habs migradas ×4.
- 2026-07-20 · Carriles de puerta (`clearExitLanes`) + ▶ Jugar rápido + `room.doorTrim` por consola (Proxy inspector).
- 2026-07-20 · 🐞 Abierto **BUG-DT1**: `doorTrim=0` no deja el mueble intacto (parte mesa + ranura "láser" en el muro) y el despeje llega hasta el centro rompiendo objetos lejanos. Ver «Incidencias abiertas».
- 2026-07-20 · Editor 3D: medidor de FPS (arriba-izq, ventana de 500ms).
- 2026-07-20 · 🐞 Abierto **BUG-RM1**: `room` a secas en consola muestra el Proxy (target vacío) en vez del diccionario de propiedades.
- 2026-07-20 · ✅ **BUG-RM1** resuelto: `room` pasa a objeto plano (accessors) → se ve como dict. + inspector `game` (`game` vuelca {fps,mode,room,showFPS}; `game.showFPS(false)`/`=false` muestra/oculta el medidor de FPS, persistido).
- 2026-07-20 · Editor 3D: `game.showVoxels(true)` + medidor de voxels dibujados; `project3d` con culling por visor (los voxels fuera del lienzo no se dibujan → el contador baja al acercar).
- 2026-07-20 · 🐞 Abierto **BUG-P3D1**: rendimiento bajo en el editor 3D (271 vox → 7 fps); el coste va con el área de caras (canvas fill+stroke por cara para ≤15000; raster rápido solo >15000) + fill-rate/DPR + overdraw. Ver «Incidencias abiertas».
- 2026-07-20 · 🐞 **BUG-DT1** reconfirmado por el usuario (`doorTrim=0` sigue rompiendo voxels) → subir prioridad. 🛠️ Abierto **REQ-DBG1**: los medidores/variables de depuración F12 (`game.showFPS/showVoxels/fps/voxels`) deben funcionar también en modo Play; principio: toda var de depuración aplicable a Play y editor.
- 2026-07-20 · 🐞 Abierto **BUG-SH1**: la sombra se proyecta solo al plano del suelo (decal 2D en `renderShadowSprite`), no trepa a objetos cercanos más altos (los tapa la oclusión). Propuesta: proyectar a la z de superficie por columna (height-field) / shadow map. Relacionado con SOMBRAS.md.
- 2026-07-20 · 🐞 Abierto **BUG-TR1**: a veces al cruzar de sala queda todo negro hasta el siguiente clic. Causa: durante `transitioning` no se repinta pero `play.fade` sigue bajando; si `playLoadRoom` (async) tarda más que el fundido, al terminar `fade=0` y la rama de fundido no repinta la sala nueva. Propuesta: congelar fade en transición / `renderPlay()` tras cargar.
- 2026-07-20 · ✅ **BUG-TR1** resuelto: el fade solo se disuelve tras la transición (`!play.transitioning`) y `playTransition` repinta al cargar la sala nueva → nunca queda negro.
- 2026-07-20 · ✅ **BUG-DT1** resuelto: se separa el vano del muro (mínimo pisable, `punch` salta el margen embutido) del recorte de mueble (`doorTrim>0`, profundidad acotada). `doorTrim=0`=muebles intactos, `<0`=cerrada. Verificado headless (taberna/mazmorra/herrería). [corregido 2ª ronda: `<=0`=cerrada]
- 2026-07-20 · ✅ **REQ-DBG1** resuelto: medidores `#play-fps`/`#play-vox` sobre `#play-stage`; FPS real por ventana en `playTick` y voxels de sala tras `project3d`; los toggles `game.showFPS/showVoxels` valen en Play y editor.
- 2026-07-20 · ✅ **BUG-SH1** resuelto: height-field `play.surfZ` (z-tope por columna) + sombra re-horneada en la celda real del jugador (`bakeShadowAt`) → trepa a la tapa de muebles/paredes. Pendiente fino: cara vertical + blob (SOMBRAS.md). [corregido 2ª ronda: solo trepa a lo más bajo que el personaje]
- 2026-07-20 · ✅ **BUG-P3D1** resuelto: `scheduleEdit3d()` coalesce pointermove por rAF + media resolución en el arrastre también para modelos pequeños con caras grandes (quita el gate `bigModel()`). Verificar fps en navegador dpr2.
- 2026-07-20 · 🔁 **2ª ronda** (tras probar el usuario): 4 de 5 correcciones ajustadas. **BUG-DT1**: `doorTrim=0` seguía dejando hueco — ahora `<=0` = puerta CERRADA (el carve/clear solo corre con `>0`); el 0 cierra, ya no hace falta el −1. **REQ-DBG1**: los medidores no salían en Play porque el gate era `window.play` (`undefined`) → cambiado a `play` (const de módulo, en ámbito). **BUG-SH1**: la sombra trepaba a lo MÁS ALTO que el personaje; ahora `surfAt` topa en `cap = standZ+ext.z` y las columnas más altas que él se posan en el suelo (solo trepa a lo más bajo). **BUG-P3D1**: el pincel seguía a ≤17 fps porque cada `pointermove` hacía 2 `drawEdit3d` full-res + 2 `pick3dAt` síncronos → ahora 1 pick + 1 repintado coalescido por frame. **BUG-TR1** aceptado por el usuario, sin más cambios. Solo `app.js` (+ `index.html` ya tenía los medidores).
- 2026-07-21 · 🔁 **3ª ronda BUG-P3D1** (el usuario: 300 voxels <10 fps, «inaceptable»). Perfilado real: la coalescencia de la 2ª ronda no bastaba porque quedaban **3 costes por frame** al pintar, no 1. (1) `applyTool3d` llamaba `drawEdit()+drawIso()+updateInfo()` **síncronos en cada trazo** → coalescidos con `scheduleAux2d()` (1/frame). (2) El render 3D del pincel iba a **resolución completa con `fill()+stroke()` por cara** (2 pasadas con AA) porque `interact` no incluía pintar → ahora pintar entra en la rama `interact` (½ resolución) y activa `_fast3d` para usar el **rasterizador `scanQuad`** (sin AA ni contorno) aunque el modelo sea pequeño. (3) El picking necesita geometría a resolución real: se calcula con un `project3d(W,H)` aparte (barato, solo proyecta). Al soltar (`end3d`) se repinta a calidad completa (`wasPaint`). Verificar fps en navegador.
- 2026-07-21 · 🔁 **4ª ronda BUG-P3D1** (usuario: 305 vox dibujados, 9 fps). Diagnóstico definitivo: el coste del pincel era **O(modelo total) por trazo** (~50k voxels de la sala), no O(dibujado): cada trazo invalidaba `voxKey()` y el frame siguiente re-parseaba TODO (`voxParsed`: 50k splits de string), reconstruía el Set de ocupación, re-recorría la corteza para el encuadre (8×`rotP`), construía otro Set de "solo lo visible" (zoom con recorte de cercanía), proyectaba DOS veces (½ para escena + real para picking) y `drawIso` (O(modelo)) corría cada frame aunque coalescido. Arreglos: `setVoxel` parchea `_vl`/`_vlIdx`/`_vlBox`/`_occSet` en **O(1)** (fuzz headless 20k ops con paths fresco/estancado: OK); silueta de encuadre cacheada por (modelo, caja, orientación); `_fast3d` ⇒ ocupación completa cacheada aun con recorte; **una** proyección por frame + raster ½ con `scanQuad` desde esa geometría; paneles 2D/mini/info diferidos a pointerup. Coste por frame ahora ≈ O(voxels visibles) + rotación/orden (aritmética pura).
- 2026-07-21 · ✨ **REQ-3DOFF** (usuario: «quiero ocultar el preview 3D con un botón que haga de switch»). **1ª entrega equivocada**: puse el switch en la barra apuntando al lienzo de edición `#edit3d` del centro. El usuario aclaró: «el botón oculta la vista de PREVIEW 3D, no la vista 3D» → **retargeteado a la miniatura iso del panel derecho** (tarjeta «Vista 3D», `#iso`). Ahora el botón 👁 `#toggle-preview` vive en la cabecera de esa tarjeta y **oculta/muestra `#iso-body`** (envuelve lienzo + controles rot/ampliar); con la tarjeta oculta `drawIso` hace no-op (`if(!_showPreview) return;`, salvo el modal «Ampliar» que es independiente), ahorrando el coste O(modelo) de repintar la miniatura en salas ~50k vox. Persistido en `localStorage vf_showpreview` (`applyShowPreview`/`updateTogglePreview`). Revertidos todos los cambios de la 1ª entrega sobre `#edit3d`/`_show3d`/`#edit3d-off`/`#ctrl-3d`. Botón a propósito (lo pidió el usuario), no variable de consola.
- 2026-07-21 · ✨ **REQ-ISODEFER** (usuario: «al pintar en 2D la miniatura 3D se actualiza sola; no debería hasta soltar»). La miniatura iso (`drawIso`, O(modelo)) se **difiere mientras se pinta en Capas**: `render()` omite `drawIso` si `painting` (el lienzo 2D y el contador `updateInfo` sí siguen en vivo) y se repinta **una sola vez** al soltar (`endPointer`, `wasPaint`). Alivia también salas grandes (antes: un `drawIso` por trazo).
- 2026-07-21 · ✨ **REQ-MARQUEE2D** (usuario: «con la herramienta Selección, Shift+arrastrar debe seleccionar varios voxels a la vez, los que caen en el recuadro»). En Capas, con `tool==='select'`, **Shift+arrastre** dibuja un recuadro (`marquee={x0,y0,x1,y1}` en celdas; rombo punteado cian en `drawEdit`) que en `pointermove` solo redibuja (no pinta) y al soltar (`endPointer→commitMarquee`) **añade** a `selection` todos los voxels de la capa actual dentro del rectángulo (clampeado a la rejilla). Es aditivo (respeta lo ya seleccionado). Sin Shift, la Selección sigue pincelando voxel a voxel como antes.
- 2026-07-21 · ✨ **REQ-COPYPASTE2D** (usuario: «en 2D, Ctrl+C copia los voxels seleccionados y Ctrl+V los pega en modo colocación: el ratón mueve los nuevos voxels y el clic los deja»). **Ctrl+C** `copySelection` guarda `clipboard={cells:[{dx,dy,dz,c}], gx,gy}` (offsets al mínimo + color + punto de agarre = centro). **Ctrl+V** `startPaste` (solo Capas) entra en `pasting`: fantasma que sigue al cursor (cursor `move`, preview en `drawEdit` de las celdas con dz=0 = capa visible); `pointermove` solo redibuja, `pointerdown` izq = `pasteAt` (mínimo en el cursor, Z=capa actual, un `edit()` para deshacer, la selección pasa a lo pegado), botón der/**Esc** = `cancelPaste`. Multi-capa: preserva dz al pegar aunque el preview solo muestre la capa actual.
- 2026-07-21 · 🎨 **REQ-PALETTES** (usuario: «necesito paletas temáticas por color… cabléalas»). Tras revisar el artefacto `paletas_propuesta.html`, se cablean **las 13 paletas** al editor: el `PALETTE` plano de 24 colores pasa a ser `PALETTES{ id → {name,emoji,colors:[[hex,nombre]]} }` (clasica, bosque, mazmorra, fuego, hielo, cienaga, corte, desierto, noche, pieles, metal, pastel, retro). Nuevo `<select id="palette-picker">` sobre las muestras de "Paleta"; `setPalette(id)` recuerda la elección en `localStorage.vf_palette`, redibuja `#palette` y deriva `PALETTE` (solo hex) para el resto del editor. `buildPalette` ahora pone el nombre del color en el `title` (`nombre · hex`) y remarca la muestra activa vía `syncColor`. El color personalizado + cuentagotas siguen igual.
- 2026-07-21 · 🪣 **REQ-FILLSEL** (usuario: «con voxels seleccionados, al pulsar el Cubo de pintura todos deben cambiar al color actual»). Espejo del atajo de "Borrar" con selección: `onToolClick` intercepta `data-tool="fill"` cuando `selection.size` y llama `paintSelection()` en vez de cambiar de herramienta. Repinta solo las celdas ocupadas de la selección con `state.color` en un único `edit()` (un paso de deshacer). Vale en 2D y 3D (mismo handler). El atajo de teclado G sigue solo cambiando de herramienta.
- 2026-07-21 · 🪣 **REQ-FILLSEL2** (usuario: tras rellenar la selección, debe **deseleccionar y volver a la herramienta Selección**; antes quedaba el Pincel activo porque elegir el color de relleno cambia a Pincel). `paintSelection()` ahora, tras pintar, hace `selection.clear()` + `setTool('select')`. Ajusta el comentario: ya no "mantiene la selección para repintar".
- 2026-07-21 · 🎨 **REQ-PICKNOTOOL** (usuario: «elegir un color de la paleta no debe cambiar de herramienta; seleccionar el color sí, pero sin pasar a Pincel automáticamente»). `pickColorPalette()` deja de hacer `setTool('paint')`: solo `chooseColor(c)`. Afecta a las muestras de la paleta y al `#color-custom` (mismo handler). El cuentagotas (`pickColorTool`) sigue volviendo a `prevTool` como antes.
- 2026-07-21 · 🪣 **REQ-FILLSEL3** (usuario: revierte el deseleccionar de REQ-FILLSEL2 — tras rellenar, **mantener** los voxels seleccionados). `paintSelection()` deja de hacer `selection.clear()`; conserva `setTool('select')`, así que tras pintar la selección sigue activa y con la herramienta Selección.
- 2026-07-21 · 🔲 **REQ-DESELECT** (usuario: «botón derecho en la herramienta de Selección debe deseleccionar todo»). Nuevo `contextmenu` sobre `#tools`/`#tool-float` (`onToolContext`): si el botón es `data-tool="select"`, `preventDefault` del menú del navegador y `selection.clear()` + `render()` si había algo. No cambia de herramienta ni afecta al resto de botones (su menú contextual sigue normal).
- 2026-07-21 · 🪄 **REQ-FLOODSEL3D** (usuario: «en 3D, con Selección, Shift+clic debe seleccionar todos los voxels de la misma capa unidos/adyacentes al clicado»). En `edit3d` pointerdown, dentro de `tool==='select'` y ANTES del check de mover, si `button===0 && shiftKey && v` se llama `floodSelectLayer(v)`: BFS de la región conexa en la capa `z=v.z` por 4-vecindad en XY (solo caras que se tocan; diagonales no), aditivo sobre la selección. Acotado porque `getVoxel` (lookup en Map) devuelve `undefined` fuera de rejilla y corta la expansión; `seen` evita bucles.- 2026-07-21 · 🐞✅ **BUG-VLSORT** (usuario: «al editar faltan pixeles visualmente en 3D; giros/zoom/pantalla completa no lo arreglan, pero guardar y recargar de la galería sí»). Causa raíz: `project3d`, para modelos pequeños (≤`BIG3D`) y sin recorte de cercanía (`t==0`), hacía `vis.sort(...)` cuando `vis===list`, y `list` ES el array cacheado `_vl`. El orden-pintor reordenaba `_vl` in situ, dejando `_vlIdx` (key→índice) desincronizado; el siguiente `setVoxel` parcheaba el slot equivocado (recolor/swap-pop) ⇒ voxels perdidos/duplicados en la lista de dibujo = huecos. Persistía en TODAS las vistas (comparten `_vl`) y solo recargar (Map nuevo ⇒ `_vl` reconstruido desde `state.voxels`, siempre correcto) lo curaba. Los modelos grandes (~50k salas) no lo sufrían: caen en el counting-sort que crea un array `out` nuevo. Arreglo (1 línea): `if(vis===list) vis=vis.slice();` antes del `sort` — nunca se ordena la caché in situ (las ramas `t>0`/counting-sort ya producían arrays frescos).
- 2026-07-21 · ✨ **REQ-BOXSEL3D** (usuario: «en 3D, con Selección, el arrastre debe seleccionar los voxels desde el primer clic hasta el último, un área que puede ser plano horizontal/capa o vertical/varias alturas»). Antes el arrastre pincelaba voxel a voxel; ahora es una **caja**: `selBox={a,b,base,mode}` guarda el voxel del clic (A) y el actual (B); `applySelBox()` rehace la selección desde `base` (lo que había al empezar) + los voxels OCUPADOS dentro de `[min..max]` en cada eje (add izq / remove der). Si el arrastre se queda en una cara (Y o Z constante, p.ej. la cara frontal) sale un plano vertical; en la tapa sale uno horizontal; cruzando caras sale un volumen. Un clic sin mover = caja A..A = 1 voxel (misma UX de antes). Shift+clic (flood de capa) y clic-en-una-selección→mover intactos. Solo `app.js` (+ CLAUDE.md).
- 2026-07-21 · 🎨 **REQ-TEX F1** (usuario: «poder usar un objeto 16³ como un "color" de paleta para pintar voxels; su color lo dan las caras del objeto, p.ej. hierba = verde arriba, tierra a los lados»). Fase 1 (tipo + enrutado + tira + galería + 4 ejemplos): nuevo tipo `textura` en `#meta-type`; `habBucket('textura')→'textura'` (bucket propio, no cae en «habitante») con entradas en `HAB_TITLE`/`HAB_EMPTY`; pestaña «Texturas» y `#btn-texturas` abren `openHabitantes('textura')` (galería reutilizada); `loadServerAssets` excluye `type==='textura'` del roster de Assets; tira `#texstrip` bajo la paleta poblada por `refreshTexturas()` (assets/index.json con `type==='textura'` + `apiHabitantes()` guardadas), miniaturas iso via `drawThumb`+`getRoomData`. Id de pincel = clave `getRoomData` (`asset:<file>` | `hab:<id>`); `state.tex` + `chooseTex(key)` la activan (resaltado en la tira). 4 ejemplos de fábrica en `assets/` (hierba/tierra/madera/roca, 16³, +Z arriba) generadas por `make_textures.js` e inscritas en `index.json`. Sin cambios en `server.py`. F2 (pintar `tex:<id>` + persistencia) y F3 (render 3D por cara) pendientes.
- 2026-07-21 · 🎨 **REQ-TEX F2** (pintar con textura + persistencia): valor de voxel ahora es hex **o** `tex:<clave>` (`isTex`/`texKeyOf`); `paintValue()` = `'tex:'+state.tex` si hay textura activa, si no `state.color`. Todos los pinceles la usan: `applyTool`/`floodFill`/`applyTool3d`/`flood3d`/`paintSelection`. Cuentagotas (`pickColorTool`) recupera textura o color. `chooseColor` apaga la textura (`state.tex=null`); `syncColor` resalta el pincel activo (swatch = color medio de la textura). `getTexDef(clave)`+`texDefs` (resuelve por `getRoomData`, cachea) + `computeTexRepr` (color medio → `texReprCache`); `voxFill(c)` pinta las celdas 2D de `drawEdit` con el color representativo. Persistencia autocontenida: `embeddedTextures()` embebe `textures:{clave:{size,voxels}}` en `currentVox`/snapshot localStorage; `ingestTextures(doc)` rehidrata defs+caché+`roomDataCache` al cargar (`loadFromUrl`/`loadHabitante`/`restore`). Render 3D/iso por cara aún pendiente (F3).
- 2026-07-21 · 🎨 **REQ-TEX F3** (render 3D por cara): `buildTexFaces(def)` genera las 6 proyecciones ortográficas de la textura a `<canvas>` (por cada píxel de la cara `fi`, el voxel más externo del objeto en la dirección de la normal da el color) + color medio por cara; cacheadas en `texFaceCache` (`getTexFaces`, invalidadas por `invalidateTex` al re-guardar una textura). Ruta canvas (`renderEdit3dScene`/`renderFree3d`): `paintFace3d`→si `isTex`, `drawTexFace` clipa el quad de `facePoly3d` y mapea el cuadrado unidad de la textura al paralelogramo con `setTransform`(p0,p1-p0,p3-p0)+`drawImage`, con tinte de sombra por orientación; los voxels hex se pintan igual que antes. Ruta raster (BIG3D/half-res/play) e iso: `rasterCol`=`col32` del color medio de la cara. Verificado con `hierba`: cara +Z toda verde, laterales tierra con borde verde arriba (proyección correcta según parametrización de `CUBE_FACES[fi].c`; +Z arriba). `node --check` OK; sin cambios en `server.py`. **REQ-TEX completo** (F1+F2+F3).
- 2026-07-21 · 🐛 **REQ-TEX fix** (vista completa 3D sin rejilla «flateaba» las texturas): en `renderFree3d` la rama detallada por cara exigía `seams` (rejilla ON); al quitarla caía a la ruta raster (color medio) y la textura se veía plana. Ahora la ruta por cara se usa si `seams` **O** el modelo tiene texturas (`hasTex=g.list.some(isTex)`), con `≤BIG3D`; `paintFace3d(...,seams)` dibuja la costura solo si la rejilla está activa. Sin rejilla + con textura → detalle real sin contorno. **Ajuste posterior**: sin rejilla salían líneas finas (huecos de antialias entre las caras adyacentes, que antes tapaba la costura). Ahora `paintFace3d` SIEMPRE traza el borde: rejilla ON = negro (`rgba(0,0,0,0.18)`), rejilla OFF = color de la propia cara (`shade(fc.avg[fi],s)` en textura; el color de relleno en hex) → tapa el hueco sin dibujar malla.
- 2026-07-21 · 🎚️ **REQ-NEARCLIP** (usuario: «al hacer zoom los objetos desaparecen demasiado pronto; quiero una variable estilo `game.showX` para controlar cuándo desaparecen los voxels por estar demasiado cerca, editable en vivo por F12»): el recorte de cercanía usaba `const CLIP_START=3`. Ahora `let _clipStart` (persistido en `vf_clipStart`) + `CLIP_SPAN=12` (ancho del ramp constante); `nearClipT(zoom)=clamp(((zoom-_clipStart)/CLIP_SPAN),0,0.92)`. Expuesto como **`game.nearClip`** (accessor enumerable como `room.doorTrim`: el getter devuelve el nº directo — no un callable, para que la consola muestre el valor y no la función — y `game.nearClip=8` ajusta): subirlo = los voxels desaparecen más tarde, 0 = pelar desde el principio; `applyNearClip` persiste y `render()` al vuelo. Afecta a editor/modal/play vía `project3d`. Aparece en el volcado `game {…, nearClip}`. Doc en CLAUDE.md.
- 2026-07-21 · 🎚️ **REQ-NEARCLIP ajuste**: default `_clipStart=16` (el pelado no empieza hasta 1600% de zoom) y tope de zoom 3D subido de 16 a **32 (3200%)** en `zoom3dAt` y `zoomModalAt`. `vf_clipStart` sigue teniendo prioridad (quien ya lo fijó conserva su valor; `game.nearClip=16` para volver al default).
- 2026-07-21 · 🎚️ **REQ-NEARCLIP ajuste 2** (usuario: «cambiar nearClip por defecto a 32, y añadir en la vista de edición 3D poder usar + y − para cambiar el zoom igual que en la vista 3D completa»): default `_clipStart=32` (el pelado no empieza hasta 3200%). Zoom con teclado `+`/`-` y con los botones del header (`#zoom-in`/`#zoom-out`/`#zoom-reset`) ahora ramifican por `mode`: en `'3d'` llaman a `zoom3dAt(edit3d.width/2, edit3d.height/2, 1.12|1/1.12)` (reset = `view3d.zoom=1`+`drawEdit3d`), en Capas siguen con `zoomAt`/`resetView`. Antes esos controles solo tocaban el `view.zoom` 2D (inútil estando en 3D). `vf_clipStart` conserva prioridad.
- 2026-07-21 · 🧱 **REQ-BUILD** (usuario: «quiero la herramienta de Minecraft, como un polo, para añadir cajas/voxels encima de otros»): nueva herramienta **`build`** («Construir», tecla **C**, botón 🧱 en `#tools` y `#tool-float`). En la vista 3D, clic sobre una CARA de un voxel coloca uno nuevo en la celda vacía adyacente en la dirección de la normal — colocación estilo Minecraft. `pickFace3d(px,py)` devuelve `{x,y,z,fi}` (como `pickVoxel3d` pero con la cara); `buildTargetAt(e)` = `voxel + CUBE_FACES[fi].nb` si está dentro de la rejilla y vacía; se escribe con `paintValue()` (respeta color/textura activa). Arrastrar apila contra las caras que se van tocando (`building`, agrupado en un `beginGesture`/`endGesture` para un solo undo). `drawBuildGhost` pinta en verde translúcido (`faceVisIso`+`fillPoly3d`) el hueco destino mientras se pasa el cursor (`buildGhost`, recalculado en el `pointermove` ocioso); cursor `copy` sobre hueco válido. En Capas `build` solo rellena huecos de la capa actual (no repinta, a diferencia de Pincel). `node --check` OK; sin cambios en `server.py`.
- 2026-07-21 · 🐛 **REQ-BUILD fix (arrastre apilaba)** (usuario: «al arrastrar tras crear un bloque, pone el nuevo ENCIMA del recién creado en vez de seguir a la misma altura; lo monta encima y no es así»): el arrastre trazaba contra la geometría VIVA `g3d`, que ya incluía los voxels recién puestos → sus caras superiores se volvían pickables → torre. Ahora al `pointerdown` de Construir se **congela** la geometría (`snapshotBuildGeom`: mismo `screen`/`S`/`front` —la vista no cambia en el gesto— pero `list` y `occupied`/`solidOcc` COPIADOS) en `buildGeom`, y tanto el clic inicial como el arrastre (`buildTargetAt(e, buildGeom)`, `pickFace3d(px,py,g)` ahora acepta geom) trazan contra ESA superficie original. Así se extiende una fila plana a la altura del primer bloque; volver sobre un hueco ya ocupado no repite (chequeo `getVoxel` vivo). `buildGeom` se limpia en `end3d`. `node --check` OK.
- 2026-07-21 · 🎨 **REQ-TEX-2D** (usuario: «en la vista 2D no se ven las texturas de los voxels reales, salen aplanadas»): la vista Capas rellenaba cada celda con `voxFill`=color representativo (plano). Ahora `drawEdit` usa `drawVoxCell(c,X,Y,W,H)`: si el voxel es textura dibuja su **cara superior +Z real** (`getTexFaces(texKeyOf(c)).faces[0]`, `imageSmoothingEnabled=false`, indexada col=x/row=y → encaja con la rejilla sin voltear); si no, `fillRect` con el color plano. Fallback al representativo mientras la textura carga (async, re-render al resolver). Se aplica en la capa actual y en la capa fantasma (respeta `globalAlpha`). `node --check` OK.
- 2026-07-21 · 🎬 **REQ-START-3D** (usuario: «que al arrancar se inicie por defecto en Edición 3D en vez de Capas»): al final del init se llama `setMode('3d')` (misma ruta que la pestaña 3D: cambia canvas, barra flotante, resize+draw) y en `index.html` la pestaña activa por defecto pasa de Capas a 3D. `mode` sigue naciendo en `'capas'` pero se conmuta antes del primer paint (sin parpadeo). `node --check` OK.
- 2026-07-21 · 🐛 **BUG-TEXSIZE** (consola: `createImageData … Value is not of type 'long'` en `buildTexFaces:769`, repetido en todos los caminos de render con textura): el `size` de un doc se serializa como **escalar** en las texturas de fábrica (`make_textures.js`, `size:16`) pero como **objeto `{x,y,z}`** en el formato del editor (`currentVox`/`localSnap`). Una textura creada/guardada desde el editor guardaba `size:{x,y,z}`; al cargarla, `def.size = {x,y,z}` (objeto truthy, no caía al `||16`) y `createImageData(obj,obj)`→NaN→excepción que abortaba cada frame. Fix: helper `texSize(sz)` que acepta escalar o `{x,y,z}` y devuelve un entero cúbico N>0 válido; aplicado en `getTexDef`, en la ingesta de `textures` embebidas y defensivamente en `buildTexFaces`. Preexistente (no relacionado con Construir/Borrar). `node --check` OK.
- 2026-07-21 · 🐛 **REQ-ERASE fix (arrastre cavaba)** (usuario: «Borrar hace algo parecido: al arrastrar borra lo que ahora se ve a través, no solo lo de esa capa; debería, como Construir, respetar las otras capas una vez iniciado el drag»): el arrastre de Borrar trazaba contra la geometría VIVA `g3d`; al quitar un voxel se exponía el de detrás y el pick lo elegía → cavaba un túnel. Mismo remedio que Construir: al `pointerdown` con la herramienta Borrar se **congela** la geometría (`dragGeom=snapshotGeom3d()`, la función `snapshotBuildGeom` se renombró a `snapshotGeom3d` por reutilizarse) y el `pointermove` traza contra ella (`pick3dAt(e, dragGeom)` → `pickVoxel3d(px,py,g)` acepta geom). Así solo se arrasa la superficie visible al empezar; volver a pasar por un hueco ya borrado es no-op. Pincel/relleno siguen con geometría viva (`dragGeom=null`). `dragGeom` se limpia en `end3d`. `node --check` OK.
- 2026-07-21 · 🔄 **REQ-ROT-KEYS** (usuario: «en edición 3D las flechas ←/→ que giren izquierda/derecha como los botones de giro»): en `mode==='3d'`, `ArrowLeft`/`ArrowRight` giran la vista con el mismo paso `±Math.PI/4` que `#e3-rot-left`/`#e3-rot-right` (`view3d.yaw += ±PI/4`, `hover3d=null`+`drawEdit3d`). Va DESPUÉS del bloque de selección, así que si hay selección con herramienta no-extrude ←/→ siguen recolocándola (`moveSel`); solo giran cuando no consumen ese movimiento. En Capas las flechas no cambian.
- 2026-07-21 · 🌑 **REQ-SHADOW** (usuario: «me gustaría que los objetos proyectasen sombras en el suelo, que haya un switch para eso»): nuevo botón 🌑 Sombra (`#modal-shadow`) en la barra de la vista grande (Ampliar), en paralelo al ☁️ Cielo; `shadowOn`/`shadowArg()` persistidos en `localStorage vf_shadow`, `syncShadowBtn` refleja el estado. En `renderFree3d(...,shadowOn)` cada voxel proyecta su huella unidad sobre el plano del suelo (`z=minz`, base del modelo) desplazada según su altura (`off=(z-minz)*GSHADOW_LEN`, dirección del sol `GSHADOW_DX/DY`), rasterizada a una **máscara** (`groundShadowMask`→`scanQuad` en `Uint8Array`) para NO apilar alfas; se compone una sola vez como mancha negra translúcida (~0.36). Dos aplicadores según ruta: canvas/`paintFace3d` = `blitShadowDecal` (drawImage sobre el fondo, tras el cielo y antes de los voxels); raster/`putImageData` = `blendShadowBuf` (mezcla en el buffer del fondo antes de rasterizar los voxels). Solo la vista grande lo pasa (Play y demás → `shadowOn` undefined = no-op). `node --check` OK; sin cambios en `server.py`.
- 2026-07-21 · 🔺 **REQ-PERSP** (usuario: «para la edición 3D quiero poder elegir, aparte de la perspectiva que hay y la frontal, una "Perspectiva Cónica (3D Lineal)"»): nuevo botón ◭ Cónica (`#e3-persp`) en la barra flotante 3D, junto a Frontal; toggle independiente (`perspOn`/`vf_persp`, `view3d.persp`), combinable con Frontal (yaw=pitch=0 + cónica = perspectiva de 1 punto clásica). `project3d` gana proyección cónica cuando `view.persp===true` (solo la edición 3D; modal/play siguen ortográficos): cada vértice se divide por su profundidad `q=PD/(PD+d)` (lo cercano crece, lo lejano mengua hacia el punto de fuga = centro del modelo). La silueta de encuadre cachea ahora también el rango de profundidad (`mind/maxd` en `_silUV`); `PD=perspStrength·radioProf` y la escala `Sp` absorbe la magnificación máxima (`near`) para que nada se salga del cuadro. Culling (`_perspProj`) y picking (`facePoly3d`→`g.screen`) usan la misma proyección → clics sobre la geometría vista. Fuerza ajustable en vivo por F12: **`game.perspStrength`** (accessor como `game.nearClip`; menor = más dramática, min 1.05, default 3.4, `vf_perspK`). Sin cambios en `server.py`. `node --check` OK.
- 2026-07-21 · 🐛 **REQ-PERSP fix (no refrescaba al conmutar)** (usuario: al activar/desactivar la vista cónica no se repintaba solo; había que mover/hacer zoom). `drawEdit3d` cachea la imagen base por `e3baseKey` y la clave NO incluía el estado de perspectiva, así que al conmutar (yaw/pitch/zoom/pan iguales) reusaba el frame cacheado. Añadidos `view3d.persp?1:0` y `_perspK` a la clave → `togglePersp`/`game.perspStrength` repintan al instante. `node --check` OK.
- 2026-07-21 · 🔺 **REQ-PERSP modal** (usuario: «en 3D pantalla completa quiero la misma vista que en editar 3D; si era cónica, cónica»): `openModal` propaga `modalView.persp=view3d.persp` (además de yaw/pitch), y la copia a media resolución del modal lleva el flag, así la vista grande (Ampliar) abre con la misma proyección que la edición 3D. `project3d` ya ramifica por `view.persp`, y la caché de silueta es independiente de W/H, así que editor y modal comparten encuadre sin contaminarse. Play sigue ortográfico. `node --check` OK.
- 2026-07-21 · 🔺 **REQ-PERSP play** (usuario: «en modo jugar también quiero la misma vista que estaba en 3D editar; si era cónica, cónica»): `playLoadRoom` propaga `PLAY_VIEW.persp = view3d.persp` antes de `renderFree3d`/`project3d`, así el modo jugar hereda la proyección de la edición 3D (la sala, el picking del suelo y la oclusión ya ramifican por `view.persp`). Dos ajustes para que sea correcto en cónica y sin regresión en ortográfica: (1) **click-to-move** — `playScreenToCell` era una inversa AFÍN de 3 puntos, que bajo perspectiva mapea a la casilla equivocada; ahora muestrea las 4 esquinas del cuadrado unidad en `z=standZ`, construye la matriz cuadrado→pantalla (forma cerrada de Heckbert) y la invierte (3×3), exacta en ambas proyecciones (round-trip verificado maxerr~1e-13). (2) **escala del jugador** — el billboard se horneaba UNA vez en el centro de la sala y solo se trasladaba; bajo perspectiva la escala varía con la profundidad (jugador ~±15% de tamaño según se acerca/aleja). Ahora, SOLO si `PLAY_VIEW.persp`, re-horneo el sprite en la celda real por `(celda,orientación)` (mismo patrón que la sombra `bakeShadowAt`) y traslado la fracción sub-celda; en ortográfica se mantiene el sprite horneado una vez (sin coste extra ni regresión). `play.spriteKey` se resetea al cargar sala. Sin cambios en `server.py`. `node --check` OK.
- 2026-07-21 · 🖼️ **REQ-PLAYFIT** (usuario: «en modo juego hay que aprovechar al máximo el espacio disponible, queda mucho margen arriba»): el encuadre del modo jugar limitaba las salas ANCHAS y BAJAS (cocina) por el ancho, dejando margen vertical (la Taberna, alta, ya llenaba el alto sin margen). Subido `PLAY_VIEW.fillX` de 1.35 a **1.8**: `S=min(W·fillX/ancho, H·fillY/alto)`, así las salas anchas se agrandan hasta ~llenar el alto (una sala ancha pasa de ~64% a ~86% de altura; verificado). `fillY` se mantiene en 1.0 para NO recortar suelo/techo de las salas altas, y como el alto está acotado por ese término el escalado nunca desborda verticalmente — solo las esquinas iso vacías se salen por los lados (comportamiento ya aceptado). Expuesto además como tunable de consola **`game.playFill`** (patrón `game.perspStrength`/`nearClip`: `game.playFill` lee, `game.playFill = 2` ajusta; mín 0.5; persistido en `vf_playFillX`; `reloadPlayRoom` re-encuadra en vivo). Sin cambios en `server.py`. `node --check` OK.
- 2026-07-22 · 🔎 **REQ-PLAYFIT 2 · zoom + subida** (usuario: «game.playFill=0.7 es lo máximo que hace, valores por encima no hacen nada… y sigue quedando margen arriba; tal vez hace falta un zoom y un offset para acercar la imagen y subirla»): diagnóstico — la sala es una CÁSCARA sin techo, así que la silueta de encuadre reserva alto para la tapa de los muros del FONDO (se proyecta arriba pero queda OCLUIDA tras los muros delanteros) → la sala está limitada por el ALTO (por eso `playFill`/`fillX` no hace nada por encima de ~0.7) y sobra margen muerto arriba. Solución: `PLAY_VIEW.zoom` (acerca) + `PLAY_VIEW.panY = -playLift·PLAY_H` (sube, fracción del alto, resolución-independiente) aplicados en `playLoadRoom` antes de `renderFree3d`/`project3d` (ambas ramas ya honran zoom y panY). Defaults **zoom 1.5 / lift 0.15**: con la sala de la cocina el techo visible pasa a y≈0 y el suelo a y≈918 de 922 (margen arriba 0). Nuevos tunables de consola **`game.playZoom`** (mín 0.2) y **`game.playLift`** (0..0.45), persistidos (`vf_playZoom`/`vf_playLift`), recarga en vivo (`reloadPlayRoom`). Sprite/sombra/click-to-move reproyectan con `play.g` (que ya lleva zoom+pan) → siguen coherentes. Sin cambios en `server.py`. `node --check` OK.

### REQ-MC · Modo «Mundo» — sandbox 1ª persona estilo Minecraft (WebGL)  —  🟨 wip
Pantalla nueva aparte del editor: 1ª persona, WASD + ratón, terreno plano, construir/romper. Requisito duro: **nunca <60fps** por muchos voxels («Minecraft corre en una Raspberry»). Render por **WebGL crudo** (sin three.js, sin build; GLSL como strings); mundo en **chunks meshados** (culling de caras internas + frustum cull + far-plane) → el coste va con chunks visibles, no con el nº de voxels. Plan completo en `.claude/plans/recursive-singing-clover.md`. Fases: F1 pantalla+GL+bucle+FPS · F2 terreno+rejilla densa+atlas · F3 meshing+shaders+cámara+cull · F4 movimiento+gravedad+colisión · F5 romper/poner+hotbar · F6 persistencia `/api/mundo`.
- 2026-07-22 · 🌍 **REQ-MC F1** (pantalla + contexto WebGL + bucle + FPS): pestaña **🌍 Mundo** (`data-tab="mundo"`→`openWorld()`) y modal `#mc-modal` a pantalla completa (canvas `#mc-canvas` WebGL, crosshair, hotbar vacía, floats `#mc-fps`/`#mc-vox`, pista WASD, ✕ Cerrar) — overlay como Jugar (no cambia de pestaña). `openWorld` crea el contexto (`webgl2`→`webgl` fallback, `clearColor` cielo `#8cc6ff`, `DEPTH_TEST`), dimensiona el canvas a `clientW×dpr` (dpr≤2) y arranca `mcTick` (rAF con delta): mide FPS reales ~cada 0.5s (calca `playTick`, alimenta `game.fps`), limpia a color cielo por GL y refresca `#mc-fps`/`#mc-vox` (`updateWorldMeters`, gemelo de `updatePlayMeters`, reusa `game.showFPS`). **Esc**/✕ cierran (`closeWorld`, rama nueva primera en el keydown global). Helpers sin deps para F3+: `mat4` (ident/mul/perspective/translate/rotX/rotY) y `glCompile`/`glProgram`. Manejo mínimo de `webglcontextlost`. Terreno/meshing/física en F2-F5. Sin cambios en `server.py`. `node --check` OK.
- 2026-07-22 · 🌍 **REQ-MC F2+F3** (terreno + rejilla densa + atlas + meshing + shaders + cámara + cull): mundo **Y-arriba**, `mc.grid=Uint16Array(96×40×96)` (`0`=aire, `>0`=id de bloque), helpers `mcIdx/mcInside/mcSolid/mcSetBlock`. `mcGenFlat` genera terreno plano (hierba en y=14, tierra 3 capas, roca debajo; spawn de pie en el centro). `mcBuildPalette` resuelve 6 assets (hierba/tierra/roca/tablones/adoquín/arena) vía `getTexDef`+`buildTexFaces` y compone un **atlas** (nBloques×6 caras) → textura GL `NEAREST` (`mcUploadAtlas`), con medio texel de inset por cara para que no sangre. `mcMeshChunk` mesha por chunks 16×16 (columna Y entera): por cada cara con vecino aire emite un quad (culling de caras internas) empaquetando `x,y,z,u,v,shade` interleaved → VBO `STATIC_DRAW`; `mcRemeshAround` re-mesha solo el chunk tocado (+vecino si toca borde) para F5. Shaders GLSL ES1.00 en línea (`texture2D`, funciona en webgl2 y webgl): vertex proyecta `uProj·uView·pos` y pasa uv/sombra/distancia; fragment textura×sombra + **niebla** por distancia hacia el cielo + `discard` de alpha. Cámara Y-arriba `view=rotX(-pitch)·rotY(-yaw)·translate(-ojo)` + `perspective(fov,aspect,0.1,far)`; `mcRender` limita coste con **distancia de render** (chunks dentro de `renderDist`) + **frustum cull** por AABB (8 esquinas contra los planos de clip). Tunables de consola **`game.fov`** (30–110°) y **`game.renderDist`** (2–24 chunks), persistidos. `game.voxels` = quads dibujados. Matrices verificadas en Node (frente `w>0`, detrás culled, `+X`→derecha, horizonte correcto). Movimiento estático aún (F4). Sin cambios en `server.py`. `node --check` OK. **Pendiente: verificación visual/GPU en navegador.**
- 2026-07-22 · 🌍 **REQ-MC F4** (movimiento: mirar + WASD + gravedad + colisión): `mc.pos` pasa a ser los **pies** (el ojo = `pos.y+MC_EYE=1.62`). **Pointer-lock**: clic en el canvas lo pide; `mousemove` mueve `yaw`/`pitch` (dcha→mirar dcha, abajo→mirar abajo; pitch clamp ±1.55). **Teclas mantenidas** en `mc.keys` (keydown/keyup con `preventDefault`; guarda `if(mc.active)`): el bucle lee **WASD** (horizontal relativo al yaw, no al pitch, normalizado × velocidad; Shift más lento), Espacio salta si `onGround`. **Física** `mcUpdate(dt)` (dt clamp 0.05): gravedad `−22`, integración **eje a eje** con AABB `0.6×0.6×1.8` (`mcCollides` barre los voxels que solapa) → resuelve X, Z, luego Y (aterriza/choca techo, marca `onGround`). Atajos del editor inertes mientras Mundo está abierto (`return` tras el Escape). `closeWorld` suelta el pointer-lock y limpia teclas. Verificado en Node: cae y descansa sobre la hierba (`y≈15`, onGround), anda a 5.2 u/s exactos, salta ~1.5 bloques y aterriza. Sin cambios en `server.py`. `node --check` OK.
- 2026-07-22 · 🌍 **REQ-MC F5** (interacción: romper/poner + hotbar): `mcRaycast` = **DDA Amanatides–Woo** desde el ojo en la dirección de mirada (`[-sin·cos, sin, -cos·cos]`), ≤6 bloques → `{cell, normal}` de la cara de entrada. **Clic izq** `mcBreak` (celda→aire), **clic der** `mcPlace` (en la vecina `cell+normal`, si está dentro, es aire y NO encajona al jugador: pone el bloque y revierte si `mcCollides`). Ambos re-meshan con `mcRemeshAround` (chunk tocado +vecino si toca borde) → coste O(chunk), fps estables. **Hotbar** `#mc-hotbar` con las 6 texturas (cara superior del atlas dibujada por ranura), ranura activa resaltada; teclas **1-9** y clic seleccionan (`mc.sel`/`mcSelectSlot`). Clic izq/der en el canvas solo actúan con pointer-lock ya activo (el 1er clic solo bloquea el puntero); `contextmenu` prevenido. Verificado en Node: mirando abajo apunta a la celda correcta con normal `[0,1,0]` (poner iría a la de encima); disparos al horizonte devuelven null (>6 bloques, fuera de alcance). Sin cambios en `server.py`. `node --check` OK.
- 2026-07-22 · 🌍 **REQ-MC F6** (persistencia en el servidor): `server.py` gana **`GET /api/mundo`** (mundo guardado o `DEFAULT_WORLD` vacío) y **`POST /api/mundo`** (validación mínima `voxels`+`dim`, respaldo con `to_trash`, guarda `data/mundo.json`) — **calca** el bloque `/api/mapa`; fichero único "sagrado" (respaldo a papelera, nunca borrado real). Sin tocar `/api/habitantes`. Cliente: `mcSerialize` vuelca la rejilla densa a mapa disperso autocontenido (`{format,dim,spawn,voxels:{"x,y,z":"tex:asset:…"}}`; los bloques son assets servidos → no embebe texturas); `mcBake` hornea un mundo guardado a rejilla+meshes (ignora bloques fuera de la paleta). **Autoguardado** con debounce 900ms tras romper/poner (`mcScheduleSave`, serializa dentro del timeout) + **volcado al cerrar** (`closeWorld`). Al abrir «Mundo», `GET /api/mundo` → si trae voxels, hornea; si no, `mcGenFlat`. Verificado por `curl`: GET default, POST guarda (`ok`), GET conserva idéntico, POST inválido→400, respaldo en `data/trash/mundo.json`. `data/mundo.json` de prueba retirado (lo creé yo). `node --check` + `ast.parse(server.py)` OK. **Falta: verificación visual/GPU end-to-end en navegador (terreno, WASD, romper/poner, fps).**
- 2026-07-22 · 🌍 **REQ-MC · tunables de ratón/cámara por consola F12** (patrón `game.nearClip`): la sensibilidad del ratón deja de estar cableada (`0.0025`) y vive en `mc.sens`. **`game.mouseSpeed`** = múltiplo de la base (1 = normal, rango 0.1–10, persistido en `vf_mcSens`). **`game.yaw`**/**`game.pitch`** en **grados**, lectura/escritura en tiempo real: se ven cambiar al mover el ratón (yaw normalizado a −180..180, pitch clamp ±89°) y asignarlos gira la cámara al instante. Los tres son `enumerable` (aparecen al teclear `game`). `node --check` OK.
- 2026-07-22 · 🌍 **REQ-MC · hotbar ampliable + selector de galería**: la barra pasa de 6 bloques fijos a **9 ranuras** (teclas 1-9): las 6 por defecto + 3 vacías. La lista de bloques se hace **mutable** (`mc.blocks`, arranca = `MC_BLOCKS`); `mcBuildPalette`/`mcUploadAtlas` operan sobre ella y `mcAddBlock(key,name)` **apenda** un ítem de la galería a la paleta (reconstruye atlas+textura GL; como el atlas crece de alto y las UV `v` cambian, **remesha** los chunks; ids estables porque solo se apenda). **Selector** estilo Mapa (`#mc-picker`, calca `.mapa-picker`): clic en ranura **vacía** (o **clic-derecho** en una llena) suelta el pointer-lock y abre una galería de **bloques + texturas** (assets + guardados, miniaturas `drawThumb`/`getRoomData`); elegir uno lo asigna a la ranura, lo selecciona y ya se **coloca** en el mundo; botón «Vaciar ranura». El *loadout* se persiste (`vf_mcHotbar` = keys) y `openWorld` reconstruye `mc.blocks` = defaults ∪ keys del loadout ∪ keys del mundo guardado **antes** de la paleta, para que todo lo colocado/guardado hornee bien en `mcBake`. **Esc de 2 pasos** (guarda `mc.unlockedAt` vía `pointerlockchange`): 1º cierra el selector o suelta el ratón, 2º cierra el Mundo. Se **quita** el mensaje `#mc-hint` («WASD moverse…»). `node --check` OK.
- 2026-07-22 · 🌍 **REQ-MC · estampar estructuras (habitaciones) + nº de bloques en la galería**: en la galería del Mundo hay ítems `type:bloque` que **no son un cubo 16³** sino **habitaciones enteras** (Taberna 112×112×52, Herrería, Mazmorra). Ahora una habitación se **submuestrea a bloques de mundo 16³** y se **estampa de un clic**. **`mcStructCells(srcKey)`** carga la sala (`getRoomData`, cacheada), agrupa sus voxels finos por celda de mundo `(cx,cy,cz)` — ojo al eje del Mundo `world=(ax,az,ay)`: `cx=⌊ax/16⌋`, `cy=⌊az/16⌋` (altura), `cz=⌊ay/16⌋` — y devuelve `{cells:[{cx,cy,cz,key}],w,h,d,count}`; **solo** entran celdas con ≥1 voxel (celda vacía = aire ⇒ «solo escribe sus bloques»). Cada celda es un bloque-textura con **clave sintética** `cell:<srcKey>@cx,cy,cz`; nueva **`mcResolveDef(key)`** (que `mcBuildPalette` usa en vez de `getTexDef`) corta la **rodaja 16³** de la sala cacheada al vuelo → cada rodaja se texturiza con el pipeline de atlas existente **sin serializar formato nuevo** (round-trip gratis: se guarda como `tex:cell:…` y se re-hornea recortando la sala). **Ranura de estructura**: `mc.slotStruct[slot]=srcKey` (paralelo a `mc.hotbar`, persistido en `vf_mcSlotStruct`); `mcAssignSlot` marca la ranura como estructura si `w|h|d>1`. **Estampado** (`mcStampStruct`, en la rama de poner-bloque apuntando con la mira): apenda de golpe las ~100 keys de rodaja a la paleta (**un solo** rebuild de atlas + `mcMeshAll`; si el atlas crece se remesha global porque cambian las UV `v` de todos), y escribe cada celda **solo sobre aire** (respeta lo ya puesto). **Galería**: cada tarjeta de estructura muestra un badge **«N bloques»** (`mcStructCells(key).count`, perezoso). Verificado headless: `node --check` OK; réplica de `mcStructCells` sobre la Taberna real = **105 bloques** de mundo (55 317 voxels finos), dims `w,h,d=7,3,7` (`7=⌈112/16⌉`; `h=3` porque la franja 48–52 no tiene sólidos → excluida), key `cell:asset:assets/taberna.vox.json@0,0,0`; `server.py` vuelca `voxels` verbatim ⇒ los `tex:cell:…@cx,cy,cz` persisten y `mcResolveDef` los re-hornea al recargar. **Falta: verificación visual/GPU en navegador** (apuntar+clic derecho monta la taberna de una pieza texturizada, se camina/choca con ella, terreno intacto; badge visible; ~390px usable).
- 2026-07-22 · 🌍 **REQ-MC · fix solidez de estructuras estampadas**: la Taberna se montaba pero se **veía a través** de paredes/suelo (zonas transparentes → cielo de fondo). Causa: `buildTexFaces` proyecta cada cara de la rodaja 16³ con un rayo por texel y escribe **alpha=0** en las columnas sin voxel; el shader las **descarta**. Los bloques normales (hierba/roca) son cubos 16³ llenos y nunca se nota, pero una rodaja de estructura (pared de 2-3 voxels dentro de una celda 16³) proyecta caras llenas de huecos. Fix en `mcBuildPalette`: para las claves `cell:` (rodajas de estructura) se pinta primero el **color dominante de la cara** (`avg[fi]`, que `buildTexFaces` ya calcula) como **fondo opaco** y encima se dibuja la proyección → cubo opaco que conserva el patrón donde lo hay y rellena los huecos (sin `discard`). Los huecos reales (vanos/puertas = celdas sin ningún voxel) siguen abiertos a propósito. `node --check` OK.
- 2026-07-22 · 🌍 **REQ-MC · rediseño: estructuras con sus VOXELES REALES (no cubos)**: el usuario rechaza el enfoque de submuestreo — «cada bloque debería tener sus voxels visibles y sus huecos originales»: quiere que la Taberna en el mundo se vea como en el editor 3D (mesas, barriles, taburetes, suelo a cuadros, vanos), no cubos texturizados macizos. **Cambio de modelo**: una estructura deja de ser N bloques 16³ en `mc.grid`; pasa a ser una **malla de sus voxeles finos reales a escala 1/16 de bloque de mundo**, con el **mismo meshing por caras** que el terreno pero fino. **2º programa GLSL** `MC_STRUCT_VS/FS` (`mcBuildStructProgram`→`mc.structProg`/`structLoc`): color **por vértice** (`attribute vec3 aColor`) en vez de atlas, mismo fog a `uSky`, opaco (sin `discard`); vértice interleaved `x,y,z, r,g,b, shade` (7 floats). **`mcStructGeom(srcKey)`** (async, cacheada en `mc.structs[srcKey].mesh`): carga la sala, resuelve cada voxel a `[r,g,b]` 0..1 (`mcHexRGB` para `#hex`; `texRepr`→color medio para `tex:…`, `getTexDef` pre-`await` una vez por clave), rejilla fina en ejes de mundo (`fx=ax, fy=az, fz=ay`), y por cada voxel/cara con vecino fino aire emite un quad a escala `1/MC_TILE` (culling idéntico a `mcMeshChunk`) → `{local:Float32Array, count, ext}`. **`mcBuildStructMesh(srcKey,ox,oy,oz)`** desplaza la geometría local al mundo → VBO `STATIC_DRAW` + `aabb`. **`mcStampStruct`** ya **no** toca paleta ni `mc.grid`: hace la malla, la apenda a `mc.structures` (`{key,ox,oy,oz,vbo,count,aabb}`) y marca la **huella gruesa** de `mcStructCells` en **`mc.structSolid`** (celdas de mundo sólidas para caminar/chocar, sin dibujar cubos). **Colisión**: `mcCollides` suma `structSolid.has(x+','+y+','+z)` a `mcSolid` (el terreno y el raycast romper/poner quedan intactos; la estructura es decorado con volumen, no rompible). **Render**: 2º pase en `mcRender` tras los chunks — `gl.useProgram(mc.structProg)`, frustum cull por `aabb` de cada estructura, VBO stride 7·4 (aPos@0/aColor@12/aShade@24), `drawArrays`, quads sumados a `game.voxels`. **Persistencia**: `mcSerialize` añade `structures:[{key,x,y,z}]`; `mcBake` las re-malla al cargar (`mcStampStruct(...,true)`). Se **revierte** el `avg`-fill y se **elimina `mcResolveDef`**/las claves `cell:` de `mcBuildPalette` (vuelve a `getTexDef` liso); `mcStructCells` se simplifica a solo la huella `{cells,w,h,d,count}` (sin `defs`). **Dato viejo**: los `tex:cell:…` que quedaran en un `mundo.json` guardado caen fuera de paleta ⇒ se ignoran al hornear (la taberna vieja de cubos desaparece; **hay que re-estamparla** con el nuevo render). Verificado headless (réplica de `mcStructGeom` sobre la Taberna real): **55 317** voxeles finos sólidos → **117 836** caras tras culling → 707 016 vértices (~19.8 MB VBO), todos los valores `#hex` (ruta de color confirmada). `node --check` OK. **Falta: verificación visual/GPU en navegador** (apuntar+clic derecho monta la taberna con sus voxeles reales —mesas/barriles/huecos—, se camina/choca, terreno intacto, recargar la conserva, fps estables; ~390px usable). Greedy meshing queda como mejora posterior.
- 2026-07-22 · 🌍 **REQ-MC · fix «me quedé atascado dentro de la sala»**: la colisión de estructuras usaba la **huella gruesa** (celdas de mundo 16³ con ≥1 voxel) → todo el volumen de una sala llena de muebles se marcaba sólido y el jugador quedaba **atrapado** al estampar donde estaba de pie. Ahora la colisión de estructuras es a **resolución FINA (1/16)**, igual que su malla: `mc.structSolid` (celdas gruesas) se sustituye por **`mc.structFine`** (Set de voxeles finos de mundo `"fx,fy,fz"`, = coord de mundo·16); `mcStructGeom` expone su Set `solid` local y `mcStampStruct` lo vuelca desplazado (`ox·16+fx,…`). `mcCollides` prueba el terreno a nivel de bloque **y** las estructuras a nivel fino en bucles separados → se camina por el interior y los **vanos/puertas**, no por la huella. Añadido **`mcUnstick`**: si tras un estampado interactivo el jugador quedó embutido (pies dentro del suelo/mueble), lo sube en pasos de 1/16 hasta quedar de pie (cap 3 bloques). Verificado headless sobre la Taberna real: de pie en el interior NO colisiona (vs. huella gruesa = 0 % transitable, todo sólido); pared/mueble sí; embutido en y=0 → `mcUnstick` lo sube a y≈0.25. `node --check` OK.
- 2026-07-22 · 🌍 **REQ-MC · retirar estructura con clic izquierdo**: no se podía borrar una sala estampada — `mcBreak` hacía raycast (DDA) solo contra `mc.grid` del terreno y las estructuras son mallas aparte (`mc.structures`), invisibles a ese raycast. Como se estampa **de una pieza**, ahora el clic izq la **retira entera**: `mcBreak` marcha el rayo desde el ojo en pasos finos (1/16, alcance 6 bloques) y **lo primero que toca gana** — si es un voxel fino de estructura (`mc.structFine`) llama `mcStructAt` (halla la instancia por su malla cacheada `mc.structs[key].mesh.solid`) y `mcRemoveStruct` (libera el VBO, la saca de `mc.structures`, rehace `mc.structFine` con `mcRebuildStructFine`, autoguarda, toast «Estructura retirada»); si es terreno, rompe el bloque como antes. Apuntar por un **vano/ventana** rompe el terreno de detrás (no hay voxel fino en medio). Verificado headless: rayo desde fuera apuntando a la pared golpea la instancia a t=1.0 bloque y la mapea correctamente. `node --check` OK.
- 2026-07-22 · 🌍 **REQ-MC · Ola 1 · tunables F12 + input** (tickets 2/13/10a/10b/9/11): **`game.reach`** (1–64, def 6, `vf_mcReach`) = alcance de romper/poner; sustituye el `MAXD=6` cableado en `mcRaycast` (cota del DDA ahora `⌈reach·3⌉+12`) y `mcBreak`. **`game.playerSpeed`** (1–40 u/s, def 5.2, `vf_mcSpeed`; Shift = mitad). **`game.playerScale`** (0.25–8, def 1, `vf_mcScale`; >1 = grande → todo se ve más pequeño): escala ojo `MC_EYE`, AABB `MC_HW/MC_PH` (locales en `mcCollides`) y la marcha; `mcUnstick` al cambiar en vivo. **`game.playerTool`** (`'build'`|`'paint'`, `vf_mcTool`): 'build' pone al lado (`mcPlace`), **'paint'** (`mcPaint`) repinta el bloque apuntado con el seleccionado (solo terreno; ranura de estructura ⇒ siempre estampa). **Construir/romper CONTINUO** (t9): mantener el botón repite la acción cada `MC_ACT_MS=140ms` en `mcTick` (`mc.heldBtn`/`mc.actAt`, helpers `mcDoAction`/`mcUseRight`); el estampado de estructuras NO se repite (una por pulsación); `mouseup`/unlock/`closeWorld` sueltan el botón. **Auto pointer-lock** (t11): moverse con WASD/salto sin el ratón capturado lo captura (`requestPointerLock` en el keydown, que es gesto de usuario). Los 4 tunables son `enumerable` (aparecen al teclear `game`). `node --check` OK.
- 2026-07-22 · 🌍 **REQ-MC · Ola 1 · galería del Mundo más densa** (ticket 5): el selector de bloques/texturas del Mundo (`#mc-picker`, clase `.mc-picker`) se agranda (`width:min(880px,95vw)`, `max-height:86vh`) y sus tarjetas se achican (grid `minmax(74px,1fr)`, menos gap/padding, nombre 11px/badge 9px) → se ven muchos más bloques de una vez. Overrides **scoped a `.mc-picker`** en `style.css`; el selector del Mapa (`.mapa-picker` sin `.mc-picker`) queda intacto.
- 2026-07-22 · 🌍 **REQ-MC · fix «al estampar una estructura-textura sale marrón lisa sin texturas»** (usuario: creó «losa grande de césped» 64×64×13, tipo Textura/pincel, y al ponerla en el Mundo salía un bloque marrón sólido sin la hierba): la malla fina de estructuras (`mcStructGeom`) resolvía cada voxel `tex:…` a **UN solo color medio** (`texRepr`) e igual en las 6 caras → una losa de césped (verde arriba, tierra a los lados) promediaba a **marrón** y se perdía la cara verde. Ahora el color es **POR CARA**, exactamente como lo pinta el editor 3D: precomputo `getTexFaces(clave).avg` (6 medias, una por cara) → `[r,g,b]` con `mcHexRGB`, y por cada `MC_FACES[f]` uso `avg[F.tex]` (misma correspondencia cara-de-mundo→cara-de-textura que usa el atlas del terreno: +Y=verde arriba, −Y/laterales=tierra). Los voxels `#hex` no cambian (mismo color en las 6 caras). Fallback a `texRepr` si la textura aún no cargó (`getTexFaces` devolvió null). Como el bloque de hierba del terreno ya rinde verde-arriba/marrón-lados con estos mismos datos, la losa saldrá verde por arriba. `node --check` OK. **Falta: hard-refresh + re-estampar la losa para confirmar el verde en navegador.**
- 2026-07-22 · 🌍 **REQ-MC · detalle de textura por téxel en estructuras** (usuario, tras el fix por-cara: «se ven los 2 colores pero sale flatted»): el color medio por cara dejaba cada cara **plana** (verde liso arriba), sin el grano de píxeles que sí muestra el terreno de alrededor. Ahora cada voxel fino **muestrea la textura en el téxel que le toca** en vez de la media: `mcFacePixels(fc)` lee los píxeles de las 6 imágenes de cara (`getTexFaces(clave).faces[fi]` → `getImageData`); `mcTexelColor(tp,fi,ep)` toma el téxel `(col,row)` según los ejes `du/dv` de esa cara (`CUBE_UV`, = los mismos que usa `buildTexFaces` al pintar), tileado por bloque de mundo con el flip de signo correcto → **1 téxel por voxel fino, alineado al bloque de mundo** = misma densidad y fase que el terreno ⇒ **seamless** con la hierba de alrededor y con grano real (no plano). La media por cara queda de **fallback** (textura sin cargar o téxel transparente); `#hex` sin cambios. Verificado headless: las 6 caras muestrean sus 2 ejes tangentes (nunca la normal) y la cara superior da `col=fx%16, row=fz%16` (igual que el terreno). `node --check` OK. **Falta: hard-refresh + re-estampar la losa para confirmar el grano en navegador.**
- 2026-07-22 · 🌍 **REQ-MC · `game.texturesDetail` — detalle de textura de estructuras configurable** (usuario: «en el editor pantalla completa se ven más detalles que en el juego; si es configurable quiero fijarlo desde F12 tipo `game.texturesDetail=xx`»): el editor 3D pinta la **textura completa en cada voxel** (`drawTexFace`); la estructura en el Mundo usaba 1 téxel por voxel ⇒ menos detalle. Nuevo tunable **`game.texturesDetail`** (1–16, def **1**, `vf_mcTexDetail`, `enumerable`): **1** = 1 téxel/voxel (lo actual, seamless con el terreno); **2..16** = cada cara del voxel se **subdivide en D×D sub-quads** y se pinta con la **textura completa por voxel** como el editor (**16** = idéntico al editor, bijección exacta voxel→téxel verificada headless). Descriptor **`MC_SUB`** (por cara) alinea los ejes col(`du`)/fila(`dv`) de la imagen con las aristas de mundo `eA=c1-c0`/`eB=c3-c0` y su signo → orientación igual que `buildTexFaces`. Cambiar el valor **re-malla en vivo** todas las estructuras (`mcRestampAll`: invalida `mc.structs[*].mesh`, reconstruye cada VBO en su sitio, rehace `structFine`) y persiste; si el Mundo no está activo solo invalida la caché (rebuild al reabrir). **Guardia de rendimiento**: el coste crece D², así que `mcStructGeom` acota los sub-quads por estructura a `QBUDGET=800k` (~134 MB VBO) bajando D efectivo con aviso por consola (salas grandes tipo Taberna a D alto quedan limitadas). `node --check` OK; bijección D=16 verificada headless (caras 0 y 2, 256 téxeles únicos). **Falta: hard-refresh → subir `game.texturesDetail` y confirmar el detalle en navegador.**
- 2026-07-22 · 🌍 **REQ-MC · estructuras texturadas de verdad (atlas + shader del terreno) — retiro de `texturesDetail`** (usuario: «no me deja» subir `game.texturesDetail` en salas grandes → lo capaba `QBUDGET` a D=2 porque la subdivisión es **cuadrática** y la Taberna/Herrería ya tienen ~120k/99k caras a nivel 1). **La subdivisión no escala.** Rediseño al motor que ya usa el terreno: cada voxel `tex:` de una estructura se pinta con la **textura completa vía atlas + UVs + sampler**, a coste de geometría de **nivel 1** (sin subdividir, **sin tope**), aunque sea la Taberna. Nuevo estado `mc.structAtlas`/`structAtlasTex` + `mc.structUV={clave→[6 rects UV]}`; **`mcBuildStructAtlas()`** (gemelo de `mcBuildPalette`/`mcUploadAtlas`) recolecta las **claves `tex:` distintas** de las estructuras vivas (pocas → atlas pequeño), compone las 6 caras de cada una (`buildTexFaces(getTexDef(clave)).faces`, 16px, NEAREST, ½ téxel de inset como el terreno) y sube la textura GL. **`mcStructGeom`** deja de subdividir y emite **DOS flujos** locales: `col` (voxeles `#hex` siempre, y los `tex:` cuando `game.structTextures=false` → media por cara) en 7 floats (x,y,z,r,g,b,shade) y `tex` (voxeles `tex:` con texturado) en 6 floats (x,y,z,u,v,shade), con UV del rect `structUV[clave][F.tex]` mapeado **igual que el terreno** (`mcMeshChunk`: esquinas `[0,1,2,0,2,3]`, `uv=[[u0,v0],[u1,v0],[u1,v1],[u0,v1]]`) ⇒ orientación idéntica a un bloque. Cache `mesh={colLocal,colCount,texLocal,texCount,ext,solid}`; **`mcBuildStructMesh`** sube **dos VBO** (`{...,colVbo,colCount,texVbo,texCount,aabb}`). **Render** (`mcRender`, sección de estructuras) = **dos pasadas** frustum-culled por `aabb`: (1) color por vértice con `mc.structProg` (como antes); (2) texturado **reutilizando el shader del terreno `mc.prog`** con `mc.structAtlasTex` enlazado (stride 6·4, sus uniformes siguen puestos del pase del terreno) — **sin shader nuevo**. `mcStampStruct` detecta claves `tex:` nuevas ⇒ recompone atlas + `mcRestampAll` (como el terreno remesha al crecer su atlas); `mcBake` apila las instancias y deja que `mcRestampAll` componga el atlas **una vez** (evita la carrera de estampar N a la vez). Se **elimina** `MC_SUB`, `CUBE_UV`, `mcFacePixels`/`mcAxisCoord`/`mcTexelColor`, `mc.texDetail`, `QBUDGET` y `game.texturesDetail`. Nuevo tunable **`game.structTextures`** (bool, def **true**, `vf_mcStructTex`, `enumerable`): `true` = texturado real (detalle del editor, coste nivel 1, sin tope) · `false` = color plano por cara (media, más barato) como escape; cambiarlo re-malla en vivo (`mcRestampAll`) y persiste. Colisión fina (`mc.structFine`), persistencia (`structures:[]`) y estampado por clic derecho **sin cambios**. `node --check` OK. **Falta: hard-refresh → estampar Taberna/Herrería y confirmar textura completa por voxel a 60fps; `game.structTextures=false/true` alterna plano/texturado.**
- 2026-07-22 · 🌍 **REQ-MC · Ola 2 · atajos de hotbar y herramienta** (tickets 4/6): **Alt+número** abre el selector (`mcOpenPicker`) de esa ranura sin salir + Esc + clic derecho sobre la ranura (número solo = seleccionar ranura, como antes). Teclas **`p`/`b`** en el Mundo fijan el clic derecho a **Pintar**/**Construir** (`mcSetPlayerTool`, gemelo del setter `game.playerTool`, persiste `vf_mcTool` + toast); `game.playerTool` reusa el mismo helper. `node --check` OK.
- 2026-07-22 · 🌍 **REQ-MC · Ola 2 · colocación precisa + avisos de alcance/colisión** (tickets 1/5/2): tres ayudas de colocación/depuración dibujadas como **overlay** (nuevo `mcDrawOverlays` al final de `mcRender`, VBO reutilizable `mc.ovbo`, con el programa de estructuras `mc.structProg`; no suman a `game.voxels`). **(#5) Colocación precisa de estructuras**: al **mantener el clic derecho** sobre una ranura-estructura ya NO se estampa al pulsar — aparece un **fantasma** (caja de aristas verde de la huella `mcStructCells`) que sigue la mira; se estampa al **soltar** (`mousedown` difiere si `mc.slotStruct[mc.sel]`; `mouseup`→`mcPlace()`). Bloques normales/pintar siguen actuando al pulsar. **(#1) Aviso «demasiado lejos»**: mientras juegas con algo que colocar, si `mcRaycast(mc.reach)` no encuentra sólido dentro del alcance pero sí hay uno más lejos (`mcRaycast(min(80, renderDist·16))`), se marca ese bloque lejano con una **caja ámbar discreta** (`0.95,0.55,0.15`) → sabes que ahí no llegas; con hueco válido a tiro, caja **verde** (`0.42,1,0.55`). `mcRaycast(maxd)` generalizado para aceptar alcances distintos al de romper/poner. **(#2) Rayos-X (tecla `X`)**: `mcXrayVolume` rellena de translúcido (blendColor α=0.38, **sin `DEPTH_TEST`** → se ve a través de paredes) el **volumen de colisión** alrededor del jugador: terreno sólido en radio 3 (rojo `0.95,0.2,0.2`) + voxeles finos de estructura (`mc.structFine`) que solapan el AABB del jugador+margen (naranja `1,0.55,0.1`) → justifica visualmente por qué no avanza (bloque invisible/mueble que choca). Toast ON/OFF; es modo depuración, sin texturas reales. `node --check` OK. **Falta: hard-refresh + verificar en navegador (fantasma sigue la mira y estampa al soltar; ámbar al apuntar lejos; X pinta el volumen a través de muros).**
- 2026-07-22 · 🌍 **REQ-MC · Ola 2 · orientar la sala al jugador al estamparla** (ticket 3; el usuario eligió «mirando al jugador (gira)»): la habitación dejaba de girar — el swap fijo `fx=ax,fy=az,fz=ay` la ponía siempre mirando a un eje fijo del mundo sin importar desde dónde la coloques. Ahora se **gira un cuarto de vuelta** alrededor del eje vertical según **hacia dónde mira el jugador** (`mcYawToRot`= `round(yaw/(π/2))&3`), ajustado a la dirección cardinal más cercana → la coloques desde donde la coloques, su frente te «mira». **Geometría por rotación**: `mcStructGeom(srcKey, rot)` pasa a **dos pasadas** — 1ª: coords finas base (swap del terreno) + extensiones base; 2ª: **`mcRotXZ(x,z,rot,W,D)`** gira el plano horizontal `(fx,fz)` (la altura `fy` no cambia; rot impar intercambia ancho↔fondo) — y **cachea por `(srcKey, rot)`** en `mc.structs[srcKey].meshRot[rot]` (antes `.mesh` único). `mcBuildStructMesh`/`mcStampStruct` reciben `rot`; la instancia guarda `s.rot`; **colisión** (`mcRebuildStructFine`) y **retirada** (`mcStructAt`) leen `meshRot[s.rot]`; `mcRestampAll` re-malla con el `rot` de cada instancia; el **fantasma** (`mcDrawOverlays`) intercambia w↔d en giro impar para que la caja coincida. **Persistencia**: `mcSerialize` añade `rot` a `structures:[{key,x,y,z,rot}]` y `mcBake` lo re-hornea (formato `voxelworld-1` intacto salvo el campo nuevo; por defecto `rot=0` en mundos viejos). Verificado headless: `mcRotXZ` es **biyección** en rango para los 4 giros, las extensiones se intercambian en 90°/270°, y `rot1∘rot1 = rot2`. `node --check` OK. **Falta: hard-refresh + verificar en navegador que la sala se orienta hacia el jugador (colocarla mirando N/S/E/O la gira 0/180/90/270°) y que colisión/retirada/recarga respetan el giro; si el frente sale girado 90°/180°, ajustar el offset de `mcYawToRot`.**
- 2026-07-22 · 🌍 **REQ-MC · `game.tooFarAlpha` — transparencia del aviso «demasiado lejos» por consola F12** (usuario: «quiero poder configurar la transparencia del aviso de "demasiado lejos" desde F12, de 0 a 1»): el marcador ámbar se dibujaba con el resto de líneas del overlay (opaco, sin control). Ahora va en su **propio flujo** `farLines` y se dibuja con **mezcla por alfa constante** (`blendColor(0,0,0,mc.tooFarAlpha)` + `blendFunc(CONSTANT_ALPHA, ONE_MINUS_CONSTANT_ALPHA)`, igual que rayos-X pero con `gl.LINES`, respetando la profundidad). Nuevo tunable **`game.tooFarAlpha`** (0..1, def **0.6**, `enumerable`, persistido en `vf_mcTooFarAlpha`): **0** = invisible (no se dibuja), **1** = opaco; se ve en vivo al asignarlo. El fantasma verde de colocación sigue opaco (flujo `lines` aparte). `node --check` OK.
- 2026-07-22 · 🌍 **REQ-MC · `game.ghostAlpha` — la transparencia aplica a AMBAS cajas (verde + ámbar)** (usuario: «cambia el alpha del cuadrado rojo pero no del verde»): `game.tooFarAlpha` solo controlaba el marcador ámbar «demasiado lejos»; el fantasma verde de colocación se dibujaba opaco aparte. Se **unifica**: ambas cajas van al mismo flujo `lines` y se dibujan con una **única mezcla por alfa constante** (`blendColor(0,0,0,mc.ghostAlpha)`), así el mismo control regula verde y ámbar. Tunable renombrado a **`game.ghostAlpha`** (0..1, def 0.6, persistido en `vf_mcGhostAlpha`, migra el valor viejo de `vf_mcTooFarAlpha`); **`game.tooFarAlpha` queda de alias** del mismo valor (no rompe lo ya tecleado). `0` = ambas invisibles, `1` = opacas. Se retira el flujo `farLines`. `node --check` OK.
- 2026-07-23 · 🌍 **REQ-MC · luz en estructuras estampadas: oscurecer por skylight + luz de bloque emisiva** (plan `recursive-singing-clover`): las estructuras (Taberna, «llama» rosa emisiva…) se dibujaban **a pleno brillo sin sombra**, sin importar dónde cayeran, mientras el terreno sí se oscurece por el skylight (`mc.light`+`game.interiorDark`). Dos partes. **Parte A — oscurecer por skylight**: la estructura se oscurece por la luz del entorno **igual que el terreno**. Como el `shade` se hornea por vértice en build (donde no hay normal), `mcStructGeom` emite ahora una **celda-muestra por CARA** (no por vértice) en arrays paralelos `colSC/alphaSC/texSC` (Int16, 3 enteros = celda de BLOQUE del lado aire, relativa al origen): `sx=floor((base+F.dir)/MC_TILE)` en `emitQuad`, mismo push que col/alpha/tex. `mcBuildStructMesh` construye el `lightLut` con la fórmula exacta del terreno (`interiorDark^((MAX-lv)/MAX)`) y **hornea `shade*=lightLut[lv]`** por cara (6 vértices; offset 6 en col/alpha stride 9, offset 9 en tex stride 10), con `lv=max(skylight, luz de bloque)` muestreado en la celda de mundo (`ox+sc…`); fuera de rejilla = cielo = pleno (como el terreno). Caras emisivas: el shader ya ignora `vShade` ⇒ multiplicar es no-op. Guard `doLight=(interiorDark<1||hasGlow)&&(light||blockLight)`: sin luz activa, factor 1 (comportamiento de hoy). **Parte B — luz de bloque emisiva**: los voxeles `*#hex` (`isGlow`) emiten luz **escalar/neutra** (v1, no tiñe) que se difunde por el AIRE e **ilumina terreno y estructuras vecinas**. Estado nuevo en `mc`: `blockLight` (Uint8Array 0..MAX), `glowLevel:13` (siembra), `hasGlow:false` (cache para saltar el BFS sin emisivos). `mcStructGeom` recolecta `emitCells` = celdas-de-bloque locales `(floor(fx/16),…)` con ≥1 voxel emisivo (cacheado en la malla, honra `rot`). **`mcComputeBlockLight()`** (gemelo de `mcComputeLight`): sin `hasGlow` o `glowLevel<=0` → `BL.fill(0)`+return (coste 0); si no, siembra desde las celdas emisivas de cada estructura (celda propia si es aire + 6 vecinos de aire) a `lv0=min(MAX,glowLevel)` y **BFS por buckets idéntico** (−1/paso, solo por aire). `mcMeshChunk` combina `lv=max(L[idx],BL[idx])`. Recomputo en los eventos correctos: `mcMeshAll`/`mcRemeshAround` (tras `mcComputeLight`), `mcStampStruct` (si la nueva tiene brillo: `hasGlow=true`+block-light+`mcRestampAll`/`mcMeshAll`), `mcRemoveStruct` (si la retirada brillaba: recomputar `hasGlow`+block-light+`mcMeshAll`), `mcRestampAll` (recomputa `hasGlow`+block-light **antes** de reconstruir instancias — las viejas conservan `emitCells` posición-independiente — así `mcBuildStructMesh` muestrea luz fresca; corrige luz estructura-sobre-estructura y post-edición). **Tunable `game.glowLevel`** (0..MC_MAXLIGHT, def 13, `vf_mcGlow`, `enumerable`): recalcula block-light + re-malla + re-hornea estructuras; en `dumpVars`. Además el setter de **`game.interiorDark`** ahora también `mcRestampAll()` si hay estructuras (se re-oscurecen en vivo). Solo `app.js`; sin tocar index.html/style.css/server.py. **v1 aprox. documentadas**: (1) cara greedy muestrea solo su celda-min del lado aire; (2) luz de bloque a resolución de bloque (16³), no por-voxel-fino; (3) una estructura no re-muestrea luz tras edición/estampado vecino hasta el próximo `mcRestampAll` (lo dispara cualquier setter de tunable); (4) luz de bloque escalar/neutra (sin tinte). `node --check` OK. **Falta: hard-refresh (DevTools CERRADO) → estampar Taberna en sala sin luz (se oscurece) vs. cielo abierto (clara); llama emisiva enciende la pared/terreno detrás; `game.glowLevel`/`game.interiorDark` en vivo y persisten; 60fps con Taberna+emisivos; rotación/colisión/translúcidos/persistencia intactos; ~390px usable.**
- 2026-07-23 · 🕹️ **REQ-MC · air-strafe estilo Quake** (usuario: «cuando salto corriendo y giro el ratón, en el aire me muevo hacia donde apunto en lugar de seguir el salto previsto; en Quake sigues la dirección ya calculada»): antes `mcUpdate` **reescribía** la velocidad horizontal cada frame desde la dirección de vista (`mx/ml*sp`) → girar el ratón en el aire redirigía el salto. Ahora, con **`mc.airControl`** on y en el aire, la velocidad horizontal **no se reescribe**: se conserva la inercia del salto (soltar teclas no frena) y W/A/S/D solo **aceleran de forma acotada por EJES SEPARADOS** — adelante/atrás (`fwd`) y strafe lateral (`right`), cada uno contra SU propia componente de velocidad. Clave del diseño: con un único wishdir, correr con W hacía que W+D apuntara en diagonal y la proyección ya superaba el tope → A/D no se notaba; al separar ejes, el lateral siempre desvía aunque mantengas W. La componente por eje no pasa de **`airCap·√scale`**; como `airCap`(3) < velocidad de salto (8·√scale) no hay acel. recta gratis hacia delante (anti-truco), y el strafe-jump sale de combinar A/D con giro del ratón (rota el eje `right` → deja ganar velocidad). En **suelo** (o `airControl` off) se mantiene el clásico (velocidad directa, responsiva, frena en seco). Tunables nuevos `game.*` + localStorage + `dumpVars`: **`airControl`** (bool, def true, `vf_mcAirCtl`), **`airAccel`** (0..50, def **6**, `vf_mcAirAccel`), **`airCap`** (0..20, def **3**, `vf_mcAirCap`). Además se fija `game.mouseSpeed=0.25` por defecto (`mc.sens` 0.001→0.000625). Solo `app.js`. `node --check` OK.
- 2026-07-23 · 🗺️ **REQ-MC · elegir mapa por URL: `/map/<nombre>` = mundos persistentes con nombre** (usuario: «desde la URL quiero elegir el mapa; `/map/default` = el actual, `/map/loquesea` uno cualquiera que puede empezar vacío; los cambios persisten igual que en default»). Toca `server.py` + `index.html` + `app.js` (primer cambio fuera de `app.js` en el Mundo; imprescindible por el enrutado/almacenamiento). **Servidor**: `world_file_for(name)` mapea el nombre→fichero: `default` (o vacío) = el `mundo.json` **sagrado** de siempre; cualquier otro = `data/worlds/<slug>.json` (dir nuevo, creado al arrancar). El slug se acota a `[a-z0-9-]` ⇒ **sin `../` ni barras**, imposible salir de `data/worlds/` (verificado: `?map=../../pwned`→`pwned.json` dentro de worlds/). `GET`/`POST /api/mundo` aceptan `?map=<nombre>` (parseo con `urllib.parse`, respetando el path sin query); el `POST` respalda el mundo anterior a la papelera igual que antes. **SPA**: `GET /map/<nombre>` (y `/map`) sirve el **mismo** `index.html` (fallback en `do_GET`); para que los assets carguen bajo esa ruta, `index.html` pasa a rutas **absolutas** (`/style.css`, `/app.js`). **Cliente**: `mcMapName()` lee el nombre de `location.pathname` (`/^\/map\/([^\/?#]+)/`, si no `default`); `mcWorldUrl()` añade `?map=` a los 3 fetch de `/api/mundo` (cargar en `openWorld`, recargar en `reloadWorld`, guardar en `mcSaveWorld`); al arrancar, si la URL es `/map/…` se entra directo al Mundo (`openWorld()`). Accesorios `game.mapName` (getter) y `game.map('loquesea')` (navega recargando en `/map/loquesea`; slug igual que el server; `default`/vacío → `/`). Un mapa nuevo devuelve `DEFAULT_WORLD` (voxels vacío) → el cliente genera **terreno plano** (`mcGenFlat`) y al primer edit se guarda en su propio fichero (persistente). El `default`/`mundo.json` no se toca (110243 voxels intactos, accesible por `/`, `/map/default` y `?map=default`). `node --check` + `ast.parse` OK; probado por `curl` (SPA 200 text/html, assets 200, load/save/reload por mapa, default intacto, traversal contenido).
- 2026-07-23 · 🐛 **REQ-MC · fix: terreno rosa (texturas sin cargar) bajo `/map/<nombre>`**. Al entrar por `/map/default` el terreno salía casi todo magenta (color de textura ausente) aunque las estructuras sí texturaban. Causa: además de `style.css`/`app.js`, quedaban fetch **relativos** (`fetch('assets/index.json')`, los `file:'assets/…'` del índice y las claves `asset:`) que bajo `/map/…` resolvían a `/map/assets/…` → 404 → atlas con el fallback rosa. Fix de raíz: `<base href="/">` en el `<head>` de `index.html` ⇒ **todas** las rutas relativas (fetch y `url()` en atributos style) resuelven contra la raíz sea cual sea la URL. No hay anclas `#`/enlaces relativos que se vean afectados. Verificado por `curl`: el HTML servido en `/map/default` lleva el `<base>`, y `assets/index.json` + `assets/*.vox.json` dan 200.
- 2026-07-23 · 🧹 **REQ-MC · `game.wipeMap([nombre][,true])` — borrar todos los bloques de un mapa** (usuario: «una función que borre todos los bloques del mapa; ¿con un snippet? y ¿qué garantía hay de que borro el mapa que quiero, si para ejecutar el snippet tengo que salir al editor 3D?»). El riesgo era real: `window.setVoxel` **despacha según el estado** — con el Mundo abierto edita la rejilla del mapa, con el Mundo cerrado edita el **objeto del editor** (`state.voxels`), así que un bucle de `setVoxel` lanzado desde el editor NO tocaría el mapa. (Matiz: el botón ▶ de snippets **reabre el Mundo** antes de ejecutar, pero seguía sin ser garantía.) Solución robusta que no depende de eso: `game.wipeMap` **escribe directo en el servidor** apuntando al mapa por **nombre explícito** (`POST /api/mundo?map=<slug>` con `voxels:{}`), conservando `dim`; sin argumento usa el de la URL `/map/<n>` (o `default`). Funciona con el Mundo abierto o cerrado (consola F12 o snippet), pide confirmación (salvo 2º arg `true`), y es **reversible**: el servidor respalda el mundo anterior en la papelera antes de sobrescribir. Un mapa vacío recarga como **terreno plano** (`mcGenFlat`); si es el mapa cargado en ese momento, se refresca en vivo (`mcGenFlat`+`mcMeshAll`). Solo `app.js`. `node --check` OK; ruta de servidor probada por `curl` (siembra→wipe→respaldo en papelera).
- 2026-07-23 · 🐛 **REQ-MC · fix: `Uncaught (in promise) SecurityError` del pointer-lock al entrar/re-capturar el ratón**. `requestPointerLock()` devuelve una **promesa** que rechaza (`SecurityError: Pointer lock cannot be acquired immediately after user has exited lock`) si se pide dentro del enfriamiento tras salir del lock; los 3 sitios que la llamaban (`mcRelock`, clic en `#mc-canvas`, tecla WASD para recapturar) usaban `try/catch` **síncrono**, que no atrapa el rechazo → error suelto en consola (lo vio el usuario al aterrizar en `/map/favicon`, que autoabre el Mundo). Se unifican en `mcLockPointer()`, que **traga el rechazo de la promesa** (`p.catch(()=>{})`) además del throw síncrono; el ratón simplemente se captura en el siguiente clic/tecla. Sin cambio funcional. Solo `app.js`. `node --check` OK. (Las advertencias `setVoxel: material desconocido "sandstone"/"stone_bricks" → uso roca` NO son un fallo: vienen del snippet «Pirámide Maya», que pasa nombres de material fuera de la paleta; el bloque cae a `roca` y la pirámide se construye igual.)
- 2026-07-29 · 🗺️ **`/map/` = listado de mundos con miniatura cenital y estadísticas** (usuario: «si accedo a `http://…:8500/map/` quiero ver un listado de los mapas disponibles, con estadísticas/metadatos que se puedan sacar; prepara un artefacto visual para ver cómo quedaría» → maqueta `_maqueta_mapas.html` aprobada → «ok, implementar»). **Cambio de comportamiento**: `/map` y `/map/` servían la SPA (abrían el mundo sagrado); ahora sirven `mapas.html`. `/map/<nombre>` **no cambia** (sigue siendo `index.html`), así que el mundo por defecto pasa a estar en `/map/default` — el bug más fácil aquí es que el botón «Abrir» del default enlace a `/map/`, o sea al propio listado (guardado en test). Ficheros: **`mundos.py`** (nuevo, todo el cálculo fuera de `server.py`), **`mapas.html`** (nuevo, vanilla, mismo tema oscuro), `server.py` (+2 rutas: `/map/` y `GET /api/mundos`), `CLAUDE.md`. **Miniatura**: vista cenital sin render 3D — por columna `(x,z)` el voxel más alto, pintado con el color **real** de su material = media de la cara superior de su textura (`color_de_material` resuelve los dos espacios de nombres, `tex:asset:assets/X.vox.json` → el fichero, `tex:hab:<id>` → `data/habitantes/<id>.json`; los assets usan **Z como altura**). La primera versión adivinaba el color por el *nombre* con un diccionario corto y todo lo no reconocido caía en un gris-morado, y encima sombreaba `0.55+0.45·(y/ymax)` ⇒ el usuario: «el mapa lab tiene setas rojas que se deberían ver desde el aire pero el mock no las muestra de colores, parte se ve con unos tonos muy apagados». Ahora el relieve va por **luz rasante del noroeste** (desnivel con el vecino, ±27 %) y solo queda una pizca de altitud (0,95–1,05): los 26 materiales de los 7 mundos se resuelven, ninguno cae en el gris. **Coste**: en frío son ~33 MB de JSON (1,05 s) ⇒ cache en `data/_thumbs/<slug>.json` invalidada por `mtime+tamaño`; medido: frío 1,05 s → caliente 1,2 ms; tocando un solo mundo, 0,19 s. Estadísticas por mundo: dim, voxels, estructuras y tipos, notas, materiales, altura máx, MB, % de terreno cubierto y los 4 materiales más usados; la página filtra por nombre/material y ordena por fecha/voxels/estructuras/nombre. Sin acciones destructivas (renombrar/duplicar/borrar) — solo «Abrir». `node test_mapas.js` (18 ok) guarda las tres cosas frágiles: que ningún «Abrir» apunte a `/map/`, que `/map/<nombre>` siga sirviendo la SPA y **en píxeles** que las setas de `lab` salgan rojas (2144 px rojos, 476 grises de 36864). Suite completa verde (12 ficheros, 170 ok).
- 2026-07-29 · 🔢 **«Pasos sin celda nueva» no contaba pasos — `stepsWithoutNewCell` arreglado (librería v4.38)** (usuario, tras leer el primer informe de atascos: «1» = arregla solo el defecto 1 y vuelve a pedirme el informe para comparar). Lo destapó el propio informe: `Constructor Héroe (Tejado)`, encajonado en un pasillo de 1 de ancho a `x=91`, llevaba **975 pasos con 0 celdas ganadas** y su ficha decía `pasosSinProgreso 18`. Como ese contador es la entrada de **todo** lo que decide un rescate (umbral de §17, `game.stuck()`, veredicto del informe), mientras miente no hay diagnóstico. Mentía por **dos** motivos, no uno: (a) ocho `= 0` repartidos por la escalera lo reiniciaban al **lanzar** la maniobra —desvío ortogonal, desmonte, `minadoEmergencia`, `saltoTactico` (incluso devolviendo `false`) y el fondo de la escalera—, así que por construcción no podía pasar del umbral; (b) **`LOOP_ESCAPE_2CELL` y `FREQ_BREAK` caminan y hacen `return` antes de la contabilidad del final del tick**, o sea que el agente que más escapaba era el que menos se anotaba, y no solo el contador: `visited`, `visitedPlanar`, `historial` y `pathHistory` se quedaban sin las columnas realmente pisadas (frontera BFS sobre un mapa falso). Arreglo: la contabilidad sale a **`anotarPaso(a)`** y la llaman los tres caminos; el único reinicio es pisar columna nueva (más las reubicaciones de verdad: salto táctico consumado, teletransporte al suelo, reaparición de la serpiente); lo que se apunta al intentar un rescate es **`v.rescateEnPaso`** y la cadencia de la escalera se mide con la **resta**, que vale exactamente lo que valía antes el contador ⇒ **la escalera se dispara igual de a menudo**. Los dos umbrales de conducta que leían el contador en crudo (lava de §13, `EDGE_DROP` de torre) usan también la resta para no cambiar de comportamiento de rebote. Solo `data/snippets/base-npc-skills.json` (§0 respetada; `app.js` intacto) + `REGLAS_AGENTES.md` §21.b. **`node test_contador_celda_nueva.js` (14 ok) es diferencial**: monta el pasillo del caso real con la librería de `HEAD` y con la actual — el contador pasa de congelarse en **9** a llegar a **138** con 150 pasos y la ficha de `game.stuck()` de `9/18` a `138/18`, mientras que pasos dados, celda final, columnas descubiertas y **los ticks exactos en que se dispara la escalera** son idénticos. Suite completa verde (13 ficheros, 184 ok). **Lo que este arreglo NO arregla y enseña la misma prueba**: con el contador honesto la escalera **sigue siendo inalcanzable** para ese agente, porque `FREQ_BREAK` se dispara cada tick, rearma `escapeSteps = 3` y hace `return` antes de llegar a ella (120 ticks seguidos en la prueba); vive permanentemente «escapando», así que ni escala a minado/salto ni agota la cuenta atrás. Ese es el defecto siguiente, y ahora el informe lo mide.

- 2026-07-30 · ⏳ **`FREQ_BREAK` deja de ser preferente + el informe deja de decir «ok» a todo (librería v4.39)** (usuario, tras revisar el segundo informe de atascos: «1 y 2» = las dos cosas a la vez). **(1) El peldaño con presupuesto.** Arreglado el contador de §21.b, la escalera de §6 **seguía sin alcanzarse**: `FREQ_BREAK` se dispara por *cadencia*, se queda el tick y hace `return`, así que el agente vivía permanentemente «escapando» —ni minado, ni salto táctico, ni cuenta atrás agotada, ni nota de §17—. Ahora lleva `v.freqBreakSinCelda` y tras `FREQ_BREAK_MAX_SIN_CELDA` (**12**) disparos **sin descubrir columna nueva** deja de capturar el tick y el control cae por la escalera; el contador se pone a cero en `anotarPaso` al pisar columna nueva, o sea que si el peldaño sirve sigue mandando. Regla general anotada en §5 y §21.c: **ningún peldaño que se dispare por cadencia puede capturar el tick indefinidamente**. **(2) Los tres puntos ciegos del informe** (§23), que es por lo que el defecto (1) no se veía solo: el informe del 30/7 salió con ~100 filas y **todas decían `ok`** con cinco agentes a 975 ticks sin ganar una celda. `FREQ_BREAK` ganó **110 celdas en 19.215 ejecuciones** (0,006/vez) y por no ser cero exacto pasaba por bueno ⇒ columna **`celdas/vez`** y veredicto **`ESTÉRIL`** (≥20 juzgadas y tasa < 0,05), con R1 citando **el mejor peldaño del propio agente** para no depender de un número mágico; **R2** (celda imán) colgaba del caso «no cambió de celda», justo el que no se da en un peldaño que camina ⇒ era **inalcanzable**, ahora cuelga sola de `mismaPos >= 10`; y el suelo de área de **R8** pedía ≥100 celdas cuando **la caja la dibuja el propio agente** (cuanto más atascado, más pequeña: los cinco atascados tenían cajas de 48..72, uno pisaba 6 de 72 = 8 %) ⇒ suelo **25**. De paso, la versión de la librería vive ahora en **`VERSION_LIB`**: la sección 0 anunciaba `v4.37` con la librería en `v4.38`, que es justo el dato que sirve para saber si la pestaña recargó. Solo `data/snippets/base-npc-skills.json` (§0 respetada; `app.js` intacto) + `REGLAS_AGENTES.md` §5/§21.b/§21.c/§23. **Medido**, mismo pasillo de juguete pero **con salida** (`minadoEmergencia: true`, 400 ticks): antes `FREQ_BREAK` ×379 y **0 bloques picados** —el minado estaba encendido y no se usó ni una vez—; ahora `FREQ_BREAK` ×36, `EMERGENCY_MINE` ×6 y **14 picados**. `node test_contador_celda_nueva.js` (13 ok) fija ahora su referencia en **commits concretos** (`c070444~1` y `c070444`), no en `HEAD` —contra `HEAD` la prueba dejaba de medir lo mismo en cuanto se comete el arreglo siguiente—, y se le cayeron las aserciones de «misma cadencia», que era justo lo que este cambio tiene que romper. `node test_informe.js` (34 ok) cubre los tres puntos ciegos con casos propios. **Trampa encontrada en los mundos de juguete**: con `matId: () => 1` el envoltorio de protección de obsidiana toma toda la piedra por obsidiana y **no se pica nada** — la prueba daba «0 picados» por el motivo equivocado. Suite completa verde (13 ficheros, 189 ok).

- 2026-08-02 · 🧟 **Agentes articulados, fase 1** (`game.esqueletos`, y el primero: un zombie tipo Minecraft: parado en su sitio hasta que te acercas, y entonces gira hacia ti y te persigue **andando**, con los brazos levantados, la cabeza siguiéndote y las piernas moviéndose). El sistema es **agnóstico**: la librería recibe un documento con piezas, articulaciones y guion, y no sabe qué es un zombie — el mismo motor vale para una cabra pastando o un objeto mecánico. Un rig es **por instancia** (el brazo izquierdo y el derecho son el mismo material con distinta fase), así que vive en un registro aparte `esqueletos[]` y no en la tabla por material de `game.bloques`; la persecución **no se reimplementa**: se extrajo `pasoSeguir(...)` de `seguirObjetivos` y la llaman los dos caminos, así que `seguir` (v1.18) no cambia de comportamiento. **Las piezas son efímeras** (`s.efimera`, único cambio en `app.js` — excepción al §0 aprobada por el dueño — en `mcSerialize` y en el historial de deshacer): el zombie existe mientras juegas y desaparece al recargar, y **`mundo.json` queda byte a byte como estaba**. Cada pieza lleva su matriz `M = T(g) · Ryaw(cuerpo) · T(o) · Rart(articulación)` — **dos centros de giro**, porque con uno solo el hombro se despega del torso al girar 90°. **El ciclo de andar avanza con la DISTANCIA recorrida, no con el reloj** (`fase += avance · cadencia`): frenado contra una pared las piernas se paran solas, sin ninguna condición especial. **Bug v1.20 encontrado por el dueño** («el zombie después de alejarse se desliza por el suelo de lado o hacia atrás sin caminar»): el vaivén colgaba de `activo` (*te ve*) cuando tiene que colgar de `andando` (*se está moviendo*) — al perderte y volver a su ancla iba de lado con las piernas rectas, como un mueble empujado; y si no persigue pero anda, ahora mira **hacia donde va**. Archivos: `make_zombie.js` + los 4 assets `*-zombie.vox.json` (cabeza **15³ a propósito**: con ≥4096 voxels macizos en 1×1×1 sería **terreno** y el terreno no se anima, `blockLike` en `app.js:4126`), `data/snippets/mundo-autoarranque.json` v1.19/v1.20, `data/snippets/agente-zombie.json` (solo el documento) y `app.js`. **Verificado**: `test_bloques_comportamiento.js` **§17** nueva (8 bloques, sobre el mundo de juguete y contra el snippet **de verdad**, no una réplica: cuerpo rígido, hombro orbitando, fase por distancia contra un muro de 4, piernas y brazos en oposición, la vuelta a casa andando y mirando hacia donde va, `mirarObjetivos`/`mcRestampAll`, y solidez donde se le ve con las extremidades sin colisión); `test_esqueleto_navegador.js` **nuevo** (Chromium + SwiftShader: las 6 piezas **se dibujan** —píxeles, no `mc.structures.length`—, sus matrices llegan al shader, `mcSerialize()` no las ve y plantar un zombie **no dispara ningún guardado**); **suite entera verde: 21 ficheros, 594 ok, 0 fallos**. **Sonda en el Mundo del dueño** (solo lectura, `POST /api/mundo` y `/api/habitantes` bloqueados, borrada antes de commitear): persigue, choca por el torso, el ancla queda hueca, `mcSerialize()` devuelve **exactamente las 269 estructuras de siempre** con el zombie plantado, `quitar()` no deja nada suelto y el md5 de `data/mundo.json` no se movió. **Hallazgo aparte, preexistente y NO tocado**: 8 estructuras del mundo del dueño usan `hab:llama-textura` y ese habitante ya no existe (`GET /api/habitantes/llama-textura` → 404). **Límites conocidos, a propósito**: las extremidades no tienen colisión (el rig gira y los envoltorios solo trasladan), sin pathing (línea recta y resbalar, como `seguir`), no hace daño, y desaparece al recargar. Fases 2 (`data/agentes/*.json` + endpoints) y 3 (panel del editor) quedan planificadas y sin empezar.

- 2026-08-02 · 🗄️ **Agentes articulados, fase 2: el formato y el servidor** (`data/agentes/*.json`). El documento del zombie estaba **dentro del snippet** `agente-zombie.json` y eso eran ya **dos copias vivas**: el test §17 lo recortaba del código del snippet con un `indexOf`, así que editar el bicho por un lado dejaba al otro mandando en la prueba. Ahora vive en `data/agentes/zombie.json` y el snippet solo dice **dónde** y **cuándo** se planta: `game.esqueletos.crear('zombie', x, y, z)` — `crear` acepta el id además del documento. El almacén es el de habitantes **clonado** (`/api/agentes` GET·POST·PATCH·DELETE, `dedup` generalizado con `store`/`name_of`, a papelera y **nunca borrado real**), y `game.agentes.lista()/cargar()/guardar()` (librería **v1.21**) lo expone en consola. Ojo a la pareja de nombres, que no son sinónimos: **`game.agentes` son los documentos guardados** (qué bichos sabemos hacer) y **`game.esqueletos` es lo vivo** (qué bichos hay ahora y dónde). La decisión que sostiene la fase 3: al guardar, el documento se copia **entero** y el servidor solo le impone `id` y `savedAt`, así que **las claves desconocidas viajan intactas** — cuando el panel añada pose de reposo o sonidos, reguardar desde una versión vieja no los borrará. Es lo único de esta tanda que **no se ve en pantalla** (el bicho seguiría andando igual, solo que sin sonido, medio año después), así que tiene prueba propia. `data/agentes/` se **versiona** (excepción en `.gitignore` como `data/snippets/`): es autoría, no runtime. Verificado: **22 ficheros, 624 ok, 0 fallos** (eran 21 y 594; el nuevo `test_agentes_api.js` aporta 30 — incluida la de que un `0`, un `false`, un `null` y un `""` sobreviven al guardado), §17 leyendo ya el documento del almacén, y `test_esqueleto_navegador.js` **verde en Chromium real** ejecutando el snippet de verdad, que ahora trae el zombie por red desde `/api/agentes/zombie`. ⚠️ Tras tocar `server.py` **hay que reiniciarlo**: el de :8500 llevaba desde el 31/7 y daba 404 en todo lo nuevo. Falta la **fase 3**: el panel del editor (lista de piezas, formulario de articulación y preview 3D animado en `#iso`).

- 2026-08-02 · 🎛️ **Agentes articulados, fase 3: el panel del editor** (pestaña **Agentes**, al lado de Mapa). Lista de agentes guardados, formulario por pieza (dibujo, `rot`, pivote / eje / base / reposo / amplitud / fase) y **preview 3D animado** con los dos interruptores de verdad — «te ve» y «anda» — más un mando de giro; el botón **Plantar** lo suelta delante del jugador en el Mundo. La decisión que lo ordena todo, elegida por el dueño: **el preview le pide la pose a la librería**, no la calcula. `app.js` llama a `game.esqueletos.preparar(doc)` y `game.esqueletos.pose(pl, {fase, giro, activo, andando})` y solo **dibuja** las matrices que salen de ahí, así que respeta el §0 (el framework sigue sin saber qué es un zombie) y **la pose del panel no puede divergir de la del Mundo**: es la misma `matrizPieza`. La librería tuvo que aprender a componer una pose **sin Mundo** (`preparar` no planta nada ni deja esqueletos vivos) — de ahí el refactor previo que extrajo `matrizPieza`/`centroGiro`, para que hubiera **una sola** composición de matriz y no dos que se parecen. **La única divergencia documentada**: en el Mundo la fase del ciclo de andar avanza con la **distancia** recorrida y en el panel no hay distancia, así que la adelanta el **reloj** — el panel es un maniquí, no un bicho andando. Lo demás es un rasterizador: proyección ortográfica con orden pintor, backface culling por **normal girada** (contra el gradiente de profundidad, no por el orden de los vértices — la matriz de una pieza puede espejar) y **fusión ávida de caras coplanares**, que baja el zombie entero de ~3.300 caras a **803 cuadros** y de paso quita las costuras del antialias de canvas (menos cuadros = menos bordes que se tocan). Tres cosas se torcieron y ninguna se veía sin navegador: el **atajo de «con `rot` impar se intercambian X y Z»** es falso porque `s.aabb` es **ceñido** y no la celda 16³ (el brazo del zombie es 5×5×14 centrado); un buffer reusado se leía **entero** cuando la escena tenía menos caras que la vez anterior (`ord.subarray(0,n)`); y el **sol fijo en coordenadas de mundo** dejaba las caras visibles de un **perfil** en el suelo del término ambiente — el muñeco se veía casi negro girándolo 90°, así que la luz va **atada a la cámara** (`[derecha, arriba, hacia el espectador]`) y la cara que miras siempre recibe luz (medido: brillo medio 96/82/92/86/92 a yaw 0/0,6/1,57/3,14/4,71; antes un perfil entero caía al ambiente). En el **móvil** (390 px) el lienzo llevaba resolución fija del HTML y el preview quedaba en una banda de ~80 px: ahora el buffer se ajusta a su caja por `dpr` (`agResize`) y apilado el escenario lleva **su** alto (`46vh`). Verificado en Chromium real con sondas temporales (borradas antes de commitear; `POST` a mundo/habitantes/agentes bloqueados): 6 piezas con sus medidas, caja `[-0.3125,-0.75,-0.2188 … 1.0625,1.8125,0.7188]`, 803 cuadros, se anima, **cero errores de consola**, y capturas de las cinco poses (de frente te ve, de perfil te ve / no te ve / andando, girado 90°) enseñando los brazos arriba y las piernas alternando. Suite entera: **22 ficheros, 637 ok, 0 fallos**.
- 2026-08-02 · 🐕 **Un agente NUEVO hecho entero desde el panel: un perro que te sigue a una distancia** (dueño: «utiliza el editor de agentes mecanizados para crear uno nuevo, un perro que siga al jugador a una distancia, comprueba que puedes hacerlo con la funcionalidad actual, crea los bloques necesarios»). Respuesta a lo que preguntaba: el **motor** ya sabía hacerlo desde v1.18 — `seguir.distancia` **no es un mínimo, es un sitio donde estar**, y si te acercas más `pasoSeguir` hace que el bicho retroceda —, pero el **panel** no: hasta ahora editaba agentes y no dejaba **crear** uno. Dos huecos, los dos genéricos y sin enseñarle a `app.js` qué es un perro (§0). (1) El desplegable de dibujos **no ofrecía ni una pieza de agente**: `agCatalogo` filtraba `type!=='textura'` (filtro que está para no listar los 34 azulejos de 1×1 como piezas de un muñeco) y las piezas del zombie **son** `type:'textura'` — y tienen que serlo, porque ese tipo es lo que enruta el guardado del editor a `/api/assets`, lo único que deja **reponer un pivote** con 📍 y guardar la pieza de vuelta; se salva el grupo: `a.type!=='textura' || a.group==='Agentes'`. (2) El formulario cubría las piezas pero **no la conducta**, que no es de ninguna pieza sino del bicho entero: `seguir` (detección / se para a / velocidad), `andar.cadencia`, `cuerpo` (caja de choque) y el `mirar` de la cabeza — sin eso un agente nuevo nacía sin perseguir nada. Van en un bloque aparte, «El bicho entero», y los números que enseña cuando el documento no trae la clave son **los que de verdad usará `normalizarSeguir`** (16 / 2.5 / 3), no ceros: un 0 en «se para a» diría que se te echa encima, justo lo contrario de lo que hace un agente sin `seguir`. Las piezas (`make_perro.js`, mismo estilo que `make_zombie.js`): torso 8×14×8 tumbado, cabeza con el pivote en el cuello, **una sola pata** reutilizada cuatro veces y cola; los cuatro dibujos por debajo de 4096 voxels a propósito, que es la raya del `blockLike` que convertiría una pieza en **terreno inanimable**. `data/agentes/perro.json` es el primer **cuadrúpedo**: patas en diagonal (`fase` 0/180/180/0 — delantera izquierda con trasera derecha), cabeza con `mirar` y cola meneando sobre el eje **y**; que salga de la misma librería sin tocarla es la prueba de que el rig **por instancia** era la decisión correcta, porque las cuatro patas son el mismo material con distinta fase. Mide 1.4375 bloques a la cabeza frente a los 1.8 del jugador. Verificado con sondas temporales en Chromium real (borradas antes de commitear; `POST` a mundo/habitantes bloqueado): montado y guardado **desde la UI**, dibujado bien en las cuatro vistas del preview, y plantado en el Mundo del dueño sigue al jugador y se para en **3.06 → 4.33 → 3.02 → 3.00** y ahí clavado, con `teVe=1` y `andando` decayendo a 0, dejando `mcSerialize()` en las **48 estructuras de siempre** y cero guardados. Fijado en `test_panel_agentes.js` (18 ok): el desplegable ofrece las piezas de agente **sin** comerse el resto del catálogo, al bicho montado por el formulario no le falta ningún campo, esos campos también **leen** el zombie guardado, el preview dibuja y anima, y **no se hace ni un POST**. Suite entera: **23 ficheros, 655 ok, 0 fallos**.
- 2026-08-02 · 🧱 **Los agentes ya no atraviesan las casas: el decorado los para, igual que un bloque** (dueño: «los agentes como el zombie atraviesan las estructuras, no los detienen como hacen los bloques, y deberian»). Era una omisión **deliberada y documentada** de v1.18 («meter el sondeo fino costaría un barrido por eje y frame»): `pasoSeguir` probó siempre contra `mc.grid`, o sea que el **terreno** paraba al bicho y las **estructuras** —casas, muebles, escaleras— no. Ahora se prueban las dos solideces (`chocaMundo = chocaTerreno || chocaEstructura`) **sin pagar aquel coste**, porque la fina va por **`mcFineBoxHit._orig`** y no por el envoltorio de v1.18: lo que el envoltorio añade son las estructuras **desplazadas**, que son justo los demás seguidores, así que se sondea el **decorado** —lo que se queda quieto— y dos agentes siguen sin estorbarse (límite 6, intacto a propósito). Mismo bitset y misma función por la que pasa el jugador: **un muro que te para a ti para al agente, y un vano por el que cabes tú lo deja pasar**. **La frase del dueño tiene dos mitades y la segunda costó más que la primera**: «como hacen los bloques» no es solo *parar*, es que un bloque de 1 de alto **se sube**. Sin eso, el arreglo habría cambiado «atraviesa las casas» por «una alfombra de 1/16 es un muro invisible». Así que `asentar` trepa la estructura en pasos de **1/16 hasta 1 bloque** —exactamente `mcMoveAxis`/`MC_STEP` del jugador, y exactamente lo que `mcSurfaceNear` ya le subía por el terreno— y **solo si lo que estorba es decorado** (`!chocaTerreno && chocaEstructura`), así que el comportamiento contra la rejilla no cambia ni un voxel. Un muro de más de un bloque sigue parando, porque ninguna de las 16 alturas queda libre. De paso, el envoltorio `envColl` ganó **auto-exclusión**: el seguidor **es** una estructura maciza y sin eso se encontraría a sí mismo en el primer paso y no arrancaría jamás (mismo centinela `yoSondeando` que ya usaba el sondeo por pieza). Solo `data/snippets/mundo-autoarranque.json` (**v1.24**) — **cero líneas de `app.js`** (§0). Verificado: **8 casos nuevos** en `test_bloques_comportamiento.js` (§16 con un muro de estructuras y con una losa de 1/16, §17 con el **zombie de verdad** contra un muro de 3 de alto: anda, no cruza, y `rig.andando` cae porque la fase va con la distancia); suite entera **23 ficheros, 324 ok en éste y 0 fallos**. **Sonda en el Mundo del dueño** (solo lectura, `POST /api/mundo` y `/api/habitantes` bloqueados, borrada antes de commitear), contra una pared real de `hab:cubo-trans` en la columna (57,26): con v1.24 el zombie va de **z=30.25 a 27.43 y se para** (`cruzó? False`), y con la versión de HEAD apilada en el mismo sitio va de **30.25 a 23.7 atravesando la pared** (`cruzó? True`) — el fallo reproducido antes y después. `mcSerialize()` sigue devolviendo **336 estructuras** y **0 guardados bloqueados**. ⚠️ **Consecuencia nueva y documentada en `CLAUDE.md`**: `mcSurfaceY`/`mcSurfaceNear` solo leen `mc.grid`, así que plantar un agente sobre una estructura puede meterlo **dentro** de ella — antes daba igual porque la atravesaba, y ahora nace **atascado para siempre** (`por: 3` sin haberse movido nunca). Se ve en `game.esqueletos.lista()`; la salida es plantarlo en otro sitio.
- 2026-08-03 · 👊 **El clic izquierdo sobre un agente es un GOLPE: ya no se rompe, sale despedido** (dueño: «algo raro pasa si hago clic sobre el zombie en su cuerpo, el bloque desaparece y deja de funcionar el zombie», y sobre qué poner en su lugar: «que sea darle un empujón... si el agente mecanizado recibe [botón izquierdo] se le empuja hacia atrás como ocurre en Minecraft cuando se ataca a un npc», «el npc salta hacia atrás desplazándose»). **El fallo era doble y la segunda mitad explica el «deja de funcionar»**: `mcBreak` retira ENTERA la primera estructura del rayo y, si es `efimera`, además sin historial y sin guardar (`app.js:6426`) — que es justo lo que son las piezas de un agente —; y como la única pieza **sólida** de un rig es su **raíz** (las extremidades no tienen colisión, v1.18), lo que el rayo encontraba al apuntar «a su cuerpo» era el torso, o sea que el clic se llevaba **el único sitio del que el motor tira**: quedaban cinco miembros congelados en el aire. **Arreglo: ese clic ahora empuja.** Se envuelve `mcBreak` desde la librería (**cero líneas de `app.js`**, §0) repitiendo SU MISMO rayo — mismo ojo, mismo paso de 1/16, mismo alcance — para saber qué gana: si lo primero que toca es pieza de agente, el clic **se come ahí** (tampoco se rompe el terreno de detrás); cualquier otra cosa va al original y se rompe como siempre. **El empujón es una velocidad que se frena sola, no un teletransporte**, y de ahí salen gratis las dos cosas que lo hacen parecer un golpe de Minecraft: se para contra una pared (mueve la raíz por `moverRaiz` → `asentar`, la misma colisión que un paso) y el bicho **vuelve solo**, porque el que persigue sigue persiguiendo mientras vuela. **Lo único que no se podía hacer por las bravas es el brinco**: con `ejes:'xz'`, `asentar()` REESCRIBE la Y de la raíz desde el suelo cada vez que la pieza se mueve — pero solo cuando se mueve —, así que un `g.y` a secas se borraría al andar y se **acumularía** en los frames parado (zombie al cielo); va aparte en `alto`, se descuenta ANTES de andar y se vuelve a sumar después. Y el empujón se aplica **después** de medir el avance a propósito: salir despedido no le hace pedalear las piernas. Nuevo en el documento del agente, opcional: `empuje:{ fuerza:8, freno:0.15, salto:4.5 }`, más `game.esqueletos.empujar(rig[, fuerza[, dx, dz]])` (sin dirección, lo aleja del jugador). De regalo, el huérfano: si a un rig le desaparece la raíz por otro camino, se **retiran sus piezas sueltas y se da de baja** — con una condición que distingue eso de un `mcRestampAll`, donde faltan TODAS a la vez y lo correcto es esperar. Solo `data/snippets/mundo-autoarranque.json` (**v1.25**). Verificado: **14 casos nuevos** en `test_bloques_comportamiento.js` §17 (el clic no llega al rompedor de `app.js` y no se lleva ninguna pieza, se aleja +0.556 y brinca 0.469 sin salir volando, vuelve a su distancia y el empujón se acaba solo, un clic al suelo **sí** rompe — si el envoltorio se comiera todos los clics el mundo entero sería irrompible sin que nadie lo notara —, un muro a la espalda para el empujón con fuerza 40, y las dos mitades del huérfano); suite entera **23 ficheros, 0 fallos** (338 en éste, eran 324). **Sonda en Chromium real** (borrada antes de commitear) llamando a **`mcDoAction(0)`**, que es el camino que app.js se hace a sí mismo al hacer clic — lo único que el mundo de juguete no puede probar es que `window.mcBreak = env` intercepte esa llamada —: `mcBreak._golpe = v1.25`, **54 estructuras antes y 54 después** del clic con las 6 piezas intactas, distancia 1.2 → **2.086** con un brinco de **0.297** y vuelta a 1.2, `emp` limpio, un clic al suelo rompiendo **1 bloque** como siempre, y `quitar()` dejando 48. **Límites, a propósito**: el empujón avanza eje a eje y **sin sub-paso**, igual que andar, así que un golpe fuerte contra una pared pegada lo deja quieto en vez de aplastarlo contra ella; y el golpe **no hace daño** ni tiene animación de dolor — no hay vida ni combate.
- 2026-08-03 · 🧊 **Los agentes articulados pisan el mismo suelo que tú: hielo, trampolín, barro y bordes** (dueño: «hace falta también que los agentes articulados respeten las físicas de los bloques, ya sean de salto, velocidad, etc.»). Las conductas de `game.bloques.define` estaban escritas **solo para el jugador** —son envoltorios de `mcPlayerStep` que tocan `mc.speed`, `mc.vel[1]` y `mc._deslizVel`—, así que un zombie sobre hielo iba igual de lento, el trampolín no le hacía nada y un borde no le hacía caer: andaba por encima de la tabla de materiales. Ahora se lee **esa misma tabla** desde sus pies, con `sueloDe(aabb, g)`: medio voxel **bajo** su caja, en el centro de la huella, con la **misma identidad de flanco** (celda + clave de material) que `pieEn` usa para ti — sin eso, un trampolín rebotaría cada frame. Va **encendida por defecto** (`fisica:{ marcha, desliza, impulso, cae, placas, peso, caida }`, o `fisica:false` para apagarla entera): un agente que ignora el suelo que pisa es el fallo, no la conducta normal. Cuatro conductas y las cuatro reutilizan lo que ya existe: **`marcha`** multiplica su paso por el `velocidad` del bloque; **`cae`** convierte en altura sobre el suelo (`mov.alto`) el salto hacia abajo que `asentar()` daba **de golpe** al cambiar de columna, con la misma `GRAVEDAD` (22) que tú, y `caida` son los bloques que se atreve a bajar; **`impulso`** lo lanza dividido por `peso`; **`desliza`** lo deja rodando al dejar de andar, con el `deslizamiento` del material como **τ** del frenado exponencial. **`alPisar` se queda apagado a propósito** (`placas:false`): los `alPisar` ya escritos llaman a `game.tp(...)`, o sea que un zombie pisando una placa **te teletransportaría a ti**. **Trepar (escaleras) se queda fuera y no es un olvido**: `trepableEnColumna()` está atado a las claves de `mc.pos` y hay que extraerlo para que acepte una caja cualquiera — es el único de los cinco que empieza de cero, y va aparte. Dos cosas que costaron: el patinaje **no se veía** aunque el estado se registraba bien, porque copiar el modelo del jugador (velocidad residual amortiguada) no encaja con un bicho cuya posición la reescribe `asentar()` — hay que modelar el **deslizamiento como posición perseguida**, no como velocidad; y medir la caída como `g.y + alto` **cuenta doble**, porque `g.y` entre frames ya la lleva incorporada. El camino del jugador queda **byte a byte igual**: la física entra por un parámetro opcional al final que solo pasan los esqueletos, así que `seguir` por material no cambia de comportamiento. Solo `data/snippets/mundo-autoarranque.json` (**v1.26**) — **cero líneas de `app.js`** (§0). Verificado: **§18 nueva** en `test_bloques_comportamiento.js` (velocidad ×1/×2/×0.5 → **2.20 / 4.40 / 1.10** bloques; caída de 4 medida **en vuelo** (0.214) y al posarse (4.00); `impulso:12` subiendo **3.17**, que es `12²/(2·22)`; y el patinazo de hielo pasándose de largo, **1.199** frente a **0.716** en seco, con 1200 frames de asentamiento para ver que τ=1.2 converge); suite entera **23 ficheros, 696 ok, 0 fallos** (eran 338 en éste, ahora 357). ⚠️ **Aviso de método**: los dos fallos de `test_panel_agentes.js` que aparecieron por el camino **no eran regresión** sino contención de recursos por lanzar la suite en paralelo (Chromium + SwiftShader); en secuencial da 18 ok estable. Las pruebas de navegador **se ejecutan de una en una**. Queda pendiente el mock de capacidades del panel (`agentes_propuesta.html`, aprobado y sin implementar), que es donde se editarán estos campos.
- 2026-08-04 · 🎛️ **El panel de Agentes enseña TODAS las capacidades, una tarjeta cada una** (dueño: «implementar de verdad el panel de capacidades del mock»). Es el mock `agentes_propuesta.html` llevado al panel real. El formulario enseñaba **4 de los ~20 parámetros** del bicho entero y `empuje` (v1.25) y `fisica` (v1.26) **no aparecían por ninguna parte** aunque el agente las tuviera: se podía tener algo encendido que el panel no sabía contar. Ahora el bloque «El bicho entero» son **tarjetas plegables**, una por capacidad (`seguir` 👁, `andar` 🚶, `empuje` 👊, `fisica` 🧊, `cuerpo` 🧱), más las dos por pieza que ya existían (`articula` 🔩, `mirar` 👀, que gana su `suavidad`); plegada dice si está encendida y con qué valores, abierta saca todos sus parámetros. Bajo el preview hay una fila de **chips** con lo mismo resumido. Tres reglas que no son cosméticas: **(1)** los valores que salen cuando el documento no trae la clave son los que la librería va a usar de verdad, en **gris cursiva** (`.def`) — un campo vacío o a 0 mentiría, porque `distancia:0` significa «se te echa encima» y es lo contrario de «no lo he tocado»; **(2)** **abrir el panel no engorda el documento**: una capacidad encendida en su valor por defecto se guarda SIN la clave, tocar un campo escribe solo esa clave y apagar-y-encender la borra, o sea que los defectos siguen viviendo en un único sitio, que es la librería; **(3)** **el panel no ofrece lo que la librería va a rechazar** — `objetivo` solo da «el jugador» y «un punto fijo» (seguir a otra CLAVE de material busca la instancia más cercana y un rig no es una instancia), y «trepa por las escaleras» sale **deshabilitada** porque todavía no existe para un agente: quitarla de la lista haría pensar que se olvidó. Apagar una capacidad sin clave de apagado se escribe con sus valores neutros (`empuje` off = `{fuerza:0, salto:0}`, `andar` off = `{cadencia:0}`); `seguir` off sí es `false` y la tarjeta avisa de que la librería **se niega a plantarlo**. Dos detalles que se descubrieron montándolo: qué tarjetas quedan abiertas tiene que vivir en `agAbiertas` y **no en el DOM**, porque el formulario se reconstruye entero en cada tecla; y `agCargar` no llevaba billete, así que **dos agentes seguidos podían pisarse** (la prueba leía el perro creyendo leer el zombie) — ahora lleva `agCargaId`, el mismo patrón que `agPrepId`. `app.js` + `style.css` + `index.html`; **la librería no se toca**. Verificado: `test_panel_agentes.js` pasa de 18 a **30 ok** (los defectos en gris, que tocar escribe solo su clave, que apagar-encender la borra, el interruptor de trepar bloqueado, el resumen plegado, los chips y el objetivo de punto fijo), y la suite entera en secuencial **23 ficheros, 706 ok, 0 fallos**. Revisado a ojo en escritorio y en **390 px**: cada tarjeta plegada ocupa una línea, así que el bicho entero cabe en el móvil sin scroll infinito. Pendiente del mock: el botón **👊 empujón** del preview, que pide que `game.esqueletos.pose()` acepte un ladeo — eso es librería, no panel.
- 2026-08-05 · 🌿 **Pintar solo algunas caras de un voxel (`caras`) y que la hierba se atraviese (`atravesable`)** (dueño: «una cosa que hace minecraft y que nosotros aun no hacemos es pintar solamente algunas caras de los voxels de los objetos, por ejemplo para crear un bloque en plan hierba como el de la imagen que te paso» + «que "atravesable" sea algo tambien configurable para otros bloques o estructuras desde scripting»). Hasta hoy **un voxel se dibujaba siempre como un cubo de 6 caras**, así que no había forma de decir «de éste solo quiero la +X y la −X» — que es exactamente lo que convierte un voxel en un **plano**, y una mata de hierba en cruz en algo dibujable. Ahora hay una **máscara por voxel**, entero 0..63, clave de primer nivel `caras` en el `.vox.json` (mismo patrón que `pivotes`: sobrevive al guardado sin tocar `server.py`). El dueño eligió la máscara **en vez de** un tipo de render «cruz» sabiendo el precio, y por eso sirve además para banderas, carteles y paneles sueltos. **Criterio de aceptación de las nueve fases y guardián de todas ellas**: un asset **sin** `caras` produce el mismo nº de caras en el VBO, el mismo `bits`, la misma colisión, el mismo apuntado y **la misma imagen píxel a píxel** (`test_caras_pegadas.js`).
  - **La permutación al girar se DERIVA numéricamente, nunca de una tabla** (`facePerm(fn)` en el editor, `mcFacePerm(tilt,yaw,…)` en el Mundo): se pasa el vector normal de cada cara por **la misma transformación afín** que mueve las coordenadas y se busca el índice que coincide. Es *la* diferencia con los pivotes, que solo mueven puntos. Una tabla escrita a mano se desincroniza la primera vez que alguien toque `rotateModel` o `mcRotXZ`; el invariante que lo fija es «4 giros = identidad» más la coincidencia contra un voxel testigo pasado por `mcRotXZ`. `CUBE_FACES` (editor) y `MC_FACES` (Mundo) **coinciden índice a índice** —el cambio de ejes ya está dentro de la tabla, `asset +Z` = `mundo +Y`—, así que el entero viaja del editor al Mundo **sin traducir**.
  - ⚠️ **La máscara es del OBJETO, no del voxel**, y confundirlo es el bug: con `state.caras` **vacío** todo se ve entero, pero en cuanto hay **una sola** marca, lo que no está marcado se oculta. De ahí dos lecturas — `caraMask` = *lo que se pinta* (63 si el objeto no tiene marcas) y `caraMaskRaw` = *lo que está guardado* (0 si no hay entrada). El render lee la primera; la herramienta edita con la segunda. No se guarda el 0; **el 63 sí**, porque «las seis a mano» no es «sin marcar».
  - **Tres sitios de render en el editor, no dos.** `renderEdit3dScene` **inlinea** `g.front[fi]` y `occ.has(...)` en vez de llamar a `faceVis3d`, así que parchear solo `faceVis3d`/`faceVisIso` habría dejado un bug visible **justo en los modelos pequeños** (por debajo de `BIG3D=15000`), o sea en casi todos los assets del proyecto. Los tres van en el mismo cambio. Herramienta **🃏 «Caras» (tecla `A`)** calcada de 📍: izquierdo marca, derecho desmarca, Shift+clic las seis, **derecho sobre el botón de la herramienta borra todas las marcas del objeto**, y el botón alterna «Marcadas»/«Ocultas» — una cara oculta **se sigue pudiendo clicar**, así que ocultarla nunca es irreversible.
  - **Un bitset hacía DOS trabajos, y por eso ahora son dos.** `g.bits` respondía a la vez «¿me frena?» (`mcFineSolidAt`→`mcCollidesWorld`) y «¿hay materia aquí?» (`mcStructCellSolid`, `mcStructRayHit`, `mcStructAt`, `mcBreak`, `mcXrayVolume`). Una mata tiene que contestar **no** a la primera y **sí** a la segunda o no se podría romper de un clic. Se parte en `bits` = colisión y **`bitsAim` = ocupación real**, que por defecto es **la MISMA referencia** (cero memoria, cero divergencia: mientras nadie sea atravesable el comportamiento es idéntico y se verifica por ausencia de cambios). ⚠️ **`bits` nunca es `null`** — atravesable es un `Uint8Array` de **ceros** —, porque `data/snippets/mundo-autoarranque.json` **re-implementa el bucle leyendo `g.bits`** (`golpe`, `claveFinaEn`, el barrido de `trepable`) con un `if(!g || !g.bits) continue`: con `null` la hierba desaparecería también del apuntado. Por lo mismo `mcFineBoxHit`, `mcFineSolidAt` y `mcStructColl` quedan **byte-idénticas** y la capa de apuntado va **encima** de ellas.
  - **`atravesable` se declara por dos vías que producen la MISMA forma**, así que `app.js` no necesita saber de cuál vino: el **documento** (`"atravesable": true` + casilla en la tarjeta *Objeto*) y el **snippet** (`game.bloques.define('hab:hierba',{atravesable:true})`, que envuelve `mcStructColl` y clona el `g`; `quitar()` lo deshace). **No se deriva de la máscara**, y los dos casos reales dicen por qué: el tallo de la mata es un voxel normal de 6 caras y debe atravesarse igual, mientras que una vidriera enmascarada tiene que seguir chocando — derivarlo daría lo contrario en ambos. En **terreno** `mcSolid` **no se parchea** (lo comparten mallado, rayo de apuntar y romper/poner): va por otra pregunta sobre la misma rejilla, `mcSolidWalk`, que lee dos arrays por id de bloque, los dos `null` mientras nadie sea atravesable (`mc.atraviesa`, del snippet, y `mc.atraviesaDoc`, horneado por `mcBuildPalette`). Es el patrón `mc.sunExtra`/`mcXrayExtra`: **`app.js` expone la capacidad, el snippet decide el comportamiento**.
  - 🔁 **El giro que dio el dueño a mitad de camino, y que cambió el diseño** (dueño: «la solucion no parece ser buena / eficiente, busca otra mejor, en el script "Construye Montañas" hice el cambio `//setVoxel(...)` → `game.stamp("leaves", ...)`, se me colgó el javascript 10 veces»). Tenía razón y el número lo dice: **cada `game.stamp` es una entrada de `mc.structures` = UN draw call** y una línea en `mundo.json`. Medido con 200 hojas (`test_stamp_scripting.js`): **`setVoxel` = 60 ms y 0 draw calls extra**; `game.stamp` = **385 ms y 200 draw calls**; con 2000, ~2,4 s — el bosque de su script. La salida no era optimizar el estampado sino **abrir el camino del terreno**, o sea que una hoja pueda ser un **BLOQUE**, como en Minecraft. Tres piezas: (1) `buildTexFaces` respeta `caras` — cara apagada ⇒ texel con **alpha 0** ⇒ textura de **recorte** y `discard` en el shader (⚠️ manda el **primer** voxel de la columna, encendido o apagado: seguir buscando detrás rellenaría el agujero con la cara opuesta de la cáscara); (2) **un bloque de recorte no tapa** — `mcTapaCara` es la **tercera** pregunta sobre la misma rejilla (`mcSolid`=«¿hay materia?», `mcSolidWalk`=«¿me frena?», `mcTapaCara`=«¿tapa esta cara?»), separada otra vez por un array, **`mc.recorte`**, leído en **un solo sitio** (el mallado del chunk) para que `mcSolid` siga byte-idéntico; sin esto, por los agujeros de una copa se ve el **vacío**. Medido sobre una copa de 311 bloques: **+15,8 % de vértices, los MISMOS 36 draw calls y el mismo ms/frame** — el culling de chunk cambia el tamaño del VBO, no el número de llamadas; (3) `mc.atraviesaDoc` vale también en la rejilla. Resultado: `caras` y `atravesable` **ya no son motivo de aviso** en `setVoxel`; lo que avisa se reduce a lo que de verdad no cabe en una celda — la **FORMA** (`rec.pielCubre`, calculado con las tres proyecciones 16×16) y la **transparencia real**. Y el aviso sale **por toast además de por consola**: el dueño construye desde el móvil, donde un `console.warn` es indistinguible de «el script no hace nada».
  - ⚠️ **Dos piezas con máscara pegadas: el envés se hunde `mc.carasInset` (0,08 voxels finos)** (dueño: «se pegan las caras, no hay prioridad de cuál se pinta antes, hay un efecto de mezcla de texturas»). Una cara enmascarada se emite **dos veces** (`dosCaras`) o el plano desaparece al mirarlo por detrás — pero eso rompe al árbitro de siempre: cuando dos estructuras comparten plano, el empate lo deshace el **culling de traseras** y sobrevive la que mira a la cámara; una cara de dos lados hace que **las dos** miren a la cámara a la misma profundidad y con `depthFunc(LESS)` gana **el orden de estampado**. **No es parpadeo** (no baila al mover la cámara) y por eso `game.structBias` no lo arregla: las dos son estructura y llevan el mismo sesgo. El desempate es geométrico — el **anverso se queda EXACTO** en el plano del voxel (así un asset sin `caras` no cambia ni un vértice) y el **envés se mete hacia dentro de su propio voxel**, que lo **acerca** al que lo mira. `mc.carasInset = 0` lo apaga.
  - **Un 16³ macizo con `caras` deja de ser `blockLike`** y pasa a estructura fina a propósito, pero el motivo **cambió**: ya no es que el terreno pierda la máscara (desde `mc.recorte`/`mcTapaCara` la respeta), sino que **lo que se pone A MANO se prefiere fiel** — como bloque son 6 texturas agujereadas y **nada detrás**, mientras que la pieza fina enseña sus voxels de dentro. Poner una pieza y levantar un bosque no son la misma decisión.
  - **Límites conocidos y aceptados, no pendientes**: `drawIso`, `drawIsoSlicedBig`, la vista 2D de Capas y la ficha de material enseñan la pieza «llena»; y un prado de miles de matas **estampadas** son miles de draw calls — para eso está `setVoxel`.
  - **El entregable: `assets/hierba-alta.vox.json`** (153 voxels: dos planos cruzados de 70 con máscara `12` = ±X y `48` = ±Z, más los 13 de la línea de cruce con `60`, y `atravesable:true`). Verificado en Chromium real contra el Mundo del dueño, con **todas las escrituras cortadas**: se estampa, y desde los cuatro lados la **diferencia de píxeles** con y sin la mata desde el mismo sitio da **5909 / 5548 / 5934 / 5577** (sur/norte/este/oeste) — contar «píxeles verdes» sobre un prado no vale de nada, que ya es todo verde; `mcRaycast(6,true)` la devuelve desde los cuatro; y andando contra ella con `w` durante 70 frames de física **se cruza** (5,83 bloques de avance, sin frenar). El mundo quedó con sus **48 estructuras** de siempre.
  - **Pruebas**: `test_caras_mascara.js` (35 ok, contrato y permutación) · `test_caras_render.js` (28) · `test_herramienta_caras.js` (28) · `test_caras_mundo.js` (26) · `test_caras_pegadas.js` (15, **el guardián**) · `test_atravesable.js` (41) · `test_stamp_scripting.js` (45) = **218 ok, 0 fallos**; más los cuatro que este trabajo tocaba de refilón, todos en verde: `test_guardar_pieza.js` (17), `test_rayo_apuntado.js` (12), `test_bloques_comportamiento.js` (373), `test_atlas_estructuras.js` (13), `test_rayos_x.js` (11).
  - 🧪 **Método — dos sondas mías dieron un falso negativo y una dejó basura en el mundo del dueño, y las dos lecciones valen para la próxima**. (1) La primera medición decía que la mata **no se veía desde el este ni el oeste** y que **no se podía apuntar desde ningún lado**. Las dos eran **fallos de la sonda**, no del motor: la mirada del motor es `d = (−sin yaw, sin pitch, −cos yaw)`, así que mis cámaras de este/oeste **retrataban el horizonte opuesto**; y `mcRaycast` devuelve `{cell,normal,dist,fina,point}` — **no hay `.struct`**, o sea que mi comprobación era `undefined` siempre. Lo que zanjó el primer punto fue **preguntarle al mallador en vez de a la pantalla**: contar las caras del VBO por dirección de mundo daba **116 en cada una de ±X y ±Z**, o sea que la geometría estaba bien y el que miraba mal era yo. Antes de creerse una medición de píxeles conviene tener una medición **de datos** que la contradiga o la confirme. (2) ⚠️ **El glob `'**/api/mundo**'` NO corta el guardado.** `game.stamp` guarda por **`POST /api/mundo/cabecera?ma- 2026-08-08 · 🔌 **[BUG-RS14](#-bug-rs14) · Pistón se cierra instantáneamente al empujar un bloque de redstone** — 🟡 abierto a petición del usuario. Al colocar un bloque de redstone delante de un pistón, el pistón se extiende y empuja el bloque, pero inmediatamente se retrae al alejarse la fuente de señal. Sin investigar código.

- 2026-08-08 · 🚨 **[BUG-AG14](#-bug-ag14) · Umbral de tiempo mínimo para el toast de «Atascado (tecla U)»** — ✅ resuelto 2026-08-08. Se ha incorporado mc.stuckTime (acumulador en segundos por frame) y la propiedad configurable game.minStickedTime (defecto 1.0 s, persistida en localStorage f_mcMinStickedTime). En mcUpdate(dt), sólo se dispara mcStuckShow(true) cuando la colisión se mantiene continuada durante un tiempo >= game.minStickedTime. Micro-roces o solapes efímeros al cabalgar ya no parpadean el aviso rojo. Verificado con 	est_bug_ag14_min_sticked_time.js (**TODO OK**).

- 2026-08-08 · 🏇 **[REQ-AG15](#-req-ag15) · Reposicionamiento manual en la montura con Shift + WASD** — ✅ resuelto 2026-08-08. Se modificó mcUpdate (pp.js) y pasoSeguir (data/snippets/mundo-autoarranque.json y parche_snp_cabalgable.py): al estar montado en un agente cabalgable, si se mantiene la tecla Shift pulsada, WASD / flechas mueven al jugador libremente sobre la superficie de la montura mientras el agente permanece inmóvil (dGiro = 0, wdM = 0). Verificado con 	est_bug_req_ag15_reposicionar_montura.js (**TODO OK**) y 	est_agente_cabalgable.js (**TODO OK**).

- 2026-08-08 · [REQ-TEST1](PLAN_ARCHIVO.md#-req-test1) · Runner de pruebas y anotacion declarativa de tests — ✅ resuelto 2026-08-08. Se han anotado los 85 ficheros test_*.js con cabeceras declarativas (@area y @necesita). Se creo correr_tests.js con filtrado por --node, --pw, --area=<nombre>, catalogo --list, comprobacion pre-flight de servidor :8500 y Playwright, y resumen de resultados. Verificado con node correr_tests.js --node (10/10 ok, 8.9s) y --list.

- 2026-08-08 · [REQ-DOC1](PLAN_ARCHIVO.md#-req-doc1) · Navegabilidad de CLAUDE.md — ✅ resuelto 2026-08-08. Se ha incorporado una Tabla de Contenidos / Mapa de Navegacion en la cabecera de CLAUDE.md y la seccion dedicada a la bateria de pruebas y runner CLI.
- 2026-08-08 · 👁️ [REQ-AG13](PLAN_ARCHIVO.md#-req-ag13) · Visualizacion 3D de Conos de Vision y Mirada de Agentes — ✅ resuelto 2026-08-08. Se implemento mcPushVisionCones() en app.js para renderizar los conos 3D de deteccion del cuerpo (seguir.vision en ambar/dorado) y limites de mirada de cabeza (mirar.limites en cian). Activable con game.verConos = true, game.conosVision = true o durante la vista de Rayos-X (X). Verificado con test_req_ag13_conos_vision.js (4/4 ok).

- 2026-08-10 · ☁️ [REQ-SHADOW2](PLAN_ARCHIVO.md#-req-shadow2) · Materiales sin sombra (nubes) — ✅ resuelto 2026-08-10. Dos banderas por material desde el autorun, `game.bloques.define(clave, { recibeSombra:false, proyectaSombra:false })`, sin cablear ningun material en el motor. `app.js` expone `mc.sinSombra` (por id, terreno) y `mc.sinSombraKey` (por clave, estructuras finas) y solo las consulta; el snippet decide. Las dos banderas viajan **sumadas al `aShade`** que ya existia (`sombreado + 2·bits`), asi que no hay atributo nuevo en ningun formato de vertice. Lo que no se veia desde el enunciado: en el Mundo hay **dos** sombras y `proyectaSombra:false` sola no basta (el bloque sigue tapando el skylight), por eso arrastra `luz:'pasa'`; y cambiar las banderas invalida las mallas cacheadas sin mover un voxel, asi que entra en la firma del chunk + `mcShadowDirty()`. Verificado con `test_sin_sombra.js` (7 secciones, TODO OK) y `test_caras_pegadas.js` (15 ok, 0 fallos).

- 2026-08-13 · ✅ [BUG-SNP3](PLAN_ARCHIVO.md#-bug-snp3) · Resuelto. Las 12 lineas eran un **borrador que nunca se enchufo** en `asentar()` — no se movieron de alli (nacen ya mal puestas en `4fcab25`), asi que el arreglo es UN sitio y no dos: `herramientas/parche_snp_bug_snp3.py`, VERSION v1.31. Al no morir ya en `quitar()`, `test_bloques_comportamiento.js` corre entero por primera vez y destapa **25 fallos preexistentes** (los mismos con el snippet de HEAD + solo el borrado): son la fisica de esqueletos de REQ-AG17, que ahora tiene su criterio de aceptacion ya escrito. `test_luz_traspasa.js` pasa de petar a 22 ok / 2 fallos ajenos (aire de control a luz 6).
- 2026-08-10 · 🐞 [BUG-SNP3](PLAN_ARCHIVO.md#-bug-snp3) · Abierto: `game.bloques.quitar()` lanza `ReferenceError: g is not defined` en cualquier material con comportamiento. ~12 lineas de fisica del jugador pegadas por error dentro de la funcion (`mundo-autoarranque.json` 1136-1147, el remate de la colision horizontal + el aviso `[CAYENDO]`). **Ya estaba en HEAD**, no lo trae REQ-SHADOW2: tumba `test_bloques_comportamiento.js` y `test_luz_traspasa.js` igual en las dos versiones. Atenuante: el `delete` + `reconstruirCache()` corren antes de petar, asi que el estado queda bien y solo se pierde el `return`.

- 2026-08-10 · 💧 [REQ-FLUID4](#-req-fluid4) · Abierto: «ilusion de agua» — un lago se ve como una cuadricula de cubos transparentes con caras y aristas internas, no como una masa continua. El dueño aporta el analisis de otra IA con tres pilares: culling de las caras agua-agua, capa superior a ~87,5 % de alto, y pasada alpha final ordenada de atras hacia delante + tintado por bioma sobre textura en escala de grises. **Redactado, sin investigar.** Antes de tocar: contrastar el «~87,5 % / nivel 8/8» con fuente (no cuadra entre si), comprobar si el culling ya lo hacemos en el camino translucido (podria dejar el ticket en los puntos 2 y 3), y decidir aparte lo del bioma (no tenemos biomas).

- 2026-08-11 · 🐞 [BUG-FLUID4](PLAN_ARCHIVO.md#-bug-fluid4) · Abierto: bajo un fluido, los bloques que no ocupan todo el lateral de su celda marcan las caras de forma traslucida en vez de verse transparentes. **Redactado, sin investigar.** Capturas en `data/tickets/BUG-FLUID4/`. Sospecha sin comprobar: `mcTapaCara` devuelve `false` sobre una celda fina, asi que la cara del fluido contra esa pieza no la culla ninguna de las tres reglas de REQ-FLUID4. Sin verificar: que fluido y que material salen en las capturas, si pasa con agua o solo con lava, si depende de que la celda este llena, si es solo al construir o tambien al cargar, y si `mc.sinCullingFluido = true` lo hace desaparecer.
- 2026-08-11 · 🐞 [BUG-SNP4](#-bug-snp4) · Abierto: los cambios hechos en el editor de codigo del Mundo se revierten al volver al mapa y reabrir el editor. **Redactado, sin investigar.** Sospecha sin comprobar: el snippet tiene **dos copias vivas** y al reabrir el modal se relee la que se cargo al abrir el Mundo, no la editada. Sin verificar: si se pierde solo lo no guardado o tambien lo guardado, y si el `.json` de disco llega a cambiar. Ojo con la tecla: el dueño dice **Ctrl+C**, `CLAUDE.md` documenta **Alt+C** (y `Ctrl+C` esta cogido por `copySelection` en el editor de voxels).

- 2026-08-11 · 💧 [REQ-FLUID4](#-req-fluid4) · **Fase 3 (vista subacuatica) resuelta.** Al meter el ojo en un fluido la escena se tiñe y la niebla se acerca; agua y lava por el MISMO mecanismo, cambiando solo color y distancia. `mcFluidoOjo()` pregunta a `game.fluidos.getProps()` (ningun material cableado por nombre) y mira la celda del OJO, no la de los pies. `MC_SKY` se leia suelto en 9 sitios y la niebla a mano en 6: todos pasan ya por `mcCieloEf`/`mcFogNear`/`mcFogFar`. **Leccion:** la niebla submarina va en BLOQUES ABSOLUTOS, no en fraccion del far de proyeccion — la primera version usaba fracciones y el efecto se quedaba en «he cambiado el color del fondo». Tunables: `game.vistaAgua({far:6})`, `game.vistaLava(...)`, `mc.vistaFluido` para probar sin nadar. Verificado con `node test_vista_subacuatica.js` (30 ok, TODO OK) y sin regresion en `test_sin_sombra.js`. Capturas en `data/tickets/REQ-FLUID4/`.

- 2026-08-11 · 💧 [REQ-FLUID4](#-req-fluid4) · **2ª ronda de la fase 3, tras probarlo el dueño:** «quiero por lo menos un far 100, ver las cosas de lejos en el agua, y no se ven las paredes o bloques que no son agua cuando esta buceando, deberian verse». Las dos quejas eran el mismo fallo: con la niebla a 11 bloques, todo lo que hay detras ES niebla. Subir el far sin mas devolvia el problema contrario (no se tiñe nada), asi que se separan las dos palancas: **`uFogMin`**, uniforme nuevo en los cuatro shaders con niebla, es un SUELO de tinte constante que no depende de la distancia. Ahora `far:100` (se ven las paredes) + `tinte:0.30` (parece agua). Fuera del agua vale 0 ⇒ `f = 0 + 1·f`, identico al render de antes. Lava: `far:6, tinte:0.80`. Nuevo tunable `game.vistaAgua({tinte:…})`. Verificado con `node test_vista_subacuatica.js` (35 ok, TODO OK) y sin regresion en `test_sin_sombra.js`.

- 2026-08-11 · 🐞 [BUG-FLUID4](PLAN_ARCHIVO.md#-bug-fluid4) · **Resuelto, y la sospecha del dia anterior era la buena.** `mcTapaCara` devuelve `false` sobre TODA celda fina —es la regla de las hojas «fancy», esta ahi para que por los agujeros de una copa no se vea el vacio—, asi que ninguna de las tres reglas de `tapadasFluido` cullaba la cara del fluido contra una flor o una escalera metida en el lago: el liquido emitia las 5 caras que la rodean, y como sus vecinas fluido↔fluido SI se cullan, la superviviente se queda **suelta** — la lamina traslucida marcando el hueco que fotografio el dueño. Medido con el A/B: `flor-roja` daba **10** caras donde `roca` da 5; agua y lava igual. El arreglo es que dentro del culling de fluido la pregunta es otra: no «¿tapa la cara del vecino?» sino **«¿ocupa la celda?»**. Sin waterlogging (un material por celda), una pieza fina que no es fluido ha REEMPLAZADO al liquido y la cara que da a ella no se ve. `tapaAlFluido` es local a `tapadasFluido` y solo entra en su primera rama; **`mcTapaCara` no se toca** (su contrato general tiene que seguir diciendo `false`, y `test_rayo_apuntado.js` extrae verbatim a sus vecinas). El hueco de AIRE sigue emitiendo, porque `nId` es 0 y no llega a la rama. Verificado: 10 → 5 en las dos, la valvula `mc.sinCullingFluido` sigue devolviendo el lago-rejilla (444), `flor-roja` sigue en el lote opaco, y el mundo del dueño quedo como estaba. `node test_caras_fluido.js` §5, con anti-falso-verde (si el arreglo cullease de mas todo daria 0 y el test pasaria sin mirar nada).
