// @area: fisica
// @necesita: servidor, playwright
// BUG-AG7 · «se sube automáticamente a sus brazos si está cerca […] estaría bien deshabilitar el
// "unstuck" automático, que sea un game.autoUnstick = false por defecto, si hay que hacerlo a mano
// creo recordar que existía la tecla "u"».
//
// La auto-curación de `mcUpdate` llama a `mcUnstick`, y `mcUnstick` SOLO sabe buscar salida HACIA
// ARRIBA: el primer hueco de aire sobre lo que te embute es justo la cota de montarse encima. Con los
// brazos de un agente vueltos sólidos (BUG-AG4), rozar uno te plantaba a caballito. Es el mismo
// mecanismo del BUG-RS9 con la cabeza del pistón.
//
//   A · el valor por defecto           → game.autoUnstick === false, y persiste al tocarlo
//   B · embutido con autoUnstick OFF   → te quedas donde estás; NO te sube
//   C · …y la tecla U te saca          → game.unstick() (lo mismo que la tecla) sí te sube
//   D · embutido con autoUnstick ON    → la conducta de siempre, intacta: te sube
//   E · el empujón horizontal de un agente que te embiste NO se toca (mcAgentShove)
//
// Lo que impide el falso verde es D: sin él, «no te sube» lo cumpliría igual un mcUpdate roto.
//
// No persiste nada en el mundo: devuelve cada celda tocada a su id anterior y al jugador a su sitio.
//
//   node test_auto_unstick.js [url]        por defecto http://localhost:8500/map/test
const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8500/map/test';
let fallos = 0;
function ok(cond, msg, extra) {
  if (!cond) fallos++;
  console.log((cond ? '  ok  ' : '  FALLA  ') + msg + (extra ? '   [' + extra + ']' : ''));
}
const r3 = n => Math.round(n * 1000) / 1000;

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push(String(e)));
  await p.addInitScript(() => {
    const orig = window.fetch;
    window.fetch = (u, o) => {
      const url = String((u && u.url) || u);
      if (o && String(o.method || 'GET').toUpperCase() !== 'GET' && /\/api\/(mundo|habitantes)/.test(url))
        return Promise.resolve(new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
      return orig(u, o);
    };
    // El valor por defecto se mide LIMPIO: si una sesión anterior dejó la preferencia guardada, lo
    // que se leería es esa y no el defecto del motor, que es justo lo que este test viene a fijar.
    try { localStorage.removeItem('vf_mcAutoUnstick'); } catch (e) {}
  });
  await p.goto(URL, { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid', null, { timeout: 180000 });
  await p.waitForTimeout(2000);

  const r = await p.evaluate(async () => {
    const out = { errs: [] };
    const idEn = (x, y, z) => mc.grid[mcIdx(x, y, z)] || 0;
    const frame = () => new Promise(res => requestAnimationFrame(res));

    out.defecto = game.autoUnstick;
    out.enDump = 'autoUnstick' in game.dumpVars();
    out.hayTeclaU = typeof game.unstick === 'function';

    // Persistencia: se toca, se lee lo guardado, y se deja como estaba.
    game.autoUnstick = true;
    out.trasPonerlo = { valor: game.autoUnstick, guardado: localStorage.getItem('vf_mcAutoUnstick') };
    game.autoUnstick = false;
    out.trasQuitarlo = { valor: game.autoUnstick, guardado: localStorage.getItem('vf_mcAutoUnstick') };

    const tocadas = new Map();
    const pon = (x, y, z, k) => {
      const c = x + ',' + y + ',' + z;
      if (!tocadas.has(c)) tocadas.set(c, [x, y, z, idEn(x, y, z)]);
      setVoxel(x, y, z, k || 0);
    };

    const LOSA = 'asset:assets/adoquin.vox.json';
    const cargado = k => mc.name2id[k] > 0 || mc.blockKey.indexOf(k) > 0;
    if (!cargado(LOSA)) { try { await game.addMaterial(LOSA); } catch (e) { out.errs.push('no carga la losa: ' + e.message); } }
    if (!cargado(LOSA)) { out.errs.push('sin material con el que embutir al jugador'); return out; }

    // Un cubo macizo de 3×4×3: el jugador se mete DENTRO y ahí no cabe de ninguna manera.
    const AN = 3, AL = 4;
    let caja = null;
    const yTope = Math.min(40, mc.dim.y - AL - 2);
    for (let y = 6; y < yTope && !caja; y++)
      for (let x = 12; x < mc.dim.x - AN - 4 && !caja; x += 4)
        for (let z = 12; z < mc.dim.z - AN - 4 && !caja; z += 4) {
          let libre = true;
          for (let i = 0; i < AN && libre; i++) for (let j = 0; j < AL + 3 && libre; j++)
            for (let k = 0; k < AN && libre; k++) if (idEn(x + i, y + j, z + k)) libre = false;
          if (libre) caja = [x, y, z];
        }
    if (!caja) { out.errs.push('sin hueco de aire donde montar el bloque macizo'); return out; }
    const [X, Y, Z] = caja;
    out.caja = caja;

    const posPrevia = mc.pos.slice(), velPrevia = mc.vel ? mc.vel.slice() : null;
    beginBatch();
    for (let i = 0; i < AN; i++) for (let j = 0; j < AL; j++) for (let k = 0; k < AN; k++) pon(X + i, Y + j, Z + k, LOSA);
    endBatch();

    // El jugador, en el corazón del cubo. `pos` es la esquina de sus pies; el techo del cubo está en
    // Y+AL, así que la única salida de mcUnstick es hacia arriba y se nota muchísimo.
    const meter = () => {
      mc.pos[0] = X + 1.5; mc.pos[1] = Y + 1; mc.pos[2] = Z + 1.5;
      if (mc.vel) mc.vel[0] = mc.vel[1] = mc.vel[2] = 0;
    };
    const correr = async n => { for (let t = 0; t < n; t++) await frame(); };

    // ── B · apagado: se queda donde está ────────────────────────────────────────────────────────
    game.autoUnstick = false;
    meter();
    const antesB = mc.pos.slice();
    await correr(30);
    out.B = { antes: antesB, despues: mc.pos.slice(), atrapado: mcCollides(mc.pos[0], mc.pos[1], mc.pos[2]) };

    // ── C · …y la tecla U (game.unstick) sí lo saca ─────────────────────────────────────────────
    game.unstick();
    await correr(5);
    out.C = { despues: mc.pos.slice(), atrapado: mcCollides(mc.pos[0], mc.pos[1], mc.pos[2]) };

    // ── D · encendido: la conducta de siempre, intacta ──────────────────────────────────────────
    game.autoUnstick = true;
    meter();
    const antesD = mc.pos.slice();
    await correr(30);
    out.D = { antes: antesD, despues: mc.pos.slice(), atrapado: mcCollides(mc.pos[0], mc.pos[1], mc.pos[2]) };
    game.autoUnstick = false;

    // ── E · el empujón de un agente que EMBISTE no depende de esto ──────────────────────────────
    // mcAgentShove aparta en HORIZONTAL y por eso se deja siempre encendido: no aúpa a nadie, así que
    // apagarlo con el mismo interruptor habría desandado el arreglo de la serpiente sin que nadie lo
    // pidiera. Se comprueba ESPIÁNDOLO, no leyendo el texto de mcUpdate: el snippet del mundo envuelve
    // funciones del motor, y `String(mcUpdate)` puede acabar siendo el envoltorio y no el original.
    out.E = { hayShove: typeof mcAgentShove === 'function' };
    if (out.E.hayShove) {
      const orig = window.mcAgentShove;
      let llamadas = 0;
      window.mcAgentShove = function () { llamadas++; return false; };   // false = «no había nadie encima»
      game.autoUnstick = false;
      meter();
      await correr(3);
      window.mcAgentShove = orig;
      out.E.llamadasConInterruptorApagado = llamadas;
    }

    // ── limpieza ────────────────────────────────────────────────────────────────────────────────
    beginBatch();
    tocadas.forEach(v => setVoxel(v[0], v[1], v[2], v[3]));
    endBatch();
    mc.pos[0] = posPrevia[0]; mc.pos[1] = posPrevia[1]; mc.pos[2] = posPrevia[2];
    if (velPrevia && mc.vel) { mc.vel[0] = velPrevia[0]; mc.vel[1] = velPrevia[1]; mc.vel[2] = velPrevia[2]; }
    try { localStorage.removeItem('vf_mcAutoUnstick'); } catch (e) {}
    out.limpio = true;
    return out;
  });

  console.log('\nBUG-AG7 · el «unstick» automático viene APAGADO\n');
  if (r.errs.length) r.errs.forEach(e => ok(false, e));

  console.log('A · el interruptor');
  ok(r.defecto === false, 'game.autoUnstick viene en false por defecto', String(r.defecto));
  ok(r.enDump === true, 'sale en game.dumpVars() como los demás tunables');
  ok(r.hayTeclaU === true, 'game.unstick() sigue ahí (es lo que hace la tecla U)');
  ok(r.trasPonerlo.valor === true && r.trasPonerlo.guardado === '1', 'ponerlo a true persiste', JSON.stringify(r.trasPonerlo));
  ok(r.trasQuitarlo.valor === false && r.trasQuitarlo.guardado === '0', 'y volverlo a false también', JSON.stringify(r.trasQuitarlo));

  if (r.B && r.C && r.D) {
    console.log('\nB · embutido en un cubo macizo, con el interruptor APAGADO');
    ok(Math.abs(r.B.despues[1] - r.B.antes[1]) < 0.01, 'la cota NO cambia: nadie te sube',
       r3(r.B.antes[1]) + ' → ' + r3(r.B.despues[1]));
    ok(r.B.atrapado === true, '…y sigues atrapado, que es lo que se pidió');

    console.log('\nC · y la tecla U te saca cuando TÚ lo dices');
    ok(r.C.atrapado === false, 'game.unstick() te deja libre');
    ok(r.C.despues[1] > r.B.despues[1] + 0.5, '…subiéndote por encima de lo que estorba',
       r3(r.B.despues[1]) + ' → ' + r3(r.C.despues[1]));

    console.log('\nD · con el interruptor ENCENDIDO, la conducta de siempre — esto es lo que impide el falso verde');
    ok(r.D.despues[1] > r.D.antes[1] + 0.5, 'la auto-curación te sube, igual que antes',
       r3(r.D.antes[1]) + ' → ' + r3(r.D.despues[1]));
    ok(r.D.atrapado === false, '…y te deja libre');
  } else {
    ok(false, 'los tramos B/C/D no llegaron a medirse');
  }

  console.log('\nE · lo que NO se ha tocado');
  ok(r.E && r.E.hayShove === true, 'mcAgentShove sigue existiendo');
  ok(r.E && r.E.llamadasConInterruptorApagado > 0, 'y se le sigue llamando con autoUnstick apagado: apartar en horizontal no aúpa a nadie',
     'llamadas=' + (r.E && r.E.llamadasConInterruptorApagado));

  ok(r.limpio === true, 'el banco de pruebas se recoge entero');
  ok(errores.length === 0, 'sin errores de página', errores.join(' | ').slice(0, 200));

  console.log(fallos ? '\n' + fallos + ' fallo(s)\n' : '\nTODO OK\n');
  await b.close();
  process.exit(fallos ? 1 : 0);
})();