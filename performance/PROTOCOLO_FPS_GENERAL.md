# Protocolo · **caen los fps en TODOS los mapas**

Distinto de [`PROTOCOLO_TEST_DUENO.md`](PROTOCOLO_TEST_DUENO.md), que persigue el tirón **al colocar
un bloque** (`BUG-PERF3`). Éste es para lo otro: va lento **en reposo y en cualquier mapa**.

Cambia la estrategia. Si pasa en todos los mapas, la causa **no es el contenido de un mapa**: es algo
del motor que se paga siempre. Así que primero se acota **en qué pasada** se va el frame, y sólo
después se busca el porqué.

> **DevTools CERRADO mientras se mide.** Con la consola abierta los fps se van a la mitad y estarías
> midiendo el navegador. Se arma con F12, se cierra, se juega, se vuelve a abrir y se lee.

---

## Paso 0 · descartar lo último que se tocó (2 minutos, no te lo saltes)

El 2026-08-20 entró `game.showRendered` (REQ-REN1), que toca `mcRender` y envuelve `gl.drawArrays`.
**Es lo más reciente y hay que descartarlo antes de nada**, aunque apagado no debería costar:

```js
localStorage.removeItem('vf_showRen');   // el medidor se RECUERDA entre sesiones
location.reload();                       // recarga limpia
```

Tras recargar, y **sin abrir el medidor**:

```js
mc.gl.drawArrays._ren   // debe ser `undefined`. Si es `true`, algo lo dejó envuelto
```

⚠️ `game.metricas()` y una foto de `Alt+F` **envuelven `gl.drawArrays` y lo dejan puesto** el resto de
la sesión (por diseño: apagado es un `if`). Si has llamado a cualquiera de las dos, recarga antes de
medir o estarás midiendo con la envoltura puesta.

Y lo mismo con el profiler, que hasta el 2026-08-20 **no se desinstrumentaba del todo**: bastaba haber
hecho `game.perfAssert = <algo>` una vez en la sesión para que `gl.drawArrays` y `gl.bufferData`
siguieran cronometrados (dos `performance.now()` × ~300 draws por frame) aunque lo volvieras a poner a
0. Ya está arreglado, pero **si estás en una pestaña abierta desde antes, recárgala**:

```js
game.perfAssert = 0;
mc.gl.drawArrays._perf   // debe ser `undefined`; si es `true`, recarga la página
```

Si tras esto los fps **siguen** cayendo → no es REQ-REN1 ni el profiler, sigue al paso 1.
Si **se arreglan** → dilo y se revierte; hay A/B contra `git` para confirmarlo en un minuto.

---

## Paso 1 · el suelo, en reposo

En el mapa que sea, quieto, mirando a una pared:

```js
game.showFPS = true; game.showVoxels = true; game.showRendered = true;
```

Cierra F12, quédate quieto 20 s, apunta los tres números de la esquina. Luego abre F12:

```js
game.renderDump();   // el reparto por PASADA del último frame
game.metricas();     // fps · vox · col · draws/tri/chunks, todo de golpe
```

**Esto es lo que hay que pegar en el chat.** La tabla de `renderDump()` dice, sin adivinar, si el
frame se va en `reflejo`, en `sombra`, en `terreno`, en `estructuras`, en `notas`…

Y el gesto que lo motivó: **quédate mirando la pared y mueve un poco el ratón** con el medidor
puesto. Si `dib` y `tri` pegan un salto al girar, es culling/streaming. Si **no se mueven** y aun así
los fps caen, no es geometría: es CPU (paso 2) o fill-rate.

---

## Paso 2 · CPU o GPU (una línea)

```js
game.renderMode = 'fast';    // sin luces ni sombras. ⚠️ re-malla todo: espera a que se estabilice
```

- fps **ya no** caen → cuello en **GPU / iluminación** → paso 3.
- fps **siguen** cayendo → cuello en **CPU** → paso 4.

Vuelve con `game.renderMode = 'normal'`.

---

## Paso 3 · si es GPU: bisecar por pasada

Una palanca cada vez, mirando la esquina entre medias. **Ninguna se guarda**: recargar lo deja como
estaba.

```js
game.reflejoEntorno(0);   // fuera el reflejo planar del entorno
game.shadowSize = 512;    // sombra del sol 4× más barata (defecto 2048)
game.sunShade = 1;        // fuera la sombra proyectada del todo
game.renderDist = 4;      // menos chunks (defecto 8)
game.structGreedy = false;// una cara por voxel en estructuras (para A/B, no es mejora)
game.glowLevel = 0;       // fuera el glow
```

La que devuelva los fps es la pasada culpable, y `game.renderDump()` lo confirma con números antes y
después. Referencia medida en `/map/plan`: el reflejo se llevaba **80 de 118 draws** y el 88 % de los
triángulos ([`docs/rendimiento.md`](../docs/rendimiento.md)).

⚠️ `sunShade` y `glowLevel` son palancas de **medida**, temporales. Tocar la iluminación de verdad
pasa por la Ley de la Luz ([`wiki/paginas/ley-de-la-luz.md`](../wiki/paginas/ley-de-la-luz.md)).

---

## Paso 4 · si es CPU: el profiler

```js
game.perfDump.reset();
game.perfVerbosity = 2;     // motor + WebGL
game.perfContinuo = true;
game.perfAssert = 45;       // vuelca al primer frame por debajo de 45 fps
game.perfDump.forzar();     // ⚠️ `forzar`, no `perfDump()`: uno mide AHORA, el otro re-imprime
```

⚠️ **`game.perfDump()` no mide, re-imprime el último volcado.** Recién armado no hay ninguno y
contesta `sin datos`. Y `perfAssert = 45` no salta si vas a 142 fps: dispara cuando un frame cae **por
debajo** del umbral, o sea justo en el tirón que perseguimos. Con `perfContinuo = true` el volcado sale
solo cada vez que ocurre — no hay que llamar a nada.

**Cierra F12**, juega 20-30 s, vuelve a abrir y pega:

```js
game.perfAssert = 0;
game.cacheStats();
game.chunksActivos();
```

La primera fila del volcado es el sospechoso (ordenado por ms total). Cómo se lee, en
[`README.md`](README.md).

Sospechoso habitual cuando pasa **en todos los mapas**: un **snippet** que corre en todos ellos.
`mundo-autoarranque` es global (`CLAUDE.md`), así que se paga siempre:

```js
game.snippets && game.snippets.lista && game.snippets.lista();
mc._parkour, mc._deslizVel        // ¿hay costuras de snippet activas?
```

---

## Qué hay que entregar

1. Los tres números de la esquina en reposo (fps / vox / dib·tri·ch).
2. La tabla de `game.renderDump()` entera.
3. Paso 2 en una palabra: **CPU** o **GPU**.
4. Si fue GPU: qué palanca del paso 3 los devolvió.
5. Si fue CPU: el volcado `[perf]` entero + `cacheStats()` + `chunksActivos()`.
6. **Desde cuándo pasa**, si te consta: es la mitad del diagnóstico.
