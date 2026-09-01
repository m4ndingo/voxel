// @area: fluidos
// @necesita: servidor, playwright
// BUG-FLUID3 — un fluido exportado de otra instancia llega por assets ('asset:assets/agua.vox.json')
// en vez de por la galería ('hab:agua'). El motor de fluidos lo reconoce igual (mira el NOMBRE), pero
// al fluir registraba sus niveles copiando la paleta de 'hab:agua', que en esta instancia NO existe:
// el nivel salía con la pinta de ROCA. El agua se veía, la que corría no.
//
// Aquí se comprueba lo que el test de REQ-FLUID1 no mira: no si la celda «es fluido» (eso ya iba,
// porque el nivel se guarda en la clave), sino de QUÉ material tiene la cara — que es lo que el dueño
// ve. En este repo `data/habitantes/` no tiene ningún agua ni lava, así que el caso es el real.
//
// No persiste nada: bloquea los POST y devuelve cada celda tocada a su id anterior.
//
//   node test_fluido_importado.js [url]        por defecto http://localhost:8500/map/test
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
  await p.waitForFunction('window.game && game.fluidos && game.fluidos.info', null, { timeout: 120000 });
  await p.waitForTimeout(3000);

  const r = await p.evaluate(async () => {
    const out = { errs: [] };
    const idEn = (x, y, z) => mc.grid[mcIdx(x, y, z)] || 0;
    const claveEn = (x, y, z) => mc.blockKey[idEn(x, y, z)] || 'aire';

    const tocadas = new Map();
    const pon = (x, y, z, id) => {
      const c = x + ',' + y + ',' + z;
      if (!tocadas.has(c)) tocadas.set(c, [x, y, z, idEn(x, y, z)]);
      mcSetBlock(x, y, z, id | 0);
    };

    // Este repo es el caso de verdad: el agua y la lava solo existen empotradas en assets/.
    out.hayHab = { agua: !!(mc.name2id && mc.name2id['hab:agua']), lava: !!(mc.name2id && mc.name2id['hab:lava']) };
    for (const k of ['asset:assets/agua.vox.json', 'asset:assets/lava.vox.json'])
      if (!mc.name2id[k]) { try { await game.addMaterial(k); } catch (e) { out.errs.push('no carga ' + k + ': ' + e.message); } }
    // con guarda: el motor de antes no tenía estos ayudantes, y sin la guarda el test reventaría aquí
    // en vez de enseñar QUÉ se ve mal, que es lo que de verdad guarda.
    const nom = k => (typeof mcNombreMat === 'function') ? mcNombreMat(k) : '(sin mcNombreMat)';
    const clv = n => (typeof mcClaveDeNombre === 'function') ? mcClaveDeNombre(n) : '(sin mcClaveDeNombre)';
    out.resuelve = { agua: clv('agua'), lava: clv('lava') };
    out.nombres = { hab: nom('hab:agua'), asset: nom('asset:assets/agua.vox.json'),
                    nivel: nom('asset:assets/agua.vox.json-3'), giro: nom('hab:agua@5') };

    // ── un hueco de aire con suelo debajo ────────────────────────────────────────────────────
    const AN = 5, AL = 6, PR = 5;
    let caja = null;
    const yTope = Math.min(40, mc.dim.y - AL - 2);
    for (let y = 6; y < yTope && !caja; y++)
      for (let x = 20; x < mc.dim.x - AN - 4 && !caja; x += 4)
        for (let z = 20; z < mc.dim.z - PR - 4 && !caja; z += 4) {
          let libre = true;
          for (let i = 0; i < AN && libre; i++) for (let j = 0; j < AL && libre; j++)
            for (let k = 0; k < PR && libre; k++) if (idEn(x + i, y + j, z + k)) libre = false;
          if (libre) caja = [x, y, z];
        }
    if (!caja) { out.errs.push('sin hueco de aire donde montar el escenario'); return out; }
    const [X, Y, Z] = caja;
    out.caja = caja;

    const ROCA = mcResolveMat('roca');
    const palRoca = mc.palette ? mc.palette[ROCA] : null;

    function derrama(tipo, y0) {
      // suelo de roca y una fuente dos celdas por encima: cae y se extiende a los lados
      for (let i = -1; i <= 1; i++) for (let k = -1; k <= 1; k++) pon(X + i, y0 - 1, Z + k, ROCA);
      for (let j = 0; j <= 2; j++) for (let i = -1; i <= 1; i++) for (let k = -1; k <= 1; k++) pon(X + i, y0 + j, Z + k, 0);
      game.fluidos.setFluid(X, y0 + 2, Z, tipo, 0);
      for (let t = 0; t < 6; t++) game.fluidos.tick(true);
      const idFuente = idEn(X, y0 + 2, Z), idCorre = idEn(X, y0, Z);
      return {
        fuente: claveEn(X, y0 + 2, Z),
        corre: claveEn(X, y0, Z),
        esFluido: game.fluidos.info(X, y0, Z).isFluid,
        // lo que se VE: la cara del nivel sale de la paleta del fluido base, no de la de roca
        pintaDeRoca: !!(palRoca && mc.palette && mc.palette[idCorre] === palRoca && idCorre !== ROCA),
        mismaPaleta: !!(mc.palette && idFuente > 0 && idCorre > 0 && mc.palette[idCorre] === mc.palette[idFuente]),
        geomBase: mcFluidBase(claveEn(X, y0, Z))
      };
    }

    out.agua = derrama('WATER', Y + 1);
    out.lava = derrama('LAVA', Y + 1);

    // por nombre corto, que es como lo escribe un snippet
    out.porNombre = { agua: mc.blockKey[mcResolveMat('agua')], lava: mc.blockKey[mcResolveMat('lava')] };

    for (const [, v] of tocadas) mcSetBlock(v[0], v[1], v[2], v[3]);
    if (typeof game.fluidos.rebuild === 'function') game.fluidos.rebuild();
    mcRemeshAround(X - 2, Z - 2, X + AN + 2, Z + PR + 2);
    return out;
  });

  if (r.errs && r.errs.length) console.log('errores de montaje: ' + r.errs.join(' · '));
  if (!r.agua) { console.log('no hubo medida: ' + JSON.stringify(r)); await b.close(); process.exit(1); }
  console.log('\ncaja de pruebas: ' + JSON.stringify(r.caja));

  console.log('\n0 · el nombre pelado y a qué clave vuelve');
  ok(r.hayHab.agua === false && r.hayHab.lava === false,
    'en esta instancia NO hay hab:agua ni hab:lava (el caso que reportó el dueño)', JSON.stringify(r.hayHab));
  ok(r.nombres.hab === 'agua' && r.nombres.asset === 'agua' && r.nombres.nivel === 'agua' && r.nombres.giro === 'agua',
    'mcNombreMat quita espacio de nombres, nivel y giro', JSON.stringify(r.nombres));
  ok(r.resuelve.agua === 'asset:assets/agua.vox.json', 'mcClaveDeNombre("agua") da el agua de aquí', r.resuelve.agua);
  ok(r.resuelve.lava === 'asset:assets/lava.vox.json', 'mcClaveDeNombre("lava") da la lava de aquí', r.resuelve.lava);

  for (const [nombre, d] of [['agua', r.agua], ['lava', r.lava]]) {
    console.log('\n· ' + nombre + ': ' + JSON.stringify({ fuente: d.fuente, corre: d.corre }));
    ok(d.esFluido, 'la que corre sigue siendo fluido para el motor');
    ok(d.corre.indexOf('asset:assets/' + nombre) === 0,
      'y arrastra el espacio de nombres de la fuente: nivel en assets, no en hab:', d.corre);
    ok(d.pintaDeRoca === false, 'NO tiene la pinta de roca (que es el bug)', d.corre);
    ok(d.mismaPaleta, 'comparte la paleta de su fuente: se ve como ' + nombre);
    ok(d.geomBase === 'asset:assets/' + nombre + '.vox.json',
      'y su geometría sale del fichero del ' + nombre, d.geomBase);
  }

  console.log('\n· por nombre corto (lo que escribe un snippet): ' + JSON.stringify(r.porNombre));
  ok(r.porNombre.agua === 'asset:assets/agua.vox.json', 'mcResolveMat("agua") no cae a roca', r.porNombre.agua);
  ok(r.porNombre.lava === 'asset:assets/lava.vox.json', 'mcResolveMat("lava") no cae a roca', r.porNombre.lava);

  ok(errores.length === 0, 'sin errores de página', errores.join(' · '));
  console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nTODO OK');
  await b.close();
  process.exit(fallos ? 1 : 0);
})();
