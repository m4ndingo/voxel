# 🔬 EL PROTOCOLO — encontrar quién se come el frame

Vuelve a [`CAIDA_DE_FPS.md`](CAIDA_DE_FPS.md).

**4 pasos, en este orden.** Cada uno **descarta medio mundo**. Saltarse el orden es lo que cuesta
la tarde. Todo se pega en la consola (F12) del navegador, con **DevTools cerrado al medir** si el
número importa (abierto puede costar la mitad de los fps).

---

## 📑 Índice

- [§0 · Línea base](#0)
- [§1 · ¿CPU o GPU?](#1)
- [§2 · Repartir el frame: `mcTick` vs **RESTO**](#2)
- [§3 · ⭐ Atribución rAF por nombre — el que caza](#3)
- [§4 · Repartir el coste del culpable](#4)
- [§5 · Confirmar: mátalo en vivo](#5)
- [Antipatrones](#anti)

---

<a id="0"></a>
## §0 · Línea base

```js
game.showFPS = true;
// y el reparto grueso del mundo
({ chunks: mc.chunks.size, estructuras: mc.structures.length, agentes: mc.agents.size,
   notas: mc.notes && mc.notes.size, escala: mc.scale })
```

Apunta el número **antes de tocar nada**. Sin línea base no hay A/B.

---

<a id="1"></a>
## §1 · ¿CPU o GPU? — un solo interruptor

```js
game.renderMode = 'fast';   // sin luces ni sombras
// … mide … luego
game.renderMode = 'normal';
```

| resultado | conclusión | sigue por |
|---|---|---|
| fps **suben** | GPU / iluminación / fill-rate | `shadowSize`, `renderScale`, reflejo, [`README.md`](README.md) |
| fps **NO suben** | **es CPU** | §2 |

⚠️ Cambiar de modo **re-malla todos los chunks** (el sombreado va horneado en las VBO): el propio
cambio cuesta un pellizco de una vez. No midas ese frame.

⛔ **Si `fast` no mejora, deja de tocar palancas de render.** `renderDist`, `renderScale`,
`shadowSize` y el reflejo son todas la misma hipótesis ya descartada.

---

<a id="2"></a>
## §2 · Repartir el frame — y nombrar a «RESTO»

La pregunta no es «¿cuánto tarda el frame?» sino **«cuánto del frame NO es el motor»**.

```js
// mide el frame de verdad (rAF a rAF) y cuánto de él se lleva mcTick
(() => {
  let n = 0, frame = 0, tick = 0, t0 = performance.now(), tPrev = t0;
  const oTick = window.mcTick;
  window.mcTick = function () { const a = performance.now(); try { return oTick.apply(this, arguments); }
                                finally { tick += performance.now() - a; } };
  const paso = () => {
    const t = performance.now(); frame += t - tPrev; tPrev = t;
    if (++n < 120) return requestAnimationFrame(paso);
    window.mcTick = oTick;
    const f = frame / n, k = tick / n;
    console.table([{ 'fps': (1000 / f).toFixed(1), 'frame ms': f.toFixed(1),
                     'mcTick ms': k.toFixed(1), 'RESTO ms': (f - k).toFixed(1),
                     'RESTO %': (100 * (f - k) / f).toFixed(1) + '%' }]);
  };
  requestAnimationFrame(() => { tPrev = performance.now(); paso(); });
})();
```

**Lectura:**

| reparto | significa |
|---|---|
| `mcTick` ≈ el frame | el motor. Usa `game.perfAssert` / `game.perfDump()` (README) |
| **RESTO** domina | **código fuera de `app.js`** → §3. `perfDump()` **no lo verá** |

### Descartar la GPU dentro de «RESTO»

«RESTO» puede ser JS quemando CPU **o** espera de GPU. Se distinguen con longtasks:

```js
new PerformanceObserver((l) => l.getEntries().forEach((e) =>
  console.log('longtask', e.duration.toFixed(0) + 'ms', e.attribution.map((a) => a.name).join(',')))
).observe({ entryTypes: ['longtask'] });
```

`type/name: 'self'` = **JS del hilo principal**. Muchos longtasks `self` ⇒ **no es la GPU**, y
todas las palancas de render son irrelevantes.

---

<a id="3"></a>
## §3 · ⭐ Atribución rAF por nombre — el que caza

**El paso que resolvió el caso en 5 segundos.** Todo lo que anima pasa por
`requestAnimationFrame`, y cada callback **tiene nombre**. Se mide por nombre y sale el culpable
solo, esté en `app.js` o en un snippet.

```js
(() => {
  const orig = window.requestAnimationFrame, acc = Object.create(null);
  window.requestAnimationFrame = function (cb) {
    if (typeof cb !== 'function') return orig.call(window, cb);
    return orig.call(window, function (t) {
      const a = performance.now();
      try { return cb.call(this, t); }
      finally { const d = performance.now() - a, k = cb.name || '(anónimo)';
                const e = acc[k] || (acc[k] = { n: 0, ms: 0, max: 0 });
                e.n++; e.ms += d; if (d > e.max) e.max = d; }
    });
  };
  const t0 = performance.now();
  setTimeout(() => {
    window.requestAnimationFrame = orig;
    const v = performance.now() - t0;
    console.table(Object.entries(acc).map(([k, e]) => ({
      callback: k, llamadas: e.n, 'ms/llamada': +(e.ms / e.n).toFixed(1),
      'pico ms': +e.max.toFixed(0), '% del reloj': (100 * e.ms / v).toFixed(1) + '%'
    })).sort((a, b) => parseFloat(b['% del reloj']) - parseFloat(a['% del reloj'])));
  }, 5000);
})();
```

Salida real del caso (mapa `default`, 3,4 fps):

```
callback        llamadas  ms/llamada  pico  % del reloj
bucleFlechas          89       250.8   255.5      97.7%     ← el culpable
mcTick                89         2.0     4.6       0.8%     ← el motor, inocente
```

**Ya está.** El nombre del callback es el nombre del fichero que hay que abrir.

> Esto es exactamente lo que automatiza [`guardian-bucles`](../data/snippets/guardian-bucles.json):
> `await game.snippet('guardian-bucles')` y avisa solo. Umbral 8 ms/llamada.

---

<a id="4"></a>
## §4 · Repartir el coste del culpable

Ya tienes el bucle. Ahora, **qué llama** dentro. Se envuelven las APIs sospechosas y se cuentan
**llamadas por frame**, no solo ms — el número de llamadas es el que explica *por qué*.

```js
(() => {
  const dianas = [[game.bloques, 'impactoEn'], [game.esqueletos, 'enPunto']];  // ajusta
  const acc = {}, orig = [];
  dianas.forEach(([o, m]) => {
    if (!o || typeof o[m] !== 'function') return;
    const f = o[m]; orig.push([o, m, f]); acc[m] = { n: 0, ms: 0 };
    o[m] = function () { const a = performance.now();
      try { return f.apply(this, arguments); }
      finally { acc[m].n++; acc[m].ms += performance.now() - a; } };
  });
  setTimeout(() => {
    orig.forEach(([o, m, f]) => { o[m] = f; });
    console.table(Object.entries(acc).map(([m, e]) => ({
      api: m, llamadas: e.n, 'ms total': +e.ms.toFixed(1), 'µs/llamada': +(1000 * e.ms / e.n).toFixed(0) })));
  }, 5000);
})();
```

Salida real (5 s, **7 flechas fugadas**):

| api | llamadas | ms total | µs/llamada |
|---|---|---|---|
| `game.bloques.impactoEn` | 3.109 | 212,1 | **68** |
| `game.esqueletos.enPunto` | 3.109 | 60,8 | 20 |

**3.109 sondeos con 7 entidades** = ~444 por entidad y frame. Ese absurdo **es** el diagnóstico:
no era una API lenta, era una **cantidad de llamadas sin techo**.

---

<a id="5"></a>
## §5 · Confirmar antes de tocar código

⛔ **Ley de oro** ([`docs/desarrollo-desacoplado.md`](../docs/desarrollo-desacoplado.md)): nada se
edita hasta demostrarlo **en caliente**. Mata al sospechoso en vivo y compara fps:

```js
// bloquea SOLO ese callback; se revierte recargando o restaurando _orig
const r = window.requestAnimationFrame;
window.requestAnimationFrame = (cb) => (cb && cb.name === 'bucleFlechas') ? 0 : r(cb);
```

Resultado del caso: **3,4 fps → 101,4 fps**. Con eso, y solo con eso, se toca el snippet.

Después: el arreglo nace en el **snippet** (`data/snippets/<id>.json`), se aplica con un
`herramientas/parche_snp_*.py` **por ancla e idempotente** (hay 2 copias vivas), y se re-publica
por `POST /api/snippets`. `app.js` es el último recurso.

---

<a id="anti"></a>
## 🚫 Antipatrones (medidos, no opinión)

| antipatrón | por qué falla |
|---|---|
| tocar `renderDist`/`renderScale`/`shadowSize`/`renderMode` de entrada | 4 apuestas a la **misma** hipótesis; si es CPU, ninguna mueve nada |
| fiarse de `game.fps` de la esquina | promedio de 500 ms: se traga el pico |
| medir con **DevTools abierto** | puede costar la mitad de los fps |
| quedarse en `game.perfDump()` | **solo ve `app.js`**; un snippet le es invisible |
| culpar a la GPU porque «RESTO» es grande | compruébalo con longtasks `self` |
| mirar **ms** y no **llamadas/frame** | 68 µs no es caro; 3.109 llamadas sí |
