#!/usr/bin/env python3
# @area: snippets
#
# BUG-SAVE2 · `guardado-fiel` v2 · lo que se escribe MIENTRAS vuela el POST deja de perderse.
#
# EL SINTOMA (dueño, 2026-09-03, dos veces): crear un mundo con la plantilla «oceanos y playas» y,
# al recargarlo, la playa sin agua. Su mapa `miplaya` en disco: 304.235 voxels y una paleta sin
# `agua`, sin `dirt` y sin `obsidiana` — que es EXACTAMENTE la instantanea que el mundo tenia en el
# instante del guardado completo, y el `.vox` no se volvio a escribir despues.
#
# LA CAUSA, medida. `mcSaveWorldFull` (app.js:22456) hace esto:
#
#     await fetch(mcWorldUrl(), { ..., body: JSON.stringify(mcSerialize()) });   // 13 MB en vuelo
#     mc.v2 = true;
#     if(mc.pend){ mc.pend.full=false; mc.pend.header=false; mc.pend.vox.clear(); }
#
# La instantanea se toma al entrar, pero la bandera `p.full` se baja al SALIR. Y mientras esta
# puesta, `mcDirty` (app.js:9045) se va sin apuntar nada:
#
#     function mcDirty(x,y,z){ const p=mc.pend; if(!p || p.full) return; ... }
#
# O sea: durante todo el viaje del POST —segundos, con 13 MB— cada celda que se escribe (1) no va en
# la instantanea, porque es posterior, y (2) no queda apuntada, porque `full` esta puesto. Y al
# volver, el `vox.clear()` remata borrando la unica memoria que quedaba. Se pierden para siempre,
# aunque en pantalla se sigan viendo: por eso «al entrar todo esta en su sitio» y al recargar no.
#
# En un mundo de plantilla eso es justo lo que cae: los materiales que no van precargados
# (`agua`, `dirt`, `obsidian`) se escriben tarde, cuando su `.vox.json` termina de bajar.
#
# Reproducido en laboratorio reteniendo 25 s el POST del guardado completo: 60.621 voxels perdidos
# (agua 5.642 + dirt 35.745 + obsidiana 16.384 + nubes 2.850) y una recarga de 301.590, calcada al
# mapa del dueño. Sin retener el POST sale bien la mayoria de las veces, y de ahi el «a veces si».
#
# EL ARREGLO: la instantanea y la bandera van JUNTAS, y antes del `await`. `mcSerialize()` es
# sincrono, asi que lo que devuelve es el mundo exacto de ese instante; bajando `full` acto seguido,
# toda escritura posterior vuelve a pasar por `mcDirty` y se acumula sola en `p.vox`, que es lo que
# el siguiente ciclo mandara por `/edits`. Es la MISMA disciplina que `mcSaveWorldAhora` ya aplica
# en el camino incremental — «se saca el pendiente ANTES del await y se pone uno nuevo en su sitio:
# lo que se construya mientras el POST viaja se acumula aparte en vez de perderse al vaciar»
# (app.js:22416). La asimetria entre los dos caminos ES el bug, igual que lo era en REQ-SAVE1.
#
# Y si el POST falla, se vuelve a `full = true`: no se sabe que llego, asi que se reintenta el mundo
# entero. Perder un viaje es barato; perder voxels no.
#
# ⛔ Va aqui y no en un envoltorio nuevo A PROPOSITO: `guardado-fiel` YA envuelve `mcSaveWorldFull`
# (REQ-SAVE1) y apilar una segunda capa dejaria `off()` a medias. Un solo envoltorio, dos arreglos.
#
# ⛔ Idempotente y POR ANCLA. Un snippet publicado tiene DOS COPIAS VIVAS, asi que esto nunca
# reescribe el fichero entero — solo sustituye sus anclas. Publica por `POST /api/snippets`.
#
#     python3 herramientas/parche_snp_guardado_vuelo.py --comprobar
#     python3 herramientas/parche_snp_guardado_vuelo.py
import argparse
import json
import os
import sys
import urllib.request

SITIO = 'http://127.0.0.1:8500'
SNIP = 'guardado-fiel'
TOKEN = (os.environ.get('VOXELFORGE_TOKEN') or '').strip()

