// Barra superior (datos del país del jugador) y panel de país con pestañas.
// Se abre tocando un país: el propio desde la barra, cualquiera desde la ficha de una
// provincia, con doble clic en el mapa o con la lista del panel.

import { datos, nombrePais } from './datos.js';
import { $, h, miles, dec, plata, chipPais, medidor, filasDatos, conGlobo } from './dom.js';
import { svgPictograma } from './simbolos.js';
import { ejercito, tipos, enGuerra, enemigosDe, leyDe, datoHistorico, anioEscenario, mensaje } from './ejercito.js';
import {
  economia, economiaDe, poblacion, capacidad, fijarImpuestos, fijarGastoMilitar, invertir, costoInversion, consumoRepuestos,
} from './economia.js';
import { escuadronesDe, modelo, disponibles, avionesDe, ROLES } from './aviacion.js';
import { depositosDe, describirDeposito, quitarDeposito, capitalDe, suministroEn, zona } from './suministro.js';
import { flotasDe, barcosDe } from './marina.js';
import {
  diplomacia, relacion, voluntad, justificacion, tieneJustificacion, diasJustificacion, fabricarJustificacion,
  declararGuerra, puedeDeclarar, proponerPaz, reclamosDe, estadoNodo, empezarNodo, puntajeGuerra,
  acuerdosDe, aliadosDe, tieneAcuerdo, rechazoAcuerdo, proponerAcuerdo, romperAcuerdo, mejorarRelaciones, mejorandoCon,
  enviarAyuda, denunciarOnu, diasParaDenunciar,
} from './diplomacia.js';
import { pestanaEjercito, configurarEjercito, fijarVistaEjercito } from './panel_ejercito.js';

const PESTANAS = [
  ['resumen', 'Resumen'],
  ['diplomacia', 'Diplomacia'],
  ['ejercito', 'Ejército'],
  ['economia', 'Economía'],
  ['suministro', 'Suministro'],
];
// Nombres viejos de pestañas que ahora viven dentro de otras.
const ALIAS = { aviacion: ['ejercito', 'fuerzas'], marina: ['ejercito', 'fuerzas'], diseno: ['ejercito', 'diseno'], pedidos: ['ejercito', 'pedidos'], decisiones: ['resumen'] };

let acc = {};
let actual = { pais: null, pestana: 'resumen' };
let nodoElegido = null; // decisión del árbol nacional que se muestra en detalle

const jugador = () => datos.escenario.pais_jugador;
const RE = () => datos.reglas.economia;

export function iniciarPanelPais(acciones) {
  acc = acciones;
  configurarEjercito(acciones, () => renderPestana());
  $('pais-cerrar').addEventListener('click', cerrarPais);
  const sel = $('pais-elegir');
  const paises = Object.keys(datos.paises).filter((p) => datos.duenos.includes(p));
  sel.replaceChildren(...paises.map((p) => h('option', { value: p }, nombrePais(p))));
  sel.addEventListener('change', () => abrirPais(sel.value, actual.pestana));
  const j = jugador();
  $('pais-jugador').replaceWith(Object.assign(chipPais(j), { id: 'pais-jugador' }));
  $('barra-pais').addEventListener('click', () => (actual.pais === j ? cerrarPais() : abrirPais(j, 'resumen')));
  actualizarBarra();
}

// ------------------------------------------------------------------ barra superior

const ICONO_GENTE = 'M8 3.5a3.2 3.2 0 1 1 0 6.4 3.2 3.2 0 0 1 0-6.4zM1.5 21v-3.2c0-3.3 3-5.6 6.5-5.6s6.5 2.3 6.5 5.6V21zM16.8 4.8a2.7 2.7 0 1 1 0 5.4 2.7 2.7 0 0 1 0-5.4zM16 12.4c3.6-.5 6.5 1.6 6.5 4.8V21h-6.2v-3.2c0-2-.1-3.8-.3-5.4z';

function iconoSvg(d) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', d);
  svg.append(p);
  return svg;
}

const cuenta = (lista, clave) => lista.reduce((m, x) => m.set(clave(x), (m.get(clave(x)) ?? 0) + (x.n ?? 1)), new Map());

