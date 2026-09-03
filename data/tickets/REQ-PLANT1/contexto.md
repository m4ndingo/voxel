# REQ-PLANT1 · plantillas de mundo con fichas y foto

Abierto el 2026-09-02. Ticket → [`PLAN.md`](../../../PLAN.md#-req-plant1).

## Palabras del dueño (verbatim)

> cuando un usuario se registra y se le da permiso para crear nuevos mapas deberia de tener algun
> tipo de plantilla para no empezar con un mapa vacio siempre. Tiene que haber fichas seleccionables
> atractivas con imagenes (capturas que puedo hacer yo y en algun sitio las asociamos, igual dentro
> del snippet) para generar algunos biomas con snippets ya existentes como: construye-badlands,
> construye-fortnite-chapter-2-island, construye-fornite-tilted-towers, construye-oceanos-y-playas,
> construye-monta-as. Todo el interface al estilo videojuego minecraft o mejor. El jugador tendría
> que poder llamar a esos snippets sin saber lo que son, basta con elegir la ficha que le guste por
> la imagen y la descripcion que muestra, desde una UX atractiva. Esas fichas ejecutan los snippets y
> muestran fotos, idealmente proporciones telefono movil, yo haria esas capturas/fotos, con un
> carrusel, que se vean por lo menos 4 en pantalla a la vez, para elegir con cual desea empezar; asi
> no parte de un entorno vacio sin configurar. Al final de esa lista/carrusel se le daria la opcion
> de "solo terreno base", para eso se puede ejecutar el snippet "reset-map", y por ultimo "mapa
> vacio", que es como sale ahora. Se le dara tambien la opcion de personalizarlo antes de su
> generacion: poder elegir en el tamaño del terreno dentro de unos limites, ambientación y efectos
> atmosfericos por ejemplo.

## Lo que se comprobó en el código antes de abrirlo

### Los cinco generadores existen y **se autoejecutan**

En `data/snippets/`, con estos nombres exactos:

| fichero | `name` |
|---|---|
| `construye-badlands.json` | Construye BadLands |
| `construye-fortnite-chapter-2-island.json` | — |
| `construye-fornite-tilted-towers.json` | — |
| `construye-oceanos-y-playas.json` | Construye Oceanos y Playas |
| `construye-monta-as.json` | Construye Montañas |

⚠️ **Los nombres se copian tal cual**: es `fornite` (sin `t`) en tilted-towers y `monta-as` (la `ñ`
se comió el nombre del fichero). Hay dos más que no nombró: `construye-casa` y `construye-esfera`.

**No son librerías**: cada uno define su `buildX(...)`, **se llama a sí mismo al final** del código y
remata con `game.snippet("nubes-altas")`. Así que «el jugador puede llamarlos sin saber lo que son»
ya funciona hoy: `game.snippet("construye-badlands")` construye el mapa.

### «Personalizar antes de generar» ya es un parámetro

La firma es `buildX(originX, originY, originZ, options)` y `options` ya trae `mapWidth`,
`mapHeight`, `mapDepth` (defectos entre 128 y 512) además de materiales y cotas (`waterMat`,
`leafMat`, `seaLevel`, `snowLine`…). El selector de tamaño es **exponer lo que ya se le pasa**.

Para ambiente y efectos atmosféricos el vocabulario también está hecho (ver REQ-ART1 en `PLAN.md`):
`game.entorno("TORMENTA"|"ATARDECER"|"NOCHE", …)`, `game.efectos.lluvia.enciende()`,
`game.efectos.estrellas`, `game.interiorDark`, `game.glowLevel`, `game.reflejoEntorno`.

Y `game.resizeWorld(x, y, z)` existe (`web/app.js:23862`; acepta `"128x40x128"`).

### Los tres agujeros de verdad

1. **`/api/mundos/crear` ignora la plantilla.** `server.py:2037` escribe `dict(DEFAULT_WORLD)` —
   `{'dim': {'x':96,'y':40,'z':96}, 'voxels': {}}` (`server.py:87`). El plan lo preveía como
   `{nombre, plantilla}` (F3.2) pero `plantilla` **no está implementado**: no aparece en `server.py`.
2. ⚠️ **La cuota se cobra por 96³ y el generador redimensiona.** El chequeo de bytes usa
   `DEFAULT_WORLD['dim']` (96·40·96·2 ≈ 720 KB), y luego `construye-monta-as` hace
   `await game.resizeWorld(128,40,128)` a fuego, y los defectos de `options` llegan a 512.
   **512×40×512 ≈ 21 MB.** El límite del selector de tamaño y la cuota tienen que ser el mismo
   número, o la cuota es decorativa.
3. **Cuándo corre, y una sola vez.** Los `construye-*` empiezan por `game.wipeMap()`. Colgarlos del
   autoarranque `mundo-<slug>` **rearrasaría el mundo en cada entrada**, borrando lo construido —
   que es justo el aviso de F3.5 sobre los `mundo-<mapa>` que construyen al entrar. La plantilla es
   **acto de nacimiento**: corre una vez, se guarda, no se vuelve a mirar.

### Dónde se asocian las fotos y los textos de la ficha

Segunda petición del dueño, verbatim:

> podria haber metadatos en esos snippets para indicar la foto, el titulo de la ficha, una
> descripcion, etc

**Se puede, pero hoy se perdería en silencio.** Comprobado en `server.py`:

- `POST /api/snippets` (`server.py:2155`) **no guarda lo que le mandas**: arma `rec` de cero con una
  lista blanca — `{id, name, code, savedAt}`, más `categoria` si viene (`:2164`) — y **descarta todo
  campo desconocido**. Guardar el generador desde el botón del editor borraría la ficha.
- Ya hay precedente de las dos cosas que hacen falta: **`categoria`** es un campo de metadatos que sí
  sobrevive, y **`protegido`** es *pegajoso* — si el fichero ya lo llevaba y quien guarda no dice
  nada, se conserva (`:2168-2179`), con el motivo escrito al lado: «*una marca que se cae sola no
  protege de nada*». Es el mismo riesgo, y ya está resuelto ahí mismo.
- `list_snips()` **también es lista blanca** (`id`, `name`, `categoria`, `lines`, `savedAt`,
  `protegido`). Sin ampliarla, el carrusel tendría que pedir los siete generadores enteros sólo para
  leer un título y una foto.

Lo que hay que hacer para que la idea funcione, todo en `server.py` (⇒ **no roza `app.js`**):

1. Ampliar la lista blanca del POST con los campos de ficha y hacerlos **pegajosos** como
   `protegido`.
2. Ampliar `list_snips()` con esos campos, para que el carrusel sea una sola petición.

⛔ **La foto va por referencia, no dentro del snippet.** `/api/snippets` tiene tope de **2 MB** de
cuerpo (`server.py:1049`) y el código de `mundo-autoarranque` ya son 300 KB: base64 dentro revienta
el tope y engorda un fichero que se lee en cada arranque. El campo guarda la **ruta**; las imágenes
ya tienen su sitio en `data/fotos/`, con miniatura en `data/fotos/mini/<id>.png`.

⛔ Para ponerles los metadatos a los cinco generadores existentes: **se parchean** con
`herramientas/parche_snp_*.py` (idempotente, ancla única), no se reescriben — hay 2 copias vivas — y
se publican **sólo** por `POST /api/snippets`.

**Alternativa** (descartable, pero que quede escrita): un catálogo aparte al estilo
`data/ui/ranuras.json` no toca `server.py` ni los generadores, pero separa la ficha de lo que
describe y obliga a acordarse de dos sitios al añadir un bioma.

### El cierre del carrusel

Decidido por el dueño el 2026-09-02: **`reset-map` no se usa y no se toca** (mejor: no hay que
parchear un snippet publicado ni lidiar con sus dos copias vivas, y desaparece su `confirm()`).

- **«mapa vacío»** → **no se ejecuta nada**. Es lo que hace hoy `/api/mundos/crear`.
- **«solo terreno base»** → **`game.buildTerrain()` a pelo**, sin snippet.

⚠️ **Sin argumentos, y esto importa.** `game.buildTerrain(true)` (o `{reset:true}`) llama a
`mcGenFlat()`, que es **un mundo nuevo de 96×40×96 escrito a fuego** (`web/app.js:21699-21705`):
desharía en silencio el tamaño que el jugador acabe de elegir. La rama buena es la de sin argumentos
(`web/app.js:21707`), que respeta `mc.dim` y rellena hasta `GH=14`.

✅ Comprobado que no falta paleta: `buildTerrain` exige `hierba`/`tierra`/`roca` en `mc.name2id`, y
las tres vienen siempre de la constante `MC_BLOCKS` (`web/app.js:7610`), no del documento del mundo.
Un mapa recién creado (`DEFAULT_WORLD`, sin paleta) las tiene igual.

---

## Decisiones del dueño (2026-09-02)

| # | decidido |
|---|---|
| 1 | El asistente vive en **`web/mapas.html`** (donde ya está el botón Crear). No roza `app.js`. |
| 2 | El `mundo-<slug>` de ambientación es **a nivel de usuario**, y el dueño puede verlos en el gestor |
| 3 | Si se corta la generación, **no se deja a medias** |
| 4 | Tamaño máximo **128**, y el límite debe poder subirse **por perfil** desde el panel |
| 5 | **4 fichas a la vez**, una por plantilla |
| 6 | Fotos: **marcador** ahora, las capturas las hace el dueño después |
| 7 | `construye-casa` y `construye-esfera` **fuera**: no son biomas |
| 8 | **Todo de una**, no por etapas |

### ⚠️ Cómo se cumple el 2 sin romper el candado de F-E

`snippet.crear_propio` **nace apagado para todos** y está bajo candado explícito
(`FE_PERMISO_BAJO_CANDADO`, `servidor/sesion.py:86`), y `POST /api/snippets` exige
`snippet.editar_sistema`, que es sólo del dueño (`server.py:174`). Un jugador **no puede** publicar
un snippet, y así debe seguir: es el invariante del dueño — *«la cuenta de administrador/dueño no
tendría que poder ser nunca robada por un jugador que lance un snippet»*.

Solución: **el `mundo-<slug>` lo escribe el servidor** a partir de una **lista cerrada** de opciones
(ambiente ∈ día/atardecer/noche/tormenta, efectos ∈ lluvia/estrellas/niebla). El jugador elige
botones, **nunca escribe código**. El snippet queda a su nombre y el dueño lo ve en el gestor. Es la
opción **D** del estudio `docs/codigo-de-usuario.md` («lista cerrada en vez de JS»), aplicada a un
caso concreto. **No hay que conceder ningún permiso nuevo.**

⚠️ Al borrar el mapa hay que llevarse su `mundo-<slug>`: el prefijo `mundo-` está en
`SNIPS_PREFIJOS_PROTEGIDOS`, así que por convención nace **imborrable** y quedaría huérfano.

## Encaje

Depende de F3.2 (crear con permiso y cuota, ya hecho) y se entra desde la portada / selector
(F5.1-F5.2). Los generadores llaman a `nubes-altas`, así que quedan **en uso** para F2.1.

## Punto de partida

- `server.py:87` (`DEFAULT_WORLD`), `:2003-2039` (`/api/mundos/crear`, cuota y bytes).
- `data/snippets/construye-*.json`, `data/snippets/reset-map.json`.
- `web/app.js:23862` (`game.resizeWorld`), `web/mapas.html` (selector), `web/menu.html` (portada).
- ⛔ Ley de oro: lo que sea motor, primero por parcheo en caliente.
