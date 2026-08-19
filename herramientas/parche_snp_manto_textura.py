#!/usr/bin/env python3
# «las lonchas de alfombra nevada no tienen la textura de voxels del cubo de oro» + «no se está
#  teniendo en cuenta la niebla en las alfombras» (dueño, 2026-08-19).
#
# El manto deja de pintarse con CAJAS DE COLOR de la capa fina y pasa a ser una CELDA ACHATADA con la
# textura del material (`game.volatiles.ponCapa`, nuevo en app.js).
#
# Por qué no se podía antes: una caja de la capa fina es de UN color, así que copiar la textura de un
# bloque pide 16×16 = 256 cajas por bloque. Y no se pueden fundir las del mismo color — medido en el
# oro, su textura es ruido: 248 baldosas distintas de 256. Mapa entero = 2 millones de cajas, ~2 GB.
# Una celda achatada son ~2 quads, con las UV del atlas, y va en la pasada del terreno ⇒ la textura es
# la de verdad y la NIEBLA y la sombra del sol salen solas.
#
# Se van con las cajas: `mantoLoncha`, `mantoDetalle` y `mantoTope` (eran el mosaico y su presupuesto).
# `mantoDe` cambia de significado: ya no es «de qué dibujo saco la loncha» sino EL MATERIAL, tal cual
# lo escribiría setVoxel ('nieve', 'oro', 'hab:…').
#
#   python3 herramientas/parche_snp_manto_textura.py
#   curl -X POST localhost:8500/api/snippets -H 'Content-Type: application/json' \
#        --data-binary @data/snippets/particulas-voxel.json
#   curl -X POST localhost:8500/api/snippets -H 'Content-Type: application/json' \
#        --data-binary @data/snippets/efectos-demo.json

import json
import os
import sys
import tempfile

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PARTIC = os.path.join(RAIZ, 'data', 'snippets', 'particulas-voxel.json')
EFECTOS = os.path.join(RAIZ, 'data', 'snippets', 'efectos-demo.json')

CFG_V = """  // ⬅️ DE DÓNDE SALE EL DIBUJO DE LA ALFOMBRA. Vacío = color plano (el de `colores`). Con un bloque
  // —'assets/snow.vox.json', 'nieve', 'hab:…': lo mismo que acepta `game.stamp`— se le sacan LONCHAS
  // y la alfombra se pinta con ellas.
  mantoDe: '',
  mantoLoncha: 0,        // qué loncha, contando desde la cara de ARRIBA del dibujo (0 = la de arriba)
  // Con qué resolución se copia la loncha: 1 = un color por bloque, 2 = mosaico 2×2, 4 = 4×4,
  // 16 = celda a celda. ⚠️ CUESTA EL CUADRADO, ver `mantoTope`.
  mantoDetalle: 2,
  // Techo de cajas de TODA la alfombra. Cada caja de la capa fina son ~1 KB de geometría, así que un
  // mapa entero (~7 800 columnas) son 7 800 cajas a detalle 1, 31 000 a detalle 2, 125 000 a 4 y dos
  // MILLONES celda a celda. Si el detalle pedido no cabe, se baja al que quepa y se avisa una vez.
  // Con `mantoRadio` hay menos columnas y cabe más detalle.
  mantoTope: 40000,
"""
CFG_N = """  // ⬅️ DE QUÉ ES LA ALFOMBRA: el MATERIAL, tal cual lo escribiría setVoxel ('nieve', 'oro', 'hab:…',
  // 'asset:assets/snow.vox.json'). Se dibuja con SU TEXTURA, la misma que tendría el bloque entero.
  // Se puede cambiar en caliente y la alfombra se repinta sola.
  mantoDe: 'nieve',
"""