// Detalle de cada indicador (globo al pasar el mouse).
const DETALLE = {
  mano: (j) => {
    const ley = leyDe(j);
    const pob = (datoHistorico(j, anioEscenario(), 'poblacion') ?? 1000) * 1000;
    return { titulo: 'Mano de obra', filas: [['Disponible', miles(ejercito.manoDeObra[j] ?? 0)], ['Ley', ley.nombre], ['Entran por día', miles((pob * ley.por_anio) / 365)]],
      nota: 'Hombres para reclutar brigadas nuevas y reponer bajas.' };
  },
  brigadas: (j) => {
    const bs = ejercito.brigadas.filter((b) => b.pais === j);
    const porTipo = cuenta(bs, (b) => b.tipo);
    return { titulo: 'Ejército de tierra', filas: [
      ...Object.entries(tipos()).map(([k, t]) => porTipo.get(k) ? [t.nombre, String(porTipo.get(k))] : null),
      ['Hombres', miles(bs.reduce((s, b) => s + b.efectivos, 0))],
      bs.some((b) => b.formacion) ? ['En formación', String(bs.filter((b) => b.formacion).length)] : null,
      bs.some((b) => b.operacion) ? ['En operaciones', String(bs.filter((b) => b.operacion).length)] : null,
    ] };
  },
  aviones: (j) => {
    const es = escuadronesDe(j);
    const porRol = cuenta(es.map((e) => ({ rol: modelo(e.modelo).rol, n: e.aviones })), (x) => x.rol);
    return { titulo: 'Fuerza aérea', filas: [
      ...[...porRol].map(([rol, n]) => [ROLES[rol] ?? rol, String(n)]),
      ['Escuadrones', String(es.length)],
      ['Listos para volar', String(es.reduce((s, e) => s + disponibles(e), 0))],
    ] };
  },
  barcos: (j) => {
    const fs = flotasDe(j);
    const porClase = new Map();
    for (const f of fs) for (const [k, n] of Object.entries(f.barcos)) if (n) porClase.set(k, (porClase.get(k) ?? 0) + n);
    return { titulo: 'Marina', filas: [...[...porClase].map(([k, n]) => [datos.barcos.clases[k]?.nombre ?? k, String(n)]), ['Flotas', String(fs.length)]] };
  },
};

export function actualizarBarra() {
  const j = jugador();
  const e = economiaDe(j);
  const brigadas = ejercito.brigadas.filter((b) => b.pais === j);
  // [pestaña, ícono o rótulo, valor, detalle, alerta]
  const indicadores = [
    ['ejercito', iconoSvg(ICONO_GENTE), miles(ejercito.manoDeObra[j] ?? 0), DETALLE.mano],
    ['ejercito', svgPictograma('infanteria'), String(brigadas.length), DETALLE.brigadas],
    ['ejercito', svgPictograma('avion'), String(avionesDe(j)), DETALLE.aviones],
    ['ejercito', svgPictograma('barco'), String(barcosDe(j)), DETALLE.barcos],
    e && ['economia', 'Fondos', plata(e.fondosMilitares), () => ({ titulo: 'Fondos militares', filas: [['Disponibles', plata(e.fondosMilitares)], ['Gasto militar', `${dec(e.gastoMilitar * 100, 1)} % del PBI`]], nota: 'Pagan contratos, inversiones y reconversiones.' })],
    e && ['resumen', 'Estabilidad', `${Math.round(e.estabilidad)} %`, () => ({ titulo: 'Estabilidad', nota: 'Baja con impuestos altos, gasto militar alto, guerra y bajas.' }), e.estabilidad < 35],
    ['diplomacia', 'Tensión', `${Math.round(diplomacia.tension)} %`, () => ({ titulo: 'Tensión mundial', nota: 'Sube con justificaciones y guerras. Muy alta, trae mediaciones.' }), diplomacia.tension > 60],
  ].filter(Boolean);
  $('indicadores').replaceChildren(...indicadores.map(([pestana, rotulo, valor, detalle, alerta]) => {
    const icono = typeof rotulo !== 'string';
    return conGlobo(h('button', {
      type: 'button', class: `indicador${icono ? ' con-icono' : ''}${alerta ? ' alerta' : ''}`, 'aria-label': icono ? detalle(j).titulo : null,
      onclick: () => abrirPais(j, pestana),
    }, icono ? rotulo : h('span', { class: 'rotulo' }, rotulo), h('b', {}, valor)), () => detalle(j));
  }));
  const enemigos = enemigosDe(j);
  $('barra-guerra').hidden = !enemigos.length;
  $('barra-guerra').replaceChildren(h('span', { class: 'rotulo' }, 'En guerra'), ...enemigos.map((p) => chipPais(p, () => abrirPais(p, 'resumen'))));
}

// ------------------------------------------------------------------ panel

export function abrirPais(pais, pestana = 'resumen') {
  const propio = pais === jugador();
  if (ALIAS[pestana]) {
    if (propio) fijarVistaEjercito(ALIAS[pestana][1]);
    pestana = ALIAS[pestana][0];
  }
  if (!PESTANAS.some(([k]) => k === pestana)) pestana = 'resumen';
  actual = { pais, pestana };
  $('pais').hidden = false;
  $('pais-elegir').value = pais;
  $('pais-franja').style.setProperty('--pais', datos.paises[pais]?.color ?? '#888');
  $('pais-titulo').replaceWith(Object.assign(chipPais(pais), { id: 'pais-titulo' }));
  $('pais-sub').textContent = propio ? 'Tu país' : enGuerra(jugador(), pais) ? 'En guerra con vos' : 'Otro país';
  $('pais-pestanas').replaceChildren(...PESTANAS.filter(([, , soloPropio]) => propio || !soloPropio).map(([clave, nombre]) => h('button', {
    type: 'button', role: 'tab', 'data-pestana': clave, 'aria-selected': String(clave === pestana), onclick: () => abrirPais(actual.pais, clave),
  }, nombre)));
  renderPestana();
  acc.alCambiarPanel?.();
}

export function cerrarPais() {
  actual.pais = null;
  $('pais').hidden = true;
  acc.alCambiarPanel?.();
}

