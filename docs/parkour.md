# Parkour: agarrarse al canto y trepar

<!-- Detalle de VoxelForge. NO se carga en cada turno: lo carga el agente a demanda
     desde el índice de ../CLAUDE.md. Contenido movido VERBATIM, sin reescribir. -->

### 🧗 Parkour: agarrarse al canto y trepar (v1.27, agarre sin tirón en v1.28)

Lo único de la librería que es **del jugador** y no de un material. Hasta v1.26 un bloque a **3 de
altura** era inalcanzable: el salto de Minecraft sube `h = v²/2g = (8√s)²/44 = 1,4545·s` y el
auto-escalón llega a `MC_STEP=0.6`. Ahora, si el salto se queda corto y **el espacio sigue pulsado**,
el jugador se queda **colgado del canto** (el apoyo de brazos que no se ven es el congelado) y desde
ahí **`W` lo sube en una curva suave** hasta dejarlo de pie encima. Colgado, **`A`/`D` desplazan por
el borde**. Encendido por defecto y sobre **cualquier canto sólido** — terreno y estructuras.

`libre → colgado → subiendo → libre`, con veda de `0,25 s` al coronar. El estado vive en
`mc._parkour` (**nunca en un closure**, igual que `mc._pasoDesfase`: reejecutar el snippet a media
escalada no puede dejar al jugador congelado en el aire) y todo va **dentro del `envuelto` que ya
existe**, no en un segundo envoltorio.

```js
game.parkour.activo      // on/off (por defecto ON)
game.parkour.alturaMin   // 1.5 · altura mínima del canto sobre los pies, en unidades de jugador
game.parkour.alturaMax   // 2.2 · hasta dónde llega el brazo (el jugador mide 1,8)
game.parkour.caida       // 0   · velocidad de caída mínima para permitir el agarre
game.parkour.velLateral  // 1.6 · shimmy con A/D, u/s a escala 1
game.parkour.duracion    // 0.45 s de subida
game.parkour.alcance     // 0.45 · cuánto se asoma el sondeo más allá del cuerpo
game.parkour.calado      // 1.2 · v1.28 · cuánto cuerpo queda SIEMPRE por debajo del canto
game.parkour.acomodo     // 0.06 s · v1.28 · constante de tiempo del acercamiento al canto (0 = seco)
game.parkour.estado()    // ← el diagnóstico: en qué estado está y POR QUÉ no engancha
```

`estado()` **vuelve a sondear desde donde estás saltándose las condiciones de entrada**, para poder
plantarse delante de un saliente rebelde y preguntar: `'el canto ya no está ahí'` / `'hay pared
encima del canto'` / `'sin apoyo bajo la huella'` / `'no cabe de pie arriba'` / `'la pose de colgado
no cabe'` / `'de pie en el suelo'` / `'enfriando'`. Sin eso la única forma de depurar un canto que no
engancha es a ciegas, y el dueño juega en el móvil. Tunables al estilo `window.room` (objeto plano
con accesores enumerables — **no un Proxy**, BUG-RM1), persistidos en `localStorage` (`vf_pk_*`) y
con avisos por **`toast()`**.

**Tres consecuencias del orden de `mcUpdate` que dictan el diseño** — leídas, no supuestas:

- **(A) `mcUnstick` corre al PRINCIPIO de `mcUpdate`** (`app.js:5841`, llamado en `app.js:5898`):
  busca hacia arriba en pasos de 1/16 la primera `y` libre y pone `onGround=true`. Una pose de
  colgado que solape la pared **aunque sea 1e-9** se convierte al frame siguiente en un trepado
  instantáneo falso. Por eso la pose se **valida con `mcCollides`** y se **retrae por la normal**
  hasta `PK_RETRAE = 8` pasos de 1/16; si nunca cabe, **se rechaza el agarre**.
  ⚠️ Desde BUG-AG7 esa llamada va detrás de **`game.autoUnstick`, que viene APAGADO**, así que hoy no
  corre casi nunca. **La validación se queda igual**: es la que hace que la pose sea correcta y no
  solo que no la castiguen, y el interruptor se puede encender en cualquier momento.
- **(B) Colgado y subiendo, `orig(dt)` NO se llama.** El plan decía «correr la física y restaurar la
  posición»; no vale, precisamente por (A) — `mcUnstick` va antes de que podamos restaurar nada.
  Saltarse `orig(dt)` entero es estrictamente más fuerte. El mundo no se congela porque el envoltorio
  sigue llamando a `seguirObjetivos` / `mirarObjetivos` / `esqueletosPaso`.
- **(C) El envoltorio recibe el `dt` CRUDO**: el tope de 0,05 está **dentro** de `mcUpdate`
  (`app.js:5894`), y el parkour se salta `mcUpdate`. Sin un tope propio (`dtp`), una pestaña en
  segundo plano corona el canto de un tirón. Tiene su prueba.

**El sondeo, por qué así:**

- **Dirección encajada al eje** (la de mayor componente de `mc.yaw`): así está hecho el mundo y evita
  agarres en diagonal contra una esquina.
- **La cara de la pared no se adivina**: se barre de **cerca a lejos** en pasos de 1/16, y el borde
  interior de la primera columna sólida **es** la cara.
