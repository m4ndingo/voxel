#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""F7.4 · la ronda: disco, tamaño, mundos, los dos puertos y la edad de la última copia.

    python3 herramientas/vigilancia.py              # una ronda; 0 bien · 1 aviso · 2 alarma
    python3 herramientas/vigilancia.py --json       # lo mismo, para meterlo en otra cosa

**El primer incidente de un multiverso es el disco**, y no se parece a una caída: nadie ve un error,
simplemente los mundos se guardan a medias. Por eso esto mira el disco ANTES que los puertos —un
puerto caído se nota solo en diez segundos; un disco al 96%, no.

── Lo que se mira, y por qué cada cosa ─────────────────────────────────────────────────────────────
  · **disco libre** donde vive `data/` y donde viven las copias. Son dos particiones distintas (o
    deberían serlo, F7.2) y llenar la de las copias es igual de malo: la copia muere y la unidad se
    pone roja, pero eso solo lo ve quien mire.
  · **tamaño de `data/`** y **nº de mundos**. No hay umbral bueno para esto —depende de la máquina—,
    así que se informan sin juzgar: sirven para ver la PENDIENTE entre dos rondas, que es lo que
    avisa de que alguien está creando mundos en bucle.
  · **los dos puertos**, con lo que ya contestan: `/` en el 8500 y el estado JSON en el 8510.
  · **la edad de la última copia**. ⛔ Esto es lo que más se olvida y lo más caro: un temporizador
    que dejó de dispararse hace tres semanas NO SE NOTA hasta el día que hace falta restaurar. Una
    copia de hace más de 48 h es una alarma, no un aviso.

