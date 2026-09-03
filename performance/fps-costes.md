# 💰 COSTES Y PRESUPUESTOS — los números medidos

Vuelve a [`CAIDA_DE_FPS.md`](CAIDA_DE_FPS.md).

Solo números **medidos**, con su fuente. Lo no medido va marcado 🟡.

**Presupuesto del frame:** 60 fps = **16,6 ms** · 30 fps = 33,3 ms · 140 fps = **7,1 ms**.

---

## 📑 Índice

- [§1 · Sondeos y APIs](#1)
- [§2 · `voxelesUI` — la capa que se remalla entera cada frame](#2)
- [§3 · Estructuras vs rejilla — draw calls](#3)
- [§4 · Vértices: totales vs visibles](#4)
- [§5 · Mallado, caché LRU y sombra](#5)
- [§6 · Lo que se apila sin que lo veas](#6)

---

<a id="1"></a>
## §1 · Sondeos y APIs

| API | coste | fuente |
|---|---|---|
| `game.bloques.impactoEn` | **68 µs/llamada** | medido 2026-09-03 (3.109 llamadas = 212,1 ms) |
| `game.esqueletos.enPunto` | **20 µs/llamada** | medido 2026-09-03 (3.109 = 60,8 ms) |
| sonda de estructura (80 estructuras) | **9,2 µs/sonda** | `docs/particulas-y-efectos.md:350` |

**Regla:** a 68 µs, **245 llamadas** ya son un frame de 60 fps entero.
⇒ En cualquier bucle que sondee, la magnitud que importa es **llamadas/frame**, y necesita **techo**.

🟡 `game.bloques.impactoEn` a 68 µs parece caro para lo que hace — **sin ticket abierto**, no
investigado.

---

<a id="2"></a>
## §2 · `voxelesUI` — la trampa más cara

⚠️ **La capa se remalla ENTERA y sube a la GPU CADA FRAME** (`mcDrawArr`, `app.js:8128`, `8205`).
No es incremental. El coste es lineal con **todo lo que hay**, no con lo que cambió.

**1,28 µs por voxel y por frame**, sin codo:

| voxeles | ms/frame |
|---|---|
| 490 | 0,63 |
| 1.000 | 1,28 |
| 2.000 | 2,56 |
| 4.030 | 5,16 |
| **8.000** | **10,8** ← ahí se van los fps |
| 17.600 | 22,5 |

Fuente: `docs/particulas-y-efectos.md:123`.

**Consecuencias:**
- ⛔ **Agrandar NUNCA se hace apilando voxeles** → `game.voxelesUI.grosor(grupo, n)`.
  240 estrellas con `g16` = **983.040 vox** vs **240** (`CLAUDE.md:119`).
- Acumular a escala de paisaje (nieve, ceniza) en `voxelesUI` es **imposible por construcción**.
  Va en la **rejilla del mundo**: ahí el copo cuesta **un** remallado de chunk y después **0 por
  frame, para siempre** — da igual que sean 8.000 que 80.000 (`app.js:8128`).
- Subir `tope` de partículas se paga cada frame. 1.375 copos = 1,76 ms/frame.

---

<a id="3"></a>
## §3 · Estructuras vs rejilla — draw calls

| forma de poner cosas | coste |
|---|---|
| **rejilla** (`setVoxel`) | se funde en la malla del chunk → **0 draw calls** |
| **estructura** (`game.stamp`) | **1 draw call CADA UNA** |

Medido, 200 hojas de un bosque (`CLAUDE.md:91`):

| vía | tiempo | draw calls |
|---|---|---|
| `setVoxel` | **60 ms** | **0** |
| `game.stamp` | 385 ms | **200** |

⇒ **Bosque, paisaje, cualquier cosa masiva → `setVoxel`.** `game.stamp` es para piezas que se
manipulan como objeto.

Estado observado en `default`: **473 estructuras / 759.702 vértices**.

---

<a id="4"></a>
## §4 · Vértices — totales vs visibles

Medido en `default` durante la caída:

| magnitud | valor |
|---|---|
| `mc.chunks.size` | 1.024 |
| vértices **TODOS** | 4.602.540 |
| vértices **VISIBLES** | **137.232** (3 %) |
| draws/frame | **44** |
| verts/frame | 154.287 |

Reparto por fase: `principal` 41 draws / 149.352 verts · `voxelesUI` 1 / 3.643 ·
`fantasma` 1 / 1.254 · `cielo` 1 / 36.

**Lectura:** 44 draws y 154 k verts/frame es **poquísimo** para una GPU. Cuando el culling
funciona así de bien, **el dibujado no es el problema** por mucho que el mundo sea grande.
Es la prueba de que «mapa grande» ≠ «fps bajos».

---

<a id="5"></a>
## §5 · Mallado, caché LRU y sombra

| palanca | nota |
|---|---|
| `game.cacheStats()` / `.reset()` | ratio del LRU de `mcMeshChunk`. Ratio bajo + los mismos chunks siempre = **thrash** |
| `game.chunksActivos()` | **qué** se está re-mallando |
| `game.chunkCacheSlots` | ranuras del caché (32 por defecto) |
| `game.shadowSize` | 2048 → 1024 → 512. **La palanca buena para abaratar la sombra** |
| `game.shadowGeoMs` | defecto **0 a propósito**: espaciar el rehorneo hace que la sombra **salte** y «queda feo» |

⚠️ `mcRenderShadow` (`app.js:10655`, bucle en `:10724`) recorre **TODOS** los chunks —
sin `renderDist` ni frustum. 🟡 Observado leyendo el código, **no medido** como cuello.

Ejemplo real de volcado (README): `mcMeshChunk` 4 llamadas = **97,31 ms** (41,20 ms la peor).
El mallado es la función gorda del motor: cuando el problema **sí** es `app.js`, suele ser esta.

---

<a id="6"></a>
## §6 · Lo que se apila sin que lo veas

Fuente de caídas que no se ve en ningún reparto porque **el nombre es el mismo**, solo que hay
dos (o cinco) copias.

- **`game.snippet(id)` RE-EJECUTA, no cachea** (`mcCorreSnippet`, `app.js:24792`).
  Lanzarlo dos veces = **dos bucles rAF vivos**, dos costuras, doble coste.
- **1 sola costura sobre `mcUpdate`**: re-ejecutar desenvuelve por `mcUpdate._orig`.
  **Apilar duplica el trepado** (`CLAUDE.md`). Si tocas la costura, **sube `VERSION`**.
- Toda envoltura guarda `fn._orig` y `off()` devuelve **byte a byte** — es la ley de oro, y también
  la única forma de que un A/B sea limpio.

**Comprobación rápida de apilado:**
```js
// ¿cuántos callbacks distintos con el mismo nombre hay vivos?  → §3 de fps-metodo.md
// y para las costuras:
!!window.mcUpdate._orig && !!window.mcUpdate._orig._orig   // true = APILADO
```

---

## 🧮 Reglas de bolsillo

| regla | de dónde sale |
|---|---|
| **245 sondeos** de `impactoEn` = 1 frame de 60 fps | 68 µs × 245 ≈ 16,6 ms |
| **8.000 voxeles** en `voxelesUI` = 10,8 ms/frame | 1,28 µs/voxel |
| **200 estampados** = 200 draw calls y 6× el tiempo de `setVoxel` | medido |
| lo que va a la **rejilla** cuesta **0 por frame** para siempre | `app.js:8128` |
| 44 draws / 154 k verts/frame = la GPU **no** es el problema | medido en `default` |
