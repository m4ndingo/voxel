#!/usr/bin/env python3
# «La nieve ya no aparece posada ni en el suelo ni en los objetos: lo atraviesa todo» (dueño, 2026-08-19).
#
# Las fisicas NO estaban rotas —medido en /map/test: 229 copos posados, 0 dentro de la materia, y en la
# foto se ven—. Lo que se hundio fue la ALFOMBRA, y es culpa del reciclado que puse para que la nieve no
# parase: volando y posados comparten el mismo `tope`, asi que con 420 y 55 copos/s solo quedan ~225
# plazas para el suelo y cada copo posado se derrite en ~4 s en vez de los 25 de `dura`. 225 motas de
# 1/16 de bloque repartidas por 26x26 bloques = 0,3 por bloque: no se ve NADA. Antes, al pararse la
# siembra, los 420 se quedaban quietos y juntos y SI se veia.
#
# Comprado con voxeles no sale: el remallado de la capa es POR VOXEL y es lineal —medido -> 1,28 us cada
# uno (500: 0,63 ms · 4000: 5,16 ms · 16000: 22,5 ms)—, o sea que una alfombra de 1375 copos costaria
# 1,76 ms/frame, justo lo que acababa de ahorrar. La palanca barata es `grosor`: engorda el CUBO sin
# tocar el numero de voxeles, asi que un copo posado de grosor 3 tapa 9 veces mas suelo por el MISMO
# coste. 225 copos gordos cubren como 2000 finos, y siguen costando 225.
#
# Por eso lo posado pasa a su PROPIO grupo de `game.voxelesUI` (`<grupo>:posada`): un grupo puede tener
# su grosor, y asi el copo que cae sigue siendo una mota fina (grosor 1) y solo engorda al cuajar.
# Es opcional (`grosorPosada: 0` = apagado) porque a la sangre o a las chispas engordarlas les sentaria
# fatal; la nieve lo pide en `efectos-demo`.
#
#   python3 herramientas/parche_snp_nieve_cuaja.py
#   ...y publicar los DOS:
#   curl -X POST localhost:8500/api/snippets -d @data/snippets/particulas-voxel.json
#   curl -X POST localhost:8500/api/snippets -d @data/snippets/efectos-demo.json
import json, sys, os, tempfile

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PARTIC = os.path.join(RAIZ, 'data', 'snippets', 'particulas-voxel.json')
EFECTOS = os.path.join(RAIZ, 'data', 'snippets', 'efectos-demo.json')
MARCA = 'grosorPosada'

# ── 1. motor: config nueva ────────────────────────────────────────────────────────────────────────
CFG_V = """  tope: 500,             // partículas vivas como mucho"""
CFG_N = """  tope: 500,             // partículas vivas como mucho
  // >1 ⇒ lo POSADO se dibuja en su propio grupo («<grupo>:posada») y con el cubo así de gordo. No son
  // más voxeles: `grosor` agranda el CUBO, no el paso, así que tapa grosor² veces más suelo GRATIS.
  // Es la única forma de que se vea la alfombra sin pagarla, porque el remallado de la capa es POR
  // VOXEL (medido: 1,28 µs cada uno, lineal hasta 16 000). 0 = apagado: a la sangre y a las chispas
  // engordarlas al tocar les sienta fatal, y son la mayoría.
  grosorPosada: 0,"""

# ── 2. motor: el grupo de lo posado ───────────────────────────────────────────────────────────────
CREA_V = """  const V = [];                                    // las partículas vivas de ESTE sistema
"""
CREA_N = """  const V = [];                                    // las partículas vivas de ESTE sistema
  // Grupo aparte para lo cuajado: es lo que permite que el copo que CAE sea una mota fina y el que ya
  // está en el suelo sea un cubo gordo, con un solo voxel cada uno. `grosor` es ajuste del grupo, se
  // pone una vez y sobrevive a limpia().
  const GP = C.grupo + ':posada';
  if(C.grosorPosada > 1 && game.voxelesUI) game.voxelesUI.grosor(GP, C.grosorPosada);
"""

