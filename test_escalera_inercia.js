// @area: fisica
// @necesita: servidor, playwright
// BUG-ESC1 · «si subo ladeado a la escalera sin darle a avanzar, por ella se mueve solo el jugador y
// tiende a caerse. Al montar en la escalera no debería de haber ninguna inercia».
//
// Esto NO se puede probar en el mundo de juguete de test_bloques_comportamiento.js: su mcUpdate de
// mentira no mueve en horizontal, y el fallo es exactamente de la rama horizontal del mcUpdate DE
// VERDAD (app.js). Colgado, el snippet deja mc.onGround en false y app.js reparte el mando por ese
// booleano: con suelo la velocidad se reescribe desde las teclas cada frame; sin suelo se va al
// air-strafe, que no la reescribe y no tiene rozamiento. Así que hace falta un navegador.
//
// Se monta la escalera EN MEMORIA sobre /map/test y con los POST bloqueados: no se guarda nada, no
// se toca el mundo del dueño ni se borra nada suyo.
//
//   node test_escalera_inercia.js [url]        por defecto http://localhost:8500/map/test

const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8500/map/test';
let ok = 0, fallos = 0;
function test(nombre, cond, extra) {
  if (cond) { console.log('  ok    ' + nombre + (extra ? '   (' + extra + ')' : '')); ok++; }
  else { console.log('  FALLO ' + nombre + (extra ? '\n        ' + extra : '')); fallos++; }
}

