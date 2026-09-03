#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""REQ-ASSET1 · Marca como «del mundo» los habitantes heredados que ALGUIEN USA.

EL PROBLEMA QUE RESUELVE. Al poner autoría (`servidor/autoria.py`), los habitantes de antes del
ticket se quedan sin autor: son HEREDADOS, y un heredado solo lo ve el dueño del servidor. Eso es lo
que el dueño pidió para sus dibujos sueltos... pero unos cuantos de esos ficheros están ESTAMPADOS
dentro de mundos y snippets (`hab:seta`, `hab:escalera`, `hab:mesa-x2`…). Si ésos se vuelven
invisibles, esos mapas se abren con agujeros para todo el que no sea el dueño.

LA REGLA, y por qué no es una lista escrita a mano: se marca `compartido: true` en los habitantes a
los que alguien se REFIERE — un `hab:<id>` dentro de un snippet, de la cabecera de un mundo o de un
`.js` de redstone. Los demás se quedan privados del dueño, que es justo lo que se pedía. Una lista a
mano envejecería mal; esto se vuelve a correr cuando haga falta y da la respuesta de hoy.

⛔ NO BORRA NI REESCRIBE NADA MÁS. Añade un campo (`compartido`) a los que lo necesitan y deja el
resto del documento intacto. Idempotente: pasarlo dos veces no cambia nada la segunda.
⛔ No inventa `autor`: no hay ninguna cuenta que sea el dueño del servidor (el dueño entra por token),
así que ponerle un uid falso sería mentir. Sin `autor` = heredado, y así se queda.

    python3 herramientas/adopta_habitantes.py --comprobar    # dice qué haría
    python3 herramientas/adopta_habitantes.py
"""
import argparse
import json
import os
import re
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STORE = os.path.join(BASE, 'data', 'habitantes')

# Dónde se busca un `hab:<id>`. Los mundos v2 guardan la paleta en la cabecera `.json` (de 300 B a
# 30 KB): se leen ENTEROS sin problema, y ⛔ no se toca ni un `.vox` ni un `.vox.json`.
DONDE = (
    ('data/snippets', ('.json',)),
    ('data/worlds', ('.json',)),
    ('redstone', ('.js', '.json')),
    ('data/agentes', ('.json',)),
)

REF = re.compile(r'hab:([A-Za-z0-9_-]+)')


def referenciados():
    """Todos los `hab:<id>` que aparecen en algún sitio del repo."""
    vistos = set()
    for rel, exts in DONDE:
        raiz = os.path.join(BASE, rel)
        if not os.path.isdir(raiz):
            continue
        for dp, _dn, fns in os.walk(raiz):
            for fn in fns:
                if not fn.endswith(exts):
                    continue
                try:
                    with open(os.path.join(dp, fn), encoding='utf-8', errors='replace') as f:
                        vistos.update(REF.findall(f.read()))
                except Exception:
                    continue
    return vistos


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--comprobar', action='store_true', help='enseña qué haría y no toca nada')
    a = ap.parse_args()

    # ⛔ Se escribe con `atomic_dump` de `server.py` — el temporal + `os.replace` que usa el resto
    # del repo. Un `json.dump` directo sobre el fichero vivo deja un habitante a medias si el
    # servidor lo está leyendo en ese instante.
    sys.path.insert(0, BASE)
    from servidor import autoria
    from server import atomic_dump

    usados = referenciados()
    comparte, ya, privados = [], [], []

    for fn in sorted(os.listdir(STORE)):
        if not fn.endswith('.json'):
            continue
        idd = fn[:-5]
        ruta = os.path.join(STORE, fn)
        try:
            with open(ruta, encoding='utf-8') as f:
                doc = json.load(f)
        except Exception as e:
            print('  ⛔ %s: no se puede leer (%s)' % (idd, e))
            continue
        if autoria.autor_de(doc):
            continue                                  # ya tiene autor: no es heredado, no es asunto nuestro
        if autoria.es_del_mundo(doc):
            ya.append(idd)
        elif idd in usados:
            comparte.append((idd, ruta, doc))
        else:
            privados.append(idd)

    print('HEREDADOS en data/habitantes/ (%d en total)\n' % (len(comparte) + len(ya) + len(privados)))
    print('  del mundo (los usa alguien) · %d' % (len(comparte) + len(ya)))
    for idd, _r, _d in comparte:
        print('      + %s' % idd)
    for idd in ya:
        print('      = %s (ya lo estaba)' % idd)
    print('\n  privados del dueño (no los referencia nadie) · %d' % len(privados))
    for idd in privados:
        print('      · %s' % idd)

    if not comparte:
        print('\nnada que hacer.')
        return 0
    if a.comprobar:
        print('\n--comprobar: no he tocado nada.')
        return 0

    for idd, ruta, doc in comparte:
        doc['compartido'] = True
        atomic_dump(doc, ruta)

    print('\nmarcados %d como «del mundo».' % len(comparte))
    return 0


if __name__ == '__main__':
    sys.exit(main())
