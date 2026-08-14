// Captura de /images tal como queda, para mirarla. No escribe nada en data/ui/.
const { chromium } = require('/root/voxel/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ args:['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport:{ width:1300, height:1000 } });
  const err = [];
  p.on('console', m => { if(m.type() === 'error') err.push(m.text()); });
  await p.goto('http://localhost:8500/images/', { waitUntil:'networkidle' });
  await p.waitForFunction("typeof catalogo !== 'undefined' && catalogo.length > 0");
  await p.evaluate(async () => {
    const a = catalogo.find(x => /alis/i.test(x.nombre)) || catalogo[0];
    const doc = await fetch(a.url).then(x => x.json());
    await resuelveTex(doc);
    asignado.favicon = { clave:a.clave, url:a.url, nombre:a.nombre, doc, modo:'iso', ori:0, aa:true };
    asignado.marca   = { clave:a.clave, url:a.url, nombre:a.nombre, doc, modo:'plano', ori:0, aa:false };
    pintaTodo();
  });
  await p.screenshot({ path:'/root/voxel/performance/images_vista.png' });
  console.log(err.length ? 'ERRORES: ' + err.join(' | ') : 'consola limpia');
  await b.close();
})();
