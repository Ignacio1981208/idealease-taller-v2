import type { Context, Config } from "@netlify/functions";
import { db, json, txt, autenticar, rowToUnit, ETAPAS, ROL_DIRECCION } from "./_lib.mts";

// POST /api/unit-action
//   { id, action: "transition", desde, destino, patch, comentario, motivo?, insertarOmitida? }
//   { id, action: "archive",    desde, patch, comentario }
//   { id, action: "accept" }
//   { id, action: "delete" }

// Movimientos permitidos (etapa actual -> destinos)
const TRANSICIONES: Record<number, number[]> = { 2: [3], 3: [4], 4: [5, 6], 5: [6], 6: [7, 5], 7: [8, 6], 8: [7] };
// Saltos que exigen que la etapa que recibe los acepte: Diagnóstico->Surtimiento, Surtimiento->Reparación, Reparación->Surtimiento
const SALTOS_CON_ACEPTACION = [[4, 5], [5, 6], [6, 5]];

// Qué campos puede escribir cada etapa
const CAMPOS_POR_ETAPA: Record<number, string[]> = {
  2: ["vin", "ot", "motivoIngreso", "colorTipo"],
  3: ["tecnico1", "tecnico2", "tecnico3", "trabajo1", "trabajo2", "trabajo3"],
  4: ["diagnostico", "tot"],
  5: ["surtidoCompleto", "pendienteSurtido"],
  6: ["reparacion", "tot"],
  7: ["auditoriaTaller"],
  8: ["auditoriaServicio"],
};
const COL: Record<string, string> = {
  vin: "vin", ot: "ot", motivoIngreso: "motivo_ingreso",
  tecnico1: "tecnico1", tecnico2: "tecnico2", tecnico3: "tecnico3",
  trabajo1: "trabajo1", trabajo2: "trabajo2", trabajo3: "trabajo3",
  diagnostico: "diagnostico", surtidoCompleto: "surtido_completo", pendienteSurtido: "pendiente_surtido",
  reparacion: "reparacion", auditoriaTaller: "auditoria_taller", auditoriaServicio: "auditoria_servicio",
  colorTipo: "color_tipo", tot: "tot",
};
const BOOLEANOS = ["tot", "surtidoCompleto", "auditoriaTaller", "auditoriaServicio"];
const LARGO: Record<string, number> = {
  vin: 40, ot: 40, motivoIngreso: 500, tecnico1: 80, tecnico2: 80, tecnico3: 80,
  trabajo1: 300, trabajo2: 300, trabajo3: 300, diagnostico: 1000, pendienteSurtido: 500, reparacion: 1000,
};
const COLORES = ["verde", "amarillo", "naranja"];

