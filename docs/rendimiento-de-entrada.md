# Rendimiento de entrada: por qué el mapa tardaba 9 s y se jugaba trabado

<!-- Detalle de VoxelForge. NO se carga en cada turno: lo carga el agente a demanda
     desde ../docs/luz-y-sombra.md y ../docs/bloques-comportamiento.md. -->

> ⛔ No hay pointer en `CLAUDE.md`: el índice está a 2 bytes del tope de 12 KB (guardián
> `tests/test_claude_tamano.js`). Se llega aquí desde [`luz-y-sombra.md`](luz-y-sombra.md) y
> [`bloques-comportamiento.md`](bloques-comportamiento.md), que sí están enlazados.

Queja del dueño (2026-08-31): *«el mundo por defecto tarda como 9 segundos… parece que se puede
jugar pero trabado a 0 fps»*. **Ninguna de las dos causas era dibujar.** Las dos eran **trabajo
repetido**: la misma luz calculada cinco veces y el mundo entero mallado dos veces.

Guardián: **`tests/test_perf_mallado.js`** (área `render`, servidor + Playwright).

---

## Cómo se midió (y cómo NO)

⚠️ **El `Profiler` de CDP mintió por 6×**: con muestreo a 200 µs, una carga de 14 s salía como 87 s y
el reparto entre funciones no se parecía al real. La medida honrada fueron **envoltorios propios**
(`fn._orig` + `performance.now()`) sobre las funciones sospechosas, sin profiler.

Dos trampas más que costaron tiempo y que se repetirán:

- **`window.game` tiene un *accessor trap* que reinicia lo que le cuelgues en cada `set`.** Instalar
  los contadores desde un `setInterval` daba 0 bloques y 0 snippets. Hay que inicializarlos **una
  sola vez** en `addInitScript`, y separar la instrumentación del *getter* de la del *setter*.
- **`/map/default` no es determinista entre dos cargas**: agentes, fluidos y carteles de nota cambian
  la huella de la rejilla y el número de estructuras (471 vs 468 en dos cargas seguidas). Comparar
  dos ejecuciones **no vale**; hay que comparar **dentro de la misma página**.

Reparto real de la carga, antes del arreglo (mapa por defecto, 512×40×512, SwiftShader):

| fase | ms | qué era |
|---|---|---|
| `mundo-autoarranque` | 5981 | los 203 `define` y su remallado |
| paleta | 3237 | **NO era el culpable**: ya estaba optimizada (PERF-MC3) |
| `mcMeshAll` ×2 | 1979 + 1941 | el mundo entero, mallado dos veces |
| `mcComputeLight` ×5 | ~1 s cada una | la misma luz, cinco veces |

---

## Defecto 1 · `mcComputeLight` es pura y se llamaba 5 veces con las mismas entradas

`mcComputeLight` (`app.js:11630`) es una **función pura** de `(mc.grid, mcTablaLuz(), mcTablaCielo(),
mc.dim, mc.interiorDark)`. Al entrar se la llamaba cinco veces con las mismas entradas: ~1 s de BFS
de skylight tirado a la basura cada vez.

El snippet **`data/snippets/perf-mallado.json`** (`game.perfMallado`) la **memoriza por firma**: hash
FNV de la rejilla + las tablas + `dim` + `interiorDark`. Si la firma coincide, no recalcula; si no,
llama a `_orig` y guarda la firma nueva.

- **No es una caché de resultados**: no guarda `mc.light`, guarda **la firma de las entradas que lo
  produjeron**. Si algo cambia la rejilla, la firma falla y se recalcula. Por eso es seguro.
- El coste de la firma se mide (`msFirma` en `estado()`): recorrer la rejilla es mucho más barato que
  el BFS que evita.

## Defecto 2 · `pideRemallado` mallaba el mundo DOS veces, y la primera siempre sobraba

En `mundo-autoarranque`, `pideRemallado` hacía `mcMeshAll()` y acto seguido `mcRestampAll()`. Pero
**`mcRestampAll` termina con su PROPIO `mcMeshAll()`** cuando la luz de bloque ha cambiado
(`app.js:16572`, comparando `mc.blockLight` contra `mc.blockLightMeshed`).

**Al arrancar SIEMPRE ha cambiado**, y no por casualidad: la foto con la que compara viene del bake de
`openWorld`, hecho **antes** de que las instancias de estructura tuvieran `emitFinos`. O sea que el
primer mallado —dos segundos— se tiraba entero, **siempre**, y además usaba las tablas de luz de en
medio.

