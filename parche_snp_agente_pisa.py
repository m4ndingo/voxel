#!/usr/bin/env python3
# BUG-AG1 (mitad de las placas) · «los agentes articulados ... tampoco pueden presionar placas de
# redstone».
#
# Eran DOS cosas, y las dos aqui:
#
#   1. `placas` venia apagada por defecto, con este aviso:
#
#          ⚠️ `alPisar` NO se dispara, y a proposito: el alPisar que hay escrito esta pensado para
#             el jugador (hace game.tp), asi que un zombie pisando una placa te teletransportaria
#             A TI. Se enciende con fisica:{placas:true} a sabiendas de que el alPisar sepa quien pisa.
#
#      La premisa CADUCO: el alPisar de hab:placa ya no teletransporta a nadie, hace
#      `game.redstone.encender(c.x, c.y, c.z, true)` (redstone/redstone-piezas.js). Y la condicion
#      que el propio aviso ponia —«a sabiendas de que el alPisar sepa quien pisa»— es justo lo que
#      este parche cumple: el payload lleva ahora `quien` ('jugador' | 'agente') y `agente`. Asi que
#      la valvula se invierte: encendida por defecto, y `fisica:{placas:false}` la apaga.
#
#   2. Y aunque se encendiera, no se disparaba igual: sueloDe() mira medio voxel fino POR DEBAJO de
#      la caja del bicho, o sea lo que le SOSTIENE. Una placa de presion no es eso — es un bloque
#      atravesable DENTRO del cual te quedas de pie. El jugador ya lo tiene resuelto con las dos
#      preguntas (pieEn + pieDentro, «la placa es el bloque que OCUPAS, no el que te sostiene»); el
#      agente solo tenia la primera, asi que veia la losa de debajo y la placa no saltaba nunca.
#
# El parche NO toca app.js: es todo del snippet, que es donde vive el comportamiento por MATERIAL.
#
# El dueño edita este snippet EN VIVO, asi que el parche es IDEMPOTENTE: si ya esta puesto, no toca
# nada y lo dice. Solo cambia `code`; el resto del documento se reescribe tal cual.
import json, sys, os, tempfile

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data/snippets/mundo-autoarranque.json')

MARCA = 'function pisadaAgente('

# ── 1. las dos preguntas del pie, con el mismo flanco ──────────────────────────────────────────
SUELO_VIEJO = '''  // Que material pisa el agente: medio voxel fino BAJO su caja, en el centro de la huella. Es
  // pieEn() con la caja del bicho en vez de la del jugador, y con la misma identidad de FLANCO
  // (celda + clave), que es lo que evita que quedarse encima de un trampolin sea un motor infinito.
  function sueloDe(a, g) {
    var x = (a[0] + a[3]) * 0.5 + g.x, y = a[1] + g.y - EPS_PIE, z = (a[2] + a[5]) * 0.5 + g.z;
    var m = (typeof mc !== 'undefined' && mc.grid) ? materialEn(x, y, z) : null;
    return { cfg: m ? m.cfg : null,
             id: Math.floor(x) + ',' + Math.floor(y) + ',' + Math.floor(z) + '|' + (m ? m.clave : '') };
  }'''

