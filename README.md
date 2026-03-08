# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Railway MySQL Setup

This repository includes a database connectivity check script:

```bash
npm run db:test
```

Required environment variables:

- `MYSQLHOST`
- `MYSQLPORT`
- `MYSQLUSER`
- `MYSQLPASSWORD`
- `MYSQLDATABASE`

Use `.env` for local development and set the same variables in Railway Service Variables for deployment.

Railway deploy behavior:

- `railway.json` config sets Railway build command to `npm run railway:build`.
- `railway:build` runs `vite build` for reliable frontend deployment.
- Run `npm run db:test` separately in an environment where MySQL variables are available.

Important notes:

- `mysql.railway.internal` is typically only reachable from Railway's private network.
- If `npm run db:test` fails locally with DNS/network errors, that can be expected outside Railway private networking.
- GitHub pushes trigger Railway redeploys only when the service is connected to the repo/branch and auto-deploy is enabled in Railway settings.

## Backend API (Node.js + Express)

This repository now includes a backend API server in `server/`.

Run API in development:

```bash
npm run api:dev
```

Run API in normal mode:

```bash
npm run api:start
```

Health endpoints:

- `GET /api/health`
- `GET /api/db-health`
- `POST /api/auth/login`

## Auth Database Setup (MySQL)

Create the users table and seed the required admin/student accounts:

```bash
npm run db:setup-auth
```

Seeded accounts:

- Admin: `jennypatanag@gmail.com` / `jen25`
- Student: `hermoso_lyrika@plpasig.edu.ph` / `leeRiKang`

Passwords are stored as bcrypt hashes in `users.password_hash`.

Important:

- `mysql.railway.internal` is reachable only from Railway private networking.
- Run `npm run db:setup-auth` in a Railway runtime context (service shell/command), not from a local machine, if local DNS cannot resolve that host.

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
