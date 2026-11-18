extends Control
## Interfaz sobre el mapa: fecha y velocidad, ayuda, y panel de la provincia elegida.

const Mapa = preload("res://scripts/mapa/mapa.gd")

const TIPOS := {
	"Province": "Provincia", "State": "Estado", "Department": "Departamento",
	"Region": "Región", "Federal District": "Distrito federal", "Capital District": "Distrito capital",
	"Federal Dependency": "Dependencia federal", "Capital City": "Ciudad capital",
	"Autonomous City": "Ciudad autónoma", "District": "Distrito", "Federal Territory": "Territorio federal",
	"Intendancy": "Intendencia", "Commissiary": "Comisaría", "Overseas department": "Departamento de ultramar",
	"Overseas region": "Región de ultramar", "Constitutional Province": "Provincia constitucional",
}

var mapa: Mapa

var _fecha: Label
var _hora: Label
var _boton_pausa: Button
var _barras_velocidad: Array[ColorRect] = []
var _panel_provincia: PanelContainer
var _info_titulo: Label
var _info_texto: Label
var _cursor: Label


func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_crear_barra_tiempo()
	_crear_ayuda()
	_crear_panel_provincia()
	_crear_texto_cursor()
	Tiempo.hora_pasada.connect(func(_h): _actualizar_tiempo())
	Tiempo.estado_cambiado.connect(_actualizar_tiempo)
	_actualizar_tiempo()
	mapa.provincia_seleccionada.connect(_mostrar_provincia)
	mapa.provincia_bajo_cursor.connect(_mostrar_cursor)


func _unhandled_input(event: InputEvent) -> void:
	if not (event is InputEventKey):
		return
	var k := event as InputEventKey
	if not k.pressed or k.echo:
		return
	match k.keycode:
		KEY_SPACE, KEY_P:
			Tiempo.alternar_pausa()
		KEY_1, KEY_2, KEY_3, KEY_4, KEY_5:
			Tiempo.fijar_velocidad(k.keycode - KEY_0)
		KEY_KP_1, KEY_KP_2, KEY_KP_3, KEY_KP_4, KEY_KP_5:
			Tiempo.fijar_velocidad(k.keycode - KEY_KP_0)
		KEY_EQUAL, KEY_PLUS, KEY_KP_ADD:
			Tiempo.acelerar()
		KEY_MINUS, KEY_KP_SUBTRACT:
			Tiempo.frenar()
		KEY_N:
			mapa.alternar_noche()
		KEY_ESCAPE:
			mapa.seleccionar(-1)
		_:
			return
	get_viewport().set_input_as_handled()


# ------------------------------------------------------------------ armado

static func estilo_panel() -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = Color(0.07, 0.08, 0.1, 0.86)
	s.border_color = Color(0.55, 0.5, 0.38, 0.6)
	s.set_border_width_all(1)
	s.set_corner_radius_all(3)
	s.set_content_margin_all(10)
	return s


func _panel() -> PanelContainer:
	var p := PanelContainer.new()
	p.add_theme_stylebox_override("panel", estilo_panel())
	add_child(p)
	return p


## Ubica un control en una esquina, con el tamaño justo para su contenido.
func anclar(c: Control, preset: Control.LayoutPreset, margen := 12) -> void:
	var derecha := preset in [Control.PRESET_TOP_RIGHT, Control.PRESET_BOTTOM_RIGHT, Control.PRESET_CENTER_RIGHT]
	var abajo := preset in [Control.PRESET_BOTTOM_LEFT, Control.PRESET_BOTTOM_RIGHT, Control.PRESET_CENTER_BOTTOM]
	var centro := preset in [Control.PRESET_CENTER_BOTTOM, Control.PRESET_CENTER_TOP]
	c.grow_horizontal = Control.GROW_DIRECTION_BOTH if centro else (
			Control.GROW_DIRECTION_BEGIN if derecha else Control.GROW_DIRECTION_END)
	c.grow_vertical = Control.GROW_DIRECTION_BEGIN if abajo else Control.GROW_DIRECTION_END
	c.reset_size()
	c.set_anchors_and_offsets_preset(preset, Control.PRESET_MODE_MINSIZE, margen)


func _boton(texto: String, accion: Callable, ayuda: String) -> Button:
	var b := Button.new()
	b.text = texto
	b.tooltip_text = ayuda
	b.focus_mode = Control.FOCUS_NONE
	b.custom_minimum_size = Vector2(30, 0)
	b.pressed.connect(accion)
	return b


func _crear_barra_tiempo() -> void:
	var p := _panel()
	var fila := HBoxContainer.new()
	fila.add_theme_constant_override("separation", 10)
	p.add_child(fila)

	var textos := VBoxContainer.new()
	textos.add_theme_constant_override("separation", 0)
	_fecha = Label.new()
	_fecha.add_theme_font_size_override("font_size", 17)
	_fecha.custom_minimum_size = Vector2(230, 0)
	_hora = Label.new()
	_hora.add_theme_color_override("font_color", Color(0.75, 0.75, 0.72))
	textos.add_child(_fecha)
	textos.add_child(_hora)
	fila.add_child(textos)

	_boton_pausa = _boton("II", Tiempo.alternar_pausa, "Pausa (Espacio)")
	_boton_pausa.custom_minimum_size = Vector2(44, 0)
	fila.add_child(_boton_pausa)
	fila.add_child(_boton("-", Tiempo.frenar, "Más lento (-)"))

	var barras := HBoxContainer.new()
	barras.add_theme_constant_override("separation", 3)
	barras.alignment = BoxContainer.ALIGNMENT_CENTER
	for i in Tiempo.SEGUNDOS_POR_DIA.size():
		var r := ColorRect.new()
		r.custom_minimum_size = Vector2(7, 12 + i * 3)
		r.size_flags_vertical = Control.SIZE_SHRINK_END
		r.mouse_filter = Control.MOUSE_FILTER_IGNORE
		barras.add_child(r)
		_barras_velocidad.append(r)
	fila.add_child(barras)
	fila.add_child(_boton("+", Tiempo.acelerar, "Más rápido (+)"))
	anclar.call_deferred(p, Control.PRESET_TOP_RIGHT)


