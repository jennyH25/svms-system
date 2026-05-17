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
- `EMAIL_ASSET_BASE_URL`
- `EMAIL_LOGO_URL`
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
- `CRON_SECRET`

Frontend build-time variables:

- `VITE_PUSHER_KEY`
- `VITE_PUSHER_CLUSTER`

Notes:

- The app reads both `DATABASE_URL`/`SUPABASE_DB_URL` and the `PG*` variables. Keeping both in Vercel is fine.
- For Vercel or any serverless deployment, point `DATABASE_URL`/`SUPABASE_DB_URL` to the Supabase transaction pooler on port `6543`, not the session pooler on port `5432`. Session mode can hit `EMAXCONNSESSION` under normal multi-user traffic.
- Keep `DB_POOL_MAX` very small in serverless. Start with `1` and only raise it if you have measured need.
- Vercel will not read your local `.env` automatically because it is not committed and should stay secret.
- Any variable starting with `VITE_` must also be added in Vercel because Vite injects it at build time.
- The deployment includes a lightweight keepalive cron at `/api/cron/keepalive` every 3 days. It only performs a `SELECT 1` plus a tiny heartbeat upsert in `app_state`, which is enough to register gentle database activity without generating meaningful load.
- If you set `CRON_SECRET` in Vercel, the cron routes require `Authorization: Bearer <CRON_SECRET>`. Keeping it set is recommended so the endpoints are not publicly callable.
- The current codebase does not read `SVMS_ENABLE_SERVERLESS_ARCHIVE_MAINTENANCE`, `SVMS_ENABLE_SERVERLESS_ARCHIVE_AUTOSTART`, or `SVMS_ENABLE_SERVERLESS_LEGACY_WORKBOOK_IMPORT`, so those do not need to be added unless you wire them into the app later.
