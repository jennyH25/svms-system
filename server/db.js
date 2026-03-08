import mysql from "mysql2/promise";

const requiredVars = [
  "MYSQLHOST",
  "MYSQLPORT",
  "MYSQLUSER",
  "MYSQLPASSWORD",
  "MYSQLDATABASE",
];

export function hasDbConfig() {
  return requiredVars.every((key) => Boolean(process.env[key]));
}

export function getMissingDbVars() {
  return requiredVars.filter((key) => !process.env[key]);
}

let pool;

export function getDbPool() {
  if (!hasDbConfig()) {
    return null;
  }

  if (!pool) {
    pool = mysql.createPool({
      host: process.env.MYSQLHOST,
      port: Number(process.env.MYSQLPORT),
      user: process.env.MYSQLUSER,
      password: process.env.MYSQLPASSWORD,
      database: process.env.MYSQLDATABASE,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      connectTimeout: 10000,
      ssl:
        process.env.MYSQL_SSL === "true"
          ? { rejectUnauthorized: false }
          : undefined,
    });
  }

  return pool;
}

export async function closeDbPool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
