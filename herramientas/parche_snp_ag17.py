#!/usr/bin/env python3
# REQ-AG17 · «un agente no deberia meterse en el espacio de otro, deberia empujarlo como mucho
# procurando detenerse cuando el otro agente no le deje pasar.» (acotado por el dueño a
# `game.esqueletos`, o sea a los rigs articulados; los NPC-cubo de `mc.agents` no entran).
#
# QUE HABIA: el comentario de `chocaEstructura` lo decia con todas las letras — «dos agentes siguen
# sin estorbarse (como hasta ahora)», y el motivo era el COSTE de barrer piezas en movimiento. Ese
# motivo no aplica aqui: comparar la caja del CUERPO entre rigs es O(nº de rigs²) con n minusculo,
# no un barrido fino por celda y por eje.
#
# QUE SE AÑADE, tres funciones y dos enganches:
#   · `otroAgente(rig, a, dx, dy, dz, salvo)` — calcado de `solapaJugador`, pero contra la caja de
#     cuerpo de los DEMAS rigs vivos. Devuelve el que estorba, o null.
#   · `empujarA(o, dx, dz, quien)` — le mueve `g` al otro por la MISMA delta y valida el empujon con
#     la maquinaria de siempre (`asentar` + `solapaJugador` + `otroAgente`). Si el otro no cabe,
#     devuelve false y no se ha movido nadie. Ahi esta el «detenerse»: una fila de tres se para
#     entera, porque el empujon del segundo choca con el tercero.
#   · `libreDeAgentes(...)` / `avanzar(...)` — el envoltorio que usan las dos ramas de `pasoSeguir`.
#
# ⚠️ EL PAR QUE YA ESTABA SOLAPADO SE IGNORA. Dos agentes plantados en el mismo sitio, o uno subido
# encima de otro, se quedarian clavados de por vida si el solape bastara para bloquear. Por eso se
# mira quien estorbaba YA en la posicion de partida (`ya`) y a ese no se le hace caso: que se
# separen andando. Es la misma idea que `g.montado` con el jugador.
#
# NO se toca `app.js` (regla de CLAUDE.md: el framework es agnostico a como se comportan los
# agentes) y NO se añade estado nuevo a `POR_SIG`: «bloqueada» (`g.por = 3`) ya es exactamente lo
# que hay que decir, y ahora por fin se alcanza.
#
# El dueño edita este snippet EN VIVO, asi que el parche es IDEMPOTENTE por MARCA. Solo cambia `code`.
import json, sys, os, tempfile

RUTA = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                    'data/snippets/mundo-autoarranque.json')

MARCA = 'REQ-AG17'

# ── 1 · las tres funciones nuevas, justo detras de `solapaJugador` ───────────────────────────────
VIEJO = """  }
  function seguirObjetivos(dt) {"""

NUEVO = """  }
  // REQ-AG17 · y que no se embutan ENTRE ELLOS. Mismo patron que solapaJugador, pero contra la caja
  // de cuerpo de los demas rigs vivos. `salvo` es el que ya estorbaba antes de dar el paso: a ese no
  // se le hace caso (ver empujarA). Solo mira `esqueletos`: una estructura con `seguir` a secas no
  // tiene rig y sigue atravesando a quien sea, que es como estaba y lo que el dueño acoto.
  // El desfase de un frame (el otro puede no haberse movido aun) es el mismo que ya tienen los
  // centros de los objetivos, y es justo lo que hace que el orden del array no importe.
  function otroAgente(rig, a, dx, dy, dz, salvo) {
    if (!rig || esqueletos.length < 2) return null;
    for (var i = 0; i < esqueletos.length; i++) {
      var o = esqueletos[i];
      if (o === rig || o === salvo || o.quitado || !o.cuerpo) continue;
      var Po = o.partes && o.partes[0], go = Po && Po.s && Po.s._sig;
      if (!go) continue;
      var b = o.cuerpo;
      if ((a[0] + dx) < (b[3] + go.x) && (a[3] + dx) > (b[0] + go.x)
       && (a[1] + dy) < (b[4] + go.y) && (a[4] + dy) > (b[1] + go.y)
       && (a[2] + dz) < (b[5] + go.z) && (a[5] + dz) > (b[2] + go.z)) return o;
    }
    return null;
  }
  // «Empujarlo como mucho»: al otro se le mueve `g` la MISMA delta y se valida con la maquinaria de
  // siempre. Si no cabe (muro, abismo, el jugador, o un TERCER agente detras) el empujon no se da y
  // el que empuja se queda bloqueado — que es la segunda mitad del ticket. Solo en horizontal: a
  // nadie se le empuja hacia arriba, la Y de un cuerpo la manda el suelo.
  function empujarA(o, dx, dz, quien) {
    if (Math.abs(dx) < 1e-9 && Math.abs(dz) < 1e-9) return false;
    var Po = o.partes && o.partes[0], so = Po && Po.s, go = so && so._sig;
    if (!so || !so.aabb || !go) return false;
    var xP = go.x, zP = go.z, yP = go.y;
    go.x += dx; go.z += dz;
    // asentar() ya deshace los tres ejes si no hay donde pisar; lo que devuelve false aqui es «el
    // empujado no tiene suelo, o el suelo que tiene esta dentro del terreno».
    if (!asentar(so, o.cuerpo, go, xP, zP, o.fis ? o.fis.caida : 0)) return false;
    if ((!go.montado && solapaJugador(o.cuerpo, go.x, go.y, go.z))
        || otroAgente(o, o.cuerpo, go.x, go.y, go.z, quien)) {
      go.x = xP; go.z = zP; go.y = yP;
      return false;
    }
    return true;
  }
  // ¿el paso de (g*) a (n*) deja sitio? Si hay alguien delante se le intenta apartar; si no se deja,
  // el paso no vale. `ya` = quien estorbaba YA en el punto de partida: ese par estaba solapado antes
  // (dos plantados encima, un re-estampado) y bloquear por el los dejaria clavados para siempre.
  function libreDeAgentes(s, a, gx, gy, gz, nx, ny, nz) {
    var rig = s && s._rig;
    if (!rig || esqueletos.length < 2) return true;
    var ya = otroAgente(rig, a, gx, gy, gz, null);
    var o = otroAgente(rig, a, nx, ny, nz, ya);
    if (!o) return true;
    // Ojo: NO se vuelve a mirar despues del empujon. Los dos se han movido lo mismo, asi que el
    // solape es identico — comprobarlo otra vez bloquearia siempre y no empujaria nunca.
    return empujarA(o, nx - gx, nz - gz, rig);
  }
  // asentar() + REQ-AG17, que es lo que la rama 'xz' llama por cada eje.
  function avanzar(s, a, g, xPrev, zPrev, dr) {
    var yPrev = g.y;
    if (!asentar(s, a, g, xPrev, zPrev, dr)) return false;
    if (libreDeAgentes(s, a, xPrev, yPrev, zPrev, g.x, g.y, g.z)) return true;
    g.x = xPrev; g.z = zPrev; g.y = yPrev;
    return false;
  }
  function seguirObjetivos(dt) {"""

