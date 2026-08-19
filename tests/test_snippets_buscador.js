// @area: general
// @necesita: servidor
// REQ-SNP6 · Buscar DENTRO de los snippets y saber quien LLAMA a uno (`/api/snippets?q=` y `?usa=`).
//
// Las dos preguntas se contestan en el servidor, que es donde estan los ficheros: el listado no trae el
// codigo y bajarselo entero en cada tecla son ~1,5 MB (solo 'mundo-autoarranque' son 300 KB).
//
// Lo que de verdad se prueba aqui es la distincion LLAMADA vs MENCION, que es la que hace util el
// panel «Usos»: `game.snippet('x')` ejecuta; el id suelto entre comillas (una tabla de nombres, un
// comentario) NO. Renombrar rompe las dos, pero solo la primera se ve fallar. Y ojo: la llamada tambien
// se escribe `ejecutarSnippet('x')` (el ayudante de 'redstone-arranque'), asi que el nombre de la
// funcion NO se ancla por delante — pedir `game.snippet` exacto contaba esas como simples menciones.
//
// Necesita el servidor vivo:  python3 server.py 8500     (otro puerto: node test_snippets_buscador.js 8599)
// Solo escribe con ids `zz-test-…` y los retira al acabar (incluso si falla algo), asi que no toca
// ningun snippet del dueno.
const http = require('http');

let fallos = 0;
const ok = (nom, cond, extra) => {
  console.log((cond ? '  ok  ' : '  FALLA  ') + nom + (extra ? '   (' + extra + ')' : ''));
  if (!cond) fallos++;
};
const PUERTO = +(process.argv[2] || 8500);

function pide(metodo, ruta, cuerpo) {
  return new Promise((res, rej) => {
    const datos = cuerpo === undefined ? null : Buffer.from(JSON.stringify(cuerpo), 'utf8');
    const r = http.request({
      host: '127.0.0.1', port: PUERTO, path: ruta, method: metodo,
      headers: datos ? { 'Content-Type': 'application/json', 'Content-Length': datos.length } : {}
    }, (rp) => {
      let b = ''; rp.setEncoding('utf8');
      rp.on('data', (c) => { b += c; });
      rp.on('end', () => { let j = null; try { j = JSON.parse(b); } catch (e) {} res({ code: rp.statusCode, d: j, raw: b }); });
    });
    r.on('error', rej);
    if (datos) r.write(datos);
    r.end();
  });
}

const DIANA = 'zz-test-diana';
const PIEZAS = [
  // quien LLAMA (tres formas distintas, las tres ejecutan)
  { id: 'zz-test-llama-1', name: 'ZZ llama 1', code: '// cabecera\nawait game.snippet("' + DIANA + '");\n' },
  { id: 'zz-test-llama-2', name: 'ZZ llama 2', code: "await ejecutarSnippet('" + DIANA + "');\n" },
  { id: 'zz-test-llama-3', name: 'ZZ llama 3', code: 'game.snippet( `' + DIANA + '` )\n' },
  // quien solo MENCIONA
  { id: 'zz-test-menciona', name: 'ZZ menciona', code: 'const tabla = { "' + DIANA + '": 1 };  // pendiente\n' },
  // quien no tiene nada que ver, pero comparte un texto raro que se busca abajo
  { id: 'zz-test-ajeno', name: 'ZZ ajeno', code: 'let x = 1;\n// zzPalabraRarisima aqui\nlet y = 2;\n' },
  { id: DIANA, name: 'ZZ diana', code: '// a este llaman los de arriba\ntoast("zzPalabraRarisima");\n' },
];

