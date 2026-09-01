#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""F5.3 · engancha `menu-juego` (el menú de pausa) desde `sesion-guardia`.

UN SOLO ENGANCHE, y por eso cuelga de `sesion-guardia` y no de los dos autoarranques: el guardia ya
está enganchado en `mundo-autoarranque` y en `editor-autoarranque` (`parche_snp_guardia.py`), así que
colgarse de él llega a los mismos sitios metiendo la línea en un fichero en vez de en dos. Menos
anclas que mantener y ningún sitio donde se pueda quedar la mitad puesta.

Va AL PRINCIPIO por lo mismo que el guardia: lo último de `sesion-guardia` es una cadena de `fetch`
a `/api/yo`, y detrás de una promesa que puede fallar no se pone lo que tiene que correr siempre. El
menú de pausa no depende de ningún permiso —lo necesita hasta el visitante más pelado, porque sin él
Esc le tira la partida— así que no puede vivir dentro de esa cadena.

NO se espera con `await`: instalar el menú es poner un oyente de teclado, y retrasar por eso la
entrada al Mundo sería pagar una carga por algo que solo hace falta cuando alguien pulse Esc.

    python3 herramientas/parche_snp_menu.py
    VOXELFORGE_TOKEN=… python3 herramientas/publica_snippet.py sesion-guardia <el .js>

⚠️ Esto toca la copia de DISCO. Hay dos copias vivas (disco y la que sirve la API), así que después
hay que publicar — el propio script lo recuerda al terminar.
"""
import json
import os
import sys
import tempfile

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SNIPS = os.path.join(RAIZ, 'data/snippets')
DESTINO = 'sesion-guardia'

ANCLA = '// ==MENU-PAUSA=='
BLOQUE = ANCLA + """
// F5.3 · el menú de pausa. Sin `await` y con el fallo a la consola: si `menu-juego` no está
// publicado, el Mundo entra igual y Esc se comporta como siempre.
try { game.snippet('menu-juego').catch(function (e) {
  console.warn('menu-juego: no se pudo cargar el menú de pausa:', e && e.message);
}); } catch (e) { console.warn('menu-juego: no se pudo cargar el menú de pausa:', e && e.message); }
// ==FIN-MENU-PAUSA==

"""


def main():
    ruta = os.path.join(SNIPS, DESTINO + '.json')
    if not os.path.exists(ruta):
        print('ABORTA: no existe %s' % ruta, file=sys.stderr)
        return 1
    with open(ruta, encoding='utf-8') as f:
        doc = json.load(f)
    code = doc.get('code', '')
    if ANCLA in code:
        print('ya lo llevaba, no se toca: %s' % DESTINO)
        return 0

    doc['code'] = BLOQUE + code
    fd, tmp = tempfile.mkstemp(dir=SNIPS, suffix='.tmp')
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
    os.replace(tmp, ruta)
    print('menú de pausa enganchado en: %s' % DESTINO)
    print('publícalo (hay 2 copias vivas):')
    print('  curl -X POST localhost:8500/api/snippets -H "X-VoxelForge-Token: $VOXELFORGE_TOKEN" '
          '-d @data/snippets/%s.json' % DESTINO)
    return 0


if __name__ == '__main__':
    sys.exit(main())
