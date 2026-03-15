import "dotenv/config";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import nodemailer from "nodemailer";
import multer from "multer";
import fs from "node:fs";
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
  syncSystemSettingsDatabase,
  syncAuditLogsDatabase,
  syncViolationsDatabase,
  syncNotificationsDatabase,
  syncStudentViolationLogsDatabase,
} from "./db.js";
import { encryptImagePath, decryptImagePath } from "./encryption.js";

const app = express();
const port = Number(process.env.API_PORT || process.env.PORT || 3001);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.resolve(__dirname, "../dist");
const FORGOT_CODE_EXPIRY_MS = 10 * 60 * 1000;
const FORGOT_RESEND_COOLDOWN_MS = 15 * 1000;
const AUDIT_LOG_RETENTION_DAYS = 15;
const AUDIT_LOG_CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const forgotPasswordStore = new Map();

function getAuditActor(req) {
  const actorUserIdRaw = req.get("x-actor-user-id");
  const actorUserId = Number(actorUserIdRaw);
  const actorName =
    String(req.get("x-actor-name") || "").trim() || "Admin User";
  const actorRole =
    String(req.get("x-actor-role") || "admin").trim() || "admin";

  return {
    actorUserId: Number.isFinite(actorUserId) ? actorUserId : null,
    actorName,
    actorRole,
  };
}

async function logAuditEvent(
  req,
  { action, targetType, targetId = null, details = null, metadata = null },
) {
  try {
    if (!hasDbConfig()) {
      return;
    }

    const pool = getDbPool();
    if (!pool) {
      return;
    }

    const { actorUserId, actorName, actorRole } = getAuditActor(req);

    await pool.query(
      `
      INSERT INTO audit_logs (
        actor_user_id,
        actor_name,
        actor_role,
        action,
        target_type,
        target_id,
        details,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
      `,
      [
        actorUserId,
        actorName,
        actorRole,
        action,
        targetType,
        targetId ? String(targetId) : null,
        details,
        metadata ? JSON.stringify(metadata) : null,
      ],
    );
  } catch (error) {
    console.warn(`Audit log failed: ${error.message}`);
  }
}

async function purgeExpiredAuditLogs() {
  if (!hasDbConfig()) {
    return;
  }

  try {
    const pool = getDbPool();
    if (!pool) {
      return;
    }

    const result = await pool.query(
      `
      DELETE FROM audit_logs
      WHERE created_at < NOW() - ($1::text || ' days')::interval
      `,
      [String(AUDIT_LOG_RETENTION_DAYS)],
    );

    const removedCount = Number(result.rowCount || 0);
    if (removedCount > 0) {
      console.log(
        `Audit cleanup: removed ${removedCount} log(s) older than ${AUDIT_LOG_RETENTION_DAYS} days.`,
      );
    }
  } catch (error) {
    console.warn(`Audit cleanup failed: ${error.message}`);
  }
}

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

// Ensure uploads directory exists
const uploadsDir = path.join(path.dirname(__filename), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer configuration for file uploads with diskStorage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, `${name}-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage: storage,
  fileFilter: (_req, file, cb) => {
    // Accept any image MIME type
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed."));
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
});

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

    await logAuditEvent(req, {
      action: "UPDATE_ADMIN_PROFILE",
      targetType: "admin_profile",
      targetId: updatedUser.id,
      details: `Updated admin profile for ${updatedUser.username}.`,
      metadata: {
        username: updatedUser.username,
        email: updatedAdmin.email,
      },
    });

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
        s.id,
        s.user_id,
        u.username,
        s.email,
        s.school_id,
        s.full_name,
        s.first_name,
        s.last_name,
        s.program,
        s.year_section,
        s.status,
        s.violation_count
      FROM "Students" s
      LEFT JOIN users u ON u.id = s.user_id
      ORDER BY s.id ASC
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

    const createdStudent = result.rows?.[0] || null;
    await logAuditEvent(req, {
      action: "CREATE_STUDENT",
      targetType: "student",
      targetId: createdStudent?.id,
      details: `Added student ${createdStudent?.full_name || fullName}.`,
      metadata: {
        schoolId: createdStudent?.school_id || schoolId,
        program: createdStudent?.program || program,
        yearSection: createdStudent?.year_section || yearSection,
      },
    });

    return res.status(201).json({
      status: "ok",
      student: createdStudent,
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
    username,
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
    const normalizedUsername = String(username || "").trim();
    const normalizedSchoolId = String(schoolId || "").trim();
    const normalizedEmail = String(email || "")
      .trim()
      .toLowerCase();
    const normalizedProgram = String(program || "").trim();
    const normalizedYearSection = String(yearSection || "").trim();
    const normalizedStatus = String(status || "").trim();
    const fullName = `${cleanedFirst} ${cleanedLast}`.trim();

    if (username != null) {
      const existingStudent = await pool.query(
        `SELECT user_id FROM "Students" WHERE id = $1 LIMIT 1`,
        [id],
      );
      const userId = existingStudent.rows?.[0]?.user_id;

      if (userId) {
        await pool.query(
          `
          UPDATE users
          SET username = COALESCE(NULLIF($1, ''), username)
          WHERE id = $2 AND role = 'student'
          `,
          [normalizedUsername || null, userId],
        );
      }
    }

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
        normalizedEmail || null,
        normalizedSchoolId || null,
        cleanedFirst || null,
        cleanedLast || null,
        fullName || null,
        normalizedProgram || null,
        normalizedYearSection || null,
        normalizedStatus || null,
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

    const updatedStudent = result.rows[0];

    // Fetch username separately since RETURNING doesn't join users table.
    const userRow = updatedStudent.user_id
      ? await pool.query(`SELECT username FROM users WHERE id = $1 LIMIT 1`, [
          updatedStudent.user_id,
        ])
      : null;
    updatedStudent.username = userRow?.rows?.[0]?.username || null;

    await logAuditEvent(req, {
      action: "UPDATE_STUDENT",
      targetType: "student",
      targetId: updatedStudent.id,
      details: `Updated student ${updatedStudent.full_name}.`,
      metadata: {
        schoolId: updatedStudent.school_id,
        program: updatedStudent.program,
        yearSection: updatedStudent.year_section,
      },
    });

    return res.status(200).json({
      status: "ok",
      student: updatedStudent,
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
    const deletedStudentId = result.rows?.[0]?.id;
    if (deletedUserId) {
      await pool.query(`DELETE FROM users WHERE id = $1 AND role = 'student'`, [
        deletedUserId,
      ]);
    }

    await logAuditEvent(req, {
      action: "DELETE_STUDENT",
      targetType: "student",
      targetId: deletedStudentId,
      details: `Deleted student record #${deletedStudentId}.`,
      metadata: {
        userId: deletedUserId,
      },
    });

    return res.status(200).json({ status: "ok" });
  } catch (error) {
    return res.status(503).json({
      status: "error",
      message: `Unable to delete student (${error.message}).`,
    });
  }
});

