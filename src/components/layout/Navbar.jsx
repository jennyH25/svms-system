import { UserPen } from 'lucide-react'
import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import EditProfileModal from '../modals/EditProfileModal'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { getAuditHeaders } from '@/lib/auditHeaders'

const Navbar = ({ onRequestLogout }) => {
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false)
  const [notifCount, setNotifCount] = useState(0)
  const [allNotifications, setAllNotifications] = useState([])
  const [dropdownNotifications, setDropdownNotifications] = useState([])
  const [showActions, setShowActions] = useState(false)
  const currentUser = JSON.parse(localStorage.getItem('svms_user') || '{}')
  const welcomeRole = currentUser?.role === 'student' ? 'Student' : 'Admin'
  const navigate = useNavigate()

  const computeDropdownNotifications = (notifications) => {
    if (!notifications || notifications.length === 0) return []

    if (notifications.length <= 10) {
      return notifications
    }

    const unread = notifications
      .filter((n) => !n.read_at)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

    if (unread.length <= 6) {
      return unread.slice(0, 6)
    }

    return unread.slice(0, 10)
  }

  const parseNotificationMetadata = (rawMetadata) => {
    if (!rawMetadata) return null
    if (typeof rawMetadata === 'object') return rawMetadata

    try {
      return JSON.parse(rawMetadata)
    } catch (_error) {
      return null
    }
  }

  useEffect(() => {
    let isMounted = true
    async function loadData() {
      if (currentUser?.role !== 'student') return
      try {
        // Fetch unread count
        const countRes = await fetch('/api/notifications/unread-count', {
          headers: { ...getAuditHeaders() },
        })
        const countData = await countRes.json().catch(() => ({}))
        if (countRes.ok && isMounted) {
          setNotifCount(Number(countData.count) || 0)
        }

        // Fetch all notifications
        const notifRes = await fetch('/api/notifications', {
          headers: { ...getAuditHeaders() },
        })
        const notifData = await notifRes.json().catch(() => ({}))
        if (notifRes.ok && isMounted) {
          const notifications = (notifData.notifications || []).map((note) => ({
            ...note,
            metadata: parseNotificationMetadata(note.metadata),
          }))

          setAllNotifications(notifications)
          setDropdownNotifications(computeDropdownNotifications(notifications))
        }
      } catch (err) {
        console.error('failed to fetch notif data', err)
      }
    }
    loadData()
    const interval = setInterval(loadData, 15000) // refresh periodically

    // mark badge cleared when notified (all or single)
    const onReadAll = () => {
      if (isMounted) setNotifCount(0)
    };
    const onReadSingle = () => {
      if (isMounted) setNotifCount(prev => Math.max(0, prev - 1))
    };
    window.addEventListener('notificationsRead', onReadAll)
    window.addEventListener('notificationRead', onReadSingle)

    return () => {
      isMounted = false
      clearInterval(interval)
      window.removeEventListener('notificationsRead', onReadAll)
      window.removeEventListener('notificationRead', onReadSingle)
    }
  }, [currentUser])

  const handleMarkAllRead = async () => {
    try {
      await fetch('/api/notifications/mark-read-all', {
        method: 'PUT',
        headers: { ...getAuditHeaders() },
      })

      setAllNotifications((prev) => {
        const updated = prev.map((note) => ({ ...note, read_at: new Date().toISOString() }))
        setDropdownNotifications(computeDropdownNotifications(updated))
        return updated
      })
      setNotifCount(0)
      window.dispatchEvent(new Event('notificationsRead'))
      setShowActions(false)
    } catch (err) {
      console.error('Failed to mark all read', err)
    }
  }

  const handleSaveProfile = async (formData) => {
    const nextUser = {
      ...currentUser,
      username: formData.username,
      schoolId: formData.schoolId,
      email: formData.email,
      firstName: formData.firstName,
      lastName: formData.lastName,
      fullName: [formData.firstName, formData.lastName].filter(Boolean).join(' '),
    }

    if (currentUser?.role === 'admin') {
      try {
        const response = await fetch('/api/profile/admin', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...getAuditHeaders(),
          },
          body: JSON.stringify({
            id: currentUser.id,
            username: formData.username,
            email: formData.email,
            firstName: formData.firstName,
            lastName: formData.lastName,
          }),
        })

        const result = await response.json().catch(() => ({}))

        if (!response.ok) {
          alert(result?.message || 'Failed to save admin profile.')
          return
        }

        localStorage.setItem('svms_user', JSON.stringify(result.user))
      } catch (_error) {
        alert('Unable to save admin profile right now.')
        return
      }
    } else {
      try {
        const response = await fetch('/api/profile/student', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: currentUser.id,
            username: formData.username,
            schoolId: formData.schoolId,
            email: formData.email,
            firstName: formData.firstName,
            lastName: formData.lastName,
            currentPassword: formData.currentPassword,
            newPassword: formData.newPassword,
            confirmPassword: formData.confirmPassword,
          }),
        })

        const result = await response.json().catch(() => ({}))

        if (!response.ok) {
          alert(result?.message || 'Failed to save student profile.')
          return
        }

        localStorage.setItem('svms_user', JSON.stringify(result.user || nextUser))
      } catch (_error) {
        alert('Unable to save student profile right now.')
        return
      }
    }

    setIsEditProfileOpen(false)
    window.location.reload()
  }

  const handleLogout = () => {
    if (typeof onRequestLogout === 'function') {
      onRequestLogout()
      return
    }
    // Clear user session (customize as needed)
    localStorage.clear();
    window.location.href = '/login';
  }

  return (
    <>
      <header className="bg-black/30 px-8 py-4 flex justify-between items-center font-inter">
        {/* Welcome Message */}
        <div>
          <h1 className="text-lg text-white">
            <span className="font-bold">Welcome,</span>{' '}
            <span className="font-normal">{welcomeRole}</span>
          </h1>
        </div>

        {/* Right Side */}
        <div className="flex items-center gap-5">
          {/* Notification Bell */}
          {currentUser?.role === 'student' && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="text-gray-400 hover:text-white transition-colors relative">
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                    />
                  </svg>
                  {notifCount > 0 && (
                    <span className="absolute top-0 right-0 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                      {notifCount > 9 ? '9+' : notifCount}
                    </span>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-[#1E1F22]/95 backdrop-blur-md border border-white/10 rounded-xl shadow-lg w-80 p-0">
                <div className="flex items-center justify-between p-4 border-b border-white/10">
                  <h3 className="text-white font-semibold">Notifications</h3>
                  <div className="relative">
                    <button
                      className="text-gray-400 hover:text-white p-1"
                      onClick={() => setShowActions((prev) => !prev)}
                    >
                      ⋮
                    </button>
                    {showActions && (
                      <div className="absolute right-0 mt-1 w-44 bg-[#1E1F22] border border-white/10 rounded-lg shadow-lg z-20">
                        <button
                          className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-white/10"
                          onClick={handleMarkAllRead}
                        >
                          Mark all as read
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="max-h-80 overflow-y-auto overflow-x-hidden px-4 py-3 space-y-2">
                  {dropdownNotifications.length === 0 ? (
                    <p className="text-gray-400 text-sm">No notifications</p>
                  ) : (
                    dropdownNotifications.map((note) => (
                      <div
                        key={note.id}
                        className={`p-2 rounded-lg cursor-pointer ${note.read_at ? 'bg-[#232528]/60 hover:bg-white/10' : 'bg-blue-500/20 border-l-2 border-blue-500'} ${!note.read_at ? 'font-bold' : ''}`}
                        onClick={async () => {
                          if (!note.read_at) {
                            try {
                              await fetch(`/api/notifications/${note.id}/mark-read`, {
                                method: 'PUT',
                                headers: { ...getAuditHeaders() },
                              })
                              const now = new Date().toISOString()
                              setAllNotifications((prev) => {
                                const updated = prev.map((n) => n.id === note.id ? { ...n, read_at: now } : n)
                                setDropdownNotifications(computeDropdownNotifications(updated))
                                return updated
                              })
                              setNotifCount((prev) => Math.max(0, prev - 1))
                              window.dispatchEvent(new Event('notificationRead'))
                            } catch (err) {
                              console.error('Failed to mark read', err)
                            }
                          }

                          const metadataType = String(note.metadata?.type || '')

                          if (metadataType.startsWith('student_violation_')) {
                            if (note.metadata?.violationLogId) {
                              navigate(`/student/violations?highlight=${note.metadata.violationLogId}`)
                            } else {
                              navigate('/student/violations')
                            }
                          } else if (metadataType === 'admin_alert') {
                            navigate(`/student/notifications?highlight=${note.id}`)
                          } else if (
                            metadataType === 'violation_added' ||
                            metadataType === 'violation_updated' ||
                            metadataType === 'violation_deleted'
                          ) {
                            if (note.metadata?.violationId) {
                              navigate(`/student/offenses?highlight=${note.metadata.violationId}`)
                            } else {
                              navigate('/student/offenses')
                            }
                          } else {
                            navigate(`/student/notifications?highlight=${note.id}`)
                          }
                          setShowActions(false)
                        }}
                      >
                        <div className="flex justify-between items-center gap-2">
                          <span className="text-white text-sm">{note.title}</span>
                          {!note.read_at && <span className="w-2 h-2 bg-blue-500 rounded-full" />}
                        </div>
                        <div className={`text-gray-400 text-xs ${!note.read_at ? 'font-semibold' : ''}`}>{note.description}</div>
                        <div className="text-gray-500 text-xs mt-1">{new Date(note.created_at).toLocaleString()}</div>
                      </div>
                    ))
                  )}
                </div>
                <div className="sticky bottom-0 bg-[#1E1F22]/95 border-t border-white/10 p-2">
                  <button
                    className="w-full text-center text-blue-400 hover:text-blue-300 text-sm font-medium"
                    onClick={() => {
                      setShowActions(false)
                      navigate('/student/notifications')
                    }}
                  >
                    View all
                  </button>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Profile Avatar with Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 p-0.5 overflow-hidden cursor-pointer">
                <div className="w-full h-full rounded-full bg-[#1a1a1a] flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                  </svg>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-[#1E1F22]/95 backdrop-blur-md border border-white/10 rounded-xl shadow-lg">
              <DropdownMenuItem 
                className="flex items-center gap-2 text-white hover:bg-white/10 cursor-pointer"
                onClick={() => setIsEditProfileOpen(true)}
              >
                <UserPen className="w-4 h-4" />
                <span>Edit Profile</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="flex items-center gap-2 text-red-400 hover:bg-white/10 cursor-pointer mt-1"
                onClick={handleLogout}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 11-4 0v-1m4-8V5a2 2 0 10-4 0v1" /></svg>
                <span>Logout</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Edit Profile Modal */}
      <EditProfileModal
        isOpen={isEditProfileOpen}
        onClose={() => setIsEditProfileOpen(false)}
        initialData={{
          role: currentUser?.role || '',
          username: currentUser?.username || '',
          schoolId: currentUser?.schoolId || '',
          firstName: currentUser?.firstName || '',
          lastName: currentUser?.lastName || '',
          email: currentUser?.email || ''
        }}
        onSave={handleSaveProfile}
      />
    </>
  )
}

export default Navbar
