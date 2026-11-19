// Aviación (guion: Aviación). Tres usos combinados:
//   1. Defensa: escuadrones en alerta interceptan a los aviones enemigos en su alcance.
//   2. Paquetes de ataque: incursiones a una base, rutas, tropas o un depósito.
//   3. Aviación en las Operaciones: bombardeo en la preparación, apoyo cercano en la
//      ruptura y persecución en la explotación. La superioridad aérea da un bonus.
// El resultado depende del avión, el piloto, la cantidad, la hora y quién detecta primero.

import { datos } from './datos.js';
import { distanciaKm, aLonLat } from './geo.js';
import { ejercito, enGuerra, mensaje, avisar } from './ejercito.js';
import { tiempo, msUtc, posicionSolEn } from './tiempo.js';
import { factorRepuestos, economiaDe } from './economia.js';
import { suministro, danarRutas, recalcularTodo } from './suministro.js';

export const aviacion = {
  escuadrones: [], // {id, pais, modelo, nombre, aviones, pilotos, base, experiencia, disponibilidad, mision, ocupado}
  vuelos: [], // paquetes de ataque en el aire
  pilotos: {}, // país -> {reserva, prisioneros, perdidos}
  siguienteId: 1,
};
const RA = () => datos.reglas.aviacion;
const limitar = (x, a, b) => Math.max(a, Math.min(b, x));
const azar = () => Math.random();

// ------------------------------------------------------------------ modelos

const calculados = new Map();
export const olvidarModelo = (clave) => calculados.delete(clave);
// Modelo con sus valores de juego (aire y ataque) calculados con la fórmula fija.
export function modelo(clave) {
  if (!clave) return null;
  if (calculados.has(clave)) return calculados.get(clave);
  const m = datos.aviones.modelos[clave];
  if (!m) return null;
  const f = RA().formula;
  const aire = (m.velocidad_kmh / f.velocidad_referencia) * f.aire_velocidad + m.maniobra * f.aire_maniobra
    + (m.canones ? f.aire_canones : 0) + (m.misiles_cortos ? f.aire_misiles_cortos : 0) + (m.misiles_largos ? f.aire_misiles_largos : 0);
  const ataque = m.carga_kg / f.carga_referencia + (m.rol === 'ataque_ligero' ? f.bonus_ataque_ligero : 0);
  const r = { ...m, clave, aire, ataque };
  calculados.set(clave, r);
  return r;
}

export const ROLES = { caza: 'Caza', ataque: 'Ataque', bombardero: 'Bombardero', ataque_ligero: 'Ataque ligero' };

// ------------------------------------------------------------------ creación

export function iniciarAviacion() {
  aviacion.escuadrones = [];
  aviacion.vuelos = [];
  aviacion.pilotos = {};
  const fa = datos.escenario.fuerza_aerea ?? {};
  for (const [pais, lista] of Object.entries(fa)) {
    let total = 0;
    lista.forEach((x, k) => {
      const base = datos.bases.find((b) => b.nombre === x.base) ?? basesDe(pais)[0];
      if (!base || !modelo(x.modelo)) return;
      nuevoEscuadron(pais, x.modelo, x.aviones, base.indice, k);
      total += x.aviones;
    });
    aviacion.pilotos[pais] = { reserva: Math.round(total * RA().pilotos.reserva_inicial_por_avion), prisioneros: 0, perdidos: 0 };
  }
  actualizarDisponibilidad();
}

function nuevoEscuadron(pais, claveModelo, aviones, base, k = 0) {
  const numero = aviacion.escuadrones.filter((e) => e.pais === pais).length + 1;
  const e = {
    id: aviacion.siguienteId++,
    pais,
    modelo: claveModelo,
    nombre: `Escuadrón ${numero} · ${modelo(claveModelo).nombre}`,
    aviones,
    pilotos: aviones,
    base,
    experiencia: limitar(RA().pilotos.experiencia_inicial + ((k * 37) % 10) / 50 - 0.1, 0.2, 0.7),
    disponibilidad: modelo(claveModelo).mantenimiento,
    mision: 'alerta', // 'alerta' | 'reposo'
    ocupado: null, // id del vuelo u operación en curso
  };
  aviacion.escuadrones.push(e);
  return e;
}

