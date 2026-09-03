# El servidor y sus APIs

**Movido verbatim desde `CLAUDE.md` el 2026-08-13**, cuando se le puso tope de 15 KB: el índice se
paga en cada turno y esto solo hace falta cuando se toca `server.py` o una pantalla del sitio.
⚠️ Tras tocar `server.py` hay que **reiniciarlo** (`python3 server.py 8500`) o los endpoints nuevos
dan 404. Las rutas de fichero que se citan abajo son de antes de la mudanza del sitio a `web/`.

⛔ **Quién puede llamar a cada una de estas APIs es otro documento**, y hay que leerlo antes de
añadir un endpoint que escriba: [`docs/cuentas-y-permisos.md`](cuentas-y-permisos.md) (cuentas,
perfiles, la tabla `PERMISO_POR_RUTA`, propiedad y visibilidad de los mapas, cuotas y el registro de
accesos). Lo de aquí abajo describe el **qué**; aquello, el **quién**.

---

## Qué es

**VoxelForge** — editor de assets **voxel** que ha crecido hasta tener un **Mundo** jugable. Son dos
mitades que comparten formato y conviven en `app.js`:

- **El editor** (`/`): se dibuja un objeto voxel (habitante, habitación, pieza) por capas o en 3D
  libre, y se guarda en la galería del servidor. Es de donde arrancó el proyecto.
- **El Mundo** (`/map/<nombre>`): un mundo de bloques en **WebGL crudo, sin three.js**, con chunks
  mallados, luz y sombras, física de jugador, agentes articulados, redstone y scripting por
  snippets. Es donde está hoy casi todo el trabajo.

⚠️ Partes de la documentación hablan todavía del proyecto como «un MVP de una sola pantalla con el
resto mockeado». Eso quedó atrás: las pestañas Habitantes / Habitaciones / Mapa son reales.

Front **sin build ni dependencias** (HTML/CSS/JS vanilla). Backend mínimo en Python:

```bash
python3 server.py 8500              # sirve el sitio + API de habitantes (0.0.0.0:8500)
python3 server.py --help            # banderas Y variables de entorno, con sus defectos
#   (solo estático, sin guardar: python3 -m http.server 8500)

# Con la llave del dueño y el resto de secretos, que viven FUERA del repo (600, en /root):
set -a; . /root/voxelforge.env; set +a; nohup python3 server.py 8500 > /tmp/srv8500.log 2>&1 &
# ⚠️ ese fichero trae VOXELFORGE_PUBLICO=1 ⇒ arranca en MODO PÚBLICO (escribir exige identidad,
#    /data/ cerrado, topes y freno por IP, «/» pasa a ser el menú). Los tests y los
#    parche_snp_*.py hacen POST anónimos y ahí reciben 401. Para tener la llave con las reglas
#    de desarrollo, se vacía la variable en la propia línea:
set -a; . /root/voxelforge.env; set +a; VOXELFORGE_PUBLICO= nohup python3 server.py 8500 > /tmp/srv8500.log 2>&1 &

head -3 /tmp/srv8500.log        # el saludo dice el modo, si hay token y dónde va el registro
curl -s localhost:8500/api/yo   # {"publico": true|false, …}
pkill -f 'server.py 8500'       # pararlo
```

⛔ **Sin `VOXELFORGE_TOKEN`, en desarrollo todo el mundo es el dueño.** La llave se pasa por
`--token`, pero lo permanente es la variable: un `--token` se lee en `ps aux`.
`--help` es la fuente de verdad de qué variables hay (`VOXELFORGE_SECRETO_SESION`,
`VOXELFORGE_REGISTRO`, los topes de escritura…); un argumento que no entienda lo **dice** por
`stderr` en vez de tragárselo, que era como un `--tokne` mal escrito dejaba el servidor sin llave.

**API de habitantes** (`server.py`, almacén en `data/habitantes/<id>.json`, formato vox export):
`GET /api/habitantes` (lista con metadatos), `GET /api/habitantes/<id>` (objeto completo),
`POST /api/habitantes` (guardar; body vox, `id` opcional para sobrescribir → devuelve `{id}`),
`PATCH /api/habitantes/<id>` `{name}` (renombrar), `DELETE /api/habitantes/<id>`. En el front:
**Guardar** → POST (+copia en localStorage); `serverId` recuerda el id del objeto cargado/guardado;
la pestaña **Habitantes** y el botón *Galería* abren `#hab-modal` (tarjetas con miniatura iso vía
`drawThumb`, cargar/renombrar/borrar); `refreshHabitantesList` puebla la lista lateral.