Ahora se **restampa primero** y solo se malla si el restamp no llegó a hacerlo. Saberlo no es
adivinar: **`mcMeshAll` deja `mc.blockLightMeshed` en un array NUEVO cada vez** (`app.js:12264`,
`.slice()`), así que basta comparar la referencia.

Parche: **`herramientas/parche_snp_perf_remallado.py`** (idempotente, ancla única, deshace sus propias
versiones anteriores). ⛔ El snippet **se parchea, no se reescribe**: hay 2 copias vivas.

## Defecto 3 · `mcCalientaFina` mallaba UNA VEZ POR MATERIAL fino que llegaba tarde

`mcCalientaFina` (`app.js:7979`) llamaba a `mcMeshAll()` dentro de su `.then`: un mallado completo
por cada material fino que terminaba de cargar. `perf-mallado` los **agrupa** en una sola pasada.

⚠️ **La v1.0 agrupaba mal, y ese era el tirón de verdad.** Solo esperaba *mientras* había geometría en
vuelo, y mallaba en cuanto el conjunto se vaciaba. Pero la geometría fina **no llega en una tanda,
llega en OLAS** separadas 180-370 ms: `mcSyncNoteSignsRun` va estampando carteles de nota durante casi
un minuto. Medido: **37 `mcMeshAll` de 135-245 ms cada uno, la mayoría DESPUÉS de que el mapa haya
cargado** — o sea el «se juega trabado» literal, que no estaba en la carga sino en los tres primeros
minutos de partida.

**v1.1** añade un **REPOSO de 400 ms de silencio** tras la última llegada (tope 4 s para que una
geometría que no resuelve nunca no deje el mundo sin mallar). Las olas se juntan: **152 materiales
finos → 3 mallados**.

## Defecto 4 · `mcBake` tenía el MISMO defecto que `pideRemallado` (`app.js`, 2026-09-02)

Encontrado al medir después de arreglar los tres anteriores. `mcBake` (`app.js:21531`) hacía
`mcMeshAll()` y **después** apilaba las estructuras y llamaba a `mcRestampAll()`, que vuelve a mallar
el mundo entero cuando la luz de bloque ha cambiado — y al hornear **siempre** cambia, porque las
instancias con `emitFinos` se apilan justo ahí. Medido en `/map/default`: **2203 ms tirados**.

Arreglado igual que el defecto 2, comparando la referencia de `mc.blockLightMeshed`. **Es el único
punto de `app.js` que se tocó**, aprobado por el dueño el 2026-09-02.

⚠️ **Es OPT-IN (`mcBake(doc, {difiereMalla:true})`) y solo lo pasa `openWorld`.** Mientras se restampa
**no hay malla**: con el cartel de carga puesto no se ve, pero `game.reloadWorld` —que llama a `mcBake`
con el mundo a la vista— sería un parpadeo de mundo vacío. Sin la opción, `mcBake` se comporta **byte a
byte como antes**; y si no hay estructuras tampoco se difiere, porque entonces nadie mallaría detrás.

---

## ⚠️ El sitio del enganche importa, y se pagó aprendiéndolo

El enganche va **lo primero del autoarranque**, justo tras `// ==FIN-GUARDIA-SESION==`, y **con
`await`** (al revés que `sesion-guardia`).

Puesto al final —junto a `texturas-embebidas`, que fue el primer intento— la memoria se instala
**después** del remallado de los 203 `define`, o sea con la tabla vacía: el horneado de los carteles
de nota la encontraba vacía y se pagaba **1129 ms** de skylight otra vez. Movido arriba, ese horneado
bajó a **218 ms**.

El `await` es a propósito: sin esperar al `fetch`, los `define` corren antes y `pideRemallado` (que va
en una microtarea) llega **antes que la memoria**.

⚠️ **El `try/catch` del enganche NO sobra.** Es lo primero del autoarranque y `game.snippet` rechaza
si el fichero no está publicado. Sin él, un 404 se lleva por delante **todo lo de abajo** —bloques,
redstone, fluidos, menú— y el mapa se abre pelado. *Perder la memoria de luz cuesta segundos; perder
el autoarranque cuesta el mundo.*

---

## Lo que se ganó, medido

Traza de `/tmp/perf_mallados.js` sobre `/map/default` (512×40×512, SwiftShader), 45 s de observación.
Las tres columnas son acumulativas: cada una lleva lo de la anterior.

