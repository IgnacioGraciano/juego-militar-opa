# Juego de estrategia — Sudamérica 1978-1982

Estrategia de guerra para PC, un jugador. El diseño completo está en
[`docs/guion_de_diseno.pdf`](docs/guion_de_diseno.pdf).

Motor: **Godot 4** (GDScript). Los datos (países, provincias, bases, escenarios)
están en archivos `.json` dentro de `data/`, separados del código.

## Estado

Orden de construcción del guion. Cada paso termina con algo que se puede probar.

| Paso | Qué | Estado |
|---|---|---|
| 1 | Mapa: relieve, provincias, zoom, cámara | **Hecho, falta probar en Godot** |
| 2 | Tiempo: pausa y velocidades | **Hecho, falta probar en Godot** (día y noche incluidos; clima no) |
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

## Cómo probarlo

1. Descargar **Godot 4.3 o más nuevo** (versión estándar, no la .NET) de
   <https://godotengine.org/download>. No se instala: es un solo ejecutable.
2. Abrir Godot → **Importar** → elegir el archivo `project.godot` de esta carpeta.
3. La primera vez tarda unos segundos en importar la imagen de relieve.
4. Apretar **F5** (o el botón ▶ arriba a la derecha) para jugar.

### Controles

| Acción | Tecla / mouse |
|---|---|
| Zoom | Rueda del mouse (acerca hacia donde apunta el cursor) |
| Mover el mapa | Arrastrar con botón derecho o del medio, o WASD / flechas |
| Elegir provincia | Clic izquierdo (Esc para soltar) |
| Pausa | Espacio |
| Velocidad | 1 a 5, o + y − |
| Noche on/off | N |

### Qué revisar (paso 1 y 2)

- De lejos: relieve suave, color de cada país translúcido, fronteras finas, nombres de países y capitales.
- De cerca: aparecen los límites de provincias con sus nombres, ríos chicos, más ciudades, puertos y bases.
- Al pasar el mouse se resalta la provincia; al hacer clic se abre su ficha abajo a la izquierda.
- Con el tiempo andando, la sombra de la noche cruza el mapa. Velocidad 3 = 4 segundos por día.
- Si algo se ve mal o aparece un error en la pestaña **Salida** de Godot, copiar el texto del error.

## Datos del mapa

Los archivos de `data/mapa/` y `assets/mapa/relieve.jpg` se generan con un
script de Python a partir de **Natural Earth** (dominio público):

```bash
pip install shapely numpy pillow
python3 tools/construir_mapa.py
```

La configuración (región, países, provincias fusionadas para 1978, nombres)
está en `tools/config_mapa.json`. Detalles:

- **Proyección:** Miller cilíndrica, 30 unidades del mapa por grado. La misma
  fórmula está en `tools/construir_mapa.py` y en `scripts/mapa/geo.gd`.
- **Provincias de 1978:** las creadas después se juntan con la provincia de la
  que salieron (Arica y Parinacota, Ñuble, Los Ríos, Tocantins, etc.). La lista
  está en `fusiones_1978`.
- **Malvinas y Georgias del Sur** empiezan como británicas.
- Cada archivo guarda de qué fuente salieron sus datos (`"fuente"`).

Datos escritos a mano (se pueden editar directo):

- `data/paises.json`: nombre, color y ubicación del nombre de cada país.
- `data/bases.json`: bases aéreas y navales de la época. **Primera versión con
  coordenadas aproximadas, a verificar.**
- `data/escenarios/1978.json`: fecha de inicio, país del jugador, cambios de dueño.

## Estructura

```
project.godot          proyecto de Godot
scenes/principal.tscn  escena principal (arma todo desde código)
scripts/autoload/      Datos (carga los .json) y Tiempo (reloj del juego)
scripts/mapa/          mapa, cámara, fronteras, ríos, etiquetas, proyección
scripts/ui/            interfaz
shaders/               color de provincias y sombra de la noche
data/                  datos del juego (.json)
assets/                imágenes
tools/                 scripts de Python que generan los datos (Godot los ignora)
docs/                  guion de diseño
```

## Exportar el juego

Al crear un perfil de exportación en Godot, agregar `*.json` en
**Recursos → Filtros para exportar archivos que no son recursos**, si no el
juego exportado no encuentra los datos.
