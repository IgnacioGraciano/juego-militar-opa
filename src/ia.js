// IA (paso 11, primera versión: nivel Medio). Juego razonable que cuesta, sin ser injusto.
// Sigue las mismas reglas que el jugador: no ataca sin justificación.
//   En guerra: reparte tropas en las fronteras amenazadas, arma Operaciones donde tiene
//   ventaja, decide entre fases, usa la aviación y patrulla con sus flotas.
//   Siempre: recluta si tiene mano de obra y equipo, pide equipo por contrato.
//   Paz: acepta o propone según su voluntad nacional.

import { datos } from './datos.js';
import {
  ejercito, enemigosDe, enemigosEn, ordenarMovimiento, reclutar, puedeReclutar, tipos,
} from './ejercito.js';
import { operaciones, planInicial, lanzarOperacion, decidir, ejesPosibles, predecir } from './operaciones.js';
import { economia, economiaDe, firmarContrato } from './economia.js';
import { escuadronesDe, planPaquete, lanzarPaquete, disponibles } from './aviacion.js';
import { voluntad, aceptaPaz, firmarPaz } from './diplomacia.js';
import { marina, flotasDe, ordenarFlota, fijarMisionFlota } from './marina.js';
import { capitalDe, suministroEn, depositosDe, construirDeposito, provinciaApta } from './suministro.js';

export const ia = { nivel: 'medio', ultimoAtaque: {} };

const jugador = () => datos.escenario.pais_jugador;
const paisesIA = () => [...new Set(datos.duenos)].filter((p) => p !== jugador());

// Poder aproximado de un grupo de brigadas (para comparar).
const poder = (lista) => lista.reduce((s, b) => s + (b.efectivos / 4000) * b.organizacion * (tipos()[b.tipo].defensa + tipos()[b.tipo].ataque) / 2, 0);

// ------------------------------------------------------------------ decisiones entre fases

// La IA decide sola cuando una de sus operaciones termina una fase.
export function decidirIA(op) {
  const d = op.decision;
  if (!d) return;
  if (d.final || op.estado === 'terminada') return;
  const fuerzas = op.fuerzas.map((id) => ejercito.brigadas.find((b) => b.id === id)).filter(Boolean);
  const org = fuerzas.length ? fuerzas.reduce((s, b) => s + b.organizacion, 0) / fuerzas.length : 0;
  let eleccion = 'seguir';
  if (d.resultado === 'rechazo' || org < 0.3) eleccion = 'cortar';
  else if (d.resultado === 'estancamiento' && (d.ventaja ?? 1) < 0.95) eleccion = op.reservas.length ? 'reservas' : 'cortar';
  else if (op.reservas.length && d.siguiente === 'explotacion') eleccion = 'reservas';
  decidir(op, eleccion);
}

// ------------------------------------------------------------------ cada día

export function actualizarDiaIA(dia) {
  for (const pais of paisesIA()) {
    const enemigos = enemigosDe(pais);
    if (enemigos.length) {
      defender(pais, enemigos);
      if (dia % 2 === 0) atacar(pais, enemigos);
      if (dia % 3 === 0) atacarDesdeElAire(pais, enemigos);
      flotasEnGuerra(pais, enemigos);
      if (dia % 5 === 0) depositosAlFrente(pais, enemigos);
      considerarPaz(pais, enemigos);
    }
    if (dia % 7 === 0) reclutarYProducir(pais, enemigos.length > 0);
  }
}

// Reparte las brigadas libres en las provincias de frontera según la amenaza.
function defender(pais, enemigos) {
  const libres = ejercito.brigadas.filter((b) => b.pais === pais && !b.formacion && !b.operacion && !b.mov);
  if (!libres.length) return;
  const frontera = datos.provincias.filter((p, i) => datos.duenos[i] === pais && p.conexiones.some((c) => enemigos.includes(datos.duenos[c.j])));
  if (!frontera.length) return;
  const amenaza = frontera.map((p) => {
    const enemigosCerca = p.conexiones.flatMap((c) => ejercito.brigadas.filter((b) => b.provincia === c.j && enemigos.includes(b.pais)));
    const propios = ejercito.brigadas.filter((b) => b.pais === pais && b.provincia === p.indice);
    return { p, deficit: poder(enemigosCerca) * 1.1 - poder(propios) };
  }).filter((x) => x.deficit > 0).sort((a, b) => b.deficit - a.deficit);
  const capital = capitalDe(pais);
  for (const { p, deficit } of amenaza) {
    let falta = deficit;
    // Las más cercanas que no estén ya en una frontera amenazada; una se queda en la capital
    const candidatas = libres.filter((b) => b.provincia !== p.indice && !amenaza.some((x) => x.p.indice === b.provincia))
      .filter((b) => !(b.provincia === capital && libres.filter((x) => x.provincia === capital).length <= 1));
    candidatas.sort((a, b) => distancia(a.provincia, p.indice) - distancia(b.provincia, p.indice));
    for (const b of candidatas) {
      if (falta <= 0) break;
      if (!ordenarMovimiento(b, p.indice)) {
        falta -= poder([b]);
        libres.splice(libres.indexOf(b), 1);
      }
    }
  }
}

function distancia(a, b) {
  const p = datos.provincias[a].centroPos;
  const q = datos.provincias[b].centroPos;
  return Math.hypot(p.x - q.x, p.y - q.y);
}