(async () => {
  for (const s of PIEZAS) await pide('POST', '/api/snippets', s);

  console.log('\n§1 · ?usa=<id> · quien LLAMA y quien solo MENCIONA');
  {
    const r = await pide('GET', '/api/snippets?usa=' + DIANA);
    const mios = (r.d || []).filter(s => s.id.startsWith('zz-test-'));
    const t = Object.fromEntries(mios.map(s => [s.id, s.tipo]));
    ok('responde 200 con una lista', r.code === 200 && Array.isArray(r.d), 'code=' + r.code);
    ok('game.snippet("x") es LLAMADA', t['zz-test-llama-1'] === 'llamada', JSON.stringify(t));
    ok('ejecutarSnippet(\'x\') tambien es LLAMADA (no se ancla el nombre)', t['zz-test-llama-2'] === 'llamada');
    ok('game.snippet( `x` ) con espacios y backtick tambien', t['zz-test-llama-3'] === 'llamada');
    ok('el id suelto entre comillas es MENCION', t['zz-test-menciona'] === 'mencion');
    ok('quien no lo nombra NO sale', !t['zz-test-ajeno'], JSON.stringify(t));
    ok('el snippet no se usa a si mismo', !t[DIANA]);
    ok('las llamadas van antes que las menciones',
      mios.findIndex(s => s.tipo === 'mencion') === mios.length - 1, mios.map(s => s.id + ':' + s.tipo).join(' '));
    const uno = mios.find(s => s.id === 'zz-test-llama-1');
    ok('dice en que linea esta y la ensena', uno && uno.linea === 2 && /game\.snippet/.test(uno.muestra || ''),
      uno && (uno.linea + ' ' + uno.muestra));
  }

  console.log('\n§2 · ?q=<texto> · buscar dentro del codigo');
  {
    const r = await pide('GET', '/api/snippets?q=zzPalabraRarisima');
    const ids = (r.d || []).map(s => s.id);
    ok('salen los DOS que la dicen, sea comentario o codigo',
      ids.includes('zz-test-ajeno') && ids.includes(DIANA), JSON.stringify(ids));
    ok('no arrastra a los demas', !ids.includes('zz-test-menciona'), JSON.stringify(ids));
    const a = (r.d || []).find(s => s.id === 'zz-test-ajeno');
    ok('marca linea, muestra y de donde viene', a && a.linea === 2 && a.donde === 'codigo' && /zzPalabraRarisima/.test(a.muestra),
      a && JSON.stringify([a.linea, a.donde, a.muestra]));
  }
  {
    // El rotulo y el id cuentan tambien: buscar «diana» y no ver el snippet que se llama asi seria absurdo.
    const r = await pide('GET', '/api/snippets?q=' + DIANA);
    const yo = (r.d || []).find(s => s.id === DIANA);
    ok('el propio id/rotulo tambien casa', !!yo, JSON.stringify((r.d || []).map(s => s.id)));
    const q2 = await pide('GET', '/api/snippets?q=ZZPALABRARARISIMA');
    ok('no distingue mayusculas', (q2.d || []).some(s => s.id === 'zz-test-ajeno'));
    const q3 = await pide('GET', '/api/snippets?q=zzz-que-no-existe-zzz');
    ok('sin coincidencias devuelve lista vacia, no error', q3.code === 200 && Array.isArray(q3.d) && q3.d.length === 0,
      'code=' + q3.code + ' n=' + (q3.d || []).length);
  }

  console.log('\n§3 · sin query, el listado de siempre');
  {
    const r = await pide('GET', '/api/snippets');
    const uno = (r.d || [])[0] || {};
    ok('sigue devolviendo TODOS', (r.d || []).length >= PIEZAS.length, 'n=' + (r.d || []).length);
    ok('con las mismas claves de siempre', ['id', 'name', 'lines', 'savedAt', 'protegido'].every(k => k in uno),
      JSON.stringify(Object.keys(uno)));
    ok('y sin el codigo dentro (son ~1,5 MB entre todos)', !('code' in uno));
  }
})()
  .catch(e => { console.error(e); fallos++; })
  .then(async () => {
    for (const s of PIEZAS) await pide('DELETE', '/api/snippets/' + s.id);   // la limpieza va SIEMPRE
    const quedan = ((await pide('GET', '/api/snippets')).d || []).filter(s => s.id.startsWith('zz-test-'));
    ok('\n  limpieza: no queda ningun zz-test-', quedan.length === 0, JSON.stringify(quedan.map(s => s.id)));
    console.log('\n' + (fallos ? '❌' : '✅') + '  ' + fallos + ' fallos');
    process.exit(fallos ? 1 : 0);
  });
