// Estatus Camino Unidades V5 · Mantenimiento Idealease Oriente (Camino Casa + Foránea / Sitio) · PRODUCCIÓN
import React, { useState, useEffect, useCallback, useRef } from "react";
import { createRoot } from "react-dom/client";

// SheetJS solo se carga si falla el Excel con formato (respaldo sin colores)
let XLSX = null;
async function cargarXLSX() { if (!XLSX) { const m = await import("xlsx"); XLSX = m.default || m; } return XLSX; }

const BLUE = "#002D72", BLUE_DARK = "#001B47", BLUE_SOFT = "#274B8E", WHITE = "#FFFFFF";
const AMBER = "#C88A00", RED = "#B3261E", GREEN = "#1E7A46", GRAY = "#6B7280", BORDER = "#D9DEE8", BG = "#F4F6FB";
const CELESTE = "#2FAFE0", NARANJA = "#D9722C";

const COLOR_TIPO_OPCIONES = [
  { id: "verde", label: "Ingreso Normal", color: GREEN },
  { id: "amarillo", label: "Término Renta Sin Def", color: AMBER },
  { id: "naranja", label: "Término Renta con Def", color: NARANJA },
];
function colorTipoAColor(id) {
  return (COLOR_TIPO_OPCIONES.find((o) => o.id === id) || {}).color || BLUE_SOFT;
}

const ETAPAS = [
  { id: 1, nombre: "Ingreso Vigilante", rol: "Vigilante", metaHrs: 0.5 },
  { id: 2, nombre: "Recepción Servicio", rol: "Asesor de Servicio", metaHrs: 1 },
  { id: 3, nombre: "Pendiente Asignar", rol: "Supervisor Mantenimiento", metaHrs: 1 },
  { id: 4, nombre: "Diagnóstico/Revisión", rol: "Técnico", metaHrs: 4 },
  { id: 5, nombre: "Surtimiento Refacción", rol: "Almacenista", metaHrs: 8 },
  { id: 6, nombre: "Reparación", rol: "Técnico", metaHrs: 8 },
  { id: 7, nombre: "Validación Taller", rol: "Supervisor Mantenimiento", metaHrs: 1 },
  { id: 8, nombre: "Validación Servicio (Disponible)", rol: "Asesor de Servicio", metaHrs: 1 },
];
const META_TOTAL_HRS = ETAPAS.reduce((a, e) => a + e.metaHrs, 0);

// ---- Camino Foránea / Sitio: unidades atendidas en agencia o en el sitio del cliente ----
// Un solo usuario gestiona todo el camino. Metas en horas = SUPUESTO inicial, ajustar con datos reales.
const ROL_FORANEO = "Supervisor Foráneo";
const ETAPAS_FORANEA = [
  { id: 1, nombre: "Ingreso Agencia / Sitio Cliente", rol: ROL_FORANEO, metaHrs: 4 },
  { id: 2, nombre: "Diagnóstico", rol: ROL_FORANEO, metaHrs: 8 },
  { id: 3, nombre: "Espera Cotización", rol: ROL_FORANEO, metaHrs: 24 },
  { id: 4, nombre: "Cotización Autorizada", rol: ROL_FORANEO, metaHrs: 24 },
  { id: 5, nombre: "Reparación", rol: ROL_FORANEO, metaHrs: 48 },
  { id: 6, nombre: "Unidad Disponible", rol: ROL_FORANEO, metaHrs: 4 },
];
const META_TOTAL_FORANEA = ETAPAS_FORANEA.reduce((a, e) => a + e.metaHrs, 0);
const MORADO = "#6A3FA0";
const LUGARES_FORANEA = [
  { id: "agencia", label: "Agencia", color: BLUE_SOFT },
  { id: "sitio", label: "Sitio cliente", color: MORADO },
];
const lugarDef = (id) => LUGARES_FORANEA.find((l) => l.id === id) || LUGARES_FORANEA[0];
const esForanea = (u) => !!u && u.camino === "foranea";
const etapasDe = (u) => (esForanea(u) ? ETAPAS_FORANEA : ETAPAS);
const ROLES = [...new Set(ETAPAS.map((e) => e.rol))];
// PIN por taller y rol (demo). Veracruz conserva los PIN de la versión anterior.

// Diferencia entre el reloj del servidor y el de este dispositivo (un celular con la hora mal no altera los tiempos)
let desfaseMs = 0;
function nowISO() { return new Date(Date.now() + desfaseMs).toISOString(); }
function hoursBetween(a, b) { return (new Date(b) - new Date(a)) / 36e5; }
function fmtDiasHorasMin(totalHoras) {
  const totalMin = Math.max(0, Math.round(totalHoras * 60));
  const dias = Math.floor(totalMin / 1440);
  const horas = Math.floor((totalMin % 1440) / 60);
  const min = totalMin % 60;
  const partes = [];
  if (dias > 0) partes.push(`${dias} d`);
  if (horas > 0) partes.push(`${horas} h`);
  if (dias === 0) partes.push(`${min} min`);
  return partes.join(" ");
}
function fmtFechaHora(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
function ultimaEntradaAbierta(historial) { return (historial || []).find((h) => h.fin == null); }
function calcEstatus(unidad) {
  const entrada = ultimaEntradaAbierta(unidad.historial);
  if (!entrada) return { label: "Disponible", color: GREEN, horasEnEtapa: 0 };
  const etapa = etapasDe(unidad)[entrada.etapa - 1];
  const horasEnEtapa = hoursBetween(entrada.inicio, nowISO());
  const ratio = horasEnEtapa / etapa.metaHrs;
  if (ratio <= 1) return { label: "En tiempo", color: GREEN, horasEnEtapa, ratio };
  if (ratio <= 1.5) return { label: "Alerta", color: AMBER, horasEnEtapa, ratio };
  return { label: "Crítico", color: RED, horasEnEtapa, ratio };
}
function calcTotalHoras(u) { return hoursBetween(u.fechaIngreso, u.fechaSalida || nowISO()); }
function comentariosCompletos(historial, etapas = ETAPAS) {
  return (historial || [])
    .filter((h) => h.comentario)
    .map((h) => `${etapas[h.etapa - 1]?.nombre || h.etapa}: ${h.comentario}${h.borrador && h.fin == null ? " (borrador)" : ""}`)
    .join("\n");
}

// ---- Guardado parcial: guarda lo capturado en la etapa actual SIN cambiar de etapa ----
function borradorDe(unidad) { return (unidad.historial || []).find((h) => h.fin == null && h.borrador) || null; }
function guardarBorradorLocal(unidad, { patch = {}, comentario = "" }) {
  const historial = [...unidad.historial];
  const idx = historial.findIndex((h) => h.fin == null);
  if (idx >= 0) historial[idx] = { ...historial[idx], comentario, borrador: true, borradorEn: nowISO() };
  return { ...unidad, ...patch, historial };
}

// ---- Transición local (mock, sin backend) ----
function transicion(unidad, { patch = {}, comentario = "", destino, insertarOmitida = null, cerrarSinNueva = false }) {
  const historial = [...unidad.historial];
  const idx = historial.findIndex((h) => h.fin == null);
  if (idx >= 0) { const { borrador, borradorEn, ...resto } = historial[idx]; historial[idx] = { ...resto, fin: nowISO(), comentario }; }
  if (insertarOmitida) [].concat(insertarOmitida).forEach((et) => historial.push({ etapa: et, inicio: nowISO(), fin: nowISO(), comentario: "Etapa omitida" }));
  if (!cerrarSinNueva) historial.push({ etapa: destino, inicio: nowISO(), fin: null, comentario: "" });
  return { ...unidad, ...patch, etapaActual: destino, historial };
}

// ======================================================================
//  Talleres, almacenamiento compartido y datos de ejemplo
// ======================================================================
const TALLERES = [
  { id: "veracruz", nombre: "Veracruz" },
  { id: "tultitlan", nombre: "Tultitlán" },
  { id: "altamira", nombre: "Altamira" },
  { id: "cordoba", nombre: "Córdoba" },
];
const vacio = () => ({ unidades: [], historico: [] });
const idUnico = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const POLL_MS = 8000;
const NOMBRE_ORG = "Mantenimiento Idealease Oriente";

// ======================================================================
//  Sesión y conexión con el servidor
// ======================================================================
const SESION_KEY = "camino_casa_sesion";
const ROL_DIRECCION = "Dirección General";
let alVencerSesion = null; // lo asigna App: se llama cuando el servidor responde 401

function leerSesion() {
  try {
    const x = JSON.parse(localStorage.getItem(SESION_KEY) || "null");
    if (x && x.token && x.exp > Date.now()) return x;
  } catch {}
  return null;
}
function guardarSesionLocal(x) {
  try {
    if (x) localStorage.setItem(SESION_KEY, JSON.stringify(x));
    else localStorage.removeItem(SESION_KEY);
  } catch {}
}

async function api(ruta, { method = "GET", body, sinSesion = false } = {}) {
  const headers = { "content-type": "application/json" };
  const x = leerSesion();
  if (x && !sinSesion) headers.authorization = `Bearer ${x.token}`;
  let res;
  try {
    res = await fetch(ruta, { method, headers, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  } catch {
    const e = new Error("Sin conexión con el servidor. Revisa tu internet.");
    e.status = 0;
    throw e;
  }
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) {
    const e = new Error((data && data.error) || "Error del servidor");
    e.status = res.status;
    e.code = data && data.code;
    if (res.status === 401 && !sinSesion && alVencerSesion) alVencerSesion();
    throw e;
  }
  return data;
}

// Consulta el servidor cada POLL_MS. El histórico (más pesado) se refresca cada 6 consultas
// y después de cualquier cambio hecho en este dispositivo.
function useSnapshot(tallerParam, diasHistorico, camino = "casa") {
  const [datos, setDatos] = useState(null); // { [taller]: { unidades, historico } }
  const [error, setError] = useState(null);
  const [actualizado, setActualizado] = useState(null);
  const ciclo = useRef(0);

  const cargar = useCallback(async (forzarHistorico = false) => {
    const conHist = forzarHistorico === true || ciclo.current % 6 === 0;
    ciclo.current += 1;
    try {
      const r = await api(`/api/snapshot?taller=${tallerParam}&camino=${camino}&dias=${conHist ? diasHistorico : 0}`);
      if (r.ahora) desfaseMs = new Date(r.ahora).getTime() - Date.now();
      setDatos((prev) => {
        const sig = {};
        Object.keys(r.talleres).forEach((id) => {
          sig[id] = {
            unidades: r.talleres[id].unidades,
            historico: conHist ? r.talleres[id].historico : (prev && prev[id] ? prev[id].historico : []),
          };
        });
        return sig;
      });
      setError(null);
      setActualizado(new Date());
    } catch (e) {
      if (e.status !== 401) setError(e.message);
    }
  }, [tallerParam, diasHistorico, camino]);

  useEffect(() => {
    let vivo = true;
    ciclo.current = 0;
    cargar(true);
    const t = setInterval(() => { if (vivo) cargar(false); }, POLL_MS);
    return () => { vivo = false; clearInterval(t); };
  }, [cargar]);

  return { datos, error, actualizado, recargar: cargar };
}

// Datos de UN taller y UN camino (Casa o Foránea / Sitio)
function useTaller(id, camino = "casa") {
  const x = useSnapshot(id, 90, camino);
  return { data: x.datos ? x.datos[id] || vacio() : null, error: x.error, actualizado: x.actualizado, recargar: x.recargar, setData: () => {} };
}

// Lectura fresca (con histórico de un año) de los dos caminos, para armar los reportes de Excel
async function leerParaReporte(tallerParam) {
  const [c, f] = await Promise.all(["casa", "foranea"].map((cam) => api(`/api/snapshot?taller=${tallerParam}&camino=${cam}&dias=365`)));
  const lista = (r) => TALLERES.filter((t) => r.talleres[t.id]).map((t) => ({ taller: t, data: r.talleres[t.id] }));
  return { casa: lista(c), foranea: lista(f) };
}

// Lee los datos de un taller. Si la lectura falla por un error real (no por
// "no existe todavía"), devuelve ok:false para NO sobrescribir datos buenos.

// Leer-modificar-escribir: siempre parte de lo último guardado, para que dos
// personas actualizando a la vez no se pisen entre sí.


// ---- Tiempo acumulado por etapa (horas) a partir del historial ----
function tiemposPorEtapa(u) {
  const ETS = etapasDe(u);
  const horas = ETS.map(() => 0);
  const visitada = ETS.map(() => false);
  const omitida = ETS.map(() => false);
  const ahora = nowISO();
  (u.historial || []).forEach((h) => {
    const i = h.etapa - 1;
    if (i < 0 || i >= ETS.length) return;
    visitada[i] = true;
    if (h.comentario === "Etapa omitida") { omitida[i] = true; return; }
    horas[i] += Math.max(0, hoursBetween(h.inicio, h.fin || ahora));
  });
  return ETS.map((_, i) => ({ horas: horas[i], visitada: visitada[i], omitida: omitida[i] && horas[i] === 0 }));
}

// ---- Cuello de botella: etapa con más unidades en proceso ----
function calcularCuelloBotella(unidades, etapas = ETAPAS) {
  const filas = etapas.map((et) => {
    const us = unidades.filter((u) => u.etapaActual === et.id);
    const hs = us.map((u) => calcEstatus(u).horasEnEtapa || 0);
    const total = hs.reduce((a, b) => a + b, 0);
    return { et, n: us.length, fuera: hs.filter((h) => h > et.metaHrs).length, prom: us.length ? total / us.length : 0, total };
  }).filter((f) => f.n > 0);
  if (!filas.length) return null;
  filas.sort((a, b) => b.n - a.n || b.total - a.total);
  return filas[0];
}

// ---- Tendencia: unidades que ingresan vs entregan (7 días o 4 semanas) ----
const DIAS_CORTO = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const inicioDia = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const inicioSemana = (d) => { const x = inicioDia(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };

function cubosTendencia(modo, ahora = new Date()) {
  const cubos = [];
  if (modo === "dias") {
    const hoy = inicioDia(ahora);
    for (let i = 6; i >= 0; i--) {
      const d = new Date(hoy); d.setDate(d.getDate() - i);
      const h = new Date(d); h.setDate(h.getDate() + 1);
      cubos.push({ label: `${DIAS_CORTO[d.getDay()]} ${d.getDate()}`, desde: d, hasta: h });
    }
  } else {
    const sem = inicioSemana(ahora);
    for (let i = 3; i >= 0; i--) {
      const d = new Date(sem); d.setDate(d.getDate() - 7 * i);
      const h = new Date(d); h.setDate(h.getDate() + 7);
      cubos.push({ label: `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`, desde: d, hasta: h });
    }
  }
  return cubos;
}

function contarTendencia(cubos, unidades, historico) {
  const todas = [...unidades, ...historico];
  return cubos.map((c) => ({
    label: c.label,
    ingresan: todas.filter((u) => { const t = new Date(u.fechaIngreso); return t >= c.desde && t < c.hasta; }).length,
    entregan: historico.filter((u) => { if (!u.fechaSalida) return false; const t = new Date(u.fechaSalida); return t >= c.desde && t < c.hasta; }).length,
  }));
}

// ---- Resumen exportable (Excel y texto para copiar) ----
const r2 = (n) => Math.round(n * 100) / 100;

function resumenAoa(talleres, etapas = ETAPAS, titulo = "Resumen ejecutivo de talleres · Camino Casa") {
  const cubos7 = cubosTendencia("dias");
  const filas = [[NOMBRE_ORG], [titulo], ["Generado", new Date().toLocaleString("es-MX")], [],
    ["Taller", "En proceso", "En tiempo", "Alerta", "Crítico", "Por aceptar", "Etapa con más unidades", "Unidades en esa etapa", "Ingresaron (7 días)", "Entregaron (7 días)"]];
  const tot = { n: 0, a: 0, b: 0, c: 0, p: 0, i: 0, e: 0 };
  talleres.forEach(({ taller, data }) => {
    const est = data.unidades.map((u) => calcEstatus(u).label);
    const cuenta = (l) => est.filter((x) => x === l).length;
    const cb = calcularCuelloBotella(data.unidades, etapas);
    const t7 = contarTendencia(cubos7, data.unidades, data.historico);
    const ing = t7.reduce((a, x) => a + x.ingresan, 0);
    const ent = t7.reduce((a, x) => a + x.entregan, 0);
    const pend = data.unidades.filter((u) => u.saltoPendiente).length;
    filas.push([taller.nombre, data.unidades.length, cuenta("En tiempo"), cuenta("Alerta"), cuenta("Crítico"), pend,
      cb && cb.n >= 2 ? cb.et.nombre : "Sin acumulación", cb ? cb.n : 0, ing, ent]);
    tot.n += data.unidades.length; tot.a += cuenta("En tiempo"); tot.b += cuenta("Alerta"); tot.c += cuenta("Crítico"); tot.p += pend; tot.i += ing; tot.e += ent;
  });
  filas.push(["Total", tot.n, tot.a, tot.b, tot.c, tot.p, "", "", tot.i, tot.e]);
  return filas;
}

function resumenTSV(talleres, talleresF = []) {
  const filas = [...resumenAoa(talleres)];
  if (talleresF.length) filas.push([], ...resumenAoa(talleresF, ETAPAS_FORANEA, "Resumen ejecutivo · Camino Foránea / Sitio").slice(1));
  return filas.map((f) => f.join("\t")).join("\n");
}

// ---- Excel · una fila por unidad, con el formato pedido: sucursal + datos de la unidad + tiempo en cada fase ----
const NOMBRES_FASE = ["Ingreso Vigilante", "Recepción Servicio", "Pendiente Asignar", "Diagnóstico", "Surtimiento", "Reparación", "Validación Taller", "Validación Servicio"];
function hojaUnidadesTaller(talleres, entregadas = false) {
  const enc = ["Sucursal", "Fecha de Ingreso", "VIN", "Cliente", "Status Actual", "Fecha y Hora del último comentario de Status Actual", "Comentario de Status Actual", "Días en taller", "Responsable de Fase", ...NOMBRES_FASE, ...(entregadas ? ["Fecha Disponible"] : [])];
  const cIngreso = 1, cUltCom = 5, cDias = 7, C0 = 9;  // B, F, H y primera fase (J)
  const cSalida = C0 + NOMBRES_FASE.length;               // R: Fecha Disponible (solo en Entregadas)
  const col = (c) => XLSX.utils.encode_col(c);
  const hoy = new Date();
  const dia0 = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const FECHA_HORA = "dd/mm/yyyy hh:mm";
  const filas = [];
  talleres.forEach(({ taller, data }) => {
    const lista = entregadas
      ? [...data.historico].sort((x, y) => new Date(y.fechaSalida) - new Date(x.fechaSalida))
      : [...data.unidades].sort((x, y) => new Date(x.fechaIngreso) - new Date(y.fechaIngreso));
    lista.forEach((u) => {
      const et = ETAPAS[u.etapaActual - 1];
      const t = tiemposPorEtapa(u);
      const abierta = (u.historial || []).find((h) => h.fin == null);
      const ultimo = [...(u.historial || [])].reverse().find((h) => h.comentario && !/^Salto de etapa aceptado/.test(h.comentario));
      const comentario = entregadas
        ? (ultimo ? ultimo.comentario : "")
        : [u.saltoPendiente ? `Pendiente de aceptar por ${et.rol}` : "", abierta && abierta.comentario ? abierta.comentario : ""].filter(Boolean).join(" · ");
      const ingreso = new Date(u.fechaIngreso);
      const fin = entregadas ? new Date(u.fechaSalida) : hoy;
      // Fecha y hora del último comentario: el borrador guardado; si solo hay aviso de traspaso, cuándo se envió; en entregadas, cuándo se confirmó
      const cuandoISO = entregadas ? (ultimo && ultimo.fin) : (abierta && abierta.comentario && abierta.borradorEn) || (u.saltoPendiente && abierta ? abierta.inicio : null);
      filas.push([taller.nombre, ingreso, u.vin, u.cliente, entregadas ? "Disponible" : nombreCorto(et.nombre), cuandoISO && comentario ? new Date(cuandoISO) : null, comentario || null,
        Math.round((dia0(fin) - dia0(ingreso)) / 86400000), entregadas ? null : et.rol,
        ...t.map((x) => (x.omitida ? "Omitida" : x.visitada ? r2(x.horas) : null)), ...(entregadas ? [fin] : [])]);
    });
  });
  const ws = XLSX.utils.aoa_to_sheet([enc, ...filas], { cellDates: true });
  filas.forEach((f, i) => {
    const r = i + 2;
    ws[`${col(cIngreso)}${r}`].z = FECHA_HORA;
    if (ws[`${col(cUltCom)}${r}`] && ws[`${col(cUltCom)}${r}`].t === "d") ws[`${col(cUltCom)}${r}`].z = FECHA_HORA;
    // Días en taller: en proceso = HOY() menos la fecha de ingreso; entregada = fecha disponible menos fecha de ingreso
    ws[`${col(cDias)}${r}`] = { t: "n", v: f[cDias], f: entregadas ? `INT(${col(cSalida)}${r})-INT(${col(cIngreso)}${r})` : `TODAY()-INT(${col(cIngreso)}${r})`, z: "0" };
    for (let c = C0; c < C0 + NOMBRES_FASE.length; c++) { const cell = ws[`${col(c)}${r}`]; if (cell && cell.t === "n") cell.z = '0.0" h"'; }
    if (entregadas) ws[`${col(cSalida)}${r}`].z = FECHA_HORA;
  });
  ws["!cols"] = [12, 17, 20, 28, 24, 22, 60, 14, 24, ...NOMBRES_FASE.map(() => 14), ...(entregadas ? [17] : [])].map((wch) => ({ wch }));
  ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: filas.length, c: enc.length - 1 } }) };
  return ws;
}

// <<REPORTE_XLSX:INICIO>> (generado por ensamblar: no editar a mano)
// Excel con diseño (logo IDO 360°, colores, semáforo por fase) generado en el propio navegador, sin librerías.
const LOGO_IDO360_B64 = "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";
const REPORTE_XLSX = (function () {
// ======================================================================
//  Mini generador de .xlsx (sin dependencias): subconjunto de la API de ExcelJS suficiente
//  para el Reporte de Piso: estilos, colores, formato condicional, paneles fijos, filtros,
//  celdas combinadas, fórmulas, impresión y una imagen (logo). Escribe un ZIP sin compresión.
// ======================================================================
const enc = new TextEncoder();
const esc = (s) => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const colLetra = (n) => { let s = ""; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const dirDe = (a) => { const m = /^([A-Z]+)(\d+)$/.exec(a); let c = 0; for (const ch of m[1]) c = c * 26 + (ch.charCodeAt(0) - 64); return { r: +m[2], c }; };

// ---------- ZIP (método "store") ----------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (u8) => { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function zip(archivos) { // [{ nombre, datos: Uint8Array }]
  const partes = [], central = []; let desp = 0;
  const f = new Date(), dosT = (f.getHours() << 11) | (f.getMinutes() << 5) | (f.getSeconds() >> 1), dosD = ((f.getFullYear() - 1980) << 9) | ((f.getMonth() + 1) << 5) | f.getDate();
  const u16 = (v, n) => { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, v, true); n.push(b); }, u32 = (v, n) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v >>> 0, true); n.push(b); };
  for (const a of archivos) {
    const nombre = enc.encode(a.nombre), crc = crc32(a.datos), h = [];
    u32(0x04034b50, h); u16(20, h); u16(0x0800, h); u16(0, h); u16(dosT, h); u16(dosD, h); u32(crc, h); u32(a.datos.length, h); u32(a.datos.length, h); u16(nombre.length, h); u16(0, h); h.push(nombre);
    const cab = [];
    u32(0x02014b50, cab); u16(20, cab); u16(20, cab); u16(0x0800, cab); u16(0, cab); u16(dosT, cab); u16(dosD, cab); u32(crc, cab); u32(a.datos.length, cab); u32(a.datos.length, cab); u16(nombre.length, cab); u16(0, cab); u16(0, cab); u16(0, cab); u16(0, cab); u32(0, cab); u32(desp, cab); cab.push(nombre);
    const tam = h.reduce((s, x) => s + x.length, 0) + a.datos.length;
    partes.push(...h, a.datos); central.push(...cab); desp += tam;
  }
  const cTam = central.reduce((s, x) => s + x.length, 0), fin = [];
  u32(0x06054b50, fin); u16(0, fin); u16(0, fin); u16(archivos.length, fin); u16(archivos.length, fin); u32(cTam, fin); u32(desp, fin); u16(0, fin);
  const todo = [...partes, ...central, ...fin], out = new Uint8Array(todo.reduce((s, x) => s + x.length, 0)); let p = 0;
  for (const x of todo) { out.set(x, p); p += x.length; }
  return out;
}

