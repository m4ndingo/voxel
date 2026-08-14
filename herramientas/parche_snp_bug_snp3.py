#!/usr/bin/env python3
# BUG-SNP3 · `game.bloques.quitar()` lanza `ReferenceError: g is not defined`.
#
# En medio de `quitar()` hay 12 lineas de fisica de agente pegadas por error: el remate de la
# colision horizontal (`chocaTerreno` con la Y de entrada) y el bloque de aviso `[CAYENDO]`. Ahi
# dentro no existe NINGUNA de las variables que usan —g, xPrev, s, a, _yEntry, zPrev, rig, cx, cz,
# footY, suelo—, asi que cualquier quitar() sobre un material que SI tenia comportamiento revienta
# en la primera linea y se pierde el `return true`.
#
# ⚠️ El ticket pedia averiguar DE DONDE salieron antes de borrarlas, por si se hubieran MOVIDO desde
# `asentar()` (en cuyo caso la fisica quedaria coja y el arreglo serian dos sitios). Se rastreo comm-
# it a commit el fichero: la cadena «usar la Y de ENTRADA» NO existe en ninguna version anterior a
# 4fcab25, y en 4fcab25 nace ya dentro de `quitar()`. O sea que NO se movieron de sitio: son un
# BORRADOR que nunca llego a enchufarse en `asentar()`. Borrarlas no le quita a `asentar()` nada que
# tuviera. Que `asentar()` no compruebe el terreno es cierto y esta medido (data/tickets/REQ-AG17/),
# pero es un agujero PREEXISTENTE y de ese se ocupa REQ-AG17, no este parche: taparlo aqui seria un
# cambio de comportamiento grande y visible (hoy todos los esqueletos atraviesan la roca) colado
# dentro de un arreglo de una linea.
#
# El dueño edita este snippet EN VIVO, asi que el parche es IDEMPOTENTE por MARCA. Solo cambia `code`.
import json, sys, os, tempfile

RUTA = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                    'data/snippets/mundo-autoarranque.json')

MARCA = 'BUG-SNP3'

# ── 1 · las 12 lineas huerfanas de `quitar()` ────────────────────────────────────────────────────
VIEJO = """    // Colision horizontal: usar la Y de ENTRADA (antes de gravedad/escalon)
    if (g.x !== xPrev && chocaTerreno(s, a, g.x, _yEntry, zPrev)) { g.x = xPrev; }
    if (g.z !== zPrev && chocaTerreno(s, a, g.x, _yEntry, g.z)) { g.z = zPrev; }
    // Alerta si cae mucho
    if (rig._vy && rig._vy < -10 && typeof toast === 'function' && !rig._fallInfo) {
      rig._fallInfo = true;
      var _ci = {cx: cx, cz: cz, footY: footY, suelo: suelo, gy: g.y.toFixed(1), vy: rig._vy.toFixed(1)};
      var _arriba = (footY+1 < (mc.dim?mc.dim.y:48)) ? mcSolidWalk(cx,footY+1,cz) : false;
      var _abajo = (footY >= 0) ? mcSolidWalk(cx,footY,cz) : false;
      toast('Cayendo! suelo='+_ci.suelo+' footY='+_ci.footY+' arriba='+_arriba+' abajo='+_abajo+' vy='+_ci.vy);
      console.log('[CAYENDO] suelo='+_ci.suelo+' footY='+_ci.footY+' arriba='+_arriba+' abajo='+_abajo+' vy='+_ci.vy+' cx='+_ci.cx+' cz='+_ci.cz+' gy='+_ci.gy);
    }
"""

NUEVO = """    // BUG-SNP3: aqui vivian 12 lineas de fisica de agente (chocaTerreno con la Y de entrada y el
    // aviso [CAYENDO]). Ni una sola de sus variables existe en este ambito, asi que quitar() moria
    // con ReferenceError antes del return y el llamante nunca veia el true. Eran un borrador para
    // `asentar()` que nunca se enchufo — no se movieron de ahi: mirar el commit 4fcab25.
    return true;
"""

# ── 2 · el `return true` que quedaba detras del bloque, ahora duplicado ──────────────────────────
# Se quita para no dejar codigo muerto: el nuevo texto ya cierra la funcion.
VIEJO2 = NUEVO + "    return true;\n  }\n"
NUEVO2 = NUEVO + "  }\n"

# ── 3 · sube la version del snippet: el mundo vivo compara VERSION para recargar ─────────────────
VIEJO3 = "var VERSION = 'v1.30';"
NUEVO3 = "var VERSION = 'v1.31';"


def main():
    with open(RUTA, encoding='utf-8') as f:
        doc = json.load(f)
    code = doc['code']

    if MARCA in code:
        print('ya estaba parcheado: no se toca nada')
        return 0

    # Todo o nada: se valida cada ancla ANTES de tocar una sola letra.
    for nombre, viejo in [('las 12 lineas huerfanas', VIEJO), ("VERSION 'v1.30'", VIEJO3)]:
        n = code.count(viejo)
        if n != 1:
            print('ABORTA: «%s» aparece %d veces, esperaba 1 (¿lo editó el dueño?). '
                  'No se toca el snippet.' % (nombre, n), file=sys.stderr)
            return 1

    code = code.replace(VIEJO, NUEVO, 1)
    if code.count(VIEJO2) != 1:
        print('ABORTA: tras quitar el bloque no aparece el `return true; }` esperado detras.',
              file=sys.stderr)
        return 1
    code = code.replace(VIEJO2, NUEVO2, 1)
    code = code.replace(VIEJO3, NUEVO3, 1)

    doc['code'] = code
    d = os.path.dirname(RUTA)
    fd, tmp = tempfile.mkstemp(dir=d, suffix='.tmp')
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
    os.replace(tmp, RUTA)
    print('parcheado: quitar() ya no arrastra fisica de agente; VERSION v1.31')
    return 0


if __name__ == '__main__':
    sys.exit(main())
