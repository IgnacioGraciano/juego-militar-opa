extends Node2D
## Mapa del juego. Arma las capas (de abajo hacia arriba):
##   relieve -> lagos -> color de provincias -> ríos -> fronteras -> noche
## y maneja la selección de provincias con el mouse.

signal provincia_seleccionada(indice: int)
signal provincia_bajo_cursor(indice: int)

const Geo = preload("res://scripts/mapa/geo.gd")
const CamaraMapa = preload("res://scripts/mapa/camara_mapa.gd")
const CapaFronteras = preload("res://scripts/mapa/capa_fronteras.gd")
const CapaAgua = preload("res://scripts/mapa/capa_agua.gd")
const SHADER_PROVINCIAS = preload("res://shaders/provincias.gdshader")
const SHADER_NOCHE = preload("res://shaders/noche.gdshader")

const COLOR_LAGO := Color(0.30, 0.47, 0.62)
## Opacidad del color de país de lejos y de cerca.
const OPACIDAD_LEJOS := 0.55
const OPACIDAD_CERCA := 0.30
## Distancia en píxeles para distinguir un clic de un arrastre.
const UMBRAL_CLIC := 5.0

var camara: CamaraMapa
var seleccionada := -1
var bajo_cursor := -1
var noche_activa := true

var _relleno: MeshInstance2D
var _material: ShaderMaterial
var _colores: Image
var _textura_colores: ImageTexture
var _agua: CapaAgua
var _fronteras: CapaFronteras
var _noche: ColorRect
var _material_noche: ShaderMaterial
var _clic_inicio := Vector2.INF


func _ready() -> void:
	_crear_relieve()
	_crear_lagos()
	_crear_relleno_provincias()
	_agua = CapaAgua.new()
	_agua.name = "Agua"
	add_child(_agua)
	_fronteras = CapaFronteras.new()
	_fronteras.name = "Fronteras"
	add_child(_fronteras)
	_crear_noche()
	Datos.dueno_cambiado.connect(_al_cambiar_dueno)
	Tiempo.hora_pasada.connect(func(_h): _actualizar_noche())
	_actualizar_noche()


## Se llama cuando la cámara se mueve o hace zoom.
func al_cambiar_vista() -> void:
	var z := camara.zoom.x
	var detalle := camara.detalle()
	_material.set_shader_parameter("opacidad", lerpf(OPACIDAD_LEJOS, OPACIDAD_CERCA, detalle))
	_agua.actualizar(z, detalle)
	_fronteras.actualizar(z, detalle)


func seleccionar(indice: int) -> void:
	seleccionada = indice
	_material.set_shader_parameter("seleccionada", indice)
	_fronteras.fijar_seleccion(indice)
	provincia_seleccionada.emit(indice)


func alternar_noche() -> void:
	noche_activa = not noche_activa
	_noche.visible = noche_activa


# ------------------------------------------------------------------ armado de capas

func _crear_relieve() -> void:
	var ruta: String = Datos.relieve.get("archivo", "res://assets/mapa/relieve.jpg")
	var textura: Texture2D = null
	if ResourceLoader.exists(ruta):
		textura = load(ruta)
	else:
		# Si el editor todavía no importó la imagen, se lee directo del archivo.
		var img := Image.load_from_file(ProjectSettings.globalize_path(ruta))
		if img != null:
			textura = ImageTexture.create_from_image(img)
	if textura == null:
		push_error("No se encontró el relieve: %s" % ruta)
		return
	var sprite := Sprite2D.new()
	sprite.name = "Relieve"
	sprite.texture = textura
	sprite.centered = false
	sprite.position = Datos.limites.position
	# El relieve se genera a 1 píxel por unidad del mapa: va sin escalar.
	sprite.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	add_child(sprite)


