1. About the System

**Student Violation Monitoring System (SVMS)** — SVMS is a web application for recording, tracking, and managing student disciplinary violations. It provides role-based access for students and administrators: students can view their own records and notifications; administrators can log incidents, maintain records, and produce reports for review or export.

---

2. Technologies Used

- Front-end: `React` + `Vite` (tooling) with `Tailwind CSS` for styling
- Back-end: `Node.js` running an `Express` API
- Database: `PostgreSQL` (Supabase-compatible)

---

3. User flow and System capabilities

User flow:

1. User authenticates (administrator or student)
2. Student: views personal violations, notifications, and status
3. Administrator: logs a violation or updates an existing record
4. System records the change and notifies relevant users
5. Admins generate reports or export data as needed

Capabilities (high level):

- Role-based authentication and access control
- Record creation, editing, archiving, and search for violations
- Reporting and export to common formats (Excel / PDF)
- Email-based account recovery and notifications
