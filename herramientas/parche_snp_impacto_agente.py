#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""BUG-AG19 (2/2) · «¿A quién le acabo de dar, y DÓNDE?» para las herramientas de snippet.

Con `parche_snp_apuntar_agente.py` el rayo de la mira YA se para en un agente articulado. Falta que
la herramienta pueda preguntarlo: el `c` que recibe `izquierdo(c)` trae la celda y el material, y
una pieza de agente no es ni una cosa ni la otra (es una estructura efímera), así que la espada
seguía anunciando «al aire».

Se resuelve en la LIBRERÍA (§ Agentes, orden 1), sin tocar `app.js`: `game.esqueletos` gana dos
métodos que devuelven la misma ficha —

    game.esqueletos.enLaMira()        → lo que hay en el punto de mira AHORA
    game.esqueletos.enPunto(x,y,z)    → lo que hay en ese punto del mundo

    { id, nombre, agente, agenteId, pieza, texto, punto, dist, local, dim, alto, rig, s, parte }

`local` es lo que pidió el dueño: el voxel DENTRO del dibujo de la pieza donde ha caído la acción
(índices del editor, no del mundo), con `dim` para escalarlo y `alto` (0..1) ya masticado. Da igual
que la acción sea un tajo o plantar una margarita: lo que importa es saber el sitio.

Idempotente; publica por POST /api/snippets (papelera + escritura atómica) y cae al fichero si el
servidor no está en pie.
"""
import json, os, sys, urllib.request, urllib.error

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUTA = os.path.join(RAIZ, 'data', 'snippets', 'mundo-autoarranque.json')
API = os.environ.get('VOXEL_API', 'http://localhost:8500')
MARCA = 'function impactoEnLaMira()'

# ── 1. el mismo rayo, pero contando ADEMÁS dónde toca ──────────────────────────────────────────
A_VIEJO = """  function piezaDeAgenteEnLaMira() {
    if (typeof mc === 'undefined' || !mc.pos || !mc.structures || !mc.structures.length) return null;
    if (typeof mcStructAt !== 'function' || typeof mcFineSolidAt !== 'function') return null;
    var T = MC_T, esc = num(mc.scale, 1);
    var oy = mc.pos[1] + (typeof MC_EYE === 'number' ? MC_EYE : 1.62) * esc;
    var cp = Math.cos(mc.pitch || 0);
    var dx = -Math.sin(mc.yaw || 0) * cp, dy = Math.sin(mc.pitch || 0), dz = -Math.cos(mc.yaw || 0) * cp;
    var maxd = (typeof mcReach === 'function') ? mcReach() : 6 * esc, paso = 1 / T;
    for (var t = paso; t <= maxd; t += paso) {
      var px = mc.pos[0] + dx * t, py = oy + dy * t, pz = mc.pos[2] + dz * t;
      if (mcFineSolidAt(Math.floor(px * T), Math.floor(py * T), Math.floor(pz * T))) {
        var s = mcStructAt(px, py, pz);
        if (s) return s._rig ? s : null;                  // lo PRIMERO que se toca manda
      }
      if (py >= 0 && typeof mcSolid === 'function'
        && mcSolid(Math.floor(px), Math.floor(py), Math.floor(pz))) return null;
    }
    return null;
  }
