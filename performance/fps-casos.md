# 📕 CASOS CERRADOS — con su evidencia

Vuelve a [`CAIDA_DE_FPS.md`](CAIDA_DE_FPS.md).

Un caso por sección: **síntoma → qué se descartó → qué lo cazó → causa → arreglo → resultado**.
Se guardan los **números**, no la conclusión: el número es lo que sirve la próxima vez.

---

## 📑 Índice

- [PERF-FLECHA1 · la flecha que se escapa del mundo (140 → 3,4 fps)](#flecha)
- [PERF-AGUA1 · el agua que nunca se asienta (124 → 144 fps) — **cerrado: gobernador en el sim**](#agua)

---

<a id="flecha"></a>
## PERF-FLECHA1 · la flecha que se escapa del mundo

**Fecha** 2026-09-03 · **Mapa** `default` · **140 fps → 3,4 fps**

### Síntoma, en palabras del dueño

> «cuando empecé el mapa a jugar iba bien **hasta que llegó a cierto punto** […] **al rato** es
> cuando caen los fps»

Clave del relato: **no cae al entrar, cae con el tiempo y no se recupera** ⇒ algo **acumula**.

### Lo que se descartó primero (todo negativo)

| se probó | resultado |
|---|---|
| `game.renderMode = 'fast'` | **no mejora** |
| `game.renderScale = 0.5` | no mejora, «solo se ve peor» |
| `game.renderDist = 4` | **no hace nada** |
| `game.shadowSize = 1024` | «no influye en nada» |
| `game.reflejoEntorno(0)` (agua) | no mejoraron los fps |
| `game.perfDump()` | **insuficiente**: no señalaba a nadie |

> Dueño: *«no creo que los tiros vayan por cambiar variables al menos estas… piensa mejor,
> tenemos un profiling»*. Tenía razón: eran cinco apuestas a la hipótesis «es la GPU», ya falsa.

### Estado del mundo (para ver que el tamaño NO era el problema)

`mc.chunks.size` 1.024 · `mc.structures.length` **473** (759.702 verts) · `mc.agents.size` **0**
· verts TODOS 4.602.540 · verts **VISIBLES 137.232** · **44 draws/frame**.

⇒ 44 draws y 154 k verts/frame **no hunden ninguna GPU**. El culling funcionaba.

### Lo que lo cazó — la cadena de evidencia

**1) Repartir el frame** ([`fps-metodo.md` §2](fps-metodo.md#2)):

```
frame 236 ms  ·  mcTick 1,9 ms  ·  RESTO 234 ms  (99,2 %)
```

El motor era **inocente**. El 99 % del frame no tenía dueño.

**2) Descartar GPU:** **149 longtasks** de tipo `self` ⇒ **JS quemando CPU**, no espera de GPU.
Ahí murió definitivamente la hipótesis del render.

**3) ⭐ Atribución rAF por nombre** ([`fps-metodo.md` §3](fps-metodo.md#3)) — 5 segundos:

| callback | llamadas | ms/llamada | % del reloj |
|---|---|---|---|
| **`bucleFlechas`** | 89 | **250,8** | **97,7 %** |
| `mcTick` | 89 | 2,0 | 0,8 % |

El culpable vive en `data/snippets/flecha-arco.json`. **`game.perfDump()` no podía verlo jamás**:
solo envuelve funciones de `app.js`.

**4) Repartir su coste** — con **solo 7 flechas fugadas**, **3.109 subpasos/frame**:

| api | llamadas | ms | µs/llamada |
|---|---|---|---|
| `game.bloques.impactoEn` | 3.109 | 212,1 | **68** |
| `game.esqueletos.enPunto` | 3.109 | 60,8 | 20 |

### La causa raíz — una condición de más

La colisión contra el terreno **solo se mira si `mcInside(bx,by,bz)`** (dentro del mundo), y **no
había rama `else`**. Encadenado:

```
flecha sale del mapa → no choca NUNCA → no se clava NUNCA → nadie la retira
```

Los cuatro `flechas.splice()` del bucle eran **todos por impacto**; y `vidaMax` solo corría
**estando ya clavada**. Resultado: **inmortal**.

**Y se realimenta** (esto es lo que lo vuelve precipicio, no pendiente):
gravedad sin freno (`f.vy -= f.grav * dt`) ⇒ más velocidad ⇒ y `subPasos = ceil(distPaso / 0,20)`
**crece con la velocidad** ⇒ coste por flecha **sin techo**.

### El arreglo — 3 cambios, y los 3 hacen falta

`herramientas/parche_snp_flecha_fuga.py` (por ancla, idempotente):

| | qué | por qué |
|---|---|---|
| **A** | `FLECHA_Y_MIN=-8`, `FLECHA_MARGEN=256`, `FLECHA_SUBPASOS_MAX=64` | los topes |
| **B** | la vida corre **SIEMPRE**, clavada o en vuelo + **retirar la fugada** | **LA CAUSA RAÍZ** |
| **C** | **techo** de `subPasos` + `console.warn` una sola vez | corta la realimentación **aunque algo se vuelva a escapar** |

⚠️ **C no es un apaño que tape B.** Es el techo que impide que *cualquier* fallo futuro vuelva a
clavar el frame; y su aviso delata que hay flechas que no mueren.

### Validación en caliente (ley de oro) y resultado

Antes de tocar el fichero, envolviendo `game.bloques.impactoEn` para que devolviera pieza fuera
del mundo: el propio snippet clavaba la flecha y la mataba por `vidaMax`.

**3,4 fps → 101,4 fps.** `cortes: 3`, `ultima: [259, -8, 106]` — **cayendo por debajo del mundo**
(`y = -8`), exactamente la fuga que arregla **B**.

### Lo que dejó puesto

- Los 3 topes en `data/snippets/flecha-arco.json`.
- **`data/snippets/guardian-bucles.json`** — la salvaguarda que pidió el dueño
  (*«y si puedes meter alguna salvaguarda o alerta para detectar cosas como esta hazlo»*):
  envuelve `requestAnimationFrame`, mide **por nombre**, avisa **1 vez por culpable** a partir de
  8 ms/llamada. Ignora `mcTick` a propósito (el motor ya tiene `perfAssert`; avisar por duplicado
  enseña a ignorar los avisos).

### Las 4 lecciones

1. **El profiler tiene un punto ciego con nombre**: `game.perfDump()` solo ve `app.js`.
   Un snippet puede llevarse el 97 % del reloj y no aparecer.
2. **«RESTO» no es la GPU** hasta que lo demuestres con longtasks.
3. **Poca cantidad puede ser el problema**: 7 entidades bastaron. No busques solo «muchas cosas»,
   busca **coste por entidad sin techo**.
4. **Mide llamadas/frame, no solo ms.** 68 µs no es caro; 3.109 llamadas sí.

### Pendiente

🟡 `game.bloques.impactoEn` a **68 µs/llamada** — parece caro para lo que hace.
**Sin ticket abierto**, no investigado.

---

<a id="agua"></a>
## PERF-AGUA1 · el agua que nunca se asienta (124 → 144 fps)

**Síntoma** (2026-09-03, mapa `default`, 1024 chunks / 473 estructuras): en mapas grandes los fps
no caen al mirar al suelo — es peor: **no SUBEN** al mirar suelo o pared. Coste independiente de la
vista ⇒ fijo por frame.

**Qué se descartó, con su número** (las 4 sondas nuevas del inventario del [`README.md`](README.md)):

| hipótesis | evidencia que la mató |
|---|---|
| dirección de cámara | `sonda_mirar_suelo`: frame 7,6 ms clavado horizonte↔suelo |
| sombra (pasada + re-horneos) | `sonda_coste_fijo`: A≈B≈C con `sunShade=1` y horneos congelados |
| luz dinámica | `sonda_luz_dinamica`: 0,08 ms/frame; `mc.luzDinamica=false` no movió nada |
| edición por `mcSetVoxel` | 0 llamadas/s en reposo |

**Qué lo cazó**: el número que no cuadraba — **44 `mcMeshChunk`/s con el jugador QUIETO**
(1,3-1,7 ms/frame) y la caché LRU al **18,7 %** de aciertos. Leyendo `app.js:8816-8877`: la cola de
fluidos procesa ≤32 celdas cada ~90 ms y re-malla la caja tocada cada ≥80 ms. 11 ticks/s × caja de
4 chunks = los 44/s. `sonda_fluidos` lo confirmó en vivo: **`game.fluidos.tick` en no-op ⇒
123,9 → 144,2 fps** (6,94 ms = clavado al vsync de 144 Hz) y mallados 44/s → 0.

**Causa** (celdas leídas de `data/mundo.vox`): **30 celdas `hab:agua-*` en un estado que
`processCell` nunca da por asentado**, en la charca de chunks (20-21, 14-15):
- la **cornisa**: 16× `agua-1` en `x=339, y=18, z=225-239` con **aire debajo** — borde colgando;
- la **capa flotante**: `agua-5/6/7` en `y=19` (filas z=232 y z=272) **sobre agua llena** — niveles
  parciales oscilando en la superficie. Su tamaño casa con la cola viva (mín 5, máx 13, media 9).

Mismo patrón **fuga + realimentación** que PERF-FLECHA1, en agua: nada la mata, y su coste (remallar
la caja) no depende de dónde mire nadie. Presupuesto: cada charca inquieta así cuesta ~1,3 ms/frame
**para siempre**; con océanos la caja crece.

**Arreglo — la vía de DATOS quedó descartada por medición** (mismo día): en vivo las celdas en
flujo ya no eran las 30 del disco sino **54 en un muro en z=242** (el agua VAGA), y al hacerlas
aire la charca vecina volvió a derramar sobre el hueco: la cola pasó de ~9 a **~170 estable** y
los fps no subieron. El agua se REGENERA ⇒ calmar el mapa no basta.

**La vía SIM cerró el caso** (la pregunta 2 del patrón de `CAIDA_DE_FPS.md`):
1. **Validación en caliente** (`consola_gobernador_fluidos.js`): envoltura sobre `game.fluidos.tick`
   — si la cola lleva >5 s sin vaciarse (agua en bucle), la cadencia baja de ~11 a 1 tick/s.
   El dueño la corrió en `default` y **confirmó la mejora** («mejoró», mismo día).
2. **Graduado a `app.js`** (ley de oro cumplida: se gradúa EXACTAMENTE lo validado, no otra cosa):
   el mismo gobernador dentro de `tick()` del bloque de fluidos. Cola >5 s viva ⇒ 1 paso/s; cola
   a 0 ⇒ cadencia normal; el agua recién vertida corre normal sus primeros 5 s. `tick(true)` lo
   salta (los tests no lo ven). Chivato `game.fluidos.gobernado()` + `console.warn` una vez.

### Lo que dejó puesto

- El gobernador en `tick()` (`app.js`, bloque de fluidos) + `game.fluidos.gobernado()`.
- `performance/consola_gobernador_fluidos.js` — re-medir A/B en cualquier mapa sospechoso.
- Doc de conducta → [`docs/fluidos.md`](../docs/fluidos.md) §gobernador.

### Pendiente (sin ticket)

🟡 La **caducidad por celda** (que la celda que oscila sin cambio neto se ASIENTE de verdad) haría
innecesario el gobernador y arreglaría también el mallado residual (~4/s). No se hizo: mecanismo
distinto del validado en caliente, y el gobernador ya recupera el vsync. Si algún mapa con océanos
(Fortnite) sigue bajo, empezar por ahí.
🟡 El agua gobernada se mueve **a cámara lenta a ojo**; si al dueño le molesta en algún mapa, la
caducidad por celda es el arreglo fino.