// Bases aéreas de un país (las que sigue controlando).
export function basesDe(pais) {
  return datos.bases.filter((b) => b.pais === pais && (b.tipo === 'aerea' || b.tipo === 'aeronaval') && datos.duenos[b.provincia] === pais);
}

// Aviones nuevos (contratos): al escuadrón del mismo modelo o a uno nuevo.
export function recibirAviones(pais, claveModelo, n, baseIndice = null) {
  let e = aviacion.escuadrones.find((x) => x.pais === pais && x.modelo === claveModelo && x.aviones < 24);
  if (!e) {
    const base = baseIndice != null ? datos.bases[baseIndice] : basesDe(pais)[0];
    if (!base) return;
    e = nuevoEscuadron(pais, claveModelo, 0, base.indice);
    e.pilotos = 0;
  }
  e.aviones += n;
  // Pilotos de la reserva para los aviones nuevos
  const p = aviacion.pilotos[pais] ?? (aviacion.pilotos[pais] = { reserva: 0, prisioneros: 0, perdidos: 0 });
  const faltan = Math.max(0, e.aviones - e.pilotos);
  const llegan = Math.min(faltan, p.reserva);
  e.pilotos += llegan;
  p.reserva -= llegan;
  // Los pilotos nuevos bajan la experiencia promedio
  if (llegan > 0) e.experiencia = (e.experiencia * (e.pilotos - llegan) + RA().pilotos.experiencia_inicial * 0.8 * llegan) / e.pilotos;
  avisar('aviacion');
}

// ------------------------------------------------------------------ consultas

export const escuadronPorId = (id) => aviacion.escuadrones.find((e) => e.id === id);
export const escuadronesDe = (pais) => aviacion.escuadrones.filter((e) => e.pais === pais);

export function disponibles(e) {
  return Math.floor(Math.min(e.aviones, e.pilotos) * e.disponibilidad);
}

export function distanciaBase(e, j) {
  const b = datos.bases[e.base];
  const c = datos.provincias[j].centroPos;
  return distanciaKm(b.x, b.y, c.x, c.y);
}

export const enAlcance = (e, j) => distanciaBase(e, j) <= modelo(e.modelo).radio_km;

const factorPiloto = (e) => 0.6 + 0.8 * e.experiencia;
export const poderAire = (e, n) => n * modelo(e.modelo).aire * factorPiloto(e);
export const poderAtaque = (e, n) => n * modelo(e.modelo).ataque * factorPiloto(e) * (modelo(e.modelo).rol === 'caza' ? 0.5 : 1);

// Escuadrones enemigos en alerta que llegan a la provincia.
export function interceptores(pais, j) {
  return aviacion.escuadrones.filter((e) => enGuerra(pais, e.pais) && e.mision === 'alerta' && !e.ocupado && disponibles(e) > 0 && enAlcance(e, j));
}

function esDeNoche(j, ms) {
  const c = datos.provincias[j].centroPos;
  const { lon, lat } = aLonLat(c.x, c.y);
  const s = posicionSolEn(ms);
  const r = Math.PI / 180;
  return Math.sin(lat * r) * Math.sin(s.lat * r) + Math.cos(lat * r) * Math.cos(s.lat * r) * Math.cos((lon - s.lon) * r) < -0.05;
}

// ------------------------------------------------------------------ combate aéreo

