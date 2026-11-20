// Operaciones: todo ataque es una Operación (guion: Combate y Operaciones).
//
//   Objetivo(s), eje, fuerzas, reservas, postura, días de preparación, artillería y aviación.
//   Calidad del plan de 0 a 100 % (la plantilla rápida tiene tope 60 %).
//   Combate continuo, sin pausas: reunión → preparación → batalla hora a hora hasta que
//   se quiebra un lado. Si el defensor se quiebra, se toma la provincia y, si hay más
//   objetivos marcados y llega el suministro, se sigue solo al próximo.
//   Cada hora: Ventaja = raíz(P_ataque / P_defensa) x Azar(0,8 a 1,2).

import { datos, nombrePais } from './datos.js';
import { aLonLat, distanciaKm } from './geo.js';
import { posicionSolEn, msUtc } from './tiempo.js';
import { suministroEn, zona } from './suministro.js';
import { aireEnFase, estimarAire, bombardeoAereo, escuadronPorId, escuadronesDe, disponibles as avionesListos, enAlcance } from './aviacion.js';
import { sumarBajas } from './economia.js';
import { enlacesMaritimos } from './marina.js';
import { sumarBajasVoluntad } from './diplomacia.js';
import {
  ejercito, tipos, enGuerra, enemigosEn, brigadaPorId, cuerpoPorId, generalDe, calcularRuta,
  ocupar, retirar, eliminarBrigada, ganarExperiencia, mensaje, avisar,
} from './ejercito.js';

export const operaciones = { lista: [], siguienteId: 1 };
const C = () => datos.reglas.combate;
const limitar = (x, a, b) => Math.max(a, Math.min(b, x));

export const POSTURAS = () => C().posturas;

export const anchoFrente = (prov) => C().terreno[datos.provincias[prov].terreno].ancho_frente;

// ------------------------------------------------------------------ planificación

// Provincias propias desde donde se puede atacar el objetivo.
// Provincias propias desde donde se puede atacar: las vecinas por tierra y, si se controla
// la zona marítima y hay transportes, las costeras de la misma zona (desembarco).
export function ejesPosibles(pais, objetivo) {
  const porTierra = datos.provincias[objetivo].conexiones.filter((c) => datos.duenos[c.j] === pais).map((c) => c.j);
  const porMar = datos.provincias.filter((p, i) => datos.duenos[i] === pais && !porTierra.includes(i)
    && enlacesMaritimos(pais, i).some((e) => e.j === objetivo)).map((p) => p.indice);
  return [...porTierra, ...porMar];
}

export const esDesembarco = (op, objetivo) => op.eje >= 0 && !datos.provincias[objetivo].conexiones.some((c) => c.j === op.eje);

export function brigadasDisponibles(pais) {
  return ejercito.brigadas.filter((b) => b.pais === pais && !b.formacion && !b.operacion);
}

function horasHasta(b, prov) {
  if (b.provincia === prov) return 0;
  const r = calcularRuta(b, prov);
  return r ? r.horas : Infinity;
}

// Plan con valores razonables para un objetivo: base de la plantilla rápida.
export function planInicial(pais, objetivo, preferidas = []) {
  const ejes = ejesPosibles(pais, objetivo);
  const disponibles = brigadasDisponibles(pais);
  const cuantasEn = (p) => disponibles.filter((b) => b.provincia === p).length;
  const eje = ejes.sort((a, b) => cuantasEn(b) - cuantasEn(a))[0] ?? -1;
  let fuerzas = preferidas.filter((b) => disponibles.includes(b));
  if (!fuerzas.length && eje >= 0) {
    const adyacentes = new Set(ejes);
    fuerzas = disponibles
      .map((b) => ({ b, h: adyacentes.has(b.provincia) ? 0 : horasHasta(b, eje) }))
      .filter((x) => x.h < 24 * 20)
      .sort((x, y) => x.h - y.h)
      .slice(0, anchoFrente(objetivo) + 1)
      .map((x) => x.b);
  }
  return {
    pais,
    objetivos: [objetivo],
    eje,
    fuerzas: fuerzas.map((b) => b.id),
    reservas: [],
    postura: 'frontal',
    diasPreparacion: 3,
    artilleria: { preparacion: true, ruptura: true },
    rapida: false,
    // Aviación: escuadrones propios libres que llegan al objetivo.
    aviacion: escuadronesDe(pais).filter((e) => !e.ocupado && avionesListos(e) > 0 && enAlcance(e, objetivo)).map((e) => e.id),
  };
}

