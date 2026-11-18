# Notas para Claude

- Diseño completo: `docs/guion_de_diseno.pdf`. Seguir su "Orden de construcción" y la tabla
  "Alcance de la primera versión". El estado de cada paso está en `README.md`: actualizarlo.
- Ignacio no programa: instala Godot, prueba y reporta. Todo lo que ve el jugador va en
  español rioplatense; comentarios del código y claves de los .json también en español.
  Los nombres de funciones y variables en español (el API de Godot queda en inglés).
- Godot 4.3+, GDScript, renderer GL Compatibility. Las escenas se arman desde código
  (no hay editor en el entorno de Claude); los scripts se referencian con `preload` en
  constantes, sin `class_name`, para no depender de la caché de clases del editor.
- Datos separados del código: todo lo que sea contenido va en `data/*.json`, con un campo
  `"fuente"`. Lo generado (`data/mapa/*`, `assets/mapa/relieve.jpg`) sale de
  `tools/construir_mapa.py` + `tools/config_mapa.json`: no editarlo a mano.
- Coordenadas del mapa: Miller, `escala` unidades por grado (ver `scripts/mapa/geo.gd`).
  Las provincias se identifican por índice (orden de `provincias.json`) en tiempo de
  ejecución y por `id` (código ISO 3166-2) en los archivos.
- Chequeo de sintaxis sin Godot: `pip install "gdtoolkit==4.*"` y `gdparse archivo.gd`.
