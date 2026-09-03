# Vuelo, pantallas OSD y la intro por URL

<!-- Detalle de VoxelForge. NO se carga en cada turno: lo carga el agente a demanda
     desde el índice de ../CLAUDE.md. -->

Lo que cubre este documento es una sola cadena de cinco tickets (REQ-FLY1, REQ-OSD2, REQ-OSD3,
REQ-OSD4, REQ-INTRO1), pedida por el dueño así:

> quiero hacer algo nuevo que modifique la experiencia de entrar al mundo y es que parezca ya el
> producto terminado. en el producto terminado espero que al arrancar aparezca una camara volando por
> un terreno ya renderizado […] el goal es que se pueda pasar la url a un usuario donde poder empezar
> a ver el producto con el menu/osd y modo vuelo

El enunciado literal y las cuatro decisiones que lo cerraron están en
[`data/tickets/REQ-INTRO1/contexto.md`](../data/tickets/REQ-INTRO1/contexto.md).

---

## 🛫 Modo vuelo (`F`) — REQ-FLY1

**`F` = volar. La foto pasó a `Alt+F`** (y `#mc-tfoto` sigue siendo la foto: desde REQ-MOV1 es una
línea del menú ☰ de los mandos táctiles, no un botón del pad — [`movil-y-tactil.md`](movil-y-tactil.md)).

Es «como estar dentro de un fluido pero sin caída»: la dirección sale de la vista (mirar hacia abajo y
avanzar te hunde), pero la vertical no la toca la gravedad.

```js
game.volar()          // conmuta            game.volar          // lee (true/false)
game.volar(true)      // enciende           game.volarVel = 6   // celdas/s, escala con mc.scale
game.fantasma(true)   // atraviesa el terreno — SOLO surte efecto volando
```

Reglas que cuestan caro romper:

- **El estado vive en `mc`** (`mc.volar`, `mc.volarVel`, `mc.fantasma`), no en un closure: el snippet
  del Mundo se reejecuta en vivo y no puede dejar al jugador congelado a media altura.
- La rama de vuelo va **dentro de `mcUpdate`, antes de la de fluido**, y **no pasa por `mcCaidaPaso`**:
  volando la vertical es `(Espacio?1:0) − (Shift?1:0)` por `volarVel·√scale`, y **cero exacto** si no se
  pulsa nada. Cero, no «casi cero»: `test_vuelo.js` compara la `y` byte a byte durante 60 frames.
- **Las colisiones se mantienen**: volar no atraviesa paredes. Para eso está `game.fantasma`, y solo
  funciona volando — un noclip a pie por accidente sería otra cosa.
- Mientras se vuela `mc.onGround` es `false`, para que no se disparen parkour ni deslizamiento.
- `Alt+F` se detecta por **`e.code==='KeyF'`**, no por `e.key`: con Alt pulsado muchos teclados
  entregan un carácter compuesto y la rama nunca se cumpliría (mismo motivo que el `Alt+C` que ya
  había en `app.js`).
- Al **apagar** el vuelo se deja `mc.vel[1]=0` y la gravedad recupera el mando sola.

Guardián: `tests/test_vuelo.js` (`@area: fisica`).

---

## 🖥️ La capa OSD y `game.osd` — REQ-OSD2

⚠️ **`game.osd` no es `game.showOSDbuttons`.** Eso segundo eran los dos botones de la esquina (REQ-OSD1)
y **ya no existe**: se quitaron el 2026-08-13, botones e interruptor;
lo de aquí es una **pantalla** que se pone encima del juego entero.

`<div id="mc-osd" hidden>` dentro de `#mc-modal`, `inset:0`, **z-index 25** (encima del canvas y de
`#mc-loading` z-20, debajo de `#mc-picker`/`#snip-modal` z-50/60).

```js
game.osd.define('menu', { html:'<div class="mc-osd-panel">…</div>' });   // pantalla de DOM
game.osd.define('menu', { mapa:'menu1' });                              // pantalla que es OTRO MAPA
game.osd.define('menu', { mapa:'menu1', pos:[64,20,64], yaw:-135, pitch:-20 });   // …y su encuadre
game.osd.encuadre()      // ← el de ahora mismo, impreso como un define listo para pegar
game.osd.abrir('menu');  game.osd.cerrar();  game.osd.conmutar('menu');
game.osd.abierta         // nombre o null        game.osd.pantallas()
game.osd.alPulsar('JUGAR', fn, {intro, cima});   // fn NO recibe nada; el 3.º declara qué usa de su snippet
game.osd.pulsar('jugar');   game.osd.acciones();   game.osd.entorno('JUGAR')
game.osd.dump()          // ← el descubridor: todo lo definido, tal cual está ahora
```

**`game.osd.dump()` es la puerta de entrada** (hermano de `game.bloques.info()`): quien no conoce el OSD
no tiene que leerse `app.js` ni este documento para definir una pantalla — se lo cuenta el motor con lo
que hay cargado en ese momento. Imprime en consola y **devuelve** el volcado
(`{abierta, pantallas:[{nombre,tipo,cfg,abierta,botones:[{texto,marca,accion,hace,receta,origen,entorno,falta}],
sinAccion}], acciones:[…], sinBoton}`).

**Un botón son DOS piezas y lo que las une es el texto**, así que el volcado enseña las dos por cada
botón: **`marca`**, el HTML exacto (para copiarlo tal cual), y **`hace`**, el **código fuente** de la
acción registrada. La primera versión solo listaba los nombres y el dueño devolvió el ticket con la
frase que lo resume: *«con esto no sé qué hace un botón… no sé crear un botón como los de esta
pantalla»*. Un nombre no es una respuesta.

```
game.osd — 1 pantalla(s), 2 acción(es). Abierta: intro

  • pantalla «intro»  [html]  ← ABIERTA
      ── botón «JUGAR» ✓  lo registró el snippet «arranque-intro»
         se escribe así:  <button class="mc-osd-btn">JUGAR</button>
         al pulsarlo corre esto, y se pulsa sin ratón con  game.osd.pulsar('JUGAR')
         cópialo ENTERO en la consola y corre tal cual:
            const { intro, cima } = game.osd.entorno('JUGAR');   // lo que esta acción usa de su snippet
            function jugar() {
              intro.parar();
              …
            }
            jugar();
      El HTML entero de la pantalla (cópialo para hacer otra parecida):  …
  ── Hacer un botón nuevo: son dos piezas, y lo que las une es el TEXTO ──  …recetario…
```

