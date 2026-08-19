#!/usr/bin/env python3
# La lluvia de `efectos-demo` hunde los fps (encargo del dueño, 2026-08-19). No es el dibujo: es la
# FISICA, y concretamente el numero de sondas al mundo por gota y frame.
#
# Medido en /map/test (80 estructuras), pasos de dt fijo 1/30 s:
#
#     efecto   vivas  volando  sondas de estructura/frame  por particula  ms de `_paso`/frame
#     lluvia      61       61            1 370,8               22,5            11,15
#     nieve      420      176              664,1                3,8             5,33
#
#   ...y el repintado de la capa, que es lo que la documentacion daba por caro, son 0,08 ms.
#
# El porque: `paso()` avanza en subpasos de medio voxel fino (1/32 de bloque) para no atravesar el
# suelo de un frame. La lluvia sale a `fuerza:16` y acelera a `grav:42`, o sea ~40 bloques/s: 1,3
# bloques por frame => topa en los 24 subpasos SIEMPRE. La nieve va a ~1 bloque/s => 1 subpaso. Y
# cada subpaso llama a `S.solido`, que en el aire (que es donde esta una gota) no puede cortar por
# la rejilla y acaba en `mcFineBoxHit`, que recorre `mc.structures` ENTERO: no hay indice espacial.
# 22 subpasos x 61 gotas x 80 estructuras = 109 667 iteraciones por frame, para contestar «aire».
#
# EL ARREGLO ES UNA FASE GRUESA, y va en la LIBRERIA, no en la lluvia: se pregunta UNA vez por el
# tramo entero del frame («¿en toda esta caja no hay nada?») y, si esta limpio —el caso normal de
# cualquier cosa que cae por el aire—, se avanza de un tiron con 1 sonda en vez de 22. En cuanto la
# caja toca algo se vuelve a los subpasos de siempre, asi que la precision del choque no cambia.
# Se lo llevan los siete efectos, que era el objetivo de sacar esto de la espada (REQ-SNP-LIB2).
#
#   python3 herramientas/parche_snp_lluvia_fase_gruesa.py
#   ...y publicarlos:
#     curl -X POST localhost:8500/api/snippets -d @data/snippets/sondas-mundo.json
#     curl -X POST localhost:8500/api/snippets -d @data/snippets/particulas-voxel.json
import json, sys, os, tempfile

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SONDAS = os.path.join(RAIZ, 'data', 'snippets', 'sondas-mundo.json')
PARTIC = os.path.join(RAIZ, 'data', 'snippets', 'particulas-voxel.json')
MARCA = 'cajaVacia'

# ── 1 · `sondas-mundo`: la pregunta gruesa ───────────────────────────────────────────────────────
S_VIEJO = """// Las dos preguntas juntas, que es lo que quiere casi todo el mundo.
function solido(x, y, z){
  return solidoRejilla(x, y, z) || solidoEstructura(x, y, z);
}"""

S_NUEVO = """// Las dos preguntas juntas, que es lo que quiere casi todo el mundo.
function solido(x, y, z){
  return solidoRejilla(x, y, z) || solidoEstructura(x, y, z);
}

// ¿En TODA esta caja del mundo no hay absolutamente nada? La fase GRUESA: una sola pregunta por un
// tramo entero, en vez de una por cada punto del tramo.
//
// ⚠️ Existe porque `mcFineBoxHit` recorre `mc.structures` ENTERO en cada llamada — no hay índice
// espacial —, así que lo caro no es la caja, es el número de llamadas. Quien avance rápido (una
// gota de lluvia hace 1,3 bloques por frame) tenía que trocear el paso para no atravesar el suelo
// y pagaba ese bucle una vez por trozo: medidas 22 sondas por gota y frame, todas contestando
// «aire». Preguntando primero por la caja del tramo entero se contesta lo mismo con UNA.
//
// ⚠️ Es CONSERVADORA a propósito, y la asimetría es la clave: `false` («aquí puede haber algo») no
// cuesta más que volver al camino lento, pero un `true` de más sería atravesar una pared. Por eso
// la rejilla se mira POR CELDA, sin afinar la forma: sobre una antorcha contesta `false` aunque el
// tramo pase por el aire de su celda, y ese caso se resuelve, como antes, punto a punto.
function cajaVacia(x0, y0, z0, x1, y1, z1){
  if(y0 < 0 || y1 < 0) return false;                       // el suelo del mundo es sólido
  const bx0 = Math.floor(Math.min(x0, x1)), bx1 = Math.floor(Math.max(x0, x1)),
        by0 = Math.floor(Math.min(y0, y1)), by1 = Math.floor(Math.max(y0, y1)),
        bz0 = Math.floor(Math.min(z0, z1)), bz1 = Math.floor(Math.max(z0, z1));
  // Una caja enorme haría más trabajo aquí que el que ahorra: que conteste el camino lento.
  if((bx1-bx0+1) * (by1-by0+1) * (bz1-bz0+1) > 64) return false;
  const rej = (typeof mcSolidWalk === 'function') ? mcSolidWalk
            : (typeof mcSolid === 'function' ? mcSolid : null);
  if(rej) for(let bx = bx0; bx <= bx1; bx++) for(let by = by0; by <= by1; by++)
    for(let bz = bz0; bz <= bz1; bz++) if(rej(bx, by, bz)) return false;
  const caja = (typeof mcFineBoxHit === 'function') ? (mcFineBoxHit._orig || mcFineBoxHit) : null;
  if(caja && caja(Math.floor(Math.min(x0,x1)*MC_T), Math.floor(Math.min(y0,y1)*MC_T),
                  Math.floor(Math.min(z0,z1)*MC_T), Math.floor(Math.max(x0,x1)*MC_T),
                  Math.floor(Math.max(y0,y1)*MC_T), Math.floor(Math.max(z0,z1)*MC_T))) return false;
  return true;
}"""