// ---------- estilos ----------
class Estilos {
  constructor(fuentePorDefecto) {
    this.fuentes = []; this.rellenos = []; this.bordes = []; this.formatos = []; this.xfs = []; this.dxfs = [];
    this.mapa = { f: new Map(), r: new Map(), b: new Map(), n: new Map(), x: new Map() };
    this.fuente(fuentePorDefecto); this.rellenos.push("<fill><patternFill patternType=\"none\"/></fill>", "<fill><patternFill patternType=\"gray125\"/></fill>"); this.borde(null);
    this.xf({});
  }
  _id(lista, mapa, xml) { if (!mapa.has(xml)) { mapa.set(xml, lista.length); lista.push(xml); } return mapa.get(xml); }
  fuente(f) { f = f || {}; const xml = `<font>${f.bold ? "<b/>" : ""}${f.italic ? "<i/>" : ""}<sz val="${f.size || 10}"/>${f.color && f.color.argb ? `<color rgb="${f.color.argb}"/>` : ""}<name val="${esc(f.name || "Arial")}"/><family val="2"/></font>`; return this._id(this.fuentes, this.mapa.f, xml); }
  relleno(r) { if (!r || !r.fgColor) return 0; return this._id(this.rellenos, this.mapa.r, `<fill><patternFill patternType="solid"><fgColor rgb="${r.fgColor.argb}"/><bgColor indexed="64"/></patternFill></fill>`); }
  borde(b) {
    const lado = (n, x) => (x && x.style ? `<${n} style="${x.style}"><color rgb="${(x.color && x.color.argb) || "FF000000"}"/></${n}>` : `<${n}/>`);
    const xml = b ? `<border>${lado("left", b.left)}${lado("right", b.right)}${lado("top", b.top)}${lado("bottom", b.bottom)}<diagonal/></border>` : "<border><left/><right/><top/><bottom/><diagonal/></border>";
    return this._id(this.bordes, this.mapa.b, xml);
  }
  formato(f) { if (!f || f === "General") return 0; if (f === "0") return 1; const i = this._id(this.formatos, this.mapa.n, f); return 164 + i; }
  xf({ font, fill, border, alignment, numFmt }) {
    const fo = this.fuente(font), fi = this.relleno(fill), bo = this.borde(border), nf = this.formato(numFmt);
    const a = alignment || {}, al = ["horizontal", "vertical", "wrapText", "indent"].filter((k) => a[k] !== undefined && a[k] !== false).map((k) => (k === "wrapText" ? `wrapText="1"` : `${k}="${k === "vertical" && a[k] === "middle" ? "center" : a[k]}"`)).join(" ");
    const xml = `<xf numFmtId="${nf}" fontId="${fo}" fillId="${fi}" borderId="${bo}" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">${al ? `<alignment ${al}/>` : ""}</xf>`;
    return this._id(this.xfs, this.mapa.x, xml);
  }
  dxf(st) {
    const f = st.font || {}, rel = st.fill && st.fill.bgColor ? `<fill><patternFill><bgColor rgb="${st.fill.bgColor.argb}"/></patternFill></fill>` : "";
    const fx = `<font>${f.bold ? "<b/>" : ""}${f.italic ? "<i/>" : ""}${f.color && f.color.argb ? `<color rgb="${f.color.argb}"/>` : ""}</font>`;
    this.dxfs.push(`<dxf>${fx}${rel}</dxf>`); return this.dxfs.length - 1;
  }
  xml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      (this.formatos.length ? `<numFmts count="${this.formatos.length}">${this.formatos.map((f, i) => `<numFmt numFmtId="${164 + i}" formatCode="${esc(f)}"/>`).join("")}</numFmts>` : "") +
      `<fonts count="${this.fuentes.length}">${this.fuentes.join("")}</fonts><fills count="${this.rellenos.length}">${this.rellenos.join("")}</fills><borders count="${this.bordes.length}">${this.bordes.join("")}</borders>` +
      `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${this.xfs.length}">${this.xfs.join("")}</cellXfs>` +
      `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="${this.dxfs.length}">${this.dxfs.join("")}</dxfs></styleSheet>`;
  }
}

class Celda { constructor() { this.value = null; this.font = null; this.fill = null; this.alignment = null; this.border = null; this.numFmt = null; } }
class Fila { constructor() { this.height = null; this.celdas = new Map(); } }
class Hoja {
  constructor(libro, nombre, opciones) {
    this.libro = libro; this.name = nombre; this.filas = new Map(); this.columnas = new Map(); this.combinadas = []; this.condicionales = []; this.imagenes = []; this.graficas = [];
    this.views = (opciones && opciones.views) || []; this.autoFilter = null; this.pageSetup = null; this.headerFooter = null; this.properties = (opciones && opciones.properties) || {};
  }
  getRow(n) { if (!this.filas.has(n)) this.filas.set(n, new Fila()); return this.filas.get(n); }
  getColumn(n) { if (!this.columnas.has(n)) this.columnas.set(n, { width: null }); return this.columnas.get(n); }
  getCell(a, b) { const { r, c } = typeof a === "string" ? dirDe(a) : { r: a, c: b }; const fila = this.getRow(r); if (!fila.celdas.has(c)) fila.celdas.set(c, new Celda()); return fila.celdas.get(c); }
  mergeCells(r1, c1, r2, c2) { this.combinadas.push(`${colLetra(c1)}${r1}:${colLetra(c2)}${r2}`); }
  addImage(id, pos) { this.imagenes.push({ id, ...pos }); }
  addChart(spec) { this.graficas.push(spec); }
  addConditionalFormatting(cf) { this.condicionales.push(cf); }
}

