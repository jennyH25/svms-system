import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import AnimatedContent from "../../components/ui/AnimatedContent";
import Card from "../../components/ui/Card";
import StatCard from "../../components/ui/StatCard";
import Button from "../../components/ui/Button";
import DataTable from "../../components/ui/DataTable";
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
import EditViolationModal from "@/components/modals/EditViolationModal";
import Modal, { ModalFooter } from "@/components/ui/Modal";
import { getAuditHeaders } from "@/lib/auditHeaders";

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

const StudentViolation = () => {
  const location = useLocation();
  const [showLogModal, setShowLogModal] = useState(false);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [signatureTarget, setSignatureTarget] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [isEditUnclearing, setIsEditUnclearing] = useState(false);
  const [expandedRemarks, setExpandedRemarks] = useState(new Set());
  const [confirmAction, setConfirmAction] = useState(null);
  const [isConfirmingAction, setIsConfirmingAction] = useState(false);
  const [records, setRecords] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [signatureSuccessModal, setSignatureSuccessModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState("excel");
  const [isExporting, setIsExporting] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [sortOrder, setSortOrder] = useState("A-Z");
  const [selectedYear, setSelectedYear] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const shouldOpenModal =
      location.state?.openLogModal || params.get("openLog") === "true";
    if (shouldOpenModal) {
      setShowLogModal(true);
    }
  }, [location]);

  const fetchStudentViolations = async ({ silent = false } = {}) => {
    if (!silent) setIsLoading(true);
    try {
      const response = await fetch("/api/student-violations");
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.message || "Unable to load records.");
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
    } catch (error) {
      alert(error.message || "Unable to clear record.");
    }
  };

  const openConfirmModal = (type, row) => {
    setConfirmAction({ type, row });
  };

  const closeConfirmModal = () => {
    if (isConfirmingAction) return;
    setConfirmAction(null);
  };

  const handleConfirmAction = async () => {
    if (!confirmAction?.row) return;

    setIsConfirmingAction(true);
    try {
      if (confirmAction.type === "delete") {
        await deleteRecord(confirmAction.row);
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
    } catch (error) {
      alert(error.message || "Unable to unclear record.");
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

  const handleSignatureSave = async (signatureImage) => {
    if (!signatureTarget?.id) return;

    try {
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
      mergeRecord(result.record);
      // Update editTarget so the edit modal reflects the new signature immediately
      setEditTarget((prev) =>
        prev ? { ...prev, signature_image: signatureImage } : prev,
      );
      setSignatureTarget(null);
      setShowSignatureModal(false);
      setSignatureSuccessModal(true);
    } catch (error) {
      setSignatureTarget(null);
      setShowSignatureModal(false);
      alert(error.message || "Unable to save signature.");
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

  const getLastNameText = (fullName) => {
    const parts = String(fullName || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (parts.length === 0) return "";
    return parts[parts.length - 1].toLowerCase();
  };

  const hasActiveFilters =
    Boolean(searchTerm.trim()) ||
    sortOrder !== "A-Z" ||
    Boolean(selectedYear) ||
    Boolean(selectedDate) ||
    Boolean(selectedStatus);

  const resetFilters = () => {
    setSearchTerm("");
    setSortOrder("A-Z");
    setSelectedYear("");
    setSelectedDate("");
    setSelectedStatus("");
  };

  const filteredRecords = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return records
      .filter((row) => {
        const matchesSearch =
          !query ||
          String(row.full_name || "").toLowerCase().includes(query) ||
          String(row.school_id || "").toLowerCase().includes(query) ||
          String(row.violation_label || "").toLowerCase().includes(query);

        const matchesStatus =
          !selectedStatus ||
          (selectedStatus === "Cleared"
            ? Boolean(row.cleared_at)
            : !row.cleared_at);

        return (
          matchesSearch &&
          matchesStatus &&
          yearMatches(row, selectedYear) &&
          dateMatches(row, selectedDate)
        );
      })
      .sort((a, b) => {
        const lastNameA = getLastNameText(a.full_name);
        const lastNameB = getLastNameText(b.full_name);
        const fullNameA = String(a.full_name || "").trim().toLowerCase();
        const fullNameB = String(b.full_name || "").trim().toLowerCase();

        if (lastNameA === lastNameB) {
          if (fullNameA === fullNameB) {
            return Number(b.id) - Number(a.id);
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
  }, [records, searchTerm, selectedStatus, selectedYear, selectedDate, sortOrder]);

  const metrics = useMemo(() => {
    const pending = records.filter((row) => !row.cleared_at).length;
    const cleared = records.filter((row) => row.cleared_at).length;
    const atRisk = new Set(
      records.filter((row) => !row.cleared_at).map((row) => row.student_id),
    ).size;

    return {
      pending,
      cleared,
      atRisk,
      total: records.length,
    };
  }, [records]);

  const columns = [
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
    { key: "yearSection", label: "Year/Section" },
    { key: "violation", label: "Violation" },
    { key: "reportedBy", label: "Reported by" },
    {
      key: "remarks",
      label: "Remarks",
      render: (_value, row) => {
        const text = String(row.remarks || "-");
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
              className="h-8 w-24 object-contain bg-white rounded border border-gray-200"
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
            <Check className="w-4 h-4" /> Cleared
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
      studentNameText: row.full_name || "",
      studentIdText: row.school_id || "",
      yearSection: row.year_section || "",
      violation: row.violation_label || row.violation_name || "",
      reportedBy: row.reported_by || "-",
      remarks: row.remarks || "-",
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
        violation: row.violation || "",
        reportedBy: row.reportedBy || "-",
        remarks: row.remarks || "-",
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
      views: [{ state: "frozen", ySplit: 6 }],
    });

    sheet.columns = [
      { key: "no", width: 6 },
      { key: "date", width: 13 },
      { key: "studentName", width: 22 },
      { key: "schoolId", width: 14 },
      { key: "yearSection", width: 12 },
      { key: "violation", width: 38 },
      { key: "reportedBy", width: 17 },
      { key: "remarks", width: 24 },
      { key: "signature", width: 16 },
      { key: "status", width: 14 },
    ];

    // Header image space and report header rows (compact, PDF-like spacing).
    sheet.mergeCells("A1:J3");
    sheet.mergeCells("A4:J4");
    sheet.mergeCells("A5:J5");
    sheet.getRow(1).height = 26;
    sheet.getRow(2).height = 26;
    sheet.getRow(3).height = 26;
    sheet.getRow(4).height = 28;
    sheet.getRow(5).height = 18;

    const titleCell = sheet.getCell("A4");
    titleCell.value = "Student Violation Report";
    titleCell.font = { name: "Calibri", size: 18, bold: true };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };

    const subtitleCell = sheet.getCell("A5");
    subtitleCell.value = `Generated: ${new Date().toLocaleString()}`;
    subtitleCell.font = { name: "Calibri", size: 11, color: { argb: "FF4B5563" } };
    subtitleCell.alignment = { horizontal: "center", vertical: "middle" };

    // Deterministic centered header image placement in A1:J3 region.
    const headerRegionWidthPx = sheet.columns.reduce(
      (total, column) => total + (Number(column.width || 10) * 7.5),
      0,
    );
    const headerRegionHeightPx = [1, 2, 3].reduce(
      (total, rowNumber) => total + (Number(sheet.getRow(rowNumber).height || 15) * 1.333),
      0,
    );
    const leftOffsetPx = Math.max(
      (headerRegionWidthPx - EXCEL_HEADER_IMAGE_WIDTH_PX) / 2,
      0,
    );
    const topOffsetPx = Math.max(
      (headerRegionHeightPx - EXCEL_HEADER_IMAGE_HEIGHT_PX) / 2,
      0,
    );
    const toColCoordinate = (pixelOffset) => {
      let remaining = pixelOffset;
      for (let colIndex = 0; colIndex < sheet.columns.length; colIndex += 1) {
        const colPx = Number(sheet.columns[colIndex]?.width || 10) * 7.5;
        if (remaining <= colPx) {
          return colIndex + remaining / colPx;
        }
        remaining -= colPx;
      }
      return sheet.columns.length - 1;
    };

    const toRowCoordinate = (pixelOffset) => {
      let remaining = pixelOffset;
      for (let rowIndex = 1; rowIndex <= 3; rowIndex += 1) {
        const rowPx = Number(sheet.getRow(rowIndex).height || 15) * 1.333;
        if (remaining <= rowPx) {
          return (rowIndex - 1) + remaining / rowPx;
        }
        remaining -= rowPx;
      }
      return 2;
    };

    const imageId = workbook.addImage({ base64: dataUrl, extension: "png" });
    sheet.addImage(imageId, {
      tl: {
        col: toColCoordinate(leftOffsetPx),
        row: toRowCoordinate(topOffsetPx),
      },
      ext: {
        width: EXCEL_HEADER_IMAGE_WIDTH_PX,
        height: EXCEL_HEADER_IMAGE_HEIGHT_PX,
      },
    });

    // Table header.
    const headerRowNumber = 6;
    const headerRow = sheet.getRow(headerRowNumber);
    headerRow.values = [
      "No",
      "Date",
      "Student Name",
      "School ID",
      "Year/Section",
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
    const { dataUrl, imageFormat } = await resolveHeaderImage();
    let startY = 22;

    if (dataUrl) {
      const imgProps = doc.getImageProperties(dataUrl);
      const maxHeaderWidth = 220;
      const calculatedHeight = (imgProps.height * maxHeaderWidth) / imgProps.width;
      const headerWidth = Math.min(maxHeaderWidth, 260);
      const headerHeight = calculatedHeight;
      const headerX = (doc.internal.pageSize.getWidth() - headerWidth) / 2;
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
          "Year/Section",
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
        4: { cellWidth: 22 },
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
      alert("No rows available to export.");
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
    confirmAction?.type === "delete" ? "Delete Violation Log" : "Mark as Cleared";

  const confirmModalMessage =
    confirmAction?.type === "delete"
      ? "This will permanently delete this student violation log."
      : "This will mark the selected violation as cleared.";

  return (
    <div className="text-white">
      <AnimatedContent>
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-xl font-semibold tracking-wide">STUDENT VIOLATION</h2>
          <div className="flex gap-3">
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

      <div className="grid grid-cols-2 gap-4 mt-6 mb-6 w-full h-full">
        <AnimatedContent delay={0.05}>
          <Card className="h-full min-h-[110px] col-span-3 flex flex-col justify-between items-start px-6 py-5 w-full transition-all duration-300 hover:shadow-lg hover:shadow-white/5 hover:border-white/20 hover:scale-[1.02]">
            <div className="flex w-full justify-between items-center mb-2">
              <span className="text-lg font-black font-inter">Student Analytics</span>
              <span className="text-green-400 font-bold text-sm">+0%</span>
            </div>
            <div className="w-full h-12 flex items-center justify-center bg-gradient-to-b from-[#A3AED0]/30 to-transparent rounded-lg border border-white/10 mt-2">
              <span className="text-gray-400 text-sm">[Chart Placeholder]</span>
            </div>
          </Card>
        </AnimatedContent>

        <div className="grid grid-cols-2 gap-4 w-full h-full">
          <AnimatedContent delay={0.1}>
            <StatCard
              title="At-Risk Students"
              value={metrics.atRisk}
              percentage={0}
              icon={<TrendingUp />}
              className="col-span-1 min-w-[220px] h-full w-full"
            />
          </AnimatedContent>
          <AnimatedContent delay={0.2}>
            <StatCard
              title="Violations"
              value={metrics.total}
              percentage={0}
              icon={<TrendingDown />}
              className="col-span-1 min-w-[220px] h-full w-full"
            />
          </AnimatedContent>
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
                <Button variant="secondary" size="sm" className="min-w-[90px] justify-between">
                  {selectedStatus || "Status"}
                  <ChevronDown className="ml-2 w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => setSelectedStatus("")}>All</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSelectedStatus("Cleared")}>Cleared</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSelectedStatus("Pending")}>Pending</DropdownMenuItem>
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
            Generate
          </Button>
        </div>
      </AnimatedContent>

      <AnimatedContent delay={0.5}>
        {isLoading ? (
          <div className="text-gray-300">Loading...</div>
        ) : (
          <DataTable columns={columns} data={tableData} actions={actions} />
        )}
      </AnimatedContent>

      <LogNewViolationModal
        isOpen={showLogModal}
        onClose={() => setShowLogModal(false)}
        onSaved={(record) => {
          if (record) {
            setRecords((prev) => [record, ...prev]);
          } else {
            fetchStudentViolations();
          }
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
    </div>
  );
};

export default StudentViolation;
