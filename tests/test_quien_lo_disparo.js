// @area: general
// @necesita: servidor, playwright
//
// REQ-IMPACTO3 · la ficha dice QUIEN lo disparo.
//
// Lo cazo el dueño probandolo (2026-09-03): «cuando se llama a coger no se sabe si se cogio por un
// flechazo o al pasar por encima (siempre dice flechazo)». Tenia razon: `alImpactar:'coger'` reusa
// el MISMO `alCoger` que la recogida por proximidad —que es lo que se queria— pero la ficha no
// distinguia los dos disparadores, asi que el snippet solo podia adivinar.
//
// El vocabulario, que es lo que este guardian congela:
//   por: 'cuerpo'   te acercaste andando
//   por: 'pico'     lo rompiste con el pico
//   por: 'impacto'  algo choco (la flecha) · llega tambien info.fuente, golpe, de, punto
//   por: 'masa'     lo borro un barrido (la TNT, por avisoDeRotura)
//
// ⛔ Y lo mas importante que mira: que la ficha SIGA TRAYENDO lo de siempre. Esto es aditivo; el dia
// que alguien «limpie» estos campos, media docena de snippets del mundo dejan de saber que rompieron.
//
// ⛔ Planta y recoge en /map/test. Nunca en /map/default ni /map/agents.
const { chromium } = require('playwright');
const BASE = 'http://localhost:' + (process.argv[2] || process.env.VOXEL_PUERTO || 8500);

let ok = 0, fail = 0;
const T0 = Date.now();
const seg = () => ('    ' + ((Date.now() - T0) / 1000).toFixed(1)).slice(-6) + 's ';
const paso = (n) => console.log('\n' + seg() + n);
const t = (n, c, extra) => {
  if (c) { ok++; console.log(seg() + '  ok  ' + n + (extra ? '   (' + extra + ')' : '')); }
  else { fail++; console.log(seg() + '  FALLA  ' + n + (extra ? '   (' + extra + ')' : '')); }
};