async function refreshStudentViolationCount(pool, studentId) {
  await pool.query(
    `
    UPDATE "Students"
    SET violation_count = (
      SELECT COUNT(*)::int
      FROM student_violation_logs svl
      WHERE svl.student_id = $1 AND svl.cleared_at IS NULL
    )
    WHERE id = $1
    `,
    [studentId],
  );
}

// Returns a full violation record with student + violation catalog joined fields.
async function getFullViolationRecord(pool, id) {
  const result = await pool.query(
    `
    SELECT
      svl.id,
      svl.student_id,
      svl.violation_catalog_id,
      svl.violation_label,
      svl.reported_by,
      svl.remarks,
      svl.signature_image,
      svl.signature_updated_at,
      svl.cleared_at,
      svl.cleared_by_user_id,
      svl.cleared_by_name,
      svl.created_at,
      svl.updated_at,
      s.school_id,
      s.full_name,
      s.year_section,
      v.category AS violation_category,
      v.degree AS violation_degree,
      v.name AS violation_name
    FROM student_violation_logs svl
    INNER JOIN "Students" s ON s.id = svl.student_id
    LEFT JOIN violations v ON v.id = svl.violation_catalog_id
    WHERE svl.id = $1
    `,
    [id],
  );
  return result.rows?.[0] || null;
}

// ==================== STUDENT VIOLATION LOGS API ====================

app.get("/api/student-violations", async (_req, res) => {
  if (!hasDbConfig()) {
    return res.status(500).json({
      status: "error",
      message: "Database is not configured.",
    });
  }

  try {
    await ensureAuthDatabaseReady();
    const pool = getDbPool();

    const result = await pool.query(
      `
      SELECT
        svl.id,
        svl.student_id,
        svl.violation_catalog_id,
        svl.violation_label,
        svl.reported_by,
        svl.remarks,
        svl.signature_image,
        svl.signature_updated_at,
        svl.cleared_at,
        svl.cleared_by_user_id,
        svl.cleared_by_name,
        svl.created_at,
        svl.updated_at,
        s.school_id,
        s.full_name,
        s.year_section,
        v.category AS violation_category,
        v.degree AS violation_degree,
        v.name AS violation_name
      FROM student_violation_logs svl
      INNER JOIN "Students" s ON s.id = svl.student_id
      LEFT JOIN violations v ON v.id = svl.violation_catalog_id
      ORDER BY svl.created_at DESC, svl.id DESC
      `,
    );

    return res.status(200).json({
      status: "ok",
      records: result.rows || [],
    });
  } catch (error) {
    return res.status(503).json({
      status: "error",
      message: `Unable to load student violations (${error.message}).`,
    });
  }
});

app.get("/api/student-violations/me", async (req, res) => {
  if (!hasDbConfig()) {
    return res.status(500).json({
      status: "error",
      message: "Database is not configured.",
    });
  }

  try {
    await ensureAuthDatabaseReady();
    const pool = getDbPool();
    const userId = getCurrentUserId(req);

    if (!userId) {
      return res
        .status(400)
        .json({ status: "error", message: "User not identified." });
    }

    const result = await pool.query(
      `
      SELECT
        svl.id,
        svl.student_id,
        svl.violation_catalog_id,
        svl.violation_label,
        svl.reported_by,
        svl.remarks,
        svl.signature_image,
        svl.signature_updated_at,
        svl.cleared_at,
        svl.cleared_by_user_id,
        svl.cleared_by_name,
        svl.created_at,
        svl.updated_at,
        s.school_id,
        s.full_name,
        s.year_section,
        v.category AS violation_category,
        v.degree AS violation_degree,
        v.name AS violation_name
      FROM student_violation_logs svl
      INNER JOIN "Students" s ON s.id = svl.student_id
      LEFT JOIN violations v ON v.id = svl.violation_catalog_id
      WHERE s.user_id = $1
      ORDER BY svl.created_at DESC, svl.id DESC
      `,
      [userId],
    );

    return res.status(200).json({
      status: "ok",
      records: result.rows || [],
    });
  } catch (error) {
    return res.status(503).json({
      status: "error",
      message: `Unable to load your student violations (${error.message}).`,
    });
  }
});

