extends Node
## Reloj del juego: tiempo real con pausa y 5 velocidades.
##
## El juego avanza de a una hora (el combate se calcula por hora de juego).
## La hora interna es UTC; se muestra en la hora local del escenario.

signal hora_pasada(horas: int)
signal dia_pasado()
signal estado_cambiado()  # pausa o velocidad

## Segundos reales que dura un día de juego en cada velocidad (1 a 5).
const SEGUNDOS_POR_DIA: Array[float] = [12.0, 7.0, 4.0, 2.0, 0.5]
const VELOCIDAD_NORMAL := 3
## Máximo de horas que se procesan en un solo cuadro (evita trabas si el juego se cuelga).
const MAX_HORAS_POR_CUADRO := 24

const MESES := ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
		"agosto", "septiembre", "octubre", "noviembre", "diciembre"]

var pausado := true
var velocidad := VELOCIDAD_NORMAL
## Horas de juego transcurridas desde el inicio del escenario.
var horas := 0
## Fracción de la hora en curso (0 a 1), para animaciones suaves.
var fraccion := 0.0

var _unix_inicio := 0  # segundos UTC del inicio del escenario
var _zona_horaria := 0
var _acumulado := 0.0


func _ready() -> void:
	# Datos es un autoload anterior: el escenario ya está cargado.
	var esc: Dictionary = Datos.escenario
	_zona_horaria = int(esc.get("zona_horaria", 0))
	var fecha: String = esc.get("fecha_inicio", "1978-01-01")
	var hora_local := int(esc.get("hora_inicio", 0))
	_unix_inicio = Time.get_unix_time_from_datetime_string(fecha + "T00:00:00") \
			+ (hora_local - _zona_horaria) * 3600
	horas = 0


func _process(delta: float) -> void:
	if pausado:
		return
	var seg_por_hora: float = SEGUNDOS_POR_DIA[velocidad - 1] / 24.0
	_acumulado += delta
	var pasos := 0
	while _acumulado >= seg_por_hora and pasos < MAX_HORAS_POR_CUADRO:
		_acumulado -= seg_por_hora
		pasos += 1
		_avanzar_hora()
	if pasos == MAX_HORAS_POR_CUADRO:
		_acumulado = 0.0
	fraccion = clampf(_acumulado / seg_por_hora, 0.0, 1.0)


func _avanzar_hora() -> void:
	horas += 1
	hora_pasada.emit(horas)
	if hora_local() == 0:
		dia_pasado.emit()


# ------------------------------------------------------------------ control

func alternar_pausa() -> void:
	pausado = not pausado
	estado_cambiado.emit()


func fijar_velocidad(v: int) -> void:
	velocidad = clampi(v, 1, SEGUNDOS_POR_DIA.size())
	estado_cambiado.emit()


func acelerar() -> void:
	fijar_velocidad(velocidad + 1)


func frenar() -> void:
	fijar_velocidad(velocidad - 1)


# ------------------------------------------------------------------ consultas

func unix_utc() -> int:
	return _unix_inicio + horas * 3600


## Fecha y hora local como diccionario (year, month, day, hour, weekday...).
func fecha_local() -> Dictionary:
	return Time.get_datetime_dict_from_unix_time(unix_utc() + _zona_horaria * 3600)


func hora_local() -> int:
	return fecha_local()["hour"]


func texto_fecha() -> String:
	var f := fecha_local()
	return "%d de %s de %d" % [f["day"], MESES[f["month"] - 1], f["year"]]


func texto_hora() -> String:
	return "%02d:00" % fecha_local()["hour"]


## Hora UTC con decimales (0 a 24), incluida la fracción de la hora en curso.
func hora_utc_continua() -> float:
	var f := Time.get_datetime_dict_from_unix_time(unix_utc())
	return f["hour"] + fraccion


## Día del año (1 a 366) en UTC.
func dia_del_anio() -> int:
	var f := Time.get_datetime_dict_from_unix_time(unix_utc())
	var inicio_anio := Time.get_unix_time_from_datetime_string("%04d-01-01T00:00:00" % f["year"])
	return int((unix_utc() - inicio_anio) / 86400.0) + 1


## Posición del sol: Vector2(longitud, latitud) del punto donde está en el cénit.
## Aproximación suficiente para el día y la noche del mapa.
func posicion_sol() -> Vector2:
	var declinacion := -23.44 * cos(TAU / 365.0 * (dia_del_anio() + 10))
	var lon := -15.0 * (hora_utc_continua() - 12.0)
	return Vector2(wrapf(lon, -180.0, 180.0), declinacion)
