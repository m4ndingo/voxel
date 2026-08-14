// Sonda: ¿por qué un icono suavizado se ve peor en la tarjeta que en el sandbox?
// Mide el alfa parcial que deja el AA de silueta a tamaños pequeños.
const { chromium } = require('/root/voxel/node_modules/playwright');

(async () => {
  const b = await chromium.launch({ args:['--use-gl=swiftshader'] });
  const p = await b.newPage();
  p.on('console', m => console.log('  [console]', m.text()));
  await p.goto('http://localhost:8500/images/', { waitUntil:'networkidle' });
  await p.waitForFunction("typeof catalogo !== 'undefined' && catalogo.length > 0");

  const r = await p.evaluate(async () => {
    // Coge el dibujo que el dueño enseña en la captura: uno cualquiera con volumen.
    const a = catalogo.find(x => /alis/i.test(x.nombre)) || catalogo.find(x => !x.plano) || catalogo[0];
    const doc = await fetch(a.url).then(x => x.json());
    await resuelveTex(doc);
    const lee = (px, modo, aa) => {
      const cv = document.createElement('canvas'); cv.width = cv.height = px;
      pinta(cv, doc, modo, 0, aa);
      return cv.getContext('2d').getImageData(0,0,px,px).data;
    };
    const out = {};
    for(const px of [16, 32, 64]){
      const A = lee(px, 'iso', true), N = lee(px, 'iso', false);
      let op=0, parc=0, inventado=0, perdido=0;
      for(let i=3;i<A.length;i+=4){
        if(A[i]===255) op++; else if(A[i]>0) parc++;
        if(A[i]>0 && N[i]===0) inventado++;   // color promediado del ×4: mancha borrosa
        if(A[i]===0 && N[i]>0) perdido++;
      }
      out['iso'+px] = { op, parc, inventado, perdido,
        pctParcial:+(parc/(op+parc)*100).toFixed(1), pctInventado:+(inventado/(op+parc)*100).toFixed(1) };
    }
    return { nombre:a.nombre, size:doc.size, out };
  });
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
