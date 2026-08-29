#!/usr/bin/env python3
# @area: snippets
#
# REQ-CASA1 · «construye-casa» se construye en CUALQUIER mapa, no sólo en los que ya tengan sus cuatro
# materiales puestos.
#
# EL FALLO (el dueño, 2026-08-28, en `multiverse3` recién estrenado): rompes el bloque-sorpresa, `alRomper`
# dispara el snippet y revienta con «la paleta de este mundo no tiene "farolillo-zen"». El asset existe;
# lo que no lo tiene es la PALETA de ese mundo, que sólo lleva los 6 de serie, los de la hotbar y los que
# ya estén PUESTOS en el mundo guardado.
#
# LA CAUSA, y es la parte que importa: el snippet escribía con `mcSetBlock(x,y,z,id)`, la puerta de abajo,
# que quiere un ÍNDICE NUMÉRICO de paleta. Por eso tenía que traducir nombre→índice a mano y por eso se
# caía cuando el índice no existía. El motor YA sabe traerse la textura que falta él solo —app.js:20996,
# «Carga automática de la textura que falta»: apunta la celda, pide la textura en segundo plano y repinta
# las celdas apuntadas cuando llega, UNA carga por material y no una por voxel—, pero eso vive en
# `setVoxel`, que pide el material POR NOMBRE. Bastaba con usar la puerta buena.
#
# ⛔ Idempotente y POR ANCLA: no reescribe el snippet entero. Y publica por `POST /api/snippets`, nunca
# tocando el `.json` a mano, que es lo que da papelera y escritura atómica.
#
#     python3 herramientas/parche_snp_construye_casa.py --comprobar   # dice qué haría, no toca nada
#     python3 herramientas/parche_snp_construye_casa.py
import argparse
import json
import sys
import urllib.request

SITIO = 'http://127.0.0.1:8500'
SNIP = 'construye-casa'

# (qué se busca, por qué se cambia, por qué se sustituye). El ancla se exige EXACTA y UNA sola vez: si el
# snippet ha cambiado debajo, mejor parar que dejarlo a medias.
CAMBIOS = [
    (
        'los materiales, por nombre y no por índice de paleta',
        """  // ⛔ Sólo materiales de la paleta de ESTE mundo, y preguntados POR NOMBRE. Un id escrito a mano que
  // no exista no falla: pinta aire, y la casa sale medio invisible sin que nada avise.
  function mat(nombre) {
    var i = mc.blockKey.indexOf(mcClaveDeNombre(nombre));
    if (i < 0) throw new Error('construye-casa: la paleta de este mundo no tiene "' + nombre + '"');
    return i;
  }
  var ROCA = mat('roca'), TABL = mat('tablones'), ADOQ = mat('adoquin'),
      LUZ = mat('farolillo-zen'), AIRE = 0;""",
        """  // ── LOS MATERIALES ─────────────────────────────────────────────────────────────────────────────
  // Van POR NOMBRE, en crudo, y NO se traducen a índices de paleta. Aquí antes se preguntaba
  // `mc.blockKey.indexOf(...)` y se lanzaba un error si el material no estaba, así que la casa sólo se
  // dejaba levantar en mapas que YA tuvieran sus cuatro materiales puestos: en un mundo recién estrenado
  // reventaba con «la paleta de este mundo no tiene "farolillo-zen"» AUNQUE EL ASSET EXISTA (le pasó al
  // dueño en `multiverse3`, 2026-08-28).
  //
  // No hace falta darlos de alta a mano: el motor se trae la textura que falta él solo (app.js:20996,
  // «Carga automática de la textura que falta»), y lo hace en `setVoxel` —que pide el material por
  // nombre—, no en `mcSetBlock`, que quiere un índice ya existente. Una carga por material, no una por
  // voxel. El aire es la cadena vacía, que es como lo escribe `setVoxel` (el 0 era el índice 0).
  var ROCA = 'roca', TABL = 'tablones', ADOQ = 'adoquin',
      LUZ = 'farolillo-zen', AIRE = '';""",
    ),
    (
        'escribir por la puerta buena (setVoxel), no por la de abajo (mcSetBlock)',
        """  function pon(dx, y, dz, id) { var p = gira(dx, dz); mcSetBlock(A + p[0], y, B + p[1], id); n++; }""",
        """  function pon(dx, y, dz, id) { var p = gira(dx, dz); setVoxel(A + p[0], y, B + p[1], id); n++; }""",
    ),
    (
        'el remallado ya no se pide a mano: lo hace el volcado de setVoxel',
        """  // ⚠️ SIN ESTO SE CONSTRUYE INVISIBLE. `mcSetBlock` escribe la rejilla y apunta la celda en
  // `mcDirty`, pero `mcDirty` es la cola de GUARDADO (`app.js:8695`), no el remallado: el chunk no se
  // vuelve a mallar solo. Lo dice el propio motor —«quien las pone es responsable de llamar a
  // remallar»— y el camino normal del jugador (`mcDoAction`) ya lo hace por su cuenta. Costó un buen
  // rato descubrirlo: la rejilla y el rayo de apuntado SÍ tenían los bloques (el cursor se enganchaba
  // a un muro invisible), así que todo lo medible decía que la casa estaba construida.
  // El margen se toma CUADRADO alrededor del centro: así vale para los cuatro giros sin pensar.
  var M = R + 3;
  mcRemeshAround(A - M, B - M, A + M, B + M);""",
        """  // El remallado ya NO se pide aquí: `setVoxel` junta las escrituras en una ráfaga y al volcarla
  // (`mcFlushBuild`, app.js:20990) remalla ella sola —y vuelve a remallar cuando aterriza una textura
  // que se estaba descargando, que es justo lo que no podíamos hacer nosotros—.
  //
  // Se deja apuntada la lección de cuando esto escribía con `mcSetBlock`, porque el día que alguien
  // vuelva a bajar a esa puerta le va a volver a morder: `mcSetBlock` escribe la rejilla y apunta la
  // celda en `mcDirty`, pero `mcDirty` es la cola de GUARDADO (app.js:8695), NO el remallado. La casa
  // salía INVISIBLE y todo lo medible decía que estaba construida —la rejilla y el rayo de apuntado sí
  // tenían los bloques, el cursor se enganchaba a un muro que no se veía—.""",
    ),
]


