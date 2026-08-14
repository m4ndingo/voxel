// Monta en /map/test la ZONA DE PRUEBAS de «caras de bloques desde scripting».
//
// Es el entregable visible del plan de `caras` + `atravesable`: cinco puestos en fila, cada uno con su
// nota post-it al lado, para poder entrar al mundo y ver con los ojos lo que los tests miden. Se deja
// plantado a proposito (el dueno pidio no borrarlo). Es IDEMPOTENTE: vuelve a poner lo mismo encima.
//
// Puestos (en fila sobre z=42, a la vista del punto de aparicion):
//   1 · hojas con setVoxel  → bloque de terreno, textura calada por la mascara de `caras`
//   2 · hojas con game.stamp → pieza fina, los mismos voxels. Tiene que verse IGUAL que el 1
//   3 · el ANTES: el mismo dibujo sin `caras` → el cubo verde macizo del que se quejo el dueno
//   4 · la mata en cruz (hierba-alta): 2 caras por voxel, se ve por los 4 lados y se atraviesa
//   5 · un muro para probar a mano `game.bloques.define(...,{atravesable:true})`
//
// Uso:  NODE_PATH=/root/voxel/node_modules node herramientas/monta_zona_caras.js
const { chromium } = require('playwright');

const Z = 42, ZN = 45, SUELO = 15;          // fila de puestos, fila de notas, primera capa de aire
const X0 = 34, X1 = 62, Z0 = 40, Z1 = 46;   // caja de la zona, para barrerla antes de repoblarla
const PUESTOS = [36, 42, 48, 54, 60];       // centros en X

