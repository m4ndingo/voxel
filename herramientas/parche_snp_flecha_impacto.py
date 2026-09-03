#!/usr/bin/env python3
# @area: snippets
#
# REQ-IMPACTO1 · la flecha deja de saber de bloques y pasa a usar `game.bloques.impacto()`.
#
# EL PORQUE (el dueño, 2026-09-03): «quiero que la flecha de la ballesta al impactar en un objeto
# pueda romper tambien objetos […] ademas para romper quiero poder indicar si sera necesario 1
# impacto o mas», y despues, explicitamente: «tambien estructuras».
#
# LO QUE HABIA: la flecha llamaba a `game.bloques.avisoDeRotura(celda)` y, si esa CELDA tenia
# `alRomper`, la borraba. Tres limitaciones, todas aqui dentro:
#   1. un solo evento, cableado a fuego en el proyectil;
#   2. siempre de un golpe;
#   3. solo contra `mc.grid` — las ESTRUCTURAS FINAS (una ballesta en el suelo, una flor, un cable)
#      las atravesaba sin enterarse, que es justo lo que el dueño pidio que dejara de pasar.
#
# EL REPARTO NUEVO: el proyectil solo dice DONDE ha pasado y DONDE ha chocado. Que hay ahi, cuantos
# golpes lleva y que evento toca lo decide `mundo-autoarranque` (parche_snp_alimpactar.py). Asi el
# siguiente proyectil —una piedra, una bala— hereda el sistema entero sin escribir una linea.
#
# ⛔ SONDEAR NO ES CHOCAR, y de ahi salen las dos APIs: la flecha avanza a subpasos de 0,2 bloques,
# o sea que pregunta 3-4 veces por frame. Sondea con `impactoEn()` (puro) en cada subpaso y despacha
# con `impacto()` UNA sola vez, en el punto donde de verdad choco. Si sondear contase, una sola
# flecha se gastaria ella sola los 3 impactos de un cristal.
#
# ⛔ COMPATIBILIDAD: `avisoDeRotura` se queda como camino de respaldo. Un bloque que hoy tiene
# `alRomper` y ningun `alImpactar` se sigue rompiendo de un flechazo, exactamente como hasta ahora.
# `alImpactar` manda cuando esta declarado, porque es la declaracion explicita.
#
# ⛔ Idempotente y POR ANCLA. Publica por `POST /api/snippets`.
#
#     python3 herramientas/parche_snp_flecha_impacto.py --comprobar
#     python3 herramientas/parche_snp_flecha_impacto.py
import argparse
import json
import sys
import urllib.request

SITIO = 'http://127.0.0.1:8500'
SNIP = 'flecha-arco'

# ── A · una variable mas: contra que pieza fina se ha chocado ────────────────────────────────────
A_VIEJO = """        let hitCell = null;
        let hitEsqueleto = null;"""
A_NUEVO = """        let hitCell = null;
        let hitPieza = null;            // REQ-IMPACTO1 · la estructura fina tocada (no tiene celda)
        let hitEsqueleto = null;"""

# ── B · sondear estructuras finas ANTES que la rejilla ───────────────────────────────────────────
# El orden es el mismo que en `localizarImpacto` y por el mismo motivo: una pieza fina esta DENTRO
# de la celda de aire que la contiene. Si se mira la rejilla primero, la celda es aire, la flecha
# sigue volando y la pieza no se toca jamas.
B_VIEJO = """          // 3. Colisión contra bloques del terreno
          const bx = Math.floor(testX), by = Math.floor(testY), bz = Math.floor(testZ);"""
B_NUEVO = """          // 2.5 REQ-IMPACTO1 · Estructuras finas que declaran `alImpactar`.
          // ⛔ ANTES que la rejilla: la pieza fina vive DENTRO de una celda de AIRE, asi que si se
          // mira la rejilla primero la flecha la atraviesa y no se entera. Es sondeo PURO: no
          // cuenta el golpe ni rompe nada — eso se hace una sola vez, mas abajo, al chocar.
          // Solo frenan las que lo declaran: una flor sin `alImpactar` se sigue atravesando, que es
          // el comportamiento de siempre y no se cambia por la espalda.
          if (typeof game !== 'undefined' && game.bloques
              && typeof game.bloques.impactoEn === 'function') {
            const pieza = game.bloques.impactoEn(testX, testY, testZ);
            if (pieza && pieza.tipo === 'estructura') {
              choco = true;
              hitX = testX; hitY = testY; hitZ = testZ;
              hitPieza = pieza;
              break;
            }
          }

          // 3. Colisión contra bloques del terreno
          const bx = Math.floor(testX), by = Math.floor(testY), bz = Math.floor(testZ);"""

