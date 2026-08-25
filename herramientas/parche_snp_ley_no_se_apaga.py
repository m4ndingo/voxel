#!/usr/bin/env python3
# «que game.luzLey.on() no haya que teclearlo en cada recarga» (dueño, 2026-08-25).
#
# EL SÍNTOMA
#   Cargas el mundo y `game.luzLey.diag()` dice `bake: 'Radiance Cascades LUT'`. Tecleas
#   `game.luzLey.on()` y ya va bien — pero hay que hacerlo TODAS las veces.
#
# QUIÉN LO APAGA (no es app.js)
#   `web/app.js:7594` ya trae `luzLey:true` por defecto, así que el motor arranca bien. Lo que pasa es
#   que `mundo-autoarranque` → `miosd` hace `await game.snippet("parche-luz-dia-ley")`, y ese snippet
#   empieza con:
#
#       if (W.game.luzLey && W.game.luzLey.instalado) W.game.luzLey.off();
#
#   Esa línea es de cuando la Ley VIVÍA EN EL SNIPPET: servía para que re-ejecutarlo no apilase una
#   segunda copia sobre la primera. Desde que la Ley bajó al motor (herramientas/parche_app_luz_ley.py)
#   `game.luzLey` es el DEL MOTOR y su `instalado` vale true al arrancar ⇒ la línea apaga la Ley del
#   motor. Y acto seguido la rama `if (EN_MOTOR)` del final decide —con razón— NO instalar nada, así
#   que nadie la vuelve a encender. Resultado: el mundo arranca con la LUT.
#
# POR QUÉ NO SE ARREGLA EN app.js
#   Añadir un `game.luzLey.on()` al arranque de app.js NO serviría: el snippet corre DESPUÉS y lo
#   volvería a apagar igual. Hay que quitar el apagado, no añadir un encendido que lo persiga.
#
# EL ARREGLO (una línea)
#   Que el reseteo toque sólo una copia PUESTA POR ESTE SNIPPET, nunca la del motor. Se distinguen
#   por `_color`, que es exactamente lo que ya mira `EN_MOTOR` unas líneas más abajo.
#
# Idempotente por ancla, y todo o nada: si el ancla no aparece EXACTAMENTE una vez, aborta sin tocar
# nada (el dueño edita estos snippets en vivo, hay 2 copias vivas). Escritura atómica con os.replace.
#
#   python3 herramientas/parche_snp_ley_no_se_apaga.py
#
# ⚠️ El navegador ya tiene su copia cargada: hace falta RECARGAR para que `miosd` relea el snippet.
import json
import os
import sys
import tempfile

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SNP = lambda id_: os.path.join(RAIZ, 'data', 'snippets', id_ + '.json')

VIEJO = "if (W.game.luzLey && W.game.luzLey.instalado) W.game.luzLey.off();"

NUEVO = (
    "// ⚠️ SOLO se resetea una copia puesta POR ESTE SNIPPET, nunca la del motor. Desde que la Ley\n"
    "// bajó a app.js (herramientas/parche_app_luz_ley.py), `game.luzLey` es el del motor y su\n"
    "// `instalado` ya vale true al arrancar: este off() la apagaba en CADA carga —`miosd` llama a\n"
    "// este snippet— y la rama `EN_MOTOR` de abajo no instala nada, así que nadie la volvía a\n"
    "// encender y el mundo arrancaba con la LUT. La del motor se reconoce por `_color`, que es lo\n"
    "// mismo que mira EN_MOTOR.\n"
    "if (W.game.luzLey && W.game.luzLey.instalado && !('_color' in W.game.luzLey)) W.game.luzLey.off();"
)

# Si esto ya está en el código, el parche ya se aplicó.
MARCA = "!('_color' in W.game.luzLey)) W.game.luzLey.off();"


def main():
    ruta = SNP('parche-luz-dia-ley')
    if not os.path.exists(ruta):
        print('ABORTA: no existe %s' % ruta, file=sys.stderr)
        return 1
    with open(ruta, encoding='utf-8') as f:
        doc = json.load(f)
    code = doc['code']

    if MARCA in code:
        print('parche-luz-dia-ley: ya estaba puesto, no se toca')
        return 0

    n = code.count(VIEJO)
    if n != 1:
        print('ABORTA: el ancla aparece %d veces, esperaba 1 (¿lo editó el dueño?)' % n,
              file=sys.stderr)
        return 1

    doc['code'] = code.replace(VIEJO, NUEVO, 1)

    d = os.path.dirname(ruta)
    fd, tmp = tempfile.mkstemp(dir=d, suffix='.tmp')
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
    os.replace(tmp, ruta)
    print('parche-luz-dia-ley: puesto ✅  (recarga el navegador para que miosd relea el snippet)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
