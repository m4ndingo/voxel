// ¿El lienzo de tamaño natural de la TARJETA es el mismo que el del SANDBOX?
// El dueño da el sandbox por bueno («el 32x32 del sandbox se ve genial»), así que la tarjeta no
// tiene que parecerse: tiene que ser IGUAL. Se comparan los dos búferes píxel a píxel y se mira
// además el tamaño del búfer, que es lo que sale al copiar la imagen.
const { chromium } = require('/root/voxel/node_modules/playwright');

(async () => {
  const b = await chromium.launch({ args:['--use-gl=swiftshader'] });
  for(const dpr of [1, 1.25]){
    const p = await b.newPage({ viewport:{ width:1300, height:1000 }, deviceScaleFactor: dpr });
    p.on('console', m => { if(m.type() === 'error') console.log('  [err]', m.text()); });
    await p.goto('http://localhost:8500/images/', { waitUntil:'networkidle' });
    await p.waitForFunction("typeof catalogo !== 'undefined' && catalogo.length > 0");

    const r = await p.evaluate(async () => {
      const a = catalogo.find(x => /analista/i.test(x.nombre)) || catalogo[0];
      const doc = await fetch(a.url).then(x => x.json());
      await resuelveTex(doc);
      asignado.favicon = { clave:a.clave, url:a.url, nombre:a.nombre, doc, modo:'iso', ori:0, aa:true };
      pintaTodo();

      // El sandbox, con el mismo dibujo, mismo modo/postura/AA y a 32.
      sb.doc = doc; sb.clave = a.clave; sb.nombre = a.nombre;
      sb.modo = 'iso'; sb.ori = 0; sb.aa = true; sb.w = sb.h = 32;
      pintaSandbox();

      const cvs = [...document.querySelectorAll('[data-ranura=favicon] .previa canvas')];
      const nat = cvs.find(c => c.dataset.px === '32' && parseFloat(c.style.width) === 32);
      const px = c => [...c.getContext('2d').getImageData(0, 0, c.width, c.height).data];
      const a1 = px(nat), a2 = px(sbLienzo);
      let dif = 0;
      for(let i = 0; i < Math.min(a1.length, a2.length); i++) if(a1[i] !== a2[i]) dif++;

      return {
        nombre: a.nombre, dpr: devicePixelRatio,
        tarjeta: { buf: nat.width + '×' + nat.height, css: getComputedStyle(nat).width,
                   rend: getComputedStyle(nat).imageRendering },
        sandbox: { buf: sbLienzo.width + '×' + sbLienzo.height, css: getComputedStyle(sbLienzo).width,
                   rend: getComputedStyle(sbLienzo).imageRendering },
        mismoTam: a1.length === a2.length, subpixelesDistintos: dif, total: a1.length,
        ampliados: cvs.filter(c => parseFloat(c.style.width) > +c.dataset.px)
                      .map(c => c.dataset.px + '→' + c.style.width + ' buf ' + c.width)
      };
    });
    console.log(JSON.stringify(r, null, 1));
    await p.close();
  }
  await b.close();
})();
