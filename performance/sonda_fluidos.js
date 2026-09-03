// ────────────────────────────────────────────────────────────────────────────────────────────
// SONDA DE CONSOLA · ¿ES EL AGUA QUE NUNCA SE ASIENTA? · A/B pausando game.fluidos.tick
//
// Cuarta y (previsiblemente) última vuelta del caso «mirar al suelo no ayuda» (2026-09-03):
//   · descartados: sombra (sonda_coste_fijo), luz dinámica y edición de voxeles (sonda_luz_dinamica)
//   · lo que queda: 44 mcMeshChunk/s = 1,29 ms/frame CON EL JUGADOR QUIETO, caché LRU al 18,7 %
//   · el mecanismo, leído en app.js:8816-8877: la cola de fluidos procesa ≤32 celdas cada ~90 ms
//     y si algo cambió re-malla la caja tocada cada ≥80 ms. Si unas celdas de agua se realimentan
//     (processCell → didChange → queueTick de las vecinas → …), la cola NUNCA muere:
//     ~11 ticks/s × ~4 chunks de caja = los 44 mallados/s medidos. Es el patrón FUGA +
//     REALIMENTACIÓN de CAIDA_DE_FPS.md, en agua. Escala con el agua del mapa y le da igual
//     a dónde mires — por eso los mapas grandes van mal y el suelo no ayuda.
//   · el bucle de frame llama game.fluidos.tick() POR LA API (app.js:22446) ⇒ pausable en vivo.
//
// DOS FASES quieto (~2+4 s cada una):
//   A · normal          → fps + cola de fluidos (tamaño por frame) + QUÉ chunks se re-mallan
//   B · tick pausado    → si fps↑ y mallados→0, el agua es el culpable, sin duda
// Al final: mapa de calor de chunks re-mallados con sus coordenadas de mundo, para ir volando
// a ver qué agua es la que no se calma.
//
// USO: pegar en el mapa grande, F12 cerrado, quieto. Reimprimir: sondaAgua.tabla()
// ────────────────────────────────────────────────────────────────────────────────────────────
(() => {
  const cartel = document.createElement('div');
  cartel.style.cssText = 'position:fixed;top:12%;left:0;right:0;text-align:center;z-index:99999;' +
    'font:bold 26px monospace;color:#fff;text-shadow:0 0 8px #000;pointer-events:none';
  document.body.appendChild(cartel);
  const di = (t) => { cartel.textContent = t; console.log('[sonda] ' + t); };

  const CH = (typeof MC_CHUNK !== 'undefined') ? MC_CHUNK : null;
  const api = (typeof game !== 'undefined') && game.fluidos;
  if (!api || !api.tick) { cartel.remove(); console.error('[sonda] no hay game.fluidos'); return; }

  let M = null;
  const nuevaM = () => ({ frames: 0, ms: 0, tick: 0, meshN: 0, meshMs: 0,
                          colaMin: Infinity, colaMax: 0, colaSuma: 0, colaVacia: 0,
                          chunks: Object.create(null) });

  const oRaf = window.requestAnimationFrame;
  const oTickMotor = window.mcTick, oMesh = window.mcMeshChunk;
  if (oTickMotor) window.mcTick = function mcTick() {
    const a = performance.now();
    try { return oTickMotor.apply(this, arguments); }
    finally { if (M) M.tick += performance.now() - a; }
  };
  if (oMesh) window.mcMeshChunk = function mcMeshChunk(cx, cz) {
    const a = performance.now();
    try { return oMesh.apply(this, arguments); }
    finally {
      if (M) { M.meshN++; M.meshMs += performance.now() - a;
               const k = cx + ',' + cz; M.chunks[k] = (M.chunks[k] || 0) + 1; }
    }
  };
  const oFluidTick = api.tick;

  let vivo = true;
  const restaurar = () => {
    if (!vivo) return;
    vivo = false;
    if (oTickMotor) window.mcTick = oTickMotor;
    if (oMesh) window.mcMeshChunk = oMesh;
    api.tick = oFluidTick;
    cartel.remove();
  };

  let tPrev = 0;
  const reloj = (t) => {
    if (!vivo) return;
    if (M && tPrev) {
      M.frames++; M.ms += t - tPrev;
      try {
        const q = api.queueSize();
        if (q < M.colaMin) M.colaMin = q;
        if (q > M.colaMax) M.colaMax = q;
        M.colaSuma += q; if (q === 0) M.colaVacia++;
      } catch (e) {}
    }
    tPrev = t;
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
             tick: +(m.tick / nf).toFixed(2),
             meshSeg: +(m.meshN / sg).toFixed(1), meshMs: +(m.meshMs / nf).toFixed(2),
             cola: { min: m.colaMin === Infinity ? 0 : m.colaMin, max: m.colaMax,
                     media: +(m.colaSuma / nf).toFixed(0),
                     'frames a 0': m.colaVacia + '/' + m.frames },
             chunks: m.chunks };
  };

  (async () => {
    try {
      const A = calc(await fase('A · NORMAL'));
      const B = calc(await fase('B · FLUIDOS PAUSADOS', () => { api.tick = function () {}; }));
      restaurar();
      window.sondaAgua = {
        A, B,
        tabla() {
          const linea = (n, a, b) => console.log('[sonda] ' + n.padEnd(22) + ' A=' + a + '  B(sin fluidos)=' + b);
          linea('fps', A.fps, B.fps);
          linea('frame ms', A.frame, B.frame);
          linea('mcTick ms', A.tick, B.tick);
          linea('mcMeshChunk /s', A.meshSeg, B.meshSeg);
          linea('mcMeshChunk ms/frame', A.meshMs, B.meshMs);
          console.log('[sonda] cola de fluidos en A: ' + JSON.stringify(A.cola) + ' · en B: ' + JSON.stringify(B.cola));
          const top = Object.entries(A.chunks).sort((x, y) => y[1] - x[1]).slice(0, 8);
          if (top.length) {
            console.log('[sonda] chunks re-mallados en A (chunk → veces → zona del mundo):');
            top.forEach(([k, n]) => {
              const [cx, cz] = k.split(',').map(Number);
              const zona = CH ? ('x ' + cx * CH + '…' + (cx * CH + CH - 1) + ' · z ' + cz * CH + '…' + (cz * CH + CH - 1)) : '(MC_CHUNK no visible)';
              console.log('[sonda]   ' + k + ' → ' + n + '× → ' + zona);
            });
          }
          if (B.fps > A.fps * 1.1 || (A.meshSeg > 5 && B.meshSeg < A.meshSeg / 4)) {
            console.log('[sonda] 💧 CONFIRMADO: los fluidos no se asientan. ' + A.fps + ' → ' + B.fps +
              ' fps al pausarlos, y los mallados caen de ' + A.meshSeg + '/s a ' + B.meshSeg +
              '/s. El agua inquieta vive en los chunks de arriba: vuela allí y mírala.');
            console.log('[sonda]    remedios en orden (ley de oro: validar en caliente antes de tocar nada):' +
              ' 1) calmar ese agua en el mapa (arreglo de datos);' +
              ' 2) caducidad/techo en el sim: celda que lleva N ticks oscilando deja de re-encolarse (el «C» del caso flecha);' +
              ' 3) game.fluidos.rebuild() la vacía en vivo para probar.');
          } else if (A.cola.media > 0 && A.meshSeg > 5) {
            console.log('[sonda] 🤔 La cola vive (' + JSON.stringify(A.cola) + ') pero pausarla no movió los fps: el coste está en otro sitio y el mallado de fluidos es síntoma barato. Vuelve al reparto con game.perfVerbosity=2 + perfDump().');
          } else {
            console.log('[sonda] 🌊 La cola está seca y los mallados no vienen de fluidos: mirar el mapa de chunks de arriba y qué hay en esa zona (notas, texturas animadas, finos).');
          }
          console.log('[sonda] JSON: ' + JSON.stringify({ A, B }));
        }
      };
      sondaAgua.tabla();
    } catch (e) { restaurar(); console.error('[sonda]', e); }
  })();
})();
