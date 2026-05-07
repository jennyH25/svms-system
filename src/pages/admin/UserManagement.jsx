import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus,
  Archive,
  Download,
  ChevronDown,
  Edit,
  Trash2,
  Eye,
  CheckCircle,
  Minus,
  AlertCircle,
} from "lucide-react";
import Button from "../../components/ui/Button";
import SearchBar from "../../components/ui/SearchBar";
import DataTable from "../../components/ui/DataTable";
import TableTabs from "../../components/ui/TableTabs";
import AnimatedContent from "../../components/ui/AnimatedContent";
import SelectField from "../../components/ui/SelectField";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "../../components/ui/dropdown-menu";
import Modal, { ModalFooter } from "../../components/ui/Modal";
import AlertModal from "../../components/ui/AlertModal";
import EditUserModal from "@/components/modals/EditUserModal";
import AddUserModal from "@/components/modals/AddUserModal";
import EditSemesterYearModal from "@/components/modals/EditSemesterYearModal";
import { getAuditHeaders } from "@/lib/auditHeaders";
import { cachedFetchJSON, fetchMultiple, invalidateFetchCache } from "@/lib/fetchHelper";
import {
  addCenteredExcelHeaderImage,
  applyExcelPrintLayout,
  getExcelColumnLetter,
} from "@/lib/excelExportLayout";

const EXPORT_HEADER_IMAGE_PATH = "/plpasig_header.png";
const ALERT_TYPE_OPTIONS = [
  "Warning",
  "Reminder",
  "Violation",
  "Notice",
  "At-Risk Alert",
  "Custom",
];

const ARCHIVE_REASON_OPTIONS = [
  "LOA (Leave of Absence)",
  "Transferred",
  "Dropped",
  "Dismissed",
  "Expelled",
  "Non-enrollment / Did Not Return",
  "Deceased",
  "Custom",
];

const blobToDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

const getDataUrlDimensions = (dataUrl) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
    };
    img.onerror = () => reject(new Error("Unable to load image dimensions."));
    img.src = dataUrl;
  });

const getDisplaySemester = (semester, schoolYear) => {
  const normalizedSemester = String(semester || "").trim().toUpperCase();
  const normalizedSchoolYear = String(schoolYear || "").trim();
  if (normalizedSemester === "1ST SEM" && normalizedSchoolYear === "2025-2026") {
    return "2ND SEM";
  }
  return normalizedSemester || semester || "";
};

const formatStudentDisplayName = ({ firstName, middleInitial, lastName, fullName }) => {
  const first = String(firstName || "").trim();
  const last = String(lastName || "").trim();
  const middleRaw = String(middleInitial || "").trim().replace(/\./g, "");
  const middle = middleRaw ? `${middleRaw.charAt(0).toUpperCase()}.` : "";

  const formatted = [first, middle, last].filter(Boolean).join(" ").trim();
  return formatted || String(fullName || "").trim();
};

const pluralize = (word, count) => `${word}${count === 1 ? "" : "s"}`;
const formatStudentLabel = (count) => `${count} ${pluralize("student", count)}`;

