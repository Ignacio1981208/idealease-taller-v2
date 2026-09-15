import type { Context, Config } from "@netlify/functions";
import { db, signToken, json } from "./_lib.mts";

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  const body = await req.json().catch(() => ({}));
  const { role, pin } = body as { role?: string; pin?: string };
  if (!role || !pin) return json({ error: "Rol y PIN requeridos" }, 400);

  const rows = await db.sql`SELECT pin FROM role_pins WHERE role = ${role}`;
  if (rows.length === 0 || String(rows[0].pin) !== String(pin)) {
    return json({ error: "PIN incorrecto" }, 401);
  }
  const token = signToken({ role, exp: Date.now() + 1000 * 60 * 60 * 16 }); // 16h
  return json({ token, role });
};

export const config: Config = { path: "/api/login" };
