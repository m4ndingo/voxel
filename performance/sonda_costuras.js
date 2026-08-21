// ¿QUÉ funciones del motor tiene parcheadas un snippet, y cuánto cuesta cada costura?
// Compara la página con autoarranque (normal) contra la misma con ?noauto=1 (sin snippets): lo que
// cambie de tamaño o gane un `_orig` es una costura. Después cronometra cada una.
// Uso: node performance/sonda_costuras.js [mapa]
const { chromium } = require('playwright');

const inventario = () => {
  const out = {};
  for (const k of Object.getOwnPropertyNames(window)) {
    if (!/^(mc|game|update|_ren)/.test(k)) continue;
    const f = window[k];
    if (typeof f !== 'function') continue;
    out[k] = { largo: f.toString().length, orig: typeof f._orig === 'function' };
  }
  // Y los métodos de los objetos de `game`, donde viven las APIs que instalan los snippets.
  for (const k of Object.keys(window.game || {})) {
    const o = window.game[k];
    if (!o || typeof o !== 'object') continue;
    for (const m of Object.keys(o)) {
      if (typeof o[m] === 'function') out['game.' + k + '.' + m] = { largo: o[m].toString().length, orig: typeof o[m]._orig === 'function' };
    }
  }
  return out;
};

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const mapa = process.argv[2] || 'plan';
  const abre = async (url) => {
    const p = await b.newPage();
    await p.route('**/api/mundo', r => r.request().method() === 'POST' ? r.fulfill({ status: 200, body: '{"ok":true}' }) : r.continue());
    await p.route('**/api/mundo/**', r => r.request().method() === 'POST' ? r.fulfill({ status: 200, body: '{"ok":true}' }) : r.continue());
    await p.goto(url, { waitUntil: 'load', timeout: 120000 });
    await p.waitForFunction('typeof mc!=="undefined" && mc.active && mc.grid', null, { timeout: 180000 });
    await p.waitForTimeout(8000);
    return p;
  };

  const pA = await abre('http://localhost:8500/map/' + mapa + '?noauto=1');
  const A = await pA.evaluate(inventario);
  await pA.close();

  const pB = await abre('http://localhost:8500/map/' + mapa);
  const B = await pB.evaluate(inventario);

  console.log('== costuras: lo que cambia al correr el autoarranque ==');
  const filas = [];
  for (const k of Object.keys(B)) {
    const a = A[k], b2 = B[k];
    if (!a) { filas.push([k, 'NUEVA', b2.largo, b2.orig]); continue; }
    if (a.largo !== b2.largo || a.orig !== b2.orig) filas.push([k, a.largo + ' → ' + b2.largo, b2.largo, b2.orig]);
  }
  if (!filas.length) console.log('  (ninguna)');
  for (const f of filas) console.log('  ' + f[0].padEnd(34) + ' ' + String(f[1]).padEnd(18) + (f[3] ? ' tiene _orig' : ''));

  // Cronometrar cada costura: cuánto tarda la envoltura ENTERA y cuánto su `_orig`.
  const coste = await pB.evaluate(async () => {
    const res = {};
    const conCostura = [];
    for (const k of Object.getOwnPropertyNames(window)) {
      const f = window[k];
      if (typeof f === 'function' && typeof f._orig === 'function' && /^(mc|game|update)/.test(k)) conCostura.push(k);
    }
    res._conCostura = conCostura;
    return res;
  });
  console.log('\n== funciones con `_orig` (envoltura de snippet) ==');
  console.log('  ' + JSON.stringify(coste._conCostura));

  await b.close();
})();
