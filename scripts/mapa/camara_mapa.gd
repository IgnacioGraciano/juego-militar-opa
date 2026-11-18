extends Camera2D
## Cámara del mapa: zoom con la rueda (hacia el cursor), arrastre con el botón
## derecho o del medio, y movimiento con WASD o flechas.

signal vista_cambiada

const ZOOM_MAX := 12.0
const PASO_ZOOM := 1.2
const SUAVIDAD_ZOOM := 14.0
const VELOCIDAD_TECLADO := 900.0  # píxeles de pantalla por segundo

## Zoom a partir del cual se considera "de cerca" (aparecen provincias, puertos, bases).
const ZOOM_CERCA_DESDE := 1.1
const ZOOM_CERCA_HASTA := 2.0

var limites := Rect2()
var zoom_min := 0.3
var zoom_objetivo := 0.5

var _ancla := Vector2.ZERO  # punto de pantalla que queda fijo al hacer zoom
var _arrastrando := false


func configurar(limites_mapa: Rect2, centro: Vector2, zoom_inicial: float) -> void:
	limites = limites_mapa
	_recalcular_zoom_min()
	zoom_objetivo = clampf(zoom_inicial, zoom_min, ZOOM_MAX)
	zoom = Vector2.ONE * zoom_objetivo
	position = centro
	_limitar()
	get_viewport().size_changed.connect(_al_cambiar_ventana)


## 0 = vista de lejos, 1 = vista de cerca (con transición suave entre los dos).
func detalle() -> float:
	return smoothstep(ZOOM_CERCA_DESDE, ZOOM_CERCA_HASTA, zoom.x)


func pantalla_a_mundo(p: Vector2) -> Vector2:
	return position + (p - get_viewport_rect().size * 0.5) / zoom.x


func centrar_en(p: Vector2) -> void:
	position = p
	_limitar()
	_avisar()


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		var b := event as InputEventMouseButton
		if b.pressed and b.button_index == MOUSE_BUTTON_WHEEL_UP:
			_zoom_hacia(PASO_ZOOM, b.position)
		elif b.pressed and b.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			_zoom_hacia(1.0 / PASO_ZOOM, b.position)
		elif b.button_index == MOUSE_BUTTON_RIGHT or b.button_index == MOUSE_BUTTON_MIDDLE:
			_arrastrando = b.pressed
	elif event is InputEventMouseMotion and _arrastrando:
		var m := event as InputEventMouseMotion
		position -= m.relative / zoom.x
		_limitar()
		_avisar()
	elif event is InputEventMagnifyGesture:
		var g := event as InputEventMagnifyGesture
		_zoom_hacia(g.factor, g.position)
	elif event is InputEventPanGesture:
		var pg := event as InputEventPanGesture
		position += pg.delta * 20.0 / zoom.x
		_limitar()
		_avisar()


func _zoom_hacia(factor: float, punto_pantalla: Vector2) -> void:
	zoom_objetivo = clampf(zoom_objetivo * factor, zoom_min, ZOOM_MAX)
	_ancla = punto_pantalla


func _process(delta: float) -> void:
	var cambio := false

	var dir := Vector2.ZERO
	if Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT):
		dir.x -= 1
	if Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT):
		dir.x += 1
	if Input.is_key_pressed(KEY_W) or Input.is_key_pressed(KEY_UP):
		dir.y -= 1
	if Input.is_key_pressed(KEY_S) or Input.is_key_pressed(KEY_DOWN):
		dir.y += 1
	if dir != Vector2.ZERO and get_viewport().gui_get_focus_owner() == null:
		position += dir.normalized() * VELOCIDAD_TECLADO * delta / zoom.x
		cambio = true

	if not is_equal_approx(zoom.x, zoom_objetivo):
		var antes := pantalla_a_mundo(_ancla)
		var z := lerpf(zoom.x, zoom_objetivo, 1.0 - exp(-delta * SUAVIDAD_ZOOM))
		if absf(z - zoom_objetivo) < zoom_objetivo * 0.002:
			z = zoom_objetivo
		zoom = Vector2(z, z)
		position += antes - pantalla_a_mundo(_ancla)
		cambio = true

	if cambio:
		_limitar()
		_avisar()


func _avisar() -> void:
	# Aplicar ya la nueva vista para que las etiquetas no queden un cuadro atrasadas.
	force_update_scroll()
	vista_cambiada.emit()


func _limitar() -> void:
	if limites.size == Vector2.ZERO:
		return
	position = position.clamp(limites.position, limites.end)


func _recalcular_zoom_min() -> void:
	var vp := get_viewport_rect().size
	if limites.size.x <= 0 or limites.size.y <= 0:
		return
	# Alejado al máximo se ve todo el mapa con un poco de margen.
	zoom_min = minf(vp.x / limites.size.x, vp.y / limites.size.y) * 0.9


func _al_cambiar_ventana() -> void:
	_recalcular_zoom_min()
	zoom_objetivo = clampf(zoom_objetivo, zoom_min, ZOOM_MAX)
	_avisar()
