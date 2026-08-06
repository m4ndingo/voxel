// REQ-OSD1 · los dos botones de la esquina del Mundo (🧩 Código y ✕ Cerrar) nacen ocultos, para que no
// salgan en las capturas, y se piden con game.showOSDbuttons(true).
//
// El riesgo de este ticket NO es esconderlos, es esconderlos DE MÁS: en táctil no hay teclado, así que
// sin el botón de cerrar y sin Esc el Mundo se queda sin salida. Por eso «✕ Cerrar» es innegociable en
// táctil, y eso es lo que más se guarda aquí. Se mira `game.touchControls` (mcTouchOn) y no la
// constante MC_TOUCH, para que mande lo mismo que decide si salen los mandos táctiles.
//
// Se prueba en DOS contextos de navegador, porque el defecto depende del dispositivo:
//   1. escritorio (sin táctil): los dos ocultos de partida;
//   2. táctil de 390 px: «✕ Cerrar» visible de partida, «🧩 Código» no.
// No persiste nada en el mundo: solo lee, y bloquea el POST por si la SPA autoguarda al abrirse.
const { chromium } = require('playwright');

let fallos = 0;
const ok = (nom, cond, extra) => {
  console.log((cond ? '  ok  ' : '  FALLA  ') + nom + (extra ? '   (' + extra + ')' : ''));
  if (!cond) fallos++;
};
const RAIZ = 'http://localhost:8500';
const BLOQUEA_POST = () => {
  const orig = window.fetch;
  window.fetch = (u, o) => {
    const url = String((u && u.url) || u);
    if (o && String(o.method || 'GET').toUpperCase() === 'POST' && /\/api\/mundo/.test(url))
      return Promise.resolve(new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    return orig(u, o);
  };
};
const VE = () => ({ codigo: !document.querySelector('#mc-code-btn').hidden,
                    cerrar: !document.querySelector('#mc-close').hidden });

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const errores = [];

  const abre = async (ctx) => {
    await ctx.addInitScript(BLOQUEA_POST);
    const p = await ctx.newPage();
    p.on('pageerror', e => errores.push(String(e)));
    await p.goto(RAIZ + '/map/test', { waitUntil: 'load', timeout: 60000 });
    await p.waitForFunction('typeof mc !== "undefined" && mc.prog && mc.active && mc.grid', { timeout: 120000 });
    await p.waitForTimeout(1500);
    return p;
  };

  // ── 1 · escritorio: los dos ocultos de partida ──────────────────────────────────────────────
  console.log('\nEscritorio (sin táctil)');
  const ctx1 = await b.newContext();
  let p = await abre(ctx1);
  const r1 = await p.evaluate((ve) => {
    const f = new Function('return (' + ve + ')()');
    const out = { tactil: game.touchControls, defecto: f() };
    game.showOSDbuttons(true);  out.pedidos = f();
    game.showOSDbuttons(false); out.quitados = f();
    out.conmuta = (game.showOSDbuttons(), f());        // sin argumento = conmutar, como showFPS
    out.valor = String(game.showOSDbuttons);
    out.guardado = localStorage.getItem('vf_showOSD');
    out.enDump = 'showOSDbuttons' in game.dumpVars();
    return out;
  }, VE.toString());
  ok('el navegador de prueba no es táctil', r1.tactil === false);
  ok('de partida NO se ve ninguno de los dos', r1.defecto.codigo === false && r1.defecto.cerrar === false,
     JSON.stringify(r1.defecto));
  ok('showOSDbuttons(true) enseña los dos', r1.pedidos.codigo === true && r1.pedidos.cerrar === true,
     JSON.stringify(r1.pedidos));
  ok('…y (false) los vuelve a esconder', r1.quitados.codigo === false && r1.quitados.cerrar === false);
  ok('sin argumento conmuta', r1.conmuta.codigo === true && r1.conmuta.cerrar === true, 'valor=' + r1.valor);
  ok('se guarda en localStorage', r1.guardado === '1', 'vf_showOSD=' + r1.guardado);
  ok('sale en game.dumpVars()', r1.enDump === true);

  // ── 2 · sobrevive a recargar, y con ellos ocultos Esc y Alt+C siguen valiendo ───────────────
  console.log('\nSobrevive a recargar, y el teclado sigue siendo la salida');
  await p.evaluate(() => { game.showOSDbuttons(false); });
  await p.goto(RAIZ + '/map/test', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction('typeof mc !== "undefined" && mc.prog && mc.active && mc.grid', { timeout: 120000 });
  await p.waitForTimeout(1500);
  const r2 = await p.evaluate((ve) => new Function('return (' + ve + ')()')(), VE.toString());
  ok('vuelven ocultos tras recargar', r2.codigo === false && r2.cerrar === false, JSON.stringify(r2));

  await p.keyboard.press('Alt+KeyC');
  await p.waitForTimeout(400);
  const abrio = await p.evaluate(() => { const m = document.querySelector('#snip-modal'); return !!m && !m.hidden; });
  ok('Alt+C sigue abriendo los snippets sin el botón', abrio === true);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);

  await p.keyboard.press('Escape');
  await p.waitForTimeout(500);
  const cerrado = await p.evaluate(() => mc.active === false);
  ok('Esc sigue cerrando el Mundo sin el botón', cerrado === true);
  await ctx1.close();

  // ── 3 · táctil: «Cerrar» es innegociable ────────────────────────────────────────────────────
  console.log('\nTáctil a 390 px: no se puede quedar sin salida');
  const ctx2 = await b.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });
  const p2 = await abre(ctx2);
  const r3 = await p2.evaluate((ve) => {
    const f = new Function('return (' + ve + ')()');
    const out = { tactil: game.touchControls, defecto: f() };
    game.showOSDbuttons(false); out.forzadoOff = f();       // aun pidiéndolo, Cerrar tiene que quedarse
    game.showOSDbuttons(true);  out.pedidos = f();
    game.showOSDbuttons(false);
    game.touchControls = false; out.sinTactil = f();        // con teclado ya se puede esconder
    game.touchControls = true;  out.otraVez = f();
    return out;
  }, VE.toString());
  ok('el contexto sí es táctil', r3.tactil === true);
  ok('de partida se ve «Cerrar» y NO «Código»', r3.defecto.cerrar === true && r3.defecto.codigo === false,
     JSON.stringify(r3.defecto));
  ok('showOSDbuttons(false) NO puede esconder «Cerrar»', r3.forzadoOff.cerrar === true,
     'sin esto el móvil se queda encerrado');
  ok('…pero sí esconde «Código»', r3.forzadoOff.codigo === false);
  ok('showOSDbuttons(true) enseña los dos igual', r3.pedidos.codigo === true && r3.pedidos.cerrar === true);
  ok('quitando los mandos táctiles ya se puede esconder', r3.sinTactil.cerrar === false, JSON.stringify(r3.sinTactil));
  ok('…y al devolverlos vuelve «Cerrar»', r3.otraVez.cerrar === true);
  await ctx2.close();

  ok('sin errores de pagina', errores.length === 0, errores.join(' | '));

  console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\ntodo ok');
  await b.close();
  process.exit(fallos ? 1 : 0);
})();
