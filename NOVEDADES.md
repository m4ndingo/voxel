# Qué ha cambiado en VoxelForge — informe para el dueño

**Fecha**: 2026-09-01 · **Estado**: el producto ya está *cerrado* por detrás; **todavía no está
vestido por delante**.

Esto cuenta lo hecho en las fases F0–F4 y F7 del plan de publicación. Está escrito para leerse
entero de una sentada: primero **lo que puedes hacer ahora y antes no**, luego el detalle de
*backend* e *interfaz*, y al final **lo que falta** y **un incidente de hoy que tienes que saber**.

---

## 1. En una frase

Antes, cualquiera con `curl` y tu dirección IP era administrador de tu servidor. Ahora hay
**cuentas, perfiles y permisos**, el servidor **se niega** en vez de obedecer, hay **copias
nocturnas** y **un vigilante que avisa**, y **borrar algo que está en uso ya no se puede** —
tampoco tú.

---

## 2. Lo que puedes hacer ahora y antes no

| | antes | ahora |
|---|---|---|
| **Quién eres** | no existía la idea | cuenta con usuario y clave, gestionada por el propio servidor |
| **Que entre gente** | imposible sin regalar el servidor | registro abierto; **nacen en cuarentena** (jugar y chatear, nada más) hasta que tú les subas |
| **Niveles de usuario** | no había | **5 perfiles editables como dato**, y además **ajustables cuenta por cuenta** (`permisos_mas` / `permisos_menos`) |
| **Borrar tu propio mapa** | ⛔ **no existía por API** | `DELETE /api/mundos/<slug>` — el par `.json`+`.vox` a la papelera, con cerrojo |
| **Crear un mapa** | efecto colateral de visitar una URL (mil URLs = 700 MB) | `POST /api/mundos/crear`, con permiso y **cuota** |
| **Mapas privados** | todos visibles para todos | cada mapa tiene **dueño, visibilidad** (privado / por enlace / público) y **escritura** (dueño / invitados / todos) |
| **Borrar algo en uso** | se borraba y el juego se rompía en silencio | **409 diciendo quién lo usa**, con la lista |
| **Recuperar un borrado** | la papelera podaba a los 30 | los ficheros de **autoría** van a `data/papelera/` **sin poda** |
| **Un POST enorme** | tumbaba el proceso | **413 antes de leer un solo byte** |
| **Ver `/data/`** | listado navegable: tickets, informes, 1,5 GB de papelera | **404** |
| **Escribir un snippet por `curl`** | 200, y ejecución de JS en el navegador de todos | **401 / 403** |
| **Saber qué pasó** | `log_message` era `pass`: **cero registro** | registro de accesos con método, ruta, código, uid y ms |
| **Si se rompe algo** | no había copias | copia nocturna verificada + **restauración probada** |
| **Enterarte de que se rompió** | no te enterabas | ronda cada hora; si algo va mal, la unidad se pone roja |

---

## 3. Backend — lo que se ha implementado

### F0 · El cerrojo de emergencia

- **Interruptor `VOXELFORGE_PUBLICO=1`.** En desarrollo todo sigue exactamente como siempre (los
  tests y los ~90 `parche_snp_*.py` no se enteran). El interruptor **enciende** el modo estricto: un
  despliegue olvidadizo se publica seguro, no inseguro.
- **`/data/` deja de servirse entero.** Solo `fotos`, `videos`, `ui` e `informes`. Todo lo demás, 404.
- **Tope de cuerpo por ruta**, mirando el `Content-Length` **antes** de leer: 512 KB general,
  2 MB snippets, 8 MB assets/habitantes/agentes, 4 MB los deltas de mundo, 64 MB el mundo entero.
  Un POST sin `Content-Length` se rechaza con 411 en vez de tratarse como vacío.
  ⚠️ Al rechazar **no se drena**: leerse los 512 MB que acabas de rechazar sería el mismo ataque en
  dos pasos.
- **`POST /api/snippets` deja de ser anónimo.** Es *la* bomba del plan: `mundo-autoarranque` se
  ejecuta con `new AsyncFunction()` en ámbito global en el navegador de **cada visitante de cada
  mapa**, así que un `curl` anónimo que devolviera 200 era ejecución de JavaScript arbitrario y
  persistente en la sesión de todo el mundo.
