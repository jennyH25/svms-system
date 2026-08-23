# Student Violation Monitoring System (SVMS)

## About the System

**Student Violation Monitoring System (SVMS)** is a comprehensive web application designed to streamline the recording, tracking, and management of student disciplinary violations. It provides a secure, role-based ecosystem for educational institutions to enforce disciplinary policies transparently and efficiently.

### Key Capabilities
- **Role-Based Access Control**: Separate interfaces and permissions for Students and Administrators.
- **Student Portal**: Enables students to view their disciplinary records, violation history, resolution status, and system notifications.
- **Admin Dashboard**: Empowers administrators to log new incidents, track violation statuses, manage student profiles, and archive records.
- **Data Export & Reporting**: Generates detailed PDF summary reports and exports violation records to Excel formats (`.xlsx`).
- **Real-Time Notifications & Email Alerts**: Delivers real-time updates via WebSockets and dispatches email notifications for record updates or account actions.

---

## Tech Stack

### Frontend
- **Framework & Tooling**: [React 19](https://react.dev/), [Vite](https://vitejs.dev/)
- **Styling & UI Components**: [Tailwind CSS](https://tailwindcss.com/), [Radix UI](https://www.radix-ui.com/), [Lucide React Icons](https://lucide.dev/)
- **Animations**: [Motion](https://motion.dev/), [GSAP](https://gsap.com/)

### Backend
- **Runtime & Server**: [Node.js](https://nodejs.org/) (>= 20.19.0), [Express.js](https://expressjs.com/)
- **File Uploads**: [Multer](https://github.com/expressjs/multer)

### Database & Authentication
- **Database**: [PostgreSQL](https://www.postgresql.org/) (compatible with [Supabase](https://supabase.com/))
- **Database Driver**: [postgres.js](https://github.com/porsager/postgres)
- **Security & Encryption**: `bcryptjs` for password hashing, custom encryption modules for session tokens and sensitive data

### Real-Time & Communications
- **Real-Time Updates**: [Pusher](https://pusher.com/)
- **Email Notifications**: [Nodemailer](https://nodemailer.com/)

### Document & Data Processing
- **Reporting & Exporting**: `jsPDF` & `jspdf-autotable` (PDF generation), `ExcelJS` & `xlsx` (Excel processing)

---

## Data Privacy & Confidentiality

> **Confidentiality Notice**: All student violation Excel files (`.xlsx`) and exported disciplinary reports serve as confidential datasets containing sensitive personal information. Access to these dataset files is strictly restricted to authorized administration personnel and must be handled in compliance with data privacy policies and security regulations.

