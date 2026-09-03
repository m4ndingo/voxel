# Cuentas, permisos y propiedad de los mapas

Lo que hace falta saber **antes de tocar `server.py`** desde que el juego se puede publicar
(plan «cerrar VoxelForge para el multiverso», 2026-08-31 → 2026-09-01). Antes de esto no había *ni
una* comprobación de seguridad: `POST /api/snippets` era anónimo, y ese snippet lo baja
`mcAutoarranque()` y lo pasa por `new AsyncFunction(code)` **en ámbito global, en el navegador de
cada visitante y en todos los mapas**. Un `curl` valía por ejecución de JS persistente para todos.

---

## 🔑 La regla que resuelve casi todas las dudas

> **El permiso se decide en `server.py`. Nunca en el navegador, nunca en el árbitro del 8510.**

Quien escribe en `data/worlds/` es `POST /api/mundo/edits`, y a eso lo llama un `curl` sin pasar por
el multijugador. **El cliente esconde; el servidor prohíbe**: esconder un botón es cosmética (F12 la
deshace), así que todo lo escondido tiene que devolver 403 si se pide a pelo.

## El interruptor: `VOXELFORGE_PUBLICO=1`

⚠️ **ENCIENDE** el modo estricto, no lo apaga — un despliegue olvidadizo se publica seguro. En
desarrollo **no cambia nada**: los tests de siempre y los ~90 `parche_snp_*.py` hacen POST anónimos y
siguen funcionando porque sin token `_es_dueno()` es True para todos.

Por eso **un test de permisos no vale contra el 8500**: hay que levantar servidor propio en otro
puerto con `VOXELFORGE_PUBLICO=1`. Modelo a copiar: `tests/test_permisos_api.js`.

⛔ En público **no arranca sin `VOXELFORGE_SECRETO_SESION`**. Con un secreto improvisado en memoria
las cookies se caerían en cada reinicio y, peor, el árbitro del multijugador firma con **el mismo**
secreto desde otro proceso: dos secretos distintos y los vales dejan de valer sin que nada lo diga.

Variables de entorno que desvían estado (**las usan los tests, y hay que ponerlas TODAS** o el test
escribe en el repo de verdad): `VOXELFORGE_USUARIOS`, `VOXELFORGE_PERFILES`,
`VOXELFORGE_MUNDOS_META`, `VOXELFORGE_REGISTRO`. ⚠️ `data/worlds/` **no se puede desviar** (`WORLDS`
cuelga de `BASE`): un test que cree mapas los llama `zz-test-*` y los recoge en un `finally`.

## Identidad — `servidor/sesion.py`

- **Cookie firmada, sin almacén de sesiones**: `vf_sid = uid.gen.caduca.hmac_sha256[:32]`.
  Sobrevive a los reinicios de `server.py` (que son constantes) y no hay estado que sincronizar con
  el árbitro. **Revocar = subir `gen`** en la cuenta.
- Contraseñas con `hashlib.scrypt` (stdlib, sin dependencias) y `hmac.compare_digest`.
- **Registro abierto pero en cuarentena**: quien se da de alta nace con el perfil más bajo.
- **Permiso efectivo = perfil + `permisos_mas` − `permisos_menos`**. Los perfiles son **dato**
  (`data/perfiles/<nombre>.json`), no código, y además se ajusta **cuenta por cuenta**: es lo que
  pidió el dueño («una cuenta concreta podría crear snippets propios pero no modificar otros»).
  ⛔ **`snippet.crear_propio` nace apagado para todos, y además está BAJO CANDADO**: un snippet
  corre en ámbito global y mismo origen, así que darlo hoy sería regalar la cuenta del dueño. Desde
  el 2026-09-02 no es una costumbre sino una regla — `sesion.FE_CODIGO_DE_USUARIO_DECIDIDO` +
  `panel._candado_fe` hacen que el panel devuelva **400** si se intenta dar por cualquiera de sus
  tres puertas (`permisos_mas`, perfil nuevo, o mudar la cuenta a un perfil que lo lleve). El
  dueño queda exento a propósito. La decisión y **qué hace falta para levantarlo** →
  [`codigo-de-usuario.md`](codigo-de-usuario.md) (F-E).
