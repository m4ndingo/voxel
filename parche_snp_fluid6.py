#!/usr/bin/env python3
# REQ-FLUID6 · «los agentes tienen que comportarse a nivel de fisicas como los jugadores en todos los
# casos» (dueño, 2026-08-11). Dentro de un liquido la gravedad efectiva baja a 1/16 y aparece un
# rozamiento vertical que da la velocidad terminal.
#
# El jugador cae en app.js (mcUpdate). Los agentes articulados NO pasan por ahi: tienen sus propios
# integradores en este snippet, y son DOS —`asentar()`, que es la caida libre de la raiz, y
# `movPaso()`, que es lo que el cuerpo lleva encima (golpe, trampolin, borde, patinaje)—. Copiar aqui
# la formula seria condenarlas a divergir en el primer retoque, que es justo lo que el dueño pidio que
# no pasara. Asi que las tres llaman a `mcCaidaPaso(vy, dt, x, y, z)`, que la pone app.js: el motor
# ofrece el paso de caida y quien tenga un cuerpo lo usa, igual que mc.sunExtra o mcXrayExtra.
#
# Sin motor delante (el mundo de juguete de los tests) `mcCaidaPaso` no existe: se cae al `-22*dt` de
# siempre y todo se comporta como antes.
#
# El dueño edita este snippet EN VIVO, asi que el parche es IDEMPOTENTE por MARCA. Solo cambia `code`.
import json, sys, os, tempfile

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                    'data/snippets/mundo-autoarranque.json')

MARCA = 'REQ-FLUID6'

# ── 1 · caida libre de la raiz, con suelo localizado mas abajo (asentar) ──────────────────────────
V1 = '''        var dt = rig._dt || (1/60);
        if (!rig._vy) rig._vy = 0;
        rig._vy -= 22 * dt;
        g.y += rig._vy * dt;
'''
N1 = '''        var dt = rig._dt || (1/60);
        if (!rig._vy) rig._vy = 0;
        // REQ-FLUID6: la caida es la MISMA funcion que la del jugador, no una copia. Los pies del
        // bicho estan en (centro de su cuerpo, a[1]+g.y): si eso cae dentro de agua o lava, baja a
        // 1/16 de gravedad y con rozamiento, exactamente igual que tu.
        rig._vy = caidaPaso(rig._vy, dt, (a[0] + a[3]) * 0.5 + g.x, a[1] + g.y, (a[2] + a[5]) * 0.5 + g.z);
        g.y += rig._vy * dt;
'''

# ── 2 · caida libre sin suelo debajo (asentar, rama del vacio) ────────────────────────────────────
V2 = '''      var dt = rig._dt || (1/60);
      if (!rig._vy) rig._vy = 0;
      rig._vy -= 22 * dt;
      g.y += rig._vy * dt;
'''
N2 = '''      var dt = rig._dt || (1/60);
      if (!rig._vy) rig._vy = 0;
      rig._vy = caidaPaso(rig._vy, dt, (a[0] + a[3]) * 0.5 + g.x, a[1] + g.y, (a[2] + a[5]) * 0.5 + g.z);   // REQ-FLUID6
      g.y += rig._vy * dt;
'''

# ── 3 · lo que el cuerpo lleva encima: golpe, trampolin, caida por un borde (movPaso) ─────────────
# Aqui la altura va en `e.alto` (sobre el suelo), asi que los pies estan en a[1] + g.y + e.alto.
V3 = '''    e.vy -= GRAVEDAD * dt;
'''
N3 = '''    // REQ-FLUID6 · misma caida que el jugador. `alto` es altura SOBRE EL SUELO, asi que los pies
    // del bicho estan en a[1] + g.y + alto: un zombie al que empujan a un lago frena al entrar.
    var _a = rig.cuerpo;
    e.vy = caidaPaso(e.vy, dt, (_a[0] + _a[3]) * 0.5 + g.x, _a[1] + g.y + e.alto, (_a[2] + _a[5]) * 0.5 + g.z);
'''

# ── 4 · el puente hacia app.js, junto a la constante que ya declaraba la misma intencion ──────────
V4 = '''  var GRAVEDAD = 22;                                    // la misma que app.js (mc.vel[1] -= 22*dt)
'''
N4 = '''  var GRAVEDAD = 22;                                    // la misma que app.js (mc.vel[1] -= 22*dt)
  // REQ-FLUID6 · un paso de caida, el MISMO que el del jugador. app.js lo ofrece (mcCaidaPaso) y
  // aqui solo se llama: dentro de un liquido baja la gravedad a 1/16 y añade rozamiento vertical, y
  // fuera devuelve el `-GRAVEDAD*dt` de toda la vida. El respaldo mantiene el snippet ejecutable en
  // el mundo de juguete de los tests, donde no hay motor.
  function caidaPaso(vy, dt, x, y, z) {
    return (typeof mcCaidaPaso === 'function') ? mcCaidaPaso(vy, dt, x, y, z) : (vy - GRAVEDAD * dt);
  }
'''

CAMBIOS = [('el puente caidaPaso()', V4, N4),
           ('caida de la raiz con suelo debajo', V1, N1),
           ('caida de la raiz en el vacio', V2, N2),
           ('empuje/trampolin/borde (movPaso)', V3, N3)]


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
    print('parcheado: los %d integradores de agente caen por mcCaidaPaso, como el jugador' % (len(CAMBIOS) - 1))
    return 0


if __name__ == '__main__':
    sys.exit(main())
