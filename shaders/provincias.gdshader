// Relleno de provincias con el color de su dueño.
// Todas las provincias van en una sola malla; cada vértice lleva en UV.x el
// número de su provincia, y el color sale de una textura de 1 píxel por provincia.
// Cambiar el dueño de una provincia = cambiar un píxel de esa textura.
shader_type canvas_item;

uniform sampler2D colores : filter_nearest;
uniform int seleccionada = -1;
uniform int bajo_cursor = -1;
// Opacidad general del color de país (más alta de lejos, más baja de cerca).
uniform float opacidad : hint_range(0.0, 1.0) = 0.45;

varying flat int provincia;

void vertex() {
	provincia = int(UV.x + 0.5);
}

void fragment() {
	vec4 c = texelFetch(colores, ivec2(provincia, 0), 0);
	float a = c.a * opacidad;
	if (provincia == seleccionada) {
		c.rgb = mix(c.rgb, vec3(1.0), 0.35);
		a = max(a, 0.55);
	} else if (provincia == bajo_cursor) {
		c.rgb = mix(c.rgb, vec3(1.0), 0.18);
		a = max(a, 0.4);
	}
	COLOR = vec4(c.rgb, a);
}
