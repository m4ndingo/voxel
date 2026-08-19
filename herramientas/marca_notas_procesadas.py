#!/usr/bin/env python3
# «se añade [PROCESADA] debajo, no se reescriben» (CLAUDE.md). Esto es esa regla, hecha herramienta:
# marca las notas de un mundo que ya se han convertido en ticket, SIN tocar su texto y sin pisar nada
# más del mundo.
#
# Por qué no se edita el .json a mano ni se hace POST /api/mundo (el completo):
#   - `data/worlds/` es autoría del dueño y el mundo puede estar ABIERTO mientras esto corre.
#   - POST /api/mundo reescribe el mundo ENTERO (rejilla incluida): el que guarde el último gana y el
#     otro pierde lo que llevara hecho.
#   - POST /api/mundo/cabecera toca SOLO spawn/structures/notes/noteRots/noteTints —kilobytes—, con
#     cerrojo en el servidor y copia de seguridad a la papelera antes de escribir (voxfmt.py).
# Aun así el mundo abierto en el navegador tiene su propia copia de las notas: si el dueño lo tiene
# abierto, que RECARGUE después. Mientras eso no se arregle, ver REQ-MULTI1.
#
# IDEMPOTENTE: una nota que ya lleve la marca se deja como está. Se puede correr las veces que haga
# falta y solo escribe si algo cambia.
#
#   python3 herramientas/marca_notas_procesadas.py             # dice qué haría, sin escribir
#   python3 herramientas/marca_notas_procesadas.py --escribe
#
# Para el siguiente triaje: cambiar MAPA y TRIAJE. La tabla se queda escrita a propósito — es el acta
# de qué nota dio qué ticket, y semanas después es lo único que lo cuenta.

import json
import sys
import urllib.error
import urllib.request

BASE = 'http://localhost:8500'
MAPA = 'bugfinder'
MARCA = '[PROCESADA]'

# nota (su coordenada, que es su clave) → qué ticket salió de ella. '' = leída y sin ticket.
TRIAJE = {
    '45,14,69': 'BUG-GLOW6',
    '24,14,67': 'BUG-GLOW6',
    '26,14,78': 'BUG-GLOW6',
    '15,10,76': 'BUG-GLOW6',
    '34,14,46': 'BUG-GLOW6',
    '34,14,51': 'BUG-GLOW6',
    '43,14,69': 'REQ-GLOW7',
    '29,14,70': 'REQ-GLOW7',
    '35,14,37': 'REQ-GLOW7',
    '34,14,59': 'REQ-SHADOW3',
    '42,14,44': 'REQ-SHADOW3',
    '40,14,65': 'BUG-RS27',
    '53,14,40': 'BUG-SPLIT2 (cerrado: era el Alt+C, que disparaba también la tecla C del snippet)',
    '50,14,40': 'REQ-SNP7',
    '57,14,58': 'REQ-CART5',
    '47,14,40': 'REQ-CART6',
    '56,14,71': 'REQ-EXTRU1',
    '46,14,65': 'REQ-RANURA1',
    '52,14,45': 'REQ-SPAWN1',
    '57,15,43': '',
    '56,14,52': '',
    '56,15,65': '',
}


def marca_de(ticket):
    return MARCA + ' ' + ticket if ticket else MARCA + ' leída, sin ticket'


def pide(url):
    with urllib.request.urlopen(url, timeout=30) as r:
        return json.load(r)


def manda(url, cuerpo):
    datos = json.dumps(cuerpo, ensure_ascii=False).encode('utf-8')
    req = urllib.request.Request(url, data=datos, method='POST',
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def main(escribe):
    try:
        mundo = pide('%s/api/mundo?map=%s' % (BASE, MAPA))
    except urllib.error.URLError as e:
        print('no contesta el servidor (%s). ¿Está `python3 server.py 8500` en marcha?' % e, file=sys.stderr)
        return 1
    notas = mundo.get('notes')
    if not isinstance(notas, dict):
        print('ABORTA: /map/%s no tiene notas' % MAPA, file=sys.stderr)
        return 1

    faltan = [k for k in TRIAJE if k not in notas]
    if faltan:
        # Que una nota del triaje ya no esté quiere decir que el dueño la ha movido o borrado: parar y
        # que lo mire una persona, en vez de marcar a ciegas las que sí quedan.
        print('ABORTA: estas notas del triaje ya no están en el mundo: %s' % ', '.join(sorted(faltan)),
              file=sys.stderr)
        return 1

    nuevas, tocadas = dict(notas), []
    for k, ticket in sorted(TRIAJE.items()):
        txt = notas[k]
        if MARCA in txt:
            continue
        nuevas[k] = txt + '\n\n' + marca_de(ticket)
        tocadas.append((k, ticket))

    if not tocadas:
        print('ya estaban todas marcadas (%d notas del triaje)' % len(TRIAJE))
        return 0
    for k, ticket in tocadas:
        print('  %-10s → %s' % (k, ticket or '(sin ticket)'))
    if not escribe:
        print('\n%d notas por marcar. Repite con --escribe.' % len(tocadas))
        return 0

    r = manda('%s/api/mundo/cabecera?map=%s' % (BASE, MAPA), {'notes': nuevas})
    if not r.get('ok'):
        print('el servidor no lo ha guardado: %r' % r, file=sys.stderr)
        return 1
    print('\n%d notas marcadas en /map/%s. Si lo tienes abierto, recarga.' % (len(tocadas), MAPA))
    return 0


if __name__ == '__main__':
    sys.exit(main('--escribe' in sys.argv[1:]))
