import React, { useState, useEffect, useCallback, useRef } from "react";
import { createRoot } from "react-dom/client";

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
const ROLES = [...new Set(ETAPAS.map((e) => e.rol))];
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
  const etapa = ETAPAS[entrada.etapa - 1];
  const horasEnEtapa = hoursBetween(entrada.inicio, nowISO());
  const ratio = horasEnEtapa / etapa.metaHrs;
  if (ratio <= 1) return { label: "En tiempo", color: GREEN, horasEnEtapa, ratio };
  if (ratio <= 1.5) return { label: "Alerta", color: AMBER, horasEnEtapa, ratio };
  return { label: "Crítico", color: RED, horasEnEtapa, ratio };
}
function calcTotalHoras(u) { return hoursBetween(u.fechaIngreso, u.fechaSalida || nowISO()); }
function comentariosCompletos(historial) {
  return (historial || [])
    .filter((h) => h.comentario)
    .map((h) => `${ETAPAS[h.etapa - 1]?.nombre || h.etapa}: ${h.comentario}`)
    .join("\n");
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
    const s = JSON.parse(localStorage.getItem(SESION_KEY) || "null");
    if (s && s.token && s.exp > Date.now()) return s;
  } catch {}
  return null;
}
function guardarSesionLocal(s) {
  try {
    if (s) localStorage.setItem(SESION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESION_KEY);
  } catch {}
}

