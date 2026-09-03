#!/usr/bin/env python3
"""SALIR desde un mapa conserva la ruta del mapa (v2 del bloque ==SALIR-AL-EDITOR==).

El bug del dueño: en `/map/empty3`, Esc → SALIR llevaba a `/`; desde allí el icono «mundo» del
editor reabre el Mundo, pero `mcMapName()` (app.js:21476) lee el mapa **de la URL**, y en `/` no hay
mapa ⇒ se entraba en `default`. Se perdía el mapa por el camino.

Lo que cambia: `/map/<x>` sirve el MISMO `index.html` que el editor (server.py:1431) — el editor
está DEBAJO de la capa del Mundo. Así que no hay que navegar a ningún sitio: basta `closeWorld()`
y la URL se queda en `/map/<x>`. El icono «mundo» vuelve al mapa correcto sin tocar nada más.
Comprobado: cerrar en `/map/empty3` deja el editor usable, y `openWorld()` vuelve a empty3.

Idempotente: si ya está la v2, no toca nada.
Uso:  python3 herramientas/parche_snp_menu_editor.py [--publicar]
"""
import json
import os
import sys
import tempfile
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SNIP = os.path.join(RAIZ, 'data', 'snippets', 'menu-juego.json')
INI = '// ==SALIR-AL-EDITOR=='
FIN = '// ==FIN-SALIR-AL-EDITOR=='
MARCA = 'M.hayEditorDetras'

NUEVO = '''// ==SALIR-AL-EDITOR== v2
// El Mundo se abre de dos maneras y SALIR no significa lo mismo en las dos: encima del editor es
// CERRAR la capa, y en una página sin editor detrás es irse del juego.
//
// ⚠️ v2 — «página propia» NO significa «sin editor detrás». `/map/<x>` sirve el MISMO `index.html`
// (server.py:1431): el editor está debajo, solo que tapado por la capa del Mundo. Mandar a `/` desde
// ahí PIERDE EL MAPA, porque `mcMapName()` (app.js:21476) lo saca de la URL y en `/` no hay ninguno:
// al pulsar el icono «mundo» se entraba en `default` en vez de volver a `empty3`. Cerrando la capa,
// la URL se queda en `/map/<x>` y el viaje de vuelta funciona solo.
M.hayEditorDetras = function () {
  try {
    if (typeof closeWorld !== 'function') return false;            // motor sin capa de Mundo
    var q = location.search || '';
    if (/[?&](osd|intro)=1/.test(q)) return false;                 // escaparate/intro: no hay editor que enseñar
    var capa = document.getElementById('mc-modal');
    if (!capa || capa.hidden) return false;
    if (!document.getElementById('tabs')) return false;            // la barra del editor, lo que queda debajo
    // El editor es superficie de desarrollo: quien no tenga el permiso no debe aterrizar en él.
    // `sesion-guardia` ya sabe quién eres; si no está (modo desarrollo), no hay nada que esconder.
    var g = G.guardia;
    if (g && g.permisos && g.permisos.length && !g.puede('snippet.editar_sistema')) return false;
    return true;
  } catch (e) { return false; }
};
M.enElEditor = M.hayEditorDetras;   // el nombre viejo sigue valiendo (lo usan las pruebas)

// El rótulo dice a dónde lleva. Se puede cambiar sin miedo porque la identidad del botón es su
// `data-osd`, no su texto (lo pone `M.boton`) — al revés que en los botones de `game.osd` a pelo.
M.textoSalir = function () { return M.hayEditorDetras() ? 'IR AL EDITOR' : 'SALIR'; };

M.salir = function () {
  if (!M.hayEditorDetras()) { location.href = '/'; return true; }
  // Cerrar la pantalla ANTES que el Mundo: al revés queda la capa OSD encima del editor, sin nada
  // debajo que la cierre.
  try { G.osd.cerrar(); } catch (e) {}
  closeWorld();     // ⛔ sin `location.href`: la URL /map/<x> ES lo que hace posible la vuelta
  return true;
};
// ==FIN-SALIR-AL-EDITOR=='''


def main():
    with open(SNIP, encoding='utf-8') as f:
        doc = json.load(f)
    code = doc['code']
    if MARCA in code:
        print('ya estaba en v2; nada que hacer')
    else:
        i = code.index(INI)
        i = code.rfind('\n', 0, i) + 1
        sangria = ''
        j = code.index(FIN) + len(FIN)
        doc['code'] = code[:i] + NUEVO.replace('\n', '\n' + sangria) + code[j:]
        fd, tmp = tempfile.mkstemp(dir=os.path.dirname(SNIP), suffix='.tmp')
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            json.dump(doc, f, ensure_ascii=False, indent=2)
        os.replace(tmp, SNIP)
        print('parcheado %s (bloque SALIR-AL-EDITOR → v2)' % SNIP)

    if '--publicar' in sys.argv:
        tok = ''
        try:
            with open('/root/voxelforge.env', encoding='utf-8') as f:
                for ln in f:
                    if ln.startswith('VOXELFORGE_TOKEN='):
                        tok = ln.split('=', 1)[1].strip()
        except OSError:
            pass
        req = urllib.request.Request(
            'http://localhost:8500/api/snippets',
            data=json.dumps(doc, ensure_ascii=False).encode('utf-8'),
            headers={'Content-Type': 'application/json', 'X-VoxelForge-Token': tok},
            method='POST')
        with urllib.request.urlopen(req, timeout=60) as r:
            print('publicado:', r.read().decode('utf-8')[:200])


if __name__ == '__main__':
    main()
