// ¿DÓNDE cambia la imagen entre dos fotos? Mapa de calor de la diferencia, para saber si el "parchazo" del dueño
// está en lo que ilumina la mano (pared cercana) o en el mundo entero. Usa el canvas del navegador para decodificar
// los PNG, que es lo único que hay a mano sin dependencias.
const { chromium } = require('playwright');
const A = process.argv[2], B = process.argv[3];
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto('http://localhost:8500/map/test', { waitUntil: 'domcontentloaded', timeout: 120000 });
  const r = await p.evaluate(async ([ua, ub]) => {
    const carga = u => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = u; });
    const [ia, ib] = await Promise.all([carga(ua), carga(ub)]);
    const px = im => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
      const x = c.getContext('2d'); x.drawImage(im, 0, 0); return x.getImageData(0, 0, c.width, c.height).data; };
    const da = px(ia), db = px(ib), W = ia.width, H = ia.height;
    const N = 16, mapa = [], celda = [];
    for (let j = 0; j < N; j++) { const fila = [];
      for (let i = 0; i < N; i++) {
        let s = 0, n = 0, y0 = (j * H / N) | 0, y1 = ((j + 1) * H / N) | 0, x0 = (i * W / N) | 0, x1 = ((i + 1) * W / N) | 0;
        for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) { const k = (y * W + x) * 4;
          s += Math.abs(da[k] - db[k]) + Math.abs(da[k + 1] - db[k + 1]) + Math.abs(da[k + 2] - db[k + 2]); n++; }
        fila.push(+(s / n).toFixed(1)); celda.push({ i, j, v: s / n });
      }
      mapa.push(fila);
    }
    // luma media de cada foto, por si el cambio es global
    const luma = d => { let s = 0; for (let k = 0; k < d.length; k += 4 * 7) s += 0.299 * d[k] + 0.587 * d[k + 1] + 0.114 * d[k + 2]; return s / (d.length / (4 * 7)); };
    return { mapa, W, H, la: +luma(da).toFixed(2), lb: +luma(db).toFixed(2), peores: celda.sort((x, y) => y.v - x.v).slice(0, 6) };
  }, [A, B]);
  console.log('luma media: ' + r.la + ' → ' + r.lb + '   (' + (100 * (r.lb - r.la) / r.la).toFixed(1) + ' %)');
  console.log('mapa de la diferencia (16×16, ' + r.W + '×' + r.H + ' px):');
  const esc = ' .:-=+*#%@';
  for (const fila of r.mapa) console.log('  ' + fila.map(v => esc[Math.min(9, Math.round(v / 4))]).join(''));
  console.log('zonas que más cambian (col,fila de 16): ' + r.peores.map(o => '(' + o.i + ',' + o.j + ')=' + o.v.toFixed(1)).join('  '));
  await b.close();
})();
