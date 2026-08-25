#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""`parche-luz-dia-ley` · la caja de luz dinámica vuelve a la Ley de la Luz.

Dueño (2026-08-25): «*el metodo nuevo de iluminacion "RADIANCE CASCADES · Versión con Tablas de
Precálculo LUT" se ve muy bonito en entornos nocturnos, pero en diurnos salen unas sombras que no
tienen sentido, ver foto #115*».

Lo que se ve en la foto #115 (mapa `empty`, mediodía) NO es una sombra: es la CAJA DE LUZ de la
herramienta que llevas en la mano, escrita fuera de escala y sin haz. Medido con
`tests/probe_luz_dia_lut.js` (3 rondas ALTERNAS + control de suelo lejano, encuadre de la foto):

                        techo legal  maxByte  celdas  caja       temblor(G)  suelo cerca (R,G,B)
    LUT (app.js hoy)         64        101      734   22×22×21      8,85     102,9  156,8  37,2
    Ley (este snippet)       64         64      440   18×18×17      0,00     106,0  175,2  43,1
    control: suelo LEJOS, fuera de la caja  →  Δ = +0,7  −0,5  +0,1 (la escena no se movió)

O sea: dentro de la caja la LUT se come 18,4 de VERDE (−10,5 %) en la hierba a pleno sol, y el campo
no se está quieto (8,85 de temblor entre rondas idénticas contra 0,00 de la Ley).

Los cinco artículos que infringe `mcDynBake` desde el commit 5940da4 (leer
`wiki/paginas/ley-de-la-luz.md` antes de discutir ninguno):

  1. ESCALA (Ley I + `mcLuzSubAjusta`). El campo se guarda en SUBNIVELES: el techo de una luz de
     alcance 8 con `MC_LUZ_SUB=8` es el byte 64. La LUT escribe 0..255 crudos ⇒ 101 medidos, un 58 %
     por encima del techo, y saturando `uLuzEsc` en un radio enorme.
  2. `mcLuzSubAjusta` SE QUEDÓ SIN LLAMANTE (es código muerto hoy): `MC_LUZ_SUB` ya no se mueve
     nunca ⇒ `game.luzSub` no hace nada y una quieta de alcance largo puede dar la vuelta al byte.
  3. EL HAZ (Ley I, `mcLuzFactorHaz`). Las 14 semillas de la foto llevan `haz` y `mc.glowFocus`
     vale 0,5; la LUT estampa una esfera. El cono se convierte en una bola que alumbra también
     hacia atrás: de ahí el manchón simétrico a los pies.
  4. LA POSICIÓN FINA (Mandamiento 5). La LUT firma por celda entera (`s.x,s.y,s.z`) e ignora
     `s.fx/fy/fz` ⇒ el campo pega un bandazo al cruzar de celda, que es justo lo prohibido.
  5. LA OCLUSIÓN (Mandamiento 3 / Ley III). La LUT consulta `mcTablaLuz` sólo en la celda DESTINO,
     no a lo largo del camino: la luz atraviesa paredes. En `empty` no se ve; en una cueva sí.

Y encima la fusión temporal (`interpolacion`) mezcla el frame anterior en espacio de mundo: eso es
el temblor de 8,85, y arrastra un rastro de luz por el suelo al andar.

QUÉ HACE ESTE SNIPPET: devolver `mcDynBake` al que había antes de la LUT — el BFS por el aire, con
haz, posición fina, oclusión real y `mcLuzSubAjusta` — sin tocar `web/app.js` (LEY DE ORO). El
cuerpo se extrae VERBATIM de git, no se copia mano, así que no puede derivar.

    game.luzLey.on()     ← lo pone (el snippet ya lo hace al cargarse)
    game.luzLey.off()    ← devuelve la Radiance Cascades LUT tal cual venía
    game.luzLey.diag()   ← los números: techo legal vs. lo escrito, caja, semillas con haz…
    game.luzLey.color(v) ← las partículas alumbran de SU color (true / false / 0..1, o hasta 3 = exagerado)

SEGUNDA PARTE — COLOR PROPIO DE LAS PARTÍCULAS (dueño, 2026-08-25: «*parece que hace que las
luciernagas emitan menos saturacion de su color de luz*»). No lo causaba el bake: `mcDynSync` siembra
la capa `game.voxelesUI` con `-1,-1,-1` en el color (app.js:12048) = «sin color propio», y entonces
`mcLuzSiembra` reparte el cálido de la casa (1 · 0,85 · 0,50). Encima `mcLitGlow` tiñe de cálido con
fuerza PROPORCIONAL AL NIVEL (`mix(vec3(1.0), rgbCol, b*0.75)`), así que la LUT «coloreaba más» sólo
porque escribía 101 contra un techo de 32 y pisaba ese acelerador 3,2×.

`color()` le devuelve a cada semilla el color de su propio voxel, que `mc.voxUI` sí guarda y que
`mcVoxUILuces` tira al agrupar por celda. Medido con `tests/probe_color_particulas.js` en el
santuario (color del campo normalizado rgb/a, que es lo que el shader lee como `rgbCol`):

                    campo (r,g,b)        semillas pintadas   distancia al cálido
    color(false)    1,000  0,821  0,516          0                 0,033
    color(0.5)      1,000  0,901  0,508         40                 0,052
    color(true)     1,000  0,952  0,532         44                 0,107
    color real de las luciérnagas: 0,984  0,943  0,489  ⇒ el campo acaba en su color

