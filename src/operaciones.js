// Operaciones: todo ataque es una Operación (guion: Combate y Operaciones).
//
//   Objetivo, eje, fuerzas, reservas, postura, días de preparación y artillería por fase.
//   Calidad del plan de 0 a 100 % (la plantilla rápida tiene tope 60 %).
//   Tres fases: preparación, ruptura y explotación, con pausa entre fase y fase.
//   Cada hora: Ventaja = raíz(P_ataque / P_defensa) x Azar(0,8 a 1,2).

import { datos, nombrePais } from './datos.js';
import { aLonLat } from './geo.js';
import { posicionSolEn, msUtc, tiempo } from './tiempo.js';
import {
  ejercito, tipos, enGuerra, enemigosEn, brigadaPorId, cuerpoPorId, generalDe, calcularRuta,
  ocupar, retirar, eliminarBrigada, ganarExperiencia, mensaje, avisar,
} from './ejercito.js';

export const operaciones = { lista: [], siguienteId: 1 };
const C = () => datos.reglas.combate;
const limitar = (x, a, b) => Math.max(a, Math.min(b, x));

export const POSTURAS = () => C().posturas;
export const FASES = { preparacion: 'Preparación', ruptura: 'Ruptura', explotacion: 'Explotación' };

export function resultadoPorVentaja(v) {
  return C().resultados.find((r) => v < r.hasta) ?? C().resultados.at(-1);
}

export const anchoFrente = (prov) => C().terreno[datos.provincias[prov].terreno].ancho_frente;

// ------------------------------------------------------------------ planificación

// Provincias propias desde donde se puede atacar el objetivo.
export function ejesPosibles(pais, objetivo) {
  return datos.provincias[objetivo].conexiones.filter((c) => datos.duenos[c.j] === pais).map((c) => c.j);
}

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
    artilleria: { preparacion: true, ruptura: true, explotacion: false },
    rapida: false,
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
      valor: (plan.artilleria.preparacion ? f.apoyo / 2 : 0) + (plan.artilleria.ruptura ? f.apoyo / 2 : 0),
      nota: 'Artillería por fase (la aviación llega en el paso 6)' },
    { clave: 'reservas', nombre: 'Reservas listas', max: f.reservas,
      valor: reservas.length ? (reservas.some((b) => tipos()[b.tipo].movil) ? f.reservas : f.reservas * 0.6) : 0,
      nota: reservas.length ? `${reservas.length} en reserva` : 'Sin reservas' },
    { clave: 'momento', nombre: 'Momento', max: f.momento,
      valor: (orgEnemiga < 0.8 ? f.momento / 2 : 0) + (defensores.length <= anchoFrente(objetivo) / 2 ? f.momento / 2 : 0),
      nota: orgEnemiga < 0.8 ? 'Enemigo desgastado' : 'Enemigo descansado (el clima llega más adelante)' },
    { clave: 'suministro', nombre: 'Suministro asegurado', max: f.suministro,
      valor: plan.eje >= 0 && datos.provincias[plan.eje].pais === plan.pais ? f.suministro : f.suministro / 2,
      nota: 'Se completa con el paso 5 (suministro)' },
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
    ['Artillería', ctx.fase === 'ruptura' && op.artilleria.ruptura ? c.artilleria_ruptura : 1],
    ['Sorpresa', op.detectada ? 1 : c.sorpresa],
    ['Noche', ctx.noche ? c.noche_ataque : 1],
    ['Suministro', ctx.suministro ?? 1],
  ];
  return lista;
}