(async () => {
  const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  const p = await b.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push('EXCEPCION ' + e.message));
  p.addInitScript(() => {
    const orig = window.fetch;
    window.fetch = (u, o) => {
      const escribe = o && String(o.method).toUpperCase() !== 'GET';
      if (escribe && (String(u).includes('/api/mundo') || String(u).includes('/api/habitantes')))
        return Promise.resolve(new Response('{}', { status: 200 }));
      return orig(u, o);
    };
  });

  await p.goto(URL, { timeout: 60000 });
  await p.waitForFunction('typeof mc !== "undefined" && mc.prog && mc.grid && window.game && game.bloques', { timeout: 180000 });
  // Que el mundo se quede quieto antes de medir (los carteles de las notas siguen llegando, BUG-AG8).
  await p.waitForFunction(() => {
    const n = mc.structures.length;
    if (window.__ultimoN === n) window.__quietos = (window.__quietos || 0) + 1;
    else { window.__ultimoN = n; window.__quietos = 0; }
    return window.__quietos >= 6;
  }, null, { timeout: 120000, polling: 500 });

  // ── El banco de pruebas ───────────────────────────────────────────────────────────────────────
  // Una columna trepable en el aire, muy por encima del terreno, para que nada del mundo real se
  // meta por medio. Se escribe en mc.grid a pelo (no game.setVoxel) porque no queremos ni un
  // guardado programado ni re-mallar el mundo entero por una prueba.
  const preparado = await p.evaluate(() => {
    const CLAVE = mc.blockKey.find((k, i) => i > 0 && k);          // cualquier bloque sólido de la paleta
    if (!CLAVE) return { sinBloque: true };
    const ID = mc.blockKey.indexOf(CLAVE);
    // Sitio limpio: centro del mundo, a 10 bloques del techo.
    const CX = Math.floor(mc.dim.x / 2), CZ = Math.floor(mc.dim.z / 2), Y0 = mc.dim.y - 12;
    const idx = (x, y, z) => mcIdx(x, y, z);
    const tocados = [];
    const poner = (x, y, z, id) => { const i = idx(x, y, z); tocados.push([i, mc.grid[i]]); mc.grid[i] = id; };
    // Suelo bajo los pies + pared trepable justo delante (+Z), 10 de alto.
    poner(CX, Y0 - 1, CZ, ID);
    for (let y = Y0; y < Y0 + 10; y++) poner(CX, y, CZ + 1, ID);
    window.__tocados = tocados;
    mcMeshAll();                                                   // la colisión lee mc.grid, pero sin esto no se vería nada
    // El material pasa a ser trepable. Es en memoria y solo para esta pestaña.
    game.bloques.define(CLAVE, { trepable: true, subida: 4, bajada: 5 });
    const cfg = game.bloques.lista().find(f => f.clave === CLAVE);
    return { CLAVE, ID, CX, CZ, Y0, definido: !!cfg, comportamiento: cfg && cfg.comportamiento };
  });
  if (preparado.sinBloque) { console.log('  no hay ni un bloque en la paleta de ' + URL); await b.close(); process.exit(1); }
  console.log('\n--- ' + URL + ' ---');
  console.log('  escalera de pruebas: ' + preparado.CLAVE + ' en ' + preparado.CX + ',' + preparado.Y0 + ',' + (preparado.CZ + 1)
    + '  ·  ' + preparado.comportamiento);

  // Un escenario = colocar al jugador, darle velocidad lateral y correr N frames de la física real.
  // `mcUpdate` es el envuelto por el snippet: es justo el que se quiere probar.
  const correr = (opts) => p.evaluate((o) => {
    const P = window.__prep;
    mc.pos = [P.CX + 0.5, P.Y0, P.CZ + 0.5 + o.dz];
    mc.vel = [o.vx, 0, o.vz || 0];
    mc.yaw = Math.PI;                     // mirando a +Z: el frente es (-sin yaw, ·, -cos yaw)
    mc.pitch = 0;
    mc.onGround = true;
    mc.keys = {};
    for (const k of (o.teclas || [])) mc.keys[k] = true;
    const x0 = mc.pos[0], y0 = mc.pos[1], z0 = mc.pos[2];
    const dt = 1 / 60;
    let sueltaEn = -1;
    for (let i = 0; i < o.frames; i++) {
      if (o.soltarTeclasEn === i) mc.keys = {};
      if (o.espacioEn === i) { mc.keys[' '] = true; sueltaEn = i; }
      mcUpdate(dt);
    }
    return {
      x: mc.pos[0], y: mc.pos[1], z: mc.pos[2],
      dx: mc.pos[0] - x0, dy: mc.pos[1] - y0, dz: mc.pos[2] - z0,
      vx: mc.vel[0], vy: mc.vel[1], vz: mc.vel[2], onGround: mc.onGround, sueltaEn
    };
  }, opts);
  // Pegado a la escalera: el cuerpo tiene medio ancho 0,3 (MC_HW), así que el centro va a 0,5+0,2 de
  // la celda de la escalera. Se entra ya pegado, que es como se llega andando.
  //
  // El epsilon NO es adorno. mcTerrenoChoca hace floor(pz + HW): con 0,2 clavado el borde del cuerpo
  // cae en CZ+1,0 exacto, floor() da CZ+1 —la celda de la escalera— y el jugador «choca» con la
  // escalera en la que se apoya. mcUpdate se va entonces a su rama de rescate y no mueve nada, o sea
  // que TODO el test daría 0 (incluida la sección D, que es la que lo destapó). Misma nota que hay en
  // test_bloques_comportamiento.js con su Z_PEGADO = 11 - 0.3 - 1e-4.
  const PEGADO = 0.2 - 1e-3;
  await p.evaluate((P) => { window.__prep = P; }, { ...preparado, PEGADO });

  console.log('\n── A · el caso del dueño: llegar de lado y subir ──');
  // W (subir) + una velocidad lateral fuerte, como quien llega corriendo en diagonal.
  const A = await correr({ dz: PEGADO, vx: 6, teclas: ['w'], frames: 60 });
  test('sube por la escalera', A.dy > 3, 'subió ' + A.dy.toFixed(3) + ' en 1 s (la escalera es de 4 u/s)');
  test('y NO se desplaza de lado mientras sube', Math.abs(A.dx) < 0.05,
    'se fue ' + A.dx.toFixed(3) + ' de lado; la velocidad lateral con la que llegó sobrevivió al enganche');
  test('la velocidad lateral se anula en el enganche', Math.abs(A.vx) < 1e-6, 'vx = ' + A.vx);

  console.log('\n── B · colgado y sin tocar NADA: no se mueve ni un float ──');
  // Se agarra con W durante 20 frames y se sueltan las teclas: en Minecraft (y aquí) uno se queda
  // colgado donde estaba. Colgado y quieto no puede haber ni un milímetro de deriva.
  const B = await correr({ dz: PEGADO, vx: 6, teclas: ['w'], frames: 90, soltarTeclasEn: 20 });
  const derivaB = Math.hypot(B.x - (preparado.CX + 0.5), 0);
  test('colgado sin teclas no deriva de lado', derivaB < 0.05, 'derivó ' + derivaB.toFixed(3));
  test('...ni sigue subiendo o cayendo', Math.abs(B.vy) < 1e-6, 'vy = ' + B.vy);

  console.log('\n── C · lo que NO se puede haber roto ──');
  // (1) Saltar de la escalera con impulso lateral: es un movimiento que había que conservar, y el
  //     arreglo lo respeta porque con espacio pulsado no hay agarre ninguno.
  const C1 = await correr({ dz: PEGADO, vx: 0, teclas: ['w'], frames: 40, espacioEn: 20 });
  test('con espacio se suelta de la escalera y salta', C1.vy !== 0 || C1.dy > 0.5,
    'dy=' + C1.dy.toFixed(3) + ' vy=' + C1.vy.toFixed(3));
  const C2 = await correr({ dz: PEGADO, vx: 0, teclas: ['w', 'a'], frames: 40, espacioEn: 20 });
  test('...y saltar con A pulsada SÍ da impulso lateral (no se ha matado el movimiento)',
    Math.abs(C2.dx) > 0.2, 'lateral al saltar: ' + C2.dx.toFixed(3));
  // (2) Lejos de cualquier escalera, la física del aire sigue siendo la de siempre: la inercia del
  //     salto se conserva. Si esto fallara, el arreglo habría tocado el juego entero y no la escalera.
  const C3 = await p.evaluate(() => {
    mc.pos = [Math.floor(mc.dim.x / 2) + 0.5, mc.dim.y - 4, Math.floor(mc.dim.z / 2) - 6];
    mc.vel = [6, 0, 0]; mc.onGround = false; mc.keys = {}; mc.yaw = Math.PI;
    const x0 = mc.pos[0];
    for (let i = 0; i < 20; i++) mcUpdate(1 / 60);
    return { dx: mc.pos[0] - x0, vx: mc.vel[0] };
  });
  test('en el aire y lejos de la escalera la inercia SIGUE conservándose', C3.dx > 1 && Math.abs(C3.vx - 6) < 1e-6,
    'avanzó ' + C3.dx.toFixed(3) + ' con vx=' + C3.vx);

  console.log('\n── D · anti-falso-verde: el banco SÍ sabe registrar deriva lateral ──');
  // El riesgo de A y B es que den verde por una razón boba: que el jugador esté encajado y no se
  // mueva NADA, con lo que «no deriva de lado» sería verdad sin que el arreglo pinte nada. (Pasó de
  // verdad: con PEGADO = 0,2 clavado el cuerpo tocaba la celda de la escalera y todo salía 0,000.)
  //
  // No se puede desarmar el arreglo desde fuera para ver volver el fallo: forzar onGround=false por
  // encima del envoltorio no vale, porque la línea del arreglo lo vuelve a poner en true justo antes
  // de orig(dt). Así que la garantía se da por el otro lado: MISMA postura colgada, misma medición,
  // pero pidiendo movimiento lateral con A. Si el 0,000 de A/B fuese un jugador encajado, aquí
  // saldría 0,000 también.
  const D = await correr({ dz: PEGADO, vx: 0, teclas: ['w', 'a'], frames: 60 });
  test('colgado y con A pulsada SÍ se mueve de lado (o sea que A/B miden algo)', Math.abs(D.dx) > 0.5,
    'se fue ' + D.dx.toFixed(3) + ' — si esto sale ~0, el jugador está encajado y A/B dan verde por eso');
  // Y de paso se ve el síntoma del dueño tal cual lo contó: en cuanto te vas de lado, la escalera se
  // acaba (mide un bloque) y te caes. Antes del arreglo esto pasaba SIN tocar una tecla.
  test('...e irse de lado te tira de la escalera (el síntoma del ticket)', D.dy < 0,
    'acabó ' + D.dy.toFixed(3) + ' de altura tras salirse ' + D.dx.toFixed(3));

  test('no hay errores de página', errores.length === 0, errores.join(' | '));

  // Se deshace el banco de pruebas. No hacía falta (nada se guarda: los POST van bloqueados), pero
  // así la pestaña queda como estaba por si alguien la reutiliza.
  await p.evaluate(() => {
    (window.__tocados || []).forEach(([i, v]) => { mc.grid[i] = v; });
    if (typeof mcMeshAll === 'function') mcMeshAll();
  });

  console.log('\n' + ok + ' ok, ' + fallos + ' fallos');
  await b.close();
  process.exit(fallos ? 1 : 0);
})();