export const paisAbierto = () => actual.pais;

// Se llama seguido (cada pocas horas de juego). No rehace la pestaña mientras se escribe en ella.
export function refrescarPais() {
  if (!actual.pais) return;
  const activo = document.activeElement;
  if ($('pais-contenido').contains(activo) && activo.matches('input, select, textarea')) return;
  renderPestana();
}

function renderPestana() {
  const cont = $('pais-contenido');
  const pais = actual.pais;
  const contenido = {
    resumen: pestanaResumen, diplomacia: pestanaDiplomacia, ejercito: pestanaEjercito,
    economia: pestanaEconomia, suministro: pestanaSuministro,
  }[actual.pestana](pais);
  const scroll = cont.scrollTop;
  cont.replaceChildren(...[contenido].flat().filter(Boolean));
  cont.scrollTop = scroll;
}

const seccion = (titulo, ...hijos) => h('section', {}, h('h3', {}, titulo), ...hijos);
const datosDl = (filas) => h('dl', { class: 'datos' }, ...filasDatos(filas));
const tarjeta = (rotulo, valor, sub = '', extra = null) => h('div', { class: 'tarjeta' }, h('span', { class: 'rotulo' }, rotulo), h('b', { title: typeof valor === 'string' ? valor : null }, valor), sub ? h('small', { title: sub }, sub) : null, extra);
const tarjetas = (lista, tres = false) => h('div', { class: `tarjetas${tres ? ' tres' : ''}` }, ...lista.filter(Boolean));
const repintar = () => renderPestana();

// ------------------------------------------------------------------ Resumen

function pestanaResumen(pais) {
  const e = economiaDe(pais);
  const anio = anioEscenario();
  const pob = poblacion(pais);
  const brigadas = ejercito.brigadas.filter((b) => b.pais === pais);
  const rivales = datos.escenario.rivales?.[pais] ?? [];
  const enemigos = enemigosDe(pais);
  const out = [];
  out.push(tarjetas([
    tarjeta('Población', pob ? `${dec(pob / 1e6, 1)} M` : '—', 'habitantes'),
    e ? tarjeta('PBI', plata(e.pbi), `${miles((e.pbi * 1e6) / Math.max(1, pob))} US$ por habitante`) : tarjeta('Economía', 'Fuera del mapa', 'no se simula'),
    e ? tarjeta('Estabilidad', `${Math.round(e.estabilidad)} %`, '', medidor(e.estabilidad / 100, e.estabilidad < 35 ? 'mal' : '')) : null,
    tarjeta('Voluntad nacional', `${Math.round(voluntad(pais))} %`, enemigos.length ? 'Si se quiebra, busca la paz' : '', medidor(voluntad(pais) / 100, voluntad(pais) < 30 ? 'mal' : 'bien')),
    tarjeta('Ejército', `${brigadas.length} brigadas`, `${miles(brigadas.reduce((s, b) => s + b.efectivos, 0))} hombres`),
    tarjeta('Aviación', `${avionesDe(pais)} aviones`, `${escuadronesDe(pais).length} escuadrones`),
    tarjeta('Marina', `${barcosDe(pais)} barcos`, `${flotasDe(pais).length} flotas`),
    e ? tarjeta('Gasto militar', `${dec(e.gastoMilitar * 100, 1)} %`, `del PBI · ${plata(e.pbi * e.gastoMilitar)} por año`) : null,
  ]));
  const filas = [
    ['Militares en total', datoHistorico(pais, anio, 'militares') ? `${miles(datoHistorico(pais, anio, 'militares') * 1000)} (todas las fuerzas)` : 'Sin dato'],
    ['Reclutamiento', leyDe(pais).nombre],
    rivales.length ? ['Rivales', h('span', { class: 'chips' }, ...rivales.map((r) => chipPais(r, () => abrirPais(r))))] : null,
    enemigos.length ? ['En guerra con', h('span', { class: 'chips' }, ...enemigos.map((r) => chipPais(r, () => abrirPais(r))))] : null,
    pais !== jugador() ? ['Relación con vos', `${relacion(pais, jugador()) > 0 ? '+' : ''}${Math.round(relacion(pais, jugador()))}`] : null,
  ];
  out.push(seccion('Situación', datosDl(filas)));
  if (datos.arbol?.pais === pais && pais === jugador()) out.push(decisiones(pais));
  out.push(h('p', { class: 'nota' }, `Población, militares y gasto: Correlates of War (${anio}). PBI de 1978 aproximado, a verificar.`));
  return out;
}

// ------------------------------------------------------------------ Economía

function control(nombre, valor, min, max, paso, alCambiar, ayuda) {
  const salida = h('b', {}, `${dec(valor * 100, 1)} %`);
  const entrada = h('input', {
    type: 'range', min, max, step: paso, value: valor, 'aria-label': nombre,
    oninput: (ev) => { salida.textContent = `${dec(Number(ev.target.value) * 100, 1)} %`; },
    onchange: (ev) => alCambiar(Number(ev.target.value)),
  });
  return h('div', { class: 'control' }, h('div', { class: 'control-cabeza' }, h('span', {}, nombre), salida), entrada, h('small', {}, ayuda));
}