export function multiplicadoresDefensa(op, defensores, objetivo) {
  const c = C();
  const p = datos.provincias[objetivo];
  const cruzaRio = p.conexiones.some((x) => x.j === op.eje && x.rio);
  const propio = defensores.length && defensores.every((b) => p.pais === b.pais);
  return [
    ['Terreno', c.terreno[p.terreno].defensa],
    ['Río', cruzaRio ? c.rio : 1],
    ['Defensa del propio suelo', propio ? c.defensa_propio_suelo : 1],
    ['Conocimiento del terreno', propio ? c.conocimiento_terreno : 1],
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
  const pd = fD.reduce((s, x) => s + x.p, 0) * producto(multiplicadoresDefensa(op, fD.map((x) => x.b), objetivo)) * (ctx.defensaExtra ?? 1);
  const azar = c.azar_min + (ctx.azar ?? Math.random)() * (c.azar_max - c.azar_min);
  const v = Math.sqrt(pa / pd) * azar;
  const post = c.posturas[op.postura];
  for (const { b } of fA) {
    b.organizacion = Math.max(0, b.organizacion - d.organizacion_atacante_por_hora / v);
    b.efectivos = Math.max(0, b.efectivos - b.efectivos * d.bajas_atacante_por_hora * post.bajas_propias / v);
    b.enCombate = true;
  }
  for (const { b } of fD) {
    b.organizacion = Math.max(0, b.organizacion - d.organizacion_defensor_por_hora * v * (post.desgaste_organizacion ?? 1));
    b.efectivos = Math.max(0, b.efectivos - b.efectivos * d.bajas_defensor_por_hora * post.bajas_enemigas * v);
    b.enCombate = true;
  }
  return { ventaja: v, pa, pd };
}

function bombardeoHora(op, defensores) {
  const f = C().fases.preparacion;
  const m = C().posturas[op.postura].desgaste_organizacion ?? 1;
  for (const b of defensores) {
    b.organizacion = Math.max(0, b.organizacion - f.organizacion_defensor_por_hora_con_artilleria * m);
    b.atrincheramiento = Math.max(0, b.atrincheramiento - f.atrincheramiento_por_hora_con_artilleria);
  }
}

// ------------------------------------------------------------------ predicción

const copiar = (b) => ({ ...b });

// Simula la preparación y la ruptura muchas veces con copias de las tropas.
// Si no hay reconocimiento, la fuerza enemiga es una estimación (±30 %).
export function predecir(plan, veces = 80) {
  const objetivo = plan.objetivos[0];
  const op = { ...plan, calidad: calcularCalidad(plan), detectada: false };
  const fuerzas = plan.fuerzas.map(brigadaPorId).filter(Boolean);
  const defensoresReales = enemigosEn(plan.pais, objetivo);
  const visto = reconocida(plan.pais, objetivo, plan);
  const conteo = { rechazo: 0, estancamiento: 0, avance: 0, ruptura: 0 };
  let sumaV = 0;
  let primera = null;
  const horasRuptura = C().fases.ruptura.horas;
  // La ruptura empieza después de la preparación y del bombardeo: se mira si es de noche en cada hora.
  const inicio = msUtc() + (plan.diasPreparacion * 24 + C().fases.preparacion.horas) * 3600e3;
  const noche = Array.from({ length: horasRuptura }, (_, h) => esDeNoche(objetivo, inicio + h * 3600e3));
  for (let k = 0; k < veces; k++) {
    // Las fuerzas que todavía no llegaron se suponen en el eje.
    const at = fuerzas.map((b) => ({ ...copiar(b), provincia: datos.provincias[objetivo].conexiones.some((c) => c.j === b.provincia && datos.duenos[c.j] === plan.pais) ? b.provincia : plan.eje, organizacion: b.organizacion }));
    const escala = visto ? 1 : 0.7 + Math.random() * 0.6;
    const de = defensoresReales.map((b) => ({ ...copiar(b), efectivos: b.efectivos * escala, atrincheramiento: Math.min(0.4, b.atrincheramiento + (plan.diasPreparacion * 0.02)) }));
    if (!de.length) { conteo.ruptura++; sumaV += 3; continue; }
    if (plan.artilleria.preparacion || plan.postura === 'desgaste') for (let h = 0; h < C().fases.preparacion.horas; h++) bombardeoHora(op, de);
    let suma = 0, horas = 0, fin = null;
    for (let h = 0; h < horasRuptura; h++) {
      const r = horaDeCombate(op, at, de, objetivo, { fase: 'ruptura', noche: noche[h] });
      if (r.fin) { fin = r.fin; break; }
      if (primera === null) primera = { pa: r.pa, pd: r.pd };
      suma += r.ventaja;
      horas++;
    }
    const media = horas ? suma / horas : 0;
    let res = resultadoPorVentaja(media).clave;
    if (fin === 'quebrados') res = 'ruptura';
    if (fin === 'agotados' && (res === 'avance' || res === 'ruptura')) res = 'estancamiento';
    conteo[res]++;
    sumaV += media;
  }
  const prob = Object.fromEntries(Object.entries(conteo).map(([k, v]) => [k, v / veces]));
  const probable = Object.entries(prob).sort((a, b) => b[1] - a[1])[0][0];
  return {
    probabilidades: prob,
    probable,
    ventajaMedia: sumaV / veces,
    visto,
    calidad: op.calidad,
    ataque: primera?.pa ?? 0,
    defensa: primera?.pd ?? 0,
    multAtaque: multiplicadoresAtaque(op, fuerzas, objetivo, { fase: 'ruptura' }),
    multDefensa: multiplicadoresDefensa(op, defensoresReales, objetivo),
    defensores: visto ? defensoresReales.length : null,
  };
}

// ------------------------------------------------------------------ ejecución

export const operacionPorId = (id) => operaciones.lista.find((o) => o.id === id);
const fuerzasDe = (op) => op.fuerzas.map(brigadaPorId).filter(Boolean);
const reservasDe = (op) => op.reservas.map(brigadaPorId).filter(Boolean);
const objetivoActual = (op) => op.objetivos[op.objetivoActual];

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
    fase: null,
    horasFase: 0,
    sumaVentaja: 0,
    horasPreparacion: plan.rapida ? 0 : plan.diasPreparacion * 24,
    detectada: false,
    reconocido: false,
    objetivoActual: 0,
    suministro: 1,
    avanceExplotacion: 0,
    bajas: { propias: 0, enemigas: 0 },
    resultados: [],
    decision: null,
  };
  op.calidad = calcularCalidad(op);
  const adyacentes = new Set(ejesPosibles(plan.pais, objetivo));
  for (const b of [...fuerzasDe(op), ...reservasDe(op)]) {
    b.operacion = op.id;
    if (adyacentes.has(b.provincia) && op.fuerzas.includes(b.id)) { b.mov = null; continue; }
    if (b.provincia === op.eje) { b.mov = null; continue; }
    const r = calcularRuta(b, op.eje);
    if (r) b.mov = { ruta: r.ruta, recorrido: 0 };
  }
  operaciones.lista.push(op);
  mensaje(`Operación sobre ${datos.provincias[objetivo].nombre}: ${plan.rapida ? 'ataque con plantilla rápida' : `${plan.diasPreparacion} ${plan.diasPreparacion === 1 ? 'día' : 'días'} de preparación`}. Calidad del plan ${op.calidad.total} %.`, 'info', op.pais);
  avisar('cambio');
  return null;
}