func _crear_lagos() -> void:
	var verts := PackedVector2Array()
	var indices := PackedInt32Array()
	for l in Datos.lagos:
		var base := verts.size()
		verts.append_array(Datos.a_vectores(l["v"]))
		for i in l["i"]:
			indices.append(base + int(i))
	if indices.is_empty():
		return
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = verts
	arrays[Mesh.ARRAY_INDEX] = indices
	var malla := ArrayMesh.new()
	malla.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	var mi := MeshInstance2D.new()
	mi.name = "Lagos"
	mi.mesh = malla
	mi.modulate = COLOR_LAGO
	add_child(mi)


func _crear_relleno_provincias() -> void:
	# Una sola malla para todas las provincias. UV.x = número de provincia.
	var verts := PackedVector2Array()
	var uvs := PackedVector2Array()
	var indices := PackedInt32Array()
	for p in Datos.provincias.size():
		var v: PackedVector2Array = Datos.vertices[p]
		var t: PackedInt32Array = Datos.triangulos[p]
		var base := verts.size()
		verts.append_array(v)
		var uv := Vector2(p, 0)
		for k in v.size():
			uvs.append(uv)
		for i in t:
			indices.append(base + i)
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = verts
	arrays[Mesh.ARRAY_TEX_UV] = uvs
	arrays[Mesh.ARRAY_INDEX] = indices
	var malla := ArrayMesh.new()
	malla.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)

	_colores = Image.create(maxi(1, Datos.provincias.size()), 1, false, Image.FORMAT_RGBA8)
	for p in Datos.provincias.size():
		_colores.set_pixel(p, 0, Datos.color_pais(Datos.duenos[p]))
	_textura_colores = ImageTexture.create_from_image(_colores)

	_material = ShaderMaterial.new()
	_material.shader = SHADER_PROVINCIAS
	_material.set_shader_parameter("colores", _textura_colores)
	_material.set_shader_parameter("opacidad", OPACIDAD_LEJOS)

	_relleno = MeshInstance2D.new()
	_relleno.name = "Provincias"
	_relleno.mesh = malla
	_relleno.material = _material
	add_child(_relleno)


func _crear_noche() -> void:
	_material_noche = ShaderMaterial.new()
	_material_noche.shader = SHADER_NOCHE
	_material_noche.set_shader_parameter("origen", Datos.limites.position)
	_material_noche.set_shader_parameter("tamano", Datos.limites.size)
	_material_noche.set_shader_parameter("escala", Geo.escala)
	_noche = ColorRect.new()
	_noche.name = "Noche"
	_noche.position = Datos.limites.position
	_noche.size = Datos.limites.size
	_noche.material = _material_noche
	_noche.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_noche)


func _actualizar_noche() -> void:
	if _material_noche:
		_material_noche.set_shader_parameter("sol", Tiempo.posicion_sol())


func _process(_delta: float) -> void:
	# La sombra de la noche se mueve suave entre hora y hora.
	if noche_activa and not Tiempo.pausado:
		_actualizar_noche()


func _al_cambiar_dueno(provincia: int) -> void:
	_colores.set_pixel(provincia, 0, Datos.color_pais(Datos.duenos[provincia]))
	_textura_colores.update(_colores)
	_fronteras.queue_redraw()


# ------------------------------------------------------------------ mouse

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion:
		var i := Datos.provincia_en(get_global_mouse_position())
		if i != bajo_cursor:
			bajo_cursor = i
			_material.set_shader_parameter("bajo_cursor", i)
			provincia_bajo_cursor.emit(i)
	elif event is InputEventMouseButton:
		var b := event as InputEventMouseButton
		if b.button_index != MOUSE_BUTTON_LEFT:
			return
		if b.pressed:
			_clic_inicio = b.position
		elif _clic_inicio != Vector2.INF and b.position.distance_to(_clic_inicio) <= UMBRAL_CLIC:
			_clic_inicio = Vector2.INF
			seleccionar(Datos.provincia_en(get_global_mouse_position()))
