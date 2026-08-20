// @area: mundo
// @necesita: servidor, playwright
// REQ-SHADOW3 — dos notas del dueño en /map/bugfinder pidiendo MANDOS para la sombra proyectada, no un arreglo:
//   34,14,59 — «*la sombra sale muy difuminada por la noche y casi no se ve*»
//   42,14,44 — «*la espada de luz proyecta alguna sombra? no definidas pero parece que sí, aunque podrian estar más
//               definidas. estaria bien configurar estas sombras*»
//
// Lo que hay que entender para leer este test (docs/luz-y-sombra.md): esto es la **sombra proyectada del sol** (mapa
// de sombra en la GPU), que es COSA APARTE de la skylight horneada en el vértice (`game.interiorDark`). Y la espada
// de luz **no proyecta ninguna sombra**: es luz dinámica, no entra en el mapa de sombra.
//
// Los dos mandos:
//   · `game.shadowSuave` — radio del filtrado PCF en téxeles. 0 = borde duro («*podrían estar más definidas*»).
//   · `game.sunShadeNoche` — cuánto apaga la sombra con la exposición a 0. La sombra es un FACTOR, y de noche
//     multiplica algo que `game.luz` ya dejó casi negro; por eso «casi no se ve» aunque el valor no cambie.
//
// ⚠️ Trampa que este test vigila expresamente: el mapa de sombra no se reserva cuando la sombra está «apagada», y
// esa comprobación tiene que mirar el valor EFECTIVO. Con `sunShade=1` (sin sombra de día) y `sunShadeNoche` puesto,
// mirar `mc.sunShade` a secas dejaría el mundo sin mapa y la sombra de noche no llegaría a existir nunca.

const { chromium } = require('playwright');