- **Límite de escrituras**: 60 por minuto y por IP (`servidor/limites.py`).
- **Cabeceras**: `nosniff`, `Referrer-Policy: same-origin`, `X-Frame-Options: SAMEORIGIN`
  (⚠️ **SAMEORIGIN y no DENY: el OSD usa iframes de mismo origen**).

### F1 · Identidad, perfiles y permisos — `servidor/sesion.py`

- **Sesión sin almacén**: cookie firmada `vf_sid = uid.gen.caduca.hmac`, `HttpOnly; SameSite=Lax`.
  Sobrevive a los reinicios de `server.py` (que son constantes) y no hay estado que sincronizar con
  el árbitro. **Revocar sesiones = subir `gen`**.
- **Cuentas** en `data/usuarios/<uid>.json`, contraseña con `hashlib.scrypt` (stdlib, **sin
  dependencias nuevas**, como pediste).
- **Perfiles como dato**, en `data/perfiles/`: `cuarentena`, `jugador`, `constructor`, `moderador`,
  `dueno`. Se escriben en disco la primera vez y **a partir de ahí mandan los ficheros**: el día que
  edites `jugador` desde el panel, el código no te lo vuelve a pisar.
- **Permiso efectivo = perfil + `permisos_mas` − `permisos_menos`.** Es literalmente lo que pediste:
  niveles configurables **y** ajuste cuenta por cuenta.
- **16 permisos** con nombre: `mundo.crear`, `mundo.editar_propio`, `mundo.editar_ajeno`,
  `mundo.borrar_propio`, `mundo.publicar`, `snippet.crear_propio`, `snippet.editar_sistema`,
  `asset.subir`, `asset.borrar`, `habitante.guardar`, `agente.editar`, `foto.subir`, `multi.entrar`,
  `multi.invitar`, `panel.usar`, `panel.perfiles`.
  ⚠️ **`snippet.crear_propio` nace apagado para todos** y así se queda hasta que se decida F-E.
- **Endpoints**: `POST /api/registro`, `/api/entrar`, `/api/salir`; `GET /api/yo`.
- **Tu token de dueño sigue funcionando igual** (`herramientas/*.py`, `multi/publica_cliente.py`,
  los tests): cookie **o** token dan rol dueño.

### F2 · «Está en uso, no se borra»

Esto **es para ti**, no para los jugadores: F1 ya impide que un jugador borre nada.

- La protección **se calcula, no se lista a mano**. Antes era un `set` de un elemento; hoy son
  **cuatro reglas** y basta con que una diga que no: lista de piezas del motor, **prefijo**
  (`mundo-`, `arranque-`, `redstone`), la marca `"protegido": true` **dentro del propio fichero**
  (así viaja con un `git pull`), y **quién lo llama** (`buscar_snips(usa=…)`), que devuelve
  **409 con la lista**.
- **Assets**: «¿qué mundos usan esto?» se responde leyendo **solo las cabeceras `.json`**, sin abrir
  un `.vox.json` (que no cabe en la ventana).
- **Papelera de verdad**: lo voluminoso se sigue podando, pero `habitantes/`, `agentes/` y
  `snippets/` van a `data/papelera/<tipo>/` **sin poda**. La regla del repo dice «nada se borra»;
  hasta hoy se borraba al borrado 31 — y así se perdió `particulas-voxel` en su día.

### F3 · Mapas: propiedad, visibilidad, cuotas

- **Registro lateral** `data/mundos_meta/<slug>.json`, **no namespace en la ruta**. Es la decisión
  cara del plan y conviene que sepas por qué: `/map/@ana/castillo` habría roto `world_file_for`,
  `mundos.listar()`, la caché de miniaturas, `mcMapName()`, la convención `mundo-<mapa>` y las URLs
  escritas en medio repo y en la wiki — semanas de trabajo y migrar 166 MB. Con el registro, «los
  mundos de cada uno» es **de presentación** y cuesta cero.
- **Tus 33 mundos actuales nacen ocultos y en solo lectura**, como pediste. No son de nadie ⇒ solo
  los toca el dueño del servidor. El panel (F9) es lo que permitirá cambiarles visibilidad,
  escritura y **código de acceso** uno a uno.
- **Cuota** de partida: 5 mapas y 100 MB por usuario, comprobada **antes** de escribir.
  `GET /api/yo` la devuelve para poder pintar «3 de 5».
