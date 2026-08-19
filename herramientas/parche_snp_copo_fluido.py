#!/usr/bin/env python3
# «Otra cosa que no pasa en la realidad es que los copos de nieve caigan al fondo del agua, deberian
#  desaparecer nada mas tocar un fluido» (dueño, 2026-08-19, con la captura de debajo del agua).
#
# El parche anterior (`parche_snp_manto_fluido.py`) arreglo el MANTO: ya no cuaja bajo el agua. Pero el
# COPO seguia atravesando el liquido y posandose en el lecho, que es lo que se ve en la captura.
#
# Causa: el choque solo pregunta `S.solido(...)`, y un fluido NO es solido (se nada por el), asi que ni
# el troceo ni la caja rapida (`cajaVacia`) lo ven. El copo cae por el agua como por el aire.
#
# Se anade `muereEnFluido` (encendido por defecto): en cada sub-paso se mira si la celda de destino es
# liquido y, si lo es, el copo se borra ahi mismo. Se mira TAMBIEN cuando el tramo va `libre`, que es
# justo el caso del agua: la caja sale «vacia» porque el agua no es solida.
#
# El predicado es el del motor —`game.fluidos.getProps(id,...).isFluid`, ⛔ nunca el nombre del
# material— pero memorizado por id: `isFluid` depende SOLO del id (la posicion solo le da el nivel), y
# este bucle pregunta cientos de veces por frame contra una funcion que hace expresiones regulares.
# `mantoFluido` pasa a apoyarse en el mismo predicado, para que no haya dos.
#
# Y se sale del sub-bucle con bandera en vez de borrar dentro: tras el `break` el codigo de despues
# seguia mirando `g` y podia volver a hacer `V.splice(i,1)`, o sea llevarse por delante a OTRA
# particula. Con la bandera se borra una sola vez, fuera.
#
#   python3 herramientas/parche_snp_copo_fluido.py
#   curl -X POST localhost:8500/api/snippets -H 'Content-Type: application/json' \
#        --data-binary @data/snippets/particulas-voxel.json

import json
import os
import sys
import tempfile

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PARTIC = os.path.join(RAIZ, 'data', 'snippets', 'particulas-voxel.json')
MARCA = 'muereEnFluido'

CFG_V = """  mantoSobreFluido: false, // ⬅️ por defecto la nieve NO cuaja sobre agua ni lava: se hunde y ya."""
CFG_N = """  muereEnFluido: true,   // ⬅️ el copo se deshace al TOCAR agua o lava, no se hunde hasta el fondo
  mantoSobreFluido: false, // ⬅️ por defecto la nieve NO cuaja sobre agua ni lava: se hunde y ya."""

FLU_V = """  function mantoFluido(x, y, z){
    if(C.mantoSobreFluido) return false;
    const id = mc.grid[mcIdx(x, y, z)];
    if(!id) return false;
    const api = (typeof game !== 'undefined') && game.fluidos;
    if(!api || typeof api.getProps !== 'function') return false;
    const p = api.getProps(id, x, y, z);
    return !!(p && p.isFluid);
  }"""
FLU_N = """  // ¿Hay líquido en esta celda? Contesta `game.fluidos`, que es quien sabe de niveles (`hab:agua-3`)
  // y de tipos. ⛔ NUNCA por el nombre del material: antes esto era un /agua|water|lava/ sobre la
  // clave, y el motor lo prohíbe expresamente («aquí no se reconoce ningún material por su nombre»).
  //
  // Memorizado por id porque el bucle de partículas lo pregunta cientos de veces por frame y
  // `getProps` se come varias expresiones regulares en cada llamada. Es exacto: `isFluid` sale sólo
  // del id —la posición nada más le sirve para el NIVEL, que aquí no se usa—. La caché se tira si
  // crece la paleta.
  const fluIds = new Map();
  let fluN = -1;
  function esFluido(x, y, z){
    if(typeof mc === 'undefined' || !mc.grid) return false;
    const d = mc.dim, bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z);
    if(bx < 0 || by < 0 || bz < 0 || bx >= d.x || by >= d.y || bz >= d.z) return false;
    const id = mc.grid[mcIdx(bx, by, bz)];
    if(!id) return false;
    const n = mc.blockKey ? mc.blockKey.length : 0;
    if(n !== fluN){ fluN = n; fluIds.clear(); }
    let f = fluIds.get(id);
    if(f === undefined){
      const api = (typeof game !== 'undefined') && game.fluidos;
      const p = (api && typeof api.getProps === 'function') ? api.getProps(id, bx, by, bz) : null;
      f = !!(p && p.isFluid);
      fluIds.set(id, f);
    }
    return f;
  }
  function mantoFluido(x, y, z){ return C.mantoSobreFluido ? false : esFluido(x, y, z); }"""

