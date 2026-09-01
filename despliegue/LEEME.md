# Poner VoxelForge en marcha en una máquina de verdad (F7.1)

Esto es **el despliegue de LAN / túnel** que decidió el dueño, no el de internet. La diferencia no es
cosmética y está dicha sin adornos en [§ Lo que esto NO protege](#lo-que-esto-no-protege).

Siete ficheros, y cada uno tiene su porqué escrito dentro:

| fichero | qué es |
|---|---|
| `voxelforge.service` | el sitio y la API, `server.py` en el **8500**. **Aquí se deciden los permisos** |
| `voxelforge-multi.service` | el árbitro del multiverso, `servidor_multi.py` en el **8510** |
| `voxelforge.env.ejemplo` | plantilla de `/etc/voxelforge.env`. **Los secretos van ahí, nunca en el repo** |
| `voxelforge-copia.service` + `.timer` | la copia de F7.2, cada noche a las 3:30 |
| `voxelforge-vigilancia.service` + `.timer` | la ronda de F7.4, cada hora |

---

## Instalar, en este orden

El orden importa en dos sitios: el fichero de entorno **antes** de arrancar nada (en modo público
`server.py` no arranca sin `VOXELFORGE_SECRETO_SESION`), y `data/multi/` **antes** del árbitro
(systemd no crea las carpetas de `ReadWritePaths`: si no existe, la unidad ni arranca).

```bash
# 1 · el usuario y el sitio. Sin shell y sin casa: esta cuenta no es de nadie, es de un proceso.
sudo useradd --system --home /opt/voxelforge --shell /usr/sbin/nologin voxelforge
sudo git clone <origen> /opt/voxelforge
sudo chown -R voxelforge:voxelforge /opt/voxelforge

# 2 · los secretos, ANTES de encender nada
sudo cp /opt/voxelforge/despliegue/voxelforge.env.ejemplo /etc/voxelforge.env
sudo chown root:voxelforge /etc/voxelforge.env && sudo chmod 640 /etc/voxelforge.env
sudoedit /etc/voxelforge.env          # los tres CAMBIAME; el de sesión no es opcional

# 3 · las carpetas que systemd NO crea
sudo -u voxelforge mkdir -p /opt/voxelforge/data/multi
sudo install -d -o voxelforge -g voxelforge /var/backups/voxelforge   # ⚠️ mejor en OTRO disco

# 4 · las unidades
sudo cp /opt/voxelforge/despliegue/voxelforge*.service /etc/systemd/system/
sudo cp /opt/voxelforge/despliegue/voxelforge*.timer   /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now voxelforge voxelforge-multi
sudo systemctl enable --now voxelforge-copia.timer voxelforge-vigilancia.timer   # los .timer
```

⚠️ De `copia` y `vigilancia` se enciende **el `.timer`, no el `.service`**. Hacer `enable` del
`.service` de un `oneshot` no da error y tampoco hace nada: la unidad se queda ahí sin dispararse
nunca, que es la peor de las dos maneras de no tener copias.

⚠️ **`git clone` no trae lo que solo está en local.** Es un riesgo declarado del plan y sigue vigente:
`git status` en la máquina de desarrollo enseña cosas sin commitear. Cuadrar eso **antes** de clonar,
o la producción arrancará con snippets viejos.

## Comprobar que quedó bien

Un despliegue no está hecho porque `systemctl` diga `active`. Está hecho cuando esto sale como aquí:

```bash
systemctl is-active voxelforge voxelforge-multi          # active · active
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8500/     # 200 · no hay endpoint de salud,
                                                                   # la portada es lo que hay
curl -s  http://127.0.0.1:8510/estado | python3 -m json.tool | head -5

# El modo público está DE VERDAD encendido (lo importante):
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8500/data/            # 404, no un listado
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8500/data/tickets/    # 404
curl -s -X POST http://127.0.0.1:8500/api/snippets \
     -H 'Content-Type: application/json' -d '{"id":"zz-prueba","code":"1"}'     # 401, NO 200
```

Ese último es **la bomba apagada**: `mundo-autoarranque` se ejecuta con `new AsyncFunction()` en
ámbito global en el navegador de cada visitante, así que un `POST` anónimo que devolviera `200` sería
ejecución de JavaScript arbitrario y persistente en la sesión de todo el mundo. Contesta **`401`**
—`{"necesitaEntrar": true}`— porque anónimo no es «no puedes», es «no sé quién eres»; con una sesión
sin el permiso el mismo `POST` da `403`. Lo que importa es que **no sea `200` y que no aparezca el
fichero** en `data/snippets/`. Si sale `200`, `VOXELFORGE_PUBLICO=1` no está llegando al proceso:
compruébalo con `systemctl show voxelforge -p Environment`.

Y los guardianes, que se corren en la máquina de desarrollo, no aquí:

```bash
node correr_tests.js --node          # incluye test_permisos_api.js, que es el que dice si se publica
```

## El simulacro de restauración — ⛔ esto no es opcional

**Una copia sin restauración probada no es una copia**, y el criterio de cierre nº 6 del plan es
literalmente restaurar y que el mundo arranque. Se hace **el día del despliegue** y luego una vez cada
tanto, no solo cuando haga falta:

```bash
sudo -u voxelforge python3 /opt/voxelforge/herramientas/copia_seguridad.py --listar
sudo -u voxelforge python3 /opt/voxelforge/herramientas/copia_seguridad.py \
     --restaurar <la-mas-nueva> --a /tmp/simulacro        # ⛔ carpeta VACÍA; se niega si no lo está
```

Sale con `0` y dice «*N* ok» solo si **verifica** cada mundo con `voxfmt.completo()`, que es la misma
función con la que el servidor decide si un mundo es utilizable — no un `ls`. Si sale con `2`, hay un
mundo desgarrado y lo dice por su nombre.

## Operar

```bash
journalctl -u voxelforge -f                  # lo que dice el proceso
tail -f /opt/voxelforge/data/registro/acceso.log   # F7.3: método, ruta, código, uid, ms
systemctl list-timers 'voxelforge-*'
systemctl --failed                           # ⛔ EL BUZÓN. Si algo va mal, sale aquí
sudo -u voxelforge python3 /opt/voxelforge/herramientas/vigilancia.py   # la ronda, a mano
```

**La ronda (F7.4) mira lo que no avisa solo**: disco libre donde vive `data/` y donde viven las
copias, cuánto pesa `data/`, cuántos mundos hay, que los dos puertos contesten y —lo que de verdad
justifica el fichero— **la edad de la última copia**. Un temporizador que dejó de dispararse hace
tres semanas no se nota hasta el día que hace falta restaurar; más de 48 h es alarma. Sale con `0`
bien, `1` aviso (no pone la unidad roja) y `2` alarma (sí).

⚠️ **Reiniciar `voxelforge-multi` echa a todo el que esté jugando.** Por eso son dos unidades: un
`systemctl restart voxelforge` (un cambio en `server.py`, un `git pull`) no toca la partida. Y en la
máquina de desarrollo, las pruebas de multi van **siempre al 8512**, nunca al 8510.

`voxelforge-copia` **se pone roja si un mundo está desgarrado** (sale con 2). Es a propósito: el fallo
que mata a un sistema de copias es el que no se nota. La copia se hace igual, y el `MANIFIESTO.json`
de dentro dice cuál es el mundo que no cuadra.

## Lo que esto NO protege

Esto es un despliegue de LAN entre conocidos, y hay que decir lo que se queda fuera:

- **Todo viaja en claro.** Sin TLS, la cookie de sesión `vf_sid` y el secreto del árbitro van por la
  red tal cual. En LAN, entre conocidos, es la decisión del dueño. De cara a internet **no**.
- **`server.py` escucha en `0.0.0.0`**, no en `127.0.0.1`, y está quemado en el código
  (`server.py:2410`). Hoy eso significa que el 8500 y el 8510 están expuestos a toda la red.
- **`ThreadingMixIn` no tiene tope de conexiones.** Un slowloris de manual tumba el proceso, y eso no
  lo arregla ningún fichero de esta carpeta: lo arregla un proxy delante.
- **`POST /api/snippets` no funciona en producción**, por el `ReadOnlyPaths` de `voxelforge.service`.
  Los snippets se publican en desarrollo y viajan con el repositorio (`git pull` + `restart`). El
  porqué está escrito en la propia unidad, y el precio también.
- **El árbitro todavía usa su propio secreto** (`VOXEL_MULTI_SECRETO`), no el de sesión. Mientras siga
  así, quien tenga ese secreto entra a cualquier mapa: es el hueco que declara `multi/LEEME.md` y lo
  cierra **F6.2** con el vale firmado. Lo que sí está cerrado ya es lo que importa: el árbitro **no
  puede escribir en `data/worlds/`**, y quien escribe (el 8500) sí mira permisos.

**La puerta a internet es F7.5 + F7.6**: nginx delante (`limit_conn`, `limit_req`,
`client_max_body_size`, `location /data/ { deny all; }` y el bloque WebSocket ya escrito en
`multi/LEEME.md`) y TLS. ⚠️ Y con `https://` hay que acordarse de `wss://`: **desde una página segura
el navegador rechaza `ws://` sin decir gran cosa**, que es el fallo más silencioso del despliegue.

## Pegas conocidas de estos ficheros

- La ruta de las copias está **en dos sitios**: `VOXELFORGE_COPIAS` en el entorno y `ReadWritePaths`
  en `voxelforge-copia.service`. systemd no expande variables ahí. Se cambia una, se cambia la otra,
  o la copia muere con «Read-only file system».
- `data/multi/` y `/var/backups/voxelforge` hay que crearlos a mano (paso 3). Si faltan, la unidad
  correspondiente no arranca y el motivo sale en `journalctl`, no en `systemctl status`.