function terminar(op, texto, tono = 'info') {
  op.estado = 'terminada';
  for (const b of [...fuerzasDe(op), ...reservasDe(op)]) {
    b.operacion = null;
    b.mov = null;
  }
  const cuerpos = new Set(fuerzasDe(op).map((b) => b.cuerpo));
  for (const c of cuerpos) ganarExperiencia(c);
  mensaje(texto, tono, op.pais);
  avisar('cambio');
}

function pedirDecision(op, resumen) {
  op.estado = 'decision';
  op.decision = resumen;
  for (const c of new Set(fuerzasDe(op).map((b) => b.cuerpo))) ganarExperiencia(c);
  if (op.pais === datos.escenario.pais_jugador && !tiempo.pausado) {
    tiempo.pausado = true;
    tiempo.eventos.dispatchEvent(new Event('estado'));
  }
  avisar('decision', op);
  avisar('cambio');
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

function iniciarFase(op, fase) {
  op.estado = 'fase';
  op.fase = fase;
  op.horasFase = 0;
  op.sumaVentaja = 0;
  op.bajasFase = {
    propias: new Map(fuerzasDe(op).map((b) => [b.id, b.efectivos])),
    enemigas: new Map(enemigosEn(op.pais, objetivoActual(op)).map((b) => [b.id, b.efectivos])),
  };
}


function atacantesEnPosicion(op, objetivo) {
  const ady = new Set(datos.provincias[objetivo].conexiones.filter((c) => datos.duenos[c.j] === op.pais).map((c) => c.j));
  return fuerzasDe(op).filter((b) => !b.mov && ady.has(b.provincia));
}

function cerrarFase(op, extra = {}) {
  const objetivo = objetivoActual(op);
  // Bajas = hombres perdidos por cada brigada que estaba al empezar la fase
  // (una brigada que se rindió o quedó deshecha cuenta entera; una que se retiró, no).
  const perdidos = (mapa) => [...mapa].reduce((s, [id, antes]) => s + Math.max(0, antes - (brigadaPorId(id)?.efectivos ?? 0)), 0);
  const bajasPropias = perdidos(op.bajasFase.propias);
  const bajasEnemigas = perdidos(op.bajasFase.enemigas);
  op.bajas.propias += bajasPropias;
  op.bajas.enemigas += bajasEnemigas;
  return { fase: op.fase, provincia: datos.provincias[objetivo].nombre, bajasPropias: Math.round(bajasPropias), bajasEnemigas: Math.round(bajasEnemigas), ...extra };
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
    if (op.estado === 'terminada' || op.estado === 'decision') continue;
    if (!fuerzasDe(op).length) {
      terminar(op, `La operación sobre ${datos.provincias[objetivoActual(op)].nombre} terminó: no quedan tropas.`, 'malo');
      continue;
    }
    if (op.estado === 'reuniendo') {
      if (fuerzasDe(op).every((b) => !b.mov)) {
        op.estado = 'preparando';
        if (op.horasPreparacion <= 0) iniciarFase(op, 'preparacion');
      }
      continue;
    }
    if (op.estado === 'preparando') {
      op.horasPreparacion--;
      if (op.horasPreparacion % 24 === 0 && !op.detectada) {
        const det = C().deteccion;
        if (Math.random() < det.por_dia + det.por_brigada * op.fuerzas.length) {
          op.detectada = true;
          mensaje(`El enemigo detectó la concentración frente a ${datos.provincias[objetivoActual(op)].nombre}: se pierde la sorpresa.`, 'malo', op.pais);
          reaccionDefensor(op, objetivoActual(op));
        }
      }
      if (op.horasPreparacion <= 0) iniciarFase(op, 'preparacion');
      continue;
    }
    if (op.estado === 'fase') horaDeFase(op);
  }
}

