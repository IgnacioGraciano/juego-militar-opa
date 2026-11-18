extends Node2D
## Nombres e íconos del mapa (países, regiones, provincias, ciudades, puertos y bases).
##
## Va dentro de un CanvasLayer y dibuja en coordenadas de pantalla, así el
## texto y los íconos tienen siempre el mismo tamaño y se leen nítidos.
## Qué se muestra depende del zoom: de lejos países y capitales; de cerca
## provincias, ciudades, puertos y bases.

const COLOR_TEXTO := Color(0.96, 0.95, 0.9)
const COLOR_CONTORNO := Color(0.05, 0.05, 0.07, 0.85)
const COLOR_PAIS_TEXTO := Color(0.12, 0.1, 0.08, 0.8)
const COLOR_PAIS_CONTORNO := Color(1.0, 0.98, 0.92, 0.35)
const COLOR_REGION := Color(0.22, 0.18, 0.12, 0.6)
const COLOR_PUERTO := Color(0.22, 0.45, 0.85)

var camara: Camera2D
var fuente: Font
var fuente_cursiva: FontVariation

var _rectangulos_usados: Array[Rect2] = []


func _ready() -> void:
	fuente = ThemeDB.fallback_font
	fuente_cursiva = FontVariation.new()
	fuente_cursiva.base_font = fuente
	fuente_cursiva.variation_transform = Transform2D(Vector2(1, 0), Vector2(0.22, 1), Vector2.ZERO)


func _draw() -> void:
	if camara == null:
		return
	var t := get_viewport().get_canvas_transform()
	var z := t.get_scale().x
	var pantalla := get_viewport_rect().grow(40)
	var detalle := smoothstep(1.1, 2.0, z)
	_rectangulos_usados.clear()

	_dibujar_ciudades(t, z, pantalla)
	if z >= 1.0:
		_dibujar_bases(t, z, pantalla)
	if z >= 1.6:
		_dibujar_puertos(t, z, pantalla)
	if detalle > 0.05:
		_dibujar_provincias(t, pantalla, detalle)
	if z < 2.6:
		_dibujar_regiones(t, z, pantalla)
	if detalle < 0.95:
		_dibujar_paises(t, z, 1.0 - detalle)


# ------------------------------------------------------------------ países

func _dibujar_paises(t: Transform2D, z: float, alfa: float) -> void:
	# Un país sin provincias no muestra nombre.
	var con_tierra := {}
	for d in Datos.duenos:
		con_tierra[d] = true
	for etiqueta in Datos.paises:
		if not con_tierra.has(etiqueta):
			continue
		var p: Dictionary = Datos.paises[etiqueta]
		var tam := int(clampf(48.0 * z, 13.0, 46.0) * float(p.get("tamano", 1.0)))
		tam = maxi(tam, 10)
		var texto := _espaciado(String(p["nombre"]).to_upper())
		var ancho := fuente.get_string_size(texto, HORIZONTAL_ALIGNMENT_LEFT, -1, tam).x
		var centro: Vector2 = t * (p["pos_etiqueta"] as Vector2)
		var angulo := deg_to_rad(float(p.get("angulo", 0.0)))
		draw_set_transform(centro, angulo, Vector2.ONE)
		var origen := Vector2(-ancho * 0.5, tam * 0.35)
		var texto_col := COLOR_PAIS_TEXTO
		texto_col.a *= alfa
		var cont_col := COLOR_PAIS_CONTORNO
		cont_col.a *= alfa
		draw_string_outline(fuente, origen, texto, HORIZONTAL_ALIGNMENT_LEFT, -1, tam, 4, cont_col)
		draw_string(fuente, origen, texto, HORIZONTAL_ALIGNMENT_LEFT, -1, tam, texto_col)
		draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


static func _espaciado(texto: String) -> String:
	var out := ""
	for i in texto.length():
		out += texto[i]
		if i < texto.length() - 1:
			out += " "
	return out


# ------------------------------------------------------------------ regiones