# ── 3. motor: pintar en dos grupos ────────────────────────────────────────────────────────────────
PINTA_V = """    const U = game.voxelesUI; if(!U) return;
    U.limpia(C.grupo);
    const p = (1 / S.MC_T) * Math.max(1, U.tam | 0);
    for(const g of V){
      const c = g.col, f = g.f === undefined ? 1 : g.f;
      U.pon(Math.floor(g.x/p), Math.floor(g.y/p), Math.floor(g.z/p), [c[0]*f, c[1]*f, c[2]*f], C.grupo);
    }"""
PINTA_N = """    const U = game.voxelesUI; if(!U) return;
    const gordo = C.grosorPosada > 1;
    U.limpia(C.grupo); if(gordo) U.limpia(GP);
    const p = (1 / S.MC_T) * Math.max(1, U.tam | 0);
    for(const g of V){
      const c = g.col, f = g.f === undefined ? 1 : g.f;
      // El cubo gordo crece hacia +x/+y/+z desde su esquina, así que lo cuajado se apila HACIA ARRIBA
      // sobre la cara en la que se paró: es lo que se quiere, no hay que recolocar nada.
      U.pon(Math.floor(g.x/p), Math.floor(g.y/p), Math.floor(g.z/p), [c[0]*f, c[1]*f, c[2]*f],
            (gordo && g.posada) ? GP : C.grupo);
    }"""

# ── 4. motor: limpiar los dos ─────────────────────────────────────────────────────────────────────
LIMPIA_V = """    limpia(){ V.length = 0; deuda = 0; if(game.voxelesUI) game.voxelesUI.limpia(C.grupo); return 0; },"""
LIMPIA_N = """    limpia(){ V.length = 0; deuda = 0;
      if(game.voxelesUI){ game.voxelesUI.limpia(C.grupo); game.voxelesUI.limpia(GP); }
      return 0; },"""

# ── 5. efectos-demo: la nieve lo pide ─────────────────────────────────────────────────────────────
NIEVE_V = """  vuelo: 30, parada: 0.25, rebote: 0.02, roza: 0.1, tope: 420,"""
NIEVE_N = """  vuelo: 30, parada: 0.25, rebote: 0.02, roza: 0.1, tope: 420,
  // ⬅️ La alfombra, GRATIS. Volando y posados comparten `tope`, así que al suelo solo le quedan ~225
  // plazas y con copos de 1/16 de bloque sobre 26×26 bloques no se ve nada. Engordar el cubo de lo
  // cuajado a 3 tapa 9 veces más por el mismo voxel; subir `tope` en su lugar costaría 1,28 µs/frame
  // por copo. Lo que CAE sigue siendo fino: son grupos distintos.
  grosorPosada: 3,"""

PARES_PARTIC = [
    ('la config por defecto', CFG_V, CFG_N),
    ('la cabecera de crea()', CREA_V, CREA_N),
    ('pinta()', PINTA_V, PINTA_N),
    ('limpia()', LIMPIA_V, LIMPIA_N),
]
PARES_EFECTOS = [('la config de la nieve', NIEVE_V, NIEVE_N)]


def parchea(ruta, pares):
    with open(ruta, encoding='utf-8') as f:
        doc = json.load(f)
    code = doc['code']
    if MARCA in code:
        print('ya estaba parcheado, no se toca: ' + os.path.basename(ruta))
        return 0
    for nombre, viejo, _ in pares:
        n = code.count(viejo)
        if n != 1:
            print('ABORTA en %s: «%s» aparece %d veces, esperaba 1 (¿lo editó el dueño?).'
                  % (os.path.basename(ruta), nombre, n), file=sys.stderr)
            return 1
    for _, viejo, nuevo in pares:
        code = code.replace(viejo, nuevo, 1)
    doc['code'] = code
    d = os.path.dirname(ruta)
    fd, tmp = tempfile.mkstemp(dir=d, suffix='.tmp')
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
    os.replace(tmp, ruta)
    print('parcheado: ' + os.path.basename(ruta))
    return 0


def main():
    return parchea(PARTIC, PARES_PARTIC) or parchea(EFECTOS, PARES_EFECTOS)


if __name__ == '__main__':
    sys.exit(main())
