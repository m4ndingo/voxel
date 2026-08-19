#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""BUG-AG19 · La espada da «al aire» contra un agente articulado.

El snippet ya envuelve tres sondas (mcStructColl, mcFineBoxHit, mcStructAt), pero NINGUNA de las
tres esta en el camino de APUNTAR, que es otro:

    mcRaycast(alcance, true) -> mcStructRayHit -> mcAimSolidAt -> mcAimBoxHit

y `mcAimBoxHit` pregunta por `mcStructColl(s)`, que para una pieza de rig devuelve null a proposito
(su ancla esta vacia: el rig la dibuja en otro sitio por su matriz). Resultado: el rayo de apuntar
atraviesa a todos los agentes articulados y se clava en el terreno de detras.

Este parche añade la CUARTA envoltura, `envAim` sobre `mcAimBoxHit`, reutilizando el `golpe()` que
ya sabe pasar la caja por la inversa de la matriz de la pieza — con un parametro `mirar` que cambia
lo justo: bitset de apuntar (`bitsAim`), las atravesables SI se apuntan, y la herramienta en la mano
no. El camino de la fisica (mirar = falso) queda byte a byte como estaba.

Escribe por POST /api/snippets si el servidor esta en pie (papelera + escritura atomica); si no,
cae al fichero. Idempotente: si ya esta aplicado, no toca nada.
"""
import json, os, sys, urllib.request, urllib.error

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUTA = os.path.join(RAIZ, 'data', 'snippets', 'mundo-autoarranque.json')
API = os.environ.get('VOXEL_API', 'http://localhost:8500')
MARCA = 'window.mcAimBoxHit = envAim'

# ── 1. el original de la sonda de apuntar, junto a los otros tres ──────────────────────────────
A_VIEJO = """    var origAt = (typeof mcStructAt === 'function') ? (mcStructAt._seguir ? mcStructAt._orig : mcStructAt) : null;
"""
A_NUEVO = """    var origAt = (typeof mcStructAt === 'function') ? (mcStructAt._seguir ? mcStructAt._orig : mcStructAt) : null;
    var origAim = (typeof mcAimBoxHit === 'function') ? (mcAimBoxHit._seguir ? mcAimBoxHit._orig : mcAimBoxHit) : null;
