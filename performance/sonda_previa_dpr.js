// ¿La previa se ve mal porque la pantalla del dueño no tiene un devicePixelRatio entero?
// Un lienzo de 16 px mostrado a 16 px CSS con dpr 1.25 son 20 píxeles de pantalla: un reescalado
// 1,25× que duplica filas sueltas. Se captura la misma tarjeta con varios dpr para verlo.
const { chromium } = require('/root/voxel/node_modules/playwright');

(async () => {
  const b = await chromium.launch({ args:['--use-gl=swiftshader'] });
  for(const dpr of [1, 1.25, 1.5, 2]){
    const p = await b.newPage({ viewport:{ width:1300, height:900 }, deviceScaleFactor: dpr });
    await p.goto('http://localhost:8500/images/', { waitUntil:'networkidle' });
    await p.waitForFunction("typeof catalogo !== 'undefined' && catalogo.length > 0");
    await p.evaluate(async () => {
      const a = catalogo.find(x => /analista/i.test(x.nombre)) || catalogo[0];
      const doc = await fetch(a.url).then(x => x.json());
      await resuelveTex(doc);
      asignado.favicon = { clave:a.clave, url:a.url, nombre:a.nombre, doc, modo:'iso', ori:0, aa:true };
      pintaTodo();
    });
    await p.locator('[data-ranura=favicon] .previa').screenshot({
      path:'/root/voxel/performance/dpr_' + String(dpr).replace('.', '_') + '.png' });
    console.log('dpr', dpr, '→', await p.evaluate(() => devicePixelRatio));
    await p.close();
  }
  await b.close();
})();
