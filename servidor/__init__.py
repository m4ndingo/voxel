"""Los módulos que importa server.py.

`server.py` se queda en la raíz porque es lo que se teclea para arrancar (`python3 server.py 8500`);
lo que él importa vive aquí para que la raíz no acumule ficheros sueltos.

  · mundos.py — listado de /map/: estadísticas y miniatura cenital de cada mundo.
  · voxfmt.py — formato voxelworld-2 (cabecera JSON + rejilla densa en .vox).

Ambos resuelven sus rutas contra la RAÍZ DEL REPO, no contra esta carpeta.
"""