// ---------- gráfica de pastel ----------
function xmlGraficaPastel(g) {
  const ln = '<a:ln w="19050"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln>';
  const fuente = (sz, bold, color) => `<a:defRPr sz="${sz}" b="${bold ? 1 : 0}"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:latin typeface="Arial"/></a:defRPr>`;
  const txPr = (sz, bold, color) => `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr>${fuente(sz, bold, color)}</a:pPr><a:endParaRPr lang="es-MX"/></a:p></c:txPr>`;
  const cats = g.categorias.valores, vals = g.valores.valores;
  const puntos = cats.map((_, i) => `<c:dPt><c:idx val="${i}"/><c:bubble3D val="0"/><c:spPr><a:solidFill><a:srgbClr val="${g.colores[i % g.colores.length]}"/></a:solidFill>${ln}</c:spPr></c:dPt>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:roundedCorners val="0"/><c:chart>` +
    `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr>${fuente(1300, true, "1F2D6B")}</a:pPr><a:r><a:rPr lang="es-MX" sz="1300" b="1"><a:solidFill><a:srgbClr val="1F2D6B"/></a:solidFill><a:latin typeface="Arial"/></a:rPr><a:t>${esc(g.titulo)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>` +
    `<c:plotArea><c:layout/><c:pieChart><c:varyColors val="1"/><c:ser><c:idx val="0"/><c:order val="0"/>` +
    `<c:tx><c:strRef><c:f>${esc(g.serie.ref)}</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${esc(g.serie.texto)}</c:v></c:pt></c:strCache></c:strRef></c:tx>` +
    `<c:spPr>${ln}</c:spPr>${puntos}` +
    `<c:dLbls><c:numFmt formatCode="0.0%" sourceLinked="0"/><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>${txPr(900, true, "26324F")}<c:dLblPos val="outEnd"/><c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="1"/><c:showBubbleSize val="0"/><c:showLeaderLines val="1"/></c:dLbls>` +
    `<c:cat><c:strRef><c:f>${esc(g.categorias.ref)}</c:f><c:strCache><c:ptCount val="${cats.length}"/>${cats.map((v, i) => `<c:pt idx="${i}"><c:v>${esc(v)}</c:v></c:pt>`).join("")}</c:strCache></c:strRef></c:cat>` +
    `<c:val><c:numRef><c:f>${esc(g.valores.ref)}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${vals.length}"/>${vals.map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join("")}</c:numCache></c:numRef></c:val>` +
    `</c:ser><c:firstSliceAng val="0"/></c:pieChart></c:plotArea>` +
    `<c:legend><c:legendPos val="r"/><c:overlay val="0"/>${txPr(900, false, "26324F")}</c:legend><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>` +
    `<c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="9525"><a:solidFill><a:srgbClr val="D5DDF0"/></a:solidFill></a:ln></c:spPr></c:chartSpace>`;
}

class Libro {
  constructor() { this.worksheets = []; this.imagenesLibro = []; this.xlsx = { writeBuffer: async () => this._escribir() }; }
  addImage(img) { this.imagenesLibro.push(img); return this.imagenesLibro.length - 1; }
  addWorksheet(nombre, opciones) { const h = new Hoja(this, nombre, opciones); this.worksheets.push(h); return h; }

  _escribir() {
    const est = new Estilos({ name: "Arial", size: 10 });
    const xmlHoja = (h, idx) => {
      let prioridad = 1;
      const filasNum = [...h.filas.keys()].sort((a, b) => a - b);
      let maxC = 1, maxR = 1, minC = 1e9, minR = 1e9;
      const filasXml = filasNum.map((rn) => {
        const f = h.filas.get(rn), cols = [...f.celdas.keys()].sort((a, b) => a - b);
        const celdasXml = cols.map((cn) => {
          const c = f.celdas.get(cn), ref = `${colLetra(cn)}${rn}`;
          maxC = Math.max(maxC, cn); maxR = Math.max(maxR, rn); minC = Math.min(minC, cn); minR = Math.min(minR, rn);
          const s = est.xf({ font: c.font, fill: c.fill, border: c.border, alignment: c.alignment, numFmt: c.numFmt });
          const v = c.value;
          if (v === null || v === undefined || v === "") return `<c r="${ref}" s="${s}"/>`;
          if (v instanceof Date) return `<c r="${ref}" s="${s}"><v>${v.getTime() / 86400000 + 25569}</v></c>`;
          if (typeof v === "number") return `<c r="${ref}" s="${s}"><v>${v}</v></c>`;
          if (typeof v === "object" && v.formula) return `<c r="${ref}" s="${s}"><f>${esc(v.formula)}</f>${v.result !== undefined ? `<v>${v.result}</v>` : ""}</c>`;
          return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
        }).join("");
        return `<row r="${rn}"${f.height ? ` ht="${f.height}" customHeight="1"` : ""}>${celdasXml}</row>`;
      }).join("");
      const colsNum = [...h.columnas.keys()].sort((a, b) => a - b).filter((n) => h.columnas.get(n).width);
      const cols = colsNum.length ? `<cols>${colsNum.map((n) => `<col min="${n}" max="${n}" width="${h.columnas.get(n).width}" customWidth="1"/>`).join("")}</cols>` : "";
      const vista = h.views[0] || {}, congelado = vista.state === "frozen" && (vista.xSplit || vista.ySplit);
      let panel = "";
      if (congelado) {
        const x = vista.xSplit || 0, y = vista.ySplit || 0, tl = `${colLetra(x + 1)}${y + 1}`, activo = x && y ? "bottomRight" : y ? "bottomLeft" : "topRight";
        panel = `<pane${x ? ` xSplit="${x}"` : ""}${y ? ` ySplit="${y}"` : ""} topLeftCell="${tl}" activePane="${activo}" state="frozen"/>` +
          (x && y ? `<selection pane="topRight"/><selection pane="bottomLeft"/><selection pane="bottomRight" activeCell="${tl}" sqref="${tl}"/>` : `<selection pane="${activo}" activeCell="${tl}" sqref="${tl}"/>`);
      }
      const af = h.autoFilter ? `<autoFilter ref="${colLetra(h.autoFilter.from.column)}${h.autoFilter.from.row}:${colLetra(h.autoFilter.to.column)}${h.autoFilter.to.row}"/>` : "";
      const mc = h.combinadas.length ? `<mergeCells count="${h.combinadas.length}">${h.combinadas.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>` : "";
      const cf = h.condicionales.map((c) => `<conditionalFormatting sqref="${c.ref}">${c.rules.map((r) => `<cfRule type="expression" dxfId="${est.dxf(r.style)}" priority="${prioridad++}"><formula>${esc(r.formulae[0])}</formula></cfRule>`).join("")}</conditionalFormatting>`).join("");
      const ps = h.pageSetup, m = (ps && ps.margins) || {};
      const impresion = ps ? `<pageMargins left="${m.left ?? 0.7}" right="${m.right ?? 0.7}" top="${m.top ?? 0.75}" bottom="${m.bottom ?? 0.75}" header="${m.header ?? 0.3}" footer="${m.footer ?? 0.3}"/><pageSetup paperSize="${ps.paperSize || 9}" orientation="${ps.orientation || "portrait"}"${ps.fitToPage ? ` fitToWidth="${ps.fitToWidth ?? 1}" fitToHeight="${ps.fitToHeight ?? 0}"` : ""}/>` : `<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>`;
      const hf = h.headerFooter && h.headerFooter.oddFooter ? `<headerFooter><oddFooter>${esc(h.headerFooter.oddFooter)}</oddFooter></headerFooter>` : "";
      const dibujo = h.imagenes.length || h.graficas.length ? `<drawing r:id="rId1"/>` : "";
      return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        `<sheetPr>${h.properties.tabColor ? `<tabColor rgb="${h.properties.tabColor.argb}"/>` : ""}${ps && ps.fitToPage ? `<pageSetUpPr fitToPage="1"/>` : ""}</sheetPr>` +
        `<dimension ref="${colLetra(minC === 1e9 ? 1 : minC)}${minR === 1e9 ? 1 : minR}:${colLetra(maxC)}${maxR}"/>` +
        `<sheetViews><sheetView${vista.showGridLines === false ? ` showGridLines="0"` : ""}${idx === 0 ? ` tabSelected="1"` : ""} workbookViewId="0">${panel}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>` +
        `${cols}<sheetData>${filasXml}</sheetData>${af}${mc}${cf}${impresion}${hf}${dibujo}</worksheet>`;
    };
    const archivos = [], tipos = [], hojasXml = this.worksheets.map(xmlHoja); // (los estilos se llenan al generar cada hoja)
    const sinDibujos = this.worksheets.map((h) => h.imagenes.length > 0 || h.graficas.length > 0);
    let nGraf = 0; const graficasXml = [];
    // Contenido
    const ahora = new Date().toISOString().replace(/\.\d+Z$/, "Z");
    archivos.push({ nombre: "[Content_Types].xml", datos: enc.encode("") }); // se completa al final
    archivos.push({ nombre: "_rels/.rels", datos: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`) });
    archivos.push({ nombre: "docProps/core.xml", datos: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(this.title || "Reporte de Piso")}</dc:title><dc:creator>${esc(this.creator || "")}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${ahora}</dcterms:created></cp:coreProperties>`) });
    archivos.push({ nombre: "docProps/app.xml", datos: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Estatus Unidades Camino Casa</Application>${this.company ? `<Company>${esc(this.company)}</Company>` : ""}</Properties>`) });
    const titulos = this.worksheets.map((h, i) => (h.pageSetup && h.pageSetup.printTitlesRow ? `<definedName name="_xlnm.Print_Titles" localSheetId="${i}">'${esc(h.name)}'!${h.pageSetup.printTitlesRow.split(":").map((n) => `$${n}`).join(":")}</definedName>` : "")).join("");
    archivos.push({ nombre: "xl/workbook.xml", datos: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookPr/><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="28800" windowHeight="15000"/></bookViews><sheets>${this.worksheets.map((h, i) => `<sheet name="${esc(h.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>${titulos ? `<definedNames>${titulos}</definedNames>` : ""}<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`) });
    archivos.push({ nombre: "xl/_rels/workbook.xml.rels", datos: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${this.worksheets.map((h, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${this.worksheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`) });
    archivos.push({ nombre: "xl/styles.xml", datos: enc.encode(est.xml()) });
    let nDib = 0;
    this.worksheets.forEach((h, i) => {
      archivos.push({ nombre: `xl/worksheets/sheet${i + 1}.xml`, datos: enc.encode(hojasXml[i]) });
      if (sinDibujos[i]) {
        nDib++;
        archivos.push({ nombre: `xl/worksheets/_rels/sheet${i + 1}.xml.rels`, datos: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${nDib}.xml"/></Relationships>`) });
        const imgs = h.imagenes, graf = h.graficas.map((g) => ({ g, n: ++nGraf }));
        graf.forEach(({ g, n }) => graficasXml.push({ nombre: `xl/charts/chart${n}.xml`, datos: enc.encode(xmlGraficaPastel(g)) }));
        const anclas = imgs.map((im, k) => {
          const cx = Math.round(im.ext.width * 9525), cy = Math.round(im.ext.height * 9525);
          return `<xdr:oneCellAnchor><xdr:from><xdr:col>${im.tl.col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${im.tl.row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="${cx}" cy="${cy}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${k + 2}" name="Logo ${k + 1}" descr="Logotipo IDO 360"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="rId${k + 1}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`;
        }).concat(graf.map(({ g }, k) => {
          const cx = Math.round(g.pos.ext.width * 9525), cy = Math.round(g.pos.ext.height * 9525), id = imgs.length + k + 2;
          return `<xdr:oneCellAnchor><xdr:from><xdr:col>${g.pos.tl.col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${g.pos.tl.row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="${cx}" cy="${cy}"/><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${id}" name="Gráfica ${k + 1}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId${imgs.length + k + 1}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:oneCellAnchor>`;
        }));
        archivos.push({ nombre: `xl/drawings/drawing${nDib}.xml`, datos: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` + anclas.join("") + `</xdr:wsDr>`) });
        archivos.push({ nombre: `xl/drawings/_rels/drawing${nDib}.xml.rels`, datos: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` + imgs.map((im, k) => `<Relationship Id="rId${k + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${im.id + 1}.png"/>`).join("") + graf.map(({ n }, k) => `<Relationship Id="rId${imgs.length + k + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${n}.xml"/>`).join("") + `</Relationships>`) });
      }
    });
    graficasXml.forEach((x) => archivos.push(x));
    this.imagenesLibro.forEach((im, k) => { const d = im.buffer ? new Uint8Array(im.buffer) : Uint8Array.from(atob(String(im.base64).replace(/^data:[^,]*,/, "")), (c) => c.charCodeAt(0)); archivos.push({ nombre: `xl/media/image${k + 1}.png`, datos: d }); });
    archivos[0].datos = enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${this.worksheets.map((h, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${Array.from({ length: nDib }, (_, i) => `<Override PartName="/xl/drawings/drawing${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`).join("")}${Array.from({ length: nGraf }, (_, i) => `<Override PartName="/xl/charts/chart${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`).join("")}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`);
    return zip(archivos);
  }
}
const MiniExcel = { Workbook: Libro };


// ======================================================================
//  Excel con diseño (ExcelJS): encabezados de color, logo IDO 360°, semáforo por fase,
//  filtros, paneles fijos y formato de impresión.
//  construirLibroEstilizado(ExcelJS, talleres, H, { logo, ahora })
//    talleres = [{ taller: {id, nombre}, data: { unidades, historico } }]
//    H = { ETAPAS, tiemposPorEtapa, resumenAoa, cubosTendencia, contarTendencia }
//    logo = descriptor de imagen de ExcelJS: { buffer, extension: "png" } o { base64, extension: "png" }
// ======================================================================
const C = {
  navy: "FF1F2D6B", azul: "FF2563EB", celeste: "FF38BDF8", claro: "FFF3F6FD", tinte: "FFE8EEFB", borde: "FFD5DDF0", tinta: "FF26324F", gris: "FF5B6478", blanco: "FFFFFFFF",
  verde: "FF1E7A46", verdeFondo: "FFDFF3E7", ambar: "FFC88A00", ambarFondo: "FFFFF1CC", ambarTexto: "FF7A5200", rojo: "FFB3261E", rojoFondo: "FFFADBD8",
};
const FUENTE = "Arial";
const FECHA_HORA = "dd/mm/yyyy hh:mm";
const NOMBRES_FASE = ["Ingreso Vigilante", "Recepción Servicio", "Pendiente Asignar", "Diagnóstico", "Surtimiento", "Reparación", "Validación Taller", "Validación Servicio"];

const MORADO = "FF6A3FA0", MORADO_CLARO = "FFB39DDB";
const FASES_FORANEA = ["Ingreso Agencia / Sitio", "Diagnóstico", "Espera Cotización", "Cotización Autorizada", "Reparación", "Unidad Disponible"];
const COLORES_FORANEA = ["9FB7F0", "2563EB", "38BDF8", "D9722C", "1F2D6B", "1E7A46"];
const montoNum = (v) => { const n = parseFloat(String(v || "").replace(/[^0-9.]/g, "")); return isNaN(n) ? null : n; };

const relleno = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const linea = { style: "thin", color: { argb: C.borde } };
const BORDES = { top: linea, left: linea, bottom: linea, right: linea };
const nombreCorto = (n) => n.replace(" (Disponible)", "");
const r2 = (n) => Math.round(n * 100) / 100;
const enLocal = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000); // ExcelJS guarda las fechas en UTC: se corrige para ver la hora local
const letra = (n) => { let s = ""; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const fmtFechaHora = (d) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

// Perfil de cada camino: misma estructura de hoja, cambian las fases y (en foráneas) las columnas de datos de la unidad
function perfilCasa(H) {
  return { id: "casa", etapas: H.ETAPAS, fases: NOMBRES_FASE, extras: [], titulo: "Estatus Unidades Camino Casa", labelDias: "Días en taller", hojas: ["Reporte Piso", "Entregadas"], pie: "Piso y Disponible",
    tab: [C.navy, C.celeste, C.verde], colores: COLORES_FASE, vacio: ["No hay unidades en taller.", "Todavía no hay unidades entregadas."], subt: ["Unidades en taller", "Unidades entregadas"], unid: ["unidades en taller", "entregadas"] };
}
function perfilForanea(H) {
  return { id: "foranea", etapas: H.ETAPAS_FORANEA, fases: FASES_FORANEA, titulo: "Estatus Unidades Camino Foránea / Sitio", labelDias: "Días fuera", hojas: ["Foránea-Sitio", "Foránea Entregadas"], pie: "Piso y Disp. Foránea",
    tab: [MORADO, MORADO_CLARO, MORADO], colores: COLORES_FORANEA, vacio: ["No hay unidades foráneas en proceso.", "Todavía no hay unidades foráneas entregadas."], subt: ["Unidades en agencia o sitio del cliente", "Unidades foráneas entregadas"], unid: ["unidades foráneas en proceso", "foráneas entregadas"],
    extras: [
      { t: "Tipo de lugar", w: 14, v: (u) => H.lugarDef(u.lugarTipo).label, al: "center" },
      { t: "Agencia / Sitio", w: 28, v: (u) => u.lugarNombre || null },
      { t: "Ciudad", w: 16, v: (u) => u.ciudad || null },
      { t: "OT", w: 12, v: (u) => u.ot || null },
      { t: "Folio cotización", w: 16, v: (u) => u.cotFolio || null },
      { t: "Monto cotización", w: 16, v: (u) => montoNum(u.cotMonto), f: '"$"#,##0.00', al: "center" },
      { t: "Fecha compromiso", w: 18, v: (u) => (u.fechaCompromiso ? enLocal(new Date(u.fechaCompromiso)) : null), f: FECHA_HORA, al: "center" },
    ] };
}

function estilo(cell, { fuente = {}, fondo, alinear = {}, borde = true, formato } = {}) {
  cell.font = { name: FUENTE, size: 10, color: { argb: C.tinta }, ...fuente };
  if (fondo) cell.fill = relleno(fondo);
  cell.alignment = { vertical: "middle", ...alinear };
  if (borde) cell.border = BORDES;
  if (formato) cell.numFmt = formato;
}

function encabezadoHoja(ws, wb, logo, { titulo, subtitulo, detalle }) {
  ws.getRow(1).height = 32; ws.getRow(2).height = 22; ws.getRow(3).height = 20;
  if (logo) {
    const id = wb.addImage(logo);
    ws.addImage(id, { tl: { col: 0, row: 0 }, ext: { width: 214, height: 85 } });
  }
  const t = ws.getCell("C1"); t.value = titulo; t.font = { name: FUENTE, size: 20, bold: true, color: { argb: C.navy } }; t.alignment = { vertical: "middle" };
  const s = ws.getCell("C2"); s.value = subtitulo; s.font = { name: FUENTE, size: 12, color: { argb: C.gris } }; s.alignment = { vertical: "middle" };
  const d = ws.getCell("C3"); d.value = detalle; d.font = { name: FUENTE, size: 10, italic: true, color: { argb: C.gris } }; d.alignment = { vertical: "middle" };
}

function configurarImpresion(ws, filasTitulo) {
  ws.pageSetup = { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true, printTitlesRow: filasTitulo, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.3, footer: 0.3 } };
  ws.headerFooter = { oddFooter: "&L&8Mantenimiento Idealease Oriente&C&8Estatus Unidades Camino Casa&R&8Página &P de &N" };
}

// ---------- filas de la hoja principal / entregadas ----------
function filasUnidades(talleres, entregadas, H, ahora, perfil) {
  perfil = perfil || perfilCasa(H);
  const dia0 = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const filas = [];
  talleres.forEach(({ taller, data }) => {
    const lista = entregadas
      ? [...data.historico].sort((x, y) => new Date(y.fechaSalida) - new Date(x.fechaSalida))
      : [...data.unidades].sort((x, y) => new Date(x.fechaIngreso) - new Date(y.fechaIngreso));
    lista.forEach((u) => {
      const et = perfil.etapas[u.etapaActual - 1];
      const t = H.tiemposPorEtapa(u);
      const abierta = (u.historial || []).find((h) => h.fin == null);
      const ultimo = [...(u.historial || [])].reverse().find((h) => h.comentario && !/^Salto de etapa aceptado/.test(h.comentario));
      const comentario = entregadas
        ? (ultimo ? ultimo.comentario : "")
        : [u.saltoPendiente ? `Pendiente de aceptar por ${et.rol}` : "", abierta && abierta.comentario ? abierta.comentario : ""].filter(Boolean).join(" · ");
      const ingreso = new Date(u.fechaIngreso);
      const fin = entregadas ? new Date(u.fechaSalida) : ahora;
      const cuandoISO = entregadas ? (ultimo && ultimo.fin) : (abierta && abierta.comentario && abierta.borradorEn) || (u.saltoPendiente && abierta ? abierta.inicio : null);
      filas.push({
        sucursal: taller.nombre, ingreso, vin: u.vin, cliente: u.cliente, status: entregadas ? "Disponible" : nombreCorto(et.nombre),
        cuando: cuandoISO && comentario ? new Date(cuandoISO) : null, comentario, dias: Math.round((dia0(fin) - dia0(ingreso)) / 86400000),
        responsable: entregadas ? "" : et.rol, fases: t.map((x) => (x.omitida ? "Omitida" : x.visitada ? r2(x.horas) : null)), salida: entregadas ? fin : null, u,
      });
    });
  });
  return filas;
}

function hojaUnidades(wb, H, talleres, entregadas, logo, ahora, op = {}) {
  const perfil = op.perfil || perfilCasa(H), NF = perfil.fases, nEx = perfil.extras.length;
  const ws = wb.addWorksheet(op.nombreHoja || perfil.hojas[entregadas ? 1 : 0], { properties: { tabColor: { argb: perfil.tab[entregadas ? 1 : 0] } } });
  const filas = filasUnidades(talleres, entregadas, H, ahora, perfil);
  const enc = ["Sucursal", "Fecha de Ingreso", "VIN", "Cliente", "Status Actual", "Fecha y Hora del último comentario de Status Actual", "Comentario de Status Actual", perfil.labelDias, "Responsable de Fase", ...perfil.extras.map((e) => e.t), ...NF, ...(entregadas ? ["Fecha Disponible"] : [])];
  const nCols = enc.length, C_FASE0 = 10 + nEx, C_SALIDA = C_FASE0 + NF.length;
  const R_GRUPO = 4, R_META = 5, R_ENC = 6, R0 = 7;
  [13, 18, 23, 28, 25, 22, 60, 14, 26, ...perfil.extras.map((e) => e.w), ...NF.map(() => 14), ...(entregadas ? [18] : [])].forEach((w, i) => (ws.getColumn(i + 1).width = w));

  encabezadoHoja(ws, wb, logo, {
    titulo: perfil.titulo,
    subtitulo: `${op.subtitulo || perfil.subt[entregadas ? 1 : 0]} · Mantenimiento Idealease Oriente`,
    detalle: `Generado: ${fmtFechaHora(ahora)} · ${filas.length} ${op.unidades || perfil.unid[entregadas ? 1 : 0]} · Sucursales: ${talleres.map((x) => x.taller.nombre).join(", ")}`,
  });

  // banda de grupos
  ws.getRow(R_GRUPO).height = 20;
  ws.mergeCells(R_GRUPO, 1, R_GRUPO, C_FASE0 - 1); ws.mergeCells(R_GRUPO, C_FASE0, R_GRUPO, C_FASE0 + NF.length - 1);
  ws.getCell(R_GRUPO, 1).value = "DATOS DE LA UNIDAD"; ws.getCell(R_GRUPO, C_FASE0).value = "TIEMPO EN CADA FASE (HORAS)";
  for (let c = 1; c <= nCols; c++) {
    const esFase = c >= C_FASE0 && c < C_SALIDA;
    estilo(ws.getCell(R_GRUPO, c), { fuente: { bold: true, size: 10, color: { argb: C.blanco } }, fondo: esFase ? C.azul : C.navy, alinear: { horizontal: "center" }, borde: false });
  }
  // fila de metas por fase
  ws.getRow(R_META).height = 16;
  ws.getCell(R_META, C_FASE0 - 1).value = "Meta por fase →"; estilo(ws.getCell(R_META, C_FASE0 - 1), { fuente: { italic: true, size: 9, color: { argb: C.gris } }, alinear: { horizontal: "right" }, borde: false });
  perfil.etapas.forEach((e, j) => { const c = ws.getCell(R_META, C_FASE0 + j); c.value = `${e.metaHrs} h`; estilo(c, { fuente: { italic: true, size: 9, color: { argb: C.gris } }, fondo: C.tinte, alinear: { horizontal: "center" }, borde: false }); });
  // encabezados
  ws.getRow(R_ENC).height = 44;
  enc.forEach((t, i) => {
    const c = ws.getCell(R_ENC, i + 1); c.value = t;
    const esFase = i + 1 >= C_FASE0 && i + 1 < C_SALIDA;
    estilo(c, { fuente: { bold: true, size: 10, color: { argb: C.blanco } }, fondo: esFase ? C.azul : C.navy, alinear: { horizontal: "center", wrapText: true } });
  });

  // datos
  if (filas.length === 0) {
    ws.mergeCells(R0, 1, R0, nCols);
    const c = ws.getCell(R0, 1); c.value = perfil.vacio[entregadas ? 1 : 0]; estilo(c, { fuente: { italic: true, color: { argb: C.gris } }, alinear: { horizontal: "center" } });
    ws.getRow(R0).height = 26;
  }
  filas.forEach((f, i) => {
    const r = R0 + i, zebra = i % 2 === 1 ? C.claro : undefined;
    const fila = ws.getRow(r);
    const val = [f.sucursal, enLocal(f.ingreso), f.vin, f.cliente, f.status, f.cuando ? enLocal(f.cuando) : null, f.comentario || null, null, f.responsable || null, ...perfil.extras.map((e) => e.v(f.u)), ...f.fases, ...(entregadas ? [enLocal(f.salida)] : [])];
    val.forEach((v, j) => { if (v !== null && v !== undefined) ws.getCell(r, j + 1).value = v; });
    ws.getCell(r, 8).value = { formula: entregadas ? `INT(${letra(C_SALIDA)}${r})-INT(B${r})` : `TODAY()-INT(B${r})`, result: f.dias };
    for (let c = 1; c <= nCols; c++) {
      const cell = ws.getCell(r, c);
      const base = { fondo: zebra };
      if (c === 1) estilo(cell, { ...base, fuente: { bold: true, color: { argb: C.navy } }, alinear: { indent: 1 } });
      else if (c === 2) estilo(cell, { ...base, alinear: { horizontal: "center" }, formato: FECHA_HORA });
      else if (c === 5) estilo(cell, { ...base, fuente: { bold: true, color: { argb: entregadas ? C.verde : C.navy } }, alinear: { indent: 1 } });
      else if (c === 6) estilo(cell, { ...base, alinear: { horizontal: "center" }, formato: FECHA_HORA });
      else if (c === 7) estilo(cell, { ...base, alinear: { wrapText: true, vertical: "middle", indent: 1 } });
      else if (c === 8) estilo(cell, { ...base, fuente: { bold: true, size: 11, color: { argb: C.navy } }, alinear: { horizontal: "center" }, formato: "0" });
      else if (c > 9 && c < C_FASE0) { const ex = perfil.extras[c - 10]; estilo(cell, { ...base, alinear: ex.al ? { horizontal: ex.al } : { indent: 1 }, formato: ex.f }); }
      else if (c >= C_FASE0 && c < C_SALIDA) estilo(cell, { ...base, alinear: { horizontal: "center" }, formato: '0.0" h"' });
      else if (c === C_SALIDA) estilo(cell, { ...base, alinear: { horizontal: "center" }, formato: FECHA_HORA });
      else estilo(cell, { ...base, alinear: { indent: 1 } });
    }
    const lineas = Math.max(1, Math.ceil((f.comentario || "").length / 66));
    fila.height = Math.max(24, 14 * lineas + 10);
  });

  // semáforo por fase: verde dentro de meta, ámbar hasta 1.5 veces la meta, rojo más de 1.5 veces; "Omitida" en gris
  if (filas.length > 0) {
    perfil.etapas.forEach((e, j) => {
      const col = letra(C_FASE0 + j), ref = `${col}${R0}:${col}${R0 + filas.length - 1}`, c0 = `${col}${R0}`, m = e.metaHrs;
      const fx = (formula, texto, fondo, extra = {}) => ({ type: "expression", formulae: [formula], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: fondo } }, font: { color: { argb: texto }, ...extra } } });
      ws.addConditionalFormatting({ ref, rules: [
        { ...fx(`AND(ISNUMBER(${c0}),${c0}<=${m})`, C.verde, C.verdeFondo), priority: 1 },
        { ...fx(`AND(ISNUMBER(${c0}),${c0}>${m},${c0}<=${m * 1.5})`, C.ambarTexto, C.ambarFondo), priority: 2 },
        { ...fx(`AND(ISNUMBER(${c0}),${c0}>${m * 1.5})`, C.rojo, C.rojoFondo, { bold: true }), priority: 3 },
        { type: "expression", formulae: [`${c0}="Omitida"`], style: { font: { color: { argb: C.gris }, italic: true } }, priority: 4 },
      ] });
    });
  }
  // leyenda
  const rl = R0 + Math.max(filas.length, 1) + 1;
  ws.mergeCells(rl, 1, rl, nCols);
  const lg = ws.getCell(rl, 1);
  lg.value = `Colores de las fases según la meta de cada una: verde = dentro de meta · ámbar = hasta 1.5 veces la meta · rojo = más de 1.5 veces. ${perfil.id === "foranea" ? "Las metas de este camino son un supuesto inicial por validar." : "Las metas por fase son valores iniciales de la aplicación."} ${perfil.labelDias} se recalcula al abrir el archivo.`;
  lg.font = { name: FUENTE, size: 9, italic: true, color: { argb: C.gris } }; lg.alignment = { wrapText: true, vertical: "middle" }; ws.getRow(rl).height = 26;

  ws.views = [{ state: "frozen", xSplit: 4, ySplit: R_ENC, showGridLines: false }];
  ws.autoFilter = { from: { row: R_ENC, column: 1 }, to: { row: R_ENC, column: nCols } };
  configurarImpresion(ws, `${R_GRUPO}:${R_ENC}`);
  return ws;
}

// ---------- Piso y Disponible: suma de tiempos por fase, con gráficas de pastel ----------
const COLORES_FASE = ["9FB7F0", "6F8FE0", "2563EB", "38BDF8", "D9722C", "1F2D6B", "1E7A46", "C88A00"];
function hojaPisoDisponible(wb, H, talleres, logo, ahora, perfilArg) {
  const perfil = perfilArg || perfilCasa(H), NF = perfil.fases, NOMBRE = perfil.pie, HP = perfil.hojas[0], HD = perfil.hojas[1], c0 = 10 + perfil.extras.length;
  const ws = wb.addWorksheet(NOMBRE, { properties: { tabColor: { argb: perfil.tab[2] } }, views: [{ showGridLines: false }] });
  const piso = filasUnidades(talleres, false, H, ahora, perfil), disp = filasUnidades(talleres, true, H, ahora, perfil);
  const suma = (filas, j) => r2(filas.reduce((a, f) => a + (typeof f.fases[j] === "number" ? f.fases[j] : 0), 0));
  const sPiso = NF.map((_, j) => suma(piso, j)), sDisp = NF.map((_, j) => suma(disp, j));
  const tPiso = r2(sPiso.reduce((a, b) => a + b, 0)), tDisp = r2(sDisp.reduce((a, b) => a + b, 0));
  const R0 = 7, finPiso = 6 + Math.max(piso.length, 1), finDisp = 6 + Math.max(disp.length, 1);
  [3, 28, 14, 12, 14, 12].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  encabezadoHoja(ws, wb, logo, { titulo: perfil.titulo, subtitulo: "Unidades en piso y disponibles · suma de tiempo por fase · Mantenimiento Idealease Oriente", detalle: `Generado: ${fmtFechaHora(ahora)} · Sucursales: ${talleres.map((x) => x.taller.nombre).join(", ")}` });
  for (let c = 1; c <= 18; c++) ws.getCell(4, c).fill = relleno(C.celeste);
  ws.getRow(4).height = 6;

  // unidades (con fórmula sobre las hojas de origen)
  const kpi = (fila, texto, formula, valor, color) => {
    ws.getRow(fila).height = 22;
    const t = ws.getCell(fila, 2); t.value = texto; estilo(t, { fuente: { bold: true, color: { argb: color } }, fondo: C.tinte, alinear: { indent: 1 } });
    const v = ws.getCell(fila, 3); v.value = { formula, result: valor }; estilo(v, { fuente: { bold: true, size: 12, color: { argb: color } }, fondo: C.tinte, alinear: { horizontal: "center" }, formato: "0" });
  };
  kpi(5, "Unidades en piso", `COUNTA('${HP}'!C${R0}:C${finPiso})`, piso.length, C.navy);
  kpi(6, "Unidades disponibles", `COUNTA('${HD}'!C${R0}:C${finDisp})`, disp.length, C.verde);

  // tabla (debajo de las gráficas)
  const R_ENC = 26, R_DATOS = R_ENC + 1, R_TOTAL = R_DATOS + NF.length;
  ws.getRow(R_ENC).height = 32;
  [["Fase", C.navy], ["En piso (h)", C.azul], ["% del total", C.azul], ["Disponibles (h)", C.verde], ["% del total", C.verde]].forEach(([t, f], i) => {
    const c = ws.getCell(R_ENC, i + 2); c.value = t; estilo(c, { fuente: { bold: true, color: { argb: C.blanco } }, fondo: f, alinear: { horizontal: "center", wrapText: true } });
  });
  NF.forEach((n, j) => {
    const r = R_DATOS + j, col = letra(c0 + j), zebra = j % 2 === 1 ? C.claro : undefined;
    ws.getRow(r).height = 22;
    estilo(ws.getCell(r, 1), { fondo: "FF" + perfil.colores[j], borde: false });
    const f = ws.getCell(r, 2); f.value = n; estilo(f, { fondo: zebra, fuente: { bold: true, color: { argb: C.navy } }, alinear: { indent: 1 } });
    const a = ws.getCell(r, 3); a.value = { formula: `SUM('${HP}'!${col}${R0}:${col}${finPiso})`, result: sPiso[j] }; estilo(a, { fondo: zebra, alinear: { horizontal: "center" }, formato: '0.0" h"' });
    const b = ws.getCell(r, 4); b.value = { formula: `IF(C$${R_TOTAL}=0,0,C${r}/C$${R_TOTAL})`, result: tPiso ? sPiso[j] / tPiso : 0 }; estilo(b, { fondo: zebra, alinear: { horizontal: "center" }, formato: "0.0%" });
    const d = ws.getCell(r, 5); d.value = { formula: `SUM('${HD}'!${col}${R0}:${col}${finDisp})`, result: sDisp[j] }; estilo(d, { fondo: zebra, alinear: { horizontal: "center" }, formato: '0.0" h"' });
    const e = ws.getCell(r, 6); e.value = { formula: `IF(E$${R_TOTAL}=0,0,E${r}/E$${R_TOTAL})`, result: tDisp ? sDisp[j] / tDisp : 0 }; estilo(e, { fondo: zebra, alinear: { horizontal: "center" }, formato: "0.0%" });
  });
  ws.getRow(R_TOTAL).height = 24;
  const tot = (c, formula, result, formato) => { const x = ws.getCell(R_TOTAL, c); x.value = { formula, result }; estilo(x, { fondo: C.tinte, fuente: { bold: true, color: { argb: C.navy } }, alinear: { horizontal: "center" }, formato, borde: true }); x.border = { ...BORDES, top: { style: "medium", color: { argb: C.navy } } }; };
  const tt = ws.getCell(R_TOTAL, 2); tt.value = "Total"; estilo(tt, { fondo: C.tinte, fuente: { bold: true, color: { argb: C.navy } }, alinear: { indent: 1 } }); tt.border = { ...BORDES, top: { style: "medium", color: { argb: C.navy } } };
  tot(3, `SUM(C${R_DATOS}:C${R_TOTAL - 1})`, tPiso, '0.0" h"'); tot(4, `SUM(D${R_DATOS}:D${R_TOTAL - 1})`, tPiso ? 1 : 0, "0.0%");
  tot(5, `SUM(E${R_DATOS}:E${R_TOTAL - 1})`, tDisp, '0.0" h"'); tot(6, `SUM(F${R_DATOS}:F${R_TOTAL - 1})`, tDisp ? 1 : 0, "0.0%");
  ws.mergeCells(R_TOTAL + 2, 2, R_TOTAL + 2, 18);
  const nota = ws.getCell(R_TOTAL + 2, 2);
  nota.value = `Suma de las horas que las unidades han pasado en cada fase. En piso incluye el tiempo transcurrido de la fase en curso. Los valores se calculan con las hojas ${HP} y ${HD}: si cambias esos datos, la tabla y las gráficas se actualizan.`;
  nota.font = { name: FUENTE, size: 9, italic: true, color: { argb: C.gris } }; nota.alignment = { wrapText: true, vertical: "middle" }; ws.getRow(R_TOTAL + 2).height = 26;

  // gráficas de pastel
  if (typeof ws.addChart === "function") {
    const colores = perfil.colores, cats = { ref: `'${NOMBRE}'!$B$${R_DATOS}:$B$${R_TOTAL - 1}`, valores: NF };
    ws.addChart({ titulo: "Unidades en piso: suma de tiempo por fase (horas)", serie: { ref: `'${NOMBRE}'!$C$${R_ENC}`, texto: "En piso (h)" }, categorias: cats, valores: { ref: `'${NOMBRE}'!$C$${R_DATOS}:$C$${R_TOTAL - 1}`, valores: sPiso }, colores, pos: { tl: { col: 0, row: 7 }, ext: { width: 600, height: 340 } } });
    ws.addChart({ titulo: "Unidades disponibles: suma de tiempo por fase (horas)", serie: { ref: `'${NOMBRE}'!$E$${R_ENC}`, texto: "Disponibles (h)" }, categorias: cats, valores: { ref: `'${NOMBRE}'!$E$${R_DATOS}:$E$${R_TOTAL - 1}`, valores: sDisp }, colores, pos: { tl: { col: 6, row: 7 }, ext: { width: 600, height: 340 } } });
  }
  configurarImpresion(ws, "4:6");
  return ws;
}

// ---------- Detalle por Unidad: bitácora de cada ingreso, etapa por etapa (Casa y Foránea / Sitio) ----------
function datosCapturados(u, etapa, H) {
  const t = (a, b) => (b ? `${a}: ${b}` : null);
  let p = [];
  if (u.camino === "foranea") {
    const lugar = H.lugarDef(u.lugarTipo);
    if (etapa === 1) p = [u.lugarNombre ? `${lugar.label}: ${u.lugarNombre}${u.ciudad ? ` (${u.ciudad})` : ""}` : null, t("OT", u.ot), t("Motivo de ingreso", u.motivoIngreso), t("Contacto", u.contacto)];
    else if (etapa === 2) p = [t("Diagnóstico", u.diagnostico)];
    else if (etapa === 3) p = [t("Folio de cotización", u.cotFolio), u.cotMonto ? `Monto: $${u.cotMonto}` : null, t("Autorizó", u.cotAutorizo), t("Seguimiento", u.cotNota)];
    else if (etapa === 4) p = [u.fechaCompromiso ? `Compromiso de entrega: ${fmtFechaHora(new Date(u.fechaCompromiso))}` : null, t("Notas", u.notaAutorizada)];
    else if (etapa === 5) p = [t("Reparación", u.reparacion)];
    else if (etapa === 6) p = [u.validada ? "Unidad probada y lista para el cliente" : null, t("Comentarios de entrega", u.obsDisponible)];
    return p.filter(Boolean).join(" · ");
  }
  const cl = (H.COLOR_TIPO_OPCIONES || []).find((o) => o.id === u.colorTipo);
  if (etapa === 1) p = [t("Placa", u.placa)];
  else if (etapa === 2) p = [t("OT", u.ot), t("Motivo de ingreso", u.motivoIngreso), cl ? `Clasificación: ${cl.label}` : null];
  else if (etapa === 3) p = [1, 2, 3].map((i) => (u[`tecnico${i}`] ? `Técnico ${i}: ${u[`tecnico${i}`]}${u[`trabajo${i}`] ? ` (${u[`trabajo${i}`]})` : ""}` : null)).concat([t("Comentarios de la asignación", u.obsAsignacion)]);
  else if (etapa === 4) p = [t("Diagnóstico", u.diagnostico), u.tot ? "TOT: Sí" : null];
  else if (etapa === 5) p = [u.surtidoCompleto === true ? "Surtido completo" : u.surtidoCompleto === false ? `Surtido incompleto${u.pendienteSurtido ? `: ${u.pendienteSurtido}` : ""}` : null];
  else if (etapa === 6) p = [t("Reparación", u.reparacion), u.tot ? "TOT: Sí" : null];
  else if (etapa === 7) p = [u.auditoriaTaller ? "Auditoría de taller: realizada" : null, t("Comentarios de la auditoría", u.obsTaller)];
  else if (etapa === 8) p = [u.auditoriaServicio ? "Auditoría de Servicio: realizada" : null, t("Comentarios de Servicio", u.obsServicio)];
  return p.filter(Boolean).join(" · ");
}

function hojaDetalle(wb, H, talleres, talleresF, logo, ahora) {
  const ws = wb.addWorksheet("Detalle por Unidad", { properties: { tabColor: { argb: C.azul } } });
  const enc = ["Sucursal", "Camino", "VIN", "Cliente", "Placa", "OT", "Clasificación / Lugar", "TOT", "Estatus de la unidad", "Fecha de Ingreso", "Etapa #", "Etapa", "Responsable", "Inicio de la etapa", "Fin de la etapa", "Horas en la etapa", "Movimiento", "Comentario de la etapa", "Datos capturados en la etapa"];
  const nCols = enc.length, R_GRUPO = 4, R_NOTA = 5, R_ENC = 6, R0 = 7;
  [13, 15, 23, 26, 12, 12, 26, 7, 14, 18, 8, 24, 25, 18, 18, 11, 19, 60, 72].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  const desc = (a, b) => new Date(b.u.fechaIngreso) - new Date(a.u.fechaIngreso);
  const unidades = [];
  talleres.forEach(({ taller, data }) => {
    [...data.unidades.map((u) => ({ u, fin: false })), ...data.historico.map((u) => ({ u, fin: true }))].sort(desc).forEach((x) => unidades.push({ taller, camino: "casa", ...x }));
    const f = (talleresF.find((t) => t.taller.id === taller.id) || { data: { unidades: [], historico: [] } }).data;
    [...f.unidades.map((u) => ({ u, fin: false })), ...f.historico.map((u) => ({ u, fin: true }))].sort(desc).forEach((x) => unidades.push({ taller, camino: "foranea", ...x }));
  });
  const nEventos = unidades.reduce((a, x) => a + (x.u.historial || []).length, 0), nF = unidades.filter((x) => x.camino === "foranea").length;
  encabezadoHoja(ws, wb, logo, { titulo: "Estatus Unidades Camino Casa y Foránea / Sitio", subtitulo: "Detalle por unidad: bitácora de cada ingreso, etapa por etapa · Mantenimiento Idealease Oriente",
    detalle: `Generado: ${fmtFechaHora(ahora)} · ${unidades.length} unidades (${unidades.length - nF} Casa · ${nF} Foránea / Sitio) · ${nEventos} movimientos · Sucursales: ${talleres.map((x) => x.taller.nombre).join(", ")}` });

  ws.getRow(R_GRUPO).height = 20;
  [[1, 10, "UNIDAD", C.navy], [11, 17, "ETAPA", C.azul], [18, 19, "DETALLE", C.navy]].forEach(([a, b, t, f]) => {
    ws.mergeCells(R_GRUPO, a, R_GRUPO, b); ws.getCell(R_GRUPO, a).value = t;
    for (let c = a; c <= b; c++) estilo(ws.getCell(R_GRUPO, c), { fuente: { bold: true, color: { argb: C.blanco } }, fondo: f, alinear: { horizontal: "center" }, borde: false });
  });
  ws.mergeCells(R_NOTA, 1, R_NOTA, nCols);
  const nota = ws.getCell(R_NOTA, 1);
  nota.value = "Cada fila es una etapa que cursó la unidad, en orden cronológico (Camino Casa: 8 etapas; Foránea / Sitio: 6 etapas). Las horas se pintan contra la meta de la etapa: verde dentro de meta, ámbar hasta 1.5 veces, rojo más de 1.5 veces. Los datos capturados se muestran en la última pasada de cada etapa.";
  nota.font = { name: FUENTE, size: 9, italic: true, color: { argb: C.gris } }; nota.alignment = { vertical: "middle", wrapText: true }; ws.getRow(R_NOTA).height = 26;
  ws.getRow(R_ENC).height = 36;
  enc.forEach((t, i) => { const c = ws.getCell(R_ENC, i + 1); c.value = t; estilo(c, { fuente: { bold: true, color: { argb: C.blanco } }, fondo: i >= 10 && i <= 16 ? C.azul : C.navy, alinear: { horizontal: "center", wrapText: true } }); });

  let r = R0, k = 0;
  const lineaMarca = { style: "thin", color: { argb: C.navy } };
  unidades.forEach(({ taller, camino, u, fin: validada }) => {
    const foranea = camino === "foranea", ETS = foranea ? H.ETAPAS_FORANEA : H.ETAPAS;
    const cl = (H.COLOR_TIPO_OPCIONES || []).find((o) => o.id === u.colorTipo);
    const clasif = foranea ? `${H.lugarDef(u.lugarTipo).label}${u.lugarNombre ? `: ${u.lugarNombre}` : ""}${u.ciudad ? ` (${u.ciudad})` : ""}` : (cl ? cl.label : null);
    const hist = u.historial || [];
    const ultimaPasada = {};
    hist.forEach((h, i) => { if (h.comentario !== "Etapa omitida" && !/^Salto de etapa aceptado/.test(h.comentario || "")) ultimaPasada[h.etapa] = i; });
    let previa = null;
    const fondo = k % 2 === 1 ? C.claro : undefined;
    hist.forEach((h, i) => {
      const et = ETS[h.etapa - 1], omitida = h.comentario === "Etapa omitida", acepta = /^Salto de etapa aceptado/.test(h.comentario || "");
      let mov = "Avance";
      if (omitida) mov = "Etapa omitida"; else if (acepta) mov = "Aceptación de salto";
      else { if (previa === null) mov = "Ingreso"; else if (h.etapa < previa) mov = "Regreso"; previa = h.etapa; }
      const abierta = h.fin == null, horas = r2(H.hoursBetween(h.inicio, h.fin || ahora.toISOString()));
      const comentario = h.comentario ? h.comentario + (h.borrador && abierta ? " (borrador)" : "") : null;
      const datos = ultimaPasada[h.etapa] === i ? datosCapturados(u, h.etapa, H) : "";
      const val = [taller.nombre, foranea ? "Foránea / Sitio" : "Casa", u.vin, u.cliente, u.placa || null, u.ot || null, clasif, foranea ? "N/A" : (u.tot ? "Sí" : "No"), validada ? "Disponible" : "En piso", enLocal(new Date(u.fechaIngreso)), h.etapa, nombreCorto(et.nombre), et.rol,
        enLocal(new Date(h.inicio)), abierta ? "En curso" : enLocal(new Date(h.fin)), horas, mov, comentario, datos || null];
      val.forEach((v, j) => { if (v !== null && v !== undefined) ws.getCell(r, j + 1).value = v; });
      for (let c = 1; c <= nCols; c++) {
        const cell = ws.getCell(r, c), base = { fondo };
        if (c === 1) estilo(cell, { ...base, fuente: { bold: true, color: { argb: C.navy } }, alinear: { indent: 1 } });
        else if (c === 2) estilo(cell, { ...base, fuente: { bold: true, color: { argb: foranea ? MORADO : C.azul } }, alinear: { horizontal: "center" } });
        else if (c === 3) estilo(cell, { ...base, fuente: { bold: i === 0, color: { argb: C.navy } }, alinear: { indent: 1 } });
        else if (c === 8 || c === 11) estilo(cell, { ...base, alinear: { horizontal: "center" } });
        else if (c === 9) estilo(cell, { ...base, fuente: { bold: true, color: { argb: validada ? C.verde : C.navy } }, alinear: { horizontal: "center" } });
        else if (c === 10 || c === 14) estilo(cell, { ...base, alinear: { horizontal: "center" }, formato: FECHA_HORA });
        else if (c === 15) estilo(cell, { ...base, alinear: { horizontal: "center" }, formato: FECHA_HORA, fuente: { italic: abierta, color: { argb: abierta ? C.azul : C.tinta } } });
        else if (c === 16) {
          let f = fondo, col = C.tinta, b = false;
          if (!omitida && !acepta) { const m = et.metaHrs; if (horas <= m) { f = C.verdeFondo; col = C.verde; } else if (horas <= m * 1.5) { f = C.ambarFondo; col = C.ambarTexto; } else { f = C.rojoFondo; col = C.rojo; b = true; } }
          estilo(cell, { fondo: f, fuente: { bold: b, color: { argb: col } }, alinear: { horizontal: "center" }, formato: '0.0" h"' });
        }
        else if (c === 17) estilo(cell, { ...base, fuente: { bold: mov === "Regreso", italic: omitida || acepta, color: { argb: mov === "Regreso" ? C.rojo : omitida || acepta ? C.gris : C.tinta } }, alinear: { horizontal: "center" } });
        else if (c === 18 || c === 19) estilo(cell, { ...base, alinear: { wrapText: true, vertical: "middle", indent: 1 } });
        else estilo(cell, { ...base, alinear: { indent: 1 } });
        if (i === 0) cell.border = { ...BORDES, top: lineaMarca };
      }
      const lineas = Math.max(1, Math.ceil(((comentario || "").length) / 66), Math.ceil((datos || "").length / 82));
      ws.getRow(r).height = Math.max(22, 14 * lineas + 8);
      r++;
    });
    k++;
  });
  if (unidades.length === 0) { ws.mergeCells(R0, 1, R0, nCols); const c = ws.getCell(R0, 1); c.value = "Todavía no hay unidades registradas."; estilo(c, { fuente: { italic: true, color: { argb: C.gris } }, alinear: { horizontal: "center" } }); r = R0 + 1; }
  ws.views = [{ state: "frozen", xSplit: 3, ySplit: R_ENC, showGridLines: false }];
  ws.autoFilter = { from: { row: R_ENC, column: 1 }, to: { row: R_ENC, column: nCols } };
  configurarImpresion(ws, `${R_GRUPO}:${R_ENC}`);
  return ws;
}

// ---------- resumen ejecutivo: Casa y Foránea / Sitio ----------
function hojaResumen(wb, H, talleres, talleresF, logo, ahora) {
  const ws = wb.addWorksheet("Resumen", { properties: { tabColor: { argb: C.azul } }, views: [{ showGridLines: false }] });
  [16, 16, 12, 10, 10, 12, 30, 16, 16, 16].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  encabezadoHoja(ws, wb, logo, { titulo: "Estatus Unidades Camino Casa y Foránea / Sitio", subtitulo: "Resumen ejecutivo por sucursal · Mantenimiento Idealease Oriente", detalle: `Generado: ${fmtFechaHora(ahora)}` });
  const R_ENC = 5;
  ws.getRow(4).height = 6;
  for (let c = 1; c <= 10; c++) ws.getCell(4, c).fill = relleno(C.celeste);
  const fondoEnc = { "En tiempo": C.verde, "Alerta": C.ambar, "Crítico": C.rojo };
  const tabla = (r0, aoa) => {
    const iEnc = aoa.findIndex((x) => x[0] === "Taller"), enc = aoa[iEnc], filas = aoa.slice(iEnc + 1);
    ws.getRow(r0).height = 40;
    enc.forEach((t, i) => { const c = ws.getCell(r0, i + 1); c.value = t; estilo(c, { fuente: { bold: true, color: { argb: C.blanco } }, fondo: fondoEnc[t] || C.navy, alinear: { horizontal: "center", wrapText: true } }); });
    filas.forEach((f, i) => {
      const r = r0 + 1 + i, esTotal = f[0] === "Total", zebra = esTotal ? C.tinte : i % 2 === 1 ? C.claro : undefined;
      f.forEach((v, j) => {
        const c = ws.getCell(r, j + 1); if (v !== null && v !== undefined && v !== "") c.value = v;
        estilo(c, { fondo: zebra, fuente: { bold: esTotal || j === 0, color: { argb: j === 0 || esTotal ? C.navy : C.tinta } }, alinear: { horizontal: j === 0 || j === 6 ? "left" : "center" } });
        if (esTotal) c.border = { ...BORDES, top: { style: "medium", color: { argb: C.navy } } };
      });
      ws.getRow(r).height = 22;
    });
    return r0 + filas.length;
  };
  const fin1 = tabla(R_ENC, H.resumenAoa(talleres));
  // bloque del camino Foránea / Sitio
  const rF = fin1 + 3;
  ws.mergeCells(rF - 1, 1, rF - 1, 10);
  const et = ws.getCell(rF - 1, 1); et.value = "CAMINO FORÁNEA / SITIO · unidades atendidas en agencia o en el sitio del cliente";
  for (let c = 1; c <= 10; c++) estilo(ws.getCell(rF - 1, c), { fuente: { bold: true, color: { argb: C.blanco } }, fondo: MORADO, alinear: { horizontal: "left", indent: 1 }, borde: false });
  ws.getRow(rF - 1).height = 22;
  tabla(rF, H.resumenAoa(talleresF, H.ETAPAS_FORANEA, "Resumen ejecutivo · Camino Foránea / Sitio"));
  ws.views = [{ state: "frozen", ySplit: R_ENC, showGridLines: false }];
  configurarImpresion(ws, `${R_ENC}:${R_ENC}`);
}

// ---------- tendencias (Casa y Foránea / Sitio) ----------
function hojaTendencia(wb, H, talleres, talleresF, modo, nombre, logo, ahora) {
  const ws = wb.addWorksheet(nombre, { properties: { tabColor: { argb: C.celeste } }, views: [{ showGridLines: false }] });
  const cubos = H.cubosTendencia(modo, ahora);
  const nCol = 1 + talleres.length * 2 + 2;
  for (let i = 0; i < nCol; i++) ws.getColumn(i + 1).width = i === 0 ? 16 : 15;
  encabezadoHoja(ws, wb, logo, { titulo: "Estatus Unidades Camino Casa y Foránea / Sitio", subtitulo: `Tendencia: ingresan contra entregan · ${modo === "dias" ? "últimos 7 días" : "últimas 4 semanas (de lunes a domingo)"}`, detalle: `Generado: ${fmtFechaHora(ahora)} · Sucursales: ${talleres.map((x) => x.taller.nombre).join(", ")}` });
  const R_ENC = 5;
  ws.getRow(4).height = 6;
  for (let c = 1; c <= nCol; c++) ws.getCell(4, c).fill = relleno(C.celeste);
  const tabla = (r0, lista) => {
    const porTaller = lista.map(({ data }) => H.contarTendencia(cubos, data.unidades, data.historico));
    const enc = ["Periodo", ...lista.flatMap(({ taller }) => [`Ingresan ${taller.nombre}`, `Entregan ${taller.nombre}`]), "Total ingresan", "Total entregan"];
    ws.getRow(r0).height = 40;
    enc.forEach((t, i) => {
      const c = ws.getCell(r0, i + 1); c.value = t;
      const fondo = /^Ingresan/.test(t) ? C.azul : /^Entregan/.test(t) ? C.verde : C.navy;
      estilo(c, { fuente: { bold: true, color: { argb: C.blanco } }, fondo, alinear: { horizontal: "center", wrapText: true } });
    });
    cubos.forEach((cb, i) => {
      const r = r0 + 1 + i, zebra = i % 2 === 1 ? C.claro : undefined;
      const fila = [cb.label]; let ti = 0, te = 0;
      porTaller.forEach((pt) => { fila.push(pt[i].ingresan, pt[i].entregan); ti += pt[i].ingresan; te += pt[i].entregan; });
      fila.push(ti, te);
      fila.forEach((v, j) => { const c = ws.getCell(r, j + 1); c.value = v; estilo(c, { fondo: zebra, fuente: { bold: j === 0 || j >= fila.length - 2, color: { argb: j === 0 ? C.navy : C.tinta } }, alinear: { horizontal: j === 0 ? "left" : "center" } }); });
      ws.getRow(r).height = 22;
    });
    return r0 + cubos.length;
  };
  const fin1 = tabla(R_ENC, talleres);
  const rF = fin1 + 3;
  ws.mergeCells(rF - 1, 1, rF - 1, nCol);
  ws.getCell(rF - 1, 1).value = "CAMINO FORÁNEA / SITIO";
  for (let c = 1; c <= nCol; c++) estilo(ws.getCell(rF - 1, c), { fuente: { bold: true, color: { argb: C.blanco } }, fondo: MORADO, alinear: { horizontal: "left", indent: 1 }, borde: false });
  ws.getRow(rF - 1).height = 22;
  tabla(rF, talleresF);
  ws.views = [{ state: "frozen", ySplit: R_ENC, xSplit: 1, showGridLines: false }];
  configurarImpresion(ws, `${R_ENC}:${R_ENC}`);
}

// Si no se pasan unidades foráneas, se arma el camino vacío para que el archivo conserve siempre las mismas pestañas
const sinForaneas = (talleres) => talleres.map(({ taller }) => ({ taller, data: { unidades: [], historico: [] } }));

// Histórico de unidades validadas (disponibles) de todas las sucursales, con el mismo formato del Reporte de Piso
async function construirLibroHistorico(ExcelJS, talleres, H, { logo, ahora = new Date(), talleresF = [] } = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Estatus Unidades Camino Casa"; wb.company = "Mantenimiento Idealease Oriente"; wb.title = "Histórico de unidades validadas"; wb.created = ahora;
  const tf = talleresF.length ? talleresF : sinForaneas(talleres);
  hojaUnidades(wb, H, talleres, true, logo, ahora, { nombreHoja: "Histórico Validadas", subtitulo: "Histórico de unidades validadas", unidades: "unidades validadas" });
  hojaUnidades(wb, H, tf, true, logo, ahora, { perfil: perfilForanea(H), nombreHoja: "Histórico Foránea", subtitulo: "Histórico de unidades foráneas validadas", unidades: "unidades foráneas validadas" });
  return wb;
}

async function construirLibroEstilizado(ExcelJS, talleres, H, { logo, ahora = new Date(), talleresF = [] } = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Estatus Unidades Camino Casa"; wb.company = "Mantenimiento Idealease Oriente"; wb.title = "Estatus Unidades Camino Casa y Foránea / Sitio"; wb.created = ahora;
  const tf = talleresF.length ? talleresF : sinForaneas(talleres), pf = perfilForanea(H);
  hojaUnidades(wb, H, talleres, false, logo, ahora);
  hojaUnidades(wb, H, talleres, true, logo, ahora);
  hojaPisoDisponible(wb, H, talleres, logo, ahora);
  hojaUnidades(wb, H, tf, false, logo, ahora, { perfil: pf });
  hojaUnidades(wb, H, tf, true, logo, ahora, { perfil: pf });
  hojaPisoDisponible(wb, H, tf, logo, ahora, pf);
  hojaDetalle(wb, H, talleres, tf, logo, ahora);
  hojaResumen(wb, H, talleres, tf, logo, ahora);
  hojaTendencia(wb, H, talleres, tf, "dias", "Tendencia 7 días", logo, ahora);
  hojaTendencia(wb, H, talleres, tf, "semanas", "Tendencia 4 semanas", logo, ahora);
  return wb;
}

return { MiniExcel, construirLibroEstilizado, construirLibroHistorico };
})();

async function construirReportePisoBytes(talleres, ahora = new Date(), tipo = "reporte", talleresF = []) {
  const logo = { buffer: Uint8Array.from(atob(LOGO_IDO360_B64), (c) => c.charCodeAt(0)), extension: "png" };
  const H = { ETAPAS, ETAPAS_FORANEA, tiemposPorEtapa, resumenAoa, cubosTendencia, contarTendencia, COLOR_TIPO_OPCIONES, hoursBetween, lugarDef };
  const construir = tipo === "historico" ? REPORTE_XLSX.construirLibroHistorico : REPORTE_XLSX.construirLibroEstilizado;
  const wb = await construir(REPORTE_XLSX.MiniExcel, talleres, H, { logo, ahora, talleresF });
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

// Versión sencilla (sin logo ni colores) del histórico, solo como respaldo
function construirLibroHistoricoSencillo(talleres, talleresF = []) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, hojaUnidadesTaller(talleres, true), "Histórico Validadas");
  if (talleresF.length) XLSX.utils.book_append_sheet(wb, hojaForaneas(talleresF, true), "Histórico Foránea");
  return wb;
}

// Descarga el Excel con diseño (tipo "reporte" = Reporte de Piso, "historico" = unidades validadas);
// si algo falla, baja la versión sencilla (sin logo ni colores)
async function descargarReportePiso(talleres, nombreArchivo, tipo = "reporte", talleresF = []) {
  let bytes;
  try { bytes = await construirReportePisoBytes(talleres, new Date(), tipo, talleresF); }
  catch (e) { await cargarXLSX(); XLSX.writeFile(tipo === "historico" ? construirLibroHistoricoSencillo(talleres, talleresF) : construirLibro(talleres, talleresF), nombreArchivo); return "sencillo"; }
  const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = nombreArchivo; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return "diseño";
}
// <<REPORTE_XLSX:FIN>>

function hojaForaneas(talleres, entregadas = false) {
  const FASES = ETAPAS_FORANEA.map((e) => e.nombre);
  const enc = ["Sucursal", "Fecha de Ingreso", "VIN", "Cliente", "Placa", "Tipo de lugar", "Agencia / Sitio", "Ciudad", "OT", "Status Actual", "Comentario de Status Actual", "Días fuera", "Folio cotización", "Monto cotización", "Autorizó", "Fecha compromiso", ...FASES, ...(entregadas ? ["Fecha Disponible"] : [])];
  const C0 = 16;
  const hoy = new Date();
  const dia0 = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const filas = [];
  talleres.forEach(({ taller, data }) => {
    const lista = entregadas
      ? [...data.historico].sort((x, y) => new Date(y.fechaSalida) - new Date(x.fechaSalida))
      : [...data.unidades].sort((x, y) => new Date(x.fechaIngreso) - new Date(y.fechaIngreso));
    lista.forEach((u) => {
      const et = ETAPAS_FORANEA[u.etapaActual - 1];
      const t = tiemposPorEtapa(u);
      const abierta = (u.historial || []).find((h) => h.fin == null);
      const ultimo = [...(u.historial || [])].reverse().find((h) => h.comentario && h.comentario !== "Etapa omitida");
      const comentario = entregadas ? (ultimo ? ultimo.comentario : "") : (abierta && abierta.comentario) || "";
      const ingreso = new Date(u.fechaIngreso);
      const fin = entregadas ? new Date(u.fechaSalida) : hoy;
      const monto = parseFloat(String(u.cotMonto || "").replace(/[^0-9.]/g, ""));
      filas.push([taller.nombre, ingreso, u.vin, u.cliente, u.placa || null, lugarDef(u.lugarTipo).label, u.lugarNombre || null, u.ciudad || null, u.ot || null,
        entregadas ? "Disponible" : et.nombre, comentario || null, Math.round((dia0(fin) - dia0(ingreso)) / 86400000),
        u.cotFolio || null, isNaN(monto) ? null : monto, u.cotAutorizo || null, u.fechaCompromiso ? new Date(u.fechaCompromiso) : null,
        ...t.map((x) => (x.omitida ? "Omitida" : x.visitada ? r2(x.horas) : null)), ...(entregadas ? [fin] : [])]);
    });
  });
  const ws = XLSX.utils.aoa_to_sheet([enc, ...filas], { cellDates: true });
  const col = (c) => XLSX.utils.encode_col(c);
  filas.forEach((_, i) => {
    const r = i + 2;
    [1, 15, ...(entregadas ? [C0 + FASES.length] : [])].forEach((c) => { const cell = ws[`${col(c)}${r}`]; if (cell && cell.t === "d") cell.z = "dd/mm/yyyy hh:mm"; });
    const m = ws[`${col(13)}${r}`]; if (m && m.t === "n") m.z = '"$"#,##0.00';
    for (let c = C0; c < C0 + FASES.length; c++) { const cell = ws[`${col(c)}${r}`]; if (cell && cell.t === "n") cell.z = '0.0" h"'; }
  });
  ws["!cols"] = [12, 17, 20, 26, 12, 13, 26, 14, 12, 26, 50, 10, 14, 14, 18, 17, ...FASES.map(() => 14), ...(entregadas ? [17] : [])].map((wch) => ({ wch }));
  ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: filas.length, c: enc.length - 1 } }) };
  return ws;
}

function construirLibro(talleres, talleresF = []) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, hojaUnidadesTaller(talleres), "Reporte Piso");
  XLSX.utils.book_append_sheet(wb, hojaUnidadesTaller(talleres, true), "Entregadas");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumenAoa(talleres)), "Resumen");
  if (talleresF.length) {
    XLSX.utils.book_append_sheet(wb, hojaForaneas(talleresF), "Foráneas en proceso");
    XLSX.utils.book_append_sheet(wb, hojaForaneas(talleresF, true), "Foráneas entregadas");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumenAoa(talleresF, ETAPAS_FORANEA, "Resumen ejecutivo · Camino Foránea / Sitio")), "Resumen Foráneas");
  }


  [["dias", "Tendencia 7 días"], ["semanas", "Tendencia 4 semanas"]].forEach(([modo, nombre]) => {
    const cubos = cubosTendencia(modo);
    const cab = ["Periodo"];
    talleres.forEach(({ taller }) => cab.push(`Ingresan ${taller.nombre}`, `Entregan ${taller.nombre}`));
    cab.push("Total ingresan", "Total entregan");
    const porTaller = talleres.map(({ data }) => contarTendencia(cubos, data.unidades, data.historico));
    const filas = [cab];
    cubos.forEach((c, i) => {
      const fila = [c.label];
      let ti = 0, te = 0;
      porTaller.forEach((pt) => { fila.push(pt[i].ingresan, pt[i].entregan); ti += pt[i].ingresan; te += pt[i].entregan; });
      fila.push(ti, te);
      filas.push(fila);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(filas), nombre);
  });

  return wb;
}

// ---- Unidades de ejemplo con tiempos realistas (relativos a "ahora") ----



function ResumenCard({ label, valor }) {
  return (
    <div style={{ border: `1px solid ${BORDER}`, borderRadius: 6, padding: "4px 6px", background: WHITE }}>
      <div style={{ color: GRAY, fontSize: 7.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.1, lineHeight: 1.15 }}>{label}</div>
      <div style={{ color: BLUE, fontSize: 12, fontWeight: 700, marginTop: 1 }}>{valor}</div>
    </div>
  );
}

function TruckIcon({ color, size = 34 }) {
  return (
    <svg width={size} height={size * 0.6} viewBox="0 0 64 40" style={{ display: "block" }}>
      <rect x="1" y="14" width="34" height="16" rx="1.5" fill={color} />
      <path d="M35 18 H50 L59 26 V30 H35 Z" fill={color} />
      <rect x="39" y="21" width="9" height="7" fill={WHITE} opacity="0.9" />
      <circle cx="14" cy="32" r="6" fill={BLUE_DARK} />
      <circle cx="14" cy="32" r="2.4" fill={WHITE} />
      <circle cx="49" cy="32" r="6" fill={BLUE_DARK} />
      <circle cx="49" cy="32" r="2.4" fill={WHITE} />
    </svg>
  );
}

function CaminoUnidad({ etapaActual, colorEstatus, colorCarrito, tiempoLabel, comentario, saltoPendiente, etapas = ETAPAS }) {
  const n = etapas.length;
  const posIdx = Math.min(etapaActual, n) - 1;
  const pct = n === 1 ? 0 : (posIdx / (n - 1)) * 100;
  return (
    <div style={{ padding: "6px 6px 2px" }}>
      <style>{`@keyframes pulsoPendiente { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.45; transform: scale(1.08); } }`}</style>
      <div style={{ position: "relative", height: 68, marginBottom: 6 }}>
        <div style={{ position: "absolute", top: 48, left: "4%", right: "4%", height: 4, borderRadius: 2, background: `repeating-linear-gradient(to right, ${BORDER} 0 8px, transparent 8px 14px)` }} />
        <div style={{ position: "absolute", top: 48, left: "4%", width: `calc(${pct}% * 0.92)`, height: 4, borderRadius: 2, background: BLUE_SOFT, transition: "width 0.4s ease" }} />
        <div title={comentario || "Sin comentarios aún"} style={{ position: "absolute", top: 0, left: `calc(4% + ${pct}% * 0.92)`, transform: "translateX(-50%)", transition: "left 0.4s ease", display: "flex", flexDirection: "column", alignItems: "center", cursor: "help" }}>
          {saltoPendiente && (
            <div style={{ fontSize: 9, fontWeight: 700, color: WHITE, background: AMBER, borderRadius: 999, padding: "1px 6px", marginBottom: 2, whiteSpace: "nowrap", animation: "pulsoPendiente 1.1s ease-in-out infinite" }}>
              ⏳ Pendiente aceptar
            </div>
          )}
          {tiempoLabel && <div style={{ fontSize: 9, fontWeight: 700, color: colorEstatus, background: WHITE, border: `1px solid ${colorEstatus}`, borderRadius: 999, padding: "1px 5px", marginBottom: 1, whiteSpace: "nowrap" }}>{tiempoLabel}</div>}
          <div style={saltoPendiente ? { border: `2px dashed ${AMBER}`, borderRadius: 999, padding: 3, animation: "pulsoPendiente 1.1s ease-in-out infinite" } : { padding: 3 }}>
            <TruckIcon color={saltoPendiente ? GRAY : colorCarrito} size={52} />
          </div>
        </div>
        {etapas.map((e, i) => {
          const p = n === 1 ? 0 : (i / (n - 1)) * 100;
          const alcanzada = e.id <= Math.min(etapaActual, n);
          return <div key={e.id} title={e.nombre} style={{ position: "absolute", top: 44, left: `calc(4% + ${p}% * 0.92)`, transform: "translateX(-50%)", width: 11, height: 11, borderRadius: "50%", background: alcanzada ? BLUE_SOFT : WHITE, border: `2px solid ${alcanzada ? BLUE_SOFT : BORDER}` }} />;
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", padding: "0 2%" }}>
        {etapas.map((e) => <div key={e.id} style={{ flex: 1, textAlign: "center", fontSize: 9, lineHeight: 1.15, color: e.id === Math.min(etapaActual, n) ? BLUE : GRAY, fontWeight: e.id === Math.min(etapaActual, n) ? 700 : 500 }}>{e.nombre}</div>)}
      </div>
    </div>
  );
}

const inputStyle = { border: `1px solid ${BORDER}`, borderRadius: 6, padding: "8px 10px", fontSize: 13, color: BLUE_DARK, fontFamily: "inherit", width: "100%", boxSizing: "border-box" };
const btnPrimary = { background: BLUE, color: WHITE, border: "none", borderRadius: 6, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const btnSecondary = { background: WHITE, color: BLUE, border: `1px solid ${BORDER}`, borderRadius: 6, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const btnWarn = { background: WHITE, color: RED, border: `1px solid ${RED}`, borderRadius: 6, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
function BotonBorrador({ unidad, onGuardar, armar }) {
  const [estado, setEstado] = useState(null); // null | "guardando" | "error"
  const previo = borradorDe(unidad);
  async function guardar() {
    setEstado("guardando");
    const ok = await onGuardar(armar());
    setEstado(ok === false ? "error" : null);
  }
  const hora = previo ? new Date(previo.borradorEn).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }) : null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", borderTop: `1px dashed ${BORDER}`, paddingTop: 8, marginTop: 4 }}>
      <button type="button" onClick={guardar} disabled={estado === "guardando"} title="Guarda lo capturado sin cambiar de etapa. El tiempo de la etapa sigue corriendo." style={{ ...btnSecondary, borderStyle: "dashed" }}>
        {estado === "guardando" ? "Guardando…" : previo ? "Actualizar comentarios" : "Guardar borrador"}
      </button>
      <span style={{ fontSize: 12, color: estado === "error" ? RED : GRAY }}>
        {estado === "error" ? "No se pudo guardar el borrador" : hora ? `Borrador guardado a las ${hora} · sigue en esta etapa` : "No cambia de etapa"}
      </span>
    </div>
  );
}
function Bloque({ children }) { return <div style={{ display: "flex", flexDirection: "column", gap: 8, background: BG, borderRadius: 8, padding: 12, marginTop: 10 }}>{children}</div>; }

function UnidadCard({ unidad, rol, onTransicion, onArchivar, onEliminar, onAceptar, onGuardar }) {
  const estatus = calcEstatus(unidad);
  const etapaDef = ETAPAS[unidad.etapaActual - 1];
  const puedeActuar = rol === etapaDef.rol;
  const tiempoLabel = fmtDiasHorasMin(estatus.horasEnEtapa || 0);
  const colorCarrito = unidad.tot ? CELESTE : unidad.colorTipo ? colorTipoAColor(unidad.colorTipo) : BLUE_SOFT;
  const rastroComentarios = comentariosCompletos(unidad.historial);

  return (
    <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden" }}>
      <div style={{ background: BLUE, padding: "9px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div style={{ color: WHITE, fontWeight: 700, fontSize: 14 }}>
          {unidad.vin}
          <span style={{ color: "#C9D6EE", fontWeight: 400, fontSize: 12 }}>
            {" "}· {unidad.cliente} {unidad.placa ? `· Placa ${unidad.placa}` : ""} {unidad.ot ? `· OT ${unidad.ot}` : ""}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ background: estatus.color, color: WHITE, borderRadius: 999, padding: "4px 12px", fontSize: 12, fontWeight: 700 }}>{estatus.label}</span>
          {onEliminar && <button onClick={onEliminar} title="Eliminar unidad" style={{ background: "transparent", border: "none", color: "#C9D6EE", cursor: "pointer", fontSize: 13 }}>✕</button>}
        </div>
      </div>
      <div style={{ padding: "14px 16px" }}>
        <CaminoUnidad etapaActual={unidad.etapaActual} colorEstatus={estatus.color} colorCarrito={colorCarrito} tiempoLabel={tiempoLabel} comentario={rastroComentarios} saltoPendiente={unidad.saltoPendiente} />
        <AccionEtapa unidad={unidad} etapaDef={etapaDef} puedeActuar={puedeActuar} onTransicion={(b) => onTransicion({ ...b, desde: unidad.etapaActual })} onArchivar={(b) => onArchivar({ ...b, desde: unidad.etapaActual })} onAceptar={onAceptar} onGuardar={(b) => onGuardar({ ...b, desde: unidad.etapaActual })} />
      </div>
    </div>
  );
}

function AccionEtapa({ unidad, etapaDef, puedeActuar, onTransicion, onArchivar, onAceptar, onGuardar }) {
  if (!puedeActuar) return <div style={{ fontSize: 12, color: GRAY, fontStyle: "italic", marginTop: 10 }}>Solo <b>{etapaDef.rol}</b> puede actualizar esta etapa</div>;
  if ((unidad.etapaActual === 5 || unidad.etapaActual === 6) && unidad.saltoPendiente) {
    return <PanelAceptarSalto etapaDef={etapaDef} onAceptar={onAceptar} />;
  }
  switch (unidad.etapaActual) {
    case 2: return <EtapaRecepcion unidad={unidad} onTransicion={onTransicion} onGuardar={onGuardar} />;
    case 3: return <EtapaAsignar unidad={unidad} onTransicion={onTransicion} onGuardar={onGuardar} />;
    case 4: return <EtapaDiagnostico unidad={unidad} onTransicion={onTransicion} onGuardar={onGuardar} />;
    case 5: return <EtapaSurtimiento unidad={unidad} onTransicion={onTransicion} onGuardar={onGuardar} />;
    case 6: return <EtapaReparacion unidad={unidad} onTransicion={onTransicion} onGuardar={onGuardar} />;
    case 7: return <EtapaValidacionTaller unidad={unidad} onTransicion={onTransicion} onGuardar={onGuardar} />;
    case 8: return <EtapaValidacionServicio unidad={unidad} onArchivar={onArchivar} onTransicion={onTransicion} onGuardar={onGuardar} />;
    default: return null;
  }
}

function PanelAceptarSalto({ etapaDef, onAceptar }) {
  return (
    <Bloque>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: 12, height: 12, borderRadius: "50%", background: AMBER, display: "inline-block", flexShrink: 0 }} />
        <p style={{ fontSize: 14, margin: 0 }}>Esta unidad fue enviada a <b>{etapaDef.nombre}</b>. Confirma que la recibiste para poder continuar.</p>
      </div>
      <button style={btnPrimary} onClick={onAceptar}>Aceptar salto de etapa</button>
    </Bloque>
  );
}

function EtapaRecepcion({ unidad, onTransicion, onGuardar }) {
  const [vin, setVin] = useState(unidad.vin || "");
  const [ot, setOt] = useState(unidad.ot || "");
  const [motivo, setMotivo] = useState(unidad.motivoIngreso || "");
  const [colorTipo, setColorTipo] = useState(unidad.colorTipo || "verde");
  return (
    <Bloque>
      <input placeholder="VIN" value={vin} onChange={(e) => setVin(e.target.value)} style={inputStyle} />
      <input placeholder="OT (orden de trabajo)" value={ot} onChange={(e) => setOt(e.target.value)} style={inputStyle} />
      <textarea placeholder="Motivo de ingreso" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} style={{ ...inputStyle, resize: "vertical" }} />
      <div style={{ fontSize: 12, color: GRAY, fontWeight: 600, marginTop: 2 }}>Clasificación de la unidad</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {COLOR_TIPO_OPCIONES.map((op) => (
          <label key={op.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
            <input type="radio" name={`colorTipo-${unidad.id}`} checked={colorTipo === op.id} onChange={() => setColorTipo(op.id)} />
            <span style={{ width: 12, height: 12, borderRadius: "50%", background: op.color, display: "inline-block" }} />
            {op.label}
          </label>
        ))}
      </div>
      <button style={btnPrimary} onClick={() => onTransicion({ patch: { vin, ot, motivoIngreso: motivo, colorTipo }, destino: 3, comentario: `OT ${ot}. Motivo: ${motivo}` })}>Enviar a Pendiente Asignar</button>
      <BotonBorrador unidad={unidad} onGuardar={onGuardar} armar={() => ({ patch: { vin, ot, motivoIngreso: motivo, colorTipo }, comentario: [ot && `OT ${ot}`, motivo && `Motivo: ${motivo}`].filter(Boolean).join(". ") })} />
    </Bloque>
  );
}

function EtapaAsignar({ unidad, onTransicion, onGuardar }) {
  const [t1, setT1] = useState(unidad.tecnico1 || ""); const [t2, setT2] = useState(unidad.tecnico2 || ""); const [t3, setT3] = useState(unidad.tecnico3 || "");
  const [w1, setW1] = useState(unidad.trabajo1 || ""); const [w2, setW2] = useState(unidad.trabajo2 || ""); const [w3, setW3] = useState(unidad.trabajo3 || "");
  const [obs, setObs] = useState(unidad.obsAsignacion || "");
  const textoComentario = () => [[t1 && `${t1}: ${w1 || "s/desc"}`, t2 && `${t2}: ${w2 || "s/desc"}`, t3 && `${t3}: ${w3 || "s/desc"}`].filter(Boolean).join(" | "), obs.trim() && `Comentarios: ${obs.trim()}`].filter(Boolean).join(" | ");
  const camposAsignacion = () => ({ tecnico1: t1, tecnico2: t2, tecnico3: t3, trabajo1: w1, trabajo2: w2, trabajo3: w3, obsAsignacion: obs });
  function confirmar() {
    onTransicion({ patch: camposAsignacion(), destino: 4, comentario: textoComentario() || "Sin técnico asignado aún" });
  }
  return (
    <Bloque>
      {[[t1, setT1, w1, setW1, "Técnico 1", "Trabajo 1"], [t2, setT2, w2, setW2, "Técnico 2 (opcional)", "Trabajo 2"], [t3, setT3, w3, setW3, "Técnico 3 (opcional)", "Trabajo 3"]].map(([tv, tset, wv, wset, tl, wl], i) => (
        <div key={i} style={{ display: "flex", gap: 8 }}>
          <input placeholder={tl} value={tv} onChange={(e) => tset(e.target.value)} style={inputStyle} />
          <input placeholder={wl} value={wv} onChange={(e) => wset(e.target.value)} style={inputStyle} />
        </div>
      ))}
      <textarea placeholder="Comentarios de la asignación (opcional)" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} style={{ ...inputStyle, resize: "vertical" }} />
      <button style={btnPrimary} onClick={confirmar}>Enviar a Diagnóstico</button>
      <BotonBorrador unidad={unidad} onGuardar={onGuardar} armar={() => ({ patch: camposAsignacion(), comentario: textoComentario() })} />
    </Bloque>
  );
}

function EtapaDiagnostico({ unidad, onTransicion, onGuardar }) {
  const [diag, setDiag] = useState(unidad.diagnostico || "");
  const [tot, setTot] = useState(unidad.tot === true);
  return (
    <Bloque>
      <textarea placeholder="Diagnóstico" rows={3} value={diag} onChange={(e) => setDiag(e.target.value)} style={{ ...inputStyle, resize: "vertical" }} />
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
        <input type="checkbox" checked={tot} onChange={(e) => setTot(e.target.checked)} />
        <span style={{ width: 12, height: 12, borderRadius: "50%", background: CELESTE, display: "inline-block" }} />
        Marcar TOT
      </label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button style={btnPrimary} onClick={() => onTransicion({ patch: { diagnostico: diag, tot, saltoPendiente: true }, destino: 5, comentario: `Diagnóstico: ${diag}${tot ? " (TOT)" : ""}` })}>Enviar a Surtimiento de refacción</button>
        <button style={btnSecondary} onClick={() => onTransicion({ patch: { diagnostico: diag, tot }, destino: 6, insertarOmitida: 5, comentario: `Diagnóstico: ${diag} (surtimiento omitido)${tot ? " (TOT)" : ""}` })}>Saltar surtimiento → ir a Reparación</button>
      </div>
      <BotonBorrador unidad={unidad} onGuardar={onGuardar} armar={() => ({ patch: { diagnostico: diag, tot }, comentario: diag ? `Diagnóstico: ${diag}${tot ? " (TOT)" : ""}` : tot ? "TOT marcado" : "" })} />
    </Bloque>
  );
}

function EtapaSurtimiento({ unidad, onTransicion, onGuardar }) {
  const [completo, setCompleto] = useState(unidad.surtidoCompleto === true);
  const [pendiente, setPendiente] = useState(unidad.pendienteSurtido || "");
  return (
    <Bloque>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}><input type="checkbox" checked={completo} onChange={(e) => setCompleto(e.target.checked)} /> Surtido completo</label>
      {!completo && <textarea placeholder="Detalle de lo pendiente por surtir" rows={2} value={pendiente} onChange={(e) => setPendiente(e.target.value)} style={{ ...inputStyle, resize: "vertical" }} />}
      <button style={btnPrimary} onClick={() => onTransicion({ patch: { surtidoCompleto: completo, pendienteSurtido: completo ? "" : pendiente, saltoPendiente: true }, destino: 6, comentario: completo ? "Surtido completo" : `Surtido incompleto: ${pendiente}` })}>Enviar a Reparación</button>
      <BotonBorrador unidad={unidad} onGuardar={onGuardar} armar={() => ({ patch: { surtidoCompleto: completo, pendienteSurtido: completo ? "" : pendiente }, comentario: completo ? "Surtido completo" : pendiente ? `Surtido incompleto: ${pendiente}` : "" })} />
    </Bloque>
  );
}

function EtapaReparacion({ unidad, onTransicion, onGuardar }) {
  const [rep, setRep] = useState(unidad.reparacion || "");
  const [regresando, setRegresando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [tot, setTot] = useState(unidad.tot === true);
  return (
    <Bloque>
      <textarea placeholder="Reparación realizada" rows={3} value={rep} onChange={(e) => setRep(e.target.value)} style={{ ...inputStyle, resize: "vertical" }} />
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
        <input type="checkbox" checked={tot} onChange={(e) => setTot(e.target.checked)} />
        <span style={{ width: 12, height: 12, borderRadius: "50%", background: CELESTE, display: "inline-block" }} />
        Marcar TOT
      </label>
      {!regresando ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={btnPrimary} onClick={() => onTransicion({ patch: { reparacion: rep, tot }, destino: 7, comentario: `Reparación: ${rep}${tot ? " (TOT)" : ""}` })}>Enviar a Validación Taller</button>
          <button style={btnWarn} onClick={() => setRegresando(true)}>Regresar a Surtimiento</button>
        </div>
      ) : (
        <>
          <textarea placeholder="Motivo del regreso a surtimiento" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} style={{ ...inputStyle, resize: "vertical" }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button style={{ ...btnWarn, opacity: motivo.trim() ? 1 : 0.5 }} disabled={!motivo.trim()} onClick={() => onTransicion({ patch: { reparacion: rep, tot, saltoPendiente: true }, destino: 5, motivo: motivo.trim(), comentario: `Motivo regreso a surtimiento: ${motivo.trim()}` })}>Confirmar regreso</button>
            <button style={btnSecondary} onClick={() => setRegresando(false)}>Cancelar</button>
          </div>
        </>
      )}
      <BotonBorrador unidad={unidad} onGuardar={onGuardar} armar={() => ({ patch: { reparacion: rep, tot }, comentario: rep ? `Reparación: ${rep}${tot ? " (TOT)" : ""}` : tot ? "TOT marcado" : "" })} />
    </Bloque>
  );
}

function EtapaValidacionTaller({ unidad, onTransicion, onGuardar }) {
  const [auditado, setAuditado] = useState(unidad.auditoriaTaller === true);
  const [obs, setObs] = useState(unidad.obsTaller || "");
  const [regresando, setRegresando] = useState(false);
  const [motivo, setMotivo] = useState("");
  return (
    <Bloque>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}><input type="checkbox" checked={auditado} onChange={(e) => setAuditado(e.target.checked)} /> Auditoría realizada</label>
      <textarea placeholder="Comentarios de la auditoría (opcional)" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} style={{ ...inputStyle, resize: "vertical" }} />
      {!regresando ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={{ ...btnPrimary, opacity: auditado ? 1 : 0.5, cursor: auditado ? "pointer" : "not-allowed" }} disabled={!auditado} onClick={() => onTransicion({ patch: { auditoriaTaller: true, obsTaller: obs }, destino: 8, comentario: `Auditoría de taller conforme${obs.trim() ? `: ${obs.trim()}` : ""}` })}>Enviar a Validación Servicio</button>
          <button style={btnWarn} onClick={() => setRegresando(true)}>Regresar a Reparación</button>
        </div>
      ) : (
        <>
          <textarea placeholder="Motivo del regreso a reparación" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} style={{ ...inputStyle, resize: "vertical" }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button style={{ ...btnWarn, opacity: motivo.trim() ? 1 : 0.5 }} disabled={!motivo.trim()} onClick={() => onTransicion({ patch: { auditoriaTaller: false }, destino: 6, motivo: motivo.trim(), comentario: `Motivo regreso a reparación: ${motivo.trim()}` })}>Confirmar regreso</button>
            <button style={btnSecondary} onClick={() => setRegresando(false)}>Cancelar</button>
          </div>
        </>
      )}
      <BotonBorrador unidad={unidad} onGuardar={onGuardar} armar={() => ({ patch: { auditoriaTaller: auditado, obsTaller: obs }, comentario: `${auditado ? "Auditoría realizada" : "Auditoría en proceso"}${obs.trim() ? `: ${obs.trim()}` : ""}` })} />
    </Bloque>
  );
}

function EtapaValidacionServicio({ unidad, onArchivar, onTransicion, onGuardar }) {
  const [auditado, setAuditado] = useState(unidad.auditoriaServicio === true);
  const [obs, setObs] = useState(unidad.obsServicio || "");
  const [regresando, setRegresando] = useState(false);
  const [motivo, setMotivo] = useState("");
  return (
    <Bloque>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}><input type="checkbox" checked={auditado} onChange={(e) => setAuditado(e.target.checked)} /> Auditoría de Servicio</label>
      <textarea placeholder="Comentarios de Servicio (opcional)" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} style={{ ...inputStyle, resize: "vertical" }} />
      {!regresando ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={{ ...btnPrimary, background: GREEN, opacity: auditado ? 1 : 0.5, cursor: auditado ? "pointer" : "not-allowed" }} disabled={!auditado} onClick={() => onArchivar({ patch: { auditoriaServicio: true, obsServicio: obs }, comentario: `Disponibilidad confirmada por Servicio${obs.trim() ? `: ${obs.trim()}` : ""}` })}>Confirmar disponibilidad</button>
          <button style={btnWarn} onClick={() => setRegresando(true)}>Regresar a Validación Taller</button>
        </div>
      ) : (
        <>
          <textarea placeholder="Motivo del regreso a validación taller" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} style={{ ...inputStyle, resize: "vertical" }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button style={{ ...btnWarn, opacity: motivo.trim() ? 1 : 0.5 }} disabled={!motivo.trim()} onClick={() => onTransicion({ patch: { auditoriaServicio: false }, destino: 7, motivo: motivo.trim(), comentario: `Motivo regreso a validación taller: ${motivo.trim()}` })}>Confirmar regreso</button>
            <button style={btnSecondary} onClick={() => setRegresando(false)}>Cancelar</button>
          </div>
        </>
      )}
      <BotonBorrador unidad={unidad} onGuardar={onGuardar} armar={() => ({ patch: { auditoriaServicio: auditado, obsServicio: obs }, comentario: `${auditado ? "Auditoría de Servicio realizada" : "Auditoría de Servicio en proceso"}${obs.trim() ? `: ${obs.trim()}` : ""}` })} />
    </Bloque>
  );
}

function FormularioIngreso({ tallerNombre, onCancelar, onGuardar }) {
  const [vin, setVin] = useState(""); const [placa, setPlaca] = useState(""); const [cliente, setCliente] = useState("");
  function submit() { if (!vin.trim() || !cliente.trim()) return; onGuardar({ vin: vin.trim(), placa: placa.trim(), cliente: cliente.trim() }); }
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,27,71,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 50 }}>
      <div style={{ background: WHITE, borderRadius: 12, padding: 22, width: "100%", maxWidth: 380 }}>
        <div style={{ color: BLUE, fontWeight: 700, fontSize: 17, marginBottom: 4 }}>Ingreso Vigilante · {tallerNombre}</div>
        <div style={{ color: GRAY, fontSize: 12.5, marginBottom: 14 }}>Registro de prueba (datos de demostración)</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <label style={{ fontSize: 12.5, color: GRAY, fontWeight: 600 }}>VIN *<input value={vin} onChange={(e) => setVin(e.target.value)} style={{ ...inputStyle, marginTop: 4 }} /></label>
          <label style={{ fontSize: 12.5, color: GRAY, fontWeight: 600 }}>Placa<input value={placa} onChange={(e) => setPlaca(e.target.value)} style={{ ...inputStyle, marginTop: 4 }} /></label>
          <label style={{ fontSize: 12.5, color: GRAY, fontWeight: 600 }}>Cliente *<input value={cliente} onChange={(e) => setCliente(e.target.value)} style={{ ...inputStyle, marginTop: 4 }} /></label>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
          <button onClick={submit} style={{ ...btnPrimary, flex: 1 }}>Guardar</button>
          <button onClick={onCancelar} style={btnSecondary}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}


// ---- Unidades ya entregadas (histórico de ejemplo, repartidas en ~4 semanas) ----




// ======================================================================
//  App de operación de UN taller (Estatus Unidades Camino Casa V4)
// ======================================================================
function TallerApp({ taller, role, onSalir }) {
  const { data, error, recargar, setData } = useTaller(taller.id);
  const [errAccion, setErrAccion] = useState(null);
  const [vista, setVista] = useState("panel");
  const [busqueda, setBusqueda] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 30000);
    return () => clearInterval(t);
  }, []);

  async function ejecutar(accion) {
    try { await accion(); setErrAccion(null); await recargar(true); return true; }
    catch (e) { setErrAccion(e.message || "No se pudo guardar el cambio. Intenta de nuevo."); await recargar(true); return false; }
  }

  async function reportePiso() {
    if (!data) return;
    try {
      const r = await leerParaReporte(taller.id);
      await descargarReportePiso(r.casa, `reporte_piso_${taller.id}_${new Date().toISOString().slice(0, 10)}.xlsx`, "reporte", r.foranea);
      setErrAccion(null);
    } catch (e) { setErrAccion("No se pudo generar la descarga: " + (e.message || "intenta de nuevo.")); }
  }

  const accion = (id, body) => ejecutar(() => api("/api/unit-action", { method: "POST", body: { id, ...body } }));
  function crearUnidad({ vin, placa, cliente }) {
    setShowForm(false);
    return ejecutar(() => api("/api/units", { method: "POST", body: { vin, placa, cliente } }));
  }
  function aplicarTransicion(id, { desde, patch, destino, comentario, insertarOmitida, motivo }) {
    return accion(id, { action: "transition", desde, patch, destino, comentario, insertarOmitida, motivo: motivo || (destino < desde ? comentario : undefined) });
  }
  function guardarBorrador(id, { desde, patch, comentario }) { return accion(id, { action: "borrador", desde, patch, comentario }); }
  function archivarUnidad(id, { desde, patch, comentario }) { return accion(id, { action: "archive", desde, patch, comentario }); }
  function eliminarUnidad(id) {
    if (!window.confirm("¿Eliminar esta unidad? Esta acción no se puede deshacer.")) return null;
    return accion(id, { action: "delete" });
  }
  function aceptarSalto(id) { return accion(id, { action: "accept" }); }

  if (!data) {
    return <div style={{ minHeight: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: WHITE }}><p style={{ color: BLUE, fontFamily: "system-ui" }}>Cargando taller {taller.nombre}…</p></div>;
  }

  const lista = data.unidades;
  const historico = data.historico;
  const resumen = ETAPAS.map((et) => lista.filter((u) => u.etapaActual === et.id).length);
  const q = busqueda.trim().toLowerCase();
  const filtradas = !q ? lista : lista.filter((u) => (u.vin || "").toLowerCase().includes(q) || (u.ot || "").toLowerCase().includes(q));
  const aviso = errAccion || error;

  return (
    <div style={{ minHeight: "100%", background: WHITE, fontFamily: "system-ui, -apple-system, sans-serif", color: BLUE_DARK }}>
      <div style={{ background: BLUE, padding: "18px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ color: "#C9D6EE", fontSize: 11.5, fontWeight: 700, letterSpacing: 1.5 }}>{NOMBRE_ORG.toUpperCase()}</div>
          <div style={{ color: WHITE, fontSize: 20, fontWeight: 700, marginTop: 2 }}>Taller {taller.nombre}</div>
          <div style={{ color: "#C9D6EE", fontSize: 12.5, marginTop: 2 }}>Ingreso → Recepción → Asignación → Diagnóstico → Surtimiento → Reparación → Validación Taller → Validación Servicio</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={onSalir} style={{ background: "rgba(255,255,255,0.12)", color: WHITE, border: "1px solid rgba(255,255,255,0.35)", borderRadius: 999, padding: "8px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>Rol: {role} · Salir</button>
          <button onClick={reportePiso} title="Descarga el Reporte de Piso de este taller en Excel" style={{ background: "rgba(255,255,255,0.12)", color: WHITE, border: "1px solid rgba(255,255,255,0.35)", borderRadius: 6, padding: "10px 14px", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>⬇ Reporte de Piso</button>
          {role === "Vigilante" && (
            <button onClick={() => setShowForm(true)} style={{ background: WHITE, color: BLUE, border: "none", borderRadius: 6, padding: "10px 16px", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>+ Ingresar unidad</button>
          )}
        </div>
      </div>

      {aviso && <div style={{ background: "#FDECEC", color: RED, padding: "8px 24px", fontSize: 13 }}>{aviso}</div>}

      <div style={{ display: "flex", gap: 4, padding: "12px 24px 0" }}>
        {[["panel", `Panel (${lista.length})`], ["historico", `Histórico (${historico.length})`]].map(([k, label]) => (
          <button key={k} onClick={() => setVista(k)} style={{ border: "none", borderBottom: vista === k ? `3px solid ${BLUE}` : "3px solid transparent", background: "transparent", color: vista === k ? BLUE : GRAY, fontWeight: 700, fontSize: 13.5, padding: "8px 10px", cursor: "pointer" }}>{label}</button>
        ))}
      </div>

      {vista === "panel" ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(64px,1fr))", gap: 5, padding: "12px 24px" }}>
            {ETAPAS.map((et, i) => <ResumenCard key={et.id} label={et.nombre} valor={resumen[i]} />)}
          </div>

          <div style={{ padding: "0 24px 12px", display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center", fontSize: 11.5, color: GRAY }}>
            <span style={{ fontWeight: 700, color: BLUE_DARK }}>Color del camión:</span>
            {COLOR_TIPO_OPCIONES.map((op) => (
              <span key={op.id} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: op.color, display: "inline-block" }} />{op.label}
              </span>
            ))}
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: "50%", background: CELESTE, display: "inline-block" }} />TOT</span>
          </div>

          <div style={{ padding: "0 24px 12px", display: "flex", justifyContent: "flex-end" }}>
            <input placeholder="Buscar por VIN u OT…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} style={{ border: `1px solid ${BORDER}`, borderRadius: 6, padding: "8px 12px", fontSize: 13, width: "100%", maxWidth: 280, boxSizing: "border-box" }} />
          </div>

          <div style={{ padding: "0 24px 32px", display: "flex", flexDirection: "column", gap: 14 }}>
            {filtradas.length === 0 && (
              <div style={{ border: `1px dashed ${BORDER}`, borderRadius: 10, padding: 28, textAlign: "center", color: GRAY, fontSize: 14 }}>
                No hay unidades que coincidan.
              </div>
            )}
            {filtradas.map((u) => (
              <UnidadCard key={u.id} unidad={u} rol={role} onTransicion={(b) => aplicarTransicion(u.id, b)} onArchivar={(b) => archivarUnidad(u.id, b)} onEliminar={role === "Supervisor Mantenimiento" ? () => eliminarUnidad(u.id) : null} onAceptar={() => aceptarSalto(u.id, role)} onGuardar={(b) => guardarBorrador(u.id, b)} />
            ))}
          </div>
        </>
      ) : (
        <div style={{ padding: "16px 24px 32px" }}>
          {historico.length === 0 ? (
            <div style={{ border: `1px dashed ${BORDER}`, borderRadius: 10, padding: 28, textAlign: "center", color: GRAY, fontSize: 14 }}>Aún no hay unidades en histórico.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {historico.map((u) => {
                const total = calcTotalHoras(u);
                const cumplio = total <= META_TOTAL_HRS;
                return (
                  <div key={u.id} style={{ border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 14px", fontSize: 13 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
                      <div><b>{u.vin}</b> · {u.cliente} {u.placa ? `· Placa ${u.placa}` : ""} {u.ot ? `· OT ${u.ot}` : ""}</div>
                      <div style={{ color: cumplio ? GREEN : RED, fontWeight: 600 }}>{fmtDiasHorasMin(total)} {cumplio ? "· Dentro de meta" : "· Fuera de meta"}</div>
                    </div>
                    <div style={{ color: GRAY, fontSize: 11.5, marginTop: 4 }}>Ingreso: {fmtFechaHora(u.fechaIngreso)} · Disponible: {fmtFechaHora(u.fechaSalida)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {showForm && <FormularioIngreso tallerNombre={taller.nombre} onCancelar={() => setShowForm(false)} onGuardar={crearUnidad} />}
    </div>
  );
}


// ======================================================================
//  CAMINO FORÁNEA / SITIO · gestionado solo por el Supervisor Foráneo
// ======================================================================






// ---- Bloque reutilizable para regresar a una etapa anterior con motivo obligatorio ----
function BotonRegreso({ etiqueta, placeholder, onConfirmar }) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  if (!abierto) return <button style={btnWarn} onClick={() => setAbierto(true)}>{etiqueta}</button>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
      <textarea placeholder={placeholder} rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} style={{ ...inputStyle, resize: "vertical" }} />
      <div style={{ display: "flex", gap: 8 }}>
        <button style={{ ...btnWarn, opacity: motivo.trim() ? 1 : 0.5 }} disabled={!motivo.trim()} onClick={() => onConfirmar(motivo.trim())}>Confirmar regreso</button>
        <button style={btnSecondary} onClick={() => { setAbierto(false); setMotivo(""); }}>Cancelar</button>
      </div>
    </div>
  );
}

function BotonAvance({ listo, falta, onClick, children, color = BLUE }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <button style={{ ...btnPrimary, background: color, opacity: listo ? 1 : 0.5, cursor: listo ? "pointer" : "not-allowed" }} disabled={!listo} onClick={onClick}>{children}</button>
      {!listo && falta && <span style={{ fontSize: 11.5, color: GRAY }}>Falta: {falta}</span>}
    </div>
  );
}

const etiquetaCampo = { fontSize: 12, color: GRAY, fontWeight: 600 };

function FEtapaIngreso({ unidad, onTransicion, onGuardar }) {
  const [lugarTipo, setLugarTipo] = useState(unidad.lugarTipo || "agencia");
  const [lugarNombre, setLugarNombre] = useState(unidad.lugarNombre || "");
  const [ciudad, setCiudad] = useState(unidad.ciudad || "");
  const [ot, setOt] = useState(unidad.ot || "");
  const [motivo, setMotivo] = useState(unidad.motivoIngreso || "");
  const [contacto, setContacto] = useState(unidad.contacto || "");
  const patch = () => ({ lugarTipo, lugarNombre: lugarNombre.trim(), ciudad: ciudad.trim(), ot: ot.trim(), motivoIngreso: motivo.trim(), contacto: contacto.trim() });
  const texto = () => [lugarNombre.trim() && `${lugarDef(lugarTipo).label}: ${lugarNombre.trim()}${ciudad.trim() ? ` (${ciudad.trim()})` : ""}`, ot.trim() && `OT ${ot.trim()}`, motivo.trim() && `Motivo: ${motivo.trim()}`, contacto.trim() && `Contacto: ${contacto.trim()}`].filter(Boolean).join(". ");
  const falta = [!lugarNombre.trim() && "agencia o sitio", !motivo.trim() && "motivo"].filter(Boolean).join(", ");
  return (
    <Bloque>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        {LUGARES_FORANEA.map((l) => (
          <label key={l.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
            <input type="radio" name={`lugar-${unidad.id}`} checked={lugarTipo === l.id} onChange={() => setLugarTipo(l.id)} />
            <span style={{ width: 12, height: 12, borderRadius: "50%", background: l.color, display: "inline-block" }} />{l.label}
          </label>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input placeholder={lugarTipo === "agencia" ? "Nombre de la agencia *" : "Sitio del cliente *"} value={lugarNombre} onChange={(e) => setLugarNombre(e.target.value)} style={inputStyle} />
        <input placeholder="Ciudad" value={ciudad} onChange={(e) => setCiudad(e.target.value)} style={{ ...inputStyle, maxWidth: 170 }} />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input placeholder="OT (orden de trabajo)" value={ot} onChange={(e) => setOt(e.target.value)} style={inputStyle} />
        <input placeholder="Contacto en agencia / sitio" value={contacto} onChange={(e) => setContacto(e.target.value)} style={inputStyle} />
      </div>
      <textarea placeholder="Motivo de ingreso *" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} style={{ ...inputStyle, resize: "vertical" }} />
      <BotonAvance listo={!falta} falta={falta} onClick={() => onTransicion({ patch: patch(), destino: 2, comentario: texto() })}>Enviar a Diagnóstico</BotonAvance>
      <BotonBorrador unidad={unidad} onGuardar={onGuardar} armar={() => ({ patch: patch(), comentario: texto() })} />
    </Bloque>
  );
}

function FEtapaDiagnostico({ unidad, onTransicion, onGuardar }) {
  const [diag, setDiag] = useState(unidad.diagnostico || "");
  const listo = !!diag.trim();
  return (
    <Bloque>
      <textarea placeholder="Diagnóstico (código de falla, síntoma, componente) *" rows={3} value={diag} onChange={(e) => setDiag(e.target.value)} style={{ ...inputStyle, resize: "vertical" }} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
        <BotonAvance listo={listo} falta="diagnóstico" onClick={() => onTransicion({ patch: { diagnostico: diag.trim() }, destino: 3, comentario: diag.trim() })}>Enviar a Espera Cotización</BotonAvance>
        <button style={{ ...btnSecondary, opacity: listo ? 1 : 0.5 }} disabled={!listo} title="Garantía, contrato o trabajo sin costo: omite cotización" onClick={() => onTransicion({ patch: { diagnostico: diag.trim() }, destino: 5, insertarOmitida: [3, 4], comentario: `${diag.trim()} (sin cotización)` })}>Sin cotización → ir a Reparación</button>
      </div>
      <BotonBorrador unidad={unidad} onGuardar={onGuardar} armar={() => ({ patch: { diagnostico: diag }, comentario: diag.trim() })} />
    </Bloque>
  );
}

function FEtapaCotizacion({ unidad, onTransicion, onGuardar }) {
  const [folio, setFolio] = useState(unidad.cotFolio || "");
  const [monto, setMonto] = useState(unidad.cotMonto || "");
  const [autorizo, setAutorizo] = useState(unidad.cotAutorizo || "");
  const [nota, setNota] = useState(unidad.cotNota || "");
  const patch = () => ({ cotFolio: folio.trim(), cotMonto: monto.trim(), cotAutorizo: autorizo.trim(), cotNota: nota.trim() });
  const falta = [!folio.trim() && "folio", !autorizo.trim() && "quién autorizó"].filter(Boolean).join(", ");
  const texto = () => [folio.trim() && `Cotización ${folio.trim()}`, monto.trim() && `$${monto.trim()}`, autorizo.trim() && `autorizada por ${autorizo.trim()}`, nota.trim()].filter(Boolean).join(" · ");
  return (
    <Bloque>
      <div style={{ display: "flex", gap: 8 }}>
        <input placeholder="Folio cotización *" value={folio} onChange={(e) => setFolio(e.target.value)} style={inputStyle} />
        <input placeholder="Monto (MXN)" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} style={{ ...inputStyle, maxWidth: 160 }} />
      </div>
      <input placeholder="Autorizó (nombre) *" value={autorizo} onChange={(e) => setAutorizo(e.target.value)} style={inputStyle} />
      <textarea placeholder="Seguimiento: a quién se pidió, cuándo, qué falta (opcional)" rows={2} value={nota} onChange={(e) => setNota(e.target.value)} style={{ ...inputStyle, resize: "vertical" }} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
        <BotonAvance listo={!falta} falta={falta} onClick={() => onTransicion({ patch: patch(), destino: 4, comentario: texto() })}>Marcar Cotización Autorizada</BotonAvance>
        <BotonRegreso etiqueta="Cotización rechazada → Diagnóstico" placeholder="Motivo del rechazo" onConfirmar={(m) => onTransicion({ patch: patch(), destino: 2, comentario: `Cotización rechazada: ${m}` })} />
      </div>
      <BotonBorrador unidad={unidad} onGuardar={onGuardar} armar={() => ({ patch: patch(), comentario: texto() || "Esperando cotización" })} />
    </Bloque>
  );
}

function FEtapaAutorizada({ unidad, onTransicion, onGuardar }) {
  const aLocal = (iso) => { if (!iso) return ""; const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
  const [compromiso, setCompromiso] = useState(aLocal(unidad.fechaCompromiso));
  const [nota, setNota] = useState(unidad.notaAutorizada || "");
  const patch = () => ({ fechaCompromiso: compromiso ? new Date(compromiso).toISOString() : "", notaAutorizada: nota.trim() });
  const texto = () => [compromiso && `Compromiso de entrega: ${fmtFechaHora(new Date(compromiso).toISOString())}`, nota.trim()].filter(Boolean).join(" · ");
  return (
    <Bloque>
      <div style={{ fontSize: 12.5, color: BLUE_DARK }}>Cotización <b>{unidad.cotFolio || "s/folio"}</b>{unidad.cotMonto ? ` · $${unidad.cotMonto}` : ""}{unidad.cotAutorizo ? ` · autorizó ${unidad.cotAutorizo}` : ""}</div>
      <label style={etiquetaCampo}>Fecha compromiso de entrega (agencia / proveedor) *
        <input type="datetime-local" value={compromiso} onChange={(e) => setCompromiso(e.target.value)} style={{ ...inputStyle, marginTop: 4 }} />
      </label>
      <textarea placeholder="Refacciones en camino, técnico asignado, etc. (opcional)" rows={2} value={nota} onChange={(e) => setNota(e.target.value)} style={{ ...inputStyle, resize: "vertical" }} />
      <BotonAvance listo={!!compromiso} falta="fecha compromiso" onClick={() => onTransicion({ patch: patch(), destino: 5, comentario: texto() || "Inicia reparación" })}>Enviar a Reparación</BotonAvance>
      <BotonBorrador unidad={unidad} onGuardar={onGuardar} armar={() => ({ patch: patch(), comentario: texto() })} />
    </Bloque>
  );
}

function FEtapaReparacion({ unidad, onTransicion, onGuardar }) {
  const [rep, setRep] = useState(unidad.reparacion || "");
  const venc = unidad.fechaCompromiso && new Date(unidad.fechaCompromiso) < new Date();
  return (
    <Bloque>
      {unidad.fechaCompromiso && <div style={{ fontSize: 12.5, fontWeight: 600, color: venc ? RED : BLUE_DARK }}>{venc ? "⚠ Compromiso vencido: " : "Compromiso de entrega: "}{fmtFechaHora(unidad.fechaCompromiso)}</div>}
      <textarea placeholder="Reparación realizada / avance *" rows={3} value={rep} onChange={(e) => setRep(e.target.value)} style={{ ...inputStyle, resize: "vertical" }} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
        <BotonAvance listo={!!rep.trim()} falta="reparación realizada" onClick={() => onTransicion({ patch: { reparacion: rep.trim() }, destino: 6, comentario: rep.trim() })}>Enviar a Unidad Disponible</BotonAvance>
        <BotonRegreso etiqueta="Cotización adicional → Espera Cotización" placeholder="Qué trabajo adicional se encontró" onConfirmar={(m) => onTransicion({ patch: { reparacion: rep.trim(), cotFolio: "", cotMonto: "", cotAutorizo: "" }, destino: 3, comentario: `Requiere cotización adicional: ${m}` })} />
      </div>
      <BotonBorrador unidad={unidad} onGuardar={onGuardar} armar={() => ({ patch: { reparacion: rep }, comentario: rep.trim() ? `Avance: ${rep.trim()}` : "" })} />
    </Bloque>
  );
}

function FEtapaDisponible({ unidad, onArchivar, onTransicion, onGuardar }) {
  const [validada, setValidada] = useState(unidad.validada === true);
  const [obs, setObs] = useState(unidad.obsDisponible || "");
  return (
    <Bloque>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}><input type="checkbox" checked={validada} onChange={(e) => setValidada(e.target.checked)} /> Unidad probada y lista para el cliente</label>
      <textarea placeholder="Comentarios de entrega (opcional)" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} style={{ ...inputStyle, resize: "vertical" }} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
        <BotonAvance listo={validada} falta="confirmar prueba de la unidad" color={GREEN} onClick={() => onArchivar({ patch: { validada: true, obsDisponible: obs.trim() }, comentario: `Unidad disponible confirmada por ${ROL_FORANEO}${obs.trim() ? `: ${obs.trim()}` : ""}` })}>Confirmar disponibilidad</BotonAvance>
        <BotonRegreso etiqueta="Regresar a Reparación" placeholder="Motivo del regreso a reparación" onConfirmar={(m) => onTransicion({ patch: { validada: false }, destino: 5, comentario: `Motivo regreso a reparación: ${m}` })} />
      </div>
      <BotonBorrador unidad={unidad} onGuardar={onGuardar} armar={() => ({ patch: { validada, obsDisponible: obs }, comentario: `${validada ? "Unidad probada" : "Validación en proceso"}${obs.trim() ? `: ${obs.trim()}` : ""}` })} />
    </Bloque>
  );
}

function ForaneaCard({ unidad, onTransicion, onArchivar, onEliminar, onGuardar }) {
  const estatus = calcEstatus(unidad);
  const lugar = lugarDef(unidad.lugarTipo);
  const props = { unidad, onGuardar: (b) => onGuardar({ ...b, desde: unidad.etapaActual }), onTransicion: (b) => onTransicion({ ...b, desde: unidad.etapaActual }), onArchivar: (b) => onArchivar({ ...b, desde: unidad.etapaActual }) };
  const panel = { 1: FEtapaIngreso, 2: FEtapaDiagnostico, 3: FEtapaCotizacion, 4: FEtapaAutorizada, 5: FEtapaReparacion, 6: FEtapaDisponible }[unidad.etapaActual];
  const Panel = panel || (() => null);
  return (
    <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden" }}>
      <div style={{ background: BLUE, padding: "9px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div style={{ color: WHITE, fontWeight: 700, fontSize: 14 }}>
          {unidad.vin}
          <span style={{ color: "#C9D6EE", fontWeight: 400, fontSize: 12 }}>
            {" "}· {unidad.cliente} {unidad.placa ? `· Placa ${unidad.placa}` : ""} {unidad.ot ? `· OT ${unidad.ot}` : ""}
          </span>
          <div style={{ color: "#C9D6EE", fontWeight: 600, fontSize: 12, marginTop: 2 }}>📍 {lugar.label}: {unidad.lugarNombre || "sin capturar"}{unidad.ciudad ? ` · ${unidad.ciudad}` : ""}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ background: estatus.color, color: WHITE, borderRadius: 999, padding: "4px 12px", fontSize: 12, fontWeight: 700 }}>{estatus.label}</span>
          {onEliminar && <button onClick={onEliminar} title="Eliminar unidad" style={{ background: "transparent", border: "none", color: "#C9D6EE", cursor: "pointer", fontSize: 13 }}>✕</button>}
        </div>
      </div>
      <div style={{ padding: "14px 16px" }}>
        <CaminoUnidad etapas={ETAPAS_FORANEA} etapaActual={unidad.etapaActual} colorEstatus={estatus.color} colorCarrito={lugar.color} tiempoLabel={fmtDiasHorasMin(estatus.horasEnEtapa || 0)} comentario={comentariosCompletos(unidad.historial, ETAPAS_FORANEA)} saltoPendiente={false} />
        <Panel {...props} />
      </div>
    </div>
  );
}

function FormularioForanea({ tallerNombre, onCancelar, onGuardar }) {
  const [vin, setVin] = useState(""); const [placa, setPlaca] = useState(""); const [cliente, setCliente] = useState("");
  const [lugarTipo, setLugarTipo] = useState("agencia"); const [lugarNombre, setLugarNombre] = useState(""); const [ciudad, setCiudad] = useState("");
  const listo = vin.trim() && cliente.trim() && lugarNombre.trim();
  function submit() { if (!listo) return; onGuardar({ vin: vin.trim(), placa: placa.trim(), cliente: cliente.trim(), lugarTipo, lugarNombre: lugarNombre.trim(), ciudad: ciudad.trim() }); }
  const lbl = { fontSize: 12.5, color: GRAY, fontWeight: 600 };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,27,71,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 50 }}>
      <div style={{ background: WHITE, borderRadius: 12, padding: 22, width: "100%", maxWidth: 400 }}>
        <div style={{ color: BLUE, fontWeight: 700, fontSize: 17, marginBottom: 4 }}>Registrar unidad foránea · {tallerNombre}</div>
        <div style={{ color: GRAY, fontSize: 12.5, marginBottom: 14 }}>Unidad atendida fuera del taller (datos de demostración)</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <label style={lbl}>VIN *<input value={vin} onChange={(e) => setVin(e.target.value)} style={{ ...inputStyle, marginTop: 4 }} /></label>
          <div style={{ display: "flex", gap: 8 }}>
            <label style={{ ...lbl, flex: 1 }}>Placa<input value={placa} onChange={(e) => setPlaca(e.target.value)} style={{ ...inputStyle, marginTop: 4 }} /></label>
            <label style={{ ...lbl, flex: 2 }}>Cliente *<input value={cliente} onChange={(e) => setCliente(e.target.value)} style={{ ...inputStyle, marginTop: 4 }} /></label>
          </div>
          <div style={{ display: "flex", gap: 14 }}>
            {LUGARES_FORANEA.map((l) => (
              <label key={l.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                <input type="radio" name="lugar-nuevo" checked={lugarTipo === l.id} onChange={() => setLugarTipo(l.id)} />
                <span style={{ width: 11, height: 11, borderRadius: "50%", background: l.color, display: "inline-block" }} />{l.label}
              </label>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <label style={{ ...lbl, flex: 2 }}>{lugarTipo === "agencia" ? "Agencia *" : "Sitio del cliente *"}<input value={lugarNombre} onChange={(e) => setLugarNombre(e.target.value)} style={{ ...inputStyle, marginTop: 4 }} /></label>
            <label style={{ ...lbl, flex: 1 }}>Ciudad<input value={ciudad} onChange={(e) => setCiudad(e.target.value)} style={{ ...inputStyle, marginTop: 4 }} /></label>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
          <button onClick={submit} disabled={!listo} style={{ ...btnPrimary, flex: 1, opacity: listo ? 1 : 0.5 }}>Registrar</button>
          <button onClick={onCancelar} style={btnSecondary}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

function ForaneaApp({ taller, onSalir }) {
  const { data, error, recargar, setData } = useTaller(taller.id, "foranea");
  const [errAccion, setErrAccion] = useState(null);
  const [vista, setVista] = useState("panel");
  const [busqueda, setBusqueda] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 30000); return () => clearInterval(t); }, []);

  async function ejecutar(accion) {
    try { await accion(); setErrAccion(null); await recargar(true); return true; }
    catch (e) { setErrAccion(e.message || "No se pudo guardar el cambio. Intenta de nuevo."); await recargar(true); return false; }
  }
  const accion = (id, body) => ejecutar(() => api("/api/unit-action", { method: "POST", body: { id, ...body } }));
  function crear(campos) {
    setShowForm(false);
    return ejecutar(() => api("/api/units", { method: "POST", body: { camino: "foranea", ...campos } }));
  }
  const aplicar = (id, { desde, patch, destino, comentario, insertarOmitida, motivo }) =>
    accion(id, { action: "transition", desde, patch, destino, comentario, insertarOmitida, motivo: motivo || (destino < desde ? comentario : undefined) });
  const guardar = (id, { desde, patch, comentario }) => accion(id, { action: "borrador", desde, patch, comentario });
  const archivar = (id, { desde, patch, comentario }) => accion(id, { action: "archive", desde, patch, comentario });
  const eliminar = (id) => {
    if (!window.confirm("¿Eliminar esta unidad? Esta acción no se puede deshacer.")) return null;
    return accion(id, { action: "delete" });
  };
  async function reportePiso() {
    try {
      const r = await leerParaReporte(taller.id);
      await descargarReportePiso(r.casa, `reporte_piso_${taller.id}_${new Date().toISOString().slice(0, 10)}.xlsx`, "reporte", r.foranea);
      setErrAccion(null);
    } catch (e) { setErrAccion("No se pudo generar la descarga: " + (e.message || "intenta de nuevo.")); }
  }

  if (!data) return <div style={{ minHeight: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: WHITE }}><p style={{ color: BLUE, fontFamily: "system-ui" }}>Cargando foráneas {taller.nombre}…</p></div>;

  const lista = data.unidades;
  const historico = data.historico;
  const resumen = ETAPAS_FORANEA.map((et) => lista.filter((u) => u.etapaActual === et.id).length);
  const vencidas = lista.filter((u) => u.fechaCompromiso && u.etapaActual >= 4 && new Date(u.fechaCompromiso) < new Date()).length;
  const q = busqueda.trim().toLowerCase();
  const filtradas = !q ? lista : lista.filter((u) => [u.vin, u.ot, u.cliente, u.lugarNombre].some((v) => (v || "").toLowerCase().includes(q)));
  const aviso = errAccion || error;

  return (
    <div style={{ minHeight: "100%", background: WHITE, fontFamily: "system-ui, -apple-system, sans-serif", color: BLUE_DARK }}>
      <div style={{ background: BLUE, padding: "18px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ color: "#C9D6EE", fontSize: 11.5, fontWeight: 700, letterSpacing: 1.5 }}>{NOMBRE_ORG.toUpperCase()}</div>
          <div style={{ color: WHITE, fontSize: 20, fontWeight: 700, marginTop: 2 }}>Foránea / Sitio · {taller.nombre}</div>
          <div style={{ color: "#C9D6EE", fontSize: 12.5, marginTop: 2 }}>{ETAPAS_FORANEA.map((e) => e.nombre).join(" → ")}</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={onSalir} style={{ background: "rgba(255,255,255,0.12)", color: WHITE, border: "1px solid rgba(255,255,255,0.35)", borderRadius: 999, padding: "8px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>Rol: {ROL_FORANEO} · Salir</button>
          <button onClick={reportePiso} title="Descarga el Reporte de Piso de este taller en Excel" style={{ background: "rgba(255,255,255,0.12)", color: WHITE, border: "1px solid rgba(255,255,255,0.35)", borderRadius: 6, padding: "10px 14px", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>⬇ Reporte de Piso</button>
          <button onClick={() => setShowForm(true)} style={{ background: WHITE, color: BLUE, border: "none", borderRadius: 6, padding: "10px 16px", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>+ Registrar unidad foránea</button>
        </div>
      </div>

      {aviso && <div style={{ background: "#FDECEC", color: RED, padding: "8px 24px", fontSize: 13 }}>{aviso}</div>}

      <div style={{ display: "flex", gap: 4, padding: "12px 24px 0" }}>
        {[["panel", `Panel (${lista.length})`], ["historico", `Histórico (${historico.length})`]].map(([k, label]) => (
          <button key={k} onClick={() => setVista(k)} style={{ border: "none", borderBottom: vista === k ? `3px solid ${BLUE}` : "3px solid transparent", background: "transparent", color: vista === k ? BLUE : GRAY, fontWeight: 700, fontSize: 13.5, padding: "8px 10px", cursor: "pointer" }}>{label}</button>
        ))}
      </div>

      {vista === "panel" ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(84px,1fr))", gap: 5, padding: "12px 24px" }}>
            {ETAPAS_FORANEA.map((et, i) => <ResumenCard key={et.id} label={et.nombre} valor={resumen[i]} />)}
          </div>
          <div style={{ padding: "0 24px 12px", display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center", fontSize: 11.5, color: GRAY }}>
            <span style={{ fontWeight: 700, color: BLUE_DARK }}>Color del camión:</span>
            {LUGARES_FORANEA.map((l) => <span key={l.id} style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: "50%", background: l.color, display: "inline-block" }} />{l.label}</span>)}
            {vencidas > 0 && <span style={{ color: RED, fontWeight: 700 }}>⚠ {vencidas} con compromiso de entrega vencido</span>}
          </div>
          <div style={{ padding: "0 24px 12px", display: "flex", justifyContent: "flex-end" }}>
            <input placeholder="Buscar por VIN, OT, cliente o agencia…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} style={{ border: `1px solid ${BORDER}`, borderRadius: 6, padding: "8px 12px", fontSize: 13, width: "100%", maxWidth: 300, boxSizing: "border-box" }} />
          </div>
          <div style={{ padding: "0 24px 32px", display: "flex", flexDirection: "column", gap: 14 }}>
            {filtradas.length === 0 && (
              <div style={{ border: `1px dashed ${BORDER}`, borderRadius: 10, padding: 28, textAlign: "center", color: GRAY, fontSize: 14 }}>
                {lista.length === 0 ? "No hay unidades foráneas en proceso. Registra la primera con «+ Registrar unidad foránea»." : "No hay unidades que coincidan con la búsqueda."}
                              </div>
            )}
            {filtradas.map((u) => (
              <ForaneaCard key={u.id} unidad={u} onTransicion={(b) => aplicar(u.id, b)} onArchivar={(b) => archivar(u.id, b)} onEliminar={() => eliminar(u.id)} onGuardar={(b) => guardar(u.id, b)} />
            ))}
          </div>
        </>
      ) : (
        <div style={{ padding: "16px 24px 32px" }}>
          {historico.length === 0 ? (
            <div style={{ border: `1px dashed ${BORDER}`, borderRadius: 10, padding: 28, textAlign: "center", color: GRAY, fontSize: 14 }}>Aún no hay unidades foráneas entregadas.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {historico.map((u) => {
                const total = calcTotalHoras(u);
                const cumplio = total <= META_TOTAL_FORANEA;
                return (
                  <div key={u.id} style={{ border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 14px", fontSize: 13 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
                      <div><b>{u.vin}</b> · {u.cliente} {u.ot ? `· OT ${u.ot}` : ""} · 📍 {u.lugarNombre}</div>
                      <div style={{ color: cumplio ? GREEN : RED, fontWeight: 600 }}>{fmtDiasHorasMin(total)} {cumplio ? "· Dentro de meta" : "· Fuera de meta"}</div>
                    </div>
                    <div style={{ color: GRAY, fontSize: 11.5, marginTop: 4 }}>Ingreso: {fmtFechaHora(u.fechaIngreso)} · Disponible: {fmtFechaHora(u.fechaSalida)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {showForm && <FormularioForanea tallerNombre={taller.nombre} onCancelar={() => setShowForm(false)} onGuardar={crear} />}
    </div>
  );
}

// ======================================================================
//  MONITOREO Dirección General (celular): estatus por tarjeta, indicadores y tendencia
// ======================================================================
const nombreCorto = (n) => n.replace(" (Disponible)", "");
const hhmmss = (d) => (d ? d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—");
const chipVisor = (txt, color, key) => <span key={key || txt} style={{ background: color, color: WHITE, borderRadius: 999, padding: "3px 9px", fontSize: 11.5, fontWeight: 700 }}>{txt}</span>;

function TarjetaVisor({ unidad }) {
  const [abierto, setAbierto] = useState(false);
  const estatus = calcEstatus(unidad);
  const ETS = etapasDe(unidad);
  const foranea = esForanea(unidad);
  const etapaDef = ETS[unidad.etapaActual - 1];
  const tiempoLabel = fmtDiasHorasMin(estatus.horasEnEtapa || 0);
  const tiempos = tiemposPorEtapa(unidad);
  const maxH = Math.max(0.0001, ...tiempos.map((t) => t.horas));
  const lineas = comentariosCompletos(unidad.historial, ETS).split("\n").filter(Boolean);
  const clasif = foranea ? null : COLOR_TIPO_OPCIONES.find((o) => o.id === unidad.colorTipo);
  const lugar = foranea ? lugarDef(unidad.lugarTipo) : null;
  const compromisoVencido = foranea && unidad.fechaCompromiso && unidad.etapaActual >= 4 && new Date(unidad.fechaCompromiso) < new Date();

  return (
    <div onClick={() => setAbierto((v) => !v)} style={{ border: `1px solid ${abierto ? BLUE : BORDER}`, borderRadius: 12, overflow: "hidden", background: WHITE, cursor: "pointer" }}>
      <div style={{ background: BLUE, padding: "9px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: WHITE, fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{unidad.vin}</div>
          <div style={{ color: "#C9D6EE", fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {unidad.cliente}{unidad.placa ? ` · ${unidad.placa}` : ""}{unidad.ot ? ` · OT ${unidad.ot}` : ""}{foranea && unidad.lugarNombre ? ` · 📍 ${unidad.lugarNombre}` : ""}
          </div>
        </div>
        <span style={{ background: estatus.color, color: WHITE, borderRadius: 999, padding: "4px 10px", fontSize: 11.5, fontWeight: 700, flexShrink: 0 }}>{estatus.label}</span>
      </div>
      <div style={{ padding: "11px 12px 6px", display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: BLUE }}>Etapa {unidad.etapaActual}/{ETS.length} · {nombreCorto(etapaDef.nombre)}</div>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: estatus.color, whiteSpace: "nowrap" }}>lleva {tiempoLabel}</div>
      </div>
      <div style={{ padding: "0 12px 10px", fontSize: 11.5, color: GRAY }}>{abierto ? "▾ Ocultar detalle" : "▸ Toca para ver el detalle"}</div>

      {abierto && (
        <div onClick={(e) => e.stopPropagation()} style={{ borderTop: `1px solid ${BORDER}`, padding: "10px 12px 12px", display: "flex", flexDirection: "column", gap: 12, cursor: "default" }}>
          {(clasif || lugar || unidad.tot || unidad.saltoPendiente) && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {clasif && chipVisor(clasif.label, clasif.color)}
              {lugar && chipVisor(`${lugar.label}${unidad.ciudad ? ` · ${unidad.ciudad}` : ""}`, lugar.color, "lugar")}
              {foranea && unidad.cotFolio && chipVisor(`Cot. ${unidad.cotFolio}${unidad.cotMonto ? ` · $${unidad.cotMonto}` : ""}`, BLUE_SOFT, "cot")}
              {foranea && unidad.fechaCompromiso && chipVisor(`${compromisoVencido ? "⚠ Compromiso vencido" : "Compromiso"} ${fmtFechaHora(unidad.fechaCompromiso)}`, compromisoVencido ? RED : GREEN, "comp")}
              {unidad.tot && chipVisor("TOT", CELESTE)}
              {unidad.saltoPendiente && chipVisor(`⏳ Pendiente de aceptar por ${etapaDef.rol}`, AMBER)}
            </div>
          )}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: BLUE_DARK, marginBottom: 6 }}>Tiempos por etapa</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {ETS.map((et, i) => {
                const t = tiempos[i];
                const actual = et.id === unidad.etapaActual;
                const texto = t.omitida ? "omitida" : t.visitada ? fmtDiasHorasMin(t.horas) : "—";
                return (
                  <div key={et.id} style={{ display: "grid", gridTemplateColumns: "104px 1fr 62px", alignItems: "center", gap: 8 }}>
                    <div style={{ fontSize: 11.5, color: actual ? BLUE : GRAY, fontWeight: actual ? 700 : 500, lineHeight: 1.15 }}>{actual ? "● " : ""}{nombreCorto(et.nombre)}</div>
                    <div style={{ height: 8, background: "#E4E9F2", borderRadius: 4, display: "flex" }}>
                      <div style={{ width: `${Math.max(t.visitada && !t.omitida ? 3 : 0, (t.horas / maxH) * 100)}%`, height: 8, borderRadius: 4, background: actual ? estatus.color : BLUE_SOFT }} />
                    </div>
                    <div style={{ fontSize: 11.5, color: actual ? estatus.color : GRAY, fontWeight: actual ? 700 : 500, textAlign: "right", whiteSpace: "nowrap" }}>{texto}</div>
                  </div>
                );
              })}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: BLUE_DARK, marginBottom: 4 }}>Comentarios</div>
            {lineas.length === 0 ? (
              <div style={{ fontSize: 12, color: GRAY }}>Sin comentarios aún</div>
            ) : (
              lineas.map((l, i) => {
                const k = l.indexOf(": ");
                return (
                  <div key={i} style={{ fontSize: 12, lineHeight: 1.4, marginBottom: 3, color: "#33445F" }}>
                    {k > 0 ? <><b>{l.slice(0, k)}:</b> {l.slice(k + 2)}</> : l}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PanelCuelloBotella({ grupos, etapas = ETAPAS }) {
  return (
    <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: BLUE_DARK, textTransform: "uppercase", letterSpacing: 0.2 }}>Cuello de botella · etapa con más unidades</div>
      {grupos.map((g) => {
        const cb = calcularCuelloBotella(g.unidades, etapas);
        const acumula = cb && cb.n >= 2;
        const color = !acumula ? GRAY : cb.fuera > 0 ? RED : AMBER;
        return (
          <div key={g.titulo} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: "50%", background: acumula ? color : "#D5DAE4", color: WHITE, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 16, flexShrink: 0 }}>{cb ? cb.n : 0}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11, color: GRAY, fontWeight: 600 }}>{g.titulo}</div>
              {!cb ? (
                <div style={{ fontSize: 13, color: GRAY }}>Sin unidades en proceso</div>
              ) : !acumula ? (
                <div style={{ fontSize: 13, color: GREEN, fontWeight: 600 }}>Sin acumulación (máx. 1 unidad por etapa)</div>
              ) : (
                <>
                  <div style={{ fontSize: 14, fontWeight: 700, color: BLUE }}>{nombreCorto(cb.et.nombre)}</div>
                  <div style={{ fontSize: 11.5, color: GRAY }}>{cb.n} unidades · {cb.fuera} fuera de meta · promedio {fmtDiasHorasMin(cb.prom)}</div>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PanelTendencia({ unidades, historico, onEjemplo }) {
  const [modo, setModo] = useState("dias");
  const datos = contarTendencia(cubosTendencia(modo), unidades, historico);
  const ing = datos.reduce((a, d) => a + d.ingresan, 0);
  const ent = datos.reduce((a, d) => a + d.entregan, 0);
  const max = Math.max(1, ...datos.flatMap((d) => [d.ingresan, d.entregan]));
  const barra = (v, color) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 1 }}>
      <span style={{ fontSize: 9.5, color: GRAY, fontWeight: 600 }}>{v || ""}</span>
      <div style={{ width: 11, height: v ? Math.max(3, (v / max) * 64) : 0, background: color, borderRadius: "3px 3px 0 0" }} />
    </div>
  );
  const seg = (id, label) => (
    <button key={id} onClick={() => setModo(id)} style={{ border: `1px solid ${modo === id ? BLUE : BORDER}`, background: modo === id ? BLUE : WHITE, color: modo === id ? WHITE : BLUE_DARK, borderRadius: 999, padding: "4px 11px", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>{label}</button>
  );
  return (
    <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: BLUE_DARK, textTransform: "uppercase", letterSpacing: 0.2 }}>Tendencia · ingresan vs entregan</div>
        <div style={{ display: "flex", gap: 5 }}>{seg("dias", "7 días")}{seg("semanas", "4 semanas")}</div>
      </div>
      <div style={{ display: "flex", gap: 14, fontSize: 12.5 }}>
        <span><span style={{ display: "inline-block", width: 9, height: 9, background: BLUE, borderRadius: 2, marginRight: 5 }} />Ingresaron <b>{ing}</b></span>
        <span><span style={{ display: "inline-block", width: 9, height: 9, background: GREEN, borderRadius: 2, marginRight: 5 }} />Entregaron <b>{ent}</b></span>
      </div>
      <div style={{ display: "flex", gap: 4, alignItems: "flex-end" }}>
        {datos.map((d) => (
          <div key={d.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 82 }}>{barra(d.ingresan, BLUE)}{barra(d.entregan, GREEN)}</div>
            <div style={{ fontSize: 10, color: GRAY, whiteSpace: "nowrap" }}>{d.label}</div>
          </div>
        ))}
      </div>
      {historico.length === 0 && onEjemplo && (
        <div style={{ fontSize: 12, color: GRAY }}>
          Sin unidades entregadas todavía. <button onClick={onEjemplo} style={{ background: "transparent", border: "none", color: BLUE, textDecoration: "underline", cursor: "pointer", fontSize: 12, padding: 0 }}>Cargar historial de ejemplo</button>
        </div>
      )}
    </div>
  );
}

function SeccionTaller({ taller, hook, mostrarTitulo, orden, camino = "casa" }) {
  const sufijo = camino === "foranea" ? " foráneas" : "";
  const unidades = hook.data ? hook.data.unidades : [];
  const ordenadas = [...unidades].sort((a, b) => {
    const ha = calcEstatus(a).horasEnEtapa || 0, hb = calcEstatus(b).horasEnEtapa || 0;
    return orden === "desc" ? hb - ha : ha - hb;
  });
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {mostrarTitulo && (
        <h2 style={{ margin: "6px 0 0", fontSize: 19, color: BLUE }}>
          Taller {taller.nombre} <span style={{ fontSize: 14, fontWeight: 600, color: GRAY }}>· {unidades.length}{sufijo} en proceso</span>
        </h2>
      )}
      {hook.error && <div style={{ background: "#FDECEC", color: RED, borderRadius: 8, padding: "6px 10px", fontSize: 12.5 }}>{hook.error}</div>}
      {!hook.data ? (
        <div style={{ color: GRAY, fontSize: 13, padding: 12 }}>Cargando…</div>
      ) : unidades.length === 0 ? (
        <div style={{ border: `1px dashed ${BORDER}`, borderRadius: 10, padding: 18, textAlign: "center", color: GRAY, fontSize: 13 }}>Sin unidades{sufijo} en proceso en {taller.nombre}.</div>
      ) : (
        ordenadas.map((u) => <TarjetaVisor key={u.id} unidad={u} />)
      )}
    </section>
  );
}

function ModalResumen({ texto, onCerrar }) {
  const ref = useRef(null);
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    try { await navigator.clipboard.writeText(texto); setCopiado(true); }
    catch { if (ref.current) { ref.current.focus(); ref.current.select(); } }
  }
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,27,71,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 14, zIndex: 50 }}>
      <div style={{ background: WHITE, borderRadius: 12, padding: 16, width: "100%", maxWidth: 560 }}>
        <div style={{ color: BLUE, fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Resumen para copiar</div>
        <div style={{ color: GRAY, fontSize: 12, marginBottom: 8 }}>Pégalo en Excel: queda en columnas.</div>
        <textarea ref={ref} readOnly value={texto} rows={9} style={{ ...inputStyle, fontFamily: "monospace", fontSize: 11.5 }} />
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button onClick={copiar} style={{ ...btnPrimary, flex: 1 }}>{copiado ? "Copiado ✓" : "Copiar"}</button>
          <button onClick={onCerrar} style={btnSecondary}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

function Visor({ onSalir }) {
  // Una sola consulta por camino trae los 4 talleres (Dirección los ve todos)
  const snapCasa = useSnapshot("all", 35, "casa");
  const snapForanea = useSnapshot("all", 35, "foranea");
  const aHooks = (sn) => { const o = {}; TALLERES.forEach((t) => { o[t.id] = { data: sn.datos ? sn.datos[t.id] || vacio() : null, error: sn.error, actualizado: sn.actualizado, recargar: sn.recargar }; }); return o; };
  const hooksCasa = aHooks(snapCasa);
  const hooksForanea = aHooks(snapForanea);
  const [camino, setCamino] = useState("casa");
  const hooks = camino === "foranea" ? hooksForanea : hooksCasa;
  const etapasCam = camino === "foranea" ? ETAPAS_FORANEA : ETAPAS;
  const [tab, setTab] = useState("todos");
  const [orden, setOrden] = useState("desc");
  const [verTexto, setVerTexto] = useState(false);
  const [, setTick] = useState(0);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const datosDe = (id) => hooks[id].data || vacio();
  const conteo = (id) => (hooks[id].data ? hooks[id].data.unidades.length : 0);
  const nTotal = TALLERES.reduce((a, t) => a + conteo(t.id), 0);
  const listos = TALLERES.every((t) => hooks[t.id].data);
  const ultima = TALLERES.map((t) => hooks[t.id].actualizado).filter(Boolean).sort((a, b) => b - a)[0] || null;
  const visibles = tab === "todos" ? TALLERES : TALLERES.filter((t) => t.id === tab);
  const unidadesVis = visibles.flatMap((t) => datosDe(t.id).unidades);
  const historicoVis = visibles.flatMap((t) => datosDe(t.id).historico);
  const grupos = tab === "todos"
    ? [{ titulo: "Todos los talleres", unidades: unidadesVis }, ...TALLERES.map((t) => ({ titulo: t.nombre, unidades: datosDe(t.id).unidades }))]
    : [{ titulo: visibles[0].nombre, unidades: unidadesVis }];
  const listaTalleres = TALLERES.map((t) => ({ taller: t, data: hooksCasa[t.id].data || vacio() }));
  const listaForaneas = TALLERES.map((t) => ({ taller: t, data: hooksForanea[t.id].data || vacio() }));
  const nCasa = TALLERES.reduce((a, t) => a + (hooksCasa[t.id].data ? hooksCasa[t.id].data.unidades.length : 0), 0);
  const nForanea = TALLERES.reduce((a, t) => a + (hooksForanea[t.id].data ? hooksForanea[t.id].data.unidades.length : 0), 0);

  async function recargarTodo() { await Promise.all([snapCasa.recargar(true), snapForanea.recargar(true)]); }
  async function exportarHistorico() {
    try {
      const r = await leerParaReporte("all");
      if ([...r.casa, ...r.foranea].every((x) => x.data.historico.length === 0)) { setMsg("Todavía no hay unidades validadas en ninguna sucursal."); return; }
      await descargarReportePiso(r.casa, `historico_validadas_${new Date().toISOString().slice(0, 10)}.xlsx`, "historico", r.foranea);
      setMsg(null);
    } catch (e) { setMsg("No se pudo generar la descarga: " + (e.message || "intenta de nuevo.")); }
  }
  async function exportarExcel() {
    try {
      const r = await leerParaReporte("all");
      await descargarReportePiso(r.casa, `reporte_piso_${new Date().toISOString().slice(0, 10)}.xlsx`, "reporte", r.foranea);
      setMsg(null);
    } catch (e) { setMsg("No se pudo generar la descarga: " + (e.message || "intenta de nuevo. Usa «Ver resumen» para copiarlo.")); }
  }

  const tabBtn = (id, label, n) => (
    <button key={id} onClick={() => setTab(id)} style={{ minWidth: 0, border: `1px solid ${tab === id ? WHITE : "rgba(255,255,255,0.35)"}`, background: tab === id ? WHITE : "rgba(255,255,255,0.10)", color: tab === id ? BLUE : WHITE, borderRadius: 12, padding: "8px 2px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 1.1 }}>
      <span style={{ fontSize: 24, fontWeight: 800 }}>{listos ? n : "—"}</span>
      <span style={{ fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>{label}</span>
    </button>
  );
  const accion = { background: WHITE, color: BLUE, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" };

  return (
    <div style={{ minHeight: "100%", background: WHITE, fontFamily: "system-ui, -apple-system, sans-serif", color: BLUE_DARK }}>
      <div style={{ position: "sticky", top: 0, zIndex: 20, background: BLUE, padding: "10px 12px 12px", boxShadow: "0 2px 6px rgba(0,0,0,0.15)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: "#C9D6EE", fontSize: 10.5, fontWeight: 700, letterSpacing: 1.2 }}>{NOMBRE_ORG.toUpperCase()}</div>
            <div style={{ color: WHITE, fontWeight: 700, fontSize: 16 }}>📱 Monitoreo Dirección General</div>
            <div style={{ color: "#C9D6EE", fontSize: 11 }}>En vivo · actualizado {hhmmss(ultima)}</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={recargarTodo} title="Actualizar ahora" style={{ background: "rgba(255,255,255,0.14)", color: WHITE, border: "1px solid rgba(255,255,255,0.35)", borderRadius: 999, padding: "7px 11px", fontSize: 13, cursor: "pointer" }}>⟳</button>
            <button onClick={onSalir} style={{ background: "rgba(255,255,255,0.14)", color: WHITE, border: "1px solid rgba(255,255,255,0.35)", borderRadius: 999, padding: "7px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>Salir</button>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5, marginTop: 10, background: "rgba(255,255,255,0.10)", borderRadius: 10, padding: 3 }}>
          {[["casa", "Camino Casa", nCasa], ["foranea", "Foránea / Sitio", nForanea]].map(([id, label, n]) => (
            <button key={id} onClick={() => setCamino(id)} aria-pressed={camino === id} style={{ border: "none", borderRadius: 8, padding: "7px 4px", background: camino === id ? WHITE : "transparent", color: camino === id ? BLUE : WHITE, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{label} · {n}</button>
          ))}
        </div>
        <div style={{ color: "#C9D6EE", fontSize: 11.5, fontWeight: 600, margin: "10px 0 5px" }}>{camino === "foranea" ? "Unidades foráneas en proceso" : "Unidades en proceso"}</div>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${TALLERES.length + 1}, minmax(0, 1fr))`, gap: 5 }}>
          {tabBtn("todos", "Todos", nTotal)}
          {TALLERES.map((t) => tabBtn(t.id, t.nombre, conteo(t.id)))}
        </div>
      </div>

      <div style={{ padding: "12px 12px 40px", display: "flex", flexDirection: "column", gap: 14, maxWidth: 720, margin: "0 auto" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={exportarExcel} style={accion}>⬇ Reporte de Piso</button>
          <button onClick={exportarHistorico} title="Descarga en Excel las unidades validadas (disponibles) de todas las sucursales" style={accion}>⬇ Histórico de Validadas</button>
          <button onClick={() => setVerTexto(true)} style={accion}>📋 Ver resumen</button>
        </div>
        {msg && <div style={{ background: "#FDECEC", color: RED, borderRadius: 8, padding: "6px 10px", fontSize: 12.5 }}>{msg}</div>}

        {listos && TALLERES.some((t) => conteo(t.id) === 0) && (
          <div style={{ border: `1px dashed ${BORDER}`, borderRadius: 10, padding: 18, textAlign: "center", color: GRAY, fontSize: 13 }}>
            {nTotal === 0 ? `Todavía no hay unidades${camino === "foranea" ? " foráneas" : ""} en ningún taller.` : `Hay talleres sin unidades${camino === "foranea" ? " foráneas" : ""}: ${TALLERES.filter((t) => conteo(t.id) === 0).map((t) => t.nombre).join(", ")}.`}
          </div>
        )}

        <PanelCuelloBotella grupos={grupos} etapas={etapasCam} />
        <PanelTendencia unidades={unidadesVis} historico={historicoVis} onEjemplo={null} />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: BLUE_DARK }}>Tarjetas · por tiempo detenido</div>
          <button onClick={() => setOrden((o) => (o === "desc" ? "asc" : "desc"))} style={{ ...accion, padding: "6px 10px", fontSize: 12 }}>{orden === "desc" ? "↓ Mayor primero" : "↑ Menor primero"}</button>
        </div>

        {visibles.map((t) => (
          <SeccionTaller key={t.id} taller={t} hook={hooks[t.id]} mostrarTitulo={tab === "todos"} orden={orden} camino={camino} />
        ))}
      </div>

      {verTexto && <ModalResumen texto={resumenTSV(listaTalleres, listaForaneas)} onCerrar={() => setVerTexto(false)} />}
    </div>
  );
}

// ======================================================================
//  Acceso (taller + rol + PIN, o monitoreo) y componente raíz
// ======================================================================
function Acceso({ onEntrar }) {
  const [modo, setModo] = useState("taller"); // taller | visor (monitoreo)
  const [camino, setCamino] = useState("casa"); // casa | foranea
  const [taller, setTaller] = useState(TALLERES[0].id);
  const [role, setRole] = useState(ROLES[0]);
  const [pin, setPin] = useState("");
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [aviso, setAviso] = useState(null);

  function irA(m) { setModo(m); setError(null); setPin(""); }

  // Reporte de Piso de todas las sucursales (Casa y Foránea / Sitio): se descarga desde el acceso, sin PIN
  async function descargarTodas() {
    setDescargando(true); setAviso(null);
    try {
      const r = await api("/api/reporte-publico", { sinSesion: true });
      const lista = (c) => TALLERES.map((t) => ({ taller: t, data: (r[c] && r[c][t.id]) || vacio() }));
      const casa = lista("casa"), foranea = lista("foranea");
      if ([...casa, ...foranea].every((x) => x.data.unidades.length === 0 && x.data.historico.length === 0)) setAviso("Todavía no hay unidades en las sucursales.");
      else await descargarReportePiso(casa, `reporte_piso_todas_las_sucursales_${new Date().toISOString().slice(0, 10)}.xlsx`, "reporte", foranea);
    } catch (e) { setAviso(e.message || "No se pudo generar la descarga. Intenta de nuevo."); }
    setDescargando(false);
  }

  async function entrar(cuerpo) {
    if (!pin.trim()) { setError("Escribe tu PIN"); return; }
    setCargando(true);
    setError(null);
    try {
      const r = await api("/api/login", { method: "POST", body: cuerpo, sinSesion: true });
      onEntrar({ token: r.token, role: r.role, taller: r.taller, exp: r.exp });
    } catch (e) {
      setError(e.message);
      setPin("");
    }
    setCargando(false);
  }
  const entrarTaller = () => entrar({ taller, role: camino === "foranea" ? ROL_FORANEO : role, pin: pin.trim() });
  const entrarVisor = () => entrar({ role: ROL_DIRECCION, pin: pin.trim() });

  const campo = { ...inputStyle, height: 48, fontSize: 16, borderRadius: 10, border: "1.5px solid #7F8DA8", padding: "0 12px" };
  const etiqueta = { fontSize: 13, fontWeight: 600, color: "#33445F" };
  const botonGrande = { ...btnPrimary, height: 52, borderRadius: 12, fontSize: 16, fontWeight: 700 };
  const iconoMonitoreo = (color, size) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 3v18h18" /><path d="M7 15l4-4 3 3 5-6" />
    </svg>
  );
  const nombreTaller = TALLERES.find((t) => t.id === taller).nombre;

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 20px", background: WHITE, fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", color: BLUE_DARK }}>
      <div style={{ maxWidth: 380, width: "100%", display: "flex", flexDirection: "column", gap: 22 }}>

        {modo === "taller" ? (
          <>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, textAlign: "center" }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.5, color: BLUE_SOFT }}>{NOMBRE_ORG.toUpperCase()}</div>
              <h1 style={{ margin: 0, fontSize: 22, lineHeight: 1.2, color: BLUE, fontWeight: 700 }}>
                {camino === "foranea" ? "Seguimiento de unidades en agencia o sitio del cliente" : "Seguimiento de unidades con ingreso a mantenimiento"}{" "}
                <span style={{ display: "block", fontSize: 28, marginTop: 2 }}>{camino === "foranea" ? "Camino Foránea / Sitio" : "Camino Casa"}</span>
              </h1>
              <p style={{ margin: 0, fontSize: 15, color: "#4A5A75" }}>{camino === "foranea" ? "Elige el taller que coordina la unidad y entra con tu PIN" : "Entra a tu taller con tu rol y PIN"}</p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={etiqueta}>Camino</span>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {[["casa", "Casa", "Taller propio"], ["foranea", "Foránea / Sitio", "Agencia o cliente"]].map(([id, label, sub]) => {
                    const activo = camino === id;
                    return (
                      <button key={id} type="button" aria-pressed={activo} onClick={() => setCamino(id)} style={{ minHeight: 56, borderRadius: 12, border: `2px solid ${activo ? BLUE : "#7F8DA8"}`, background: activo ? BLUE : WHITE, color: activo ? WHITE : "#0B1B33", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1 }}>
                        <span style={{ fontSize: 16, fontWeight: 700 }}>{label}</span>
                        <span style={{ fontSize: 11.5, opacity: 0.85 }}>{sub}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={etiqueta}>Taller</span>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {TALLERES.map((t) => {
                    const activo = taller === t.id;
                    return (
                      <button key={t.id} type="button" aria-pressed={activo} onClick={() => setTaller(t.id)} style={{ flex: 1, height: 52, borderRadius: 12, border: `2px solid ${activo ? BLUE : "#7F8DA8"}`, background: activo ? BLUE : WHITE, color: activo ? WHITE : "#0B1B33", fontSize: 16, fontWeight: activo ? 700 : 600, cursor: "pointer" }}>{t.nombre}</button>
                    );
                  })}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label htmlFor="acceso-rol" style={etiqueta}>Rol</label>
                {camino === "foranea" ? (
                  <div style={{ ...campo, display: "flex", alignItems: "center", background: BG, color: BLUE, fontWeight: 700 }}>{ROL_FORANEO}<span style={{ marginLeft: 8, fontSize: 12, fontWeight: 500, color: GRAY }}>único usuario de este camino</span></div>
                ) : (
                  <select id="acceso-rol" value={role} onChange={(e) => setRole(e.target.value)} style={campo}>
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label htmlFor="acceso-pin" style={etiqueta}>PIN</label>
                <input id="acceso-pin" type="password" inputMode="numeric" placeholder="••••" value={pin} onChange={(e) => setPin(e.target.value)} style={campo} onKeyDown={(e) => e.key === "Enter" && entrarTaller()} />
              </div>
              {error && <div style={{ color: RED, fontSize: 13 }}>{error}</div>}
              <button onClick={entrarTaller} style={botonGrande}>{camino === "foranea" ? `Entrar a Foráneas ${nombreTaller}` : `Entrar al taller ${nombreTaller}`}</button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ flex: 1, height: 1, background: BORDER }} />
                <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: "#4A5A75", textTransform: "uppercase" }}>Dirección General</span>
                <div style={{ flex: 1, height: 1, background: BORDER }} />
              </div>
              <button type="button" onClick={() => irA("visor")} style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", minHeight: 64, padding: "10px 16px", boxSizing: "border-box", borderRadius: 12, border: `2px solid ${BLUE}`, background: WHITE, color: BLUE, textAlign: "left", cursor: "pointer" }}>
                {iconoMonitoreo(BLUE, 26)}
                <span style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
                  <span style={{ fontSize: 16, fontWeight: 700 }}>Monitoreo Dirección General</span>
                  <span style={{ fontSize: 12.5, fontWeight: 500, color: "#4A5A75" }}>Solo lectura · requiere PIN de Dirección</span>
                </span>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
              </button>
              <button type="button" onClick={descargarTodas} disabled={descargando} style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", minHeight: 64, padding: "10px 16px", boxSizing: "border-box", borderRadius: 12, border: "2px solid #7F8DA8", background: WHITE, color: BLUE, textAlign: "left", cursor: descargando ? "wait" : "pointer", opacity: descargando ? 0.7 : 1 }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12" /><path d="M7 11l5 5 5-5" /><path d="M4 20h16" /></svg>
                <span style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
                  <span style={{ fontSize: 16, fontWeight: 700 }}>{descargando ? "Preparando el Excel…" : "Reporte de Piso · todas las sucursales"}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 500, color: "#4A5A75" }}>Excel combinado: Casa y Foránea / Sitio, sin entrar</span>
                </span>
              </button>
              {aviso && <div style={{ color: RED, fontSize: 13 }}>{aviso}</div>}
            </div>
          </>
        ) : (
          <>
            <button type="button" onClick={() => irA("taller")} style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 6, minHeight: 44, padding: "0 12px 0 2px", border: "none", background: "transparent", color: BLUE, fontSize: 16, fontWeight: 600, cursor: "pointer" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
              Volver
            </button>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.5, color: BLUE_SOFT }}>{NOMBRE_ORG.toUpperCase()}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {iconoMonitoreo(BLUE, 30)}
                <h1 style={{ margin: 0, fontSize: 26, lineHeight: 1.15, color: BLUE, fontWeight: 700 }}>Monitoreo Dirección General</h1>
              </div>
              <p style={{ margin: 0, fontSize: 14.5, color: "#4A5A75", lineHeight: 1.45 }}>Solo lectura: tarjetas de todos los talleres en vivo (Camino Casa y Foránea / Sitio), cuello de botella y tendencia.</p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label htmlFor="acceso-pin-dir" style={etiqueta}>PIN de Dirección</label>
                <input id="acceso-pin-dir" type="password" inputMode="numeric" placeholder="••••" value={pin} onChange={(e) => setPin(e.target.value)} style={campo} onKeyDown={(e) => e.key === "Enter" && entrarVisor()} />
              </div>
              {error && <div style={{ color: RED, fontSize: 13 }}>{error}</div>}
              <button onClick={entrarVisor} style={botonGrande}>Entrar al monitoreo</button>
            </div>
          </>
        )}
        <div style={{ textAlign: "center", fontSize: 11.5, color: GRAY, letterSpacing: 0.3 }}>Estatus Camino Unidades · V5</div>
      </div>
    </div>
  );
}

function App() {
  const [sesion, setSesion] = useState(() => leerSesion());

  useEffect(() => {
    alVencerSesion = () => { guardarSesionLocal(null); setSesion(null); };
    return () => { alVencerSesion = null; };
  }, []);

  function entrar(x) { guardarSesionLocal(x); setSesion(x); }
  function salir() { guardarSesionLocal(null); setSesion(null); }

  if (!sesion) return <Acceso onEntrar={entrar} />;
  if (sesion.role === ROL_DIRECCION) return <Visor onSalir={salir} />;
  const taller = TALLERES.find((t) => t.id === sesion.taller);
  if (!taller) return <Acceso onEntrar={entrar} />;
  if (sesion.role === ROL_FORANEO) return <ForaneaApp taller={taller} onSalir={salir} />;
  return <TallerApp taller={taller} role={sesion.role} onSalir={salir} />;
}

createRoot(document.getElementById("root")).render(<App />);