- Los botones **se leen igual que los lee `mcOsdAbrir`** (`[data-osd]` o el texto del `<button>`, en un
  `<template>`, que no ejecuta scripts): un informe que no coincide con lo que se va a enganchar de
  verdad sería peor que no tenerlo.
- El código de la acción sale de `String(fn)`, sin sangría sobrante y **cortado a 18 líneas**: esto es
  una respuesta, no un listado — para el resto está el snippet.
- Lo que hay que mirar cuando «el OSD no responde» es **`✗ NADIE ha registrado su acción`** y
  **`sinBoton`**: o el botón no tiene `alPulsar`, o el `alPulsar` lleva un texto que no coincide.
- Una pantalla `{mapa:…}` devuelve `botones: null` **a propósito**: sus botones son bloques con nota y
  viven en ese otro mapa; inventarlos sería mentir.
- **El ejemplo se autorresuelve, y por eso la acción no tiene parámetros.** El volcado no imprime `hace`
  pelado sino **`receta`**: la línea que resuelve los ayudantes, el código y la llamada, en ese orden, para
  que el bloque se copie **entero** a F12 y corra. Pasar `(clave, entorno)` a la acción obligaba a explicar
  dos parámetros que nadie pidió — *«no me puedes dar un ejemplo con una función de la cual no tengo sus
  parámetros… deberían de autorresolverse»* (tercera devolución del ticket). Así que **una acción se escribe
  con cero parámetros** y se la llama sin argumentos; el 3.er argumento de `alPulsar` **no cambia cómo corre
  el botón**, solo **declara** qué usa de su snippet para que `entorno()` lo sirva y `dump()` sepa enseñarlo.
  Sin él la acción funciona igual al pulsarla, pero copiada a la consola da `intro is not defined` — y el
  volcado lo avisa en **`falta`**, con la línea de `alPulsar` ya escrita para arreglarlo. El guardián de esto
  es `tests/test_osd_capa.js` §8: **evalúa la receta en el ámbito global** y comprueba que corre, y que el
  código sin la línea de entorno sigue fallando.
- **`origen`** dice **dónde** se registró la acción (`el snippet «arranque-intro»` o `la consola (F12)`): al
  leer el volcado, lo siguiente que se quiere saber es dónde hay que ir a cambiarlo. Sale de
  `mc._snippetActual`, que fija `mcCorreSnippet` mientras corre cada snippet.

- **El texto del botón ES su identidad**, normalizado (trim + mayúsculas). Por eso una pantalla puede
  pasar de `{html:…}` a `{mapa:…}` sin tocar ni una acción registrada: en los dos casos lo que llega es
  «JUGAR».
- ⛔ **…y por eso DOS MENÚS QUE USEN EL MISMO TEXTO SE PISAN.** `mc.osdAcciones` es **un solo registro
  para toda la página**: `alPulsar('AJUSTES', …)` no registra «AJUSTES en mi menú», registra «AJUSTES»
  a secas, y **gana el último que se cargue**. No es hipotético, pasó en F5.3: `mundo-autoarranque`
  carga primero `sesion-guardia` (que trae `menu-juego`) y **después** `miosd`, el menú del dueño, que
  registra `AJUSTES`, `VOLAR`, `FANTASMA`… Resultado: el AJUSTES de la pausa abría las **FÍSICAS** de
  `miosd`, y el VOLAR de `miosd` corría el de la pausa. **Un menú que no sea el del dueño pone su
  prefijo**: `data-osd="pausa:ajustes"` — `mcOsdEngancha` lee `dataset.osd || textContent`
  (`app.js:19534`), así que el texto sigue siendo lo que se lee en pantalla y la identidad pasa a ser
  una clave que no puede chocar. Guardián: `tests/test_menu_juego.js` §2b.
- ⚠️ **Las acciones se escriben CORTAS, con el trabajo en un ayudante del snippet.** `dump()` recorta
  el código a 18 líneas (`MC_OSD_MAX_LINEAS`) y le pega un «… (N líneas más)» que `mcOsdLibres` vuelve
  a leer como si fueran identificadores: una acción larga sale en el volcado con
  `falta: ['l','neas','m','s']`, que no significa nada y **esconde los avisos que sí importan**.
- **Al abrir** se suelta el puntero (`exitPointerLock`) y se vacía `mc.keys`. Con la cámara capturada
  no hay cursor con el que pulsar nada, y las teclas pulsadas se quedarían pegadas.
- Mientras hay pantalla abierta **`mcLockPointer` no recaptura** (guarda de una línea) y **`mcDoAction`
  sale pronto**: si no, los clics del menú romperían bloques por detrás de la capa.
- **`Esc` es de dos pasos**: con OSD abierto la primera pulsación cierra **el menú**, no el Mundo.
- **Una sola pantalla a la vez**: abrir otra sustituye a la anterior (dos pantallas-mapa serían dos
  contextos WebGL).

Guardián: `tests/test_osd_capa.js` (`@area: render`). Su §1 es el que importa: **sin pantalla abierta el
Mundo se comporta exactamente como antes del ticket**.

### 📏 Cuánto ocupa el panel — REQ-OSD13

*«el menú que sale con `game.osd.define` es excesivamente grande; está bien para algunos casos, pero me
gustaría poder elegir menús más compactos, tal vez escalar su tamaño, definir el espacio entre los
botones (padding), etc.»*

Las medidas de serie son las de **una intro a pantalla completa**, que es para lo que nació el andamio.
Un panel de ajustes en una esquina con esas mismas medidas tapa media ventana.

```js
game.osd.define('ajustes', {
  sitio:'abajo-derecha',
  escala:0.6, boton:18,                  // caja pequeña, letra igual de nítida
  ancho:0,                               // ← lo que más encoge
  hueco:6, relleno:[12,16], rellenoBoton:[6,12],
  html:'<div class="mc-osd-panel fila">…</div>'
});
```

| clave | qué es | de serie |
|---|---|---|
| `escala` | multiplica **todo** el panel | `1` |
| `hueco` | píxeles entre botones (el `gap`) | `22` |
| `relleno` | margen interior del panel; `12` o `[y,x]` | `[34,44]` |
| `rellenoBoton` | lo mismo, dentro del botón | `[18,26]` |
| `ancho` | anchura **mínima** de botón; **`0` = lo que mida su texto** | `260` |
| `titulo` / `boton` | cuerpos de letra a mano; mandan sobre `escala` | `27` / `18` |

