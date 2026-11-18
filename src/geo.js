// Proyección del mapa (Miller cilíndrica), igual a la de tools/construir_mapa.py.
// Coordenadas del mapa: x = lon * escala, y = -miller(lat) * escala.

export const geo = {
  // Unidades del mapa por grado. Se pisa al cargar geometria.json.
  escala: 30,
};

const rad = (g) => (g * Math.PI) / 180;
const grados = (r) => (r * 180) / Math.PI;

export function millerY(lat) {
  return grados(1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * rad(lat))));
}

// [lon, lat] en grados -> {x, y} en el mapa
export function desdeLonLat(lon, lat) {
  return { x: lon * geo.escala, y: -millerY(lat) * geo.escala };
}

// {x, y} del mapa -> {lon, lat}
export function aLonLat(x, y) {
  const ym = rad(-y / geo.escala);
  const lat = grados(2.5 * Math.atan(Math.exp(0.8 * ym)) - 0.625 * Math.PI);
  return { lon: x / geo.escala, lat };
}

// Distancia aproximada en km entre dos puntos del mapa (gran círculo).
export function distanciaKm(x1, y1, x2, y2) {
  const a = aLonLat(x1, y1);
  const b = aLonLat(x2, y2);
  const f1 = rad(a.lat);
  const f2 = rad(b.lat);
  const h = Math.sin((f2 - f1) / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}