func _dibujar_regiones(t: Transform2D, z: float, pantalla: Rect2) -> void:
	# Grandes regiones (Andes, Patagonia, Gran Chaco...) en cursiva tenue.
	var rango_max := 2 if z < 0.7 else (3 if z < 1.4 else 4)
	var alfa := 1.0 - smoothstep(1.8, 2.6, z)
	for r in Datos.regiones:
		if int(r["rango"]) > rango_max:
			continue
		var pos: Vector2 = t * (r["pos_v"] as Vector2)
		if not pantalla.has_point(pos):
			continue
		var tam := int(clampf(float(r["ancho"]) * z * 0.05, 10.0, 18.0))
		var texto: String = r["nombre"]
		var ancho := fuente_cursiva.get_string_size(texto, HORIZONTAL_ALIGNMENT_LEFT, -1, tam).x
		var rect := Rect2(pos.x - ancho * 0.5, pos.y - tam, ancho, tam * 1.3)
		if not _libre(rect):
			continue
		_ocupar(rect)
		var col := COLOR_REGION
		col.a *= alfa
		draw_string(fuente_cursiva, Vector2(pos.x - ancho * 0.5, pos.y), texto,
				HORIZONTAL_ALIGNMENT_LEFT, -1, tam, col)


# ------------------------------------------------------------------ provincias

func _dibujar_provincias(t: Transform2D, pantalla: Rect2, alfa: float) -> void:
	var tam := 12
	for p in Datos.provincias:
		var pos: Vector2 = t * (p["pos_centro"] as Vector2)
		if not pantalla.has_point(pos):
			continue
		var texto: String = p["nombre"]
		var ancho := fuente.get_string_size(texto, HORIZONTAL_ALIGNMENT_LEFT, -1, tam).x
		var rect := Rect2(pos.x - ancho * 0.5, pos.y - tam, ancho, tam * 1.3)
		if not _libre(rect):
			continue
		_ocupar(rect)
		var col := Color(1, 1, 1, 0.75 * alfa)
		var cont := Color(0, 0, 0, 0.6 * alfa)
		var o := Vector2(pos.x - ancho * 0.5, pos.y)
		draw_string_outline(fuente, o, texto, HORIZONTAL_ALIGNMENT_LEFT, -1, tam, 3, cont)
		draw_string(fuente, o, texto, HORIZONTAL_ALIGNMENT_LEFT, -1, tam, col)


# ------------------------------------------------------------------ ciudades

func _rango_ciudades(z: float) -> int:
	if z < 0.6:
		return 1
	if z < 1.0:
		return 3
	if z < 2.0:
		return 5
	if z < 4.0:
		return 7
	return 8


func _dibujar_ciudades(t: Transform2D, z: float, pantalla: Rect2) -> void:
	var rango_max := _rango_ciudades(z)
	var tam := 13 if z >= 1.0 else 12
	# Ya vienen ordenadas por importancia: las primeras ganan el lugar.
	for c in Datos.ciudades:
		var capital: String = c["capital"]
		var mostrar := capital == "pais" or int(c["rango"]) <= rango_max \
				or (capital == "provincia" and z >= 1.0)
		if not mostrar:
			continue
		var pos: Vector2 = t * (c["pos_v"] as Vector2)
		if not pantalla.has_point(pos):
			continue
		var texto: String = c["nombre"]
		var ancho := fuente.get_string_size(texto, HORIZONTAL_ALIGNMENT_LEFT, -1, tam).x
		var radio := 4.0 if capital == "pais" else 2.5
		var rect_punto := Rect2(pos - Vector2(radio, radio), Vector2(radio, radio) * 2)
		var rect_texto := Rect2(pos.x + radio + 3, pos.y - tam * 0.75, ancho, tam * 1.2)
		if not _libre(rect_punto):
			continue
		_ocupar(rect_punto)
		if capital == "pais":
			draw_rect(rect_punto.grow(1), Color.BLACK)
			draw_rect(rect_punto, Color(1, 0.9, 0.5))
		else:
			draw_circle(pos, radio + 1, Color.BLACK)
			draw_circle(pos, radio, Color.WHITE)
		if _libre(rect_texto):
			_ocupar(rect_texto)
			var o := Vector2(pos.x + radio + 3, pos.y + tam * 0.35)
			draw_string_outline(fuente, o, texto, HORIZONTAL_ALIGNMENT_LEFT, -1, tam, 4, COLOR_CONTORNO)
			draw_string(fuente, o, texto, HORIZONTAL_ALIGNMENT_LEFT, -1, tam, COLOR_TEXTO)


