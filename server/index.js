import "dotenv/config";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import nodemailer from "nodemailer";
import multer from "multer";
import path from "node:path";
import { access, readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";
import {
  default as dbSql,
  closeDbPool,
  getAppStateSnapshot,
  getSeedAccountsFromEnv,
  getDbPool,
  getMissingDbVars,
  hasDbConfig,
  recordProjectActivityHeartbeat,
  syncAppStateDatabase,
  syncAuthDatabase,
  isAuthSchemaCurrent,
  syncStudentsFromUsers,
  syncStudentsDatabase,
  syncSystemSettingsDatabase,
  syncAuditLogsDatabase,
  syncViolationsDatabase,
  syncNotificationsDatabase,
  syncPasswordResetDatabase,
  syncSuperAdminSecurityDatabase,
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
const SUPER_ADMIN_LOGIN_CODE_EXPIRY_MS = 10 * 60 * 1000;
const SUPER_ADMIN_LOGIN_RESEND_COOLDOWN_MS = 15 * 1000;
const SUPER_ADMIN_TRUSTED_DEVICE_TTL_MS =
  90 * 24 * 60 * 60 * 1000;
const AUDIT_LOG_RETENTION_DAYS = 15;
const AUDIT_LOG_CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const NOTIFICATION_RETENTION_DAYS = Number(
  process.env.NOTIFICATION_RETENTION_DAYS || 60,
);
const NOTIFICATION_CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const API_GET_CACHE_TTL_MS = Number(process.env.API_GET_CACHE_TTL_MS || 8000);
const API_GET_CACHE_MAX_ENTRIES = Number(
  process.env.API_GET_CACHE_MAX_ENTRIES || 400,
);
const VERCEL_SAFE_UPLOAD_LIMIT_BYTES = 4 * 1024 * 1024;
const HISTORICAL_VIOLATION_RECORDS_PATH = path.resolve(
  __dirname,
  "../ViolationRecords1.xlsx",
);
const HISTORICAL_VIOLATION_CACHE = {
  mtimeMs: 0,
  records: [],
};
const HISTORICAL_STUDENT_VIOLATION_COUNT_CACHE = {
  mtimeMs: 0,
  counts: new Map(),
};
const isServerlessRuntime =
  process.env.VERCEL === "1" ||
  process.env.AWS_LAMBDA_FUNCTION_NAME ||
  process.env.NODE_ENV === "serverless";
const isEnvEnabled = (value) =>
  ["1", "true", "yes", "on"].includes(
    String(value || "").trim().toLowerCase(),
  );
const shouldRunServerlessDbSync = isEnvEnabled(
  process.env.SVMS_ENABLE_SERVERLESS_DB_SYNC,
);
const shouldAllowServerlessWorkbookReads = isEnvEnabled(
  process.env.SVMS_ENABLE_SERVERLESS_WORKBOOK_READS,
);

function canReadHistoricalWorkbookFile() {
  return !isServerlessRuntime || shouldAllowServerlessWorkbookReads;
}

function assertHistoricalWorkbookWritable() {
  if (!isServerlessRuntime) {
    return;
  }

  const error = new Error(
    "Historical workbook records are read-only in the serverless deployment. Import them into the database to edit or delete them.",
  );
  error.code = "SERVERLESS_WORKBOOK_READONLY";
  throw error;
}

// Pusher client (optional) - configured via env vars
let pusherClient = null;
if (
  process.env.PUSHER_APP_ID &&
  process.env.PUSHER_KEY &&
  process.env.PUSHER_SECRET &&
  process.env.PUSHER_CLUSTER
) {
  try {
    const Pusher = (await import('pusher')).default;
    pusherClient = new Pusher({
      appId: String(process.env.PUSHER_APP_ID),
      key: String(process.env.PUSHER_KEY),
      secret: String(process.env.PUSHER_SECRET),
      cluster: String(process.env.PUSHER_CLUSTER),
      useTLS: true,
    });
  } catch (err) {
    console.warn('Pusher client not initialized:', err?.message || err);
  }
}

const apiGetResponseCache = new Map();

function buildApiGetCacheKey(req) {
  const actorUserId = String(req.headers["x-actor-user-id"] || "");
  const actorRole = String(req.headers["x-actor-role"] || "");
  return `${req.method}|${req.originalUrl}|${actorUserId}|${actorRole}`;
}

function evictApiGetCacheIfNeeded() {
  while (apiGetResponseCache.size > API_GET_CACHE_MAX_ENTRIES) {
    const oldest = apiGetResponseCache.keys().next();
    if (oldest.done) break;
    apiGetResponseCache.delete(oldest.value);
  }
}

function purgeExpiredApiGetCacheEntries() {
  const now = Date.now();
  for (const [key, entry] of apiGetResponseCache.entries()) {
    if (!entry || entry.expiresAt <= now) {
      apiGetResponseCache.delete(key);
    }
  }
}

const DEGREE_WORD_TO_RANK = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
};

const MONTH_LABELS_BY_SEMESTER = {
  "1ST SEM": ["Jun", "Jul", "Aug", "Sep", "Oct", "Nov"],
  "2ND SEM": ["Dec", "Jan", "Feb", "Mar", "Apr"],
  SUMMER: ["May"],
};

const SEMESTER_DISPLAY_MAP = {
  "1ST SEM": "1st Sem",
  "2ND SEM": "2nd Sem",
  SUMMER: "Summer",
};

function normalizeSemester(value) {
  const text = String(value || "")
    .trim()
    .toUpperCase();

  if (!text) return "";
  if (text.includes("SUM")) return "SUMMER";
  if (text.includes("1")) return "1ST SEM";
  if (text.includes("2")) return "2ND SEM";
  return "";
}

function normalizeSchoolYear(value) {
  const match = String(value || "")
    .trim()
    .match(/(\d{4})\s*-\s*(\d{4})/);

  if (!match) return "";
  return `${match[1]}-${match[2]}`;
}

function inferAcademicTermFromDate(dateInput) {
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) {
    return { semester: "", schoolYear: "" };
  }

  const year = date.getFullYear();
  const month = date.getMonth() + 1;

  if (month === 5) {
    return {
      semester: "SUMMER",
      schoolYear: `${year - 1}-${year}`,
    };
  }

  if (month >= 6) {
    return {
      semester: "1ST SEM",
      schoolYear: `${year}-${year + 1}`,
    };
  }

  return {
    semester: "2ND SEM",
    schoolYear: `${year - 1}-${year}`,
  };
}

function toMonthLabel(dateInput) {
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString("en-US", { month: "short" });
}

function parseDegreeRank(value) {
  const text = String(value || "")
    .trim()
    .toLowerCase();

  if (!text) return 1;

  const numericMatch = text.match(/(\d+)\s*(st|nd|rd|th)?\s*degree?/i);
  if (numericMatch) {
    const numericRank = Number(numericMatch[1]);
    if (Number.isFinite(numericRank) && numericRank >= 1) {
      return Math.min(7, numericRank);
    }
  }

  for (const [word, rank] of Object.entries(DEGREE_WORD_TO_RANK)) {
    if (text.includes(word)) {
      return rank;
    }
  }

  return 1;
}

function getRiskBucket(violationCount, maxDegreeRank) {
  if (violationCount >= 5 || (maxDegreeRank >= 5 && maxDegreeRank <= 7)) {
    return "highRiskStudents";
  }

  if (
    (violationCount >= 3 && violationCount <= 4) ||
    (maxDegreeRank >= 3 && maxDegreeRank <= 4)
  ) {
    return "atRiskStudents";
  }

  if (violationCount === 2 || maxDegreeRank === 2) {
    return "warningStudents";
  }

  return null;
}

function computePercentChange(currentValue, previousValue) {
  const current = Number(currentValue) || 0;
  const previous = Number(previousValue) || 0;

  if (previous === 0) {
    return current === 0 ? 0 : 100;
  }

  return Number((((current - previous) / previous) * 100).toFixed(1));
}

function getSemesterOrder(semester) {
  if (semester === "1ST SEM") return 1;
  if (semester === "2ND SEM") return 2;
  if (semester === "SUMMER") return 3;
  return 99;
}

function getSchoolYearStart(schoolYear) {
  const match = String(schoolYear || "").match(/^(\d{4})-/);
  return match ? Number(match[1]) : 0;
}

function buildTermKey(semester, schoolYear) {
  return `${schoolYear}|${semester}`;
}

function parseTermKey(termKey) {
  const [schoolYear = "", semester = ""] = String(termKey || "").split("|");
  return { schoolYear, semester };
}

function compareTermKeys(leftKey, rightKey) {
  const left = parseTermKey(leftKey);
  const right = parseTermKey(rightKey);

  const yearDiff =
    getSchoolYearStart(left.schoolYear) - getSchoolYearStart(right.schoolYear);
  if (yearDiff !== 0) return yearDiff;

  return getSemesterOrder(left.semester) - getSemesterOrder(right.semester);
}

function calculateLinearRegressionNextY(points) {
  if (!Array.isArray(points) || points.length === 0) {
    return 0;
  }

  if (points.length === 1) {
    return points[0]?.y || 0;
  }

  const n = points.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;

  points.forEach((point) => {
    sumX += point.x;
    sumY += point.y;
    sumXY += point.x * point.y;
    sumXX += point.x * point.x;
  });

  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) {
    return points[points.length - 1]?.y || 0;
  }

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;
  const nextX = points.length;

  return slope * nextX + intercept;
}

function calculateForecastCount(termSeries, nextSemester) {
  if (!Array.isArray(termSeries) || termSeries.length === 0) {
    return 0;
  }

  const values = termSeries.map((entry) => Number(entry.totalViolations) || 0);
  const lastValue = values[values.length - 1] || 0;

  const regressionPoints = termSeries.map((entry) => ({
    x: entry.index,
    y: entry.totalViolations,
  }));

  const regressionPrediction = Math.max(0, calculateLinearRegressionNextY(regressionPoints));

  const recentSlice = values.slice(-3);
  const recentWeights = [0.2, 0.3, 0.5].slice(3 - recentSlice.length);
  const recentWeightTotal = recentWeights.reduce((sum, weight) => sum + weight, 0) || 1;
  const recentPrediction = recentSlice.reduce(
    (sum, value, index) => sum + value * recentWeights[index],
    0,
  ) / recentWeightTotal;

  const sameSemesterCounts = termSeries
    .filter((entry) => parseTermKey(entry.termKey).semester === nextSemester)
    .map((entry) => Number(entry.totalViolations) || 0);

  const seasonalSlice = sameSemesterCounts.slice(-3);
  const seasonalWeights = [0.1, 0.3, 0.6].slice(3 - seasonalSlice.length);
  const seasonalWeightTotal = seasonalWeights.reduce((sum, weight) => sum + weight, 0) || 1;
  const sameSemesterBaseline = seasonalSlice.length
    ? seasonalSlice.reduce(
        (sum, value, index) => sum + value * seasonalWeights[index],
        0,
      ) / seasonalWeightTotal
    : null;

  const allTermBaseline = termSeries.length
    ? termSeries.reduce(
        (sum, entry) => sum + (Number(entry.totalViolations) || 0),
        0,
      ) / termSeries.length
    : 0;

  const baseline =
    sameSemesterBaseline != null ? sameSemesterBaseline : allTermBaseline;

  let regressionWeight = termSeries.length >= 6 ? 0.5 : termSeries.length >= 3 ? 0.35 : 0.2;
  let recentWeight = termSeries.length >= 6 ? 0.35 : termSeries.length >= 3 ? 0.5 : 0.7;
  let seasonalWeight = sameSemesterBaseline != null ? 0.15 : 0;

  const totalWeight = regressionWeight + recentWeight + seasonalWeight || 1;
  regressionWeight /= totalWeight;
  recentWeight /= totalWeight;
  seasonalWeight /= totalWeight;

  let forecast =
    regressionPrediction * regressionWeight +
    recentPrediction * recentWeight +
    (sameSemesterBaseline != null ? sameSemesterBaseline * seasonalWeight : 0);

  if (!Number.isFinite(forecast) || forecast < 0) {
    forecast = baseline;
  }

  const recentMax = recentSlice.length ? Math.max(...recentSlice) : lastValue;
  const upperBound = Math.max(
    baseline * 1.8,
    recentMax * 1.6,
    lastValue + Math.max(2, Math.sqrt(Math.max(lastValue, 0)) * 2),
  );
  const lowerBound = Math.max(0, Math.min(lastValue * 0.35, baseline * 0.35));
  forecast = Math.min(Math.max(forecast, lowerBound), upperBound);

  if (
    Math.round(forecast) === 0 &&
    termSeries.some((entry) => (Number(entry.totalViolations) || 0) > 0)
  ) {
    forecast = 1;
  }

  return Math.max(0, Math.round(forecast));
}

function parseCellDate(rawValue) {
  if (!rawValue) return null;

  if (rawValue instanceof Date) {
    return Number.isNaN(rawValue.getTime()) ? null : rawValue;
  }

  if (typeof rawValue === "object" && rawValue?.result instanceof Date) {
    return Number.isNaN(rawValue.result.getTime()) ? null : rawValue.result;
  }

  if (typeof rawValue === "number") {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const converted = new Date(excelEpoch.getTime() + rawValue * 86400000);
    return Number.isNaN(converted.getTime()) ? null : converted;
  }

  const normalizedText = String(rawValue || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.]/g, "/")
    .replace(/[-]/g, "/")
    .replace(/\/{2,}/g, "/")
    .replace(/\s+/g, " ");

  // Workbook dates are provided as day/month/year.
  const dmyMatch = normalizedText.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (dmyMatch) {
    const day = Number(dmyMatch[1]);
    const month = Number(dmyMatch[2]);
    const rawYear = String(dmyMatch[3]);
    const yearPart =
      rawYear.length === 2 ? 2000 + Number(rawYear) : Number(rawYear);

    if (day < 1 || day > 31 || month < 1 || month > 12) {
      return null;
    }

    const parsed = new Date(Date.UTC(yearPart, month - 1, day));
    // Guard invalid calendar dates (e.g., 31/02/2025).
    if (
      parsed.getUTCFullYear() !== yearPart ||
      parsed.getUTCMonth() !== month - 1 ||
      parsed.getUTCDate() !== day
    ) {
      return null;
    }

    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const ymdMatch = normalizedText.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (ymdMatch) {
    const yearPart = Number(ymdMatch[1]);
    const month = Number(ymdMatch[2]);
    const day = Number(ymdMatch[3]);
    if (day < 1 || day > 31 || month < 1 || month > 12) {
      return null;
    }
    const parsed = new Date(Date.UTC(yearPart, month - 1, day));
    if (
      parsed.getUTCFullYear() !== yearPart ||
      parsed.getUTCMonth() !== month - 1 ||
      parsed.getUTCDate() !== day
    ) {
      return null;
    }
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(normalizedText);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toArchiveTimestamp(value) {
  const parsedDate = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  // Store a midday UTC timestamp to preserve the same calendar day across time zones.
  return new Date(
    Date.UTC(
      parsedDate.getUTCFullYear(),
      parsedDate.getUTCMonth(),
      parsedDate.getUTCDate(),
      12,
      0,
      0,
      0,
    ),
  ).toISOString();
}

function parseCourseSection(value) {
  const text = String(value || "").trim();
  if (!text) {
    return { program: "", yearSection: "" };
  }

  const parts = text.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return { program: parts[0], yearSection: "" };
  }

  return {
    program: parts.slice(0, -1).join(" "),
    yearSection: parts[parts.length - 1],
  };
}

function normalizeWorkbookText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeWorkbookComparisonText(value) {
  return normalizeWorkbookText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeWorkbookPersonKey(value) {
  const text = normalizeWorkbookText(value);
  const commaMatch = text.match(/^([^,]+),\s*(.+)$/);
  const normalized = normalizeWorkbookComparisonText(
    commaMatch ? `${commaMatch[2]} ${commaMatch[1]}` : text,
  );
  if (!normalized) return "";

  // Drop 1-letter tokens so "Bjay M Pema" and "Bjay Pema" map to the same person key.
  const tokens = normalized
    .split(" ")
    .filter(Boolean)
    .filter((token) => token.length > 1);
  return tokens.join(" ");
}

function splitMiddleInitialFromFirstName(firstName, middleInitial) {
  const cleanedFirstName = String(firstName || "")
    .replace(/\s+/g, " ")
    .trim();
  const explicitMiddle = String(middleInitial || "")
    .replace(/\./g, "")
    .trim();

  if (!cleanedFirstName) {
    return {
      firstName: "",
      middleInitial: explicitMiddle
        ? explicitMiddle.charAt(0).toUpperCase()
        : "",
    };
  }

  const parts = cleanedFirstName.split(" ").filter(Boolean);
  const hasTrailingInitial =
    parts.length >= 2 &&
    /^[a-z]$/i.test(String(parts[parts.length - 1] || "").replace(/\./g, ""));
  const derivedMiddle = hasTrailingInitial
    ? String(parts[parts.length - 1] || "")
        .replace(/\./g, "")
        .toUpperCase()
    : "";
  const normalizedFirstName = hasTrailingInitial
    ? parts.slice(0, -1).join(" ")
    : cleanedFirstName;

  if (explicitMiddle) {
    return {
      firstName: formatStudentNameSegment(normalizedFirstName),
      middleInitial: explicitMiddle.charAt(0).toUpperCase(),
    };
  }

  if (parts.length >= 2) {
    const tail = String(parts[parts.length - 1] || "").replace(/\./g, "");
    if (/^[a-z]$/i.test(tail)) {
      return {
        firstName: formatStudentNameSegment(normalizedFirstName),
        middleInitial: derivedMiddle || tail.toUpperCase(),
      };
    }
  }

  return {
    firstName: formatStudentNameSegment(normalizedFirstName),
    middleInitial: "",
  };
}

function formatStudentNameSegment(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/(^|[\s'-])([a-z])/g, (_match, prefix, letter) => {
      return `${prefix}${letter.toUpperCase()}`;
    });
}

function formatStudentMiddleInitial(value) {
  return String(value || "")
    .trim()
    .replace(/\./g, "")
    .slice(0, 1)
    .toUpperCase();
}

function buildStudentFullName(firstName, middleInitial, lastName) {
  const cleanedFirst = formatStudentNameSegment(firstName);
  const cleanedMiddle = formatStudentMiddleInitial(middleInitial);
  const cleanedLast = formatStudentNameSegment(lastName);

  if (cleanedLast && cleanedFirst) {
    return `${cleanedLast}, ${[cleanedFirst, cleanedMiddle ? `${cleanedMiddle}.` : ""]
      .filter(Boolean)
      .join(" ")}`.trim();
  }

  return [cleanedFirst, cleanedMiddle ? `${cleanedMiddle}.` : "", cleanedLast]
    .filter(Boolean)
    .join(" ")
    .trim();
}

function formatWorkbookComparisonDate(value) {
  const parsedDate = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return "";
  }

  return parsedDate.toISOString().slice(0, 10);
}

function buildWorkbookImportKey(record) {
  const personKey = normalizeWorkbookPersonKey(record.studentName || record.student_name);
  const labelKey = normalizeWorkbookComparisonText(
    record.violationLabel || record.violation_label,
  );
  const semester = normalizeSemester(record.semester);
  const schoolYear = normalizeSchoolYear(record.schoolYear || record.school_year);
  const dateKey = formatWorkbookComparisonDate(
    record.date || record.original_created_at || record.archived_at,
  );

  return [personKey, labelKey, semester, schoolYear, dateKey].join("|");
}

async function resolveWorkbookStudentId(pool, studentName) {
  const normalizedStudentName = normalizeWorkbookText(studentName);
  if (!normalizedStudentName) {
    return null;
  }

  const normalizedNoPunctuation = normalizeWorkbookComparisonText(
    normalizedStudentName,
  );
  const commaMatch = normalizedStudentName.match(/^([^,]+),\s*(.+)$/);
  const swappedName = commaMatch
    ? normalizeWorkbookComparisonText(`${commaMatch[2]} ${commaMatch[1]}`)
    : "";
  const compactName = normalizedNoPunctuation.replace(/\s+/g, "");

  const result = await pool.query(
    `SELECT id
     FROM "Students"
     WHERE REGEXP_REPLACE(LOWER(TRIM(full_name)), '[^a-z0-9]+', ' ', 'g') = REGEXP_REPLACE(LOWER(TRIM($1)), '[^a-z0-9]+', ' ', 'g')
        OR REGEXP_REPLACE(LOWER(TRIM(full_name)), '[^a-z0-9]+', ' ', 'g') = $2
        OR REGEXP_REPLACE(LOWER(TRIM(full_name)), '[^a-z0-9]+', ' ', 'g') = $3
        OR REGEXP_REPLACE(LOWER(TRIM(CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, '')))), '[^a-z0-9]+', ' ', 'g') = REGEXP_REPLACE(LOWER(TRIM($1)), '[^a-z0-9]+', ' ', 'g')
        OR REGEXP_REPLACE(LOWER(TRIM(CONCAT(COALESCE(last_name, ''), ' ', COALESCE(first_name, '')))), '[^a-z0-9]+', ' ', 'g') = REGEXP_REPLACE(LOWER(TRIM($1)), '[^a-z0-9]+', ' ', 'g')
     LIMIT 1`,
    [
      normalizedStudentName,
      normalizedNoPunctuation,
      swappedName || compactName,
    ],
  );

  return result.rows?.[0]?.id || null;
}

function splitWorkbookStudentName(studentName) {
  const normalizedStudentName = normalizeWorkbookText(studentName);
  if (!normalizedStudentName) {
    return {
      firstName: "Historical",
      lastName: "Student",
      fullName: "Historical Student",
    };
  }

  const commaMatch = normalizedStudentName.match(/^([^,]+),\s*(.+)$/);
  if (commaMatch) {
    return {
      lastName: normalizeWorkbookText(commaMatch[1]) || "Historical",
      firstName: normalizeWorkbookText(commaMatch[2]) || "Student",
      fullName: normalizedStudentName,
    };
  }

  const parts = normalizedStudentName.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return {
      firstName: parts[0],
      lastName: "Student",
      fullName: normalizedStudentName,
    };
  }

  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts[parts.length - 1],
    fullName: normalizedStudentName,
  };
}

function buildImportedStudentEmail({ firstName, lastName, fallbackHash }) {
  const toLocalPart = (value) =>
    String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");

  const last = toLocalPart(lastName);
  const first = toLocalPart(firstName);
  const combined = [last, first].filter(Boolean).join("_");
  const safeLocalPart =
    combined || `imported_${toLocalPart(fallbackHash) || "student"}`;

  return `${safeLocalPart}@plpasig.edu.ph`;
}

async function getHistoricalWorkbookViolationCount(studentName) {
  const normalizedName = normalizeWorkbookComparisonText(studentName);
  if (!normalizedName) {
    return 0;
  }

  const records = await loadHistoricalViolationRecordsFromWorkbook();
  const cacheMtime = Number(HISTORICAL_VIOLATION_CACHE.mtimeMs || 0);

  if (
    HISTORICAL_STUDENT_VIOLATION_COUNT_CACHE.mtimeMs !== cacheMtime ||
    HISTORICAL_STUDENT_VIOLATION_COUNT_CACHE.counts.size === 0
  ) {
    const nextCounts = new Map();

    for (const record of records) {
      const key = normalizeWorkbookComparisonText(record.studentName);
      if (!key) {
        continue;
      }

      nextCounts.set(key, (nextCounts.get(key) || 0) + 1);
    }

    HISTORICAL_STUDENT_VIOLATION_COUNT_CACHE.mtimeMs = cacheMtime;
    HISTORICAL_STUDENT_VIOLATION_COUNT_CACHE.counts = nextCounts;
  }

  return (
    HISTORICAL_STUDENT_VIOLATION_COUNT_CACHE.counts.get(normalizedName) || 0
  );
}

async function getOrCreateHistoricalWorkbookStudent(pool, record) {
  const studentName = normalizeWorkbookText(record.studentName);
  if (!studentName) {
    throw new Error("Workbook row is missing a student name.");
  }

  const normalizedComparison = normalizeWorkbookComparisonText(studentName);
  const normalizedNoSpaces = normalizedComparison.replace(/\s+/g, "");
  const hashSource = normalizedComparison || studentName.toLowerCase();
  const hash = crypto
    .createHash("sha1")
    .update(hashSource)
    .digest("hex")
    .slice(0, 10)
    .toUpperCase();
  const studentParts = splitWorkbookStudentName(studentName);
  const generatedEmail = buildImportedStudentEmail({
    firstName: studentParts.firstName,
    lastName: studentParts.lastName,
    fallbackHash: hash.toLowerCase(),
  });
  const violationCount = await getHistoricalWorkbookViolationCount(studentName);

  const existingStudent = await pool.query(
    `SELECT id
     FROM "Students"
     WHERE REGEXP_REPLACE(LOWER(TRIM(full_name)), '[^a-z0-9]+', ' ', 'g') = REGEXP_REPLACE(LOWER(TRIM($1)), '[^a-z0-9]+', ' ', 'g')
        OR REGEXP_REPLACE(LOWER(TRIM(full_name)), '[^a-z0-9]+', ' ', 'g') = $2
        OR LOWER(email) = LOWER($3)
     LIMIT 1`,
    [studentName, normalizedNoSpaces, generatedEmail],
  );

  if (existingStudent.rows?.[0]?.id) {
    const existingStudentId = existingStudent.rows[0].id;

    await pool.query(
      `UPDATE "Students"
       SET email = CASE
             WHEN email IS NULL OR email = '' OR LOWER(email) LIKE 'historical-%@svms.local' THEN $2
             ELSE email
           END,
           first_name = COALESCE(NULLIF(first_name, ''), $3),
           last_name = COALESCE(NULLIF(last_name, ''), $4),
           full_name = COALESCE(NULLIF(full_name, ''), $5),
           school_id = NULL,
           violation_count = GREATEST(COALESCE($6, 0), 0),
           status = CASE
             WHEN status = 'Graduated' THEN 'Imported'
             ELSE status
           END,
           archived_reason = CASE
             WHEN archived_reason IS NULL OR archived_reason = '' OR archived_reason = 'Historical import' THEN 'IMPORTED'
             ELSE archived_reason
           END
       WHERE id = $1`,
      [
        existingStudentId,
        generatedEmail,
        studentParts.firstName,
        studentParts.lastName,
        studentParts.fullName,
        violationCount,
      ],
    );

    return existingStudentId;
  }

  const programText = normalizeWorkbookText(record.program) || "Historical";
  const yearSectionText =
    normalizeWorkbookText(record.yearSection) || "Unknown";
  const currentSemester = normalizeSemester(record.semester) || "1ST SEM";
  const currentSchoolYear =
    normalizeSchoolYear(record.schoolYear) || "2024-2025";

  const insertResult = await pool.query(
    `INSERT INTO "Students"
     (user_id, email, school_id, first_name, last_name, full_name, program, year_section, year_level, status, violation_count, is_archived, archived_reason, original_status, current_semester, current_school_year)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, TRUE, $12, $13, $14, $15)
     ON CONFLICT (email) DO UPDATE SET
       full_name = EXCLUDED.full_name,
       first_name = EXCLUDED.first_name,
       last_name = EXCLUDED.last_name,
       school_id = EXCLUDED.school_id,
       program = EXCLUDED.program,
       year_section = EXCLUDED.year_section,
       violation_count = EXCLUDED.violation_count,
       archived_reason = EXCLUDED.archived_reason,
       original_status = EXCLUDED.original_status,
       current_semester = EXCLUDED.current_semester,
       current_school_year = EXCLUDED.current_school_year
     RETURNING id`,
    [
      null,
      generatedEmail,
      null,
      studentParts.firstName,
      studentParts.lastName,
      studentParts.fullName,
      programText,
      yearSectionText,
      4,
      "Imported",
      violationCount,
      "IMPORTED",
      "Historical",
      currentSemester,
      currentSchoolYear,
    ],
  );

  return insertResult.rows?.[0]?.id || null;
}

function parseWorkbookTermHeader(rowValues) {
  const cells = rowValues
    .slice(1)
    .map((value) => normalizeWorkbookText(value))
    .filter(Boolean);

  if (cells.length === 0) {
    return null;
  }

  const firstText = cells.join(" ");
  const semesterMatch = firstText.match(/(1st|2nd) semester/i);
  const schoolYearMatch = firstText.match(/s\.?y\.?\s*(\d{4})\s*-\s*(\d{4})/i);

  if (!semesterMatch || !schoolYearMatch) {
    return null;
  }

  return {
    semester: semesterMatch[1].toUpperCase().startsWith("1")
      ? "1ST SEM"
      : "2ND SEM",
    schoolYear: `${schoolYearMatch[1]}-${schoolYearMatch[2]}`,
  };
}

function normalizeWorkbookViolationCategory(value) {
  const text = normalizeWorkbookComparisonText(value);
  if (!text) return "";
  if (text.startsWith("minor")) return "Minor Offenses";
  if (text.startsWith("major")) return "Major Offenses";
  return normalizeWorkbookText(value);
}

function normalizeWorkbookViolationDegree(value) {
  const normalizedText = normalizeWorkbookComparisonText(value);
  if (!normalizedText) return "";

  const degreeRankToLabel = {
    1: "First Degree",
    2: "Second Degree",
    3: "Third Degree",
    4: "Fourth Degree",
    5: "Fifth Degree",
    6: "Sixth Degree",
    7: "Seventh Degree",
  };

  return degreeRankToLabel[parseDegreeRank(value)] || normalizeWorkbookText(value);
}

function isLikelyWorkbookTypeLabel(value) {
  return /^(minor|major)\s*-\s*.+/i.test(String(value || "").trim());
}

function parseWorkbookTypeLabel(value) {
  const label = normalizeWorkbookText(value);
  if (!label) {
    return { category: "", degree: "", label: "" };
  }

  const parts = label.split(/\s*-\s*/);
  const category = normalizeWorkbookViolationCategory(parts[0] || "");
  const degree = normalizeWorkbookViolationDegree(parts.slice(1).join(" - "));

  return {
    category,
    degree,
    label:
      category && degree ? `${category} - ${degree}` : normalizeWorkbookText(label),
  };
}

async function loadHistoricalViolationRecordsFromWorkbook() {
  if (!canReadHistoricalWorkbookFile()) {
    return [];
  }

  try {
    await access(HISTORICAL_VIOLATION_RECORDS_PATH);
  } catch {
    return [];
  }

  try {
    const fileInfo = await stat(HISTORICAL_VIOLATION_RECORDS_PATH);
    if (
      Number.isFinite(HISTORICAL_VIOLATION_CACHE.mtimeMs) &&
      HISTORICAL_VIOLATION_CACHE.mtimeMs === fileInfo.mtimeMs &&
      Array.isArray(HISTORICAL_VIOLATION_CACHE.records) &&
      HISTORICAL_VIOLATION_CACHE.records.length > 0
    ) {
      return HISTORICAL_VIOLATION_CACHE.records;
    }

    const excelModule = await import("exceljs");
    const ExcelJS = excelModule.default || excelModule;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(HISTORICAL_VIOLATION_RECORDS_PATH);

    const worksheet = workbook.worksheets?.[0];
    if (!worksheet) {
      return [];
    }

    const headerRow = worksheet.getRow(1);
    const headerMap = {};
    headerRow.eachCell((cell, colNumber) => {
      const headerText = String(cell.value || "")
        .trim()
        .toUpperCase();
      if (headerText) {
        headerMap[headerText] = colNumber;
      }
    });

    const nameColumn = headerMap.NAME;
    const courseSectionColumn = headerMap["COURSE/SECTION"];
    const violationColumn = headerMap.VIOLATION;
    const dateColumn = headerMap.DATE;
    const typeColumn = headerMap.TYPE;

    if (!dateColumn) {
      return [];
    }

    const records = [];
    let currentSemester = "";
    let currentSchoolYear = "";

    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      const rowValues = row.values;
      const termHeader = parseWorkbookTermHeader(rowValues);
      if (termHeader) {
        currentSemester = termHeader.semester;
        currentSchoolYear = termHeader.schoolYear;
        continue;
      }

      const nameValue = normalizeWorkbookText(
        nameColumn ? row.getCell(nameColumn).value || "" : "",
      );
      const dateValue = parseCellDate(row.getCell(dateColumn).value);

      if (!dateValue || !nameValue) {
        continue;
      }

      const semester = normalizeSemester(currentSemester);
      const schoolYear = normalizeSchoolYear(currentSchoolYear);
      if (!semester || !schoolYear) {
        continue;
      }

      const studentKey = nameValue
        ? `name:${nameValue.toLowerCase()}`
        : `historical-row:${rowNumber}`;

      const courseSection = normalizeWorkbookText(
        courseSectionColumn ? row.getCell(courseSectionColumn).value || "" : "",
      );
      const { program, yearSection } = parseCourseSection(courseSection);
      const typeLabel = normalizeWorkbookText(
        typeColumn ? row.getCell(typeColumn).value || "" : "",
      );

      records.push({
        source: "historical",
        studentKey,
        studentName: nameValue,
        schoolId: "",
        program,
        yearSection,
        violationLabel: normalizeWorkbookText(
          violationColumn ? row.getCell(violationColumn).value || "" : "",
        ),
        typeLabel,
        degreeRank: parseDegreeRank(typeLabel),
        date: dateValue,
        monthLabel: toMonthLabel(dateValue),
        semester,
        schoolYear,
      });
    }

    HISTORICAL_VIOLATION_CACHE.mtimeMs = fileInfo.mtimeMs;
    HISTORICAL_VIOLATION_CACHE.records = records;

    return records;
  } catch (error) {
    console.warn(`Historical workbook read failed: ${error.message}`);
    return [];
  }
}

