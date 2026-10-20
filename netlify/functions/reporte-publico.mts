import type { Context, Config } from "@netlify/functions";
import { db, json, txt, ipDe, autenticar, asegurarConfig, pinIgual, rowToUnit, TALLERES, CAMINOS, ROL_DIRECCION } from "./_lib.mts";

// /api/reporte-publico  (AHORA CON PIN)
// Entrega los datos de los 4 talleres y los 2 caminos para armar el Reporte de Piso de todas las sucursales.
// Acceso permitido de dos formas:
//   1) Sesión de Dirección General ya iniciada:  header  Authorization: Bearer <token de /api/login>
//   2) PIN de Dirección General:                 POST { pin }   o   header  x-pin: <PIN>
// Mismo bloqueo que el login: 5 PIN incorrectos = 10 minutos bloqueado (por dispositivo/red).
// Para apagarlo por completo sin tocar el código: variable REPORTE_PUBLICO = apagado.
const MAX_POR_VENTANA = 20; // descargas por dispositivo/red cada 10 minutos
const MAX_FALLOS = 5;
const BLOQUEO_MIN = 10;
const DIAS = 365;

export default async (req: Request, context: Context) => {
  if (req.method !== "GET" && req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  if ((Netlify.env.get("REPORTE_PUBLICO") || "").trim().toLowerCase() === "apagado") {
    return json({ error: "La descarga del reporte está desactivada. Entra con tu PIN para consultarlo.", code: "apagado" }, 403);
  }

  const ip = ipDe(req, context);

  // ---------- 1) ¿Ya trae sesión válida de Dirección General? ----------
  const sesion = await autenticar(req);
  let autorizado = !!sesion && sesion.role === ROL_DIRECCION;

  // ---------- 2) Si no, pide el PIN de Dirección General ----------
  if (!autorizado) {
    let pin = txt(req.headers.get("x-pin"), 20);
    if (!pin && req.method === "POST") {
      const body: any = await req.json().catch(() => ({}));
      pin = txt(body?.pin, 20);
    }
    if (!pin) return json({ error: "Este reporte requiere el PIN de Dirección General.", code: "pin_requerido" }, 401);

    if (!(await asegurarConfig())) return json({ error: "El sistema aún no tiene PINs configurados. Avisa al administrador." }, 503);

    const claveLogin = `${ip}|*|reporte-pin`;
    const est = await db.sql`SELECT fallos, bloqueado_hasta FROM login_intentos WHERE clave = ${claveLogin}`;
    if (est.length && est[0].bloqueado_hasta && new Date(est[0].bloqueado_hasta).getTime() > Date.now()) {
      const min = Math.max(1, Math.ceil((new Date(est[0].bloqueado_hasta).getTime() - Date.now()) / 60000));
      return json({ error: `Demasiados intentos. Intenta de nuevo en ${min} min.`, code: "bloqueado" }, 429);
    }

    const r = await db.sql`SELECT value FROM app_settings WHERE key = 'pin_direccion'`;
    const pinCorrecto = r.length ? String(r[0].value) : null;
    if (!pinCorrecto || !pinIgual(pin, pinCorrecto)) {
      const f = await db.sql`
        INSERT INTO login_intentos (clave, fallos) VALUES (${claveLogin}, 1)
        ON CONFLICT (clave) DO UPDATE SET fallos = login_intentos.fallos + 1
        RETURNING fallos`;
      if (Number(f[0].fallos) >= MAX_FALLOS) {
        await db.sql`UPDATE login_intentos SET fallos = 0, bloqueado_hasta = now() + interval '10 minutes' WHERE clave = ${claveLogin}`;
        return json({ error: `Demasiados intentos. Intenta de nuevo en ${BLOQUEO_MIN} min.`, code: "bloqueado" }, 429);
      }
      return json({ error: "PIN incorrecto", code: "pin_incorrecto" }, 401);
    }
    await db.sql`DELETE FROM login_intentos WHERE clave = ${claveLogin}`;
    autorizado = true;
  }

  // ---------- Límite de descargas por dispositivo/red (ventana de 10 minutos) ----------
  const clave = `reporte|${ip}`;
  const lim = await db.sql`
    INSERT INTO login_intentos (clave, fallos, bloqueado_hasta) VALUES (${clave}, 1, now() + interval '10 minutes')
    ON CONFLICT (clave) DO UPDATE SET
      fallos = CASE WHEN login_intentos.bloqueado_hasta IS NULL OR login_intentos.bloqueado_hasta < now() THEN 1 ELSE login_intentos.fallos + 1 END,
      bloqueado_hasta = CASE WHEN login_intentos.bloqueado_hasta IS NULL OR login_intentos.bloqueado_hasta < now() THEN now() + interval '10 minutes' ELSE login_intentos.bloqueado_hasta END
    RETURNING fallos`;
  if (Number(lim[0].fallos) > MAX_POR_VENTANA) return json({ error: "Demasiadas descargas seguidas. Intenta de nuevo en unos minutos.", code: "limite" }, 429);

  // ---------- Datos ----------
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
