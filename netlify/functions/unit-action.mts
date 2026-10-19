import type { Context, Config } from "@netlify/functions";
import { db, json, txt, autenticar, rowToUnit, ETAPAS, ETAPAS_FORANEA, ROL_DIRECCION, ROL_FORANEO } from "./_lib.mts";

// POST /api/unit-action
//   { id, action: "transition", desde, destino, patch, comentario, motivo?, insertarOmitida? }
//   { id, action: "archive",    desde, patch, comentario }
//   { id, action: "borrador",   desde, patch, comentario }   guarda lo capturado SIN cambiar de etapa
//   { id, action: "accept" }
//   { id, action: "delete" }
// Sirve a los dos caminos: Casa (8 etapas, un rol por etapa) y Foránea / Sitio (6 etapas, un solo rol).

// Movimientos permitidos (etapa actual -> destinos)
const TRANS_CASA: Record<number, number[]> = { 2: [3], 3: [4], 4: [5, 6], 5: [6], 6: [7, 5], 7: [8, 6], 8: [7] };
const TRANS_FORANEA: Record<number, number[]> = { 1: [2], 2: [3, 5], 3: [4, 2], 4: [5], 5: [6, 3], 6: [5] };
// Saltos (Camino Casa) que exigen que la etapa que recibe los acepte: Diagnóstico->Surtimiento, Surtimiento->Reparación, Reparación->Surtimiento
const SALTOS_CON_ACEPTACION = [[4, 5], [5, 6], [6, 5]];

// Qué campos puede escribir cada etapa
const CAMPOS_CASA: Record<number, string[]> = {
  2: ["vin", "ot", "motivoIngreso", "colorTipo"],
  3: ["tecnico1", "tecnico2", "tecnico3", "trabajo1", "trabajo2", "trabajo3", "obsAsignacion"],
  4: ["diagnostico", "tot"],
  5: ["surtidoCompleto", "pendienteSurtido"],
  6: ["reparacion", "tot"],
  7: ["auditoriaTaller", "obsTaller"],
  8: ["auditoriaServicio", "obsServicio"],
};
const CAMPOS_FORANEA: Record<number, string[]> = {
  1: ["lugarTipo", "lugarNombre", "ciudad", "ot", "motivoIngreso", "contacto"],
  2: ["diagnostico"],
  3: ["cotFolio", "cotMonto", "cotAutorizo", "cotNota"],
  4: ["fechaCompromiso", "notaAutorizada"],
  5: ["reparacion"],
  6: ["validada", "obsDisponible"],
};
const COL: Record<string, string> = {
  vin: "vin", ot: "ot", motivoIngreso: "motivo_ingreso",
  tecnico1: "tecnico1", tecnico2: "tecnico2", tecnico3: "tecnico3",
  trabajo1: "trabajo1", trabajo2: "trabajo2", trabajo3: "trabajo3",
  diagnostico: "diagnostico", surtidoCompleto: "surtido_completo", pendienteSurtido: "pendiente_surtido",
  reparacion: "reparacion", auditoriaTaller: "auditoria_taller", auditoriaServicio: "auditoria_servicio",
  colorTipo: "color_tipo", tot: "tot",
  obsAsignacion: "obs_asignacion", obsTaller: "obs_taller", obsServicio: "obs_servicio",
  lugarTipo: "lugar_tipo", lugarNombre: "lugar_nombre", ciudad: "ciudad", contacto: "contacto",
  cotFolio: "cot_folio", cotMonto: "cot_monto", cotAutorizo: "cot_autorizo", cotNota: "cot_nota",
  fechaCompromiso: "fecha_compromiso", notaAutorizada: "nota_autorizada", validada: "validada", obsDisponible: "obs_disponible",
};
const BOOLEANOS = ["tot", "auditoriaTaller", "auditoriaServicio", "validada"];
const LARGO: Record<string, number> = {
  vin: 40, ot: 40, motivoIngreso: 500, tecnico1: 80, tecnico2: 80, tecnico3: 80,
  trabajo1: 300, trabajo2: 300, trabajo3: 300, diagnostico: 1000, pendienteSurtido: 500, reparacion: 1000,
  obsAsignacion: 1000, obsTaller: 1000, obsServicio: 1000,
  lugarNombre: 120, ciudad: 80, contacto: 120, cotFolio: 60, cotMonto: 30, cotAutorizo: 120, cotNota: 1000, notaAutorizada: 1000, obsDisponible: 1000,
};
const COLORES = ["verde", "amarillo", "naranja"];

const err = (status: number, error: string, code?: string) => json({ error, ...(code ? { code } : {}) }, status);
const conflicto = () => err(409, "Otra persona ya movió esa unidad de etapa. Se actualizó la vista.", "conflicto");