── Por qué exit code y no correo ───────────────────────────────────────────────────────────────────
Porque quien lo llama es un `.timer`, y una unidad que sale con error se pone roja y se queda roja:
`systemctl --failed` la enseña, y eso es un buzón que nadie tiene que configurar. Mandar correo
desde aquí sería añadir un servicio más que también se puede caer en silencio.
"""
import argparse, json, os, shutil, sys, time
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Umbrales. Dos números y no una escala: «avisa» es «míralo esta semana» y «alarma» es «hoy».
LIBRE_AVISO, LIBRE_ALARMA = 0.15, 0.07          # fracción de disco libre
LIBRE_MIN_GB = 2.0                              # …y un suelo absoluto: el 15% de un disco enorme
                                                # puede ser mucho, pero 500 MB nunca es suficiente
COPIA_AVISO_H, COPIA_ALARMA_H = 26, 48          # 26 h y no 24: la copia de las 3:30 lleva
                                                # `RandomizedDelaySec=20m`, y avisar por eso sería
                                                # un guardián que cría fama de mentiroso
ESPERA = 4                                      # segundos por puerto

BIEN, AVISO, ALARMA = 0, 1, 2


def _disco(ruta):
    """(libre_bytes, total_bytes, fracción) del sistema de ficheros donde cae `ruta`, o None."""
    try:
        u = shutil.disk_usage(ruta)
    except OSError:
        return None
    return (u.free, u.total, (u.free / u.total) if u.total else 0.0)


def _juzga_disco(d):
    if d is None:
        return ALARMA, 'no se puede leer'
    libre, total, frac = d
    gb = libre / (1024 ** 3)
    if frac <= LIBRE_ALARMA or gb < LIBRE_MIN_GB:
        return ALARMA, '%.1f GB libres (%.0f%%)' % (gb, frac * 100)
    if frac <= LIBRE_AVISO:
        return AVISO, '%.1f GB libres (%.0f%%)' % (gb, frac * 100)
    return BIEN, '%.1f GB libres (%.0f%%)' % (gb, frac * 100)


def _pesa(carpeta):
    """Bytes de una carpeta, sin `du`. Cuenta el tamaño APARENTE y no cuenta dos veces un enlace duro
    —que es como comparten las copias— porque aquí se pesa `data/`, donde no los hay."""
    total = 0
    for base, _dirs, ficheros in os.walk(carpeta):
        for f in ficheros:
            try:
                total += os.lstat(os.path.join(base, f)).st_size
            except OSError:
                pass                                    # borrado mientras andábamos: no es noticia
    return total


def _puerto(url):
    """(ok, detalle). No distingue 200 de 404: lo que se pregunta es «¿hay alguien ahí?», y un 404 lo
    contesta un proceso vivo. Lo que sí es un fallo es que no conteste nadie."""
    t0 = time.time()
    try:
        with urllib.request.urlopen(url, timeout=ESPERA) as r:
            return True, '%d en %d ms' % (r.status, (time.time() - t0) * 1000)
    except urllib.error.HTTPError as e:
        return True, '%d en %d ms' % (e.code, (time.time() - t0) * 1000)
    except Exception as e:
        return False, '%s: %s' % (type(e).__name__, e)


def ultima_copia(destino):
    """(nombre, horas) de la copia terminada más nueva, o (None, None). Reutiliza `copias()` para que
    el criterio de «copia terminada» sea UNO: una `.parcial` no cuenta aquí tampoco."""
    sys.path.insert(0, os.path.join(RAIZ, 'herramientas'))
    import copia_seguridad
    hechas = copia_seguridad.copias(destino)
    if not hechas:
        return None, None
    nombre = hechas[-1]
    try:
        t = time.mktime(time.strptime(nombre, '%Y-%m-%d_%H%M%S'))
    except ValueError:
        return nombre, None
    return nombre, (time.time() - t) / 3600.0


def ronda(raiz=RAIZ, destino=None, sitio='http://127.0.0.1:8500/',
          arbitro='http://127.0.0.1:8510/estado'):
    """Un dict con lo mirado y el peor veredicto de todo, en `nivel`."""
    datos = os.path.join(raiz, 'data')
    destino = destino or os.environ.get('VOXELFORGE_COPIAS') or '/var/backups/voxelforge'
    r = {'cuando': time.strftime('%Y-%m-%dT%H:%M:%S'), 'avisos': [], 'alarmas': []}

    def apunta(nivel, texto):
        if nivel == ALARMA:
            r['alarmas'].append(texto)
        elif nivel == AVISO:
            r['avisos'].append(texto)

    n, txt = _juzga_disco(_disco(datos))
    r['disco_datos'] = txt
    apunta(n, 'disco de data/: ' + txt)

    # El de las copias solo si es OTRA partición; si es la misma, decirlo dos veces es ruido —y peor,
    # enseña dos alarmas donde hay un problema.
    d1, d2 = _disco(datos), _disco(destino)
    if d2 and d1 and d2[1] != d1[1]:
        n, txt = _juzga_disco(d2)
        r['disco_copias'] = txt
        apunta(n, 'disco de las copias: ' + txt)
    elif d2 is None:
        r['disco_copias'] = 'no existe %s' % destino
        apunta(ALARMA, 'no existe la carpeta de copias: %s' % destino)
    else:
        r['disco_copias'] = 'la MISMA partición que data/ ⚠️'
        apunta(AVISO, 'las copias están en el mismo disco que el original (F7.2 pide otro)')

    r['bytes_datos'] = _pesa(datos) if os.path.isdir(datos) else 0
    mundos = os.path.join(datos, 'worlds')
    r['mundos'] = len([f for f in os.listdir(mundos) if f.endswith('.json')]) \
        if os.path.isdir(mundos) else 0

    nombre, horas = ultima_copia(destino)
    r['ultima_copia'] = nombre
    r['copia_horas'] = None if horas is None else round(horas, 1)
    if nombre is None:
        apunta(ALARMA, 'NO HAY NINGUNA COPIA en %s' % destino)
    elif horas is None:
        apunta(AVISO, 'la última copia («%s») no tiene fecha legible' % nombre)
    elif horas >= COPIA_ALARMA_H:
        apunta(ALARMA, 'la última copia es de hace %.0f h (%s)' % (horas, nombre))
    elif horas >= COPIA_AVISO_H:
        apunta(AVISO, 'la última copia es de hace %.0f h (%s)' % (horas, nombre))

    for clave, url in (('sitio', sitio), ('arbitro', arbitro)):
        ok, detalle = _puerto(url)
        r[clave] = detalle
        if not ok:
            apunta(ALARMA, 'no contesta %s (%s)' % (url, detalle))

    r['nivel'] = ALARMA if r['alarmas'] else (AVISO if r['avisos'] else BIEN)
    return r


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--raiz', default=RAIZ)
    ap.add_argument('--destino', default=None, help='dónde viven las copias · $VOXELFORGE_COPIAS')
    ap.add_argument('--sitio', default='http://127.0.0.1:8500/')
    ap.add_argument('--arbitro', default='http://127.0.0.1:8510/estado')
    ap.add_argument('--json', action='store_true')
    a = ap.parse_args()

    r = ronda(a.raiz, a.destino, a.sitio, a.arbitro)
    if a.json:
        print(json.dumps(r, ensure_ascii=False, indent=2))
    else:
        print('data/ %.1f GB · %d mundos · %s' % (r['bytes_datos'] / (1024 ** 3), r['mundos'],
                                                  r['disco_datos']))
        print('copias: %s (%s) · %s' % (r['ultima_copia'] or 'NINGUNA',
                                        'sin fecha' if r['copia_horas'] is None
                                        else 'hace %.0f h' % r['copia_horas'], r['disco_copias']))
        print('8500 %s · 8510 %s' % (r['sitio'], r['arbitro']))
        # Las alarmas por stderr: así `journalctl -p err` las saca solas, sin el resto de la ronda.
        for t in r['avisos']:
            print('⚠️  ' + t, file=sys.stderr)
        for t in r['alarmas']:
            print('⛔ ' + t, file=sys.stderr)
    return r['nivel']


if __name__ == '__main__':
    sys.exit(main())
