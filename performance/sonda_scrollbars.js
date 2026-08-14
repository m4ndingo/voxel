// ¿El tema de las barras de scroll llega a TODAS las páginas, y con qué colores de verdad?
//
// Dos avisos que costaron un rato:
//  · El Chromium headless arranca con `--hide-scrollbars`: sin `ignoreDefaultArgs` no se ve NADA
//    y parece que el CSS no ha entrado.
//  · A `deviceScaleFactor` > 1 la captura de un elemento pinta la banda de la barra en blanco —es
//    artefacto de la captura, no lo que se ve. Por eso aquí se mide a dpr 1 y por PÍXEL, no a ojo.
const { chromium } = require('/root/voxel/node_modules/playwright');

const PAGS = [
  ['editor', 'http://localhost:8500/?noauto=1'],
  ['mapas',  'http://localhost:8500/map/'],
  ['fotos',  'http://localhost:8500/fotos'],
  ['images', 'http://localhost:8500/images/'],
  ['wiki',   'http://localhost:8500/wiki/']
];

(async () => {
  const b = await chromium.launch({ args:['--use-gl=swiftshader'],
                                    ignoreDefaultArgs:['--hide-scrollbars'] });
  const lector = await b.newPage();
  const colores = async (buf) => lector.evaluate(async (b64) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const hex = (x, y) => { const d = g.getImageData(x, y, 1, 1).data;
      return '#' + [d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, '0')).join(''); };
    const x = img.width - 4;                       // dentro de la barra, pegado al borde
    const vistos = new Set();
    for(let y = 4; y < img.height - 4; y++) vistos.add(hex(x, y));
    return [...vistos].sort();
  }, buf.toString('base64'));

  for(const [nom, url] of PAGS){
    const p = await b.newPage({ viewport:{ width:600, height:400 } });
    await p.goto(url, { waitUntil:'domcontentloaded' });
    const info = await p.evaluate(async () => {
      const d = document.createElement('div'); d.id = 'sondaScroll';
      d.style.cssText = 'position:fixed;right:0;top:0;width:100px;height:300px;overflow-y:scroll;'
        + 'z-index:99999;background:#161a24';
      d.innerHTML = '<div style="height:1600px"></div>';
      document.body.appendChild(d);
      d.scrollTop = 200;                            // el pulgar a media altura, para verlo entero
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      return {
        hoja: [...document.styleSheets].some(s => (s.href || '').includes('scrollbars.css')),
        ancho: d.offsetWidth - d.clientWidth,
        sbColor: getComputedStyle(d).scrollbarColor
      };
    });
    const vistos = await colores(await p.locator('#sondaScroll').screenshot());
    console.log(nom.padEnd(7), JSON.stringify({ ...info, pintado: vistos }));
    await p.close();
  }
  await b.close();
})();