async function reconcileImportedWorkbookArchiveRecords(pool) {
  const workbookRecords = await loadHistoricalViolationRecordsFromWorkbook();
  if (!Array.isArray(workbookRecords) || workbookRecords.length === 0) {
    return { correctedCount: 0, scannedCount: 0, unmatchedCount: 0, unresolvedFixedCount: 0 };
  }

  const workbookRecordsByKey = new Map();
  workbookRecords.forEach((record) => {
    const key = buildWorkbookImportKey(record);
    if (!key) return;
    if (!workbookRecordsByKey.has(key)) {
      workbookRecordsByKey.set(key, []);
    }
    workbookRecordsByKey.get(key).push(record);
  });

  const importedResult = await pool.query(
    `SELECT
       sva.id,
       sva.student_id,
       sva.archived_at,
       sva.original_created_at,
       sva.original_updated_at,
       sva.violation_label,
       sva.reported_by,
       sva.source_import_key,
       sva.semester,
       sva.school_year,
        sva.is_unresolved,
       sva.violation_category,
       sva.violation_degree,
       sva.violation_type_label,
       s.full_name AS student_name
     FROM student_violation_archives sva
     LEFT JOIN "Students" s ON sva.student_id = s.id
     WHERE sva.remarks = 'IMPORTED'
     ORDER BY sva.id ASC`,
  );

  const importedRows = importedResult.rows || [];
  let correctedCount = 0;
  let unmatchedCount = 0;
  let unresolvedFixedCount = 0;

  for (const row of importedRows) {
    const key = buildWorkbookImportKey(row);
    const candidates = workbookRecordsByKey.get(key);

    if (!Array.isArray(candidates) || candidates.length === 0) {
      unmatchedCount += 1;
      if (row.is_unresolved) {
        await pool.query(
          `UPDATE student_violation_archives
           SET is_unresolved = FALSE,
               updated_at = NOW()
           WHERE id = $1`,
          [row.id],
        );
        unresolvedFixedCount += 1;
      }
      continue;
    }

    const matchedWorkbookRecord = candidates.shift();
    const expectedTimestamp = toArchiveTimestamp(matchedWorkbookRecord.date);
    const currentDateKey = formatWorkbookComparisonDate(row.archived_at);
    const expectedDateKey = formatWorkbookComparisonDate(expectedTimestamp);

    const { category, degree, label } = parseWorkbookTypeLabel(
      matchedWorkbookRecord.typeLabel,
    );
    const existingReportedBy = String(row.reported_by || "").trim();
    const nextReportedBy = isLikelyWorkbookTypeLabel(existingReportedBy)
      ? ""
      : existingReportedBy;
    const nextSemester = normalizeSemester(matchedWorkbookRecord.semester) || row.semester;
    const nextSchoolYear = normalizeSchoolYear(matchedWorkbookRecord.schoolYear) || row.school_year;
    const nextSourceImportKey = buildWorkbookImportKey(matchedWorkbookRecord) || String(row.source_import_key || "").trim();
    const shouldUpdate =
      expectedDateKey && currentDateKey !== expectedDateKey ||
      String(row.reported_by || "").trim() !== nextReportedBy ||
      String(row.semester || "").trim() !== String(nextSemester || "").trim() ||
      String(row.school_year || "").trim() !== String(nextSchoolYear || "").trim() ||
      String(row.source_import_key || "").trim() !== nextSourceImportKey ||
      String(row.violation_category || "").trim() !== category ||
      String(row.violation_degree || "").trim() !== degree ||
      String(row.violation_type_label || "").trim() !== label ||
      row.is_unresolved;

    if (!shouldUpdate) {
      continue;
    }

    await pool.query(
      `UPDATE student_violation_archives
       SET archived_at = COALESCE($1, archived_at),
           original_created_at = COALESCE($1, original_created_at),
           original_updated_at = COALESCE($1, original_updated_at),
           reported_by = $2,
           semester = $3,
           school_year = $4,
           source_import_key = $5,
           violation_category = $6,
           violation_degree = $7,
           violation_type_label = $8,
           is_unresolved = FALSE,
           updated_at = NOW()
       WHERE id = $9`,
      [
        expectedTimestamp,
        nextReportedBy,
        nextSemester,
        nextSchoolYear,
        nextSourceImportKey,
        category,
        degree,
        label,
        row.id,
      ],
    );
    correctedCount += 1;
    if (row.is_unresolved) {
      unresolvedFixedCount += 1;
    }
  }

  return {
    correctedCount,
    scannedCount: importedRows.length,
    unmatchedCount,
    unresolvedFixedCount,
  };
}

const ARCHIVE_MAINTENANCE_INTERVAL_MS = 10 * 60 * 1000;
let lastArchiveMaintenanceAt = 0;
let archiveMaintenanceInFlight = null;
let archiveColumnsEnsured = false;
let archiveColumnsEnsureInFlight = null;
const HISTORICAL_WORKBOOK_DB_SYNC_INTERVAL_MS = 10 * 60 * 1000;
let lastHistoricalWorkbookDbSyncAt = 0;
let historicalWorkbookDbSyncInFlight = null;

const VIOLATION_INFERENCE_CACHE_TTL_MS = 5 * 60 * 1000;
let violationInferenceCache = {
  loadedAt: 0,
  rows: [],
};

const isWorkbookBusyError = (error) => {
  const code = String(error?.code || "").toUpperCase();
  return code === "EBUSY" || Number(error?.errno) === -4082;
};

const delayMs = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

async function runWithWorkbookRetry(task, { attempts = 5, waitMs = 250 } = {}) {
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (!isWorkbookBusyError(error) || attempt === attempts) {
        break;
      }
      await delayMs(waitMs * attempt);
    }
  }

  if (isWorkbookBusyError(lastError)) {
    const lockedError = new Error(
      "ViolationRecords1.xlsx is currently busy or locked. Close the file and try again.",
    );
    lockedError.code = "EBUSY";
    throw lockedError;
  }

  throw lastError;
}

async function cleanupDuplicateArchivedViolations(pool) {
  const result = await pool.query(
    `WITH ranked AS (
       SELECT
         id,
         ROW_NUMBER() OVER (
           PARTITION BY
             student_id,
             COALESCE(violation_catalog_id, -1),
             LOWER(TRIM(COALESCE(violation_label, ''))),
             school_year,
             semester,
             archived_at::date,
             is_unresolved,
             COALESCE(TRIM(remarks), ''),
             COALESCE(TRIM(reported_by), ''),
             COALESCE(TRIM(signature_image), '')
           ORDER BY id ASC
         ) AS rn
       FROM student_violation_archives
     )
     DELETE FROM student_violation_archives sva
     USING ranked
     WHERE sva.id = ranked.id
       AND ranked.rn > 1
     RETURNING sva.id`,
  );

  return Number(result.rowCount || 0);
}

async function maybeRunArchiveMaintenance(pool) {
  const now = Date.now();
  if (now - lastArchiveMaintenanceAt < ARCHIVE_MAINTENANCE_INTERVAL_MS) {
    return {
      skipped: true,
      correctedCount: 0,
      duplicateRemovedCount: 0,
    };
  }

  if (archiveMaintenanceInFlight) {
    return archiveMaintenanceInFlight;
  }

  archiveMaintenanceInFlight = (async () => {
    console.log("Running archive workbook maintenance...");
    const [reconcileResult, duplicateRemovedCount] = await Promise.all([
      reconcileImportedWorkbookArchiveRecords(pool),
      cleanupDuplicateArchivedViolations(pool),
    ]);

    lastArchiveMaintenanceAt = Date.now();

    console.log("Archive workbook maintenance completed:", {
      correctedCount: Number(reconcileResult?.correctedCount || 0),
      unresolvedFixedCount: Number(reconcileResult?.unresolvedFixedCount || 0),
      duplicateRemovedCount,
    });

    return {
      skipped: false,
      correctedCount: Number(reconcileResult?.correctedCount || 0),
      duplicateRemovedCount,
      unresolvedFixedCount: Number(reconcileResult?.unresolvedFixedCount || 0),
    };
  })().finally(() => {
    archiveMaintenanceInFlight = null;
  });

  return archiveMaintenanceInFlight;
}

async function syncHistoricalWorkbookRecordsToDatabase(pool) {
  const workbookRecords = await loadHistoricalViolationRecordsFromWorkbook();
  if (!Array.isArray(workbookRecords) || workbookRecords.length === 0) {
    return {
      scannedCount: 0,
      importCount: 0,
      skippedCount: 0,
      createdStudentCount: 0,
    };
  }

  const existingImportsResult = await pool.query(
    `SELECT source_import_key
     FROM student_violation_archives
     WHERE remarks = 'IMPORTED'
       AND source_import_key IS NOT NULL
       AND TRIM(source_import_key) <> ''`,
  );
  const existingKeys = new Set(
    (existingImportsResult.rows || [])
      .map((row) => String(row.source_import_key || "").trim())
      .filter(Boolean),
  );

  let importCount = 0;
  let skippedCount = 0;
  let createdStudentCount = 0;

  for (const record of workbookRecords) {
    const normalizedSemester = normalizeSemester(record.semester);
    const normalizedSchoolYear = normalizeSchoolYear(record.schoolYear);
    const sourceImportKey = buildWorkbookImportKey(record);

    if (!normalizedSemester || !normalizedSchoolYear || !sourceImportKey) {
      skippedCount += 1;
      continue;
    }

    if (existingKeys.has(sourceImportKey)) {
      skippedCount += 1;
      continue;
    }

    let studentId = await resolveWorkbookStudentId(pool, record.studentName);
    if (!studentId) {
      studentId = await getOrCreateHistoricalWorkbookStudent(pool, record);
      createdStudentCount += 1;
    }

    const archivedAt = toArchiveTimestamp(record.date) || new Date().toISOString();
    const { category, degree, label } = parseWorkbookTypeLabel(record.typeLabel);

    const insertResult = await pool.query(
      `INSERT INTO student_violation_archives
       (student_id, violation_catalog_id, violation_label, reported_by, remarks, source_import_key,
        signature_image, signature_updated_at, semester, school_year, is_unresolved,
        archived_by_user_id, archived_by_name, original_created_at, original_updated_at,
        violation_category, violation_degree, violation_type_label)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       RETURNING id`,
      [
        studentId,
        null,
        record.violationLabel || "",
        "",
        "IMPORTED",
        sourceImportKey,
        "",
        null,
        normalizedSemester,
        normalizedSchoolYear,
        false,
        null,
        "System",
        archivedAt,
        archivedAt,
        category,
        degree,
        label,
      ],
    );

    if (insertResult.rows?.[0]?.id) {
      existingKeys.add(sourceImportKey);
      importCount += 1;
      continue;
    }

    skippedCount += 1;
  }

  return {
    scannedCount: workbookRecords.length,
    importCount,
    skippedCount,
    createdStudentCount,
  };
}

async function maybeSyncHistoricalWorkbookRecordsToDatabase(
  pool,
  { force = false } = {},
) {
  if (!canReadHistoricalWorkbookFile()) {
    return {
      skipped: true,
      scannedCount: 0,
      importCount: 0,
      skippedCount: 0,
      createdStudentCount: 0,
    };
  }

  const now = Date.now();
  if (
    !force &&
    now - lastHistoricalWorkbookDbSyncAt < HISTORICAL_WORKBOOK_DB_SYNC_INTERVAL_MS
  ) {
    return {
      skipped: true,
      scannedCount: 0,
      importCount: 0,
      skippedCount: 0,
      createdStudentCount: 0,
    };
  }

  if (historicalWorkbookDbSyncInFlight) {
    return historicalWorkbookDbSyncInFlight;
  }

  historicalWorkbookDbSyncInFlight = (async () => {
    const syncResult = await syncHistoricalWorkbookRecordsToDatabase(pool);
    lastHistoricalWorkbookDbSyncAt = Date.now();
    return {
      skipped: false,
      ...syncResult,
    };
  })().finally(() => {
    historicalWorkbookDbSyncInFlight = null;
  });

  return historicalWorkbookDbSyncInFlight;
}

async function getViolationCandidatesForInference(pool) {
  const now = Date.now();
  if (
    Array.isArray(violationInferenceCache.rows) &&
    violationInferenceCache.rows.length > 0 &&
    now - violationInferenceCache.loadedAt < VIOLATION_INFERENCE_CACHE_TTL_MS
  ) {
    return violationInferenceCache.rows;
  }

  const result = await pool.query(
    `SELECT id, category, degree, name FROM violations`,
  );

  const rows = (result.rows || []).map((row) => {
    const normalizedName = normalizeWorkbookComparisonText(row.name || "");
    const tokens = normalizedName.split(" ").filter(Boolean);
    return {
      ...row,
      normalizedName,
      tokens,
    };
  });

  violationInferenceCache = {
    loadedAt: now,
    rows,
  };

  return rows;
}

function inferClosestViolationByKeywords(violationLabel, candidates) {
  const normalizedLabel = normalizeWorkbookComparisonText(violationLabel || "");
  if (!normalizedLabel) return null;

  const labelTokens = normalizedLabel.split(" ").filter(Boolean);
  if (labelTokens.length === 0) return null;

  let best = null;
  let bestScore = 0;

  for (const candidate of candidates || []) {
    if (!candidate?.normalizedName) continue;

    let score = 0;
    if (candidate.normalizedName === normalizedLabel) {
      score += 5;
    }
    if (candidate.normalizedName.includes(normalizedLabel)) {
      score += 2;
    }
    if (normalizedLabel.includes(candidate.normalizedName)) {
      score += 1.5;
    }

    const tokenSet = new Set(candidate.tokens || []);
    let overlap = 0;
    for (const token of labelTokens) {
      if (tokenSet.has(token)) overlap += 1;
    }
    score += overlap / Math.max(labelTokens.length, 1);

    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return bestScore >= 1.15 ? best : null;
}

function enrichArchiveViolationRow(row, violationMatch) {
  const remarksText = String(row?.remarks || "").trim();
  const isImported = remarksText.toUpperCase() === "IMPORTED";
  const hasCategory = String(row?.violation_category || "").trim();
  const hasDegree = String(row?.violation_degree || "").trim();

  return {
    ...row,
    violation_catalog_id:
      row?.violation_catalog_id ?? violationMatch?.id ?? null,
    violation_category: hasCategory || violationMatch?.category || "",
    violation_degree: hasDegree || violationMatch?.degree || "",
    violation_type_label:
      hasCategory && hasDegree
        ? `${hasCategory} - ${hasDegree}`
        : violationMatch?.category && violationMatch?.degree
          ? `${violationMatch.category} - ${violationMatch.degree}`
          : "",
    remarks: remarksText || (isImported ? "IMPORTED" : ""),
  };
}

async function deleteHistoricalWorkbookRecordById(workbookId) {
  assertHistoricalWorkbookWritable();

  if (typeof workbookId !== "string" || !workbookId.startsWith("wb-")) {
    return false;
  }

  const chunks = workbookId.split("-");
  if (chunks.length < 5) {
    return false;
  }

  const indexString = chunks.pop();
  const index = Number(indexString);
  if (!Number.isFinite(index) || index < 0) {
    return false;
  }

  const schoolYear = `${chunks[1]}-${chunks[2]}`;
  const semester = chunks.slice(3).join("-");

  try {
    const excelModule = await import("exceljs");
    const ExcelJS = excelModule.default || excelModule;

    const { workbook, worksheet } = await runWithWorkbookRetry(async () => {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(HISTORICAL_VIOLATION_RECORDS_PATH);
      return { workbook: wb, worksheet: wb.worksheets?.[0] };
    });

    if (!worksheet) {
      return false;
    }

    const headerRow = worksheet.getRow(1);
    const headerMap = {};
    headerRow.eachCell((cell, colNumber) => {
      const headerText = String(cell.value || "")
        .trim()
        .toUpperCase();
      if (headerText) {
        headerMap[headerText] = colNumber;
      }
    });

    const dateColumn = headerMap.DATE;
    const nameColumn = headerMap.NAME;

    if (!dateColumn) {
      return false;
    }

    let currentSemester = "";
    let currentSchoolYear = "";
    let workbookIndex = 0;
    let deleteRowNumber = null;

    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      const rowValues = row.values;
      const termHeader = parseWorkbookTermHeader(rowValues);
      if (termHeader) {
        currentSemester = termHeader.semester;
        currentSchoolYear = termHeader.schoolYear;
        continue;
      }

      const nameValue = normalizeWorkbookText(
        nameColumn ? row.getCell(nameColumn).value || "" : "",
      );
      const dateValue = parseCellDate(row.getCell(dateColumn).value);

      if (!dateValue || !nameValue) {
        continue;
      }

      const normalizedSemester = normalizeSemester(currentSemester);
      const normalizedSchoolYear = normalizeSchoolYear(currentSchoolYear);
      if (!normalizedSemester || !normalizedSchoolYear) {
        continue;
      }

      if (
        normalizeSchoolYear(schoolYear) === normalizedSchoolYear &&
        normalizeSemester(semester) === normalizedSemester
      ) {
        if (workbookIndex === index) {
          deleteRowNumber = rowNumber;
          break;
        }
        workbookIndex += 1;
      }
    }

    if (deleteRowNumber === null) {
      return false;
    }

    worksheet.spliceRows(deleteRowNumber, 1);
    await runWithWorkbookRetry(async () => {
      await workbook.xlsx.writeFile(HISTORICAL_VIOLATION_RECORDS_PATH);
    });
    HISTORICAL_VIOLATION_CACHE.mtimeMs = 0;
    HISTORICAL_VIOLATION_CACHE.records = [];
    HISTORICAL_STUDENT_VIOLATION_COUNT_CACHE.mtimeMs = 0;
    HISTORICAL_STUDENT_VIOLATION_COUNT_CACHE.counts = new Map();

    return true;
  } catch (error) {
    if (isWorkbookBusyError(error)) {
      throw error;
    }
    console.error("Failed to delete historical workbook record:", error);
    return false;
  }
}

async function ensureArchiveColumnsExist(pool) {
  if (archiveColumnsEnsured) {
    return;
  }

  if (archiveColumnsEnsureInFlight) {
    return archiveColumnsEnsureInFlight;
  }

  archiveColumnsEnsureInFlight = (async () => {
    try {
      await pool.query(`ALTER TABLE student_violation_archives ADD COLUMN IF NOT EXISTS violation_category text`);
      await pool.query(`ALTER TABLE student_violation_archives ADD COLUMN IF NOT EXISTS violation_degree text`);
      await pool.query(`ALTER TABLE student_violation_archives ADD COLUMN IF NOT EXISTS violation_type_label text`);
      archiveColumnsEnsured = true;
    } catch (err) {
      console.warn('Could not ensure archive columns exist:', err.message || err);
    } finally {
      archiveColumnsEnsureInFlight = null;
    }
  })();

  return archiveColumnsEnsureInFlight;
}

async function deleteHistoricalWorkbookRecordsBySchoolYear(schoolYear) {
  assertHistoricalWorkbookWritable();

  try {
    const excelModule = await import("exceljs");
    const ExcelJS = excelModule.default || excelModule;
    const { workbook, worksheet } = await runWithWorkbookRetry(async () => {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(HISTORICAL_VIOLATION_RECORDS_PATH);
      return { workbook: wb, worksheet: wb.worksheets?.[0] };
    });

    if (!worksheet) {
      return 0; // No workbook records
    }

    const headerRow = worksheet.getRow(1);
    const headerMap = {};
    headerRow.eachCell((cell, colNumber) => {
      const headerText = String(cell.value || "")
        .trim()
        .toUpperCase();
      if (headerText) {
        headerMap[headerText] = colNumber;
      }
    });

    const dateColumn = headerMap.DATE;
    if (!dateColumn) {
      return 0;
    }

    let currentSemester = "";
    let currentSchoolYear = "";
    let deletedCount = 0;
    const rowsToDelete = [];

    // Collect all rows to delete for this school year
    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      const rowValues = row.values;
      const termHeader = parseWorkbookTermHeader(rowValues);
      if (termHeader) {
        currentSemester = termHeader.semester;
        currentSchoolYear = termHeader.schoolYear;
        continue;
      }

      const dateValue = parseCellDate(row.getCell(dateColumn).value);
      if (!dateValue) {
        continue;
      }

      const normalizedSchoolYear = normalizeSchoolYear(currentSchoolYear);
      if (normalizeSchoolYear(schoolYear) === normalizedSchoolYear) {
        rowsToDelete.push(rowNumber);
      }
    }

    // Delete rows in reverse order to maintain row numbers
    for (let i = rowsToDelete.length - 1; i >= 0; i--) {
      worksheet.spliceRows(rowsToDelete[i], 1);
      deletedCount++;
    }

    if (deletedCount > 0) {
      await runWithWorkbookRetry(async () => {
        await workbook.xlsx.writeFile(HISTORICAL_VIOLATION_RECORDS_PATH);
      });
      HISTORICAL_VIOLATION_CACHE.mtimeMs = 0;
      HISTORICAL_VIOLATION_CACHE.records = [];
      HISTORICAL_STUDENT_VIOLATION_COUNT_CACHE.mtimeMs = 0;
      HISTORICAL_STUDENT_VIOLATION_COUNT_CACHE.counts = new Map();
    }

    return deletedCount;
  } catch (error) {
    if (isWorkbookBusyError(error)) {
      throw error;
    }
    if (error?.code === "SERVERLESS_WORKBOOK_READONLY") {
      throw error;
    }
    console.error(
      "Failed to delete historical workbook records by school year:",
      error,
    );
    return 0;
  }
}

function buildAnalyticsFromRecords({
  allRecords,
  currentSemester,
  currentSchoolYear,
}) {
  const termMap = new Map();

  allRecords.forEach((record) => {
    const semester = normalizeSemester(record.semester);
    const schoolYear = normalizeSchoolYear(record.schoolYear);
    const date = new Date(record.date);

    if (!semester || !schoolYear || Number.isNaN(date.getTime())) {
      return;
    }

    const termKey = buildTermKey(semester, schoolYear);
    if (!termMap.has(termKey)) {
      termMap.set(termKey, {
        semester,
        schoolYear,
        violations: 0,
        students: new Map(),
      });
    }

    const bucket = termMap.get(termKey);
    bucket.violations += 1;

    const studentKey = String(record.studentKey || "").trim();
    if (!studentKey) {
      return;
    }

    if (!bucket.students.has(studentKey)) {
      bucket.students.set(studentKey, { count: 0, maxDegreeRank: 0 });
    }

    const studentStats = bucket.students.get(studentKey);
    studentStats.count += 1;
    studentStats.maxDegreeRank = Math.max(
      studentStats.maxDegreeRank,
      Number(record.degreeRank) || 1,
    );
  });

  const sortedTermKeys = Array.from(termMap.keys()).sort(compareTermKeys);
  const metricsByTerm = {};

  sortedTermKeys.forEach((termKey) => {
    const termData = termMap.get(termKey);
    const metrics = {
      activeViolations: termData.violations,
      warningStudents: 0,
      atRiskStudents: 0,
      highRiskStudents: 0,
    };

    termData.students.forEach((studentStats) => {
      const bucketKey = getRiskBucket(
        studentStats.count,
        studentStats.maxDegreeRank,
      );
      if (bucketKey) {
        metrics[bucketKey] += 1;
      }
    });

    metricsByTerm[termKey] = metrics;
  });

  const normalizedCurrentSemester = normalizeSemester(currentSemester);
  const normalizedCurrentSchoolYear = normalizeSchoolYear(currentSchoolYear);

  let currentTermKey = "";
  if (normalizedCurrentSemester && normalizedCurrentSchoolYear) {
    const targetKey = buildTermKey(
      normalizedCurrentSemester,
      normalizedCurrentSchoolYear,
    );
    if (metricsByTerm[targetKey]) {
      currentTermKey = targetKey;
    }
  }

  if (!currentTermKey && sortedTermKeys.length > 0) {
    currentTermKey = sortedTermKeys[sortedTermKeys.length - 1];
  }

  const currentTermIndex = sortedTermKeys.indexOf(currentTermKey);
  const previousTermKey =
    currentTermIndex > 0 ? sortedTermKeys[currentTermIndex - 1] : "";

  const emptyMetrics = {
    activeViolations: 0,
    warningStudents: 0,
    atRiskStudents: 0,
    highRiskStudents: 0,
  };
  const currentMetrics = currentTermKey
    ? metricsByTerm[currentTermKey] || emptyMetrics
    : emptyMetrics;
  const previousMetrics = previousTermKey
    ? metricsByTerm[previousTermKey] || emptyMetrics
    : emptyMetrics;

  const cards = {
    activeViolations: {
      current: currentMetrics.activeViolations,
      previous: previousMetrics.activeViolations,
      percentChange: computePercentChange(
        currentMetrics.activeViolations,
        previousMetrics.activeViolations,
      ),
    },
    warningStudents: {
      current: currentMetrics.warningStudents,
      previous: previousMetrics.warningStudents,
      percentChange: computePercentChange(
        currentMetrics.warningStudents,
        previousMetrics.warningStudents,
      ),
    },
    atRiskStudents: {
      current: currentMetrics.atRiskStudents,
      previous: previousMetrics.atRiskStudents,
      percentChange: computePercentChange(
        currentMetrics.atRiskStudents,
        previousMetrics.atRiskStudents,
      ),
    },
    highRiskStudents: {
      current: currentMetrics.highRiskStudents,
      previous: previousMetrics.highRiskStudents,
      percentChange: computePercentChange(
        currentMetrics.highRiskStudents,
        previousMetrics.highRiskStudents,
      ),
    },
  };

  const trendBucketsBySemester = {
    "1st Sem": new Map(),
    "2nd Sem": new Map(),
    Summer: new Map(),
  };

  allRecords.forEach((record) => {
    const semester = normalizeSemester(record.semester);
    const monthLabel = String(record.monthLabel || "").trim();
    const displaySemester = SEMESTER_DISPLAY_MAP[semester];
    const date = new Date(record.date);
    const monthKey = Number.isNaN(date.getTime())
      ? ""
      : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

    if (
      !displaySemester ||
      !monthLabel ||
      !monthKey ||
      !trendBucketsBySemester[displaySemester]
    ) {
      return;
    }

    if (!trendBucketsBySemester[displaySemester].has(monthKey)) {
      trendBucketsBySemester[displaySemester].set(monthKey, {
        label: monthLabel,
        monthKey,
        count: 0,
      });
    }

    const targetRow = trendBucketsBySemester[displaySemester].get(monthKey);
    targetRow.count += 1;
  });

  const latestTermKeyBySemester = {
    "1st Sem": "",
    "2nd Sem": "",
    Summer: "",
  };

  allRecords.forEach((record) => {
    const semester = normalizeSemester(record.semester);
    const schoolYear = normalizeSchoolYear(record.schoolYear);
    const displaySemester = SEMESTER_DISPLAY_MAP[semester];
    if (!displaySemester || !schoolYear) {
      return;
    }

    const termKey = buildTermKey(semester, schoolYear);
    const existingTermKey = latestTermKeyBySemester[displaySemester];
    if (!existingTermKey || compareTermKeys(existingTermKey, termKey) < 0) {
      latestTermKeyBySemester[displaySemester] = termKey;
    }
  });

  const trendTermBySemester = Object.fromEntries(
    Object.entries(latestTermKeyBySemester).map(
      ([displaySemester, termKey]) => {
        if (!termKey) {
          return [displaySemester, { semester: "", schoolYear: "", label: "" }];
        }
        const { semester, schoolYear } = parseTermKey(termKey);
        return [
          displaySemester,
          {
            semester,
            schoolYear,
            label: `${displaySemester} (S.Y. ${schoolYear})`,
          },
        ];
      },
    ),
  );

  const trendBySemester = Object.fromEntries(
    Object.entries(trendBucketsBySemester).map(([semesterLabel, monthMap]) => [
      semesterLabel,
      Array.from(monthMap.values())
        .sort((left, right) => left.monthKey.localeCompare(right.monthKey))
        .map(({ label, count }) => ({ label, count })),
    ]),
  );

  const termSeries = sortedTermKeys.map((termKey, index) => {
    const { schoolYear, semester } = parseTermKey(termKey);
    const displaySemester = SEMESTER_DISPLAY_MAP[semester] || semester;
    const totalViolations = metricsByTerm[termKey]?.activeViolations || 0;
    return {
      index,
      termKey,
      label: `${schoolYear} ${displaySemester}`,
      totalViolations,
    };
  });

  const currentTermForForecast =
    currentTermKey || termSeries[termSeries.length - 1]?.termKey || "";
  const parsedCurrentTerm = parseTermKey(currentTermForForecast);
  const forecastBaseSemester = parsedCurrentTerm.semester || "1ST SEM";
  const forecastBaseSchoolYear = parsedCurrentTerm.schoolYear || "2025-2026";
  const { nextSemester, nextSchoolYear } = computeNextSemesterYear(
    forecastBaseSemester,
    forecastBaseSchoolYear,
  );
  const predictedCount = calculateForecastCount(termSeries, nextSemester);

  const studentAnalyticsSeriesRaw = [
    ...termSeries.map((entry) => entry.totalViolations),
    predictedCount,
  ];
  const maxSeriesValue = Math.max(...studentAnalyticsSeriesRaw, 1);
  const studentAnalyticsSeriesNormalized = studentAnalyticsSeriesRaw.map(
    (value) => Math.round((value / maxSeriesValue) * 42),
  );

  return {
    cards,
    trendBySemester,
    studentAnalytics: {
      historyLabels: termSeries.map((entry) => entry.label),
      historyCounts: termSeries.map((entry) => entry.totalViolations),
      graphData: studentAnalyticsSeriesNormalized,
      predictedNextTerm: {
        semester: nextSemester,
        schoolYear: nextSchoolYear,
        label: `${nextSchoolYear} ${SEMESTER_DISPLAY_MAP[nextSemester] || nextSemester}`,
        predictedViolations: predictedCount,
      },
      predictedChangePercent: computePercentChange(
        predictedCount,
        cards.activeViolations.current,
      ),
    },
    trendTermBySemester,
    currentTerm: currentTermKey
      ? {
          ...parseTermKey(currentTermKey),
          label: `${parseTermKey(currentTermKey).schoolYear} ${SEMESTER_DISPLAY_MAP[parseTermKey(currentTermKey).semester] || parseTermKey(currentTermKey).semester}`,
        }
      : null,
    previousTerm: previousTermKey
      ? {
          ...parseTermKey(previousTermKey),
          label: `${parseTermKey(previousTermKey).schoolYear} ${SEMESTER_DISPLAY_MAP[parseTermKey(previousTermKey).semester] || parseTermKey(previousTermKey).semester}`,
        }
      : null,
  };
}

function hashSecret(value) {
  return crypto
    .createHash("sha256")
    .update(String(value || ""))
    .digest("hex");
}

function getSessionTokenSecret() {
  return (
    process.env.SESSION_TOKEN_SECRET ||
    process.env.ENCRYPTION_KEY ||
    process.env.PUSHER_SECRET ||
    "svms-dev-session-secret"
  );
}

function signSessionToken(user) {
  const payload = {
    id: Number(user?.id) || 0,
    role: String(user?.role || ""),
    issuedAt: Date.now(),
  };
  const payloadText = JSON.stringify(payload);
  const payloadBase64 = Buffer.from(payloadText, "utf8").toString("base64url");
  const signature = crypto
    .createHmac("sha256", getSessionTokenSecret())
    .update(payloadBase64)
    .digest("base64url");
  return `${payloadBase64}.${signature}`;
}

