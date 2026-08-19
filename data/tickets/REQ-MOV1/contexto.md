# REQ-MOV1 · Mandos táctiles: el Mundo en el móvil es inmanejable

**2026-08-19 · palabras del dueño (verbatim):**

> en el móvil el juego es prácticamente inmanejable, sobran los botones de video y tomar foto,
> faltarían controles/botones como tiene el ratón o un mando de videoconsola para saltar, botón
> izquierdo, derecho y central. también poder ponerlo a pantalla completa. el botón de cerrar
> debería de ser un menú para poder parte de cerrar poder poner pantalla completa

**Captura**: [`movil-actual.png`](movil-actual.png) — su móvil en vertical, `135.181.61.243:8500`.

Lo que se ve en ella, que es de lo que se queja:

- Joystick abajo a la izquierda. Bien, ése no se toca.
- Abajo a la derecha, **📷 y 🎬** — los dos únicos botones de acción que hay. Sobran.
- El **⤒ de saltar existe en el HTML** pero en la captura **no se ve**: queda tapado por el aviso
  del navegador («para mostrar el cursor, cambia de app»). No es que falte, es que ahí no se pulsa.
- Arriba a la derecha el **✕** de salir, que es el que quiere convertir en menú.
- La barra del navegador arriba y la de gestos de Android abajo se comen la pantalla ⇒ pantalla
  completa.

## Lo que revierte

`app.js` llevaba escrito, a propósito:

> «A propósito NO hay botones de romper/poner: un toque de más sería una edición de verdad, con su
> autoguardado en `mundo.json`. Mirar y andar no escriben nada, y lo que faltaba era andar.»

El dueño lo revierte pidiendo explícitamente los tres botones del ratón. Queda anotado aquí porque
la decisión de entonces no era un olvido: en móvil, romper/poner **sí** escribe en `mundo.json`.

## El botón central NO es una pregunta abierta

En el Mundo el central ya tiene dueño: **redstone** (conmuta palancas, botones, placas). Vive en
`redstone/redstone-piezas.js`, que lo caza en `window` en fase de captura. El botón táctil no
inventa nada: manda ese mismo `mousedown` con `button:1`.

## El pointer-lock es el problema de fondo

Media docena de sitios de `app.js` preguntan `document.pointerLockElement===mc.canvas` para decidir
si el jugador manda: la repetición de mantener pulsado, el fantasma de colocar, la herramienta en la
mano. En el móvil de la captura el navegador **sí** da el pointer-lock (de ahí el aviso), pero
**entrar en pantalla completa lo suelta** — o sea, justo lo que pide el dueño apagaría los botones
que también pide. De ahí `mcMandoActivo()`.
