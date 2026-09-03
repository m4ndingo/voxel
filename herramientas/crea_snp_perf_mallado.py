#!/usr/bin/env python3
"""Genera (y publica) el snippet `perf-mallado`.

Entrar al mundo por defecto tardaba ~9 s con el hilo principal bloqueado. Medido con
`/tmp/perf3.js` (traza de quién llama a qué), el mundo se hornea y se malla ENTERO **5 veces**
en una sola entrada, y `mcMeshAll` (app.js:12253) llama incondicionalmente a `mcComputeLight`
(app.js:11630), que cuesta ~1 s cada vez:

    t= 7053  2281 ms  mcBake <- openWorld            (el legitimo)
    t= 9653  1979 ms  mundo-autoarranque:304         (lo tira mcRestampAll acto seguido)
    t=13749  1941 ms  mcRestampAll:16572
    t=27297  1432 ms  mcSyncNoteSignsRun -> mcStampStruct -> mcRestampAll
    t=29126  1219 ms  mcCalientaFina:7984            (UNO POR MATERIAL fino que llega tarde)

Este snippet ataca dos de las cinco (la 2 la arregla `parche_snp_perf_remallado.py` dentro de
`mundo-autoarranque`, que es donde vive el defecto):

  1) MEMORIZA `mcComputeLight`. Es una funcion PURA de `mc.grid` + `mcTablaLuz()` +
     `mcTablaCielo()` + `mc.dim` + `mc.interiorDark`: entre la llamada 3 y la 5 nada de eso
     cambia y se recalcula tres veces el MISMO Uint8Array.
  2) AGRUPA los `mcMeshAll` de `mcCalientaFina`. Hoy cada geometria fina que llega tarde se
     paga un mallado del mundo entero; aqui se espera a que escampe la tanda y se malla UNA vez.

Uso:  python3 herramientas/crea_snp_perf_mallado.py [--publicar]
"""
import json
import os
import sys
import tempfile
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEST = os.path.join(RAIZ, 'data', 'snippets', 'perf-mallado.json')