"""
A_NUEVO = """  // El rayo es EL MISMO de siempre; lo unico que cambia es que ahora tambien devuelve el punto y la
  // distancia, porque una herramienta de snippet no solo quiere saber a quien le da: quiere saber
  // DONDE le da (BUG-AG19). `piezaDeAgenteEnLaMira` se queda como estaba, encima de esto.
  function impactoEnLaMira() {
    if (typeof mc === 'undefined' || !mc.pos || !mc.structures || !mc.structures.length) return null;
    if (typeof mcStructAt !== 'function' || typeof mcFineSolidAt !== 'function') return null;
    var T = MC_T, esc = num(mc.scale, 1);
    var oy = mc.pos[1] + (typeof MC_EYE === 'number' ? MC_EYE : 1.62) * esc;
    var cp = Math.cos(mc.pitch || 0);
    var dx = -Math.sin(mc.yaw || 0) * cp, dy = Math.sin(mc.pitch || 0), dz = -Math.cos(mc.yaw || 0) * cp;
    var maxd = (typeof mcReach === 'function') ? mcReach() : 6 * esc, paso = 1 / T;
    for (var t = paso; t <= maxd; t += paso) {
      var px = mc.pos[0] + dx * t, py = oy + dy * t, pz = mc.pos[2] + dz * t;
      if (mcFineSolidAt(Math.floor(px * T), Math.floor(py * T), Math.floor(pz * T))) {
        var s = mcStructAt(px, py, pz);
        if (s) return s._rig ? { s: s, punto: [px, py, pz], dist: t } : null;   // lo PRIMERO que se toca manda
      }
      if (py >= 0 && typeof mcSolid === 'function'
        && mcSolid(Math.floor(px), Math.floor(py), Math.floor(pz))) return null;
    }
    return null;
  }
  function piezaDeAgenteEnLaMira() {
    var i = impactoEnLaMira();
    return i ? i.s : null;
  }

  // De un punto del mundo al voxel DENTRO del dibujo de la pieza. Es la misma vuelta por la inversa
  // de la matriz que hace `envAt` para poder romper la pieza donde SE VE; aqui no se usa para
  // decidir nada, sino para contarlo: «le has dado en lo alto de la cabeza» o «planta la margarita
  // en este voxel de su hombro». En indices del dibujo (los del editor), no del mundo.
  //
  // ⚠️ mcStructColl esta ENVUELTA y devuelve null para las piezas de un rig que no son la raiz (su
  // ancla esta vacia a proposito): hay que preguntarle al original.
  function localDeLaPieza(s, punto) {
    if (!s || !punto || typeof mcStructColl !== 'function') return null;
    var crudo = mcStructColl._seguir ? mcStructColl._orig : mcStructColl;
    var g = crudo(s);
    if (!g || !g.fdim) return null;
    var T = MC_T, d = g.fdim, E = s.esc || 1, px = punto[0], py = punto[1], pz = punto[2], lx, ly, lz;
    if (s.model) {
      var m = s.model, ux = px * T - m[12] * T, uy = py * T - m[13] * T, uz = pz * T - m[14] * T;
      lx = Math.floor((m[0] * ux + m[1] * uy + m[2] * uz - s.ox * T) / E);
      ly = Math.floor((m[4] * ux + m[5] * uy + m[6] * uz - s.oy * T) / E);
      lz = Math.floor((m[8] * ux + m[9] * uy + m[10] * uz - s.oz * T) / E);
    } else {
      lx = Math.floor((Math.floor(px * T) - s.ox * T) / E);
      ly = Math.floor((Math.floor(py * T) - s.oy * T) / E);
      lz = Math.floor((Math.floor(pz * T) - s.oz * T) / E);
    }
    if (lx < 0 || ly < 0 || lz < 0 || lx >= d[0] || ly >= d[1] || lz >= d[2]) return null;
    return { voxel: [lx, ly, lz], dim: [d[0], d[1], d[2]], alto: (d[1] > 1) ? (ly / (d[1] - 1)) : 0 };
  }

  // La ficha completa del impacto. `texto` sale de `senas`, el mismo que ya usan el atasco y el
  // golpe, para que el mundo entero nombre al bicho igual: «la «cabeza» de Zombie (#1)».
  function fichaImpacto(s, punto) {
    var rig = s && s._rig;
    if (!rig) return null;
    var ps = rig.partes || [], pieza = null, P = null;
    for (var i = 0; i < ps.length; i++) if (ps[i].s === s) { pieza = ps[i].nombre; P = ps[i]; }
    var loc = localDeLaPieza(s, punto);
    return {
      id: rig.id || 0, nombre: rig.nombre, agente: rig.nombre, agenteId: rig.id || 0,
      pieza: pieza || 'una pieza',
      texto: senas(rig, pieza ? '\\u00ab' + pieza + '\\u00bb' : 'una pieza').texto,
      punto: punto ? [punto[0], punto[1], punto[2]] : null, dist: 0,
      local: loc ? loc.voxel : null, dim: loc ? loc.dim : null, alto: loc ? loc.alto : null,
      quitado: !!rig.quitado, rig: rig, s: s, parte: P
    };
  }
