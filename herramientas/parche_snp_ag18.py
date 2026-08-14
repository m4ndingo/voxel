#!/usr/bin/env python3
# REQ-AG18 · «se elige el nº de bloques maximo que puede subir un agente a la vez cuando esta
# atascado, por ejemplo en un hoyo; habra agentes que pueden subir 3 escalones/bloques, otros 1,
# otros ninguno, configurable. Es solo cuando esta atascado; ahora mismo se teletransporta hasta
# arriba sin importar cuanto de hondo cayo» (dueño, 2026-08-12).
#
# Lo que hace este parche es UNA cosa dicha de dos maneras, porque el bug es el mismo:
#
#   1. `asentar()` volvia a preguntar «¿que hay bajo mis pies?» con un barrido a mano de
#      footY..footY+2 sobre la COLUMNA DEL CENTRO, y pegaba la pieza ahi (`if (targetY >= g.y)
#      g.y = targetY`). Eso es: sube lo que sea, cuando sea, sin tope y sin motivo. El teletransporte
#      del ticket.
#   2. Ese mismo barrido a mano habia sustituido a `superficieCerca()` —que es el que sabe de climb,
#      drop, fluidos y `atravesable`— y con el se fueron por el desague las TRES cosas que
#      `asentar()` tenia que hacer ademas de asentar: la huella entera (no una columna), la bajada
#      fina de 1/16 sobre losas y bordillos, y el remate `chocaMundo` + `return false` que es lo que
#      convierte un muro en un muro. Por eso hoy un esqueleto atraviesa la roca.
#
# Asi que `asentar()` se reconstruye sobre la version de `9feb126` (la ultima que colisionaba), con
# tres diferencias deliberadas:
#
#   · el tope de subida ya no es la constante 1: lo dice `trepaAhora(rig)` (REQ-AG18);
#   · la huella se mide en `a[..] + g.x`, no en `a[..]` a secas. El comentario de entonces decia que
#     la caja «ya trae g.x embebido» y NO es cierto —`chocaTerreno(s, a, g.x, ...)` se lo suma— asi
#     que aquella version sondeaba la columna de donde SALIO la pieza, no la de donde esta;
#   · desaparece el `if (typeof mcSolidWalk !== 'function') return true;` que abria la funcion. Ese
#     `return true` incondicional apagaba `asentar()` ENTERA en cualquier mundo sin ese gancho —los
#     tests, entre otros—: ni suelo, ni colision, ni `false`. `superficieCerca()` ya cae solo a
#     `mcSurfaceNear` cuando no hay `mcSolidWalk`, que es donde va esa decision.
#
# La caida deja de integrarse dentro de `asentar()` y vuelve a ser lo que ya era en el resto del
# fichero: `asentar()` PEGA al suelo y `caerDesde()` convierte el bajon en altura sobre el suelo, que
# `movPaso()` baja con `caidaPaso()` — o sea que REQ-FLUID6 (agua y lava frenan al agente igual que a
# ti) sigue en pie, por el canal bueno y sin dos integradores compitiendo.
#
# El dueño edita este snippet EN VIVO, asi que el parche es IDEMPOTENTE por MARCA. Solo cambia `code`.
import json, sys, os, tempfile

RUTA = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                    'data/snippets/mundo-autoarranque.json')

MARCA = 'REQ-AG18'

