extends Node2D
## Dibuja ríos y bordes de lagos. Los ríos chicos aparecen al acercarse.

const COLOR_RIO := Color(0.27, 0.47, 0.70)
const COLOR_BORDE_LAGO := Color(0.20, 0.36, 0.55, 0.7)
## Ríos con rango menor o igual a este se ven siempre; el resto, solo de cerca.
const RANGO_SIEMPRE_VISIBLE := 5

var zoom := 1.0
var detalle := 0.0


func actualizar(nuevo_zoom: float, nuevo_detalle: float) -> void:
	if is_equal_approx(nuevo_zoom, zoom) and is_equal_approx(nuevo_detalle, detalle):
		return
	zoom = nuevo_zoom
	detalle = nuevo_detalle
	queue_redraw()


func _draw() -> void:
	var px := 1.0 / zoom
	for r in Datos.rios:
		var rango: int = r["rango"]
		var color := COLOR_RIO
		if rango <= RANGO_SIEMPRE_VISIBLE:
			color.a = 0.55 + 0.3 * detalle
		else:
			color.a = 0.75 * detalle
		if color.a < 0.02:
			continue
		var ancho := (1.8 if rango <= 3 else (1.3 if rango <= 6 else 0.9)) * px
		draw_polyline(r["puntos"], color, ancho, true)

	if detalle > 0.02:
		var borde := COLOR_BORDE_LAGO
		borde.a *= detalle
		for l in Datos.lagos:
			for anillo in l["bordes_v"]:
				draw_polyline(anillo, borde, 1.0 * px, true)
