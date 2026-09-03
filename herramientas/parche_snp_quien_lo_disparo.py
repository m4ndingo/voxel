#!/usr/bin/env python3
# @area: snippets
#
# REQ-IMPACTO3 · QUIEN lo disparo va EN LA FICHA.
#
# EL PORQUE, del dueño y a la primera (2026-09-03): «cuando se llama a coger no se sabe si se cogio
# por un flechazo o al pasar por encima (siempre dice flechazo)». Tenia razon y era un defecto de
# diseño mio: `alImpactar:'coger'` reusa el MISMO `alCoger` que la recogida por proximidad, que es
# justo lo que se queria (un snippet colgado de uno vale para el otro sin tocar una linea)… pero la
# ficha no decia cual de los dos disparadores habia sido, asi que el snippet solo podia adivinar.
#
# `alRomper` tenia el mismo agujero y no lo habia visto: lo llaman el PICO (`mcBreak`), el IMPACTO
# (`game.bloques.impacto`) y el borrado EN MASA (`avisoDeRotura`, la TNT), y los tres llegaban
# indistinguibles. Se arregla de paso, porque es exactamente el mismo fallo y se toca el mismo sitio.
#
# EL VOCABULARIO (una palabra, no un objeto: se lee de un vistazo en un `if`):
#   por: 'cuerpo'   te acercaste andando          (REQ-COGER1)
#   por: 'pico'     lo rompiste con el pico
#   por: 'impacto'  algo choco contra ello        (la flecha, y lo que venga despues)
#   por: 'masa'     lo borro un barrido           (la explosion de TNT)
#
# Y con 'impacto' viaja ademas lo que declaro quien choca: `info.fuente` ('flecha'), `golpe` y `de`,
# y el `punto` exacto. Asi el snippet puede decir «rota de un flechazo» o «recogida al pasar» sin
# preguntarle nada al motor.
#
# ⛔ ADITIVO: no se quita ni se renombra un solo campo de la ficha de siempre. Un `alRomper` escrito
#    antes de esto sigue recibiendo lo mismo que recibia y no se entera.
#
# ⛔ Idempotente y POR ANCLA. Publica por `POST /api/snippets`. Toca DOS snippets:
#    `mundo-autoarranque` (el vocabulario) y `flecha-arco` (su respaldo, para que diga 'impacto' y
#    no 'masa' cuando cae por el camino de compatibilidad).
#
# ⛔ `dispararAlCoger` y su llamada estan DUPLICADAS (dos copias vivas de la zona ==AL-COGER==,
#    anterior a este trabajo): sus anclas esperan 2 y se sustituyen las dos.
#
#     python3 herramientas/parche_snp_quien_lo_disparo.py --comprobar
#     python3 herramientas/parche_snp_quien_lo_disparo.py
import argparse
import json
import sys
import urllib.request

SITIO = 'http://127.0.0.1:8500'

# ════ mundo-autoarranque ═════════════════════════════════════════════════════════════════════════

# ── A · alCoger: la ficha admite contexto ────────────────────────────────────────────────────────
A_VIEJO = """  function dispararAlCoger(cfg, b) {
    try {
      return cfg.alCoger({ x: b.x, y: b.y, z: b.z, ori: b.ori, clave: b.clave,
                           claveExacta: b.claveExacta, tipo: b.tipo, cfg: cfg });
"""
A_NUEVO = """  // REQ-IMPACTO3 · `ctx` dice QUIEN lo disparo (`por`) y lo que ese quien quiera contar (`info`).
  // ⛔ Aditivo: los campos de siempre se ponen primero y `ctx` solo añade, nunca pisa lo que ya
  // habia. Sin `ctx`, `por` llega null y la ficha es identica a la de antes.
  function dispararAlCoger(cfg, b, ctx) {
    try {
      var f = { x: b.x, y: b.y, z: b.z, ori: b.ori, clave: b.clave,
                claveExacta: b.claveExacta, tipo: b.tipo, cfg: cfg, por: null, info: null };
      if (ctx) { for (var kk in ctx) f[kk] = ctx[kk]; }
      return cfg.alCoger(f);
"""

# ── B · alRomper: lo mismo ───────────────────────────────────────────────────────────────────────
B_VIEJO = """      return cfg.alRomper({ x: b.x, y: b.y, z: b.z, ori: b.ori, clave: b.clave,
                     claveExacta: b.claveExacta, tipo: b.tipo, cfg: cfg });"""
B_NUEVO = """      var f = { x: b.x, y: b.y, z: b.z, ori: b.ori, clave: b.clave,
                claveExacta: b.claveExacta, tipo: b.tipo, cfg: cfg, por: null, info: null };
      if (ctx) { for (var kk in ctx) f[kk] = ctx[kk]; }
      return cfg.alRomper(f);"""

B2_VIEJO = """  function dispararAlRomper(b) {"""
B2_NUEVO = """  function dispararAlRomper(b, ctx) {"""

# ── C · quien lo llama se identifica ─────────────────────────────────────────────────────────────
C_VIEJO = """      dispararAlCoger(it.cfg, it.b);"""
C_NUEVO = """      dispararAlCoger(it.cfg, it.b, { por: 'cuerpo' });"""

D_VIEJO = """      var p = dispararAlRomper(blanco);"""
D_NUEVO = """      var p = dispararAlRomper(blanco, { por: 'pico' });"""

