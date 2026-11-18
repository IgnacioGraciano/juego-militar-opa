// Sombra de la noche sobre el mapa, según la posición del sol.
// Se dibuja en un rectángulo que cubre el mapa; UV va de 0 a 1 sobre ese rectángulo.
shader_type canvas_item;

uniform vec2 origen;          // esquina superior izquierda del rectángulo (coordenadas del mapa)
uniform vec2 tamano;          // tamaño del rectángulo (coordenadas del mapa)
uniform float escala = 30.0;  // unidades del mapa por grado
uniform vec2 sol;             // (longitud, latitud) del punto con el sol en el cénit
uniform float oscuridad : hint_range(0.0, 1.0) = 0.5;

void fragment() {
	vec2 p = origen + UV * tamano;
	float lon = radians(p.x / escala);
	float ym = radians(-p.y / escala);
	// Inversa de la proyección de Miller
	float lat = 2.5 * atan(exp(0.8 * ym)) - 0.625 * PI;
	float slon = radians(sol.x);
	float slat = radians(sol.y);
	float cos_cenit = sin(lat) * sin(slat) + cos(lat) * cos(slat) * cos(lon - slon);
	// Crepúsculo: transición entre -8° y +3° de altura del sol
	float dia = smoothstep(-0.14, 0.05, cos_cenit);
	COLOR = vec4(0.02, 0.04, 0.12, (1.0 - dia) * oscuridad);
}
