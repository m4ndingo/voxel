// @area: redstone
// @necesita: servidor, playwright
// Una pieza de redstone exportada de otra instancia e importada aquí llega por assets:
// `asset:assets/piston-pegajoso-on.vox.json` en vez de `hab:piston-pegajoso-on`. Es el MISMO dibujo,
// y hasta ahora el circuito solo conocía las claves `hab:` escritas a mano — o sea que al cruzar de
// instancia el pistón dejaba de ser un pistón y se quedaba de adorno.
//
// Aquí se monta el pistón pegajoso ENTERO en el espacio de nombres de assets (que es como está de
// verdad en este repo: assets/piston-pegajoso*.vox.json) y se comprueba que sigue siendo circuito,
// que se extiende con su cabeza de assets —no con la de la galería— y que al retraerse tira del
// bloque de delante, que es lo que lo hace pegajoso. Al final, el mismo montaje con `hab:` para que
// reconocer las de assets no le quite el sitio a las de siempre.
//
// No persiste nada: bloquea los POST y devuelve cada celda tocada a su id anterior.
//
//   node test_piezas_importadas.js [url]        por defecto http://localhost:8500/map/test
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
  await p.waitForFunction('window.game && game.redstone && game.redstone.info', null, { timeout: 120000 });
  await p.waitForTimeout(4000);

  const r = await p.evaluate(async () => {
    const out = { errs: [] };
    const A = n => 'asset:assets/' + n + '.vox.json';      // la puerta de entrada de lo importado
    const H = n => 'hab:' + n;                             // la de la galería de habitantes
    const idEn = (x, y, z) => mc.grid[mcIdx(x, y, z)] || 0;
    const claveEn = (x, y, z) => mc.blockKey[idEn(x, y, z)] || 'aire';
    const frame = () => new Promise(res => requestAnimationFrame(res));
    const correr = async n => { for (let i = 0; i < n; i++) await frame(); };

    const tocadas = new Map();
    const pon = (x, y, z, id) => {
      const c = x + ',' + y + ',' + z;
      if (!tocadas.has(c)) tocadas.set(c, [x, y, z, idEn(x, y, z)]);
      mcSetBlock(x, y, z, id | 0);
    };

    // ── un hueco de aire con suelo debajo ────────────────────────────────────────────────────
    const AN = 12, AL = 5, PR = 6;
    let caja = null;
    const yTope = Math.min(40, mc.dim.y - AL - 2);
    for (let y = 6; y < yTope && !caja; y++)
      for (let x = 12; x < mc.dim.x - AN - 4 && !caja; x += 4)
        for (let z = 12; z < mc.dim.z - PR - 4 && !caja; z += 4) {
          let libre = true;
          for (let i = 0; i < AN && libre; i++) for (let j = 0; j < AL && libre; j++)
            for (let k = 0; k < PR && libre; k++) if (idEn(x + i, y + j, z + k)) libre = false;
          if (libre) caja = [x, y, z];
        }
    if (!caja) { out.errs.push('sin hueco de aire donde montar el escenario'); return out; }
    const [X, Y, Z] = caja;
    out.caja = caja;

    const CLAVES = [A('piston-pegajoso'), A('piston-pegajoso-on'), A('piston-pegajoso-cabeza'),
      H('piston'), H('piston-on'), H('piston-cabeza'),
      H('palanca'), H('palanca-on'), 'asset:assets/blocks_mock/arena.vox.json'];
    for (const k of CLAVES) {
      if (!mc.name2id[k]) { try { await game.addMaterial(k); } catch (e) { out.errs.push('no carga ' + k + ': ' + e.message); } }
    }
    const id = k => mc.name2id[k] || 0;
    const ARENA = 'asset:assets/blocks_mock/arena.vox.json';
    if (!id(A('piston-pegajoso')) || !id(H('palanca')) || !id(ARENA)) {
      out.errs.push('faltan materiales en la paleta'); return out;
    }

    // ── el montaje, una fila en +X: palanca · pistón · arena ─────────────────────────────────
    // El pistón sin sufijo empuja a +X (su frente es el +X del dibujo), así que la arena va delante.
    async function montar(clavePiston, claveArena) {
      pon(X, Y, Z, id(H('palanca')));
      pon(X + 1, Y, Z, id(clavePiston));
      pon(X + 2, Y, Z, id(claveArena));
      pon(X + 3, Y, Z, 0);
      pon(X + 4, Y, Z, 0);
      game.redstone.revisarCaja(X - 2, Y - 2, Z - 2, X + 6, Y + 2, Z + 2);
      await correr(15);
    }
    async function palanca(on) {
      pon(X, Y, Z, id(on ? H('palanca-on') : H('palanca')));
      game.redstone.revisarCaja(X - 2, Y - 2, Z - 2, X + 6, Y + 2, Z + 2);
      await correr(25);
    }
    async function limpiar() {
      for (let i = 0; i <= 5; i++) pon(X + i, Y, Z, 0);
      game.redstone.revisarCaja(X - 2, Y - 2, Z - 2, X + 6, Y + 2, Z + 2);
      await correr(15);
    }

    // ── 1 · el pistón pegajoso IMPORTADO (todo en assets) ────────────────────────────────────
    await montar(A('piston-pegajoso'), ARENA);
    const inf = game.redstone.info(X + 1, Y, Z);
    out.esCircuito = !!(inf && inf.esCircuito);

    await palanca(true);
    out.extendido = { cuerpo: claveEn(X + 1, Y, Z), cabeza: claveEn(X + 2, Y, Z), arena: claveEn(X + 3, Y, Z) };

    await palanca(false);
    out.retraido = { cuerpo: claveEn(X + 1, Y, Z), delante: claveEn(X + 2, Y, Z), dosMasAlla: claveEn(X + 3, Y, Z) };
    await limpiar();

    // ── 2 · el de siempre, por la galería: reconocer lo importado no le quita el sitio ───────
    await montar(H('piston'), ARENA);
    await palanca(true);
    out.habExtendido = { cuerpo: claveEn(X + 1, Y, Z), cabeza: claveEn(X + 2, Y, Z), arena: claveEn(X + 3, Y, Z) };
    await palanca(false);
    out.habRetraido = { cuerpo: claveEn(X + 1, Y, Z) };
    await limpiar();

    for (const [, v] of tocadas) mcSetBlock(v[0], v[1], v[2], v[3]);
    mcRemeshAround(X - 1, Z - 1, X + AN + 1, Z + PR + 1);
    return out;
  });

  if (r.errs && r.errs.length) console.log('errores de montaje: ' + r.errs.join(' · '));
  if (!r.extendido) { console.log('no hubo medida: ' + JSON.stringify(r)); await b.close(); process.exit(1); }
  console.log('\ncaja de pruebas: ' + JSON.stringify(r.caja));

  console.log('\n1 · pistón pegajoso IMPORTADO (asset:assets/piston-pegajoso…)');
  ok(r.esCircuito === true, 'el pistón importado ES circuito para el motor');
  console.log('    extendido: ' + JSON.stringify(r.extendido));
  ok(r.extendido.cuerpo === 'asset:assets/piston-pegajoso-on.vox.json',
    'se extiende y su cuerpo pasa a la variante -on de ASSETS', r.extendido.cuerpo);
  ok(r.extendido.cabeza === 'asset:assets/piston-pegajoso-cabeza.vox.json',
    'la cabeza sale de assets, no de la galería', r.extendido.cabeza);
  ok(r.extendido.arena === 'asset:assets/blocks_mock/arena.vox.json',
    'y empuja el bloque de delante una celda', r.extendido.arena);

  console.log('    retraído: ' + JSON.stringify(r.retraido));
  ok(r.retraido.cuerpo === 'asset:assets/piston-pegajoso.vox.json',
    'se retrae y vuelve a su variante apagada', r.retraido.cuerpo);
  ok(r.retraido.delante === 'asset:assets/blocks_mock/arena.vox.json',
    'y TIRA del bloque al retraerse: para eso es pegajoso', r.retraido.delante);
  ok(r.retraido.dosMasAlla === 'aire', 'el bloque no se queda donde lo dejó la extensión', r.retraido.dosMasAlla);

  console.log('\n2 · el de la galería sigue igual (hab:piston)');
  console.log('    ' + JSON.stringify(r.habExtendido) + ' → ' + JSON.stringify(r.habRetraido));
  ok(r.habExtendido.cuerpo === 'hab:piston-on', 'se extiende', r.habExtendido.cuerpo);
  ok(r.habExtendido.cabeza === 'hab:piston-cabeza', 'con su cabeza de la galería', r.habExtendido.cabeza);
  ok(r.habExtendido.arena === 'asset:assets/blocks_mock/arena.vox.json', 'y empuja', r.habExtendido.arena);
  ok(r.habRetraido.cuerpo === 'hab:piston', 'y se retrae', r.habRetraido.cuerpo);

  ok(errores.length === 0, 'sin errores de página', errores.join(' · '));
  console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nTODO OK');
  await b.close();
  process.exit(fallos ? 1 : 0);
})();
