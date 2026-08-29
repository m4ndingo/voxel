#!/usr/bin/env python3
# @area: mundo
#
# REQ-SETBLOCK1 · Avisar de que `mcSetBlock` NO es la puerta buena para poner bloques.
#
# LA ORDEN (el dueño, 2026-08-28, tras ver por que fallaba `construye-casa`):
#   «Usa mcSetBlock(x, y, z, id) con un indice numerico de paleta ← mete un warning que puedas leer
#    indicando que esa no es la "forma buena" de crear bloques»
#
# QUE TIENE DE MALO. `mcSetBlock` es la puerta de ABAJO: quiere un INDICE NUMERICO de la paleta de ESTE
# mundo, asi que quien la usa tiene que traducir nombre→indice a mano. Y ahi se cae todo:
#   · un indice que no existe NO falla: pinta aire. La casa sale medio invisible y nada avisa.
#   · se salta la carga automatica de texturas (app.js, «Carga automatica de la textura que falta»),
#     que solo vive en `mcSetVoxel` porque es la que pide el material POR NOMBRE. Por eso `construye-casa`
#     reventaba en un mapa recien estrenado con «la paleta de este mundo no tiene "farolillo-zen"».
#   · no re-malla: apunta la celda en `mcDirty`, que es la cola de GUARDADO, no la de mallado. La casa
#     se construye INVISIBLE y todo lo medible dice que esta puesta.
# La puerta buena es `setVoxel(x, y, z, 'nombre')`.
#
# POR QUE NO BASTA CON AVISAR SIEMPRE. `mcSetBlock` tiene 25 llamadores DENTRO de app.js y todos son
# legitimos —incluido `mcSetVoxel`, que es justo la forma correcta—. Avisar en todos seria ruido puro y
# se aprenderia a ignorarlo, que es peor que no avisar.
#
# COMO SE DISTINGUE AL DE FUERA, sin adivinar:
#   · `mc._snippetActual` (app.js:4597) ya dice si estamos dentro de un snippet. Es una lectura de
#     propiedad: no cuesta nada en el camino normal.
#   · `mcCorreSnippet` le pone a cada snippet `//# sourceURL=vf-snippet/<nombre>` (app.js:4601), asi que
#     su marco de pila se reconoce por texto. Se mira SOLO el marco del llamador directo: llegar aqui a
#     traves de `setVoxel` es correcto y NO se avisa.
#
# Y COMO NO SE VUELVE CARO: construir una pila es caro, asi que se sondea como mucho `MC_SB_SONDEOS`
# veces por snippet y se calla para siempre en cuanto avisa una vez (o se agota el cupo). Un snippet que
# ponga 20 000 bloques paga 30 pilas, no 20 000.
#
#     python3 herramientas/parche_app_aviso_setblock.py --comprobar
#     python3 herramientas/parche_app_aviso_setblock.py
import argparse
import os
import sys

APP = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'web', 'app.js')

CAMBIOS = [
    (
        'el avisador y su cupo de sondeos',
        """function mcSetBlock(x,y,z,id){
  if(mcInside(x,y,z)){""",
        """// REQ-SETBLOCK1 · «esa no es la forma buena de crear bloques» (orden del dueño, 2026-08-28).
// Solo le habla a quien llama a `mcSetBlock` DIRECTAMENTE desde un snippet. Los 25 llamadores internos
// de app.js son legitimos —`mcSetVoxel` el primero, que es precisamente la forma correcta—, asi que
// avisarles seria ruido y el aviso se aprenderia a ignorar.
const MC_SB_SONDEOS=30;          // pilas que se mira por snippet antes de rendirse (una pila es cara)
const mcSBVistos=new Map();      // nombre de snippet → sondeos gastados, o 'ya' si ya se le dijo
function mcAvisaPuertaBaja(){
  const s=mc._snippetActual;
  const v=mcSBVistos.get(s);
  if(v==='ya') return;
  const n=(v|0)+1;
  if(n>MC_SB_SONDEOS){ mcSBVistos.set(s,'ya'); return; }   // no lo usa a pelo: dejar de mirar
  mcSBVistos.set(s,n);
  let pila='';
  try{ pila=new Error().stack||''; }catch(e){ return; }
  // [0]='Error' · [1]=este aviso · [2]=mcSetBlock · [3]=QUIEN LO LLAMO. Solo interesa el [3]: si viene
  // de `setVoxel` u otra funcion de app.js, el camino es el bueno y aqui no hay nada que decir.
  const quien=(pila.split('\\n')[3])||'';
  if(quien.indexOf('vf-snippet/')<0) return;
  mcSBVistos.set(s,'ya');
  console.warn('⚠️ «'+s+'» usa mcSetBlock(x,y,z,id) — esa NO es la forma buena de poner bloques.\\n'
    +'   Usa  setVoxel(x, y, z, "nombre-del-material")  y olvidate del resto.\\n'
    +'   mcSetBlock es la puerta de abajo y pide un INDICE NUMERICO de la paleta de ESTE mundo:\\n'
    +'     · un indice que no existe NO falla: pinta aire (la construccion sale a medias, sin avisar),\\n'
    +'     · se salta la carga automatica de la textura que falte (eso solo lo hace setVoxel, que pide\\n'
    +'       el material por NOMBRE), asi que revienta en un mapa cuya paleta aun no lo tenga,\\n'
    +'     · y no re-malla: la celda se apunta en mcDirty, que es la cola de GUARDADO, no la de mallado,\\n'
    +'       asi que lo construido puede quedarse INVISIBLE aunque este de verdad en la rejilla.\\n'
    +'   '+quien.trim());
}
function mcSetBlock(x,y,z,id){
  if(mc._snippetActual) mcAvisaPuertaBaja();   // REQ-SETBLOCK1 (fuera de un snippet no cuesta nada)
  if(mcInside(x,y,z)){""",
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
            print('⛔ el ancla de «%s» aparece %d veces (esperaba 1). No lo toco.' % (que, n))
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