REGION_INI = '  // ── LA LONCHA DEL DIBUJO'
REGION_FIN = '  // ⛏️ EL MUNDO SE EDITA MIENTRAS NIEVA'
REGION_N = """  // ── DE QUÉ ESTÁ HECHA LA ALFOMBRA ────────────────────────────────────────────────────────────
  // Una celda del terreno ACHATADA a `manto`/16 de alto, con la TEXTURA de `mantoDe`. La pone
  // `game.volatiles.ponCapa`, que no es materia: no choca, no tapa la luz y no se guarda.
  //
  // ⚠️ Antes esto eran CAJAS DE COLOR de la capa fina, y con ellas la textura no había manera:
  // copiarla pide 16×16 = 256 cajas por bloque —la del oro es ruido, 248 baldosas distintas de 256, no
  // se funden— o sea 2 millones de cajas y ~2 GB para el mapa entero. Achatada son ~2 quads por
  // bloque, y como va en la pasada del terreno hereda la niebla y la sombra del sol, que a la capa
  // fina no le llegaban (el manto se veía a todo color contra el horizonte gris).
  function mantoMat(){ return String(C.mantoDe || 'nieve').trim() || 'nieve'; }

  // La columna crece POR ALTURA, un 1/16 por paso, hasta `manto`. La gradación de antes (mancha de
  // 8×8 → 12×12 → baldosa de 16×16) era cosa de las cajas: una celda achatada cubre su bloque entero.
  // Lo que sigue impidiendo que la nevada se «encienda» de golpe es el orden aleatorio de las columnas.
  function mantoPasos(){ return Math.max(1, C.manto | 0); }
  function mantoQuita(i){
    if(Mto.y[i] >= 0) game.volatiles.quitaCapa(Mto.x[i], Mto.y[i] + 1, Mto.z[i]);
  }
  function mantoPone(i, e){
    if(e > 0 && Mto.y[i] >= 0) game.volatiles.ponCapa(Mto.x[i], Mto.y[i] + 1, Mto.z[i], e, Mto.mat);
  }
  function mantoPon(i, e){
    if(Mto.y[i] < 0){ Mto.esp[i] = 0; return; }    // columna retirada (sin suelo o mojada): no hay dónde
    if(e > 0) mantoPone(i, e); else mantoQuita(i);
    Mto.esp[i] = e;
  }
  // Cambiar `mantoDe` en caliente: se repone lo que ya estaba con el material nuevo. `ponCapa` pisa la
  // celda, así que no hace falta quitar antes. Es un tirón de una vez (~7 800 celdas) y solo al
  // cambiar el mando, no por frame.
  function mantoRepinta(){
    Mto.mat = mantoMat();
    if(Mto.n) for(let i = 0; i < Mto.n; i++) if(Mto.esp[i]) mantoPone(i, Mto.esp[i]);
  }

"""

# El bucle de `manto()`: ya no hay loncha que pedir, pero sí material que vigilar.
LLAMA_V = """    if(Los.q !== mantoLonchaQ()) mantoLonchaPide().catch(e => console.warn('[manto] loncha', e));
"""
LLAMA_N = """    if(Mto.mat !== mantoMat()) mantoRepinta();
"""

INFO_V = """               mantoDetalle: Los.detalle, mantoCajas: Mto.n * Los.detalle * Los.detalle }; },"""
INFO_N = """               mantoCeldas: Mto.n }; },"""

NIEVE_V = """  // La alfombra se pinta con LONCHAS del bloque de nieve, no con un blanco inventado: se le copia la
  // loncha de arriba y se pone en el suelo. `mantoDetalle: 2` = mosaico de 2×2 por bloque (31 000
  // cajas en un mapa entero); a 4 se ve más grano y cuesta cuatro veces más — ver `mantoTope`.
  mantoDe: 'assets/oro.vox.json', mantoLoncha: 0, mantoDetalle: 2,"""
NIEVE_N = """  // El MATERIAL de la alfombra: se dibuja CON SU TEXTURA, la misma que tendría el bloque entero.
  // Queda el oro que puso el dueño para verlo; con 'nieve' vuelve a nevar nieve.
  mantoDe: 'oro',"""

PARES_EFECTOS = [('nieve', NIEVE_V, NIEVE_N)]


def region(code):
    a = code.find(REGION_INI)
    b = code.find(REGION_FIN)
    if a < 0 or b < 0 or b <= a:
        return None
    return code[a:b]


def parchea_partic(ruta):
    with open(ruta, encoding='utf-8') as f:
        doc = json.load(f)
    code = doc['code']
    if 'mantoMat' in code:
        print('ya estaba: %s' % os.path.basename(ruta))
        return 0
    vieja = region(code)
    if vieja is None:
        print('ABORTA: no encuentro la región de la loncha en %s' % os.path.basename(ruta), file=sys.stderr)
        return 1
    pares = [('región', vieja, REGION_N), ('config', CFG_V, CFG_N),
             ('llamada', LLAMA_V, LLAMA_N), ('info', INFO_V, INFO_N)]
    for nombre, viejo, nuevo in pares:
        n = code.count(viejo)
        if n != 1:
            print('ABORTA en %s: «%s» aparece %d veces, esperaba 1 (¿lo editó el dueño?).'
                  % (os.path.basename(ruta), nombre, n), file=sys.stderr)
            return 1
    for nombre, viejo, nuevo in pares:
        code = code.replace(viejo, nuevo, 1)
    doc['code'] = code
    guarda(ruta, doc)
    return 0


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
    guarda(ruta, doc)
    return 0


def guarda(ruta, doc):
    d = os.path.dirname(ruta)
    fd, tmp = tempfile.mkstemp(dir=d, suffix='.tmp')
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
    os.replace(tmp, ruta)
    print('parcheado: %s' % os.path.basename(ruta))


if __name__ == '__main__':
    sys.exit(parchea_partic(PARTIC)
             or parchea(EFECTOS, PARES_EFECTOS, 'El MATERIAL de la alfombra'))