"""

# ── 2. golpe() aprende a mirar ─────────────────────────────────────────────────────────────────
B_VIEJO = """    var golpe = function (fx0, fy0, fz0, fx1, fy1, fz1) {
      var T = MC_T, ests = mc.structures;
      for (var i = 0; i < ests.length; i++) {
        var s = ests[i];
        var mueve = comoSeMueve(s);
        if (!mueve) continue;
        var cAtr = tabla[s.key]; if (cAtr && cAtr.atravesable) continue;
        var g = origColl(s); if (!g) continue;
"""
B_NUEVO = """    // `mirar` = la misma travesia pero con los ojos en vez de con el cuerpo (BUG-AG19). Tres
    // diferencias, ni una mas: se lee el bitset de APUNTAR, las atravesables NO se saltan (a la
    // hierba se le apunta aunque se la cruce, igual que hace `sinChoque` con las quietas) y la
    // herramienta que llevas en la mano no se apunta a si misma.
    var golpe = function (fx0, fy0, fz0, fx1, fy1, fz1, mirar) {
      var T = MC_T, ests = mc.structures;
      for (var i = 0; i < ests.length; i++) {
        var s = ests[i];
        var mueve = comoSeMueve(s);
        if (!mueve) continue;
        if (mirar) { if (s._isHeldTool) continue; }
        else { var cAtr = tabla[s.key]; if (cAtr && cAtr.atravesable) continue; }
        var g = origColl(s); if (!g) continue;
"""

# ── 3. el bitset se elige UNA vez por pieza, fuera del bucle caliente ──────────────────────────
C_VIEJO = """        if (x0 > x1 || y0 > y1 || z0 > z1) continue;
        for (var y = y0; y <= y1; y++) for (var z = z0; z <= z1; z++) {
          var row = (y * d[2] + z) * d[0];
          for (var x = x0; x <= x1; x++) if (g.bits[row + x]) return true;
        }
"""
C_NUEVO = """        if (x0 > x1 || y0 > y1 || z0 > z1) continue;
        // Fuera del bucle caliente a proposito: la fisica llama a esto varias veces por frame y por
        // eje, y no puede pagar un ternario por voxel.
        var bb = mirar ? (g.bitsAim || g.bits) : g.bits;
        for (var y = y0; y <= y1; y++) for (var z = z0; z <= z1; z++) {
          var row = (y * d[2] + z) * d[0];
          for (var x = x0; x <= x1; x++) if (bb[row + x]) return true;
        }
"""

# ── 4. la cuarta envoltura ─────────────────────────────────────────────────────────────────────
D_VIEJO = """    var envBox = function (fx0, fy0, fz0, fx1, fy1, fz1) {
      if (origBox(fx0, fy0, fz0, fx1, fy1, fz1)) return true;
      if (!nDesplazados && !nPosadas) return false;
      return golpe(fx0, fy0, fz0, fx1, fy1, fz1);
    };
"""
D_NUEVO = """    var envBox = function (fx0, fy0, fz0, fx1, fy1, fz1) {
      if (origBox(fx0, fy0, fz0, fx1, fy1, fz1)) return true;
      if (!nDesplazados && !nPosadas) return false;
      return golpe(fx0, fy0, fz0, fx1, fy1, fz1);
    };

    // 2.bis Y se le APUNTA donde se la ve. Chocar y apuntar son DOS caminos distintos en app.js:
    // el de la mira es mcRaycast(alcance, true) -> mcStructRayHit -> mcAimSolidAt -> mcAimBoxHit, y
    // ahi dentro `mcStructColl` de una pieza de rig es null, asi que el rayo la atravesaba entera y
    // se clavaba en el terreno de detras: la espada anunciaba «al aire» teniendo el bicho delante.
    var envAim = origAim && function (fx0, fy0, fz0, fx1, fy1, fz1) {
      if (origAim(fx0, fy0, fz0, fx1, fy1, fz1)) return true;
      if (!nDesplazados && !nPosadas) return false;
      return golpe(fx0, fy0, fz0, fx1, fy1, fz1, true);
    };
"""

# ── 5. registro ────────────────────────────────────────────────────────────────────────────────
E_VIEJO = """    if (envAt) { envAt._seguir = VERSION; envAt._orig = origAt; window.mcStructAt = envAt; }
"""
E_NUEVO = """    if (envAt) { envAt._seguir = VERSION; envAt._orig = origAt; window.mcStructAt = envAt; }
    if (envAim) { envAim._seguir = VERSION; envAim._orig = origAim; window.mcAimBoxHit = envAim; }
"""

CAMBIOS = [('origAim', A_VIEJO, A_NUEVO), ('golpe(mirar)', B_VIEJO, B_NUEVO),
           ('bitset fuera del bucle', C_VIEJO, C_NUEVO), ('envAim', D_VIEJO, D_NUEVO),
           ('registro', E_VIEJO, E_NUEVO)]


def aplicar():
    if not os.path.exists(RUTA):
        print('Error: no existe %s' % RUTA, file=sys.stderr); return False
    with open(RUTA, 'r', encoding='utf-8') as f:
        data = json.load(f)
    code = data.get('code', '')

    if MARCA in code:
        print('Ya aplicado (mcAimBoxHit ya se envuelve): no se toca nada.'); return True

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
        print('Publicado por POST /api/snippets · mcAimBoxHit envuelto (BUG-AG19)')
        return True
    except (urllib.error.URLError, OSError) as e:
        print('Servidor no disponible (%s); escribiendo el fichero.' % e, file=sys.stderr)
        tmp = RUTA + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False)
        os.replace(tmp, RUTA)
        print('Escrito %s · mcAimBoxHit envuelto (BUG-AG19)' % RUTA)
        return True


if __name__ == '__main__':
    sys.exit(0 if aplicar() else 1)
