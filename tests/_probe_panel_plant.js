const { chromium } = require('playwright');
(async () => {
  const nav = await chromium.launch();
  const pag = await nav.newPage({ viewport: { width: 1280, height: 900 } });
  pag.on('pageerror', e => console.log('  ⛔ error de página:', e.message));
  await pag.goto('http://localhost:8577/panel.html', { waitUntil: 'load' });
  await pag.click('text=Plantillas');
  await pag.waitForSelector('.plant .caja');
  console.log('tarjetas:', await pag.$$eval('.plant .caja', n => n.length));
  console.log('botones que siguen siendo botones:',
    await pag.$$eval('.plant button', n => n.map(b => Math.round(b.getBoundingClientRect().width)).join(', ')));

  // Subir una foto de verdad, por el mismo camino que el dueño: el <input type=file>.
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAGQAAACgCAIAAAD2fMTBAAAAM0lEQVR4nO3BAQ0AAADCoPdPbQ8HFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHwbXOwAAeFYcaEAAAAASUVORK5CYII=', 'base64');
  await pag.setInputFiles('.plant .caja[data-id="construye-badlands"] input[type=file]', 
    { name: 'badlands.png', mimeType: 'image/png', buffer: png });
  await pag.waitForTimeout(1200);
  const fondo = await pag.$eval('.plant .caja[data-id="construye-badlands"] .retrato', e => getComputedStyle(e).backgroundImage);
  console.log('el retrato ya tiene foto:', /url\(/.test(fondo), fondo.slice(0, 70));
  await pag.screenshot({ path: '/tmp/panel_plantillas.png', fullPage: true });

  // Y el carrusel del asistente la coge sin tocar nada más.
  const cat = await (await fetch('http://localhost:8577/api/plantillas')).json();
  const b = cat.plantillas.find(p => p.id === 'construye-badlands');
  console.log('el carrusel de mundo nuevo:', b.ficha.foto);
  await nav.close();
})();