- ⚠️ **`quien()` cachea en `self`, y con keep-alive un handler sirve MUCHAS peticiones.** Todo lo
  que sea «de esta petición» se borra en `handle_one_request`. Se olvidó con `_quien` y no era
  teórico: en el navegador —que siempre reaprovecha la conexión— entrar no surtía efecto, y salir
  tampoco. Ningún test lo veía porque Node 18 abre una conexión por petición; hace falta un
  `http.Agent({keepAlive:true})` (`test_permisos_api.js §10`).

## Las DOS puertas en serie de cada escritura

Hacen falta las dos, y quien quite una deja la otra coja:

1. **`PERMISO_POR_RUTA`** (`server.py`) — ¿puede esta persona editar mapas *en general*?
   Deny-by-default: gana el **prefijo más largo**, y lo que no esté listado exige el token del dueño.
   La 4ª columna son los **métodos**: borrar no es editar, y sin ella un `DELETE` caía en la fila de
   `mundo.editar_propio` y hacían falta *los dos* permisos para una acción. *Un panel donde el dueño
   reparte permisos, y en el que el permiso «borrar» no basta para borrar, es un panel que miente.*
2. **`_mundo_ok(escribir=)`** — ¿puede escribir en **este** mapa? Es `data/mundos_meta/`.

## Propiedad de los mapas — `servidor/mundos_meta.py`

Registro **LATERAL**, no `@usuario/` en la ruta: el slug es la clave de medio motor (`world_file_for`,
`mundos.listar()`, `data/_thumbs/<slug>.json`, `mcMapName()`, la convención `mundo-<mapa>` y las URL
escritas en medio repo y en la wiki). Con el registro al lado, el «espacio de nombres por usuario» es
**de presentación** y cuesta cero; el precio es que los nombres son **globales**, y eso se paga en
`nombre_libre()`, que propone `castillo-2`.

⚠️ **Un mundo sin registro hereda `HEREDADO`: oculto y de solo lectura.** Es lo que pidió el dueño
para sus 33 mapas y además es la postura segura — si mañana aparece un mundo por un camino que nadie
previó, nace cerrado. Abrirlos uno a uno es trabajo del panel (F9), no de quien acierte el nombre.

Las dos distinciones que **cuesta caro** romper (guardián `tests/test_mundos_propiedad.js`):

- **`enlace` NO es `publico`.** Con enlace se **entra** pero no se **encuentra**: `puede_ver` dice sí,
  `sale_en_listados` dice no. Si un día `sale_en_listados` empieza a devolver True para `enlace`,
  todos los mapas «solo para mis amigos» quedan en el escaparate y nadie se entera.
- **Un mapa que no se puede ver contesta 404, no 403.** Un 403 confirmaría que existe, y «qué mapas
  privados tiene ese» no es asunto de nadie. Cuando ya ha demostrado que puede *ver*, entonces sí 403.

`PATCH /api/mundos/<slug>` (el autor elige) toca **campo a campo y solo los que vienen**: rearmar el
registro entero borraría `dueno` y `creado` en cuanto alguien mandase solo `codigo`. Se invita **por
nombre** (lo que uno sabe de sus amigos) y se guarda **por uid** (lo que no cambia al renombrarse), y
`destacado` es solo del dueño del servidor: la portada no es una propiedad del mapa.

### Entrar con invitación ya enciende el multijugador (F5.6b)

El vale daba **permiso** y no daba **compañía**: `server.py` dejaba escribir al que llegaba con
`?invita=<vale>` y el árbitro sabía aceptar ese mismo vale, pero **en el navegador no había quien
arrancase el cliente**. `multi-verse` se conecta solo en cuanto se carga (acaba en
`tomaValeDeLaUrl(); entra();`) y **hasta hoy solo lo cargaba el autoarranque del mapa `multiverse`**.
En cualquier otro mapa el invitado abría el enlace, podía construir… y no veía a nadie ni nadie le
veía. Eso es peor que un error: **parece que funciona**.

