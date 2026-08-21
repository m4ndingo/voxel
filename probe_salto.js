// EL SALTO, MEDIDO. El dueño se queja de que con un grado de mira la luz pega un bandazo. Esto lo mide sin fotos:
// barre el pitch grado a grado, reconstruye el campo en cada uno y compara celda a celda con el grado anterior.
// El número que importa es el PEOR SALTO EN UNA CELDA POR GRADO: si la ley es continua, tiene que quedarse en el
// suelo de resolución del campo (0,25 niveles). Todo lo que pase de ahí es el parchazo.
const { chromium } = require('playwright');
const URL = process.argv[2] || 'http://localhost:8500/map/bugfinder2';
const FOCUS = process.argv[3] ? +process.argv[3] : 1;
// Paso del barrido en grados. Sirve para distinguir LEY EMPINADA de SALTO: si al partir el paso en cuatro el peor
// salto también se divide por cuatro, la ley es continua (solo cae rápido); si se queda igual, hay discontinuidad.
const PASO = process.argv[4] ? +process.argv[4] : 1;
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  p.on('pageerror', e => console.log('  ERROR DE PÁGINA: ' + e.message));
  await p.goto(URL, { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.grid && mc.active', null, { timeout: 180000 });
  await p.waitForTimeout(2500);

  const r = await p.evaluate(async ({ FOCUS, PASO }) => {
    mc.glowFocus = FOCUS;
    // Zona de estudio fija alrededor del jugador: la misma en todos los grados, para poder restar.
    const c0 = [Math.floor(mc.pos[0]), Math.floor(mc.pos[1]), Math.floor(mc.pos[2])], R = 8;
    const campo = () => { const v = [];
      for (let dx = -R; dx <= R; dx++) for (let dy = -3; dy <= 3; dy++) for (let dz = -R; dz <= R; dz++)
        v.push(mcDynNivel(c0[0] + dx, c0[1] + dy, c0[2] + dz));
      return v; };
    const enGrado = async (g) => {
      mc.pitch = g * Math.PI / 180;
      await mcSyncHeldToolStruct();          // el haz cuelga de la matriz de la herramienta en mano
      mc._dynSig = null; mcDynSync();
      return campo();
    };
    let peor = 0, peorEn = null, suma = 0, n = 0, saltosGrandes = 0;
    let ant = await enGrado(-40);
    for (let g = -40 + PASO; g <= 10; g += PASO) {
      const cur = await enGrado(g);
      let peorAqui = 0, idx = -1;
      for (let i = 0; i < cur.length; i++) { const d = Math.abs(cur[i] - ant[i]);
        if (d > peorAqui) { peorAqui = d; idx = i; }
        if (d > 0.5) saltosGrandes++; }
      suma += peorAqui; n++;
      if (peorAqui > peor) { peor = peorAqui;
        const ny = 7, nz = 2 * R + 1, dx = Math.floor(idx / (ny * nz)) - R,
              dy = Math.floor(idx / nz) % ny - 3, dz = idx % nz - R;
        peorEn = { grado: +g.toFixed(2), celda: [c0[0] + dx, c0[1] + dy, c0[2] + dz] }; }
      ant = cur;
    }
    return { peor: +peor.toFixed(2), peorEn, medio: +(suma / n).toFixed(3), saltosGrandes, celdas: ant.length };
  }, { FOCUS, PASO });

  console.log('focus = ' + FOCUS + '   ·   ' + r.celdas + ' celdas vigiladas, pitch de −40° a +10° a pasos de ' + PASO + '°');
  console.log('  PEOR SALTO EN UNA CELDA POR PASO  : ' + r.peor + ' niveles   ' + JSON.stringify(r.peorEn));
  console.log('  salto peor MEDIO por paso         : ' + r.medio + ' niveles');
  console.log('  nº de saltos > 0,5 niveles        : ' + r.saltosGrandes);
  console.log('  (suelo de resolución del campo: 0,25 niveles — por debajo de eso no hay nada que arreglar)');
  await b.close();
})();
