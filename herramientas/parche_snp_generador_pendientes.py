#!/usr/bin/env python3
# @area: snippets
#
# BUG-PLANT2 · `generador-mundo` deja de guardar el mundo a medias.
#
# EL SINTOMA (dueño, 2026-09-03): «desde un template creo "oceanos y playas" y lo llamo "miplaya";
# cuando entro al mapa todo esta en su sitio, pero cuando lo recargo la playa que cree no tiene
# agua». En pantalla el mundo estaba entero; en disco no.
#
# LA CAUSA, medida. `setVoxel` con un material que aun no esta en la paleta NO escribe la celda: la
# apunta en `mcPendCel`, se trae el `.vox.json` por `mcPendCarga` y la escribe AL LLEGAR (app.js:22206).
# Mientras esa descarga viaja, la rejilla NO CRECE — y `asienta()` mide precisamente eso, que la
# rejilla deje de crecer. Cuatro muestras quietas (2 s) mas lentas que la descarga y el corredor da
# por terminada la generacion, guarda, y todo lo que aterriza despues se queda fuera del fichero.
# El jugador lo sigue VIENDO en esa sesion (la celda si se escribe, solo que tarde), y desaparece al
# recargar. De ahi que parezca un fantasma.
#
# Medido en `/map/zz-lento-*` retrasando los assets 4 s: se perdian 52.129 voxels
# (obsidiana 16.384 + dirt 35.745) y la paleta guardada era exactamente la de los materiales que si
# habian llegado a tiempo. En el mapa del dueño le toco al agua: 5.642 celdas. Que material caiga
# depende del orden de las descargas, por eso unas veces sale bien y otras no.
#
# EL ARREGLO, dos piezas y ninguna en `app.js`:
#   A) `asienta()` deja de contar como quieta una vuelta en la que hay algo en vuelo. Una rejilla
#      parada porque esta esperando una textura no esta asentada: esta bloqueada.
#   B) antes de `mcSaveWorld()` se drena de verdad lo pendiente. Es cinturon Y tirantes a proposito:
#      (A) evita el diagnostico equivocado y (B) garantiza que lo que se serializa esta completo
#      aunque el ultimo material entre justo en el limite del tope de (A).
#
# Se espera a las TRES señales porque cuentan cosas distintas: `mc.paletaEnObra` es «la paleta esta
# a medias y cualquier pregunta miente» (app.js:9916), `mcPendCarga` son las descargas en vuelo y
# `mcPendCel` las celdas apuntadas a la espera. Vaciar las descargas no vacia las celdas en el mismo
# tick, y un material puede arrastrar otro, asi que se da vueltas hasta que las tres estan a cero.
#
# ⛔ Idempotente y POR ANCLA. Un snippet publicado tiene DOS COPIAS VIVAS, asi que esto nunca
# reescribe el fichero entero — solo sustituye sus anclas. Publica por `POST /api/snippets`, que es
# lo que da papelera y escritura atomica.
#
#     python3 herramientas/parche_snp_generador_pendientes.py --comprobar
#     python3 herramientas/parche_snp_generador_pendientes.py
import argparse
import json
import os
import sys
import urllib.request

SITIO = 'http://127.0.0.1:8500'
SNIP = 'generador-mundo'
TOKEN = (os.environ.get('VOXELFORGE_TOKEN') or '').strip()