- **Nada de esto vive en números dentro del CSS.** Las medidas son **variables** (`--osd-titulo`,
  `--osd-hueco`, `--osd-boton-relleno`…) declaradas en `.mc-osd-html` con los valores de siempre, y
  `mcOsdMedidas` las pisa en el `style` de ese nodo. Se **heredan** hacia dentro, así que el HTML que se
  escriba a mano puede usarlas —`padding:var(--osd-boton-relleno)`— en vez de repetir números y quedarse
  descolgado cuando cambie la escala. Y `<div class="mc-osd-panel fila">` pone los botones en fila.
- ⚠️ **Los cuerpos de letra se pegan a la REJILLA DE 9.** La fuente del juego solo sale nítida en
  múltiplos de 9 px (de ahí el 27 del título y el 18 del botón, § *Notas y fuente*). `escala` **redondea
  al múltiplo de 9 más cercano** en vez de dejar un 18,9: un menú pequeño **y borroso** es peor que uno
  grande, y la causa —una fuente de píxeles fuera de su rejilla— no se parece en nada al síntoma. El
  espaciado no tiene rejilla y escala libre. Consecuencia visible: **el botón salta de 18 a 9 alrededor
  de `escala:0.75`**; quien quiera el recuadro pequeño con la letra igual, fija `boton:18`.
- Un cuerpo puesto a mano **se respeta** —quien lo escribe manda— pero **avisa** y propone el múltiplo de
  9 más cercano. Una `escala` que no sea un número avisa y se queda en 1; nada revienta ni desaparece.
- Se aplican **en los dos sitios que montan el panel**: `mcOsdAbrir` y `mcOsdHtml`. Si solo estuviera en
  el primero, repintar un botón que cambia de estado (`VOLAR: ON/OFF`) devolvería el menú a su talla de
  serie a mitad de partida.

Guardián: `tests/test_osd_medidas.js` (`@area: render`, **29 ok**). Su §1 es el que importa: una pantalla
que **no** pide medidas se ve exactamente como antes —el dueño tiene menús escritos y en marcha—. El §3
recorre ocho escalas y comprueba que ningún cuerpo de letra se sale de la rejilla de 9.

---

## 🪟 Una pantalla que es otro mapa (`<iframe>` + `postMessage`) — REQ-OSD3

El dueño quiere **diseñar el menú dibujando un mapa** (`/map/menu1`) y activarlo desde otro mapa.
`mc` es un **singleton** —una rejilla, un programa GL, un jugador—, así que dos escenas vivas serían
reescribir `app.js`. La pantalla-mapa se monta **aislada en un iframe** y el motor no se toca.

```
game.osd.abrir('menu1')  →  <iframe src="/map/menu1?osd=1">  →  ese app.js arranca en ESCAPARATE
```

**`?osd=1` = modo escaparate** (`mcEsEscaparate` / `mcAplicaEscaparate`), y se marca **antes** de abrir
el mundo porque `mcScheduleSave` y la hotbar se consultan durante la carga:

- **no guarda nada** (`mcScheduleSave` sale en el primer `if`) — sin esto, la pantalla del menú se
  machacaría a sí misma con el primer clic;
- se esconde todo lo de jugar con la clase **`body.mc-escaparate`** (no con `hidden`: la hotbar se
  re-muestra sola desde `mcUpdateHotbar` en cuanto el jugador se mueve, y un `hidden` puntual no aguanta);
- **sin captura de puntero**: el cursor visible es lo que hace pulsable un botón;
- **`mc.volar=true`**: sin gravedad, la cámara se queda donde la dejó el spawn del mapa.

El **puente** (mismo origen, y aun así se comprueba `e.origin===location.origin`):

| dirección | mensaje | quién lo trata |
|---|---|---|
| hijo → padre | `{vf:'osd-pulsar', texto:'JUGAR'}` | el padre llama a `game.osd.pulsar(texto)` |
| padre → hijo | `{vf:'osd-cerrar'}` | el hijo cierra lo suyo |

**La acción se ejecuta en el mundo de verdad, no en la pantalla**: la pantalla solo dice qué botón se
ha pulsado. Y **al cerrar el iframe se destruye** (`src='about:blank'` + `remove()`): un segundo
contexto WebGL no puede quedarse colgado.

Guardián: `tests/test_osd_mapa.js`. Levanta **dos mundos** en SwiftShader: es lento a propósito.

### Un OSD se pone ENCIMA, no borra lo que hay — REQ-OSD6

Lo que veía el dueño al abrir una pantalla-mapa era la apertura del mundo de dentro **en directo**: «se
ve como se pone todo azul, como empiezan a salir mensajes de cosas que cargan, y luego sale el mapa…
mucho flash de información para algo que debería ser un simple menú». Tres costuras, tres arreglos:

| lo que tapaba | dónde | cómo queda |
|---|---|---|
| el cielo del mundo de dentro | `mcClearFondo` | en escaparate el frame se limpia con **alpha 0**: donde no hay nada dibujado **se ve el juego de debajo** |
| el fondo del documento | `body.mc-escaparate` (CSS) + `document.documentElement.style` | `#mc-modal` (que lleva el azul del cielo), `body` y `<html>` transparentes, y el resto del documento oculto — con el modal transparente, la cabecera del editor asomaría |
| el cartel de carga y los toasts | `mcShowLoading` / `toast` | en escaparate **no salen**: un menú no habla, y ese cartel es azul a pantalla completa y va contando fases |

Y la pantalla **no se enseña cargándose**: el iframe nace con la clase `cargando` (`opacity:0`) y una
ruedecita **sin fondo** encima (el juego sigue viéndose). El hijo manda `{vf:'osd-listo'}` cuando el
mundo está pintado *y* el autoarranque ha corrido —**dos** `requestAnimationFrame`, porque el primero es
el que pinta— y ahí se descubre entera de una vez. Si nunca llega, un reloj de `MC_OSD_ESPERA_MS` (12 s)
la descubre igual: un menú que no aparece nunca es peor que uno a medio hacer. Cerrar mata el reloj.

⚠️ `mcClearFondo` tiene que llamarse en **los tres** sitios que limpian el fondo, incluido el que
restaura el clear después de la pasada de sombra: uno que se olvide devuelve el azul un fotograma sí y
otro no. Y la guarda de `toast` pregunta por **`mcEsEscaparate()` (la URL)**, no por `mc.escaparate`:
`mc` es un `let` de más abajo y hay toasts antes de que exista — en la zona muerta ni `typeof mc` es
seguro.

### El encuadre de una pantalla-mapa — REQ-OSD7

«Cuando se muestra un osd se debería de poder indicar las coordenadas (teleport) del jugador para poder
encuadrar correctamente el menú… también la rotación de la cámara». Se declara en el propio `define`:

