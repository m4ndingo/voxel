#!/usr/bin/env python3
"""REQ-INF1 · Compara los INFORMES de dos fotos y dice QUÉ cambió entre ellas.

El dueño reporta los saltos de luz siempre igual: «mira las fotos #87 y #88, hay un salto brusco». Las dos fotos
se parecen, así que a ojo no se puede decir si saltó la LEY, saltó el REPARTO de emisores o se movió un emisor de
celda. Esto lo contesta con números, leyendo lo que la propia captura ya midió.

    python3 herramientas/comparar_fotos.py 87 88
    python3 herramientas/comparar_fotos.py 87 88 --celdas 20

No escribe nada: solo lee data/fotos/.
"""
import json, os, re, sys, argparse

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FOTOS = os.path.join(BASE, 'data', 'fotos')
INFORMES = os.path.join(FOTOS, 'informes')


def busca(ref):
    """Acepta el id entero, o solo el número ('87', '0087')."""
    if os.path.isfile(os.path.join(FOTOS, ref + '.json')):
        return ref
    n = re.sub(r'\D', '', ref)
    if not n:
        sys.exit('no entiendo la foto «%s»' % ref)
    pref = n.zfill(4) + '_'
    cand = sorted(f[:-5] for f in os.listdir(FOTOS) if f.startswith(pref) and f.endswith('.json'))
    if not cand:
        sys.exit('no encuentro ninguna foto %s en %s' % (n, FOTOS))
    return cand[-1]


def carga(idd):
    with open(os.path.join(FOTOS, idd + '.json'), encoding='utf-8') as f:
        ficha = json.load(f)
    inf = {}
    d = os.path.join(INFORMES, idd)
    if os.path.isdir(d):
        for fn in sorted(os.listdir(d)):
            if fn.endswith('.json'):
                with open(os.path.join(d, fn), encoding='utf-8') as f:
                    inf[fn[:-5]] = json.load(f)
    return ficha, inf


def dif(a, b, etiq, unidad='', pct=True):
    if a is None or b is None:
        return
    try:
        d = b - a
    except TypeError:
        if a != b:
            print('  %-34s %s → %s' % (etiq, a, b))
        return
    marca = ''
    if pct and a:
        p = 100.0 * d / abs(a)
        marca = '   (%+.1f %%)' % p
        if abs(p) >= 5:
            marca += '  <<<'
    print('  %-34s %-12s → %-12s Δ %+.3f%s%s' % (etiq, round(a, 3), round(b, 3), d, unidad, marca))


