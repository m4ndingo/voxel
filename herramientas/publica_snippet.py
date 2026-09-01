#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Publica un fichero .js como snippet del Mundo, por la API.

Uso: python3 herramientas/publica_snippet.py <id> <fichero.js> [--nombre "Nombre visible"]

Por que por la API y no escribiendo `data/snippets/<id>.json` a mano: `POST /api/snippets` respalda
la version anterior en la papelera y escribe de forma atomica; a mano se pierden las dos cosas
(CLAUDE.md, regla de redstone). Es el equivalente en Python de `redstone/make_snippets.js`, para los
snippets que no viven en `redstone/`.

Si no se pasa `--nombre` se conserva el que ya tuviera el snippet en disco.
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = os.environ.get('VOXEL_URL', 'http://localhost:8500')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('id')
    ap.add_argument('fichero')
    ap.add_argument('--nombre', default=None)
    a = ap.parse_args()

    with open(a.fichero, encoding='utf-8') as f:
        code = f.read()

    nombre = a.nombre
    if nombre is None:
        # El nombre visible es del dueño: si no lo dan, se respeta el que hubiera.
        ruta = os.path.join(RAIZ, 'data/snippets', a.id + '.json')
        if os.path.exists(ruta):
            with open(ruta, encoding='utf-8') as f:
                nombre = json.load(f).get('name')

    cuerpo = {'id': a.id, 'code': code}
    if nombre:
        cuerpo['name'] = nombre

    # F0.4 · `POST /api/snippets` es del dueño. En desarrollo esto no hace falta (sin modo público la
    # matriz no se aplica y la herramienta funciona como siempre), pero en un servidor publicado sin
    # la cabecera esto es un 403 — y el sitio donde se descubriría es el despliegue.
    cabeceras = {'Content-Type': 'application/json'}
    token = (os.environ.get('VOXELFORGE_TOKEN') or '').strip()
    if token:
        cabeceras['X-VoxelForge-Token'] = token

    req = urllib.request.Request(BASE + '/api/snippets',
                                 data=json.dumps(cuerpo, ensure_ascii=False).encode('utf-8'),
                                 headers=cabeceras, method='POST')
    try:
        with urllib.request.urlopen(req) as r:
            d = json.loads(r.read().decode('utf-8'))
    except urllib.error.URLError as e:
        print('✗ no se pudo publicar en %s: %s' % (BASE, e), file=sys.stderr)
        return 1
    print('✓ %s · %.1f KB · %s' % (a.id, len(code) / 1024.0, d.get('savedAt', '')))
    return 0


if __name__ == '__main__':
    sys.exit(main())
