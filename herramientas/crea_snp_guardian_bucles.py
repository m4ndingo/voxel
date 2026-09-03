#!/usr/bin/env python3
# @area: snippets
#
# PERF-FLECHA1 (salvaguarda) · «guardian-bucles»: avisa cuando un bucle rAF se come el frame.
#
# EL PORQUE (el dueño, 2026-09-03, tras cerrar la caida de fps del mapa default): «y si puedes
# meter alguna salvaguarda o alerta para detectar cosas como esta hazlo».
#
# QUE PASO Y POR QUE NO LO VIO NADIE. Un bucle `requestAnimationFrame` de un snippet
# (`bucleFlechas`) subio a 250 ms por frame y dejo el juego en 3,4 fps. Ningun aviso salto, y el
# profiler del motor tampoco: `game.perfDump()` SOLO envuelve funciones de `app.js`, o sea que un
# bucle que vive en un snippet es invisible para el. El reparto real era `mcTick` 1,9 ms y RESTO
# 234 ms — y «RESTO» no tiene nombre ni dueño, asi que se le echa la culpa a la GPU y se pierden
# horas tocando `renderDist`, `renderScale` y `shadowSize`, que no pintan nada.
#
# LO QUE HACE ESTE GUARDIAN, que es exactamente lo que acabo encontrandolo en cinco segundos:
# envuelve `requestAnimationFrame` y mide cada callback POR NOMBRE. Cada VENTANA_MS juzga: si
# alguno gasta mas de AVISO_MS por llamada, avisa UNA vez con nombre, coste y que hacer.
#
# ⛔ NO VIGILA `mcTick`: el motor ya tiene su propio profiler (`game.perfAssert` / `game.perfDump`)
# y avisar por duplicado solo enseña a ignorar los avisos. Este guardian cubre justo el hueco que
# el profiler no puede cubrir: TODO LO DEMAS.
#
# COSTE: dos `performance.now()` por callback y frame (unos pocos µs). Se puede apagar entero con
# `game.guardianBucles.off()`, que devuelve `requestAnimationFrame` byte a byte por `_orig`.
#
#   python3 herramientas/crea_snp_guardian_bucles.py --comprobar
#   python3 herramientas/crea_snp_guardian_bucles.py
import argparse
import json
import os
import sys
import urllib.request

SITIO = 'http://127.0.0.1:8500'
SNIP = 'guardian-bucles'
NOMBRE = '🛡️ Guardián de bucles (avisa si un rAF se come el frame)'
TOKEN = (os.environ.get('VOXELFORGE_TOKEN') or '').strip()