function horaDeFase(op) {
  const c = C();
  const objetivo = objetivoActual(op);
  const defensores = enemigosEn(op.pais, objetivo);
  op.horasFase++;

  if (op.fase === 'preparacion') {
    if (op.artilleria.preparacion || op.postura === 'desgaste') bombardeoHora(op, defensores);
    if (op.horasFase >= c.fases.preparacion.horas) {
      op.reconocido = true;
      pedirDecision(op, cerrarFase(op, {
        resultado: 'preparacion',
        texto: op.artilleria.preparacion || op.postura === 'desgaste'
          ? 'La artillería castigó las posiciones enemigas y bajó su organización y atrincheramiento.'
          : 'Sin bombardeo previo: el enemigo sigue intacto.',
        defensores: defensores.length,
        siguiente: 'ruptura',
      }));
    }
    return;
  }

  if (op.fase === 'ruptura' || op.fase === 'explotacion') {
    const atacantes = op.fase === 'ruptura'
      ? atacantesEnPosicion(op, objetivo)
      : fuerzasDe(op).filter((b) => tipos()[b.tipo].movil && !b.mov && b.provincia === op.ejeExplotacion);
    const ctx = {
      fase: op.fase,
      noche: esDeNoche(objetivo),
      suministro: op.suministro,
      defensaExtra: op.fase === 'explotacion' ? c.fases.explotacion.organizacion_defensor_sorprendido : 1,
    };
    // Una provincia vacía se toma cuando las tropas llegan (medio día de marcha).
    if (!defensores.length && op.fase === 'explotacion' && op.horasFase < c.fases.explotacion.horas_por_provincia / 2) return;
    let r = { fin: defensores.length ? null : 'quebrados' };
    if (!r.fin) r = horaDeCombate(op, atacantes, defensores, objetivo, ctx);
    if (!r.fin) op.sumaVentaja += r.ventaja;
    limpiarDestruidas(op);
    const limite = op.fase === 'ruptura' ? c.fases.ruptura.horas : c.fases.explotacion.horas_por_provincia;
    if (!r.fin && op.horasFase < limite) return;

    const horas = Math.max(1, op.horasFase - (r.fin ? 1 : 0));
    const media = op.sumaVentaja / horas;
    let res = r.fin === 'quebrados' ? 'ruptura' : resultadoPorVentaja(media).clave;
    if (r.fin === 'agotados' && (res === 'avance' || res === 'ruptura')) res = 'estancamiento';
    aplicarResultado(op, res, media, r.fin);
  }
}

