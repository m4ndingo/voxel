#!/usr/bin/env python3
# BUG-AG3 · «si se crea un agente articulado sin la capacidad "te persigue" no se renderiza
# correctamente, ademas se quedan las piezas sueltas, no es empujable, no te mira, etc. parece roto».
#
# Medido en navegador (sondas de /map/test, con `seguir:false` sobre data/agentes/personaje-1.json):
# la libreria se NIEGA a plantar el agente y llama a `quitarEsqueleto(rig)`... pero de las 7 piezas
# solo desestampa UNA. Las otras 6 se quedan en el mundo, `efimera:true` y `_rig:null`: visibles,
# sin postura, sin raiz y sin nadie que las anime. Es exactamente la captura del ticket.
#
# Son DOS fallos, y se arreglan por separado:
#
# 1. LA FUGA. `quitarEsqueleto` borra por REFERENCIA (`mc.structures.indexOf(s) >= 0`), y durante el
#    estampado salta un `mcRestampAll` (lo dispara la pieza que hace crecer el atlas: en la sonda,
#    'hab:antorcha'). app.js NO reutiliza las instancias en un restampado: las sustituye por otras
#    nuevas. Asi que `parte.s` apunta a objetos que ya no estan en `mc.structures`, `indexOf` da -1 y
#    esas piezas se saltan EN SILENCIO. Solo sobrevive la ultima estampada, que es la unica posterior
#    al restampado. Para eso existe ya `readquirir(rig)` — pero solo lo llamaba `esqueletosPaso`.
#    Esto NO es un fallo de este ticket: cualquier `game.esqueletos.quitar()` posterior a un
#    restampado dejaba piezas huerfanas. Aqui se ve porque el rig se quita a los 0 ms de nacer.
#
# 2. LA NEGATIVA. Un agente sin «te persigue» no tiene por que ser un error: es una estatua que te
#    mira, a la que puedes empujar y que se apoya en el suelo — que es justo lo que pide la
#    verificacion del ticket. Se planta el rig igual, con `G.quieto`, que fuerza el mismo estado que
#    ya existia para «te he perdido de vista»: `g.por = 1` (postura de reposo) y ni un paso. La
#    mirada y el empuje son capacidades APARTE (`mirar` por pieza, `empuje` del documento) y siguen
#    funcionando solas.
#
# Ojo con `asentar()`: solo corre cuando la pieza SE MUEVE (dentro del `if (vd >= 1e-4)` de
# pasoSeguir), asi que un agente que no anda nunca se apoyaria en el suelo y se quedaria flotando
# donde lo plantaste. Por eso el modo quieto lo llama a mano.
#
# El dueño edita este snippet EN VIVO, asi que el parche es IDEMPOTENTE: si ya esta puesto, no toca
# nada y lo dice. Solo cambia `code`; el resto del documento se reescribe tal cual.
import json, sys, os, tempfile

RUTA = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                    'data/snippets/mundo-autoarranque.json')

MARCA = 'BUG-AG3'

# ── 1. La fuga: re-adquirir antes de borrar ──────────────────────────────────────────────────────
FUGA_VIEJO = """  function quitarEsqueleto(rig) {
    if (!rig) return 0;
    var n = 0;
    for (var i = 0; i < rig.partes.length; i++) {"""

FUGA_NUEVO = """  function quitarEsqueleto(rig) {
    if (!rig) return 0;
    // BUG-AG3 · re-adquirir ANTES de borrar. Esto borra por referencia, y mcRestampAll (app.js) no
    // reutiliza las instancias: las SUSTITUYE por otras nuevas. Un rig quitado despues de un
    // restampado tenia sus `parte.s` apuntando a objetos que ya no estan en mc.structures, asi que
    // el `indexOf(s) >= 0` de abajo daba -1 y se saltaba las piezas EN SILENCIO: se quedaban en el
    // mundo, visibles y sin rig, que es la captura del ticket. `readquirir` las vuelve a casar por
    // (clave, celda, rot) — el mismo criterio que usa esqueletosPaso en cada frame.
    if (typeof mc !== 'undefined' && mc.structures) readquirir(rig);
    var n = 0;
    for (var i = 0; i < rig.partes.length; i++) {"""

# ── 2. La negativa: `seguir:false` planta una estatua, no un error ───────────────────────────────
NEG_VIEJO = """      if (def.seguir === false || def.seguir === null) {
        console.warn('game.esqueletos.crear: un agente sin `seguir` se quedaría plantado para siempre '
          + 'y no haría falta ningún rig. Ponle al menos { deteccion, distancia, velocidad }.');
        quitarEsqueleto(rig); return null;
      }
      rig.G = normalizarSeguir(R.s.key, def.seguir === undefined ? true : def.seguir);"""