SUELO_NUEVO = '''  // Que material toca el agente medio voxel fino por debajo de su caja (lado -1: lo que le SOSTIENE)
  // o por encima de su planta (lado +1: la celda que OCUPA), en el centro de la huella. Son las dos
  // preguntas de pieEn() y pieDentro() con la caja del bicho en vez de la del jugador, y con la
  // misma identidad de FLANCO (celda + clave), que es lo que evita que quedarse encima de un
  // trampolin sea un motor infinito.
  function tocaPie(a, g, lado) {
    var x = (a[0] + a[3]) * 0.5 + g.x, y = a[1] + g.y + lado * EPS_PIE, z = (a[2] + a[5]) * 0.5 + g.z;
    var m = (typeof mc !== 'undefined' && mc.grid) ? materialEn(x, y, z) : null;
    var celda = Math.floor(x) + ',' + Math.floor(y) + ',' + Math.floor(z);
    return { cfg: m ? m.cfg : null, clave: m ? m.clave : '', celda: celda,
             id: celda + '|' + (m ? m.clave : ''), pos: [x, a[1] + g.y, z] };
  }
  function sueloDe(a, g) { return tocaPie(a, g, -1); }    // lo que le SOSTIENE (hielo, barro, trampolin)
  // ...y la celda donde tiene METIDOS los pies, que NO es la misma pregunta. Una placa de presion no
  // es el suelo que pisa: es un bloque ATRAVESABLE dentro del cual se queda de pie, asi que mirando
  // solo «bajo los pies» se ve la losa de debajo y la placa no se dispara jamas — que es «los
  // agentes tampoco pueden presionar placas de redstone». Es la misma regla de Minecraft que ya
  // aplica pieDentro() para el jugador: la placa es el bloque que OCUPAS, no el que te sostiene.
  function dentroDe(a, g) { return tocaPie(a, g, 1); }
  // El `alPisar` del material, disparado por el agente y con el flanco por celda+clave: quedarse
  // encima no lo repisa, salir y volver si. Se leen las DOS preguntas, igual que hace pisar() con el
  // jugador, y se salta la de dentro cuando cae en la misma celda que la de abajo (a media caida
  // coinciden, y ahi una pisada contaria dos).
  function pisadaAgente(rig, g) {
    var a = rig.cuerpo, abajo = sueloDe(a, g), dentro = dentroDe(a, g);
    dispararPisada(rig, 'pisoAbajo', abajo);
    dispararPisada(rig, 'pisoDentro', (abajo && dentro && dentro.celda === abajo.celda) ? null : dentro);
  }
  function dispararPisada(rig, ranura, donde) {
    var id = donde ? donde.id : null;
    if (rig[ranura] === id) return;                       // nada ha cambiado bajo (o dentro de) sus pies
    rig[ranura] = id;
    var cfg = donde && donde.cfg;
    if (!cfg || !cfg.alPisar) return;
    if (!rig.pisadas) rig.pisadas = {};
    rig.pisadas[id] = (rig.pisadas[id] || 0) + 1;
    var c = donde.celda.split(',');
    // `quien` es la parte que faltaba para poder encender esto por defecto: un alPisar escrito para
    // el jugador (el ejemplo de la cabecera hace game.tp) puede ahora mirarlo y no llevarse por
    // delante a quien no ha pisado nada. El del jugador lo lleva tambien, con 'jugador'.
    try {
      cfg.alPisar({ x: +c[0], y: +c[1], z: +c[2], clave: donde.clave, cfg: cfg,
                    veces: rig.pisadas[id], pos: donde.pos,
                    quien: 'agente', agente: { id: rig.id, nombre: rig.nombre } });
    } catch (e) {
      avisar('el alPisar de ' + donde.clave + ' lanzó: ' + (e && e.message ? e.message : e));
    }
  }'''

# ── 2. la valvula se invierte: encendida por defecto ───────────────────────────────────────────
AVISO_VIEJO = '''  // ⚠️ `alPisar` NO se dispara, y a proposito: el alPisar que hay escrito esta pensado para el
  // jugador (hace game.tp), asi que un zombie pisando una placa te teletransportaria A TI. Se
  // enciende con fisica:{placas:true} a sabiendas de que el alPisar sepa quien pisa.'''

AVISO_NUEVO = '''  // `alPisar` SI se dispara (v1.30). Estuvo apagado mientras el payload no decia quien pisaba: un
  // alPisar escrito para el jugador —el ejemplo de la cabecera hace game.tp— te habria
  // teletransportado A TI porque pasara un zombie por encima. Ahora el payload lleva `quien`
  // ('jugador' | 'agente') y `agente:{id,nombre}`, que era la condicion que ponia el propio aviso,
  // asi que se enciende por defecto: una placa de presion que solo notas tu no es una placa. Se
  // apaga por bicho con fisica:{placas:false}.'''

PLACAS_VIEJO = "      placas: !!f.placas,                     // alPisar: apagado a proposito (ver arriba)"
PLACAS_NUEVO = "      placas: f.placas !== false,             // alPisar: encendido; el payload dice quien pisa"