"""

# ── 2. los dos métodos nuevos, junto a `lista` ─────────────────────────────────────────────────
B_VIEJO = """    lista: esqueletos_,
"""
B_NUEVO = """    lista: esqueletos_,
    // BUG-AG19 · A quien le esta apuntando (o dando) la herramienta, y en que punto de su dibujo.
    // Existe porque el `c` de `game.herramientas` habla de CELDAS y MATERIALES, y una pieza de
    // agente no es ninguna de las dos cosas: es una estructura efimera que el rig mueve por matriz.
    // Sin esto una espada solo sabe decir «al aire» teniendo el bicho delante.
    //   const h = game.esqueletos.enLaMira();
    //   if (h) toast('tajo a ' + h.texto + ' · voxel ' + h.local.join(',') + ' (alto ' + h.alto.toFixed(2) + ')');
    enLaMira: function () {
      var i = impactoEnLaMira();
      if (!i) return null;
      var f = fichaImpacto(i.s, i.punto);
      if (f) f.dist = i.dist;
      return f;
    },
    // La misma ficha para un punto cualquiera del mundo: sirve para `c.punto` de una herramienta,
    // para una explosion o para preguntar por donde va la mano de otro agente. Acepta (x,y,z) o
    // un array de tres.
    enPunto: function (x, y, z) {
      if (typeof mcStructAt !== 'function') return null;
      var p = (x && x.length >= 3) ? [+x[0], +x[1], +x[2]] : [+x, +y, +z];
      if (!isFinite(p[0]) || !isFinite(p[1]) || !isFinite(p[2])) return null;
      var s = mcStructAt(p[0], p[1], p[2]);
      return (s && s._rig) ? fichaImpacto(s, p) : null;
    },
"""

CAMBIOS = [('impactoEnLaMira', A_VIEJO, A_NUEVO), ('api enLaMira/enPunto', B_VIEJO, B_NUEVO)]


def aplicar():
    if not os.path.exists(RUTA):
        print('Error: no existe %s' % RUTA, file=sys.stderr); return False
    with open(RUTA, 'r', encoding='utf-8') as f:
        data = json.load(f)
    code = data.get('code', '')

    if MARCA in code:
        print('Ya aplicado (impactoEnLaMira ya existe): no se toca nada.'); return True

    for nombre, viejo, nuevo in CAMBIOS:
        n = code.count(viejo)
        if n != 1:
            print('Error: el ancla «%s» aparece %d veces (esperaba 1). Nada escrito.' % (nombre, n),
                  file=sys.stderr)
            return False
        code = code.replace(viejo, nuevo, 1)

    data['code'] = code
    cuerpo = json.dumps(data, ensure_ascii=False).encode('utf-8')
    req = urllib.request.Request(API + '/api/snippets', data=cuerpo, method='POST',
                                 headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            r.read()
        print('Publicado por POST /api/snippets · game.esqueletos.enLaMira()/.enPunto() (BUG-AG19)')
        return True
    except (urllib.error.URLError, OSError) as e:
        print('Servidor no disponible (%s); escribiendo el fichero.' % e, file=sys.stderr)
        tmp = RUTA + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False)
        os.replace(tmp, RUTA)
        print('Escrito %s · game.esqueletos.enLaMira()/.enPunto() (BUG-AG19)' % RUTA)
        return True


if __name__ == '__main__':
    sys.exit(0 if aplicar() else 1)