(async () => {
  const nav = await chromium.launch({
    args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
  });
  const p = await nav.newPage();
  const errores = [];
  p.on('pageerror', (e) => errores.push(String(e)));

  paso('§0 · abriendo /map/test?noauto=1');
  await p.goto(BASE + '/map/test?noauto=1', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => typeof window.game !== 'undefined' && window.game.bloques,
    null, { timeout: 30000 });
  paso('§0 · lanzando mundo-autoarranque a mano');
  await p.evaluate(() => game.snippet('mundo-autoarranque'));
  await p.waitForTimeout(1500);

  // ── §1 · EL CASO DEL DUEÑO: la misma flor, cogida de las dos maneras ───────────────────────────
  paso('§1 · alCoger · la misma pieza, dos disparadores distintos');
  const r1 = await p.evaluate(async () => {
    const out = {}, vistas = [];
    const clave = 'asset:assets/flor-roja.vox.json';
    const px = Math.floor(mc.pos[0]) + 2, py = Math.floor(mc.pos[1]), pz = Math.floor(mc.pos[2]);
    game.bloques.define(clave, { nota: 'zz-test', alcance: 1.2, consume: true,
      alImpactar: 'coger', impactos: 1,
      alCoger: (c) => { vistas.push(c); } });

    // (a) por IMPACTO: es lo que hace la flecha al chocar
    await game.stamp('flor-roja', px, py, pz, 0);
    game.bloques.impacto(px + 0.5, py + 0.5, pz + 0.5, { fuente: 'flecha', dir: [1, 0, 0] });
    out.a = vistas[0] ? JSON.parse(JSON.stringify({
      por: vistas[0].por, fuente: vistas[0].info && vistas[0].info.fuente,
      golpe: vistas[0].golpe, de: vistas[0].de, punto: !!vistas[0].punto,
      clave: vistas[0].clave, tipo: vistas[0].tipo,
      x: vistas[0].x, y: vistas[0].y, z: vistas[0].z, cfg: !!vistas[0].cfg
    })) : null;

    // (b) por CUERPO: la recogida al pasar por encima, pegada al jugador
    await game.stamp('flor-roja', Math.floor(mc.pos[0]), Math.floor(mc.pos[1]), Math.floor(mc.pos[2]), 0);
    const t0 = Date.now();
    while (vistas.length < 2 && Date.now() - t0 < 3000) {
      await new Promise((r) => requestAnimationFrame(r));
    }
    out.b = vistas[1] ? JSON.parse(JSON.stringify({
      por: vistas[1].por, info: vistas[1].info, clave: vistas[1].clave, tipo: vistas[1].tipo
    })) : null;
    out.n = vistas.length;
    game.bloques.quitar(clave);
    return out;
  });
  t('§1 (a) el flechazo llega como por:"impacto"', r1.a && r1.a.por === 'impacto',
    r1.a && r1.a.por);
  t('§1 (a) …y trae quien fue: info.fuente', r1.a && r1.a.fuente === 'flecha', r1.a && r1.a.fuente);
  t('§1 (a) …y el golpe: 1 de 1', r1.a && r1.a.golpe === 1 && r1.a.de === 1);
  t('§1 (a) …y el punto exacto del choque', !!(r1.a && r1.a.punto));
  t('§1 (b) la recogida andando llega como por:"cuerpo"', r1.b && r1.b.por === 'cuerpo',
    r1.b && r1.b.por);
  t('§1 (b) …y sin info: ahi no choca nadie', !!r1.b && r1.b.info === null);
  t('§1 ES LO QUE PEDIA EL DUEÑO: los dos se distinguen',
    !!(r1.a && r1.b) && r1.a.por !== r1.b.por, (r1.a && r1.a.por) + ' vs ' + (r1.b && r1.b.por));

  paso('§2 · ⛔ ADITIVO: la ficha de siempre sigue entera');
  t('§2 clave', r1.a && r1.a.clave === 'asset:assets/flor-roja.vox.json', r1.a && r1.a.clave);
  t('§2 tipo', r1.a && r1.a.tipo === 'estructura', r1.a && r1.a.tipo);
  t('§2 x,y,z', !!(r1.a && Number.isFinite(r1.a.x) && Number.isFinite(r1.a.y) && Number.isFinite(r1.a.z)));
  t('§2 cfg', !!(r1.a && r1.a.cfg));

  // ── §3 · alRomper tenia el mismo agujero: pico vs impacto ──────────────────────────────────────
  paso('§3 · alRomper · el pico y el flechazo dejan de ser lo mismo');
  const r3 = await p.evaluate(async () => {
    const out = {}, vistas = [];
    const bx = Math.floor(mc.pos[0]), by = Math.floor(mc.pos[1]) - 1, bz = Math.floor(mc.pos[2]);
    const idx = mcIdx(bx, by, bz), idAntes = mc.grid[idx];
    const clave = mc.blockKey[idAntes] || '';
    out.clave = clave;
    if (!clave) { out.error = 'no hay bloque bajo los pies'; return out; }
    game.bloques.define(clave, { nota: 'zz-test', alImpactar: 'romper', persistente: false,
      alRomper: (c) => { vistas.push(c.por + '|' + ((c.info && c.info.fuente) || '-')); } });

    game.bloques.impacto(bx + 0.5, by + 0.5, bz + 0.5, { fuente: 'flecha' });
    if (typeof mcQuitaVolatil === 'function') mcQuitaVolatil(bx, by, bz);

    // El barrido en masa (la via de la TNT) pasa por avisoDeRotura y no dice 'impacto'
    const aviso = game.bloques.avisoDeRotura(bx, by, bz);
    if (aviso) aviso();
    // …y la flecha, cuando cae por ese mismo respaldo, SI lo dice
    const aviso2 = game.bloques.avisoDeRotura(bx, by, bz, 'impacto');
    if (aviso2) aviso2();

    out.vistas = vistas;
    game.bloques.quitar(clave);
    return out;
  });
  t('§3 el flechazo → "impacto|flecha"', r3.vistas && r3.vistas[0] === 'impacto|flecha',
    r3.vistas && r3.vistas[0]);
  t('§3 el barrido de la TNT → "masa"', r3.vistas && r3.vistas[1] === 'masa|-',
    r3.vistas && r3.vistas[1]);
  t('§3 el respaldo de la flecha → "impacto"', r3.vistas && r3.vistas[2] === 'impacto|-',
    r3.vistas && r3.vistas[2]);

  paso('§4 · sin errores de consola');
  t('§4 cero errores JS', errores.length === 0, errores.slice(0, 2).join(' | '));

  console.log('\n' + seg() + ok + ' ok, ' + fail + ' fallos');
  await nav.close();
  process.exit(fail ? 1 : 0);
})();
