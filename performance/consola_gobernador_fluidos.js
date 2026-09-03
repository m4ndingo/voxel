// ────────────────────────────────────────────────────────────────────────────────────────────
// CONSOLA · GOBERNADOR DE CADENCIA DE FLUIDOS · validación en caliente (PERF-AGUA1, paso 1)
//
// Por qué existe (fps-casos.md#agua, 2026-09-03): en `default` hay agua que NUNCA se asienta
// (fuga + realimentación). Coste medido: 11 ticks/s × caja de ~4 chunks = 44 mcMeshChunk/s =
// 1,3-1,7 ms/frame para siempre; pausar game.fluidos.tick dio 123,9 → 144,2 fps (vsync).
// La vía de DATOS murió medida: el agua se regenera (54 celdas → cola ~170 al calmarlas).
//
// QUÉ HACE: envuelve `game.fluidos.tick` (app.js:8816, el frame la llama por la API en :22446).
//   · cola VACÍA            → transparente (el paso de cierre re-malla la caja pendiente)
//   · `tick(forzar)`        → transparente SIEMPRE (consola/snippets piden «un paso YA»)
//   · cola viva > 5 s       → GOBERNADO: deja pasar 1 tick/s en vez de ~11 ⇒ la caja inquieta
//                             se re-malla ~4 veces/s en vez de 44. El agua sigue moviéndose,
//                             a cámara lenta; si la cola llega a 0 se des-gobierna sola.
//
// Es la VALIDACIÓN del arreglo definitivo (caducidad por celda en app.js:8514-8974): si esto
// devuelve los fps de la pausa total, la tesis «basta con quitarle la cadencia al agua en
// bucle» queda demostrada y se gradúa (ley de oro). No toca ficheros; reversible byte a byte.
//
// USO: pegar en el mapa grande, F12 cerrado, QUIETO ~20 s siguiendo el cartel. Mide solo
// A (normal) 4 s → instala → espera a que gobierne → mide B (gobernado) 4 s → veredicto y
// DEJA EL GOBERNADOR PUESTO para seguir jugando con él.
//   gobiernoFluidos.estado()   contadores en vivo (pasados/saltados, cola, gobernando)
//   gobiernoFluidos.tabla()    reimprime el A/B
//   gobiernoFluidos.off()      restaura game.fluidos.tick byte a byte
// Re-pegarlo desenvuelve el anterior por `_orig` (no se apila).
// ────────────────────────────────────────────────────────────────────────────────────────────
(() => {
  const api = (typeof game !== 'undefined') && game.fluidos;
  if (!api || !api.tick) { console.error('[gobierno] no hay game.fluidos'); return; }
  if (api.tick._orig) { api.tick = api.tick._orig; console.log('[gobierno] envoltura anterior retirada'); }
  const oTick = api.tick;

  const G = {
    UMBRAL_MS: 5000,   // cola sin vaciarse este tiempo ⇒ está en bucle ⇒ se gobierna
    CADENCIA_MS: 1000, // gobernado: 1 tick/s (el sim natural va a ~11)
    gobernando: false, inquietaDesde: 0, ultimoPaso: 0,
    pasados: 0, saltados: 0, activaciones: 0
  };

  function tick(forzar) {
    if (forzar) return oTick.apply(this, arguments);
    let q = 0; try { q = api.queueSize(); } catch (e) {}
    const now = performance.now();
    if (q === 0) {
      if (G.gobernando) { G.gobernando = false; console.log('[gobierno] cola a 0: cadencia normal'); }
      G.inquietaDesde = 0;
      return oTick.apply(this, arguments);
    }
    if (!G.inquietaDesde) G.inquietaDesde = now;
    if (!G.gobernando && now - G.inquietaDesde > G.UMBRAL_MS) {
      G.gobernando = true; G.activaciones++;
      console.log('[gobierno] 💧 cola viva ' + (G.UMBRAL_MS / 1000) + ' s sin vaciarse (' + q +
        ' celdas): agua en bucle ⇒ cadencia ~11 → ' + (1000 / G.CADENCIA_MS) + ' tick/s');
    }
    if (G.gobernando && now - G.ultimoPaso < G.CADENCIA_MS) { G.saltados++; return; }
    G.ultimoPaso = now; G.pasados++;
    return oTick.apply(this, arguments);
  }
  tick._orig = oTick;

  window.gobiernoFluidos = {
    G,
    off() {
      api.tick = oTick;
      console.log('[gobierno] retirado: game.fluidos.tick vuelve a ser el original');
    },
    estado() {
      let q = -1; try { q = api.queueSize(); } catch (e) {}
      console.log('[gobierno] ' + JSON.stringify({
        gobernando: G.gobernando, cola: q, pasados: G.pasados, saltados: G.saltados,
        activaciones: G.activaciones, envuelto: api.tick !== oTick ? 'NO (¿off?)' : 'sí'
      }).replace(/"/g, ''));
    }
  };

  // ── medición A/B incorporada (misma liturgia que sonda_fluidos.js) ──────────────────────
  const cartel = document.createElement('div');
  cartel.style.cssText = 'position:fixed;top:12%;left:0;right:0;text-align:center;z-index:99999;' +
    'font:bold 26px monospace;color:#fff;text-shadow:0 0 8px #000;pointer-events:none';
  document.body.appendChild(cartel);
  const di = (t) => { cartel.textContent = t; console.log('[gobierno] ' + t); };

  let M = null;
  const nuevaM = () => ({ frames: 0, ms: 0, meshN: 0, colaMin: Infinity, colaMax: 0, colaSuma: 0 });
  const oMesh = window.mcMeshChunk;
  if (oMesh) window.mcMeshChunk = function mcMeshChunk() {
    if (M) M.meshN++;
    return oMesh.apply(this, arguments);
  };
  const oRaf = window.requestAnimationFrame;
  let midiendo = true, tPrev = 0;
  const reloj = (t) => {
    if (!midiendo) return;
    if (M && tPrev) {
      M.frames++; M.ms += t - tPrev;
      try {
        const q = api.queueSize();
        if (q < M.colaMin) M.colaMin = q;
        if (q > M.colaMax) M.colaMax = q;
        M.colaSuma += q;
      } catch (e) {}
    }
    tPrev = t;
    oRaf.call(window, reloj);
  };
  oRaf.call(window, reloj);
  const cerrarMedicion = () => {
    midiendo = false;
    if (oMesh) window.mcMeshChunk = oMesh;
    cartel.remove();
  };

  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  async function fase(nombre) {
    for (let s = 2; s > 0; s--) { di('QUIETO · ' + nombre + ' — ' + s); await espera(1000); }
    di('MIDIENDO ' + nombre + ' (4 s)');
    M = nuevaM(); tPrev = 0;
    await espera(4000);
    const r = M; M = null;
    return r;
  }
  const calc = (m) => {
    const nf = Math.max(1, m.frames), sg = m.ms / 1000;
    return { fps: +(1000 / (m.ms / nf)).toFixed(1), frame: +(m.ms / nf).toFixed(2),
             meshSeg: +(m.meshN / sg).toFixed(1),
             cola: { min: m.colaMin === Infinity ? 0 : m.colaMin, max: m.colaMax,
                     media: +(m.colaSuma / nf).toFixed(0) } };
  };

  (async () => {
    try {
      const A = calc(await fase('A · SIN GOBERNADOR'));
      api.tick = tick;
      di('gobernador instalado — esperando a que la cola lo despierte (>5 s viva)');
      const t0 = performance.now();
      while (!G.gobernando && performance.now() - t0 < 15000) await espera(250);
      if (!G.gobernando) {
        cerrarMedicion();
        console.log('[gobierno] ⚠️ en 15 s la cola no estuvo 5 s viva seguidos: hoy no hay agua en ' +
          'bucle (¿mapa distinto?). El gobernador queda puesto por si vuelve; gobiernoFluidos.off() lo quita.');
        return;
      }
      const B = calc(await fase('B · GOBERNADO (1 tick/s)'));
      cerrarMedicion();
      window.gobiernoFluidos.A = A;
      window.gobiernoFluidos.B = B;
      window.gobiernoFluidos.tabla = function () {
        const linea = (n, a, b) => console.log('[gobierno] ' + n.padEnd(22) + ' A=' + a + '  B(gobernado)=' + b);
        linea('fps', A.fps, B.fps);
        linea('frame ms', A.frame, B.frame);
        linea('mcMeshChunk /s', A.meshSeg, B.meshSeg);
        console.log('[gobierno] cola en A: ' + JSON.stringify(A.cola) + ' · en B: ' + JSON.stringify(B.cola));
        if (B.fps > A.fps * 1.08 || (A.meshSeg > 5 && B.meshSeg < A.meshSeg / 4)) {
          console.log('[gobierno] ✅ TESIS VALIDADA: espaciar el agua en bucle recupera los fps (' +
            A.fps + ' → ' + B.fps + '; mallados ' + A.meshSeg + ' → ' + B.meshSeg + '/s). ' +
            'Toca graduar la caducidad por celda en el bloque de fluidos (fps-casos.md#agua, paso 2).');
        } else {
          console.log('[gobierno] ❌ gobernar no movió la aguja (' + A.fps + ' → ' + B.fps +
            '): el coste fijo NO está en la cadencia del sim. Contrastar con sonda_fluidos.js ' +
            '(¿sigue dando salto la pausa TOTAL?) antes de tocar nada.');
        }
        console.log('[gobierno] JSON: ' + JSON.stringify({ A, B, G }));
      };
      gobiernoFluidos.tabla();
      console.log('[gobierno] el gobernador SIGUE PUESTO: juega con él y vigila que el agua se vea ' +
        'bien a cámara lenta. gobiernoFluidos.estado() · gobiernoFluidos.off() para retirarlo.');
    } catch (e) { cerrarMedicion(); api.tick = oTick; console.error('[gobierno]', e); }
  })();
})();
