// @area: render
// @necesita: servidor, playwright
// REQ-FLUID4 (fase 3) — vista subacuática. «tanto el agua como la lava han de renderizarse de la
// misma forma […] con vistas subacuáticas».
//
// Lo que se comprueba NO es que exista una variable, sino que la PANTALLA cambia: se lee el
// framebuffer con readPixels antes y después de meter el ojo en el fluido. Dos palancas tienen que
// moverse a la vez, y por eso se miden las dos por separado:
//   · el TINTE   → el color de fondo y la niebla pasan a ser del fluido;
//   · la NIEBLA  → se acerca muchísimo, que es lo que hace que parezca líquido en vez de un cristal
//                  de color. Sin esto se ve el mundo entero con un filtro azul encima, que es justo
//                  lo que el dueño no quiere.
//
// Se usa la válvula `mc.vistaFluido` para forzar el estado sin tener que nadar, y además se prueba el
// camino REAL (mc.vistaFluido = undefined + jugador dentro de una celda de agua), que es el que se
// puede romper sin que nadie se entere.
//
// No persiste nada: bloquea los POST y devuelve la celda tocada y la posición del jugador.
//
//   node test_vista_subacuatica.js [url]        por defecto http://localhost:8500/map/test
const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8500/map/test';
let fallos = 0;
function ok(cond, msg, extra) {
  if (!cond) fallos++;
  console.log((cond ? '  ok  ' : '  FALLA  ') + msg + (extra ? '   [' + extra + ']' : ''));
}

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push(String(e)));
  await p.addInitScript(() => {
    const orig = window.fetch;
    window.fetch = (u, o) => {
      const url = String((u && u.url) || u);
      if (o && String(o.method || 'GET').toUpperCase() !== 'GET' && /\/api\/(mundo|habitantes|assets|agentes)/.test(url))
        return Promise.resolve(new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
      return orig(u, o);
    };
  });
  await p.goto(URL, { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid', null, { timeout: 180000 });
  await p.waitForFunction('window.game && game.fluidos && game.fluidos.info', null, { timeout: 120000 });
  await p.waitForTimeout(3000);

  const r = await p.evaluate(async () => {
    const out = { errs: [], pasos: {} };
    const gl = mc.gl;

    // El color medio de la pantalla. readPixels exige que el frame se haya dibujado en el MISMO
    // evaluate, así que siempre mcRender() justo antes (lección de test_sin_sombra.js).
    function pantalla() {
      mcRender();
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      const buf = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      let r = 0, g = 0, bl = 0;
      for (let i = 0; i < buf.length; i += 4) { r += buf[i]; g += buf[i + 1]; bl += buf[i + 2]; }
      const n = buf.length / 4;
      return { r: r / n, g: g / n, b: bl / n };
    }

    const posPrev = mc.pos.slice();
    const vistaPrev = mc.vistaFluido;

    // ── 1 · fuera del agua: el estado de siempre ────────────────────────────────────────────────
    mc.vistaFluido = null;
    const fuera = pantalla();
    out.pasos.fuera = fuera;
    out.cieloFuera = Array.from(mcCieloEf);
    out.nieblaFuera = mcNieblaEf;
    // La niebla efectiva se mide pasando un far de referencia: fuera es PROPORCIONAL (980 de 1000) y
    // dentro es ABSOLUTA en bloques. Comparar los dos números es lo que prueba que se acerca de verdad.
    out.fogFuera = [mcFogNear(1000), mcFogFar(1000)];
    out.fogFuera5k = mcFogFar(5000);
    out.tinteFuera = mcFogMin();

    // ── 2 · agua ────────────────────────────────────────────────────────────────────────────────
    mc.vistaFluido = 'WATER';
    const agua = pantalla();
    out.pasos.agua = agua;
    out.cieloAgua = Array.from(mcCieloEf);
    out.nieblaAgua = mcNieblaEf;
    out.fogAgua = [mcFogNear(1000), mcFogFar(1000)];
    out.fogAgua5k = mcFogFar(5000);
    out.tinteAgua = mcFogMin();

    // ── 3 · lava ────────────────────────────────────────────────────────────────────────────────
    mc.vistaFluido = 'LAVA';
    const lava = pantalla();
    out.pasos.lava = lava;
    out.cieloLava = Array.from(mcCieloEf);
    out.tinteLava = mcFogMin();

    // ── 4 · un fluido que no existe no debe teñir nada ──────────────────────────────────────────
    mc.vistaFluido = 'NONE';
    pantalla();
    out.cieloNone = Array.from(mcCieloEf);

    // ── 5 · los tunables de consola ─────────────────────────────────────────────────────────────
    mc.vistaFluido = 'WATER';
    out.tunAntes = game.vistaAgua();
    game.vistaAgua({ far: 3 });
    pantalla();
    out.tunFar = mcNieblaEf ? mcNieblaEf[1] : null;
    game.vistaAgua({ sky: [1, 0, 0] });
    pantalla();
    out.tunSky = Array.from(mcCieloEf);
    out.tunFarTrasSky = mcNieblaEf ? mcNieblaEf[1] : null;   // cambiar el color no debe tocar la niebla
    game.vistaAgua({ tinte: 0.9 });
    pantalla();
    out.tunTinte = mcFogMin();
    game.vistaAgua('reset');
    pantalla();
    out.tunReset = { sky: Array.from(mcCieloEf), far: mcNieblaEf ? mcNieblaEf[1] : null, tinte: mcFogMin() };

    // ── restaurar ───────────────────────────────────────────────────────────────────────────────
    mc.pos[0] = posPrev[0]; mc.pos[1] = posPrev[1]; mc.pos[2] = posPrev[2];
    mc.vistaFluido = vistaPrev;
    mcRender();
    return out;
  });

  console.log('\n§1 · fuera del agua: nada cambia');
  ok(JSON.stringify(r.cieloFuera) === JSON.stringify([0.549, 0.776, 1]),
    'el cielo sigue siendo MC_SKY', JSON.stringify(r.cieloFuera));
  ok(r.nieblaFuera === null, 'la niebla sigue siendo la de siempre (null)', String(r.nieblaFuera));

  console.log('\n§2 · agua: tiñe y acerca la niebla');
  ok(r.cieloAgua[2] > r.cieloAgua[0] && r.cieloAgua[2] > r.cieloAgua[1],
    'el cielo bajo el agua es azul (b > r y b > g)', JSON.stringify(r.cieloAgua));
  ok(r.cieloAgua[0] < r.cieloFuera[0] && r.cieloAgua[1] < r.cieloFuera[1],
    'y es más oscuro que el cielo normal', JSON.stringify(r.cieloAgua));
  ok(r.fogAgua[1] < r.fogFuera[0],
    'la niebla se acerca MUCHO: acaba antes de donde fuera ni siquiera empezaba',
    'fuera=[' + r.fogFuera.join('…') + '] agua=[' + r.fogAgua.join('…') + ']');
  ok(r.fogAgua[1] === r.fogAgua5k && r.fogFuera[1] !== r.fogFuera5k,
    'y es ABSOLUTA en bloques: no cambia al subir el far de proyección (fuera sí cambia)',
    'agua 1000/5000 = ' + r.fogAgua[1] + '/' + r.fogAgua5k +
    ' · fuera = ' + r.fogFuera[1] + '/' + r.fogFuera5k);
  // Lo que pidió el dueño: «quiero por lo menos un far 100, ver las cosas de lejos en el agua, y no
  // se ven las paredes […] deberían verse». Una niebla corta las borraba.
  ok(r.fogAgua[1] >= 100, 'se ve LEJOS: la niebla no borra las paredes (far >= 100 bloques)',
    r.fogAgua[1] + ' bloques');
  ok(r.tinteAgua > 0 && r.tinteFuera === 0,
    'y aun así todo se tiñe, por el SUELO de niebla (lo que hace que parezca agua sin cerrar la vista)',
    'agua=' + r.tinteAgua + ' fuera=' + r.tinteFuera);
  ok(r.tinteAgua < 1, 'el tinte deja ver lo que hay detrás (no es opaco)', String(r.tinteAgua));
  const a = r.pasos.agua, f = r.pasos.fuera;
  ok(Math.abs(a.r - f.r) + Math.abs(a.g - f.g) + Math.abs(a.b - f.b) > 8,
    'la PANTALLA cambia de verdad (readPixels)',
    'fuera=' + f.r.toFixed(1) + ',' + f.g.toFixed(1) + ',' + f.b.toFixed(1) +
    ' agua=' + a.r.toFixed(1) + ',' + a.g.toFixed(1) + ',' + a.b.toFixed(1));
  ok(a.b > a.r, 'y la pantalla tira a azul', a.r.toFixed(1) + ' vs ' + a.b.toFixed(1));

  console.log('\n§3 · lava: mismo mecanismo, otro color');
  ok(r.cieloLava[0] > r.cieloLava[2], 'el cielo en lava es rojizo (r > b)', JSON.stringify(r.cieloLava));
  const l = r.pasos.lava;
  ok(l.r > l.b, 'y la pantalla tira a rojo', l.r.toFixed(1) + ' vs ' + l.b.toFixed(1));
  ok(JSON.stringify(r.cieloLava) !== JSON.stringify(r.cieloAgua), 'agua y lava no se confunden');
  ok(r.tinteLava > r.tinteAgua, 'en lava se ve MUCHO menos que en agua, a propósito',
    'lava=' + r.tinteLava + ' agua=' + r.tinteAgua);

  console.log('\n§4 · un tipo desconocido no tiñe');
  ok(JSON.stringify(r.cieloNone) === JSON.stringify([0.549, 0.776, 1]),
    'fluidType desconocido → cielo normal', JSON.stringify(r.cieloNone));

  console.log('\n§5 · tunables de consola (game.vistaAgua)');
  ok(r.tunFar === 3 * 1, 'game.vistaAgua({far:3}) llega a la niebla', String(r.tunFar));
  ok(JSON.stringify(r.tunSky) === JSON.stringify([1, 0, 0]), 'y {sky:[…]} llega al color',
    JSON.stringify(r.tunSky));
  ok(r.tunFarTrasSky === 3, 'cambiar solo el color no pisa la distancia', String(r.tunFarTrasSky));
  ok(r.tunTinte === 0.9, 'y {tinte:0.9} llega al suelo de niebla', String(r.tunTinte));
  ok(JSON.stringify(r.tunReset.sky) === JSON.stringify(r.tunAntes.sky) && r.tunReset.far === r.tunAntes.far,
    "'reset' devuelve el color y la distancia de fábrica",
    JSON.stringify(r.tunReset) + ' vs ' + JSON.stringify(r.tunAntes));

  // ── §6 · el camino REAL, en un mapa que sí tiene fluidos ──────────────────────────────────────
  // /map/test no tiene agua en la paleta, así que la detección automática —que es justo lo que se
  // puede romper sin que nadie se entere— quedaría sin probar. /map/voxelforge tiene agua y lava con
  // niveles. Solo se lee: se toca mc.grid en memoria y se devuelve, y los POST siguen bloqueados.
  const URL_FLUIDOS = process.env.URL_FLUIDOS || URL.replace(/\/map\/[^/]*$/, '/map/voxelforge');
  console.log('\n§6 · el camino real (sin válvula), con el ojo dentro del agua — ' + URL_FLUIDOS);
  const p2 = await b.newPage();
  const errores2 = [];
  p2.on('pageerror', e => errores2.push(String(e)));
  await p2.goto(URL_FLUIDOS, { waitUntil: 'load', timeout: 120000 });
  await p2.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid', null, { timeout: 180000 });
  await p2.waitForFunction('window.game && game.fluidos && game.fluidos.info', null, { timeout: 120000 });
  await p2.waitForTimeout(3000);

  const r5 = await p2.evaluate(() => {
    const out = {};
    // Buscar en la paleta cada tipo por lo que dice el MOTOR DE FLUIDOS, no por el nombre.
    const porTipo = {};
    for (let i = 1; i < mc.blockKey.length; i++) {
      const pr = game.fluidos.getProps(i, 0, 0, 0);
      if (pr && pr.isFluid && !porTipo[pr.fluidType]) porTipo[pr.fluidType] = { id: i, key: mc.blockKey[i] };
    }
    out.porTipo = porTipo;

    const vistaPrev = mc.vistaFluido;
    mc.vistaFluido = undefined;                     // sin válvula: detección automática
    const ex = Math.floor(mc.pos[0]), ez = Math.floor(mc.pos[2]);
    const eyOjo = Math.floor(mc.pos[1] + 1.62 * mc.scale);
    const eyPies = Math.floor(mc.pos[1]);
    out.celdaOjo = [ex, eyOjo, ez];
    const iOjo = mcIdx(ex, eyOjo, ez), iPies = mcIdx(ex, eyPies, ez);
    const prevOjo = mc.grid[iOjo] | 0, prevPies = mc.grid[iPies] | 0;

    const mide = () => { mcRender(); return { f: mc.fluidoOjo, cielo: Array.from(mcCieloEf) }; };

    out.vacio = mide();
    if (porTipo.WATER) { mc.grid[iOjo] = porTipo.WATER.id; out.agua = mide(); mc.grid[iOjo] = prevOjo; }
    if (porTipo.LAVA) { mc.grid[iOjo] = porTipo.LAVA.id; out.lava = mide(); mc.grid[iOjo] = prevOjo; }
    // Agua a la altura de los PIES pero no del ojo: no debe teñir (es el caso de andar por un charco).
    if (porTipo.WATER && eyPies !== eyOjo) {
      mc.grid[iPies] = porTipo.WATER.id; out.soloPies = mide(); mc.grid[iPies] = prevPies;
    }
    out.trasQuitar = mide();

    mc.grid[iOjo] = prevOjo; mc.grid[iPies] = prevPies;
    mc.vistaFluido = vistaPrev;
    mcRender();
    return out;
  });

  ok(!!r5.porTipo.WATER, 'el mapa tiene agua en la paleta', JSON.stringify(r5.porTipo.WATER || null));
  ok(!!r5.porTipo.LAVA, 'el mapa tiene lava en la paleta', JSON.stringify(r5.porTipo.LAVA || null));
  ok(r5.vacio.f === null, 'con la celda del ojo vacía no hay tinte', String(r5.vacio.f));
  if (r5.agua) {
    ok(r5.agua.f === 'WATER', 'mcFluidoOjo detecta el agua solo, sin válvula', String(r5.agua.f));
    ok(r5.agua.cielo[2] > r5.agua.cielo[0], 'y el cielo se vuelve azul', JSON.stringify(r5.agua.cielo));
  }
  if (r5.lava) {
    ok(r5.lava.f === 'LAVA', 'y la lava se detecta como lava', String(r5.lava.f));
    ok(r5.lava.cielo[0] > r5.lava.cielo[2], 'con su cielo rojizo', JSON.stringify(r5.lava.cielo));
  }
  if (r5.soloPies) {
    ok(r5.soloPies.f === null, 'agua en los PIES pero no en el ojo: no tiñe (charco)', String(r5.soloPies.f));
  }
  ok(r5.trasQuitar.f === null, 'al vaciar la celda del ojo vuelve a null', String(r5.trasQuitar.f));
  ok(JSON.stringify(r5.trasQuitar.cielo) === JSON.stringify([0.549, 0.776, 1]),
    'y el cielo vuelve a MC_SKY', JSON.stringify(r5.trasQuitar.cielo));
  ok(errores2.length === 0, 'ningún error en la página de fluidos', errores2.slice(0, 3).join(' | '));

  console.log('\n§7 · sin errores de página');
  ok(errores.length === 0, 'ningún error en consola', errores.slice(0, 3).join(' | '));

  await b.close();
  console.log(fallos ? '\n' + fallos + ' FALLA(N)' : '\nTODO OK');
  process.exit(fallos ? 1 : 0);
})();
