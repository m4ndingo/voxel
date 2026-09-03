#!/usr/bin/env python3
"""Freno de escrituras por IP, para el modo público.

Por qué existe: el juego se va a abrir a gente, y `server.py` escribe en disco sin preguntar nada.
Un bucle de `curl` contra `POST /api/mundos/crear` o `/api/fotos` llena el disco en minutos, y el
proceso no tiene forma de notarlo. Esto no sustituye a un proxy delante (nginx hace esto mucho
mejor, y además pone tope al número de conexiones, que aquí no se puede): cubre el rato en que no
hay proxy — la red local, un túnel, el arranque de una máquina nueva.

⚠️ Sólo frena ESCRITURAS (POST/PATCH/DELETE). Las lecturas no pasan por aquí a propósito: un mapa
son cientos de peticiones seguidas y frenarlas rompería el juego antes que ningún abuso.

Ventana deslizante por trozos ("sliding window counter"): se guardan los dos últimos tramos de
`VENTANA` segundos y se pondera el anterior por lo que queda de él. Cuesta dos enteros por IP y no
tiene el escalón del contador de ventana fija, que deja pasar el doble del tope justo en el cambio
de minuto. No hay hilo de limpieza: las IPs viejas se recogen al vuelo cada `PURGA_CADA` llamadas,
porque un hilo más en un servidor que ya es `ThreadingMixIn` es una pieza que puede morirse sola.
"""
import os
import threading, time


def _entero(nombre, porDefecto):
    """El tope, ajustable sin tocar código: `VOXELFORGE_TOPE_ESCRITURAS=2000 python3 server.py 8500`.

    Una basura en la variable NO tumba el arranque ni deja el servidor sin freno: se ignora y manda
    el valor de aquí. Un servidor que no arranca por una errata en un número es peor que uno lento.
    """
    try:
        v = int(str(os.environ.get(nombre, '')).strip())
        return v if v > 0 else porDefecto
    except ValueError:
        return porDefecto


VENTANA = 60.0        # segundos que dura un tramo
# El tope es para el ABUSO ANÓNIMO, no para el trabajo normal. 60/min se quedaba corto hasta para
# construir a mano: cada bloque puesto es un `POST /api/mundo/edits`, y los ~90 `parche_snp_*.py` y
# la tanda de tests hacen ráfagas de cientos seguidas. Con el freno tan bajo lo que se rompía era el
# uso legítimo, que es exactamente al revés de para lo que está. Generoso a propósito: 10/s
# sostenidas siguen dejando el disco a salvo de un bucle de `curl`, que es lo único que esto frena.
TOPE = _entero('VOXELFORGE_TOPE_ESCRITURAS', 600)          # escrituras por ventana y por IP (anónimo)
# Quien ha entrado con su cuenta ya no es «alguien de internet»: tiene nombre, cuota y a quién
# reclamarle. El dueño no pasa por aquí (`_freno_ok` en server.py).
TOPE_SESION = _entero('VOXELFORGE_TOPE_ESCRITURAS_SESION', 3000)
PURGA_CADA = 500      # cada cuántas comprobaciones se recogen las IPs que ya no cuentan

_cerrojo = threading.Lock()
_vistos = {}          # ip -> [tramo, cuenta_de_este_tramo, cuenta_del_anterior]
_llamadas = 0


def _purga(ahora_tramo):
    """Fuera las IPs cuyo tramo anterior ya no pondera nada. Se llama con el cerrojo cogido."""
    for ip in [ip for ip, v in _vistos.items() if ahora_tramo - v[0] > 1]:
        del _vistos[ip]


def cabe(ip, tope=TOPE, ahora=None):
    """(True, restantes) si esta escritura cabe; (False, 0) si hay que devolver 429.

    Contar YA gasta el crédito: lo que se frena es el intento, no el éxito. Si sólo contaran las
    escrituras que llegan a disco, mil peticiones inválidas seguidas saldrían gratis y el trabajo
    de rechazarlas es justo lo que queremos limitar.
    """
    global _llamadas
    t = time.time() if ahora is None else ahora
    tramo = int(t // VENTANA)
    resto = (t % VENTANA) / VENTANA          # 0 al empezar el tramo, ~1 al acabarlo
    with _cerrojo:
        _llamadas += 1
        if _llamadas % PURGA_CADA == 0:
            _purga(tramo)
        v = _vistos.get(ip)
        if v is None or tramo - v[0] > 1:
            v = [tramo, 0, 0]
        elif tramo != v[0]:
            v = [tramo, 0, v[1]]
        # El tramo anterior pesa lo que le queda de vigencia: al principio cuenta entero, al final nada.
        estimado = v[2] * (1.0 - resto) + v[1]
        if estimado >= tope:
            _vistos[ip] = v
            return False, 0
        v[1] += 1
        _vistos[ip] = v
        return True, max(0, int(tope - estimado - 1))


def olvida():
    """Vaciar el contador. Sólo para los tests: sin esto, un test contamina al siguiente."""
    global _llamadas
    with _cerrojo:
        _vistos.clear()
        _llamadas = 0
