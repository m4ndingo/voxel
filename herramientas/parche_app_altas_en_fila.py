#!/usr/bin/env python3
# @area: mundo
#
# REQ-ORI1 · Las piezas GIRADAS (`…@N`) no se dibujan hasta recargar, en un mapa que nunca tuvo esa pieza.
#
# EL PARTE DEL DUEÑO (2026-08-28): «no se que pasa con "casita" que pone bien "casita" pero no
# "casita@x"; si refresco entonces si salen; ocurre cuando el mapa nunca tuvo "casita"». En su foto, los
# rayos-X leen `casita@2` y `casita@3` en celdas VACIAS a la vista, con la `casita` recta de al lado bien
# dibujada.
#
# QUE PASA DE VERDAD. No es el orden de nada: es una CARRERA. Colocar la recta y girar con R y colocar
# otra vez lanza tres `game.addMaterial` casi a la vez, y cada uno de los dos girados empieza por dar de
# alta la BASE (app.js, `game.addMaterial`: «el original primero: la variante cuelga de el»). O sea tres
# `mcAddBlock('hab:casita')` simultaneos. Y `mcBuildPaletteImpl` VACIA `mc.blockKey` en su primera linea,
# asi que mientras uno hornea:
#   · la guarda `mc.blockKey.indexOf(key)` de `mcAddBlock` miente y los tres pasan de largo
#     ⇒ la base entra en la paleta POR TRIPLICADO (ids 29, 30 y 31 en la medida);
#   · `mcAltaVariante` tampoco encuentra la base (`idB<1`) ⇒ los girados renuncian a su camino rapido y
#     se van tambien por el largo, con su propio `mcBuildPalette`;
#   · las tres hornadas acaban con `mc.finoRejilla=fino` (app.js:9750), cada una con SU tabla local, del
#     tamaño que tenia la paleta cuando la creo. Gana la ultima en terminar.
# Medido con `tests/probe_paleta_carrera.js` en un mapa limpio:
#     pico de hornadas a la vez: 3 · mc.blocks.length=33 · mc.finoRejilla.length=32
# Los ids 32 y 33 —los dos girados— se caen FUERA de la tabla. Sin casilla en `finoRejilla` no hay
# geometria fina, y una pieza fina sin geometria fina no se dibuja. Al recargar se hornea la paleta UNA
# vez y en serie, y por eso «si refresco entonces si salen».
#
# EL ARREGLO: las altas de material, EN FILA. Una cola de una sola posicion alrededor de `mcAddBlock`.
# No arregla el sintoma, quita la simultaneidad, que es lo unico que estaba roto:
#   · nadie vacia la paleta a media pregunta ⇒ la guarda del duplicado vuelve a valer;
#   · cuando le toca a `…@2`, la base ya esta dada de alta y marcada fina ⇒ `mcAltaVariante` coge su
#     camino rapido, la variante nace con su `finoGeom` y su casilla, y NO se re-hornea la paleta.
# ⚠️ No se toca `mcBuildPalette`: serializar ahi dejaria fuera el `mc.blocks.push` de la linea de antes,
# que es justo la parte que se pisa. La fila tiene que abarcar «mirar si esta + apendar + hornear».
#
# Validado EN CALIENTE antes de tocar app.js (LEY DE ORO) con `tests/probe_paleta_cola.js`:
#     pico:1 · copiasEnPaleta:1 · las tres celdas con su clave correcta y fino/geo true
#     y las dos fotos, antes y despues de recargar, IGUALES (/tmp/probe_cola_*.png)
#
#   python3 herramientas/parche_app_altas_en_fila.py --comprobar   (no escribe nada)
#   python3 herramientas/parche_app_altas_en_fila.py
#
# Tras aplicarlo hay que regenerar el mapa de simbolos (`mcAddBlockImpl` es una funcion nueva):
#   node correr_tests.js test_symbols_sync
import argparse, os, sys

APP = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'web', 'app.js')

CAMBIOS = [
    (
        'mcAddBlock pasa a ser la cola; el cuerpo de siempre se queda en mcAddBlockImpl',
        """async function mcAddBlock(key, name){
  const ex=mc.blockKey.indexOf(key); if(ex>0) return ex;                        // ya en la paleta""",
        """// REQ-ORI1 · LAS ALTAS DE MATERIAL VAN DE UNA EN UNA. Dos a la vez se pisan de tres maneras, y las tres
// se ven igual desde fuera: la pieza girada no se dibuja hasta recargar. Colocar recta + girar con R +
// colocar lanza tres altas casi a la vez (cada girada da de alta antes su base, ver game.addMaterial), y
// como mcBuildPaletteImpl vacia mc.blockKey mientras hornea: (1) la guarda «¿ya esta?» de aqui abajo
// miente y la base entra duplicada; (2) mcAltaVariante no encuentra la base y la variante renuncia a su
// camino rapido; (3) cada hornada termina con su propia tabla en mc.finoRejilla y gana la ultima, que
// puede ser mas corta que la paleta → los ids girados se caen fuera y se quedan sin geometria fina.
// La cola es de una sola posicion y NO puede envolver solo a mcBuildPalette: tiene que abarcar tambien
// el mirar-si-esta y el mc.blocks.push, que es la parte que se pisa.
let mcAltaCola=Promise.resolve();
function mcAddBlock(key, name){
  // El .catch de la espera es para que un alta que reviente no atasque la fila para siempre; el de la
  // cola, para que el siguiente no herede ese fallo. Quien llamo si recibe el error, sin tocar.
  const mio=mcAltaCola.catch(()=>{}).then(()=>mcAddBlockImpl(key, name));
  mcAltaCola=mio.catch(()=>{});
  return mio;
}
async function mcAddBlockImpl(key, name){
  const ex=mc.blockKey.indexOf(key); if(ex>0) return ex;                        // ya en la paleta""",
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
                  '   app.js no esta como este parche espera: no lo toco.' % (que, n))
            return 2
        nuevo = nuevo.replace(viejo, bueno)
        hechos.append(que)

    for q in ya:
        print('· ya estaba: ' + q)
    for q in hechos:
        print('✔ ' + q)
    if not hechos:
        print('\nNada que hacer.')
        return 0
    if a.comprobar:
        print('\n--comprobar: no escribo nada.')
        return 0

    tmp = a.app + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        f.write(nuevo)
    os.replace(tmp, a.app)
    print('\n%s actualizado (%d → %d bytes).' % (a.app, len(src), len(nuevo)))
    print('Ahora: node --check web/app.js  y  node correr_tests.js test_symbols_sync')
    return 0


if __name__ == '__main__':
    sys.exit(main())
