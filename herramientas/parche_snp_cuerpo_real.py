#!/usr/bin/env python3
# BUG-AG2 · «los agentes articulados no respetan la altura de los componentes: si una placa de
# redstone tiene altura 1 voxel suben 16, no respetan el cuerpo real de los bloques».
#
# Medido en /map/test con una placa (hab:placa) apoyada sobre hierba, con sonda_ag2.js:
#
#     mcSolid(celda de la placa)      = true       ← el agente la da por CUBO ENTERO
#     mcSolidWalk(celda de la placa)  = false      ← el jugador la atraviesa
#     mc._geoFina[placa].fdim         = [14,2,14]  ← su cuerpo real son 2 voxels de alto
#     mcSurfaceNear(sobre la placa)   = 15         ← «suelo» = la celda de la placa
#     mcSurfaceNear(al lado)          = 14         ← el suelo de verdad
#
# O sea: el agente planta los pies en 16 y el jugador en 15. UN BLOQUE ENTERO de diferencia por una
# lamina de 2/16. Los dos sitios que lo causan son los dos que este parche toca:
#
#   1. chocaTerreno() preguntaba `mcSolid`, que es «¿hay materia en esta celda?» y da la celda por
#      llena. app.js NO anda con esa: para el jugador usa mcSolidWalk (respeta `atravesable`) y, si
#      la celda se dibuja con su forma de verdad (mc._geoFina), sondea su bitset en 1/16
#      (mcTerrenoChoca, app.js:7269). Aqui se calca esa misma cuenta con la caja del agente.
#
#   2. asentar() pedia la altura a mcSurfaceNear, que mira `mc.grid[...] !== 0` y por tanto toma
#      cualquier celda ocupada como suelo, a su cota entera. Se sustituye por superficieCerca(), que
#      es la misma busqueda con mcSolidWalk; y despues se BAJA en pasos de 1/16 hasta apoyarse en el
#      cuerpo real, que es lo que hace que una losa levante media celda y no una entera.
#
# La bajada fina solo se paga si la celda de apoyo se dibuja fina (celdaFina): sobre un bloque
# macizo no se sondea ni una vez y el andar de siempre no cambia ni un voxel.
#
# El dueño edita este snippet EN VIVO, asi que el parche es IDEMPOTENTE: si ya esta puesto, no toca
# nada y lo dice. Solo cambia `code`; el resto del documento se reescribe tal cual.
import json, sys, os, tempfile

RUTA = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data/snippets/mundo-autoarranque.json')

MARCA = 'function superficieCerca('

# ── 1. chocaTerreno: la celda deja de ser un cubo por decreto ──────────────────────────────────
CHOCA_VIEJO = '''    for (var y = y0; y <= y1; y++)
      for (var z = z0; z <= z1; z++)
        for (var x = x0; x <= x1; x++)
          if (mcSolid(x, y, z)) return true;
    return false;
  }'''

