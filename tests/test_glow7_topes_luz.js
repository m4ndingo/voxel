// @area: render
// @necesita: servidor, playwright
// REQ-GLOW7 — los topes de los mandos de luz. Tres notas de /map/bugfinder:
//   · 43,14,69 «hace falta poder subir game.interiorDark a un valor mayor que 1»
//   · 29,14,70 «game.flowFocus no sube de 1» → flowFocus NO EXISTE, es glowFocus
//   · 35,14,37 «un punto emisivo por la noche ilumina demasiado ¿como se controla? game.glowGain»
//
// Lo que se arregló y lo que hay que sujetar:
//   1) `interiorDark` llega a MC_INTERIOR_DARK_MAX (4). Pasar de 1 SOBREEXPONE la penumbra
//      (factor `dark^((MAX-lv)/MAX)` > 1 donde no hay luz), que es un revelado para inspeccionar.
//   2) **La trampa de verdad**: el «apagado» del skylight es el 1 EXACTO. `mcComputeLight` y
//      `mcRelightBox` se saltaban el cálculo con `>=1`, así que con interiorDark=2 el mundo se
//      quedaba sin `mc.light` que leer y la sobreexposición no se veía. El tramo B es ese guardián:
//      con 2 puesto, la luz del mundo tiene que seguir calculándose entera.
//   3) `game.flowFocus` avisa y reenvía en vez de tragarse el valor callado.
//
// No toca el mundo del dueño: monta su propia caja en /map/test y deja los mandos como estaban.

const { chromium } = require('playwright');

