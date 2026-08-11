// @area: redstone
// @necesita: servidor, playwright
// BUG-RS25 · «la placa de presión no se desactiva cuando el usuario ya se ha bajado de ella».
//
// El estado de una pieza con pareja ES la clave que hay en la rejilla, y eso es lo que hace que una
// palanca sobreviva a recargar el mundo sin persistir nada. Pero a una placa no la suelta su clave:
// la suelta un `setTimeout` (`apagones`), que es memoria de la sesión y NO se guarda con el mundo.
// Un mundo guardado con la placa pisada vuelve del disco con la celda en `-on`, sin temporizador que
// la suelte y sin nadie que se vaya a bajar de ella: pegada para siempre, alimentando su circuito
// con nadie encima. Así estaba la placa de /map/default cuando se abrió este ticket.
//
// El arreglo va en `repasarMundo()` (redstone.js), que ya hacía exactamente esto con el observador
// guardado encendido: al arrancar, toda entrada de pulso (`manual` + `pulso`) que esté en `-on` se
// suelta, porque con nadie encima está apagada por definición.
//
// A · un mundo que llega con la placa pisada la suelta al repasar, y su cable se apaga con ella
// B · ...pero si hay ALGUIEN encima sigue pisada: el latido gana (esto es no reabrir BUG-RS22)
// C · y el ciclo normal —te metes, te bajas, se suelta sola— sigue igual
//
// No persiste nada: bloquea los POST y devuelve cada celda tocada a su id anterior.
//
// node tests/test_placa_pegada.js [url]   ·   por defecto http://localhost:8500/map/test

