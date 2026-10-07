import type { Context, Config } from "@netlify/functions";
import { db, json, txt, autenticar, rowToUnit } from "./_lib.mts";

// POST /api/units  { vin, placa, cliente }  -> solo el Vigilante, en su propio taller
export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const sesion = await autenticar(req);
  if (!sesion) return json({ error: "Sesión inválida o vencida" }, 401);
  if (sesion.role !== "Vigilante") return json({ error: "Solo el Vigilante registra el ingreso de unidades" }, 403);

  const body = await req.json().catch(() => ({}));
  const vin = txt((body as any).vin, 40).toUpperCase();
  const placa = txt((body as any).placa, 20);
  const cliente = txt((body as any).cliente, 120);
  if (!vin || !cliente) return json({ error: "VIN y Cliente son requeridos" }, 400);

  const dup = await db.sql`SELECT id FROM units WHERE taller = ${sesion.taller} AND archived = FALSE AND UPPER(vin) = ${vin} LIMIT 1`;
  if (dup.length) return json({ error: "Ya hay una unidad en proceso con ese VIN en este taller", code: "duplicado" }, 409);

  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const ahora = new Date().toISOString();
  const historial = [
    { etapa: 1, inicio: ahora, fin: ahora, comentario: `Cliente: ${cliente}` },
    { etapa: 2, inicio: ahora, fin: null, comentario: "" },
  ];
  const nota = `Cliente: ${cliente}. Placa: ${placa}`;

  const [row] = await db.sql`
    INSERT INTO units (id, taller, vin, placa, cliente, etapa_actual, nota_actual, historial, fecha_ingreso)
    VALUES (${id}, ${sesion.taller}, ${vin}, ${placa}, ${cliente}, 2, ${nota}, ${JSON.stringify(historial)}::jsonb, ${ahora}::timestamptz)
    RETURNING *`;
  return json(rowToUnit(row), 201);
};

export const config: Config = { path: "/api/units" };