function verifySessionToken(token, expectedUserId, expectedRole = null) {
  const normalized = String(token || "").trim();
  if (!normalized.includes(".")) {
    return false;
  }

  const [payloadBase64, providedSignature] = normalized.split(".", 2);
  if (!payloadBase64 || !providedSignature) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac("sha256", getSessionTokenSecret())
    .update(payloadBase64)
    .digest("base64url");

  const providedBuffer = Buffer.from(providedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    providedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return false;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(payloadBase64, "base64url").toString("utf8"),
    );
    const payloadUserId = Number(payload?.id);
    const payloadRole = String(payload?.role || "");

    if (!Number.isFinite(payloadUserId) || payloadUserId !== Number(expectedUserId)) {
      return false;
    }

    if (expectedRole && payloadRole !== String(expectedRole)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

function isPersistedLogoPath(value) {
  const normalized = String(value || "").trim();
  return (
    normalized.startsWith("/uploads/") ||
    normalized.startsWith("data:image/") ||
    /^https?:\/\//i.test(normalized)
  );
}

function getMimeTypeFromFilePath(filePath) {
  const ext = path.extname(String(filePath || "")).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".bmp") return "image/bmp";
  if (ext === ".ico") return "image/x-icon";
  return "application/octet-stream";
}

function chunkArray(items, chunkSize) {
  const normalizedItems = Array.isArray(items) ? items : [];
  const normalizedChunkSize = Math.max(1, Number(chunkSize) || 1);
  const chunks = [];

  for (let index = 0; index < normalizedItems.length; index += normalizedChunkSize) {
    chunks.push(normalizedItems.slice(index, index + normalizedChunkSize));
  }

  return chunks;
}

function resolveLegacyLogoFilePath(logoPath) {
  const normalized = String(logoPath || "").trim();
  if (!normalized.startsWith("/uploads/")) {
    return null;
  }

  const relativePath = normalized.replace(/^\/+/, "");
  const absolutePath = path.resolve(__dirname, relativePath);
  const expectedRoot = path.resolve(__dirname, "uploads");

  if (!absolutePath.startsWith(expectedRoot)) {
    return null;
  }

  return absolutePath;
}

async function resolveSystemLogoPath(storedLogoPath) {
  if (!storedLogoPath) {
    return { resolvedLogoPath: null, normalizedPersistedValue: null };
  }

  const decryptedValue = decryptImagePath(storedLogoPath);
  const candidates = [decryptedValue, storedLogoPath];

  for (const candidate of candidates) {
    if (!isPersistedLogoPath(candidate)) {
      continue;
    }

    const normalizedCandidate = String(candidate || "").trim();
    if (normalizedCandidate.startsWith("/uploads/")) {
      const localFilePath = resolveLegacyLogoFilePath(normalizedCandidate);
      if (!localFilePath) {
        continue;
      }

      try {
        const fileBuffer = await readFile(localFilePath);
        const mimeType = getMimeTypeFromFilePath(localFilePath);
        const dataUrl = `data:${mimeType};base64,${fileBuffer.toString("base64")}`;
        return {
          resolvedLogoPath: dataUrl,
          normalizedPersistedValue: encryptImagePath(dataUrl),
        };
      } catch (_error) {
        continue;
      }
    }

    return {
      resolvedLogoPath: normalizedCandidate,
      normalizedPersistedValue: encryptImagePath(normalizedCandidate),
    };
  }

  return { resolvedLogoPath: null, normalizedPersistedValue: null };
}

function getSupabaseStorageConfig() {
  const projectUrl = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const serviceRoleKey = String(
    process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  ).trim();
  const bucketName = String(
    process.env.SUPABASE_STORAGE_BUCKET || "svms-assets",
  ).trim();

  if (!projectUrl || !serviceRoleKey || !bucketName) {
    return null;
  }

  return {
    projectUrl,
    serviceRoleKey,
    bucketName,
  };
}

function buildSupabaseStorageObjectPath({
  prefix = "logos",
  extension = ".bin",
} = {}) {
  const safeExtension = String(extension || ".bin").startsWith(".")
    ? String(extension || ".bin").toLowerCase()
    : `.${String(extension || "bin").toLowerCase()}`;

  return `${prefix}/${Date.now()}-${crypto.randomUUID()}${safeExtension}`;
}

async function ensureSupabaseStorageBucket(config) {
  const response = await fetch(
    `${config.projectUrl}/storage/v1/bucket/${encodeURIComponent(config.bucketName)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.serviceRoleKey}`,
        apikey: config.serviceRoleKey,
      },
    },
  );

  if (response.ok) {
    return;
  }

  if (response.status !== 404) {
    const details = await response.text();
    throw new Error(
      `Unable to inspect Supabase storage bucket (${response.status} ${details.slice(0, 200)})`,
    );
  }

  const createResponse = await fetch(`${config.projectUrl}/storage/v1/bucket`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.serviceRoleKey}`,
      apikey: config.serviceRoleKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: config.bucketName,
      name: config.bucketName,
      public: true,
      file_size_limit: String(VERCEL_SAFE_UPLOAD_LIMIT_BYTES),
      allowed_mime_types: [
        "image/png",
        "image/jpeg",
        "image/webp",
        "image/gif",
        "image/svg+xml",
        "image/bmp",
        "image/x-icon",
      ],
    }),
  });

  if (!createResponse.ok) {
    const details = await createResponse.text();
    throw new Error(
      `Unable to create Supabase storage bucket (${createResponse.status} ${details.slice(0, 200)})`,
    );
  }
}

async function uploadBufferToSupabaseStorage(
  buffer,
  {
    contentType = "application/octet-stream",
    prefix = "logos",
    extension = ".bin",
  } = {},
) {
  const config = getSupabaseStorageConfig();
  if (!config) {
    throw new Error(
      "Supabase storage is not configured. Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and optionally SUPABASE_STORAGE_BUCKET.",
    );
  }

  await ensureSupabaseStorageBucket(config);

  const objectPath = buildSupabaseStorageObjectPath({ prefix, extension });
  const uploadResponse = await fetch(
    `${config.projectUrl}/storage/v1/object/${encodeURIComponent(config.bucketName)}/${objectPath}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.serviceRoleKey}`,
        apikey: config.serviceRoleKey,
        "Content-Type": contentType,
        "x-upsert": "true",
      },
      body: buffer,
    },
  );

  if (!uploadResponse.ok) {
    const details = await uploadResponse.text();
    throw new Error(
      `Unable to upload file to Supabase storage (${uploadResponse.status} ${details.slice(0, 200)})`,
    );
  }

  return `${config.projectUrl}/storage/v1/object/public/${encodeURIComponent(config.bucketName)}/${objectPath}`;
}

async function persistLogoBuffer(buffer, mimeType, options = {}) {
  const extension = path.extname(String(options.fileName || "")).toLowerCase() ||
    (() => {
      if (mimeType === "image/png") return ".png";
      if (mimeType === "image/jpeg") return ".jpg";
      if (mimeType === "image/webp") return ".webp";
      if (mimeType === "image/gif") return ".gif";
      if (mimeType === "image/svg+xml") return ".svg";
      if (mimeType === "image/bmp") return ".bmp";
      if (mimeType === "image/x-icon") return ".ico";
      return ".bin";
    })();

  const uploadedUrl = await uploadBufferToSupabaseStorage(buffer, {
    contentType: mimeType,
    prefix: "logos",
    extension,
  });

  return {
    logoPath: uploadedUrl,
    encryptedPath: encryptImagePath(uploadedUrl),
  };
}

async function normalizePersistedLogoPath(storedLogoPath) {
  if (!storedLogoPath) {
    return { resolvedLogoPath: null, normalizedPersistedValue: null };
  }

  const decryptedValue = decryptImagePath(storedLogoPath);
  const candidates = [decryptedValue, storedLogoPath];

  for (const candidate of candidates) {
    if (!isPersistedLogoPath(candidate)) {
      continue;
    }

    const normalizedCandidate = String(candidate || "").trim();
    if (/^https?:\/\//i.test(normalizedCandidate)) {
      return {
        resolvedLogoPath: normalizedCandidate,
        normalizedPersistedValue: encryptImagePath(normalizedCandidate),
      };
    }

    if (normalizedCandidate.startsWith("data:image/")) {
      return {
        resolvedLogoPath: normalizedCandidate,
        normalizedPersistedValue: encryptImagePath(normalizedCandidate),
      };
    }

    if (normalizedCandidate.startsWith("/uploads/")) {
      const localFilePath = resolveLegacyLogoFilePath(normalizedCandidate);
      if (!localFilePath) {
        continue;
      }

      try {
        const fileBuffer = await readFile(localFilePath);
        const mimeType = getMimeTypeFromFilePath(localFilePath);
        const {
          logoPath: uploadedUrl,
          encryptedPath,
        } = await persistLogoBuffer(fileBuffer, mimeType, {
          fileName: path.basename(localFilePath),
        });
        return {
          resolvedLogoPath: uploadedUrl,
          normalizedPersistedValue: encryptedPath,
        };
      } catch (error) {
        if (getSupabaseStorageConfig()) {
          throw error;
        }

        const fileBuffer = await readFile(localFilePath);
        const mimeType = getMimeTypeFromFilePath(localFilePath);
        const dataUrl = `data:${mimeType};base64,${fileBuffer.toString("base64")}`;
        return {
          resolvedLogoPath: dataUrl,
          normalizedPersistedValue: encryptImagePath(dataUrl),
        };
      }
    }
  }

  return { resolvedLogoPath: null, normalizedPersistedValue: null };
}

/**
 * Validate password against strong requirements
 * Requirements:
 * - At least 12 characters
 * - Uppercase letter (A–Z)
 * - Lowercase letter (a–z)
 * - Number (0–9)
 * - Special character (! @ # $ % ^ & *)
 */
function validatePasswordStrength(password) {
  const pwd = String(password || '');

  return {
    minLength: pwd.length >= 12,
    hasUppercase: /[A-Z]/.test(pwd),
    hasLowercase: /[a-z]/.test(pwd),
    hasNumber: /[0-9]/.test(pwd),
    hasSpecial: /[!@#$%^&*]/.test(pwd),
  };
}

function isPasswordStrong(password) {
  const validation = validatePasswordStrength(password);
  return Object.values(validation).every(v => v === true);
}

function getPasswordValidationError(password) {
  const pwd = String(password || '');

  if (pwd.length === 0) {
    return 'Password is required';
  }

  const validation = validatePasswordStrength(pwd);
  const failedRequirements = [];

  if (!validation.minLength) {
    failedRequirements.push('at least 12 characters');
  }
  if (!validation.hasUppercase) {
    failedRequirements.push('uppercase letter (A–Z)');
  }
  if (!validation.hasLowercase) {
    failedRequirements.push('lowercase letter (a–z)');
  }
  if (!validation.hasNumber) {
    failedRequirements.push('number (0–9)');
  }
  if (!validation.hasSpecial) {
    failedRequirements.push('special character (! @ # $ % ^ & *)');
  }

  if (failedRequirements.length > 0) {
    return `Password must contain: ${failedRequirements.join(', ')}`;
  }

  return null;
}

async function getPasswordResetSession(pool, email) {
  const lookup = await pool.query(
    `
    SELECT
      email,
      user_id,
      code_hash,
      verified,
      reset_token_hash,
      expires_at,
      resend_available_at
    FROM password_reset_sessions
    WHERE email = $1
    LIMIT 1
    `,
    [email],
  );

  return lookup.rows?.[0] || null;
}

async function removePasswordResetSession(pool, email) {
  await pool.query(`DELETE FROM password_reset_sessions WHERE email = $1`, [
    email,
  ]);
}

async function getSuperAdminLoginChallenge(pool, challengeId) {
  const lookup = await pool.query(
    `
    SELECT
      challenge_id,
      user_id,
      email,
      code_hash,
      expires_at,
      resend_available_at
    FROM super_admin_login_challenges
    WHERE challenge_id = $1
    LIMIT 1
    `,
    [challengeId],
  );

  return lookup.rows?.[0] || null;
}

async function getSuperAdminLoginChallengeByUserId(pool, userId) {
  const lookup = await pool.query(
    `
    SELECT
      challenge_id,
      user_id,
      email,
      code_hash,
      expires_at,
      resend_available_at
    FROM super_admin_login_challenges
    WHERE user_id = $1
    ORDER BY updated_at DESC
    LIMIT 1
    `,
    [userId],
  );

  return lookup.rows?.[0] || null;
}

async function upsertSuperAdminLoginChallenge(
  pool,
  { challengeId, userId, email, codeHash, expiresAtIso, resendAvailableAtIso },
) {
  await pool.query(
    `
    INSERT INTO super_admin_login_challenges (
      challenge_id,
      user_id,
      email,
      code_hash,
      expires_at,
      resend_available_at
    )
    VALUES ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz)
    ON CONFLICT (challenge_id)
    DO UPDATE SET
      user_id = EXCLUDED.user_id,
      email = EXCLUDED.email,
      code_hash = EXCLUDED.code_hash,
      expires_at = EXCLUDED.expires_at,
      resend_available_at = EXCLUDED.resend_available_at
    `,
    [
      challengeId,
      userId,
      email,
      codeHash,
      expiresAtIso,
      resendAvailableAtIso,
    ],
  );
}

async function removeSuperAdminLoginChallenge(pool, challengeId) {
  await pool.query(
    `DELETE FROM super_admin_login_challenges WHERE challenge_id = $1`,
    [challengeId],
  );
}

async function trustSuperAdminDevice(
  pool,
  { userId, deviceTokenHash, label = null, expiresAtIso },
) {
  await pool.query(
    `
    INSERT INTO super_admin_trusted_devices (
      device_token_hash,
      user_id,
      label,
      expires_at,
      last_used_at
    )
    VALUES ($1, $2, $3, $4::timestamptz, NOW())
    ON CONFLICT (device_token_hash)
    DO UPDATE SET
      user_id = EXCLUDED.user_id,
      label = EXCLUDED.label,
      expires_at = EXCLUDED.expires_at,
      last_used_at = NOW()
    `,
    [deviceTokenHash, userId, label, expiresAtIso],
  );
}

async function verifyTrustedSuperAdminDevice(pool, userId, deviceToken) {
  const deviceTokenHash = hashSecret(deviceToken);
  const lookup = await pool.query(
    `
    SELECT device_token_hash
    FROM super_admin_trusted_devices
    WHERE user_id = $1
      AND device_token_hash = $2
      AND expires_at > NOW()
    LIMIT 1
    `,
    [userId, deviceTokenHash],
  );

  if (!lookup.rows?.[0]) {
    return false;
  }

  await pool.query(
    `
    UPDATE super_admin_trusted_devices
    SET last_used_at = NOW()
    WHERE device_token_hash = $1
    `,
    [deviceTokenHash],
  );

  return true;
}

const DEFAULT_SUPER_ADMIN_ACCOUNT = {
  firstName: "Jenny",
  lastName: "Hernandez",
  email: "jennypatanag@gmail.com",
};

async function ensureDefaultSuperAdminAccount() {
  if (!hasDbConfig()) {
    return;
  }

  const pool = getDbPool();
  if (!pool) {
    return;
  }

  const cleanedFirst = formatStudentNameSegment(
    DEFAULT_SUPER_ADMIN_ACCOUNT.firstName,
  );
  const cleanedLast = formatStudentNameSegment(
    DEFAULT_SUPER_ADMIN_ACCOUNT.lastName,
  );
  const normalizedEmail = DEFAULT_SUPER_ADMIN_ACCOUNT.email.toLowerCase();
  const fullName = `${cleanedFirst} ${cleanedLast}`.trim();

  const existingResult = await pool.query(
    `
    SELECT
      u.id,
      u.username,
      u.role
    FROM users u
    INNER JOIN "Admins" a ON a.user_id = u.id
    WHERE LOWER(a.email) = $1
    LIMIT 1
    `,
    [normalizedEmail],
  );

  const existingUser = existingResult.rows?.[0] || null;

  if (existingUser) {
    await pool.query(
      `
      UPDATE users
      SET
        role = 'super_admin',
        first_name = $1,
        last_name = $2,
        is_active = TRUE
      WHERE id = $3
      `,
      [cleanedFirst, cleanedLast, existingUser.id],
    );

    await pool.query(
      `
      INSERT INTO "Admins" (user_id, email, first_name, last_name, full_name)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id) DO UPDATE SET
        email = EXCLUDED.email,
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        full_name = EXCLUDED.full_name
      `,
      [existingUser.id, normalizedEmail, cleanedFirst, cleanedLast, fullName],
    );

    return;
  }

  const generatedUsername = await generateAdminUsername(
    pool,
    cleanedFirst,
    cleanedLast,
  );
  const generatedPassword = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(generatedPassword, 10);

  const userInsert = await pool.query(
    `
    INSERT INTO users (username, password_hash, role, first_name, last_name, is_active)
    VALUES ($1, $2, 'super_admin', $3, $4, TRUE)
    RETURNING id, username
    `,
    [generatedUsername, passwordHash, cleanedFirst, cleanedLast],
  );

  const createdUser = userInsert.rows?.[0] || null;
  if (!createdUser) {
    return;
  }

  await pool.query(
    `
    INSERT INTO "Admins" (user_id, email, first_name, last_name, full_name)
    VALUES ($1, $2, $3, $4, $5)
    `,
    [createdUser.id, normalizedEmail, cleanedFirst, cleanedLast, fullName],
  );

  try {
    const delivery = await sendAdminCredentialEmail({
      toEmail: normalizedEmail,
      firstName: cleanedFirst,
      username: createdUser.username,
      password: generatedPassword,
      role: "super_admin",
    });

    if (!delivery.sent) {
      console.warn(
        `Default super admin account created, but credential email was not sent: ${delivery.reason}`,
      );
    }
  } catch (error) {
    console.error(
      "Failed to send default super admin credential email:",
      error?.message || error,
    );
  }
}

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
        `Audit cleanup: removed ${removedCount} log${removedCount === 1 ? '' : 's'} older than ${AUDIT_LOG_RETENTION_DAYS} days.`,
      );
    }
  } catch (error) {
    console.warn(`Audit cleanup failed: ${error.message}`);
  }
}

async function purgeExpiredNotifications() {
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
      DELETE FROM notifications
      WHERE read_at IS NOT NULL
        AND created_at < NOW() - ($1::text || ' days')::interval
      `,
      [String(NOTIFICATION_RETENTION_DAYS)],
    );

    const removedCount = Number(result.rowCount || 0);
    if (removedCount > 0) {
      console.log(
        `Notification cleanup: removed ${removedCount} read notification${removedCount === 1 ? '' : 's'} older than ${NOTIFICATION_RETENTION_DAYS} days.`,
      );
    }
  } catch (error) {
    console.warn(`Notification cleanup failed: ${error.message}`);
  }
}

