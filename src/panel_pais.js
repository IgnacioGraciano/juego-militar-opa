// Barra superior (datos del país del jugador) y panel de país con pestañas:
// Resumen, Ejército, Aviación, Economía y Suministro. Se abre tocando un país:
// el propio desde la barra, cualquiera desde la ficha de una provincia (o con doble clic).

import { datos, nombrePais } from './datos.js';
import { $, h, miles, dec, pct, plata, chipPais, iconoUnidad, medidor, filasDatos } from './dom.js';
import { svgPictograma } from './simbolos.js';
import {
  ejercito, tipos, enGuerra, enemigosDe, cuerpoPorId, leyDe, horasRestantes, relevarGeneral,
  datoHistorico, anioEscenario, mensaje, avisar,
} from './ejercito.js';
import {
  economia, economiaDe, poblacion, capacidad, cotizar, firmarContrato, cancelarContrato, textoProducto,
  fijarImpuestos, fijarGastoMilitar, invertir, costoInversion, factorRepuestos, consumoRepuestos,
  nombreProveedor, embargo,
} from './economia.js';
import {
  aviacion, escuadronesDe, modelo, disponibles, basesDe, fijarMision, cambiarBase, avionesDe, ROLES,
} from './aviacion.js';
import { suministro, depositosDe, describirDeposito, quitarDeposito, capitalDe, suministroEn, zona, NOMBRE_ZONA } from './suministro.js';

const PESTANAS = [
  ['resumen', 'Resumen'],
  ['ejercito', 'Ejército'],
  ['aviacion', 'Aviación'],
  ['economia', 'Economía'],
  ['suministro', 'Suministro'],
];

let acc = {};
let actual = { pais: null, pestana: 'resumen' };
let pedido = { producto: 'equipo', tipo: 'estatal', cantidad: 2, modelo: null, proveedor: 'USA', base: null };

const jugador = () => datos.escenario.pais_jugador;
const RE = () => datos.reglas.economia;

export function iniciarPanelPais(acciones) {
  acc = acciones;
  $('pais-cerrar').addEventListener('click', cerrarPais);
  const sel = $('pais-elegir');
  const paises = Object.keys(datos.paises).filter((p) => datos.duenos.includes(p));
  sel.replaceChildren(...paises.map((p) => h('option', { value: p }, nombrePais(p))));
  sel.addEventListener('change', () => abrirPais(sel.value, actual.pestana));
  $('pais-pestanas').replaceChildren(...PESTANAS.map(([clave, nombre]) => h('button', {
    type: 'button', role: 'tab', 'data-pestana': clave, onclick: () => abrirPais(actual.pais, clave),
  }, nombre)));
  // Barra superior
  const j = jugador();
  $('pais-jugador').replaceWith(Object.assign(chipPais(j), { id: 'pais-jugador' }));
  $('barra-pais').addEventListener('click', () => abrirPais(j, 'resumen'));
  actualizarBarra();
}

// ------------------------------------------------------------------ barra superior

export function actualizarBarra() {
  const j = jugador();
  const e = economiaDe(j);
  const brigadas = ejercito.brigadas.filter((b) => b.pais === j);
  const indicadores = [
    ['ejercito', 'Mano de obra', miles(ejercito.manoDeObra[j] ?? 0), `${leyDe(j).nombre}`],
    ['ejercito', 'Brigadas', String(brigadas.length), `${miles(brigadas.reduce((s, b) => s + b.efectivos, 0))} hombres`],
    ['aviacion', 'Aviones', String(avionesDe(j)), `${escuadronesDe(j).length} escuadrones`],
    e && ['economia', 'Fondos militares', plata(e.fondosMilitares), `Gasto militar ${dec(e.gastoMilitar * 100, 1)} % del PBI`],
    e && ['economia', 'Divisas', plata(e.divisas), 'Para compras en el exterior'],
    e && ['resumen', 'Estabilidad', `${Math.round(e.estabilidad)} %`, 'Baja con impuestos altos, gasto militar alto, guerra y bajas'],
  ].filter(Boolean);
  $('indicadores').replaceChildren(...indicadores.map(([pestana, nombre, valor, ayuda]) => h('button', {
    type: 'button', class: 'indicador', title: ayuda, onclick: () => abrirPais(j, pestana),
  }, h('span', { class: 'rotulo' }, nombre), h('b', {}, valor))));
  const enemigos = enemigosDe(j);
  $('barra-guerra').hidden = !enemigos.length;
  $('barra-guerra').replaceChildren(h('span', { class: 'rotulo' }, 'En guerra con'), ...enemigos.map((p) => chipPais(p, () => abrirPais(p, 'resumen'))));
}

