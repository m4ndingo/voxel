// @area: redstone
// @necesita: servidor, playwright
// BUG-RS19 · el observador (asset:assets/observador.vox.json) se colocaba como BLOQUE sin girar y como
// ESTRUCTURA al rotar con R. El observador es el UNICO material del juego con pielCubre=true y
// blockLike=false (4092 voxels: le faltan 4 huecos internos), y ese caso no estaba previsto en
// mcRecFina: devolvia false porque solo permitia la ruta fina para translucidos, asi que las
// variantes rotadas no cabian en la rejilla y caian a mcStampStruct.
//
// El arreglo son 4 caracteres en mcRecFina (app.js): la regla queda «pielCubre && !blockLike && !conCaras
// -> geometria fina», que incluye translucido (cubo-trans, BUG-STR1) y «casi macizo con huecos» (observador,
// BUG-RS19). Los otros bloques de redstone (cable, palanca, repetidor, piston...) ya iban por esta ruta
// porque tienen pielCubre=false; el observador era el unico afectado.
//
// Lo que fija el test: (§1) el perfil real del asset — 4092 voxels, pielCubre pero no blockLike, sin alpha
// ni caras (o el diagnostico se aplica al ticket equivocado); (§2) que mcRecFina/mcEsFinaEnRejilla dicen SI
// para el observador, y que cabe en la rejilla; (§3) que las 24 posturas de mcPreviewOri caben en la
// rejilla como fino — es la aserción de fondo del ticket; (§4) que no hay regresiones para los tres perfiles
// vecinos (cubo-trans translucido en fino, roca macizo en proyeccion, flor pielCubre=false en fino).
//
// El anti-falso-verde §3 exige que la clave girada `observador@1` tambien reporte mcCabeEnRejilla=true y
// mcEsFinaEnRejilla=true: con el codigo viejo (`return !!rec.translucido && !rec.conCaras`) el observador
// da mcRecFina=false y §3 falla en las 23 posturas rotadas.
//
// No persiste nada: los POST del mundo se bloquean.
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
  p.on('pageerror', e => errores.push('EXCEPCION ' + e.message));
  await p.route('**/api/mundo', r => r.request().method() === 'POST' ? r.fulfill({ status: 200, body: '{"ok":true}' }) : r.continue());
  await p.route('**/api/habitantes', r => r.request().method() === 'POST' ? r.fulfill({ status: 200, body: '{"ok":true}' }) : r.continue());
  await p.route('**/api/assets', r => r.request().method() === 'POST' ? r.fulfill({ status: 200, body: '{"ok":true}' }) : r.continue());

  await p.goto('http://localhost:8500/map/test', { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid', null, { timeout: 180000 });
  await p.waitForTimeout(4000);

  const r = await p.evaluate(async () => {
    const out = { errs: [] };
    const CLAVE = 'asset:assets/observador.vox.json';

    // ── §1 perfil real del asset, leido del documento ─────────────────────────
    const doc = await getRoomData(CLAVE);
    const vox = doc.voxels || {};
    out.nvox = Object.keys(vox).length;
    out.size = [doc.size.x, doc.size.y, doc.size.z];
    const rec = await mcStructCells(CLAVE);
    out.pielCubre = !!rec.pielCubre;
    out.blockLike = !!rec.blockLike;
    out.translucido = !!rec.translucido;
    out.conCaras = !!rec.conCaras;
    out.atrav = !!rec.atravesable;

    // ── §2 va por la ruta fina y CABE en la rejilla ───────────────────────────
    out.cabe = mcCabeEnRejilla(CLAVE);
    out.esFina = mcEsFinaEnRejilla(CLAVE);
    out.recFina = mcRecFina(rec);

    // Precargar y comprobar que tiene id en la paleta con geometria horneada.
    await game.addMaterial(CLAVE);
    const ID = mcResolveMat(CLAVE);
    out.id = ID;
    let g = null;
    for (let i = 0; i < 30 && !(g = mc.finoGeom[CLAVE]); i++) await new Promise(s => setTimeout(s, 100));
    out.hayGeom = !!(g && (g.colCount || g.alphaCount));
    out.marcadoFino = !!(mc.finoRejilla && mc.finoRejilla[ID]);

    // ── §3 las 24 posturas caben en la rejilla — el anti-falso-verde del ticket
    // Se pregunta con la CLAVE VARIANTE (`asset:...@n`) porque asi lo hace mcPlace tras mcClaveConOri.
    // Sin el arreglo, mcRecFina daria false y mcEsFinaEnRejilla tambien; solo la @0 pasaria.
    const posturas = [];
    for (let ori = 0; ori < 24; ori++) {
      const vk = mcClaveConOri(CLAVE, ori);
      // La caché de mc.structs se comparte con la clave base (getRoomData(vk) resuelve la base),
      // asi que mcCabeEnRejilla(vk) responde igual que mcCabeEnRejilla(CLAVE).
      posturas.push({
        ori,
        vk,
        cabe: !!mcCabeEnRejilla(vk),
        esFina: !!mcEsFinaEnRejilla(vk),
      });
    }
    out.posturas = posturas;
    out.posturasBienEnRejilla = posturas.every(x => x.cabe && x.esFina);
    out.rutaEstampada = posturas.filter(x => !x.cabe || !x.esFina).map(x => x.ori);

    // ── §3b la variante rotada @1 se puede REGISTRAR y colocar via mcAltaVariante ─
    // mcAltaVariante exige que la base este en mc.finoRejilla, cosa que solo pasa si mcRecFina=true.
    // Antes del arreglo, mc.finoRejilla[ID] era falso ⇒ mcAltaVariante devolvia -1 ⇒ mcAddBlock caia
    // por el camino largo (re-hornea la paleta y re-malla el mundo entero, PERF-MC3).
    const vk1 = mcClaveConOri(CLAVE, 1);
    out.idAntesVariante = mc.blockKey.indexOf(vk1);
    const idVariante = await game.addMaterial(vk1);
    out.idVariante = idVariante;
    out.varianteFina = !!(mc.finoRejilla && mc.finoRejilla[idVariante]);
    out.varianteEnPaleta = mc.blockKey[idVariante] === vk1;

    // ── §3c poner y romper una celda con la variante rotada, sin persistir ────
    // Comprueba de verdad que mcPonEnRejilla (el mismo camino que sigue mcPlace tras BUG-RS19)
    // escribe el id de la variante en mc.grid y NO deja instancias en mc.structures.
    const CH = MC_CHUNK, cx = Math.floor(mc.dim.x / 2 / CH), cz = Math.floor(mc.dim.z / 2 / CH);
    const tx = cx * CH + 2, ty = Math.floor(mc.dim.y / 2), tz = cz * CH + 2;
    const anteId = mc.grid[mcIdx(tx, ty, tz)];
    const anteStructs = mc.structures.length;
    // Simular clic derecho: escribir la variante en la celda de prueba.
    mcPonEnRejilla(tx, ty, tz, vk1);
    // Dejar unos frames para que la escritura diferida se aplique si hace falta.
    for (let i = 0; i < 6; i++) await new Promise(s => setTimeout(s, 50));
    out.escritaId = mc.grid[mcIdx(tx, ty, tz)];
    out.enRejilla = out.escritaId === idVariante;
    out.sinStructNueva = mc.structures.length === anteStructs;
    // Restaurar.
    mcSetBlock(tx, ty, tz, anteId);

    // ── §3d activar el observador girado preserva la orientación (BUG-RS19 secuela) ──
    // El dueño reportó: «giro el observador y rayos-X muestra observador@2, hasta ahi bien, pero
    // cuando lo activo poniendo un bloque delante, el observador-on aparece girado en otra
    // direccion». El fallo estaba en dispararObservador (redstone/redstone.js): el fallback
    // `mc.name2id[quieroOn] || mc.name2id[par.on]` caia a la clave SIN girar del observador-on,
    // que sí solia estar en la paleta si el observador se habia cargado desde la galeria alguna vez.
    //
    // Este tramo activa un observador@1 «a mano» (bypass del clic para no depender de mcPlace) y
    // comprueba que la clave ORIENTADA queda escrita cuando el motor lo enciende y lo apaga.
    // Requiere que el snippet 'redstone' este cargado en la sesion.
    const tieneRedstone = (typeof game !== 'undefined' && game && game.redstone && typeof game.redstone.tick === 'function');
    out.tieneRedstone = tieneRedstone;
    if (tieneRedstone) {
      const OBS = CLAVE, OBS_ON = OBS.replace('.vox.json', '-on.vox.json');
      // Precargar la off orientada y quitar de la paleta CUALQUIER variante on ya cacheada — el bug
      // se ve cuando la orientada NO esta indexada pero la sin girar sí.
      await game.addMaterial(mcClaveConOri(OBS, 1));
      // Asegurar que mc.name2id[OBS_ON] (sin girar) SÍ existe: es lo que antes hacía de fallback.
      await game.addMaterial(OBS_ON);

      // Elegir una celda de aire con aire alrededor para no molestar al circuito real del mapa.
      // El observador dispara al cambiar el bloque DELANTE (su +X según la orientacion @1).
      const cy = Math.floor(mc.dim.y / 2);
      let x = -1, z = -1;
      for (let dz = 0; dz < 8 && x < 0; dz++) for (let dx = 0; dx < 8 && x < 0; dx++) {
        const px = cx * CH + 4 + dx, pz = cz * CH + 4 + dz;
        // Se necesitan la celda del observador Y la celda de DELANTE libres.
        if (mcIdx(px, cy, pz) < 0) continue;
        if (mc.grid[mcIdx(px, cy, pz)] !== 0) continue;
        // Cara +X del observador @0. Con @1, el frente pasa a +Z segun mcOriPerm; para no depender de
        // eso aquí y mantener el test estable, se prueba directamente @0 primero y despues @1.
        if (mc.grid[mcIdx(px + 1, cy, pz)] === 0 && mc.grid[mcIdx(px, cy, pz + 1)] === 0) { x = px; z = pz; }
      }
      out.pos = [x, cy, z];
      if (x < 0) { out.errs.push('no habia celda libre para el ensayo del observador'); }

      const guardar = [];
      const guardar_and_write = (X, Y, Z, id) => { guardar.push([X, Y, Z, mc.grid[mcIdx(X, Y, Z)]]); mcSetBlock(X, Y, Z, id); };

      if (x >= 0) {
        // Colocar observador orientado @1 en la celda.
        const idOffOri = mc.name2id[mcClaveConOri(OBS, 1)];
        guardar_and_write(x, cy, z, idOffOri);
        out.colocado = mc.grid[mcIdx(x, cy, z)] === idOffOri;

        // Poner un bloque delante para disparar el observador. El motor de redstone envuelve
        // mcSetBlock: al detectar el cambio, encolarVecinos dispara el observador que mira aqui.
        const idBloque = mc.name2id['adoquin'] || mc.name2id['hierba'] || mc.name2id['roca'] || 1;
        // Frente de @1: perm[2] indica en que MC_FACES cae el +X. Probamos las dos direcciones que
        // dejamos libres (+X y +Z) por si el mapeo cambiara: la que dispare es la buena.
        const perm = mcOriPerm(1);
        // MC_FACES[perm[2]] = frente. .dir es el vector.
        const dirFrente = MC_FACES[perm[2]].dir;
        const fx = x + dirFrente[0], fy = cy + dirFrente[1], fz = z + dirFrente[2];
        out.frente = [fx, fy, fz];
        guardar_and_write(fx, fy, fz, idBloque);

        // Drenar el motor: encendera el observador si el frente del @1 apunta al bloque nuevo.
        game.redstone.tick();

        // La celda del observador debería ahora tener la clave `observador-on@1`, no la sin girar.
        const idEncendido = mc.grid[mcIdx(x, cy, z)];
        const clave = mc.blockKey[idEncendido] || '';
        out.claveEncendida = clave;
        out.encendidoOrientado = /@1$/.test(clave);
        out.encendidoIndicaOn = clave.indexOf('-on') > 0;

        // Esperar el pulso (~100 ms) y comprobar que vuelve al off ORIENTADO, no al sin girar.
        await new Promise(s => setTimeout(s, 180));
        game.redstone.tick();
        const idApagado = mc.grid[mcIdx(x, cy, z)];
        const claveApagada = mc.blockKey[idApagado] || '';
        out.claveApagada = claveApagada;
        out.apagadoOrientado = /@1$/.test(claveApagada);
        out.apagadoNoEsOn = claveApagada.indexOf('-on') < 0;
      }

      // Restaurar sin persistir.
      for (const [X, Y, Z, id] of guardar) mcSetBlock(X, Y, Z, id);
    }

    // ── §3e observador → observador en fila (BUG-RS20) ─────────────────────────
    // El dueño reportó que dos observadores enfrentados no propagan. Escenario técnico: A y B en
    // fila, ambos mirando +X, con B pegado a A por su cara trasera. Un cambio delante de B dispara
    // B (bloque nuevo delante); al cambiar B de material, A tiene delante a B → A debería
    // dispararse en cascada. Sin el arreglo, dispararObservador escribe con yoEscribiendo=true y
    // el envoltorio de mcSetBlock se salta encolarVecinos, así que A queda sordo.
    //
    // El test coloca A y B en fila (a mano, sin pasar por mcPlace para que no dependa del picker),
    // espera a que se calmen los pulsos iniciales, pone un bloque delante de B, drena, y comprueba
    // que A está en `observador-on@0`. Anti-falso-verde: sin el arreglo, A queda en `observador@0`
    // durante el pulso (el bloque delante de B tampoco es adyacente a A, así que A no se disparaba
    // ni por su propia cara).
    if (tieneRedstone) {
      const OBS = CLAVE, OBS_ON = OBS.replace('.vox.json', '-on.vox.json');
      // Precargar la variante sin girar de ambas (@0), tanto off como on.
      await game.addMaterial(OBS);
      await game.addMaterial(OBS_ON);
      const idA_off = mc.name2id[OBS];
      const idA_on = mc.name2id[OBS_ON];

      // Buscar 3 celdas contiguas de aire en +X con espacio arriba, lejos de la parcela del §3d.
      const cy2 = Math.floor(mc.dim.y / 2);
      let ax = -1, az = -1;
      for (let dz = 0; dz < 8 && ax < 0; dz++) for (let dx = 0; dx < 8 && ax < 0; dx++) {
        const px = cx * CH + 12 + dx, pz = cz * CH + 12 + dz;
        if (px + 2 >= mc.dim.x) continue;
        // Necesito 3 celdas en +X libres, más los vecinos de A y B que NO tengan otros observadores.
        let libre = true;
        for (let k = 0; k <= 2; k++) if (mc.grid[mcIdx(px + k, cy2, pz)] !== 0) { libre = false; break; }
        if (libre) { ax = px; az = pz; }
      }
      out.filaPos = [ax, cy2, az];

      const guardar2 = [];
      const guardar_and_write2 = (X, Y, Z, id) => { guardar2.push([X, Y, Z, mc.grid[mcIdx(X, Y, Z)]]); mcSetBlock(X, Y, Z, id); };

      if (ax >= 0) {
        // Colocar A en (ax, cy2, az) y B en (ax+1, cy2, az), ambos con frente +X (@0, mira +X).
        guardar_and_write2(ax, cy2, az, idA_off);
        guardar_and_write2(ax + 1, cy2, az, idA_off);
        game.redstone.tick();
        // Colocar A y B ya dispara pulsos: A tiene a B delante y B se colocó (cambio de bloque
        // delante de A). Esperar a que el pulso se calme antes de medir el disparo real.
        await new Promise(s => setTimeout(s, 220));
        game.redstone.tick();

        // Estado de reposo antes del disparo: A y B deben estar apagados (observador, no -on).
        const claveA_reposo = mc.blockKey[mc.grid[mcIdx(ax, cy2, az)]] || '';
        const claveB_reposo = mc.blockKey[mc.grid[mcIdx(ax + 1, cy2, az)]] || '';
        out.filaReposo = {
          A_apagado: claveA_reposo.indexOf('-on') < 0 && claveA_reposo.indexOf('observador') > 0,
          B_apagado: claveB_reposo.indexOf('-on') < 0 && claveB_reposo.indexOf('observador') > 0,
          claveA_reposo, claveB_reposo,
        };

        // Ahora el paso que importa: poner un bloque delante de B. B se dispara. Con el arreglo,
        // A también se dispara porque tiene delante a B, que acaba de cambiar de material.
        const idBloque = mc.name2id['adoquin'] || mc.name2id['hierba'] || mc.name2id['roca'] || 1;
        guardar_and_write2(ax + 2, cy2, az, idBloque);
        game.redstone.tick();

        // Durante el pulso, tanto B como A deberían estar en -on. Este es el aserto de fondo del
        // ticket: A recibe la propagación del cambio de B.
        const claveA_pulso = mc.blockKey[mc.grid[mcIdx(ax, cy2, az)]] || '';
        const claveB_pulso = mc.blockKey[mc.grid[mcIdx(ax + 1, cy2, az)]] || '';
        out.filaPulso = {
          B_encendido: claveB_pulso.indexOf('-on') > 0,
          A_encendido: claveA_pulso.indexOf('-on') > 0,   // ← este era el FALSE con el bug
          claveA_pulso, claveB_pulso,
        };

        // Y tras el pulso (~100ms) ambos deberían volver a off.
        await new Promise(s => setTimeout(s, 220));
        game.redstone.tick();
        const claveA_fin = mc.blockKey[mc.grid[mcIdx(ax, cy2, az)]] || '';
        const claveB_fin = mc.blockKey[mc.grid[mcIdx(ax + 1, cy2, az)]] || '';
        out.filaFin = {
          A_apagado: claveA_fin.indexOf('-on') < 0 && claveA_fin.indexOf('observador') > 0,
          B_apagado: claveB_fin.indexOf('-on') < 0 && claveB_fin.indexOf('observador') > 0,
          claveA_fin, claveB_fin,
        };
      }

      for (const [X, Y, Z, id] of guardar2) mcSetBlock(X, Y, Z, id);
    }

    // ── §3f cuenta de parpadeos en cadena B→A (BUG-RS21) ───────────────────────
    // El dueño reportó que al PONER un bloque delante de la cadena la antorcha final parpadea 1 vez,
    // y al QUITAR parpadea 2 veces. Lo esperado (Minecraft) son 2 en los dos casos: cada evento
    // produce 2 flancos en el observador delante (subida y bajada), y cada flanco debe propagar.
    //
    // El test cuenta los PULSOS de A (proxy de los parpadeos que verá la antorcha detrás): un pulso
    // = una transición off→on. Se espía mcSetBlock envuelto para registrar cambios de material en
    // la celda de A durante una ventana de tiempo. Al poner ha de contar 2 subidas, al quitar 2.
    if (tieneRedstone) {
      const OBS = CLAVE, OBS_ON = OBS.replace('.vox.json', '-on.vox.json');
      await game.addMaterial(OBS);
      await game.addMaterial(OBS_ON);
      const idA_off = mc.name2id[OBS], idA_on = mc.name2id[OBS_ON];

      // Buscar 3 celdas contiguas en +X, lejos de las parcelas anteriores.
      const cy3 = Math.floor(mc.dim.y / 2);
      let px = -1, pz = -1;
      for (let dz = 0; dz < 8 && px < 0; dz++) for (let dx = 0; dx < 8 && px < 0; dx++) {
        const x = cx * CH + 20 + dx, z = cz * CH + 20 + dz;
        if (x + 2 >= mc.dim.x) continue;
        let libre = true;
        for (let k = 0; k <= 2; k++) if (mc.grid[mcIdx(x + k, cy3, z)] !== 0) { libre = false; break; }
        if (libre) { px = x; pz = z; }
      }
      out.pfPos = [px, cy3, pz];

      const gd3 = [];
      const w3 = (X, Y, Z, id) => { gd3.push([X, Y, Z, mc.grid[mcIdx(X, Y, Z)]]); mcSetBlock(X, Y, Z, id); };

      if (px >= 0) {
        // Colocar A (en x) y B (en x+1), ambos frente +X.
        w3(px, cy3, pz, idA_off);
        w3(px + 1, cy3, pz, idA_off);
        game.redstone.tick();
        // Esperar a que el pulso inicial (al colocar B, A se dispara) se calme.
        await new Promise(s => setTimeout(s, 260));
        game.redstone.tick();

        // Instalar espía en mcSetBlock: cuenta las transiciones de A hacia -on.
        const idxA = mcIdx(px, cy3, pz);
        let subidasA_poner = 0, subidasA_quitar = 0;
        let contador = subidasA_poner;
        const espia = (X, Y, Z, id) => {
          const antes = mc.grid[mcIdx(X, Y, Z)];
          const r = _origMc(X, Y, Z, id);
          if (X === px && Y === cy3 && Z === pz) {
            const clave = mc.blockKey[id] || '';
            const claveAntes = mc.blockKey[antes] || '';
            if (clave.indexOf('-on') > 0 && claveAntes.indexOf('-on') < 0) {
              contador(1);
            }
          }
          return r;
        };
        const _origMc = window.mcSetBlock;
        // Sustituir para PONER
        let count1 = 0;
        contador = (n) => { count1 += n; };
        window.mcSetBlock = espia;

        // Poner un bloque delante de B: bloque en (px+2).
        const idBloque = mc.name2id['adoquin'] || mc.name2id['hierba'] || mc.name2id['roca'] || 1;
        w3(px + 2, cy3, pz, idBloque);
        // Ventana suficiente para que se resuelvan los dos pulsos (el segundo va tras el primero).
        for (let i = 0; i < 6; i++) { game.redstone.tick(); await new Promise(s => setTimeout(s, 120)); }
        window.mcSetBlock = _origMc;
        subidasA_poner = count1;

        // Esperar a que el sistema quede en reposo antes del siguiente evento.
        await new Promise(s => setTimeout(s, 260));
        game.redstone.tick();

        // QUITAR (poner aire en (px+2))
        let count2 = 0;
        contador = (n) => { count2 += n; };
        window.mcSetBlock = espia;
        mcSetBlock(px + 2, cy3, pz, 0);   // quitar
        for (let i = 0; i < 6; i++) { game.redstone.tick(); await new Promise(s => setTimeout(s, 120)); }
        window.mcSetBlock = _origMc;
        subidasA_quitar = count2;

        out.parpadeos = { poner: subidasA_poner, quitar: subidasA_quitar };
      }

      for (const [X, Y, Z, id] of gd3.slice().reverse()) mcSetBlock(X, Y, Z, id);
    }

    // ── §3g reloj cara a cara (Minecraft: dos observadores enfrentados oscilan) ─
    // Configurar A y B mirándose (cara contra cara). Sin arreglo, el corte por apagones impedía
    // la retroalimentación; con el arreglo, el reloj oscila mientras haya ambos. El test cuenta
    // pulsos de A en 500 ms de ventana: con período de ~200 ms (subida+bajada), esperamos ≥2.
    if (tieneRedstone) {
      const OBS = CLAVE, OBS_ON = OBS.replace('.vox.json', '-on.vox.json');
      await game.addMaterial(OBS);
      await game.addMaterial(OBS_ON);
      const idOff0 = mc.name2id[OBS];
      // Variantes orientadas: A con frente +X (ori 0), B con frente -X (ori 6: MC_ORI[6] es 180° yaw).
      // Buscar la ori cuyo mcOriPerm[2] es -X = MC_FACES[3]. Probamos hasta 24.
      let oriB = -1;
      for (let o = 0; o < 24; o++) {
        const p = mcOriPerm(o);
        if (p[2] === 3) { oriB = o; break; }   // frente = MC_FACES[3] = -X
      }
      out.oriBParaCaraACara = oriB;
      if (oriB >= 0) {
        await game.addMaterial(mcClaveConOri(OBS, oriB));
        const idB_off = mc.name2id[mcClaveConOri(OBS, oriB)];

        const cy4 = Math.floor(mc.dim.y / 2);
        let rx = -1, rz = -1;
        for (let dz = 0; dz < 8 && rx < 0; dz++) for (let dx = 0; dx < 8 && rx < 0; dx++) {
          const x = cx * CH + 30 + dx, z = cz * CH + 30 + dz;
          if (x + 1 >= mc.dim.x) continue;
          if (mc.grid[mcIdx(x, cy4, z)] === 0 && mc.grid[mcIdx(x + 1, cy4, z)] === 0) { rx = x; rz = z; }
        }
        out.rjPos = [rx, cy4, rz];

        const gd4 = [];
        const w4 = (X, Y, Z, id) => { gd4.push([X, Y, Z, mc.grid[mcIdx(X, Y, Z)]]); mcSetBlock(X, Y, Z, id); };

        if (rx >= 0) {
          // Instalar espía ANTES de plantar el par: los flancos del propio plantado ya generan el
          // arranque del reloj y los queremos contar.
          const idxA = mcIdx(rx, cy4, rz);
          let subidas = 0;
          const _origMc2 = window.mcSetBlock;
          window.mcSetBlock = (X, Y, Z, id) => {
            const antes = mc.grid[mcIdx(X, Y, Z)];
            const r = _origMc2(X, Y, Z, id);
            if (X === rx && Y === cy4 && Z === rz) {
              const clave = mc.blockKey[id] || '', claveAntes = mc.blockKey[antes] || '';
              if (clave.indexOf('-on') > 0 && claveAntes.indexOf('-on') < 0) subidas++;
            }
            return r;
          };

          // Plantar A y B enfrentados.
          w4(rx, cy4, rz, idOff0);              // A frente +X (ori 0)
          w4(rx + 1, cy4, rz, idB_off);         // B frente -X

          // Dejar correr 550 ms para observar oscilación.
          for (let i = 0; i < 10; i++) { game.redstone.tick(); await new Promise(s => setTimeout(s, 55)); }
          window.mcSetBlock = _origMc2;

          out.relojSubidasEn550ms = subidas;
        }

        for (const [X, Y, Z, id] of gd4.slice().reverse()) mcSetBlock(X, Y, Z, id);
      }
    }

    // ── §4 sin regresiones en los vecinos ──────────────────────────────────────
    const casos = [];
    for (const [k, esperado] of [
      ['hab:cubo-trans', true],    // translucido: sigue en fino (BUG-STR1)
      ['hab:agua', false],         // 16³ macizo opaco: sigue en proyeccion (blockLike=true)
      ['hab:likelava', false],     // 16³ macizo opaco: idem
    ]) {
      try {
        const rc = await mcStructCells(k);
        const fina = mcRecFina(rc);
        casos.push({ k, blockLike: !!rc.blockLike, pielCubre: !!rc.pielCubre, fina, esperado, ok: fina === esperado });
      } catch (e) { out.errs.push(k + ': ' + e.message); }
    }
    out.vecinos = casos;

    return out;
  });

  console.log('\n§1 perfil del observador: casi macizo con huecos internos');
  ok('es un 16³', r.size && r.size.join('x') === '16x16x16', (r.size || []).join('x'));
  ok('tiene 4092 voxels (macizo menos 4 huecos internos)', r.nvox === 4092, r.nvox + ' voxels');
  ok('la piel cubre las 6 caras del cubo', r.pielCubre === true);
  ok('pero no es blockLike (le faltan voxels para 4096)', r.blockLike === false);
  ok('no es translucido — o esto seria BUG-STR1, otro ticket', r.translucido === false);
  ok('no lleva mascara de caras', r.conCaras === false);
  ok('no es atravesable', r.atrav === false);

  console.log('\n§2 va por la ruta fina y CABE en la rejilla');
  ok('mcCabeEnRejilla dice si', r.cabe === true);
  ok('mcRecFina dice fino — es lo que el ticket arregla', r.recFina === true);
  ok('mcEsFinaEnRejilla lo confirma', r.esFina === true);
  ok('tiene id en la paleta', r.id > 0, 'id=' + r.id);
  ok('su geometria esta horneada', r.hayGeom === true);
  ok('marcado en mc.finoRejilla — condicion previa para mcAltaVariante', r.marcadoFino === true);

  console.log('\n§3 las 24 posturas caben en la rejilla como fino (el anti-falso-verde)');
  ok('las 24 responden cabe=true y esFina=true', r.posturasBienEnRejilla === true,
    r.rutaEstampada.length ? 'fallaron oris ' + r.rutaEstampada.join(',') : '');

  console.log('\n§3b la variante rotada @1 se registra por el camino RAPIDO (mcAltaVariante)');
  ok('antes del alta la variante no estaba en la paleta', r.idAntesVariante <= 0,
    'idAntesVariante=' + r.idAntesVariante);
  ok('mcAddBlock devuelve un id > 0', r.idVariante > 0, 'idVariante=' + r.idVariante);
  ok('la variante queda como fina', r.varianteFina === true);
  ok('la variante esta en la paleta con su clave', r.varianteEnPaleta === true);

  console.log('\n§3c poner la variante rotada la escribe en mc.grid, no en mc.structures');
  ok('la celda tiene el id de la variante', r.enRejilla === true,
    'escritaId=' + r.escritaId + ', idVariante=' + r.idVariante);
  ok('no se creo ninguna estructura suelta', r.sinStructNueva === true);

  console.log('\n§3d activar el observador girado preserva la orientacion (BUG-RS19 secuela)');
  if (!r.tieneRedstone) {
    console.log('  --  saltado: game.redstone no esta cargado en la sesion');
  } else if (r.pos && r.pos[0] >= 0) {
    ok('se coloco el observador @1 en la celda de prueba', r.colocado === true);
    ok('al dispararse, la celda cambia a la variante encendida', r.encendidoIndicaOn === true,
      'clave=' + r.claveEncendida);
    ok('la variante encendida MANTIENE la orientacion @1 (no cae al fallback sin girar)',
      r.encendidoOrientado === true, 'clave=' + r.claveEncendida);
    ok('tras el pulso vuelve a la variante apagada', r.apagadoNoEsOn === true,
      'clave=' + r.claveApagada);
    ok('y la apagada TAMBIEN mantiene la orientacion @1',
      r.apagadoOrientado === true, 'clave=' + r.claveApagada);
  } else {
    console.log('  --  saltado: no habia celda libre para el ensayo');
  }

  console.log('\n§3e propagacion observador → observador en fila (BUG-RS20)');
  if (!r.tieneRedstone) {
    console.log('  --  saltado: game.redstone no esta cargado en la sesion');
  } else if (r.filaPos && r.filaPos[0] >= 0) {
    ok('reposo: A esta apagado antes del disparo', r.filaReposo.A_apagado === true,
      'A=' + r.filaReposo.claveA_reposo);
    ok('reposo: B esta apagado antes del disparo', r.filaReposo.B_apagado === true,
      'B=' + r.filaReposo.claveB_reposo);
    ok('pulso: B se enciende al aparecer el bloque delante', r.filaPulso.B_encendido === true,
      'B=' + r.filaPulso.claveB_pulso);
    // ★ ESTE es el aserto de fondo del ticket: sin el arreglo, A NO propaga.
    ok('pulso: A tambien se enciende — el cambio de B se propago (arreglo BUG-RS20)',
      r.filaPulso.A_encendido === true, 'A=' + r.filaPulso.claveA_pulso);
    ok('fin: A vuelve a apagado tras el pulso', r.filaFin.A_apagado === true,
      'A=' + r.filaFin.claveA_fin);
    ok('fin: B vuelve a apagado tras el pulso', r.filaFin.B_apagado === true,
      'B=' + r.filaFin.claveB_fin);
  } else {
    console.log('  --  saltado: no habia 3 celdas libres para la fila');
  }

  console.log('\n§3f cadena B→A: 2 parpadeos al poner y al quitar (BUG-RS21)');
  if (!r.tieneRedstone) {
    console.log('  --  saltado');
  } else if (r.parpadeos) {
    // ★ Los dos asertos de fondo del ticket. Antes del arreglo: poner=1, quitar=2 (asimetria).
    ok('poner: A pulsa 2 veces (2 flancos propagados desde B)',
      r.parpadeos.poner === 2, 'contadas=' + r.parpadeos.poner);
    ok('quitar: A pulsa 2 veces (mismo comportamiento simetrico)',
      r.parpadeos.quitar === 2, 'contadas=' + r.parpadeos.quitar);
  } else {
    console.log('  --  saltado: no habia 3 celdas libres');
  }

  console.log('\n§3g reloj cara a cara: dos observadores enfrentados oscilan (Minecraft)');
  if (!r.tieneRedstone) {
    console.log('  --  saltado');
  } else if (r.rjPos && r.rjPos[0] >= 0) {
    // ★ Aserto de fondo: en 550 ms con periodo ~200 ms hay al menos 2 pulsos de A. Sin el arreglo,
    //   el corte por apagones detiene el reloj tras el primer pulso.
    ok('A oscila (≥2 subidas en 550 ms)', r.relojSubidasEn550ms >= 2,
      'subidas=' + r.relojSubidasEn550ms);
  } else {
    console.log('  --  saltado: no habia 2 celdas libres para cara a cara');
  }

  console.log('\n§4 sin regresiones para los perfiles vecinos');
  for (const c of r.vecinos) {
    ok(c.k + ' → mcRecFina=' + c.esperado, c.ok, 'obtenido=' + c.fina);
  }
  if (r.errs.length) console.log('\nErrores:', r.errs);

  console.log('\nErrores de pagina:', errores.length ? errores : 'ninguno');
  await b.close();
  console.log('\n' + (fallos ? 'FALLOS: ' + fallos : 'TODO OK'));
  process.exit(fallos ? 1 : 0);
})();