function buildCredentialEmailTemplate({
  firstName,
  username,
  password,
  accountLabel = "Student",
}) {
  return `
    <div style="background:linear-gradient(180deg,#eaf6fb 0%,#f4f8fc 45%,#f8fafc 100%);padding:36px 18px;font-family:Segoe UI,Arial,sans-serif;color:#0f172a;">
      <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #dbe7f2;border-radius:18px;overflow:hidden;box-shadow:0 12px 36px rgba(2,6,23,0.08);">
        <div style="padding:22px 26px;background:linear-gradient(135deg,#0f172a 0%,#1e293b 70%,#0f172a 100%);border-bottom:1px solid rgba(255,255,255,0.12);">
          <p style="margin:0 0 8px 0;color:#7dd3fc;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">SVMS Account Created</p>
          <h2 style="margin:0;color:#f8fafc;font-size:22px;font-weight:800;line-height:1.3;">Your ${escapeHtml(accountLabel)} Account Credentials</h2>
        </div>
        <div style="padding:24px 26px;background:#ffffff;">
          <p style="margin:0 0 14px 0;color:#1f2937;font-size:14px;line-height:1.6;">Hello ${escapeHtml(firstName || "Student")},</p>
          <p style="margin:0 0 20px 0;color:#4b5563;font-size:14px;line-height:1.6;">An account has been created for you in the Student Violation Management System. Use the credentials below to sign in.</p>
          <div style="background:linear-gradient(180deg,#f0f9ff 0%,#f8fbff 100%);border:1px solid #cfe9ff;border-radius:14px;padding:18px;margin:20px 0;">
            <p style="margin:0 0 12px 0;font-size:13px;font-weight:600;color:#0369a1;letter-spacing:0.06em;text-transform:uppercase;">Username</p>
            <p style="margin:0 0 18px 0;font-size:15px;color:#0f172a;font-weight:700;letter-spacing:0.03em;">${escapeHtml(username)}</p>
            <p style="margin:0 0 12px 0;font-size:13px;font-weight:600;color:#0369a1;letter-spacing:0.06em;text-transform:uppercase;">Temporary Password</p>
            <p style="margin:0;font-size:15px;color:#0f172a;font-weight:700;letter-spacing:0.03em;">${escapeHtml(password)}</p>
          </div>
          <div style="margin:20px 0;padding:12px 14px;border-radius:12px;background:#fef3c7;border:1px solid #fde68a;">
            <p style="margin:0;color:#92400e;font-size:13px;line-height:1.6;font-weight:500;">⚠ For security, please log in and change your password immediately.</p>
          </div>
        </div>
      </div>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildSystemEmailShell({
  eyebrow,
  heading,
  lead,
  contentHtml,
  footerNote,
}) {
  return `
    <div style="background:linear-gradient(180deg,#eaf6fb 0%,#f4f8fc 45%,#f8fafc 100%);padding:36px 18px;font-family:Segoe UI,Arial,sans-serif;color:#0f172a;">
      <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #dbe7f2;border-radius:18px;overflow:hidden;box-shadow:0 12px 36px rgba(2,6,23,0.08);">
        <div style="padding:22px 26px;background:linear-gradient(135deg,#0f172a 0%,#1e293b 70%,#0f172a 100%);border-bottom:1px solid rgba(255,255,255,0.12);">
          <p style="margin:0 0 8px 0;color:#7dd3fc;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">${escapeHtml(eyebrow || "SVMS")}</p>
          <h2 style="margin:0;color:#f8fafc;font-size:22px;font-weight:800;line-height:1.3;">${escapeHtml(heading || "Student Violation Management System")}</h2>
          ${lead ? `<p style="margin:10px 0 0 0;color:#cbd5e1;font-size:14px;line-height:1.6;">${escapeHtml(lead)}</p>` : ""}
        </div>
        <div style="padding:24px 26px;background:#ffffff;">
          ${contentHtml}
          ${footerNote ? `<p style="margin:22px 0 0 0;font-size:12px;color:#64748b;line-height:1.6;">${escapeHtml(footerNote)}</p>` : ""}
        </div>
      </div>
    </div>
  `;
}

function buildForgotPasswordEmailTemplate({ code }) {
  const safeCode = escapeHtml(code);
  return buildSystemEmailShell({
    eyebrow: "SVMS Security",
    heading: "Password Reset Verification",
    lead: "Use the one-time code below to continue resetting your account password.",
    contentHtml: `
      <div style="background:linear-gradient(180deg,#eff8ff 0%,#f8fbff 100%);border:1px solid #cfe9ff;border-radius:14px;padding:18px;">
        <p style="margin:0 0 10px 0;color:#0f172a;font-size:14px;line-height:1.6;">Enter this 6-digit code in the app:</p>
        <p style="margin:0;padding:12px 10px;text-align:center;border-radius:12px;background:#0f172a;color:#f8fafc;font-size:34px;font-weight:800;letter-spacing:0.18em;">${safeCode}</p>
      </div>
      <div style="margin-top:14px;padding:12px 14px;border-radius:12px;background:#f8fafc;border:1px solid #e2e8f0;">
        <p style="margin:0;color:#334155;font-size:13px;line-height:1.6;">This code expires in 10 minutes. If you did not request a password reset, you can safely ignore this email.</p>
      </div>
    `,
    footerNote:
      "This is an automated message from Student Violation Management System. Please do not reply to this email.",
  });
}

function buildSuperAdminLoginCodeEmailTemplate({ code }) {
  const safeCode = escapeHtml(code);
  return buildSystemEmailShell({
    eyebrow: "SVMS Security",
    heading: "Super Admin Login Verification",
    lead: "Use this one-time 6-digit verification code to finish signing in to your super admin account.",
    contentHtml: `
      <div style="background:linear-gradient(180deg,#eff8ff 0%,#f8fbff 100%);border:1px solid #cfe9ff;border-radius:14px;padding:18px;">
        <p style="margin:0 0 10px 0;color:#0f172a;font-size:14px;line-height:1.6;">Enter this code in the login page:</p>
        <p style="margin:0;padding:12px 10px;text-align:center;border-radius:12px;background:#0f172a;color:#f8fafc;font-size:34px;font-weight:800;letter-spacing:0.18em;">${safeCode}</p>
      </div>
      <div style="margin-top:14px;padding:12px 14px;border-radius:12px;background:#f8fafc;border:1px solid #e2e8f0;">
        <p style="margin:0;color:#334155;font-size:13px;line-height:1.6;">This code expires in 10 minutes. If this login attempt was not made by you, change your password immediately.</p>
      </div>
    `,
    footerNote:
      "This is an automated security message from Student Violation Management System. Please do not reply to this email.",
  });
}

function buildAdminAlertEmailTemplate({
  studentName,
  alertType,
  message,
  activeViolationCount,
  program,
  yearSection,
}) {
  const safeStudentName = escapeHtml(studentName || "Student");
  const safeAlertType = escapeHtml(alertType || "Admin Alert");
  const safeMessage = escapeHtml(message || "No message provided.");
  const safeProgram = escapeHtml(program || "-");
  const safeYearSection = escapeHtml(yearSection || "-");
  const safeViolationCount = Number.isFinite(Number(activeViolationCount))
    ? Number(activeViolationCount)
    : 0;

  return buildSystemEmailShell({
    eyebrow: "SVMS Notification",
    heading: "New Alert From Administrator",
    lead: `Hello ${safeStudentName}, you have received a new alert from the Student Violation Management System.`,
    contentHtml: `
      <div style="display:block;margin-bottom:14px;padding:12px 14px;border-radius:12px;background:#f8fafc;border:1px solid #dbe7f2;">
        <p style="margin:0 0 8px 0;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#0369a1;">Alert Type</p>
        <p style="margin:0;font-size:18px;font-weight:800;color:#0f172a;">${safeAlertType}</p>
      </div>
      <div style="margin-bottom:14px;padding:14px;border-radius:12px;background:#f0f9ff;border:1px solid #bae6fd;">
        <p style="margin:0 0 8px 0;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#0369a1;">Message</p>
        <p style="margin:0;color:#0f172a;font-size:14px;line-height:1.65;white-space:pre-line;">${safeMessage}</p>
      </div>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;background:#ffffff;">
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;background:#f8fafc;color:#334155;font-size:13px;font-weight:600;">Program</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#0f172a;font-size:13px;">${safeProgram}</td>
        </tr>
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;background:#f8fafc;color:#334155;font-size:13px;font-weight:600;">Year/Section</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#0f172a;font-size:13px;">${safeYearSection}</td>
        </tr>
        <tr>
          <td style="padding:10px 12px;background:#f8fafc;color:#334155;font-size:13px;font-weight:600;">Active Violations</td>
          <td style="padding:10px 12px;color:#0f172a;font-size:13px;">${safeViolationCount}</td>
        </tr>
      </table>
    `,
    footerNote:
      "You can also view this alert in your SVMS student notifications panel.",
  });
}

// Cached transporter — created once, reused for all emails.
let _mailTransporter = null;

function getMailTransporter() {
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (!smtpUser || !smtpPass) {
    return null;
  }

  if (!_mailTransporter) {
    const transportOptions = {
      auth: {
        user: smtpUser,
        pass: smtpPass,
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

    _mailTransporter = nodemailer.createTransport(transportOptions);
  }

  return _mailTransporter;
}

async function deactivateGraduatedStudentAccounts() {
  if (!hasDbConfig()) {
    return;
  }

  try {
    await ensureAuthDatabaseReady();
    const pool = getDbPool();
    const result = await pool.query(
      `UPDATE users u
       SET is_active = FALSE, updated_at = NOW()
       FROM "Students" s
       WHERE u.id = s.user_id
         AND u.role = 'student'
         AND u.is_active = TRUE
         AND TRIM(LOWER(s.status)) = 'graduated'
       RETURNING s.email, s.full_name`,
    );

    const transporter = getMailTransporter();
    for (const row of result.rows || []) {
      if (!transporter) {
        console.warn("SMTP not configured. Graduation deactivation email skipped for:", row.email);
        continue;
      }
      if (!row.email) {
        continue;
      }
      try {
        await transporter.sendMail({
          from: process.env.SMTP_FROM || process.env.SMTP_USER,
          to: row.email,
          subject: "Account Deactivated - Graduation Status",
          html: buildSystemEmailShell({
            eyebrow: "SVMS Security",
            heading: "Account Deactivated",
            lead: "Your account status has been updated.",
            contentHtml: `
              <div style="margin-bottom:18px;padding:14px;border-radius:12px;background:#fef2f2;border:1px solid #fecaca;">
                <p style="margin:0 0 10px 0;font-size:13px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#991b1b;">Account Status Changed</p>
                <p style="margin:0;color:#7f1d1d;font-size:14px;line-height:1.6;">Your status has been updated to "Graduated" and your account has been deactivated. You will no longer be able to log in to the Student Violation Management System.</p>
              </div>
              <div style="margin:18px 0;padding:12px 14px;border-radius:12px;background:#f3f4f6;border:1px solid #d1d5db;">
                <p style="margin:0;color:#374151;font-size:13px;line-height:1.6;">
                  <strong>If you believe this is an error</strong>, please contact your administrator immediately.
                </p>
              </div>
            `,
            footerNote: "This is an automated message from Student Violation Management System. Please do not reply to this email.",
          }),
        });
      } catch (emailError) {
        console.error("Failed to send graduated deactivation email:", emailError);
      }
    }

    if (result.rowCount > 0) {
      console.log(`Deactivated ${result.rowCount} graduated student account(s) on startup.`);
    }
  } catch (error) {
    console.error("Failed to enforce graduated deactivations on startup:", error);
  }
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
    html: buildCredentialEmailTemplate({
      firstName,
      username,
      password,
      accountLabel: "Student",
    }),
  });

  return { sent: true };
}

async function sendAdminCredentialEmail({
  toEmail,
  firstName,
  username,
  password,
  role,
}) {
  const transporter = getMailTransporter();
  if (!transporter) {
    return {
      sent: false,
      reason: "SMTP_USER/SMTP_PASS not configured.",
    };
  }

  const accountLabel =
    role === "super_admin" ? "Super Admin" : "Admin";

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: toEmail,
    subject: `Your SVMS ${accountLabel} Account Credentials`,
    html: buildCredentialEmailTemplate({
      firstName,
      username,
      password,
      accountLabel,
    }),
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

async function sendSuperAdminLoginCodeEmail({ toEmail, code }) {
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
    subject: "SVMS Super Admin Verification Code",
    html: buildSuperAdminLoginCodeEmailTemplate({ code }),
  });

  return { sent: true };
}

async function sendStudentAdminAlertEmail({
  toEmail,
  studentName,
  alertType,
  message,
  activeViolationCount,
  program,
  yearSection,
}) {
  const transporter = getMailTransporter();
  if (!transporter) {
    return {
      sent: false,
      reason: "SMTP_USER/SMTP_PASS not configured.",
    };
  }

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: toEmail,
      subject: `SVMS Alert: ${String(alertType || "Admin Alert")}`,
      html: buildAdminAlertEmailTemplate({
        studentName,
        alertType,
        message,
        activeViolationCount,
        program,
        yearSection,
      }),
    });

    return { sent: true };
  } catch (error) {
    return {
      sent: false,
      reason: error?.message || "Unable to send alert email.",
    };
  }
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

async function generateAdminUsername(pool, firstName, lastName) {
  const first = normalizeNamePart(firstName);
  const last = normalizeNamePart(lastName);
  const baseRaw = `${first || "admin"}.${last || "user"}`.replace(/\.+/g, ".");
  const base = baseRaw.slice(0, 20);

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

async function issueSuperAdminLoginChallenge(pool, user) {
  const challengeId = crypto.randomBytes(24).toString("hex");
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const codeHash = hashSecret(code);
  const now = Date.now();
  const expiresAtIso = new Date(
    now + SUPER_ADMIN_LOGIN_CODE_EXPIRY_MS,
  ).toISOString();
  const resendAvailableAtIso = new Date(
    now + SUPER_ADMIN_LOGIN_RESEND_COOLDOWN_MS,
  ).toISOString();

  const delivery = await sendSuperAdminLoginCodeEmail({
    toEmail: user.email,
    code,
  });

  if (!delivery.sent) {
    return delivery;
  }

  await upsertSuperAdminLoginChallenge(pool, {
    challengeId,
    userId: user.id,
    email: user.email,
    codeHash,
    expiresAtIso,
    resendAvailableAtIso,
  });

  return {
    sent: true,
    challengeId,
    retryAfterSeconds: Math.ceil(
      SUPER_ADMIN_LOGIN_RESEND_COOLDOWN_MS / 1000,
    ),
  };
}

function generateTemporaryPassword() {
  return crypto.randomBytes(6).toString("base64url");
}

function normalizeAdminRole(value) {
  return String(value || "").trim().toLowerCase() === "super_admin"
    ? "super_admin"
    : "admin";
}

function formatRoleLabel(role) {
  return role === "super_admin" ? "Super Admin" : "Admin";
}

function parseImportedStudentName(rawName) {
  const normalized = String(rawName || "").trim().replace(/\s+/g, " ");
  if (!normalized) {
    return {
      firstName: "",
      middleInitial: "",
      lastName: "",
      fullName: "",
    };
  }

  const [lastPartRaw, remainingRaw = ""] = normalized.split(",", 2);
  const lastName = formatStudentNameSegment(lastPartRaw);
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

  const firstName = formatStudentNameSegment(firstNameParts.join(" "));
  const fullName = buildStudentFullName(firstName, middleInitial, lastName);

  return {
    firstName,
    middleInitial,
    lastName,
    fullName,
  };
}

function parseImportedProgramYearSection(rawValue) {
  const normalized = String(rawValue || "").trim();
  if (!normalized) {
    return { program: "", yearSection: "", yearLevel: 1 };
  }

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

function parseStudentWorkbook(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheetName = workbook.SheetNames?.[0];
  if (!firstSheetName) {
    throw new Error("The workbook does not contain any worksheets.");
  }

  const worksheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("The workbook does not contain any student rows.");
  }

  const students = [];
  const seenSchoolIds = new Set();
  const seenEmails = new Set();

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const schoolId = String(row["Student Id"] || row["Student ID"] || "")
      .trim();
    const name = String(row.Name || "").trim();
    const email = String(row["Email "] || row.Email || "")
      .trim()
      .toLowerCase();
    const programYearSection = String(
      row["Program-Year/Section"] || row["Program / Year / Section"] || "",
    ).trim();
    const status = normalizeImportedStudentStatus(
      row["Status(Regular or Irregular)"] || row.Status || "",
    );

    if (!schoolId && !name && !email && !programYearSection) {
      return;
    }

    if (!schoolId || !name || !email || !programYearSection) {
      throw new Error(
        `Row ${rowNumber} is missing one or more required columns (Student Id, Name, Program-Year/Section, Email).`,
      );
    }

    if (seenSchoolIds.has(schoolId.toLowerCase())) {
      throw new Error(`Duplicate Student Id found in workbook at row ${rowNumber}.`);
    }
    if (seenEmails.has(email)) {
      throw new Error(`Duplicate email found in workbook at row ${rowNumber}.`);
    }

    seenSchoolIds.add(schoolId.toLowerCase());
    seenEmails.add(email);

    const parsedName = parseImportedStudentName(name);
    const parsedProgram = parseImportedProgramYearSection(programYearSection);
    if (!parsedName.firstName || !parsedName.lastName) {
      throw new Error(`Unable to parse the student name at row ${rowNumber}.`);
    }
    if (!parsedProgram.program || !parsedProgram.yearSection) {
      throw new Error(
        `Unable to parse Program-Year/Section at row ${rowNumber}.`,
      );
    }

    students.push({
      schoolId,
      email,
      status,
      ...parsedName,
      ...parsedProgram,
    });
  });

  if (students.length === 0) {
    throw new Error("No importable student rows were found in the workbook.");
  }

  return students;
}

async function buildStudentImportPreview(pool, importedStudents) {
  const schoolIds = importedStudents.map((student) =>
    String(student.schoolId || "").trim().toLowerCase(),
  );
  const emails = importedStudents.map((student) =>
    String(student.email || "").trim().toLowerCase(),
  );

  const existingStudentsResult = await pool.query(
    `
    SELECT
      s.id,
      s.user_id,
      s.school_id,
      s.email,
      s.full_name,
      s.first_name,
      s.middle_initial,
      s.last_name,
      s.program,
      s.year_section,
      s.year_level,
      s.status,
      s.is_archived,
      u.username
    FROM "Students" s
    LEFT JOIN users u ON u.id = s.user_id
    WHERE LOWER(s.school_id) = ANY($1::text[])
       OR LOWER(s.email) = ANY($2::text[])
    `,
    [schoolIds, emails],
  );

  const existingBySchoolId = new Map();
  const existingByEmail = new Map();

  for (const existingStudent of existingStudentsResult.rows || []) {
    existingBySchoolId.set(
      String(existingStudent.school_id || "").trim().toLowerCase(),
      existingStudent,
    );
    existingByEmail.set(
      String(existingStudent.email || "").trim().toLowerCase(),
      existingStudent,
    );
  }

  const preparedRows = importedStudents.map((student) => {
    const normalizedSchoolId = String(student.schoolId || "").trim().toLowerCase();
    const normalizedEmail = String(student.email || "").trim().toLowerCase();
    const schoolMatch = existingBySchoolId.get(normalizedSchoolId) || null;
    const emailMatch = existingByEmail.get(normalizedEmail) || null;

    if (schoolMatch && emailMatch && schoolMatch.id !== emailMatch.id) {
      throw new Error(
        `Conflicting existing student records were found for School ID ${student.schoolId} and email ${student.email}. Please resolve the duplicate records first.`,
      );
    }

    const existingStudent = schoolMatch || emailMatch || null;
    const duplicateReasons = [];

    if (schoolMatch) duplicateReasons.push("schoolId");
    if (emailMatch) duplicateReasons.push("email");

    return {
      student,
      existingStudent,
      isDuplicate: Boolean(existingStudent),
      duplicateReasons,
    };
  });

  const duplicateRows = preparedRows.filter((row) => row.isDuplicate);
  const newRows = preparedRows.filter((row) => !row.isDuplicate);

  return {
    preparedRows,
    duplicateRows,
    newRows,
    duplicateCount: duplicateRows.length,
    importableCount: newRows.length,
    duplicates: duplicateRows.map((row) => ({
      schoolId: row.student.schoolId,
      email: row.student.email,
      fullName: row.student.fullName,
      existingStudentId: row.existingStudent?.id || null,
      existingName:
        row.existingStudent?.full_name ||
        [row.existingStudent?.first_name, row.existingStudent?.last_name]
          .filter(Boolean)
          .join(" ")
          .trim(),
      duplicateReasons: row.duplicateReasons,
      isArchived: Boolean(row.existingStudent?.is_archived),
    })),
  };
}

const uploadsDir = path.join(path.dirname(__filename), "uploads");

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    // Accept any image MIME type
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed."));
    }
  },
  limits: {
    fileSize: VERCEL_SAFE_UPLOAD_LIMIT_BYTES,
  },
});

const studentWorkbookUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    const lowerName = String(file.originalname || "").toLowerCase();
    const allowedMimeTypes = new Set([
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "application/octet-stream",
    ]);
    if (
      lowerName.endsWith(".xlsx") ||
      lowerName.endsWith(".xls") ||
      allowedMimeTypes.has(String(file.mimetype || "").toLowerCase())
    ) {
      cb(null, true);
      return;
    }

    cb(new Error("Only Excel files (.xlsx or .xls) are allowed."));
  },
  limits: {
    fileSize: VERCEL_SAFE_UPLOAD_LIMIT_BYTES,
  },
});

app.use(cors());
// Increase JSON body size limit to allow base64 signature uploads
app.use(express.json({ limit: '4mb' }));

// Lightweight response caching for GET /api requests to speed up tab switches.
app.use((req, res, next) => {
  if (!req.path.startsWith("/api/")) {
    return next();
  }

  if (req.method !== "GET") {
    if (apiGetResponseCache.size > 0) {
      apiGetResponseCache.clear();
    }
    return next();
  }

  const cacheControl = String(req.headers["cache-control"] || "").toLowerCase();
  if (cacheControl.includes("no-cache") || cacheControl.includes("no-store")) {
    return next();
  }

  purgeExpiredApiGetCacheEntries();
  const cacheKey = buildApiGetCacheKey(req);
  const now = Date.now();
  const cached = apiGetResponseCache.get(cacheKey);

  if (cached && cached.expiresAt > now) {
    res.setHeader("x-api-cache", "HIT");
    return res.status(cached.statusCode).json(cached.payload);
  }

  const originalJson = res.json.bind(res);
  res.json = (payload) => {
    if (res.statusCode >= 200 && res.statusCode < 500) {
      apiGetResponseCache.set(cacheKey, {
        statusCode: res.statusCode,
        payload,
        expiresAt: Date.now() + API_GET_CACHE_TTL_MS,
      });
      evictApiGetCacheIfNeeded();
      res.setHeader("x-api-cache", "MISS");
    }

    return originalJson(payload);
  };

  return next();
});

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

app.get("/api/app-state/snapshot", async (req, res) => {
  if (!hasDbConfig()) {
    return res.status(500).json({
      status: "error",
      message: "Database is not configured.",
    });
  }

  try {
    await ensureAuthDatabaseReady();

    const keys = String(req.query.keys || "")
      .split(",")
      .map((key) => key.trim())
      .filter(Boolean);

    const snapshotRows = await getAppStateSnapshot(keys);
    const snapshot = {};
    snapshotRows.forEach((entry) => {
      snapshot[entry.state_key] = {
        value: entry.state_value,
        updatedAt: entry.updated_at,
      };
    });

    return res.status(200).json({
      status: "ok",
      snapshot,
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(503).json({
      status: "error",
      message: `Unable to load app state snapshot (${error.message}).`,
    });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { username, password, trustedDeviceToken } = req.body ?? {};

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
      // Parallelize admin and student email lookups instead of sequential
      const [adminResult, studentResult] = await Promise.all([
        pool.query(
          `
          SELECT
            u.id,
            a.email,
            u.username,
            u.password_hash,
            u.role,
            a.first_name,
            a.middle_initial,
            a.last_name,
            u.is_active
          FROM users u
          INNER JOIN "Admins" a ON a.user_id = u.id
          WHERE LOWER(a.email) = LOWER($1)
            AND u.role IN ('admin', 'super_admin')
          LIMIT 1
          `,
          [username],
        ),
        pool.query(
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
        ),
      ]);

      user = adminResult.rows?.[0] || studentResult.rows?.[0] || null;
    } else {
      // Single query to find user and their role-specific data in parallel
      const userResult = await pool.query(
        `
        SELECT
          u.id,
          u.username,
          u.password_hash,
          u.role,
          u.is_active,
          COALESCE(a.email, s.email) as email,
          COALESCE(a.first_name, s.first_name, u.first_name) as first_name,
          COALESCE(a.middle_initial, s.middle_initial) as middle_initial,
          COALESCE(a.last_name, s.last_name, u.last_name) as last_name,
          s.school_id,
          s.program,
          s.year_section
        FROM users u
        LEFT JOIN "Admins" a ON a.user_id = u.id AND u.role IN ('admin', 'super_admin')
        LEFT JOIN "Students" s ON s.user_id = u.id AND u.role = 'student'
        WHERE u.username = $1
        LIMIT 1
        `,
        [username],
      );

      user = userResult.rows?.[0] || null;
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

    if (user.role === "super_admin") {
      const trusted = trustedDeviceToken
        ? await verifyTrustedSuperAdminDevice(
            pool,
            user.id,
            trustedDeviceToken,
          )
        : false;

      if (!trusted) {
        const existingChallenge = await getSuperAdminLoginChallengeByUserId(
          pool,
          user.id,
        );
        const now = Date.now();
        const existingResendAt = existingChallenge?.resend_available_at
          ? new Date(existingChallenge.resend_available_at).getTime()
          : 0;

        if (
          existingChallenge &&
          Number.isFinite(existingResendAt) &&
          existingResendAt > now
        ) {
          return res.status(202).json({
            status: "pending_verification",
            requiresVerification: true,
            challengeId: existingChallenge.challenge_id,
            retryAfterSeconds: Math.ceil((existingResendAt - now) / 1000),
            message:
              "A verification code was already sent to your email. Please enter it to continue.",
          });
        }

        const challenge = await issueSuperAdminLoginChallenge(pool, user);
        if (!challenge.sent) {
          return res.status(503).json({
            status: "error",
            message: `Unable to send super admin verification code (${challenge.reason || "unknown reason"}).`,
          });
        }

        return res.status(202).json({
          status: "pending_verification",
          requiresVerification: true,
          challengeId: challenge.challengeId,
          retryAfterSeconds: challenge.retryAfterSeconds,
          message:
            "A 6-digit verification code was sent to your email. Enter it to finish signing in.",
        });
      }
    }

    const sessionToken = signSessionToken(user);

    return res.status(200).json({
      status: "ok",
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        firstName: user.first_name || "",
        middleInitial: user.middle_initial || "",
        lastName: user.last_name || "",
        fullName: [
          user.first_name,
          user.middle_initial ? `${user.middle_initial}.` : "",
          user.last_name,
        ].filter(Boolean).join(" "),
        schoolId: user.school_id || "",
        program: user.program || "",
        yearSection: user.year_section || "",
        sessionToken,
      },
    });
  } catch (error) {
    return res.status(503).json({
      status: "error",
      message: `Login unavailable: database not ready (${error.message}).`,
    });
  }
});

app.post("/api/auth/super-admin/verify", async (req, res) => {
  const { challengeId, code, trustDevice } = req.body ?? {};
  const normalizedChallengeId = String(challengeId || "").trim();
  const normalizedCode = String(code || "").trim();

  if (!normalizedChallengeId || !normalizedCode) {
    return res.status(400).json({
      status: "error",
      message: "Challenge id and verification code are required.",
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
    const challenge = await getSuperAdminLoginChallenge(
      pool,
      normalizedChallengeId,
    );

    if (!challenge) {
      return res.status(400).json({
        status: "error",
        message: "No super admin verification request was found.",
      });
    }

    const expiresAt = new Date(challenge.expires_at).getTime();
    if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) {
      await removeSuperAdminLoginChallenge(pool, normalizedChallengeId);
      return res.status(400).json({
        status: "error",
        message: "Verification code expired. Please sign in again.",
      });
    }

    const incomingCodeHash = hashSecret(normalizedCode);
    if (incomingCodeHash !== challenge.code_hash) {
      return res.status(400).json({
        status: "error",
        message: "Invalid verification code.",
      });
    }

    const userResult = await pool.query(
      `
      SELECT
        u.id,
        u.username,
        u.password_hash,
        u.role,
        u.is_active,
        a.email,
        a.first_name,
        a.middle_initial,
        a.last_name
      FROM users u
      INNER JOIN "Admins" a ON a.user_id = u.id
      WHERE u.id = $1
        AND u.role = 'super_admin'
      LIMIT 1
      `,
      [challenge.user_id],
    );

    const user = userResult.rows?.[0] || null;
    if (!user || !user.is_active) {
      await removeSuperAdminLoginChallenge(pool, normalizedChallengeId);
      return res.status(404).json({
        status: "error",
        message: "Super admin account not found.",
      });
    }

    let nextTrustedDeviceToken = "";
    if (trustDevice === true) {
      nextTrustedDeviceToken = crypto.randomBytes(32).toString("hex");
      await trustSuperAdminDevice(pool, {
        userId: user.id,
        deviceTokenHash: hashSecret(nextTrustedDeviceToken),
        label: "Trusted browser",
        expiresAtIso: new Date(
          Date.now() + SUPER_ADMIN_TRUSTED_DEVICE_TTL_MS,
        ).toISOString(),
      });
    }

    await removeSuperAdminLoginChallenge(pool, normalizedChallengeId);
    const sessionToken = signSessionToken(user);

    return res.status(200).json({
      status: "ok",
      trustedDeviceToken: nextTrustedDeviceToken,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        firstName: user.first_name || "",
        middleInitial: user.middle_initial || "",
        lastName: user.last_name || "",
        fullName: [
          user.first_name,
          user.middle_initial ? `${user.middle_initial}.` : "",
          user.last_name,
        ].filter(Boolean).join(" "),
        sessionToken,
      },
    });
  } catch (error) {
    return res.status(503).json({
      status: "error",
      message: `Unable to verify super admin login (${error.message}).`,
    });
  }
});

app.post("/api/auth/super-admin/resend-code", async (req, res) => {
  const { challengeId } = req.body ?? {};
  const normalizedChallengeId = String(challengeId || "").trim();

  if (!normalizedChallengeId) {
    return res.status(400).json({
      status: "error",
      message: "Challenge id is required.",
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
    const existingChallenge = await getSuperAdminLoginChallenge(
      pool,
      normalizedChallengeId,
    );

    if (!existingChallenge) {
      return res.status(400).json({
        status: "error",
        message: "No super admin verification request was found.",
      });
    }

    const now = Date.now();
    const resendAvailableAt = new Date(
      existingChallenge.resend_available_at,
    ).getTime();
    if (
      Number.isFinite(resendAvailableAt) &&
      resendAvailableAt > now
    ) {
      return res.status(429).json({
        status: "error",
        message: "Please wait before requesting another code.",
        retryAfterSeconds: Math.ceil((resendAvailableAt - now) / 1000),
      });
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = hashSecret(code);
    const expiresAtIso = new Date(
      now + SUPER_ADMIN_LOGIN_CODE_EXPIRY_MS,
    ).toISOString();
    const resendAvailableAtIso = new Date(
      now + SUPER_ADMIN_LOGIN_RESEND_COOLDOWN_MS,
    ).toISOString();

    const delivery = await sendSuperAdminLoginCodeEmail({
      toEmail: existingChallenge.email,
      code,
    });

    if (!delivery.sent) {
      return res.status(503).json({
        status: "error",
        message: `Unable to resend verification code (${delivery.reason || "unknown reason"}).`,
      });
    }

    await upsertSuperAdminLoginChallenge(pool, {
      challengeId: normalizedChallengeId,
      userId: existingChallenge.user_id,
      email: existingChallenge.email,
      codeHash,
      expiresAtIso,
      resendAvailableAtIso,
    });

    return res.status(200).json({
      status: "ok",
      message: "Verification code sent.",
      retryAfterSeconds: Math.ceil(
        SUPER_ADMIN_LOGIN_RESEND_COOLDOWN_MS / 1000,
      ),
    });
  } catch (error) {
    return res.status(503).json({
      status: "error",
      message: `Unable to resend super admin verification code (${error.message}).`,
    });
  }
});

app.post("/api/auth/super-admin/trust-device", async (req, res) => {
  const { userId, sessionToken } = req.body ?? {};
  const normalizedUserId = Number(userId);
  const normalizedSessionToken = String(sessionToken || "").trim();

  if (!Number.isFinite(normalizedUserId) || !normalizedSessionToken) {
    return res.status(400).json({
      status: "error",
      message: "User id and session token are required.",
    });
  }

  if (!verifySessionToken(normalizedSessionToken, normalizedUserId, "super_admin")) {
    return res.status(401).json({
      status: "error",
      message: "Invalid session token.",
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
    const trustedDeviceToken = crypto.randomBytes(32).toString("hex");

    await trustSuperAdminDevice(pool, {
      userId: normalizedUserId,
      deviceTokenHash: hashSecret(trustedDeviceToken),
      label: "Trusted browser",
      expiresAtIso: new Date(
        Date.now() + SUPER_ADMIN_TRUSTED_DEVICE_TTL_MS,
      ).toISOString(),
    });

    return res.status(200).json({
      status: "ok",
      trustedDeviceToken,
    });
  } catch (error) {
    return res.status(503).json({
      status: "error",
      message: `Unable to trust this device (${error.message}).`,
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

    const existingSession = await getPasswordResetSession(
      pool,
      normalizedEmail,
    );
    const now = Date.now();
    const existingResendAt = existingSession?.resend_available_at
      ? new Date(existingSession.resend_available_at).getTime()
      : 0;
    if (Number.isFinite(existingResendAt) && existingResendAt > now) {
      return res.status(429).json({
        status: "error",
        message: "Please wait before requesting another code.",
        retryAfterSeconds: Math.ceil((existingResendAt - now) / 1000),
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
    const codeHash = hashSecret(code);
    const expiresAtIso = new Date(now + FORGOT_CODE_EXPIRY_MS).toISOString();
    const resendAvailableAtIso = new Date(
      now + FORGOT_RESEND_COOLDOWN_MS,
    ).toISOString();

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

    await pool.query(
      `
      INSERT INTO password_reset_sessions (
        email,
        user_id,
        code_hash,
        verified,
        reset_token_hash,
        expires_at,
        resend_available_at
      )
      VALUES ($1, $2, $3, FALSE, NULL, $4::timestamptz, $5::timestamptz)
      ON CONFLICT (email)
      DO UPDATE SET
        user_id = EXCLUDED.user_id,
        code_hash = EXCLUDED.code_hash,
        verified = FALSE,
        reset_token_hash = NULL,
        expires_at = EXCLUDED.expires_at,
        resend_available_at = EXCLUDED.resend_available_at
      `,
      [normalizedEmail, user.id, codeHash, expiresAtIso, resendAvailableAtIso],
    );

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
    const session = await getPasswordResetSession(pool, normalizedEmail);

    if (!session) {
      return res.status(400).json({
        status: "error",
        message: "No verification request found for this email.",
      });
    }

    const expiresAt = new Date(session.expires_at).getTime();
    if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) {
      await removePasswordResetSession(pool, normalizedEmail);
      return res.status(400).json({
        status: "error",
        message: "Verification code expired. Please request a new one.",
      });
    }

    const incomingCodeHash = hashSecret(normalizedCode);
    if (incomingCodeHash !== session.code_hash) {
      return res.status(400).json({
        status: "error",
        message: "Invalid verification code.",
      });
    }

    const resetToken = crypto.randomBytes(24).toString("hex");
    const resetTokenHash = hashSecret(resetToken);

    await pool.query(
      `
      UPDATE password_reset_sessions
      SET
        verified = TRUE,
        reset_token_hash = $1
      WHERE email = $2
      `,
      [resetTokenHash, normalizedEmail],
    );

    return res.status(200).json({
      status: "ok",
      message: "Code verified.",
      resetToken,
    });
  } catch (error) {
    return res.status(503).json({
      status: "error",
      message: `Unable to verify code (${error.message}).`,
    });
  }
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

  if (!isPasswordStrong(newPassword)) {
    return res.status(400).json({
      status: "error",
      message: getPasswordValidationError(newPassword),
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
    const session = await getPasswordResetSession(pool, normalizedEmail);
    const incomingResetTokenHash = hashSecret(resetToken);

    if (
      !session ||
      !session.verified ||
      session.reset_token_hash !== incomingResetTokenHash
    ) {
      return res.status(401).json({
        status: "error",
        message: "Verification is required before resetting password.",
      });
    }

    const expiresAt = new Date(session.expires_at).getTime();
    if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) {
      await removePasswordResetSession(pool, normalizedEmail);
      return res.status(400).json({
        status: "error",
        message: "Reset session expired. Please request a new code.",
      });
    }

    const passwordHash = await bcrypt.hash(String(newPassword), 12);

    const updateResult = await pool.query(
      `
      UPDATE users
      SET password_hash = $1
      WHERE id = $2
      RETURNING id
      `,
      [passwordHash, session.user_id],
    );

    if (!updateResult.rows?.[0]) {
      return res.status(404).json({
        status: "error",
        message: "Account not found.",
      });
    }

    await removePasswordResetSession(pool, normalizedEmail);

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
        middle_initial,
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

// Verify current password endpoint
app.post("/api/verify-password", async (req, res) => {
  const { password } = req.body ?? {};

  if (!password) {
    return res.status(400).json({
      status: "error",
      isValid: false,
      message: "Password is required.",
    });
  }

  if (!hasDbConfig()) {
    return res.status(500).json({
      status: "error",
      isValid: false,
      message: "Database environment variables are missing.",
      missing: getMissingDbVars(),
    });
  }

  try {
    await ensureAuthDatabaseReady();
    const pool = getDbPool();

    // Get current user from request headers or session
    // For now, we'll get the user ID from the request - in production you'd get this from session/JWT
    const userId = req.headers['x-user-id'];
    
    if (!userId) {
      return res.status(401).json({
        status: "error",
        isValid: false,
        message: "User not authenticated.",
      });
    }

    // Get the user's password hash
    const userResult = await pool.query(
      `
      SELECT id, password_hash
      FROM users
      WHERE id = $1
      LIMIT 1
      `,
      [userId],
    );

    const user = userResult.rows?.[0] || null;

    if (!user) {
      return res.status(404).json({
        status: "error",
        isValid: false,
        message: "User not found.",
      });
    }

    // Compare passwords using bcrypt
    const isValid = await bcrypt.compare(
      String(password),
      user.password_hash,
    );

    if (isValid) {
      return res.status(200).json({
        status: "ok",
        isValid: true,
        message: "Password is correct.",
      });
    } else {
      return res.status(401).json({
        status: "error",
        isValid: false,
        message: "Password is incorrect.",
      });
    }
  } catch (error) {
    console.error("Error verifying password:", error);
    return res.status(503).json({
      status: "error",
      isValid: false,
      message: `Unable to verify password (${error.message}).`,
    });
  }
});

app.put("/api/profile/admin", async (req, res) => {
  const {
    id,
    username,
    email,
    firstName,
    middleInitial,
    lastName,
    currentPassword,
    newPassword,
    confirmPassword,
  } = req.body ?? {};

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
    const existingUserResult = await pool.query(
      `
      SELECT id, username, password_hash, role
      FROM users
      WHERE id = $1
        AND role IN ('admin', 'super_admin')
      LIMIT 1
      `,
      [id],
    );

    const existingUser = existingUserResult.rows?.[0] || null;

    if (!existingUser) {
      return res.status(404).json({
        status: "error",
        message: "Admin profile not found.",
      });
    }

    const wantsPasswordChange = Boolean(newPassword || confirmPassword);

    if (wantsPasswordChange) {
      if (!currentPassword) {
        return res.status(400).json({
          status: "error",
          message: "Current password is required to change password.",
        });
      }

      if (!newPassword) {
        return res.status(400).json({
          status: "error",
          message: "New password is required.",
        });
      }

      if (!confirmPassword) {
        return res.status(400).json({
          status: "error",
          message: "Confirm password is required.",
        });
      }

      if (String(newPassword) !== String(confirmPassword)) {
        return res.status(400).json({
          status: "error",
          message: "New password and confirm password do not match.",
        });
      }

      if (!isPasswordStrong(newPassword)) {
        return res.status(400).json({
          status: "error",
          message: getPasswordValidationError(newPassword),
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

    const cleanedFirst = formatStudentNameSegment(firstName);
    const cleanedMiddle = String(middleInitial || "")
      .trim()
      .replace(/\./g, "")
      .slice(0, 1)
      .toUpperCase();
    const cleanedLast = formatStudentNameSegment(lastName);
    const normalizedEmail = String(email || "")
      .trim()
      .toLowerCase();
    const fullName = [
      cleanedFirst || "Admin",
      cleanedMiddle ? `${cleanedMiddle}.` : "",
      cleanedLast || "User",
    ]
      .filter(Boolean)
      .join(" ")
      .trim();
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
      WHERE id = $5
        AND role IN ('admin', 'super_admin')
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

    const updatedUser = Array.isArray(userUpdate.rows)
      ? userUpdate.rows[0]
      : null;

    if (!updatedUser) {
      return res.status(404).json({
        status: "error",
        message: "Admin profile not found.",
      });
    }

    const adminUpdate = await pool.query(
      `
      INSERT INTO "Admins" (user_id, email, first_name, middle_initial, last_name, full_name)
      VALUES ($1, $2, $3, NULLIF($4, ''), $5, $6)
      ON CONFLICT (user_id) DO UPDATE
      SET
        email = EXCLUDED.email,
        first_name = EXCLUDED.first_name,
        middle_initial = EXCLUDED.middle_initial,
        last_name = EXCLUDED.last_name,
        full_name = EXCLUDED.full_name
      RETURNING user_id, email, first_name, middle_initial, last_name, full_name
      `,
      [
        updatedUser.id,
        normalizedEmail,
        cleanedFirst || "Admin",
        cleanedMiddle,
        cleanedLast || "User",
        fullName,
      ],
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
        role: updatedUser.role,
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
        middleInitial: updatedAdmin.middle_initial || "",
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
    middleInitial,
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

    const wantsPasswordChange = Boolean(newPassword || confirmPassword);

    if (wantsPasswordChange) {
      if (!currentPassword) {
        return res.status(400).json({
          status: "error",
          message:
            "Current password is required to change password.",
        });
      }

      if (!newPassword) {
        return res.status(400).json({
          status: "error",
          message:
            "New password is required.",
        });
      }

      if (!confirmPassword) {
        return res.status(400).json({
          status: "error",
          message:
            "Confirm password is required.",
        });
      }

      if (String(newPassword) !== String(confirmPassword)) {
        return res.status(400).json({
          status: "error",
          message: "New password and confirm password do not match.",
        });
      }

      if (!isPasswordStrong(newPassword)) {
        return res.status(400).json({
          status: "error",
          message: getPasswordValidationError(newPassword),
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

    const cleanedFirst = formatStudentNameSegment(firstName);
    const cleanedMiddle = formatStudentMiddleInitial(middleInitial);
    const cleanedLast = formatStudentNameSegment(lastName);
    const fullName = buildStudentFullName(
      cleanedFirst,
      cleanedMiddle,
      cleanedLast,
    );
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
        middle_initial = NULLIF($4, ''),
        last_name = COALESCE(NULLIF($5, ''), last_name),
        full_name = COALESCE(NULLIF($6, ''), full_name)
      WHERE user_id = $7
      RETURNING id, user_id, school_id, email, first_name, middle_initial, last_name, full_name, program, year_section, violation_count
      `,
      [
        schoolId || null,
        normalizedEmail || null,
        cleanedFirst || null,
        cleanedMiddle || null,
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
        middleInitial: updatedStudent.middle_initial || "",
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

app.get("/api/admin-accounts", async (req, res) => {
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
        u.id,
        u.username,
        u.role,
        u.is_active,
        u.created_at,
        u.updated_at,
        a.email,
        a.first_name,
        a.middle_initial,
        a.last_name,
        a.full_name
      FROM users u
      INNER JOIN "Admins" a ON a.user_id = u.id
      WHERE u.role IN ('admin', 'super_admin')
      ORDER BY
        CASE WHEN u.role = 'super_admin' THEN 0 ELSE 1 END,
        LOWER(a.last_name) ASC,
        LOWER(a.first_name) ASC,
        u.id ASC
      `,
    );

    return res.status(200).json({
      status: "ok",
      accounts: result.rows || [],
    });
  } catch (error) {
    return res.status(503).json({
      status: "error",
      message: `Unable to load admin accounts (${error.message}).`,
    });
  }
});

app.post("/api/admin-accounts", async (req, res) => {
  const { firstName, lastName, email, role } = req.body ?? {};
  const cleanedFirst = formatStudentNameSegment(firstName);
  const cleanedLast = formatStudentNameSegment(lastName);
  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();
  const normalizedRole = normalizeAdminRole(role);

  if (!cleanedFirst || !cleanedLast || !normalizedEmail) {
    return res.status(400).json({
      status: "error",
      message: "firstName, lastName, role, and email are required.",
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

    const existingEmail = await pool.query(
      `
      SELECT u.id
      FROM users u
      INNER JOIN "Admins" a ON a.user_id = u.id
      WHERE LOWER(a.email) = $1
      LIMIT 1
      `,
      [normalizedEmail],
    );

    if (existingEmail.rows?.[0]) {
      return res.status(409).json({
        status: "error",
        message: "Email already exists. Please use a different email.",
      });
    }

    const generatedUsername = await generateAdminUsername(
      pool,
      cleanedFirst,
      cleanedLast,
    );
    const generatedPassword = generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(generatedPassword, 10);
    const fullName = `${cleanedFirst} ${cleanedLast}`.trim();

    const userInsert = await pool.query(
      `
      INSERT INTO users (username, password_hash, role, first_name, last_name, is_active)
      VALUES ($1, $2, $3, $4, $5, TRUE)
      RETURNING id, username, role
      `,
      [
        generatedUsername,
        passwordHash,
        normalizedRole,
        cleanedFirst,
        cleanedLast,
      ],
    );

    const createdUser = userInsert.rows?.[0] || null;

    const adminInsert = await pool.query(
      `
      INSERT INTO "Admins" (user_id, email, first_name, last_name, full_name)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING user_id, email, first_name, middle_initial, last_name, full_name
      `,
      [createdUser.id, normalizedEmail, cleanedFirst, cleanedLast, fullName],
    );

    const createdAccount = {
      ...(adminInsert.rows?.[0] || {}),
      id: createdUser.id,
      username: createdUser.username,
      role: createdUser.role,
      is_active: true,
    };

    await logAuditEvent(req, {
      action: "CREATE_ADMIN_ACCOUNT",
      targetType: "admin_account",
      targetId: createdUser.id,
      details: `Added ${formatRoleLabel(normalizedRole)} account for ${fullName}.`,
      metadata: {
        email: normalizedEmail,
        role: normalizedRole,
        emailQueued: true,
      },
    });

    res.status(201).json({
      status: "ok",
      account: createdAccount,
      emailQueued: true,
    });

    setImmediate(() => {
      sendAdminCredentialEmail({
        toEmail: normalizedEmail,
        firstName: cleanedFirst,
        username: createdUser.username,
        password: generatedPassword,
        role: normalizedRole,
      }).then((delivery) => {
        if (!delivery.sent) {
          console.error(
            `[Admin Create] Failed to send credential email to ${normalizedEmail}: ${delivery.reason || "unknown reason"}`,
          );
        }
      }).catch((emailError) => {
        console.error(
          `[Admin Create] Failed to send credential email to ${normalizedEmail}: ${emailError?.message || emailError}`,
        );
      });
    });

    return;
  } catch (error) {
    if (String(error?.code || "") === "23505") {
      const detail = String(error?.detail || "").toLowerCase();
      const constraint = String(error?.constraint || "").toLowerCase();

      if (detail.includes("email") || constraint.includes("email")) {
        return res.status(409).json({
          status: "error",
          message: "Email already exists. Please use a different email.",
        });
      }

      if (detail.includes("username") || constraint.includes("username")) {
        return res.status(409).json({
          status: "error",
          message: "Username already exists. Please try again.",
        });
      }
    }

    return res.status(503).json({
      status: "error",
      message: `Unable to create admin account (${error.message}).`,
    });
  }
});

app.put("/api/admin-accounts/:id", async (req, res) => {
  const { id } = req.params;
  const { firstName, lastName, email, role, isActive } = req.body ?? {};
  const cleanedFirst = formatStudentNameSegment(firstName);
  const cleanedLast = formatStudentNameSegment(lastName);
  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();
  const normalizedRole = normalizeAdminRole(role);

  if (!id || !cleanedFirst || !cleanedLast || !normalizedEmail) {
    return res.status(400).json({
      status: "error",
      message: "id, firstName, lastName, role, and email are required.",
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
    const fullName = `${cleanedFirst} ${cleanedLast}`.trim();

    const emailConflict = await pool.query(
      `
      SELECT u.id
      FROM users u
      INNER JOIN "Admins" a ON a.user_id = u.id
      WHERE LOWER(a.email) = $1
        AND u.id <> $2
      LIMIT 1
      `,
      [normalizedEmail, id],
    );

    if (emailConflict.rows?.[0]) {
      return res.status(409).json({
        status: "error",
        message: "Email already exists. Please use a different email.",
      });
    }

    const userUpdate = await pool.query(
      `
      UPDATE users
      SET
        role = $1,
        first_name = $2,
        last_name = $3,
        is_active = COALESCE($4, is_active)
      WHERE id = $5
        AND role IN ('admin', 'super_admin')
      RETURNING id, username, role, is_active
      `,
      [
        normalizedRole,
        cleanedFirst,
        cleanedLast,
        typeof isActive === "boolean" ? isActive : null,
        id,
      ],
    );

    const updatedUser = userUpdate.rows?.[0] || null;

    if (!updatedUser) {
      return res.status(404).json({
        status: "error",
        message: "Admin account not found.",
      });
    }

    const adminUpdate = await pool.query(
      `
      UPDATE "Admins"
      SET
        email = $1,
        first_name = $2,
        last_name = $3,
        full_name = $4
      WHERE user_id = $5
      RETURNING user_id, email, first_name, middle_initial, last_name, full_name
      `,
      [normalizedEmail, cleanedFirst, cleanedLast, fullName, id],
    );

    const updatedAccount = {
      ...(adminUpdate.rows?.[0] || {}),
      id: updatedUser.id,
      username: updatedUser.username,
      role: updatedUser.role,
      is_active: updatedUser.is_active,
    };

    await logAuditEvent(req, {
      action: "UPDATE_ADMIN_ACCOUNT",
      targetType: "admin_account",
      targetId: updatedUser.id,
      details: `Updated ${formatRoleLabel(updatedUser.role)} account for ${fullName}.`,
      metadata: {
        email: normalizedEmail,
        role: updatedUser.role,
        isActive: updatedUser.is_active,
      },
    });

    return res.status(200).json({
      status: "ok",
      account: updatedAccount,
    });
  } catch (error) {
    return res.status(503).json({
      status: "error",
      message: `Unable to update admin account (${error.message}).`,
    });
  }
});

app.delete("/api/admin-accounts/:id", async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({
      status: "error",
      message: "Admin account id is required.",
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

    const accountLookup = await pool.query(
      `
      SELECT
        u.id,
        u.role,
        u.username,
        a.email,
        a.full_name
      FROM users u
      INNER JOIN "Admins" a ON a.user_id = u.id
      WHERE u.id = $1
        AND u.role IN ('admin', 'super_admin')
      LIMIT 1
      `,
      [id],
    );

    const account = accountLookup.rows?.[0] || null;

    if (!account) {
      return res.status(404).json({
        status: "error",
        message: "Admin account not found.",
      });
    }

    await pool.query(`DELETE FROM "Admins" WHERE user_id = $1`, [id]);
    await pool.query(
      `DELETE FROM users WHERE id = $1 AND role IN ('admin', 'super_admin')`,
      [id],
    );

    await logAuditEvent(req, {
      action: "DELETE_ADMIN_ACCOUNT",
      targetType: "admin_account",
      targetId: id,
      details: `Deleted ${formatRoleLabel(account.role)} account for ${account.full_name || account.username}.`,
      metadata: {
        email: account.email,
        role: account.role,
        username: account.username,
      },
    });

    return res.status(200).json({
      status: "ok",
      message: "Admin account deleted successfully.",
    });
  } catch (error) {
    return res.status(503).json({
      status: "error",
      message: `Unable to delete admin account (${error.message}).`,
    });
  }
});

app.get("/api/students", async (req, res) => {
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
    const archived = req.query.archived === "true"; // Parameter to filter archived users

    const result = await pool.query(
      `
      SELECT
        s.id,
        s.user_id,
        u.username,
        s.email,
        s.school_id,
        s.full_name,
        s.first_name,
        s.middle_initial,
        s.last_name,
        s.program,
        s.year_section,
        s.status,
        COALESCE(
          CASE
            WHEN s.is_archived = true THEN COALESCE(archived_total_count, 0)
            ELSE COALESCE(active_unresolved_count, 0) + COALESCE(archive_unresolved_count, 0)
          END,
          0
        ) AS violation_count,
        s.is_archived,
        s.archived_at,
        s.archived_reason,
        s.original_status
      FROM "Students" s
      LEFT JOIN users u ON u.id = s.user_id
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS active_unresolved_count
        FROM student_violation_logs svl
        WHERE svl.student_id = s.id AND svl.cleared_at IS NULL
      ) active_count ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS archive_unresolved_count
        FROM student_violation_archives sva
        WHERE sva.student_id = s.id AND sva.is_unresolved = TRUE
      ) archive_count ON true
      LEFT JOIN LATERAL (
        SELECT (
          SELECT COUNT(*)::int FROM student_violation_logs svl WHERE svl.student_id = s.id
        ) + (
          SELECT COUNT(*)::int FROM student_violation_archives sva WHERE sva.student_id = s.id
        ) AS archived_total_count
      ) full_archived_count ON true
      WHERE s.is_archived = $1
      ORDER BY s.id ASC
    `,
      [archived],
    );

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

app.post("/api/students/import", (req, res) => {
  studentWorkbookUpload.single("file")(req, res, async (uploadError) => {
    if (uploadError) {
      return res.status(400).json({
        status: "error",
        message: uploadError.message || "Unable to read the uploaded workbook.",
      });
    }

    if (!req.file?.buffer) {
      return res.status(400).json({
        status: "error",
        message: "Please attach an Excel workbook first.",
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
      const importedStudents = parseStudentWorkbook(req.file.buffer);
      const preview = await buildStudentImportPreview(pool, importedStudents);
      const mode = String(req.body?.mode || "apply").trim().toLowerCase();
      const overwriteExisting =
        String(req.body?.overwriteExisting || "").trim().toLowerCase() === "true";

      if (mode === "preview") {
        return res.status(200).json({
          status: "ok",
          mode: "preview",
          totalRows: importedStudents.length,
          duplicateCount: preview.duplicateCount,
          importableCount: preview.importableCount,
          duplicates: preview.duplicates,
        });
      }

      const createdCredentials = [];
      let createdCount = 0;
      let overwrittenCount = 0;
      let skippedDuplicateCount = 0;

      if (!dbSql) {
        throw new Error("Database connection is not configured.");
      }

      try {
        await dbSql.begin(async (tx) => {
        for (const row of preview.preparedRows) {
          const { student, existingStudent, isDuplicate } = row;

          if (isDuplicate && !overwriteExisting) {
            skippedDuplicateCount += 1;
            continue;
          }

          if (isDuplicate && overwriteExisting) {
            let username = String(existingStudent?.username || "").trim();

            if (existingStudent?.user_id) {
              const userUpdate = await tx.unsafe(
                `
                UPDATE users
                SET
                  first_name = $1,
                  last_name = $2,
                  is_active = TRUE
                WHERE id = $3 AND role = 'student'
                RETURNING username
                `,
                [student.firstName, student.lastName, existingStudent.user_id],
              );

              username = userUpdate?.[0]?.username || username || "";
            }

            await tx.unsafe(
              `
              UPDATE "Students"
              SET
                email = $1,
                school_id = $2,
                first_name = $3,
                middle_initial = $4,
                last_name = $5,
                full_name = $6,
                program = $7,
                year_section = $8,
                year_level = $9,
                status = $10,
                is_archived = FALSE,
                archived_at = NULL,
                archived_reason = NULL,
                original_status = NULL,
                is_unresolved_archive = FALSE
              WHERE id = $11
              `,
              [
                student.email,
                student.schoolId,
                student.firstName,
                student.middleInitial || null,
                student.lastName,
                student.fullName,
                student.program,
                student.yearSection,
                student.yearLevel,
                student.status,
                existingStudent.id,
              ],
            );

            overwrittenCount += 1;
            continue;
          }

          const generatedUsername = await generateStudentUsername(
            {
              query: async (text, params = []) => {
                const rows =
                  params.length > 0
                    ? await tx.unsafe(text, params)
                    : await tx.unsafe(text);
                return { rows: Array.isArray(rows) ? rows : [] };
              },
            },
            student.firstName,
            student.lastName,
          );
          const generatedPassword = generateTemporaryPassword();
          const passwordHash = await bcrypt.hash(generatedPassword, 10);

          const userInsert = await tx.unsafe(
            `
            INSERT INTO users (username, password_hash, role, first_name, last_name, is_active)
            VALUES ($1, $2, 'student', $3, $4, TRUE)
            RETURNING id, username
            `,
            [
              generatedUsername,
              passwordHash,
              student.firstName,
              student.lastName,
            ],
          );

          const userId = userInsert?.[0]?.id;
          const username = userInsert?.[0]?.username || generatedUsername;

          await tx.unsafe(
            `
            INSERT INTO "Students"
              (user_id, email, school_id, first_name, middle_initial, last_name, full_name, program, year_section, year_level, status, violation_count)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 0)
            `,
            [
              userId,
              student.email,
              student.schoolId,
              student.firstName,
              student.middleInitial || null,
              student.lastName,
              student.fullName,
              student.program,
              student.yearSection,
              student.yearLevel,
              student.status,
            ],
          );

          createdCredentials.push({
            email: student.email,
            firstName: student.firstName,
            username,
            password: generatedPassword,
            schoolId: student.schoolId,
          });
          createdCount += 1;
        }
        });
      } catch (transactionError) {
        throw transactionError;
      }

      await logAuditEvent(req, {
        action: "IMPORT_STUDENTS",
        targetType: "student",
        details: `Imported students from workbook ${req.file.originalname || "upload"}: created ${createdCount}, overwritten ${overwrittenCount}, skipped duplicates ${skippedDuplicateCount}.`,
        metadata: {
          createdCount,
          overwrittenCount,
          skippedDuplicateCount,
          duplicateCount: preview.duplicateCount,
          workbook: req.file.originalname || "",
          overwriteExisting,
        },
      });

      res.status(201).json({
        status: "ok",
        message: `Imported ${createdCount} new students successfully.`,
        importedCount: createdCount,
        overwrittenCount,
        skippedDuplicateCount,
        duplicateCount: preview.duplicateCount,
        emailQueuedCount: createdCredentials.length,
      });

      Promise.allSettled(
        createdCredentials.map((credential) =>
          sendStudentCredentialEmail({
            toEmail: credential.email,
            firstName: credential.firstName,
            username: credential.username,
            password: credential.password,
          }),
        ),
      ).then((results) => {
        results.forEach((result, index) => {
          if (result.status === "rejected") {
            const failedEmail = createdCredentials[index]?.email || "unknown";
            console.error(
              `[Student Import] Failed to send credential email to ${failedEmail}: ${result.reason?.message || result.reason}`,
            );
          }
        });
      });
    } catch (error) {
      return res.status(503).json({
        status: "error",
        message: `Unable to import students (${error.message}).`,
      });
    }
  });
});

app.post("/api/students", async (req, res) => {
  const { schoolId, email, firstName, middleInitial, lastName, program, yearSection, status } =
    req.body ?? {};
  let createdUserId = null;
  let createdStudentId = null;
  const normalizedSchoolId = String(schoolId || "").trim();
  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();
  const cleanedFirst = formatStudentNameSegment(firstName);
  const cleanedMiddleInitial = formatStudentMiddleInitial(middleInitial);
  const cleanedLast = formatStudentNameSegment(lastName);
  const normalizedProgram = String(program || "").trim();
  const normalizedYearSection = String(yearSection || "").trim();

  if (
    !normalizedSchoolId ||
    !normalizedEmail ||
    !cleanedFirst ||
    !cleanedLast ||
    !normalizedProgram ||
    !normalizedYearSection
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
    const fullName = buildStudentFullName(
      cleanedFirst,
      cleanedMiddleInitial,
      cleanedLast,
    );

    const [existingSchoolIdResult, existingEmailResult] = await Promise.all([
      pool.query(
        `SELECT id FROM "Students" WHERE LOWER(school_id) = LOWER($1) LIMIT 1`,
        [normalizedSchoolId],
      ),
      pool.query(`SELECT id FROM "Students" WHERE LOWER(email) = $1 LIMIT 1`, [
        normalizedEmail,
      ]),
    ]);

    if (existingSchoolIdResult.rows?.[0]) {
      return res.status(409).json({
        status: "error",
        message: "School ID already exists. Please use a unique School ID.",
      });
    }

    if (existingEmailResult.rows?.[0]) {
      return res.status(409).json({
        status: "error",
        message: "Email already exists. Please use a different email.",
      });
    }

    const generatedUsername = await generateStudentUsername(
      pool,
      cleanedFirst,
      cleanedLast,
    );
    const generatedPassword = generateTemporaryPassword();
    // Cost 10 is bcrypt's standard default — still very secure for a
    // randomly-generated temporary password and ~4x faster than cost 12.
    const passwordHash = await bcrypt.hash(generatedPassword, 10);

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

    let initialYearLevel = 1;
    const yearSectionMatch = normalizedYearSection.match(/^(\d+)/);
    if (yearSectionMatch) {
      const parsedLevel = Number(yearSectionMatch[1]);
      if (Number.isFinite(parsedLevel) && parsedLevel >= 1) {
        initialYearLevel = Math.floor(parsedLevel);
      }
    }

    const result = await pool.query(
      `
      INSERT INTO "Students"
        (user_id, email, school_id, first_name, middle_initial, last_name, full_name, program, year_section, year_level, status, violation_count)
      VALUES ($1, $2, $3, $4, NULLIF($5, ''), $6, $7, $8, $9, $10, $11, 0)
      RETURNING id, user_id, email, school_id, full_name, first_name, middle_initial, last_name, program, year_section, year_level, status, violation_count
      `,
      [
        userId,
        normalizedEmail,
        normalizedSchoolId,
        cleanedFirst,
        cleanedMiddleInitial,
        cleanedLast,
        fullName,
        normalizedProgram,
        normalizedYearSection,
        initialYearLevel,
        normalizedStatus,
      ],
    );
    createdStudentId = result.rows?.[0]?.id || null;

    const createdStudent = result.rows?.[0] || null;

    await logAuditEvent(req, {
      action: "CREATE_STUDENT",
      targetType: "student",
      targetId: createdStudent?.id,
      details: `Added student ${createdStudent?.full_name || fullName}.`,
      metadata: {
        schoolId: createdStudent?.school_id || normalizedSchoolId,
        program: createdStudent?.program || normalizedProgram,
        yearSection: createdStudent?.year_section || normalizedYearSection,
      },
    });

    // Respond immediately — email is sent in the background so the admin
    // does not have to wait for SMTP to complete.
    res.status(201).json({
      status: "ok",
      student: createdStudent,
      credentials: {
        username: generatedUsername,
        password: generatedPassword,
      },
    });

    // Fire credential email after responding.
    sendStudentCredentialEmail({
      toEmail: normalizedEmail,
      firstName: cleanedFirst,
      username: generatedUsername,
      password: generatedPassword,
    }).catch((emailErr) => {
      console.error(
        `[Student Create] Failed to send credential email to ${email}: ${emailErr?.message || emailErr}`,
      );
    });
  } catch (error) {
    let conflictMessage = "";
    if (String(error?.code || "") === "23505") {
      const detail = String(error?.detail || "").toLowerCase();
      const constraint = String(error?.constraint || "").toLowerCase();

      if (detail.includes("school_id") || constraint.includes("school_id")) {
        conflictMessage =
          "School ID already exists. Please use a unique School ID.";
      }

      if (detail.includes("email") || constraint.includes("email")) {
        conflictMessage = "Email already exists. Please use a different email.";
      }
    }

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

    if (conflictMessage) {
      return res.status(409).json({
        status: "error",
        message: conflictMessage,
      });
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
    middleInitial,
    lastName,
    program,
    yearSection,
    yearLevel,
    status,
    violationCount,
    isArchived,
    archivedReason,
    isUnresolvedArchive,
    deactivateAccount,
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

    const cleanedFirst = formatStudentNameSegment(firstName);
    const cleanedMiddleInitial = formatStudentMiddleInitial(middleInitial);
    const cleanedLast = formatStudentNameSegment(lastName);
    const normalizedUsername = String(username || "").trim();
    const normalizedSchoolId = String(schoolId || "").trim();
    const normalizedEmail = String(email || "")
      .trim()
      .toLowerCase();
    const normalizedProgram = String(program || "").trim();
    const normalizedYearSection = String(yearSection || "").trim();
    let normalizedStatus = String(status || "").trim();
    let normalizedYearLevel = null;
    const fullName = buildStudentFullName(
      cleanedFirst,
      cleanedMiddleInitial,
      cleanedLast,
    );

    const studentData = await pool.query(
      `SELECT year_level, year_section, status FROM "Students" WHERE id = $1 LIMIT 1`,
      [id],
    );
    const student = studentData.rows?.[0];

    // Determine existing student year level from year_level column or year_section prefix
    let existingYearLevel = null;
    if (student?.year_level != null) {
      existingYearLevel = Number(student.year_level);
      if (!Number.isFinite(existingYearLevel)) {
        existingYearLevel = null;
      }
    }

    if (existingYearLevel == null && student?.year_section) {
      const sectionYearMatch = String(student.year_section || "")
        .trim()
        .match(/^\s*(\d+)/);
      if (sectionYearMatch) {
        existingYearLevel = Number(sectionYearMatch[1]);
      }
    }

    // If archiving a 4th year student, automatically set status to "Graduated" (only if no specific reason provided)
    if (
      isArchived === true &&
      existingYearLevel === 4 &&
      !archivedReason?.trim()
    ) {
      normalizedStatus = "Graduated";
    }

    // Handle archiving with reason
    let normalizedArchivedReason = null;
    let normalizedOriginalStatus = null;
    if (isArchived === true && archivedReason && archivedReason.trim()) {
      normalizedArchivedReason = archivedReason.trim();
      // Store the current status as original status before archiving
      normalizedOriginalStatus =
        student?.status || normalizedStatus || "Regular";
      // Keep the status unchanged - store reason separately
      // The reason will be used for display in Archives page
    }

    let computedUnresolvedArchive = null;
    if (isArchived === true) {
      const activeUnresolvedResult = await pool.query(
        `SELECT COUNT(*)::int AS count FROM student_violation_logs WHERE student_id = $1 AND cleared_at IS NULL`,
        [id],
      );
      const unresolvedArchiveResult = await pool.query(
        `SELECT COUNT(*)::int AS count FROM student_violation_archives WHERE student_id = $1 AND is_unresolved = TRUE`,
        [id],
      );

      const activeUnresolvedCount = Number(
        activeUnresolvedResult.rows?.[0]?.count || 0,
      );
      const unresolvedArchiveCount = Number(
        unresolvedArchiveResult.rows?.[0]?.count || 0,
      );

      computedUnresolvedArchive = activeUnresolvedCount + unresolvedArchiveCount > 0;
    }

    // If yearSection is provided, keep year_level in sync based on section prefix
    if (normalizedYearSection) {
      const sectionYearMatch = normalizedYearSection.match(/^(\d+)/);
      if (sectionYearMatch) {
        const parsedYearSectionLevel = Number(sectionYearMatch[1]);
        if (Number.isFinite(parsedYearSectionLevel)) {
          normalizedYearLevel = parsedYearSectionLevel;
        }
      }
    }

    // Direct year_level update from request payload (highest priority)
    if (yearLevel != null) {
      const parsedYearLevel = Number(yearLevel);
      if (Number.isFinite(parsedYearLevel) && parsedYearLevel > 0) {
        normalizedYearLevel = Math.floor(parsedYearLevel);
      }
    }

    // Direct year_level update from request payload (highest priority)
    if (yearLevel != null) {
      const parsedYearLevel = Number(yearLevel);
      if (Number.isFinite(parsedYearLevel) && parsedYearLevel > 0) {
        normalizedYearLevel = Math.floor(parsedYearLevel);
      }
    }

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
        middle_initial = CASE WHEN $4::text IS NULL THEN middle_initial ELSE NULLIF($4, '') END,
        last_name = COALESCE(NULLIF($5, ''), last_name),
        full_name = COALESCE(NULLIF($6, ''), full_name),
        program = COALESCE(NULLIF($7, ''), program),
        year_section = COALESCE(NULLIF($8, ''), year_section),
        year_level = COALESCE($11::int, year_level),
        status = COALESCE(NULLIF($9, ''), status),
        violation_count = COALESCE(GREATEST($10::int, 0), violation_count),
        is_archived = CASE WHEN $13::boolean IS NOT NULL THEN $13::boolean ELSE is_archived END,
        archived_at = CASE WHEN $13::boolean IS NOT NULL AND $13::boolean THEN COALESCE(archived_at, NOW()) ELSE archived_at END,
        archived_reason = CASE WHEN $13::boolean IS NOT NULL AND $13::boolean THEN COALESCE(NULLIF($14, ''), archived_reason) ELSE archived_reason END,
        original_status = CASE WHEN $13::boolean IS NOT NULL AND $13::boolean THEN COALESCE(NULLIF($15, ''), original_status) ELSE original_status END,
        is_unresolved_archive = CASE WHEN $13::boolean IS NOT NULL AND $13::boolean THEN COALESCE($16::boolean, FALSE) ELSE is_unresolved_archive END
      WHERE id = $12
      RETURNING id, user_id, email, school_id, full_name, first_name, middle_initial, last_name, program, year_section, year_level, status, violation_count, is_archived, archived_at, archived_reason, original_status, is_unresolved_archive
      `,
      [
        normalizedEmail || null,
        normalizedSchoolId || null,
        cleanedFirst || null,
        cleanedMiddleInitial || "",
        cleanedLast || null,
        fullName || null,
        normalizedProgram || null,
        normalizedYearSection || null,
        normalizedStatus || null,
        violationCount ?? null,
        normalizedYearLevel ?? null,
        id,
        isArchived ?? null,
        normalizedArchivedReason || null,
        normalizedOriginalStatus || null,
        computedUnresolvedArchive !== null
          ? computedUnresolvedArchive
          : isUnresolvedArchive ?? null,
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

    // If status is set to "Graduated", deactivate the user account and send email
    if (normalizedStatus === "Graduated" && updatedStudent.user_id) {
      await pool.query(
        `UPDATE users SET is_active = FALSE WHERE id = $1 AND role = 'student'`,
        [updatedStudent.user_id],
      );

      // Send deactivation email
      try {
        const userEmail = updatedStudent.email;
        const transporter = getMailTransporter();
        if (userEmail && transporter) {
          await transporter.sendMail({
            from: process.env.SMTP_FROM || process.env.SMTP_USER,
            to: userEmail,
            subject: "Account Deactivated - Graduation",
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #333;">Account Deactivated</h2>
                <p>Dear ${updatedStudent.full_name || "Student"},</p>
                <p>Your account has been deactivated because your status has been updated to "Graduated".</p>
                <p>You will no longer be able to log in to the system.</p>
                <p>If you believe this is an error, please contact your administrator.</p>
                <br>
                <p>Best regards,<br>Student Violation Management System</p>
              </div>
            `,
          });
        } else if (userEmail) {
          console.warn("SMTP not configured. Graduation deactivation email was skipped for:", userEmail);
        }
      } catch (emailError) {
        console.error("Failed to send graduation deactivation email:", emailError);
        // Don't fail the request if email fails
      }
    }

    // If archiving and deactivateAccount is true, deactivate the user account and send email
    if (isArchived === true && deactivateAccount === true && updatedStudent.user_id) {
      await pool.query(
        `UPDATE users SET is_active = FALSE WHERE id = $1 AND role = 'student'`,
        [updatedStudent.user_id],
      );

      // Send deactivation email
      try {
        const userEmail = updatedStudent.email;
        const transporter = getMailTransporter();
        if (userEmail && transporter) {
          await transporter.sendMail({
            from: process.env.SMTP_FROM || process.env.SMTP_USER,
            to: userEmail,
            subject: "Account Deactivated - Archived",
            html: buildSystemEmailShell({
              eyebrow: "SVMS Security",
              heading: "Account Deactivated",
              lead: "Your student record has been archived.",
              contentHtml: `
                <div style="margin-bottom:18px;padding:14px;border-radius:12px;background:#fef2f2;border:1px solid #fecaca;">
                  <p style="margin:0 0 10px 0;font-size:13px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#991b1b;">Record Archived</p>
                  <p style="margin:0 0 8px 0;color:#7f1d1d;font-size:14px;line-height:1.6;">Your account has been deactivated because your record has been archived.</p>
                  <p style="margin:0;color:#7f1d1d;font-size:14px;line-height:1.6;"><strong>Reason:</strong> ${escapeHtml(normalizedArchivedReason || "Not specified")}</p>
                </div>
                <div style="margin:18px 0;padding:12px 14px;border-radius:12px;background:#f3f4f6;border:1px solid #d1d5db;">
                  <p style="margin:0;color:#374151;font-size:13px;line-height:1.6;">You will no longer be able to log in to the Student Violation Management System. If you believe this is an error, please contact your administrator.</p>
                </div>
              `,
              footerNote: "This is an automated message from Student Violation Management System. Please do not reply to this email.",
            }),
          });
        } else if (userEmail) {
          console.warn("SMTP not configured. Archive deactivation email was skipped for:", userEmail);
        }
      } catch (emailError) {
        console.error("Failed to send archive deactivation email:", emailError);
        // Don't fail the request if email fails
      }
    }

    const actionDetails = isArchived
      ? `Archived student ${updatedStudent.full_name}.`
      : `Updated student ${updatedStudent.full_name}.`;
    await logAuditEvent(req, {
      action: isArchived ? "ARCHIVE_STUDENT" : "UPDATE_STUDENT",
      targetType: "student",
      targetId: updatedStudent.id,
      details: actionDetails,
      metadata: {
        schoolId: updatedStudent.school_id,
        program: updatedStudent.program,
        yearSection: updatedStudent.year_section,
        isArchived: updatedStudent.is_archived,
      },
    });

    return res.status(200).json({
      status: "ok",
      student: updatedStudent,
    });
  } catch (error) {
    if (String(error?.code || "") === "23505") {
      const detail = String(error?.detail || "").toLowerCase();
      const constraint = String(error?.constraint || "").toLowerCase();

      if (detail.includes("school_id") || constraint.includes("school_id")) {
        return res.status(409).json({
          status: "error",
          message: "School ID already exists. Please use a unique School ID.",
        });
      }

      if (detail.includes("email") || constraint.includes("email")) {
        return res.status(409).json({
          status: "error",
          message: "Email already exists. Please use a different email.",
        });
      }

      if (detail.includes("username") || constraint.includes("username")) {
        return res.status(409).json({
          status: "error",
          message: "Username already exists. Please use a different username.",
        });
      }
    }

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

app.post("/api/students/alerts", async (req, res) => {
  const { studentIds, alertType, message } = req.body ?? {};

  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    return res.status(400).json({
      status: "error",
      message: "Please select at least one student first.",
    });
  }

  const normalizedAlertType = String(alertType || "").trim();
  const normalizedMessage = String(message || "").trim();

  if (!normalizedAlertType) {
    return res.status(400).json({
      status: "error",
      message: "Alert type is required.",
    });
  }

  if (!normalizedMessage) {
    return res.status(400).json({
      status: "error",
      message: "Alert message is required.",
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
    const normalizedStudentIds = Array.from(
      new Set(
        studentIds
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id) && id > 0),
      ),
    );

    if (normalizedStudentIds.length === 0) {
      return res.status(400).json({
        status: "error",
        message: "Please select at least one student first.",
      });
    }

    const insertedNotifications = [];
    const skippedStudents = [];
    const emailDelivered = [];
    const emailFailures = [];
    const studentLookup = await pool.query(
      `
      SELECT id, user_id, school_id, full_name, program, year_section, violation_count, email
      FROM "Students"
      WHERE id = ANY($1::int[])
      `,
      [normalizedStudentIds],
    );
    const studentById = new Map(
      (studentLookup.rows || []).map((row) => [Number(row.id), row]),
    );

    const emailCandidates = normalizedStudentIds
      .map((studentId) => studentById.get(Number(studentId)))
      .filter((student) => student?.user_id);

    const validNotificationStudents = [];
    for (const studentId of normalizedStudentIds) {
      const student = studentById.get(Number(studentId));
      if (!student?.user_id) {
        skippedStudents.push({
          studentId,
          reason: "Student account not found.",
        });
        continue;
      }
      validNotificationStudents.push(student);
    }

    for (const studentChunk of chunkArray(validNotificationStudents, 12)) {
      const notificationChunkResults = await Promise.all(
        studentChunk.map(async (student) => {
          const activeViolationCount = Number(student.violation_count || 0);
          const metadata = {
            type: "admin_alert",
            alertType: normalizedAlertType,
            adminMessage: normalizedMessage,
            studentId: Number(student.id),
            schoolId: student.school_id || null,
            studentName: student.full_name || null,
            program: student.program || null,
            yearSection: student.year_section || null,
            activeViolationCount,
            sentAt: new Date().toISOString(),
          };

          const insertedNotification = await insertNotificationForUser(
            pool,
            Number(student.user_id),
            {
              title: `${normalizedAlertType} from Admin`,
              description: normalizedMessage,
              metadata,
            },
          );

          return {
            notificationId: Number.isFinite(Number(insertedNotification?.id))
              ? Number(insertedNotification.id)
              : null,
            createdAt: insertedNotification?.created_at || null,
            studentId: Number(student.id),
          };
        }),
      );

      insertedNotifications.push(...notificationChunkResults);
    }

    for (const student of emailCandidates) {
      const studentEmail = String(student.email || "")
        .trim()
        .toLowerCase();

      if (!studentEmail || !studentEmail.includes("@")) {
        emailFailures.push({
          studentId: Number(student.id),
          reason: "Student email address is missing or invalid.",
        });
      }
    }

    const validEmailStudents = emailCandidates.filter((student) => {
      const studentEmail = String(student.email || "")
        .trim()
        .toLowerCase();
      return studentEmail && studentEmail.includes("@");
    });

    for (const studentChunk of chunkArray(validEmailStudents, 5)) {
      const emailChunkResults = await Promise.all(
        studentChunk.map(async (student) => {
          const studentEmail = String(student.email || "")
            .trim()
            .toLowerCase();
          const activeViolationCount = Number(student.violation_count || 0);
          const emailResult = await sendStudentAdminAlertEmail({
            toEmail: studentEmail,
            studentName: student.full_name,
            alertType: normalizedAlertType,
            message: normalizedMessage,
            activeViolationCount,
            program: student.program,
            yearSection: student.year_section,
          });

          return {
            studentId: Number(student.id),
            email: studentEmail,
            emailResult,
          };
        }),
      );

      emailChunkResults.forEach(({ studentId, email, emailResult }) => {
        if (emailResult.sent) {
          emailDelivered.push({
            studentId,
            email,
          });
          return;
        }

        emailFailures.push({
          studentId,
          email,
          reason: emailResult.reason || "Unable to send student alert email.",
        });
      });
    }

    if (insertedNotifications.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "No notifications were sent. Please verify selected students.",
        skippedStudents,
      });
    }

    await logAuditEvent(req, {
      action: "SEND_STUDENT_ALERT",
      targetType: "student_notification",
      details: `Sent ${normalizedAlertType} alert to ${insertedNotifications.length} student${insertedNotifications.length === 1 ? '' : 's'}.`,
      metadata: {
        alertType: normalizedAlertType,
        messageLength: normalizedMessage.length,
        recipients: insertedNotifications.map((entry) => entry.studentId),
        emailedRecipients: emailDelivered.map((entry) => entry.studentId),
        emailFailureCount: emailFailures.length,
        skippedStudents,
      },
    });

    return res.status(201).json({
      status: "ok",
      sentCount: insertedNotifications.length,
      emailSentCount: emailDelivered.length,
      emailFailedCount: emailFailures.length,
      notifications: insertedNotifications,
      skippedStudents,
      emailFailures,
    });
  } catch (error) {
    return res.status(503).json({
      status: "error",
      message: `Unable to send alerts (${error.message}).`,
    });
  }
});

async function refreshStudentViolationCount(pool, studentId) {
  // For archived students, count all violations (active + archived)
  // For active students, count only unresolved active violations
  const countQuery = `
    SELECT
      CASE
        WHEN s.is_archived = true THEN (
          SELECT COUNT(*)::int
          FROM student_violation_logs svl
          WHERE svl.student_id = $1
        ) + (
          SELECT COUNT(*)::int
          FROM student_violation_archives sva
          WHERE sva.student_id = $1
        )
        ELSE (
          SELECT COUNT(*)::int
          FROM student_violation_logs svl
          WHERE svl.student_id = $1 AND svl.cleared_at IS NULL
        ) + (
          SELECT COUNT(*)::int
          FROM student_violation_archives sva
          WHERE sva.student_id = $1 AND sva.is_unresolved = TRUE
        )
      END as total_count
    FROM "Students" s
    WHERE s.id = $1
  `;

  const countResult = await pool.query(countQuery, [studentId]);
  const totalCount = countResult.rows?.[0]?.total_count || 0;

  await pool.query(
    `UPDATE "Students" SET violation_count = $2 WHERE id = $1`,
    [studentId, totalCount],
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
      s.first_name,
      s.middle_initial,
      s.last_name,
      s.program,
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

app.get("/api/violation-analytics", async (req, res) => {
  const requestedSchoolYear = req.query.schoolYear
    ? String(req.query.schoolYear).trim()
    : null;
  const requestedSemester = req.query.semester
    ? normalizeSemester(String(req.query.semester).trim())
    : null;
  let workbookRecords = [];
  let databaseRecords = [];
  let archivedRecords = [];
  let currentSemester = "";
  let currentSchoolYear = "";

  try {
    if (hasDbConfig()) {
      await ensureAuthDatabaseReady();
      const pool = getDbPool();
      await ensureArchiveColumnsExist(pool);
      await maybeSyncHistoricalWorkbookRecordsToDatabase(pool);

      const settingsResult = await pool.query(
        `
        SELECT current_semester, current_school_year
        FROM "SystemSettings"
        WHERE setting_key = 'system_config'
        LIMIT 1
        `,
      );

      const settings = settingsResult.rows?.[0] || {};
      currentSemester = String(settings.current_semester || "").trim();
      currentSchoolYear = String(settings.current_school_year || "").trim();

      const targetSchoolYear = requestedSchoolYear || currentSchoolYear;
      const targetSemester =
        requestedSemester ||
        (requestedSchoolYear ? null : normalizeSemester(currentSemester));

      if (!targetSchoolYear) {
        return res.status(400).json({
          status: "error",
          message:
            "No school year specified and no current school year configured.",
        });
      }

      const normalizedCurrentSemester = normalizeSemester(currentSemester);
      const isCurrentTargetTerm =
        targetSchoolYear === currentSchoolYear &&
        targetSemester &&
        normalizedCurrentSemester === targetSemester;

      if (isCurrentTargetTerm && targetSemester) {
        const currentResult = await pool.query(
          `
          SELECT
            svl.student_id,
            svl.created_at,
            svl.semester,
            svl.school_year,
            svl.violation_label,
            s.full_name,
            s.program,
            s.year_section,
            v.degree AS violation_degree
          FROM student_violation_logs svl
          LEFT JOIN "Students" s ON s.id = svl.student_id
          LEFT JOIN violations v ON v.id = svl.violation_catalog_id
          WHERE svl.school_year = $1 AND svl.semester = $2
          ORDER BY svl.created_at ASC, svl.id ASC
          `,
          [targetSchoolYear, targetSemester],
        );

        databaseRecords = (currentResult.rows || []).map((row, index) => {
          const createdAt = new Date(row.created_at);
          const inferredTerm = inferAcademicTermFromDate(createdAt);
          const semester =
            normalizeSemester(row.semester) ||
            normalizeSemester(inferredTerm.semester);
          const schoolYear =
            normalizeSchoolYear(row.school_year) ||
            normalizeSchoolYear(inferredTerm.schoolYear);

          const safeName = String(row.full_name || "").trim();
          const studentKey = Number.isFinite(Number(row.student_id))
            ? `student:${Number(row.student_id)}`
            : safeName
              ? `name:${safeName.toLowerCase()}`
              : `current-row:${index}`;

          return {
            source: "current",
            studentKey,
            studentName: safeName,
            program: String(row.program || "").trim(),
            yearSection: String(row.year_section || "").trim(),
            violationLabel: String(row.violation_label || "").trim(),
            degreeRank: parseDegreeRank(row.violation_degree),
            date: createdAt,
            monthLabel: toMonthLabel(createdAt),
            semester,
            schoolYear,
          };
        });
      } else {
        const archivedResult = await pool.query(
          `
          SELECT
            sva.id,
            sva.student_id,
            sva.created_at,
            sva.original_created_at,
            sva.archived_at,
            sva.semester,
            sva.school_year,
            sva.violation_label,
            s.full_name,
            s.program,
            s.year_section,
            v.degree AS violation_degree
          FROM student_violation_archives sva
          LEFT JOIN "Students" s ON s.id = sva.student_id
          LEFT JOIN violations v ON v.id = sva.violation_catalog_id
          WHERE sva.school_year = $1 AND sva.semester = $2
          ORDER BY sva.created_at ASC, sva.id ASC
          `,
          [targetSchoolYear, targetSemester],
        );

        const archiveDatabaseRecords = (archivedResult.rows || []).map(
          (row, index) => {
            const createdAt = new Date(
              row.original_created_at || row.archived_at || row.created_at,
            );
            const semester = normalizeSemester(row.semester);
            const schoolYear = normalizeSchoolYear(row.school_year);

            const safeName = String(row.full_name || "").trim();
            const studentKey = Number.isFinite(Number(row.student_id))
              ? `student:${Number(row.student_id)}`
              : safeName
                ? `name:${safeName.toLowerCase()}`
                : `archive-row:${index}`;

            return {
              source: "archived",
              studentKey,
              studentName: safeName,
              program: String(row.program || "").trim(),
              yearSection: String(row.year_section || "").trim(),
              violationLabel: String(row.violation_label || "").trim(),
              degreeRank: parseDegreeRank(row.violation_degree),
              date: createdAt,
              monthLabel: toMonthLabel(createdAt),
              semester,
              schoolYear,
            };
          },
        );
        archivedRecords = [...archiveDatabaseRecords];
        databaseRecords = [...archivedRecords];
      }
    } else {
      workbookRecords = await loadHistoricalViolationRecordsFromWorkbook();
    }

    const selectedRecordsSource =
      databaseRecords.length > 0 ? databaseRecords : workbookRecords;
    const mergedRecords = selectedRecordsSource.filter((record) => {
      const semester = normalizeSemester(record.semester);
      const schoolYear = normalizeSchoolYear(record.schoolYear);
      const hasTerm = semester && schoolYear;
      const hasValidDate = !Number.isNaN(new Date(record.date).getTime());
      const matchesYear = requestedSchoolYear
        ? schoolYear === requestedSchoolYear
        : true;
      const matchesSemester = requestedSemester
        ? semester === requestedSemester
        : true;
      return hasTerm && hasValidDate && matchesYear && matchesSemester;
    });

    if (mergedRecords.length > 0 && !currentSemester && !currentSchoolYear) {
      const latestRecord = mergedRecords[mergedRecords.length - 1];
      currentSemester = String(latestRecord.semester || "").trim();
      currentSchoolYear = String(latestRecord.schoolYear || "").trim();
    }

    const analytics = buildAnalyticsFromRecords({
      allRecords: mergedRecords,
      currentSemester,
      currentSchoolYear,
    });

    // Add information about ongoing semesters
    const targetSchoolYear = requestedSchoolYear || currentSchoolYear;
    const ongoingSemesters = {};
    if (
      targetSchoolYear === currentSchoolYear &&
      requestedSemester &&
      normalizeSemester(currentSemester) === requestedSemester
    ) {
      ongoingSemesters[
        SEMESTER_DISPLAY_MAP[requestedSemester] || requestedSemester
      ] = true;
    }

    return res.status(200).json({
      status: "ok",
      ...analytics,
      ongoingSemesters,
      targetSchoolYear,
      metadata: {
        historicalRecordCount: workbookRecords.length,
        databaseRecordCount: databaseRecords.length,
        archivedRecordCount: archivedRecords.length,
        currentRecordCount: databaseRecords.length - archivedRecords.length,
        totalAnalyzedRecords: mergedRecords.length,
      },
    });
  } catch (error) {
    return res.status(503).json({
      status: "error",
      message: `Unable to compute violation analytics (${error.message}).`,
    });
  }
});

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
        CASE
          WHEN svl.signature_image IS NOT NULL AND TRIM(svl.signature_image) <> ''
          THEN TRUE
          ELSE FALSE
        END AS has_signature,
        svl.signature_updated_at,
        svl.cleared_at,
        svl.cleared_by_user_id,
        svl.cleared_by_name,
        svl.created_at,
        svl.updated_at,
        s.school_id,
        s.full_name,
        s.first_name,
        s.middle_initial,
        s.last_name,
        s.program,
        s.year_section,
        v.category AS violation_category,
        v.degree AS violation_degree,
        v.name AS violation_name
      FROM student_violation_logs svl
      INNER JOIN "Students" s ON s.id = svl.student_id
      INNER JOIN violations v ON v.id = svl.violation_catalog_id
      ORDER BY svl.cleared_at NULLS FIRST, svl.created_at DESC, svl.id DESC
      `,
      [],
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
        CASE
          WHEN svl.signature_image IS NOT NULL AND TRIM(svl.signature_image) <> ''
          THEN TRUE
          ELSE FALSE
        END AS has_signature,
        svl.signature_updated_at,
        svl.cleared_at,
        svl.cleared_by_user_id,
        svl.cleared_by_name,
        svl.created_at,
        svl.updated_at,
        svl.semester,
        svl.school_year,
        s.school_id,
        s.full_name,
        s.first_name,
        s.middle_initial,
        s.last_name,
        s.year_section,
        v.category AS violation_category,
        v.degree AS violation_degree,
        v.name AS violation_name
      FROM student_violation_logs svl
      INNER JOIN "Students" s ON s.id = svl.student_id
      INNER JOIN violations v ON v.id = svl.violation_catalog_id
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
    dateLogged,
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

  if (!Number.isFinite(parsedCatalogId)) {
    return res.status(400).json({
      status: "error",
      message: "violationCatalogId is required.",
    });
  }

  if (!violationLabel || !String(violationLabel).trim()) {
    return res.status(400).json({
      status: "error",
      message: "violationLabel is required.",
    });
  }

  if (!dateLogged || !String(dateLogged).trim()) {
    return res.status(400).json({
      status: "error",
      message: "dateLogged is required.",
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

    // Get current semester and school year from system settings
    const settingsResult = await pool.query(
      `SELECT current_semester, current_school_year
       FROM "SystemSettings"
       WHERE setting_key = 'system_config'
       LIMIT 1`,
    );
    const settings = settingsResult.rows?.[0] || {};
    const currentSemester = settings.current_semester || "1ST SEM";
    const currentSchoolYear = settings.current_school_year || "2025-2026";

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

    const parsedLoggedDate = parseCellDate(String(dateLogged).trim());
    if (!parsedLoggedDate) {
      return res.status(400).json({
        status: "error",
        message: "Invalid dateLogged value.",
      });
    }

    const createdAtValue = toArchiveTimestamp(parsedLoggedDate);
    const loggedDateKey = formatWorkbookComparisonDate(parsedLoggedDate);

    const duplicateCheck = await pool.query(
      `SELECT id
       FROM student_violation_logs
       WHERE student_id = $1
         AND COALESCE(violation_catalog_id, -1) = COALESCE($2, -1)
         AND LOWER(TRIM(violation_label)) = LOWER(TRIM($3))
         AND created_at::date = $4::date
       LIMIT 1`,
      [
        parsedStudentId,
        parsedCatalogId,
        String(violationLabel).trim(),
        loggedDateKey,
      ],
    );

    if (duplicateCheck.rows?.[0]) {
      return res.status(409).json({
        status: "error",
        message:
          "A violation for this student with the same violation type and date already exists.",
        duplicateId: duplicateCheck.rows[0].id,
      });
    }

    const insertResult = await pool.query(
      `
      INSERT INTO student_violation_logs
        (student_id, violation_catalog_id, violation_label, reported_by, remarks, signature_image, signature_updated_at, semester, school_year, created_at)
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6::text,
        CASE WHEN $6::text IS NULL OR $6::text = '' THEN NULL ELSE NOW() END,
        $7,
        $8,
        $9
      )
      RETURNING id, student_id, violation_catalog_id, violation_label, reported_by, remarks, signature_image,
                signature_updated_at, cleared_at, cleared_by_user_id, cleared_by_name, created_at, updated_at, semester, school_year
      `,
      [
        parsedStudentId,
        parsedCatalogId,
        String(violationLabel).trim(),
        String(reportedBy || "").trim() || null,
        String(remarks || "").trim() || null,
        String(signatureImage || "").trim() || null,
        currentSemester || "1ST SEM",
        currentSchoolYear || "2025-2026",
        createdAtValue,
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

  // Protect against very large payloads (extra safety beyond express.json limit)
  try {
    const sizeBytes = Buffer.byteLength(String(signatureImage), 'utf8');
    const MAX_BYTES = VERCEL_SAFE_UPLOAD_LIMIT_BYTES;
    if (sizeBytes > MAX_BYTES) {
      return res.status(413).json({ status: 'error', message: 'Signature image too large.' });
    }
  } catch (_err) {
    // ignore size check failures and continue
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

app.get("/api/student-violations/:id/signature", async (req, res) => {
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
      SELECT id, signature_image
      FROM student_violation_logs
      WHERE id = $1
      LIMIT 1
      `,
      [id],
    );

    const record = result.rows?.[0] || null;
    if (!record) {
      return res.status(404).json({
        status: "error",
        message: "Record not found.",
      });
    }

    const signatureImage = String(record.signature_image || "").trim() || null;

    return res.status(200).json({
      status: "ok",
      id: Number(record.id),
      hasSignature: Boolean(signatureImage),
      signatureImage,
    });
  } catch (error) {
    return res.status(503).json({
      status: "error",
      message: `Unable to fetch signature (${error.message}).`,
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

    // Require a signature before a violation can be cleared from the Student Violation tab
    const existing = await pool.query(
      `SELECT id, signature_image FROM student_violation_logs WHERE id = $1 LIMIT 1`,
      [id],
    );

    const existingRecord = existing.rows?.[0] || null;
    if (!existingRecord) {
      return res
        .status(404)
        .json({ status: "error", message: "Record not found." });
    }

    if (
      !existingRecord.signature_image ||
      String(existingRecord.signature_image).trim() === ""
    ) {
      return res.status(400).json({
        status: "error",
        message:
          "Signature is required before marking this violation as cleared.",
      });
    }

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

    // If the student is archived in the unresolved folder and all active and archived unresolved violations are cleared,
    // move them automatically to the main Archived Users folder.
    if (updated.student_id) {
      const studentArchiveStatus = await pool.query(
        `SELECT is_archived, is_unresolved_archive FROM "Students" WHERE id = $1 LIMIT 1`,
        [updated.student_id],
      );
      const studentArchiveRow = studentArchiveStatus.rows?.[0] || {};
      if (studentArchiveRow.is_archived && studentArchiveRow.is_unresolved_archive) {
        const activeUnresolvedCountResult = await pool.query(
          `SELECT COUNT(*)::int AS count FROM student_violation_logs WHERE student_id = $1 AND cleared_at IS NULL`,
          [updated.student_id],
        );
        const unresolvedArchiveCountResult = await pool.query(
          `SELECT COUNT(*)::int AS count FROM student_violation_archives WHERE student_id = $1 AND is_unresolved = TRUE`,
          [updated.student_id],
        );

        const activeUnresolvedCount = Number(
          activeUnresolvedCountResult.rows?.[0]?.count || 0,
        );
        const unresolvedArchiveCount = Number(
          unresolvedArchiveCountResult.rows?.[0]?.count || 0,
        );

        if (activeUnresolvedCount === 0 && unresolvedArchiveCount === 0) {
          await pool.query(
            `UPDATE "Students" SET is_unresolved_archive = FALSE WHERE id = $1`,
            [updated.student_id],
          );
        }
      }
    }

    // Note: For Student Violation tab clear action, do NOT auto-promote immediately.
    // Promotion is handled during archive flow to ensure student records first land in the
    // correct school year/semester archive view and keep section/year before promotion.
    const promotionResult = null;

    await logAuditEvent(req, {
      action: "CLEAR_STUDENT_VIOLATION_LOG",
      targetType: "student_violation",
      targetId: updated.id,
      details: `Cleared student violation log #${updated.id}.`,
      metadata: {
        clearedAt: updated.cleared_at,
        promotion: promotionResult,
      },
    });

    const fullRecord = await getFullViolationRecord(pool, updated.id);

    return res.status(200).json({
      status: "ok",
      record: fullRecord || updated,
      promotion: promotionResult,
    });
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
    const {
      resolvedLogoPath: decryptedLogoPath,
      normalizedPersistedValue,
    } = await normalizePersistedLogoPath(settings.logo_path);
    if (
      normalizedPersistedValue &&
      normalizedPersistedValue !== settings.logo_path
    ) {
      await pool.query(
        `UPDATE "SystemSettings" SET logo_path = $1 WHERE id = $2`,
        [normalizedPersistedValue, settings.id],
      );
    }

    return res.status(200).json({
      status: "ok",
      settings: {
        id: settings.id,
        settingKey: settings.setting_key,
        displayName:
          settings.display_name || "Student Violation Management System",
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

app.get("/api/settings/logo", async (_req, res) => {
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
      `SELECT id, logo_path
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
    const {
      resolvedLogoPath: logoPath,
      normalizedPersistedValue,
    } = await normalizePersistedLogoPath(settings.logo_path);
    if (
      normalizedPersistedValue &&
      normalizedPersistedValue !== settings.logo_path
    ) {
      await pool.query(
        `UPDATE "SystemSettings" SET logo_path = $1 WHERE id = $2`,
        [normalizedPersistedValue, settings.id],
      );
    }

    return res.status(200).json({
      status: "ok",
      logoPath: logoPath || null,
    });
  } catch (error) {
    return res.status(503).json({
      status: "error",
      message: `Unable to fetch logo (${error.message}).`,
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
    const {
      resolvedLogoPath: decryptedLogoPath,
      normalizedPersistedValue,
    } = await normalizePersistedLogoPath(settings.logo_path);
    if (
      normalizedPersistedValue &&
      normalizedPersistedValue !== settings.logo_path
    ) {
      await pool.query(
        `UPDATE "SystemSettings" SET logo_path = $1 WHERE id = $2`,
        [normalizedPersistedValue, settings.id],
      );
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

      const {
        logoPath,
        encryptedPath,
      } = await persistLogoBuffer(req.file.buffer, req.file.mimetype, {
        fileName: req.file.originalname,
      });

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
      await insertNotificationForAllStudents(pool, {
        title: notifTitle,
        description: notifDesc,
        metadata: { type: "violation_added", violationId: parent.id },
      });
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
      await insertNotificationForAllStudents(pool, {
        title: notifTitle,
        description: notifDesc,
        metadata: {
          type: "violation_updated",
          violationId: result.rows[0].id,
        },
      });
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
      await insertNotificationForAllStudents(pool, {
        title: notifTitle,
        description: notifDesc,
        metadata: {
          type: "violation_deleted",
          violationId: id,
          violationName: violation.name,
        },
      });
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

app.post('/api/pusher/auth', express.urlencoded({ extended: false }), async (req, res) => {
  if (!pusherClient) {
    return res.status(503).json({ error: 'Realtime service is not configured.' });
  }

  const socketId = String(req.body?.socket_id || req.body?.socketId || '').trim();
  const channelName = String(req.body?.channel_name || req.body?.channelName || '').trim();
  const { actorUserId, actorRole } = getAuditActor(req);
  const sessionToken = String(req.get("x-session-token") || "").trim();

  if (!socketId || !channelName) {
    return res.status(400).json({ error: 'Missing socket or channel information.' });
  }

  if (!Number.isFinite(actorUserId)) {
    return res.status(401).json({ error: 'Missing actor identity.' });
  }

  if (actorRole !== 'student') {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  if (!verifySessionToken(sessionToken, actorUserId, actorRole)) {
    return res.status(401).json({ error: 'Invalid session token.' });
  }

  const expectedChannelName = `private-notifications-${actorUserId}`;
  if (channelName !== expectedChannelName) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  try {
    const authResponse = pusherClient.authorizeChannel(socketId, channelName);
    return res.json(authResponse);
  } catch (error) {
    console.error('Pusher auth error:', error);
    return res.status(500).json({ error: 'Unable to authorize channel.' });
  }
});

// helper to resolve current user from headers
function getCurrentUserId(req) {
  const { actorUserId } = getAuditActor(req);
  return actorUserId || null;
}

function normalizeNotificationRow(row) {
  if (!row) return null;

  const notification = {
    id: Number(row.id),
    studentUserId: Number(row.studentUserId ?? row.student_user_id),
    title: row.title,
    description: row.description,
    metadata: row.metadata ?? null,
    created_at: row.created_at || row.createdAt || null,
    read_at: row.read_at || row.readAt || null,
  };

  try {
    notification.metadata = notification.metadata
      ? JSON.parse(JSON.stringify(notification.metadata))
      : null;
  } catch {
    // keep raw metadata if normalization fails
  }

  return notification;
}

async function publishNotificationRow(row) {
  const notification = normalizeNotificationRow(row);
  if (!notification || !Number.isFinite(notification.studentUserId)) {
    return null;
  }

  if (pusherClient) {
    try {
      await pusherClient.trigger(
        `private-notifications-${notification.studentUserId}`,
        "notification",
        notification,
      );
    } catch {
      // ignore realtime publish failures; the record is still stored in the DB
    }
  }

  return notification;
}

async function publishNotificationRows(rows) {
  const normalizedRows = Array.isArray(rows) ? rows : [];
  for (const row of normalizedRows) {
    await publishNotificationRow(row);
  }
}

async function insertNotificationForUser(
  pool,
  studentUserId,
  { title, description, metadata = null },
) {
  const parsedStudentUserId = Number(studentUserId);
  if (!Number.isFinite(parsedStudentUserId)) {
    return null;
  }

  const insertedResult = await pool.query(
    `
    INSERT INTO notifications (student_user_id, title, description, metadata)
    VALUES ($1, $2, $3, $4::jsonb)
    RETURNING id, student_user_id AS "studentUserId", title, description, metadata, created_at, read_at
    `,
    [
      parsedStudentUserId,
      String(title || "Update"),
      String(description || "A record related to your account was updated."),
      metadata ? JSON.stringify(metadata) : null,
    ],
  );

  return publishNotificationRow(insertedResult.rows?.[0] || null);
}

async function insertNotificationForAllStudents(
  pool,
  { title, description, metadata = null },
) {
  const insertedResult = await pool.query(
    `
    INSERT INTO notifications (student_user_id, title, description, metadata)
    SELECT u.id, $1, $2, $3::jsonb
    FROM users u
    WHERE u.role = 'student'
    RETURNING id, student_user_id AS "studentUserId", title, description, metadata, created_at, read_at
    `,
    [
      String(title || "Update"),
      String(description || "A record related to your account was updated."),
      metadata ? JSON.stringify(metadata) : null,
    ],
  );

  await publishNotificationRows(insertedResult.rows || []);
  return insertedResult.rows || [];
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

  return insertNotificationForUser(pool, studentUserId, {
    title: String(title || "Update"),
    description: String(
      description || "A record related to your violations was updated.",
    ),
    metadata,
  });
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

// mark specific notification as unread
app.put("/api/notifications/:id/mark-unread", async (req, res) => {
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
      `UPDATE notifications SET read_at = NULL
       WHERE id = $1 AND student_user_id = $2
       RETURNING id`,
      [id, userId],
    );

    if (!result.rows?.[0]) {
      return res.status(404).json({
        status: "error",
        message: "Notification not found.",
      });
    }

    return res.status(200).json({ status: "ok" });
  } catch (error) {
    return res.status(503).json({
      status: "error",
      message: `Unable to mark notification unread (${error.message}).`,
    });
  }
});

// delete a specific notification
app.delete("/api/notifications/:id", async (req, res) => {
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
      `DELETE FROM notifications
       WHERE id = $1 AND student_user_id = $2
       RETURNING id`,
      [id, userId],
    );

    if (!result.rows?.[0]) {
      return res.status(404).json({
        status: "error",
        message: "Notification not found.",
      });
    }

    return res
      .status(200)
      .json({ status: "ok", message: "Notification deleted successfully." });
  } catch (error) {
    return res.status(503).json({
      status: "error",
      message: `Unable to delete notification (${error.message}).`,
    });
  }
});

// delete multiple notifications
app.delete("/api/notifications", async (req, res) => {
  if (!hasDbConfig()) {
    return res
      .status(500)
      .json({ status: "error", message: "Database is not configured." });
  }

  try {
    await ensureAuthDatabaseReady();
    const pool = getDbPool();
    const userId = getCurrentUserId(req);
    const { notification_ids } = req.body;

    if (!userId) {
      return res
        .status(400)
        .json({ status: "error", message: "User not identified." });
    }

    if (!Array.isArray(notification_ids) || notification_ids.length === 0) {
      return res.status(400).json({
        status: "error",
        message: "notification_ids must be a non-empty array.",
      });
    }

    const result = await pool.query(
      `DELETE FROM notifications
       WHERE id = ANY($1) AND student_user_id = $2
       RETURNING id`,
      [notification_ids, userId],
    );

    return res.status(200).json({
      status: "ok",
      message: `${result.rowCount} notification${result.rowCount === 1 ? '' : 's'} deleted successfully.`,
      deleted_count: result.rowCount,
    });
  } catch (error) {
    return res.status(503).json({
      status: "error",
      message: `Unable to delete notifications (${error.message}).`,
    });
  }
});

// delete all notifications for current user
app.delete("/api/notifications/delete-all", async (req, res) => {
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
      `DELETE FROM notifications WHERE student_user_id = $1 RETURNING id`,
      [userId],
    );

    return res.status(200).json({
      status: "ok",
      message: `${result.rowCount} notification${result.rowCount === 1 ? '' : 's'} deleted successfully.`,
      deleted_count: result.rowCount,
    });
  } catch (error) {
    return res.status(503).json({
      status: "error",
      message: `Unable to delete notifications (${error.message}).`,
    });
  }
});

// ==================== ARCHIVE API ====================

// In-memory map to preserve archive record year_section snapshot (no DB schema change required)
const preservedArchiveYearSectionByViolationId = new Map();

// GET current semester and school year settings
app.get("/api/archive/current-settings", async (req, res) => {
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
      `SELECT current_semester, current_school_year
       FROM "SystemSettings"
       WHERE setting_key = 'system_config'
       LIMIT 1`,
    );

    if (!result.rows?.[0]) {
      return res.status(404).json({
        status: "error",
        message: "Settings not found.",
      });
    }

    const settings = result.rows[0];
    return res.status(200).json({
      status: "ok",
      currentSemester: settings.current_semester || "1ST SEM",
      currentSchoolYear: settings.current_school_year || "2025-2026",
    });
  } catch (error) {
    return res.status(503).json({
      status: "error",
      message: `Unable to fetch current settings (${error.message}).`,
    });
  }
});

function computeNextSemesterYear(semester, schoolYear) {
  const normalizedSemester = String(semester || "1ST SEM")
    .trim()
    .toUpperCase();
  let nextSemester = "2ND SEM";
  let nextSchoolYear = String(schoolYear || "2025-2026").trim();

  if (normalizedSemester === "1ST SEM") {
    nextSemester = "2ND SEM";
  } else if (normalizedSemester === "2ND SEM") {
    nextSemester = "SUMMER";
  } else if (normalizedSemester === "SUMMER") {
    const [startYear, endYear] = String(nextSchoolYear).split("-").map(Number);
    if (Number.isFinite(startYear) && Number.isFinite(endYear)) {
      nextSemester = "1ST SEM";
      nextSchoolYear = `${endYear}-${endYear + 1}`;
    } else {
      nextSemester = "1ST SEM";
    }
  } else {
    nextSemester = "2ND SEM";
  }

  return { nextSemester, nextSchoolYear };
}

async function checkAndAutoPromoteStudent(
  pool,
  studentId,
  violationSemester = null,
  violationSchoolYear = null,
) {
  if (!studentId) {
    return { isEligible: false, reason: "missing_student_id" };
  }

  // Count unresolved active violations
  const pendingResult = await pool.query(
    `SELECT COUNT(*)::int AS count FROM student_violation_logs WHERE student_id = $1 AND cleared_at IS NULL`,
    [studentId],
  );

  const unresolvedActiveCount = Number(pendingResult.rows?.[0]?.count || 0);

  // Count unresolved archive violations
  const unresolvedArchiveResult = await pool.query(
    `SELECT COUNT(*)::int AS count FROM student_violation_archives WHERE student_id = $1 AND is_unresolved = TRUE`,
    [studentId],
  );

  const unresolvedArchiveCount = Number(
    unresolvedArchiveResult.rows?.[0]?.count || 0,
  );
  const totalUnresolved = unresolvedActiveCount + unresolvedArchiveCount;

  if (totalUnresolved > 0) {
    return {
      isEligible: false,
      reason: "unresolved_violations",
      unresolvedCount: totalUnresolved,
    };
  }

  const studentResult = await pool.query(
    `SELECT id, year_level, year_section, status, is_archived, current_semester, current_school_year, last_promoted_school_year FROM "Students" WHERE id = $1 LIMIT 1`,
    [studentId],
  );

  const student = studentResult.rows?.[0];
  if (!student) {
    return { isEligible: false, reason: "student_not_found" };
  }

  if (student.is_archived) {
    return { isEligible: false, reason: "already_archived" };
  }

  let yearLevel = null;

  // Prefer year_section as the strongest source to avoid mismatches where year_level is stale
  if (student.year_section) {
    const match = String(student.year_section || "")
      .trim()
      .match(/^(\d+)/);
    if (match) {
      yearLevel = Number(match[1]);
    }
  }

  if (
    !Number.isFinite(yearLevel) &&
    Number.isFinite(Number(student.year_level))
  ) {
    yearLevel = Number(student.year_level);
  }

  const systemSettings = await pool.query(
    `SELECT current_semester, current_school_year FROM "SystemSettings" WHERE setting_key = 'system_config' LIMIT 1`,
  );

  const systemRow = systemSettings.rows?.[0] || {};
  const sourceSemester = String(
    violationSemester ||
      student.current_semester ||
      systemRow.current_semester ||
      "1ST SEM",
  )
    .trim()
    .toUpperCase();
  const sourceSchoolYear = String(
    violationSchoolYear ||
      student.current_school_year ||
      systemRow.current_school_year ||
      "2025-2026",
  ).trim();

  const { nextSemester, nextSchoolYear } = computeNextSemesterYear(
    sourceSemester,
    sourceSchoolYear,
  );

  let promoted = false;
  let graduated = false;
  let action = "none";

  // Promotion rule evaluation and Student update logic
  // - Archives should retain original year-level (preserved externally in front-end mapping)
  // - User Management (Students table) updates are applied here according to requirement.

  if (sourceSemester === "2ND SEM") {
    if (yearLevel === 4) {
      await pool.query(
        `UPDATE "Students"
         SET is_archived = TRUE,
             archived_at = COALESCE(archived_at, NOW()),
             status = 'Graduated',
             current_semester = $1,
             current_school_year = $2
         WHERE id = $3`,
        [nextSemester, nextSchoolYear, studentId],
      );
      action = "graduated";
      graduated = true;
    } else if (yearLevel === 3) {
      // 3rd year students do not graduate after 2nd sem; they proceed to Summer.
      await pool.query(
        `UPDATE "Students"
         SET current_semester = $1,
             current_school_year = $2
         WHERE id = $3`,
        [nextSemester, nextSchoolYear, studentId],
      );
      action = "summer_eligible";
    } else if (yearLevel === 1 || yearLevel === 2) {
      const nextYear = yearLevel + 1;
      const nextYearSection = student.year_section
        ? student.year_section.replace(/^(\d+)/, String(nextYear))
        : null;

      await pool.query(
        `UPDATE "Students"
         SET year_level = $1,
             year_section = COALESCE($2, year_section),
             current_semester = $3,
             current_school_year = $4,
             last_promoted_school_year = $5
         WHERE id = $6`,
        [
          nextYear,
          nextYearSection,
          nextSemester,
          nextSchoolYear,
          sourceSchoolYear,
          studentId,
        ],
      );
      action = "promoted";
      promoted = true;
    } else {
      await pool.query(
        `UPDATE "Students"
         SET current_semester = $1,
             current_school_year = $2
         WHERE id = $3`,
        [nextSemester, nextSchoolYear, studentId],
      );
      action = "term_advanced";
    }
  } else if (sourceSemester === "SUMMER") {
    if (yearLevel === 3) {
      // Promote 3rd year students only once per school year, at the transition to the next school year.
      if (student.last_promoted_school_year === sourceSchoolYear) {
        // Already promoted earlier this school year; just advance the term/year.
        await pool.query(
          `UPDATE "Students"
           SET current_semester = $1,
               current_school_year = $2
           WHERE id = $3`,
          [nextSemester, nextSchoolYear, studentId],
        );
        action = "term_advanced";
      } else {
        const nextYearSection = student.year_section
          ? student.year_section.replace(/^(\d+)/, "4")
          : null;

        await pool.query(
          `UPDATE "Students"
           SET year_level = 4,
               year_section = COALESCE($1, year_section),
               current_semester = $2,
               current_school_year = $3,
               last_promoted_school_year = $4
           WHERE id = $5`,
          [
            nextYearSection,
            nextSemester,
            nextSchoolYear,
            sourceSchoolYear,
            studentId,
          ],
        );
        action = "promoted";
        promoted = true;
      }
    } else if (yearLevel === 4) {
      await pool.query(
        `UPDATE "Students"
         SET is_archived = TRUE,
             archived_at = COALESCE(archived_at, NOW()),
             status = 'Graduated',
             current_semester = $1,
             current_school_year = $2
         WHERE id = $3`,
        [nextSemester, nextSchoolYear, studentId],
      );
      action = "graduated";
      graduated = true;
    } else {
      await pool.query(
        `UPDATE "Students"
         SET current_semester = $1,
             current_school_year = $2
         WHERE id = $3`,
        [nextSemester, nextSchoolYear, studentId],
      );
      action = "term_advanced";
    }
  }

  return {
    isEligible: true,
    action,
    promoted,
    graduated,
    currentSemester: nextSemester,
    currentSchoolYear: nextSchoolYear,
    previousSemester: sourceSemester,
    previousSchoolYear: sourceSchoolYear,
    unresolvedCount: 0,
  };
}

// PUT update current semester and school year
app.put("/api/archive/current-settings", async (req, res) => {
  const { currentSemester, currentSchoolYear } = req.body ?? {};

  if (!hasDbConfig()) {
    return res.status(500).json({
      status: "error",
      message: "Database is not configured.",
    });
  }

  if (!currentSemester || !currentSchoolYear) {
    return res.status(400).json({
      status: "error",
      message: "currentSemester and currentSchoolYear are required.",
    });
  }

  try {
    await ensureAuthDatabaseReady();
    const pool = getDbPool();

    const normalizedSemester = String(currentSemester).trim().toUpperCase();
    const normalizedSchoolYear = String(currentSchoolYear).trim();

    const result = await pool.query(
      `UPDATE "SystemSettings"
       SET current_semester = $1,
           current_school_year = $2
       WHERE setting_key = 'system_config'
       RETURNING current_semester, current_school_year`,
      [normalizedSemester, normalizedSchoolYear],
    );

    if (!result.rows?.[0]) {
      return res.status(404).json({
        status: "error",
        message: "System settings not found.",
      });
    }

    const settings = result.rows[0];

    // Calculate previous school year for last_promoted_school_year
    const [startYear, endYear] = normalizedSchoolYear.split("-").map(Number);
    if (!Number.isFinite(startYear) || !Number.isFinite(endYear)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid school year format. Expected format YYYY-YYYY.",
      });
    }
    const previousSchoolYear = `${startYear - 1}-${endYear - 1}`;

    // Update all active students' current_semester, current_school_year and last_promoted_school_year
    await pool.query(
      `UPDATE "Students"
       SET current_semester = $1,
           current_school_year = $2,
           last_promoted_school_year = $3
       WHERE is_archived = false`,
      [normalizedSemester, normalizedSchoolYear, previousSchoolYear],
    );

    await logAuditEvent(req, {
      action: "UPDATE_ARCHIVE_SETTINGS",
      targetType: "system_settings",
      targetId: null,
      details: `Updated current semester and school year to ${normalizedSemester} S.Y. ${normalizedSchoolYear}. Updated all students' current_semester to ${normalizedSemester}, current_school_year to ${normalizedSchoolYear} and last_promoted_school_year to ${previousSchoolYear}`,
      metadata: {
        currentSemester: normalizedSemester,
        currentSchoolYear: normalizedSchoolYear,
        previousSchoolYear,
      },
    });

    return res.status(200).json({
      status: "ok",
      currentSemester: settings.current_semester || "1ST SEM",
      currentSchoolYear: settings.current_school_year || "2025-2026",
    });
  } catch (error) {
    return res.status(503).json({
      status: "error",
      message: `Unable to update archive settings (${error.message}).`,
    });
  }
});

// GET check if all violations have signatures for archiving
app.get("/api/archive/check-signatures", async (req, res) => {
  const { semester, schoolYear } = req.query;

  if (!hasDbConfig()) {
    return res.status(500).json({
      status: "error",
      message: "Database is not configured.",
    });
  }

  if (!semester || !schoolYear) {
    return res.status(400).json({
      status: "error",
      message: "Semester and school year are required.",
    });
  }

  try {
    await ensureAuthDatabaseReady();
    const pool = getDbPool();

    // Get all violations for the given semester that need to be archived
    const violationsResult = await pool.query(
      `SELECT id, signature_image FROM student_violation_logs
       WHERE semester = $1
       AND school_year = $2
       AND cleared_at IS NULL`,
      [semester, schoolYear],
    );

    const violations = violationsResult.rows || [];
    const violationsWithoutSignature = violations.filter(
      (v) => !v.signature_image || v.signature_image.trim() === "",
    );

    return res.status(200).json({
      status: "ok",
      hasAllSignatures: violationsWithoutSignature.length === 0,
      violationsWithoutSignature: violationsWithoutSignature.length,
      totalViolations: violations.length,
    });
  } catch (error) {
    console.error("Check signatures error:", error);
    return res.status(503).json({
      status: "error",
      message: `Unable to check signatures (${error.message}).`,
    });
  }
});

// Check if archive already exists for semester/year
app.get("/api/archive/check-exists", async (req, res) => {
  const { semester, schoolYear } = req.query;

  if (!hasDbConfig()) {
    return res.status(500).json({
      status: "error",
      message: "Database is not configured.",
    });
  }

  if (!semester || !schoolYear) {
    return res.status(400).json({
      status: "error",
      message: "Semester and school year are required.",
    });
  }

  try {
    await ensureAuthDatabaseReady();
    const pool = getDbPool();

    // Check if this semester/year combination already exists in archive
    const existingArchiveCheck = await pool.query(
      `SELECT COUNT(*) as count FROM student_violation_archives 
       WHERE semester = $1 AND school_year = $2`,
      [semester, schoolYear],
    );

    const exists = existingArchiveCheck.rows[0].count > 0;

    return res.status(200).json({
      status: "ok",
      exists,
    });
  } catch (error) {
    console.error("Check archive exists error:", error);
    return res.status(503).json({
      status: "error",
      message: `Unable to check archive status (${error.message}).`,
    });
  }
});

// POST archive violations for a semester
app.post("/api/archive/violations", async (req, res) => {
  const { semester, schoolYear } = req.body ?? {};

  if (!hasDbConfig()) {
    return res.status(500).json({
      status: "error",
      message: "Database is not configured.",
    });
  }

  if (!semester || !schoolYear) {
    return res.status(400).json({
      status: "error",
      message: "Semester and school year are required.",
    });
  }

  try {
    await ensureAuthDatabaseReady();
    const pool = getDbPool();

    // Check if this semester/year combination already exists in archive
    const existingArchiveCheck = await pool.query(
      `SELECT COUNT(*) as count FROM student_violation_archives 
       WHERE semester = $1 AND school_year = $2`,
      [semester, schoolYear],
    );

    if (existingArchiveCheck.rows[0].count > 0) {
      return res.status(400).json({
        status: "error",
        message: `This school year (${schoolYear}) and semester (${semester}) already exist in the archive. Please choose a different semester/year combination.`,
      });
    }

    // Get current semester from settings
    const settingsResult = await pool.query(
      `SELECT current_semester, current_school_year
       FROM "SystemSettings"
       WHERE setting_key = 'system_config'
       LIMIT 1`,
    );

    const currentSettings = settingsResult.rows[0] || {};

    // Validate semester value
    const validSemesters = ["1ST SEM", "2ND SEM", "SUMMER"];
    if (!validSemesters.includes(String(semester).toUpperCase().trim())) {
      return res.status(400).json({
        status: "error",
        message: `Invalid semester '${semester}'. Valid values are ${validSemesters.join(", ")}.`,
      });
    }

    const normalizedSemester = String(semester).toUpperCase().trim();

    // Determine next semester and school year
    let nextSemester = "2ND SEM";
    let nextSchoolYear = schoolYear;

    if (normalizedSemester === "1ST SEM") {
      nextSemester = "2ND SEM";
      nextSchoolYear = schoolYear;
    } else if (normalizedSemester === "2ND SEM") {
      nextSemester = "SUMMER";
      nextSchoolYear = schoolYear;
    } else if (normalizedSemester === "SUMMER") {
      const [startYear, endYear] = schoolYear.split("-").map(Number);
      if (!Number.isFinite(startYear) || !Number.isFinite(endYear)) {
        return res.status(400).json({
          status: "error",
          message: "Invalid school year format. Expected format YYYY-YYYY.",
        });
      }
      nextSemester = "1ST SEM";
      nextSchoolYear = `${endYear}-${endYear + 1}`;
    }

    // Get all active students (not archived)
    const studentsResult = await pool.query(
      `SELECT id, year_level, year_section, last_promoted_school_year FROM "Students" WHERE is_archived = false`,
    );

    const students = studentsResult.rows || [];
    let promotedCount = 0;
    let archivedCount = 0;
    let pendingCount = 0;
    let clearedCount = 0;

    // STEP 1: Get all violations for the given semester that need to be archived
    // Separate pending/unresolved and cleared violations
    // Also include student.year_section to preserve the original year/section snapshot before any promotion update.
    const violationsResult = await pool.query(
      `SELECT
         svl.*,
         s.year_section,
         (svl.cleared_at IS NULL) AS is_unresolved
       FROM student_violation_logs svl
       LEFT JOIN "Students" s ON svl.student_id = s.id
       WHERE svl.semester = $1
         AND svl.school_year = $2`,
      [normalizedSemester, schoolYear],
    );

    const violations = violationsResult.rows || [];
    const pendingViolations = violations.filter((row) => row.is_unresolved);
    const clearedViolations = violations.filter((row) => !row.is_unresolved);

    console.log(
      `Found ${pendingViolations.length} pending and ${clearedViolations.length} cleared violations to archive for ${semester} S.Y. ${schoolYear}`,
    );

    // Check if all pending and cleared violations have signatures
    const pendingWithoutSignature = pendingViolations.filter(
      (v) => !v.signature_image || v.signature_image.trim() === "",
    );
    if (pendingWithoutSignature.length > 0) {
      return res.status(400).json({
        status: "error",
        message: `Cannot archive violations. ${pendingWithoutSignature.length} pending violation${pendingWithoutSignature.length === 1 ? '' : 's'} are missing signatures. Please attach signatures to all pending violations before archiving.`,
      });
    }

    const clearedWithoutSignature = clearedViolations.filter(
      (v) => !v.signature_image || v.signature_image.trim() === "",
    );
    if (clearedWithoutSignature.length > 0) {
      return res.status(400).json({
        status: "error",
        message: `Cannot archive violations. ${clearedWithoutSignature.length} cleared violation${clearedWithoutSignature.length === 1 ? '' : 's'} are missing signatures. Please attach signatures to all cleared violations before archiving.`,
      });
    }

    // STEP 2: Move violations to archive table
    // preserve year_section of each archived row for UI display before student promotion (especially 2nd sem -> 3rd sem cases)
    let preservedYearSections = {};
    if (violations.length > 0) {
      const archiveInsertPromises = violations.map((violation) => {
        return pool.query(
          `INSERT INTO student_violation_archives 
           (student_id, violation_catalog_id, violation_label, reported_by, remarks, 
            signature_image, signature_updated_at, semester, school_year, is_unresolved,
            archived_by_user_id, archived_by_name, original_created_at, original_updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
           RETURNING id`,
          [
            violation.student_id,
            violation.violation_catalog_id,
            violation.violation_label,
            violation.reported_by,
            violation.remarks,
            violation.signature_image,
            violation.signature_updated_at,
            normalizedSemester,
            schoolYear,
            Boolean(violation.is_unresolved),
            req.user?.id || null,
            req.user?.full_name || "System",
            violation.created_at,
            violation.updated_at,
          ],
        );
      });

      const insertedResults = await Promise.all(archiveInsertPromises);
      insertedResults.forEach((insertResult, idx) => {
        const rowId = insertResult.rows?.[0]?.id;
        if (rowId) {
          const rowYearSection = violations[idx]?.year_section || null;
          preservedYearSections[rowId] = rowYearSection;
          if (rowYearSection) {
            preservedArchiveYearSectionByViolationId.set(rowId, rowYearSection);
          }
        }
      });

      pendingCount = pendingViolations.length;
      clearedCount = clearedViolations.length;
      archivedCount = violations.length;
      console.log(
        `Inserted ${archivedCount} violations into archive table (${pendingCount} unresolved, ${clearedCount} cleared)`,
      );

      // STEP 3: Delete violations from active table
      const violationIds = violations
        .map((violation) => violation.id)
        .filter((value) => value != null);

      await pool.query(
        `DELETE FROM student_violation_logs
         WHERE id = ANY($1)`,
        [violationIds],
      );
      console.log(`Deleted ${archivedCount} violations from active table`);

      // STEP 3B: Refresh violation counts for all affected students
      const affectedStudentIds = violations.map((v) => v.student_id);
      const uniqueStudentIds = [...new Set(affectedStudentIds)];

      if (uniqueStudentIds.length > 0) {
        // Update violation_count for each affected student based on remaining violations
        await pool.query(
          `UPDATE "Students" s
           SET violation_count = (
             SELECT COUNT(*)::int
             FROM student_violation_logs svl
             WHERE svl.student_id = s.id AND svl.cleared_at IS NULL
           )
           WHERE s.id = ANY($1)`,
          [uniqueStudentIds],
        );
        console.log(
          `Refreshed violation counts for ${uniqueStudentIds.length} students`,
        );
      }
    }

    // STEP 4: Build unresolved student violation map (pending/uncleared)
    const unresolvedCountMap = new Map();

    const activeUnresolved = await pool.query(
      `SELECT student_id, COUNT(*) AS count
       FROM student_violation_logs
       WHERE cleared_at IS NULL
       GROUP BY student_id`,
    );

    for (const row of activeUnresolved.rows) {
      unresolvedCountMap.set(Number(row.student_id), Number(row.count));
    }

    const archivedUnresolved = await pool.query(
      `SELECT student_id, COUNT(*) AS count
       FROM student_violation_archives
       WHERE is_unresolved = TRUE
       GROUP BY student_id`,
    );

    for (const row of archivedUnresolved.rows) {
      const studentId = Number(row.student_id);
      const existing = unresolvedCountMap.get(studentId) || 0;
      unresolvedCountMap.set(studentId, existing + Number(row.count));
    }

    const hasPendingOrUncleared = (studentId) =>
      (unresolvedCountMap.get(Number(studentId)) || 0) > 0;

    // STEP 5: Promote students and archive/graduated students based on semester.
    let archivedStudentCount = 0;
    let blockedStudentCount = 0;

    if (normalizedSemester === "2ND SEM") {
      for (const student of students) {
        let parsedYearSection = null;
        if (student.year_section) {
          const match = String(student.year_section)
            .trim()
            .match(/^(\d+)/);
          if (match) {
            parsedYearSection = Number(match[1]);
          }
        }

        let yearLevel = Number.isFinite(parsedYearSection)
          ? parsedYearSection
          : Number(student.year_level);

        if (!Number.isFinite(yearLevel)) {
          yearLevel = null;
        }

        const studentHasPending = hasPendingOrUncleared(student.id);

        // Always advance term for student regardless of pending status
        await pool.query(
          `UPDATE "Students"
           SET current_semester = $1,
               current_school_year = $2
           WHERE id = $3`,
          [nextSemester, nextSchoolYear, student.id],
        );

        if (studentHasPending) {
          blockedStudentCount++;
          continue;
        }

        if (yearLevel === 1 || yearLevel === 2) {
          const nextYear = yearLevel + 1;
          const nextYearSection = student.year_section
            ? student.year_section.replace(/^(\d+)/, String(nextYear))
            : null;

          await pool.query(
            `UPDATE "Students"
             SET year_level = $1,
                 year_section = COALESCE($2, year_section),
                 last_promoted_school_year = $3
             WHERE id = $4`,
            [nextYear, nextYearSection, schoolYear, student.id],
          );
          promotedCount++;
        } else if (yearLevel === 3) {
          // 3rd year stays as 3rd year after 2nd sem; moving to summer.
          // No promotion to 4th or graduation here.
        } else if (yearLevel === 4) {
          await pool.query(
            `UPDATE "Students"
             SET is_archived = TRUE,
                 archived_at = COALESCE(archived_at, NOW()),
                 status = 'Graduated'
             WHERE id = $1`,
            [student.id],
          );
          archivedStudentCount++;
        }
      }
      console.log(`Processed 2ND SEM archive promotion conditions`);
    } else if (normalizedSemester === "SUMMER") {
      for (const student of students) {
        let parsedYearSection = null;
        if (student.year_section) {
          const match = String(student.year_section)
            .trim()
            .match(/^(\d+)/);
          if (match) {
            parsedYearSection = Number(match[1]);
          }
        }

        let yearLevel = Number.isFinite(parsedYearSection)
          ? parsedYearSection
          : Number(student.year_level);

        if (!Number.isFinite(yearLevel)) {
          yearLevel = null;
        }

        const studentHasPending = hasPendingOrUncleared(student.id);

        // Advance semester/year for all students
        await pool.query(
          `UPDATE "Students"
           SET current_semester = $1,
               current_school_year = $2
           WHERE id = $3`,
          [nextSemester, nextSchoolYear, student.id],
        );

        if (studentHasPending) {
          blockedStudentCount++;
          continue;
        }

        if (yearLevel === 3) {
          // Check if student has already been promoted in this school year
          if (student.last_promoted_school_year === schoolYear) {
            // Skip promotion - already promoted this school year
            continue;
          }

          const nextYearSection = student.year_section
            ? student.year_section.replace(/^(\d+)/, "4")
            : null;

          await pool.query(
            `UPDATE "Students"
             SET year_level = 4,
                 year_section = COALESCE($1, year_section),
                 last_promoted_school_year = $2
             WHERE id = $3`,
            [nextYearSection, schoolYear, student.id],
          );
          promotedCount++;
        } else if (yearLevel === 4) {
          await pool.query(
            `UPDATE "Students"
             SET is_archived = TRUE,
                 archived_at = COALESCE(archived_at, NOW()),
                 status = 'Graduated'
             WHERE id = $1`,
            [student.id],
          );
          archivedStudentCount++;
        }
      }
      console.log(`Processed SUMMER archive promotion conditions`);
    } else {
      // If archiving 1st semester, update semester/year only for all students
      for (const student of students) {
        await pool.query(
          `UPDATE "Students"
           SET current_semester = $1,
               current_school_year = $2
           WHERE id = $3`,
          [nextSemester, nextSchoolYear, student.id],
        );
      }
    }

    // STEP 6: Update system settings to reflect new semester/school year
    await pool.query(
      `UPDATE "SystemSettings"
       SET current_semester = $1,
           current_school_year = $2
       WHERE setting_key = 'system_config'`,
      [nextSemester, nextSchoolYear],
    );

    // STEP 6: Log archive action
    await pool.query(
      `INSERT INTO "ArchiveHistory" (semester, school_year, total_students_archived, students_promoted)
       VALUES ($1, $2, $3, $4)`,
      [normalizedSemester, schoolYear, students.length, promotedCount],
    );

    // STEP 7: Log audit event
    await logAuditEvent(req, {
      action: "ARCHIVE_VIOLATIONS",
      targetType: "Violations",
      targetId: null,
      details: `Archived ${archivedCount} violations for ${normalizedSemester} S.Y. ${schoolYear}`,
      metadata: {
        semester: normalizedSemester,
        schoolYear,
        archivedCount,
        nextSemester,
        nextSchoolYear,
        totalStudents: students.length,
        studentPromotedCount: promotedCount,
      },
    });

    console.log(
      `Archive complete: ${archivedCount} violations archived, ${promotedCount} students promoted`,
    );

    return res.status(200).json({
      status: "ok",
      message: `Archive completed. ${archivedCount} violations moved to archive (${pendingCount} unresolved, ${clearedCount} cleared). ${promotedCount || 0} students promoted${blockedStudentCount ? `, ${blockedStudentCount} promotion${blockedStudentCount === 1 ? '' : 's'} blocked due to pending/uncleared violations` : ""}.`,
      archivedCount,
      pendingCount,
      clearedCount,
      semester: normalizedSemester,
      schoolYear,
      nextSemester,
      nextSchoolYear,
      studentPromotedCount: promotedCount,
      studentBlockedCount: blockedStudentCount,
      totalStudentsAffected: students.length,
      preservedYearSections,
    });
  } catch (error) {
    console.error("Archive error:", error);
    return res.status(503).json({
      status: "error",
      message: `Unable to archive violations (${error.message}).`,
    });
  }
});

// GET unresolved archive school years
app.get("/api/archive/unresolved-school-years", async (req, res) => {
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
      `SELECT DISTINCT school_year, semester
       FROM student_violation_archives
       WHERE is_unresolved = TRUE
       ORDER BY school_year DESC, semester ASC`,
    );

    const rows = result.rows || [];
    const schoolYears = Array.from(
      new Set(rows.map((row) => row.school_year).filter(Boolean)),
    );
    const semesterOrder = ["1ST SEM", "2ND SEM", "SUMMER"];
    const semestersBySchoolYear = schoolYears.reduce((acc, schoolYear) => {
      acc[schoolYear] = rows
        .filter((row) => row.school_year === schoolYear)
        .map((row) => row.semester)
        .filter(Boolean)
        .sort(
          (left, right) =>
            semesterOrder.indexOf(left) - semesterOrder.indexOf(right),
        );
      return acc;
    }, {});

    return res.status(200).json({
      status: "ok",
      schoolYears: schoolYears.sort((left, right) => right.localeCompare(left)),
      semestersBySchoolYear,
    });
  } catch (error) {
    console.error("Error fetching unresolved school years:", error);
    return res.status(503).json({
      status: "error",
      message: `Unable to fetch unresolved school years (${error.message}).`,
    });
  }
});

// GET unresolved archived violations by school year and semester
app.get("/api/archive/unresolved/:schoolYear/:semester", async (req, res) => {
  const { schoolYear, semester } = req.params;

  if (!hasDbConfig()) {
    return res.status(500).json({
      status: "error",
      message: "Database is not configured.",
    });
  }

  if (!schoolYear || !semester) {
    return res.status(400).json({
      status: "error",
      message: "School year and semester are required.",
    });
  }

  try {
    await ensureAuthDatabaseReady();
    const pool = getDbPool();
    await ensureArchiveColumnsExist(pool);

    void maybeRunArchiveMaintenance(pool).catch((error) => {
      console.warn(
        "Archive maintenance skipped/failed:",
        error?.message || error,
      );
    });

    const result = await pool.query(
      `SELECT 
        sva.id,
        sva.student_id,
        sva.violation_catalog_id,
        sva.violation_label,
        sva.reported_by,
        sva.remarks,
        sva.signature_image,
        CASE
          WHEN sva.signature_image IS NOT NULL AND TRIM(sva.signature_image) <> ''
          THEN TRUE
          ELSE FALSE
        END AS has_signature,
        sva.signature_updated_at,
        sva.semester,
        sva.school_year,
        sva.archived_at,
        sva.archived_by_name,
        sva.original_created_at,
        sva.original_updated_at,
        s.full_name as student_name,
        s.first_name,
        s.middle_initial,
        s.last_name,
        s.school_id,
        s.program,
        s.year_section,
        COALESCE(sva.violation_category, v.category) as violation_category,
        COALESCE(sva.violation_degree, v.degree) as violation_degree,
        sva.violation_type_label,
        v.name as violation_name
       FROM student_violation_archives sva
       LEFT JOIN "Students" s ON sva.student_id = s.id
       LEFT JOIN violations v ON sva.violation_catalog_id = v.id
       WHERE sva.school_year = $1 AND sva.semester = $2 AND sva.is_unresolved = TRUE
         AND COALESCE(sva.remarks, '') <> 'IMPORTED'
       ORDER BY sva.archived_at DESC, sva.id DESC`,
      [schoolYear, semester],
    );

    const violations = (result.rows || []).map((row) => {
      const violationCandidates = null;
      const closestViolation = inferClosestViolationByKeywords(row.violation_label, violationCandidates);

      return {
        ...enrichArchiveViolationRow(row, closestViolation),
        year_section:
          preservedArchiveYearSectionByViolationId.get(row.id) ||
          row.year_section ||
          row.student_year_section ||
          null,
      };
    });

    return res.status(200).json({
      status: "ok",
      violations,
    });
  } catch (error) {
    console.error("Error fetching unresolved violations:", error);
    return res.status(503).json({
      status: "error",
      message: `Unable to fetch unresolved violations (${error.message}).`,
    });
  }
});

// GET archived users
app.get("/api/archive/users", async (req, res) => {
  if (!hasDbConfig()) {
    return res.status(500).json({
      status: "error",
      message: "Database is not configured.",
    });
  }

  try {
    await ensureAuthDatabaseReady();
    const pool = getDbPool();
    await ensureArchiveColumnsExist(pool);
    await maybeSyncHistoricalWorkbookRecordsToDatabase(pool);

    const result = await pool.query(
      `SELECT 
        s.id, s.user_id, s.email, s.school_id, s.full_name, s.first_name, s.middle_initial, s.last_name, 
        s.program, s.year_section, s.status, s.is_archived, s.archived_at, s.archived_reason, s.original_status, s.is_unresolved_archive,
        COALESCE(
          COALESCE(active_count.active_total_count, 0) + COALESCE(archive_count.archive_total_count, 0),
          0
        )::int AS violation_count
       FROM "Students" s
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS active_total_count
         FROM student_violation_logs svl
         WHERE svl.student_id = s.id
       ) active_count ON true
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS archive_total_count
         FROM student_violation_archives sva
         WHERE sva.student_id = s.id
       ) archive_count ON true
       WHERE s.is_archived = true
       ORDER BY s.archived_at DESC NULLS LAST`,
    );

    return res.status(200).json({
      status: "ok",
      archivedUsers: result.rows || [],
    });
  } catch (error) {
    console.error("Error fetching archived users:", error);
    return res.status(503).json({
      status: "error",
      message: `Unable to fetch archived users (${error.message}).`,
    });
  }
});

// GET school years with archived violations
app.get("/api/archive/school-years", async (req, res) => {
  if (!hasDbConfig()) {
    return res.status(500).json({
      status: "error",
      message: "Database is not configured.",
    });
  }

  try {
    await ensureAuthDatabaseReady();
    const pool = getDbPool();
    await ensureArchiveColumnsExist(pool);
    await maybeSyncHistoricalWorkbookRecordsToDatabase(pool);

    const archiveResult = await pool.query(
      `
      SELECT DISTINCT school_year, semester
      FROM student_violation_archives
      WHERE school_year IS NOT NULL
        AND semester IS NOT NULL
        AND is_unresolved = FALSE
      ORDER BY school_year DESC, semester ASC
      `,
    );

    const archiveTerms = (archiveResult.rows || [])
      .map((row) => ({
        schoolYear: normalizeSchoolYear(row.school_year),
        semester: normalizeSemester(row.semester),
      }))
      .filter((row) => row.schoolYear && row.semester);

    const settingsResult = await pool.query(
      `
      SELECT current_school_year, current_semester
      FROM "SystemSettings"
      WHERE setting_key = 'system_config'
      LIMIT 1
      `,
    );
    const settings = settingsResult.rows?.[0] || {};
    const currentSchoolYear =
      normalizeSchoolYear(settings.current_school_year) ||
      String(settings.current_school_year || "").trim();
    const currentSemester = normalizeSemester(settings.current_semester);

    const semesterOrder = {
      "1ST SEM": 1,
      "2ND SEM": 2,
      SUMMER: 3,
    };

    const schoolYearSet = new Set(
      archiveTerms.map((term) => term.schoolYear).filter(Boolean),
    );
    if (currentSchoolYear) {
      schoolYearSet.add(currentSchoolYear);
    }

    const combinedYears = Array.from(schoolYearSet)
      .sort(
        (left, right) => getSchoolYearStart(right) - getSchoolYearStart(left),
      )
      .slice(0, 4);

    const semestersBySchoolYear = combinedYears.reduce((acc, schoolYear) => {
      const semesters = archiveTerms
        .filter((term) => term.schoolYear === schoolYear)
        .map((term) => term.semester);

      acc[schoolYear] = Array.from(new Set(semesters.filter(Boolean))).sort(
        (left, right) =>
          (semesterOrder[left] || 99) - (semesterOrder[right] || 99),
      );
      return acc;
    }, {});

    return res.status(200).json({
      status: "ok",
      schoolYears: combinedYears,
      semestersBySchoolYear,
      currentSchoolYear,
      currentSemester,
    });
  } catch (error) {
    console.error("Error fetching school years:", error);
    return res.status(503).json({
      status: "error",
      message: `Unable to fetch school years (${error.message}).`,
    });
  }
});

// DELETE archived violations for a single school year + semester
app.delete("/api/archive/semesters/:schoolYear/:semester", async (req, res) => {
  const { schoolYear, semester } = req.params;

  if (!hasDbConfig()) {
    return res.status(500).json({
      status: "error",
      message: "Database is not configured.",
    });
  }

  if (!schoolYear || !semester) {
    return res.status(400).json({
      status: "error",
      message: "School year and semester are required.",
    });
  }

  try {
    await ensureAuthDatabaseReady();
    const pool = getDbPool();
    const normalizedSchoolYear = normalizeSchoolYear(schoolYear);
    const normalizedSemester = normalizeSemester(semester);

    if (!normalizedSchoolYear || !normalizedSemester) {
      return res.status(400).json({
        status: "error",
        message: "Invalid school year or semester.",
      });
    }

    const deleteResult = await pool.query(
      `DELETE FROM student_violation_archives
       WHERE school_year = $1
         AND semester = $2
         AND is_unresolved = FALSE
       RETURNING id`,
      [normalizedSchoolYear, normalizedSemester],
    );

    const deletedCount = Number(deleteResult.rowCount || 0);

    if (deletedCount === 0) {
      return res.status(200).json({
        status: "ok",
        message: `${normalizedSemester} S.Y. ${normalizedSchoolYear} has no archived records to delete.`,
        deletedCount: 0,
      });
    }

    await logAuditEvent(req, {
      action: "DELETE_ARCHIVE_SEMESTER",
      targetType: "ARCHIVE_SEMESTER",
      targetId: `${normalizedSchoolYear}|${normalizedSemester}`,
      details: `Deleted ${deletedCount} archived violation record${deletedCount === 1 ? '' : 's'} for ${normalizedSemester} S.Y. ${normalizedSchoolYear}.`,
    });

    return res.status(200).json({
      status: "ok",
      message: `Successfully deleted ${deletedCount} archived record${deletedCount === 1 ? '' : 's'} for ${normalizedSemester} S.Y. ${normalizedSchoolYear}.`,
      deletedCount,
    });
  } catch (error) {
    console.error("Error deleting archive semester:", error);
    return res.status(503).json({
      status: "error",
      message: `Unable to delete archive semester (${error.message}).`,
    });
  }
});

// DELETE unresolved archived violations for a single school year + semester
app.delete("/api/archive/unresolved/:schoolYear/:semester", async (req, res) => {
  const { schoolYear, semester } = req.params;

  if (!hasDbConfig()) {
    return res.status(500).json({
      status: "error",
      message: "Database is not configured.",
    });
  }

  if (!schoolYear || !semester) {
    return res.status(400).json({
      status: "error",
      message: "School year and semester are required.",
    });
  }

  try {
    await ensureAuthDatabaseReady();
    const pool = getDbPool();
    const normalizedSchoolYear = normalizeSchoolYear(schoolYear);
    const normalizedSemester = normalizeSemester(semester);

    if (!normalizedSchoolYear || !normalizedSemester) {
      return res.status(400).json({
        status: "error",
        message: "Invalid school year or semester.",
      });
    }

    const deleteResult = await pool.query(
      `DELETE FROM student_violation_archives
       WHERE school_year = $1
         AND semester = $2
         AND is_unresolved = TRUE
       RETURNING id`,
      [normalizedSchoolYear, normalizedSemester],
    );

    const deletedCount = Number(deleteResult.rowCount || 0);

    if (deletedCount === 0) {
      return res.status(200).json({
        status: "ok",
        message: `${normalizedSemester} S.Y. ${normalizedSchoolYear} has no unresolved archived records to delete.`,
        deletedCount: 0,
      });
    }

    await logAuditEvent(req, {
      action: "DELETE_UNRESOLVED_ARCHIVE_SEMESTER",
      targetType: "ARCHIVE_UNRESOLVED_SEMESTER",
      targetId: `${normalizedSchoolYear}|${normalizedSemester}`,
      details: `Deleted ${deletedCount} unresolved archived violation record${deletedCount === 1 ? '' : 's'} for ${normalizedSemester} S.Y. ${normalizedSchoolYear}.`,
    });

    return res.status(200).json({
      status: "ok",
      message: `Successfully deleted ${deletedCount} unresolved archived record${deletedCount === 1 ? '' : 's'} for ${normalizedSemester} S.Y. ${normalizedSchoolYear}.`,
      deletedCount,
    });
  } catch (error) {
    console.error("Error deleting unresolved archive semester:", error);
    return res.status(503).json({
      status: "error",
      message: `Unable to delete unresolved archive semester (${error.message}).`,
    });
  }
});

// DELETE school year (deletes all archived violations for that year)
app.delete("/api/archive/school-years/:schoolYear", async (req, res) => {
  const { schoolYear } = req.params;

  if (!hasDbConfig()) {
    return res.status(500).json({
      status: "error",
      message: "Database is not configured.",
    });
  }

  if (!schoolYear) {
    return res.status(400).json({
      status: "error",
      message: "School year is required.",
    });
  }

  try {
    await ensureAuthDatabaseReady();
    const pool = getDbPool();

    // Check if school year exists in database
    const checkResult = await pool.query(
      `SELECT COUNT(*) as count
       FROM student_violation_archives
       WHERE school_year = $1
         AND is_unresolved = FALSE`,
      [schoolYear],
    );

    const databaseViolationCount = parseInt(checkResult.rows[0].count);

    // Delete all archived violations for this school year from database only.
    // The workbook remains the import source and is never mutated by folder deletion.
    if (databaseViolationCount > 0) {
      await pool.query(
        `DELETE FROM student_violation_archives
         WHERE school_year = $1
           AND is_unresolved = FALSE`,
        [schoolYear],
      );
    }

    if (databaseViolationCount === 0) {
      return res.status(200).json({
        status: "ok",
        message: `School year ${schoolYear} has no archived records to delete.`,
      });
    }

    // Log the audit event
    await logAuditEvent(req, {
      action: "DELETE_SCHOOL_YEAR",
      targetType: "ARCHIVE_SCHOOL_YEAR",
      targetId: schoolYear,
      details: `Deleted school year ${schoolYear} with ${databaseViolationCount} database violations`,
    });

    return res.status(200).json({
      status: "ok",
      message: `Successfully deleted school year ${schoolYear} (${databaseViolationCount} database records).`,
    });
  } catch (error) {
    console.error("Error deleting school year:", error);
    return res.status(503).json({
      status: "error",
      message: `Unable to delete school year (${error.message}).`,
    });
  }
});

// PUT rename school year
app.put("/api/archive/school-years/:oldSchoolYear", async (req, res) => {
  const { oldSchoolYear } = req.params;
  const { newSchoolYear } = req.body;

  if (!hasDbConfig()) {
    return res.status(500).json({
      status: "error",
      message: "Database is not configured.",
    });
  }

  if (!oldSchoolYear || !newSchoolYear) {
    return res.status(400).json({
      status: "error",
      message: "Both old and new school year are required.",
    });
  }

  if (oldSchoolYear === newSchoolYear) {
    return res.status(400).json({
      status: "error",
      message: "New school year must be different from the current one.",
    });
  }

  try {
    await ensureAuthDatabaseReady();
    const pool = getDbPool();

    // Check if old school year exists
    const checkOldResult = await pool.query(
      `SELECT COUNT(*) as count FROM student_violation_archives WHERE school_year = $1`,
      [oldSchoolYear],
    );

    if (parseInt(checkOldResult.rows[0].count) === 0) {
      return res.status(404).json({
        status: "error",
        message: `School year ${oldSchoolYear} not found.`,
      });
    }

    // Check if new school year already exists
    const checkNewResult = await pool.query(
      `SELECT COUNT(*) as count FROM student_violation_archives WHERE school_year = $1`,
      [newSchoolYear],
    );

    if (parseInt(checkNewResult.rows[0].count) > 0) {
      return res.status(409).json({
        status: "error",
        message: `School year ${newSchoolYear} already exists.`,
      });
    }

    // Update all archived violations for this school year
    const updateResult = await pool.query(
      `UPDATE student_violation_archives SET school_year = $1 WHERE school_year = $2`,
      [newSchoolYear, oldSchoolYear],
    );

    // Log the audit event
    await logAuditEvent(req, {
      action: "RENAME_SCHOOL_YEAR",
      targetType: "ARCHIVE_SCHOOL_YEAR",
      targetId: oldSchoolYear,
      details: `Renamed school year from ${oldSchoolYear} to ${newSchoolYear} (${updateResult.rowCount} violations updated)`,
    });

    return res.status(200).json({
      status: "ok",
      message: `Successfully renamed school year from ${oldSchoolYear} to ${newSchoolYear}.`,
      updatedCount: updateResult.rowCount,
    });
  } catch (error) {
    console.error("Error renaming school year:", error);
    return res.status(503).json({
      status: "error",
      message: `Unable to rename school year (${error.message}).`,
    });
  }
});

// GET archived violations by school year and semester
app.get("/api/archive/violations/:schoolYear/:semester", async (req, res) => {
  const { schoolYear, semester } = req.params;

  if (!hasDbConfig()) {
    return res.status(500).json({
      status: "error",
      message: "Database is not configured.",
    });
  }

  if (!schoolYear || !semester) {
    return res.status(400).json({
      status: "error",
      message: "School year and semester are required.",
    });
  }

  try {
    await ensureAuthDatabaseReady();
    const pool = getDbPool();
    await ensureArchiveColumnsExist(pool);
    await maybeSyncHistoricalWorkbookRecordsToDatabase(pool);

    void maybeRunArchiveMaintenance(pool).catch((error) => {
      console.warn(
        "Archive maintenance skipped/failed:",
        error?.message || error,
      );
    });

    const violationCandidates = await getViolationCandidatesForInference(pool);

    // Query archived violations from the archive table for this semester/year, excluding unresolved
    const result = await pool.query(
      `SELECT 
        sva.id,
        sva.student_id,
        sva.violation_catalog_id,
        sva.violation_label,
        sva.reported_by,
        sva.remarks,
        sva.signature_image,
        CASE
          WHEN sva.signature_image IS NOT NULL AND TRIM(sva.signature_image) <> ''
          THEN TRUE
          ELSE FALSE
        END AS has_signature,
        sva.signature_updated_at,
        sva.semester,
        sva.school_year,
        sva.archived_at,
        sva.archived_by_name,
        sva.original_created_at,
        sva.original_updated_at,
        s.full_name as student_name,
        s.first_name,
        s.middle_initial,
        s.last_name,
        s.school_id,
        s.program,
        s.year_section,
        COALESCE(sva.violation_category, v.category) as violation_category,
        COALESCE(sva.violation_degree, v.degree) as violation_degree,
        sva.violation_type_label,
        v.name as violation_name
       FROM student_violation_archives sva
       LEFT JOIN "Students" s ON sva.student_id = s.id
       LEFT JOIN violations v ON sva.violation_catalog_id = v.id
       WHERE sva.school_year = $1 AND sva.semester = $2 AND sva.is_unresolved = FALSE
       ORDER BY sva.archived_at DESC, sva.id DESC`,
      [schoolYear, semester],
    );

    const violations = (result.rows || []).map((row) => {
      const closestViolation = inferClosestViolationByKeywords(
        row.violation_label,
        violationCandidates,
      );

      return {
        ...enrichArchiveViolationRow(row, closestViolation),
        year_section:
          preservedArchiveYearSectionByViolationId.get(row.id) ||
          row.year_section ||
          row.student_year_section ||
          null,
      };
    });

    return res.status(200).json({
      status: "ok",
      violations,
    });
  } catch (error) {
    console.error("Error fetching archived violations:", error);
    return res.status(503).json({
      status: "error",
      message: `Unable to fetch archived violations (${error.message}).`,
    });
  }
});

app.get("/api/archive/violations/:id/signature", async (req, res) => {
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
      SELECT id, signature_image
      FROM student_violation_archives
      WHERE id = $1
      LIMIT 1
      `,
      [id],
    );

    const record = result.rows?.[0] || null;
    if (!record) {
      return res.status(404).json({
        status: "error",
        message: "Archive record not found.",
      });
    }

    const signatureImage = String(record.signature_image || "").trim() || null;

    return res.status(200).json({
      status: "ok",
      id: Number(record.id),
      hasSignature: Boolean(signatureImage),
      signatureImage,
    });
  } catch (error) {
    return res.status(503).json({
      status: "error",
      message: `Unable to fetch archive signature (${error.message}).`,
    });
  }
});

// PUT update archived user
app.put("/api/archive/users/:id", async (req, res) => {
  const { id } = req.params;
  const { firstName, middleInitial, lastName, program, yearSection, status } =
    req.body ?? {};

  if (!hasDbConfig()) {
    return res.status(500).json({
      status: "error",
      message: "Database is not configured.",
    });
  }

  try {
    await ensureAuthDatabaseReady();
    const pool = getDbPool();

    // Only create fullName if both firstName and lastName are provided and non-empty
    const normalizedName = splitMiddleInitialFromFirstName(
      firstName,
      middleInitial,
    );
    const cleanedFirstName = normalizedName.firstName;
    const cleanedMiddleInitial = normalizedName.middleInitial;
    const cleanedLastName = formatStudentNameSegment(lastName);
    const fullName =
      cleanedFirstName && cleanedLastName
        ? buildStudentFullName(
            cleanedFirstName,
            cleanedMiddleInitial,
            cleanedLastName,
          )
        : null;

    const result = await pool.query(
      `UPDATE "Students"
       SET first_name = COALESCE(NULLIF($1, ''), first_name),
           middle_initial = NULLIF($2, ''),
           last_name = COALESCE(NULLIF($3, ''), last_name),
           full_name = COALESCE(NULLIF($4, ''), full_name),
           program = COALESCE(NULLIF($5, ''), program),
           year_section = COALESCE(NULLIF($6, ''), year_section),
           status = CASE
             WHEN UPPER(COALESCE(archived_reason, '')) = 'IMPORTED' THEN status
             ELSE COALESCE(NULLIF($7, ''), status)
           END
       WHERE id = $8 AND is_archived = true
       RETURNING id, user_id, email, school_id, full_name, first_name, middle_initial, last_name, 
                 program, year_section, status, violation_count, is_archived, archived_at, archived_reason, is_unresolved_archive`,
      [
        cleanedFirstName || null,
        cleanedMiddleInitial || "",
        cleanedLastName || null,
        fullName,
        String(program || "").trim() || null,
        String(yearSection || "").trim() || null,
        String(status || "").trim() || null,
        id,
      ],
    );

    if (!result.rows?.[0]) {
      return res.status(404).json({
        status: "error",
        message: "Archived user not found.",
      });
    }

    const updatedUser = result.rows[0];

    // Log audit event
    await logAuditEvent(req, {
      action: "UPDATE_ARCHIVED_USER",
      targetType: "Student",
      targetId: id,
      details: `Updated archived student ${updatedUser.full_name}.`,
    });

    return res.status(200).json({
      status: "ok",
      user: updatedUser,
    });
  } catch (error) {
    console.error("Error updating archived user:", error);
    return res.status(503).json({
      status: "error",
      message: `Unable to update archived user (${error.message}).`,
    });
  }
});

// PUT restore archived user (move back to active users)
app.put("/api/archive/users/:id/restore", async (req, res) => {
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

    // Get the student row to get user_id, name, and original status
    const studentResult = await pool.query(
      `SELECT id, user_id, full_name, original_status, status, is_archived FROM "Students"
       WHERE id = $1
       LIMIT 1`,
      [id],
    );

    if (!studentResult.rows?.[0]) {
      return res.status(404).json({
        status: "error",
        message: "Archived user not found.",
      });
    }

    const {
      user_id,
      full_name,
      original_status,
      status: currentStatus,
      is_archived,
    } = studentResult.rows[0];

    if (!is_archived) {
      return res.status(200).json({
        status: "ok",
        message: `User ${full_name} is already restored.`,
      });
    }

    const restoredStatus = String(original_status || currentStatus || "").trim();
    const shouldActivate = restoredStatus.toLowerCase() !== "graduated";

    // Count active unresolved violations that belong to this restored student
    const activeUnresolvedResult = await pool.query(
      `SELECT COUNT(*)::int AS count FROM student_violation_logs WHERE student_id = $1 AND cleared_at IS NULL`,
      [id],
    );
    const activeUnresolvedCount = Number(activeUnresolvedResult.rows?.[0]?.count || 0);

    // Count archived unresolved violations
    const archiveUnresolvedResult = await pool.query(
      `SELECT COUNT(*)::int AS count FROM student_violation_archives WHERE student_id = $1 AND is_unresolved = TRUE`,
      [id],
    );
    const archiveUnresolvedCount = Number(archiveUnresolvedResult.rows?.[0]?.count || 0);

    // Total unresolved violations to preserve the violation count
    const totalUnresolved = activeUnresolvedCount + archiveUnresolvedCount;

    // Mark student as not archived and restore original status if it exists
    await pool.query(
      `UPDATE "Students"
       SET is_archived = false, 
           archived_at = NULL,
           archived_reason = NULL,
           is_unresolved_archive = false,
           original_status = NULL,
           violation_count = CASE WHEN $3::int > 0 THEN $3::int ELSE violation_count END,
           status = COALESCE(NULLIF($2, ''), status)
       WHERE id = $1`,
      [id, original_status || null, totalUnresolved],
    );

    // Reactivate user account only if restored status is not Graduated
    if (shouldActivate) {
      await pool.query(
        `UPDATE users
         SET is_active = true, updated_at = NOW()
         WHERE id = $1`,
        [user_id],
      );
    }

    // Send restoration email only for non-Graduated restored users
    try {
      const studentEmailResult = await pool.query(
        `SELECT email FROM "Students" WHERE id = $1 LIMIT 1`,
        [id],
      );
      const userEmail = studentEmailResult.rows?.[0]?.email;
      if (shouldActivate && userEmail) {
        const transporter = getMailTransporter();
        if (transporter) {
          await transporter.sendMail({
            from: process.env.SMTP_FROM || process.env.SMTP_USER,
            to: userEmail,
            subject: "Account Restored",
            html: buildSystemEmailShell({
              eyebrow: "SVMS Security",
              heading: "Account Restored",
              lead: "Your account is now active and ready to use.",
              contentHtml: `
                <div style="margin-bottom:18px;padding:14px;border-radius:12px;background:#f0fdf4;border:1px solid #86efac;">
                  <p style="margin:0 0 10px 0;font-size:13px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#166534;">Account Status Changed</p>
                  <p style="margin:0;color:#15803d;font-size:14px;line-height:1.6;">Your archive has been removed and your account has been reactivated. You can now log in to the Student Violation Management System with your credentials.</p>
                </div>
                <div style="margin:18px 0;padding:12px 14px;border-radius:12px;background:#f3f4f6;border:1px solid #d1d5db;">
                  <p style="margin:0;color:#374151;font-size:13px;line-height:1.6;">If you have any questions or need assistance, please contact your administrator.</p>
                </div>
              `,
              footerNote: "This is an automated message from Student Violation Management System. Please do not reply to this email.",
            }),
          });
        } else {
          console.warn("SMTP not configured. Restoration email was skipped for:", userEmail);
        }
      }
    } catch (emailError) {
      console.error("Failed to send restoration email:", emailError);
      // Don't fail the request if email fails
    }

    // Log audit event
    await logAuditEvent(req, {
      action: "RESTORE_USER",
      targetType: "Student",
      targetId: id,
      details: `Restored archived user ${full_name} to active users.`,
    });

    return res.status(200).json({
      status: "ok",
      message: `User ${full_name} has been successfully restored.`,
    });
  } catch (error) {
    console.error("Error restoring archived user:", error);
    return res.status(503).json({
      status: "error",
      message: `Unable to restore user (${error.message}).`,
    });
  }
});

// PUT bulk restore all archived users
app.put("/api/archive/users/restore/all", async (req, res) => {
  if (!hasDbConfig()) {
    return res.status(500).json({
      status: "error",
      message: "Database is not configured.",
    });
  }

  try {
    await ensureAuthDatabaseReady();
    const pool = getDbPool();

    // Get all archived students
    const archivedStudents = await pool.query(
      `SELECT id, user_id, full_name, status FROM "Students" WHERE is_archived = true`,
    );

    const students = archivedStudents.rows || [];
    let restoredCount = 0;

    // Restore all archived students
    for (const student of students) {
      // Count active unresolved violations for this student
      const activeUnresolvedResult = await pool.query(
        `SELECT COUNT(*)::int AS count FROM student_violation_logs WHERE student_id = $1 AND cleared_at IS NULL`,
        [student.id],
      );
      const activeUnresolvedCount = Number(activeUnresolvedResult.rows?.[0]?.count || 0);

      // Count archived unresolved violations
      const archiveUnresolvedResult = await pool.query(
        `SELECT COUNT(*)::int AS count FROM student_violation_archives WHERE student_id = $1 AND is_unresolved = TRUE`,
        [student.id],
      );
      const archiveUnresolvedCount = Number(archiveUnresolvedResult.rows?.[0]?.count || 0);
      const totalUnresolved = activeUnresolvedCount + archiveUnresolvedCount;

      await pool.query(
        `UPDATE "Students"
         SET is_archived = false, archived_at = NULL, archived_reason = NULL, is_unresolved_archive = false, original_status = NULL,
             violation_count = CASE WHEN $2::int > 0 THEN $2::int ELSE violation_count END
         WHERE id = $1`,
        [student.id, totalUnresolved],
      );

      const shouldActivate = String(student.status || "").trim().toLowerCase() !== "graduated";
      if (student.user_id && shouldActivate) {
        await pool.query(
          `UPDATE users
           SET is_active = true, updated_at = NOW()
           WHERE id = $1`,
          [student.user_id],
        );
      }

      // Send restoration email only for non-Graduated restored users
      try {
        const studentEmailResult = await pool.query(
          `SELECT email FROM "Students" WHERE id = $1 LIMIT 1`,
          [student.id],
        );
        const userEmail = studentEmailResult.rows?.[0]?.email;
        if (shouldActivate && userEmail) {
          const transporter = getMailTransporter();
          if (transporter) {
            await transporter.sendMail({
              from: process.env.SMTP_FROM || process.env.SMTP_USER,
              to: userEmail,
              subject: "Account Restored",
              html: buildSystemEmailShell({
                eyebrow: "SVMS Security",
                heading: "Account Restored",
                lead: "Your account is now active and ready to use.",
                contentHtml: `
                  <div style="margin-bottom:18px;padding:14px;border-radius:12px;background:#f0fdf4;border:1px solid #86efac;">
                    <p style="margin:0 0 10px 0;font-size:13px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#166534;">Account Status Changed</p>
                    <p style="margin:0;color:#15803d;font-size:14px;line-height:1.6;">Your archive has been removed and your account has been reactivated. You can now log in to the Student Violation Management System with your credentials.</p>
                  </div>
                  <div style="margin:18px 0;padding:12px 14px;border-radius:12px;background:#f3f4f6;border:1px solid #d1d5db;">
                    <p style="margin:0;color:#374151;font-size:13px;line-height:1.6;\">If you have any questions or need assistance, please contact your administrator.</p>
                  </div>
                `,
                footerNote: "This is an automated message from Student Violation Management System. Please do not reply to this email.",
              }),
            });
          } else {
            console.warn("SMTP not configured. Restoration email was skipped for:", userEmail);
          }
        }
      } catch (emailError) {
        console.error("Failed to send restoration email:", emailError);
        // Don't fail the request if email fails
      }

      restoredCount++;
    }

    // Log audit event
    await logAuditEvent(req, {
      action: "BULK_RESTORE_USERS",
      targetType: "Students",
      targetId: null,
      details: `Bulk restored ${restoredCount} archived users. Some Graduated users remained inactive.`,
    });

    return res.status(200).json({
      status: "ok",
      message: `Successfully restored ${restoredCount} archived user${restoredCount === 1 ? '' : 's'}.`,
      restoredCount,
    });
  } catch (error) {
    console.error("Error bulk restoring archived users:", error);
    return res.status(503).json({
      status: "error",
      message: `Unable to restore archived users (${error.message}).`,
    });
  }
});

// PUT update archived violation
app.put("/api/archive/violations/:id", async (req, res) => {
  const { id } = req.params;
  const {
    remarks,
    reportedBy,
    isUnresolved,
    semester,
    schoolYear,
    firstName,
    middleInitial,
    lastName,
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

    // Determine if the record is transitioning from unresolved to cleared
    const existingRecord = await pool.query(
      `SELECT
         student_id,
         is_unresolved,
         violation_catalog_id,
         violation_label,
         remarks,
         archived_at,
         semester,
         school_year
       FROM student_violation_archives
       WHERE id = $1
       LIMIT 1`,
      [id],
    );
    const wasUnresolved = existingRecord.rows?.[0]?.is_unresolved;
    const studentId = existingRecord.rows?.[0]?.student_id;
    const existingRemarks = String(
      existingRecord.rows?.[0]?.remarks || "",
    ).trim();
    const isImportedRecord = existingRemarks.toUpperCase() === "IMPORTED";

    if (!existingRecord.rows?.[0]) {
      return res.status(404).json({
        status: "error",
        message: "Archived violation not found.",
      });
    }

    // Preserve the student year section before any possible promotion update
    let preservedYearSection = null;
    if (studentId) {
      const studentSnapshot = await pool.query(
        `SELECT year_section FROM "Students" WHERE id = $1 LIMIT 1`,
        [studentId],
      );
      preservedYearSection = studentSnapshot.rows?.[0]?.year_section || null;
    }

    // Update archived violation in the archive table
    const normalizedSemester = normalizeSemester(semester);
    const normalizedSchoolYear = normalizeSchoolYear(schoolYear);
    const result = await pool.query(
      `UPDATE student_violation_archives
       SET remarks = CASE
             WHEN $6 THEN 'IMPORTED'
             ELSE COALESCE(NULLIF($1, ''), remarks)
           END,
           reported_by = COALESCE(NULLIF($2, ''), reported_by),
           is_unresolved = COALESCE($3, is_unresolved),
           semester = COALESCE($4, semester),
           school_year = COALESCE($5, school_year),
           updated_at = NOW()
       WHERE id = $7
       RETURNING id, student_id, violation_label, reported_by, remarks, 
                 signature_image, signature_updated_at, archived_at, 
                 semester, school_year, original_created_at, original_updated_at, is_unresolved`,
      [
        String(remarks || "").trim() || null,
        String(reportedBy || "").trim() || null,
        typeof isUnresolved === "boolean" ? isUnresolved : null,
        normalizedSemester || null,
        normalizedSchoolYear || null,
        isImportedRecord,
        id,
      ],
    );

    if (!result.rows?.[0]) {
      return res.status(404).json({
        status: "error",
        message: "Archived violation not found.",
      });
    }

    const updatedViolation = result.rows[0];

    const normalizedName = splitMiddleInitialFromFirstName(
      firstName,
      middleInitial,
    );
    const cleanedFirstName = normalizedName.firstName;
    const cleanedMiddleInitial = normalizedName.middleInitial;
    const cleanedLastName = formatStudentNameSegment(lastName);
    if (
      (cleanedFirstName || cleanedMiddleInitial || cleanedLastName) &&
      updatedViolation.student_id
    ) {
      const fullName = buildStudentFullName(
        cleanedFirstName,
        cleanedMiddleInitial,
        cleanedLastName,
      );
      await pool.query(
        `UPDATE "Students"
         SET first_name = COALESCE(NULLIF($1, ''), first_name),
             middle_initial = NULLIF($2, ''),
             last_name = COALESCE(NULLIF($3, ''), last_name),
             full_name = COALESCE(NULLIF($4, ''), full_name)
         WHERE id = $5`,
        [
          cleanedFirstName || null,
          cleanedMiddleInitial || "",
          cleanedLastName || null,
          fullName || null,
          updatedViolation.student_id,
        ],
      );
    }

    // Log audit event
    await logAuditEvent(req, {
      action: "UPDATE_ARCHIVED_VIOLATION",
      targetType: "StudentViolation",
      targetId: id,
      details: `Updated archived violation record.`,
    });

    // Only trigger promotion logic when the record is explicitly marked as resolved from unresolved.
    let promotionResult = null;
    if (
      wasUnresolved &&
      typeof isUnresolved === "boolean" &&
      isUnresolved === false
    ) {
      promotionResult = await checkAndAutoPromoteStudent(
        pool,
        updatedViolation.student_id,
        updatedViolation.semester,
        updatedViolation.school_year,
      );

      // Check if student is in unresolved archive and should be moved to main archive
      if (updatedViolation.student_id) {
        const studentCheck = await pool.query(
          `SELECT is_archived, is_unresolved_archive FROM "Students" WHERE id = $1 LIMIT 1`,
          [updatedViolation.student_id],
        );
        const student = studentCheck.rows?.[0];
        if (student?.is_archived && student?.is_unresolved_archive) {
          // Count total unresolved violations for this student
          const unresolvedCountResult = await pool.query(
            `SELECT COUNT(*)::int AS count FROM student_violation_archives WHERE student_id = $1 AND is_unresolved = TRUE`,
            [updatedViolation.student_id],
          );
          const unresolvedArchiveCount = Number(unresolvedCountResult.rows?.[0]?.count || 0);

          // Count unresolved active violations
          const activeUnresolvedResult = await pool.query(
            `SELECT COUNT(*)::int AS count FROM student_violation_logs WHERE student_id = $1 AND cleared_at IS NULL`,
            [updatedViolation.student_id],
          );
          const activeUnresolvedCount = Number(activeUnresolvedResult.rows?.[0]?.count || 0);

          const totalUnresolved = unresolvedArchiveCount + activeUnresolvedCount;

          if (totalUnresolved === 0) {
            // Move student from unresolved archive to main archive
            await pool.query(
              `UPDATE "Students" SET is_unresolved_archive = FALSE WHERE id = $1`,
              [updatedViolation.student_id],
            );
          }
        }
      }
    }

    let responseViolation = updatedViolation;
    if (updatedViolation.student_id) {
      const refreshedStudent = await pool.query(
        `SELECT full_name, first_name, middle_initial, last_name, school_id, program, year_section
         FROM "Students"
         WHERE id = $1
         LIMIT 1`,
        [updatedViolation.student_id],
      );

      if (refreshedStudent.rows?.[0]) {
        const student = refreshedStudent.rows[0];
        responseViolation = {
          ...updatedViolation,
          student_name: student.full_name || "",
          first_name: student.first_name || "",
          middle_initial: student.middle_initial || "",
          last_name: student.last_name || "",
          school_id: student.school_id || "",
          program: student.program || "",
          year_section: student.year_section || "",
        };
      }
    }

    const response = {
      status: "ok",
      violation: responseViolation,
      preservedYearSection,
    };

    if (promotionResult) {
      response.promotion = promotionResult;
    }

    return res.status(200).json(response);
  } catch (error) {
    console.error("Error updating archived violation:", error);
    return res.status(503).json({
      status: "error",
      message: `Unable to update archived violation (${error.message}).`,
    });
  }
});

// IMPORT workbook record into database archive
app.post("/api/archive/violations/:id/import", async (req, res) => {
  const { id } = req.params;

  if (!hasDbConfig()) {
    return res.status(500).json({
      status: "error",
      message: "Database is not configured.",
    });
  }

  // Only allow importing workbook records
  if (typeof id !== "string" || !id.startsWith("wb-")) {
    return res.status(400).json({
      status: "error",
      message:
        "Only workbook records can be imported. This appears to be a database record.",
    });
  }

  try {
    await ensureAuthDatabaseReady();
    const pool = getDbPool();
    await ensureArchiveColumnsExist(pool);

    // Parse workbook ID: wb-YYYY-YYYY-SEMESTER-index
    const chunks = id.split("-");
    if (chunks.length < 5) {
      return res.status(400).json({
        status: "error",
        message: "Invalid workbook record ID format.",
      });
    }

    const indexString = chunks.pop();
    const index = Number(indexString);
    if (!Number.isFinite(index) || index < 0) {
      return res.status(400).json({
        status: "error",
        message: "Invalid workbook record index.",
      });
    }

    const schoolYear = `${chunks[1]}-${chunks[2]}`;
    const semester = chunks.slice(3).join("-");

    // Load workbook records to find the one to import
    const workbookRecords = await loadHistoricalViolationRecordsFromWorkbook();
    const filteredRecords = workbookRecords.filter(
      (record) =>
        normalizeSchoolYear(record.schoolYear) ===
          normalizeSchoolYear(schoolYear) &&
        normalizeSemester(record.semester) === normalizeSemester(semester),
    );

    if (index >= filteredRecords.length) {
      return res.status(404).json({
        status: "error",
        message: "Workbook record not found.",
      });
    }

    const recordToImport = filteredRecords[index];
    const archivedAt =
      toArchiveTimestamp(recordToImport.date) || new Date().toISOString();

    let studentId = await resolveWorkbookStudentId(
      pool,
      recordToImport.studentName,
    );
    if (!studentId) {
      studentId = await getOrCreateHistoricalWorkbookStudent(
        pool,
        recordToImport,
      );
    }

    const { category, degree, label } = parseWorkbookTypeLabel(
      recordToImport.typeLabel,
    );
    const sourceImportKey = buildWorkbookImportKey(recordToImport);

    // Check for duplicates based on student name, violation label, school year, semester, and date.
    const duplicateCheck = await pool.query(
      `SELECT id FROM student_violation_archives 
       WHERE student_id = $1 
       AND violation_label = $2
       AND school_year = $3
       AND semester = $4
       AND archived_at::date = $5::date
       AND remarks = 'IMPORTED'
       AND is_unresolved = FALSE
       LIMIT 1`,
      [
        studentId,
        recordToImport.violationLabel || "",
        normalizeSchoolYear(recordToImport.schoolYear),
        normalizeSemester(recordToImport.semester),
        formatWorkbookComparisonDate(recordToImport.date),
      ],
    );

    if (duplicateCheck.rows.length > 0) {
      return res.status(409).json({
        status: "error",
        message:
          "This record has already been imported. Duplicate records are not allowed.",
      });
    }

    // Insert record into database (include parsed type fields)
    const insertResult = await pool.query(
      `INSERT INTO student_violation_archives 
       (student_id, violation_catalog_id, violation_label, reported_by, remarks, source_import_key, 
        signature_image, signature_updated_at, semester, school_year, is_unresolved,
        archived_by_user_id, archived_by_name, original_created_at, original_updated_at,
        violation_category, violation_degree, violation_type_label)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       RETURNING id`,
      [
        studentId,
        null, // violation_catalog_id - no linked violation
        recordToImport.violationLabel || "",
        "",
        "IMPORTED", // remarks - mark as imported
        sourceImportKey,
        "", // signature_image - no signature for workbook records
        null, // signature_updated_at
        normalizeSemester(recordToImport.semester),
        normalizeSchoolYear(recordToImport.schoolYear),
        false, // is_unresolved - import as resolved, not unresolved
        req.user?.id || null,
        req.user?.full_name || "System",
        archivedAt,
        archivedAt,
        category,
        degree,
        label,
      ],
    );

    if (!insertResult.rows?.[0]) {
      return res.status(500).json({
        status: "error",
        message: "Failed to create database record.",
      });
    }

    const importedRecordId = insertResult.rows[0].id;

    // Keep workbook rows as the canonical source file; do not delete on import.

    // Log audit event
    await logAuditEvent(req, {
      action: "IMPORT_WORKBOOK_VIOLATION",
      targetType: "StudentViolation",
      targetId: importedRecordId,
      details: `Imported workbook record for student: ${recordToImport.studentName || "Unknown"}, violation: ${recordToImport.violationLabel || "Unknown"}`,
    });

    // Return the imported record with all details
    const importedRecord = await pool.query(
      `SELECT * FROM student_violation_archives WHERE id = $1`,
      [importedRecordId],
    );

    return res.status(201).json({
      status: "ok",
      message: "Record imported successfully.",
      violation: {
        ...importedRecord.rows[0],
        student_name: recordToImport.studentName || "",
        school_id: recordToImport.schoolId || "",
        program: recordToImport.program || "",
        year_section: recordToImport.yearSection || "",
        violation_category: category,
        violation_degree: degree,
      },
    });
  } catch (error) {
    console.error("Error importing workbook record:", error);
    return res.status(503).json({
      status: "error",
      message: `Unable to import workbook record (${error.message}).`,
    });
  }
});

// CLEANUP and RE-IMPORT all workbook records (delete existing imported records, then re-import all)
app.post("/api/archive/cleanup-and-reimport-workbook", async (req, res) => {
  if (!hasDbConfig()) {
    return res.status(500).json({
      status: "error",
      message: "Database is not configured.",
    });
  }

  try {
    await ensureAuthDatabaseReady();
    const pool = getDbPool();
    await ensureArchiveColumnsExist(pool);

    const workbookRecords = await loadHistoricalViolationRecordsFromWorkbook();

    // Delete first from database so the re-import is clean and non-duplicated.
    const cleanupResult = await pool.query(
      `DELETE FROM student_violation_archives
       WHERE remarks = 'IMPORTED'
       RETURNING id`,
    );

    const cleanupCount = Array.isArray(cleanupResult.rows)
      ? cleanupResult.rows.length
      : 0;

    // If workbook has no rows, treat as successful cleanup (no-op import), not a hard error.
    if (!workbookRecords.length) {
      await logAuditEvent(req, {
        action: "CLEANUP_AND_REIMPORT_WORKBOOK",
        targetType: "StudentViolation",
        targetId: "BULK_WORKBOOK",
        details: `Cleaned up ${cleanupCount} existing records. Workbook has no rows to import.`,
      });

      return res.status(200).json({
        status: "ok",
        message:
          "Cleanup completed. No rows found in ViolationRecords1.xlsx to re-import.",
        cleanupCount,
        importCount: 0,
        importedRecords: [],
      });
    }

    let importCount = 0;
    const importedRecords = [];

    let skippedCount = 0;
    for (let index = 0; index < workbookRecords.length; index += 1) {
      const record = workbookRecords[index];
      const normalizedSemester = normalizeSemester(record.semester);
      const normalizedSchoolYear = normalizeSchoolYear(record.schoolYear);

      if (!normalizedSemester || !normalizedSchoolYear) {
        continue;
      }

      const archivedAt =
        toArchiveTimestamp(record.date) || new Date().toISOString();

      const studentId =
        (await resolveWorkbookStudentId(pool, record.studentName)) ||
        (await getOrCreateHistoricalWorkbookStudent(pool, record));

      // Skip inserting if a matching (non-unresolved) archive record already exists
      const existing = await pool.query(
        `SELECT id FROM student_violation_archives
         WHERE student_id = $1
           AND LOWER(TRIM(violation_label)) = LOWER(TRIM($2))
           AND school_year = $3
           AND semester = $4
           AND archived_at::date = $5::date
           AND is_unresolved = FALSE
         LIMIT 1`,
        [
          studentId,
          record.violationLabel || "",
          normalizedSchoolYear,
          normalizedSemester,
          formatWorkbookComparisonDate(record.date),
        ],
      );

      if (existing.rows && existing.rows.length > 0) {
        skippedCount += 1;
        continue;
      }

      const { category, degree, label } = parseWorkbookTypeLabel(record.typeLabel);
      const sourceImportKey = buildWorkbookImportKey(record);

      const insertResult = await pool.query(
        `INSERT INTO student_violation_archives 
         (student_id, violation_catalog_id, violation_label, reported_by, remarks, source_import_key, 
          signature_image, signature_updated_at, semester, school_year, is_unresolved,
          archived_by_user_id, archived_by_name, original_created_at, original_updated_at,
          violation_category, violation_degree, violation_type_label)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
         RETURNING id`,
        [
          studentId,
          null,
          record.violationLabel || "",
          "",
          "IMPORTED",
          sourceImportKey,
          "",
          null,
          normalizedSemester,
          normalizedSchoolYear,
          false,
          req.user?.id || null,
          req.user?.full_name || "System",
          archivedAt,
          archivedAt,
          category,
          degree,
          label,
        ],
      );

      if (insertResult.rows?.[0]) {
        importCount += 1;
        importedRecords.push({
          id: insertResult.rows[0].id,
          studentName: record.studentName,
          violationLabel: record.violationLabel,
          semester: normalizedSemester,
          schoolYear: normalizedSchoolYear,
        });
      }
    }

    // Log audit event (include skipped count)
    await logAuditEvent(req, {
      action: "CLEANUP_AND_REIMPORT_WORKBOOK",
      targetType: "StudentViolation",
      targetId: "BULK_WORKBOOK",
      details: `Cleaned up ${cleanupCount} existing records, imported ${importCount} workbook records, skipped ${skippedCount} duplicates`,
    });

    return res.status(200).json({
      status: "ok",
      message: `Successfully cleaned up ${cleanupCount} existing records and imported ${importCount} workbook records. Skipped ${skippedCount} duplicates.`,
      cleanupCount,
      importCount,
      skippedCount,
      importedRecords,
    });
  } catch (error) {
    console.error(
      "Error cleaning up and re-importing workbook records:",
      error,
    );
    return res.status(503).json({
      status: "error",
      message: `Unable to cleanup and re-import workbook records (${error.message}).`,
    });
  }
});

// DELETE archived violation
app.delete("/api/archive/violations/:id", async (req, res) => {
  const { id } = req.params;
  const isWorkbookRecord = typeof id === "string" && id.startsWith("wb-");

  if (isWorkbookRecord && isServerlessRuntime) {
    return res.status(409).json({
      status: "error",
      message:
        "Historical workbook records are read-only in the serverless deployment. Import them into the database to edit or delete them.",
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

    let deleted = false;
    const pool = getDbPool();

    if (isWorkbookRecord) {
      deleted = await deleteHistoricalWorkbookRecordById(id);
    } else {
      const result = await pool.query(
        `DELETE FROM student_violation_archives WHERE id = $1 RETURNING id`,
        [id],
      );
      deleted = Boolean(result.rows?.[0]);
    }

    if (!deleted) {
      return res.status(404).json({
        status: "error",
        message: "Archived violation not found.",
      });
    }

    await logAuditEvent(req, {
      action: "DELETE_ARCHIVED_VIOLATION",
      targetType: "StudentViolation",
      targetId: id,
      details: `Deleted archived violation ${id}`,
    });

    return res.status(200).json({
      status: "ok",
      message: "Archived violation deleted.",
    });
  } catch (error) {
    if (isWorkbookBusyError(error)) {
      return res.status(423).json({
        status: "error",
        message:
          "ViolationRecords1.xlsx is currently in use. Close the file and try deleting again.",
      });
    }
    if (error?.code === "SERVERLESS_WORKBOOK_READONLY") {
      return res.status(409).json({
        status: "error",
        message: error.message,
      });
    }
    console.error("Error deleting archived violation:", error);
    return res.status(503).json({
      status: "error",
      message: `Unable to delete archived violation (${error.message}).`,
    });
  }
});

if (!isServerlessRuntime) {
  // In non-serverless mode, keep serving local assets and SPA fallback from Express.
  app.use("/uploads", express.static(uploadsDir));
  app.use(express.static(distPath));

  app.get("/{*path}", (req, res, next) => {
    if (req.path.startsWith("/api/")) {
      return next();
    }

    return res.sendFile(path.join(distPath, "index.html"));
  });
}

let server;
let authSyncPromise = null;
let auditCleanupTimer = null;
let notificationCleanupTimer = null;

async function ensureAuthDatabaseReady() {
  if (!authSyncPromise) {
    const seedAccounts = getSeedAccountsFromEnv();
    const isDev = process.env.NODE_ENV === "development";
    const shouldUseLightweightServerlessReadiness =
      isServerlessRuntime && !isDev && !shouldRunServerlessDbSync;

    const runFullSynchronization = async () => {
      // Run base table syncs sequentially for predictable migration ordering.
      await syncAuthDatabase({ seedAccounts });
      await syncStudentsDatabase();
      await syncSystemSettingsDatabase();
      await syncViolationsDatabase(false);
      await syncAuditLogsDatabase();
      await syncStudentsFromUsers();
      await syncNotificationsDatabase();
      await syncPasswordResetDatabase();
      await syncSuperAdminSecurityDatabase();
      await syncStudentViolationLogsDatabase();
      await syncAppStateDatabase();
    };

    authSyncPromise = (async () => {
      if (shouldUseLightweightServerlessReadiness) {
        const schemaIsCurrent = await isAuthSchemaCurrent();
        if (!schemaIsCurrent) {
          throw new Error(
            "Database schema is not initialized for serverless mode. Run the schema sync once before deploying, or temporarily enable SVMS_ENABLE_SERVERLESS_DB_SYNC=true.",
          );
        }
        return;
      }

      const schemaIsCurrent = await isAuthSchemaCurrent();

      if (schemaIsCurrent) {
        try {
          // Fast path for known/current schema - skip heavy operations in dev.
          await syncAuthDatabase({ seedAccounts, skipSchemaCheck: true });
          await syncStudentsDatabase();
          await syncSystemSettingsDatabase();
          // In dev, skip re-seeding violations and app state sync - they're heavy operations
          await syncViolationsDatabase(isDev);
          await syncAuditLogsDatabase();
          await syncStudentsFromUsers();
          await syncNotificationsDatabase();
          await syncPasswordResetDatabase();
          await syncSuperAdminSecurityDatabase();
          await syncStudentViolationLogsDatabase();
          // Defer app state sync in dev mode - it creates triggers on all tables
          if (!isDev) {
            await syncAppStateDatabase();
          }
          return;
        } catch (fastPathError) {
          console.warn(
            `Fast startup sync failed, retrying with full synchronization: ${fastPathError.message}`,
          );
          await runFullSynchronization();
          return;
        }
      }

      await runFullSynchronization();
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
    const isDev = process.env.NODE_ENV === "development";

    ensureAuthDatabaseReady()
      .then(async () => {
        await ensureDefaultSuperAdminAccount();
        console.log("Auth database synchronized.");

        purgeExpiredAuditLogs();
        auditCleanupTimer = setInterval(() => {
          purgeExpiredAuditLogs();
        }, AUDIT_LOG_CLEANUP_INTERVAL_MS);

        purgeExpiredNotifications();
        notificationCleanupTimer = setInterval(() => {
          purgeExpiredNotifications();
        }, NOTIFICATION_CLEANUP_INTERVAL_MS);

        await deactivateGraduatedStudentAccounts();

        if (seedAccounts.length === 0) {
          console.log("No account seed variables detected during startup.");
        }

        // Lazy-load app state sync in background after critical operations
        if (isDev) {
          // In dev, defer app state sync to background to speed up startup
          setImmediate(async () => {
            try {
              await syncAppStateDatabase();
            } catch (err) {
              console.warn(`App state sync deferred to later: ${err.message}`);
            }
          });
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

  if (notificationCleanupTimer) {
    clearInterval(notificationCleanupTimer);
    notificationCleanupTimer = null;
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

if (!isServerlessRuntime) {
  process.on("SIGINT", () => {
    shutdown("SIGINT");
  });

  process.on("SIGTERM", () => {
    shutdown("SIGTERM");
  });

  startServer();
} else if (hasDbConfig() && shouldRunServerlessDbSync) {
  // Warm schema on cold starts without creating long-running loops.
  ensureAuthDatabaseReady()
    .then(() => ensureDefaultSuperAdminAccount())
    .catch((error) => {
      console.error(
        "Failed to synchronize auth database on serverless cold start.",
      );
      console.error(error.message);
    });
}

function isAuthorizedCronRequest(req) {
  const configuredSecret = String(process.env.CRON_SECRET || "").trim();
  const authHeader = String(req.headers.authorization || "").trim();

  if (configuredSecret) {
    return authHeader === `Bearer ${configuredSecret}`;
  }

  const userAgent = String(req.headers["user-agent"] || "").trim();
  return userAgent === "vercel-cron/1.0" || !isServerlessRuntime;
}

app.get("/api/cron/maintenance", async (req, res) => {
  if (!isAuthorizedCronRequest(req)) {
    return res.status(401).json({
      status: "error",
      message: "Unauthorized cron request.",
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
    await purgeExpiredAuditLogs();
    await purgeExpiredNotifications();
    await deactivateGraduatedStudentAccounts();

    return res.status(200).json({
      status: "ok",
      message: "Maintenance completed.",
      ranAt: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(503).json({
      status: "error",
      message: `Maintenance failed (${error.message}).`,
    });
  }
});

app.get("/api/cron/keepalive", async (req, res) => {
  if (!isAuthorizedCronRequest(req)) {
    return res.status(401).json({
      status: "error",
      message: "Unauthorized cron request.",
    });
  }

  if (!hasDbConfig()) {
    return res.status(500).json({
      status: "error",
      message: "Database is not configured.",
    });
  }

  try {
    const heartbeat = await recordProjectActivityHeartbeat("vercel-cron");

    return res.status(200).json({
      status: "ok",
      message: "Keepalive completed.",
      heartbeat,
      ranAt: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(503).json({
      status: "error",
      message: `Keepalive failed (${error.message}).`,
    });
  }
});

export default app;
