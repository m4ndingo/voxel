#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""REQ-ROMPE1 · cuelga la sorpresa del ORO. Parche IDEMPOTENTE sobre mundo-autoarranque.

Segunda mitad del encargo del dueño (2026-08-28): «*Asi puedo asociar a un bloque X un comportamiento
que sea: ejecutar snippet construye casa al romperse. Una vez registrado el comportamiento, creare el
bloque, luego lo rompere con le pico, se abrira la sorpresa (ejecuta el script) y se generara la casa
en esa posicion*».

El `alRomper` ya existe (`parche_snp_al_romper.py`); esto solo lo ATA a un material.

POR QUÉ EL ORO, y qué hay que saber antes de cambiarlo:
  · El comportamiento cuelga del **MATERIAL**, nunca de un voxel concreto (regla de
    `docs/bloques-comportamiento.md`) ⇒ **TODO** bloque de oro es una casa en potencia, no solo el
    que se plante a proposito. Por eso se eligio despues de contar los que hay puestos: **cero** en
    la rejilla y **cero** en estructuras (`multi/cuenta_oro.js`, 2026-08-28). Si algun dia el oro se
    usa para decorar, esto hay que moverlo a un material que no se use.
  · Va en `DEFECTOS` y no en un `define()` suelto porque esa tabla es la que se recorre al arrancar,
    y asi se hereda tal cual cada vez que el snippet se reinstala.

Uso:  python3 herramientas/parche_snp_oro_sorpresa.py
"""
import json
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUTA = os.path.join(RAIZ, 'data', 'snippets', 'mundo-autoarranque.json')

# Si esto ya esta en el codigo, el parche ya se aplico y no se toca nada.
MARCA = 'construye-casa'

VERSION_VIEJA = "  var VERSION = 'v1.37';"
VERSION_NUEVA = 'v1.38'

PARCHES = []

PARCHES.append(('version', VERSION_VIEJA, "  var VERSION = '%s';" % VERSION_NUEVA))

# La entrada, justo antes de la diana para que quede con los demas bloques con comportamiento y no
# perdida entre las flores.
PARCHES.append(('oro', """    'asset:assets/diana.vox.json': { impulso: 24 },""",
                """    // El bloque-sorpresa (REQ-ROMPE1): rompelo con el pico y `construye-casa` levanta una casa
    // en su celda y con su giro. `alRomper` recibe { x, y, z, ori, … }, que es justo lo que ese
    // snippet pide como argumentos, asi que se le pasa la ficha entera sin traducir nada.
    // ⚠️ Cuelga del MATERIAL: cualquier bloque de oro que se rompa levanta una casa, no solo el
    // que se planto a proposito. Se eligio el oro porque no habia ni uno puesto en el mundo.
    'asset:assets/oro.vox.json': { nota: 'Sorpresa: rompelo con el pico y se levanta una casa.',
      alRomper: function (c) { game.snippet('construye-casa', c); } },
    'asset:assets/diana.vox.json': { impulso: 24 },"""))


def main():
    with open(RUTA, encoding='utf-8') as f:
        doc = json.load(f)
    code = doc['code']

    if MARCA in code:
        print('Ya estaba puesto (%s aparece en el snippet). No se toca nada.' % MARCA)
        return 0

    for clave, viejo, nuevo in PARCHES:
        n = code.count(viejo)
        if n != 1:
            print('✗ ancla «%s»: aparece %d veces, esperaba 1. No se escribe nada.' % (clave, n),
                  file=sys.stderr)
            return 1
        code = code.replace(viejo, nuevo)

    doc['code'] = code
    tmp = RUTA + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
        f.write('\n')
    os.replace(tmp, RUTA)
    print('Parcheado %s · %d anclas · VERSION %s' % (RUTA, len(PARCHES), VERSION_NUEVA))
    print('⚠️  Si tienes el modal Alt+C abierto con una copia anterior, tu proximo «guardar» se lo lleva.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
