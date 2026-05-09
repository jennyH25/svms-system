import "dotenv/config";
import {
  closeDbPool,
  getSeedAccountsFromEnv,
  syncAppStateDatabase,
  syncAuditLogsDatabase,
  syncAuthDatabase,
  syncNotificationsDatabase,
  syncPasswordResetDatabase,
  syncStudentViolationLogsDatabase,
  syncStudentsDatabase,
  syncStudentsFromUsers,
  syncSuperAdminSecurityDatabase,
  syncSystemSettingsDatabase,
  syncViolationsDatabase,
  hasDbConfig,
} from "../server/db.js";

process.env.NODE_ENV = "serverless";
process.env.SVMS_ENABLE_SERVERLESS_DB_SYNC = "false";
process.env.SVMS_ENABLE_SERVERLESS_WORKBOOK_READS = "true";

// If no database configuration is present, avoid failing the Vercel build.
if (!hasDbConfig()) {
  console.log(
    "No database configuration detected; skipping DB preparation for Vercel deployment.",
  );
  process.exit(0);
}

async function runPrepareDatabase() {
  const seedAccounts = getSeedAccountsFromEnv();
  await syncAuthDatabase({ seedAccounts });
  await syncStudentsDatabase();
  await syncSystemSettingsDatabase();
  await syncViolationsDatabase();
  await syncAuditLogsDatabase();
  await syncStudentsFromUsers();
  await syncNotificationsDatabase();
  await syncPasswordResetDatabase();
  await syncSuperAdminSecurityDatabase();
  await syncStudentViolationLogsDatabase();
  await syncAppStateDatabase();
  console.log("Database schema prepared for Vercel deployment.");
}

async function runHistoricalImport() {
  const { default: app } = await import("../server/index.js");
  const server = await new Promise((resolve, reject) => {
    const nextServer = app.listen(0, () => resolve(nextServer));
    nextServer.on("error", reject);
  });
  const { port } = server.address();

  try {
    const response = await fetch(
      `http://127.0.0.1:${port}/api/archive/cleanup-and-reimport-workbook`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    const text = await response.text();
    let payload = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`Unexpected response from workbook import: ${text.slice(0, 200)}`);
    }

    if (!response.ok) {
      throw new Error(payload.message || `Workbook import failed with status ${response.status}`);
    }

    console.log("Historical workbook import completed.");
    console.log(
      JSON.stringify(
        {
          cleanupCount: payload.cleanupCount || 0,
          importCount: payload.importCount || 0,
          skippedCount: payload.skippedCount || 0,
        },
        null,
        2,
      ),
    );
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

async function main() {
  try {
    await runPrepareDatabase();
    await runHistoricalImport();
  } catch (error) {
    console.error("Failed to prepare the database for Vercel deployment.");
    console.error(error.message || error);
    process.exitCode = 1;
  } finally {
    await closeDbPool();
  }
}

await main();
