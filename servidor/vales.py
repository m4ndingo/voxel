"""F5.6 · Vales de invitación: un enlace que abre UN mapa, y solo uno.

El dueño pidió «invitar en un clic». Hoy invitar es `game.multi.invita(<número>)` por consola y
además solo vale si el otro YA está conectado. Con esto, invitar es copiar un enlace:

    http://<host>/map/<slug>?invita=<vale>

El vale es un HMAC, igual que la cookie de sesión (`sesion.emite`), y por el mismo motivo: sin
almacén no hay estado que sincronizar y sobrevive a los reinicios de `server.py`, que son
constantes. La diferencia con la cookie es QUÉ afirma: la cookie dice «soy fulano», el vale dice
«fulano me deja entrar a ESTE mapa hasta ESTA fecha».

⚠️ Lo verifican los DOS extremos con el mismo secreto (`VOXELFORGE_SECRETO_SESION`):
`server.py` para dar escritura en el mapa, y `multi/servidor_multi.py` para dejar entrar al 8510.
Así el árbitro no necesita hablar con `server.py` — que es justo lo que hace que la fase 3 de multi
no se pueda implementar solo en multi (§Principio rector 1 del plan).

⛔ EL SLUG VA DENTRO DE LA FIRMA. Es la propiedad que sostiene todo esto: un vale para `castillo`
no puede abrir `santuario-zen`. Si algún día se separa el slug del cuerpo firmado, el vale pasa de
ser una invitación a un mapa a ser una llave maestra, y nada fallará al hacerlo.

⛔ NO hay «un solo uso». Un contador exigiría estado, y un vale de un uso además sería peor para lo
que el dueño quiere (invitar a varios de golpe): el primero que pincha dejaría fuera a los demás.
El límite real es la CADUCIDAD. Si algún día hace falta revocar antes de tiempo, la salida barata
es subir un contador por mapa y meterlo en el cuerpo firmado, no llevar la cuenta de los usos.
"""

import hmac
import time
import urllib.parse

from servidor import sesion

DIAS = 7          # lo que dura un enlace de invitación
DIAS_MAX = 90     # tope duro: un vale «para siempre» es una contraseña que nadie recuerda cambiar


def emite(slug, emisor, dias=DIAS):
    """`slug.emisor.caduca.firma`. `emisor` es el uid de quien invita (o '' si lo emite el dueño).

    Ni el slug ni el uid llevan puntos (`mundos_meta.nombre_libre` y `sesion.uid_de` los limpian),
    así que partir por puntos es seguro. Es la misma apuesta que hace `sesion.abre`.
    """
    dias = max(1, min(int(dias or DIAS), DIAS_MAX))
    caduca = int(time.time()) + dias * 86400
    cuerpo = f'{slug}.{emisor or ""}.{caduca}'
    return f'{cuerpo}.{sesion._firma("vale." + cuerpo)}'


def abre(vale):
    """Lo que afirma un vale válido, o None. None es «no vale», nunca «error»."""
    if not vale or not isinstance(vale, str):
        return None
    trozos = vale.split('.')
    if len(trozos) != 4:
        return None
    slug, emisor, caduca, firma = trozos
    # `compare_digest` y no `==`: comparar firmas con `==` filtra byte a byte cuánto has acertado.
    if not hmac.compare_digest(firma, sesion._firma(f'vale.{slug}.{emisor}.{caduca}')):
        return None
    try:
        if int(caduca) < time.time():
            return None
    except ValueError:
        return None
    return {'slug': slug, 'emisor': emisor or None, 'caduca': int(caduca)}


def vale_para(vale, slug):
    """¿Este vale abre ESTE mapa? La comprobación que nunca se puede saltar quien llama."""
    d = abre(vale)
    return bool(d) and d['slug'] == slug


def de_la_peticion(ruta):
    """El `?invita=` de una URL, o ''. Aquí para que server.py y multi lo lean igual."""
    q = urllib.parse.parse_qs(urllib.parse.urlparse(ruta or '').query)
    return (q.get('invita') or [''])[0].strip()


def enlace(base, slug, vale):
    """La URL que se le pasa al invitado. `base` es `http://<host>` sin barra final."""
    return f'{base.rstrip("/")}/map/{urllib.parse.quote(slug)}?invita={urllib.parse.quote(vale)}'