# ── 2 · la rama 'xz' (la que usan los esqueletos por defecto) ────────────────────────────────────
VIEJO2 = """        if (avX) { g.x += avX; if (!asentar(s, a, g, x0, z0, dr)) bloq = true; }
        if (avZ) { g.z += avZ; if (!asentar(s, a, g, g.x, z0, dr)) bloq = true; }
"""
NUEVO2 = """        if (avX) { g.x += avX; if (!avanzar(s, a, g, x0, z0, dr)) bloq = true; }
        if (avZ) { g.z += avZ; if (!avanzar(s, a, g, g.x, z0, dr)) bloq = true; }
"""

# ── 3 · la rama 'xyz' (ejes libres). En Y no se empuja a nadie: solo estorba. ────────────────────
VIEJO3 = """        if (avX && !chocaMundo(s, a, g.x + avX, g.y, g.z) && !(!g.montado && solapaJugador(a, g.x + avX, g.y, g.z))) g.x += avX; else if (avX) bloq = true;
        if (avZ && !chocaMundo(s, a, g.x, g.y, g.z + avZ) && !(!g.montado && solapaJugador(a, g.x, g.y, g.z + avZ))) g.z += avZ; else if (avZ) bloq = true;
        if (avY && !chocaMundo(s, a, g.x, g.y + avY, g.z) && !solapaJugador(a, g.x, g.y + avY, g.z)) g.y += avY; else if (avY) bloq = true;
"""
NUEVO3 = """        if (avX && !chocaMundo(s, a, g.x + avX, g.y, g.z) && !(!g.montado && solapaJugador(a, g.x + avX, g.y, g.z)) && libreDeAgentes(s, a, g.x, g.y, g.z, g.x + avX, g.y, g.z)) g.x += avX; else if (avX) bloq = true;
        if (avZ && !chocaMundo(s, a, g.x, g.y, g.z + avZ) && !(!g.montado && solapaJugador(a, g.x, g.y, g.z + avZ)) && libreDeAgentes(s, a, g.x, g.y, g.z, g.x, g.y, g.z + avZ)) g.z += avZ; else if (avZ) bloq = true;
        if (avY && !chocaMundo(s, a, g.x, g.y + avY, g.z) && !solapaJugador(a, g.x, g.y + avY, g.z) && libreDeAgentes(s, a, g.x, g.y, g.z, g.x, g.y + avY, g.z)) g.y += avY; else if (avY) bloq = true;
"""

# ── 4 · sube la version del snippet: el mundo vivo compara VERSION para recargar ─────────────────
VIEJO4 = "var VERSION = 'v1.32';"
NUEVO4 = "var VERSION = 'v1.33';"


def main():
    with open(RUTA, encoding='utf-8') as f:
        doc = json.load(f)
    code = doc['code']

    if MARCA in code:
        print('ya estaba parcheado: no se toca nada')
        return 0

    pares = [('el hueco tras solapaJugador', VIEJO, NUEVO),
             ("la rama 'xz' de pasoSeguir", VIEJO2, NUEVO2),
             ("la rama 'xyz' de pasoSeguir", VIEJO3, NUEVO3),
             ("VERSION 'v1.32'", VIEJO4, NUEVO4)]

    # Todo o nada: se valida cada ancla ANTES de tocar una sola letra.
    for nombre, viejo, _ in pares:
        n = code.count(viejo)
        if n != 1:
            print('ABORTA: «%s» aparece %d veces, esperaba 1 (¿lo editó el dueño?). '
                  'No se toca el snippet.' % (nombre, n), file=sys.stderr)
            return 1

    for _, viejo, nuevo in pares:
        code = code.replace(viejo, nuevo, 1)

    doc['code'] = code
    d = os.path.dirname(RUTA)
    fd, tmp = tempfile.mkstemp(dir=d, suffix='.tmp')
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
    os.replace(tmp, RUTA)
    print('parcheado: los esqueletos ya no se solapan (se empujan, y se paran); VERSION v1.33')
    return 0


if __name__ == '__main__':
    sys.exit(main())
