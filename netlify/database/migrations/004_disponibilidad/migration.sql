-- IDO 360 · Disponibilidad de flota por sucursal (estatus diario R, RT, D, T, ND, S, MI, SER)
-- No modifica ninguna tabla existente de Camino Casa / Foránea.

-- Catálogo de unidades por sucursal (una fila por económico)
CREATE TABLE IF NOT EXISTS disp_unidades (
  taller TEXT NOT NULL,
  eco TEXT NOT NULL,
  flota TEXT NOT NULL DEFAULT 'ACTIVA',
  contrato TEXT NOT NULL DEFAULT '',
  rango TEXT NOT NULL DEFAULT '',
  tipo TEXT NOT NULL DEFAULT '',
  descripcion TEXT NOT NULL DEFAULT '',
  modelo TEXT NOT NULL DEFAULT '',
  placas TEXT NOT NULL DEFAULT '',
  vin TEXT NOT NULL DEFAULT '',
  ubicacion TEXT NOT NULL DEFAULT '',
  cliente TEXT NOT NULL DEFAULT '',
  fecha_compromiso TEXT NOT NULL DEFAULT '',
  comentario TEXT NOT NULL DEFAULT '',
  orden INT NOT NULL DEFAULT 0,
  activa BOOLEAN NOT NULL DEFAULT TRUE,
  actualizado TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_por TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (taller, eco)
);

-- Estatus diario: una fila por sucursal + mes + económico.
-- "dias" son 31 caracteres, uno por día: R=R, r=RT, D=D, T=T, n=ND, S=S, M=MI, E=SER, '.'=sin captura
CREATE TABLE IF NOT EXISTS disp_mes (
  taller TEXT NOT NULL,
  mes TEXT NOT NULL,
  eco TEXT NOT NULL,
  dias TEXT NOT NULL DEFAULT '...............................',
  mascara TEXT NOT NULL DEFAULT '',
  actualizado TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_por TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (taller, mes, eco)
);
CREATE INDEX IF NOT EXISTS idx_disp_mes ON disp_mes(taller, mes);

-- Aplica un cambio por día sin pisar lo que otra persona capturó en otros días.
-- mascara: 31 caracteres, '_' = no tocar ese día; cualquier otro carácter = nuevo valor.
CREATE OR REPLACE FUNCTION disp_mezcla(base TEXT, mascara TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS
'SELECT string_agg(CASE WHEN substr(mascara, i, 1) = ''_'' OR substr(mascara, i, 1) = '''' THEN COALESCE(NULLIF(substr(base, i, 1), ''''), ''.'') ELSE substr(mascara, i, 1) END, '''' ORDER BY i) FROM generate_series(1, 31) AS i';

-- Bitácora: quién cambió qué y cuándo (una fila por guardado)
CREATE TABLE IF NOT EXISTS disp_bitacora (
  id BIGSERIAL PRIMARY KEY,
  fecha TIMESTAMPTZ NOT NULL DEFAULT now(),
  taller TEXT NOT NULL,
  mes TEXT NOT NULL DEFAULT '',
  accion TEXT NOT NULL,
  por TEXT NOT NULL DEFAULT '',
  detalle JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_disp_bitacora ON disp_bitacora(taller, fecha DESC);