function aplicarResultado(op, res, media, fin) {
  const c = C();
  const objetivo = objetivoActual(op);
  const nombre = datos.provincias[objetivo].nombre;
  const defensores = enemigosEn(op.pais, objetivo);
  let texto = c.resultados.find((r) => r.clave === res).texto;
  if (fin === 'quebrados' && !defensores.length) texto = 'La provincia quedó sin defensores.';

  if (res === 'rechazo') {
    for (const b of atacantesEnPosicion(op, objetivo)) {
      b.efectivos *= 1 - c.desgaste.rechazo_bajas_extra;
      b.organizacion = Math.max(0, b.organizacion - 0.2);
    }
  }
  let avanzo = false;
  if (res === 'avance' || res === 'ruptura') {
    if (res === 'ruptura') for (const b of defensores) b.efectivos *= 1 - c.desgaste.ruptura_bajas_extra_defensor;
    // Cerco desde dos o más lados: el defensor no tiene por dónde salir.
    const lados = new Set(atacantesEnPosicion(op, objetivo).map((b) => b.provincia)).size;
    if (op.postura === 'cerco' && lados >= 2 && res === 'ruptura') {
      for (const b of defensores) eliminarBrigada(b, `La ${b.nombre} (${nombrePais(b.pais)}) quedó cercada en ${nombre} y se rindió.`);
    } else {
      retirar(defensores, objetivo, op.pais);
    }
    const quienes = op.fase === 'explotacion'
      ? fuerzasDe(op).filter((b) => tipos()[b.tipo].movil && b.provincia === op.ejeExplotacion)
      : atacantesEnPosicion(op, objetivo).filter((b) => b.organizacion > 0.05);
    for (const b of quienes) { b.provincia = objetivo; b.mov = null; }
    if (datos.duenos[objetivo] !== op.pais) ocupar(objetivo, op.pais);
    avanzo = true;
  }
  limpiarDestruidas(op);
  const resumen = cerrarFase(op, {
    resultado: res,
    ventaja: media,
    texto,
    avanzo,
  });
  op.resultados.push(resumen);

  // Qué sigue
  const quedanObjetivos = op.objetivoActual < op.objetivos.length - 1;
  const moviles = fuerzasDe(op).filter((b) => tipos()[b.tipo].movil).length + reservasDe(op).filter((b) => tipos()[b.tipo].movil).length;
  if (op.fase === 'explotacion') {
    op.avanceExplotacion++;
    op.suministro *= c.fases.explotacion.suministro_por_provincia;
    const maximo = c.fases.explotacion.provincias_maximas + (C().posturas[op.postura].explotacion_extra && op.postura === 'blindado' ? 1 : 0);
    if (avanzo && quedanObjetivos && op.avanceExplotacion < maximo) {
      op.objetivoActual++;
      op.ejeExplotacion = objetivo;
      iniciarFase(op, 'explotacion');
      return;
    }
    terminar(op, `Fin de la explotación en ${nombre}: ${avanzo ? 'se tomaron' : 'se frenó el avance tras tomar'} ${op.objetivoActual + (avanzo ? 1 : 0)} provincia(s).`, avanzo ? 'bueno' : 'info');
    op.decision = { ...resumen, final: true };
    avisar('decision', op);
    return;
  }
  resumen.siguiente = res === 'ruptura' && (moviles || quedanObjetivos) ? 'explotacion'
    : res === 'avance' && quedanObjetivos ? 'ruptura_siguiente'
      : res === 'avance' || (res === 'ruptura' && !quedanObjetivos) ? 'fin'
        : 'ruptura';
  resumen.reacciones = defensores.length || res === 'rechazo' || res === 'estancamiento' ? reaccionDefensor(op, res === 'avance' || res === 'ruptura' ? (op.objetivos[op.objetivoActual + 1] ?? objetivo) : objetivo).length : 0;
  pedirDecision(op, resumen);
}

