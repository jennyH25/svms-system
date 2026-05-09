## Vercel deployment env checklist

Copy the values from your local `.env` into the Vercel project settings under `Settings -> Environment Variables`.

Required backend variables:

- `DATABASE_URL` or `SUPABASE_DB_URL`
- `PGHOST`
- `PGPORT`
- `PGUSER`
- `PGPASSWORD`
- `PGDATABASE`
- `PGSSL`
- `PGSSL_REJECT_UNAUTHORIZED`
- `SESSION_TOKEN_SECRET`
- `ENCRYPTION_KEY`
- `ENCRYPTION_IV`

Optional backend variables:

- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `PUSHER_APP_ID`
- `PUSHER_KEY`
- `PUSHER_SECRET`
- `PUSHER_CLUSTER`
- `DB_POOL_MAX`
- `API_GET_CACHE_TTL_MS`
- `API_GET_CACHE_MAX_ENTRIES`
- `NOTIFICATION_RETENTION_DAYS`
- `SVMS_ENABLE_SERVERLESS_DB_SYNC`

Frontend build-time variables:

- `VITE_PUSHER_KEY`
- `VITE_PUSHER_CLUSTER`

Notes:

- The app reads both `DATABASE_URL`/`SUPABASE_DB_URL` and the `PG*` variables. Keeping both in Vercel is fine.
- Vercel will not read your local `.env` automatically because it is not committed and should stay secret.
- Any variable starting with `VITE_` must also be added in Vercel because Vite injects it at build time.
- The current codebase does not read `SVMS_ENABLE_SERVERLESS_ARCHIVE_MAINTENANCE`, `SVMS_ENABLE_SERVERLESS_ARCHIVE_AUTOSTART`, or `SVMS_ENABLE_SERVERLESS_LEGACY_WORKBOOK_IMPORT`, so those do not need to be added unless you wire them into the app later.