CODE = r"""/**
 * 🛡️ guardian-bucles · avisa cuando un bucle requestAnimationFrame se come el frame.
 *
 * EL HUECO QUE TAPA. `game.perfDump()` solo envuelve funciones del motor (app.js). Un bucle rAF
 * que vive en un SNIPPET es invisible para el: aparece como «RESTO», sin nombre, y se confunde
 * con espera de GPU. Asi se perdio una tarde con `bucleFlechas` a 250 ms/frame (3,4 fps) mientras
 * `mcTick` marcaba 1,9 ms y todas las palancas de render (renderDist, renderScale, shadowSize,
 * renderMode) no movian nada — porque el problema no era el dibujado.
 *
 * QUE HACE. Envuelve `requestAnimationFrame` y mide cada callback POR NOMBRE. Cada ventana juzga
 * quien se pasa del presupuesto y avisa UNA sola vez por culpable.
 *
 *   game.guardianBucles.informe()   · tabla de lo medido en la ventana en curso
 *   game.guardianBucles.off()       · retira la envoltura byte a byte (_orig)
 *   game.guardianBucles.on({avisoMs:8, ventanaMs:2000, minLlamadas:10})
 */
(function () {
  'use strict';
  if (typeof window === 'undefined' || !window.game) return;

  // ⛔ mcTick NO se vigila: el motor ya tiene game.perfAssert/game.perfDump para eso, y un aviso
  // duplicado solo enseña a ignorar los avisos. Este guardian cubre TODO LO DEMAS, que es
  // justo lo que el profiler no puede ver.
  var IGNORA = { mcTick: 1 };

  var cfg = { avisoMs: 8, ventanaMs: 2000, minLlamadas: 10 };
  var acc = Object.create(null);
  var avisados = Object.create(null);
  var t0 = 0;

  function anota(nombre, ms) {
    var e = acc[nombre] || (acc[nombre] = { n: 0, ms: 0, max: 0 });
    e.n++; e.ms += ms; if (ms > e.max) e.max = ms;

    var ahora = performance.now();
    if (ahora - t0 < cfg.ventanaMs) return;
    juzga(ahora - t0);
    acc = Object.create(null);
    t0 = ahora;
  }

  function juzga(ventana) {
    for (var nombre in acc) {
      if (IGNORA[nombre] || avisados[nombre]) continue;
      var e = acc[nombre];
      if (e.n < cfg.minLlamadas) continue;          // callbacks sueltos: ni se miran
      var porLlamada = e.ms / e.n;
      if (porLlamada < cfg.avisoMs) continue;

      avisados[nombre] = true;
      console.warn(
        '🛡️ [guardian-bucles] «' + nombre + '» se está comiendo el frame: ' +
        porLlamada.toFixed(1) + ' ms por llamada (pico ' + e.max.toFixed(0) + ' ms, ' +
        (100 * e.ms / ventana).toFixed(0) + '% del reloj).\n' +
        '   ⛔ game.perfDump() NO lo va a ver: solo envuelve funciones del motor.\n' +
        '   Para repartir su coste, envuelve las APIs que llama y mira llamadas/frame.\n' +
        '   Para confirmarlo, mátalo en vivo y compara fps:\n' +
        '     const r = window.requestAnimationFrame;\n' +
        '     window.requestAnimationFrame = cb => (cb && cb.name === "' + nombre + '") ? 0 : r(cb);\n' +
        '   (Este aviso sale UNA vez. game.guardianBucles.informe() para el detalle.)'
      );
    }
  }

  var api = {
    on: function (opts) {
      if (opts) for (var k in opts) if (k in cfg) cfg[k] = opts[k];
      if (window.requestAnimationFrame._orig) return 'ya estaba puesto';
      var orig = window.requestAnimationFrame;
      var envuelto = function (cb) {
        if (typeof cb !== 'function') return orig.call(window, cb);
        return orig.call(window, function (t) {
          var ini = performance.now();
          try { return cb.call(this, t); }
          finally { anota(cb.name || '(anónimo)', performance.now() - ini); }
        });
      };
      envuelto._orig = orig;
      window.requestAnimationFrame = envuelto;
      acc = Object.create(null); avisados = Object.create(null);
      t0 = performance.now();
      return 'guardián puesto (avisa a partir de ' + cfg.avisoMs + ' ms/llamada)';
    },

    off: function () {
      var w = window.requestAnimationFrame;
      if (!w._orig) return 'no estaba puesto';
      window.requestAnimationFrame = w._orig;   // byte a byte, como manda la ley de oro
      return 'guardián retirado';
    },

    informe: function () {
      var filas = [];
      for (var nombre in acc) {
        var e = acc[nombre];
        filas.push({
          callback: nombre, llamadas: e.n,
          'ms/llamada': +(e.ms / e.n).toFixed(2),
          'pico ms': +e.max.toFixed(1),
          vigilado: !IGNORA[nombre]
        });
      }
      filas.sort(function (a, b) { return b['ms/llamada'] - a['ms/llamada']; });
      if (console.table) console.table(filas);
      return filas;
    },

    cfg: cfg
  };

  game.guardianBucles = api;
  console.log('🛡️ [guardian-bucles] ' + api.on());
})();
"""

def pide(url, cuerpo=None):
    cab = {'Content-Type': 'application/json'} if cuerpo else {}
    if TOKEN:
        cab['X-VoxelForge-Token'] = TOKEN
    pet = urllib.request.Request(url, data=cuerpo, method='POST' if cuerpo else 'GET',
                                 headers=cab)
    with urllib.request.urlopen(pet, timeout=20) as r:
        return json.loads(r.read().decode('utf-8') or '{}')


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--comprobar', action='store_true')
    p.add_argument('--sitio', default=SITIO)
    a = p.parse_args()

    if a.comprobar:
        print('--comprobar: %d bytes de codigo, NO se publica nada.' % len(CODE))
        return 0

    pide('%s/api/snippets' % a.sitio,
         json.dumps({'id': SNIP, 'name': NOMBRE, 'code': CODE}).encode('utf-8'))
    print('✅ «%s» publicado (%d bytes).' % (SNIP, len(CODE)))
    print('   Probar:  await game.snippet(\'%s\')  →  game.guardianBucles.informe()' % SNIP)
    return 0


if __name__ == '__main__':
    sys.exit(main())