# ------------------------------------------------------------------ puertos y bases

func _dibujar_puertos(t: Transform2D, z: float, pantalla: Rect2) -> void:
	var con_nombre := z >= 3.0
	for p in Datos.puertos:
		var pos: Vector2 = t * (p["pos_v"] as Vector2)
		if not pantalla.has_point(pos):
			continue
		_icono_ancla(pos)
		if con_nombre:
			_texto_chico(pos + Vector2(8, 4), p["nombre"], Color(0.8, 0.88, 1.0))


func _dibujar_bases(t: Transform2D, z: float, pantalla: Rect2) -> void:
	var con_nombre := z >= 2.5
	for b in Datos.bases:
		var pos: Vector2 = t * (b["pos_v"] as Vector2)
		if not pantalla.has_point(pos):
			continue
		var color := Datos.color_pais(b["pais"])
		match String(b["tipo"]):
			"aerea":
				_icono_avion(pos, color)
			"aeronaval":
				_icono_avion(pos, color)
				_icono_ancla(pos + Vector2(7, 5), 0.7)
			_:
				_icono_ancla(pos, 1.1, color)
		if con_nombre:
			var rect := Rect2(pos.x + 9, pos.y - 6, 120, 14)
			if _libre(rect):
				_ocupar(rect)
				_texto_chico(pos + Vector2(9, -6), b["nombre"], Color(1.0, 0.92, 0.8))


func _icono_avion(pos: Vector2, color: Color) -> void:
	# Silueta simple de avión visto desde arriba.
	var s := 6.0
	var cuerpo := PackedVector2Array([
		pos + Vector2(0, -s), pos + Vector2(s * 0.9, s * 0.3), pos + Vector2(s * 0.25, s * 0.15),
		pos + Vector2(s * 0.45, s * 0.9), pos + Vector2(0, s * 0.6), pos + Vector2(-s * 0.45, s * 0.9),
		pos + Vector2(-s * 0.25, s * 0.15), pos + Vector2(-s * 0.9, s * 0.3)])
	draw_circle(pos, s + 2.0, Color(0, 0, 0, 0.55))
	draw_colored_polygon(cuerpo, color.lightened(0.25))
	cuerpo.append(cuerpo[0])
	draw_polyline(cuerpo, Color.BLACK, 1.0, true)


func _icono_ancla(pos: Vector2, escala := 1.0, color := COLOR_PUERTO) -> void:
	var s := 5.0 * escala
	draw_circle(pos, s + 2.0, Color(0, 0, 0, 0.55))
	draw_circle(pos, s + 0.5, color)
	var blanco := Color(1, 1, 1, 0.95)
	draw_line(pos + Vector2(0, -s * 0.7), pos + Vector2(0, s * 0.6), blanco, 1.2, true)
	draw_line(pos + Vector2(-s * 0.4, -s * 0.35), pos + Vector2(s * 0.4, -s * 0.35), blanco, 1.2, true)
	draw_arc(pos + Vector2(0, s * 0.05), s * 0.55, deg_to_rad(20), deg_to_rad(160), 8, blanco, 1.2, true)


func _texto_chico(pos: Vector2, texto: String, color: Color) -> void:
	draw_string_outline(fuente, pos, texto, HORIZONTAL_ALIGNMENT_LEFT, -1, 11, 3, COLOR_CONTORNO)
	draw_string(fuente, pos, texto, HORIZONTAL_ALIGNMENT_LEFT, -1, 11, color)


# ------------------------------------------------------------------ superposición

func _libre(r: Rect2) -> bool:
	for u in _rectangulos_usados:
		if u.intersects(r):
			return false
	return true


func _ocupar(r: Rect2) -> void:
	_rectangulos_usados.append(r)