CAMBIOS = [
    (
        'VERSION v1 → v2 (el envoltorio cambia de comportamiento)',
        """const VERSION = 'v1';""",
        """const VERSION = 'v2';""",
    ),
    (
        'la instantánea y la bandera `full` se toman juntas, antes del await',
        """    let r;
    try {
      r = await fetch(mcWorldUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mcSerialize())
      });
    } catch (e) {
      // Sin cambios respecto al motor: esto es el corte de red de siempre.
      toast('No se pudo guardar el mundo');
      return false;
    }
""",
        """    // ⛔ BUG-SAVE2 · LA INSTANTÁNEA Y LA BANDERA VAN JUNTAS, Y ANTES DEL `await`.
    //
    // `mcSerialize()` es SÍNCRONO: lo que devuelve es el mundo exacto de este instante, y a partir
    // de aquí cualquier escritura es POSTERIOR y este POST ya no la lleva. El motor bajaba `p.full`
    // al SALIR (app.js:22460), y mientras está puesta `mcDirty` se va sin apuntar nada
    // (app.js:9045) — así que todo lo escrito durante el viaje (segundos, con 13 MB por delante) no
    // iba en la instantánea NI quedaba apuntado, y el `vox.clear()` del final borraba el último
    // rastro. En pantalla seguía viéndose; en disco no estaba. Eso es la playa sin agua del dueño.
    //
    // Bajándola aquí, esas escrituras vuelven a pasar por `mcDirty` y se acumulan solas en `p.vox`,
    // que es lo que el siguiente ciclo mandará por `/edits`. Misma disciplina que ya usa el camino
    // incremental en `mcSaveWorldAhora` (app.js:22416); la asimetría entre los dos ERA el bug.
    const _pend = mc.pend;
    const _cuerpo = JSON.stringify(mcSerialize());
    // Lo apuntado se SACA (no se borra) y se pone un Set nuevo en su sitio: es letra por letra lo que
    // hace el camino incremental en `mcSaveWorldAhora` (app.js:22419), y por el mismo motivo — si el
    // viaje sale mal hay que poder devolverlo.
    const _antes = _pend ? _pend.vox : null;
    if (_pend) { _pend.vox = new Set(); _pend.full = false; _pend.header = false; }
    // Si el POST no sale bien no se sabe qué llegó: se vuelve al mundo entero Y se devuelve lo que se
    // había sacado, como el `devolver()` de al lado. Perder un viaje es barato; perder voxels, no.
    const _rendirse = function () {
      if (!_pend) return;
      _pend.full = true; _pend.header = true;
      for (const k of _antes) _pend.vox.add(k);
    };

    let r;
    try {
      r = await fetch(mcWorldUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: _cuerpo
      });
    } catch (e) {
      // Sin cambios respecto al motor: esto es el corte de red de siempre.
      _rendirse();
      toast('No se pudo guardar el mundo');
      return false;
    }
""",
    ),
    (
        'un rechazo del servidor devuelve el mundo entero a pendiente',
        """    if (!r.ok) {
      rechazos++;
      ultimo = r.status;""",
        """    if (!r.ok) {
      _rendirse();
      rechazos++;
      ultimo = r.status;""",
    ),
    (
        'al salir bien ya NO se vacía lo pendiente',
        """    mc.v2 = true;                                            // el servidor siempre lo escribe en v2
    if (mc.pend) { mc.pend.full = false; mc.pend.header = false; mc.pend.vox.clear(); }
    return true;""",
        """    mc.v2 = true;                                            // el servidor siempre lo escribe en v2
    // ⛔ Y AQUÍ YA NO SE VACÍA `p.vox`. Lo que contiene es lo escrito DESPUÉS de la instantánea, o
    // sea exactamente lo que este POST no lleva; tirarlo era la segunda mitad de BUG-SAVE2. Las
    // banderas ya se bajaron arriba, así que no hay nada que bajar.
    return true;""",
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

    # ⛔ El documento se manda ENTERO: el POST lo rearma de cero y lo que no viaje se PIERDE.
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
