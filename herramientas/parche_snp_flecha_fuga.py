#!/usr/bin/env python3
# @area: snippets
#
# PERF-FLECHA1 · la flecha que se escapa del mundo no moria nunca, y hundia los fps a 3.
#
# EL SINTOMA (el dueño, 2026-09-03): «investigar la caida de fps en el mapa default […] cuando
# empece el mapa a jugar iba bien hasta que llego a cierto punto […] al rato es cuando caen los
# fps». De 140 fps a 3,4.
#
# LO QUE COSTO ENCONTRARLO, porque no volvera a costar si se lee esto: `game.perfDump()` NO PODIA
# VERLO. Solo envuelve funciones del motor, y esto vive en un bucle rAF del propio snippet, fuera
# de `mcTick`. El reparto medido era: frame 236 ms, `mcTick` 1,9 ms, RESTO 234 ms (99,2 %). Ni el
# dibujado (44 draws, 154 k vertices/frame) ni la GPU tenian nada que ver, y por eso `renderDist`,
# `renderScale`, `shadowSize` y `renderMode='fast'` no movian la aguja. Lo que lo caza en 5
# segundos es envolver `requestAnimationFrame` y sacar el % de reloj POR NOMBRE de callback:
#
#     rAF · bucleFlechas   250,8 ms/llamada   97,7 % del reloj
#     rAF · mcTick           2,0 ms/llamada    0,8 %
#
# LA CAUSA RAIZ, una sola linea de mas: la colision contra el terreno solo se mira si
# `mcInside(bx,by,bz)` (dentro del mundo). Una flecha que sale del mapa no choca NUNCA, no se clava
# NUNCA, y los cuatro `flechas.splice()` del bucle son todos por impacto — o por `vidaMax`, que
# solo corria ESTANDO YA CLAVADA. Resultado: vive para siempre.
#
# ⚠️ Y ADEMAS SE REALIMENTA, que es lo que lo convierte en precipicio en vez de en pendiente: la
# gravedad la acelera sin freno (`f.vy -= f.grav * dt`), y `subPasos` se calcula DIVIDIENDO la
# distancia recorrida entre 0,2. Mas velocidad ⇒ mas subpasos ⇒ mas coste, sin techo. Medido con
# solo SIETE flechas fugadas: 3.109 subpasos/frame, cada uno con dos sondeos caros
# (`game.bloques.impactoEn` a 68 µs la llamada = 212 ms, y `game.esqueletos.enPunto` = 61 ms).
#
# LOS TRES CAMBIOS, y por que hacen falta los tres:
#   A · la vida corre SIEMPRE, no solo clavada — red de seguridad para cualquier otra fuga futura.
#   B · retirar la flecha cuando ya es irrecuperable — LA CAUSA RAIZ.
#   C · topar `subPasos` — corta la realimentacion aunque algo se vuelva a escapar. No es un apaño
#       que tape B: es el techo que impide que un fallo cualquiera vuelva a clavar el frame.
#
# VALIDADO ANTES EN CALIENTE (ley de oro): envolviendo `game.bloques.impactoEn` para que devolviera
# pieza fuera del mundo, el propio snippet clavaba la flecha y la mataba por `vidaMax`. Resultado
# 3,4 fps → 101,4 fps, y `cortes: 3` con `ultima: [259, -8, 106]` — cayendo por debajo del mundo,
# exactamente la fuga que arregla el cambio B.
#
# POR ANCLA, idempotente. Republica por `POST /api/snippets` (hay 2 copias vivas).
#
#   python3 herramientas/parche_snp_flecha_fuga.py --comprobar
#   python3 herramientas/parche_snp_flecha_fuga.py
import argparse
import json
import os
import sys
import urllib.request

SITIO = 'http://127.0.0.1:8500'
SNIP = 'flecha-arco'
# Con VOXELFORGE_PUBLICO=1 el servidor exige la llave para escribir. Se pasa por el entorno, nunca
# en el fichero:  set -a && . /root/voxelforge.env && set +a
TOKEN = (os.environ.get('VOXELFORGE_TOKEN') or '').strip()

# ── A · los topes, junto a P_VOX ────────────────────────────────────────────────────────────────
A_VIEJO = """  const P_VOX = 16; // 16 voxeles finos por bloque de mundo
  const flechas = [];"""
A_NUEVO = """  const P_VOX = 16; // 16 voxeles finos por bloque de mundo

  // PERF-FLECHA1 · los tres topes que impiden que una flecha perdida hunda los fps.
  const FLECHA_Y_MIN = -8;        // por debajo del mundo la gravedad solo la aleja mas: no vuelve
  const FLECHA_MARGEN = 256;      // fuera de esto en horizontal tampoco puede volver
  const FLECHA_SUBPASOS_MAX = 64; // 12,8 bloques por frame: mas que cualquier flecha real

  const flechas = [];"""

# ── B · la vida corre siempre + retirada de la fugada ───────────────────────────────────────────
# El `} else {` se convierte en `if (!f.clavada) {`: mismo numero de llaves, misma estructura.
# `f.tiempoClavada` se pone a 0 al clavarse (lineas del despacho de impacto), asi que una flecha
# que SI acierta sigue luciendo sus 5 s enteros despues del impacto. Lo unico que cambia es que
# ahora tambien caduca EN VUELO.
B_VIEJO = """      if (f.clavada) {
        f.tiempoClavada += dt;
        if (f.tiempoClavada >= f.vidaMax) {
          flechas.splice(i, 1);
          continue;
        }
      } else {
        f.vy -= f.grav * dt;"""
