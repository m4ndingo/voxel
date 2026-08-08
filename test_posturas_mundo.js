// @area: editor
// @necesita: servidor, playwright
// BUG-ROT1 · el arnes headless (test_posturas_24.js) demuestra que las 24 posturas son 24 rotaciones
// distintas sobre el papel. Aqui se comprueba lo otro, que es lo que el dueno ve: que mcStructGeom, en
// el navegador de verdad y con una pieza de verdad, HORNEA 24 geometrias distintas — y que las 16 de
// siempre no se han movido.
//
// Lo que NO se hace aqui es recalcular a mano la composicion vieja para compararla: eso obliga a calcar
// las reglas de construccion del motor (el redondeo a celdas, el eje Z-arriba del editor) y se rompe por
// su cuenta. La compatibilidad se mira por otro lado: que @0..@15 sigan decodificando sin roll, y que las
// estructuras estampadas se sigan viendo pixel a pixel igual — eso ultimo lo guarda test_atlas_estructuras.js.
//
// No persiste nada: no estampa en ningun mapa, solo pide geometria horneada.
const { chromium } = require('playwright');

let fallos = 0;
const ok = (nom, cond, extra) => {
  console.log((cond ? '  ok  ' : '  FALLA  ') + nom + (extra ? '   (' + extra + ')' : ''));
  if (!cond) fallos++;
};

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push(String(e)));

  await p.goto('http://localhost:8500/map/test', { waitUntil: 'load', timeout: 180000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.grid && mc.blockKey && mc.blockKey.length>1', null, { timeout: 240000 });

  const r = await p.evaluate(async () => {
    // La pieza tiene que ser ASIMETRICA en los tres ejes: un 16³ macizo (o una pieza con espejo) se ve
    // igual puesta de mil maneras y aprobaria el test sin demostrar nada. La flor y la diana valen; la
    // hierba, por ejemplo, NO (es un cubo macizo de 4096 voxels y da UNA sola geometria en las 24).
    const claves = (mc.blocks || []).map(x => mcClaveBase(x.key));
    const base = claves.find(k => /flor-amarilla|flor-roja|diana/.test(k)) || claves[1];

    const huella = [], firmas = [];
    for (let ori = 0; ori < 24; ori++) {
      const g = await mcStructGeom(base, ori);
      // `bits` es la COLISION y en una pieza atravesable (la flor lo es) va a ceros a proposito; la
      // ocupacion de verdad —la que se apunta y se rompe— vive en `bitsAim`.
      const ocupa = g.bitsAim || g.bits;
      // La firma es DONDE acaban los voxels solidos, no el VBO: el VBO depende del atlas y del culling,
      // que cambian por motivos que no son el giro.
      const celdas = [];
      for (let i = 0; i < ocupa.length; i++) if (ocupa[i]) celdas.push(i);
      firmas.push(g.fdim.join('x') + '#' + celdas.join(','));
      huella.push(g.fdim.slice());
    }

        // Y cuantos voxels solidos hay en cada postura: girar no puede perder ni inventar ninguno.
    const cuenta = [];
    for (let ori = 0; ori < 24; ori++) {
      const g = await mcStructGeom(base, ori), ocupa = g.bitsAim || g.bits;
      let n = 0; for (let i = 0; i < ocupa.length; i++) if (ocupa[i]) n++;
      cuenta.push(n);
    }
    // Los codigos viejos tienen que seguir queriendo decir «sin roll»: es lo que llevan escrito dentro
    // los mundos ya guardados.
    const partes = [];
    for (let ori = 0; ori < 24; ori++) partes.push(mcOriParts(ori).slice());

    return { clave: base, firmas, huella, cuenta, partes };
  });

  console.log('\npieza de prueba: ' + r.clave + '  (' + r.cuenta[0] + ' voxels finos, huella ' + r.huella[0].join('x') + ')');

  // ── A · las 24 posturas dan 24 geometrias ────────────────────────────────────────────────────────
  console.log('\nA · el motor hornea las 24');
  ok('mcStructGeom acepta las 24 posturas', r.firmas.length === 24 && r.firmas.every(f => f), r.firmas.length + ' horneadas');
  const distintas = new Set(r.firmas);
  // Guarda contra un falso verde: con una pieza simetrica todas las posturas se verian iguales y el
  // resto del test no significaria nada. Con el esquema VIEJO esta pieza ya daba 16.
  ok('la pieza elegida distingue posturas (si no, el test no probaria nada)',
    new Set(r.firmas.slice(0, 16)).size === 16, new Set(r.firmas.slice(0, 16)).size + ' de las 16 viejas son distintas');
  ok('...y salen 24 geometrias DISTINTAS', distintas.size === 24, distintas.size + ' distintas');

  // Las 8 nuevas son precisamente las que faltaban: ninguna repite una de las 16 de siempre.
  const viejasSet = new Set(r.firmas.slice(0, 16));
  const nuevasRepetidas = r.firmas.slice(16).filter(f => viejasSet.has(f));
  ok('las 8 nuevas (@16..@23) no repiten ninguna de las 16 de siempre',
    nuevasRepetidas.length === 0, nuevasRepetidas.length + ' repetidas');

  // ── B · nada se pierde y lo guardado sigue valiendo ──────────────────────────────────────────────
  console.log('\nB · compatibilidad con los mundos guardados');
  // Ojo: aqui NO se compara mcOriDims con `fdim`. mcOriDims habla de CELDAS de bloque y fdim de voxels
  // finos AJUSTADOS al contenido, mientras que el giro se hace dentro de la caja REDONDEADA a celdas:
  // una pieza de 11 de ancho en una caja de 16 deja hueco, y al girarla el ajustado sale 10 u 11 segun
  // por donde caiga. Que mcOriDims cuadra con la composicion se comprueba en test_posturas_24.js (D).
  ok('girar no pierde ni inventa voxels', new Set(r.cuenta).size === 1, r.cuenta[0] + ' voxels en las 24');

  // Compatibilidad con lo ya guardado: @0..@15 tienen que seguir siendo «sin roll». La prueba de que
  // ademas se VEN igual la lleva test_atlas_estructuras.js, que compara pixeles de estructuras estampadas.
  const conRoll = [];
  for (let ori = 0; ori < 16; ori++) {
    const [roll, tilt, yaw] = r.partes[ori];
    if (roll !== 0 || tilt !== ((ori >> 2) & 3) || yaw !== (ori & 3)) conRoll.push('@' + ori);
  }
  ok('@0..@15 siguen siendo (roll=0, vuelco=ori>>2, giro=ori&3)', conRoll.length === 0, conRoll.join(' '));
  ok('las 8 nuevas van detras, todas con roll',
    r.partes.slice(16).every(([roll]) => roll === 1), r.partes.slice(16).map(x => x.join('')).join(' '));

  // ── C · las tumbadas de lado ya tienen sus 4 giros ───────────────────────────────────────────────
  console.log('\nC · lo que faltaba: la pieza tumbada de lado');
  // Las posturas 16..23 son las dos caras +X/−X arriba, con sus 4 giros: 8 huellas todas «de lado».
  const deLado = new Set(r.firmas.slice(16, 24));
  ok('las 8 de lado son 8 posturas distintas entre si', deLado.size === 8, deLado.size + ' distintas');

  ok('sin errores de pagina', errores.length === 0, errores.join(' | '));

  console.log('\n' + (fallos ? fallos + ' fallo(s)' : 'todo ok'));
  await b.close();
  process.exit(fallos ? 1 : 0);
})();