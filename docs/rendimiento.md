# Rendimiento — qué se está dibujando de verdad

Tres herramientas, y **no miden lo mismo**. Confundirlas es perder una tarde:

| herramienta | qué mide | cuándo |
|---|---|---|
| `game.showFPS` / `game.fps` | fotogramas por segundo | siempre; dice **que** va lento, nunca **por qué** |
| `game.showVoxels` / `game.voxels` | **quads de geometría** que suman los bucles de `mcRender` | siempre |
| **`game.showRendered`** | **llamadas de dibujo y triángulos REALES**, repartidos por pasada | REQ-REN1 |
| `game.perfAssert` / `game.perfDump()` | tiempo de CPU por función (profiler REQ-PERF1) | cuando el cuello es JS, no GPU |

`game.voxels` cuenta lo que el código *cree* que manda; `game.showRendered` envuelve `gl.drawArrays` y
cuenta lo que la GPU *recibe*. Cuando los dos no cuadran, el bueno es el segundo.

---

## `game.showRendered` — REQ-REN1

```js
game.showRendered = true     // medidor en pantalla, bajo el de colores (se recuerda)
game.renderDump()            // el desglose por pasada del último frame medido
game.metricas()              // los cuatro medidores de golpe, por consola
```

En pantalla: `118 dib · 152.912 tri · 11/64 ch` — llamadas de dibujo, triángulos y **chunks vistos /
chunks del mundo**. La consola da el reparto:

```
118 draws · 152.912 triángulos · 11/64 chunks · pico 243 draws
┌──────────────┬────────┬─────────────┬─────────┐
│ pasada       │ draws  │ triángulos  │ %draws  │
├──────────────┼────────┼─────────────┼─────────┤
│ reflejo      │   80   │   134.126   │   68    │
│ terreno      │   11   │     9.312   │    9    │
...
```

Pasadas que se etiquetan: `sombra`, `cielo`, `terreno`, `capas`, `agentes`, `reflejo`, `voxUI`,
`estructuras`, `fino`, `estruct-tex`, `translúcido`, `notas`, `previa`, `overlay`, y `(suelta)` para
lo que se dibuja fuera de `mcRender`.

### `game.metricas()` mide, no consulta

Devuelve los cuatro **siempre con valor**, tenga o no encendido cualquier medidor: **renderiza un
fotograma propio** y lo mide. Hace falta por dos motivos, y los dos dieron guerra:

- `game.colors` sólo se refresca mientras el medidor de colores está encendido, así que con él apagado
  `game.metricas()` decía `colores: 0` (lo reportó el dueño el 2026-08-20). Ahora se cuentan a mano con
  un `readPixels` **síncrono** sobre ese fotograma. La vía del medidor no sirve: va por PBO asíncrono y
  llega un frame tarde, y quien llama desde la consola no tiene frame siguiente.
- Ese `readPixels` desata antes `PIXEL_PACK_BUFFER`: si el PBO del medidor lo dejó atado, leer a un
  array de CPU es `INVALID_OPERATION` y la cuenta saldría a cero otra vez, ahora en silencio.

⚠️ Entre el `mcRender()` y el `readPixels` **no puede haber un `await`**: es la misma regla que ya
gobierna `mcFoto` (el buffer de dibujo se descarta al cerrar el fotograma).

**Apagado no envuelve nada** (mismo trato que `game.perfAssert = 0`: coste 0). Al encenderlo se
envuelve `gl.drawArrays` una vez; al apagarlo se desenvuelve, pero **sólo si nadie ha envuelto
encima** — el profiler REQ-PERF1 también envuelve `gl.drawArrays` con verbosidad ≥ 2. Si hay otra
capa, el envoltorio se queda puesto y se corta solo con un `if`. Cada uno restaura **el original que
él capturó**, así que los dos pueden convivir en cualquier orden.

