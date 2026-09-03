#!/usr/bin/env python3
# @area: snippets
#
# REQ-PLANT1b · `generador-mundo` deja de callarse cuando no puede preguntar la plantilla.
#
# EL PORQUE (2026-08-31). Un `UnboundLocalError` en `server.py` tumbaba la conexion de
# `GET /api/mundos/<slug>/plantilla` para todo el que no fuese el dueño. El corredor daba el `fetch`
# por perdido en su `catch` vacio, `plan` se quedaba en `null`, y el snippet se iba sin decir una
# palabra: **tres mapas de plantilla creados vacios y ni un error en pantalla**. El fallo del
# servidor ya esta arreglado; esto arregla lo otro — que un fallo se vea.
#
# LA REGLA QUE SE RESPETA: «ninguno es un error que merezca ruido en la consola de un jugador» sigue
# valiendo para 403 (no es tuyo) y 404 (servidor viejo sin la ruta), que son respuestas LEGITIMAS.
# Lo que deja de ser silencioso es lo demas: un 5xx o un corte de red, que significan «no lo se», no
# «no hay nada que hacer». Y se avisa por consola Y por `toast`, porque el dueño mira desde el movil
# y alli un `console.warn` es indistinguible de «no hace nada» (mismo criterio que `app.js:22000`).
#
# ⛔ Idempotente y POR ANCLA. Un snippet publicado tiene DOS COPIAS VIVAS, asi que esto nunca
# reescribe el fichero entero — solo sustituye su ancla. Publica por `POST /api/snippets`, que es lo
# que da papelera y escritura atomica.
#
#     python3 herramientas/parche_snp_generador_aviso.py --comprobar
#     python3 herramientas/parche_snp_generador_aviso.py
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
        'un fallo al preguntar la plantilla se cuenta en vez de tragarse',
        """let plan = null;
try {
  const r = await fetch(_url, { cache: 'no-store' });
  if (r.ok) plan = await r.json();
} catch (e) { /* sin red no se genera nada; el mapa se abre como esté */ }

// `generado`, un 403 o un servidor viejo sin esta ruta: los tres significan «aquí no hay nada que
// hacer», y ninguno es un error que merezca ruido en la consola de un jugador.
if (!plan || plan.generado) return;""",
        """let plan = null;
// ⛔ REQ-PLANT1b · «no hay nada que hacer» y «no he podido preguntarlo» NO son lo mismo.
//
// Este `catch` estuvo vacío y costó tres mapas en blanco: un 500 del servidor se leía igual que un
// mapa ya generado, y el jugador se quedaba mirando un mundo vacío sin un solo aviso. 403 y 404
// siguen siendo silencio a propósito (no es tuyo / servidor viejo sin la ruta); lo demás se cuenta.
let fallo = null;
try {
  const r = await fetch(_url, { cache: 'no-store' });
  if (r.ok) plan = await r.json();
  else if (r.status !== 403 && r.status !== 404) fallo = 'el servidor respondió ' + r.status;
} catch (e) { fallo = (e && e.message) || 'sin red'; }

if (fallo) {
  console.warn('[generador-mundo] no he podido preguntar la plantilla de «' + slug + '»: ' + fallo +
    '. Si este mapa nace de una plantilla, va a salir VACÍO; vuelve a entrar cuando el servidor conteste.');
  // También por toast: el dueño construye desde el móvil, donde un `console.warn` no se ve.
  try { toast('No he podido preguntar la plantilla de este mapa: ' + fallo, 5); } catch (e) {}
  return;
}

// `generado`, un 403 o un servidor viejo sin esta ruta: los tres significan «aquí no hay nada que
// hacer», y ninguno es un error que merezca ruido en la consola de un jugador.
if (!plan || plan.generado) return;""",
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