// ------------------------------------------------------------------ panel

export function abrirPais(pais, pestana = 'resumen') {
  actual = { pais, pestana };
  $('pais').hidden = false;
  $('pais-elegir').value = pais;
  $('pais-titulo').replaceWith(Object.assign(chipPais(pais), { id: 'pais-titulo' }));
  $('pais-sub').textContent = pais === jugador() ? 'Tu país' : enGuerra(jugador(), pais) ? 'En guerra con vos' : 'Otro país';
  for (const b of $('pais-pestanas').children) b.setAttribute('aria-selected', String(b.dataset.pestana === pestana));
  renderPestana();
  acc.alCambiarPanel?.();
}

export function cerrarPais() {
  actual.pais = null;
  $('pais').hidden = true;
  acc.alCambiarPanel?.();
}

export const paisAbierto = () => actual.pais;

// Se llama seguido (cada pocas horas de juego): no rehace la pestaña de Economía
// mientras se edita un contrato, para no perder el foco.
export function refrescarPais() {
  if (!actual.pais) return;
  if (actual.pestana === 'economia' && $('pais-contenido').contains(document.activeElement) && document.activeElement !== document.body) return;
  renderPestana();
}

function renderPestana() {
  const cont = $('pais-contenido');
  const pais = actual.pais;
  const contenido = {
    resumen: pestanaResumen,
    ejercito: pestanaEjercito,
    aviacion: pestanaAviacion,
    economia: pestanaEconomia,
    suministro: pestanaSuministro,
  }[actual.pestana](pais);
  const scroll = cont.scrollTop;
  cont.replaceChildren(...[contenido].flat());
  cont.scrollTop = scroll;
}

const seccion = (titulo, ...hijos) => h('section', {}, h('h3', {}, titulo), ...hijos);
const datosDl = (filas) => h('dl', { class: 'datos' }, ...filasDatos(filas));

// ------------------------------------------------------------------ Resumen

function pestanaResumen(pais) {
  const e = economiaDe(pais);
  const anio = anioEscenario();
  const pob = poblacion(pais);
  const brigadas = ejercito.brigadas.filter((b) => b.pais === pais);
  const rivales = datos.escenario.rivales?.[pais] ?? [];
  const enemigos = enemigosDe(pais);
  const out = [];
  out.push(datosDl([
    pob ? ['Población', `${dec(pob / 1e6, 1)} millones`] : null,
    e ? ['PBI', `${plata(e.pbi)} · ${miles((e.pbi * 1e6) / Math.max(1, pob))} US$ por habitante`] : ['Economía', 'Territorio principal fuera del mapa'],
    e ? ['Crecimiento', `${dec(e.crecimiento * 100, 1)} % por año`] : null,
    e ? ['Estabilidad', h('span', { class: 'con-medidor' }, `${Math.round(e.estabilidad)} %`, medidor(e.estabilidad / 100))] : null,
    e ? ['Gasto militar', `${dec(e.gastoMilitar * 100, 1)} % del PBI (${plata(e.pbi * e.gastoMilitar)} por año)`] : null,
    ['Militares (todas las fuerzas)', datoHistorico(pais, anio, 'militares') ? `${miles(datoHistorico(pais, anio, 'militares') * 1000)}` : 'Sin dato'],
    ['Ejército en el mapa', `${brigadas.length} brigadas, ${miles(brigadas.reduce((s, b) => s + b.efectivos, 0))} hombres`],
    ['Aviación', `${avionesDe(pais)} aviones en ${escuadronesDe(pais).length} escuadrones`],
    ['Reclutamiento', leyDe(pais).nombre],
    rivales.length ? ['Rivales', h('span', { class: 'chips' }, ...rivales.map((r) => chipPais(r, () => abrirPais(r))))] : null,
    enemigos.length ? ['En guerra con', h('span', { class: 'chips' }, ...enemigos.map((r) => chipPais(r, () => abrirPais(r))))] : null,
  ]));
  if (pais !== jugador()) {
    if (!enGuerra(jugador(), pais)) {
      out.push(h('div', { class: 'acciones' },
        h('button', { type: 'button', class: 'boton peligro', onclick: () => { acc.declararGuerra(pais); abrirPais(pais); } }, `Declarar la guerra a ${nombrePais(pais)}`),
        h('p', { class: 'nota' }, 'Para probar el combate. La justificación de guerra llega con la diplomacia (paso 10).')));
    }
  }
  out.push(h('p', { class: 'nota' }, `Población, militares y gasto: Correlates of War (${anio}). PBI de 1978 aproximado, a verificar.`));
  return out;
}

