// @area: general
// @necesita: servidor, playwright
//
// REQ-COGER1 · `alCoger`: acercarse coge, sin picar.
//
// Va contra el MOTOR DE VERDAD y no contra stubs, a proposito: lo que puede romperse aqui es
// justamente lo que un doble no reproduce — `mcStructColl` y la caja fina real, `mcRemoveStruct`
// quitando de `mc.structures`, y sobre todo CUAL DE LAS DOS VIAS acaba usando un asset (BUG-STR1: la
// misma ballesta es estructura fina en un mapa y celda de rejilla en otro, y eso lo decide app.js al
// estampar). Un test con rejilla de juguete daria verde con la mitad del mundo sin funcionar, que es
// exactamente como fallo la primera version de `test_bloques_comportamiento.js`.
//
// Las cuatro cosas que mira:
//   1. La costura es la nueva (`mcUpdate._bloques`) y no se apila al reejecutar el snippet.
//   2. Via ESTRUCTURA FINA: al acercarse dispara, con la pieza ya fuera de `mc.structures`.
//   3. Via REJILLA: el mismo evento, con `tipo:'rejilla'` y el giro sacado de la clave.
//   4. El FLANCO: con `consume:false` la pieza se queda puesta y NO se repite mientras sigues al
//      lado. Sin esto, un pulsador dispararia 12 veces por segundo.
//
// ⛔ Planta y recoge en /map/test. Nunca en /map/default ni /map/agents.
const { chromium } = require('playwright');
const BASE = 'http://localhost:' + (process.argv[2] || process.env.VOXEL_PUERTO || 8500);

let ok = 0, fail = 0;
const t = (n, c, extra) => {
  if (c) { ok++; console.log('  ok  ' + n + (extra ? '   (' + extra + ')' : '')); }
  else { fail++; console.log('  FALLA  ' + n + (extra ? '   (' + extra + ')' : '')); }
};

