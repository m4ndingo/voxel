# Los iconos de la aplicación (`/images`)

El favicon del sitio, la marca del editor y los once botones de herramienta **no son emoji ni
ficheros dibujados aparte**: son dibujos vóxel del catálogo, horneados a PNG desde la página
`/images`. Este documento cuenta cómo está montada esa tubería y qué reglas cuesta caro romper.

---

## Las dos cosas que viven en `data/ui/`

No son lo mismo y se tratan distinto:

| fichero | qué es | se edita a mano |
|---|---|---|
| `ranuras.json` | la **asignación**: `ranura → {dibujo:'hab:x@7', modo, aa}` | no hace falta, pero se puede leer |
| `<ranura>-<px>.png` | el **derivado**: lo que consumen los HTML | ⛔ **nunca** |

La fuente de verdad es el **dibujo** (en `assets/` o en `data/habitantes/`) **más** la asignación.
Los PNG se rehornean enteros desde ahí, así que editarlos a mano es trabajo que se pierde en la
siguiente publicación.

**Los dos se versionan** (excepción explícita en `.gitignore`, con el motivo escrito allí): los HTML
piden los PNG por una URL fija, y un clon recién hecho enseñaría la pestaña rota hasta que alguien
entrase en `/images` a publicar. Son unos KB.

---

## Quién rasteriza: el navegador

El rasterizador es **`pinta()`**, dentro de `images/index.html`. Reimplementa las mismas fórmulas
que `drawIsoFaces` de `app.js` —culling por celda vecina, factores de sombreado **1,10 / 0,72 /
0,55**, `scanQuad` de línea de barrido medio abierta— porque el resultado tiene que parecerse al
Mundo, no a otra cosa.

**No se lleva a Python.** Sería mantener el mismo dibujo escrito dos veces en dos lenguajes, y la
primera vez que cambiara un factor de sombreado se despegarían sin que nadie se enterase. El
servidor **valida y escribe**, exactamente igual que `/api/fotos`: bytes mágicos del PNG,
`atomic_dump`, papelera. No sabe qué es un vóxel.

### El suavizado es de SILUETA, no de la imagen entera

`aa` (encendido por defecto) hace **supersampling ×4**, la técnica de `drawThumbRanura`
(`app.js:1873`), pero **solo para la cobertura**:

- una pasada a tamaño real da el **color** (nítido, exacto);
- una pasada a ×4 da el **alfa** (la media de las 16 submuestras);
- el color solo se promedia donde la pasada nítida no pintó nada.

Reducir la imagen entera desde ×4 suaviza **también el interior**, y en arte vóxel eso se lee como
pérdida de viveza — fue una queja del dueño con capturas. Medido: **0 de 1752 píxeles opacos**
cambian respecto del render nítido.

### El fleco de silueta es enorme a tamaño de icono

Medido sobre *Alis la Duplicadora* (32³), modo iso con AA — sonda
[`performance/sonda_aa_pequeno.js`](../performance/sonda_aa_pequeno.js):

| tamaño | opacos | fleco con alfa parcial | % del icono |
|---|---|---|---|
| 16×16 | 91 | 42 | **31,6 %** |
| 32×32 | 411 | 73 | 15,1 % |
| 64×64 | 1711 | 173 | 9,2 % |
| 256×256 | 28 363 | 759 | 2,6 % |

En modo **`plano` es 0 % a cualquier tamaño**: un vóxel es un píxel y no hay silueta que cubrir.
Por eso `plano` es lo que mejor sale para un favicon de 16.

Consecuencia práctica: **el fondo sobre el que se enseña la previa decide cómo se lee el icono**. El
tablero de transparencia es claro, y con un 31 % de fleco convierte un icono opaco en una mancha con
neblina — eso, y no el render, era la diferencia entre la tarjeta y el sandbox que reportó el dueño.
Hoy el tablero solo sale si el dibujo **de verdad** tiene vóxeles translúcidos (`docTraslucido`), y
en el sandbox lo manda la casilla «transparente», que ahí es decisión explícita del usuario.

