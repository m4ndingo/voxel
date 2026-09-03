// ────────────────────────────────────────────────────────────────────────────────────────────
// SONDA DE CONSOLA · ¿POR QUÉ CAEN LOS FPS AL MIRAR AL SUELO? · A/B horizonte vs suelo
//
// Síntoma (2026-09-03): en mapas grandes los fps caen SOLO con mirar al suelo. Depende de la
// dirección de cámara ⇒ las hipótesis vivas son otras que en PERF-FLECHA1:
//   · geometría sin cullar al acercar la vista (la pista del README: game.voxels sube junto a
//     una pared) → se vería en draws/vértices por frame
//   · re-mallado continuo disparado por la vista → se vería en gl.bufferData KB/frame
//   · fill-rate / espera de GPU (el suelo llena la pantalla de cerca) → RESTO sube sin que
//     suban ni draws ni mcTick
//   · CPU del motor (rayo de apuntado contra el terreno, etc.) → mcTick sube
//   · un snippet con bucle rAF sensible a la vista → la atribución por nombre lo caza
//
// La sonda mide LAS DOS posturas con las mismas envolturas y saca la comparación + veredicto.
//
// CÓMO SE USA (DevTools abierto roba la mitad de los fps; el A/B relativo vale igual, pero
// el número absoluto se confirma con F12 cerrado):
//   1. pegar entero en la consola (F12) dentro de /map/<mapa>
//   2. cerrar DevTools y seguir el cartel: 3 s para encuadrar, 5 s midiendo al HORIZONTE,
//      3 s para bajar la vista, 5 s midiendo al SUELO — sin andar, solo la cámara
//   3. reabrir F12 y, si el volcado no está a la vista, teclear:  sondaSuelo.tabla()
// ────────────────────────────────────────────────────────────────────────────────────────────
(() => {
  const PREP = 3000, DUR = 5000;

  // cartel en pantalla: en pointer-lock la consola no se ve
  const cartel = document.createElement('div');
  cartel.style.cssText = 'position:fixed;top:12%;left:0;right:0;text-align:center;z-index:99999;' +
    'font:bold 26px monospace;color:#fff;text-shadow:0 0 8px #000;pointer-events:none';
  document.body.appendChild(cartel);
  const di = (t) => { cartel.textContent = t; console.log('[sonda] ' + t); };

  // línea base del mundo, antes de tocar nada
  try {
    console.log('[sonda] línea base', {
      chunks: mc.chunks.size, estructuras: mc.structures.length,
      agentes: mc.agents.size, notas: mc.notes && mc.notes.size, escala: mc.scale
    });
  } catch (e) {}

  // ── envolturas: rAF por nombre, mcTick, mcMeshChunk, y WebGL por prototipo ──
  const oRaf = window.requestAnimationFrame;
  const oTick = window.mcTick, oMesh = window.mcMeshChunk;
  const oGL = [window.WebGLRenderingContext, window.WebGL2RenderingContext]
    .filter(Boolean).map((c) => ({ p: c.prototype, drawArrays: c.prototype.drawArrays,
      drawElements: c.prototype.drawElements, bufferData: c.prototype.bufferData }));

  let M = null; // métricas de la fase activa; null = no acumular
  const nuevaM = () => ({ frames: 0, ms: 0, peor: 0, tick: 0, draws: 0, verts: 0, kb: 0,
                          mesh: 0, long: 0, longMs: 0, raf: Object.create(null) });

  window.requestAnimationFrame = function (cb) {
    if (typeof cb !== 'function') return oRaf.call(window, cb);
    const k = cb.name || '(anónimo)';
    return oRaf.call(window, function (t) {
      const a = performance.now();
      try { return cb.call(this, t); }
      finally {
        if (M) {
          const d = performance.now() - a;
          const e = M.raf[k] || (M.raf[k] = { n: 0, ms: 0, max: 0 });
          e.n++; e.ms += d; if (d > e.max) e.max = d;
        }
      }
    });
  };
  // nombradas a propósito: así la atribución rAF las sigue viendo como mcTick/mcMeshChunk
  if (oTick) window.mcTick = function mcTick() {
    const a = performance.now();
    try { return oTick.apply(this, arguments); }
    finally { if (M) M.tick += performance.now() - a; }
  };
  if (oMesh) window.mcMeshChunk = function mcMeshChunk() {
    if (M) M.mesh++;
    return oMesh.apply(this, arguments);
  };
  oGL.forEach((g) => {
    g.p.drawArrays = function (modo, primero, n) {
      if (M) { M.draws++; M.verts += n; }
      return g.drawArrays.apply(this, arguments);
    };
    g.p.drawElements = function (modo, n) {
      if (M) { M.draws++; M.verts += n; }
      return g.drawElements.apply(this, arguments);
    };
    g.p.bufferData = function (destino, dato) {
      if (M) M.kb += (typeof dato === 'number' ? dato : (dato && dato.byteLength) || 0) / 1024;
      return g.bufferData.apply(this, arguments);
    };
  });
  let po = null;
  try {
    po = new PerformanceObserver((l) => l.getEntries().forEach((e) => {
      if (M) { M.long++; M.longMs += e.duration; }
    }));
    po.observe({ entryTypes: ['longtask'] });
  } catch (e) {}

  let vivo = true;
  const restaurar = () => {
    if (!vivo) return;
    vivo = false;
    window.requestAnimationFrame = oRaf;
    if (oTick) window.mcTick = oTick;
    if (oMesh) window.mcMeshChunk = oMesh;
    oGL.forEach((g) => { g.p.drawArrays = g.drawArrays; g.p.drawElements = g.drawElements;
                         g.p.bufferData = g.bufferData; });
    if (po) po.disconnect();
    cartel.remove();
  };

  // reloj de frame propio (rAF→rAF); corre siempre, solo acumula con M armada
  let tPrev = 0;
  const reloj = (t) => {
    if (!vivo) return;
    if (M && tPrev) { const d = t - tPrev; M.frames++; M.ms += d; if (d > M.peor) M.peor = d; }
    tPrev = t;
    oRaf.call(window, reloj);
  };
  oRaf.call(window, reloj);

  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  async function fase(nombre) {
    for (let s = PREP / 1000; s > 0; s--) { di('PONTE MIRANDO AL ' + nombre + ' — ' + s); await espera(1000); }
    di('MIDIENDO ' + nombre + ' (' + DUR / 1000 + ' s) — cámara quieta');
    M = nuevaM(); tPrev = 0;
    await espera(DUR);
    const r = M; M = null;
    return r;
  }

  const calc = (m) => {
    const nf = Math.max(1, m.frames), f = m.ms / nf, por = (x) => x / nf;
    return { fps: 1000 / f, frame: f, peor: m.peor, tick: por(m.tick), resto: f - por(m.tick),
             draws: por(m.draws), kverts: por(m.verts) / 1000, kb: por(m.kb),
             mesh: m.mesh, long: m.long, longMs: m.longMs, raf: m.raf, frames: m.frames };
  };

  function veredicto(a, b) {
    const v = [];
    if (b.frame < a.frame * 1.2) {
      v.push('⚠️ El suelo apenas empeora el frame en esta tirada (' + a.fps.toFixed(0) + ' → ' +
             b.fps.toFixed(0) + ' fps). Repite donde el dueño lo vea caer, o mira más abajo/más cerca.');
      return v;
    }
    const topRaf = Object.entries(b.raf)
      .filter(([k]) => k !== 'reloj' && k !== 'mcTick' && k !== '(anónimo)')
      .map(([k, e]) => ({ k, ms: e.ms / Math.max(1, b.frames) }))
      .sort((x, y) => y.ms - x.ms)[0];
    if (topRaf && topRaf.ms > Math.max(2, 0.3 * b.frame))
      v.push('🎯 Un rAF ajeno al motor domina: «' + topRaf.k + '» (' + topRaf.ms.toFixed(1) +
             ' ms/frame). Es un SNIPPET: buscar ese nombre en data/snippets/ y matarlo en vivo (fps-metodo.md §5).');
    if ((b.tick - a.tick) > (b.resto - a.resto)) {
      v.push('🧠 La subida está en mcTick (CPU del motor). Siguiente paso: game.perfVerbosity=2; ' +
             'game.perfAssert=' + Math.ceil(a.fps * 0.8) + '; mirar al suelo; leer game.perfDump().');
    } else {
      if (b.draws > a.draws * 1.5 || b.kverts > a.kverts * 1.5)
        v.push('📦 Al mirar al suelo se dibuja MUCHO más (draws ' + a.draws.toFixed(0) + '→' + b.draws.toFixed(0) +
               ', kverts ' + a.kverts.toFixed(0) + '→' + b.kverts.toFixed(0) +
               '/frame): culling/frustum dejando pasar geometría de más — la pista del README ' +
               '(«geometría sin cullar, no fill-rate»).');
      else if (b.kb > 256)
        v.push('🔁 Se suben ' + b.kb.toFixed(0) + ' KB/frame a la GPU (re-mallado continuo, ' + b.mesh +
               ' mcMeshChunk en la fase): thrash — game.cacheStats() + game.chunksActivos().');
      else if (b.longMs > DUR * 0.3)
        v.push('🐌 Longtasks de JS (' + b.long + ' · ' + b.longMs.toFixed(0) +
               ' ms) sin dueño claro: revisar la tabla rAF completa (sondaSuelo.rafSuelo()).');
      else
        v.push('🎨 RESTO sube sin más draws ni subidas ⇒ huele a fill-rate/espera de GPU. Confirmar: ' +
               "game.renderScale=0.5 y luego game.renderMode='fast' mirando al suelo; " +
               'si los fps suben con la escala, es fill-rate (la palanca sería renderScale/nearClip).');
    }
    return v;
  }

  (async () => {
    try {
      const A = calc(await fase('HORIZONTE'));
      const B = calc(await fase('SUELO'));
      restaurar();
      const pct = (x, y) => (y ? ((100 * (x - y)) / y).toFixed(0) + '%' : '—');
      window.sondaSuelo = {
        A, B,
        tabla() {
          console.table([
            { métrica: 'fps',              horizonte: +A.fps.toFixed(1),    suelo: +B.fps.toFixed(1),    'Δ': pct(B.fps, A.fps) },
            { métrica: 'frame ms',         horizonte: +A.frame.toFixed(1),  suelo: +B.frame.toFixed(1),  'Δ': pct(B.frame, A.frame) },
            { métrica: 'peor frame ms',    horizonte: +A.peor.toFixed(0),   suelo: +B.peor.toFixed(0),   'Δ': pct(B.peor, A.peor) },
            { métrica: 'mcTick ms',        horizonte: +A.tick.toFixed(2),   suelo: +B.tick.toFixed(2),   'Δ': pct(B.tick, A.tick) },
            { métrica: 'RESTO ms',         horizonte: +A.resto.toFixed(1),  suelo: +B.resto.toFixed(1),  'Δ': pct(B.resto, A.resto) },
            { métrica: 'draws/frame',      horizonte: +A.draws.toFixed(0),  suelo: +B.draws.toFixed(0),  'Δ': pct(B.draws, A.draws) },
            { métrica: 'kverts/frame',     horizonte: +A.kverts.toFixed(0), suelo: +B.kverts.toFixed(0), 'Δ': pct(B.kverts, A.kverts) },
            { métrica: 'KB subidos/frame', horizonte: +A.kb.toFixed(0),     suelo: +B.kb.toFixed(0),     'Δ': pct(B.kb, A.kb) },
            { métrica: 'mcMeshChunk (fase)', horizonte: A.mesh,             suelo: B.mesh,               'Δ': '' },
            { métrica: 'longtasks n · ms', horizonte: A.long + ' · ' + A.longMs.toFixed(0),
              suelo: B.long + ' · ' + B.longMs.toFixed(0), 'Δ': '' }
          ]);
          veredicto(A, B).forEach((l) => console.log('[sonda] ' + l));
          console.log('[sonda] tabla rAF de la fase SUELO → sondaSuelo.rafSuelo()');
        },
        rafSuelo() {
          console.table(Object.entries(B.raf).filter(([k]) => k !== 'reloj')
            .map(([k, e]) => ({ callback: k, llamadas: e.n,
              'ms/llamada': +(e.ms / e.n).toFixed(2), 'pico ms': +e.max.toFixed(1),
              'ms/frame': +(e.ms / Math.max(1, B.frames)).toFixed(2) }))
            .sort((x, y) => y['ms/frame'] - x['ms/frame']));
        }
      };
      sondaSuelo.tabla();
    } catch (e) { restaurar(); console.error('[sonda]', e); }
  })();
})();