**API de mapa** (`server.py`, almacén `data/mapa.json`): `GET /api/mapa` (mapa o default 8×8 vacío),
`POST /api/mapa` (valida mínimo, respalda con `to_trash`, guarda). Modelo:
`{cols,rows,cells:{"col,row":{room:<key>|null, habs:[{ref,x,y}]}}}`; `key` = `asset:<file>` |
`hab:<id>`. Front: pestaña/overlay **Mapa** (`#mapa-modal`, `openMapa`) = rejilla `cols×rows`; clic en
celda abre selector (`openPicker`) con el catálogo de habitaciones (`buildRoomCatalog` = assets `bloque`
+ guardadas) y miniaturas `drawThumb`; colocar/cambiar/quitar autoguarda (`saveMapa`). El mapa **nunca**
escribe en `data/habitantes/`. Roadmap completo y estados en **`PLAN.md`**.

**Listado de mundos** (`mapas.html` + `mundos.py`): `GET /map/` (y `/map`) sirve `mapas.html`, un listado de
todos los mundos con miniatura y estadísticas; **`/map/<nombre>` sigue sirviendo la SPA** (el mundo por
defecto es `/map/default`, **no** `/map/`). Los datos vienen de `GET /api/mundos` → `mundos.listar()`, que lee
`data/mundo.json` + `data/worlds/*.json`. La **miniatura** es una vista cenital sin render 3D: por columna
`(x,z)` se coge el voxel más alto y se pinta con el color **real** de su material —la media de la cara
superior de su textura (`color_de_material`, resuelve `tex:asset:…` y `tex:hab:…`)—, con luz rasante del
noroeste para el relieve. NO bajar el brillo con la altura: apaga todos los colores (las setas rojas de
`lab` salían grises). En frío cuesta ~1 s (33 MB de JSON) ⇒ **cache en `data/_thumbs/<slug>.json`**
invalidada por `mtime+tamaño` (en caliente, ~1 ms). Test: `node test_mapas.js`.

**F3.6 · la miniatura NO viaja dentro del listado** (cambió el 2026-09-02). Iba como
`data:image/png;base64,` en cada fila: una respuesta que el navegador no puede cachear, ni pedir
perezosamente, ni partir — con 33 mundos ya eran megas. Ahora `fila.thumb` es **una URL**,
`GET /api/mundos/<slug>/thumb.png?v=<sello>`, servida con **`ETag` + `max-age` largo** (el sello cuelga
de la URL ⇒ ese contenido no cambia nunca; cuando el mundo cambia, cambia la URL). Dos cosas que cuestan
caras si se tocan: el `v2:` del sello **caduca las caches viejas de disco** (las de antes no guardan el
PNG suelto y `thumb.png` no tendría qué servir), y `end_headers` **solo se calla su `no-cache` si la
respuesta trae `self._cache_propia`** — dos `Cache-Control` en la misma respuesta se juntan con comas y
gana `no-cache`, así que sin esa puerta el `max-age` no cachearía nada y encima lo parecería.

**Paginar es opcional**: `GET /api/mundos` a secas sigue devolviendo **la lista entera** (es lo que
espera `mapas.html`, que busca y ordena en el navegador sin ir al servidor por cada tecla). Con
`?desde=&cuantos=` devuelve el sobre `{total, desde, cuantos, mundos}` — el total no se deduce de una
página. `cuantos` está topado a 100: sin tope, `?cuantos=999999` es pedir el listado entero fingiendo
que se pagina. La miniatura respeta el **mismo** filtro de visibilidad que el listado
(`mundos_meta.sale_en_listados`): si el mundo no sale para ti, su foto tampoco.

**F6.5 · el MANDO** (`GET /api/mundos/<slug>/mando`, solo al dueño de ese mapa) es la credencial con
la que se echa y se calla en el 8510. ⛔ **No es el vale de invitación y no puede serlo**: el vale
viaja en la URL y se comparte a propósito, así que autorizar con él sería darle a cada invitado el
poder de echar a quien le invitó. Los dos salen del mismo `VOXELFORGE_SECRETO_SESION` y lo único que
los separa es el propósito dentro de la firma (`mando.` vs `vale.`, ver `servidor/vales.py`); el
mando **no aparece en ninguna URL** y dura horas, no días. La existencia del mundo se mira **en el
disco** y no con `mundos_meta.lee`, que para un slug inexistente devuelve una copia de `HEREDADO` y
nunca nada falso — un `if not meta` ahí es código muerto que no lo parece. Guardianes:
`tests/test_mundos_propiedad.js` §8c y `multi/probe_echa_calla.py`.

**Snippets: el id no es el nombre** (`GET|POST /api/snippets`, `data/snippets/<id>.json`). El id es la
identidad: el fichero, el argumento de `game.snippet('<id>')` y lo que el motor busca por su cuenta
(`mundo-<mapa>`, `arranque-<mapa>`, `mundo-autoarranque`, `editor-autoarranque`). El **rótulo** (`name`) es
libre. Sin `id` en el POST, el servidor lo deriva del rótulo con `slugify` (`[^a-z0-9]+`→`-`), así que
**«Mundo fornite_c2_island» se guarda en `mundo-fornite-c2-island`**: el guión bajo no sobrevive. Tres
reglas que se pagan caras (BUG-SNP5):
- **El nombre del mapa se canoniza con ESE MISMO slug en las dos puntas.** `server.py:world_file_for`
  siempre lo hizo (`/map/fornite_c2_island` → `data/worlds/fornite-c2-island.json`); `mcMapName()` ahora
  también, o el cliente pide `mundo-fornite_c2_island` —un id que el POST del editor **no puede
  escribir**— y el mapa entra sin su autoarranque, con un 404 que por diseño no se avisa.
