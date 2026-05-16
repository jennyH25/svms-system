import "dotenv/config";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import postgres from "postgres";
import XLSX from "xlsx";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EMAIL_LOGO_PUBLIC_PATH = "/ccs_logo.png";
const EMAIL_LOGO_DISPLAY_WIDTH = 72;
const EMAIL_LOGO_DISPLAY_HEIGHT = 41;

function getEmailLogoUrl() {
  const explicitLogoUrl = String(process.env.EMAIL_LOGO_URL || "").trim();
  if (explicitLogoUrl) {
    return explicitLogoUrl;
  }

  const configuredBaseUrl = String(
    process.env.EMAIL_ASSET_BASE_URL ||
      process.env.PUBLIC_APP_URL ||
      process.env.APP_URL ||
      process.env.CLIENT_URL ||
      process.env.PUBLIC_URL ||
      process.env.SITE_URL ||
      "",
  )
    .trim()
    .replace(/\/+$/, "");

  if (configuredBaseUrl) {
    return `${configuredBaseUrl}${EMAIL_LOGO_PUBLIC_PATH}`;
  }

  const vercelUrl = String(process.env.VERCEL_URL || "").trim().replace(/\/+$/, "");
  if (vercelUrl) {
    return `https://${vercelUrl}${EMAIL_LOGO_PUBLIC_PATH}`;
  }

  return "";
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

function legacyLightBuildSystemEmailShell({
  eyebrow,
  heading,
  lead,
  contentHtml,
  footerNote,
}) {
  const logoUrl = getEmailLogoUrl();
  const logoHtml = logoUrl
    ? `<div style="display:inline-block;background:#ffffff;border-radius:14px;padding:8px;"><img src="${escapeHtml(logoUrl)}" width="${EMAIL_LOGO_DISPLAY_WIDTH}" height="${EMAIL_LOGO_DISPLAY_HEIGHT}" alt="CCS Logo" style="display:block;width:${EMAIL_LOGO_DISPLAY_WIDTH}px;height:${EMAIL_LOGO_DISPLAY_HEIGHT}px;border:0;outline:none;text-decoration:none;" /></div>`
    : `<div style="width:${EMAIL_LOGO_DISPLAY_WIDTH}px;height:${EMAIL_LOGO_DISPLAY_HEIGHT}px;border-radius:14px;background:rgba(255,255,255,0.14);display:block;"></div>`;

  return `
    <div style="margin:0;padding:0;background:#eef4fb;font-family:Segoe UI,Arial,sans-serif;color:#0f172a;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%;background:#eef4fb;">
        <tr>
          <td align="center" style="padding:28px 12px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;max-width:680px;background:#ffffff;border:1px solid #dbe7f2;border-radius:18px;overflow:hidden;box-shadow:0 14px 40px rgba(15,23,42,0.08);">
              <tr>
                <td align="left" style="padding:24px 24px 20px 24px;background:linear-gradient(135deg,#0f172a 0%,#1e293b 70%,#0f172a 100%);text-align:left;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%;">
                    <tr>
                      <td valign="middle" width="96" style="width:96px;padding:0 16px 0 0;">
                        ${logoHtml}
                      </td>
                      <td valign="middle" style="vertical-align:middle;text-align:left;">
                        <p style="margin:0 0 6px 0;color:#cbd5e1;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;line-height:1.4;">College of Computer Studies</p>
                        <p style="margin:0 0 10px 0;color:#7dd3fc;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;line-height:1.4;">${escapeHtml(eyebrow || "SVMS")}</p>
                        <h1 style="margin:0;color:#f8fafc;font-size:26px;font-weight:800;line-height:1.2;text-align:left;">${escapeHtml(heading || "Student Violation Management System")}</h1>
                      </td>
                    </tr>
                    ${lead ? `<tr><td colspan="2" style="padding-top:18px;text-align:left;"><p style="margin:0;color:#cbd5e1;font-size:14px;line-height:1.6;text-align:left;">${escapeHtml(lead)}</p></td></tr>` : ""}
                  </table>
                </td>
              </tr>
              <tr>
                <td align="left" style="padding:24px;background:#ffffff;text-align:left;">
                  ${contentHtml}
                  ${footerNote ? `<p style="margin:24px 0 0 0;color:#64748b;font-size:12px;line-height:1.6;">${escapeHtml(footerNote)}</p>` : ""}
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;
}

function legacyLightBuildCredentialEmailTemplate({
  firstName,
  username,
  password,
  schoolId,
  program,
  yearSection,
}) {
  return legacyLightBuildSystemEmailShell({
    eyebrow: "SVMS Account Created",
    heading: "Your Student Account Credentials",
    lead: `Hello ${escapeHtml(firstName || "Student")},`,
    contentHtml: `
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
        <p style="margin:0;color:#92400e;font-size:13px;line-height:1.6;font-weight:500;">&#9888; For security, please log in and change your password immediately.</p>
      </div>
    `,
    footerNote:
      "This is an automated message from Student Violation Management System. Please do not reply to this email.",
  });
}

function buildSystemEmailShell({
  eyebrow,
  heading,
  lead,
  contentHtml,
  footerNote,
}) {
  const logoUrl = getEmailLogoUrl();
  const logoHtml = logoUrl
    ? `<div style="width:62px;height:62px;border-radius:16px;background:#1d2026;border:1px solid #343942;text-align:center;vertical-align:middle;"><img src="${escapeHtml(logoUrl)}" width="${EMAIL_LOGO_DISPLAY_WIDTH}" height="${EMAIL_LOGO_DISPLAY_HEIGHT}" alt="CCS Logo" style="display:inline-block;width:${EMAIL_LOGO_DISPLAY_WIDTH}px;height:${EMAIL_LOGO_DISPLAY_HEIGHT}px;border:0;outline:none;text-decoration:none;margin-top:10px;" /></div>`
    : `<div style="width:62px;height:62px;border-radius:16px;background:#1d2026;border:1px solid #343942;display:block;"></div>`;

  return `
    <div style="margin:0;padding:0;background:#1f2229;font-family:Segoe UI,Arial,sans-serif;color:#e5eef8;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%;background:#1f2229;">
        <tr>
          <td align="center" style="padding:28px 12px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:separate;border-spacing:0;max-width:680px;background:#12161d;border:1px solid #303845;border-radius:24px;overflow:hidden;box-shadow:0 18px 48px rgba(0,0,0,0.35);">
              <tr>
                <td align="left" style="padding:32px 36px;background:#17191d;text-align:left;border-bottom:1px solid #292d34;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%;">
                    <tr>
                      <td valign="middle" width="76" style="width:76px;padding:0 16px 0 0;vertical-align:middle;">
                        ${logoHtml}
                      </td>
                      <td valign="middle" style="vertical-align:middle;text-align:left;padding-left:12px;">
                        <p style="margin:0;color:#f3f4f6;font-size:13px;font-weight:700;line-height:1.45;">College of Computer Studies</p>
                        <p style="margin:6px 0 0;color:#8fa3bd;font-size:12px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;line-height:1.45;">Student Violation System</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td align="left" style="padding:34px 36px 30px;background:#0b0c0e;text-align:left;">
                  <p style="margin:0 0 14px 0;font-size:11px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;color:#8fa3bd;">${escapeHtml(eyebrow || "SVMS")}</p>
                  <h1 style="margin:0 0 14px 0;color:#ffffff;font-size:31px;font-weight:800;line-height:1.2;letter-spacing:-0.02em;text-align:left;">${escapeHtml(heading || "Student Violation Management System")}</h1>
                  ${lead ? `<p style="margin:0 0 28px 0;color:#c8d0dc;font-size:14px;line-height:1.8;text-align:left;">${escapeHtml(lead)}</p>` : ""}
                  ${contentHtml}
                  ${footerNote ? `<p style="margin:24px 0 0 0;color:#9aa7bb;font-size:12px;line-height:1.75;">${escapeHtml(footerNote)}</p>` : ""}
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;
}

function buildCredentialEmailTemplate({
  firstName,
  username,
  password,
  schoolId,
  program,
  yearSection,
}) {
  return buildSystemEmailShell({
    eyebrow: "SVMS Account Created",
    heading: "Your Student Account Credentials",
    lead: `Hello ${escapeHtml(firstName || "Student")},`,
    contentHtml: `
      <div style="margin:0 0 18px 0;padding:18px;border-radius:20px;background:#1b2230;border:1px solid #344256;box-shadow:inset 0 1px 0 rgba(255,255,255,0.04);">
        <p style="margin:0;color:#d7e2f0;font-size:15px;line-height:1.75;">An account has been created for you in the Student Violation Management System. Use the account details below to sign in.</p>
      </div>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;border:1px solid #42556d;border-radius:20px;overflow:hidden;background:#1b2230;margin-bottom:18px;">
        <tr>
          <td style="padding:12px 14px;border-bottom:1px solid #42556d;background:#171d29;color:#a9bbd1;font-size:13px;font-weight:600;">Student ID</td>
          <td style="padding:12px 14px;border-bottom:1px solid #42556d;color:#f8fafc;font-size:13px;">${escapeHtml(schoolId)}</td>
        </tr>
        <tr>
          <td style="padding:12px 14px;border-bottom:1px solid #42556d;background:#171d29;color:#a9bbd1;font-size:13px;font-weight:600;">Program</td>
          <td style="padding:12px 14px;border-bottom:1px solid #42556d;color:#f8fafc;font-size:13px;">${escapeHtml(program)}</td>
        </tr>
        <tr>
          <td style="padding:12px 14px;background:#171d29;color:#a9bbd1;font-size:13px;font-weight:600;">Year/Section</td>
          <td style="padding:12px 14px;color:#f8fafc;font-size:13px;">${escapeHtml(yearSection)}</td>
        </tr>
      </table>
      <div style="margin:0 0 18px 0;padding:20px;border-radius:22px;background:#1b2230;border:1px solid #42556d;box-shadow:0 10px 24px rgba(0,0,0,0.22);">
        <p style="margin:0 0 12px 0;font-size:12px;font-weight:700;color:#8ad2ff;letter-spacing:0.08em;text-transform:uppercase;">Username</p>
        <p style="margin:0 0 18px 0;padding:14px 16px;border-radius:16px;background:#0f172a;border:1px solid #23314b;color:#f8fafc;font-size:16px;font-weight:700;letter-spacing:0.03em;">${escapeHtml(username)}</p>
        <p style="margin:0 0 12px 0;font-size:12px;font-weight:700;color:#8ad2ff;letter-spacing:0.08em;text-transform:uppercase;">Temporary Password</p>
        <p style="margin:0;padding:14px 16px;border-radius:16px;background:#0f172a;border:1px solid #23314b;color:#f8fafc;font-size:16px;font-weight:700;letter-spacing:0.03em;">${escapeHtml(password)}</p>
      </div>
      <div style="margin:0;padding:18px;border-radius:20px;background:#211b1b;border:1px solid #5a4545;">
        <p style="margin:0;color:#f3d6b0;font-size:14px;line-height:1.7;font-weight:500;">&#9888; For security, please log in and change your password immediately.</p>
      </div>
    `,
    footerNote:
      "This is an automated message from Student Violation Management System. Please do not reply to this email.",
  });
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
