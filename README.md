# Estatus Unidades Camino Casa · V4
Mantenimiento Idealease Oriente — seguimiento de unidades con ingreso a mantenimiento
(Veracruz, Tultitlán, Altamira, Córdoba) y Monitoreo Dirección General.

## Cómo está armado
- `public/` → la aplicación (ya compilada). `index.html`, `app.js`, `assets/`, íconos y `manifest.webmanifest`
  (permite "Agregar a pantalla de inicio" en el celular).
- `netlify/functions/` → servidor: `login`, `snapshot` (consulta), `units` (alta), `unit-action` (avanzar, regresar,
  aceptar salto, confirmar disponibilidad, eliminar). Toda regla de negocio y todo permiso se valida aquí.
- `netlify/database/migrations/` → estructura de la base de datos (Netlify DB / Postgres).
  `001_init` ya estaba aplicada: **no se modifica**. `002_camino_casa_v4` agrega taller, aceptación de salto y PINs.
- `src/app.jsx` → código fuente de la pantalla (public/app.js se genera desde aquí).

## Configuración inicial (una sola vez)
Los PIN **no viven en el código ni en GitHub**. Se cargan desde una variable de entorno de Netlify:

1. Netlify → Site configuration → Environment variables → Add a variable.
2. Nombre: `PINES_INICIALES`. Valor: el JSON con los PIN (formato abajo). Alcance: todos (incluye Functions).
3. Después de agregarla, hacer un nuevo despliegue (Deploys → Trigger deploy → Deploy site).
4. El primer inicio de sesión copia los PIN a la base de datos. Después ya se puede borrar la variable.

Formato:
```
{"veracruz":{"Vigilante":"0000","Asesor de Servicio":"0000","Supervisor Mantenimiento":"0000","Técnico":"0000","Almacenista":"0000"},
 "tultitlan":{...}, "altamira":{...}, "cordoba":{...}, "direccion":"0000"}
```

## Cambiar un PIN después
En Netlify → Database, ejecutar:
```sql
UPDATE taller_pins SET pin = '1234' WHERE taller = 'altamira' AND role = 'Técnico';
UPDATE app_settings SET value = '5678' WHERE key = 'pin_direccion';
```

## Seguridad
- El navegador nunca recibe los PIN; el servidor los compara y entrega una sesión firmada de 12 horas.
- 5 PIN incorrectos seguidos desde el mismo dispositivo/red bloquean ese acceso 10 minutos.
- Cada rol solo ve y modifica su taller y solo la etapa que le corresponde. Dirección es de solo lectura.
- Solo el Supervisor de Mantenimiento puede eliminar unidades.
- Recomendado: dejar el repositorio de GitHub en **privado**.

## Recompilar la pantalla (solo si se modifica `src/app.jsx`)
```
npm install --no-save esbuild react@18 react-dom@18 xlsx
npx esbuild src/app.jsx --bundle --minify --format=esm --splitting --target=es2019 \
  --outdir=public --entry-names=app --chunk-names=assets/[name]-[hash] \
  --define:process.env.NODE_ENV='"production"'
```

## Disponibilidad de flota (IDO 360) · agregado oct 2026
Reporte diario de disponibilidad por sucursal (R, RT, D, T, ND, S, MI, SER) que se captura en
`/disponibilidad.html` y se ve en vivo en `central.html` → menú **Disponibilidad**.

- `netlify/database/migrations/004_disponibilidad/` → tablas `disp_unidades` (catálogo), `disp_mes`
  (estatus por día, 31 caracteres por unidad y mes), `disp_bitacora` (quién guardó qué) y la función
  `disp_mezcla` (guarda solo los días que cambiaron, sin pisar lo que capturó otra persona).
  No modifica ninguna tabla existente.
- `netlify/functions/disponibilidad.mts` → `GET/POST /api/disponibilidad`.
  - Captura: **solo el Especialista de Servicio**, con **PIN propio**, y solo en su sucursal
    (lo valida el servidor). Ningún otro rol puede guardar.
  - Consulta: Dirección General ve las 4 sucursales; el Especialista solo la suya.
  - El PIN de Especialista **no** abre Camino Casa ni el Reporte de Piso (`/api/snapshot` lo rechaza).
- IDO 360 Central (`central.html`): en el acceso se elige **Dirección General** o **Especialista de
  Servicio + sucursal**. El Especialista solo ve el menú Disponibilidad, fijo en su sucursal, con el botón
  **Capturar disponibilidad** (abre `/disponibilidad.html` con la misma sesión, sin volver a pedir PIN).

### Dar de alta los PIN de Especialista de Servicio (una sola vez)
En Netlify → Database, ejecutar (cambia 0000 por el PIN de cada sucursal):
```sql
INSERT INTO taller_pins (taller, role, pin) VALUES
  ('veracruz',  'Especialista de Servicio', '0000'),
  ('tultitlan', 'Especialista de Servicio', '0000'),
  ('altamira',  'Especialista de Servicio', '0000'),
  ('cordoba',   'Especialista de Servicio', '0000')
ON CONFLICT (taller, role) DO UPDATE SET pin = EXCLUDED.pin;
```
Cambiar uno después: `UPDATE taller_pins SET pin = '1234' WHERE taller = 'veracruz' AND role = 'Especialista de Servicio';`
- Carga inicial: el Especialista de cada sucursal entra a `/disponibilidad.html`, botón **Cargar Excel** (formato actual
  "Disponibilidad <Mes>"). Al importar se reemplaza el catálogo de esa sucursal; las unidades que ya no
  vienen quedan inactivas en la base (no se borran).
- La Central relee la disponibilidad cada minuto, junto con el Reporte de Piso, y cruza por VIN las
  unidades en taller contra su estatus de disponibilidad.

Consultas útiles en Netlify → Database:
```sql
-- Últimos guardados
SELECT fecha, taller, mes, accion, por FROM disp_bitacora ORDER BY fecha DESC LIMIT 50;
-- Unidades por sucursal
SELECT taller, COUNT(*) FROM disp_unidades WHERE activa GROUP BY taller;
```