// Decisión del jugador entre fases: 'seguir', 'reservas' o 'cortar'.
export function decidir(op, eleccion) {
  if (op.estado !== 'decision') return;
  const d = op.decision;
  op.decision = null;
  if (eleccion === 'cortar' || d.siguiente === 'fin') {
    const tomadas = op.resultados.filter((r) => r.avanzo).length;
    terminar(op, eleccion === 'cortar'
      ? `Se cortó la operación sobre ${datos.provincias[op.objetivos[0]].nombre}.`
      : `Operación terminada: ${tomadas} provincia(s) tomada(s).`, tomadas ? 'bueno' : 'info');
    return;
  }
  const objetivo = objetivoActual(op);
  if (eleccion === 'reservas') {
    // Si la ruptura salió bien, las reservas van a la provincia recién tomada.
    const destino = d.siguiente === 'explotacion' || d.siguiente === 'ruptura_siguiente' ? objetivo : op.eje;
    for (const b of reservasDe(op)) {
      op.fuerzas.push(b.id);
      const r = calcularRuta(b, destino);
      if (r && r.ruta.length) b.mov = { ruta: r.ruta, recorrido: 0 };
    }
    op.reservas = [];
    mensaje('Las reservas entran en la operación.', 'info', op.pais);
  }
  if (d.siguiente === 'explotacion') {
    op.ejeExplotacion = objetivo;
    const siguiente = op.objetivos[op.objetivoActual + 1];
    const pegada = siguiente !== undefined && datos.provincias[objetivo].conexiones.some((c) => c.j === siguiente);
    if (pegada) op.objetivoActual++;
    else {
      op.objetivos = op.objetivos.slice(0, op.objetivoActual + 1);
      // Sin más objetivos marcados: los blindados siguen hacia la provincia enemiga vecina más débil.
      const proxima = datos.provincias[objetivo].conexiones
        .filter((c) => datos.duenos[c.j] === op.enemigo)
        .sort((a, b) => enemigosEn(op.pais, a.j).length - enemigosEn(op.pais, b.j).length)[0];
      if (!proxima) { terminar(op, 'No hay más provincias enemigas para explotar.', 'bueno'); return; }
      op.objetivos.push(proxima.j);
      op.objetivoActual++;
    }
    op.avanceExplotacion = 0;
    iniciarFase(op, 'explotacion');
  } else if (d.siguiente === 'ruptura_siguiente') {
    op.eje = objetivo;
    op.objetivoActual++;
    op.calidad = calcularCalidad({ ...op, objetivos: [op.objetivos[op.objetivoActual]] });
    iniciarFase(op, 'ruptura');
  } else {
    iniciarFase(op, 'ruptura');
  }
  if (op.pais === datos.escenario.pais_jugador && tiempo.pausado) {
    tiempo.pausado = false;
    tiempo.eventos.dispatchEvent(new Event('estado'));
  }
  avisar('cambio');
}

export function operacionesActivas(pais) {
  return operaciones.lista.filter((o) => o.pais === pais && o.estado !== 'terminada');
}

export function cuerpoNombre(id) {
  return cuerpoPorId(id)?.nombre ?? '';
}
