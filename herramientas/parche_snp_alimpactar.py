#!/usr/bin/env python3
# @area: snippets
#
# REQ-IMPACTO1 · `alImpactar` + `impactos`: que algo CHOQUE contra una pieza pueda romperla.
#
# EL PORQUE (el dueño, 2026-09-03): «quiero que la flecha de la ballesta al impactar en un objeto
# pueda romper tambien objetos, pero con un evento llamado alImpactar que pueda decir que evento
# desencadena. por ejemplo al impactar podria desencadenar alRomper o alCoger, o bien JavaScript
# arbitrario, ademas para romper quiero poder indicar si sera necesario 1 impacto o mas».
#
# LO QUE HABIA: `flecha-arco` llamaba a `game.bloques.avisoDeRotura(x,y,z)` con la celda tocada, y
# si la celda tenia `alRomper` la borraba y lo disparaba. O sea: un solo evento, cableado a fuego en
# el proyectil, siempre de un golpe, y SOLO contra `mc.grid` — las estructuras finas (una ballesta en
# el suelo, una flor, un cable) las atravesaba sin enterarse.
#
# EL DISEÑO: `alImpactar` NO es un evento mas, es un DESPACHADOR — dice QUE evento desencadena:
#     alImpactar: 'romper'   → retira la pieza y dispara su alRomper
#     alImpactar: 'coger'    → dispara su alCoger, respetando su `consume`
#     alImpactar: function   → JS arbitrario, mismo contrato que alRomper/alCoger + datos del golpe
#     impactos: 3            → golpes necesarios; POR DEFECTO 1
#
# DONDE VIVE EL CONOCIMIENTO: todo aqui, en `game.bloques.impacto(x,y,z,info)`. El proyectil solo
# dice «he pasado por este punto»; no sabe de claves, ni de giros, ni de contadores. Asi el siguiente
# proyectil (una piedra, una bala) hereda el sistema entero sin escribir una linea de bloques.
#
# ⛔ EL ORDEN IMPORTA: se miran ESTRUCTURAS antes que la rejilla, igual que en `recogerCercanos`.
# Una pieza fina esta DENTRO de la celda de aire que la contiene; preguntar antes por la rejilla la
# haria invisible para siempre.
#
# ⛔ EL CONTADOR VIVE EN `mc`, NUNCA EN UN CLOSURE: `mundo-autoarranque` se reejecuta (es el
# autoarranque global, corre en todos los mapas) y un closure se llevaria por delante los golpes ya
# dados — un cristal a medio romper se curaria solo al recargar el snippet.
#
# ⛔ NO se toca `mcFineBoxHit`: la caja de una estructura la da `mcStructColl(s).fdim`, que es lo que
# ya usa `recogerCercanos`. `mcFineBoxHit` la extrae VERBATIM POR TEXTO `test_rayo_apuntado.js` y
# tocarla revienta ese test con ReferenceError.
#
# ⛔ Idempotente y POR ANCLA: no reescribe el fichero, sustituye sus anclas. Los cuatro anclajes se
# comprobaron unicos y FUERA del bloque `alCoger` duplicado que hay en este snippet (dos copias de
# `recogerCercanos`/`dispararAlCoger`; manda la segunda). Esa duplicacion es harina de otro costal.
#
#     python3 herramientas/parche_snp_alimpactar.py --comprobar
#     python3 herramientas/parche_snp_alimpactar.py
import argparse
import json
import sys
import urllib.request

SITIO = 'http://127.0.0.1:8500'
SNIP = 'mundo-autoarranque'

# ── A · normalizacion en define() ────────────────────────────────────────────────────────────────
A_VIEJO = """      consume: (cfg.consume !== false),
      // Continuo, no de flanco: lo que sostiene una placa de presion mientras la ocupas."""