const NOTAS = {
  titulo:
    'ZONA DE PRUEBAS · CARAS DE BLOQUES DESDE SCRIPTING. Cinco puestos en la fila de ahi delante, ' +
    'cada uno con su nota. De izquierda a derecha: hojas con setVoxel, las mismas con game.stamp, ' +
    'como se veian ANTES, la mata en cruz que se atraviesa, y un muro para probar atravesable.',
  p1:
    'PUESTO 1 · setVoxel("leaves",...) — hojas como BLOQUE DE TERRENO. El dibujo dice que cada voxel ' +
    'pinte solo algunas caras, y ahora la textura del bloque sale CALADA: se ve el cielo por los ' +
    'huecos. Este es el que salia como cubo verde. Barato: no gasta un dibujado por hoja.',
  p2:
    'PUESTO 2 · game.stamp("leaves",...) — las MISMAS hojas, pero como pieza fina con sus voxels de ' +
    'verdad: es lo que hace la mano al ponerlas desde la barra. Comparalo con el puesto 1, tienen que ' +
    'verse igual. Precio: cada hoja es un dibujado, asi que no sirve para un bosque.',
  p3:
    'PUESTO 3 · EL ANTES. El mismo dibujo al que le he quitado la clave "caras": un cubo verde macizo. ' +
    'Asi salia el puesto 1 hasta hoy, y por eso lo scripteado no se parecia a lo puesto a mano. Fallaba ' +
    'una linea: un voxel sin entrada se tomaba como "pinta las seis caras".',
  p4:
    'PUESTO 4 · game.stamp("hierba-alta",...) — la mata en cruz: cada voxel pinta 2 de sus 6 caras. Se ' +
    've desde los cuatro lados (da la vuelta) y se atraviesa andando, porque el dibujo trae ' +
    '"atravesable". Camina por encima: no te frena.',
  p5:
    'PUESTO 5 · ATRAVESABLE DESDE SCRIPTING. Este muro es de tablones y te frena. En la consola: ' +
    'game.bloques.define("tablones",{atravesable:true}) y lo cruzas andando; game.bloques.quitar' +
    '("tablones") lo vuelve solido. No se guarda: al recargar vuelve a frenar.',
};
for (const [k, v] of Object.entries(NOTAS))
  if (v.length > 280) { console.error('nota "' + k + '" se pasa de 280: ' + v.length); process.exit(1); }

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push(String(e)));
  await p.goto('http://localhost:8500/map/test', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid', { timeout: 120000 });
  await p.waitForTimeout(2500);

  const r = await p.evaluate(async ({ Z, ZN, SUELO, PUESTOS, NOTAS, X0, X1, Z0, Z1 }) => {
    const out = { pasos: [] };
    const paso = (m) => { out.pasos.push(m); };

    for (const m of ['leaves', 'demo-hojas-sin-caras', 'hierba-alta', 'adoquin', 'tablones'])
      await game.addMaterial(m);
    paso('materiales precargados');

    const plataforma = (cx) => {
      for (let x = cx - 1; x <= cx + 1; x++) for (let z = Z - 1; z <= Z + 1; z++) setVoxel(x, SUELO, z, 'adoquin');
    };
    const cubo = (cx, mat) => {
      for (let x = cx - 1; x <= cx + 1; x++) for (let y = SUELO + 1; y <= SUELO + 3; y++)
        for (let z = Z - 1; z <= Z + 1; z++) setVoxel(x, y, z, mat);
    };

    // ── terreno: plataformas, los dos cubos de bloques, el muro y los postes de las notas ──
    game.beginBatch();
    for (const cx of PUESTOS) plataforma(cx);
    cubo(PUESTOS[0], 'leaves');                    // 1 · calado por la mascara
    cubo(PUESTOS[2], 'demo-hojas-sin-caras');      // 3 · el antes
    for (let x = PUESTOS[4] - 1; x <= PUESTOS[4] + 1; x++)     // 5 · muro de tablones
      for (let y = SUELO + 1; y <= SUELO + 2; y++) setVoxel(x, y, Z, 'tablones');
    for (const cx of PUESTOS) setVoxel(cx, SUELO, ZN, 'adoquin');   // postes de las notas
    setVoxel(48, SUELO, 47, 'adoquin');                              // poste del cartel de entrada
    game.endBatch();
    paso('terreno colocado');

    // Retirar antes lo fino que ya hubiera en la zona: game.stamp NO es idempotente (apila una
    // estructura mas por cada pasada), asi que sin esto volver a montar duplica los draw calls.
    const dentro = (s) => s.ox >= X0 && s.ox <= X1 && s.oz >= Z0 && s.oz <= Z1 && s.oy >= SUELO && s.oy <= SUELO + 4;
    out.retiradas = 0;
    for (const s of mc.structures.slice()) if (dentro(s)) { mcRemoveStruct(s, true); out.retiradas++; }
    paso('retiradas ' + out.retiradas + ' piezas finas previas');

    // ── piezas finas: las hojas del puesto 2 y las matas del puesto 4 ──
    game.beginBatch();
    const cx2 = PUESTOS[1];
    for (let x = cx2 - 1; x <= cx2 + 1; x++) for (let y = SUELO + 1; y <= SUELO + 3; y++)
      for (let z = Z - 1; z <= Z + 1; z++) await game.stamp('leaves', x, y, z);
    const cx4 = PUESTOS[3];
    for (let x = cx4 - 1; x <= cx4 + 1; x++) for (let z = Z - 1; z <= Z + 1; z++)
      await game.stamp('hierba-alta', x, SUELO + 1, z);
    game.endBatch();
    paso('piezas finas estampadas');

    // ── notas ──
    mc.notes['48,' + SUELO + ',47'] = NOTAS.titulo;
    ['p1', 'p2', 'p3', 'p4', 'p5'].forEach((k, i) => { mc.notes[PUESTOS[i] + ',' + SUELO + ',' + ZN] = NOTAS[k]; });
    mcDirtyHeader();
    paso('notas puestas');

    await game.saveWorld();
    await new Promise(r => setTimeout(r, 1500));

    out.estructuras = Object.keys(mc.structures || {}).length;
    out.notas = Object.keys(mc.notes).length;
    // comprobacion en el sitio: los dos cubos de bloques y las matas
    const clave = (x, y, z) => mc.blockKey[mcGetVoxel(x, y, z)] || null;
    out.puesto1 = clave(PUESTOS[0], SUELO + 2, Z);
    out.puesto3 = clave(PUESTOS[2], SUELO + 2, Z);
    out.matasAtraviesan = !mcCollides(cx4, SUELO + 1.2, Z);
    return out;
  }, { Z, ZN, SUELO, PUESTOS, NOTAS, X0, X1, Z0, Z1 });

  console.log(JSON.stringify(r, null, 1));
  if (errores.length) console.log('ERRORES DE PAGINA:', errores.slice(0, 5));
  await b.close();
})();
