#!/usr/bin/env python3
"""REQ-OSD5 · `arranque-intro`: el comentario de las acciones, al día del cambio de firma.

Acompaña a `parche_snp_intro_sin_params.py`: allí se quitaron los parámetros, aquí se explica por
qué el 3.er argumento de `alPulsar` sigue estando. Idempotente, ancla única.
"""
import json, sys, urllib.request

BASE = 'http://localhost:8500'
SNIP = 'arranque-intro'

VIEJO = ("// Las dos acciones reciben su ENTORNO como 2.º parámetro en vez de cerrarse sobre él: `intro` y `cima`\n"
         "// viven aquí dentro, y sin pasarlos el código que enseña `game.osd.dump()` no se puede copiar a la\n"
         "// consola («intro is not defined»). Se registran abajo con `alPulsar(texto, fn, {intro, cima})`.\n")

NUEVO = ("// Las dos acciones NO reciben nada: son funciones de cero parámetros que usan `intro` y `cima`, que\n"
         "// viven aquí dentro. Lo que se DECLARA abajo, en el 3.er argumento de `alPulsar`, es justo eso: qué\n"
         "// usan de este snippet. No cambia cómo corren; hace que `game.osd.dump()` imprima delante la línea\n"
         "// `const {intro, cima} = game.osd.entorno('JUGAR');` y el ejemplo se pueda copiar entero y correr.\n")


def main():
    with urllib.request.urlopen(f'{BASE}/api/snippets/{SNIP}') as r:
        doc = json.load(r)
    code = doc['code']

    if NUEVO in code:
        print('nada que hacer: el comentario ya está al día')
        return
    n = code.count(VIEJO)
    if n != 1:
        sys.exit(f'ABORTA: el ancla aparece {n} veces (tiene que ser única)')

    doc['code'] = code.replace(VIEJO, NUEVO)
    req = urllib.request.Request(f'{BASE}/api/snippets', method='POST',
                                 data=json.dumps(doc).encode(),
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req) as r:
        print('comentario actualizado ·', r.read().decode()[:120])


if __name__ == '__main__':
    main()
