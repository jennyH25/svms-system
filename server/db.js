import postgres from "postgres";
import bcrypt from "bcryptjs";

const requiredVars = ["PGHOST", "PGPORT", "PGUSER", "PGPASSWORD", "PGDATABASE"];
const DEFAULT_DB_POOL_MAX = Number(process.env.DB_POOL_MAX || 12);
const isServerlessRuntime =
  process.env.VERCEL === "1" ||
  process.env.AWS_LAMBDA_FUNCTION_NAME ||
  process.env.NODE_ENV === "serverless";
const isEnvEnabled = (value) =>
  ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
const serverlessRuntimeDbSyncEnabled =
  !isServerlessRuntime || isEnvEnabled(process.env.SVMS_ENABLE_SERVERLESS_DB_SYNC);
const SAFE_APP_STATE_KEY_REGEX = /^[A-Za-z0-9:_-]{1,64}$/;
const ALLOWED_APP_STATE_TRIGGER_TABLES = new Set([
  '"Students"',
  '"SystemSettings"',
  "violations",
  "student_violation_logs",
  "student_violation_archives",
  "notifications",
  "audit_logs",
]);
const SAFE_SQL_IDENTIFIER_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;

function getConnectionUrl() {
  return process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || "";
}

function buildConnectionUrlFromParts() {
  if (!requiredVars.every((key) => Boolean(process.env[key]))) {
    return "";
  }

  return `postgresql://${encodeURIComponent(process.env.PGUSER)}:${encodeURIComponent(process.env.PGPASSWORD)}@${process.env.PGHOST}:${process.env.PGPORT}/${process.env.PGDATABASE}`;
}

function getConnectionString() {
  return getConnectionUrl() || buildConnectionUrlFromParts();
}

function getSqlOptions() {
  const useSsl = process.env.PGSSL !== "false";
  const rejectUnauthorized = isEnvEnabled(
    process.env.PGSSL_REJECT_UNAUTHORIZED,
  );

  return {
    max: DEFAULT_DB_POOL_MAX,
    connect_timeout: 30, // Increased from 10 to 30 seconds for more reliable connections
    idle_timeout: 30, // Reduced from 60 to 30 seconds to release connections faster
    max_lifetime: 60 * 60, // Reduced from 24 hours to 1 hour
    query_timeout: 60 * 1000, // Increased from 30s to 60s for sync operations
    ssl: useSsl ? { rejectUnauthorized } : undefined,
  };
}

const connectionString = getConnectionString();
const sql = connectionString
  ? postgres(connectionString, getSqlOptions())
  : null;

export default sql;

const AUTH_SCHEMA_VERSION = 5;
const AUTH_SCHEMA_STATE_KEY = "auth_schema_version";

