// Economía (guion: Economía, industria y mercado). Se controla en forma superficial,
// pero condiciona la guerra: equipo para las brigadas, aviones, repuestos.
//
//   PBI, impuestos y gasto militar -> fondos militares y tesoro del Estado.
//   4 sectores (siderurgia, metalmecánica, aeronáutica, astilleros) con nivel 0-10.
//   Contratos: estatales (baratos, limitados por la industria) o compra extranjera
//   (rápida, cara, en divisas y con riesgo de embargo).
//   Repuestos: los consumen aviones y blindados; sin repuestos baja la disponibilidad.
// Dinero en millones de dólares de 1978.

import { datos, nombrePais } from './datos.js';
import { ejercito, enGuerra, enemigosDe, mensaje, avisar, datoHistorico, anioEscenario } from './ejercito.js';
import { fechaLocal } from './tiempo.js';
import { aviacion, modelo, recibirAviones } from './aviacion.js';

export const economia = { paises: {}, contratos: [], siguienteId: 1 };
const RE = () => datos.reglas.economia;
const limitar = (x, a, b) => Math.max(a, Math.min(b, x));

export const economiaDe = (pais) => economia.paises[pais] ?? null;

export function iniciarEconomia() {
  economia.paises = {};
  economia.contratos = [];
  const anio = anioEscenario();
  const pp = RE().presupuesto;
  for (const pais of new Set(datos.duenos)) {
    const dato = datos.escenario.economia?.[pais];
    // Sin datos del escenario (países con el territorio principal fuera del mapa): no se simula.
    if (!dato) continue;
    const gasto = (datoHistorico(pais, anio, 'gasto') ?? 0) / 1000; // miles -> millones
    const acero = datoHistorico(pais, anio, 'acero') ?? 0;
    const sectores = {
      siderurgia: dato.sectores?.siderurgia ?? limitar(Math.round(Math.log10(acero + 1) * 1.6), 0, 10),
      metalmecanica: dato.sectores?.metalmecanica ?? 1,
      aeronautica: dato.sectores?.aeronautica ?? 0,
      astilleros: dato.sectores?.astilleros ?? 0,
    };
    const gastoMilitar = limitar(gasto / dato.pbi || 0.02, pp.gasto_militar_min, pp.gasto_militar_max);
    economia.paises[pais] = {
      pais,
      pbi: dato.pbi,
      pbiInicial: dato.pbi,
      crecimiento: pp.crecimiento_base,
      impuestos: dato.impuestos,
      gastoMilitar,
      divisas: dato.divisas,
      estabilidad: dato.estabilidad,
      fondosMilitares: dato.pbi * gastoMilitar * 0.1,
      tesoro: 0,
      sectores,
      inversiones: [], // {sector, dias}
      equipo: dato.equipo ?? 0,
      repuestos: dato.repuestos ?? 0,
      bajas: 0,
    };
  }
}

// ------------------------------------------------------------------ consultas

export function poblacion(pais) {
  return (datoHistorico(pais, anioEscenario(), 'poblacion') ?? 0) * 1000;
}

// Capacidad de producción estatal por día.
export function capacidad(pais, producto, claveModelo = null) {
  const e = economiaDe(pais);
  if (!e) return 0;
  if (producto === 'avion') {
    const m = modelo(claveModelo);
    if (!m?.fabricable_en?.includes(pais)) return 0;
    return e.sectores.aeronautica * RE().aviones_por_nivel_por_dia;
  }
  const p = RE().productos[producto];
  const nivel = p.sectores.reduce((s, k) => s + e.sectores[k], 0) / p.sectores.length;
  return nivel * p.por_nivel_por_dia;
}

export function costoUnitario(producto, claveModelo, tipo) {
  const base = producto === 'avion' ? modelo(claveModelo).costo : RE().productos[producto].costo;
  return base * RE().contratos[tipo].costo;
}

export function embargo(proveedor, pais) {
  if (enGuerra(pais, proveedor)) return `${nombreProveedor(proveedor)} no le vende a un país con el que está en guerra.`;
  const hoy = fechaLocal().toISOString().slice(0, 10);
  const e = RE().embargos.find((x) => x.proveedor === proveedor && x.pais === pais && x.desde <= hoy);
  return e ? `Embargo de ${nombreProveedor(proveedor)}: ${e.nombre}.` : null;
}

export const nombreProveedor = (p) => datos.aviones.proveedores[p] ?? nombrePais(p);

// Cuánto cubren los repuestos (0 a 1,1): con buena cobertura los aviones vuelan más.
export function factorRepuestos(pais) {
  const e = economiaDe(pais);
  if (!e) return 0.9;
  const r = RE().repuestos;
  const consumo = consumoRepuestos(pais);
  if (consumo <= 0) return 1;
  const dias = e.repuestos / consumo;
  const t = limitar(dias / r.dias_cobertura_ideal, 0, 1);
  return r.disponibilidad_sin_repuestos + (1.05 - r.disponibilidad_sin_repuestos) * Math.sqrt(t);
}

