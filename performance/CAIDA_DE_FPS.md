# 🔻 CAÍDA DE FPS — documento maestro

Todo lo que sabemos sobre **por qué se hunden los fps en VoxelForge** y **cómo se encuentra al
culpable**. Telegráfico a propósito.

> **La lección que paga este documento** (2026-09-03, mapa `default`, 140 fps → 3,4 fps):
> se perdió una tarde tocando `renderDist`, `renderScale`, `shadowSize` y `renderMode`
> — **ninguna movía la aguja** — porque el culpable era un bucle `rAF` de un snippet, y
> `game.perfDump()` **no puede verlo**. Cinco segundos de la medición correcta lo cazaron.
> Dueño: *«no creo que los tiros vayan por cambiar variables […] piensa mejor, tenemos un profiling»*.

---

## 📑 Índice

| documento | qué contesta |
|---|---|
| **este** | el mapa: síntomas → sospechoso, y el orden en que se mira |
| [`fps-metodo.md`](fps-metodo.md) | **EL PROTOCOLO**: los 4 pasos que localizan cualquier caída, con el JS a pegar |
| [`fps-costes.md`](fps-costes.md) | **los números**: cuánto cuesta cada cosa, presupuestos por frame, umbrales |
| [`fps-casos.md`](fps-casos.md) | casos reales cerrados, con su evidencia y su cadena de razonamiento |
| [`README.md`](README.md) | inventario de ayudantes de consola ya existentes (`perfDump`, `renderMode`, caché LRU) |

Fuera de esta carpeta: [`docs/rendimiento-de-entrada.md`](../docs/rendimiento-de-entrada.md) (latencia
de ratón/teclado, otra cosa), [`docs/particulas-y-efectos.md`](../docs/particulas-y-efectos.md)
(presupuesto de `voxelesUI`), [`docs/luz-y-sombra.md`](../docs/luz-y-sombra.md) (los 2 bakes).

---

## 🚦 REGLA CERO — no toques palancas, MIDE

⛔ Cambiar `renderDist` / `renderScale` / `shadowSize` / `renderMode` **no es diagnosticar**.
Son 4 apuestas sobre la misma hipótesis (*«es la GPU»*), y si la hipótesis falla no has aprendido
nada. **Primero se reparte el frame**, después se toca lo que el reparto acuse.

Orden obligatorio → [`fps-metodo.md`](fps-metodo.md).

---

## 🗺️ De síntoma a sospechoso

