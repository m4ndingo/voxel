// ¿DE QUÉ TAMAÑO es el salto de la espada de luz? El dueño lo ve andando; aquí se mueve UN emisor por una
// línea recta en pasos de 1/16 de bloque y se mira el nivel en celdas FIJAS. Si la luz fuera continua, mover
// el emisor 1/16 movería el nivel una pizca; si el BFS propaga de celda en celda, al cruzar la frontera todo
// el campo se desplaza de golpe y sale un escalón. Eso es lo que se mide, en NIVELES.
//
// Se compara además game.luzSuave on/off, porque el dueño dice que con él «va mejor pero no lo suficiente»:
// hay que ver cuánto se come y cuánto queda.
const { chromium } = require('playwright');

(async () => {
  const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  const p = await b.newPage();
  p.on('pageerror', e => console.log('PAGEERROR', e.message));
  await p.addInitScript(() => { const f = window.fetch; window.fetch = (u, o) =>
    (o && String(o.method).toUpperCase() === 'POST' && String(u).includes('/api/mundo'))
      ? Promise.resolve(new Response('{"bloqueado":true}')) : f(u, o); });
  await p.goto('http://localhost:8500/map/test?noauto=1', { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.active && mc.grid && mc.prog', null, { timeout: 180000 });
  await p.waitForTimeout(4000);

  const r = await p.evaluate(() => {
    const d = mc.dim;
    // Un hueco de aire despejado, lejos del suelo, para que el BFS no choque con nada y el salto que se vea
    // sea el del emisor moviéndose, no el de la geometría.
    const cx = Math.floor(d.x / 2), cy = d.y - 8, cz = Math.floor(d.z / 2);
    const nivel = 12;
    const celdas = [];
    for (let k = 2; k <= 7; k++) celdas.push([cx + k, cy, cz], [cx, cy, cz + k], [cx + k, cy + 1, cz + 1]);

    const barrido = (suave) => {
      game.luzSuave = suave;
      const pasos = [], N = 33;                       // 2 bloques enteros en pasos de 1/16
      for (let i = 0; i < N; i++) {
        const t = i / 16;
        const fx = cx + 0.5 + t;
        mc._dynSig = null; mc._dynSuma = null;
        mcDynBake([{ x: Math.floor(fx), y: cy, z: cz, fx, fy: cy + 0.5, fz: cz + 0.5, nivel, col: [255, 255, 230], haz: null }]);
        pasos.push({ t: +t.toFixed(4), cel: Math.floor(fx),
                     v: celdas.map(c => +mcDynNivel(c[0], c[1], c[2]).toFixed(3)) });
      }
      // Escalón = cambio de nivel entre dos pasos consecutivos de 1/16 de bloque.
      let maxSalto = 0, dondeSalta = null, sumaSaltos = 0, saltosGrandes = 0;
      const perfil = [];
      for (let i = 1; i < pasos.length; i++) {
        let m = 0;
        for (let j = 0; j < celdas.length; j++) m = Math.max(m, Math.abs(pasos[i].v[j] - pasos[i - 1].v[j]));
        perfil.push({ de: pasos[i - 1].t, a: pasos[i].t, salto: +m.toFixed(3), cruzaCelda: pasos[i].cel !== pasos[i - 1].cel });
        sumaSaltos += m; if (m >= 0.5) saltosGrandes++;
        if (m > maxSalto) { maxSalto = m; dondeSalta = perfil[perfil.length - 1]; }
      }
      const enCruce = perfil.filter(x => x.cruzaCelda), dentro = perfil.filter(x => !x.cruzaCelda);
      const med = a => a.length ? +(a.reduce((s, x) => s + x.salto, 0) / a.length).toFixed(3) : 0;
      return { suave, maxSalto: +maxSalto.toFixed(3), dondeSalta, saltosGrandes,
               saltoMedioAlCruzarDeCelda: med(enCruce), saltoMedioDentroDeLaCelda: med(dentro),
               nivelAlPrincipio: pasos[0].v, nivelAlFinal: pasos[pasos.length - 1].v };
    };

    const conSuave = barrido(true), sinSuave = barrido(false);
    game.luzSuave = true;
    return { celdas: celdas.length, conSuave, sinSuave, SUB: MC_LUZ_SUB };
  });

  const linea = (n, s) => {
    console.log('\n── ' + n + ' (game.luzSuave = ' + s.suave + ')');
    console.log('   salto máximo entre dos pasos de 1/16 de bloque: ' + s.maxSalto + ' NIVELES');
    console.log('   pasos con salto ≥ 0,5 niveles: ' + s.saltosGrandes + ' de 32');
    console.log('   salto medio AL CRUZAR de celda: ' + s.saltoMedioAlCruzarDeCelda +
                '   ·   dentro de la misma celda: ' + s.saltoMedioDentroDeLaCelda);
    console.log('   dónde salta: ' + JSON.stringify(s.dondeSalta));
  };
  console.log('══ SALTO DE LA LUZ MÓVIL · ' + r.celdas + ' celdas fijas · MC_LUZ_SUB = ' + r.SUB +
              ' (el campo guarda cuartos de nivel)');
  linea('con muestreo fino', r.conSuave);
  linea('sin muestreo fino', r.sinSuave);
  await b.close();
})();
