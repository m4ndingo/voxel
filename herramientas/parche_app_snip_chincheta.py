#!/usr/bin/env python3
# @area: editor
#
# REQ-SNP-PIN · Chinchetas en el gestor de snippets: fijar scripts ARRIBA de la lista.
#
# LA ORDEN (el dueño, 2026-08-28):
#   «en el editor de codigo quiero poder "pinear" scripts para que queden arriba (en plan chincheta)»
#
# QUE PASABA ANTES. `/api/snippets` ordena por `savedAt` descendente (`list_snips`, server.py) y
# `renderSnipList` pinta esa lista tal cual. O sea que los cuatro snippets que uno toca cada dia se
# hunden solos en cuanto se guarda cualquier otro, y con 80 fichas en el panel eso es scroll a ciegas.
#
# ── LEY DE ORO (docs/desarrollo-desacoplado.md) ────────────────────────────────────────────────────
# Esto NO se escribio directamente aqui. Primero vivio como parche en caliente: el snippet
# 'snip-chincheta' envolvia `renderSnipList` (guardando el original en `env._pinOrig`), reordenaba lo
# ya pintado y colgaba la chincheta, con `game.chinchetas.on()/off()/estado()` de A/B. Se valido en
# Chromium contra las 80 fichas reales del dueño —chincheta sube la ficha, persiste, no abre el
# snippet, sobrevive a `snipReload()`, `off()` devuelve el gestor byte a byte y re-ejecutar no apila
# envolturas: 20/20 ok— y solo entonces se gradua aqui. El snippet se retira al graduar porque su
# `on()` colgaria una SEGUNDA chincheta encima de la que ya trae app.js; el A/B que queda es el
# guardian `tests/test_snip_chincheta.js`.
#
# ── DONDE VIVE EL ESTADO, Y POR QUE ───────────────────────────────────────────────────────────────
# En `localStorage` (`vf_snipPin`), NO en `data/snippets/<id>.json`. Tres razones, por orden de peso:
#   1. Es una preferencia de VISTA de quien mira, no contenido del snippet. Es la misma familia que
#      `vf_snipAlto` (alto del editor) y `vf_snipDiv` (pantalla dividida), que ya viven ahi mismo, en
#      este mismo panel: lo que un snippet ES no cambia porque yo lo quiera tener a mano.
#   2. Guardar en el servidor es `POST /api/snippets`, que reescribe el fichero ENTERO (name+code) y le
#      pone un `savedAt` nuevo... y `savedAt` es JUSTO la clave por la que el servidor ORDENA la lista.
#      Clavar una chincheta reordenaria la lista por su cuenta, que es lo contrario de lo que se pide.
#   3. Cada POST respalda la version anterior en la papelera del servidor: 20 chinchetas = 20 copias
#      de basura de ficheros que no han cambiado ni una letra.
# El precio es que las chinchetas son de este navegador. Es el precio correcto: son MIS atajos.
#
#     python3 herramientas/parche_app_snip_chincheta.py --comprobar
#     python3 herramientas/parche_app_snip_chincheta.py
#
# ⚠️ El CSS de `.snip-pin` va en `web/style.css` y se edita normal: la regla de no tocar a mano es de
# `web/app.js` (23 800 lineas), no de la hoja de estilo.
import argparse
import os
import sys

APP = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'web', 'app.js')

