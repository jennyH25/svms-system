import "dotenv/config";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import nodemailer from "nodemailer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  closeDbPool,
  getSeedAccountsFromEnv,
  getDbPool,
  getMissingDbVars,
  hasDbConfig,
  syncAuthDatabase,
  syncStudentsFromUsers,
  syncStudentsDatabase,
} from "./db.js";

const app = express();
const port = Number(process.env.API_PORT || process.env.PORT || 3001);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.resolve(__dirname, "../dist");
const FORGOT_CODE_EXPIRY_MS = 10 * 60 * 1000;
const FORGOT_RESEND_COOLDOWN_MS = 15 * 1000;
const forgotPasswordStore = new Map();

function buildCredentialEmailTemplate({ firstName, username, password }) {
  return `
    <div style="background:#0d0d0d;padding:32px;font-family:Segoe UI,Arial,sans-serif;color:#f1f5f9;">
      <div style="max-width:620px;margin:0 auto;background:linear-gradient(135deg, rgba(42,45,53,0.92), rgba(22,24,30,0.92));border:1px solid rgba(255,255,255,0.12);border-radius:16px;overflow:hidden;">
        <div style="padding:20px 24px;border-bottom:1px solid rgba(255,255,255,0.12);">
          <h2 style="margin:0;font-size:20px;font-weight:800;letter-spacing:0.04em;color:#ffffff;">Student Violation System</h2>
          <p style="margin:6px 0 0 0;color:#94a3b8;font-size:13px;">Your student account credentials</p>
        </div>
        <div style="padding:24px;">
          <p style="margin:0 0 14px 0;color:#e2e8f0;font-size:14px;">Hello ${firstName || "Student"},</p>
          <p style="margin:0 0 18px 0;color:#cbd5e1;font-size:14px;line-height:1.6;">An account has been created for you in the Student Violation System. Use the credentials below to sign in.</p>
          <div style="background:rgba(15,17,19,0.85);border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:16px;">
            <p style="margin:0 0 8px 0;font-size:13px;color:#94a3b8;">Username</p>
            <p style="margin:0 0 14px 0;font-size:16px;color:#ffffff;font-weight:700;letter-spacing:0.02em;">${username}</p>
            <p style="margin:0 0 8px 0;font-size:13px;color:#94a3b8;">Temporary Password</p>
            <p style="margin:0;font-size:16px;color:#ffffff;font-weight:700;letter-spacing:0.02em;">${password}</p>
          </div>
          <p style="margin:18px 0 0 0;font-size:12px;color:#94a3b8;line-height:1.5;">For security, please log in and change your password immediately.</p>
        </div>
      </div>
    </div>
  `;
}

function buildForgotPasswordEmailTemplate({ code }) {
  return `
    <div style="background:#0d0d0d;padding:32px;font-family:Segoe UI,Arial,sans-serif;color:#f1f5f9;">
      <div style="max-width:620px;margin:0 auto;background:linear-gradient(135deg, rgba(42,45,53,0.92), rgba(22,24,30,0.92));border:1px solid rgba(255,255,255,0.12);border-radius:16px;overflow:hidden;">
        <div style="padding:20px 24px;border-bottom:1px solid rgba(255,255,255,0.12);">
          <h2 style="margin:0;font-size:20px;font-weight:800;letter-spacing:0.04em;color:#ffffff;">Student Violation System</h2>
          <p style="margin:6px 0 0 0;color:#94a3b8;font-size:13px;">Password reset verification code</p>
        </div>
        <div style="padding:24px;">
          <p style="margin:0 0 14px 0;color:#e2e8f0;font-size:14px;">Use this 6-digit code to reset your password:</p>
          <div style="background:rgba(15,17,19,0.85);border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:16px;text-align:center;">
            <p style="margin:0;font-size:28px;color:#ffffff;font-weight:800;letter-spacing:0.2em;">${code}</p>
          </div>
          <p style="margin:18px 0 0 0;font-size:12px;color:#94a3b8;line-height:1.5;">This code expires in 10 minutes.</p>
        </div>
      </div>
    </div>
  `;
}

