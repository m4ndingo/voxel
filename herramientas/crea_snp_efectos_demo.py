#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""REQ-SNP-LIB4 · `efectos-demo`: qué más sale del motor que estaba dentro de la espada.

Dueño, al aprobar sacar el motor a librería: «*haz cuando termines un snippet de demostracion para
lo que decias de los efectos gratis "chispas, el polvo al romper, las hojas, el humo"*», y luego:
«*me gustaria por ejemplo cosas practicas como: cielo con estrellas autoiluminadas para ambientes
nocturnos · nieve para entornos invernales · lluvia para entornos de tormenta*».

Los cuatro primeros son chorros (`salpica`) y salen de la configuración, sin una línea de física.
Los tres últimos pedían algo que el motor no tenía y se le añadió en REQ-SNP-LIB2: **emisión
continua sobre un área que viaja con el jugador** (`porSegundo`, `radio`, `alto`) más el vaivén
lateral de la nieve (`deriva`). Las estrellas ni siquiera son partículas: son la capa quieta.

⚠️ Lo que hace que las estrellas funcionen: `game.voxelesUI` se dibuja en el overlay con el shader
plano, SIN luz ni sombreado del sol (app.js:13199). O sea que la capa ya es autoiluminada: un voxel
blanco se ve blanco a medianoche. No hay que pedirle nada al motor.

Publica por POST /api/snippets (papelera + escritura atómica), nunca escribiendo el .json a mano.
"""
import json, os, sys, urllib.request, urllib.error

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API = os.environ.get('VOXEL_API', 'http://localhost:8500')

ID = 'efectos-demo'
NOMBRE = '✨ Efectos: lluvia, nieve, estrellas, chispas…'

CODE = r"""// ── ✨ efectos-demo · siete efectos, ni una línea de física ───────────────────────────────────────
// Corre este snippet y ya tienes las teclas. Todo esto sale del mismo motor que ya llevaba la sangre
// de la espada (REQ-SANGRE1), sacado a librería en REQ-SNP-LIB2:
//
//   AMBIENTE (se encienden y se quedan)          UN GOLPE (salen donde estés mirando)
//     C  cielo de estrellas  ✨                     Y  chispas   · un golpe de metal
//     V  nieve              ❄️                     M  polvo     · romper un bloque
//     L  lluvia             🌧️                     T  hojas     · sacudir un árbol
//                                                  H  humo      · una hoguera
//
//   game.efectos.info()      → qué hay vivo ahora mismo
//   game.efectos.para()      → apagarlo todo
//
// Cada efecto son ~8 líneas de CONFIGURACIÓN. Si algo cae mal, se arregla en `particulas-voxel` y se
// arregla para los siete a la vez — que era el objetivo de sacarlo de la espada.

const P = await game.snippet('particulas-voxel');

// ── 1. Los cuatro «gratis»: chorros desde un punto ───────────────────────────────────────────────
// Cambia respecto a la sangre: el color, cuántas, cuánto duran y hacia dónde salen. Nada más.

const chispas = P.crea({
  grupo: 'chispas', chorro: 16, fuerza: 7, grav: 30,
  dura: 0.8, desvanece: 0.6, vuelo: 1.2,
  posarse: false,          // ⬅️ una chispa NO se posa: se apaga en cuanto toca algo
  hacia: 'radial',
  colores: [[1,0.95,0.55],[1,0.75,0.2],[1,0.55,0.1],[1,1,0.85]]
});

const polvo = P.crea({
  grupo: 'polvo', chorro: 26, fuerza: 2.6, grav: 14,
  dura: 3, desvanece: 2, vuelo: 3, disperso: 0.5,
  hacia: 'radial', rebote: 0.1, roza: 0.2,
  colores: [[0.62,0.56,0.47],[0.72,0.66,0.56],[0.5,0.45,0.38],[0.8,0.75,0.66]]
});

const hojas = P.crea({
  grupo: 'hojas', chorro: 14, fuerza: 1.1, grav: 1.6,   // ⬅️ gravedad de pluma: bajan planeando
  dura: 12, desvanece: 4, vuelo: 20, disperso: 0.9,
  deriva: 0.9, derivaHz: 0.35,                          // ⬅️ y el vaivén de una hoja al caer
  hacia: 'radial', parada: 0.35,
  colores: [[0.35,0.6,0.18],[0.45,0.68,0.22],[0.28,0.48,0.15],[0.6,0.55,0.2]]
});