function pestanaEconomia(pais) {
  const e = economiaDe(pais);
  if (!e) return [h('p', { class: 'nota' }, `El territorio principal de ${nombrePais(pais)} está fuera del mapa: su economía no se simula.`)];
  const propio = pais === jugador();
  const pp = RE().presupuesto;
  const out = [];
  out.push(tarjetas([
    tarjeta('PBI', plata(e.pbi), `${e.crecimiento >= 0 ? '+' : ''}${dec(e.crecimiento * 100, 1)} % por año`),
    tarjeta('Fondos militares', plata(e.fondosMilitares), 'para contratos'),
    tarjeta('Tesoro', plata(e.tesoro), e.tesoro < 0 ? 'Deuda: baja la estabilidad' : 'para invertir'),
    tarjeta('Divisas', plata(e.divisas), 'para compras afuera'),
  ]));
  if (propio) {
    out.push(seccion('Presupuesto',
      control('Impuestos', e.impuestos, pp.impuestos_min, pp.impuestos_max, 0.01, (v) => { fijarImpuestos(pais, v); repintar(); }, 'Más impuestos: más plata en el tesoro, menos estabilidad.'),
      control('Gasto militar', e.gastoMilitar, pp.gasto_militar_min, pp.gasto_militar_max, 0.005, (v) => { fijarGastoMilitar(pais, v); repintar(); }, 'Más gasto: más fondos para contratos, menos crecimiento y estabilidad.')));
  }
  const costo = costoInversion(pais);
  out.push(seccion('Industria', h('ul', { class: 'sectores' }, ...Object.entries(RE().sectores).map(([clave, s]) => {
    const inv = e.inversiones.find((i) => i.sector === clave);
    return h('li', {},
      h('div', { class: 'sector-cabeza' }, h('b', {}, s.nombre), h('span', {}, `Nivel ${e.sectores[clave]} de 10`)),
      medidor(e.sectores[clave] / 10),
      h('small', {}, s.texto),
      propio ? (inv
        ? h('small', { class: 'tenue' }, `Inversión en marcha: ${Math.ceil(inv.dias / 30)} meses`)
        : h('button', { type: 'button', class: 'mini', disabled: e.sectores[clave] >= 10, title: 'Sube un nivel en 2 años', onclick: () => { const err = invertir(pais, clave); if (err) mensaje(err, 'malo', pais, 'aviso'); repintar(); } }, `Invertir ${plata(costo)}`)) : null);
  }))));
  const consumo = consumoRepuestos(pais);
  out.push(seccion('Depósito', tarjetas([
    tarjeta('Equipo', `${e.equipo} juegos`, `estatal: ${dec(capacidad(pais, 'equipo') * 30, 1)} por mes`),
    tarjeta('Repuestos', `${miles(e.repuestos)} lotes`, `alcanzan ${consumo > 0 ? miles(e.repuestos / consumo) : '∞'} días`),
  ])));
  const contratos = economia.contratos.filter((c) => c.pais === pais && c.estado !== 'terminado');
  out.push(seccion('Pedidos de material',
    h('p', { class: 'nota' }, contratos.length ? `${contratos.length} pedido(s) en curso.` : 'Sin pedidos en curso.'),
    propio ? h('div', { class: 'acciones fila' }, h('button', { type: 'button', class: 'boton', onclick: () => abrirPais(pais, 'pedidos') }, 'Producir y comprar…')) : null));
  return out;
}

// ------------------------------------------------------------------ Suministro

function pestanaSuministro(pais) {
  const propio = pais === jugador();
  const capital = capitalDe(pais);
  const deps = depositosDe(pais);
  const out = [];
  const conteo = { verde: 0, amarillo: 0, rojo: 0 };
  for (const b of ejercito.brigadas.filter((x) => x.pais === pais)) conteo[zona(suministroEn(pais, b.provincia))]++;
  out.push(tarjetas([
    tarjeta('Depósitos', `${deps.length} de ${datos.reglas.suministro.depositos_maximos}`, capital >= 0 ? `central: ${datos.provincias[capital].nombre}` : 'sin capital'),
    tarjeta('Bien abastecidas', String(conteo.verde), 'brigadas en zona verde'),
    tarjeta('Justas', String(conteo.amarillo), 'brigadas en zona amarilla'),
    tarjeta('Sin suministro', String(conteo.rojo), 'brigadas en zona roja'),
  ]));
  out.push(h('p', { class: 'nota' }, 'El suministro sale de la capital y llega a cada depósito por tus provincias (por tren rinde mucho más, por mar si controlás la zona). Cada depósito cubre un radio. Fuera de la zona verde, en guerra, las tropas se desgastan.'));
  out.push(h('ul', { class: 'lista-tropas' }, ...deps.map((d) => h('li', {},
    h('span', { class: 'simbolo' }, svgPictograma('deposito')),
    h('div', { class: 'tropa' }, h('div', { class: 'tropa-nombre' }, datos.provincias[d.provincia].nombre), h('div', { class: 'tropa-datos' }, describirDeposito(d))),
    propio ? h('button', { type: 'button', class: 'mini', onclick: () => { quitarDeposito(d.id); repintar(); } }, 'Quitar') : null))));
  if (propio) {
    out.push(h('div', { class: 'acciones fila' }, h('button', { type: 'button', class: 'boton', onclick: () => acc.fijarVista('suministro') }, 'Ver el mapa de suministro')));
    out.push(h('p', { class: 'nota' }, 'Para armar un depósito, tocá una provincia tuya con tren o puerto y usá el botón de su ficha.'));
  }
  return out;
}


