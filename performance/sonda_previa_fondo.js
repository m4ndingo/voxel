// Guardián visual del arreglo: la tarjeta de un dibujo OPACO va sobre sólido y la de uno
// TRANSLÚCIDO (el agua) sigue sobre tablero. Deja una captura de cada una.
const { chromium } = require('/root/voxel/node_modules/playwright');

(async () => {
  const b = await chromium.launch({ args:['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport:{ width:1180, height:900 } });
  const errores = [];
  p.on('console', m => { if(m.type() === 'error') errores.push(m.text()); });
  await p.goto('http://localhost:8500/images/', { waitUntil:'networkidle' });
  await p.waitForFunction("typeof catalogo !== 'undefined' && catalogo.length > 0");

  for(const [busca, esperado] of [['alis', false], ['agua', true]]){
    const r = await p.evaluate(async ({ busca }) => {
      const a = catalogo.find(x => new RegExp(busca, 'i').test(x.nombre));
      if(!a) return { falta: busca };
      const doc = await fetch(a.url).then(x => x.json());
      await resuelveTex(doc);
      asignado.favicon = { clave:a.clave, url:a.url, nombre:a.nombre, doc, modo:'iso', ori:0, aa:true };
      pintaTodo();
      const cv = document.querySelector('[data-ranura=favicon] .previa canvas');
      return { nombre:a.nombre, trans:cv.classList.contains('trans'), traslucido:docTraslucido(doc) };
    }, { busca });
    console.log(busca, JSON.stringify(r), r.trans === esperado ? '✔' : '✘ ESPERADO ' + esperado);
    await p.locator('[data-ranura=favicon]').screenshot({ path:'/root/voxel/performance/previa_' + busca + '.png' });
  }
  console.log(errores.length ? 'ERRORES DE CONSOLA: ' + errores.join(' | ') : 'consola limpia ✔');
  await b.close();
})();