app.post("/api/student-violations", async (req, res) => {
  const {
    studentId,
    violationCatalogId,
    violationLabel,
    reportedBy,
    remarks,
    signatureImage,
  } = req.body ?? {};

  const parsedStudentId = Number(studentId);
  const parsedCatalogId =
    violationCatalogId == null || violationCatalogId === ""
      ? null
      : Number(violationCatalogId);

  if (!Number.isFinite(parsedStudentId)) {
    return res.status(400).json({
      status: "error",
      message: "studentId is required.",
    });
  }

  if (!violationLabel || !String(violationLabel).trim()) {
    return res.status(400).json({
      status: "error",
      message: "violationLabel is required.",
    });
  }

  if (!hasDbConfig()) {
    return res.status(500).json({
      status: "error",
      message: "Database is not configured.",
    });
  }

  try {
    await ensureAuthDatabaseReady();
    const pool = getDbPool();

    const studentLookup = await pool.query(
      `SELECT id, user_id FROM "Students" WHERE id = $1 LIMIT 1`,
      [parsedStudentId],
    );

    if (!studentLookup.rows?.[0]) {
      return res.status(404).json({
        status: "error",
        message: "Student not found.",
      });
    }

    const insertResult = await pool.query(
      `
      INSERT INTO student_violation_logs
        (student_id, violation_catalog_id, violation_label, reported_by, remarks, signature_image, signature_updated_at)
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6::text,
        CASE WHEN $6::text IS NULL OR $6::text = '' THEN NULL ELSE NOW() END
      )
      RETURNING id, student_id, violation_catalog_id, violation_label, reported_by, remarks, signature_image,
                signature_updated_at, cleared_at, cleared_by_user_id, cleared_by_name, created_at, updated_at
      `,
      [
        parsedStudentId,
        Number.isFinite(parsedCatalogId) ? parsedCatalogId : null,
        String(violationLabel).trim(),
        String(reportedBy || "").trim() || null,
        String(remarks || "").trim() || null,
        String(signatureImage || "").trim() || null,
      ],
    );

    await refreshStudentViolationCount(pool, parsedStudentId);

    const created = insertResult.rows?.[0] || null;

    try {
      await createStudentNotificationForViolation(pool, parsedStudentId, {
        title: "New violation logged",
        description: `A new violation was logged for you: ${created?.violation_label || String(violationLabel).trim()}.`,
        metadata: {
          type: "student_violation_created",
          violationLogId: created?.id || null,
          studentId: parsedStudentId,
        },
      });
    } catch (notifErr) {
      console.warn("Failed to create student violation notification", notifErr);
    }

    await logAuditEvent(req, {
      action: "CREATE_STUDENT_VIOLATION_LOG",
      targetType: "student_violation",
      targetId: created?.id,
      details: `Logged violation for student #${parsedStudentId}.`,
      metadata: {
        studentId: parsedStudentId,
        violationCatalogId: Number.isFinite(parsedCatalogId)
          ? parsedCatalogId
          : null,
      },
    });

    const fullRecord = created
      ? await getFullViolationRecord(pool, created.id)
      : null;

    return res.status(201).json({
      status: "ok",
      record: fullRecord || created,
    });
  } catch (error) {
    return res.status(503).json({
      status: "error",
      message: `Unable to create student violation log (${error.message}).`,
    });
  }
});

app.put("/api/student-violations/:id", async (req, res) => {
  const { id } = req.params;
  const {
    reportedBy,
    remarks,
    violationCatalogId,
    violationLabel,
    dateLogged,
  } = req.body ?? {};

  if (!hasDbConfig()) {
    return res.status(500).json({
      status: "error",
      message: "Database is not configured.",
    });
  }

  try {
    await ensureAuthDatabaseReady();
    const pool = getDbPool();

    const parsedCatalogId =
      violationCatalogId == null || violationCatalogId === ""
        ? null
        : Number(violationCatalogId);

    // Parse dateLogged and create a new Date at midnight to preserve time zone
    let createdAtValue = null;
    if (dateLogged) {
      const parsed = new Date(dateLogged);
      if (!Number.isNaN(parsed.getTime())) {
        createdAtValue = parsed.toISOString();
      }
    }

    const result = await pool.query(
      `
      UPDATE student_violation_logs
      SET
        reported_by = COALESCE(NULLIF($1, ''), reported_by),
        remarks = COALESCE($2, remarks),
        violation_catalog_id = COALESCE($3, violation_catalog_id),
        violation_label = COALESCE(NULLIF($4, ''), violation_label),
        created_at = COALESCE($5, created_at)
      WHERE id = $6
      RETURNING id, student_id, violation_catalog_id, violation_label, reported_by, remarks, signature_image,
                signature_updated_at, cleared_at, cleared_by_user_id, cleared_by_name, created_at, updated_at
      `,
      [
        reportedBy == null ? "" : String(reportedBy).trim(),
        remarks == null ? null : String(remarks),
        Number.isFinite(parsedCatalogId) ? parsedCatalogId : null,
        violationLabel == null ? "" : String(violationLabel).trim(),
        createdAtValue,
        id,
      ],
    );

    const updated = result.rows?.[0] || null;
    if (!updated) {
      return res
        .status(404)
        .json({ status: "error", message: "Record not found." });
    }

    try {
      await createStudentNotificationForViolation(pool, updated.student_id, {
        title: "Violation record updated",
        description: `Your violation record was updated: ${updated.violation_label || "Violation"}.`,
        metadata: {
          type: "student_violation_updated",
          violationLogId: updated.id,
          studentId: updated.student_id,
        },
      });
    } catch (notifErr) {
      console.warn(
        "Failed to create student violation update notification",
        notifErr,
      );
    }

    await logAuditEvent(req, {
      action: "UPDATE_STUDENT_VIOLATION_LOG",
      targetType: "student_violation",
      targetId: updated.id,
      details: `Updated student violation log #${updated.id}.`,
    });

    const fullRecord = await getFullViolationRecord(pool, updated.id);

    return res
      .status(200)
      .json({ status: "ok", record: fullRecord || updated });
  } catch (error) {
    return res.status(503).json({
      status: "error",
      message: `Unable to update student violation log (${error.message}).`,
    });
  }
});

