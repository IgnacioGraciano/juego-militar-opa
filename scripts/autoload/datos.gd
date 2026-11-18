extends Node
## Carga los datos del juego (carpeta res://data) y guarda el estado del mapa.
##
## Los datos están separados del código: para cambiar países, bases o el
## escenario se editan los archivos .json, no los scripts.

signal dueno_cambiado(provincia: int)

const Geo = preload("res://scripts/mapa/geo.gd")
const ESCENARIO_INICIAL := "1978"

## Límites del mapa en coordenadas del mapa.
var limites := Rect2()
## Datos de la imagen de relieve (archivo, ancho, alto).
var relieve: Dictionary = {}

## Una entrada por provincia (data/mapa/provincias.json). El índice en este
## arreglo es el número de provincia que usa todo el juego.
var provincias: Array = []
var indice_provincia: Dictionary = {}  # id -> índice
## Geometría por provincia, mismo índice que provincias.
var vertices: Array[PackedVector2Array] = []
var triangulos: Array[PackedInt32Array] = []
var rectangulos: Array[Rect2] = []

## Fronteras: tramos de línea entre dos provincias (b = -1 costa, b = -2 país fuera del mapa).
var frontera_a := PackedInt32Array()
var frontera_b := PackedInt32Array()
var frontera_puntos: Array[PackedVector2Array] = []

var paises: Dictionary = {}  # etiqueta -> Dictionary
var duenos := PackedStringArray()  # dueño actual de cada provincia

var ciudades: Array = []
var puertos: Array = []
var bases: Array = []
var rios: Array = []
var lagos: Array = []
var regiones: Array = []
var escenario: Dictionary = {}


func _ready() -> void:
	cargar(ESCENARIO_INICIAL)


func cargar(nombre_escenario: String) -> void:
	var t0 := Time.get_ticks_msec()
	_cargar_paises()
	_cargar_geometria()
	_cargar_provincias()
	_cargar_puntos()
	_cargar_escenario(nombre_escenario)
	print("Datos cargados en %d ms: %d provincias, %d fronteras, %d ciudades" % [
		Time.get_ticks_msec() - t0, provincias.size(), frontera_a.size(), ciudades.size()])


# ------------------------------------------------------------------ consultas

func color_pais(etiqueta: String) -> Color:
	if paises.has(etiqueta):
		return paises[etiqueta]["color_obj"]
	return Color(0.5, 0.5, 0.5)


func nombre_pais(etiqueta: String) -> String:
	if paises.has(etiqueta):
		return paises[etiqueta]["nombre"]
	return etiqueta


## Devuelve el índice de la provincia que contiene el punto, o -1 si es mar.
func provincia_en(pos: Vector2) -> int:
	for i in rectangulos.size():
		if not rectangulos[i].has_point(pos):
			continue
		var v := vertices[i]
		var t := triangulos[i]
		for k in range(0, t.size(), 3):
			if Geometry2D.point_is_inside_triangle(pos, v[t[k]], v[t[k + 1]], v[t[k + 2]]):
				return i
	return -1


func cambiar_dueno(provincia: int, etiqueta: String) -> void:
	if duenos[provincia] == etiqueta:
		return
	duenos[provincia] = etiqueta
	dueno_cambiado.emit(provincia)


func ciudades_de(provincia: int) -> Array:
	var id: String = provincias[provincia]["id"]
	return ciudades.filter(func(c): return c["provincia"] == id)


func puertos_de(provincia: int) -> Array:
	var id: String = provincias[provincia]["id"]
	return puertos.filter(func(p): return p["provincia"] == id)


func bases_de(provincia: int) -> Array:
	return bases.filter(func(b): return b["provincia"] == provincia)


# ------------------------------------------------------------------ carga

static func leer_json(ruta: String) -> Variant:
	if not FileAccess.file_exists(ruta):
		push_error("Falta el archivo de datos: %s" % ruta)
		return {}
	var datos = JSON.parse_string(FileAccess.get_file_as_string(ruta))
	if datos == null:
		push_error("JSON inválido: %s" % ruta)
		return {}
	return datos


static func a_vectores(plano: Array) -> PackedVector2Array:
	var n := plano.size() >> 1
	var out := PackedVector2Array()
	out.resize(n)
	for k in n:
		out[k] = Vector2(plano[2 * k], plano[2 * k + 1])
	return out


