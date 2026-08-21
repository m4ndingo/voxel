// @area: render
// @necesita: servidor, playwright
// BUG-SHADOW4 — `mcRenderShadow` rehorneaba el mapa de sombra ENTERO cada vez que se mallaba un chunk, y como
// `mcMeshChunk` acaba llamando a `mcShadowDirty()`, andar por un mapa grande era una reconstruccion del mundo
// detras de otra: 401 draws / 159 M vertices por horneo en el volcado del dueno (el 81 % del frame).
//
// Ahora quien ensucia dice QUE FRANJA cambio y solo se rehornea ese recorte, con SCISSOR. La promesa es fuerte:
// «no altera ni un pixel». Este test es el guardian de esa promesa, y por eso no mide fps ni draws — compara los
// TEXELES: mismo mundo, mismo instante, horneo parcial contra horneo entero, byte a byte.
//
// Se baja `game.shadowSize` a 256 (256*256*4 = 256 KB) para poder traerse el mapa entero a node; a 2048 serian
// 16 MB por lectura. El tamano no cambia nada de lo que se prueba: la aritmetica del recorte es proporcional.
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
  p.on('pageerror', e => console.log('EXC ' + e.message));
  await p.route('**/api/mundo', r => r.request().method() === 'POST' ? r.fulfill({ status: 200, body: '{"ok":true}' }) : r.continue());
  await p.route('**/api/mundo/**', r => r.request().method() === 'POST' ? r.fulfill({ status: 200, body: '{"ok":true}' }) : r.continue());

  await p.goto('http://localhost:8500/map/test?noauto=1', { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.active && mc.grid && mc.shadow', null, { timeout: 180000 });
  await p.evaluate(() => { game.shadowSize = 256; });
  await p.waitForTimeout(4000);

  // Lee el mapa de sombra entero y devuelve un hash + un resumen, para no mover 256 KB por cada comparacion.
  const leeMapa = () => p.evaluate(() => {
    const gl = mc.gl, S = mc.shadow, n = S.size;
    const px = new Uint8Array(n * n * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, S.fbo);
    gl.readPixels(0, 0, n, n, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    let h = 5381, nz = 0;
    for (let i = 0; i < px.length; i++) { h = ((h * 33) ^ px[i]) | 0; if (px[i]) nz++; }
    return { h, nz, n };
  });

  // Fuerza un horneo y espera a que ocurra de verdad (mcRenderShadow va dentro del bucle de render).
  const hornea = async (parcial) => {
    await p.evaluate(v => { game.shadowParcial = v; mcShadowDirty(); }, parcial);
    await p.waitForTimeout(1200);
  };

  // --- 1. base: el mundo quieto, horneado entero -------------------------------------------------
  await hornea(false);
  const base = await leeMapa();
  ok('el mapa de sombra tiene contenido', base.nz > 0, base.nz + ' bytes no nulos de ' + (base.n * base.n * 4));

  // --- 2. una edicion localizada, rehorneada A TROZOS --------------------------------------------
  // Se levanta una torre en un punto concreto: cambia la sombra de esa franja y de ninguna otra.
  const pon = () => p.evaluate(() => {
    const d = mc.dim, x = (d.x >> 1) + 5, z = (d.z >> 1) + 5;
    let y = 0; for (let k = d.y - 1; k >= 0; k--) if (mc.grid[x + k * d.x + z * d.x * d.y]) { y = k + 1; break; }
    for (let k = 0; k < 8; k++) mcSetBlock(x, y + k, z, 1);
    return { x, y, z };
  });
  const torre = await pon();
  await hornea(true);
  const info = await p.evaluate(() => game.shadowInfo());
  const parcialA = await leeMapa();
  ok('el horneo ha sido parcial de verdad', info.ultimoParcial === true,
     'horneos ' + info.horneos + ', parciales ' + info.parciales);
  ok('la torre ha cambiado el mapa', parcialA.h !== base.h, 'torre en ' + torre.x + ',' + torre.y + ',' + torre.z);

  // --- 3. el mismo mundo, rehorneado ENTERO: tiene que salir identico ----------------------------
  await hornea(false);
  const enteroA = await p.evaluate(() => game.shadowInfo());
  const completo = await leeMapa();
  ok('el horneo de control ha sido entero', enteroA.ultimoParcial === false);
  ok('PARCIAL == ENTERO, texel a texel', parcialA.h === completo.h,
     'parcial ' + parcialA.h + ' vs entero ' + completo.h);

  // --- 4. y al reves: quitar la torre tambien tiene que cuadrar ----------------------------------
  await p.evaluate(t => { for (let k = 0; k < 8; k++) mcSetBlock(t.x, t.y + k, t.z, 0); }, torre);
  await hornea(true);
  const parcialB = await leeMapa();
  await hornea(false);
  const completoB = await leeMapa();
  ok('quitar la torre: PARCIAL == ENTERO', parcialB.h === completoB.h,
     'parcial ' + parcialB.h + ' vs entero ' + completoB.h);
  ok('al quitarla se vuelve al mapa de partida', parcialB.h === base.h,
     'ahora ' + parcialB.h + ' vs base ' + base.h);

  // --- 5. el mando existe, se recuerda y apaga de verdad -----------------------------------------
  const mando = await p.evaluate(() => {
    game.shadowParcial = false;
    const guardado = localStorage.getItem('vf_mcShadowParcial');
    game.shadowParcial = true;
    return { guardado, leido: game.shadowParcial, info: typeof game.shadowInfo };
  });
  ok('game.shadowParcial se persiste en localStorage', mando.guardado === '0', 'valor ' + mando.guardado);
  ok('game.shadowParcial se lee', mando.leido === true);
  ok('game.shadowInfo() existe', mando.info === 'function');

  console.log(fallos ? '\nFALLAN ' + fallos : '\nTODO OK');
  await b.close();
  process.exit(fallos ? 1 : 0);
})();
