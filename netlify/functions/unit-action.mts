import type { Context, Config } from "@netlify/functions";
import { db, verifyToken, getBearer, json, rowToUnit, ETAPAS } from "./_lib.mts";

// POST /api/units/:id/transition  { patch, destino, comentario, insertarOmitida? }
// POST /api/units/:id/archive     { patch, comentario }
export default async (req: Request, _context: Context) => {
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean); // ["api","units",":id", action?]
  const id = parts[2];

  if (req.method === "DELETE" && id && !parts[3]) {
    const session = verifyToken(getBearer(req));
    if (!session) return json({ error: "Sesión inválida" }, 401);
    await db.sql`DELETE FROM units WHERE id = ${id}`;
    return json({ ok: true });
  }

  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const action = parts[3];
  if (!id || !["transition", "archive"].includes(action)) return json({ error: "Ruta inválida" }, 404);

  const session = verifyToken(getBearer(req));
  if (!session) return json({ error: "Sesión inválida, vuelve a iniciar sesión" }, 401);

  const rows = await db.sql`SELECT * FROM units WHERE id = ${id} AND archived = FALSE`;
  if (rows.length === 0) return json({ error: "Unidad no encontrada" }, 404);
  const unit = rows[0];

  const etapaDef = ETAPAS[unit.etapa_actual - 1];
  if (session.role !== etapaDef.rol) {
    return json({ error: `Solo ${etapaDef.rol} puede actualizar esta etapa` }, 403);
  }

  const body = await req.json().catch(() => ({}));
  const { patch = {}, comentario = "", destino, insertarOmitida } = body as {
    patch?: Record<string, any>;
    comentario?: string;
    destino?: number;
    insertarOmitida?: number;
  };

  const now = new Date().toISOString();
  const historial = [...(unit.historial || [])];
  const idxAbierta = historial.findIndex((h: any) => h.fin == null);
  if (idxAbierta >= 0) historial[idxAbierta] = { ...historial[idxAbierta], fin: now, comentario };

  if (insertarOmitida) {
    historial.push({ etapa: insertarOmitida, inicio: now, fin: now, comentario: "Etapa omitida" });
  }

  // mapeo de patch (camelCase del front) a columnas snake_case
  const colMap: Record<string, string> = {
    vin: "vin",
    ot: "ot", motivoIngreso: "motivo_ingreso",
    tecnico1: "tecnico1", tecnico2: "tecnico2", tecnico3: "tecnico3",
    trabajo1: "trabajo1", trabajo2: "trabajo2", trabajo3: "trabajo3",
    diagnostico: "diagnostico", surtidoCompleto: "surtido_completo",
    pendienteSurtido: "pendiente_surtido", reparacion: "reparacion",
    auditoriaTaller: "auditoria_taller", auditoriaServicio: "auditoria_servicio",
    colorTipo: "color_tipo", tot: "tot",
  };

  const setClauses: string[] = [];
  const values: any[] = [];
  let i = 1;
  for (const [k, v] of Object.entries(patch)) {
    const col = colMap[k];
    if (!col) continue;
    setClauses.push(`${col} = $${i}`);
    values.push(v);
    i++;
  }

  if (action === "archive") {
    setClauses.push(`archived = TRUE`, `fecha_salida = $${i}`, `nota_actual = $${i + 1}`, `historial = $${i + 2}::jsonb`);
    values.push(now, comentario, JSON.stringify(historial));
    const q = `UPDATE units SET ${setClauses.join(", ")} WHERE id = $${i + 3} RETURNING *`;
    values.push(id);
    const { rows: updated } = await db.pool.query(q, values);
    return json(rowToUnit(updated[0]));
  }

  if (!destino) return json({ error: "Falta etapa destino" }, 400);
  historial.push({ etapa: destino, inicio: now, fin: null, comentario: "" });
  setClauses.push(`etapa_actual = $${i}`, `nota_actual = $${i + 1}`, `historial = $${i + 2}::jsonb`);
  values.push(destino, comentario, JSON.stringify(historial));
  const q = `UPDATE units SET ${setClauses.join(", ")} WHERE id = $${i + 3} RETURNING *`;
  values.push(id);
  const { rows: updated } = await db.pool.query(q, values);
  return json(rowToUnit(updated[0]));
};

export const config: Config = { path: "/api/units/*" };
