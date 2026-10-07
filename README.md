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