### La previa se amplía por un entero, y `pixelated` no vale para reducir

Segundo bicho del mismo reporte, y **no** era el mismo: el dueño copió el PNG de 32 de su icono,
lo pegó en el chat y estaba perfecto, pero en la tarjeta se veía torcido. La sonda
[`performance/sonda_previa_vs_png.js`](../performance/sonda_previa_vs_png.js) descartó el
contenido —el lienzo de la tarjeta es idéntico al PNG horneado, ampliado ×8 no se distinguen—, y
[`performance/sonda_previa_dpr.js`](../performance/sonda_previa_dpr.js) reprodujo el fallo: con
`deviceScaleFactor` **1 y 2 se ve nítido; con 1,25 y 1,5 se deshace**.

La causa es que un lienzo de 16 px enseñado a 16 px de CSS ocupa **20 píxeles de pantalla** si el
dueño tiene Windows al 125 % (o el navegador al 110 %), y `image-rendering:pixelated` a 1,25× solo
puede duplicar unas filas sí y otras no: el icono sale con bloques desiguales y pinta de estar mal
generado. Es también por lo que **el sandbox se veía bien**: con AA usa `image-rendering:auto`.

La cura vive en `pintaPrevia` (`images/index.html`), y lo que hay que tener claro es que en esta
página **hay dos clases de lienzo y quieren cosas opuestas**:

- **A tamaño natural** (32 px de dibujo a 32 px de CSS). Ese lienzo **no es una previa: es el PNG**,
  y el dueño lo copia y lo pega para comprobarlo. El búfer se queda **1:1** y solo cambia el
  `image-rendering` a `auto` — o sea, **exactamente lo que hace el sandbox** (`pintaSandbox`), que
  es la referencia que él da por buena. Ampliar el búfer aquí, aunque sea por un entero, hace que
  copiarlo devuelva un **64×64**: fue una regresión de mi primer intento, y la reportó él
  (*«no puedo copiar el 32x32 a esa resolución, muestra un tamaño mayor, parece x2»*).
- **Ampliado a propósito** (los `×2`/`×4` de la tarjeta, la rejilla de 24 posturas a 48 px). Aquí sí
  ampliamos nosotros por un **entero** con vecino más próximo, `k = ceil(cssW * dpr / px)` —
  **`ceil`, nunca `round`**: por debajo de la rejilla de pantalla el navegador tiene que inventar
  píxeles y vuelve el moaré— y al navegador solo le queda **reducir**, que es interpolación suave.
  Con dpr entero `k*px` cae justo en la rejilla y no se reduce nada: idéntico a lo de siempre.

`image-rendering:pixelated` se mudó de `.lienzo` a `.sb-previa canvas`, y `pintaPrevia` lo repone
inline solo en el caso 1:1 sin AA (misma regla que el sandbox: si el dueño apaga el suavizado, ha
pedido pixelón). A/B en
[`performance/sonda_previa_antes_despues.js`](../performance/sonda_previa_antes_despues.js), y la
igualdad tarjeta = sandbox en
[`performance/sonda_previa_vs_sandbox.js`](../performance/sonda_previa_vs_sandbox.js) — **0 de 4096
subpíxeles distintos** a dpr 1 y a 1,25. Lo guarda `tests/test_images_ui.js`, que abre una segunda
página a `deviceScaleFactor` 1,25 justo para esto (a dpr entero el fallo no se ve).

---

## Cómo llegan los iconos a la aplicación

**Sin un solo `<img>` escrito a mano en los HTML.** Un `<img src="/data/ui/…">` fijo daría 404
mientras no haya nada publicado, que es el estado normal de un clon recién hecho.