// Dos grupos se cruzan sobre una provincia. Cada grupo: [{e, n}]. Devuelve las pérdidas.
export function combateAereo(grupoA, grupoD, provincia) {
  const c = RA().combate_aereo;
  const pa = grupoA.reduce((s, x) => s + poderAire(x.e, x.n), 0);
  const pd = grupoD.reduce((s, x) => s + poderAire(x.e, x.n), 0);
  if (pa <= 0 || pd <= 0) return { perdidasA: 0, perdidasD: 0, ventaja: pa > 0 ? 9 : 0, pa, pd };
  const ventaja = Math.sqrt(pa / pd) * (0.8 + azar() * 0.4);
  const perdidasA = repartirPerdidas(grupoA, c.bajas_base / ventaja, provincia);
  const perdidasD = repartirPerdidas(grupoD, c.bajas_base * ventaja, provincia);
  for (const x of [...grupoA, ...grupoD]) x.e.experiencia = Math.min(1, x.e.experiencia + RA().pilotos.experiencia_por_mision);
  return { perdidasA, perdidasD, ventaja, pa, pd };
}

// Baja una fracción de los aviones de cada escuadrón. Los pilotos derribados sobre
// territorio propio se rescatan casi siempre; sobre territorio enemigo, quedan prisioneros.
function repartirPerdidas(grupo, fraccion, provincia) {
  let total = 0;
  for (const x of grupo) {
    const esperado = x.n * Math.min(0.9, fraccion);
    let n = Math.floor(esperado);
    if (azar() < esperado - n) n++;
    n = Math.min(n, x.n);
    if (!n) continue;
    x.n -= n;
    x.e.aviones -= n;
    total += n;
    const propio = provincia >= 0 && datos.duenos[provincia] === x.e.pais;
    const p = aviacion.pilotos[x.e.pais] ?? (aviacion.pilotos[x.e.pais] = { reserva: 0, prisioneros: 0, perdidos: 0 });
    for (let k = 0; k < n; k++) {
      x.e.pilotos--;
      if (propio && azar() < RA().pilotos.rescate_territorio_propio) x.e.pilotos++;
      else if (propio) p.perdidos++;
      else p.prisioneros++;
    }
    x.e.pilotos = Math.max(0, Math.min(x.e.pilotos, x.e.aviones + 4));
  }
  return total;
}

// ------------------------------------------------------------------ aviación en las Operaciones

// Se llama al empezar cada fase. Devuelve el efecto del aire sobre el combate.
export function aireEnFase(op, objetivo, defensores) {
  const ro = RA().operaciones;
  const propios = (op.aviacion ?? []).map(escuadronPorId).filter((e) => e && (!e.ocupado || e.ocupado === `op-${op.id}`) && enAlcance(e, objetivo))
    .map((e) => ({ e, n: disponibles(e) })).filter((x) => x.n > 0);
  const enemigos = interceptores(op.pais, objetivo).map((e) => ({ e, n: disponibles(e) }));
  if (!propios.length && !enemigos.length) return { superioridad: null, multiplicador: 1, ataque: 0, texto: 'Sin aviación de ningún lado.' };
  const antes = propios.reduce((s, x) => s + x.n, 0);
  const antesE = enemigos.reduce((s, x) => s + x.n, 0);
  let combate = null;
  if (propios.length && enemigos.length) combate = combateAereo(propios, enemigos, objetivo);
  const pa = propios.reduce((s, x) => s + poderAire(x.e, x.n), 0);
  const pd = enemigos.reduce((s, x) => s + poderAire(x.e, x.n), 0);
  const superioridad = pa + pd > 0 ? pa / (pa + pd) : 0.5;
  const ataque = propios.reduce((s, x) => s + poderAtaque(x.e, x.n), 0);
  const apoyo = Math.min(ro.apoyo_maximo, (ro.apoyo_por_poder * ataque) / Math.max(1, defensores)) * superioridad;
  const bonus = superioridad >= ro.superioridad_umbral && propios.length ? ro.superioridad_bonus : 0;
  // El defensor también recibe apoyo si domina el aire.
  const ataqueEnemigo = enemigos.reduce((s, x) => s + poderAtaque(x.e, x.n), 0);
  const apoyoEnemigo = Math.min(ro.apoyo_maximo, (ro.apoyo_por_poder * ataqueEnemigo) / 4) * (1 - superioridad);
  for (const x of propios) x.e.experiencia = Math.min(1, x.e.experiencia + RA().pilotos.experiencia_por_mision);
  const texto = [
    `${antes} aviones propios${antesE ? ` contra ${antesE} enemigos` : ''}.`,
    combate ? `Combate aéreo: perdimos ${combate.perdidasA}, derribamos ${combate.perdidasD}.` : '',
    `Superioridad aérea ${Math.round(superioridad * 100)} %.`,
  ].filter(Boolean).join(' ');
  return {
    superioridad,
    multiplicador: 1 + apoyo + bonus,
    multiplicadorDefensa: 1 + apoyoEnemigo,
    ataque: ataque * superioridad,
    revela: superioridad >= ro.superioridad_umbral,
    perdidas: combate?.perdidasA ?? 0,
    derribados: combate?.perdidasD ?? 0,
    texto,
  };
}

