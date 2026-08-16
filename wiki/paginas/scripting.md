# Snippets: qué son y cómo corren

Un **snippet** es un trozo de JavaScript guardado en el servidor que VoxelForge ejecuta dentro de la
página. Es el punto de extensión del proyecto: casi todo lo que hace de VoxelForge un juego y no un
editor —los comportamientos de los bloques, los agentes, la redstone, los menús, la intro— vive en
snippets, no en `app.js`.

La regla de arquitectura detrás de esto es corta: **`app.js` es el motor y no sabe qué hay en tu
mundo.** Sabe estampar una pieza, mallar un chunk y mover un cuerpo; no sabe que ese cubo amarillo es
una lámpara ni que ese bicho persigue al jugador. Eso lo dice un snippet.

## Dónde vive

Cada snippet es un documento en `data/snippets/<id>.json` con tres cosas: su `id`, su `name` (el
bonito, el que se lee en la lista) y su `code`. Se editan **en vivo** desde el panel **Código** del
Mundo, sin recargar nada y sin tocar el repositorio.

> ⚠️ El `id` es lo que usan `game.snippet('...')` y los autoarranques. El `name` es decoración.

## Cómo corre

El código se compila con `new AsyncFunction(code)` y se llama. De ahí salen las dos propiedades que
más se notan al escribir uno:

**1 · Es `async` de nacimiento.** Puedes usar `await` en el nivel superior sin envolver nada:

```js
await game.snippet('arranque-intro');
game.osd.cerrar();
```

**2 · Corre en el ámbito GLOBAL.** No hay `import` ni módulos: un snippet ve `game`, ve `mc` y ve
también las funciones internas de `app.js` —`mcMapName()`, `mcInside()`, `mcIdx()`, `mcUnstick()`—
directamente, por su nombre.

Eso es lo que convierte un snippet en un punto de extensión de verdad en vez de en una caja cerrada.
También es lo que obliga a tener cuidado: lo que dejes en `window` se queda ahí para todos.

## Las dos superficies: `game` y `mc`

| | qué es | cuándo se usa |
|---|---|---|
| `game` | La **API pública**. Nombres estables, validación, avisos por consola cuando te equivocas. | Casi siempre. |
| `mc` | El **estado de dentro** del motor: `mc.dim`, `mc.grid`, `mc.pos`, `mc.yaw`… | Cuando `game` no llega: leer el terreno, animar una cámara frame a frame. |

Casi todo lo de `game` tiene su equivalente en `mc`, y donde hay pareja **las unidades cambian**: la
mirada es `game.yaw` en grados (para configurar) y `mc.yaw` en radianes (para animar). Confundirlas es
el error clásico.

## El estado va en `mc`, nunca en un closure

Un snippet se reejecuta constantemente: lo estás editando, lo llama otro, lo relanza un botón. Si tu
bucle de animación o tu envoltorio viven en una variable local, **la segunda ejecución pierde el
mando sobre la primera**, que sigue corriendo sin que nadie pueda pararla. Dos bucles peleando por la
misma cámara se ven como un temblor que no se sabe de dónde sale.

Por eso el convenio es guardar lo vivo colgado de `mc` y **desmontar lo anterior antes de montar lo
nuevo**:

```js
if (mc._intro && mc._intro.parar) mc._intro.parar();   // ← primero desmontar

const intro = mc._intro = {
  raf: 0, viva: true,
  parar(){
    if(!this.viva) return;
    this.viva = false;
    cancelAnimationFrame(this.raf);
    if (mc._intro === this) mc._intro = null;          // no le pises el sitio a otra
  }
};
```

Es la misma regla que sigue el autoarranque global cuando envuelve `mcUpdate`, y la que sigue
`game.onKey`, que **reemplaza** en vez de apilar.

## Reutilización y argumentos: `game.snippet`

Puedes invocar otros snippets mediante `await game.snippet('id', ...args)`. Esto permite crear snippets modulares, librerías compartidas o componentes parametrizables (como menús OSD o generadores):

```js
// Invocar un snippet pasándole opciones:
await game.snippet('mi-menu-osd', { titulo: 'Inventario', color: '#2a2a36', vidas: 3 });

// O invocar como librería que devuelve funciones/objetos:
const utils = await game.snippet('mis-utiles');
```

### Cómo recibe los argumentos el snippet llamado:

El snippet invitado recibe automáticamente el primer argumento en la variable **`opts`** y la lista completa en **`args`** (o `arguments`):

```js
// Dentro de 'mi-menu-osd':
const { titulo = 'Menú', color = '#111', vidas = 1 } = opts || {};

game.osd.define('menu_principal', {
  sitio: 'abajo-derecha',
  html: `<div class="mc-osd-panel" style="background:${color}">
          <div class="mc-osd-title">${titulo} (Vidas: ${vidas})</div>
          <button class="mc-osd-btn">CERRAR</button>
        </div>`
});
game.osd.abrir('menu_principal');
```

> 💡 **Nota de compatibilidad:** Si el snippet se ejecuta sin argumentos (por ejemplo desde el botón ▶ del panel o en autoarranque), `opts` vale `undefined`, por lo que el patrón `const { ... } = opts || {};` funciona siempre de forma segura sin lanzar errores.

## Lo mínimo para escribir el primero

```js
toast('Hola desde ' + mcMapName());
```

Abre el Mundo, pestaña **Código**, pega eso, ▶. A partir de ahí, la
[referencia de API](#/api) tiene cada pieza con sus parámetros, y
[Autoarranque](#/autoarranque) explica cómo hacer que tu snippet corra solo.
