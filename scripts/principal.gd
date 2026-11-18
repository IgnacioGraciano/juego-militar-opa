extends Node2D
## Escena principal: arma el mapa, la cámara, las etiquetas y la interfaz.

const Mapa = preload("res://scripts/mapa/mapa.gd")
const CamaraMapa = preload("res://scripts/mapa/camara_mapa.gd")
const EtiquetasMapa = preload("res://scripts/mapa/etiquetas_mapa.gd")
const Hud = preload("res://scripts/ui/hud.gd")

const ZOOM_INICIAL := 0.55

var mapa: Mapa
var camara: CamaraMapa
var etiquetas: EtiquetasMapa
var hud: Hud


func _ready() -> void:
	mapa = Mapa.new()
	mapa.name = "Mapa"
	add_child(mapa)

	camara = CamaraMapa.new()
	camara.name = "Camara"
	add_child(camara)
	camara.make_current()
	mapa.camara = camara

	var capa_etiquetas := CanvasLayer.new()
	capa_etiquetas.name = "CapaEtiquetas"
	capa_etiquetas.layer = 1
	add_child(capa_etiquetas)
	etiquetas = EtiquetasMapa.new()
	etiquetas.name = "Etiquetas"
	etiquetas.camara = camara
	capa_etiquetas.add_child(etiquetas)

	var capa_ui := CanvasLayer.new()
	capa_ui.name = "CapaInterfaz"
	capa_ui.layer = 2
	add_child(capa_ui)
	hud = Hud.new()
	hud.name = "Interfaz"
	hud.mapa = mapa
	capa_ui.add_child(hud)

	camara.vista_cambiada.connect(_al_cambiar_vista)
	Datos.dueno_cambiado.connect(func(_p): etiquetas.queue_redraw())

	# Arrancar mirando al país del jugador.
	var jugador: String = Datos.escenario.get("pais_jugador", "")
	var centro := Datos.limites.get_center()
	if Datos.paises.has(jugador):
		centro = Datos.paises[jugador]["pos_etiqueta"]
	camara.configurar(Datos.limites, centro, ZOOM_INICIAL)
	_al_cambiar_vista()


func _al_cambiar_vista() -> void:
	mapa.al_cambiar_vista()
	etiquetas.queue_redraw()
