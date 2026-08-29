// @area: mundo
// @necesita: servidor, playwright
// A/B de un solo tramo: el caso «selección TAPADA» del tramo G de `test_extru1_seleccion.js`, medido
// con `sel-cara-auto` APAGADO y ENCENDIDO sobre la MISMA página y el MISMO banco.
//
// Para qué: al encender el snippet en el autoarranque, ese tramo enseña 2 fallos. Hay que saber si los
// causa el snippet o si ya estaban (se sospecha del guardián comentado en `web/app.js:17060-17061`,
// que quitó el commit faa3f65: sin ese `continue`, extruir PISA lo que ya hay, y como lo pisa con el
// mismo material la foto no cambia pero la caja sí se mueve).
//
// Si las dos columnas dan lo mismo, el snippet es inocente.

const { chromium } = require('playwright');

const PUERTO = process.env.PUERTO || 8514;

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  await p.goto('http://localhost:' + PUERTO + '/map/test', { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid && typeof game!=="undefined"',
    null, { timeout: 180000 });
  await p.waitForFunction('window.game && game.selAuto && game.selAuto.puesto && game.selAuto.puesto()',
    null, { timeout: 60000 });

  const r = await p.evaluate(() => {
    const X = 40, Z = 40, Y = 12;                    // lejos del banco del guardián (8,8)
    const id = mc.grid.find(v => v > 0) || 1;
    const orig = [];
    for (let x = X - 1; x < X + 4; x++) for (let y = 0; y < mc.dim.y; y++) for (let z = Z - 1; z < Z + 4; z++)
      orig.push([x, y, z, mc.grid[mcIdx(x, y, z)]]);

    const lock = mc.histLock; mc.histLock = true;
    const pon = (x, y, z, v, e) => { const before = mc.grid[mcIdx(x, y, z)]; if (before === v) return; mcSetBlock(x, y, z, v); e.push({ x, y, z, before, after: v }); };

    // El mismo montaje que `rehaz(id)` del guardián: maciza hasta Y, y TAPA con `id` en Y+2.
    const rehaz = () => {
      const e = [];
      for (let x = X; x < X + 3; x++) for (let z = Z; z < Z + 3; z++)
        for (let y = Y - 6; y < mc.dim.y; y++) pon(x, y, z, y <= Y ? id : 0, e);
      for (let x = X; x < X + 3; x++) for (let z = Z; z < Z + 3; z++) pon(x, Y + 2, Z === z ? Z : z, id, e);
      mcRemeshEdiciones(e);
      mc.tool = 'select'; mc.selA = null;
      mc.selBox = { a: [X, Y, Z], b: [X + 2, Y + 1, Z + 2] };
      mc.selCajas = [mc.selBox];
      mc.selOpuesta = false;
    };
    const foto = () => { const s = []; for (let x = X; x < X + 3; x++) for (let z = Z; z < Z + 3; z++) for (let y = 0; y < mc.dim.y; y++) s.push(mc.grid[mcIdx(x, y, z)]); return s.join(','); };
    const caja = () => Math.min(mc.selBox.a[1], mc.selBox.b[1]) + '..' + Math.max(mc.selBox.a[1], mc.selBox.b[1]);

    const mide = () => {
      rehaz();
      const antes = foto(), cAntes = caja();
      const sube = mcSelExtruir(1);
      return { sube: sube, tocaBloques: foto() !== antes, cajaAntes: cAntes, cajaDespues: caja(),
               cajaSubio: caja() !== cAntes };
    };

    game.selAuto.off();
    const sin = mide();
    game.selAuto.on();
    const con = mide();

    // devolver el banco
    const e = [];
    for (const [x, y, z, v] of orig) pon(x, y, z, v, e);
    mcRemeshEdiciones(e); mc.histLock = lock;
    mc.selBox = null; mc.selCajas = []; mc.selOpuesta = false; mcScheduleSave();
    return { sin, con, sucio: orig.filter(([x, y, z, v]) => mc.grid[mcIdx(x, y, z)] !== v).length };
  });

  const f = o => 'sube=' + o.sube + ' tocaBloques=' + o.tocaBloques + ' caja ' + o.cajaAntes + '→' + o.cajaDespues;
  console.log('\nselección TAPADA, mcSelExtruir(1):');
  console.log('  sel-cara-auto OFF · ' + f(r.sin));
  console.log('  sel-cara-auto ON  · ' + f(r.con));
  const igual = r.sin.sube === r.con.sube && r.sin.tocaBloques === r.con.tocaBloques &&
                r.sin.cajaDespues === r.con.cajaDespues;
  console.log('\n' + (igual
    ? '✓ IDÉNTICO con y sin el snippet ⇒ los 2 fallos del tramo G son del MOTOR, no del parche'
    : '✗ DISTINTO ⇒ los causa el parche'));
  console.log('  (lo que el guardián exige: sube=false, caja sin moverse)');
  console.log('  banco devuelto: ' + (r.sucio === 0 ? 'limpio' : r.sucio + ' celdas sucias'));
  await b.close();
  process.exit(igual ? 0 : 1);
})();