# ── 3. y se dispara en el sitio del frame en que ya esta donde acaba ───────────────────────────
PASO_VIEJO = '''      if (rig.fis) fisicaPaso(rig, sr, g, dt, pie, gx0, gz0);
      if (rig.mov) g.y += movPaso(rig, sr, g, dt);'''

PASO_NUEVO = '''      if (rig.fis) fisicaPaso(rig, sr, g, dt, pie, gx0, gz0);
      if (rig.mov) g.y += movPaso(rig, sr, g, dt);

      // 2.c Lo que PISA, ya en su sitio final del frame. Va aqui y no con `pie` (que se leyo antes
      //     de andar) porque lo que dispara un alPisar es ENTRAR en la celda, y antes de andar
      //     todavia no ha entrado.
      if (rig.fis && rig.fis.placas) pisadaAgente(rig, g);'''

# ── 4. y el jugador tambien dice que es el jugador ─────────────────────────────────────────────
JUGADOR_VIEJO = '''      cfg.alPisar({ x: +c[0], y: +c[1], z: +c[2], clave: ahora.m.clave, cfg: cfg,
                    veces: pisadas[ahora.id], pos: mc.pos });'''

JUGADOR_NUEVO = '''      cfg.alPisar({ x: +c[0], y: +c[1], z: +c[2], clave: ahora.m.clave, cfg: cfg,
                    veces: pisadas[ahora.id], pos: mc.pos, quien: 'jugador', agente: null });'''

# ── 5. la cabecera, que es lo que se lee antes de escribir un alPisar ──────────────────────────
CAB_VIEJA = "//   game.bloques.define('hab:placa',    { alPisar(c){ game.tp(51,20,50); } });"
CAB_NUEVA = ("//   game.bloques.define('hab:placa',    { alPisar(c){ if (c.quien === 'jugador') game.tp(51,20,50); } });\n"
             "//                                 ↑ los agentes articulados TAMBIEN pisan: `c.quien` es\n"
             "//                                   'jugador' o 'agente' (y c.agente = {id,nombre})")

OPC_VIEJA = "  //             alPisar(c) (se dispara UNA vez al entrar en la celda)  ·  nota (texto para lista())"
OPC_NUEVA = ("  //             alPisar(c) (UNA vez al entrar en la celda; c.quien = 'jugador' | 'agente')\n"
             "  //             nota (texto para lista())")


def main():
    with open(RUTA, encoding='utf-8') as f:
        doc = json.load(f)
    code = doc['code']

    if MARCA in code:
        print('ya estaba parcheado: no se toca nada')
        return 0

    pares = [('sueloDe', SUELO_VIEJO, SUELO_NUEVO),
             ('el aviso de placas', AVISO_VIEJO, AVISO_NUEVO),
             ('normalizarFisica.placas', PLACAS_VIEJO, PLACAS_NUEVO),
             ('el paso del agente', PASO_VIEJO, PASO_NUEVO),
             ('el alPisar del jugador', JUGADOR_VIEJO, JUGADOR_NUEVO),
             ('la cabecera', CAB_VIEJA, CAB_NUEVA),
             ('la lista de opciones', OPC_VIEJA, OPC_NUEVA)]
    faltan = [n for n, v, _ in pares if v not in code]
    if faltan:
        print('ABORTA: no encuentro el texto original de ' + ', '.join(faltan)
              + ' (¿lo editó el dueño?). No se toca el snippet.', file=sys.stderr)
        return 1

    for _, viejo, nuevo in pares:
        code = code.replace(viejo, nuevo, 1)
    doc['code'] = code

    # Guardado atomico, como todo lo que escribe en data/.
    d = os.path.dirname(RUTA)
    fd, tmp = tempfile.mkstemp(dir=d, suffix='.tmp')
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
    os.replace(tmp, RUTA)
    print('parcheado: dentroDe + pisadaAgente, placas encendidas por defecto y `quien` en el payload')
    return 0


if __name__ == '__main__':
    sys.exit(main())
