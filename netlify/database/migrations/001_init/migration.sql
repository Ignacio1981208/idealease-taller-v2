CREATE TABLE IF NOT EXISTS units (
  id TEXT PRIMARY KEY,
  vin TEXT NOT NULL,
  placa TEXT,
  cliente TEXT NOT NULL,
  ot TEXT DEFAULT '',
  motivo_ingreso TEXT DEFAULT '',
  tecnico1 TEXT DEFAULT '',
  tecnico2 TEXT DEFAULT '',
  tecnico3 TEXT DEFAULT '',
  trabajo1 TEXT DEFAULT '',
  trabajo2 TEXT DEFAULT '',
  trabajo3 TEXT DEFAULT '',
  diagnostico TEXT DEFAULT '',
  surtido_completo BOOLEAN,
  pendiente_surtido TEXT DEFAULT '',
  reparacion TEXT DEFAULT '',
  auditoria_taller BOOLEAN DEFAULT FALSE,
  auditoria_servicio BOOLEAN DEFAULT FALSE,
  color_tipo TEXT,
  tot BOOLEAN DEFAULT FALSE,
  etapa_actual INT NOT NULL DEFAULT 1,
  nota_actual TEXT DEFAULT '',
  historial JSONB NOT NULL DEFAULT '[]',
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  fecha_ingreso TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_salida TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_units_archived ON units(archived);

CREATE TABLE IF NOT EXISTS role_pins (
  role TEXT PRIMARY KEY,
  pin TEXT NOT NULL
);

INSERT INTO role_pins (role, pin) VALUES
  ('Vigilante', '1841'),
  ('Asesor de Servicio', '2752'),
  ('Supervisor Mantenimiento', '3663'),
  ('Técnico', '4574'),
  ('Almacenista', '5485')
ON CONFLICT (role) DO NOTHING;
