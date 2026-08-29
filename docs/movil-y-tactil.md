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
| ⚡ redstone | `#mc-tmed` | botón **1** (y con Seleccionar, **conmuta la cara** de extruir) |
| ☰ menú | `#mc-tmenu` | ver más abajo: pantalla completa · Editar › · Ver › · Capturar › · Código · **salir** |
| ⤓ bajar | `#mc-tbajar` | `mc.keys['shift']`. **Sale solo mientras vuelas** |
| ＋ / － | `#mc-textru-mas/-menos` | `mcSelExtruir(±1)`. **Salen solos con una caja marcada** |

### Los que salen solos (REQ-TACT1)

`mcExtruBtn()` corre **una vez por frame** desde el bucle y va **por flanco**, como `mcStuckShow`:
sin cambio de estado no toca el DOM. Pone y quita dos cosas:

- **`#mc-tbajar`** mientras `mc.volar`. Volando, subir es Espacio (= el ⤒) y bajar es **Shift, que en
  táctil no existe**: sin este botón se despega y no se aterriza. Baja la **tecla**, no `mc.vel`: la
  vertical del vuelo sale de `k[' '] − k['shift']` (REQ-FLY1) y la integra el bucle. Aterrizar con el
  dedo puesto pasa por `mcTouchSuelta`, o el Shift se queda clavado.
- **`#mc-textru-mas` / `#mc-textru-menos`** con `mc.tool==='select' && mc.selBox`. En escritorio
  extruir es `Ctrl+rueda`, y **en tablet no hay rueda**: era lo único del Mundo sin puerta táctil.
  Llaman a **`mcSelExtruir(±1)`**, la misma de la rueda y con su mismo signo, así que respetan
  `mc.selOpuesta` — que se conmuta con el ⚡ (`#mc-tmed`).
  ⚠️ La otra extrusión, la del **frente** (`Shift+rueda` → `mcSelExtruirFrente`), **sigue sin botón**.

### El menú ☰ — submenús, y el contrato de inyección

Con las teclas del Mundo metidas dentro, la lista plana no cabía en un móvil apaisado (~380 px), así
que hay **cuatro panels hermanos** con la misma clase `.mc-tmenu-panel`: el de primer nivel
(`#mc-tmenu-panel`) y `#mc-tmenu-editar` / `-ver` / `-captura`. Un botón con `data-sub` abre el suyo;
uno con clase `volver`, vuelve.

- ⚠️ **`mcTouchMenu` es la única puerta.** «Abierto» incluye estar dentro de un submenú, y cerrar
  cierra **todos**. Si cada botón se gestionara solo, cualquier salida por otro camino (salir del
  Mundo, el OSD) dejaría un submenú flotando sobre el mapa sin el ☰ debajo que lo cerrara.
- ⚠️ Son **hermanos y no hijos** por dos motivos: la clase `.mc-tmenu-panel` es la que los salva del
  recorte del OSD (`body.mc-osd-puesto.mc-osd-tactil .mc-touch > :not(.tmenu):not(.mc-tmenu-panel)`),
  y el primer nivel tiene que seguir siendo una lista de **hijos directos**.
- 🔒 **CONTRATO: `#mc-tsalir` es el último hijo directo de `#mc-tmenu-panel`.** Quien quiera añadir su
  propia entrada la mete **antes** del ✕. Así lo hace el **multijugador** (`💬 Hablar`), del que
  `app.js` no sabe nada ni tiene por qué: orden del dueño (2026-08-29) — el motor pone lo suyo en
  `index.html`, y quien llega después se inyecta al cargarse. Meter el ✕ dentro de un submenú rompe
  esto sin que nada falle a gritos. Guardián: `tests/probe_menu_tactil.js` §1.
- Cada opción llama a **la misma función que su tecla** (`mcUndo`, `mcCopySelection`, `mcRotateSelBox`,
  `mcSetVolar`, `openSnips`…), no a una versión propia: el reparto vive en el handler de teclas y aquí
  solo se le abre una segunda puerta.
- **`#mc-therr` (herramienta, tecla `e`) es la única que NO cierra el menú**: es cíclica y cerrarlo
  obligaría a reabrirlo para dar el segundo paso. Su texto lo reescribe `mcTouchHerrTxt()`.
- Fuera a propósito (el dueño los descartó): **`K` recortes** y **`B`/`Shift+B` tamaño del jugador**.

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

## Un toque **no** es un clic izquierdo (REQ-TACT1)

Dueño (2026-08-29): «*en el móvil hacer clic en pantalla no debería realizar clic izquierdo ya que
quieres moverte o coger el foco y se activa la función de la herramienta y no debería, para eso está
el botón en pantalla*».

Tras un toque el navegador emite además eventos de ratón **de compatibilidad** (`mousedown`, `click`)
que son **indistinguibles de un ratón de verdad**: no traen `pointerType`. El camino del fallo era:

1. el `click` de compatibilidad del primer toque entraba en `mcLockPointer()`;
2. Android **concede** el pointer-lock en pantalla completa;
3. a partir de ahí cada toque para girar la cámara pasaba el `pointerLockElement===mc.canvas` del
   `mousedown` y **picaba o ponía un bloque**.

Se resuelve con una marca de tiempo, `mcDedoAhora()` / **`mcRatonDeDedo()`** (ventana de 700 ms,
refrescada en el `pointerdown`/`pointermove` del canvas y en el `pointerup` de `window`). La consultan
el `click` (no pide lock) y el `mousedown` (no dispara la herramienta).

⚠️ **Por tiempo, y no apagando el ratón cuando `MC_TOUCH`**: un portátil con pantalla táctil tiene las
dos cosas a la vez, y ahí el ratón de verdad tiene que seguir picando. Guardián:
`tests/probe_menu_tactil.js` §7, que además comprueba **las dos mitades** — el dedo no pide lock, el
ratón sí.

⚠️ El **escaparate** sí se pulsa con el dedo (`mcEscaparatePulsa`, notas de la intro) y va **antes**
de la guarda, en su propia rama del `click`.

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
