# IDEALEASE · Seguimiento de Unidades en Taller

App independiente (fuera de Claude) para dar seguimiento a unidades en las 8 etapas del taller,
con login por PIN de rol, base de datos Postgres (Netlify DB) y exportación a Excel.

## Desplegar en Netlify (recomendado)

Ya existe un sitio reservado para este proyecto:
- URL: https://idealease-taller-mantenimiento.netlify.app
- Site ID: 7f311d23-950e-42e0-8c3a-52e2babc4f62

1. Instala Netlify CLI si no la tienes: `npm install -g netlify-cli`
2. Dentro de esta carpeta, ejecuta:
   ```
   netlify login
   netlify link --id 7f311d23-950e-42e0-8c3a-52e2babc4f62
   netlify deploy --prod
   ```
3. La base de datos Postgres se provisiona automáticamente al desplegar (no necesitas crearla a mano).

## PINs iniciales por rol (cámbialos apenas puedas)

| Rol | PIN |
|---|---|
| Vigilante | 1841 |
| Asesor de Servicio | 2752 |
| Supervisor Mantenimiento | 3663 |
| Técnico | 4574 |
| Almacenista | 5485 |

Para cambiarlos: entra al panel de Netlify → tu sitio → Netlify DB → tabla `role_pins`, y edita
el valor de `pin` para cada `role`. También puedes pedírmelo en el chat y te doy las sentencias SQL.

## Variables de entorno recomendadas

- `SESSION_SECRET`: en Netlify → Site settings → Environment variables, agrega una cadena
  aleatoria larga (ej. generada con `openssl rand -hex 32`). Si no la configuras, la app usa
  un secreto por defecto (menos seguro, pero funcional).

## Estructura

- `public/index.html` — Frontend (React + htm, sin paso de build)
- `netlify/functions/` — API (login, unidades, transición de etapa, exportar)
- `netlify/database/migrations/` — Esquema de la base de datos (se aplica automáticamente)
