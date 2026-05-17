import "dotenv/config";
import postgres from "postgres";

const requiredVars = ["PGHOST", "PGPORT", "PGUSER", "PGPASSWORD", "PGDATABASE"];

const missingVars = requiredVars.filter((key) => !process.env[key]);

const connectionString =
  process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || "";

function getConnectionMetadata(url) {
  if (!url) {
    return {
      isSupabasePooler: false,
      isTransactionPooler: false,
    };
  }

  try {
    const parsed = new URL(url);
    const hostname = String(parsed.hostname || "").trim().toLowerCase();
    const port = String(parsed.port || "").trim();
    const isSupabasePooler = hostname.endsWith(".pooler.supabase.com");

    return {
      isSupabasePooler,
      isTransactionPooler: isSupabasePooler && port === "6543",
    };
  } catch {
    return {
      isSupabasePooler: false,
      isTransactionPooler: false,
    };
  }
}

if (!connectionString && missingVars.length > 0) {
  console.error(
    `Missing required environment variables: ${missingVars.join(", ")}`,
  );
  process.exit(1);
}

async function testConnection() {
  const { isSupabasePooler, isTransactionPooler } =
    getConnectionMetadata(connectionString);
  const clientOptions = {
    max: 1,
    connect_timeout: 10,
    prepare: !(isSupabasePooler || isTransactionPooler),
    ssl:
      process.env.PGSSL === "false" ? false : { rejectUnauthorized: false },
  };

  const client = connectionString
    ? postgres(connectionString, clientOptions)
    : postgres(
        `postgresql://${encodeURIComponent(process.env.PGUSER)}:${encodeURIComponent(process.env.PGPASSWORD)}@${process.env.PGHOST}:${process.env.PGPORT}/${process.env.PGDATABASE}`,
        clientOptions,
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
