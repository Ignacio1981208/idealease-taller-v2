-- Estatus Unidades Camino Casa V4: 4 talleres, PINs por taller/rol en el servidor, aceptación de salto

ALTER TABLE units ADD COLUMN IF NOT EXISTS taller TEXT NOT NULL DEFAULT 'veracruz';
ALTER TABLE units ADD COLUMN IF NOT EXISTS salto_pendiente BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE units ADD COLUMN IF NOT EXISTS color_tipo TEXT;
ALTER TABLE units ADD COLUMN IF NOT EXISTS tot BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_units_taller ON units(taller, archived);

-- PIN por taller y rol. Los valores NO viven en el código: se cargan una sola vez
-- desde la variable de entorno PINES_INICIALES la primera vez que alguien inicia sesión.
CREATE TABLE IF NOT EXISTS taller_pins (
  taller TEXT NOT NULL,
  role TEXT NOT NULL,
  pin TEXT NOT NULL,
  PRIMARY KEY (taller, role)
);

-- Configuración interna (PIN de Dirección, llave de sesión)
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Control de intentos fallidos de PIN
CREATE TABLE IF NOT EXISTS login_intentos (
  clave TEXT PRIMARY KEY,
  fallos INT NOT NULL DEFAULT 0,
  bloqueado_hasta TIMESTAMPTZ
);

-- Los PIN de la versión 2 (uno por rol, iguales para todos) ya no se usan
DROP TABLE IF EXISTS role_pins;