export function consumoRepuestos(pais) {
  const r = RE().repuestos;
  const aviones = aviacion.escuadrones.filter((x) => x.pais === pais).reduce((s, x) => s + x.aviones, 0);
  const mecanizadas = ejercito.brigadas.filter((b) => b.pais === pais && (b.tipo === 'mecanizada' || b.tipo === 'blindada')).length;
  return aviones * r.consumo_por_avion_por_dia + mecanizadas * r.consumo_por_brigada_mecanizada_por_dia;
}

export function equipoPorTipo(tipo) {
  return RE().equipo_por_tipo[tipo] ?? 1;
}

// ------------------------------------------------------------------ controles del jugador

export function fijarImpuestos(pais, v) {
  const e = economiaDe(pais);
  const pp = RE().presupuesto;
  if (e) e.impuestos = limitar(v, pp.impuestos_min, pp.impuestos_max);
  avisar('economia');
}

export function fijarGastoMilitar(pais, v) {
  const e = economiaDe(pais);
  const pp = RE().presupuesto;
  if (e) e.gastoMilitar = limitar(v, pp.gasto_militar_min, pp.gasto_militar_max);
  avisar('economia');
}

export function costoInversion(pais) {
  const e = economiaDe(pais);
  return e ? Math.round(e.pbi * RE().inversion.parte_del_pbi) : 0;
}

export function invertir(pais, sector) {
  const e = economiaDe(pais);
  if (!e) return 'Sin economía.';
  if (e.sectores[sector] >= 10) return 'El sector ya está al máximo.';
  if (e.inversiones.some((i) => i.sector === sector)) return 'Ya hay una inversión en marcha en ese sector.';
  const costo = costoInversion(pais);
  if (e.tesoro < costo) return `Hacen falta ${costo} millones en el tesoro; hay ${Math.round(e.tesoro)}.`;
  e.tesoro -= costo;
  e.inversiones.push({ sector, dias: RE().inversion.dias });
  mensaje(`Inversión en ${RE().sectores[sector].nombre.toLowerCase()}: ${costo} millones. Sube un nivel en ${Math.round(RE().inversion.dias / 365)} años.`, 'info', pais);
  avisar('economia');
  return null;
}

// ------------------------------------------------------------------ contratos

// Presupuesto de un contrato sin firmarlo: costo, días y errores.
export function cotizar(pais, pedido) {
  const { producto, tipo, cantidad } = pedido;
  const claveModelo = pedido.modelo;
  if (!cantidad || cantidad <= 0) return { error: 'Elegí una cantidad.' };
  if (producto === 'avion' && !modelo(claveModelo)) return { error: 'Elegí un modelo.' };
  let proveedor = pedido.proveedor;
  if (producto === 'avion' && tipo === 'extranjera') proveedor = modelo(claveModelo).origen;
  if (tipo === 'extranjera' && proveedor === pais) return { error: 'Es de fabricación propia: usá un contrato estatal.' };
  const costo = costoUnitario(producto, claveModelo, tipo) * cantidad;
  let porDia;
  if (tipo === 'estatal') {
    porDia = capacidad(pais, producto, claveModelo);
    if (porDia <= 0) return { error: producto === 'avion' ? 'Tu industria no fabrica ese modelo.' : 'Tu industria no tiene capacidad para esto.' };
  } else {
    porDia = cantidad / RE().contratos.extranjera.dias_entrega;
    const e = embargo(proveedor, pais);
    if (e) return { error: e, proveedor, costo };
  }
  return { costo, dias: Math.ceil(cantidad / porDia), porDia, proveedor };
}

export function firmarContrato(pais, pedido) {
  const c = cotizar(pais, pedido);
  if (c.error) return c.error;
  const contrato = {
    id: economia.siguienteId++,
    pais,
    producto: pedido.producto,
    modelo: pedido.modelo ?? null,
    tipo: pedido.tipo,
    proveedor: c.proveedor ?? pais,
    cantidad: pedido.cantidad,
    entregados: 0,
    avance: 0,
    costoUnitario: c.costo / pedido.cantidad,
    porDia: c.porDia,
    base: pedido.base ?? null,
    estado: 'activo', // 'activo' | 'suspendido' | 'terminado'
    motivo: null,
  };
  economia.contratos.push(contrato);
  mensaje(`Contrato firmado: ${textoProducto(contrato)} (${pedido.cantidad}), ${Math.round(c.costo)} millones, unos ${c.dias} días.`, 'info', pais);
  avisar('economia');
  return null;
}

export function textoProducto(c) {
  if (c.producto === 'avion') return modelo(c.modelo).nombre;
  return RE().productos[c.producto].nombre;
}

export function cancelarContrato(c) {
  c.estado = 'terminado';
  c.motivo = 'Cancelado';
  avisar('economia');
}

