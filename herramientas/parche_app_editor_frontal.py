#!/usr/bin/env python3
# «ahora se ve correcto, aplicar parche a app.js» (dueño, 2026-08-25).
#
# El arreglo nació como snippet `editor-frontal-lado` (LEY DE ORO: aislado, validado en caliente, y solo
# cuando el dueño lo da por bueno baja al motor). Ya está dado por bueno: esto lo baja.
#
# QUÉ ARREGLA
#   Queja del dueño: «hay una discrepancia entre el editor 2d y 3d, los dibujos salen espejados: como se
#   diseña en la vista 2d, al ir a la vista 3d sale espejado; si es de izq→der sale de der→izq».
#
#   NO era un espejo: era que UNA vista miraba el modelo desde el otro lado. Medido en
#   tests/test_espejo_2d3d.js:
#
#       vista 2D (Capas)          +X a la DERECHA   ← lo que se dibuja
#       miniatura iso (rot=0)     +X a la DERECHA   ✓
#       vista 3D libre (defecto)  +X a la DERECHA   ✓
#       botón «Frontal»           +X a la IZQUIERDA ✗   ← el único que discrepaba
#
#   `toggleCamFront` ponía `view3d.yaw = 0`, y con yaw=0 la profundidad de +Y sale POSITIVA (+Y se
#   aleja) ⇒ la cámara queda en −Y, asomada por el borde de ARRIBA del plano 2D. Mirando un plano desde
#   arriba del papel, la izquierda y la derecha se cambian. Con `yaw = π` la cámara se pone en +Y, que
#   además es donde está el jugador en el mapa (editor-Y → mundo-Z, y un jugador con yaw 0 mira a −Z):
#   el «Frontal» pasa a enseñar lo mismo que Capas Y lo mismo que se verá al estampar la pieza.
#
# LO QUE NO SE TOCA, por más que lo parezca al leerlo: el `-x1` de `project3d` («espejo horizontal para
# coincidir con la miniatura iso»). Con la cámara libre compensa exacto y las otras TRES vistas ya
# estaban de acuerdo entre sí; quitarlo las rompería las tres para arreglar una.
#
# QUÉ DEJA EN web/app.js
#   1. `MC_FRONTAL_YAW` = Math.PI, con el porqué al lado (una constante con nombre, no un π suelto: es
#      lo que busca el guardián y lo que mira el snippet para apartarse).
#   2. `toggleCamFront` la usa en vez del 0.
#   3. El comentario de encima, que decía «yaw=pitch=0», puesto al día.
#
# ES IDEMPOTENTE (mira la MARCA) y TODO O NADA: comprueba las anclas antes de escribir, y escribe con
# temp + os.replace. Se puede volver a lanzar sin miedo:
#
#     python3 herramientas/parche_app_editor_frontal.py
#
# Después: regenerar SYMBOLS.md (el parche añade líneas y corre las que van detrás) y pasar
# tests/test_espejo_2d3d.js y tests/test_symbols_sync.js.
import os
import sys
import tempfile

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.join(RAIZ, 'web', 'app.js')

MARCA = 'MC_FRONTAL_YAW'

# (ancla, texto nuevo) — cada ancla tiene que salir EXACTAMENTE una vez.
CAMBIOS = [
    # 1 · el comentario del botón, al día, + la constante con su porqué
    ("// Alternar entre la orientación libre actual y la proyección ortogonal frontal "
     "(yaw=pitch=0, se ve X↔horizontal, Z↔vertical)\n",

     "// Lado desde el que mira el botón «Frontal». π, NO 0 (queja del dueño, 2026-08-25: «*como se diseña\n"
     "// en la vista 2d, al ir a la vista 3d sale espejado; si es de izq→der sale de der→izq*»). Con yaw=0 la\n"
     "// profundidad de +Y sale POSITIVA —o sea, +Y se aleja— y la cámara queda en −Y: asomada por el borde de\n"
     "// ARRIBA del plano de Capas. Mirando un plano desde arriba del papel, la izquierda y la derecha se\n"
     "// cambian, y de ahí el «espejo» (que no lo era: era el otro lado). Con π la cámara se pone en +Y, que\n"
     "// además es DONDE ESTARÁ EL JUGADOR en el mapa —editor-Y es la profundidad, editor-Y → mundo-Z, y un\n"
     "// jugador con yaw 0 mira hacia −Z—, así que el «Frontal» enseña a la vez lo que se acaba de dibujar en\n"
     "// Capas y lo que se verá al estampar la pieza.\n"
     "// ⛔ El `-x1` de project3d («espejo horizontal…») NO tiene nada que ver, por más que lo parezca al\n"
     "// leerlo: con la cámara libre compensa exacto, y el 2D, la miniatura iso y la vista 3D libre ya estaban\n"
     "// de acuerdo entre sí. Quitarlo rompería esas tres para arreglar ésta. Guardián: tests/test_espejo_2d3d.js.\n"
     "const MC_FRONTAL_YAW = Math.PI;\n"
     "// Alternar entre la orientación libre actual y la proyección ortogonal frontal "
     "(pitch=0 y yaw=MC_FRONTAL_YAW: se ve X↔horizontal, Z↔vertical, con +X a la derecha como en Capas)\n"),

    # 2 · el preset
    ("  else { camSaved={yaw:view3d.yaw, pitch:view3d.pitch}; view3d.yaw=0; view3d.pitch=0; camFront=true; }",
     "  else { camSaved={yaw:view3d.yaw, pitch:view3d.pitch}; view3d.yaw=MC_FRONTAL_YAW; view3d.pitch=0; camFront=true; }"),
]


def main():
    with open(APP, encoding='utf-8') as f:
        src = f.read()

    if MARCA in src:
        print('app.js: el «Frontal» ya estaba arreglado, no se toca')
        return 0

    # Todo o nada: se comprueban TODAS las anclas antes de escribir una sola.
    for ancla, _ in CAMBIOS:
        n = src.count(ancla)
        if n != 1:
            print('ABORTA: el ancla %r aparece %d veces, esperaba 1' % (ancla[:60], n), file=sys.stderr)
            return 1

    for ancla, nuevo in CAMBIOS:
        src = src.replace(ancla, nuevo, 1)

    d = os.path.dirname(APP)
    fd, tmp = tempfile.mkstemp(dir=d, suffix='.tmp')
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        f.write(src)
    os.replace(tmp, APP)
    print('app.js: «Frontal» arreglado ✅  (%d retoques)' % len(CAMBIOS))
    print('        ahora: regenera SYMBOLS.md y pasa test_espejo_2d3d.js + test_symbols_sync.js')
    return 0


if __name__ == '__main__':
    sys.exit(main())