app.put("/api/student-violations/:id/signature", async (req, res) => {
  const { id } = req.params;
  const { signatureImage } = req.body ?? {};

  if (!signatureImage || !String(signatureImage).trim()) {
    return res.status(400).json({
      status: "error",
      message: "signatureImage is required.",
    });
  }

  if (!hasDbConfig()) {
    return res.status(500).json({
      status: "error",
      message: "Database is not configured.",
    });
  }

  try {
    await ensureAuthDatabaseReady();
    const pool = getDbPool();

    const result = await pool.query(
      `
      UPDATE student_violation_logs
      SET signature_image = $1,
          signature_updated_at = NOW()
      WHERE id = $2
      RETURNING id, student_id, violation_catalog_id, violation_label, reported_by, remarks, signature_image,
                signature_updated_at, cleared_at, cleared_by_user_id, cleared_by_name, created_at, updated_at
      `,
      [String(signatureImage).trim(), id],
    );

    const updated = result.rows?.[0] || null;
    if (!updated) {
      return res
        .status(404)
        .json({ status: "error", message: "Record not found." });
    }

    try {
      await createStudentNotificationForViolation(pool, updated.student_id, {
        title: "Violation signature updated",
        description: `A signature was attached/updated for: ${updated.violation_label || "Violation"}.`,
        metadata: {
          type: "student_violation_signature_updated",
          violationLogId: updated.id,
          studentId: updated.student_id,
        },
      });
    } catch (notifErr) {
      console.warn("Failed to create student signature notification", notifErr);
    }

    await logAuditEvent(req, {
      action: "ATTACH_STUDENT_VIOLATION_SIGNATURE",
      targetType: "student_violation",
      targetId: updated.id,
      details: `Attached signature for student violation log #${updated.id}.`,
    });

    const fullRecord = await getFullViolationRecord(pool, updated.id);

    return res
      .status(200)
      .json({ status: "ok", record: fullRecord || updated });
  } catch (error) {
    return res.status(503).json({
      status: "error",
      message: `Unable to save signature (${error.message}).`,
    });
  }
});

app.put("/api/student-violations/:id/clear", async (req, res) => {
  const { id } = req.params;
  const { actorUserId, actorName } = getAuditActor(req);

  if (!hasDbConfig()) {
    return res.status(500).json({
      status: "error",
      message: "Database is not configured.",
    });
  }

  try {
    await ensureAuthDatabaseReady();
    const pool = getDbPool();

    const result = await pool.query(
      `
      UPDATE student_violation_logs
      SET cleared_at = NOW(),
          cleared_by_user_id = $1,
          cleared_by_name = $2
      WHERE id = $3
      RETURNING id, student_id, violation_catalog_id, violation_label, reported_by, remarks, signature_image,
                signature_updated_at, cleared_at, cleared_by_user_id, cleared_by_name, created_at, updated_at
      `,
      [actorUserId, actorName, id],
    );

    const updated = result.rows?.[0] || null;
    if (!updated) {
      return res
        .status(404)
        .json({ status: "error", message: "Record not found." });
    }

    try {
      await createStudentNotificationForViolation(pool, updated.student_id, {
        title: "Violation marked as cleared",
        description: `A violation was marked cleared: ${updated.violation_label || "Violation"}.`,
        metadata: {
          type: "student_violation_cleared",
          violationLogId: updated.id,
          studentId: updated.student_id,
        },
      });
    } catch (notifErr) {
      console.warn("Failed to create cleared violation notification", notifErr);
    }

    await refreshStudentViolationCount(pool, updated.student_id);

    await logAuditEvent(req, {
      action: "CLEAR_STUDENT_VIOLATION_LOG",
      targetType: "student_violation",
      targetId: updated.id,
      details: `Cleared student violation log #${updated.id}.`,
      metadata: {
        clearedAt: updated.cleared_at,
      },
    });

    const fullRecord = await getFullViolationRecord(pool, updated.id);

    return res
      .status(200)
      .json({ status: "ok", record: fullRecord || updated });
  } catch (error) {
    return res.status(503).json({
      status: "error",
      message: `Unable to clear record (${error.message}).`,
    });
  }
});

app.put("/api/student-violations/:id/unclear", async (req, res) => {
  const { id } = req.params;

  if (!hasDbConfig()) {
    return res.status(500).json({
      status: "error",
      message: "Database is not configured.",
    });
  }

  try {
    await ensureAuthDatabaseReady();
    const pool = getDbPool();

    const result = await pool.query(
      `
      UPDATE student_violation_logs
      SET cleared_at = NULL,
          cleared_by_user_id = NULL,
          cleared_by_name = NULL
      WHERE id = $1
      RETURNING id, student_id, violation_catalog_id, violation_label, reported_by, remarks, signature_image,
                signature_updated_at, cleared_at, cleared_by_user_id, cleared_by_name, created_at, updated_at
      `,
      [id],
    );

    const updated = result.rows?.[0] || null;
    if (!updated) {
      return res
        .status(404)
        .json({ status: "error", message: "Record not found." });
    }

    try {
      await createStudentNotificationForViolation(pool, updated.student_id, {
        title: "Violation reopened",
        description: `A violation was reopened: ${updated.violation_label || "Violation"}.`,
        metadata: {
          type: "student_violation_uncleared",
          violationLogId: updated.id,
          studentId: updated.student_id,
        },
      });
    } catch (notifErr) {
      console.warn(
        "Failed to create reopened violation notification",
        notifErr,
      );
    }

    await refreshStudentViolationCount(pool, updated.student_id);

    await logAuditEvent(req, {
      action: "UNCLEAR_STUDENT_VIOLATION_LOG",
      targetType: "student_violation",
      targetId: updated.id,
      details: `Reopened student violation log #${updated.id}.`,
    });

    const fullRecord = await getFullViolationRecord(pool, updated.id);

    return res
      .status(200)
      .json({ status: "ok", record: fullRecord || updated });
  } catch (error) {
    return res.status(503).json({
      status: "error",
      message: `Unable to unclear record (${error.message}).`,
    });
  }
});

app.delete("/api/student-violations/:id", async (req, res) => {
  const { id } = req.params;

  if (!hasDbConfig()) {
    return res.status(500).json({
      status: "error",
      message: "Database is not configured.",
    });
  }

  try {
    await ensureAuthDatabaseReady();
    const pool = getDbPool();

    const result = await pool.query(
      `
      DELETE FROM student_violation_logs
      WHERE id = $1
      RETURNING id, student_id, violation_label
      `,
      [id],
    );

    const deleted = result.rows?.[0] || null;
    if (!deleted) {
      return res
        .status(404)
        .json({ status: "error", message: "Record not found." });
    }

    try {
      await createStudentNotificationForViolation(pool, deleted.student_id, {
        title: "Violation record removed",
        description: `A violation record was removed: ${deleted.violation_label || "Violation"}.`,
        metadata: {
          type: "student_violation_deleted",
          violationLogId: deleted.id,
          studentId: deleted.student_id,
        },
      });
    } catch (notifErr) {
      console.warn("Failed to create violation delete notification", notifErr);
    }

    await refreshStudentViolationCount(pool, deleted.student_id);

    await logAuditEvent(req, {
      action: "DELETE_STUDENT_VIOLATION_LOG",
      targetType: "student_violation",
      targetId: deleted.id,
      details: `Deleted student violation log #${deleted.id}.`,
    });

    return res.status(200).json({ status: "ok" });
  } catch (error) {
    return res.status(503).json({
      status: "error",
      message: `Unable to delete record (${error.message}).`,
    });
  }
});

