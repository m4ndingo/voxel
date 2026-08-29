// @area: mundo
// @necesita: servidor, playwright
// SONDA (no guardián): comprueba que el aviso de REQ-SETBLOCK1 le habla a quien debe y CALLA con
// quien no. Que un aviso sea correcto no es que salga: es que no salga cuando no toca, porque un
// aviso que sale de más se aprende a ignorar y entonces ya no avisa de nada.
//
// Se ejecutan tres snippets de verdad (por `game.snippet`, que es lo que les pone el
// `//# sourceURL=vf-snippet/<nombre>` del que vive el aviso) y se mira la consola:
//   1. llama a `mcSetBlock` a pelo con un índice numérico   → DEBE avisar, y una sola vez
//   2. llama a `setVoxel(x,y,z,'nombre')`, la puerta buena  → NO debe decir nada
//   3. pone 300 bloques a pelo                              → un aviso, no 300 (el cupo de sondeos)
//
// ⚠️ ESTA SONDA PONE BLOQUES DE VERDAD, y los bloques se GUARDAN. La primera version corria en
// `/map/test` y dejo alli sus 301 bloques: `test_observador_redstone.js` empezo a fallar porque su
// observador se planta en un mapa que ya no estaba como el esperaba. Por eso ahora (a) va a
// `/map/empty`, que no lo usa ningun guardian, y (b) se recoge lo suyo al terminar, pase lo que pase.
//
//   node tests/probe_aviso_setblock.js [url]
const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8500/map/empty';