const { chromium } = require('playwright');
const URL = process.argv[2] || 'http://localhost:8500/map/test';
let fallos = 0;
function ok(cond, txt, extra) {
  console.log((cond ? '  ok  ' : '  FALLA  ') + txt + (extra !== undefined ? '  [' + extra + ']' : ''));
  if (!cond) fallos++;
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
      if (o && String(o.method || 'GET').toUpperCase() !== 'GET' && /\/api\/(mundo|habitantes)/.test(url))
        return Promise.resolve(new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
      return orig(u, o);
    };
  });
  await p.goto(URL, { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid', null, { timeout: 180000 });
  await p.waitForFunction('window.game && game.bloques && game.bloques.define', null, { timeout: 120000 });
  await p.waitForFunction('window.game && game.redstone && game.redstone.repasarMundo', null, { timeout: 120000 });
  await p.waitForTimeout(4000);

  const r = await p.evaluate(async () => {
    const out = { errs: [] };
    const idEn = (x, y, z) => mc.grid[mcIdx(x, y, z)] || 0;
    const claveEn = (x, y, z) => mc.blockKey[idEn(x, y, z)] || '';
    const frame = () => new Promise(r => requestAnimationFrame(r));
    const vigilar = async (ms) => { const t0 = performance.now(); while (performance.now() - t0 < ms) await frame(); };
    const tocadas = new Map();
    const pon = (x, y, z, id) => {
      const c = x + ',' + y + ',' + z;
      if (!tocadas.has(c)) tocadas.set(c, [x, y, z, idEn(x, y, z)]);
      mcSetBlock(x, y, z, id | 0);
    };

    // hueco de aire con el suelo puesto por el test, igual que test_placa_observador.js
    const AN = 8, AL = 5, PR = 6;
    let caja = null;
    const y = Math.min(40, mc.dim.y - AL - 2);
    for (let x = 12; x < mc.dim.x - AN - 4 && !caja; x += 4)
      for (let z = 12; z < mc.dim.z - PR - 4 && !caja; z += 4) {
        let libre = true;
        for (let i = 0; i < AN && libre; i++) for (let j = 0; j < AL && libre; j++)
          for (let k = 0; k < PR && libre; k++) if (idEn(x + i, y + j, z + k)) libre = false;
        for (let i = 0; i < AN && libre; i++) for (let k = 0; k < PR && libre; k++)
          if (idEn(x + i, y - 1, z + k)) libre = false;
        if (libre) caja = [x, y, z];
      }
    if (!caja) { out.errs.push('sin hueco de aire donde montar el escenario'); return out; }
    const [X, Y, Z] = caja;
    out.caja = caja;

    const idSuelo = mc.name2id['asset:assets/hierba.vox.json'] || mc.name2id['dirt'] || 1;
    for (let i = 0; i < AN; i++) for (let k = 0; k < PR; k++) pon(X + i, Y - 1, Z + k, idSuelo);
    for (const k of ['hab:placa', 'hab:placa-on', 'hab:cable', 'hab:cable-on']) {
      if (!mc.name2id[k]) { try { await game.addMaterial(k); } catch (e) { out.errs.push('no carga ' + k); } }
    }
    const idPlaca = mc.name2id['hab:placa'] || 0, idPlacaOn = mc.name2id['hab:placa-on'] || 0;
    const idCable = mc.name2id['hab:cable'] || 0;
    if (!idPlaca || !idPlacaOn || !idCable) { out.errs.push('faltan materiales en la paleta'); return out; }

    // placa + un cable de testigo pegado: lo que el dueño ve no es la placa, es lo que alimenta
    const XP = X + 4, ZP = Z + 3, XC = XP + 1;
    const LEJOS = [X + 1.5, Y, Z + 1.5];
    mc.pos = LEJOS.slice(); mc.vel = [0, 0, 0];
    pon(XP, Y, ZP, idPlaca);
    pon(XC, Y, ZP, idCable);
    await vigilar(1200);
    const ficha = game.redstone.lista().filter(m => m.clave === 'hab:placa')[0] || {};
    out.montaje = { placa: claveEn(XP, Y, ZP), cable: claveEn(XC, Y, ZP), manual: ficha.manual, pulso: ficha.pulso };

    // ── A · el mundo llega del disco con la placa PISADA y nadie encima ────────────────────────
    // Se escribe la celda en `-on` a pelo, que es exactamente lo que hace cargar un mundo guardado
    // así: la clave está puesta y no hay ningún temporizador vivo que la vaya a soltar.
    mcSetBlock(XP, Y, ZP, idPlacaOn);
    mcRemeshAround(XP - 1, ZP - 1, XP + 1, ZP + 1);
    await vigilar(300);
    out.antesDelRepaso = { placa: claveEn(XP, Y, ZP) };
    game.redstone.repasarMundo();
    await vigilar(900);
    out.trasRepaso = { placa: claveEn(XP, Y, ZP), cable: claveEn(XC, Y, ZP), pos: mc.pos.map(v => Math.round(v)) };

    // ── B · lo mismo pero CON alguien encima: el latido tiene que ganarle al repaso ────────────
    mc.pos = [XP + 0.5, Y, ZP + 0.5]; mc.vel = [0, 0, 0];
    await vigilar(800);
    const pisadaAntes = claveEn(XP, Y, ZP);
    game.redstone.repasarMundo();
    await vigilar(900);
    out.conAlguienEncima = { antes: pisadaAntes, tras: claveEn(XP, Y, ZP), cable: claveEn(XC, Y, ZP) };

    // ── C · el ciclo de siempre: te bajas y se suelta sola (sin repaso de por medio) ───────────
    mc.pos = LEJOS.slice(); mc.vel = [0, 0, 0];
    await vigilar(2500);                                   // 2× el pulso
    out.trasBajarse = { placa: claveEn(XP, Y, ZP), cable: claveEn(XC, Y, ZP) };

    for (const [, v] of tocadas) mcSetBlock(v[0], v[1], v[2], v[3]);
    mcRemeshAround(X - 1, Z - 1, X + AN + 1, Z + PR + 1);
    return out;
  });

  if (r.errs && r.errs.length) console.log('errores de montaje: ' + r.errs.join(' · '));
  if (!r.trasRepaso) { console.log('no hubo medida: ' + JSON.stringify(r)); await b.close(); process.exit(1); }
  console.log('\ncaja de pruebas: ' + JSON.stringify(r.caja));

  console.log('\nel escenario es de verdad (si no, lo de abajo no probaría nada)');
  ok(r.montaje.placa === 'hab:placa', 'la placa arranca apagada', r.montaje.placa);
  ok(r.montaje.cable === 'hab:cable', 'y su cable de testigo también', r.montaje.cable);
  ok(r.montaje.manual === true && r.montaje.pulso > 0,
    'la placa es una entrada MANUAL de PULSO (que es lo que puede quedarse pegado)',
    'manual=' + r.montaje.manual + ' pulso=' + r.montaje.pulso);

  console.log('\nA · el mundo vuelve del disco con la placa pisada y nadie encima (BUG-RS25)');
  console.log('   ' + JSON.stringify(r.antesDelRepaso) + ' → ' + JSON.stringify(r.trasRepaso));
  ok(r.antesDelRepaso.placa === 'hab:placa-on', 'el montaje sí deja la placa pisada', r.antesDelRepaso.placa);
  ok(r.trasRepaso.placa === 'hab:placa', 'el repaso de arranque la SUELTA', r.trasRepaso.placa);
  ok(r.trasRepaso.cable === 'hab:cable', 'y su cable se apaga con ella', r.trasRepaso.cable);

  console.log('\nB · con alguien encima el latido gana (no reabrir BUG-RS22)');
  console.log('   ' + JSON.stringify(r.conAlguienEncima));
  ok(r.conAlguienEncima.antes === 'hab:placa-on', 'meterse dentro la pisa', r.conAlguienEncima.antes);
  ok(r.conAlguienEncima.tras === 'hab:placa-on', 'y sigue pisada tras el repaso: hay alguien encima', r.conAlguienEncima.tras);
  ok(r.conAlguienEncima.cable === 'hab:cable-on', 'con su cable encendido', r.conAlguienEncima.cable);

  console.log('\nC · el ciclo de siempre sigue igual');
  console.log('   ' + JSON.stringify(r.trasBajarse));
  ok(r.trasBajarse.placa === 'hab:placa', 'al bajarse, la placa se suelta sola', r.trasBajarse.placa);
  ok(r.trasBajarse.cable === 'hab:cable', 'y el cable se apaga', r.trasBajarse.cable);

  ok(errores.length === 0, 'sin errores de página', errores.join(' · '));
  console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nTODO OK');
  await b.close();
  process.exit(fallos ? 1 : 0);
})();
