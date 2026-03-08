import "dotenv/config";
import {
  closeDbPool,
  getSeedAccountsFromEnv,
  syncAuthDatabase,
} from "../server/db.js";

async function setupAuthDatabase() {
  try {
    const seedAccounts = getSeedAccountsFromEnv();
    const result = await syncAuthDatabase({ seedAccounts });

    console.log("Auth database setup completed successfully.");
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

setupAuthDatabase();