function getMailTransporter() {
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (!smtpUser || !smtpPass) {
    return null;
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });
}

async function sendStudentCredentialEmail({
  toEmail,
  firstName,
  username,
  password,
}) {
  const transporter = getMailTransporter();
  if (!transporter) {
    return {
      sent: false,
      reason: "SMTP_USER/SMTP_PASS not configured.",
    };
  }

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: toEmail,
    subject: "Your SVMS Student Account Credentials",
    html: buildCredentialEmailTemplate({ firstName, username, password }),
  });

  return { sent: true };
}

async function sendForgotPasswordCodeEmail({ toEmail, code }) {
  const transporter = getMailTransporter();
  if (!transporter) {
    return {
      sent: false,
      reason: "SMTP_USER/SMTP_PASS not configured.",
    };
  }

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: toEmail,
    subject: "SVMS Password Reset Verification Code",
    html: buildForgotPasswordEmailTemplate({ code }),
  });

  return { sent: true };
}

async function findUserByEmail(pool, email) {
  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();

  const adminLookup = await pool.query(
    `
    SELECT u.id, u.role
    FROM users u
    INNER JOIN "Admins" a ON a.user_id = u.id
    WHERE LOWER(a.email) = $1
    LIMIT 1
    `,
    [normalizedEmail],
  );

  if (adminLookup.rows?.[0]) {
    return adminLookup.rows[0];
  }

  const studentLookup = await pool.query(
    `
    SELECT u.id, u.role
    FROM users u
    INNER JOIN "Students" s ON s.user_id = u.id
    WHERE LOWER(s.email) = $1
    LIMIT 1
    `,
    [normalizedEmail],
  );

  return studentLookup.rows?.[0] || null;
}

