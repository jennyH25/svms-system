import React from 'react'
import { Routes, Route } from 'react-router-dom'
import DashboardLayout from '../components/layout/DashboardLayout'
import Dashboard from '../pages/admin/Dashboard'
import UserManagement from '../pages/admin/UserManagement'
import StudentViolation from '../pages/admin/StudentViolation'
import Violations from '../pages/admin/Violations'
import Archives from '../pages/admin/Archives'
import Settings from '../pages/admin/Settings'
import Login from '../pages/auth/Login'
import StudentDashboard from '../pages/student/StudentDashboard'

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/student/login" element={<Login />} />
      <Route path="/student/dashboard" element={<StudentDashboard />} />
      <Route path="/*" element={
        <DashboardLayout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/user-management" element={<UserManagement />} />
            <Route path="/student-violation" element={<StudentViolation />} />
            <Route path="/violations" element={<Violations />} />
            <Route path="/archives" element={<Archives />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </DashboardLayout>
      } />
    </Routes>
  )
}

export default AppRoutes
