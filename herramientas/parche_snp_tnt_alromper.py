#!/usr/bin/env python3
# @area: snippets
#
# REQ-TNT1 · el bloque que tiene `alRomper` recibe su evento aunque quien lo borre sea la explosion.
#
# EL PORQUE (el dueño, 2026-08-30): «que cuando borre un bloque la explosion active los comportamientos
# "alRomper" de los bloques que borra» + «que el cambio en tnt sea minimo, simplemente el objeto que
# tiene alRomper tiene que recibir ese evento».
#
# + «que sea lo mas agnostico que se pueda el cambio en explosion-tnt, no tiene porque conocer los
# otros snippets, solamente enviarles el evento alRomper».
#
# EL AGUJERO: el pico ya lo hacia (`mcBreak` → `dispararAlRomper`), pero la explosion NO pasa por el
# pico: borra con `setVoxel(x,y,z,0)` a pelo dentro de un beginBatch/endBatch. La primitiva que faltaba
# la publica `mundo-autoarranque` v1.40 (`herramientas/parche_snp_romper_en_masa.py`):
# `game.bloques.avisoDeRotura(x,y,z)` → una FUNCION ya cargada con lo que hay en esa celda, o null.
#
# AGNOSTICO: aqui no aparece ni una clave, ni un giro, ni el nombre de un material, ni el de otro
# snippet. La explosion solo hace dos cosas: pedir el aviso y darlo. Quien sepa que hacer con el es el
# `game.bloques.define` de cada material, como siempre. Tampoco hay try/catch ni mensajes: eso ya lo
# pone `dispararAlRomper` en `mundo-autoarranque`.
#
# EL ORDEN, que es lo unico que hay que entender aqui:
#   · se PIDE el aviso en el PRECALCULO, con el bloque todavia puesto — en cuanto la onda le pinta
#     fuego encima ya no queda nada que leer;
#   · se DA cuando esa celda ya es AIRE de verdad (un fotograma DESPUES de pintarla de fuego), que es
#     el orden del pico: «se rompe, se abre la sorpresa», y ademas evita que la onda vuelva a pisar lo
#     que la sorpresa acabe de construir.
#
# ⛔ Idempotente y POR ANCLA; ⛔ nunca reescribe el fichero entero. Publica por `POST /api/snippets`.
#
#     python3 herramientas/parche_snp_tnt_alromper.py --comprobar
#     python3 herramientas/parche_snp_tnt_alromper.py
import argparse
import json
import sys
import urllib.request

SITIO = 'http://127.0.0.1:8500'
SNIP = 'explosion-tnt'

CAMBIOS = [
    (
        'el precálculo guarda el aviso de rotura de cada bloque',
        """    const rings = [];   // rings[d] = [ [x,y,z], ... ]  (d entero, 0 = centro)
    let toDestroy = 0;""",
        """    const rings = [];   // rings[d] = [ [x,y,z], ... ]  (d entero, 0 = centro)
    const avisos = [];  // avisos[d] = [ función, ... ]  los `alRomper` pendientes de ese anillo
    let toDestroy = 0;""",
    ),
    (
        'pedir el aviso con el bloque todavía puesto',
        """                    const d = Math.floor(Math.sqrt(distanceSq));
                    (rings[d] || (rings[d] = [])).push([x, y, z]);
                    toDestroy++;""",
        """                    const d = Math.floor(Math.sqrt(distanceSq));
                    (rings[d] || (rings[d] = [])).push([x, y, z]);
                    // El aviso se pide AHORA, con el bloque todavía puesto: en cuanto la onda le
                    // pinte fuego encima ya no habría nada que leer. Es null si ese bloque no tiene
                    // `alRomper`; aquí no sabemos —ni falta— de qué bloque se trata.
                    const avisa = game.bloques.avisoDeRotura(x, y, z);
                    if (avisa) (avisos[d] || (avisos[d] = [])).push(avisa);
                    toDestroy++;""",
    ),
    (
        'cada fotograma da los avisos de lo que acaba de dejar en aire',
        """    let prevFire = null;   // celdas encendidas el fotograma anterior

    function wave(d) {
        beginBatch();

        // Apagar el frente anterior: fuego → aire (queda el hueco/cráter).
        if (prevFire) {
            for (const [x, y, z] of prevFire) setVoxel(x, y, z, 0);
        }

        const cells = rings[d] || [];
        if (showFire && d < rings.length - 1) {
            // Anillos intermedios: pintar el frente de fuego (se apagará al siguiente).
            for (const [x, y, z] of cells) setVoxel(x, y, z, fireMat);
            prevFire = cells;
        } else {
            // Sin fuego, o último anillo: destruir directamente a aire.
            for (const [x, y, z] of cells) setVoxel(x, y, z, 0);
            prevFire = null;
        }

        endBatch();   // ← un solo remallado = un fotograma visible
""",
        """    let prevFire = null;      // celdas encendidas el fotograma anterior
    let prevAvisos = null;    // …y sus avisos, esperando a que la celda sea aire de verdad

    function wave(d) {
        beginBatch();
        let dar = [];   // avisos de las celdas que este fotograma deja en aire

        // Apagar el frente anterior: fuego → aire (queda el hueco/cráter).
        if (prevFire) {
            for (const [x, y, z] of prevFire) setVoxel(x, y, z, 0);
            dar = prevAvisos || [];
        }

        const cells = rings[d] || [];
        if (showFire && d < rings.length - 1) {
            // Anillos intermedios: pintar el frente de fuego (se apagará al siguiente).
            for (const [x, y, z] of cells) setVoxel(x, y, z, fireMat);
            prevFire = cells;
            prevAvisos = avisos[d] || null;
        } else {
            // Sin fuego, o último anillo: destruir directamente a aire.
            for (const [x, y, z] of cells) setVoxel(x, y, z, 0);
            prevFire = null;
            prevAvisos = null;
            dar = dar.concat(avisos[d] || []);
        }

        endBatch();   // ← un solo remallado = un fotograma visible
        // Con la celda ya en aire, el bloque recibe su evento. Mismo orden que el pico (mcBreak):
        // primero desaparece, luego se abre la sorpresa.
        for (const avisa of dar) avisa();
""",
    ),
    (
        'el barrido final también avisa de lo que apaga',
        """            if (prevFire) {
                beginBatch();
                for (const [x, y, z] of prevFire) setVoxel(x, y, z, 0);
                endBatch();
            }""",
        """            if (prevFire) {
                beginBatch();
                for (const [x, y, z] of prevFire) setVoxel(x, y, z, 0);
                endBatch();
                for (const avisa of (prevAvisos || [])) avisa();
            }""",
    ),
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
        print('   ya estaba · %s' % q)
    for q in hechos:
        print('   cambio    · %s' % q)
    if not hechos:
        print('nada que hacer: «%s» ya esta parcheado.' % SNIP)
        return 0
    if a.comprobar:
        print('\n--comprobar: no he tocado nada.')
        return 0

    pide('%s/api/snippets' % a.sitio,
         json.dumps({'id': SNIP, 'name': snip.get('name') or SNIP, 'code': nuevo}).encode('utf-8'))
    print('\npublicado «%s» (%d → %d caracteres)' % (SNIP, len(code), len(nuevo)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
