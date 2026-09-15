import type { Context, Config } from "@netlify/functions";
import { db, verifyToken, getBearer, json, rowToUnit } from "./_lib.mts";

export default async (req: Request, _context: Context) => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const archived = url.searchParams.get("archived") === "true";
    const rows = await db.sql`SELECT * FROM units WHERE archived = ${archived} ORDER BY fecha_ingreso DESC`;
    return json(rows.map(rowToUnit));
  }

  if (req.method === "POST") {
    const session = verifyToken(getBearer(req));
    if (!session || session.role !== "Vigilante") return json({ error: "Solo Vigilante puede registrar el ingreso" }, 403);

    const body = await req.json().catch(() => ({}));
    const { vin, placa, cliente } = body as { vin?: string; placa?: string; cliente?: string };
    if (!vin || !cliente) return json({ error: "VIN y Cliente son requeridos" }, 400);

    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();
    const historial = [
      { etapa: 1, inicio: now, fin: now, comentario: `Cliente: ${cliente}` },
      { etapa: 2, inicio: now, fin: null, comentario: "" },
    ];
    const notaActual = `Cliente: ${cliente}. Placa: ${placa || ""}`;

    const [row] = await db.sql`
      INSERT INTO units (id, vin, placa, cliente, etapa_actual, nota_actual, historial, fecha_ingreso)
      VALUES (${id}, ${vin}, ${placa || ""}, ${cliente}, 2, ${notaActual}, ${JSON.stringify(historial)}::jsonb, ${now})
      RETURNING *
    `;
    return json(rowToUnit(row), 201);
  }

  return json({ error: "Método no permitido" }, 405);
};

export const config: Config = { path: "/api/units" };