```js
game.osd.define('menu', {mapa:'menu1', pos:[64, 20, 64], yaw:-135, pitch:-20});
game.osd.encuadre()   // ← el descubridor: vuela hasta que se vea bien y te imprime ESA línea ya escrita
```

- **`pos`** en coordenadas de mundo, como `game.tp`; **`yaw`/`pitch` en GRADOS**, como `game.yaw` y
  `game.pitch`. Las mismas unidades que se leen en la consola, para copiar sin convertir nada.
- Viaja **en la URL del iframe** (`&pos=…&yaw=…&pitch=…`) y no por `postMessage`: tiene que estar puesto
  **antes del primer fotograma**, y un mensaje llega con el hijo ya pintado — eso se ve como un salto de
  cámara. Lo aplica `mcEscaparateEncuadre` desde `mcAplicaEscaparate`.
- Se escribe **directo en `mc`, no con `game.tp`**: `tp` desatasca (`mcUnstick`) y sube al aire libre más
  cercano. Aquí las coordenadas son las de una **cámara**, no las de alguien que va a andar por ahí, y un
  menú encuadrado desde dentro de una pared es legítimo.
- Sin encuadre declarado **no se toca nada**: la cámara se queda donde diga el spawn del mapa, como antes.
- ⚠️ **Y la pantalla se pone a `mc.scale = 1`**, pase lo que pase. `game.playerScale` **persiste en
  `localStorage`** y el iframe comparte origen con el padre, así que se heredaba la escala del visitante;
  como el ojo es `pos[1] + MC_EYE*mc.scale`, el **mismo `pos` de la URL encuadraba distinto en cada
  navegador** y el menú salía descolocado sin que hubiera forma de cuadrarlo para todos. Un menú no es
  alguien que va a andar por ahí: es una **cámara**. El `localStorage` no se toca — fuera del menú la
  escala del visitante sigue valiendo.

Guardián: `tests/test_osd_mapa.js` §5 (transparencia, revelado, silencio), §6 (encuadre) y §13 (escala).

### Cambiar de pantalla NO recarga el fondo — REQ-OSD11

Un menú de verdad son **varias pantallas sobre el mismo decorado** (MENÚ → AJUSTES → VOLAR: ON/OFF). Como
`mcOsdAbrir` cerraba la anterior antes de abrir la siguiente, y cerrar **destruye el iframe** (R2: un
contexto WebGL colgado no se recupera), cada salto levantaba `/map/voxelforge?osd=1` **de cero**: segundo
contexto WebGL, descarga del mundo, mallado y luz. Segundos de espera y el velo de «cargando» reapareciendo
para cambiar tres letras de un botón.

Dos salidas, y **hacen falta las dos**:

- **El fondo se hereda.** Si la pantalla que se abre declara **exactamente el mismo fondo** que la abierta
  —mismo `mapa` **y** mismo encuadre, que es lo que resume `mcOsdFondoClave` y queda marcado en el
  `dataset.osdFondo` del iframe—, se le deja el iframe vivo y solo se repinta el panel de botones. Un
  encuadre distinto **sí** remonta: es otro decorado.
  ⚠️ **El iframe no se mueve de sitio ni se re-inserta**: reparentar un `<iframe>` lo **recarga**, que es
  justo lo que se está evitando. Se vacía la capa a mano dejándolo donde está.
- **`game.osd.html(nuevoHtml)`** repinta el panel de la pantalla **abierta** sin tocar el fondo, y deja el
  html en su definición (reabrirla enseña lo mismo). Es lo que quiere un botón con estado:

```js
game.osd.alPulsar('VOLAR: ON',  () => { game.volar(false); game.osd.html(panel('VOLAR: OFF')); });
game.osd.alPulsar('VOLAR: OFF', () => { game.volar(true);  game.osd.html(panel('VOLAR: ON'));  });
```

Volver a hacer `define` + `abrir` **de la misma pantalla** para cambiarle el texto también sirve (el fondo
se hereda igual), pero `html()` es la vía directa y no pasa por el revelado.

Guardián: `tests/test_osd_mapa.js` §10 — la marca se pone en el `contentWindow` del hijo, porque una
recarga la borra: es la única prueba de que el iframe no se ha vuelto a levantar.

### Lo que cuesta una pantalla-mapa, medido — REQ-OSD11

Sobre `/map/voxelforge` (un mundo 96×10×96 que en disco son **1,2 KB** de JSON), abrir la pantalla tarda
**~1,5 s** en salir. No es el mapa: es **levantar una segunda copia entera de la app**. El desglose, del
`performance` del hijo:

| tramo | ms |
|---|---|
| HTML + `app.js` + `style.css` + `assets/index.json` | 0 → 140 |
| arranque del motor hasta pedir el mundo | 140 → 350 |
| `/api/mundo` + `/api/mundo/vox` | 350 → 645 |
| assets de la paleta (13 `.vox.json`) | 645 → 800 |
| **mallado + luz** (CPU, sin red) | 800 → 1115 |
| fuente, habitantes, `mundo-autoarranque`, redstone… | 1115 → 2000 |

De ahí salen las dos únicas palancas que hay:

- **No volver a pagarlo**: heredar el iframe entre pantallas del mismo fondo (arriba). Es la grande, porque
  convierte 1,5 s en 0 para el segundo, tercero y cuarto salto.
- **`vivo:false`** en el `define` (→ `&postal=1` en la URL): el decorado no ejecuta `mundo-autoarranque`,
  y con él se caen el motor de redstone, sus piezas y la lista de habitantes. **Medido: ~200 ms**, más toda
  la CPU que ese mundo dejaba de gastar simulando por detrás de unos botones.
  ⚠️ **No es gratis, y por eso no es el modo por defecto**: el autoarranque no solo anima, también **da de
  alta materiales**. En `voxelforge` la lava y la lámpara se pintan de otro color sin él. Se enciende
  mirando el decorado, no a ciegas.

Lo que **no** arregla ninguna de las dos es el primer `abrir()`: ese 1,4 s es el precio del `<iframe>`, y
el `<iframe>` está ahí porque `mc` es un singleton (R2).

### La página no se enseña para taparla — REQ-EDIT1

`<body class="app-tapada">` viene puesto **desde el HTML**, no desde JS: si lo pusiera `app.js` ya sería
tarde para el primer píxel. Lo quita `mcDestapaApp()` en cuanto se sabe qué se va a enseñar. Resuelve dos
flashazos que eran el mismo defecto por los dos lados:

