#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""REQ-MNT2 · «montable» pasa a ser un campo del DOCUMENTO del agente.

El dueño: «quiero que `game.esqueletos.montable(1, 'cabeza')` sea algo configurable desde el editor
de agentes, decir si una parte del agente articulado es montable».

REQ-MNT1 dejó el acarreo funcionando pero solo por scripting y **por instancia**: hay que volver a
llamar a montable() cada vez que se planta el bicho, y no queda escrito en ningún sitio. Esto lo
sube al sitio donde ya viven `articula` y `mirar` — la PIEZA del documento (data/agentes/<id>.json):

    { "nombre": "cabeza", "pieza": "asset:...", "en": [...], "montable": true }

El reparto es el de siempre (CLAUDE.md §0): la casilla del editor es UI y va en app.js, que solo
escribe la clave; **quien la aplica es esta librería**, al plantar. app.js sigue sin saber qué es ir
montado.

`game.esqueletos.montable(rig, pieza, si)` NO se toca y no se deprecia: se queda como la válvula por
INSTANCIA en los dos sentidos —encender en ESE bicho una pieza que el documento no marca, o apagar
la que sí marca—, mismo patrón que `mc.finoExtra` sobre `mc.finoRejilla`.

Ojo con la RAÍZ: `crearEsqueleto` no reenvía el objeto `def.raiz`, sino que se fabrica una pieza 0
con cuatro campos escogidos a mano. Sin tocar esa línea, marcar el torso en el editor no llegaría
nunca a la parte — y un agente-plataforma es justo su torso.

El snippet lo edita EN VIVO el dueño ⇒ parche idempotente, con MARCA por cambio, y aborta si un
ancla no aparece exactamente una vez.

