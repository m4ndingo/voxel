// Captura la barra de herramientas del editor con los iconos horneados puestos, para mirarla.
// Deja data/ui/ como estaba.
const { chromium } = require('/root/voxel/node_modules/playwright');
const fs = require('fs'), path = require('path');
const UI = '/root/voxel/data/ui';

(async () => {
  const previo = fs.existsSync(UI) ? fs.readdirSync(UI) : [];
  const guardado = new Map(previo.map(f => [f, fs.readFileSync(path.join(UI, f))]));
  const b = await chromium.launch({ args:['--use-gl=swiftshader'] });
  try{
    let p = await b.newPage();
    await p.goto('http://localhost:8500/images/', { waitUntil:'networkidle' });
    await p.waitForFunction("typeof catalogo !== 'undefined' && catalogo.length > 0");
    await p.evaluate(async () => {
      // Uno distinto por ranura, para ver que cada botón coge el suyo.
      const cands = catalogo.filter(x => !x.plano && x.count > 40);
      let i = 0;
      for(const r of RANURAS){
        const a = cands[(i++ * 7) % cands.length];
        const doc = await fetch(a.url).then(x => x.json());
        await resuelveTex(doc);
        asignado[r.id] = { clave:a.clave, url:a.url, nombre:a.nombre, doc, modo:'iso', ori:0, aa:true };
      }
      pintaTodo();
    });
    p.once('dialog', d => d.accept());
    await p.evaluate(() => publicar());
    await p.waitForFunction("!document.querySelector('.estado .pri').disabled");
    await p.close();

    p = await b.newPage({ viewport:{ width:1400, height:900 } });
    await p.goto('http://localhost:8500/?noauto=1', { waitUntil:'networkidle' });
    await p.waitForFunction("document.querySelectorAll('.icono-horneado').length > 0");
    await p.locator('#tools').screenshot({ path:'/root/voxel/performance/iconos_barra.png' });
    await p.locator('.brand, header, .topbar').first().screenshot({ path:'/root/voxel/performance/iconos_marca.png' });
  } finally {
    await b.close();
    for(const f of fs.readdirSync(UI)) fs.unlinkSync(path.join(UI, f));
    for(const [f, buf] of guardado) fs.writeFileSync(path.join(UI, f), buf);
  }
})();