- **`DELETE /api/mundos/<slug>`**, que no existía. Mueve el **par** con `voxfmt` (que sabe que el
  `.vox` es hermano del `.json` y tiene el cerrojo por ruta: puede haber alguien poniendo bloques
  ahí ahora mismo), limpia la miniatura y el registro.

### F7 · Operación

- **Cuatro unidades de systemd** en `despliegue/` (sitio, árbitro, copia, vigilancia) + plantilla de
  `/etc/voxelforge.env`. **Los secretos nunca en el repo.** Las seis pasan `systemd-analyze verify`.
  ⚠️ Son **dos servicios a propósito**: reiniciar el sitio por un `git pull` **no toca la partida**;
  reiniciar el árbitro **echa a todo el que esté jugando**.
- **Copia nocturna a las 3:30**, mundo a mundo cogiendo el cerrojo (copiar `.json` y `.vox` con el
  proceso vivo puede pillar el par a medias). Retención diaria + semanal.
  **La restauración está probada**: verifica cada mundo con `voxfmt.completo()` —la misma función con
  la que el servidor decide si un mundo sirve—, no con un `ls`.
- **Registro de accesos**: método, ruta, código, uid y ms, con rotación (5 MB × 5) y **tachando**
  `codigo`, `invita`, `token`, `clave` y `vale`. Antes `log_message` era `pass`.
- **Ronda cada hora**: disco libre, peso de `data/`, nº de mundos, que los dos puertos contesten y
  —lo que de verdad justifica el fichero— **la edad de la última copia**. Un temporizador que dejó de
  dispararse hace tres semanas no se nota hasta el día que hace falta restaurar.
  El aviso **no va por correo** a propósito: `systemctl --failed` es un buzón que no hay que
  configurar y que no se puede caer en silencio.

---

## 4. Interfaz — lo que se ha implementado

Aquí hay **menos de lo que parecerá**, y es a propósito: el orden correcto era prohibir primero y
esconder después. Lo hecho:

- **La prohibición ya está**: si `POST /api/snippets` devuelve 403, abrir el panel Alt+C por consola
  enseña código y **no puede guardar**. Eso es lo que de verdad protege.
- **La cosmética, sin tocar `app.js`** (ley de oro respetada): `web/style.css` esconde por CSS lo que
  no corresponda (`data-puede` / `data-solo-si`, 8 reglas), y el snippet **`sesion-guardia`** consulta
  `GET /api/yo` y pone el atributo. Quita del DOM las entradas de **Código** y **Agentes**,
  desengancha **Alt+C / Alt+A** envolviendo el `keydown` con `_orig` guardado, y esconde los botones
  de borrar de la galería. **`game.guardia.off()` devuelve el motor byte a byte.**
- **Por qué CSS y no JavaScript**: los paneles se pintan al cargar y un snippet los quitaría después
  — en una máquina lenta hay medio segundo en el que Alt+C existe. Cinco atributos en el HTML y una
  regla CSS lo resuelven **sin tocar el motor por medio segundo de cosmética**.

---

## 5. Lo que NO está hecho (y por qué importa)

Sé honesto contigo aquí, porque es lo que separa «cerrado» de «publicable»:

| falta | qué es | consecuencia |
|---|---|---|
| **F5** | la portada `web/menu.html`, el menú de pausa OSD, **INVITAR en un clic** | hoy invitar sigue siendo `game.multi.invita(<número>)` **por consola**. Es tu petición literal y es lo más visible |
| **F9** | `web/panel.html`, el panel del dueño | los perfiles y la visibilidad de tus mapas **se editan a mano en ficheros**, no desde una pantalla |
| **F6** | reglas de convivencia de multi, y **el vale firmado** (F6.2) | **quien tiene el secreto del árbitro entra a cualquier mapa**. Está declarado, no es una sorpresa |
| **F-E** | el estudio de `docs/codigo-de-usuario.md` | por eso `snippet.crear_propio` nace apagado. **Publicar sin resolverlo es seguro; darlo antes de resolverlo, no** |
| **F7.5/F7.6** | nginx + TLS | hoy **todo viaja en claro** y `server.py` escucha en `0.0.0.0`. Aceptable en LAN entre conocidos; **de cara a internet, no** |
| **F3.6** | paginar `/api/mundos` | no bloquea publicar; bloquea el éxito (la miniatura va en base64 dentro de la respuesta) |