static func a_enteros(lista: Array) -> PackedInt32Array:
	var out := PackedInt32Array()
	out.resize(lista.size())
	for k in lista.size():
		out[k] = int(lista[k])
	return out


func _cargar_paises() -> void:
	paises = leer_json("res://data/paises.json").get("paises", {})
	for etiqueta in paises:
		var p: Dictionary = paises[etiqueta]
		p["color_obj"] = Color.html(p.get("color", "#808080"))
		var e: Array = p.get("etiqueta", [0, 0])
		p["pos_etiqueta"] = Geo.desde_lonlat(e[0], e[1])


func _cargar_geometria() -> void:
	var g: Dictionary = leer_json("res://data/mapa/geometria.json")
	var proy: Dictionary = g.get("proyeccion", {})
	Geo.escala = proy.get("escala", 30.0)
	var l: Array = proy.get("limites", [0, 0, 1, 1])
	limites = Rect2(l[0], l[1], l[2] - l[0], l[3] - l[1])
	relieve = proy.get("relieve", {})

	vertices.clear()
	triangulos.clear()
	rectangulos.clear()
	for p in g.get("provincias", []):
		var v := a_vectores(p["v"])
		vertices.append(v)
		triangulos.append(a_enteros(p["i"]))
		var r := Rect2(v[0], Vector2.ZERO) if v.size() > 0 else Rect2()
		for q in v:
			r = r.expand(q)
		rectangulos.append(r.grow(0.01))

	var fr: Array = g.get("fronteras", [])
	frontera_a.resize(fr.size())
	frontera_b.resize(fr.size())
	frontera_puntos.clear()
	for k in fr.size():
		frontera_a[k] = int(fr[k]["a"])
		frontera_b[k] = int(fr[k]["b"])
		frontera_puntos.append(a_vectores(fr[k]["p"]))


func _cargar_provincias() -> void:
	provincias = leer_json("res://data/mapa/provincias.json").get("provincias", [])
	if provincias.size() != vertices.size():
		push_error("provincias.json y geometria.json no coinciden. Volver a correr tools/construir_mapa.py")
	indice_provincia.clear()
	for i in provincias.size():
		var p: Dictionary = provincias[i]
		indice_provincia[p["id"]] = i
		var c: Array = p["centro"]
		p["pos_centro"] = Vector2(c[0], c[1])


func _cargar_puntos() -> void:
	ciudades = leer_json("res://data/mapa/ciudades.json").get("ciudades", [])
	for c in ciudades:
		c["pos_v"] = Vector2(c["pos"][0], c["pos"][1])
	puertos = leer_json("res://data/mapa/puertos.json").get("puertos", [])
	for p in puertos:
		p["pos_v"] = Vector2(p["pos"][0], p["pos"][1])
	rios = leer_json("res://data/mapa/rios.json").get("rios", [])
	for r in rios:
		r["puntos"] = a_vectores(r["p"])
	lagos = leer_json("res://data/mapa/lagos.json").get("lagos", [])
	for l in lagos:
		var bordes: Array[PackedVector2Array] = []
		for anillo in l["borde"]:
			bordes.append(a_vectores(anillo))
		l["bordes_v"] = bordes
	regiones = leer_json("res://data/mapa/regiones.json").get("regiones", [])
	for r in regiones:
		r["pos_v"] = Vector2(r["pos"][0], r["pos"][1])
	# Las bases están en lon/lat (se escriben a mano): se proyectan acá.
	bases = leer_json("res://data/bases.json").get("bases", [])
	for b in bases:
		b["pos_v"] = Geo.desde_lonlat(b["lon"], b["lat"])
		b["provincia"] = provincia_en(b["pos_v"])


func _cargar_escenario(nombre: String) -> void:
	escenario = leer_json("res://data/escenarios/%s.json" % nombre)
	duenos.resize(provincias.size())
	for i in provincias.size():
		duenos[i] = provincias[i]["pais"]
	var cambios: Dictionary = escenario.get("duenos", {})
	for id in cambios:
		if indice_provincia.has(id):
			duenos[indice_provincia[id]] = cambios[id]
		else:
			push_warning("Escenario: provincia desconocida %s" % id)
