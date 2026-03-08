import "dotenv/config";
import express from "express";
import cors from "cors";
import { closeDbPool, getDbPool, getMissingDbVars, hasDbConfig } from "./db.js";

const app = express();
const port = Number(process.env.API_PORT || process.env.PORT || 3001);

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
    const pool = getDbPool();
    const [rows] = await pool.query("SELECT 1 AS ok");
    const ok = Array.isArray(rows) && rows[0]?.ok === 1;

    if (!ok) {
      return res.status(500).json({
        status: "error",
        message: "Database test query did not return expected value.",
      });
    }

    return res.status(200).json({
      status: "ok",
      database: process.env.MYSQLDATABASE,
      host: process.env.MYSQLHOST,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
});

const server = app.listen(port, () => {
  console.log(`SVMS API running on port ${port}`);
});

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