function entregar(c, n) {
  const e = economiaDe(c.pais);
  if (c.producto === 'equipo') e.equipo += n;
  else if (c.producto === 'repuestos') e.repuestos += n;
  else recibirAviones(c.pais, c.modelo, n, c.base);
  c.entregados += n;
  if (c.entregados >= c.cantidad) {
    c.estado = 'terminado';
    c.motivo = 'Entregado';
    mensaje(`Se completó el contrato de ${textoProducto(c)} (${c.cantidad}).`, 'bueno', c.pais);
  }
}

function procesarContratos(e) {
  const activos = economia.contratos.filter((c) => c.pais === e.pais && c.estado !== 'terminado');
  for (const c of activos) {
    if (c.tipo === 'extranjera') {
      const motivo = embargo(c.proveedor, c.pais);
      if (motivo && c.estado === 'activo') {
        c.estado = 'suspendido';
        c.motivo = motivo;
        mensaje(`Se suspendió la compra de ${textoProducto(c)}: ${motivo}`, 'malo', c.pais);
      } else if (!motivo && c.estado === 'suspendido') c.estado = 'activo';
    }
    if (c.estado !== 'activo') continue;
    // Los contratos estatales del mismo producto se reparten la capacidad.
    let porDia = c.porDia;
    if (c.tipo === 'estatal') {
      const iguales = activos.filter((x) => x.tipo === 'estatal' && x.producto === c.producto && x.estado === 'activo').length;
      porDia = capacidad(c.pais, c.producto, c.modelo) / Math.max(1, iguales);
    }
    porDia = Math.min(porDia, c.cantidad - c.entregados - c.avance);
    // Se paga lo que se produce; si no alcanza la plata, se produce menos.
    const costoDia = porDia * c.costoUnitario;
    let parte = costoDia > 0 ? Math.min(1, e.fondosMilitares / costoDia) : 1;
    if (c.tipo === 'extranjera' && costoDia > 0) parte = Math.min(parte, Math.max(0, e.divisas) / costoDia);
    e.fondosMilitares -= costoDia * parte;
    if (c.tipo === 'extranjera') e.divisas -= costoDia * parte;
    c.avance += porDia * parte;
    const enteros = Math.floor(c.avance + 1e-9);
    if (enteros > 0) {
      c.avance -= enteros;
      entregar(c, enteros);
    }
  }
}

// ------------------------------------------------------------------ paso del tiempo

export function sumarBajas(pais, n) {
  const e = economiaDe(pais);
  if (e) e.bajas += n;
}

export function actualizarDiaEconomia() {
  const pp = RE().presupuesto;
  const pe = RE().estabilidad;
  for (const e of Object.values(economia.paises)) {
    const enGuerraAhora = enemigosDe(e.pais).length > 0;
    e.fondosMilitares += (e.pbi * e.gastoMilitar) / 365;
    e.tesoro += (e.pbi * (e.impuestos - e.gastoMilitar - 0.15)) / 365;
    e.divisas += (e.pbi * pp.divisas_netas_por_pbi) / 365;
    e.crecimiento = pp.crecimiento_base
      + (e.gastoMilitar - 0.03) * 100 * pp.crecimiento_por_punto_gasto
      + (enGuerraAhora ? pp.crecimiento_en_guerra : 0)
      + (e.tesoro < 0 ? -0.01 : 0);
    e.pbi *= 1 + e.crecimiento / 365;

    const objetivo = limitar(pe.base
      + (e.impuestos - 0.2) * 100 * pe.por_punto_impuestos_sobre_20
      + (e.gastoMilitar - 0.03) * 100 * pe.por_punto_gasto_sobre_3
      + (enGuerraAhora ? pe.guerra : 0)
      + (e.bajas / 10000) * pe.por_cada_10000_bajas
      + (e.tesoro < 0 ? -8 : 0), 0, 100);
    e.estabilidad += limitar(objetivo - e.estabilidad, -pe.cambio_por_dia, pe.cambio_por_dia);

    e.repuestos = Math.max(0, e.repuestos - consumoRepuestos(e.pais));

    for (const inv of e.inversiones) inv.dias--;
    for (const inv of e.inversiones.filter((i) => i.dias <= 0)) {
      e.sectores[inv.sector] = Math.min(10, e.sectores[inv.sector] + 1);
      mensaje(`${RE().sectores[inv.sector].nombre} sube a nivel ${e.sectores[inv.sector]}.`, 'bueno', e.pais);
    }
    e.inversiones = e.inversiones.filter((i) => i.dias > 0);

    procesarContratos(e);
  }
  avisar('economia');
}

// Para el reclutamiento: ¿alcanza el equipo?
export function hayEquipo(pais, tipo) {
  const e = economiaDe(pais);
  return !e || e.equipo >= equipoPorTipo(tipo);
}

export function gastarEquipo(pais, tipo) {
  const e = economiaDe(pais);
  if (e) e.equipo -= equipoPorTipo(tipo);
}

