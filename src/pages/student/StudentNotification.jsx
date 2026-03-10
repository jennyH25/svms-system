import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AnimatedContent from '../../components/ui/AnimatedContent';
import Card from '../../components/ui/Card';
import { getAuditHeaders } from '@/lib/auditHeaders';

const StudentNotification = () => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    let isMounted = true;

    const loadNotifications = async () => {
      setLoading(true);
      setError('');
      try {
        const resp = await fetch('/api/notifications', {
          headers: { ...getAuditHeaders() },
        });
        const data = await resp.json().catch(() => ({}));
        if (resp.ok) {
          if (isMounted) {
            const notifications = (data.notifications || []).map(note => ({
              ...note,
              metadata: note.metadata ? JSON.parse(note.metadata) : null
            }));
            setNotifications(notifications);
          }
        } else {
          if (isMounted) setError(data.message || 'Unable to load notifications');
        }
      } catch (err) {
        console.error('Notification fetch error', err);
        if (isMounted) setError('Network error while fetching notifications');
      } finally {
      if (isMounted) setLoading(false);
    }
    };

    loadNotifications();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <AnimatedContent>
      <div className="flex flex-col gap-6">
        <h2 className="text-2xl font-bold text-white mb-1">NOTIFICATION</h2>
        <Card variant="glass" padding="lg" className="w-full">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">&nbsp;</h3>
            <button
              className="text-gray-400 hover:text-white transition-colors"
              onClick={async () => {
                try {
                  await fetch('/api/notifications/mark-read-all', {
                    method: 'PUT',
                    headers: { ...getAuditHeaders() },
                  });
                  setNotifications(prev => prev.map(n => ({ ...n, read_at: new Date().toISOString() })));
                } catch (err) {
                  console.error('Failed to mark all read', err);
                }
              }}
            >
              Mark all as read
            </button>
          </div>

          {loading ? (
            <div className="text-center text-gray-400 py-8">Loading notifications...</div>
          ) : error ? (
            <div className="text-center text-red-400 py-8">{error}</div>
          ) : notifications.length === 0 ? (
            <div className="text-center text-gray-400 py-8">No notifications</div>
          ) : (
            <div className="space-y-2">
              {notifications.map((note) => (
                <div
                  key={note.id}
                  className={`bg-[#232528]/60 rounded-lg px-4 py-3 flex justify-between items-center border-b border-white/10 cursor-pointer hover:bg-[#232528]/80 ${!note.read_at ? 'ring-1 ring-blue-500/40 bg-blue-500/10' : ''}`}
                  onClick={async () => {
                    // Mark as read if not already
                    if (!note.read_at) {
                      try {
                        await fetch(`/api/notifications/${note.id}/mark-read`, {
                          method: 'PUT',
                          headers: { ...getAuditHeaders() },
                        });
                        setNotifications(prev => prev.map(n => n.id === note.id ? { ...n, read_at: new Date().toISOString() } : n));
                      } catch (err) {
                        console.error('Failed to mark read', err);
                      }
                    }
                    // Navigate based on metadata
                    if (note.metadata?.type === 'violation_added' || note.metadata?.type === 'violation_updated') {
                      navigate(`/student/offenses?highlight=${note.metadata.violationId}`);
                    } else if (note.metadata?.type === 'violation_deleted') {
                      // Deleted violation is no longer in list, go to offenses list
                      navigate('/student/offenses');
                    }
                    // Emit event so sidebar/navbar refresh unread state
                    window.dispatchEvent(new Event('notificationRead'));
                  }}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      {!note.read_at && <span className="w-2 h-2 rounded-full bg-blue-500" />}
                      <span className={`text-white text-sm ${!note.read_at ? 'font-bold' : 'font-medium'}`}>{note.title}</span>
                    </div>
                    <div className={`text-gray-400 text-xs ${!note.read_at ? 'font-semibold' : ''}`}>{note.description}</div>
                    <div className="text-gray-500 text-xs mt-1">{new Date(note.created_at).toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </AnimatedContent>
  );
};

export default StudentNotification;
