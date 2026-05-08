import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import AnimatedContent from "../../components/ui/AnimatedContent";
import Card from "../../components/ui/Card";
import StatCard from "../../components/ui/StatCard";
import AnalyticsLineGraph from "../../components/ui/AnalyticsLineGraph";
import Button from "../../components/ui/Button";
import DataTable from "../../components/ui/DataTable";
import TableTabs from "../../components/ui/TableTabs";
import {
  Plus,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  Download,
  Check,
  Edit,
  CheckCircle,
  PenTool,
  Archive,
  Minus,
  Trash2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "../../components/ui/dropdown-menu";
import SearchBar from "@/components/ui/SearchBar";
import LogNewViolationModal from "@/components/modals/LogNewViolationModal";
import SignaturePadModal from "@/components/modals/SignaturePadModal";
import SignaturePreviewModal from "@/components/modals/SignaturePreviewModal";
import EditViolationModal from "@/components/modals/EditViolationModal";
import EditSemesterYearModal from "@/components/modals/EditSemesterYearModal";
import ArchiveViolationModal from "@/components/modals/ArchiveViolationModal";
import Modal, { ModalFooter } from "@/components/ui/Modal";
import AlertModal from "@/components/ui/AlertModal";
import { getAuditHeaders } from "@/lib/auditHeaders";
import { cachedFetchJSON, invalidateFetchCache } from "@/lib/fetchHelper";
import { formatStudentDisplayName, pluralize } from '@/lib/utils';
import {
  addCenteredExcelHeaderImage,
  applyExcelPrintLayout,
  getExcelColumnLetter,
} from "@/lib/excelExportLayout";

const EXPORT_HEADER_IMAGE_PATH = "/plpasig_header.png";

const blobToDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

const detectDataUrlImageFormat = (dataUrl) => {
  if (String(dataUrl || "").startsWith("data:image/jpeg")) {
    return "JPEG";
  }
  return "PNG";
};

const EXCEL_HEADER_IMAGE_WIDTH_PX = 560;
const EXCEL_HEADER_IMAGE_HEIGHT_PX = 82;

const getDataUrlDimensions = (dataUrl) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
    };
    img.onerror = () => reject(new Error("Unable to load image dimensions."));
    img.src = dataUrl;
  });

const formatProgramYearSection = (program, yearSection) => {
  const programText = String(program || "").trim();
  const yearSectionText = String(yearSection || "").trim();

  if (programText && yearSectionText) {
    return `${programText}-${yearSectionText}`;
  }

  return programText || yearSectionText || "";
};

const normalizeRemarksText = (value) => {
  const text = String(value ?? "").trim();
  if (!text || text === "-") return "";
  return text;
};

const getDisplaySemester = (semester, schoolYear) => {
  const normalizedSemester = String(semester || "").trim().toUpperCase();
  const normalizedSchoolYear = String(schoolYear || "").trim();
  if (normalizedSemester === "1ST SEM" && normalizedSchoolYear === "2025-2026") {
    return "2ND SEM";
  }
  return normalizedSemester || semester || "";
};

