// @area: render
// @necesita: servidor, playwright
// BUG-GLOW3 (secuela de BUG-GLOW2) · La luz de un emisor montado en un agente (voxels autoiluminados en una pieza de
// esqueleto) le sigue al moverse, pero AHORA como LUZ DINÁMICA por-fragmento, no re-sembrando la luz de bloque:
//   · suave y sin retardo → sigue la posición VIVA y CONTINUA del emisor (del s.model), sin cuantizar a celda (los
//     "trompicones" de BUG-GLOW2 eran justo la granularidad de 1 bloque);
//   · sin caídas de fps → mientras el agente se mueve NO se recalcula la luz de bloque (ni BFS ni remallado). Eso solo
//     ocurre UNA vez cuando el emisor pasa de montado↔quieto (cambia de mecanismo).
// El test estampa un cubo emisivo, le pone una traslación en s.model como hace la librería de esqueletos, y comprueba:
//   (A) quieto → es luz de bloque estática (sembrada en su celda); no hay luces dinámicas.
//   (B) al empezar a moverse → sale de la luz de bloque y entra como luz dinámica en su posición viva (1 recálculo).
//   (C) al seguir moviéndose en pasos FRACCIONARIOS → la luz dinámica sigue EXACTA y continua, con CERO recálculos.
//   (D) game.agentsLightTracking(false) → se apaga la luz dinámica y vuelve a la celda estampada.
// No persiste nada: bloquea el POST del mundo y retira lo que estampa.
const { chromium } = require('playwright');

