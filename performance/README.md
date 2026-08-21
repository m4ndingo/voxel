# `performance/` — medir el Mundo voxel

Aquí vive **todo lo de rendimiento**: los ayudantes de consola (F12) que se crearon en los tickets
`REQ-PERF1` / `REQ-PERF2` / `PERF-RS1`, las sondas que los ejercitan y la propuesta de arreglo que
está esperando decisión del dueño.

| fichero | qué es |
|---|---|
| `README.md` | esto: **el inventario de ayudantes de consola** |
| `PROTOCOLO_TEST_DUENO.md` | el guion para medir **en el navegador del dueño** (GPU real) |
| `PROPUESTA_PERF-RS1_pasada9.md` | diagnóstico de la pasada 9 + arreglo propuesto (🟡 sin aprobar) |
| `sonda_req_perf1.js` | ejercita la API del profiler (`perfAssert`, `perfDump`, …) |
| `sonda_perf_rs1.js` | mide el coste de un circuito de redstone oscilando |
| `sonda_cache_lru.js` | mide el caché LRU de `mcMeshChunk` con un observador |
| `sonda_render_mode.js` | comprueba el ida y vuelta de `game.renderMode` |
| `sonda_perf3_colocar.js` | **BUG-PERF3** · reparto del coste de **colocar un bloque** en 4 chunks distintos |
| `sonda_perf3_finos.js` | **BUG-PERF3** · cuánta geometría fina produce un chunk y qué tarda en mallarse |
| `sonda_perf3_verifica.js` | **BUG-PERF3** · huella de la geometría fina, para A/B contra un `app.js` anterior |

⚠️ **Las sondas no son tests.** `correr_tests.js` recoge `test_*.js` de **`tests/`**, así que
tenerlas aquí (y con nombre `sonda_*`) las deja fuera de la suite por partida doble. Se lanzan a mano (`node performance/sonda_req_perf1.js`) y necesitan
el servidor en `:8500` y `playwright` (que está en `/root/voxel/node_modules`, así que **hay que
ejecutarlas desde el repo**, no desde `/tmp`).

---

## ⚠️ Antes de medir nada: **DevTools CERRADO**

Con la consola abierta los fps se van a **la mitad**. El profiler está pensado justo para eso:
se arma, se cierra F12, se juega, y el volcado se lee **después**. Cualquier número tomado con
DevTools abierto no vale para comparar.

Y `game.voxels` **subiendo** al acercarse a una pared es geometría sin cullar, no fill-rate.

---

## El profiler condicional (REQ-PERF1) — `app.js:4985-5143`

Envuelve funciones caras del motor **solo mientras `game.perfAssert > 0`**. Con el assert a 0 las
envolturas **se retiran**, así que el coste medible cuando está apagado es **cero** — no es una
promesa, es que las funciones vuelven a ser las originales.

Mide el **frame de verdad** (rAF a rAF: `fpsFrame = 1000 / duración del frame`), **no** el
`game.fps` de la esquina, que es un promedio de 500 ms y se traga precisamente el pico que
buscamos.

```js
game.perfAssert = 60;      // arma: al primer frame por debajo de 60 fps, vuelca y SE DESARMA
game.perfVerbosity = 2;    // 0..3 — cuántas funciones se envuelven (ver tabla)
game.perfContinuo = true;  // no desarmar tras el volcado: sigue disparando en cada frame lento
game.perfDump();           // re-imprime el último volcado y RE-ARMA
game.perfDump.forzar();    // vuelca AHORA, sin esperar a otra caída
game.perfDump.reset();     // tira la acumulación y re-arma
game.perfAssert = 0;       // apaga y desinstrumenta
```

### Los niveles de `perfVerbosity`

| nivel | qué añade |
|---|---|
| `0` | nada (equivale a apagado, aunque el assert siga puesto) |
| `1` | las funciones gordas del motor |
| `2` | \+ **WebGL**: `gl.bufferData` (suma **KB subidos**) y `gl.drawArrays` (suma **vértices**) |
| `3` | \+ el motor de redstone: `game.redstone.encender` / `.conmutar` / `.tick` / `.revisar` / `.revisarCaja` |

