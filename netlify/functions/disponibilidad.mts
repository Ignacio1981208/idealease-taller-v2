import type { Context, Config } from "@netlify/functions";
import { db, json, txt, autenticar, TALLERES, ROL_DIRECCION, ROL_ESPECIALISTA } from "./_lib.mts";

// /api/disponibilidad  ·  IDO 360 Disponibilidad de flota por sucursal
//
// GET  ?mes=2026-10&taller=veracruz|all
//      Dirección General lee todas las sucursales; cualquier otro rol lee solo su taller.
//      Responde { mes, talleres: { veracruz: { unidades:[...], dias:{eco:"RRRD..."}, upd:{t,por} } }, ahora }
//
// POST { accion: "guardar",  mes, taller, dias:[{eco, mascara}], unidades:[{...}], bajas:[eco] }
//      { accion: "importar", mes, taller, unidades:[{...}], dias:[{eco, mascara}] }   (reemplaza el catálogo de la sucursal)
//      Solo los roles de ROLES_EDITAN, y solo en su propio taller. Dirección General es de solo lectura.
//
// mascara = 31 caracteres: "_" no cambia ese día; R r D T n S M E = R RT D T ND S MI SER; "." = borrar.

export const ROLES_EDITAN = [ROL_ESPECIALISTA]; // solo el Especialista de Servicio captura, y solo su sucursal
const MES_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const MASCARA_RE = /^[_.RrDTnSME]{31}$/;
const ECO_RE = /^[A-Za-z0-9_\-]{1,20}$/;
const MAX_FILAS = 1500;

const CAMPOS: Record<string, [string, number]> = {
  flota: ["flota", 20], contrato: ["contrato", 10], rango: ["rango", 40], tipo: ["tipo", 80],
  descripcion: ["descripcion", 120], modelo: ["modelo", 10], placas: ["placas", 20], vin: ["vin", 30],
  ubicacion: ["ubicacion", 80], cliente: ["cliente", 120], fechaCompromiso: ["fecha_compromiso", 20], comentario: ["comentario", 300],
};

const err = (status: number, error: string, code?: string) => json({ error, ...(code ? { code } : {}) }, status);

// En "guardar" los campos que no vienen se conservan (null); en "importar" vienen todos.
function filaUnidad(u: any, i: number, parcial: boolean) {
  const eco = txt(u?.eco, 20);
  if (!ECO_RE.test(eco)) return null;
  const f: any = { eco };
  f.orden = u && "orden" in u && Number.isFinite(+u.orden) ? Math.trunc(+u.orden) : (parcial ? null : i);
  for (const k in CAMPOS) f[CAMPOS[k][0]] = parcial && !(u && k in u) ? null : txt(u?.[k], CAMPOS[k][1]);
  return f;
}

function rowToDisp(r: any) {
  return {
    eco: r.eco, flota: r.flota, contrato: r.contrato, rango: r.rango, tipo: r.tipo, descripcion: r.descripcion,
    modelo: r.modelo, placas: r.placas, vin: r.vin, ubicacion: r.ubicacion, cliente: r.cliente,
    fechaCompromiso: r.fecha_compromiso, comentario: r.comentario, orden: r.orden,
  };
}

