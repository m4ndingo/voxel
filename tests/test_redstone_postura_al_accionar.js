// @area: redstone
// @necesita: servidor, playwright
// BUG-RS8 · «si doy a la palanca que está pegada al pistón, se rota sola desactivada y aparece abajo,
// que no es donde la puse».
//
// Encender una pieza es CAMBIARLE EL MATERIAL a su pareja ('hab:palanca' → 'hab:palanca-on'), y la
// postura viaja en la clave ('hab:palanca@19'). Si al reescribirla se pierde parte de ese número, la
// pieza no queda «casi igual»: queda en OTRA postura. Y como una palanca es una plaquita fina que no
// llena su celda, cambiar de postura la MUEVE dentro de la celda — de ahí el «aparece abajo». El
// motor recortaba la postura a 4 bits, así que las ocho nuevas (@16..@23) caían sobre @0..@7.
//
// Se miran los DOS caminos por los que el motor reescribe una celda, que son dos funciones distintas:
//   A · conmutar()  — la pieza `manual` que suelta el jugador (palanca, botón, placa).
//   B · aplicar()   — la pieza que sigue a la SEÑAL sin que nadie la toque (aquí, el cable).
// Y en las 24 posturas, no en una muestra: el fallo vivía justo en el tramo que no se probaba.
//
// El motor y las piezas se inyectan desde los FICHEROS FUENTE (redstone/*.js), como el resto de la
// suite. No persiste nada: bloquea los POST y devuelve cada celda tocada a su id anterior.
const { chromium } = require('playwright');
const fs = require('fs');

const motor = fs.readFileSync(__dirname + '/../redstone/redstone.js', 'utf8');
const piezas = fs.readFileSync(__dirname + '/../redstone/redstone-piezas.js', 'utf8');

