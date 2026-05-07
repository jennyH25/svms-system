import React, { useState } from 'react'
import { NavLink } from 'react-router-dom'
import logo from '../../assets/css_logo.png'
import { useSettings } from '../../context/SettingsContext'
import { getAuditHeaders } from '@/lib/auditHeaders'
import { cachedFetchJSON } from '@/lib/fetchHelper'

const Sidebar = ({ onRequestLogout }) => {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const { settings, loading } = useSettings()
  const currentUser = JSON.parse(localStorage.getItem('svms_user') || '{}')
  const isSuperAdmin = currentUser?.role === 'super_admin'

  const prefetchAdminViolations = () => {
    void Promise.allSettled([
      cachedFetchJSON('/api/student-violations', {
        headers: { ...getAuditHeaders() },
      }, {
        ttlMs: 15000,
        staleWhileRevalidate: true,
      }),
      cachedFetchJSON('/api/violation-analytics', {
        headers: { ...getAuditHeaders() },
      }, {
        ttlMs: 15000,
        staleWhileRevalidate: true,
      }),
      cachedFetchJSON('/api/archive/current-settings', {
        headers: { ...getAuditHeaders() },
      }, {
        ttlMs: 30000,
        staleWhileRevalidate: true,
      }),
    ])
  }
  
  // Parse the display name to show first two words in bold
  const displayName = settings?.displayName || 'Student Violation Management System'
  const nameParts = displayName.split(' ').filter(Boolean)
  const firstTwoWords = nameParts.slice(0, 2).join(' ') || ''
  const secondLine = nameParts[2] || ''
  const thirdLine = nameParts[3] || ''

  const adminMenuItems = [
    { 
      path: '/admin', 
      label: 'Dashboard',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
        </svg>
      )
    },
    { 
      path: '/admin/user-management', 
      label: 'User Management',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      )
    },
    { 
      path: '/admin/student-violation', 
      label: 'Student Violation',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      )
    },
    { 
      path: '/admin/violations', 
      label: 'Violations',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      )
    },
    { 
      path: '/admin/archives', 
      label: 'Archives',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
        </svg>
      )
    },
  ]

  const superAdminMenuItems = [
    {
      path: '/super-admin',
      label: 'Admin Accounts',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 11V7a5 5 0 00-10 0v4M5 11h14v8a2 2 0 01-2 2H7a2 2 0 01-2-2v-8zm7 4h.01" />
        </svg>
      )
    },
  ]

  const menuItems = isSuperAdmin ? superAdminMenuItems : adminMenuItems

  const settingsItem = {
    path: isSuperAdmin ? '/super-admin/settings' : '/admin/settings',
    label: 'Settings',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    )
  }

  return (
    <aside className={`${isCollapsed ? 'w-24' : 'w-60'} relative h-screen sticky top-0 bg-gradient-to-b from-[#1A1C1F] to-[#232528] text-white p-4 font-inter transition-all duration-300 flex flex-col`}>
      {/* Collapse Button and Logo/Brand */}
      {isCollapsed ? (
        <div className="flex flex-col items-center mb-6 relative">
          <button
            type="button"
            onClick={() => setIsCollapsed((prev) => !prev)}
            className="mb-2 h-8 w-8 flex items-center justify-center rounded-lg border border-white/20 bg-[#232528] hover:bg-[#191c21] transition-all duration-200 shadow-sm z-10"
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {/* Refined sidebar icon: outlined, single line, thin chevron, no fill */}
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="3" width="18" height="18" rx="5" stroke="#A3A3A3" strokeWidth="1.6" fill="none" />
              <line x1="8" y1="6" x2="8" y2="18" stroke="#A3A3A3" strokeWidth="1.3" strokeLinecap="round" />
              <polyline points="15.5,9 12.5,12 15.5,15" stroke="#A3A3A3" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <img
            src={settings?.logoPath || logo}
            alt="System Logo"
            className="h-16 object-contain transition-all duration-300 mx-auto mb-2"
          />
        </div>
      ) : (
        <div className="relative mb-4">
          <img
            src={settings?.logoPath || logo}
            alt="System Logo"
            className="h-[8.5rem] mt-2 mb-2 object-contain transition-all duration-300 mx-auto"
          />
          <button
            type="button"
            onClick={() => setIsCollapsed((prev) => !prev)}
            className="absolute top-2 right-2 h-8 w-8 flex items-center justify-center rounded-lg border border-white/20 bg-[#232528] hover:bg-[#191c21] transition-all duration-200 shadow-sm"
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {/* Refined sidebar icon: outlined, single line, thin chevron, no fill */}
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="3" width="18" height="18" rx="5" stroke="#A3A3A3" strokeWidth="1.6" fill="none" />
              <line x1="8" y1="6" x2="8" y2="18" stroke="#A3A3A3" strokeWidth="1.3" strokeLinecap="round" />
              <polyline points="12.5,9 15.5,12 12.5,15" stroke="#A3A3A3" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      )}
      {/* Brand Text */}
      {!isCollapsed && (
        <div className="mb-6 text-left">
          <h1 className="text-xl font-extrabold leading-tight text-white">
            {firstTwoWords}
          </h1>
          <p className="text-white">{[secondLine, thirdLine].filter(Boolean).join(' ')}</p>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1">
        <ul className="space-y-1">
          {menuItems.map((item) => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                end={item.path === '/admin'}
                onMouseEnter={item.path === '/admin/student-violation' ? prefetchAdminViolations : undefined}
                onFocus={item.path === '/admin/student-violation' ? prefetchAdminViolations : undefined}
                className={({ isActive }) =>
                  `flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-gradient-to-r from-white/15 to-transparent text-white'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`
                }
                title={isCollapsed ? item.label : undefined}
              >
                {item.icon}
                {!isCollapsed && item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <NavLink
        to={settingsItem.path}
        className={({ isActive }) =>
          `flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
            isActive
              ? 'bg-gradient-to-r from-white/15 to-transparent text-white'
              : 'text-gray-400 hover:text-white hover:bg-white/5'
          }`
        }
        title={isCollapsed ? settingsItem.label : undefined}
      >
        {settingsItem.icon}
        {!isCollapsed && settingsItem.label}
      </NavLink>

      <button
        type="button"
        onClick={onRequestLogout}
        className={`mt-4 flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} py-2.5 px-4 rounded-lg text-sm font-medium text-red-300 hover:text-red-200 hover:bg-red-500/10 transition-all`}
        title={isCollapsed ? 'Logout' : undefined}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 11-4 0v-1m4-8V5a2 2 0 10-4 0v1" />
        </svg>
        {!isCollapsed && <span>Logout</span>}
      </button>
    </aside>
  )
}

export default Sidebar
