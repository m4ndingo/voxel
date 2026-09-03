#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""REQ-PLANT1 · le pone la FICHA del carrusel a los generadores de bioma que ya existían.

El dueño lo pidió así: «*podria haber metadatos en esos snippets para indicar la foto, el titulo de la
ficha, una descripcion, etc*». La ficha va DENTRO del generador y no en un catálogo aparte, para que
añadir un bioma sea una sola cosa (publicar su snippet) y no dos que hay que acordarse de cuadrar.

⛔ POR QUÉ ESTO ES UN PARCHE Y NO UN FICHERO ESCRITO A MANO
Hay DOS copias vivas de cada snippet — la de `data/snippets/` y la que sirve el servidor — y la única
forma de publicar es `POST /api/snippets`. Además el POST **arma el documento de cero**: si mandas la
ficha sin el código, te quedas sin código. Por eso aquí se LEE el snippet entero, se le añade la
ficha y se devuelve completo.

Es idempotente: pasarlo dos veces deja lo mismo. Y no toca `code` ni una coma — se relee tal cual y
se reenvía, así que un generador no puede romperse por ejecutar esto.

    python3 herramientas/parche_snp_plantillas.py            # contra localhost:8500
    python3 herramientas/parche_snp_plantillas.py --ver      # sólo enseña lo que haría

