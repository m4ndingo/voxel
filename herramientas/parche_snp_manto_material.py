#!/usr/bin/env python3
# LA ALFOMBRA SALÍA DE ROCA cuando `mantoDe` nombra un material que no está en la paleta de ESTE
# mundo. No es cosa de `ponCapa`: es lo que hace `setVoxel` con un material desconocido —roca y un
# aviso—, y en /map/test el oro no está cargado. Medido: manto de 'oro' → 7 833 celdas de roca.
#
# Ahora, cuando el material no está, se descarga UNA vez (game.addMaterial, que es quien hace crecer
# el atlas y tira la caché de material→id) y al llegar se repinta todo lo que ya estuviera puesto.
#
#   python3 herramientas/parche_snp_manto_material.py
#   curl -X POST localhost:8500/api/snippets -H 'Content-Type: application/json' \
#        --data-binary @data/snippets/particulas-voxel.json

import json
import os
import sys
import tempfile

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PARTIC = os.path.join(RAIZ, 'data', 'snippets', 'particulas-voxel.json')
MARCA = 'function mantoHayMat'

REP_V = """  // Cambiar `mantoDe` en caliente: se repone lo que ya estaba con el material nuevo. `ponCapa` pisa la
  // celda, así que no hace falta quitar antes. Es un tirón de una vez (~7 800 celdas) y solo al
  // cambiar el mando, no por frame.
  function mantoRepinta(){
    Mto.mat = mantoMat();
    if(Mto.n) for(let i = 0; i < Mto.n; i++) if(Mto.esp[i]) mantoPone(i, Mto.esp[i]);
  }"""
REP_N = """  // ¿está ese material EN LA PALETA de este mundo? Si no lo está, `ponCapa` pinta ROCA — no es cosa
  // suya, es lo que hace `setVoxel` con un material desconocido, y así salió una nevada de oro
  // entera de piedra en /map/test.
  function mantoHayMat(m){
    const k = mcMatKey(m, m.toLowerCase());
    return mc.blockKey.indexOf(k) > 0 || (mc.name2id && mc.name2id[m] > 0);
  }
  // Cambiar `mantoDe` en caliente: se repone lo que ya estaba con el material nuevo. `ponCapa` pisa la
  // celda, así que no hace falta quitar antes. Es un tirón de una vez (~7 800 celdas) y solo al
  // cambiar el mando, no por frame.
  //
  // Lo que sí puede tardar es TRAER el material: `game.addMaterial` descarga el dibujo y hace crecer
  // el atlas. Mientras llega, las columnas que crezcan se pintan de roca; por eso el repintado va
  // DESPUÉS del await y arregla también esas.
  async function mantoRepinta(){
    const m = Mto.mat = mantoMat();
    if(!mantoHayMat(m)){
      try{ await game.addMaterial(mcMatKey(m, m.toLowerCase())); }
      catch(e){ console.warn('[manto] no he podido cargar «' + m + '»', e); }
      if(Mto.mat !== m) return;                      // lo han vuelto a cambiar mientras cargaba
    }
    if(Mto.n) for(let i = 0; i < Mto.n; i++) if(Mto.esp[i]) mantoPone(i, Mto.esp[i]);
  }"""

LLAMA_V = """    if(Mto.mat !== mantoMat()) mantoRepinta();"""
LLAMA_N = """    if(Mto.mat !== mantoMat()) mantoRepinta().catch(e => console.warn('[manto] material', e));"""


def parchea(ruta, pares, marca):
    with open(ruta, encoding='utf-8') as f:
        doc = json.load(f)
    code = doc['code']
    if marca in code:
        print('ya estaba: %s' % os.path.basename(ruta))
        return 0
    for nombre, viejo, nuevo in pares:
        n = code.count(viejo)
        if n != 1:
            print('ABORTA en %s: «%s» aparece %d veces, esperaba 1 (¿lo editó el dueño?).'
                  % (os.path.basename(ruta), nombre, n), file=sys.stderr)
            return 1
    for nombre, viejo, nuevo in pares:
        code = code.replace(viejo, nuevo, 1)
    doc['code'] = code
    d = os.path.dirname(ruta)
    fd, tmp = tempfile.mkstemp(dir=d, suffix='.tmp')
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
    os.replace(tmp, ruta)
    print('parcheado: %s' % os.path.basename(ruta))
    return 0


if __name__ == '__main__':
    sys.exit(parchea(PARTIC, [('repinta', REP_V, REP_N), ('llamada', LLAMA_V, LLAMA_N)], MARCA))
