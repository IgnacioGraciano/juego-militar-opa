## Proyección del mapa (Miller cilíndrica), igual a la de tools/construir_mapa.py.
##
## Coordenadas del mapa: x = lon * escala, y = -miller(lat) * escala.
## Se usa con: const Geo = preload("res://scripts/mapa/geo.gd")

## Unidades del mapa por grado. La pisa Datos al cargar geometria.json.
static var escala: float = 30.0


static func miller_y(lat: float) -> float:
	return rad_to_deg(1.25 * log(tan(PI / 4.0 + 0.4 * deg_to_rad(lat))))


static func desde_lonlat(lon: float, lat: float) -> Vector2:
	return Vector2(lon * escala, -miller_y(lat) * escala)


## Devuelve Vector2(lon, lat) en grados.
static func a_lonlat(p: Vector2) -> Vector2:
	var y := deg_to_rad(-p.y / escala)
	var lat := rad_to_deg(2.5 * atan(exp(0.8 * y)) - 0.625 * PI)
	return Vector2(p.x / escala, lat)


## Distancia aproximada en km entre dos puntos del mapa (gran círculo).
static func distancia_km(a: Vector2, b: Vector2) -> float:
	var la := a_lonlat(a)
	var lb := a_lonlat(b)
	var f1 := deg_to_rad(la.y)
	var f2 := deg_to_rad(lb.y)
	var df := f2 - f1
	var dl := deg_to_rad(lb.x - la.x)
	var h := sin(df / 2.0) ** 2 + cos(f1) * cos(f2) * sin(dl / 2.0) ** 2
	return 2.0 * 6371.0 * asin(minf(1.0, sqrt(h)))
