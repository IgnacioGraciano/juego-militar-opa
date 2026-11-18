# Notas para Claude

- Diseño completo: `docs/guion_de_diseno.pdf`. Seguir su "Orden de construcción" y la tabla
  "Alcance de la primera versión". El estado de cada paso está en `README.md`: actualizarlo.
- Ignacio no programa: prueba y reporta. Todo lo que ve el jugador va en español
  rioplatense; comentarios del código, claves de los .json y nombres de funciones y
  variables también en español.
- El juego es web: `index.html` + módulos ES en `src/`, sin paso de compilación ni
  dependencias. Dibujo en Canvas 2D; la interfaz es HTML encima del lienzo.
- `index.html` es un fragmento (sin `<!doctype>`, `<head>` ni `<body>`): así lo publica
  el Artifact de claude.ai, que agrega esa envoltura. `tools/servidor_local.py` hace lo
  mismo para probar en local.
- Antes de entregar, probarlo en Chromium con Playwright (está preinstalado): cargar,
  hacer clic en una provincia, zoom, correr el tiempo, y revisar errores de consola.
  `window.juego` expone el estado para las pruebas.
- Entrega: publicar con la herramienta Artifact (`index.html` + `files` con todo `src/`,
  `data/` y `assets/`) al mismo enlace de siempre, y pasarle el enlace a Ignacio.
- Datos separados del código: todo lo que sea contenido va en `data/*.json`, con un campo
  `"fuente"`. Lo generado (`data/mapa/*`, `assets/mapa/relieve.jpg`) sale de
  `tools/construir_mapa.py` + `tools/config_mapa.json`: no editarlo a mano.
- Coordenadas del mapa: Miller, `escala` unidades por grado (ver `src/geo.js`). Las
  provincias se identifican por índice (orden de `provincias.json`) en tiempo de
  ejecución y por `id` (código ISO 3166-2) en los archivos.
- Ejércitos: en el prototipo salen de la fórmula de `data/reglas/ejercito.json` con
  Correlates of War (`data/historico/poder_militar.json`). Decisión de Ignacio para el
  juego completo: usar los registros reales de cada país; sin registro de ese año,
  estimar con años anteriores; sin ningún dato, por tamaño y poder militar del país.
- Todo número de reglas (combate, movimiento, reclutamiento) va en `data/reglas/*.json`,
  no en el código.
