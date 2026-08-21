// `mcDynSync` se comió 59-62 ms de un `mcTick` de 62-65 ms en la máquina del dueño (volcado del
// 2026-08-20). Esta sonda contesta POR QUÉ, con números y no con deducciones:
//   1. cuántos ms por frame se va en `mcDynSync`,
//   2. cuántas veces por segundo cambia `mc._dynSig` — el CANDADO de BUG-GLOW8, que promete que
//      «mientras ninguna luz cambie de celda esto no hace absolutamente nada»,
//   3. qué pasa si las luces de `game.voxelesUI` (las estrellas de `efectos-demo`) dejan de emitir.
//
// ⚠️ Se mide en MILISEGUNDOS DE JS, nunca en fps: bajo SwiftShader el frame está limitado por GPU y
// un ahorro de CPU es invisible en fps (ver la memoria `ab-de-fps-en-sondas-headless`). Y se ALTERNA
// con/sin varias rondas descartando un calentamiento, porque la 1ª toma de una página siempre miente.
// Uso: node performance/sonda_dynsync.js [mapa] [segundos por toma] [rondas]
const { chromium } = require('playwright');

const mediana = a => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  p.on('pageerror', e => console.log('EXC ' + e.message));
  await p.route('**/api/mundo', r => r.request().method() === 'POST' ? r.fulfill({ status: 200, body: '{"ok":true}' }) : r.continue());
  await p.route('**/api/mundo/**', r => r.request().method() === 'POST' ? r.fulfill({ status: 200, body: '{"ok":true}' }) : r.continue());

  const mapa = process.argv[2] || 'plan';
  const segs = +(process.argv[3] || 6);
  const rondas = +(process.argv[4] || 3);
  await p.goto('http://localhost:8500/map/' + mapa, { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.active && mc.grid', null, { timeout: 180000 });
  await p.waitForTimeout(15000);

  // Instrumentación propia: envolver mcDynSync y vigilar la firma. Nada de perfDump aquí — se quiere
  // el reparto DENTRO de mcDynSync (¿cuántas de sus llamadas rehacen el BFS?), que perfDump no da.
  await p.evaluate(() => {
    window._d = { n: 0, ms: 0, sig: 0, caja: 0, semillas: 0, vol: 0, sem: 0, cand: 0 };
    const orig = window.mcDynSync;
    // La firma es `gridGen|focus|x0,y0,z0,x1,y1,z1|<semilla>|<semilla>…`. Separar el prefijo (LA CAJA)
    // del resto (las semillas) dice CUÁL de los dos rompe el candado, que es toda la pregunta.
    const caja = s => (s || '').split('|').slice(0, 3).join('|');
    window.mcDynSync = function () {
      const t = performance.now(), s0 = mc._dynSig;
      const r = orig.apply(this, arguments);
      const d = window._d;
      d.n++; d.ms += performance.now() - t;
      if (mc._dynSig !== s0) {                              // ⬅️ el candado NO ha aguantado este frame
        d.sig++;
        if (caja(mc._dynSig) !== caja(s0)) d.caja++; else d.semillas++;
      }
      // ⚠️ el volumen VIVO es `mc.dynLight.vol` (W·H·P de la caja de este frame). `mc._dynBL.length/4`
      // es la CAPACIDAD del búfer, que crece con el pico histórico y no encoge: medirlo ahí infla.
      d.vol = mc.dynLight ? mc.dynLight.vol : 0;
      d.sem = (mc._dynSem || []).length;
      d.cand = (mc._dynCand || []).length / 11;
      return r;
    };
  });

  // ⚠️ ANDANDO, no quieto. Quieto la firma no cambia nunca y `mcDynSync` no cuesta nada — que es
  // justo la promesa del candado. El dueño ve la caída MOVIÉNDOSE, así que hay que moverse.
  const anda = async ms => {
    const t = Date.now();
    await p.keyboard.down('KeyW');
    while (Date.now() - t < ms) { await p.mouse.move(400 + Math.random() * 200, 300); await p.waitForTimeout(80); }
    await p.keyboard.up('KeyW');
  };

  const mide = async (nombre, prepara) => {
    await p.evaluate(prepara);
    await p.waitForTimeout(1500);
    await p.evaluate(() => { const d = window._d; d.n = 0; d.ms = 0; d.sig = 0; d.caja = 0; d.semillas = 0; });
    await anda(segs * 1000);
    const r = await p.evaluate(() => ({ ...window._d, luces: (mcVoxUILuces() || []).length / 4 }));
    const msFrame = r.n ? r.ms / r.n : 0;
    console.log('  ' + msFrame.toFixed(2).padStart(6) + ' ms/llamada  ' + nombre.padEnd(26) +
      ' · ' + r.n + ' llamadas · firma rota ' + r.sig + ' (' + (r.n ? Math.round(100 * r.sig / r.n) : 0) + ' %)' +
      ' [caja ' + r.caja + ' · semillas ' + r.semillas + ']' +
      ' · ' + r.vol + ' celdas · ' + r.sem + '/' + Math.round(r.cand) + ' semillas · ' + r.luces + ' luces voxUI');
    return msFrame;
  };

  const con = () => { game.voxelesUI.material('estrellas', { emite: true, luz: 37 }); mc.voxUISucio = true; mc._voxUILuz = null; };
  const sin = () => { game.voxelesUI.material('estrellas', { emite: false }); mc.voxUISucio = true; mc._voxUILuz = null; };

  console.log('== /map/' + mapa + ' · ' + segs + ' s por toma · ' + rondas + ' rondas alternadas ==');
  await mide('0· calentamiento (se descarta)', con);
  const A = [], B = [];
  for (let i = 1; i <= rondas; i++) {
    A.push(await mide(i + '· estrellas CON luz 37', con));
    B.push(await mide(i + '· estrellas sin luz', sin));
  }

  const a = mediana(A), c = mediana(B);
  const disp = x => (Math.max(...x) - Math.min(...x)) / (mediana(x) || 1);
  console.log('\n== veredicto ==');
  console.log('  CON luz  mediana ' + a.toFixed(2) + ' ms/llamada  (dispersión ' + (disp(A) * 100).toFixed(0) + ' %)');
  console.log('  sin luz  mediana ' + c.toFixed(2) + ' ms/llamada  (dispersión ' + (disp(B) * 100).toFixed(0) + ' %)');
  const efecto = a ? (1 - c / a) * 100 : 0;
  const ruido = Math.max(disp(A), disp(B)) * 100;
  console.log('  quitarles la luz ahorra ' + efecto.toFixed(0) + ' % de mcDynSync' +
    (Math.abs(efecto) <= ruido ? '  ⚠️ POR DEBAJO DEL RUIDO (' + ruido.toFixed(0) + ' %): no se puede afirmar nada'
                               : '  ✔️ por encima del ruido (' + ruido.toFixed(0) + ' %)'));
  await b.close();
})();
