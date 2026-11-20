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
| 4 | Combate y Operaciones básicas | Hecho (plan, calidad, combate continuo, predicción) |
| 5 | Suministro | Hecho (depósitos, zonas verde/amarilla/roja, rutas que se cortan, desgaste) |
| 6 | Aviación | Hecho (escuadrones de 1978, alerta, combate aéreo, aviación en Operaciones, paquetes de ataque, pilotos, disponibilidad) |
| 7 | Economía, sectores y contratos | Hecho (4 sectores, contratos estatales y extranjeros, embargos, impuestos y gasto militar, repuestos) |
| 8 | Diseñador de equipamiento | Hecho (variantes de aviones y tanques reales, puntos de diseño, reconversión) |
| 9 | Marina básica | Hecho (zonas, flotas de 1978, misiones, combate en 3 pasos, bloqueo, desembarcos) |
| 10 | Política, diplomacia y árbol de Argentina | Hecho (relaciones, justificación, tensión, voluntad, paz, mediación, árbol 1978, eventos) |
| 11 | IA | Hecho (nivel Medio) |
| 12 | Interfaz, sonido, guardar y cargar | Hecho salvo sonido (3 ranuras en el navegador y código de partida; noticias tipo diario) |

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
| Elegir tropas | Clic en su ficha, o arrastrar una caja con el botón izquierdo (Mayús suma) | Tocar la ficha |
| Una sola brigada | De cerca cada brigada tiene su ficha; en el panel, clic en su fila | Igual |
| Escuadrón | Clic en su ficha (avión) en la base; clic derecho en otra base propia lo muda | Botones del panel |
| Flota | Clic en su ficha en el mar; clic derecho en otra zona la mueve | Botones del panel |
| Mover el mapa | Arrastrar con el botón derecho o del medio, o WASD | Arrastrar |
| Mover tropas | Clic derecho en el destino | Botón Mover y tocar el destino |
| Atacar ya (plantilla rápida) | Clic derecho en una provincia enemiga con tropas | Botón Atacar… |
| Planear una operación | Botón Atacar… o ficha de la provincia enemiga | Igual |
| Ver un país (resumen, diplomacia, ejército, economía, suministro) | Clic en el país de la barra o de una ficha, o doble clic en una provincia | Tocar el nombre del país |
| Mapa político / de suministro | V, o los botones de bandera y caja abajo a la derecha | Botones de abajo |
| Ver una batalla | Clic en el ícono de espadas, o en la lista de operaciones | Tocar el ícono |
| Ataque aéreo | Ficha de una provincia enemiga, o pestaña Ejército del país | Igual |
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
- **Combate continuo (como en HOI4):** el plan (objetivos, eje, fuerzas, postura,
  días de preparación, artillería y aviación) se arma igual; después de la
  preparación y de un bombardeo opcional de 12 h, la batalla corre hora a hora sin
  pausas hasta que un lado se queda sin organización. Si se quiebra el defensor, se
  retira (o se rinde si está cercado) y se toma la provincia; si hay más objetivos
  marcados y llega el suministro, las tropas siguen solas al próximo. Si se agota
  el atacante, el ataque termina. Las reservas entran solas cuando hay lugar en el
  frente. En el mapa, cada batalla tiene un ícono de espadas con una barra (verde
  lo propio, rojo lo enemigo); con clic se ve el detalle y se puede suspender.
  La predicción da la probabilidad de tomar la provincia y los días de combate.
- **Fórmula:** `Ventaja = raíz(P_ataque / P_defensa) × Azar(0,8 a 1,2)` por
  hora, con ancho de frente por terreno (llanura 6, ciudad 4, selva 3, montaña 2),
  atrincheramiento, ríos, noche, sorpresa, postura, calidad del plan y
  experiencia del general. Todos los números están en `data/reglas/combate.json`
  y se ajustan probando.
- **Guerra:** hace falta una justificación (pestaña Diplomacia del otro país).
- **Defensa territorial:** una provincia propia sin brigadas tiene una guarnición
  chica (más grande cuanto más grande la provincia, el doble en ciudades).
- **Pendiente:** clima, sonido, subdividir las provincias más grandes.

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

## Marina, diplomacia, IA y partidas

- **Marina** (`data/barcos.json`, `data/mapa/zonas_maritimas.json`,
  `data/reglas/marina.json`): 16 zonas marítimas, flotas de 1978 aproximadas,
  misiones patrullar, bloquear, escoltar y en puerto. Combate en 3 pasos:
  detección, ataque aéreo y misiles, artillería; los submarinos atacan escondidos.
  Controlar una zona con transportes deja cruzar tropas por mar y desembarcar.
  El bloqueo corta suministro y divisas.
- **Diplomacia** (`data/diplomacia/1978.json`, `data/reglas/diplomacia.json`):
  relaciones, reclamos territoriales, justificación de guerra (25 días con
  reclamo, 60 sin él), tensión mundial, voluntad nacional, alto el fuego o paz
  con cesión, mediación cuando la tensión es alta. Acciones con cada país:
  mejorar relaciones (misión de 4 meses), acuerdo comercial (divisas), pacto de no
  agresión, alianza defensiva (los aliados entran si atacan a uno), ayuda militar
  y denuncia ante la ONU.
- **Noticias:** lo importante (guerras, paz, pérdidas de territorio, eventos,
  propuestas) sale en el centro como la tapa de un diario y pausa el juego hasta
  cerrarla. Lo chico sale un momento abajo y se va solo.
- **Panel del país:** Resumen (con el árbol de decisiones), Diplomacia, Ejército
  (tierra, aire por modelo y mar; producir y comprar en cuatro pasos; diseño),
  Economía y Suministro. La barra de arriba muestra mano de obra, brigadas,
  aviones y barcos con íconos: al pasar el mouse se ve el detalle.
- **Tanques:** se compran o fabrican por compañías de 10; al llegar reequipan a
  las brigadas blindadas y mecanizadas con el tanque más flojo.
- **Árbol de Argentina 1978** (`data/arboles/ARG_1978.json`) con ramas Exterior y
  Fuerzas Armadas, y eventos con fecha (`data/eventos/1978.json`): el laudo del
  Beagle, el embargo de EE.UU., la noche del 21 de diciembre.
- **Diseñador** (`data/reglas/disenador.json`, `data/tanques.json`): variantes de
  aviones (motor, armas, radar, tanques extra, blindaje, contramedidas) y tanques
  (cañón, motor, blindaje).
- **IA nivel Medio** (`src/ia.js`): defiende las fronteras amenazadas, ataca donde
  tiene ventaja y le llega el suministro, arma depósitos, usa aviación y flotas,
  recluta y negocia la paz según su voluntad nacional.
- **Partidas:** botón Partida: 3 ranuras en el navegador o un código de texto para
  pasar la partida a otra compu.

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