// ------------------------------------------------------------------ Decisiones (árbol nacional, en el Resumen)

// Texto de los efectos de una decisión.
function textoEfectos(ef = {}) {
  const t = [];
  const signo = (v) => `${v > 0 ? '+' : ''}${v}`;
  if (ef.justificacion) t.push(`Justificación de guerra contra ${nombrePais(ef.justificacion)}`);
  for (const [p, d] of Object.entries(ef.relacion ?? {})) t.push(`Relación con ${nombrePais(p)} ${signo(d)}`);
  if (ef.tension) t.push(`Tensión mundial ${signo(ef.tension)}`);
  if (ef.voluntad) t.push(`Voluntad nacional ${signo(ef.voluntad)}`);
  if (ef.estabilidad) t.push(`Estabilidad ${signo(ef.estabilidad)}`);
  if (ef.entrenamiento) t.push(`Entrenamiento de todas las brigadas +${Math.round(ef.entrenamiento * 100)} %`);
  if (ef.equipo) t.push(`${signo(ef.equipo)} juegos de equipo`);
  if (ef.divisas) t.push(`Divisas ${ef.divisas > 0 ? '+' : '−'}${plata(Math.abs(ef.divisas))}`);
  if (ef.mano_de_obra) t.push(`Mano de obra +${miles(ef.mano_de_obra)}`);
  if (ef.puntos_diseno) t.push(`+${ef.puntos_diseno} puntos de diseño`);
  if (ef.aviones) t.push(`Llegan ${ef.aviones.cantidad} ${modelo(ef.aviones.modelo).nombre}`);
  if (ef.tanque) t.push(`Tanque nuevo: ${datos.tanques.modelos[ef.tanque]?.nombre ?? ef.tanque}`);
  for (const [k, d] of Object.entries(ef.sector ?? {})) t.push(`${datos.reglas.economia.sectores[k]?.nombre ?? k} ${signo(d)} nivel`);
  if (ef.fin_reclamo) t.push(`Se cierra el reclamo con ${nombrePais(ef.fin_reclamo)}`);
  return t;
}

// Profundidad de cada decisión dentro de su rama (las que piden otra van a la derecha).
function disposicion(nodos) {
  const porId = new Map(nodos.map((n) => [n.id, n]));
  const prof = new Map();
  const profundidad = (n) => {
    if (prof.has(n.id)) return prof.get(n.id);
    const padres = (n.requiere ?? []).map((id) => porId.get(id)).filter(Boolean);
    const p = padres.length ? 1 + Math.max(...padres.map(profundidad)) : 0;
    prof.set(n.id, p);
    return p;
  };
  nodos.forEach(profundidad);
  // Filas: cada raíz y debajo sus hijos, en orden.
  const fila = new Map();
  let siguiente = 0;
  const colocar = (n, desde) => {
    if (fila.has(n.id)) return;
    fila.set(n.id, Math.max(desde, siguiente));
    if (fila.get(n.id) >= siguiente) siguiente = fila.get(n.id) + 1;
    const hijos = nodos.filter((x) => (x.requiere ?? []).includes(n.id) && x.requiere.filter((r) => porId.has(r)).at(-1) === n.id);
    hijos.forEach((x, k) => colocar(x, k === 0 ? fila.get(n.id) : siguiente));
  };
  nodos.filter((n) => prof.get(n.id) === 0).forEach((n) => colocar(n, siguiente));
  nodos.forEach((n) => colocar(n, siguiente));
  return { prof, fila, filas: siguiente, columnas: Math.max(...prof.values()) + 1 };
}

