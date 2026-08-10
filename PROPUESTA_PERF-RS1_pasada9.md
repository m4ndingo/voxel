# Propuesta · PERF-RS1 · Pasada 9 — Budget de mesh por frame

**Fecha**: 2026-08-10
**Ticket**: [PERF-RS1](PLAN.md#-perf-rs1)
**Estado**: 🟡 propuesta — pendiente de aprobación del dueño
**Autor**: Kiro (a partir de datos del dueño en su GPU real)

---

## 1. Resumen ejecutivo

Los fps caen a 5-30 en circuitos de redstone con pistones + observadores oscilando.
Tras 8 pasadas de optimización, el profiler condicional ([REQ-PERF1](PLAN.md#-req-perf1))
con `renderMode='fast'` ([REQ-PERF2](PLAN.md#-req-perf2)) descarta GPU/iluminación y
apunta al **coste de `mcMeshChunk`** disparado por `rs.procesarRemallar` y
`rs.dispararObservador`. Un solo re-mallado del chunk del circuito complejo cuesta
**20-124 ms**, y ocurren 3-5 por frame → frames de 100-200 ms → 5-10 fps.

Propuesta: **budget de mesh por frame** en el motor de redstone. Cada frame procesa
hasta ~8 ms de re-mallado; los chunks restantes se aplazan al siguiente rAF. Coste
de implementación: pequeño (~20 líneas en `redstone/redstone.js`).

---

## 2. Diagnóstico definitivo (con datos reales del dueño)

### 2.1. Setup del test

- `renderMode='fast'` activo (GPU al mínimo — descarta iluminación).
- `perfAssert=120`, `perfVerbosity=2`, `perfContinuo=true`.
- Motor de redstone auto-instrumentado (`rs.dispararObservador`, `rs.encolarVecinos`,
  `rs.notificarObservadoresVecinos`, `rs.procesarRemallar`, `rs.drenar`, `rs.aplicar`).
- Circuito: 3 pistones + 3 observadores oscilando.

### 2.2. Patrón observado (múltiples volcados consecutivos)

Todos los frames lentos siguen el mismo patrón:

```
funcion                       llamadas   ms total  max ms/call
mcRemeshAround                       3      88.20      41.50
mcMeshChunk                          4      87.70      25.50  ← EL CUELLO
rs.procesarRemallar                  1      41.60      41.60
rs.dispararObservador                5      21.30      21.30
gl.bufferData                       18       1.80       0.40   18.5 MB
mcTick                               1       2.40       2.40
mcRender                             1       0.20       0.20
```

Casos extremos capturados:

- Frame **3.0 fps (333 ms)**: `mcMeshChunk 155 ms/call`, `procesarRemallar 155 ms`.
- Frame **3.7 fps (271 ms)**: `mcMeshChunk 63 ms/call × 2 = 63 ms`, `mcTick 8 ms`.
- Frame **acumulado 175 ms** en una sola tanda: `mcRemeshAround 2 × 124 ms/call`.

### 2.3. Conclusiones del diagnóstico

- **No es GPU**: `renderMode='fast'` no cambia el patrón. Draws bajan a 25 (baseline)
  y vertices a 500k. La GPU no está saturada.
- **No es la sombra**: con `renderMode='fast'` la sombra no se dibuja
  (`sunShade=1`), y los fps siguen cayendo.
- **No es el motor de redstone lógico**: `rs.encolarVecinos`, `rs.notificarObservadoresVecinos`,
  `rs.drenar` suman < 5 ms en total por frame.
- **Sí es `mcMeshChunk`**: un solo re-mallado de un chunk con estructuras finas
  (pistones + observadores) cuesta 20-124 ms. Se llama 3-5 veces por frame.
- **Origen de las llamadas**: `rs.procesarRemallar` (buffer coalescido en rAF)
  y `rs.dispararObservador` en cascada.

---

## 3. Causa raíz

### 3.1. Cómo se genera el trabajo

En cada disparo de observador:
1. `dispararObservador` cambia `mc.grid[nx,ny,nz]` (id del observador on/off).
2. El envoltorio `mcSetBlock` del snippet llama a `encolarVecinos(x,y,z)`.
3. `notificarObservadoresVecinos` dispara los observadores adyacentes.
4. En cadena, se pueden disparar 3-7 observadores en un mismo frame.
5. Cada cambio de bloque llama a `mcRemeshAround(x,y,z)` (vía `remallar`).
6. `mcRemeshAround` agrega los 1-3 chunks tocados a `tocadasRemallar`.
7. `rs.procesarRemallar` procesa `tocadasRemallar` en el siguiente rAF, llamando
   `mcMeshChunk` para cada chunk.

### 3.2. Por qué `mcMeshChunk` cuesta tanto

Un chunk normal cuesta 1-3 ms. El chunk del circuito complejo cuesta 20-124 ms
porque:

- Contiene múltiples **estructuras finas** (`mcRecFina`): pistones, cabezas de
  pistón, observadores. Cada estructura tiene VBO fino separado que se re-hornea.
- Tiene **muchos IDs distintos** por celda (observador × 6 rotaciones × 2 estados,
  pistones × 6 rotaciones × 2 estados). El cache LRU no basta (pasada 6 confirmó
  25-33% hit ratio con 200 slots).
- Cada mesh sube su VBO a GPU (`gl.bufferData`). En los volcados: **13-25
  llamadas de `gl.bufferData` = 10-20 MB subidos por frame**.

### 3.3. Por qué el cache LRU (pasada 5-6) no basta

Con 3 pistones + 3 observadores oscilando, cada uno genera 2-6 estados distintos.
En el peor caso: `2^6 = 64` combinaciones. Multiplicado por la rotación y el
estado del pistón: >200 firmas de chunk. Con 32-200 slots de cache, el ratio de
hit se queda en 25-33% — cada pulso invalida los estados cacheados.

---

## 4. Propuesta principal — Pasada 9 · Budget de mesh por frame

### 4.1. Diseño

En `redstone/redstone.js`, la función `procesarRemallar()` actualmente procesa
**todos los chunks tocados de golpe** en un rAF. Cambiar a: procesar hasta un
**presupuesto de N ms por frame** (default 8 ms), y aplazar el resto al siguiente
rAF.

```js
// redstone.js — procesarRemallar (versión con budget)
function procesarRemallar(){
  rafRemallar = 0;
  if(!tocadasRemallar.size) return;
  var budget = (typeof api !== 'undefined' && api.meshBudgetMs > 0)
    ? api.meshBudgetMs : 8;   // 0 = sin budget = comportamiento actual
  var t0 = (typeof performance !== 'undefined') ? performance.now() : Date.now();
  var claves = Array.from(tocadasRemallar);
  tocadasRemallar.clear();
  var i = 0;
  while(i < claves.length){
    var partes = claves[i].split(',');
    var x = +partes[0], y = +partes[1], z = +partes[2];
    if(typeof mcRemeshAround === 'function') mcRemeshAround(x, y, z);
    i++;
    if(budget > 0){
      var t = (typeof performance !== 'undefined') ? performance.now() : Date.now();
      if(t - t0 > budget) break;   // presupuesto agotado: aplazar el resto
    }
  }
  // Re-encolar los chunks no procesados.
  if(i < claves.length){
    for(var j = i; j < claves.length; j++) tocadasRemallar.add(claves[j]);
    pedirRemallar();   // rAF secundario
  }
}
```

### 4.2. Efecto esperado

Con 4 chunks pendientes a 25 ms cada uno:

| escenario         | frames | duración/frame | fps ejercicio |
|-------------------|--------|----------------|---------------|
| actual (sin budget) | 1     | 100 ms         | 10            |
| con budget = 8 ms | 4      | 25-30 ms       | 33-40         |
| con budget = 16 ms | 2     | 50 ms          | 20            |

**Trade-off visual**: los pistones se ven "atrasados 1-3 frames" al conmutar
rápido (< 50 ms de lag visual). No hay salto de fps, sí lag de mesh.

### 4.3. Tunable

```js
game.redstone.meshBudgetMs = 8;    // defecto propuesto: 8 ms/frame
game.redstone.meshBudgetMs = 0;    // desactivar budget (comportamiento actual)
game.redstone.meshBudgetMs = 16;   // más agresivo (30 fps min garantizados)
```

### 4.4. Ficheros a tocar

- `redstone/redstone.js`: reescribir `procesarRemallar` (~20 líneas).
- `data/snippets/redstone.json`: republicar con `node redstone/make_snippets.js`.
- `PLAN.md`: añadir Pasada 9 a la sección PERF-RS1.
- `test_observador_rotacion.js`: NO tocar (el budget no afecta el estado lógico,
  solo el orden de mesh).

### 4.5. Verificación

- Test guardián existente: `node test_observador_rotacion.js` debe seguir pasando
  igual (el budget no cambia lógica).
- Sonda nueva: `sonda_budget_mesh.js` que verifica que con `meshBudgetMs = 8`,
  ningún frame tiene `mcMeshChunk > 15 ms` acumulado.
- Test manual del dueño: circuito 3 pistones + 3 observadores oscilando →
  fps sostenidos > 40 (vs 5-30 actual).

---

## 5. Alternativas descartadas o de más coste

### 5.1. Mesh incremental por celda (refactor grande — 2-4 días)

Refactorizar `mcMeshChunk` para que acepte una lista de celdas modificadas y solo
re-genere las caras alrededor de esas celdas. Ahorraría 90% del coste por mesh,
pero requiere reescribir la generación de caras + el manejo del atlas + los VBOs
+ las estructuras finas.

**Ventaja**: elimina el problema de raíz. Frames a 100+ fps.
**Coste**: alto. Refactor profundo del corazón del renderer.
**Riesgo**: alto. Puede romper luces, sombras, x-ray, agentes, etc.

### 5.2. Mesh en Web Worker (refactor grande — 2-3 días)

Serializar el chunk (grid, atlas, estructuras) a un worker que devuelve el mesh.
El hilo principal no se bloquea.

**Ventaja**: hilo principal libre → fps sostenidos aunque el mesh tarde 100 ms.
**Coste**: alto. Requiere reorganizar mucho: atlas duplicado en worker, message
passing, sincronía.
**Riesgo**: medio-alto. Muchos edge cases (chunks que dependen entre sí, luz
interior, animaciones de estructura).

### 5.3. Bajar detalle del chunk complejo (medio — 4-6 h)

Cuando un chunk supera N estructuras finas, dejar de generar el VBO fino y usar
solo caras cúbicas. Los pistones se ven como cubos, no como estructuras.

**Ventaja**: mcMeshChunk vuelve a costar 1-3 ms.
**Coste**: medio.
**Riesgo**: alto de rechazo por el dueño — visual degradado en el escenario
donde MÁS quiere buenos visuales (su circuito de redstone).

### 5.4. Coalescencia agresiva (cambio pequeño — 2 h)

En `mcRemeshAround`, si el mismo chunk ya ha sido mesheado en los últimos 16 ms,
saltar. Reduce meshes redundantes pero **no** el coste del primer mesh caro.

**Ventaja**: sencillo.
**Coste**: bajo.
**Riesgo**: bajo, pero **no resuelve el problema** — los meshes seguirían
tardando 20-124 ms cuando ocurren.

---

## 6. Recomendación

**Aprobar Pasada 9 (budget de mesh)** por relación coste/beneficio.

- **Coste**: ~20 líneas de código en un único fichero. 1-2 horas.
- **Beneficio**: fps sostenidos > 40 en escenario ejercido (vs 5-30 actual).
- **Trade-off**: lag visual de <50 ms al conmutar circuitos rápido — aceptable
  para un juego de sandbox.

Si tras la pasada 9 los fps no llegan a la meta (144 fps sostenidos), el siguiente
paso natural es **§5.1 mesh incremental por celda** — refactor grande, pero es
lo único que puede lograr fps altos con este escenario.

---

## 7. Estado de aprobación

- [ ] Dueño lee esta propuesta.
- [ ] Dueño autoriza Pasada 9 con `meshBudgetMs = 8` por defecto.
- [ ] O propone otro budget / rechaza / pide alternativa.

**Ninguna línea de código se toca hasta esa autorización.** (Regla del proyecto
para «nuevo ticket / nueva pasada».)
