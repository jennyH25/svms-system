import "dotenv/config";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import postgres from "postgres";
import XLSX from "xlsx";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EMAIL_LOGO_PATH = path.resolve(__dirname, "../src/assets/css_logo.png");
let EMAIL_LOGO_BASE64 = "";

async function loadEmailLogo() {
  try {
    const logoBuffer = await readFile(EMAIL_LOGO_PATH);
    EMAIL_LOGO_BASE64 = logoBuffer.toString("base64");
    console.log("Email logo loaded successfully.");
  } catch (error) {
    console.warn(`Failed to load email logo: ${error.message}`);
    EMAIL_LOGO_BASE64 = "";
  }
}

function getEmailLogoDataUrl() {
  return EMAIL_LOGO_BASE64 ? `data:image/png;base64,${EMAIL_LOGO_BASE64}` : "";
}

function usage() {
  console.error("Usage: node scripts/import-students-workbook.mjs <path-to-workbook>");
}

function normalizeNamePart(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function parseImportedStudentName(rawName) {
  const normalized = String(rawName || "").trim().replace(/\s+/g, " ");
  const [lastPartRaw, remainingRaw = ""] = normalized.split(",", 2);
  const lastName = String(lastPartRaw || "").trim();
  const remainingParts = String(remainingRaw || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  let middleInitial = "";
  let firstNameParts = remainingParts;
  if (remainingParts.length > 1) {
    const lastToken = remainingParts.at(-1) || "";
    const middleMatch = lastToken.match(/^([A-Za-z])[.]?$/);
    if (middleMatch) {
      middleInitial = middleMatch[1].toUpperCase();
      firstNameParts = remainingParts.slice(0, -1);
    }
  }

  const firstName = firstNameParts.join(" ").trim();
  const fullName = [firstName, middleInitial ? `${middleInitial}.` : "", lastName]
    .filter(Boolean)
    .join(" ")
    .trim();

  return { firstName, middleInitial, lastName, fullName };
}

function parseImportedProgramYearSection(rawValue) {
  const normalized = String(rawValue || "").trim();
  const [programRaw = "", yearSectionRaw = ""] = normalized.split("-", 2);
  const program = String(programRaw || "").trim().toUpperCase();
  const yearSection = String(yearSectionRaw || normalized).trim().toUpperCase();
  const yearMatch = yearSection.match(/^(\d+)/);
  const yearLevel = yearMatch ? Number(yearMatch[1]) : 1;

  return {
    program,
    yearSection,
    yearLevel: Number.isFinite(yearLevel) && yearLevel >= 1 ? yearLevel : 1,
  };
}

function normalizeImportedStudentStatus(value) {
  return String(value || "").trim().toLowerCase() === "irregular"
    ? "Irregular"
    : "Regular";
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildCredentialEmailTemplate({
  firstName,
  username,
  password,
  schoolId,
  program,
  yearSection,
}) {
  return `
    <div style="background:linear-gradient(180deg,#eaf6fb 0%,#f4f8fc 45%,#f8fafc 100%);padding:36px 18px;font-family:Segoe UI,Arial,sans-serif;color:#0f172a;">
      <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #dbe7f2;border-radius:18px;overflow:hidden;box-shadow:0 12px 36px rgba(2,6,23,0.08);">
        <div style="padding:22px 26px;background:linear-gradient(135deg,#0f172a 0%,#1e293b 70%,#0f172a 100%);border-bottom:1px solid rgba(255,255,255,0.12);">
          <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
            ${getEmailLogoDataUrl() ? `<img src="${getEmailLogoDataUrl()}" width="52" height="52" alt="CSS Logo" style="display:block;border-radius:12px;background:#ffffff;padding:4px;flex-shrink:0;" />` : ""}
            <div style="min-width:0;">
              <p style="margin:0 0 4px 0;color:#cbd5e1;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">College of Computer Studies</p>
              <p style="margin:0 0 8px 0;color:#7dd3fc;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">SVMS Account Created</p>
              <h2 style="margin:0;color:#f8fafc;font-size:22px;font-weight:800;line-height:1.3;overflow-wrap:break-word;">Your Student Account Credentials</h2>
            </div>
          </div>
        </div>
        <div style="padding:24px 26px;background:#ffffff;">
          <p style="margin:0 0 14px 0;color:#1f2937;font-size:14px;line-height:1.6;">Hello ${escapeHtml(firstName || "Student")},</p>
          <p style="margin:0 0 20px 0;color:#4b5563;font-size:14px;line-height:1.6;">An account has been created for you in the Student Violation Management System. Use the account details below to sign in.</p>
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;background:#ffffff;margin-bottom:18px;">
            <tr>
              <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;background:#f8fafc;color:#334155;font-size:13px;font-weight:600;">Student ID</td>
              <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#0f172a;font-size:13px;">${escapeHtml(schoolId)}</td>
            </tr>
            <tr>
              <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;background:#f8fafc;color:#334155;font-size:13px;font-weight:600;">Program</td>
              <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#0f172a;font-size:13px;">${escapeHtml(program)}</td>
            </tr>
            <tr>
              <td style="padding:10px 12px;background:#f8fafc;color:#334155;font-size:13px;font-weight:600;">Year/Section</td>
              <td style="padding:10px 12px;color:#0f172a;font-size:13px;">${escapeHtml(yearSection)}</td>
            </tr>
          </table>
          <div style="background:linear-gradient(180deg,#f0f9ff 0%,#f8fbff 100%);border:1px solid #cfe9ff;border-radius:14px;padding:18px;margin:20px 0;">
            <p style="margin:0 0 12px 0;font-size:13px;font-weight:600;color:#0369a1;letter-spacing:0.06em;text-transform:uppercase;">Username</p>
            <p style="margin:0 0 18px 0;font-size:15px;color:#0f172a;font-weight:700;letter-spacing:0.03em;">${escapeHtml(username)}</p>
            <p style="margin:0 0 12px 0;font-size:13px;font-weight:600;color:#0369a1;letter-spacing:0.06em;text-transform:uppercase;">Temporary Password</p>
            <p style="margin:0;font-size:15px;color:#0f172a;font-weight:700;letter-spacing:0.03em;">${escapeHtml(password)}</p>
          </div>
          <div style="margin:20px 0;padding:12px 14px;border-radius:12px;background:#fef3c7;border:1px solid #fde68a;">
            <p style="margin:0;color:#92400e;font-size:13px;line-height:1.6;font-weight:500;">For security, please log in and change your password immediately.</p>
          </div>
        </div>
      </div>
    </div>
  `;
}

function parseStudentWorkbook(workbookPath) {
  const workbook = XLSX.readFile(workbookPath);
  const firstSheetName = workbook.SheetNames?.[0];
  if (!firstSheetName) {
    throw new Error("The workbook does not contain any worksheets.");
  }

  const worksheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
  const students = [];
  const seenSchoolIds = new Set();
  const seenEmails = new Set();

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const schoolId = String(row["Student Id"] || row["Student ID"] || "").trim();
    const name = String(row.Name || "").trim();
    const email = String(row["Email "] || row.Email || "").trim().toLowerCase();
    const programYearSection = String(
      row["Program-Year/Section"] || row["Program / Year / Section"] || "",
    ).trim();

    if (!schoolId && !name && !email && !programYearSection) {
      return;
    }

    if (!schoolId || !name || !email || !programYearSection) {
      throw new Error(`Row ${rowNumber} is missing one or more required columns.`);
    }

    if (seenSchoolIds.has(schoolId.toLowerCase())) {
      throw new Error(`Duplicate Student ID found at row ${rowNumber}.`);
    }
    if (seenEmails.has(email)) {
      throw new Error(`Duplicate email found at row ${rowNumber}.`);
    }

    seenSchoolIds.add(schoolId.toLowerCase());
    seenEmails.add(email);

    const parsedName = parseImportedStudentName(name);
    const parsedProgram = parseImportedProgramYearSection(programYearSection);
    if (!parsedName.firstName || !parsedName.lastName) {
      throw new Error(`Unable to parse the student name at row ${rowNumber}.`);
    }
    if (!parsedProgram.program || !parsedProgram.yearSection) {
      throw new Error(`Unable to parse Program-Year/Section at row ${rowNumber}.`);
    }

    students.push({
      schoolId,
      email,
      status: normalizeImportedStudentStatus(
        row["Status(Regular or Irregular)"] || row.Status || "",
      ),
      ...parsedName,
      ...parsedProgram,
    });
  });

  if (students.length === 0) {
    throw new Error("No importable student rows were found in the workbook.");
  }

  return students;
}

async function generateStudentUsername(sql, firstName, lastName) {
  const first = normalizeNamePart(firstName);
  const last = normalizeNamePart(lastName);
  const baseRaw = `${first ? first[0] : "s"}${last || "student"}`;
  const base = baseRaw.slice(0, 18);

  let candidate = base;
  let suffix = 1;

  while (true) {
    const exists = await sql`
      SELECT id
      FROM users
      WHERE username = ${candidate}
      LIMIT 1
    `;

    if (!exists[0]) {
      return candidate;
    }

    suffix += 1;
    candidate = `${base}${suffix}`.slice(0, 24);
  }
}

function generateTemporaryPassword() {
  return crypto.randomBytes(6).toString("base64url");
}

function createTransporter() {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error("SMTP_USER and SMTP_PASS are required to send account emails.");
  }

  const transportOptions = {
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    pool: true,
  };

  if (process.env.SMTP_HOST) {
    transportOptions.host = process.env.SMTP_HOST;
    transportOptions.port = Number(process.env.SMTP_PORT || 587);
    transportOptions.secure = process.env.SMTP_SECURE === "true";
  } else {
    transportOptions.service = "gmail";
  }

  return nodemailer.createTransport(transportOptions);
}