// Estimación sin combate, para la predicción del plan.
export function estimarAire(plan, objetivo, defensores) {
  const ro = RA().operaciones;
  const propios = (plan.aviacion ?? []).map(escuadronPorId).filter((e) => e && enAlcance(e, objetivo)).map((e) => ({ e, n: disponibles(e) }));
  const enemigos = interceptores(plan.pais, objetivo).map((e) => ({ e, n: disponibles(e) }));
  const pa = propios.reduce((s, x) => s + poderAire(x.e, x.n), 0);
  const pd = enemigos.reduce((s, x) => s + poderAire(x.e, x.n), 0);
  if (pa + pd <= 0) return { multiplicador: 1, multiplicadorDefensa: 1, superioridad: null };
  const s = pa / (pa + pd);
  const ataque = propios.reduce((acc, x) => acc + poderAtaque(x.e, x.n), 0);
  const ataqueEnemigo = enemigos.reduce((acc, x) => acc + poderAtaque(x.e, x.n), 0);
  return {
    superioridad: s,
    multiplicador: 1 + Math.min(ro.apoyo_maximo, (ro.apoyo_por_poder * ataque) / Math.max(1, defensores)) * s + (s >= ro.superioridad_umbral && propios.length ? ro.superioridad_bonus : 0),
    multiplicadorDefensa: 1 + Math.min(ro.apoyo_maximo, (ro.apoyo_por_poder * ataqueEnemigo) / 4) * (1 - s),
  };
}

// Bombardeo aéreo durante la preparación (una hora).
export function bombardeoAereo(efecto, defensores) {
  if (!efecto?.ataque || !defensores.length) return;
  const ro = RA().operaciones;
  const k = efecto.ataque / defensores.length / 12; // repartido en las horas de la fase
  for (const b of defensores) {
    b.organizacion = Math.max(0, b.organizacion - ro.bombardeo_organizacion * k);
    b.atrincheramiento = Math.max(0, b.atrincheramiento - ro.bombardeo_atrincheramiento * k);
  }
}

// ------------------------------------------------------------------ paquetes de ataque

export const TIPOS_PAQUETE = () => RA().paquetes;
export const HORARIOS = () => RA().horarios;

// Qué se puede atacar en la provincia.
export function blancosEn(pais, j) {
  const out = [];
  if (datos.bases.some((b) => b.provincia === j && enGuerra(pais, datos.duenos[j]) && aviacion.escuadrones.some((e) => e.base === b.indice && e.pais !== pais))) out.push('base');
  if (enGuerra(pais, datos.duenos[j])) out.push('rutas');
  if (ejercito.brigadas.some((b) => b.provincia === j && enGuerra(pais, b.pais))) out.push('tropas');
  if (suministro.depositos.some((d) => d.provincia === j && enGuerra(pais, d.pais))) out.push('deposito');
  return out;
}