// ¿Puede el jugador ver qué tropas hay en la provincia? (tropas propias al lado o reconocimiento)
export function reconocida(pais, prov, op = null) {
  if (op?.reconocido) return true;
  return datos.provincias[prov].conexiones.some((c) => datos.duenos[c.j] === pais && ejercito.brigadas.some((b) => b.pais === pais && b.provincia === c.j));
}

// ------------------------------------------------------------------ calidad del plan

export function calcularCalidad(plan) {
  const f = C().calidad.factores;
  const objetivo = plan.objetivos[plan.objetivos.length > 1 && plan.objetivoActual ? plan.objetivoActual : 0];
  const prov = datos.provincias[objetivo];
  const fuerzas = plan.fuerzas.map(brigadaPorId).filter(Boolean);
  const reservas = plan.reservas.map(brigadaPorId).filter(Boolean);
  const defensores = enemigosEn(plan.pais, objetivo);
  const conexionEje = datos.provincias[plan.eje]?.conexiones.find((c) => c.j === objetivo);
  const favor = { llanura: 1, ciudad: 0.5, selva: 0.4, 'montaña': 0.3 }[prov.terreno] ?? 0.5;
  const generales = fuerzas.map((b) => generalDe(b).experiencia);
  const general = generales.length ? Math.max(...generales) : 1;
  const orgEnemiga = defensores.length ? defensores.reduce((s, b) => s + b.organizacion, 0) / defensores.length : 0;

  const factores = [
    { clave: 'reconocimiento', nombre: 'Reconocimiento previo', max: f.reconocimiento,
      valor: f.reconocimiento * Math.min(1, plan.diasPreparacion / 3),
      nota: plan.diasPreparacion >= 3 ? 'Patrullas durante la preparación' : 'Pocos días para patrullar' },
    { clave: 'eje', nombre: 'Eje bien elegido', max: f.eje,
      valor: f.eje * (0.4 * favor + 0.6 * (conexionEje?.rio ? 0.3 : 1)),
      nota: `${prov.terreno}${conexionEje?.rio ? ', cruzando un río' : ''}` },
    { clave: 'concentracion', nombre: 'Concentración', max: f.concentracion,
      valor: f.concentracion * Math.min(1, fuerzas.length / anchoFrente(objetivo)),
      nota: `${fuerzas.length} de ${anchoFrente(objetivo)} lugares en el frente` },
    { clave: 'apoyo', nombre: 'Apoyo coordinado', max: f.apoyo,
      valor: Math.min(f.apoyo, (plan.artilleria.preparacion ? f.apoyo / 3 : 0) + (plan.artilleria.ruptura ? f.apoyo / 3 : 0) + ((plan.aviacion ?? []).length ? f.apoyo / 3 : 0)),
      nota: 'Artillería por fase' },
    { clave: 'reservas', nombre: 'Reservas listas', max: f.reservas,
      valor: reservas.length ? (reservas.some((b) => tipos()[b.tipo].movil) ? f.reservas : f.reservas * 0.6) : 0,
      nota: reservas.length ? `${reservas.length} en reserva` : 'Sin reservas' },
    { clave: 'momento', nombre: 'Momento', max: f.momento,
      valor: (orgEnemiga < 0.8 ? f.momento / 2 : 0) + (defensores.length <= anchoFrente(objetivo) / 2 ? f.momento / 2 : 0),
      nota: orgEnemiga < 0.8 ? 'Enemigo desgastado' : 'Enemigo descansado (el clima llega más adelante)' },
    { clave: 'suministro', nombre: 'Suministro asegurado', max: f.suministro,
      valor: f.suministro * suministroEn(plan.pais, objetivo),
      nota: `Zona ${{ verde: 'verde', amarillo: 'amarilla', rojo: 'roja' }[zona(suministroEn(plan.pais, objetivo))]} en el frente` },
    { clave: 'general', nombre: 'Experiencia del general', max: f.general,
      valor: (f.general * general) / 5, nota: `Nivel ${general}` },
  ];
  let total = factores.reduce((s, x) => s + x.valor, 0);
  const tope = plan.rapida ? C().calidad.tope_plantilla_rapida : 100;
  total = Math.min(total, tope);
  return { total: Math.round(total), tope, factores };
}

