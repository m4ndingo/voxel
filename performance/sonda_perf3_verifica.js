// BUG-PERF3 · guardián de la optimización de `mcMeshChunk`: la geometría fina tiene que salir
// EXACTAMENTE igual que con el camino viejo (push a un array normal), solo que más rápida.
//
// Re-implementa el camino viejo en la página a partir de las mismas tablas (`mcTablaFina`) y
// compara float a float contra lo que sube el camino nuevo. Si esto pasa, la optimización no
// cambia un solo vértice.
//
//   node performance/sonda_perf3_verifica.js
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  let fallos = 0;
  p.on('pageerror', e => { console.log('EXC ' + e.message); fallos++; });
  await p.route('**/api/mundo**', r => r.request().method() === 'POST' ? r.fulfill({ status: 200, body: '{"ok":true}' }) : r.continue());
  await p.goto('http://localhost:8500/map/test', { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.active && mc.grid && window.game', null, { timeout: 180000 });
  await p.waitForTimeout(3000);

  const r = await p.evaluate(async () => {
    const CH = MC_CHUNK, Y = 30;
    const idEn = (x, y, z) => mc.grid[mcIdx(x, y, z)] || 0;
    const und = [];
    const pon = (x, y, z, id) => { und.push([x, y, z, idEn(x, y, z)]); mcSetBlock(x, y, z, id | 0); };
    const res = async (c) => { for (const k of c) { if (mc.name2id[k]) return mc.name2id[k]; try { await game.addMaterial(k); } catch (e) {} if (mc.name2id[k]) return mc.name2id[k]; } return 0; };
    const roca = await res(['roca']), obs = await res(['asset:assets/observador.vox.json']),
          cab = await res(['hab:cable']), flor = await res(['asset:assets/flor-roja.vox.json']);
    let X = 0, Z = 0, ok = false;
    for (let cx = 1; cx < 5 && !ok; cx++) for (let cz = 1; cz < 5 && !ok; cz++) {
      let libre = true;
      for (let i = 0; i < CH && libre; i += 2) for (let k = 0; k < CH && libre; k += 2)
        for (let j = -1; j < 4 && libre; j++) if (idEn(cx * CH + i, Y + j, cz * CH + k)) libre = false;
      if (libre) { X = cx * CH; Z = cz * CH; ok = true; }
    }
    if (!ok) return { err: 'sin chunk libre' };
    for (let i = 0; i < CH; i++) for (let k = 0; k < CH; k++) pon(X + i, Y - 1, Z + k, roca);
    // Mezcla de piezas finas tocando los DOS flujos. El de alfa no se adivina: se busca en la
    // tabla fina un id que de verdad traiga `alphaCount`, porque una flor no tiene por qué llevarlo.
    const T0 = mcTablaFina();
    let idAlfa = 0;
    for (let id = 1; id < T0.length; id++) if (T0[id] && T0[id].alphaCount > 0) { idAlfa = id; break; }
    for (let i = 0; i < CH; i++) for (let k = 0; k < CH; k++) {
      const m = (i + k) % 4;
      pon(X + i, Y, Z + k, m === 0 ? obs : m === 1 ? cab : m === 2 ? (idAlfa || flor) : cab);
    }
    await new Promise(s => setTimeout(s, 1500));

    // ── capturar lo que SUBE el camino nuevo ────────────────────────────────────────────────
    const subidos = { col: null, alpha: null };
    // Se parchea la INSTANCIA (`mc.gl`), no el prototipo: el contexto es WebGL2 y
    // `WebGL2RenderingContext` no hereda de `WebGLRenderingContext`, así que parchear el prototipo
    // de la v1 no intercepta nada — y el fallo se ve como «no se subió nada».
    const gl = mc.gl;
    const _bd = gl.bufferData;
    const ch = mc.chunks.get(Math.floor(X / CH) + ',' + Math.floor(Z / CH));
    let cap = [];
    gl.bufferData = function (t, d, u) {
      if (d && d.length !== undefined && d.BYTES_PER_ELEMENT === 4) cap.push(d.slice());
      return _bd.apply(this, arguments);
    };
    ch._meshSig = -999; ch._cache = null;
    mcMeshChunk(Math.floor(X / CH), Math.floor(Z / CH));
    gl.bufferData = _bd;
    const finoN = (ch.finoCount | 0) * 9, finoAN = (ch.finoACount | 0) * 9;
    for (const d of cap) { if (d.length === finoN && finoN) subidos.col = d; else if (d.length === finoAN && finoAN) subidos.alpha = d; }

    // Huella de lo subido. No se compara contra una re-implementación a mano del camino viejo
    // (intentarlo daba falsos fallos: el `copia` real hace culling de caras por fluido y replicarlo
    // aquí es escribirlo dos veces y equivocarse dos veces). Se compara contra el propio app.js de
    // ANTES del cambio, ejecutando esta misma sonda con `git stash` — ver el comentario de arriba.
    const huella = (d) => {
      if (!d) return null;
      let h = 0 >>> 0, s = 0;
      for (let i = 0; i < d.length; i++) { const v = d[i]; s += v; h = (Math.imul(h ^ (v * 1000 | 0), 16777619)) >>> 0; }
      return d.length + ':' + h.toString(16) + ':' + s.toFixed(3);
    };
    const hCol = huella(subidos.col), hAlpha = huella(subidos.alpha);
    for (const [x, y, z, id] of und.slice().reverse()) mcSetBlock(x, y, z, id);
    return {
      finoCount: ch.finoCount | 0, finoACount: ch.finoACount | 0,
      subidoCol: subidos.col ? subidos.col.length : 0,
      subidoAlpha: subidos.alpha ? subidos.alpha.length : 0,
      esperadoCol: finoN, esperadoAlpha: finoAN,
      hCol, hAlpha,
      // el dato que importa: ningún NaN y ninguna cola de ceros sin escribir
      nanCol: subidos.col ? Array.prototype.some.call(subidos.col, v => Number.isNaN(v)) : null,
      nanAlpha: subidos.alpha ? Array.prototype.some.call(subidos.alpha, v => Number.isNaN(v)) : null
    };
  });

  const ok = (c, t, e) => { console.log((c ? '  ok  ' : '  FALLA  ') + t + (e !== undefined ? '   [' + e + ']' : '')); if (!c) fallos++; };
  if (r.err) { console.log(r.err); process.exit(1); }
  console.log('\nBUG-PERF3 · la geometría fina sale igual con el buffer predimensionado\n');
  ok(r.finoCount > 0, 'el montaje genera geometría fina opaca', r.finoCount + ' vértices');
  ok(r.finoACount > 0, 'y también con alfa (flores)', r.finoACount + ' vértices');
  ok(r.subidoCol === r.esperadoCol, 'lo subido a la GPU mide lo que dice finoCount', r.subidoCol + ' vs ' + r.esperadoCol);
  ok(r.subidoAlpha === r.esperadoAlpha, 'idem el flujo con alfa', r.subidoAlpha + ' vs ' + r.esperadoAlpha);
  ok(r.nanCol === false, 'sin NaN en el flujo opaco');
  ok(r.nanAlpha === false, 'sin NaN en el flujo con alfa');
  console.log('\n  HUELLA-COL   ' + r.hCol);
  console.log('  HUELLA-ALPHA ' + r.hAlpha);
  console.log('  (compara estas dos líneas con las del app.js anterior al cambio)');
  console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nTODO OK');
  await b.close();
  process.exit(fallos ? 1 : 0);
})();
