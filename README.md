# Juego de estrategia — Sudamérica 1978-1982

Estrategia de guerra para un jugador. El diseño completo está en
[`docs/guion_de_diseno.pdf`](docs/guion_de_diseno.pdf).

El juego es una página web (HTML + JavaScript, sin instalar nada). Los datos
(países, provincias, bases, escenarios) están en archivos `.json` dentro de
`data/`, separados del código.

## Estado

Orden de construcción del guion. Cada paso termina con algo que se puede probar.

| Paso | Qué | Estado |
|---|---|---|
| 1 | Mapa: relieve, provincias, zoom, cámara | Hecho |
| 2 | Tiempo: pausa y velocidades | Hecho (con día y noche; el clima queda pendiente) |
| 3 | Brigadas: crear, mover, mostrar en el mapa | — |
| 4 | Combate y Operaciones básicas | — |
| 5 | Suministro | — |
| 6 | Aviación | — |
| 7 | Economía, sectores y contratos | — |
| 8 | Diseñador de equipamiento | — |
| 9 | Marina básica | — |
| 10 | Política, diplomacia y árbol de Argentina | — |
| 11 | IA | — |
| 12 | Interfaz, sonido, guardar y cargar | — |

Hasta el paso 2 incluido se usó Godot; desde ahí el juego es web, así se puede
probar en el navegador antes de cada entrega.

## Cómo jugar

Abrir el enlace del juego publicado en claude.ai. No hace falta instalar nada.

Para correrlo en la compu (por ejemplo para programarlo):

```bash
python3 tools/servidor_local.py
```

y abrir <http://localhost:8000>.

### Controles

| Acción | Mouse / teclado | Celular |
|---|---|---|
| Zoom | Rueda (acerca hacia el cursor) | Pellizcar |
| Mover el mapa | Arrastrar, o WASD / flechas | Arrastrar |
| Ver una provincia | Clic | Tocar |
| Pausa | Espacio | Botón Seguir / Pausa |
| Velocidad | 1 a 5, o + y − | Barras de velocidad |
| Noche on/off | N | — |
| Cerrar ficha | Esc | × |

## Datos del mapa

Los archivos de `data/mapa/` y `assets/mapa/relieve.jpg` se generan con un
script de Python a partir de **Natural Earth** (dominio público):

```bash
pip install shapely numpy pillow
python3 tools/construir_mapa.py
```

La configuración (región, países, provincias fusionadas para 1978, nombres,
correcciones) está en `tools/config_mapa.json`.

- **Proyección:** Miller cilíndrica, 30 unidades del mapa por grado. La misma
  fórmula está en `tools/construir_mapa.py` y en `src/geo.js`.
- **Provincias de 1978:** las creadas después se juntan con la provincia de la
  que salieron (Arica y Parinacota, Ñuble, Los Ríos, Tocantins, etc.).
- **Malvinas y Georgias del Sur** empiezan como británicas.
- Cada archivo guarda de qué fuente salieron sus datos (`"fuente"`).

Datos escritos a mano (se pueden editar directo):

- `data/paises.json`: nombre, color y ubicación del nombre de cada país.
- `data/bases.json`: bases aéreas y navales de la época. **Primera versión con
  coordenadas aproximadas, a verificar.**
- `data/escenarios/1978.json`: fecha de inicio, país del jugador, cambios de dueño.

## Estructura

```
index.html        página del juego (estructura y estilos)
src/              código: datos, mapa, cámara, tiempo, etiquetas, interfaz
data/             datos del juego (.json)
assets/           imágenes
tools/            generador de datos y servidor local (Python)
docs/             guion de diseño
```
