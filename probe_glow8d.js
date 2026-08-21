// Sonda de un uso: girar en el sitio no puede cambiar la luz. Reproduce las fotos 72/73 del dueño.
const { chromium } = require('playwright');
const URL = process.argv[2] || 'http://localhost:8500/map/bugfinder2';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await p.goto(URL, { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid && typeof game!=="undefined"', null, { timeout: 180000 });
  await p.waitForTimeout(3000);

  const r = await p.evaluate(async () => {
    mc.pos[0] = 38.53; mc.pos[1] = 15; mc.pos[2] = 48.01; mc.pitch = -14;
    const filas = [];
    for (let yaw = 90; yaw <= 110; yaw += 1) {
      mc.yaw = yaw;
      // La mano cuelga de una transformada que se recalcula por frame: hay que dejarla ASENTAR o se mide el
      // arrastre de la cámara, no la luz (eso me pasó en la primera medición).
      for (let k = 0; k < 8; k++) await new Promise(r => requestAnimationFrame(r));
      const d = game.luzDiag ? game.luzDiag() : null;
      const D = mc.dynLight;
      const m = d && d.cerca ? d.cerca.find(s => s.de === 'mano') : null;
      // Sonda FIJA en el mundo (no se mueve con la cámara): celdas de suelo por donde pasa la mano.
      const sonda = [];
      if (typeof mcDynNivel === 'function')
        for (const c of [[37, 14, 47], [38, 14, 47], [37, 14, 48], [38, 14, 48], [37, 15, 47]])
          sonda.push(+mcDynNivel(c[0], c[1], c[2]).toFixed(2));
      filas.push({
        yaw,
        usadas: d && d.semillas ? d.semillas.usadas : null,
        caja: D ? [D.x0, D.y0, D.z0, D.W, D.H, D.P] : null,
        vol: D ? D.vol : null,
        manoCel: m ? m.cel.join(',') : 'SIN MANO',
        manoPos: d && d.mano ? d.mano.pos.join(',') : '',
        sonda
      });
    }
    return filas;
  });

  console.log('yaw  usadas  manoCel      manoPos                sonda (niveles en 5 celdas fijas del suelo)');
  for (const f of r) console.log(String(f.yaw).padEnd(5), String(f.usadas).padEnd(7), String(f.manoCel).padEnd(12), String(f.manoPos).padEnd(22), JSON.stringify(f.sonda));
  const us = new Set(r.map(f => f.usadas)), cj = new Set(r.map(f => JSON.stringify(f.caja)));
  console.log('\nsemillas usadas distintas: ' + [...us].join(', ') + ' · cajas distintas: ' + cj.size);
  let maxSalto = 0, dondeSalto = '';
  for (let i = 1; i < r.length; i++) for (let k = 0; k < r[i].sonda.length; k++) {
    const dif = Math.abs(r[i].sonda[k] - r[i - 1].sonda[k]);
    if (dif > maxSalto) { maxSalto = dif; dondeSalto = 'celda#' + k + ' yaw ' + r[i - 1].yaw + '→' + r[i].yaw + ' (' + r[i - 1].sonda[k] + '→' + r[i].sonda[k] + ')'; }
  }
  console.log('salto máximo de NIVEL entre 2° de giro: ' + maxSalto.toFixed(2) + (dondeSalto ? '  · ' + dondeSalto : ''));
  if (errs.length) console.log('ERRORES: ' + errs.slice(0, 5).join(' | '));
  await b.close();
})();