// ------------------------------------------------------------------ poder de combate

function esDeNoche(prov, ms = msUtc()) {
  const c = datos.provincias[prov].centroPos;
  const { lon, lat } = aLonLat(c.x, c.y);
  const s = posicionSolEn(ms);
  const r = Math.PI / 180;
  const cosZ = Math.sin(lat * r) * Math.sin(s.lat * r) + Math.cos(lat * r) * Math.cos(s.lat * r) * Math.cos((lon - s.lon) * r);
  return cosZ < -0.05;
}

function poderBrigada(b, terreno, rol) {
  const t = tipos()[b.tipo];
  const base = rol === 'ataque' ? t.ataque : t.defensa * (1 + b.atrincheramiento);
  const efTerreno = C().terreno[terreno].tipos[b.tipo] ?? 1;
  return base * efTerreno * (b.efectivos / 4000) * b.equipo * (0.6 + 0.6 * b.entrenamiento) * b.moral * (0.3 + 0.7 * b.organizacion);
}

// Lado que ataca: lista de multiplicadores con nombre, para mostrar qué pesa y cuánto.
export function multiplicadoresAtaque(op, atacantes, objetivo, ctx = {}) {
  const c = C();
  const post = c.posturas[op.postura];
  const terreno = datos.provincias[objetivo].terreno;
  const lados = new Set(atacantes.map((b) => b.provincia)).size;
  const movil = atacantes.filter((b) => tipos()[b.tipo].movil).length / Math.max(1, atacantes.length);
  let mPostura = post.ataque;
  if (op.postura === 'cerco' && lados < 2) mPostura = post.ataque_un_lado;
  if (op.postura === 'blindado' && !(movil >= 0.5 && terreno === 'llanura')) mPostura = post.ataque_sin_condiciones;
  const general = Math.max(1, ...atacantes.map((b) => generalDe(b).experiencia));
  const lista = [
    ['Experiencia del general', 1 + c.general_por_nivel * (general - 1)],
    ['Calidad del plan', c.plan_minimo + c.plan_rango * (op.calidad.total / 100)],
    ['Postura', mPostura],
    ['Artillería', op.artilleria?.ruptura ? c.artilleria_ruptura : 1],
    ['Sorpresa', op.detectada ? 1 : c.sorpresa],
    ['Noche', ctx.noche ? c.noche_ataque : 1],
    ['Suministro', ctx.suministro ?? suministroEn(op.pais, objetivo)],
    ['Apoyo aéreo', ctx.aire ?? op.aire?.multiplicador ?? 1],
    ['Desembarco', esDesembarco(op, objetivo) ? datos.reglas.marina.desembarco : 1],
  ];
  return lista;
}

export function multiplicadoresDefensa(op, defensores, objetivo, ctx = {}) {
  const c = C();
  const p = datos.provincias[objetivo];
  const cruzaRio = p.conexiones.some((x) => x.j === op.eje && x.rio);
  const propio = defensores.length && defensores.every((b) => p.pais === b.pais);
  const pais = defensores[0]?.pais ?? op.enemigo ?? datos.duenos[objetivo];
  return [
    ['Terreno', c.terreno[p.terreno].defensa],
    ['Río', cruzaRio ? c.rio : 1],
    ['Defensa del propio suelo', propio ? c.defensa_propio_suelo : 1],
    ['Conocimiento del terreno', propio ? c.conocimiento_terreno : 1],
    ['Suministro', suministroEn(pais, objetivo)],
    ['Aviación enemiga', ctx.aireDefensa ?? op.aire?.multiplicadorDefensa ?? 1],
  ];
}

const producto = (lista) => lista.reduce((s, [, v]) => s * v, 1);

function enFrente(lista, terreno, rol, n) {
  const minOrg = C().desgaste.organizacion_minima_para_pelear;
  return lista
    .filter((b) => b.organizacion > minOrg && !b.formacion)
    .map((b) => ({ b, p: poderBrigada(b, terreno, rol) }))
    .sort((x, y) => y.p - x.p)
    .slice(0, n);
}

