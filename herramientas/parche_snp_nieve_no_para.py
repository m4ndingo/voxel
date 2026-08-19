#!/usr/bin/env python3
# «La nieve sale de forma poco realista: nieva un rato, para varios segundos, y vuelta a empezar»
# (dueño, 2026-08-19). No es una impresion: medido en /map/test con dt fijo de 1/30 s, sembrando
# 55 copos/s, `dura: 25`, `tope: 420`:
#
#     seg  sembrados/s  vivas  volando
#       0       54        54      54
#       6       55       384     196
#       9        0       420      63     <- se llena el cupo
#      12…27     0       420       0     <- 21 SEGUNDOS SIN UN SOLO COPO EN EL AIRE
#      30       55       415     125     <- caduca la primera tanda y vuelve a nevar
#      39…54     0       420       0     <- y otra vez
#
# La causa es una linea de `siembra`: `if(V.length + n > C.tope) n = Math.max(0, C.tope - V.length)`.
# Al llegar al cupo NO se siembra NADA, y como los copos posados duran `dura` segundos y ocupan
# sitio, se lo comen entero: 55/s x 25 s = 1375 posados para sostener el efecto, contra un tope de
# 420. El ciclo se automantiene porque la primera tanda entra junta y caduca junta.
#
# El arreglo: al llegar al cupo se RECICLA el copo POSADO MAS VIEJO en vez de dejar de sembrar. La
# nieve no para nunca mientras este encendida —que es lo pedido— y la alfombra del suelo pasa a ser
# una ventana rodante: se derrite lo primero que cuajo, que ademas es lo que hace la nieve de verdad.
# Nunca se recicla una particula EN EL AIRE: eso si seria un copo desapareciendo a la vista.
#
# ⚠️ EFECTO SECUNDARIO QUE HAY QUE SABER: con `tope` de 420 y 55 copos/s, lo posado ya no puede
# durar los 25 s de `dura` — dura lo que el cupo deje (~4-5 s). Es la cuenta, no un fallo: para tener
# las dos cosas hay que subir `tope`, y eso se paga en el remallado de la capa, que es POR VOXEL
# (~1,6 µs cada uno; 1500 copos = 2,4 ms/frame). `dura` sigue mandando cuando el cupo no aprieta.
#
#   python3 herramientas/parche_snp_nieve_no_para.py
#   ...y publicarlo:  curl -X POST localhost:8500/api/snippets -d @data/snippets/particulas-voxel.json
import json, sys, os, tempfile

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PARTIC = os.path.join(RAIZ, 'data', 'snippets', 'particulas-voxel.json')
MARCA = 'reciclaPosada'

VIEJO = """    if(V.length + n > C.tope) n = Math.max(0, C.tope - V.length);"""

NUEVO = """    // ⚠️ AL LLEGAR AL CUPO SE RECICLA, NO SE DEJA DE SEMBRAR. Antes esta línea ponía `n = 0` y la
    // nieve SE PARABA: los posados duran `dura` segundos y se comen el cupo entero (55/s × 25 s =
    // 1375 posados para sostenerla, contra un tope de 420), así que el efecto nevaba 8 s y se
    // quedaba 21 SEGUNDOS sin un copo en el aire, en ciclo —la primera tanda entra junta y caduca
    // junta—. Reciclando, lo que se derrite es lo que cuajó primero, que es lo que hace la nieve.
    // ⚠️ Solo se recicla lo POSADO: quitar una partícula en el aire sería verla desaparecer.
    // ⚠️ Y la cuenta que queda: con el cupo apretado, lo posado ya no llega a durar `dura`, dura lo
    // que el cupo deje. Para las dos cosas hay que subir `tope`, y eso se paga en el remallado de
    // la capa, que es POR VOXEL. `dura` vuelve a mandar en cuanto el cupo no aprieta.
    if(V.length + n > C.tope){
      for(let k = V.length + n - C.tope; k > 0; k--){
        if(!reciclaPosada()) break;      // todo volando: entonces sí manda el tope, sin más
      }
      if(V.length + n > C.tope) n = Math.max(0, C.tope - V.length);
    }"""

VIEJO2 = """  // Siembra de ambiente: `porSegundo` partículas en una caja que viaja con el jugador. Se guarda el
  // resto fraccionario (`deuda`) o con dt pequeño y pocas por segundo no saldría ninguna nunca.
  let deuda = 0;"""

NUEVO2 = """  // Fuera la posada MÁS VIEJA, para hacerle sitio a una nueva. Devuelve si ha podido.
  // El barrido es O(vivas) y se hace ~2 veces por frame con 55 copos/s: son ~3 µs, y a cambio la
  // nieve no se para. Llevar una cola ordenada por antigüedad costaría más de mantener que esto.
  function reciclaPosada(){
    let peor = -1, masVieja = Infinity;
    for(let i = 0; i < V.length; i++){
      const g = V[i];
      if(g.posada && g.posada < masVieja){ masVieja = g.posada; peor = i; }
    }
    if(peor < 0) return false;
    V.splice(peor, 1);
    return true;
  }

  // Siembra de ambiente: `porSegundo` partículas en una caja que viaja con el jugador. Se guarda el
  // resto fraccionario (`deuda`) o con dt pequeño y pocas por segundo no saldría ninguna nunca.
  let deuda = 0;"""


def main():
    with open(PARTIC, encoding='utf-8') as f:
        doc = json.load(f)
    code = doc['code']
    if MARCA in code:
        print('ya estaba parcheado: no se toca nada')
        return 0
    pares = [('el tope de siembra', VIEJO, NUEVO), ('la cabecera de siembra', VIEJO2, NUEVO2)]
    for nombre, viejo, _ in pares:
        n = code.count(viejo)
        if n != 1:
            print('ABORTA: «%s» aparece %d veces, esperaba 1 (¿lo editó el dueño?).'
                  % (nombre, n), file=sys.stderr)
            return 1
    for _, viejo, nuevo in pares:
        code = code.replace(viejo, nuevo, 1)
    doc['code'] = code
    d = os.path.dirname(PARTIC)
    fd, tmp = tempfile.mkstemp(dir=d, suffix='.tmp')
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
    os.replace(tmp, PARTIC)
    print('parcheado: la siembra recicla lo posado más viejo en vez de pararse')
    return 0


if __name__ == '__main__':
    sys.exit(main())
