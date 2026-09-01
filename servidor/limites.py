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
import threading, time

VENTANA = 60.0        # segundos que dura un tramo
TOPE = 60             # escrituras por ventana y por IP
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