- **Suelo de altura `max(alturaMin·esc, MC_STEP·esc + inc)`**, con el mismo `inc` del auto-escalón
  (`app.js:5754`). Sin ese margen el parkour y el escalón automático se pelearían por el mismo
  bloque y un bordillo daría un agarre en vez de una zancada; y `alturaMin = 1.5` va justo por encima
  de `1,4545·s`, así que **un bloque de 1 se sigue subiendo de un salto**.
- **Apoyo bajo las CUATRO esquinas** de la huella: un labio de 1/16 pasa el test del canto y te
  dejaría de pie sobre el aire.
- **Ayuda de puntería**: si en la vertical exacta del jugador la huella no apoya, se prueban 1/16 a
  cada lado hasta medio cuerpo — lo mismo que haría el shimmy, sin obligar al dueño a pelearse con
  `A`/`D`.
- **Se miran los dos sitios donde vive el mundo** (`mcSolid` + `mcFineSolidAt`): la rejilla sola es
  medio mundo.

**La subida es una L** (Bézier cuadrática con `smoothstep`, `P1.xz = P0.xz`): a mitad de camino se ha
subido el 75 % y avanzado el 25 %. Es la curva que pidió el dueño («sube y avanza en una curva
suave») y de paso impide atravesar una pared de 1 de grosor y aparecer **dentro de una habitación
sellada**.

**v1.28 · te cuelgas A LA ALTURA A LA QUE ESTÁS, no en una pose fija.** Hasta v1.27 `pkPose` clavaba
`y = canto − 1.8·esc`; como el agarre se permite desde `alturaMin = 1.5`, engancharse cerca del punto
alto del salto **te bajaba hasta 0,3 de golpe en un frame**, un tirón muy visible. Ahora la altura de
colgado es `min(p[1], canto − calado·esc)`: tu propia `y`, con el único tope de que quede `calado`
(1,2) de cuerpo por debajo del canto — si no, con un `alturaMin` bajo te «colgarías de las rodillas».
Por abajo no hace falta tope porque el sondeo ya acota a `alturaMax`. Si esa altura no cabe
(la retracción de (A) la rechaza) **se reintenta la pose canónica** antes de descartar el canto, así
que no se pierde ningún agarre que funcionara antes. El shimmy y el arranque de `W` usan **esa misma
`pk.y`**, no la canónica: desplazarse por el canto no sube ni baja.

Y el resto del encaje (el ajuste en **XZ** contra la pared, que sigue siendo instantáneo por
definición) se suaviza con un **desfase que decae exponencialmente**: al agarrarte se guarda
`des = posición_real − pose` y cada frame se multiplica por `exp(−dt/acomodo)`, el mismo patrón
frame-rate-independiente de `pasoSuave`. Con `acomodo = 0` el agarre vuelve a ser seco. Ojo al leer
el código: en el caso normal `pk.y === p[1]`, así que **`des[1]` es 0** y el acomodo solo trabaja en
XZ; la prueba de «60 frames sin deriva» sigue pasando porque el desfase muere por debajo de
`1/(16·MC_T)` en unos pocos frames.

**Se suelta el agarre en cuanto alguien de fuera mueve al jugador**: se compara `mc.pos` con la
posición que escribimos (`pk.esp`, ±1e-6, el mismo truco de `restaurarPaso`), lo que cubre `game.tp`,
respawn, `mcUnstick`, `alPisar`, salir del Mundo y el cambio de `mc.scale`. Y **coordenada no finita
⇒ abortar**: un `NaN` hace que `Math.floor(NaN)` se salte los bucles de `mcCollides` («no hay
colisión en ninguna parte») y la caída sería infinita.

**El signo de `A`/`D` se FIJA al agarrarse** y solo se reevalúa si `|dot(right, tangente)| > 0.5`:
reevaluarlo por frame da bandazos justo cuando miras a lo largo de la pared, porque ahí el producto
escalar cruza el cero. El desplazamiento avanza en **sub-pasos de 1/16 revalidando el test de agarre
entero**, así que se para solo en el final del canto, en una esquina o en un hueco.

**Límites, a propósito:** (1) solo **cantos encajados al eje**, nada de diagonales ni superficies
inclinadas; (2) **sin animación visible de brazos** — es primera persona, el «apoyo» es el congelado
más la curva; (3) **el shimmy no dobla esquinas**, se para donde acaba el canto; (4) **nada de esto
entra en `mundo.json`**: es comportamiento del snippet, no geometría.

Test: `node test_parkour_navegador.js` (Chromium + SwiftShader, 18 ok) — monta su propio patio con un
muro de 3, y cubre que sin parkour el salto no llega, que el espacio deja colgado sin deriva 60
frames, que soltarlo cae, que `W` acaba de pie encima, que la trayectoria es una L, la veda, el
shimmy y su parada, que un escalón de 1 **no** dispara parkour, que un vano de 1 de alto se rechaza,
que un `dt` gigante no corona de un tirón, y que el mundo del dueño queda como estaba. Desde v1.28 el
agarre **no se comprueba contra una `y` fija** (sería clavar el bug): se exige que caiga en la banda
`[canto − alturaMax, canto − calado]` y que **el salto en `y` del frame del agarre no sea mayor que
la caída que ya llevabas**. ⚠️ La altura
hay que leerla **antes** de `suavizarPaso` (`yFisica()` en el test): `mc.pos[1]` lleva el desfase del
ojo y medir ahí da `31.996` donde el canto está en `32`.