// Una hora de combate. Sirve para el combate real y para las simulaciones de la predicción.
function horaDeCombate(op, atacantes, defensores, objetivo, ctx) {
  const c = C();
  const d = c.desgaste;
  const terreno = datos.provincias[objetivo].terreno;
  const n = anchoFrente(objetivo) + (op.postura === 'cerco' ? 1 : 0);
  const fA = enFrente(atacantes, terreno, 'ataque', n);
  const fD = enFrente(defensores, terreno, 'defensa', anchoFrente(objetivo));
  if (!fA.length) return { fin: 'agotados' };
  if (!fD.length) return { fin: 'quebrados' };
  const pa = fA.reduce((s, x) => s + x.p, 0) * producto(multiplicadoresAtaque(op, fA.map((x) => x.b), objetivo, ctx));
  const pd = fD.reduce((s, x) => s + x.p, 0) * producto(multiplicadoresDefensa(op, fD.map((x) => x.b), objetivo, ctx)) * (ctx.defensaExtra ?? 1);
  const azar = c.azar_min + (ctx.azar ?? Math.random)() * (c.azar_max - c.azar_min);
  const v = Math.sqrt(pa / pd) * azar;
  const post = c.posturas[op.postura];
  let bajasA = 0;
  let bajasD = 0;
  for (const { b } of fA) {
    b.organizacion = Math.max(0, b.organizacion - d.organizacion_atacante_por_hora / v);
    const perdidos = Math.min(b.efectivos, b.efectivos * d.bajas_atacante_por_hora * post.bajas_propias / v);
    b.efectivos -= perdidos;
    bajasA += perdidos;
    b.enCombate = true;
  }
  for (const { b } of fD) {
    b.organizacion = Math.max(0, b.organizacion - d.organizacion_defensor_por_hora * v * (post.desgaste_organizacion ?? 1));
    const perdidos = Math.min(b.efectivos, b.efectivos * d.bajas_defensor_por_hora * post.bajas_enemigas * v);
    b.efectivos -= perdidos;
    bajasD += perdidos;
    b.enCombate = true;
  }
  return { ventaja: v, pa, pd, bajasA, bajasD };
}

function bombardeoHora(op, defensores) {
  const f = C().bombardeo;
  const m = C().posturas[op.postura].desgaste_organizacion ?? 1;
  for (const b of defensores) {
    b.organizacion = Math.max(0, b.organizacion - f.organizacion_defensor_por_hora * m);
    b.atrincheramiento = Math.max(0, b.atrincheramiento - f.atrincheramiento_por_hora);
  }
}

// ------------------------------------------------------------------ guarnición territorial

// En una provincia propia sin brigadas defiende una guarnición (policía, gendarmería,
// reservistas locales). No es una brigada: vive solo dentro de la operación.
function crearGuarnicion(atacante, obj) {
  const pr = datos.provincias[obj];
  if (pr.pais !== datos.duenos[obj] || datos.duenos[obj] === atacante) return null;
  const g = C().guarnicion;
  const capital = datos.ciudades.some((x) => x.capital === 'pais' && x.provincia === pr.id);
  const hombres = Math.min(g.efectivos_maximos, g.efectivos + (g.efectivos_por_100000_km2 * pr.area_km2) / 100000)
    * (pr.terreno === 'ciudad' || capital ? g.multiplicador_ciudad : 1);
  return {
    id: -1, pais: datos.duenos[obj], tipo: g.tipo, nombre: 'Guarnición territorial', provincia: obj,
    efectivos: hombres, efectivosMax: hombres, entrenamiento: g.entrenamiento, equipo: g.equipo,
    moral: g.moral, organizacion: g.organizacion, atrincheramiento: 0.1,
  };
}

const puedePelear = (b) => b.organizacion > C().desgaste.organizacion_minima_para_pelear;

// ------------------------------------------------------------------ predicción

const copiar = (b) => ({ ...b });