// ------------------------------------------------------------------ Ejército

function estadoBrigada(b) {
  if (b.formacion) return `En formación: ${Math.ceil(b.formacion.horas / 24)} d`;
  if (b.operacion) return 'En operación';
  if (b.mov) return `Marchando (${Math.ceil(horasRestantes(b) / 24)} d)`;
  const z = zona(suministroEn(b.pais, b.provincia));
  return z === 'rojo' ? 'Sin suministro' : z === 'amarillo' ? 'Suministro justo' : 'Lista';
}

function pestanaEjercito(pais) {
  const e = economiaDe(pais);
  const ley = leyDe(pais);
  const propio = pais === jugador();
  const out = [];
  const leyes = datos.reglas.ejercito.reclutamiento;
  out.push(datosDl([
    ['Mano de obra', `${miles(ejercito.manoDeObra[pais] ?? 0)} hombres`],
    ['Ley de reclutamiento', propio
      ? h('select', { 'aria-label': 'Ley de reclutamiento', onchange: (ev) => { datos.escenario.reclutamiento[pais] = ev.target.value; mensaje(`Nueva ley: ${leyes[ev.target.value].nombre.toLowerCase()}.`, 'info', pais); avisar('cambio'); } },
        ...['servicio_militar', 'voluntarios'].map((k) => h('option', { value: k, selected: k === ley.clave }, leyes[k].nombre)))
      : ley.nombre],
    ['Entrenamiento de los nuevos', `${pct(ley.entrenamiento)} · ${ley.dias_formacion} días de formación`],
    e ? ['Equipo para brigadas', `${e.equipo} juego(s) en depósito`] : null,
  ]));
  if (propio) out.push(h('p', { class: 'nota' }, 'Cada brigada nueva usa mano de obra y equipo (infantería y montaña 1 juego, mecanizada 3, blindada 4). El equipo sale de contratos (pestaña Economía).'));
  const cuerpos = ejercito.cuerpos.filter((c) => c.pais === pais);
  for (const c of cuerpos) {
    const lista = ejercito.brigadas.filter((b) => b.cuerpo === c.id);
    if (!lista.length) continue;
    out.push(h('section', { class: 'cuerpo-bloque' },
      h('h3', {}, c.nombre),
      h('div', { class: 'cuerpo' },
        h('span', {}, `${c.general.nombre} `, h('span', { class: 'estrellas', title: `Experiencia ${c.general.experiencia} de 5` }, '★'.repeat(c.general.experiencia) + '☆'.repeat(5 - c.general.experiencia))),
        propio ? h('button', { type: 'button', class: 'mini', onclick: () => { relevarGeneral(c); renderPestana(); } }, 'Relevar') : null),
      h('ul', { class: 'lista-tropas' }, ...lista.map((b) => h('li', {
        class: propio ? 'clicable' : '', onclick: propio ? () => acc.elegirYCentrar(b.id) : null,
      },
      iconoUnidad(b.tipo, b.pais, tipos()[b.tipo].nombre),
      h('div', { class: 'tropa' },
        h('div', { class: 'tropa-nombre' }, b.nombre),
        h('div', { class: 'tropa-datos' }, `${miles(b.efectivos)} h · ${datos.provincias[b.provincia].nombre} · ${estadoBrigada(b)}`),
        h('div', { class: 'barra-org' }, h('i', { style: `width:${Math.round(b.organizacion * 100)}%` }))))))));
  }
  return out;
}

// ------------------------------------------------------------------ Aviación