ORDEN: después de parche_snp_montable.py (REQ-MNT1), que es quien crea llevarPasajero() y la API.
No comparte ancla con ningún otro parche.
"""
import json
import os
import sys
import tempfile

RUTA = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                    'data', 'snippets', 'mundo-autoarranque.json')

# (nombre, marca, original, parcheado) — se salta si `marca` ya está en el código.
CAMBIOS = [

    ('crearEsqueleto(): la RAIZ tambien puede ser montable',
     "montable: def.raiz.montable",
     # El ancla lleva el comentario de encima porque la MISMA linea existe en prepararEsqueleto (el
     # preview del editor), y alli no pinta nada: un preview no lleva a nadie montado.
     "    // La raiz es la pieza 0 y su `en` es [0,0,0] por definicion: todo lo demas se mide desde ella.\n"
     "    var brutas = [{ nombre: def.raiz.nombre || 'raíz', pieza: def.raiz.pieza, rot: def.raiz.rot, en: [0, 0, 0] }];\n",
     "    // La raiz es la pieza 0 y su `en` es [0,0,0] por definicion: todo lo demas se mide desde ella.\n"
     "    // La pieza 0 se fabrica a mano en vez de reenviar `def.raiz`, asi que TODO campo nuevo del\n"
     "    // documento hay que traerlo aqui explicitamente. `montable` es uno: un agente-plataforma\n"
     "    // (una barca, un ascensor) no tiene mas pieza que su torso, y sin esta linea la casilla del\n"
     "    // editor no llegaria a la unica pieza donde importa.\n"
     "    var brutas = [{ nombre: def.raiz.nombre || 'raíz', pieza: def.raiz.pieza, rot: def.raiz.rot,\n"
     "                    en: [0, 0, 0], montable: def.raiz.montable }];\n"),

    ('crearEsqueleto(): la pieza nace con la marca del documento',
     "montable: !!q.montable",
     "          piv: null, art: normalizarArticulacion(q.articula), mirar: normalizarMirada(q.mirar),\n"
     "          giroMira: 0, s: null, idx: -1\n"
     "        };\n",
     "          piv: null, art: normalizarArticulacion(q.articula), mirar: normalizarMirada(q.mirar),\n"
     "          // Ir montado, desde el DOCUMENTO (REQ-MNT2): la casilla «Te lleva montado» del editor\n"
     "          // escribe `montable:true` en la pieza y el bicho ya nace con ella, sin que nadie llame\n"
     "          // a nada. Se normaliza a booleano aqui y no al leerlo por frame porque esqueletosPaso\n"
     "          // lo consulta DOS veces por pieza y por frame (guardarPose y llevarPasajero).\n"
     "          montable: !!q.montable,\n"
     "          giroMira: 0, s: null, idx: -1\n"
     "        };\n"),

    # OJO con la marca: «casilla Te lleva montado» tambien sale en el comentario del cambio de
    # arriba, y usarla aqui daba un «ya estaba» falso que se saltaba este cambio para siempre.
    ('la cabecera dice que lo normal ya no es llamar a montable()',
     "nacen con ella (REQ-MNT2)",
     "//   game.esqueletos.montable(id, 'cabeza')      ← subete encima y TE LLEVA (giro incluido: orbitas\n"
     "//                                 con la pieza). Subirse ya se podia; lo que faltaba era que te\n"
     "//                                 llevase. montable(id, 'cabeza', false) lo apaga.\n",
     "//   game.esqueletos.montable(id, 'cabeza')      ← subete encima y TE LLEVA (giro incluido: orbitas\n"
     "//                                 con la pieza). Subirse ya se podia; lo que faltaba era que te\n"
     "//                                 llevase. montable(id, 'cabeza', false) lo apaga.\n"
     "//                                 Normalmente NO hace falta llamarla: la casilla «Te lleva montado»\n"
     "//                                 del editor de agentes escribe `montable:true` en la pieza del\n"
     "//                                 DOCUMENTO y todos los que plantes nacen con ella (REQ-MNT2).\n"
     "//                                 Esto es la valvula por INSTANCIA, en los dos sentidos.\n"),

    ('montable(): queda como la valvula por instancia',
     "la VALVULA por instancia",
     "    // Ir montado encima de una pieza. Es de la INSTANCIA y no del material a proposito: la cabeza\n"
     "    // de ESE zombie, no todas las cabezas del mapa — que es justo la diferencia con game.bloques,\n"
     "    // donde el comportamiento cuelga del material. Sin tercer argumento, enciende.\n",
     "    // Ir montado encima de una pieza. Es de la INSTANCIA y no del material a proposito: la cabeza\n"
     "    // de ESE zombie, no todas las cabezas del mapa — que es justo la diferencia con game.bloques,\n"
     "    // donde el comportamiento cuelga del material. Sin tercer argumento, enciende.\n"
     "    //\n"
     "    // Desde REQ-MNT2 el sitio NORMAL de esta marca es el documento del agente (`montable:true` en\n"
     "    // la pieza, que es lo que escribe la casilla del editor) y crearEsqueleto la copia a la parte\n"
     "    // al plantar. Esto se queda como la VALVULA por instancia, y en los dos sentidos: encender en\n"
     "    // ESE bicho una pieza que el documento no marca, o apagar la que si marca. Mismo patron que\n"
     "    // mc.finoExtra sobre mc.finoRejilla — el defecto automatico y la excepcion a mano.\n"),
]


def main():
    aplicar = '--dry-run' not in sys.argv
    with open(RUTA, 'r', encoding='utf-8') as f:
        doc = json.load(f)
    code = doc['code']
    antes = code

    hechos, saltados = [], []
    for nombre, marca, orig, nuevo in CAMBIOS:
        if marca in code:
            saltados.append(nombre)
            continue
        n = code.count(orig)
        if n != 1:
            print('ABORTA: el ancla de «%s» aparece %d veces (esperaba 1).' % (nombre, n))
            print('        El snippet lo edita el dueño en vivo: revisa a mano antes de insistir.')
            return 2
        code = code.replace(orig, nuevo, 1)
        hechos.append(nombre)

    for n in saltados:
        print('  ya estaba · ' + n)
    for n in hechos:
        print('  aplicado  · ' + n)

    if code == antes:
        print('\nNada que hacer: el snippet ya tiene los %d cambios.' % len(CAMBIOS))
        return 0
    if not aplicar:
        print('\n--dry-run: %d cambio(s) listos, no se ha escrito nada.' % len(hechos))
        return 0

    doc['code'] = code
    d = os.path.dirname(RUTA)
    fd, tmp = tempfile.mkstemp(dir=d, prefix='.parche-', suffix='.json')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            json.dump(doc, f, ensure_ascii=False)
        os.replace(tmp, RUTA)
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise
    print('\nEscrito %s (%d cambio(s)).' % (RUTA, len(hechos)))
    print('El snippet corre al abrir el Mundo: recarga la pestaña de /map/... para verlo.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