const err = (status: number, error: string, code?: string) => json({ error, ...(code ? { code } : {}) }, status);
const conflicto = () => err(409, "Otra persona ya movió esa unidad de etapa. Se actualizó la vista.", "conflicto");

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") return err(405, "Método no permitido");

  const sesion = await autenticar(req);
  if (!sesion) return err(401, "Sesión inválida o vencida");
  if (sesion.role === ROL_DIRECCION) return err(403, "El monitoreo de Dirección es de solo lectura");

  const body: any = await req.json().catch(() => ({}));
  const id = txt(body.id, 60);
  const action = txt(body.action, 20);
  if (!id || !["transition", "archive", "accept", "delete"].includes(action)) return err(400, "Solicitud inválida");

  const rows = await db.sql`SELECT * FROM units WHERE id = ${id}`;
  const u = rows[0];
  if (!u) return err(404, "Unidad no encontrada");
  if (u.taller !== sesion.taller) return err(403, "Esa unidad es de otro taller");

  if (action === "delete") {
    if (sesion.role !== "Supervisor Mantenimiento") return err(403, "Solo el Supervisor de Mantenimiento puede eliminar unidades");
    await db.sql`DELETE FROM units WHERE id = ${id} AND taller = ${sesion.taller}`;
    return json({ ok: true });
  }

  if (u.archived) return err(409, "La unidad ya fue entregada", "conflicto");
  const etapaDef = ETAPAS[u.etapa_actual - 1];
  // Si la unidad ya cambió de etapa (otra persona la movió), se avisa eso antes que cualquier otra cosa
  if ((action === "transition" || action === "archive") && Number(body.desde) !== u.etapa_actual) return conflicto();
  if (sesion.role !== etapaDef.rol) return err(403, `Solo ${etapaDef.rol} puede actualizar esta etapa`);

  const ahora = new Date().toISOString();

  // ---------- aceptar salto de etapa ----------
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

  // ---------- transición / archivo ----------
  if (u.salto_pendiente) return err(409, "Primero acepta el salto de etapa", "salto_pendiente");

  const comentario = txt(body.comentario, 1500);
  const patch = body.patch && typeof body.patch === "object" ? body.patch : {};

  // aplica solo los campos que esta etapa puede escribir
  const n: any = { ...u };
  for (const k of CAMPOS_POR_ETAPA[u.etapa_actual] || []) {
    if (!(k in patch)) continue;
    const v = patch[k];
    if (BOOLEANOS.includes(k)) n[COL[k]] = v === true;
    else if (k === "colorTipo") {
      if (!COLORES.includes(v)) return err(400, "Clasificación de color inválida");
      n.color_tipo = v;
    } else n[COL[k]] = txt(v, LARGO[k] ?? 300);
  }

  const historial = [...(u.historial || [])];
  const idx = historial.findIndex((h: any) => h.fin == null);
  if (idx >= 0) historial[idx] = { ...historial[idx], fin: ahora, comentario };

  if (action === "archive") {
    if (u.etapa_actual !== 8) return err(400, "Solo se confirma la disponibilidad desde Validación Servicio");
    if (n.auditoria_servicio !== true) return err(400, "Marca la auditoría de servicio antes de confirmar");
    const r = await db.sql`
      UPDATE units SET auditoria_servicio = TRUE, archived = TRUE, fecha_salida = ${ahora}::timestamptz,
        nota_actual = ${comentario}, historial = ${JSON.stringify(historial)}::jsonb
      WHERE id = ${id} AND etapa_actual = 8 AND archived = FALSE AND salto_pendiente = FALSE
      RETURNING *`;
    if (!r.length) return conflicto();
    return json(rowToUnit(r[0]));
  }

  // transition
  const destino = Number(body.destino);
  if (!(TRANSICIONES[u.etapa_actual] || []).includes(destino)) return err(400, "Ese movimiento de etapa no está permitido");

  const omitida = body.insertarOmitida ? Number(body.insertarOmitida) : null;
  if (omitida !== null && !(u.etapa_actual === 4 && destino === 6 && omitida === 5)) return err(400, "Solicitud inválida");

  if (u.etapa_actual === 2) {
    n.vin = String(n.vin || "").toUpperCase();
    if (!n.vin) return err(400, "El VIN es requerido");
    if (!COLORES.includes(n.color_tipo)) return err(400, "Elige la clasificación de la unidad");
    if (n.vin.toUpperCase() !== String(u.vin).toUpperCase()) {
      const dup = await db.sql`SELECT id FROM units WHERE taller = ${u.taller} AND archived = FALSE AND UPPER(vin) = ${n.vin} AND id <> ${id} LIMIT 1`;
      if (dup.length) return err(409, "Ya hay otra unidad en proceso con ese VIN en este taller", "duplicado");
    }
  }
  if (u.etapa_actual === 6 && destino === 5 && !txt(body.motivo, 500)) return err(400, "Escribe el motivo del regreso a Surtimiento");
  if (u.etapa_actual === 7 && destino === 8 && n.auditoria_taller !== true) return err(400, "Marca la auditoría de taller antes de enviar a Validación Servicio");
  if (u.etapa_actual === 7 && destino === 6) n.auditoria_taller = false;
  if (u.etapa_actual === 8 && destino === 7) n.auditoria_servicio = false;

  if (omitida) historial.push({ etapa: omitida, inicio: ahora, fin: ahora, comentario: "Etapa omitida" });
  historial.push({ etapa: destino, inicio: ahora, fin: null, comentario: "" });
  const salto = SALTOS_CON_ACEPTACION.some(([a, b]) => a === u.etapa_actual && b === destino);

  const r = await db.sql`
    UPDATE units SET
      vin = ${n.vin}, ot = ${n.ot}, motivo_ingreso = ${n.motivo_ingreso},
      tecnico1 = ${n.tecnico1}, tecnico2 = ${n.tecnico2}, tecnico3 = ${n.tecnico3},
      trabajo1 = ${n.trabajo1}, trabajo2 = ${n.trabajo2}, trabajo3 = ${n.trabajo3},
      diagnostico = ${n.diagnostico}, surtido_completo = ${n.surtido_completo}, pendiente_surtido = ${n.pendiente_surtido},
      reparacion = ${n.reparacion}, auditoria_taller = ${n.auditoria_taller === true}, auditoria_servicio = ${n.auditoria_servicio === true},
      color_tipo = ${n.color_tipo}, tot = ${n.tot === true}, salto_pendiente = ${salto},
      etapa_actual = ${destino}, nota_actual = ${comentario}, historial = ${JSON.stringify(historial)}::jsonb
    WHERE id = ${id} AND etapa_actual = ${u.etapa_actual} AND archived = FALSE AND salto_pendiente = FALSE
    RETURNING *`;
  if (!r.length) return conflicto();
  return json(rowToUnit(r[0]));
};

export const config: Config = { path: "/api/unit-action" };