⛔ **Y por eso ninguno de los dos captura con `.bind(gl)`.** `bind` devuelve una función *nueva*: la
copia pierde la marca (`_ren`, `_perf`) de quien envolviera debajo, y al desenvolver ya nadie
reconoce su propio envoltorio — la capa de abajo queda enterrada para siempre y `gl.drawArrays` nunca
vuelve a ser el original. Se guarda la función tal cual y se llama con `.call(gl, …)`. Lo vigila
[`performance/sonda_perfdump_capas.js`](../performance/sonda_perfdump_capas.js), que apila los dos en
los dos órdenes y comprueba que al final no queda nada puesto.

### Sólo en el Mundo

El visor 3D del editor y el modo Play **rasterizan en canvas 2D**: no hay `drawArrays` que contar. El
único contexto WebGL es el del Mundo (`app.js:8453`). Por eso el medidor sólo existe ahí (`#mc-ren`).

### En la foto de `Alt+F`

La ficha quemada lleva una **3ª línea** con los cuatro medidores, y los mismos números salen por
consola al disparar. **No depende de que el HUD esté encendido**: `mcFoto` fuerza la cuenta sobre su
propio `mcRender()` y devuelve el interruptor a como estaba (sin tocar `localStorage`). Los colores de
esa línea son **exactos** y de ese mismo fotograma —se cuentan sobre el lienzo ya compuesto, antes de
pintarle la mira y la ficha—, mientras que el medidor de pantalla va por PBO asíncrono y llega un
frame tarde. Quedan también en crudo en `data/fotos/<id>.json` (`ficha.medidores`).

---

## Caso resuelto: por qué `/map/plan` cae más que mapas más grandes

Pregunta del dueño (2026-08-20): «tengo mapas mucho más grandes que `/map/plan` y no caen tanto los
fps». Con el medidor se ve en un frame. Misma cámara, A/B/A, SwiftShader headless:

| | ms/frame | draws | triángulos |
|---|---|---|---|
| A · tal cual | 282,7 | 118 | 152.912 |
| B · `game.reflejoEntorno(0)` | **161,0** | **27** | **18.786** |
| C · reflejo otra vez | 206,0 | 101 | 148.988 |

**El reflejo planar del entorno se lleva 80 de los 118 draws y el 88 % de los triángulos**, y cuesta
el doble de tiempo que todo lo demás junto. No es un fallo: la pasada re-renderiza el mundo desde una
cámara espejada, y se enciende sola cuando hay agua translúcida a la vista
(`finoAl && mcAguaReflejo > 0 && mcReflEntorno > 0 && !mcFluidoOjo()`, `app.js:12574`).

Lo que hace especial a `/map/plan` **no es el tamaño, es el agua**: Ciudad-MD usa `agua` como
separador de barrios ([`docs/ciudad-md.md`](ciudad-md.md)), o sea **canales por todas partes**, así que
la pasada de reflejo está encendida mires donde mires. Un mapa el doble de grande sin agua a la vista
no la paga nunca. Por eso el número de voxels no predecía nada.

Corolario para medir: **el tamaño del mundo no es la variable**. Antes de optimizar nada, mirar el
reparto por pasada.

### Falsa pista, anotada para no repetirla

En una primera medida la pasada `sombra` salía con 126 draws por frame y parecía la culpable. Era el
**orden de las medidas**: se movía la cámara y se medía en el acto, con los chunks entrando todavía
(`mcShadowDirty()` en el camino de la caché LRU, `app.js:10745`) y el mapa de sombra rehorneándose. Con
la escena en reposo, la pasada `sombra` no aparece: su caché por firmas funciona. De ahí el A/B/**A**
de la tabla — sin volver a A, la primera medida miente.

⚠️ Y el aviso de siempre: bajo SwiftShader los **ms absolutos no valen** (`app.js:5782` lo dice para el
profiler). Lo que vale es el reparto por pasada y las proporciones.
