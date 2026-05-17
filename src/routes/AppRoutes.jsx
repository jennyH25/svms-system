import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

const AdminLayout = lazy(() => import("../components/layout/AdminLayout"));
const StudentLayout = lazy(() => import("../components/layout/StudentLayout"));

const Dashboard = lazy(() => import("../pages/admin/Dashboard"));
const UserManagement = lazy(() => import("../pages/admin/UserManagement"));
const StudentViolation = lazy(() => import("../pages/admin/StudentViolation"));
const Violations = lazy(() => import("../pages/admin/Violations"));
const Archives = lazy(() => import("../pages/admin/Archives"));
const Settings = lazy(() => import("../pages/admin/Settings"));
const SuperAdminDashboard = lazy(() =>
  import("../pages/superAdmin/SuperAdminDashboard"),
);

const StudentDashboard = lazy(() => import("../pages/student/StudentDashboard"));
const StudentViolations = lazy(() => import("../pages/student/StudentViolations"));
const StudentOffensesList = lazy(() =>
  import("../pages/student/StudentOffensesList"),
);
const StudentNotification = lazy(() =>
  import("../pages/student/StudentNotification.jsx"),
);

const Login = lazy(() => import("../pages/auth/Login"));
const PrivacyPolicy = lazy(() => import("../pages/legal/PrivacyPolicy"));
const TermsOfService = lazy(() => import("../pages/legal/TermsOfService"));

function RouteFallback() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-white/5 px-6 py-8 text-center shadow-2xl backdrop-blur">
        <p className="text-sm uppercase tracking-[0.3em] text-slate-400">
          Loading
        </p>
        <h1 className="mt-3 text-xl font-semibold text-white">
          Preparing your workspace
        </h1>
        <p className="mt-2 text-sm text-slate-300">
          Large admin tools are being loaded only when needed to keep the app snappy.
        </p>
      </div>
    </div>
  );
}

const AppRoutes = () => {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />

        <Route path="/login" element={<Login />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsOfService />} />
        <Route path="/student/login" element={<Login />} />

        <Route path="/super-admin" element={<AdminLayout />}>
          <Route index element={<SuperAdminDashboard />} />
          <Route path="settings" element={<Settings />} />
        </Route>

        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="user-management" element={<UserManagement />} />
          <Route path="student-violation" element={<StudentViolation />} />
          <Route path="violations" element={<Violations />} />
          <Route path="archives" element={<Archives />} />
          <Route path="settings" element={<Settings />} />
        </Route>

        <Route path="/student/" element={<StudentLayout />}>
          <Route index element={<StudentDashboard />} />
          <Route path="dashboard" element={<StudentDashboard />} />
          <Route path="violations" element={<StudentViolations />} />
          <Route path="offenses" element={<StudentOffensesList />} />
          <Route path="notifications" element={<StudentNotification />} />
          <Route
            path="notification"
            element={<Navigate to="/student/notifications" replace />}
          />
        </Route>
      </Routes>
    </Suspense>
  );
};

export default AppRoutes;
