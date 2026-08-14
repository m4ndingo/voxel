// @area: general
// @necesita: servidor, playwright
//
// Guardián de /images: publicar hornea PNG de verdad en data/ui/ y volver a abrir la página
// restaura la asignación desde data/ui/ranuras.json (no desde los PNG, que son el derivado).
// Lo que se comprueba de los PNG es que son PNG y que traen el TAMAÑO pedido: el aspecto ya lo
// cubre `pinta`, y aquí lo que se puede romper es la tubería.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const RAIZ = path.join(__dirname, '..');                 // los tests se lanzan desde la raíz
const UI = path.join(RAIZ, 'data', 'ui');

let fallos = 0;
const ok = (c, m) => { console.log((c ? '  ✔ ' : '  ✘ ') + m); if(!c) fallos++; };

// El ancho/alto de un PNG viven en el IHDR, bytes 16..23. Sin dependencias.
function tamPng(fp){
  const b = fs.readFileSync(fp);
  if(b.slice(0, 8).toString('binary') !== '\x89PNG\r\n\x1a\n') return null;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

(async () => {
  // Se respeta lo que el dueño tenga publicado: se aparta y se devuelve al final.
  const previo = fs.existsSync(UI) ? fs.readdirSync(UI) : [];
  const guardado = new Map(previo.map(f => [f, fs.readFileSync(path.join(UI, f))]));

  const b = await chromium.launch({ args:['--use-gl=swiftshader'] });
  const errores = [];
  try{
    const p = await b.newPage();
    p.on('console', m => { if(m.type() === 'error') errores.push(m.text()); });
    await p.goto('http://localhost:8500/images/', { waitUntil:'networkidle' });
    await p.waitForFunction("typeof catalogo !== 'undefined' && catalogo.length > 0");

    // 1. Asignar dos ranuras de tamaños distintos y publicar.
    const puesto = await p.evaluate(async () => {
      const a = catalogo.find(x => !x.plano) || catalogo[0];
      const doc = await fetch(a.url).then(x => x.json());
      await resuelveTex(doc);
      asignado.favicon = { clave:a.clave, url:a.url, nombre:a.nombre, doc, modo:'iso', ori:7, aa:true };
      asignado['t-hand'] = { clave:a.clave, url:a.url, nombre:a.nombre, doc, modo:'plano', ori:0, aa:false };
      pintaTodo();
      return { clave:a.clave };
    });
    p.once('dialog', d => d.accept());
    await p.evaluate(() => publicar());
    await p.waitForFunction("!document.querySelector('.estado .pri').disabled");

    ok(fs.existsSync(path.join(UI, 'ranuras.json')), 'se escribió data/ui/ranuras.json');
    const j = JSON.parse(fs.readFileSync(path.join(UI, 'ranuras.json'), 'utf-8'));
    ok(j.favicon && j.favicon.dibujo === puesto.clave + '@7',
       'la asignación lleva la postura explícita (@7), no omitida: ' + (j.favicon || {}).dibujo);
    ok(j['t-hand'] && j['t-hand'].aa === false, 'el suavizado se guarda explícito (aa:false)');

    for(const [f, px] of [['favicon-16.png', 16], ['favicon-32.png', 32], ['tool-hand-32.png', 32]]){
      const t = tamPng(path.join(UI, f));
      ok(t && t.w === px && t.h === px, f + ' es un PNG de ' + px + '×' + px + ' → ' + JSON.stringify(t));
    }

    // 2. El servidor lo sirve por la URL fija que usan los HTML.
    const r = await p.request.get('http://localhost:8500/data/ui/favicon-32.png');
    ok(r.status() === 200 && (r.headers()['content-type'] || '').includes('png'),
       '/data/ui/favicon-32.png se sirve como PNG (' + r.status() + ')');

    // 3. Recargar restaura la asignación desde el JSON.
    await p.goto('http://localhost:8500/images/', { waitUntil:'networkidle' });
    await p.waitForFunction("typeof asignado !== 'undefined' && asignado.favicon");
    const rec = await p.evaluate(() => ({
      clave: asignado.favicon.clave, ori: asignado.favicon.ori, modo: asignado.favicon.modo,
      aa: asignado['t-hand'].aa, voxels: Object.keys(asignado.favicon.doc.voxels || {}).length
    }));
    ok(rec.clave === puesto.clave && rec.ori === 7 && rec.modo === 'iso',
       'al reabrir vuelve el dibujo con su postura y su modo → ' + JSON.stringify(rec));
    ok(rec.aa === false, 'y el suavizado apagado de la otra ranura sigue apagado');
    ok(rec.voxels > 0, 'el dibujo se recargó de verdad (' + rec.voxels + ' vóxeles)');

    // 4. Un PNG que no lo es no entra.
    const mala = await p.request.post('http://localhost:8500/api/ui', {
      data: { ranuras:{}, png:{ 'favicon-16': 'data:image/png;base64,QUJD' } } });
    ok(mala.status() === 400, 'el servidor rechaza lo que no es un PNG (' + mala.status() + ')');

    // 5. El lienzo de tamaño natural es EL PNG, no una previa: copiarlo tiene que dar el tamaño
    //    pedido. Se comprueba a dpr 1,25 porque a dpr entero no se nota — ampliar el búfer para
    //    esquivar el reescalado de pantalla daba un 32 que al copiarlo salía 64 (reportado por el
    //    dueño). Y de paso, que sea idéntico al sandbox, que es la referencia que él da por buena.
    const q = await b.newPage({ deviceScaleFactor: 1.25 });
    q.on('console', m => { if(m.type() === 'error') errores.push(m.text()); });
    await q.goto('http://localhost:8500/images/', { waitUntil:'networkidle' });
    await q.waitForFunction("typeof catalogo !== 'undefined' && catalogo.length > 0");
    const vis = await q.evaluate(async () => {
      const a = catalogo[0];
      const doc = await fetch(a.url).then(x => x.json());
      await resuelveTex(doc);
      asignado.favicon = { clave:a.clave, url:a.url, nombre:a.nombre, doc, modo:'iso', ori:0, aa:true };
      pintaTodo();
      sb.doc = doc; sb.clave = a.clave; sb.modo = 'iso'; sb.ori = 0; sb.aa = true; sb.w = sb.h = 32;
      pintaSandbox();
      const cvs = [...document.querySelectorAll('[data-ranura=favicon] .previa canvas')];
      const nat = cvs.find(c => c.dataset.px === '32' && parseFloat(c.style.width) === 32);
      const dat = c => c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      const d1 = dat(nat), d2 = dat(sbLienzo);
      let dif = d1.length === d2.length ? 0 : -1;
      if(dif === 0) for(let i = 0; i < d1.length; i++) if(d1[i] !== d2[i]) dif++;
      return { dpr:devicePixelRatio, buf:nat.width, dif,
               ampliado: cvs.filter(c => parseFloat(c.style.width) > +c.dataset.px)
                            .every(c => c.width > +c.dataset.px) };
    });
    ok(vis.dpr === 1.25, 'la página corre con la pantalla al 125 % (dpr ' + vis.dpr + ')');
    ok(vis.buf === 32, 'el lienzo de 32 sigue siendo de 32 px al copiarlo (búfer ' + vis.buf + ')');
    ok(vis.dif === 0, 'y es idéntico al del sandbox (' + vis.dif + ' subpíxeles distintos)');
    ok(vis.ampliado, 'los lienzos ampliados a propósito (×2/×4) sí llevan el búfer grande');
    await q.close();

    ok(errores.length === 0, 'consola limpia' + (errores.length ? ': ' + errores.join(' | ') : ''));
  } finally {
    await b.close();
    for(const f of fs.readdirSync(UI)) if(!guardado.has(f)) fs.unlinkSync(path.join(UI, f));
    for(const [f, buf] of guardado) fs.writeFileSync(path.join(UI, f), buf);
  }
  console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nOK');
  process.exit(fallos ? 1 : 0);
})();
