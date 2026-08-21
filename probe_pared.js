// ¿Por qué en la foto #87 las celdas de x=20 están a 0 y la ley dice 4,17? La sospecha es que NO es la ley: es que
// entre el emisor (celda [21,15,59]) y esas celdas hay sólido, y la luz tiene que rodear. La ley del informe mide
// en línea recta; el BFS anda por el aire conectado. Esto saca la geometría de esa zona para decidirlo.
const { chromium } = require('playwright');
const URL = process.argv[2] || 'http://localhost:8500/map/bugfinder2';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  await p.goto(URL, { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.grid && mc.active', null, { timeout: 180000 });
  await p.waitForTimeout(2500);
  const r = await p.evaluate(() => {
    const PASA = mcTablaLuz(), out = [];
    for (let y = 17; y >= 14; y--) {
      const capa = [];
      for (let z = 56; z <= 64; z++) {
        let fila = 'z=' + z + ' ';
        for (let x = 17; x <= 24; x++) {
          const m = mc.grid[mcIdx(x, y, z)];
          fila += (m === 0 ? '.' : (PASA[m] ? 'o' : '#'));
        }
        capa.push(fila);
      }
      out.push({ y, capa });
    }
    // ¿Cuántos vecinos por los que pase la luz tiene cada celda que el informe daba por «vista»?
    const vecinos = (x, y, z) => {
      let n = 0;
      for (const d of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]])
        if (mcInside(x+d[0], y+d[1], z+d[2]) && PASA[mc.grid[mcIdx(x+d[0], y+d[1], z+d[2])]]) n++;
      return n;
    };
    const clave = [[20,16,60],[20,16,61],[20,15,61],[20,15,62],[20,15,60],[21,15,59],[20,15,59]];
    const detalle = clave.map(c => ({ c, mat: mc.grid[mcIdx(c[0],c[1],c[2])],
      pasa: !!PASA[mc.grid[mcIdx(c[0],c[1],c[2])]], vecinosAbiertos: vecinos(c[0],c[1],c[2]) }));
    return { out, detalle, dim: mc.dim };
  });
  console.log('mundo ' + r.dim.x + '×' + r.dim.y + '×' + r.dim.z + '   ( . = vacío, o = deja pasar luz, # = SÓLIDO )\n');
  for (const capa of r.out) {
    console.log('--- y=' + capa.y + '   (x va de 17 a 24 →)');
    for (const f of capa.capa) console.log('    ' + f);
  }
  console.log('\ncelda            material  ¿pasa luz?  vecinos abiertos (de 6)');
  for (const d of r.detalle)
    console.log('  ' + JSON.stringify(d.c).padEnd(16) + String(d.mat).padEnd(9) + String(d.pasa).padEnd(12) + d.vecinosAbiertos);
  await b.close();
})();
