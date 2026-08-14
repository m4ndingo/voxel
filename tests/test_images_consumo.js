// @area: general
// @necesita: servidor, playwright
//
// Guardián del CONSUMO: lo que se publica en /images tiene que aparecer de verdad en el editor
// (marca, botones de herramienta) y en la pestaña (favicon). Y lo contrario importa igual: sin
// nada publicado, el editor tiene que verse exactamente como siempre, con sus emoji.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const UI = path.join(__dirname, '..', 'data', 'ui');       // los tests se lanzan desde la raíz

let fallos = 0;
const ok = (c, m) => { console.log((c ? '  ✔ ' : '  ✘ ') + m); if(!c) fallos++; };

(async () => {
  const previo = fs.existsSync(UI) ? fs.readdirSync(UI) : [];
  const guardado = new Map(previo.map(f => [f, fs.readFileSync(path.join(UI, f))]));
  for(const f of previo) fs.unlinkSync(path.join(UI, f));   // se parte de «nada publicado»

  const b = await chromium.launch({ args:['--use-gl=swiftshader'] });
  try{
    // ── 1. sin publicar: el editor no cambia ────────────────────────────────
    let p = await b.newPage();
    await p.goto('http://localhost:8500/?noauto=1', { waitUntil:'networkidle' });
    let r = await p.evaluate(() => ({
      imgs: document.querySelectorAll('.icono-horneado').length,
      emoji: document.querySelector('.tool[data-tool=hand]').textContent.trim(),
      marca: document.querySelector('.brand-mark').textContent.trim()
    }));
    ok(r.imgs === 0, 'sin publicar no se planta ningún icono (' + r.imgs + ')');
    ok(r.emoji.startsWith('✋'), 'la herramienta Mano conserva su emoji → ' + JSON.stringify(r.emoji));
    ok(r.marca === '◧', 'la marca conserva su carácter → ' + JSON.stringify(r.marca));
    const fav0 = await p.request.get('http://localhost:8500/favicon.ico');
    ok(fav0.status() === 404, 'sin publicar, /favicon.ico sigue dando 404 como siempre');
    await p.close();

    // ── 2. publicar marca + dos herramientas + favicon ──────────────────────
    p = await b.newPage();
    await p.goto('http://localhost:8500/images/', { waitUntil:'networkidle' });
    await p.waitForFunction("typeof catalogo !== 'undefined' && catalogo.length > 0");
    await p.evaluate(async () => {
      const a = catalogo.find(x => !x.plano) || catalogo[0];
      const doc = await fetch(a.url).then(x => x.json());
      await resuelveTex(doc);
      for(const id of ['favicon', 'marca', 't-hand', 't-paint'])
        asignado[id] = { clave:a.clave, url:a.url, nombre:a.nombre, doc, modo:'iso', ori:0, aa:true };
      pintaTodo();
    });
    p.once('dialog', d => d.accept());
    await p.evaluate(() => publicar());
    await p.waitForFunction("!document.querySelector('.estado .pri').disabled");
    await p.close();

    // ── 3. el editor los enseña ─────────────────────────────────────────────
    p = await b.newPage();
    const errores = [];
    p.on('console', m => { if(m.type() === 'error') errores.push(m.text()); });
    await p.goto('http://localhost:8500/?noauto=1', { waitUntil:'networkidle' });
    await p.waitForFunction("document.querySelectorAll('.icono-horneado').length > 0");
    r = await p.evaluate(() => {
      const de = sel => { const i = document.querySelector(sel + ' img.icono-horneado');
                          return i ? { src:new URL(i.src).pathname, ancho:i.naturalWidth } : null; };
      const paint = document.querySelector('#tools .tool[data-tool=paint]');
      return {
        marca: de('.brand-mark'),
        // `data-tool=hand` sale DOS veces (barra fija y barra flotante): las dos tienen que cambiar.
        manos: document.querySelectorAll('.tool[data-tool=hand] img.icono-horneado').length,
        manosTotal: document.querySelectorAll('.tool[data-tool=hand]').length,
        pincel: de('#tools .tool[data-tool=paint]'),
        // El pincel lleva además la muestra de color que pinta app.js y su etiqueta: ni una ni otra
        // se pueden haber perdido al quitar el emoji.
        swatch: !!paint.querySelector('.tool-swatch'),
        etiqueta: (paint.querySelector('span') || {}).textContent,
        // Una herramienta SIN publicar tiene que seguir con su emoji.
        borrar: document.querySelector('.tool[data-tool=erase]').textContent.trim()
      };
    });
    ok(r.marca && r.marca.src === '/data/ui/marca-64.png' && r.marca.ancho === 64,
       'la marca es el PNG horneado de 64 → ' + JSON.stringify(r.marca));
    ok(r.manos === r.manosTotal && r.manos === 2,
       'la herramienta Mano cambia en las DOS barras (' + r.manos + '/' + r.manosTotal + ')');
    ok(r.pincel && r.pincel.src === '/data/ui/tool-paint-32.png' && r.pincel.ancho === 32,
       'el Pincel es su PNG de 32 → ' + JSON.stringify(r.pincel));
    ok(r.swatch, 'el Pincel conserva su muestra de color (.tool-swatch)');
    ok(r.etiqueta === 'Pincel', 'y conserva su etiqueta → ' + JSON.stringify(r.etiqueta));
    ok(r.borrar.startsWith('🩹'), 'una herramienta sin publicar sigue con su emoji → ' + JSON.stringify(r.borrar));

    const fav = await p.request.get('http://localhost:8500/favicon.ico');
    ok(fav.status() === 200 && (fav.headers()['content-type'] || '').includes('png'),
       '/favicon.ico sirve el PNG de 32 (' + fav.status() + ')');
    ok(errores.length === 0, 'consola limpia' + (errores.length ? ': ' + errores.join(' | ') : ''));
  } finally {
    await b.close();
    for(const f of fs.readdirSync(UI)) fs.unlinkSync(path.join(UI, f));
    for(const [f, buf] of guardado) fs.writeFileSync(path.join(UI, f), buf);
  }
  console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nOK');
  process.exit(fallos ? 1 : 0);
})();
