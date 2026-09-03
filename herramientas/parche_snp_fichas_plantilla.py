# -*- coding: utf-8 -*-
"""REQ-PLANT2 · publica el snippet `fichas-plantilla`: sacar la foto de una ficha DESDE EL JUEGO.

El panel (`web/panel.html` → pestaña Plantillas) resuelve el caso «tengo la imagen en un fichero».
Esto resuelve el otro, que es el que de verdad se va a usar: **estoy dentro del bioma, esto se ve
precioso, quiero justo ESTO en la tarjeta**. Lo pidió el dueño: «también podría ser un snippet que
sirva para generar esas fichas».

Es un snippet y no motor porque no hace falta nada del motor: `mcRender()` y `mc.canvas` ya están al
alcance de cualquier snippet (corren con `AsyncFunction` en ámbito global), y la subida es el
`POST /api/panel/plantilla/foto` que ya existe. Cero líneas de `app.js`.

⛔ NO se engancha a ningún autoarranque: es una herramienta del dueño, no algo que deba correr en el
navegador de cada visitante. Se carga a mano cuando se necesita:

    await game.snippet('fichas-plantilla')
    game.fichas.lista()          // qué fichas hay y a cuál le falta foto
    game.fichas.retrato()        // la del mapa en el que estoy
    game.fichas.retrato('construye-badlands')

    python3 herramientas/parche_snp_fichas_plantilla.py            # contra localhost:8500
    VOXEL_URL=http://localhost:8577 python3 herramientas/parche_snp_fichas_plantilla.py
"""

import json
import os
import sys
import urllib.error
import urllib.request

BASE = os.environ.get('VOXEL_URL', 'http://localhost:8500')
SID = 'fichas-plantilla'

