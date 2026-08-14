// A/B a dpr 1,25: previa vieja (lienzo al tamaño justo + image-rendering:pixelated) contra la
// nueva (ampliada ×k entera por `pintaPrevia` y reducida por el navegador). Se captura a píxel de
// pantalla y luego se amplía ×4 para poder mirarlo.
const { chromium } = require('/root/voxel/node_modules/playwright');
const fs = require('fs');

(async () => {
  const b = await chromium.launch({ args:['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport:{ width:900, height:400 }, deviceScaleFactor: 1.25 });
  await p.goto('http://localhost:8500/images/', { waitUntil:'networkidle' });
  await p.waitForFunction("typeof catalogo !== 'undefined' && catalogo.length > 0");

  await p.evaluate(async () => {
    const a = catalogo.find(x => /analista/i.test(x.nombre)) || catalogo[0];
    const doc = await fetch(a.url).then(x => x.json());
    await resuelveTex(doc);
    const caja = document.createElement('div');
    caja.id = 'ab';
    caja.style.cssText = 'position:fixed;inset:0;z-index:999;background:#161922;padding:16px;'
      + 'font:11px system-ui;color:#cbd5e6';
    for(const [rot, viejo] of [['ANTES (pixelated, sin ampliar)', true], ['DESPUÉS (pintaPrevia)', false]]){
      const fila = document.createElement('div');
      fila.style.cssText = 'display:flex;gap:18px;align-items:flex-end;margin-bottom:14px';
      fila.insertAdjacentHTML('beforeend', '<div style="width:150px">' + rot + '</div>');
      for(const [px, css] of [[16,16],[16,64],[32,32],[32,64]]){
        const cv = document.createElement('canvas');
        cv.dataset.px = px;
        cv.style.cssText = 'width:'+css+'px;height:'+css+'px;background:#101319;display:block';
        if(viejo){ cv.width = cv.height = px; cv.style.imageRendering = 'pixelated'; pinta(cv, doc, 'iso', 0, true); }
        else { pintaPrevia(cv, doc, 'iso', 0, true); }
        fila.appendChild(cv);
      }
      caja.appendChild(fila);
    }
    document.body.appendChild(caja);
  });
  const buf = await p.locator('#ab').screenshot();
  fs.writeFileSync('/tmp/ab.png', buf);

  // Segunda pasada: enseñar esa captura ×4 con vecino más próximo, para ver el detalle.
  const q = await b.newPage({ viewport:{ width:1400, height:700 } });
  await q.setContent('<body style="margin:0;background:#0b0d13">'
    + '<img id="i" style="image-rendering:pixelated;transform-origin:0 0;transform:scale(3)" '
    + 'src="data:image/png;base64,' + buf.toString('base64') + '">');
  await q.waitForFunction("document.getElementById('i').complete");
  await q.screenshot({ path:'/root/voxel/performance/previa_ab.png' });
  await b.close();
  console.log('listo');
})();
