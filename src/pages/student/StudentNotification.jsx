import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Trash2, Loader } from 'lucide-react';
import AnimatedContent from '../../components/ui/AnimatedContent';
import Card from '../../components/ui/Card';
import Modal, { ModalFooter } from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import { getAuditHeaders } from '@/lib/auditHeaders';
import { cachedFetchJSON } from '@/lib/fetchHelper';

const StudentNotification = () => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedAlertNotificationId, setSelectedAlertNotificationId] = useState(null);
  const [showAlertDetailsModal, setShowAlertDetailsModal] = useState(false);
  const [highlightedNotificationId, setHighlightedNotificationId] = useState(null);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [selectedForDeletion, setSelectedForDeletion] = useState(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const isFetchingRef = useRef(false);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightParam = searchParams.get('highlight');

  const selectedAlertNotification = useMemo(
    () => notifications.find((note) => String(note.id) === String(selectedAlertNotificationId)) || null,
    [notifications, selectedAlertNotificationId],
  );

  const handleCheckboxChange = (notificationId) => {
    setSelectedForDeletion(prev => {
      const newSelected = new Set(prev);
      if (newSelected.has(notificationId)) {
        newSelected.delete(notificationId);
      } else {
        newSelected.add(notificationId);
      }
      return newSelected;
    });
  };

  const handleSelectAll = () => {
    if (selectedForDeletion.size === notifications.length) {
      setSelectedForDeletion(new Set());
    } else {
      setSelectedForDeletion(new Set(notifications.map(n => n.id)));
    }
  };

  const handleDeleteSelected = () => {
    if (selectedForDeletion.size === 0) return;
    setShowDeleteConfirmModal(true);
  };

  const confirmDelete = async () => {
    if (selectedForDeletion.size === 0) return;

    const idsToDelete = Array.from(selectedForDeletion);
    setIsDeleting(true);

    try {
      let response;
      if (idsToDelete.length === 1) {
        // Single delete
        response = await fetch(`/api/notifications/${idsToDelete[0]}`, {
          method: 'DELETE',
          headers: { ...getAuditHeaders() },
        });
      } else {
        // Bulk delete
        response = await fetch('/api/notifications', {
          method: 'DELETE',
          headers: { 
            ...getAuditHeaders(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ notification_ids: idsToDelete }),
        });
      }

      const data = await response.json().catch(() => ({}));
      
      if (response.ok) {
        // Remove deleted notifications from state
        setNotifications(prev => prev.filter(n => !idsToDelete.includes(n.id)));
        setShowDeleteConfirmModal(false);
        setSelectedForDeletion(new Set());
        window.dispatchEvent(new Event('notificationsDeleted'));
      } else {
        console.error('Delete failed:', data.message);
        setError(data.message || 'Failed to delete notification(s)');
      }
    } catch (err) {
      console.error('Delete error:', err);
      setError('Network error while deleting notification(s)');
    } finally {
      setIsDeleting(false);
    }
  };

  const parseNotificationMetadata = (rawMetadata) => {
    if (!rawMetadata) return null;
    if (typeof rawMetadata === 'object') return rawMetadata;

    try {
      return JSON.parse(rawMetadata);
    } catch (_error) {
      return null;
    }
  };

  useEffect(() => {
    let isMounted = true;

    const loadNotifications = async ({ silent = false } = {}) => {
      if (isFetchingRef.current) {
        if (!silent && isMounted) {
          setLoading(false);
        }
        return;
      }
      isFetchingRef.current = true;

      if (!silent) {
        setLoading(true);
        setError('');
      }

      try {
        const result = await cachedFetchJSON('/api/notifications', {
          headers: { ...getAuditHeaders() },
        }, {
          ttlMs: 10000,
          staleWhileRevalidate: true,
        });
        if (result.status === 'ok') {
          if (isMounted) {
            const notifications = (result.data?.notifications || []).map((note) => ({
              ...note,
              metadata: parseNotificationMetadata(note.metadata),
            }));
            setNotifications(notifications);
            if (!silent) setError('');
          }
        } else {
          if (isMounted && !silent) {
            setError(result.error || 'Unable to load notifications');
          }
        }
      } catch (err) {
        console.error('Notification fetch error', err);
        if (isMounted && !silent) {
          setError('Network error while fetching notifications');
        }
      } finally {
        isFetchingRef.current = false;
        if (isMounted && !silent) setLoading(false);
      }
    };

    loadNotifications();

    const intervalId = setInterval(() => loadNotifications({ silent: true }), 15000);

    return () => {
      isMounted = false;
      isFetchingRef.current = false;
      clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!highlightParam) return;

    setHighlightedNotificationId(highlightParam);

    const timeoutId = setTimeout(() => {
      setHighlightedNotificationId(null);
      const nextParams = new URLSearchParams(window.location.search);
      nextParams.delete('highlight');
      setSearchParams(nextParams, { replace: true });
    }, 10000);

    return () => clearTimeout(timeoutId);
  }, [highlightParam, setSearchParams]);

  useEffect(() => {
    if (!highlightedNotificationId) return;
    const target = document.getElementById(`student-notification-${highlightedNotificationId}`);
    if (!target) return;

    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightedNotificationId, notifications]);

  return (
    <>
      <AnimatedContent>
        <div className="flex flex-col gap-6">
          <h2 className="text-2xl font-bold text-white mb-1">NOTIFICATION</h2>
          <Card variant="glass" padding="lg" className="w-full">
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <div className="flex items-center gap-3 flex-wrap">
              {notifications.length > 0 && (
                <label className="inline-flex items-center gap-2 text-sm text-gray-200 rounded-lg border border-white/10 bg-white/5 px-3 py-2 cursor-pointer hover:bg-white/10 transition-colors">
                  <input
                    type="checkbox"
                    checked={selectedForDeletion.size === notifications.length && notifications.length > 0}
                    onChange={handleSelectAll}
                    className="w-4 h-4 rounded border-white/30 bg-white/10 cursor-pointer accent-blue-500"
                    title="Select all notifications"
                  />
                  Select all
                </label>
              )}
              {selectedForDeletion.size > 0 && (
                <button
                  className="text-red-300 hover:text-red-200 border border-red-400/40 bg-red-500/15 hover:bg-red-500/25 rounded-lg px-3 py-2 transition-colors text-sm flex items-center gap-1"
                  onClick={handleDeleteSelected}
                  disabled={isDeleting}
                >
                  <Trash2 className="w-4 h-4" />
                  Delete ({selectedForDeletion.size})
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                className="text-gray-400 hover:text-white transition-colors"
                onClick={async () => {
                  try {
                    await fetch('/api/notifications/mark-read-all', {
                      method: 'PUT',
                      headers: { ...getAuditHeaders() },
                    });
                    setNotifications(prev => prev.map(n => ({ ...n, read_at: new Date().toISOString() })));
                    window.dispatchEvent(new Event('notificationsRead'));
                  } catch (err) {
                    console.error('Failed to mark all read', err);
                  }
                }}
              >
                Mark all as read
              </button>
            </div>
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
                  id={`student-notification-${note.id}`}
                  className={`bg-[#232528]/60 rounded-lg px-4 py-3 flex items-center gap-3 border-b border-white/10 group transition-all ${!note.read_at ? 'ring-1 ring-blue-500/40 bg-blue-500/10' : ''} ${selectedForDeletion.has(note.id) ? 'ring-2 ring-red-400/60 bg-red-500/10' : ''} ${String(highlightedNotificationId) === String(note.id) ? 'ring-2 ring-yellow-400 bg-yellow-500/20 animate-pulse' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={selectedForDeletion.has(note.id)}
                    onChange={() => handleCheckboxChange(note.id)}
                    className="w-4 h-4 rounded border-white/30 bg-white/10 cursor-pointer accent-blue-500 flex-shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div
                    className="flex-1 cursor-pointer hover:opacity-80 transition-opacity"
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
                      const metadataType = String(note.metadata?.type || '');

                      if (metadataType.startsWith('student_violation_')) {
                        if (note.metadata?.violationLogId) {
                          navigate(`/student/violations?highlight=${note.metadata.violationLogId}`);
                        } else {
                          navigate('/student/violations');
                        }
                      } else if (metadataType === 'admin_alert') {
                        setSelectedAlertNotificationId(note.id);
                        setShowAlertDetailsModal(true);
                      } else if (note.metadata?.violationId) {
                        const highlightParam = `?highlight=${note.metadata.violationId}`;
                        navigate(`/student/offenses${highlightParam}`);
                      } else {
                        navigate('/student/offenses');
                      }

                      // Emit event so sidebar/navbar refresh unread state
                      window.dispatchEvent(new Event('notificationRead'));
                    }}
                  >
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

      <Modal
        isOpen={showAlertDetailsModal}
        onClose={() => {
          setShowAlertDetailsModal(false);
          setSelectedAlertNotificationId(null);
        }}
        title={<span className="font-bold">Admin Alert Details</span>}
        size="md"
        showCloseButton
      >
        {selectedAlertNotification ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-orange-400/25 bg-orange-500/10 px-4 py-3">
              <p className="text-sm text-orange-200 font-semibold">{selectedAlertNotification.title}</p>
              <p className="text-xs text-orange-100 mt-1">
                Sent: {new Date(selectedAlertNotification.created_at).toLocaleString()}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 text-sm">
              <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-gray-400 text-xs mb-1">Alert Type</p>
                <p className="text-white font-medium">
                  {selectedAlertNotification.metadata?.alertType || 'Alert'}
                </p>
              </div>

              <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-gray-400 text-xs mb-1">Message from Admin</p>
                <p className="text-white font-medium whitespace-pre-wrap">
                  {selectedAlertNotification.description || selectedAlertNotification.metadata?.adminMessage || 'No message provided.'}
                </p>
              </div>

              <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-gray-400 text-xs mb-1">Related Violation Context</p>
                <p className="text-white font-medium">
                  Active violations: {Number(selectedAlertNotification.metadata?.activeViolationCount || 0)}
                </p>
              </div>
            </div>

            <ModalFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowAlertDetailsModal(false);
                  setSelectedAlertNotificationId(null);
                }}
                className="px-6 py-2.5"
              >
                Close
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={() => {
                  setShowAlertDetailsModal(false);
                  setSelectedAlertNotificationId(null);
                  navigate('/student/violations');
                }}
                className="px-6 py-2.5"
              >
                View Violations
              </Button>
            </ModalFooter>
          </div>
        ) : (
          <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
            <p className="text-sm text-gray-300">Unable to load alert details for this notification.</p>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={showDeleteConfirmModal}
        onClose={() => {
          setShowDeleteConfirmModal(false);
        }}
        title={<span className="font-bold">Delete Notification{selectedForDeletion.size > 1 ? 's' : ''}</span>}
        size="md"
        showCloseButton
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-red-400/25 bg-red-500/10 px-4 py-3">
            <p className="text-sm text-red-200 font-semibold">
              Are you sure you want to delete {selectedForDeletion.size} notification{selectedForDeletion.size > 1 ? 's' : ''}?
            </p>
            <p className="text-xs text-red-100 mt-2">This action cannot be undone.</p>
          </div>

          {selectedForDeletion.size === 1 && (
            <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
              <p className="text-gray-400 text-xs mb-2">Notification to delete:</p>
              <p className="text-white font-medium text-sm">
                {notifications.find(n => n.id === Array.from(selectedForDeletion)[0])?.title}
              </p>
            </div>
          )}

          <ModalFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowDeleteConfirmModal(false);
              }}
              disabled={isDeleting}
              className="px-6 py-2.5"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={confirmDelete}
              disabled={isDeleting}
              className="px-6 py-2.5 flex items-center gap-2"
            >
              {isDeleting ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  Delete
                </>
              )}
            </Button>
          </ModalFooter>
        </div>
      </Modal>
    </>
  );
};

export default StudentNotification;