Lo tapa `data/snippets/invitacion-multi.json`, enganchado desde `mundo-autoarranque` —el único
snippet que corre en **todos** los mapas, que es justo el requisito: se puede invitar a cualquiera de
ellos, no solo a `multiverse`. Se engancha con `herramientas/parche_snp_invitacion_multi.py`
(idempotente, por ancla), y `app.js` no se toca: es agnóstico y así sigue.

**Dos disparadores, y ninguno más**, para no conectar a quien no lo pidió:

1. la URL trae `?invita=` → me han invitado a **este** mapa;
2. hay **relevo** fresco (`vf_multi_relevo` en sessionStorage, < 3 min) → venía jugando y acabo de
   saltar de mundo con `game.multi.join(...)`. Ese relevo lo dejaba `multi-verse` y su comentario
   decía que lo recogía `mundo-autoarranque`, **pero no lo recogía nadie**: saltar de mundo te dejaba
   desconectado al otro lado. El relevo se consume siempre que se mira, fresco o rancio, o una
   recarga de esa pestaña te reconectaría sola.

Sin ninguno de los dos se rinde en silencio, así que en los mapas de siempre no cambia nada. Y va con
`.catch()` y sin `await`, como `sesion-guardia`: que falle el multijugador no puede impedir entrar al
Mundo.

> ⚠️ **En desarrollo, el árbitro se arranca a mano y suele quedarse sin
> `VOXELFORGE_SECRETO_SESION`.** Cuando le falta, `sesion.secreto()` **le improvisa uno volátil por
> proceso**, distinto del que usa `server.py` ⇒ **ningún vale verifica** y el socket se cierra con
> `secreto malo` en `multi/servidor.log`. Es exactamente la trampa que avisa la cabecera de este
> documento, y no se nota: el enlace, el permiso y el cliente están todos bien. Arráncalo con el
> mismo entorno que el 8500 (`set -a; . /root/voxelforge.env; set +a`). En producción esto no pasa:
> las tres unidades comparten `/etc/voxelforge.env` a propósito.

## Cuotas

Mapas y **bytes**, las dos **comprobadas antes de escribir** — es la única forma de que sirvan.
El gasto se mide **en disco** (`os.path.getsize` de `<slug>.json` + `<slug>.vox`), no con un contador
guardado: un contador se desincroniza el primer día y entonces miente en la dirección peor, dejando
pasar. El sitio donde un mapa **engorda** es `POST /api/mundo` (trae su `dim`), no `/edits` (escribe
dos bytes en una celda que ya existe); y el coste se calcula de la **dimensión pedida**, porque los
voxels vienen dispersos y un JSON de 4 KB puede pedir una rejilla de 3 GB.

⚠️ Los bytes se le apuntan **al dueño del mapa**, no a quien escribe: un mapa con la escritura
abierta lo agranda cualquiera, y cobrárselo al visitante lo dejaría sin sitio en sus propios mapas.

## Propiedad de los habitantes (REQ-ASSET1) — `servidor/autoria.py`

Lo contrario que los mapas: aquí el dueño **viaja dentro del documento**, no en un registro lateral.
Un mapa son **dos** ficheros que ya se tocan con cerrojo; un habitante es **uno** y ya se reescribe
entero en cada guardado, así que meterlo dentro sale gratis y no puede desincronizarse.

Tres estados, y «del mundo» es el **tercero**, no la ausencia de dueño:

| | quién lo ve | quién lo escribe |
|---|---|---|
| `autor: "<uid>"` | sólo esa persona | sólo esa persona |
| `compartido: true` | todos | su autor — que sea del mundo **no** lo hace de todos |
| sin `autor` (heredado) | según `compartido` | sólo el dueño del servidor |

⚠️ **El autor no se copia de lo que llega.** El editor manda el documento entero en cada guardado:
hacerle caso a `doc.autor` sería regalar la autoría a quien mande un `curl`. Manda el fichero que hay
en disco — el mismo cuidado que con `createdAt`.

