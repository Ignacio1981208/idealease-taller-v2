import { getDatabase } from "@netlify/database";
import crypto from "node:crypto";

export const db = getDatabase();

export const TALLERES = ["veracruz", "tultitlan", "altamira", "cordoba"];
export const ROL_DIRECCION = "Dirección General";

export const ETAPAS = [
  { id: 1, nombre: "Ingreso Vigilante", rol: "Vigilante" },
  { id: 2, nombre: "Recepción Servicio", rol: "Asesor de Servicio" },
  { id: 3, nombre: "Pendiente Asignar", rol: "Supervisor Mantenimiento" },
  { id: 4, nombre: "Diagnóstico/Revisión", rol: "Técnico" },
  { id: 5, nombre: "Surtimiento Refacción", rol: "Almacenista" },
  { id: 6, nombre: "Reparación", rol: "Técnico" },
  { id: 7, nombre: "Validación Taller", rol: "Supervisor Mantenimiento" },
  { id: 8, nombre: "Validación Servicio (Disponible)", rol: "Asesor de Servicio" },
];
export const ROLES = [...new Set(ETAPAS.map((e) => e.rol))];

// ---------- utilidades ----------
export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export function txt(v: unknown, max: number): string {
  return String(v ?? "").trim().slice(0, max);
}

export function ipDe(req: Request, context: any): string {
  return context?.ip || req.headers.get("x-nf-client-connection-ip") || "desconocida";
}

// ---------- llave de sesión (variable de entorno, o generada y guardada en la base) ----------
let secretoCache: string | null = null;
async function getSecreto(): Promise<string> {
  if (secretoCache) return secretoCache;
  const env = Netlify.env.get("SESSION_SECRET");
  if (env) { secretoCache = env; return env; }
  let r = await db.sql`SELECT value FROM app_settings WHERE key = 'session_secret'`;
  if (r.length === 0) {
    await db.sql`INSERT INTO app_settings (key, value) VALUES ('session_secret', ${crypto.randomBytes(32).toString("hex")}) ON CONFLICT (key) DO NOTHING`;
    r = await db.sql`SELECT value FROM app_settings WHERE key = 'session_secret'`;
  }
  secretoCache = String(r[0].value);
  return secretoCache;
}

function b64url(buf: Buffer) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function firma(body: string, secreto: string) {
  return b64url(crypto.createHmac("sha256", secreto).update(body).digest());
}
function iguales(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export type Sesion = { role: string; taller: string; exp: number };

export async function firmarSesion(role: string, taller: string, horas = 12): Promise<{ token: string; exp: number }> {
  const exp = Date.now() + horas * 3600 * 1000;
  const body = b64url(Buffer.from(JSON.stringify({ role, taller, exp })));
  return { token: `${body}.${firma(body, await getSecreto())}`, exp };
}

export async function autenticar(req: Request): Promise<Sesion | null> {
  const m = (req.headers.get("authorization") || "").match(/^Bearer (.+)$/);
  if (!m) return null;
  const [body, sig] = m[1].split(".");
  if (!body || !sig) return null;
  if (!iguales(sig, firma(body, await getSecreto()))) return null;
  try {
    const p = JSON.parse(Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    if (!p.exp || p.exp < Date.now()) return null;
    return { role: String(p.role), taller: String(p.taller), exp: Number(p.exp) };
  } catch {
    return null;
  }
}

// ---------- PIN iniciales (desde variable de entorno, solo la primera vez) ----------
// PINES_INICIALES = {"veracruz":{"Vigilante":"1234",...},"tultitlan":{...},...,"direccion":"0000"}
let configLista = false;
export async function asegurarConfig(): Promise<boolean> {
  if (configLista) return true;
  const n = await db.sql`SELECT COUNT(*)::int AS n FROM taller_pins`;
  if (Number(n[0].n) === 0) {
    const raw = Netlify.env.get("PINES_INICIALES");
    if (!raw) return false;
    let cfg: any;
    try { cfg = JSON.parse(raw); } catch { return false; }
    for (const taller of TALLERES) {
      for (const role of ROLES) {
        const pin = cfg?.[taller]?.[role];
        if (pin) {
          await db.sql`INSERT INTO taller_pins (taller, role, pin) VALUES (${taller}, ${role}, ${String(pin)}) ON CONFLICT (taller, role) DO NOTHING`;
        }
      }
    }
    if (cfg?.direccion) {
      await db.sql`INSERT INTO app_settings (key, value) VALUES ('pin_direccion', ${String(cfg.direccion)}) ON CONFLICT (key) DO NOTHING`;
    }
  }
  const n2 = await db.sql`SELECT COUNT(*)::int AS n FROM taller_pins`;
  configLista = Number(n2[0].n) > 0;
  return configLista;
}

export function pinIgual(a: string, b: string) {
  return iguales(String(a), String(b));
}

// ---------- unidades ----------
export function rowToUnit(r: any) {
  return {
    id: r.id,
    taller: r.taller,
    vin: r.vin,
    placa: r.placa,
    cliente: r.cliente,
    ot: r.ot,
    motivoIngreso: r.motivo_ingreso,
    tecnico1: r.tecnico1,
    tecnico2: r.tecnico2,
    tecnico3: r.tecnico3,
    trabajo1: r.trabajo1,
    trabajo2: r.trabajo2,
    trabajo3: r.trabajo3,
    diagnostico: r.diagnostico,
    surtidoCompleto: r.surtido_completo,
    pendienteSurtido: r.pendiente_surtido,
    reparacion: r.reparacion,
    auditoriaTaller: r.auditoria_taller,
    auditoriaServicio: r.auditoria_servicio,
    colorTipo: r.color_tipo,
    tot: r.tot,
    saltoPendiente: r.salto_pendiente,
    etapaActual: r.etapa_actual,
    notaActual: r.nota_actual,
    historial: r.historial,
    archived: r.archived,
    fechaIngreso: r.fecha_ingreso,
    fechaSalida: r.fecha_salida,
  };
}