// Simula la batalla entera muchas veces con copias de las tropas, hasta que se quiebra
// un lado. Si no hay reconocimiento, la fuerza enemiga es una estimación (±30 %).
export function predecir(plan, veces = 60) {
  const cb = C().batalla;
  const objetivo = plan.objetivos[0];
  const op = { ...plan, calidad: calcularCalidad(plan), detectada: false };
  const fuerzas = [...plan.fuerzas, ...(plan.reservas ?? [])].map(brigadaPorId).filter(Boolean);
  const defensoresReales = enemigosEn(plan.pais, objetivo);
  const guarnicion = defensoresReales.length ? null : crearGuarnicion(plan.pais, objetivo);
  const visto = reconocida(plan.pais, objetivo, plan);
  const conBombardeo = plan.artilleria.preparacion || plan.postura === 'desgaste';
  const horasBombardeo = conBombardeo ? C().bombardeo.horas : 0;
  const inicio = msUtc() + (plan.diasPreparacion * 24 + horasBombardeo) * 3600e3;
  const maximo = cb.horas_maximas_prediccion;
  const noche = Array.from({ length: maximo }, (_, h) => esDeNoche(objetivo, inicio + h * 3600e3));
  const aire = estimarAire(plan, objetivo, defensoresReales.length);
  const ctxAire = { aire: (plan.aviacion ?? []).length ? aire.multiplicador : 1, aireDefensa: aire.multiplicadorDefensa };
  const adyacente = (b) => datos.provincias[objetivo].conexiones.some((c) => c.j === b.provincia && datos.duenos[c.j] === plan.pais);
  let ganadas = 0;
  const horasVictoria = [];
  let primera = null;
  for (let k = 0; k < veces; k++) {
    // Las fuerzas que todavía no llegaron se suponen en el eje.
    const at = fuerzas.map((b) => ({ ...copiar(b), provincia: adyacente(b) ? b.provincia : plan.eje }));
    const escala = visto ? 1 : 0.7 + Math.random() * 0.6;
    const de = (defensoresReales.length ? defensoresReales : guarnicion ? [guarnicion] : [])
      .map((b) => ({ ...copiar(b), efectivos: b.efectivos * escala, atrincheramiento: Math.min(0.4, b.atrincheramiento + plan.diasPreparacion * 0.02) }));
    if (!de.length) { ganadas++; horasVictoria.push(0); continue; }
    for (let h = 0; h < horasBombardeo; h++) bombardeoHora(op, de);
    let gano = false;
    for (let h = 0; h < maximo; h++) {
      const r = horaDeCombate(op, at, de, objetivo, { noche: noche[h], ...ctxAire });
      if (r.fin) { gano = r.fin === 'quebrados'; if (gano) horasVictoria.push(h); break; }
      if (primera === null) primera = { pa: r.pa, pd: r.pd };
    }
    if (gano) ganadas++;
  }
  horasVictoria.sort((a, b) => a - b);
  const mediana = horasVictoria.length ? horasVictoria[Math.floor(horasVictoria.length / 2)] : null;
  return {
    probGanar: ganadas / veces,
    dias: mediana == null ? null : (mediana + horasBombardeo) / 24,
    visto,
    calidad: op.calidad,
    ataque: primera?.pa ?? 0,
    defensa: primera?.pd ?? 0,
    multAtaque: multiplicadoresAtaque(op, fuerzas, objetivo, ctxAire),
    multDefensa: multiplicadoresDefensa(op, defensoresReales, objetivo, ctxAire),
    superioridad: aire.superioridad,
    defensores: visto ? defensoresReales.length : null,
    guarnicion: !!guarnicion,
  };
}

// ------------------------------------------------------------------ ejecución

export const operacionPorId = (id) => operaciones.lista.find((o) => o.id === id);
const fuerzasDe = (op) => op.fuerzas.map(brigadaPorId).filter(Boolean);
const reservasDe = (op) => op.reservas.map(brigadaPorId).filter(Boolean);
export const objetivoActual = (op) => op.objetivos[op.objetivoActual];

export function lanzarOperacion(plan) {
  const objetivo = plan.objetivos[0];
  const enemigo = datos.duenos[objetivo];
  if (!enGuerra(plan.pais, enemigo)) return `No estás en guerra con ${nombrePais(enemigo)}.`;
  if (plan.eje < 0 || !ejesPosibles(plan.pais, objetivo).includes(plan.eje)) return 'El eje tiene que ser una provincia propia pegada al objetivo.';
  if (!plan.fuerzas.length) return 'Elegí al menos una brigada para atacar.';
  const op = {
    ...structuredClone(plan),
    id: operaciones.siguienteId++,
    enemigo,
    estado: 'reuniendo',
    horasPreparacion: plan.rapida ? 0 : plan.diasPreparacion * 24,
    horasBombardeo: 0,
    horasBatalla: 0,
    detectada: false,
    reconocido: false,
    objetivoActual: 0,
    guarnicion: null,
    balance: 0.5,
    bajas: { propias: 0, enemigas: 0 },
    tomadas: [],
  };
  op.calidad = calcularCalidad(op);
  op.aviacion = (op.aviacion ?? []).filter((id) => escuadronPorId(id) && !escuadronPorId(id).ocupado);
  for (const id of op.aviacion) escuadronPorId(id).ocupado = `op-${op.id}`;
  for (const b of [...fuerzasDe(op), ...reservasDe(op)]) b.operacion = op.id;
  reunir(op);
  operaciones.lista.push(op);
  mensaje(`Operación sobre ${datos.provincias[objetivo].nombre}: ${plan.rapida ? 'ataque con plantilla rápida' : `${plan.diasPreparacion} ${plan.diasPreparacion === 1 ? 'día' : 'días'} de preparación`}. Calidad del plan ${op.calidad.total} %.`, 'info', op.pais);
  avisar('cambio');
  return null;
}