export function planPaquete(pais, j) {
  const blancos = blancosEn(pais, j);
  const disponiblesYa = escuadronesDe(pais).filter((e) => !e.ocupado && disponibles(e) > 0 && enAlcance(e, j));
  return {
    pais,
    objetivo: j,
    blanco: blancos[0] ?? 'rutas',
    atacantes: disponiblesYa.filter((e) => modelo(e.modelo).rol !== 'caza').slice(0, 2).map((e) => e.id),
    escoltas: disponiblesYa.filter((e) => modelo(e.modelo).rol === 'caza').slice(0, 1).map((e) => e.id),
    horario: 'amanecer',
    vueloBajo: false,
  };
}

// Horas de juego hasta la próxima vez que es esa hora local en el blanco.
function horasHasta(horaLocal, j) {
  const c = datos.provincias[j].centroPos;
  const lon = aLonLat(c.x, c.y).lon;
  const ahoraUtc = new Date(msUtc()).getUTCHours();
  const ahoraLocal = (ahoraUtc + lon / 15 + 24) % 24;
  return Math.round((horaLocal - ahoraLocal + 24) % 24);
}

export function lanzarPaquete(plan) {
  if (!enGuerra(plan.pais, datos.duenos[plan.objetivo]) && plan.blanco !== 'tropas') return 'Solo se ataca a países con los que estás en guerra.';
  const grupos = [...plan.atacantes.map((id) => ['ataque', id]), ...plan.escoltas.map((id) => ['escolta', id])]
    .map(([rol, id]) => ({ rol, e: escuadronPorId(id) }))
    .filter((x) => x.e && !x.e.ocupado && enAlcance(x.e, plan.objetivo))
    .map((x) => ({ ...x, n: disponibles(x.e) }))
    .filter((x) => x.n > 0);
  if (!grupos.some((g) => g.rol === 'ataque')) return 'Elegí al menos un escuadrón de ataque en alcance y con aviones disponibles.';
  const id = aviacion.siguienteId++;
  const lejos = Math.max(...grupos.map((g) => distanciaBase(g.e, plan.objetivo)));
  const lento = Math.min(...grupos.map((g) => modelo(g.e.modelo).velocidad_kmh * 0.7));
  const horasVuelo = Math.max(1, Math.ceil(lejos / lento));
  const espera = Math.max(0, horasHasta(HORARIOS()[plan.horario].hora, plan.objetivo) - horasVuelo);
  for (const g of grupos) g.e.ocupado = id;
  aviacion.vuelos.push({
    id,
    pais: plan.pais,
    plan: { ...plan },
    grupos,
    salida: tiempo.horas + espera,
    llegada: tiempo.horas + espera + horasVuelo,
    regreso: tiempo.horas + espera + 2 * horasVuelo,
    estado: espera > 0 ? 'esperando' : 'ida',
    resumen: null,
  });
  mensaje(`Paquete de ataque sobre ${datos.provincias[plan.objetivo].nombre}: ${espera ? `despega en ${espera} h, ` : ''}llega en ${espera + horasVuelo} h (${HORARIOS()[plan.horario].nombre.toLowerCase()}).`, 'info', plan.pais);
  avisar('aviacion');
  return null;
}

