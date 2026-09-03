# Plantillas de mundo — el carrusel de «mundo nuevo» y sus fichas

> Detalle de [REQ-PLANT1](../PLAN.md#-req-plant1) (el carrusel) y [REQ-PLANT2](../PLAN.md#-req-plant2)
> (gestionar las fichas). Aquí está lo que **cuesta caro romper**; el porqué de cada decisión, en la
> cabecera de `servidor/plantillas.py`, que se lee en dos minutos.

Crear un mapa era caer en una llanura vacía. Ahora se elige una **ficha con foto** —un bioma ya
hecho— y se ajustan tamaño, ambiente y efectos antes de generar.

## Las tres piezas, y quién manda en cada una

| pieza | quién | dónde |
|---|---|---|
| **El bioma** | un snippet `construye-*` que **ya existía** y **se autoejecuta** | `data/snippets/` |
| **La ficha** (título, descripción, etiquetas, foto, frases de carga, orden) | vive **DENTRO** del snippet, en la clave `ficha` | el mismo `.json` |
| **La foto** | un fichero suelto | `data/ui/plantillas/<id>.<jpg\|png\|webp>` |

⇒ **Añadir un bioma al carrusel = publicar su generador con una `ficha` puesta.** No hay ninguna
lista aparte que mantener; el catálogo es «lo que hay en `data/snippets/` con `ficha`», más las dos
opciones del final («solo terreno base» y «mapa vacío»), que son constantes de `plantillas.py`
porque no son snippets.

## Alta y baja (REQ-PLANT3)

Eso de arriba es el **alta**, y es la respuesta a «¿cómo doy de alta una plantilla?»: se publica el
generador con su `ficha` (`POST /api/snippets`, o el editor de código con Alt+C) y aparece sola en el
panel y en el asistente. Como no se adivina mirando el panel, **el panel lo explica en su primer
aviso**; ésa fue la petición del dueño, no otra pantalla.

La **baja** es la marca **`oculta: true`** dentro de la ficha, y se pone desde el panel con **Quitar
del carrusel**:

- ⛔ **No borra nada.** El generador sigue publicado y funcionando; lo único que pierde es la
  tarjeta. Borrar de verdad es borrar el snippet, en el editor de código, y eso va a la papelera.
- **La dada de baja sigue en el panel**, en gris y con la pastilla «fuera del carrusel»: es de donde
  se devuelve. Quien la filtra es `/api/plantillas`, que es lo que ve el jugador.
- ⛔ **Por eso la baja NO es quitarle la `ficha`**, que era lo primero que salía: sin ficha el
  snippet desaparece **también del panel** —que sólo lista lo que tiene ficha— y devolverla exigía
  volver a escribir Python. Un alta sin vuelta atrás no es una baja.
- Las dos fichas del propio programa no se dan de baja: son el punto de partida de cualquier mundo.

Los dos tamaños (`lado` que propone, `ladoMax` que aguanta) también se editan ahí, con desplegables
que el servidor rellena con `LADOS`: el que descubre que un bioma deja al navegador sin memoria es
el dueño jugando, no editando un `parche_snp_*.py`.

## ⛔ Las siete reglas caras

1. **La foto se resuelve contra el DISCO en cada petición del catálogo** (`plantillas.foto_de`), no
   se copia de la ficha. De ahí salen las dos propiedades que hacen que esto no se rompa nunca:
   - **si la foto desaparece, la tarjeta vuelve a su marcador** (la inicial del título) y no queda
     un hueco roto ni un 404 en la consola;
   - **si aparece `data/ui/plantillas/<id>.jpg`, se usa**, aunque nadie haya tocado los metadatos.
     Asociar una foto es, literalmente, subirla con el nombre de la ficha.

   El día que alguien «optimice» esto guardando la ruta y creyéndosela, vuelven los dos fallos.

2. **La zona de imágenes es `data/ui/plantillas/`, y lo es por un motivo.** `ui` es una de las
   cuatro carpetas de `DATA_PUBLICA` (`server.py`): en modo público se **lee** y sólo se **escribe**
   pasando por el panel con `panel.usar`. `plantillas.ruta_de_url()` es el portero: sólo admite esa
   carpeta y `data/fotos/` (las capturas de Alt+F), y sólo con nombre de fichero llano. Sin él, una
   ficha con `foto: '/data/../../etc/passwd'` convertía el catálogo en un lector de ficheros.

3. **La imagen se reconoce por sus BYTES, no por lo que diga el nombre ni el `data:`**
   (`plantillas.imagen_cruda`). Un `.jpg` que en realidad es un `.svg` es un XSS servido desde el
   propio sitio.

4. ⛔ **Guardar los metadatos NO toca el `code` del generador.** `panel.guarda_plantilla` lee el
   documento, le cambia sólo `ficha` y lo reescribe entero. Por eso **no** pasa por
   `POST /api/snippets`, que arma el registro de cero y obligaría al navegador a devolver los 9 KB
   de JS del bioma para no perderlos. Y en el sentido contrario: `POST /api/snippets` conserva la
   `ficha` aunque no se la manden (es «pegajosa», como `protegido`), así que guardar desde el editor
   de código no borra la tarjeta. **Los dos caminos se respetan; romper uno rompe el otro.**

5. ⛔ **La captura del snippet `fichas-plantilla` es SÍNCRONA, pegada al `mcRender()`.** El canvas
   del Mundo se crea sin `preserveDrawingBuffer` (`app.js:5425`), así que un `await`, un
   `setTimeout` o un `requestAnimationFrame` por medio devuelven **negro**. Misma regla que `mcFoto`
   (`app.js:20293`).

6. ⛔ **NINGÚN generador pone `mc.spawn`, y el que traiga `app.js` de fábrica NO vale** (BUG-SPAWN1,
   2026-09-03). Se comprobó en los 9 `construye-*`: cero menciones. El de fábrica es el centro del
   mapa a `y = GH+1 = 15`, una cota elegida antes de que existiera el relieve, así que en cuanto el
   bioma levanta terreno por encima el punto de aparición queda **dentro de la montaña o bajo el
   mar**. Se guarda así en el `.json` y se reaplica en cada carga.

   Medido en `/map/playa` (generado con `construye-oceanos-y-playas`): la columna del centro es roca
   maciza de `y=1` a `y=16` y arena de `y=17` a `y=20`. El spawn guardado era `{64,15,64}` —
   enterrado en roca.

   El parte del dueño fue *«al recargarlo aparezco bajo el suelo de la playa, entre el fondo y la
   arena en una cavidad»*, y esa **cavidad** es la segunda mitad del fallo: `mcUnstick` sube al
   **primer hueco de aire**, no a la superficie, así que una bolsa de aire enterrada es donde te
   deja. Y si el spawn cae en agua no mueve nada en absoluto, porque el agua no colisiona.

   La red de seguridad está en `app.js` (`mcSpawnSeguro`, llamada al final de `openWorld`): si el
   spawn guardado no es un sitio **donde se pueda estar de pie** —maciza o con fluido, mirando pies y
   cabeza— lo lleva a la superficie seca más cercana en espiral (`mcPieSeco`). **Un spawn en aire con
   suelo debajo no se toca jamás**: una cueva, un sótano o el interior de una casa son sitios que
   alguien eligió, y «subir a la superficie todo lo que esté bajo tierra» le movería la casa a quien
   la construyó ahí. Guardián: `tests/test_spawn_seguro.js` (su §D es justo ese invariante).

   Eso es una red, no la cura: **si escribes un generador, pon tú el `mc.spawn`** sobre el relieve
   que acabas de crear. A mano: `game.spawnSeguro()` arregla un mapa ya guardado (mueve `mc.spawn`;
   el siguiente guardado lo fija).

7. ⛔ **«La rejilla no crece» NO significa «el generador terminó»** (BUG-PLANT2, 2026-09-03). El
   parte del dueño: *«creo "oceanos y playas", lo llamo "miplaya"; al entrar todo está en su sitio,
   pero al recargarlo la playa no tiene agua»*. En pantalla el mundo estaba entero; en disco no.

   `generador-mundo` no puede esperar a los `construye-*` (no devuelven promesa), así que espera por
   **asentamiento**: cuatro muestras de 500 ms sin un voxel nuevo. El problema es que un `setVoxel`
   con un material que aún no está en la paleta **no escribe la celda**: la apunta en `mcPendCel`, se
   trae el `.vox.json` y la escribe al llegar (`app.js:22206`). Mientras esa descarga viaja, la
   cuenta está **clavada** — y cuatro muestras quietas dentro de una descarga son un falso «ya está»:
   se guarda, y todo lo que aterriza después se queda fuera del fichero. El jugador lo sigue *viendo*
   en esa sesión, y desaparece al recargar. De ahí que pareciera un fantasma.

   Qué material cae depende del orden de las descargas, por eso unas veces sale bien y otras no. El
   generador de océanos precarga con `game.addMaterial` el tronco, las hojas, el coco y las dos
   flores, pero **no el agua**: por eso le tocó al agua. Medido con los assets retrasados 4 s: se
   perdían 52.129 voxels (`obsidiana` 16.384 + `dirt` 35.745); con el arreglo, 0.

   La cura está en `generador-mundo` (no en `app.js` ni en los cinco generadores, que son de otro
   autor): `enVuelo()` suma las tres señales —`mc.paletaEnObra`, `mcPendCarga`, `mcPendCel`—, que
   cuentan cosas distintas y hay que esperar a las tres; `asienta()` no cuenta como quieta una vuelta
   con algo en vuelo, y `drenaPendientes()` las vacía de verdad antes de `mcSaveWorld()`.
   Parche: `herramientas/parche_snp_generador_pendientes.py`.

8. ⛔ **Lo que se escribe MIENTRAS vuela el POST del guardado completo se perdía** (BUG-SAVE2,
   2026-09-03). Es la **segunda** causa de la misma playa sin agua: con (7) arreglado el dueño volvió
   a reproducirlo. El `.vox` de su `miplaya` tenía 304.235 voxels y una paleta sin `agua`, sin `dirt`
   y sin `obsidiana` — exactamente la instantánea del mundo en el instante del guardado, y el fichero
   no se volvió a escribir después.

   `mcSaveWorldFull` (`app.js:22456`) tomaba la instantánea al **entrar** y bajaba la bandera
   `p.full` al **salir**; y mientras `full` está puesta, `mcDirty` se va sin apuntar nada
   (`app.js:9045`). Durante todo el viaje del POST —segundos, con 13 MB por delante— cada celda que
   se escribía (1) no iba en la instantánea, por posterior, y (2) no quedaba apuntada, por la
   bandera; y al volver, el `vox.clear()` borraba el último rastro. En pantalla se seguía viendo; en
   disco no estaba. En un mundo de plantilla eso es justo lo que llega tarde: los materiales que no
   van precargados, cuando su `.vox.json` termina de bajar.

   El arreglo va en el mismo envoltorio `guardado-fiel` (v2) porque **ya envuelve** `mcSaveWorldFull`
   y apilar una segunda capa dejaría `off()` a medias. La instantánea y la bandera se toman
   **juntas y antes del `await`**: `mcSerialize()` es síncrono, así que toda escritura posterior
   vuelve a pasar por `mcDirty` y se acumula en un `p.vox` nuevo que el siguiente ciclo manda por
   `/edits`. Es letra por letra la disciplina que el camino incremental ya aplicaba en
   `mcSaveWorldAhora` (`app.js:22419`) — **la asimetría entre los dos caminos ERA el bug**, igual que
   lo fue en REQ-SAVE1. Si el POST falla se vuelve a `full = true` y se **devuelve** lo que se había
   sacado, como el `devolver()` de al lado: perder un viaje es barato; perder voxels, no.

   Medido reteniendo 25 s el POST: **60.621 voxels perdidos** (`agua` 5.642 + `dirt` 35.745 +
   `obsidiana` 16.384 + nubes 2.850) antes, **0** después. Sin retenerlo salía bien la mayoría de las
   veces, y de ahí el «a veces sí». Parche: `herramientas/parche_snp_guardado_vuelo.py`.
   Guardián: `tests/test_guardado_fiel.js` (su §2 es justo el «conserva el pendiente»).

## Cómo se pone una foto

Dos caminos, y los dos acaban en el mismo fichero:

**Desde el panel** — `/panel.html` → pestaña **Plantillas**. Se pulsa el retrato, se elige la
imagen y se sube sola (no espera al botón Guardar: la imagen y los textos son cosas distintas y
mezclarlas obligaría a resubir la foto por corregir una coma). El retrato se pinta en **9:16**, la
misma proporción que la tarjeta del asistente, para que el recorte se vea aquí y no después.

**Desde dentro del juego** — es lo que se va a usar de verdad: se entra al bioma, se busca el sitio
bonito y se dispara.

```js
await game.snippet('fichas-plantilla')
game.fichas.lista()        // qué fichas hay y a cuál le falta foto
game.fichas.prueba()       // ver el recorte 9:16 antes de subirlo
game.fichas.retrato()      // la plantilla de ESTE mapa, sin teclear el id
game.fichas.retrato('construye-badlands')
```

⛔ **No se engancha a ningún autoarranque**: es una herramienta del dueño, no algo que deba correr
en el navegador de cada visitante. Se publica con
`python3 herramientas/parche_snp_fichas_plantilla.py`.

**Quitar una foto** la manda a la **papelera**, no al vacío (regla del repo), y no toca la ficha.

## Las rutas

| ruta | permiso | qué hace |
|---|---|---|
| `GET /api/plantillas` | cualquiera | el catálogo del carrusel: fichas + tamaños + ambientes + efectos |
| `GET /api/panel/plantillas` | `panel.usar` | lo mismo, más el estado real de cada foto (`sinFoto`, `fotoDeclarada`, `fotoPorNombre`) |
| `POST /api/panel/plantilla` | `panel.usar` | los metadatos de una ficha |
| `POST /api/panel/plantilla/foto` | `panel.usar` | la imagen, en base64 (hasta 3 MB) |
| `DELETE /api/panel/plantilla/foto/<id>` | `panel.usar` | a la papelera |

Y una ruta que no es de API pero es contrato igual: **`/map?nuevo=1` abre el asistente de entrada**.
Es por donde entra «Crear un mundo» de la portada (`web/menu.html`), y existe porque **crear un
mundo sin plantilla no crea nada usable**: el mapa nace `generado:false` y quien lo construye es
`generador-mundo` desde el autoarranque, que necesita saber qué generar. Antes la portada creaba
ella con un `prompt()` de sólo el nombre y el jugador aterrizaba en un mapa **vacío** creyendo que
el juego estaba roto (BUG-PLANT4). ⚠️ El parámetro **se gasta al usarlo** (`history.replaceState`):
si se quedara en la barra, volver atrás desde el mundo recién creado —o recargar tras cancelar—
reabriría el asistente encima del listado. Guardián `tests/test_asistente_ui.js`.

Las dos fichas del propio programa (`terreno-base`, `vacio`) admiten **foto** pero no cambio de
textos: sus textos son constantes de `plantillas.py`, y aceptar un guardado que no guardaría nada es
peor que decir que no.

## El ambiente es una LISTA CERRADA, y no es negociable

El jugador **no manda código**: manda **claves** de `AMBIENTES`/`EFECTOS` y el servidor emite la
constante correspondiente en el snippet `mundo-<slug>`. Es la opción **D** de
[`codigo-de-usuario.md`](codigo-de-usuario.md). Un snippet lo ejecuta `mcAutoarranque()` con
`AsyncFunction` **en ámbito global en el navegador de cada visitante**: si el jugador pudiera decidir
ese texto, entrar a su mapa sería ejecutar su código con la sesión de quien entra — justo lo que el
dueño prohibió. **Nada que llegue del cliente puede acabar dentro de `code`.**

## Guardianes

- `tests/test_fichas_plantilla.js` (`--node`) — las dos preguntas del dueño («cómo asocio una foto»,
  «qué pasa si se borra») más el `code` intacto y la zona segura. Usa fichas `zz-test-…` y recoge su
  basura.
- `tests/probe_plantillas_mundo.js` (Playwright) — el carrusel y que el mapa **se construye de
  verdad**; ninguna prueba de `curl` puede verlo, porque quien levanta el bioma es el navegador.
- `tests/test_asistente_ui.js` (Playwright) — el camino hasta el asistente y su maqueta: que la
  portada **enlaza** en vez de crear (y que no vuelve el `prompt()`), que elegir plantilla lleva el
  foco al nombre, y que **el mensaje de error no mueve el panel ni un píxel**. ⚠️ Manda un error
  **largo** a propósito: con uno corto el salto era de 3 px y por eso nadie lo vio venir.
- `tests/test_plantillas_alta_baja.js` (`--node`) — la baja sale del carrusel pero **sigue en el
  panel**, el `code` queda byte a byte, `savedAt` **no se mueve** y `lado`/`ladoMax` van y vuelven.
  Toca una sola ficha y la deja como estaba, falle lo que falle.

## Lo que falta

- Elegir como foto una captura que ya esté en `data/fotos/` (el servidor ya la admite: falta el
  selector en el panel).
- Llevar el asistente a `web/menu.html`.
