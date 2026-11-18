// Dibuja las capas del mapa en coordenadas del mapa (de abajo hacia arriba):
//   relieve -> lagos -> color de cada país -> resaltado -> ríos -> fronteras -> noche
// Los grosores de línea se miden en píxeles de pantalla, así quedan finos con cualquier zoom.

import { datos } from './datos.js';
import { geo } from './geo.js';

const COLOR_LAGO = 'rgb(77, 120, 158)';
const COLOR_COSTA = 'rgba(20, 31, 43, 0.55)';
const COLOR_PAIS = 'rgba(18, 15, 12, 0.85)';
const COLOR_PROVINCIA = [30, 27, 22]; // con alfa según el zoom
const COLOR_RIO = [70, 120, 178];
const COLOR_SELECCION = 'rgba(255, 246, 214, 0.95)';
// Opacidad del color de país de lejos y de cerca.
const OPACIDAD_LEJOS = 0.55;
const OPACIDAD_CERCA = 0.3;
// Ríos con rango menor o igual a este se ven siempre; el resto, solo de cerca.
const RANGO_RIO_SIEMPRE = 5;

// Resolución de la sombra de la noche (se estira sobre el mapa).
const NOCHE_ANCHO = 170;
const NOCHE_ALTO = 207;
const NOCHE_OSCURIDAD = 0.5;

const lerp = (a, b, t) => a + (b - a) * t;

export class Mapa {
  constructor() {
    this.relieve = null;
    this.seleccionada = -1;
    this.bajoCursor = -1;
    this.nocheActiva = true;
    this._caminosPais = new Map(); // etiqueta -> Path2D con todas sus provincias
    this._fronterasPais = null;
    this._fronterasProvincia = null;
    this._costa = null;
    this._riosPorGrosor = [];
    this._noche = document.createElement('canvas');
    this._noche.width = NOCHE_ANCHO;
    this._noche.height = NOCHE_ALTO;
    this._solCalculado = null;
  }

  async cargarRelieve() {
    const img = new Image();
    img.src = datos.relieve.archivo;
    await img.decode();
    this.relieve = img;
  }

  // Arma los caminos que dependen de los dueños. Llamar al iniciar y cuando cambia un dueño.
  reconstruir() {
    this._caminosPais.clear();
    datos.provincias.forEach((p, i) => {
      const dueno = datos.duenos[i];
      if (!this._caminosPais.has(dueno)) this._caminosPais.set(dueno, new Path2D());
      this._caminosPais.get(dueno).addPath(p.path);
    });
    this._fronterasPais = new Path2D();
    this._fronterasProvincia = new Path2D();
    this._costa = new Path2D();
    for (const f of datos.fronteras) {
      if (f.b === -1) this._costa.addPath(f.path);
      else if (f.b === -2 || datos.duenos[f.a] !== datos.duenos[f.b]) this._fronterasPais.addPath(f.path);
      else this._fronterasProvincia.addPath(f.path);
    }
    // Ríos agrupados por grosor
    const grupos = [
      { rangoMax: 3, ancho: 1.8, siempre: true, path: new Path2D() },
      { rangoMax: RANGO_RIO_SIEMPRE, ancho: 1.3, siempre: true, path: new Path2D() },
      { rangoMax: 6, ancho: 1.3, siempre: false, path: new Path2D() },
      { rangoMax: 99, ancho: 0.9, siempre: false, path: new Path2D() },
    ];
    for (const r of datos.rios) grupos.find((g) => r.rango <= g.rangoMax).path.addPath(r.path);
    this._riosPorGrosor = grupos;
  }

  dibujar(ctx, camara, solPos) {
    const z = camara.zoom;
    const px = 1 / z; // un píxel de pantalla en unidades del mapa
    const detalle = camara.detalle();
    const l = datos.limites;

    // Relieve
    if (this.relieve) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(this.relieve, l.x, l.y, this.relieve.width, this.relieve.height);
    }

    // Lagos
    ctx.fillStyle = COLOR_LAGO;
    for (const lago of datos.lagos) ctx.fill(lago.path, 'evenodd');

