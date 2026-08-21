// SONDA TEMPORAL (BUG-GLOW11) · ¿por qué se rompe el candado de la luz dinámica ANDANDO cuando las únicas
// semillas son estrellas QUIETAS? El dueño midió en su máquina, con la herramienta escondida (0 estructuras,
// 128 semillas de voxelesUI): 35 re-siembras en 8 s, 49 ms cada una, caja de 267 250 celdas.
// Aquí se reproduce sin dibujar nada: se plantan N estrellas quietas, se mueve mc.pos en línea recta y se
// llama a mcDynSync() a mano, clasificando QUÉ CAMPO de la firma cambia (gridGen / foco / caja / semillas).
const { chromium } = require('playwright');
const URL = process.argv[2] || 'http://localhost:8500/map/test?noauto=1';
const N_ESTRELLAS = +(process.argv[3] || 128);

(async () => {
  const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  const p = await b.newPage();
  p.on('pageerror', e => console.log('EXC ' + e.message));
  await p.addInitScript(() => {
    const f = window.fetch;
    window.fetch = (u, o) => (o && String(o.method).toUpperCase() === 'POST' && String(u).includes('/api/mundo'))
      ? Promise.resolve(new Response('{"bloqueado":true}')) : f(u, o);
  });
  await p.goto(URL, { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.active && mc.grid', null, { timeout: 180000 });
  await p.waitForTimeout(3000);

  const r = await p.evaluate((NE) => {
    const d = mc.dim, N = Math.round(1 / MC_VOX);
    // Estrellas repartidas por todo el mapa y altas, como las del decorado: alcance grande ⇒ la unión de sus
    // cajas es casi el mundo entero, que es justo la condición que describe el dueño.
    game.voxelesUI.limpia('sondaEstrellas');
    game.voxelesUI.material('sondaEstrellas', { emite: true, luz: 37 });
    let puestas = 0;
    for (let i = 0; i < NE; i++) {
      const x = 2 + ((i * 7919) % (d.x - 4)), z = 2 + ((i * 6271) % (d.z - 4)), y = d.y - 2 - (i % 6);
      if (game.voxelesUI.pon(x * N, y * N, z * N, [255, 255, 230], 'sondaEstrellas') !== false) puestas++;
    }
    game.luzOrden = 'canonico';
    mc._dynSig = null; mc._dynSuma = null;

    const partes = () => { const s = mc._dynSig; return s ? s.split('|') : null; };
    mc.pos[0] = 8; mc.pos[1] = 20; mc.pos[2] = d.z / 2;
    mcDynSync();
    let prev = partes();
    const arranque = { luces: (mc._voxUILuz ? mc._voxUILuz.length / 4 : 0), semillas: prev ? prev.length - 3 : 0,
                       caja: prev ? prev[2] : null, vol: mc.dynLight ? mc.dynLight.vol : 0, gridGen: mc.gridGen | 0 };

    // 200 pasos de 0,12 bloques = 24 bloques, lo mismo que anduvo el dueño en sus 8 s.
    const anda = () => {
    mc.pos[0] = 8; mc._dynSig = null; mc._dynSuma = null; mcDynSync(); prev = partes();
    let gen = 0, foco = 0, caja = 0, sem = 0, rotas = 0, ms = 0, bakes = 0, ejCaja = null, ejSem = null;
    for (let i = 0; i < 200; i++) {
      mc.pos[0] += 0.12;
      const antes = mc._dynSig, t = performance.now();
      mcDynSync();
      const dt = performance.now() - t;
      const q = partes();
      if (mc._dynSig !== antes) { bakes++; ms += dt; }
      if (prev && q) {
        if (q.join('|') !== prev.join('|')) {
          rotas++;
          if (q[0] !== prev[0]) gen++;
          else if (q[1] !== prev[1]) foco++;
          else if (q[2] !== prev[2]) { caja++; if (!ejCaja) ejCaja = prev[2] + '  →  ' + q[2]; }
          else { sem++; if (!ejSem) { const A = prev.slice(3).sort(), B = q.slice(3).sort();
                   const e = B.filter(x => A.indexOf(x) < 0), s2 = A.filter(x => B.indexOf(x) < 0);
                   ejSem = s2.length + ' salen / ' + e.length + ' entran · SALE ' + (s2[0] || '-') + ' · ENTRA ' + (e[0] || '-'); } }
        }
      }
      prev = q;
    }
    const R = mc._dynRecorte || {};
    return { rotas, gen, foco, caja, sem, bakes, ms, ejCaja, ejSem,
             crudo: R.crudo, tope: R.tope, recortada: R.hubo, vol: mc.dynLight ? mc.dynLight.vol : 0 };
    };
    // Dos tiradas: con el presupuesto de serie (la caja cruda cabe ⇒ no se recorta) y con uno apretado que
    // obliga a recortar, que es la situación del mundo del dueño (96×64×96 = 589 824 > 450 000).
    const holgado = anda();
    game.luzDinCeldas = 300000;
    const apretado = anda();
    game.luzDinCeldas = MC_DYN_CELDAS;

    // Lo que cuesta el CAMINO EN VACÍO (la firma NO se rompe): recoger candidatas, ordenarlas y armar la
    // cadena, cada frame. REQ-LUZ1 le añadió el orden canónico (comparar 136 cadenas) y la suma testigo,
    // así que hay que medir que no haya encarecido el caso bueno, que es el 99 % de los frames.
    const vacio = (modo) => { game.luzOrden = modo; mc._dynSig = null; mc._dynSuma = null; mcDynSync();
      const t = performance.now(); for (let i = 0; i < 200; i++) mcDynSync(); return (performance.now() - t) / 200; };
    const noop = { ojo: vacio('ojo'), canonico: vacio('canonico') };

    const fin = { noop, gridGen: mc.gridGen | 0, vol: mc.dynLight ? mc.dynLight.vol : 0,
                  recortada: mc.dynLight ? mc.dynLight.vol >= MC_DYN_CELDAS : false,
                  cand: mc._dynCand ? mc._dynCand.length / 11 : 0, tope: MC_DYN_SEMILLAS };
    game.voxelesUI.limpia('sondaEstrellas');
    game.luzOrden = 'ojo'; mc._dynSig = null;
    return { puestas, arranque, holgado, apretado, fin };
  }, N_ESTRELLAS);

  const pinta = (t, r) => {
    console.log('\n' + t + '   (caja cruda ' + r.crudo + ' · tope ' + r.tope + ' · ¿recortada? ' + r.recortada + ')');
    console.log('  roturas de firma ' + r.rotas + ' de 200  →  gridGen ' + r.gen + ' · foco ' + r.foco +
                ' · CAJA ' + r.caja + ' · semillas ' + r.sem);
    if (r.ejCaja) console.log('     CAJA  ' + r.ejCaja);
    if (r.ejSem) console.log('     SEMILLAS  ' + r.ejSem);
    console.log('  re-siembras ' + r.bakes + ' · ' + r.ms.toFixed(0) + ' ms · ' +
                (r.bakes ? (r.ms / r.bakes).toFixed(1) : 0) + ' ms cada una · caja final ' + r.vol + ' celdas');
  };

  console.log('\nmundo con ' + r.puestas + ' estrellas plantadas · ' + r.arranque.luces + ' luces en voxelesUI');
  console.log('candidatas ' + r.fin.cand + ' / ' + r.fin.tope + ' plazas · semillas en la firma ' + r.arranque.semillas);
  console.log('caja al arrancar ' + r.arranque.caja + ' = ' + r.arranque.vol + ' celdas (recortada: ' + r.fin.recortada + ')');
  pinta('200 pasos (24 bloques), estrellas QUIETAS, sin herramienta · PRESUPUESTO DE SERIE', r.holgado);
  pinta('lo mismo con el presupuesto apretado a 300 000 celdas', r.apretado);
  console.log('  gridGen ' + r.arranque.gridGen + ' → ' + r.fin.gridGen);
  console.log('\nmcDynSync EN VACÍO (sin romper la firma), por frame:  orden de siempre ' +
              r.fin.noop.ojo.toFixed(3) + ' ms  ·  canónico ' + r.fin.noop.canonico.toFixed(3) + ' ms');
  await b.close();
})();
