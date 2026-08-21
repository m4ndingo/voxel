// Fotos 81/82: mismo sitio, 1° de mira, y el suelo cambia de luma 38,6 a 30,7. Barre el pitch fino y saca,
// por paso: celdas de las 6 semillas del pico, dirección del haz, y el campo en la rejilla de suelo.
// Objetivo: separar tres sospechosos — (a) semilla que cruza borde de celda, (b) el haz que cambia de EJE
// dominante (el BFS solo sabe propagar por los 6 ejes), (c) redondeo del coste.
const { chromium } = require('playwright');
const URL = process.argv[2] || 'http://localhost:8500/map/bugfinder2';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto(URL, { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid && typeof game!=="undefined"', null, { timeout: 180000 });
  await p.waitForTimeout(3000);

  const r = await p.evaluate(async () => {
    mc.pos[0] = 36.47; mc.pos[1] = 15; mc.pos[2] = 49.68; mc.yaw = 81;
    mc.glowFocus = 1; mc.glowLevel = 8;
    // ⚠️ Hay que CLAVAR al jugador cada frame: si no, la gravedad lo mueve entre muestras y lo que se mide es
    // el emisor cambiando de sitio, no la luz cambiando de valor. (Me pasó: las semillas subían de y=15 a y=17.)
    const clava = () => { mc.pos[0] = 36.47; mc.pos[1] = 15; mc.pos[2] = 49.68; mc.yaw = 81; if (mc.vel) mc.vel[1] = 0; mc.vy = 0; };
    const espera = async n => { for (let k = 0; k < n; k++) { clava(); await new Promise(r => requestAnimationFrame(r)); } clava(); };
    const SUELO = [];
    for (let dx = -6; dx <= 6; dx++) for (let dz = -6; dz <= 6; dz++) SUELO.push([36 + dx, 15, 49 + dz]);
    mc.pitch = -34; await espera(60);
    const filas = [];
    for (let i = 0; i <= 60; i++) {
      mc.pitch = -34 - i * 0.1;
      await espera(4);
      const sem = (mc._dynSem || []).filter(s => s.org === mc._heldToolStruct);
      const s0 = sem[0];
      filas.push({
        pitch: +mc.pitch.toFixed(1),
        celdas: sem.map(s => s.x + ',' + s.y + ',' + s.z).join(' '),
        // posición REAL del 1er emisor y del jugador: si esto se mueve, lo que salta no es la luz
        emisor: s0 ? [s0.fx, s0.fy, s0.fz].map(v => v.toFixed(2)).join(',') : '-',
        jug: mc.pos.map(v => v.toFixed(2)).join(','),
        haz: s0 && s0.haz ? s0.haz.map(v => +v.toFixed(3)).join(',') : '-',
        // eje dominante del haz: si esto salta, salta el cono entero
        eje: s0 && s0.haz ? ['x', 'y', 'z'][s0.haz.map(Math.abs).indexOf(Math.max(...s0.haz.map(Math.abs)))] + (s0.haz[s0.haz.map(Math.abs).indexOf(Math.max(...s0.haz.map(Math.abs)))] > 0 ? '+' : '-') : '-',
        suma: +SUELO.reduce((a, c) => a + mcDynNivel(c[0], c[1], c[2]), 0).toFixed(1),
        enc: SUELO.filter(c => mcDynNivel(c[0], c[1], c[2]) > 0).length
      });
    }
    return filas;
  });

  console.log('pitch   eje  emisor real       jugador           suma-suelo  enc   celda semilla 1');
  let prev = null;
  for (const f of r) {
    const salto = prev ? Math.abs(f.suma - prev.suma) : 0;
    const marca = salto > 4 ? '  <<< SALTO ' + salto.toFixed(1) : '';
    console.log(String(f.pitch).padEnd(7), f.eje.padEnd(4), f.emisor.padEnd(17), f.jug.padEnd(17), String(f.suma).padStart(8), String(f.enc).padStart(5), '  ' + f.celdas.split(' ')[0] + marca);
    prev = f;
  }
  if (errs.length) console.log('ERRORES: ' + errs.slice(0, 3).join(' | '));
  await b.close();
})();
