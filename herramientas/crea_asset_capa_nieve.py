#!/usr/bin/env python3
# «Cuando el voxel de 1×1 pequeño de nieve hace contacto con el suelo se convierte en un bloque de
#  16×16×16 voxels» (dueño, 2026-08-19).
#
# Tiene razon y es culpa de haber cuajado en `nieve`, que es un bloque MACIZO: el copo pasa de 1/16 de
# bloque a un cubo entero de golpe. La nieve posada no es un cubo, es una CAPA.
#
# Asi que se dibuja una: `capa-de-nieve` = las 2 lonchas de arriba de `nieve.vox.json`, tal cual (mismo
# color, misma textura), en un asset de 16x16x2. Al no ser 16^3, el motor la trata como geometria FINA
# (mc.finoRejilla): se ve como una alfombra de 2/16 de alto sobre el suelo, se pisa por encima y no
# tapa el bloque de debajo. Es lo que hace Minecraft con su snow layer.
#
# No se toca `nieve.vox.json` — sale de el, no lo modifica.
#
#   python3 herramientas/crea_asset_capa_nieve.py
import json, os, sys, tempfile

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FUENTE = os.path.join(RAIZ, 'assets', 'nieve.vox.json')
DESTINO = os.path.join(RAIZ, 'assets', 'capa-de-nieve.vox.json')
INDICE = os.path.join(RAIZ, 'assets', 'index.json')
ID = 'capa-de-nieve'
ALTO = 2                 # lonchas de las 16 que se quedan. En asset, Z es la vertical del mundo.


def guarda(ruta, doc):
    d = os.path.dirname(ruta)
    fd, tmp = tempfile.mkstemp(dir=d, suffix='.tmp')
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False)
    os.replace(tmp, ruta)


def main():
    src = json.load(open(FUENTE, encoding='utf-8'))
    tam = src['size']
    n = tam if isinstance(tam, int) else tam['z']
    vox = {}
    for k, c in src['voxels'].items():
        x, y, z = (int(v) for v in k.split(','))
        if z >= n - ALTO:                       # las de arriba, que son las que se ven
            vox['%d,%d,%d' % (x, y, z - (n - ALTO))] = c
    if not vox:
        print('ABORTA: la fuente no tiene voxeles arriba', file=sys.stderr)
        return 1
    doc = {
        'format': 'voxelforge-1',
        'size': {'x': 16, 'y': 16, 'z': ALTO},
        'meta': {'name': 'Capa de nieve', 'type': 'textura',
                 'role': 'Bloque · capa de nieve (snow layer)', 'icon': '❄️',
                 'description': 'Las 2 lonchas de arriba de `nieve`. Al no ser 16³ el motor la trata '
                                'como geometría fina: alfombra de 2/16 de alto, se pisa por encima.'},
        'voxels': vox,
    }
    guarda(DESTINO, doc)

    ix = json.load(open(INDICE, encoding='utf-8'))
    fila = {'id': ID, 'name': 'Capa de nieve', 'role': 'Bloque · capa de nieve (snow layer)',
            'icon': '❄️', 'type': 'textura', 'group': 'Bloques de construcción',
            'size': {'x': 16, 'y': 16, 'z': ALTO}, 'file': 'assets/%s.vox.json' % ID,
            'savedAt': '2026-08-19T21:30:00', 'createdAt': '2026-08-19T21:30:00', 'count': len(vox)}
    for i, a in enumerate(ix):
        if a.get('id') == ID:
            ix[i] = fila
            break
    else:
        ix.append(fila)
    guarda(INDICE, ix)
    print('%s: %d voxeles, 16×16×%d' % (ID, len(vox), ALTO))
    return 0


if __name__ == '__main__':
    sys.exit(main())
