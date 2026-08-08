// @area: editor
// @necesita: servidor, playwright
// Al estampar una estructura que trae texturas NUEVAS, mcStampStruct pasa por mcRestampAll (hay que recomponer el
// atlas). Lo primero que hacia mcRestampAll era vaciar mc.structs[k].meshRot, y ahi vivia TAMBIEN el bitset de
// colision fina que consulta mcFineBoxHit -> durante el re-horneado (con sus await, o sea con frames por medio) NO
// habia suelo bajo el jugador: caia, y al volver las mallas mcUnstick lo devolvia arriba. Eso es lo que el dueno
// describio como "el jugador parece agacharse y ~1 s despues vuelve a su sitio", y solo con algunas estructuras
// (las que estrenan textura). El arreglo: mcStructColl cae a colRot, que mcRestampAll no invalida.
//
// Este test mide la colision, no los pixeles: es lo que fallaba.
// No persiste nada: bloquea el POST del mundo y retira lo que estampa.
const { chromium } = require('playwright');

let fallos = 0;
const ok = (nom, cond, extra) => {
  console.log((cond ? '  ok  ' : '  FALLA  ') + nom + (extra ? '   (' + extra + ')' : ''));
  if (!cond) fallos++;
};

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push(String(e)));
  await p.addInitScript(() => {
    const orig = window.fetch;
    window.fetch = (u, o) => {
      const url = String((u && u.url) || u);
      if (o && String(o.method || 'GET').toUpperCase() === 'POST' && /\/api\/mundo/.test(url)) {
        return Promise.resolve(new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }
      return orig(u, o);
    };
  });

  await p.goto('http://localhost:8500/map/agents', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction('typeof mc !== "undefined" && mc.prog && mc.active && mc.grid', { timeout: 120000 });
  await p.waitForTimeout(3000);

  const r = await p.evaluate(async () => {
    const out = { errs: [] };
    const bx = Math.floor(mc.pos[0]), bz = Math.floor(mc.pos[2]);
    let sy = -1;
    for (let y = mc.dim.y - 1; y >= 0; y--) if (mc.grid[mcIdx(bx, y, bz)]) { sy = y; break; }
    if (sy < 0) { out.errs.push('sin suelo bajo el jugador'); return out; }

    // Plataforma flotante de 2x1x2 celdas bien por encima del terreno, para que lo UNICO que sostenga al jugador
    // sea la estructura: si su colision desaparece, no hay nada debajo hasta el suelo de verdad.
    const suelo = {}, S = 16;
    for (let x = 0; x < S * 2; x++) for (let y = 0; y < S * 2; y++) for (let z = 0; z < S; z++) suelo[x + ',' + y + ',' + z] = '#8a7a5c';
    roomDataCache.set('zz-plat', Promise.resolve({ size: { x: S * 2, y: S * 2, z: S }, meta: { name: 'zz-plat', type: 'bloque' }, voxels: suelo }));

    const py = sy + 8;                                  // altura de la plataforma (celdas de mundo)
    await mcStampStruct('zz-plat', bx, py, bz, 0, true);
    // De pie justo encima de ella
    mc.pos[0] = bx + 1; mc.pos[2] = bz + 0.5; mc.pos[1] = py + 1; mc.vel = [0, 0, 0];
    mcUnstick();
    out.yInicial = +mc.pos[1].toFixed(3);
    out.apoyado = mcCollides(mc.pos[0], mc.pos[1] - 0.05, mc.pos[2]);   // hay algo solido bajo los pies

    // Ahora se estampa OTRA estructura con una textura nueva -> mcStampStruct entra por la rama `grow` y llama a
    // mcRestampAll. Se muestrea la colision bajo los pies MIENTRAS tanto, que es justo lo que se perdia.
    const cubo = {};
    for (let x = 0; x < S; x++) for (let y = 0; y < S; y++) for (let z = 0; z < S; z++) cubo[x + ',' + y + ',' + z] = 'tex:zz-nueva';
    const texVox = {};
    for (let x = 0; x < S; x++) for (let y = 0; y < S; y++) for (let z = 0; z < S; z++) texVox[x + ',' + y + ',' + z] = '#3fa9d8';
    roomDataCache.set('zz-nueva', Promise.resolve({ size: { x: S, y: S, z: S }, meta: { name: 'zz-nueva', type: 'textura' }, voxels: texVox }));
    roomDataCache.set('zz-tex', Promise.resolve({ size: { x: S, y: S, z: S }, meta: { name: 'zz-tex', type: 'bloque' }, voxels: cubo,
                                                  textures: { 'zz-nueva': { size: { x: S, y: S, z: S }, voxels: texVox } } }));

    // Se muestrea por rAF, no por setInterval: lo que importa es si hay suelo en los frames que se PINTAN, que son
    // los mismos en los que corre la fisica. Un setInterval no llega a dispararse si el re-horneado no cede.
    let sinSuelo = 0, muestras = 0, vigilando = true;
    const vigila = () => {
      if (!vigilando) return;
      muestras++; if (!mcCollides(mc.pos[0], mc.pos[1] - 0.05, mc.pos[2])) sinSuelo++;
      requestAnimationFrame(vigila);
    };
    requestAnimationFrame(vigila);

    const antes = mc.structures.length, t0 = performance.now();
    await mcStampStruct('zz-tex', bx + 3, py, bz, 0, true);
    out.msEstampa = Math.round(performance.now() - t0);
    out.nuevas = mc.structures.length - antes;

    // Y ahora el re-horneado de verdad. Desde que el atlas tiene filas fijas, estampar una textura nueva ya casi
    // nunca pasa por mcRestampAll (solo al cruzar escalon de 16 filas), asi que el caso que rompia la colision hay
    // que provocarlo llamando a la funcion: sigue corriendo al cruzar escalon, al togglear texturas y con emisivos.
    const t1 = performance.now();
    await mcRestampAll();
    out.msRestamp = Math.round(performance.now() - t1);
    vigilando = false;
    out.muestras = muestras; out.sinSuelo = sinSuelo;
    out.apoyadoDespues = mcCollides(mc.pos[0], mc.pos[1] - 0.05, mc.pos[2]);

    // Y la colision fina sigue coincidiendo con la malla: ni de mas (atravesar) ni de menos.
    out.dentro = mcCollides(bx + 1, py + 0.2, bz + 0.5);        // el interior de la plataforma es solido
    out.fuera = mcCollides(bx + 1, py + 3.5, bz + 0.5);         // el aire de encima, no

    for (const k of ['zz-plat', 'zz-tex', 'zz-nueva']) {
      const s = mc.structures.find(o => o.key === k); if (s) mcRemoveStruct(s, true);
      roomDataCache.delete(k); delete mc.structs[k];
    }
    out.limpio = !mc.structures.some(o => /^zz-/.test(o.key));
    return out;
  });

  if (r.errs && r.errs.length) r.errs.forEach(e => ok('preparacion: ' + e, false));
  console.log('\nEl suelo de una estructura no desaparece mientras se re-hornea el atlas');
  ok('el jugador arranca apoyado en la plataforma', r.apoyado === true, 'y=' + r.yInicial);
  ok('durante el re-horneado NUNCA se queda sin suelo bajo los pies',
    r.muestras > 0 && r.sinSuelo === 0, r.sinSuelo + '/' + r.muestras + ' muestras sin suelo');
  ok('hubo frames durante el re-horneado (si no, el test no prueba nada)', r.muestras >= 2,
    r.muestras + ' muestras, restamp ' + r.msRestamp + ' ms');
  ok('sigue apoyado al terminar', r.apoyadoDespues === true);
  ok('la segunda estructura entro de verdad', r.nuevas === 1, '+' + r.nuevas + ' estructuras (' + r.msEstampa + ' ms)');

  console.log('\nLa colision fina sigue siendo la de la malla');
  ok('el interior de la plataforma es solido', r.dentro === true);
  ok('el aire de encima no lo es', r.fuera === false);
  ok('limpieza: las estructuras de prueba se retiran', r.limpio === true);
  ok('sin errores de pagina', errores.length === 0);
  if (errores.length) console.log(errores.join('\n'));

  await b.close();
  console.log(fallos ? '\n' + fallos + ' fallo(s)' : '\n9 ok, 0 fallos');
  process.exit(fallos ? 1 : 0);
})();