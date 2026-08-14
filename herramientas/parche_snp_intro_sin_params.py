#!/usr/bin/env python3
"""REQ-OSD5 · `arranque-intro`: las acciones del OSD vuelven a tener CERO parámetros.

Motivo (del dueño, tercera vuelta del ticket): el volcado de `game.osd.dump()` enseñaba
`function jugar(clave, ent)` y quien lo leía no tenía forma de saber qué eran `clave` ni `ent`,
así que el ejemplo no se podía correr. Ahora la acción no recibe nada y sus ayudantes salen del
snippet; el 3.er argumento de `alPulsar` sigue DECLARÁNDOLOS para que `dump()` imprima la línea
`const {intro, cima} = game.osd.entorno('JUGAR');` delante del código y el bloque se copie entero.

Idempotente y con ancla única: aborta si el ancla no aparece exactamente una vez. Publica por
`POST /api/snippets` (respaldo en papelera + escritura atómica), nunca escribiendo el .json a mano.
"""
import json, sys, urllib.request

BASE = 'http://localhost:8500'
SNIP = 'arranque-intro'

CAMBIOS = [
    ("function jugar(clave, ent) {\n  const { intro, cima } = ent || game.osd.entorno('JUGAR');\n",
     "function jugar() {\n"),
    ("function construir(clave, ent) {\n  const { intro } = ent || game.osd.entorno('CONSTRUIR');\n",
     "function construir() {\n"),
    ("const VERSION = 4;", "const VERSION = 5;"),
]


def main():
    with urllib.request.urlopen(f'{BASE}/api/snippets/{SNIP}') as r:
        doc = json.load(r)
    code = doc['code']

    hechos = 0
    for viejo, nuevo in CAMBIOS:
        n = code.count(viejo)
        if n == 0:
            if code.count(nuevo) >= 1:
                continue                      # ya parcheado: se deja pasar
            sys.exit(f'ABORTA: no encuentro el ancla:\n{viejo!r}')
        if n != 1:
            sys.exit(f'ABORTA: el ancla aparece {n} veces (tiene que ser única):\n{viejo!r}')
        code = code.replace(viejo, nuevo)
        hechos += 1

    if not hechos:
        print('nada que hacer: el snippet ya está parcheado')
        return

    doc['code'] = code
    req = urllib.request.Request(f'{BASE}/api/snippets', method='POST',
                                 data=json.dumps(doc).encode(),
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req) as r:
        print(f'{hechos} cambio(s) publicados ·', r.read().decode()[:120])


if __name__ == '__main__':
    main()
