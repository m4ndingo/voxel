#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""BUG-AG19 (3/3) · Que la espada de demo deje de decir «al aire» teniendo el bicho delante.

El `c` de `game.herramientas` habla de CELDAS y MATERIALES; un agente articulado no es ninguna de
las dos cosas, así que la demo solo miraba `mc.agents` (los NPC-cubo) y `c.clave`. Ahora pregunta
primero por `game.esqueletos.enLaMira()`, que dice a QUIÉN, en qué PIEZA y en qué VOXEL de su dibujo
ha caído el tajo — que es lo que el dueño pidió saber, más que la acción en sí.

Idempotente; publica por POST /api/snippets y cae al fichero si el servidor no está en pie.
"""
import json, os, sys, urllib.request, urllib.error

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUTA = os.path.join(RAIZ, 'data', 'snippets', 'herramienta-espada.json')
API = os.environ.get('VOXEL_API', 'http://localhost:8500')
MARCA = 'game.esqueletos.enLaMira'

VIEJO = """  izquierdo(c){
    game.espada.golpes++;
    // Bichos al alcance: `mc.agents` es el mapa de NPC-cubo. Solo se MIRAN, no se les toca.
    const cerca = [];
    for(const a of mc.agents.values()){
      const d = Math.hypot(a.x - c.pos[0], a.y - c.pos[1], a.z - c.pos[2]);
      if(d <= 3.5) cerca.push((a.name || a.id) + ' a ' + d.toFixed(1));
    }
    if(cerca.length) toast('\U0001f5e1️ ¡Tajo! alcanzas a ' + cerca.join(', '));
    else if(c.clave)  toast('\U0001f5e1️ Tajo #' + game.espada.golpes + ' sobre ' + c.clave + ' en ' + c.celda.join(','));
    else              toast('\U0001f5e1️ Tajo #' + game.espada.golpes + ' al aire');
  },"""

NUEVO = """  izquierdo(c){
    game.espada.golpes++;
    // ── 1º: ¿un agente ARTICULADO? ────────────────────────────────────────────────────────────
    // `c` habla de celdas y materiales, y una pieza de agente no es ni una cosa ni la otra: es una
    // estructura efímera que el rig mueve por matriz, sin voxel en el mundo. Por eso hay que
    // preguntar a la librería, que además dice DÓNDE ha caído: `local` es el voxel dentro del
    // dibujo de la pieza (índices del editor) y `alto` esa misma altura en 0..1, ya masticada.
    // Ahí es donde iría el efecto de la herramienta, sea un tajo o una margarita.
    const h = (window.game && game.esqueletos && game.esqueletos.enLaMira) ? game.esqueletos.enLaMira() : null;
    if(h){
      const zona = h.alto > 0.75 ? 'en lo alto' : (h.alto < 0.3 ? 'abajo' : 'a media altura');
      toast('\U0001f5e1️ Tajo #' + game.espada.golpes + ' a ' + h.texto + ' · ' + zona
            + ' (voxel ' + h.local.join(',') + ' de ' + h.dim.join('×') + ')');
      return;
    }
    // ── 2º: los NPC-cubo. `mc.agents` es otro mundo (1×1×1, sin piezas). Solo se MIRAN.
    const cerca = [];
    for(const a of mc.agents.values()){
      const d = Math.hypot(a.x - c.pos[0], a.y - c.pos[1], a.z - c.pos[2]);
      if(d <= 3.5) cerca.push((a.name || a.id) + ' a ' + d.toFixed(1));
    }
    if(cerca.length) toast('\U0001f5e1️ ¡Tajo! alcanzas a ' + cerca.join(', '));
    else if(c.clave)  toast('\U0001f5e1️ Tajo #' + game.espada.golpes + ' sobre ' + c.clave + ' en ' + c.celda.join(','));
    else              toast('\U0001f5e1️ Tajo #' + game.espada.golpes + ' al aire');
  },"""


def aplicar():
    if not os.path.exists(RUTA):
        print('Error: no existe %s' % RUTA, file=sys.stderr); return False
    with open(RUTA, 'r', encoding='utf-8') as f:
        data = json.load(f)
    code = data.get('code', '')

    if MARCA in code:
        print('Ya aplicado: no se toca nada.'); return True

    n = code.count(VIEJO)
    if n != 1:
        print('Error: el ancla «izquierdo(c)» aparece %d veces (esperaba 1). Nada escrito.' % n,
              file=sys.stderr)
        return False
    data['code'] = code.replace(VIEJO, NUEVO, 1)

    cuerpo = json.dumps(data, ensure_ascii=False).encode('utf-8')
    req = urllib.request.Request(API + '/api/snippets', data=cuerpo, method='POST',
                                 headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            r.read()
        print('Publicado por POST /api/snippets · la espada ya nombra al agente articulado (BUG-AG19)')
        return True
    except (urllib.error.URLError, OSError) as e:
        print('Servidor no disponible (%s); escribiendo el fichero.' % e, file=sys.stderr)
        tmp = RUTA + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False)
        os.replace(tmp, RUTA)
        print('Escrito %s (BUG-AG19)' % RUTA)
        return True


if __name__ == '__main__':
    sys.exit(0 if aplicar() else 1)