| entrando por… | qué se veía | quién destapa ahora |
|---|---|---|
| `/` con un `editor-autoarranque` que navega | el editor 2D/3D entero, 100-250 ms, antes de irse al Mundo | nadie: se navega tapado |
| `/` sin snippet, o con `?noauto=1` | (nada malo) | el propio arranque, en cuanto sabe que no hay snippet |
| `/` con un snippet que se queda | (nada malo) | al terminar el snippet |
| `/map/<x>` directo | el editor de fondo mientras se pide `assets/index.json` | `openWorld`, en su primera línea |

Detalles que cuestan caro:

- **`visibility:hidden`, no `display:none`**: el layout se calcula igual, así que destapar no provoca
  reflow ni salto, y el fondo del `body` se sigue pintando (lo que se ve es el color de siempre, no blanco).
- **Cómo se sabe que el snippet se fue**: `beforeunload` llega **síncrono** al asignar `location.href`
  (medido en Chromium), así que cuando el snippet vuelve ya está puesto `mc._navegando`. Si se fue, **no se
  destapa** — destaparlo es exactamente el flash.
- **El snippet se pide en paralelo** con las galerías, aunque siga corriendo al final: es para destapar
  cuanto antes a quien no tiene ninguno, y no cobrarle la espera.
- **Red de seguridad de 5 s** y `mcDestapaApp()` también en `closeWorld`: una página en negro para siempre
  sería peor que el flash.

Guardián: `tests/test_editor_tapa.js` (los cinco caminos, mirando la `visibility` efectiva y no la clase).

⚠️ **Todo test de navegador que entre por `/` tiene que pedir `?noauto=1`.** Desde que existe el
`editor-autoarranque`, `/` **es lo que el dueño diga que sea**: el suyo hace `location.href='/map/fps?intro=1'`,
así que un test que abra `/` y busque la galería la busca en un mapa. No es hipotético — tumbó
`test_galeria_assets.js` con un error ilegible (`dialog.accept: Cannot accept dialog which is already
handled`: el `prompt` del renombrado nunca llegó porque la página se había ido, y el manejador quedó
suelto para el `confirm` siguiente). Los **14 tests** que entran por la raíz llevan ya el `?noauto=1`
con su comentario; el snippet es **dato del dueño**, no está en el repo, así que en un clon recién
hecho esto no se reproduce.

### Con un menú puesto, el HUD se aparta — REQ-OSD12

Mientras hay una pantalla OSD abierta se esconden **hotbar, mira y mandos táctiles** — el mismo grupo que
ya escondía la intro con `body.mc-intro`, y por la misma razón: el OSD suelta el puntero y `mcDoAction`
sale pronto, así que la hotbar y la mira no hacen nada. La clase es `body.mc-osd-puesto`, la pone
`mcOsdAbrir` y la quita `mcOsdCerrar`.

- **Por CSS y no con `hidden`**: `mcUpdateHotbar` la volvería a enseñar en el siguiente frame.
- **`hud:true`** en el `define` lo deja puesto, para una pantalla que sea un panel sobre la partida viva.
- ⚠️ **En táctil vuelve la capa de mandos, y de ella SOLO el ☰** (`body.mc-osd-tactil`): allí no
  hay `Esc`, y una pantalla que no traiga botón de salida dejaría al visitante encerrado en el menú. Antes
  esa excepción la sostenía «✕ Cerrar» de la esquina; desde que se quitó (REQ-OSD1), la salida táctil vive
  **dentro de `#mc-touch`**, así que esconder la capa entera se la llevaba por delante. Y desde REQ-MOV1
  ya no es un ✕ suelto sino una **línea del menú ☰**, de ahí que el selector sea `:not(.tmenu)` (ver
  [`movil-y-tactil.md`](movil-y-tactil.md)).
- ⚠️ Y esa excepción sube el `z-index` de `.mc-touch` de **7 a 30**, por encima de `.mc-osd` (25). Sin eso
  el ☰ se ve pero no se puede pulsar: está debajo de una capa a pantalla completa. Un botón de salida
  decorativo es peor que ninguno.

**Los botones «🧩 Código» y «✕ Cerrar» de la esquina ya no existen** (REQ-OSD1, quitados 2026-08-13), ni
`game.showOSDbuttons`, ni su clave `localStorage.vf_showOSD`. Se va también la clave a propósito: era lo
que los resucitaba en cada carga en un navegador que hubiera llamado alguna vez a `showOSDbuttons(true)`,
y sin clave que leer nadie tiene que ir a limpiarla a mano.

Guardián: `tests/test_osd_mapa.js` §12.

### El aviso de espera giraba mal — REQ-OSD11

`.mc-osd-espera` se centra con `transform:translate(-50%,-50%)` y se animaba con el `mc-spin` de siempre,
que dice `to{transform:rotate(360deg)}`. Una animación **pisa la propiedad entera**: el navegador
interpolaba de `translate(-50%,-50%)` a `rotate(360deg)` como matrices, así que el punto **se deslizaba
hacia abajo a la derecha y no giraba** (360° se descomponen en 0°). Medido antes del arreglo:
`matrix(1,0,0,1,-11,-11)` → `matrix(1,0,0,1,-3,-3)`, rotación cero.

Ahora tiene keyframes propios (`mc-spin-centro`) con **las dos funciones escritas en los dos fotogramas**,
que es lo que hace que la interpolación sea función a función. Guardián: §11, que mira la matriz.

**Y por eso se ven dos «cargas» seguidas al entrar**: son dos spinners distintos, no uno que parpadea — el
overlay del Mundo anfitrión (`#mc-loading`, azul, centrado) y luego el de la pantalla (`.mc-osd-espera`,
pequeño, sobre el juego). Medido en `/map/empty?intro=1`: el primero de 1039 a 1702 ms, el segundo de 1728
a 3282 ms. Con 26 ms de nada entre medias.

---

## 🔘 Un botón es un bloque con una nota — REQ-OSD4

No hay tipo «botón». Un botón es **un bloque que tiene una nota** (`mc.notes`), que ya planta un cartel
3D legible encima. Se reutiliza entero lo que existía: `mcRaycast` + `mcNoteAnchor` (que va de la celda
apuntada a la anotada, incluidos los bloques del cartel).

- En escaparate el clic izquierdo **no rompe**: `mcDoAction` sale por arriba y hace
  raycast → nota → acción. **Pulsar no es romper**: un menú cuyo botón se desintegra no es un menú.
