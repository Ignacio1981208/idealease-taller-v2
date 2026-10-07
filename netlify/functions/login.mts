import type { Context, Config } from "@netlify/functions";
import { db, json, txt, ipDe, firmarSesion, asegurarConfig, pinIgual, TALLERES, ROLES, ROL_DIRECCION } from "./_lib.mts";

const MAX_FALLOS = 5;
const BLOQUEO_MIN = 10;

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const body = await req.json().catch(() => ({}));
  const role = txt((body as any).role, 60);
  const pin = txt((body as any).pin, 20);
  const esDireccion = role === ROL_DIRECCION;
  const taller = esDireccion ? "*" : txt((body as any).taller, 30);

  if (!role || !pin) return json({ error: "Rol y PIN requeridos" }, 400);
  if (!esDireccion && (!TALLERES.includes(taller) || !ROLES.includes(role))) {
    return json({ error: "Taller o rol inválido" }, 400);
  }

  if (!(await asegurarConfig())) {
    return json({ error: "El sistema aún no tiene PINs configurados. Avisa al administrador." }, 503);
  }

  // Bloqueo por intentos fallidos (por IP + taller + rol)
  const clave = `${ipDe(req, context)}|${taller}|${role}`;
  const est = await db.sql`SELECT fallos, bloqueado_hasta FROM login_intentos WHERE clave = ${clave}`;
  if (est.length && est[0].bloqueado_hasta && new Date(est[0].bloqueado_hasta).getTime() > Date.now()) {
    const min = Math.max(1, Math.ceil((new Date(est[0].bloqueado_hasta).getTime() - Date.now()) / 60000));
    return json({ error: `Demasiados intentos. Intenta de nuevo en ${min} min.`, code: "bloqueado" }, 429);
  }

  let pinCorrecto: string | null = null;
  if (esDireccion) {
    const r = await db.sql`SELECT value FROM app_settings WHERE key = 'pin_direccion'`;
    pinCorrecto = r.length ? String(r[0].value) : null;
  } else {
    const r = await db.sql`SELECT pin FROM taller_pins WHERE taller = ${taller} AND role = ${role}`;
    pinCorrecto = r.length ? String(r[0].pin) : null;
  }

  if (!pinCorrecto || !pinIgual(pin, pinCorrecto)) {
    const f = await db.sql`
      INSERT INTO login_intentos (clave, fallos) VALUES (${clave}, 1)
      ON CONFLICT (clave) DO UPDATE SET fallos = login_intentos.fallos + 1
      RETURNING fallos`;
    if (Number(f[0].fallos) >= MAX_FALLOS) {
      await db.sql`UPDATE login_intentos SET fallos = 0, bloqueado_hasta = now() + interval '10 minutes' WHERE clave = ${clave}`;
      return json({ error: `Demasiados intentos. Intenta de nuevo en ${BLOQUEO_MIN} min.`, code: "bloqueado" }, 429);
    }
    return json({ error: "PIN incorrecto" }, 401);
  }

  await db.sql`DELETE FROM login_intentos WHERE clave = ${clave}`;
  const { token, exp } = await firmarSesion(role, taller);
  return json({ token, role, taller, exp });
};

export const config: Config = { path: "/api/login" };