# ── 1 · `asentar()` entera ───────────────────────────────────────────────────────────────────────
VIEJO1 = """  function asentar(s, a, g, xPrev, zPrev, drop) {
    if (typeof mcSolidWalk !== 'function') return true;
    var _yEntry = g.y;
    var rig = s._rig || {};
    var cx = Math.floor((a[0] + a[3]) * 0.5 + g.x);
    var cz = Math.floor((a[2] + a[5]) * 0.5 + g.z);
    var footY = Math.floor(a[1] + g.y) - 1;
    // Buscar suelo: primero en footY y footY+1 (donde deberia estar), luego abajo
    var suelo = -1;
    for (var y = footY; y <= footY + 2 && y < (mc.dim ? mc.dim.y : 48); y++) {
      if (mcSolidWalk(cx, y, cz) && (y + 1 >= (mc.dim ? mc.dim.y : 48) || !mcSolidWalk(cx, y + 1, cz))) { suelo = y; break; }
    }
    if (suelo < 0) {
      if (footY >= 0) {
        for (var y = footY - 1; y >= 0; y--) {
          if (mcSolidWalk(cx, y, cz)) { suelo = y; break; }
        }
      } else {
        // footY negativo: buscar desde 0 hacia arriba hasta encontrar la superficie
        for (var y = 0; y < (mc.dim ? mc.dim.y : 48); y++) {
          if (mcSolidWalk(cx, y, cz) && (y + 1 >= (mc.dim ? mc.dim.y : 48) || !mcSolidWalk(cx, y + 1, cz))) { suelo = y; break; }
        }
      }
    }
    if (suelo >= 0) {
      var targetY = (suelo + 1) - a[1];
      if (targetY >= g.y) {
        g.y = targetY;
      } else {
        var dt = rig._dt || (1/60);
        if (!rig._vy) rig._vy = 0;
        // REQ-FLUID6: la caida es la MISMA funcion que la del jugador, no una copia. Los pies del
        // bicho estan en (centro de su cuerpo, a[1]+g.y): si eso cae dentro de agua o lava, baja a
        // 1/16 de gravedad y con rozamiento, exactamente igual que tu.
        rig._vy = caidaPaso(rig._vy, dt, (a[0] + a[3]) * 0.5 + g.x, a[1] + g.y, (a[2] + a[5]) * 0.5 + g.z);
        g.y += rig._vy * dt;
        if (g.y <= targetY) { g.y = targetY; rig._vy = 0; }
      }
    } else {
      var dt = rig._dt || (1/60);
      if (!rig._vy) rig._vy = 0;
      rig._vy = caidaPaso(rig._vy, dt, (a[0] + a[3]) * 0.5 + g.x, a[1] + g.y, (a[2] + a[5]) * 0.5 + g.z);   // REQ-FLUID6
      g.y += rig._vy * dt;
      // Tope: no caer por debajo del mundo
      if (a[1] + g.y < 0) { g.y = -a[1]; rig._vy = 0; if (typeof toast === 'function' && !rig._bottomToast) { rig._bottomToast = true; toast('Agente toco fondo del mundo'); console.log('[FONDO] cx='+cx+' cz='+cz+' footY='+footY+' g.y='+g.y.toFixed(1)+' a1='+a[1].toFixed(1)); } }
    }
    return true;
  }
"""