const humo = P.crea({
  grupo: 'humo', chorro: 10, fuerza: 1.4, grav: -1.8,   // ⬅️ gravedad NEGATIVA: sube
  dura: 2, desvanece: 1.5, vuelo: 6, disperso: 0.35,
  deriva: 0.35, derivaHz: 0.25,
  posarse: false, hacia: 'arriba',
  colores: [[0.45,0.45,0.47],[0.6,0.6,0.62],[0.32,0.32,0.34],[0.72,0.72,0.74]]
});

// ── 2. Nieve y lluvia: emisión continua sobre una caja que viaja con el jugador ──────────────────
// ⚠️ Esto es lo que hace la diferencia entre «practicable» e «inviable»: NO se siembra el mapa, se
// siembra un cubo de `radio` bloques alrededor del jugador y lo que se sale por detrás se recoge.
// Andar bajo la nieve no va dejando un rastro de copos vivos a la espalda.

const nieve = P.crea({
  grupo: 'nieve', porSegundo: 55, radio: 13, alto: 11, fondo: 20,
  fuerza: 1.0, grav: 0.9,          // cae despacio…
  deriva: 0.7, derivaHz: 0.28,     // …y de lado, que es lo que la hace parecer nieve y no granizo
  dura: 25, desvanece: 6,          // ⬅️ CUAJA: se queda posada en el suelo 25 s antes de irse
  vuelo: 30, parada: 0.25, rebote: 0.02, roza: 0.1, tope: 420,
  colores: [[1,1,1],[0.93,0.96,1],[0.86,0.92,1]]
});
nieve.porSegundo = 0;              // definida pero apagada: la enciende la tecla V

const lluvia = P.crea({
  grupo: 'lluvia', porSegundo: 150, radio: 12, alto: 12, fondo: 20,
  fuerza: 16, grav: 42,            // cae rápido y recto
  dura: 0.1, desvanece: 0.1,
  posarse: false,                  // ⬅️ una gota de lluvia NO cuaja: revienta al tocar el suelo
  vuelo: 6, tope: 500,
  colores: [[0.55,0.68,0.85],[0.45,0.58,0.78],[0.68,0.8,0.95]]
});
lluvia.porSegundo = 0;

// ── 3. Estrellas: ni siquiera son partículas ─────────────────────────────────────────────────────
// La capa `game.voxelesUI` se dibuja SIN luz (overlay, shader plano), así que un voxel blanco se ve
// blanco a medianoche: autoiluminadas por construcción, sin pedirle nada al motor de luz.
// Se plantan UNA vez sobre una cúpula y ahí se quedan: coste cero por frame (la capa solo se
// remalla cuando algo cambia). Por eso NO titilan por defecto — titilar es repintar, y repintar es
// remallar la capa entera; el mando está ahí si lo quieres pagar.
// ⚠️ `grosor` NO apila voxeles: es `game.voxelesUI.grosor(grupo, n)`, que agranda el CUBO del grupo
// dejando el voxel donde está. **Una estrella = UN voxel, mida lo que mida.** Apilarlas para engordarlas
// (que es como estaba antes) multiplica la geometría por `grosor³` y la capa entera se sube a la GPU
// cada frame: a grosor 16 eran 4096 voxeles por estrella, 983 040 en total, y ahí se van los fps.
// Así que súbelo sin miedo: de 1 a 16 cuesta exactamente lo mismo, 240 voxeles.
const estrellas = {
  n: 240, radio: 78, altura: 46, grupo: 'estrellas', titila: false, _t: 0, _on: false,
  grosor: 6,          // ⬅️ lado de cada estrella EN VOXELES FINOS (16 = un bloque entero). Gratis.
  enciende(grosor){
    if(grosor) this.grosor = grosor;
    const U = game.voxelesUI, p = 1 / 16;
    U.limpia(this.grupo);
    U.grosor(this.grupo, this.grosor);      // ⬅️ el tamaño lo pone la CAPA, no el número de voxeles
    const cx = mc.dim ? mc.dim.x / 2 : mc.pos[0], cz = mc.dim ? mc.dim.z / 2 : mc.pos[2];
    for(let i = 0; i < this.n; i++){
      // Punto al azar en una media esfera, no en un disco: si no, se amontonan sobre tu cabeza.
      const t = Math.random() * Math.PI * 2, u = Math.random(), r = this.radio * Math.sqrt(u);
      const alt = this.altura + Math.sqrt(Math.max(0, 1 - u)) * 26;
      const b = 0.55 + Math.random() * 0.45;                       // no todas brillan igual
      const tinte = Math.random();
      const col = tinte > 0.88 ? [b*0.75, b*0.85, b] : (tinte < 0.08 ? [b, b*0.86, b*0.7] : [b, b, b]);
      U.pon(Math.round((cx + Math.cos(t) * r) / p), Math.round(alt / p),
            Math.round((cz + Math.sin(t) * r) / p), col, this.grupo);
    }
    this._on = true;
    return this.n;
  },
  apaga(){ game.voxelesUI.limpia(this.grupo); this._on = false; return 0; }
};