let fallos = 0;
const ok = (nom, cond, extra) => {
  console.log((cond ? '  ok  ' : '  FALLA  ') + nom + (extra ? '   (' + extra + ')' : ''));
  if (!cond) fallos++;
};

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  const avisos = [];
  p.on('console', m => { if (m.type() === 'warning') avisos.push(m.text()); });

  await p.goto('http://localhost:8500/map/test', { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid && typeof game!=="undefined"',
    null, { timeout: 180000 });
  await p.waitForTimeout(2000);

  console.log('\nA · el recorrido de game.interiorDark llega a 4, no a 1');
  const a = await p.evaluate(() => {
    const out = { antes: game.interiorDark, max: (typeof MC_INTERIOR_DARK_MAX !== 'undefined') ? MC_INTERIOR_DARK_MAX : null };
    game.interiorDark = 2;    out.dos = game.interiorDark;
    game.interiorDark = 3.5;  out.tresYMedio = game.interiorDark;
    game.interiorDark = 99;   out.tope = game.interiorDark;
    game.interiorDark = -5;   out.suelo = game.interiorDark;
    game.interiorDark = 2;    out.guardado = localStorage.getItem('vf_mcInteriorDark');
    return out;
  });
  ok('MC_INTERIOR_DARK_MAX existe y vale 4', a.max === 4, String(a.max));
  ok('2 se acepta tal cual (antes se recortaba a 1)', a.dos === 2, String(a.dos));
  ok('y los decimales también', a.tresYMedio === 3.5, String(a.tresYMedio));
  ok('con tope arriba en 4', a.tope === 4, String(a.tope));
  ok('…y suelo en 0', a.suelo === 0, String(a.suelo));
  ok('persiste en localStorage', a.guardado !== null, 'vf_mcInteriorDark=' + a.guardado);

  console.log('\nB · GUARDIÁN: con interiorDark>1 el skylight SIGUE calculándose');
  // Una caja tapada: dentro tiene que quedar mc.light=0 y fuera, a cielo abierto, MC_MAXLIGHT. Si
  // mcComputeLight vuelve a saltarse el cálculo con `>=1`, el dentro deja de ser 0 y esto se cae.
  const bres = await p.evaluate(async () => {
    const out = {};
    // El material se elige por lo que HACE, no por su nombre: el primero de la paleta por el que la
    // luz no pasa. Pedir 'hab:roca' por nombre daba `undefined` en un mapa que no lo tuviera cargado,
    // y entonces la «caja» era aire y el hueco salía a 15 sin que nada estuviera roto.
    const PASA = mcTablaLuz();
    let idOpaco = 0;
    for (let id = 1; id < mc.palette.length; id++) if (mc.palette[id] && !PASA[id]) { idOpaco = id; break; }
    out.material = idOpaco ? (mc.blockKey[idOpaco] || '#' + idOpaco) : '(ninguno opaco en la paleta)';
    const X = 60, Y = 30, Z = 60;
    for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) for (let dz = -2; dz <= 2; dz++)
      mcSetBlock(X + dx, Y + dy, Z + dz, 0);
    // Cáscara maciza de 3×3×3 con el hueco en el centro.
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++)
      if (dx || dy || dz) mcSetBlock(X + dx, Y + dy, Z + dz, idOpaco);
    const luz = (x, y, z) => mc.light ? mc.light[mcIdx(x, y, z)] : -1;
    for (const d of [2, 0.55]) {
      game.interiorDark = d;
      mcComputeLight();
      out['d' + d] = { dentro: luz(X, Y, Z), cielo: luz(X, Y + 8, Z) };
    }
    // Y el 1 EXACTO tiene que SALTARSE el cálculo: se marca mc.light con un centinela y se comprueba
    // que mcComputeLight ni lo mira. Es lo que hace que apagar el mando no cueste nada.
    game.interiorDark = 1;
    mc.light.fill(7);
    mcComputeLight();
    out.centinela = luz(X, Y, Z);
    out.MAX = MC_MAXLIGHT;
    return out;
  });
  console.log('  · caja de prueba hecha de ' + bres.material);
  ok('con interiorDark=2 el hueco tapado sigue a oscuras', bres.d2.dentro === 0,
    'dentro=' + bres.d2.dentro);
  ok('…y el cielo abierto sigue a tope', bres.d2.cielo === bres.MAX, 'cielo=' + bres.d2.cielo);
  ok('sale lo MISMO que con 0.55 (el mando no cambia la difusión, solo el revelado)',
    bres.d2.dentro === bres['d0.55'].dentro && bres.d2.cielo === bres['d0.55'].cielo);
  ok('y con 1 EXACTO se salta el cálculo entero (sigue siendo el apagado, y gratis)',
    bres.centinela === 7, 'centinela=' + bres.centinela);

  console.log('\nC · glowFocus sigue siendo 0..1 de verdad, y flowFocus avisa');
  const c = await p.evaluate(() => {
    const out = { focoAntes: game.glowFocus };
    game.glowFocus = 5;   out.recorte = game.glowFocus;
    game.glowFocus = 0.4; out.medio = game.glowFocus;
    out.flowLee = game.flowFocus;            // getter: avisa por consola y devuelve glowFocus
    game.flowFocus = 0.8;                    // setter: reenvía a glowFocus
    out.trasFlow = game.glowFocus;
    out.enumerable = Object.keys(game).includes('flowFocus');
    game.glowFocus = out.focoAntes;
    return out;
  });
  ok('glowFocus no pasa de 1 (es el extremo del recorrido, no un recorte)', c.recorte === 1, String(c.recorte));
  ok('game.flowFocus LEE el valor de glowFocus', c.flowLee === 0.4, String(c.flowLee));
  ok('…y ESCRIBIR en flowFocus llega a glowFocus (antes se perdía callado)', c.trasFlow === 0.8, String(c.trasFlow));
  ok('avisó por consola de que flowFocus no existe', avisos.some(t => /flowFocus no existe/.test(t)),
    avisos.filter(t => /flowFocus/.test(t)).join(' · ') || 'ningún aviso');
  ok('y no ensucia Object.keys(game)', c.enumerable === false);

  console.log('\nD · game.glowGain: el mando que preguntaba la nota, sin tocar');
  const d = await p.evaluate(() => {
    const out = { antes: game.glowGain };
    game.glowGain = 0.25; out.baja = game.glowGain;
    game.glowGain = 99;   out.tope = game.glowGain;
    game.glowGain = out.antes;
    return out;
  });
  ok('se puede BAJAR de 1 (que es lo que pedía «ilumina demasiado»)', d.baja === 0.25, String(d.baja));
  ok('y sigue topado en 16', d.tope === 16, String(d.tope));

  // Dejarlo como estaba: este test corre contra el servidor del dueño.
  await p.evaluate(v => { game.interiorDark = v; mcComputeLight(); mcMeshAll(); }, a.antes);
  await b.close();
  console.log(fallos ? '\n' + fallos + ' FALLOS' : '\nOK');
  process.exit(fallos ? 1 : 0);
})();
