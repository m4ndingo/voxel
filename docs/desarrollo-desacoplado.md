# Desarrollo desacoplado — hot-swapping e interceptores dinámicos

Modelo de desarrollo del repo desde el **2026-08-21**, por orden del dueño. Sustituye al de «editar
`app.js` y probar»: `app.js` es la base **legacy estable** y no se toca hasta que lo nuevo ya está
validado corriendo a su lado.

## LEY DE ORO

> **No se modifica `app.js` hasta que la nueva feature, corrección o bug —lo que sea que tenga que
> modificar `app.js`— esté validada previamente con este método.**

No es una recomendación de estilo: es la condición para tocar el fichero. Si no hay una pasada previa
con el parche en caliente, el cambio en `app.js` no entra.

### Por qué

Lo dijo el caso que lo originó, REQ-LUZ2 (`f0d465a`, revertido en `184b7d9` a las tres horas). Palabras
del dueño: **«no funcionó correctamente y metió muchos cambios en `app.js`»**. Las dos mitades del
problema, y las dos las cura este modelo:

- **No funcionó correctamente** → sin un A/B instantáneo no se sabe si lo nuevo mejora; con el motor
  original a un `off()` de distancia, sí.
- **Metió muchos cambios en app.js** → 994 líneas repartidas por un fichero de 14 900 no se revierten
  por partes. Revertir costó tirar también REQ-LUZ1, REQ-REN1, REQ-CULL1, BUG-SHADOW4, REQ-CIUDAD1,
  las sondas de `performance/`, `docs/rendimiento.md` y los materiales urbanos, que no tenían nada que
  ver y estaban bien.

---

## 1 · Patrón de diseño — Strangler Fig (Higo Estrangulador)

- **Concepto**: la base antigua (*legacy*) se mantiene **intacta y operativa**. La funcionalidad nueva
  se desarrolla de forma **aislada e independiente** en un módulo paralelo.
- **Comportamiento**: la nueva implementación va **interceptando o sustituyendo progresivamente**
  partes del código original **en tiempo de ejecución**, y **sólo cuando ha demostrado estabilidad**,
  hasta que el código viejo se retira por completo **sin haber interrumpido el servicio**.

En este repo el módulo paralelo es un **snippet del Mundo**: `data/snippets/<id>.json`, que el dueño
abre en el editor de código y **ejecuta a mano** con el motor ya cargado. Sin autoarranque mientras se
prueba: la sesión está viva y el parche entra en caliente.

### El formato, que no se negocia

Un snippet es un JSON con **exactamente cuatro campos** —los 49 que hay en `data/snippets/` los llevan
todos— y **el JavaScript va dentro de `code`**, como cadena. ⛔ Un `.js` suelto en `data/snippets/` no
es un snippet: el gestor no lo ve.

```json
{
  "id": "luz-quietas",
  "name": "💡 Luz quietas · REQ-LUZ2 sin tocar app.js",
  "code": "// ── 💡 luz-quietas ──\n(() => {\n  'use strict';\n  …\n})();\n",
  "savedAt": "2026-08-21T13:28:19"
}
```

`id` = nombre del fichero sin extensión · `name` = lo que se lee en el gestor · `savedAt` =
`%Y-%m-%dT%H:%M:%S`. Serializado con 2 espacios de indentación y UTF-8 crudo (`ensure_ascii=False`):
los emoji se guardan tal cual, no como `\uXXXX`.

⚠️ **Escribir el `.json` a mano se hace sólo mientras se prueba.** Cuando el módulo se queda, se publica
por **`POST /api/snippets`**, que respalda la versión anterior en la papelera y escribe de forma
atómica; a mano se pierden las dos cosas. El patrón para mantener el JS en un `.js` legible y
empaquetarlo al JSON está resuelto en `redstone/make_snippets.js`.

## 2 · Técnica de inyección — Monkey Patching / Hot Patching

- **Concepto**: interceptar y sobreescribir **referencias a funciones, métodos o prototipos en memoria**
  mientras la aplicación **ya está ejecutándose**.
- **Mecanismo**: el código base expone puntos de anclaje (*hooks*) o permite **reasignar funciones
  globales / objetos del motor** en tiempo de ejecución.

```js
// Guarda el método original estable
const originalSeed = WorldGen.seedCell;

// Intercepta en caliente con la lógica experimental
WorldGen.seedCell = function(x, y, z) {
  if (experimentalModeActive) {
    return newCanonicalSeed(x, y, z);
  }
  return originalSeed(x, y, z);   // Fallback seguro
};
```

### Por qué funciona en VoxelForge

`web/app.js` se carga como **script clásico** (`<script src="/app.js">`, sin `type="module"` y **sin
IIFE**), así que cada `function mcX(){}` de primer nivel es una **propiedad de `window`**, y las
llamadas desde dentro de `app.js` la resuelven por la cadena de ámbitos hasta el objeto global.
Reasignar `window.mcX` **intercepta también las llamadas internas del motor**.