- **Sin puntero capturado no hay mira**, así que la dirección del rayo se **deriva del píxel donde se
  hizo clic** (`mcYawPitchDePixel`) y se reusa `mcRaycast` VERBATIM dentro de un `try/finally`, en vez
  de escribir un segundo DDA que se desincronizaría del primero.
- Dentro de un iframe la acción se **manda al padre**; fuera, se ejecuta aquí mismo — así el dueño
  puede probar el menú entrando a `/map/menu1` a pelo, que es como lo va a diseñar.
- El cursor pasa a `pointer` sobre un bloque con nota: es la única señal de que aquello se pulsa.
- `MC_OSD_ALCANCE = 96`: un botón de un menú puede estar lejos, no a distancia de brazo.

Guardián: `tests/test_osd_boton.js` (`@area: general`).

---

## ⏸️ El menú de pausa (`menu-juego`) — F5.3

**Esc dejó de tirar la partida.** Vive entero en el snippet `menu-juego`, se instala solo (lo carga
`sesion-guardia`, que ya cuelga de los dos autoarranques por `herramientas/parche_snp_menu.py`) y
expone `game.menu.on()/off()/abrir()/estado()`. **Cero líneas de `app.js`.**

- **Esc es una ESCALERA** (`app.js:3862-3872`): con el Mundo abierto va cerrando lo que haya encima —la
  nota que se planta, el panel de código, el de agentes, el editor de nota, el selector, la pantalla
  OSD—, luego suelta el ratón y **solo al final cierra el Mundo**. El menú **hereda la escalera entera
  y solo cambia el último escalón**: se pone un oyente en **captura** que se aparta (`return`) si hay
  algo de eso abierto, y solo secuestra la tecla cuando lo que tocaba era `closeWorld()`. Si mañana
  `app.js` añade un escalón, sigue funcionando — no se reimplementa nada.
- **Se abre al PRIMER Esc, no al segundo.** El navegador suelta el puntero él solo al pulsar Esc y eso
  no se puede evitar desde JS, así que el escalón de «suelta el ratón» no se ve: lo que se veía era que
  hacían falta dos pulsaciones para que pasara algo. Un menú de pausa que pide dos Esc no lo es.
  ⚠️ Con el menú **quitado** (`game.menu.off()`) vuelven los dos pasos de siempre: eso es lo que
  comprueba `tests/test_menu_juego.js` §6, y es lo que demuestra que `off()` devuelve el motor byte a
  byte.
- **CONTINUAR recaptura el puntero DENTRO del manejador del clic** y **después** de cerrar la pantalla:
  es un gesto de usuario, y pedida tras un `await` el navegador la rechaza; y `mcLockPointer` no
  recaptura mientras haya pantalla abierta (`app.js:21431`).
- **La pausa se redefine en cada apertura.** `game.osd.html()` deja el HTML que pinte **dentro de la
  definición** de la pantalla, así que sin volver a `define` la segunda visita al menú enseñaría el
  enlace de invitación de la vez anterior en vez del menú.
- **INVITAR enseña el enlace para copiarlo a mano**, no lo manda al portapapeles: `navigator.clipboard`
  solo existe en contexto seguro y esto arranca en LAN por `http://` (`docs/servidor-y-apis.md:103`).
  El 401 («entra con tu cuenta») y el 403 («este mapa no es tuyo») dicen cosas distintas a propósito:
  uno se arregla entrando y el otro no se arregla.

### MULTIJUGADOR, la pantalla de dentro (REQ-MULTI3, `menu-juego` v1.3)

INVITAR ya no cuelga de la raíz: la pausa lleva a **MULTIJUGADOR**, y ahí dentro están el interruptor
(`ACTIVAR`/`DESACTIVAR MULTIJUGADOR`) y el INVITAR de siempre. Tres cosas que cuestan caro:

- **Encender NO pide el secreto del árbitro.** `game.multi.entra()` a pelo exige una clave de servidor
  que un jugador no tiene, y por eso el modo era de hecho solo del dueño. El menú se firma antes un
  **vale de su propio mapa** con `POST /api/invitaciones` —que el servidor solo concede donde ya
  puedes escribir— y lo deja en `sessionStorage` bajo `vf_multi_vale:<mapa>`.
  ⛔ **Esa llave es LA MISMA que `multi-verse` (`LLAVE_VALE`, línea 61)**: si una de las dos cambia
  sola, encender deja de funcionar sin que nada falle. Lo vigila `test_menu_juego.js` §9.
- **INVITAR mete a LOS DOS.** Antes el anfitrión repartía enlaces a una fiesta a la que él no entraba
  (solo arrancaba el cliente quien llegaba con `?invita=`). El mismo vale que firma el enlace le entra
  a él también.
- ⛔ **`estado().activo` NO es «conectado»**: `entra()` sube la bandera **antes** de que exista el
  socket y `onclose` la baja después si el árbitro rechaza el apretón (`multi-verse:1923`). La nota
  mira `estado().socket` («conectando» / «abierto» / «cerrado»); decir «Dentro» de una conexión que
  todavía vuela es prometer algo que puede no pasar.
- **`game.osd.abierta` vale `'pausa'` para TODAS estas pantallas** ⇒ no sirve para decidir un
  repintado tardío. Se mira el título con `M.enPantalla('INVITAR')`, o la vuelta de encender borra el
  enlace justo cuando lo estás copiando.

### ⛔ El árbitro tiene que compartir `VOXELFORGE_SECRETO_SESION` con `server.py`

El vale es un HMAC y **lo verifican los dos extremos con el mismo secreto** (`servidor/vales.py:13`).
Si el árbitro arranca **sin** esa variable, `sesion._firma` le inventa un secreto volátil por proceso
(`servidor/sesion.py:170`) y entonces **ningún vale legítimo verifica**: el 8510 contesta 401 y el
navegador enseña *«el servidor no me deja entrar (¿secreto? ¿tope de jugadores?)»*, que suena a culpa
del jugador y no lo es. En el log del árbitro se ve como `secreto malo`.

Pasó de verdad el 2026-09-03: el 8510 llevaba desde el 2026-08-28 arrancado a mano con
`--secreto probando` y sin fichero de entorno, o sea de antes de que existieran los vales (F6.2).
`test2` hacía su parte bien —*«no ha fijado ningún secreto porque no puede»*, y así debe ser— y aun
así no entraba.

```bash
# el árbitro, con el MISMO secreto que el sitio:
set -a && . /root/voxelforge.env && set +a
python3 multi/servidor_multi.py -v --secreto probando       # `--secreto` sigue valiendo para desarrollo
```