let fallos = 0;
const ok = (cond, txt, extra) => {
  if (!cond) fallos++;
  console.log((cond ? '  ok   ' : '  FALLA ') + txt + (extra ? '   · ' + extra : ''));
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
      if (o && String(o.method || 'GET').toUpperCase() === 'POST' && /\/api\//.test(url))
        return Promise.resolve(new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
      return orig(u, o);
    };
  });
  await p.goto('http://localhost:8500/map/test', { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid', null, { timeout: 180000 });
  await p.waitForTimeout(4000);
  await p.evaluate(motor);
  await p.evaluate(piezas);

  const r = await p.evaluate(async () => {
    const out = { errs: [], manual: {}, señal: {} };
    const R = game.redstone;
    const idEn = (x, y, z) => mc.grid[mcIdx(x, y, z)] || 0;
    const claveEn = (x, y, z) => mc.blockKey[idEn(x, y, z)] || null;

    // Un hueco de aire donde montar, con el mismo barrido que el resto de la suite.
    let caja = null;
    const AN = 8, AL = 5, PR = 8;
    const yTop = Math.min(40, mc.dim.y - AL - 2);
    for (let y = 4; y < yTop && !caja; y++)
      for (let x = 12; x < mc.dim.x - AN - 4 && !caja; x += 4)
        for (let z = 12; z < mc.dim.z - PR - 4 && !caja; z += 4) {
          let libre = true;
          for (let i = 0; i < AN && libre; i++) for (let j = 0; j < AL && libre; j++)
            for (let k = 0; k < PR && libre; k++) if (idEn(x + i, y + j, z + k)) libre = false;
          if (libre) caja = [x, y, z];
        }
    if (!caja) { out.errs.push('sin hueco de aire donde montar'); return out; }
    const [X, Y, Z] = caja;
    out.caja = caja;

    // Precarga: cada postura es un MATERIAL distinto en la paleta, y si no está dado de alta el motor
    // lo pide y reintenta — asíncrono. Aquí se quiere medir la postura, no la carga.
    const claves = [];
    for (let ori = 0; ori < 24; ori++)
      for (const k of ['hab:palanca', 'hab:palanca-on', 'hab:cable', 'hab:cable-on'])
        claves.push(ori ? k + '@' + ori : k);
    for (const k of claves) if (!mc.name2id[k]) {
      try { await game.addMaterial(k); } catch (e) { out.errs.push('no carga «' + k + '»: ' + e.message); }
    }
    out.faltan = claves.filter(k => !mc.name2id[k]);

    const tocadas = new Map();
    const pon = (x, y, z, clave) => {
      const c = x + ',' + y + ',' + z;
      if (!tocadas.has(c)) tocadas.set(c, [x, y, z, idEn(x, y, z)]);
      mcSetBlock(x, y, z, clave ? (mc.name2id[clave] || 0) : 0);
    };
    const ticks = n => { for (let i = 0; i < n; i++) R.tick(); };
    const revisa = (x, y, z) => R.revisarCaja(x - 2, y - 2, z - 2, x + 2, y + 2, z + 2);
    const conOri = (k, ori) => (ori ? k + '@' + ori : k);

    // ── A · la que suelta el jugador (conmutar) ───────────────────────────────────────────────
    for (let ori = 0; ori < 24; ori++) {
      const x = X + 2, y = Y + 2, z = Z + 2;
      pon(x, y, z, conOri('hab:palanca', ori));
      revisa(x, y, z); ticks(4);
      const puesta = claveEn(x, y, z);
      R.encender(x, y, z, true); ticks(4);
      const encendida = claveEn(x, y, z);
      R.encender(x, y, z, false); ticks(4);
      const apagada = claveEn(x, y, z);
      out.manual[ori] = { puesta, encendida, apagada };
      pon(x, y, z, null); ticks(2);
    }

    // ── B · la que sigue a la señal sola (aplicar) ────────────────────────────────────────────
    // Un cable pegado a una palanca encendida se enciende sin que nadie lo toque. Es el otro camino
    // por el que el motor reescribe una celda, y tenía el mismo recorte.
    for (let ori = 0; ori < 24; ori++) {
      const x = X + 5, y = Y + 2, z = Z + 5;
      pon(x, y, z, conOri('hab:cable', ori));
      pon(x - 1, y, z, 'hab:palanca');
      revisa(x, y, z); ticks(6);
      const apagado = claveEn(x, y, z);
      pon(x - 1, y, z, 'hab:palanca-on');
      revisa(x, y, z); ticks(8);
      const encendido = claveEn(x, y, z);
      pon(x - 1, y, z, 'hab:palanca');
      revisa(x, y, z); ticks(8);
      const vuelta = claveEn(x, y, z);
      out.señal[ori] = { apagado, encendido, vuelta };
      pon(x, y, z, null); pon(x - 1, y, z, null); ticks(2);
    }

    for (const [, v] of tocadas) mcSetBlock(v[0], v[1], v[2], v[3]);
    R.revisarCaja(X - 2, Y - 2, Z - 2, X + AN + 2, Y + AL + 2, Z + PR + 2);
    ticks(8);
    return out;
  });

  console.log('\ncaja de pruebas: ' + JSON.stringify(r.caja));
  if (r.errs && r.errs.length) console.log('errores de montaje: ' + r.errs.join(' · '));
  ok(!r.faltan || !r.faltan.length, 'las dos parejas existen en las 24 posturas', (r.faltan || []).join(', '));

  const sufijo = k => { const i = String(k || '').lastIndexOf('@'); return i > 0 ? k.slice(i) : ''; };
  const esperado = ori => (ori ? '@' + ori : '');

  console.log('\nA · accionar una palanca no le cambia la postura (conmutar)');
  const malA = [], noConmutaA = [];
  for (let ori = 0; ori < 24; ori++) {
    const g = r.manual[ori] || {};
    // Que de verdad haya conmutado: si no cambiara de material, conservar la postura no probaría nada.
    if (g.encendida !== 'hab:palanca-on' + esperado(ori)) noConmutaA.push('@' + ori + '→' + g.encendida);
    if (sufijo(g.puesta) !== esperado(ori) || sufijo(g.encendida) !== esperado(ori)
      || sufijo(g.apagada) !== esperado(ori)) {
      malA.push('@' + ori + ': ' + g.puesta + ' → ' + g.encendida + ' → ' + g.apagada);
    }
  }
  ok(noConmutaA.length === 0, 'la palanca conmuta de material en las 24 (si no, el test no probaría nada)',
    noConmutaA.join(' · '));
  ok(malA.length === 0, 'y vuelve a su postura al apagarla, en las 24', malA.join(' · '));
  // El fallo del ticket, dicho con su número: @16..@23 caían sobre @0..@7 al recortar a 4 bits.
  const nuevasA = [];
  for (let ori = 16; ori < 24; ori++) if (sufijo((r.manual[ori] || {}).encendida) !== '@' + ori) nuevasA.push('@' + ori);
  ok(nuevasA.length === 0, 'las 8 posturas nuevas (@16..@23) no se recortan a @0..@7', nuevasA.join(' '));

  console.log('\nB · seguir a la señal tampoco le cambia la postura (aplicar)');
  const malB = [], noConmutaB = [];
  for (let ori = 0; ori < 24; ori++) {
    const g = r.señal[ori] || {};
    if (g.encendido !== 'hab:cable-on' + esperado(ori)) noConmutaB.push('@' + ori + '→' + g.encendido);
    if (sufijo(g.apagado) !== esperado(ori) || sufijo(g.encendido) !== esperado(ori)
      || sufijo(g.vuelta) !== esperado(ori)) {
      malB.push('@' + ori + ': ' + g.apagado + ' → ' + g.encendido + ' → ' + g.vuelta);
    }
  }
  ok(noConmutaB.length === 0, 'el cable se enciende con la palanca en las 24 (si no, el test no probaría nada)',
    noConmutaB.join(' · '));
  ok(malB.length === 0, 'y conserva su postura al encenderse y al apagarse', malB.join(' · '));

  ok(errores.length === 0, 'sin errores de página', errores.join(' · '));
  console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nTODO OK');
  await b.close();
  process.exit(fallos ? 1 : 0);
})();