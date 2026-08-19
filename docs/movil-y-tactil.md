# Móvil y mandos táctiles

El dueño juega en el móvil (≈390 px de ancho, ~380 px útiles de alto en horizontal). El Mundo y el
editor son **la misma página**, así que aquí no hay una «versión móvil»: hay una capa de mandos que
se enciende cuando toca, y un puñado de reglas de CSS.

Ficheros: `web/index.html` (`#mc-touch`), `web/style.css` (`.mc-touch`, `.mc-tbtn`, `.mc-tmenu-panel`),
`web/app.js` (bloque de `MC_TOUCH`, cerca del final; y `mcMandoActivo`, junto a `mcLockPointer`).

---

## La capa

Todo cuelga de **un solo `#mc-touch`** con **un solo `hidden`**, que pone y quita `mcTouchShow(on)`.
Encender y apagar los mandos es encender y apagar esa capa, y nada más — no hay un segundo sitio que
mantener en sincronía.

- `MC_TOUCH` = `matchMedia('(pointer:coarse)')` **o** `navigator.maxTouchPoints > 0`. Es lo que hay
  al cargar, no una preferencia.
- `game.touchControls` (persistido en `localStorage`) la fuerza en los dos sentidos: enseñar los
  mandos en un escritorio para probarlos, o quitarlos de un portátil táctil.
- El contenedor **no intercepta nada** (`pointer-events:none`): el resto del canvas tiene que seguir
  siendo la zona de mirar, y la hotbar (z-index 6) tiene que seguir pulsándose por debajo. Solo los
  hijos capturan el dedo.

## Los mandos

| mando | id | qué hace |
|---|---|---|
| joystick | `#mc-stick` | escribe `mc.keys` `w/a/s/d`. Zona muerta al 30 % del aro (sin ella, el peso del pulgar ya te hace andar) y sectores de 45°, o sea exactamente un teclado |
| saltar | `#mc-tjump` | `mc.keys[' ']` en `pointerdown` |
| ⛏ romper | `#mc-tizq` | botón **0** del ratón |
| ▣ poner | `#mc-tder` | botón **2** |
| ⚡ redstone | `#mc-tmed` | botón **1** |
| ☰ menú | `#mc-tmenu` | pantalla completa · foto · vídeo · **salir** |

**`MC_STICK_F` no es una constante de posición**: el recorrido del pomo se mide del ancho real del
aro, así que encoger `.mc-stick` en el CSS encoge también su recorrido sin tocar el JS.

### Los tres botones del ratón (REQ-MOV1)

⛔ **No saben qué es romper ni qué es poner.** Cada botón lleva su número de botón del ratón en
`data-btn` y entra por **`mcDoAction(btn, shift)`**, que es la misma puerta por la que pasa el clic
del escritorio: quién rompe y quién pone lo decide la **herramienta** que lleves puesta. Duplicar
aquí ese reparto es cómo se consigue que la hotbar se comporte distinto en el móvil.

El **central es la excepción**: quien lo atiende es **redstone**, que vive fuera de `app.js`
(`redstone/redstone-piezas.js`) y escucha `mousedown` en `window`. El botón táctil **manda ese mismo
evento** (`new MouseEvent('mousedown', {button:1})`) en vez de inventar un contrato nuevo.

Mantener pulsado pica en cadena, como el ratón (`mc.heldBtn` + `mc.actAt`, repetido en `mcTick`).
⚠️ Soltar el dedo **tiene** que pasar por `mcTouchSuelta`: un `pointerup` perdido no te deja andando,
te deja **picando solo** — y en el Mundo eso escribe en `mundo.json`.

> Hasta REQ-MOV1 `app.js` decía «a propósito NO hay botones de romper/poner: un toque de más sería
> una edición de verdad, con su autoguardado en mundo.json». El dueño lo revirtió (2026-08-19). El
> riesgo que decía aquel comentario **no era falso**: por eso los de acción van arriba, fuera de
> donde descansa el pulgar que anda, y por eso soltar corta la cadena.

## `mcMandoActivo()` — «¿manda el jugador?»

```js
function mcMandoActivo(){ return mc.active && (document.pointerLockElement===mc.canvas || (MC_TOUCH && mcTouchOn)); }
```

Antes esta pregunta estaba escrita como `document.pointerLockElement===mc.canvas`, **repetida** por
media docena de sitios: la repetición de mantener pulsado, el fantasma de lo que vas a colocar
(`mcDrawStructGhost`), la herramienta de la mano. En táctil no hay ratón que capturar y, sobre todo,
**entrar en pantalla completa suelta el pointer-lock** — o sea que cumplir media petición del dueño
apagaba la otra media.

⚠️ **No vale para el `mousedown` del canvas.** Ahí el pointer-lock sigue siendo obligatorio a
propósito: el primer clic solo captura el ratón, no rompe nada.

## Pantalla completa

`mcPantallaCompleta()` (también `game.pantallaCompleta()`), conmuta. Va sobre **`documentElement`**,
no sobre el canvas: hotbar, mira, mandos y modales son **hermanos** del canvas, y poniendo el canvas
a pantalla completa el resto se queda fuera. Entrar necesita gesto de confianza del usuario (salir
no), así que cuelga del menú y no se puede llamar sola al cargar.

## Trampas conocidas

- ⚠️ **`.menu` ya está cogida** por el desplegable «⋯» de la cabecera del editor
  (`min-width:220px; display:flex`). La clase del botón táctil es **`tmenu`**; con `menu` el ☰ salía
  de 220 px de ancho.
- ⚠️ **Todo `.mc-tbtn` necesita su `right`/`bottom` propios.** `.mc-tbtn` trae los del salto, así
  que un botón sin posición cae **exactamente encima** de `#mc-tjump`. Eso le pasó a `#mc-tvideo`, y
  es la razón de que en la captura de REQ-MOV1 «faltara» el botón de saltar: estaba debajo.
- ⚠️ **`⛶` (U+26F6) sale como caja** en el navegador de pruebas: no hay fuente que lo dibuje. Para
  «pantalla completa» se usa `⤢`. Antes de meter un símbolo raro, mídelo (`measureText` contra
  U+FFFF, que nunca tiene dibujo).
- El borde derecho se deja libre (`right: 76px` de serie): **en horizontal Android pone ahí su barra
  de navegación** y un botón pegado al borde queda debajo, intocable. `env(safe-area-inset-*)` para
  muescas y barras de gestos.
- **Apaisado** (`@media max-height:520px`): la pantalla es baja, los mandos se comían media vista.
  Todo encoge y se pega abajo, y el panel del menú también — si no, se sale por abajo.
- **OSD**: mientras hay una pantalla de menú puesta se esconde la capa entera… **menos el ☰**, que
  es de donde cuelga salir. Ver [`osd-e-intro.md`](osd-e-intro.md).

## Cómo se prueba sin móvil

Playwright con `{ viewport:{width:393,height:852}, hasTouch:true, isMobile:true }`, y dentro
`game.touchControls = true`. Los mandos se conducen con `PointerEvent` **sobre los botones**, no
llamando a las funciones de dentro — que es lo único que prueba que el botón está donde se puede
pulsar.

⚠️ **Playwright se niega a tocar nada en pantalla completa** («el canvas intercepta los eventos»)
aunque `document.elementFromPoint` conteste que encima está el botón. Es un artefacto suyo: para
probar lo que hay en pantalla completa, `dispatchEvent` y `elementFromPoint`. Para **entrar** en
pantalla completa hace falta `page.tap()`, que sí es un gesto de confianza.