NUEVO1 = """  // REQ-AG18 · cuanto sube DE UNA VEZ, en bloques. Andando es SIEMPRE un escalon, que es lo que ha
  // hecho 'seguir' desde el primer dia. Su `escalar` entero solo se desata cuando lleva ATASCO_S
  // segundos queriendo ir a algun sitio y sin avanzar ni un milimetro — o sea, en el fondo del hoyo,
  // que es el caso del ticket y el unico en que trepar un muro de tres no parece un truco.
  // `escalar: 0` es «no trepa»: ni el escalon de andar. Un agente asi se queda donde lo dejen.
  // Sin rig (una estructura con `seguir` a secas, sin documento) no hay a quien preguntarle: un
  // escalon, exactamente como antes de este ticket.
  var ATASCO_S = 0.35;
  function trepaAhora(rig) {
    if (!rig) return 1;
    var m = (typeof rig.escalar === 'number') ? rig.escalar : 1;
    if (m < 1) return 0;
    return (rig._atasco > ATASCO_S) ? m : 1;
  }
  function asentar(s, a, g, xPrev, zPrev, drop) {
    var yPrev = g.y;
    // Sin ninguna de las dos no hay mundo al que preguntarle por el suelo (mundo de juguete a medio
    // montar): se deja pasar el paso, como hacia el 'seguir' original.
    if (typeof mcSurfaceNear === 'function' || typeof mcSolidWalk === 'function') {
      // La huella ENTERA, no la columna del centro. Sondeando solo el centro, una pieza que llega a
      // un escalon lo tiene aun bajo su morro y no bajo su centro: se calcula la altura vieja, la
      // caja choca contra el peldaño que justo iba a subir, y el escalon se comporta como un muro.
      var E = 1e-4, alto = -1;
      // ⚠️ `a` es rig.cuerpo (o s.aabb): la caja EN EL ANCLA. Lo andado va en g y hay que sumarlo,
      // igual que hace chocaTerreno(s, a, g.x, g.y, g.z). Medir la huella sin g —como decia un
      // comentario viejo, que se equivocaba— sondea la columna de donde SALIO, no la de donde esta.
      var x0 = Math.floor(a[0] + g.x + E), x1 = Math.ceil(a[3] + g.x - E) - 1;
      var z0 = Math.floor(a[2] + g.z + E), z1 = Math.ceil(a[5] + g.z - E) - 1;
      if ((x1 - x0 + 1) * (z1 - z0 + 1) > MAX_CELDAS_SEGUIR) { x0 = x1 = Math.floor((a[0] + a[3]) * 0.5 + g.x); z0 = z1 = Math.floor((a[2] + a[5]) * 0.5 + g.z); }
      var base = Math.round(a[1] + g.y) - 1;
      var sube = trepaAhora(s._rig);                                          // REQ-AG18
      for (var x = x0; x <= x1; x++) for (var z = z0; z <= z1; z++) {
        var col = superficieCerca(x, z, base, sube, drop > 0 ? drop : 3);
        if (col > alto) alto = col;      // manda la columna MAS ALTA: es sobre la que se apoya
      }
      if (alto < 0) { g.x = xPrev; g.z = zPrev; g.y = yPrev; return false; }   // abismo, o pared que no sube
      // Pegar al suelo, tambien hacia ABAJO. El bajon no se integra aqui: caerDesde() lo convierte en
      // altura sobre el suelo y movPaso() la baja con caidaPaso(), que es el mismo paso de caida del
      // jugador (REQ-FLUID6). Dos integradores compitiendo es como se perdio la colision.
      g.y = (alto + 1) - a[1];
      // Esa altura viene en CELDAS ENTERAS, y una celda puede estar medio vacia: una losa, un
      // bordillo, una placa de presion. Plantar los pies en su techo levanta al agente hasta 16
      // voxels sobre el cuerpo real del bloque. Se baja en pasos de 1/16 hasta apoyarlo donde de
      // verdad hay materia, que es la misma resolucion a la que el jugador anda sobre esas mismas
      // piezas. Y solo si la celda de apoyo se dibuja fina: sobre un macizo el primer paso ya
      // chocaria, asi que ni se entra y el andar de siempre no cambia.
      if (celdaFina(x0, alto, z0, x1, z1)) {
        var yTecho = g.y, INCB = 1 / MC_T, bj = INCB;
        for (; bj <= 1 + 1e-6; bj += INCB) if (chocaMundo(s, a, g.x, yTecho - bj, g.z)) break;
        g.y = yTecho - (bj - INCB);      // el ultimo escalon libre; si el primero ya choca, se queda igual
      }
    }
    // La altura de arriba la dio la rejilla, que SOLO ve celdas: encima puede haber una estructura
    // fina — una alfombra, un peldaño de madera, un bordillo — y dejarla como muro seria peor que
    // atravesarla. Se prueba a subirsela, igual que app.js le sube los escalones al jugador
    // (mcMoveAxis / MC_STEP): en pasos de 1/16 y hasta 1 bloque. Un muro de mas de un bloque sigue
    // siendo un muro, porque ninguna de las 16 alturas queda libre.
    // Solo lo dispara el DECORADO: si lo que estorba es terreno, se deja tal cual estaba y el
    // comportamiento de 'seguir' contra la rejilla no cambia ni un voxel.
    if (!chocaTerreno(s, a, g.x, g.y, g.z) && chocaEstructura(s, a, g.x, g.y, g.z)) {
      var yPie = g.y, INC = 1 / MC_T;
      for (var h = INC; h <= 1 + 1e-6; h += INC) {
        if (!chocaMundo(s, a, g.x, yPie + h, g.z)) { g.y = yPie + h; break; }
      }
    }
    // Y el remate, que es lo que hace que un muro sea un muro: ya a su altura buena, si la caja
    // sigue metida en el mundo (o dentro de ti), el paso NO SE DA. Sin este `return false` nadie
    // pone `bloq`, y sin `bloq` el estado «bloqueada» no llega nunca.
    if (chocaMundo(s, a, g.x, g.y, g.z) || (!g.montado && solapaJugador(a, g.x, g.y, g.z))) {
      g.x = xPrev; g.z = zPrev; g.y = yPrev; return false;
    }
    return true;
  }
"""

