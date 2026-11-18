// Carga los datos del juego (carpeta data/) y guarda el estado del mapa.
// Los datos están separados del código: para cambiar países, bases o el
// escenario se editan los archivos .json, no los scripts.

import { geo, desdeLonLat } from './geo.js';

export const datos = {
  limites: { x: 0, y: 0, ancho: 1, alto: 1 },
  relieve: null, // {archivo, ancho, alto}
  // Una entrada por provincia. El índice en este arreglo es el número de
  // provincia que usa todo el juego; en los archivos se usa el id.
  provincias: [],
  indiceProvincia: new Map(), // id -> índice
  // Fronteras: tramos entre dos provincias (b = -1 costa, b = -2 país fuera del mapa)
  fronteras: [],
  paises: {}, // etiqueta -> {nombre, color, rgb, posEtiqueta, ...}
  duenos: [], // dueño actual de cada provincia
  ciudades: [],
  puertos: [],
  bases: [],
  rios: [],
  lagos: [],
  regiones: [],
  escenario: {},
  eventos: new EventTarget(),
};

async function leerJson(ruta) {
  const r = await fetch(ruta);
  if (!r.ok) throw new Error(`No se pudo leer ${ruta} (${r.status})`);
  return r.json();
}

function aPath(anillos) {
  const p = new Path2D();
  for (const a of anillos) {
    p.moveTo(a[0], a[1]);
    for (let k = 2; k < a.length; k += 2) p.lineTo(a[k], a[k + 1]);
    p.closePath();
  }
  return p;
}

function aLinea(plano) {
  const p = new Path2D();
  p.moveTo(plano[0], plano[1]);
  for (let k = 2; k < plano.length; k += 2) p.lineTo(plano[k], plano[k + 1]);
  return p;
}

function caja(anillos) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const a of anillos) {
    for (let k = 0; k < a.length; k += 2) {
      if (a[k] < x0) x0 = a[k];
      if (a[k] > x1) x1 = a[k];
      if (a[k + 1] < y0) y0 = a[k + 1];
      if (a[k + 1] > y1) y1 = a[k + 1];
    }
  }
  return { x0, y0, x1, y1 };
}

function hexARgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export async function cargarDatos(escenario = '1978') {
  const t0 = performance.now();
  const [paises, geom, prov, ciud, puer, rios, lagos, reg, bases, esc] = await Promise.all([
    leerJson('data/paises.json'),
    leerJson('data/mapa/geometria.json'),
    leerJson('data/mapa/provincias.json'),
    leerJson('data/mapa/ciudades.json'),
    leerJson('data/mapa/puertos.json'),
    leerJson('data/mapa/rios.json'),
    leerJson('data/mapa/lagos.json'),
    leerJson('data/mapa/regiones.json'),
    leerJson('data/bases.json'),
    leerJson(`data/escenarios/${escenario}.json`),
  ]);

  const proy = geom.proyeccion;
  geo.escala = proy.escala;
  const [x0, y0, x1, y1] = proy.limites;
  datos.limites = { x: x0, y: y0, ancho: x1 - x0, alto: y1 - y0 };
  datos.relieve = proy.relieve;

  // Países
  datos.paises = paises.paises;
  for (const p of Object.values(datos.paises)) {
    p.rgb = hexARgb(p.color);
    p.posEtiqueta = desdeLonLat(p.etiqueta[0], p.etiqueta[1]);
  }

  // Provincias: datos + geometría (mismo orden)
  if (prov.provincias.length !== geom.provincias.length) {
    throw new Error('provincias.json y geometria.json no coinciden: volver a correr tools/construir_mapa.py');
  }
  datos.provincias = prov.provincias.map((p, i) => {
    const anillos = geom.provincias[i].anillos.map((a) => Float32Array.from(a));
    return {
      ...p,
      indice: i,
      centroPos: { x: p.centro[0], y: p.centro[1] },
      anillos,
      caja: caja(anillos),
      path: aPath(anillos),
    };
  });
  datos.indiceProvincia = new Map(datos.provincias.map((p, i) => [p.id, i]));

  datos.fronteras = geom.fronteras.map((f) => ({ a: f.a, b: f.b, path: aLinea(f.p) }));

  datos.ciudades = ciud.ciudades.map((c) => ({ ...c, x: c.pos[0], y: c.pos[1] }));
  datos.puertos = puer.puertos.map((p) => ({ ...p, x: p.pos[0], y: p.pos[1] }));
  datos.rios = rios.rios.map((r) => ({ nombre: r.nombre, rango: r.rango, path: aLinea(r.p) }));
  datos.lagos = lagos.lagos.map((l) => ({ ...l, path: aPath(l.anillos) }));
  datos.regiones = reg.regiones.map((r) => ({ ...r, x: r.pos[0], y: r.pos[1] }));

  // Las bases se escriben a mano en lon/lat: se proyectan acá.
  datos.bases = bases.bases.map((b) => {
    const p = desdeLonLat(b.lon, b.lat);
    return { ...b, x: p.x, y: p.y, provincia: provinciaEn(p.x, p.y) };
  });

  // Escenario: dueños iniciales
  datos.escenario = esc;
  datos.duenos = datos.provincias.map((p) => p.pais);
  for (const [id, pais] of Object.entries(esc.duenos || {})) {
    if (datos.indiceProvincia.has(id)) datos.duenos[datos.indiceProvincia.get(id)] = pais;
    else console.warn('Escenario: provincia desconocida', id);
  }

  console.info(`Datos cargados en ${Math.round(performance.now() - t0)} ms: ` +
    `${datos.provincias.length} provincias, ${datos.fronteras.length} fronteras, ${datos.ciudades.length} ciudades`);
  return datos;
}

// ------------------------------------------------------------------ consultas

export function nombrePais(etiqueta) {
  return datos.paises[etiqueta]?.nombre ?? etiqueta;
}

function dentroDeAnillo(a, x, y) {
  let dentro = false;
  const n = a.length;
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    const xi = a[i], yi = a[i + 1], xj = a[j], yj = a[j + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

// Índice de la provincia que contiene el punto, o -1 si es mar.
export function provinciaEn(x, y) {
  for (const p of datos.provincias) {
    const c = p.caja;
    if (x < c.x0 || x > c.x1 || y < c.y0 || y > c.y1) continue;
    let dentro = false;
    for (const a of p.anillos) if (dentroDeAnillo(a, x, y)) dentro = !dentro;
    if (dentro) return p.indice;
  }
  return -1;
}

export function cambiarDueno(provincia, etiqueta) {
  if (datos.duenos[provincia] === etiqueta) return;
  datos.duenos[provincia] = etiqueta;
  datos.eventos.dispatchEvent(new CustomEvent('dueno', { detail: provincia }));
}

export function ciudadesDe(i) {
  const id = datos.provincias[i].id;
  return datos.ciudades.filter((c) => c.provincia === id);
}

export function puertosDe(i) {
  const id = datos.provincias[i].id;
  return datos.puertos.filter((p) => p.provincia === id);
}

export function basesDe(i) {
  return datos.bases.filter((b) => b.provincia === i);
}