// ==================== SYSTEM SETTINGS API ====================

// GET system settings
app.get("/api/settings", async (req, res) => {
  if (!hasDbConfig()) {
    return res.status(500).json({
      status: "error",
      message: "Database is not configured.",
    });
  }

  try {
    await ensureAuthDatabaseReady();
    const pool = getDbPool();
    const result = await pool.query(
      `SELECT id, setting_key, display_name, logo_path, theme, theme_color, updated_at
       FROM "SystemSettings"
       WHERE setting_key = 'system_config'
       LIMIT 1`,
    );

    if (!result.rows?.[0]) {
      return res.status(404).json({
        status: "error",
        message: "System settings not found.",
      });
    }

    const settings = result.rows[0];
    let decryptedLogoPath = null;
    if (settings.logo_path) {
      // try to decrypt; if result looks like a valid uploads path we use it.
      const tried = decryptImagePath(settings.logo_path);
      if (tried && tried.startsWith("/uploads")) {
        decryptedLogoPath = tried;
        // if the stored value wasn't already the encrypted form of the path,
        // replace it so future fetches don't need to decrypt again. this also
        // upgrades any records that were accidentally saved unencrypted.
        const shouldReencrypt = settings.logo_path !== encryptImagePath(tried);
        if (shouldReencrypt) {
          await pool.query(
            `UPDATE "SystemSettings" SET logo_path = $1 WHERE id = $2`,
            [encryptImagePath(tried), settings.id],
          );
        }
      } else {
        // decryption failed (old key issue) or the stored value wasn't an
        // uploads path at all; null out so UI doesn't try to render it.
        decryptedLogoPath = null;
      }
    }

    return res.status(200).json({
      status: "ok",
      settings: {
        id: settings.id,
        settingKey: settings.setting_key,
        displayName:
          settings.display_name || "Student Violation Management System",
        logoPath: decryptedLogoPath,
        theme: settings.theme || "dark",
        themeColor: settings.theme_color || "#000000",
        updatedAt: settings.updated_at,
      },
    });
  } catch (error) {
    return res.status(503).json({
      status: "error",
      message: `Unable to fetch settings (${error.message}).`,
    });
  }
});

// POST/PUT system settings (display name and theme)
app.post("/api/settings", async (req, res) => {
  const { displayName, theme, themeColor } = req.body ?? {};

  if (!hasDbConfig()) {
    return res.status(500).json({
      status: "error",
      message: "Database is not configured.",
    });
  }

  try {
    await ensureAuthDatabaseReady();
    const pool = getDbPool();

    const result = await pool.query(
      `UPDATE "SystemSettings"
       SET display_name = $1, theme = $2, theme_color = $3
       WHERE setting_key = 'system_config'
       RETURNING id, setting_key, display_name, logo_path, theme, theme_color, updated_at`,
      [
        displayName || "Student Violation Management System",
        theme || "dark",
        themeColor || "#000000",
      ],
    );

    if (!result.rows?.[0]) {
      return res.status(404).json({
        status: "error",
        message: "System settings not found.",
      });
    }

    const settings = result.rows[0];
    let decryptedLogoPath = null;
    if (settings.logo_path) {
      const tried = decryptImagePath(settings.logo_path);
      if (tried && tried.startsWith("/uploads")) {
        decryptedLogoPath = tried;
        const shouldReencrypt = settings.logo_path !== encryptImagePath(tried);
        if (shouldReencrypt) {
          await pool.query(
            `UPDATE "SystemSettings" SET logo_path = $1 WHERE id = $2`,
            [encryptImagePath(tried), settings.id],
          );
        }
      } else {
        decryptedLogoPath = null;
      }
    }

    await logAuditEvent(req, {
      action: "UPDATE_SYSTEM_SETTINGS",
      targetType: "system_settings",
      targetId: settings.id,
      details: "Updated system display name/theme settings.",
      metadata: {
        displayName: settings.display_name,
        theme: settings.theme,
        themeColor: settings.theme_color,
      },
    });

    return res.status(200).json({
      status: "ok",
      settings: {
        id: settings.id,
        settingKey: settings.setting_key,
        displayName: settings.display_name,
        logoPath: decryptedLogoPath,
        theme: settings.theme,
        themeColor: settings.theme_color,
        updatedAt: settings.updated_at,
      },
    });
  } catch (error) {
    return res.status(503).json({
      status: "error",
      message: `Unable to update settings (${error.message}).`,
    });
  }
});

// POST logo upload
app.post(
  "/api/settings/logo",
  (req, res, next) => {
    // wrap multer so we can catch its errors instead of letting them bubble
    upload.single("logo")(req, res, (err) => {
      if (err) {
        // multer errors are typically fileFilter or limit related
        return res.status(400).json({
          status: "error",
          message: err.message || "Invalid file upload.",
        });
      }
      next();
    });
  },
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        status: "error",
        message: "No file provided.",
      });
    }

    if (!hasDbConfig()) {
      return res.status(500).json({
        status: "error",
        message: "Database is not configured.",
      });
    }

    try {
      await ensureAuthDatabaseReady();
      const pool = getDbPool();

      // Construct the logo path and encrypt it for the database
      const logoPath = `/uploads/${req.file.filename}`;
      const encryptedPath = encryptImagePath(logoPath);

      const result = await pool.query(
        `UPDATE "SystemSettings"
       SET logo_path = $1
       WHERE setting_key = 'system_config'
       RETURNING id, setting_key, display_name, logo_path, theme, theme_color, updated_at`,
        [encryptedPath],
      );

      if (!result.rows?.[0]) {
        return res.status(404).json({
          status: "error",
          message: "System settings not found.",
        });
      }

      const settings = result.rows[0];

      await logAuditEvent(req, {
        action: "UPLOAD_LOGO",
        targetType: "system_settings",
        targetId: settings.id,
        details: "Uploaded a new system logo.",
        metadata: {
          logoPath,
        },
      });

      return res.status(200).json({
        status: "ok",
        message: "Logo uploaded successfully.",
        settings: {
          id: settings.id,
          settingKey: settings.setting_key,
          displayName: settings.display_name,
          logoPath: logoPath, // Return the actual (decrypted) path for display
          theme: settings.theme,
          themeColor: settings.theme_color,
          updatedAt: settings.updated_at,
        },
      });
    } catch (error) {
      return res.status(503).json({
        status: "error",
        message: `Unable to upload logo (${error.message}).`,
      });
    }
  },
);

