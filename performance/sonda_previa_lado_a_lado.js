// La comparación que el dueño pedía y no podía copiar: el 32×32 de la TARJETA y el 32×32 del
// SANDBOX, primero a tamaño real y luego ampliados ×8 con vecino más próximo. A dpr 1,25, que es
// donde se veía el problema.
const { chromium } = require('/root/voxel/node_modules/playwright');

(async () => {
  const b = await chromium.launch({ args:['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport:{ width:800, height:400 }, deviceScaleFactor: 1.25 });
  await p.goto('http://localhost:8500/images/', { waitUntil:'networkidle' });
  await p.waitForFunction("typeof catalogo !== 'undefined' && catalogo.length > 0");

  await p.evaluate(async () => {
    const a = catalogo.find(x => /analista/i.test(x.nombre)) || catalogo[0];
    const doc = await fetch(a.url).then(x => x.json());
    await resuelveTex(doc);
    asignado.favicon = { clave:a.clave, url:a.url, nombre:a.nombre, doc, modo:'iso', ori:0, aa:true };
    pintaTodo();
    sb.doc = doc; sb.clave = a.clave; sb.modo = 'iso'; sb.ori = 0; sb.aa = true; sb.w = sb.h = 32;
    pintaSandbox();

    const nat = [...document.querySelectorAll('[data-ranura=favicon] .previa canvas')]
      .find(c => c.dataset.px === '32' && parseFloat(c.style.width) === 32);

    const caja = document.createElement('div');
    caja.id = 'lado';
    caja.style.cssText = 'position:fixed;inset:0;z-index:999;background:#161922;padding:22px;'
      + 'display:flex;gap:34px;align-items:flex-start;font:12px system-ui;color:#cbd5e6';
    for(const [rot, src] of [['tarjeta', nat], ['sandbox', sbLienzo]]){
      const real = document.createElement('canvas'); real.width = real.height = 32;
      real.getContext('2d').drawImage(src, 0, 0);
      real.style.cssText = 'background:#101319;display:block;margin:0 auto';
      const zoom = document.createElement('canvas'); zoom.width = zoom.height = 256;
      const g = zoom.getContext('2d'); g.imageSmoothingEnabled = false;
      g.drawImage(src, 0, 0, 256, 256);
      zoom.style.cssText = 'background:#101319;display:block;margin-top:12px';
      const f = document.createElement('figure'); f.style.margin = '0';
      f.append(real, zoom, Object.assign(document.createElement('figcaption'),
        { textContent: rot + ' — 32×32 y ×8', style:'margin-top:8px;text-align:center' }));
      caja.appendChild(f);
    }
    document.body.appendChild(caja);
  });
  await p.locator('#lado').screenshot({ path:'/root/voxel/performance/previa_lado_a_lado.png' });
  await b.close();
  console.log('listo → performance/previa_lado_a_lado.png');
})();