| medida | v1.0 (solo memo) | v1.1 (+ reposo) | v1.1 + `mcBake` |
|---|---|---|---|
| `mcMeshAll`: llamadas / total | 30 / 9988 ms | 10 / 5661 ms | **10 / 4481 ms** |
| durante la carga (t < 20 s) | 2 / 4867 ms | 3 / 4394 ms | **2 / 2881 ms** |
| **tras cargar (t > 20 s) — el «trabado»** | 28 / 5121 ms | 7 / 1267 ms | **8 / 1600 ms** |
| coste de `mcBake` | 2485 ms | 2285 ms | **78 ms** |
| materiales finos → mallados | 126 → ~27 | 152 → 3 | **144 → 4** |

Punto de partida antes de todo esto: **8852 ms de mallado** y una carga que acababa en t=16760.

**Corrección, no solo velocidad**: la luz memorizada resultó **idéntica celda a celda** a la original
sobre 10 485 760 celdas, y sigue siéndolo tras mutar 400 celdas de rejilla (la firma falla y
recalcula). `off()` devuelve las dos funciones **byte a byte**. Y el mundo termina exactamente igual:
**258 552 quads y 4 333 776 finos**, la misma cifra que antes de tocar nada, con `mallaYaDefinitiva` y
`luzYaDefinitiva` en `true`.

---

## Lo que el guardián comprueba, y por qué así

`tests/test_perf_mallado.js` corre en **`/map/test`**, que **viene vacío**: sin plantar terreno, todo
pasaría por el lado bueno sin comprobar nada (0 quads == 0 quads). Planta una losa de 768 celdas y la
recoge.

**No mide milisegundos** —mienten en cualquier máquina cargada—: usa los contadores de
`game.perfMallado.estado()` y compara la luz **celda a celda** contra `mcComputeLight._orig`.

El parche de `pideRemallado` vive en un *closure* al que no se llega desde la página; se comprueba
donde sí se puede: **en el snippet publicado** (`GET /api/snippets/mundo-autoarranque`), que es lo que
baja cada visitante. Un merge que se lleve el parche por delante cae ahí. Las cuatro comprobaciones de
texto se verificaron **discriminantes** (pasan con el parche, fallan sin él).

---

## ⏳ Lo que queda

Los ~1600 ms que aún se van tras cargar son casi todos `mcSyncNoteSignsRun → mcStampStruct →
mcRestampAll → mcMeshAll`: los carteles de nota se estampan durante casi un minuto y cada tanda vuelve
a mallar el mundo. Agruparlos es el mismo truco del reposo, pero el `mcMeshAll` vive dentro de
`mcRestampAll` (`app.js`), no en un snippet. **No medido a fondo, no intentado.**

La idea original —correr los `game.bloques.define` **antes** de `mcBake`— **se descartó**: obligaba a
mover 203 `define` fuera de `mundo-autoarranque`, y medir enseñó que el problema real no era el orden
de los `define` sino que `mcBake` mallaba dos veces él solo (defecto 4). El arreglo que se hizo cuesta
tres líneas y da los mismos 2,2 s.

## 🐛 `tests/test_bloques_comportamiento.js` estaba MUERTO (arreglado el 2026-09-02)

Reventaba con `SyntaxError: await is only valid in async functions` **antes de correr una sola
comprobación**, así que llevaba tiempo diciendo «0 fallos» sin haber probado nada. Es **pre-existente**:
el navegador compila el snippet con `new AsyncFunction(code)` y el test con `new Function()`, y el
autoarranque tiene `await` de nivel superior desde que se le añadió el cargador de `miosd`.

⛔ **Pasarlo a `AsyncFunction` no sirve**: `await` suspende de verdad, `montar()` volvería antes de que
el snippet haya llamado a `game.bloques.define`, y hacerlo asíncrono obliga a envolver 3 100 líneas que
se llaman desde bloques `{…}` de nivel superior.

Lo que se hizo, **sin borrar una línea del snippet**: quitar la palabra `await` de las 3 llamadas que
**cargan otro snippet** (`perf-mallado`, `miosd`, `texturas-embebidas`) y darle a `game` un doble de
`snippet`/`onKey`/`osd` — sin él, `game.snippet('sesion-guardia')` lanza `TypeError` fuera de todo
`try` y se lleva el snippet entero. La sección **§0** comprueba que solo se tocó eso y que lo que queda
compila; si aparece un `await` de nivel superior en otro sitio, §0 lo canta en vez de morirse.

Resultado: **392 comprobaciones que no se estaban corriendo**, todas en verde.