const StudentViolation = () => {
  const location = useLocation();
  const [showLogModal, setShowLogModal] = useState(false);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [signatureTarget, setSignatureTarget] = useState(null);
  const [previewSignatureImage, setPreviewSignatureImage] = useState("");
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [isEditUnclearing, setIsEditUnclearing] = useState(false);
  const [expandedRemarks, setExpandedRemarks] = useState(new Set());
  const [confirmAction, setConfirmAction] = useState(null);
  const [isConfirmingAction, setIsConfirmingAction] = useState(false);
  const [records, setRecords] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [signatureSuccessModal, setSignatureSuccessModal] = useState(false);
  const [isSignatureSaving, setIsSignatureSaving] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showExportAlertModal, setShowExportAlertModal] = useState(false);
  const [exportAlertMessage, setExportAlertMessage] = useState("");
  const [exportFormat, setExportFormat] = useState("excel");
  const [isExporting, setIsExporting] = useState(false);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [currentSemester, setCurrentSemester] = useState("");
  const [currentSchoolYear, setCurrentSchoolYear] = useState("");
  const [archiveSuccessMessage, setArchiveSuccessMessage] = useState("");
  const [showEditSemesterModal, setShowEditSemesterModal] = useState(false);
  const [showAnalyticsDetailModal, setShowAnalyticsDetailModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorModalMessage, setErrorModalMessage] = useState("");
  const [analyticsData, setAnalyticsData] = useState({
    cards: {
      activeViolations: { percentChange: 0 },
      warningStudents: { percentChange: 0 },
      atRiskStudents: { percentChange: 0 },
      highRiskStudents: { percentChange: 0 },
    },
    studentAnalytics: {
      graphData: [0, 0, 0, 0],
      predictedNextTerm: null,
      predictedChangePercent: 0,
    },
  });
  const [clearSuccessModal, setClearSuccessModal] = useState({
    isOpen: false,
    message: "",
  });

  const [searchTerm, setSearchTerm] = useState("");
  const [sortOrder, setSortOrder] = useState("A-Z");
  const [selectedYear, setSelectedYear] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [activeStatusTab, setActiveStatusTab] = useState("pending");
  const [selectedRiskLevel, setSelectedRiskLevel] = useState("");
  const [selectedViolationIds, setSelectedViolationIds] = useState(new Set());
  const [showSelectionCheckboxes, setShowSelectionCheckboxes] = useState(false);

  const openSignaturePreview = useCallback((imageSrc) => {
    if (!imageSrc) return;
    setPreviewSignatureImage(imageSrc);
  }, []);

  const closeSignaturePreview = useCallback(() => {
    setPreviewSignatureImage("");
  }, []);

  const statusTabs = [
    { key: "pending", label: "Pending" },
    { key: "cleared", label: "Clear" },
  ];

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const shouldOpenModal =
      location.state?.openLogModal || params.get("openLog") === "true";
    if (shouldOpenModal) {
      setShowLogModal(true);
    }
  }, [location]);

  const loadCurrentSettings = useCallback(async (forceRefresh = false) => {
    try {
      const result = await cachedFetchJSON("/api/archive/current-settings", {
        headers: { ...getAuditHeaders() },
      }, {
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

  const fetchViolationAnalytics = async () => {
    try {
      const result = await cachedFetchJSON("/api/violation-analytics", {
        headers: { ...getAuditHeaders() },
      }, {
        ttlMs: 15000,
        staleWhileRevalidate: true,
      });
      const data = result.data || {};
      if (result.status !== "ok" || data?.status !== "ok") {
        return;
      }

      // Keep original history counts so we can run a local forecast and show ranges
      const remoteHistoryCounts = Array.isArray(data?.studentAnalytics?.historyCounts)
        ? data.studentAnalytics.historyCounts.map((v) => Number(v) || 0)
        : null;

      setAnalyticsData({
        cards: {
          activeViolations: {
            percentChange:
              Number(data?.cards?.activeViolations?.percentChange) || 0,
          },
          warningStudents: {
            percentChange:
              Number(data?.cards?.warningStudents?.percentChange) || 0,
          },
          atRiskStudents: {
            percentChange: Number(data?.cards?.atRiskStudents?.percentChange) || 0,
          },
          highRiskStudents: {
            percentChange:
              Number(data?.cards?.highRiskStudents?.percentChange) || 0,
          },
        },
        studentAnalytics: {
          // graphData remains a visual normalization used by the chart
          graphData:
            remoteHistoryCounts && data?.studentAnalytics?.predictedNextTerm
              ? [
                  ...remoteHistoryCounts,
                  Number(data.studentAnalytics.predictedNextTerm.predictedViolations) || 0,
                ]
              : Array.isArray(data?.studentAnalytics?.graphData)
                ? data.studentAnalytics.graphData
                : [0, 0, 0, 0],
          // Store raw history counts for client-side re-calculation
          historyCounts: remoteHistoryCounts,
          predictedNextTerm: data?.studentAnalytics?.predictedNextTerm || null,
          predictedChangePercent:
            Number(data?.studentAnalytics?.predictedChangePercent) || 0,
        },
      });
    } catch {
      // Keep existing fallback values if analytics loading fails.
    }
  };

  // ---------------------- Client-side forecast helpers ----------------------
  // Ported simple forecasting logic so the UI can compute a fallback and a
  // conservative range (lower/upper) to show possible violation counts.
  const calculateLinearRegressionNextY = (points) => {
    if (!Array.isArray(points) || points.length === 0) return 0;
    if (points.length === 1) return points[0].y || 0;
    const n = points.length;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;
    points.forEach((p) => {
      sumX += p.x;
      sumY += p.y;
      sumXY += p.x * p.y;
      sumXX += p.x * p.x;
    });
    const denom = n * sumXX - sumX * sumX;
    if (denom === 0) return points[points.length - 1].y || 0;
    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;
    const nextX = points.length;
    return slope * nextX + intercept;
  };

  const calculateClientForecast = (historyCounts = []) => {
    if (!Array.isArray(historyCounts) || historyCounts.length === 0) return {pred:0, low:0, high:0};
    const values = historyCounts.map((v) => Number(v) || 0);
    const lastValue = values[values.length - 1] || 0;

    const regressionPoints = values.map((v, i) => ({ x: i, y: v }));
    const regressionPrediction = Math.max(0, calculateLinearRegressionNextY(regressionPoints));

    const recentSlice = values.slice(-3);
    const recentWeights = [0.2, 0.3, 0.5].slice(3 - recentSlice.length);
    const recentWeightTotal = recentWeights.reduce((s, w) => s + w, 0) || 1;
    const recentPrediction = recentSlice.reduce((s, val, idx) => s + val * recentWeights[idx], 0) / recentWeightTotal;

    const allMean = values.reduce((s, v) => s + v, 0) / values.length;

    // weights tuned to prefer recent data but include trend
    let regressionWeight = values.length >= 6 ? 0.5 : values.length >= 3 ? 0.35 : 0.2;
    let recentWeight = values.length >= 6 ? 0.35 : values.length >= 3 ? 0.5 : 0.7;
    const totalW = regressionWeight + recentWeight;
    regressionWeight /= totalW; recentWeight /= totalW;

    let forecast = regressionPrediction * regressionWeight + recentPrediction * recentWeight;
    if (!Number.isFinite(forecast) || forecast < 0) forecast = allMean;

    // Conservative bounds using variability
    const maxRecent = recentSlice.length ? Math.max(...recentSlice) : lastValue;
    const std = Math.sqrt(values.reduce((s, v) => s + Math.pow(v - allMean, 2), 0) / values.length) || 0;
    const upper = Math.round(Math.max(forecast, maxRecent, lastValue) + Math.max(2, std * 1.5));
    const lower = Math.round(Math.max(0, Math.min(lastValue, Math.floor(forecast * 0.4))));

    return { pred: Math.max(0, Math.round(forecast)), low: Math.max(0, lower), high: Math.max(upper, Math.round(forecast)) };
  };

  const fetchStudentViolations = async ({ silent = false, forceRefresh = false } = {}) => {
    if (!silent) setIsLoading(true);
    try {
      const result = await cachedFetchJSON("/api/student-violations", {
        headers: { ...getAuditHeaders() },
      }, {
        ttlMs: 12000,
        staleWhileRevalidate: true,
        forceRefresh,
      });
      const data = result.data || {};
      if (result.status !== "ok") {
        throw new Error(result.error || data?.message || "Unable to load records.");
      }
      setRecords(Array.isArray(data.records) ? data.records : []);
    } catch (error) {
      if (!silent) alert(error.message || "Unable to load records.");
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  const mergeRecord = (updated) => {
    if (!updated) return;
    setRecords((prev) => prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)));
  };

  useEffect(() => {
    fetchStudentViolations();
    fetchViolationAnalytics();
  }, []);

  const deleteRecord = async (row) => {
    try {
      const response = await fetch(`/api/student-violations/${row.id}`, {
        method: "DELETE",
        headers: {
          ...getAuditHeaders(),
        },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.message || "Unable to delete record.");
      }
      setRecords((prev) => prev.filter((r) => r.id !== row.id));
      invalidateFetchCache("/api/students");
      window.dispatchEvent(new CustomEvent("studentViolationUpdated", {
        detail: { studentId: Number(row.student_id || row.studentId || 0) },
      }));
    } catch (error) {
      alert(error.message || "Unable to delete record.");
    }
  };

  const clearRecord = async (row) => {
    try {
      const response = await fetch(`/api/student-violations/${row.id}/clear`, {
        method: "PUT",
        headers: {
          ...getAuditHeaders(),
        },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.message || "Unable to clear record.");
      }
      mergeRecord(result.record);
      window.localStorage.setItem("archiveRefresh", Date.now().toString());
      window.dispatchEvent(
        new CustomEvent("archiveCompleted", {
          detail: {
            source: "studentViolation",
          },
        }),
      );
      setClearSuccessModal({
        isOpen: true,
        message: `The violation for ${row.full_name || "this student"} has been marked as cleared.`,
      });
      invalidateFetchCache("/api/students");
      window.dispatchEvent(new CustomEvent("studentViolationUpdated", {
        detail: { studentId: Number(row.student_id || row.studentId || 0) },
      }));
    } catch (error) {
      const message = error?.message || "Unable to clear record.";
      if (message.toLowerCase().includes("signature is required")) {
        setErrorModalMessage(message);
        setShowErrorModal(true);
      } else {
        alert(message);
      }
    }
  };
  const openConfirmModal = (type, row) => {
    setConfirmAction({ type, row });
  };

  const closeConfirmModal = () => {
    if (isConfirmingAction) return;
    setConfirmAction(null);
  };

  const deleteSelectedViolations = async (ids) => {
    if (!Array.isArray(ids) || ids.length === 0) return;

    const failedIds = [];
    const deletedIds = [];

    for (const violationId of ids) {
      try {
        const response = await fetch(`/api/student-violations/${violationId}`, {
          method: "DELETE",
          headers: {
            ...getAuditHeaders(),
          },
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(result?.message || "Unable to delete record.");
        }
        deletedIds.push(violationId);
      } catch (error) {
        failedIds.push(violationId);
      }
    }

    if (deletedIds.length > 0) {
      setRecords((prev) => prev.filter((r) => !deletedIds.includes(r.id)));
      setSelectedViolationIds((prev) => {
        const next = new Set(prev);
        deletedIds.forEach((id) => next.delete(id));
        return next;
      });
      invalidateFetchCache("/api/students");
      window.dispatchEvent(new CustomEvent("studentViolationUpdated"));
    }

    if (failedIds.length > 0) {
      alert(
        `Failed to delete ${failedIds.length} selected violation${failedIds.length === 1 ? '' : 's'}. Please try again.`,
      );
    }
  };

  const handleConfirmAction = async () => {
    if (!confirmAction) return;

    setIsConfirmingAction(true);
    try {
      if (confirmAction.type === "delete") {
        await deleteRecord(confirmAction.row);
      }
      if (confirmAction.type === "bulk-delete") {
        await deleteSelectedViolations(confirmAction.ids || []);
      }
      if (confirmAction.type === "clear") {
        await clearRecord(confirmAction.row);
      }
      setConfirmAction(null);
    } finally {
      setIsConfirmingAction(false);
    }
  };

  const handleUnclear = async (row) => {
    if (!window.confirm("Unclear this violation and reopen it?")) return;

    try {
      const response = await fetch(`/api/student-violations/${row.id}/unclear`, {
        method: "PUT",
        headers: {
          ...getAuditHeaders(),
        },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.message || "Unable to unclear record.");
      }
      mergeRecord(result.record);
      invalidateFetchCache("/api/students");
      window.dispatchEvent(new CustomEvent("studentViolationUpdated", {
        detail: { studentId: Number(result.record?.student_id || result.record?.studentId || 0) },
      }));
    } catch (error) {
      alert(error.message || "Unable to unclear record.");
    }
  };

  const handleArchiveComplete = (archiveData) => {
    setCurrentSemester(getDisplaySemester(archiveData.nextSemester, archiveData.nextSchoolYear));
    setCurrentSchoolYear(archiveData.nextSchoolYear);
    
    let message = `Archive completed! ${archiveData.archivedCount || 0} violations moved to archive.`;
    if (archiveData.studentPromotedCount > 0) {
      message += ` Students promoted: +${archiveData.studentPromotedCount} year level.`;
    }
    setArchiveSuccessMessage(message);
    console.log("Archive completed:", archiveData);
    
    // CRITICAL: Clear the data immediately from UI (optimistic update)
    setRecords([]);
    
    // Trigger events to notify Archives tab
    window.localStorage.setItem("archiveRefresh", Date.now().toString());
    window.dispatchEvent(new CustomEvent("archiveCompleted", { detail: {
      ...archiveData,
      preservedYearSections: archiveData.preservedYearSections || {},
      source: "archive", // used by Archives tab to route properly
    }}));

    // Small delay to ensure database is fully updated, then refetch to confirm clearance
    setTimeout(() => {
      fetchStudentViolations({ silent: true }).catch(err => {
        console.error("Error refetching violations:", err);
      });
    }, 1000);
    
    // Clear message after 5 seconds
    setTimeout(() => {
      setArchiveSuccessMessage("");
    }, 5000);
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

  const handleEditUnclear = async () => {
    if (!editTarget?.id) return;

    setIsEditUnclearing(true);
    try {
      const response = await fetch(`/api/student-violations/${editTarget.id}/unclear`, {
        method: "PUT",
        headers: {
          ...getAuditHeaders(),
        },
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.message || "Unable to unclear record.");
      }

      mergeRecord(result.record);
      setShowEditModal(false);
      setEditTarget(null);
    } catch (error) {
      alert(error.message || "Unable to unclear record.");
    } finally {
      setIsEditUnclearing(false);
    }
  };

  const handleEditSave = async (recordId, payload) => {
    try {
      const response = await fetch(`/api/student-violations/${recordId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...getAuditHeaders(),
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.message || "Unable to update record.");
      }

      mergeRecord(result.record);
      setShowEditModal(false);
      setEditTarget(null);
    } catch (error) {
      alert(error.message || "Unable to update record.");
    }
  };

  const handleEditSignatureUpdate = () => {
    if (!editTarget) return;
    // Open signature pad on top of edit modal (don't close edit modal)
    setSignatureTarget(editTarget);
    setShowSignatureModal(true);
  };

  const handleAttachSignatureFromTable = (row) => {
    if (!row?.raw?.id) return;
    setSignatureTarget(row.raw);
    setShowSignatureModal(true);
  };

  const handleToggleCheckbox = (violationId) => {
    setShowSelectionCheckboxes(true);
    setSelectedViolationIds((prev) => {
      const next = new Set(prev);
      if (next.has(violationId)) {
        next.delete(violationId);
      } else {
        next.add(violationId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedViolationIds.size === filteredRecords.length) {
      setSelectedViolationIds(new Set());
      setShowSelectionCheckboxes(false);
      return;
    }

    setSelectedViolationIds(new Set(filteredRecords.map((row) => row.id)));
    setShowSelectionCheckboxes(true);
  };

  const handleHeaderToggle = () => {
    setShowSelectionCheckboxes(true);
    setSelectedViolationIds(new Set(filteredRecords.map((row) => row.id)));
  };

  const handleRowSelect = (row) => {
    handleToggleCheckbox(row.id);
  };

  const handleBulkDelete = () => {
    if (selectedViolationIds.size === 0) {
      alert("Please select at least one violation record to delete.");
      return;
    }

    setConfirmAction({
      type: "bulk-delete",
      ids: Array.from(selectedViolationIds),
    });
  };

  useEffect(() => {
    if (selectedViolationIds.size === 0 && showSelectionCheckboxes) {
      setShowSelectionCheckboxes(false);
    }
  }, [selectedViolationIds, showSelectionCheckboxes]);

  const handleSignatureSave = async (signatureImage) => {
    if (!signatureTarget?.id) return;

    setIsSignatureSaving(true);
    setShowSignatureModal(false); // close right away for quick feedback

    try {
      // Optimistic update: immediately update records and editTarget for instant feedback
      mergeRecord({ id: signatureTarget.id, signature_image: signatureImage });
      setEditTarget((prev) =>
        prev ? { ...prev, signature_image: signatureImage } : prev,
      );

      // Show success modal immediately for instant feedback (don't wait for API)
      setSignatureTarget(null);
      setSignatureSuccessModal(true);
      setIsSignatureSaving(false);

      // Confirm with server in background
      const response = await fetch(
        `/api/student-violations/${signatureTarget.id}/signature`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...getAuditHeaders(),
          },
          body: JSON.stringify({ signatureImage }),
        },
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.message || "Unable to save signature.");
      }
      
      // Use the full record from API response to ensure data consistency
      if (result.record) {
        mergeRecord(result.record);
      }
    } catch (error) {
      setSignatureTarget(null);
      setErrorModalMessage(error.message || "Unable to save signature.");
      setShowErrorModal(true);
      setSignatureSuccessModal(false); // close success modal if there's an error
      setIsSignatureSaving(false);
    }
  };

  const yearMatches = (row, selectedYearValue) => {
    if (!selectedYearValue) return true;
    const yearMap = {
      "1st Year": /^.*1/i,
      "2nd Year": /^.*2/i,
      "3rd Year": /^.*3/i,
      "4th Year": /^.*4/i,
    };
    const regex = yearMap[selectedYearValue];
    return regex ? regex.test(String(row.year_section || "")) : true;
  };

  const dateMatches = (row, range) => {
    if (!range) return true;
    const created = new Date(row.created_at);
    if (Number.isNaN(created.getTime())) return false;

    const today = new Date();
    if (range === "Today") {
      return created.toDateString() === today.toDateString();
    }
    if (range === "This Week") {
      const start = new Date(today);
      start.setDate(today.getDate() - today.getDay());
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(start.getDate() + 7);
      return created >= start && created < end;
    }
    if (range === "This Month") {
      return (
        created.getMonth() === today.getMonth() &&
        created.getFullYear() === today.getFullYear()
      );
    }
    if (range === "This Year") {
      return created.getFullYear() === today.getFullYear();
    }
    return true;
  };

  const getLastNameText = (record) => {
    const parts = String(formatStudentDisplayName(record) || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (parts.length === 0) return "";
    return parts[parts.length - 1].toLowerCase();
  };

  const getRecordedTimestamp = (row) => {
    const recordedAt = new Date(row.created_at);
    if (Number.isNaN(recordedAt.getTime())) {
      return 0;
    }
    return recordedAt.getTime();
  };

  const hasActiveFilters =
    Boolean(searchTerm.trim()) ||
    sortOrder !== "A-Z" ||
    Boolean(selectedYear) ||
    Boolean(selectedDate) ||
    Boolean(selectedRiskLevel);

  const resetFilters = () => {
    setSearchTerm("");
    setSortOrder("A-Z");
    setSelectedYear("");
    setSelectedDate("");
    setSelectedRiskLevel("");
  };

  const studentRiskById = useMemo(() => {
    const degreeRank = {
      "First Degree": 1,
      "Second Degree": 2,
      "Third Degree": 3,
      "Fourth Degree": 4,
      "Fifth Degree": 5,
      "Sixth Degree": 6,
      "Seventh Degree": 7,
    };

    const activeByStudent = records.reduce((acc, row) => {
      if (row.cleared_at) return acc;
      const studentId = Number(row.student_id);
      if (!studentId) return acc;

      if (!acc[studentId]) {
        acc[studentId] = { count: 0, maxDegree: 0 };
      }

      acc[studentId].count += 1;
      const rank = degreeRank[String(row.violation_degree)] || 0;
      acc[studentId].maxDegree = Math.max(acc[studentId].maxDegree, rank);
      return acc;
    }, {});

    const riskMap = {};
    Object.entries(activeByStudent).forEach(([studentId, data]) => {
      if (data.count >= 5 || (data.maxDegree >= 5 && data.maxDegree <= 7)) {
        riskMap[studentId] = "High-risk";
      } else if ((data.count >= 3 && data.count <= 4) || (data.maxDegree >= 3 && data.maxDegree <= 4)) {
        riskMap[studentId] = "At-risk";
      } else if (data.count === 2 || data.maxDegree === 2) {
        riskMap[studentId] = "Warning";
      }
    });

    return riskMap;
  }, [records]);

  const filteredRecords = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return records
      .filter((row) => {
        const displayName = formatStudentDisplayName(row).toLowerCase();
        const matchesSearch =
          !query ||
          displayName.includes(query) ||
          String(row.full_name || "").toLowerCase().includes(query) ||
          String(row.school_id || "").toLowerCase().includes(query) ||
          String(row.program || "").toLowerCase().includes(query) ||
          String(row.violation_label || "").toLowerCase().includes(query);

        const matchesTab =
          activeStatusTab === "cleared"
            ? Boolean(row.cleared_at)
            : !row.cleared_at;

        const studentRisk = studentRiskById[String(Number(row.student_id))] || "";
        const matchesRisk = !selectedRiskLevel || studentRisk === selectedRiskLevel;

        return (
          matchesSearch &&
          matchesTab &&
          matchesRisk &&
          yearMatches(row, selectedYear) &&
          dateMatches(row, selectedDate)
        );
      })
      .sort((a, b) => {
        const recordedTimeDiff =
          getRecordedTimestamp(a) - getRecordedTimestamp(b);
        if (recordedTimeDiff !== 0) {
          return recordedTimeDiff;
        }

        const lastNameA = getLastNameText(a);
        const lastNameB = getLastNameText(b);
        const fullNameA = formatStudentDisplayName(a).toLowerCase();
        const fullNameB = formatStudentDisplayName(b).toLowerCase();

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
    records,
    searchTerm,
    activeStatusTab,
    selectedRiskLevel,
    selectedYear,
    selectedDate,
    sortOrder,
    studentRiskById,
  ]);

  const metrics = useMemo(() => {
    const degreeRank = {
      "First Degree": 1,
      "Second Degree": 2,
      "Third Degree": 3,
      "Fourth Degree": 4,
      "Fifth Degree": 5,
      "Sixth Degree": 6,
      "Seventh Degree": 7,
    };

    const pending = records.filter((row) => !row.cleared_at).length;
    const cleared = records.filter((row) => row.cleared_at).length;

    // Calculate violation data per student (active violations only)
    const activeRecords = records.filter((row) => !row.cleared_at);
    const studentData = activeRecords.reduce((acc, rec) => {
      const studentId = Number(rec.student_id);
      if (!studentId) return acc;

      if (!acc[studentId]) {
        acc[studentId] = { count: 0, maxDegree: 0 };
      }

      acc[studentId].count += 1;
      const rank = degreeRank[String(rec.violation_degree)] || 0;
      acc[studentId].maxDegree = Math.max(acc[studentId].maxDegree, rank);
      return acc;
    }, {});

    // Count students by highest severity category
    let warning = 0;
    let atRisk = 0;
    let highRisk = 0;

    Object.values(studentData).forEach((data) => {
      // Categorize by highest severity
      if (data.count >= 5 || (data.maxDegree >= 5 && data.maxDegree <= 7)) {
        highRisk += 1;
      } else if ((data.count >= 3 && data.count <= 4) || (data.maxDegree >= 3 && data.maxDegree <= 4)) {
        atRisk += 1;
      } else if (data.count === 2 || data.maxDegree === 2) {
        warning += 1;
      }
    });

    return {
      pending,
      cleared,
      warning,
      atRisk,
      highRisk,
      total: records.length,
    };
  }, [records]);

  const columns = [
    {
      key: "select",
      label: showSelectionCheckboxes ? (
        <input
          type="checkbox"
          checked={selectedViolationIds.size === filteredRecords.length && filteredRecords.length > 0}
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
      width: "w-10",
      render: (_value, row) => {
        if (!showSelectionCheckboxes) {
          return null;
        }

        return (
          <input
            type="checkbox"
            checked={selectedViolationIds.has(row.id)}
            onChange={() => handleToggleCheckbox(row.id)}
            onClick={(e) => e.stopPropagation()}
            className="w-4 h-4 cursor-pointer"
          />
        );
      },
    },
    { key: "no", label: "No", width: "w-10" },
    { key: "date", label: "Date" },
    {
      key: "studentNameText",
      label: "Student Name",
      render: (_value, row) => (
        <span>
          <b>{row.studentNameText}</b>
          <br />
          <span className="text-xs text-gray-500">{row.studentIdText}</span>
        </span>
      ),
    },
    { key: "yearSection", label: "Program - year/section" },
    { key: "violation", label: "Violation" },
    { key: "reportedBy", label: "Reported by" },
    {
      key: "remarks",
      label: "Remarks",
      render: (_value, row) => {
        const text = normalizeRemarksText(row.remarks);
        const maxLetters = 20;
        const needsToggle = text.length > maxLetters;
        const isExpanded = expandedRemarks.has(row.id);
        const shownText =
          needsToggle && !isExpanded
            ? `${text.slice(0, maxLetters)}...`
            : text;

        return (
          <div className="max-w-[260px]">
            <p className="text-sm break-words">{shownText}</p>
            {needsToggle ? (
              <button
                type="button"
                className="text-xs text-cyan-300 hover:text-cyan-200 mt-1"
                onClick={() => {
                  setExpandedRemarks((prev) => {
                    const next = new Set(prev);
                    if (next.has(row.id)) {
                      next.delete(row.id);
                    } else {
                      next.add(row.id);
                    }
                    return next;
                  });
                }}
              >
                {isExpanded ? "View less" : "View more..."}
              </button>
            ) : null}
          </div>
        );
      },
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
              className="h-8 w-24 cursor-zoom-in object-contain rounded border border-gray-200 bg-white transition hover:opacity-90"
              onClick={() => openSignaturePreview(row.signatureImage)}
            />
          </div>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            className="px-3 py-1 h-7 text-xs gap-1"
            onClick={() => handleAttachSignatureFromTable(row)}
          >
            <PenTool className="w-3 h-3" />
            Attach
          </Button>
        ),
    },
    {
      key: "status",
      label: "Status",
      render: (_value, row) =>
        row.clearedAt ? (
          <div className="flex flex-col items-start gap-1">
            <span className="flex items-center gap-2 text-green-700 font-semibold">
              <Check className="w-4 h-4" /> Cleared
            </span>
            <span className="text-xs text-gray-500">{row.clearedAt}</span>
          </div>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            className="bg-[#A3AED0] text-white px-3 py-1 gap-2"
            onClick={() => openConfirmModal("clear", row)}
          >
            <Check className="w-4 h-4" /> Clear
          </Button>
        ),
    },
  ];

  const tableData = filteredRecords.map((row, index) => {
    const created = new Date(row.created_at);
    const cleared = row.cleared_at ? new Date(row.cleared_at) : null;

    return {
      id: row.id,
      no: index + 1,
      date: created.toLocaleDateString(),
      studentNameText: formatStudentDisplayName(row),
      studentIdText: row.school_id || "",
      yearSection: formatProgramYearSection(row.program, row.year_section),
      program: row.program || "",
      violation: row.violation_label || row.violation_name || "",
      reportedBy: row.reported_by || "-",
      remarks: normalizeRemarksText(row.remarks),
      signatureImage: row.signature_image || "",
      clearedAt: cleared
        ? `${cleared.toLocaleDateString()} ${cleared.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}`
        : "",
      raw: row,
    };
  });

  const exportRows = useMemo(
    () =>
      tableData.map((row) => ({
        no: row.no,
        date: row.date,
        studentName: row.studentNameText || "",
        schoolId: row.studentIdText || "",
        yearSection: row.yearSection || "",
        program: row.program || "",
        violation: row.violation || "",
        reportedBy: row.reportedBy || "-",
        remarks: normalizeRemarksText(row.remarks),
        signatureImage: row.signatureImage || "",
        status: row.clearedAt ? `Cleared (${row.clearedAt})` : "Pending",
      })),
    [tableData],
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
    const imageFormat = String(blob.type || "").toLowerCase().includes("jpeg")
      ? "JPEG"
      : "PNG";

    return { dataUrl, imageFormat };
  }, []);

  const exportAsExcel = useCallback(async () => {
    const [{ Workbook }, { dataUrl }] = await Promise.all([
      import("exceljs"),
      resolveHeaderImage(),
    ]);

    const workbook = new Workbook();
    const sheet = workbook.addWorksheet("Student Violations", {
      views: [{ state: "frozen", ySplit: 11 }],
    });
    applyExcelPrintLayout(sheet, { orientation: "landscape" });

    sheet.columns = [
      { key: "no", width: 6 },
      { key: "date", width: 13 },
      { key: "studentName", width: 22 },
      { key: "schoolId", width: 14 },
      { key: "yearSection", width: 22.22 },
      { key: "violation", width: 38 },
      { key: "reportedBy", width: 17 },
      { key: "remarks", width: 24 },
      { key: "signature", width: 16 },
      { key: "status", width: 14 },
    ];

    const headerCellEnd = getExcelColumnLetter(sheet.columns.length);
    sheet.mergeCells(`A1:${headerCellEnd}8`);
    sheet.mergeCells(`A9:${headerCellEnd}9`);
    sheet.mergeCells(`A10:${headerCellEnd}10`);
    for (let i = 1; i <= 8; i += 1) {
      sheet.getRow(i).height = i <= 7 ? 26 : 18;
    }
    sheet.getRow(9).height = 28;
    sheet.getRow(10).height = 18;

    const titleCell = sheet.getCell("A9");
    titleCell.value = "Student Violation Report";
    titleCell.font = { name: "Calibri", size: 18, bold: true };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };

    const subtitleCell = sheet.getCell("A10");
    subtitleCell.value = `Generated: ${new Date().toLocaleString()}`;
    subtitleCell.font = { name: "Calibri", size: 11, color: { argb: "FF4B5563" } };
    subtitleCell.alignment = { horizontal: "center", vertical: "middle" };

    const dimensions = await getDataUrlDimensions(dataUrl);
    addCenteredExcelHeaderImage({
      workbook,
      sheet,
      dataUrl,
      extension: "png",
      dimensions,
      rowStart: 1,
      rowEnd: 8,
    });

    // Table header.
    const headerRowNumber = 11;
    const headerRow = sheet.getRow(headerRowNumber);
    headerRow.values = [
      "No",
      "Date",
      "Student Name",
      "School ID",
      "Program - year/section",
      "Violation",
      "Reported By",
      "Remarks",
      "Signature",
      "Status",
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

    // Data rows.
    const firstDataRow = headerRowNumber + 1;
    for (const [index, row] of exportRows.entries()) {
      const excelRowNumber = firstDataRow + index;
      const excelRow = sheet.getRow(excelRowNumber);
      excelRow.values = [
        row.no,
        row.date,
        row.studentName,
        row.schoolId,
        row.yearSection,
        row.violation,
        row.reportedBy,
        row.remarks,
        "",
        row.status,
      ];
      excelRow.height = 34;

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

      // Place signature image in the Signature cell (I column) for this row.
      if (row.signatureImage) {
        const sigExt = String(row.signatureImage).startsWith("data:image/jpeg")
          ? "jpeg"
          : "png";
        const sigDims = await getDataUrlDimensions(row.signatureImage);
        const signatureColWidthUnits = sheet.columns[8]?.width || 16;
        const signatureColWidthPx = signatureColWidthUnits * 7.5;
        const rowHeightPx = (excelRow.height || 34) * 1.333;
        const maxSigWidth = Math.max(signatureColWidthPx - 12, 8);
        const maxSigHeight = Math.max(rowHeightPx - 8, 8);
        const sigScale = Math.min(
          maxSigWidth / sigDims.width,
          maxSigHeight / sigDims.height,
          1,
        );
        const drawWidth = Math.max(8, Math.round(sigDims.width * sigScale));
        const drawHeight = Math.max(8, Math.round(sigDims.height * sigScale));
        const xOffsetPx = (signatureColWidthPx - drawWidth) / 2;
        const yOffsetPx = (rowHeightPx - drawHeight) / 2;
        const signatureImageId = workbook.addImage({
          base64: row.signatureImage,
          extension: sigExt,
        });

        sheet.addImage(signatureImageId, {
          tl: {
            col: 8 + xOffsetPx / 7.5,
            row: excelRowNumber - 1 + yOffsetPx / rowHeightPx,
          },
          ext: { width: drawWidth, height: drawHeight },
        });
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const filename = `student_violations_${formatDateForFileName()}.xlsx`;
    downloadBlob(blob, filename);
  }, [downloadBlob, exportRows, resolveHeaderImage]);

  const exportAsPdf = useCallback(async () => {
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);

    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const margin = 10;
    const pageWidth = doc.internal.pageSize.getWidth();
    const { dataUrl, imageFormat } = await resolveHeaderImage();
    let startY = 22;

    if (dataUrl) {
      const imgProps = doc.getImageProperties(dataUrl);
      const headerWidth = pageWidth - margin * 2;
      const headerHeight = (imgProps.height * headerWidth) / imgProps.width;
      const headerX = margin;
      doc.addImage(dataUrl, imageFormat, headerX, 8, headerWidth, headerHeight);
      startY = 8 + headerHeight + 8;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Student Violation Report", 148.5, startY, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 148.5, startY + 5, {
      align: "center",
    });

    autoTable(doc, {
      startY: startY + 9,
      head: [
        [
          "No",
          "Date",
          "Student Name",
          "School ID",
          "Program - year/section",
          "Violation",
          "Reported By",
          "Remarks",
          "Signature",
          "Status",
        ],
      ],
      body: exportRows.map((row) => [
        row.no,
        row.date,
        row.studentName,
        row.schoolId,
        row.yearSection,
        row.violation,
        row.reportedBy,
        row.remarks,
        "",
        row.status,
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
      margin: { left: 10, right: 10 },
      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: 22 },
        2: { cellWidth: 36 },
        3: { cellWidth: 26 },
        4: { cellWidth: 24.44 },
        5: { cellWidth: 40 },
        6: { cellWidth: 26 },
        7: { cellWidth: 50 },
        8: { cellWidth: 22, minCellHeight: 12 },
        9: { cellWidth: 22 },
      },
      didDrawCell: (data) => {
        if (data.section !== "body" || data.column.index !== 8) {
          return;
        }

        const signatureImage = exportRows[data.row.index]?.signatureImage;
        if (!signatureImage) {
          return;
        }

        const imgFormat = detectDataUrlImageFormat(signatureImage);
        const maxW = Math.max(data.cell.width - 2, 2);
        const maxH = Math.max(data.cell.height - 2, 2);
        const imgW = Math.min(maxW, 18);
        const imgH = Math.min(maxH, 8);
        const imgX = data.cell.x + (data.cell.width - imgW) / 2;
        const imgY = data.cell.y + (data.cell.height - imgH) / 2;

        data.doc.addImage(signatureImage, imgFormat, imgX, imgY, imgW, imgH);
      },
    });

    doc.save(`student_violations_${formatDateForFileName()}.pdf`);
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

  const actions = [
    {
      label: "Edit",
      icon: <Edit className="w-4 h-4" />,
      onClick: (row) => {
        setEditTarget(row.raw);
        setShowEditModal(true);
      },
    },
    {
      label: "Delete",
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3m5 0H6"
          />
        </svg>
      ),
      onClick: (row) => openConfirmModal("delete", row.raw),
      variant: "danger",
    },
  ];

  const confirmModalTitle =
    confirmAction?.type === "delete"
      ? "Delete Violation Log"
      : confirmAction?.type === "bulk-delete"
      ? "Delete Selected Violations"
      : "Mark as Cleared";

  const confirmModalMessage =
    confirmAction?.type === "delete"
      ? "This will permanently delete this student violation log."
      : confirmAction?.type === "bulk-delete"
      ? `This will permanently delete ${confirmAction.ids?.length || 0} selected violation${confirmAction.ids?.length === 1 ? '' : 's'}.`
      : "This will mark the selected violation as cleared.";

  return (
    <div className="text-white">
      <AnimatedContent>
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-semibold tracking-wide">STUDENT VIOLATION</h2>
            {currentSemester && currentSchoolYear && (
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
            )}
          </div>
          <div className="flex gap-3">
            <Button
              variant="secondary"
              size="sm"
              className="gap-2 bg-amber-600/30 hover:bg-amber-600/50 border-amber-600/50 border"
              onClick={() => setShowArchiveModal(true)}
            >
              <Archive className="w-4 h-4" />
              Archive
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="gap-2 bg-[#4A5568] hover:bg-[#3d4654] border-0"
              onClick={() => setShowLogModal(true)}
            >
              <Plus className="w-4 h-4" />
              Log New Violation
            </Button>
          </div>
        </div>
      </AnimatedContent>

      <div className="flex flex-col xl:flex-row gap-6 mt-6 mb-6 w-full h-full items-stretch">
        {/* Analytics card: left, fills height */}
        <div className="flex-1 flex flex-col justify-stretch">
          <AnimatedContent delay={0.05}>
            <Card
              onClick={() => setShowAnalyticsDetailModal(true)}
              className="cursor-pointer h-full min-h-[240px] flex flex-col justify-between items-start px-8 py-6 w-full transition-all duration-300 hover:shadow-lg hover:shadow-white/5 hover:border-white/20 hover:scale-[1.02] rounded-2xl border border-white/10 shadow-md bg-[#232528]/80"
            >
              <div className="flex w-full justify-between items-center mb-4">
                <span className="text-lg font-black font-inter">Student Analytics</span>
                <span
                  className={`font-bold text-sm ${
                    analyticsData.studentAnalytics.predictedChangePercent >= 0
                      ? "text-green-400"
                      : "text-red-400"
                  }`}
                >
                  {analyticsData.studentAnalytics.predictedChangePercent >= 0 ? "+" : ""}
                  {analyticsData.studentAnalytics.predictedChangePercent}%
                </span>
              </div>
              <div className="w-full bg-gradient-to-b from-[#A3AED0]/30 to-transparent rounded-lg border border-white/10 mt-2 px-6 py-6 min-h-[140px] flex flex-col justify-between">
                <AnalyticsLineGraph
                  data={analyticsData.studentAnalytics.graphData}
                  color="#A3AED0"
                  height={110}
                  showDots
                  showAxis
                  showHoverLabel
                />
                <div
                  className="mt-4 rounded-2xl border border-white/10 px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                  style={{
                    backgroundImage:
                      "linear-gradient(135deg, rgb(67 70 77 / 42%), rgba(15, 23, 42, 0.4))",
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.22em] font-semibold text-emerald-100/60">
                        Forecast outlook
                      </p>
                      <p className="mt-1 text-sm font-semibold text-white">
                        Projected next-term violations
                      </p>
                    </div>
                    <span
                      className="rounded-full border border-emerald-300/20 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-emerald-100/75"
                      style={{ backgroundColor: "rgb(37 45 42 / 0.1)" }}
                    >
                      Predictive
                    </span>
                  </div>
                  <div className="mt-4 flex items-end justify-between gap-3">
                    {(() => {
                      const history = analyticsData.studentAnalytics.historyCounts || null;
                      const serverPred = analyticsData.studentAnalytics.predictedNextTerm?.predictedViolations ?? null;
                      const client = history ? calculateClientForecast(history) : null;
                      const displayPred = client ? client.pred : (serverPred ?? 0);
                      return (
                        <div className="flex items-baseline gap-2">
                          <span className="text-2xl font-semibold tracking-tight text-white">
                            {displayPred}
                          </span>
                          <span className="text-xs uppercase tracking-[0.16em] text-emerald-100/65">
                            violations
                          </span>
                          {client ? (
                            <span className="ml-2 text-[11px] text-emerald-100/60">({client.low}–{client.high})</span>
                          ) : serverPred != null ? (
                            <span className="ml-2 text-[11px] text-emerald-100/60">(model {serverPred})</span>
                          ) : null}
                        </div>
                      );
                    })()}
                    {analyticsData.studentAnalytics.predictedNextTerm?.label ? (
                      <span className="max-w-[55%] text-right text-[11px] font-medium text-emerald-50/70 break-words">
                        {analyticsData.studentAnalytics.predictedNextTerm.label}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            </Card>
          </AnimatedContent>
        </div>
        {/* Stat cards: right, vertically centered and fill height */}
        <div className="flex-[1.1] flex flex-col justify-center">
          <div className="grid grid-cols-2 grid-rows-2 gap-3 h-full">
            <AnimatedContent delay={0.1}>
              <StatCard
                title="Warning Students"
                value={metrics.warning}
                percentage={analyticsData.cards.warningStudents.percentChange}
                icon={<TrendingUp className="w-5 h-5 text-cyan-400" />}
                className="h-full w-full min-h-[120px] rounded-2xl border border-white/10 shadow-md bg-[#232528]/80 flex flex-col justify-between"
              />
            </AnimatedContent>
            <AnimatedContent delay={0.15}>
              <StatCard
                title="At-Risk Students"
                value={metrics.atRisk}
                percentage={analyticsData.cards.atRiskStudents.percentChange}
                icon={<TrendingUp className="w-5 h-5 text-yellow-400" />}
                className="h-full w-full min-h-[120px] rounded-2xl border border-white/10 shadow-md bg-[#232528]/80 flex flex-col justify-between"
              />
            </AnimatedContent>
            <AnimatedContent delay={0.2}>
              <StatCard
                title="High-Risk Students"
                value={metrics.highRisk}
                percentage={analyticsData.cards.highRiskStudents.percentChange}
                icon={<TrendingDown className="w-5 h-5 text-orange-400" />}
                className="h-full w-full min-h-[120px] rounded-2xl border border-white/10 shadow-md bg-[#232528]/80 flex flex-col justify-between"
              />
            </AnimatedContent>
            <AnimatedContent delay={0.25}>
              <StatCard
                title="Total Violations"
                value={metrics.total}
                percentage={analyticsData.cards.activeViolations.percentChange}
                icon={<TrendingDown className="w-5 h-5 text-red-400" />}
                className="h-full w-full min-h-[120px] rounded-2xl border border-white/10 shadow-md bg-[#232528]/80 flex flex-col justify-between"
              />
            </AnimatedContent>
          </div>
        </div>
      </div>

      <AnimatedContent delay={0.4}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <SearchBar
              placeholder="Student Name or School ID"
              className="w-64"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="sm" className="min-w-[90px] justify-between">
                  {sortOrder}
                  <ChevronDown className="ml-2 w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => setSortOrder("A-Z")}>A-Z</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortOrder("Z-A")}>Z-A</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="sm" className="min-w-[90px] justify-between">
                  {selectedDate || "Date"}
                  <ChevronDown className="ml-2 w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => setSelectedDate("")}>All</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSelectedDate("Today")}>Today</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSelectedDate("This Week")}>This Week</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSelectedDate("This Month")}>This Month</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSelectedDate("This Year")}>This Year</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="sm" className="min-w-[90px] justify-between">
                  {selectedYear || "Year"}
                  <ChevronDown className="ml-2 w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => setSelectedYear("")}>All</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSelectedYear("1st Year")}>1st Year</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSelectedYear("2nd Year")}>2nd Year</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSelectedYear("3rd Year")}>3rd Year</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSelectedYear("4th Year")}>4th Year</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="sm" className="min-w-[120px] justify-between">
                  {selectedRiskLevel || "Risk Level"}
                  <ChevronDown className="ml-2 w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => setSelectedRiskLevel("")}>All</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSelectedRiskLevel("Warning")}>Warning</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSelectedRiskLevel("At-risk")}>At-risk</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSelectedRiskLevel("High-risk")}>High-risk</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {hasActiveFilters ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={resetFilters}
                className="gap-2 bg-[#4A5568] hover:bg-[#3d4654] border-0"
              >
                Reset Filters
              </Button>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            {selectedViolationIds.size > 0 && (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  className="gap-2 bg-gray-600 hover:bg-gray-700 border-0"
                  onClick={() => setSelectedViolationIds(new Set())}
                >
                  <Minus className="w-4 h-4" />
                  Clear Selection
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="gap-2 bg-red-600/30 hover:bg-red-600/50 border-red-600/50 border"
                  onClick={handleBulkDelete}
                >
                  <Trash2 className="w-4 h-4" />
                  Delete  ({selectedViolationIds.size})
                </Button>
              </>
            )}
            <Button
              variant="secondary"
              size="sm"
              className="px-6 gap-2"
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

      <AnimatedContent delay={0.5}>
        <TableTabs
          tabs={statusTabs}
          activeTab={activeStatusTab}
          onTabChange={setActiveStatusTab}
          className="mb-4"
        />
      </AnimatedContent>

      <AnimatedContent delay={0.6}>
        {isLoading ? (
          <div className="text-gray-300">Loading...</div>
        ) : (
          <DataTable columns={columns} data={tableData} actions={actions} onRowClick={handleRowSelect} />
        )}
      </AnimatedContent>

      <LogNewViolationModal
        isOpen={showLogModal}
        onClose={() => setShowLogModal(false)}
        onSaved={async (record) => {
          if (record) {
            setRecords((prev) => [record, ...prev]);
          }

          // Ensure UI state exactly matches persisted DB state after logging.
          invalidateFetchCache("/api/student-violations");
          invalidateFetchCache("/api/students");
          window.dispatchEvent(new CustomEvent("studentViolationUpdated", {
            detail: { studentId: Number(record?.student_id || record?.studentId || 0) },
          }));
          await fetchStudentViolations({ silent: true, forceRefresh: true });
        }}
      />

      <Modal
        isOpen={showExportModal}
        onClose={() => {
          if (!isExporting) {
            setShowExportModal(false);
          }
        }}
        title={<span className="font-black font-inter">Export Student Violation Report</span>}
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

      <EditViolationModal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setEditTarget(null);
        }}
        record={editTarget}
        onSave={handleEditSave}
        onUnclear={handleEditUnclear}
        isUnclearing={isEditUnclearing}
        onUpdateSignature={handleEditSignatureUpdate}
      />

      <Modal
        isOpen={showAnalyticsDetailModal}
        onClose={() => setShowAnalyticsDetailModal(false)}
        title={<span className="font-black font-inter">Student Analytics Details</span>}
        size="lg"
      >
        <p className="text-sm text-gray-300 mb-4">
          View the student analytics trend and next term forecast in greater detail.
        </p>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 mb-4">
          <AnalyticsLineGraph
            data={analyticsData.studentAnalytics.graphData}
            color="#A3AED0"
            height={160}
            showDots
            showAxis
            showHoverLabel
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 min-h-[110px]">
            <p className="text-sm text-gray-400">Predicted change</p>
            <p className={`mt-3 text-3xl font-semibold ${analyticsData.studentAnalytics.predictedChangePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {analyticsData.studentAnalytics.predictedChangePercent >= 0 ? '+' : ''}{analyticsData.studentAnalytics.predictedChangePercent}%
            </p>
          </div>
          <div
            className="min-h-[110px] rounded-2xl border border-white/10 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
            style={{
              backgroundColor: "rgb(255 255 255 / 0.05)",
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-100/60">
                  Forecast outlook
                </p>
                <p className="mt-1 text-sm text-white/90">Projected next-term violations</p>
              </div>
              <span
                className="rounded-full border border-emerald-300/20 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-emerald-100/75"
                style={{ backgroundColor: "rgb(37 45 42 / 0.1)" }}
              >
                Predictive
              </span>
            </div>
            <div className="mt-4 flex items-end justify-between gap-4">
              {(() => {
                const history = analyticsData.studentAnalytics.historyCounts || null;
                const serverPred = analyticsData.studentAnalytics.predictedNextTerm?.predictedViolations ?? null;
                const client = history ? calculateClientForecast(history) : null;
                const displayPred = client ? client.pred : (serverPred ?? 0);
                return (
                  <div>
                    <p className="text-3xl font-semibold tracking-tight text-white">
                      {displayPred}
                    </p>
                    <p className="mt-1 text-xs uppercase tracking-[0.16em] text-emerald-100/65">
                      expected violations
                    </p>
                    {client ? (
                      <p className="mt-1 text-xs text-emerald-100/60">Estimated range: {client.low}–{client.high}</p>
                    ) : serverPred != null ? (
                      <p className="mt-1 text-xs text-emerald-100/60">Model prediction: {serverPred}</p>
                    ) : null}
                  </div>
                );
              })()}
              <p className="max-w-[52%] text-right text-xs text-emerald-50/70 whitespace-normal break-words">
                {analyticsData.studentAnalytics.predictedNextTerm?.label || "No term label available"}
              </p>
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showErrorModal}
        onClose={() => setShowErrorModal(false)}
        title={<span className="font-black font-inter">Signature Required</span>}
        size="md"
        showCloseButton={true}
      >
        <div className="rounded-xl border border-red-400/25 bg-red-500/10 px-4 py-3 mb-4">
          <p className="text-sm font-medium text-red-200">{errorModalMessage}</p>
        </div>
        <ModalFooter>
          <Button
            type="button"
            variant="primary"
            onClick={() => setShowErrorModal(false)}
            className="px-6 py-2.5"
          >
            OK
          </Button>
        </ModalFooter>
      </Modal>

      <Modal
        isOpen={Boolean(confirmAction)}
        onClose={closeConfirmModal}
        title={<span className="font-black font-inter">{confirmModalTitle}</span>}
        size="md"
        showCloseButton={!isConfirmingAction}
      >
        <div
          className={`rounded-xl border px-4 py-3 mb-4 ${
            confirmAction?.type === "delete"
              ? "border-red-400/25 bg-red-500/10"
              : "border-amber-400/25 bg-amber-500/10"
          }`}
        >
          <p
            className={`text-sm font-medium ${
              confirmAction?.type === "delete" ? "text-red-300" : "text-amber-200"
            }`}
          >
            {confirmModalMessage}
          </p>
        </div>
        <ModalFooter>
          <Button
            type="button"
            variant="outline"
            onClick={closeConfirmModal}
            disabled={isConfirmingAction}
            className="px-6 py-2.5"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant={confirmAction?.type === "delete" ? "danger" : "primary"}
            onClick={handleConfirmAction}
            disabled={isConfirmingAction}
            className="px-6 py-2.5"
          >
            {isConfirmingAction
              ? "Processing..."
              : confirmAction?.type === "delete"
                ? "Delete"
                : "Clear"}
          </Button>
        </ModalFooter>
      </Modal>

      <Modal
        isOpen={isConfirmingAction && confirmAction?.type === "clear"}
        onClose={() => {}}
        title={<span className="font-black font-inter">Clearing Violation</span>}
        size="sm"
        showCloseButton={false}
      >
        <div className="flex flex-col items-center justify-center py-8 gap-4">
          <div className="animate-spin">
            <div className="w-10 h-10 border-4 border-amber-500/20 border-t-amber-400 rounded-full"></div>
          </div>
          <p className="text-gray-300 text-sm">Updating the student violation record...</p>
        </div>
      </Modal>

      <Modal
        isOpen={clearSuccessModal.isOpen}
        onClose={() => setClearSuccessModal({ isOpen: false, message: "" })}
        title={
          <span className="font-black font-inter flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-400" />
            Violation Cleared
          </span>
        }
        size="sm"
        showCloseButton
      >
        <div className="rounded-lg border border-green-400/25 bg-green-500/10 px-4 py-3 mb-4">
          <p className="text-sm font-medium text-green-300">
            {clearSuccessModal.message || "The violation has been marked as cleared."}
          </p>
        </div>
        <ModalFooter>
          <Button
            variant="primary"
            onClick={() => setClearSuccessModal({ isOpen: false, message: "" })}
            className="px-6"
          >
            OK
          </Button>
        </ModalFooter>
      </Modal>

      <SignaturePreviewModal
        isOpen={Boolean(previewSignatureImage)}
        onClose={closeSignaturePreview}
        imageSrc={previewSignatureImage}
        alt="Student signature preview"
      />

      {showSignatureModal ? (
        <SignaturePadModal
          isOpen={showSignatureModal}
          onClose={() => {
            setShowSignatureModal(false);
            setSignatureTarget(null);
          }}
          onSave={handleSignatureSave}
        />
      ) : null}

      <Modal
        isOpen={isSignatureSaving}
        onClose={() => {}}
        title={<span className="font-black font-inter">Adding Signature</span>}
        size="sm"
        showCloseButton={false}
      >
        <div className="flex flex-col items-center justify-center py-8 gap-4">
          <div className="animate-spin">
            <div className="w-10 h-10 border-4 border-blue-500/20 border-t-blue-500 rounded-full"></div>
          </div>
          <p className="text-gray-300 text-sm">Processing your signature...</p>
        </div>
      </Modal>

      <Modal
        isOpen={signatureSuccessModal}
        onClose={() => setSignatureSuccessModal(false)}
        title={<span className="font-black font-inter flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-green-400" />
          Signature Saved
        </span>}
        size="sm"
        showCloseButton
      >
        <div className="rounded-lg border border-green-400/25 bg-green-500/10 px-4 py-3 mb-4">
          <p className="text-sm font-medium text-green-300">
            The digital signature has been successfully saved.
          </p>
        </div>
        <ModalFooter>
          <Button
            variant="primary"
            onClick={() => setSignatureSuccessModal(false)}
            className="px-6"
          >
            OK
          </Button>
        </ModalFooter>
      </Modal>

      <EditSemesterYearModal
        isOpen={showEditSemesterModal}
        onClose={() => setShowEditSemesterModal(false)}
        currentSemester={currentSemester}
        currentSchoolYear={currentSchoolYear}
        onSave={handleSaveSemesterYear}
      />

      <ArchiveViolationModal
        isOpen={showArchiveModal}
        onClose={() => setShowArchiveModal(false)}
        onArchive={handleArchiveComplete}
      />

      {archiveSuccessMessage && (
        <div className="fixed bottom-4 right-4 bg-green-500/10 border border-green-500/40 rounded-lg px-4 py-3 text-green-300 text-sm font-medium max-w-sm z-50 animate-in fade-in">
          {archiveSuccessMessage}
        </div>
      )}
    </div>
  );
};

export default StudentViolation;