function resolverPaquete(v) {
  const c = RA().combate_aereo;
  const p = v.plan;
  const j = p.objetivo;
  const noche = esDeNoche(j, msUtc());
  const lineas = [];
  // 1. Detección e intercepción
  const enemigos = interceptores(p.pais, j).map((e) => ({ e, n: disponibles(e) }));
  const contramedidas = Math.min(...v.grupos.map((g) => modelo(g.e.modelo).contramedidas ?? 1));
  const probDeteccion = c.deteccion * (p.vueloBajo ? c.deteccion_vuelo_bajo / c.deteccion : 1) * (noche ? c.deteccion_noche : 1) * contramedidas;
  let perdidasPropias = 0;
  let derribados = 0;
  if (enemigos.length && azar() < probDeteccion) {
    const r = combateAereo(v.grupos, enemigos, j);
    perdidasPropias += r.perdidasA;
    derribados += r.perdidasD;
    lineas.push(`Nos detectaron y salieron a interceptar ${enemigos.reduce((s, x) => s + x.n + 0, 0) + r.perdidasD} aviones: perdimos ${r.perdidasA}, derribamos ${r.perdidasD}.`);
  } else if (enemigos.length) {
    lineas.push('Pasamos sin ser detectados.');
  } else lineas.push('No había cazas enemigos en alerta.');
  // 2. Antiaéreos sobre el blanco
  const tropas = ejercito.brigadas.filter((b) => b.provincia === j && enGuerra(p.pais, b.pais)).length;
  const atacantes = v.grupos.filter((g) => g.rol === 'ataque');
  const blindaje = atacantes.length ? atacantes.reduce((s, g) => s + (modelo(g.e.modelo).blindaje ?? 1), 0) / atacantes.length : 1;
  const fraccionAA = Math.min(0.3, tropas * c.antiaereo_por_brigada * (p.vueloBajo ? c.antiaereo_vuelo_bajo : 1) * blindaje);
  const caidosAA = repartirPerdidas(atacantes, fraccionAA, j);
  perdidasPropias += caidosAA;
  if (caidosAA) lineas.push(`Los antiaéreos derribaron ${caidosAA}.`);
  // 3. Ataque
  let poder = 0;
  for (const g of atacantes) poder += poderAtaque(g.e, g.n) * (noche && !modelo(g.e.modelo).noche ? c.sin_capacidad_nocturna : 1);
  const t = RA().paquetes[p.blanco];
  if (noche && atacantes.some((g) => !modelo(g.e.modelo).noche)) lineas.push('De noche, los aviones sin equipo nocturno apuntan mal.');
  if (p.blanco === 'base') {
    const enBase = aviacion.escuadrones.filter((e) => datos.bases[e.base].provincia === j && e.pais !== p.pais);
    let destruidos = Math.round(poder * t.aviones_destruidos_por_poder);
    const total = destruidos;
    for (const e of enBase) {
      const n = Math.min(e.aviones, destruidos);
      e.aviones -= n;
      e.disponibilidad = Math.max(RA().disponibilidad_minima, e.disponibilidad - 0.2);
      destruidos -= n;
    }
    lineas.push(`Destruimos ${total - destruidos} aviones en tierra y la base queda dañada.`);
  } else if (p.blanco === 'rutas') {
    danarRutas(j, poder * t.dano_por_poder);
    lineas.push(`Rutas y vías cortadas: el suministro que pasa por ${datos.provincias[j].nombre} baja unos días.`);
  } else if (p.blanco === 'tropas') {
    const enemigasAqui = ejercito.brigadas.filter((b) => b.provincia === j && enGuerra(p.pais, b.pais));
    for (const b of enemigasAqui) {
      b.organizacion = Math.max(0, b.organizacion - (t.organizacion_por_poder * poder) / enemigasAqui.length);
      b.efectivos *= 1 - (t.bajas_por_poder * poder) / enemigasAqui.length;
    }
    lineas.push(enemigasAqui.length ? `Atacamos ${enemigasAqui.length} brigada(s): pierden organización y hombres.` : 'No había tropas en la provincia.');
  } else if (p.blanco === 'deposito') {
    const d = suministro.depositos.find((x) => x.provincia === j && enGuerra(p.pais, x.pais));
    if (d) {
      d.fueraDeServicio += Math.max(1, Math.round(poder * t.dias_por_poder));
      recalcularTodo();
      lineas.push(`El depósito queda fuera de servicio ${d.fueraDeServicio} días.`);
    } else lineas.push('No había depósito.');
  }
  v.resumen = {
    titulo: `Incursión sobre ${datos.provincias[j].nombre}`,
    blanco: t.nombre,
    lineas,
    perdidas: perdidasPropias,
    derribados,
  };
  mensaje(`Incursión sobre ${datos.provincias[j].nombre}: perdimos ${perdidasPropias} avión(es), derribamos ${derribados}.`, perdidasPropias > derribados ? 'malo' : 'bueno', p.pais);
  avisar('incursion', v);
}