Dos cosas que no se adivinan:

- **`_perfResolver` navega rutas con puntos desde `window`**, así que se pueden instrumentar métodos
  que viven **en un snippet** (`game.redstone.tick`), no solo globales de `app.js`.
- **`_perfInstalar` restaura antes de instalar**, así que **bajar** la verbosidad de verdad
  desinstala lo que sobra (incluidas las envolturas de WebGL) en vez de dejarlas puestas.

### Cómo se lee el volcado

```
[perf] CAÍDA DE FPS: 28.4 fps (umbral 60, verbosity 2) · 2026-08-11T…
[perf] funcion                      llamadas  ms total  max ms/call extra
[perf] mcMeshChunk                         4     97.31        41.20
[perf] gl.bufferData                      31     11.04         2.81  10480.2 KB subidos
[perf] gl.drawArrays                     612      3.90         0.12  1840221 vertices
[perf] === game.perfDump() re-arma; game.perfDump.reset() limpia; game.perfAssert=0 apaga ===
```

Ordenado por **ms total** descendente: la primera fila es el sospechoso.

### Instrumentar algo desde un snippet

```js
game._perfMedir('rs.dispararObservador', function(){ return orig.apply(this, arguments); });
```

Suma al **mismo** acumulador que ven las envolturas globales, y con el profiler apagado es una
comparación y salida rápida. Es la vía para medir código que vive fuera de `app.js` **sin** tocar
`app.js`.

---

## CPU o GPU: `game.renderMode` (REQ-PERF2) — `app.js:5163+`

Un solo interruptor que combina palancas que ya existían (`mc.sunShade = 1`, `mc.interiorDark = 1`,
`mc._skipBlockLight`):

```js
game.renderMode = 'fast';    // sin luces ni sombras
game.renderMode = 'normal';  // vuelve al defecto (restaura los valores guardados)
```

- Con `fast` los fps **NO** caen → el cuello estaba en **GPU / iluminación**.
- Con `fast` **siguen** cayendo → el cuello está en **CPU** (motor, redstone, agentes, mallado).

⚠️ Cambiar de modo **re-malla todos los chunks** (el sombreado va horneado en las VBO), así que el
propio cambio cuesta un pellizco de una vez; no se mide *eso*, se mide lo de después.

---

## El caché de mallado y la sombra (PERF-RS1) — `app.js:5146-5161`, `5216+`

```js
game.cacheStats();          // hits / misses / ratio del caché LRU de mcMeshChunk + slots ocupados
game.cacheStats.reset();    // pone los contadores a cero
game.chunksActivos();       // QUÉ chunks se están re-mallando sin parar (los que oscilan)
game.chunkCacheSlots = 32;  // slots por chunk; súbelo si algún chunk los tiene todos ocupados
game.cacheStrict            // comprobación estricta de la firma del chunk (depuración)
game.chunkThrottleMs = 0;   // 0 = sin throttle del re-mallado
game.shadowGeoMs = 0;       // throttle del re-horneado del mapa de sombra por GEOMETRÍA
```

Sobre `shadowGeoMs`: el defecto es **0 a propósito** (fluidez visual). Un throttle de 22 Hz hace que
la sombra **salte** y, en palabras del comentario del código, «queda feo». La palanca buena para
abaratar la sombra es **`game.shadowSize`** (2048 → 1024 → 512), que hace que cada rehorneo cueste
menos en vez de espaciarlos.

Rutina típica: `game.cacheStats.reset()` → pulsar el botón / colocar el bloque → `game.cacheStats()`
y `game.chunksActivos()`. Ratio bajo + los mismos chunks siempre = **thrash del caché**, que es lo
que documenta `PROPUESTA_PERF-RS1_pasada9.md`.

---

## Palancas de rendimiento que ya estaban documentadas en `CLAUDE.md`

No se repiten aquí, pero cuentan para medir: `game.loadReport()` (reparte el coste de abrir el
Mundo en `doc` / `caras` / `geom` + turno de socket), `game.showFPS`, `game.showVoxels`,
`game.shadowSize`, `game.nearClip`, `mc.sinCullingFluido`, `game.structGreedy`, `game.playerScale`,
`game.resizeWorld`.
