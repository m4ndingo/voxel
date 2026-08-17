# Estudio Técnico: Escalabilidad y Límites de Tamaño de Mapas en VoxelForge

Este documento recoge el análisis técnico sobre las limitaciones actuales de tamaño de los mundos en VoxelForge (96², 512², 1024², 2048²+ o infinitos), el impacto de memoria/GPU y la hoja de ruta arquitectónica para permitir mapas masivos.

---

## 1. Diagnóstico de Limitaciones Actuales

El motor utiliza actualmente un modelo de **mundo monolítico en memoria contigua** (*single monolithic array*). Esto proporciona acceso O(1) directo mediante indexación lineal (`mcIdx(x, y, z) = x + y*nx + z*nx*ny`), pero impone barreras al crecer en tamaño:

### A. Memoria RAM en CPU (JS Heap / V8)
Para cada celda del mundo se mantienen arrays densos contiguos en memoria:
* `mc.grid`: `Uint16Array(nx * ny * nz)` (2 bytes por bloque).
* `mc.light`: `Uint8Array(nx * ny * nz)` (1 byte por celda para skylight).
* `mc.blockLight`: `Uint8Array(nx * ny * nz)` (1 byte por celda para luz artificial).
* Arrays temporales de dirección y dirty sets: ≈ 3 bytes extra por celda.

**Consumo por celda:** ≈ 7 bytes en CPU.

| Tamaño (X × Y × Z) | Volumen Celdas | Memoria Arrays CPU | Estado y Viabilidad |
|---|---|---|---|
| **96 × 40 × 96** (Defecto) | 368.640 | ≈ 2,5 MB | Instantáneo |
| **512 × 40 × 512** (Tope actual) | 10.485.760 | ≈ 73 MB | Totalmente estable |
| **1000 × 40 × 1000** | 40.000.000 | ≈ 280 MB | Estable en PC moderno |
| **2048 × 64 × 2048** | 268.435.456 | ≈ 1,87 GB | Riesgo de Crash en pestaña 32-bit/V8 |
| **4096 × 64 × 4096** | 1.073.741.824 | ≈ 7,5 GB | Imposible en array continuo |

---

### B. Límites de GPU en WebGL2: Textura 3D de Luz (`mc.blkTex`)
* La luz de bloque (antorchas y lámparas) se sube a una textura tridimensional `sampler3D` (`mc.blkTex`, unidad de textura 2).
* En WebGL2, `gl.getParameter(gl.MAX_3D_TEXTURE_SIZE)` impone un tope de hardware:
  * GPUs de escritorio (NVIDIA/AMD/Apple): **2048 téxeles**.
  * GPUs integradas / móviles: **1024 o 2048 téxeles**.
* Un mundo de más de 2048 en X o Z produce un error de WebGL al reservar la textura 3D monolítica.

---

### C. Resolución del Mapa de Sombras del Sol (`mcRenderShadow`)
* El sol proyecta sombras usando una cámara ortográfica cenital a un FBO de 2048 × 2048 téxeles que abarca el mundo completo de borde a borde:
  * En 96 × 96: 21,3 téxeles/bloque (resolución sub-bloque ultra nítida).
  * En 512 × 512: 4,0 téxeles/bloque (sombra nítida).
  * En 1024 × 1024: 2,0 téxeles/bloque (empieza a perder definición).
  * En 2048 × 2048: 1,0 téxel/bloque (sombra pixelada/dentada).

---

### D. Sobrecarga en el Bucle de Render (Draw Calls de Chunks)
* El mundo se particiona en chunks de 16 × 16 en XZ (toda la altura Y).
* En 1024 × 1024: hay **4.096 chunks**.
* En 2048 × 2048: hay **16.384 chunks**.
* Cada chunk activo con geometría genera hasta 3 VBOs (`vbo` opaco, `finoVbo` translúcido, `finoAVbo` alpha).
* Iterar 4.096 a 16.384 chunks en JavaScript en cada frame a 60 FPS (16,6 ms) satura la CPU sin frustum culling jerárquico.

---

### E. Carga Inicial y Cómputo Global de Skylight (`mcComputeLight`)
* El parche de luz incremental (`mcRelightBox`) resolvió el coste de edición en tiempo real (6-8 ms fijos).
* Sin embargo, al abrir el mapa por primera vez (`mcMeshAll`), el cálculo inicial de skylight (`mcComputeLight`) recorre todas las columnas:
  * En 512²: 680 ms.
  * En 1024²: ≈ 3-5 segundos (congelando el hilo principal).
  * En 2048²: > 20 segundos.

---

## 2. Hoja de Ruta Arquitectónica para Mapas Masivos

```
                                  ARQUITECTURA DE ESCALADO
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 1. Almacenamiento Disperso por Chunks: Map<chunkKey, Uint16Array(16 * H * 16)>         │
│    (Elimina el array contiguo de 7 GB; chunks vacíos ocupan 0 bytes)                  │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 2. Shadow Map & Luz Centrados en la Cámara (Clipmap Móvil)                            │
│    (La sombra y la textura 3D siguen al jugador en radio de 128-256 bloques)          │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 3. Off-thread Meshing & Skylight (Web Workers)                                         │
│    (El cálculo de luz y geometría ocurre en segundo plano sin tirones de FPS)          │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 4. Frustum Culling Jerárquico (Quadtree en CPU)                                        │
│    (Descarta cuadrantes enteros de chunks con 1 sola comprobación matemática)          │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Fase 1: Ampliación Segura a Corto Plazo (Sin reescribir la arquitectura)
1. **Límites de `game.resizeWorld`**:
   * Ampliar el tope actual de 512 × 40 × 512 hasta **1024 × 64 × 1024** (o 1536 × 40 × 1536).
   * Consumo aproximado en RAM: ≈ 150-280 MB, perfectamente manejable en cualquier PC contemporáneo.
2. **Optimizaciones de Carga**:
   * Dividir `mcMeshAll` inicial en micro-tareas (`requestIdleCallback` / macrotareas de 10 ms) para que la barra de carga progrese sin colgar la UI del navegador.

---

### Fase 2: Almacenamiento Disperso y Streaming de Chunks
1. **Chunk-based Storage**:
   * Reemplazar `mc.grid` monolítico por una estructura dispersa:
     ```js
     mc.chunksData = new Map(); // 'cx,cz' -> { grid: Uint16Array(16*H*16), light: Uint8Array, blk: Uint8Array }
     ```
   * Celdas de aire puro no consumen memoria.
   * Los chunks a más de `game.renderDist` se descargan de memoria o se comprimen en IndexedDB local.

2. **Shadow Map Centrado en Jugador**:
   * En lugar de abarcar el mundo completo, la proyección ortográfica de `mcRenderShadow` se centra en `mc.pos` con radio R (ej. 128 bloques).
   * La resolución de sombra se mantiene siempre ultra nítida independientemente del tamaño total del mundo.

---

### Fase 3: Renderizado Asíncrono en Web Workers (Mundos Infinitos)
1. **Web Workers**:
   * El cálculo de propagación de luz y el algoritmo Greedy Mesher se ejecutan en 2 a 4 Web Workers en segundo plano.
   * El hilo principal únicamente recibe los `ArrayBuffers` listos y llama a `gl.bufferData` de forma instantánea.
2. **Quadtree Culling**:
   * Árbol de 4 niveles que descarta grupos de 64 × 64 y 32 × 32 chunks fuera del cono de visión, manteniendo los draw calls por frame por debajo de 150.
