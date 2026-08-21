// Fotos 74/75: mirando al suelo, girando en el sitio. Mide ASENTADO y además cada frame durante el giro,
// para cazar el parpadeo (nivelOjo 0 ↔ 7.75 en las capturas del dueño).
const { chromium } = require('playwright');
const URL = process.argv[2] || 'http://localhost:8500/map/bugfinder2';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  await p.goto(URL, { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid && typeof game!=="undefined"', null, { timeout: 180000 });
  await p.waitForTimeout(3000);
  const r = await p.evaluate(async () => {
    mc.pos[0] = 28.22; mc.pos[1] = 15; mc.pos[2] = 49.44; mc.pitch = -89;
    const PASA = mcTablaLuz();
    const toma = (etiq) => {
      const d = game.luzDiag();
      const s = (mc._dynSem || []).find(s => s.org === mc._heldToolStruct);
      return {
        etiq,
        ojo: +d.nivelOjo.toFixed(2),
        sem: s ? (s.x + ',' + s.y + ',' + s.z) : 'NINGUNA',
        aire: s ? (PASA[mc.grid[mcIdx(s.x, s.y, s.z)]] ? 'aire' : 'SOLIDO') : '-',
        fina: s && s.fx != null ? [s.fx.toFixed(2), s.fy.toFixed(2), s.fz.toFixed(2)].join(',') : '-',
        mano: d.mano ? d.mano.pos.join(',') : '-'
      };
    };
    const filas = [];
    // (1) asentado en yaw 96, (2) giro suave 96→99 frame a frame, (3) asentado en 99
    mc.yaw = 96; for (let k = 0; k < 60; k++) await new Promise(r => requestAnimationFrame(r));
    filas.push(toma('96 asentado'));
    for (let i = 1; i <= 12; i++) {
      mc.yaw = 96 + i * 0.25;
      await new Promise(r => requestAnimationFrame(r));
      filas.push(toma('girando ' + mc.yaw.toFixed(2)));
    }
    for (let k = 0; k < 60; k++) await new Promise(r => requestAnimationFrame(r));
    filas.push(toma('99 asentado'));
    return filas;
  });
  console.log('etiqueta        nivelOjo  semilla      celda    posición fina        mano');
  for (const f of r) console.log(f.etiq.padEnd(15), String(f.ojo).padEnd(9), f.sem.padEnd(12), f.aire.padEnd(8), f.fina.padEnd(20), f.mano);
  const ojos = r.map(f => f.ojo);
  console.log('\nnivelOjo: min ' + Math.min(...ojos) + '  max ' + Math.max(...ojos));
  await b.close();
})();
