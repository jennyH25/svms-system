import "dotenv/config";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  closeDbPool,
  getSeedAccountsFromEnv,
  getDbPool,
  getMissingDbVars,
  hasDbConfig,
  syncAuthDatabase,
} from "./db.js";

const app = express();
const port = Number(process.env.API_PORT || process.env.PORT || 3001);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.resolve(__dirname, "../dist");

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "svms-api",
    runtime: "node-express",
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/db-health", async (_req, res) => {
  if (!hasDbConfig()) {
    return res.status(500).json({
      status: "error",
      message: "Database environment variables are missing.",
      missing: getMissingDbVars(),
    });
  }

  try {
    await ensureAuthDatabaseReady();
    const pool = getDbPool();
    const result = await pool.query("SELECT 1 AS ok");
    const ok = Array.isArray(result.rows) && result.rows[0]?.ok === 1;

    if (!ok) {
      return res.status(500).json({
        status: "error",
        message: "Database test query did not return expected value.",
      });
    }

    return res.status(200).json({
      status: "ok",
      database: process.env.PGDATABASE || "postgres",
      host: process.env.PGHOST || "supabase",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(503).json({
      status: "error",
      message: `Database unavailable or sync failed: ${error.message}`,
    });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body ?? {};

  if (!username || !password) {
    return res.status(400).json({
      status: "error",
      message: "Username/email and password are required.",
    });
  }

  if (!hasDbConfig()) {
    return res.status(500).json({
      status: "error",
      message: "Database environment variables are missing.",
      missing: getMissingDbVars(),
    });
  }

  try {
    await ensureAuthDatabaseReady();
    const pool = getDbPool();
    const result = await pool.query(
      `
      SELECT id, email, username, password_hash, role, first_name, last_name, is_active
      FROM users
      WHERE username = $1 OR email = $1
      LIMIT 1
      `,
      [username],
    );

    const user = Array.isArray(result.rows) ? result.rows[0] : null;

    if (!user || !user.is_active) {
      return res.status(401).json({
        status: "error",
        message: "Invalid username/email or password.",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(401).json({
        status: "error",
        message: "Invalid username/email or password.",
      });
    }

    return res.status(200).json({
      status: "ok",
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        firstName: user.first_name || "",
        lastName: user.last_name || "",
        fullName: [user.first_name, user.last_name].filter(Boolean).join(" "),
      },
    });
  } catch (error) {
    return res.status(503).json({
      status: "error",
      message: `Login unavailable: database not ready (${error.message}).`,
    });
  }
});

app.put("/api/profile/admin", async (req, res) => {
  const { id, username, email, firstName, lastName } = req.body ?? {};

  if (!id) {
    return res.status(400).json({
      status: "error",
      message: "Admin user id is required.",
    });
  }

  if (!hasDbConfig()) {
    return res.status(500).json({
      status: "error",
      message: "Database environment variables are missing.",
      missing: getMissingDbVars(),
    });
  }

  try {
    await ensureAuthDatabaseReady();

    const pool = getDbPool();
    const result = await pool.query(
      `
      UPDATE users
      SET
        username = COALESCE(NULLIF($1, ''), username),
        email = COALESCE(NULLIF($2, ''), email),
        first_name = $3,
        last_name = $4
      WHERE id = $5 AND role = 'admin'
      RETURNING id, email, username, role, first_name, last_name
      `,
      [
        username || null,
        email || null,
        firstName?.trim() || null,
        lastName?.trim() || null,
        id,
      ],
    );

    const updated = Array.isArray(result.rows) ? result.rows[0] : null;

    if (!updated) {
      return res.status(404).json({
        status: "error",
        message: "Admin profile not found.",
      });
    }

    return res.status(200).json({
      status: "ok",
      user: {
        id: updated.id,
        email: updated.email,
        username: updated.username,
        role: updated.role,
        firstName: updated.first_name || "",
        lastName: updated.last_name || "",
        fullName: [updated.first_name, updated.last_name]
          .filter(Boolean)
          .join(" "),
      },
    });
  } catch (error) {
    return res.status(503).json({
      status: "error",
      message: `Unable to save admin profile (${error.message}).`,
    });
  }
});

// In production, serve the built frontend from the same Express app.
app.use(express.static(distPath));

app.get("/{*path}", (req, res, next) => {
  if (req.path.startsWith("/api/")) {
    return next();
  }

  return res.sendFile(path.join(distPath, "index.html"));
});

let server;
let authSyncPromise = null;

async function ensureAuthDatabaseReady() {
  if (!authSyncPromise) {
    const seedAccounts = getSeedAccountsFromEnv();
    authSyncPromise = syncAuthDatabase({ seedAccounts });
  }

  try {
    await authSyncPromise;
  } catch (error) {
    authSyncPromise = null;
    throw error;
  }
}

async function startServer() {
  if (hasDbConfig()) {
    try {
      const seedAccounts = getSeedAccountsFromEnv();
      await ensureAuthDatabaseReady();
      console.log("Auth database synchronized.");
      if (seedAccounts.length === 0) {
        console.log("No account seed variables detected during startup.");
      }
    } catch (error) {
      console.error("Failed to synchronize auth database on startup.");
      console.error(error.message);
    }
  } else {
    console.warn(
      "Database variables are missing. Login API will not work until DB config is set.",
    );
  }

  server = app.listen(port, () => {
    console.log(`SVMS API running on port ${port}`);
  });
}

async function shutdown(signal) {
  console.log(`Received ${signal}, shutting down...`);

  server.close(async () => {
    await closeDbPool();
    process.exit(0);
  });
}

process.on("SIGINT", () => {
  shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  shutdown("SIGTERM");
});

startServer();