NEG_NUEVO = """      // BUG-AG3 · apagar «te persigue» NO es un error: es una estatua que te mira. Antes se
      // desestampaba el rig y se devolvia null, y como el desestampado ademas tenia fuga (ver
      // quitarEsqueleto) lo que veia el dueño eran las piezas desparramadas por el suelo.
      //
      // `quieto` no es un modo nuevo de andar: reusa el estado que ya existia para «te he perdido
      // de vista» (g.por = 1), o sea postura de reposo y ni un paso. Mirar y empujar son
      // capacidades APARTE — `mirar` va por pieza y `empuje` por documento — y siguen funcionando.
      var quieto = (def.seguir === false || def.seguir === null);
      rig.G = normalizarSeguir(R.s.key, quieto || def.seguir === undefined ? true : def.seguir);
      if (rig.G) rig.G.quieto = quieto;"""

# ── 3. pasoSeguir: quieto = fuera de alcance para siempre, pero con los pies en el suelo ─────────
PASO_VIEJO = """    if (!hay || (G.deteccion > 0 && d > G.deteccion)) {
      g.por = 1;                                        // fuera del radio: se rinde
      if (G.volver) { mx = ax; my = ay; mz = az; }       // a casa
      else { mx = cx; my = cy; mz = cz; }                // donde este
    } else {"""

PASO_NUEVO = """    // BUG-AG3 · `quieto` (agente sin «te persigue») entra por la misma puerta que «te he perdido de
    // vista», que es la que ya sabe no dar un paso. Ni siquiera vuelve al ancla: no se ha movido de
    // ella. Se queda con g.por = 1, o sea postura de reposo, y la mirada sigue su camino aparte.
    if (G.quieto || !hay || (G.deteccion > 0 && d > G.deteccion)) {
      g.por = 1;                                        // fuera del radio: se rinde
      if (G.volver && !G.quieto) { mx = ax; my = ay; mz = az; }   // a casa
      else { mx = cx; my = cy; mz = cz; }                // donde este
    } else {"""

SUELO_VIEJO = """      if (bloq && g.por === 0) g.por = 3;
    }"""

SUELO_NUEVO = """      if (bloq && g.por === 0) g.por = 3;
    }
    // BUG-AG3 · quieto no es flotando. `asentar()` vive dentro del bloque de arriba, o sea que solo
    // corre cuando la pieza SE MUEVE; un agente que no anda nunca tocaria el suelo y se quedaria
    // colgado en el aire donde lo plantaste. Se llama a mano, con la posicion actual como «de
    // donde venia»: si no hay suelo debajo, deshace y se queda como estaba.
    if (G.quieto && plano) asentar(s, a, g, g.x, g.z, F && F.drop);"""

CAMBIOS = [
    ('la fuga de piezas al quitar el rig', FUGA_VIEJO, FUGA_NUEVO),
    ('plantar el agente sin «te persigue»', NEG_VIEJO, NEG_NUEVO),
    ('no dar un paso estando quieto', PASO_VIEJO, PASO_NUEVO),
    ('apoyar en el suelo al que no anda', SUELO_VIEJO, SUELO_NUEVO),
]


def main():
    with open(RUTA, encoding='utf-8') as f:
        doc = json.load(f)
    code = doc['code']

    if MARCA in code:
        print('ya estaba parcheado: no se toca nada')
        return 0

    # Todo o nada: se comprueban los cuatro anclajes ANTES de tocar una sola letra, para no dejar el
    # snippet del dueño a medio parchear si ha editado alguna de estas funciones.
    for que, viejo, _ in CAMBIOS:
        if code.count(viejo) != 1:
            print('ABORTA: no encuentro (o hay mas de uno) el anclaje de "%s" '
                  '(¿lo editó el dueño?). No se toca el snippet.' % que, file=sys.stderr)
            return 1

    for _, viejo, nuevo in CAMBIOS:
        code = code.replace(viejo, nuevo, 1)
    doc['code'] = code

    # Guardado atomico, como todo lo que escribe en data/.
    d = os.path.dirname(RUTA)
    fd, tmp = tempfile.mkstemp(dir=d, suffix='.tmp')
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
    os.replace(tmp, RUTA)
    print('parcheado: sin «te persigue» se planta una estatua que te mira, y quitar un rig ya no '
          'deja piezas sueltas')
    return 0


if __name__ == '__main__':
    sys.exit(main())
