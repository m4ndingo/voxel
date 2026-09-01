# -*- coding: utf-8 -*-
"""F7.3 · el registro de peticiones: quién pidió qué, con qué respuesta y cuánto tardó.

Hasta hoy `log_message` era `pass` — el servidor NO APUNTABA NADA. En desarrollo eso está bien (la
consola es del dueño, y una línea por fichero servido la haría ilegible), pero publicando es la
diferencia entre poder contar lo que pasó y solo sospecharlo. Es el punto 5 de «lo mínimo para no
publicar una bomba»: sin copias no hay vuelta atrás, y sin registro no hay diagnóstico.

⛔ LO QUE NO SE APUNTA, Y POR QUÉ. Un registro es un fichero que sobrevive al incidente y que
acabará copiado a otro disco (F7.2), así que lo que entre aquí ya no se puede desdecir:

  · **el cuerpo, nunca**. Por ahí pasan las contraseñas de `/api/entrar` y `/api/registro`.
  · **la cookie, nunca**. `vf_sid` es la sesión entera: quien lea el registro entraría como
    cualquiera de los que salen en él. Se apunta el `uid`, que dice lo mismo y no abre nada.
  · **la query, tachando lo que abre puertas** (`codigo`, `invita`, `token`, `clave`). El código de
    acceso de un mapa viaja en la URL a propósito, y una URL en un fichero de texto es una llave
    olvidada encima de la mesa.

Y lo que SÍ, siempre: la IP, porque es lo único que queda de quien todavía no tiene nombre.
"""

import logging
import logging.handlers
import os
import re
import time
import urllib.parse

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUTA = os.environ.get('VOXELFORGE_REGISTRO') or os.path.join(BASE, 'data', 'registro', 'acceso.log')

BYTES = 5 * 1024 * 1024          # 5 MB por fichero y cinco de recambio: 25 MB en total, un techo que
GUARDA = 5                       # se puede olvidar. Un registro que llena el disco es el incidente.

# Los parámetros que son una LLAVE, no un dato. Ver el ⛔ de arriba.
TACHAR = ('codigo', 'invita', 'token', 'clave', 'vale')

_log = None


def arranca(ruta=None):
    """Deja el registro listo. Devuelve la ruta, o None si no se pudo (y entonces no se apunta nada).

    Que un disco lleno o un permiso mal puesto impidan APUNTAR es un problema; que impidan SERVIR
    sería mucho peor. Por eso esto no levanta excepción: se queda callado y el juego sigue.
    """
    global _log
    ruta = ruta or RUTA
    try:
        os.makedirs(os.path.dirname(ruta), exist_ok=True)
        h = logging.handlers.RotatingFileHandler(ruta, maxBytes=BYTES, backupCount=GUARDA,
                                                 encoding='utf-8')
        h.setFormatter(logging.Formatter('%(asctime)s %(message)s', '%Y-%m-%dT%H:%M:%S'))
        _log = logging.getLogger('voxelforge.acceso')
        _log.setLevel(logging.INFO)
        _log.propagate = False                      # o cada línea saldría también por la consola
        for viejo in list(_log.handlers):
            _log.removeHandler(viejo)
        _log.addHandler(h)
        return ruta
    except OSError:
        _log = None
        return None


def activo():
    return _log is not None


def limpia(ruta):
    """La ruta pedida con las llaves tachadas. Es lo único de la petición que puede ir al fichero."""
    try:
        partes = urllib.parse.urlsplit(ruta)
    except ValueError:
        return '(ruta ilegible)'
    if not partes.query:
        return partes.path[:300]
    trozos = []
    for k, v in urllib.parse.parse_qsl(partes.query, keep_blank_values=True):
        trozos.append(f'{k}=(tachado)' if k in TACHAR else f'{k}={v}')
    return (partes.path + '?' + '&'.join(trozos))[:300]


def apunta(ip, metodo, ruta, codigo, ms, uid=None, nota=''):
    if _log is None:
        return
    quien = uid or '-'
    _log.info(f'{ip} {quien} {metodo} {limpia(ruta)} {codigo} {ms:.0f}ms{" " + nota if nota else ""}')


def merece(metodo, ruta, codigo):
    """¿Vale la pena esta línea?

    Una carga del Mundo son más de cien GET de ficheros estáticos (`app.js`, el CSS, los iconos, las
    texturas). Apuntarlos todos no da información: la esconde, y de paso rota el fichero cada dos
    visitas justo cuando hacía falta mirar atrás. Se apunta lo que cambia algo o lo que falla:

      · todo lo que no sea GET      → toda escritura, siempre
      · todo `/api/`                → incluidas las lecturas: son las que dibujan lo que ve cada uno
      · entrar a un mapa (`/map/`)  → es la visita, y es la pregunta que se hará el dueño
      · cualquier cosa con código de error, que es justo la que no se esperaba
    """
    if metodo != 'GET' or codigo >= 400:
        return True
    return ruta.startswith('/api/') or ruta.startswith('/map/')