# ── 2 · el rig se trae su tope del documento (`andar.escalar`) ───────────────────────────────────
VIEJO2 = """      cadencia: Math.abs(num(def.andar && def.andar.cadencia, 0.7)),
      suavidad: Math.abs(num(def.andar && def.andar.suavidad, 0.12)),
"""
NUEVO2 = """      cadencia: Math.abs(num(def.andar && def.andar.cadencia, 0.7)),
      suavidad: Math.abs(num(def.andar && def.andar.suavidad, 0.12)),
      // REQ-AG18 · bloques que sube DE UNA VEZ para salir de un hoyo (0 = ninguno). Por defecto 3,
      // que es el numero que puso el dueño en el ticket y lo mas parecido a lo que hacia antes;
      // la diferencia es que ahora hay tope y hace falta estar atascado. Ver trepaAhora().
      escalar: Math.max(0, Math.min(8, Math.round(num(def.andar && def.andar.escalar, 3)))),
"""

# ── 3 · «atascado» se mide con el paso ya dado ───────────────────────────────────────────────────
VIEJO3 = """      var avance = Math.sqrt((g.x - gx0) * (g.x - gx0) + (g.z - gz0) * (g.z - gz0));
"""
NUEVO3 = """      var avance = Math.sqrt((g.x - gx0) * (g.x - gx0) + (g.z - gz0) * (g.z - gz0));
      // REQ-AG18 · atascado = QUIERE ir a algun sitio (por !== 1, o sea no es que te haya perdido) y
      // no ha avanzado nada. Resbalar por una pared cuenta como avanzar, y por eso rozar un muro no
      // le da permiso para treparlo: solo se lo da quedarse clavado. Se mide DESPUES del paso, con
      // lo recorrido de verdad, no con lo que pedia la persecucion.
      if (g.por !== 1 && avance < 1e-4) rig._atasco = (rig._atasco || 0) + dt;
      else rig._atasco = 0;
"""

# ── 4 · version del snippet ─────────────────────────────────────────────────────────────────────
VIEJO4 = "var VERSION = 'v1.31';"
NUEVO4 = "var VERSION = 'v1.32';"

CAMBIOS = [('asentar()', VIEJO1, NUEVO1),
           ('el tope del documento en crearEsqueleto', VIEJO2, NUEVO2),
           ('la cuenta de atasco en esqueletosPaso', VIEJO3, NUEVO3),
           ("VERSION 'v1.31'", VIEJO4, NUEVO4)]


def main():
    with open(RUTA, encoding='utf-8') as f:
        doc = json.load(f)
    code = doc['code']

    if MARCA in code:
        print('ya estaba parcheado: no se toca nada')
        return 0

    for nombre, viejo, _ in CAMBIOS:
        n = code.count(viejo)
        if n != 1:
            print('ABORTA: «%s» aparece %d veces, esperaba 1 (¿lo editó el dueño?). '
                  'No se toca el snippet.' % (nombre, n), file=sys.stderr)
            return 1

    for _, viejo, nuevo in CAMBIOS:
        code = code.replace(viejo, nuevo, 1)

    doc['code'] = code
    d = os.path.dirname(RUTA)
    fd, tmp = tempfile.mkstemp(dir=d, suffix='.tmp')
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
    os.replace(tmp, RUTA)
    print('parcheado: asentar() vuelve a colisionar y la subida tiene tope; VERSION v1.32')
    return 0


if __name__ == '__main__':
    sys.exit(main())
