import "dotenv/config";
import bcrypt from "bcryptjs";
import {
  closeDbPool,
  getDbPool,
  getMissingDbVars,
  hasDbConfig,
} from "../server/db.js";

const ADMIN_ACCOUNT = {
  email: "jennypatanag@gmail.com",
  username: "jen25",
  password: "admin123",
  role: "admin",
};

const STUDENT_ACCOUNT = {
  email: "hermoso_lyrika@plpasig.edu.ph",
  username: "leeRiKang",
  password: "student123",
  role: "student",
};

const DUMMY_IDENTIFIERS = {
  usernames: ["admin", "student"],
  emails: ["admin@example.com", "student@example.com"],
};

async function setupAuthDatabase() {
  if (!hasDbConfig()) {
    console.error(
      "Missing required environment variables:",
      getMissingDbVars().join(", "),
    );
    process.exit(1);
  }

  const pool = getDbPool();

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        username VARCHAR(100) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role ENUM('admin', 'student') NOT NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await pool.query(
      `
      DELETE FROM users
      WHERE username IN (?, ?) OR email IN (?, ?)
      `,
      [
        DUMMY_IDENTIFIERS.usernames[0],
        DUMMY_IDENTIFIERS.usernames[1],
        DUMMY_IDENTIFIERS.emails[0],
        DUMMY_IDENTIFIERS.emails[1],
      ],
    );

    const adminHash = await bcrypt.hash(ADMIN_ACCOUNT.password, 12);
    const studentHash = await bcrypt.hash(STUDENT_ACCOUNT.password, 12);

    await pool.query(
      `
      INSERT INTO users (email, username, password_hash, role)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        password_hash = VALUES(password_hash),
        role = VALUES(role),
        is_active = 1
      `,
      [
        ADMIN_ACCOUNT.email,
        ADMIN_ACCOUNT.username,
        adminHash,
        ADMIN_ACCOUNT.role,
      ],
    );

    await pool.query(
      `
      INSERT INTO users (email, username, password_hash, role)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        password_hash = VALUES(password_hash),
        role = VALUES(role),
        is_active = 1
      `,
      [
        STUDENT_ACCOUNT.email,
        STUDENT_ACCOUNT.username,
        studentHash,
        STUDENT_ACCOUNT.role,
      ],
    );

    console.log("Auth database setup completed successfully.");
    console.log(
      `Admin account ensured: ${ADMIN_ACCOUNT.username} / ${ADMIN_ACCOUNT.email}`,
    );
    console.log(
      `Student account ensured: ${STUDENT_ACCOUNT.username} / ${STUDENT_ACCOUNT.email}`,
    );
  } catch (error) {
    console.error("Failed to setup auth database.");
    console.error(error.message);
    process.exit(1);
  } finally {
    await closeDbPool();
  }
}

setupAuthDatabase();