function decisiones(pais) {
  const arbol = datos.arbol;
  const enCurso = diplomacia.arbol.enCurso;
  const ESTADO = { hecho: 'Hecha', curso: 'En curso', disponible: 'Disponible', bloqueado: 'Cerrada' };
  if (!nodoElegido || !arbol.nodos.some((n) => n.id === nodoElegido)) {
    nodoElegido = (Object.values(enCurso)[0]?.id) ?? arbol.nodos.find((n) => estadoNodo(n) === 'disponible')?.id ?? arbol.nodos[0].id;
  }
  const ramas = Object.entries(arbol.ramas).map(([rama, nombre]) => {
    const nodos = arbol.nodos.filter((n) => n.rama === rama);
    const d = disposicion(nodos);
    const GX0 = 30;
    const disponible = Math.min(400, ($('pais-contenido').clientWidth || 420) - 30);
    const W = Math.floor((disponible - GX0 * (d.columnas - 1)) / d.columnas);
    const H = 54;
    const GX = GX0;
    const GY = 8;
    const ancho = d.columnas * W + (d.columnas - 1) * GX;
    const alto = d.filas * H + (d.filas - 1) * GY;
    const pos = (n) => ({ x: d.prof.get(n.id) * (W + GX), y: d.fila.get(n.id) * (H + GY) });
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'arbol-lineas');
    svg.setAttribute('width', ancho);
    svg.setAttribute('height', alto);
    for (const n of nodos) {
      for (const r of n.requiere ?? []) {
        const padre = nodos.find((x) => x.id === r);
        if (!padre) continue;
        const a = pos(padre);
        const b = pos(n);
        const x1 = a.x + W;
        const y1 = a.y + H / 2;
        const x2 = b.x;
        const y2 = b.y + H / 2;
        const path = document.createElementNS(ns, 'path');
        path.setAttribute('d', `M${x1} ${y1} C${x1 + GX / 2} ${y1} ${x2 - GX / 2} ${y2} ${x2} ${y2}`);
        path.setAttribute('class', estadoNodo(padre) === 'hecho' ? 'hecha' : '');
        svg.append(path);
      }
    }
    const fichas = nodos.map((n) => {
      const est = estadoNodo(n);
      const p = pos(n);
      const curso = enCurso[rama]?.id === n.id ? enCurso[rama] : null;
      return h('button', {
        type: 'button', class: `nodo-ficha ${est}${nodoElegido === n.id ? ' elegido' : ''}`, 'data-nodo': n.id,
        style: `left:${p.x}px;top:${p.y}px;width:${W}px;height:${H}px`,
        onclick: () => { nodoElegido = n.id; renderPestana(); },
      },
      h('b', {}, n.nombre),
      h('small', {}, curso ? `${Math.ceil(curso.horas / 24)} días` : est === 'disponible' ? `${n.dias} días` : ESTADO[est]),
      curso ? h('i', { class: 'nodo-avance', style: `width:${Math.round((1 - curso.horas / curso.total) * 100)}%` }) : null);
    });
    return h('div', { class: 'rama' },
      h('div', { class: 'rama-cabeza' }, h('span', { class: 'rotulo' }, nombre),
        enCurso[rama] ? h('small', { class: 'tenue' }, `En curso: ${arbol.nodos.find((x) => x.id === enCurso[rama].id).nombre}`) : h('small', { class: 'tenue' }, 'Libre: podés empezar una')),
      h('div', { class: 'arbol-lienzo', style: `width:${ancho}px;height:${alto}px` }, svg, ...fichas));
  });
  // Detalle de la decisión elegida
  const n = arbol.nodos.find((x) => x.id === nodoElegido);
  const est = estadoNodo(n);
  const curso = enCurso[n.rama]?.id === n.id ? enCurso[n.rama] : null;
  const ocupada = enCurso[n.rama] && !curso;
  const nombreDe = (id) => arbol.nodos.find((x) => x.id === id)?.nombre ?? id;
  const detalle = h('div', { class: 'nodo-detalle' },
    h('div', { class: 'nodo-detalle-cabeza' }, h('b', {}, n.nombre), h('span', { class: `etiqueta ${est}` }, ESTADO[est])),
    h('p', {}, n.texto),
    h('ul', { class: 'efectos' }, ...textoEfectos(n.efectos).map((t) => h('li', {}, t))),
    n.requiere?.length ? h('small', { class: 'tenue' }, `Pide antes: ${n.requiere.map(nombreDe).join(' y ')}`) : null,
    n.excluye?.length ? h('small', { class: 'tenue' }, `Cierra: ${n.excluye.map(nombreDe).join(', ')}`) : null,
    curso ? h('div', {}, medidor(1 - curso.horas / curso.total), h('small', { class: 'tenue' }, `Faltan ${Math.ceil(curso.horas / 24)} días`)) : null,
    est === 'disponible' ? h('button', {
      type: 'button', class: 'boton principal', disabled: !!ocupada, title: ocupada ? 'Ya hay una decisión en curso en esta rama' : '',
      onclick: () => { const e = empezarNodo(n.id); if (e) mensaje(e, 'malo', pais, 'aviso'); renderPestana(); },
    }, ocupada ? 'Hay otra en curso en esta rama' : `Empezar · ${n.dias} días`) : null);
  return h('section', {}, h('h3', {}, 'Decisiones nacionales'),
    h('p', { class: 'nota' }, 'Una decisión por rama a la vez. Tocá una para ver qué hace.'),
    ...ramas, detalle);
}

// ------------------------------------------------------------------ Diplomacia

const TONO_RELACION = (v) => (v <= -50 ? 'Hostil' : v <= -15 ? 'Fría' : v < 15 ? 'Neutral' : v < 50 ? 'Cordial' : 'Amistosa');

function barraRelacion(v) {
  const ancho = Math.abs(v) / 2;
  return h('span', { class: 'barra-rel' }, h('i', { style: `left:${v >= 0 ? 50 : 50 - ancho}%;width:${ancho}%;background:${v >= 0 ? 'var(--bien)' : 'var(--peligro)'}` }));
}