CODE = r'''// ==PERF-MALLADO== v1.1
// EL PROBLEMA: entrar al mundo por defecto bloquea el hilo principal ~9 s. No es la paleta (203
// materiales = 3033 ms, y ya esta optimizada: PERF-MC3 precarga en paralelo). Es que el mundo se
// malla ENTERO cinco veces, y cada `mcMeshAll` (app.js:12253) empieza por `mcComputeLight`
// (app.js:11630), que barre las 368.640 celdas y cuesta ~1 s.
//
// LO QUE HACE:
//   1) `mcComputeLight` se MEMORIZA. Lee `mc.grid`, `mcTablaLuz()`, `mcTablaCielo()`, `mc.dim` y
//      `mc.interiorDark`, y nada mas: es pura. Si la firma no ha cambiado, `mc.light` YA es el
//      resultado y volver a calcularlo no puede dar otra cosa. La firma compara las dos tablas
//      byte a byte (son ~256 B) y la rejilla por huella FNV de 64 bits (2 x 32, `Math.imul`):
//      ~1 ms en 96x40x96, ~30 ms en 512x40x512, contra 1000 ms de recalculo.
//      No es una cache con invalidacion a mano —que es lo que se rompe— sino una comparacion de
//      TODO lo que la funcion lee. Si algo cambia, se recalcula; no hay tercera opcion.
//   2) `mcCalientaFina` (app.js:7979) agrupa. La red de seguridad que hornea la geometria fina
//      tarde llama a `mcMeshAll()` en su `.then`, o sea UNO POR MATERIAL. Aqui se espera a que la
//      tanda escampe —nadie en vuelo Y 400 ms de silencio, tope 4 s— y se malla una sola vez.
//      v1.1: el silencio es lo que junta las OLAS de carteles de nota, separadas 180-370 ms, que en
//      v1.0 se llevaban 37 mallados de 135-245 ms DESPUES de cargar (el tiron que se nota jugando).
//
// ⛔ NO se toca `mcMeshAll` en si. Hay ~20 sitios que la llaman contando con que es SINCRONA
//    (`mcMeshAll(); toast(...)`, `mcBake`, `mcRestampAll`): retrasarla en global es cambiarle el
//    contrato a todos. Se retrasa SOLO la del camino que la repite, que es el que sobra.
//
// Reversible byte a byte: `game.perfMallado.off()` devuelve las dos funciones originales.
(function () {
  var VERSION = 'v1.1';
  var G = (typeof window !== 'undefined') ? window : globalThis;
  if (typeof mcComputeLight !== 'function') {
    console.warn('perf-mallado: no encuentro mcComputeLight; no se instala.');
    return;
  }
  G.game = G.game || {};

  var cuenta = { aciertos: 0, fallos: 0, msAhorrados: 0, msFirma: 0, materialesFinos: 0, mallados: 0 };
  var memo = null;      // la firma del ultimo calculo REAL

  // Huella de la rejilla: dos FNV-1a de 32 bits con primos distintos = 64 bits efectivos. Con
  // `Math.imul` porque el producto de un entero de 32 bits por 16777619 se pasa de 2^53 y en
  // coma flotante perderia los bits bajos, que son justo los que distinguen dos rejillas.
  function huella(a) {
    if (!a) return 'nula';
    var h1 = 0x811c9dc5, h2 = 0xcbf29ce4, n = a.length;
    for (var i = 0; i < n; i++) {
      var v = a[i];
      h1 = Math.imul(h1 ^ v, 16777619);
      h2 = Math.imul(h2 ^ v, 2166136261);
    }
    return (h1 >>> 0) + ':' + (h2 >>> 0) + ':' + n;
  }

  function igualBytes(a, b) {
    if (a === b) return true;
    if (!a || !b || a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  function firma() {
    var d = mc.dim;
    return {
      nx: d.x, ny: d.y, nz: d.z,
      oscuro: mc.interiorDark,
      // Las tablas son la traduccion de las banderas de material (mc.recorte, mc.finoRejilla,
      // mc.traspasaLuz, mc.sinSombra) a «¿pasa la luz?» y «¿sigue bajando el cielo?». Son lo que
      // cambia cuando `game.bloques.define` declara una hierba atravesable, y por eso el remallado
      // de `mundo-autoarranque` SI tiene que recalcular: ahi la firma cambia de verdad.
      pasa: mcTablaLuz(), cielo: mcTablaCielo(),
      // La rejilla, por huella; y ademas la REFERENCIA del array de luz que dejamos escrito: si
      // alguien reasigna `mc.light` (cambio de mapa, redimension) el resultado ya no esta ahi.
      grid: huella(mc.grid), luz: mc.light
    };
  }

  function mismaFirma(a, b) {
    return !!a && !!b && a.nx === b.nx && a.ny === b.ny && a.nz === b.nz
      && a.oscuro === b.oscuro && a.grid === b.grid && a.luz === b.luz
      && igualBytes(a.pasa, b.pasa) && igualBytes(a.cielo, b.cielo);
  }

  function luzMemorizada() {
    // `interiorDark===1` apaga el skylight y la original sale en la primera linea: no hay nada que
    // memorizar y meter la firma por delante solo costaria trabajo.
    if (typeof mc === 'undefined' || !mc.grid || mc.interiorDark === 1) {
      return luzMemorizada._orig.apply(this, arguments);
    }
    var t0 = performance.now();
    var f = firma();
    cuenta.msFirma += performance.now() - t0;
    if (mismaFirma(f, memo)) {
      cuenta.aciertos++;
      cuenta.msAhorrados += memo._coste || 0;
      return;
    }
    var t1 = performance.now();
    var r = luzMemorizada._orig.apply(this, arguments);
    // La firma se toma DESPUES de calcular: `mc.light` puede haberse reasignado dentro (la original
    // hace `mc.light = new Uint8Array(N)` si no cuadraba el tamano) y hay que guardar ESA referencia.
    memo = firma();
    memo._coste = performance.now() - t1;
    cuenta.fallos++;
    return r;
  }

  // ── 2 · la tanda de geometria fina se malla una vez ──────────────────────────────────────────
  // Copia fiel de app.js:7979 salvo el final: en vez de `mcMeshAll()` por material, `pideMallado()`.
  // Se reemplaza entera porque el `mcMeshAll` vive dentro del `.then` y no hay donde engancharse.
  // El `mcFinoPend` original queda sin usar (es un `const` de app.js que nadie mas mira); este
  // guarda el suyo, con la misma funcion: no pedir dos veces la misma geometria.
  var pend = new Set();
  var pedido = false, vueltas = 0, ultimaLlegada = 0;

  // v1.1 · REPOSO. Con v1.0 solo se esperaba MIENTRAS hubiera geometria en vuelo, y en cuanto el
  // conjunto se vaciaba se mallaba. Pero la geometria fina no llega en una tanda: llega en OLAS
  // separadas 180-370 ms (`mcSyncNoteSignsRun` va estampando carteles de nota durante casi un
  // minuto). Cada ola se llevaba su `mcMeshAll` entero: 37 mallados de 135-245 ms medidos en el
  // mapa por defecto, o sea el tiron que se nota jugando DESPUES de que el mapa haya cargado.
  // Ahora se espera ademas un rato de SILENCIO tras la ultima llegada, y las olas se juntan.
  var REPOSO = 400;      // ms de silencio antes de mallar; por debajo de ~370 las olas no se juntan
  var TOPE = 4000;       // ms como mucho: una geometria que no resuelve nunca no deja el mundo sin mallar

  function pideMallado() {
    ultimaLlegada = performance.now();
    if (pedido) return;                       // ya hay un tic en marcha; solo ha corrido el reloj
    pedido = true; vueltas = 0;
    var tic = function () {
      // Se espera si queda geometria en vuelo O si acaba de llegar algo (puede venir otra ola).
      var enSilencio = performance.now() - ultimaLlegada >= REPOSO;
      if ((pend.size || !enSilencio) && vueltas++ < TOPE / 50) { setTimeout(tic, 50); return; }
      pedido = false;
      if (typeof mcMeshAll === 'function' && typeof mc !== 'undefined' && mc.grid) { cuenta.mallados++; mcMeshAll(); }
    };
    setTimeout(tic, 50);
  }

  function calientaFinaAgrupada(key) {
    if (!key || mc.finoGeom[key] || pend.has(key)) return;
    var srcKey = (typeof mcFluidBase === 'function') ? mcFluidBase(mcClaveBase(key)) : mcClaveBase(key);
    pend.add(key);
    // Se cuentan los materiales y los mallados de verdad; lo ahorrado es la resta. v1.0 contaba solo
    // los que coincidian EN VUELO, y por eso no vio los 37 mallados de las olas separadas.
    cuenta.materialesFinos++;
    mcStructGeom(srcKey, mcClaveOri(key)).then(function (g) {
      pend.delete(key); mc.finoGeom[key] = g; pideMallado();
    }).catch(function (e) {
      pend.delete(key); console.warn('[mundo] geometria fina', key, e);
      if (!pend.size) pideMallado();
    });
  }

  // ── enganche / desenganche ───────────────────────────────────────────────────────────────────
  var M = {};
  M.version = VERSION;

  M.on = function () {
    if (!luzMemorizada._orig) { luzMemorizada._orig = G.mcComputeLight; G.mcComputeLight = luzMemorizada; }
    if (typeof G.mcCalientaFina === 'function' && !calientaFinaAgrupada._orig) {
      calientaFinaAgrupada._orig = G.mcCalientaFina; G.mcCalientaFina = calientaFinaAgrupada;
    }
    return M.estado();
  };

  M.off = function () {
    if (luzMemorizada._orig) { G.mcComputeLight = luzMemorizada._orig; luzMemorizada._orig = null; }
    if (calientaFinaAgrupada._orig) { G.mcCalientaFina = calientaFinaAgrupada._orig; calientaFinaAgrupada._orig = null; }
    memo = null;
    return M.estado();
  };

  M.olvidar = function () { memo = null; return true; };   // por si hay que forzar un recalculo

  M.estado = function () {
    return {
      version: VERSION,
      luz: { puesta: G.mcComputeLight === luzMemorizada, aciertos: cuenta.aciertos, fallos: cuenta.fallos,
             msAhorrados: Math.round(cuenta.msAhorrados), msFirma: Math.round(cuenta.msFirma) },
      fina: { puesta: G.mcCalientaFina === calientaFinaAgrupada, enVuelo: pend.size,
              materialesFinos: cuenta.materialesFinos, mallados: cuenta.mallados,
              malladosAhorrados: Math.max(0, cuenta.materialesFinos - cuenta.mallados) }
    };
  };

  G.game.perfMallado = M;
  M.on();
  console.log('perf-mallado ' + VERSION + ': mcComputeLight memorizada + mcCalientaFina agrupada.');
})();
'''


def main():
    doc = {
        'id': 'perf-mallado',
        'name': 'Rendimiento: un solo horneado de luz y un solo mallado por tanda',
        'code': CODE,
    }
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(DEST), suffix='.tmp')
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
    os.replace(tmp, DEST)
    print('escrito %s (%d B de codigo)' % (DEST, len(CODE)))

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