- **El POST acota el id a `[A-Za-z0-9_-]`**, que es lo mismo que acepta la ruta de lectura
  `^/api/snippets/([A-Za-z0-9_-]+)$`. Un id fuera de ese juego se guardaría en un fichero que ningún GET
  puede volver a pedir, y como acaba en un `os.path.join`, un `../` escribiría fuera de `data/snippets/`.
  Ojo: el guión bajo **sí** cabe en un id; es el slug del rótulo el que se lo come.
- **Cambiar el id es MOVER el snippet**, no renombrarlo: el editor lo pregunta, guarda primero el nuevo y
  solo después manda el viejo a la papelera (`DELETE`), nunca al revés. Quien lo llamara por el id
  anterior deja de encontrarlo.

**Buscar dentro de los snippets** (REQ-SNP6). El listado **no trae el código** (son ~1,5 MB entre todos;
`mundo-autoarranque` solo son 300 KB), así que buscar en el cliente obligaba a bajárselos todos en cada
tecla: se busca en el servidor, con dos preguntas distintas sobre el mismo recorrido de ficheros.
- **`GET /api/snippets?q=<texto>`** — literal, sin distinguir mayúsculas, también en rótulo e id. Cada
  resultado es el item del listado + `hits`, `linea`, `muestra` (la línea recortada a 120) y `donde`
  (`codigo` | `rotulo`).
- **`GET /api/snippets?usa=<id>`** — quién referencia ese snippet, con `tipo`: **`llamada`** si se le ve
  ejecutar (`snippet(<comillas><id><comillas>)`, **sin anclar el nombre por delante**: vale
  `game.snippet('x')`, `ejecutarSnippet('x')` y `mcCorreSnippet('x',…)`) y **`mencion`** si solo aparece el
  id entrecomillado (una tabla de nombres, un comentario). La diferencia es el motivo del panel: renombrar
  rompe las dos, pero solo la primera se ve fallar. **No** se busca el id a pelo — `redstone` saldría en
  media docena de palabras que no son referencias. Las llamadas van primero; nadie se usa a sí mismo.
- **Lo que NO puede saber el servidor**: los snippets que llama **el motor por convención**
  (`mundo-autoarranque`, `editor-autoarranque`, `mundo-<mapa>`, `arranque-<mapa>`, `arranque-intro`) no
  están escritos en el código de nadie. Eso lo pone el cliente (`snipUsosDelMotor`), que es quien conoce el
  framework: «nadie llama a `mundo-badlands`» a secas sería mentira.
- Guardián: `tests/test_snippets_buscador.js` (crea sus propios `zz-test-…` y los retira siempre).

**Fotos del Mundo** (tecla **Alt+F**, el 📷 del menú ☰ de los mandos táctiles, o `await game.foto()`). `mcFoto`
compone la captura y la sube; galería en `GET /fotos` (`fotos.html`) sobre `GET /api/fotos` ·
`POST /api/fotos` `{png:<base64>, ficha}` · `DELETE /api/fotos/<id>` (a papelera). Almacén:
`data/fotos/<n>_<mapa>_<fecha>.png` + un `.json` hermano con la misma ficha en crudo (para ordenar y
volver a las coordenadas sin leer la imagen). Tres cosas que no son obvias:
- ⚠️ **La captura es SÍNCRONA justo detrás de un `mcRender()` propio.** El canvas se crea sin
  `preserveDrawingBuffer` (`app.js:5425`), así que leerlo tras un `await`, un `setTimeout` o un
  `requestAnimationFrame` devuelve **negro**. Misma regla que los tests de navegador.
- **`toDataURL` y no `toBlob`**: `toBlob` es asíncrono y sacaría la escritura del portapapeles fuera
  del gesto de teclado que la autoriza. Del mismo base64 salen el POST y el `Blob`.
- **El portapapeles es un extra que casi nunca se cumple**: `navigator.clipboard` solo existe en
  contexto seguro y el Mundo se sirve por HTTP plano, así que abierto por IP no está (y para una
  imagen no vale el apaño de `execCommand` de `mcCopyTraceText`). Por eso el camino que siempre
  funciona es el servidor, y la ficha va **quemada en el PNG** para sobrevivir a copiar y pegar.

**Hay 128 `test_*.js`** en `tests/` (ver § ARRANQUE punto 4): 112 abren un Chromium de verdad
con Playwright contra `http://localhost:8500` —compilan el GLSL, así que valen para el Mundo— y 15
son Node puro. La API también se verifica con `curl` (`/api/mapa`, `/api/habitantes`).