// Manda a las tropas al eje (las que ya están pegadas al objetivo se quedan donde están).
function reunir(op) {
  const objetivo = objetivoActual(op);
  const adyacentes = new Set(ejesPosibles(op.pais, objetivo));
  for (const b of [...fuerzasDe(op), ...reservasDe(op)]) {
    if (adyacentes.has(b.provincia) && op.fuerzas.includes(b.id)) { b.mov = null; continue; }
    if (b.provincia === op.eje) { b.mov = null; continue; }
    const r = calcularRuta(b, op.eje);
    if (r) b.mov = { ruta: r.ruta, recorrido: 0 };
  }
}

function terminar(op, texto, tono = 'info') {
  op.estado = 'terminada';
  op.final = { texto, tono };
  for (const e of (op.aviacion ?? []).map(escuadronPorId)) if (e && e.ocupado === `op-${op.id}`) e.ocupado = null;
  for (const b of [...fuerzasDe(op), ...reservasDe(op)]) {
    b.operacion = null;
    if (b.mov && b.mov.ruta.at(-1) !== b.provincia && datos.duenos[b.mov.ruta.at(-1)] !== b.pais) b.mov = null;
  }
  for (const c of new Set(fuerzasDe(op).map((b) => b.cuerpo))) ganarExperiencia(c);
  mensaje(texto, tono, op.pais, 'aviso');
  avisar('cambio');
}

// El jugador corta la operación: las tropas se quedan donde están.
export function cancelarOperacion(op) {
  if (op.estado === 'terminada') return;
  terminar(op, `Se suspendió el ataque sobre ${datos.provincias[objetivoActual(op)].nombre}.`, 'info');
}

// El defensor reacciona: trae reservas de provincias vecinas.
function reaccionDefensor(op, provincia) {
  const prob = op.detectada ? C().reaccion_defensor.trae_reservas : C().reaccion_defensor.trae_reservas_si_no_detecto;
  const traidas = [];
  for (const c of datos.provincias[provincia].conexiones) {
    if (datos.duenos[c.j] !== op.enemigo) continue;
    for (const b of ejercito.brigadas) {
      if (b.pais !== op.enemigo || b.provincia !== c.j || b.formacion || b.mov || b.enCombate) continue;
      if (Math.random() > prob) continue;
      const r = calcularRuta(b, provincia);
      if (r) { b.mov = { ruta: r.ruta, recorrido: 0 }; traidas.push(b); }
    }
  }
  return traidas;
}

// Tropas propias de la operación pegadas al objetivo y listas para pelear.
export function atacantesEnPosicion(op, objetivo = objetivoActual(op)) {
  const ady = new Set(datos.provincias[objetivo].conexiones.filter((c) => datos.duenos[c.j] === op.pais).map((c) => c.j));
  if (esDesembarco(op, objetivo)) ady.add(op.eje);
  return [...fuerzasDe(op), ...reservasDe(op)].filter((b) => !b.mov && ady.has(b.provincia));
}

// Quién defiende: las brigadas enemigas o, si no hay, la guarnición territorial.
export function defensoresDe(op) {
  const obj = objetivoActual(op);
  const brigadas = enemigosEn(op.pais, obj);
  if (brigadas.length) return brigadas;
  if (op.guarnicion?.provincia !== obj) op.guarnicion = crearGuarnicion(op.pais, obj);
  return op.guarnicion && op.guarnicion.efectivos > 0 ? [op.guarnicion] : [];
}

