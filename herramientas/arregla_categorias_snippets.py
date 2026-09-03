#!/usr/bin/env python3
"""Cuadra la MAYÚSCULA de la `categoria` de los snippets con la categoría que ya existe.

El problema, que se ve solo en el editor de código: las pestañas se agrupan por el texto exacto de
`categoria`, así que un snippet guardado como «herramientas» abre **una segunda pestaña** al lado de
«Herramientas», con un elemento dentro. Dos pestañas iguales que sólo se diferencian en una letra
(dueño, 2026-09-02: «*con 1 de las dos vale*»).

⛔ Se arregla el DATO, no el motor: agrupar sin distinguir mayúsculas sería tocar `app.js`, y para un
nombre mal escrito en dos ficheros eso no se paga. Lo que hace este script es escribir la categoría
con la misma forma que la mayoritaria.

⚠️ **No pasa por `POST /api/snippets` a propósito.** Publicar reescribe el documento entero y le pone
un `savedAt` nuevo, que es la clave por la que el servidor ORDENA la lista: cambiar una mayúscula
mandaría el snippet a lo alto del panel como si se acabara de tocar. Aquí se toca **sólo** el campo
`categoria` del `.json`, sin rozar `code` ni `savedAt`, y el servidor lee del disco en cada petición
(`list_snips`), así que no hay segunda copia que sincronizar.

Idempotente: pasarlo dos veces no cambia nada la segunda.

    python3 herramientas/arregla_categorias_snippets.py [--aplica]
"""
import json
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SNIPS = os.path.join(RAIZ, 'data', 'snippets')

# Lo que se corrige, y a qué. La izquierda es lo que hay escrito; la derecha, la categoría que ya
# existía con ese nombre. Se listan a mano en vez de «la que más se repita gana» porque una lista
# corta se lee y se discute; una regla automática renombraría categorías nuevas de una sola pieza.
CUADRE = {
    'herramientas': 'Herramientas',
}


def main():
    aplica = '--aplica' in sys.argv
    tocados = []
    for fn in sorted(os.listdir(SNIPS)):
        if not fn.endswith('.json'):
            continue
        ruta = os.path.join(SNIPS, fn)
        try:
            with open(ruta, encoding='utf-8') as f:
                doc = json.load(f)
        except Exception as e:
            print(f'  ⚠️  {fn}: no se puede leer ({e})')
            continue
        clave = 'categoria' if 'categoria' in doc else ('category' if 'category' in doc else None)
        if not clave:
            continue
        actual = (doc.get(clave) or '').strip()
        buena = CUADRE.get(actual)
        if not buena or buena == actual:
            continue
        tocados.append((fn, actual, buena))
        if aplica:
            doc[clave] = buena
            tmp = ruta + '.tmp'
            with open(tmp, 'w', encoding='utf-8') as f:
                json.dump(doc, f, ensure_ascii=False, indent=2)
            os.replace(tmp, ruta)          # atómico: el servidor puede estar leyendo

    if not tocados:
        print('✓ nada que cuadrar: ninguna categoría se repite cambiando la mayúscula')
        return 0
    for fn, de, a in tocados:
        print(('✓ ' if aplica else '· ') + f'{fn}: «{de}» → «{a}»')
    if not aplica:
        print('\n(sólo mirando; con --aplica se escribe)')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