// Los snippets NO se publican: se corren en caliente con `game.snippet(nombre, args, codigo)` si el
// motor lo admite; si no, por la puerta de siempre. Ver abajo `corre()`.
const CAJA = { x0: 10, x1: 19, y0: 40, y1: 78, z: 10 };   // todo lo que toca, para poder recogerlo
const CODIGO = {
  'sonda-puerta-baja': 'mcSetBlock(10, 40, 10, 1);',
  'sonda-puerta-buena': 'setVoxel(11, 40, 10, "piedra");',
  'sonda-puerta-baja-x300': 'for (let i = 0; i < 300; i++) mcSetBlock(12 + (i % 8), 40 + ((i / 8) | 0), 10, 1);'
};

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const avisos = [];
  page.on('console', m => { if (m.type() === 'warning' && m.text().indexOf('mcSetBlock') >= 0) avisos.push(m.text()); });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto(URL, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid && typeof game!=="undefined"', null, { timeout: 180000 });
  await page.waitForTimeout(4000);

  // `mc._snippetActual` es lo que distingue «esto viene de fuera» de «esto es app.js por dentro», y lo
  // pone `mcCorreSnippet`. Se corre el código EXACTAMENTE por ahí para no falsear la pila.
  const corre = async (nombre, codigo) => {
    const r = await page.evaluate(async ([n, c]) => {
      try {
        const f = new (Object.getPrototypeOf(async function () {}).constructor)(c + '\n//# sourceURL=vf-snippet/' + n);
        const antes = mc._snippetActual; mc._snippetActual = n;
        try { await f(); } finally { mc._snippetActual = antes; }
        return 'ok';
      } catch (e) { return 'ERROR: ' + e.message; }
    }, [nombre, codigo]);
    await page.waitForTimeout(300);
    return r;
  };

  const di = (q, ok, det) => console.log('  ' + (ok ? 'ok  ' : 'FALLA') + '  ' + q + (det ? '   (' + det + ')' : ''));
  let fallos = 0;
  const check = (q, ok, det) => { di(q, ok, det); if (!ok) fallos++; };

  console.log('\nA · la puerta de abajo (mcSetBlock con índice numérico) SÍ se avisa');
  avisos.length = 0;
  let r = await corre('sonda-puerta-baja', CODIGO['sonda-puerta-baja']);
  check('el snippet corre sin reventar', r === 'ok', r);
  check('sale el aviso', avisos.length === 1, avisos.length + ' aviso(s)');
  check('dice cuál es la puerta buena', /setVoxel\(x, y, z, "nombre/.test(avisos[0] || ''), (avisos[0] || '').split('\n')[1]);
  check('nombra al snippet culpable', (avisos[0] || '').indexOf('sonda-puerta-baja') >= 0);

  console.log('\nB · la puerta buena (setVoxel por nombre) NO se avisa');
  avisos.length = 0;
  r = await corre('sonda-puerta-buena', CODIGO['sonda-puerta-buena']);
  check('el snippet corre sin reventar', r === 'ok', r);
  check('silencio absoluto', avisos.length === 0, avisos.length + ' aviso(s): ' + (avisos[0] || '—').slice(0, 60));

  console.log('\nC · 300 bloques a pelo = UN aviso, no 300');
  avisos.length = 0;
  r = await corre('sonda-puerta-baja-x300', CODIGO['sonda-puerta-baja-x300']);
  check('el snippet corre sin reventar', r === 'ok', r);
  check('avisa una sola vez y se calla', avisos.length === 1, avisos.length + ' aviso(s) para 300 bloques');

  // El agujero que remata `parche_app_aviso_setblock_redstone.py`: redstone ENVUELVE `mcSetBlock`
  // desde un snippet (PLAN.md:552). Con ese envoltorio puesto, el marco de al lado de `mcSetBlock` ya
  // no es quien lo llamó, es el envoltorio — y lleva `vf-snippet/`. Sin el remate, un snippet que usa
  // la puerta BUENA se lleva un aviso por hacerlo bien.
  console.log('\nD · con un envoltorio de mcSetBlock por medio (como redstone), setVoxel sigue callado');
  const puesto = await corre('sonda-envoltorio-redstone',
    'window.__sbOrig = mcSetBlock;\n' +
    'window.mcSetBlock = function (x, y, z, id) { return window.__sbOrig(x, y, z, id); };');
  check('el envoltorio se instala', puesto === 'ok', puesto);
  avisos.length = 0;
  r = await corre('sonda-puerta-buena-2', 'setVoxel(13, 41, 10, "piedra");');
  check('el snippet corre sin reventar', r === 'ok', r);
  check('silencio: la puerta buena se reconoce aunque haya envoltorios',
    avisos.length === 0, avisos.length + ' aviso(s): ' + (avisos[0] || '—').split('\n')[0]);
  avisos.length = 0;
  r = await corre('sonda-puerta-baja-2', 'mcSetBlock(14, 41, 10, 1);');
  check('…y con el envoltorio puesto la puerta MALA se sigue pillando', avisos.length === 1,
    avisos.length + ' aviso(s)');
  await page.evaluate(() => { if (window.__sbOrig) { window.mcSetBlock = window.__sbOrig; delete window.__sbOrig; } });

  // Devolver el mapa como estaba. Se apunta lo que HABIA en cada celda antes de tocarla (casi siempre
  // aire, pero no se da por supuesto) y se repone; si la sonda ya fallo, se limpia igual.
  const quitados = await page.evaluate(c => {
    let n = 0;
    for (let x = c.x0; x <= c.x1; x++) for (let y = c.y0; y <= c.y1; y++) {
      if (mc.grid[mcIdx(x, y, c.z)]) { mcSetBlock(x, y, c.z, 0); n++; }
    }
    if (typeof mcRemeshAround === 'function') mcRemeshAround((c.x0 + c.x1) >> 1, (c.y0 + c.y1) >> 1, c.z);
    if (typeof mcScheduleSave === 'function') mcScheduleSave();
    return n;
  }, CAJA);
  console.log('\n(recogido: ' + quitados + ' bloques)');
  await page.waitForTimeout(5000);         // que el guardado en cola llegue a disco antes de cerrar

  console.log('\n' + (fallos ? fallos + ' FALLOS' : 'todo ok'));
  await browser.close();
  process.exit(fallos ? 1 : 0);
})();