async function ensureSchemaStateTable(dbPool) {
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS app_state (
      state_key VARCHAR(100) PRIMARY KEY,
      state_value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getSchemaStateValue(dbPool, stateKey) {
  const result = await dbPool.query(
    `SELECT state_value FROM app_state WHERE state_key = $1 LIMIT 1`,
    [stateKey],
  );

  return result.rows?.[0]?.state_value || null;
}

async function setSchemaStateValue(dbPool, stateKey, stateValue) {
  await dbPool.query(
    `
    INSERT INTO app_state (state_key, state_value)
    VALUES ($1, $2)
    ON CONFLICT (state_key) DO UPDATE SET
      state_value = EXCLUDED.state_value,
      updated_at = NOW()
    `,
    [stateKey, String(stateValue)],
  );
}

async function ensureAppStateSyncFunction(dbPool) {
  await dbPool.query(`
    CREATE OR REPLACE FUNCTION touch_app_state_keys()
    RETURNS TRIGGER AS $$
    DECLARE
      key_name TEXT;
      next_value TEXT;
    BEGIN
      FOREACH key_name IN ARRAY TG_ARGV LOOP
        next_value = ((EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT)::TEXT;

        INSERT INTO app_state (state_key, state_value, updated_at)
        VALUES (key_name, next_value, NOW())
        ON CONFLICT (state_key) DO UPDATE SET
          state_value = EXCLUDED.state_value,
          updated_at = NOW();
      END LOOP;

      RETURN COALESCE(NEW, OLD);
    END;
    $$ LANGUAGE plpgsql SET search_path = public
  `);
}

async function ensureAppStateTrigger(dbPool, { tableName, triggerName, keys }) {
  const safeKeys = Array.isArray(keys)
    ? keys.filter((value) => SAFE_APP_STATE_KEY_REGEX.test(String(value || "").trim()))
    : [];

  if (!tableName || !triggerName || safeKeys.length === 0) {
    return;
  }

  if (!ALLOWED_APP_STATE_TRIGGER_TABLES.has(tableName)) {
    throw new Error(`Unsafe app state trigger table name: ${tableName}`);
  }

  if (!SAFE_SQL_IDENTIFIER_REGEX.test(String(triggerName || ""))) {
    throw new Error(`Unsafe app state trigger name: ${triggerName}`);
  }

  const relationCheck = await dbPool.query(
    `SELECT to_regclass($1) AS relation_name`,
    [tableName],
  );

  if (!relationCheck.rows?.[0]?.relation_name) {
    return;
  }

  const triggerArgsSql = safeKeys
    .map((value) => `'${String(value).replace(/'/g, "''")}'`)
    .join(", ");

  await dbPool.query(`
    DROP TRIGGER IF EXISTS ${triggerName} ON ${tableName}
  `);

  await dbPool.query(`
    CREATE TRIGGER ${triggerName}
    AFTER INSERT OR UPDATE OR DELETE ON ${tableName}
    FOR EACH STATEMENT
    EXECUTE FUNCTION touch_app_state_keys(${triggerArgsSql})
  `);
}

export async function syncAppStateDatabase() {
  if (!hasDbConfig()) {
    throw new Error(
      `Missing required environment variables: ${getMissingDbVars().join(", ")}`,
    );
  }

  const dbPool = getDbPool();
  await ensureSchemaStateTable(dbPool);
  await ensureAppStateSyncFunction(dbPool);

  const revisionKeys = [
    "rev:students",
    "rev:violations",
    "rev:student_violation_logs",
    "rev:student_violation_archives",
    "rev:notifications",
    "rev:audit_logs",
    "rev:settings",
  ];

  await dbPool.query(
    `
    INSERT INTO app_state (state_key, state_value)
    SELECT key_name, '0'
    FROM UNNEST($1::text[]) AS key_name
    ON CONFLICT (state_key) DO NOTHING
    `,
    [revisionKeys],
  );

  await ensureAppStateTrigger(dbPool, {
    tableName: '"Students"',
    triggerName: "trg_app_state_students_revision",
    keys: ["rev:students"],
  });

  await ensureAppStateTrigger(dbPool, {
    tableName: "violations",
    triggerName: "trg_app_state_violations_revision",
    keys: ["rev:violations"],
  });

  await ensureAppStateTrigger(dbPool, {
    tableName: "student_violation_logs",
    triggerName: "trg_app_state_student_violation_logs_revision",
    keys: ["rev:student_violation_logs"],
  });

  await ensureAppStateTrigger(dbPool, {
    tableName: "student_violation_archives",
    triggerName: "trg_app_state_student_violation_archives_revision",
    keys: ["rev:student_violation_archives"],
  });

  await ensureAppStateTrigger(dbPool, {
    tableName: "notifications",
    triggerName: "trg_app_state_notifications_revision",
    keys: ["rev:notifications"],
  });

  await ensureAppStateTrigger(dbPool, {
    tableName: "audit_logs",
    triggerName: "trg_app_state_audit_logs_revision",
    keys: ["rev:audit_logs"],
  });

  await ensureAppStateTrigger(dbPool, {
    tableName: '"SystemSettings"',
    triggerName: "trg_app_state_settings_revision",
    keys: ["rev:settings"],
  });

  return { synced: true };
}

export async function getAppStateSnapshot(stateKeys = []) {
  if (!hasDbConfig()) {
    return [];
  }

  const dbPool = getDbPool();
  await ensureSchemaStateTable(dbPool);

  if (!Array.isArray(stateKeys) || stateKeys.length === 0) {
    const result = await dbPool.query(`
      SELECT state_key, state_value, updated_at
      FROM app_state
      ORDER BY state_key ASC
    `);

    return result.rows || [];
  }

  const normalizedKeys = Array.from(
    new Set(stateKeys.map((key) => String(key || "").trim()).filter(Boolean)),
  );

  if (normalizedKeys.length === 0) {
    return [];
  }

  const result = await dbPool.query(
    `
    SELECT state_key, state_value, updated_at
    FROM app_state
    WHERE state_key = ANY($1::text[])
    ORDER BY state_key ASC
    `,
    [normalizedKeys],
  );

  return result.rows || [];
}

export async function recordProjectActivityHeartbeat(source = "unknown") {
  if (!hasDbConfig()) {
    throw new Error(
      `Missing required environment variables: ${getMissingDbVars().join(", ")}`,
    );
  }

  const dbPool = getDbPool();
  await ensureSchemaStateTable(dbPool);

  const normalizedSource = String(source || "unknown").trim().slice(0, 64);
  const heartbeatPayload = JSON.stringify({
    source: normalizedSource || "unknown",
    at: new Date().toISOString(),
  });

  await setSchemaStateValue(
    dbPool,
    "system:last_project_activity_heartbeat",
    heartbeatPayload,
  );

  const result = await dbPool.query("SELECT 1 AS ok");
  return {
    ok: Array.isArray(result.rows) && result.rows[0]?.ok === 1,
    source: normalizedSource || "unknown",
  };
}

export async function isAuthSchemaCurrent() {
  if (!hasDbConfig()) {
    return false;
  }

  const dbPool = getDbPool();
  if (isServerlessRuntime && !serverlessRuntimeDbSyncEnabled) {
    const relationCheck = await dbPool.query(
      `SELECT to_regclass('public.app_state') AS relation_name`,
    );
    if (!relationCheck.rows?.[0]?.relation_name) {
      return false;
    }
  } else {
    await ensureSchemaStateTable(dbPool);
  }

  const cachedSchemaVersion = await getSchemaStateValue(
    dbPool,
    AUTH_SCHEMA_STATE_KEY,
  );

  return Number(cachedSchemaVersion) === AUTH_SCHEMA_VERSION;
}

async function syncAuthSeedAccounts(dbPool, seedAccounts) {
  // Remove old dummy users from legacy prototype login.
  await dbPool.query(
    `
    DELETE FROM users
    WHERE username IN ($1, $2)
    `,
    ["admin", "student"],
  );

  for (const account of seedAccounts) {
    const defaultFirst =
      account.role === "student"
        ? "Student"
        : account.role === "super_admin"
          ? "Super"
          : "Admin";
    const defaultLast = "User";
    const fullName = `${defaultFirst} ${defaultLast}`;

    const existingUserResult = await dbPool.query(
      `
      SELECT id, role
      FROM users
      WHERE username = $1
      LIMIT 1
      `,
      [account.username],
    );

    let seededUser = existingUserResult.rows?.[0] || null;

    if (!seededUser) {
      const passwordHash = await bcrypt.hash(account.password, 12);
      const userInsertResult = await dbPool.query(
        `
        INSERT INTO users (username, password_hash, role, first_name, last_name)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, username, role
        `,
        [
          account.username,
          passwordHash,
          account.role,
          defaultFirst,
          defaultLast,
        ],
      );
      seededUser = userInsertResult.rows?.[0] || null;
    } else if (seededUser.role !== account.role) {
      const roleUpdateResult = await dbPool.query(
        `
        UPDATE users
        SET role = $2, is_active = TRUE
        WHERE id = $1
        RETURNING id, username, role
        `,
        [seededUser.id, account.role],
      );
      seededUser = roleUpdateResult.rows?.[0] || seededUser;
    }

    if (
      (account.role === "admin" || account.role === "super_admin") &&
      seededUser
    ) {
      await dbPool.query(
        `
        INSERT INTO "Admins" (user_id, email, first_name, last_name, full_name)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (user_id) DO UPDATE SET
          email = EXCLUDED.email,
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          full_name = EXCLUDED.full_name
        `,
        [seededUser.id, account.email, defaultFirst, defaultLast, fullName],
      );
    }
  }

  // ensure that every user with an admin-like role has an Admins row
  await dbPool.query(`
    INSERT INTO "Admins" (user_id, email, first_name, last_name, full_name)
    SELECT
      u.id,
      COALESCE(NULLIF(u.username, ''), u.id::text) || '@svms.local',
      COALESCE(NULLIF(u.first_name, ''), 'Admin'),
      COALESCE(NULLIF(u.last_name, ''), ''),
      TRIM(COALESCE(NULLIF(CONCAT_WS(' ', u.first_name, u.last_name), ''), u.username, 'Admin'))
    FROM users u
    WHERE u.role IN ('admin', 'super_admin')
      AND NOT EXISTS (
        SELECT 1 FROM "Admins" a WHERE a.user_id = u.id
      )
  `);
}

function getSeedUserFromEnv(prefix, role) {
  const email = process.env[`${prefix}_EMAIL`];
  const username = process.env[`${prefix}_USERNAME`];
  const password = process.env[`${prefix}_PASSWORD`];

  if (!email && !username && !password) {
    return null;
  }

  if (!email || !username || !password) {
    throw new Error(
      `Incomplete seed variables for ${prefix}. Required: ${prefix}_EMAIL, ${prefix}_USERNAME, ${prefix}_PASSWORD`,
    );
  }

  return {
    email,
    username,
    password,
    role,
  };
}

export function getSeedAccountsFromEnv() {
  const admin = getSeedUserFromEnv("AUTH_ADMIN", "admin");
  const superAdmin = getSeedUserFromEnv("AUTH_SUPER_ADMIN", "super_admin");
  const student = getSeedUserFromEnv("AUTH_STUDENT", "student");

  return [admin, superAdmin, student].filter(Boolean);
}

export function hasDbConfig() {
  if (getConnectionString()) {
    return true;
  }

  return requiredVars.every((key) => Boolean(process.env[key]));
}

export function getMissingDbVars() {
  if (getConnectionString()) {
    return [];
  }

  return requiredVars.filter((key) => !process.env[key]);
}

let queryClient;

export function getDbPool() {
  if (!hasDbConfig()) {
    return null;
  }

  if (!queryClient) {
    queryClient = {
      async query(text, params = []) {
        if (!sql) {
          throw new Error("Database connection string is not configured.");
        }

        const rows =
          params.length > 0
            ? await sql.unsafe(text, params)
            : await sql.unsafe(text);

        return { rows: Array.isArray(rows) ? rows : [] };
      },
    };
  }

  return queryClient;
}

export async function closeDbPool() {
  if (sql) {
    await sql.end({ timeout: 5 });
  }

  queryClient = null;
}

export async function syncAuthDatabase(options = {}) {
  const { seedAccounts = [], skipSchemaCheck = false } = options;

  if (!hasDbConfig()) {
    throw new Error(
      `Missing required environment variables: ${getMissingDbVars().join(", ")}`,
    );
  }

  const dbPool = getDbPool();

  if (skipSchemaCheck) {
    await syncAuthSeedAccounts(dbPool, seedAccounts);
    return {
      synced: true,
      accounts: seedAccounts.map(({ email, username, role }) => ({
        email,
        username,
        role,
      })),
    };
  }

  await ensureSchemaStateTable(dbPool);

  const cachedSchemaVersion = await getSchemaStateValue(
    dbPool,
    AUTH_SCHEMA_STATE_KEY,
  );

  if (Number(cachedSchemaVersion) === AUTH_SCHEMA_VERSION) {
    await syncAuthSeedAccounts(dbPool, seedAccounts);
    return {
      synced: true,
      accounts: seedAccounts.map(({ email, username, role }) => ({
        email,
        username,
        role,
      })),
    };
  }

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      username VARCHAR(100) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'super_admin', 'student')),
      first_name VARCHAR(100),
      last_name VARCHAR(100),
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Backfill columns for older databases created before name fields existed.
  await dbPool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS first_name VARCHAR(100)
  `);

  await dbPool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS last_name VARCHAR(100)
  `);

  await dbPool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS requires_account_setup BOOLEAN NOT NULL DEFAULT FALSE
  `);

  await dbPool.query(`
    ALTER TABLE users
    DROP CONSTRAINT IF EXISTS users_role_check
  `);

  await dbPool.query(`
    ALTER TABLE users
    ADD CONSTRAINT users_role_check
    CHECK (role IN ('admin', 'super_admin', 'student'))
  `);

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS "Admins" (
      id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      user_id BIGINT NOT NULL,
      email VARCHAR(255) NOT NULL,
      first_name VARCHAR(100) NOT NULL,
      middle_initial VARCHAR(5),
      last_name VARCHAR(100) NOT NULL,
      full_name VARCHAR(255) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT admins_user_id_unique UNIQUE (user_id),
      CONSTRAINT admins_email_unique UNIQUE (email)
    )
  `);

  await dbPool.query(`
    ALTER TABLE "Admins"
    ADD COLUMN IF NOT EXISTS user_id BIGINT
  `);

  await dbPool.query(`
    ALTER TABLE "Admins"
    ADD COLUMN IF NOT EXISTS email VARCHAR(255)
  `);

  await dbPool.query(`
    ALTER TABLE "Admins"
    ADD COLUMN IF NOT EXISTS first_name VARCHAR(100)
  `);

  await dbPool.query(`
    ALTER TABLE "Admins"
    ADD COLUMN IF NOT EXISTS middle_initial VARCHAR(5)
  `);

  await dbPool.query(`
    ALTER TABLE "Admins"
    ADD COLUMN IF NOT EXISTS last_name VARCHAR(100)
  `);

  await dbPool.query(`
    ALTER TABLE "Admins"
    ADD COLUMN IF NOT EXISTS full_name VARCHAR(255)
  `);

  await dbPool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS admins_user_id_unique_idx
    ON "Admins" (user_id)
  `);

  await dbPool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS admins_email_unique_idx
    ON "Admins" (email)
  `);

  await dbPool.query(`
    CREATE OR REPLACE FUNCTION set_admins_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql SET search_path = public
  `);

  await dbPool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'trg_admins_updated_at'
          AND tgrelid = '"Admins"'::regclass
      ) THEN
        CREATE TRIGGER trg_admins_updated_at
        BEFORE UPDATE ON "Admins"
        FOR EACH ROW
        EXECUTE FUNCTION set_admins_updated_at();
      END IF;
    END;
    $$;
  `);

  // Keep updated_at behavior equivalent to automatic timestamp refresh on updates.
  await dbPool.query(`
    CREATE OR REPLACE FUNCTION set_users_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql SET search_path = public
  `);

  await dbPool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'trg_users_updated_at'
          AND tgrelid = 'users'::regclass
      ) THEN
        CREATE TRIGGER trg_users_updated_at
        BEFORE UPDATE ON users
        FOR EACH ROW
        EXECUTE FUNCTION set_users_updated_at();
      END IF;
    END;
    $$;
  `);

  // Best-effort migration path: if legacy users.email exists, copy admin emails before dropping.
  await dbPool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = 'email'
      ) THEN
        EXECUTE '
          INSERT INTO "Admins" (user_id, email, first_name, last_name, full_name)
          SELECT
            u.id,
            COALESCE(NULLIF(u.email, ''''), u.username || ''@svms.local''),
            COALESCE(NULLIF(u.first_name, ''''), ''Admin''),
            COALESCE(NULLIF(u.last_name, ''''), ''''),
            TRIM(COALESCE(NULLIF(CONCAT_WS('' '', u.first_name, u.last_name), ''''), u.username, ''Admin''))
          FROM users u
          WHERE u.role IN (''admin'', ''super_admin'')
        ';

        EXECUTE 'ALTER TABLE users DROP COLUMN IF EXISTS email';
      END IF;
    END;
    $$;
  `);

  await syncAuthSeedAccounts(dbPool, seedAccounts);

  await setSchemaStateValue(dbPool, AUTH_SCHEMA_STATE_KEY, AUTH_SCHEMA_VERSION);

  return {
    synced: true,
    accounts: seedAccounts.map(({ email, username, role }) => ({
      email,
      username,
      role,
    })),
  };
}

export async function syncStudentsDatabase() {
  if (!hasDbConfig()) {
    throw new Error(
      `Missing required environment variables: ${getMissingDbVars().join(", ")}`,
    );
  }

  const dbPool = getDbPool();

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS "Students" (
      id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      user_id BIGINT UNIQUE,
      email VARCHAR(255) NOT NULL UNIQUE,
      school_id VARCHAR(50) NOT NULL UNIQUE,
      first_name VARCHAR(100) NOT NULL,
      middle_initial VARCHAR(5),
      last_name VARCHAR(100) NOT NULL,
      full_name VARCHAR(255) NOT NULL,
      program VARCHAR(50) NOT NULL,
      year_section VARCHAR(20) NOT NULL,
      status VARCHAR(20) NOT NULL CHECK (status IN ('Regular', 'Irregular', 'Graduated', 'Imported')),
      violation_count INTEGER NOT NULL DEFAULT 0,
      is_archived BOOLEAN NOT NULL DEFAULT FALSE,
      archived_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await dbPool.query(`
    ALTER TABLE "Students"
    ADD COLUMN IF NOT EXISTS user_id BIGINT UNIQUE
  `);

  await dbPool.query(`
    ALTER TABLE "Students"
    ADD COLUMN IF NOT EXISTS email VARCHAR(255)
  `);

  await dbPool.query(`
    ALTER TABLE "Students"
    ADD COLUMN IF NOT EXISTS school_id VARCHAR(50)
  `);

  await dbPool.query(`
    ALTER TABLE "Students"
    ADD COLUMN IF NOT EXISTS middle_initial VARCHAR(5)
  `);

  await dbPool.query(`
    ALTER TABLE "Students"
    ALTER COLUMN school_id DROP NOT NULL
  `);

  await dbPool.query(`
    ALTER TABLE "Students"
    ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE
  `);

  await dbPool.query(`
    ALTER TABLE "Students"
    ADD COLUMN IF NOT EXISTS archived_reason VARCHAR(100)
  `);

  await dbPool.query(`
    ALTER TABLE "Students"
    ADD COLUMN IF NOT EXISTS is_unresolved_archive BOOLEAN NOT NULL DEFAULT FALSE
  `);

  await dbPool.query(`
    ALTER TABLE "Students"
    ADD COLUMN IF NOT EXISTS original_status VARCHAR(20)
  `);

  await dbPool.query(`
    ALTER TABLE "Students"
    ADD COLUMN IF NOT EXISTS current_semester VARCHAR(20) DEFAULT '1ST SEM'
  `);

  await dbPool.query(`
    ALTER TABLE "Students"
    ADD COLUMN IF NOT EXISTS current_school_year VARCHAR(20) DEFAULT '2025-2026'
  `);

  await dbPool.query(`
    ALTER TABLE "Students"
    ADD COLUMN IF NOT EXISTS last_promoted_school_year VARCHAR(20)
  `);

  await dbPool.query(`
    UPDATE "Students"
    SET email = COALESCE(NULLIF(email, ''), school_id || '@plpasig.edu.ph')
    WHERE email IS NULL OR email = ''
  `);

  await dbPool.query(`
    ALTER TABLE "Students"
    ALTER COLUMN email SET NOT NULL
  `);

  await dbPool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS students_email_unique_idx
    ON "Students" (email)
  `);

  await dbPool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS students_school_id_unique_idx
    ON "Students" (school_id)
  `);

  await dbPool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'students_user_id_fk'
          AND conrelid = '"Students"'::regclass
      ) THEN
        ALTER TABLE "Students"
        ADD CONSTRAINT students_user_id_fk
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE;
      END IF;
    END;
    $$;
  `);

  // Drop the old CHECK constraint and add the updated one including 'Imported'.
  await dbPool.query(`
    ALTER TABLE "Students"
    DROP CONSTRAINT IF EXISTS "Students_status_check"
  `);

  await dbPool.query(`
    ALTER TABLE "Students"
    ADD CONSTRAINT "Students_status_check" CHECK (status IN ('Regular', 'Irregular', 'Graduated', 'Imported'))
  `);

  // Historical workbook imports were previously stored as Graduated.
  // Normalize them to Imported so DB status matches system labeling.
  await dbPool.query(`
    UPDATE "Students"
    SET status = 'Imported'
    WHERE status = 'Graduated'
      AND (
        UPPER(COALESCE(archived_reason, '')) = 'IMPORTED'
        OR UPPER(COALESCE(original_status, '')) = 'HISTORICAL'
      )
  `);

  await dbPool.query(`
    CREATE OR REPLACE FUNCTION set_students_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql SET search_path = public
  `);

  await dbPool.query(`
    DROP TRIGGER IF EXISTS trg_students_updated_at ON "Students"
  `);

  await dbPool.query(`
    CREATE TRIGGER trg_students_updated_at
    BEFORE UPDATE ON "Students"
    FOR EACH ROW
    EXECUTE FUNCTION set_students_updated_at()
  `);

  await dbPool.query(`
    CREATE OR REPLACE FUNCTION delete_linked_student_user()
    RETURNS TRIGGER AS $$
    BEGIN
      IF OLD.user_id IS NOT NULL THEN
        DELETE FROM users
        WHERE id = OLD.user_id
          AND role = 'student';
      END IF;

      RETURN OLD;
    END;
    $$ LANGUAGE plpgsql SET search_path = public
  `);

  await dbPool.query(`
    DROP TRIGGER IF EXISTS trg_students_delete_linked_user ON "Students"
  `);

  await dbPool.query(`
    CREATE TRIGGER trg_students_delete_linked_user
    AFTER DELETE ON "Students"
    FOR EACH ROW
    EXECUTE FUNCTION delete_linked_student_user()
  `);

  await dbPool.query(`
    DELETE FROM users u
    WHERE u.role = 'student'
      AND NOT EXISTS (
        SELECT 1
        FROM "Students" s
        WHERE s.user_id = u.id
      )
  `);

  return { synced: true };
}

export async function syncStudentsFromUsers() {
  if (!hasDbConfig()) {
    throw new Error(
      `Missing required environment variables: ${getMissingDbVars().join(", ")}`,
    );
  }

  const dbPool = getDbPool();

  await dbPool.query(`
    INSERT INTO "Students" (
      user_id,
      email,
      school_id,
      first_name,
      last_name,
      full_name,
      program,
      year_section,
      status,
      violation_count
    )
    SELECT
      u.id,
      COALESCE(NULLIF(u.username, ''), 'student_' || u.id::text) || '@plpasig.edu.ph',
      COALESCE(NULLIF(u.username, ''), 'USR-' || u.id::text),
      COALESCE(NULLIF(u.first_name, ''), 'Student'),
      COALESCE(NULLIF(u.last_name, ''), ''),
      TRIM(
        COALESCE(
          NULLIF(CONCAT_WS(' ', u.first_name, u.last_name), ''),
          u.username,
          'Student'
        )
      ),
      'BSIT',
      '1A',
      'Regular',
      0
    FROM users u
    LEFT JOIN "Students" s ON s.user_id = u.id
    WHERE u.role = 'student' AND u.is_active = TRUE AND s.id IS NULL
    ON CONFLICT (school_id) DO UPDATE
    SET user_id = COALESCE("Students".user_id, EXCLUDED.user_id)
  `);

  return { synced: true };
}

export async function syncSystemSettingsDatabase() {
  if (!hasDbConfig()) {
    throw new Error(
      `Missing required environment variables: ${getMissingDbVars().join(", ")}`,
    );
  }

  const dbPool = getDbPool();

  // the legacy snake_case table is not used by the server.  drop it
  // automatically so your Supabase dashboard stays clean.  the app
  // continues to use the quoted "SystemSettings" table.
  await dbPool.query(`
    DROP TABLE IF EXISTS system_settings
  `);

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS "SystemSettings" (
      id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      setting_key VARCHAR(100) NOT NULL UNIQUE,
      display_name VARCHAR(255),
      logo_path TEXT,
      theme VARCHAR(50) DEFAULT 'dark',
      theme_color VARCHAR(7),
      current_semester VARCHAR(20) DEFAULT '1ST SEM',
      current_school_year VARCHAR(20) DEFAULT '2025-2026',
      offenses_handbook_title VARCHAR(255) DEFAULT 'PLP Student Handbook 2025',
      offenses_handbook_url TEXT DEFAULT 'https://online.fliphtml5.com/befok/lfwi/',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Add new columns if they don't exist
  await dbPool.query(`
    ALTER TABLE "SystemSettings"
    ADD COLUMN IF NOT EXISTS current_semester VARCHAR(20) DEFAULT '1ST SEM'
  `);

  await dbPool.query(`
    ALTER TABLE "SystemSettings"
    ADD COLUMN IF NOT EXISTS current_school_year VARCHAR(20) DEFAULT '2025-2026'
  `);

  await dbPool.query(`
    ALTER TABLE "SystemSettings"
    ADD COLUMN IF NOT EXISTS offenses_handbook_title VARCHAR(255) DEFAULT 'PLP Student Handbook 2025'
  `);

  await dbPool.query(`
    ALTER TABLE "SystemSettings"
    ADD COLUMN IF NOT EXISTS offenses_handbook_url TEXT DEFAULT 'https://online.fliphtml5.com/befok/lfwi/'
  `);

  await dbPool.query(`
    CREATE OR REPLACE FUNCTION set_system_settings_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql SET search_path = public
  `);

  await dbPool.query(`
    DROP TRIGGER IF EXISTS trg_system_settings_updated_at ON "SystemSettings"
  `);

  await dbPool.query(`
    CREATE TRIGGER trg_system_settings_updated_at
    BEFORE UPDATE ON "SystemSettings"
    FOR EACH ROW
    EXECUTE FUNCTION set_system_settings_updated_at()
  `);

  // Insert default settings if they don't exist
  await dbPool.query(`
    INSERT INTO "SystemSettings" (setting_key, display_name, theme)
    VALUES ('system_config', 'Student Violation Management System', 'dark')
    ON CONFLICT (setting_key) DO NOTHING
  `);

  return { synced: true };
}

export async function syncViolationsDatabase(skipSeeding = false) {
  if (!hasDbConfig()) {
    throw new Error(
      `Missing required environment variables: ${getMissingDbVars().join(", ")}`,
    );
  }

  const dbPool = getDbPool();

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS violations (
      id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      category VARCHAR(50) NOT NULL,
      degree VARCHAR(50) NOT NULL,
      name VARCHAR(255) NOT NULL,
      parent_id BIGINT REFERENCES violations(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (category, degree, name)
    )
  `);

  await dbPool.query(`
    CREATE OR REPLACE FUNCTION set_violations_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql SET search_path = public
  `);

  await dbPool.query(`
    DROP TRIGGER IF EXISTS trg_violations_updated_at ON violations
  `);

  await dbPool.query(`
    CREATE TRIGGER trg_violations_updated_at
    BEFORE UPDATE ON violations
    FOR EACH ROW
    EXECUTE FUNCTION set_violations_updated_at()
  `);

  // Skip seeding if already populated or explicitly skipped (dev optimization)
  if (skipSeeding) {
    return { synced: true };
  }

  const countResult = await dbPool.query(
    `SELECT COUNT(*) as count FROM violations`
  );
  const violationCount = parseInt(countResult.rows?.[0]?.count || "0", 10);
  if (violationCount > 0) {
    return { synced: true, skipped: true };
  }

  // Seed violations data
  const violationsData = [
    // Minor Offenses - First Degree
    {
      category: "Minor Offenses",
      degree: "First Degree",
      name: "Loitering",
      children: [],
    },
    {
      category: "Minor Offenses",
      degree: "First Degree",
      name: "Littering",
      children: [],
    },
    {
      category: "Minor Offenses",
      degree: "First Degree",
      name: "Classroom Disturbance",
      children: [],
    },
    {
      category: "Minor Offenses",
      degree: "First Degree",
      name: "Eating/Drinking in Academic Facilities",
      children: [],
    },
    {
      category: "Minor Offenses",
      degree: "First Degree",
      name: "Improper disposal of waste/littering",
      children: [],
    },
    {
      category: "Minor Offenses",
      degree: "First Degree",
      name: "Not wearing a school ID",
      children: [],
    },
    {
      category: "Minor Offenses",
      degree: "First Degree",
      name: "Unauthorized use of school property",
      children: [],
    },
    {
      category: "Minor Offenses",
      degree: "First Degree",
      name: "Inappropriate Attire",
      children: [
        "Shorts, skirts, or dresses that are above mid-thigh or excessively short",
        "Low-rise, tattered, or ripped jeans",
        "Lounge wear, pajamas, leggings worn as outwear",
        "Sleeveless tops, tube tops, plunging necklines, or low-cut shirts",
        "Midriff-exposing tops or see-through garments",
        "Shirts or blouses that promote alcohol, tobacco, hatred, drugs, any illegal act, or offensive content",
        "Unnaturally bright or extreme hair colors",
        "Wearing multiple or oversized accessories",
        "Slippers, flip-flops",
        "Slip-on clogs with open backs, excessive holes",
        "Open-toe and strappy sandals",
        "Step-ins or slip-on shoes without heel supports",
      ],
    },
    {
      category: "Minor Offenses",
      degree: "First Degree",
      name: "Sitting on the stairs",
      children: [],
    },

    // Minor Offenses - Second Degree
    {
      category: "Minor Offenses",
      degree: "Second Degree",
      name: "Courting/Coupling",
      children: ["PDA", "Holding or Touching"],
    },
    {
      category: "Minor Offenses",
      degree: "Second Degree",
      name: "Rough games / Quarreling / Boisterous behavior",
      children: [],
    },
    {
      category: "Minor Offenses",
      degree: "Second Degree",
      name: "Use of Vulgar Expressions",
      children: [],
    },
    {
      category: "Minor Offenses",
      degree: "Second Degree",
      name: "Unauthorized use of gadgets within class hours",
      children: [],
    },
    {
      category: "Minor Offenses",
      degree: "Second Degree",
      name: "Cutting classes",
      children: [],
    },

    // Major Offenses - Third Degree
    {
      category: "Major Offenses",
      degree: "Third Degree",
      name: "Lending or using somebody else's ID",
      children: [],
    },
    {
      category: "Major Offenses",
      degree: "Third Degree",
      name: "Insubordination",
      children: [],
    },
    {
      category: "Major Offenses",
      degree: "Third Degree",
      name: "Vandalism",
      children: [],
    },
    {
      category: "Major Offenses",
      degree: "Third Degree",
      name: "Pornographic Materials / Obscenity",
      children: [],
    },
    {
      category: "Major Offenses",
      degree: "Third Degree",
      name: "Disrespect to Authority",
      children: [],
    },
    {
      category: "Major Offenses",
      degree: "Third Degree",
      name: "Unauthorized Use of School Name/Representation",
      children: [],
    },
    {
      category: "Major Offenses",
      degree: "Third Degree",
      name: "Cat calling / name calling",
      children: [],
    },

    // Major Offenses - Fourth Degree
    {
      category: "Major Offenses",
      degree: "Fourth Degree",
      name: "Cheating",
      children: [],
    },
    {
      category: "Major Offenses",
      degree: "Fourth Degree",
      name: "Stealing",
      children: [],
    },

    // Major Offenses - Fifth Degree
    {
      category: "Major Offenses",
      degree: "Fifth Degree",
      name: "Possession or Passing of Fireworks",
      children: [],
    },
    {
      category: "Major Offenses",
      degree: "Fifth Degree",
      name: "Improper behavior",
      children: [
        "Bribery",
        "Theft",
        "Extortion",
        "Acts of Violence",
        "Falsification",
        "Deceitful acts",
        "Slander",
        "Gambling",
      ],
    },
    {
      category: "Major Offenses",
      degree: "Fifth Degree",
      name: "Violence",
      children: [
        "Fist fighting",
        "Physical injury",
        "Choking",
        "Threatening",
        "Intimidating others",
      ],
    },
    {
      category: "Major Offenses",
      degree: "Fifth Degree",
      name: "Bullying",
      children: ["Written or Action"],
    },
    {
      category: "Major Offenses",
      degree: "Fifth Degree",
      name: "Possession or Passing of Deadly Weapons",
      children: [],
    },
    {
      category: "Major Offenses",
      degree: "Fifth Degree",
      name: "Alcohol",
      children: ["Bringing or drinking alcoholic beverages"],
    },
    {
      category: "Major Offenses",
      degree: "Fifth Degree",
      name: "Coming to school intoxicated or under the influence of alcohol",
      children: [],
    },
    {
      category: "Major Offenses",
      degree: "Fifth Degree",
      name: "Smoking or Vaping",
      children: [],
    },

    // Major Offenses - Sixth Degree
    {
      category: "Major Offenses",
      degree: "Sixth Degree",
      name: "Any act of dishonesty",
      children: [],
    },
    {
      category: "Major Offenses",
      degree: "Sixth Degree",
      name: "Defamation",
      children: [],
    },
    {
      category: "Major Offenses",
      degree: "Sixth Degree",
      name: "Immoralities",
      children: [],
    },
    {
      category: "Major Offenses",
      degree: "Sixth Degree",
      name: "Sexual Harassment",
      children: [],
    },
    {
      category: "Major Offenses",
      degree: "Sixth Degree",
      name: "Malicious acts",
      children: [],
    },

    // Major Offenses - Seventh Degree
    {
      category: "Major Offenses",
      degree: "Seventh Degree",
      name: "Unrecognized Organizations",
      children: [],
    },
    {
      category: "Major Offenses",
      degree: "Seventh Degree",
      name: "Drug Possession/Distribution",
      children: [],
    },
    {
      category: "Major Offenses",
      degree: "Seventh Degree",
      name: "Acts of Harm",
      children: [],
    },
    {
      category: "Major Offenses",
      degree: "Seventh Degree",
      name: "Explosives",
      children: [],
    },
    {
      category: "Major Offenses",
      degree: "Seventh Degree",
      name: "Unauthorized Strikes",
      children: [],
    },
    {
      category: "Major Offenses",
      degree: "Seventh Degree",
      name: "Dishonor to PLP",
      children: [],
    },
    {
      category: "Major Offenses",
      degree: "Seventh Degree",
      name: "Public Misconduct",
      children: [],
    },
    {
      category: "Major Offenses",
      degree: "Seventh Degree",
      name: "Defamatory/Obscene Content",
      children: [],
    },
    {
      category: "Major Offenses",
      degree: "Seventh Degree",
      name: "Vandalism",
      children: [],
    },
    {
      category: "Major Offenses",
      degree: "Seventh Degree",
      name: "Unauthorized Representation",
      children: [],
    },
    {
      category: "Major Offenses",
      degree: "Seventh Degree",
      name: "Unauthorized Media Statements",
      children: [],
    },
    {
      category: "Major Offenses",
      degree: "Seventh Degree",
      name: "Event Disruption",
      children: [],
    },
  ];

  for (const violation of violationsData) {
    // Insert parent violation
    const parentResult = await dbPool.query(
      `
      INSERT INTO violations (category, degree, name, parent_id)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (category, degree, name) DO NOTHING
      RETURNING id
    `,
      [violation.category, violation.degree, violation.name, null],
    );

    let parentId = null;
    if (parentResult.rows.length > 0) {
      parentId = parentResult.rows[0].id;
    } else {
      // Get existing parent ID
      const existingResult = await dbPool.query(
        `
        SELECT id FROM violations WHERE category = $1 AND degree = $2 AND name = $3 AND parent_id IS NULL
      `,
        [violation.category, violation.degree, violation.name],
      );
      if (existingResult.rows.length > 0) {
        parentId = existingResult.rows[0].id;
      }
    }

    // Insert child violations
    if (parentId && violation.children.length > 0) {
      for (const childName of violation.children) {
        await dbPool.query(
          `
          INSERT INTO violations (category, degree, name, parent_id)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (category, degree, name) DO NOTHING
        `,
          [violation.category, violation.degree, childName, parentId],
        );
      }
    }
  }

  return { synced: true };
}

export async function syncNotificationsDatabase() {
  if (!hasDbConfig()) {
    throw new Error(
      `Missing required environment variables: ${getMissingDbVars().join(", ")}`,
    );
  }

  const dbPool = getDbPool();

  // notifications are linked to users.id (only students will receive them)
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      student_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      metadata JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      read_at TIMESTAMPTZ
    )
  `);

  // Primary list query: notifications for a student ordered by newest first.
  await dbPool.query(`
    CREATE INDEX IF NOT EXISTS notifications_student_user_id_idx
    ON notifications (student_user_id, created_at DESC)
  `);

  // Unread-specific operations: unread count + mark-read updates.
  await dbPool.query(`
    CREATE INDEX IF NOT EXISTS notifications_student_unread_idx
    ON notifications (student_user_id, created_at DESC)
    WHERE read_at IS NULL
  `);

  // Keep metadata compact for new/updated rows.
  await dbPool.query(`
    CREATE OR REPLACE FUNCTION normalize_jsonb_metadata()
    RETURNS TRIGGER AS $$
    BEGIN
      IF NEW.metadata IS NOT NULL THEN
        NEW.metadata = jsonb_strip_nulls(NEW.metadata);
        IF NEW.metadata = '{}'::jsonb THEN
          NEW.metadata = NULL;
        END IF;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql SET search_path = public
  `);

  await dbPool.query(`
    DROP TRIGGER IF EXISTS trg_notifications_normalize_metadata ON notifications
  `);

  await dbPool.query(`
    CREATE TRIGGER trg_notifications_normalize_metadata
    BEFORE INSERT OR UPDATE ON notifications
    FOR EACH ROW
    EXECUTE FUNCTION normalize_jsonb_metadata()
  `);

  return { synced: true };
}

export async function syncPasswordResetDatabase() {
  if (!hasDbConfig()) {
    throw new Error(
      `Missing required environment variables: ${getMissingDbVars().join(", ")}`,
    );
  }

  const dbPool = getDbPool();

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS password_reset_sessions (
      email VARCHAR(255) PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      code_hash VARCHAR(128) NOT NULL,
      verified BOOLEAN NOT NULL DEFAULT FALSE,
      reset_token_hash VARCHAR(128),
      expires_at TIMESTAMPTZ NOT NULL,
      resend_available_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await dbPool.query(`
    CREATE INDEX IF NOT EXISTS password_reset_sessions_expires_at_idx
    ON password_reset_sessions (expires_at)
  `);

  await dbPool.query(`
    CREATE OR REPLACE FUNCTION set_password_reset_sessions_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql SET search_path = public
  `);

  await dbPool.query(`
    DROP TRIGGER IF EXISTS trg_password_reset_sessions_updated_at ON password_reset_sessions
  `);

  await dbPool.query(`
    CREATE TRIGGER trg_password_reset_sessions_updated_at
    BEFORE UPDATE ON password_reset_sessions
    FOR EACH ROW
    EXECUTE FUNCTION set_password_reset_sessions_updated_at()
  `);

  return { synced: true };
}

export async function syncSuperAdminSecurityDatabase() {
  if (!hasDbConfig()) {
    throw new Error(
      `Missing required environment variables: ${getMissingDbVars().join(", ")}`,
    );
  }

  const dbPool = getDbPool();

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS super_admin_login_challenges (
      challenge_id VARCHAR(128) PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      email VARCHAR(255) NOT NULL,
      code_hash VARCHAR(128) NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      resend_available_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await dbPool.query(`
    CREATE INDEX IF NOT EXISTS super_admin_login_challenges_user_id_idx
    ON super_admin_login_challenges (user_id, expires_at DESC)
  `);

  await dbPool.query(`
    CREATE INDEX IF NOT EXISTS super_admin_login_challenges_expires_at_idx
    ON super_admin_login_challenges (expires_at)
  `);

  await dbPool.query(`
    ALTER TABLE super_admin_login_challenges ENABLE ROW LEVEL SECURITY
  `);

  await dbPool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'super_admin_login_challenges'
          AND policyname = 'super_admin_login_challenges_service_role_all'
      ) THEN
        CREATE POLICY super_admin_login_challenges_service_role_all
        ON super_admin_login_challenges
        FOR ALL
        TO service_role
        USING (true)
        WITH CHECK (true);
      END IF;
    END;
    $$;
  `);

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS super_admin_trusted_devices (
      device_token_hash VARCHAR(128) PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      label VARCHAR(255),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL
    )
  `);

  await dbPool.query(`
    CREATE INDEX IF NOT EXISTS super_admin_trusted_devices_user_id_idx
    ON super_admin_trusted_devices (user_id, expires_at DESC)
  `);

  await dbPool.query(`
    CREATE INDEX IF NOT EXISTS super_admin_trusted_devices_expires_at_idx
    ON super_admin_trusted_devices (expires_at)
  `);

  await dbPool.query(`
    ALTER TABLE super_admin_trusted_devices ENABLE ROW LEVEL SECURITY
  `);

  await dbPool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'super_admin_trusted_devices'
          AND policyname = 'super_admin_trusted_devices_service_role_all'
      ) THEN
        CREATE POLICY super_admin_trusted_devices_service_role_all
        ON super_admin_trusted_devices
        FOR ALL
        TO service_role
        USING (true)
        WITH CHECK (true);
      END IF;
    END;
    $$;
  `);

  await dbPool.query(`
    CREATE OR REPLACE FUNCTION set_super_admin_login_challenges_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql SET search_path = public
  `);

  await dbPool.query(`
    DROP TRIGGER IF EXISTS trg_super_admin_login_challenges_updated_at
    ON super_admin_login_challenges
  `);

  await dbPool.query(`
    CREATE TRIGGER trg_super_admin_login_challenges_updated_at
    BEFORE UPDATE ON super_admin_login_challenges
    FOR EACH ROW
    EXECUTE FUNCTION set_super_admin_login_challenges_updated_at()
  `);

  return { synced: true };
}

export async function syncStudentViolationLogsDatabase() {
  if (!hasDbConfig()) {
    throw new Error(
      `Missing required environment variables: ${getMissingDbVars().join(", ")}`,
    );
  }

  const dbPool = getDbPool();

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS student_violation_logs (
      id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      student_id BIGINT NOT NULL REFERENCES "Students"(id) ON DELETE CASCADE,
      violation_catalog_id BIGINT REFERENCES violations(id) ON DELETE SET NULL,
      violation_label TEXT NOT NULL,
      reported_by VARCHAR(255),
      remarks TEXT,
      signature_image TEXT,
      signature_updated_at TIMESTAMPTZ,
      cleared_at TIMESTAMPTZ,
      cleared_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      cleared_by_name VARCHAR(255),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await dbPool.query(`
    CREATE INDEX IF NOT EXISTS student_violation_logs_student_id_idx
    ON student_violation_logs (student_id, created_at DESC)
  `);

  await dbPool.query(`
    CREATE INDEX IF NOT EXISTS student_violation_logs_catalog_id_idx
    ON student_violation_logs (violation_catalog_id)
  `);

  await dbPool.query(`
    CREATE INDEX IF NOT EXISTS student_violation_logs_admin_sort_idx
    ON student_violation_logs (cleared_at ASC NULLS FIRST, created_at DESC, id DESC)
  `);

  await dbPool.query(`
    CREATE INDEX IF NOT EXISTS student_violation_logs_student_recent_idx
    ON student_violation_logs (student_id, created_at DESC, id DESC)
  `);

  await dbPool.query(`
    CREATE OR REPLACE FUNCTION set_student_violation_logs_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql SET search_path = public
  `);

  await dbPool.query(`
    DROP TRIGGER IF EXISTS trg_student_violation_logs_updated_at ON student_violation_logs
  `);

  await dbPool.query(`
    CREATE TRIGGER trg_student_violation_logs_updated_at
    BEFORE UPDATE ON student_violation_logs
    FOR EACH ROW
    EXECUTE FUNCTION set_student_violation_logs_updated_at()
  `);

  // Add semester and school_year columns for archive tracking
  await dbPool.query(`
    ALTER TABLE student_violation_logs
    ADD COLUMN IF NOT EXISTS semester VARCHAR(20) DEFAULT '1ST SEM',
    ADD COLUMN IF NOT EXISTS school_year VARCHAR(20) DEFAULT '2025-2026'
  `);

  // Create archive table for archived violations
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS student_violation_archives (
      id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      student_id BIGINT NOT NULL,
      violation_catalog_id BIGINT,
      violation_label TEXT NOT NULL,
      reported_by VARCHAR(255),
      remarks TEXT,
      source_import_key TEXT,
      signature_image TEXT,
      signature_updated_at TIMESTAMPTZ,
      semester VARCHAR(20) NOT NULL,
      school_year VARCHAR(20) NOT NULL,
      is_unresolved BOOLEAN NOT NULL DEFAULT TRUE,
      archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      archived_by_user_id BIGINT,
      archived_by_name VARCHAR(255),
      original_created_at TIMESTAMPTZ NOT NULL,
      original_updated_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Ensure unresolved marker exists on archive table for new Unresolved folder behavior
  await dbPool.query(`
    ALTER TABLE student_violation_archives
    ADD COLUMN IF NOT EXISTS is_unresolved BOOLEAN NOT NULL DEFAULT TRUE
  `);

  await dbPool.query(`
    ALTER TABLE student_violation_archives
    ADD COLUMN IF NOT EXISTS source_import_key TEXT
  `);

  // Create indexes for archive table
  await dbPool.query(`
    CREATE INDEX IF NOT EXISTS student_violation_archives_school_year_idx
    ON student_violation_archives (school_year, semester)
  `);

  await dbPool.query(`
    CREATE INDEX IF NOT EXISTS student_violation_archives_unresolved_term_idx
    ON student_violation_archives (school_year, semester, archived_at DESC)
    WHERE is_unresolved = TRUE
  `);

  await dbPool.query(`
    CREATE INDEX IF NOT EXISTS student_violation_archives_student_id_idx
    ON student_violation_archives (student_id)
  `);

  return { synced: true };
}

export async function syncAuditLogsDatabase() {
  if (!hasDbConfig()) {
    throw new Error(
      `Missing required environment variables: ${getMissingDbVars().join(", ")}`,
    );
  }

  const dbPool = getDbPool();

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      actor_user_id BIGINT,
      actor_name VARCHAR(255),
      actor_role VARCHAR(50) NOT NULL DEFAULT 'admin',
      action VARCHAR(100) NOT NULL,
      target_type VARCHAR(100) NOT NULL,
      target_id VARCHAR(100),
      details TEXT,
      metadata JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Replace older single-column indexes with workload-oriented composites.
  await dbPool.query(`
    DROP INDEX IF EXISTS audit_logs_created_at_idx
  `);

  await dbPool.query(`
    DROP INDEX IF EXISTS audit_logs_actor_user_id_idx
  `);

  await dbPool.query(`
    CREATE INDEX IF NOT EXISTS audit_logs_created_at_id_idx
    ON audit_logs (created_at DESC, id DESC)
  `);

  await dbPool.query(`
    CREATE INDEX IF NOT EXISTS audit_logs_actor_user_created_at_idx
    ON audit_logs (actor_user_id, created_at DESC)
    WHERE actor_user_id IS NOT NULL
  `);

  // Keep metadata compact for new/updated rows.
  await dbPool.query(`
    CREATE OR REPLACE FUNCTION normalize_jsonb_metadata()
    RETURNS TRIGGER AS $$
    BEGIN
      IF NEW.metadata IS NOT NULL THEN
        NEW.metadata = jsonb_strip_nulls(NEW.metadata);
        IF NEW.metadata = '{}'::jsonb THEN
          NEW.metadata = NULL;
        END IF;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql SET search_path = public
  `);

  await dbPool.query(`
    DROP TRIGGER IF EXISTS trg_audit_logs_normalize_metadata ON audit_logs
  `);

  await dbPool.query(`
    CREATE TRIGGER trg_audit_logs_normalize_metadata
    BEFORE INSERT OR UPDATE ON audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION normalize_jsonb_metadata()
  `);

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS "ArchiveHistory" (
      id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      semester VARCHAR(20) NOT NULL,
      school_year VARCHAR(20) NOT NULL,
      total_students_archived INTEGER DEFAULT 0,
      students_promoted INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await dbPool.query(`
    CREATE OR REPLACE FUNCTION set_archive_history_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql SET search_path = public
  `);

  await dbPool.query(`
    DROP TRIGGER IF EXISTS trg_archive_history_updated_at ON "ArchiveHistory"
  `);

  await dbPool.query(`
    CREATE TRIGGER trg_archive_history_updated_at
    BEFORE UPDATE ON "ArchiveHistory"
    FOR EACH ROW
    EXECUTE FUNCTION set_archive_history_updated_at()
  `);

  return { synced: true };
}