Sale MÁS BARATO que subir el alcance (la otra forma de ganar tinte): no agranda la caja ni el BFS.
⚠️ El color se cuantiza EN EL ALCANCE (`mcLuzSiembra` escala el color a `lv0`), así que con alcance 4
sólo hay 4 escalones de color: más alcance también es más FINURA de color, no sólo más brillo.

TERCERA PARTE — POR QUÉ `color(true)` NO SE NOTA (dueño, 2026-08-25: «*no noto ninguna diferencia en
la saturación*», fotos #120/#121). No es el parche: **la paleta de las luciérnagas de `efectos-demo`
ES el cálido de la casa**, y con su `luz: 6` el color se cuantiza en 6 escalones, donde las cuatro
caen encima o a UN escalón:

    color de la luciérnaga   con alcance 6   rgbCol que ve el shader   (el cálido da 6,5,3 → 1 · 0,833 · 0,5)
    1,00 0,95 0,45              6, 6, 3          1 · 1,000 · 0,500     +1 escalón de verde
    0,92 1,00 0,55              6, 6, 3          1 · 1,000 · 0,500     +1 escalón de verde
    1,00 0,85 0,30              6, 5, 2          1 · 0,833 · 0,333     −1 escalón de azul
    1,00 1,00 0,80              6, 6, 5          1 · 1,000 · 0,833     MENOS saturado que el cálido

Y ese `rgbCol` entra en `mcLitGlow` con fuerza `b*0.75`, con `b` pequeño en una pared. De ahí las tres
palancas, en orden de sinceridad: (1) cambiar la paleta en `efectos-demo`, que es donde vive el color;
(2) `game.voxelesUI.luz('luciernagas', 15)` → 15 escalones en vez de 6; (3) `color(2)`, que exagera.

⚠️ Si la LUT te gustaba de noche era por el 58 % de más y por el radio saturado. La Ley tiene mando
para eso y no es un apaño: `game.glowGain` (INTENSIDAD, un uniforme, gratis) y `game.glowLevel`
(ALCANCE). Súbelos ahí, no en la escala del campo.

    python3 herramientas/crea_snp_luz_ley.py            # publica por POST /api/snippets
    python3 herramientas/crea_snp_luz_ley.py --fichero  # o lo escribe en data/snippets/
"""
import datetime
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request

API = os.environ.get('VOXEL_API', 'http://localhost:8500')
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ID = 'parche-luz-dia-ley'
NOMBRE = '☀️ Iluminación · la Ley de la Luz (arregla el día) + partículas con su color'


def mcdynbake_verbatim():
    """El `mcDynBake` de app.js ANTERIOR a la Radiance Cascades LUT, sacado de git.

    Se busca el commit que introdujo `MC_LUT_SPHERES` y se lee su PADRE: así el texto es el que
    validaron los guardianes de luz, sin copiarlo mano (copiarlo es cómo derivan las cosas).
    """
    git = lambda *a: subprocess.check_output(('git',) + a, cwd=RAIZ).decode('utf-8')
    commits = git('log', '-S', 'MC_LUT_SPHERES', '--format=%H', '--', 'web/app.js').split()
    if not commits:
        raise SystemExit('No encuentro en git el commit que metió MC_LUT_SPHERES.')
    src = git('show', commits[-1] + '^:web/app.js').split('\n')
    ini = next(i for i, l in enumerate(src) if l.startswith('function mcDynBake(sem){'))
    fin = next(i for i in range(ini + 1, len(src)) if src[i] == '}')
    cuerpo = src[ini:fin + 1]
    # ÚNICA desviación del verbatim, y declarada: el nombre. Dentro del snippet conviven las dos
    # versiones (la Ley y la LUT), así que no pueden llamarse igual.
    cuerpo[0] = cuerpo[0].replace('function mcDynBake(', 'function mcDynBakeLey(')
    return '\n'.join(cuerpo), commits[-1]


CABECERA = r"""// ═════════════════════════════════════════════════════════════════════════════════════════════
// ☀️ LA CAJA DE LUZ DINÁMICA VUELVE A LA LEY DE LA LUZ  ·  arregla el día (foto #115)
//
// Síntoma: mapa `empty`, mediodía, campo de hierba raso — y un manchón sucio a tus pies. No es una
// sombra: es la caja de luz de la HERRAMIENTA QUE LLEVAS EN LA MANO. La Radiance Cascades LUT la
// escribe fuera de escala y sin haz, así que de noche parece «bonita» (brilla un 58 % de más) y de
// día se ve lo que es: una bola de luz amarilla que desatura la hierba iluminada por el sol.
//
// MEDIDO — tests/probe_luz_dia_lut.js, encuadre de la foto #115, 3 rondas ALTERNAS, con control:
//
//                      techo legal  maxByte  celdas  caja       temblor(G)  suelo cerca (R,G,B)
//   LUT (app.js hoy)        64        101      734  22×22×21       8,85     102,9  156,8   37,2
//   Ley (esto)              64         64      440  18×18×17       0,00     106,0  175,2   43,1
//   control suelo LEJOS (fuera de la caja):  Δ = +0,7  −0,5  +0,1  ⇒ la escena no se movió
//
//   ⇒ dentro de la caja la LUT se come 18,4 de VERDE (−10,5 %) a pleno sol, y el campo TIEMBLA
//     (8,85 entre rondas idénticas, contra 0,00 de la Ley) por la fusión temporal.
//
// LO QUE INFRINGE (wiki/paginas/ley-de-la-luz.md — léela antes de discutir ninguno):
//   1 · ESCALA. El campo va en SUBNIVELES: alcance 8 × MC_LUZ_SUB 8 = techo 64. La LUT escribe
//       0..255 crudos ⇒ 101, y satura uLuzEsc en un radio enorme.
//   2 · mcLuzSubAjusta se quedó SIN LLAMANTE ⇒ `game.luzSub` hoy no hace nada.
//   3 · EL HAZ. Las 14 semillas llevan `haz` y game.glowFocus vale 0,5; la LUT estampa una ESFERA
//       ⇒ el cono alumbra también hacia atrás. Ése es el manchón simétrico.
//   4 · LA POSICIÓN FINA. Firma por celda entera e ignora s.fx/fy/fz ⇒ bandazo al cruzar de celda
//       (Mandamiento 5, justo lo prohibido).
//   5 · LA OCLUSIÓN. Consulta mcTablaLuz sólo en la celda DESTINO, no por el camino ⇒ la luz
//       atraviesa paredes. En `empty` no se nota; en una cueva sí.
//
// QUÉ HACE: devolver mcDynBake al de antes de la LUT (BFS por el aire, haz, posición fina,
// oclusión real, mcLuzSubAjusta), en caliente y SIN TOCAR web/app.js.
//
//   game.luzLey.on()  ·  game.luzLey.off() (vuelve la LUT)  ·  game.luzLey.diag()
//   game.luzLey.color(true/false/0..1)  ← las partículas alumbran de SU color, no del cálido de la casa
//
// ⚠️ ¿La LUT te gustaba de noche? Era el 58 % de más. La Ley tiene mando para eso y no es un apaño:
//    game.glowGain (INTENSIDAD, un uniforme, gratis) y game.glowLevel (ALCANCE). Ahí, no en la
//    escala del campo.
// ═════════════════════════════════════════════════════════════════════════════════════════════
(() => {
'use strict';
const W = window;
W.game = W.game || {};

// Re-ejecutable: si ya estaba puesto, se quita antes de volver a ponerse (si no, `LUT` acabaría
// guardando el parche en vez del motor y `off()` no devolvería nada).
if (W.game.luzLey && W.game.luzLey.instalado) W.game.luzLey.off();

const LUT = W.mcDynBake;   // lo que hay HOY en app.js: la Radiance Cascades LUT

// 2026-08-25 · el dueño dio el parche por bueno y BAJÓ AL MOTOR (herramientas/parche_app_luz_ley.py):
// app.js ya trae `mcDynBakeLey`, la capa de color y su propio `game.luzLey`. Cuando es así este snippet
// NO instala nada —instalar sería poner una SEGUNDA copia encima, y entonces `off()` devolvería el
// despachador del motor en vez de la LUT—: se queda solo con el informe de foto, que es su otra mitad y
// no tiene por qué vivir en las 15 000 líneas del motor.
const EN_MOTOR = (typeof mcDynBakeLey === 'function' && W.game.luzLey && '_color' in W.game.luzLey);
const leyPuesta = () => EN_MOTOR ? !!W.game.luzLey.instalado : API.instalado;

// ─────────── VERBATIM ───────────────────────────────────────────────────────────────────────
// Copiado tal cual de web/app.js en el commit anterior a __COMMIT__ (el que metió MC_LUT_SPHERES).
// Lo extrae herramientas/crea_snp_luz_ley.py desde git: no está escrito mano, así que no deriva.
// Única desviación, y declarada: el nombre (mcDynBake → mcDynBakeLey), porque aquí conviven las dos.
"""

PIE = r"""
// ─────────── fin VERBATIM ───────────────────────────────────────────────────────────────────

// Al cambiar de bake hay que TIRAR el rastro de la fusión temporal de la LUT: mezcla el frame
// anterior en espacio de mundo, así que sin esto el campo nuevo sale contaminado con el viejo
// durante varios segundos y el A/B no mide nada.
function repartirDeCero(){
  if (typeof MC_RC_LUT !== 'undefined' && MC_RC_LUT) { MC_RC_LUT.prevBL32 = null; MC_RC_LUT.prevBox = null; }
  mc._dynSig = null;
  if (typeof mcDynSync === 'function' && mc.grid) mcDynSync();
}

// El techo que la Ley le deja al byte del campo con el alcance que hay AHORA en escena.
function techoLegal(){
  const SUB = (typeof MC_LUZ_SUB !== 'undefined') ? MC_LUZ_SUB : 8;
  let lv = 1;
  for (const s of (mc._dynSem || [])) if ((s.nivel | 0) > lv) lv = s.nivel | 0;
  return { SUB, alcance: lv, techo: lv * SUB };
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// COLOR PROPIO DE LAS PARTÍCULAS (capa game.voxelesUI) · pedido del dueño, 2026-08-25
//
// «Las luciérnagas no colorean como sin el parche». No era cosa del bake: `mcDynSync` siembra la capa
// `game.voxelesUI` con `-1,-1,-1` en las tres casillas de color (app.js:12048) = «sin color propio»,
// y entonces `mcLuzSiembra` reparte el cálido de la casa (1 · 0,85 · 0,50). Encima `mcLitGlow` vuelve
// a teñir de cálido con fuerza PROPORCIONAL AL NIVEL — `mix(vec3(1.0), rgbCol, b*0.75)` — y ahí está
// la explicación de por qué la LUT «coloreaba más»: escribía 101 contra un techo de 32 y pisaba ese
// acelerador 3,2×. Nunca fue el color de la luciérnaga; era el cálido del motor sobre-conducido.
//
// Esto le devuelve a cada semilla EL COLOR DE SU PROPIO VOXEL, que `mc.voxUI` sí guarda y que
// `mcVoxUILuces` tira al agrupar por celda. Sale MÁS BARATO que subir el alcance (que es la otra
// forma de ganar tinte): cambia el color de la semilla sin agrandar la caja ni el BFS.
//
// ⛔ No se toca `app.js` ni el bloque VERBATIM de arriba: las semillas se pintan ANTES de entregarlas.
// El color entra en la firma del bake, así que cambiarlo rehornea solo.
const CALIDO = [255, 217, 128];          // (1 · 0,85 · 0,50)×255 = lo que reparte mcLuzSiembra sin color
const MAX_SAT = 3;                       // tope de la exageración (ver pintaSemillas): 1 = su color tal cual
// saturacion 2 = lo que el dueño fijó como bueno el 2026-08-25 tras la tanda #132-#139: con 1 (el color
// EXACTO de la luciérnaga) no se distingue del cálido, porque su paleta ya ES cálida; a 2 los canales se
// separan lo bastante para verse sin subir ni un byte del campo (ver pintaSemillas).
const COLOR = EN_MOTOR ? W.game.luzLey._color    // EL estado del motor, no una copia: si no, el informe mediría otra cosa
                       : { activo: true, saturacion: 2, pintadas: 0, _luz: null, _mapa: null };

// Celda del mundo → color 0..255, agrupando EXACTAMENTE igual que mcVoxUILuces (misma celda, misma
// media). Si agrupara distinto, la clave no casaría con la de la semilla y no pintaría nada.
function mapaColorVoxUI(){
  if (COLOR._mapa && COLOR._luz === mc._voxUILuz) return COLOR._mapa;   // mismo ciclo de recálculo que mcVoxUILuces
  const mapa = new Map();
  if (mc.voxUI && mc.voxUILuces !== false) {
    const paso = MC_VOX * Math.max(1, mc.voxUITam | 0), celdas = new Map();
    for (const [nombre, m] of mc.voxUI) {
      if (!(mcVoxUINivel(nombre) > 0)) continue;          // grupo con la luz apagada: ni se recorre
      const mat = mcVoxUIMat(nombre), medio = paso * mcVoxUIGrosor(nombre) * 0.5;
      for (const [k, c] of m) {
        if (!mcVoxUIEmite(c, mat)) continue;              // no emite: es adorno brillante y ya
        const q = k.split(','),
              wx = +q[0] * paso + medio, wy = +q[1] * paso + medio, wz = +q[2] * paso + medio;
        const ck = Math.floor(wx) + ',' + Math.floor(wy) + ',' + Math.floor(wz);
        let a = celdas.get(ck); if (!a) { a = [0, 0, 0, 0]; celdas.set(ck, a); }
        a[0] += c[0]; a[1] += c[1]; a[2] += c[2]; a[3]++;
      }
    }
    for (const [ck, a] of celdas)
      mapa.set(ck, [a[0] / a[3] * 255, a[1] / a[3] * 255, a[2] / a[3] * 255]);
  }
  COLOR._mapa = mapa; COLOR._luz = mc._voxUILuz;
  return mapa;
}

// De 0 a 1 `saturacion` MEZCLA entre el cálido de la casa (0 = EXACTAMENTE lo de ahora) y el color de
// verdad de la partícula (1). Pasado 1, EXAGERA: separa los canales del más alto.
//
// Hace falta porque con el color de verdad casi no se nota, y no es culpa del parche: la paleta de las
// luciérnagas de `efectos-demo` ES el cálido de la casa (1 · 0,95 · 0,45 / 0,92 · 1 · 0,55 / 1 · 0,85 ·
// 0,30 / 1 · 1 · 0,80 contra 1 · 0,85 · 0,50). Con `luz: 6` el color se cuantiza en 6 escalones y las
// cuatro caen en el mismo sitio o a un escalón. No había nada que reenviar.
//
// ⚠️ Exagerar SOLO BAJA canales, nunca sube ninguno: el más alto se queda donde está, y ése es el que
// manda el nivel (`a = max(...)` en el campo). El byte escrito no cambia ⇒ no toca la Ley de la Luz,
// que habla de NIVELES; esto es la PROPORCIÓN entre canales, o sea `rgbCol` en `mcLitGlow`.
function pintaSemillas(sem){
  if (!COLOR.activo) return 0;
  const mapa = mapaColorVoxUI(); if (!mapa.size) return 0;
  const s = Math.max(0, Math.min(MAX_SAT, COLOR.saturacion));
  let n = 0;
  for (const sd of sem) {
    if (sd.col) continue;                                 // ya trae color propio: estructura o pieza en la mano
    const c = mapa.get(sd.x + ',' + sd.y + ',' + sd.z);
    if (!c) continue;                                     // no sale de la capa voxelesUI: no es asunto nuestro
    const m = Math.min(1, s);
    let col = [CALIDO[0] + (c[0] - CALIDO[0]) * m,
               CALIDO[1] + (c[1] - CALIDO[1]) * m,
               CALIDO[2] + (c[2] - CALIDO[2]) * m];
    if (s > 1) {                                          // continuo en s=1: el hueco ×1 es el hueco
      const mx = Math.max(col[0], col[1], col[2]);
      col = col.map(v => Math.max(0, mx - (mx - v) * s));
    }
    sd.col = col.map(Math.round);
    n++;
  }
  return n;
}

// Lo que se instala = pintar y llamar al VERBATIM. Así el de arriba sigue siendo, letra por letra, el
// de antes de la LUT, y el color es una capa aparte que se apaga sola (game.luzLey.color(false)).
function mcDynBakeLeyColor(sem){ COLOR.pintadas = pintaSemillas(sem); return mcDynBakeLey(sem); }

// ══ INFORME DE FOTO · «depurar la escena» (dueño, 2026-08-25) ═══════════════════════════════════════
// «*haz que alt+f genere informe cuando se cargue el snippet parche-luz-dia-ley para depurar la
// escena*». Lo registra EL SNIPPET, no `data/informes/index.json`: `mcInformeDefine` es global y esto
// corre en ámbito global, así que el informe existe mientras el parche esté cargado y se va solo al
// recargar la página. Cero líneas de `app.js`, cero ficheros nuevos que mantener.
//
// Qué contesta, que es lo que llevamos tres intentos sin poder contestar a ojo: **entre el color del
// voxel y el píxel hay tres estrangulamientos**, y el informe enseña los tres con los números de ESTA
// escena en lugar de razonar sobre ellos:
//   1. ¿llega el color a la semilla?      → `semillas.pintadas` (si es 0, el resto no importa)
//   2. ¿sobrevive a la cuantización?      → `cuantizacion`, que escala el color a `lv0` (el ALCANCE)
//   3. ¿sobrevive al tinte del shader?    → `loQueVeElOjo`, `mix(vec3(1.0), rgbCol, b*0.75)`
// El (3) es el que manda: `b = a/(MC_MAXLIGHT*MC_LUZ_SUB)`, o sea el byte del campo entre 120. Con
// alcance 6 el byte no pasa de 48 ⇒ `b ≤ 0,4` ⇒ el tinte entra al 30 % como mucho.
// ⚠️ FUNCIÓN, no constante: `MC_LUZ_SUB` es un `let` que `mcLuzSubAjusta` mueve en caliente. Congelarlo
// al cargar el snippet es el mismo error contra el que avisa `app.js` al mandar el uniforme («se manda
// MC_LUZ_SUB EN EL MOMENTO —nunca un valor»), y aquí saldría un `b` inventado.
const topeDelByte = () => MC_MAXLIGHT * MC_LUZ_SUB;     // 120 con SUB=8 · lo que el shader llama «luz plena»

// Los mismos redondeos que `mcLuzSiembra`, copiados aquí a propósito: si el motor cambia la fórmula,
// el informe tiene que DISCREPAR en vez de seguirle la corriente y decir que todo está bien.
function bytesDeColor(col, lv0){
  if (!col) return [lv0, Math.round(lv0 * 0.85), Math.round(lv0 * 0.50)];
  return [0, 1, 2].map(k => Math.min(lv0, Math.max(1, Math.round((col[k] / 255) * lv0))));
}
const rgbColDe = b => { const m = Math.max(1, b[0], b[1], b[2]); return b.map(v => +(v / m).toFixed(3)); };
const tinteDe = (rgbCol, b) => rgbCol.map(c => +(1 + (c - 1) * b * 0.75).toFixed(3));   // mcLitGlow

function informeColorParticulas(){
  const D = mc.dynLight, sem = mc._dynSem || [], mapa = mapaColorVoxUI();

  // ── 1 · la capa: quién emite, con qué alcance y de qué color ES en realidad
  const capa = {};
  if (mc.voxUI) for (const [nombre, m] of mc.voxUI) {
    const mat = (typeof game.voxelesUI.material === 'function') ? game.voxelesUI.material(nombre) : {};
    const paleta = new Map();
    for (const [, c] of m) { const k = c.map(v => Math.round(v * 100) / 100).join(','); paleta.set(k, (paleta.get(k) || 0) + 1); }
    capa[nombre] = {
      voxeles: m.size, emite: !!mat.emite, alcance: mat.luz,
      // La paleta ENTERA, no la media: el promedio de cuatro amarillos distintos es otro amarillo y
      // esconde justo lo que hay que ver — si esos colores son o no el cálido de la casa.
      paleta: [...paleta.entries()].map(([c, n]) => ({ color: c.split(',').map(Number), voxeles: n }))
    };
  }

  // ── 2 · las semillas: ¿cuáles salen de la capa y a cuáles les hemos puesto color?
  let deLaCapa = 0, conColor = 0, conColorPropio = 0;
  const muestras = [];
  for (const sd of sem) {
    const esNuestra = mapa.has(sd.x + ',' + sd.y + ',' + sd.z);
    if (esNuestra) deLaCapa++;
    if (sd.col) conColor++;
    if (esNuestra && sd.col) {
      conColorPropio++;
      if (muestras.length < 12) muestras.push({ celda: [sd.x, sd.y, sd.z], nivel: sd.nivel,
        colorDelVoxel: mapa.get(sd.x + ',' + sd.y + ',' + sd.z).map(Math.round), colorSembrado: sd.col.map(Math.round) });
    }
  }

  // ── 3 · la cuantización, color a color: lo que de verdad se escribe en el campo contra el cálido
  const cuantizacion = muestras.map(s => {
    const lv0 = s.nivel | 0;
    const mio = bytesDeColor(s.colorSembrado, lv0), calido = bytesDeColor(null, lv0);
    const rMio = rgbColDe(mio), rCal = rgbColDe(calido);
    return { celda: s.celda, alcance: lv0, bytesConSuColor: mio, bytesConElCalido: calido,
             rgbColConSuColor: rMio, rgbColConElCalido: rCal,
             // Si esto es [0,0,0] el color se perdió ENTERO en el redondeo y no hay nada que ver.
             diferencia: [0, 1, 2].map(k => +(rMio[k] - rCal[k]).toFixed(3)) };
  });

  // ── 4 · el campo y el ojo: `b` es lo que decide cuánto tinte entra, y es lo que suele matarlo todo
  const TOPE = topeDelByte();
  let bMax = 0, bSuma = 0, celdas = 0, maxByte = 0;
  if (D) for (let i = 0; i < D.vol; i++) {
    const a = D.BL[i * 4 + 3]; if (!a) continue;
    if (a > maxByte) maxByte = a;
    const b = a / TOPE; if (b > bMax) bMax = b; bSuma += b; celdas++;
  }
  // El byte MÁS ALTO que se ha escrito contra el que la ley permite (nivel del emisor × SUB). Es el
  // número que separa «la luz es así» de «el bake se la ha inventado», y vale con el parche PUESTO y
  // QUITADO — con la LUT en marcha, es su factura. Sin él no se puede juzgar una foto sin parche.
  const legal = techoLegal();
  const bMedio = celdas ? bSuma / celdas : 0;
  // ⚠️ Sobre TODAS las semillas de la muestra, no sobre la primera. La primera versión de esto miraba
  // `cuantizacion[0]` y el titular bailaba entre fotos IDÉNTICAS (#126 y #130 del dueño: misma
  // saturación, 10 puntos contra 5) porque las luciérnagas se mueven y la «primera» no es la misma.
  // Un número que cambia sin que cambie nada no es una medida.
  const ojo = cuantizacion.length ? (() => {
    // Puntos porcentuales de canal, por semilla, en la celda media (la que se ve en una pared).
    const porSemilla = cuantizacion.map(c => {
      const a = tinteDe(c.rgbColConSuColor, bMedio), b = tinteDe(c.rgbColConElCalido, bMedio);
      return [0, 1, 2].map(k => +(100 * (a[k] - b[k])).toFixed(1));
    });
    const canal = k => porSemilla.map(p => p[k]);
    const med = a => { const s = [...a].sort((x, y) => x - y); return +s[s.length >> 1].toFixed(1); };
    const media = a => +(a.reduce((s, v) => s + v, 0) / a.length).toFixed(1);
    return {
      b_maximo: +bMax.toFixed(3), b_medio: +bMedio.toFixed(3), semillasMedidas: porSemilla.length,
      tinte_en_la_celda_mas_brillante: { conSuColor: tinteDe(cuantizacion[0].rgbColConSuColor, bMax),
                                         conElCalido: tinteDe(cuantizacion[0].rgbColConElCalido, bMax) },
      // Cuánto se aparta CADA semilla, sin mirar el signo: el tamaño del efecto por luciérnaga.
      desvio_tipico_en_puntos: [0, 1, 2].map(k => med(canal(k).map(Math.abs))),
      // EL NÚMERO. Con el signo, promediado: es lo que ve una pared alumbrada por MUCHAS a la vez.
      // Si sale ~0 mientras el desvío típico no lo es, el color no es que sea flojo — es que se
      // CANCELA entre semillas, porque cada una redondea hacia un lado distinto. Un canal necesita
      // ~2 puntos para valer 1/255: por debajo de eso no hay píxel que lo pueda representar.
      neto_en_puntos: [0, 1, 2].map(k => media(canal(k))),
      diferencia_por_semilla_en_puntos: porSemilla
    };
  })() : null;

  return {
    parche: { enElMotor: EN_MOTOR, instalado: leyPuesta(), colorPropio: COLOR.activo, saturacion: COLOR.saturacion, topeDeSaturacion: MAX_SAT },
    capa, semillas: { total: sem.length, deLaCapaVoxelesUI: deLaCapa, conAlgunColor: conColor,
                      pintadasConSuColor: conColorPropio, celdasDelMapaDeColor: mapa.size, muestras },
    cuantizacion: cuantizacion.slice(0, 6),
    campo: { celdasEncendidas: celdas, topeDelByte: TOPE, subniveles: MC_LUZ_SUB,
             byteMasAltoEscrito: maxByte, techoLegalDelByte: legal.techo,
             alcanceDelEmisorMasFuerte: legal.alcance,
             dentroDeLaLey: maxByte <= legal.techo,
             // >1 = el bake se ha inventado luz. Es la factura de la LUT, y se lee con el parche
             // PUESTO y QUITADO, así que sirve para juzgar también una foto sin parche.
             vecesElTecho: legal.techo ? +(maxByte / legal.techo).toFixed(2) : null },
    loQueVeElOjo: ojo,
    condiciones: { pos: mc.pos.map(v => +v.toFixed(2)), luzGlobal: game.luzGlobal,
                   glowGain: game.glowGain, glowFocus: game.glowFocus, glowLevel: game.glowLevel,
                   enLaMano: (mc.hotbar && mc.hotbar[mc.sel]) || null,
                   // ⚠️ interiorDark 0 APAGA la reposición: la malla hornea `0^((15-lv)/15)` = 0 en el
                   // vértice y `dynLift` repone DIVIDIENDO (shade / dark^dyn) ⇒ 0 entre lo que sea
                   // sigue siendo 0. Ninguna luz móvil puede levantar un cero: ni las luciérnagas ni
                   // la herramienta alumbran un interior con el mando a 0.
                   interiorDark: mc.interiorDark,
                   reposicionDeLuzMovilViva: mc.interiorDark > 0 && mc.interiorDark !== 1 }
  };
}

function registraInforme(){
  if (typeof mcInformeDefine !== 'function') return false;
  mcInformeDefine('color-particulas', {
    titulo: 'Color de las partículas: del voxel al píxel, y dónde se pierde',
    calcula: informeColorParticulas,
    resumen(d){
      const o = d.loQueVeElOjo;
      // Lo primero, porque anula todo lo demás: con el mando a 0 no hay foto que valga, el interior
      // sale negro por aritmética y ni las luciérnagas ni la herramienta pueden levantarlo.
      if (d.condiciones.interiorDark === 0) return '⛔ interiorDark 0: el vértice se hornea a CERO y dynLift divide ⇒ NINGUNA luz móvil alumbra un interior. Sube a 0.02.';
      if (!o) return 'pintadas 0/' + d.semillas.deLaCapaVoxelesUI + ' · saturacion ' + d.parche.saturacion + ' · sin color en el campo';
      const neto = Math.max(...o.neto_en_puntos.map(Math.abs));
      return (d.campo.dentroDeLaLey ? '' : '⛔ byte ' + d.campo.byteMasAltoEscrito + ' = ' + d.campo.vecesElTecho + '× el techo legal · ') +
        'pintadas ' + d.semillas.pintadasConSuColor + '/' + d.semillas.deLaCapaVoxelesUI +
        ' · saturacion ' + d.parche.saturacion + ' · b medio ' + o.b_medio +
        ' · desvio ' + Math.max(...o.desvio_tipico_en_puntos) + ' puntos · NETO ' + neto.toFixed(1) +
        (neto < 2 ? ' puntos (< 1/255: INVISIBLE)' : ' puntos');
    }
  });
  return true;
}

const API = {
  instalado: false,
  on(){
    W.mcDynBake = mcDynBakeLeyColor; API.instalado = true; repartirDeCero();
    if (typeof toast === 'function') toast('☀️ Luz dinámica: LEY (BFS, haz, posición fina)');
    return API.diag();
  },
  off(){
    W.mcDynBake = LUT; API.instalado = false; repartirDeCero();
    if (typeof toast === 'function') toast('✨ Luz dinámica: Radiance Cascades LUT');
    return API.diag();
  },
  conmutar(){ return API.instalado ? API.off() : API.on(); },
  // Las partículas (luciérnagas, estrellas…) alumbran de SU color en vez del cálido de la casa.
  //   game.luzLey.color(false)      · como antes: todo cálido
  //   game.luzLey.color(0.5)        · a medio camino, para dosificarlo
  //   game.luzLey.color(true)       · su color EXACTO — con las luciérnagas de `efectos-demo` casi no
  //                                   se nota, porque su paleta ya ES el cálido (ver pintaSemillas)
  //   game.luzLey.color(2.5)        · EXAGERADO, hasta 3: separa los canales sin subir ni un byte
  //   game.luzLey.color({saturacion:2.5})  · lo mismo por clave
  //
  // ⚠️ Acepta OBJETO además de número porque el dueño probó `color({saturacion:1000})` y no pasó nada:
  // `isFinite(+{})` es NaN ⇒ la llamada se caía por el desagüe SIN AVISAR, que es el peor fallo posible
  // en un mando de depuración. Ahora lo que no se entienda se queja por consola.
  color(v){
    if (v === false || v === true) { COLOR.activo = v; }
    else if (v && typeof v === 'object') {
      if ('saturacion' in v) COLOR.saturacion = Math.max(0, Math.min(MAX_SAT, +v.saturacion || 0));
      COLOR.activo = ('activo' in v) ? !!v.activo : COLOR.saturacion > 0;
    }
    else if (isFinite(+v)) { COLOR.activo = +v > 0; COLOR.saturacion = Math.max(0, Math.min(MAX_SAT, +v)); }
    else { console.warn('game.luzLey.color: no entiendo «' + v + '» (true/false, 0..' + MAX_SAT + ' o {saturacion:n})'); return API.diag(); }
    repartirDeCero();
    if (typeof toast === 'function')
      toast(COLOR.activo ? '🎨 Partículas: su propio color (' + Math.round(COLOR.saturacion * 100) + '%)'
                         : '🕯️ Partículas: el cálido de siempre');
    return { colorPropio: COLOR.activo, saturacion: COLOR.saturacion, semillasPintadas: COLOR.pintadas };
  },
  // Los números, no la impresión: qué hay escrito en el campo y si cabe en la Ley.
  diag(){
    const D = mc.dynLight, t = techoLegal();
    let maxByte = 0, celdas = 0;
    if (D) for (let i = 0; i < D.vol; i++) { const a = D.BL[i * 4 + 3]; if (a) { celdas++; if (a > maxByte) maxByte = a; } }
    const sem = mc._dynSem || [];
    const conHaz = sem.filter(s => s.haz && (s.haz[0] || s.haz[1] || s.haz[2])).length;
    const conFino = sem.filter(s => s.fx != null).length;
    const r = {
      bake: leyPuesta() ? 'LEY (BFS por el aire)' : 'Radiance Cascades LUT',
      MC_LUZ_SUB: t.SUB, alcanceEnEscena: t.alcance, techoLegalDelByte: t.techo,
      maxByteEscrito: maxByte,
      dentroDeLaLey: maxByte <= t.techo,
      celdasConLuz: celdas, caja: D ? [D.W, D.H, D.P] : null, luces: D ? D.luces : 0,
      semillas: sem.length, semillasConHaz: conHaz, semillasConPosicionFina: conFino,
      colorPropio: COLOR.activo, saturacionDelColor: COLOR.saturacion,
      semillasPintadasConSuColor: COLOR.pintadas,
      semillasSinColorPropio: sem.filter(s => !s.col).length,
      hazRespetado: leyPuesta() || conHaz === 0,
      posicionFinaRespetada: leyPuesta() || conFino === 0,
      glowFocus: mc.glowFocus, glowGain: mc.glowGain, glowLevel: mc.glowLevel,
      luzSubVivo: typeof mcLuzSubAjusta === 'function' && leyPuesta()
    };
    console.log([
      '☀️ Caja de luz dinámica · ' + r.bake,
      '  byte escrito ........ ' + maxByte + '  (techo de la Ley: ' + t.techo + ' = alcance ' + t.alcance + ' × SUB ' + t.SUB + ')  ' + (r.dentroDeLaLey ? '✅' : '⛔ FUERA DE LA LEY'),
      '  caja ................ ' + (r.caja ? r.caja.join('×') : '—') + '   celdas con luz: ' + celdas,
      '  semillas ............ ' + sem.length + '   con haz: ' + conHaz + (r.hazRespetado ? ' ✅' : ' ⛔ ignoradas (esfera en vez de cono)'),
      '  posición fina ....... ' + conFino + '/' + sem.length + (r.posicionFinaRespetada ? ' ✅' : ' ⛔ ignorada (bandazo al cruzar de celda)'),
      '  mandos legales ...... glowGain=' + mc.glowGain + '  glowLevel=' + mc.glowLevel + '  glowFocus=' + mc.glowFocus,
      '',
      'game.luzLey.off() devuelve la LUT · game.luzLey.on() la Ley'
    ].join('\n'));
    return r;
  },
  // El informe de la foto, sin sacar foto. `game.informes.recarga()` hace `MC_INFORMES.clear()` y
  // relee `data/informes/`, así que se llevaría el nuestro por delante: esto lo vuelve a poner.
  informe(){ registraInforme(); const d = informeColorParticulas(); console.log(d); return d; }
};
if (EN_MOTOR) {
  // El motor manda. Ni se toca `W.mcDynBake` ni se pisa `game.luzLey`: aquí solo se añade el informe,
  // y `game.luzLey.informe()` del motor no existe, así que se le engancha.
  W.game.luzLey.informe = API.informe;
  console.log('☀️ La Ley ya vive en app.js (mcDynBakeLey + game.luzLey): este snippet solo añade el informe.');
} else {
  W.game.luzLey = API;
  API.on();
}
if (registraInforme()) {
  console.log('📸 Informe «color-particulas» registrado: Alt+F lo mete en la ficha de la foto ' +
              '(o game.luzLey.informe() para verlo ya).');
} else {
  console.warn('📸 Este motor no tiene mcInformeDefine: sin informe de foto. Usa game.luzLey.informe().');
}
})();
"""


def construir():
    verbatim, commit = mcdynbake_verbatim()
    return CABECERA.replace('__COMMIT__', commit[:7]) + verbatim + PIE


def publicar(a_fichero=False):
    code = construir()
    data = {'id': ID, 'name': NOMBRE, 'code': code,
            'savedAt': datetime.datetime.now().strftime('%Y-%m-%dT%H:%M:%S')}
    if a_fichero:
        destino = os.path.join(RAIZ, 'data', 'snippets', ID + '.json')
        with open(destino, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False)
        print('Escrito %s (%d caracteres de código)' % (destino, len(code)))
        return True
    cuerpo = json.dumps(data, ensure_ascii=False).encode('utf-8')
    req = urllib.request.Request(API + '/api/snippets', data=cuerpo, method='POST',
                                 headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            r.read()
        print('Publicado por POST /api/snippets · %s (%d caracteres)' % (ID, len(code)))
        return True
    except (urllib.error.URLError, OSError) as e:
        print('No se pudo publicar por HTTP (%s). El servidor tiene que estar en pie: '
              'python3 server.py 8500' % e, file=sys.stderr)
        return False


if __name__ == '__main__':
    if '--ver' in sys.argv:
        print(construir())
        sys.exit(0)
    sys.exit(0 if publicar('--fichero' in sys.argv) else 1)
