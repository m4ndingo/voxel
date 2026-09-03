#!/usr/bin/env python3
"""Engancha `texturas-embebidas` al final de `mundo-autoarranque`.

Por qué un parche y no reescribir el snippet: hay DOS copias vivas de cada snippet (el .json del
repo y la que sirve /api/snippets), y `mundo-autoarranque` son 300 KB que nadie va a reescribir a
mano. El parche es idempotente: busca su ancla y si ya está, no toca nada.

Qué arregla el snippet enganchado: `ingestTextures` dejaba que la copia embebida de una textura
(sin `caras`) pisara al asset real, y `restore()` la vuelve a meter en CADA arranque desde
localStorage — por eso el fallo sobrevive a recargar y no aparece en incógnito. Ver BUG-TEX1.

Uso:  python3 herramientas/parche_snp_texturas_embebidas.py [--publicar]
"""
import json
import os
import sys
import tempfile
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SNIP = os.path.join(RAIZ, 'data', 'snippets', 'mundo-autoarranque.json')
ANCLA = '// ==TEXTURAS-EMBEBIDAS=='
TROZO = '''

// ==TEXTURAS-EMBEBIDAS== (parche_snp_texturas_embebidas.py — no editar a mano)
// La copia de textura embebida en un documento es un RESPALDO: no puede pisar al asset real.
// Se espera a propósito: repara la pestaña ANTES de que se vea el primer fotograma envenenado.
await game.snippet("texturas-embebidas", { noshow: true });
// ==FIN-TEXTURAS-EMBEBIDAS==
'''


def main():
    with open(SNIP, encoding='utf-8') as f:
        doc = json.load(f)
    if ANCLA in doc['code']:
        print('ya estaba parcheado; nada que hacer')
    else:
        doc['code'] = doc['code'].rstrip() + '\n' + TROZO
        fd, tmp = tempfile.mkstemp(dir=os.path.dirname(SNIP), suffix='.tmp')
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            json.dump(doc, f, ensure_ascii=False, indent=2)
        os.replace(tmp, SNIP)
        print('parcheado %s (+%d bytes)' % (SNIP, len(TROZO)))

    if '--publicar' in sys.argv:
        tok = ''
        try:
            with open('/root/voxelforge.env', encoding='utf-8') as f:
                for ln in f:
                    if ln.startswith('VOXELFORGE_TOKEN='):
                        tok = ln.split('=', 1)[1].strip()
        except OSError:
            pass
        req = urllib.request.Request(
            'http://localhost:8500/api/snippets',
            data=json.dumps(doc, ensure_ascii=False).encode('utf-8'),
            headers={'Content-Type': 'application/json', 'X-VoxelForge-Token': tok},
            method='POST')
        with urllib.request.urlopen(req, timeout=60) as r:
            print('publicado:', r.read().decode('utf-8')[:200])


if __name__ == '__main__':
    main()
