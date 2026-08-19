#!/usr/bin/env python3
# Dos fallos que caza la sonda del manto con lonchas:
#
# 1. LA ALFOMBRA SALIA NEGRA con `mantoDe: 'assets/snow.vox.json'`. `mcStampSrc` devuelve la ruta TAL
#    CUAL cuando ya parece un fichero ('assets/snow.vox.json'), sin el prefijo 'asset:', y entonces
#    `getRoomData` no la reconoce y contesta `{voxels:{}}`: cero muestras, media cero, negro. Ahora la
#    clave se normaliza y, si la loncha sale sin una sola muestra, se AVISA y se deja el color plano —
#    negro nunca, que no es un color que nadie haya pedido.
#
# 2. CAMBIAR `mantoRadio` EN CALIENTE DEJABA CAJAS HUERFANAS. `mantoConstruye` rehace las columnas y
#    pierde las de antes, con sus cajas puestas en la capa fina; medido: 30 300 cajas sin dueño que ni
#    `limpia()` se llevaba (limpia recorre las columnas ACTUALES). Es de antes de las lonchas. Ahora se
#    limpia antes de reconstruir.
#
#   python3 herramientas/parche_snp_manto_loncha_fix.py
#   curl -X POST localhost:8500/api/snippets -H 'Content-Type: application/json' \
#        --data-binary @data/snippets/particulas-voxel.json

import json
import os
import sys
import tempfile

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PARTIC = os.path.join(RAIZ, 'data', 'snippets', 'particulas-voxel.json')
MARCA = 'Sin una sola muestra'

CLAVE_V = """    const clave = nombre && (typeof mcStampSrc === 'function') ? mcStampSrc(nombre) : null;
    const doc = clave ? await getRoomData(clave) : null;"""
CLAVE_N = """    let clave = nombre && (typeof mcStampSrc === 'function') ? mcStampSrc(nombre) : null;
    // ⚠️ `mcStampSrc` devuelve la ruta TAL CUAL cuando el nombre ya parece un fichero
    // ('assets/snow.vox.json'), sin el 'asset:' delante — y así `getRoomData` no la reconoce y
    // contesta un documento vacío. Con el prefijo puesto, las dos formas de escribirlo valen.
    if(clave && !/^(asset|hab):/.test(clave)) clave = 'asset:' + clave;
    const doc = clave ? await getRoomData(clave) : null;"""

MUESTRA_V = """      col = new Float32Array(D * D * 3);
      for(let t = 0; t < D * D; t++){
        const n = sum[t * 4 + 3] || 1;
        col[t * 3] = sum[t * 4] / n / 255; col[t * 3 + 1] = sum[t * 4 + 1] / n / 255;
        col[t * 3 + 2] = sum[t * 4 + 2] / n / 255;
      }"""
MUESTRA_N = """      let muestras = 0;
      for(let t = 0; t < D * D; t++) muestras += sum[t * 4 + 3];
      if(!muestras){
        // Sin una sola muestra la media sería 0, o sea una alfombra NEGRA: eso no lo ha pedido nadie.
        // Pasa si la clave no existe, si el dibujo está vacío o si `mantoLoncha` se sale del bloque.
        console.warn('[manto] «' + nombre + '» (' + clave + ') no da ninguna loncha: se queda el color plano');
        D = 1;
      }else{
        col = new Float32Array(D * D * 3);
        for(let t = 0; t < D * D; t++){
          const n = sum[t * 4 + 3] || 1;
          col[t * 3] = sum[t * 4] / n / 255; col[t * 3 + 1] = sum[t * 4 + 1] / n / 255;
          col[t * 3 + 2] = sum[t * 4 + 2] / n / 255;
        }
      }"""

RADIO_V = """    if(!Mto.n || Mto.radio !== (C.mantoRadio | 0)) if(!mantoConstruye()) return;"""
RADIO_N = """    // ⛔ Reconstruir sin limpiar deja HUÉRFANAS las cajas de las columnas de antes: `mantoLimpia`
    // recorre las columnas ACTUALES, así que las que salen del radio ya no las conoce nadie y se
    // quedan pintadas para siempre (medido: 30 300 cajas al bajar `mantoRadio` en caliente).
    if(Mto.n && Mto.radio !== (C.mantoRadio | 0)) mantoLimpia();
    if(!Mto.n) if(!mantoConstruye()) return;"""

PARES = [('clave', CLAVE_V, CLAVE_N), ('muestras', MUESTRA_V, MUESTRA_N), ('radio', RADIO_V, RADIO_N)]


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
    sys.exit(parchea(PARTIC, PARES, MARCA))
