import React from 'react'
import { Routes, Route } from 'react-router-dom'
import DashboardLayout from '../components/layout/DashboardLayout'
import Dashboard from '../pages/Dashboard'
import UserManagement from '../pages/UserManagement'
import StudentViolation from '../pages/StudentViolation'
import Violations from '../pages/Violations'
import Archives from '../pages/Archives'
import Settings from '../pages/Settings'
import Login from '../pages/Login'

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
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
