#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""SALIR del menú de pausa vuelve AL EDITOR cuando el Mundo es una capa del editor.

El fallo, tal cual lo contó el dueño: «entro en modo diseño 2d/3d, voy al mundo, hago ESC, le doy a
SALIR, y veo lo que antes era menu.html en lugar del editor 2d/3d».

Y tenía razón, porque el Mundo se abre de DOS maneras y SALIR no significa lo mismo en las dos:

  · Como CAPA encima del editor (`#mc-modal`, en `/index.html`). Antes de que hubiera menú de pausa,
    el último escalón de Esc era `closeWorld()`: se cerraba la capa y aparecía el editor. El menú
    heredó todos los escalones menos ese, y lo cambió por «irse a otra página» — que en desarrollo
    era `/` = el editor y no se notaba, y en modo público es `/` = la PORTADA. De ahí que salir del
    Mundo dejara al dueño en el menú de entrar, sin camino de vuelta al editor.
  · Como PÁGINA propia (`/map/<slug>`). Aquí no hay editor detrás al que volver, así que salir sí es
    irse del juego, a la portada. Eso se queda igual.

⛔ Ley de oro: esto NO toca `app.js`. `closeWorld` es una función global del motor y un snippet corre
en ámbito global, así que la alcanza sin modificar nada — que es exactamente para lo que existen los
snippets (`docs/desarrollo-desacoplado.md`).

Se PARCHEA y no se reescribe (hay 2 copias vivas del snippet), es idempotente por su ancla y toca lo
mínimo: un bloque nuevo entre anclas y dos sustituciones exactas.

    python3 herramientas/parche_snp_menu_salir.py
    curl -X POST localhost:8500/api/snippets -d @data/snippets/menu-juego.json
"""
import json
import os
import sys
import tempfile

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SNIPS = os.path.join(RAIZ, 'data', 'snippets')
DESTINO = 'menu-juego'

ANCLA = '// ==SALIR-AL-EDITOR=='

BLOQUE = ANCLA + '''
// El Mundo se abre de dos maneras y SALIR no significa lo mismo en las dos: encima del editor es
// CERRAR la capa (el último escalón que hacía Esc antes de que existiera este menú), y en su propia
// página es irse del juego. Mandarlo siempre a `/` perdía el editor en cuanto el servidor pasaba a
// modo público, porque allí `/` es la portada.
M.enElEditor = function () {
  try {
    if (location.pathname.indexOf('/map/') === 0) return false;   // página propia: no hay editor detrás
    if (typeof closeWorld !== 'function') return false;           // motor sin capa de Mundo
    var capa = document.getElementById('mc-modal');
    return !!capa && !capa.hidden;
  } catch (e) { return false; }
};

// El rótulo dice a dónde lleva. Se puede cambiar sin miedo porque la identidad del botón es su
// `data-osd`, no su texto (lo pone `M.boton`) — al revés que en los botones de `game.osd` a pelo.
M.textoSalir = function () { return M.enElEditor() ? 'VOLVER AL EDITOR' : 'SALIR'; };

M.salir = function () {
  if (!M.enElEditor()) { location.href = '/'; return true; }
  // Cerrar la pantalla ANTES que el Mundo: al revés queda la capa OSD encima del editor, sin nada
  // debajo que la cierre.
  try { G.osd.cerrar(); } catch (e) {}
  closeWorld();
  return true;
};
// ==FIN-SALIR-AL-EDITOR==

'''

# (viejo, nuevo). Textos exactos: si el snippet cambia y dejan de aparecer, el parche ABORTA en vez
# de dejar el trabajo a medias.
CAMBIOS = [
    ("M.boton('salir', 'SALIR')",
     "M.boton('salir', M.textoSalir())"),
    ("G.osd.alPulsar(M.CLAVE + 'salir', function () { location.href = '/'; }, yo);",
     "G.osd.alPulsar(M.CLAVE + 'salir', function () { M.salir(); }, yo);"),
    ("M.VERSION = 'v1.0';",
     "M.VERSION = 'v1.1';"),
]

# El bloque se mete justo antes de esto, que es donde vive el resto de lo que hacen los botones.
ANTES_DE = 'M.continuar = function () {'


def main():
    ruta = os.path.join(SNIPS, DESTINO + '.json')
    if not os.path.exists(ruta):
        print('ABORTA: no existe %s' % ruta, file=sys.stderr)
        return 1

    with open(ruta, encoding='utf-8') as f:
        doc = json.load(f)
    code = doc.get('code', '')

    if ANCLA in code:
        print('ya lo lleva, no se toca: %s' % DESTINO)
        return 0

    if ANTES_DE not in code:
        print('ABORTA: no encuentro «%s» en %s' % (ANTES_DE, DESTINO), file=sys.stderr)
        return 1
    for viejo, _ in CAMBIOS:
        if code.count(viejo) != 1:
            print('ABORTA: «%s» aparece %d veces en %s (esperaba 1)'
                  % (viejo, code.count(viejo), DESTINO), file=sys.stderr)
            return 1

    for viejo, nuevo in CAMBIOS:
        code = code.replace(viejo, nuevo)
    code = code.replace(ANTES_DE, BLOQUE + ANTES_DE, 1)
    doc['code'] = code

    fd, tmp = tempfile.mkstemp(dir=SNIPS, suffix='.tmp')
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
    os.replace(tmp, ruta)

    print('SALIR arreglado en: %s' % DESTINO)
    print('publícalo:  curl -X POST localhost:8500/api/snippets -d @data/snippets/%s.json' % DESTINO)
    return 0


if __name__ == '__main__':
    sys.exit(main())