function empezarBatalla(op) {
  op.estado = 'combate';
  op.horasBatalla = 0;
  op.horasBombardeo = op.artilleria.preparacion || op.postura === 'desgaste' ? C().bombardeo.horas : 0;
  op.reconocido = op.reconocido || op.horasBombardeo > 0;
  op.guarnicion = null;
  op.aire = null;
  reaccionDefensor(op, objetivoActual(op));
}

function sumarBajasOp(op, propias, enemigas) {
  op.bajas.propias += propias;
  op.bajas.enemigas += enemigas;
  sumarBajas(op.pais, propias);
  sumarBajas(op.enemigo, enemigas);
  sumarBajasVoluntad(op.pais, propias);
  sumarBajasVoluntad(op.enemigo, enemigas);
}

function limpiarDestruidas(op) {
  const d = C().desgaste;
  for (const b of [...ejercito.brigadas]) {
    if (b.efectivos < b.efectivosMax * d.efectivos_minimos) {
      eliminarBrigada(b, `La ${b.nombre} (${nombrePais(b.pais)}) quedó deshecha.`);
    }
  }
  op.fuerzas = op.fuerzas.filter((id) => brigadaPorId(id));
  op.reservas = op.reservas.filter((id) => brigadaPorId(id));
}

// Pasa una hora para todas las operaciones en curso.
export function actualizarOperaciones() {
  for (const op of operaciones.lista) {
    if (op.estado === 'terminada') continue;
    if (!fuerzasDe(op).length && !reservasDe(op).length) {
      terminar(op, `El ataque sobre ${datos.provincias[objetivoActual(op)].nombre} terminó: no quedan tropas.`, 'malo');
      continue;
    }
    if (datos.duenos[objetivoActual(op)] === op.pais) { siguienteObjetivo(op); continue; }
    if (op.estado === 'reuniendo') {
      if (fuerzasDe(op).every((b) => !b.mov)) {
        op.estado = 'preparando';
        if (op.horasPreparacion <= 0) empezarBatalla(op);
      }
      continue;
    }
    if (op.estado === 'preparando') {
      op.horasPreparacion--;
      if (op.horasPreparacion % 24 === 0 && !op.detectada) {
        const det = C().deteccion;
        if (Math.random() < det.por_dia + det.por_brigada * op.fuerzas.length) {
          op.detectada = true;
          mensaje(`El enemigo detectó la concentración frente a ${datos.provincias[objetivoActual(op)].nombre}: se pierde la sorpresa.`, 'malo', op.pais, 'aviso');
          reaccionDefensor(op, objetivoActual(op));
        }
      }
      if (op.horasPreparacion <= 0) empezarBatalla(op);
      continue;
    }
    if (op.estado === 'combate') horaDeBatalla(op);
  }
}

function horaDeBatalla(op) {
  const cb = C().batalla;
  const objetivo = objetivoActual(op);
  const defensores = defensoresDe(op);
  op.horasBatalla++;

  // La aviación asignada sale una vez por día; la enemiga en alerta, también.
  if ((op.horasBatalla - 1) % cb.horas_entre_salidas_aereas === 0) {
    op.aire = aireEnFase(op, objetivo, defensores.length);
    if (op.aire?.revela) op.reconocido = true;
  }

  // Bombardeo previo: artillería (y aviación) antes del asalto.
  if (op.horasBombardeo > 0) {
    op.horasBombardeo--;
    bombardeoHora(op, defensores);
    if (op.aire && (op.aviacion ?? []).length) bombardeoAereo(op.aire, defensores);
    for (const b of defensores) b.enCombate = true;
    return;
  }

  const atacantes = atacantesEnPosicion(op, objetivo);
  let r;
  if (!defensores.some(puedePelear)) r = { fin: 'quebrados' };
  else r = horaDeCombate(op, atacantes, defensores, objetivo, { noche: esDeNoche(objetivo), suministro: suministroEn(op.pais, objetivo) });
  if (!r.fin) {
    sumarBajasOp(op, r.bajasA, r.bajasD);
    // Balance de la batalla (para la barra del mapa): organización ponderada de cada lado.
    const fuerza = (lista) => lista.reduce((s, b) => s + b.organizacion * b.efectivos, 0);
    const a = fuerza(atacantes.filter(puedePelear)) * Math.sqrt(r.ventaja);
    const d = fuerza(defensores.filter(puedePelear)) / Math.sqrt(r.ventaja);
    op.balance = a + d > 0 ? a / (a + d) : 0.5;
    op.ventaja = r.ventaja;
  }
  limpiarDestruidas(op);
  if (r.fin === 'quebrados') victoria(op);
  else if (r.fin === 'agotados') terminar(op, `El ataque sobre ${datos.provincias[objetivo].nombre} se agotó: las tropas no pueden seguir peleando.`, 'malo');
}

