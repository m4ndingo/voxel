#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""REQ-SNP-LIB3 · Adelgazar `herramienta-espada` sacando el motor de sangre a librería.

Dueño: «*el snippet "herramienta-espada" se ha vuelto muy grande, posiblemente tenga codigo
reutilizable, me gustaria saber que se puede externalizar por ejemplo en otro snippet que se llame
con game.snippet(...) para hacerlo mas ligero y entendible*» → y luego «*b)*» (fichero propio para
las sondas, no dentro de `base-npc-skills.json`).

Medido antes: 271 líneas, de las que 170 (63%) eran el motor de sangre — y de esas 170, solo 12
hablaban de sangre. Este parche sustituye ese bloque entero por su configuración:

    const P = await game.snippet('particulas-voxel');
    game.sangre = P.crea({ grupo:'sangre', … });

Las sondas del mundo se van a `sondas-mundo` (las pide `particulas-voxel`, la espada ni se entera).
El comportamiento no cambia: mismos colores, mismo tuning, mismos 30 s.

⚠️ Corre DESPUÉS de crea_snp_sondas_mundo.py y crea_snp_particulas_voxel.py, o la espada se queda
sin librería que pedir.
"""
import json, os, sys, urllib.request, urllib.error

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUTA = os.path.join(RAIZ, 'data', 'snippets', 'herramienta-espada.json')
API = os.environ.get('VOXEL_API', 'http://localhost:8500')

# El motor viejo es todo lo que hay entre estas dos marcas (las puso parche_snp_sangre.py).
INICIO = '// ── \U0001fa78 Sangre:'
FIN = '// …y a la mano.'

NUEVO = r"""// ── 🩸 Sangre: 12 líneas de configuración, el motor está en otro sitio ───────────────────────────
// El sitio del golpe lo da BUG-AG19 (`game.esqueletos.enLaMira().punto`); esto es lo que se dibuja
// ahí. La física, el rebote, el desvanecido y las sondas del mundo NO viven aquí: esto era el 63%
// de este fichero y se fue a dos librerías, que es lo que pidió el dueño (REQ-SNP-LIB1/2):
//
//   · `particulas-voxel` — el motor: caer, chocar, posarse, apagarse. Un rAF para todos los efectos.
//   · `sondas-mundo`     — «¿hay materia de verdad aquí?», por FORMA y no por celda (la foto #56).
//
// Para tocar el EFECTO se toca aquí. Para tocar la FÍSICA se toca la librería, y se arregla para
// todos a la vez. `game.efectos-demo` enseña qué más sale de este mismo motor.
const P = await game.snippet('particulas-voxel');
game.sangre = P.crea({
  grupo: 'sangre',       // su sitio en game.voxelesUI: limpiarla no toca lo que haya plantado nadie
  chorro: 22,            // gotas por tajo
  dura: 30,              // segundos tiradas en el suelo (lo que pidió el dueño)
  desvanece: 4,          // los últimos N de esos segundos, oscureciéndose
  grav: 24,              // más que la del jugador: son gotas, no sacos
  fuerza: 5.5,
  rebote: 0.22,
  vuelo: 8,
  tope: 500,
  hacia: 'mirada',       // salen al revés de por donde ha entrado el filo
  colores: [[0.78,0.08,0.08],[0.66,0.05,0.05],[0.88,0.15,0.12],[0.55,0.03,0.03],[0.83,0.23,0.11]]
});

"""


def aplicar():
    if not os.path.exists(RUTA):
        print('Error: no existe %s' % RUTA, file=sys.stderr)
        return False
    with open(RUTA, 'r', encoding='utf-8') as f:
        data = json.load(f)
    code = data.get('code', '')

    i, j = code.find(INICIO), code.find(FIN)
    if i < 0 or j <= i:
        print('Error: no encuentro las marcas del motor de sangre; nada escrito.', file=sys.stderr)
        return False
    if code[i:j] == NUEVO:
        print('Ya adelgazado y sin cambios: no se toca nada.')
        return True

    antes = len(code.split('\n'))
    code = code[:i] + NUEVO + code[j:]
    data['code'] = code
    despues = len(code.split('\n'))
    print('herramienta-espada: %d → %d líneas (−%d, %.0f%%)'
          % (antes, despues, antes - despues, 100.0 * (antes - despues) / antes))

    cuerpo = json.dumps(data, ensure_ascii=False).encode('utf-8')
    req = urllib.request.Request(API + '/api/snippets', data=cuerpo, method='POST',
                                 headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            r.read()
        print('Publicado por POST /api/snippets · herramienta-espada (REQ-SNP-LIB3)')
        return True
    except (urllib.error.URLError, OSError) as e:
        print('No se pudo publicar por HTTP (%s). El servidor tiene que estar en pie: '
              'python3 server.py 8500' % e, file=sys.stderr)
        return False


if __name__ == '__main__':
    sys.exit(0 if aplicar() else 1)
