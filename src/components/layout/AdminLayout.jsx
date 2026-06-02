import React from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Database, FileText, Loader2 } from 'lucide-react';
import Sidebar from './AdminSidebar';
import Navbar from './Navbar';
import Modal, { ModalFooter } from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { getAuditHeaders } from '@/lib/auditHeaders';

const SUPER_ADMIN_TRUSTED_DEVICE_KEY = "svms_super_admin_trusted_device";

const formatNoticeDateTime = (value) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const getCurrentUser = () => {
  try {
    return JSON.parse(localStorage.getItem("svms_user") || "{}");
  } catch {
    return {};
  }
};

const isAdminRole = (role) =>
  ["admin", "super_admin", "both"].includes(String(role || "").trim().toLowerCase());

const AdminLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isLogoutModalOpen, setIsLogoutModalOpen] = React.useState(false);
  const [archiveNoticeModalOpen, setArchiveNoticeModalOpen] = React.useState(false);
  const [archiveNotices, setArchiveNotices] = React.useState([]);
  const [archiveNoticeError, setArchiveNoticeError] = React.useState("");
  const [archivePolicy, setArchivePolicy] = React.useState(null);
  const [dismissArchiveNotices, setDismissArchiveNotices] = React.useState(false);
  const [isSavingArchiveNoticeDismissal, setIsSavingArchiveNoticeDismissal] =
    React.useState(false);
  const [isArchiveNoticePreview, setIsArchiveNoticePreview] = React.useState(false);

  const openLogoutModal = () => setIsLogoutModalOpen(true);
  const closeLogoutModal = () => setIsLogoutModalOpen(false);

  const previewScenario = React.useMemo(() => {
    const params = new URLSearchParams(location.search);
    const value = String(params.get("previewArchiveNotice") || "")
      .trim()
      .toLowerCase();
    return ["week", "day", "all"].includes(value) ? value : "";
  }, [location.search]);

  const loadArchiveRetentionNotices = React.useCallback(async () => {
    const currentUser = getCurrentUser();
    if (!isAdminRole(currentUser?.role)) {
      return;
    }

    if (previewScenario) {
      return;
    }

    try {
      setArchiveNoticeError("");
      const response = await fetch("/api/archive/retention/admin-notices", {
        headers: {
          ...getAuditHeaders(),
        },
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok || data.status === "error") {
        throw new Error(
          data.message || "Failed to load archive retention notices.",
        );
      }

      const notices = Array.isArray(data.notices) ? data.notices : [];
      setArchivePolicy(data.policy || null);
      setArchiveNotices(notices);
      setArchiveNoticeModalOpen(notices.length > 0);
      setIsArchiveNoticePreview(false);
    } catch (error) {
      setArchiveNoticeError(
        error?.message || "Failed to load archive retention notices.",
      );
    }
  }, [previewScenario]);

  React.useEffect(() => {
    loadArchiveRetentionNotices();
  }, [loadArchiveRetentionNotices]);

  React.useEffect(() => {
    if (!previewScenario) {
      return;
    }

    const previewNotices = [
      {
        schoolYear: "2015-2016",
        scheduledDeletionAt: "2026-06-01T00:00:00.000Z",
        daysRemaining: 7,
        nextAction: "warn_week",
        actionLabel: "7-day admin warning pending",
        stage: "week",
        archivedStudentCount: 18,
        archiveViolationCount: 73,
      },
      {
        schoolYear: "2014-2015",
        scheduledDeletionAt: "2026-06-01T00:00:00.000Z",
        daysRemaining: 1,
        nextAction: "warn_day",
        actionLabel: "1-day admin warning pending",
        stage: "day",
        archivedStudentCount: 11,
        archiveViolationCount: 41,
      },
    ].filter((notice) => {
      if (previewScenario === "all") return true;
      return previewScenario === notice.stage;
    });

    setArchivePolicy({
      retentionYears: 10,
      warningWeekDays: 7,
      warningDayDays: 1,
    });
    setArchiveNoticeError("");
    setArchiveNotices(previewNotices);
    setDismissArchiveNotices(false);
    setIsArchiveNoticePreview(true);
    setArchiveNoticeModalOpen(previewNotices.length > 0);
  }, [previewScenario]);

  const confirmLogout = () => {
    const trustedDeviceToken = localStorage.getItem(
      SUPER_ADMIN_TRUSTED_DEVICE_KEY,
    );
    localStorage.clear();
    if (trustedDeviceToken) {
      localStorage.setItem(
        SUPER_ADMIN_TRUSTED_DEVICE_KEY,
        trustedDeviceToken,
      );
    }
    window.location.href = '/login';
  };

  const closeArchiveNoticeModal = async () => {
    if (isArchiveNoticePreview) {
      const params = new URLSearchParams(location.search);
      params.delete("previewArchiveNotice");
      navigate(
        {
          pathname: location.pathname,
          search: params.toString() ? `?${params.toString()}` : "",
        },
        { replace: true },
      );
      setArchiveNoticeModalOpen(false);
      setArchiveNotices([]);
      setDismissArchiveNotices(false);
      setIsArchiveNoticePreview(false);
      return;
    }

    if (!dismissArchiveNotices || archiveNotices.length === 0) {
      setArchiveNoticeModalOpen(false);
      return;
    }

    try {
      setIsSavingArchiveNoticeDismissal(true);
      setArchiveNoticeError("");

      const response = await fetch("/api/archive/retention/admin-notices/dismiss", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuditHeaders(),
        },
        body: JSON.stringify({
          schoolYears: archiveNotices.map((notice) => notice.schoolYear),
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok || data.status === "error") {
        throw new Error(
          data.message || "Failed to save archive retention notice preference.",
        );
      }

      setArchiveNoticeModalOpen(false);
      setArchiveNotices([]);
      setDismissArchiveNotices(false);
    } catch (error) {
      setArchiveNoticeError(
        error?.message || "Failed to save archive retention notice preference.",
      );
    } finally {
      setIsSavingArchiveNoticeDismissal(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-[#0d0d0d] font-inter">
      <Sidebar onRequestLogout={openLogoutModal} />
      <div className="flex-1 flex flex-col">
        <Navbar onRequestLogout={openLogoutModal} />
        <main className="flex-1 p-6 bg-gradient-to-br from-[#0B0D10]/50 to-[#0d0d0d]/80">
          <Outlet />
        </main>
      </div>

      <Modal
        isOpen={archiveNoticeModalOpen}
        onClose={() => {
          if (!isSavingArchiveNoticeDismissal) {
            void closeArchiveNoticeModal();
          }
        }}
        title="Archive Folder Deletion Notice"
        size="2xl"
        showCloseButton={!isSavingArchiveNoticeDismissal}
        className="overflow-hidden"
        bodyClassName="pt-1 sm:pt-1"
      >
        <div className="flex max-h-[calc(100vh-11rem)] flex-col">
          <div className="space-y-4 overflow-y-auto pr-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-gray-300">
                {isArchiveNoticePreview ? "Preview" : "Admin Only"}
              </span>
              <span className="text-sm text-gray-400">
                School year folder nearing {archivePolicy?.retentionYears || 10}-year retention
              </span>
            </div>

            {archiveNoticeError ? (
              <div className="rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-100">
                {archiveNoticeError}
              </div>
            ) : null}

            <div className="space-y-3">
              {archiveNotices.map((notice) => (
                <div
                  key={notice.schoolYear}
                  className="rounded-2xl border border-white/10 bg-[#15171c] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.25)]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-red-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-red-200">
                        {notice.stage === "day" ? "1-Day Warning" : "7-Day Warning"}
                      </span>
                      <span className="rounded-full bg-white/8 px-3 py-1 text-xs font-medium text-gray-300">
                        S.Y. {notice.schoolYear}
                      </span>
                    </div>
                    <div className="text-xs font-medium uppercase tracking-[0.16em] text-gray-400">
                      Archive Folder
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    <h3 className="text-lg font-semibold text-white">
                      <span className="text-red-300">S.Y. {notice.schoolYear}</span>{" "}
                      will be removed
                    </h3>
                    <p className="max-w-2xl text-sm leading-6 text-gray-300">
                      The folder for{" "}
                      <span className="font-semibold text-red-300">
                        S.Y. {notice.schoolYear}
                      </span>{" "}
                      auto-deletes on{" "}
                      <span className="font-semibold text-white">
                        {formatNoticeDateTime(notice.scheduledDeletionAt)}
                      </span>
                      .
                    </p>
                  </div>

                  <div className="mt-5 grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-gray-200">
                      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-gray-400">
                        <Database className="h-4 w-4" />
                        Database Cleanup
                      </div>
                      <div className="mt-3 text-base font-semibold text-white">
                        {notice.archivedStudentCount || 0} archived users
                      </div>
                      <div className="mt-1 text-xs text-gray-400">
                        {notice.archiveViolationCount || 0} archived rows removed
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-gray-200">
                      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-gray-400">
                        <FileText className="h-4 w-4" />
                        Recommended Action
                      </div>
                      <div className="mt-3 text-base font-semibold text-white">
                        Export PDF or Excel
                      </div>
                      <div className="mt-1 text-xs text-gray-400">
                        Save a copy before deletion
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 bg-[#202329]/70 pt-4 backdrop-blur">
            <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-gray-200">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-white/20 bg-transparent text-[#A3AED0] focus:ring-[#A3AED0]"
                checked={dismissArchiveNotices}
                onChange={(event) => setDismissArchiveNotices(event.target.checked)}
                disabled={isSavingArchiveNoticeDismissal || isArchiveNoticePreview}
              />
              <span className="leading-6 text-gray-300">
                {isArchiveNoticePreview
                  ? "Preview mode only. This preference is disabled."
                  : `Don't show ${archiveNotices.length === 1 ? "this" : "these"} notice${archiveNotices.length === 1 ? "" : "s"} again on future admin logins.`}
              </span>
            </label>
          </div>
        </div>

        <ModalFooter className="sticky bottom-0 -mx-4 -mb-4 mt-4 border-t border-white/10 bg-[#23262d]/95 px-4 py-4 backdrop-blur sm:-mx-6 sm:-mb-6 sm:px-6">
          <Button
            type="button"
            variant="primary"
            onClick={() => void closeArchiveNoticeModal()}
            disabled={isSavingArchiveNoticeDismissal}
          >
            {isSavingArchiveNoticeDismissal ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Saving
              </>
            ) : (
              "I Understand"
            )}
          </Button>
        </ModalFooter>
      </Modal>

      <Modal
        isOpen={isLogoutModalOpen}
        onClose={closeLogoutModal}
        title="Confirm Logout"
        size="sm"
        showCloseButton
      >
        <p className="text-sm text-gray-200">Are you sure you want to log out?</p>
        <ModalFooter>
          <Button type="button" variant="secondary" onClick={closeLogoutModal}>
            Cancel
          </Button>
          <Button type="button" variant="danger" onClick={confirmLogout}>
            Logout
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
};

export default AdminLayout;