// El defensor se quiebra: se retira (o se rinde si está cercado) y se toma la provincia.
function victoria(op) {
  const objetivo = objetivoActual(op);
  const nombre = datos.provincias[objetivo].nombre;
  const defensores = enemigosEn(op.pais, objetivo);
  const atacantes = atacantesEnPosicion(op, objetivo).filter((b) => b.organizacion > 0.05);
  const lados = new Set(atacantes.map((b) => b.provincia)).size;
  let rendidos = 0;
  if (op.postura === 'cerco' && lados >= 2) {
    for (const b of defensores) {
      rendidos += b.efectivos;
      eliminarBrigada(b, `La ${b.nombre} (${nombrePais(b.pais)}) quedó cercada en ${nombre} y se rindió.`);
    }
  } else {
    for (const b of defensores) b.efectivos *= 1 - C().desgaste.ruptura_bajas_extra_defensor;
    retirar(defensores, objetivo, op.pais);
  }
  if (rendidos) sumarBajasOp(op, 0, rendidos);
  if (datos.duenos[objetivo] !== op.pais) ocupar(objetivo, op.pais);
  // Las tropas que atacaron entran en la provincia.
  for (const b of atacantes) {
    const r = calcularRuta(b, objetivo);
    if (r && r.ruta.length) b.mov = { ruta: r.ruta, recorrido: 0 };
    else { b.provincia = objetivo; b.mov = null; }
  }
  op.tomadas.push(objetivo);
  limpiarDestruidas(op);
  siguienteObjetivo(op);
}

// Después de tomar un objetivo: se sigue solo al próximo marcado si llega el suministro.
function siguienteObjetivo(op) {
  const tomada = objetivoActual(op);
  const nombre = datos.provincias[tomada].nombre;
  if (!op.tomadas.includes(tomada)) op.tomadas.push(tomada);
  const siguiente = op.objetivos[op.objetivoActual + 1];
  if (siguiente === undefined) {
    terminar(op, `Se tomó ${nombre}. ${op.tomadas.length > 1 ? `La operación terminó con ${op.tomadas.length} provincias tomadas.` : ''}`.trim(), 'bueno');
    return;
  }
  if (datos.duenos[siguiente] === op.pais) { op.objetivoActual++; siguienteObjetivo(op); return; }
  if (!enGuerra(op.pais, datos.duenos[siguiente])) {
    terminar(op, `Se tomó ${nombre}. El próximo objetivo ya no es enemigo: la operación termina.`, 'bueno');
    return;
  }
  if (suministroEn(op.pais, siguiente) < datos.reglas.suministro.umbral_amarillo) {
    terminar(op, `Se tomó ${nombre}, pero el suministro no llega más lejos: el avance se frena.`, 'bueno');
    return;
  }
  const ejes = ejesPosibles(op.pais, siguiente);
  if (!ejes.length) { terminar(op, `Se tomó ${nombre}. No hay por dónde seguir al próximo objetivo.`, 'bueno'); return; }
  op.objetivoActual++;
  op.enemigo = datos.duenos[siguiente];
  op.eje = ejes.includes(tomada) ? tomada : ejes[0];
  op.calidad = calcularCalidad({ ...op, objetivos: [siguiente] });
  op.horasPreparacion = 0;
  op.estado = 'reuniendo';
  reunir(op);
  mensaje(`Se tomó ${nombre}. Las tropas siguen hacia ${datos.provincias[siguiente].nombre}.`, 'bueno', op.pais, 'aviso');
  avisar('cambio');
}

export function operacionesActivas(pais) {
  return operaciones.lista.filter((o) => o.pais === pais && o.estado !== 'terminada');
}

// Operación en curso sobre una provincia (para la ficha y el ícono del mapa).
export const batallaEn = (prov) => operaciones.lista.filter((o) => o.estado !== 'terminada' && objetivoActual(o) === prov);

export function cuerpoNombre(id) {
  return cuerpoPorId(id)?.nombre ?? '';
}