A_NUEVO = """      consume: (cfg.consume !== false),
      // REQ-IMPACTO1 · que pasa cuando algo CHOCA contra la pieza (hoy la flecha; mañana cualquier
      // proyectil). No es un evento mas: es un DESPACHADOR, dice QUE evento desencadena.
      //   'romper'  → retira la pieza y dispara su alRomper
      //   'coger'   → dispara su alCoger, respetando su `consume`
      //   function  → JS a pelo, con el contrato de alRomper/alCoger + `golpe`, `de`, `punto`
      alImpactar: (typeof cfg.alImpactar === 'function') ? cfg.alImpactar
        : (cfg.alImpactar === 'romper' || cfg.alImpactar === 'coger') ? cfg.alImpactar : null,
      // Golpes que aguanta antes de desencadenar. Por defecto 1: un impacto basta, que es lo que
      // hacia la flecha antes de existir esto.
      impactos: Math.max(1, Math.round(num(cfg.impactos, 1))),
      // Continuo, no de flanco: lo que sostiene una placa de presion mientras la ocupas."""

# ── B · avisos de define(): un typo en alImpactar no puede quedarse mudo ─────────────────────────
B_VIEJO = """    if (!norm.trepable && !norm.alPisar && !norm.alRomper && !norm.alCoger && !norm.alSeguirPisando && !norm.impulso && !norm.velocidad && !norm.deslizamiento && !norm.mirar && !norm.seguir && !norm.atravesable && !norm.luzPasa && !norm.luzTapa && norm.recibeSombra && norm.proyectaSombra && !norm.viento) {
      console.warn('game.bloques.define("' + clave + '"): sin trepable, atravesable, luz, impulso, velocidad, deslizamiento, seguir, alPisar, alSeguirPisando, alRomper ni alCoger no hace nada.');"""
B_NUEVO = """    // Un 'rromper' o un 'Coger' se quedaria mudo: `alImpactar` valdria null y el dueño estaria
    // disparando flechas a un cristal que no se rompe sin saber por que.
    if (cfg.alImpactar !== undefined && !norm.alImpactar) {
      console.warn('game.bloques.define("' + clave + '"): alImpactar solo admite "romper", "coger" o una funcion; recibido '
        + JSON.stringify(cfg.alImpactar) + '. Se ignora.');
    }
    if (!norm.trepable && !norm.alPisar && !norm.alRomper && !norm.alCoger && !norm.alImpactar && !norm.alSeguirPisando && !norm.impulso && !norm.velocidad && !norm.deslizamiento && !norm.mirar && !norm.seguir && !norm.atravesable && !norm.luzPasa && !norm.luzTapa && norm.recibeSombra && norm.proyectaSombra && !norm.viento) {
      console.warn('game.bloques.define("' + clave + '"): sin trepable, atravesable, luz, impulso, velocidad, deslizamiento, seguir, alPisar, alSeguirPisando, alRomper, alCoger ni alImpactar no hace nada.');"""

# ── C · que game.bloques.info() lo cuente ────────────────────────────────────────────────────────
C_VIEJO = """    if (cfg.alCoger) partes.push('alCoger a ' + cfg.alcance + (cfg.consume ? '' : ' (no se lo lleva)'));"""
C_NUEVO = """    if (cfg.alCoger) partes.push('alCoger a ' + cfg.alcance + (cfg.consume ? '' : ' (no se lo lleva)'));
    if (cfg.alImpactar) partes.push('alImpactar → '
      + (typeof cfg.alImpactar === 'function' ? 'js' : cfg.alImpactar)
      + (cfg.impactos > 1 ? ' (' + cfg.impactos + ' impactos)' : ''));"""