// ------------------------------------------------------------------ paso del tiempo

export function actualizarHoraAviacion() {
  for (const v of aviacion.vuelos) {
    if (v.estado === 'esperando' && tiempo.horas >= v.salida) v.estado = 'ida';
    if (v.estado === 'ida' && tiempo.horas >= v.llegada) {
      resolverPaquete(v);
      v.estado = 'vuelta';
    }
    if (v.estado === 'vuelta' && tiempo.horas >= v.regreso) {
      v.estado = 'terminado';
      for (const g of v.grupos) if (g.e.ocupado === v.id) g.e.ocupado = null;
    }
  }
  aviacion.vuelos = aviacion.vuelos.filter((v) => v.estado !== 'terminado');
  // Escuadrones sin aviones desaparecen; bases tomadas: se mudan a otra base propia.
  for (const e of [...aviacion.escuadrones]) {
    if (datos.duenos[datos.bases[e.base].provincia] !== e.pais) {
      const otra = basesDe(e.pais)[0];
      if (otra) {
        e.base = otra.indice;
        mensaje(`El ${e.nombre} se mudó a ${otra.nombre}: su base cayó.`, 'malo', e.pais);
      } else {
        aviacion.escuadrones = aviacion.escuadrones.filter((x) => x !== e);
        mensaje(`El ${e.nombre} se perdió: no quedan bases propias.`, 'malo', e.pais);
      }
    }
    if (e.aviones <= 0 && !e.ocupado) aviacion.escuadrones = aviacion.escuadrones.filter((x) => x !== e);
  }
}

export function actualizarDisponibilidad() {
  for (const e of aviacion.escuadrones) {
    e.disponibilidad = Math.max(RA().disponibilidad_minima, modelo(e.modelo).mantenimiento * factorRepuestos(e.pais));
  }
}

export function actualizarDiaAviacion(dia) {
  actualizarDisponibilidad();
  // Escuelas de vuelo: pilotos nuevos cada mes según el tamaño de la economía.
  if (dia % 30 === 0) {
    for (const [pais, p] of Object.entries(aviacion.pilotos)) {
      const e = economiaDe(pais);
      if (e) p.reserva += Math.round((e.pbi / 1000) * RA().pilotos.formados_por_mes_por_cada_1000_millones_de_pbi);
    }
  }
  // Completar pilotos de los escuadrones con la reserva
  for (const e of aviacion.escuadrones) {
    const p = aviacion.pilotos[e.pais];
    if (!p) continue;
    const faltan = Math.max(0, e.aviones - e.pilotos);
    const n = Math.min(faltan, p.reserva);
    e.pilotos += n;
    p.reserva -= n;
  }
}

export function fijarMision(e, mision) {
  e.mision = mision;
  avisar('aviacion');
}

export function cambiarBase(e, baseIndice) {
  const b = datos.bases[baseIndice];
  if (!b || datos.duenos[b.provincia] !== e.pais) return 'Esa base no es tuya.';
  if (e.ocupado) return 'El escuadrón está en una misión.';
  e.base = baseIndice;
  avisar('aviacion');
  return null;
}

export function avionesDe(pais) {
  return escuadronesDe(pais).reduce((s, e) => s + e.aviones, 0);
}

