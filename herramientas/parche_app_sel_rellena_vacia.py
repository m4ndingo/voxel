#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# «funcionan bien los dos parches, aplicarlos app.js "sel-rellena-vacia" y "pegar-escala"» (dueño,
# 2026-08-29).
#
# El arreglo nació como snippet `sel-rellena-vacia` (LEY DE ORO: aislado, validado en caliente, y sólo
# cuando el dueño lo da por bueno baja al motor). Ya está dado por bueno: esto lo baja.
#
# QUÉ ES
#   Con la herramienta Seleccionar y la caja VACÍA, clic en una ranura que lleva una PIEZA contestaba
#   «Nada que reemplazar» y no hacía nada, aunque el gesto sin Shift significa «rellena también el aire»
#   (dueño: «*sube seleccion pero nada en ella (vacia), clic en ranura dice "Nada que reemplazar" pero en
#   realidad hay "aire" que reemplazar*»).
#
# DÓNDE ESTABA, que explica las tres frases del dueño de un tirón:
#   · ranura con un 16³ MACIZO → es `blockLike` (app.js:20579), va a `mc.hotbar` como un id de la paleta
#     y lo atiende `mcSelectFillId`, que YA elige `mcSelForEachConAire` cuando no le piden «sólo
#     sólidos». Por eso «*si tiene 16x16x16 voxels funciona*».
#   · ranura con MENOS DE 16³ → es una PIEZA, va a `mc.slotStruct` y lo atiende `mcSelectFillPieza`.
#     Ésa, para resolver la clave a un id, tiene que ESCRIBIR UNA PRIMERA CELDA por el camino de plantar
#     a mano (`mcPonEnRejilla`, el único que da de alta la clave en la paleta), y la buscaba SIEMPRE con
#     `mcSelForEach` —sólidos—. Sin un solo sólido no hay celda semilla y salía por «Nada que
#     reemplazar». De ahí también el «*paso extra*»: rellenar antes con un sólido le dejaba la semilla.
#
# QUÉ DEJA EN web/app.js: dos líneas de `mcSelectFillPieza`. La semilla se busca con el MISMO reparto que
# ya hace `mcSelectFillId` doce líneas más abajo (`soloSolidos ? mcSelForEach : mcSelForEachConAire`), y
# el aviso pasa a decir lo que dice el otro camino cuando no hay nada. Nada más: el resto de la función
# —resolver la clave, la postura, el gesto de historial— no se toca.
#
# ⛔ SHIFT+RANURA SIGUE SIN RELLENAR. Ahí `soloSolidos` es true: «sólo sólidos» y no hay ninguno ⇒ no hay
#    nada que reemplazar de verdad. Convertir ese gesto de REEMPLAZAR en uno de CREAR sería inventarse lo
#    que el dueño no ha pedido, y es justo lo que mide §4 de la sonda.
#
# LO QUE NO BAJA: `game.selRellenaVacia` (on/off/estado). Era el mando del snippet para apagarlo en
# caliente; el clic en una ranura no tiene mando, y un gesto del motor no lo necesita.
#
# EL MOTOR LO HACE MÁS BARATO QUE EL SNIPPET: el snippet tenía que CONTAR los sólidos de la caja antes de
# cada clic para saber si estaba vacía —desde fuera no hay otra manera de distinguir el caso roto— y sólo
# entonces prestaba el iterador con aire. Aquí no hace falta distinguir nada: si el gesto rellena el aire,
# cualquier celda de la caja sirve de semilla, así que se elige el iterador y se acabó. Un barrido menos.
#
# Idempotente: si la marca ya está en app.js, no toca nada. Todo o nada: cada ancla tiene que aparecer
# EXACTAMENTE una vez o aborta sin escribir.
#
#   python3 herramientas/parche_app_sel_rellena_vacia.py
#
# Después: `node tests/probe_sel_rellena_vacia.js` con SNIPPET=0 (el motor pelado tiene que pasar las
# cinco secciones). No hace falta regenerar SYMBOLS.md: no añade ni quita funciones.
import os
import sys
import tempfile

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.join(RAIZ, 'web', 'app.js')

MARCA = 'const semilla = soloSolidos ? mcSelForEach : mcSelForEachConAire;'

CAMBIOS = [
    # La celda semilla sale del mismo sitio del que van a salir las demás: si el gesto rellena también el
    # aire, cualquier celda de la caja es semilla válida (mcSelectFillId va a pasar por todas de todas
    # formas). Buscarla sólo entre los sólidos dejaba la caja vacía sin manera de empezar.
    ("  let p=null; mcSelForEach((x,y,z,before)=>{ if(!p) p=[x,y,z,before]; });\n"
     "  if(!p){ toast('Nada que reemplazar'); return true; }",
     "  // La semilla se busca con el MISMO reparto que hará el reparto de después (mcSelectFillId): sin\n"
     "  // Shift el gesto rellena TAMBIÉN EL AIRE, así que vale cualquier celda de la caja. Buscarla sólo\n"
     "  // entre los sólidos dejaba la selección vacía sin por dónde empezar y salía por «Nada que\n"
     "  // reemplazar» teniendo aire de sobra que rellenar (dueño, 2026-08-29). Con Shift no: «sólo\n"
     "  // sólidos» y no hay ninguno es que de verdad no hay nada que reemplazar.\n"
     "  const semilla = soloSolidos ? mcSelForEach : mcSelForEachConAire;\n"
     "  let p=null; semilla((x,y,z,before)=>{ if(!p) p=[x,y,z,before]; });\n"
     "  if(!p){ toast(soloSolidos?'Nada que reemplazar':'Nada que rellenar'); return true; }"),
]


def main():
    with open(APP, encoding='utf-8') as f:
        src = f.read()
    if MARCA in src:
        print('app.js: sel-rellena-vacia ya estaba aplicado — no se toca nada')
        return 0
    # TODAS las anclas antes de escribir NINGUNA: a medio parchear el motor queda incoherente.
    for ancla, _ in CAMBIOS:
        if src.count(ancla) != 1:
            print('ABORTA: el ancla aparece %d veces, esperaba 1\n  %s'
                  % (src.count(ancla), ancla[:70]), file=sys.stderr)
            return 1
    for ancla, nuevo in CAMBIOS:
        src = src.replace(ancla, nuevo, 1)
    d = os.path.dirname(APP)
    fd, tmp = tempfile.mkstemp(dir=d, suffix='.tmp')
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        f.write(src)
    os.replace(tmp, APP)
    print('app.js: sel-rellena-vacia aplicado (%d cambio)' % len(CAMBIOS))
    print('Ahora: SNIPPET=0 node tests/probe_sel_rellena_vacia.js')
    return 0


if __name__ == '__main__':
    sys.exit(main())
