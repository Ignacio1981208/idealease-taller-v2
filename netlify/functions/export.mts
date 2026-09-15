import type { Context, Config } from "@netlify/functions";
import { db, json, ETAPAS } from "./_lib.mts";

export default async (_req: Request, _context: Context) => {
  const rows = await db.sql`SELECT * FROM units ORDER BY fecha_ingreso DESC`;
  const now = new Date().toISOString();
  const out: any[] = [];
  for (const u of rows) {
    for (const h of u.historial || []) {
      const etapaDef = ETAPAS[h.etapa - 1];
      const fin = h.fin || now;
      const horas = (new Date(fin).getTime() - new Date(h.inicio).getTime()) / 36e5;
      out.push({
        VIN: u.vin,
        Cliente: u.cliente,
        Placa: u.placa,
        OT: u.ot || "",
        Etapa: etapaDef ? etapaDef.nombre : h.etapa,
        Responsable: etapaDef ? etapaDef.rol : "",
        Inicio: h.inicio,
        Fin: h.fin || "En curso",
        DuracionHoras: Number(horas.toFixed(2)),
        Comentario: h.comentario || "",
      });
    }
  }
  return json(out);
};

export const config: Config = { path: "/api/export" };
