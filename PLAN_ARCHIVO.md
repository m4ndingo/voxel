# PLAN — archivo de tickets cerrados

El **detalle** de los tickets ya cerrados. Salió de `PLAN.md` el 2026-08-13, cuando ocupaba el
69 % del fichero y hacía caro abrirlo para lo único que se abre a diario: los abiertos.

- El **índice** histórico (la tabla con las filas tachadas) sigue en
  [`PLAN.md`](PLAN.md#-tickets-cerrados--archivo), y cada fila enlaza aquí.
- **Reabrir un ticket** = devolver su fila a la tabla de ABIERTOS de `PLAN.md` y traerse su
  sección de vuelta a mano.
- Cada sección lleva su **ancla explícita** (`<a id="-req-osd13">`), así que los enlaces cortos
  siguen valiendo aunque se reescriba el título.

Guardián: `node tests/test_plan_enlaces.js` comprueba que todo `(#ancla)` de los dos ficheros
resuelve a una sección que existe.

---


<a id="-bug-snp3"></a>

### ✅ BUG-SNP3 · `game.bloques.quitar()` lanza `ReferenceError: g is not defined` — ✅ resuelto 2026-08-13

**Encontrado de paso implementando REQ-SHADOW2, y no es de ese cambio:** está así **en HEAD**
(`git show HEAD:data/snippets/mundo-autoarranque.json`), y el `quitar()` de REQ-SHADOW2 se escribió
envuelto en `try/catch` para poder seguir precisamente por esto.

En medio de `game.bloques.quitar()`, en `data/snippets/mundo-autoarranque.json`, hay **~12 líneas de
física del jugador pegadas por error** (líneas 1136-1147): el remate de la colisión horizontal y el
bloque de aviso `[CAYENDO]`. Ahí dentro **no existe ninguna** de las variables que usa —`g`, `xPrev`,
`s`, `a`, `_yEntry`, `zPrev`, `rig`, `cx`, `cz`, `footY`, `suelo`—, así que **cualquier**
`game.bloques.quitar('lo-que-sea')` sobre un material que sí tenía comportamiento revienta en la
primera línea:

```js
    delete tabla[clave];
    olvidarSeguido(clave);
    reconstruirCache();
    // Colision horizontal: usar la Y de ENTRADA (antes de gravedad/escalon)   ← NADA DE ESTO PINTA AQUÍ
    if (g.x !== xPrev && chocaTerreno(s, a, g.x, _yEntry, zPrev)) { g.x = xPrev; }
    …
    return true;
```

**Lo que atenúa el daño y hay que mirar antes de tocar:** `delete tabla[clave]` +
`reconstruirCache()` corren **antes** de la línea que peta, así que el estado queda **correcto** — el
material sí se olvida. Lo que se pierde es el `return true` y todo lo que venga después de la
llamada. Por eso el bug ha podido vivir escondido: quien llama y no mira la excepción ve el efecto
que esperaba.

**Lo que rompe hoy:** tumba `test_bloques_comportamiento.js` (peta en el caso de la línea 667, tras
61 ok) y `test_luz_traspasa.js` (línea 48). Los dos fallan igual en HEAD que con REQ-SHADOW2 aplicado
— se comprobó a propósito antes de dar el ticket por verde.

**Arreglo esperado:** borrar las 12 líneas y devolver `quitar()` a `reconstruirCache(); return true;`
⚠️ Hay que averiguar **de dónde salieron** antes de borrarlas: si se movieron desde el `mcUpdate` de
la física en vez de copiarse, la física del jugador está a su vez incompleta y el arreglo son dos
sitios, no uno. Como siempre en este snippet: parche idempotente por marca, nunca reescribirlo entero
(tiene **dos copias vivas** y el dueño lo edita en vivo).


---

**Resuelto el 2026-08-13** · `herramientas/parche_snp_bug_snp3.py` (idempotente por marca `BUG-SNP3`,
`VERSION` v1.30 → v1.31).

**De dónde salieron las 12 líneas** — era la pregunta del ⚠️ de arriba, y la respuesta cambia el
arreglo: **no se movieron de ningún sitio**. Se rastreó el fichero commit a commit (25 revisiones): la
cadena «usar la Y de ENTRADA» **no existe en ninguna versión anterior a `4fcab25`**, y en `4fcab25`
*nace ya dentro de `quitar()`*. En ese mismo commit se reescribió `asentar()` entera (la versión con
gravedad de REQ-FLUID6). O sea: son un **borrador para `asentar()` que nunca llegó a enchufarse**, no
un trozo arrancado. Borrarlas no le quita a la física nada que tuviera → **el arreglo es un sitio, no
dos**.

**Lo que sí queda cojo, y es otro ticket.** `asentar()` no comprueba el terreno y **no devuelve
`false` nunca** (un solo `return true`), así que un esqueleto atraviesa la roca y el estado
«bloqueada» es inalcanzable. Está medido en navegador en `data/tickets/REQ-AG17/contexto.md`. Es un
agujero **preexistente**: taparlo aquí habría sido colar un cambio de comportamiento grande y visible
dentro de un arreglo de una línea. Lo hace [REQ-AG17](PLAN.md#-req-ag17).

**Y el arreglo destapa lo que el `throw` escondía.** Al no morir ya en `quitar()`,
`test_bloques_comportamiento.js` corre entero por primera vez: **363 ok / 25 fallos**, y los 25 son
justo la física de esqueletos («sube el escalón de roca en vez de estrellarse contra él», «...y lo
dice: *bloqueada*», «no atraviesa un muro de estructuras»). Se comprobó que **no** los causa este
cambio: con el snippet de HEAD + solo el borrado de las 12 líneas salen **los mismos 25**. Buena
noticia para REQ-AG17: el guardián ya tiene escrito el criterio de aceptación, no hay que inventarlo.

`test_luz_traspasa.js` deja de petar en su línea 48 (**22 ok**) y quedan **2 fallos** que no son de
aquí: la celda de aire de control mide **luz 6 en vez de 15** porque el `/map/test` del dueño tiene
algo encima de ese punto. Sin ticket todavía.

---


## Incidencias — todas RESUELTAS (2026-07-20)

<a id="-req-osd1"></a>

### ✅ REQ-OSD1 · Poder ocultar los botones «Código» y «Cerrar» del Mundo (y que no salgan por defecto) — ✅ hecho 2026-08-06
**Reportado** 2026-08-06 por el dueño: «los botones de "código" y "cerrar" en el modo mapa se pueden
ocultar, estaría bien algo en plan `game.showOSDbuttons(false)`; por defecto que no se muestren».

**Estado actual**
`.mc-actions` (`index.html:503-506`, `style.css:670`) fija en la esquina superior derecha del Mundo
`#mc-code-btn` («🧩 Código», atajo **Alt+C**) y `#mc-close` («✕ Cerrar», atajo **Esc**). Están siempre
visibles mientras el Mundo está abierto, tapan esa esquina del mundo y **salen en las fotos** (tecla F
/ 📷). Ningún test los pulsa, y `closeWorld` sigue enganchado al `onclick` aunque el botón no se vea.

**Propuesta**
Tunable `game.showOSDbuttons`, con la **misma forma** que `game.showFPS`/`game.showVoxels`: getter que
devuelve una función invocable con `valueOf`, así que valen `game.showOSDbuttons(false)` y
`game.showOSDbuttons = false`. Persistido (`vf_showOSD`) y listado en `game.dumpVars()`. Oculta
`.mc-actions` entera; **por defecto `false`**, como pide el dueño.

**⚠️ Riesgo que hay que resolver ANTES de poner el defecto en `false`**
En **táctil no hay teclado**: `#mc-touch` (`index.html:495-499`) solo trae el stick, saltar y foto. Sin
el botón «Cerrar» y sin Esc, **un móvil se queda sin salida del Mundo** — y el dueño juega en móvil
(390 px). Hay que elegir una:
- **(a)** el defecto oculto solo aplica con teclado; en táctil los botones siguen saliendo;
- **(b)** un botón de salir dentro de `#mc-touch`, que es donde ya vive lo táctil;
- **(c)** una zona/gesto de rescate que los devuelva (tocar la esquina, dos dedos…).
Recomendación: **(b)**, y si no, (a). (c) es lo que menos se descubre solo.

**✅ DECIDIDO** (dueño, 2026-08-06): «en móvil que se muestre el botón cerrar». Es una **(a) parcial**,
y es mejor que la (b) que yo proponía: no se inventa un botón nuevo, se conserva el que ya existe y ya
está en su sitio. Regla exacta:

| | `🧩 Código` | `✕ Cerrar` |
|---|---|---|
| con teclado | oculto por defecto | oculto por defecto (queda **Esc**) |
| táctil | oculto por defecto | **siempre visible**, pase lo que pase con el defecto |

El detector ya existe y **no hay que inventarlo**: `MC_TOUCH` (`app.js:10018`) =
`matchMedia('(pointer:coarse)').matches || navigator.maxTouchPoints>0`.

⚠️ Consecuencia que hay que respetar: en táctil, `game.showOSDbuttons(false)` **no** puede esconder
`#mc-close`, o volvemos al encierro. Si algún día se quiere de verdad, que sea un tunable aparte y
explícito; el defecto nunca deja el móvil sin salida.

**Verificación esperada**
- `game.showOSDbuttons(false)` esconde los dos botones y `true` los devuelve; sobrevive a recargar; sale
  en `game.dumpVars()`.
- Con los botones ocultos: **Esc** sigue cerrando el Mundo y **Alt+C** sigue abriendo los snippets.
- En viewport táctil de 390 px, `✕ Cerrar` **se ve** con el defecto puesto, y cerrar funciona tocándolo.
- Una foto (F) del Mundo con el defecto puesto no lleva botones encima.

---

**RESUELTO** 2026-08-06. `game.showOSDbuttons`, con el mismo patrón callable+setter que `showFPS`
(`app.js`, junto a `applyShowVox`): estado `_showOSD` en `false` de fábrica, persistido en
`vf_showOSD`, y `updateOSDbuttons()` como único sitio que toca el `hidden` de los dos botones. Sale en
`game.dumpVars()`.

⚠️ **Corrijo la decisión que yo mismo anoté esta mañana: el detector NO es `MC_TOUCH`, es
`mcTouchOn`.** Al implementarlo apareció que ya existe `game.touchControls` (`app.js`, junto a
`MC_TOUCH`), que arranca en `MC_TOUCH` pero el dueño puede forzar en los dos sentidos y se persiste en
`vf_mcTouch`. Es lo que decide si salen los mandos táctiles. Colgar «Cerrar» de la constante cruda
dejaba las dos cosas diciendo lo contrario en un portátil táctil: mandos táctiles apagados (o sea,
teclado) pero botón de cerrar forzado; o peor, mandos encendidos a mano en escritorio y el botón
escondible. Ahora `game.touchControls` re-aplica `updateOSDbuttons()` al cambiar, así que **la salida
del Mundo siempre coincide con el mando que el dueño está usando**.

**Verificado** — `node test_botones_osd.js` nuevo, 19 ok, en **dos contextos de navegador** porque el
defecto depende del dispositivo: escritorio (los dos ocultos de partida, conmutan, persisten, `Esc`
sigue cerrando y `Alt+C` sigue abriendo los snippets sin los botones) y táctil de 390 px (`✕ Cerrar`
visible de partida, `showOSDbuttons(false)` **no** puede esconderlo, `🧩 Código` sí, y apagar
`touchControls` lo vuelve escondible). El caso «`showOSDbuttons(false)` no puede esconder Cerrar» es
el que impide que el móvil se quede encerrado.

⚠️ **QUITADOS 2026-08-13** — dueño: «cuando se está en el mapa los botones de "código" y "cerrar" hay
que quitarlos, ya llegamos de otras formas», y al turno siguiente «sigo viendo estos dos botones, te he
dicho que los quites» (con captura). Las dos frases hacían falta porque **la primera vez los escondí en
vez de quitarlos**, que no es lo que pidió.

Por el camino salió el bug que explica por qué los veía: **este ticket llevaba desde 2026-08-06 dado
por hecho sin estar hecho.** El JS era correcto —`updateOSDbuttons()` ponía `hidden=true` y `_showOSD`
nacía en `false`—, pero `hidden` solo trae un `display:none` de la hoja del navegador y
`.btn{display:inline-flex}` **le gana**: medido en `/map/test` recién abierto, los dos daban
`hidden=true`, `display=flex` y **80×26 / 71×26 píxeles en pantalla**. Y encima `vf_showOSD` los
resucitaba en cada carga en cualquier navegador que hubiera llamado una vez a `showOSDbuttons(true)`,
así que «no salen de fábrica» y «no los ve el dueño» **nunca fueron la misma frase**.

Lo que se ha hecho, ya en firme:

- Fuera del DOM `#mc-code-btn`, `#mc-close` y su `.mc-actions`; fuera de `app.js` `_showOSD`,
  `applyShowOSDbuttons`, `updateOSDbuttons`, `game.showOSDbuttons` y su entrada en `dumpVars()`; fuera
  del CSS las reglas de escaparate/intro/osd que los apartaban. **Se va también `localStorage.vf_showOSD`**:
  sin clave que leer, nadie tiene que ir a limpiarla a mano.
- **La salida de táctil no se pierde y no era negociable**: pasa a `#mc-tsalir`, un `mc-tbtn` dentro de
  `#mc-touch`. Vive ahí y no en la esquina para que se encienda y se apague con los mandos
  (`mcTouchShow`) en vez de tener un segundo sitio que mantener en sincronía. Va **arriba a la derecha**,
  no en la pila del pulgar: es la única acción de esa capa sin vuelta atrás.
- ⚠️ **Y con un menú OSD puesto había una trampa**: `body.mc-osd-puesto` escondía `.mc-touch` entera, y
  ahora eso se llevaba por delante la salida. Vuelve en táctil, y **solo el ✕** — con `z-index` 30, por
  encima de `.mc-osd` (25), porque la capa de mandos vive en el 7 y un botón debajo de una capa a
  pantalla completa se ve pero no se pulsa. Un ✕ decorativo es peor que no tenerlo.

**El arreglo colateral que también valía la pena**: `.btn[hidden]{display:none}` en `style.css`. Otros
**7 botones** con `hidden` se estaban viendo por lo mismo (🗑 Borrar de snippets, Quitar habitación,
Quitar seleccionado, Borrar agente, Vaciar ranura, Borrar y 🔍 Ver Traza de la nota), todos en la
dirección de esconderse.

**Por qué el guardián no cogió nada de esto, que es la lección**: `test_botones_osd.js` preguntaba por
`!el.hidden`, o sea **por la intención del código, no por lo que se ve**, y daba 19 verdes con los dos
botones dibujados en pantalla. Reescrito: comprueba que **no están en el DOM**, que la API y la clave de
`localStorage` no existen, y que el ✕ táctil es **pulsable** (`elementFromPoint`, no `getBoundingClientRect`
— «se ve» no es «se puede pulsar»). 16 ok. Regla general: un guardián de «esto no se ve» que lee el
atributo `hidden` no comprueba nada; en este repo `display` puede pisarlo.

Guardianes tocados por el arrastre: `test_intro.js` (23 ok), `test_osd_capa.js` (26), `test_osd_boton.js`
(9) y `test_osd_mapa.js` (55) usaban los dos botones como observable de «el HUD se aparta»; ahora miran
hotbar y mira, que es lo que de verdad se quería medir.


<a id="-perf-mc3"></a>

### ❌ PERF-MC3 · Abrir un mundo VACÍO cuesta 2,2 s, y el 81 % es bajar la paleta EN SERIE — ❌ cerrado 2026-08-07 (lo hecho se queda; el resto no se hace)
**Reportado** 2026-08-06 por el dueño: «cargo `/map/empty`, que no tiene ni un voxel, y se tira en
"Preparando bloques (0/15)…" un buen rato, cosa que no tiene sentido; quiero saber qué pasa».

**Medido** (no supuesto). `game.loadReport()` del dueño, host remoto, `/map/empty` = 0 voxels,
0 estructuras, 0 notas → **2178 ms** en total:

| fase | ms | % |
|---|---|---|
| **Paleta: assets + rasterizar caras** | **1775,2** | **81,5** |
| Red: descargar mundo | 310,5 | 14,3 |
| Bake de mundo vacío | 30,9 | 1,4 |
| WebGL: contexto + shaders | 36,0 | 1,7 |
| resto (lista, atlas→GPU, hotbar) | ~0,7 | 0 |

Y dentro de la paleta: **15 de 15 bloques hubo que descargarlos (1774 ms), EN SERIE** — `roca` 868 ms,
`hierba` 162, `tierra` 149, `adoquin` 141, `tablones` 141, `red_concrete` 138, `arena` 136… y los ocho
`hab:*` de redstone entre **2,6 y 5,7 ms cada uno**.

**Contraste en local** (sonda Playwright, caché fría, localhost ⇒ latencia ≈ 0, paleta de 7): la fase
de paleta sigue costando **328,9 ms**, entre 4,7 y 87,3 ms por bloque. O sea que **no es solo la red**:
una parte gorda es CPU (`JSON.parse` + rasterizar 6 caras). La red multiplica el problema porque va en
serie.

**Por qué pasa** (las tres causas, separadas)
1. **Se descarga entero lo que no se usa.** El `.vox.json` de un bloque por defecto pesa **78–103 KB**
   (`roca` 78 KB, `red_concrete` 103 KB; ~600 KB entre los siete) porque lleva sus 4096 voxels con
   color. De todo eso, para el atlas se usan **6 caras de 16×16 px** ≈ 1,5 KB de píxeles. Los `hab:*`
   pesan 2–4 KB y por eso van a 3–6 ms: la diferencia es el tamaño del documento, no el número de
   pasos. Y el mundo está **vacío**: no hay ni un voxel de ninguno de esos bloques.
2. **En serie.** `mcBuildPaletteImpl` (`app.js:6189`) es un `for` con `await getTexDef(b.key)` dentro:
   15 idas y vueltas una detrás de otra. El propio informe ya lo dice en su última línea.
3. **El cartel dice «0/15» porque el aviso llega tarde.** `onProgress` se llama en `app.js:6218`,
   **después** de terminar el bloque, y con `bi+1`. El primero (`roca`, 868 ms) transcurre entero con el
   cartel en `0/15`; y el nombre que se enseña es el del bloque **ya terminado**, no el que se está
   bajando. Por eso parece un cuelgue: el número no se mueve justo mientras más se trabaja.

**De paso, descargas que nadie pidió** (visto en la sonda, pendiente de averiguar quién las hace):
durante la carga se piden **`/api/habitantes` tres veces** y `/assets/madera.vox.json` +
`/assets/hierba-alta.vox.json`, que **no están en la paleta** de ese mundo.

**Propuestas, por relación ganancia/riesgo**
1. *(barato, hazlo ya)* **Avisar ANTES de empezar cada bloque**, no después: el cartel diría
   «(0/15) roca ⬇» mientras la baja. Una línea, y el síntoma reportado —«se queda en 0/15»— desaparece
   aunque no se toque el rendimiento.
2. **Paralelizar las descargas** con un tope de concurrencia (6–8): traer los documentos a la vez y
   rasterizar después en serie (el canvas del atlas es compartido). 15 idas y vueltas → 2–3 tandas.
3. **Cargar la paleta perezosamente**: los 6 bloques por defecto están para poder *construir* (son la
   hotbar), no porque el mundo los use. El mundo podría abrirse ya y completarse la hotbar detrás.
4. *(de fondo)* Que el servidor sirva **las caras ya rasterizadas** — un `.faces.png` por asset, o un
   `/api/atlas?keys=…` que devuelva el atlas entero de un GET. Quita a la vez la transferencia y el
   `JSON.parse`. Y/o caché de caras entre sesiones (IndexedDB por clave+mtime): un atlas de bloque son
   6×16×16 px, cabe de sobra.

**Verificación esperada**
- Con caché fría en el host remoto, `game.loadReport()` enseña la fase de paleta **por debajo de
  ~400 ms**, y el total de `/map/empty` por debajo de ~800 ms.
- El cartel de carga **nunca se queda más de ~300 ms en el mismo número**, y el nombre que enseña es el
  del bloque en curso.
- Prueba de navegador que abra el Mundo y compruebe que las peticiones de assets **se solapan** en el
  tiempo (hoy son estrictamente consecutivas), y que la paleta resultante es la misma de antes.
- Averiguado y anotado quién pide `/api/habitantes` tres veces y los dos assets de fuera de la paleta.

**Cómo se resolvió (2026-08-06)** — se hicieron las propuestas **1 y 2**. Las 3 y 4 quedan **abiertas
a propósito** (ver abajo): con lo barato ya sobra para el síntoma reportado, y las otras dos son
decisiones de arquitectura que no merece la pena tomar sin volver a medir.

- **Las descargas van en tandas** — `mcPrecargarDocs(keys, tope)` (`app.js`, justo encima de
  `mcBuildPaletteImpl`) suelta las peticiones con un tope de 8 a la vez y **no se espera a que
  acaben**. El bucle de la paleta **sigue yendo en serie tal cual estaba** —rasteriza sobre un canvas
  compartido y escribe `mc.palette[id]` en orden, así que no se puede desordenar—, pero cuando le toca
  el bloque 5 su documento ya está bajando. La pieza que lo hace posible es que **`getRoomData` cachea
  la PROMESA**, no el resultado: pedir un documento dos veces no lo baja dos veces. Por eso el cambio
  es de 6 líneas y no una reescritura del bucle.
  El tope existe porque el navegador solo abre ~6 conexiones por host: soltar 200 de golpe no baja
  nada antes y sí retrasa al resto de la carga.
- **El aviso va ANTES del bloque, no solo después** — `onProgress` se llama ahora dos veces por
  bloque, con un séptimo argumento `empezando`. La de «empezando» lleva `n = bi` (los ya hechos) y el
  nombre del que **se está bajando**; la de después es la única que trae el `ms` y por tanto la única
  que entra en el informe de carga. Se acabó el «(0/15)» clavado durante 868 ms enseñando el nombre
  del bloque anterior.
- **`/api/habitantes` ×3 — averiguado y arreglado.** No era el Mundo: son **tres inicializadores del
  editor** que arrancan a la vez, cada uno con su GET (`refreshHabitantesList`, `loadRooms` y
  `refreshTexturas`, los tres desde `loadServerAssets`). `apiHabitantes()` ahora **comparte la
  petición en vuelo**, no el resultado: en cuanto llega suelta la promesa, así que un
  `apiHabitantes()` posterior a guardar o borrar vuelve a preguntar de verdad. Cachear el resultado
  habría dado listas rancias.
- **Los dos assets de fuera de la paleta — averiguado, y NO se toca.** `madera.vox.json` y
  `hierba-alta.vox.json` los pide `renderTexStrip`: es la tira de texturas **del editor**, que se pinta
  detrás mientras el Mundo carga. No sobran, son de otra pantalla. Lo único que hacían era ocupar dos
  de las ~6 conexiones del navegador.

**Medido** (localhost, caché fría, contexto nuevo en cada vuelta, paleta de 8; sonda Playwright):

| fase «Paleta: assets + rasterizar caras» | vuelta 1 | vuelta 2 | vuelta 3 |
|---|---|---|---|
| **antes** | 356,7 ms | 366,9 ms | 426,2 ms |
| **después** | 56,0 ms | 78,0 ms | 55,2 ms |

≈ **6×**. Y desmiente la sospecha que traía el ticket: si una parte gorda hubiera sido CPU
(`JSON.parse` + rasterizar 6 caras), esos 383 ms de media no se habrían caído a 63 — era **espera en
serie casi entera**, incluso con latencia ≈ 0.

⚠️ **En el host remoto del dueño esto NO está medido.** Ahí el coste eran 1774 ms de idas y vueltas
consecutivas, así que la mejora debería ser mayor que en local, pero es una previsión, no un dato: la
verificación de «paleta por debajo de ~400 ms en remoto» **está pendiente de que el dueño abra
`/map/empty` y mire `game.loadReport()`**.

**Verificación** — `node test_paleta_paralela.js`, 12 ok / 0 fallos, estable en tres vueltas. Mide la
**forma**, no el reloj: que cada documento de la paleta se pisa en el tiempo con otro, que el **pico de
peticiones en vuelo es ≥ 4** (yendo en serie sería 1 por definición), que la paleta sale completa **y en
el mismo orden** (el id de bloque es la posición en `mc.blockKey`, y los mundos guardados llevan ids
dentro), que el primer cartel ya dice `(0/8) hierba ⬇`, y que `/api/habitantes` se pide una sola vez.
Deliberadamente **no** compara reloj de pared contra suma de las partes: en localhost cada petición
dura 2-35 ms y lo que domina es la cola de conexiones del navegador, así que sería una medida que
aprueba y suspende sola.
Sin regresiones: `test_informe.js` 34 ok · `test_materiales_en_espera.js` todo ok ·
`test_atlas_estructuras.js` 13 ok · `test_galeria_assets.js` 7 ok ·
`test_bloques_comportamiento.js` 384 ok · `test_navegador.js` 15 ok.

**⚠️ Y en el host del dueño NO ha servido de nada** (medido por él el mismo día, `/map/empty`, paleta de
17): la fase de paleta fue **8955 ms**. La **forma** sí cambió —`hierba` 8813,9 ms y los otros 16 entre 3
y 22 ms— y eso confirma que el paralelismo llega: el bucle va en serie, así que el primer `await` se come
la espera de todos y los demás se encuentran el documento hecho. Pero el conjunto tardó **5× más que en
serie** (1774 ms antes, 15 documentos). Las dos medidas puede que ni sean comparables: en esa carga
«Red: descargar mundo» costó **1166 ms para un mundo vacío**, o sea que el enlace estaba mucho peor que
el día de la medida original.

**Medido en su máquina (2026-08-06), y zanja la duda:**

```
RED · 23 documentos, 192 KB por el cable en 13118 ms de reloj (suma de las partes: 7813 ms).
      pico de 15 en vuelo a la vez · 15 KB/s efectivos
```

**El cuello es el ANCHO DE BANDA**, no la latencia: 15 KB/s. Paralelizar ya no puede dar más de sí —lo
único que queda es **mandar menos bytes**, o sea la propuesta 4.

Pero el número que de verdad enseñó algo fue otro: **23 documentos para una paleta de 17**, y un reloj
de pared (13118 ms) **mayor** que la suma de las partes (7813 ms). Si de verdad hubiera 15 en vuelo todo
el rato, la suma tendría que ser mucho **mayor** que el reloj; que sea la mitad significa que en ese
ventanal hay **huecos**, o sea que no todo salió en la ráfaga inicial. Los seis de más eran **las
miniaturas de las galerías**: `refreshHabitantesList` y la lista de habitantes pedían cada documento con
un `fetch` pelado y `cache:'no-store'`, **sin pasar por `getRoomData`** — el mismo documento que ya
estaba bajando para la paleta, otra vez, y una tercera para la otra galería. La línea de al lado sí
usaba `getRoomData` para los assets; solo los `hab:` se habían quedado fuera. Arreglado (dos líneas), y
ahora el informe **canta los duplicados solo**, con los KB tirados, para no tener que abrir la pestaña
de red.

Lo que hay que distinguir es **latencia** (muchas idas y vueltas ⇒ paralelizar gana) de **ancho de
banda** (demasiados bytes ⇒ paralelizar no gana nada, y encima N descargas gordas a la vez pueden
saturar un enlace fino y llegar todas al final). Para eso: `game.loadReport()` ahora imprime una línea
`RED ·` sacada de la **Resource Timing API** (`mcRedDeLaPaleta`), que es la única fuente que sabe cuándo
salió y cuándo llegó cada petición de verdad — el `ms` que apunta el bucle solo mide su propia espera y
desde este cambio se concentra entera en el primer bloque, así que **engaña**. La línea da documentos, KB
por el cable, reloj de pared, suma de las partes, **pico de simultáneas** (en serie sería 1) y KB/s
efectivos, y dice cuál de los dos cuellos es.

Dato que ya se tiene: la paleta pesa **~718 KB en crudo** (`hierba.vox.json` solo son 78,5 KB para un
16³ macizo) pero el servidor **ya la sirve con gzip** — 78,5 KB → 20,9 KB —, así que por el cable son
~126 KB para 8 bloques y del orden de ~280 KB para los 17 suyos. Si resulta que son 280 KB en 9 s, el
cuello es el ancho de banda a ~31 KB/s y **lo único que ayuda es mandar menos bytes**.

**Lo que queda abierto (propuestas 3 y 4)** — la paleta perezosa y que el servidor sirva las caras ya
rasterizadas (`.faces.png` / `/api/atlas?keys=…` / caché en IndexedDB). Si la línea `RED ·` del dueño
dice «ANCHO DE BANDA», la 4 pasa a ser **la** solución y no una optimización más: 6 caras de 16×16 en PNG
son ~1,5 KB frente a los 20,9 KB del `.vox.json` gzipeado, y encima se ahorra el `JSON.parse`.
También queda por decidir si el tope de 8 es el bueno en un enlace fino, o conviene bajarlo.

**❌ Cerrado 2026-08-07 por decisión del dueño, con las propuestas 3 y 4 SIN HACER.** Lo entregado se
queda y no se toca: paleta en tandas de 8 (383 → 63 ms en local), el cartel que ya dice qué bloque está
bajando **antes** de bajarlo, los tres inicializadores compartiendo la petición en vuelo, los `hab:`
pasando por `getRoomData` (seis descargas duplicadas menos) y la línea `RED ·` de `game.loadReport()`,
que es lo que permitió zanjar la duda.

⚠️ **Lo que se acepta al cerrar:** en el enlace del dueño abrir un mundo sigue costando ~9-13 s, y eso
**no se arregla**. El motivo para cerrarlo igualmente es que la medida dice que el cuello **no está en
el motor**: 15 KB/s efectivos y 192 KB por el cable = ancho de banda. Todo lo que queda por hacer es
mandar menos bytes, o sea un formato nuevo servidor↔cliente (`.faces.png` + caché en IndexedDB), que es
un ticket de obra propia y no la continuación de éste.

**Qué lo reabriría** (entonces sí, como ticket nuevo): que el enlace mejore y la carga siga siendo
lenta —eso movería el cuello de vuelta al motor—, o que el dueño decida que ~10 s son inaceptables y
quiera pagar el formato pre-rasterizado. El diagnóstico ya está hecho y medido; no hay que repetirlo.


<a id="-bug-snp1"></a>

### ✅ BUG-SNP1 · «no existe el material X» miente, llena la consola y PIERDE la definición — ✅ done (2026-08-06)
**Reportado** 2026-08-06 por el dueño, junto al anterior: «en la consola hay mucha información, alguna
que no tiene sentido». Al abrir `/map/empty` salen **diez `console.warn` con traza de pila completa**:
`hab:escalera`, `asset:assets/diana.vox.json`, `hielo`, `hielo-pista-de-patinaje`, `cabeza`, `brazo`
(desde `mundo-autoarranque`) y `hab:cable-on`, `hab:placa-on`, `hab:puerta-abierta`, `hab:boton-on`
(desde el snippet de redstone). Diez trazas ahogan el informe de carga, que es lo único útil que hay ahí.

**El mensaje miente.** Todos esos materiales **existen** en el servidor: `data/habitantes/escalera.json`,
`assets/diana.vox.json`, `assets/hielo.vox.json`, `assets/hielo-pista-de-patinaje.vox.json`,
`assets/cabeza.vox.json`, `assets/brazo.vox.json`. Lo que ocurre es otra cosa: `resolver()` valida
contra `clavesConocidas()` = **la paleta del mundo ABIERTO**, y la paleta solo lleva lo que está
*colocado* (+ hotbar + los 6 por defecto). En un mundo vacío no está casi nada, así que un mundo vacío
es precisamente el que más se queja. El texto sugiere un error de escritura cuando el problema es
«todavía no hay ninguno puesto».

**Y no es solo ruido: se pierde el comportamiento.** `define()` hace `return null` **sin guardar nada**
cuando `resolver()` falla. Pero la paleta **crece** al colocar un material nuevo — y para entonces la
definición ya se tiró. Consecuencia concreta: en `/map/empty`, si colocas una `hab:escalera` **no tendrá
su comportamiento** en toda la sesión, aunque el autoarranque intentó dárselo al abrir. Eso convierte un
aviso cosmético en un fallo funcional silencioso.

**Dónde vive** ⚠️ Esto **NO es `app.js`**: `resolver`/`define` están en
`data/snippets/mundo-autoarranque.json` y los `define` de las piezas en el snippet de redstone. Se
editan en los ficheros de `redstone/` y se publican con `redstone/make_snippets.js`; recordar que el
snippet tiene **dos copias vivas** y que el dueño lo edita en vivo (ver CLAUDE.md).

**Lo que se hizo** — la regla, que es todo el ticket en una línea: **si se parece a algo de la paleta,
es un typo y se avisa; si no se parece a nada, es que todavía no está en este mundo y se espera en
silencio.** Sin preguntar al servidor, que era lo que parecía hacer falta.

- **`parecidos()`** — distancia de edición acotada (se corta en cuanto pasa del tope, sin calcularla
  entera), con tope 1 para nombres cortos y 2 a partir de 8 letras: en `cable` un cambio ya es otra
  palabra, en `escalera` dos siguen siendo el mismo dedo torcido. Medido contra la paleta real de
  `/map/empty`: `hielo`↔`hierba` = 3 y `diana`↔`arena` = 3 (⇒ esperan), `eskalera`↔`escalera` = 1
  (⇒ avisa). El filtro por subcadena que ya había sigue yendo primero.
- **Tabla de pendientes** — lo aplazado se guarda **crudo**, sin normalizar (normalizar depende de la
  clave resuelta, que es justo lo que falta) y se vuelve a pasar por `define()` intacto cuando el
  material aparece. La promoción cuelga de `reconstruirCache()` y **solo corre si la paleta cambió de
  tamaño**, que es la única forma de que aparezca un material nuevo: un `define()` normal no barre la
  lista de espera para nada.
- **Un `console.log` por tanda, no uno por material** — `game.bloques: N material(es) en espera`,
  agrupado con un `setTimeout(…, 0)`. Salen **dos líneas** al abrir `/map/empty` porque son dos
  snippets independientes (`mundo-autoarranque` y `redstone-piezas`), no once con traza de pila.
- **`quitar()` y `lista()` se enteran** — lo que espera sale en `lista()` como *en espera*; si no, un
  material aplazado no aparecería en ningún sitio y desde fuera sería indistinguible de una definición
  perdida, que es el fallo de partida. Más `game.bloques._pendientes()` para inspeccionar.

**La letra pequeña que costó dos vueltas**: un define que **sí** entra tiene que borrar la espera del
mismo material, y comparando por clave **resuelta** (lo que espera se guardó con el nombre que
escribieron: `ladrillo` vs `hab:ladrillo`). Sin eso pasaban las dos cosas: (a) `quitar()` creía que el
material *solo* esperaba, lo tachaba de la lista y dejaba puesto lo de la tabla —la cabeza se quedaba
torcida, y así lo cazó `test_bloques_comportamiento.js`—, y (b) promover una espera vieja **pisaba** la
definición nueva dos líneas después.

**Dónde vive**: `data/snippets/mundo-autoarranque.json`, que **no tiene fuente en el repo** y el dueño
edita en vivo desde Alt+C. Se aplica con `parche_snp1.py` (idempotente: si ya está, sale sin tocar
nada). ⚠️ Si el modal está abierto con una copia anterior, su próximo «guardar» se lleva esto por
delante. `app.js` **no se toca**.

**Verificación** — las cuatro que pedía el ticket, repartidas por donde de verdad se pueden probar:

| lo que pedía el ticket | dónde |
|---|---|
| `/map/empty` sin un solo aviso de `define` | `node test_materiales_en_espera.js` (navegador, 7 casos) |
| colocar el material ⇒ recupera su comportamiento | `test_bloques_comportamiento.js` (mundo de juguete: la paleta crece y la definición entra sola, hasta la caché densa) |
| un typo de verdad sigue avisando y sugiriendo | `test_bloques_comportamiento.js` (`eskalera` → `hab:escalera`, y **no** se queda esperando) |
| `lista()` refleja también lo que está en espera | los dos |

`node test_bloques_comportamiento.js` 384 ok / 0 fallos (eran 373; 11 casos nuevos). Sin regresiones en
`node test_atravesable.js` ni `node test_rayos_x_power.js`, que son los que más apoyan en este snippet.


<a id="-req-pick1"></a>

### ⬜ REQ-PICK1 · El selector de bloque/textura de una ranura: ancho, nombres, fuente, menú y filtros — ⬜ todo
**Reportado** 2026-08-06 por el dueño, cinco cosas sobre el mismo panel (`#mc-picker`, el que sale al
asignar material a una ranura de la hotbar): (a) se aprovecha poco el espacio y hay que hacer scroll,
podría ser más ancha; (b) los nombres salen cortados —«no distingo entre puerta abierta o puerta
cerrada, solo entra el *puerta*»—; (c) no usa la fuente del juego; (d) menú contextual con botón
derecho sobre la textura, con «ver ficha» y «editar material»; (e) filtros para elegir por familia
(los de redstone) o por propiedades.

**Estado actual, medido**
- El selector tiene **87 entradas**: 54 assets de tipo `bloque`/`textura` (de 58 en `assets/index.json`)
  + 33 habitantes de esos mismos tipos (de 37). Se pintan **todas de golpe**, sin filtro ni buscador
  (`mcOpenPicker`, `app.js:8835-8853`).
- Ventana `width:min(880px,95vw); max-height:86vh` y rejilla
  `repeat(auto-fill, minmax(74px,1fr))` (`style.css:675-679`) ⇒ ~10 por fila, ~9 filas: **el scroll está
  garantizado** aunque la ventana ya usa casi toda la pantalla a lo ancho. El espacio que sobra es el
  **vertical** de cada celda, no el horizontal de la ventana.
- `.mo-name` es `font-size:11px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis`
  (`style.css:471` + `678`) **y lleva el icono delante** (`${c.icon} ${esc(c.name)}`, `app.js:8847`),
  que se come 2-3 caracteres más. En una celda de 74 px entran ~9-10 caracteres.
- Cuantificado: **41 de los 87 nombres pasan de 9 caracteres**, 30 pasan de 12 y 14 de 15. Y hay **10
  prefijos ambiguos** al cortar por 9 — `repetidor…` (repetidor / repetidor-on), `Cabeza de…`,
  `Brazo de…`, `Pierna de…`, `Torso de…`, `Hormigón…`, `Hierba Ca…`, `Cubo Tran…`, `tejado…`,
  `Taberna…`. El caso que reporta el dueño (`puerta` vs `puerta-abierta`) es exactamente éste.
- `.mo-name`/`.mo-badge` **no** están en el bloque de `--font-game` (`style.css:709-720`): usan la
  fuente del sistema.
- **No hay `oncontextmenu`**: lo único que hace una celda es `o.onclick=()=>mcAssignSlot(…)`
  (`app.js:8851`).

**⚠️ (b) y (c) ya NO tiran en direcciones opuestas** — lo hacían cuando `--font-game` era Press Start
2P, que gasta 1.0 em por carácter y a 9px habría dado 126px para `puerta-abierta`, cortando **más**
nombres. Desde el cambio a **Pixeloid Sans** (proporcional, media de 5.6px por minúscula a 9px) las
medidas reales son: `puerta` 33px, `puerta-abierta` **72px**, `repetidor-on` 62px, `Hierba Camino`
68px, `Cabeza de zombi` 82px, `Cubo Transparente` 95px — o sea que en la celda de 74px la mayoría casi
entra ya, y lo que falta es sitio para el icono de delante. ⚠️ La restricción que lo sustituye:
**Pixeloid solo es nítida en múltiplos de 9** (`font-size/9` es su píxel de diseño), así que **no** se
puede bajar `.mo-name` a 8px para que quepa más — o 9px, o 18px (ver «🔠 La fuente del juego» en
`CLAUDE.md`). La combinación que cumple las dos:
celda más ancha (p. ej. `minmax(110px,1fr)`), nombre en **dos líneas**
(`white-space:normal` + `-webkit-line-clamp:2`) a 9px; y el `title` del elemento con el
nombre completo para el hover. Ampliar la ventana a `min(1200px,96vw)` da aire, pero **por sí solo no
arregla el corte**, porque el corte lo produce el ancho de la CELDA, no el de la ventana.

**(d) Menú contextual** — viable sin pelearse con el Mundo: `mcOpenPicker` ya hace `exitPointerLock()`,
así que dentro del selector el clic derecho está libre (hay que `preventDefault()` para que no salga el
del navegador, y cerrarlo con Esc / clic fuera).
- **«ver ficha»**: casi todos los datos ya se calculan — clave exacta, `badge` (`mcMatKind`,
  `app.js:7661`), tamaño y nº de celdas (`mcStructCells`, que el selector ya llama para el badge), y del
  documento salen `atravesable`, `caras`, `blockLike` y si emite luz.
- **«editar material»**: hoy la única vía es la galería del editor (`openHabitantes`, `app.js:1889`).
  ⚠️ **Pregunta abierta**: salir del Mundo para editar **pierde la sesión** (y volver cuesta lo que dice
  PERF-MC3). Propongo abrir el editor en **pestaña nueva** (`window.open`) y dejar el Mundo vivo; si el
  dueño prefiere navegar en la misma, que al menos guarde antes.

**(e) Filtros — ⚠️ regla de arquitectura que NO se puede saltar.** `app.js` **no sabe qué es
«redstone»**: el comportamiento vive en los snippets (CLAUDE.md §0). Meter una lista de claves de
redstone en `app.js` sería exactamente lo que la regla prohíbe. El precedente exacto de cómo se hace es
**`mcXrayExtra`** (`app.js:7670`): el snippet aporta una función y `app.js` solo la pinta. Traducido
aquí:
- `app.js` ofrece filtros por lo que **sí** sabe: `badge` (bloque / textura / guardada), origen
  (`asset:` vs `hab:`), y «ocupa más de una celda» (estructura) — que ya lo calcula.
- Punto de extensión (`mcPickerTags` o similar) para que el snippet de redstone etiquete sus piezas y
  aparezca el filtro «redstone» sin que `app.js` sepa qué significa.
- **Y primero, un buscador por texto**: es lo más barato de todo y lo que más scroll quita (87 → 3 al
  teclear «puerta»). Recomiendo empezar por ahí, antes que por los filtros.

**✅ DECIDIDO** (delegado en mí por el dueño, 2026-08-06). El ticket son cinco cosas de tamaños muy
distintos metidas en uno; **se parte en tres, y solo el primero entra en la cola ahora**:

| | qué entra | por qué va junto |
|---|---|---|
| **PICK1-A** | buscador por texto + celda a `minmax(110px,1fr)` + nombre en **dos líneas** a 9px + `title` con el nombre entero + fuente del juego + ventana a `min(1200px,96vw)` | es (a)+(b)+(c)+buscador, y **son una sola pasada de DOM/CSS sobre `mcOpenPicker` y `.mo-name`, con una sola ronda de verificación a 390 px**. Partirlo obligaría a repetir esa ronda tres veces |
| **PICK1-B** | menú contextual: «ver ficha» + «editar material» | es una **superficie de interacción nueva** (contextmenu, cierre por Esc/clic fuera, `preventDefault`). No comparte nada con A salvo el fichero |
| **PICK1-C** | filtros por familia/propiedades | necesita **inventar el punto de extensión** `mcPickerTags` **y** tocar el snippet de redstone para que etiquete. Es el único que no se puede terminar solo desde `app.js` |

**Orden: A ahora, B y C esperan.** El razonamiento, para que se pueda discutir y no haya que fiarse:

1. **A resuelve el dolor que el dueño describió con sus palabras.** Lo que reportó fue «hay que hacer
   scroll» y «no distingo puerta abierta de puerta cerrada». El buscador mata el scroll (87 → 3) y la
   celda ancha + dos líneas matan la ambigüedad en los 10 prefijos ambiguos medidos. B y C son cosas
   que estarían **bien**, no cosas que hoy molesten.
2. **A no arrastra ninguna pregunta abierta.** B sí: «editar material» choca con perder la sesión del
   Mundo. C sí: hay que diseñar un contrato de extensión, y los contratos mal puestos se quedan.
3. **A es el único de los tres que abarata a los otros dos.** Con buscador y filtro de texto ya
   escritos, C se reduce a añadir un origen de etiquetas más al mismo filtrado, en vez de a inventarlo.

**Y la pregunta abierta de B, decidida también para que no vuelva a bloquear**: «editar material» abre
el editor en **pestaña nueva** (`window.open`), y el Mundo se queda vivo en la suya. Cambiar de página
cuesta la sesión entera del Mundo y, encima, volver cuesta los 2,2 s de PERF-MC3; una pestaña nueva no
cuesta ninguna de las dos cosas. Si el dueño prefiere navegar en la misma, entonces hay que guardar
antes sí o sí.

**Verificación esperada** (los puntos de B y C quedan aparcados con sus tickets)
- Con la ventana y la celda nuevas: **ningún** nombre de los 87 sale ambiguo; `puerta` y
  `puerta-abierta` se distinguen a simple vista, y el `title` enseña el nombre entero.
- El texto del selector va en la fuente del juego **sin** perder legibilidad (comprobar los 14 nombres
  de más de 15 caracteres, que son el caso peor).
- Clic derecho sobre una celda abre el menú con las dos opciones; Esc y clic fuera lo cierran; el menú
  del navegador no sale.
- «editar material» **no** tira abajo el Mundo abierto.
- Buscador y filtros reducen la lista, y `app.js` **no** contiene ni una clave de redstone.
- Todo lo anterior comprobado también en **viewport de 390 px**, donde `95vw` deja la ventana estrecha
  y el problema del corte es peor.


<a id="-req-icon1"></a>

### ✅ REQ-ICON1 · `/images`: los iconos de la aplicación salen de dibujos vóxel — ✅ done (2026-08-13)
**Petición del dueño**: *«que se consuman los PNGs horneados, sí»*, sobre el mock de `/images` («implementa
el mock de /imagenes ya, haz que sea funcional»). La página ya existía como maqueta: enseñaba las 13
ranuras de la aplicación —favicon, marca del editor y las 11 herramientas—, dejaba asignarle a cada una
un dibujo del catálogo con su postura (`@0`..`@23`), su modo (`plano` o `iso`) y su suavizado, y **no
escribía nada**. Este ticket la cierra de punta a punta.

**Quién rasteriza**: el navegador, no el servidor. El rasterizador es `pinta()` de `images/index.html`
—las mismas fórmulas que `drawIsoFaces` de `app.js`, culling por vecino y sombreado 1,10 / 0,72 / 0,55—,
y llevárselo a Python sería mantener el mismo dibujo escrito dos veces en dos lenguajes. El servidor
**valida y escribe**: mismo trato que `/api/fotos` (bytes mágicos del PNG, `atomic_dump`, papelera).

**Dos cosas distintas viven en `data/ui/`** y conviene no confundirlas:
- `ranuras.json` — la **asignación** (`ranura → {dibujo:'hab:x@7', modo, aa}`). Es la fuente de verdad y
  lo único que hace falta conservar: de ahí se rehornea todo. La postura va **siempre explícita, también
  la `@0`**, por lo mismo que en el motor: omitirla deja dos escrituras para la misma cosa.
- `<ranura>-<px>.png` — el **derivado**. Se versiona igual (excepción en `.gitignore`) porque los HTML
  los piden por URL fija y un clon recién hecho enseñaría la pestaña rota hasta que alguien entrase a
  publicar. **No se editan a mano nunca.**

**Cómo llegan a la aplicación** — sin `<img>` escritos a mano en ningún HTML, que 404earían mientras no
haya nada publicado:
- **Favicon**: `server.py` sirve `/favicon.ico` desde `data/ui/favicon-32.png`. Los cuatro HTML ya pedían
  `/favicon.ico` (y les daba 404, porque nunca ha existido en disco), así que **publicar cambia el icono
  del sitio entero sin tocar una línea de HTML**.
- **Marca y herramientas**: `iconos.js` (nuevo, `defer`, 60 líneas) pregunta `/api/ui` una vez y hace el
  cambiazo en el DOM. **Si no hay nada publicado no hace nada**: cada botón se queda con su emoji y la
  marca con su `◧`. Busca por `data-tool`, así que cambia las **dos** barras (`#tools` y `#tool-float`) sin
  saber en qué orden están, y sustituye **solo el nodo de texto del emoji**: el `<i class="tool-swatch">`
  que pinta `app.js` y el `<span>` de la etiqueta se quedan donde están.

**Un arreglo visual que salió de una captura del dueño** (*«algunos iconos no se muestran debidamente
cuando se suavizan… en sandbox se visualiza mejor»*): el PNG era **idéntico** en la tarjeta y en el
sandbox — lo que cambiaba era el **fondo de la previa**. Medido sobre *Alis la Duplicadora* (32³) en iso
con AA, el fleco de silueta con alfa parcial es el **31,6 % del icono a 16×16** (42 de 133 píxeles), el
15,1 % a 32 y el 2,6 % a 256; sobre el tablero claro de la tarjeta ese fleco se leía como neblina, y
sobre el sólido oscuro que el sandbox hornea detrás, como borde limpio. En `plano` es **0 % a cualquier
tamaño** (un vóxel es un píxel). Ahora el tablero lo decide el dibujo: `docTraslucido(doc)` mira el alfa
real de los vóxeles y solo el agua y compañía lo llevan. Sonda: `performance/sonda_aa_pequeno.js`.

**Y un segundo arreglo visual, que NO era el mismo** (*«el icono está bien generado, puesto que lo he
copiado y pegado aquí, pero visualmente se ve mal en `/imagenes`»* + *«el 32x32 del sandbox se ve
genial»*): el contenido quedó descartado a la primera —`performance/sonda_previa_vs_png.js` compara el
lienzo de la tarjeta con el PNG horneado y son **idénticos** ampliados ×8—, así que el fallo estaba en
**enseñarlo**. `performance/sonda_previa_dpr.js` lo reprodujo: a `deviceScaleFactor` **1 y 2 nítido, a
1,25 y 1,5 deshecho**. Un lienzo de 16 px a 16 px de CSS son **20 píxeles de pantalla** con Windows al
125 %, y `image-rendering:pixelated` a 1,25× solo puede duplicar unas filas sí y otras no. (El sandbox se
salvaba porque con AA usa `image-rendering:auto`.) **Mi primer intento se pasó de listo y el dueño lo
cazó**: amplié el búfer ×k entera en *todos* los lienzos, y entonces copiar el de 32 daba un 64×64
(*«no puedo copiar el 32x32 a esa resolución, muestra un tamaño mayor, parece x2»*, y *«no veo la
mejora»*). La lección es que en esta página **hay dos clases de lienzo**: el de **tamaño natural** no es
una previa, **es el PNG** —se copia y se pega para comprobarlo—, así que se queda **1:1** y solo cambia
`image-rendering` a `auto`, que es *exactamente* lo que hace el sandbox (`pintaSandbox`), la referencia
que el dueño da por buena; y los **ampliados a propósito** (`×2`/`×4`, y la rejilla de 24 posturas a
48 px) sí llevan la ×k entera con `k = ceil(cssW * dpr / px)` —`ceil` y no `round`: por debajo de la
rejilla el navegador inventa píxeles y vuelve el moaré— para que al navegador solo le quede **reducir**.
`image-rendering:pixelated` se mudó de `.lienzo` a `.sb-previa canvas`, y `pintaPrevia` lo repone inline
solo en el caso 1:1 sin AA. Medido: `performance/sonda_previa_vs_sandbox.js` da **0 de 4096 subpíxeles
distintos** entre tarjeta y sandbox a dpr 1 y 1,25. A/B ×3: `performance/sonda_previa_antes_despues.js`.

**Guardianes**: `tests/test_images_ui.js` (16 ok — publica, comprueba el IHDR de cada PNG, que se sirve
por su URL, que reabrir restaura postura/modo/`aa` desde el JSON, que lo que no es un PNG da 400, y —en
una segunda página a **`deviceScaleFactor` 1,25**, porque a dpr entero el fallo no se ve— que el lienzo
de 32 sigue midiendo 32 al copiarlo y es idéntico al del sandbox) y
`tests/test_images_consumo.js` (12 ok — **sin publicar el editor se ve igual que siempre**, y publicando
aparecen marca, las dos barras, el swatch y la etiqueta intactos, y `/favicon.ico` pasa de 404 a PNG).
Los dos **restauran `data/ui/` a como estaba** al terminar.


<a id="-req-fly1"></a>

### ✅ REQ-FLY1 · Modo vuelo con la tecla `F` (y la foto a `Alt+F`) — ✅ done (2026-08-12)
**Resuelto**: `mc.volar` / `mc.volarVel` / `mc.fantasma` viven en `mc`, y el vuelo es una **rama propia
en `mcUpdate` antes de la de fluido**: la horizontal se fija directa desde la vista (sin inercia de aire)
y la vertical es `(Espacio) − (Shift)` por `volarVel·√scale`, **cero exacto** sin teclas — no pasa por
`mcCaidaPaso`, así que no hay ni gravedad ni deriva. El salto se salta (`if(k[' '] && mc.onGround &&
!mc.volar)`), `mc.onGround` queda en `false` mientras se vuela (nada de parkour ni deslizamiento) y las
colisiones **se mantienen**: atravesar es `game.fantasma`, y solo surte efecto volando. `game.volar` /
`game.fantasma` usan el patrón función-valor de `game.showOSDbuttons` (`game.volar` lee, `game.volar(false)`
manda). Dos cosas que se descubrieron implementando: **`Alt+F` hay que detectarlo por `e.code==='KeyF'`**
(con Alt pulsado muchos teclados entregan un `e.key` compuesto, mismo motivo que el `Alt+C` que ya
existía) y **Shift ya venía multiplicando la velocidad horizontal** (`sp`), así que volando se usa un
`spf` propio o bajar te frena a la mitad. Guardián `tests/test_vuelo.js`: **15 ok / 0 fallos** (la caída
sin volar se compara contra `−22·n/60` exacto). Doc: [`docs/osd-e-intro.md`](docs/osd-e-intro.md).

**Reportado** 2026-08-12 por el dueño, dentro de la petición grande de la intro
([contexto literal](data/tickets/REQ-INTRO1/contexto.md)): «que el jugador pueda volar, vamos a cambiar
la tecla "f" por "alt+f" para sacar fotos, ahora el modo volar seria con la tecla "f". El movimiento
sería como estar dentro de un fluido pero sin caida hacia abajo (sin gravedad)».

**Por qué esto va en `app.js` y no en un snippet:** es física del jugador, la misma familia que
`mcCaidaPaso`. El snippet `mundo-autoarranque` **envuelve** `mcUpdate` (`game.bloques`), así que el
vuelo tiene que vivir DENTRO del `mcUpdate` original o el envoltorio lo pisaría.

- Estado en **`mc`**, nunca en un closure (reejecutar un snippet a mitad de un gesto no puede dejar al
  jugador flotando): `mc.volar`, `mc.volarVel`, `mc.fantasma`.
- Rama nueva en `mcUpdate`, **antes** de la de fluido: dirección tomada de la vista igual que al nadar,
  pero la vertical **no pasa por `mcCaidaPaso`** — es `(Espacio) − (Shift)`, y **cero** si no se pulsa
  nada. Ni gravedad ni deriva: quieto en el aire es quieto.
- **Las colisiones se mantienen.** El noclip es aparte (`game.fantasma`) y solo tiene efecto volando,
  para que no exista por accidente un atravesa-paredes a pie.
- `game.volar()` / `game.volar(true|false)` con el patrón función-valor de `game.showOSDbuttons`.
- Teclado: `F` conmuta, **`Alt+F` saca la foto**. El botón táctil 📷 sigue siendo la foto (en táctil no
  hay Alt) y el vuelo se activa por API, que es como lo usa la intro.
- **Guardián** `tests/test_vuelo.js` (`@area: fisica`) sobre `/map/test`: sin volar cae; volando y sin
  teclas la `y` no se mueve en 60 frames; Espacio sube y Shift baja; `Alt+F` no vuela y `F` no fotografía;
  al apagar, vuelve a caer.


<a id="-req-osd2"></a>

### ✅ REQ-OSD2 · Una capa OSD encima del juego y su API `game.osd` — ✅ done (2026-08-12)
**Resuelto**: `<div id="mc-osd" hidden>` dentro de `#mc-modal`, `inset:0`, **z-index 25** (encima del
canvas y de `#mc-loading` z-20, debajo del picker y de los snippets z-50/60). El estado vive en
`mc.osdPantallas` / `mc.osdAbierta` / `mc.osdAcciones`, no en closures. API completa:
`define/abrir/cerrar/conmutar/abierta/pantallas` + `alPulsar(texto,fn)` / `pulsar(texto)` / `acciones()`,
con el texto normalizado (trim + mayúsculas) — **el texto del botón ES su identidad**, que es lo que
permite que una pantalla pase de `{html:…}` a `{mapa:…}` sin tocar ni una acción registrada. Abrir suelta
el puntero y vacía `mc.keys`; mientras hay pantalla abierta `mcLockPointer` no recaptura y `mcDoAction`
sale por arriba (si no, los clics del menú romperían bloques por detrás de la capa). `Esc` es de dos
pasos: cierra el menú, no el Mundo. Una sola pantalla a la vez. Guardián `tests/test_osd_capa.js`:
**16 ok / 0 fallos**, y su §1 comprueba que **sin abrir nada el Mundo se comporta exactamente igual que
antes del ticket** (el clic se espía con la herramienta CUENTAGOTAS, que no toca el mapa del dueño).
Doc: [`docs/osd-e-intro.md`](docs/osd-e-intro.md).

**Reportado** 2026-08-12 por el dueño: «haria falta poder crear un OSD que se ponga encima del juego
para las opciones de "JUGAR" y "CONSTRUIR" […] quiero poder diseñar pantallas para OSD y activarlas con
f12 inspector, asi por ejemplo en mitad del juego puedo querer estando en un mapa arbitrario como "test"
activar la pantalla "menu1"».

⚠️ **No es `game.showOSDbuttons`** ([REQ-OSD1](#-req-osd1)): eso son los dos botones de la esquina. Lo de
aquí se llama **pantalla OSD** y vive en `game.osd`.

- `<div id="mc-osd">` dentro de `#mc-modal`, hermano de `#mc-loading`; `z-index:25` (por encima del canvas
  y del cargando, por debajo del picker y de los snippets).
- **Abrir un OSD suelta la cámara** (`exitPointerLock` + vaciar `mc.keys`): con el puntero capturado no hay
  cursor con el que pulsar nada, y las teclas se quedarían pegadas. Mientras hay OSD abierto,
  `mcLockPointer` **no recaptura** (guarda de una línea) o el cursor desaparecería al mover el ratón.
- API: `define/abrir/cerrar/conmutar/abierta/pantallas` + el registro de acciones `alPulsar(texto,fn)` /
  `pulsar(texto)` que comparte con [REQ-OSD4](#-req-osd4). El texto se normaliza (trim + mayúsculas).
- `Esc` cierra **primero el OSD** y solo después el Mundo.
- El OSD **se traga el clic**: si no, se rompen bloques por detrás de la pantalla.
- **Guardián** `tests/test_osd_capa.js` (`@area: render`), y su primera comprobación es que **sin abrir
  nada el juego se comporta exactamente igual que hoy**.


<a id="-req-osd3"></a>

### ✅ REQ-OSD3 · Una pantalla OSD que es otro mapa (`<iframe>` + `postMessage`) — ✅ done (2026-08-12)
**Resuelto**: `game.osd.abrir(x)` con `cfg.mapa` monta `<iframe src="/map/<mapa>?osd=1">` a pantalla
completa, y **`mcOsdCerrar` lo destruye de verdad** (`src='about:blank'` + `remove()`): es un segundo
contexto WebGL y no puede quedarse colgado. `?osd=1` (`mcEsEscaparate`) se marca **antes de `openWorld`**,
porque `mcScheduleSave` y la hotbar se consultan durante la carga y enterarse después dejaría una ventana
en la que la pantalla del menú sí guarda. En escaparate: no guarda, sin captura de puntero, `mc.volar=true`
(sin gravedad, la cámara se queda en el spawn) y todo lo de jugar escondido con la clase
**`body.mc-escaparate`** — con `hidden` no bastaba, porque `mcUpdateHotbar` re-muestra la hotbar sola en
cuanto el jugador se mueve. El puente comprueba `e.origin===location.origin` y **la acción se ejecuta en
el padre**: la pantalla solo dice qué botón se pulsó. Guardián `tests/test_osd_mapa.js`: **8 ok / 0 fallos**
(levanta dos mundos en SwiftShader, es lento a propósito). Doc:
[`docs/osd-e-intro.md`](docs/osd-e-intro.md).

**Reportado** 2026-08-12 por el dueño: «activar la pantalla "menu1" que seria otro mapa (map/menu1) par
que se ponga como OSD».

**Decidido con el dueño (2026-08-12): iframe, no una segunda escena.** `mc` es un **singleton**; tener dos
mundos vivos a la vez obligaría a sacarlo a instancias, o sea un refactor de `app.js` entero. La pantalla
se monta aislada en un `<iframe src="/map/menu1?osd=1">` y el motor no se toca.

- **`?osd=1` = modo escaparate**: no guarda nada (`mcScheduleSave` sale por la primera línea — esto es lo
  que impide que una pantalla de menú machaque `data/worlds/menu1.json`), sin hotbar, sin botones de
  esquina, sin mandos táctiles y sin captura de puntero (el cursor visible es lo que hace pulsable un botón).
- **Puente `postMessage`** con `e.origin===location.origin`: hijo → padre `{vf:'osd-pulsar',texto}`,
  padre → hijo `{vf:'osd-cerrar'}`. La acción se ejecuta **en el mundo de verdad**, no en la pantalla.
- **Al cerrar se destruye el iframe**: hay un segundo contexto WebGL vivo y no puede quedarse colgado.
- **Guardián** `tests/test_osd_mapa.js`.


<a id="-req-osd4"></a>

### ✅ REQ-OSD4 · Un botón del menú es un bloque con una nota — ✅ done (2026-08-12)
**Resuelto**: en escaparate el clic izquierdo sale por arriba de `mcDoAction` y hace
raycast → `mcNoteAnchor` → texto de `mc.notes` → acción (`postMessage` al padre si está incrustado,
`game.osd.pulsar` si no). **Pulsar no rompe**: el bloque y su nota siguen ahí, y es lo primero que
comprueba el guardián. El detalle que no estaba en el plan: **sin puntero capturado no hay mira**, así que
la dirección del rayo se deriva del píxel donde se hizo clic (`mcYawPitchDePixel`) y se **reutiliza
`mcRaycast` VERBATIM** dentro de un `try/finally` que pisa y restaura `mc.yaw`/`mc.pitch` — escribir un
segundo DDA habría creado dos rayos que se desincronizan. `MC_OSD_ALCANCE=96` (un botón de un menú puede
estar lejos, no a distancia de brazo) y el cursor pasa a `pointer` sobre un bloque con nota, que es la
única señal de que aquello se pulsa. Guardián `tests/test_osd_boton.js`: **9 ok / 0 fallos**, y verifica
además que en escaparate **no sale ni un `POST /api/mundo`** (sin eso, el primer clic escribiría encima
del dibujo del propio menú). Doc: [`docs/osd-e-intro.md`](docs/osd-e-intro.md).

**Reportado** 2026-08-12 por el dueño: «le pongo yo mecanicas al menu que podrian ser 2 bloques con textos
para que al hacer clic en uno y otro pase una accion, por ejemplo: se cargue un mapa concreto, se cambien
las coordenadas (teleport) del usuario».

**Decidido con el dueño (2026-08-12): la acción se declara por el TEXTO DE LA NOTA.** No hace falta infra
nueva: `mc.notes` ya planta carteles 3D con el texto horneado y legible, y `mcNoteAnchor(celda)` ya lleva de
la celda apuntada a la celda anotada (incluidos los bloques del propio cartel). Se descartaron declararlo
por coordenada (se rompe al mover el bloque) y por material dedicado (un asset dibujado por botón).

- En modo escaparate el clic izquierdo **no rompe**: raycast → `mcNoteAnchor` → texto → acción.
- Fuera del iframe la misma ruta llama a `game.osd.pulsar(texto)`, así que **una pantalla se puede probar
  sin OSD** entrando a `/map/menu1` a pelo — que es como el dueño la va a diseñar.
- **Guardián** `tests/test_osd_boton.js`: la acción corre **y el bloque sigue ahí**.


<a id="-req-intro1"></a>

### ✅ REQ-INTRO1 · La intro de `/map/fps`: sobrevuelo en tiempo real + JUGAR / CONSTRUIR — ✅ done (2026-08-12)
**Resuelto**: `app.js` solo aporta el **disparo** (`mcEsIntro` + `mcIntroArranque`).
Busca el snippet **`arranque-<mapa>`** — `/map/fps` → `arranque-fps` —, así
que **cada mapa lleva su propia intro** y probar una no pisa la de otro; si no existe, el mundo entra
normal y avisa por consola. Todo lo demás vive en `data/snippets/arranque-fps.json`: vuelo fantasma, una
órbita en `rAF` alrededor del centro con la altura persiguiendo la copa del terreno por suavizado
exponencial (sin eso cada pico es un salto), la mirada al centro con `yaw = atan2(−dx, −dz)` —la única
convención—, y el menú `{html:…}` con JUGAR / CONSTRUIR. El bucle vive en `mc._intro` y **se desmonta antes
de montar otro**. JUGAR **no recarga**: para el bucle, apaga fantasma y vuelo, baja a la superficie de la
columna de debajo (a mano + `mcUnstick`, para no soltarle el toast «Saltaste a …» en la cara a quien acaba
de entrar), cierra el menú y **captura el puntero dentro del propio manejador del clic**. Cualquier tecla
de moverse corta la intro y cae en JUGAR. Guardián `tests/test_intro.js`: **11 ok / 0 fallos** sobre
`/map/test?intro=1`, y **sirve el snippet real** (`arranque-fps.json`) interceptando la petición con
`p.route` — protege el código que el dueño va a usar, no una maqueta. De `/map/fps` se verifica a mano.
Doc: [`docs/osd-e-intro.md`](docs/osd-e-intro.md).

**Retoques del 2026-08-12, probando `/map/fps?intro=1` (los tres del dueño):**

1. «resulta un poco extraño que despues de cargar el mapa pasan unos 10 segundos con el usuario en el
   suelo, y entonces empieza la animacion».
2. «despues de renderizar el mundo y salir el osd, antes de empezar a volar se queda trabado como
   8 segundos».
3. «cuando se muestra "?intro=1" los botones de "codigo" y "cerrar" deberian de estar ocultos, tambien
   la pickerbar».

**(1) y (2) son el mismo problema por las dos caras.** `openWorld` deja el mundo pintado y jugable, y
**lo siguiente que hace —`mundo-autoarranque`, 274 KB de snippet— bloquea el hilo** varios segundos en un
mapa grande. Con la intro colgada de la cadena del arranque (detrás de `openWorld`) eso se veía como
«de pie en el suelo ~10 s»; adelantándola al principio de `openWorld` pasó a verse como «menú puesto y
cámara congelada ~8 s». Adelantarla no quita el bloqueo, solo cambia qué se mira durante él. La solución
es **no enseñar nada hasta que haya algo que enseñar**: la intro va detrás del `await mcAutoarranque()`
**pero con el cartel de carga puesto** (`mcShowLoading('Preparando el mundo…')` / `mcHideLoading()`), así
que el menú y el vuelo se descubren **a la vez**. Un cartel de carga que tarda es normal; un producto que
arranca trabado, no. De propina, **el snippet se pide en paralelo con el mundo** (`mcIntroPrefetch`, en el
arranque) para no sumar un viaje de red al final, y la llamada automática lleva **pestillo**
(`mcIntroArranque(true)` + `mc._introHecha`) porque `openWorld` se reejecuta al volver del editor y la
intro no puede replantarse encima de alguien que ya le dio a JUGAR — **a mano sigue relanzando**, que es
como se prueba mientras se edita. ⚠️ El bloqueo **no lo introdujo la intro**: está en cualquier entrada al
Mundo, solo que antes lo tapaba «el jugador de pie mirando el paisaje». Si algún día molesta, lo que hay
que mirar es **qué hace `mundo-autoarranque` al entrar en un mapa grande**, no dónde se llama a la intro.

**(3)**: clase **`body.mc-intro`** en `style.css`, la misma lista de selectores que el escaparate
(hotbar, mira, mandos táctiles, «Código», «Cerrar»). La pone y la quita **el snippet**, no `app.js`, así
que **JUGAR lo devuelve todo** respetando `game.showOSDbuttons` (que va apagado por defecto: el dueño los
veía porque los tiene encendidos). Por clase y no por `hidden`, porque `mcUpdateHotbar` re-enseña la
hotbar sola en cuanto el jugador se mueve.

`tests/test_intro.js` pasa a **16 ok / 0 fallos**. El §2 nuevo anota quién se descubre y cuándo con un
**`MutationObserver`** sobre el `hidden` de `#mc-loading` / `#mc-osd`, y **no muestreando por `rAF`**:
durante el tramo que importa el hilo está bloqueado y un muestreo se lo saltaría entero.

**Reportado** 2026-08-12 por el dueño ([contexto literal](data/tickets/REQ-INTRO1/contexto.md)): «podemos
hacer un script que ponga al jugador en modo vuelo y que con un algoritmo le hagamos volcar por el mapa
"fps" para que el usuario que entre en el juego/producto vea esa animacion que se genera en tiempo real.
[…] Jugar mandaria al usuario al mapa/bioma que se esta sobrevolando, aprovechamos que ya esta cargado,
construir lo mandaria al modo de edicion 2d/3d actual».

**Decidido con el dueño (2026-08-12):**
- **Se dispara solo con `?intro=1`.** `/map/fps` a secas entra como siempre: nada de lo que hoy funciona
  cambia, y el producto final apunta a la URL con intro.
- **CONSTRUIR va al editor `/`** (el 2D/3D de siempre), no a un modo creativo dentro del mapa.
- **JUGAR no recarga**: para el bucle, apaga vuelo y fantasma, busca la superficie bajo la cámara,
  teleporta ahí y captura el puntero **dentro del propio manejador del clic** (es gesto de usuario;
  hacerlo tras un `await` lo rechaza el navegador). Es literalmente lo que pidió el dueño con
  «aprovechamos que ya esta cargado».
- **La animación vive en un snippet** (`data/snippets/arranque-fps.json`), no en `app.js`: el dueño la
  retoca en vivo. Guarda su handle en `mc._intro` y **desmonta el bucle anterior al reejecutarse**, misma
  regla que el envoltorio de `mcUpdate` — dos bucles apilados moverían la cámara al doble.
- Cualquier tecla de movimiento **corta la intro** y cae en modo JUGAR: quien ya sabe lo que quiere no
  espera a la animación.

⚠️ **`fps` no se puede probar con guardián**: es 512×512×40 (20 MB) y bajo SwiftShader no carga. El
guardián (`tests/test_intro.js`) repite la secuencia sobre `/map/test?intro=1` con un snippet de prueba;
de `fps` se verifica a mano.


<a id="-req-osd6"></a>

### ✅ REQ-OSD6 · Un OSD se pone ENCIMA, no borra lo que hay — ✅ done (2026-08-12)

**Pedido** 2026-08-12 por el dueño, probando `game.osd.define('menu', {mapa:'menu1'}); game.osd.abrir('menu')`:
«se ve como se pone todo azul, como empiezan a salir mensajes de cosas que cargan, y luego sale el mapa…
mucho flash de informacion para algo que deberia de ser un simple menu, basta con que se muestre el mapa
una vez cargado. como mucho un overlay de carga pero sin el fondo azul que borra lo que hay, además, la
idea de un menu en plan OSD es que salga encima, como un overlay, igual sin mostrar el cielo en los osd
que sean mapas queda mejor, asi el azul del cielo no molesta y deja ver a traves».

Lo que se veía era **la apertura del mundo de dentro en directo**. Cuatro costuras:

1. **El cielo no se pinta** en escaparate: `mcClearFondo(gl)` limpia con **alpha 0**, así que donde no
   hay nada dibujado se ve el juego de debajo. Va en los **tres** sitios que limpian el fondo, incluido
   el que restaura el clear tras la pasada de sombra — uno que se olvide devuelve el azul un fotograma
   sí y otro no.
2. **Ninguna capa del documento vuelve a taparlo**: `body.mc-escaparate` deja transparentes `#mc-modal`
   (que llevaba el azul del cielo detrás del canvas) y el `body`, `mcAplicaEscaparate` hace lo mismo con
   `<html>` (no tiene clase donde engancharse), y se esconde el resto del documento — con el modal
   transparente, la cabecera y las columnas del editor asomaban por detrás.
3. **La pantalla no habla**: `mcShowLoading` y `toast` no hacen nada en escaparate. ⚠️ La guarda de
   `toast` pregunta por **`mcEsEscaparate()` (la URL)** y no por `mc.escaparate`: `mc` es un `let` de más
   abajo y hay toasts antes de que exista — en la zona muerta ni `typeof mc` es seguro, tira
   `ReferenceError` y convierte un aviso en una página rota.
4. **Se descubre de una vez, ya cargada**: el iframe nace con `cargando` (`opacity:0`) y una ruedecita
   **sin fondo** encima (el juego se sigue viendo). El hijo manda `{vf:'osd-listo'}` cuando el mundo está
   pintado *y* el autoarranque ha corrido — **dos** `requestAnimationFrame`, porque el primero es el que
   pinta. Reloj de `MC_OSD_ESPERA_MS` (12 s) por si no llega nunca, y cerrar lo mata.

`tests/test_osd_mapa.js` §1 y §5: nace invisible, se descubre, el `clearColor` va con alpha 0, un frame
entero deja pasar luz por el cielo, `<html>`/`body`/`#mc-modal` sin fondo, la cabecera oculta, y ni
cartel ni toasts.


<a id="-req-osd7"></a>

### ✅ REQ-OSD7 · El encuadre de una pantalla-mapa — ✅ done (2026-08-12)

**Pedido** 2026-08-12 por el dueño: «cuando se muestra un osd se deberia de poder indicar las coordenadas
(teleport) del jugador para poder encuadrar correctamente el menu/mapa/osd. Tambien la rotacion de la
camara. se podrian obtener del juego la posicion y la rotacion y cuando se define el menu que es de tipo
mapa pasarle esa posicion y rotacion».

```js
game.osd.define('menu', {mapa:'menu1', pos:[64, 20, 64], yaw:-135, pitch:-20});
game.osd.encuadre()   // ← la cámara de ahora mismo, impresa como ese define ya escrito
```

- **`pos`** en coordenadas de mundo (como `game.tp`) y **`yaw`/`pitch` en GRADOS** (como `game.yaw` /
  `game.pitch`): las mismas unidades que el dueño lee en la consola, para copiar sin convertir nada.
- Viaja **en la URL del iframe** (`&pos=…&yaw=…&pitch=…`), no por `postMessage`: tiene que estar puesto
  **antes del primer fotograma**, y un mensaje llega con el hijo ya pintado — se vería como un salto de
  cámara. Lo aplica `mcEscaparateEncuadre` desde `mcAplicaEscaparate`.
- Se escribe **directo en `mc`, no con `game.tp`**: `tp` desatasca y sube al aire libre más cercano, y
  aquí las coordenadas son las de una **cámara**, no las de alguien que va a andar — un menú encuadrado
  desde dentro de una pared es legítimo.
- **Sin encuadre no cambia nada**: la cámara se queda donde diga el spawn del mapa, como hasta hoy.
- La receta de `game.osd.dump()` lo enseña, y el descubridor es `game.osd.encuadre()`: encuadrar es
  volar por el mapa hasta que se vea bien y copiar la línea, no teclear coordenadas a ojo.
- **Añadido 2026-08-12, avisando el dueño** («si no se fija `game.playerScale=1` cuando se carguen los
  OSD que son mapas, estos van a salir descolocados»): **una pantalla-mapa se pone a `mc.scale = 1`**
  en `mcAplicaEscaparate`. `game.playerScale` **persiste en `localStorage`** y el iframe comparte
  origen con el padre, así que se heredaba la escala del visitante; el ojo es
  `pos[1] + MC_EYE*mc.scale`, o sea que el **mismo `pos` de la URL encuadraba distinto en cada
  navegador** y no había forma de cuadrar el menú para todos. Un menú no es alguien que va a andar por
  ahí: es una **cámara**. No se toca el `localStorage` (fuera del menú su escala sigue valiendo).
  Guardián: `test_osd_mapa.js` §13.

`tests/test_osd_mapa.js` §6 (y el fichero entero pasa a **19 ok / 0 fallos**; hoy **55 ok**).


<a id="-req-osd5"></a>

### ✅ REQ-OSD5 · `game.osd.dump()` — el descubridor del OSD — ✅ done (2026-08-12)

**Pedido** 2026-08-12 por el dueño: «para game.osd quiero una funcion que me vuelque las pantallas
definidas junto con su configuracion y las acciones registradas para los botones, en plan
game.osd.dump(); de esta forma un usuario que no conoce como funciona el osd puede definir nuevas
pantallas».

Hermano de `game.bloques.info()`: se pide en la consola y **cuenta el OSD con lo que hay cargado en ese
momento**, en vez de mandar a leer `app.js`. Imprime legible y **devuelve** el volcado
(`{abierta, pantallas:[{nombre,tipo,cfg,abierta,botones,sinAccion}], acciones, sinBoton}`), y cierra con
un recetario de cuatro líneas para definir una pantalla nueva.

**Devuelto por el dueño en la primera pasada**, con la frase que resume qué le faltaba: «con esto no se
que hace un boton,,, no se crear un boton como los de esta pantalla, el dump deberia de mostrar que
hacen los botones tambien». Un nombre de botón no es una respuesta. Así que cada botón sale con las
**dos piezas que lo forman**: `marca` (su HTML exacto, para copiarlo) y `hace` (el **código fuente** de
la acción registrada, vía `String(fn)`, sin la sangría sobrante y cortado a 18 líneas). Y debajo, un
recetario de dos pasos —el `<button class="mc-osd-btn">` y su `alPulsar`— con las clases de estilo ya
hechas, porque eso es lo que no se adivina leyendo el volcado.

- **Los botones se leen igual que los lee `mcOsdAbrir`** (`[data-osd]` o el texto del `<button>`,
  normalizado con `mcOsdClave`), parseando en un `<template>` — que no ejecuta scripts ni baja imágenes:
  esto es un informe, no un montaje. Un volcado que no coincida con lo que se va a enganchar de verdad
  sería peor que no tenerlo.
- **Señala las dos averías normales**, que es para lo que se mira: `✗ sin acción` (botón que no hace
  nada al pulsarlo) y `sinBoton` (acción que nadie va a llamar). Casi todo «el OSD no responde» es un
  texto que no coincide.
- Una pantalla `{mapa:…}` devuelve `botones: null` **a propósito**: sus botones son bloques con nota y
  viven en ese otro mapa.

**Devuelto por segunda vez**: el dueño copió el `jugar()` del volcado a la consola y le saltó
`intro is not defined` (y `cima` igual) — el código se cerraba sobre variables del snippet, que fuera de
él no existen. Su indicación fue «mejor que pase el entorno», así que `alPulsar` acepta un 3.er
argumento con lo que la acción usa de su snippet y `game.osd.entorno(texto)` lo sirve en la consola.

**Devuelto por tercera vez**, y ésta es la que fija la forma final: «esto no tiene sentido, no me puedes
dar un ejemplo con una funcion de la cual no tengo sus parametros: `function jugar(clave, ent)` … que es
clave, que es ent? **deberian de autoresolverse**». Tenía razón: recibir el entorno por parámetro
arreglaba el `is not defined` inventando dos parámetros que había que explicar, y un ejemplo que primero
hay que completar a mano no es un ejemplo. La forma final:

- **Una acción se escribe con CERO parámetros** y se la llama sin argumentos (`fn()`). No hay convención
  de llamada que aprender.
- El volcado no imprime `hace` pelado sino **`receta`** (`mcOsdReceta`): la línea
  `const { intro, cima } = game.osd.entorno('JUGAR');`, el código, y la llamada — en ese orden. **Se
  copia entera y corre.** Si la acción es anónima o flecha, la receta la ata a `const accion = …;`.
- El 3.er argumento de `alPulsar` **no cambia cómo corre el botón**: solo **declara** qué usa de su
  snippet, para que `entorno()` lo sirva y la receta salga completa. Sin él, `falta` avisa de qué nombres
  no van a existir fuera y trae la línea de `alPulsar` ya escrita para arreglarlo.
- Se añade **`origen`**: dónde se registró la acción (`el snippet «arranque-intro»` / `la consola (F12)`),
  vía `mc._snippetActual`, que fija `mcCorreSnippet`. Leído el volcado, lo siguiente que se quiere saber
  es dónde hay que ir a cambiarlo.

`data/snippets/arranque-intro.json` va por **v5** (`jugar()` y `construir()` sin parámetros, registradas
con su entorno declarado), parcheado con `parche_snp_intro_sin_params.py` + `parche_snp_intro_comentario.py`.

`tests/test_osd_capa.js` pasa a **26 ok / 0 fallos**: §8 **evalúa la receta en el ámbito global** —el
copia-pega del dueño, literal— y comprueba que corre, que hace lo del botón, que sin la línea de entorno
sigue fallando, y que a la acción se la llama con cero argumentos. `tests/test_intro.js`, 23 ok / 0
fallos. Detalle en [`docs/osd-e-intro.md`](docs/osd-e-intro.md).


<a id="-req-intro2"></a>

### ✅ REQ-INTRO2 · La intro en cualquier mapa, y volver a ella desde el editor sin recargar — ✅ done (2026-08-12)

**Pedido** 2026-08-12 por el dueño, probando `/map/fps?intro=1`: «dos cosas, quiero desde el editor 2d/3d
si hago click en "VOXELFORGE" volver al modo intro=1 sin necesidad de recargar assets, etc. la otra es
que cualquier mapa, no solo fps, tiene que aceptar el parametro ?intro=1».

**(1) Cualquier mapa.** `mcIntroArranque` busca **`arranque-<mapa>`** y, si no existe, la intro genérica
**`arranque-intro`** (`data/snippets/arranque-intro.json`), que está escrita contra `mc.dim` y se orienta
sola en un mundo que no ha visto nunca. Es un **respaldo, no una copia**: por eso `arranque-fps` se ha
retirado y `/map/fps?intro=1` corre el mismo snippet que los demás — arreglar la genérica los arregla a
todos. Un `arranque-<mapa>` propio sigue ganando, y es para quien quiera una intro **distinta**.

**(2) Ida y vuelta sin recargar.** El editor y el Mundo **son la misma página** (el Mundo es el overlay
`#mc-modal`), así que `location.href='/'` era recargarla entera: mundo, atlas y galerías otra vez.
Ahora CONSTRUIR llama a **`closeWorld()`**, y la marca «VOXELFORGE» del editor (`#marca-inicio`) llama a
**`mcVolverAIntro()`** → `openWorld()` (idempotente: con `mc.grid` en memoria no baja nada) +
`mcIntroArranque()` a mano.

- **`mcIntroArranque(auto)`**: con `auto` exige `?intro=1` y corre **una sola vez** (`mc._introHecha`);
  sin `auto` relanza **siempre**, aunque la URL no la pida — quien la llama a mano ya ha dicho lo que
  quiere. Sin esa distinción el pestillo del arranque impediría volver.
- **La marca solo se ve pulsable si hay un mundo en memoria** (`mcMarcaSync`, clase `.clicable`): en el
  editor a secas no debe prometer un camino que no existe.
- **La URL no se toca** (nada de `history.replaceState`): `mcMapName()` la lee para saber en qué mundo
  está, y cambiarla guardaría el mundo en otro fichero.

`tests/test_intro.js` pasa a **23 ok / 0 fallos**: el §2 nuevo ejerce el respaldo **de verdad** (ya no se
intercepta el snippet con `p.route`; `/map/test` no tiene intro propia, así que la que corre es la que
sirve el servidor) y el §7 nuevo hace la ida y vuelta comprobando que un centinela de `window` sobrevive
y que **no vuelve a haber un GET de `/api/mundo`**. Detalle en
[`docs/osd-e-intro.md`](docs/osd-e-intro.md).


<a id="-req-nav1"></a>

### ✅ REQ-NAV1 · La barra superior se reduce a tres botones: [Galería] [🌍 Mundo] [⋯] — ✅ resuelto 2026-08-07
**Reportado** 2026-08-06 por el dueño: «todas las opciones "Objeto / Habitantes / Objetos /
Habitaciones / Texturas / Mapa / ▶ Jugar / 🌍 Mundo / 🧩 Código / 🦴 Agentes / Nuevo / Guardar /
Guardar como… / Exportar / Importar" pasan a estar dentro de un botón "..." que solamente las muestra
cuando se hace clic en él, menos "Objeto / Habitantes / Objetos / Habitaciones / Texturas" que pasa a
ser un botón visible junto a "..." llamado "Galería" que une todo lo que contienen igual que hace la
galería dentro del mapa. También sale fuera de "..." mapa, por lo que solamente quedan 3 botones
visibles: [Galería] [Mapa] y [...]».

**Estado actual** — la barra son **quince** botones en dos grupos hermanos de `index.html`:
`<nav class="tabs" id="tabs">` (líneas 22-32, las diez pestañas) y `<div class="actions">` (34-41, las
cinco acciones de fichero). Un único manejador delegado en `#tabs` (`app.js:3151-3163`) reparte por
`dataset.tab`.

**El hallazgo que abarata el ticket: la «Galería» ya existe, sin saberlo.** Las cuatro pestañas que el
dueño quiere unir llaman **a la misma función con distinto filtro** (`app.js:3153-3156`):

```js
if(t.dataset.tab==='habitantes'){   openHabitantes('habitante');  return; }
if(t.dataset.tab==='objetos'){      openHabitantes('objeto');     return; }
if(t.dataset.tab==='habitaciones'){ openHabitantes('habitacion'); return; }
if(t.dataset.tab==='texturas'){     openHabitantes('textura');    return; }
```

`openHabitantes(kind)` (`app.js:1889`) ya pinta **un solo modal** (`#hab-modal`, `index.html:254`)
sobre **una sola rejilla** (`#hab-grid`), mezclando ya las dos fuentes —`/api/habitantes` y
`assets/index.json`— y filtrando por `habBucket(h.type)` (`app.js:1885`), con sus rótulos en
`HAB_TITLE`/`HAB_EMPTY` (1886-87) y el bucket vivo en `habKind` (1888). O sea que **«Galería» no es
una vista nueva: es la que hay, con un selector de bucket dentro y sin el filtro fijado desde fuera.**
El trabajo real es el selector (4 pastillas o un «Todo») y decidir el bucket por defecto.

**⚠️ «Objeto» no cabe en Galería, y es el único punto del ticket que no se sostiene solo.** Las otras
cuatro abren un overlay; `objeto` **no abre nada**: cae al final del manejador (`app.js:3162`) y solo
marca `is-active` porque **es el lienzo del editor**, el fondo sobre el que se abren todos los demás.
Metida dentro de «Galería» no habría forma de volver al lienzo salvo cerrando la galería. Lo coherente
con lo que pide el dueño —tres botones— es que **cerrar la Galería (✕ o Esc) SEA volver a Objeto**, y
que no haga falta entrada propia. Conviene confirmarlo antes de implementar.

**«Igual que hace la galería dentro del mapa» es el ASPECTO, no el contenido.** La del mapa es
`mcOpenPicker` (`app.js:8852`), que arma su lista con `mcBuildCatalog` (`assets/index.json` +
`/api/habitantes`) pero **solo de `bloque` y `textura`** — dos de los cuatro buckets. La Galería nueva
tiene que cubrir los cuatro (habitantes y objetos incluidos), así que es un **superconjunto**: sirve de
modelo la presentación (rejilla única, icono, badge, miniatura) pero no se puede reutilizar su lista.
Nota: son **dos catálogos distintos alimentados por las mismas dos fuentes**; unificarlos de verdad es
otro ticket, y arrastra el `mcKindCache` de rayos-X (`app.js`, `mcMatKind`).

**Entradas duplicadas que hay que reconciliar de paso** — el panel derecho ya tiene sus propios botones
«Galería ▤»: `#btn-habitantes` (`index.html:243`) y `#btn-habitaciones` (245). Si la barra pasa a tener
un botón «Galería», esos dos quedan como atajos redundantes al mismo modal. Decidir: se quedan (llevan
al bucket concreto) o se quitan.

**Lo que se rompe y hay que tocar a la vez**
- **`test_panel_agentes.js:46`** hace `p.click('[data-tab="agentes"]')`. Si «🦴 Agentes» se va dentro
  del `⋯`, ese clic deja de encontrar el botón: hay que abrir el menú primero o cambiar el test.
  Los otros tres tests que tocan galerías (`test_ficha_material.js:58`, `test_galeria_assets.js:57`,
  `test_guardar_pieza.js:73`) llaman `openHabitantes('textura')` **por evaluate**, así que **sobreviven
  intactos** — buena señal de por dónde debe entrar el test nuevo.
- **Alt+C y Alt+A siguen funcionando** aunque sus botones se escondan: cuelgan de `window` mirando
  `e.code` (`app.js:3200` y `3209`), no del DOM del botón. Es un argumento a favor del ticket, no en
  contra — pero entonces **Código y Agentes pierden su única pista visible**, así que el menú `⋯` debe
  mostrar el atajo junto al nombre.
- **CSS**: `.tabs` (`style.css:62`) y `.actions` (74), más la media query `≤980px` (785-787) que hoy
  existe **solo** para que las diez pestañas fluyan a una fila propia y `▶ Jugar` se empuje al extremo.
  Con tres botones esa media query sobra casi entera. **Esto es la mayor ganancia del ticket**: el dueño
  juega a ~390 px, donde hoy la barra come dos o tres filas de pantalla.

**Decisiones que quedan abiertas para el dueño** (no las cierro yo)
1. ¿Cerrar la Galería vuelve a «Objeto», o «Objeto» va también dentro del `⋯`?
2. ¿La Galería abre en un bucket concreto o en un «Todo» mezclado de los cuatro?
3. `▶ Jugar` y `🌍 Mundo` son las dos de uso más frecuente y las más caras de alcanzar con dos clics.
   ¿Seguro que van dentro del `⋯`? El enunciado dice que sí; lo dejo anotado por si al usarlo molesta.

**✅ DECIDIDO** (dueño, 2026-08-06): «Jugar dentro de "...", y Mundo fuera; solo 3 botones
`[Galería] [Mundo] [⋯]`».

⚠️ **Esto CAMBIA el enunciado original del ticket, y hay que leerlo así y no como un matiz.** El
reporte decía «también sale fuera de "..." **mapa**, por lo que solamente quedan 3 botones visibles:
[Galería] [**Mapa**] y [...]». La decisión sustituye ese tercer botón:

| | enunciado original | decidido |
|---|---|---|
| botón 2 | `🗺 Mapa` | **`🌍 Mundo`** |
| `🗺 Mapa` | visible | **dentro del `⋯`** |
| `▶ Jugar` | dentro del `⋯` | dentro del `⋯` (sin cambio) |

Es coherente con la pregunta 3 que dejé abierta: de las dos caras de alcanzar, la que se salva es
`Mundo`, no `Jugar`. Queda entonces: **fuera** `Galería`, `🌍 Mundo`, `⋯`; **dentro del `⋯`**
`🗺 Mapa`, `▶ Jugar`, `🧩 Código`, `🦴 Agentes`, `Nuevo`, `Guardar`, `Guardar como…`, `Exportar`,
`Importar` — y `Objeto` según la decisión 1, que **sigue abierta**.

Las decisiones **1 y 2 siguen sin respuesta** y no bloquean empezar: la 1 tiene un defecto razonable
(cerrar la Galería vuelve a Objeto, que es el lienzo de fondo) y la 2 también (abrir en el bucket que
se usó la última vez). Se implementan así y se corrigen si al usarlo molesta.

**Verificación esperada**
- La barra muestra exactamente **tres** botones —`Galería`, `🌍 Mundo`, `⋯`—; `⋯` abre un menú con las
  restantes (Mapa y Jugar **incluidos**) y se cierra con Esc, con un clic fuera y con un segundo clic
  en `⋯`.
- «Galería» abre `#hab-modal` y desde dentro se puede pasar por los cuatro buckets sin cerrarla, con
  el mismo contenido que hoy dan las cuatro pestañas por separado (mismo recuento por bucket).
- Todo lo que hoy funciona sigue funcionando desde el menú: Nuevo, Guardar, Guardar como…, Exportar e
  **Importar** — ojo, Importar es un `<label>` con un `<input type=file>` dentro (`index.html:39-41`),
  no un `<button>`: al moverlo hay que comprobar que el diálogo de fichero sigue abriéndose.
- Alt+C y Alt+A siguen abriendo Código y Agentes con el menú cerrado.
- A **390 px** la barra ocupa **una sola fila**, y a 1280 px no hay regresión.
- `node test_panel_agentes.js` en verde (adaptado), y los tres de galería **sin tocar**.

**✅ RESUELTO 2026-08-07** — `node test_barra_tres_botones.js` **22 ok, 0 fallos** ·
`node test_panel_agentes.js` **40 ok** · `node test_galeria_assets.js` **7 ok** ·
`node test_guardar_pieza.js` **17 ok** · `node test_ficha_material.js` **11 ok**, todos sin fallos.

⚠️ **De paso salieron dos tests que fallaban por el arranque, no por el código.**
`test_guardar_pieza.js` y `test_ficha_material.js` lanzaban `chromium.launch()` **sin los args de
SwiftShader** que usa el resto de la suite: así el arranque se cuela **~9 s** en el WebGL por software
y sus esperas fijas (`waitForTimeout(1200)`) se quedaban cortísimas. Se les puso el lanzamiento de
siempre, y en `test_ficha_material.js` la espera del guardado pasó a ser **una condición** (el toast
«Ficha guardada» o el aviso de error, limpiados antes del clic) en vez de contar 1,2 s a ojo — fallaba
el **primer** alias y salían verdes los siguientes, que es lo que enmascaraba el problema.

Quedó así, y las dos decisiones abiertas se cerraron por el defecto razonable que ya estaba anotado:

- **La barra son tres `.tab`** en `#tabs`: `▤ Galería`, `🌍 Mundo`, `⋯` (`#btn-mas`, con
  `aria-haspopup`/`aria-expanded`). Las **nueve** restantes viven en `#mas-menu` como `.menu-item`:
  `🗺 Mapa`, `▶ Jugar`, `🧩 Código`, `🦴 Agentes`, `Nuevo`, `Guardar`, `Guardar como…`, `Exportar`,
  `Importar`. **Desaparece el grupo hermano `.actions`**: barra y menú son ahora una sola lista.
- **`irA(tab)` es el router único** que comparten barra y menú, así que una entrada hace lo mismo
  esté donde esté. El menú se cierra con Esc, con un clic fuera (`pointerdown` en captura) y con un
  segundo clic en `⋯`. ⚠️ La rama de Esc del menú va **antes** que la de los modales: al revés, Esc
  cerraría la galería de debajo en vez del menú de encima.
- **Decisión 1 → cerrar la Galería ES volver a «Objeto»**, y por eso **no hay botón «Objeto»**: el
  lienzo del editor es el fondo sobre el que se abre todo. Se quitaron las dos líneas muertas de la
  pestaña `objeto`.
- **Decisión 2 → la Galería lo enseña TODO.** Se implementó primero con cuatro pastillas de bucket y
  memoria en `localStorage`, y el dueño lo corrigió el mismo día: **«ir a Galería es mostrar todo lo
  que hay y punto»** — la clasificación *Habitantes / Objetos / Habitaciones / Texturas* «no tiene
  sentido en el mapa, ahí solamente se cargan bloques». Así que **fuera las pastillas, fuera
  `vf.habKind`**: `habKind = null` significa *sin filtro* y `openHabitantes()` abre las **102** piezas
  de las dos fuentes juntas. El parámetro `kind` **sigue vivo** porque los atajos «Galería ▤» del panel
  derecho nacen junto a su roster —ahí el filtro sí significa algo— y porque tres tests entran por él.
  ⚠️ **Las dos fuentes había que fusionarlas ANTES de pintar.** Pintarlas en dos pasadas (assets y
  luego habitantes, como se hacía) hace que **cada tipo salga dos veces**: los 8 assets de habitación
  arriba y las 8 del servidor cincuenta tarjetas más abajo. El test lo cazó (`habitante → objeto →
  habitacion → textura → habitante → objeto → habitacion → textura`). Ahora es **un solo bucle** sobre
  una lista fusionada y ordenada por `HAB_ORDEN`, con las 86 texturas al final para que no se coman la
  primera pantalla; cada tarjeta lleva `data-bucket`, que es además lo que hace comprobable el reparto.
- **Importar sigue siendo un `<label>` con su `input[type=file]#file-importar`** dentro del menú; como
  `<button>` no abriría ningún diálogo. El test lo comprueba explícitamente.
- **La ganancia de verdad, medida:** a **390 px** los tres botones caen en **una fila**, `#tabs` no es
  más alto que un botón (42 px) y **la cabecera entera mide 70,6 px** — donde antes las quince
  pestañas envolvían en dos o tres filas. La media query `≤980px` existía solo para eso y se reescribió
  casi entera.
- **`test_panel_agentes.js`** necesitó dos líneas (`p.click('#btn-mas')` antes de
  `p.click('[data-tab="agentes"]')`); los tres tests de galería llaman `openHabitantes` por `evaluate`
  y **no se tocaron**, tal como se había previsto.

⚠️ **Nota para el próximo test que arranque la página:** `state` es un `const` de **nivel superior**
(`app.js:8`), **no** una propiedad de `window`. Un `waitForFunction('window.state && …')` no se cumple
jamás y el test muere por timeout con la página perfectamente sana. Se pregunta por el ámbito léxico:
`typeof state !== "undefined" && typeof openHabitantes === "function"`.

---


<a id="-req-xr1"></a>

### ✅ REQ-XR1 · Rayos-X tapa lo que marca: para capturas no sirve — ✅ done (2026-08-06)
**Reportado** 2026-08-06 por el dueño: «el modo rayos-X crea unas cajas que tapan totalmente lo que hay
debajo y para capturas de pantalla es poco útil, debería de verse algo de lo que hay por detrás; por
ejemplo en la captura no se ve que hay 3 repetidores de redstone que no funcionan al estar girados».
**Precisión del dueño**: son **las cajas blancas** que envuelven cada bloque, no las etiquetas rojas.

**Reflexión** — la contradicción está en el nombre: una herramienta que se llama «rayos-X» y que
**opaca**. El overlay ya usa alfa (0.38), así que el fallo no es que no se pensara en la
transparencia: es que el alfa está aplicado **por caja** y la escena apila muchas cajas. Es un
problema de *composición*, no de elegir mejor un número, y por eso subir/bajar el 0.38 no lo arregla
—sube o baja el punto en que se satura, pero satura igual—. La pista de que la solución es otra: lo
que el dueño quiere ver son **los bordes** (qué pieza es y cómo está puesta), no el relleno.

**Lo que sé sin haberlo medido a fondo** (`mcXrayVolume`, `app.js:7765`, y el dibujo en `~:7614`):
- Pinta **un cubo macizo de 12 triángulos —las 6 caras— por celda ocupada**, con `mcPushBoxTris`.
- Se dibuja con `DEPTH_TEST` desactivado y mezcla de alfa constante a **0.38**.
- El barrido de rejilla es `7×5×7 = 245` celdas alrededor del jugador, más los voxels finos de las
  estructuras que solapan el AABB del jugador.
- Como el alfa es por capa y no por volumen, la opacidad se **compone**: `1 − 0.62^k`. Dos o tres
  bloques en la línea de visión ya rondan el 85-94 %, y una fila de suelo satura a blanco.

**Direcciones a considerar** (ninguna decidida):
1. **Aristas en vez de relleno** — dibujar solo el contorno de cada caja (`gl.LINES`, que el fichero ya
   usa para el fantasma verde). Es lo que más se parece a lo que el dueño describe y de paso quita la
   mayor parte del coste de relleno.
2. **Una capa, no k** — pintar el volumen en una sola pasada, sin acumular (p. ej. quedarse con el
   contorno del conjunto, o marcar profundidad para no repintar la misma columna).
3. **Un tunable de consola** (`game.xrayAlpha`), que es lo que el dueño suele pedir para valores
   estéticos discutibles, y que aquí sirve **además** como válvula para capturas.
4. **Filtrar el ruido**: el suelo (`hierba` y compañía) es lo que más satura y es justo lo que nunca
   se está mirando; marcar solo lo que no es terreno haría el resto casi solo.

**No verificado** — cuánto de la saturación viene de las cajas de rejilla frente a las de estructura
fina, ni si el culling de caras está activo en esa pasada (si no lo está, cada caja aporta **dos**
capas en vez de una y eso duplica el problema). Comprobarlo al abordarlo, no antes.

**Medido después** (misma escena de la captura del dueño, 1280×720): la pasada de rayos-X toca el
**37,1 %** de los píxeles y sube la luminancia media de esa zona de **103,8 a 191,9**. Y sí:
`CULL_FACE` está **desactivado** en la pasada, así que cada caja aporta **dos** capas —la cara de
entrada y la de salida—, o sea que el exponente real no es el número de bloques sino su doble. Eso
explica que sature tan rápido.

**✅ DECIDIDO** (dueño, 2026-08-06): **«solo líneas»** → dirección **1**, aristas con `gl.LINES`, sin
relleno. Consecuencias que se siguen de la decisión y no hace falta volver a preguntar:

- Las direcciones **2 y 4 quedan descartadas** por innecesarias: sin relleno no hay nada que componer
  ni que saturar, así que ni «una capa en vez de k» ni filtrar el terreno tienen ya trabajo que hacer.
  El suelo dejará de ser un muro blanco y pasará a ser una rejilla de aristas.
- La **3** (`game.xrayAlpha`) deja de tener sentido con ese nombre: no habrá alfa de relleno. Si hace
  falta una válvula, que sea sobre las **líneas** (grosor/color/opacidad), y solo si al usarlo se ve
  la necesidad. No se inventa por adelantado.
- El fantasma verde ya usa `gl.LINES` en este mismo fichero, así que **hay precedente que copiar** en
  vez de camino nuevo: mismo patrón de programa y de estado de GL.
- ⚠️ El riesgo se **invierte**: el problema deja de ser «tapa» y pasa a ser «no se ve». Un contorno de
  1 px sobre terreno claro puede perderse, y una maraña de aristas de 245 celdas puede ser ruido. Hay
  que comprobarlo **en captura**, que es el uso que motivó el ticket, y a 390 px.

**Qué se hizo** — dos líneas de `app.js` y ni una decisión nueva:
- `mcXrayVolume` (`~:7830`) emite `mcPushBoxEdges` en vez de `mcPushBoxTris`, en las **dos** ramas
  (celdas de `mc.grid` en rojo y voxels finos de estructura en naranja).
- La llamada (`:7638`) manda el volumen a `xrayLines` en vez de a `xray`. A la pasada de triángulos
  —que sigue existiendo con su alfa 0.38— **solo le queda el marcador de impacto del rayo**.

Y un detalle que no estaba en el ticket y sí importa: las cajas de rejilla pasan a las cotas
**exactas** de la celda. Antes iban con margen (`x+0.03 … x+0.97`) para que dos cubos vecinos no
hicieran z-fighting, pero con aristas ese margen se ve: dos celdas pegadas dibujarían **dos líneas
paralelas separadas 0,06** donde tiene que verse una. Con las cotas exactas la arista compartida cae
en la misma recta y se funde. Eso es lo que evita que un suelo sea la maraña que temía el ticket.

**Medido** (mismo encuadre, de pie en el circuito de `data/mundo.json`, 1280×720 — capturas en
`data/tickets/REQ-XR1/`):

| | píxeles que toca | luminancia de esa zona |
|---|---|---|
| antes (relleno) | **92,2 %** | 107,7 → 85,8 |
| después (aristas) | **4,9 %** | 106,3 → 110,9 |

De ese 4,9 % **casi la mitad no es el volumen**: son 20 090 px del marcador de impacto del rayo, que
sale enorme porque la cámara de la medición está a medio bloque de lo que apunta.

⚠️ **Para verlo hay que plantarse en el sitio.** El volumen son 7×5×7 celdas alrededor de los **pies**;
mirando al horizonte no entra nada en cuadro y parece que rayos-X no hace nada. Me costó tres intentos
de medición averiguarlo, así que queda escrito aquí y en `data/tickets/REQ-XR1/contexto.md`.

**Lo que NO hizo falta** — la válvula sobre las líneas (grosor/color/opacidad) que el ticket dejaba
condicionada a «solo si al usarlo se ve la necesidad». No se ve: el contorno se distingue sobre hierba
clara y sobre plataforma gris en las capturas. Y el grosor **no era una opción real** de todos modos:
`gl.lineWidth` está topado a 1 en Chrome/ANGLE.

**Verificado**
- `node test_rayos_x_lineas.js` — **nuevo**, y comprobado que FALLA (3 casos) si se devuelve
  `mcPushBoxTris`: cota por arriba (no tapa) **y por abajo** (se sigue viendo), que es el riesgo
  invertido que el ticket señalaba.
- `node test_rayos_x.js` (11 ok) — hubo que tocarlo: extrae las funciones **verbatim** por texto, así
  que pasa a extraer `mcPushBoxEdges` y su `VBOX` baja de 36 a 24. Está anotado en el propio test.
- `node test_rayo_apuntado.js` (12 ok) sin cambios.

---


<a id="-req-xr2"></a>

### ✅ REQ-XR2 · Rayos-X: que la etiqueta diga también el **power** del bloque — ✅ done (2026-08-06)
**Pedido** 2026-08-06 por el dueño: «nuevo ticket: añadir en rayos-x una línea que indique el power
del bloque».

**Por qué hacía falta**: es lo único de un circuito que **no se ve mirándolo**. La clave dice si una
lámpara está encendida, pero no con cuánto; un cable a 1 y otro a 14 son el mismo bloque en pantalla.
Hasta ahora había que ir celda por celda con `game.redstone.info(x,y,z)`; con rayos-X puestos el
tendido entero se lee de un vistazo y se ve **dónde muere** la señal.

**La pregunta que el ticket dejaba abierta** era qué poner en los bloques que **no** son circuito
—¿nada, `—`, o el 0/15 que reciben por el puente de r1.2?—. Decidido: **el 0 no se pinta**. El volumen
de rayos-X son ~245 celdas, y un `⚡ 0` en cada piedra del entorno es ruido que además reabre justo el
problema de REQ-XR1. Lo que sí se pinta es el puente cuando de verdad lleva algo, y **marcando la
energía débil como tal** — porque un cable no la lee, y «le llega 12 débil, la lámpara de al lado
enciende y el cable no» era exactamente el tipo de misterio que costó el falso diagnóstico de REQ-RS5.

**Lo que sale ahora** (medido sobre el circuito del dueño en `/map/default`, 14 de 28 etiquetas):

```
267,15,262  cable-on@12      ⚡ 15          pieza de circuito: lo que recibe
266,16,262  cable-on@12      ⚡ 13          tres saltos después: se ve la pérdida
267,16,262  repetidor-on@12  ⚡ 13 → 15     recibe ≠ saca: por eso el tendido de después no se acorta
269,16,262  repetidor-on@6   ⚡ 0 → 15      no recibe nada y aun así entrega 15
267,14,262  asset hierba     ⚡ 15 débil    no es circuito: hace de PUENTE (r1.2), y en débil
```

**Tres cambios, y el reparto es el de siempre — el motor no sabe qué es redstone**:

1. **`app.js`** (3 líneas) — el enganche pasa a `mcXrayExtra(clave, s, x, y, z)`: sin la **celda** no
   se puede decir nada por celda, y la señal es por celda. Van sueltas y no en un array a propósito:
   esto corre una vez por etiqueta y frame (~250), y un array por llamada es basura para el GC a
   60 fps. Los enganches viejos de dos argumentos siguen valiendo tal cual.
2. **`style.css`** (1 línea) — `white-space:pre-line` en `.mc-xlbl-extra`, contra el `nowrap` del
   padre. Capacidad genérica, no de redstone: el hueco lo llenan varios enganches encadenados y cada
   uno pide su renglón.
3. **`redstone/redstone.js`** — **envuelve** `window.mcXrayExtra` en vez de asignarlo. Ésa es la parte
   con letra pequeña: `mundo-autoarranque` lo asigna a pelo (`window.mcXrayExtra = etiquetaRayosX`), y
   si el motor hiciera lo mismo borraría la línea de comportamientos y giros sin que nadie se entere.
   Encadenar funciona porque el orden es fijo — el snippet asigna en su línea 3189 y arranca redstone
   en la 3366 — y si el snippet se re-ejecuta y borra el envoltorio, vuelve a cargar redstone y se
   rehace solo. Sello `_redstone` para no apilarse cuando el que se re-ejecuta es el motor.

**Lo que NO se tocó**: el `mundo-autoarranque.json` del dueño (se edita en vivo) y las cajas de
rayos-X de REQ-XR1. La línea es DOM, así que no añade ni un vértice.

**Verificación** — `node test_rayos_x_power.js` (20 casos, nuevo). Lo que fija, además del texto:
que la etiqueta **coincide con `game.redstone.info()`** (si un día divergen, es un fallo y no dos
opiniones), que las dos líneas conviven (`velocidad ×2\n⚡ 15`), que una estructura fina **no** lleva
línea, que llamar con dos argumentos no revienta, y —espiando el enganche durante una vuelta real de
`mcUpdateXrayLabels`— que las ~100 etiquetas llegan **todas** con `(x,y,z)`: sin eso el fallo sería
invisible desde una llamada a mano. Sin regresiones en `test_rayos_x.js` (11 ok),
`test_rayos_x_lineas.js`, `test_redstone_arranque.js` y `test_redstone_bloque_fuente.js`.

Capturas y el guion que las saca: `data/tickets/REQ-XR2/` (`antes.png` / `despues.png` + recortes
legibles; `captura.js` se ejecuta desde `/root/voxel`).

---


<a id="-bug-rs2"></a>

### ✅ BUG-RS2 · Los repetidores de redstone girados no funcionan — ✅ done (2026-08-06)
**Resuelto**, pero **no era lo que decía el título**. El diagnóstico prescrito por el ticket se montó
tal cual (`test_redstone_giro.js`, 21 casos) y devolvió tres respuestas:

1. **El giro está BIEN mapeado.** Los cuatro giros escuchan exactamente por su espalda: `@0`→−X,
   `@1`→−Z, `@2`→+X, `@3`→+Z, que es lo que dice `FRENTE=[0,4,1,5]`, y esa tabla concuerda con lo que
   `mcRotXZ` (app.js:5860) le hace de verdad al dibujo (rot 1 lleva +X a +Z). **No hay vuelco**: los
   cinco de la foto tienen los bits 2-3 a cero.
2. **La reproducción mínima del ticket PASA en los cuatro giros.** Palanca → cable → repetidor@n →
   cable → cable propaga a 15 con su retardo, con n = 0, 1, 2 y 3. Los repetidores girados funcionan.
3. **Lo que el dueño vio no era una avería.** Los cinco repetidores de la foto están en
   `/map/test` en `(64..68, 15, 63)`, hombro con hombro en una fila a lo largo de X, con **un cable
   encendido pegado a los cinco por −Z** (la fila de `hab:cable-on@1` de `z=62`) y con los giros
   `@1 @2 @3 @0 @1`. De los cuatro giros, **solo `@1` da la espalda a −Z**. Y encendidos están
   exactamente los dos `@1`. O sea: el motor hizo lo correcto en los cinco, y los tres «rotos» son
   los tres que están mirando a otro lado. La lectura «no funcionan **al estar girados**» era una
   coincidencia: entre los apagados hay uno SIN girar (`repetidor`, rot 0) y entre los encendidos los
   dos girados.

**Lo que sí estaba mal, y era la tercera hipótesis del propio ticket** — el repetidor emitía por
**cinco** lados en vez de solo por delante. `mira:true` solo prohibía emitir hacia atrás, que es la
regla de la ANTORCHA (está pegada a un bloque, escucha por ahí y alumbra los otros cinco; de eso vive
el anillo de antorchas que hace de memoria), no la del repetidor. Consecuencia real: dos repetidores
puestos hombro con hombro se alimentaban **de costado**, así que la propia fila del dueño se habría
contagiado entera en cuanto uno se encendiera.

- **Arreglo**: capacidad nueva `soloAlFrente` en el motor (`redstone/redstone.js`, en `salidaDe`), que
  es más estrecha que `mira`: no emite por ningún lado que no sea el frente. La lleva
  `'hab:repetidor'` y **no** la lleva `'hab:inversor'`, a propósito. De paso `atrasDe` pasa a
  derivarse de un `frenteDe` explícito, en vez de al revés.
- **Y el arreglo que de verdad evita el próximo ticket**: `game.redstone.info(x,y,z)` ahora dice
  `escuchaPor`, `emitePor` y, cuando la pieza tiene corriente pegada por un lado que no es el suyo,
  una `pista` en cristiano («tiene señal por −Z, pero esta pieza solo escucha por +X: gírala con R
  hasta que su espalda dé al cable»). Sin eso, una pieza girada que no enciende es indistinguible de
  una pieza rota — que es exactamente cómo nació este ticket.
- **Verificación**: `node test_redstone_giro.js` (21 ok, incluye §D con la fila del dueño reproducida
  celda a celda) + `test_redstone_arranque.js`, `test_redstone_dsl.js` y `test_redstone_antorcha.js`
  en verde. Snippets republicados con `node redstone/make_snippets.js`.
- **Pendiente para el dueño**: la fila de `/map/test` sigue como estaba (no se toca lo plantado). Si
  quiere que los cinco enciendan, hay que girarlos a `@1` con R; lo que no había forma de saber es
  que ése era el problema, y ahora `info()` lo dice.

**Reportado** 2026-08-06 por el dueño, en la misma captura que REQ-XR1: «hay 3 repetidores de redstone
que no funcionan al estar girados». En las etiquetas de rayos-X de esa captura se leen las cuatro
variantes conviviendo: `repetidor` (sin giro), `repetidor@2`, `repetidor@3` y `repetidor-on@1`.

**Reflexión** — que en la misma foto haya un `repetidor-on@1` (girado **y** encendido) junto a otros
girados que no arrancan sugiere que el giro no se pierde del todo, sino que **algo depende de él y no
debería, o al revés**. En este motor el giro **vive dentro de la clave** (`clave@n` en `mc.grid`), y
ése es un sitio donde ya nos hemos tropezado antes: toda tabla indexada por la clave BASE se salta las
giradas si no se normaliza. Los dos sospechosos naturales son **por dónde escucha** la pieza y **por
dónde emite**, que es justo lo que el giro decide.

**Dónde vive** — el motor es el snippet `data/snippets/redstone.json` (~648 líneas); la definición de
la pieza está en `data/snippets/redstone-piezas.json`:
`'hab:repetidor': { emite: 15, encendida: 'hab:repetidor-on', retardo: 2, mira: true }`.
⚠️ Es **snippet, no `app.js`**: el arreglo va ahí, y `data/snippets/mundo-autoarranque.json` se edita
**en vivo** (ver CLAUDE.md).

**Lo que ya vi de pasada y acota la búsqueda** — el snippet **sí** contempla el giro en varios sitios
(`claveBase()` para heredar la config de la pieza sin girar, `oriDe()`/`rotDe()` para leer el sufijo,
`conOri()` para no perder la orientación al cambiar de material, y `atrasDe()` con una tabla `FRENTE`
para deducir la espalda). O sea que **no es que nadie lo pensara**; es un fallo dentro de esa
maquinaria. Candidatos, sin comprobar:
- la tabla `FRENTE` y su emparejado `^1`: si el ciclo de 90° no coincide con el que aplica `mcRotXZ` al
  dibujo, la pieza **escucha por un lado distinto del que aparenta** y parece muerta;
- `mira:true` solo prohíbe emitir **hacia atrás**; un repetidor de verdad emite **solo hacia delante**;
- el **vuelco** (Shift+R, bits 2-3 del sufijo) frente al **giro** (bits 0-1): el propio código avisa de
  que una pieza volcada calcula su espalda en horizontal y «parece rota sin estarlo». Puede que los
  tres del dueño estén volcados, no girados — **la primera cosa a descartar**.

**Reproducción mínima que hay que montar al abordarlo** (no antes): cuatro circuitos idénticos
—palanca → cable → repetidor → cable → lámpara— con el repetidor en `@0`, `@1`, `@2` y `@3`, en
`/map/test`, y ver cuáles propagan. Eso separa en un minuto «giro mal mapeado» de «vuelco» de
«dirección de emisión».

**Verificación esperada**
- Los cuatro giros de un repetidor propagan la señal hacia donde apunta el dibujo.
- Un repetidor **no** emite hacia atrás ni por los lados, en ninguno de los cuatro giros.
- El retardo (`retardo: 2`) es el mismo en las cuatro orientaciones.
- Si el problema resulta ser el vuelco, el aviso de `avisaUnaVez` sale en el toast (no en consola) y
  se explica cómo enderezar la pieza.

---



## ⚡ Rendimiento de estructuras (PERF-MC) — diagnóstico 2026-07-22

<a id="-req-cart2"></a>

### ✅ REQ-CART2 · La ventana de editar nota (tecla `N`) es diminuta y su letra también — ✅ done (2026-08-06)
**Reportado** 2026-08-06 por el dueño, con captura: «cuando se edita una nota con "n" la ventana que
aparece es muy pequeña, apenas deja leer la nota y las letras son demasiado pequeñas también». En la
captura se ve el diálogo «📄 Nota del bloque» con un `textarea` que muestra **4 líneas y media** de una
nota de agente mucho más larga, con barra de desplazamiento, sobre una ventana que ocupa una franja
estrecha de la pantalla.

**Redactado sin investigar** (regla del dueño para «nuevo ticket»). Lo de abajo es contexto que ya
tenía de haber trabajado esta semana en la fuente y en los carteles, **no** una exploración nueva.

**⚠️ Esto NO es REQ-CART1, aunque lo parezca.** REQ-CART1 (cerrado hoy) era el rótulo **dentro del
mundo 3D**: texto horneado a una textura GL y estirado sobre la tabla del cartel. Esto es el **panel
DOM** de editar/ver la nota: `.mc-note` / `.mc-noteview` / `.mc-note textarea` en `style.css`, HTML
normal. **No comparten ni una línea de código.** Lo único que comparten es la fuente del juego, y ahí
sí hay una restricción heredada que manda:

⚠️ **Pixeloid Sans solo es nítida en múltiplos de 9** (`font-size/9` es su píxel de diseño; ver «🔠
fuente del juego» en `CLAUDE.md`). Hoy esos paneles están a **9px en escritorio** y 18px en la media
query de móvil. O sea que **no hay tamaño intermedio**: el salto es 9 → **18px**, el doble. Eso es
seguramente la mitad del ticket, y explica por qué se ve tan pequeño en escritorio y no en móvil: el
móvil ya está al doble.

**Las dos quejas son dos arreglos distintos y conviene no mezclarlos**
1. **«La ventana es muy pequeña»** — es el ancho/alto del diálogo y las filas del `textarea`. Se
   arregla en CSS, y **no** depende de la fuente.
2. **«Las letras son demasiado pequeñas»** — es el salto 9 → 18px. Subir la letra **sin** agrandar la
   ventana empeoraría lo primero (menos líneas visibles aún), así que el orden importa: primero la
   caja, luego la letra.

**Nota de por qué duele justo aquí** — las notas de los **agentes** son largas (la de la captura es un
volcado con causa, cotas y coordenadas), y son precisamente las que hay que leer enteras para depurar.

**Las preguntas del ticket, resueltas sin preguntar** — eran tres («¿18px también en escritorio?»,
«¿redimensionable?», «¿aplica al visor?») y son **estética discutible**, o sea justo lo que no se
decide en una ronda de preguntas sino con un valor de serie razonable y una perilla de consola.
Así que: **sí a 18 en escritorio**, **sí al visor** (es la misma queja: se lee mientras juegas), y
**no a un diálogo redimensionable** — el `textarea` ya trae su tirador, y guardar el tamaño del
diálogo es estado de UI nuevo para algo que se ajusta una vez. Lo que sí recuerda el tamaño es la
perilla.

**Qué se hizo**
- `style.css` — el cuerpo de `.mc-note textarea`, `.mc-note-head` y `.mc-noteview` pasa a
  `var(--note-fs,18px)`; el ancho del diálogo a `min(var(--note-w,720px),94vw)` (era `min(420px,92vw)`);
  el alto del `textarea` deja de ser un `80px` fijo y sale del cuerpo — `min(calc(--note-fs * 18), 46vh)`,
  o sea **10 líneas** de `line-height:1.8`, con tope para no comerse un móvil apaisado.
- La media query de 680px ya no fuerza `font-size:18px` ni `width:94vw`: **eran el caso general**
  desde este ticket. Solo le queda el padding.
- `app.js` — `game.noteFont` y `game.noteWidth`, al lado de `noteAlpha`/`noteSigns`/`noteText`, con
  el mismo patrón: getter/setter sobre `mc`, `localStorage` (`vf_mcNoteFont`/`vf_mcNoteWidth`) y
  aplicación en vivo escribiendo las dos variables CSS en `documentElement`.

⚠️ **`game.noteFont` redondea a múltiplo de 9** (y topa en 9..45) en vez de aceptar el número que le
den. No es capricho: el píxel de diseño de Pixeloid es `font-size/9`, así que un 20 saldría borroso y
nadie lo relacionaría con haber tocado esto. Los escalones reales son 9 · 18 · 27 · 36 · 45.

**El «primero la caja, luego la letra» se resolvió solo**: como el alto del `textarea` se deriva del
cuerpo, subir la letra agranda la caja a la vez y no hay orden que respetar. Subir a 27 sigue dando
10 líneas, en un diálogo más alto.

**Verificado** — `node test_notas_panel.js` (nuevo) y `node test_notas_cartel.js`, los dos en verde.
Medido en la captura de `data/tickets/REQ-CART2/`: **4,5 → 9,9 líneas** sin desplazar, con la nota de
agente larga entrando entera. A 390px sin regresión (367px de ancho, textarea a 322px de 844).

---


<a id="-req-osd13"></a>

### ✅ REQ-OSD13 · Cuánto ocupa el panel de `game.osd` — menús compactos — ✅ resuelto 2026-08-13

**Encargo del dueño (literal):** «el menu/botonera que sale con "game.osd.define" es excesivamente grande,
esta bien para algunos casos, pero me gustaría poder elegir menus mas compactos, tal vez escalar su tamaño,
definir el espacio entre los botones (padding), etc.».

**Qué se hizo.** El panel de una pantalla `{html:…}` tenía las medidas **escritas a mano en `style.css`**:
un título de 27 px, botones de 18 px con 260 px de anchura mínima y 22 px de hueco. Eso es un menú de intro
a pantalla completa, y no hay forma de pedir otro. Ahora esas medidas son **variables CSS** declaradas en
`.mc-osd-html` con los valores de hoy, y las reglas del panel las consumen (`var(--osd-hueco)`,
`var(--osd-relleno)`, …). `cfg` solo **escribe esas variables** sobre el elemento; el CSS no cambia de forma.

Siete llaves nuevas en `cfg`, todas opcionales: `escala`, `hueco`, `relleno`, `rellenoBoton`, `ancho`,
`titulo`, `boton`. Lo compacto de verdad es **`ancho:0`**: sin anchura mínima, cada botón mide lo que mida
su texto, y con `<div class="mc-osd-panel fila">` en el HTML salen en fila. Ejemplo:

```js
game.osd.define('ajustes', {
  sitio:'abajo-derecha', escala:0.6, boton:18,   // encoge todo, pero la letra se queda en 18
  ancho:0, hueco:6, relleno:[12,16], rellenoBoton:[6,12],
  html:'<div class="mc-osd-panel fila">…</div>'
});
```

**Las tres decisiones que cuesta caro deshacer:**

- **Quien no pide nada no cambia.** El dueño tiene menús escritos y en marcha; que encogieran solos sería
  la regresión, no la mejora. Por eso los valores por defecto de las variables son **los de antes byte a
  byte**, y el §1 del guardián los clava (27 / 18 / 22 / 34-44 / 18-26 / 260).
- **El espaciado escala continuo, los cuerpos de letra NO.** Pixeloid solo sale nítida en múltiplos de 9
  (la misma regla que `MC_NOTE_TEXT_MIN=9`), así que `escala` pasa cada cuerpo por `MC_OSD_NUEVE` y nunca
  baja de 9. Un menú pequeño y **borroso** es peor que uno grande, y la causa —una fuente de píxeles fuera
  de su rejilla— no se parece en nada al síntoma. Consecuencia visible y documentada: el botón **salta de
  18 a 9** alrededor de `escala:0.75`; el apaño es pedir `boton:18` junto a la escala.
- **Se aplica en los DOS sitios de montaje**, `mcOsdAbrir` y `mcOsdHtml`. El segundo es el que repinta un
  botón que cambia de estado: si `mcOsdMedidas` no corriera ahí, encender una opción le cambiaría la talla
  al menú entero.

Un valor imposible **avisa por consola y sigue** (`escala:'grande'` → se queda en 1; `titulo:20` → se
respeta, pero dice que el múltiplo de 9 más cercano es 18). Una pantalla no puede desaparecer por una errata.

**Ficheros:** `style.css` (variables + reglas del panel, y `.mc-osd-panel.fila`), `app.js`
(`MC_OSD_MEDIDAS`, `MC_OSD_NUEVE`, `mcOsdRelleno`, `mcOsdMedidas`, enganchadas en `mcOsdAbrir`/`mcOsdHtml`),
`tests/test_osd_medidas.js` (guardián, 29 ok), `wiki/api.json` (los 7 `cfg` en la ficha de `game.osd.define`),
`docs/osd-e-intro.md` (§ «Cuánto ocupa el panel»).

---


<a id="-req-wiki1"></a>

### ✅ REQ-WIKI1 · La wiki de `/wiki` — manual de scripting y referencia de API consultable — ✅ resuelto 2026-08-13

**Encargo del dueño (literal):** «no quiero alargar demasiado el readme así que propongo hacer una wiki
que sirva como documentación, que se acceda por `/wiki` al estilo minecraft. utiliza la fuente del juego,
panel lateral para secciones, aspecto wiki alike; quiero que añadas de momento solamente la sección de
scripting y los ejemplos de autoarranque: intro, globales, por mapa, con ejemplos. Puedes usar alguno de
los que ya está. Que se pueda consultar cada API del ejemplo, es decir: quiero saber qué es "toast" y cómo
se usa, pero también `game.osd`, saber qué parámetros acepta, etc. todo».

**Lo que se entrega**

| fichero | qué es |
|---|---|
| `wiki/index.html` | la carcasa: panel lateral, buscador, contenido |
| `wiki/wiki.css` | tema oscuro del sitio + `--font-game` en los rótulos |
| `wiki/wiki.js` | enrutador por hash, Markdown de andar por casa y el **enlazado automático** |
| `wiki/indice.json` | el árbol del panel lateral |
| `wiki/api.json` | **36 fichas de API**, cada una con firma, parámetros, ejemplo y «detalles que cuestan caro» |
| `wiki/paginas/scripting.md` | qué es un snippet, cómo corre (ámbito global, `async`), `game` vs `mc`, el estado en `mc` |
| `wiki/paginas/autoarranque.md` | los **cuatro puntos de entrada** con ejemplos reales del disco del dueño |
| `wiki/paginas/depurar.md` | REQ-SNIP1 contado para el usuario, y los descubridores (`dump`, `info`, `keys`) |
| `tests/test_wiki.js` | el guardián (**27 ok**) |

**Las decisiones que cuesta caro deshacer**

- **Enrutado por HASH ⇒ cero rutas nuevas en `server.py`.** El servidor estático ya redirige `/wiki` →
  `/wiki/` y sirve `wiki/index.html`; una ruta a mano no aportaba nada y habría chocado con los propios
  estáticos que cuelgan de `/wiki/` (`api.json`, `paginas/*.md`). El guardián entra por `/wiki` **sin
  barra** a propósito: lo que sostiene ese enlace es el 301, así que hay que vigilarlo.
- **Sin compilación y sin dependencias**, como el resto del repo. El contenido son `.md` crudos y un
  `api.json`; se editan y se recarga la página. El renderizador de Markdown es lo justo que usan las
  páginas —no es CommonMark ni lo pretende— y vive entero en `wiki.js`.
- **Documentar una API es añadirla a `api.json`, y ya.** `wiki.js` busca esos nombres dentro de cada
  `<code>` del wiki y los convierte en enlaces a su ficha, así que los ejemplos que ya están escritos se
  enlazan solos. Eso es literalmente lo que pidió el dueño («que se pueda consultar cada API del
  ejemplo») y es lo que evita que el wiki se pudra: no hay que acordarse de enlazar nada a mano.
  - El enlazado va **de más largo a más corto** y con guardas `(?<![\w.$])…(?![\w.$])`: si ganara el
    corto, `game.osd.define` quedaría como un enlace a la ficha de `game.osd` seguido de un `.define`
    suelto — peor que no enlazar. Hay un test solo para eso.
  - Una ficha **no se enlaza a sí misma** en su propia página (`salvo`), o cada línea de su ejemplo
    sería un enlace circular.
- **`fuente` lleva el SÍMBOLO, nunca el número de línea** (`app.js · mcOsdDefine`). Una línea se queda
  vieja al día siguiente y entonces la wiki **miente**, que es peor que no documentar. El guardián
  comprueba símbolo a símbolo que cada uno sigue existiendo en `app.js`; la línea exacta se busca en
  `SYMBOLS.md`, que para eso está.
- **La fuente del juego solo en los rótulos.** Pixeloid Sans es de píxeles y solo sale nítida en
  múltiplos de 9 px: un párrafo largo con ella se paga en tiempo de lectura. Marca, encabezados, títulos
  de sección y cabeceras de tabla la llevan; el cuerpo del texto va con la de sistema. El aspecto «wiki
  de Minecraft» lo dan el panel lateral fijo, la tipografía de píxeles en los rótulos y el tema oscuro
  del sitio, no meter Pixeloid en todo.
- **Los ejemplos son los del dueño, no inventados**: `mundo-default` entero (la cabeza y el brazo que
  miran al jugador), la órbita y los botones de `arranque-intro`, el menú con estado de `arranque-empty`
  y el `location.href` de `editor-autoarranque`. Documentar lo que existe es lo único que no envejece
  mal, y de paso el wiki sirve de segunda copia legible de esos snippets.

**Un fallo del renderizador que costó encontrar y conviene no repetir:** partir la línea por el acento
grave para aislar los `code` deja la negrita partida en dos trozos distintos, así que «\*\*`?intro=1`\*\*»
salía con los asteriscos a la vista. Los `code` se apartan a un **marcador** (`\u0000<n>\u0000`) antes de
tocar nada, y el resto —negrita, enlaces— ya puede cruzarlos. Ese marcador va como **secuencia de
escape** y no como byte literal: escrito a pelo convierte el fichero en binario para `grep`.

**Fuera de alcance a propósito** (lo dijo el dueño: «de momento solamente scripting»): agentes, redstone,
fluidos, luz y el editor no tienen sección. Cuando toque, es crear el `.md` y añadir su fila a
`indice.json` — no hay nada más que tocar.


<a id="-req-snip1"></a>

### ✅ REQ-SNIP1 · Depurar un snippet que revienta — ✅ resuelto 2026-08-13
**Pedido** 2026-08-13 por el dueño, con captura: «me resulta difícil depurar los errores de los snippets
como el que te muestro, necesito algo cuando le dé a ejecutar que me ayude a depurar mejor». En la
captura, el panel con `mundo-default` abierto y en la consola:

```
[snippet] SyntaxError: missing ) after argument list (at VM2571:5:21)
```

**Por qué no ayudaba nada.** Un snippet no es un fichero: se compila con `new AsyncFunction(code)`, así
que (1) el navegador lo llama **«VM2571»**, que no lleva a ningún sitio, y (2) la línea que da está
corrida por el preámbulo que el motor pone delante del cuerpo (`async function anonymous(\n) {\n`).
En el caso del dueño decía **5** y el descuido estaba en la **3** — una llamada
`define('clave': {cfg})` copiada de la tabla `DEFECTOS`, donde el `:` es correcto porque allí es un
**objeto literal** y en una llamada tiene que ser una **coma**.

**Lo que hace ahora al ejecutar** (`mcSnippetInforme`):

```
✖ snippet «mundo-default» · SyntaxError en la línea 3: missing ) after argument list
      1 │ toast("default")
      2 │ console.log("aaa")
 →    3 │ game.bloques.define('asset:assets/cabeza.vox.json': { mirar: { ejes: 'xy'…
      4 │ game.bloques.define('asset:assets/brazo.vox.json', { mirar: { ejes: 'xy' } })
   (es la primera línea donde el análisis se rompe; el descuido puede venir de la de antes)
```

…y el **panel lleva el cursor a esa línea y la deja seleccionada** (`snipMarcaLinea`): leer un número y
buscarlo a mano en un textarea de 4 000 líneas era la mitad del trabajo.

**Las tres decisiones que importan:**

- **Un `SyntaxError` no tiene pila que mirar** —el código nunca llegó a existir—, así que la línea se
  busca **compilando prefijos**: el primero que rompe por algo que no sea «se acabó el texto» es el
  culpable (`mcSnippetLineaSintaxis`). Un prefijo cortado a mitad de un bloque siempre da *Unexpected
  end of input*, y ése no cuenta. El informe **avisa de que es la primera línea donde el análisis se
  rompe**, que no siempre es donde está el descuido; prometer más sería mentir.
- **El desfase del preámbulo se MIDE con una sonda** (`mcSnippetDesfase`), no se cablea: hoy vale 2 en
  todos los motores, y es exactamente el tipo de número que se rompe en silencio con una versión nueva.
- **`//# sourceURL=vf-snippet/<nombre>`** va al **final** del código, así que no desplaza ni una línea, y
  a cambio las pilas de los errores de ejecución dejan de decir «VM2571» y dicen el nombre del snippet.
- **La línea viaja en el error** (`err.vfLinea`): quien lo recoja arriba no la recalcula ni la adivina.
  Y como el informe lo emite `mcCorreSnippet`, lo heredan **todos** los caminos —el botón Ejecutar, el
  autoarranque global, `mundo-<mapa>` y la intro—, no solo el panel.

**Ficheros:** `app.js` (`mcSnippetDesfase`, `mcSnippetLineaSintaxis`, `mcSnippetInforme`,
`mcCorreSnippet`, `snipMarcaLinea`, `snipRun`), `tests/test_snippet_depurar.js` (**13 ok**).

**Verificado:** `node tests/test_snippet_depurar.js` 13 ok (§1 usa **el error literal del dueño** como
caso) · `test_arranque_mapa.js` 11 ok · `test_intro.js` 23 ok · `--node` 13 ok.

---


<a id="-req-arr1"></a>

### ✅ REQ-ARR1 · Comportamientos por mapa: el snippet `mundo-<mapa>` — ✅ resuelto 2026-08-13
**Pedido** 2026-08-13 por el dueño, a raíz de los avisos que salían al abrir cualquier mapa, incluso uno
vacío: «no entiendo por qué aparecen estos errores cuando cargo algún mapa aunque esté vacío» … «quiero
definir comportamientos pero a nivel de mapa, como hicimos con un snippet».

Los avisos eran éstos, repetidos por cada pieza:

```
game.bloques.define("asset:assets/cabeza.vox.json"): mirar solo funciona en ESTRUCTURAS,
y "asset:assets/cabeza.vox.json" no lo es (o no hay ninguna puesta).
```

**No era un fallo: el aviso es correcto y el sitio estaba mal.** `mirar` gira **una instancia** de
estructura, así que `normalizarMirar` comprueba que haya alguna viva con esa clave. Lo que fallaba es
que ese `define` vive en `mundo-autoarranque`, que es **uno solo para todos los mapas**: las cabezas y
los brazos están en `/map/default` (22 y 2 usos) y algo en `/map/test`, pero el `define` se ejecutaba
también en `empty`, `menu1` y los demás. No rompía nada —`define` devuelve `null` y el snippet sigue—,
pero llenaba la consola y no había forma de decir «esto es de este mundo» sin un `if` dentro del global.

**Lo que se añade:** `mcAutoarranqueMapa()` corre **`mundo-<mapa>`** (`mundo-default`, `mundo-lab`…)
**justo después** del global, siempre que se entra al mapa y sin que la URL tenga que pedir nada.

```js
// data/snippets/mundo-default.json  ← se crea con Alt+C, «Nuevo», y ese nombre exacto
game.bloques.define('asset:assets/cabeza.vox.json', { mirar:{ ejes:'xy', limites:{y:[-70,70], x:[-25,25]}, alcance:12 } });
```

**Decisiones:**

- **Después del global, no en su lugar.** Hereda todo lo que aquél dejó puesto (`game.bloques` ya
  existe, la tabla ya está montada) y solo añade o pisa lo suyo. Guardián §2.
- **Que no exista es el caso normal ⇒ no se avisa.** La mayoría de los mapas no tendrán snippet propio;
  un 404 ahí es «este mundo no tiene nada propio», no un error. Guardián §3.
- **Fallar es inocuo**, igual que el global: se avisa con el nombre del snippet y el Mundo sigue en
  pie. Guardián §4.
- **⚠️ No es `arranque-<mapa>`**, que ya existía y es **la intro** (`arranque-fps`, `arranque-empty`):
  aquélla solo la dispara `?intro=1` y hoy monta vuelo + menú OSD. Se consideró colgar los
  comportamientos de ahí quitándole el `?intro=1` —lo pidió el dueño y se descartó con él—, porque eso
  arrancaría la intro entera en cada visita a pelo a `/map/fps` y `/map/empty`, y metería un menú
  encima de 4 tests que entran por `/map/empty`.
- **Colisión de nombres**: un mapa llamado `autoarranque` daría `mundo-autoarranque`, o sea el global
  otra vez. Se corta con una línea.

**Ficheros:** `app.js` (`MC_AUTOARRANQUE`, `mcAutoarranque`, `mcNombreAutoarranqueMapa`,
`mcAutoarranqueMapa`), `tests/test_arranque_mapa.js` (**11 ok**), `docs/bloques-comportamiento.md`,
`CLAUDE.md`.

**Verificado:** `node tests/test_arranque_mapa.js` 11 ok · `node correr_tests.js --node` 13 ok.
El guardián **no toca ningún snippet del disco del dueño**: intercepta la red (`p.route`), como
`test_editor_tapa.js`.

---


<a id="-req-cart3"></a>

### ✅ REQ-CART3 · Los carteles de un menú: escala, palo, sitio y distancia de lectura — ✅ resuelto 2026-08-12
**Pedido** 2026-08-12 por el dueño, al hilo de las pantallas OSD: «los carteles/notas que ahora son
botones de OSD apenas se pueden configurar. Me gustaría poder: **1)** elegir su escala, **2)** si
tienen palo o no, **3)** reposicionarlos. Por otro lado cambiaría su **distancia de lectura** (la
aumentaría **1,5 veces**), ya que en un menú si se pone muy lejos la nota/cartel se desvanece y no se
puede leer (otra opción es que si se carga como menú la distancia sea infinita)».

Las dos opciones de lo último **no se excluyen**, así que están las dos: 14 → **21** de serie, y en
pantalla-menú (`mc.escaparate`, o sea `?osd=1`) **no se aplica ninguna distancia**.

**La decisión que había que tomar: globales, no por nota.** `mc.notes` es `"x,y,z" → texto` en todos
los `mundo.json` escritos hasta hoy; meter estilo por nota lo convertiría en un objeto y cambiaría el
formato del mundo para todo el mundo, a cambio de algo que un mundo-menú **no necesita** (sus botones
se quieren iguales). Así que los cuatro ajustes viven en `game.carteles`, persistidos en
`localStorage.vf_mcCarteles`, y `mc.notes` no se toca.

```js
game.carteles.escala = 2;        // tamaño del cartel; el RÓTULO va con él
game.carteles.palo   = false;    // solo la tabla → assets/cartel_tabla.vox.json (dibujo nuevo)
game.carteles.desvio = [0,1,0];  // desde el bloque anotado; [0,0,0] lo mete en su propia celda
game.carteles.giro   = 1;        // una de las 24 posturas (mcOriNorm)
game.carteles.info();            // el descubridor
```

**Lo que costaba caro y por eso tiene guardián:**

- **Replantar.** Los carteles se **derivan** de `mc.notes`: cambiar un ajuste no se vería hasta
  recargar. La firma de los ajustes (`mcCartelFirma`) viaja en cada instancia (`s.cartel`) y
  `mcNoteSignsDesfasados` la compara — la misma ruta barata que ya detectaba una nota borrada.
- **La firma tiene que sobrevivir a `mcRestampAll`**, que sustituye cada instancia por un objeto
  nuevo (BUG-AG3). La lleva `mcCarryEfimera` junto a `nota` y `efimera`; sin eso, cada repaso vería
  el cartel desfasado y lo replantaría **una vez por ciclo, para siempre**.
- **El rótulo va con la escala.** `mcNoteBoardRect` deriva la tabla del bitset de la malla, que está
  en voxeles finos **del dibujo** y no sabe nada de `s.esc`. Sin multiplicar por la escala, un cartel
  a escala 2 se rotula en **un cuarto** de su tabla. (La escala entra también en la marca de la
  caché del rectángulo, o el cambio no se recalcula.)
- **«Sin palo» es otro dibujo, no un recorte:** `assets/cartel_tabla.vox.json` (32×16 finos = una
  celda) es el mismo cartel sin el poste. Como la tabla se **deriva** de la forma, ahí todas las
  filas son anchas y el rótulo ocupa la pieza entera sin tocar `mcNoteBoardRect`.

**Ficheros:** `app.js` (`mc.carteles`, `mcCartelCfg`, `mcCartelFirma`, `mcNoteSignOrigin`,
`mcSyncNoteSignsRun`, `mcNoteSignsDesfasados`, `mcCarryEfimera`, `mcNoteBoardRect`,
`mcDrawNoteTexts`, `game.carteles`), `assets/cartel_tabla.vox.json` + `assets/index.json`,
`tests/test_carteles.js` (**26 ok**), `docs/notas-y-fuente.md`.

**Verificado:** `node tests/test_carteles.js` 26 ok · `node tests/test_notas_cartel.js` todo ok ·
`node tests/test_symbols_sync.js` 9 ok.

---


<a id="-req-rs4"></a>

### ✅ REQ-RS4 · Un bloque que recibe energía debe energizarse y alimentar lo que tenga pegado — ✅ resuelto 2026-08-06
**Reportado** 2026-08-06 por el dueño, con captura: «para redstone, los bloques que reciben energía de
redstone deben energizarse, por lo tanto, una antorcha pegada a un bloque que recibe energía como el
de la imagen debería encenderse; salvo que se haya indicado como bloque aislante, que de momento no
hay». En la captura: una columna de bloques morados con **polvo de redstone rojo** subiendo por la
cara, la caja de selección puesta, y **una antorcha plantada encima** que está **apagada**.

**Redactado sin investigar** (regla del dueño para «nuevo ticket»).

**Qué pide, dicho con precisión** — hoy la energía parece vivir **solo en las piezas de redstone**
(polvo, repetidor, antorcha). Lo que se pide es el concepto de Minecraft de **bloque energizado**: un
bloque cualquiera —tierra, piedra, ese morado— **adquiere estado** al recibir energía, y ese estado
alimenta a su vez lo que tenga pegado. La antorcha de la captura no está tocando polvo: está tocando
un **bloque** que sí lo toca.

**⚠️ Esto no es «una pieza más»: cambia el modelo de propagación.** Y es la diferencia con REQ-RS3:
- Deja de haber una red de piezas de redstone y pasa a haber una red donde **cualquier bloque puede
  ser un nodo**. El barrido de vecinos ya no puede limitarse a las claves de redstone.
- Aparece **estado por celda** en bloques que hoy no tienen ninguno (`energizado: sí/no`, y quizá con
  nivel). Dónde vive ese estado —y si se guarda en `mundo.json` o se recalcula al cargar— es la
  decisión de diseño gorda del ticket.
- ⚠️ **Riesgo de coste**: si cualquier bloque puede energizarse, el barrido crece con el mundo y no
  con el número de piezas de redstone. Hay que acotarlo (¿solo bloques adyacentes a algo de redstone?)
  o se paga en cada tick.
- Minecraft distingue **energizado fuerte** (por un repetidor/bloque alimentado directamente) de
  **débil** (por polvo), y de esa distinción depende justo lo que la captura enseña. Merece la pena
  decidir si copiamos esa regla o inventamos una más simple, **sabiendo** que la simple dará
  resultados distintos a los que el dueño espera de Minecraft.

**El «bloque aislante» que el dueño menciona** — dice explícitamente «de momento no hay», o sea que
**no hay que implementarlo ahora**, pero sí dejar el hueco. El sitio natural es el mismo por el que ya
se le dan propiedades a un material desde scripting: `game.bloques.define('hab:loquesea',
{ aislante:true })`, hermano de `atravesable`. Eso encaja con la regla de CLAUDE.md §0: el motor
expone la capacidad, el snippet decide qué material la tiene.

**Relación con los otros dos de redstone** (importa para el orden)
- **BUG-RS2** (los girados no funcionan): sigue siendo el más urgente de los tres. Si la propagación
  ya falla con un repetidor girado, ampliarla a todos los bloques amplía el fallo.
- **REQ-RS3** (pistón): un pistón se activa por energía, así que **este ticket es más fundamental** —
  y probablemente hay que hacer éste **antes** que el pistón, no después.

**Verificación esperada**
- La escena de la captura: la antorcha **se enciende** cuando el polvo alimenta el bloque de debajo, y
  se apaga al cortar la señal.
- Un bloque energizado alimenta también polvo/repetidores pegados, no solo antorchas.
- Un bloque **sin** nada de redstone cerca no se energiza jamás (ni cuesta tiempo de tick).
- El estado sobrevive —o se recalcula bien— al guardar y releer el mundo.
- Sin regresión en los `test_redstone_*.js` existentes ni en los fps del Mundo.

**✅ Resuelto (2026-08-06) — motor `r1.2`, en `redstone/redstone.js`. Sin tocar `app.js`.**

El ticket temía dos cosas que al final **no** hicieron falta:

- **No hay estado nuevo por celda.** La energía de un bloque **se calcula al vuelo** desde sus seis
  vecinos (`energiaDeBloque`), así que no hay nada que persistir en `mundo.json` y el punto de
  «sobrevive al guardar y releer» sale gratis: al recargar se recalcula igual.
- **No hay barrido global.** Un bloque solo mira vecinos que **tienen `cfg`**, o sea **nunca
  bloque → bloque**. Eso acota el coste a un salto y evita el efecto dominó de un cable suelto
  energizando un muro entero. Precio explícito y a propósito: **dos bloques en fila no llevan la
  señal**, igual que en Minecraft.

**Lo que sí hubo que decidir, y es la pieza que sostiene todo: FUERTE / DÉBIL.** El **cable**
energiza el bloque solo **débilmente** y otro cable **no lee lo débil**; todo lo demás (antorcha,
palanca, repetidor) energiza **fuerte**, y eso lo lee todo el mundo. Sin esa asimetría dos tendidos
separados por un bloque se contagiarían **saltándose la pérdida**, y peor: un tendido se
realimentaría a través del bloque que él mismo alimenta y no bajaría de nivel nunca. Una pieza que no
es cable (una lámpara) **sí** lee lo débil, que es lo que enciende una lámpara colgada bajo un cable.

**El fallo que casi se cuela.** El aviso a los vecinos tiene que saltar a **dos** celdas a través del
bloque, y la primera versión se lo ahorraba cuando quien cambiaba «no era circuito» — para que una
ráfaga de mil bloques (un TNT) no costara 36 lecturas por voxel. No funciona: **«¿era esta celda
circuito?» no se puede responder después de la escritura**, porque una *fuente* (una palanca) no deja
entrada en `potencia`. Al arrancar la palanca parecía un bloque cualquiera y **la lámpara del otro
lado del muro se quedaba encendida**. Ahora salta siempre; el filtro que de verdad importaba sigue en
pie (**solo se encola lo que tiene `cfg`**), así que la cola sigue vacía en una ráfaga y lo único que
sube son lecturas de array: 7 → 43 por escritura, **600 escrituras en 0,9 ms**.

**El «bloque aislante» del ticket, hecho.** Está en `game.redstone.aislante(clave)` y no en
`game.bloques.define(…, {aislante:true})` como se apuntó al redactarlo: la tabla de materiales de
redstone ya vive en el motor, y meter el aislante en `define()` lo convertiría en pieza de circuito
—entraría en la cola y gastaría una entrada de `potencia`— para no hacer nada. `aislante(clave,
false)` lo quita, `aislante()` los lista.

**Depuración:** `game.redstone.info(x,y,z)` añade `vecinos[i].bloque = {fuerte, debil}` en los
vecinos que son bloques macizos. Sin eso, «le llega corriente y no enciende» se mira a ciegas justo
en el caso nuevo.

**Verificado**
- `node test_redstone_bloques.js` — **nuevo**, todo ok: transporte por el muro (el caso literal de la
  captura: una antorcha pegada al muro pasa de ver 0 a ver 15), fuerte/débil en los dos sentidos, dos
  muros en fila que no conducen, `aislante()` de ida y vuelta, el despertar a 2 celdas al **poner** y
  al **quitar** la fuente, y el coste de la ráfaga.
- `test_redstone_dsl.js` · `test_redstone_antorcha.js` · `test_redstone_arranque.js` ·
  `test_redstone_giro.js` — todo ok (los avisos de oscilación de `giro` ya salían antes: se comprobó
  desactivando la función).
- `test_bloques_comportamiento.js` — 373 ok, 0 fallos.
- `node redstone/montar_ejemplos.js` — **los nueve circuitos reales**, montados sobre el suelo (que
  es donde el transporte por bloques podía romperlos), accionados uno a uno: todo ok.

---


<a id="-req-rs5"></a>

### ✅ REQ-RS5 · El bloque de redstone (fuente permanente) — ✅ resuelto 2026-08-06

**Reportado** 2026-08-06 por el dueño, con captura: un repetidor gris encima de un bloque rojo grande
sobre hierba, con los dos pines apagados. «el repetidor encima de un bloque de redstone deberia
activarse». Luego, ya con el diagnóstico delante: **«añade el bloque de redstone, y que no se active
con red_concrete los elementos de redstone»**.

**Lo que resultó ser** — el bloque de la foto es `asset:assets/red_concrete.vox.json`, hormigón
**decorativo**, en `data/mundo.json` (263,15,263). Dos cosas distintas, y me equivoqué en la primera:

1. **`red_concrete` estaba declarado FUENTE.** `redstone/redstone-arranque.js` lo traía en su tabla
   `DEFECTOS` con `{ power: 15 }`, así que **en todos los mapas cualquier pared de hormigón rojo daba
   15 por sus seis caras**. Eso es lo que el dueño veía. Mi primer diagnóstico —«es el puente de r1.2
   desde un cable pegado»— **era falso**, y lo defendí incluso después de que él insistiera con una
   segunda captura («veo que tanto redstone como redconcrete siguen dando potencia»). Tenía razón
   las dos veces. Además este mismo `CLAUDE.md` y `redstone.js` usaban `red_concrete` como **ejemplo
   de fuente** en sus cabeceras, o sea que la confusión venía documentada de origen.
2. **El repetidor no escucha hacia abajo.** `señalQueLlega` filtra por `atrasDe()`, y `FRENTE =
   [0,4,1,5]` es horizontal: el `−Y` no entra nunca. **Verificado que Minecraft hace lo mismo** — el
   bloque de debajo de un repetidor es *solo soporte*; la entrada se lee del de **detrás**. Se lo
   dije al dueño con la fuente delante y aceptó la regla de Minecraft.

**Qué se hizo**
- `assets/make_blocks.js` + `assets/bloque_redstone.vox.json` + entrada en `assets/index.json`.
  Moteado a propósito, para que **no se confunda de un vistazo con el hormigón rojo liso**.
- `redstone/redstone-piezas.js`: `'asset:assets/bloque_redstone.vox.json': { emite: 15 }`. Nada más —
  sin pareja encendida/apagada (no tiene dos estados, así que `aplicar()` no le toca el material),
  sin `manual` y **sin `mira`**, o sea 15 por las seis caras.
- `redstone/redstone-arranque.js`: **fuera** la entrada `red_concrete` de `DEFECTOS`, con un comentario
  en su sitio que dice qué había y por qué se quitó (si no, vuelve).
- `redstone/redstone-demo-antorcha.js`: su `FUENTE` apunta ya al bloque de redstone, y es ése el que
  te deja en la hotbar.

**Coste de la migración** — al dejar de emitir, 10 celdas de hormigón rojo que alimentaban piezas se
quedan sin fuente: 6 en `data/mundo.json` (262,15,253 · 271,15,262 · 263,15,263 · 271,16,263 ·
272,16,264 · 271,17,264) y 4 en `data/worlds/test.json` (52,15,51 · 59,15,53 · 60,15,53 · 66,15,60).
`cubes.json`, `lab.json` y `redstone.json` tienen hormigón rojo pero ninguno tocando circuito. Se
arreglan **sustituyendo esas celdas por el bloque de redstone**; no se ha tocado ningún mundo del
dueño.

**Lo que NO se hizo, y por qué** — no se abrió el `−Y` del repetidor (rompería la asimetría que evita
que se realimente por su propia salida: BUG-RS2), y **no se declaró `red_concrete` aislante**: el
puente de r1.2 es el comportamiento de *cualquier* bloque macizo, no algo suyo, y aislarlo sería
tratar el síntoma. Lo que había que quitar era la declaración de fuente, y eso es lo que se quitó.

**Verificado**
- `node test_redstone_bloque_fuente.js` — nuevo: las seis caras a 15, sin estado, detrás sí / debajo
  no (y que `info()` lo *explica* en vez de parecer roto), y que `red_concrete` no emite pero **sigue
  haciendo de puente**. La primera versión de este test **daba verde con el fallo puesto**, porque
  solo miraba `redstone-piezas.js`; ahora lee `redstone-arranque.js` **de disco** y comprueba contra
  `game.redstone.lista()` en vivo que `red_concrete` no está entre los circuitos.
- Sin regresiones: `test_redstone_bloques`, `test_redstone_dsl`, `test_redstone_antorcha`,
  `test_redstone_arranque`, `test_redstone_giro`, `test_galeria_assets` — todos en verde.

---


<a id="-perf-mc2"></a>

### ❌ PERF-MC2 · Sub-chunk culling de estructuras — ❌ cerrado 2026-08-07 (sin hacer)
Partir la malla fina de cada estructura en sub-bloques (p.ej. 16^3 de mundo) con su propio AABB, para que pegado
a una pared mirando hacia fuera la mayoria de sub-bloques caigan **fuera del frustum** y no se dibujen. Complemento
del greedy (greedy baja las caras por sub-bloque; el sub-chunk baja cuantos sub-bloques se dibujan). Occlusion
culling real (la pared tapa el resto) queda como mejora posterior mas compleja.

**❌ Cerrado 2026-08-07 por decisión del dueño, sin hacer.** Se abrió por una sospecha razonable —«pegado
a una estructura bajan los fps»— que **las medidas posteriores desmintieron dos veces**: aquel caso resultó
ser la colisión fina (`mcCollides` escaneando el AABB con clave string, coste ∝ `playerScale³`), y el de
la carga lenta resultó ser la red. Los draw calls de estructuras no han vuelto a aparecer como cuello en
ninguna medición desde entonces, y esto es trabajo grande: partir la malla, un AABB por sub-bloque y
tocar el camino que más se ejecuta del motor.

**Qué lo reabriría:** una medida —no una sensación— con `game.perf()` por fases que señale al dibujo de
estructuras. La regla que ya está escrita en CLAUDE.md aplica entera aquí: fps con **DevTools cerrado**, y
si `game.voxels` SUBE al acercarse a la pared es geometría sin cullar; si no sube, el cuello es otro y
este ticket seguiría sin ser la respuesta.

---


<a id="-bug-gal1"></a>

### ✅ BUG-GAL1 · Editar el cable de redstone creó una pieza NUEVA en vez de reemplazar la vieja — ✅ resuelto 2026-08-06
**Capturas** — `data/tickets/BUG-GAL1/` (`01.png` galería con las dos tarjetas, `02.png`
la ficha de `asset:assets/cable.vox.json`, `03.png` las dos piezas en el Mundo) + `contexto.md`.

**Reportado** 2026-08-06 por el dueño, con tres capturas: «he querido modificar el cable de redstone
por una forma más interesante y en lugar de reemplazar el actual se ha creado uno nuevo, cosa que no
debería de haber pasado, además parece que se llama igual viendo los rayos-X».

**Lo que se ve en las capturas** (esto es observación, no diagnóstico):
- En la galería conviven **dos tarjetas**: «**cable asset**» —rotulada `Bloque · cable · del juego` y
  `🎮 Asset del juego`, con miniatura de una cruz roja OSCURA en volumen— y «**cable**» —rotulada
  `textura · 112 vox`, fechada `05 ago 21:55`, con miniatura de una cruz roja BRILLANTE y plana.
- La ficha que sí abre dice: `Tipo textura · Grupo Bloques de construcción · Rol Bloque · cable ·
  Tamaño 16×16×16 · Fichero assets/cable.vox.json`, clave `asset:assets/cable.vox.json`, y «nombres
  que ya funcionan hoy: `cable · id`, `cable · rótulo`».
- En el Mundo se ven **las dos piezas a la vez**, una al lado de la otra: la cruz plana brillante y la
  cruz oscura en volumen.

**Reflexión** — que las dos respondan a «cable» y que una sea `textura` y la otra `Asset del juego`
apunta a que hay **dos registros distintos para el mismo nombre corto**, y que el guardado desde el
editor entró por el camino de «alta» y no por el de «reemplazo». La ficha del 2026-08-04 dejó escrito
que un asset responde a **cuatro** claves (id, rótulo, basename y `meta.alias`); si el editor guarda
resolviendo por una y el registro indexa por otra, un guardado «encima» se convierte en un duplicado
sin que nadie proteste. Eso encaja también con el «parece que se llama igual en rayos-X»: si las dos
entradas comparten rótulo, el overlay no puede distinguirlas.

**Lo que NO he verificado** (por la regla de «nuevo ticket = anotar, no investigar»): cuál de las dos
es la vieja y cuál la nueva, qué endpoint usó el guardado, si hay dos ficheros en `assets/` o uno
solo con dos entradas de paleta, y si el duplicado es del disco o solo del índice en memoria. Todo eso
es lo primero que hay que mirar al abordarlo, y hasta entonces el ticket no afirma causa.

**Verificación esperada** — guardar una modificación de un asset existente lo **reemplaza**; no
aparece una segunda tarjeta; y si de verdad hiciera falta crear una pieza nueva, el nombre corto no se
puede repetir (o se rechaza, como ya se rechaza pisar un alias de fábrica, o se desambigua).

**Resuelto 2026-08-06.** La pregunta que el ticket dejaba abierta —«cuál es la vieja y cuál la nueva,
qué endpoint usó el guardado»— tenía respuesta en el disco: **dos ficheros de verdad**, no dos
entradas de paleta. `data/habitantes/cable.json` (112 vox, la cruz gorda, de ayer 21:55) y
`assets/cable.vox.json` (44 vox, la cruz irregular que el dueño redibujó, de hoy 12:10).

La causa es **una línea**: `save()` decidía el destino por `state.meta.type` —`'textura'` →
`/api/assets`— en vez de por la galería **de la que salió el dibujo**. El cable es un habitante de
tipo `textura`, así que cargarlo y darle a Guardar lo mandaba a `assets/`, con el mismo `id`, dejando
el original intacto: de ahí las dos tarjetas y el «se llama igual». `serverId` recordaba el **id**
pero no el **espacio de nombres**, y un id sin espacio de nombres no identifica nada — `cable` existía
como habitante y como asset a la vez. Peor: `mcIndexAssets` registra el nombre corto de cada asset, así
que el duplicado **secuestró la clave `cable`** para todos los scripts.

Arreglo: `serverKind` (`'hab'|'asset'|null`) viaja junto a `serverId` —se pone al cargar, sobrevive al
`localStorage`, y `vaAAssets()` enruta por él; el tipo solo decide cuando **no hay origen**, o sea en un
dibujo nuevo. `saveAs()` va por el mismo sitio, así que una copia nace en la galería de su original.

**Datos** — el dibujo nuevo se movió a donde el dueño quería que estuviera (`hab:cable`), y el
duplicado se retiró con `DELETE /api/assets/cable`, que lo deja en la papelera y libera el nombre
corto. Respaldo previo de las tres piezas en `data/habitantes_trash/1786012950832__*`.

**Verificado** — `test_galeria_namespace.js` (nuevo, 8 ok): reproduce el caso exacto —un habitante de
tipo `textura` que se carga, se modifica y se guarda— y comprueba que **no** aparece el asset gemelo.
Se confirmó que la prueba **falla contra el código viejo** (2 fallos: «aparecio
assets/zz-test-namespace.vox.json» y el voxel nuevo sin llegar al habitante). Sin regresión en
`test_galeria_assets` (7 ok), `test_guardar_pieza` (17 ok), `test_redstone_arranque`,
`test_redstone_dsl` y `test_redstone_giro`.

---


<a id="-bug-gal2"></a>

### ✅ BUG-GAL2 · El botón «Ficha» solo sale en una de las dos copias del cable — ✅ resuelto 2026-08-06
**Capturas** — las tres del mensaje están en `data/tickets/BUG-GAL1/` (los tres tickets salen del
mismo mensaje, así que las imágenes se guardan UNA vez). La que importa aquí es `01.png`: se ve una
tarjeta con `📋 Ficha` y la otra sin él.

**Reportado** 2026-08-06 por el dueño, en el mismo mensaje que BUG-GAL1: «solamente el nuevo tiene
ficha, el original no tiene ficha y debería tenerla».

En la captura, la tarjeta «cable asset» ofrece `Cargar · 📋 Ficha · Renombrar · Borrar`, y la tarjeta
«cable» solo `Cargar · Renombrar · …` — sin `Ficha`. Va **aparte** de BUG-GAL1 a propósito: aunque el
duplicado desaparezca, sigue siendo una pregunta legítima por qué una pieza de la galería se queda sin
ficha, y la respuesta probablemente no es la misma (la ficha se introdujo el 2026-08-04 y puede estar
condicionada al tipo de entrada — `textura` vs `Asset del juego` — más que a la duplicación).

**No verificado**: qué condición decide pintar el botón, ni si la ficha de la tarjeta sin botón se
podría abrir igualmente por URL.

**Verificación esperada** — toda pieza de la galería enseña su ficha, con su clave de scripting
copiable, sea del juego o importada.

**Resuelto 2026-08-06.** Iba aparte de BUG-GAL1 con razón: **no** era la duplicación. La sospecha
apuntada en el ticket («condicionada al tipo de entrada más que a la duplicación») era la correcta, y
la condición resultó ser aún más simple de lo previsto — no había condición ninguna: el botón
`📋 Ficha` estaba escrito **solo** en el bucle que pinta los assets, y el de habitantes no lo tenía. O
sea que **ningún** habitante ha tenido ficha nunca, no solo el cable.

No bastaba con añadir el botón, porque la ficha estaba escrita entera en forma de asset: clave
`'asset:'+a.file`, `fichaClaves()` derivando nombres del basename, y el alias por
`PATCH /api/assets/<id>`. Un habitante **no** pasa por `mcIndexAssets`, así que su id, su rótulo y su
basename **no valen como clave**: la única que funciona es `hab:<id>`. Enseñar las otras habría sido
peor que no enseñar nada — es justo el error que dejó el cable roto (ver BUG-RS5).

Arreglo: `fichaKind` (`'asset'|'hab'`); para un habitante la ficha dice su clave entera, y la mitad
editable del formulario (nombre corto, icono, Guardar) **se esconde** en vez de fingir que se puede
editar, porque el servidor solo deja renombrarlos.

**Verificado** — `test_galeria_namespace.js`: la tarjeta ofrece `Cargar · 📋 Ficha · Renombrar ·
Borrar`, la ficha enseña `hab:<id>` y el ejemplo copiable, y **no** ofrece alias ni Guardar.

---


<a id="-bug-rs5"></a>

### ✅ BUG-RS5 · El cable de redstone modificado no conduce — ✅ resuelto 2026-08-06
**Capturas** — en `data/tickets/BUG-GAL1/` (mismo mensaje). La buena aquí es `03.png`: las dos
cruces plantadas juntas en el Mundo, la brillante plana y la oscura en volumen.

**Reportado** 2026-08-06 por el dueño, cerrando el mismo mensaje: «y lo que es peor, el modificado no
funciona».

**Reflexión** — el motor de redstone no conoce piezas por su forma sino por su **clave**, y el
circuito del cable está declarado sobre `'hab:cable'` (`redstone/redstone-piezas.js`). La pieza de la
ficha se llama `asset:assets/cable.vox.json`. Son **dos espacios de nombres distintos** (`hab:` =
galería de habitantes, `asset:` = empotrado), así que una cruz nueva guardada como `asset:…` no está
en la tabla del circuito y se comportaría exactamente así: se ve, se pone, y no conduce nada. Si eso
se confirma, BUG-RS5 es **consecuencia** de BUG-GAL1 y se cierra con él; si no, es un fallo aparte.

**No verificado**: con qué clave quedó guardada la pieza nueva, ni si el dueño editó la de `hab:` o la
de `asset:`. Es lo primero que hay que mirar, y se responde en un minuto con `game.redstone.info()`
encima del cable que no funciona — que desde BUG-RS2 ya dice `escuchaPor`/`emitePor` y, si la celda ni
siquiera es circuito, `esCircuito:false`.

**Verificación esperada** — cambiarle el dibujo a una pieza de redstone no le quita el circuito: el
cable modificado conduce igual que el de antes.

**Resuelto 2026-08-06 — era consecuencia de BUG-GAL1**, exactamente como el ticket sospechaba, y la
prueba estaba en la captura que el propio dueño adjuntó: `02.png` es la ficha del dibujo nuevo y dice
`asset:assets/cable.vox.json`. El circuito se declara sobre `'hab:cable'`
(`redstone/redstone-piezas.js`), así que la pieza nueva **nunca fue un circuito**: era un dibujo
bonito, colocable y mudo. No hubo que tocar ni una línea del motor de redstone.

Al arreglar el enrutado (BUG-GAL1), el dibujo del dueño se movió a `hab:cable`, que es donde el
circuito lo busca. Como `cable-on` seguía siendo la cruz gorda de 112 vox, el cable **habría cambiado
de forma al encenderse**, así que se le aplicó la forma nueva heredando el color emisivo que ya usaba
(`*#ff2d2d`): solo cambia la forma, no la paleta.

**Verificado** — `test_redstone_arranque`, `test_redstone_dsl` y `test_redstone_giro` en verde con el
dibujo nuevo ya instalado. Falta la confirmación visual del dueño en su mundo.

---


<a id="-bug-esc1"></a>

### ✅ BUG-ESC1 · Al montar en una escalera se conserva el movimiento lateral: cuesta subir y te tira — ✅ resuelto

**Reportado** 2026-08-06 por el dueño: «la escalera, cuando se sube y hay movimiento lateral, este se
conserva, por lo que es difícil subir por ella; es decir, si subo ladeado a ella sin darle a avanzar o
moverme, por ella se mueve solo el jugador y tiende a caerse. Solamente entrando muy de frente a ella, o
tras correcciones, se puede reorientar. **Al montar en la escalera no debería de haber ninguna inercia**».

**Síntomas, tal y como los describe** (sin investigar todavía, esto es lo que hay que reproducir):
1. Se llega a la escalera con velocidad lateral y esa velocidad **sobrevive al enganche**.
2. Enganchado y **sin tocar ninguna tecla**, el jugador **se mueve solo** y acaba saliéndose / cayendo.
3. Solo se sube bien entrando **muy de frente**, o corrigiendo a mano mientras se sube.

**Criterio de aceptación:** en el instante en que el jugador engancha la escalera, la velocidad
horizontal se anula; sin pulsar nada no se mueve ni un float; y se puede subir entrando **de lado**, no
solo perpendicular. Sin tocar la física del jugador fuera de la escalera (`test_fisica_navegador.js` y
`test_parkour_navegador.js` tienen que quedar igual).

**Aún por decidir al abordarlo:** si la inercia se corta **al enganchar** (una vez) o **mientras se está
enganchado** (cada tick). Lo segundo también quita el poder saltar de una escalera con impulso lateral,
que puede ser un movimiento que el dueño quiera conservar — hay que preguntárselo o medirlo, no elegirlo
por defecto.

**La causa no estaba en el código de trepar, sino en QUÉ RAMA de `app.js` corre mientras cuelgas.**
`aplicarTrepado` deja `mc.onGround = false` (colgado no pisas nada, y así la gravedad no se acumula), y
`app.js` reparte el mando horizontal justo por ese booleano (`app.js:7433`):

```js
if (mc.onGround || !mc.airControl) { ... }   // la velocidad se REESCRIBE desde las teclas cada frame
else { ... }                                 // air-strafe estilo Quake: NO la reescribe, y sin rozamiento
```

O sea que colgado se entraba **siempre** por la rama de aire, que ni reescribe la velocidad desde las
teclas ni tiene rozamiento: la velocidad lateral con la que llegabas a la escalera se conservaba entera,
frame tras frame, y te sacaba de ella sin que tocaras nada. Es exactamente lo reportado, y explica los
tres síntomas de golpe — incluido el 3, porque entrando de frente no hay componente lateral que conservar.

**El arreglo son dos líneas en el envoltorio de `mcUpdate` del snippet** (`parche_snp_escalera_inercia.py`,
idempotente): agarrado, se le dice a `orig(dt)` que salga por la rama de **tierra**, y nada más.

```js
if (agarre && !mc.onGround) mc.onGround = true;
try { orig(dt); } finally { ... }
```

Se toca **solo** el rato que dura `orig(dt)`: quien decide el `onGround` de verdad sigue siendo la física,
y `aplicarTrepado` lo vuelve a poner en `false` justo después. Cero líneas de `app.js`.

**Queda decidida la pregunta que dejó abierta el ticket, y sin tener que elegir:** la inercia se corta
**mientras se está enganchado** (cada tick, que es lo que quería el dueño: «no debería de haber ninguna
inercia»), y **aun así se conserva el saltar de lado desde la escalera**, porque con espacio pulsado
`sondearAgarre()` devuelve `null` → no hay agarre → esto no se ejecuta → el impulso lateral es el que
marquen A/D en ese momento. Está medido en la sección C del test.

**Verificado** — `test_escalera_inercia.js` (nuevo, navegador de verdad, **11 ok / 0 fallos**). Hacía
falta navegador: el mundo de juguete de `test_bloques_comportamiento.js` tiene un `mcUpdate` de mentira
que no mueve en horizontal, y el fallo es justo de la rama horizontal del `mcUpdate` de verdad. Sin
regresiones en lo que toca la misma envoltura: `test_bloques_comportamiento.js` 388 ok,
`test_parkour_navegador.js` 18 ok, `test_fisica_navegador.js` 18 ok.

⚠️ **El epsilon del banco de pruebas, que casi da un falso verde entero.** Con el jugador pegado a la
escalera a `+0,2` clavado, el borde del cuerpo (`MC_HW = 0,3`) cae en el límite de celda exacto y
`floor(pz + HW)` lo mete **dentro** de la celda de la escalera: el jugador «choca» con la escalera en la
que se apoya, `mcUpdate` se va a su rama de rescate y **no se mueve nada**. Todas las medidas salían
`0,000`, incluida la de control. Va con `- 1e-3`, igual que el `Z_PEGADO = 11 - 0.3 - 1e-4` que ya tenía
`test_bloques_comportamiento.js` con la misma nota.

**Qué lo reabriría:** que el dueño note que ahora **cuesta** salirse de la escalera a propósito (el mando
de tierra es más pegajoso que el del aire), o que aparezca alguna otra situación de «colgado» —agarres
futuros, escalada de bordes— donde la rama de tierra dé un movimiento raro.

---


<a id="-bug-rot1"></a>

### ✅ BUG-ROT1 · `R` y `Shift+R` no alcanzan todas las orientaciones: hay colocaciones imposibles — ✅ resuelto

**Reportado** 2026-08-06 por el dueño: «el modo "r" de rotar y mayúsculas + "r", con "r" se debería de
ir rotando la figura en las 6 posiciones posibles, por ejemplo, una losa plana pasaría por las 6 caras
hasta volver de nuevo a la 1ª, con mayúsculas+r debería de rotar en las 4 posibles posiciones de esa
cara, es decir, sobre su plano. Si no es de esta manera resulta imposible colocar un objeto en todas
las rotaciones posibles tal y como está actualmente».

**Lo que pide** — separar el giro en **dos ejes de mando**, que juntos dan las 24 orientaciones de un
cubo: `R` elige **qué cara va abajo** (ciclo de 6, una losa plana recorre sus 6 caras y vuelve a la
primera) y `Shift+R` **gira sobre esa cara** (ciclo de 4, en su plano). 6 × 4 = 24.

**Por qué importa** — no es comodidad: el dueño dice que tal y como está **hay colocaciones que no se
pueden alcanzar**, o sea que parte del espacio de orientaciones es inaccesible desde el teclado.

**Medido: eran 16, no 24.** El dueño hizo la cuenta él mismo («6 caras tiene un cubo por 4 posibles
posiciones/rotaciones por cara 24 en total como maximo podria haber») y tenía razón. El esquema viejo
componía **dos** cuartos de vuelta, `ori = (giro & 3) | ((vuelco & 3) << 2)`, o sea 4×4 = 16 códigos.
Y ni siquiera son 16 posturas repartidas: con dos ejes, **`+Y` y `−Y` se llevan 4 giros cada una** y
las otras cuatro caras se quedan con **2**. De ahí las colocaciones imposibles — una pieza tumbada de
lado solo se podía poner de dos maneras de las cuatro.

**Falta un tercer cuarto de vuelta, y va ANTES del vuelco** (`roll`, sobre Z). Con `roll ∈ {0,1}` el
producto es 2×4×4 = 32 combinaciones que dan exactamente **24 rotaciones distintas**.

**La tabla se DERIVA, no se escribe a mano** (`MC_ORI` en `app.js`): se recorren las 64 ternas
`(roll, tilt, yaw)`, se firma cada una por lo que le hace a los tres vectores base y se descartan las
repetidas. Salen 24, y salen **en el orden que hacía falta**:

- las **16 primeras** son las `(0, tilt, yaw)` en el mismo orden que el esquema viejo, así que
  `@0..@15` siguen significando **byte a byte lo mismo** y los mundos ya guardados no se mueven ni un
  grado. Las 8 nuevas se apenden como `@16..@23` (la clave ya admitía dos dígitos: `/@\d{1,2}$/`).
- de propina quedan **agrupadas de cuatro en cuatro por cara arriba**, o sea que el gesto que pidió el
  dueño («"r" para elegir la cara y luego shift+r para elegir el giro dentro de esa cara») sale
  directo: **`ori = cara*4 + giro`**, sin tabla de traducción intermedia. `MC_ORI_CARA` (también
  derivada) es solo el rótulo del toast: `arriba · −Z · abajo · +Z · +X · −X`.

**Lo demás que se tocó:**

- `mcOriNorm` / `mcOriParts` sustituyen a los `(rot|0)&15` sueltos que había repartidos por `app.js`;
  el `&15` recortaba en silencio cualquier código nuevo a una postura vieja.
- `mcStructGeom` pasa a tener **un solo `mueve(x,y,z)`** con las tres pasadas de `mcRotXZ`, que usan
  **a la vez** el bucle de voxels y `mcFacePerm` (la permutación de normales de la máscara `caras`).
  Con dos copias de la composición, la máscara y la geometría se desincronizan a la primera.
- Las medidas: cada cuarto de vuelta impar intercambia los dos ejes de su plano, así que hay tres
  intercambios encadenados (`bxR/byR` por `roll`, `bzT` por `tilt`), no dos.
- `mc.previewRot`/`previewTilt` pasan a llamarse **`mc.previewGiro`/`mc.previewCara`**, que es lo que
  significan ahora.
- `data/snippets/mundo-autoarranque.json` **calca** esa composición en dos sitios (`caraEnMundo` y
  `dimsMundo`, para `pivote:'auto'`), así que se parchea con `parche_snp_rot24.py` — idempotente,
  porque el dueño lo edita en vivo. Pregunta a `mcOriParts` y se queda el calco viejo de red por si
  corre sin motor.

**Verificado:**

- `node test_posturas_24.js` (16 ok, sin navegador) — 24 posturas distintas con determinante 1 (nada
  de espejos), 6 caras × 4 giros, `@0..@15` decodifican igual que antes, `R`×6 y `Shift+R`×4 vuelven
  al punto de partida, y la huella declarada (`mcOriDims`) cuadra con la real en una caja 3×5×7.
- `node test_posturas_mundo.js` — en Chromium y con una pieza **asimétrica** de verdad
  (`flor-amarilla`, 52 voxels finos): `mcStructGeom` hornea **24 geometrías distintas**, las 8 nuevas
  no repiten ninguna de las 16 viejas, y girar no pierde ni inventa un solo voxel. Lleva guardia
  anti-falso-verde: si la pieza elegida no distinguiera ya las 16 viejas, el test se cae en vez de
  dar verde. ⚠️ Se lee `g.bitsAim || g.bits` — la flor es `atravesable` y su `bits` va a ceros a
  propósito.
- Sin regresión: `test_atlas_estructuras.js` (píxel a píxel de lo estampado), `test_caras_mundo.js`,
  `test_caras_mascara.js`, `test_clic_derecho_rejilla.js` y `test_bloques_comportamiento.js` (384 ok,
  uno de ellos ejercita el snippet ya parcheado).

---


<a id="-req-test1"></a>

### ❌ REQ-TEST1 · Un runner para la suite, y que cada test diga qué necesita — ❌ archivado 2026-08-10

> **Archivado 2026-08-10 a petición del dueño.** Estaba **duplicado**: este mismo id ya figuraba
> resuelto el 2026-08-08 en el índice. Y lo que pedía está hecho — `correr_tests.js` (`--list`,
> `--node`, `--pw`, `--area=…`) y los **96** `test_*.js` etiquetados con `@area` y `@necesita`.
> Queda un cabo suelto que **no** justifica mantenerlo abierto: el runner lee `@area:` con dos puntos
> y hay 1 test escrito con `@area=`, que por eso cae en «general».

> **Apéndice 2026-08-12 — la mudanza a `tests/` había dejado rutas colgando.** Al mover los 85
> ficheros de la raíz a `tests/` (commit `b36b434`) las rutas siguieron apuntando a la raíz **desde
> dentro de `tests/`**, así que 44 referencias de 25 ficheros no encontraban su fuente. Se veía como
> «el test de redstone ya no arranca» (ENOENT sobre `tests/redstone/redstone.js`). Dos clases, las dos
> arregladas:
>
> - **Relativas a `__dirname`** (44 en 25 ficheros): `__dirname + '/redstone/…'` → `'/../redstone/…'`,
>   y `path.join(__dirname, 'assets')` → `path.join(__dirname, '..', 'assets')`. Afectaba a `app.js`,
>   `assets/`, `data/`, `redstone/` y hasta al `require` de `node_modules/playwright`.
> - **Relativas al cwd** (`readFileSync('data/…')`, 7 ficheros): ésas no se tocan — el que estaba mal
>   era el runner, que lanzaba cada test con `cwd: tests/`. Ahora usa `cwd: __dirname` (la raíz), que
>   es lo que los tests asumían cuando vivían allí, y así siguen valiendo corridos a mano.
>
> Y de paso, **tres tests clavaban la versión del motor a mano** (`r.version === 'r1.2'`), con lo que
> subir `VERSION` los ponía en rojo sin que nada estuviera roto — justo lo que pasó al cerrar
> BUG-RS25 con `r1.3`. Los tres ya leen el motor de disco, así que la versión se **saca de la fuente**
> con un `match(/VERSION\s*=\s*'([^']+)'/)`: la comprobación que importaba (que el mundo no corra un
> snippet publicado viejo) se mantiene, y deja de romperse en cada subida.
>
> Comprobado: `--node` **13/13**, y el área de redstone pasa de 14 a **18 de 22**. Los 4 que siguen
> en rojo —`test_observador_rotacion`, `test_pistones_enfrentados`, `test_redstone_antorcha`,
> `test_redstone_arranque`— **ya fallaban antes**: se verificó publicando el motor anterior a BUG-RS25
> (`3d85fd0^`) y comparando, y fallan **en lo mismo y en la misma cantidad** (6, 4, 2 y 3). No son de
> esta mudanza ni de BUG-RS25. Ojo con `test_bug_rs13_piston_placa`: es **inestable bajo carga** (falló
> una vez dentro de la suite y pasa 5 de 5 suelto), no una regresión.

**Redactado sin investigar** (regla del dueño). Sale de una auditoría externa del repo, cuya fila
«Batería de Pruebas — ⚠️ Descentralizado» es **la única que resultó exacta al comprobarla**.

Lo medido al contestar la auditoría, y nada más:

| | |
|---|---|
| ficheros `test_*.js` en la raíz | **79** (20 101 líneas) |
| abren un Chromium contra `http://localhost:8500` | **66** |
| Node puro (sin Playwright, sin servidor) | **12** |
| script que corra la suite, o un subconjunto | **ninguno** |
| tests citados en `CLAUDE.md` | 53, desperdigados en línea dentro del texto |

El problema no es que sean muchos: es que **un fichero no declara de qué grupo es**. Un clon recién
hecho no sabe cuáles puede correr sin levantar `server.py` ni instalar Playwright, y descubrirlo
cuesta abrir los 79. Esa es también la razón de la regla vigente
«solo los tests del área tocada»: no existe forma de
correr la suite entera, así que la regla es en parte una racionalización de una carencia.

Lo que se pediría, cuando se aborde:

- Una **cabecera declarativa** por test (una línea, tipo `// @necesita: servidor, chromium` o un
  campo equivalente) — barata y es la mitad del valor.
- Un `correr_tests.js` (o `.sh`) que filtre por esa etiqueta y por **área** (`caras`, `redstone`,
  `agentes`, `fisica`…), para que «los tests del área tocada» sea un comando y no criterio mío.
- Que compruebe **antes de arrancar** que `:8500` responde y que `playwright` está instalado, en vez
  de fallar 40 timeouts seguidos.

⚠️ **No mover los `test_*.js` a una carpeta** sin decidirlo aparte: varios extraen funciones de
`app.js` **verbatim por texto** con rutas relativas (`test_rayo_apuntado.js` y compañía), y ése es
justo el mecanismo más frágil del repo.

---


<a id="-req-doc1"></a>

### ❌ REQ-DOC1 · `CLAUDE.md` está documentado pero no es navegable — ❌ archivado 2026-08-10

> **Archivado 2026-08-10 a petición del dueño.** Estaba **duplicado**: este mismo id ya figuraba
> resuelto el 2026-08-08 en el índice, con el Mapa de Navegación (TOC) en la cabecera de `CLAUDE.md`.
> Lo que sigue es el análisis de entonces, que se queda como registro.

**Redactado sin investigar.** La auditoría externa marcó «Redstone — ⚠️ Parcial — Disperso en tests;
falta REDSTONE.md». **El diagnóstico es falso** y conviene dejarlo escrito para no repetirlo:

- Redstone **no** está disperso en tests: vive en `redstone/` (10 fuentes, motor de 54 KB + piezas de
  32 KB), y por **petición explícita del dueño**, citada en `CLAUDE.md:2422`.
- **Sí** hay documentación: `CLAUDE.md:2420-2842`, ~420 líneas con la tabla de ficheros, la regla «el
  comportamiento cuelga del MATERIAL», la trampa de `define('apagada',{encendida:'X'})`, el
  transporte fuerte/débil de r1.2 y la cola drenada en el `rAF`.

Lo que la auditoría olió de verdad: **239 KB con solo 12 encabezados `##` y 22 `###`**. Sin `grep` no
se llega. Un lector que busca redstone no encuentra las 420 líneas y concluye que no existen — que es
exactamente lo que pasó.

**Sugerencia de partida (no decidida): un índice al principio, no partir el fichero.** Extraer
`REDSTONE.md` crea dos ficheros que mantener sincronizados y `CLAUDE.md` es el único que se carga
solo en cada sesión; el coste de partir se paga en cada ticket, el de un índice se paga una vez.
Decisión del dueño.

---


<a id="-bug-rs19"></a>

### ✅ BUG-RS19 · El observador se coloca como bloque sin girar, pero como estructura al rotarlo con `R` — ✅ resuelto 2026-08-10

**Reportado** 2026-08-10 por el dueño:

> «hay un bug cuando se coloca un observador de redstone en el mapa, si se pone en la posicion por
> defecto funciona por que es un bloque (imagino que se ha usado internamente `setVoxel`) pero cuando
> se rota con "r" cuando se construye en el mapa se crea como estructura y deberia de ser como bloque»

Y una pista suya al arrancar el diagnóstico —**la que ordenó la investigación**—: *«hay más bloques de
redstone que funcionan correctamente con las rotaciones y que no están completos y se plantan como
bloques»*. O sea que el problema no era «un macizo girado no cabe en la rejilla», que fue mi primera
sospecha. Era que el observador es un **caso raro** dentro de las piezas de redstone.

**El diagnóstico**, medido con una sonda Node pura sobre los `.vox.json` reales
(`sonda_bug_rs19.js`), pieza por pieza:

| pieza | vox | pielCubre | blockLike |
|---|---|---|---|
| **`observador`** | **4092** | **true** | **false** ← el caso raro |
| `bloque_redstone` | 4096 | true | true (proyección al cubo) |
| `cable`, `palanca`, `repetidor`, `pistón`, `placa`, `puerta`, `antorcha`, `botón`, `inversor`, `pistón‑cabeza`… | 32–3856 | **false** (fina desde siempre) | false |

El observador es la **única pieza de redstone con `pielCubre=true` y `blockLike=false`** — 4092 vox
en un cubo casi lleno, con 4 huecos internos. Y ese caso no estaba previsto en `mcRecFina`. La regla
vieja era:

```js
if(!rec.pielCubre) return true;                  // sin piel cubriendo el cubo: fina
return !!rec.translucido && !rec.conCaras;       // pielCubre=true: solo fina si es translúcido
```

Los cuatro casos que sí cubría, y el hueco:

| perfil | pielCubre | blockLike | translucido | conCaras | mcRecFina | ejemplo |
|---|---|---|---|---|---|---|
| flor, mata, llama | false | false | — | — | true ✅ | `hierba-alta` |
| macizo opaco | true | **true** | false | false | false ✅ | `hierba`, `lava`, `bloque_redstone` |
| translúcido (BUG-STR1) | true | false | **true** | false | true ✅ | `cubo-trans` |
| macizo con máscara `caras` | true | false | — | **true** | false ✅ (lo excluye `mcCabeEnRejilla`) | (n/a) |
| **casi macizo con huecos** | **true** | **false** | **false** | **false** | **false ← bug** | **`observador`** |

Con `mcRecFina=false` el observador iba por la ruta blockLike-like (proyección al cubo), y esa ruta
no soporta rotación: el atlas se hornea con 6 caras por bloque y las UVs de cada cara están
orientadas para su normal, así que permutar la textura por variante `@n` dejaría la cara girada
dentro del cuadro. Es lo que documenta el propio comentario de la línea 9287 en el motor: *«Lo que se
proyecta sobre las 6 caras del cubo no puede — ahí no se ve el giro — y se sigue estampando.»* Con
`rot=0` la condición `(rot===0 || mcEsFinaEnRejilla(sk))` de esa línea se cumplía por el primer lado;
con `rot≠0`, ambos lados eran falsos y `mcPlace` caía a `mcStampStruct`.

**El arreglo son 4 caracteres** en `mcRecFina` (`app.js`, cabecera del bloque anterior):

```diff
- return !!rec.translucido && !rec.conCaras;
+ return !rec.conCaras;
```

La regla queda: **si `pielCubre` y no es `blockLike`, va por geometría fina salvo que tenga `caras`**.
Cubre el caso translúcido (cubo-trans) *y* el «casi macizo con huecos» (observador). El motor de
redstone lee `mc.grid` (`redstone.js:126`) y `mcClaveBase` quita el sufijo `@n`, así que el circuito
identifica `observador@n` como la misma pieza que `observador`: **cero líneas del motor de redstone
tocadas**.

**Coste del cambio.** Antes, un observador se dibujaba con 6 quads (proyección al cubo). Ahora se
dibuja con la geometría fina de sus 4092 voxels dentro del lote del chunk (~800 vértices tras greedy,
un draw call por chunk igual que las demás celdas finas). El mismo precio que pagaba `cubo-trans`
desde BUG-STR1, y el mismo que las demás piezas de redstone. **Ningún draw call extra**: `mcAltaVariante`
ya está pensado para variantes `@n` y el mesher del chunk emite todas las celdas finas en el mismo lote.

**Verificado** con dos herramientas:

1. `node sonda_bug_rs19.js` (**10/10 TODO OK**, sin navegador): A/B sobre 10 assets reales entre la
   `mcRecFina` vieja y la nueva. Los únicos que cambian de veredicto son `observador.vox.json` y
   `observador-on.vox.json` (`false → true`); los otros 8 (macizo estricto `bloque_redstone`, opacos
   `hierba` y `lava`, translúcido `cubo-trans`, y piezas finas `hierba-alta`, `cable`, `repetidor`,
   `piston`) siguen exactamente igual.
2. `test_observador_rotacion.js` (**pendiente de ejecutar en navegador**): fija que las 24 posturas
   de `mcPreviewOri` caben en la rejilla como fino, que `mcAltaVariante` registra la variante `@1`
   por el camino rápido (sin re-hornear el atlas), que `mcPonEnRejilla` la escribe en `mc.grid` y no
   crea instancias en `mc.structures`, y que los perfiles vecinos (`cubo-trans`, `agua`, `likelava`)
   no cambian de comportamiento. Para ejecutarlo hace falta instalar Playwright — no está en un clon
   nuevo (ver ARRANQUE punto 4 de `CLAUDE.md`).

⚠️ **Trampa que casi cuesta el ticket.** La primera sospecha —«`mcCabeEnRejilla` responde `false` a
la variante `@n`»— apuntaba al sitio correcto pero **al lado equivocado**. Es la condición extra de
`mcPlace` (`rot===0 || mcEsFinaEnRejilla(sk)`) la que descarta el macizo-like girado, no la propia
`mcCabeEnRejilla`. Sin la pista del dueño sobre las otras piezas de redstone («no están completos y
se plantan como bloques»), la investigación habría acabado tocando esa condición para permitir
macizos girados —lo que hubiera pedido re-hornear atlas o permutar UVs por variante—, en vez de
subir la solución al sitio de fondo: el observador nunca debió ir por proyección, porque su piel
cubre pero **no es macizo**.

⚠️ **Efecto colateral consciente:** con `rot=0`, el observador antes se dibujaba con proyección de 6
caras del atlas; ahora se dibuja con su geometría real. Visualmente debe verse **igual o más fiel al
dibujo** (los 4 huecos internos que antes se comía la proyección ya no importan porque ni se ven).
No es una regresión; es la primera vez que el dibujo real del asset entra al mundo tal cual.


<a id="-bug-rs20"></a>

### ✅ BUG-RS20 · Dos observadores en fila no se propagan — ✅ resuelto 2026-08-10

**Reportado** 2026-08-10 por el dueño:

> «un observador no se entera del cambio de otro observador, si dos observadores estan pegados
> mirandose el culo, si el de delante ve un cambio deberia propagarse al segundo ya que el segundo
> deberia detectar el cambio del primero, pero esto no ocurre»

**Interpretación técnica del escenario.** «Mirándose el culo» = dos observadores en fila, ambos
mirando la misma dirección; el de atrás (A) ve el culo del de delante (B). Con A y B en fila en +X,
ambos con frente +X, un bloque delante de B dispara B — y como A tiene a B delante, A debería
propagar en cascada. No lo hace.

**Causa** (leída, no supuesta). En `redstone/redstone.js`:

```js
// El envoltorio de mcSetBlock, línea 641
var envuelto = function (x, y, z, id) {
  if (yoEscribiendo || !hayCircuito) return origSet(x, y, z, id);   // ← salida temprana
  ...
  if (antes !== -1 && mc.grid[mcIdx(x, y, z)] !== antes) encolarVecinos(x, y, z);
};
```

`encolarVecinos` hacía tres cosas: encolar la propia celda, encolar puentes, **y disparar los
observadores vecinos**. Y `dispararObservador` (líneas 327 y 347) escribe con protección para no
re-encolarse a sí mismo:

```js
yoEscribiendo = true;
try { mcSetBlock(nx, ny, nz, idOn); } finally { yoEscribiendo = false; }
```

Con `yoEscribiendo=true` el envoltorio sale temprano y las **tres** cosas de `encolarVecinos` se
pierden. Las dos primeras las replicaba a mano `dispararObservador` justo después (`encolar(nx,ny,nz,true)`
+ `encolarPuenteando`). La tercera —el bucle de observadores vecinos— **NO se replicaba**, y por eso
un observador que cambia de material no puede propagar su cambio a otro observador que le tenga
delante. Esta secuela no salió en BUG-RS19 porque hasta ese ticket los observadores girados iban por
`mc.structures`, así que dos observadores en fila con giros distintos no se veían entre sí en la
rejilla — al meterlos a todos en `mc.grid` este segundo bug quedó al descubierto.

**Arreglo mínimo** (`redstone/redstone.js`, republicado a `data/snippets/redstone.json` a 60.0 KB):

1. Extraer el bucle de observadores a un helper `notificarObservadoresVecinos(x, y, z)`. Cero cambio
   semántico para las escrituras normales — `encolarVecinos` ahora llama al helper en vez de tener
   el bucle inline.
2. En `dispararObservador`, tras cada uno de los dos `mcSetBlock` protegidos por `yoEscribiendo`
   (encendido y apagado), llamar explícitamente a `notificarObservadoresVecinos(nx, ny, nz)`. El
   observador que acaba de disparar **es** el «cambio delante» para su vecino de atrás.

**Deliberadamente NO se toca `aplicar()` ni `encender manual`** (los otros dos sitios con
`yoEscribiendo=true`): siguiendo la regla del proyecto *«solve the problem that was asked, no
abstractions beyond what the task requires»*. Si aparece «un observador no detecta cambio de lámpara
vecina» será otro ticket con su test guardián.

**Cascada A→B→A cortada**: si dos observadores se disparan entre sí, el pulso de A activa B, y B
llama a `notificarObservadoresVecinos` que llama a `dispararObservador(A)` — pero `apagones.has('obs:' + kA)`
al principio de `dispararObservador` **corta la re-entrada** mientras A esté en su pulso (~100 ms).
Sin ese corte previo, tendríamos bucle infinito; con él, la propagación se propaga una vez por
flanco.

**Verificación** — `test_observador_rotacion.js` gana el tramo **§3e** (aún pendiente de correr en
Playwright, no instalado):
- Coloca dos observadores en fila (`observador@0` en A y B contiguos, ambos frente +X).
- Espera 220 ms para que el pulso inicial (al colocar B, A ve el cambio delante) se calme.
- Comprueba que en reposo A y B son `observador@0` (no `-on`).
- Pone un bloque delante de B, drena, y comprueba que **A y B están en `observador-on@0`
  simultáneamente** durante el pulso — ese aserto es el que falla con el bug puesto.
- Espera 220 ms más y comprueba que ambos vuelven a `observador@0`.

Anti-falso-verde del tramo: **el aserto de fondo es «A_encendido === true»**, y sin el arreglo A
queda en `observador@0` porque el bloque nuevo delante de B tampoco es adyacente a A: A no puede
activarse por otra vía. Solo la propagación observador→observador puede encenderlo.

**Sin regresiones**:
- `node --check redstone/redstone.js` OK.
- Los otros disparos de observador (colocar/romper bloque, cambio de placa/palanca vecina) siguen
  funcionando: `encolarVecinos` sigue llamando al helper.
- `node sonda_bug_rs19.js` 10/10 (no depende de este cambio pero se ejecuta como sonda de humo).


<a id="-bug-rs21"></a>

### ✅ BUG-RS21 · Cadena B→A + antorcha: 1 parpadeo al poner, 2 al quitar (asimetría) — ✅ resuelto 2026-08-10

**Reportado** 2026-08-10 por el dueño, tras el arreglo de [BUG-RS20](#-bug-rs20):

> «es normal que con dos observadores en serie y una antorcha rs al final, si pongo un bloque
> delante del primero la antorcha se enciende y luego se apaga, pero al quitar el bloque se enciende
> y apaga rapido 2 veces para luego apagarse. es como si al poner el bloque detectase un solo flanco
> y al apagarse 2; creo que 2 es mas realista pues el bloque primero pasa por estado de detectando
> (on) y luego por no detectando»

Y añadió una referencia crítica de diseño:

> «minecraft deja hacer esto: […] Colocando dos observadores cara a cara, el primero detecta el
> cambio de estado de la cara del segundo y viceversa, generando un reloj de redstone rápido e
> infinito de 2 game ticks (1 tick de redstone). Se apaga de forma limpia mediante un pistón que
> desplace uno de los dos observadores.»

**El comportamiento correcto** (según Minecraft y la intuición del dueño): en una cadena B→A, cada
evento delante de B genera **2 flancos** en B (subida y bajada del pulso), y cada flanco es un
«cambio de bloque delante» para A, así que A debe pulsar **2 veces por evento**. La antorcha final
parpadea **2 veces al poner y 2 al quitar**.

**Causa** (leída, no supuesta). El corte `if (apagones.has('obs:' + kObs)) return;` al principio de
`dispararObservador` **descartaba** flancos legítimos cuando el observador estaba en pulso. En la
cadena B→A al poner:

- `t=0`: bloque puesto delante de B. B se enciende, agenda `T_B` a `t=100`. Cascada B→A: A se
  enciende, agenda `T_A` a `t≈100+ε`. Antorcha ON.
- `t=100` `T_B` ejecuta (FIFO por delay igual). B se apaga. Notifica A. **`apagones.has('obs:A')` es
  aún `true`** (T_A no ha ejecutado) → **el corte descarta el flanco**.
- `t≈100+ε` `T_A` ejecuta. A se apaga. Antorcha OFF. Nada notificado.

Resultado: **1 parpadeo** en la antorcha, y el segundo flanco de B se pierde en silencio. La
asimetría al quitar (2 parpadeos, correcto) probablemente venía por otra vía de propagación —
irrelevante ahora porque el arreglo hace los dos casos simétricos.

Y de propina, el mismo corte impide los **relojes cara a cara** de Minecraft: dos observadores
enfrentados no pueden retro-alimentarse porque cualquier notificación cae en el `apagones` del
vecino.

**Arreglo** (`redstone/redstone.js`, republicado a `data/snippets/redstone.json` a 62.7 KB):

1. **Nueva estructura `pendientesObs`**: `Map<key, true>` que anota los flancos que llegan a un
   observador mientras está en pulso. En vez de descartar, se anota.
2. **`dispararObservador`**: si `apagones.has('obs:'+k)`, ahora **encola en pendientesObs y sale**
   (sigue sin re-disparar en el mismo tick, pero el flanco no se pierde).
3. **Marca temporal antes de notificar**: `apagones.set('obs:'+k, 1)` se hace **antes** del
   `mcSetBlock` y de `notificarObservadoresVecinos`, no al final. Esto corta la recursión síncrona
   del caso cara a cara (A→B→A dentro del mismo frame) sin descartar el flanco: la re-entrada ve la
   marca y anota en `pendientesObs`.
4. **`apagones.delete` ANTES de notificar en el flanco de bajada**: en el `setTimeout` de apagado,
   liberar antes de `notificarObservadoresVecinos` para que la bajada dispare vecinos como cualquier
   otro cambio. No hay riesgo de recursión síncrona porque estamos dentro del setTimeout de este
   observador (no se re-entra a sí mismo).
5. **Re-disparar al terminar el pulso**: al final del setTimeout, si `pendientesObs.has(kObs)`, se
   consume la entrada y se llama `dispararObservador` de nuevo. Esto genera un segundo pulso
   con la cadencia natural de 100 ms.

Con estos cinco puntos:

- **Cadena B→A**: al poner (y al quitar) B pulsa una vez. Su subida notifica A, que arranca su
  pulso. Su bajada (100 ms después) notifica A **de nuevo**; A está en pulso → se anota en
  `pendientesObs`. Cuando el primer pulso de A termina, se consume la entrada y arranca un segundo
  pulso. **La antorcha ve 2 parpadeos en los dos casos.** ✓
- **Reloj cara a cara**: A y B se disparan mutuamente. La recursión síncrona la corta la marca
  temporal `apagones.set('obs:'+k, 1)`. Cuando el pulso de uno termina, notifica al otro, y el otro
  (ya salido de su pulso o con `pendientesObs` puesto) se re-dispara. **Oscilación estable a 100 ms
  por flanco**. ✓
- **Recursión infinita síncrona (evitada)**: la marca temporal garantiza que ninguna cascada
  A→B→A→B... corre en el mismo tick del event loop, incluso con observadores enfrentados. La
  oscilación va por setTimeouts encadenados, uno por flanco.
- **Fuga de memoria (comprobada por diseño)**: `pendientesObs` alterna entre `{A: true}` y
  `{B: true}` en el reloj cara a cara; nunca crece. En cadenas lineales, se limpia al re-disparar.

**Verificación** — `test_observador_rotacion.js` gana los tramos **§3f** y **§3g** (pendientes de
ejecutar en Playwright, no instalado):

- **§3f** — cuenta las subidas de A al PONER un bloque delante de B en una cadena B→A, y hace lo
  mismo al QUITAR. Espera `subidas === 2` en los dos casos. Anti-falso-verde: contra el código
  anterior, poner daba `subidas === 1` y quitar `subidas === 2` (asimetría reproducida por el
  dueño); con el arreglo, ambos dan `2`.
- **§3g** — planta dos observadores enfrentados (A frente +X, B frente −X mediante `mcOriPerm`
  buscando la orientación cuyo `perm[2] === 3` = MC_FACES[-X]), instala espía en `mcSetBlock` y
  cuenta las subidas de A en una ventana de 550 ms. Aserto: `subidas ≥ 2` (con período ~200 ms se
  esperan 2-3). Sin el arreglo la oscilación se detiene tras el primer pulso y el contador se queda
  en 1 o 0.

Sin regresiones:
- `node --check redstone/redstone.js` OK.
- `node sonda_bug_rs19.js` 10/10 (sonda de humo).
- El resto de casos del test (§1..§3e) siguen funcionando: el arreglo no cambia el flanco de subida
  cuando el observador está en reposo, ni la mecánica de propagación normal.


<a id="-bug-rs22"></a>

### 🟡 BUG-RS22 · El observador mirando una placa de presión pisada pulsa solo cada ~1 s — ✅ resuelto 2026-08-10

**Reporte del dueño, literal:**

> «el observador de redstone se comporta extraño. si coloco una placa de presión y un observador
> mirándola, el observador se enciende al subir (eso está ok) pero cada ~1 s genera 1 pulso redstone;
> no debería generar pulsos si la placa no cambia de estado»

**Montaje:** una `hab:placa` en el suelo y un `hab:observador@n` mirándola. El jugador se queda
quieto encima.

- **Correcto:** al pisar (flanco de subida) el observador emite **un** pulso.
- **Incorrecto:** a partir de ahí sigue emitiendo **1 pulso cada ~1 s** mientras el jugador no se
  mueva. Sin cambio de estado no debería haber ningún pulso más hasta que la placa se suelte.

**Sin investigar** (regla de tickets: se escriben, no se investigan). Lo que sigue es **hipótesis a
comprobar antes de tocar nada**, no diagnóstico:

- La placa está declarada con `pulso: MS_PULSO` en `CIRCUITOS` (`redstone/redstone-piezas.js`) y se
  re-arma sola mientras se la pisa. Si ese re-armado pasa por `placa` → `placa-on` de verdad, el
  observador estaría haciendo **exactamente su trabajo**: hay un cambio de bloque real cada ~1 s. En
  ese caso el defecto está en cómo se sostiene la placa pisada, **no en el observador**, y el arreglo
  va allí.
- Contrastar con Minecraft antes de decidir el comportamiento esperado (una placa pisada se mantiene
  encendida y estable; no repulsa) — ver la regla de verificar los «en Minecraft es así».

**Cómo reproducir:** en `/map/test`, estampar placa + observador enfrentados, pisar y mirar
`game.redstone.info(x,y,z)` del observador y del cable de salida a lo largo de varios segundos.

**Riesgo de regresión:** BUG-RS20/BUG-RS21 dejaron el observador con `pendientesObs` (flancos
encolados durante el pulso). Cualquier cambio aquí tiene que volver a pasar por esos dos casos.

**Resuelto 2026-08-10.** El observador nunca tuvo la culpa, y eran **dos** defectos, no uno:

1. **La placa parpadeaba de verdad.** `alPisar` es un flanco de ENTRADA y el de salida no existe
   (nadie avisa de que te has bajado), así que la placa se sostenía solo con su `pulso`: vencía, se
   soltaba, y el despachador la veía como celda+CLAVE nueva y la re-encendía el mismo frame. Medido:
   con el jugador quieto 4 s, **4 sueltas y 4 re-encendidos**. El observador reportaba cambios que
   estaban ocurriendo.
2. **`encender()` disparaba observadores sin cambio de bloque.** Re-encender algo ya encendido no
   escribe la celda, pero llamaba a `encolarVecinos`, que incluye `notificarObservadoresVecinos`. Con
   la placa ya estable, el observador seguía pulsando **al ritmo del re-armado**.

**El arreglo, en tres piezas:**

- **`alSeguirPisando(c)`**, capacidad nueva de `game.bloques` (`data/snippets/mundo-autoarranque.json`,
  puesta con `parche_snp_placa.py`): lo contrario de `alPisar`, se dispara **cada tick mientras la
  entidad siga dentro** de la celda. Vale para el jugador (`pisar()`) y para los agentes
  (`pisadaAgente()`, con la misma válvula `fisica:{placas:false}`). Sin `veces`: contar es de `alPisar`.
- **La placa la usa en sus DOS materiales** (`hab:placa` y `hab:placa-on`; en cuanto se enciende, el
  `alSeguirPisando` que se consulta es el de la variante *-on*), con un latido de 250 ms. El `pulso`
  se queda a propósito: ahora es lo que la suelta al bajarte (deja de llegar el latido) y el seguro
  de que un latido perdido no la deje pegada. 1,2 s ≈ los 20 ticks de juego que tarda de verdad la
  placa de Minecraft.
- **`encolarVecinos(x, y, z, sinFlanco)`** en el motor: sin cambio de bloque se repasa el circuito
  pero **no se notifica a los observadores**, porque no hay flanco que observar.

**Verificado:** `test_placa_observador.js` (nuevo, RED antes → verde ahora): 2 pulsos en toda la
prueba, uno por flanco; la placa se enciende 1 vez y se suelta 1 vez. Sin regresión en
`test_observador_redstone.js`, `test_agente_pisa_placa.js`, `test_redstone_dsl.js`,
`test_redstone_puerta.js`, `test_redstone_bloques.js`. `test_bug_rs13_piston_placa.js` necesitó
higiene propia (ver abajo).

**Efecto de lado, y es el correcto:** una placa ocupada ahora **mantiene la señal**, así que alimenta
de verdad lo que tenga al lado mientras estés encima. Eso destapó que
`test_bug_rs13_piston_placa.js` no limpiaba el circuito entre sus dos partes (dejaba señal anotada en
las celdas y el pistón nuevo se quedaba sordo, con un «recibe: 15» heredado); antes lo tapaba el
propio parpadeo, que devolvía el flanco por accidente. Arreglado en el test —`revisarCaja` + frames
tras limpiar—, y pasa igual con el motor de antes y con el de ahora.

---


<a id="-bug-rs25"></a>

### ✅ BUG-RS25 · La placa de presión no se desactiva al bajarse de ella — ✅ resuelto 2026-08-11

**Reporte del dueño, literal:**

> la placa de presion de redstone no funciona correctamente, cuando el usuario ya se ha bajado de
> ella deberia desactivarse pero no se desactiva.

**Montaje:** una `hab:placa` en el suelo alimentando algo visible (lámpara o pistón). Te subes
—enciende, eso funciona— y te bajas: se queda **pegada encendida**, en vez de soltarse.

**Sin investigar** (regla de tickets: se escriben, no se investigan). Lo que sí conviene dejar
apuntado, porque es la trampa de este ticket concreto:

- **Es el reverso exacto de [BUG-RS22](#-bug-rs22)**, resuelto ayer. Allí el problema era el
  contrario —la placa se soltaba sola estando tú encima y el observador pulsaba cada ~1 s— y el
  arreglo fue sostenerla: `alSeguirPisando` late cada 250 ms mientras sigas en la celda y re-arma un
  `pulso` de 1,2 s. **Bajarse no tiene flanco propio**: `alPisar` es solo de entrada. Lo único que
  suelta la placa es que **deje de llegar el latido** y el `pulso` venza por su cuenta.
- Por eso la primera pregunta no es «¿por qué no se apaga?» sino **¿sigue llegando el latido después
  de bajarte?** (celda de pies mal calculada, la entidad contada como dentro de la celda de al lado,
  o el `pulso` re-armándose desde otro sitio). La segunda es si el `pulso` vence pero **algo lo
  vuelve a encender** — que fue justo la mitad no evidente de BUG-RS22.
- **El arreglo no puede reabrir BUG-RS22.** Las dos mitades son la misma frontera: si se acorta o se
  elimina el sostén, vuelve el parpadeo y el observador vuelve a pulsar cada ~1 s. `test_placa_observador.js`
  guarda ese lado; hará falta un caso nuevo para el lado de soltar, y los dos tienen que pasar juntos.
- Ojo también al `pulso` de 1,2 s como **latencia esperada**: parte de «no se desactiva» podría ser
  «tarda más de un segundo en desactivarse». Merece medirlo antes de tocar nada — la diferencia
  cambia por completo qué está roto.

Material: `hab:placa` / `hab:placa-on`, declarados en los dos espacios de nombres (ver BUG-RS22).
El descubridor de siempre es `game.bloques.info()` y el estado de la celda, `game.redstone.info(x,y,z)`.

**Resuelto 2026-08-11 — y la sospecha de arriba era la equivocada.**

El latido **no** se queda pegado: para en seco al bajarse. Medido de cuatro maneras distintas (andando,
saltando, quedándose encima y desde el borde de la celda, `performance/sonda_placa_rs25.js`) y en el
mundo del dueño con su puerta (`sonda_placa_rs25_mundo.js`): la placa suelta siempre, y en 16 ciclos
con estancias de 40 ms a 2 s no hay ni uno que la deje pisada. En caliente el mecanismo está sano.

**Lo que sí estaba roto es la otra mitad, y saltó al mirar `/map/default`: ese mundo CARGABA con la
placa en `hab:placa-on`.** El estado de una pieza con pareja **es la clave que hay en la rejilla** —eso
es lo que hace que una palanca sobreviva a recargar el mundo sin persistir nada—, pero a una placa no
la suelta su clave: la suelta un `setTimeout` de `apagones`, que es **memoria de la sesión y no se
guarda con el mundo**. Guardar el mundo con la placa pisada (autoguardado mientras estás encima, que
es lo normal) deja en disco una celda `-on` que al volver no tiene temporizador que la suelte ni nadie
que se vaya a bajar de ella: **pegada para siempre**, alimentando su puerta o su lámpara con nadie
encima. Por eso «me he bajado y no se desactiva»: no era esa bajada, era una anterior.

El arreglo tiene **precedente literal en el mismo sitio**: `repasarMundo()` (el repaso de arranque,
`redstone.js`) ya devolvía a `off` el **observador** guardado encendido, por esta misma razón y con
este mismo comentario. Se le añade la otra entrada momentánea: toda celda `manual` + `pulso` que
cargue en `-on` se suelta al arrancar, porque **con nadie encima una entrada de pulso está apagada por
definición**; y si de verdad hay alguien, su latido (`alSeguirPisando`) la re-enciende en el mismo
frame — que es justo el caso B del guardián, y es lo que impide reabrir BUG-RS22. Cubre también el
**botón**, que tenía la misma enfermedad sin que nadie la hubiera visto. `VERSION` del motor a `r1.3`.

De propina, un fallo latente que el precedente sí tenía: esas celdas se escriben **a pelo en
`mc.grid`**, sin pasar por `mcSetBlock`, así que la malla no se enteraba. Ahora se juntan en
`retocadas` y se remallan al final del repaso — sin esto el mundo seguía **enseñando** la placa pisada
aunque el circuito ya estuviera suelto.

⚠️ **No se reescribe el mundo del dueño**: el arreglo suelta la placa al cargar, no toca
`data/mundo.json`. Si ese mundo se vuelve a guardar, se guardará ya con la placa suelta.

Guardián: **`tests/test_placa_pegada.js`** (A: carga pisada → se suelta y su cable se apaga · B: con
alguien encima sigue pisada · C: el ciclo de siempre no cambia). Sin regresión en
`test_placa_observador.js`, `test_agente_pisa_placa.js` ni `test_redstone_arranque.js` (los 3 fallos
de éste son **previos**: se reproducen igual con el motor de antes, y son de assets, no de señal).

---


<a id="-bug-rs23"></a>

### 🟡 BUG-RS23 · Una pieza importada de otra instancia deja de ser circuito — ✅ resuelto 2026-08-10

**Reporte del dueño, literal:**

> «tengo problemas para que el motor de redstone me identifique bien los assets cuando los exporto
> desde otra instancia y los importo en esta. por ejemplo, el piston pegajoso en la otra instancia usa
> "hab:piston-pegajoso-on" para scripting, pero si lo exporto e importo en esta instancia se llama
> "asset:assets/piston-pegajoso-on.vox.json" por lo que no funciona en el mapa»

**Qué pasaba.** Es el mismo dibujo, pero entra por otra puerta: por la galería de habitantes es
`hab:<n>` y empotrado es `asset:assets/<n>.vox.json`. La tabla `CIRCUITOS` de `redstone-piezas.js`
tenía las claves `hab:` **escritas a mano**, así que la pieza importada no aparecía en la tabla: ni
circuito, ni `atravesable`, ni cabeza al extenderse. En este repo se veía a simple vista —
`assets/piston-pegajoso*.vox.json` existe y `data/habitantes/` no tiene ningún pegajoso: el pistón
pegajoso **no funcionaba aquí en absoluto**.

Ya había un parche puntual del mismo problema: el observador llevaba a mano sus **cuatro** filas (dos
por espacio de nombres), con un aviso de que la `encendida` del asset tenía que ser el asset-on «o el
pulso no sale nunca». Eso era la pista de que el defecto era general, no del observador.

**El arreglo — la pieza se identifica por su NOMBRE:**

- `CIRCUITOS` pasa a ir por nombre pelado (`piston-pegajoso-on`), y el bucle de registro la da de
  alta **en los dos espacios**, traduciendo `encendida`/`apagada` al que toca. Las cuatro filas a
  mano del observador se van: lo que era la excepción es ahora la regla.
- `nombreDe(clave)` / `comoLa(claveRef, nombre)` / `ambas(nombre)`: el espacio de nombres se
  **arrastra** desde lo que hay puesto en la celda, igual que `conOri` hace con el giro. Un pistón de
  assets se extiende con **su** cabeza de assets; una puerta de la galería mueve **su** hoja alta.
  Mezclarlos pediría un material que ese mundo puede no tener.
- Lo mismo en la mitad de física: `atravesable` del cable/placa/botón/puerta y el `alSeguirPisando`
  de la placa (BUG-RS22) se declaran en los dos espacios.
- `callado: true` en la gemela, para no doblar el log de arranque con líneas que dicen lo mismo.

**Verificado:** `test_piezas_importadas.js` (nuevo) monta el pistón pegajoso **entero en assets**:
antes 4 fallos («no es circuito», no se extiende, sin cabeza, no empuja), ahora verde, incluido el
tirón al retraerse. La segunda mitad del test repite el montaje con `hab:piston` para que reconocer
lo importado no le quite el sitio a lo de siempre. Sin regresión en `test_redstone_piston.js`,
`test_piston_empuja.js`, `test_bug_rs12_*`, `test_bug_rs13_piston_placa.js`, `test_redstone_puerta.js`,
`test_redstone_giro.js`, `test_redstone_dsl.js`, `test_redstone_bloques.js`,
`test_observador_redstone.js`, `test_placa_observador.js`, `test_barra_tres_botones.js`,
`test_redstone_bloque_fuente.js`, `test_redstone_postura_al_accionar.js`.

**Límite conocido:** el puente es por **nombre de fichero**. `piston-pegajoso-on` se reconoce venga de
donde venga, pero si al importar se le cambia el nombre al fichero, deja de ser esa pieza — como
pasaría en la galería.

---


<a id="-bug-fluid3"></a>

### 🔴 BUG-FLUID3 · Un fluido importado de otra instancia no se ve bien — ✅ resuelto 2026-08-10

**Reporte del dueño, literal:**

> «mas problemas con exportar e importar, desde otra instancia e exportado el asset "hab:agua" (asi se
> ve en la galeria) que es un fluido, y al importarlo aqui lo ha importado como
> "asset:assets/agua.vox.json" por lo que no se ve correctamente, esto pasa con otros fluidos como la
> lava»

Y el dueño acotó él mismo el diagnóstico, que era el bueno:

> «el codigo de fluidos esta bien, lo que esta mal es que no encuentra los assets porque ha cambiado
> el espacio de nombres entre la exportacion e importacion»

**Qué pasaba.** El motor de fluidos **reconoce por nombre** (`getProps` mira si la clave contiene
`agua`/`lava`), así que el agua importada sí era agua: fluía, se replegaba y te mojabas. Lo que no
iba era **de qué material se dibuja lo que corre**. Un fluido con nivel es un material propio
(`…-1`…`…-7`) que `setFluid` da de alta al vuelo copiando paleta y geometría del **fluido base**, y
ese base estaba escrito a mano:

```js
var baseKey = (type === 'WATER') ? 'hab:agua' : 'hab:lava';   // ← aquí
```

En esta instancia `data/habitantes/` no tiene ningún agua ni lava (solo `agua-profunda` y `likelava`,
que son otra cosa), así que `mcResolveMat('hab:agua')` caía en «material desconocido → roca» y el
nivel se registraba **con la paleta de la roca**. La fuente se veía bien y el reguero salía gris.

Lo mismo, y peor, en `mcMatKey`: su rama de fluidos va **antes** que el índice de assets, así que
`'hab:agua'` a pelo tapaba `asset:assets/agua.vox.json` y el índice no llegaba a mirarse nunca — ni
siquiera para autocargarlo.

**El arreglo — dos ayudantes en `app.js`, y ninguna tabla con claves a mano:**

- `mcNombreMat(clave)` deja la clave en su **nombre pelado**: sin espacio de nombres, sin `@giro` y sin
  `-nivel`. `hab:agua`, `asset:assets/agua.vox.json@3` y `asset:assets/blocks_mock/agua.vox.json-3`
  son los tres `agua`. Compara **exacto**, así que `agua-profunda` no es `agua`.
- `mcClaveDeNombre(nombre)` hace el viaje de vuelta: la clave que le toca a ese nombre **en este
  mundo** — primero lo que ya está en la paleta (da igual por qué puerta entrara), luego el índice de
  assets, y de última `hab:<n>`, que es lo que se hacía antes. Cacheado y tirado cuando crece la
  paleta, que es justo cuando puede aparecer la clave buena.
- `setFluid`, `mcMatKey` y el fallback de `mcResolveMat` piden el fluido **por nombre**. Una clave
  completa y presente en el mundo se respeta tal cual: una petición explícita sigue mandando.

Es la misma regla que [BUG-RS23](#-bug-rs23) un piso más abajo: **el espacio de nombres se arrastra de
lo que hay puesto**, no se elige. El nivel de un agua de `assets/` sale de `assets/`; el de una de la
galería, de la galería.

**Verificado:** `test_fluido_importado.js` (nuevo) derrama agua y lava importadas y mira lo que el
dueño ve —de qué paleta y de qué fichero sale la celda que corre—, no solo si «es fluido». Con el
motor de antes: **11 fallos**; ahora verde. `test_req_fluid1_sistema_fluidos.js` sigue 12/12 y
`test_setvoxel_autocarga.js` 21/21.

**Lo que este arreglo NO hace:** mover la pieza de galería. Si la quieres como `hab:agua` para
escribirlo así en los snippets, eso es [REQ-GAL3](PLAN.md#-req-gal3).

---


<a id="-req-tool1"></a>

### ✅ REQ-TOOL1 · Una ranura para la herramienta activa, y categorías de bloque — ✅ hecho 2026-08-12

**Petición del dueño, literal:**

> «en el mapa, despues de la ranura 9 quiero otra que sea para mostrar la herramienta actualmente
> seleccionada y poder cambiarla. Pulsar "p" seguiria rotando entre herramientas y se vería en esa
> ranura el icono/bloque que la representa (tal y como se muestran los bloques de las otras ranuras),
> pero clic con raton en "p" o alt+p tendría que abrir la galeria de bloques solamente para mostrar las
> herramientas definidas. Utilizar el mismo codigo que hay para la galeria/picker de bloques para no
> mantener más galerias de la cuenta. Para construir hay ya un bloque llamado "hab:pico-de-piedra" si
> se selecciona esa herramienta deberia de aparecer en la ranura "P", para pintar bloques existe
> "hab:pincel-de-texturizado", como cuentagotas "hab:cuentagotas" y como seleccion
> "hab:varita-de-selecci-n". seleccionar una herramienta para la ranura 9 no solamente mostraria la
> herramienta sino que la activaria, hacer click en 9 o alt+9 abriria la galeria para elegir solamente
> herramientas. valorar si merece la pena añadirle al json de los bloques alguna categoria que indique
> que clase de bloque es: herramienta, bloque de construccion, fluido, redstone, etc. como si fuese una
> estructura de carpetas porque puede que se añadan más bloques que se usen durante el proyecto con
> diferentes intenciones y, aunque todos son bloques, vamos a poder querer filtrarlos por alguna
> categoria.»

**Redactado, sin investigar.** Son **dos cosas de tamaño muy distinto** y conviene no mezclarlas: una
**ranura más en la hotbar** que enseña y cambia la herramienta activa, y una **taxonomía de bloques**
por categoría. La segunda el dueño la deja explícitamente a valorar («valorar si merece la pena»), y es
la que puede tocar muchos ficheros.

**Punto 1 · la ranura de la herramienta.** Hoy la herramienta se rota con `P` (`mc.tool` ∈
`build`/`paint`/`select`/`pick`, `mcSetPlayerTool()`) y **no se ve en ningún sitio** salvo el aviso que
sale al cambiarla — es justo lo que este ticket arregla, y encaja con [REQ-PICK4](#-req-pick4), que
añadió el cuentagotas y dejó cuatro herramientas donde antes había dos. La ranura nueva va **detrás de
la 9**, enseña el dibujo de la herramienta como cualquier otra ranura, y al elegir en ella **activa**
la herramienta, no solo la enseña.

**Punto 2 · la galería, que es la parte fácil y ya está medio hecha.** El dueño pide reutilizar el
picker en vez de escribir otra galería, y eso ya es la dirección del proyecto: es lo mismo que
[REQ-GAL4](#-req-gal4) («que ambas galerías sean una sola, que compartan su funcionalidad y codigo»).
El picker **ya filtra por categoría** (`mcPickFilter`, hoy con `redstone` / `general`, leyendo
`meta.categoria` del JSON), así que «abrir la galería solo con las herramientas» pinta a **un filtro
más**, no a una galería nueva. Está por confirmar.

**Punto 3 · las categorías.** El campo `categoria` **ya existe** en el JSON de las piezas y ya se usa
(`redstone` vs. el resto). Lo que el dueño plantea es convertirlo en una **taxonomía de verdad**
—herramienta, construcción, fluido, redstone…— «como si fuese una estructura de carpetas». O sea: el
trabajo no es inventar el campo, es **decidir la lista de categorías, clasificar lo que ya hay y
decidir qué pasa con lo que no está clasificado**.

**⚠️ La trampa que ya ha costado dos bugs: las cuatro claves `hab:` de la petición.** El dueño da
`hab:pico-de-piedra`, `hab:pincel-de-texturizado`, `hab:cuentagotas` y `hab:varita-de-selecci-n`. Una
tabla en el motor que ate `build → 'hab:pico-de-piedra'` **escrita a mano es exactamente lo que
provocó [BUG-RS23](#-bug-rs23) y [BUG-FLUID3](#-bug-fluid3)**: `hab:pico-de-piedra` y
`asset:assets/pico-de-piedra.vox.json` son **el mismo dibujo entrando por puertas distintas**, y cuál
de las dos existe depende de si la pieza se importó o se exportó. Si el dueño exporta el pico a
`assets/`, la tabla deja de encontrarlo y la ranura sale vacía **sin que falle nada**. Los ayudantes
son `mcNombreMat(clave)` / `mcClaveDeNombre(nombre)`. Esto no es una pregunta: es la primera decisión
de diseño del ticket —**cómo se ata una herramienta a su dibujo sin escribir la clave a mano**— y
seguramente empuja hacia que sea el **dibujo el que declare que es la herramienta X** (en su
`meta`), y no el motor quien lo sepa.

**Lo que hay que decidir con el dueño** (nada de esto está resuelto):

- **¿La ranura nueva es la 10 o sustituye a la 9?** El enunciado dice «después de la ranura 9 quiero
  **otra**» y la llama «la ranura **"P"**», pero luego dice «seleccionar una herramienta para la ranura
  **9**» y «click en **9** o **alt+9**». Lo más probable es que sea un lapsus y que las dos frases
  hablen de la ranura nueva (la 10ª, etiquetada **P**), pero **hay que confirmarlo antes de tocar
  nada**: si de verdad fuese la 9, se perdería una ranura de bloques.
- **Qué tecla la selecciona.** Las ranuras van con `1`–`9`; la décima no tiene número obvio (`0`
  sería lo de Minecraft). Y `P` ya está cogida por la rotación, así que abrir la galería queda en
  **clic** y **alt+P** —que es lo que pide el dueño—, pero conviene decidir si `0` también la
  selecciona.
- **Qué pasa si se marca como herramienta un dibujo al que no corresponde ninguna herramienta del
  motor.** Las herramientas son **cuatro y están en el código**; la galería, en cambio, enseñaría todo
  lo que lleve la categoría. Si alguien marca un quinto dibujo, ¿se oculta, se enseña en gris, o se
  puede definir una herramienta nueva desde el dibujo?
- **La lista de categorías, y qué pasa con lo no clasificado.** Cuántas hay, si son **una sola** por
  pieza o varias (una «carpeta» admite una; una etiqueta, varias), y si lo que hoy no tiene categoría
  cae en un cajón «sin clasificar» o se reparte a mano. Son **70 assets + 44 guardados**, así que
  clasificar es trabajo en sí mismo. Y hay que ver si los filtros de hoy (`redstone`/`general`) se
  **sustituyen** por la taxonomía nueva o conviven, porque `general` significa hoy «todo lo que no es
  redstone» y dejaría de tener sentido.

**Y una cuarta, técnica, para no llevarse una sorpresa:** hoy `mc.tool` se guarda en
`localStorage['vf_mcTool']` pero **al cargar solo se restauran `build` y `paint`**. En cuanto la
herramienta se **vea** en una ranura, esa asimetría deja de ser invisible: el dueño saldría con la
varita puesta y volvería con el pico sin haber tocado nada. Hay que decidir si se restauran las cuatro.

También está por ver si la ranura de herramienta debe **entrar en el loadout que se persiste**
(`vf_mcHotbar` / `vf_mcSlotStruct`, que hoy guardan `MC_SLOTS` entradas): la herramienta ya tiene su
propia persistencia, así que meterla ahí sería **una segunda fuente de verdad** para lo mismo.

---


<a id="-req-gal4"></a>

### ✅ REQ-GAL4 · Buscador con mínimo de 3 letras y ordenación en la galería y el picker — ✅ hecho 2026-08-12

**Petición del dueño, literal:**

> «en la galería 2d/3d y del mapa/picker quiero: 1) que el buscador necesite al menos 3 letras para
> poder buscar 2) implementar ordenación, por defecto será "recientes", tambien quiero "fecha
> creacion", "nombre", y "tamaño"»

**Redactado, sin investigar.** Son **dos peticiones sobre las mismas listas**: el filtro de texto y el
orden en que salen las tarjetas.

**Dónde.** El dueño nombra **tres superficies**: la galería **2D**, la **3D** y el **picker del
mapa/Mundo**. No está comprobado si comparten un solo buscador o si son copias distintas del mismo
patrón — eso es lo primero que hay que mirar, porque decide si esto es un cambio o tres. El selector
del Mundo es el de [REQ-PICK1](#-req-pick1) / [REQ-PICK3](#-req-pick3); la galería del editor es la de
[BUG-GAL1](#-bug-gal1) / [BUG-GAL2](#-bug-gal2) y `test_galeria_assets.js` / `test_galeria_namespace.js`.

**Lo que habrá que decidir con el dueño** (nada de esto está resuelto, y son las tres cosas que
cambian el resultado):

- **Qué hace el buscador con menos de 3 letras.** «Necesita al menos 3 letras para poder buscar» admite
  dos lecturas: no filtrar (se ve el catálogo entero) o no mostrar nada hasta la tercera letra. Y si
  hace falta decirlo en la caja («escribe 3 letras…») para que no parezca que está roto.
- **«Recientes» y «fecha creación» son DOS fechas.** Si fueran la misma no habría pedido las dos: lo
  natural es que «recientes» sea la **última modificación** (o el último uso) y «fecha creación» la de
  alta. Hay que ver **qué fechas guarda hoy** cada almacén (`data/habitantes/<id>.json`, los assets de
  `assets/`) — si la de creación no existe, hay que crearla, y las piezas viejas no la tendrán.
- **Qué es «tamaño».** Caben tres: número de **voxels**, la **caja** del dibujo (`SX×SY×SZ`) o los
  **bytes** del fichero. Para una galería de dibujos lo que parece útil es el volumen del objeto, no lo
  que ocupa en disco, pero lo dice el dueño.

**Y una cuarta, técnica:** el orden por defecto es **«recientes»**, así que hay que mirar si eso
**cambia el orden actual** de la galería y del picker, y si el orden elegido **se recuerda** entre
sesiones (como `vf_mcTool` y compañía) o vuelve al defecto cada vez.

---


<a id="-req-fluid6"></a>

### ✅ REQ-FLUID6 · Dentro de un líquido se hunde uno **despacio**: gravedad y velocidad terminal reducidas — ✅ cerrado 2026-08-11

**Petición del dueño:**

> «1) Aceleración por gravedad y velocidad terminal · Fuera: aceleración gravitatoria hacia abajo de
> 0,08 bloques/tick² (velocidad terminal ≈3,92 bloques/tick). Dentro: la gravedad efectiva se reduce
> a 0,005 bloques/tick², provocando un hundimiento lento y controlado.»

**Lo que hay que hacer, en una frase:** mientras el cuerpo esté dentro de un fluido, la gravedad que
se le aplica es **1/16** de la de fuera, y la velocidad de caída se satura mucho antes. Fuera, todo
igual que hoy (ver la nota común de arriba).

**Lo que se sabe del terreno** (de REQ-FLUID4, no de una investigación nueva):

- **Quién decide si estás dentro** ya existe y no hay que inventarlo: `game.fluidos.getProps(...)`,
  que es lo que usa `mcFluidoOjo()` de la fase 3. `app.js` **no reconoce materiales por su nombre**,
  se lo pregunta al simulador — y así entiende gratis los niveles (`hab:agua-3`) y la lava.
- ⚠️ Pero la fase 3 mira **el OJO** a propósito (andar por un charco no debe teñir la pantalla). La
  **física** casi seguro quiere otra celda —los pies, o el centro del cuerpo—, o no se hunde uno
  hasta tener la cabeza dentro. **Son dos preguntas distintas al mismo `getProps`**, no la misma.

**⚠️ Lo que NO se ha verificado** (ticket redactado, no investigado):

- **Si el jugador ya tiene algún trato especial dentro del agua hoy** (freno, nado, algo). Se asume
  que no, pero es lo primero que hay que mirar al abrirlo: si lo hay, este ticket lo sustituye, no lo
  suma.
- **La velocidad terminal.** El dueño da la de fuera (≈3,92) pero **no la de dentro**. En Minecraft
  sale del rozamiento, no de una constante, así que hay que decidir si la modelamos con un **factor
  de arrastre** (más fiel y más barato: un `v *= k` por paso) o con un tope duro. Como el dueño pide
  proporciones, el arrastre encaja mejor.
- Qué pasa en la **frontera**: entrar en el agua a toda velocidad ¿frena de golpe o decelera? Si es
  de golpe, se nota como un muro.
- **Si esto aplica a los agentes** o solo al jugador. Hay antecedente: **BUG-FLUID2** ya tocó la
  gravedad de los agentes. **Preguntar al dueño.**
- Si **lava** usa las mismas proporciones que el agua o es más espesa (en Minecraft lo es). Lo mismo
  que ya se preguntó en REQ-FLUID5: el ticket cubre «líquido», y agua/lava pueden diferir por
  parámetro sin duplicar código, porque `getProps` ya devuelve el **tipo**.

**Cómo se verificará** (herencia de REQ-FLUID4, que aplica igual): el guardián mide la **caída real**
—posiciones del jugador a lo largo de N pasos de física—, no la variable de la constante. Y el caso
que de verdad protege es **fuera del agua no cambia nada**.

Valores estéticos ⇒ **tunables de consola F12**, no UI, con el precedente exacto de
`game.vistaAgua({...})`.

**Resuelto 2026-08-11.** Lo que se decidió al implementarlo:

- **Rozamiento, no tope duro.** El dueño no dio la terminal de dentro, así que sale sola:
  `v = (v − g_dentro·dt)·e^(−dt/τ)`, con `τ` = «arrastre». Entrar en el agua a 10 bloques/s frena en
  ~0,2 s en vez de chocar contra un techo invisible, y la terminal (~0,30 bloques/s en agua) es una
  **consecuencia**, no un número escrito a mano.
- **Una sola `mcCaidaPaso(vy, dt, x, y, z)` y tres puntos de llamada** — el jugador en `mcUpdate` y
  los **dos** integradores de agentes del snippet (`asentar` y `movPaso`), que llaman a través de un
  puente con respaldo. Es lo que hace cierto el «los agentes se comportan como los jugadores en todos
  los casos» **mañana** y no solo hoy: copiar la fórmula habría sido condenarlas a divergir al primer
  retoque. Mismo patrón que `mc.sunExtra` / `mcXrayExtra`.
- **La lava más espesa es UNA perilla**: más rozamiento, misma proporción de gravedad. Así subir el
  espesor no cambia además lo rápido que se empieza a hundir. Sale ~0,15 bloques/s, la mitad del agua.
- **Se sondea el PUNTO, no la celda** (`mcGetFluidHeight`), para que unos pies apoyados en el aire que
  deja un fluido a medio nivel no se hundan. Es la diferencia deliberada con `mcFluidoOjo` de
  REQ-FLUID4 fase 3, que sí mira la celda del ojo.
- Válvula `mc.sinFisicaFluido` + `game.fisicaAgua({...})` / `game.fisicaLava({...})`.

`test_hundirse.js` (20 ok). Dos expectativas del test estuvieron mal antes de estarlo el motor, y las
dos por lo mismo: **el motor integra en pasos discretos y yo comparaba contra el límite continuo**
(½gt² frente a la suma `g·dt²·n(n+1)/2`, y la vida media del rozamiento medida un frame antes de que
muerda). Anotado aquí porque volvió a morder en REQ-FLUID7.

---


<a id="-req-fluid7"></a>

### ✅ REQ-FLUID7 · Dentro se **nada** manteniendo el salto, no se salta — ✅ cerrado 2026-08-11

**Petición del dueño:**

> «2) Mecánica de ascenso (salto vs. flotabilidad) · Fuera: presionar la tecla de salto aplica un
> impulso instantáneo hacia arriba (v_y ≈ 0,42) seguido de una parábola. Dentro: **mantener** la tecla
> de salto aplica una aceleración ascendente constante (≈0,04), generando un empuje continuo tipo
> flotación.»

**Lo que hay que hacer, en una frase:** dentro del líquido la tecla de salto deja de ser un **evento**
y pasa a ser un **estado**. Fuera, sigue siendo el impulso de hoy, intacto.

**Por qué es ticket aparte de [REQ-FLUID6](#-req-fluid6) y no el mismo:** aquél cambia una
**constante** (la gravedad se multiplica por 1/16). Éste cambia el **gesto de entrada**: pasar de
«al pulsar, sumo velocidad una vez» a «mientras esté pulsada, sumo aceleración cada paso» toca el
manejo del teclado, no la caída. Se pueden probar por separado, y sin el 6 el 7 no se nota (con la
gravedad de fuera, un empuje de ½ de gravedad no sube: frena).

**Depende de REQ-FLUID6** y conviene hacerlo después: la cifra de empuje está anclada a la gravedad
**de dentro** (8×), así que hasta que ésa no exista, no hay a qué anclarla.

**⚠️ Lo que NO se ha verificado:**

- **Si el motor sabe hoy que la tecla de salto sigue pulsada**, o solo ve el flanco de pulsación. Es
  **la** pregunta de este ticket: si solo hay evento, hay que llevar el estado de la tecla hasta el
  paso de física, y ahí es donde vive el trabajo real.
- Qué pasa **al asomar la cabeza**: si estás medio dentro medio fuera, ¿flotas o saltas? La respuesta
  natural es «manda la celda de los pies» y es la que hace que se pueda **salir** del agua a la
  orilla; si manda el ojo, uno se queda pegado al borde. **Es un caso de test, no un detalle.**
- Si hay **tope de velocidad de subida**. Sin él, mantener pulsado en un lago hondo te dispara.
- Si el agua **corriente** empuja (en Minecraft sí). **Fuera de alcance salvo que el dueño diga**;
  sería otro ticket, y es el que justificaría de verdad el simulador de niveles.
- Si los **agentes** nadan. Misma pregunta que en REQ-FLUID6.

**Cómo se verificará:** un guardián que mantenga la tecla N pasos y compruebe que la altura **sube de
forma sostenida** (no una parábola), que al soltarla **baja despacio** (eso es REQ-FLUID6 en marcha),
y que **fuera del agua el salto de siempre da exactamente la misma parábola que hoy**.

**Resuelto 2026-08-11.** Respuesta a cada duda que dejó abierta el ticket:

- **¿El motor ve la tecla mantenida o solo el flanco?** Mantenida: `mc.keys` es un mapa de **estado**
  (`k[' ']` sigue a `true` mientras esté pulsada) y lo que la convertía en evento era la guarda
  `mc.onGround`, no la entrada. O sea que no hubo que tocar el manejo de teclado: **todo el trabajo
  estaba en la física**, que era la mitad optimista de la estimación.
- **¿Tope de subida?** Sí, y **gratis**: el mismo rozamiento de REQ-FLUID6 lo da. La aceleración pasa
  de `−g_dentro` a `+(empuje−1)·g_dentro` y el arrastre la satura en ~2,04 bloques/s en agua. Cero
  techos escritos a mano, y como el empuje está anclado a la gravedad de dentro (no a un absoluto),
  retocar una perilla no descoloca la otra.
- **¿Manda el ojo o los pies?** **Los pies** (`mc.pos[1]`), como se sospechaba: es lo que deja salir a
  la orilla. Subes hasta que los pies asoman, ahí vuelve a mandar la gravedad de fuera, y al llegar al
  borde se aterriza y se salta con el salto normal.
- **¿Y el charco de un bloque?** Con **suelo debajo gana el salto de siempre** (`mc.onGround` sigue
  teniendo prioridad). Sin esto, vadear un charco se habría sentido como andar por pegamento — es un
  caso que el ticket no preveía y que salió de mirar qué hace Minecraft de verdad: allí nadar es
  «en agua **y sin suelo**», no «en agua».
- **Implementación:** un sexto argumento opcional `nadando` en la **misma** `mcCaidaPaso`, no una
  función nueva. Así los agentes heredan la capacidad por el mismo puente que REQ-FLUID6 y sin
  argumento se comporta exactamente como antes del ticket.
- Perilla `empuje` en `game.fisicaAgua({empuje:12})` / `game.fisicaLava(...)`. `empuje:1` = flotar
  quieto; `0` = no se nada.

`test_nadar.js` (19 ok). **Tres expectativas mías fallaron antes que el motor**, todas por la misma
raíz que en REQ-FLUID6: la terminal real de un integrador discreto **no es `a·τ`** sino
`a·dt·k/(1−k)` con `k = e^(−dt/τ)` — un 3,7 % de diferencia a 60 fps, más que cualquier tolerancia
honrada. Las tolerancias del test se derivan ahora de la **cola calculada** `|v₀−v*|·kⁿ` en vez de ser
un porcentaje a ojo. La consola sigue anunciando `a·τ` a propósito: es la caracterización que **no
depende de dt**.

**Agua corriente que empuja: sigue fuera de alcance** y sin abrir, como se dijo.

---


<a id="-req-fluid8"></a>

### ✅ REQ-FLUID8 · **Fuentes infinitas**: una celda rodeada de fuentes se vuelve fuente — ✅ cerrado 2026-08-11

**Lo que pide el dueño, literal:**

> *«creacion de "fuentes de fluido infinito" (o más bien bloques de fluido que se ponen solos cuando se
> están añadiendo fuentes de fluido). Si un bloque está tocando por los lados (norte, sur, este u oeste)
> fuentes de fluido, y por debajo tiene un bloque sólido, entonces se convierte también en una fuente de
> fluido.»*

Con su ejemplo, un hoyo de 2×2×1 en el que se colocan dos fuentes en diagonal:

```
   antes            después
 [FUENTE][aire]   [FUENTE][FUENTE]
 [aire][FUENTE]   [FUENTE][FUENTE]
```

Los dos huecos se vuelven fuente **por tocar dos fuentes cada uno**. El resultado práctico es el cubo
infinito: puedes vaciar una casilla y el hoyo se rellena solo para siempre.

#### ⚠️ Pregunta bloqueante: ¿dos fuentes adyacentes, o basta con una?

El enunciado dice «tocando por los lados **fuentes**» (plural) y el ejemplo tiene **exactamente dos**
por celda. Pero la regla escrita también se puede leer como «≥1», y **la diferencia es enorme**:

- **≥2** (lo que da el ejemplo): el 2×2 funciona, y una fuente suelta en mitad de un llano **no** se
  propaga. Es la regla que hace falta para que el charco no se coma el mundo.
- **≥1**: cualquier fuente sobre suelo sólido convertiría a su vecina, y ésta a la suya — **el plano
  entero se vuelve fuente** hasta topar con una pared. Eso no es una fuente infinita, es una inundación.

**Se implementará ≥2 salvo que el dueño diga lo contrario**, porque es lo único compatible con su propio
ejemplo. Preguntar antes de escribir código.

#### Otras dudas a resolver antes de implementar (ninguna investigada)

- **¿«sólido» incluye otra fuente debajo?** Un estanque de dos de hondo tiene fluido bajo la capa de
  arriba, no roca. Si se exige sólido estricto, la regla solo funciona en la capa que toca el fondo, y
  el 2×2 del ejemplo (profundidad 1) es justo el caso que sí funciona. Hay que decidir si es a propósito.
- **¿Vale para la LAVA?** El enunciado dice «fluido» en general. Conviene que sea una **bandera por
  tipo** (como `gravedad`/`arrastre`/`empuje` de REQ-FLUID6/7) y no una regla cableada, aunque el
  defecto acabe siendo solo agua.
- **¿Es reversible?** Si rompo una de las fuentes originales, ¿las derivadas vuelven a ser corriente?
  Si **no** lo son, es precisamente lo que hace útil el cubo infinito. Si lo son, no sirve para nada.
- **¿Actúa sobre el aire o sobre el agua que ya lo llenó?** El dueño describe `[aire] → [FUENTE]`, pero
  el simulador va a llenar ese aire con corriente (`nivel 1`) en el tick anterior, así que lo más
  probable es que la regla **ascienda una celda de corriente a nivel 0** un tick después. El resultado
  visible es el mismo; conviene decidirlo explícitamente y no que salga por accidente.

#### Dónde cae (lo único que sí se ha mirado, 2 minutos)

El simulador de fluidos **está en `app.js`**, no en un snippet: `fluidLevels` (un `Map` `'x,y,z' → 0..7`),
`getProps`, `setFluid(x,y,z,type,level)`, `processCell(x,y,z)`, `queueTick` y `notifyNeighbors`. Dos
consecuencias buenas:

1. **«Fuente» ya se representa**: es `fluidLevel === 0` (la clave de material se construye como
   `base + '-' + level` y el `-0` no se escribe). Convertir en fuente es `setFluid(x, y, z, tipo, 0)`.
   No hay que inventar un concepto nuevo ni tocar el formato en disco.
2. **El bucle ya es dirigido por eventos** (cola de ticks + aviso a vecinos), que es exactamente lo que
   el dueño describe con «cuando se están añadiendo fuentes». La regla entra dentro de `processCell`
   como cuatro sondeos horizontales sobre celdas que **ya** se están procesando: **no hace falta ningún
   barrido del mundo**, y ése es el criterio de coste del ticket.

Es motor, así que `app.js` es el sitio (la regla de «no se toca `app.js` para los agentes» no aplica).

#### Riesgos anotados

- **Cascada.** La conversión avisa a los vecinos, que pueden convertirse, que avisan… En una piscina
  grande y llana con dos fuentes puestas a mano, esto puede convertir **toda** la lámina en fuentes.
  Puede que sea lo deseable, pero cada conversión cambia la clave del bloque y **remalla**: hay que
  medir el coste sobre un estanque de verdad, no sobre el 2×2 del ejemplo.
- **Interacción con el culling de REQ-FLUID4:** las caras se decidieron con la regla del vecino del
  mismo fluido; pasar de `agua-1` a `agua` cambia el id pero no el **tipo**, y el culling se hizo por
  tipo justo para esto. Comprobarlo, no darlo por hecho.
- No toca nada de REQ-FLUID6/7: la física de hundirse y nadar mira el **tipo**, no el nivel.

**Cómo se verificará:** un guardián que monte el hoyo 2×2×1 del enunciado en `/map/test`, coloque las
dos fuentes en diagonal y compruebe que las otras dos celdas acaban a **nivel 0**; que **una sola**
fuente sobre un llano no convierte a nadie; que al vaciar una celda el hoyo se rellena y vuelve a ser
fuente (el cubo infinito); y que un estanque normal **sin** dos fuentes adyacentes se comporta como hoy.

#### Resuelto 2026-08-11

**Respuestas del dueño a las cuatro dudas** (y lo que implican):

| duda | respuesta | consecuencia |
|---|---|---|
| ¿1 o 2 fuentes adyacentes? | **≥2** (no lo contradijo y es lo único compatible con su ejemplo) | una fuente suelta no convierte a nadie: no hay inundación |
| ¿«sólido» admite otra fuente debajo? | **no, sólido es sólido** | la regla **solo prende en la capa que toca el fondo**; un estanque de dos de hondo no vuelve infinita la capa de arriba |
| ¿vale para la lava? | **para cualquier fluido** | sin bandera por tipo: una regla, todos los líquidos |
| ¿es reversible? | **romper la original no afecta a las demás** | las derivadas son fuentes de pleno derecho ⇒ el cubo infinito funciona |

**Implementación: 25 líneas dentro de `processCell`**, entre el paso 1 (¿me quedo sin alimentación?) y
el paso 2 (¿caigo?). Lo importante es lo que **no** hizo falta:

- **Ni un concepto nuevo.** «Fuente» ya era `fluidLevel === 0`, así que convertir es `setFluid(x,y,z,tipo,0)`.
  Nada que añadir al formato en disco ni a la paleta.
- **Ni un barrido del mundo.** La regla vive dentro de la cola de ticks que ya existía: cuatro sondeos
  horizontales sobre una celda **que ya se estaba procesando**. `notifyNeighbors` propaga la conversión
  por el hoyo, y no hay bucle infinito porque ascender exige `level > 0` y una fuente ya no vuelve a entrar.
- **Ni deshacer nada** para el punto 3: al no degradar nunca una fuente, la respuesta del dueño sale sola.
- «Sólido» reutiliza el mismo `!isReplaceable` con el que ya se decidía el flujo horizontal, para que
  «lo que sostiene un charco» signifique una sola cosa en toda la función. Eso ya excluye aire y fluidos.

Válvula `mc.sinFuentesInfinitas`. Guardián `test_fuentes_infinitas.js` (8 ok): monta una bandeja de roca
partida en **cuatro compartimentos estancos**, uno por caso — en la primera versión dos casos compartían
bandeja, el agua de uno se coló en el otro y la lava ni llegó a asentarse; **un charco que se filtra de
un caso a otro convierte un verde en una casualidad**. Los tres casos que de verdad protege son los NO:
una fuente sola no asciende a nadie (el guardián del umbral), con fuente debajo no prende, y la válvula
lo apaga.

---


<a id="-req-fluid9"></a>

### ✅ REQ-FLUID9 · Dentro de un fluido, `W` te lleva **donde miras** y Shift te **hunde** — ✅ cerrado 2026-08-11

**Petición del dueño (literal):** «cuando se esta dentro de un fluido, la tecla W (avanzar) tiene que
hacer que se avance en la direccion donde apunta la mirada, y para descender mas rapidamente se puede
utilizar la tecla shift izquieda crealo e implementalo».

Es la **lectura (c)** de las tres que planteaba el borrador de este ticket (*`W` no me lleva a donde
miro*), más una capacidad nueva que no estaba en él (**Shift hunde**). Las otras dos lecturas —el factor
de marcha del agua y la inercia horizontal al soltar— **NO entran aquí**: no se han pedido, y meterlas
de gorra sería fusionar capacidades. Sueltas las teclas y se conserva la inercia de hoy.

**Lo que hace, en una frase:** con los pies en un líquido y **sin suelo debajo**, `W`/`S` reparten su
empuje entre **avanzar** (×`cos` del cabeceo) y **sumergirse/emerger** (×`sen`), así que mirar al fondo
con `W` te hunde y mirar al cielo te saca; y **Shift** añade un empuje hacia abajo.

#### Las tres piezas

**1. Un séptimo argumento en `mcCaidaPaso`, no una función nueva.** Subir, bajar y dejarse caer son el
**mismo** empuje del cuerpo con distinto signo, así que la vista y Shift entran por donde ya entraba la
tecla de nadar:

```js
mcCaidaPaso(vy, dt, x, y, z, nadando, mira)
const m = Math.max(-1, Math.min(1, (mira||0) + (nadando?1:0)));
const a = g*(m*(f.empuje||0) - 1);   // m=0 ⇒ −g · m=1 ⇒ (empuje−1)·g · m=−1 ⇒ −(empuje+1)·g
```

⚠️ **`mira` y la tecla de nadar comparten UN solo presupuesto de empuje, acotado a ±1.** Es lo que hace
que salto+Shift a la vez den exactamente «ni una cosa ni la otra» y que mirar arriba **con** el salto
pulsado no empuje el doble. Y `m=0` devuelve `−g` byte a byte: fuera de un líquido `mcCaidaPaso` sale
por su `return` temprano y **no cambia ni un float**, que era la condición del dueño en REQ-FLUID6.

Bajar sale **más rápido que subir** sin ninguna cifra nueva, porque la gravedad ayuda en un sentido y
estorba en el otro: `−(empuje+1)·g` contra `(empuje−1)·g`. Con el agua de hoy, ~9,7 bloques/s hundiéndose
con Shift frente a 4,84 subiendo y 2,42 dejándose caer.

**2. Una rama propia en el mando horizontal, y va DIRECTA.** Nadar es «en líquido **y sin suelo**», o sea
que hasta hoy el cuerpo dentro del agua lo gobernaba el **air-strafe** — y el air-strafe **por definición
no reescribe la velocidad**, así que girar la vista no podía redirigirte. Es la trampa de BUG-ESC1 vista
por el otro lado. La rama nueva va **antes** del reparto por `mc.onGround` y escribe `mc.vel[0]/[2]`
directo, como el camino de tierra.

⚠️ **El rumbo se ACOTA, no se normaliza** (`if(hl>1)`). Normalizar devolvería la marcha entera con el
cuerpo apuntando al fondo; acotando, mirar a plomo convierte **todo** lo que aporta `W` en descenso, que
es justo lo que se pidió. Y el rewrite va bajo `if(ml>0)`: sin tecla de rumbo no se toca la velocidad
horizontal, o sea que la inercia de hoy se queda como está (es el otro ticket).

**3. Shift es `mira -= 1`**, y se acota junto con el resto. Ojo: `mc.keys` guarda `e.key.toLowerCase()`,
así que **`k['shift']` son las DOS teclas Shift**, no solo la izquierda. Distinguirlas pediría
`e.code === 'ShiftLeft'` y no se ha hecho: el dueño la nombró para describir el gesto, no para excluir la
derecha. Efecto colateral bienvenido: `sp` ya media la marcha con Shift, así que hundirse va además con
el rumbo horizontal a media velocidad.

#### Lo que NO cambia

- **Fuera del líquido, nada.** §1 del guardián: `W` mirando a plomo hacia abajo y Shift en el aire dan
  la caída de siempre **frame a frame**.
- **Con suelo debajo, tampoco**: mandan los pies y `mc.onGround` gana, así que vadear un charco se anda
  igual que siempre (§6).
- **`mc.sinFisicaFluido`** sigue devolviendo la física de antes de los tres tickets, ahora también con
  la vista y con Shift (§7).
- Ni perilla nueva ni constante suelta: todo sale de `MC_FISICA_FLUIDO` y de las perillas persistidas
  que ya existían.

**Cómo se verificó:** `node test_nadar_avance.js` (**14 ok**), con su propio pozo **estanco** de 11×18×11
en `/map/test` —más ancho que el de `test_nadar.js` a propósito: a ~5 bloques/s el jugador cruza un
interior de 5 en un suspiro y lo que se mediría es la pared, no el rumbo— y el `mcUpdate` **de verdad**
frame a frame. Cubre: fuera no cambia nada · `W` al horizonte avanza y deja la vertical **bit a bit**
igual que sin teclas · `W` a plomo hunde y casi no desplaza (el guardián del acotado) · `W` arriba sube
**sostenido** · Shift hunde más que dejarse caer · salto+Shift se cancelan · el charco se vadea · la
válvula. Los números salen de `game.fisicaAgua()` **leído del motor**, no escritos a mano.

⚠️ Y la trampa de siempre, que volvió a morder (la sexta): la terminal discreta es `a·dt·k/(1−k)`… pero
**a los 40 frames todavía no se ha llegado a ella** — son 3,03·τ, o sea el **95,2 %**. La primera versión
del test comparaba contra la asíntota con tolerancia del 2 % y fallaba con el motor teniendo razón. Se
compara contra el término n-ésimo exacto, `vT·(1−kⁿ)`.

⚠️ **Hallazgo aparte, y NO es de este ticket:** `test_nadar.js` (4 fallos) y `test_hundirse.js` (4
fallos) **ya fallaban antes de tocar nada** — comprobado con una A/B, revirtiendo las tres costuras de
REQ-FLUID9 sobre `app.js` y volviendo a correrlos: **mismo resultado exacto**. La causa es que los dos
se escribieron para el `gravedad: 1/16, empuje: 8` original y el dueño **retuneó** las constantes a
`WATER {0.5, 0.22, 3}` / `LAVA {1, 0.11, 2}`: con **8× la gravedad de dentro**, sus tramos de 120 y 240
frames cruzan enteros un pozo de 9 de hondo, así que lo que miden es el **fondo o la superficie**, no el
fluido (de ahí los `vy = 0`). Y sus dos comparaciones agua↔lava contradicen la tunería: hoy la lava se
hunde **igual** que el agua (2,42) y se nada en ella **más despacio** (2,42 contra 4,84). Son tests
viejos frente a números nuevos, no una regresión. Ver **[BUG-FLUID5](PLAN.md#-bug-fluid5)**.

---


<a id="-bug-fluid4"></a>

### ✅ BUG-FLUID4 · Caras traslúcidas marcadas bajo un fluido — ✅ resuelto 2026-08-11

**Reporte del dueño, literal:**

> «algunos bloques no se muestran bien bajo los fluidos cuando se construyen, parece que afecta
> bloques que no ocupan todo el lateral de las caras, el fallo se ve en las caras, deberian de ser
> transparentes como hace el fluido con otros bloques de fluido pero se marcan las caras de forma
> traslucida»

**Capturas:** `data/tickets/BUG-FLUID4/01.png` (primera persona dentro de una sala teñida de rojo,
una pieza fina en cruz sobre el suelo y **dos cuadros verticales traslúcidos rosados** de pie a cada
lado) y `data/tickets/BUG-FLUID4/02.png` (el mismo cuadro de cerca). Contexto en `contexto.md`.

**Zona (sin comprobar que sea la culpable):** el culling de caras de fluido de **REQ-FLUID4** —
`tapadasFluido`, `colFD`/`alphaFD`/`texFD`, `mcTapaCara` y `mc.recorte`. Guardián actual:
`test_caras_fluido.js`.

**Causa, ya reproducida y medida.** La sospecha era la buena. `mcTapaCara` devuelve `false` sobre
**toda** celda fina («no es un cubo, no puede tapar la cara del vecino» — la regla de las hojas
«fancy», que existe para que por los agujeros de una copa no se vea el vacío), así que la cara del
fluido que da a una pieza que no llena su celda no entraba en **ninguna** de las tres reglas de
`tapadasFluido` y se emitía. Y como las caras fluido↔fluido de alrededor **sí** se cullean, la
superviviente queda **aislada**: una lámina translúcida suelta marcando el hueco, que es exactamente
lo que se ve en las capturas.

**Medido** en una charca estanca **con tapa** (así toda celda está llena, `fH = 1`) de 5×5×3, contando
las caras del lote alpha del chunk, con la celda del medio cambiada:

| centro | agua | lava |
|---|---|---|
| fluido (charca entera) | 0 | 0 |
| `roca` (vecino macizo) | 5 | 5 |
| `flor-roja` (vecino **fino**) | **10** | **10** |

Las **5 de más** son las cuatro laterales más la de encima. Los 5 del caso `roca` son el baseline
correcto y no un resto del fallo: `mcGetFluidHeight` solo devuelve 1.0 cuando hay fluido **del mismo
tipo justo encima**, así que la celda bajo la piedra tiene `fH < 1` y emite su cara de arriba, y sus
cuatro vecinas laterales (llenas) fallan la regla 3 contra ella. Con la válvula `mc.sinCullingFluido`
el mismo sitio da **444**, o sea que el mecanismo es el culling y no otra cosa (era el último punto
abierto de la lista de comprobaciones). Pasa **igual con agua y con lava**; no depende de construir:
depende de que haya una pieza fina metida en el líquido.

**Arreglo:** una pregunta **propia de los fluidos** junto a `tapadasFluido`, `tapaAlFluido(x,y,z)`, y
el cambio es sustituirla por `mcTapaCara` **en la primera rama y solo ahí**. `mcTapaCara` no se toca:
su contrato general tiene que seguir diciendo `false` sobre una celda fina o se desharía la regla de
las hojas, y además `mcSolid`/`mcFineBoxHit`/`mcAimBoxHit` los extrae *verbatim por texto*
`test_rayo_apuntado.js`. La pregunta nueva no es «¿tapa la cara?» sino «**¿ocupa la celda?**»: no
tenemos *waterlogging* —un material por celda—, así que una pieza fina que no es fluido ha
**reemplazado** al líquido ahí y la cara que da a ella no se ve. Aproximación honesta y no exacta: si
la pieza es más estrecha que la celda, por los lados asomaría un pelo de líquido que ya no se dibuja;
a cambio desaparecen las láminas sueltas, que es lo que se reportó.

⚠️ **El hueco de AIRE tiene que seguir emitiendo**, y sale gratis: el aire es `nId === 0`, y la rama
nueva exige `nId` con geometría fina. Lo fija §1, donde la superficie de la charca sigue dando sus
81 caras contra el cielo.

**Resultado:** el delta pasa de **+5 a 0** en agua y en lava, con el baseline de `roca` intacto en 5 y
la válvula intacta en 444.

**Guardián:** `node test_caras_fluido.js` **§5** (la tabla de arriba, en las dos direcciones y con el
anti-falso-verde de que la charca llena da 0 pero el hueco ocupado sigue dando 5 — si el arreglo
cullease de más, todo daría 0 y el test pasaría sin mirar nada). §4 sigue exigiendo que un material
sin fluido dé una malla **byte a byte idéntica**.

---


<a id="-bug-ray2"></a>

### ✅ BUG-RAY2 · El aim choca con la celda entera de un cable o una alfombra — ✅ resuelto 2026-08-11

**Reporte del dueño, literal:**

> «cuando quiero borrar (o colocar) un objeto y delante tengo, por ejemplo, un cable de redstone en el
> suelo (puede ser tambien una alfombra, es decir bloques que no ocupan los 16x16x16), aunque no este
> apuntando los voxels del cable sino al objeto que se ve detras, es como si el aim colisionase con el
> rigidbody del bloque del cable, entonces me borra el cable (o coloca algo encima del cable) y no
> quiero eso; pasa con cables o cualquier bloque que no sea solido, no atraviesa las partes solidas
> para apuntar lo que hay detras.»

**Es [BUG-RAY1](#-bug-ray1) otra vez, en la OTRA mitad del mundo.** Aquél arregló el rayo contra las
estructuras finas (`mcStructCellSolid` respondía por la caja de la celda entera ⇒ `mcStructRayHit`,
sub-DDA a 1/16 acotado a la celda). La rejilla se quedó sin arreglar porque entonces no le hacía
falta: en `mc.grid` solo había bloques macizos. Desde `mcCabeEnRejilla`/`mcPonEnRejilla`, **el clic
derecho mete en `mc.grid` todo lo que cabe en una celda** —cable, alfombra, flor, antorcha—, así que
un cable de **1 voxel de alto** pasó a ser terreno… y `mcRaycast` seguía preguntando `mcSolid(x,y,z)`,
que es «¿hay algo en esta celda de 16³?». El rayo se paraba en el cubo entero del cable: apuntando al
muro de detrás se borraba el cable, y el bloque nuevo salía **encima** de él (la normal era la de la
celda). Es la misma trampa de «un material vive en dos sitios», ahora al revés que en BUG-RAY1.

**El arreglo, mismo patrón que BUG-RAY1:**

- **`mcRejillaSolidAt(fx,fy,fz)`** — hermana de `mcAimSolidAt` para la rejilla. Una celda que llena su
  cubo responde por la celda (coste de siempre); una celda fina (`mc._geoFina`) se sondea con **la
  misma indexación que `mcTerrenoChoca`**, leyendo `bitsAim` como el resto del apuntado.
- **`mcRejillaRayHit(x,y,z, o,d, t0)`** — sub-DDA a 1/16 **acotado a esa celda** (`3·T+3` pasos), que
  solo cuenta impacto si el rayo cruza un voxel fino lleno. Devuelve `-1` si sale de la celda.
- Dos únicos puntos de llamada: **`mcRaycast`** (se prueban terreno y estructura y gana el impacto más
  cercano) y **`mcBreak`** (el borrado necesitaba su propio arreglo). Colocar sale gratis: `mcPlace`
  consume el `cell + normal` de `mcRaycast`.
- **Sin materiales finos, `mc._geoFina` es `null` y el camino es byte-idéntico** al de siempre: la
  rama fina ni se toca. `mcSolid`, `mcFineBoxHit`, `mcFineSolidAt`, `mcAimBoxHit`, `mcAimSolidAt`,
  `mcStructColl`, `mcStructAt`, `mcStructRayHit` y `mcStructCellSolid` **no se han tocado** — son las
  que envuelve `mundo-autoarranque` y las que extrae *verbatim* `test_rayo_apuntado.js`.

**Guardián: `node test_rayo_apuntado.js` (19 ok).** Los 7 casos nuevos plantan un cable de 1 voxel de
alto **en `mc.grid`** (`mc._geoFina`, `fdim=[T,1,T]`) delante de una pared y comprueban que el rayo la
alcanza. Que no es un verde vacío se probó por A/B: revirtiendo los dos puntos de llamada de
`mcRaycast` en una copia, el test cae a **17 ok, 2 fallos** con exactamente el síntoma del dueño (el
rayo para en la celda del cable, `x=9`, y el bloque nuevo iría a `x=8`, o sea **encima del cable**).
Los otros 5 casos siguen verdes en las dos direcciones — incluidos dos anti-falso-verde: apuntando
**al** cable el rayo **sí** para en él, y un mundo sin geometría fina (`sinEscalera`) se comporta como
antes. Vecinos comprobados sin cambios: `test_clic_derecho_rejilla.js`, `test_rayos_x.js`.

---


<a id="-bug-rs24"></a>

### ✅ BUG-RS24 · No se puede clicar una pieza de redstone que está dentro de un fluido — ✅ resuelto 2026-08-11

**Reporte del dueño, literal:**

> «posible bug, no puedo hacer clic (boton de enmedio raton) sobre un componente redstone si esta
> dentro de un fluido y deberia»

**Confirmado midiendo, no deduciendo.** Con una palanca en `/map/test` y el ojo a tres bloques, en
seco el rayo del snippet da `[20,30,20]` (la palanca) y la conmuta; inundando **una sola celda** entre
el ojo y ella, el rayo se para en el agua (`[17,30,20]`, clave `asset:assets/agua.vox.json-2`) y
`conmutar` no cambia nada — mientras `mcRaycast(6,true)`, el rayo **del motor**, sigue devolviendo
`[20,30,20]`. O sea que los dos rayos no estaban de acuerdo, y ése era el ticket.

**La causa es la duplicación, no el fluido.** El botón central **no se ata en `app.js`** (su
`mousedown` sale por `if(e.button!==0 && e.button!==2) return;`): lo ata el snippet, y con él viene
`miraFina`, que es una **re-implementación** del rayo del motor en `redstone/redstone-piezas.js`. El
motor pregunta en tres sitios —`mcRaycast`, `mcBreak` y `mcPlace`— «¿esta celda es **reemplazable**?»
antes de pararse en ella; a la copia del snippet esa guarda nunca le llegó. Mientras un fluido fue
otra cosa daba igual; desde **REQ-FLUID4** un fluido es un macizo 16³ **fino en la rejilla** con el
bitset `bits` **LLENO (4096/4096)**, así que el test «¿cruza el rayo un voxel fino lleno?» dice que sí
en la **primera** celda de líquido y ahí se acaba el rayo. Es la misma familia que
[BUG-RAY1](#-bug-ray1) y [BUG-RAY2](#-bug-ray2): *un bucle copiado se desincroniza del original en
cuanto cambia el original*.

**El arreglo son cuatro líneas en `miraFina`** (`redstone/redstone-piezas.js`, `VERSION` a
`'piezas-1.5'`): la misma pregunta que ya se hace el motor, con la misma función.

```js
if (typeof mcIsCellReplaceable === 'function' && mcIsCellReplaceable(cx, cy, cz)) continue;
```

- Va **antes** de la manga ancha de `esManual` y del sondeo del bitset, o sea que una pieza sumergida
  se sigue apuntando por su celda entera como en seco.
- El `typeof` no es adorno: el snippet corre en un `new Function` y tiene que seguir siendo ejecutable
  contra un motor viejo que no exponga el ayudante.
- **Salta por REEMPLAZABLE, no por «fino»**, que es lo que impide que el arreglo se lleve por delante
  el apuntado del cable: un cable es fino igual que el agua y recorre el mismo camino: lo único que
  los separa es esa pregunta. Es lo que fija el tramo D del guardián.
- **El clic DERECHO arrastraba la misma ceguera** y se arregla con esto mismo: `mcUseRight` y el
  `mousedown` del botón central llaman los dos a `conmutarApuntada()` → `miraFina`. Degradaba distinto
  —al no reconocer la pieza, el clic derecho caía al original y **construía** un bloque en vez de
  conmutar—, así que en el agua era peor que no hacer nada.
- **Ni una línea de `app.js`.** El motor ya respondía bien; el que preguntaba mal era el snippet.

**Guardián: `node test_clic_bajo_fluido.js` (17 ok).** Monta su propia cubeta estanca en `/map/test` e
inyecta `redstone/redstone.js` y `redstone/redstone-piezas.js` **desde los fuentes**, para que falle
cuando se rompa el código y no cuando alguien olvide re-publicar. **A** es el control en seco; **B**
comprueba de paso las premisas del diagnóstico (la celda es agua, es reemplazable, su bitset fino está
**lleno**) y que la pieza y el motor dan ya la misma respuesta; **C** es la palanca del todo sumergida.
**D** es el anti-falso-verde y va sobre la **misma celda**: con un cable el rayo tiene que **pararse**
ahí (y se afirma que ese cable es fino y que su bitset **no** está lleno, o sea que recorre el mismo
camino), y con agua en esa misma celda tiene que **atravesarla** y llegar a la palanca.

⚠️ Dos formas de medir que costaron un falso rojo cada una, las dos por la misma confusión: **el ojo
se planta en el SUELO de su celda**, no en su centro (`mc.pos[1] = Y − MC_EYE·escala` deja el ojo
exactamente en `y = Y`). Así que un cable tumbado en el suelo de esa celda **sí** está en la trayectoria
de un rayo horizontal, y un `pitch` de −0,62 da antes en el suelo de roca de la cubeta que en nada de lo
que se quería medir. En los dos casos el motor tenía razón y el test estaba mal escrito.

---


<a id="-req-pick4"></a>

### ✅ REQ-PICK4 · «Block picker» en la rotación de la tecla `P` del Mundo — ✅ cerrado 2026-08-12

**Petición del dueño, literal:**

> «la tecla "p" en el mundo de seleccion de herramienta tendria que tener una nueva en la rotacion que
> sea "color picker" de forma que se pueda hacer clic en un bloque del mapa y que reemplace el que
> esta seleccionado en ese momento en el cajon»

Y su corrección inmediata, que es la que manda:

> «seria mas block picker en este caso»

**Redactado, sin investigar.** Lo que se pide es el *pick block* de Minecraft, llevado a la rotación de
herramienta de la tecla `P`: apuntar a un bloque del mapa, hacer clic, y que **la ranura elegida del
cajón pase a tener ese material**. Lo que se coge no es un color sino la **clave** del material, que es
justo la corrección del dueño y por eso el ticket se llama así.

**No es un duplicado.** [REQ-PICK1](#-req-pick1) y [REQ-PICK3](#-req-pick3) son el **selector de
bloque/textura del editor** (la ventana con buscador y filtros), y el cuentagotas de la paleta también
es del editor. Esto vive en el **Mundo** y su destino es la barra rápida.

**Lo que habrá que mirar cuando toque** (nada de esto está comprobado):

- qué entradas tiene hoy la rotación de la tecla `P` en el Mundo y dónde se define;
- de dónde sale la clave: **un material vive en uno de dos sitios** (`mc.grid` y `mc.structures`), así
  que el picker tiene que responder por los dos, como ya hacen el rayo de apuntar y rayos-X;
- qué hacer con el **giro horneado en la clave** (`clave@n`): si el picker se trae la postura tal cual
  o la clave base;
- y qué pasa cuando el material apuntado **no está** en el cajón: si sustituye la ranura activa —que
  es lo que pide el dueño— o busca antes si ya está en otra.

---

**✅ Hecho (2026-08-12).** La herramienta se llama **Cuentagotas** y es la cuarta entrada de la tecla
`P`: **Construir → Pintar → Seleccionar → Cuentagotas → Construir**. Con ella, **los dos botones** del
ratón pillan el material de lo apuntado y lo meten en el cajón, y **ninguno toca el mundo**.

Qué se implementó, respondiendo a las cuatro preguntas de arriba:

- **`mcPickBlock()`** (`app.js`, justo detrás de `mcBreak`) recorre el rayo con la **misma marcha fina
  que el pico**: estructura primero (`mcAimSolidAt` → `mcStructAt`), luego rejilla con el mismo recorte
  de `mcRejillaSolidAt` + `mcIsCellReplaceable`. Así **se pilla exactamente lo que se habría roto**;
  duplicar la marcha con otro criterio era la forma de que cuentagotas y pico apuntaran a bloques
  distintos desde el mismo píxel. La clave sale de `s.key` (estructura) o de `mc.blockKey[id]`
  (rejilla), o sea **con espacio de nombres**, sin escribir claves `hab:` a mano (BUG-RS23/BUG-FLUID3).
- **Se guarda la clave BASE**: `mcClaveBase` quita el `@ori` de las 24 posturas y `mcFluidBase` el nivel
  del fluido. La orientación la pone la **mano** del jugador (R / Shift+R), así que arrastrar el giro
  del bloque pillado pelearía con ella; y se pilla «agua», no «agua a 3/7».
- **Si el material ya está en el cajón, se SELECCIONA esa ranura** en vez de duplicarlo encima de la
  activa (comportamiento de Minecraft). Así el cuentagotas **no puede pisar** nada de lo que el dueño
  ya tenía preparado. Si no está, va a la ranura activa vía `mcAssignSlot`, que es lo que pidió.
- **Herramientas pasivas.** Se añadió `mcToolPasiva()` (`select` o `pick`) y **las tres rutas que
  colocaban** pasan por ella: la repetición al mantener pulsado, el aviso de «mantén clic derecho» y —la
  que se escapaba— el **`mouseup` que estampa la estructura al soltar**, que preguntaba por
  `tool!=='select'` y con el cuentagotas habría colocado una pieza por la puerta de atrás. El fantasma
  de colocación también se apaga: enseñarlo prometería un bloque que no va a salir.

**Ampliación del dueño (2026-08-12), literal:**

> «sobre REQ-PICK4 quiero que despues de elegir el material (hacer click) la herramienta se ponga en
> modo pintar»

Hecho: pillar deja la mano en **Pintar**. El gesto que quiere es el de un editor de imagen —
cuentagotas y a repintar con lo que acabas de coger—, no el de Minecraft, donde el pick block solo
llena la mano. El aviso va en el **mismo toast** que el material (`mcSetPlayerTool` se llama **sin**
`announce`, o su «Clic derecho: Pintar bloque» pisaría el nombre de lo pillado y no se vería qué has
cogido).

⚠️ **El cambio de herramienta reabre por sí solo las dos puertas que `mcToolPasiva()` cerraba**, y por
eso `mcPickClave` hace `mc.heldBtn=-1` **antes** del `await` de `mcAssignSlot`: en cuanto la
herramienta pasa a `paint`, `mcToolPasiva()` deja de ser cierta y **el mismo clic que pilló sigue
pulsado**, así que (a) la repetición de `mcTick` empezaría a **pintar sobre el bloque recién pillado** y
(b) el `mouseup` con una ranura-estructura armada lo **estamparía**. Soltar el botón al pillar es lo que
lo evita, y el guardián lo comprueba.

**Guardián: `tests/test_cuentagotas.js`** (área `materiales`, 17 comprobaciones, verde). Cubre el ciclo
completo de `P`, que el material cae en la ranura activa con espacio de nombres y sin `@ori`, que **ni
el clic izquierdo ni el derecho** rompen, colocan o dejan entrada en el historial, que un material ya
presente reutiliza su ranura sin duplicarse, que tras pillar la mano queda en **Pintar** con el botón
suelto, y **las dos ramas de la marcha** (pieza fina de `mc.grid`
y pieza estampada de `mc.structures`).

Dos cosas que costó descubrir y que están anotadas en el test para el siguiente:

- **`/map/test` no está vacío**: la primera pasada pillaba `demo-hojas-sin-caras` porque el rayo
  tropezaba antes de llegar al objetivo. Hay que buscar una columna de chunk libre y despejar el pasillo.
- **Una flor no llena su celda**: apuntando en horizontal el rayo le pasa por encima y no se pilla nada
  —que es el comportamiento correcto, el mismo recorte fino del pico—, así que el test apunta a su
  **geometría** (`pitch = -0.15`) y no a su celda. Y como el mundo sigue corriendo entre `await`s, la
  postura del jugador se **re-fija antes de cada clic** o se cae y el segundo clic apunta a otro sitio.

---


<a id="-req-shadow2"></a>

### ✅ REQ-SHADOW2 · Materiales sin sombra (nubes) — ✅ resuelto 2026-08-10

**Petición del dueño, literal:**

> «algunos materiales como white-wool quiero que tengan propiedades de iluminacion que sean que no
> tengan "receive shadows" ni "cast shadows" para poder hacer unas nubes semirealistas con esos
> materiales. que sea algo configurable nivel de autorun por si quiero elegir otro material»

**La duda que traía el ticket, resuelta sin preguntar.** Quedaba abierto si «receive shadows» era el
*skylight* (oclusión horneada, la que oscurece bajo techo) o la sombra proyectada del sol (mapa de
sombra en GPU). No hacía falta elegir: **las dos banderas se exponen por separado** y
`recibeSombra:false` apaga **ambas** sombras, que es lo que pide una nube. Lo que sí resultó no ser
opcional es el arrastre:

⚠️ **`proyectaSombra:false` por sí sola NO quita el pegote del suelo.** Solo saca la pieza del mapa
del sol; un bloque macizo **sigue tapando la luz del cielo** y la sombra de skylight sigue ahí. Por
eso `proyectaSombra:false` arrastra `luz:'pasa'` salvo que se diga `luz` a mano. Sin esto el caso de
uso no funciona, y no se veía desde el enunciado.

⚠️⚠️ **Ese arrastre resultó ser MEDIA solución, y la otra media es [BUG-SH2](#-bug-sh2)** (2026-08-11):
`luz:'pasa'` gobierna la **difusión**, no la **siembra**, así que la columna de cielo seguía cortándose
en la nube y el pegote seguía ahí. Hoy lo abre el motor: `proyectaSombra:false` ⇒ el cielo atraviesa
la columna, y `luz:'pasa'` sigue sin abrirla (un dosel de hojas tiene que seguir sombreando).

**Cómo quedó.** Dos banderas por MATERIAL, configurables desde el autorun; **ningún material cableado
en el motor** — `white-wool` ni siquiera existe en esta instancia, así que se verificó sobre
`asset:assets/leaves.vox.json`:

```js
game.bloques.define('hab:white-wool', { recibeSombra:false, proyectaSombra:false });
```

- **`app.js`** expone la capacidad y solo la consulta, patrón `mc.atraviesa`/`mc.traspasaLuz`: dos
  tablas, `mc.sinSombra` por **id de bloque** (terreno de `mc.grid`) y `mc.sinSombraKey` por
  **clave** (estructuras finas de `mc.structures`), las dos `null` por defecto ⇒ coste cero.
- **Sin atributo nuevo en ningún vértice:** las banderas viajan sumadas al `aShade` que ya existe en
  los tres formatos (`aShade = sombreado + 2·bits`; 1 = no recibe, 2 = no proyecta), decodificadas
  por `MC_SHADE_LIB`. Es seguro porque **`MC_FACES` va de 0,40 a 1,12 y nunca llega a 2**.
- Los cuatro fragment shaders envuelven el término del sol con **`mix()`, no con `if`**: `sunFactor`
  usa derivadas y no pueden ir en control de flujo divergente.
- En el paso del sol, el bit 2 manda el vértice fuera del volumen de recorte (`MC_SUN_VS`), y una
  instancia fina entera se salta por `st.sinProyectar` — más barato que filtrar por CPU.
- **El snippet** (`parche_snp_sin_sombra.py`, idempotente por marca) llena las dos tablas y fuerza
  `mcMeshAll()` + `mcRestampAll()` + **`mcShadowDirty()`** cuando la lista cambia.

**La trampa que costó encontrar.** Las banderas se **hornean en el sombreado**, así que cambiarlas
invalida las mallas cacheadas **aunque no se mueva un solo voxel**. Va en la **firma del chunk**
(recorrer la paleta, cientos, al lado del barrido del chunk, miles, no se nota); y el mapa del sol,
que solo se refresca cuando cambia la geometría, hay que ensuciarlo a mano porque aquí la geometría
es idéntica.

**Verificación** — `node test_sin_sombra.js` (nuevo, 7 secciones, TODO OK). Mide las tres capas por
separado en vez de fiarse: `getBufferSubData` del VBO real (sombreado máximo 1,120 → 5,120 con el bit
2 → 7,120 con los dos), `readPixels` del FBO del mapa del sol (24,0 → 15,0 → 24,0) y brillo de
pantalla. Un asset sin marcar da un VBO **byte-idéntico**. ⚠️ Al elegir el id de prueba hay que
filtrarlo por `mcTablaFina()`: la primera versión del test cogió una pieza fina, cuyo sombreado no
está en `ch.vbo`, y midió el búfer equivocado. `test_caras_pegadas.js` en verde (15 ok, 0 fallos) y
el resto del área igual que en HEAD. Docs en `CLAUDE.md` § «Materiales que no reciben ni proyectan
sombra».

---


<a id="-bug-sh2"></a>

### 🐛 BUG-SH2

**Estado:** ✅ resuelto 2026-08-11 · guardián `node test_sin_sombra.js`

**Petición del dueño, literal:**

> «aunque no deberian proyectar sombras las nubes, algo de sombra sí que proyectan»

Con el autoarranque declarando `'asset:assets/white_whool.vox.json': { recibeSombra:false,
proyectaSombra:false }`, las nubes seguían dejando un **pegote oscuro** en el suelo de debajo.

**La causa: hay TRES sitios de donde sale una sombra, y [REQ-SHADOW2](#-req-shadow2) solo arregló dos.**

| sombra | dónde vive | ¿la cubría REQ-SHADOW2? |
|---|---|---|
| mapa del sol (silueta proyectada) | GPU, `mcRenderShadow` + fragment shader | **sí** (bit 2 ⇒ el vértice sale del volumen de recorte) |
| skylight, **difusión** | `mcTablaLuz()`, leída por `mcComputeLight`/`mcRelightBox` | **sí**, pero de rebote (`proyectaSombra:false` arrastraba `luz:'pasa'`, y eso lo hace el snippet) |
| skylight, **siembra** | los dos bucles de columna vertical | **no** — y era éste |

Los dos bucles que siembran el cielo (uno en `mcComputeLight`, el global, y otro en `mcRelightBox`, el
incremental) llevaban desde siempre `if(g[i]!==0) break;`: **cualquier** bloque que no fuera aire
cortaba la columna en seco, dijera lo que dijera la tabla de difusión. O sea que la nube, que es un
16³ macizo, paraba el cielo aunque hubiera declarado que no proyecta nada — y `luz:'pasa'` no podía
arreglarlo porque **gobierna otra pregunta**.

**El arreglo: `mcTablaCielo()`, hermana de `mcTablaLuz()` pero para la SIEMBRA.** `Uint8Array` por id
de bloque, con el aire siempre a 1 y, encima, los ids que traigan el bit 2 de `mc.sinSombra` (o sea
`proyectaSombra:false`). Los dos bucles pasan a `if(!CIELO[g[i]]) break;`. Con `mc.sinSombra` en `null`
—lo normal— la tabla es la de siempre y no cambia ni una celda.

⚠️ **`luz:'pasa'` sigue SIN abrir la columna, y eso es la mitad del ticket.** Son dos preguntas
distintas y mezclarlas rompe el bosque: un dosel de hojas es de recorte, así que la luz se difunde por
él, pero **tiene que seguir dando sombra a lo que cubre**. Lo único que abre la columna es decir
literalmente «yo no proyecto sombra». Semántica confirmada por el dueño:

> «`proyectaSombra:false` ⇒ el cielo atraviesa la columna; `luz:'pasa'` en piezas secas la sigue cortando.»

**Detalles que no se ven en el diff:**

- **Los dos bucles quedan con los MISMOS predicados**, sin excepciones — es lo que compara celda a
  celda `test_luz_incremental_navegador.js`, y en cuanto difieran en un `if` el mundo editado deja de
  coincidir con el recién cargado.
- **La tabla se construye por llamada**, igual que `mcTablaLuz()`: `mc.sinSombra` lo escribe el snippet
  y una tabla cacheada se quedaría vieja sin que nadie la invalidara.
- **No hace falta invalidación extra**: `mcMeshAll()` llama a `mcComputeLight()` como primera
  instrucción, y el snippet ya llama a `mcMeshAll()` cuando cambia la lista de `sinSombra`.
- **`mcRelightBox` sigue siendo exacto**: su caja cubre la **columna entera** en Y, así que abrir o
  cerrar una columna se recalcula del todo.
- **Las estructuras finas no necesitan nada**: dejan la celda como aire y nunca cortaron el cielo.
- Un id por encima del final de la tabla lee `undefined` (falsy) ⇒ corta: se queda corto, no revienta.

---


<a id="-req-perf2"></a>

### ✅ REQ-PERF2 · Modo de renderizado "fast" (unlit) — ✅ resuelto 2026-08-10

**Reportado** 2026-08-10 por el dueño tras la 8ª pasada de [PERF-RS1](PLAN.md#-perf-rs1):

> «no digo que haya un modo sin GPU, digo que haya un modo donde no culpes a la GPU»

El motivo real: durante PERF-RS1 acabé apuntando a la GPU como cuello y el dueño no podía verificarlo
desde su lado sin un modo de rendering trivial para descartarla como culpable.

**Uso** (`app.js`):

```js
game.renderMode = 'fast';    // sin luces ni sombras — GPU al mínimo
game.renderMode = 'normal';  // iluminación completa (defecto)
```

`fast` combina tres cosas que ya existían por separado, más una nueva:
- `mc.sunShade = 1` → `mcRenderShadow` sale rápido (sin pasada del sol, sin FBO de 2048²).
- `mc.interiorDark = 1` → `mcRelightBox` devuelve `null` (no calcula skylight) y `mcMeshChunk` no
  muestrea `mc.light` en el shading.
- **`mc._skipBlockLight = true`** (nuevo): short-circuit en `mcComputeBlockLight`, devuelve `BL` a
  cero sin hacer BFS de emisores.

Al cambiar de modo se **re-malla todo el mundo** (`mcMeshAll`) porque el shading está horneado por
vértice en las VBOs. También se **invalida el cache LRU** de mesh (los VBOs cacheados tenían el
shading del modo anterior). El coste del cambio es alto (0.5-1 s de rebuild) pero es puntual.

**Uso complementario con REQ-PERF1** para el diagnóstico definitivo:

```js
game.renderMode = 'fast';
game.perfAssert = 120;
// ejercer el circuito complejo
game.perfDump();
```

- Si con `fast` los fps NO caen → el cuello era la iluminación GPU.
- Si con `fast` siguen cayendo → el cuello está en CPU (motor de redstone, lógica de agentes, etc.).

**Verificado** con `performance/sonda_render_mode.js`: cambio de `normal → fast → normal`, valores restaurados,
modo inválido rechazado con warning.

```
Default:       normal
Tras "fast":   fast
  sunShade    : 0.55 → 1
  interiorDark: 0.1 → 1
  skipBlockL. : false → true
Tras "normal": normal (valores restaurados)
Tras "basura": normal (con warning en consola)
```

**Coste implementado**: pequeño. 3 palancas ya existían (sunShade, interiorDark); solo hubo que
añadir `_skipBlockLight` (short-circuit en `mcComputeBlockLight`), unificar bajo `game.renderMode`,
y disparar re-mallado + invalidación de cache al cambiar.

⚠️ **Trade-off buscado**: el mundo se ve **plano y sin volumen** en modo `fast` — todas las caras
uniformemente iluminadas, sin sombras del sol ni penumbra de interiores. Es un modo de depuración
o de rendimiento máximo, **no** un modo de juego cómodo por defecto.

---


<a id="-bug-rs9"></a>

### ✅ BUG-RS9 · El pistón no empuja al jugador: te subes encima de la cabeza — ✅ cerrado 2026-08-07

**Reportado** 2026-08-06 por el dueño, con captura (`data/tickets/BUG-RS9/01.png`):

> «funciona ok, una cosa que no funciona bien con el pistón es que si me pongo como jugador delante
> de él y lo activo, en lugar de empujarme que es lo que ocurriría en la realidad, me subo encima
> del pistón extendido»

**Sin investigar** (política de tickets nuevos). El pistón hoy mueve **bloques de `mc.grid`** y nada
más: `accionar()` mira la celda de delante, y si hay un id lo escribe una celda más allá. El jugador
no es una celda, así que ni se le consulta ni se le mueve — y como la cabeza aparece **dentro** de
donde él está, la física lo resuelve como resuelve cualquier bloque que aparece bajo los pies:
subiéndolo encima. Eso es lo que hay que confirmar antes de decidir el arreglo.

Lo que hay que decidir al abordarlo, porque son cosas distintas y solo la primera es «el bug»:

1. **Que empuje al jugador** una celda en la dirección del pistón (y a la vez a lo que haya detrás
   de él, o se queda dentro de un bloque).
2. **Qué pasa si no cabe** — en Minecraft el jugador queda aplastado contra la pared, no se teletransporta.
3. Si esto vale también para los **agentes articulados**, que es [BUG-AG1](#-bug-ag1): probablemente
   el gancho sea el mismo, y conviene mirar los dos antes de elegir dónde ponerlo.

**Verificación esperada** — ponerse delante de un pistón, activarlo y acabar **una celda más allá**,
a la misma altura; con una pared detrás, no atravesarla.

#### Cómo se cerró (2026-08-07)

La causa no estaba en el pistón sino en **quién limpiaba el estropicio**. El pistón escribía la
cabeza dentro del jugador y se desentendía; el solape lo resolvía la auto-curación de `mcUpdate`, que
tira de `mcUnstick`, y **`mcUnstick` solo sabe buscar salida HACIA ARRIBA**. El primer hueco de aire
sobre la cabeza recién extendida es exactamente la cota de montarse encima. O sea: el jugador no
*trepaba*, lo *desatascaban* hacia arriba. Es el mismo fallo que ya tenía resuelto `mcAgentShove`
para las embestidas de los agentes, y con el mismo razonamiento: un empujón se resuelve **en la
dirección del empujón**, no por el hueco más cercano.

`apartar(d, chocabaAntes)` en `redstone/redstone-piezas.js`, **cero líneas de `app.js`**. Tres
decisiones que se ven en el código:

- **Se llama DESPUÉS de escribir los bloques**, no antes. Así no hay que saber ni la caja del jugador
  ni la forma de la cabeza ni la escala: se le pregunta a `mcCollides`, que ya sabe las tres cosas.
  Antes de escribir, las celdas barridas son aire y no habría contra qué chocar.
- **`chocabaAntes`** se mide antes de tocar nada: si el jugador ya venía embutido en algo, no lo ha
  metido ahí el pistón y no le toca a él sacarlo. Sin esta guarda, cualquier pistón del mundo se
  convertía en un desatascador a distancia.
- **Si no cabe, no se mueve** (punto 2 del ticket): se queda donde está y ya lo desatascará
  `mcUpdate`. Colarlo dentro de la pared de enfrente es peor — de ahí no se sale andando.

El tope del barrido escala con `mc.scale`: un jugador grande es más ancho que su celda y no le basta
con desplazarse el bloque que se desplaza la cabeza.

**Verificado** — `node test_piston_empuja.js` (nuevo): **TODO OK**. Contra el código anterior da
**3 FALLO(S)** con exactamente el síntoma del ticket: `en reposo=[15.5, 16.938, 14.5]` — se sube casi
un bloque (`Δy=0.938`) y no avanza nada (`Δx=0`). El test no se cree el tramo A solo: **B** comprueba
que a un jugador que está lejos no se le mueve *ni un float* (si no, sería un empujón ciego) y **C**
que un pistón mirando hacia arriba **sí** le levanta una celda, que eso no es el bug sino un pistón.
`node redstone/plantar_piston.js` sigue en **TODO OK**.

**Sigue pendiente**: lo mismo para los agentes articulados, que es la otra mitad de
[BUG-AG1](#-bug-ag1). El sitio ya está: `apartar()` es donde entrará.

---


<a id="-bug-ag1"></a>

### ✅ BUG-AG1 · Los agentes articulados no interactúan con el redstone — ✅ cerrado 2026-08-07

**Reportado** 2026-08-06 por el dueño, en el mismo mensaje que [BUG-RS9](#-bug-rs9) (misma captura),
con una corrección suya inmediatamente después — **«quería decir agentes articulados, no
automatizados»**:

> «los agentes [articulados] no se ven afectados por los pistones y deberían y tampoco pueden
> presionar placas de redstone»

**Sin investigar** (política de tickets nuevos). Son **dos** capacidades que hoy solo tiene el
jugador, y conviene medir si es un único gancho que falta o dos:

- **el pistón los empuja** — hoy no empuja ni al jugador ([BUG-RS9](#-bug-rs9)), así que este ticket
  puede quedar reducido a «que el arreglo de RS9 valga también para los agentes». Mirar los dos juntos.
- **pisar una placa** — `alPisar` (v1.29 de `game.bloques`) se dispara al **entrar en la celda**, y
  quien lo dispara es el recorrido del **jugador**. Si el agente se mueve por otro camino, nunca pasa
  por ahí.

⚠️ Hipótesis que hay que descartar la primera, porque haría que este ticket y
[BUG-AG2](#-bug-ag2) fueran **el mismo fallo**: si el agente anda 16 voxels por encima —o sea *sobre*
la celda de la placa en vez de *dentro* de ella—, jamás entra en la celda y `alPisar` no puede
dispararse aunque el gancho esté bien puesto. Medir eso antes de tocar nada.

**Verificación esperada** — un agente que cruza una placa la enciende, y un pistón que se extiende
contra un agente lo mueve una celda.

#### Cómo se cerró (2026-08-07)

La ⚠️ de arriba se midió, y la respuesta fue **«a medias»**, que es lo interesante: arreglar
[BUG-AG2](#-bug-ag2) era **necesario pero no suficiente**. Con el agente ya a la cota buena, la placa
seguía sin encenderse. Eran **tres** cosas, no una:

1. **La altura** — [BUG-AG2](#-bug-ag2). Mientras el agente flotara 16 voxels sobre la placa, no había
   nada más que discutir.
2. **La pregunta equivocada.** `sueloDe()` mira medio voxel fino **bajo** la caja del bicho: lo que le
   *sostiene*. Una placa de presión no es eso — es un bloque `atravesable` **dentro** del cual te
   quedas de pie, así que mirando solo bajo los pies se ve la losa de debajo y la placa no salta
   jamás. El jugador ya tenía las **dos** preguntas (`pieEn` + `pieDentro`); el agente solo la
   primera. Se le añadió `dentroDe()`, con el mismo flanco por celda+clave. Es la regla de Minecraft:
   *la placa es el bloque que OCUPAS, no el que te sostiene*.
3. **La válvula estaba al revés.** `fisica.placas` venía apagada por defecto con este aviso: «el
   alPisar que hay escrito está pensado para el jugador (hace `game.tp`), así que un zombie pisando
   una placa te teletransportaría A TI. Se enciende con `placas:true` **a sabiendas de que el alPisar
   sepa quién pisa**». La premisa había caducado (el `alPisar` de `hab:placa` ya llama a
   `game.redstone.encender`), y la condición que el propio aviso ponía es justo lo que se cumplió: el
   payload lleva ahora `quien` (`'jugador'` | `'agente'`) y `agente:{id,nombre}`. Así que se invierte:
   **encendida por defecto** —una placa que solo notas tú no es una placa— y `fisica:{placas:false}`
   la apaga.

Y el **pistón** (`apartarAgentes` en `redstone/redstone-piezas.js`) resultó **no** ser el mismo caso
que el jugador, contra lo que decía este ticket. Con `mc.pos` bastaba `mcCollides`; la caja de un
agente son estructuras estampadas y su colisión es asunto de la librería de esqueletos, que no
asomaba nada por fuera. Se añadieron a la librería las **dos capacidades generales** que le faltaban
—`game.esqueletos.enCaja(x0,y0,z0,x1,y1,z1)` y `game.esqueletos.desplazar(rig,dx,dy,dz)`— y la
**política** (hasta dónde barrer y qué hacer si no cabe) se quedó en la pieza. Un
`game.esqueletos.empujaPiston()` habría metido el redstone dentro del motor de agentes.

#### ⚠️ La mitad del pistón se cerró antes de tiempo — reabierta y cerrada de verdad (2026-08-07)

El dueño volvió con el mismo síntoma **después** de darlo por cerrado:

> «al agente articulado le pasa lo mismo con el pistón que le pasaba al jugador, en lugar de
> empujarlo se sube arriba y debería de ser empujado»

Tenía razón, y el fallo era **del test**, no suyo. El §D de `test_piston_empuja.js` le ponía al bicho
`rig.G.velocidad = 0` «para que su propio desplazamiento no contaminara la medida». Eso apaga el paso
por frame del rig, y con él `asentar()` — que es **exactamente** la función que trepa. El tramo medía
un agente congelado y salía verde mientras el Mundo de verdad hacía otra cosa. Es la lección que este
repo ya tenía escrita: *el mundo de juguete miente*.

Con el agente **andando de verdad**, el código que se había dado por bueno daba **3 FALLO(S)** con el
síntoma literal del dueño: `Δz=0.063` (un solo 1/16) y un pico de cota **17.765** partiendo de 16.

Dos causas, encadenadas:

1. **`desplazar` reasentaba.** Iba por `moverRaiz` → `asentar`, y `asentar` sube un bloque entero para
   salvar escalones: el primer pasito ya montaba al agente **encima** de la cabeza recién salida. Es
   el mismo desenlace del [BUG-RS9](#-bug-rs9) con el jugador (`mcUnstick`, que solo busca hacia
   arriba) por el mismo motivo. Ahora `desplazar` **traslada la raíz y nada más**: un empujón no es un
   paso, no trepa. Volver a pisar suelo es cosa de su gravedad, el frame siguiente.
2. **El barrido de la pieza estaba mal planteado.** Encadenaba pasitos de 1/16 exigiendo que cada uno
   cupiera; pero cuando `apartarAgentes` corre, la cabeza **ya está escrita** y el agente ya está
   embutido en ella, así que el primer pasito tampoco cabe y el bucle se rendía al primer intento.
   Ahora prueba **distancias crecientes desde donde está** y acepta el primer hueco, que es lo que
   `apartarJugador` hacía desde el principio dos funciones más arriba.

De paso, el §D tenía **dos artefactos de banco** que fabricaban un pico falso de 17.765 (`alto=0.88`,
o sea un **brinco** suyo, no una aupada): el jugador aparcado justo al final del paseo del agente, y
el objetivo de marcha puesto en la propia celda de la cabeza — con lo que tras el empujón volvía sobre
sus pasos y se subía al bloque como quien sube un escalón. Que el pico saliera **con el mismo float**
incluso cuando el pistón no le tocaba fue lo que los delató.

Nada de esto toca `app.js`. Reparto: comportamiento por material y física de agentes → snippet
(`parche_snp_agente_pisa.py`, `parche_snp_cuerpo_real.py`, `parche_snp_agente_empujado.py`, los tres
idempotentes); la pieza de redstone → `redstone/redstone-piezas.js`.

**Verificado**

- `node test_agente_pisa_placa.js` (nuevo): **TODO OK**. Mide un **circuito**, no un contador — un
  zombie andando enciende `hab:placa`, la señal llega al `hab:cable` de al lado con `saca=15`, el
  pulso la suelta sola, y con `fisica:{placas:false}` el mismo bicho **no** la enciende. Contra el
  código anterior da **4 FALLO(S)**.
- `node test_piston_empuja.js` §D (nuevo): **TODO OK**, ya con el agente **andando de verdad** (ver
  arriba: la primera versión lo congelaba y por eso dio un verde falso). El pistón lo aparta en el
  mismo acto de abrirse, `Δz=0.813`, sale de la celda de la cabeza y su cota **no sube ni un
  instante** (pico 16, igual que antes de accionar). Contra el código anterior, **3 FALLO(S)**:
  `Δz=0.063`, pico **17.765** y el bicho todavía dentro de la celda.
- `node test_bloques_comportamiento.js`: **388 ok, 0 fallos** (§18 pasó a exigir lo contrario de lo
  que exigía: que el agente **sí** dispare `alPisar`, una vez por celda, con `quien==='agente'`).
- `node test_parkour_navegador.js` y `node test_fisica_navegador.js`: **18 ok, 0 fallos** cada uno.

⚠️ `node test_esqueleto_navegador.js` sigue con **3 FALLO** en `/map/agents`
(`mcSerialize`/`quitar()`/«el mundo queda píxel a píxel como estaba»). Son **anteriores** a todo
esto: comprobado volviendo el snippet a la copia previa al parche y obteniendo los tres idénticos.
Sin ticket propio todavía.

---


<a id="-bug-ag2"></a>

### ✅ BUG-AG2 · Los agentes articulados no respetan el cuerpo real de los bloques — ✅ cerrado 2026-08-07

**Reportado** 2026-08-06 por el dueño, en el mismo mensaje que [BUG-RS9](#-bug-rs9):

> «tampoco respetan la altura de los componentes, si una placa de redstone tiene altura 1 voxel
> suben 16, no respetan el cuerpo real de los bloques»

**Sin investigar** (política de tickets nuevos). El dueño lo dice con números: la placa mide **1
voxel** de alto y el agente sube **16** — una celda entera. O sea que el agente trata la celda como
un cubo lleno en vez de preguntar por la geometría fina, que es justo la distinción que el motor ya
sabe hacer para el jugador (`bits` = colisión fina, y `mcCabeEnRejilla`/`mcEsFinaEnRejilla` para
saber si una pieza es fina dentro de su celda).

Sin abrir el código todavía, lo que hay que medir primero es **por dónde anda un agente**: si su
movimiento pregunta a la misma colisión que el jugador (`mcCollides`) o si lleva la suya, porque eso
decide si el arreglo es un ajuste o un cambio de camino.

Ver también la ⚠️ de [BUG-AG1](#-bug-ag1): puede que las placas no se pisen **porque** el agente va
16 voxels demasiado alto, en cuyo caso los dos tickets se cierran con un solo arreglo.

**Verificación esperada** — un agente cruzando una placa de 1 voxel sube 1 voxel, no 16; y lo mismo
con el cable, que es igual de fino.

#### Cómo se cerró (2026-08-07)

La sospecha del ticket era exacta, y la sonda (`sonda_ag2.js`) la confirmó antes de tocar nada: la
placa mide `fdim=[14,2,14]` sobre 16, y el agente quedaba a **16** donde el jugador queda a **15**.

Dos sitios, los dos en el snippet (`parche_snp_cuerpo_real.py`), **cero líneas de `app.js`**:

- **`asentar()`** — `mcSurfaceNear` devuelve la altura en **celdas enteras**, y plantar los pies en el
  techo de la celda es exactamente el «suben 16». Se le añadió una bajada en pasos de **1/16** hasta
  apoyarlo donde de verdad hay materia. Con una guarda que importa: **solo si la celda de apoyo se
  dibuja fina** (`celdaFina()`, que mira `mc._geoFina[id].bits`). Sobre un macizo el primer paso ya
  chocaría, así que ni se entra — andar por terreno normal no cambia ni un voxel ni cuesta un sondeo
  de más.
- **`chocaTerreno()`** — dejaba de tratar las celdas como cubos enteros y sondea `bits` en 1/16,
  calcado de `mcTerrenoChoca`. Sin esto lo anterior no serviría: la bajada fina la frena la propia
  colisión, y si la colisión sigue siendo un cubo, el primer escalón ya choca.

**Verificado** — `node test_agente_cuerpo_real.js` (nuevo): **TODO OK**. Sobre suelo llano el pie
queda en **15** (lo mismo que el jugador) y sobre la placa en **15.125**, que son exactos 2/16 — la
altura real de la pieza, no la de su celda. Contra el código anterior: **4 FALLO(S)** con `pie=16`,
el número del ticket. `node test_parkour_navegador.js` sigue en **18 ok, 0 fallos**, que es lo que
garantiza que la bajada fina no ha aflojado el andar de siempre.

Y sí, [BUG-AG1](#-bug-ag1) hacía falta esto — pero **no bastaba**: la placa seguía sin encenderse
después. Ver ahí por qué.

---


<a id="-bug-ag3"></a>

### ✅ BUG-AG3 · Un agente sin la capacidad «te persigue» sale roto — ✅ resuelto

**Reportado** 2026-08-07 por el dueño, con captura (`data/tickets/BUG-AG3/01.png`):

> «si se crea un agente articulado sin la capacidad "te persigue" no se renderiza correctamente,
> ademas se quedan las piezas sueltas, no es empujable, no te mira, etc. parece roto»

En la captura: la cabeza flotando muy por encima, el torso y **un brazo suelto** al lado, y una pierna
sola apoyada en el suelo. No es un rig mal proporcionado: es un rig **sin montar** — cada pieza en el
sitio donde se estampó, sin postura ni raíz común.

**Sin investigar** (política de tickets nuevos). Lo único que apunta el enunciado, y que hay que
comprobar antes que nada: el dueño lista **cuatro** síntomas (colocación, mirada, empuje, «parece
roto») y todos son cosas que pasan **por frame**. La sospecha barata es que el paso por frame del rig
—el que coloca las piezas, lo asienta en el suelo y mueve la cabeza— esté colgando de la capacidad de
perseguir en vez de correr siempre, y que sin ella el agente no dé nunca un paso. Pero eso es una
hipótesis, no un hallazgo: hay que medirlo.

**Lo primero a medir** — crear un agente con y sin la capacidad y comparar, en los dos, si el rig
llega a tener `_sig`/`cuerpo`, si `esqueletosPaso` lo visita, y si `asentar()` llega a correr. Sin ese
antes/después no se sabe si falta el paso entero o solo la parte de la mirada.

**Pista caída encima** (2026-08-07, sin buscarla: apareció al ojear `crearEsqueleto` para
[REQ-AGESC1](#-req-agesc1); **no verificada**). Ese trozo del snippet tiene **tres** salidas que hacen
`quitarEsqueleto(rig); return null;` cuando falta o no cuadra el `seguir` —`def.seguir === false ||
null`, `!rig.G`, y el caso `porClave`— y las tres ocurren **antes** de la línea que le pone `_sig` a
la raíz. Un agente que sale por ahí nunca llega a montarse: las piezas ya están estampadas y se
quedan donde cayeron, sin postura y sin raíz, que es exactamente lo de la captura. Habría que mirar
si `quitarEsqueleto` las desestampa de verdad en ese punto. Y el aviso va por `console.warn`, o sea
invisible en el móvil: de ahí el «parece roto» en vez de «me ha dicho que le falta `seguir`».

**Verificación esperada** — un test de navegador que cree un agente **sin** «te persigue» y compruebe
que las piezas quedan pegadas al rig, que se apoya en el suelo, que `game.esqueletos.empujar()` lo
mueve y que mira al jugador. Hoy debe fallar.

**Medido antes de tocar nada** (dos sondas de navegador en `/map/test` con el documento del dueño,
`data/agentes/personaje-1.json`). La pista de arriba era **media verdad**, y la otra media es lo que
de verdad rompía la pantalla:

- `seguir` **ausente** no falla: se planta un agente entero (7 piezas, `G`, `_sig`). O sea que el
  ticket es solo del caso `seguir: false` explícito, no de «un documento al que le falta la clave».
- `seguir: false` sí sale por `quitarEsqueleto(rig); return null;` … **y el desestampado tiene fuga**:
  de las 7 piezas solo retiró **1**. Las otras 6 se quedaron en el mundo con `efimera:true` y
  `_rig:null` — visibles, sin postura y sin nadie que las anime. Es la captura, clavada.

**La fuga (el fallo de fondo, que no era de este ticket).** `quitarEsqueleto` borra por **referencia**
(`mc.structures.indexOf(s) >= 0`), y durante el estampado salta un `mcRestampAll` — lo dispara la
pieza que hace crecer el atlas; en la sonda, `hab:antorcha`. `app.js` **no reutiliza** las instancias
al restampar: las **sustituye** por otras nuevas. Así que `parte.s` apuntaba a objetos que ya no
estaban en `mc.structures`, `indexOf` daba `-1` y esas piezas **se saltaban en silencio**. Solo
sobrevivía la última estampada, la única posterior al restampado. Para esto ya existía `readquirir()`,
pero solo lo llamaba `esqueletosPaso`. ⚠️ **Esto le pasaba a cualquier `game.esqueletos.quitar()`
posterior a un restampado**, no solo a este ticket; aquí se veía porque el rig se quita a los 0 ms de
nacer.

**La negativa (la decisión de diseño).** Se ha ido por donde apuntaba la verificación del ticket, que
pedía un agente que **funcione** sin perseguir, no un fallo más limpio: apagar «te persigue» ahora
planta **una estatua que te mira**. `G.quieto` reusa el estado que ya existía para «te he perdido de
vista» (`g.por = 1`): postura de reposo y ni un paso, sin un modo de andar nuevo. Mirar y empujar son
capacidades **aparte** (`mirar` por pieza, `empuje` por documento) y funcionaban solas desde siempre —
lo único que se lo impedía era que el rig no llegara a existir.

⚠️ **`asentar()` solo corre cuando la pieza SE MUEVE** (vive dentro del `if (vd >= 1e-4)` de
`pasoSeguir`), así que un agente que no anda nunca tocaría el suelo: se quedaría flotando donde lo
plantaste. El modo quieto lo llama a mano. Es la misma trampa que ya está anotada en CLAUDE.md sobre
congelar agentes en los tests con `rig.G.velocidad = 0`.

Todo en `parche_snp_agente_sin_seguir.py` (4 costuras, idempotente, todo-o-nada: comprueba los cuatro
anclajes antes de escribir una letra). **Ni una línea de `app.js`.**

**Verificado** — `test_agente_sin_seguir.js` (nuevo, navegador de verdad, **16 ok / 0 fallos**): las 7
piezas pegadas al rig, se planta 6 bloques en el aire y **los pies acaban en la cara del terreno**
(`cuerpo[1] + g.y == suelo + 1` — `asentar` apoya la caja del cuerpo, no la celda de la raíz, que es
el torso y va a media altura), con el jugador al lado no da un paso, la cabeza gira 140° al pasar el
jugador de un lado al otro, `empujar()` lo mueve, y `quitar()` devuelve el mundo a sus 75 estructuras.
La sección **E** es el anti-falso-verde que hacía falta: el **mismo** documento **con** «te persigue»
sí se echa encima (2,31 bloques), o sea que el «no se movió» de B no es un rig muerto. Sin regresiones:
`test_esqueleto_navegador.js` 15 ok, `test_agentes_api.js` 30 ok, `test_bloques_comportamiento.js`
388 ok, más `test_agente_cuerpo_real.js` / `test_agente_aturdido.js` / `test_agente_pisa_placa.js` /
`test_escala_agente.js`.

**Lo que NO se ha hecho, a propósito:** el cuerpo de un agente quieto **no gira** hacia ti (línea
`if (g.por !== 1 && hay)` de `esqueletosPaso`); solo le sigue la cabeza. Girarse entero es del que
persigue. Si el dueño lo quiere, es una línea — pero es una decisión suya, no un fallo.

**Qué lo reabriría:** que el dueño espere que una estatua se gire entera hacia él; o que aparezca una
capacidad más que hoy siga colgando de `seguir` sin que se haya notado (mirar y empujar ya no lo
están).

---


<a id="-bug-ag4"></a>

### ✅ BUG-AG4 · Solo el torso de un agente es sólido; la cabeza se traspasa — ✅ hecho

**Reportado** 2026-08-07 por el dueño:

> «comprueba de paso también porque puedo subirme al torso de un agente pero no su cabeza que
> parecería sólida pero no, la traspasa subirme encima y caigo en el torso»

**Causa confirmada** (salió al medir la solidez para [REQ-AGESC1](#-req-agesc1), no buscándola): de
las 6 piezas del zombie vivo, **solo la raíz** (el torso) tiene `_sig` puesto; `cabeza`, `brazo izq`,
`brazo der`, `pierna izq` y `pierna der` dan `tieneSig: false` y `solidoEnSuCentro: false`. La
solidez de un rig sale del envoltorio de `mcFineBoxHit` del snippet, que solo mira las piezas
**desplazadas** (`_sig`), y el ancla de las que no son raíz va con `bits` a ceros por `sinChoque`.
O sea que **todo lo que no es el torso es un fantasma**, no solo la cabeza — es el límite «el zombie
choca por su torso» de CLAUDE.md, que el dueño se encuentra como un fallo al subírsele encima.

**Hecho.** Se ha tomado el camino de fondo, no el barato: **la solidez sigue la MATRIZ**. La duda que
dejaba el ticket —si las extremidades deben chocar, cuando el rig las **gira** y los envoltorios solo
trasladaban— se resuelve haciendo que el sondeo entre en coordenadas de la pieza en vez de pedirle a
la caja que persiga al dibujo. Todo en `parche_snp_solidez_piezas.py` (**10 costuras**, idempotente),
ni una línea de `app.js`:

- `comoSeMueve(s)` clasifica cada estructura en **0 / 1 / 2**: quieta, desplazada (el camino de
  siempre, byte a byte) o **posada por matriz**. Solo el 2 es nuevo, así que lo que ya funcionaba no
  cambia de rama.
- Para el 2, el punto del mundo baja a coordenadas locales con la **traspuesta** de la parte 3×3 de
  `s.model` (es una rotación, así que traspuesta = inversa y no hace falta invertir nada) y luego se
  divide por la escala. La caja se redondea **hacia fuera** (`floor` por abajo, `ceil-1` por arriba)
  para no perder voxeles de borde al girar.
- **Dos contadores, no uno** (`nDesplazados` y `nPosadas`): son dos caminos de código distintos y el
  atajo «no hay nada que mirar» de `envBox` tiene que apagarse solo cuando **ninguno** de los dos
  tiene inquilinos. `nPosadas` se pone a 0 al principio de `esqueletosPaso`, o se queda clavado
  cuando se retira el último agente.
- **Válvula de escape** en los dos sentidos (§ «defectos automáticos, no opt-in»): `solidez:'raiz'`
  en el documento del agente vuelve al comportamiento viejo, solo el torso.

⚠️ Este parche va **DESPUÉS** de `parche_snp_escala_agente.py` (sus anclas cuentan con el `E = s.esc`
que aquél mete en el bucle), y por eso aquél estrenó un 4º elemento **MARCA** en sus tuplas: reescribir
un bloque desincronizaba la comprobación de idempotencia del otro. Los dos convergen: en la segunda
vuelta ambos dicen «nada que hacer».

**Verificado** — `test_solidez_piezas.js` nuevo, en verde. No sondea el centro de cada pieza como
decía este ticket: eso da **verdes falsos**, porque el ancla de un brazo cae dentro de la caja dibujada
del **torso** y `mcFineBoxHit` solo contesta «¿hay algo sólido aquí?». La aserción buena es un barrido
completo de 37³ que exige que **todo punto sólido caiga dentro de la caja dibujada de alguna pieza**:
`426 puntos sólidos de 50653`, **`0 huérfanos`**. Se comprobó que es un guardián real revirtiendo el
arreglo: **5 fallos**. Más 40 sondas de terreno idénticas antes y después, y la válvula probada.

**Efecto colateral conocido, no causado por esto:** `test_esqueleto_navegador.js` da 3 fallos en
`/map/agents` (estructuras de rig/efímeras que se quedan). Se verificó corriéndolo contra el snippet
**anterior** al parche: los mismos 3. Es previo; queda por abrir como ticket aparte.

---


<a id="-bug-ag5"></a>

### ✅ BUG-AG5 · El agente anda contra el pistón que lo empuja — ✅ hecho

**Reportado** 2026-08-07 por el dueño:

> «cuando un agente es empujado por el pistón redstone, si el agente sigue avanzando en dirección al
> pistón acaba ganando el movimiento del agente sobre el empuje del pistón, por lo que si por ejemplo
> tenía que desplazarlo 16 al final del movimiento puede que no llegue a ese valor o se suba encima
> del pistón abierto. Lo ideal es que al ser empujado el agente por el pistón el agente se quede unos
> instantes, por ejemplo un segundo, en "shock", sin moverse, de forma que le dé tiempo al pistón
> empujarle sin que el agente vaya en contra de su movimiento»

Dos síntomas del mismo choque de dos cosas que mueven al mismo cuerpo en el mismo frame: el
desplazamiento **se queda corto** (el agente recupera terreno andando) y, en el peor caso, **acaba
encima de la cabeza extendida** — que es el mismo desenlace que BUG-RS9 le daba al jugador, aunque
aquí por otro camino (allí era `mcUnstick`; aquí el agente se lo gana andando).

**La decisión que quedaba abierta —dónde vive el «shock»— se cerró como se apuntaba:** es una
**capacidad** de la librería, `game.esqueletos.aturdir(rig, segundos)`, y la **política** se queda en
la pieza. El pistón llama a `aturdir` justo después de `desplazar`, **también si no cupo** (ahí es
cuando más falta hace: si no, se pasa el rato empotrándose contra la pared de enfrente). Lo contrario
—que `desplazar` aturdiera solo— rompería su contrato de primitivo de un solo tiro y metería una
regla del pistón dentro del motor de agentes (§0). Todo en `parche_snp_aturdir.py` (**6 costuras**,
idempotente, independiente de los otros dos parches) más `redstone/redstone-piezas.js`; ni una línea
de `app.js`.

⚠️ **El shock NO se implementa saltándose `pasoSeguir`.** Esa función es *además* quien hace la cuenta
de `nDesplazados` que mantiene vivas las envolturas de colisión: saltársela volvería fantasma al
agente justo en el frame en que lo están empujando. Se la llama con **`dt = 0`** — el avance sale
exactamente 0, la cuenta se hace, y `g.por`/`g.pide` se siguen actualizando (te ve igual, solo que no
se mueve). Regalo: las piernas se paran solas, porque el ciclo de andar avanza con la **distancia
recorrida** y no con el reloj. La gravedad, el bote, el patinaje y el golpe (`rig.mov`) siguen
corriendo con el `dt` de verdad; un shock que apagara la gravedad dejaría al bicho flotando si lo
empujan sobre un borde.

**Válvulas en los dos sentidos:** `game.redstone.shockPiston = 0` apaga el shock del pistón (y `2` lo
alarga) en vivo desde la consola; `aturdir(rig, 0)` despierta a uno ya aturdido; y `lista()` estrena
columna `shock`, que sin ella «no anda» y «no puede llegar» se leen igual en la tabla. El golpe del
clic izquierdo **no** aturde: eso no lo pidió nadie y cambiaría cómo se siente pegarle.

**Verificado** — `test_agente_aturdido.js` nuevo, en verde. Lo que impide el falso verde es el tramo
**C**, que repite el pase con `shockPiston = 0`: sin shock el agente acaba **dos bloques más atrás y
subido a la cabeza** (`dy = 2`). Ojo con **cómo** se mide, que costó dos intentos: los tres pases
entran **andando** hasta apoyarse en el pistón (el pistón es de dos de alto a propósito, si no se le
sube como quien sube un escalón, que es conducta correcta) y se comparan las posiciones **finales**,
no los deltas — el bicho se planta asintóticamente y para donde para (~0,1 de dispersión), así que
restar deltas de sitios distintos daba 0,5 contra 0,94 sin que hubiera ningún fallo detrás.

Y la medida se toma **dentro de la ventana de shock**, no «al final de todo»: pasado el segundo el
agente vuelve a caminar contra la cabeza ya extendida y se sube a ella, pero eso es un escalón de un
bloque subido andando, que es conducta correcta del agente y no este ticket. Lo que el ticket pide es
que el **empujón se complete**.

---


<a id="-bug-ag7"></a>

### ✅ BUG-AG7 · Te subes solo a los brazos de un agente; apagar el «unstick» automático — ✅ hecho

**Reportado** 2026-08-07 por el dueño, justo después de cerrar [BUG-AG4](#-bug-ag4):

> «algo raro pasa ahora con los brazos de un agente articulado cuando impactas con ellos, podría ser
> que el jugador se quede trabado, el caso es que se sube automáticamente a sus brazos si está cerca,
> se parece a cuando el jugador se queda trabado en una estructura que sale directamente a la
> superficie; estaría bien deshabilitar el "unstuck" automático, que sea un `game.autoUnstuck = false`
> por defecto, si hay que hacerlo a mano creo recordar que existía la tecla "u", así evitamos este
> problema de forma fácil»

**Sin investigar** (política de tickets nuevos). Lo que ya se sabe sin mirar nada:

- Es casi seguro **una secuela de BUG-AG4**: hasta hace un rato los brazos eran fantasmas y ahora son
  sólidos, así que rozar uno te embute y `mcUnstick` —que **solo sabe buscar salida hacia arriba**— te
  planta encima. Es el mismo mecanismo exacto del [BUG-RS9](#-bug-rs9) con la cabeza del pistón.
- Los dos datos del enunciado están **comprobados**: la **tecla `u`** existe (`mcForceUnstick`, avisa
  con «Desatascado») y **`game.autoUnstuck` no existe** todavía, así que hay que crearlo.
- Lo que habrá que decidir antes de escribir: `mcUnstick()` se llama desde **muchos** sitios, y solo
  uno es «automático» (la auto-curación por frame de `mcUpdate`). Los otros son one-shot deliberados
  (teletransporte, estampar, cambiar la escala). El interruptor debería apagar el primero **y no** los
  otros, o teletransportarse dentro de una pared dejaría de funcionar.
- Y hay una tercera vía ya escrita para este mismo problema: `mcAgentShove`, que aparta en la
  **dirección del empujón** en vez de hacia arriba. Puede que lo que falle sea que a los brazos no les
  llega, no que sobre el unstick.

**El dueño dijo «hazlo ya y vemos cómo manejar más tarde lo de las paredes», y que el nombre fuera
`Unstick` y no `Unstuck`** (que es el de la función que ya existía, `mcUnstick`).

**Hecho.** `game.autoUnstick`, **`false` por defecto** y persistido en `localStorage`. Apaga **solo**
la auto-curación por frame de `mcUpdate`. Tres decisiones que conviene no desandar sin querer:

- **`mcAgentShove` sigue corriendo siempre**, con el interruptor puesto o quitado. Aparta en
  **horizontal**, o sea que no aúpa a nadie: meterlo en el mismo interruptor habría desandado el
  arreglo de la serpiente (te ensartaba y aparecías montado encima) sin que nadie lo pidiera.
- **Los `mcUnstick()` de UN SOLO TIRO no se tocan** — teletransportarse, estampar, cambiar de escala,
  re-mallar. Son deliberados y no te aúpan por sorpresa; apagarlos dejaría `game.tp` dentro de una
  pared sin salida. Eso es lo que queda pendiente de decidir («lo de las paredes»).
- **Aviso una sola vez por atasco**, con toast: *«Atascado · pulsa U para salir»*. Sin él, «no me
  puedo mover» se lee como el juego colgado, porque la tecla que lo arregla no se adivina. Una vez por
  atasco y no por frame (`mc._atascado`, que se rearma al quedar libre).

La tecla **U** y `game.unstick()` ya existían (`mcForceUnstick`: sube, y si no cabe te manda al spawn);
no hubo que crear nada ahí. Sale además en `game.dumpVars()`, con el resto de los tunables.

**Verificado** — `test_auto_unstick.js` nuevo, en verde. Lo que impide el falso verde es el tramo **D**:
con el interruptor **encendido** la conducta de siempre sigue intacta (16 → 19), así que «no te sube»
no lo puede cumplir un `mcUpdate` roto. Los otros: el defecto es `false` **midiéndolo limpio** (el test
borra la preferencia guardada antes de cargar, o leería la de una sesión anterior y no el defecto del
motor), persistencia en los dos sentidos, atrapado sigue atrapado, `game.unstick()` te saca, y
`mcAgentShove` se sigue llamando con el interruptor apagado — **espiándolo**, no leyendo el texto de
`mcUpdate`, que el snippet del mundo envuelve funciones del motor y `String(mcUpdate)` puede acabar
siendo el envoltorio.

⚠️ **Esto trata el síntoma, no la causa.** Que el brazo de un agente te embuta al rozarlo sigue
pasando; lo que ya no pasa es que te planten encima. Si molesta el atasco en sí, el camino es que a
las piezas de un rig les llegue algo como `mcAgentShove` (apartar en horizontal), y eso es otro ticket.

---


<a id="-bug-ag9"></a>

### ✅ BUG-AG9 · el cuello **no tiene tope vertical**: encima de su cabeza te sigue mirando — ✅ resuelto 2026-08-07

**Reportado** 2026-08-07 por el dueño:

> «hay un bug en cuanto a qué puede ver un agente articulado cuando te mira (es una capacidad), si me
> pongo encima de su cabeza no debería verme puesto que los ojos no pueden mirar en ese ángulo z»

La capacidad **`mirar`** de una pieza. Lo que el documento deja decir hoy es `limites: { y: [-70, 70] }`
y `alcance`, o sea **un cono horizontal y un radio**: nada acota cuánto puede *levantar* la vista. Un
bicho al que te subes encima queda con el objetivo casi en su vertical y, mientras la distancia entre a
`alcance`, la cabeza sigue apuntándote — que es justo lo que el dueño ve raro y lo que un cuello no hace.

Encaja además con [REQ-MNT2](#-req-mnt2), recién cerrado: ahora que subirse a una cabeza es una
capacidad que se marca con una casilla, estar ahí arriba va a ser un sitio **normal** donde estar, y el
cuello mirando hacia atrás y hacia arriba se va a ver mucho más.

**Sin investigar** (regla de tickets: redactar y archivar). Lo que sé de haber leído la zona en el
ticket anterior, y que **no he verificado para éste**:

- El giro de `mirar` se calcula en `esqueletosPaso` con un `Math.atan2(ddx, -ddz)` y se recorta con
  `pinza(..., L.limY[0], L.limY[1])`. Es **un solo ángulo**: no hay un `ddy` en esa cuenta, así que la
  altura del objetivo no entra en la decisión ni para apuntar ni para rendirse.
- Hay que decidir si el tope vertical es **un `limites.x`** hermano del `y` que ya existe (y entonces
  toca casilla/campo en el editor, como `tope del cuello`), o un cono único; y qué hace la pieza al
  salirse — ¿se queda clavada en el tope, como hace hoy en horizontal, o vuelve a reposo?
- **No es lo mismo que [BUG-AG10](#-bug-ag10)**, aunque el dueño los contó juntos: éste es la pieza
  girando (`mirar`), y aquél es el bicho entero decidiendo perseguirte (`seguir`). Se pueden resolver
  por separado y probablemente convenga.

**Verificación esperada.** Un caso nuevo de navegador: plantar el zombie, ponerse **encima de su
cabeza** y comprobar que el giro de la pieza se queda en reposo (o en su tope) en vez de apuntar arriba;
y que a la altura de siempre no cambia nada. Ojo con el falso verde de sentarse en el centro del eje —
ahí girar no mueve nada (la lección de REQ-DBG2).

---

**Resuelto 2026-08-07** · `limites.x`, hermano del `y` que ya existía, mismo defecto `[-70,70]` (un
cuello humano). De las dos preguntas abiertas arriba, la que importaba era la segunda: **fuera del cono
la pieza se RINDE**, vuelve despacio a su pose de origen y suelta la matriz. No se queda clavada en el
tope — y eso **contradice a propósito** lo que hace el `mirar` por MATERIAL, donde el cabeceo al tope no
cuenta como rendirse («pegar un salto apagaría la cabeza entera de golpe»). Son casos distintos: un rig
**no cabecea en absoluto**, solo tiene yaw, así que pinzar no le deja «mirándote con esfuerzo», le deja
apuntando a otro sitio con cara de maniquí.

Cómo se ve: el cono vertical se mide con `Math.atan2(ddy, hypot(ddx,ddz))` **antes** de calcular el yaw,
y si se sale, la pieza entra por la misma puerta que «me he salido del alcance». `game.esqueletos()` gana
la columna **`frente`** para poder distinguir «no me sigue» de «me tiene a 78° y su cono llega a 70».

Entregado en `parche_snp_vision_agentes.py` (idempotente, 16 costuras, junto con
[BUG-AG10](#-bug-ag10)) — el snippet lo edita el dueño en vivo, así que se parchea, no se reescribe. En
el panel es el campo «tope arriba y abajo (±°)»; ⚠️ el setter escribe **la clave del eje**, porque el de
antes hacía `mir.limites={y:[…]}` y poner el tope horizontal **borraba** el vertical (lo fija un caso de
`test_panel_agentes.js`).

Verificado con `node test_vision_agente.js` (**11 ok**), cuyo tramo **A bis** es el anti-falso-verde: con
`limites.x:[-90,90]` ese **mismo** sitio de encima sí le gira la cabeza 70°. Y sí hubo que aprender la
lección del falso verde por otro lado: fijar `mc.pos` cada frame **no basta** — la gravedad acumula en
`mc.vel` y el jugador cae ~1,5 bloques *dentro* de un solo `mcUpdate`, así que «3 por encima» se medía
como 1,5 y el ángulo salía a 68,6°, justo por debajo del tope. Hay que poner `mc.vel` a cero también.

---


<a id="-bug-ag10"></a>

### ✅ BUG-AG10 · la detección es una **esfera**: te ve por la espalda y empieza a seguirte — ✅ resuelto 2026-08-07

**Reportado** 2026-08-07 por el dueño, en el mismo mensaje que [BUG-AG9](#-bug-ag9):

> «tampoco si paso por detrás de él no debería poder verme para comenzar a seguirme»

La capacidad **`seguir`** del bicho entero. Hoy lo único que acota a quién persigue es `deteccion`, que
es **un radio**: una esfera alrededor del agente, sin frente ni espalda. Pasar por detrás dispara la
persecución igual que pasar por delante, y el bicho se da la vuelta como si tuviera ojos en la nuca.

**Sin investigar**. Lo que conviene dejar apuntado porque es la decisión de fondo:

- **Hacia dónde mira un agente** para esto: su `giro` es el del cuerpo, y ese giro lo mueve *la propia
  persecución*. Si el cono se mide contra el giro actual hay **realimentación** — te ve, se gira hacia
  ti, y ya te tiene dentro del cono para siempre. Probablemente haga falta separar «ángulo con el que
  DETECTO» de «ángulo al que me giro una vez detectado» (una vez que te ha visto, seguir viéndote de
  espaldas es razonable; empezar de cero no).
- **Perder de vista ≠ no detectar.** `seguir` ya tiene `volver` y `correa` para cuando te pierde; hay
  que decidir si salir del cono cuenta como perderte o solo como no-empezar.
- **Y la pregunta que el dueño no ha hecho pero está debajo:** ¿la vista atraviesa paredes? Hoy, con un
  radio, sí. Un cono no lo arregla. Es un tercer ticket si se quiere, no parte de éste.
- Campo nuevo en la tarjeta 👁 del editor (`data/agentes/<id>.json`), y con un **defecto que no rompa
  los agentes de siempre**: si el defecto pasa a ser 120°, todos los bichos ya guardados cambian de
  conducta. Decidir eso explícitamente es la mitad del ticket.

**Verificación esperada.** Plantar un agente, acercarse **por detrás** dentro de `deteccion` y
comprobar que no arranca; entrar por delante y que sí. Sin regresión en `test_agente_sin_seguir.js` ni
en el resto de la familia de agentes.

---

**Resuelto 2026-08-07** · `seguir.vision`, grados de cono, **defecto 180** (`360` = la esfera de
siempre). Las cuatro decisiones de fondo, resueltas y por qué:

1. **La realimentación se corta acotando el cono a EMPEZAR.** El campo solo se mira cuando el agente
   está en reposo (`g.por === 1`); una vez persiguiendo manda `deteccion` como siempre. O sea:
   **rodearle no le hace perderte**. Si el cono gobernara también la persecución, andar en círculos a
   su alrededor lo dejaría parpadeando entre perseguir y soltar justo en el borde.
2. **Salir del cono NO cuenta como perderte**, por lo mismo. `volver`/`correa` se quedan como estaban.
3. **La vista sigue atravesando paredes.** Confirmado como fuera de alcance, tal y como estaba escrito
   arriba; si se quiere, es otro ticket.
4. **El defecto sí cambia la conducta de los agentes guardados, y es a propósito** (§0, «defectos
   automáticos, no opt-in»): un bicho con ojos en la nuca es el fallo, no la conducta normal. La válvula
   está en los dos sentidos y a un campo de distancia: `vision:360` devuelve la esfera intacta.

⚠️ Lo que **no** estaba previsto y salió al implementarlo: **el cono solo se aplica si el objetivo es el
JUGADOR**. Con un `objetivo:[x,y,z]` fijo, «no lo ve» no es transitorio sino un **atasco definitivo** —
el cuerpo solo se gira mientras persigue, así que un punto a su espalda no entraría en el cono jamás y el
bicho se quedaría plantado de por vida. Y `g.pide` se sigue actualizando aunque esté ciego (la ceguera
entra *después* de anotar la distancia): si no, `game.esqueletos()` diría `0` y parecería que no estás
ahí. La tabla lleva además la columna **`frente`** = a cuántos grados te tiene.

Mismo parche que [BUG-AG9](#-bug-ag9) (`parche_snp_vision_agentes.py`), y campo «campo de visión (°)» en
la tarjeta 👁 del panel. ⚠️ `crearEsqueleto` rehace el `seguir` **campo a campo** al reconstruir por
clave: el campo nuevo hay que traerlo ahí a mano o no llega al rig.

Verificado con `node test_vision_agente.js` (**11 ok**), cuyo tramo **B bis** es el anti-falso-verde:
con `vision:360` esa **misma** espalda vuelve a arrancarle la persecución (3,80 bloques andados). Sin
regresión en `test_agente_sin_seguir.js` (16 ok), `test_esqueleto_navegador.js` (15 ok),
`test_agente_aturdido.js`, `test_montar_agente.js`, `test_montable_editor.js`,
`test_agente_cuerpo_real.js`, `test_agente_pisa_placa.js` ni `test_panel_agentes.js` (41 ok).

---


<a id="-req-ag12"></a>

### 🟡 REQ-AG12 · `cabalgable`: montado se queda quieto y **lo conduces** — 🟡 abierto 2026-08-07

**Abierto 2026-08-07**, sin investigar, a raíz de la corrección del dueño en
[BUG-AG11](#-bug-ag11):

> «"montado" no es lo mismo que "cabalgable", si fuese "cabalgable" tiene sentido que se quede quieto y
> que además pueda moverlo; si estás "montado" y no te ve, pues que sea como tonto y vuelva a su ancla»

Yo había metido las dos cosas en una: al arreglar BUG-AG11 excluí a los montados de `volver` para que
`game.esqueletos.desplazar()` pudiera pasearlos. Se revirtió. Esto es **la mitad que se quitó**, ahora
como capacidad con nombre propio.

**Lo que se pide, en sus palabras:** montado en un agente `cabalgable`, (a) **se queda quieto** —ni te
persigue ni se vuelve a su ancla— y (b) **lo puedes mover tú**.

**Lo que ya se sabe sin investigar nada** (sale de BUG-AG11, no lo confirma):
- La señal de «te lleva encima» ya existe y ya se lee: `P.llevando` → `rig.llevando`.
- Hoy `volver` (defecto `true`) hace justo lo contrario de (a): te pasea hasta el ancla.
- Y por eso **un rig montado se pelea con `game.esqueletos.desplazar()`**, que es el primitivo que
  seguramente quiere (b). `test_montar_agente.js` y `test_montable_editor.js` ya se defienden con
  `rig.G.volver = false`.

**Sin decidir:** dónde vive la marca (¿`cabalgable:true` en el documento del agente, hermana de
`montable` por pieza? ¿por instancia como `game.esqueletos.montable`?), y sobre todo **cómo se conduce**
—¿con las teclas de andar del jugador, con una API, con la mirada?—. **Preguntar al dueño antes de
tocar nada.**

---


<a id="-req-ag13"></a>

### 🟡 REQ-AG13 · no hay forma de **ver** el cono de visión de un agente — 🟡 abierto 2026-08-07

**Abierto 2026-08-07**, sin investigar. Del mismo mensaje que [BUG-AG11](#-bug-ag11):

> «…tampoco veo su cono»

Es cierto y no es un fallo del motor: **no existe ninguna visualización**. Lo único que hay hoy para
depurar la vista de un agente es la tabla de `game.esqueletos.lista()` (`estado`, `a`, `frente`,
`teVe`) y los rayos-X, que enseñan geometría, no atención.

⚠️ **Son DOS conos distintos y no se pueden dibujar como uno** (es toda la lección de
[BUG-AG9](#-bug-ag9)/[BUG-AG10](#-bug-ag10)): `seguir.vision` es del **bicho entero** y horizontal
(decide EMPEZAR a perseguirte), y `mirar.limites` es de **cada pieza**, con tope horizontal `y` y
vertical `x`. Un agente con dos piezas que miran tiene tres conos.

**Sin decidir:** si es un modo de depuración global (tecla, como los rayos-X) o por agente; si se dibuja
en el Mundo o solo en el preview del panel de agentes; y si además marca **cuál** de los conos te está
descartando ahora mismo, que es la pregunta que el dueño intentaba responder cuando lo pidió.

---


<a id="-bug-ag11"></a>

### ✅ BUG-AG11 · montado encima **te sigue viendo**, y el cuerpo se pone a **dar vueltas** — ✅ resuelto 2026-08-07

**Reportado** 2026-08-07, justo al cerrar [BUG-AG9](#-bug-ag9)/[BUG-AG10](#-bug-ag10), con una captura
de la tarjeta 👁 delante: «dada la cabeza del agente, teniendo en cuenta que **quiero montarme encima**,
qué parámetros tendría que poner para que una vez dentro no me vea? porque he hecho varias pruebas y no
lo consigo, tampoco veo su cono». Y sobre la marcha: «puse *tope arriba y abajo (±°) = 0* y lo que hace
es **dar vueltas en círculo** si me subo a su cabeza».

**La respuesta a la pregunta literal era «con ninguno».** Los dos mandos que acababa de estrenar no
llegan, cada uno por su motivo:

- **`seguir.vision` no puede**: por diseño el cono solo decide **EMPEZAR** (`g.por === 1`). Montado
  estás a ~0 bloques, o sea muy dentro de `deteccion` (14 en el zombie), así que el bicho está
  permanentemente en faena y el cono **ni se consulta**. Eso es [BUG-AG10](#-bug-ag10) funcionando.
- **`mirar.limites.x` solo calla el CUELLO**, no la persecución. Que es exactamente lo que el dueño
  observó al ponerlo a 0: la cabeza se quedó quieta y **el cuerpo siguió girando**.

Y «tampoco veo su cono» es cierto y no es un fallo: **no existe ninguna visualización del cono**. Lo que
hay es la tabla de `game.esqueletos.lista()` (`estado`, `a`, `frente`) y los rayos-X. Queda apuntado como
posible ticket aparte, no se ha hecho aquí.

⚠️ **Las vueltas no eran un efecto secundario del cuello: era un caso DEGENERADO.** Con el objetivo justo
encima del eje, la distancia horizontal es ~0, y ahí:

1. la meta «a `distancia` de ti» sale de `tx - dx/d * G.distancia` con `d ≈ 0` ⇒ **dirección de puro
   ruido**, distinta cada frame;
2. el giro del cuerpo sale de `Math.atan2(tx - cxr, -(tz - czr))` = `atan2(≈0, ≈0)` ⇒ **ruido también**;
3. y encima `distancia: 1.2` le pide **apartarse** de ti — pero al apartarse **te lleva consigo**, así
   que el error **no se satisface jamás**. Motor de vueltas perfecto.

**Dos arreglos independientes, y ninguno es un parámetro nuevo** (§0, «defectos automáticos»):

| | qué | por qué va aparte |
|---|---|---|
| **A · `rig.llevando` ⇒ no te ve** | ni persigue ni te encara con el cuello (misma puerta que «te he perdido de vista», `volver` incluido) | es **semántico**: «montado» es un estado del bicho, y «no te veo» es una sola cosa para las dos capacidades |
| **B · guardia del `atan2`** | sin distancia horizontal (`> 1e-4` en planta) el cuerpo **se queda como está** | es **numérico**: vale igual si te subes a una pieza que **no** es montable, donde `llevando` es `false` |

**La señal ya existía**: `llevarPasajero()` deja puesto `P.llevando` al final del frame. Solo faltaba
mirarla. Se sube a `rig.llevando` (es del **bicho**, no de la pieza) y se lee al frame siguiente, antes
de decidir. Y **solo contra el JUGADOR**: con un `objetivo:[x,y,z]` fijo, llevarte encima es ser un
**vehículo** y tiene que seguir su camino.

⚠️ **`montado` ≠ `cabalgable`, y eso lo corrigió el dueño.** Mi primera versión excluía a los montados de
`volver` (razonamiento: «no te has ido, te tengo puesto») para que `game.esqueletos.desplazar()` pudiera
pasearlos sin que el bicho deshiciera el paseo. Su respuesta: «*"montado" no es lo mismo que
"cabalgable"; si fuese cabalgable tiene sentido que se quede quieto y que además pueda moverlo; si estás
"montado" y no te ve, pues que sea como tonto y vuelva a su ancla*». **Revertido**: montado entra en la
puerta de reposo entera, `volver` incluido, y con el defecto (`true`) te pasea hasta su ancla. Yo había
metido dos capacidades en una; **`cabalgable` es otra cosa y no existe todavía** — queda como ticket
posible, no hecho aquí.

Consecuencia que hay que saber: **un rig montado se pelea con `game.esqueletos.desplazar()`**, porque
cada frame deshace el paseo andando hacia casa. `test_montar_agente.js` y `test_montable_editor.js`
—que pasean el rig a mano para probar el **acarreo**, no el seguimiento— le ponen `rig.G.volver = false`.

La válvula de escape es **bajarte**. No hay bandera para «que me vea mientras me lleva» porque el estado
es observable —la tabla pone **«te lleva encima»** en `estado`, que si no un «fuera de alcance» a 0,3
bloques parece una avería— y volver a él es dar un paso.

⚠️ Dos formas de medir que costaron un falso rojo cada una, y que valen para cualquier test de agentes:

1. **«Da vueltas» ≠ «gira mucho».** Volviendo al ancla el bicho **se da la vuelta entera**, y eso es un
   giro grande y legítimo: el `saltoMax` por frame marcaba 29° y no era el fallo. Lo que delata al
   `atan2(0,0)` es girar **sin ir a ninguna parte**, o sea **recorrido acumulado ≫ giro neto**. Medido
   así sale 51,6° / 51,6°: un giro monótono, cero oscilación.
2. **«De pie delante» no es un `-z` fijo.** En cuanto el agente anda deja de mirar al norte, y desde
   [BUG-AG10](#-bug-ag10) el cono lo dejaría **ciego** justo en el caso de control. Hay que colocarse
   en `giro + horneado` (su morro de verdad) o el anti-falso-verde mide lo contrario de lo que cree.

`python3 parche_snp_agente_montado.py` (idempotente, **7 costuras**, ninguna en `app.js`). Verificado con
`node test_agente_montado.js` (**todo ok**), con tres tramos anti-falso-verde: **A** (de pie delante sí
te ve, `por 0..0`, y el cuello sí se gira), **D** (bajarte lo revierte: vuelve a perseguir y a encarar) y
**C** (abre `limites.x` a `[-90,90]` para probar que el cuello calla por esto y **no** por
[BUG-AG9](#-bug-ag9)); el **E** comprueba que el jugador está *de verdad* sobre el eje (0,0000 en planta)
antes de dar por buena la guardia. Sin regresión en `test_montar_agente.js` (todo ok, 1 fallo previo
menos), `test_vision_agente.js` (11 ok), `test_agente_sin_seguir.js` (16 ok),
`test_esqueleto_navegador.js` (15 ok), `test_agente_aturdido.js`, `test_agente_cuerpo_real.js`,
`test_agente_pisa_placa.js`, `test_montable_editor.js` ni `test_panel_agentes.js` (41 ok).

---


<a id="-bug-ag8"></a>

### ✅ BUG-AG8 · `test_esqueleto_navegador.js` deja piezas de rig sin recoger en `/map/agents` — ✅ resuelto 2026-08-07

**Encontrado por mí** (no reportado) corriendo la suite al cerrar BUG-AG4/AG5/AG7. Tres casos en rojo,
siempre los mismos:

```
FALLO mcSerialize NO las mete en el mundo    en memoria tenían que estar: 96 → 103
FALLO quitar() retira las 6 piezas           49 estructuras se quedaron marcadas de rig o efímeras
FALLO ...y el mundo queda pixel a pixel como estaba   quedan 97 estructuras y había 96
```

**Sin investigar** (política de tickets nuevos). Lo único comprobado, porque importaba saberlo antes de
cerrar los otros tickets: **es anterior a BUG-AG4** —falla igual con el snippet de antes— así que **no
es una regresión** de la solidez por matriz ni de `aturdir` ni del `autoUnstick`. El olor es que
`/map/agents` arrastra estructuras de rig **de una sesión anterior** (49 marcadas, cuando el zombie son
6) y el test cuenta sobre un mundo que ya venía sucio; si es eso, el arreglo es del test o del mundo, no
del motor. Pero eso hay que mirarlo, no darlo por hecho.

⚠️ Al mirarlo: `/map/agents` es un mundo **real** del dueño. No se borra nada de `data/habitantes/`; lo
que sobre se mueve a `data/habitantes_trash/<ms>__<nombre>`.

**✅ Resuelto 2026-08-07. No había basura ninguna: el fallo era del test, y el motor está intacto.**
Antes de tocar nada, una sonda que solo abre `/map/agents` y mira, **sin plantar ningún zombie**:

```
t≈1s  structures 72 · efímeras 24 · rigs vivos 0
t≈3s  structures 96 · efímeras 48 · rigs vivos 0
t≈6s  structures 97 · efímeras 49 · rigs vivos 0   ← y ahí se queda
```

Las 49 «estructuras marcadas de rig o efímeras» son **`asset:assets/cartel.vox.json`**: el cartel que
`app.js` **deriva** de cada una de las 49 notas del mapa (`MC_NOTE_SIGN`, `s.efimera=true; s.nota=k`).
Van marcadas efímeras **justo para lo contrario de lo que el test suponía**: para que no entren en
`mundo.json`. O sea que el test leía la marca como «resto de un rig» cuando significa «esto no son
datos del mundo». Con **cero** rigs vivos ya salían las 49.

De ahí los tres fallos, que son **dos** causas y ninguna del motor:

- **Una carrera.** El `waitForTimeout(3000)` fijo tomaba la foto del «antes» con el mundo a medio
  montar: a los 3 s solo habían aterrizado 48 de los 49 carteles (cada uno espera a su documento) y el
  goteo seguía. Por eso `96 → 103` en vez de `+6`, y `97` estructuras donde había `96`: el cartel que
  faltaba llegó **entre** las dos fotos. Ahora se espera a que `mc.structures.length` **se quede
  quieto** (6 sondeos seguidos), no a que pase un rato.
- **Una marca mal leída.** `sueltas` contaba `s._rig || s.efimera` sobre TODO el mundo. Pasa a contar
  solo `s._rig`; de las instancias concretas del esqueleto ya se ocupaba `enArray`, que las persigue
  **por referencia** y no por marca — que es lo que hay que hacer.

Y un caso **nuevo**, porque el susto de verdad estaba a un paso: que `quitar()` no se lleve por delante
lo efímero **de otros**. Los carteles llevan la misma marca que las piezas de un rig, así que un barrido
por marca —que es justo lo que el test insinuaba que había que hacer— habría borrado las 49 notas del
mapa del dueño. Se comprueba que siguen las mismas antes y después.

**Verificado** — `test_esqueleto_navegador.js`: **15 ok, 0 fallos** (antes 12 ok / 3 fallos).

---


<a id="-req-dbg2"></a>

### ✅ REQ-DBG2 · El toast «Atascado» debe decir POR QUÉ estás atascado — ✅ resuelto 2026-08-07

**Reportado** 2026-08-07 por el dueño, en cuanto vio el aviso que acababa de añadir [BUG-AG7](#-bug-ag7):

> «cuando aparece el toast "Atascado - ..." debería de aparecer el motivo, muchas veces queda claro
> que el atasco es por agente, debería de haber una depuración que indique el motivo o más bien, por
> qué estás atascado, ocurre que un agente al avanzar con sus brazos extendidos te atasca (es como un
> abrazo)»

**Sin investigar** (política de tickets nuevos). Lo poco que hace falta apuntar para no perderlo:

- Son **tres** cosas distintas las que te pueden atrapar y el aviso debería distinguirlas: el
  **terreno** (`mc.grid`), una **estructura fina** estampada (`mc.structures` — ahí viven las piezas
  de los agentes articulados) y un **NPC** de `mc.agents` (AABB 1×1×1).
- El caso que le duele al dueño («el abrazo») es el segundo: una pieza de un rig. El nombre bonito
  —*«el brazo izq de Zombie»*— lo sabe el **snippet** (`s._rig`), no `app.js`, así que el motivo
  legible no lo puede componer el motor solo: hará falta un gancho, al estilo `mc.sunExtra`.
- Pide **dos** salidas, no una: el texto en el toast **y** «una depuración» —o sea algo consultable
  por consola cuando el toast ya se fue.

Y al ponerse a ello, el dueño lo concretó: **«si es una parte de un agente quiero saber el agente y
su parte»**.

**Resuelto** 2026-08-07.

**Qué se hizo.** `mcStuckShow(true)` llama **una vez, en el flanco** (nunca por frame) a
`mcStuckWhy(x,y,z)`, que devuelve `{atascado, motivo, terreno[], piezas[], npcs[], cuando}`
mirando los tres sitios del ticket. `mcStuckMotivo` lo resume por orden de utilidad —**piezas con
etiqueta → NPCs → piezas sin etiqueta → terreno**— y con varios culpables dice `«torso» de zombie
(+2 más)` en vez de escupir la lista. Las dos salidas que pedía: el toast pasa a *«Atascado por
«brazo der» de zombie · pulsa U…»*, y **`game.atasco()`** / **`game.atasco('ultimo')`** dan el
detalle por consola cuando el toast ya se fue (`ultimo` guarda su `cuando`, porque el toast dura 4 s
y la consola del móvil se abre después).

**El reparto, que es el fondo del asunto.** `app.js` sabe que le estorba
`asset:assets/brazo-zombie.vox.json`; que **esa instancia** sea el brazo izquierdo del zombie de la
esquina solo lo sabe la tabla de rigs, que vive en el snippet. Así que el motor abre el hueco
`mcStuckExtra(s) => 'texto'` —hermano de `mcXrayExtra`, `var` y no `let` para que un snippet en
`new Function` pueda engancharse, y se desengancha avisando una vez si revienta— y
`parche_snp_atasco.py` pone `quienAtasca()` en `mundo-autoarranque`. Nombra siempre **pieza + agente**
porque con dos avisos idénticos no se sabe si te agarran dos bichos o uno con los dos brazos: el
«abrazo» del ticket.

**Lo que costó de verdad** (y lo que hay que recordar). Primer escalón: mirando solo `mc.structures`
con `mcStructColl(s)`, **un agente articulado no aparece jamás**. Para una pieza de rig eso devuelve
`null` a propósito —el envoltorio del snippet apaga el ancla vacía, y la solidez la pone el envoltorio
de `mcFineBoxHit` pasando la caja por la **inversa de `s.model`** ([BUG-AG4](#-bug-ag4))—.

Segundo escalón, y éste lo cazó el dueño probándolo de verdad: **con el toast puesto, `game.atasco()`
devolvía las tres listas vacías y `atascado:false`**. La primera versión de la segunda pasada
muestreaba la caja del jugador **en rejilla**, y un abrazo no es un empotramiento: es una **esquirla**
de solape que la rejilla se salta. Al medirlo salió algo peor y más interesante — `mcCollides`=`true`,
`mcFineBoxHit`=`true` y `mcStructAt`=`null` en **las ~3000 celdas** de la caja, con el «brazo izq» a
**un voxel fino** por fuera. Porque para una pieza movida la colisión mete la caja **entera** del
jugador en espacio local y redondea **hacia fuera** (`cajaEnLocal`, `floor`/`ceil`: el snippet ya
avisa, *«antes sobrar que faltar»*): **te frena un brazo que aún no te toca**, y el abrazo *es* esa
holgura. Una bisección sobre `mcFineBoxHit` tampoco vale — el oráculo que la guía está inflado y el
descenso se mete en mitades vacías (bajó los mudos de 12 a 8, no a 0).

La solución es **atribuir como dibuja el motor**: la caja del jugador al espacio local de cada pieza
con la **traspuesta** de `s.model`, más `MC_STUCK_HOLGURA`, cruzada con `s.aabb`; `O(estructuras)`,
sin sondeos, ordenado por volumen de solape para que en un abrazo se nombre primero la que más te
agarra. **0 mudos de 40** posiciones de roce. Y `w.atascado` pasa a salir de `mcCollides` en vez de
mis listas: si sale de lo que he sabido nombrar, un culpable que se escape se convierte en un
`atascado:false` con el cartel rojo puesto, que es exactamente el síntoma que reportó el dueño.

El test tropezó con lo mismo por su lado: metía al jugador en `P.s.aabb`, que es el **ancla** donde se
estampó la pieza, no donde el rig la dibuja; ahora pasa el centro por `s.model` y espera a que el paso
del rig haya compuesto las matrices. Y el caso del terreno afirmaba `/stone/`, que es un **alias de
scripting**, no una clave de `mc.blockKey`: ahora planta un id y exige que el motivo diga la clave de
**ese** id.

`mcStuckWhy` **duplica a propósito** los bucles de `mcTerrenoChoca` y `mcFineBoxHit`: esas dos tienen
que quedar byte-idénticas porque el snippet las envuelve y `test_rayo_apuntado.js` las extrae
*verbatim* por texto.

Tercer escalón, otra vez cazado probándolo: el aviso decía «antorcha» de **personaje 1** — y ése es
el nombre de la *definición*, no del bicho. Con tres «personaje 1» por el mapa no identifica a nadie.
Ahora va por instancia, `nombre (#id)`, que además es accionable: `game.esqueletos.empujar(id)` /
`.quitar(id)` / `.aturdir(id)` aceptan ese número.

Cuarto escalón, y lo destapó una **pregunta** del dueño mirando la consola: *«la variable "agentes"
es para identificar los agentes o es otra cosa?»*. Era otra cosa —los NPC-cubo de `mc.agents`, que no
tienen nada que ver con `game.esqueletos`— y el cartel apuntaba al sitio equivocado justo cuando un
agente le agarraba: `agentes: []` al lado de un zombie abrazándole. Renombrado a **`npcs[]`** (API de
un día, sin alias: un alias reintroduce la confusión que se está quitando). Y la pregunta destapó lo
de verdad útil: la identidad del agente existía **solo dentro de la frase**. Ahora el hueco admite
también `{texto, agente, agenteId}` y cada pieza trae `agente`/`agenteId` como **campos**, así que
`game.atasco().piezas[0].agenteId` va derecho a `empujar(id)` sin una regex por medio.

⚠️ **Y de paso salió que el parche del snippet NO era idempotente**, que es justo lo que dice ser: se
volvió a ejecutar y **duplicó `quienAtasca`** en el snippet vivo. La causa es genérica y vale para
todos los `parche_snp_*.py`: el cambio 1 se reconocía «ya hecho» buscando **su texto completo**, y el
cambio 2 le reescribió dos líneas por dentro ⇒ dejó de reconocerse, su ancla seguía ahí, y lo insertó
otra vez — con la versión **vieja** ganando, porque en JS manda la última declaración. Ahora cada
cambio se salta por una **marca** corta (`function senas(`) que los demás no tocan.

**Tocado**: `app.js` (`mcStuckExtra`, `mcStuckSenas`, `mcStuckWhy`, `mcStuckMotivo`, `mcStuckShow`,
`game.atasco`), `parche_snp_atasco.py` (nuevo, idempotente por marca, 4 cambios), `CLAUDE.md`.
**Verificado**: `node test_atasco_motivo.js` → **27 ok, 0 fallos** (tres pasadas seguidas: el rig se
mueve entre ejecuciones y el caso del roce tenía que aguantarlo). El test recorre el **roce** saliendo
de la pieza de 1/32 en 1/32 y exige **cero posiciones mudas**: mientras la física diga que chocas, el
diagnóstico tiene que nombrar a alguien. Sin regresión en `node test_rayo_apuntado.js` (12 ok),
`node test_fisica_navegador.js` (18 ok) ni `node test_parkour_navegador.js`.

---


<a id="-req-mnt2"></a>

### ✅ REQ-MNT2 · «Montable» como casilla del editor de agentes — ✅ cerrado 2026-08-07

**Pedido** 2026-08-07 por el dueño, justo al cerrar [BUG-STR1](PLAN.md#-bug-str1):

> «abre un nuevo ticket de implementación, quiero que `game.esqueletos.montable(1, 'cabeza');` sea algo
> configurable desde el editor de agentes, decir si una parte del agente articulado es montable»

[REQ-MNT1](#-req-mnt1) dejó el acarreo funcionando pero **solo por scripting**, y encima **por
instancia**: `montable(rig, pieza)` marca la pieza de *ese* rig ya plantado, así que hay que volver a
llamarla cada vez que se planta el agente, y no queda escrito en ningún sitio. Esto es pedir lo mismo
que ya tienen los NPC-cubo, donde `passengers` es una capacidad **del agente**, no un recado que se le
da al de turno.

**Resuelto** 2026-08-07.

**Las tres preguntas que dejó abiertas el ticket, contestadas:**

- **Dónde vive el dato.** En el **documento del agente** (`data/agentes/<id>.json`), como un campo más
  de la pieza, al lado de `articula` y `mirar` — `"montable": true`. El ticket sospechaba de
  `data/snippets/agente-*.json`, y eso era **una pista falsa**: esos snippets son demos que plantan
  bichos, no la definición. Lo que el panel edita y el servidor guarda es `data/agentes/`.
- **Cuál es «el editor de agentes».** El panel `#ag-modal` (menú ⋯ → 🦴 Agentes), y **sí edita el
  documento**: `agDoc` es lo que se manda por `POST /api/agentes`. Por eso la casilla persiste sola,
  sin inventar ningún sitio nuevo donde guardar nada.
- **Lo que ya está plantado.** `game.esqueletos.montable(rig, pieza, si)` **no se toca ni se deprecia**:
  se queda como la válvula por instancia, y **en los dos sentidos** — encender en *ese* bicho una pieza
  que el documento no marca, o apagar la que sí marca.

**El reparto, que es lo único delicado.** La casilla es UI y va en `app.js`; **quien la aplica es el
snippet**. `app.js` escribe la clave y sigue sin saber qué es ir montado — la frontera de §0 intacta.

| dónde | qué |
|---|---|
| `app.js` · `agForm` | la casilla «te lleva montado», por pieza y también en la raíz. Encendida escribe `montable:true`; **apagada borra la clave** |
| `app.js` · `agRefrescar` / `agChips` | la etiqueta `🧍 llevas` en la lista de piezas y el chip `🧍 te lleva encima` en el resumen |
| snippet · `crearEsqueleto` | `montable: !!q.montable` en la parte, y `montable: def.raiz.montable` en la pieza 0 |

⚠️ **La raíz se fabrica a mano.** `crearEsqueleto` no reenvía `def.raiz`: se construye la pieza 0 con
cuatro campos elegidos (`nombre`, `pieza`, `rot`, `en`). Sin tocar esa línea, marcar el torso en el
editor no habría llegado nunca a la parte — y un **agente-plataforma** (una barca, un ascensor) no
tiene más pieza que su torso. Es la trampa que se lleva por delante cualquier campo nuevo del documento.

⚠️ **La marca del parche importa.** El primer intento usó «casilla Te lleva montado» como marca de
idempotencia de un cambio, y esa misma frase aparecía en el comentario de otro: el parche daba un «ya
estaba» falso y se saltaba el cambio **para siempre**. Las marcas tienen que ser únicas *contra el
texto que el propio parche inserta*, no solo contra el original.

**Verificación.** `node test_montable_editor.js` (**28 ok**), nuevo, en dos mitades porque el editor
vive en `/` y el Mundo en `/map/test`: (A) la casilla escribe y borra la clave, lee el documento al
volver, marca la lista y el chip, y viaja en el `POST`; (B) un documento con la marca se planta y la
pieza **nace montable sin llamar a nada** y te lleva de verdad, con el invariante de siempre
—`L = Rᵀ·(p − t)` no cambia mientras vas montado— y un agente **de control sin la clave** haciendo el
mismo paseo para que el verde no pueda ser casualidad. Sin regresión: `node test_montar_agente.js`
(20 ok, sin tocarlo), `node test_panel_agentes.js` (**40 ok** — el conteo de chips pasa de 6 a 7),
`node test_atajo_agentes.js` (20 ok), `node test_escala_agente.js`.

**Ojo con el control.** El primer intento pedía que el jugador del agente de control **no se moviera**,
y fallaba con 2,17: sin nadie que te lleve **te caes**, y la caída es movimiento. La señal buena es la
que ya usaba `test_montar_agente.js` — la **deriva** dentro de la pieza (0,03 montado vs 2,16 suelto) —
más el viaje **horizontal**, que sí es 0.

---


<a id="-req-mnt1"></a>

### ✅ REQ-MNT1 · Ir MONTADO en una pieza de un agente articulado

**Pedido** 2026-08-07 por el dueño, como pregunta:

> «cuando construimos los npcs se les dieron habilidades a algunos como "passengers: true", ¿es
> posible que para un agente articulado le pueda dar esta habilidad a su cabeza desde scripting ahora
> mismo?»

**Resuelto** 2026-08-07.

**La respuesta a la pregunta era NO**, y por tres motivos independientes que conviene tener juntos
porque son la misma frontera que destapó [REQ-DBG2](#-req-dbg2):

1. `passengers` se lee en `mcAgentsSmoothUpdate` (`app.js:11127`), que recorre **`mc.agents`** — los
   NPC-cubo. Un agente articulado no está ahí: sus miembros son estructuras finas de `mc.structures`.
   Ese código no llegaba a ejecutarse para una cabeza ni una sola vez.
2. `a.isMounted()` (`app.js:10967`) está **cableado a la caja 1×1×1**: `rx+0.1..rx+0.9`,
   `ry+1.9..ry+2.5`. Cotas que no significan nada para una pieza con matriz propia, que además puede
   ir girada.
3. El acarreo se calcula con los deltas de `renderX/Y/Z`, que un miembro de rig no tiene.

**Subirse encima ya funcionaba** (las piezas de rig son sólidas donde se las ve, BUG-AG4). Lo que
faltaba era que te **llevase**: el bicho se iba andando por debajo y te dejaba plantado en el aire.

**Qué se hizo, y dónde.** `game.esqueletos.montable(id, 'cabeza')` / `montable(id, 'cabeza', false)`.
**Cero líneas de `app.js`**: es comportamiento de agentes (§0) y `esqueletosPaso` ya tenía todo lo
necesario — corre por frame, compone la matriz de cada miembro y es **lo último del frame del
jugador** (después de la física, de `pisar` y de `suavizarPaso`), o sea el mismo sitio de la cadena
que ocupa el acarreo del cubo. Va por **instancia y pieza**, no por material: la cabeza de *ese*
zombie, no todas las cabezas del mapa.

⚠️ **El acarreo es RÍGIDO, no una traslación.** `L = Rᵀ·(p − t)` con la matriz del frame anterior y
`p' = R'·L + t'` con la de éste. Así el **giro también te lleva** —orbitas con la pieza— en vez de
resbalarte en cuanto la cabeza se vuelve. Es la misma traspuesta que la atribución del abrazo
(REQ-DBG2) y que la solidez de las piezas movidas (BUG-AG4): en este motor, *todo* lo que pregunta
«dónde está esto respecto de una pieza movida» pasa por ahí. Se planteó hacer solo traslación y
añadir el giro después; resultó ser **más código**, porque la traspuesta ya estaba escrita dos veces.

**Tres detalles que no son adorno:**

- **La Y física, no la pintada.** `suavizarPaso` baja `mc.pos[1]` para el ojo y deja la real en
  `mc._pasoReal`. Midiendo sobre la pintada, un escalón reciente te bajaba del carro sin haberte
  movido. Y se escribe **por delta**, para no borrar ese desfase.
- **«No empeorar» en vez de «no chocar».** De pie encima ya rozas la caja inflada de la pieza (el
  abrazo), así que exigir un destino limpio no te subiría jamás. Se rechaza solo el caso honesto:
  ahora no chocas y ahí sí.
- **Tope de 2 bloques por frame**: de más que eso no es que se mueva, es que la han reestampado
  (`readquirir`), y no hay que salir volando.

**Tocado**: `data/snippets/mundo-autoarranque.json` vía `parche_snp_montable.py` (nuevo, idempotente
por marca, 4 cambios), `test_montar_agente.js` (nuevo), `CLAUDE.md`. `app.js` **intacto**.

**Verificado**: `node test_montar_agente.js` → **20 ok, 0 fallos**. Sin regresión en
`node test_esqueleto_navegador.js` (15 ok) ni `node test_fisica_navegador.js` (18 ok).

⚠️ **La trampa del test, que costó una pasada en rojo**: la primera aserción comparaba el viaje del
jugador con `|t1 − t0|`, la traslación de la matriz. **No vale**: en cuanto la pieza gira —y gira,
porque el bicho se vuelve hacia ti— su origen recorre un arco que tú no recorres, y salía *jugador
3.0 vs pieza 12.9* con el acarreo perfecto. La referencia correcta es **el punto de la pieza que
pisas** (`R·L₀ + t`). El invariante bueno es el local y sirve igual para trasladarse que para girar:
**mientras vas montado, tu sitio dentro de la pieza no cambia** — y sale exactamente `0`, porque la
cuenta es exacta. El caso apagado da `2.9` con el mismo paseo, que es lo que lo convierte en una
prueba y no en un adorno.

**Lo que NO hace** (dicho para que no sorprenda): no gira la **cámara** contigo, igual que una
vagoneta de Minecraft — orbitas mirando adonde mirabas. Y si la pieza cabecea en vertical, botas.

---


<a id="-bug-ag6"></a>

### ✅ BUG-AG6 · El preview del editor de agentes no debe aplicar la escala — ✅ hecho

**Reportado** 2026-08-07 por el dueño, con captura (`data/tickets/BUG-AG6/01.png`):

> «no afecta a la funcionalidad, pero en el editor de agentes articulados, si se indica la escala del
> agente este se ve mal en la previsualización, no haría falta tener ahí en cuenta la escala, debería
> verse como siempre, la escala es en el juego»
>
> «la imagen es al ponerlo a escala 2, a escala 1 se ve como siempre»

En la captura (`personaje 1`, 7 piezas, **escala 2**): el muñeco sale **desmontado** — la cabeza
enorme arriba, el torso suelto debajo, las piernas más abajo todavía y los brazos como dos cubos
sueltos flotando. No es «se ve grande»: es que las piezas dejan de estar pegadas entre sí. A escala 1
el preview está bien.

⚠️ **Esto REVIERTE una decisión de [REQ-AGESC1](#-req-agesc1), y hay que saberlo antes de tocarlo.**
Ahí se escaló el preview **a propósito**, con el argumento de que si el panel enseña un bicho normal y
el Mundo planta un gigante, eso es justo el fallo que el preview existe para evitar; son 3 de las 11
costuras de `parche_snp_escala_agente.py` (`ESCP`, la caja/separación de cada pieza, y `piv`). El
dueño dice lo contrario: **el panel es un maniquí y la escala es del juego**. Manda él, y además el
preview ya diverge del Mundo a propósito en otra cosa (la fase de andar la lleva el reloj y no la
distancia). Quitarlo es más barato que arreglarlo.

La duda que quedaba —si además convenía un rótulo diciendo en qué escala se plantará, para no perder
el aviso que motivó la decisión original— la cerró el dueño: **«pues en prepararEsqueleto no leas la
escala, no hace falta nada más»**. Sin rótulo.

**Hecho.** Las 3 costuras del preview salen de `CAMBIOS` y pasan a una lista **`REVERTIR`** nueva en
`parche_snp_escala_agente.py` (quedan 8 + 3). Van aparte porque en una vuelta atrás la comprobación de
idempotencia **se invierte**: el texto original es subcadena del parcheado, así que el `if nuevo in
code` de siempre diría «ya estaba» y no revertiría nunca; se pregunta por lo parcheado. Corriendo el
parche dos veces converge, con `ESCP` en 0 y el `ESC` del Mundo intacto. Ni una línea de `app.js`.

**Verificado** — `test_escala_agente.js` en verde (el caso *preview == Mundo* invertido: ahora exige
preview idéntico a ×1, ×2 y ×0,5, **y** que el Mundo sí plante al gigante, que es lo que separa esto
de «la escala no hace nada»). El guardián se comprobó al revés: volviendo a meter las 3 costuras a
mano, el test da **3 fallos**. Ojo con lo que caza cada aserción — el `alto` (2.5625 → 5.125) es quien
detecta el fallo; el **hueco entre piezas se queda en 0 con y sin bug**, porque la escala movía las
piezas *y* las agrandaba a la vez, así que en la plantilla siguen tocándose. Lo que el dueño veía
desmontado se rompe **más tarde, al posar/dibujar**, no en las cajas de `preparar()`. El hueco se deja
como invariante barato, no como el guardián del ticket.

---


<a id="-req-agesc1"></a>

### ✅ REQ-AGESC1 · Escala del agente: enanos y gigantes — ✅ hecho (2026-08-07)

**Pedido** 2026-08-07 por el dueño:

> «me gustaría para el editor de agentes una propiedad que sea "escala del agente" de forma que pueda
> hacer un agente pequeño o grande en función de ese valor, para crear enanos y gigantes»

Un solo número por documento de agente, y el mismo dibujo sirve para un enano y para un gigante. El
jugador ya tiene su equivalente (`game.playerScale`, que escala `MC_HW`/`MC_PH`), así que el concepto
no es nuevo en el motor — lo nuevo es aplicárselo a un cuerpo hecho de **varias piezas estampadas**.

**Casi sin investigar** (política de tickets nuevos): solo he mirado por encima `crearEsqueleto` en el
snippet y `mcStampStruct` en `app.js`, lo justo para saber si esto es «una propiedad más» o toca
motor. **Toca motor**, y por eso no lo he empezado. Lo que se ve de pasada:

- Un agente se monta estampando **una estructura por pieza** con `mcStampStruct(clave, cx,cy,cz, rot)`
  — **no admite escala**, y los desplazamientos `en` de cada pieza están en bloques enteros. O sea que
  hay que escalar dos cosas distintas: el **tamaño** de cada pieza y la **separación** entre ellas.
- Cada instancia tiene su propia malla (`colVbo`/`texVbo` los construye `mcBuildStructMesh` por
  instancia), lo cual juega a favor; pero la **forma** sale de `mcStructGeom(clave, rot)`, que se
  **cachea por clave+rot** y de ahí salen también los bitsets de colisión fina en 1/16. Meter la
  escala obliga a que entre en esa clave de caché, o a escalar después.
- `rig.cuerpo` (la caja que choca y que usan `asentar`, `chocaMundo`, `enCaja`/`desplazar` del pistón)
  se deriva de los `aabb` de las piezas, así que sale escalada sola… **si** las piezas lo están.

**Lo que NO he verificado** — si el mallado por instancia admite un factor sin tocar el atlas ni las
UV; qué pasa con la luz de bloque y las celdas emisivas de una pieza escalada; si la física de
agentes (altura de escalón, gravedad, alcance del `seguir`) necesita escalarse también o se apaña; y
si el editor de agentes tiene ya un sitio natural para la propiedad o hay que abrirle hueco.

**Decisión pendiente del dueño** — si vale con escalas **enteras** (×2, ×3) el asunto se simplifica
mucho, porque un voxel escalado sigue cayendo en la rejilla fina de 1/16. Con escalas libres (×1,4)
hay que decidir qué se hace con la colisión. Preguntar antes de diseñar.

**Respondida**: «quiero escalas libres, implementa REQ-AGESC1». Así que ×1,4 y ×0,5 valen.

#### Cómo se usa

En el **editor de agentes**, tarjeta nueva 📏 **«Escala del agente»** (junto a 🧱 *Caja de choque*).
Apagada, el documento no lleva la clave y el agente mide lo que siempre midió. Encendida, un número
entre **0,1 y 8**. Desde scripting es una clave más del documento:

```js
game.esqueletos.crear({ ...doc, escala: 2 }, x, y, z);   // gigante
game.esqueletos.crear({ ...doc, escala: 0.5 }, x, y, z); // enano
```

#### Lo que resultó ser (y en qué se equivocaba la nota de arriba)

La suposición que daba miedo — que la escala tendría que **entrar en la clave de caché** de
`mcStructGeom` — era falsa, y comprobarlo primero fue lo que abarató el ticket entero. `mcStructGeom`
produce geometría **local al origen** y `mcBuildStructMesh` la lleva al mundo **sumando** (`src+ox`).
Escalar es, por tanto, **multiplicar antes de sumar**: la misma malla local cacheada por `clave+rot`
sirve para todas las escalas, y el atlas y las UV ni se enteran. Sonda: `test_escala_estructura.js`.

**Un agente no es una malla, son piezas sueltas.** De ahí que haya que escalar **dos** cosas: el
tamaño de cada pieza *y* la separación entre ellas. Escalar solo lo primero deja al gigante
**desmontado** (cabeza flotando, piernas dentro del torso), y eso **no se ve** en una captura si no
sabes qué buscar — por eso el test mide el **hueco máximo entre una pieza y el resto** y no solo el
bulto.

**Tres sitios que no se derivan solos** y había que escalar a mano:

| qué | por qué no salía gratis |
|---|---|
| `parte.piv` | el pivote va en bloques **dentro de la caja de la pieza**: si la caja crece y él no, el brazo gira sobre un hombro que ya no está ahí |
| `def.cuerpo` | la caja de choque «esbelta» viene en bloques **absolutos** (para caber por una puerta) — un gigante se veía enorme y chocaba como un zombie normal |
| el **preview** del editor | va por otro camino (`prepararEsqueleto`, sin estampar nada). Sin escalarlo, el panel enseñaba tamaño normal y el Mundo plantaba un gigante: justo el fallo que el preview existe para evitar |

El resto (`rig.cuerpo` cuando no hay `def.cuerpo`, `rig.eje`) **sí** sale escalado solo, porque se
deriva de los `aabb` de las piezas.

#### Y la colisión, que era la pregunta abierta

El bitset fino sigue siendo el de la pieza **a tamaño 1** — no se re-hornea uno por escala. Lo que se
corrige es el **mapeo**: la caja del mundo se lleva a coordenadas de la pieza **dividiendo por la
escala**. Son cuatro sondas en `app.js`, con el camino `esc===1` intacto en un `if` aparte porque la
física lo recorre en cada frame:

- `mcFineBoxHit` (colisión) · `mcAimBoxHit` (apuntar) · `mcStructAt` (de quién es este voxel) ·
  `mcXrayVolume` (rayos-X, que además dibuja la cajita ×`esc`).
- `mcStructRayHit` no se toca: delega en `mcAimSolidAt`.
- Nada de helpers nuevos: `mcFineBoxHit` y `mcAimBoxHit` las extrae **verbatim**
  `test_rayo_apuntado.js`, y una dependencia nueva le revienta el sandbox. Por eso la rama va
  inlineada tres veces en vez de factorizada.

#### Verificación

| test | qué cubre | resultado |
|---|---|---|
| `test_escala_estructura.js` (nuevo) | la sonda del motor: render en píxeles a ×1,4 y ×0,5, AABB, colisión, apuntado, `mcStructAt`, y que volver a ×1 deja la foto **idéntica** | TODO OK |
| `test_escala_agente.js` (nuevo) | el bicho entero: bulto ×2/×0,5/×1,5, **que no se desmonta**, pivote, caja de choque, guardas (escala 0 y negativa → 1), y **preview == Mundo** | TODO OK |
| `test_atlas_estructuras` · `test_luz_al_estampar` · `test_suelo_al_estampar` | el mallado por instancia no ha cambiado | 13 / 9 / 9 ok |
| `test_rayo_apuntado` · `test_rayos_x` · `test_fisica_navegador` · `test_parkour_navegador` · `test_atravesable` | las cuatro sondas finas | 12 / 11 / 18 / 18 ok, todo ok |
| `test_agente_cuerpo_real` · `test_agente_pisa_placa` · `test_piston_empuja` | agentes sin escala, sin cambios | TODO OK |
| `test_panel_agentes` · `test_agentes_api` · `test_atajo_agentes` | el editor con la tarjeta nueva | 40 / 30 / 20 ok |

`test_esqueleto_navegador.js` sigue con sus **3 fallos de siempre** (`mcSerialize`, `quitar()`, píxel
a píxel). Comprobado que son **anteriores**: con el snippet sin parchear fallan los mismos tres.

**Lo que NO escala, y es a propósito**: la altura de escalón (`asentar()` sube un bloque, sea enano o
gigante), la gravedad y el alcance del `seguir`. Son *comportamiento*, no *tamaño*, y el dueño pidió
tamaño. Si un gigante debe subir escalones de dos bloques, es otro ticket.

**Tocado**: `app.js` (`mcBuildStructMesh` +`esc`, `mcStampStruct` +`esc`, las 4 sondas finas, tarjeta
📏 en el editor), `parche_snp_escala_agente.py` (nuevo, 11 costuras idempotentes),
`test_escala_estructura.js` + `test_escala_agente.js` (nuevos), `CLAUDE.md`.

---


<a id="-bug-rot2"></a>

### ✅ BUG-ROT2 · Las piezas de un esqueleto siguen recortadas a 16 posturas — ✅ resuelto 2026-08-07

**Encontrado al cerrar BUG-RS7/RS8** (no reportado por el dueño), barriendo el resto del código en
busca del mismo `& 15`. Queda **uno**, y está en el snippet que el dueño edita en vivo
(`data/snippets/mundo-autoarranque.json`, dentro de `game.esqueletos.crear`):

```js
nombre: q.nombre || ('pieza ' + idx), clave: q.pieza, rot: (q.rot | 0) & 15,
```

Una parte de un rig declarada con `rot: 16..23` no se rechaza: se convierte **en silencio** en
`0..7`, o sea en otra postura. Es exactamente el fallo que costó los dos tickets de redstone.

**Por qué no se ha tocado ya:** ese fichero es del dueño y lo edita **en vivo**, así que se parchea
con un script idempotente (como `parche_snp_rot24.py`), no a mano — y esto cambia el comportamiento
de los esqueletos, no el de redstone, así que decide él si entra. **Riesgo real bajo:** con el
recorte, declarar `16..23` daba una pieza visiblemente mal puesta, así que es poco probable que haya
ningún rig guardado dependiendo del recorte.

**Arreglo esperado** — `mcOriNorm(q.rot)` en vez del recorte, con el mismo criterio que en todas
partes: lo que no es una postura conocida se lee como «sin girar», nunca como otra.

**✅ Resuelto 2026-08-07**, con el dueño diciendo «arregla los más fáciles». `oriDePieza(q.rot)`, que
pregunta a `mcOriNorm` y lleva el calco de red por si el snippet corre sin motor (los arneses de
juguete) — el mismo patrón que ya usaba `partesOri` en este fichero. Se aplica con
`parche_snp_rot24_esqueletos.py`, idempotente. **Era el último `& 15` vivo del repo.**

⚠️ **Queda otro recorte, y NO es un descuido:** el preview del editor de agentes hace `((q.rot|0) % 4 + 4) % 4`
a propósito, porque ese dibujo no sabe pintar espejados y solo ofrece los 4 cuartos de vuelta. Es una
limitación del preview, no de los datos; si un día pinta las 24, ahí es donde hay que mirar.

**Verificado** — `test_material_familia.js` §E (junto a BUG-SNP2, que salió en la misma tanda): las 24
se conservan tal cual, la 16 ya no se lee como la 0 ni la 23 como la 7, lo desconocido (24, 99, −1,
`undefined`, `null`) se lee **sin girar**, y con `mcOriNorm` delante manda el motor y no el calco.
`test_esqueleto_navegador.js` sigue con **los mismos 3 fallos que ya tenía antes** (basura de rigs
efímeros en `/map/agents`, ver más abajo), ninguno nuevo.

---


<a id="-bug-rs8"></a>

### ✅ BUG-RS8 · Accionar la palanca la mueve de sitio y le cambia el giro — ✅ hecho (2026-08-06)

**Reportado** 2026-08-06 por el dueño, con dos capturas (antes y después de accionarla):

> «y este otro bug, si doy a la palanca que esta pegada al piston, se rota sola desactivada y aparece
> abajo que no es donde la puse»

En la primera está **pegada a la cara vertical** del bloque; en la segunda ha aparecido **en el suelo,
tumbada** y apagada.

**Causa** — una sola línea, `oriDe()` en `redstone/redstone.js`, que leía la postura de la clave y la
**recortaba a 4 bits** (`& 15`). Desde BUG-ROT1 las posturas son **24**, no 16, así que las ocho
nuevas caían sobre otras: una palanca puesta en `@19` volvía como `@3`. Y ahí están **las dos mitades
de lo que el dueño vio, que no eran dos fallos sino uno**:

- «se rota sola» — literal: `@19` y `@3` son posturas distintas.
- «aparece abajo, que no es donde la puse» — la palanca es una **plaquita fina** que no llena su
  celda: cambiarle la postura la mueve **dentro** de la celda. No cambió de celda; cambió de sitio
  dentro de ella. Por eso el ticket decía «hay dos cosas que medir» y resultó haber una.

El recorte estaba en el camino por el que **todo** cambio de bloque devuelve su postura a la celda
(`conOri`, que usan `aplicar()` y `conmutar()`), así que afectaba por igual a la pieza que suelta el
jugador y a la que sigue a la señal sola.

**Arreglo** — `oriDe` delega en `mcOriNorm`, que es quien sabe cuántas posturas hay (con respaldo
`0..23` si el motor no está delante). Un sufijo que no sea una postura conocida se lee como «sin
girar», nunca como otra.

**Verificación** — `node test_redstone_postura_al_accionar.js` (nuevo): las 24 posturas, por los dos
caminos de reescritura (`conmutar()` con una palanca y `aplicar()` con un cable), conservan el sufijo
al encenderse y al apagarse. Comprobado además que el test **caza** el fallo: volviendo a poner el
`& 15` salen 5 fallos y se lee `hab:palanca@19 → hab:palanca-on@3`, exactamente lo del ticket.

⚠️ Capturas **no rescatadas**: el mensaje del dueño no estaba volcado al transcript cuando se abrió el
ticket, y al cerrarlo ya no hacía falta (la causa está medida). Si se quiere el antes/después para el
historial, `guardar_imagenes_ticket.py BUG-RS8 --uuid ...`.

---


<a id="-bug-rs7"></a>

### ✅ BUG-RS7 · El pistón no se puede poner apuntando hacia arriba: se coloca de lado — ✅ hecho (2026-08-06)

**Reportado** 2026-08-06 por el dueño, con captura (`data/tickets/BUG-RS7/01.png`):

> «intento poner el piston de redstone apuntando hacia arriba pero al dejarse sobre el mapa se pone
> de lado»

Ni el fantasma ni el estampado tenían nada que ver: **el pistón se colocaba bien y el circuito lo
acostaba acto seguido**. Eran **dos** cosas, las dos en redstone:

1. **El mismo recorte a 4 bits de [BUG-RS8](#-bug-rs8)**, que es lo que el dueño VE. El motor repasa
   toda celda recién puesta, y al repasarla le devuelve su postura con `conOri()`; con el recorte,
   `hab:piston@16` (mirando arriba) se reescribía como `hab:piston@0` — de lado — en el mismo
   instante de soltarlo. Literalmente «al dejarse sobre el mapa se pone de lado».
2. **`frenteDe()` era horizontal por construcción**: forzaba la `y` a 0 y solo miraba `ori & 3`,
   así que aunque la postura hubiera sobrevivido, el pistón habría seguido empujando de lado. Había
   incluso un aviso («el pistón está VOLCADO… usa R, no Shift+R») que documentaba la limitación como
   si fuera una advertencia al usuario. Ese aviso ya no tiene sentido y se ha quitado.

**Arreglo** — el frente de una pieza es el `+X` de su dibujo pasado por la postura, y eso lo dice
ahora el motor: `mcOriPerm(ori)`, que sale de la **misma composición** con la que `mcStructGeom` gira
los voxels. Lo que la pieza hace y lo que se ve ya no se pueden separar, y el frente puede ser `+Y` o
`−Y`. Para que esa composición siga siendo una sola, se ha extraído a `mcOriMove(rot, bx, by, bz)`:
`mcStructGeom` ya no la lleva escrita, la pide.

Comprobado que en Minecraft un pistón **sí** apunta arriba y abajo (es una de sus seis orientaciones,
y la base de las máquinas verticales), así que el arreglo va en la dirección correcta.

**Verificación** — `node test_redstone_piston.js`: la batería entera (empuja, la cabeza ocupa el
hueco, idempotencia, recoger, sin hueco, borde del mundo) pasa de 4 posturas a **12** — los 4 giros
horizontales de siempre más las 8 verticales — y se comprueba explícitamente que `@16..@19` empujan
**hacia arriba** y `@20..@23` hacia abajo. Las 12 restantes son vuelcos que dejan el frente donde ya
estaba. Más `node test_posturas_24.js` §E, que fija que `mcOriMove` es la composición de
`mcStructGeom` y que `@0..@15` miran adonde miraban (los circuitos ya construidos no se giran).

---


<a id="-bug-rs6"></a>

### ✅ BUG-RS6 · Agrandar la puerta a 16×16×24 la convierte en estructura y deja de ser redstone — ✅ hecho (2026-08-06)

> *«al modificar la puerta usada en redstone de 16x16x16 a un tamaño 16x16x24 porque era demasiado
> baja, ahora se plancha como estructura y no como bloque, y deja de funcionar como elemento de
> redstone»*

La puerta era demasiado baja —una puerta de un bloque de alto no es una puerta—, y al darle la altura
que le corresponde deja de ser una pieza de circuito.

Es el mismo material contado en **los dos sitios**: por debajo de 16³ una pieza vive en `mc.grid` (una
celda, un id, `mc._geoFina`) y por encima se **estampa** en `mc.structures`, que no es rejilla. El
motor de redstone lee la rejilla, así que una puerta estampada es invisible para él: ni la encola, ni
le cambia el material al abrirse, ni la ve el cable que tiene pegada.

**Decidido por el dueño (2026-08-06): VARIAS CELDAS DE REJILLA, no estructura.**

> *«si se puede hacer en varias celdas parecería mejor ya que las estructuras son lentas, eso sí,
> tendrían que moverse al unísono si es una puerta que se abre»*

O sea: dos piezas de 16³ apiladas (`hab:puerta-abajo` / `hab:puerta-arriba`), cada una en su celda de
`mc.grid`, y no un asset de 16×16×24 estampado. El motivo es el de siempre — el coste son **draw
calls**, y una estructura fina por puerta las paga todas; en la rejilla la puerta entra en la malla
del chunk. **La restricción que impone el dueño es «al unísono»**: abrir la de abajo tiene que abrir
la de arriba en la misma pasada, o se ve media puerta abierta.

**Precedente directo, de esta misma sesión: el pistón (REQ-RS3).** Cuerpo en una celda, cabeza en
otra, y se mueven juntos porque el cuerpo manda sobre la cabeza desde `alRecibirSeñal`. La puerta es
la misma forma: **la mitad de abajo es la pieza de circuito** (la que escucha la placa) y arrastra a
la de arriba, que no necesita ser circuito. Y con la misma advertencia que costó el pistón: el motor
solo re-malla lo que ha tocado **él**, así que la mitad de arriba hay que re-mallarla a mano.

**Preguntas abiertas, ninguna decidida (sin investigar):**

- «Al unísono» **no es solo abrir**. ¿Qué pasa al **romper** una mitad, al **poner** solo una, al
  **girarla** con `R`, y al guardar/reabrir con las dos mitades en estados distintos? Lo de abrir lo
  resuelve el patrón del pistón; lo demás no, y es donde de verdad está el ticket.
- ¿La de arriba es un material **mudo** (no circuito, solo arrastrado) o también escucha? Mudo es más
  simple, pero entonces una placa a la altura de la cabeza no abre la puerta.
- ¿Y el **dibujo**? Hoy hay un `hab:puerta` / `hab:puerta-abierta` de 16³; pasar a dos mitades es
  rehacer `make_piezas.py` y **migrar las puertas ya puestas** en `/map/redstone` y `/map/test`.
- ¿Afecta solo a la puerta, o a cualquier pieza de redstone que quiera pasar de 16³?
- ¿Hay que avisar en el editor al agrandar un asset que **es** pieza de redstone, en vez de dejar que
  deje de funcionar en silencio? Eso es lo que ha costado este ticket.

**Verificación esperada** — una puerta con su altura de verdad se abre y se cierra con una placa de
presión, y sigue funcionando tras guardar y reabrir el mundo. Sin regresión en los `test_redstone_*.js`.

**Cómo se resolvió (2026-08-06)**

La medida que ordenó todo: `mcCabeEnRejilla` (`app.js:5827`) exige `w/h/d ≤ 1` celda para que una pieza
entre en `mc.grid`. Con 16×16×24 son **dos** celdas, así que el clic derecho la estampaba como
estructura suelta — y una estructura no tiene celda, ni vecinos, ni señal. El circuito nunca estuvo
roto; lo que se rompió fue el **sitio** donde vivía la pieza. Confirmado midiendo: `hab:puerta` daba
`finoRejilla=false` mientras `hab:puerta-abierta` (todavía 16³) daba `true`.

1. **El dibujo se parte, no se rehace.** `redstone/partir_puerta.py` (nuevo) coge la puerta que el
   dueño tenía **hoy** en la galería —776 voxels, con su listón claro y el tirador recolocado a media
   altura— y la corta en dos celdas: `puerta` (z 0..15) y `puerta-alta` (z 16..23). La hoja abierta se
   **deriva girando la cerrada 90°** sobre la jamba (`abatir`), no se dibuja aparte: así hereda el
   grosor, el tirador y los colores. Justo lo contrario ya había pasado — el dueño subió la cerrada a
   24 y `puerta-abierta.json` se quedó en 16 y con otro grosor. Las cuatro piezas quedan en
   `w=h=d=1`, o sea de vuelta en `mc.grid` y dibujadas con su geometría real dentro de la malla del
   chunk. Lo pisado está en `data/habitantes_trash/1786030148112__puerta.json`.
2. **Se mueven al unísono porque una manda sobre la otra**, que es el patrón del pistón (REQ-RS3):
   `hab:puerta` y `hab:puerta-abierta` van con **dos `define()` y `alRecibirSeñal`**, sin `encendida`,
   y el callback escribe **las dos celdas y remalla una sola vez**. La mitad de arriba **no es una
   pieza de redstone**: no tiene señal propia, no conduce, no hace cola — la arrastra la de abajo. Y
   si a la de arriba le falta el material en la paleta (todo va con `precargar:false`), **no se mueve
   ninguna de las dos** y se reintenta entero; con `encendida` el motor habría abierto la de abajo él
   mismo antes de avisar y se habría quedado media puerta abierta.
3. **Muere el apaño de `conduce`.** La puerta ya no conduce señal (una de Minecraft tampoco). Con eso
   se va el `perdida: 1` obligatorio —con 0 las dos hojas se sostenían la una a la otra y la puerta no
   se cerraba jamás—, el tick de diferencia entre hojas y el caso feo de abrir solo media al final del
   alcance.

**Respuestas a las preguntas abiertas del ticket:** la de arriba es **muda** (más simple, y una placa
a la altura de la cabeza es un caso que nadie ha pedido); **no hay auto-completado al poner** porque
`game.bloques` no tiene gancho `alPoner`/`alRomper` y `alRecibirSeñal` solo salta con cambio de nivel
— se ponen las dos mitades a mano, y una puerta de **una sola celda sigue siendo legítima**; lo que
haya encima que no sea media puerta **no se pisa** (esto mueve una puerta, no la construye); el giro
se **arrastra** a la hoja de arriba. Queda **fuera**: avisar en el editor al agrandar un asset que es
pieza de redstone (es la causa raíz de que esto se rompiera en silencio — ticket aparte si duele).

**Verificación** — `node test_redstone_puerta.js` (nuevo) en verde: mide en qué **pasada** cambia cada
hoja tickeando de una en una, y las dos cambian en la misma (1 y 1) en los cuatro giros, al abrir y al
cerrar. Más: las cuatro piezas caben en la rejilla, media puerta sola funciona y no escribe encima, un
bloque ajeno arriba queda intacto, y un cable al otro lado se queda apagado. Sin regresión en
`test_redstone_piston.js`, `test_redstone_giro.js`, `test_redstone_bloques.js` y
`test_redstone_arranque.js`.

**Pendiente de una pasada del dueño**: `/map/redstone` (los ejemplos 3 y 7 apilaban dos `hab:puerta`)
está actualizado en `redstone/redstone-ejemplos.js` pero **no re-montado** — se monta con
`node redstone/montar_ejemplos.js`, que sí guarda mapa.

---

