import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import AnimatedContent from "../../components/ui/AnimatedContent";
import SearchBar from "../../components/ui/SearchBar";
import Button from "../../components/ui/Button";
import DataTable from "../../components/ui/DataTable";
import TableTabs from "../../components/ui/TableTabs";
import { Folder, Download, X, AlertCircle, MoreVertical, Edit, RotateCcw, Trash2, Check, Tag, CalendarDays, SortAsc, Upload, UserRound, ShieldAlert, Mail, GraduationCap, CalendarClock, FileText, Database, Archive, ArrowUpRight, IdCard, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "../../components/ui/dropdown-menu";
import Modal, { ModalFooter } from "@/components/ui/Modal";
import AlertModal from "@/components/ui/AlertModal";
import EditArchiveModal from "@/components/modals/EditArchiveModal";
import { getAuditHeaders } from "@/lib/auditHeaders";
import { formatStudentDisplayName } from "@/lib/utils";
import {
  addCenteredExcelHeaderImage,
  applyExcelPrintLayout,
  getExcelColumnLetter,
} from "@/lib/excelExportLayout";

const EXPORT_HEADER_IMAGE_PATH = '/plpasig_header.png';

const semesterTabs = [
  { key: "1ST SEM", label: "1st Semester" },
  { key: "2ND SEM", label: "2nd Semester" },
  { key: "SUMMER", label: "Summer" },
];

const getPlainText = (value) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(getPlainText).join(" ").trim();
  if (React.isValidElement(value)) return getPlainText(value.props.children);
  return "";
};

// Helper function to safely format dates
const formatDate = (dateString) => {
  if (!dateString) return "-";
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return "-";
    }
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch (err) {
    console.warn("Date format error:", dateString, err);
    return "-";
  }
};

const getArchiveViolationDisplayDate = (record) =>
  record?.original_created_at ||
  record?.originalCreatedAt ||
  record?.archived_at ||
  record?.archivedAt ||
  "";

// Helper functions for export functionality
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
    img.onerror = () => reject(new Error('Unable to load image dimensions.'));
    img.src = dataUrl;
  });

// Convert signature image to base64 data URL for exports
const getSignatureImageData = async (signatureSrc) => {
  if (!signatureSrc) return null;

  try {
    // If it's already a data URL, return it
    if (signatureSrc.startsWith('data:')) {
      return signatureSrc;
    }

    // If it's a regular URL, fetch it
    const response = await fetch(signatureSrc);
    if (!response.ok) return null;

    const blob = await response.blob();
    return await blobToDataUrl(blob);
  } catch (error) {
    console.warn('Failed to load signature image:', error);
    return null;
  }
};

const getImageTypeFromDataUrl = (dataUrl) => {
  if (typeof dataUrl !== 'string') return 'PNG';
  const match = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp);/i);
  if (!match) return 'PNG';
  const type = match[1].toLowerCase();
  return type === 'jpg' ? 'JPEG' : type.toUpperCase();
};

// Resolve header image for exports
const resolveHeaderImage = async () => {
  try {
    const response = await fetch(EXPORT_HEADER_IMAGE_PATH);
    if (!response.ok) {
      throw new Error(`Header image not found: ${EXPORT_HEADER_IMAGE_PATH}`);
    }
    const blob = await response.blob();
    const dataUrl = await blobToDataUrl(blob);
    const dimensions = await getDataUrlDimensions(dataUrl);
    return { dataUrl, dimensions };
  } catch (error) {
    console.warn('Failed to load header image:', error);
    return { dataUrl: null, dimensions: null };
  }
};

const formatExportGeneratedDate = (date) => {
  const parsedDate = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(parsedDate.getTime())) {
    return '-';
  }
  const month = parsedDate.toLocaleString(undefined, { month: 'long' }).toUpperCase();
  const day = parsedDate.getDate();
  const year = parsedDate.getFullYear();
  const time = parsedDate.toLocaleString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return `${month} ${day}, ${year}, ${time}`;
};

const formatDateForFileName = (dateString) => {
  if (!dateString) return 'Unknown_Date';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Unknown_Date';
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    return `${year}-${month}-${day}`;
  } catch (err) {
    return 'Unknown_Date';
  }
};

const formatProgramYearSection = (program, yearSection) => {
  const programText = String(program || '').trim();
  const yearSectionText = String(yearSection || '').trim();

  if (programText && yearSectionText) {
    const normalizedPrefix = `${programText.toLowerCase()}-`;
    if (yearSectionText.toLowerCase().startsWith(normalizedPrefix)) {
      return yearSectionText;
    }

    return `${programText}-${yearSectionText}`;
  }

  return programText || yearSectionText || '';
};

const getArchiveRowKey = (row) => {
  if (!row) return "";

  const sourceKey = String(row.sourceImportKey || row.source_import_key || "").trim();
  if (sourceKey) {
    return `source:${sourceKey}`;
  }

  return `${String(row.recordType || "row").trim() || "row"}:${row.id ?? ""}`;
};