// Aplica a `n` solo los campos que la etapa puede escribir. Devuelve un mensaje de error si algo es inválido.
function aplicarPatch(n: any, u: any, patch: any, permitidos: string[], parcial: boolean): string | null {
  for (const k of permitidos) {
    if (!(k in patch)) continue;
    const v = patch[k];
    if (k === "surtidoCompleto") n.surtido_completo = v === true ? true : v === false ? false : null;
    else if (BOOLEANOS.includes(k)) n[COL[k]] = v === true;
    else if (k === "colorTipo") {
      if (parcial && (v === "" || v == null)) continue; // en un borrador puede faltar
      if (!COLORES.includes(v)) return "Clasificación de color inválida";
      n.color_tipo = v;
    } else if (k === "lugarTipo") n.lugar_tipo = v === "sitio" ? "sitio" : "agencia";
    else if (k === "fechaCompromiso") {
      if (!v) n.fecha_compromiso = null;
      else { const d = new Date(String(v)); if (isNaN(d.getTime())) return "Fecha compromiso inválida"; n.fecha_compromiso = d.toISOString(); }
    } else n[COL[k]] = txt(v, LARGO[k] ?? 300);
  }
  return null;
}

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") return err(405, "Método no permitido");

  const sesion = await autenticar(req);
  if (!sesion) return err(401, "Sesión inválida o vencida");
  if (sesion.role === ROL_DIRECCION) return err(403, "El monitoreo de Dirección es de solo lectura");

  const body: any = await req.json().catch(() => ({}));
  const id = txt(body.id, 60);
  const action = txt(body.action, 20);
  if (!id || !["transition", "archive", "accept", "delete", "borrador"].includes(action)) return err(400, "Solicitud inválida");

  const rows = await db.sql`SELECT * FROM units WHERE id = ${id}`;
  const u = rows[0];
  if (!u) return err(404, "Unidad no encontrada");
  if (u.taller !== sesion.taller) return err(403, "Esa unidad es de otro taller");

  const foranea = u.camino === "foranea";
  const ETS = foranea ? ETAPAS_FORANEA : ETAPAS;
  const TRANS = foranea ? TRANS_FORANEA : TRANS_CASA;
  const CAMPOS = foranea ? CAMPOS_FORANEA : CAMPOS_CASA;

  if (action === "delete") {
    const quien = foranea ? ROL_FORANEO : "Supervisor Mantenimiento";
    if (sesion.role !== quien) return err(403, `Solo el ${quien} puede eliminar unidades`);
    await db.sql`DELETE FROM units WHERE id = ${id} AND taller = ${sesion.taller}`;
    return json({ ok: true });
  }

  if (u.archived) return err(409, "La unidad ya fue entregada", "conflicto");
  const etapaDef = ETS[u.etapa_actual - 1];
  // Si la unidad ya cambió de etapa (otra persona la movió), se avisa eso antes que cualquier otra cosa
  if (["transition", "archive", "borrador"].includes(action) && Number(body.desde) !== u.etapa_actual) return conflicto();
  if (sesion.role !== etapaDef.rol) return err(403, `Solo ${etapaDef.rol} puede actualizar esta etapa`);

  const ahora = new Date().toISOString();

  // ---------- aceptar salto de etapa (solo Camino Casa) ----------
  if (action === "accept") {
    if (!u.salto_pendiente) return conflicto();
    const historial = [...(u.historial || []), { etapa: u.etapa_actual, inicio: ahora, fin: ahora, comentario: `Salto de etapa aceptado por ${sesion.role}` }];
    const r = await db.sql`
      UPDATE units SET salto_pendiente = FALSE, historial = ${JSON.stringify(historial)}::jsonb
      WHERE id = ${id} AND salto_pendiente = TRUE AND archived = FALSE
      RETURNING *`;
    if (!r.length) return conflicto();
    return json(rowToUnit(r[0]));
  }

  if (u.salto_pendiente) return err(409, "Primero acepta el salto de etapa", "salto_pendiente");

  const comentario = txt(body.comentario, 1500);
  const patch = body.patch && typeof body.patch === "object" ? body.patch : {};

  // aplica solo los campos que esta etapa puede escribir
  const n: any = { ...u };
  n.fecha_compromiso = u.fecha_compromiso ? new Date(u.fecha_compromiso).toISOString() : null;
  const malo = aplicarPatch(n, u, patch, CAMPOS[u.etapa_actual] || [], action === "borrador");
  if (malo) return err(400, malo);

  const historial = [...(u.historial || [])];
  const idx = historial.findIndex((h: any) => h.fin == null);

  // Todas las columnas que puede modificar una acción (los campos no tocados conservan su valor)
  const guardar = async (extra: { etapa: number; salto: boolean; nota: string; hist: any[]; archivar?: boolean }) => {
    const donde = extra.archivar
      ? db.sql`UPDATE units SET
          vin = ${n.vin}, ot = ${n.ot}, motivo_ingreso = ${n.motivo_ingreso},
          tecnico1 = ${n.tecnico1}, tecnico2 = ${n.tecnico2}, tecnico3 = ${n.tecnico3},
          trabajo1 = ${n.trabajo1}, trabajo2 = ${n.trabajo2}, trabajo3 = ${n.trabajo3},
          diagnostico = ${n.diagnostico}, surtido_completo = ${n.surtido_completo}, pendiente_surtido = ${n.pendiente_surtido},
          reparacion = ${n.reparacion}, auditoria_taller = ${n.auditoria_taller === true}, auditoria_servicio = ${n.auditoria_servicio === true},
          color_tipo = ${n.color_tipo}, tot = ${n.tot === true},
          obs_asignacion = ${n.obs_asignacion}, obs_taller = ${n.obs_taller}, obs_servicio = ${n.obs_servicio},
          lugar_tipo = ${n.lugar_tipo}, lugar_nombre = ${n.lugar_nombre}, ciudad = ${n.ciudad}, contacto = ${n.contacto},
          cot_folio = ${n.cot_folio}, cot_monto = ${n.cot_monto}, cot_autorizo = ${n.cot_autorizo}, cot_nota = ${n.cot_nota},
          fecha_compromiso = ${n.fecha_compromiso}::timestamptz, nota_autorizada = ${n.nota_autorizada}, validada = ${n.validada === true}, obs_disponible = ${n.obs_disponible},
          archived = TRUE, fecha_salida = ${ahora}::timestamptz, salto_pendiente = FALSE,
          nota_actual = ${extra.nota}, historial = ${JSON.stringify(extra.hist)}::jsonb
        WHERE id = ${id} AND etapa_actual = ${u.etapa_actual} AND archived = FALSE AND salto_pendiente = FALSE
        RETURNING *`
      : db.sql`UPDATE units SET
          vin = ${n.vin}, ot = ${n.ot}, motivo_ingreso = ${n.motivo_ingreso},
          tecnico1 = ${n.tecnico1}, tecnico2 = ${n.tecnico2}, tecnico3 = ${n.tecnico3},
          trabajo1 = ${n.trabajo1}, trabajo2 = ${n.trabajo2}, trabajo3 = ${n.trabajo3},
          diagnostico = ${n.diagnostico}, surtido_completo = ${n.surtido_completo}, pendiente_surtido = ${n.pendiente_surtido},
          reparacion = ${n.reparacion}, auditoria_taller = ${n.auditoria_taller === true}, auditoria_servicio = ${n.auditoria_servicio === true},
          color_tipo = ${n.color_tipo}, tot = ${n.tot === true},
          obs_asignacion = ${n.obs_asignacion}, obs_taller = ${n.obs_taller}, obs_servicio = ${n.obs_servicio},
          lugar_tipo = ${n.lugar_tipo}, lugar_nombre = ${n.lugar_nombre}, ciudad = ${n.ciudad}, contacto = ${n.contacto},
          cot_folio = ${n.cot_folio}, cot_monto = ${n.cot_monto}, cot_autorizo = ${n.cot_autorizo}, cot_nota = ${n.cot_nota},
          fecha_compromiso = ${n.fecha_compromiso}::timestamptz, nota_autorizada = ${n.nota_autorizada}, validada = ${n.validada === true}, obs_disponible = ${n.obs_disponible},
          salto_pendiente = ${extra.salto}, etapa_actual = ${extra.etapa},
          nota_actual = ${extra.nota}, historial = ${JSON.stringify(extra.hist)}::jsonb
        WHERE id = ${id} AND etapa_actual = ${u.etapa_actual} AND archived = FALSE AND salto_pendiente = FALSE
        RETURNING *`;
    return donde;
  };

  // ---------- guardado parcial (borrador): no cambia de etapa ----------
  if (action === "borrador") {
    if (idx < 0) return conflicto();
    const hist = [...historial];
    hist[idx] = { ...hist[idx], comentario, borrador: true, borradorEn: ahora };
    const r = await guardar({ etapa: u.etapa_actual, salto: false, nota: comentario, hist });
    if (!r.length) return conflicto();
    return json(rowToUnit(r[0]));
  }

  if (idx >= 0) {
    const { borrador, borradorEn, ...resto } = historial[idx];
    historial[idx] = { ...resto, fin: ahora, comentario };
  }

  // ---------- confirmar disponibilidad (archivar) ----------
  if (action === "archive") {
    if (foranea) {
      if (u.etapa_actual !== 6) return err(400, "Solo se confirma la disponibilidad desde Unidad Disponible");
      if (n.validada !== true) return err(400, "Confirma que la unidad fue probada y está lista para el cliente");
    } else {
      if (u.etapa_actual !== 8) return err(400, "Solo se confirma la disponibilidad desde Validación Servicio");
      if (n.auditoria_servicio !== true) return err(400, "Marca la auditoría de servicio antes de confirmar");
      n.auditoria_servicio = true;
    }
    const r = await guardar({ etapa: u.etapa_actual, salto: false, nota: comentario, hist: historial, archivar: true });
    if (!r.length) return conflicto();
    return json(rowToUnit(r[0]));
  }

  // ---------- transición ----------
  const destino = Number(body.destino);
  if (!(TRANS[u.etapa_actual] || []).includes(destino)) return err(400, "Ese movimiento de etapa no está permitido");

  const omitidas: number[] = body.insertarOmitida == null ? [] : [].concat(body.insertarOmitida).map(Number);
  if (omitidas.length) {
    const valido = foranea
      ? u.etapa_actual === 2 && destino === 5 && omitidas.length === 2 && omitidas[0] === 3 && omitidas[1] === 4
      : u.etapa_actual === 4 && destino === 6 && omitidas.length === 1 && omitidas[0] === 5;
    if (!valido) return err(400, "Solicitud inválida");
  }

  if (!foranea) {
    if (u.etapa_actual === 2) {
      n.vin = String(n.vin || "").toUpperCase();
      if (!n.vin) return err(400, "El VIN es requerido");
      if (!COLORES.includes(n.color_tipo)) return err(400, "Elige la clasificación de la unidad");
      if (n.vin.toUpperCase() !== String(u.vin).toUpperCase()) {
        const dup = await db.sql`SELECT id FROM units WHERE taller = ${u.taller} AND camino = 'casa' AND archived = FALSE AND UPPER(vin) = ${n.vin} AND id <> ${id} LIMIT 1`;
        if (dup.length) return err(409, "Ya hay otra unidad en proceso con ese VIN en este taller", "duplicado");
      }
    }
    if (u.etapa_actual === 6 && destino === 5 && !txt(body.motivo, 500)) return err(400, "Escribe el motivo del regreso a Surtimiento");
    if (u.etapa_actual === 7 && destino === 8 && n.auditoria_taller !== true) return err(400, "Marca la auditoría de taller antes de enviar a Validación Servicio");
    if (u.etapa_actual === 7 && destino === 6) n.auditoria_taller = false;
    if (u.etapa_actual === 8 && destino === 7) n.auditoria_servicio = false;
  } else {
    const et = u.etapa_actual;
    if (et === 1 && (!String(n.lugar_nombre || "").trim() || !String(n.motivo_ingreso || "").trim())) return err(400, "Captura la agencia o sitio y el motivo de ingreso");
    if (et === 2 && !String(n.diagnostico || "").trim()) return err(400, "Escribe el diagnóstico");
    if (et === 3 && destino === 4 && (!String(n.cot_folio || "").trim() || !String(n.cot_autorizo || "").trim())) return err(400, "Captura el folio de cotización y quién autorizó");
    if (et === 3 && destino === 2 && !txt(body.motivo, 500)) return err(400, "Escribe el motivo del rechazo de la cotización");
    if (et === 4 && !n.fecha_compromiso) return err(400, "Captura la fecha compromiso de entrega");
    if (et === 5 && destino === 6 && !String(n.reparacion || "").trim()) return err(400, "Captura la reparación realizada");
    if (et === 5 && destino === 3) {
      if (!txt(body.motivo, 500)) return err(400, "Escribe qué trabajo adicional se encontró");
      n.cot_folio = ""; n.cot_monto = ""; n.cot_autorizo = ""; // la cotización adicional se captura de nuevo
    }
    if (et === 6 && destino === 5) {
      if (!txt(body.motivo, 500)) return err(400, "Escribe el motivo del regreso a reparación");
      n.validada = false;
    }
  }

  omitidas.forEach((o) => historial.push({ etapa: o, inicio: ahora, fin: ahora, comentario: "Etapa omitida" }));
  historial.push({ etapa: destino, inicio: ahora, fin: null, comentario: "" });
  const salto = !foranea && SALTOS_CON_ACEPTACION.some(([a, b]) => a === u.etapa_actual && b === destino);

  const r = await guardar({ etapa: destino, salto, nota: comentario, hist: historial });
  if (!r.length) return conflicto();
  return json(rowToUnit(r[0]));
};

export const config: Config = { path: "/api/unit-action" };
