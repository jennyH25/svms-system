# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Supabase PostgreSQL Setup

This repository includes a database connectivity check script:

```bash
npm run db:test
```

Required environment variables:

- `PGHOST`
- `PGPORT`
- `PGUSER`
- `PGPASSWORD`
- `PGDATABASE`

Optional single-string connection:

- `SUPABASE_DB_URL` (or `DATABASE_URL`)

Direct connection format:

- `postgresql://postgres:[YOUR-PASSWORD]@db.emmtmzvcbzfnrbwixrld.supabase.co:5432/postgres`

Use `.env` for local development and run `npm run db:test` to verify connectivity.

Important notes:

- Supabase direct connections typically require SSL; keep `PGSSL=true` unless your environment explicitly disables SSL.

## Backend API (Node.js + Express)

This repository now includes a backend API server in `server/`.

Run API in development:

```bash
npm run api:dev
```

Run frontend + API together in development (recommended):

```bash
npm run dev
```

Run API in normal mode:

```bash
npm run api:start
```

Health endpoints:

- `GET /api/health`
- `GET /api/db-health`
- `POST /api/auth/login`

## Auth Database Setup (PostgreSQL)

Create/update the `users` table and seed login users from environment variables:

```bash
npm run db:setup-auth
```

If your local machine cannot reach the direct Supabase DB host, run `scripts/supabase-init.sql` in Supabase SQL Editor to create `public.users` and seed the same accounts.

The same auth schema/user synchronization also runs automatically when the API server starts.

Seed account env vars:

- `AUTH_ADMIN_EMAIL`
- `AUTH_ADMIN_USERNAME`
- `AUTH_ADMIN_PASSWORD`
- `AUTH_STUDENT_EMAIL`
- `AUTH_STUDENT_USERNAME`
- `AUTH_STUDENT_PASSWORD`

Passwords are stored as bcrypt hashes in `users.password_hash`.

Important:

- Run `npm run db:setup-auth` after setting PostgreSQL/Supabase environment variables.

## Desktop App (Electron)

Electron files are in `electron/`.

Run Electron with Vite frontend:

```bash
npm run desktop:dev
```

Run API + Vite + Electron together:

```bash
npm run desktop:full
```

Run Electron against built frontend:

```bash
npm run desktop:start
```