S_VIEJO2 = "return { solido, solidoRejilla, solidoEstructura, geoFina, suelo, MC_T,"
S_NUEVO2 = "return { solido, solidoRejilla, solidoEstructura, cajaVacia, geoFina, suelo, MC_T,"

# ── 2 · `particulas-voxel`: usarla antes de trocear el paso ──────────────────────────────────────
P_VIEJO = """      // Subpasos de como mucho medio voxel fino: a 5 bloques/s un frame entero se salta el suelo.
      const v = Math.hypot(g.vx, g.vy, g.vz);
      const n = Math.max(1, Math.min(24, Math.ceil(v * dt / (S.MC_T ? 0.5 / S.MC_T : 0.03))));
      const h = dt / n;
      // El vaivén de la nieve: no es física, es un empujón lateral que va y viene. Cada copo lleva
      // su propia fase (`g.fase`) o todos irían a la vez y se vería la fila.
      if(C.deriva){
        const w = (ahora + g.fase) * C.derivaHz * Math.PI * 2;
        g.vx = Math.cos(w) * C.deriva; g.vz = Math.sin(w * 0.7) * C.deriva;
      }"""

P_NUEVO = """      // Subpasos de como mucho medio voxel fino: a 5 bloques/s un frame entero se salta el suelo.
      let n = Math.max(1, Math.min(24, Math.ceil(v * dt / (S.MC_T ? 0.5 / S.MC_T : 0.03))));
      // El vaivén de la nieve: no es física, es un empujón lateral que va y viene. Cada copo lleva
      // su propia fase (`g.fase`) o todos irían a la vez y se vería la fila.
      if(C.deriva){
        const w = (ahora + g.fase) * C.derivaHz * Math.PI * 2;
        g.vx = Math.cos(w) * C.deriva; g.vz = Math.sin(w * 0.7) * C.deriva;
      }
      // ⚠️ FASE GRUESA — es lo único que separa la lluvia de ser injugable ────────────────────────
      // Trocear el paso cuesta una sonda al mundo POR TROZO, y cada sonda recorre `mc.structures`
      // entero. Lo caro es la velocidad, no la cantidad: la lluvia va a ~40 bloques/s y topaba en
      // los 24 trozos siempre (medido: 61 gotas, 1 371 sondas/frame, 11 ms de CPU antes de dibujar
      // nada; la nieve, con 420 copos pero 7 veces más lenta, iba a 1 trozo). Pero una gota que
      // cae por el aire no choca con nada en TODO el tramo, y eso se puede preguntar de una vez:
      // si la caja del tramo está limpia, se avanza entero con una sonda en lugar de 22.
      // El troceo NO desaparece: en cuanto la caja roza algo, se vuelve a él y el choque se
      // resuelve con la misma precisión de medio voxel fino que antes.
      // Y si la caja sale limpia, la sonda de dentro del bucle sobra POR CONSTRUCCIÓN: el tramo
      // entero está dentro de esa caja, así que preguntar nunca podría contestar otra cosa. Ese
      // `libre` es la mitad del ahorro de la nieve, que va despacio y solo troceaba en 4.
      let libre = false;
      if(n > 1){
        const ex = g.x + g.vx*dt, ey = g.y + (g.vy - C.grav*dt)*dt, ez = g.z + g.vz*dt,
              m = 2 / (S.MC_T || 16);   // margen: la curva del troceo cae dentro de esta caja
        if(S.cajaVacia(Math.min(g.x,ex)-m, Math.min(g.y,ey)-m, Math.min(g.z,ez)-m,
                       Math.max(g.x,ex)+m, Math.max(g.y,ey)+m, Math.max(g.z,ez)+m)){ n = 1; libre = true; }
      }
      const h = dt / n;"""

# `v` se calculaba junto a `n`; ahora `n` se declara con `let` y `v` sube una línea antes.
P_VIEJO2 = """      if((g.vuela = (g.vuela || 0) + dt) > C.vuelo){ V.splice(i, 1); cambia = true; continue; }"""
P_NUEVO2 = """      if((g.vuela = (g.vuela || 0) + dt) > C.vuelo){ V.splice(i, 1); cambia = true; continue; }
      const v = Math.hypot(g.vx, g.vy, g.vz);"""

P_VIEJO3 = """        if(S.solido(nx, ny, nz)){"""
P_NUEVO3 = """        if(!libre && S.solido(nx, ny, nz)){"""


def parchea(ruta, pares):
    with open(ruta, encoding='utf-8') as f:
        doc = json.load(f)
    code = doc['code']
    if MARCA in code:
        print('ya estaba parcheado, no se toca: ' + os.path.basename(ruta))
        return 0
    # Todo o nada: se validan las anclas ANTES de tocar una sola letra.
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
    r = parchea(SONDAS, [('solido()', S_VIEJO, S_NUEVO), ('el return de sondas-mundo', S_VIEJO2, S_NUEVO2)])
    if r:
        return r
    return parchea(PARTIC, [('el troceo del paso', P_VIEJO, P_NUEVO),
                            ('el tope de vuelo', P_VIEJO2, P_NUEVO2),
                            ('la sonda de dentro del bucle', P_VIEJO3, P_NUEVO3)])


if __name__ == '__main__':
    sys.exit(main())
