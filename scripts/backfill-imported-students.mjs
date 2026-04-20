import "dotenv/config";
import postgres from "postgres";
import ExcelJS from "exceljs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workbookPath = path.resolve(__dirname, "../ViolationRecords1.xlsx");

function getConnectionString() {
  return process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || "";
}

function buildConnectionStringFromParts() {
  const required = ["PGHOST", "PGPORT", "PGUSER", "PGPASSWORD", "PGDATABASE"];
  if (!required.every((k) => Boolean(process.env[k]))) {
    return "";
  }

  return `postgresql://${encodeURIComponent(process.env.PGUSER)}:${encodeURIComponent(process.env.PGPASSWORD)}@${process.env.PGHOST}:${process.env.PGPORT}/${process.env.PGDATABASE}`;
}

function normalizeWorkbookText(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeComparisonText(value) {
  return normalizeWorkbookText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitStudentName(name) {
  const normalized = normalizeWorkbookText(name);
  if (!normalized) {
    return {
      firstName: "Historical",
      lastName: "Student",
      fullName: "Historical Student",
    };
  }

  const commaMatch = normalized.match(/^([^,]+),\s*(.+)$/);
  if (commaMatch) {
    return {
      lastName: normalizeWorkbookText(commaMatch[1]) || "Historical",
      firstName: normalizeWorkbookText(commaMatch[2]) || "Student",
      fullName: normalized,
    };
  }

  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return {
      firstName: parts[0],
      lastName: "Student",
      fullName: normalized,
    };
  }

  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts[parts.length - 1],
    fullName: normalized,
  };
}

function buildImportedEmail(firstName, lastName) {
  const toLocal = (value) =>
    String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");

  const local =
    [toLocal(lastName), toLocal(firstName)].filter(Boolean).join("_") ||
    "imported_student";
  return `${local}@plpasig.edu.ph`;
}

async function loadWorkbookCounts() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(workbookPath);

  const worksheet = workbook.worksheets?.[0];
  if (!worksheet) {
    return new Map();
  }

  const headerRow = worksheet.getRow(1);
  const headerMap = {};
  headerRow.eachCell((cell, colNumber) => {
    const key = String(cell.value || "")
      .trim()
      .toUpperCase();
    if (key) headerMap[key] = colNumber;
  });

  const nameCol = headerMap.NAME;
  const dateCol = headerMap.DATE;
  if (!nameCol || !dateCol) {
    return new Map();
  }

  const counts = new Map();

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const rawName = row.getCell(nameCol).value;
    const rawDate = row.getCell(dateCol).value;

    if (!rawName || !rawDate) {
      continue;
    }

    const normalizedName = normalizeWorkbookText(rawName);
    const key = normalizeComparisonText(normalizedName);
    if (!key) {
      continue;
    }

    counts.set(key, (counts.get(key) || 0) + 1);
  }

  return counts;
}

async function run() {
  const connectionString =
    getConnectionString() || buildConnectionStringFromParts();
  if (!connectionString) {
    throw new Error("Database connection is not configured.");
  }

  const sql = postgres(connectionString, {
    ssl:
      process.env.PGSSL === "false" ? undefined : { rejectUnauthorized: false },
    max: 5,
  });

  try {
    const workbookCounts = await loadWorkbookCounts();

    await sql`ALTER TABLE "Students" ALTER COLUMN school_id DROP NOT NULL`;

    const importedStudents = await sql`
      SELECT id, full_name, first_name, last_name
      FROM "Students"
      WHERE is_archived = TRUE
        AND (
          archived_reason = 'Historical import'
          OR archived_reason = 'IMPORTED'
          OR LOWER(email) LIKE 'historical-%@svms.local'
        )
      ORDER BY id ASC
    `;

    let updated = 0;

    for (const student of importedStudents) {
      const parts = splitStudentName(
        student.full_name ||
          `${student.first_name || ""} ${student.last_name || ""}`,
      );
      const baseEmail = buildImportedEmail(parts.firstName, parts.lastName);

      let finalEmail = baseEmail;
      let suffix = 2;
      while (true) {
        const conflict = await sql`
          SELECT id FROM "Students"
          WHERE LOWER(email) = LOWER(${finalEmail})
            AND id <> ${student.id}
          LIMIT 1
        `;

        if (conflict.length === 0) {
          break;
        }

        const [local, domain] = baseEmail.split("@");
        finalEmail = `${local}_${suffix}@${domain}`;
        suffix += 1;
      }

      const countKey = normalizeComparisonText(parts.fullName);
      const violationCount = workbookCounts.get(countKey) || 0;

      await sql`
        UPDATE "Students"
        SET email = ${finalEmail},
            first_name = COALESCE(NULLIF(first_name, ''), ${parts.firstName}),
            last_name = COALESCE(NULLIF(last_name, ''), ${parts.lastName}),
            full_name = COALESCE(NULLIF(full_name, ''), ${parts.fullName}),
            archived_reason = 'IMPORTED',
            school_id = NULL,
            violation_count = ${violationCount}
        WHERE id = ${student.id}
      `;

      updated += 1;
    }

    console.log(`Backfill complete. Updated ${updated} imported student rows.`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

run().catch((error) => {
  console.error("Backfill failed:", error.message);
  process.exit(1);
});