let fallos = 0;
const ok = (nom, cond, extra) => {
  console.log((cond ? '  ok  ' : '  FALLA  ') + nom + (extra ? '   (' + extra + ')' : ''));
  if (!cond) fallos++;
};

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push(String(e)));
  await p.addInitScript(() => {
    const orig = window.fetch;
    window.fetch = (u, o) => {
      const url = String((u && u.url) || u);
      if (o && String(o.method || 'GET').toUpperCase() === 'POST' && /\/api\/mundo/.test(url)) {
        return Promise.resolve(new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }
      return orig(u, o);
    };
  });

  await p.goto('http://localhost:8500/map/agents', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction('typeof mc !== "undefined" && mc.prog && mc.active && mc.grid', { timeout: 120000 });
  await p.waitForTimeout(3000);

  const r = await p.evaluate(async () => {
    const out = { errs: [] };
    const bx = Math.floor(mc.pos[0]), bz = Math.floor(mc.pos[2]);
    let sy = -1;
    for (let y = mc.dim.y - 1; y >= 0; y--) if (mc.grid[mcIdx(bx, y, bz)]) { sy = y; break; }
    if (sy < 0) { out.errs.push('sin suelo bajo el jugador'); return out; }
    if (!(mc.glowLevel > 0)) mc.glowLevel = 12;
    if (typeof game === 'undefined' || typeof game.agentsLightTracking !== 'function') { out.errs.push('falta game.agentsLightTracking'); return out; }
    if (typeof mcDynSync !== 'function') { out.errs.push('falta mcDynSync'); return out; }
    game.agentsLightTracking(true);

    const S = 16;
    const vox = {};
    for (let x = 0; x < S; x++) for (let y = 0; y < S; y++) for (let z = 0; z < S; z++) vox[x + ',' + y + ',' + z] = '*#ffdd88';
    roomDataCache.set('zz-luzmovil', Promise.resolve({ size: { x: S, y: S, z: S }, meta: { name: 'zz-luzmovil', type: 'bloque' }, voxels: vox }));

    // luz de bloque en una columna 3x3 alrededor de (cx,cz)
    const luzBloque = (cx, cz) => {
      let s = 0;
      for (let x = cx - 1; x <= cx + 1; x++) for (let z = cz - 1; z <= cz + 1; z++)
        for (let y = sy; y <= sy + 3; y++) {
          if (x < 0 || z < 0 || x >= mc.dim.x || z >= mc.dim.z || y >= mc.dim.y) continue;
          s += mc.blockLight ? mc.blockLight[mcIdx(x, y, z)] : 0;
        }
      return s;
    };

    const OX = bx - 6, OZ = bz;
    await mcStampStruct('zz-luzmovil', OX, sy + 1, OZ, 0, true);
    const S0 = mc.structures.find(o => o.key === 'zz-luzmovil');
    if (!S0) { out.errs.push('no se estampo la estructura'); return out; }
    out.tieneEmit = !!(S0.emitCells && S0.emitCells.length);
    const CX = OX + 0.5;   // centro (en X) de la única celda emisiva del cubo (16³ = 1 celda de bloque)

    // contador de recálculos de luz de bloque (el coste que BUG-GLOW2 pagaba por cada paso)
    let bfs = 0;
    const bfsOrig = window.mcComputeBlockLight;
    window.mcComputeBlockLight = function () { bfs++; return bfsOrig.apply(this, arguments); };

    // ── (A) QUIETO (sin s.model): es luz de bloque estática, no dinámica ────────────────────────────────────────
    S0.model = null;
    mcDynSync();
    out.A_luzBloque = luzBloque(OX, OZ);
    out.A_dynN = mc._dynN | 0;

    // ── (B) EMPIEZA A MOVERSE: s.model traslación → sale de block light, entra como luz dinámica (1 recálculo) ───
    bfs = 0;
    S0.model = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 5.3,0,0,1]);
    mcDynSync();
    out.B_bfs = bfs;                       // debe ser 1 (transición montado↔quieto)
    out.B_dynN = mc._dynN | 0;             // debe ser 1
    out.B_dynX = mc._dynArr ? mc._dynArr[0] : null;
    out.B_esperadoX = CX + 5.3;
    out.B_luzBloqueEnStamp = luzBloque(OX, OZ);   // ya no debe estar horneada en el spawn

    // ── (C) SIGUE MOVIÉNDOSE en pasos FRACCIONARIOS: continuo y EXACTO, con CERO recálculos ─────────────────────
    bfs = 0;
    let maxErr = 0;
    for (const tx of [5.6, 5.9, 6.2, 6.55, 7.03]) {
      S0.model[12] = tx;
      mcDynSync();
      maxErr = Math.max(maxErr, Math.abs((mc._dynArr ? mc._dynArr[0] : 1e9) - (CX + tx)));
    }
    out.C_bfs = bfs;                       // debe ser 0 → sin BFS por paso = sin caídas de fps
    out.C_maxErrPos = maxErr;              // debe ser ~0 → la luz sigue la posición continua (suave, sin trompicones)

    // ── (E) DIRECCIONAL: con un haz emisivo (emitDir) y foco, alumbra DELANTE y NO hacia atrás (queja del dueño) ──
    // Replica dynLuz del shader desde los uniforms REALES que sube el motor (mc._dynArr/_dynDir): es la misma fórmula.
    S0.model[12] = 6.0; S0.emitDir = new Int16Array([100, 0, 0]);   // haz hacia +X
    mc.glowFocus = 0.3;
    mcDynSync();
    const P = [mc._dynArr[0], mc._dynArr[1], mc._dynArr[2]];
    const bd = [mc._dynDir[0], mc._dynDir[1], mc._dynDir[2]], foco = mc._dynDir[3];
    const dynLuzJS = (w) => {                          // == MC_DYNLIGHT_LIB
      const d = Math.hypot(w[0]-P[0], w[1]-P[1], w[2]-P[2]);
      let rad = Math.max(0, Math.min(1, (mc._dynArr[3] - d) / 15));
      if (rad <= 0) return 0;
      const bl = Math.hypot(bd[0], bd[1], bd[2]);
      if (foco > 0 && bl > 0.5 && d > 1e-4) {
        const c = ((w[0]-P[0])*bd[0] + (w[1]-P[1])*bd[1] + (w[2]-P[2])*bd[2]) / (d*bl);
        rad *= Math.pow(Math.max(c, 0), 1 + foco*8);
      }
      return rad;
    };
    out.E_delante = dynLuzJS([P[0]+3, P[1], P[2]]);    // en la dirección del haz (+X)
    out.E_detras  = dynLuzJS([P[0]-3, P[1], P[2]]);    // detrás del haz (−X)
    out.E_haz = bd.slice(); out.E_foco = foco;
    S0.emitDir = null; mc.glowFocus = 0.2;

    // ── (D) apagar el seguimiento: se acaba la luz dinámica y vuelve a la celda estampada ───────────────────────
    window.mcComputeBlockLight = bfsOrig;
    game.agentsLightTracking(false);
    mcDynSync();
    out.D_dynN = mc._dynN | 0;                       // 0
    out.D_luzBloqueEnStamp = luzBloque(OX, OZ);      // vuelve a estar horneada en el spawn (celda estampada)

    // limpieza
    game.agentsLightTracking(true);
    const s = mc.structures.find(o => o.key === 'zz-luzmovil'); if (s) mcRemoveStruct(s, true);
    roomDataCache.delete('zz-luzmovil'); delete mc.structs['zz-luzmovil'];
    out.limpio = !mc.structures.some(o => /^zz-/.test(o.key));
    return out;
  });

  if (r.errs && r.errs.length) r.errs.forEach(e => ok('preparacion: ' + e, false));

  console.log('\nLa pieza emisiva es una estructura con emitCells');
  ok('la estructura estampada tiene celdas emisivas', r.tieneEmit === true);

  console.log('\n(A) Quieto: luz de bloque estática, sin luces dinámicas');
  ok('el spawn está iluminado por luz de bloque', r.A_luzBloque > 0, 'suma=' + r.A_luzBloque);
  ok('no hay luces dinámicas', r.A_dynN === 0, 'dynN=' + r.A_dynN);

  console.log('\n(B) Al moverse: pasa a luz DINÁMICA en su posición viva (1 solo recálculo)');
  ok('un único recálculo de luz de bloque (la transición)', r.B_bfs === 1, 'bfs=' + r.B_bfs);
  ok('entra 1 luz dinámica', r.B_dynN === 1, 'dynN=' + r.B_dynN);
  ok('la luz dinámica está en la posición viva del emisor', Math.abs(r.B_dynX - r.B_esperadoX) < 0.01,
    'x=' + (r.B_dynX && r.B_dynX.toFixed(3)) + ' esperado ' + r.B_esperadoX.toFixed(3));
  ok('sale de la luz de bloque del spawn', r.B_luzBloqueEnStamp < r.A_luzBloque * 0.2,
    'antes ' + r.A_luzBloque + ' ahora ' + r.B_luzBloqueEnStamp);

  console.log('\n(C) Siguiendo en pasos fraccionarios: SUAVE y sin caídas de fps');
  ok('CERO recálculos de luz de bloque mientras se mueve (= sin caídas de fps)', r.C_bfs === 0, 'bfs=' + r.C_bfs);
  ok('la luz sigue la posición CONTINUA sin cuantizar (= sin trompicones)', r.C_maxErrPos < 0.001,
    'errMax=' + (r.C_maxErrPos != null ? r.C_maxErrPos.toExponential(1) : '?'));

  console.log('\n(E) Con haz emisivo + foco: alumbra DELANTE, no hacia atrás (queja del dueño)');
  ok('delante del haz sí ilumina', r.E_delante > 0.2, 'delante=' + (r.E_delante != null ? r.E_delante.toFixed(3) : '?'));
  ok('detrás del haz NO ilumina', r.E_detras < 0.01, 'detras=' + (r.E_detras != null ? r.E_detras.toFixed(3) : '?'));
  ok('el haz apunta a +X (rotado por la pose)', r.E_haz && r.E_haz[0] > 0.5 && Math.abs(r.E_haz[2]) < 0.5,
    'haz=[' + (r.E_haz || []).map(v => v.toFixed(0)).join(',') + ']');

  console.log('\n(D) Con el seguimiento apagado: vuelve a la celda estampada');
  ok('no quedan luces dinámicas', r.D_dynN === 0, 'dynN=' + r.D_dynN);
  ok('la luz vuelve a hornearse en el spawn', r.D_luzBloqueEnStamp > 0, 'suma=' + r.D_luzBloqueEnStamp);

  ok('limpieza: la estructura de prueba se retira', r.limpio === true);
  ok('sin errores de pagina', errores.length === 0);
  if (errores.length) console.log(errores.join('\n'));

  await b.close();
  console.log(fallos ? '\n' + fallos + ' fallo(s)' : '\n15 ok, 0 fallos');
  process.exit(fallos ? 1 : 0);
})();