CHOCA_NUEVO = '''    // Y aqui la celda NO es un cubo por decreto. Es la misma distincion que hace app.js para el
    // jugador en mcTerrenoChoca: `mcSolidWalk` en vez de `mcSolid` (una placa de presion o una
    // hierba atravesable se ven, se apuntan y se rompen, pero no frenan) y, si la celda se dibuja
    // con su geometria de verdad (mc._geoFina), se sondea su BITSET en 1/16 en vez de darla por
    // llena. Sin esto el agente choca con el aire que hay encima de una alfombra de un voxel, y
    // asentar() lo sube a su techo: es la mitad de «no respetan el cuerpo real de los bloques».
    var GEO = mc._geoFina, T = MC_T;
    var solido = (typeof mcSolidWalk === 'function') ? mcSolidWalk : mcSolid;
    var fx0 = 0, fy0 = 0, fz0 = 0, fx1 = 0, fy1 = 0, fz1 = 0, cajaFina = false;
    for (var y = y0; y <= y1; y++)
      for (var z = z0; z <= z1; z++)
        for (var x = x0; x <= x1; x++) {
          if (!solido(x, y, z)) continue;
          if (!GEO || y < 0) return true;                 // mundo sin nada fino, o el suelo del mundo
          var gf = GEO[mc.grid[mcIdx(x, y, z)]];
          if (!gf || !gf.bits) return true;               // celda normal: el cubo entero, como siempre
          if (!cajaFina) {                                // la caja del agente en 1/16, una sola vez
            cajaFina = true;                              // (mismo redondeo hacia DENTRO que chocaEstructura)
            fx0 = Math.floor((a[0] + dx + E) * T); fx1 = Math.ceil((a[3] + dx - E) * T) - 1;
            fy0 = Math.floor((a[1] + dy + E) * T); fy1 = Math.ceil((a[4] + dy - E) * T) - 1;
            fz0 = Math.floor((a[2] + dz + E) * T); fz1 = Math.ceil((a[5] + dz - E) * T) - 1;
          }
          var d = gf.fdim, bx = x * T, by = y * T, bz = z * T;
          var ax0 = Math.max(fx0 - bx, 0), ax1 = Math.min(fx1 - bx, d[0] - 1); if (ax0 > ax1) continue;
          var ay0 = Math.max(fy0 - by, 0), ay1 = Math.min(fy1 - by, d[1] - 1); if (ay0 > ay1) continue;
          var az0 = Math.max(fz0 - bz, 0), az1 = Math.min(fz1 - bz, d[2] - 1); if (az0 > az1) continue;
          for (var fy = ay0; fy <= ay1; fy++) for (var fz = az0; fz <= az1; fz++) {
            var row = (fy * d[2] + fz) * d[0];
            for (var fx = ax0; fx <= ax1; fx++) if (gf.bits[row + fx]) return true;
          }
        }
    return false;
  }'''

# ── 2. asentar: la altura, del cuerpo real y no de la celda ────────────────────────────────────
ASENTAR_VIEJO = '''  function asentar(s, a, g, xPrev, zPrev, drop) {'''

ASENTAR_AYUDA = '''  // mcSurfaceNear, pero con el mismo criterio de «esto me sostiene» que usa el jugador. El original
  // de app.js pregunta `mc.grid[...] !== 0`, o sea que CUALQUIER celda con algo dentro es suelo a su
  // cota entera: una placa de presion apoyada en la hierba devuelve SU celda y el agente planta los
  // pies un bloque por encima de donde los pones tu. Aqui manda mcSolidWalk, que es con lo que
  // app.js decide por donde se anda y lo unico que mira `atravesable`. Sin motor delante (el mundo
  // de juguete de los tests) cae al original y se comporta como antes.
  function superficieCerca(x, z, y0, climb, drop) {
    if (typeof mcSolidWalk !== 'function') return mcSurfaceNear(x, z, y0, climb, drop);
    if (!mc.grid || !mcInside(x, 0, z)) return -1;
    var H = mc.dim.y, up = (climb === undefined) ? 1 : climb, dn = (drop === undefined) ? 3 : drop;
    var maxD = up > dn ? up : dn;
    // Mismo orden de busqueda que mcSurfaceNear: primero lo de arriba de cada anillo, luego lo de
    // abajo. Cambiarlo haria que un agente al borde de un escalon prefiriese bajar antes que subir.
    for (var d = 0; d <= maxD; d++) {
      for (var lado = 0; lado < 2; lado++) {
        if (lado === 0 ? d > up : (d === 0 || d > dn)) continue;
        var y = lado === 0 ? y0 + d : y0 - d;
        if (y < 0 || y >= H) continue;
        if (mcSolidWalk(x, y, z) && (y + 1 >= H || !mcSolidWalk(x, y + 1, z))) return y;
      }
    }
    return -1;
  }
  // ¿La celda sobre la que se acaba de apoyar SE DIBUJA con su forma de verdad? Es el interruptor de
  // la bajada fina: si no, no se sondea ni una vez y andar sigue costando lo que costaba.
  function celdaFina(x0, y, z0, x1, z1) {
    var GEO = mc._geoFina;
    if (!GEO || y < 0) return false;
    for (var x = x0; x <= x1; x++) for (var z = z0; z <= z1; z++) {
      if (!mcInside(x, y, z)) continue;
      var gf = GEO[mc.grid[mcIdx(x, y, z)]];
      if (gf && gf.bits) return true;
    }
    return false;
  }
  function asentar(s, a, g, xPrev, zPrev, drop) {'''

