// El mapa de sombra cubre el mundo entero a 2048x2048 y se rehacia ENTERO en cada frame en el que algo se moviese,
// porque la firma de mcRenderShadow mezclaba geometria y posiciones de agentes. Medido con 48 estructuras: +20 ms
// por frame. Eso es lo que el dueno veia como "coloco una estructura y los fps caen de 144 a 60-80 durante unos
// segundos": tras colocar, los agentes reaccionan y andan un rato; mientras andan, re-horneado a 144 Hz; cuando se
// quedan quietos, los fps vuelven solos. (No se reproducia headless porque el mundo de pruebas tiene 0 agentes.)
//
// Ahora hay dos firmas: la geometria re-hornea en el acto y el movimiento va estrangulado a mc.shadowMoveMs.
// Este test guarda las dos mitades: que el movimiento NO rehornee cada frame, y que una edicion SI lo haga ya.
// No persiste nada: bloquea el POST del mundo.
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
    // Cuenta re-horneados DE VERDAD. No vale mirar S.dirty antes de llamar: ahora la decision de rehornear se toma
    // DENTRO de mcRenderShadow (el freno promociona moved->dirty ahi), asi que desde fuera se ve false. Lo que si
    // marca cada horneado real es S.lastBake.
    let horneados = 0;
    const orig = window.mcRenderShadow;
    window.mcRenderShadow = function () {
      const antes = mc.shadow ? mc.shadow.lastBake : 0;
      const res = orig.apply(this, arguments);
      if (mc.shadow && mc.shadow.lastBake !== antes) horneados++;
      return res;
    };
    // Un agente de mentira que se mueve un poco en cada frame, que es el caso que disparaba el re-horneado.
    const falso = { count: 12, vbo: null, renderX: 10, renderY: 5, renderZ: 10 };
    mc.agents.set('zz-movil', falso);

    const correr = (frames, prep) => new Promise(res => {
      horneados = 0; let n = 0; const t0 = performance.now();
      const paso = () => {
        if (prep) prep(n);
        if (++n >= frames) { res({ ms: +((performance.now() - t0) / frames).toFixed(1), horneados, frames }); return; }
        requestAnimationFrame(paso);
      };
      requestAnimationFrame(paso);
    });

    // OJO: aqui un frame dura ~100 ms (SwiftShader), muchisimo mas que los 45 ms de produccion, asi que un freno de
    // 45 ms estaria vencido SIEMPRE y no se probaria nada. Se usa un freno largo y se cuenta contra el TIEMPO
    // transcurrido, no contra los frames: asi el test vale igual a 12 fps que a 144.
    const F = 40, FRENO = 400;
    mc.shadowMoveMs = FRENO;
    out.conFreno = await correr(F, n => { falso.renderX = 10 + n * 0.05; });
    out.conFreno.techo = Math.ceil((out.conFreno.ms * F) / FRENO) + 1;   // rehorneados que como mucho caben
    // El comportamiento viejo, para tener con que comparar.
    mc.shadowMoveMs = 0;
    out.sinFreno = await correr(F, n => { falso.renderX = 30 + n * 0.05; });
    mc.shadowMoveMs = FRENO;
    // Quieto: no se rehornea nada. Antes hay que dejar que salga el horneado pendiente del tramo anterior (el freno
    // deja un `moved` marcado que se cobra en el siguiente frame); si no, se cuenta esa cola y no el reposo.
    await correr(10);
    out.quieto = await correr(F);

    // Y lo urgente NO espera al freno. Se comprueba con el freno RECIEN disparado (o sea, cerrado): si aun asi
    // rehornea en los dos frames siguientes, es que la geometria se salta el estrangulamiento.
    // No vale llamar a mcRender() a mano: el bucle del juego ya ha renderizado y se ha comido el flag.
    const urgente = (accion) => new Promise(res => {
      falso.renderX += 0.7;                                   // mueve -> dispara el freno, que queda cerrado
      requestAnimationFrame(() => {
        const antes = horneados;
        accion();
        requestAnimationFrame(() => requestAnimationFrame(() => res(horneados - antes)));
      });
    });
    out.alEditar = await urgente(() => mcShadowDirty());
    out.alCrecer = await urgente(() => { falso.count = 999; });
    // Control: sin tocar nada, ese mismo hueco de dos frames NO rehornea (si no, lo de arriba no prueba nada).
    out.alNadaControl = await urgente(() => {});

    mc.agents.delete('zz-movil');
    window.mcRenderShadow = orig;
    mcShadowDirty();
    return out;
  });

  if (r.errs && r.errs.length) r.errs.forEach(e => ok('preparacion: ' + e, false));

  console.log('\nUn agente andando no obliga a rehacer el mapa en cada frame');
  ok('sin freno se rehornea casi en cada frame (el fallo original)',
    r.sinFreno.horneados >= r.sinFreno.frames * 0.8,
    r.sinFreno.horneados + '/' + r.sinFreno.frames + ' frames, ' + r.sinFreno.ms + ' ms/frame');
  ok('con freno no se pasa del ritmo pedido',
    r.conFreno.horneados <= r.conFreno.techo,
    r.conFreno.horneados + '/' + r.conFreno.frames + ' frames (techo ' + r.conFreno.techo + '), ' + r.conFreno.ms + ' ms/frame');
  ok('y son bastantes menos que sin freno',
    r.conFreno.horneados < r.sinFreno.horneados * 0.5,
    r.conFreno.horneados + ' vs ' + r.sinFreno.horneados);
  ok('pero se sigue rehorneando: la sombra no se congela', r.conFreno.horneados >= 1);
  ok('con todo quieto no se rehornea nada', r.quieto.horneados === 0, r.quieto.horneados + ' rehorneados');

  console.log('\nLo que SI es urgente no se estrangula');
  ok('editar el mundo rehornea en el acto', r.alEditar >= 1, r.alEditar + ' rehorneados');
  ok('un cuerpo que cambia de malla rehornea en el acto', r.alCrecer >= 1, r.alCrecer + ' rehorneados');
  ok('control: sin tocar nada, ese hueco no rehornea', r.alNadaControl === 0, r.alNadaControl + ' rehorneados');

  ok('sin errores de pagina', errores.length === 0);
  if (errores.length) console.log(errores.join('\n'));

  await b.close();
  console.log(fallos ? "\n" + fallos + " fallo(s)" : "\n8 ok, 0 fallos");
  process.exit(fallos ? 1 : 0);
})();