const UserManagement = () => {
  const [activeTab, setActiveTab] = useState("regular");
  const [selectedProgram, setSelectedProgram] = useState("");
  const [selectedYear, setSelectedYear] = useState("");
  const [selectedSection, setSelectedSection] = useState("");
  const [selectedViolationFilter, setSelectedViolationFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState("A-Z");

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [isSavingEditUser, setIsSavingEditUser] = useState(false);
  const [showEditSuccessModal, setShowEditSuccessModal] = useState(false);
  const [showCreateSuccessModal, setShowCreateSuccessModal] = useState(false);
  const [showDuplicateSchoolIdModal, setShowDuplicateSchoolIdModal] = useState(false);
  const [showDuplicateEmailModal, setShowDuplicateEmailModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showExportAlertModal, setShowExportAlertModal] = useState(false);
  const [exportFormat, setExportFormat] = useState("excel");
  const [exportAlertMessage, setExportAlertMessage] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  const [studentData, setStudentData] = useState([]);
  const [showArchiveSchoolYearModal, setShowArchiveSchoolYearModal] = useState(false);
  const [newSchoolYear, setNewSchoolYear] = useState("S.Y. 2026-2027");
  const [isArchivingSchoolYear, setIsArchivingSchoolYear] = useState(false);
  const [currentSchoolYear, setCurrentSchoolYear] = useState("2025-2026");
  const [currentSemester, setCurrentSemester] = useState("1ST SEM");
  const [showEditSemesterModal, setShowEditSemesterModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // Archive users state
  const [selectedUserIds, setSelectedUserIds] = useState(new Set());
  const [showSelectionCheckboxes, setShowSelectionCheckboxes] = useState(false);
  const [showArchiveUsersModal, setShowArchiveUsersModal] = useState(false);
  const [showArchiveConfirmationModal, setShowArchiveConfirmationModal] = useState(false);
  const [isArchivingUsers, setIsArchivingUsers] = useState(false);
  const [archiveReasonType, setArchiveReasonType] = useState("");
  const [customArchiveReason, setCustomArchiveReason] = useState("");
  const [archiveDeactivateAccount, setArchiveDeactivateAccount] = useState(false);
  const [archiveAlertModal, setArchiveAlertModal] = useState({
    isOpen: false,
    type: "info",
    title: "",
    message: "",
  });
  const [showDeleteSelectedModal, setShowDeleteSelectedModal] = useState(false);
  const [isDeletingSelected, setIsDeletingSelected] = useState(false);
  const [showSendAlertModal, setShowSendAlertModal] = useState(false);
  const [isSendingAlert, setIsSendingAlert] = useState(false);
  const [alertType, setAlertType] = useState("");
  const [customAlertType, setCustomAlertType] = useState("");
  const [alertMessage, setAlertMessage] = useState("");
  const [alertValidationMessage, setAlertValidationMessage] = useState("");
  const [alertResultModal, setAlertResultModal] = useState({
    isOpen: false,
    type: "success",
    title: "",
    message: "",
  });

  const showArchiveAlert = useCallback((type, title, message) => {
    setArchiveAlertModal({
      isOpen: true,
      type,
      title,
      message,
    });
  }, []);

  const fetchStudents = useCallback(async (forceRefresh = false) => {
    setIsLoading(true);

    const degreeRank = {
      "First Degree": 1,
      "Second Degree": 2,
      "Third Degree": 3,
      "Fourth Degree": 4,
      "Fifth Degree": 5,
      "Sixth Degree": 6,
      "Seventh Degree": 7,
    };

    try {
      const results = await fetchMultiple([
        {
          url: "/api/students",
          key: "students",
          cacheOptions: { forceRefresh },
        },
        { url: "/api/student-violations", key: "violations" },
      ]);

      const studentsResult = results.students.data || {};
      const violationsResult = results.violations.data || {};

      // Check for fetch errors
      if (results.students.status !== 'ok') {
        throw new Error(results.students.error || "Failed to load students.");
      }

      if (results.violations.status !== 'ok') {
        throw new Error(results.violations.error || "Failed to load violations.");
      }

      const violations = Array.isArray(violationsResult.records) ? violationsResult.records : [];
      const studentDegreeMap = violations.reduce((acc, record) => {
        if (record.student_id == null) return acc;
        if (record.cleared_at) return acc; // only active violations adjust risk color

        const rank = degreeRank[String(record.violation_degree)] || 0;
        acc[record.student_id] = Math.max(acc[record.student_id] || 0, rank);
        return acc;
      }, {});

      const rows = Array.isArray(studentsResult.students) ? studentsResult.students : [];
      setStudentData(
        rows.map((student) => {
          const maxDegreeRank = studentDegreeMap[student.id] || 0;
          const degreeName = Object.keys(degreeRank).find((key) => degreeRank[key] === maxDegreeRank) || "";
          return {
            id: Number(student.id),
            userId: student.user_id ? Number(student.user_id) : null,
            username: student.username || "",
            email: student.email || "",
            schoolId: student.school_id,
            studentName: formatStudentDisplayName({
              firstName: student.first_name,
              middleInitial: student.middle_initial,
              lastName: student.last_name,
              fullName: student.full_name,
            }),
            firstName: student.first_name,
            middleInitial: student.middle_initial || "",
            lastName: student.last_name,
            program: student.program,
            yearSection: student.year_section,
            status: student.status,
            violationCount: Number(student.violation_count) || 0,
            isArchived: Boolean(student.is_archived),
            archivedAt: student.archived_at,
            maxViolationDegreeRank: maxDegreeRank,
            maxViolationDegree: degreeName,
          };
        }),
      );
    } catch (error) {
      console.error("Error fetching students:", error);
      alert(error.message || "Unable to fetch students.");
      setStudentData([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  useEffect(() => {
    const handleStudentViolationUpdate = async () => {
      invalidateFetchCache("/api/students");
      await fetchStudents(true);
    };

    window.addEventListener("studentViolationUpdated", handleStudentViolationUpdate);
    return () => {
      window.removeEventListener("studentViolationUpdated", handleStudentViolationUpdate);
    };
  }, [fetchStudents]);

  const loadCurrentSettings = useCallback(async (forceRefresh = false) => {
    try {
      const result = await cachedFetchJSON("/api/archive/current-settings", {}, {
        ttlMs: 30000,
        staleWhileRevalidate: !forceRefresh,
        forceRefresh,
      });
      const data = result.data || {};
      if (result.status === "ok" && data.status === "ok") {
        setCurrentSemester(getDisplaySemester(data.currentSemester || "1ST SEM", data.currentSchoolYear || "2025-2026"));
        setCurrentSchoolYear(data.currentSchoolYear || "2025-2026");
      }
    } catch (error) {
      console.warn("Failed to load current semester settings:", error);
    }
  }, []);

  // Load current semester and school year
  useEffect(() => {
    loadCurrentSettings();

    const handleSettingsUpdated = () => {
      loadCurrentSettings(true);
    };

    window.addEventListener("semesterYearUpdated", handleSettingsUpdated);
    window.addEventListener("focus", handleSettingsUpdated);
    return () => {
      window.removeEventListener("semesterYearUpdated", handleSettingsUpdated);
      window.removeEventListener("focus", handleSettingsUpdated);
    };
  }, [loadCurrentSettings]);

  // Reset archive reason when archive modal opens
  useEffect(() => {
    if (showArchiveUsersModal) {
      setArchiveReasonType("");
      setCustomArchiveReason("");
    }
  }, [showArchiveUsersModal]);

  // Maps a raw student object from the API to the shape used in state.
  // Preserves violation-derived fields from the existing row when available.
  const mapStudentRow = (student, existing = null) => ({
    id: Number(student.id),
    userId: student.user_id ? Number(student.user_id) : null,
    username: student.username || "",
    email: student.email || "",
    schoolId: student.school_id,
    studentName: formatStudentDisplayName({
      firstName: student.first_name,
      middleInitial: student.middle_initial,
      lastName: student.last_name,
      fullName: student.full_name,
    }),
    firstName: student.first_name,
    middleInitial: student.middle_initial || "",
    lastName: student.last_name,
    program: student.program,
    yearSection: student.year_section,
    status: student.status,
    violationCount: Number(student.violation_count) || 0,
    isArchived: Boolean(student.is_archived),
    archivedAt: student.archived_at,
    maxViolationDegreeRank: existing?.maxViolationDegreeRank ?? 0,
    maxViolationDegree: existing?.maxViolationDegree ?? "",
  });

  const handleSaveEdit = async (id, updatedData) => {
    const normalizedSchoolId = String(updatedData.schoolId || "")
      .trim()
      .toLowerCase();
    const normalizedEmail = String(updatedData.email || "")
      .trim()
      .toLowerCase();
    const duplicateSchoolId = studentData.some(
      (student) =>
        Number(student.id) !== Number(id) &&
        String(student.schoolId || "")
          .trim()
          .toLowerCase() === normalizedSchoolId,
    );

    const duplicateEmail = studentData.some(
      (student) =>
        Number(student.id) !== Number(id) &&
        String(student.email || "")
          .trim()
          .toLowerCase() === normalizedEmail,
    );

    if (duplicateSchoolId) {
      setShowDuplicateSchoolIdModal(true);
      return false;
    }
    if (duplicateEmail) {
      setShowDuplicateEmailModal(true);
      return false;
    }

    setIsSavingEditUser(true);
    try {
      const response = await fetch(`/api/students/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...getAuditHeaders(),
        },
        body: JSON.stringify({
          username: String(updatedData.username || "").trim(),
          schoolId: String(updatedData.schoolId || "").trim(),
          email: String(updatedData.email || "").trim(),
          firstName: String(updatedData.firstName || "").trim(),
          middleInitial: String(updatedData.middleInitial || "").trim(),
          lastName: String(updatedData.lastName || "").trim(),
          program: String(updatedData.program || "").trim(),
          yearSection: String(updatedData.yearSection || "").trim(),
          status: String(updatedData.status || "").trim(),
          violationCount: Number(updatedData.violationCount),
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.message || "Failed to update student.");
      }

      if (result.student) {
        setStudentData((prev) =>
          prev.map((s) =>
            s.id === Number(result.student.id)
              ? mapStudentRow(result.student, s)
              : s,
          ),
        );
      }
      setShowEditSuccessModal(true);
      return true;
    } catch (error) {
      const message = String(error?.message || "");
      if (
        message.includes("School ID already exists") ||
        message.toLowerCase().includes("school_id")
      ) {
        setShowDuplicateSchoolIdModal(true);
      } else if (
        message.toLowerCase().includes("email already exists") ||
        message.toLowerCase().includes("email") && message.toLowerCase().includes("exists")
      ) {
        setShowDuplicateEmailModal(true);
      } else {
        alert(error.message || "Unable to update student.");
      }
      return false;
    } finally {
      setIsSavingEditUser(false);
    }
  };

  const handleSaveNewUser = async (userData) => {
    const normalizedSchoolId = String(userData.schoolId || "")
      .trim()
      .toLowerCase();
    const normalizedEmail = String(userData.email || "")
      .trim()
      .toLowerCase();
    const duplicateSchoolId = studentData.some(
      (student) =>
        String(student.schoolId || "")
          .trim()
          .toLowerCase() === normalizedSchoolId,
    );

    const duplicateEmail = studentData.some(
      (student) =>
        String(student.email || "")
          .trim()
          .toLowerCase() === normalizedEmail,
    );

    if (duplicateSchoolId) {
      setShowDuplicateSchoolIdModal(true);
      return false;
    }
    if (duplicateEmail) {
      setShowDuplicateEmailModal(true);
      return false;
    }

    setIsAddingUser(true);
    try {
      const response = await fetch("/api/students", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuditHeaders(),
        },
        body: JSON.stringify({
          schoolId: String(userData.schoolId || "").trim(),
          email: String(userData.email || "").trim(),
          firstName: String(userData.firstName || "").trim(),
          lastName: String(userData.lastName || "").trim(),
          program: String(userData.program || "").trim(),
          yearSection: String(userData.yearSection || "").trim(),
          status: String(userData.status || "").trim(),
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.message || "Failed to add student.");
      }

      if (result.student) {
        setStudentData((prev) => [mapStudentRow(result.student), ...prev]);
      }
      setShowCreateSuccessModal(true);
      // Notify student notification listeners to refresh immediately
      window.dispatchEvent(new Event('notificationsUpdated'));
      return true;
    } catch (error) {
      if (String(error?.message || "").includes("School ID already exists")) {
        setShowDuplicateSchoolIdModal(true);
      } else if (String(error?.message || "").toLowerCase().includes("email already exists")) {
        setShowDuplicateEmailModal(true);
      } else {
        alert(error.message || "Unable to add student.");
      }
      return false;
    } finally {
      setIsAddingUser(false);
    }
  };

  const handleSaveSemesterYear = async (semester, schoolYear) => {
    try {
      const response = await fetch("/api/archive/current-settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...getAuditHeaders(),
        },
        body: JSON.stringify({
          currentSemester: semester,
          currentSchoolYear: schoolYear,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.message || "Failed to update semester and school year");
      }

      invalidateFetchCache("/api/archive/current-settings");
      setCurrentSemester(getDisplaySemester(data.currentSemester || semester, data.currentSchoolYear || schoolYear));
      setCurrentSchoolYear(data.currentSchoolYear || schoolYear);
      window.localStorage.setItem("semesterYearUpdated", Date.now().toString());
      window.dispatchEvent(
        new CustomEvent("semesterYearUpdated", {
          detail: {
            currentSemester: data.currentSemester || semester,
            currentSchoolYear: data.currentSchoolYear || schoolYear,
          },
        }),
      );
    } catch (error) {
      alert(error.message || "Unable to save changes");
      throw error;
    }
  };

  const handleDeleteStudent = async () => {
    if (!deleteCandidate) {
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/students/${deleteCandidate.id}`, {
        method: "DELETE",
        headers: {
          ...getAuditHeaders(),
        },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.message || "Failed to delete student.");
      }

      setStudentData((prev) => prev.filter((s) => s.id !== deleteCandidate.id));
      setDeleteCandidate(null);
    } catch (error) {
      alert(error.message || "Unable to delete student.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteSelectedStudents = async () => {
    if (selectedUserIds.size === 0) {
      return;
    }

    setIsDeletingSelected(true);
    try {
      let deletedCount = 0;
      const failedDeletes = [];

      for (const userId of selectedUserIds) {
        const response = await fetch(`/api/students/${userId}`, {
          method: "DELETE",
          headers: {
            ...getAuditHeaders(),
          },
        });

        if (response.ok) {
          deletedCount += 1;
        } else {
          failedDeletes.push(userId);
        }
      }

      await fetchStudents();
      setSelectedUserIds(new Set());
      setShowDeleteSelectedModal(false);

      if (failedDeletes.length > 0) {
        alert(
          `Deleted ${formatStudentLabel(deletedCount)}. ${formatStudentLabel(failedDeletes.length)} could not be deleted. Please try again.`,
        );
      }
    } catch (error) {
      alert(error.message || "Unable to delete selected students.");
    } finally {
      setIsDeletingSelected(false);
    }
  };

  // Archive handlers
  const handleArchiveSchoolYear = async () => {
    if (!newSchoolYear.trim()) {
      showArchiveAlert(
        "warning",
        "Missing School Year",
        "Please enter the new school year.",
      );
      return;
    }

    setIsArchivingSchoolYear(true);
    try {
      // Archive all students from current school year
      // Increment year level by +1 for all except 4th year students
      const studentsToUpdate = studentData.filter((s) => !s.isArchived);

      let promotedCount = 0;
      let archivedCount = 0;
      let blockedCount = 0;

      for (const student of studentsToUpdate) {
        // Parse year from year_section (e.g., "1 A" -> 1)
        const yearMatch = String(student.yearSection || "").match(/^(\d+)/);
        const currentYear = yearMatch ? parseInt(yearMatch[1]) : 0;

        const hasPendingViolation = Number(student.violationCount || 0) > 0;

        if (hasPendingViolation) {
          blockedCount += 1;
          continue; // no promotion or graduation for this student
        }

        if (currentYear === 4) {
          // Archive 4th year students
          await fetch(`/api/students/${student.id}`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              ...getAuditHeaders(),
            },
            body: JSON.stringify({
              isArchived: true,
              archivedAt: new Date().toISOString(),
              status: "Graduated",
              yearLevel: 4,
            }),
          });
          archivedCount += 1;
        } else if (currentYear === 3) {
          // 3rd year student should not be promoted after 2nd sem; they proceed to Summer only
          // Preserve year level and year section, no +1 promotion here
          await fetch(`/api/students/${student.id}`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              ...getAuditHeaders(),
            },
            body: JSON.stringify({
              yearLevel: 3,
              yearSection: student.yearSection,
            }),
          });
          // no promotedCount increment; they can be promoted after Summer.
        } else if (currentYear === 1 || currentYear === 2) {
          // Increment year level for freshman/sophomore
          const newYear = currentYear + 1;
          const newYearSection = student.yearSection.replace(/^\d+/, String(newYear));

          await fetch(`/api/students/${student.id}`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              ...getAuditHeaders(),
            },
            body: JSON.stringify({
              yearSection: newYearSection,
              yearLevel: newYear,
            }),
          });
          promotedCount += 1;
        }
      }

      // Update school year
      setCurrentSchoolYear(newSchoolYear);
      setNewSchoolYear("");
      setShowArchiveSchoolYearModal(false);

      invalidateFetchCache("/api/students");
      // Refresh data with forced cache refresh so the UI sees updated archive state immediately.
      await fetchStudents(true);
      showArchiveAlert(
        "success",
        "School Year Archived",
        `${archivedCount} 4th-year students archived. ${promotedCount} students promoted.${blockedCount ? ` ${formatStudentLabel(blockedCount)} were not promoted/graduated due to pending or uncleared violations.` : ""}`,
      );
    } catch (error) {
      showArchiveAlert(
        "error",
        "Archive Failed",
        error.message || "Unable to archive school year.",
      );
    } finally {
      setIsArchivingSchoolYear(false);
    }
  };

  // Checkbox handlers
  const handleToggleCheckbox = (studentId) => {
    setShowSelectionCheckboxes(true);
    setSelectedUserIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(studentId)) {
        newSet.delete(studentId);
      } else {
        newSet.add(studentId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedUserIds.size === filteredStudents.length) {
      setSelectedUserIds(new Set());
      setShowSelectionCheckboxes(false);
    } else {
      setSelectedUserIds(new Set(filteredStudents.map((s) => s.id)));
      setShowSelectionCheckboxes(true);
    }
  };

  const handleHeaderToggle = () => {
    setShowSelectionCheckboxes(true);
    setSelectedUserIds(new Set(filteredStudents.map((s) => s.id)));
  };

  const handleArchiveUsers = () => {
    // Validate archive reason
    if (!archiveReasonType) {
      showArchiveAlert(
        "error",
        "Archive Reason Required",
        "Please select an archive reason before proceeding.",
      );
      return;
    }

    if (archiveReasonType === "Custom" && !customArchiveReason.trim()) {
      showArchiveAlert(
        "error",
        "Custom Reason Required",
        "Please enter a custom archive reason.",
      );
      return;
    }

    // Show confirmation modal
    setShowArchiveUsersModal(false);
    setShowArchiveConfirmationModal(true);
  };

  const handleConfirmArchive = async () => {
    if (selectedUserIds.size === 0) {
      showArchiveAlert(
        "warning",
        "No Users Selected",
        "Please select at least one user to archive.",
      );
      return;
    }

    setIsArchivingUsers(true);
    try {
      let archivedCount = 0;
      let unresolvedCount = 0;

      const finalArchiveReason = archiveReasonType === "Custom" ? customArchiveReason.trim() : archiveReasonType;

      for (const userId of selectedUserIds) {
        const userRow = studentData.find((s) => s.id === userId);
        if (!userRow) {
          continue;
        }

        const hasPendingViolation = Number(userRow.violationCount || 0) > 0;
        const isUnresolvedArchive = hasPendingViolation;

        const yearMatch = String(userRow.yearSection || "").match(/^(\d+)/);
        const currentYear = yearMatch ? Number(yearMatch[1]) : null;

        await fetch(`/api/students/${userId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...getAuditHeaders(),
          },
          body: JSON.stringify({
            isArchived: true,
            archivedAt: new Date().toISOString(),
            yearLevel: currentYear ? Number(currentYear) : userRow.yearLevel,
            archivedReason: finalArchiveReason,
            isUnresolvedArchive,
            deactivateAccount: archiveDeactivateAccount,
          }),
        });

        archivedCount += 1;
        if (isUnresolvedArchive) {
          unresolvedCount += 1;
        }
      }

      // Clear selection and immediately remove archived users from state
      setSelectedUserIds(new Set());
      setShowArchiveConfirmationModal(false);
      setArchiveReasonType("");
      setCustomArchiveReason("");
      setArchiveDeactivateAccount(false);

      // Remove archived users from display immediately
      setStudentData((prevData) =>
        prevData.filter((student) => !selectedUserIds.has(student.id)),
      );

      invalidateFetchCache("/api/students");
      // Then refresh data from server with a forced cache refresh to avoid stale student rows.
      await fetchStudents(true);

      showArchiveAlert(
        "success",
        "Users Archived",
        archiveDeactivateAccount
          ? `Successfully archived and deactivated ${formatStudentLabel(archivedCount)}.${unresolvedCount ? ` ${formatStudentLabel(unresolvedCount)} were placed in the Unresolved folder due to pending violations.` : ""}`
          : `Successfully archived ${formatStudentLabel(archivedCount)}.${unresolvedCount ? ` ${formatStudentLabel(unresolvedCount)} were placed in the Unresolved folder due to pending violations.` : ""}`,
      );
    } catch (error) {
      showArchiveAlert(
        "error",
        "Archive Failed",
        error.message || "Unable to archive selected users.",
      );
    } finally {
      setIsArchivingUsers(false);
    }
  };

  useEffect(() => {
    if (selectedUserIds.size === 0 && showSelectionCheckboxes) {
      setShowSelectionCheckboxes(false);
    }
  }, [selectedUserIds, showSelectionCheckboxes]);

  const selectedStudentsForAlert = useMemo(
    () => studentData.filter((student) => selectedUserIds.has(student.id)),
    [studentData, selectedUserIds],
  );

  const studentsWithViolations = useMemo(
    () => selectedStudentsForAlert.filter((student) => Number(student.violationCount || 0) > 0),
    [selectedStudentsForAlert],
  );

  const resetAlertForm = () => {
    setAlertType("");
    setCustomAlertType("");
    setAlertMessage("");
    setAlertValidationMessage("");
  };

  const handleOpenAlertModal = () => {
    if (selectedUserIds.size === 0) {
      showArchiveAlert(
        "warning",
        "No Students Selected",
        "Please select at least one student first.",
      );
      return;
    }

    setAlertValidationMessage("");
    setShowSendAlertModal(true);
  };

  const handleSendAlert = async () => {
    if (selectedStudentsForAlert.length === 0) {
      setAlertValidationMessage("Please select at least one student first.");
      return;
    }

    if (!String(alertType || "").trim()) {
      setAlertValidationMessage("Please select an alert type.");
      return;
    }

    if (
      String(alertType || "").trim() === "Custom" &&
      !String(customAlertType || "").trim()
    ) {
      setAlertValidationMessage("Please enter a custom alert type.");
      return;
    }

    if (!String(alertMessage || "").trim()) {
      setAlertValidationMessage("Please enter an alert message.");
      return;
    }

    const resolvedAlertType =
      String(alertType || "").trim() === "Custom"
        ? String(customAlertType || "").trim()
        : String(alertType || "").trim();

    setIsSendingAlert(true);
    setAlertValidationMessage("");

    try {
      const response = await fetch("/api/students/alerts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuditHeaders(),
        },
        body: JSON.stringify({
          studentIds: selectedStudentsForAlert.map((student) => student.id),
          alertType: resolvedAlertType,
          message: String(alertMessage || "").trim(),
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.message || "Unable to send alert.");
      }

      const sentCount = Number(data?.sentCount || 0);
      const skippedCount = Array.isArray(data?.skippedStudents)
        ? data.skippedStudents.length
        : 0;
      const emailSentCount = Number(data?.emailSentCount || 0);
      const emailFailedCount = Number(data?.emailFailedCount || 0);

      const deliverySummary =
        emailFailedCount > 0
          ? `Email delivered to ${formatStudentLabel(emailSentCount)}; ${emailFailedCount} email delivery issue${emailFailedCount === 1 ? '' : 's'}.`
          : `Email delivered to ${formatStudentLabel(emailSentCount)}.`;

      setShowSendAlertModal(false);
      resetAlertForm();
      setAlertResultModal({
        isOpen: true,
        type: "success",
        title: "Alert Sent",
        message:
          skippedCount > 0
            ? `Alert sent to ${formatStudentLabel(sentCount)}. ${formatStudentLabel(skippedCount)} were skipped. ${deliverySummary}`
            : `Alert successfully sent to selected ${pluralize("student", selectedStudentsForAlert.length)}. ${deliverySummary}`,
      });
      // Tell student notification listeners to refresh immediately
      window.dispatchEvent(new Event('notificationsUpdated'));
    } catch (error) {
      setAlertResultModal({
        isOpen: true,
        type: "error",
        title: "Send Failed",
        message: error?.message || "Unable to send alert.",
      });
    } finally {
      setIsSendingAlert(false);
    }
  };

  // Filters
  const filteredStudents = useMemo(() => {
    const toText = (value) => String(value || "").toLowerCase();
    const parseYearSection = (value) => {
      const text = String(value || "").trim();
      const match = text.match(/(\d+)\s*([a-zA-Z]+)/);
      if (!match) {
        return { year: "", section: "" };
      }

      return { year: match[1], section: match[2].toLowerCase() };
    };

    return studentData.filter((student) => {
      const parsedYearSection = parseYearSection(student.yearSection);

      // Filter out archived students
      if (student.isArchived) return false;

      // Tab filter
      if (activeTab === "regular" && student.status !== "Regular") return false;
      if (activeTab === "irregular" && student.status !== "Irregular")
        return false;

      // Program filter
      if (
        selectedProgram &&
        toText(student.program) !== selectedProgram.toLowerCase()
      )
        return false;

      // Year filter
      if (selectedYear) {
        const studentYear = parsedYearSection.year;
        if (studentYear !== selectedYear) return false;
      }

      // Section filter
      if (selectedSection) {
        const studentSection = parsedYearSection.section;
        if (studentSection !== selectedSection.toLowerCase()) return false;
      }

      // Violation count filter
      if (selectedViolationFilter === "with") {
        if (Number(student.violationCount || 0) <= 0) return false;
      }

      if (selectedViolationFilter === "none") {
        if (Number(student.violationCount || 0) > 0) return false;
      }

      // Search query
      if (searchQuery) {
        const query = searchQuery.toLowerCase().trim();
        return (
          toText(student.studentName).includes(query) ||
          toText(student.firstName).includes(query) ||
          toText(student.lastName).includes(query) ||
          toText(student.schoolId).includes(query) ||
          toText(student.program).includes(query) ||
          toText(student.yearSection).includes(query) ||
          toText(student.email).includes(query) ||
          toText(student.status).includes(query)
        );
      }

      return true;
    }).sort((a, b) => {
      const lastNameA = toText(a.lastName);
      const lastNameB = toText(b.lastName);
      const fullNameA = toText(a.studentName);
      const fullNameB = toText(b.studentName);

      if (lastNameA === lastNameB) {
        if (fullNameA === fullNameB) {
          return Number(a.id) - Number(b.id);
        }
        return sortOrder === "A-Z"
          ? fullNameA.localeCompare(fullNameB)
          : fullNameB.localeCompare(fullNameA);
      }

      if (sortOrder === "A-Z") {
        return lastNameA.localeCompare(lastNameB);
      }

      return lastNameB.localeCompare(lastNameA);
    });
  }, [
    studentData,
    activeTab,
    selectedProgram,
    selectedYear,
    selectedSection,
    selectedViolationFilter,
    searchQuery,
    sortOrder,
  ]);

  const statistics = useMemo(() => {
    const total = filteredStudents.length;
    const withViolations = filteredStudents.filter(
      (s) => s.violationCount > 0,
    ).length;
    
    // Count students by highest severity category
    const warning = filteredStudents.filter((s) => {
      if (s.violationCount >= 5 || (s.maxViolationDegreeRank >= 5 && s.maxViolationDegreeRank <= 7)) {
        return false; // high-risk
      }
      if ((s.violationCount >= 3 && s.violationCount <= 4) || (s.maxViolationDegreeRank >= 3 && s.maxViolationDegreeRank <= 4)) {
        return false; // at-risk
      }
      return s.violationCount === 2 || s.maxViolationDegreeRank === 2;
    }).length;

    const atRisk = filteredStudents.filter((s) => {
      if (s.violationCount >= 5 || (s.maxViolationDegreeRank >= 5 && s.maxViolationDegreeRank <= 7)) {
        return false; // high-risk
      }
      return (s.violationCount >= 3 && s.violationCount <= 4) || (s.maxViolationDegreeRank >= 3 && s.maxViolationDegreeRank <= 4);
    }).length;

    const highRisk = filteredStudents.filter((s) => {
      return s.violationCount >= 5 || (s.maxViolationDegreeRank >= 5 && s.maxViolationDegreeRank <= 7);
    }).length;

    return { total, withViolations, warning, atRisk, highRisk };
  }, [filteredStudents]);

  const exportRows = useMemo(
    () =>
      filteredStudents.map((student, index) => ({
        no: index + 1,
        schoolId: String(student.schoolId || ""),
        studentName: String(student.studentName || ""),
        program: String(student.program || ""),
        yearSection: String(student.yearSection || ""),
        status: String(student.status || ""),
        violationCount: Number(student.violationCount) || 0,
      })),
    [filteredStudents],
  );

  const formatDateForFileName = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  const downloadBlob = useCallback((blob, filename) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, []);

  const resolveHeaderImage = useCallback(async () => {
    const response = await fetch(EXPORT_HEADER_IMAGE_PATH);
    if (!response.ok) {
      throw new Error(`Required header image not found: ${EXPORT_HEADER_IMAGE_PATH}`);
    }

    const blob = await response.blob();
    const dataUrl = await blobToDataUrl(blob);
    const dimensions = await getDataUrlDimensions(dataUrl);

    return { dataUrl, dimensions };
  }, []);

  const exportAsExcel = useCallback(async () => {
    const [{ Workbook }, { dataUrl, dimensions }] = await Promise.all([
      import("exceljs"),
      resolveHeaderImage(),
    ]);

    const workbook = new Workbook();
    const sheet = workbook.addWorksheet("User Management", {
      views: [{ state: "frozen", ySplit: 11 }],
    });
    applyExcelPrintLayout(sheet, { orientation: "landscape" });

    sheet.columns = [
      { key: "no", width: 6 },
      { key: "schoolId", width: 18 },
      { key: "studentName", width: 30 },
      { key: "program", width: 14 },
      { key: "yearSection", width: 16 },
      { key: "status", width: 14 },
      { key: "violationCount", width: 16 },
    ];

    const headerCellEnd = getExcelColumnLetter(sheet.columns.length);
    sheet.mergeCells(`A1:${headerCellEnd}8`);
    sheet.mergeCells(`A9:${headerCellEnd}9`);
    sheet.mergeCells(`A10:${headerCellEnd}10`);
    for (let rowIndex = 1; rowIndex <= 8; rowIndex += 1) {
      sheet.getRow(rowIndex).height = rowIndex <= 7 ? 26 : 18;
    }
    sheet.getRow(9).height = 28;
    sheet.getRow(10).height = 18;

    const titleCell = sheet.getCell("A9");
    titleCell.value = "User Management Report";
    titleCell.font = { name: "Calibri", size: 18, bold: true };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };

    const subtitleCell = sheet.getCell("A10");
    subtitleCell.value = `Generated: ${new Date().toLocaleString()}`;
    subtitleCell.font = { name: "Calibri", size: 11, color: { argb: "FF4B5563" } };
    subtitleCell.alignment = { horizontal: "center", vertical: "middle" };
    addCenteredExcelHeaderImage({
      workbook,
      sheet,
      dataUrl,
      extension: "png",
      dimensions,
      rowStart: 1,
      rowEnd: 8,
    });

    const headerRowNumber = 11;
    const headerRow = sheet.getRow(headerRowNumber);
    headerRow.values = [
      "No",
      "School ID",
      "Student Name",
      "Program",
      "Year/Section",
      "Status",
      "Violation Count",
    ];
    headerRow.height = 24;

    headerRow.eachCell((cell) => {
      cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF0F172A" },
      };
      cell.alignment = {
        horizontal: "left",
        vertical: "middle",
        wrapText: true,
        indent: 1,
      };
      cell.border = {
        top: { style: "thin", color: { argb: "FFCBD5E1" } },
        left: { style: "thin", color: { argb: "FFCBD5E1" } },
        bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
        right: { style: "thin", color: { argb: "FFCBD5E1" } },
      };
    });

    const firstDataRow = headerRowNumber + 1;
    for (const [index, row] of exportRows.entries()) {
      const excelRowNumber = firstDataRow + index;
      const excelRow = sheet.getRow(excelRowNumber);
      excelRow.values = [
        row.no,
        row.schoolId,
        row.studentName,
        row.program,
        row.yearSection,
        row.status,
        row.violationCount,
      ];
      excelRow.height = 28;

      excelRow.eachCell((cell) => {
        cell.font = { name: "Calibri", size: 11, color: { argb: "FF1F2937" } };
        cell.alignment = {
          horizontal: "left",
          vertical: "middle",
          wrapText: true,
          indent: 1,
        };
        cell.border = {
          top: { style: "thin", color: { argb: "FFCBD5E1" } },
          left: { style: "thin", color: { argb: "FFCBD5E1" } },
          bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
          right: { style: "thin", color: { argb: "FFCBD5E1" } },
        };
        if (excelRowNumber % 2 === 0) {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF8FAFC" },
          };
        }
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const filename = `user_management_${formatDateForFileName()}.xlsx`;
    downloadBlob(blob, filename);
  }, [downloadBlob, exportRows, resolveHeaderImage]);

  const exportAsPdf = useCallback(async () => {
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);

    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const { dataUrl, dimensions } = await resolveHeaderImage();
    const tableMarginLeft = 10;
    const tableMarginRight = 10;
    const pageWidth = doc.internal.pageSize.getWidth();
    const tableWidth = pageWidth - tableMarginLeft - tableMarginRight;
    const baseColumnWidths = [12, 28, 55, 24, 26, 24, 24];
    const baseTotalWidth = baseColumnWidths.reduce((sum, width) => sum + width, 0);
    const widthScale = tableWidth / baseTotalWidth;
    const tableColumnWidths = baseColumnWidths.map((width) => width * widthScale);
    const tableCenterX = tableMarginLeft + tableWidth / 2;
    let startY = 22;

    if (dataUrl) {
      const headerWidth = tableWidth;
      const headerHeight = (dimensions.height * headerWidth) / dimensions.width;
      const headerX = tableMarginLeft;
      doc.addImage(dataUrl, "PNG", headerX, 8, headerWidth, headerHeight);
      startY = 8 + headerHeight + 8;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("User Management Report", tableCenterX, startY, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`Generated: ${new Date().toLocaleString()}`, tableCenterX, startY + 5, {
      align: "center",
    });

    autoTable(doc, {
      startY: startY + 9,
      head: [["No", "School ID", "Student Name", "Program", "Year/Section", "Status", "Violation Count"]],
      body: exportRows.map((row) => [
        row.no,
        row.schoolId,
        row.studentName,
        row.program,
        row.yearSection,
        row.status,
        row.violationCount,
      ]),
      theme: "grid",
      styles: {
        fontSize: 8,
        cellPadding: 2.4,
        textColor: [31, 41, 55],
        halign: "left",
        valign: "middle",
      },
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        halign: "left",
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      margin: { left: tableMarginLeft, right: tableMarginRight },
      tableWidth,
      columnStyles: {
        0: { cellWidth: tableColumnWidths[0] },
        1: { cellWidth: tableColumnWidths[1] },
        2: { cellWidth: tableColumnWidths[2] },
        3: { cellWidth: tableColumnWidths[3] },
        4: { cellWidth: tableColumnWidths[4] },
        5: { cellWidth: tableColumnWidths[5] },
        6: { cellWidth: tableColumnWidths[6] },
      },
    });

    doc.save(`user_management_${formatDateForFileName()}.pdf`);
  }, [exportRows, resolveHeaderImage]);

  const handleConfirmExport = async () => {
    if (exportRows.length === 0) {
      setExportAlertMessage("There's no record to export");
      setShowExportAlertModal(true);
      return;
    }

    setIsExporting(true);
    try {
      if (exportFormat === "excel") {
        await exportAsExcel();
      } else {
        await exportAsPdf();
      }

      setShowExportModal(false);
    } catch (error) {
      alert(error?.message || "Unable to export report.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleRowSelect = (row) => {
    handleToggleCheckbox(row.id);
  };

  const columns = [
    {
      key: "select",
      label: showSelectionCheckboxes ? (
        <input
          type="checkbox"
          checked={selectedUserIds.size === filteredStudents.length && filteredStudents.length > 0}
          onChange={handleSelectAll}
          className="w-4 h-4 cursor-pointer"
        />
      ) : (
        <button
          type="button"
          onClick={handleHeaderToggle}
          className="text-gray-400 font-semibold leading-none"
          aria-label="Show selection checkboxes"
        >
          -
        </button>
      ),
      width: "w-12",
      render: (value, row) => {
        if (!showSelectionCheckboxes) {
          return null;
        }

        return (
          <input
            type="checkbox"
            checked={selectedUserIds.has(row.id)}
            onChange={() => handleToggleCheckbox(row.id)}
            onClick={(e) => e.stopPropagation()}
            className="w-4 h-4 cursor-pointer"
          />
        );
      },
    },
    {
      key: "no",
      label: "No",
      width: "w-12",
      render: (value, row) => {
        const index = filteredStudents.findIndex((s) => s.id === row.id);
        return <span>{index + 1}</span>;
      },
    },
    { key: "schoolId", label: "School ID" },
    {
      key: "studentName",
      label: "Student Name",
      render: (value) => <span className="text-gray font-bold">{value}</span>,
    },
    { key: "program", label: "Program" },
    { key: "yearSection", label: "Year/Section" },
    { key: "status", label: "Status" },
    {
      key: "violationCount",
      label: "Violation Count",
      render: (value, row) => {
        let bgColor = "bg-green-500";

        // Get color based on count
        let countColor = "bg-green-500";
        if (value >= 5) {
          countColor = "bg-red-500";
        } else if (value >= 3 && value <= 4) {
          countColor = "bg-orange-500";
        } else if (value === 2) {
          countColor = "bg-yellow-500";
        }

        // Get color based on degree rank (if available)
        const degreeRank = row.maxViolationDegreeRank || 0;
        let degreeColor = "bg-green-500";
        if (degreeRank >= 5 && degreeRank <= 7) {
          degreeColor = "bg-red-500";
        } else if (degreeRank >= 3 && degreeRank <= 4) {
          degreeColor = "bg-orange-500";
        } else if (degreeRank === 2) {
          degreeColor = "bg-yellow-500";
        }

        // Use the more severe color (degree takes priority if higher severity)
        const degreeOrder = { "bg-green-500": 0, "bg-yellow-500": 1, "bg-orange-500": 2, "bg-red-500": 3 };
        bgColor = degreeOrder[degreeColor] >= degreeOrder[countColor] ? degreeColor : countColor;

        return (
          <span
            className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-white text-sm font-medium ${bgColor}`}
          >
            {value}
          </span>
        );
      },
    },
  ];

  const actions = [
    {
      label: "Edit",
      icon: <Edit className="w-4 h-4" />,
      onClick: (row) => {
        setSelectedUser(row);
        setIsEditOpen(true);
      },
    },
    {
      label: "Delete",
      icon: <Trash2 className="w-4 h-4" />,
      onClick: (row) => setDeleteCandidate(row),
      variant: "danger",
    },
  ];

  const tabs = [
    { key: "regular", label: "Regular" },
    { key: "irregular", label: "Irregular" },
  ];

  const resetFilters = () => {
    setSelectedProgram("");
    setSelectedYear("");
    setSelectedSection("");
    setSelectedViolationFilter("");
    setSearchQuery("");
    setSortOrder("A-Z");
    setActiveTab("regular");
  };

  return (
    <div className="text-white relative">
      <AnimatedContent>
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-xl font-semibold tracking-wide">
            USER MANAGEMENT
          </h2>
          <div className="flex gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsAddOpen(true)}
              className="gap-2 bg-[#4A5568] hover:bg-[#3d4654] border-0"
            >
              <Plus className="w-4 h-4" />
              Add User
            </Button>
          </div>
        </div>
      </AnimatedContent>

      <AnimatedContent distance={40} delay={0.1}>
        <div className="flex items-center gap-2 mb-4">
          <div className="flex items-center gap-2">
            <div className="px-3 py-1 bg-blue-500/20 border border-blue-500/40 rounded-full text-sm font-medium text-blue-300">
              {currentSemester} S.Y. {currentSchoolYear}
            </div>
            <button
              onClick={() => setShowEditSemesterModal(true)}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
              title="Edit Semester and School Year"
            >
              <Edit className="w-4 h-4 text-gray-400 hover:text-white" />
            </button>
          </div>
        </div>
      </AnimatedContent>

      <AnimatedContent distance={40} delay={0.2}>
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <SearchBar
            placeholder="Search by name, ID, program, or section"
            className="w-80"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="secondary"
                size="sm"
                className="min-w-[90px] justify-between"
              >
                {sortOrder}
                <ChevronDown className="ml-2 w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => setSortOrder("A-Z")}>A-Z</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortOrder("Z-A")}>Z-A</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Program Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="secondary"
                size="sm"
                className="min-w-[120px] justify-between"
              >
                {selectedProgram
                  ? selectedProgram.toUpperCase()
                  : "All Programs"}
                <ChevronDown className="ml-2 w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => setSelectedProgram("")}>
                All Programs
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSelectedProgram("bsit")}>
                BSIT
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSelectedProgram("bscs")}>
                BSCS
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Year Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="secondary"
                size="sm"
                className="min-w-[120px] justify-between"
              >
                {selectedYear ? `${selectedYear} Year` : "All Years"}
                <ChevronDown className="ml-2 w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => setSelectedYear("")}>
                All Years
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSelectedYear("1")}>
                1st Year
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSelectedYear("2")}>
                2nd Year
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSelectedYear("3")}>
                3rd Year
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSelectedYear("4")}>
                4th Year
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Section Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="secondary"
                size="sm"
                className="min-w-[120px] justify-between"
              >
                {selectedSection
                  ? `Section ${selectedSection.toUpperCase()}`
                  : "All Sections"}
                <ChevronDown className="ml-2 w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => setSelectedSection("")}>
                All Sections
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSelectedSection("a")}>
                Section A
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSelectedSection("b")}>
                Section B
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSelectedSection("c")}>
                Section C
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSelectedSection("d")}>
                Section D
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSelectedSection("e")}>
                Section E
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Violation Count Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="secondary"
                size="sm"
                className="min-w-[160px] justify-between"
              >
                {selectedViolationFilter === "with"
                  ? "With Violations"
                  : selectedViolationFilter === "none"
                    ? "No Violations"
                    : "All Violation Count"}
                <ChevronDown className="ml-2 w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => setSelectedViolationFilter("")}>
                All Violation Count
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSelectedViolationFilter("with")}>
                With Violations
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSelectedViolationFilter("none")}>
                No Violations
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {(selectedProgram ||
            selectedYear ||
            selectedSection ||
            selectedViolationFilter ||
            sortOrder !== "A-Z" ||
            searchQuery ||
            activeTab !== "regular") && (
            <Button
              variant="secondary"
              size="sm"
              onClick={resetFilters}
              className="gap-2 bg-[#4A5568] hover:bg-[#3d4654] border-0"
            >
              Reset Filters
            </Button>
          )}
        </div>
      </AnimatedContent>

      <AnimatedContent distance={40} delay={0.3}>
        <TableTabs
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          className="mb-4"
        />
      </AnimatedContent>

      <AnimatedContent distance={40} delay={0.4}>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-4">
          <div className="flex items-center gap-6 text-sm">
            <span className="text-gray-400">
              Total Students:{" "}
              <span className="text-white font-medium">{statistics.total}</span>
            </span>
            <span className="text-gray-400">
              Students with Violations:{" "}
              <span className="text-white font-medium">
                {statistics.withViolations}
              </span>
            </span>
            <span className="text-gray-400">
              Warning:{" "}
              <span className="text-white font-medium">
                {statistics.warning}
              </span>
            </span>
            <span className="text-gray-400">
              At-Risk Students:{" "}
              <span className="text-white font-medium">
                {statistics.atRisk}
              </span>
            </span>
            <span className="text-gray-400">
              High-Risk Students:{" "}
              <span className="text-white font-medium">
                {statistics.highRisk}
              </span>
            </span>
          </div>
          <div className="flex gap-3">
            {selectedUserIds.size > 0 && (
              <Button
                variant="secondary"
                size="sm"
                className="gap-2 bg-gray-600 hover:bg-gray-700 border-0"
                onClick={() => setSelectedUserIds(new Set())}
              >
                <Minus className="w-4 h-4" />
                Clear All
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              className="gap-2 bg-orange-600/30 hover:bg-orange-600/50 border-orange-600/50 border"
              onClick={handleOpenAlertModal}
              disabled={selectedUserIds.size === 0 || isLoading}
            >
              <AlertCircle className="w-4 h-4" />
              Alert {selectedUserIds.size > 0 && `(${selectedUserIds.size})`}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="gap-2 bg-amber-600/30 hover:bg-amber-600/50 border-amber-600/50 border"
              onClick={() => {
                if (selectedUserIds.size === 0) {
                  showArchiveAlert(
                    "warning",
                    "No Users Selected",
                    "Please select at least one user to archive.",
                  );
                  return;
                }
                setShowArchiveUsersModal(true);
              }}
            >
              <Archive className="w-4 h-4" />
              Archive {selectedUserIds.size > 0 && `(${selectedUserIds.size})`}
            </Button>
            {selectedUserIds.size > 0 && (
              <Button
                variant="secondary"
                size="sm"
                className="gap-2 bg-red-600/30 hover:bg-red-600/50 border-red-600/50 border"
                onClick={() => setShowDeleteSelectedModal(true)}
                disabled={isLoading || isDeletingSelected}
              >
                <Trash2 className="w-4 h-4" />
                Delete {selectedUserIds.size > 0 && `(${selectedUserIds.size})`}
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              className="gap-2 bg-[#4A5568] hover:bg-[#3d4654] border-0"
              onClick={() => {
                setExportFormat("excel");
                setShowExportModal(true);
              }}
            >
              <Download className="w-4 h-4" />
              Export
            </Button>
          </div>
        </div>
      </AnimatedContent>

      <AnimatedContent distance={40} delay={0.5}>
        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <div className="text-center">
              <div className="mb-4 text-gray-400">
                <svg className="animate-spin h-8 w-8 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
              <p className="text-gray-400">Loading students...</p>
            </div>
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={filteredStudents}
            actions={actions}
            onRowClick={handleRowSelect}
          />
        )}
      </AnimatedContent>

      {/* Add Modal */}
      <AddUserModal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onSave={handleSaveNewUser}
        isSaving={isAddingUser}
      />

      {/* Edit Modal */}
      <EditUserModal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        user={selectedUser}
        onSave={handleSaveEdit}
        isSaving={isSavingEditUser}
      />

      <EditSemesterYearModal
        isOpen={showEditSemesterModal}
        onClose={() => setShowEditSemesterModal(false)}
        currentSemester={currentSemester}
        currentSchoolYear={currentSchoolYear}
        onSave={handleSaveSemesterYear}
      />

      <Modal
        isOpen={Boolean(deleteCandidate)}
        onClose={() => {
          if (!isDeleting) {
            setDeleteCandidate(null);
          }
        }}
        title={
          <span className="flex items-center gap-2 font-black font-inter">
            <AlertCircle className="w-5 h-5" style={{ color: "rgb(255 0 69)" }} />
            Delete Student
          </span>
        }
        size="md"
        showCloseButton={!isDeleting}
      >
        <div className="rounded-xl border border-red-400/25 bg-red-500/10 px-4 py-3 mb-4">
          <p className="text-red-300 text-sm font-medium">
            This action cannot be undone and will permanently remove the student record.
          </p>
        </div>
        <p className="text-gray-200 text-sm" style={{ letterSpacing: "2px" }}>
          Are you sure you want to delete <span className="font-semibold text-white">{deleteCandidate?.studentName}</span>?
        </p>
        <ModalFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setDeleteCandidate(null)}
            disabled={isDeleting}
            className="px-6 py-2.5"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={handleDeleteStudent}
            disabled={isDeleting}
            className="px-6 py-2.5"
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </Button>
        </ModalFooter>
      </Modal>

      <Modal
        isOpen={showDeleteSelectedModal}
        onClose={() => {
          if (!isDeletingSelected) {
            setShowDeleteSelectedModal(false);
          }
        }}
        title={
          <span className="flex items-center gap-2 font-black font-inter">
            <AlertCircle className="w-5 h-5 text-red-400" />
            Delete Selected Students
          </span>
        }
        size="md"
        showCloseButton={!isDeletingSelected}
      >
        <div className="rounded-xl border border-red-400/25 bg-red-500/10 px-4 py-3 mb-4">
          <p className="text-red-300 text-sm font-medium">
            This action cannot be undone and will permanently remove the selected student records.
          </p>
        </div>
        <p className="text-gray-200 text-sm mb-4" style={{ letterSpacing: "2px" }}>
          Are you sure you want to delete <span className="font-semibold text-white">{formatStudentLabel(selectedUserIds.size)}</span>?
        </p>
        <ModalFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowDeleteSelectedModal(false)}
            disabled={isDeletingSelected}
            className="px-6 py-2.5"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={handleDeleteSelectedStudents}
            disabled={isDeletingSelected}
            className="px-6 py-2.5"
          >
            {isDeletingSelected ? "Deleting..." : "Delete Selected"}
          </Button>
        </ModalFooter>
      </Modal>

      <Modal
        isOpen={showDuplicateSchoolIdModal}
        onClose={() => setShowDuplicateSchoolIdModal(false)}
        title={<span className="font-black font-inter">Duplicate School ID</span>}
        size="sm"
        showCloseButton
      >
        <div className="rounded-lg border border-red-400/25 bg-red-500/10 px-4 py-3 mb-4">
          <p className="text-sm font-medium text-red-300">
            School ID already exists. Please use a unique School ID.
          </p>
        </div>
        <ModalFooter>
          <Button
            type="button"
            variant="primary"
            onClick={() => setShowDuplicateSchoolIdModal(false)}
            className="px-6 py-2.5"
          >
            OK
          </Button>
        </ModalFooter>
      </Modal>

      <Modal
        isOpen={showDuplicateEmailModal}
        onClose={() => setShowDuplicateEmailModal(false)}
        title={<span className="font-black font-inter">Duplicate Email</span>}
        size="sm"
        showCloseButton
      >
        <div className="rounded-lg border border-red-400/25 bg-red-500/10 px-4 py-3 mb-4">
          <p className="text-sm font-medium text-red-300">
            Email already exists. Please use a unique email address.
          </p>
        </div>
        <ModalFooter>
          <Button
            type="button"
            variant="primary"
            onClick={() => setShowDuplicateEmailModal(false)}
            className="px-6 py-2.5"
          >
            OK
          </Button>
        </ModalFooter>
      </Modal>

      <Modal
        isOpen={showEditSuccessModal}
        onClose={() => setShowEditSuccessModal(false)}
        title={
          <span className="font-black font-inter flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-400" />
            Saved Successfully
          </span>
        }
        size="sm"
        showCloseButton
      >
        <div className="rounded-lg border border-green-400/25 bg-green-500/10 px-4 py-3 mb-4">
          <p className="text-sm font-medium text-green-300">
            User information updated successfully.
          </p>
        </div>
        <ModalFooter>
          <Button
            type="button"
            variant="primary"
            onClick={() => setShowEditSuccessModal(false)}
            className="px-6 py-2.5"
          >
            OK
          </Button>
        </ModalFooter>
      </Modal>

      <Modal
        isOpen={showExportModal}
        onClose={() => {
          if (!isExporting) {
            setShowExportModal(false);
          }
        }}
        title={<span className="font-black font-inter">Export User Management Report</span>}
        size="md"
        showCloseButton={!isExporting}
      >
        <p className="text-sm text-gray-300 mb-3">
          Choose a format for exporting the current table view.
        </p>
        <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 mb-4">
          <p className="text-xs text-gray-300">
            Rows to export: <span className="font-semibold text-white">{exportRows.length}</span>
          </p>
        </div>

        <label className="block text-sm font-medium text-white mb-2">Format</label>
        <div className="relative">
          <select
            value={exportFormat}
            onChange={(event) => setExportFormat(event.target.value)}
            disabled={isExporting}
            className="w-full cursor-pointer backdrop-blur-md border border-white/20 rounded-xl px-4 pr-11 py-3 text-[15px] text-white bg-[rgba(45,47,52,0.8)] focus:outline-none focus:border-cyan-300/60 focus:ring-1 focus:ring-cyan-300/30 transition-all appearance-none"
          >
            <option value="excel">Excel (.xlsx)</option>
            <option value="pdf">PDF</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cyan-300" />
        </div>

        <ModalFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowExportModal(false)}
            disabled={isExporting}
            className="px-6 py-2.5"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={handleConfirmExport}
            disabled={isExporting}
            className="px-6 py-2.5"
          >
            {isExporting ? "Exporting..." : "Export"}
          </Button>
        </ModalFooter>
      </Modal>

      <AlertModal
        isOpen={showExportAlertModal}
        onClose={() => setShowExportAlertModal(false)}
        title="Export unavailable"
        message={exportAlertMessage}
        confirmLabel="Okay"
      />

      <Modal
        isOpen={showCreateSuccessModal}
        onClose={() => setShowCreateSuccessModal(false)}
        title={
          <span className="font-black font-inter flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-400" />
            Successfully Created
          </span>
        }
        size="sm"
        showCloseButton
      >
        <div className="rounded-lg border border-green-400/25 bg-green-500/10 px-4 py-3 mb-4">
          <p className="text-sm font-medium text-green-300">
            Student account was created and credentials were sent.
          </p>
        </div>
        <ModalFooter>
          <Button
            type="button"
            variant="primary"
            onClick={() => setShowCreateSuccessModal(false)}
            className="px-6 py-2.5"
          >
            OK
          </Button>
        </ModalFooter>
      </Modal>

      {/* Archive School Year Modal */}
      <Modal
        isOpen={showArchiveSchoolYearModal}
        onClose={() => {
          if (!isArchivingSchoolYear) {
            setShowArchiveSchoolYearModal(false);
            setNewSchoolYear("S.Y. 2026-2027");
          }
        }}
        title={<span className="font-black font-inter">Archive School Year</span>}
        size="md"
        showCloseButton={!isArchivingSchoolYear}
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-orange-400/25 bg-orange-500/10 px-4 py-3">
            <p className="text-sm text-orange-200 font-medium mb-2">⚠️ Important Notice</p>
            <p className="text-xs text-orange-100 leading-relaxed">
              Archiving the school year will automatically increase all students' year level by +1 (except for 4th-year students, who will be archived directly).
            </p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-white mb-2">Current School Year (Folder Name)</label>
            <input
              type="text"
              value={currentSchoolYear}
              disabled
              className="w-full backdrop-blur-md border border-white/20 rounded-lg px-4 py-3 text-sm text-gray-400 bg-white/5 cursor-not-allowed"
            />
            <p className="text-xs text-gray-400 mt-1">This will be used as the archive folder name</p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-white mb-2">New School Year</label>
            <input
              type="text"
              value={newSchoolYear}
              onChange={(e) => setNewSchoolYear(e.target.value)}
              placeholder="S.Y. 2026-2027"
              disabled={isArchivingSchoolYear}
              className="w-full backdrop-blur-md border border-white/20 rounded-lg px-4 py-3 text-sm text-white bg-white/5 focus:border-cyan-300/60 focus:ring-1 focus:ring-cyan-300/30 transition-all disabled:opacity-50"
            />
          </div>

          <div className="rounded-lg border border-blue-400/25 bg-blue-500/10 px-4 py-3">
            <p className="text-xs text-blue-200">
              <span className="font-semibold">Summary:</span> {studentData.filter(s => !String(s.yearSection || "").match(/^4/)).length} students will be promoted to next level. {studentData.filter(s => String(s.yearSection || "").match(/^4/)).length} 4th-year students will be archived.
            </p>
          </div>
        </div>

        <ModalFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setShowArchiveSchoolYearModal(false);
              setNewSchoolYear("S.Y. 2026-2027");
            }}
            disabled={isArchivingSchoolYear}
            className="px-6 py-2.5"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={handleArchiveSchoolYear}
            disabled={isArchivingSchoolYear || !newSchoolYear.trim()}
            className="px-6 py-2.5"
          >
            {isArchivingSchoolYear ? "Archiving..." : "Archive School Year"}
          </Button>
        </ModalFooter>
      </Modal>

      <Modal
        isOpen={showSendAlertModal}
        onClose={() => {
          if (!isSendingAlert) {
            setShowSendAlertModal(false);
            setAlertValidationMessage("");
          }
        }}
        title={<span className="font-black font-inter">Send Alert</span>}
        size="lg"
        showCloseButton={!isSendingAlert}
      >
        <div className="rounded-lg border border-orange-400/25 bg-orange-500/10 px-4 py-3 mb-4">
          <p className="text-sm text-orange-200 font-medium mb-1">Alert Recipients</p>
          <p className="text-xs text-orange-100 leading-relaxed">
            {formatStudentLabel(selectedStudentsForAlert.length)} will receive this alert notification.
          </p>
        </div>

        <div className="mb-4">
          <p className="text-sm text-gray-300 font-semibold mb-2">Selected Students</p>
          <div className="max-h-44 overflow-y-auto rounded-lg border border-white/20 bg-white/5">
            <table className="w-full text-xs">
              <thead className="bg-white/10 text-gray-200">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Student Name</th>
                  <th className="px-3 py-2 text-left font-semibold">School ID</th>
                  <th className="px-3 py-2 text-left font-semibold">Program</th>
                  <th className="px-3 py-2 text-left font-semibold">Year/Section</th>
                </tr>
              </thead>
              <tbody>
                {selectedStudentsForAlert.map((student) => (
                  <tr key={student.id} className="border-t border-white/10 text-gray-300">
                    <td className="px-3 py-2">{student.studentName}</td>
                    <td className="px-3 py-2">{student.schoolId}</td>
                    <td className="px-3 py-2">{student.program}</td>
                    <td className="px-3 py-2">{student.yearSection}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm text-gray-300 font-semibold mb-2">Alert Type</label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="secondary"
                size="sm"
                disabled={isSendingAlert}
                className="w-full justify-between bg-white/5 border-white/20 text-white hover:bg-white/10 h-11"
              >
                {alertType || "Select alert type"}
                <ChevronDown className="w-4 h-4 text-cyan-300" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)] bg-[#1f232b] border border-white/15 text-white">
              <DropdownMenuItem
                onClick={() => {
                  setAlertType("");
                  setCustomAlertType("");
                }}
                className="text-gray-200 data-[highlighted]:bg-white/10 data-[highlighted]:text-white"
              >
                Select alert type
              </DropdownMenuItem>
              {ALERT_TYPE_OPTIONS.map((option) => (
                <DropdownMenuItem
                  key={option}
                  onClick={() => {
                    setAlertType(option);
                    if (option !== "Custom") {
                      setCustomAlertType("");
                    }
                  }}
                  className="text-gray-200 data-[highlighted]:bg-white/10 data-[highlighted]:text-white"
                >
                  {option}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {alertType === "Custom" && (
          <div className="mb-4">
            <label className="block text-sm text-gray-300 font-semibold mb-2">Custom Alert Type</label>
            <input
              type="text"
              value={customAlertType}
              onChange={(event) => setCustomAlertType(event.target.value)}
              disabled={isSendingAlert}
              placeholder="Enter custom alert type"
              className="w-full backdrop-blur-md border border-white/20 rounded-lg px-4 py-3 text-sm text-white bg-white/5 placeholder-gray-400 focus:outline-none focus:border-cyan-300/60 focus:ring-1 focus:ring-cyan-300/30 transition-all disabled:opacity-50"
            />
          </div>
        )}

        <div>
          <label className="block text-sm text-gray-300 font-semibold mb-2">Message / Description</label>
          <textarea
            value={alertMessage}
            onChange={(event) => setAlertMessage(event.target.value)}
            disabled={isSendingAlert}
            rows={5}
            placeholder={`Type the message that will be sent to selected ${pluralize("student", selectedStudentsForAlert.length)}.`}
            className="w-full resize-none backdrop-blur-md border border-white/20 rounded-lg px-4 py-3 text-sm text-white bg-white/5 placeholder-gray-400 focus:outline-none focus:border-cyan-300/60 focus:ring-1 focus:ring-cyan-300/30 transition-all disabled:opacity-50"
          />
        </div>

        {alertValidationMessage && (
          <div className="mt-4 rounded-lg border border-red-400/25 bg-red-500/10 px-4 py-3">
            <p className="text-sm font-medium text-red-300">{alertValidationMessage}</p>
          </div>
        )}

        <ModalFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setShowSendAlertModal(false);
              setAlertValidationMessage("");
            }}
            disabled={isSendingAlert}
            className="px-6 py-2.5"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={handleSendAlert}
            disabled={isSendingAlert}
            className="px-6 py-2.5"
          >
            {isSendingAlert ? "Sending..." : "Send Alert"}
          </Button>
        </ModalFooter>
      </Modal>

      {/* Archive Selected Users Modal */}
      <Modal
        isOpen={showArchiveUsersModal}
        onClose={() => {
          if (!isArchivingUsers) {
            setShowArchiveUsersModal(false);
          }
        }}
        title={<span className="font-black font-inter">Archive Selected Users</span>}
        size="2xl"
        showCloseButton={!isArchivingUsers}
      >
        <div className="rounded-lg border border-orange-400/25 bg-orange-500/10 px-4 py-3 mb-3">
          <p className="text-sm text-orange-200 font-medium mb-2">⚠️ Archive Action</p>
          <p className="text-xs text-orange-100 leading-relaxed">
            {formatStudentLabel(selectedUserIds.size)} will be moved to the archive folder. They will no longer appear in the User Management but can be viewed in the archive tab.
          </p>
        </div>

        {studentsWithViolations.length > 0 && (
          <div className="rounded-lg border border-red-400/25 bg-red-500/10 px-4 py-3 mb-3">
            <p className="text-sm text-red-200 font-medium mb-2">🚨 Students with Violations</p>
            <p className="text-xs text-red-100 leading-relaxed">
              {formatStudentLabel(studentsWithViolations.length)} currently have violations and will be placed in the "Unresolved" folder. They will automatically be moved to the main "USERS" folder once all their violations are cleared.
            </p>
          </div>
        )}

        <div className="rounded-lg border border-blue-400/25 bg-blue-500/10 px-4 py-3 mb-3">
          <p className="text-xs text-blue-200">
            <span className="font-semibold">Note:</span> Archived users' data remains in the database.
          </p>
        </div>

        <div className="mb-3">
          <p className="text-sm text-gray-300 font-semibold mb-3">Selected Students:</p>
          {selectedStudentsForAlert.length === 0 ? (
            <div className="rounded-lg border border-white/20 bg-white/5 px-3 py-3 text-xs text-gray-300">
              No students selected.
            </div>
          ) : (
            <div className="max-h-64 overflow-y-auto rounded-lg border border-white/20 bg-white/5 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent">
              <table className="w-full text-xs text-gray-200 table-fixed">
                <thead className="bg-white/10 text-gray-300 sticky top-0">
                  <tr>
                    <th className="px-1.5 py-1.5 text-left font-semibold whitespace-nowrap w-1/3">Student Name</th>
                    <th className="px-1.5 py-1.5 text-left font-semibold whitespace-nowrap w-1/6">School ID</th>
                    <th className="px-1.5 py-1.5 text-left font-semibold whitespace-nowrap w-1/6">Program</th>
                    <th className="px-1.5 py-1.5 text-left font-semibold whitespace-nowrap w-1/6">Year/Section</th>
                    <th className="px-1.5 py-1.5 text-left font-semibold whitespace-nowrap w-1/6">Status</th>
                    <th className="px-1.5 py-1.5 text-left font-semibold whitespace-nowrap w-1/6">Violations</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedStudentsForAlert.map((student) => (
                    <tr key={student.id} className="border-t border-white/10 text-gray-200">
                      <td className="px-1.5 py-1.5 whitespace-nowrap">{student.studentName}</td>
                      <td className="px-1.5 py-1.5 whitespace-nowrap">{student.schoolId}</td>
                      <td className="px-1.5 py-1.5 whitespace-nowrap">{student.program}</td>
                      <td className="px-1.5 py-1.5 whitespace-nowrap">{student.yearSection}</td>
                      <td className="px-1.5 py-1.5 whitespace-nowrap">{student.status}</td>
                      <td className="px-1.5 py-1.5 whitespace-nowrap text-center">{student.violationCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="mb-3">
          <label className="block text-sm text-gray-300 font-semibold mb-2">
            Archive Reason *
          </label>
          <SelectField
            value={archiveReasonType}
            onChange={(e) => {
              const selectedReason = e.target.value;
              setArchiveReasonType(selectedReason);
              if (selectedReason !== "Custom") {
                setCustomArchiveReason("");
              }
            }}
            disabled={isArchivingUsers}
            className="w-full"
          >
            <option value="">Select an archive reason</option>
            {ARCHIVE_REASON_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </SelectField>
          {archiveReasonType === "Custom" && (
            <input
              type="text"
              value={customArchiveReason}
              onChange={(e) => setCustomArchiveReason(e.target.value)}
              placeholder="Enter custom reason"
              className="w-full mt-2 px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-xs text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isArchivingUsers}
            />
          )}
          <p className="text-xs text-gray-400 mt-1">
            This reason will be shown as the student's status in the archive.
          </p>
        </div>

        <ModalFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowArchiveUsersModal(false)}
            disabled={isArchivingUsers}
            className="px-6 py-2.5"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={handleArchiveUsers}
            disabled={isArchivingUsers || selectedUserIds.size === 0}
            className="px-6 py-2.5 bg-white text-black"
          >
            {isArchivingUsers ? "Archiving..." : "Archive Selected Users"}
          </Button>
        </ModalFooter>
      </Modal>

      {/* Archive Confirmation Modal */}
      <Modal
        isOpen={showArchiveConfirmationModal}
        onClose={() => {
          if (!isArchivingUsers) {
            setShowArchiveConfirmationModal(false);
            setShowArchiveUsersModal(true); // Go back to archive modal
          }
        }}
        title={<span className="font-black font-inter">Confirm Archive Action</span>}
        size="lg"
        showCloseButton={!isArchivingUsers}
      >
        <div className="text-center mb-6">
          <p className="text-lg text-gray-300 mb-4">Do you want to archive this user?</p>
          
          <div className="space-y-3">
            <button
              onClick={() => setArchiveDeactivateAccount(true)}
              className={`w-full p-4 rounded-lg border-2 transition-all ${
                archiveDeactivateAccount
                  ? "border-red-500 bg-red-500/20 text-red-300"
                  : "border-gray-600 bg-gray-700/50 text-gray-300 hover:border-gray-500"
              }`}
              disabled={isArchivingUsers}
            >
              <div className="font-semibold">Archive & Deactivate</div>
              <div className="text-sm text-gray-400 mt-1">
                Archive the record and deactivate the account. User will receive an email notification.
              </div>
            </button>

            <button
              onClick={() => setArchiveDeactivateAccount(false)}
              className={`w-full p-4 rounded-lg border-2 transition-all ${
                !archiveDeactivateAccount
                  ? "border-blue-500 bg-blue-500/20 text-blue-300"
                  : "border-gray-600 bg-gray-700/50 text-gray-300 hover:border-gray-500"
              }`}
              disabled={isArchivingUsers}
            >
              <div className="font-semibold">Archive Only (Keep Active)</div>
              <div className="text-sm text-gray-400 mt-1">
                Archive the record but keep the account active. User can still log in.
              </div>
            </button>
          </div>
        </div>

        <ModalFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setShowArchiveConfirmationModal(false);
              setShowArchiveUsersModal(true);
            }}
            disabled={isArchivingUsers}
            className="px-6 py-2.5"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={handleConfirmArchive}
            disabled={isArchivingUsers}
            className="px-6 py-2.5 bg-white text-black"
          >
            {isArchivingUsers ? "Archiving..." : "Confirm Archive"}
          </Button>
        </ModalFooter>
      </Modal>

      <Modal
        isOpen={archiveAlertModal.isOpen}
        onClose={() =>
          setArchiveAlertModal((prev) => ({
            ...prev,
            isOpen: false,
          }))
        }
        title={
          <span className="font-black font-inter flex items-center gap-2">
            {archiveAlertModal.type === "success" ? (
              <CheckCircle className="w-5 h-5 text-green-400" />
            ) : (
              <AlertCircle
                className={`w-5 h-5 ${
                  archiveAlertModal.type === "error"
                    ? "text-red-400"
                    : "text-amber-300"
                }`}
              />
            )}
            {archiveAlertModal.title || "Archive"}
          </span>
        }
        size="sm"
        showCloseButton
      >
        <div
          className={`rounded-lg px-4 py-3 mb-4 border ${
            archiveAlertModal.type === "success"
              ? "border-green-400/25 bg-green-500/10"
              : archiveAlertModal.type === "error"
                ? "border-red-400/25 bg-red-500/10"
                : "border-amber-400/25 bg-amber-500/10"
          }`}
        >
          <p
            className={`text-sm font-medium ${
              archiveAlertModal.type === "success"
                ? "text-green-300"
                : archiveAlertModal.type === "error"
                  ? "text-red-300"
                  : "text-amber-200"
            }`}
          >
            {archiveAlertModal.message}
          </p>
        </div>
        <ModalFooter>
          <Button
            type="button"
            variant="primary"
            onClick={() =>
              setArchiveAlertModal((prev) => ({
                ...prev,
                isOpen: false,
              }))
            }
            className="px-6 py-2.5"
          >
            OK
          </Button>
        </ModalFooter>
      </Modal>

      <Modal
        isOpen={alertResultModal.isOpen}
        onClose={() =>
          setAlertResultModal((prev) => ({
            ...prev,
            isOpen: false,
          }))
        }
        title={
          <span className="font-black font-inter flex items-center gap-2">
            {alertResultModal.type === "success" ? (
              <CheckCircle className="w-5 h-5 text-green-400" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-400" />
            )}
            {alertResultModal.title || "Alert"}
          </span>
        }
        size="sm"
        showCloseButton
      >
        <div
          className={`rounded-lg px-4 py-3 mb-4 border ${
            alertResultModal.type === "success"
              ? "border-green-400/25 bg-green-500/10"
              : "border-red-400/25 bg-red-500/10"
          }`}
        >
          <p
            className={`text-sm font-medium ${
              alertResultModal.type === "success"
                ? "text-green-300"
                : "text-red-300"
            }`}
          >
            {alertResultModal.message}
          </p>
        </div>
        <ModalFooter>
          <Button
            type="button"
            variant="primary"
            onClick={() =>
              setAlertResultModal((prev) => ({
                ...prev,
                isOpen: false,
              }))
            }
            className="px-6 py-2.5"
          >
            OK
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
};

export default UserManagement;