LOOP_V = """    let libre = false;
      if(n > 1){"""
LOOP_N = """    let libre = false, ahoga = false;
      if(n > 1){"""

CHOQUE_V = """      const h = dt / n;
      for(let k = 0; k < n; k++){
        g.vy -= C.grav * h;
        const nx = g.x + g.vx*h, ny = g.y + g.vy*h, nz = g.z + g.vz*h;
        if(!libre && S.solido(nx, ny, nz)){"""
CHOQUE_N = """      const h = dt / n;
      for(let k = 0; k < n; k++){
        g.vy -= C.grav * h;
        const nx = g.x + g.vx*h, ny = g.y + g.vy*h, nz = g.z + g.vz*h;
        // El copo se deshace al TOCAR el líquido; no lo atraviesa hasta el lecho («deberían
        // desaparecer nada más tocar un fluido», el dueño, con la foto del fondo de la piscina).
        // ⚠️ Se mira aunque el tramo vaya `libre`: un fluido NO es sólido, así que ni `S.solido` ni
        // la caja rápida lo ven y ése es justo el caso del agua.
        if(C.muereEnFluido && esFluido(nx, ny, nz)){ ahoga = true; break; }
        if(!libre && S.solido(nx, ny, nz)){"""

FIN_V = """      // Se acaba de posar y este efecto cuaja: se hornea en la malla del mundo y deja de ser"""
FIN_N = """      // ⚠️ Borrar dentro del sub-bucle y hacer `break` deja al código de abajo mirando una `g` que ya
      // no está en `V`, y su `V.splice(i,1)` se llevaría por delante a OTRA partícula. Bandera fuera.
      if(ahoga){ V.splice(i, 1); cambia = true; continue; }
      // Se acaba de posar y este efecto cuaja: se hornea en la malla del mundo y deja de ser"""

PARES = [('config', CFG_V, CFG_N), ('predicado', FLU_V, FLU_N),
         ('bandera', LOOP_V, LOOP_N), ('choque', CHOQUE_V, CHOQUE_N), ('salida', FIN_V, FIN_N)]


def parchea(ruta, pares, marca):
    with open(ruta, encoding='utf-8') as f:
        doc = json.load(f)
    code = doc['code']
    if marca in code:
        print('ya estaba: %s' % os.path.basename(ruta))
        return 0
    for nombre, viejo, nuevo in pares:
        n = code.count(viejo)
        if n != 1:
            print('ABORTA en %s: «%s» aparece %d veces, esperaba 1 (¿lo editó el dueño?).'
                  % (os.path.basename(ruta), nombre, n), file=sys.stderr)
            return 1
    for nombre, viejo, nuevo in pares:
        code = code.replace(viejo, nuevo, 1)
    doc['code'] = code
    d = os.path.dirname(ruta)
    fd, tmp = tempfile.mkstemp(dir=d, suffix='.tmp')
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
    os.replace(tmp, ruta)
    print('parcheado: %s' % os.path.basename(ruta))
    return 0


if __name__ == '__main__':
    sys.exit(parchea(PARTIC, PARES, MARCA))
