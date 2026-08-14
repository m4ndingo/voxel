#!/usr/bin/env python3
# BUG-AG1 (mitad del pistón) · «los agentes articulados no se ven afectados por los pistones y
# deberian».
#
# El pistón ya sabe empujar al jugador (BUG-RS9, `apartar()` en redstone/redstone-piezas.js). Con los
# agentes articulados no podía ni intentarlo: un agente es un puñado de estructuras estampadas cuya
# raíz se mueve con `moverRaiz`/`asentar`, y nada de eso asoma fuera de la librería de esqueletos.
#
# Medido (test_piston_empuja.js §D, contra el código anterior): al agente no le pasaba NADA. La cabeza
# se escribía dentro de su cuerpo y él se quedaba ahí, embutido y sin moverse un float.
#
# Aquí se añaden las DOS capacidades generales que le faltaban a la librería, y solo eso:
#
#   game.esqueletos.enCaja(x0,y0,z0, x1,y1,z1)  ← qué agentes tienen el cuerpo dentro de esa caja
#   game.esqueletos.desplazar(rig, dx, dy, dz)  ← muévelo, con la colisión de siempre
#
# La política (cuánto, hacia dónde, cuándo rendirse) la pone la PIEZA, en redstone-piezas.js. Es la
# misma división que ya hay en todo lo demás: la librería da la capacidad, el material decide el
# comportamiento. Un `game.esqueletos.empujaPiston()` habría metido el redstone dentro del motor de
# agentes, que es justo lo que no puede pasar.
#
# El parche NO toca app.js.
#
# El dueño edita este snippet EN VIVO, asi que el parche es IDEMPOTENTE: si ya esta puesto, no toca
# nada y lo dice. Solo cambia `code`; el resto del documento se reescribe tal cual.
import json, sys, os, tempfile

RUTA = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data/snippets/mundo-autoarranque.json')

MARCA = '    enCaja: function ('
# La primera version de `desplazar` movia la raiz con moverRaiz, que REASIENTA en el suelo — y asentar
# sube un bloque entero para salvar escalones, asi que el piston montaba al agente ENCIMA de su propia
# cabeza en vez de apartarlo (medido: pico y=17.765 partiendo de 16, con el agente andando de verdad).
# Esta marca distingue las dos versiones, para poder subir a la buena un snippet que ya se parcheo con
# la vieja sin tener que despacharlo a mano.
MARCA_RIGIDO = '    // Un empujon no es un paso: no trepa.'

# ── 1. las dos capacidades, colgadas de game.esqueletos ────────────────────────────────────────
# `desplazar` se define aparte porque tiene DOS versiones en circulacion, y hay que poder pasar de la
# primera a la segunda sin tocar el resto.
DESPL_VIEJA = '''    // Muevelo, con la MISMA colision que un paso suyo: si no cabe, no se mueve y devuelve false. Es
    // un primitivo de un solo tiro a proposito — quien empuja decide en cuantos pasos y hasta donde,
    // porque de eso depende no tunelar a traves de una pared.
    //
    // En horizontal va por moverRaiz, que reasienta la raiz en el suelo de su nueva columna (o sea:
    // se cae por los bordes, sube los escalones y respeta el cuerpo real de los bloques, igual que
    // andando). En vertical es un LEVANTON: sube por el mismo canal que el brinco de un golpe, asi
    // que la gravedad lo devuelve al suelo — que puede ser el que acaba de aparecer debajo.
    desplazar: function (rig, dx, dy, dz) {
      var r = rigDe(rig);
      if (!r || r.quitado) return false;
      var s = r.partes && r.partes[0] && r.partes[0].s, g = s && s._sig;
      if (!s || !g) return false;
      dx = num(dx, 0); dy = num(dy, 0); dz = num(dz, 0);
      var ok = true;
      if (dx || dz) ok = moverRaiz(s, r.cuerpo, g, dx, dz, r.fis ? r.fis.caida : 0);
      if (ok && dy) nuevoMov(r).alto += dy;
      return ok;
    },'''

DESPL_NUEVA = '''    // Muevelo TAL CUAL, con la colision de siempre: si no cabe, no se mueve y devuelve false. Es un
    // primitivo de un solo tiro a proposito — quien empuja decide en cuantos pasos y hasta donde,
    // porque de eso depende no tunelar a traves de una pared.
    //
    // Traslada la raiz, y nada mas: NO la reasienta en el suelo. Reasentarla es lo que hace un PASO
    // suyo (moverRaiz -> asentar), y asentar sube un bloque entero para salvar escalones. Con eso,
    // empujar a un agente contra la cabeza recien salida de un piston lo montaba ENCIMA en vez de
    // apartarlo: exactamente el desenlace del BUG-RS9 con el jugador, y por el mismo motivo.
    // Un empujon no es un paso: no trepa.
    // Volver a pisar suelo ya es cosa de su gravedad, en el frame siguiente.
    //
    // La colision se sondea a la altura REAL del cuerpo (sumando rig.mov.alto, igual que enCaja),
    // pero lo que se escribe es el desplazamiento de la RAIZ: como la altura efectiva es raiz + alto,
    // mover la raiz un tanto mueve el cuerpo ese mismo tanto.
    desplazar: function (rig, dx, dy, dz) {
      var r = rigDe(rig);
      if (!r || r.quitado) return false;
      var s = r.partes && r.partes[0] && r.partes[0].s, g = s && s._sig, a = r.cuerpo;
      if (!s || !g || !a) return false;
      var nx = g.x + num(dx, 0), ny = g.y + num(dy, 0), nz = g.z + num(dz, 0);
      var alto = r.mov ? r.mov.alto : 0;
      if (chocaMundo(s, a, nx, ny + alto, nz)) return false;
      if (solapaJugador(a, nx, ny + alto, nz)) return false;
      g.x = nx; g.y = ny; g.z = nz;
      return true;
    },'''