- **Favicon** — `server.py` sirve `/favicon.ico` desde `data/ui/favicon-32.png`. Los cuatro HTML
  (`index.html`, `mapas.html`, `fotos.html`, `wiki/index.html`) ya pedían `/favicon.ico`, y les daba
  404 porque ese fichero **nunca ha existido en disco**. Así, publicar cambia el icono del sitio
  entero sin tocar una línea de HTML, y sin publicar se comporta como siempre.
- **Marca y herramientas** — [`iconos.js`](../iconos.js) (raíz, cargado con `defer` desde
  `index.html`). Pregunta `/api/ui` una vez y hace el cambiazo en el DOM.

Tres reglas de `iconos.js`, todas por el mismo motivo —los iconos son un extra, no un requisito de
arranque:

1. **Sin nada publicado no hace nada.** Cada botón se queda con su emoji y la marca con su `◧`. Que
   falle (servidor caído, JSON roto) no puede impedir que arranque el editor: todo va dentro de un
   `catch` que se traga el error.
2. **Busca por `data-tool`, no por posición.** `#tools` y `#tool-float` llevan las mismas once
   herramientas en distinto orden; así cambian las dos, y una tercera barra futura saldría gratis.
3. **Sustituye solo el nodo de TEXTO del emoji.** El `<i class="tool-swatch">` (la muestra de color
   que pinta `app.js`) y el `<span>` de la etiqueta se quedan donde están.

El CSS de los iconos plantados es `.icono-horneado` en `style.css`: **`image-rendering:pixelated` no
es opcional** —son 32 px de arte vóxel y el suavizado del navegador al reescalarlos los deja en una
mancha— y `display:block` para que no arrastren el hueco de la línea base del texto.

---

## La API

| ruta | qué hace |
|---|---|
| `GET /api/ui` | la asignación guardada, o `{}` si nadie ha publicado |
| `POST /api/ui` | `{ranuras:{…}, png:{'favicon-16':'data:image/png;base64,…'}}` |
| `GET /favicon.ico` | el PNG de 32 horneado; 404 si no hay |
| `GET /data/ui/<n>.png` | estático de siempre (`no-cache`, así que republicar se ve al recargar) |

El `POST` **valida el lote entero antes de escribir un solo byte**: publicar es una operación sola, y
una tanda a medias deja el favicon nuevo con los botones viejos sin que nadie sepa por qué. Los PNG
de las ranuras que se han quitado **se van a la papelera, no se borran**.

El nombre del fichero se deriva en **un solo sitio** (`nombrePng(r, px)` = `<archivo>-<px>`), y
`RE_UI_PNG` de `server.py` valida justo esa forma.

---

## El sandbox

La misma tubería apuntando a un lienzo que manda el usuario: cualquier dibujo, al tamaño (hasta
4096), postura y modo que se quiera, con o sin fondo, para llevárselo fuera. **No toca `data/ui/` ni
las ranuras** — el PNG se descarga y ya.

Las **24 posturas** se derivan enumerando roll/tilt/yaw, igual que `MC_ORI` en `app.js`: una tabla
escrita a mano se desincroniza de la geometría (fue BUG-RS7 y BUG-ROT2). Como el orden del bucle es
el mismo, el índice de aquí es el `@n` del motor. **No hay ángulo libre**: haría falta un segundo
rasterizador que se despegaría del que usa el Mundo.

---

## Guardianes

```bash
node tests/test_images_ui.js        # publicar → PNG en disco → reabrir restaura la asignación
node tests/test_images_consumo.js   # sin publicar el editor no cambia; publicando, los iconos salen
```

Los dos **restauran `data/ui/` a como estaba** al terminar: el dueño puede tener iconos publicados.

---

## Movido verbatim desde CLAUDE.md el 2026-08-30

Iconos (`/images`): la verdad es el **DIBUJO + `data/ui/ranuras.json``; los `data/ui/<ranura>-<px>.png`
son **derivados, ⛔ no se editan a mano nunca**. **Rasteriza el navegador**; `server.py` solo valida y
escribe. Sin publicar, todo se ve como antes.