function filaRelacion(a, b) {
  const v = relacion(a, b);
  const acuerdos = acuerdosDe(a).filter((x) => x.a === b || x.b === b);
  return h('li', { class: 'clicable', onclick: () => abrirPais(b, 'diplomacia') },
    chipPais(b), barraRelacion(v), h('b', {}, `${v > 0 ? '+' : ''}${Math.round(v)}`),
    acuerdos.length || enGuerra(a, b) ? h('span', { class: 'rel-marcas' },
      enGuerra(a, b) ? h('span', { class: 'etiqueta guerra' }, 'En guerra') : null,
      ...acuerdos.map((x) => h('span', { class: 'etiqueta' }, NOMBRE_CORTO[x.tipo]))) : null);
}
const NOMBRE_CORTO = { comercio: 'Comercio', no_agresion: 'No agresión', alianza: 'Alianza' };

function pestanaDiplomacia(pais) {
  const j = jugador();
  const out = [];
  if (pais === j) {
    out.push(tarjetas([
      tarjeta('Tensión mundial', `${Math.round(diplomacia.tension)} %`, 'Muy alta, trae mediaciones', medidor(diplomacia.tension / 100, diplomacia.tension > 60 ? 'mal' : '')),
      tarjeta('Voluntad nacional', `${Math.round(voluntad(pais))} %`, 'Si se quiebra, hay que pedir la paz', medidor(voluntad(pais) / 100, voluntad(pais) < 30 ? 'mal' : 'bien')),
    ]));
    const misiones = diplomacia.mejorando.filter((m) => m.de === pais);
    if (misiones.length) out.push(seccion('Misiones diplomáticas', datosDl(misiones.map((m) => [nombrePais(m.con), `mejorando relaciones · ${Math.ceil(m.horas / 24)} días`]))));
    const otros = [...new Set(datos.duenos)].filter((p) => p !== pais).sort((a, b) => relacion(pais, b) - relacion(pais, a));
    out.push(seccion('Relaciones', h('p', { class: 'nota' }, 'Tocá un país para ver qué podés hacer con él.'), h('ul', { class: 'relaciones' }, ...otros.map((o) => filaRelacion(pais, o)))));
  } else {
    out.push(...diplomaciaCon(pais));
  }
  const reclamos = reclamosDe(pais).filter((r) => pais === j || r.de === j || r.a === j || r.de === pais);
  if (reclamos.length) out.push(seccion('Reclamos territoriales', datosDl(reclamos.map((r) => [r.nombre, `${nombrePais(r.de)} se lo reclama a ${nombrePais(r.a)}`]))));
  const just = diplomacia.justificaciones.filter((x) => x.de === pais || x.contra === pais);
  if (just.length) out.push(seccion('Justificaciones de guerra', datosDl(just.map((x) => [`${nombrePais(x.de)} → ${nombrePais(x.contra)}`, x.lista ? 'Lista' : `Faltan ${Math.ceil(x.horas / 24)} días`]))));
  return out;
}

// Acción diplomática en forma de tarjeta.
function accion({ titulo, texto, estado, boton, hacer, error, tono = '', activo = false }) {
  return h('div', { class: `accion ${tono}${activo ? ' activa' : ''}` },
    h('div', { class: 'accion-texto' }, h('b', {}, titulo), h('small', {}, texto), estado ? h('small', { class: activo ? 'bien' : 'tenue' }, estado) : null,
      error ? h('small', { class: 'malo' }, error) : null),
    boton ? h('button', { type: 'button', class: `mini${tono === 'peligro' ? ' peligro' : ''}`, disabled: !!error, onclick: hacer }, boton) : null);
}