API_VIEJA = '''    // Para DIBUJAR un agente fuera del Mundo (el panel del editor). Ver el comentario de preparar().
    preparar: prepararEsqueleto,'''

API_NUEVA = '''    // Quien tiene el cuerpo METIDO en esa caja del mundo. Lo pide el redstone: un piston tiene que
    // saber a quien esta a punto de aplastar ANTES de escribir la cabeza, y la caja de un agente no
    // se puede calcular desde fuera (es rig.cuerpo desplazado por la raiz, mas lo que este levantado
    // del suelo por rig.mov). Devuelve handles, no copias: lo que se saca de aqui se le pasa tal cual
    // a desplazar().
    enCaja: function (x0, y0, z0, x1, y1, z1) {
      var dentro = [];
      esqueletos.forEach(function (r) {
        if (!r || r.quitado) return;
        var s = r.partes && r.partes[0] && r.partes[0].s, g = s && s._sig, a = r.cuerpo;
        if (!g || !a) return;                       // todavia estampandose: aun no tiene cuerpo
        var alto = r.mov ? r.mov.alto : 0;
        if (a[0] + g.x >= x1 || a[3] + g.x <= x0) return;
        if (a[1] + g.y + alto >= y1 || a[4] + g.y + alto <= y0) return;
        if (a[2] + g.z >= z1 || a[5] + g.z <= z0) return;
        dentro.push(r);
      });
      return dentro;
    },
''' + DESPL_NUEVA + '''
''' + API_VIEJA

# ── 2. la cabecera, que es el indice de la API ─────────────────────────────────────────────────
CAB_VIEJA = '''//   game.esqueletos.empujar(id)   ← el GOLPE: sale despedido hacia atras y pega un brinco.
//                                 El clic izquierdo sobre el bicho ya hace esto; no se rompe.'''

CAB_NUEVA = '''//   game.esqueletos.empujar(id)   ← el GOLPE: sale despedido hacia atras y pega un brinco.
//                                 El clic izquierdo sobre el bicho ya hace esto; no se rompe.
//   game.esqueletos.enCaja(x0,y0,z0, x1,y1,z1)  ← quien tiene el cuerpo dentro de esa caja
//   game.esqueletos.desplazar(rig, dx,dy,dz)    ← traslada el cuerpo; false si no cabe. NO trepa
//                                 Las usa el PISTON para apartar a quien tiene delante. La libreria
//                                 pone la capacidad; que hacer con ella lo decide cada material.'''


def guardar(doc):
    """Guardado atomico, como todo lo que escribe en data/."""
    d = os.path.dirname(RUTA)
    fd, tmp = tempfile.mkstemp(dir=d, suffix='.tmp')
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
    os.replace(tmp, RUTA)


def main():
    with open(RUTA, encoding='utf-8') as f:
        doc = json.load(f)
    code = doc['code']

    if MARCA_RIGIDO in code:
        print('ya estaba parcheado: no se toca nada')
        return 0

    # Snippet con la PRIMERA version puesta: solo hay que subir `desplazar`, no volver a inyectarlo todo.
    if MARCA in code:
        if DESPL_VIEJA not in code:
            print('ABORTA: enCaja() ya esta, pero desplazar() no es ninguna de las dos versiones que'
                  ' conozco (¿lo editó el dueño?). No se toca el snippet.', file=sys.stderr)
            return 1
        doc['code'] = code.replace(DESPL_VIEJA, DESPL_NUEVA, 1)
        guardar(doc)
        print('actualizado: desplazar() ya no reasienta en el suelo (un empujón no trepa)')
        return 0

    pares = [('la API de esqueletos', API_VIEJA, API_NUEVA),
             ('la cabecera', CAB_VIEJA, CAB_NUEVA)]
    faltan = [n for n, v, _ in pares if v not in code]
    if faltan:
        print('ABORTA: no encuentro el texto original de ' + ', '.join(faltan)
              + ' (¿lo editó el dueño?). No se toca el snippet.', file=sys.stderr)
        return 1

    for _, viejo, nuevo in pares:
        code = code.replace(viejo, nuevo, 1)
    doc['code'] = code
    guardar(doc)
    print('parcheado: game.esqueletos.enCaja() + .desplazar()')
    return 0


if __name__ == '__main__':
    sys.exit(main())