// DELETE logo
app.delete("/api/settings/logo", async (req, res) => {
  if (!hasDbConfig()) {
    return res.status(500).json({
      status: "error",
      message: "Database is not configured.",
    });
  }

  try {
    await ensureAuthDatabaseReady();
    const pool = getDbPool();

    const result = await pool.query(
      `UPDATE "SystemSettings"
       SET logo_path = NULL
       WHERE setting_key = 'system_config'
       RETURNING id, setting_key, display_name, logo_path, theme, theme_color, updated_at`,
      [],
    );

    if (!result.rows?.[0]) {
      return res.status(404).json({
        status: "error",
        message: "System settings not found.",
      });
    }

    const settings = result.rows[0];

    await logAuditEvent(req, {
      action: "REMOVE_LOGO",
      targetType: "system_settings",
      targetId: settings.id,
      details: "Removed system logo.",
    });

    return res.status(200).json({
      status: "ok",
      message: "Logo removed successfully.",
      settings: {
        id: settings.id,
        settingKey: settings.setting_key,
        displayName: settings.display_name,
        logoPath: null,
        theme: settings.theme,
        themeColor: settings.theme_color,
        updatedAt: settings.updated_at,
      },
    });
  } catch (error) {
    return res.status(503).json({
      status: "error",
      message: `Unable to remove logo (${error.message}).`,
    });
  }
});

app.get("/api/audit-logs", async (req, res) => {
  if (!hasDbConfig()) {
    return res.status(500).json({
      status: "error",
      message: "Database is not configured.",
    });
  }

  const limitRaw = Number(req.query.limit);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(limitRaw, 1), 100)
    : 25;

  try {
    await ensureAuthDatabaseReady();
    const pool = getDbPool();
    const result = await pool.query(
      `
      SELECT
        id,
        actor_user_id,
        actor_name,
        actor_role,
        action,
        target_type,
        target_id,
        details,
        metadata,
        created_at
      FROM audit_logs
      ORDER BY created_at DESC, id DESC
      LIMIT $1
      `,
      [limit],
    );

    return res.status(200).json({
      status: "ok",
      logs: result.rows || [],
    });
  } catch (error) {
    return res.status(503).json({
      status: "error",
      message: `Unable to load audit logs (${error.message}).`,
    });
  }
});

// ==================== VIOLATIONS API ====================

// GET all violations
app.get("/api/violations", async (req, res) => {
  if (!hasDbConfig()) {
    return res.status(500).json({
      status: "error",
      message: "Database is not configured.",
    });
  }

  try {
    await ensureAuthDatabaseReady();
    const pool = getDbPool();
    const result = await pool.query(`
      SELECT id, category, degree, name, parent_id, created_at, updated_at
      FROM violations
      ORDER BY
        CASE degree
          WHEN 'First Degree' THEN 1
          WHEN 'Second Degree' THEN 2
          WHEN 'Third Degree' THEN 3
          WHEN 'Fourth Degree' THEN 4
          WHEN 'Fifth Degree' THEN 5
          WHEN 'Sixth Degree' THEN 6
          WHEN 'Seventh Degree' THEN 7
          ELSE 99
        END,
        COALESCE(parent_id, id),
        parent_id IS NOT NULL,
        created_at,
        id
    `);

    return res.status(200).json({
      status: "ok",
      violations: result.rows || [],
    });
  } catch (error) {
    return res.status(503).json({
      status: "error",
      message: `Unable to load violations (${error.message}).`,
    });
  }
});

// POST create new violation
app.post("/api/violations", async (req, res) => {
  const { category, degree, name, parentId, children } = req.body ?? {};

  if (!category || !degree || !name) {
    return res.status(400).json({
      status: "error",
      message: "category, degree, and name are required.",
    });
  }

  if (!hasDbConfig()) {
    return res.status(500).json({
      status: "error",
      message: "Database is not configured.",
    });
  }

  try {
    await ensureAuthDatabaseReady();
    const pool = getDbPool();

    // insert parent violation first
    const result = await pool.query(
      `
      INSERT INTO violations (category, degree, name, parent_id)
      VALUES ($1, $2, $3, $4)
      RETURNING id, category, degree, name, parent_id, created_at, updated_at
      `,
      [category, degree, name, parentId || null],
    );

    const parent = result.rows[0];

    // if children array provided, insert each as a child of the newly created parent
    if (Array.isArray(children) && children.length > 0) {
      for (const childName of children) {
        await pool.query(
          `
          INSERT INTO violations (category, degree, name, parent_id)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (category, degree, name) DO NOTHING
          `,
          [category, degree, childName, parent.id],
        );
      }
    }

    await logAuditEvent(req, {
      action: "CREATE_VIOLATION",
      targetType: "violation",
      targetId: parent.id,
      details: `Created violation ${parent.name}.`,
      metadata: {
        category,
        degree,
        childCount: Array.isArray(children) ? children.length : 0,
      },
    });

    // create notifications for all students informing them about the new violation
    try {
      const notifTitle = "New violation added";
      const notifDesc = `A new violation \"${parent.name}\" (${parent.category} / ${parent.degree}) has been added.`;
      await pool.query(
        `
        INSERT INTO notifications (student_user_id, title, description, metadata)
        SELECT u.id, $1, $2, $3
        FROM users u
        WHERE u.role = 'student'
        `,
        [
          notifTitle,
          notifDesc,
          JSON.stringify({ type: "violation_added", violationId: parent.id }),
        ],
      );
    } catch (notifErr) {
      console.warn("Failed to insert violation notifications", notifErr);
    }

    return res.status(201).json({
      status: "ok",
      violation: parent,
    });
  } catch (error) {
    return res.status(503).json({
      status: "error",
      message: `Unable to create violation (${error.message}).`,
    });
  }
});

