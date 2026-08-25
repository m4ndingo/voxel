#!/usr/bin/env python3
# «game.efectos.luciernagas.apaga() dice que no es una función» (dueño, 2026-08-25).
#
# NO SE BORRÓ NADA. `apaga()` no ha existido nunca en los emisores. Lo que hay es una ASIMETRÍA de
# API entre los dos tipos de objeto que cuelgan de `game.efectos`:
#
#   game.efectos.estrellas    → capa de game.voxelesUI   → enciende() / apaga()
#   game.efectos.luciernagas  → emisor de particulas-voxel → enciende(n) / para()
#   (…y con ella chispas, polvo, hojas, humo, nieve, lluvia, petalosSakura: todos son emisores)
#
# Escribes `.apaga()` porque acabas de escribir `estrellas.apaga()` y es el mismo menú. El OSD de
# `miosd` sí usa `L.para()`, así que el botón 🏮 funciona; lo que falla es teclearlo a mano.
#
# EL ARREGLO va en la LIBRERÍA, no en `efectos-demo`: lo dice el propio encabezado del snippet
# —«Si algo cae mal, se arregla en `particulas-voxel` y se arregla para todos a la vez»—. Un alias
# de una línea junto a `para()` y los NUEVE efectos entienden las dos palabras.
#
# Idempotente por ancla, y todo o nada: si el ancla no aparece EXACTAMENTE una vez, aborta sin tocar
# nada (el dueño edita estos snippets en vivo, hay 2 copias vivas). Escritura atómica con os.replace.
#
#   python3 herramientas/parche_snp_particulas_apaga.py
#
# ⚠️ El navegador ya tiene su copia cargada: hace falta RECARGAR para que `efectos-demo` relea la
# librería (`await game.snippet('particulas-voxel')`).
import json
import os
import sys
import tempfile

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SNP = lambda id_: os.path.join(RAIZ, 'data', 'snippets', id_ + '.json')

VIEJO = "    para(){ C.porSegundo = 0; return this; },"

NUEVO = (
    "    para(){ C.porSegundo = 0; return this; },\n"
    "    // Alias de `para()`. Los emisores paran y las capas de game.voxelesUI (estrellas) apagan;\n"
    "    // conviven en el mismo menú de `game.efectos`, así que quien viene de `estrellas.apaga()`\n"
    "    // escribe `luciernagas.apaga()` y se comía un «no es una función». Entiende las dos.\n"
    "    // (por `C` y no por `this`: el objeto es `C` —`const api = Object.assign(C, {...})`— y así\n"
    "    // un `const f = L.apaga` suelto tampoco se rompe.)\n"
    "    apaga(){ return C.para(); },"
)

# Si esto ya está en el código, el parche ya se aplicó.
MARCA = "apaga(){ return C.para(); },"


def main():
    ruta = SNP('particulas-voxel')
    if not os.path.exists(ruta):
        print('ABORTA: no existe %s' % ruta, file=sys.stderr)
        return 1
    with open(ruta, encoding='utf-8') as f:
        doc = json.load(f)
    code = doc['code']

    if MARCA in code:
        print('particulas-voxel: ya estaba puesto, no se toca')
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
    print('particulas-voxel: puesto ✅  (recarga el navegador para releer la librería)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