E_VIEJO = """        res.accion = 'romper';
        res.valor = dispararAlRomper(b);"""
E_NUEVO = """        res.accion = 'romper';
        res.valor = dispararAlRomper(b, { por: 'impacto', info: info || null,
                                          golpe: n, de: cfg.impactos, punto: [px, py, pz] });"""

F_VIEJO = """        res.accion = 'coger';
        res.valor = dispararAlCoger(cfg, b);"""
F_NUEVO = """        res.accion = 'coger';
        res.valor = dispararAlCoger(cfg, b, { por: 'impacto', info: info || null,
                                              golpe: n, de: cfg.impactos, punto: [px, py, pz] });"""

# ── G · el borrado en masa (TNT) y el respaldo de la flecha ──────────────────────────────────────
# `avisoDeRotura` la usan DOS: la explosion de TNT y el camino de compatibilidad de la flecha. Como
# el aviso se pide antes y se da despues, quien lo pide es el unico que sabe por que fue: se lo
# lleva en el parametro. Por defecto 'masa', que es para lo que nacio (REQ-TNT1).
G_VIEJO = """    avisoDeRotura: function (x, y, z) {"""
G_NUEVO = """    avisoDeRotura: function (x, y, z, por) {"""

H_VIEJO = """        return dispararAlRomper(b);"""
H_NUEVO = """        return dispararAlRomper(b, { por: por || 'masa' });"""

CAMBIOS_MUNDO = [
    ('A · alCoger acepta contexto', A_VIEJO, A_NUEVO, 2),
    ('B · alRomper acepta contexto', B_VIEJO, B_NUEVO, 1),
    ('B2 · …y su firma', B2_VIEJO, B2_NUEVO, 1),
    ("C · recogerCercanos → por:'cuerpo'", C_VIEJO, C_NUEVO, 2),
    ("D · el pico → por:'pico'", D_VIEJO, D_NUEVO, 1),
    ("E · impacto/romper → por:'impacto' (+info, golpe, de, punto)", E_VIEJO, E_NUEVO, 1),
    ("F · impacto/coger → por:'impacto' (+info, golpe, de, punto)", F_VIEJO, F_NUEVO, 1),
    ('G · avisoDeRotura recibe el porque', G_VIEJO, G_NUEVO, 1),
    ("H · …y lo pasa (por defecto 'masa': la TNT)", H_VIEJO, H_NUEVO, 1),
]

# ════ flecha-arco ════════════════════════════════════════════════════════════════════════════════
# Su respaldo de compatibilidad tambien es un impacto, no un barrido: que lo diga.
I_VIEJO = """              avisaRotura = game.bloques.avisoDeRotura(hitCell[0], hitCell[1], hitCell[2]);"""
I_NUEVO = """              avisaRotura = game.bloques.avisoDeRotura(hitCell[0], hitCell[1], hitCell[2], 'impacto');"""

CAMBIOS_FLECHA = [
    ("I · el respaldo de la flecha tambien dice por:'impacto'", I_VIEJO, I_NUEVO, 1),
]

TRABAJO = [('mundo-autoarranque', CAMBIOS_MUNDO), ('flecha-arco', CAMBIOS_FLECHA)]


def pide(url, cuerpo=None):
    pet = urllib.request.Request(url, data=cuerpo, method='POST' if cuerpo else 'GET',
                                 headers={'Content-Type': 'application/json'} if cuerpo else {})
    with urllib.request.urlopen(pet, timeout=20) as r:
        return json.loads(r.read().decode('utf-8') or '{}')


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--comprobar', action='store_true')
    p.add_argument('--sitio', default=SITIO)
    a = p.parse_args()

    pendientes = []
    for sid, cambios in TRABAJO:
        snip = pide('%s/api/snippets/%s' % (a.sitio, sid))
        code = snip.get('code') or ''
        if not code:
            print('⛔ «%s» no tiene codigo (¿servidor levantado?)' % sid)
            return 1
        print('· %s' % sid)
        nuevo, hechos = code, []
        for que, viejo, bueno, veces in cambios:
            # ⚠️ Un cambio que BORRA (bueno == '') no se puede detectar por «ya esta el nuevo»:
            # se detecta por «ya no esta el viejo».
            if bueno and bueno in nuevo:
                print('    ya estaba · %s' % que)
                continue
            n = nuevo.count(viejo)
            if not bueno and n == 0:
                print('    ya estaba · %s' % que)
                continue
            if n != veces:
                print('  ⛔ el ancla de «%s» aparece %d veces (esperaba %d).\n'
                      '     el snippet ha cambiado debajo: no toco NADA.' % (que, n, veces))
                return 2
            nuevo = nuevo.replace(viejo, bueno)
            hechos.append(que)
        for q in hechos:
            print('    cambio    · %s' % q)
        if hechos:
            pendientes.append((sid, snip, code, nuevo))
        else:
            print('    nada que hacer.')

    if not pendientes:
        return 0
    if a.comprobar:
        print('\n--comprobar: no se publica nada.')
        return 0
    for sid, snip, code, nuevo in pendientes:
        pide('%s/api/snippets' % a.sitio,
             json.dumps({'id': sid, 'name': snip.get('name') or sid,
                         'code': nuevo}).encode('utf-8'))
        print('✓ «%s» publicado (%d → %d chars).' % (sid, len(code), len(nuevo)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
