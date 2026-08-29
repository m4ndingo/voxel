#!/usr/bin/env python3
# @area: mundo
#
# REQ-SETBLOCK1 (remate) · Que el aviso no le grite a quien SI usa la puerta buena.
#
# EL AGUJERO. La primera version miraba UN SOLO marco de la pila, el [3] = «quien llamo a mcSetBlock».
# Eso da por hecho que entre `mcSetVoxel` y `mcSetBlock` no hay nadie, y en un mundo con redstone SI lo
# hay: redstone ENVUELVE `mcSetBlock` desde un snippet (PLAN.md:552, «se engancha envolviendo
# mcSetBlock, que es el embudo»). Con eso puesto, un snippet que hace lo correcto:
#
#     snippet → setVoxel → mcSetVoxel → mcSetBlock(envoltorio de redstone) → mcSetBlock(el de verdad)
#                                        ^^^ ESTE es el marco [3], y lleva `vf-snippet/`
#
# ...se lleva un aviso por hacerlo BIEN. Y un aviso que sale cuando no toca es exactamente lo que el
# aviso no puede permitirse: se aprende a ignorar y deja de avisar de nada.
#
# EL ARREGLO, que no es adivinar sino mirar mejor: si `mcSetVoxel` aparece en CUALQUIER punto de la
# pila, la puerta buena se uso —da igual cuantos envoltorios haya de por medio— y aqui no hay nada que
# decir. Solo si no esta se mira el [3] como antes. Se busca `mcSetVoxel` y no `setVoxel` a secas para
# no callarse con un `setVoxelLoQueSea` de un snippet cualquiera.
#
# ⚠️ SIN PROBAR EN VIVO: el clasificador de permisos me bloqueo la sonda. Lo valida
# `node tests/probe_aviso_setblock.js`, que ademas trae un caso C2 para este agujero.
#
#     python3 herramientas/parche_app_aviso_setblock_redstone.py --comprobar
#     python3 herramientas/parche_app_aviso_setblock_redstone.py
import argparse
import os
import sys

APP = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'web', 'app.js')

CAMBIOS = [
    (
        'la puerta buena se reconoce en toda la pila, no solo en el marco de al lado',
        """  // [0]='Error' · [1]=este aviso · [2]=mcSetBlock · [3]=QUIEN LO LLAMO. Solo interesa el [3]: si viene
  // de `setVoxel` u otra funcion de app.js, el camino es el bueno y aqui no hay nada que decir.
  const quien=(pila.split('\\n')[3])||'';
  if(quien.indexOf('vf-snippet/')<0) return;""",
        """  // Si `mcSetVoxel` esta en la pila, se uso la puerta buena y da igual lo que haya de por medio: en un
  // mundo con redstone hay un envoltorio SUYO (de un snippet) entre medias, y sin esto el aviso le caia
  // encima a quien lo estaba haciendo bien. Se mira `mcSetVoxel` y no `setVoxel` a secas para no
  // callarse con cualquier `setVoxelLoQueSea` de un snippet.
  if(pila.indexOf('mcSetVoxel')>=0) return;
  // Descartado eso: [0]='Error' · [1]=este aviso · [2]=mcSetBlock · [3]=QUIEN LO LLAMO.
  const quien=(pila.split('\\n')[3])||'';
  if(quien.indexOf('vf-snippet/')<0) return;""",
    ),
]


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--comprobar', action='store_true')
    p.add_argument('--app', default=APP)
    a = p.parse_args()

    src = open(a.app, encoding='utf-8').read()
    nuevo, hechos, ya = src, [], []

    for que, viejo, bueno in CAMBIOS:
        if bueno in nuevo:
            ya.append(que)
            continue
        n = nuevo.count(viejo)
        if n != 1:
            print('⛔ el ancla de «%s» aparece %d veces (esperaba 1).\n'
                  '   ¿has aplicado antes parche_app_aviso_setblock.py? No lo toco.' % (que, n))
            return 2
        nuevo = nuevo.replace(viejo, bueno)
        hechos.append(que)

    for q in ya:
        print('   ya estaba · %s' % q)
    for q in hechos:
        print('   cambio    · %s' % q)
    if not hechos:
        print('nada que hacer.')
        return 0
    if a.comprobar:
        print('\n--comprobar: no he tocado nada.')
        return 0

    tmp = a.app + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        f.write(nuevo)
    os.replace(tmp, a.app)
    print('\naplicado en %s (%d → %d caracteres)' % (a.app, len(src), len(nuevo)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
