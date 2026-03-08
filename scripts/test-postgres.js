import "dotenv/config";
import postgres from "postgres";

const requiredVars = ["PGHOST", "PGPORT", "PGUSER", "PGPASSWORD", "PGDATABASE"];

const missingVars = requiredVars.filter((key) => !process.env[key]);

const connectionString =
  process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || "";

if (!connectionString && missingVars.length > 0) {
  console.error(
    `Missing required environment variables: ${missingVars.join(", ")}`,
  );
  process.exit(1);
}

async function testConnection() {
  const client = connectionString
    ? postgres(connectionString, {
        connect_timeout: 10,
        ssl:
          process.env.PGSSL === "false" ? false : { rejectUnauthorized: false },
      })
    : postgres(
        `postgresql://${encodeURIComponent(process.env.PGUSER)}:${encodeURIComponent(process.env.PGPASSWORD)}@${process.env.PGHOST}:${process.env.PGPORT}/${process.env.PGDATABASE}`,
        {
          connect_timeout: 10,
          ssl:
            process.env.PGSSL === "false"
              ? false
              : { rejectUnauthorized: false },
        },
      );

  try {
    const result = await client`SELECT 1 AS ok`;

    if (Array.isArray(result) && result[0]?.ok === 1) {
      console.log("PostgreSQL connection successful: SELECT 1 returned ok=1");
      process.exit(0);
    }

    console.error(
      "PostgreSQL connection opened, but test query did not return expected value.",
    );
    process.exit(1);
  } catch (error) {
    console.error("PostgreSQL connection failed.");
    console.error(error.message);
    process.exit(1);
  } finally {
    await client.end({ timeout: 5 }).catch(() => {});
  }
}

testConnection();
