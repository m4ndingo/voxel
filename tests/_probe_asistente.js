// Sonda de un rato: el asistente de «mundo nuevo».
//  · el pie no se mueve al pasar fichas
//  · CREAR nace apagado hasta que hay nombre
//  · los tamaños que la plantilla no aguanta salen APAGADOS y la selección se baja sola
const { chromium } = require('playwright');
const BASE = process.env.VOXEL_URL || 'http://localhost:8500';

(async () => {
  const nav = await chromium.launch();
  const p = await nav.newPage();
  await p.setViewportSize({ width: 1280, height: 760 });
  await p.goto(BASE + '/map', { waitUntil: 'load', timeout: 60000 });
  await p.click('#btn-nuevo');
  await p.waitForSelector('.asis-tira .ficha');

  const btn = await p.$('#a-crear');
  console.log('CREAR sin nombre, ¿apagado?', await btn.isDisabled() ? '✓ sí' : '⛔ NO');
  await p.fill('#a-nom', 'zz prueba');
  console.log('con nombre, ¿encendido?', await btn.isDisabled() ? '⛔ NO' : '✓ sí');
  await p.fill('#a-nom', '   ');
  console.log('con espacios, ¿apagado otra vez?', await btn.isDisabled() ? '✓ sí' : '⛔ NO');
  await p.fill('#a-nom', 'zz prueba');

  const chips = () => p.$$eval('#a-lados button', (b) => b.map(x =>
    x.textContent + (x.disabled ? '(apagado)' : '') + (x.classList.contains('on') ? '←ELEGIDO' : '')).join(' '));
  const pie = async () => (await p.$('.asis-pie')).boundingBox();
  const antes = await pie();
  console.log('tamaños con la 1ª ficha:', await chips());

  // La ciudad es la que se comió la memoria: su ficha dice ladoMax 128.
  const iCiudad = await p.$$eval('.asis-tira .ficha', (f) =>
    f.findIndex(x => x.dataset.id === 'construye-fornite-tilted-towers'));
  await p.$$eval('.asis-tira .ficha', (f, i) => f[i].click(), iCiudad);
  await p.waitForTimeout(1200);
  console.log('tamaños con la ciudad:  ', await chips());

  const desp = await pie();
  console.log('pie antes y=' + antes.y + ' · después y=' + desp.y,
              antes.y === desp.y ? '  ✓ no se movió' : '  ⛔ se movió');
  const tiraX = await p.$eval('#a-tira', (e) => e.scrollLeft);
  console.log(tiraX > 10 ? '  ✓ la tira sí se desplazó (' + Math.round(tiraX) + ' px)' : '  ⛔ la tira no se movió');

  // Y el servidor prohíbe lo que el cliente apaga.
  const r = await p.evaluate(async () => {
    const rp = await fetch('/api/mundos/crear', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: 'zz sonda tope', lado: 256, plantilla: 'construye-fornite-tilted-towers' }) });
    return { c: rp.status, t: (await rp.text()).slice(0, 160) };
  });
  console.log(r.c === 409 ? '  ✓ el servidor rechaza 256 para la ciudad' : '  ⛔ el servidor lo aceptó', r.c, r.t);

  await nav.close();
})();
