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
| 3 | Brigadas: crear, mover, mostrar en el mapa | Hecho (4 tipos, cuerpos con general, mano de obra) |
| 4 | Combate y Operaciones básicas | Hecho (plan, calidad, 3 fases, predicción) |
| 5 | Suministro | Hecho (depósitos, zonas verde/amarilla/roja, rutas que se cortan, desgaste) |
| 6 | Aviación | Hecho (escuadrones de 1978, alerta, combate aéreo, aviación en Operaciones, paquetes de ataque, pilotos, disponibilidad) |
| 7 | Economía, sectores y contratos | Hecho (4 sectores, contratos estatales y extranjeros, embargos, impuestos y gasto militar, repuestos) |
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
| Elegir tropas | Clic en su ficha (Mayús suma) | Tocar la ficha |
| Mover tropas | Clic derecho en el destino | Botón Mover y tocar el destino |
| Atacar ya (plantilla rápida) | Clic derecho en una provincia enemiga con tropas | Botón Atacar… |
| Planear una operación | Botón Atacar… o ficha de la provincia enemiga | Igual |
| Ver un país (economía, ejército, aviación) | Clic en el país de la barra o de una ficha, o doble clic en una provincia | Tocar el nombre del país |
| Vista de suministro | V o botón Suministro | Botón Suministro |
| Ataque aéreo | Ficha de una provincia enemiga, o pestaña Aviación del país | Igual |
| Cancelar | Esc | × |

## Ejércitos y combate

- **Ejércitos de arranque:** por ahora salen de una fórmula con los datos de
  Correlates of War del año del escenario (militares, gasto, acero, población):
  `militares × 0,6 (ejército) × 0,45 (en brigadas) ÷ 4.000` = cantidad de
  brigadas. La parte mecanizada y blindada crece con el año y el gasto por
  soldado; la de montaña, con la parte montañosa del país. Ver
  `data/reglas/ejercito.json`.
- **Para el juego completo:** cada país con registros usa su orden de batalla
  real. Sin registros de ese año, estimación con los años anteriores; sin ningún
  dato, por tamaño y poder militar del país.
- **Combate:** `Ventaja = raíz(P_ataque / P_defensa) × Azar(0,8 a 1,2)` por
  hora, con ancho de frente por terreno (llanura 6, ciudad 4, selva 3, montaña 2),
  atrincheramiento, ríos, noche, sorpresa, postura, calidad del plan y
  experiencia del general. Todos los números están en `data/reglas/combate.json`
  y se ajustan probando.
- **Guerra:** para probar, la ficha de una provincia extranjera tiene el botón
  "Declarar la guerra". La justificación llega con la diplomacia (paso 10).
- **Pendiente para pasos siguientes:** marina (paso 9), clima, IA que ataque
  (paso 11). El enemigo hoy solo defiende, intercepta con sus cazas y trae reservas.

## Suministro, aviación y economía

- **Suministro** (`data/reglas/suministro.json`): sale de la capital y llega a
  cada depósito por provincias propias, mucho más barato por tren (red de tren
  de Natural Earth). Cada depósito cubre 300 km en verde y 600 en amarillo.
  Hasta 6 depósitos, en provincias con tren o puerto, 5 días para armarlos.
  Fuera de la zona verde, en guerra, las tropas se desgastan. Tomar o bombardear
  una provincia de la ruta la corta.
- **Aviación** (`data/aviones.json`, `data/reglas/aviacion.json`): modelos de la
  época con datos reales aproximados; el poder aire-aire y de ataque sale de una
  fórmula igual para todos. Escuadrones de 1978 por país (aproximados, a
  verificar). En alerta interceptan; en las Operaciones bombardean, dan apoyo
  cercano y persiguen; los paquetes de ataque pegan a bases, rutas, tropas o
  depósitos, de día, al amanecer o de noche, y se pueden mandar volando bajo.
  Pilotos con experiencia; derribados sobre territorio enemigo quedan presos.
  La disponibilidad diaria depende del mantenimiento y de los repuestos.
- **Economía** (`data/reglas/economia.json`, datos en el escenario): PBI de 1978
  aproximado, impuestos y gasto militar (fondos militares), 4 sectores, equipo
  para brigadas, repuestos, contratos estatales o compras en el exterior (en
  divisas, con embargos: el de Estados Unidos a Chile de 1976 y a Argentina de
  octubre de 1978). Cada brigada nueva usa equipo además de mano de obra.

Para regenerar los datos históricos:

```bash
pip install rdata
python3 tools/construir_poder_militar.py
```

## Datos del mapa

Los archivos de `data/mapa/` y `assets/mapa/relieve.jpg` se generan con un
script de Python a partir de **Natural Earth** (dominio público):

```bash
pip install shapely numpy pillow
python3 tools/construir_mapa.py
```

La configuración (región, países, provincias fusionadas para 1978, nombres,
terreno, cruces de estrecho, correcciones) está en `tools/config_mapa.json`.
El terreno de cada provincia (llanura, ciudad, selva, montaña) sale de las
regiones geográficas de Natural Earth, con correcciones a mano.

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
- `data/escenarios/1978.json`: fecha de inicio, país del jugador, cambios de dueño,
  ley de reclutamiento, rivales y guarniciones (Malvinas, Guayana Francesa).
- `data/reglas/`: reglas del ejército y del combate (números para ajustar).

## Estructura

```
index.html        página del juego (estructura y estilos)
src/              código: datos, mapa, cámara, tiempo, etiquetas, interfaz
data/             datos del juego (.json)
assets/           imágenes
tools/            generador de datos y servidor local (Python)
docs/             guion de diseño
```