CAMBIOS = [
    (
        'asienta() no cuenta como quieta una vuelta con material en vuelo',
        """let previo = -1, quietas = 0;
  // Tope de 4 minutos: un mundo de 512 con árboles tarda lo suyo, pero colgarse aquí para siempre
  // dejaría al jugador mirando el cartel de carga sin salida.
  for (let i = 0; i < 480 && quietas < 4; i++) {
    await new Promise(function (r) { setTimeout(r, 500); });
    const ahora = cuenta();
    quietas = (ahora === previo) ? quietas + 1 : 0;
    previo = ahora;
  }""",
        """let previo = -1, quietas = 0;
  // Tope de 4 minutos: un mundo de 512 con árboles tarda lo suyo, pero colgarse aquí para siempre
  // dejaría al jugador mirando el cartel de carga sin salida.
  for (let i = 0; i < 480 && quietas < 4; i++) {
    await new Promise(function (r) { setTimeout(r, 500); });
    const ahora = cuenta();
    // ⛔ BUG-PLANT2 · «la rejilla no crece» NO significa «el generador terminó». Un `setVoxel` con un
    // material que aún no está en la paleta apunta la celda y se trae la textura (app.js:22206); todo
    // ese rato la cuenta está CLAVADA. Sin esta guarda, cuatro muestras dentro de una descarga daban
    // el mundo por hecho y el guardado se llevaba el mapa sin lo que faltaba por aterrizar: al dueño
    // le tocó el agua de su playa entera. Una rejilla parada esperando una textura no está asentada.
    quietas = (ahora === previo && !enVuelo()) ? quietas + 1 : 0;
    previo = ahora;
  }""",
    ),
    (
        'se drena lo pendiente antes de guardar',
        """_di('Guardando el mundo…');
try { if (typeof mcSaveWorld === 'function') await mcSaveWorld(); }
catch (e) { console.warn('[generador-mundo] el guardado se quejó:', e); }""",
        """_di('Guardando el mundo…');
// ⛔ BUG-PLANT2 · lo que no esté ESCRITO en la rejilla no se guarda, y las celdas que esperan su
// textura no lo están todavía. `asienta()` ya evita confundir una descarga con el final, pero el
// último material puede entrar justo en el borde de su tope; aquí se espera de verdad, que es
// barato y quita el «a veces sí, a veces no».
await drenaPendientes(60000, _di);
try { if (typeof mcSaveWorld === 'function') await mcSaveWorld(); }
catch (e) { console.warn('[generador-mundo] el guardado se quejó:', e); }""",
    ),
    (
        'ayudantes enVuelo() y drenaPendientes()',
        """async function asienta() {""",
        """// ── ⛔ BUG-PLANT2 · lo que sigue en vuelo ────────────────────────────────────────────────────────
//
// Tres señales, tres cosas distintas, y hay que esperar a las tres:
//   · `mc.paletaEnObra`  la paleta se está reconstruyendo y CUALQUIER pregunta sobre ella miente
//                        mientras tanto (así lo avisa `app.js:9916`).
//   · `mcPendCarga`      descargas de material en vuelo.
//   · `mcPendCel`        celdas ya pedidas que esperan a su textura para escribirse.
// Vaciar las descargas no vacía las celdas en el mismo tick —y un material puede arrastrar otro—,
// así que no basta con mirar una vez: se da vueltas hasta que las tres están a cero.
//
// Todo va con `typeof` porque son internos de `app.js` y este snippet tiene que seguir corriendo
// contra un motor que no los tenga: sin ellos `enVuelo()` da 0 y el comportamiento es el de antes.
function enVuelo() {
  let n = 0;
  try { if (typeof mc !== 'undefined' && mc.paletaEnObra) n += mc.paletaEnObra; } catch (e) {}
  try { if (typeof mcPendCarga !== 'undefined' && mcPendCarga) n += mcPendCarga.size; } catch (e) {}
  try { if (typeof mcPendCel !== 'undefined' && mcPendCel) n += mcPendCel.size; } catch (e) {}
  return n;
}

// `avisa` llega por argumento y no por nombre: el cartel de carga es `_di`, que vive DENTRO de
// `construye()`, y esto es una función de arriba. Sin él, se drena igual y en silencio.
async function drenaPendientes(topeMs, avisa) {
  const hasta = Date.now() + (topeMs || 60000);
  let ultimo = -1;
  while (Date.now() < hasta) {
    const n = enVuelo();
    if (!n) return true;
    if (n !== ultimo) { try { if (avisa) avisa('Terminando de cargar materiales…'); } catch (e) {} ultimo = n; }
    // Esperar a la promesa de cada descarga es mucho más fino que dormir a ciegas; es lo mismo que
    // hace `mcHistTrasCarga` (app.js:16920) para no apuntar en el historial un bloque que aún no está.
    try {
      if (typeof mcPendCarga !== 'undefined' && mcPendCarga && mcPendCarga.size) {
        for (const pr of [...mcPendCarga.values()]) await Promise.resolve(pr).catch(function () {});
      }
    } catch (e) {}
    await new Promise(function (r) { setTimeout(r, 50); });
  }
  // Rendirse es mejor que colgar la carga para siempre, pero NO en silencio: si esto sale, el mapa
  // que se está a punto de guardar puede ir incompleto y hay que poder saberlo.
  console.warn('[generador-mundo] me rindo esperando ' + enVuelo() + ' material(es) por llegar; ' +
               'el mapa puede guardarse incompleto.');
  return false;
}

async function asienta() {""",
    ),
]


def pide(url, cuerpo=None):
    pet = urllib.request.Request(url, data=cuerpo, method='POST' if cuerpo else 'GET',
                                 headers={'Content-Type': 'application/json'} if cuerpo else {})
    # En modo publico `POST /api/snippets` es solo del dueño (F0.4): sin token, 401.
    if TOKEN:
        pet.add_header('X-VoxelForge-Token', TOKEN)
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

    # ⛔ El documento se manda ENTERO: el POST lo rearma de cero y lo que no viaje se PIERDE
    # (`categoria: sistema` y `protegido: true` son justamente lo que impide que se borre por error).
    cuerpo = {'id': SNIP, 'name': snip.get('name') or SNIP, 'code': nuevo}
    for campo in ('categoria', 'ficha'):
        if snip.get(campo):
            cuerpo[campo] = snip[campo]
    if snip.get('protegido') is True:
        cuerpo['protegido'] = True
    pide('%s/api/snippets' % a.sitio, json.dumps(cuerpo, ensure_ascii=False).encode('utf-8'))
    print('\npublicado «%s» (%d → %d caracteres)' % (SNIP, len(code), len(nuevo)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