function pestanaAviacion(pais) {
  const propio = pais === jugador();
  const p = aviacion.pilotos[pais] ?? { reserva: 0, prisioneros: 0 };
  const out = [];
  out.push(datosDl([
    ['Aviones', `${avionesDe(pais)} en ${escuadronesDe(pais).length} escuadrones`],
    ['Pilotos en reserva', `${miles(p.reserva)}${p.prisioneros ? ` · ${p.prisioneros} prisioneros` : ''}`],
    economiaDe(pais) ? ['Repuestos', `${pct(Math.min(1, factorRepuestos(pais)))} de disponibilidad · consumo ${dec(consumoRepuestos(pais), 1)} lotes por día`] : null,
  ]));
  if (propio) {
    out.push(h('div', { class: 'acciones fila' },
      h('button', { type: 'button', class: 'boton principal', onclick: () => acc.elegirBlancoAereo() }, 'Armar un paquete de ataque…')));
    out.push(h('p', { class: 'nota' }, 'En alerta, el escuadrón intercepta a los aviones enemigos que entran en su alcance. En las Operaciones, la aviación se asigna desde el plan.'));
  }
  const bases = basesDe(pais);
  out.push(h('ul', { class: 'lista-tropas' }, ...escuadronesDe(pais).map((e) => {
    const m = modelo(e.modelo);
    const libres = disponibles(e);
    return h('li', { onmouseenter: () => acc.mostrarAlcance?.(e), onmouseleave: () => acc.mostrarAlcance?.(null) },
      iconoUnidad('avion', e.pais, m.nombre),
      h('div', { class: 'tropa' },
        h('div', { class: 'tropa-nombre' }, e.nombre),
        h('div', { class: 'tropa-datos' }, `${ROLES[m.rol]} · ${miles(m.velocidad_kmh)} km/h · radio ${miles(m.radio_km)} km · aire ${dec(m.aire)} · ataque ${dec(m.ataque)}`),
        h('div', { class: 'tropa-datos' }, `${e.aviones} aviones, ${libres} listos hoy · pilotos ${pct(e.experiencia)} de experiencia${e.ocupado ? ' · en misión' : ''}`),
        propio ? h('div', { class: 'fila-controles' },
          h('select', { 'aria-label': `Misión de ${e.nombre}`, onchange: (ev) => { fijarMision(e, ev.target.value); } },
            h('option', { value: 'alerta', selected: e.mision === 'alerta' }, 'En alerta'),
            h('option', { value: 'reposo', selected: e.mision === 'reposo' }, 'En reposo')),
          h('select', { 'aria-label': `Base de ${e.nombre}`, onchange: (ev) => { const err = cambiarBase(e, Number(ev.target.value)); if (err) mensaje(err, 'malo', pais); renderPestana(); } },
            ...bases.map((b) => h('option', { value: b.indice, selected: b.indice === e.base }, b.nombre))),
          h('button', { type: 'button', class: 'mini', onclick: () => acc.mostrarAlcance?.(e, true) }, 'Ver alcance'))
          : h('div', { class: 'tropa-datos' }, `Base: ${datos.bases[e.base].nombre}`)));
  })));
  if (!escuadronesDe(pais).length) out.push(h('p', { class: 'nota' }, 'Sin aviones de combate.'));
  out.push(h('p', { class: 'nota' }, 'Aire = velocidad, maniobra, cañones y misiles; ataque = carga. La misma fórmula para todos los aviones (data/reglas/aviacion.json). Inventarios de 1978 aproximados, a verificar.'));
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
  out.push(datosDl([
    ['PBI', `${plata(e.pbi)} · ${e.crecimiento >= 0 ? '+' : ''}${dec(e.crecimiento * 100, 1)} % por año`],
    ['Fondos militares', plata(e.fondosMilitares)],
    ['Tesoro del Estado', e.tesoro < 0 ? h('span', { class: 'malo' }, `${plata(e.tesoro)} (deuda: baja la estabilidad)`) : plata(e.tesoro)],
    ['Divisas', plata(e.divisas)],
  ]));
  if (propio) {
    out.push(seccion('Presupuesto',
      control('Impuestos', e.impuestos, pp.impuestos_min, pp.impuestos_max, 0.01, (v) => { fijarImpuestos(pais, v); renderPestana(); }, 'Más impuestos: más plata en el tesoro, menos estabilidad.'),
      control('Gasto militar', e.gastoMilitar, pp.gasto_militar_min, pp.gasto_militar_max, 0.005, (v) => { fijarGastoMilitar(pais, v); renderPestana(); }, 'Más gasto: más fondos para contratos, menos crecimiento y estabilidad.')));
  } else {
    out.push(datosDl([['Impuestos', pct(e.impuestos)], ['Gasto militar', `${dec(e.gastoMilitar * 100, 1)} % del PBI`]]));
  }

  // Sectores
  const costo = costoInversion(pais);
  out.push(seccion('Industria',
    h('ul', { class: 'sectores' }, ...Object.entries(RE().sectores).map(([clave, s]) => {
      const inv = e.inversiones.find((i) => i.sector === clave);
      return h('li', {},
        h('div', { class: 'sector-cabeza' }, h('b', {}, s.nombre), h('span', {}, `Nivel ${e.sectores[clave]}`)),
        medidor(e.sectores[clave] / 10),
        h('small', {}, s.texto),
        propio ? (inv
          ? h('small', { class: 'tenue' }, `Inversión en marcha: ${Math.ceil(inv.dias / 30)} meses`)
          : h('button', { type: 'button', class: 'mini', disabled: e.sectores[clave] >= 10, title: 'Sube un nivel en 2 años',
            onclick: () => { const err = invertir(pais, clave); if (err) mensaje(err, 'malo', pais); renderPestana(); } }, `Invertir ${plata(costo)}`)) : null);
    }))));

  // Depósito de equipo y repuestos
  const consumo = consumoRepuestos(pais);
  out.push(seccion('Depósito',
    datosDl([
      ['Equipo para brigadas', `${e.equipo} juego(s) · producción estatal ${dec(capacidad(pais, 'equipo') * 30, 1)} por mes`],
      ['Repuestos', `${miles(e.repuestos)} lotes · alcanzan ${consumo > 0 ? miles(e.repuestos / consumo) : '∞'} días`],
    ])));

  // Contratos
  const contratos = economia.contratos.filter((c) => c.pais === pais && c.estado !== 'terminado');
  out.push(seccion('Contratos',
    contratos.length ? h('ul', { class: 'contratos' }, ...contratos.map((c) => h('li', {},
      h('div', { class: 'sector-cabeza' }, h('b', {}, `${textoProducto(c)} × ${c.cantidad}`), h('span', {}, `${c.entregados} entregados`)),
      medidor(c.entregados / c.cantidad),
      h('small', {}, `${RE().contratos[c.tipo].nombre}${c.tipo === 'extranjera' ? ` · ${nombreProveedor(c.proveedor)}` : ''} · ${plata(c.costoUnitario)} c/u${c.estado === 'suspendido' ? ` · SUSPENDIDO: ${c.motivo}` : ''}`),
      propio ? h('button', { type: 'button', class: 'mini', onclick: () => { cancelarContrato(c); renderPestana(); } }, 'Cancelar') : null)))
      : h('p', { class: 'nota' }, 'Sin contratos en curso.'),
    propio ? formularioContrato(pais) : null));
  return out;
}