export default async (req: Request, _context: Context) => {
  const sesion = await autenticar(req);
  if (!sesion) return err(401, "Sesión inválida o vencida");

  // ------------------------------- LEER -------------------------------
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mes = url.searchParams.get("mes") || "";
    if (!MES_RE.test(mes)) return err(400, "Mes inválido (formato AAAA-MM)");
    const pedido = url.searchParams.get("taller") || "all";
    let talleres: string[];
    if (sesion.role === ROL_DIRECCION) talleres = pedido === "all" ? TALLERES : TALLERES.filter((t) => t === pedido);
    else {
      if (pedido !== "all" && pedido !== sesion.taller) return err(403, "Sin acceso a esa sucursal");
      talleres = [sesion.taller];
    }
    const salida: Record<string, any> = {};
    for (const t of talleres) {
      const us = await db.sql`SELECT * FROM disp_unidades WHERE taller = ${t} AND activa = TRUE ORDER BY orden, eco`;
      const ds = await db.sql`SELECT eco, dias, actualizado, actualizado_por FROM disp_mes WHERE taller = ${t} AND mes = ${mes}`;
      const dias: Record<string, string> = {};
      let upd: any = null;
      for (const r of ds) {
        dias[r.eco] = r.dias;
        const tt = new Date(r.actualizado).toISOString();
        if (!upd || tt > upd.t) upd = { t: tt, por: r.actualizado_por };
      }
      for (const r of us) {
        const tt = new Date(r.actualizado).toISOString();
        if (!upd || tt > upd.t) upd = { t: tt, por: r.actualizado_por };
      }
      salida[t] = { unidades: us.map(rowToDisp), dias, upd };
    }
    return json({ mes, talleres: salida, ahora: new Date().toISOString(), sesion: { role: sesion.role, taller: sesion.taller, edita: ROLES_EDITAN.includes(sesion.role) } });
  }

  // ------------------------------- GUARDAR -------------------------------
  if (req.method !== "POST") return err(405, "Método no permitido");
  const body: any = await req.json().catch(() => ({}));
  const accion = txt(body.accion, 20);
  const mes = txt(body.mes, 7);
  const taller = txt(body.taller, 30);
  if (!["guardar", "importar"].includes(accion)) return err(400, "Acción inválida");
  if (!MES_RE.test(mes)) return err(400, "Mes inválido (formato AAAA-MM)");
  if (!TALLERES.includes(taller)) return err(400, "Sucursal inválida");
  if (!ROLES_EDITAN.includes(sesion.role)) return err(403, "Solo el Especialista de Servicio captura la disponibilidad");
  if (sesion.taller !== taller) return err(403, "Solo puedes capturar la disponibilidad de tu sucursal");

  const por = `${sesion.role} · ${taller}`;
  const unidades = (Array.isArray(body.unidades) ? body.unidades : []).slice(0, MAX_FILAS).map((u: any, i: number) => filaUnidad(u, i, accion !== "importar")).filter(Boolean);
  const dias = (Array.isArray(body.dias) ? body.dias : []).slice(0, MAX_FILAS)
    .map((d: any) => ({ eco: txt(d?.eco, 20), mascara: String(d?.mascara ?? "") }))
    .filter((d: any) => ECO_RE.test(d.eco) && MASCARA_RE.test(d.mascara));
  const bajas = (Array.isArray(body.bajas) ? body.bajas : []).slice(0, MAX_FILAS).map((e: any) => txt(e, 20)).filter((e: string) => ECO_RE.test(e));

  // Un económico solo una vez por guardado (el último gana)
  const unico = <T extends { eco: string }>(a: T[]) => Object.values(Object.fromEntries(a.map((x) => [x.eco, x]))) as T[];
  const U = unico(unidades as any[]), D = unico(dias as any[]);

  if (accion === "importar" && !U.length) return err(400, "El archivo no trae unidades");

  if (U.length) {
    await db.sql`
      INSERT INTO disp_unidades (taller, eco, flota, contrato, rango, tipo, descripcion, modelo, placas, vin, ubicacion, cliente, fecha_compromiso, comentario, orden, activa, actualizado, actualizado_por)
      SELECT ${taller}, x.eco,
        COALESCE(NULLIF(x.flota, ''), e.flota, 'ACTIVA'), COALESCE(x.contrato, e.contrato, ''), COALESCE(x.rango, e.rango, ''),
        COALESCE(x.tipo, e.tipo, ''), COALESCE(x.descripcion, e.descripcion, ''), COALESCE(x.modelo, e.modelo, ''),
        COALESCE(x.placas, e.placas, ''), COALESCE(x.vin, e.vin, ''), COALESCE(x.ubicacion, e.ubicacion, ''),
        COALESCE(x.cliente, e.cliente, ''), COALESCE(x.fecha_compromiso, e.fecha_compromiso, ''), COALESCE(x.comentario, e.comentario, ''),
        COALESCE(x.orden, e.orden, (extract(epoch from now()))::int), TRUE, now(), ${por}
      FROM jsonb_to_recordset(${JSON.stringify(U)}::text::jsonb) AS x(eco text, flota text, contrato text, rango text, tipo text, descripcion text, modelo text, placas text, vin text, ubicacion text, cliente text, fecha_compromiso text, comentario text, orden int)
      LEFT JOIN disp_unidades e ON e.taller = ${taller} AND e.eco = x.eco
      ON CONFLICT (taller, eco) DO UPDATE SET
        flota = EXCLUDED.flota, contrato = EXCLUDED.contrato, rango = EXCLUDED.rango, tipo = EXCLUDED.tipo, descripcion = EXCLUDED.descripcion,
        modelo = EXCLUDED.modelo, placas = EXCLUDED.placas, vin = EXCLUDED.vin, ubicacion = EXCLUDED.ubicacion, cliente = EXCLUDED.cliente,
        fecha_compromiso = EXCLUDED.fecha_compromiso, comentario = EXCLUDED.comentario, orden = EXCLUDED.orden,
        activa = TRUE, actualizado = now(), actualizado_por = EXCLUDED.actualizado_por`;
  }

  if (accion === "importar") {
    // Las unidades que ya no vienen en el archivo salen del catálogo (se conservan en la base como inactivas)
    await db.sql`UPDATE disp_unidades SET activa = FALSE, actualizado = now(), actualizado_por = ${por}
      WHERE taller = ${taller} AND activa = TRUE AND NOT (eco = ANY(SELECT jsonb_array_elements_text(${JSON.stringify(U.map((u: any) => u.eco))}::text::jsonb)))`;
  }

  if (bajas.length) {
    await db.sql`UPDATE disp_unidades SET activa = FALSE, actualizado = now(), actualizado_por = ${por}
      WHERE taller = ${taller} AND eco = ANY(SELECT jsonb_array_elements_text(${JSON.stringify(bajas)}::text::jsonb))`;
  }

  if (D.length) {
    await db.sql`
      INSERT INTO disp_mes (taller, mes, eco, dias, mascara, actualizado, actualizado_por)
      SELECT ${taller}, ${mes}, x.eco, disp_mezcla(repeat('.', 31), x.mascara), x.mascara, now(), ${por}
      FROM jsonb_to_recordset(${JSON.stringify(D)}::text::jsonb) AS x(eco text, mascara text)
      ON CONFLICT (taller, mes, eco) DO UPDATE SET
        dias = disp_mezcla(disp_mes.dias, EXCLUDED.mascara), mascara = EXCLUDED.mascara,
        actualizado = now(), actualizado_por = EXCLUDED.actualizado_por`;
  }

  await db.sql`INSERT INTO disp_bitacora (taller, mes, accion, por, detalle)
    VALUES (${taller}, ${mes}, ${accion}, ${por}, ${JSON.stringify({ unidades: U.length, dias: D.length, bajas, cambios: D.slice(0, 200) })}::text::jsonb)`;

  // Regresa el estado actualizado de los económicos tocados
  const ecos = [...new Set([...D.map((d: any) => d.eco)])];
  const nuevos = ecos.length
    ? await db.sql`SELECT eco, dias FROM disp_mes WHERE taller = ${taller} AND mes = ${mes} AND eco = ANY(SELECT jsonb_array_elements_text(${JSON.stringify(ecos)}::text::jsonb))`
    : [];
  return json({ ok: true, dias: Object.fromEntries(nuevos.map((r: any) => [r.eco, r.dias])), ahora: new Date().toISOString(), por });
};

export const config: Config = { path: "/api/disponibilidad" };
