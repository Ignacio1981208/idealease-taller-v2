-- Estatus Camino Unidades V5: camino Foránea / Sitio, comentarios por etapa y guardado parcial (borrador)

-- Camino de la unidad: 'casa' (taller propio) o 'foranea' (agencia o sitio del cliente)
ALTER TABLE units ADD COLUMN IF NOT EXISTS camino TEXT NOT NULL DEFAULT 'casa';

-- Comentarios por etapa (Camino Casa)
ALTER TABLE units ADD COLUMN IF NOT EXISTS obs_asignacion TEXT DEFAULT '';
ALTER TABLE units ADD COLUMN IF NOT EXISTS obs_taller TEXT DEFAULT '';
ALTER TABLE units ADD COLUMN IF NOT EXISTS obs_servicio TEXT DEFAULT '';

-- Datos propios del Camino Foránea / Sitio
ALTER TABLE units ADD COLUMN IF NOT EXISTS lugar_tipo TEXT DEFAULT '';
ALTER TABLE units ADD COLUMN IF NOT EXISTS lugar_nombre TEXT DEFAULT '';
ALTER TABLE units ADD COLUMN IF NOT EXISTS ciudad TEXT DEFAULT '';
ALTER TABLE units ADD COLUMN IF NOT EXISTS contacto TEXT DEFAULT '';
ALTER TABLE units ADD COLUMN IF NOT EXISTS cot_folio TEXT DEFAULT '';
ALTER TABLE units ADD COLUMN IF NOT EXISTS cot_monto TEXT DEFAULT '';
ALTER TABLE units ADD COLUMN IF NOT EXISTS cot_autorizo TEXT DEFAULT '';
ALTER TABLE units ADD COLUMN IF NOT EXISTS cot_nota TEXT DEFAULT '';
ALTER TABLE units ADD COLUMN IF NOT EXISTS fecha_compromiso TIMESTAMPTZ;
ALTER TABLE units ADD COLUMN IF NOT EXISTS nota_autorizada TEXT DEFAULT '';
ALTER TABLE units ADD COLUMN IF NOT EXISTS validada BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE units ADD COLUMN IF NOT EXISTS obs_disponible TEXT DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_units_camino ON units(taller, camino, archived);