async function main() {
  const workbookArg = process.argv[2];
  if (!workbookArg) {
    usage();
    process.exit(1);
  }

  await loadEmailLogo();

  const workbookPath = path.resolve(workbookArg);
  const students = parseStudentWorkbook(workbookPath);

  const sql = postgres(
    process.env.DATABASE_URL || {
      host: process.env.PGHOST,
      port: Number(process.env.PGPORT || 5432),
      database: process.env.PGDATABASE,
      username: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      ssl: process.env.PGSSL === "true" ? "require" : undefined,
    },
    {
      ssl: process.env.PGSSL === "true" ? "require" : undefined,
      max: 1,
    },
  );

  const transporter = createTransporter();
  const createdCredentials = [];
  let removedActiveUsers = 0;

  try {
    await sql.begin(async (tx) => {
      const removedStudents = await tx`
        DELETE FROM "Students"
        WHERE is_archived = FALSE
        RETURNING id, user_id
      `;

      removedActiveUsers = removedStudents.length;
      const deletedUserIds = removedStudents
        .map((row) => row.user_id)
        .filter((value) => value != null);

      if (deletedUserIds.length > 0) {
        await tx`
          DELETE FROM users
          WHERE role = 'student'
            AND id = ANY(${deletedUserIds})
        `;
      }

      for (const student of students) {
        const username = await generateStudentUsername(
          tx,
          student.firstName,
          student.lastName,
        );
        const password = generateTemporaryPassword();
        const passwordHash = await bcrypt.hash(password, 10);

        const insertedUsers = await tx`
          INSERT INTO users (username, password_hash, role, first_name, last_name, is_active)
          VALUES (${username}, ${passwordHash}, 'student', ${student.firstName}, ${student.lastName}, TRUE)
          RETURNING id
        `;

        const userId = insertedUsers[0]?.id;
        await tx`
          INSERT INTO "Students"
            (user_id, email, school_id, first_name, middle_initial, last_name, full_name, program, year_section, year_level, status, violation_count)
          VALUES (
            ${userId},
            ${student.email},
            ${student.schoolId},
            ${student.firstName},
            ${student.middleInitial || null},
            ${student.lastName},
            ${student.fullName},
            ${student.program},
            ${student.yearSection},
            ${student.yearLevel},
            ${student.status},
            0
          )
        `;

        createdCredentials.push({
          ...student,
          username,
          password,
        });
      }
    });

    const emailFailures = [];
    for (const credential of createdCredentials) {
      try {
        await transporter.sendMail({
          from: process.env.SMTP_FROM || process.env.SMTP_USER,
          to: credential.email,
          subject: "Your SVMS Student Account Credentials",
          html: buildCredentialEmailTemplate(credential),
        });
      } catch (error) {
        emailFailures.push({
          email: credential.email,
          reason: error?.message || String(error),
        });
      }
    }

    const [activeCountResult] = await sql`
      SELECT COUNT(*)::int AS count
      FROM "Students"
      WHERE is_archived = FALSE
    `;

    console.log(
      JSON.stringify(
        {
          status: emailFailures.length === 0 ? "ok" : "partial",
          workbook: workbookPath,
          removedActiveUsers,
          importedCount: createdCredentials.length,
          activeStudentsNow: activeCountResult?.count || 0,
          emailSentCount: createdCredentials.length - emailFailures.length,
          emailFailedCount: emailFailures.length,
          emailFailures,
        },
        null,
        2,
      ),
    );

    if (emailFailures.length > 0) {
      process.exitCode = 2;
    }
  } finally {
    await transporter.close();
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