| síntoma | sospechoso | dónde mirar |
|---|---|---|
| iba bien y **cae de golpe a mitad de partida**, ya no se recupera | algo **acumula sin techo** (entidades que no mueren, capa que crece) | [`fps-metodo.md` §3](fps-metodo.md) atribución rAF |
| los fps **NO SUBEN** al mirar suelo/pared | coste **FIJO** por frame: fluidos que no se asientan, re-horneo de sombra, luz dinámica | `sonda_coste_fijo.js` → `sonda_fluidos.js` ([`fps-casos.md` PERF-AGUA1](fps-casos.md#agua)) |
| `renderMode='fast'` **no** mejora | **NO es GPU** ni iluminación | [`fps-metodo.md` §1](fps-metodo.md) |
| `renderMode='fast'` **sí** mejora | GPU / iluminación / fill-rate | [`README.md`](README.md) `renderMode` |
| `mcTick` bajo pero el frame enorme (**«RESTO»** se lo come) | código **fuera de `app.js`**: snippet, bucle rAF propio | [`fps-metodo.md` §2-3](fps-metodo.md) |
| cae al **colocar / romper** bloques | mallado, caché LRU de chunks, thrash | `game.cacheStats()`, `game.chunksActivos()` |
| cae con **partículas / nieve / efectos** | `voxelesUI` se remalla **entera cada frame** | [`fps-costes.md`](fps-costes.md) |
| cae al **estampar** mucho | 1 draw call por estructura | [`fps-costes.md`](fps-costes.md) |
| cae **solo con DevTools abierto** | es el propio DevTools | mide con **DevTools cerrado** (README) |
| baja **al recargar un snippet** y se acumula | bucle/costura **apilada** (no desenvuelta) | [`fps-costes.md`](fps-costes.md) §apilado |

---

## 🕳️ LOS 3 PUNTOS CIEGOS (por qué el profiler te puede mentir)

Esto es lo más caro de este documento. Los tres son **límites de diseño**, no fallos.

1. **`game.perfDump()` solo envuelve funciones de `app.js`.**
   Un bucle `rAF` que vive en un **snippet** es INVISIBLE. Aparece dentro de «RESTO», sin nombre.
   ⇒ Un snippet puede comerse el 97 % del reloj y el profiler enseñar `mcTick` a 1,9 ms.

2. **«RESTO» no tiene dueño, y se confunde con la GPU.**
   Frame 236 ms − `mcTick` 1,9 ms = 234 ms de nadie. La tentación es culpar al dibujado.
   ⇒ Se descarta GPU con **longtasks**: `type:'self'` = JS quemando CPU, no espera de GPU.

3. **`game.fps` de la esquina es un promedio de 500 ms.**
   Se traga justo el pico que buscas. El profiler mide el **frame de verdad** (rAF a rAF).

**El tapón**: [`guardian-bucles`](../data/snippets/guardian-bucles.json) — envuelve
`requestAnimationFrame` y acusa **por nombre de callback**. Cubre exactamente el hueco 1.
`game.guardianBucles.on()` / `.informe()` / `.off()`.

---

## 🧨 El patrón que hay que reconocer: **fuga + realimentación**

El caso `bucleFlechas` no fue «algo lento». Fue un **precipicio**, y por eso importa el patrón:

```
FUGA            una entidad deja de cumplir la condición que la mata      → vive para siempre
REALIMENTACIÓN  su coste crece con una magnitud que ella misma aumenta    → coste sin techo
```

En concreto: la flecha que sale del mundo **nunca choca** (`mcInside()` falso ⇒ ni se mira la
colisión), luego nunca se clava, luego nunca la retira nadie. Y además la gravedad la acelera sin
freno, mientras `subPasos = ceil(distancia / 0,20)` **crece con la velocidad**.
⇒ **7 flechas** bastaron para 3.109 subpasos/frame y 3,4 fps.

**Al escribir cualquier bucle de entidades, contesta las tres:**
1. ¿Qué la mata? ¿Y si **nunca** se cumple esa condición?
2. ¿Hay una **caducidad incondicional** (vida máxima que corre siempre, no solo en un estado)?
3. ¿Su coste por frame **crece** con algo que ella misma aumenta? → **pon techo**.

Detalle y números → [`fps-casos.md`](fps-casos.md).

---

## ✅ Qué dejó puesto el caso de 2026-09-03

| pieza | dónde | qué hace |
|---|---|---|
| `guardian-bucles` | `data/snippets/guardian-bucles.json` | avisa **1 vez por culpable** si un callback rAF pasa de 8 ms/llamada |
| topes de flecha | `data/snippets/flecha-arco.json` (vía `herramientas/parche_snp_flecha_fuga.py`) | vida incondicional + retirada fuera del mundo + techo de subpasos |
| gobernador de fluidos | `app.js` (bloque de fluidos, `tick()`) | cola >5 s sin vaciarse = agua en bucle ⇒ 1 paso/s; avisa 1 vez; `game.fluidos.gobernado()` ([PERF-AGUA1](fps-casos.md#agua)) |

⚠️ `guardian-bucles` **no está enganchado a `mundo-autoarranque`**: hay que lanzarlo a mano
(`await game.snippet('guardian-bucles')`). Engancharlo lo pondría en **todos** los mapas y exige
subir `VERSION` — decisión del dueño, no tomada.
