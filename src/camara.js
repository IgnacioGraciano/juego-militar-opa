// Cámara del mapa: posición (centro), zoom suave hacia el cursor y límites.

const ZOOM_MAX = 14;
const SUAVIDAD_ZOOM = 14;
// Zoom a partir del cual se considera "de cerca" (provincias, puertos, bases).
export const ZOOM_CERCA_DESDE = 1.1;
export const ZOOM_CERCA_HASTA = 2.0;

export function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export class Camara {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.zoom = 0.5; // píxeles de pantalla por unidad del mapa
    this.zoomObjetivo = 0.5;
    this.zoomMin = 0.2;
    this.ancho = 1; // tamaño de la ventana en píxeles CSS
    this.alto = 1;
    this.limites = null;
    this.ancla = { x: 0, y: 0 };
  }

  configurar(limites, centro, zoomInicial) {
    this.limites = limites;
    this.recalcularZoomMin();
    this.zoom = this.zoomObjetivo = Math.max(this.zoomMin, Math.min(ZOOM_MAX, zoomInicial));
    this.x = centro.x;
    this.y = centro.y;
    this.limitar();
  }

  fijarTamano(ancho, alto) {
    this.ancho = ancho;
    this.alto = alto;
    this.recalcularZoomMin();
    this.zoomObjetivo = Math.max(this.zoomMin, this.zoomObjetivo);
    this.limitar();
  }

  recalcularZoomMin() {
    if (!this.limites) return;
    // Alejado al máximo se ve el mapa entero a lo alto o a lo ancho.
    this.zoomMin = Math.min(this.ancho / this.limites.ancho, this.alto / this.limites.alto);
  }

  // 0 = vista de lejos, 1 = vista de cerca (transición suave).
  detalle() {
    return smoothstep(ZOOM_CERCA_DESDE, ZOOM_CERCA_HASTA, this.zoom);
  }

  pantallaAMundo(px, py) {
    return { x: this.x + (px - this.ancho / 2) / this.zoom, y: this.y + (py - this.alto / 2) / this.zoom };
  }

  mundoAPantalla(x, y) {
    return { x: (x - this.x) * this.zoom + this.ancho / 2, y: (y - this.y) * this.zoom + this.alto / 2 };
  }

  zoomHacia(factor, px, py) {
    this.zoomObjetivo = Math.max(this.zoomMin, Math.min(ZOOM_MAX, this.zoomObjetivo * factor));
    this.ancla = { x: px, y: py };
  }

  desplazarPantalla(dx, dy) {
    this.x -= dx / this.zoom;
    this.y -= dy / this.zoom;
    this.limitar();
  }

  // Devuelve true si la vista cambió.
  actualizar(dt) {
    if (this.zoom === this.zoomObjetivo) return false;
    const antes = this.pantallaAMundo(this.ancla.x, this.ancla.y);
    let z = this.zoom + (this.zoomObjetivo - this.zoom) * (1 - Math.exp(-dt * SUAVIDAD_ZOOM));
    if (Math.abs(z - this.zoomObjetivo) < this.zoomObjetivo * 0.002) z = this.zoomObjetivo;
    this.zoom = z;
    const despues = this.pantallaAMundo(this.ancla.x, this.ancla.y);
    this.x += antes.x - despues.x;
    this.y += antes.y - despues.y;
    this.limitar();
    return true;
  }

  // No deja ver afuera del mapa: si el mapa es más grande que la ventana, los
  // bordes no pasan del borde de la ventana; si es más chico, queda centrado.
  limitar() {
    const l = this.limites;
    if (!l) return;
    const mitadAncho = this.ancho / 2 / this.zoom;
    const mitadAlto = this.alto / 2 / this.zoom;
    this.x = 2 * mitadAncho >= l.ancho
      ? l.x + l.ancho / 2
      : Math.max(l.x + mitadAncho, Math.min(l.x + l.ancho - mitadAncho, this.x));
    this.y = 2 * mitadAlto >= l.alto
      ? l.y + l.alto / 2
      : Math.max(l.y + mitadAlto, Math.min(l.y + l.alto - mitadAlto, this.y));
  }
}