function formularioContrato(pais) {
  const opciones = [
    ['equipo', null, RE().productos.equipo.nombre],
    ['repuestos', null, RE().productos.repuestos.nombre],
    ...Object.keys(datos.aviones.modelos).map((k) => ['avion', k, `Avión: ${modelo(k).nombre} (${nombreProveedor(modelo(k).origen)})`]),
  ];
  const clave = (p, m) => `${p}|${m ?? ''}`;
  const extranjeros = pedido.producto === 'avion' ? [modelo(pedido.modelo)?.origen] : RE().productos[pedido.producto].origen_extranjero;
  if (pedido.producto !== 'avion' && !extranjeros.includes(pedido.proveedor)) pedido.proveedor = extranjeros[0];
  const q = cotizar(pais, pedido);
  const caja = h('div', { class: 'formulario' });
  const rehacer = () => caja.replaceWith(formularioContrato(pais));
  caja.append(
    h('h4', {}, 'Nuevo contrato'),
    h('label', {}, 'Producto', h('select', { onchange: (ev) => { const [p, m] = ev.target.value.split('|'); pedido.producto = p; pedido.modelo = m || null; rehacer(); } },
      ...opciones.map(([p, m, t]) => h('option', { value: clave(p, m), selected: clave(p, m) === clave(pedido.producto, pedido.modelo) }, t)))),
    h('div', { class: 'opciones' }, ...['estatal', 'extranjera'].map((t) => h('label', { class: 'postura' },
      h('input', { type: 'radio', name: 'tipo-contrato', value: t, checked: pedido.tipo === t, onchange: () => { pedido.tipo = t; rehacer(); } }),
      h('span', {}, h('b', {}, RE().contratos[t].nombre), h('small', {}, RE().contratos[t].texto))))),
    pedido.tipo === 'extranjera' && pedido.producto !== 'avion'
      ? h('label', {}, 'Proveedor', h('select', { onchange: (ev) => { pedido.proveedor = ev.target.value; rehacer(); } },
        ...extranjeros.map((p) => h('option', { value: p, selected: p === pedido.proveedor }, `${nombreProveedor(p)}${embargo(p, pais) ? ' (embargo)' : ''}`))))
      : null,
    h('label', {}, 'Cantidad', h('input', { type: 'number', min: 1, max: 200, value: pedido.cantidad, onchange: (ev) => { pedido.cantidad = Math.max(1, Number(ev.target.value) || 1); rehacer(); } })),
    pedido.producto === 'avion' ? h('label', {}, 'Base de destino', h('select', { onchange: (ev) => { pedido.base = Number(ev.target.value); } },
      ...basesDe(pais).map((b) => h('option', { value: b.indice, selected: b.indice === pedido.base }, b.nombre)))) : null,
    q.error
      ? h('p', { class: 'malo' }, q.error)
      : h('p', { class: 'cotizacion' }, `${plata(q.costo)}${pedido.tipo === 'extranjera' ? ' (en divisas)' : ''} · unos ${q.dias} días`),
    h('button', { type: 'button', class: 'boton principal', disabled: !!q.error || (pedido.producto === 'avion' && !pedido.modelo), onclick: () => {
      if (pedido.producto === 'avion' && pedido.base == null) pedido.base = basesDe(pais)[0]?.indice ?? null;
      const err = firmarContrato(pais, pedido);
      if (err) mensaje(err, 'malo', pais);
      renderPestana();
    } }, 'Firmar contrato'),
  );
  if (pedido.producto === 'avion' && !pedido.modelo) pedido.modelo = Object.keys(datos.aviones.modelos)[0];
  return caja;
}

