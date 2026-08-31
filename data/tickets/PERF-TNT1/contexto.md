# PERF-TNT1 · Prestaciones del motor gráfico en explosiones de TNT encadenadas (`explosion-tnt` + `alRomper`)

## 1. Contexto y Síntomas
Al encadenar varias TNTs en el mundo, la primera explosión detona las siguientes al destruir los bloques mediante sus eventos `alRomper` (introducido en REQ-TNT1 / v1.40).
Aunque funcionalmente todo se ejecutaba correctamente, los FPS caían de forma drástica, aparecían parpadeos / reaparición de bloques destruidos y se colapsaba el navegador por agotamiento de sockets de red (`ERR_INSUFFICIENT_RESOURCES`) al detonar grupos masivos de TNT (ej. 64 bloques).

---

## 2. Diagnóstico Técnico de Causas Raíz

### A. Tormenta de peticiones HTTP en cascadas (`game.snippet` / `mcPideSnippet`)
- Cada invocación de `alRomper` llamaba a `game.snippet('explosion-tnt', c)`.
- `mcPideSnippet` no tenía caché en memoria y realizaba un `fetch('/api/snippets/explosion-tnt', {cache:'no-store'})` por HTTP en cada llamada.
- Con 64 bloques detonando simultáneamente, se disparaban cientos de peticiones HTTP concurrentes en milisegundos, agotando los recursos de red del navegador (`net::ERR_INSUFFICIENT_RESOURCES`).

### B. Cascada combinatoria $O(N^2) \sim O(N^3)$ en `game.bloques.avisoDeRotura`
- Durante el precálculo de una onda esférica de radio 8, cada TNT consultaba `game.bloques.avisoDeRotura(x, y, z)` para todas las TNTs vecinas en un cubo de $17 \times 17 \times 17$.
- Como los bloques aún no habían desaparecido de la rejilla, cada TNT programaba de nuevo avisos de rotura sobre las mismas coordenadas, generando más de 200.000 detonaciones redundantes en cola.

### C. Reaparición de bloques (Efecto Fantasma / Anti-Phantom)
- Las ondas solapadas volvían a pintar fuego (`fireMat`) o sólidos sobre celdas que ya habían sido vaciadas a aire (`0`) por ondas previas dentro de la misma ráfaga.

### D. Búsqueda lineal en estructuras
- `mcQuitaPiezaEn` realizaba un escaneo lineal completo de `mc.structures` en cada `setVoxel`.

---

## 3. Solución Implementada

1. **Caché en Memoria de Snippets (`web/app.js: mcPideSnippet`)**:
   - Se añadió `_mcSnippetCache` (`Map`). Si un snippet ya fue descargado, se sirve de inmediato desde memoria en 0 ms sin peticiones de red.
   - Sincronización automática: al guardar o borrar en el panel de snippets (`snipSave`, `snipDelete`), la caché se actualiza / invalida.

2. **Deduplicación agnóstica de `avisoDeRotura` (`mundo-autoarranque.json`)**:
   - `game.bloques.avisoDeRotura(x, y, z)` ahora registra las celdas con aviso pendiente en `mc._avisosPendientes`.
   - Si una celda ya tiene un aviso en cola, las demás ondas concurrentes reciben `null`, garantizando que cada bloque solo detone **exactamente una vez**.

3. **Protección Anti-Phantom en `web/app.js: mcSetVoxel`**:
   - Cuando una celda se vacía a aire `0` dentro de un lote (`mc.batching`), se registra en `mcClearedCoords`.
   - Cualquier intento concurrente de pintar fuego o sólidos en esa misma coordenada dentro de la ventana de ráfaga es rechazado.

4. **Optimización rápida en `mcQuitaPiezaEn`**:
   - Retorno inmediato `if (!mc.structures || !mc.structures.length) return 0;`.