# ── D · las dos APIs publicas, hermanas de avisoDeRotura ─────────────────────────────────────────
# ⛔ SON DOS A PROPOSITO, Y ESTO ES EL CORAZON DEL DISEÑO:
# `impactoEn` SONDEA (puro, sin efectos) y `impacto` DESPACHA (cuenta y rompe). Quien vuela avanza a
# subpasos de 0,2 bloques, o sea que pregunta 3-4 veces por frame; si preguntar contase un golpe,
# UNA sola flecha gastaria los 3 impactos de un cristal ella sola. El proyectil sondea en cada
# subpaso y despacha UNA vez, en el punto donde de verdad choco.
D_VIEJO = """    avisoDeRotura: function (x, y, z) {"""
D_NUEVO = """    // REQ-IMPACTO1 · SONDEO PURO: ¿hay algo con `alImpactar` en este punto? Sin efectos, para que
    // quien vuela pueda preguntarlo en cada subpaso. Devuelve la ficha del bloque, o null.
    impactoEn: function (px, py, pz) {
      var h = localizarImpacto(px, py, pz);
      return h ? h.b : null;
    },
    // REQ-IMPACTO1 · DESPACHO: cuenta el golpe y, si toca, desencadena. Se llama UNA vez por
    // choque. Todo el conocimiento vive aqui —que hay, cuantos golpes lleva, que evento toca— para
    // que el proyectil no sepa nada de bloques: solo dice «he chocado aqui».
    //
    // Devuelve null si ahi no habia nada con `alImpactar` (y quien choca hace lo de siempre:
    // chispas y clavarse), o {tipo, clave, golpe, de, listo, accion, valor}.
    impacto: function (px, py, pz, info) {
      var h = localizarImpacto(px, py, pz);
      if (!h) return null;
      var b = h.b, cfg = h.cfg;
      // ⛔ EL CONTADOR VIVE EN `mc`, NUNCA EN UN CLOSURE: este snippet se reejecuta (es el
      // autoarranque global) y un closure curaria solo cualquier cristal a medio romper.
      if (!mc._impactos) mc._impactos = {};
      var idC = (b.tipo === 'estructura')
        ? 'e|' + b.claveExacta + '|' + b.x + ',' + b.y + ',' + b.z
        : 'r|' + b.x + ',' + b.y + ',' + b.z;
      var n = (mc._impactos[idC] || 0) + 1;
      var res = { tipo: b.tipo, clave: b.clave, golpe: n, de: cfg.impactos, listo: false, accion: null };
      if (n < cfg.impactos) { mc._impactos[idC] = n; return res; }
      delete mc._impactos[idC];
      res.listo = true;
      var it = { b: b, s: h.s, cfg: cfg };
      if (cfg.alImpactar === 'romper') {
        // Romper es romper AUNQUE no haya alRomper: `dispararAlRomper` ya se calla si no lo hay.
        if (!retirarCogido(it)) return res;
        res.accion = 'romper';
        res.valor = dispararAlRomper(b);
      } else if (cfg.alImpactar === 'coger') {
        // Se respeta su `consume`: un pulsador que se toca al pasar tampoco se lo lleva una flecha.
        if (cfg.consume && !retirarCogido(it)) return res;
        res.accion = 'coger';
        res.valor = dispararAlCoger(cfg, b);
      } else {
        // En try/catch con aviso acotado, como alPisar/alRomper/alCoger: un snippet invitado que
        // lance no puede dejar el proyectil a medio vuelo ni el bucle de la flecha muerto.
        res.accion = 'js';
        try {
          res.valor = cfg.alImpactar({ x: b.x, y: b.y, z: b.z, ori: b.ori, clave: b.clave,
                                       claveExacta: b.claveExacta, tipo: b.tipo, cfg: cfg,
                                       golpe: n, de: cfg.impactos, punto: [px, py, pz],
                                       info: info || null });
        } catch (e2) {
          console.warn('alImpactar de "' + b.clave + '": ' + (e2 && e2.message ? e2.message : e2));
        }
      }
      return res;
    },
    avisoDeRotura: function (x, y, z) {"""