// ------------------------------------------------------------------ Suministro

function pestanaSuministro(pais) {
  const propio = pais === jugador();
  const capital = capitalDe(pais);
  const deps = depositosDe(pais);
  const out = [];
  out.push(h('p', { class: 'nota' }, 'El suministro sale de la capital y llega a cada depósito por tus provincias (por tren rinde mucho más). Cada depósito cubre un radio: verde bien, amarillo justo, rojo cortado. Fuera de la zona verde las tropas se desgastan.'));
  out.push(datosDl([
    ['Depósito central', capital >= 0 ? datos.provincias[capital].nombre : 'Sin capital: no llega suministro'],
    ['Depósitos', `${deps.length} de ${datos.reglas.suministro.depositos_maximos}`],
  ]));
  out.push(h('ul', { class: 'lista-tropas' }, ...deps.map((d) => h('li', {},
    h('span', { class: 'simbolo' }, svgPictograma('deposito')),
    h('div', { class: 'tropa' },
      h('div', { class: 'tropa-nombre' }, datos.provincias[d.provincia].nombre),
      h('div', { class: 'tropa-datos' }, describirDeposito(d))),
    propio ? h('button', { type: 'button', class: 'mini', onclick: () => { quitarDeposito(d.id); renderPestana(); } }, 'Quitar') : null))));
  if (propio) {
    out.push(h('div', { class: 'acciones fila' },
      h('button', { type: 'button', class: 'boton', onclick: () => acc.fijarVista('suministro') }, 'Ver el mapa de suministro')));
    out.push(h('p', { class: 'nota' }, 'Para armar un depósito, tocá una provincia tuya con tren o puerto y usá el botón de su ficha.'));
    const tropas = ejercito.brigadas.filter((b) => b.pais === pais);
    const conteo = { verde: 0, amarillo: 0, rojo: 0 };
    for (const b of tropas) conteo[zona(suministroEn(pais, b.provincia))]++;
    out.push(datosDl(Object.entries(conteo).map(([z, n]) => [NOMBRE_ZONA[z], `${n} brigada(s)`])));
  }
  return out;
}