⚠️ **El id es el nombre en slug**, así que dos personas que llamen «casa» a su dibujo van al mismo
fichero. Eso es un **409** («ponle otro nombre»), nunca una sobrescritura callada.

⚠️ **El filtro va en el listado Y en `GET /api/habitantes/<id>`.** Sólo en el listado sería
cosmética: bastaría con acertar el id. Es la regla 2 de arriba, otra vez.

⚠️ **Heredado no quiere decir invisible.** 17 de los 26 que había están estampados dentro de mundos y
snippets (`hab:seta`, `hab:mesa-x2`…): esconderlos abriría esos mapas **con agujeros**.
`herramientas/adopta_habitantes.py` marca `compartido` en los que **alguien referencia** —calculado,
no una lista a mano— y deja privados los dibujos sueltos.

Guardián `tests/test_autoria_habitantes.js`, con **dos** cuentas (con una sola no se distingue «no ve
lo ajeno» de «no ve nada»). Usa `VOXELFORGE_HABITANTES` para no ensuciar la galería del dueño.

## Integridad: «está en uso, no se borra»

Cuatro reglas, y basta con que una diga que no (`esta_protegido` + `mundos_que_usan`):

1. la lista de piezas del motor · 2. la **convención de nombre** (`mundo-`, `arranque-`, `redstone`),
que es la única que ve lo que el motor arranca **solo, por nombre calculado** · 3. la marca
`"protegido": true` **dentro del fichero** (viaja con él y sobrevive a un `git pull`) · 4. **quién lo
llama**, calculado al borrar — la que no se puede escribir en ninguna lista.

- La marca es **PEGAJOSA**: republicar sin mencionarla no la quita, o el botón «guardar» del editor
  desprotegería la pieza en silencio. Quitarla se pide en voz alta (`protegido: false`).
- **Mencionar no es llamar.** Si una palabra en un comentario bloquease el borrado, el aviso sería
  ruido y se acabaría ignorando, que es como mueren estas protecciones.
- «¿Quién usa este asset?» se responde leyendo **solo las cabeceras `.json`** de los mundos (5 ms en
  los 33), nunca un `.vox` ni un `.vox.json`.
- **La papelera de autoría (`data/papelera/`) NO se poda.** El origen de todo esto es que
  `particulas-voxel` se borró de verdad: cayó en `habitantes_trash/`, llegaron 30 borrados más y la
  poda se lo llevó. ⚠️ La distinción no es *qué* fichero es, sino *qué está pasando*: `move=True` es
  un borrado (raro, kilobytes, se guarda para siempre) y `move=False` es el respaldo de antes de
  sobrescribir (pasa en cada guardado, y ese sí se poda).

## La cortina (F4): esconder lo que no se puede usar

La cerradura es lo de arriba. Esto es lo otro — no enseñarle a un invitado una puerta que no puede
abrir — y son **tres piezas que se rompen por separado** (guardián `tests/test_roles_ui.js`):

1. `web/index.html` pregunta `GET /api/yo` y deja `<html data-puede="…">`.
2. `web/style.css` esconde `[data-solo-si=<permiso>]` mientras ese permiso no esté en la lista.
3. el snippet `sesion-guardia` tapa los **atajos** (Alt+C, Alt+D, Alt+A), lo único que el CSS no
   puede hacer. Lo enganchan los dos autoarranques vía `herramientas/parche_snp_guardia.py`.

Cuatro decisiones que cuesta caro deshacer:

- ⚠️ **Nace escondido y el permiso lo DESTAPA**, nunca al revés. El CSS llega con el documento y un
  snippet llega después de bajarlo: si escondiera el snippet habría medio segundo —en una máquina
  lenta, bastante más— con el panel de Código a la vista. Es el mismo «fallar hacia cerrado» de
  `VOXELFORGE_PUBLICO`, y es lo que evita tocar `app.js` (que era la otra salida del plan).