# ── C · el impacto: primero alImpactar, y avisoDeRotura como respaldo ────────────────────────────
C_VIEJO = """          } else if (hitCell) {
            // Impacto sobre bloque del terreno
            if (chispas) chispas.salpica([hitX, hitY, hitZ], 14);

            let avisaRotura = null;
            if (typeof game !== 'undefined' && game.bloques && typeof game.bloques.avisoDeRotura === 'function') {
              avisaRotura = game.bloques.avisoDeRotura(hitCell[0], hitCell[1], hitCell[2]);
            }

            if (avisaRotura) {
              if (typeof setVoxel === 'function') setVoxel(hitCell[0], hitCell[1], hitCell[2], 0);
              avisaRotura();
              flechas.splice(i, 1);
              continue;
            } else {"""
C_NUEVO = """          } else if (hitCell || hitPieza) {
            // Impacto sobre el mundo: celda de la rejilla o pieza fina
            if (chispas) chispas.salpica([hitX, hitY, hitZ], 14);

            // REQ-IMPACTO1 · EL DESPACHO, UNA SOLA VEZ. Aqui es donde se cuenta el golpe: los
            // subpasos de arriba solo sondean. `impacto()` decide que pasa (romper / coger / js) y
            // cuantos golpes hacen falta; la flecha no lo sabe ni tiene por que.
            let golpe = null;
            if (typeof game !== 'undefined' && game.bloques
                && typeof game.bloques.impacto === 'function') {
              golpe = game.bloques.impacto(hitX, hitY, hitZ,
                { fuente: 'flecha', dir: [f.dirX, f.dirY, f.dirZ] });
            }
            if (golpe) {
              // Si aun le quedan golpes, la pieza sigue puesta y la flecha se clava en ella: es lo
              // que da la sensacion de «cristal a medio romper». Si ya se desencadeno, la flecha
              // desaparece con lo que haya roto.
              if (golpe.listo) { flechas.splice(i, 1); continue; }
              f.x = hitX; f.y = hitY; f.z = hitZ;
              f.vx = 0; f.vy = 0; f.vz = 0;
              f.clavada = true;
              f.tiempoClavada = 0;
              f.estela = [];
              continue;
            }

            // RESPALDO (compatibilidad): un bloque con `alRomper` y sin `alImpactar` se sigue
            // rompiendo de un flechazo, igual que antes de que existiera nada de esto.
            let avisaRotura = null;
            if (hitCell && typeof game !== 'undefined' && game.bloques && typeof game.bloques.avisoDeRotura === 'function') {
              avisaRotura = game.bloques.avisoDeRotura(hitCell[0], hitCell[1], hitCell[2]);
            }

            if (avisaRotura) {
              if (typeof setVoxel === 'function') setVoxel(hitCell[0], hitCell[1], hitCell[2], 0);
              avisaRotura();
              flechas.splice(i, 1);
              continue;
            } else {"""

CAMBIOS = [
    ('A · variable hitPieza', A_VIEJO, A_NUEVO),
    ('B · sondeo de estructuras finas, antes que la rejilla', B_VIEJO, B_NUEVO),
    ('C · despacho por game.bloques.impacto(), con respaldo', C_VIEJO, C_NUEVO),
]


def pide(url, cuerpo=None):
    pet = urllib.request.Request(url, data=cuerpo, method='POST' if cuerpo else 'GET',
                                 headers={'Content-Type': 'application/json'} if cuerpo else {})
    with urllib.request.urlopen(pet, timeout=20) as r:
        return json.loads(r.read().decode('utf-8') or '{}')


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--comprobar', action='store_true')
    p.add_argument('--sitio', default=SITIO)
    a = p.parse_args()

    snip = pide('%s/api/snippets/%s' % (a.sitio, SNIP))
    code = snip.get('code') or ''
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
            print('⛔ el ancla de «%s» aparece %d veces (esperaba 1).\n'
                  '   el snippet ha cambiado debajo: no lo toco.' % (que, n))
            return 2
        nuevo = nuevo.replace(viejo, bueno)
        hechos.append(que)

    for q in ya:
        print('  ya estaba · %s' % q)
    for q in hechos:
        print('  cambio    · %s' % q)
    if not hechos:
        print('nada que hacer: «%s» ya esta parcheado.' % SNIP)
        return 0
    if a.comprobar:
        print('\n--comprobar: no se publica nada.')
        return 0

    pide('%s/api/snippets' % a.sitio,
         json.dumps({'id': SNIP, 'name': snip.get('name') or SNIP, 'code': nuevo}).encode('utf-8'))
    print('\n✓ «%s» publicado (%d → %d chars).' % (SNIP, len(code), len(nuevo)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