def main():
    ap = argparse.ArgumentParser(description='Compara los informes de dos fotos.')
    ap.add_argument('a'); ap.add_argument('b')
    ap.add_argument('--celdas', type=int, default=12, help='cuántas celdas discrepantes listar')
    o = ap.parse_args()

    ia, ib = busca(o.a), busca(o.b)
    fa, ina = carga(ia)
    fb, inb = carga(ib)
    print('A = %s\nB = %s\n' % (ia, ib))

    print('CÁMARA  (si esto no se mueve, la luz no tiene excusa para moverse)')
    for k in ('pos', 'celda', 'yaw', 'pitch'):
        if fa.get(k) != fb.get(k):
            print('  %-34s %s → %s' % (k, fa.get(k), fb.get(k)))
        else:
            print('  %-34s %s  (igual)' % (k, fa.get(k)))
    ta, tb = fa.get('tool') or {}, fb.get('tool') or {}
    if ta.get('key') != tb.get('key'):
        print('  %-34s %s → %s' % ('herramienta', ta.get('key'), tb.get('key')))

    faltan = [n for n in ('luz-semillas', 'luz-campo', 'luz-tope', 'luz-agujeros') if n not in ina or n not in inb]
    if faltan:
        print('\n⚠ faltan informes en disco (%s). ¿Se sacaron las fotos con el servidor viejo?' % ', '.join(faltan))

    if 'luz-semillas' in ina and 'luz-semillas' in inb:
        sa, sb = ina['luz-semillas'], inb['luz-semillas']
        print('\nREPARTO DE EMISORES  (si el corte se mueve, hay luces que se apagan ENTERAS)')
        dif(sa.get('candidatas'), sb.get('candidatas'), 'candidatas', pct=False)
        dif(sa.get('usadas'), sb.get('usadas'), 'usadas', pct=False)
        print('  %-34s %s → %s' % ('saturado', sa.get('saturado'), sb.get('saturado')))
        ca, cb = sa.get('corte') or {}, sb.get('corte') or {}
        dif(ca.get('primeraFuera'), cb.get('primeraFuera'), 'corte: 1ª que se cae (bloques)')
        if sa.get('porOrigen') != sb.get('porOrigen'):
            print('  %-34s %s → %s' % ('por origen', sa.get('porOrigen'), sb.get('porOrigen')))
        # ¿Algún emisor cambió de CELDA? Es lo que pasó entre las fotos 83 y 84.
        ea = {i: e for i, e in enumerate(sa.get('emisores') or []) if e.get('de') == 'mano'}
        eb = {i: e for i, e in enumerate(sb.get('emisores') or []) if e.get('de') == 'mano'}
        cambios = [(i, ea[i]['cel'], eb[i]['cel']) for i in ea if i in eb and ea[i]['cel'] != eb[i]['cel']]
        print('  %-34s %d de %d emisores de la mano' % ('CAMBIAN DE CELDA', len(cambios), len(ea)))
        for i, x, y in cambios[:6]:
            print('      emisor %d: %s → %s' % (i, x, y))

    if 'luz-tope' in ina and 'luz-tope' in inb:
        pa, pb = ina['luz-tope'], inb['luz-tope']
        if pa.get('recorte') and pb.get('recorte'):
            print('\nEL TOPE DEL BFS  (luz que la ley daba y no se guardó, SIN nada en medio que la tape)')
            dif((pa['recorte'] or {}).get('recorteEnAireLibre'), (pb['recorte'] or {}).get('recorteEnAireLibre'),
                'niveles perdidos en aire libre')
            dif((pa['totales'] or {}).get('pctRecortadasEnAireLibre'), (pb['totales'] or {}).get('pctRecortadasEnAireLibre'),
                '% de celdas libres recortadas', pct=False)
            dif((pa['recorte'] or {}).get('peor'), (pb['recorte'] or {}).get('peor'), 'peor recorte en una celda', ' niveles')
            ca_, cb_ = pa.get('caminoVsRecta') or {}, pb.get('caminoVsRecta') or {}
            dif(ca_.get('medio'), cb_.get('medio'), 'camino sobrante medio', ' bloques')
            dif(ca_.get('peor'), cb_.get('peor'), 'camino sobrante peor', ' bloques')
            ea, eb = pa.get('escalones') or {}, pb.get('escalones') or {}
            dif(ea.get('cuantos'), eb.get('cuantos'), 'escalones entre vecinas', pct=False)
            dif(ea.get('peor'), eb.get('peor'), 'peor escalón', ' niveles')
            # Las condiciones: el dueño avisa de que el salto depende de dónde esté y de qué lleve en la mano.
            ca, cb = pa.get('condiciones') or {}, pb.get('condiciones') or {}
            for k in ('herramienta', 'emisores', 'focus', 'glowLevel'):
                if ca.get(k) != cb.get(k):
                    print('  %-34s %s → %s   <<< cambió la condición' % (k, ca.get(k), cb.get(k)))

    if 'luz-agujeros' in ina and 'luz-agujeros' in inb:
        ga, gb = ina['luz-agujeros'], inb['luz-agujeros']
        if ga.get('hueco') and gb.get('hueco'):
            print('\nAGUJEROS  (celdas que la ley enciende, se ve su emisor y el campo deja apagadas)')
            dif((ga['totales'] or {}).get('agujeros'), (gb['totales'] or {}).get('agujeros'), 'agujeros', pct=False)
            dif((ga['totales'] or {}).get('muertosPorElCamino'), (gb['totales'] or {}).get('muertosPorElCamino'),
                'a los que se les MUERE el frente', pct=False)
            dif((ga['hueco'] or {}).get('luzQueFalta'), (gb['hueco'] or {}).get('luzQueFalta'), 'niveles que faltan')
            dif((ga['hueco'] or {}).get('peor'), (gb['hueco'] or {}).get('peor'), 'peor celda', ' niveles')

    if 'luz-campo' in ina and 'luz-campo' in inb:
        ka, kb = ina['luz-campo'], inb['luz-campo']
        print('\nEL CAMPO  (resolución mínima del campo: %s niveles)' % ka.get('resolucionMinima'))
        ta_, tb_ = ka.get('totales') or {}, kb.get('totales') or {}
        dif(ta_.get('sumaBFS'), tb_.get('sumaBFS'), 'suma de luz medida')
        dif(ta_.get('encendidas'), tb_.get('encendidas'), 'celdas encendidas', pct=True)
        da, db = ka.get('desvio') or {}, kb.get('desvio') or {}
        dif(da.get('max'), db.get('max'), 'desvío BFS↔ley MÁX', ' niveles')
        dif(da.get('medio'), db.get('medio'), 'desvío BFS↔ley medio', ' niveles')
        dif(ka.get('semillasFueraDeLaCaja'), kb.get('semillasFueraDeLaCaja'), 'emisores fuera de la caja', pct=False)
        if ka.get('caja') != kb.get('caja'):
            print('  %-34s %s → %s' % ('caja del campo', ka.get('caja'), kb.get('caja')))

        # Celda a celda: el corte horizontal es lo único que se puede comparar posición por posición.
        qa, qb = ka.get('corte') or {}, kb.get('corte') or {}
        if qa.get('filas') and qb.get('filas') and qa.get('x0') == qb.get('x0') and qa.get('z0') == qb.get('z0') \
           and qa.get('y') == qb.get('y'):
            peor = []
            for j, (ra, rb) in enumerate(zip(qa['filas'], qb['filas'])):
                for i, (va, vb) in enumerate(zip(ra, rb)):
                    if va != vb:
                        peor.append((abs(vb - va), qa['x0'] + i, qa['y'], qa['z0'] + j, va, vb))
            peor.sort(reverse=True)
            print('\n  CELDAS QUE MÁS SALTAN (corte a y=%s, %d de %d cambian)'
                  % (qa['y'], len(peor), len(qa['filas']) * len(qa['filas'][0])))
            for d, x, y, z, va, vb in peor[:o.celdas]:
                print('      (%3d,%3d,%3d)  %6.2f → %-6.2f  Δ %+.2f' % (x, y, z, va, vb, vb - va))
            if peor:
                print('      salto máximo en UNA celda: %.2f niveles (%.1f× la resolución)'
                      % (peor[0][0], peor[0][0] / (ka.get('resolucionMinima') or 0.25)))
        else:
            print('\n  (los dos cortes no cuadran en sitio: no se pueden comparar celda a celda)')


if __name__ == '__main__':
    main()