ALTURA_VIEJA = '''        var col = mcSurfaceNear(x, z, base, 1, drop > 0 ? drop : 3);
        if (col > alto) alto = col;      // manda la columna MAS ALTA: es sobre la que se apoya
      }
      if (alto < 0) { g.x = xPrev; g.z = zPrev; g.y = yPrev; return false; }   // abismo, o pared que no sube
      g.y = (alto + 1) - a[1];
    }'''

ALTURA_NUEVA = '''        var col = superficieCerca(x, z, base, 1, drop > 0 ? drop : 3);
        if (col > alto) alto = col;      // manda la columna MAS ALTA: es sobre la que se apoya
      }
      if (alto < 0) { g.x = xPrev; g.z = zPrev; g.y = yPrev; return false; }   // abismo, o pared que no sube
      g.y = (alto + 1) - a[1];
      // Esa altura viene en CELDAS ENTERAS, y una celda puede estar medio vacia: una losa, un
      // bordillo, una placa de presion. Plantar los pies en su techo levanta al agente hasta 16
      // voxels sobre el cuerpo real del bloque — el «suben 16» del ticket. Se baja en pasos de 1/16
      // hasta apoyarlo donde de verdad hay materia, que es la misma resolucion a la que el jugador
      // anda sobre esas mismas piezas. Y solo si la celda de apoyo se dibuja fina: sobre un macizo
      // el primer paso ya chocaria, asi que ni se entra y el andar de siempre no cambia.
      if (celdaFina(x0, alto, z0, x1, z1)) {
        var yTecho = g.y, INCB = 1 / MC_T, bj = INCB;
        for (; bj <= 1 + 1e-6; bj += INCB) if (chocaMundo(s, a, g.x, yTecho - bj, g.z)) break;
        g.y = yTecho - (bj - INCB);      // el ultimo escalon libre; si el primero ya choca, se queda igual
      }
    }'''


def main():
    with open(RUTA, encoding='utf-8') as f:
        doc = json.load(f)
    code = doc['code']

    if MARCA in code:
        print('ya estaba parcheado: no se toca nada')
        return 0

    faltan = [n for n, v in (('chocaTerreno', CHOCA_VIEJO),
                             ('asentar', ASENTAR_VIEJO),
                             ('la altura de asentar', ALTURA_VIEJA)) if v not in code]
    if faltan:
        print('ABORTA: no encuentro el texto original de ' + ', '.join(faltan)
              + ' (¿lo editó el dueño?). No se toca el snippet.', file=sys.stderr)
        return 1

    code = code.replace(CHOCA_VIEJO, CHOCA_NUEVO, 1)
    code = code.replace(ASENTAR_VIEJO, ASENTAR_AYUDA, 1)
    code = code.replace(ALTURA_VIEJA, ALTURA_NUEVA, 1)
    doc['code'] = code

    # Guardado atomico, como todo lo que escribe en data/.
    d = os.path.dirname(RUTA)
    fd, tmp = tempfile.mkstemp(dir=d, suffix='.tmp')
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
    os.replace(tmp, RUTA)
    print('parcheado: chocaTerreno sondea fino + superficieCerca/celdaFina + bajada de 1/16 en asentar')
    return 0


if __name__ == '__main__':
    sys.exit(main())
