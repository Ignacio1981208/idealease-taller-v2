import type { Context, Config } from "@netlify/functions";
import { db, json, txt, autenticar, rowToUnit, ROL_FORANEO } from "./_lib.mts";

// POST /api/units
//   Camino Casa:     { vin, placa, cliente }                                   -> solo el Vigilante, en su propio taller
//   Camino Foránea:  { camino: "foranea", vin, placa, cliente, lugarTipo, lugarNombre, ciudad } -> solo el Supervisor Foráneo
export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const sesion = await autenticar(req);
  if (!sesion) return json({ error: "Sesión inválida o vencida" }, 401);

  const body: any = await req.json().catch(() => ({}));
  const foranea = txt(body.camino, 10) === "foranea";
  const vin = txt(body.vin, 40).toUpperCase();
  const placa = txt(body.placa, 20);
  const cliente = txt(body.cliente, 120);
  if (!vin || !cliente) return json({ error: "VIN y Cliente son requeridos" }, 400);

  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const ahora = new Date().toISOString();

  if (!foranea) {
    if (sesion.role !== "Vigilante") return json({ error: "Solo el Vigilante registra el ingreso de unidades" }, 403);
    const dup = await db.sql`SELECT id FROM units WHERE taller = ${sesion.taller} AND camino = 'casa' AND archived = FALSE AND UPPER(vin) = ${vin} LIMIT 1`;
    if (dup.length) return json({ error: "Ya hay una unidad en proceso con ese VIN en este taller", code: "duplicado" }, 409);

    const historial = [
      { etapa: 1, inicio: ahora, fin: ahora, comentario: `Cliente: ${cliente}` },
      { etapa: 2, inicio: ahora, fin: null, comentario: "" },
    ];
    const nota = `Cliente: ${cliente}. Placa: ${placa}`;
    const [row] = await db.sql`
      INSERT INTO units (id, taller, camino, vin, placa, cliente, etapa_actual, nota_actual, historial, fecha_ingreso)
      VALUES (${id}, ${sesion.taller}, 'casa', ${vin}, ${placa}, ${cliente}, 2, ${nota}, ${JSON.stringify(historial)}::jsonb, ${ahora}::timestamptz)
      RETURNING *`;
    return json(rowToUnit(row), 201);
  }

  // ---- Camino Foránea / Sitio ----
  if (sesion.role !== ROL_FORANEO) return json({ error: "Solo el Supervisor Foráneo registra unidades foráneas" }, 403);
  const lugarTipo = txt(body.lugarTipo, 10) === "sitio" ? "sitio" : "agencia";
  const lugarNombre = txt(body.lugarNombre, 120);
  const ciudad = txt(body.ciudad, 80);
  if (!lugarNombre) return json({ error: "Escribe la agencia o el sitio del cliente" }, 400);

  const dup = await db.sql`SELECT id FROM units WHERE taller = ${sesion.taller} AND camino = 'foranea' AND archived = FALSE AND UPPER(vin) = ${vin} LIMIT 1`;
  if (dup.length) return json({ error: "Ya hay una unidad foránea en proceso con ese VIN en este taller", code: "duplicado" }, 409);

  const etiqueta = lugarTipo === "sitio" ? "Sitio cliente" : "Agencia";
  const comentario = `${etiqueta}: ${lugarNombre}`;
  const historial = [{ etapa: 1, inicio: ahora, fin: null, comentario, borrador: true, borradorEn: ahora }];
  const [row] = await db.sql`
    INSERT INTO units (id, taller, camino, vin, placa, cliente, lugar_tipo, lugar_nombre, ciudad, etapa_actual, nota_actual, historial, fecha_ingreso)
    VALUES (${id}, ${sesion.taller}, 'foranea', ${vin}, ${placa}, ${cliente}, ${lugarTipo}, ${lugarNombre}, ${ciudad}, 1, ${comentario}, ${JSON.stringify(historial)}::jsonb, ${ahora}::timestamptz)
    RETURNING *`;
  return json(rowToUnit(row), 201);
};

export const config: Config = { path: "/api/units" };