// Arma una Operación donde tiene buena chance de ganar.
function atacar(pais, enemigos) {
  const activas = operaciones.lista.filter((o) => o.pais === pais && o.estado !== 'terminada').length;
  if (activas >= 2) return;
  // Solo donde le llega el suministro: no se mete en territorio que no puede sostener.
  const umbral = datos.reglas.suministro.umbral_amarillo;
  const candidatos = datos.provincias.filter((p, i) => enemigos.includes(datos.duenos[i]) && ejesPosibles(pais, i).length && suministroEn(pais, i) >= umbral);
  let mejor = null;
  for (const p of candidatos) {
    if (operaciones.lista.some((o) => o.estado !== 'terminada' && o.objetivos.includes(p.indice))) continue;
    const plan = planInicial(pais, p.indice);
    if (!plan.fuerzas.length) continue;
    const atacantes = plan.fuerzas.map((id) => ejercito.brigadas.find((b) => b.id === id));
    const defensores = enemigosEn(pais, p.indice);
    const relacion = poder(atacantes) / Math.max(0.3, poder(defensores));
    // Recupera primero su propio territorio
    const puntaje = relacion * (p.pais === pais ? 1.6 : 1);
    if (!mejor || puntaje > mejor.puntaje) mejor = { plan, puntaje };
  }
  if (!mejor || mejor.puntaje < 1.4) return;
  const plan = mejor.plan;
  plan.diasPreparacion = 2 + Math.floor(Math.random() * 3);
  plan.postura = plan.fuerzas.length > 2 ? 'cerco' : 'frontal';
  const pr = predecir(plan, 30);
  if ((pr.probabilidades.avance ?? 0) + (pr.probabilidades.ruptura ?? 0) < 0.45) return;
  lanzarOperacion(plan);
}

// Ataca concentraciones enemigas cercanas con su aviación de ataque.
function atacarDesdeElAire(pais, enemigos) {
  const libres = escuadronesDe(pais).filter((e) => !e.ocupado && disponibles(e) > 2);
  if (!libres.length || Math.random() > 0.5) return;
  const blancos = datos.provincias.filter((p, i) => enemigos.includes(datos.duenos[i])
    && ejercito.brigadas.filter((b) => b.provincia === i && enemigos.includes(b.pais)).length >= 2);
  for (const p of blancos.slice(0, 1)) {
    const plan = planPaquete(pais, p.indice);
    plan.blanco = 'tropas';
    if (!plan.atacantes.length) continue;
    lanzarPaquete(plan);
  }
}

// Flotas: patrullan; si hay flotas enemigas cerca y la propia es fuerte, van a buscarlas.
function flotasEnGuerra(pais, enemigos) {
  for (const f of flotasDe(pais)) {
    if (f.viaje) continue;
    if (f.mision === 'puerto') fijarMisionFlota(f, 'patrullar');
    const enemigaCerca = marina.flotas.find((g) => enemigos.includes(g.pais) && datos.zonas[f.zona].vecinas.includes(g.zona));
    if (enemigaCerca && Math.random() < 0.3) ordenarFlota(f, enemigaCerca.zona);
  }
}

// Arma depósitos cerca del frente donde el suministro no llega bien.
function depositosAlFrente(pais, enemigos) {
  if (depositosDe(pais).length >= datos.reglas.suministro.depositos_maximos) return;
  const frente = datos.provincias.filter((p, i) => !provinciaApta(pais, i)
    && p.conexiones.some((c) => enemigos.includes(datos.duenos[c.j]))
    && suministroEn(pais, i) < datos.reglas.suministro.umbral_verde);
  frente.sort((a, b) => ejercito.brigadas.filter((x) => x.pais === pais && x.provincia === b.indice).length
    - ejercito.brigadas.filter((x) => x.pais === pais && x.provincia === a.indice).length);
  if (frente[0]) construirDeposito(pais, frente[0].indice);
}

function considerarPaz(pais, enemigos) {
  for (const e of enemigos) {
    if (e === jugador()) {
      // Si está muy mal, le propone la paz al jugador.
      if (voluntad(pais) < 30 && Math.random() < 0.15) {
        ejercito.eventos.dispatchEvent(new CustomEvent('propuesta_paz', { detail: { de: pais, a: e, tipo: voluntad(pais) < 20 ? 'cesion' : 'alto_el_fuego' } }));
      }
    } else if (aceptaPaz(pais, e, 'alto_el_fuego') && aceptaPaz(e, pais, 'alto_el_fuego') && Math.random() < 0.1) {
      firmarPaz(pais, e, 'alto_el_fuego');
    }
  }
}

function reclutarYProducir(pais, enGuerraAhora) {
  const e = economiaDe(pais);
  if (!e) return;
  const capital = capitalDe(pais);
  if (capital >= 0 && !puedeReclutar(pais, 'infanteria', capital) && (enGuerraAhora || Math.random() < 0.15)) reclutar(pais, 'infanteria', capital);
  const enCurso = (p) => e && economiaPendiente(pais, p);
  if (e.equipo < 2 && !enCurso('equipo') && e.fondosMilitares > 30) firmarContrato(pais, { producto: 'equipo', tipo: 'estatal', cantidad: 2 });
  if (e.repuestos < 100 && !enCurso('repuestos') && e.fondosMilitares > 30) firmarContrato(pais, { producto: 'repuestos', tipo: 'estatal', cantidad: 40 });
}

function economiaPendiente(pais, producto) {
  return economia.contratos.some((c) => c.pais === pais && c.producto === producto && c.estado !== 'terminado');
}