# ── E · el localizador, compartido por las dos APIs ──────────────────────────────────────────────
E_VIEJO = """  function dispararAlRomper(b) {"""
E_NUEVO = """  // REQ-IMPACTO1 · ¿que hay en este punto del mundo que reaccione a un impacto? Lo comparten el
  // sondeo (`impactoEn`) y el despacho (`impacto`) para que no haya dos versiones de la verdad.
  // Devuelve {b, cfg, s} o null. NO tiene efectos: no cuenta, no rompe, no avisa.
  function localizarImpacto(px, py, pz) {
    if (!hayImpactables) return null;          // sin un solo material que reaccione, ni se mira
    if (typeof mc === 'undefined' || !mc.grid) return null;
    // 1) ESTRUCTURAS FINAS primero. ⛔ El orden no es capricho: una pieza fina esta DENTRO de la
    //    celda de aire que la contiene, asi que mirar la rejilla antes la haria invisible.
    //    La caja la da `mcStructColl().fdim`, igual que en recogerCercanos — ⛔ nada de tocar
    //    `mcFineBoxHit`, que `test_rayo_apuntado.js` extrae VERBATIM POR TEXTO.
    var ests = mc.structures || null;
    if (ests && ests.length && typeof mcStructColl === 'function') {
      for (var i = 0; i < ests.length; i++) {
        var e = ests[i];
        if (noEsDelMundo(e)) continue;          // la herramienta de la mano NO es del mundo
        var cE = cfgDeClave(e.key);
        if (!cE || !cE.alImpactar) continue;
        var g = mcStructColl(e);
        if (!g || !g.fdim) continue;
        var d = g.fdim;
        if (px < e.ox || px > e.ox + d[0] / MC_T) continue;
        if (py < e.oy || py > e.oy + d[1] / MC_T) continue;
        if (pz < e.oz || pz > e.oz + d[2] / MC_T) continue;
        return { s: e, cfg: cE,
                 b: { tipo: 'estructura', clave: claveBase(e.key), claveExacta: e.key,
                      x: e.ox, y: e.oy, z: e.oz, ori: e.rot | 0 } };
      }
    }
    // 2) La rejilla. El giro sale de la CLAVE, ⛔ nunca abriendo los bits a mano.
    var x = Math.floor(px), y = Math.floor(py), z = Math.floor(pz);
    if (typeof mcInside !== 'function' || !mcInside(x, y, z)) return null;
    var id = mc.grid[mcIdx(x, y, z)];
    if (!id) return null;
    var k = mc.blockKey[id] || '';
    var cfg = cfgDeClave(k);
    if (!cfg || !cfg.alImpactar) return null;
    var m = /@(\\d{1,2})$/.exec(k);
    return { s: null, cfg: cfg,
             b: { tipo: 'rejilla', clave: claveBase(k), claveExacta: k,
                  x: x, y: y, z: z, ori: m ? (+m[1]) : 0 } };
  }

  function dispararAlRomper(b) {"""

# ── F · la bandera, por el mismo motivo que `hayCogibles` ────────────────────────────────────────
# Sin un solo material con `alImpactar`, `localizarImpacto` recorreria TODAS las estructuras finas
# del mundo 3-4 veces por frame y por flecha, para nada.
F_VIEJO = """    hayCogibles = false; alcanceCoger = 0;"""
F_NUEVO = """    hayCogibles = false; alcanceCoger = 0;
    hayImpactables = Object.keys(tabla).some(function (k) { return !!tabla[k].alImpactar; });"""

F2_VIEJO = """  var hayPisables = false;        // ...y si nadie tiene alPisar ni impulso, ni se sondea (lo pone reconstruirCache)"""
F2_NUEVO = """  var hayPisables = false;        // ...y si nadie tiene alPisar ni impulso, ni se sondea (lo pone reconstruirCache)
  var hayImpactables = false;     // REQ-IMPACTO1 · idem para alImpactar (lo pone reconstruirCache)"""

CAMBIOS = [
    ('A · define() normaliza alImpactar e impactos', A_VIEJO, A_NUEVO),
    ('B · un alImpactar mal escrito avisa, no se queda mudo', B_VIEJO, B_NUEVO),
    ('C · game.bloques.info() lo cuenta', C_VIEJO, C_NUEVO),
    ('F2 · declaracion de la bandera hayImpactables', F2_VIEJO, F2_NUEVO),
    ('F · reconstruirCache la calcula', F_VIEJO, F_NUEVO),
    ('E · localizarImpacto(), el sondeo compartido', E_VIEJO, E_NUEVO),
    ('D · impactoEn() sondea / impacto() despacha', D_VIEJO, D_NUEVO),
]


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
        print('  ya estaba · %s' % q)
    for q in hechos:
        print('  cambio    · %s' % q)
    if not hechos:
        print('nada que hacer: «%s» ya esta parcheado.' % SNIP)
        return 0
    if a.comprobar:
        print('\n--comprobar: no se publica nada.')
        return 0

    pide('%s/api/snippets' % a.sitio,
         json.dumps({'id': SNIP, 'name': snip.get('name') or SNIP, 'code': nuevo}).encode('utf-8'))
    print('\n✓ «%s» publicado (%d → %d chars).' % (SNIP, len(code), len(nuevo)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