func _crear_ayuda() -> void:
	var p := _panel()
	var caja := VBoxContainer.new()
	p.add_child(caja)
	var titulo := Label.new()
	var jugador: String = Datos.escenario.get("pais_jugador", "")
	titulo.text = "%s  ·  %s" % [Datos.escenario.get("nombre", ""), Datos.nombre_pais(jugador)]
	titulo.add_theme_font_size_override("font_size", 16)
	caja.add_child(titulo)
	var ayuda := Label.new()
	ayuda.text = "Rueda: zoom   ·   Botón derecho o WASD: mover   ·   Clic: elegir provincia\n" \
			+ "Espacio: pausa   ·   1-5 o +/-: velocidad   ·   N: noche   ·   Esc: soltar"
	ayuda.add_theme_font_size_override("font_size", 12)
	ayuda.add_theme_color_override("font_color", Color(0.72, 0.72, 0.68))
	caja.add_child(ayuda)
	anclar.call_deferred(p, Control.PRESET_TOP_LEFT)


func _crear_panel_provincia() -> void:
	_panel_provincia = _panel()
	_panel_provincia.custom_minimum_size = Vector2(320, 0)
	var caja := VBoxContainer.new()
	_panel_provincia.add_child(caja)
	_info_titulo = Label.new()
	_info_titulo.add_theme_font_size_override("font_size", 20)
	caja.add_child(_info_titulo)
	_info_texto = Label.new()
	_info_texto.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_info_texto.custom_minimum_size = Vector2(300, 0)
	caja.add_child(_info_texto)
	_panel_provincia.visible = false


func _crear_texto_cursor() -> void:
	_cursor = Label.new()
	_cursor.add_theme_font_size_override("font_size", 14)
	_cursor.add_theme_color_override("font_outline_color", Color.BLACK)
	_cursor.add_theme_constant_override("outline_size", 4)
	_cursor.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_cursor.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	add_child(_cursor)


# ------------------------------------------------------------------ actualización

func _actualizar_tiempo() -> void:
	_fecha.text = Tiempo.texto_fecha()
	_hora.text = "%s (hora local)%s" % [Tiempo.texto_hora(), "   EN PAUSA" if Tiempo.pausado else ""]
	_boton_pausa.text = ">" if Tiempo.pausado else "II"
	for i in _barras_velocidad.size():
		var activa := i < Tiempo.velocidad
		_barras_velocidad[i].color = Color(0.95, 0.8, 0.4) if activa else Color(0.3, 0.3, 0.3)


func _mostrar_cursor(indice: int) -> void:
	if indice < 0:
		_cursor.text = ""
		return
	var p: Dictionary = Datos.provincias[indice]
	_cursor.text = "%s  —  %s" % [p["nombre"], Datos.nombre_pais(Datos.duenos[indice])]
	anclar(_cursor, Control.PRESET_CENTER_BOTTOM, 16)


func _mostrar_provincia(indice: int) -> void:
	if indice < 0:
		_panel_provincia.visible = false
		return
	var p: Dictionary = Datos.provincias[indice]
	_info_titulo.text = p["nombre"]
	var lineas := PackedStringArray()
	var dueno: String = Datos.duenos[indice]
	lineas.append("País: %s" % Datos.nombre_pais(dueno))
	if dueno != p["pais"]:
		lineas.append("Pertenecía a: %s" % Datos.nombre_pais(p["pais"]))
	var tipo: String = p.get("tipo", "")
	if tipo != "":
		lineas.append("Tipo: %s" % TIPOS.get(tipo, tipo))
	lineas.append("Superficie: %s km²" % miles(int(p["area_km2"])))
	lineas.append("Costa: %s" % ("sí" if p["costera"] else "no"))
	var ciudades := Datos.ciudades_de(indice)
	if not ciudades.is_empty():
		var nombres := PackedStringArray()
		for c in ciudades.slice(0, 4):
			nombres.append(c["nombre"])
		lineas.append("Ciudades: %s" % ", ".join(nombres))
	var puertos := Datos.puertos_de(indice)
	if not puertos.is_empty():
		var nombres := PackedStringArray()
		for q in puertos:
			nombres.append(q["nombre"])
		lineas.append("Puertos: %s" % ", ".join(nombres))
	var bases := Datos.bases_de(indice)
	if not bases.is_empty():
		var nombres := PackedStringArray()
		for b in bases:
			nombres.append(b["nombre"])
		lineas.append("Bases: %s" % ", ".join(nombres))
	var vecinos: Array = p["vecinos"]
	var nombres_vecinos := PackedStringArray()
	for v in vecinos:
		if Datos.indice_provincia.has(v):
			nombres_vecinos.append(Datos.provincias[Datos.indice_provincia[v]]["nombre"])
	if not nombres_vecinos.is_empty():
		lineas.append("Limita con: %s" % ", ".join(nombres_vecinos))
	_info_texto.text = "\n".join(lineas)
	_panel_provincia.visible = true
	anclar(_panel_provincia, Control.PRESET_BOTTOM_LEFT)


static func miles(n: int) -> String:
	var s := str(absi(n))
	var out := ""
	while s.length() > 3:
		out = "." + s.substr(s.length() - 3) + out
		s = s.substr(0, s.length() - 3)
	return ("-" if n < 0 else "") + s + out
