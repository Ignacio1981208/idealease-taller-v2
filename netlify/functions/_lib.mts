import { getDatabase } from "@netlify/database";
import crypto from "node:crypto";

export const db = getDatabase();

const SECRET = Netlify.env.get("SESSION_SECRET") || "ideal-taller-default-secret-cambia-esto";

export const ETAPAS = [
  { id: 1, nombre: "Ingreso Vigilante", rol: "Vigilante", metaHrs: 0.5 },
  { id: 2, nombre: "Recepción Servicio", rol: "Asesor de Servicio", metaHrs: 1 },
  { id: 3, nombre: "Pendiente Asignar", rol: "Supervisor Mantenimiento", metaHrs: 1 },
  { id: 4, nombre: "Diagnóstico/Revisión", rol: "Técnico", metaHrs: 4 },
  { id: 5, nombre: "Surtimiento Refacción", rol: "Almacenista", metaHrs: 8 },
  { id: 6, nombre: "Reparación", rol: "Técnico", metaHrs: 8 },
  { id: 7, nombre: "Validación Taller", rol: "Supervisor Mantenimiento", metaHrs: 1 },
  { id: 8, nombre: "Validación Servicio (Disponible)", rol: "Asesor de Servicio", metaHrs: 1 },
];

function b64url(input: Buffer) {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function signToken(payload: object) {
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  const sig = b64url(crypto.createHmac("sha256", SECRET).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyToken(token: string | null): { role: string; exp: number } | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = b64url(crypto.createHmac("sha256", SECRET).update(body).digest());
  if (expected !== sig) return null;
  try {
    const payload = JSON.parse(Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
    if (payload.exp && payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function getBearer(req: Request) {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer (.+)$/);
  return m ? m[1] : null;
}

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

export function rowToUnit(r: any) {
  return {
    id: r.id,
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
    etapaActual: r.etapa_actual,
    notaActual: r.nota_actual,
    historial: r.historial,
    archived: r.archived,
    fechaIngreso: r.fecha_ingreso,
    fechaSalida: r.fecha_salida,
  };
}
