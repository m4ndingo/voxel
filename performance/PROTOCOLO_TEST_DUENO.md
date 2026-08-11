# Protocolo de medida **en el navegador del dueño** (GPU real)

Objetivo: capturar, **con números tuyos**, por qué colocar un bloque hunde los fps **según dónde se
coloque**. Ticket: `BUG-PERF3` en `PLAN.md`.

No hace falta saberse nada de lo de abajo de memoria: cada paso es un bloque de consola que se pega
tal cual. Lo único que hay que aportar es **jugar** y **decir dónde estabas**.

---

## Regla que invalida la medida si se salta

> **DevTools CERRADO mientras se juega.**

Con la consola abierta los fps se van a la mitad y el volcado mide el navegador, no el Mundo. El
profiler está hecho justo para esto: **se arma con F12 abierto, se cierra F12, se juega, se vuelve a
abrir F12 y se lee**. El volcado ya está impreso, no se pierde al cerrar la consola.

---

## Paso 0 · preparar (una vez)

Abre **tu mundo complejo** (el que tiene redstone/fluidos/estructuras, no `/map/test`) y pega:

```js
game.showFPS = true; game.showVoxels = true;
game.perfVerbosity = 2;     // funciones gordas + WebGL (KB subidos y vértices)
game.perfContinuo = true;   // no se desarma tras el primer volcado
game.cacheStats.reset();
```

Luego **cierra F12**, date una vuelta 20-30 s sin colocar nada y mira la esquina: apunta los fps
**en reposo** y el `game.voxels` típico. Ese es el suelo contra el que se compara todo lo demás.

---

## Paso 1 · encontrar el sitio MALO y el sitio BUENO

Colócate y **coloca un bloque cualquiera** en sitios distintos hasta tener los dos casos:

- **MALO** — al colocar, el tirón se nota (los fps se desploman un instante o se quedan abajo).
- **BUENO** — al colocar, no pasa nada apreciable.

La hipótesis a confirmar es que el sitio malo es un chunk **con geometría cara ya dentro**
(observadores, pistones, cables, flores, agua…) y el bueno es terreno liso. **No hace falta que
aciertes**: basta con anotar las coordenadas de los dos.

Para anotar sin cerrar el juego, con F12 abierto un momento:

```js
mc.pos.map(Math.floor).join(' , ')   // dónde estás
```

---

## Paso 2 · el volcado del sitio MALO

Ponte donde el tirón se reproduce, abre F12 y pega:

```js
game.perfDump.reset();
game.cacheStats.reset();
game.perfAssert = 45;   // arma: al primer frame por debajo de 45 fps, vuelca
```

**Cierra F12.** Coloca el bloque en el sitio malo (una vez; si no cae de la primera, un par de veces
más). **Abre F12** y pega:

```js
game.perfAssert = 0;    // apaga y desinstrumenta
game.cacheStats();
game.chunksActivos();
```

Copia **todo** lo que haya salido en la consola: el bloque `[perf] CAÍDA DE FPS…`, la tabla del
caché y la lista de chunks activos.

Si el umbral 45 no llegó a dispararse pero el tirón se notó, repite con `game.perfAssert = 55`. Si
salta constantemente y ensucia, baja a `30`.

Cómo se lee el volcado está en `README.md`; en corto: **la primera fila es el sospechoso** (está
ordenado por ms total) y la columna `max ms/call` dice si es un pico gordo o mucha llamada barata.

---

## Paso 3 · el mismo volcado en el sitio BUENO

Idéntico al paso 2, sin cambiar nada más, en el sitio bueno. **Este paso es el que da valor a la
medida**: dos volcados del mismo mundo, la misma sesión y el mismo bloque, y la diferencia entre
ellos es el bug. Un volcado suelto del sitio malo no distingue «este bloque es caro» de «este sitio
es caro».

---

## Paso 4 · CPU o GPU

Ponte otra vez en el sitio **MALO** y pega:

```js
game.renderMode = 'fast';   // sin luces ni sombras
```

⚠️ El propio cambio **re-malla todos los chunks**: espera a que se estabilice antes de medir.

**Cierra F12**, coloca el bloque otra vez en el sitio malo y mira la esquina:

- los fps **ya no** se hunden → el cuello estaba en **GPU / iluminación**.
- los fps **siguen** hundiéndose → el cuello está en **CPU** (mallado, redstone, fluidos).

Vuelve con `game.renderMode = 'normal'`.

---

## Paso 5 (opcional) · descartar la sombra y el caché

Sigue en el sitio malo. Una palanca cada vez, colocando el bloque entre medias:

```js
game.shadowSize = 512;      // sombra 4× más barata de rehornear (defecto 2048)
game.chunkCacheSlots = 200; // más slots de caché por chunk (defecto 32)
```

Si con `shadowSize = 512` el tirón desaparece, es el rehorneo del mapa de sombra. Si desaparece con
más slots, es **thrash del caché LRU** — que es justo lo que documenta
`PROPUESTA_PERF-RS1_pasada9.md` (25-33 % de aciertos, >200 firmas distintas peleándose por 32
huecos).

Para dejarlo como estaba: recarga la página. Ninguna de estas palancas se guarda.

---

## Qué hay que entregar

1. Los **dos** volcados `[perf]` (malo y bueno), enteros.
2. La salida de `game.cacheStats()` y `game.chunksActivos()` de cada uno.
3. Los fps en reposo del paso 0.
4. El resultado del paso 4 en una línea: **CPU** o **GPU**.
5. Qué había alrededor del sitio malo (redstone, agua, estructuras) y del bueno.

Con eso el ticket `BUG-PERF3` pasa de hipótesis a causa medida, y la propuesta de
`PROPUESTA_PERF-RS1_pasada9.md` (presupuesto de mallado por frame) se aprueba o se descarta con
datos en vez de a ojo.