Los snippets corren con `AsyncFunction` en ámbito global ⇒ además **ven los internos** que no son
propiedades de `window` (`const mc`, `let MC_LUZ_SUB`, `MC_DYN_SEMILLAS`…).

Precedentes que ya vivían en el motor antes de escribirse esta ley: `mcUpdate._orig` (la costura del
parkour), `mcFineBoxHit._orig` (partículas y agentes).

### Reglas de la envoltura

1. **Guardar el original en la propia función envuelta** (`nueva._orig`, o un sufijo propio del módulo
   como `._lqOrig`), nunca en una closure suelta: si no, no hay desinstalación posible.
2. **Re-ejecutable**: al lanzar el fichero otra vez, **desinstalar antes de instalar**. Apilar
   envolturas duplica el efecto y es un fallo que no avisa (pasó con `mcUpdate` en parkour).
3. **Estado en `mc`** (`mc._loQueSea`), ⛔ nunca en closure: al re-ejecutar se pierde.
4. **Desinstalar de verdad**: `off()` tiene que devolver el motor **byte a byte**, incluidas las
   invalidaciones de caché que hagan falta (firmas, texturas, re-mallado). Un `off()` que deja restos
   convierte el A/B en ruido.
5. Si una costura **puede no existir** en el `app.js` de turno (una función de un ticket sin commitear),
   envolverla como **opcional** y decirlo en el informe, en vez de reventar al instalar.

## 3 · Estrategia de control — Feature Flags / Canary Routing

- **Concepto**: la alternancia entre lo viejo y lo nuevo se controla mediante **banderas booleanas o
  filtros contextuales**.
- **Seguridad**: permite habilitar el parche experimental para **una zona específica del mapa o un tipo
  de objeto de prueba**, y **revertir instantáneamente** al comportamiento original si se detecta un
  error en tiempo de ejecución (*circuit breaker*), **sin reiniciar la sesión ni recompilar**.

En la práctica, todo módulo nuevo expone un mando en `game`:

```
game.<modulo>.on()       instalar
game.<modulo>.off()      motor original, byte a byte   ← el A/B honesto
game.<modulo>.estado()   el informe: qué hace, cuánto cuesta, qué se ahorró
game.<modulo>.<tunable>  los parámetros, en vivo
```

Encaja con lo que el dueño ya venía pidiendo: **toda feature cara debe ser conmutable** para poder
medirla o apagarla.

---

## 4 · Cuándo se gradúa a `app.js`

Cuando el parche en caliente ha demostrado estabilidad, se lleva a `app.js` **lo mínimo**, y entonces:

- el snippet se queda como **guardián del A/B** (o se retira, si el `off()` ya no tiene sentido);
- el ticket se cierra con la **medida de las dos ramas**, no con una descripción;
- **un commit por ticket**, sin arrastrar trabajo ajeno al ticket — el motivo por el que revertir
  REQ-LUZ2 se llevó por delante otras seis cosas.

Lo que **no** se puede validar así (y hay que decirlo antes de tocar `app.js`, no después): cambios en
shaders GLSL compilados al arrancar, en la estructura de datos de un array que el motor ya reservó, o
en funciones que otros tests extraen **verbatim por texto** (`mcFineBoxHit`, `mcAimBoxHit`,
`mcTerrenoChoca` ← `test_rayo_apuntado.js`).

---

## Ejemplo vivo — `data/snippets/luz-quietas.json`

REQ-LUZ2 rehecho con este modelo, sin una línea de `app.js`. Cuatro envolturas
(`mcVoxUILuces`, `mcComputeBlockLight`, `mcLuzSubAjusta`, `mcDynSync`), mando `game.luzQuietas` con
`on`/`off`/`tras`/`estado()`, y la cabecera del fichero explica la medida que lo motivó, el artículo de
la [Ley de la Luz](../wiki/paginas/ley-de-la-luz.md) que se infringía y los tres riesgos que introduce.
Léelo como plantilla.

---

## Movido verbatim desde CLAUDE.md el 2026-08-30

(Minimización de `CLAUDE.md` pedida por el dueño; arriba queda la ley y el enlace.)

⛔ **`app.js` NO se modifica hasta que el cambio esté validado antes por parcheo en caliente.** Nace
**aislado** en un snippet `data/snippets/<id>.json` (JS **dentro** de `code`, ⛔ jamás un `.js` suelto)
que envuelve funciones del motor en memoria guardando el original (`fn._orig`; `app.js` es script clásico
sin IIFE ⇒ `window.mcX` es reasignable e intercepta sus llamadas internas), y se manda con
**`game.<modulo>.on()/off()`** — `off()` devuelve el motor **byte a byte**: ése es el A/B y el circuit
breaker. Solo tras demostrar estabilidad se gradúa, y **lo mínimo**. Plantilla: `luz-quietas.json`.