⚠️ **Arrancado a mano no sobrevive a un reinicio de la máquina.** Lo definitivo es la unidad
[`despliegue/voxelforge-multi.service`](../despliegue/voxelforge-multi.service), que ya trae el
`EnvironmentFile=/etc/voxelforge.env` **compartido con el sitio a propósito** — y lo dice ahí: dos
ficheros de entorno y el día que se rote uno, los vales dejan de valer sin que nada lo avise.

Para comprobarlo sin navegador, un apretón crudo contra el 8510 con un vale recién firmado
(⛔ el token es `vale-` **fuera** del base64: `'vale-' + base64url(vale)`, `servidor_multi.py:181`;
al revés da 401 y parece el mismo fallo). → [`docs/cuentas-y-permisos.md`](cuentas-y-permisos.md).
- ⚠️ **`game.volar` es una FUNCIÓN-VALOR** (`app.js:23139`): `game.volar ? 'ON' : 'OFF'` da **siempre**
  ON —un objeto siempre es cierto— y `game.volar(!game.volar)` **apaga siempre**, porque `!<función>`
  es `false`. Se lee coaccionando (`!!+game.volar`) y se conmuta llamándola **sin argumentos**.
- ⚠️ **La sensibilidad de fábrica es 0,25**, no 1 (`mc.sens = 0.000625` sobre una base de `0.0025`,
  `app.js:7709`): una lista de pasos que empiece en 0,5 deja al jugador sin forma de volver a la
  sensibilidad con la que entró.

Guardián: `tests/test_menu_juego.js` (Playwright, `@area: render`).

---

## 🎬 La intro por URL (`?intro=1`) — REQ-INTRO1 / REQ-INTRO2

**Solo se dispara con `?intro=1`.** `/map/fps` a secas entra como ha entrado siempre; la intro es una
forma más de abrir un mapa, no un cambio en lo que ya funciona (misma decisión y mismo motivo que
`?osd=1`).

**La acepta CUALQUIER mapa, no solo `fps`** (REQ-INTRO2). `mcIntroArranque()` busca **dos** snippets, en
este orden:

1. **`arranque-<mapa>`** — la intro propia de ese mundo, si alguien se la ha escrito (`/map/fps` →
   `data/snippets/arranque-fps.json`). Si existe, **gana**.
2. **`arranque-intro`** — la intro **genérica**, que es la que hay hoy
   (`data/snippets/arranque-intro.json`). Está escrita contra `mc.dim`, así que se orienta sola en un
   mapa que no ha visto nunca: darle intro a un mundo nuevo **no cuesta escribir nada**.

Si no aparece ninguno de los dos, el mundo entra normal y avisa por consola. Y como es un respaldo y no
una copia, **arreglar la genérica arregla todos los mapas a la vez**: por eso hoy **no existe**
`arranque-fps` — `/map/fps?intro=1` corre el mismo snippet que los demás. Escribir uno propio es para
cuando un mapa quiera una intro **distinta**, no para repetir ésta.

**La animación no vive en `app.js`.** `app.js` solo sabe *cuándo* llamarla.

### ⏱️ Dónde se llama, y por qué ahí exactamente — **el mundo no se enseña a medias**

Va **dentro de `openWorld`**, y **detrás de `await mcAutoarranque()` pero con el cartel de carga puesto**.
Esa colocación es la respuesta a dos síntomas que reportó el dueño, que son el mismo problema visto por
las dos caras:

| dónde estaba la llamada | lo que veía el visitante en `/map/fps` |
|---|---|
| en la cadena del arranque, después de `openWorld` | el mundo cargado y él **~10 s de pie en el suelo**, y entonces empezaba a volar |
| dentro de `openWorld` pero **antes** del autoarranque | el menú puesto y la **cámara congelada ~8 s** sin volar |

La causa de los dos es la misma: `openWorld` deja el mundo pintado y jugable, y **lo siguiente que hace
—`mundo-autoarranque`, 274 KB de snippet— bloquea el hilo** varios segundos en un mapa grande. Adelantar
la intro no quita el bloqueo, solo cambia qué se ve durante él. Así que **no se enseña nada hasta que hay
algo que enseñar**: `mcShowLoading('Preparando el mundo…')` antes del autoarranque, `mcHideLoading()`
después, y el menú y el vuelo se descubren **a la vez**. Un cartel de carga que tarda es normal; un
producto que arranca trabado, no.

⚠️ El bloqueo **no lo introdujo la intro**: está en cualquier entrada al Mundo, solo que antes quedaba
tapado por «el jugador de pie mirando el paisaje». Si algún día molesta, lo que hay que mirar es **qué
hace `mundo-autoarranque` al entrar en un mapa grande** (dar de alta un material que el mundo no usa
cuesta un `mcMeshAll`, y en `fps` eso son 512×512×40), no dónde se llama a la intro.

Dos detalles más:

- **El snippet de la intro se pide en paralelo con el mundo** (`mcIntroPrefetch()`, en el arranque): para
  cuando `openWorld` lo necesita ya está en la mano, y no se suma un viaje de red al final.
- **La llamada del arranque lleva pestillo** (`mcIntroArranque(true)` + `mc._introHecha`): `openWorld` se
  vuelve a ejecutar al volver del editor, y sin él la intro se replantaría encima de alguien que ya le
  dio a JUGAR. **A mano no hay pestillo**: `mcIntroArranque()` desde F12 relanza la intro, que es como se
  prueba mientras se edita el snippet.

Lo protege `test_intro.js §2`, y lo anota con un **`MutationObserver`** sobre el atributo `hidden` de
`#mc-loading` / `#mc-osd`, no muestreando cada frame: durante el tramo que importa el hilo está
bloqueado y un muestreo por `rAF` se lo saltaría entero.

Lo que hace el snippet:

1. `game.volar(true); game.fantasma(true);`
2. Una **órbita** alrededor del centro del mapa en un `requestAnimationFrame`, con la altura
   persiguiendo la copa del terreno por suavizado exponencial (sin eso, cada pico es un salto).
   La mirada apunta al centro: `yaw = atan2(−dx, −dz)`, que es la **única** convención (la dirección de
   vista es `[−sin(yaw)·cp, sin(pitch), −cos(yaw)·cp]`).
