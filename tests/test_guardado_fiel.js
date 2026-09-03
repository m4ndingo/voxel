// @area: mundo
// @necesita: servidor, playwright
// test_guardado_fiel.js — REQ-SAVE1: un guardado que el servidor RECHAZA no cuenta como guardado.
//
//   node tests/test_guardado_fiel.js
//
// §1 no es decoración: demuestra el fallo en el motor pelado (`mcSaveWorldFull`, web/app.js:22364
// hace `await fetch(...)` sin mirar `r.ok`). Si algún día §1 empieza a fallar es que el arreglo se
// ha GRADUADO a `app.js` — entonces hay que borrar §1, no «arreglarlo».
//
// ⚠️ `mc` es un `let` de primer nivel de `app.js`: vive en el ámbito léxico global y NO es
// `window.mc`. Por eso aquí se mira con el identificador pelado, que es lo que ve un snippet.
// Sonda de `guardado-fiel`: comprueba que un guardado rechazado ya no cuenta como guardado.
// Se prueba en /map/test, con ?noauto=1 para que no corra el autoarranque del dueño.
const { chromium } = require('playwright');

const URL = process.env.VOXEL_URL || 'http://localhost:8500';
let fallos = 0;
const ok = (b, q) => { console.log((b ? '  ok   · ' : '  FALLO· ') + q); if (!b) fallos++; };

(async () => {
  const nav = await chromium.launch({
    args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
  });
  const pag = await nav.newPage();
  const avisos = [];
  pag.on('console', m => { if (m.type() === 'warning' || m.type() === 'log') avisos.push(m.text()); });

  await pag.goto(URL + '/map/test?noauto=1', { waitUntil: 'load', timeout: 90000 });
  // ⚠️ `mc` es un `let` de primer nivel de `app.js`: vive en el ámbito léxico global y NO es
  // `window.mc`. Se mira con el identificador pelado, que es lo que ve un snippet.
  await pag.waitForFunction('typeof mcSaveWorldFull === "function" && typeof mc !== "undefined" && !!mc.grid',
                            null, { timeout: 90000 });

  // El pendiente de verdad se guarda y se devuelve al final: esto corre sobre el /map/test vivo.
  await pag.evaluate(() => { window.__pendReal = mc.pend; window.__v2Real = mc.v2; });

  console.log('\n§1 el motor tal cual: un 403 se da por bueno (ES EL BUG)');
  const antes = await pag.evaluate(async () => {
    const origFetch = window.fetch;
    window.fetch = async () => new Response('{"error":"no"}', { status: 403 });
    mc.pend = { full: true, header: true, vox: new Set(['1,2,3']) };
    mc.v2 = false;
    const r = await mcSaveWorldFull();
    const out = { devuelve: r, v2: mc.v2, pendientes: mc.pend.vox.size };
    window.fetch = origFetch;
    return out;
  });
  console.log('     ' + JSON.stringify(antes));
  ok(antes.devuelve === true, 'sin el parche devuelve `true` ante un 403');
  ok(antes.pendientes === 0, 'sin el parche VACÍA el pendiente (se pierde lo que faltaba)');

  console.log('\n§2 con `guardado-fiel` puesto');
  const cargado = await pag.evaluate(() => game.snippet('guardado-fiel'));
  ok(await pag.evaluate(() => !!(window.mcSaveWorldFull && window.mcSaveWorldFull._fiel)),
     'el envoltorio está puesto');

  const con = await pag.evaluate(async () => {
    const origFetch = window.fetch;
    window.fetch = async () => new Response('{"error":"no"}', { status: 403 });
    mc.pend = { full: true, header: true, vox: new Set(['1,2,3']) };
    mc.v2 = false;
    const r = await mcSaveWorldFull();
    const out = { devuelve: r, v2: mc.v2, pendientes: mc.pend.vox.size,
                  estado: game.guardado.estado() };
    window.fetch = origFetch;
    return out;
  });
  console.log('     ' + JSON.stringify(con));
  ok(con.devuelve === false, 'devuelve `false` ante un 403');
  ok(con.v2 === false, 'NO marca `mc.v2`');
  ok(con.pendientes === 1, 'CONSERVA el pendiente para reintentarlo');
  ok(con.estado.rechazos === 1 && con.estado.ultimoCodigo === 403, 'lleva la cuenta del rechazo');
  ok(avisos.some(t => t.includes('[guardado-fiel]') && t.includes('NO se ha guardado')),
     'lo dice por consola');

  console.log('\n§3 un 200 sigue funcionando igual que antes');
  const bien = await pag.evaluate(async () => {
    const origFetch = window.fetch;
    window.fetch = async () => new Response('{"ok":true}', { status: 200 });
    mc.pend = { full: true, header: true, vox: new Set(['1,2,3']) };
    mc.v2 = false;
    const r = await mcSaveWorldFull();
    const out = { devuelve: r, v2: mc.v2, pendientes: mc.pend.vox.size };
    window.fetch = origFetch;
    return out;
  });
  console.log('     ' + JSON.stringify(bien));
  ok(bien.devuelve === true && bien.v2 === true && bien.pendientes === 0,
     'guarda, marca v2 y vacía el pendiente');

  console.log('\n§4 `off()` devuelve el motor byte a byte (ley de oro)');
  const vuelta = await pag.evaluate(() => {
    const dentro = window.mcSaveWorldFull._orig;
    game.guardado.off();
    return { esElOriginal: window.mcSaveWorldFull === dentro,
             sinMarca: !window.mcSaveWorldFull._fiel };
  });
  ok(vuelta.esElOriginal && vuelta.sinMarca, '`mcSaveWorldFull` es otra vez el del motor');

  console.log('\n§5 idempotente: cargarlo dos veces no apila capas');
  const dos = await pag.evaluate(async () => {
    await game.snippet('guardado-fiel');
    const uno = window.mcSaveWorldFull;
    await game.snippet('guardado-fiel');
    return { mismo: window.mcSaveWorldFull === uno,
             origEsDelMotor: !window.mcSaveWorldFull._orig._fiel };
  });
  ok(dos.mismo && dos.origEsDelMotor, 'la segunda carga no envuelve el envoltorio');

  // Se devuelve el pendiente de verdad: esto ha corrido sobre el /map/test vivo.
  await pag.evaluate(() => { mc.pend = window.__pendReal; mc.v2 = window.__v2Real; });

  await nav.close();
  console.log('\n' + (fallos ? fallos + ' FALLOS' : 'TODO OK'));
  process.exit(fallos ? 1 : 0);
})();
