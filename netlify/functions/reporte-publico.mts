import type { Context, Config } from "@netlify/functions";
import { db, json, ipDe, rowToUnit, TALLERES, CAMINOS } from "./_lib.mts";

// GET /api/reporte-publico  (SIN PIN)
// Entrega los datos de los 4 talleres y los 2 caminos para armar el Reporte de Piso de todas las sucursales
// desde la pantalla de acceso. Es solo lectura. Para apagarlo sin tocar el código: variable REPORTE_PUBLICO = apagado.
const MAX_POR_VENTANA = 20; // descargas por dispositivo/red cada 10 minutos
const DIAS = 365;

export default async (req: Request, context: Context) => {
  if (req.method !== "GET") return json({ error: "Método no permitido" }, 405);
  if ((Netlify.env.get("REPORTE_PUBLICO") || "").trim().toLowerCase() === "apagado") {
    return json({ error: "La descarga sin PIN está desactivada. Entra con tu PIN para descargar el reporte.", code: "apagado" }, 403);
  }

  // Límite de descargas por dispositivo/red (ventana de 10 minutos)
  const clave = `reporte|${ipDe(req, context)}`;
  const r = await db.sql`
    INSERT INTO login_intentos (clave, fallos, bloqueado_hasta) VALUES (${clave}, 1, now() + interval '10 minutes')
    ON CONFLICT (clave) DO UPDATE SET
      fallos = CASE WHEN login_intentos.bloqueado_hasta IS NULL OR login_intentos.bloqueado_hasta < now() THEN 1 ELSE login_intentos.fallos + 1 END,
      bloqueado_hasta = CASE WHEN login_intentos.bloqueado_hasta IS NULL OR login_intentos.bloqueado_hasta < now() THEN now() + interval '10 minutes' ELSE login_intentos.bloqueado_hasta END
    RETURNING fallos`;
  if (Number(r[0].fallos) > MAX_POR_VENTANA) return json({ error: "Demasiadas descargas seguidas. Intenta de nuevo en unos minutos.", code: "limite" }, 429);

  const desde = new Date(Date.now() - DIAS * 86400000).toISOString();
  const salida: Record<string, Record<string, { unidades: any[]; historico: any[] }>> = { casa: {}, foranea: {} };
  for (const camino of CAMINOS) {
    for (const t of TALLERES) {
      const act = await db.sql`SELECT * FROM units WHERE taller = ${t} AND camino = ${camino} AND archived = FALSE ORDER BY fecha_ingreso DESC`;
      const his = await db.sql`SELECT * FROM units WHERE taller = ${t} AND camino = ${camino} AND archived = TRUE AND fecha_salida >= ${desde}::timestamptz ORDER BY fecha_salida DESC LIMIT 600`;
      salida[camino][t] = { unidades: act.map(rowToUnit), historico: his.map(rowToUnit) };
    }
  }
  return json({ ...salida, ahora: new Date().toISOString() });
};

export const config: Config = { path: "/api/reporte-publico" };
