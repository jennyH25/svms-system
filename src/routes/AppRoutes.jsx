import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import AdminLayout from "../components/layout/AdminLayout";
import StudentLayout from "../components/layout/StudentLayout";

import Dashboard from "../pages/admin/Dashboard";
import UserManagement from "../pages/admin/UserManagement";
import StudentViolation from "../pages/admin/StudentViolation";
import Violations from "../pages/admin/Violations";
import Archives from "../pages/admin/Archives";
import Settings from "../pages/admin/Settings";

import StudentDashboard from "../pages/student/StudentDashboard";
import StudentViolations from "../pages/student/StudentViolations";
import StudentNotification from "../pages/student/StudentNotification.jsx";

import Login from "../pages/auth/Login";

const AppRoutes = () => {
  return (
    <Routes>

      {/* DEFAULT */}
      <Route path="/" element={<Navigate to="/login" replace />} />

      {/* AUTH */}
      <Route path="/login" element={<Login />} />
      <Route path="/student/login" element={<Login />} />

      {/* ================= ADMIN ROUTES ================= */}
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="user-management" element={<UserManagement />} />
        <Route path="student-violation" element={<StudentViolation />} />
        <Route path="violations" element={<Violations />} />
        <Route path="archives" element={<Archives />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      {/* ================= STUDENT ROUTES ================= */}
      <Route path="/student/" element={<StudentLayout />}>
        <Route index element={<StudentDashboard />} />
        <Route path="dashboard" element={<StudentDashboard />} />
        <Route path="violations" element={<StudentViolations />} />
        <Route path="notifications" element={<StudentNotification />} />
        <Route path="notification" element={<Navigate to="/student/notifications" replace />} />
      </Route>

    </Routes>
  );
};

export default AppRoutes;