def pide(url, cuerpo=None):
    pet = urllib.request.Request(url, data=cuerpo, method='POST' if cuerpo else 'GET',
                                 headers={'Content-Type': 'application/json'} if cuerpo else {})
    with urllib.request.urlopen(pet, timeout=20) as r:
        return json.loads(r.read().decode('utf-8') or '{}')


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--comprobar', action='store_true', help='decir qué haría y salir sin tocar nada')
    p.add_argument('--sitio', default=SITIO)
    a = p.parse_args()

    snip = pide('%s/api/snippets/%s' % (a.sitio, SNIP))
    code = snip.get('code') or ''
    if not code:
        print('⛔ «%s» no tiene código (¿servidor levantado?)' % SNIP)
        return 1

    nuevo, hechos, ya = code, [], []
    for que, viejo, bueno in CAMBIOS:
        if bueno in nuevo:
            ya.append(que)
            continue
        n = nuevo.count(viejo)
        if n != 1:
            print('⛔ el ancla de «%s» aparece %d veces (esperaba 1). El snippet ha cambiado debajo:\n'
                  '   no lo toco, míralo a mano.' % (que, n))
            return 2
        nuevo = nuevo.replace(viejo, bueno)
        hechos.append(que)

    for q in ya:
        print('   ya estaba · %s' % q)
    for q in hechos:
        print('   cambio    · %s' % q)
    if not hechos:
        print('nada que hacer: «%s» ya está parcheado.' % SNIP)
        return 0
    if a.comprobar:
        print('\n--comprobar: no he tocado nada. Quita la bandera para publicarlo.')
        return 0

    # Por `POST /api/snippets` y con el MISMO id y nombre: así hay papelera y escritura atómica.
    pide('%s/api/snippets' % a.sitio,
         json.dumps({'id': SNIP, 'name': snip.get('name') or SNIP, 'code': nuevo}).encode('utf-8'))
    print('\npublicado «%s» (%d → %d caracteres)' % (SNIP, len(code), len(nuevo)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