const dedupeArchiveRows = (rows) => {
  const seen = new Set();
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    const key = getArchiveRowKey(row);
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

const fetchArchiveViolations = async (url) => {
  const response = await fetch(url, {
    headers: { ...getAuditHeaders() },
  });

  const data = await response.json().catch(() => ({}));
  if (response.ok && data.status === "ok" && Array.isArray(data.violations)) {
    return data.violations;
  }

  return [];
};

const formatDisplayName = (firstName, lastName, fullName, middleInitial = "") => {
  return (
    formatStudentDisplayName({
      firstName,
      middleInitial,
      lastName,
      fullName,
    }) || "-"
  );
};

const splitMiddleInitialFromFirstName = (firstName, middleInitial) => {
  const cleanedFirst = String(firstName || "").replace(/\s+/g, " ").trim();
  const explicitMiddle = String(middleInitial || "")
    .replace(/\./g, "")
    .trim();

  if (!cleanedFirst) {
    return {
      firstName: "",
      middleInitial: explicitMiddle ? explicitMiddle.charAt(0).toUpperCase() : "",
    };
  }

  const tokens = cleanedFirst.split(" ").filter(Boolean);
  const hasTrailingInitial =
    tokens.length >= 2 &&
    /^[a-z]$/i.test(String(tokens[tokens.length - 1] || "").replace(/\./g, ""));
  const normalizedFirst = hasTrailingInitial
    ? tokens.slice(0, -1).join(" ")
    : cleanedFirst;

  if (explicitMiddle) {
    return {
      firstName: normalizedFirst,
      middleInitial: explicitMiddle.charAt(0).toUpperCase(),
    };
  }

  return {
    firstName: normalizedFirst,
    middleInitial: hasTrailingInitial
      ? String(tokens[tokens.length - 1] || "").replace(/\./g, "").toUpperCase()
      : "",
  };
};

const isLikelyViolationTypeLabel = (value) => {
  const text = String(value || "").trim();
  if (!text) return false;
  return /^(minor|major)\s*-\s*.+/i.test(text);
};

const buildViolationTypeAndReporter = (violation) => {
  const category = String(violation?.violation_category || "").trim();
  const degree = String(violation?.violation_degree || "").trim();
  const explicitType = String(violation?.violation_type_label || "").trim();
  const reportedByRaw = String(violation?.reported_by || "").trim();
  const isImportedRecord =
    String(violation?.remarks || "").trim().toUpperCase() === "IMPORTED" ||
    Boolean(violation?.isHistoricalWorkbook) ||
    String(violation?.sourceType || "").trim().toLowerCase() === "workbook";

  const type =
    category && degree
      ? `${category} - ${degree}`
      : explicitType ||
        (isLikelyViolationTypeLabel(reportedByRaw) ? reportedByRaw : "-");

  const reportedBy =
    reportedByRaw && !isLikelyViolationTypeLabel(reportedByRaw)
      ? reportedByRaw
      : isImportedRecord
        ? ""
        : "-";

  return { type, reportedBy };
};

const isImportedArchiveRecord = (record) =>
  String(record?.remarks || "").trim().toUpperCase() === "IMPORTED" &&
  String(record?.sourceType || "").trim().toLowerCase() !== "workbook";

const isImportedUserRecord = (user) => {
  return (
    String(user?.archived_reason || "").trim().toUpperCase() === "IMPORTED" ||
    String(user?.status || "").trim().toUpperCase() === "IMPORTED"
  );
};

const getArchiveSignatureStatus = (record) => {
  if (record?.signatureImage) return "SIGNED";
  if (isImportedArchiveRecord(record)) return "SIGNED";
  return "No Signature";
};

const Archives = () => {
  const [activeFolder, setActiveFolder] = useState("users");
  const [activeSemester, setActiveSemester] = useState("1ST SEM");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterYear, setFilterYear] = useState("");
  const [sortOrder, setSortOrder] = useState(""); // "asc" for A-Z, "desc" for Z-A
  const [isGlobalSearch, setIsGlobalSearch] = useState(false); // Default to current folder search

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [archivedUsers, setArchivedUsers] = useState([]);
  const [archivedViolations, setArchivedViolations] = useState([]);
  const [allArchivedViolations, setAllArchivedViolations] = useState([]); // For global search
  const [allUnresolvedViolations, setAllUnresolvedViolations] = useState([]); // Global unresolved records
  const [preservedYearSectionByViolationId, setPreservedYearSectionByViolationId] = useState({});
  const [schoolYears, setSchoolYears] = useState([]);
  const [semestersBySchoolYear, setSemestersBySchoolYear] = useState({});
  const [unresolvedSchoolYears, setUnresolvedSchoolYears] = useState([]);
  const [selectedUnresolvedYear, setSelectedUnresolvedYear] = useState("");
  const globalSearchLoadIdRef = useRef(0);

  // Restore preserved year-section mapping from localStorage to prevent lost history during navigation/refresh.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("preservedYearSectionByViolationId");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === "object") {
          setPreservedYearSectionByViolationId(parsed);
        }
      }
    } catch (err) {
      console.warn("Unable to restore preserved year section data", err);
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        "preservedYearSectionByViolationId",
        JSON.stringify(preservedYearSectionByViolationId),
      );
    } catch (err) {
      console.warn("Unable to persist preserved year section data", err);
    }
  }, [preservedYearSectionByViolationId]);

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState(null);
  const [editType, setEditType] = useState("user"); // "user" or "violation"
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [userToRestore, setUserToRestore] = useState(null);
  const [isRestoreLoading, setIsRestoreLoading] = useState(false);
  const [archiveSuccessMessage, setArchiveSuccessMessage] = useState("");

  // Delete archived violation modal states
  const [isDeleteArchivedViolationModalOpen, setIsDeleteArchivedViolationModalOpen] = useState(false);
  const [archivedViolationToDelete, setArchivedViolationToDelete] = useState(null);

  // School year management states
  const [isDeleteSchoolYearModalOpen, setIsDeleteSchoolYearModalOpen] = useState(false);
  const [schoolYearToDelete, setSchoolYearToDelete] = useState(null);
  const [isDeleteSemesterModalOpen, setIsDeleteSemesterModalOpen] = useState(false);
  const [semesterToDelete, setSemesterToDelete] = useState(null);
  const [isRenameSchoolYearModalOpen, setIsRenameSchoolYearModalOpen] = useState(false);
  const [schoolYearToRename, setSchoolYearToRename] = useState(null);
  const [newSchoolYearName, setNewSchoolYearName] = useState("");
  const [isSchoolYearActionLoading, setIsSchoolYearActionLoading] = useState(false);
  const [isSemesterActionLoading, setIsSemesterActionLoading] = useState(false);

  // Download/Export states
  const [downloadModalOpen, setDownloadModalOpen] = useState(false);
  const [downloadFormat, setDownloadFormat] = useState('excel');
  const [downloadAllModalOpen, setDownloadAllModalOpen] = useState(false);
  const [downloadAllFormat, setDownloadAllFormat] = useState('excel');
  const [showDownloadAlertModal, setShowDownloadAlertModal] = useState(false);
  const [downloadAlertMessage, setDownloadAlertMessage] = useState("");

  const loadArchiveSchoolYears = useCallback(async () => {
    try {
      const response = await fetch("/api/archive/school-years", {
        headers: { ...getAuditHeaders() },
      });

      if (!response.ok) {
        console.warn("Failed to load school years:", response.status);
        setSchoolYears([]);
        setSemestersBySchoolYear({});
        return null;
      }

      const data = await response.json();
      if (data.status === "ok" && Array.isArray(data.schoolYears)) {
        setSchoolYears(data.schoolYears || []);
        setSemestersBySchoolYear(data.semestersBySchoolYear || {});
        return data;
      }

      setSchoolYears([]);
      setSemestersBySchoolYear({});
      return null;
    } catch (err) {
      console.error("Error loading school years:", err);
      setSchoolYears([]);
      setSemestersBySchoolYear({});
      return null;
    }
  }, []);

  // Import workbook records states
  const [isImportConfirmModalOpen, setIsImportConfirmModalOpen] = useState(false);
  const [recordToImport, setRecordToImport] = useState(null);
  const [isImporting, setIsImporting] = useState(false);

  // Cleanup and Re-import workbook records states
  const [isCleanupReimportModalOpen, setIsCleanupReimportModalOpen] = useState(false);
  const [isCleanupReimporting, setIsCleanupReimporting] = useState(false);
  const [cleanupSecretKey, setCleanupSecretKey] = useState("");

  // Load archived users on mount
  useEffect(() => {
    const loadArchivedUsers = async () => {
      try {
        setIsLoading(true);
        setError("");
        const response = await fetch("/api/archive/users", {
          headers: { ...getAuditHeaders() },
        });
        const data = await response.json();

        if (response.ok && data.status === "ok") {
          setArchivedUsers(data.archivedUsers || []);
        } else {
          setError(data.message || "Failed to load archived users");
        }
      } catch (err) {
        setError("Failed to load archived users: " + err.message);
      } finally {
        setIsLoading(false);
      }
    };

    loadArchivedUsers();
  }, []);

  // Listen for archive completion events from StudentViolation page
  useEffect(() => {
    const handleArchiveEvent = (event) => {
      console.log("Archive event received, refreshing school years and violations...", event.detail);

      // For resolved archive actions from general archive button, navigate to that archive year/semester.
      // If the source is unresolved, keep the current unresolved view on screen.
      if (event?.detail?.source !== "unresolved" && event?.detail?.schoolYear && event?.detail?.semester) {
        setActiveFolder(event.detail.schoolYear);
        setActiveSemester(event.detail.semester);
        setSelectedUnresolvedYear("");
      }

      // Merge preserved year_section map if provided
      if (event?.detail?.preservedYearSections && typeof event.detail.preservedYearSections === "object") {
        setPreservedYearSectionByViolationId((prev) => ({
          ...prev,
          ...event.detail.preservedYearSections,
        }));
      }

      // Force immediate refresh of school years
      loadArchiveSchoolYears().then((data) => {
        if (
          data?.status === "ok" &&
          Array.isArray(data.schoolYears) &&
          data.schoolYears.length > 0 &&
          activeFolder === "users"
        ) {
          console.log("Auto-selecting first folder:", data.schoolYears[0]);
          setActiveFolder(data.schoolYears[0]);
          setActiveSemester("1ST SEM");
        }
      });
    };

    window.addEventListener("archiveCompleted", handleArchiveEvent);
    return () => {
      window.removeEventListener("archiveCompleted", handleArchiveEvent);
    };
  }, [activeFolder, loadArchiveSchoolYears]);

  const isViolationType = (item, type) => {
    const categoryText = String(item.violationCategory || item.type || "").toLowerCase();
    const degreeText = String(item.violationDegree || item.type || "").toLowerCase();

    const isMinor =
      categoryText.includes("minor") ||
      /first degree|second degree/.test(degreeText);
    const isMajor =
      categoryText.includes("major") ||
      /third degree|fourth degree|fifth degree|sixth degree|seventh degree/.test(degreeText);

    if (type === "Minor Offenses") return isMinor;
    if (type === "Major Offenses") return isMajor;

    return false;
  };

  // Load school years on mount and refresh on meaningful events only.
  useEffect(() => {
    loadArchiveSchoolYears();

    const handleStorageChange = () => {
      loadArchiveSchoolYears();
    };
    const handleWindowFocus = () => {
      loadArchiveSchoolYears();
    };

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("focus", handleWindowFocus);
    
    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, [loadArchiveSchoolYears]);

  // Load unresolved school years for UNRESOLVED folder
  useEffect(() => {
    const loadUnresolvedSchoolYears = async () => {
      if (activeFolder !== "unresolved") {
        return;
      }

      try {
        const response = await fetch("/api/archive/unresolved-school-years", {
          headers: { ...getAuditHeaders() },
        });
        const data = await response.json();

        if (response.ok && data.status === "ok" && Array.isArray(data.schoolYears)) {
          setUnresolvedSchoolYears(data.schoolYears);
        } else {
          setUnresolvedSchoolYears([]);
        }
      } catch (err) {
        console.error("Error loading unresolved school years:", err);
        setUnresolvedSchoolYears([]);
      }
    };

    loadUnresolvedSchoolYears();
  }, [activeFolder]);

  // Load violations when folder or semester changes
  useEffect(() => {
    const loadViolations = async () => {
      if (activeFolder === "users") {
        setArchivedViolations([]);
        return;
      }

      if (activeFolder === "unresolved" && (!selectedUnresolvedYear || selectedUnresolvedYear === "users")) {
        setArchivedViolations([]);
        return;
      }

      try {
        setIsLoading(true);
        setError("");

        const targetYear =
          activeFolder === "unresolved" ? selectedUnresolvedYear : activeFolder;

        console.log(
          `Loading violations for ${activeSemester} S.Y. ${targetYear} (${activeFolder})`,
        );

        const endpoint =
          activeFolder === "unresolved"
            ? `/api/archive/unresolved/${encodeURIComponent(targetYear)}/${encodeURIComponent(activeSemester)}`
            : `/api/archive/violations/${encodeURIComponent(targetYear)}/${encodeURIComponent(activeSemester)}`;

        const response = await fetch(endpoint, {
          headers: { ...getAuditHeaders() },
        });

        const data = await response.json();

        if (response.ok && data.status === "ok") {
          const violations = data.violations || [];
          setArchivedViolations(violations);
          console.log(
            `✓ Loaded ${violations.length} archived violations for ${activeSemester} S.Y. ${targetYear}`,
          );
        } else {
          console.warn("Error loading violations:", data.message);
          setError(data.message || "Failed to load violations");
          setArchivedViolations([]);
        }
      } catch (err) {
        console.error("Error loading violations:", err);
        setError("Failed to load violations: " + err.message);
        setArchivedViolations([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadViolations();
  }, [activeFolder, activeSemester, selectedUnresolvedYear]);

  // Load all violations for global search
  useEffect(() => {
    const loadAllViolations = async () => {
      if (!isGlobalSearch || allArchivedViolations.length > 0) return;
      const loadId = globalSearchLoadIdRef.current + 1;
      globalSearchLoadIdRef.current = loadId;

      try {
        setIsLoading(true);
        console.log("Loading all violations for global search...");

        const allViolations = [];
        const unresolvedAll = [];

        const loadYearViolations = async (year) => {
          const [archived1st, archived2nd, archivedSummer, unresolved1st, unresolved2nd, unresolvedSummer] =
            await Promise.allSettled([
              fetchArchiveViolations(`/api/archive/violations/${encodeURIComponent(year)}/1ST SEM`),
              fetchArchiveViolations(`/api/archive/violations/${encodeURIComponent(year)}/2ND SEM`),
              fetchArchiveViolations(`/api/archive/violations/${encodeURIComponent(year)}/SUMMER`),
              fetchArchiveViolations(`/api/archive/unresolved/${encodeURIComponent(year)}/1ST SEM`),
              fetchArchiveViolations(`/api/archive/unresolved/${encodeURIComponent(year)}/2ND SEM`),
              fetchArchiveViolations(`/api/archive/unresolved/${encodeURIComponent(year)}/SUMMER`),
            ]);

          return {
            archived: [archived1st, archived2nd, archivedSummer].flatMap((result) =>
              result.status === "fulfilled" ? result.value : [],
            ),
            unresolved: [unresolved1st, unresolved2nd, unresolvedSummer].flatMap((result) =>
              result.status === "fulfilled"
                ? result.value.map((violation) => ({ ...violation, isUnresolved: true }))
                : [],
            ),
          };
        };

        const yearResults = await Promise.allSettled(
          schoolYears.map((year) => loadYearViolations(year)),
        );

        if (loadId !== globalSearchLoadIdRef.current) {
          return;
        }

        yearResults.forEach((result) => {
          if (result.status === "fulfilled") {
            allViolations.push(...result.value.archived);
            unresolvedAll.push(...result.value.unresolved);
          }
        });

        const dedupedArchived = dedupeArchiveRows(allViolations);
        const dedupedUnresolved = dedupeArchiveRows(unresolvedAll);

        setAllUnresolvedViolations(dedupedUnresolved);
        setAllArchivedViolations(dedupedArchived);
        console.log(`✓ Loaded ${dedupedArchived.length} total archived violations for global search`);
      } catch (err) {
        console.error("Error loading all violations:", err);
        setAllArchivedViolations([]);
      } finally {
        if (loadId === globalSearchLoadIdRef.current) {
          setIsLoading(false);
        }
      }
    };

    if (isGlobalSearch && schoolYears.length > 0) {
      loadAllViolations();
    }
  }, [isGlobalSearch, schoolYears, allArchivedViolations.length]);

  // Reset unresolved selection when leaving unresolved folder
  useEffect(() => {
    if (activeFolder !== "unresolved") {
      setSelectedUnresolvedYear("");
    }
  }, [activeFolder]);

  // Load archived users when users folder is clicked
  useEffect(() => {
    const loadArchivedUsersData = async () => {
      if (activeFolder !== "users") {
        return;
      }

      try {
        setIsLoading(true);
        setError("");
        console.log("Loading archived users...");
        
        const response = await fetch("/api/archive/users", {
          headers: { ...getAuditHeaders() },
        });
        const data = await response.json();

        if (response.ok && data.status === "ok") {
          setArchivedUsers(data.archivedUsers || []);
          console.log(`✓ Loaded ${(data.archivedUsers || []).length} archived users`);
        } else {
          setError(data.message || "Failed to load archived users");
          console.error("Error loading users:", data.message);
        }
      } catch (err) {
        setError("Failed to load archived users: " + err.message);
        console.error("Error loading users:", err);
      } finally {
        setIsLoading(false);
      }
    };

    loadArchivedUsersData();
  }, [activeFolder]);

  const handleSaveEdit = async (id, updatedRecord) => {
    try {
      if (editType === "user") {
        const response = await fetch(`/api/archive/users/${id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...getAuditHeaders(),
          },
          body: JSON.stringify(updatedRecord),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.status === "error") {
          throw new Error(data.message || "Failed to save archived user changes");
        }

        setArchivedUsers((prev) =>
          prev.map((u) => (u.id === id ? data.user : u)),
        );
        setIsEditOpen(false);
        setSelectedRow(null);
        return data.user;
      }

      if (editType === "violation") {
        const response = await fetch(`/api/archive/violations/${id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...getAuditHeaders(),
          },
          body: JSON.stringify(updatedRecord),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.status === "error") {
          throw new Error(data.message || "Failed to save archived violation changes");
        }

        const updatedViolation = data.violation || {};
        const movedOutOfCurrentView =
          activeFolder !== "users" &&
          ((activeFolder !== "unresolved" &&
            updatedViolation.school_year &&
            updatedViolation.semester &&
            (String(updatedViolation.school_year) !== String(activeFolder) ||
              String(updatedViolation.semester) !== String(activeSemester))) ||
            (activeFolder === "unresolved" &&
              updatedViolation.school_year &&
              updatedViolation.semester &&
              (String(updatedViolation.school_year) !== String(selectedUnresolvedYear || "") ||
                String(updatedViolation.semester) !== String(activeSemester))));

        if (movedOutOfCurrentView) {
          setArchivedViolations((prev) => prev.filter((v) => v.id !== id));
        } else {
          setArchivedViolations((prev) =>
            prev.map((v) =>
              v.id === id
                ? {
                    ...v,
                    ...updatedViolation,
                  }
                : v,
            ),
          );
        }

        // Invalidate global caches so next global search reflects DB edits.
        setAllArchivedViolations([]);
        setAllUnresolvedViolations([]);

        setIsEditOpen(false);
        setSelectedRow(null);
        return data.violation;
      }

      throw new Error("Unsupported edit type");
    } catch (err) {
      const message = "Error saving edit: " + err.message;
      setError(message);
      throw new Error(err.message || "Failed to save changes");
    }
  };

  const handleRestoreConfirm = async () => {
    if (!userToRestore || isRestoreLoading) return;

    try {
      setIsRestoreLoading(true);
      const response = await fetch(`/api/archive/users/${userToRestore.id}/restore`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...getAuditHeaders(),
        },
      });

      const data = await response.json();
      if (response.ok && data.status === "ok") {
        setArchivedUsers((prev) => prev.filter((u) => u.id !== userToRestore.id));
        setIsRestoreModalOpen(false);
        setUserToRestore(null);
        setError("");
      } else {
        setError(data.message || "Failed to restore user");
      }
    } catch (err) {
      setError("Error restoring user: " + err.message);
    } finally {
      setIsRestoreLoading(false);
    }
  };

  const handleRestoreClick = (user) => {
    setUserToRestore(user);
    setIsRestoreModalOpen(true);
  };

  // School year management handlers
  const handleDeleteSchoolYear = async () => {
    if (!schoolYearToDelete) return;

    try {
      setIsSchoolYearActionLoading(true);
      const response = await fetch(`/api/archive/school-years/${schoolYearToDelete}`, {
        method: "DELETE",
        headers: { ...getAuditHeaders() },
      });

      if (response.ok) {
        await response.json();
        const data = await loadArchiveSchoolYears();
        // If the deleted year was active, switch to users folder
        if (
          activeFolder === schoolYearToDelete &&
          !data?.schoolYears?.includes(schoolYearToDelete)
        ) {
          setActiveFolder("users");
          setActiveSemester("1ST SEM");
        }
        setIsDeleteSchoolYearModalOpen(false);
        setSchoolYearToDelete(null);
        setError(""); // Clear any previous errors
        // Trigger archive completion event to refresh other components
        window.dispatchEvent(new CustomEvent("archiveCompleted"));
      } else {
        const data = await response.json();
        setError(data.message || "Failed to delete school year");
      }
    } catch (err) {
      setError("Error deleting school year: " + err.message);
    } finally {
      setIsSchoolYearActionLoading(false);
    }
  };

  const handleDeleteSemester = async () => {
    if (!semesterToDelete?.schoolYear || !semesterToDelete?.semester) return;

    try {
      setIsSemesterActionLoading(true);
      const response = await fetch(
        `/api/archive/semesters/${encodeURIComponent(semesterToDelete.schoolYear)}/${encodeURIComponent(semesterToDelete.semester)}`,
        {
          method: "DELETE",
          headers: { ...getAuditHeaders() },
        },
      );

      if (response.ok) {
        const data = await response.json();
        const refreshed = await loadArchiveSchoolYears();
        const remainingSemesters = refreshed?.semestersBySchoolYear?.[semesterToDelete.schoolYear] || [];

        if (
          activeFolder === semesterToDelete.schoolYear &&
          activeSemester === semesterToDelete.semester
        ) {
          if (remainingSemesters.length > 0) {
            setActiveSemester(remainingSemesters[0]);
          } else {
            setActiveFolder("users");
            setActiveSemester("1ST SEM");
          }
        }

        setIsDeleteSemesterModalOpen(false);
        setSemesterToDelete(null);
        setError("");
        setArchiveSuccessMessage(
          data.message || `Deleted ${semesterToDelete.semester} for S.Y. ${semesterToDelete.schoolYear}.`,
        );
        setTimeout(() => setArchiveSuccessMessage(""), 5000);
        window.dispatchEvent(new CustomEvent("archiveCompleted"));
      } else {
        const data = await response.json();
        setError(data.message || "Failed to delete semester");
      }
    } catch (err) {
      setError("Error deleting semester: " + err.message);
    } finally {
      setIsSemesterActionLoading(false);
    }
  };

  const handleRenameSchoolYear = async () => {
    if (!schoolYearToRename || !newSchoolYearName.trim()) return;

    try {
      setIsSchoolYearActionLoading(true);
      const response = await fetch(`/api/archive/school-years/${schoolYearToRename}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...getAuditHeaders(),
        },
        body: JSON.stringify({ newSchoolYear: newSchoolYearName.trim() }),
      });

      if (response.ok) {
        const data = await response.json();
        // Update the school year in the list
        setSchoolYears((prev) => prev.map((year) =>
          year === schoolYearToRename ? newSchoolYearName.trim() : year
        ));
        // If the renamed year was active, update the active folder
        if (activeFolder === schoolYearToRename) {
          setActiveFolder(newSchoolYearName.trim());
        }
        setIsRenameSchoolYearModalOpen(false);
        setSchoolYearToRename(null);
        setNewSchoolYearName("");
        setError(""); // Clear any previous errors
        // Trigger archive completion event to refresh other components
        window.dispatchEvent(new CustomEvent("archiveCompleted"));
      } else {
        const data = await response.json();
        setError(data.message || "Failed to rename school year");
      }
    } catch (err) {
      setError("Error renaming school year: " + err.message);
    } finally {
      setIsSchoolYearActionLoading(false);
    }
  };

  const handleDeleteSchoolYearClick = (schoolYear) => {
    setSchoolYearToDelete(schoolYear);
    setIsDeleteSchoolYearModalOpen(true);
  };

  const handleRenameSchoolYearClick = (schoolYear) => {
    setSchoolYearToRename(schoolYear);
    setNewSchoolYearName(schoolYear);
    setIsRenameSchoolYearModalOpen(true);
  };

  const handleDeleteSemesterClick = (schoolYear, semester) => {
    setSemesterToDelete({ schoolYear, semester });
    setIsDeleteSemesterModalOpen(true);
  };

  // Get all folders (USERS + UNRESOLVED + School Years)
  const folders = useMemo(
    () => [
      { key: "users", label: "USERS" },
      { key: "unresolved", label: "UNRESOLVED" },
      ...schoolYears.map((year) => ({
        key: year,
        label: `S.Y. ${year}`,
      })),
    ],
    [schoolYears],
  );

// Prepare data based on active folder or global search
  const displayData = useMemo(() => {
    if (!isGlobalSearch) {
      // Current folder-only search
      if (activeFolder === "users") {
        return archivedUsers
          .filter((user) => !user.is_unresolved_archive && !isImportedUserRecord(user))
          .map((user) => {
          const normalizedName = splitMiddleInitialFromFirstName(
            user.first_name,
            user.middle_initial,
          );
          const formattedFullName = formatDisplayName(
            normalizedName.firstName,
            user.last_name,
            user.full_name,
            normalizedName.middleInitial,
          );

          return {
          id: user.id,
          no: "",
          full_name: formattedFullName,
          firstName: normalizedName.firstName || "",
          middleInitial: normalizedName.middleInitial || "",
          lastName: user.last_name || "",
          name: (
            <div>
              <div className="font-semibold">{formattedFullName}</div>
              <div className="text-xs text-gray-400">{user.school_id}</div>
            </div>
          ),
          school_id: user.school_id || user.schoolId || '',
          email: user.email,
          program: user.program,
          yearSection: user.year_section,
          status: user.status,
          archivedReason: user.archived_reason,
          statusDisplay: user.archived_reason ? (
            <span className="text-red-500 font-medium">{user.archived_reason}</span>
          ) : user.status === "Graduated" ? (
            <span className="text-green-700 font-medium">Graduated</span>
          ) : (
            user.status
          ),
          violationCount: user.violation_count,
          archivedDate: formatDate(user.archived_at),
          folder: "USERS",
          folderKey: "users",
          recordType: "user",
          sourceType: "archive",
          sourceImportKey: "",
          searchableText: `${formattedFullName || ""} ${user.school_id || ""} ${user.email || ""} ${user.program || ""} ${user.year_section || ""} ${user.status || ""} ${user.archived_reason || ""}`.toLowerCase(),
          };
        });
      } else if (activeFolder === "unresolved" && selectedUnresolvedYear === "users") {
        // Unresolved archived users
        return archivedUsers
          .filter((user) => user.is_unresolved_archive)
          .map((user) => {
            const normalizedName = splitMiddleInitialFromFirstName(
              user.first_name,
              user.middle_initial,
            );
            const formattedFullName = formatDisplayName(
              normalizedName.firstName,
              user.last_name,
              user.full_name,
              normalizedName.middleInitial,
            );

            return {
            id: user.id,
            no: "",
            full_name: formattedFullName,
            firstName: normalizedName.firstName || "",
            middleInitial: normalizedName.middleInitial || "",
            lastName: user.last_name || "",
            name: (
              <div>
                <div className="font-semibold">{formattedFullName}</div>
                <div className="text-xs text-gray-400">{user.school_id}</div>
              </div>
            ),
            school_id: user.school_id || user.schoolId || '',
            email: user.email,
            program: user.program,
            yearSection: user.year_section,
            status: user.status,
            archivedReason: user.archived_reason,
            statusDisplay: user.archived_reason ? (
              <span className="text-red-500 font-medium">{user.archived_reason}</span>
            ) : user.status === "Graduated" ? (
              <span className="text-green-700 font-medium">Graduated</span>
            ) : (
              user.status
            ),
            violationCount: user.violation_count,
            archivedDate: formatDate(user.archived_at),
            folder: "UNRESOLVED/USERS",
            folderKey: "unresolved-users",
            recordType: "user",
            sourceType: "archive",
            sourceImportKey: "",
            searchableText: `${formattedFullName || ""} ${user.school_id || ""} ${user.email || ""} ${user.program || ""} ${user.year_section || ""} ${user.status || ""} ${user.archived_reason || ""}`.toLowerCase(),
            };
          });
      } else {
        return dedupeArchiveRows(archivedViolations.map((violation) => {
          const preservedYearSection =
            preservedYearSectionByViolationId[violation.id] || violation.year_section;
          const combinedYearSection = formatProgramYearSection(
            violation.program,
            preservedYearSection,
          );
          const formattedStudentName = formatDisplayName(
            violation.first_name,
            violation.last_name,
            violation.student_name,
            violation.middle_initial,
          );
          const { type, reportedBy } = buildViolationTypeAndReporter(violation);

          return {
            id: violation.id,
            no: "",
            studentName: (
              <div>
                <div className="font-semibold">{formattedStudentName}</div>
                <div className="text-xs text-gray-400">{violation.school_id}</div>
              </div>
            ),
            middle_initial: violation.middle_initial || "",
            yearSection: combinedYearSection,
            program: violation.program || '',
            violation: violation.violation_label,
            type,
            violationCategory: violation.violation_category || "",
            violationDegree: violation.violation_degree || "",
            reportedBy,
            remarks: violation.remarks || "-",
            signature: getArchiveSignatureStatus({
              signatureImage: violation.signature_image,
              remarks: violation.remarks,
              sourceType: violation.sourceType || (violation.isHistoricalWorkbook ? "workbook" : "archive"),
            }),
            signatureImage: violation.signature_image,
            date: formatDate(getArchiveViolationDisplayDate(violation)),
            archivedAt: violation.archived_at,
            originalCreatedAt: getArchiveViolationDisplayDate(violation),
            semester: violation.semester || activeSemester,
            schoolYear:
              violation.school_year ||
              (activeFolder === "unresolved"
                ? selectedUnresolvedYear || ""
                : activeFolder),
            violationId: violation.id,
            folder: activeFolder === "unresolved" ? `UNRESOLVED` : `S.Y. ${activeFolder}`,
            folderKey:
              activeFolder === "unresolved"
                ? `unresolved-${selectedUnresolvedYear || violation.school_year || ""}`
                : activeFolder,
            status: activeFolder === "unresolved" ? "Unresolved" : "Archived",
            recordType: "violation",
            sourceType: violation.sourceType || (violation.isHistoricalWorkbook ? "workbook" : "archive"),
            isHistoricalWorkbook: Boolean(violation.isHistoricalWorkbook),
            sourceImportKey: violation.source_import_key || violation.sourceImportKey || "",
            searchableText: `${formattedStudentName || ""} ${violation.school_id || ""} ${combinedYearSection || preservedYearSection || violation.year_section || ""} ${violation.violation_label || ""} ${violation.violation_category || ""} ${violation.violation_degree || ""} ${reportedBy || ""} ${violation.remarks || ""}`.toLowerCase(),
          };
        }));
      }
    } else {
      // Global search - combine all data only if loaded
      const allData = [];

      // Add users from USERS folder, only real entries
      archivedUsers.forEach((user) => {
        const normalizedName = splitMiddleInitialFromFirstName(
          user.first_name,
          user.middle_initial,
        );
        const formattedFullName = formatDisplayName(
          normalizedName.firstName,
          user.last_name,
          user.full_name,
          normalizedName.middleInitial,
        );
        const hasUser =
          (formattedFullName && formattedFullName.trim() && formattedFullName !== "-") ||
          (user.school_id && user.school_id.trim()) ||
          (user.email && user.email.trim());
        if (!hasUser) return;

        allData.push({
          id: user.id,
          no: "",
          full_name: formattedFullName,
          firstName: normalizedName.firstName || "",
          middleInitial: normalizedName.middleInitial || "",
          lastName: user.last_name || "",
          name: (
            <div>
              <div className="font-semibold">{formattedFullName}</div>
              <div className="text-xs text-gray-400">{user.school_id}</div>
            </div>
          ),
          school_id: user.school_id || user.schoolId || '',
          email: user.email,
          program: user.program,
          yearSection: user.year_section,
          status: user.status,
          archivedReason: user.archived_reason,
          statusDisplay: user.archived_reason ? (
            <span className="text-red-500 font-medium">{user.archived_reason}</span>
          ) : user.status === "Graduated" ? (
            <span className="text-green-700 font-medium">Graduated</span>
          ) : (
            user.status
          ),
          violationCount: user.violation_count,
          archivedDate: formatDate(user.archived_at),
          folder: "USERS",
          folderKey: "users",
          recordType: "user",
          sourceType: "archive",
          sourceImportKey: "",
          // Add searchable text for global search
          searchableText: `${formattedFullName || ""} ${user.school_id || ""} ${user.email || ""} ${user.program || ""} ${user.year_section || ""} ${user.status || ""} ${user.archived_reason || ""}`.toLowerCase(),
        });
      });

      // Add violations from all school years only if data is loaded
      if (allArchivedViolations.length > 0) {
        allArchivedViolations.forEach((violation) => {
          const formattedStudentName = formatDisplayName(
            violation.first_name,
            violation.last_name,
            violation.student_name,
            violation.middle_initial,
          );
          const { type, reportedBy } = buildViolationTypeAndReporter(violation);
          const hasViolation =
            (formattedStudentName && formattedStudentName.trim() && formattedStudentName !== "-") ||
            (violation.school_id && violation.school_id.trim());
          if (!hasViolation) return;

          allData.push({
            id: violation.id,
            no: "",
            studentName: (
              <div>
                <div className="font-semibold">{formattedStudentName}</div>
                <div className="text-xs text-gray-400">{violation.school_id}</div>
              </div>
            ),
            middle_initial: violation.middle_initial || "",
            yearSection: formatProgramYearSection(violation.program, violation.year_section),
            program: violation.program || '',
            violation: violation.violation_label,
            type,
            violationCategory: violation.violation_category || "",
            violationDegree: violation.violation_degree || "",
            reportedBy,
            remarks: violation.remarks || "-",
            signature: getArchiveSignatureStatus({
              signatureImage: violation.signature_image,
              remarks: violation.remarks,
              sourceType: violation.sourceType || (violation.isHistoricalWorkbook ? "workbook" : "archive"),
            }),
            signatureImage: violation.signature_image,
            date: formatDate(getArchiveViolationDisplayDate(violation)),
            archivedAt: violation.archived_at,
            originalCreatedAt: getArchiveViolationDisplayDate(violation),
            semester: violation.semester || "",
            schoolYear: violation.school_year || "",
            violationId: violation.id,
            folder: `S.Y. ${violation.school_year}`,
            folderKey: violation.school_year,
            recordType: "violation",
            sourceType: violation.sourceType || (violation.isHistoricalWorkbook ? "workbook" : "archive"),
            isHistoricalWorkbook: Boolean(violation.isHistoricalWorkbook),
            sourceImportKey: violation.source_import_key || violation.sourceImportKey || "",
            // Add searchable text for global search
            searchableText: `${formattedStudentName || ""} ${violation.school_id || ""} ${formatProgramYearSection(violation.program, violation.year_section) || ""} ${violation.violation_label || ""} ${violation.violation_category || ""} ${violation.violation_degree || ""} ${reportedBy || ""} ${violation.remarks || ""}`.toLowerCase(),
          });
        });
      }

      // Add unresolved violations in global search
      if (allUnresolvedViolations.length > 0) {
        allUnresolvedViolations.forEach((violation) => {
          const formattedStudentName = formatDisplayName(
            violation.first_name,
            violation.last_name,
            violation.student_name,
            violation.middle_initial,
          );
          const { type, reportedBy } = buildViolationTypeAndReporter(violation);
          const hasViolation =
            (formattedStudentName && formattedStudentName.trim() && formattedStudentName !== "-") ||
            (violation.school_id && violation.school_id.trim());
          if (!hasViolation) return;

          allData.push({
            id: violation.id,
            no: "",
            studentName: (
              <div>
                <div className="font-semibold">{formattedStudentName}</div>
                <div className="text-xs text-gray-400">{violation.school_id}</div>
              </div>
            ),
            middle_initial: violation.middle_initial || "",
            yearSection: formatProgramYearSection(violation.program, violation.year_section),
            program: violation.program || '',
            violation: violation.violation_label,
            type,
            violationCategory: violation.violation_category || "",
            violationDegree: violation.violation_degree || "",
            reportedBy,
            remarks: violation.remarks || "-",
            signature: getArchiveSignatureStatus({
              signatureImage: violation.signature_image,
              remarks: violation.remarks,
              sourceType: violation.sourceType || (violation.isHistoricalWorkbook ? "workbook" : "archive"),
            }),
            signatureImage: violation.signature_image,
            date: formatDate(getArchiveViolationDisplayDate(violation)),
            archivedAt: violation.archived_at,
            originalCreatedAt: getArchiveViolationDisplayDate(violation),
            semester: violation.semester || "",
            schoolYear: violation.school_year || "",
            violationId: violation.id,
            folder: `UNRESOLVED S.Y. ${violation.school_year}`,
            folderKey: `unresolved-${violation.school_year}`,
            subFolderKey: violation.school_year,
            recordType: "violation",
            sourceType: violation.sourceType || (violation.isHistoricalWorkbook ? "workbook" : "archive"),
            isHistoricalWorkbook: Boolean(violation.isHistoricalWorkbook),
            isUnresolved: true,
            sourceImportKey: violation.source_import_key || violation.sourceImportKey || "",
            // Add searchable text for global search
            searchableText: `${formattedStudentName || ""} ${violation.school_id || ""} ${formatProgramYearSection(violation.program, violation.year_section) || ""} ${violation.violation_label || ""} ${violation.violation_category || ""} ${violation.violation_degree || ""} ${reportedBy || ""} ${violation.remarks || ""}`.toLowerCase(),
          });
        });
      }

      return dedupeArchiveRows(allData);
    }
  }, [activeFolder, archivedUsers, archivedViolations, allArchivedViolations, isGlobalSearch, selectedUnresolvedYear]);

  // Filter function
  const filteredData = useMemo(() => {
    if (isGlobalSearch) {
      if (!searchQuery.trim()) {
        return [];
      }
    }

    const query = searchQuery.toLowerCase();

    if (!isGlobalSearch) {
      // Current folder-only search
      let filtered = displayData.filter((item) => {
        const fullText = (item.searchableText || "").toLowerCase();
        if (query && !fullText.includes(query)) {
          return false;
        }

        if (filterType && item.recordType === "violation") {
          if (!isViolationType(item, filterType)) {
            return false;
          }
        }

        if (filterYear && item.yearSection) {
          const yearSectionStr = String(item.yearSection).toLowerCase();
          const yearPattern = new RegExp(`(^|[^0-9])${filterYear}(?:st|nd|rd|th)?[a-z]?`, 'i');
          if (!yearPattern.test(yearSectionStr)) {
            return false;
          }
        }

        return true;
      });

      // Apply sorting
      if (sortOrder) {
        filtered = [...filtered].sort((a, b) => {
          const nameA = (a.studentName?.props?.children?.[0]?.props?.children || a.full_name || "").toLowerCase();
          const nameB = (b.studentName?.props?.children?.[0]?.props?.children || b.full_name || "").toLowerCase();
          
          if (sortOrder === "asc") {
            return nameA.localeCompare(nameB);
          } else if (sortOrder === "desc") {
            return nameB.localeCompare(nameA);
          }
          return 0;
        });
      }

      return filtered.map((item, index) => ({
        ...item,
        no: index + 1,
      }));
    } else {
      // Global search - only proceed if we have data
      if (displayData.length === 0) {
        return [];
      }

      // Global search - search across folders and records
      const matchingFolders = new Set();
      const matchingRecords = [];

      // Check folder names (including unresolved subfolder suggestions)
      const allSearchFolders = [
        ...folders,
        ...unresolvedSchoolYears.map((year) => ({
          key: `unresolved-${year}`,
          label: `UNRESOLVED S.Y. ${year}`,
        })),
      ];

      allSearchFolders.forEach((folder) => {
        if (folder.label.toLowerCase().includes(query)) {
          matchingFolders.add(folder.key);
        }
      });

      // Check records
      displayData.forEach((item) => {
        if (item.searchableText && item.searchableText.includes(query)) {
          matchingRecords.push(item);
          matchingFolders.add(item.folderKey);
        }
      });

      // Combine results: folders with their records
      const results = [];

      // First, add folders that match the search
      allSearchFolders.forEach((folder) => {
        if (matchingFolders.has(folder.key)) {
          // Add folder header
          results.push({
            id: `folder-${folder.key}`,
            isFolder: true,
            folderName: folder.label,
            folderKey: folder.key,
            no: "",
          });

          // Add matching records from this folder
          const folderRecords = matchingRecords.filter((record) => record.folderKey === folder.key);
          folderRecords.forEach((record) => {
            results.push({
              ...record,
              no: "",
            });
          });
        }
      });

      return results;
    }
  }, [displayData, searchQuery, filterType, filterYear, sortOrder, isGlobalSearch, folders]);

  const tableRowClassName = (row) => {
    if (isGlobalSearch) {
      if (row?.isFolder) {
        return "bg-[#F4F7FB] hover:bg-[#EEF3FA]";
      }

      if (row?.isUnresolved) {
        return "bg-[#FFF8F8] hover:bg-[#FFF1F1]";
      }

      return "bg-white hover:bg-[#F8FAFC]";
    }

    if (row?.isFolder) {
      return "bg-slate-50/80 hover:bg-slate-100/80";
    }

    if (row?.recordType === "user") {
      return "bg-white hover:bg-slate-50/70";
    }

    if (row?.isUnresolved) {
      return "bg-rose-50/70 hover:bg-rose-100/70";
    }

    return "bg-white hover:bg-slate-50/70";
  };

  // Define columns based on active folder and search mode
  const columns = useMemo(() => {
    if (isGlobalSearch && searchQuery) {
      // Global search columns
      return [
        {
          key: "folderName",
          label: "Results",
          render: (value, row) => {
            if (row.isFolder) {
              return (
                <div className="flex items-center gap-3 py-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#23262B] text-[#A3AED0] shadow-sm">
                    <Folder className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold uppercase tracking-wide text-[#64748B]">
                      Folder
                    </div>
                    <div className="truncate text-[15px] font-bold text-[#0F172A]">
                      {row.folderName}
                    </div>
                  </div>
                </div>
              );
            }

            const isUser = row.recordType === "user";
            const name = isUser ? row.full_name : getPlainText(row.studentName);
            const supportingText = isUser ? row.email : row.violation || "No violation label";
            const Icon = isUser ? UserRound : ShieldAlert;

            return (
              <div className="flex min-w-0 items-start gap-3 py-3 pl-4">
                <div
                  className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                    row.isUnresolved
                      ? "bg-red-50 text-red-600 ring-1 ring-red-100"
                      : isUser
                        ? "bg-[#E8EDF8] text-[#334155] ring-1 ring-[#CBD5E1]"
                        : "bg-blue-50 text-blue-700 ring-1 ring-blue-100"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[15px] font-bold text-[#111827]">
                      {name || "Unnamed record"}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                        isUser
                          ? "bg-[#EEF2FF] text-[#475569]"
                          : row.isUnresolved
                            ? "bg-red-100 text-red-700"
                            : "bg-sky-100 text-sky-700"
                      }`}
                    >
                      {isUser ? "Archived User" : row.isUnresolved ? "Unresolved" : "Violation"}
                    </span>
                  </div>
                  <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[13px] text-[#475569]">
                    {isUser ? (
                      <Mail className="h-3.5 w-3.5 shrink-0 text-[#94A3B8]" />
                    ) : (
                      <FileText className="h-3.5 w-3.5 shrink-0 text-[#94A3B8]" />
                    )}
                    <span className="truncate">{supportingText || "-"}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-md bg-[#F1F5F9] px-2 py-1 text-[11px] font-medium text-[#475569]">
                      <Archive className="h-3 w-3" />
                      {row.folder || row.folderName || "Archive"}
                    </span>
                    {row.sourceType && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-[#F8FAFC] px-2 py-1 text-[11px] font-medium text-[#64748B] ring-1 ring-[#E2E8F0]">
                        <Database className="h-3 w-3" />
                        {row.sourceType === "workbook" ? "Workbook" : "Database"}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          },
        },
        {
          key: "details",
          label: "Details",
          render: (value, row) => {
            if (row.isFolder) {
              return (
                <div className="text-[13px] text-[#64748B]">
                  Matching records are grouped below this archive folder.
                </div>
              );
            }

            const detailItems = row.recordType === "user"
              ? [
                  { label: "Program", value: row.program || "-", icon: GraduationCap },
                  { label: "Student ID", value: row.school_id || "-", icon: IdCard },
                  { label: "Status", value: row.statusDisplay || row.status || "-", icon: Check },
                ]
              : [
                  { label: "Type", value: row.type || "-", icon: Tag },
                  { label: "Date", value: row.date || "-", icon: CalendarClock },
                  { label: "Section", value: row.yearSection || "-", icon: GraduationCap },
                ];

            return (
              <div className="grid min-w-[360px] grid-cols-1 gap-2 py-3 lg:grid-cols-3">
                {detailItems.map(({ label, value, icon: Icon }) => (
                  <div
                    key={label}
                    className="flex min-w-0 items-start gap-2 rounded-lg bg-[#F8FAFC] px-3 py-2 ring-1 ring-[#E2E8F0]"
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#64748B]" />
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-[#94A3B8]">
                        {label}
                      </div>
                      <div className="truncate text-[13px] font-semibold text-[#0F172A]">
                        {value}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            );
          },
        },
        {
          key: "actions",
          label: "",
          align: "center",
          render: (_value, row) => {
            if (row.isFolder) {
              return (
                <Button
                  size="sm"
                  variant="secondary"
                  className="gap-2 bg-[#23262B] text-white hover:bg-[#3D4654] border border-[#A3AED0]/30"
                  onClick={(event) => {
                    event.stopPropagation();
                    setActiveFolder(row.folderKey);
                    setIsGlobalSearch(false);
                    setSearchQuery("");
                  }}
                >
                  <ArrowUpRight className="w-4 h-4" />
                  Open Folder
                </Button>
              );
            }

            // Record actions
            if (row.recordType === "user") {
              return (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="inline-flex items-center justify-center rounded-lg p-2 hover:bg-[#E2E8F0] transition-colors"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <MoreVertical className="w-5 h-5 text-[#64748B]" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-white/95 border-white/20 text-gray-800">
                    <DropdownMenuItem onClick={() => handleEdit(row, "user")} className="gap-2 cursor-pointer text-gray-900 hover:bg-gray-200 hover:text-gray-900 focus:bg-gray-200 focus:text-gray-900">
                      <Edit className="w-4 h-4" />
                      <span>Edit</span>
                    </DropdownMenuItem>
                    {row.status !== "Graduated" && (
                      <DropdownMenuItem onClick={() => handleRestoreClick(row)} className="gap-2 cursor-pointer text-green-700 hover:bg-green-100 hover:text-green-800 focus:bg-green-100 focus:text-green-800">
                        <RotateCcw className="w-4 h-4" />
                        <span>Restore</span>
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            } else {
              const isWorkbookRecord = Boolean(row.isHistoricalWorkbook || row.sourceType === "workbook");
              return (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="inline-flex items-center justify-center rounded-lg p-2 hover:bg-[#E2E8F0] transition-colors"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <MoreVertical className="w-5 h-5 text-[#64748B]" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-white/95 border-white/20 text-gray-800">
                    {isWorkbookRecord ? (
                      <DropdownMenuItem onClick={() => handleImportClick(row)} className="gap-2 cursor-pointer text-blue-600 hover:bg-blue-100 hover:text-blue-700 focus:bg-blue-100 focus:text-blue-700">
                        <Upload className="w-4 h-4" />
                        <span>Import to Database</span>
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onClick={() => handleEdit(row, "violation")} className="gap-2 cursor-pointer text-gray-900 hover:bg-gray-200 hover:text-gray-900 focus:bg-gray-200 focus:text-gray-900">
                        <Edit className="w-4 h-4" />
                        <span>Edit</span>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => handleDeleteArchivedViolation(row)} className="gap-2 cursor-pointer text-red-700 hover:bg-red-100 hover:text-red-800 focus:bg-red-100 focus:text-red-800">
                      <Trash2 className="w-4 h-4" />
                      <span>Delete</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            }
          },
        },
      ];
    } else {
      // Regular folder view columns
      if (activeFolder === "users" || (activeFolder === "unresolved" && selectedUnresolvedYear === "users")) {
        return [
          {
            key: "no",
            label: "No",
            width: "w-10",
            render: (value) => <span>{value}</span>,
          },
          {
            key: "name",
            label: "Full Name",
            render: (value) => value,
          },
          {
            key: "email",
            label: "Email",
          },
          {
            key: "program",
            label: "Program",
          },
          {
            key: "yearSection",
            label: "Program-Year/Section",
          },
          {
            key: "status",
            label: "Status",
            render: (value, row) => row.statusDisplay || value,
          },
          {
            key: "violationCount",
            label: "Violation Count",
          },
          {
            key: "archivedDate",
            label: "Archived Date",
          },
          {
            key: "actions",
            label: "",
            align: "center",
            render: (_value, row) => (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="inline-flex items-center justify-center rounded-md p-1 hover:bg-[#3D4654] transition-colors">
                    <MoreVertical className="w-5 h-5 text-[#A3AED0]" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-white/95 border-white/20 text-gray-800">
                  <DropdownMenuItem onClick={() => handleEdit(row, "user")} className="gap-2 cursor-pointer text-gray-900 hover:bg-gray-200 hover:text-gray-900 focus:bg-gray-200 focus:text-gray-900">
                    <Edit className="w-4 h-4" />
                    <span>Edit</span>
                  </DropdownMenuItem>
                  {row.status !== "Graduated" && (
                    <DropdownMenuItem onClick={() => handleRestoreClick(row)} className="gap-2 cursor-pointer text-green-700 hover:bg-green-100 hover:text-green-800 focus:bg-green-100 focus:text-green-800">
                      <RotateCcw className="w-4 h-4" />
                      <span>Restore</span>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            ),
          },
        ];
      }

      if (activeFolder === "unresolved") {
        return [
          {
            key: "no",
            label: "No",
            width: "w-10",
            render: (value) => <span>{value}</span>,
          },
          {
            key: "date",
            label: "Date",
            render: (value) => value,
          },
          {
            key: "studentName",
            label: "Student Name",
            render: (value) => value,
          },
          {
            key: "yearSection",
            label: "Year/Section",
          },
          {
            key: "violation",
            label: "Violation",
          },
          {
            key: "type",
            label: "Type",
          },
          {
            key: "reportedBy",
            label: "Reported by",
          },
          {
            key: "remarks",
            label: "Remarks",
          },
          {
            key: "signature",
            label: "Signature",
            render: (_value, row) =>
              row.signatureImage ? (
                <div className="flex items-center gap-2">
                  <img
                    src={row.signatureImage}
                    alt="Signature"
                  className="h-8 w-24 object-contain bg-white rounded border border-gray-200"
                />
              </div>
              ) : row.signature === "SIGNED" ? (
                <span className="font-semibold text-green-300">SIGNED</span>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  className="px-3 py-1 h-7 text-xs gap-1"
                >
                  Attach
                </Button>
              ),
          },
          {
            key: "status",
            label: "Status",
            render: (_value, row) => (
              <Button
                size="sm"
                variant="secondary"
                className="bg-[#A3AED0] text-white px-3 py-1 gap-2 flex items-center"
                onClick={() => handleClearUnresolved(row)}
              >
                <Check className="w-4 h-4" />
                <span className="font-semibold">Clear</span>
              </Button>
            ),
          },
          {
            key: "actions",
            label: "",
            align: "center",
            render: (_value, row) => {
              const isWorkbookRecord = Boolean(row.isHistoricalWorkbook || row.sourceType === "workbook");
              return (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="inline-flex items-center justify-center rounded-md p-1 hover:bg-[#3D4654] transition-colors">
                      <MoreVertical className="w-5 h-5 text-[#A3AED0]" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-white/95 border-white/20 text-gray-800">
                    {isWorkbookRecord ? (
                      <DropdownMenuItem onClick={() => handleImportClick(row)} className="gap-2 cursor-pointer text-blue-600 hover:bg-blue-100 hover:text-blue-700 focus:bg-blue-100 focus:text-blue-700">
                        <Upload className="w-4 h-4" />
                        <span>Import to Database</span>
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onClick={() => handleEdit(row, "violation")} className="gap-2 cursor-pointer text-gray-900 hover:bg-gray-200 hover:text-gray-900 focus:bg-gray-200 focus:text-gray-900">
                        <Edit className="w-4 h-4" />
                        <span>Edit</span>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => handleDeleteArchivedViolation(row)} className="gap-2 cursor-pointer text-red-700 hover:bg-red-100 hover:text-red-800 focus:bg-red-100 focus:text-red-800">
                      <Trash2 className="w-4 h-4" />
                      <span>Delete</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            },
          },
        ];
      }

      // Default archive table columns
      return [
        {
          key: "no",
          label: "No",
          width: "w-10",
          render: (value) => <span>{value}</span>,
        },
        {
          key: "date",
          label: "Date",
          render: (value) => value,
        },
        {
          key: "studentName",
          label: "Student Name",
          render: (value) => value,
        },
        {
          key: "yearSection",
          label: "Program-Year/Section",
        },
        {
          key: "violation",
          label: "Violation",
        },
        {
          key: "type",
          label: "Type",
        },
        {
          key: "reportedBy",
          label: "Reported by",
        },
        {
          key: "remarks",
          label: "Remarks",
        },
        {
          key: "signature",
          label: "Signature",
          render: (_value, row) =>
            row.signatureImage ? (
              <div className="flex items-center gap-2">
                <img
                  src={row.signatureImage}
                  alt="Signature"
                  className="h-8 w-24 object-contain bg-white rounded border border-gray-200"
                />
              </div>
            ) : row.signature === "SIGNED" ? (
              <span className="font-semibold text-green-300">SIGNED</span>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                className="px-3 py-1 h-7 text-xs gap-1"
              >
                Attach
              </Button>
            ),
        },
        {
          key: "actions",
          label: "",
          align: "center",
          render: (_value, row) => {
            const isWorkbookRecord = Boolean(row.isHistoricalWorkbook || row.sourceType === "workbook");
            return (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="inline-flex items-center justify-center rounded-md p-1 hover:bg-[#3D4654] transition-colors">
                    <MoreVertical className="w-5 h-5 text-[#A3AED0]" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-white/95 border-white/20 text-gray-800">
                  {isWorkbookRecord ? (
                    <DropdownMenuItem onClick={() => handleImportClick(row)} className="gap-2 cursor-pointer text-blue-600 hover:bg-blue-100 hover:text-blue-700 focus:bg-blue-100 focus:text-blue-700">
                      <Upload className="w-4 h-4" />
                      <span>Import to Database</span>
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onClick={() => handleEdit(row, "violation")} className="gap-2 cursor-pointer text-gray-900 hover:bg-gray-200 hover:text-gray-900 focus:bg-gray-200 focus:text-gray-900">
                      <Edit className="w-4 h-4" />
                      <span>Edit</span>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => handleDeleteArchivedViolation(row)} className="gap-2 cursor-pointer text-red-700 hover:bg-red-100 hover:text-red-800 focus:bg-red-100 focus:text-red-800">
                    <Trash2 className="w-4 h-4" />
                    <span>Delete</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            );
          },
        },
      ];
    }
  }, [activeFolder, isGlobalSearch, searchQuery, selectedUnresolvedYear]);

  const tableTitle = isGlobalSearch
    ? searchQuery
      ? `Global Search Results for "${searchQuery}"`
      : "Global Search (enter keywords to find records)"
    : activeFolder === "users"
    ? "Archived Users"
    : activeFolder === "unresolved"
    ? selectedUnresolvedYear === "users"
      ? "Archived Users [Unresolved]"
      : selectedUnresolvedYear
        ? `Unresolved Student Records - S.Y. ${selectedUnresolvedYear}`
        : "Unresolved Student Records - Select a Year"
    : `Archived Student Records - S.Y. ${activeFolder} (${activeSemester})`;

  const handleClearUnresolved = async (row) => {
    if (!row?.id) return;

    // Preserve the row's immediate year_section before backend may update student year_section on promotion.
    const originalYearSection = row.year_section || row.yearSection;
    const originalProgram = row.program || '';
    if (originalYearSection) {
      setPreservedYearSectionByViolationId((prev) => ({
        ...prev,
        [row.id]: formatProgramYearSection(originalProgram, originalYearSection) || originalYearSection,
      }));
    }

    try {
      setIsLoading(true);
      const response = await fetch(`/api/archive/violations/${row.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...getAuditHeaders(),
        },
        body: JSON.stringify({ isUnresolved: false }),
      });

      const data = await response.json();
      if (!response.ok || data.status !== "ok") {
        throw new Error(data.message || "Failed to clear unresolved record.");
      }

      // Remove from unresolved in current view immediately
      setArchivedViolations((items) => items.filter((item) => item.id !== row.id));
      setAllUnresolvedViolations((items) => items.filter((item) => item.id !== row.id));

      if (data.promotion?.isEligible) {
        if (data.promotion.promoted) {
          setArchiveSuccessMessage("Student promotion triggered automatically after clearance.");
        } else if (data.promotion.graduated) {
          setArchiveSuccessMessage("Student graduated automatically after all violations cleared.");
        } else {
          setArchiveSuccessMessage("Student is eligible and checked for promotion after clearance.");
        }
        setTimeout(() => setArchiveSuccessMessage(""), 5000);
      }

      // preserve year section from archived record before promotion so UI does not show the promoted value in the source archive row
      const preservedYS = data.preservedYearSection || originalYearSection;
      if (preservedYS) {
        setPreservedYearSectionByViolationId((prev) => ({
          ...prev,
          [row.id]: formatProgramYearSection(originalProgram, preservedYS) || preservedYS,
        }));
      }

      // Keep user in the unresolved folder view when clearing from unresolved items.
      const destinationYear = selectedUnresolvedYear || row.school_year || activeFolder;
      const destinationSemester = row.semester || activeSemester;

      // Notify other components but don't force folder navigation from unresolved clear.
      window.dispatchEvent(
        new CustomEvent("archiveCompleted", {
          detail: {
            source: "unresolved",
            archivedCount: 1,
            schoolYear: destinationYear,
            semester: destinationSemester,
            preservedYearSections: preservedYS
              ? { [row.id]: formatProgramYearSection(originalProgram, preservedYS) || preservedYS }
              : {},
          },
        }),
      );
    } catch (err) {
      setError(err.message || "Unable to clear unresolved record.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteArchivedViolation = (row) => {
    if (!row?.id) return;
    setArchivedViolationToDelete(row);
    setIsDeleteArchivedViolationModalOpen(true);
  };

  const handleConfirmDeleteArchivedViolation = async () => {
    if (!archivedViolationToDelete?.id) return;

    try {
      setIsLoading(true);
      const response = await fetch(`/api/archive/violations/${archivedViolationToDelete.id}`, {
        method: "DELETE",
        headers: {
          ...getAuditHeaders(),
        },
      });

      const data = await response.json();
      if (!response.ok || data.status !== "ok") {
        throw new Error(data.message || "Failed to delete record.");
      }

      setArchivedViolations((items) => items.filter((item) => item.id !== archivedViolationToDelete.id));
      setAllArchivedViolations([]);
      setAllUnresolvedViolations([]);
      setIsDeleteArchivedViolationModalOpen(false);
      setArchivedViolationToDelete(null);
    } catch (err) {
      if (String(err.message || "").toLowerCase().includes("not found")) {
        setArchivedViolations((items) => items.filter((item) => item.id !== archivedViolationToDelete.id));
        setAllArchivedViolations([]);
        setAllUnresolvedViolations([]);
        setIsDeleteArchivedViolationModalOpen(false);
        setArchivedViolationToDelete(null);
        return;
      }
      setError(err.message || "Unable to delete record.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (row, type) => {
    setSelectedRow(row);
    setEditType(type);
    setIsEditOpen(true);
  };

  const handleImportClick = (row) => {
    setRecordToImport(row);
    setIsImportConfirmModalOpen(true);
  };

  const handleConfirmImport = async () => {
    if (!recordToImport?.id) return;

    try {
      setIsImporting(true);
      setError("");

      const response = await fetch(`/api/archive/violations/${recordToImport.id}/import`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuditHeaders(),
        },
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || "Failed to import record");
        return;
      }

      if (data.status === "ok") {
        // Show success message
        setArchiveSuccessMessage(`✓ Record imported successfully with remarks: "IMPORTED"`);
        setTimeout(() => setArchiveSuccessMessage(""), 3000);

        // Refresh violations list
        const endpoint =
          activeFolder === "unresolved"
            ? `/api/archive/unresolved/${encodeURIComponent(selectedUnresolvedYear)}/${encodeURIComponent(activeSemester)}`
            : `/api/archive/violations/${encodeURIComponent(activeFolder)}/${encodeURIComponent(activeSemester)}`;

        const refreshResponse = await fetch(endpoint, {
          headers: { ...getAuditHeaders() },
        });

        if (refreshResponse.ok) {
          const refreshData = await refreshResponse.json();
          if (refreshData.status === "ok") {
            setArchivedViolations(refreshData.violations || []);
          }
        }

        // Close modal
        setIsImportConfirmModalOpen(false);
        setRecordToImport(null);
      }
    } catch (err) {
      console.error("Error importing record:", err);
      setError("Error importing record: " + err.message);
    } finally {
      setIsImporting(false);
    }
  };

  const handleCleanupAndReimport = async () => {
    if (cleanupSecretKey.trim() !== "2026") {
      setError("Invalid secret key. Cleanup requires key 2026.");
      return;
    }

    try {
      setIsCleanupReimporting(true);
      setError("");

      const response = await fetch("/api/archive/cleanup-and-reimport-workbook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuditHeaders(),
        },
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || "Failed to cleanup and re-import workbook records");
        return;
      }

      if (data.status === "ok") {
        // Show success message
        setArchiveSuccessMessage(
          `✓ Cleanup complete: Removed ${data.cleanupCount || 0} old records. Re-imported ${data.importCount || 0} workbook records with remarks: "IMPORTED"`
        );
        setTimeout(() => setArchiveSuccessMessage(""), 5000);

        // Refresh the entire view
        // Reset to default view
        setActiveFolder("users");
        setActiveSemester("1ST SEM");
        setSelectedUnresolvedYear("");

        // Reload school years
        const schoolYearsResponse = await fetch("/api/archive/school-years", {
          headers: { ...getAuditHeaders() },
        });

        if (schoolYearsResponse.ok) {
          const schoolYearsData = await schoolYearsResponse.json();
          if (schoolYearsData.status === "ok") {
            setSchoolYears(schoolYearsData.schoolYears || []);
          }
        }

        // Close modal
        setIsCleanupReimportModalOpen(false);
        setCleanupSecretKey("");
      }
    } catch (err) {
      console.error("Error cleaning up and re-importing workbook records:", err);
      setError("Error cleaning up and re-importing: " + err.message);
    } finally {
      setIsCleanupReimporting(false);
    }
  };

  const clearFilters = () => {
    setSearchQuery("");
    setFilterType("");
    setFilterYear("");
    setSortOrder("");
    if (isGlobalSearch) {
      setIsGlobalSearch(false);
      setAllArchivedViolations([]); // Clear global search data
    }
  };

  // Export functionality
  const formatDownloadFileName = (folderType, schoolYear = '', semester = '', isAllRecords = false) => {
    const sanitize = (text) =>
      String(text || '')
        .replace(/[\\/:*?"<>|]/g, '')
        .trim();

    const dateSegment = formatDateForFileName(new Date());
    const ext = 'xlsx'; // Default to excel for now, will be overridden by format param

    if (folderType === 'users') {
      return `Archived_Users_${dateSegment}.${ext}`;
    } else if (folderType === 'unresolved') {
      const yearSegment = schoolYear ? `SY${schoolYear}` : 'AllYears';
      const semesterSegment = semester ? semester.replace(' ', '') : '';
      return `Unresolved_Violations_${yearSegment}_${semesterSegment}_${dateSegment}.${ext}`;
    } else {
      // Archived violations by school year
      const yearSegment = schoolYear ? `SY${schoolYear}` : 'UnknownYear';
      const semesterSegment = semester ? semester.replace(' ', '') : '';
      return `Archived_Violations_${yearSegment}_${semesterSegment}_${dateSegment}.${ext}`;
    }
  };

  const getExportTitles = () => {
    const isUsersFolder = activeFolder === 'users';
    const isUnresolvedFolder = activeFolder === 'unresolved';
    const reportTitle = isUsersFolder
      ? 'ARCHIVED USERS REPORT'
      : isUnresolvedFolder
      ? 'UNRESOLVED VIOLATIONS REPORT'
      : 'ARCHIVED VIOLATIONS REPORT';

    const yearLine = isUsersFolder
      ? ''
      : isUnresolvedFolder
      ? selectedUnresolvedYear
        ? `S.Y. ${selectedUnresolvedYear}`
        : ''
      : activeFolder
      ? `S.Y. ${activeFolder}`
      : '';

    const semesterLine =
      !isUsersFolder && activeSemester ? `(${activeSemester})` : '';

    const exportLabel = isUsersFolder
      ? 'Archived Users'
      : isUnresolvedFolder
      ? 'Unresolved Violations'
      : 'Archived Violations';

    return { reportTitle, yearLine, semesterLine, exportLabel };
  };

  const createDownload = async (format) => {
    if (filteredData.length === 0) {
      setDownloadAlertMessage("There's no record to export");
      setShowDownloadAlertModal(true);
      return;
    }

    const filename = formatDownloadFileName(
      activeFolder,
      activeFolder === 'unresolved' ? selectedUnresolvedYear : activeFolder,
      activeSemester
    ).replace('.xlsx', format === 'pdf' ? '.pdf' : '.xlsx');

    const { reportTitle, yearLine, semesterLine, exportLabel } = getExportTitles();

    // Prepare data based on folder type
    let sheetData = [];
    let title = reportTitle;
    let headers = [];

    if (activeFolder === 'users') {
      title = 'ARCHIVED USERS REPORT';
      headers = ['No', 'Student No.', 'Full Name', 'Email', 'Program', 'Year/Section', 'Status', 'Violation Count', 'Archived Date'];
      sheetData = filteredData.map((item, index) => {
        const statusValue =
          item.archivedReason ||
          (typeof item.status === 'string'
            ? item.status
            : item.status?.toString?.() || '') ||
          '';

        const studentNo = (item.school_id || item.schoolId || '').toString().trim();
        const fullName = item.full_name || '';

        return {
          'No': index + 1,
          'Student No.': studentNo,
          'Full Name': fullName,
          'Email': item.email || '',
          'Program': item.program || '',
          'Year/Section': item.yearSection || '',
          'Status': statusValue,
          'Violation Count': item.violationCount || 0,
          'Archived Date': item.archivedDate || '',
        };
      });
    } else {
      // Violations (both archived and unresolved)
      title = activeFolder === 'unresolved' ? 'UNRESOLVED VIOLATIONS REPORT' : 'ARCHIVED VIOLATIONS REPORT';
      headers = ['No', 'Date', 'Student Name', 'Program-Year/Section', 'Violation', 'Type', 'Reported by', 'Remarks', 'Signature', 'Status'];
      sheetData = filteredData.map((item, index) => ({
        'No': index + 1,
        'Date': item.date || '-',
        'Student Name': item.studentName?.props?.children?.[0]?.props?.children || item.studentName || '-',
        'Program-Year/Section': item.yearSection || '-',
        'Violation': item.violation || '-',
        'Type': item.type || '-',
        'Reported by': item.reportedBy || '-',
        'Remarks': item.remarks || '-',
        'Signature': item.signature || 'No Signature',
        'Status': item.status || '-',
      }));
    }

    const signatureImageDataByRow = await Promise.all(
      filteredData.map(async (item) => {
        if (!item.signatureImage) return null;
        if (typeof item.signatureImage === 'string' && item.signatureImage.startsWith('data:')) {
          return item.signatureImage;
        }
        return await getSignatureImageData(item.signatureImage);
      }),
    );

    if (format === 'excel') {
      try {
        const [{ Workbook }, headerImage] = await Promise.all([
          import('exceljs'),
          resolveHeaderImage(),
        ]);

        const workbook = new Workbook();
        const sheet = workbook.addWorksheet('Archive Report', {
          views: [{ state: 'frozen', ySplit: activeFolder === 'users' ? 11 : 13 }],
        });
        applyExcelPrintLayout(sheet, {
          orientation: activeFolder === 'users' ? 'portrait' : 'landscape',
        });

        // Set column widths
        const columnWidths = activeFolder === 'users'
          ? [10, 18, 35, 35, 20, 20, 15, 15, 18]
          : [10, 18, 35, 20, 40, 24, 20, 44, 22, 16];
        
        sheet.columns = headers.map((header, index) => ({
          key: header,
          width: columnWidths[index] || 20,
        }));

        const headerCellEnd = getExcelColumnLetter(headers.length);
        sheet.mergeCells(`A1:${headerCellEnd}8`);

        if (activeFolder === 'users') {
          sheet.mergeCells(`A9:${headerCellEnd}9`);
          sheet.mergeCells(`A10:${headerCellEnd}10`);
        } else {
          sheet.mergeCells(`A9:${headerCellEnd}9`);
          sheet.mergeCells(`A10:${headerCellEnd}10`);
          sheet.mergeCells(`A11:${headerCellEnd}11`);
          sheet.mergeCells(`A12:${headerCellEnd}12`);
        }

        for (let i = 1; i <= 8; i += 1) {
          sheet.getRow(i).height = i <= 7 ? 26 : 18;
        }
        
        if (activeFolder === 'users') {
          sheet.getRow(9).height = 28;
          sheet.getRow(10).height = 18;
          sheet.getRow(11).height = 24;
        } else {
          sheet.getRow(9).height = 28;
          sheet.getRow(10).height = 18;
          sheet.getRow(11).height = 18;
          sheet.getRow(12).height = 18;
          sheet.getRow(13).height = 24;
        }

        // Add header image if available
        if (headerImage.dataUrl && headerImage.dimensions) {
          addCenteredExcelHeaderImage({
            workbook,
            sheet,
            dataUrl: headerImage.dataUrl,
            extension: 'png',
            dimensions: headerImage.dimensions,
            rowStart: 1,
            rowEnd: 8,
          });
        }

        // Title and subtitle
        if (activeFolder === 'users') {
          const titleCell = sheet.getCell('A9');
          titleCell.value = title;
          titleCell.font = { name: 'Calibri', size: 18, bold: true, color: { argb: 'FF000000' } };
          titleCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

          const generatedCell = sheet.getCell('A10');
          const generatedDateRaw = new Date();
          const month = generatedDateRaw.toLocaleString(undefined, { month: 'long' });
          const day = generatedDateRaw.getDate();
          const year = generatedDateRaw.getFullYear();
          const time = generatedDateRaw.toLocaleString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
          generatedCell.value = `Generated: ${month} ${day}, ${year}, ${time}`;
          generatedCell.font = { name: 'Calibri', size: 11, color: { argb: 'FF4B5563' } };
          generatedCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        } else {
          const titleCell = sheet.getCell('A9');
          titleCell.value = title;
          titleCell.font = { name: 'Calibri', size: 18, bold: true, color: { argb: 'FF000000' } };
          titleCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

          const yearCell = sheet.getCell('A10');
          yearCell.value = yearLine || '';
          yearCell.font = { name: 'Calibri', size: 12, color: { argb: 'FF1F2937' } };
          yearCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

          const semesterCell = sheet.getCell('A11');
          semesterCell.value = semesterLine || '';
          semesterCell.font = { name: 'Calibri', size: 12, color: { argb: 'FF1F2937' } };
          semesterCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

          const generatedCell = sheet.getCell('A12');
          const generatedDateRaw = new Date();
          const month = generatedDateRaw.toLocaleString(undefined, { month: 'long' });
          const day = generatedDateRaw.getDate();
          const year = generatedDateRaw.getFullYear();
          const time = generatedDateRaw.toLocaleString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
          generatedCell.value = `Generated: ${month} ${day}, ${year}, ${time}`;
          generatedCell.font = { name: 'Calibri', size: 11, color: { argb: 'FF4B5563' } };
          generatedCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        }

        // Header row
        const headerRow = sheet.getRow(activeFolder === 'users' ? 11 : 13);
        headerRow.values = headers;
        headerRow.height = 24;
        headerRow.eachCell((cell) => {
          cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF0F172A' },
          };
          cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          };
        });

        // Data rows
        const dataRowStart = activeFolder === 'users' ? 12 : 14;
        sheetData.forEach((row, index) => {
          const excelRow = sheet.getRow(dataRowStart + index);
          excelRow.values = Object.values(row);
          excelRow.height = 28;

          excelRow.eachCell((cell, cellNum) => {
            cell.font = { name: 'Calibri', size: 11, color: { argb: 'FF1F2937' } };
            // Center align No column and Status column
            if (cellNum === 1 || (activeFolder !== 'users' && cellNum === 10) || (activeFolder === 'users' && cellNum === 7)) {
              cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            } else {
              cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
            }
            cell.border = {
              top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
              left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
              bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
              right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            };
          });
        });

        // Add signature images for violations
        if (activeFolder !== 'users') {
          filteredData.forEach((item, index) => {
            const signatureImageData = signatureImageDataByRow[index];
            if (signatureImageData) {
              const signatureColIndex = 9; // Column I (0-indexed as 8, but 1-indexed as 9)
              const signatureRowIndex = dataRowStart + index;

              const colWidthPx = sheet.getColumn(signatureColIndex).width * 7.5;
              const rowHeightPx = sheet.getRow(signatureRowIndex).height * 1.333;

              const maxWidth = colWidthPx * 0.8;
              const maxHeight = rowHeightPx * 0.8;
              const sigWidth = Math.min(maxWidth, 80);
              const sigHeight = Math.min(maxHeight, 24);

              const sigLeftOffset = (colWidthPx - sigWidth) / 2;
              const sigTopOffset = (rowHeightPx - sigHeight) / 2;

              const toColCoordinateForSig = (pixelOffset) => {
                let remaining = pixelOffset;
                const colWidth = sheet.getColumn(signatureColIndex).width || 15;
                const colPx = colWidth * 7.5;
                if (remaining <= colPx) {
                  return (signatureColIndex - 1) + remaining / colPx;
                }
                return signatureColIndex - 1;
              };

              const toRowCoordinateForSig = (pixelOffset) => {
                let remaining = pixelOffset;
                const rowPx = Number(sheet.getRow(signatureRowIndex).height || 15) * 1.333;
                if (remaining <= rowPx) {
                  return (signatureRowIndex - 1) + remaining / rowPx;
                }
                return signatureRowIndex - 1;
              };

              const extension = getImageTypeFromDataUrl(signatureImageData).toLowerCase();
              const signatureImageId = workbook.addImage({ base64: signatureImageData, extension });
              sheet.addImage(signatureImageId, {
                tl: {
                  col: toColCoordinateForSig(sigLeftOffset),
                  row: toRowCoordinateForSig(sigTopOffset),
                },
                ext: {
                  width: sigWidth,
                  height: sigHeight,
                },
              });

              // Clear the text in the signature cell since we have an image
              const signatureCell = sheet.getCell(`${String.fromCharCode(65 + signatureColIndex - 1)}${signatureRowIndex}`);
              signatureCell.value = '';
            }
          });
        }

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } catch (error) {
        console.error('Excel export failed', error);
        alert('Unable to generate Excel download.');
      }
    } else if (format === 'pdf') {
      try {
        const [jsPDFModule, autoTableModule, headerImage] = await Promise.all([
          import('jspdf'),
          import('jspdf-autotable'),
          resolveHeaderImage(),
        ]);

        const jsPDF = jsPDFModule.jsPDF || jsPDFModule.default || jsPDFModule;
        const autoTable = autoTableModule.default || autoTableModule;
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const pageWidth = doc.internal.pageSize.getWidth();
        const tableMarginLeft = 10;
        const tableMarginRight = 10;
        const tableWidth = pageWidth - tableMarginLeft - tableMarginRight;
        const tableCenterX = tableMarginLeft + tableWidth / 2;
        let startY = 20;

        // Add header image if available
        if (headerImage.dataUrl && headerImage.dimensions) {
          const headerWidth = tableWidth;
          const headerHeight = (headerImage.dimensions.height * headerWidth) / headerImage.dimensions.width;
          const headerX = tableMarginLeft;
          doc.addImage(headerImage.dataUrl, 'PNG', headerX, 10, headerWidth, headerHeight);
          startY = 10 + headerHeight + 8;
        }

        const generatedDateRaw = new Date();
        const month = generatedDateRaw.toLocaleString(undefined, { month: 'long' });
        const day = generatedDateRaw.getDate();
        const year = generatedDateRaw.getFullYear();
        const time = generatedDateRaw.toLocaleString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
        const generatedAt = `Generated: ${month} ${day}, ${year}, ${time}`;

        const titleLines = [title, yearLine, semesterLine].filter(Boolean);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(18);
        let currentY = startY + 5;
        titleLines.forEach((line, index) => {
          doc.setFont('helvetica', index === 0 ? 'bold' : 'normal');
          doc.setFontSize(index === 0 ? 18 : 12);
          doc.text(line, tableCenterX, currentY, { align: 'center' });
          currentY += index === 0 ? 8 : 7;
        });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        doc.text(generatedAt, tableCenterX, currentY + 2, { align: 'center' });

        const rawColumnWidths = activeFolder === 'users'
          ? [12, 24, 35, 35, 22, 18, 20, 18, 18]
          : [12, 22, 35, 20, 40, 28, 25, 50, 25, 18];
        const totalRawWidth = rawColumnWidths.reduce((sum, width) => sum + width, 0);
        const scaledColumnWidths = rawColumnWidths.map((width) => (width * tableWidth) / totalRawWidth);
        const tableStartY = currentY + 10;

        // Custom renderer for signature column
        const didDrawCell = (data) => {
          if (data.section === 'body' && activeFolder !== 'users') {
            const signatureColumnIndex = 8; // Signature column index
            if (data.column.index === signatureColumnIndex) {
              const signatureImageData = signatureImageDataByRow[data.row.index];
              if (signatureImageData) {
                const cellWidth = data.cell.width;
                const cellHeight = data.cell.height;
                const x = data.cell.x + 1;
                const y = data.cell.y + 1;

                const maxWidth = cellWidth - 2;
                const maxHeight = cellHeight - 2;
                const scale = Math.min(maxWidth / 80, maxHeight / 24, 1);
                const sigWidth = 80 * scale;
                const sigHeight = 24 * scale;

                const sigX = x + (maxWidth - sigWidth) / 2;
                const sigY = y + (maxHeight - sigHeight) / 2;

                const imageType = getImageTypeFromDataUrl(signatureImageData);
                doc.addImage(signatureImageData, imageType, sigX, sigY, sigWidth, sigHeight);
              }
            }
          }
        };

        const bodyData = sheetData.map(row => Object.values(row));

        autoTable(doc, {
          startY: tableStartY,
          head: [headers],
          body: bodyData,
          theme: 'grid',
          styles: {
            fontSize: 8,
            cellPadding: 2,
            textColor: [31, 41, 55],
            halign: 'left',
            valign: 'middle',
          },
          headStyles: {
            fillColor: [15, 23, 42],
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            halign: 'center',
          },
          alternateRowStyles: {
            fillColor: [248, 250, 252],
          },
          margin: { left: tableMarginLeft, right: tableMarginRight },
          tableWidth: tableWidth,
          columnStyles: activeFolder === 'users' ? {
            0: { cellWidth: scaledColumnWidths[0], halign: 'center' },
            1: { cellWidth: scaledColumnWidths[1], halign: 'center' },
            2: { cellWidth: scaledColumnWidths[2] },
            3: { cellWidth: scaledColumnWidths[3] },
            4: { cellWidth: scaledColumnWidths[4] },
            5: { cellWidth: scaledColumnWidths[5] },
            6: { cellWidth: scaledColumnWidths[6], halign: 'center' },
            7: { cellWidth: scaledColumnWidths[7], halign: 'center' },
            8: { cellWidth: scaledColumnWidths[8], halign: 'center' },
          } : {
            0: { cellWidth: scaledColumnWidths[0], halign: 'center' },
            1: { cellWidth: scaledColumnWidths[1] },
            2: { cellWidth: scaledColumnWidths[2] },
            3: { cellWidth: scaledColumnWidths[3] },
            4: { cellWidth: scaledColumnWidths[4] },
            5: { cellWidth: scaledColumnWidths[5] },
            6: { cellWidth: scaledColumnWidths[6] },
            7: { cellWidth: scaledColumnWidths[7] },
            8: { cellWidth: scaledColumnWidths[8], halign: 'center' },
            9: { cellWidth: scaledColumnWidths[9] },
          },
          didDrawCell,
        });

        doc.save(filename);
      } catch (error) {
        console.error('PDF export failed', error);
        alert('Unable to generate PDF download.');
      }
    }
  };

  const confirmDownload = () => {
    createDownload(downloadFormat);
    setDownloadModalOpen(false);
  };

  const confirmDownloadAll = () => {
    createDownload(downloadAllFormat);
    setDownloadAllModalOpen(false);
  };

  const { exportLabel } = getExportTitles();

  return (
    <div className="text-white">
      <AnimatedContent>
        <h2 className="text-xl font-bold mb-2 tracking-wide">
          SYSTEM ARCHIVES{" "}
          <span className="font-normal">
            &gt;{" "}
            {folders.find((f) => f.key === activeFolder)?.label ||
              activeFolder}
          </span>
        </h2>
      </AnimatedContent>

      {error && (
        <AnimatedContent delay={0.05}>
          <div className="mb-4 bg-red-500/10 border border-red-500/40 rounded-lg p-4 flex gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        </AnimatedContent>
      )}

      <AnimatedContent delay={0.1}>
        <div className="flex gap-4 items-center mb-4">
          <SearchBar
            placeholder={
              isGlobalSearch
                ? "Search across all folders..."
                : `Search ${activeFolder === "users" ? "users" : "records"}...`
            }
            className="flex-1 w-80"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-300">Search Mode:</label>
            <Button
              size="sm"
              variant={isGlobalSearch ? "default" : "secondary"}
              className={`px-3 py-1 text-xs ${
                isGlobalSearch
                  ? "bg-[#A3AED0] text-[#23262B] hover:bg-[#8B9CB8]"
                  : "bg-[#3D4654] hover:bg-[#4d5664] text-gray-300"
              } border-0`}
              onClick={() => {
                setIsGlobalSearch(true);
                setSearchQuery(""); // Clear search when switching to global
                setFilterType("");
                setFilterYear("");
                setSortOrder("");
              }}
            >
              Global
            </Button>
            <Button
              size="sm"
              variant={!isGlobalSearch ? "default" : "secondary"}
              className={`px-3 py-1 text-xs ${
                !isGlobalSearch
                  ? "bg-[#A3AED0] text-[#23262B] hover:bg-[#8B9CB8]"
                  : "bg-[#3D4654] hover:bg-[#4d5664] text-gray-300"
              } border-0`}
              onClick={() => {
                setIsGlobalSearch(false);
                setSearchQuery(""); // Clear search when switching to current folder
                setFilterType("");
                setFilterYear("");
                setSortOrder("");
                setAllArchivedViolations([]); // Clear global search data
              }}
            >
              Current Folder
            </Button>
          </div>
        </div>
      </AnimatedContent>

      <AnimatedContent delay={0.2}>
        {!isGlobalSearch && (
          <div className="flex gap-4 mb-6 overflow-x-auto pb-2">
            {folders.map((folder) => (
              <div key={folder.key} className="relative flex-shrink-0">
                <button
                  onClick={() => {
                    setActiveFolder(folder.key);
                    setActiveSemester("1ST SEM");
                    if (folder.key === "unresolved") {
                      setSelectedUnresolvedYear("");
                    }
                  }}
                  className={`flex flex-col items-center px-4 py-2 rounded-xl transition-all duration-200 ${folder.key !== "users" ? "pr-8" : ""} ${
                    activeFolder === folder.key
                      ? "bg-[#23262B] border-2 border-[#A3AED0]"
                      : "bg-[#23262B]/60 border border-transparent"
                  } hover:bg-[#23262B]`}
                >
                  <span className="mb-2 flex items-center justify-center w-[80px] h-[60px]">
                    <Folder className="w-8 h-8" />
                  </span>
                  <span className="text-xs font-semibold text-white text-center w-full">
                    {folder.label}
                  </span>
                </button>
                {folder.key !== "users" && folder.key !== "unresolved" && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="absolute top-1 right-1 w-6 h-6 hover:bg-[#3D4654] rounded-full flex items-center justify-center transition-colors">
                        <MoreVertical className="w-3 h-3 text-[#A3AED0]" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-white/95 border-white/20 text-gray-800">
                      <DropdownMenuItem
                        onClick={() => handleRenameSchoolYearClick(folder.key)}
                        className="gap-2 cursor-pointer text-gray-900 hover:bg-gray-200 hover:text-gray-900 focus:bg-gray-200 focus:text-gray-900"
                      >
                        <Edit className="w-4 h-4" />
                        <span>Rename</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleDeleteSchoolYearClick(folder.key)}
                        className="gap-2 cursor-pointer text-red-700 hover:bg-red-100 hover:text-red-800 focus:bg-red-100 focus:text-red-800"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Delete</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            ))}
          </div>
        )}
      </AnimatedContent>

      {activeFolder === "unresolved" && !selectedUnresolvedYear && !isGlobalSearch && (
        <AnimatedContent delay={0.25}>
          <div className="bg-[#23262B] rounded-xl p-6 mb-4">
            <h3 className="text-lg font-bold mb-3">Unresolved Violations</h3>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {/* USERS subfolder */}
              <button
                onClick={() => {
                  setSelectedUnresolvedYear("users");
                  setActiveSemester("1ST SEM");
                }}
                className="rounded-lg border border-[#A3AED0]/30 p-3 text-left text-sm text-white hover:border-[#A3AED0]"
              >
                <div className="flex items-center gap-2 mb-1">
                  <UserRound className="w-4 h-4 text-[#A3AED0]" />
                  <span className="font-semibold">USERS</span>
                </div>
                <div className="text-xs text-gray-400">Archived users with violations</div>
              </button>
              {unresolvedSchoolYears.length === 0 ? (
                <div className="text-gray-300 col-span-full">No unresolved school year yet.</div>
              ) : (
                unresolvedSchoolYears
                  .filter((year) =>
                    searchQuery
                      ? String(year).toLowerCase().includes(searchQuery.toLowerCase())
                      : true,
                  )
                  .map((year) => (
                    <button
                      key={year}
                      onClick={() => {
                        setSelectedUnresolvedYear(year);
                        setActiveSemester("1ST SEM");
                      }}
                      className="rounded-lg border border-[#A3AED0]/30 p-3 text-left text-sm text-white hover:border-[#A3AED0]"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Folder className="w-4 h-4 text-[#A3AED0]" />
                        <span className="font-semibold">S.Y. {year}</span>
                      </div>
                    </button>
                  ))
              )}
              {unresolvedSchoolYears.length > 0 &&
                !unresolvedSchoolYears.some((year) =>
                  searchQuery
                    ? String(year).toLowerCase().includes(searchQuery.toLowerCase())
                    : true,
                ) && (
                  <div className="text-gray-300 col-span-full">
                    No matching school year found.
                  </div>
                )}
            </div>
          </div>
        </AnimatedContent>
      )}

      {activeFolder !== "users" && !isGlobalSearch && selectedUnresolvedYear && (
        <AnimatedContent delay={0.25}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Folder className="w-4 h-4 text-[#A3AED0]" />
              <span className="text-sm text-[#A3AED0] font-semibold">UNRESOLVED</span>
              <span className="text-sm text-gray-300">&gt;</span>
              <span className="text-sm text-white font-medium">
                {selectedUnresolvedYear === "users" ? "USERS" : `S.Y. ${selectedUnresolvedYear}`}
              </span>
            </div>
            <Button
              size="xs"
              variant="secondary"
              className="px-2 py-1"
              onClick={() => {
                setSelectedUnresolvedYear("");
              }}
            >
              Back to Year Selection
            </Button>
          </div>
        </AnimatedContent>
      )}

      {activeFolder !== "users" && !isGlobalSearch &&
        (activeFolder !== "unresolved" || (selectedUnresolvedYear && selectedUnresolvedYear !== "users")) && (
        <AnimatedContent delay={0.25}>
          {activeFolder !== "unresolved" ? (
            <TableTabs
              tabs={semesterTabs}
              activeTab={activeSemester}
              onTabChange={setActiveSemester}
              renderTabAction={(tab) =>
                (semestersBySchoolYear[activeFolder] || []).includes(tab.key) ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleDeleteSemesterClick(activeFolder, tab.key);
                    }}
                    disabled={isSemesterActionLoading}
                    className="absolute right-1 top-1 z-10 flex h-4 w-5 items-center justify-center text-slate-400 transition-colors hover:text-white disabled:opacity-50"
                    title={`Delete ${tab.label} for S.Y. ${activeFolder}`}
                  >
                    {isSemesterActionLoading &&
                    semesterToDelete?.schoolYear === activeFolder &&
                    semesterToDelete?.semester === tab.key ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                  </button>
                ) : null
              }
              className="mb-4"
            />
          ) : (
            <TableTabs
              tabs={semesterTabs}
              activeTab={activeSemester}
              onTabChange={setActiveSemester}
              className="mb-4"
            />
          )}
        </AnimatedContent>
      )}

      {!(activeFolder === "unresolved" && !selectedUnresolvedYear && !isGlobalSearch) && (
        <AnimatedContent delay={0.4}>
          <div className="bg-[#23262B] rounded-xl p-6">
          {activeFolder !== "users" && !isGlobalSearch && (
            <h3 className="text-lg font-bold mb-4">{tableTitle}</h3>
          )}

          {archiveSuccessMessage && (
            <div className="mb-3 px-3 py-2 text-sm border border-emerald-300 bg-emerald-50 text-emerald-700 rounded">
              {archiveSuccessMessage}
            </div>
          )}

          <div className="flex justify-between items-center mb-4">
            <div className="flex gap-2 items-center flex-wrap">
              {(activeFolder === "users" || isGlobalSearch) && (
                <h3 className="text-lg font-bold">{tableTitle}</h3>
              )}

              {activeFolder !== "users" && !isGlobalSearch && (
                <>
                  {/* Violation Type Filter */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="secondary"
                        size="sm"
                        className={`gap-2 ${
                          filterType
                            ? "bg-[#334155] hover:bg-[#475569]"
                            : "bg-[#1F2937] hover:bg-[#374151]"
                        } text-white border-0 transition-colors`}
                      >
                        <Tag className="w-4 h-4 text-[#CBD5E1]" />
                        {filterType || "Type"}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => setFilterType("")}>
                        All types
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setFilterType("Minor Offenses")}
                      >
                        Minor Offenses
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setFilterType("Major Offenses")}
                      >
                        Major Offenses
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {/* Year Filter */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="secondary"
                        size="sm"
                        className={`gap-2 ${
                          filterYear
                            ? "bg-[#334155] hover:bg-[#475569]"
                            : "bg-[#1F2937] hover:bg-[#374151]"
                        } text-white border-0 transition-colors`}
                      >
                        <CalendarDays className="w-4 h-4 text-[#CBD5E1]" />
                        {filterYear ? `Year ${filterYear}` : "Year"}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => setFilterYear("")}>
                        All years
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setFilterYear("1") }>
                        1st Year
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setFilterYear("2") }>
                        2nd Year
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setFilterYear("3") }>
                        3rd Year
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setFilterYear("4") }>
                        4th Year
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {/* Sort Order Filter */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="secondary"
                        size="sm"
                        className={`gap-2 ${
                          sortOrder
                            ? "bg-[#334155] hover:bg-[#475569]"
                            : "bg-[#1F2937] hover:bg-[#374151]"
                        } text-white border-0 transition-colors`}
                      >
                        <SortAsc className="w-4 h-4 text-[#CBD5E1]" />
                        {sortOrder === "asc" ? "A-Z" : sortOrder === "desc" ? "Z-A" : "Sort"}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => setSortOrder("")}>
                        Default order
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setSortOrder("asc")}>
                        A-Z
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setSortOrder("desc")}>
                        Z-A
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}

              {/* Clear Filters Button */}
              {(filterType || filterYear || sortOrder || searchQuery || isGlobalSearch) && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={clearFilters}
                  className="gap-2 bg-[#4A5568] hover:bg-[#3d4654] border-0"
                >
                  <X className="w-4 h-4" /> Clear Filters
                </Button>
              )}

            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                className="gap-2 bg-[#A3AED0] text-[#23262B] hover:bg-[#8B9CB8] border-0"
                onClick={() => setDownloadModalOpen(true)}
              >
                <Download className="w-4 h-4" /> Export
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="p-2 bg-blue-600 hover:bg-blue-700 text-white border-0"
                onClick={() => {
                  setCleanupSecretKey("");
                  setIsCleanupReimportModalOpen(true);
                }}
                title="Cleanup & Re-Import Workbook"
                aria-label="Cleanup and Re-Import Workbook"
              >
                <Upload className="w-4 h-4" />
              </Button>
            </div>

          </div>

          {isLoading ? (
            <div className="text-center py-8 text-gray-400">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400"></div>
              <p className="mt-2">
                {isGlobalSearch && searchQuery
                  ? "Searching across all folders..."
                  : "Loading data..."}
              </p>
            </div>
          ) : filteredData.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              {isGlobalSearch
                ? searchQuery
                  ? "No matching folders or records found"
                  : "Enter a search term to start global search"
                : activeFolder === "users"
                ? "No archived users found"
                : activeFolder === "unresolved"
                ? selectedUnresolvedYear === "users"
                  ? "No unresolved archived users found."
                  : "No unresolved records found for this semester."
                : "No records found for this semester."}
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={filteredData}
              rowClassName={tableRowClassName}
              onRowClick={(row) => {
                if (!isGlobalSearch) return;

                if (row.isFolder) {
                  if (row.folderKey && row.folderKey.startsWith("unresolved-")) {
                    setActiveFolder("unresolved");
                    setSelectedUnresolvedYear(row.folderKey.replace("unresolved-", ""));
                    setActiveSemester("1ST SEM");
                  } else {
                    setActiveFolder(row.folderKey);
                    if (row.folderKey !== "users" && row.folderKey !== "unresolved") {
                      setActiveSemester("1ST SEM");
                    }
                  }
                  setIsGlobalSearch(false);
                  setSearchQuery("");
                  setFilterType("");
                  setFilterYear("");
                  setSortOrder("");
                  return;
                }

                if (row.recordType === "user") {
                  setActiveFolder("users");
                } else if (row.recordType === "violation") {
                  if (row.isUnresolved) {
                    setActiveFolder("unresolved");
                    setSelectedUnresolvedYear(row.schoolYear || "");
                    setActiveSemester("1ST SEM");
                  } else {
                    setActiveFolder(row.folderKey || "users");
                    setActiveSemester("1ST SEM");
                  }
                }
                setIsGlobalSearch(false);
                setSearchQuery("");
                setFilterType("");
                setFilterYear("");
                setSortOrder("");
              }}
            />
          )}
        </div>
      </AnimatedContent>
      )}

      <Modal
        isOpen={downloadModalOpen}
        onClose={() => setDownloadModalOpen(false)}
        title="Export Archive Report"
        size="sm"
      >
        <div className="space-y-3">
          <div>
            <p className="text-sm text-gray-200">Choose a format for exporting the current table view.</p>
          </div>
          <div className="border border-gray-400 rounded px-3 py-2">
            <label className="text-xs text-gray-300">Rows to export: {filteredData.length}</label>
          </div>
          <div className="space-y-2">
            <div className="text-sm font-semibold text-white">Format</div>
            <select
              value={downloadFormat}
              onChange={(e) => setDownloadFormat(e.target.value)}
              className="w-full rounded-lg border border-gray-500/30 bg-[#1a1a1a] px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
            >
              <option value="excel">Excel (.xlsx)</option>
              <option value="pdf">PDF</option>
            </select>
          </div>
        </div>
        <ModalFooter>
          <button
            type="button"
            className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white hover:bg-white/10"
            onClick={() => setDownloadModalOpen(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-gray-200"
            onClick={confirmDownload}
          >
            Export
          </button>
        </ModalFooter>
      </Modal>

      <AlertModal
        isOpen={showDownloadAlertModal}
        onClose={() => setShowDownloadAlertModal(false)}
        title="Export unavailable"
        message={downloadAlertMessage}
        confirmLabel="Okay"
      />

      {/* Edit Modal */}
      {isEditOpen && selectedRow && (
        <EditArchiveModal
          isOpen={isEditOpen}
          onClose={() => {
            setIsEditOpen(false);
            setSelectedRow(null);
          }}
          record={selectedRow}
          editType={editType}
          onSave={handleSaveEdit}
        />
      )}

      {/* Import Workbook Record Confirmation Modal */}
      {isImportConfirmModalOpen && recordToImport && (
        <Modal isOpen={isImportConfirmModalOpen} onClose={() => { setIsImportConfirmModalOpen(false); setRecordToImport(null); }} showCloseButton={true}>
          <div className="bg-transparent">
            <div className="flex items-center gap-3 mb-4">
              <Upload className="w-6 h-6 text-blue-400" />
              <h3 className="text-lg font-bold text-white">Import Record to Database</h3>
            </div>
            <p className="text-gray-300 mb-6">
              Are you sure you want to import this record to the database?
              <br />
              <span className="text-sm text-gray-400 mt-2 block">
                Student: <span className="text-[#A3AED0] font-semibold">{recordToImport.student_name || "Unknown"}</span>
                <br />
                Violation: <span className="text-[#A3AED0] font-semibold">{recordToImport.violation_label || "Unknown"}</span>
                <br />
                Remarks will be set to: <span className="text-green-400 font-semibold">IMPORTED</span>
              </span>
            </p>
            <ModalFooter>
              <Button
                variant="secondary"
                onClick={() => {
                  setIsImportConfirmModalOpen(false);
                  setRecordToImport(null);
                }}
                className="bg-[#3D4654] hover:bg-[#4d5664] border-0"
                disabled={isImporting}
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirmImport}
                disabled={isImporting}
                className="bg-blue-600 hover:bg-blue-700 border-0 text-white"
              >
                {isImporting ? "Importing..." : "Import Record"}
              </Button>
            </ModalFooter>
          </div>
        </Modal>
      )}

      {/* Cleanup and Re-Import Workbook Confirmation Modal */}
      {isCleanupReimportModalOpen && (
        <Modal isOpen={isCleanupReimportModalOpen} onClose={() => { setIsCleanupReimportModalOpen(false); setCleanupSecretKey(""); }} showCloseButton={true}>
          <div className="bg-transparent">
            <div className="flex items-center gap-3 mb-4">
              <RotateCcw className="w-6 h-6 text-blue-400" />
              <h3 className="text-lg font-bold text-white">Cleanup & Re-Import Workbook</h3>
            </div>
            <p className="text-gray-300 mb-4">
              This will:
            </p>
            <ul className="text-gray-300 text-sm mb-6 ml-4 list-disc space-y-1">
              <li>Remove all existing imported records from the database that match workbook data</li>
              <li>Re-import all records from <span className="font-semibold">ViolationRecords1.xlsx</span></li>
              <li>Create new school year folders for each record</li>
              <li>Set all imported records to <span className="text-green-400 font-semibold">IMPORTED</span> in remarks</li>
              <li>Ensure all records go to their designated SY folder (not unresolved)</li>
            </ul>
            <p className="text-yellow-300 text-sm mb-6 bg-yellow-400/10 p-3 rounded-lg border border-yellow-400/30">
              ⚠️ This action will delete and re-import all matching records. Make sure you have a backup if needed.
            </p>
            <div className="mb-6">
              <label className="block text-sm text-gray-300 mb-2" htmlFor="cleanup-secret-key">
                Enter secret key to continue
              </label>
              <input
                id="cleanup-secret-key"
                type="password"
                value={cleanupSecretKey}
                onChange={(e) => setCleanupSecretKey(e.target.value)}
                placeholder="Secret key"
                className="w-full rounded-lg border border-gray-500/30 bg-[#1a1a1a] px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
              />
            </div>
            <ModalFooter>
              <Button
                variant="secondary"
                onClick={() => {
                  setIsCleanupReimportModalOpen(false);
                  setCleanupSecretKey("");
                }}
                className="bg-[#3D4654] hover:bg-[#4d5664] border-0"
                disabled={isCleanupReimporting}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCleanupAndReimport}
                disabled={isCleanupReimporting || cleanupSecretKey.trim() !== "2026"}
                className="bg-blue-600 hover:bg-blue-700 border-0 text-white"
              >
                {isCleanupReimporting ? "Processing..." : "Cleanup & Re-Import"}
              </Button>
            </ModalFooter>
          </div>
        </Modal>
      )}

      {/* Restore Confirmation Modal */}
      {isRestoreModalOpen && userToRestore && (
        <Modal isOpen={isRestoreModalOpen} onClose={() => { setIsRestoreModalOpen(false); setUserToRestore(null); }} showCloseButton={true}>
          <div className="bg-transparent">
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="w-6 h-6 text-yellow-400" />
              <h3 className="text-lg font-bold text-white">Confirm Restore</h3>
            </div>
            <p className="text-gray-300 mb-6">
              Are you sure you want to restore{" "}
              <span className="font-semibold text-[#A3AED0]">
                {userToRestore.full_name || userToRestore.name}
              </span>
              ? This user will be moved back to the user management and become active again.
            </p>
            <ModalFooter>
              <Button
                variant="secondary"
                onClick={() => {
                  setIsRestoreModalOpen(false);
                  setUserToRestore(null);
                }}
                className="bg-[#3D4654] hover:bg-[#4d5664] border-0"
              >
                Cancel
              </Button>
              <Button
                onClick={handleRestoreConfirm}
                disabled={isRestoreLoading}
                className="bg-green-700 hover:bg-green-800 border-0 text-white"
              >
                {isRestoreLoading ? "Restoring..." : "Restore User"}
              </Button>
            </ModalFooter>
          </div>
        </Modal>
      )}

      {/* Delete School Year Confirmation Modal */}
      {isDeleteSchoolYearModalOpen && schoolYearToDelete && (
        <Modal
          isOpen={isDeleteSchoolYearModalOpen}
          onClose={() => {
            setIsDeleteSchoolYearModalOpen(false);
            setSchoolYearToDelete(null);
          }}
          showCloseButton={true}
        >
          <div className="bg-transparent">
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="w-6 h-6 text-red-400" />
              <h3 className="text-lg font-bold text-white">Confirm Delete School Year</h3>
            </div>
            <p className="text-gray-300 mb-6">
              Are you sure you want to delete the school year{" "}
              <span className="font-semibold text-[#A3AED0]">
                S.Y. {schoolYearToDelete}
              </span>
              ? This will permanently delete all archived violation records for this school year and cannot be undone.
            </p>
            <ModalFooter>
              <Button
                variant="secondary"
                onClick={() => {
                  setIsDeleteSchoolYearModalOpen(false);
                  setSchoolYearToDelete(null);
                }}
                className="bg-[#3D4654] hover:bg-[#4d5664] border-0"
                disabled={isSchoolYearActionLoading}
              >
                Cancel
              </Button>
              <Button
                onClick={handleDeleteSchoolYear}
                disabled={isSchoolYearActionLoading}
                className="bg-red-700 hover:bg-red-800 border-0 text-white"
              >
                {isSchoolYearActionLoading ? "Deleting..." : "Delete School Year"}
              </Button>
            </ModalFooter>
          </div>
        </Modal>
      )}

      {/* Delete Semester Confirmation Modal */}
      {isDeleteSemesterModalOpen && semesterToDelete && (
        <Modal
          isOpen={isDeleteSemesterModalOpen}
          onClose={() => {
            setIsDeleteSemesterModalOpen(false);
            setSemesterToDelete(null);
          }}
          showCloseButton={true}
        >
          <div className="bg-transparent">
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="w-6 h-6 text-red-400" />
              <h3 className="text-lg font-bold text-white">Confirm Delete Semester</h3>
            </div>
            <p className="text-gray-300 mb-6">
              Are you sure you want to delete{" "}
              <span className="font-semibold text-[#A3AED0]">
                {semesterToDelete.semester}
              </span>{" "}
              from{" "}
              <span className="font-semibold text-[#A3AED0]">
                S.Y. {semesterToDelete.schoolYear}
              </span>
              ? This will permanently delete archived records for that semester only and cannot be undone.
            </p>
            <ModalFooter>
              <Button
                variant="secondary"
                onClick={() => {
                  setIsDeleteSemesterModalOpen(false);
                  setSemesterToDelete(null);
                }}
                className="bg-[#3D4654] hover:bg-[#4d5664] border-0"
                disabled={isSemesterActionLoading}
              >
                Cancel
              </Button>
              <Button
                onClick={handleDeleteSemester}
                disabled={isSemesterActionLoading}
                className="bg-red-700 hover:bg-red-800 border-0 text-white"
              >
                {isSemesterActionLoading ? "Deleting..." : "Delete Semester"}
              </Button>
            </ModalFooter>
          </div>
        </Modal>
      )}

      {/* Delete Archived Violation Modal */}
      {isDeleteArchivedViolationModalOpen && archivedViolationToDelete && (
        <Modal
          isOpen={isDeleteArchivedViolationModalOpen}
          onClose={() => {
            setIsDeleteArchivedViolationModalOpen(false);
            setArchivedViolationToDelete(null);
          }}
          showCloseButton={true}
        >
          <div className="bg-transparent">
            <div className="flex items-center gap-3 mb-2">
              <AlertCircle className="w-6 h-6 text-red-400" />
              <h3 className="text-lg font-bold text-white">Confirm Delete</h3>
            </div>
            <p className="text-gray-300 mb-4">
              Are you sure you want to delete this archived violation? This action cannot be undone.
            </p>
            <ModalFooter>
              <Button
                variant="secondary"
                onClick={() => {
                  setIsDeleteArchivedViolationModalOpen(false);
                  setArchivedViolationToDelete(null);
                }}
                className="bg-[#3D4654] hover:bg-[#4d5664] border-0"
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirmDeleteArchivedViolation}
                disabled={isLoading}
                className="bg-red-700 hover:bg-red-800 border-0 text-white"
              >
                {isLoading ? "Deleting..." : "Delete"}
              </Button>
            </ModalFooter>
          </div>
        </Modal>
      )}

      {/* Rename School Year Modal */}
      {isRenameSchoolYearModalOpen && schoolYearToRename && (
        <Modal
          isOpen={isRenameSchoolYearModalOpen}
          onClose={() => {
            setIsRenameSchoolYearModalOpen(false);
            setSchoolYearToRename(null);
            setNewSchoolYearName("");
          }}
          showCloseButton={true}
        >
          <div className="bg-transparent">
            <div className="flex items-center gap-3 mb-4">
              <Edit className="w-6 h-6 text-blue-400" />
              <h3 className="text-lg font-bold text-white">Rename School Year</h3>
            </div>
            <p className="text-gray-300 mb-4">
              Enter a new name for the school year{" "}
              <span className="font-semibold text-[#A3AED0]">
                S.Y. {schoolYearToRename}
              </span>
              :
            </p>
            <div className="mb-6">
              <input
                type="text"
                value={newSchoolYearName}
                onChange={(e) => setNewSchoolYearName(e.target.value)}
                className="w-full px-3 py-2 bg-[#23262B] border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-[#A3AED0]"
                placeholder="e.g., 2024-2025"
                disabled={isSchoolYearActionLoading}
              />
            </div>
            <ModalFooter>
              <Button
                variant="secondary"
                onClick={() => {
                  setIsRenameSchoolYearModalOpen(false);
                  setSchoolYearToRename(null);
                  setNewSchoolYearName("");
                }}
                className="bg-[#3D4654] hover:bg-[#4d5664] border-0"
                disabled={isSchoolYearActionLoading}
              >
                Cancel
              </Button>
              <Button
                onClick={handleRenameSchoolYear}
                disabled={isSchoolYearActionLoading || !newSchoolYearName.trim() || newSchoolYearName.trim() === schoolYearToRename}
                className="bg-blue-700 hover:bg-blue-800 border-0 text-white"
              >
                {isSchoolYearActionLoading ? "Renaming..." : "Rename School Year"}
              </Button>
            </ModalFooter>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default Archives;
