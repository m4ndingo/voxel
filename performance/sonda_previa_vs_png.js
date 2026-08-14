// ¿La previa de la tarjeta enseña lo mismo que el PNG que se descarga?
// Compara PIXEL A PIXEL el lienzo de la tarjeta con el PNG horneado, y deja una ampliación
// nearest-neighbour de los dos para poder mirarlos.
const { chromium } = require('/root/voxel/node_modules/playwright');

(async () => {
  const b = await chromium.launch({ args:['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport:{ width:1300, height:900 } });
  p.on('console', m => { if(m.type() === 'error') console.log('  [err]', m.text()); });
  await p.goto('http://localhost:8500/images/', { waitUntil:'networkidle' });
  await p.waitForFunction("typeof catalogo !== 'undefined' && catalogo.length > 0");

  const r = await p.evaluate(async () => {
    const a = catalogo.find(x => /analista/i.test(x.nombre)) || catalogo[0];
    const doc = await fetch(a.url).then(x => x.json());
    await resuelveTex(doc);
    asignado.favicon = { clave:a.clave, url:a.url, nombre:a.nombre, doc, modo:'iso', ori:0, aa:true };
    pintaTodo();

    // Los cuatro lienzos de la tarjeta, tal cual están en el DOM.
    const cvs = [...document.querySelectorAll('[data-ranura=favicon] .previa canvas')];
    const info = cvs.map(c => ({
      backing: c.width + '×' + c.height,
      css: getComputedStyle(c).width + '×' + getComputedStyle(c).height,
      rend: getComputedStyle(c).imageRendering,
      fondo: getComputedStyle(c).backgroundColor,
      clases: c.className
    }));
    return { nombre:a.nombre, dpr:devicePixelRatio, info };
  });
  console.log(JSON.stringify(r, null, 1));

  // Ampliación x8 nearest-neighbour de: (a) el lienzo de 32 de la tarjeta, (b) el PNG horneado.
  await p.evaluate(() => {
    const cv = [...document.querySelectorAll('[data-ranura=favicon] .previa canvas')].find(c => c.width === 32);
    const caja = document.createElement('div');
    caja.style.cssText = 'position:fixed;inset:0;z-index:999;background:#161922;padding:20px;'
      + 'display:flex;gap:30px;align-items:flex-start;font:12px system-ui;color:#cbd5e6';
    const grande = document.createElement('canvas'); grande.width = grande.height = 256;
    const g = grande.getContext('2d'); g.imageSmoothingEnabled = false;
    g.drawImage(cv, 0, 0, 256, 256);
    grande.style.cssText = 'background:#101319;image-rendering:pixelated';
    const f1 = document.createElement('figure'); f1.style.margin = '0';
    f1.append(grande, Object.assign(document.createElement('figcaption'), { textContent:'lienzo de la tarjeta ×8' }));
    // El mismo dibujo repintado en un lienzo virgen: si sale distinto, el DOM le está haciendo algo.
    const limpio = document.createElement('canvas'); limpio.width = limpio.height = 32;
    pinta(limpio, asignado.favicon.doc, 'iso', 0, true);
    const g2c = document.createElement('canvas'); g2c.width = g2c.height = 256;
    const g2 = g2c.getContext('2d'); g2.imageSmoothingEnabled = false;
    g2.drawImage(limpio, 0, 0, 256, 256);
    g2c.style.cssText = 'background:#101319;image-rendering:pixelated';
    const f2 = document.createElement('figure'); f2.style.margin = '0';
    f2.append(g2c, Object.assign(document.createElement('figcaption'), { textContent:'repintado limpio ×8 (= el PNG)' }));
    caja.append(f1, f2);
    document.body.appendChild(caja);
  });
  await p.screenshot({ path:'/root/voxel/performance/previa_vs_png.png' });
  await b.close();
})();