async function api(ruta, { method = "GET", body, sinSesion = false } = {}) {
  const headers = { "content-type": "application/json" };
  const s = leerSesion();
  if (s && !sinSesion) headers.authorization = `Bearer ${s.token}`;
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
function useSnapshot(tallerParam, diasHistorico) {
  const [datos, setDatos] = useState(null); // { [taller]: { unidades, historico } }
  const [error, setError] = useState(null);
  const [actualizado, setActualizado] = useState(null);
  const ciclo = useRef(0);

  const cargar = useCallback(async (forzarHistorico = false) => {
    const conHist = forzarHistorico || ciclo.current % 6 === 0;
    ciclo.current += 1;
    try {
      const r = await api(`/api/snapshot?taller=${tallerParam}&dias=${conHist ? diasHistorico : 0}`);
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
  }, [tallerParam, diasHistorico]);

  useEffect(() => {
    let vivo = true;
    ciclo.current = 0;
    cargar(true);
    const t = setInterval(() => { if (vivo) cargar(false); }, POLL_MS);
    return () => { vivo = false; clearInterval(t); };
  }, [cargar]);

  return { datos, error, actualizado, recargar: cargar };
}

// ---- Tiempo acumulado por etapa (horas) a partir del historial ----
function tiemposPorEtapa(u) {
  const horas = ETAPAS.map(() => 0);
  const visitada = ETAPAS.map(() => false);
  const omitida = ETAPAS.map(() => false);
  const ahora = nowISO();
  (u.historial || []).forEach((h) => {
    const i = h.etapa - 1;
    if (i < 0 || i >= ETAPAS.length) return;
    visitada[i] = true;
    if (h.comentario === "Etapa omitida") { omitida[i] = true; return; }
    horas[i] += Math.max(0, hoursBetween(h.inicio, h.fin || ahora));
  });
  return ETAPAS.map((_, i) => ({ horas: horas[i], visitada: visitada[i], omitida: omitida[i] && horas[i] === 0 }));
}

// ---- Cuello de botella: etapa con más unidades en proceso ----
function calcularCuelloBotella(unidades) {
  const filas = ETAPAS.map((et) => {
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

function resumenAoa(talleres) {
  const cubos7 = cubosTendencia("dias");
  const filas = [[NOMBRE_ORG], ["Resumen ejecutivo de talleres"], ["Generado", new Date().toLocaleString("es-MX")], [],
    ["Taller", "En proceso", "En tiempo", "Alerta", "Crítico", "Por aceptar", "Etapa con más unidades", "Unidades en esa etapa", "Ingresaron (7 días)", "Entregaron (7 días)"]];
  const tot = { n: 0, a: 0, b: 0, c: 0, p: 0, i: 0, e: 0 };
  talleres.forEach(({ taller, data }) => {
    const est = data.unidades.map((u) => calcEstatus(u).label);
    const cuenta = (l) => est.filter((x) => x === l).length;
    const cb = calcularCuelloBotella(data.unidades);
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

function resumenTSV(talleres) {
  return resumenAoa(talleres).map((f) => f.join("\t")).join("\n");
}

function construirLibro(XLSX, talleres) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumenAoa(talleres)), "Resumen");

  const proceso = [["Taller", "VIN", "Cliente", "Placa", "OT", "Etapa", "Estatus", "Horas en la etapa", "Meta de la etapa (h)", "Clasificación", "TOT", "Pendiente de aceptar"]];
  talleres.forEach(({ taller, data }) => data.unidades.forEach((u) => {
    const es = calcEstatus(u);
    const et = ETAPAS[u.etapaActual - 1];
    const cl = COLOR_TIPO_OPCIONES.find((o) => o.id === u.colorTipo);
    proceso.push([taller.nombre, u.vin, u.cliente, u.placa || "", u.ot || "", et.nombre, es.label, r2(es.horasEnEtapa || 0), et.metaHrs, cl ? cl.label : "", u.tot ? "Sí" : "No", u.saltoPendiente ? "Sí" : "No"]);
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(proceso), "En proceso");

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

  const tiempos = [["Taller", "VIN", "Cliente", "Etapa", "Responsable", "Inicio", "Fin", "Horas", "Comentario"]];
  talleres.forEach(({ taller, data }) => [...data.unidades, ...data.historico].forEach((u) => (u.historial || []).forEach((h) => {
    const et = ETAPAS[h.etapa - 1];
    tiempos.push([taller.nombre, u.vin, u.cliente, et ? et.nombre : h.etapa, et ? et.rol : "", h.inicio, h.fin || "En curso", r2(Math.max(0, hoursBetween(h.inicio, h.fin || nowISO()))), h.comentario || ""]);
  })));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(tiempos), "Tiempos por etapa");
  return wb;
}

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

function CaminoUnidad({ etapaActual, colorEstatus, colorCarrito, tiempoLabel, comentario, saltoPendiente }) {
  const n = ETAPAS.length;
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
        {ETAPAS.map((e, i) => {
          const p = n === 1 ? 0 : (i / (n - 1)) * 100;
          const alcanzada = e.id <= Math.min(etapaActual, n);
          return <div key={e.id} title={e.nombre} style={{ position: "absolute", top: 44, left: `calc(4% + ${p}% * 0.92)`, transform: "translateX(-50%)", width: 11, height: 11, borderRadius: "50%", background: alcanzada ? BLUE_SOFT : WHITE, border: `2px solid ${alcanzada ? BLUE_SOFT : BORDER}` }} />;
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", padding: "0 2%" }}>
        {ETAPAS.map((e) => <div key={e.id} style={{ flex: 1, textAlign: "center", fontSize: 9, lineHeight: 1.15, color: e.id === Math.min(etapaActual, n) ? BLUE : GRAY, fontWeight: e.id === Math.min(etapaActual, n) ? 700 : 500 }}>{e.nombre}</div>)}
      </div>
    </div>
  );
}

const inputStyle = { border: `1px solid ${BORDER}`, borderRadius: 6, padding: "8px 10px", fontSize: 13, color: BLUE_DARK, fontFamily: "inherit", width: "100%", boxSizing: "border-box" };
const btnPrimary = { background: BLUE, color: WHITE, border: "none", borderRadius: 6, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const btnSecondary = { background: WHITE, color: BLUE, border: `1px solid ${BORDER}`, borderRadius: 6, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const btnWarn = { background: WHITE, color: RED, border: `1px solid ${RED}`, borderRadius: 6, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
function Bloque({ children }) { return <div style={{ display: "flex", flexDirection: "column", gap: 8, background: BG, borderRadius: 8, padding: 12, marginTop: 10 }}>{children}</div>; }

function UnidadCard({ unidad, rol, onTransicion, onArchivar, onEliminar, onAceptar }) {
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
        <AccionEtapa unidad={unidad} etapaDef={etapaDef} puedeActuar={puedeActuar} onTransicion={(b) => onTransicion({ ...b, desde: unidad.etapaActual })} onArchivar={(b) => onArchivar({ ...b, desde: unidad.etapaActual })} onAceptar={onAceptar} />
      </div>
    </div>
  );
}

function AccionEtapa({ unidad, etapaDef, puedeActuar, onTransicion, onArchivar, onAceptar }) {
  if (!puedeActuar) return <div style={{ fontSize: 12, color: GRAY, fontStyle: "italic", marginTop: 10 }}>Solo <b>{etapaDef.rol}</b> puede actualizar esta etapa</div>;
  if ((unidad.etapaActual === 5 || unidad.etapaActual === 6) && unidad.saltoPendiente) {
    return <PanelAceptarSalto etapaDef={etapaDef} onAceptar={onAceptar} />;
  }
  switch (unidad.etapaActual) {
    case 2: return <EtapaRecepcion unidad={unidad} onTransicion={onTransicion} />;
    case 3: return <EtapaAsignar unidad={unidad} onTransicion={onTransicion} />;
    case 4: return <EtapaDiagnostico unidad={unidad} onTransicion={onTransicion} />;
    case 5: return <EtapaSurtimiento unidad={unidad} onTransicion={onTransicion} />;
    case 6: return <EtapaReparacion unidad={unidad} onTransicion={onTransicion} />;
    case 7: return <EtapaValidacionTaller unidad={unidad} onTransicion={onTransicion} />;
    case 8: return <EtapaValidacionServicio unidad={unidad} onArchivar={onArchivar} onTransicion={onTransicion} />;
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

function EtapaRecepcion({ unidad, onTransicion }) {
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
    </Bloque>
  );
}

function EtapaAsignar({ unidad, onTransicion }) {
  const [t1, setT1] = useState(unidad.tecnico1 || ""); const [t2, setT2] = useState(unidad.tecnico2 || ""); const [t3, setT3] = useState(unidad.tecnico3 || "");
  const [w1, setW1] = useState(unidad.trabajo1 || ""); const [w2, setW2] = useState(unidad.trabajo2 || ""); const [w3, setW3] = useState(unidad.trabajo3 || "");
  function confirmar() {
    const resumen = [t1 && `${t1}: ${w1 || "s/desc"}`, t2 && `${t2}: ${w2 || "s/desc"}`, t3 && `${t3}: ${w3 || "s/desc"}`].filter(Boolean).join(" | ");
    onTransicion({ patch: { tecnico1: t1, tecnico2: t2, tecnico3: t3, trabajo1: w1, trabajo2: w2, trabajo3: w3 }, destino: 4, comentario: resumen || "Sin técnico asignado aún" });
  }
  return (
    <Bloque>
      {[[t1, setT1, w1, setW1, "Técnico 1", "Trabajo 1"], [t2, setT2, w2, setW2, "Técnico 2 (opcional)", "Trabajo 2"], [t3, setT3, w3, setW3, "Técnico 3 (opcional)", "Trabajo 3"]].map(([tv, tset, wv, wset, tl, wl], i) => (
        <div key={i} style={{ display: "flex", gap: 8 }}>
          <input placeholder={tl} value={tv} onChange={(e) => tset(e.target.value)} style={inputStyle} />
          <input placeholder={wl} value={wv} onChange={(e) => wset(e.target.value)} style={inputStyle} />
        </div>
      ))}
      <button style={btnPrimary} onClick={confirmar}>Enviar a Diagnóstico</button>
    </Bloque>
  );
}

function EtapaDiagnostico({ unidad, onTransicion }) {
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
    </Bloque>
  );
}

function EtapaSurtimiento({ unidad, onTransicion }) {
  const [completo, setCompleto] = useState(unidad.surtidoCompleto === true);
  const [pendiente, setPendiente] = useState(unidad.pendienteSurtido || "");
  return (
    <Bloque>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}><input type="checkbox" checked={completo} onChange={(e) => setCompleto(e.target.checked)} /> Surtido completo</label>
      {!completo && <textarea placeholder="Detalle de lo pendiente por surtir" rows={2} value={pendiente} onChange={(e) => setPendiente(e.target.value)} style={{ ...inputStyle, resize: "vertical" }} />}
      <button style={btnPrimary} onClick={() => onTransicion({ patch: { surtidoCompleto: completo, pendienteSurtido: completo ? "" : pendiente, saltoPendiente: true }, destino: 6, comentario: completo ? "Surtido completo" : `Surtido incompleto: ${pendiente}` })}>Enviar a Reparación</button>
    </Bloque>
  );
}

function EtapaReparacion({ unidad, onTransicion }) {
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
            <button style={{ ...btnWarn, opacity: motivo.trim() ? 1 : 0.5, cursor: motivo.trim() ? "pointer" : "not-allowed" }} disabled={!motivo.trim()} onClick={() => onTransicion({ patch: { reparacion: rep, tot }, destino: 5, motivo: motivo.trim(), comentario: `Motivo regreso a surtimiento: ${motivo.trim()}` })}>Confirmar regreso</button>
            <button style={btnSecondary} onClick={() => setRegresando(false)}>Cancelar</button>
          </div>
        </>
      )}
    </Bloque>
  );
}

function EtapaValidacionTaller({ unidad, onTransicion }) {
  const [auditado, setAuditado] = useState(unidad.auditoriaTaller === true);
  const [regresando, setRegresando] = useState(false);
  const [motivo, setMotivo] = useState("");
  return (
    <Bloque>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}><input type="checkbox" checked={auditado} onChange={(e) => setAuditado(e.target.checked)} /> Auditoría realizada</label>
      {!regresando ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={{ ...btnPrimary, opacity: auditado ? 1 : 0.5, cursor: auditado ? "pointer" : "not-allowed" }} disabled={!auditado} onClick={() => onTransicion({ patch: { auditoriaTaller: true }, destino: 8, comentario: "Auditoría de taller conforme" })}>Enviar a Validación Servicio</button>
          <button style={btnWarn} onClick={() => setRegresando(true)}>Regresar a Reparación</button>
        </div>
      ) : (
        <>
          <textarea placeholder="Motivo del regreso a reparación" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} style={{ ...inputStyle, resize: "vertical" }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button style={btnWarn} onClick={() => onTransicion({ patch: { auditoriaTaller: false }, destino: 6, motivo: motivo.trim(), comentario: `Motivo regreso a reparación: ${motivo.trim()}` })}>Confirmar regreso</button>
            <button style={btnSecondary} onClick={() => setRegresando(false)}>Cancelar</button>
          </div>
        </>
      )}
    </Bloque>
  );
}

function EtapaValidacionServicio({ unidad, onArchivar, onTransicion }) {
  const [auditado, setAuditado] = useState(unidad.auditoriaServicio === true);
  const [regresando, setRegresando] = useState(false);
  const [motivo, setMotivo] = useState("");
  return (
    <Bloque>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}><input type="checkbox" checked={auditado} onChange={(e) => setAuditado(e.target.checked)} /> Auditoría de Servicio</label>
      {!regresando ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={{ ...btnPrimary, background: GREEN, opacity: auditado ? 1 : 0.5, cursor: auditado ? "pointer" : "not-allowed" }} disabled={!auditado} onClick={() => onArchivar({ patch: { auditoriaServicio: true }, comentario: "Disponibilidad confirmada por Servicio" })}>Confirmar disponibilidad</button>
          <button style={btnWarn} onClick={() => setRegresando(true)}>Regresar a Validación Taller</button>
        </div>
      ) : (
        <>
          <textarea placeholder="Motivo del regreso a validación taller" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} style={{ ...inputStyle, resize: "vertical" }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button style={btnWarn} onClick={() => onTransicion({ patch: { auditoriaServicio: false }, destino: 7, motivo: motivo.trim(), comentario: `Motivo regreso a validación taller: ${motivo.trim()}` })}>Confirmar regreso</button>
            <button style={btnSecondary} onClick={() => setRegresando(false)}>Cancelar</button>
          </div>
        </>
      )}
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


// ======================================================================
//  App de operación de UN taller
// ======================================================================
function TallerApp({ taller, role, onSalir }) {
  const snap = useSnapshot(taller.id, 90);
  const data = snap.datos ? snap.datos[taller.id] || vacio() : null;
  const [aviso, setAviso] = useState(null); // { texto, error }
  const [vista, setVista] = useState("panel");
  const [busqueda, setBusqueda] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 30000);
    return () => clearInterval(t);
  }, []);

  async function ejecutar(accion) {
    try {
      await accion();
      setAviso(null);
    } catch (e) {
      setAviso({ texto: e.message, error: true });
    }
    await snap.recargar(true);
  }

  const crearUnidad = ({ vin, placa, cliente }) => {
    setShowForm(false);
    return ejecutar(() => api("/api/units", { method: "POST", body: { vin, placa, cliente } }));
  };
  const aplicarTransicion = (id, { desde, patch, destino, comentario, insertarOmitida, motivo }) =>
    ejecutar(() => api("/api/unit-action", { method: "POST", body: { id, action: "transition", desde, patch, destino, comentario, insertarOmitida, motivo } }));
  const archivarUnidad = (id, { desde, patch, comentario }) =>
    ejecutar(() => api("/api/unit-action", { method: "POST", body: { id, action: "archive", desde, patch, comentario } }));
  const aceptarSalto = (id) =>
    ejecutar(() => api("/api/unit-action", { method: "POST", body: { id, action: "accept" } }));
  const eliminarUnidad = (id) => {
    if (!window.confirm("¿Eliminar esta unidad? Esta acción no se puede deshacer.")) return null;
    return ejecutar(() => api("/api/unit-action", { method: "POST", body: { id, action: "delete" } }));
  };

  async function exportarExcel() {
    setExportando(true);
    try {
      const r = await api(`/api/snapshot?taller=${taller.id}&dias=365`);
      const mod = await import("xlsx");
      const XLSX = mod.default || mod;
      XLSX.writeFile(construirLibro(XLSX, [{ taller, data: r.talleres[taller.id] || vacio() }]), `tiempos_${taller.id}_${new Date().toISOString().slice(0, 10)}.xlsx`);
      setAviso(null);
    } catch (e) {
      setAviso({ texto: `No se pudo generar el Excel: ${e.message}`, error: true });
    }
    setExportando(false);
  }

  if (!data) {
    return <div style={{ minHeight: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: WHITE }}><p style={{ color: BLUE, fontFamily: "system-ui" }}>Cargando taller {taller.nombre}…</p></div>;
  }

  const lista = data.unidades;
  const historico = data.historico;
  const resumen = ETAPAS.map((et) => lista.filter((u) => u.etapaActual === et.id).length);
  const q = busqueda.trim().toLowerCase();
  const filtradas = !q ? lista : lista.filter((u) => (u.vin || "").toLowerCase().includes(q) || (u.ot || "").toLowerCase().includes(q));
  const mensaje = aviso || (snap.error ? { texto: snap.error, error: true } : null);

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
          <button onClick={exportarExcel} disabled={exportando} style={{ background: "rgba(255,255,255,0.12)", color: WHITE, border: "1px solid rgba(255,255,255,0.35)", borderRadius: 6, padding: "10px 14px", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>{exportando ? "Preparando…" : "⬇ Excel"}</button>
          {role === "Vigilante" && (
            <button onClick={() => setShowForm(true)} style={{ background: WHITE, color: BLUE, border: "none", borderRadius: 6, padding: "10px 16px", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>+ Ingresar unidad</button>
          )}
        </div>
      </div>

      {mensaje && <div style={{ background: mensaje.error ? "#FDECEC" : "#E8EEF9", color: mensaje.error ? RED : BLUE, padding: "8px 24px", fontSize: 13 }}>{mensaje.texto}</div>}

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
                {lista.length === 0 ? "No hay unidades en proceso en este taller." : "No hay unidades que coincidan."}
              </div>
            )}
            {filtradas.map((u) => (
              <UnidadCard key={u.id} unidad={u} rol={role} onTransicion={(b) => aplicarTransicion(u.id, b)} onArchivar={(b) => archivarUnidad(u.id, b)} onEliminar={role === "Supervisor Mantenimiento" ? () => eliminarUnidad(u.id) : null} onAceptar={() => aceptarSalto(u.id)} />
            ))}
          </div>
        </>
      ) : (
        <div style={{ padding: "16px 24px 32px" }}>
          <div style={{ fontSize: 12, color: GRAY, marginBottom: 10 }}>Unidades entregadas en los últimos 90 días. Para más historia usa "⬇ Excel".</div>
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
//  MONITOREO Dirección General (celular): estatus por tarjeta, indicadores y tendencia
// ======================================================================
const nombreCorto = (n) => n.replace(" (Disponible)", "");
const hhmmss = (d) => (d ? d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—");
const chipVisor = (txt, color, key) => <span key={key || txt} style={{ background: color, color: WHITE, borderRadius: 999, padding: "3px 9px", fontSize: 11.5, fontWeight: 700 }}>{txt}</span>;

function TarjetaVisor({ unidad }) {
  const [abierto, setAbierto] = useState(false);
  const estatus = calcEstatus(unidad);
  const etapaDef = ETAPAS[unidad.etapaActual - 1];
  const tiempoLabel = fmtDiasHorasMin(estatus.horasEnEtapa || 0);
  const tiempos = tiemposPorEtapa(unidad);
  const maxH = Math.max(0.0001, ...tiempos.map((t) => t.horas));
  const lineas = comentariosCompletos(unidad.historial).split("\n").filter(Boolean);
  const clasif = COLOR_TIPO_OPCIONES.find((o) => o.id === unidad.colorTipo);

  return (
    <div onClick={() => setAbierto((v) => !v)} style={{ border: `1px solid ${abierto ? BLUE : BORDER}`, borderRadius: 12, overflow: "hidden", background: WHITE, cursor: "pointer" }}>
      <div style={{ background: BLUE, padding: "9px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: WHITE, fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{unidad.vin}</div>
          <div style={{ color: "#C9D6EE", fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {unidad.cliente}{unidad.placa ? ` · ${unidad.placa}` : ""}{unidad.ot ? ` · OT ${unidad.ot}` : ""}
          </div>
        </div>
        <span style={{ background: estatus.color, color: WHITE, borderRadius: 999, padding: "4px 10px", fontSize: 11.5, fontWeight: 700, flexShrink: 0 }}>{estatus.label}</span>
      </div>
      <div style={{ padding: "11px 12px 6px", display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: BLUE }}>Etapa {unidad.etapaActual}/{ETAPAS.length} · {nombreCorto(etapaDef.nombre)}</div>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: estatus.color, whiteSpace: "nowrap" }}>lleva {tiempoLabel}</div>
      </div>
      <div style={{ padding: "0 12px 10px", fontSize: 11.5, color: GRAY }}>{abierto ? "▾ Ocultar detalle" : "▸ Toca para ver el detalle"}</div>

      {abierto && (
        <div onClick={(e) => e.stopPropagation()} style={{ borderTop: `1px solid ${BORDER}`, padding: "10px 12px 12px", display: "flex", flexDirection: "column", gap: 12, cursor: "default" }}>
          {(clasif || unidad.tot || unidad.saltoPendiente) && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {clasif && chipVisor(clasif.label, clasif.color)}
              {unidad.tot && chipVisor("TOT", CELESTE)}
              {unidad.saltoPendiente && chipVisor(`⏳ Pendiente de aceptar por ${etapaDef.rol}`, AMBER)}
            </div>
          )}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: BLUE_DARK, marginBottom: 6 }}>Tiempos por etapa</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {ETAPAS.map((et, i) => {
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

function PanelCuelloBotella({ grupos }) {
  return (
    <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: BLUE_DARK, textTransform: "uppercase", letterSpacing: 0.2 }}>Cuello de botella · etapa con más unidades</div>
      {grupos.map((g) => {
        const cb = calcularCuelloBotella(g.unidades);
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

function SeccionTaller({ taller, hook, mostrarTitulo, orden }) {
  const unidades = hook.data ? hook.data.unidades : [];
  const ordenadas = [...unidades].sort((a, b) => {
    const ha = calcEstatus(a).horasEnEtapa || 0, hb = calcEstatus(b).horasEnEtapa || 0;
    return orden === "desc" ? hb - ha : ha - hb;
  });
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {mostrarTitulo && (
        <h2 style={{ margin: "6px 0 0", fontSize: 19, color: BLUE }}>
          Taller {taller.nombre} <span style={{ fontSize: 14, fontWeight: 600, color: GRAY }}>· {unidades.length} en proceso</span>
        </h2>
      )}
      {hook.error && <div style={{ background: "#FDECEC", color: RED, borderRadius: 8, padding: "6px 10px", fontSize: 12.5 }}>{hook.error}</div>}
      {!hook.data ? (
        <div style={{ color: GRAY, fontSize: 13, padding: 12 }}>Cargando…</div>
      ) : unidades.length === 0 ? (
        <div style={{ border: `1px dashed ${BORDER}`, borderRadius: 10, padding: 18, textAlign: "center", color: GRAY, fontSize: 13 }}>Sin unidades en proceso en {taller.nombre}.</div>
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
  const snap = useSnapshot("all", 35);
  const hooks = {};
  TALLERES.forEach((t) => {
    hooks[t.id] = { data: snap.datos ? snap.datos[t.id] || vacio() : null, error: snap.error, actualizado: snap.actualizado };
  });
  const [exportando, setExportando] = useState(false);
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
  const listaTalleres = TALLERES.map((t) => ({ taller: t, data: datosDe(t.id) }));

  const recargarTodo = () => snap.recargar(true);
  async function exportarExcel() {
    setExportando(true);
    try {
      const r = await api("/api/snapshot?taller=all&dias=365");
      const mod = await import("xlsx");
      const XLSX = mod.default || mod;
      const lista = TALLERES.map((t) => ({ taller: t, data: r.talleres[t.id] || vacio() }));
      XLSX.writeFile(construirLibro(XLSX, lista), `resumen_talleres_${new Date().toISOString().slice(0, 10)}.xlsx`);
      setMsg(null);
    } catch (e) { setMsg(`No se pudo generar el Excel: ${e.message}`); }
    setExportando(false);
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
        <div style={{ color: "#C9D6EE", fontSize: 11.5, fontWeight: 600, margin: "10px 0 5px" }}>Unidades en proceso</div>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${TALLERES.length + 1}, minmax(0, 1fr))`, gap: 5 }}>
          {tabBtn("todos", "Todos", nTotal)}
          {TALLERES.map((t) => tabBtn(t.id, t.nombre, conteo(t.id)))}
        </div>
      </div>

      <div style={{ padding: "12px 12px 40px", display: "flex", flexDirection: "column", gap: 14, maxWidth: 720, margin: "0 auto" }}>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={exportarExcel} disabled={exportando} style={accion}>{exportando ? "Preparando…" : "⬇ Exportar Excel"}</button>
          <button onClick={() => setVerTexto(true)} style={accion}>📋 Ver resumen</button>
        </div>
        {msg && <div style={{ background: "#FDECEC", color: RED, borderRadius: 8, padding: "6px 10px", fontSize: 12.5 }}>{msg}</div>}

        <PanelCuelloBotella grupos={grupos} />
        <PanelTendencia unidades={unidadesVis} historico={historicoVis} />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: BLUE_DARK }}>Tarjetas · por tiempo detenido</div>
          <button onClick={() => setOrden((o) => (o === "desc" ? "asc" : "desc"))} style={{ ...accion, padding: "6px 10px", fontSize: 12 }}>{orden === "desc" ? "↓ Mayor primero" : "↑ Menor primero"}</button>
        </div>

        {visibles.map((t) => (
          <SeccionTaller key={t.id} taller={t} hook={hooks[t.id]} mostrarTitulo={tab === "todos"} orden={orden} />
        ))}
      </div>

      {verTexto && <ModalResumen texto={resumenTSV(listaTalleres)} onCerrar={() => setVerTexto(false)} />}
    </div>
  );
}

// ======================================================================
//  Acceso (taller + rol + PIN, o Monitoreo Dirección General) y raíz
// ======================================================================
function Acceso({ onEntrar }) {
  const [modo, setModo] = useState("taller"); // taller | visor (monitoreo)
  const [taller, setTaller] = useState(TALLERES[0].id);
  const [role, setRole] = useState(ROLES[0]);
  const [pin, setPin] = useState("");
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(false);

  function irA(m) { setModo(m); setError(null); setPin(""); }

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
  const entrarTaller = () => entrar({ taller, role, pin: pin.trim() });
  const entrarVisor = () => entrar({ role: ROL_DIRECCION, pin: pin.trim() });

  const campo = { ...inputStyle, height: 48, fontSize: 16, borderRadius: 10, border: "1.5px solid #7F8DA8", padding: "0 12px" };
  const etiqueta = { fontSize: 13, fontWeight: 600, color: "#33445F" };
  const botonGrande = { ...btnPrimary, height: 52, borderRadius: 12, fontSize: 16, fontWeight: 700, opacity: cargando ? 0.7 : 1 };
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
                Seguimiento de unidades con ingreso a mantenimiento{" "}
                <span style={{ display: "block", fontSize: 28, marginTop: 2 }}>Camino Casa</span>
              </h1>
              <p style={{ margin: 0, fontSize: 15, color: "#4A5A75" }}>Entra a tu taller con tu rol y PIN</p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={etiqueta}>Taller</span>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {TALLERES.map((t) => {
                    const activo = taller === t.id;
                    return (
                      <button key={t.id} type="button" aria-pressed={activo} onClick={() => { setTaller(t.id); setError(null); }} style={{ flex: 1, height: 52, borderRadius: 12, border: `2px solid ${activo ? BLUE : "#7F8DA8"}`, background: activo ? BLUE : WHITE, color: activo ? WHITE : "#0B1B33", fontSize: 16, fontWeight: activo ? 700 : 600, cursor: "pointer" }}>{t.nombre}</button>
                    );
                  })}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label htmlFor="acceso-rol" style={etiqueta}>Rol</label>
                <select id="acceso-rol" value={role} onChange={(e) => { setRole(e.target.value); setError(null); }} style={campo}>
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label htmlFor="acceso-pin" style={etiqueta}>PIN</label>
                <input id="acceso-pin" type="password" inputMode="numeric" autoComplete="off" placeholder="••••" value={pin} onChange={(e) => setPin(e.target.value)} style={campo} onKeyDown={(e) => e.key === "Enter" && entrarTaller()} />
              </div>
              {error && <div style={{ color: RED, fontSize: 13 }}>{error}</div>}
              <button onClick={entrarTaller} disabled={cargando} style={botonGrande}>{cargando ? "Entrando…" : `Entrar al taller ${nombreTaller}`}</button>
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
              <p style={{ margin: 0, fontSize: 14.5, color: "#4A5A75", lineHeight: 1.45 }}>Solo lectura: tarjetas de todos los talleres en vivo, cuello de botella y tendencia.</p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label htmlFor="acceso-pin-dir" style={etiqueta}>PIN de Dirección</label>
                <input id="acceso-pin-dir" type="password" inputMode="numeric" autoComplete="off" placeholder="••••" value={pin} onChange={(e) => setPin(e.target.value)} style={campo} onKeyDown={(e) => e.key === "Enter" && entrarVisor()} />
              </div>
              {error && <div style={{ color: RED, fontSize: 13 }}>{error}</div>}
              <button onClick={entrarVisor} disabled={cargando} style={botonGrande}>{cargando ? "Entrando…" : "Entrar al monitoreo"}</button>
            </div>
          </>
        )}
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

  function entrar(s) { guardarSesionLocal(s); setSesion(s); }
  function salir() { guardarSesionLocal(null); setSesion(null); }

  if (!sesion) return <Acceso onEntrar={entrar} />;
  if (sesion.role === ROL_DIRECCION) return <Visor onSalir={salir} />;
  const taller = TALLERES.find((t) => t.id === sesion.taller);
  if (!taller) return <Acceso onEntrar={entrar} />;
  return <TallerApp taller={taller} role={sesion.role} onSalir={salir} />;
}

createRoot(document.getElementById("root")).render(<App />);