- **Por PERMISO, no por rol.** Un `data-rol="dueno"` quemado en el CSS haría mentir al panel de F9 el
  día que reparta `snippet.editar_sistema` a una cuenta suelta, que es justo lo que pidió el dueño.
  Precio: CSS no sabe cruzar dos atributos ⇒ **una regla por permiso**; un `data-solo-si` nuevo lleva
  su línea en `style.css`.
- **La pregunta va en la PÁGINA, no en un snippet.** `?noauto=1` existe para arreglar un autoarranque
  roto desde el panel Código; si el panel se destapara desde el autoarranque, ese rescate se quedaría
  sin panel. Y la promesa se deja en `window.vfYo` para no preguntar dos veces.
- **«No se sabe» no es «no puede».** Si `/api/yo` falla, el CSS deja todo escondido (cosmética, lado
  seguro) pero los atajos se quedan **como estaban**: dejar sin Alt+C al dueño por un parpadeo de red
  es un destrozo, y el invitado al que se le colase abriría un panel que el CSS sigue tapando y cuyo
  guardado contesta 403.

`sesion-guardia` no envuelve nada: el manejador del editor es un `keydown` en `window`
(`app.js:3877`), así que basta con otro **en captura** sobre el mismo `window` y un
`stopImmediatePropagation()`. No hay `fn._orig` que guardar y `off()` es un `removeEventListener` ⇒
el motor queda byte a byte. El estado vive en `game.guardia` y ⛔ nunca en el ámbito de la ejecución,
o la segunda pasada no encontraría el manejador de la primera y los apilaría.

## La chapa de identidad — `web/quien.js`

Petición del dueño: «*hay que poner algo en el editor 2d/3d y básicamente en todas las pantallas,
menos en las del mapa, para saber con qué usuario se está logueado o si es el dueño con el token de
diseñador*». Es un fichero suelto que se incluye en las seis pantallas (`index`, `menu`, `mapas`,
`panel`, `fotos`, `videos`), se trae su propio CSS y sólo lee `GET /api/yo`. Guardián
`tests/test_chapa_identidad.js`. Tres cosas que cuesta caro romper:

- ⛔ **`/map/<slug>` no lleva chapa; `/map` sí.** Los dos salen del **mismo** `index.html`
  (`server.py`: `/map` y `/map/` → `mapas.html`, `/map/<algo>` → `index.html`), así que no basta con
  no incluir el script: quien decide es una regex dentro de `quien.js`. `^/map(/|$)` — la primera
  versión — apagaba la chapa en el selector de mundos. También se calla dentro de un iframe
  (`window.top !== window.self`), o se vería flotando sobre las pantallas-escaparate del OSD.
- **Dice CÓMO eres el dueño, no sólo que lo eres**: por eso `/api/yo` devuelve `via`
  (`_via_dueno`, `server.py`) con `token` · `galleta` (modo diseño, F5.8) · `desarrollo`. El tercero
  es el que engaña: sin `VOXELFORGE_TOKEN` configurado `_es_dueno()` le dice que sí a **cualquiera**,
  y una chapa que pusiera «dueño» ahí haría creer que hay una sesión que no existe.
- **Va DENTRO de la cabecera, no flotando.** Flotando abajo a la izquierda se comía un botón de la
  paleta de herramientas del editor (`BUTTON.tool`, cazado con `elementsFromPoint`, que es la única
  forma de verlo — en una captura no se nota). Cabecera flex → un hijo más con `margin-left:auto`;
  cabecera de bloque → absoluta arriba a la derecha dentro de ella; sin cabecera (`menu.html`) →
  flotando, que ahí el hueco está libre. El guardián comprueba los cinco puntos de la chapa contra
  lo que haya debajo.

⚠️ El enlace de «entrar» apunta a **`/menu.html`**, con extensión: `/menu` a secas es un 404 —
`server.py` enruta `/panel`, `/map`, `/fotos` y `/videos`, pero la portada no tiene ruta corta (a
quien no es dueño se la sirve `/`). Un enlace roto en la chapa no da error en ninguna parte: sólo no
pasa nada al pulsarlo, y por eso el guardián lo pide y mira el código.