CODIGO = r'''// fichas-plantilla · REQ-PLANT2 · la foto de una tarjeta del carrusel, sacada desde dentro.
//
// `game.fichas.retrato()` fotografía lo que se está viendo, lo recorta a proporción de teléfono
// (9:16, que es como se pinta la tarjeta) y lo sube como foto de esa plantilla. Sin ficheros, sin
// copiar nada a mano y encuadrando con el propio juego, que es la mejor cámara que hay aquí.
//
// ⚠️⚠️ LA CAPTURA ES SÍNCRONA Y VA PEGADA AL `mcRender()`. El canvas del Mundo se crea SIN
// `preserveDrawingBuffer` (app.js:5425), así que el buffer se descarta al cerrar el fotograma:
// leerlo detrás de un `await`, un `setTimeout` o un `requestAnimationFrame` devuelve NEGRO. Es la
// misma regla que ya sigue `mcFoto` (app.js:20293) y la que rompe a todo el que lo intenta por su
// cuenta. Por eso `dibuja()` no tiene un solo `await` dentro.
//
// ⚠️ Pide `panel.usar`: la que escribe es la ruta del panel. Un jugador recibe 403 y se le dice.

(function () {
  const ANCHO = 720, ALTO = 1280;              // 9:16 — lo que mide la tarjeta del asistente
  const CALIDAD = 0.86;                        // JPEG: una foto de bioma en PNG son 2 MB para nada

  function dibuja() {
    if (typeof mc === 'undefined' || !mc.active || !mc.gl) throw new Error('abre el Mundo primero');
    mcRender();                                // fotograma fresco: lo de abajo lee ESTE buffer
    const cv = mc.canvas;
    // El recorte 9:16 más grande que cabe, centrado: se conserva lo que el dueño tiene en la mira.
    let w = cv.height * 9 / 16, h = cv.height;
    if (w > cv.width) { w = cv.width; h = cv.width * 16 / 9; }
    const out = document.createElement('canvas');
    out.width = ANCHO; out.height = ALTO;
    const ctx = out.getContext('2d');
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(cv, (cv.width - w) / 2, (cv.height - h) / 2, w, h, 0, 0, ANCHO, ALTO);
    return out.toDataURL('image/jpeg', CALIDAD);
  }

  async function catalogo() {
    const r = await fetch('/api/panel/plantillas', { cache: 'no-store' });
    if (!r.ok) throw new Error('el panel de plantillas contesta ' + r.status +
                               (r.status === 403 || r.status === 401 ? ' (esto pide «panel.usar»)' : ''));
    return (await r.json()).plantillas || [];
  }

  // Sin argumento: la plantilla con la que se generó ESTE mapa. Es lo natural — se entra al mundo,
  // se busca el sitio bonito y se dispara — y evita teclear un id con erratas («construye-monta-as»).
  async function deEsteMapa() {
    const slug = (typeof mcMapName === 'function' ? mcMapName() : '') || 'default';
    const r = await fetch('/api/mundos/' + encodeURIComponent(slug) + '/plantilla', { cache: 'no-store' });
    if (!r.ok) return '';
    const j = await r.json();
    return j.plantilla || j.especial && (j.especial === 'terreno' ? 'terreno-base' : 'vacio') || '';
  }

  const api = {
    async lista() {
      const c = await catalogo();
      console.table(c.map(function (p) {
        return { ficha: p.id, titulo: p.ficha.titulo, foto: p.foto || '— sin foto —' };
      }));
      return c;
    },

    async retrato(idd) {
      idd = idd || await deEsteMapa();
      if (!idd) throw new Error('este mapa no se hizo con una plantilla: dime cuál, ' +
                                'p.ej. game.fichas.retrato("construye-badlands")');
      const c = await catalogo();
      if (!c.some(function (p) { return p.id === idd; })) {
        throw new Error('no hay ninguna ficha «' + idd + '». Mira game.fichas.lista()');
      }
      // ⛔ El `dibuja()` va AQUÍ, después de todos los await y antes del siguiente: ver la nota de
      // arriba. Si se sube a la primera línea de la función, la foto sale negra.
      const dato = dibuja();
      const r = await fetch('/api/panel/plantilla/foto', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: idd, dato: dato })
      });
      const j = await r.json().catch(function () { return {}; });
      if (!r.ok) throw new Error(j.error || ('no se ha podido subir (' + r.status + ')'));
      const kb = Math.round(dato.length * 3 / 4 / 1024);
      try { toast('🖼️ ' + idd + ' ya tiene foto (' + kb + ' KB)', 3); } catch (e) {}
      console.log('[fichas-plantilla] ' + idd + ' → ' + j.r + '  (' + kb + ' KB)');
      return j.r;
    },

    // Ver el recorte antes de subirlo, que es lo que uno quiere la segunda vez.
    prueba() {
      const u = dibuja();
      const v = window.open('');
      if (v) v.document.write('<img src="' + u + '" style="height:100vh">');
      return u;
    },

    // No envuelve nada del motor, así que apagarlo es soltar el objeto. Se deja por la ley de oro:
    // todo lo que se enciende tiene que poder devolverse.
    off() { try { delete game.fichas; } catch (e) { game.fichas = undefined; } return true; }
  };

  game.fichas = api;
  console.log('[fichas-plantilla] listo · game.fichas.lista() · game.fichas.prueba() · game.fichas.retrato()');
})();
'''


def publica(doc):
    datos = json.dumps(doc, ensure_ascii=False).encode('utf-8')
    pet = urllib.request.Request(BASE + '/api/snippets', data=datos, method='POST',
                                 headers={'Content-Type': 'application/json'})
    tok = os.environ.get('VOXELFORGE_TOKEN')
    if tok:
        pet.add_header('X-VoxelForge-Token', tok)
    with urllib.request.urlopen(pet) as r:
        return json.loads(r.read() or b'{}')


def main():
    print(f'Snippet «{SID}» → {BASE}')
    doc = {'id': SID, 'name': 'Fichas de plantilla (foto desde el juego)',
           'categoria': 'herramientas', 'code': CODIGO}
    try:
        r = publica(doc)
    except urllib.error.HTTPError as e:
        print('  ⛔ ' + str(e) + ': ' + e.read().decode('utf-8', 'replace')[:200])
        return 1
    except urllib.error.URLError as e:
        print(f'  ⛔ no contesta {BASE}: {e}')
        return 1
    print(f'  ✓ publicado ({len(CODIGO)} B) · savedAt {r.get("savedAt", "?")}')
    print('  En el juego:  await game.snippet("fichas-plantilla")  →  game.fichas.retrato()')
    return 0


if __name__ == '__main__':
    sys.exit(main())
