// ¿Cuánto cuesta REALMENTE `U.material('estrellas', {emite:true, luz:37})`, la línea que estaba viva
// por error en `efectos-demo`? 240 voxeles en `game.voxelesUI` que además siembran ~239 luces
// dinámicas, y `titila:true` ensucia la capa cada frame, así que se resiembran siempre.
//
// ⚠️ MÉTODO. La primera medida de una página recién cargada sale mala SIEMPRE (mallado, carteles,
// horneado): medir «con» primero y «sin» después atribuye el arranque al efecto. Aquí se descarta un
// calentamiento y después se ALTERNAN con/sin varias rondas; el veredicto sale de la mediana de cada
// grupo y sólo vale si las repeticiones de un mismo grupo concuerdan entre sí.
// Uso: node performance/sonda_estrellas_ab.js [mapa] [segundos por toma] [rondas]
const { chromium } = require('playwright');

const mediana = a => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  p.on('pageerror', e => console.log('EXC ' + e.message));
  await p.route('**/api/mundo', r => r.request().method() === 'POST' ? r.fulfill({ status: 200, body: '{"ok":true}' }) : r.continue());
  await p.route('**/api/mundo/**', r => r.request().method() === 'POST' ? r.fulfill({ status: 200, body: '{"ok":true}' }) : r.continue());

  const mapa = process.argv[2] || 'plan';
  const segs = +(process.argv[3] || 8);
  const rondas = +(process.argv[4] || 3);
  await p.goto('http://localhost:8500/map/' + mapa, { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.active && mc.grid', null, { timeout: 180000 });
  await p.waitForTimeout(15000);

  // fps propios: `mc.fps` es una media suavizada y aquí se mide en tramos cortos.
  await p.evaluate(() => {
    window._fpsN = 0;
    const r = window.requestAnimationFrame;
    (function bucle(){ window._fpsN++; r(bucle); })();
  });
  const mide = async (nombre, prepara) => {
    await p.evaluate(prepara);
    await p.waitForTimeout(2000);
    const t0 = await p.evaluate(() => [window._fpsN, performance.now()]);
    await p.waitForTimeout(segs * 1000);
    const t1 = await p.evaluate(() => [window._fpsN, performance.now()]);
    const fps = (t1[0] - t0[0]) / ((t1[1] - t0[1]) / 1000);
    const e = await p.evaluate(() => {
      const m = mc.voxUI && mc.voxUI.get('estrellas');
      return { v: m ? m.size : 0, n: mcVoxUINivel('estrellas'), l: (mcVoxUILuces() || []).length / 4 };
    });
    console.log('  ' + fps.toFixed(1).padStart(6) + ' fps  ' + nombre.padEnd(30) +
                ' · ' + e.v + ' voxeles · nivel ' + e.n + ' · ' + e.l + ' luces');
    return fps;
  };

  const conLuz = () => { game.voxelesUI.material('estrellas', { emite: true, luz: 37 }); mc.voxUISucio = true; mc._voxUILuz = null; };
  const sinLuz = () => { game.voxelesUI.material('estrellas', { emite: false }); mc.voxUISucio = true; mc._voxUILuz = null; };

  console.log('== /map/' + mapa + ' · ' + segs + ' s por toma · ' + rondas + ' rondas alternadas ==');
  await mide('0· calentamiento (se descarta)', sinLuz);
  const con = [], sin = [];
  for (let i = 1; i <= rondas; i++) {
    con.push(await mide(i + '· CON luz 37', conLuz));
    sin.push(await mide(i + '· sin luz', sinLuz));
  }

  const mc_ = mediana(con), ms_ = mediana(sin);
  const disp = a => (Math.max(...a) - Math.min(...a)) / mediana(a);
  console.log('\n== veredicto ==');
  console.log('  CON luz  mediana ' + mc_.toFixed(1) + ' fps  (dispersión ' + (disp(con) * 100).toFixed(0) + ' %)');
  console.log('  sin luz  mediana ' + ms_.toFixed(1) + ' fps  (dispersión ' + (disp(sin) * 100).toFixed(0) + ' %)');
  const efecto = (ms_ / mc_ - 1) * 100;
  const ruido = Math.max(disp(con), disp(sin)) * 100;
  console.log('  quitar la luz: ' + efecto.toFixed(0) + ' % de fps' +
    (Math.abs(efecto) <= ruido ? '  ⚠️ POR DEBAJO DEL RUIDO (' + ruido.toFixed(0) + ' %): no se puede afirmar nada' : '  ✔️ por encima del ruido (' + ruido.toFixed(0) + ' %)'));
  await b.close();
})();