// ── 4. Las teclas ────────────────────────────────────────────────────────────────────────────────
// El punto donde cae un efecto de golpe: lo que estés mirando, y si no hay nada, 3 bloques delante.
function enLaMira(){
  if(typeof mcRaycast === 'function'){
    const h = mcRaycast(6, true);
    if(h && h.cell) return [h.cell[0] + 0.5, h.cell[1] + 1.1, h.cell[2] + 0.5];
  }
  const cp = Math.cos(mc.pitch || 0);
  return [mc.pos[0] - Math.sin(mc.yaw||0) * cp * 3,
          mc.pos[1] + 1.2 + Math.sin(mc.pitch||0) * 3,
          mc.pos[2] - Math.cos(mc.yaw||0) * cp * 3];
}

function conmuta(sis, ps, nombre, icono){
  if(sis.porSegundo){ sis.para(); sis.limpia(); toast(icono + ' ' + nombre + ' — parada'); return false; }
  sis.enciende(ps); toast(icono + ' ' + nombre + ' — ' + ps + ' por segundo (misma tecla para parar)');
  return true;
}

game.onKey('y', () => { chispas.salpica(enLaMira()); });
game.onKey('m', () => { polvo.salpica(enLaMira()); });
game.onKey('t', () => { hojas.salpica(enLaMira()); });
game.onKey('h', () => { humo.salpica(enLaMira()); });
game.onKey('v', () => conmuta(nieve, 55, 'Nieve', '❄️'));
game.onKey('l', () => conmuta(lluvia, 150, 'Lluvia', '🌧️'));
game.onKey('c', () => {
  if(estrellas._on){ estrellas.apaga(); toast('✨ Estrellas — fuera'); }
  else { estrellas.enciende();
    toast('✨ ' + estrellas.n + ' estrellas de grosor ' + estrellas.grosor + ' · ' + estrellas.n +
          ' voxeles (el grosor sale gratis) · game.efectos.estrellas.grosor = 16 y C', 4); }
});

game.efectos = { chispas, polvo, hojas, humo, nieve, lluvia, estrellas,
  info(){ return { sistemas: P.info(), estrellas: estrellas._on ? estrellas.n : 0,
                   capa: game.voxelesUI.info() }; },
  para(){ nieve.para(); lluvia.para(); P.limpia(); estrellas.apaga(); return 'todo apagado'; } };

toast('✨ Efectos listos · C estrellas · V nieve · L lluvia · Y chispas · M polvo · T hojas · H humo');
"""


def publicar():
    data = {'id': ID, 'name': NOMBRE, 'code': CODE}
    cuerpo = json.dumps(data, ensure_ascii=False).encode('utf-8')
    req = urllib.request.Request(API + '/api/snippets', data=cuerpo, method='POST',
                                 headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            r.read()
        print('Publicado por POST /api/snippets · %s' % ID)
        return True
    except (urllib.error.URLError, OSError) as e:
        print('No se pudo publicar por HTTP (%s). El servidor tiene que estar en pie: '
              'python3 server.py 8500' % e, file=sys.stderr)
        return False


if __name__ == '__main__':
    sys.exit(0 if publicar() else 1)
