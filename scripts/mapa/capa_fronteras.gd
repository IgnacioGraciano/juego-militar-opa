extends Node2D
## Dibuja costas, fronteras entre países y límites de provincias.
##
## El grosor se mide en píxeles de pantalla: se recalcula con el zoom para que
## las líneas queden finas a cualquier distancia. Las fronteras entre países
## dependen del dueño actual de cada provincia, así que cambian solas cuando
## una provincia cambia de dueño.

const COLOR_PAIS := Color(0.07, 0.06, 0.05, 0.85)
const COLOR_PROVINCIA := Color(0.12, 0.11, 0.09, 0.5)
const COLOR_COSTA := Color(0.08, 0.12, 0.17, 0.5)
const COLOR_SELECCION := Color(1.0, 0.97, 0.85, 0.95)

var zoom := 1.0
var detalle := 0.0
var seleccionada := -1


func actualizar(nuevo_zoom: float, nuevo_detalle: float) -> void:
	if is_equal_approx(nuevo_zoom, zoom) and is_equal_approx(nuevo_detalle, detalle):
		return
	zoom = nuevo_zoom
	detalle = nuevo_detalle
	queue_redraw()


func fijar_seleccion(indice: int) -> void:
	seleccionada = indice
	queue_redraw()


func _draw() -> void:
	var px := 1.0 / zoom  # un píxel de pantalla en unidades del mapa
	var duenos: PackedStringArray = Datos.duenos
	var col_prov := COLOR_PROVINCIA
	col_prov.a *= detalle
	var ancho_pais := (1.4 + 0.8 * detalle) * px

	for k in Datos.frontera_a.size():
		var a: int = Datos.frontera_a[k]
		var b: int = Datos.frontera_b[k]
		var puntos: PackedVector2Array = Datos.frontera_puntos[k]
		if b == -1:
			draw_polyline(puntos, COLOR_COSTA, 1.0 * px, true)
		elif b == -2 or duenos[a] != duenos[b]:
			draw_polyline(puntos, COLOR_PAIS, ancho_pais, true)
		elif col_prov.a > 0.01:
			draw_polyline(puntos, col_prov, 1.0 * px, true)

	if seleccionada >= 0:
		for k in Datos.frontera_a.size():
			if Datos.frontera_a[k] == seleccionada or Datos.frontera_b[k] == seleccionada:
				draw_polyline(Datos.frontera_puntos[k], COLOR_SELECCION, 2.2 * px, true)