function normalizeNamePart(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

async function generateStudentUsername(pool, firstName, lastName) {
  const first = normalizeNamePart(firstName);
  const last = normalizeNamePart(lastName);
  const baseRaw = `${first ? first[0] : "s"}${last || "student"}`;
  const base = baseRaw.slice(0, 18);

  let candidate = base;
  let suffix = 1;

  while (true) {
    const exists = await pool.query(
      `SELECT id FROM users WHERE username = $1 LIMIT 1`,
      [candidate],
    );

    if (!exists.rows?.[0]) {
      return candidate;
    }

    suffix += 1;
    candidate = `${base}${suffix}`.slice(0, 24);
  }
}

function generateTemporaryPassword() {
  return crypto.randomBytes(6).toString("base64url");
}

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
    await ensureAuthDatabaseReady();
    await syncStudentsFromUsers();
    const pool = getDbPool();
    const result = await pool.query("SELECT 1 AS ok");
    const ok = Array.isArray(result.rows) && result.rows[0]?.ok === 1;

    if (!ok) {
      return res.status(500).json({
        status: "error",
        message: "Database test query did not return expected value.",
      });
    }

    return res.status(200).json({
      status: "ok",
      database: process.env.PGDATABASE || "postgres",
      host: process.env.PGHOST || "supabase",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(503).json({
      status: "error",
      message: `Database unavailable or sync failed: ${error.message}`,
    });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body ?? {};

  if (!username || !password) {
    return res.status(400).json({
      status: "error",
      message: "Username/email and password are required.",
    });
  }

  if (!hasDbConfig()) {
    return res.status(500).json({
      status: "error",
      message: "Database environment variables are missing.",
      missing: getMissingDbVars(),
    });
  }

  try {
    await ensureAuthDatabaseReady();
    const pool = getDbPool();
    let user = null;

    if (String(username).includes("@")) {
      const adminLookup = await pool.query(
        `
        SELECT
          u.id,
          a.email,
          u.username,
          u.password_hash,
          u.role,
          a.first_name,
          a.last_name,
          u.is_active
        FROM users u
        INNER JOIN "Admins" a ON a.user_id = u.id
        WHERE a.email = $1
        LIMIT 1
        `,
        [username],
      );

      user = adminLookup.rows?.[0] || null;

      if (!user) {
        const studentLookup = await pool.query(
          `
          SELECT
            u.id,
            s.email,
            u.username,
            u.password_hash,
            u.role,
            s.first_name,
            s.last_name,
            s.school_id,
            s.program,
            s.year_section,
            u.is_active
          FROM users u
          INNER JOIN "Students" s ON s.user_id = u.id
          WHERE s.email = $1
          LIMIT 1
          `,
          [username],
        );

        user = studentLookup.rows?.[0] || null;
      }
    } else {
      const usernameLookup = await pool.query(
        `
        SELECT id, username, password_hash, role, first_name, last_name, is_active
        FROM users
        WHERE username = $1
        LIMIT 1
        `,
        [username],
      );

      user = usernameLookup.rows?.[0] || null;

      if (user?.role === "admin") {
        const adminData = await pool.query(
          `SELECT email, first_name, last_name FROM "Admins" WHERE user_id = $1 LIMIT 1`,
          [user.id],
        );
        const adminRow = adminData.rows?.[0] || {};
        user = {
          ...user,
          email: adminRow.email || "",
          first_name: adminRow.first_name || user.first_name,
          last_name: adminRow.last_name || user.last_name,
        };
      } else if (user?.role === "student") {
        const studentData = await pool.query(
          `SELECT email, first_name, last_name, school_id, program, year_section FROM "Students" WHERE user_id = $1 LIMIT 1`,
          [user.id],
        );
        const studentRow = studentData.rows?.[0] || {};
        user = {
          ...user,
          email: studentRow.email || "",
          first_name: studentRow.first_name || user.first_name,
          last_name: studentRow.last_name || user.last_name,
          school_id: studentRow.school_id || "",
          program: studentRow.program || "",
          year_section: studentRow.year_section || "",
        };
      }
    }

    if (!user || !user.is_active) {
      return res.status(401).json({
        status: "error",
        message: "Invalid username/email or password.",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(401).json({
        status: "error",
        message: "Invalid username/email or password.",
      });
    }

    return res.status(200).json({
      status: "ok",
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        firstName: user.first_name || "",
        lastName: user.last_name || "",
        fullName: [user.first_name, user.last_name].filter(Boolean).join(" "),
        schoolId: user.school_id || "",
        program: user.program || "",
        yearSection: user.year_section || "",
      },
    });
  } catch (error) {
    return res.status(503).json({
      status: "error",
      message: `Login unavailable: database not ready (${error.message}).`,
    });
  }
});

app.post("/api/auth/forgot-password/request", async (req, res) => {
  const { email } = req.body ?? {};
  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();

  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    return res.status(400).json({
      status: "error",
      message: "A valid email is required.",
    });
  }

  if (!hasDbConfig()) {
    return res.status(500).json({
      status: "error",
      message: "Database environment variables are missing.",
      missing: getMissingDbVars(),
    });
  }

  try {
    await ensureAuthDatabaseReady();
    const pool = getDbPool();

    const existingSession = forgotPasswordStore.get(normalizedEmail);
    const now = Date.now();
    if (
      existingSession?.resendAvailableAt &&
      existingSession.resendAvailableAt > now
    ) {
      return res.status(429).json({
        status: "error",
        message: "Please wait before requesting another code.",
        retryAfterSeconds: Math.ceil(
          (existingSession.resendAvailableAt - now) / 1000,
        ),
      });
    }

    const user = await findUserByEmail(pool, normalizedEmail);
    if (!user) {
      return res.status(404).json({
        status: "error",
        message: "Email does not exist in the system.",
      });
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const delivery = await sendForgotPasswordCodeEmail({
      toEmail: normalizedEmail,
      code,
    });

    if (!delivery.sent) {
      return res.status(503).json({
        status: "error",
        message: `Unable to send verification code (${delivery.reason || "unknown reason"}).`,
      });
    }

    forgotPasswordStore.set(normalizedEmail, {
      userId: user.id,
      code,
      verified: false,
      resetToken: null,
      expiresAt: now + FORGOT_CODE_EXPIRY_MS,
      resendAvailableAt: now + FORGOT_RESEND_COOLDOWN_MS,
    });

    return res.status(200).json({
      status: "ok",
      message: "Verification code sent.",
      retryAfterSeconds: Math.ceil(FORGOT_RESEND_COOLDOWN_MS / 1000),
    });
  } catch (error) {
    return res.status(503).json({
      status: "error",
      message: `Unable to process forgot password request (${error.message}).`,
    });
  }
});

app.post("/api/auth/forgot-password/verify", async (req, res) => {
  const { email, code } = req.body ?? {};
  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();
  const normalizedCode = String(code || "").trim();

  if (!normalizedEmail || !normalizedCode) {
    return res.status(400).json({
      status: "error",
      message: "Email and verification code are required.",
    });
  }

  const session = forgotPasswordStore.get(normalizedEmail);
  if (!session) {
    return res.status(400).json({
      status: "error",
      message: "No verification request found for this email.",
    });
  }

  if (session.expiresAt < Date.now()) {
    forgotPasswordStore.delete(normalizedEmail);
    return res.status(400).json({
      status: "error",
      message: "Verification code expired. Please request a new one.",
    });
  }

  if (session.code !== normalizedCode) {
    return res.status(400).json({
      status: "error",
      message: "Invalid verification code.",
    });
  }

  const resetToken = crypto.randomBytes(24).toString("hex");
  forgotPasswordStore.set(normalizedEmail, {
    ...session,
    verified: true,
    resetToken,
  });

  return res.status(200).json({
    status: "ok",
    message: "Code verified.",
    resetToken,
  });
});

app.post("/api/auth/forgot-password/reset", async (req, res) => {
  const { email, newPassword, confirmPassword, resetToken } = req.body ?? {};
  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();

  if (!normalizedEmail || !newPassword || !confirmPassword || !resetToken) {
    return res.status(400).json({
      status: "error",
      message: "Email, reset token, and new password fields are required.",
    });
  }

  if (String(newPassword) !== String(confirmPassword)) {
    return res.status(400).json({
      status: "error",
      message: "Passwords do not match.",
    });
  }

  if (String(newPassword).length < 6) {
    return res.status(400).json({
      status: "error",
      message: "Password must be at least 6 characters.",
    });
  }

  if (!hasDbConfig()) {
    return res.status(500).json({
      status: "error",
      message: "Database environment variables are missing.",
      missing: getMissingDbVars(),
    });
  }

  const session = forgotPasswordStore.get(normalizedEmail);
  if (!session || !session.verified || session.resetToken !== resetToken) {
    return res.status(401).json({
      status: "error",
      message: "Verification is required before resetting password.",
    });
  }

  if (session.expiresAt < Date.now()) {
    forgotPasswordStore.delete(normalizedEmail);
    return res.status(400).json({
      status: "error",
      message: "Reset session expired. Please request a new code.",
    });
  }

  try {
    await ensureAuthDatabaseReady();
    const pool = getDbPool();
    const passwordHash = await bcrypt.hash(String(newPassword), 12);

    const updateResult = await pool.query(
      `
      UPDATE users
      SET password_hash = $1
      WHERE id = $2
      RETURNING id
      `,
      [passwordHash, session.userId],
    );

    if (!updateResult.rows?.[0]) {
      return res.status(404).json({
        status: "error",
        message: "Account not found.",
      });
    }

    forgotPasswordStore.delete(normalizedEmail);

    return res.status(200).json({
      status: "ok",
      message: "Password reset successful.",
    });
  } catch (error) {
    return res.status(503).json({
      status: "error",
      message: `Unable to reset password (${error.message}).`,
    });
  }
});

app.get("/api/students/profile/:userId", async (req, res) => {
  const { userId } = req.params;

  if (!hasDbConfig()) {
    return res.status(500).json({
      status: "error",
      message: "Database environment variables are missing.",
      missing: getMissingDbVars(),
    });
  }

  try {
    await ensureAuthDatabaseReady();
    const pool = getDbPool();
    const result = await pool.query(
      `
      SELECT
        id,
        user_id,
        school_id,
        first_name,
        last_name,
        full_name,
        program,
        year_section,
        email,
        status,
        violation_count
      FROM "Students"
      WHERE user_id = $1
      LIMIT 1
      `,
      [userId],
    );

    const student = result.rows?.[0] || null;

    if (!student) {
      return res.status(404).json({
        status: "error",
        message: "Student profile not found.",
      });
    }

    return res.status(200).json({ status: "ok", student });
  } catch (error) {
    return res.status(503).json({
      status: "error",
      message: `Unable to load student profile (${error.message}).`,
    });
  }
});

app.put("/api/profile/admin", async (req, res) => {
  const { id, username, email, firstName, lastName } = req.body ?? {};

  if (!id) {
    return res.status(400).json({
      status: "error",
      message: "Admin user id is required.",
    });
  }

  if (!hasDbConfig()) {
    return res.status(500).json({
      status: "error",
      message: "Database environment variables are missing.",
      missing: getMissingDbVars(),
    });
  }

  try {
    await ensureAuthDatabaseReady();

    const pool = getDbPool();

    const userUpdate = await pool.query(
      `
      UPDATE users
      SET
        username = COALESCE(NULLIF($1, ''), username),
        first_name = $2,
        last_name = $3
      WHERE id = $4 AND role = 'admin'
      RETURNING id, username, role, first_name, last_name
      `,
      [
        username || null,
        firstName?.trim() || null,
        lastName?.trim() || null,
        id,
      ],
    );

    const updatedUser = Array.isArray(userUpdate.rows)
      ? userUpdate.rows[0]
      : null;

    if (!updatedUser) {
      return res.status(404).json({
        status: "error",
        message: "Admin profile not found.",
      });
    }

    const adminFirst = firstName?.trim() || "Admin";
    const adminLast = lastName?.trim() || "User";
    const fullName = `${adminFirst} ${adminLast}`.trim();

    const adminUpdate = await pool.query(
      `
      INSERT INTO "Admins" (user_id, email, first_name, last_name, full_name)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id) DO UPDATE
      SET
        email = EXCLUDED.email,
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        full_name = EXCLUDED.full_name
      RETURNING user_id, email, first_name, last_name, full_name
      `,
      [updatedUser.id, email, adminFirst, adminLast, fullName],
    );

    const updatedAdmin = adminUpdate.rows?.[0] || null;

    if (!updatedAdmin) {
      return res.status(404).json({
        status: "error",
        message: "Admin profile not found.",
      });
    }

    return res.status(200).json({
      status: "ok",
      user: {
        id: updatedUser.id,
        email: updatedAdmin.email,
        username: updatedUser.username,
        role: updatedUser.role,
        firstName: updatedAdmin.first_name || "",
        lastName: updatedAdmin.last_name || "",
        fullName: updatedAdmin.full_name || "",
      },
    });
  } catch (error) {
    return res.status(503).json({
      status: "error",
      message: `Unable to save admin profile (${error.message}).`,
    });
  }
});

app.put("/api/profile/student", async (req, res) => {
  const {
    id,
    username,
    schoolId,
    email,
    firstName,
    lastName,
    currentPassword,
    newPassword,
    confirmPassword,
  } = req.body ?? {};

  if (!id) {
    return res.status(400).json({
      status: "error",
      message: "Student user id is required.",
    });
  }

  if (!hasDbConfig()) {
    return res.status(500).json({
      status: "error",
      message: "Database environment variables are missing.",
      missing: getMissingDbVars(),
    });
  }

  try {
    await ensureAuthDatabaseReady();
    const pool = getDbPool();

    const existingUserResult = await pool.query(
      `
      SELECT id, username, password_hash, role
      FROM users
      WHERE id = $1 AND role = 'student'
      LIMIT 1
      `,
      [id],
    );

    const existingUser = existingUserResult.rows?.[0] || null;

    if (!existingUser) {
      return res.status(404).json({
        status: "error",
        message: "Student profile not found.",
      });
    }

    const wantsPasswordChange = Boolean(
      currentPassword || newPassword || confirmPassword,
    );

    if (wantsPasswordChange) {
      if (!currentPassword || !newPassword || !confirmPassword) {
        return res.status(400).json({
          status: "error",
          message:
            "Current password, new password, and confirm password are required to change password.",
        });
      }

      if (String(newPassword) !== String(confirmPassword)) {
        return res.status(400).json({
          status: "error",
          message: "New password and confirm password do not match.",
        });
      }

      if (String(newPassword).length < 6) {
        return res.status(400).json({
          status: "error",
          message: "New password must be at least 6 characters.",
        });
      }

      const isCurrentPasswordValid = await bcrypt.compare(
        String(currentPassword),
        existingUser.password_hash,
      );

      if (!isCurrentPasswordValid) {
        return res.status(401).json({
          status: "error",
          message: "Current password is incorrect.",
        });
      }
    }

    const cleanedFirst = String(firstName || "").trim();
    const cleanedLast = String(lastName || "").trim();
    const fullName = `${cleanedFirst} ${cleanedLast}`.trim();
    const normalizedEmail = String(email || "")
      .trim()
      .toLowerCase();
    const hashedNewPassword = wantsPasswordChange
      ? await bcrypt.hash(String(newPassword), 12)
      : null;

    const userUpdate = await pool.query(
      `
      UPDATE users
      SET
        username = COALESCE(NULLIF($1, ''), username),
        first_name = COALESCE(NULLIF($2, ''), first_name),
        last_name = COALESCE(NULLIF($3, ''), last_name),
        password_hash = COALESCE($4, password_hash)
      WHERE id = $5 AND role = 'student'
      RETURNING id, username, role, first_name, last_name
      `,
      [
        username || null,
        cleanedFirst || null,
        cleanedLast || null,
        hashedNewPassword,
        id,
      ],
    );

    const updatedUser = userUpdate.rows?.[0] || null;

    if (!updatedUser) {
      return res.status(404).json({
        status: "error",
        message: "Student profile not found.",
      });
    }

    const studentUpdate = await pool.query(
      `
      UPDATE "Students"
      SET
        school_id = COALESCE(NULLIF($1, ''), school_id),
        email = COALESCE(NULLIF($2, ''), email),
        first_name = COALESCE(NULLIF($3, ''), first_name),
        last_name = COALESCE(NULLIF($4, ''), last_name),
        full_name = COALESCE(NULLIF($5, ''), full_name)
      WHERE user_id = $6
      RETURNING id, user_id, school_id, email, first_name, last_name, full_name, program, year_section, violation_count
      `,
      [
        schoolId || null,
        normalizedEmail || null,
        cleanedFirst || null,
        cleanedLast || null,
        fullName || null,
        id,
      ],
    );

    const updatedStudent = studentUpdate.rows?.[0] || null;

    if (!updatedStudent) {
      return res.status(404).json({
        status: "error",
        message: "Student profile not found in Students table.",
      });
    }

    return res.status(200).json({
      status: "ok",
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        role: updatedUser.role,
        email: updatedStudent.email || "",
        firstName: updatedStudent.first_name || "",
        lastName: updatedStudent.last_name || "",
        fullName: updatedStudent.full_name || "",
        schoolId: updatedStudent.school_id || "",
        program: updatedStudent.program || "",
        yearSection: updatedStudent.year_section || "",
      },
    });
  } catch (error) {
    return res.status(503).json({
      status: "error",
      message: `Unable to save student profile (${error.message}).`,
    });
  }
});

app.get("/api/students", async (_req, res) => {
  if (!hasDbConfig()) {
    return res.status(500).json({
      status: "error",
      message: "Database environment variables are missing.",
      missing: getMissingDbVars(),
    });
  }

  try {
    await ensureAuthDatabaseReady();
    const pool = getDbPool();
    const result = await pool.query(`
      SELECT
        id,
        user_id,
        email,
        school_id,
        full_name,
        first_name,
        last_name,
        program,
        year_section,
        status,
        violation_count
      FROM "Students"
      ORDER BY id ASC
    `);

    return res.status(200).json({
      status: "ok",
      students: result.rows || [],
    });
  } catch (error) {
    return res.status(503).json({
      status: "error",
      message: `Unable to load students (${error.message}).`,
    });
  }
});

app.post("/api/students", async (req, res) => {
  const { schoolId, email, firstName, lastName, program, yearSection, status } =
    req.body ?? {};
  let createdUserId = null;
  let createdStudentId = null;

  if (
    !schoolId ||
    !email ||
    !firstName ||
    !lastName ||
    !program ||
    !yearSection
  ) {
    return res.status(400).json({
      status: "error",
      message:
        "schoolId, email, firstName, lastName, program, and yearSection are required.",
    });
  }

  if (!hasDbConfig()) {
    return res.status(500).json({
      status: "error",
      message: "Database environment variables are missing.",
      missing: getMissingDbVars(),
    });
  }

  try {
    await ensureAuthDatabaseReady();
    const pool = getDbPool();
    const normalizedStatus = status === "Irregular" ? "Irregular" : "Regular";
    const cleanedFirst = String(firstName).trim();
    const cleanedLast = String(lastName).trim();
    const fullName = `${cleanedFirst} ${cleanedLast}`.trim();
    const generatedUsername = await generateStudentUsername(
      pool,
      cleanedFirst,
      cleanedLast,
    );
    const generatedPassword = generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(generatedPassword, 12);

    const userInsert = await pool.query(
      `
      INSERT INTO users (username, password_hash, role, first_name, last_name, is_active)
      VALUES ($1, $2, 'student', $3, $4, TRUE)
      RETURNING id, username
      `,
      [generatedUsername, passwordHash, cleanedFirst, cleanedLast],
    );

    const userId = userInsert.rows?.[0]?.id;
    createdUserId = userId;

    const result = await pool.query(
      `
      INSERT INTO "Students"
        (user_id, email, school_id, first_name, last_name, full_name, program, year_section, status, violation_count)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0)
      RETURNING id, user_id, email, school_id, full_name, first_name, last_name, program, year_section, status, violation_count
      `,
      [
        userId,
        email.trim().toLowerCase(),
        schoolId.trim(),
        cleanedFirst,
        cleanedLast,
        fullName,
        program,
        yearSection,
        normalizedStatus,
      ],
    );
    createdStudentId = result.rows?.[0]?.id || null;

    const emailDelivery = await sendStudentCredentialEmail({
      toEmail: email.trim().toLowerCase(),
      firstName: cleanedFirst,
      username: generatedUsername,
      password: generatedPassword,
    });

    if (!emailDelivery.sent) {
      if (createdStudentId) {
        await pool.query(`DELETE FROM "Students" WHERE id = $1`, [
          createdStudentId,
        ]);
      }
      if (createdUserId) {
        await pool.query(
          `DELETE FROM users WHERE id = $1 AND role = 'student'`,
          [createdUserId],
        );
      }

      return res.status(503).json({
        status: "error",
        message: `Student was not created because credential email failed (${emailDelivery.reason || "unknown reason"}).`,
      });
    }

    return res.status(201).json({
      status: "ok",
      student: result.rows?.[0] || null,
      credentials: {
        username: generatedUsername,
        password: generatedPassword,
      },
      emailDelivery,
    });
  } catch (error) {
    // Best effort cleanup for partial inserts when DB write or mail delivery fails.
    const pool = getDbPool();
    if (pool) {
      try {
        if (createdStudentId) {
          await pool.query(`DELETE FROM "Students" WHERE id = $1`, [
            createdStudentId,
          ]);
        }
      } catch (_studentCleanupError) {
        // Ignore cleanup failure and continue response.
      }

      try {
        if (createdUserId) {
          await pool.query(
            `DELETE FROM users WHERE id = $1 AND role = 'student'`,
            [createdUserId],
          );
        }
      } catch (_userCleanupError) {
        // Ignore cleanup failure and continue response.
      }
    }

    return res.status(503).json({
      status: "error",
      message: `Unable to add student (${error.message}).`,
    });
  }
});

app.put("/api/students/:id", async (req, res) => {
  const { id } = req.params;
  const {
    schoolId,
    email,
    firstName,
    lastName,
    program,
    yearSection,
    status,
    violationCount,
  } = req.body ?? {};

  if (!hasDbConfig()) {
    return res.status(500).json({
      status: "error",
      message: "Database environment variables are missing.",
      missing: getMissingDbVars(),
    });
  }

  try {
    await ensureAuthDatabaseReady();
    const pool = getDbPool();

    const cleanedFirst = String(firstName || "").trim();
    const cleanedLast = String(lastName || "").trim();
    const fullName = `${cleanedFirst} ${cleanedLast}`.trim();

    const result = await pool.query(
      `
      UPDATE "Students"
      SET
        email = COALESCE(NULLIF($1, ''), email),
        school_id = COALESCE(NULLIF($2, ''), school_id),
        first_name = COALESCE(NULLIF($3, ''), first_name),
        last_name = COALESCE(NULLIF($4, ''), last_name),
        full_name = COALESCE(NULLIF($5, ''), full_name),
        program = COALESCE(NULLIF($6, ''), program),
        year_section = COALESCE(NULLIF($7, ''), year_section),
        status = COALESCE(NULLIF($8, ''), status),
        violation_count = COALESCE(GREATEST($9::int, 0), violation_count)
      WHERE id = $10
      RETURNING id, user_id, email, school_id, full_name, first_name, last_name, program, year_section, status, violation_count
      `,
      [
        email || null,
        schoolId || null,
        cleanedFirst || null,
        cleanedLast || null,
        fullName || null,
        program || null,
        yearSection || null,
        status || null,
        violationCount ?? null,
        id,
      ],
    );

    if (!result.rows?.[0]) {
      return res.status(404).json({
        status: "error",
        message: "Student not found.",
      });
    }

    return res.status(200).json({
      status: "ok",
      student: result.rows[0],
    });
  } catch (error) {
    return res.status(503).json({
      status: "error",
      message: `Unable to update student (${error.message}).`,
    });
  }
});

app.delete("/api/students/:id", async (req, res) => {
  const { id } = req.params;

  if (!hasDbConfig()) {
    return res.status(500).json({
      status: "error",
      message: "Database environment variables are missing.",
      missing: getMissingDbVars(),
    });
  }

  try {
    await ensureAuthDatabaseReady();
    const pool = getDbPool();
    const result = await pool.query(
      `DELETE FROM "Students" WHERE id = $1 RETURNING id, user_id`,
      [id],
    );

    if (!result.rows?.[0]) {
      return res.status(404).json({
        status: "error",
        message: "Student not found.",
      });
    }

    const deletedUserId = result.rows?.[0]?.user_id;
    if (deletedUserId) {
      await pool.query(`DELETE FROM users WHERE id = $1 AND role = 'student'`, [
        deletedUserId,
      ]);
    }

    return res.status(200).json({ status: "ok" });
  } catch (error) {
    return res.status(503).json({
      status: "error",
      message: `Unable to delete student (${error.message}).`,
    });
  }
});

// In production, serve the built frontend from the same Express app.
app.use(express.static(distPath));

app.get("/{*path}", (req, res, next) => {
  if (req.path.startsWith("/api/")) {
    return next();
  }

  return res.sendFile(path.join(distPath, "index.html"));
});

let server;
let authSyncPromise = null;

async function ensureAuthDatabaseReady() {
  if (!authSyncPromise) {
    const seedAccounts = getSeedAccountsFromEnv();
    authSyncPromise = (async () => {
      await syncAuthDatabase({ seedAccounts });
      await syncStudentsDatabase();
      await syncStudentsFromUsers();
    })();
  }

  try {
    await authSyncPromise;
  } catch (error) {
    authSyncPromise = null;
    throw error;
  }
}

async function startServer() {
  if (hasDbConfig()) {
    try {
      const seedAccounts = getSeedAccountsFromEnv();
      await ensureAuthDatabaseReady();
      console.log("Auth database synchronized.");
      if (seedAccounts.length === 0) {
        console.log("No account seed variables detected during startup.");
      }
    } catch (error) {
      console.error("Failed to synchronize auth database on startup.");
      console.error(error.message);
    }
  } else {
    console.warn(
      "Database variables are missing. Login API will not work until DB config is set.",
    );
  }

  server = app.listen(port, () => {
    console.log(`SVMS API running on port ${port}`);
  });
}

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

startServer();