// PUT update violation
app.put("/api/violations/:id", async (req, res) => {
  const { id } = req.params;
  const { category, degree, name, parentId, children } = req.body ?? {};

  if (!hasDbConfig()) {
    return res.status(500).json({
      status: "error",
      message: "Database is not configured.",
    });
  }

  try {
    await ensureAuthDatabaseReady();
    const pool = getDbPool();

    const result = await pool.query(
      `
      UPDATE violations
      SET category = COALESCE($1, category),
          degree = COALESCE($2, degree),
          name = COALESCE($3, name),
          parent_id = $4,
          updated_at = NOW()
      WHERE id = $5
      RETURNING id, category, degree, name, parent_id, created_at, updated_at
      `,
      [category || null, degree || null, name || null, parentId || null, id],
    );

    // if editing parent and children provided, wipe existing children then insert new list
    if (Array.isArray(children)) {
      await pool.query(`DELETE FROM violations WHERE parent_id = $1`, [id]);
      for (const childName of children) {
        await pool.query(
          `
          INSERT INTO violations (category, degree, name, parent_id)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (category, degree, name) DO NOTHING
          `,
          [
            category || result.rows[0].category,
            degree || result.rows[0].degree,
            childName,
            id,
          ],
        );
      }
    }

    if (!result.rows?.[0]) {
      return res.status(404).json({
        status: "error",
        message: "Violation not found.",
      });
    }

    await logAuditEvent(req, {
      action: "UPDATE_VIOLATION",
      targetType: "violation",
      targetId: result.rows[0].id,
      details: `Updated violation ${result.rows[0].name}.`,
      metadata: {
        category: result.rows[0].category,
        degree: result.rows[0].degree,
        childCount: Array.isArray(children) ? children.length : undefined,
      },
    });

    // notify students about the change
    try {
      const notifTitle = "Violation updated";
      const notifDesc = `The violation \"${result.rows[0].name}\" has been updated.`;
      await pool.query(
        `
        INSERT INTO notifications (student_user_id, title, description, metadata)
        SELECT u.id, $1, $2, $3
        FROM users u
        WHERE u.role = 'student'
        `,
        [
          notifTitle,
          notifDesc,
          JSON.stringify({
            type: "violation_updated",
            violationId: result.rows[0].id,
          }),
        ],
      );
    } catch (notifErr) {
      console.warn("Failed to insert violation update notifications", notifErr);
    }

    return res.status(200).json({
      status: "ok",
      violation: result.rows[0],
    });
  } catch (error) {
    return res.status(503).json({
      status: "error",
      message: `Unable to update violation (${error.message}).`,
    });
  }
});

// DELETE violation
app.delete("/api/violations/:id", async (req, res) => {
  const { id } = req.params;

  if (!hasDbConfig()) {
    return res.status(500).json({
      status: "error",
      message: "Database is not configured.",
    });
  }

  try {
    await ensureAuthDatabaseReady();
    const pool = getDbPool();

    // Fetch violation details before delete so we can notify students
    const violationRes = await pool.query(
      `SELECT id, category, degree, name FROM violations WHERE id = $1`,
      [id],
    );

    if (!violationRes.rows?.[0]) {
      return res.status(404).json({
        status: "error",
        message: "Violation not found.",
      });
    }

    const violation = violationRes.rows[0];

    // First delete children
    await pool.query(`DELETE FROM violations WHERE parent_id = $1`, [id]);

    // Then delete the violation
    const result = await pool.query(
      `DELETE FROM violations WHERE id = $1 RETURNING id`,
      [id],
    );

    if (!result.rows?.[0]) {
      return res.status(404).json({
        status: "error",
        message: "Violation not found.",
      });
    }

    await logAuditEvent(req, {
      action: "DELETE_VIOLATION",
      targetType: "violation",
      targetId: id,
      details: `Deleted violation ${violation.name} (ID: ${id}).`,
    });

    // Create a student notification for violation deletion
    try {
      const notifTitle = "Violation deleted";
      const notifDesc = `A violation has been removed: "${violation.name}" (${violation.category} / ${violation.degree}).`;
      await pool.query(
        `
        INSERT INTO notifications (student_user_id, title, description, metadata)
        SELECT u.id, $1, $2, $3
        FROM users u
        WHERE u.role = 'student'
        `,
        [
          notifTitle,
          notifDesc,
          JSON.stringify({
            type: "violation_deleted",
            violationId: id,
            violationName: violation.name,
          }),
        ],
      );
    } catch (notifErr) {
      console.warn("Failed to insert violation delete notifications", notifErr);
    }

    return res.status(200).json({ status: "ok" });
  } catch (error) {
    return res.status(503).json({
      status: "error",
      message: `Unable to delete violation (${error.message}).`,
    });
  }
});

// -----------------------------------------
// NOTIFICATIONS API (student-facing)
// -----------------------------------------

// helper to resolve current user from headers
function getCurrentUserId(req) {
  const { actorUserId } = getAuditActor(req);
  return actorUserId || null;
}

async function createStudentNotificationForViolation(
  pool,
  studentId,
  { title, description, metadata = null },
) {
  const parsedStudentId = Number(studentId);
  if (!Number.isFinite(parsedStudentId)) {
    return;
  }

  const studentLookup = await pool.query(
    `SELECT user_id FROM "Students" WHERE id = $1 LIMIT 1`,
    [parsedStudentId],
  );

  const studentUserId = Number(studentLookup.rows?.[0]?.user_id);
  if (!Number.isFinite(studentUserId)) {
    return;
  }

  await pool.query(
    `
    INSERT INTO notifications (student_user_id, title, description, metadata)
    VALUES ($1, $2, $3, $4::jsonb)
    `,
    [
      studentUserId,
      String(title || "Update"),
      String(description || "A record related to your violations was updated."),
      metadata ? JSON.stringify(metadata) : null,
    ],
  );
}