CAMBIOS = [
    (
        'el estado de las chinchetas y el orden que imponen',
        """function renderSnipList(){""",
        """// ── 📌 REQ-SNP-PIN · CHINCHETAS: fijar snippets arriba de la lista ─────────────────────────────
// «en el editor de codigo quiero poder "pinear" scripts para que queden arriba (en plan chincheta)»
// (orden del dueño, 2026-08-28). El listado llega ordenado por `savedAt` desde el servidor, asi que lo
// que uno usa cada dia se hunde solo en cuanto se guarda cualquier otra cosa.
//
// EL ESTADO VIVE EN `localStorage`, NO en el .json del snippet. Es una preferencia de VISTA, de la
// misma familia que `vf_snipAlto` y `vf_snipDiv` (aqui arriba, mismo panel). Y ademas guardarlo en el
// servidor seria un `POST /api/snippets`, que reescribe el fichero entero y le pone un `savedAt`
// nuevo — que es justo la clave por la que el servidor ORDENA la lista: clavar una chincheta
// reordenaria la lista sola. Motivo largo en herramientas/parche_app_snip_chincheta.py.
const SNIP_PIN_LS='vf_snipPin';
let snipPins=(()=>{ try{ const v=JSON.parse(localStorage.getItem(SNIP_PIN_LS)||'[]');
  return Array.isArray(v) ? v.filter(x=>typeof x==='string') : []; }catch(e){ return []; } })();
function snipEsPin(id){ return snipPins.indexOf(id)>=0; }
// ⛔ Ordena una COPIA. `snips` es la lista completa que consulta el guardado para avisar de un id
// repetido, y `snipVista` trae el orden de relevancia del buscador (las llamadas antes que las
// menciones, server.py); ninguna de las dos se puede pisar. `sort` es estable ⇒ dentro de cada grupo
// se respeta tal cual el orden que vino del servidor: la chincheta solo asciende, no baraja.
function snipOrdenaPins(datos){
  if(!snipPins.length) return datos;
  return datos.slice().sort((a,b)=>(snipEsPin(a.id)?0:1)-(snipEsPin(b.id)?0:1));
}
function snipTogglePin(id){
  const i=snipPins.indexOf(id);
  if(i>=0) snipPins.splice(i,1); else snipPins.push(id);
  try{ localStorage.setItem(SNIP_PIN_LS, JSON.stringify(snipPins)); }catch(e){}
  renderSnipList();
}
function renderSnipList(){""",
    ),
    (
        'los fijados, delante de todo',
        """const datos = snipVista || snips;""",
        """const datos = snipOrdenaPins(snipVista || snips);   // 📌 REQ-SNP-PIN · los fijados, arriba""",
    ),
    (
        'la chincheta de cada ficha',
        """    b.onclick=()=>snipLoad(s.id);""",
        """    // 📌 REQ-SNP-PIN · la chincheta va DENTRO de la ficha, que ya es un <button>. Un <button>
    // anidado NO es HTML valido (el parser lo saca fuera del padre), asi que es un <span role=button>
    // con su tecla. Y `stopPropagation`, o clavarla abriria ademas el snippet.
    b.dataset.snip=s.id;
    const fijado=snipEsPin(s.id);
    const pin=document.createElement('span');
    pin.className='snip-pin'+(fijado?' is-on':'');
    pin.setAttribute('role','button'); pin.tabIndex=0;
    pin.setAttribute('aria-pressed', fijado?'true':'false');
    pin.textContent='📌';
    pin.title=fijado?'Quitar la chincheta':'Fijar arriba con una chincheta';
    pin.onclick=(e)=>{ e.stopPropagation(); snipTogglePin(s.id); };
    pin.onkeydown=(e)=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); e.stopPropagation(); snipTogglePin(s.id); } };
    b.appendChild(pin);
    b.onclick=()=>snipLoad(s.id);""",
    ),
]


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--comprobar', action='store_true')
    p.add_argument('--app', default=APP)
    a = p.parse_args()

    src = open(a.app, encoding='utf-8').read()
    nuevo, hechos, ya = src, [], []

    for que, viejo, bueno in CAMBIOS:
        if bueno in nuevo:
            ya.append(que)
            continue
        n = nuevo.count(viejo)
        if n != 1:
            print('⛔ el ancla de «%s» aparece %d veces (esperaba 1). No lo toco.' % (que, n))
            return 2
        nuevo = nuevo.replace(viejo, bueno)
        hechos.append(que)

    for q in ya:
        print('   ya estaba · %s' % q)
    for q in hechos:
        print('   cambio    · %s' % q)
    if not hechos:
        print('nada que hacer.')
        return 0
    if a.comprobar:
        print('\n--comprobar: no he tocado nada.')
        return 0

    tmp = a.app + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        f.write(nuevo)
    os.replace(tmp, a.app)
    print('\naplicado en %s (%d → %d caracteres)' % (a.app, len(src), len(nuevo)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
