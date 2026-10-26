import type { Context, Config } from "@netlify/functions";
import { db, json, autenticar, rowToUnit, TALLERES, ROL_DIRECCION, ROL_ESPECIALISTA, CAMINOS } from "./_lib.mts";

// GET /api/snapshot?taller=veracruz|all&camino=casa|foranea&dias=35
// Devuelve las unidades en proceso y (si dias > 0) las entregadas en los últimos N días.
export default async (req: Request, _context: Context) => {
  if (req.method !== "GET") return json({ error: "Método no permitido" }, 405);

  const sesion = await autenticar(req);
  if (!sesion) return json({ error: "Sesión inválida o vencida" }, 401);
  if (sesion.role === ROL_ESPECIALISTA) return json({ error: "Tu rol solo tiene acceso a Disponibilidad" }, 403);

  const url = new URL(req.url);
  const pedido = url.searchParams.get("taller") || "all";
  const dias = Math.max(0, Math.min(400, parseInt(url.searchParams.get("dias") || "0", 10) || 0));
  const camino = url.searchParams.get("camino") || "casa";
  if (!CAMINOS.includes(camino)) return json({ error: "Camino inválido" }, 400);

  let talleres: string[];
  if (sesion.role === ROL_DIRECCION) {
    talleres = pedido === "all" ? TALLERES : TALLERES.filter((t) => t === pedido);
  } else {
    if (pedido !== sesion.taller) return json({ error: "Sin acceso a ese taller" }, 403);
    talleres = [sesion.taller];
  }

  const desde = new Date(Date.now() - dias * 86400000).toISOString();
  const salida: Record<string, { unidades: any[]; historico: any[] }> = {};
  for (const t of talleres) {
    const act = await db.sql`SELECT * FROM units WHERE taller = ${t} AND camino = ${camino} AND archived = FALSE ORDER BY fecha_ingreso DESC`;
    const his = dias > 0
      ? await db.sql`SELECT * FROM units WHERE taller = ${t} AND camino = ${camino} AND archived = TRUE AND fecha_salida >= ${desde}::timestamptz ORDER BY fecha_salida DESC LIMIT 600`
      : [];
    salida[t] = { unidades: act.map(rowToUnit), historico: his.map(rowToUnit) };
  }
  return json({ talleres: salida, ahora: new Date().toISOString() });
};

export const config: Config = { path: "/api/snapshot" };