// GET notifications for logged-in student
app.get("/api/notifications", async (req, res) => {
  if (!hasDbConfig()) {
    return res.status(500).json({
      status: "error",
      message: "Database is not configured.",
    });
  }

  try {
    await ensureAuthDatabaseReady();
    const pool = getDbPool();
    const userId = getCurrentUserId(req);
    if (!userId) {
      return res
        .status(400)
        .json({ status: "error", message: "User not identified." });
    }

    const result = await pool.query(
      `
      SELECT id, title, description, metadata, created_at, read_at
      FROM notifications
      WHERE student_user_id = $1
      ORDER BY created_at DESC
      `,
      [userId],
    );

    return res
      .status(200)
      .json({ status: "ok", notifications: result.rows || [] });
  } catch (error) {
    return res.status(503).json({
      status: "error",
      message: `Unable to load notifications (${error.message}).`,
    });
  }
});

// count unread notifications
app.get("/api/notifications/unread-count", async (req, res) => {
  if (!hasDbConfig()) {
    return res
      .status(500)
      .json({ status: "error", message: "Database is not configured." });
  }

  try {
    await ensureAuthDatabaseReady();
    const pool = getDbPool();
    const userId = getCurrentUserId(req);
    if (!userId) {
      return res
        .status(400)
        .json({ status: "error", message: "User not identified." });
    }

    const result = await pool.query(
      `SELECT COUNT(*) AS count
       FROM notifications
       WHERE student_user_id = $1 AND read_at IS NULL`,
      [userId],
    );
    const count = Number(result.rows[0]?.count || 0);
    return res.status(200).json({ status: "ok", count });
  } catch (error) {
    return res.status(503).json({
      status: "error",
      message: `Unable to count notifications (${error.message}).`,
    });
  }
});

// mark all notifications as read
app.put("/api/notifications/mark-read-all", async (req, res) => {
  if (!hasDbConfig()) {
    return res
      .status(500)
      .json({ status: "error", message: "Database is not configured." });
  }

  try {
    await ensureAuthDatabaseReady();
    const pool = getDbPool();
    const userId = getCurrentUserId(req);
    if (!userId) {
      return res
        .status(400)
        .json({ status: "error", message: "User not identified." });
    }

    await pool.query(
      `UPDATE notifications SET read_at = NOW()
       WHERE student_user_id = $1 AND read_at IS NULL`,
      [userId],
    );

    return res.status(200).json({ status: "ok" });
  } catch (error) {
    return res.status(503).json({
      status: "error",
      message: `Unable to mark notifications read (${error.message}).`,
    });
  }
});

// mark specific notification as read
app.put("/api/notifications/:id/mark-read", async (req, res) => {
  if (!hasDbConfig()) {
    return res
      .status(500)
      .json({ status: "error", message: "Database is not configured." });
  }

  try {
    await ensureAuthDatabaseReady();
    const pool = getDbPool();
    const userId = getCurrentUserId(req);
    const { id } = req.params;
    if (!userId) {
      return res
        .status(400)
        .json({ status: "error", message: "User not identified." });
    }

    const result = await pool.query(
      `UPDATE notifications SET read_at = NOW()
       WHERE id = $1 AND student_user_id = $2 AND read_at IS NULL
       RETURNING id`,
      [id, userId],
    );

    if (!result.rows?.[0]) {
      return res.status(404).json({
        status: "error",
        message: "Notification not found or already read.",
      });
    }

    return res.status(200).json({ status: "ok" });
  } catch (error) {
    return res.status(503).json({
      status: "error",
      message: `Unable to mark notification read (${error.message}).`,
    });
  }
});

// In production, serve the built frontend from the same Express app.
app.use("/uploads", express.static(uploadsDir));
app.use(express.static(distPath));

app.get("/{*path}", (req, res, next) => {
  if (req.path.startsWith("/api/")) {
    return next();
  }

  return res.sendFile(path.join(distPath, "index.html"));
});

let server;
let authSyncPromise = null;
let auditCleanupTimer = null;

async function ensureAuthDatabaseReady() {
  if (!authSyncPromise) {
    const seedAccounts = getSeedAccountsFromEnv();
    authSyncPromise = (async () => {
      // Group 1: all independent — create base tables in parallel.
      await Promise.all([
        syncAuthDatabase({ seedAccounts }),
        syncStudentsDatabase(),
        syncSystemSettingsDatabase(),
        syncViolationsDatabase(),
        syncAuditLogsDatabase(),
      ]);

      // Group 2: depend on Group 1 tables — run in parallel after Group 1.
      await Promise.all([
        syncStudentsFromUsers(),
        syncNotificationsDatabase(),
        syncStudentViolationLogsDatabase(),
      ]);
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
  server = app.listen(port, () => {
    console.log(`SVMS API running on port ${port}`);
  });

  if (hasDbConfig()) {
    const seedAccounts = getSeedAccountsFromEnv();
    ensureAuthDatabaseReady()
      .then(() => {
        console.log("Auth database synchronized.");
        purgeExpiredAuditLogs();
        auditCleanupTimer = setInterval(() => {
          purgeExpiredAuditLogs();
        }, AUDIT_LOG_CLEANUP_INTERVAL_MS);

        if (seedAccounts.length === 0) {
          console.log("No account seed variables detected during startup.");
        }
      })
      .catch((error) => {
        console.error("Failed to synchronize auth database on startup.");
        console.error(error.message);
      });
  } else {
    console.warn(
      "Database variables are missing. Login API will not work until DB config is set.",
    );
  }
}

async function shutdown(signal) {
  console.log(`Received ${signal}, shutting down...`);

  if (auditCleanupTimer) {
    clearInterval(auditCleanupTimer);
    auditCleanupTimer = null;
  }

  if (!server) {
    await closeDbPool();
    process.exit(0);
    return;
  }

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
