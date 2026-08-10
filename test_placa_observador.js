// @area: redstone
// @necesita: servidor, playwright
// BUG-RS22 · «si coloco una placa de presión y un observador mirándola, el observador se enciende al
// subir (eso está ok) pero cada ~1 s genera 1 pulso redstone; no debería generar pulsos si la placa
// no cambia de estado».
//
// El observador no tiene la culpa: la `hab:placa` se suelta sola pasado su `pulso` y el despachador
// de `alPisar` la vuelve a encender al instante (el flanco es celda+CLAVE, y la clave la acaba de
// cambiar ella misma). O sea que la placa SÍ estaba cambiando de estado en bucle y el observador
// hacía su trabajo. Aquí se mide la placa, no el observador.
//
// Montaje: suelo macizo, `hab:placa` en el centro, el observador MIRÁNDOLA (frente +X, o sea puesto
// una celda en −X) y un cable de testigo detrás de él. El jugador se planta dentro de la placa y no
// se mueve durante ~5 s.
//
//   A · al pisar, la placa se enciende y el observador suelta UN pulso        (esto ya iba bien)
//   B · quieto encima, la placa NO se suelta                                  ← el fallo
//   C · quieto encima, el observador NO vuelve a pulsar                       ← el síntoma
//   D · al bajarse, la placa se suelta y el observador suelta su segundo pulso (el flanco de bajada)
//
// No persiste nada: bloquea los POST y devuelve cada celda tocada a su id anterior.
//
//   node test_placa_observador.js [url]        por defecto http://localhost:8500/map/test
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
      if (o && String(o.method || 'GET').toUpperCase() !== 'GET' && /\/api\/(mundo|habitantes)/.test(url))
        return Promise.resolve(new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
      return orig(u, o);
    };
  });
  await p.goto(URL, { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid', null, { timeout: 180000 });
  await p.waitForFunction('window.game && game.bloques && game.bloques.define', null, { timeout: 120000 });
  // El redstone se carga solo desde mundo-autoarranque, pero no se espera: hay que darle su tiempo.
  await p.waitForFunction('window.game && game.redstone && game.redstone.info', null, { timeout: 120000 });
  await p.waitForTimeout(4000);

  const r = await p.evaluate(async () => {
    const out = { errs: [] };
    const idEn = (x, y, z) => mc.grid[mcIdx(x, y, z)] || 0;
    const claveEn = (x, y, z) => mc.blockKey[idEn(x, y, z)] || '';
    const tocadas = new Map();
    const pon = (x, y, z, id) => {
      const c = x + ',' + y + ',' + z;
      if (!tocadas.has(c)) tocadas.set(c, [x, y, z, idEn(x, y, z)]);
      mcSetBlock(x, y, z, id | 0);
    };
    const frame = () => new Promise(res => requestAnimationFrame(res));
    const esperar = ms => new Promise(res => setTimeout(res, ms));

    // ── el escenario: una plataforma de aire con su suelo ─────────────────────────────────────
    const AN = 8, AL = 5, PR = 6;
    let caja = null;
    const yTope = Math.min(40, mc.dim.y - AL - 2);
    for (let y = 6; y < yTope && !caja; y++)
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

    const OBS = 'asset:assets/observador.vox.json', OBS_ON = 'asset:assets/observador-on.vox.json';
    for (const k of ['hab:placa', 'hab:placa-on', 'hab:cable', OBS, OBS_ON]) {
      if (!mc.name2id[k]) { try { await game.addMaterial(k); } catch (e) { out.errs.push('no carga ' + k + ': ' + e.message); } }
    }
    const idPlaca = mc.name2id['hab:placa'] || 0, idCable = mc.name2id['hab:cable'] || 0, idObs = mc.name2id[OBS] || 0;
    if (!idPlaca || !idCable || !idObs) { out.errs.push('faltan materiales en la paleta'); return out; }

    // La placa en el centro; el observador SIN sufijo mira a +X, así que va una celda a su −X.
    const XP = X + 4, ZP = Z + 3;
    const XO = XP - 1;                   // observador: su frente (+X) da a la placa
    const XC = XP - 2;                   // cable de testigo, pegado a su ESPALDA (−X)
    pon(XP, Y, ZP, idPlaca);
    pon(XO, Y, ZP, idObs);
    pon(XC, Y, ZP, idCable);
    await esperar(900);                  // que se hornee la geometría fina y repase el circuito

    out.claveInicialPlaca = claveEn(XP, Y, ZP);
    out.claveInicialObs = claveEn(XO, Y, ZP);
    const infO = game.redstone.info(XO, Y, ZP);
    out.obsEsCircuito = !!(infO && infO.esCircuito);

    // ⚠️ Muestrear la clave una vez por frame NO sirve: el ciclo suelta-y-vuelve-a-encender de la
    // placa entra y sale DENTRO del mismo frame (el timer del `pulso` apaga, y el mcUpdate que viene
    // detrás la re-enciende antes de que el rAF del test llegue a mirar), así que se lee siempre
    // `-on` y el fallo parece no existir. Se cuentan las ESCRITURAS: envolver mcSetBlock ve todos los
    // cambios, incluidos los que no llegan a pintarse.
    const escrituras = [];
    const origSet = window.mcSetBlock;
    window.mcSetBlock = function (x, y, z, id) {
      if (y === Y && z === ZP && (x === XP || x === XO) && idEn(x, y, z) !== (id | 0))
        escrituras.push({ x: x, cl: mc.blockKey[id | 0] || '', t: Math.round(performance.now()) });
      return origSet.apply(this, arguments);
    };
    const cuenta = (desde, x, on) => escrituras.filter((e, i) =>
      i >= desde && e.x === x && (e.cl.indexOf('-on') >= 0) === on).length;

    async function vigilar(ms) {
      const t0 = performance.now();
      while (performance.now() - t0 < ms) await frame();
    }

    // ── A · el jugador se planta DENTRO de la placa (es atravesable: se ocupa, no se pisa) ─────
    mc.pos = [XP + 0.5, Y, ZP + 0.5]; mc.vel = [0, 0, 0]; mc.onGround = true;
    await vigilar(1000);
    out.trasPisar = { placa: claveEn(XP, Y, ZP), obsPulsos: cuenta(0, XO, true), placaOn: cuenta(0, XP, true) };

    // ── B/C · quieto encima 4 s más: no debería pasar NADA ──────────────────────────────────────
    const marcaA = escrituras.length;
    await vigilar(4000);
    out.quieto = {
      placa: claveEn(XP, Y, ZP),
      obsPulsos: cuenta(marcaA, XO, true),        // ← el fallo del ticket: hoy sale ~4
      placaSueltas: cuenta(marcaA, XP, false),    // ← y ésta es la causa: se suelta sola
      placaEncendidas: cuenta(marcaA, XP, true),  //    y el despachador la vuelve a encender
      posY: Math.round(mc.pos[1] * 100) / 100,
    };

    // ── D · se baja: la placa se suelta y el observador da su pulso de bajada ───────────────────
    const marcaB = escrituras.length;
    mc.pos = [X + 1.5, Y, Z + 1.5]; mc.vel = [0, 0, 0];
    await vigilar(2500);
    out.trasBajar = { placa: claveEn(XP, Y, ZP), obsPulsos: cuenta(marcaB, XO, true), cable: claveEn(XC, Y, ZP) };
    out.totales = { obsPulsos: cuenta(0, XO, true), placaOn: cuenta(0, XP, true), placaOff: cuenta(0, XP, false) };

    window.mcSetBlock = origSet;
    for (const [, v] of tocadas) mcSetBlock(v[0], v[1], v[2], v[3]);
    mcRemeshAround(X - 1, Z - 1, X + AN + 1, Z + PR + 1);
    return out;
  });

  if (r.errs && r.errs.length) console.log('errores de montaje: ' + r.errs.join(' · '));
  if (!r.quieto) { console.log('no hubo medida: ' + JSON.stringify(r)); await b.close(); process.exit(1); }
  console.log('\ncaja de pruebas: ' + JSON.stringify(r.caja));

  console.log('\nel escenario es de verdad (si no, lo de abajo no probaría nada)');
  ok(r.claveInicialPlaca === 'hab:placa', 'la placa está puesta y apagada', r.claveInicialPlaca);
  ok(r.obsEsCircuito === true, 'el observador ES circuito para el motor');
  ok(r.claveInicialObs === 'asset:assets/observador.vox.json', 'y está puesto sin girar: su frente (+X) da a la placa', r.claveInicialObs);

  console.log('\nA · al pisarla (esto ya iba bien)');
  console.log('    ' + JSON.stringify(r.trasPisar));
  ok(r.trasPisar.placa === 'hab:placa-on', 'la placa se enciende al meterse dentro', r.trasPisar.placa);
  ok(r.trasPisar.obsPulsos === 1, 'y el observador suelta UN pulso', 'pulsos=' + r.trasPisar.obsPulsos);

  console.log('\nB/C · quieto encima 4 s (BUG-RS22)');
  console.log('    ' + JSON.stringify(r.quieto));
  ok(r.quieto.placa === 'hab:placa-on', 'la placa sigue encendida: nadie se ha bajado', r.quieto.placa);
  ok(r.quieto.placaSueltas === 0, 'la placa NO se suelta sola con alguien encima', 'sueltas=' + r.quieto.placaSueltas);
  ok(r.quieto.obsPulsos === 0, 'y el observador NO pulsa sin que nada cambie', 'pulsos=' + r.quieto.obsPulsos);

  console.log('\nD · al bajarse');
  console.log('    ' + JSON.stringify(r.trasBajar));
  ok(r.trasBajar.placa === 'hab:placa', 'la placa se suelta al dejarla', r.trasBajar.placa);
  ok(r.trasBajar.obsPulsos === 1, 'y el observador da su pulso de bajada', 'pulsos=' + r.trasBajar.obsPulsos);
  ok(r.totales.obsPulsos === 2, 'en toda la prueba: 2 pulsos, uno por flanco', JSON.stringify(r.totales));

  ok(errores.length === 0, 'sin errores de página', errores.join(' · '));
  console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nTODO OK');
  await b.close();
  process.exit(fallos ? 1 : 0);
})();