3. `game.osd.define('intro', {html:…})` con **JUGAR** y **CONSTRUIR**, y `game.osd.abrir('intro')`.
4. **`body.mc-intro`**: durante el sobrevuelo esto no es una partida todavía, es una postal, así que
   fuera hotbar, mira y mandos táctiles. Es la misma lista de selectores que el escaparate (en
   `style.css`), pero la clase **la pone y la quita el snippet**, así que **JUGAR lo devuelve todo**.
   Por clase y no por `hidden`: `mcUpdateHotbar` re-enseña la hotbar sola en
   cuanto el jugador se mueve.

Reglas que cuestan caro romper:

- **El bucle vive en `mc._intro`** y **reejecutar el snippet para el anterior antes de montar el nuevo**.
  Es la misma regla que el envoltorio de `mcUpdate`: el dueño edita el snippet en vivo, y dos bucles
  moviendo la misma cámara se ven como un temblor del que nadie sabe el origen.
- **JUGAR no recarga la página.** Era el encargo literal: el mapa que se está sobrevolando ya está
  cargado. Para el bucle, apaga fantasma y vuelo, baja a la superficie de la columna de debajo
  (`mcUnstick`) y cierra el menú.
- **La captura del ratón va DENTRO del manejador del clic.** Es un gesto de usuario; pedirla tras un
  `await` o un `rAF` la rechaza el navegador y el jugador aterriza sin poder mirar.
- **CONSTRUIR va al editor 2D/3D** (decisión del dueño), no a un modo creativo dentro del mapa — y
  **tampoco recarga** (ver abajo).
- **Cualquier tecla de moverse corta la intro** y cae en JUGAR: quien ya sabe lo que quiere no espera.
- El día que exista `/map/menu1` dibujado, es cambiar `{html:…}` por `{mapa:'menu1'}` — **ni una acción
  cambia**, porque un botón se declara por su texto.

### 🔁 Intro ⇄ editor, sin recargar — REQ-INTRO2

**El editor y el Mundo son la misma página**: el Mundo es el overlay `#mc-modal` y el editor está
debajo. Así que ir y volver **no puede costar una recarga**, que es volver a bajar mundo, atlas y
galerías enteras. El circuito, ninguno de cuyos tramos navega:

| paso | qué hace |
|---|---|
| **CONSTRUIR** | el snippet para la intro, apaga vuelo/fantasma, cierra el menú y llama a **`closeWorld()`**. (Antes era `location.href='/'`: eso recargaba la página entera.) |
| **la marca «VOXELFORGE»** del editor | `mcVolverAIntro()` → `openWorld()` (**idempotente**: con `mc.grid` ya en memoria no baja nada) + `mcIntroArranque()` a mano. |

- **`mcIntroArranque(auto)`**: con `auto` (la llamada del arranque) exige `?intro=1` y corre **una sola
  vez** (`mc._introHecha`) — si no, volver del editor le replantaría la intro encima a quien ya está
  jugando. **Sin `auto`** (consola, guardián, o el clic en la marca) relanza **siempre**, aunque la URL
  no lleve `?intro=1`: quien la llama a mano ya ha dicho lo que quiere.
- **La marca solo se ve pulsable si hay mundo en memoria** (`mcMarcaSync`, clase `.clicable`): en el
  editor a secas es un rótulo y no debe prometer un camino que no existe.
- **La URL no se toca** (nada de `history.replaceState`): `mcMapName()` la lee para saber en qué mundo
  está, y cambiarla haría que el mundo se guardara en otro fichero.
- **Al volver ya NO se re-ejecuta `mundo-autoarranque`** (REQ-SNP7, 2026-08-20): arranca solo en la
  primera entrada (`mcPrimeraEntrada = !mc.grid` en `openWorld`). Lo que un snippet quiera hacer en la
  vuelta lo registra él con `game.alVolverAlMundo(clave, fn)` → [`bloques-comportamiento.md`](bloques-comportamiento.md).
  La vuelta sigue llevando su `mcShowLoading('Preparando el mundo…')` hasta que la intro está montada.

Guardián: `tests/test_intro.js`. Corre sobre `/map/test?intro=1` porque `fps` es 512×512×40 (20 MB) y
bajo SwiftShader no carga, pero **no simula nada**: `/map/test` no tiene snippet propio, así que lo que
ejerce es el respaldo real servido por el servidor (§2), y §7 comprueba la ida y vuelta contando que
**no vuelve a haber un GET de `/api/mundo`** y que un centinela puesto en `window` sobrevive. De
`/map/fps` se verifica a mano.

---

## Verificación a mano

```bash
python3 server.py 8500
node correr_tests.js --area=fisica       # REQ-FLY1
node tests/test_osd_capa.js              # desde la RAÍZ, nunca desde tests/
node tests/test_osd_mapa.js
node tests/test_osd_boton.js
node tests/test_intro.js
```

En el navegador: `/map/test` (`F` vuela, `Alt+F` saca foto y aparece en `/fotos`), luego
`/map/fps?intro=1` (la cámara pasea, JUGAR aterriza sin recargar, CONSTRUIR abre el editor **sin
recargar** y «VOXELFORGE» trae de vuelta a la intro, también sin recargar), cualquier **otro** mapa con
`?intro=1` para ver el respaldo genérico, y `/map/fps` a secas para confirmar que **no cambió nada**.

---

## Las 4 reglas caras (movidas verbatim desde CLAUDE.md el 2026-08-21)

Estaban en el índice porque cuestan caro romperlas; bajan aquí para hacer sitio a la Ley de Oro del
[desarrollo desacoplado](desarrollo-desacoplado.md). No se ha cambiado ni una palabra.

- Acción de botón: **CERO parámetros**, se llama sin argumentos ⇒ el volcado imprime una **receta**
  copiable entera a F12. El dueño lo devolvió **3 veces** (REQ-OSD5).
- Pantalla-mapa = **`<iframe>` con `?osd=1`** (escaparate: no guarda, sin hotbar, sin captura de puntero)
  y **el iframe se destruye al cerrar** (`mc` es singleton ⇒ eso es otro contexto WebGL vivo).
- **Tamaño del panel se pide en `cfg`, ⛔ no se toca el CSS** (REQ-OSD13) y se aplica en **los 2** sitios
  de montaje (`mcOsdAbrir`, `mcOsdHtml`) o repintar un botón le cambia la talla.
- **`?intro=1` = única forma de disparar la intro**; vive en el snippet `arranque-<mapa>` o el genérico
  `arranque-intro`, ⛔ **nunca en `app.js`**; su bucle (`mc._intro`) se **desmonta antes de montar otro**.
  **Ni JUGAR ni CONSTRUIR recargan**: editor y Mundo son **la misma página** (`closeWorld()` /
  `mcVolverAIntro()`, ⛔ jamás `location.href`).
