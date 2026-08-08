// @area: render
// @necesita: servidor, playwright
// mcRestampAll re-mallaba TODO el terreno en cada estampado "porque el brillo pudo cambiar". Con 48 estructuras eso
// era la fase mas cara del estampado (61 de 134 ms medidos) y casi siempre para nada: la mayoria de estructuras no
// son emisivas, asi que la luz de bloque sale identica y las mallas del terreno se rehacen iguales.
// Ahora se compara mc.blockLight antes/despues y solo se re-malla si cambio de verdad.
//
// Este test guarda las dos mitades del trato: que el atajo se tome cuando NO hay emisivos, y —lo importante— que NO
// se tome cuando si los hay, porque ahi el terreno vecino tiene que encenderse de verdad.
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
    if (!(mc.glowLevel > 0)) mc.glowLevel = 12;          // sin nivel de brillo no hay luz que medir

    let meshes = 0;
    const meshOrig = window.mcMeshAll;
    window.mcMeshAll = function () { meshes++; return meshOrig.apply(this, arguments); };

    const S = 16;
    const cubo = (color, key) => {
      const vox = {};
      for (let x = 0; x < S; x++) for (let y = 0; y < S; y++) for (let z = 0; z < S; z++) vox[x + ',' + y + ',' + z] = color;
      roomDataCache.set(key, Promise.resolve({ size: { x: S, y: S, z: S }, meta: { name: key, type: 'bloque' }, voxels: vox }));
      return key;
    };
    // Suma de luz de bloque en el terreno de alrededor, que es lo que el atajo se juega.
    const luzCerca = (cx, cz) => {
      let s = 0;
      for (let x = cx - 3; x <= cx + 3; x++) for (let z = cz - 3; z <= cz + 3; z++)
        for (let y = sy; y <= sy + 4; y++) {
          if (x < 0 || z < 0 || x >= mc.dim.x || z >= mc.dim.z || y >= mc.dim.y) continue;
          s += mc.blockLight ? mc.blockLight[mcIdx(x, y, z)] : 0;
        }
      return s;
    };

    // --- 1. Estructura APAGADA: el terreno no cambia de brillo, hay que tomar el atajo -----------------------
    cubo('#8a7a5c', 'zz-apagada');
    out.luzAntesApagada = luzCerca(bx + 5, bz);
    meshes = 0;
    let t0 = performance.now();
    await mcStampStruct('zz-apagada', bx + 5, sy + 1, bz, 0, true);
    out.msApagada = Math.round(performance.now() - t0);
    out.meshesApagada = meshes;
    out.luzTrasApagada = luzCerca(bx + 5, bz);

    // --- 2. Estructura EMISIVA: el terreno SI se enciende, no se puede tomar el atajo ------------------------
    cubo('*#ffdd88', 'zz-encendida');
    meshes = 0;
    t0 = performance.now();
    await mcStampStruct('zz-encendida', bx - 5, sy + 1, bz, 0, true);
    out.msEncendida = Math.round(performance.now() - t0);
    out.meshesEncendida = meshes;
    out.luzTrasEncendida = luzCerca(bx - 5, bz);
    out.hasGlow = mc.hasGlow;

    // --- 3. Y al quitarla, el terreno se apaga (el atajo tampoco puede tragarse esto) ------------------------
    const enc = mc.structures.find(o => o.key === 'zz-encendida');
    meshes = 0;
    if (enc) mcRemoveStruct(enc, true);
    await new Promise(r => setTimeout(r, 400));
    out.meshesAlQuitar = meshes;
    out.luzTrasQuitar = luzCerca(bx - 5, bz);

    window.mcMeshAll = meshOrig;
    for (const k of ['zz-apagada', 'zz-encendida']) {
      const s = mc.structures.find(o => o.key === k); if (s) mcRemoveStruct(s, true);
      roomDataCache.delete(k); delete mc.structs[k];
    }
    out.limpio = !mc.structures.some(o => /^zz-/.test(o.key));
    return out;
  });

  if (r.errs && r.errs.length) r.errs.forEach(e => ok('preparacion: ' + e, false));

  console.log('\nEstampar algo NO emisivo no re-malla el terreno');
  ok('no se llamo a mcMeshAll', r.meshesApagada === 0, r.meshesApagada + ' mcMeshAll, ' + r.msApagada + ' ms');
  ok('y la luz de bloque del terreno sigue igual', r.luzTrasApagada === r.luzAntesApagada,
    r.luzAntesApagada + ' -> ' + r.luzTrasApagada);

  console.log('\nEstampar algo EMISIVO si re-malla: el terreno vecino tiene que encenderse');
  ok('se llamo a mcMeshAll', r.meshesEncendida >= 1, r.meshesEncendida + ' mcMeshAll, ' + r.msEncendida + ' ms');
  ok('mc.hasGlow queda activo', r.hasGlow === true);
  ok('el terreno de alrededor recibe luz de bloque', r.luzTrasEncendida > 0, 'suma=' + r.luzTrasEncendida);

  console.log('\nQuitar la fuente apaga el terreno');
  ok('se volvio a mallar al quitarla', r.meshesAlQuitar >= 1, r.meshesAlQuitar + ' mcMeshAll');
  ok('la luz de alrededor vuelve a cero', r.luzTrasQuitar === 0, 'suma=' + r.luzTrasQuitar);

  ok('limpieza: las estructuras de prueba se retiran', r.limpio === true);
  ok('sin errores de pagina', errores.length === 0);
  if (errores.length) console.log(errores.join('\n'));

  await b.close();
  console.log(fallos ? '\n' + fallos + ' fallo(s)' : '\n9 ok, 0 fallos');
  process.exit(fallos ? 1 : 0);
})();