function diplomaciaCon(pais) {
  const j = jugador();
  const r = datos.reglas.diplomacia.acciones;
  const hacer = (f) => () => { const e = f(); if (e) mensaje(e, 'malo', j, 'aviso'); renderPestana(); actualizarBarra(); acc.alCambiarPanel?.(); };
  const v = relacion(j, pais);
  const out = [];
  out.push(h('div', { class: 'relacion-grande' },
    h('div', {}, h('span', { class: 'rotulo' }, 'Relación con vos'), h('b', {}, `${v > 0 ? '+' : ''}${Math.round(v)}`), h('small', {}, TONO_RELACION(v))),
    barraRelacion(v)));
  const lista = [];
  if (enGuerra(j, pais)) {
    const puntaje = puntajeGuerra(j, pais);
    out.push(datosDl([['Marcha de la guerra', puntaje > 0 ? 'A tu favor' : puntaje < 0 ? 'En contra' : 'Pareja'], ['Su voluntad', `${Math.round(voluntad(pais))} %`]]));
    lista.push(accion({ titulo: 'Proponer alto el fuego', texto: 'Cada uno se queda con lo que tiene. Lo aceptan si su voluntad está baja o si van ganando.', boton: 'Proponer', hacer: hacer(() => proponerPaz(j, pais, 'alto_el_fuego')) }));
    lista.push(accion({ titulo: 'Exigir lo ocupado', texto: 'Las provincias que ocupaste pasan a ser tuyas. Solo si están quebrados.', boton: 'Exigir', hacer: hacer(() => proponerPaz(j, pais, 'cesion')) }));
  } else {
    const mision = mejorandoCon(j, pais);
    lista.push(accion({
      titulo: r.mejorar.nombre, texto: `Una misión diplomática: +${dec(r.mejorar.por_dia * 30, 1)} por mes durante ${Math.round(r.mejorar.dias / 30)} meses. Hasta ${r.mejorar.simultaneas} a la vez.`,
      estado: mision ? `En curso: faltan ${Math.ceil(mision.horas / 24)} días` : null, activo: !!mision,
      boton: mision ? 'Retirar' : 'Enviar', hacer: hacer(() => mejorarRelaciones(j, pais)),
    }));
    for (const tipo of ['comercio', 'no_agresion', 'alianza']) {
      const vigente = tieneAcuerdo(j, pais, tipo);
      const textos = {
        comercio: `+${dec(r.comercio.divisas_por_dia * 30, 1)} M de divisas por mes para cada uno y mejora la relación.`,
        no_agresion: 'Ninguno puede justificar ni declarar una guerra contra el otro.',
        alianza: 'Si atacan a uno, el otro entra en la guerra. Pide una relación muy buena.',
      };
      lista.push(accion({
        titulo: r[tipo].nombre, texto: textos[tipo], activo: vigente,
        estado: vigente ? 'Vigente' : rechazoAcuerdo(pais, j, tipo) ? null : `${nombrePais(pais)} lo aceptaría`,
        error: vigente ? null : rechazoAcuerdo(pais, j, tipo),
        boton: vigente ? 'Romper' : 'Proponer', tono: vigente && tipo !== 'comercio' ? 'peligro' : '',
        hacer: hacer(() => (vigente ? romperAcuerdo(j, pais, tipo) : proponerAcuerdo(j, pais, tipo))),
      }));
    }
    lista.push(accion({
      titulo: r.ayuda.nombre, texto: `Le mandás ${r.ayuda.equipo} juegos de equipo por ${plata(r.ayuda.fondos)} de tus fondos militares. Relación +${r.ayuda.relacion}.`,
      error: (economiaDe(j)?.fondosMilitares ?? 0) < r.ayuda.fondos ? 'No alcanzan los fondos militares.' : null,
      boton: 'Mandar', hacer: hacer(() => enviarAyuda(j, pais)),
    }));
  }
  const espera = diasParaDenunciar(j);
  lista.push(accion({
    titulo: r.onu.nombre, texto: `Lo aisla: relación con vos ${r.onu.relacion}, con los demás ${r.onu.relacion_terceros}${enemigosDe(pais).length ? `, y baja su voluntad ${r.onu.voluntad_enemiga}` : ''}. Sube la tensión mundial.`,
    error: espera ? `Podés volver a denunciar en ${espera} días.` : null, boton: 'Denunciar', hacer: hacer(() => denunciarOnu(j, pais)),
  }));
  if (!enGuerra(j, pais)) {
    const just = justificacion(j, pais);
    const reclamos = diplomacia.reclamos.filter((x) => x.de === j && x.a === pais);
    if (tieneJustificacion(j, pais)) {
      lista.push(accion({
        titulo: 'Declarar la guerra', texto: `Tenés justificación contra ${nombrePais(pais)}. Sube la tensión mundial y empeora la relación con todos.${aliadosDe(pais).length ? ` Sus aliados (${aliadosDe(pais).map(nombrePais).join(', ')}) entrarían en la guerra.` : ''}`,
        error: puedeDeclarar(j, pais), tono: 'peligro', boton: 'Declarar', hacer: hacer(() => { const e = declararGuerra(j, pais); if (!e) acc.declaro?.(pais); return e; }),
      }));
    } else {
      lista.push(accion({
        titulo: 'Justificar una guerra', texto: `Fabricar un motivo para declararle la guerra: ${diasJustificacion(j, pais)} días${reclamos.length ? ` (más rápido por el reclamo de ${reclamos.map((x) => x.nombre).join(', ')})` : ''}. Sube la tensión.`,
        estado: just ? `Faltan ${Math.ceil(just.horas / 24)} días` : null, activo: !!just, tono: 'peligro',
        error: just ? null : (tieneAcuerdo(j, pais, 'no_agresion') || tieneAcuerdo(j, pais, 'alianza') ? 'Hay un acuerdo que lo impide: primero rompelo.' : null),
        boton: just ? null : 'Empezar', hacer: hacer(() => fabricarJustificacion(j, pais)),
      }));
    }
  }
  out.push(seccion('Acciones', h('div', { class: 'acciones-dipl' }, ...lista)));
  const enemigos = enemigosDe(pais);
  out.push(seccion('Situación', datosDl([
    ['Su voluntad', `${Math.round(voluntad(pais))} %`],
    enemigos.length ? ['En guerra con', h('span', { class: 'chips' }, ...enemigos.map((x) => chipPais(x, () => abrirPais(x, 'diplomacia'))))] : null,
    aliadosDe(pais).length ? ['Aliados', h('span', { class: 'chips' }, ...aliadosDe(pais).map((x) => chipPais(x, () => abrirPais(x, 'diplomacia'))))] : null,
  ])));
  return out;
}
