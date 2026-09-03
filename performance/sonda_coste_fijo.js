// ────────────────────────────────────────────────────────────────────────────────────────────
// SONDA DE CONSOLA · EL COSTE FIJO POR FRAME · ¿es la sombra? ¿quién malla en reposo?
//
// Síntoma que la parió (2026-09-03, segunda vuelta): en mapas grandes los fps NO SUBEN al mirar
// al suelo o a una pared ⇒ el coste dominante NO depende de lo que hay en pantalla. La primera
// sonda (sonda_mirar_suelo.js) lo midió: frame plano 7,6 ms en ambas posturas, 0 longtasks, y
// 220 mcMeshChunk en 5 s CON LA CÁMARA QUIETA. Sus contadores GL salieron 0 porque el motor ata
// gl.drawArrays como propiedad PROPIA de la instancia (app.js:6256) y eso sombrea el prototipo:
// esta versión envuelve mc.gl directamente.
//
// Sospechosos por lectura de código (fps-costes.md §5 ya lo marcaba 🟡 sin medir):
//   · mcRenderShadow (app.js:10655) corre CADA frame; aun sin rehacer nada recalcula 2 firmas
//     recorriendo TODAS las estructuras y agentes; y cuando algo cambia re-hornea dibujando
//     TODOS los chunks + estructuras SIN frustum (10724), hasta 22 Hz. «~20 ms medidos con 48
//     estructuras» dice su propio comentario — y el mapa grande tiene 473.
//   · algo edita el mundo en reposo (los 220 mcMeshChunk): fluidos, redstone del autoarranque…
//     esta sonda captura el STACK de quien lo llama.
//
// TRES FASES, todas con el jugador QUIETO (cartel en pantalla; total ~23 s):
//   A · 6 s normal            → línea base con reparto
//   B · 5 s mc.sunShade=1     → SIN pasada de sombra (ni firmas ni horneos ni muestreo)
//   C · 5 s sombra puesta pero re-horneos CONGELADOS (shadowMoveMs/shadowGeoMs enormes)
//
// Lectura:  fpsB≫fpsA ⇒ la sombra es el coste.  Y C reparte:  fpsC≈fpsB ⇒ son los RE-HORNEOS
// (palancas: shadowGeoMs/shadowMoveMs/shadowSize, o hornear con frustum);  fpsC≈fpsA ⇒ es la
// pasada/muestreo por frame aunque no se rehornee (palanca: shadowSize, firmas).
//
// USO: pegar en consola dentro del mapa grande, cerrar F12, quedarse quieto siguiendo el
// cartel; reabrir F12 y si el volcado no está:  sondaFijo.tabla()  ·  sondaFijo.mallas()
// Restaura todo (envolturas y mandos) byte a byte al terminar o al fallar.
// ────────────────────────────────────────────────────────────────────────────────────────────
(() => {
  const cartel = document.createElement('div');
  cartel.style.cssText = 'position:fixed;top:12%;left:0;right:0;text-align:center;z-index:99999;' +
    'font:bold 26px monospace;color:#fff;text-shadow:0 0 8px #000;pointer-events:none';
  document.body.appendChild(cartel);
  const di = (t) => { cartel.textContent = t; console.log('[sonda] ' + t); };

  try {
    console.log('[sonda] línea base', {
      chunks: mc.chunks.size, estructuras: mc.structures.length, agentes: mc.agents.size,
      sunShade: mc.sunShade, shadowSize: (typeof game !== 'undefined' && game.shadowSize),
      shadowMoveMs: mc.shadowMoveMs, cache: (typeof game !== 'undefined' && game.cacheStats && game.cacheStats())
    });
  } catch (e) {}

  // ── métricas por fase ──
  let M = null;
  const nuevaM = () => ({ frames: 0, ms: 0, tick: 0, upd: 0, rend: 0, dyn: 0,
                          shMs: 0, shLlam: 0, shHorneos: 0, shDrawsTot: 0, shVertsTot: 0,
                          drawsMain: 0, vertsMain: 0, kb: 0,
                          meshN: 0, meshMs: 0 });
  const pilas = Object.create(null); // stacks de mcMeshChunk, acumulados entre fases
  let enSombra = false;

  // ── envolturas ──
  const oRaf = window.requestAnimationFrame;
  const env = [];
  const envuelve = (nombre, alrededor) => {
    const f = window[nombre];
    if (typeof f !== 'function') { console.warn('[sonda] no existe', nombre); return; }
    env.push([nombre, f]);
    const w = alrededor(f);
    Object.defineProperty(w, 'name', { value: nombre }); // que la atribución rAF lo siga viendo
    window[nombre] = w;
  };
  const mide = (campo) => (f) => function () {
    const a = performance.now();
    try { return f.apply(this, arguments); }
    finally { if (M) M[campo] += performance.now() - a; }
  };
  envuelve('mcTick',   mide('tick'));
  envuelve('mcUpdate', mide('upd'));
  envuelve('mcRender', mide('rend'));
  envuelve('mcDynSync', mide('dyn'));
  envuelve('mcDynBake', mide('dyn'));
  envuelve('mcRenderShadow', (f) => function () {
    const a = performance.now(), d0 = M ? M.shDrawsTot : 0;
    enSombra = true;
    try { return f.apply(this, arguments); }
    finally {
      enSombra = false;
      if (M) { M.shLlam++; M.shMs += performance.now() - a;
               if (M.shDrawsTot > d0) M.shHorneos++; }
    }
  });
  envuelve('mcMeshChunk', (f) => function () {
    const a = performance.now();
    try { return f.apply(this, arguments); }
    finally {
      if (M) { M.meshN++; M.meshMs += performance.now() - a; }
      const s = (new Error().stack || '').split('\n').slice(2, 5)
        .map((l) => l.trim().replace(/^at /, '')).join(' ← ');
      if (Object.keys(pilas).length < 12 || pilas[s]) pilas[s] = (pilas[s] || 0) + 1;
    }
  });

  // gl de verdad: propiedad PROPIA sobre mc.gl (por prototipo el motor la sombrea)
  const gl = mc.gl, oglProps = [];
  ['drawArrays', 'drawElements', 'bufferData'].forEach((n) => {
    const own = Object.getOwnPropertyDescriptor(gl, n), prev = gl[n];
    oglProps.push([n, own, prev]);
    if (n === 'bufferData') gl[n] = function (destino, dato) {
      if (M) M.kb += (typeof dato === 'number' ? dato : (dato && dato.byteLength) || 0) / 1024;
      return prev.apply(this, arguments);
    };
    else gl[n] = function (modo, x, y) {
      const nv = (n === 'drawArrays') ? y : x;
      if (M) { if (enSombra) { M.shDrawsTot++; M.shVertsTot += nv; }
               else { M.drawsMain++; M.vertsMain += nv; } }
      return prev.apply(this, arguments);
    };
  });

  // mandos que se tocan por fase (se restauran exactos)
  const mandos = { sunShade: mc.sunShade, moveMs: mc.shadowMoveMs,
                   geoMs: (typeof game !== 'undefined') ? game.shadowGeoMs : undefined,
                   geoTenia: (typeof game !== 'undefined') && ('shadowGeoMs' in game) };

  let vivo = true;
  const restaurar = () => {
    if (!vivo) return;
    vivo = false;
    env.forEach(([n, f]) => { window[n] = f; });
    oglProps.forEach(([n, own, prev]) => { if (own) gl[n] = prev; else delete gl[n]; });
    mc.sunShade = mandos.sunShade; mc.shadowMoveMs = mandos.moveMs;
    try {
      if (mandos.geoTenia) game.shadowGeoMs = mandos.geoMs;
      else delete game.shadowGeoMs;
    } catch (e) {}
    cartel.remove();
  };

  let tPrev = 0;
  const reloj = (t) => {
    if (!vivo) return;
    if (M && tPrev) { M.frames++; M.ms += t - tPrev; }
    tPrev = t;
    oRaf.call(window, reloj);
  };
  oRaf.call(window, reloj);

  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  async function fase(nombre, dur, prepara) {
    for (let s = 3; s > 0; s--) { di('QUIETO · fase ' + nombre + ' — ' + s); await espera(1000); }
    if (prepara) prepara();
    di('MIDIENDO fase ' + nombre + ' (' + dur / 1000 + ' s) — no te muevas');
    M = nuevaM(); tPrev = 0;
    await espera(dur);
    const r = M; M = null;
    return r;
  }
  const calc = (m) => {
    const nf = Math.max(1, m.frames), f = m.ms / nf, sg = m.ms / 1000;
    return { fps: 1000 / f, frame: f, tick: m.tick / nf,
             upd: m.upd / nf, rend: m.rend / nf, dyn: m.dyn / nf,
             sh: m.shMs / nf, horneosSeg: m.shHorneos / sg,
             shDraws: m.shHorneos ? m.shDrawsTot / m.shHorneos : 0,
             draws: m.drawsMain / nf, kverts: m.vertsMain / nf / 1000,
             kb: m.kb / nf, meshSeg: m.meshN / sg, meshMs: m.meshMs / nf };
  };

  (async () => {
    try {
      const A = calc(await fase('A · NORMAL', 6000));
      const B = calc(await fase('B · SIN SOMBRA', 5000, () => { mc.sunShade = 1; }));
      const C = calc(await fase('C · SOMBRA CONGELADA', 5000, () => {
        mc.sunShade = mandos.sunShade; mc.shadowMoveMs = 1e9;
        try { game.shadowGeoMs = 1e9; } catch (e) {}
      }));
      restaurar();
      window.sondaFijo = {
        A, B, C, pilas,
        tabla() {
          const fila = (k, fmt) => ({ métrica: k.m, 'A normal': fmt(A[k.v]), 'B sin sombra': fmt(B[k.v]), 'C congelada': fmt(C[k.v]) });
          const f1 = (x) => +x.toFixed(1), f2 = (x) => +x.toFixed(2);
          console.table([
            fila({ m: 'fps', v: 'fps' }, f1),
            fila({ m: 'frame ms', v: 'frame' }, f2),
            fila({ m: 'mcTick ms', v: 'tick' }, f2),
            fila({ m: '· mcUpdate ms', v: 'upd' }, f2),
            fila({ m: '· mcRender ms', v: 'rend' }, f2),
            fila({ m: '· · sombra ms (firmas+horneo)', v: 'sh' }, f2),
            fila({ m: '· luz dinámica ms', v: 'dyn' }, f2),
            fila({ m: 'horneos de sombra / s', v: 'horneosSeg' }, f1),
            fila({ m: 'draws por horneo', v: 'shDraws' }, f1),
            fila({ m: 'draws principales/frame', v: 'draws' }, f1),
            fila({ m: 'kverts principales/frame', v: 'kverts' }, f1),
            fila({ m: 'KB subidos/frame', v: 'kb' }, f1),
            fila({ m: 'mcMeshChunk / s', v: 'meshSeg' }, f1),
            fila({ m: 'mcMeshChunk ms/frame', v: 'meshMs' }, f2)
          ]);
          const v = [];
          if (B.fps > A.fps * 1.15) {
            v.push('🌒 La sombra se lleva ' + (B.fps - A.fps).toFixed(0) + ' fps (' + A.fps.toFixed(0) +
                   ' → ' + B.fps.toFixed(0) + ' sin ella).');
            if (C.fps > A.fps * 1.1 && C.fps > (A.fps + B.fps) / 2)
              v.push('   ⇒ y son los RE-HORNEOS (C ≈ B): ' + A.horneosSeg.toFixed(1) +
                     ' horneos/s dibujando ' + A.shDraws.toFixed(0) +
                     ' draws del mapa ENTERO cada uno, con el jugador quieto. Palancas: subir game.shadowGeoMs/mc.shadowMoveMs, bajar game.shadowSize, u hornear con frustum (app.js:10724).');
            else
              v.push('   ⇒ es la pasada/muestreo por frame aunque no se rehornee (C ≈ A): mirar game.shadowSize y las firmas por frame (app.js:10676).');
          } else {
            v.push('🌕 La sombra NO es el coste (A≈B≈C). El reparto de arriba dice dónde está: si mcTick domina, seguir con game.perfVerbosity=2 + game.perfDump(); si el RESTO (frame − mcTick) domina con draws bajos, es GPU/compositor.');
          }
          if (A.meshSeg > 1)
            v.push('🔁 ' + A.meshSeg.toFixed(0) + ' mcMeshChunk/s con el jugador QUIETO: algo edita el mundo en reposo. Quién → sondaFijo.mallas()');
          v.forEach((l) => console.log('[sonda] ' + l));
        },
        mallas() {
          console.table(Object.entries(pilas).map(([k, n]) => ({ llamadas: n, pila: k }))
            .sort((x, y) => y.llamadas - x.llamadas));
        }
      };
      sondaFijo.tabla();
      console.log('[sonda] quién malla en reposo → sondaFijo.mallas()');
    } catch (e) { restaurar(); console.error('[sonda]', e); }
  })();
})();
