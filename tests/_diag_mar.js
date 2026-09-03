// Diagnóstico BUG-PLANT2: el mar desaparece al recargar y el spawn queda enterrado.
const { chromium } = require('playwright');
const BASE = 'http://localhost:8500';
const SLUG = 'zz-mar-' + Date.now();

async function api(r, c, m) {
  const q = await fetch(BASE + r, { method: m || (c !== undefined ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json' }, body: c !== undefined ? JSON.stringify(c) : undefined });
  const t = await q.text(); return { code: q.status, d: t ? JSON.parse(t) : {} };
}

const censo = () => {
  if (typeof mc === 'undefined' || !mc.grid) return null;
  const porId = {};
  for (let i = 0; i < mc.grid.length; i++) { const v = mc.grid[i]; if (v) porId[v] = (porId[v] || 0) + 1; }
  const claves = {};
  for (const id in porId) {
    const b = (mc.blocks || []).find(b => b.id == id);
    claves[(b && b.key) || ('id' + id)] = porId[id];
  }
  return { total: Object.values(porId).reduce((a, b) => a + b, 0), claves,
           paleta: (mc.blocks || []).length, spawn: mc.spawn, pos: mc.pos && mc.pos.map(Math.round),
           dim: mc.dim };
};

(async () => {
  const nav = await chromium.launch({ args: ['--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader'] });
  const pag = await nav.newPage();
  pag.on('console', m => { if (/generador-mundo/.test(m.text())) console.log('  [nav]', m.text()); });

  await api('/api/mundos/crear', { nombre: SLUG, lado: 128, plantilla: 'construye-oceanos-y-playas' });
  await pag.goto(BASE + '/map/' + SLUG, { waitUntil: 'load', timeout: 60000 });
  for (let i = 0; i < 120; i++) {
    await pag.waitForTimeout(2000);
    if ((await api(`/api/mundos/${SLUG}/plantilla`)).d.generado) break;
  }
  await pag.waitForTimeout(3000);
  const antes = await pag.evaluate(censo);
  console.log('\n── RECIÉN GENERADO ──');
  console.log('total:', antes.total, '| paleta:', antes.paleta, '| spawn:', JSON.stringify(antes.spawn), '| pos:', antes.pos);
  console.log('agua:', Object.entries(antes.claves).filter(([k]) => /agua|water/i.test(k)));

  // Lo que quedó EN DISCO
  const cab = await api(`/api/mundo?map=${SLUG}`);
  console.log('\n── EN DISCO (cabecera) ──');
  console.log('dim:', JSON.stringify(cab.d.dim), '| spawn:', JSON.stringify(cab.d.spawn));
  const pal = cab.d.palette || cab.d.blocks || [];
  console.log('paleta en disco:', pal.length, '| con agua:', JSON.stringify(pal.filter(p => /agua/i.test(JSON.stringify(p)))));

  console.log('\n── TRAS RECARGAR ──');
  await pag.goto(BASE + '/map/' + SLUG, { waitUntil: 'load', timeout: 60000 });
  await pag.waitForTimeout(9000);
  const desp = await pag.evaluate(censo);
  console.log('total:', desp.total, '| paleta:', desp.paleta, '| spawn:', JSON.stringify(desp.spawn), '| pos:', desp.pos);
  console.log('agua:', Object.entries(desp.claves).filter(([k]) => /agua|water/i.test(k)));

  console.log('\n── DIFERENCIAS por material ──');
  const todas = new Set([...Object.keys(antes.claves), ...Object.keys(desp.claves)]);
  for (const k of [...todas].sort()) {
    const a = antes.claves[k] || 0, b = desp.claves[k] || 0;
    if (a !== b) console.log(`  ${k}: ${a} → ${b}  (${b - a})`);
  }

  await nav.close();
  console.log('\nborrar:', (await api('/api/mundos/' + SLUG, undefined, 'DELETE')).code);
})();
