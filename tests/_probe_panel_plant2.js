const { chromium } = require('playwright');
const B = process.env.VOXEL_URL || 'http://localhost:8577';
(async () => {
  const nav = await chromium.launch({ args: ['--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader'] });
  const p = await nav.newPage(); await p.setViewportSize({width:1280,height:900});
  const errs=[]; p.on('pageerror', e=>errs.push(String(e)));
  await p.goto(B+'/panel', {waitUntil:'load', timeout:60000});
  await p.click('button:has-text("Plantillas")').catch(()=>{});
  await p.waitForSelector('.plant .caja', {timeout:15000});
  const r = await p.evaluate(() => {
    const c = document.querySelector('.plant .caja');
    return {
      avisos: [...document.querySelectorAll('#main > .aviso')].map(a=>a.textContent.slice(0,70)),
      selects: [...c.querySelectorAll('select')].map(s=>s.dataset.k+'='+s.value+' ('+s.options.length+' opc)'),
      botones: [...c.querySelectorAll('button')].map(b=>b.textContent.trim()),
    };
  });
  console.log('avisos:'); r.avisos.forEach(a=>console.log('   ·', a));
  console.log('selects:', r.selects);
  console.log('botones:', r.botones);
  // Y el ciclo completo con el ratón: quitar y devolver.
  p.on('dialog', d=>d.accept());
  await p.click('.plant .caja [data-carrusel]');
  await p.waitForTimeout(1200);
  console.log('tras quitar → apagada =', await p.$eval('.plant .caja', c=>c.classList.contains('apagada')),
              '| pastilla =', await p.$eval('.plant .caja', c=>!!c.querySelector('.pastilla.mal')),
              '| botón =', await p.$eval('.plant .caja [data-carrusel]', b=>b.textContent.trim()));
  await p.click('.plant .caja [data-carrusel]');
  await p.waitForTimeout(1200);
  console.log('tras devolver → apagada =', await p.$eval('.plant .caja', c=>c.classList.contains('apagada')),
              '| botón =', await p.$eval('.plant .caja [data-carrusel]', b=>b.textContent.trim()));
  console.log('errores de página:', errs.length ? errs : 'ninguno');
  await nav.close();
})();