B_NUEVO = """      // PERF-FLECHA1 · LA VIDA CORRE SIEMPRE, clavada o en vuelo. Antes el contador solo
      // avanzaba estando clavada, asi que una flecha que no chocaba con nada era inmortal.
      // Al clavarse se reinicia a 0 mas abajo, o sea que el impacto sigue luciendo sus 5 s.
      f.tiempoClavada += dt;
      if (f.tiempoClavada >= f.vidaMax) {
        flechas.splice(i, 1);
        continue;
      }

      if (!f.clavada) {
        // PERF-FLECHA1 · FUERA DEL MUNDO NO SE VUELVE. La colision contra el terreno solo se
        // mira si `mcInside()`, asi que ahi fuera no choca jamas, no se clava jamas y nadie la
        // retiraba: la gravedad la aceleraba sin freno y `subPasos` crece con la velocidad.
        // ⛔ NO es una comprobacion de adorno: siete flechas fugadas median 3.109 sondeos por
        // frame y dejaban el juego en 3,4 fps.
        if (f.y < FLECHA_Y_MIN
            || f.x < -FLECHA_MARGEN || f.x > mc.dim.x + FLECHA_MARGEN
            || f.z < -FLECHA_MARGEN || f.z > mc.dim.z + FLECHA_MARGEN) {
          flechas.splice(i, 1);
          continue;
        }
        f.vy -= f.grav * dt;"""

# ── C · el techo de subpasos, con aviso ─────────────────────────────────────────────────────────
C_VIEJO = """        const subPasos = Math.max(1, Math.ceil(distPaso / 0.20));"""
C_NUEVO = """        // PERF-FLECHA1 · TECHO DURO. Cada subpaso cuesta dos sondeos caros (`impactoEn` +
        // `enPunto`), y sin tope el coste crece con la velocidad sin limite. El aviso salta UNA
        // vez: si aparece, hay flechas que no estan muriendo y el arreglo va en su ciclo de vida,
        // no aqui — este tope solo evita que el navegador se quede clavado mientras se averigua.
        const subPasos = Math.min(FLECHA_SUBPASOS_MAX,
                                  Math.max(1, Math.ceil(distPaso / 0.20)));
        if (subPasos >= FLECHA_SUBPASOS_MAX && !bucleFlechas._avisoTope) {
          bucleFlechas._avisoTope = true;
          console.warn('[flecha] PERF-FLECHA1 · subPasos topado en ' + FLECHA_SUBPASOS_MAX +
            ' (velocidad ' + Math.hypot(f.vx, f.vy, f.vz).toFixed(0) + ' bloques/s, ' +
            flechas.length + ' flechas vivas). Hay flechas que no mueren.');
        }"""

CAMBIOS = [
    ('A · topes FLECHA_Y_MIN / FLECHA_MARGEN / FLECHA_SUBPASOS_MAX', A_VIEJO, A_NUEVO),
    ('B · vida en vuelo + retirada de la flecha fugada (causa raiz)', B_VIEJO, B_NUEVO),
    ('C · techo de subPasos, con aviso por consola', C_VIEJO, C_NUEVO),
]


def pide(url, cuerpo=None):
    cab = {'Content-Type': 'application/json'} if cuerpo else {}
    if TOKEN:
        cab['X-VoxelForge-Token'] = TOKEN
    pet = urllib.request.Request(url, data=cuerpo, method='POST' if cuerpo else 'GET',
                                 headers=cab)
    with urllib.request.urlopen(pet, timeout=20) as r:
        return json.loads(r.read().decode('utf-8') or '{}')


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--comprobar', action='store_true')
    p.add_argument('--sitio', default=SITIO)
    a = p.parse_args()

    snip = pide('%s/api/snippets/%s' % (a.sitio, SNIP))
    code = snip.get('code')
    if not code:
        print('⛔ «%s» no tiene codigo (¿servidor levantado?)' % SNIP)
        return 1

    nuevo, hechos, ya = code, [], []
    for que, viejo, bueno in CAMBIOS:
        if bueno in nuevo:
            ya.append(que)
            continue
        n = nuevo.count(viejo)
        if n != 1:
            print('⛔ ancla «%s»: %d coincidencias (esperaba 1).\n'
                  '   El snippet ha cambiado; revisa el ancla antes de tocar nada.' % (que, n))
            return 2
        nuevo = nuevo.replace(viejo, bueno)
        hechos.append(que)

    for q in ya:
        print('· ya estaba: %s' % q)
    for q in hechos:
        print('✔ aplicado : %s' % q)

    if not hechos:
        print('\nNada que hacer: «%s» ya esta parcheado.' % SNIP)
        return 0
    if a.comprobar:
        print('\n--comprobar: NO se ha publicado nada.')
        return 0

    pide('%s/api/snippets' % a.sitio,
         json.dumps({'id': SNIP, 'name': snip.get('name') or SNIP, 'code': nuevo}).encode('utf-8'))
    print('\n✅ «%s» publicado con %d cambio(s).' % (SNIP, len(hechos)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