(async () => {
  const nav = await chromium.launch({
    args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
  });
  const p = await nav.newPage();
  const errores = [];
  p.on('pageerror', (e) => errores.push(String(e)));

  // ?noauto=1: el autoarranque se lanza a mano, para que el motor este limpio y el fallo (si lo hay)
  // sea de esto y no del bioma que le toque construir al mapa.
  await p.goto(BASE + '/map/test?noauto=1', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => typeof window.game !== 'undefined' && window.game.bloques,
    null, { timeout: 30000 });
  await p.evaluate(() => game.snippet('mundo-autoarranque'));
  await p.waitForTimeout(1500);

  console.log('\n§1 · la costura');
  const v1 = await p.evaluate(() => window.mcUpdate && window.mcUpdate._bloques);
  t('mcUpdate lleva la version de bloques', !!v1, v1);
  // Reejecutar el snippet al afinar algo NO puede apilar envoltorios: se desenvuelve por _orig.
  await p.evaluate(() => game.snippet('mundo-autoarranque'));
  await p.waitForTimeout(1200);
  const apilado = await p.evaluate(() => {
    let n = 0, f = window.mcUpdate;
    while (f && f._orig && n < 10) { n++; f = f._orig; }
    return n;
  });
  t('no se apila al reejecutar', apilado === 1, apilado + ' envoltorio(s)');

  console.log('\n§2 · via estructura fina');
  const fina = await p.evaluate(async () => {
    const out = {};
    if (typeof mc === 'undefined' || !mc.active) { out.error = 'el Mundo no esta activo'; return out; }
    let visto = null;
    game.bloques.define('ballesta', { nota: 'zz-test', alcance: 1.2, alCoger: (c) => { visto = c; } });
    const x = Math.floor(mc.pos[0]) + 3, z = Math.floor(mc.pos[2]);
    const y = (typeof mcSurfaceY === 'function') ? mcSurfaceY(x, z) : Math.floor(mc.pos[1]);
    await game.stamp('ballesta', x, y, z);
    out.antes = mc.structures.length;
    for (let i = 0; i < 45 && !visto; i++) {
      mc.pos[0] += 0.1; mcUpdate(0.016);
      await new Promise((r) => setTimeout(r, 20));
    }
    out.despues = mc.structures.length;
    out.visto = visto ? { tipo: visto.tipo, clave: visto.clave, x: visto.x, y: visto.y, z: visto.z,
                          ori: visto.ori, tieneCfg: !!visto.cfg } : null;
    // La pieza ya no esta cuando llega el evento: coger ES llevarselo.
    out.quedaAlguna = mc.structures.some((s) => String(s.key).indexOf('ballesta') >= 0);
    return out;
  });
  t('dispara al acercarse', !!fina.visto, JSON.stringify(fina.visto));
  t('llega como estructura', fina.visto && fina.visto.tipo === 'estructura');
  t('trae la celda y el giro', fina.visto && typeof fina.visto.ori === 'number' && fina.visto.tieneCfg);
  t('la pieza ya no esta al disparar', fina.quedaAlguna === false,
    fina.antes + ' → ' + fina.despues + ' estructuras');

  console.log('\n§3 · via rejilla y §4 · el flanco');
  const rej = await p.evaluate(async () => {
    const out = {};
    let n = 0, ultimo = null;
    // La hierba es un 16³ MACIZO ⇒ vive en mc.grid. `consume:false` para medir el flanco sin que la
    // pieza desaparezca (con consume la repeticion se evitaria sola, y no probaria nada).
    game.bloques.define('asset:assets/hierba.vox.json',
      { nota: 'zz-test', alcance: 0.9, consume: false, alCoger: (c) => { n++; ultimo = c; } });
    for (let i = 0; i < 25; i++) { mcUpdate(0.016); await new Promise((r) => setTimeout(r, 25)); }
    out.visto = ultimo ? { tipo: ultimo.tipo, clave: ultimo.clave } : null;
    out.primeros = n;
    const marca = n;
    for (let i = 0; i < 25; i++) { mcUpdate(0.016); await new Promise((r) => setTimeout(r, 25)); }
    out.repiteQuieto = n - marca;
    const bx = Math.floor(mc.pos[0]), by = Math.floor(mc.pos[1]) - 1, bz = Math.floor(mc.pos[2]);
    out.sigueAhi = (mc.blockKey[mc.grid[mcIdx(bx, by, bz)]] || '') .indexOf('hierba') >= 0;
    return out;
  });
  t('la rejilla tambien dispara', rej.visto && rej.visto.tipo === 'rejilla', JSON.stringify(rej.visto));
  t('dispara al menos una celda', rej.primeros > 0, rej.primeros + ' celda(s)');
  t('quieto NO se repite (flanco)', rej.repiteQuieto === 0, rej.repiteQuieto + ' repeticion(es)');
  t('con consume:false la pieza sigue puesta', rej.sigueAhi === true);

  console.log('\n§5 · la mano NO se auto-coge (la regresion que costo la sesion)');
  // La herramienta que llevas ES una instancia de mc.structures y app.js le clava ox/oy/oz = mc.pos
  // en cada frame (app.js:14473) ⇒ esta SIEMPRE a distancia cero. Sin el filtro pasaban las dos
  // cosas a la vez: la ballesta recien cogida desaparecia de la mano, y como su `ox` es un float que
  // cambia con cada paso, el flanco nunca la reconocia y `herramienta-ballesta` se recargaba doce
  // veces por segundo (cientos de «Flecha-Arco cargado» en la consola). Se prueba con la de VERDAD,
  // sin redefinirla, porque lo que falla es el ciclo completo: coger → equipar → dibujar en la mano.
  // ⛔ Pagina nueva a proposito: §2 y §3 REDEFINEN `ballesta` y la hierba con dobles que solo
  // apuntan lo que ven, asi que a estas alturas la ballesta ya no carga su herramienta. Aqui hace
  // falta la definicion DE VERDAD, la que trae `mundo-autoarranque`, sin tocarla.
  await p.goto(BASE + '/map/test?noauto=1', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => typeof window.game !== 'undefined' && window.game.bloques,
    null, { timeout: 30000 });
  await p.evaluate(() => game.snippet('mundo-autoarranque'));
  await p.waitForTimeout(1500);
  const mano = await p.evaluate(async () => {
    const out = {};
    let cargas = 0;
    const orig = console.log;
    console.log = function () {
      if (/Flecha-Arco/i.test(Array.prototype.join.call(arguments, ' '))) cargas++;
      return orig.apply(console, arguments);
    };
    try {
      const x = Math.floor(mc.pos[0]) + 3, z = Math.floor(mc.pos[2]);
      const y = (typeof mcSurfaceY === 'function') ? mcSurfaceY(x, z) : Math.floor(mc.pos[1]);
      await game.stamp('ballesta', x, y, z);
      for (let i = 0; i < 45; i++) { mc.pos[0] += 0.1; mcUpdate(0.016); await new Promise((r) => setTimeout(r, 25)); }
      out.equipada = game.playerTool;
      // Quieto tres segundos CON la ballesta en la mano: es cuando se auto-cogia.
      for (let i = 0; i < 120; i++) { mcUpdate(0.016); await new Promise((r) => setTimeout(r, 25)); }
      out.tool = game.playerTool;
      out.enMano = !!(mc._heldToolStruct && mc.structures.indexOf(mc._heldToolStruct) >= 0);
      out.cargas = cargas;
    } finally { console.log = orig; }
    return out;
  });
  t('la ballesta de verdad se equipa al acercarse', mano.equipada === 'ballesta', mano.equipada);
  t('sigue equipada 3 s despues', mano.tool === 'ballesta', mano.tool);
  t('el dibujo de la mano sigue en mc.structures', mano.enMano === true);
  t('el snippet de la ballesta NO se recarga en bucle', mano.cargas <= 1, mano.cargas + ' carga(s)');

  console.log('\n§6 · nada se rompio por el camino');
  t('sin errores de pagina', errores.length === 0, errores.slice(0, 2).join(' | '));

  await nav.close();
  console.log('\n' + ok + ' ok / ' + fail + ' fallos');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('⛔ ' + e.message); process.exit(1); });