    // Color de cada país
    const opacidad = lerp(OPACIDAD_LEJOS, OPACIDAD_CERCA, detalle);
    for (const [etiqueta, camino] of this._caminosPais) {
      const rgb = datos.paises[etiqueta]?.rgb ?? [128, 128, 128];
      ctx.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${opacidad})`;
      ctx.fill(camino, 'evenodd');
    }

    // Provincia bajo el cursor y provincia elegida
    if (this.bajoCursor >= 0 && this.bajoCursor !== this.seleccionada) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.fill(datos.provincias[this.bajoCursor].path, 'evenodd');
    }
    if (this.seleccionada >= 0) {
      ctx.fillStyle = 'rgba(255, 250, 230, 0.3)';
      ctx.fill(datos.provincias[this.seleccionada].path, 'evenodd');
    }

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // Ríos
    for (const g of this._riosPorGrosor) {
      const a = g.siempre ? 0.55 + 0.3 * detalle : 0.75 * detalle;
      if (a < 0.02) continue;
      ctx.strokeStyle = `rgba(${COLOR_RIO[0]}, ${COLOR_RIO[1]}, ${COLOR_RIO[2]}, ${a})`;
      ctx.lineWidth = g.ancho * px;
      ctx.stroke(g.path);
    }

    // Costas y fronteras
    ctx.strokeStyle = COLOR_COSTA;
    ctx.lineWidth = px;
    ctx.stroke(this._costa);
    if (detalle > 0.01) {
      ctx.strokeStyle = `rgba(${COLOR_PROVINCIA[0]}, ${COLOR_PROVINCIA[1]}, ${COLOR_PROVINCIA[2]}, ${0.5 * detalle})`;
      ctx.lineWidth = px;
      ctx.stroke(this._fronterasProvincia);
    }
    ctx.strokeStyle = COLOR_PAIS;
    ctx.lineWidth = (1.4 + 0.8 * detalle) * px;
    ctx.stroke(this._fronterasPais);

    if (this.seleccionada >= 0) {
      ctx.strokeStyle = COLOR_SELECCION;
      ctx.lineWidth = 2.2 * px;
      ctx.stroke(datos.provincias[this.seleccionada].path);
    }

    // Noche
    if (this.nocheActiva) {
      this._actualizarNoche(solPos);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this._noche, l.x, l.y, l.ancho, l.alto);
    }
  }

  // Sombra de la noche según la posición del sol, en una imagen chica que se estira.
  _actualizarNoche(sol) {
    const c = this._solCalculado;
    if (c && Math.abs(c.lon - sol.lon) < 0.2 && Math.abs(c.lat - sol.lat) < 0.05) return;
    this._solCalculado = { ...sol };
    const ctx = this._noche.getContext('2d');
    const img = ctx.createImageData(NOCHE_ANCHO, NOCHE_ALTO);
    const l = datos.limites;
    const r = Math.PI / 180;
    const sLat = sol.lat * r;
    const sinS = Math.sin(sLat);
    const cosS = Math.cos(sLat);
    for (let j = 0; j < NOCHE_ALTO; j++) {
      const y = l.y + ((j + 0.5) / NOCHE_ALTO) * l.alto;
      const ym = (-y / geo.escala) * r;
      const lat = 2.5 * Math.atan(Math.exp(0.8 * ym)) - 0.625 * Math.PI; // inversa de Miller
      const sinL = Math.sin(lat);
      const cosL = Math.cos(lat);
      for (let i = 0; i < NOCHE_ANCHO; i++) {
        const x = l.x + ((i + 0.5) / NOCHE_ANCHO) * l.ancho;
        const lon = (x / geo.escala) * r;
        const cosCenit = sinL * sinS + cosL * cosS * Math.cos(lon - sol.lon * r);
        // Crepúsculo: transición entre unos -8° y +3° de altura del sol
        const t = Math.max(0, Math.min(1, (cosCenit + 0.14) / 0.19));
        const dia = t * t * (3 - 2 * t);
        const k = (j * NOCHE_ANCHO + i) * 4;
        img.data[k] = 5;
        img.data[k + 1] = 10;
        img.data[k + 2] = 31;
        img.data[k + 3] = Math.round((1 - dia) * NOCHE_OSCURIDAD * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
  }
}