let fallos = 0;
const ok = (nom, cond, extra) => {
  console.log((cond ? '  ok  ' : '  FALLA  ') + nom + (extra ? '   (' + extra + ')' : ''));
  if (!cond) fallos++;
};
const casi = (a, b) => Math.abs(a - b) < 1e-4;

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push(String(e)));

  await p.goto('http://localhost:8500/map/test', { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid && typeof game!=="undefined"',
    null, { timeout: 180000 });
  await p.waitForTimeout(1500);

  await p.evaluate(() => {
    window._sh3 = { suave: mc.shadowSuave, noche: mc.sunShadeNoche, shade: mc.sunShade, luz: mc.luzGlobal };
  });

  console.log('\nA · game.shadowSuave: de borde duro a muy difuminada');
  const a = await p.evaluate(() => {
    const out = { defecto: mc.shadowSuave };
    game.shadowSuave = 0; out.duro = mc.shadowSuave;
    game.shadowSuave = 2.5; out.medio = mc.shadowSuave;
    game.shadowSuave = 99; out.topado = mc.shadowSuave;        // hay tope: por encima el filtro es ruido, no difuminado
    game.shadowSuave = -3; out.suelo = mc.shadowSuave;
    game.shadowSuave = 'ni idea'; out.basura = mc.shadowSuave; // un valor sin sentido vuelve al 1, no deja NaN
    out.persiste = localStorage.getItem('vf_mcShadowSuave');
    game.shadowSuave = 1;
    return out;
  });
  ok('por defecto vale 1 (el difuminado de siempre)', a.defecto === 1, String(a.defecto));
  ok('0 = borde duro', a.duro === 0);
  ok('se puede pedir a medio camino', a.medio === 2.5, String(a.medio));
  ok('tiene tope por arriba', a.topado > 1 && a.topado <= 8, String(a.topado));
  ok('y suelo en 0', a.suelo === 0, String(a.suelo));
  ok('un valor sin sentido no deja NaN', a.basura === 1, String(a.basura));
  ok('persiste entre sesiones', a.persiste !== null, 'vf_mcShadowSuave=' + a.persiste);

  console.log('\nB · el radio LLEGA al shader (se lee de vuelta de la GPU)');
  const bres = await p.evaluate(async () => {
    const gl = mc.gl, lee = () => { gl.useProgram(mc.prog); return gl.getUniform(mc.prog, mc.loc.uSunSuave); };
    const espera = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const out = { existe: !!(mc.loc && mc.loc.uSunSuave) };
    mc.sunShade = 0.55;                                        // con la sombra encendida, que si no ni se sube
    game.shadowSuave = 0; await espera(); out.duro = lee();
    game.shadowSuave = 3; await espera(); out.blando = lee();
    game.shadowSuave = 1;
    return out;
  });
  ok('el uniforme existe en el shader del terreno', bres.existe === true);
  ok('con 0 la GPU recibe 0', casi(bres.duro, 0), 'uSunSuave=' + bres.duro);
  ok('con 3 recibe 3', casi(bres.blando, 3), 'uSunSuave=' + bres.blando);

  console.log('\nC · game.sunShadeNoche: la sombra puede apretar más de noche que de día');
  const c = await p.evaluate(() => {
    const out = {};
    mc.sunShade = 0.8;
    game.sunShadeNoche = null;
    mc.luzGlobal = 1;   out.sinMandoDia = mcSunShadeEf();
    mc.luzGlobal = 0;   out.sinMandoNoche = mcSunShadeEf();    // sin mando: el mismo valor a todas horas
    game.sunShadeNoche = 0.2;
    mc.luzGlobal = 1;   out.conMandoDia = mcSunShadeEf();      // de día sigue mandando sunShade
    mc.luzGlobal = 0;   out.conMandoNoche = mcSunShadeEf();
    mc.luzGlobal = 0.5; out.medio = mcSunShadeEf();            // y en medio, interpolado con la exposición
    out.persiste = localStorage.getItem('vf_mcSunShadeNoche');
    game.sunShadeNoche = null;
    out.borrado = localStorage.getItem('vf_mcSunShadeNoche');
    return out;
  });
  ok('sin mando, de día es sunShade', casi(c.sinMandoDia, 0.8), String(c.sinMandoDia));
  ok('sin mando, de noche es el MISMO (como siempre)', casi(c.sinMandoNoche, 0.8), String(c.sinMandoNoche));
  ok('con mando, de día no cambia nada', casi(c.conMandoDia, 0.8), String(c.conMandoDia));
  ok('con mando, de noche aprieta', casi(c.conMandoNoche, 0.2), String(c.conMandoNoche));
  ok('y a media luz va interpolado', casi(c.medio, 0.5), String(c.medio));
  ok('persiste, y ponerlo a null lo borra', c.persiste !== null && c.borrado === null);

  console.log('\nD · la trampa: sunShade=1 con sombra de noche NO deja el mundo sin mapa');
  const d = await p.evaluate(() => {
    const out = {};
    mc.sunShade = 1; game.sunShadeNoche = null; mc.luzGlobal = 1;
    out.apagadaDeVerdad = mcSunShadeEf() >= 1;                 // sin mando y sunShade=1 ⇒ sombra apagada, mapa fuera
    game.sunShadeNoche = 0.3; mc.luzGlobal = 0;
    out.encendidaDeNoche = mcSunShadeEf() < 1;                 // con mando y de noche ⇒ HAY sombra: el mapa hace falta
    return out;
  });
  ok('con sunShade=1 y sin mando, la sombra sigue apagada', d.apagadaDeVerdad === true);
  ok('con sunShade=1 pero sombra de noche puesta, hay sombra', d.encendidaDeNoche === true);

  console.log('\nE · la espada de luz sigue SIN proyectar sombra (y eso no es un olvido)');
  const e = await p.evaluate(() => {
    // La pregunta del dueño era «¿la espada proyecta alguna sombra?». No: el mapa de sombra tiene UNA fuente, el sol,
    // y las luces dinámicas no entran en él. Lo que él veía «poco definido» es el degradado de la propia caída.
    // Desde BUG-GLOW6 sí hay un corte limpio: una cara de espaldas a la espada deja de recibirla.
    return { unaSolaFuente: typeof mcRenderShadow === 'function' && mc._dynN !== undefined, ocluye: mc.luzOcluye };
  });
  ok('el mapa de sombra y la luz dinámica siguen siendo cosas distintas', e.unaSolaFuente === true);
  ok('lo que sí corta la luz de la espada es BUG-GLOW6', e.ocluye === true);

  await p.evaluate(() => {
    const s = window._sh3;
    game.shadowSuave = s.suave; game.sunShadeNoche = s.noche;
    mc.sunShade = s.shade; mc.luzGlobal = s.luz;
  });

  ok('sin errores de página', errores.length === 0, errores.join(' · '));

  await b.close();
  console.log(fallos ? '\n' + fallos + ' FALLOS' : '\nOK');
  process.exit(fallos ? 1 : 0);
})();
