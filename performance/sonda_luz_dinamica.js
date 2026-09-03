// ────────────────────────────────────────────────────────────────────────────────────────────
// SONDA DE CONSOLA · ¿ES LA LUZ DINÁMICA? · A/B en caliente + inventario de emisores
//
// Cadena que la trae (2026-09-03, tercera vuelta del caso «mirar al suelo no ayuda»):
//   · sonda_mirar_suelo:  frame plano venga a donde mires ⇒ coste independiente de la vista
//   · sonda_coste_fijo:   la sombra NO es (A≈B≈C); 44 mcMeshChunk/s con el jugador QUIETO;
//                         caché LRU al 18,7 % de aciertos (35.748 misses)
//   · lectura de código:  los re-mallados en masa de app.js:12457 y :12981 viven en
//                         mcDynSync/mcDynBake — LA LUZ DINÁMICA re-malla su caja de chunks
//                         cada vez que la firma cambia (12544/12762). Emisores = estructuras
//                         con emitFinos, INCLUIDA la herramienta en mano (12369+). Una pieza
//                         emisiva que GIRA (las hay en este mundo) cambia la firma SIEMPRE.
//                         Y game.cacheStrict existe justo para diagnosticar «la luz hace la
//                         firma del mesh inestable» (11272).
//
// TRES FASES quieto (~2+4 s cada una, total ~20 s):
//   A · normal
//   B · mc.luzDinamica=false   → luz dinámica APAGADA del todo
//   C · luz puesta + game.cacheStrict=false → la firma del mesh IGNORA mc.blockLight
// Además: inventario de estructuras emisivas (y cuáles MOVIERON su matriz durante la sonda,
// que son las que invalidan la firma), nº de cambios de mc._dynSig por segundo, y pilas de
// mcSetVoxel por si además alguien edita el mundo en reposo (fluidos/redstone).
//
// USO: pegar en el mapa grande, cerrar F12, quieto siguiendo el cartel; reabrir F12.
// El volcado sale como TEXTO plano (nada de objetos colapsables). Repetir: sondaLuz.tabla()
// Restaura mandos y envolturas al terminar o al fallar.
// ────────────────────────────────────────────────────────────────────────────────────────────
(() => {
  const cartel = document.createElement('div');
  cartel.style.cssText = 'position:fixed;top:12%;left:0;right:0;text-align:center;z-index:99999;' +
    'font:bold 26px monospace;color:#fff;text-shadow:0 0 8px #000;pointer-events:none';
  document.body.appendChild(cartel);
  const di = (t) => { cartel.textContent = t; console.log('[sonda] ' + t); };

  // inventario de emisores + foto de sus matrices para saber cuáles se MUEVEN
  const emisores = [];
  try {
    mc.structures.forEach((s, i) => {
      if (s.emitFinos && s.emitFinos.length) emisores.push({
        i, nombre: s.nombre || s.id || s.asset || s.name || ('#' + i),
        celdas: s.emitFinos.length / 3, pos: [s.ox | 0, s.oy | 0, s.oz | 0],
        m0: s.model ? Array.from(s.model) : null, movio: false
      });
    });
  } catch (e) {}

  let M = null;
  const nuevaM = () => ({ frames: 0, ms: 0, tick: 0, dyn: 0, meshN: 0, meshMs: 0, sigCambios: 0, setVox: 0 });
  const pilasVox = Object.create(null);

  const oRaf = window.requestAnimationFrame;
  const env = [];
  const envuelve = (nombre, alrededor) => {
    const f = window[nombre];
    if (typeof f !== 'function') { console.warn('[sonda] no existe', nombre); return; }
    env.push([nombre, f]);
    const w = alrededor(f);
    Object.defineProperty(w, 'name', { value: nombre });
    window[nombre] = w;
  };
  const mide = (campo) => (f) => function () {
    const a = performance.now();
    try { return f.apply(this, arguments); }
    finally { if (M) M[campo] += performance.now() - a; }
  };
  envuelve('mcTick', mide('tick'));
  envuelve('mcDynSync', mide('dyn'));
  envuelve('mcDynBake', mide('dyn'));
  envuelve('mcMeshChunk', (f) => function () {
    const a = performance.now();
    try { return f.apply(this, arguments); }
    finally { if (M) { M.meshN++; M.meshMs += performance.now() - a; } }
  });
  envuelve('mcSetVoxel', (f) => function () {
    if (M) M.setVox++;
    const s = (new Error().stack || '').split('\n').slice(2, 5)
      .map((l) => l.trim().replace(/^at /, '')).join(' ← ');
    if (Object.keys(pilasVox).length < 12 || pilasVox[s]) pilasVox[s] = (pilasVox[s] || 0) + 1;
    return f.apply(this, arguments);
  });

  const mandos = { luz: mc.luzDinamica,
                   strict: (typeof game !== 'undefined') ? game.cacheStrict : undefined,
                   strictTenia: (typeof game !== 'undefined') && ('cacheStrict' in game) };
  let vivo = true;
  const restaurar = () => {
    if (!vivo) return;
    vivo = false;
    env.forEach(([n, f]) => { window[n] = f; });
    mc.luzDinamica = mandos.luz;
    try { if (mandos.strictTenia) game.cacheStrict = mandos.strict; else delete game.cacheStrict; } catch (e) {}
    cartel.remove();
  };

  let tPrev = 0, sigPrev;
  const reloj = (t) => {
    if (!vivo) return;
    if (M && tPrev) {
      M.frames++; M.ms += t - tPrev;
      if (mc._dynSig !== sigPrev) M.sigCambios++;
    }
    sigPrev = mc._dynSig; tPrev = t;
    oRaf.call(window, reloj);
  };
  oRaf.call(window, reloj);

  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  async function fase(nombre, prepara) {
    for (let s = 2; s > 0; s--) { di('QUIETO · ' + nombre + ' — ' + s); await espera(1000); }
    if (prepara) prepara();
    di('MIDIENDO ' + nombre + ' (4 s)');
    M = nuevaM(); tPrev = 0;
    await espera(4000);
    const r = M; M = null;
    return r;
  }
  const calc = (m) => {
    const nf = Math.max(1, m.frames), sg = m.ms / 1000;
    return { fps: +(1000 / (m.ms / nf)).toFixed(1), frame: +(m.ms / nf).toFixed(2),
             tick: +(m.tick / nf).toFixed(2), dyn: +(m.dyn / nf).toFixed(2),
             meshSeg: +(m.meshN / sg).toFixed(1), meshMs: +(m.meshMs / nf).toFixed(2),
             sigCambiosSeg: +(m.sigCambios / sg).toFixed(1), setVoxSeg: +(m.setVox / sg).toFixed(1) };
  };

  (async () => {
    try {
      const A = calc(await fase('A · NORMAL'));
      const B = calc(await fase('B · LUZ DINÁMICA OFF', () => { mc.luzDinamica = false; }));
      const C = calc(await fase('C · LUZ ON + cacheStrict=false', () => {
        mc.luzDinamica = mandos.luz;
        try { game.cacheStrict = false; } catch (e) {}
      }));
      // ¿qué emisor movió su matriz durante la sonda?
      try {
        emisores.forEach((e) => {
          const s = mc.structures[e.i];
          if (s && s.model && e.m0) e.movio = s.model.some((v, j) => Math.abs(v - e.m0[j]) > 1e-6);
        });
      } catch (e) {}
      restaurar();
      window.sondaLuz = {
        A, B, C, emisores, pilasVox,
        tabla() {
          // TEXTO plano a propósito: los console.table colapsan con DevTools cerrado
          const linea = (n, k) => console.log('[sonda] ' + n.padEnd(22) +
            ' A=' + A[k] + '  B(luz off)=' + B[k] + '  C(strict off)=' + C[k]);
          linea('fps', 'fps'); linea('frame ms', 'frame'); linea('mcTick ms', 'tick');
          linea('luz dinámica ms', 'dyn'); linea('mcMeshChunk /s', 'meshSeg');
          linea('mcMeshChunk ms/frame', 'meshMs'); linea('cambios de firma /s', 'sigCambiosSeg');
          linea('mcSetVoxel /s', 'setVoxSeg');
          console.log('[sonda] emisores: ' + (emisores.length ? emisores.map((e) =>
            e.nombre + ' (' + e.celdas + ' celdas' + (e.movio ? ', SE MUEVE' : '') + ')').join(' · ') : 'ninguno'));
          const v = [];
          if (B.fps > A.fps * 1.15) {
            v.push('💡 CONFIRMADO: la luz dinámica se lleva ' + (B.fps - A.fps).toFixed(0) +
                   ' fps (' + A.fps + ' → ' + B.fps + ' apagándola).');
            const moviles = emisores.filter((e) => e.movio);
            if (moviles.length)
              v.push('   culpable(s) con emisor EN MOVIMIENTO: ' + moviles.map((e) => e.nombre).join(', ') +
                     ' — cada frame invalidan la firma (' + A.sigCambiosSeg + ' cambios/s) y mcDynBake re-malla su caja.');
            if (C.fps > (A.fps + B.fps) / 2)
              v.push('   cacheStrict=false recupera parte ⇒ el LRU pierde por la luz en la firma, como avisa app.js:11272.');
          } else {
            v.push('🕯️ La luz dinámica NO es (A≈B). Si mcSetVoxel/s > 0, alguien edita el mundo en reposo → sondaLuz.voxeles(). Si no, el reparto manda de vuelta a game.perfVerbosity=2 + perfDump().');
          }
          v.forEach((l) => console.log('[sonda] ' + l));
          console.log('[sonda] JSON: ' + JSON.stringify({ A, B, C, emisores: emisores.map((e) =>
            ({ n: e.nombre, celdas: e.celdas, movio: e.movio })), pilasVox }));
        },
        voxeles() {
          Object.entries(pilasVox).sort((x, y) => y[1] - x[1])
            .forEach(([k, n]) => console.log('[sonda] ' + n + '× ' + k));
        }
      };
      sondaLuz.tabla();
    } catch (e) { restaurar(); console.error('[sonda]', e); }
  })();
})();