⚠️ Las FOTOS no las pone esto: las hace el dueño. El campo `foto` apunta a
`/data/ui/plantillas/<id>.jpg` — bajo `/data/ui/`, que es de las pocas carpetas de `data/` que se
siguen sirviendo en modo público (F0.2). Mientras el fichero no exista, el carrusel enseña un
marcador; en cuanto se suelte ahí, aparece sin tocar nada.
"""
import json
import os
import sys
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SNIPS = os.path.join(RAIZ, 'data', 'snippets')
BASE = os.environ.get('VOXEL_URL', 'http://localhost:8500')
TOKEN = os.environ.get('VOXELFORGE_TOKEN', '').strip()

# ⚠️ Los ids son los NOMBRES DE FICHERO reales, con sus erratas incluidas: `fornite` (sin la «t») y
# `monta-as` (la «ñ» se perdió al crear el fichero). Copiarlos «bien» es no encontrarlos.
#
# `orden` decide el sitio en el carrusel; las dos opciones especiales van en 900-901
# (`servidor/plantillas.py`), así que los biomas se quedan por debajo.
#
# `frases` son las de la pantalla de carga, y el dueño las quiso «épicas, informativas y con guasa a
# la vez»: van rotando mientras el mundo se construye.
#
# ⚠️ `lado` y `ladoMax` son MEMORIA DEL NAVEGADOR, no disco. Los cinco generadores escalan con el
# tamaño del mapa (`game.worldSize`), así que a 256 hacen cuatro veces el trabajo de 128 — y cuatro
# veces la superficie que hay que mallar. La ciudad a 256×256 dejó al navegador del dueño sin memoria
# («borrame-6», 2026-09-02), así que las densas se quedan en 128 y las de terreno abierto llegan a
# 192. Subirlos es de una línea; bajarlos, después de que a alguien se le muera la pestaña, no.
FICHAS = {
    'construye-oceanos-y-playas': {
        'titulo': 'Océanos y playas',
        'descripcion': 'Archipiélagos, costas de arena y palmeras curvadas sobre el agua.',
        'etiquetas': ['🌊 océano', '🏝️ islas', '🌴 palmeras'],
        'lado': 128, 'ladoMax': 192,
        'orden': 100,
        'frases': ['Llenando los océanos…', 'Curvando las palmeras…',
                   'Colgando cocos, uno a uno…', 'Peinando la arena de las playas…'],
    },
    'construye-monta-as': {
        'titulo': 'Montañas',
        'descripcion': 'Cordilleras con bosque, lagos claros y nieve en las cumbres altas.',
        'etiquetas': ['⛰️ cumbres', '🌲 bosque', '❄️ nieve'],
        'lado': 128, 'ladoMax': 192,
        'orden': 200,
        'frases': ['Levantando cordilleras…', 'Plantando el bosque…',
                   'Nevando las cumbres…', 'Llenando los lagos (con agua, tranquilo)…'],
    },
    'construye-badlands': {
        'titulo': 'Badlands',
        'descripcion': 'Agujas de roca, cañones profundos y estratos minerales de colores.',
        'etiquetas': ['🏜️ desierto', '🪨 cañones', '⛏️ oro'],
        'lado': 128, 'ladoMax': 192,
        'orden': 300,
        'frases': ['Tallando cañones milenarios…', 'Afilando las agujas de roca…',
                   'Escondiendo vetas de oro…', 'Pintando los estratos a mano…'],
    },
    'construye-fortnite-chapter-2-island': {
        'titulo': 'La isla',
        'descripcion': 'Una isla grande con biomas variados, colinas y sitios que explorar.',
        'etiquetas': ['🗺️ isla', '🌄 colinas', '🧭 explorar'],
        'lado': 128, 'ladoMax': 192,
        'orden': 400,
        'frases': ['Dibujando la costa…', 'Repartiendo los biomas…',
                   'Escondiendo secretos por ahí…', 'Colocando el último arbusto…'],
    },
    'construye-fornite-tilted-towers': {
        'titulo': 'Ciudad de torres',
        'descripcion': 'Un casco urbano denso de torres, calles y tejados por los que saltar.',
        'etiquetas': ['🏙️ ciudad', '🧱 ladrillo', '🪜 tejados'],
        'lado': 128, 'ladoMax': 128,
        'orden': 500,
        'frases': ['Levantando las torres…', 'Asfaltando las calles…',
                   'Poniendo ventanas (muchas ventanas)…', 'Subiendo a los tejados…'],
    },
}


def publica(sid, ficha, ver):
    ruta = os.path.join(SNIPS, sid + '.json')
    if not os.path.exists(ruta):
        print(f'  ⛔ {sid}: no existe en data/snippets/ — ¿cambió el nombre del fichero?')
        return False
    with open(ruta, encoding='utf-8') as f:
        doc = json.load(f)

    completa = dict(ficha)
    completa['foto'] = ficha.get('foto') or f'/data/ui/plantillas/{sid}.jpg'
    if doc.get('ficha') == completa:
        print(f'  ={sid}: ya la tiene, no toco nada')
        return True
    if ver:
        print(f'  ~ {sid}: le pondría «{completa["titulo"]}» ({len(doc.get("code",""))} B de código intactos)')
        return True

    # El documento se manda ENTERO: el POST lo rearma de cero y lo que no viaje se pierde.
    cuerpo = {'id': sid, 'name': doc.get('name') or completa['titulo'],
              'code': doc.get('code', ''), 'ficha': completa}
    if doc.get('categoria'):
        cuerpo['categoria'] = doc['categoria']
    if doc.get('protegido') is True:
        cuerpo['protegido'] = True
    datos = json.dumps(cuerpo, ensure_ascii=False).encode('utf-8')
    pet = urllib.request.Request(BASE + '/api/snippets', data=datos, method='POST',
                                 headers={'Content-Type': 'application/json'})
    if TOKEN:
        pet.add_header('X-VoxelForge-Token', TOKEN)
    try:
        with urllib.request.urlopen(pet, timeout=20) as r:
            r.read()
        print(f'  ✓ {sid}: «{completa["titulo"]}»')
        return True
    except urllib.error.HTTPError as e:
        print(f'  ⛔ {sid}: HTTP {e.code} — {e.read()[:200].decode("utf-8", "replace")}')
        return False
    except Exception as e:
        print(f'  ⛔ {sid}: {e}')
        return False


def main():
    ver = '--ver' in sys.argv
    print(f'Fichas de plantilla → {BASE}' + ('  (sólo mirar)' if ver else ''))
    ok = sum(publica(sid, ficha, ver) for sid, ficha in FICHAS.items())
    print(f'\n{ok} de {len(FICHAS)}')
    return 0 if ok == len(FICHAS) else 1


if __name__ == '__main__':
    sys.exit(main())
