// Perfilador de CPU de Chrome (CDP) sobre el Mundo jugando. A diferencia del profiler por nombres,
// éste ve el código de los SNIPPETS: se compilan con AsyncFunction, así que salen como scripts
// aparte y se pueden separar de app.js. Responde a «¿qué se come el frame?» sin listas previas.
// Uso: node performance/sonda_cpu_profile.js [mapa] [segundos]
const { chromium } = require('playwright');

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  p.on('pageerror', e => console.log('EXC ' + e.message));
  await p.route('**/api/mundo', r => r.request().method() === 'POST' ? r.fulfill({ status: 200, body: '{"ok":true}' }) : r.continue());
  await p.route('**/api/mundo/**', r => r.request().method() === 'POST' ? r.fulfill({ status: 200, body: '{"ok":true}' }) : r.continue());

  const mapa = process.argv[2] || 'plan';
  const segs = +(process.argv[3] || 6);
  const espera = +(process.argv[4] || 12);   // s de calentamiento antes de perfilar
  await p.goto('http://localhost:8500/map/' + mapa, { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.active && mc.grid', null, { timeout: 180000 });
  await p.waitForTimeout(espera * 1000);   // que pasen el mallado inicial y la plantada de carteles

  const cdp = await p.context().newCDPSession(p);
  const scripts = new Map();
  await cdp.send('Debugger.enable');
  cdp.on('Debugger.scriptParsed', e => scripts.set(e.scriptId, e.url || ('(sin url · ' + (e.hasSourceURL ? 'con sourceURL' : 'eval/AsyncFunction') + ')')));
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 });   // µs
  await cdp.send('Profiler.start');

  // Jugar: mirar alrededor y andar, que es cuando el dueño ve la caída.
  const t0 = Date.now();
  while (Date.now() - t0 < segs * 1000) {
    await p.mouse.move(400 + Math.random() * 200, 300 + Math.random() * 100);
    await p.waitForTimeout(60);
  }
  const { profile } = await cdp.send('Profiler.stop');

  // Self time por nodo, agrupado por (función, script).
  const porNodo = new Map(profile.nodes.map(n => [n.id, n]));
  const self = new Map();
  const total = { ms: 0 };
  const dt = (profile.endTime - profile.startTime) / 1000;
  const cuenta = new Map();
  for (const s of profile.samples) cuenta.set(s, (cuenta.get(s) || 0) + 1);
  const msPorMuestra = dt / profile.samples.length;
  for (const [id, n] of cuenta) {
    const nodo = porNodo.get(id); if (!nodo) continue;
    const cf = nodo.callFrame;
    const url = scripts.get(cf.scriptId) || cf.url || '(?)';
    const corto = url.replace(/^https?:\/\/[^/]+/, '') || '(sin url · snippet/eval)';
    const clave = (cf.functionName || '(anónima)') + '  @' + corto + ':' + (cf.lineNumber + 1);
    const ms = n * msPorMuestra;
    self.set(clave, (self.get(clave) || 0) + ms);
    total.ms += ms;
  }
  const filas = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
  console.log('== ' + segs + ' s jugando en /map/' + mapa + ' · ' + total.ms.toFixed(0) + ' ms de CPU muestreados ==');
  for (const [k, ms] of filas) {
    console.log('  ' + ms.toFixed(0).padStart(6) + ' ms  ' + String(Math.round(100 * ms / total.ms)).padStart(3) + ' %  ' + k);
  }

  // Y el desglose por SCRIPT: la línea que separa app.js de los snippets.
  const porScript = new Map();
  for (const [k, ms] of self) {
    const s = k.split('  @')[1].replace(/:\d+$/, '');
    porScript.set(s, (porScript.get(s) || 0) + ms);
  }
  console.log('\n== por script ==');
  for (const [s, ms] of [...porScript.entries()].sort((a, b) => b[1] - a[1])) {
    console.log('  ' + ms.toFixed(0).padStart(6) + ' ms  ' + String(Math.round(100 * ms / total.ms)).padStart(3) + ' %  ' + s);
  }
  await b.close();
})();