De los **seis criterios de cierre** del plan: 1, 2, 3, 5 y 6 están comprobados. **El 4 depende de
F5** (crear un mapa desde el menú, invitar por enlace, construir los dos y borrarlo).

---

## 6. Lo que se ha medido, no supuesto

- **El riesgo que nadie había mirado: la cabecera del mundo con 10–20 jugadores.** Cada navegador
  guarda la cabecera entera y dos guardados a la vez son «último gana» sobre el documento completo.
  Con 2 personas convergía; con 15 **nadie lo había medido**. Ahora sí (`multi/probe_diez.py`):
  - **15 constructores, 225 piezas → 0 perdidas** (15/15 convergen).
  - **20 constructores, 400 piezas → 0 perdidas** (20/20 convergen).
  - Se ven piezas en vuelo (5,8 % y 2 %) que **se resuelven solas**: es retraso, no pérdida.
- **Los guardianes**: `29 ok, 1 fallo` en `node correr_tests.js --node`. El fallo es
  `test_bug_cut1_luz_al_cortar.js` (la luz al cortar con Ctrl+X), **anterior a todo esto y del área
  de iluminación**, que no se toca sin la Ley de la Luz.
- **Guardianes nuevos**: `test_permisos_api.js` (la matriz entera en tres identidades — es el que
  dice si se puede publicar), `test_limites_subida.js`, `test_en_uso_no_se_borra.js`,
  `test_mundos_propiedad.js`, `test_registro.js`, `test_copia_seguridad.js`, `test_vigilancia.js`,
  `test_roles_ui.js`. **Antes no había ni uno de seguridad.**

---

## 7. ⚠️ Un incidente de hoy que tienes que saber

**Hoy, 15:19, se borraron cuatro snippets del motor: `base-npc-skills`, `particulas-voxel`,
`sondas-mundo` y `redstone`. Ya están restaurados byte a byte y verificados.**

- **Qué pasó**: corrí el guardián `test_en_uso_no_se_borra.js` **contra el servidor en vivo del
  8500**, que llevaba levantado desde las 10:52 y por tanto **ejecutaba el código anterior a F2**. El
  test comprueba que esos snippets **no** se pueden borrar; contra el código viejo los `DELETE`
  **funcionaron**. Error mío al elegir el puerto, no un fallo del código nuevo.
- **Por qué se pudo deshacer**: el código viejo los copió a `data/habitantes_trash/`. Tres eran
  idénticos a la versión en git; `redstone` era **más nuevo** que git (un arreglo de comentarios de
  las 23:48 de ayer). **Se han restaurado desde la papelera, no desde git**, para no perder ese
  cambio.
- **Un detalle que decides tú**: la copia viva de `redstone` **había perdido el campo
  `categoria: "Librería"`** antes del borrado (se lo comió algún guardado anterior). Lo he restaurado
  **tal y como estaba**, sin "arreglarlo" por mi cuenta. Si quieres que vuelva, se añade.
- **Lo que esto demuestra**: con el servidor reiniciado ya no puede repetirse — los cuatro están
  cubiertos por `esta_protegido()` (tres por nombre, `redstone` por prefijo). Y la lección del
  incidente es justo la de F2.3: **la papelera sin poda fue lo que salvó los ficheros.**

---

## 8. Comprobarlo tú mismo

```bash
# El servidor (reiniciado hoy; el que corría era anterior a todo esto)
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8500/            # 200
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8500/data/       # 404
curl -s http://127.0.0.1:8500/api/yo                                       # quién eres

# Los guardianes
node correr_tests.js --node
node tests/test_permisos_api.js        # el que dice si se puede publicar

# La ronda de vigilancia, a mano
python3 herramientas/vigilancia.py
```

⛔ **Nunca contra el 8510**, que es tu partida en vivo — y, como se ha visto hoy, **tampoco los
guardianes de borrado contra el 8500 en vivo**: van a un puerto suyo.

---

## 9. Dónde está el detalle

- Cuentas, perfiles y permisos → [`docs/cuentas-y-permisos.md`](docs/cuentas-y-permisos.md)
- Encenderlo en una máquina de verdad → [`despliegue/LEEME.md`](despliegue/LEEME.md)
- La ley de oro (por qué casi nada de esto tocó `app.js`) →
  [`docs/desarrollo-desacoplado.md`](docs/desarrollo-desacoplado.md)
- El hueco del árbitro, dicho por él mismo → `multi/LEEME.md`
