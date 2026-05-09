import "dotenv/config";
import { pathToFileURL } from "node:url";
import {
  closeDbPool,
  syncAppStateDatabase,
  getSeedAccountsFromEnv,
  syncAuthDatabase,
  syncAuditLogsDatabase,
  syncStudentsFromUsers,
  syncSystemSettingsDatabase,
  syncStudentsDatabase,
  syncViolationsDatabase,
  syncNotificationsDatabase,
  syncPasswordResetDatabase,
  syncSuperAdminSecurityDatabase,
  syncStudentViolationLogsDatabase,
} from "../server/db.js";

export default async function setupAuthDatabase() {
  try {
    const seedAccounts = getSeedAccountsFromEnv();
    const result = await syncAuthDatabase({ seedAccounts });
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

    console.log("Database setup completed successfully.");
    if (result.accounts.length > 0) {
      console.log("Seeded accounts:", result.accounts);
    } else {
      console.log(
        "No account seed variables found. Table was created/updated without inserting users.",
      );
    }
  } catch (error) {
    console.error("Failed to setup auth database.");
    console.error(error.message);

    if (
      String(error.message).includes("ENOTFOUND") ||
      String(error.message).includes("ENETUNREACH")
    ) {
      console.error(
        "Direct DB host is unreachable from this machine. Run scripts/supabase-init.sql in Supabase SQL Editor to create public.users and seed accounts.",
      );
    }

    process.exit(1);
  } finally {
    await closeDbPool();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  setupAuthDatabase();
}
