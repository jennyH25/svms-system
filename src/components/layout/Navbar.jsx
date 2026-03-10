import { Search, UserPen } from 'lucide-react'
import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import SearchBar from '../ui/SearchBar'
import EditProfileModal from '../modals/EditProfileModal'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { getAuditHeaders } from '@/lib/auditHeaders'

const Navbar = () => {
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false)
  const [notifCount, setNotifCount] = useState(0)
  const [recentNotifications, setRecentNotifications] = useState([])
  const currentUser = JSON.parse(localStorage.getItem('svms_user') || '{}')
  const welcomeRole = currentUser?.role === 'student' ? 'Student' : 'Admin'
  const navigate = useNavigate()

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

        // Fetch recent notifications (top 5)
        const notifRes = await fetch('/api/notifications', {
          headers: { ...getAuditHeaders() },
        })
        const notifData = await notifRes.json().catch(() => ({}))
        if (notifRes.ok && isMounted) {
          const notifications = (notifData.notifications || []).map(note => ({
            ...note,
            metadata: note.metadata ? JSON.parse(note.metadata) : null
          }));
          setRecentNotifications(notifications.slice(0, 5))
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
          {/* Search Bar */}
          <SearchBar placeholder="Search" className="w-80" />

          {/* Notification Bell */}
          {currentUser?.role === 'student' ? (
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
              <DropdownMenuContent align="end" className="bg-[#1E1F22]/95 backdrop-blur-md border border-white/10 rounded-xl shadow-lg w-80 max-h-96 overflow-y-auto">
                <div className="p-4">
                  <h3 className="text-white font-semibold mb-2">Notifications</h3>
                  {recentNotifications.length === 0 ? (
                    <p className="text-gray-400 text-sm">No notifications</p>
                  ) : (
                    <div className="space-y-2">
                      {recentNotifications.map((note) => (
                        <div
                          key={note.id}
                          className={`p-2 rounded-lg cursor-pointer hover:bg-white/10 ${!note.read_at ? 'bg-blue-500/20 border-l-2 border-blue-500' : ''}`}
                          onClick={async () => {
                            // Mark as read
                            try {
                              await fetch(`/api/notifications/${note.id}/mark-read`, {
                                method: 'PUT',
                                headers: { ...getAuditHeaders() },
                              });
                              // Update local state
                              setRecentNotifications(prev => prev.map(n => n.id === note.id ? { ...n, read_at: new Date().toISOString() } : n));
                              setNotifCount(prev => Math.max(0, prev - 1));
                            } catch (err) {
                              console.error('Failed to mark read', err);
                            }
                            // Navigate based on metadata
                            if (note.metadata?.type === 'violation_added' || note.metadata?.type === 'violation_updated') {
                              navigate(`/student/offenses?highlight=${note.metadata.violationId}`);
                            }
                          }}
                        >
                          <div className="font-bold text-white text-sm">{note.title}</div>
                          <div className="text-gray-400 text-xs">{note.description}</div>
                          <div className="text-gray-500 text-xs mt-1">{new Date(note.created_at).toLocaleString()}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    className="w-full mt-4 text-center text-blue-400 hover:text-blue-300 text-sm font-medium"
                    onClick={() => navigate('/student/notifications')}
                  >
                    View all
                  </button>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <button className="text-gray-400 hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </button>
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