## ⚠️ Contestar no es parar

El fallo de forma que ya ha salido **tres veces** en este código (`_cuerpo_cabe`, `_en_uso_o_409`,
`_lleno_o_409`): `self._send(...)` devuelve `None`, así que

```python
if self._en_uso_o_409(...):   # ← con `return self._send(...)` dentro, esto es SIEMPRE falso
```

manda el 409 por el socket **y sigue adelante igualmente**. El cliente ve un 409 perfecto y el
fichero ya no está. Los ayudantes de este tipo devuelven **booleano explícito**, y quien llama hace
`if ...: return`.

## Registro de accesos (F7.3) — `servidor/registro.py`

`log_message` era `pass`: el servidor **no apuntaba nada**, ni siquiera los errores. Ahora una línea
por petición que importe (`fecha ip uid método ruta código ms`), con `RotatingFileHandler` de 5 MB × 5
— un registro que llena el disco *es* el incidente.

- Se apunta lo que **cambia algo o falla**: todo lo que no sea GET, todo `/api/`, las visitas a
  `/map/` y cualquier código ≥ 400. Los cien GET estáticos de una carga del Mundo **no**: no
  informarían, esconderían, y rotarían el fichero cada dos visitas justo cuando hacía falta mirar.
- ⛔ **Nunca el cuerpo** (por ahí van las contraseñas), **nunca la cookie** (es la sesión entera: quien
  leyera el registro entraría como cualquiera de los que salen en él), y **la query con las llaves
  tachadas** (`codigo`, `invita`, `token`, `clave`, `vale`). Un parámetro nuevo que sea una llave se
  añade a `TACHAR`; lo recuerda `tests/test_registro.js`.
- `log_error` **guarda el motivo, no escribe**: `send_error` llama a `log_error` y *después* a
  `send_response`, así que escribir en los dos sitios daba dos líneas por cada 404.

## Encenderlo en una máquina de verdad (F7.1/F7.2) → [`despliegue/LEEME.md`](../despliegue/LEEME.md)

Todo lo de arriba **no sirve de nada si `VOXELFORGE_PUBLICO=1` no llega al proceso**, que es el fallo
de despliegue más fácil de cometer y el que menos se nota: el servidor arranca igual y se comporta
como en desarrollo. Las unidades de `systemd`, el fichero de entorno con los secretos, la copia
nocturna y **la comprobación de que el modo público está de verdad puesto** viven en
[`despliegue/`](../despliegue/), un fichero por unidad y el porqué escrito dentro de cada uno.

Lo que conviene saber sin abrirlo:

- **Tres unidades comparten `/etc/voxelforge.env`** a propósito: `voxelforge` (8500),
  `voxelforge-multi` (8510) y `voxelforge-copia`. Un secreto en dos ficheros es un secreto que algún
  día se rota en uno solo, y entonces los vales dejan de valer sin que nada lo diga.
- ⚠️ **`POST /api/snippets` no funciona en producción**: `ReadOnlyPaths=…/data/snippets` cierra la
  carpeta *dentro* de lo que se abre para escribir. Es el cinturón sobre el tirante de F0.4 — quien
  escriba ahí ejecuta JavaScript en la sesión de todos los visitantes, y así ni un fallo del permiso
  basta. Los snippets se publican en desarrollo y viajan con el repo.
- ⚠️ **El árbitro todavía firma con su propio secreto** (`VOXEL_MULTI_SECRETO`), no con
  `VOXELFORGE_SECRETO_SESION`. Hasta F6.2, quien tenga ese secreto entra a cualquier mapa. Lo que sí
  está cerrado ya: el árbitro **no puede escribir en `data/worlds/`** (solo en `data/multi/`), y quien
  escribe —el 8500— sí mira permisos.
- **Una copia sin restauración probada no es una copia**: el simulacro (`--restaurar … --a` una
  carpeta vacía) está en el LEEME y es el criterio de cierre nº 6 del plan.
