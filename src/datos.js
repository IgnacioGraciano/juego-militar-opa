// Carga los datos del juego (carpeta data/) y guarda el estado del mapa.
// Los datos están separados del código: para cambiar países, bases o el
// escenario se editan los archivos .json, no los scripts.

import { geo, desdeLonLat, distanciaKm } from './geo.js';

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
  reglas: { ejercito: {}, combate: {}, aviacion: {}, suministro: {}, economia: {}, disenador: {}, marina: {}, diplomacia: {} },
  barcos: { clases: {} },
  zonas: {}, // zonas marítimas
  tanques: { modelos: {} },
  diplomacia: {},
  arbol: null, // árbol nacional del jugador
  eventosEscenario: [], // eventos con fecha (data/eventos)
  aviones: { modelos: {}, proveedores: {} },
  trenes: [],
  historico: {}, // poder militar por país y año (Correlates of War)
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
  const [paises, geom, prov, ciud, puer, rios, lagos, reg, bases, esc, rEjercito, rCombate, hist,
    rAviacion, rSuministro, rEconomia, aviones, trenes, rDisenador, rMarina, rDiplomacia, barcos, zonas, tanques,
    diplomacia, eventosEscenario] = await Promise.all([
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
    leerJson('data/reglas/ejercito.json'),
    leerJson('data/reglas/combate.json'),
    leerJson('data/historico/poder_militar.json'),
    leerJson('data/reglas/aviacion.json'),
    leerJson('data/reglas/suministro.json'),
    leerJson('data/reglas/economia.json'),
    leerJson('data/aviones.json'),
    leerJson('data/mapa/trenes.json'),
    leerJson('data/reglas/disenador.json'),
    leerJson('data/reglas/marina.json'),
    leerJson('data/reglas/diplomacia.json'),
    leerJson('data/barcos.json'),
    leerJson('data/mapa/zonas_maritimas.json'),
    leerJson('data/tanques.json'),
    leerJson(`data/diplomacia/${escenario}.json`),
    leerJson(`data/eventos/${escenario}.json`),
  ]);
  datos.barcos = barcos;
  datos.tanques = tanques;
  datos.diplomacia = diplomacia;
  datos.eventosEscenario = eventosEscenario.eventos ?? [];
  datos.zonas = Object.fromEntries(Object.entries(zonas.zonas).map(([k, z]) => {
    const c = desdeLonLat(z.centro[0], z.centro[1]);
    return [k, { ...z, clave: k, x: c.x, y: c.y }];
  }));
  datos.radioZonaKm = zonas.radio_km;
  datos.reglas = {
    ejercito: rEjercito, combate: rCombate, aviacion: rAviacion, suministro: rSuministro, economia: rEconomia,
    disenador: rDisenador, marina: rMarina, diplomacia: rDiplomacia,
  };
  datos.aviones = aviones;
  datos.trenes = trenes.trenes.map((t) => aLinea(t));
  datos.historico = hist;

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

  // Grafo de provincias vecinas: índice, distancia entre centros (km), río, estrecho.
  for (const p of datos.provincias) {
    const rio = new Set(p.vecinos_rio || []);
    const tren = new Set(p.vecinos_tren || []);
    const conexiones = [];
    const agregar = (id, estrecho) => {
      const j = datos.indiceProvincia.get(id);
      if (j === undefined) return;
      const q = datos.provincias[j];
      const km = distanciaKm(p.centroPos.x, p.centroPos.y, q.centroPos.x, q.centroPos.y);
      conexiones.push({ j, km, rio: rio.has(id), tren: tren.has(id), estrecho });
    };
    for (const id of p.vecinos) agregar(id, false);
    for (const id of p.vecinos_estrecho || []) agregar(id, true);
    p.conexiones = conexiones;
  }

  datos.fronteras = geom.fronteras.map((f) => ({ a: f.a, b: f.b, path: aLinea(f.p) }));

  datos.ciudades = ciud.ciudades.map((c) => ({ ...c, x: c.pos[0], y: c.pos[1] }));
  datos.puertos = puer.puertos.map((p) => ({ ...p, x: p.pos[0], y: p.pos[1] }));
  datos.rios = rios.rios.map((r) => ({ nombre: r.nombre, rango: r.rango, path: aLinea(r.p) }));
  datos.lagos = lagos.lagos.map((l) => ({ ...l, path: aPath(l.anillos) }));
  datos.regiones = reg.regiones.map((r) => ({ ...r, x: r.pos[0], y: r.pos[1] }));

  // Las bases se escriben a mano en lon/lat: se proyectan acá.
  datos.bases = bases.bases.map((b, indice) => {
    const p = desdeLonLat(b.lon, b.lat);
    let provincia = provinciaEn(p.x, p.y);
    if (provincia < 0) {
      // Bases sobre la costa: la provincia más cercana del mismo país.
      const cand = datos.provincias.filter((q) => q.pais === b.pais);
      cand.sort((q, r) => Math.hypot(q.centroPos.x - p.x, q.centroPos.y - p.y) - Math.hypot(r.centroPos.x - p.x, r.centroPos.y - p.y));
      provincia = cand[0]?.indice ?? -1;
    }
    return { ...b, indice, x: p.x, y: p.y, provincia };
  });

  // Escenario: dueños iniciales
  datos.escenario = esc;
  // Árbol nacional del país del jugador (si existe para el escenario)
  try {
    datos.arbol = await leerJson(`data/arboles/${esc.pais_jugador}_${escenario}.json`);
  } catch {
    datos.arbol = null;
  }
  // Provincias costeras de cada zona marítima
  for (const z of Object.values(datos.zonas)) {
    z.costeras = datos.provincias.filter((p) => p.costera && distanciaKm(p.centroPos.x, p.centroPos.y, z.x, z.y) <= datos.radioZonaKm).map((p) => p.indice);
  }
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
