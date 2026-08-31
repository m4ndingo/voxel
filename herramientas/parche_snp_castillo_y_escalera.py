#!/usr/bin/env python3
# @area: snippets
#
# Restaura dos ediciones que el dueño ya tenía hechas EN VIVO sobre `mundo-autoarranque` y que un
# rebase (2026-08-31, arreglo del escape del multiverso al historial público) barrió del disco al
# devolver el fichero a su contenido committeado. No son mías: estaban en el snippet antes de que yo
# tocara nada esta sesión (capturadas en la lectura previa al parche de REQ-TNT1).
#
#   · el material de la escalera pasó de 'hab:escalera' a 'asset:assets/escalera.vox.json'.
#   · 'castillo' es el gancho que dispara el snippet «castillo-del-dueno» (ya commiteado aparte,
#     26a979b→e38ee80): sin este material definido en la tabla, romperlo no levanta nada.
#
# ⛔ Idempotente y POR ANCLA; ⛔ nunca reescribe el fichero entero. Trabaja sobre el disco directamente
# (como parche_snp_relevo_multi.py), no por API, para poder correr aunque el servidor no esté arriba.
#
#     python3 herramientas/parche_snp_castillo_y_escalera.py --comprobar
#     python3 herramientas/parche_snp_castillo_y_escalera.py
import argparse
import json
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUTA = os.path.join(RAIZ, 'data', 'snippets', 'mundo-autoarranque.json')

CAMBIOS = [
    (
        'la escalera es asset:assets/escalera.vox.json, no hab:escalera',
        """    'hab:escalera': { trepable: true, subida: 4, bajada: 5, nota: 'Avanza contra ella para subir, retrocede para bajar.' },""",
        """    'asset:assets/escalera.vox.json': { trepable: true, subida: 4, bajada: 5, nota: 'Avanza contra ella para subir, retrocede para bajar.' },""",
    ),
    (
        "'castillo' dispara castillo-del-dueno",
        """    'tnt': { nota: 'Sorpresa: explota!',
      alRomper: function (c) { return game.snippet('explosion-tnt', c); } },""",
        """    'castillo': { nota: 'Sorpresa: rompelo con el pico y se levanta un castillo.',
      alRomper: function (c) { return game.snippet('castillo-del-dueno', c); } },
    'tnt': { nota: 'Sorpresa: explota!',
      alRomper: function (c) { return game.snippet('explosion-tnt', c); } },""",
    ),
]


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--comprobar', action='store_true')
    a = p.parse_args()

    with open(RUTA, encoding='utf-8') as f:
        snip = json.load(f)
    code = snip.get('code') or ''

    nuevo, hechos, ya = code, [], []
    for que, viejo, bueno in CAMBIOS:
        if bueno in nuevo:
            ya.append(que)
            continue
        n = nuevo.count(viejo)
        if n != 1:
            print('⛔ el ancla de «%s» aparece %d veces (esperaba 1).\n'
                  '   el snippet ha cambiado debajo: no lo toco.' % (que, n))
            return 2
        nuevo = nuevo.replace(viejo, bueno)
        hechos.append(que)

    for q in ya:
        print('   ya estaba · %s' % q)
    for q in hechos:
        print('   cambio    · %s' % q)
    if not hechos:
        print('nada que hacer: ya está.')
        return 0
    if a.comprobar:
        print('\n--comprobar: no he tocado nada.')
        return 0

    snip['code'] = nuevo
    tmp = RUTA + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(snip, f, ensure_ascii=False, indent=2)
    os.replace(tmp, RUTA)
    print('\nescrito en disco (%d → %d caracteres)' % (len(code), len(nuevo)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
