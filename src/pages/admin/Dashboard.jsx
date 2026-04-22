import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Card from "../../components/ui/Card";
import AdminStatCard from "../../components/ui/AdminStatCard";
import {
  AddViolationButton,
  ViewStudentsButton,
} from "../../components/ui/QuickActionButton";
import AnimatedContent from "../../components/ui/AnimatedContent";
import Modal, { ModalFooter } from "../../components/ui/Modal";
import AlertModal from "../../components/ui/AlertModal";
import Button from "../../components/ui/Button";
import DataTable, {
  TableCellText,
  TableCellDateTime,
  TableCellBadge,
} from "../../components/ui/DataTable";
import SearchBar from "../../components/ui/SearchBar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronDown,
  AlertTriangle,
  Users,
  Trash2,
  Maximize2,
  X,
  Download,
  Search,
} from "lucide-react";
import { cachedFetchJSON } from "@/lib/fetchHelper";

const RANKING_EXPORT_HEADER_IMAGE_PATH = "/plpasig_header.jpg";
const EXCEL_HEADER_IMAGE_WIDTH_PX = 560;
const EXCEL_HEADER_IMAGE_HEIGHT_PX = 82;

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

const normalizeSemester = (value) => {
  const text = String(value || "").trim().toUpperCase();
  if (!text) return "";
  if (text.includes("SUM")) return "SUMMER";
  if (text.includes("1")) return "1ST SEM";
  if (text.includes("2")) return "2ND SEM";
  return "";
};

const formatSemesterLabel = (value) => {
  const normalized = normalizeSemester(value);
  if (normalized === "1ST SEM") return "1st Sem";
  if (normalized === "2ND SEM") return "2nd Sem";
  if (normalized === "SUMMER") return "Summer";
  return "";
};

const parseYearSection = (value) => {
  const normalized = String(value || "").trim().toUpperCase();
  if (!normalized) {
    return { year: "", section: "", normalized: "" };
  }

  const compact = normalized.replace(/\s+/g, "");
  const match = compact.match(/^(\d+)([A-Z]+)?$/);
  if (match) {
    return {
      year: match[1] || "",
      section: match[2] || "",
      normalized: `${match[1] || ""}${match[2] || ""}`,
    };
  }

  const yearMatch = compact.match(/\d+/);
  const sectionMatch = compact.match(/[A-Z]+/);
  const year = yearMatch ? yearMatch[0] : "";
  const section = sectionMatch ? sectionMatch[0] : "";
  return {
    year,
    section,
    normalized: `${year}${section}`,
  };
};

const Dashboard = () => {
  const navigate = useNavigate();
  const [selectedSemester, setSelectedSemester] = useState("1st Sem");
  const [trendModalOpen, setTrendModalOpen] = useState(false);
  const [rankingModalOpen, setRankingModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [programFilter, setProgramFilter] = useState("All");
  const [yearLevelFilter, setYearLevelFilter] = useState("All");
  const [sectionFilter, setSectionFilter] = useState("All");
  const [recentActivity, setRecentActivity] = useState([]);
  const [isLoadingActivity, setIsLoadingActivity] = useState(true);
  const [activityModalOpen, setActivityModalOpen] = useState(false);
  const [violationMetrics, setViolationMetrics] = useState({
    activeViolations: 0,
    warningStudents: 0,
    atRiskStudents: 0,
    highRiskStudents: 0,
  });
  const [isLoadingMetrics, setIsLoadingMetrics] = useState(true);
  const [metricComparisons, setMetricComparisons] = useState({
    activeViolations: 0,
    warningStudents: 0,
    atRiskStudents: 0,
    highRiskStudents: 0,
  });
  const [trendBySemester, setTrendBySemester] = useState({
    "1st Sem": [],
    "2nd Sem": [],
    Summer: [],
  });
  const [trendTermBySemester, setTrendTermBySemester] = useState({});
  const [selectedSchoolYear, setSelectedSchoolYear] = useState("");
  const [availableSchoolYears, setAvailableSchoolYears] = useState([]);
  const [availableSemestersBySchoolYear, setAvailableSemestersBySchoolYear] = useState({});
  const [currentSemester, setCurrentSemester] = useState("");
  const [currentSchoolYear, setCurrentSchoolYear] = useState("");
  const [ongoingSemesters, setOngoingSemesters] = useState({});
  const hasInitializedTrendSelectionRef = useRef(false);

  const [rankingData, setRankingData] = useState([]);
  const [isLoadingRanking, setIsLoadingRanking] = useState(true);
  const [showRankingExportModal, setShowRankingExportModal] = useState(false);
  const [showRankingExportAlertModal, setShowRankingExportAlertModal] = useState(false);
  const [showTrendExportConfirmModal, setShowTrendExportConfirmModal] = useState(false);
  const [showTrendExportAlertModal, setShowTrendExportAlertModal] = useState(false);
  const [trendExportAlertMessage, setTrendExportAlertMessage] = useState("");
  const [rankingExportFormat, setRankingExportFormat] = useState("excel");
  const [isExportingRanking, setIsExportingRanking] = useState(false);
  const [isTrendExporting, setIsTrendExporting] = useState(false);
  const [rankingExportAlertMessage, setRankingExportAlertMessage] = useState("");
  const [hoveredTrendPointIndex, setHoveredTrendPointIndex] = useState(null);

  const filteredRankingData = rankingData.filter((student) => {
    const matchesSearch = student.name
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const matchesProgram =
      programFilter === "All" || student.program === programFilter;
    const matchesYear =
      yearLevelFilter === "All" || student.year === yearLevelFilter;
    const matchesSection =
      sectionFilter === "All" || student.section === sectionFilter;
    return matchesSearch && matchesProgram && matchesYear && matchesSection;
  });

  const programFilterOptions = useMemo(
    () =>
      Array.from(new Set(rankingData.map((student) => String(student.program || "").trim()).filter(Boolean))).sort(),
    [rankingData],
  );

  const yearFilterOptions = useMemo(
    () =>
      Array.from(new Set(rankingData.map((student) => String(student.year || "").trim()).filter(Boolean))).sort(
        (a, b) => Number(a) - Number(b),
      ),
    [rankingData],
  );

  const sectionFilterOptions = useMemo(
    () =>
      Array.from(new Set(rankingData.map((student) => String(student.section || "").trim()).filter(Boolean))).sort(),
    [rankingData],
  );

  const availableSemesterOptions = useMemo(() => {
    const semesterOrder = {
      "1st Sem": 1,
      "2nd Sem": 2,
      Summer: 3,
    };

    const semesters = Array.isArray(availableSemestersBySchoolYear[selectedSchoolYear])
      ? availableSemestersBySchoolYear[selectedSchoolYear]
      : [];

    const labels = semesters
      .map((semester) => formatSemesterLabel(semester))
      .filter(Boolean);

    const fallbackLabels = ["1st Sem", "2nd Sem", "Summer"];
    return Array.from(new Set(labels.length > 0 ? labels : fallbackLabels)).sort(
      (left, right) => (semesterOrder[left] || 99) - (semesterOrder[right] || 99),
    );
  }, [availableSemestersBySchoolYear, selectedSchoolYear]);

  const rankingExportRows = useMemo(
    () =>
      filteredRankingData.map((student) => ({
        rank: student.rank,
        studentName: student.name,
        schoolId: student.id,
        program: student.program,
        year: student.year,
        section: student.section,
        totalViolations: student.violations,
      })),
    [filteredRankingData],
  );

  const selectedTrendData = useMemo(() => {
    const fallback = [
      { label: "Sep", count: 0 },
      { label: "Oct", count: 0 },
      { label: "Nov", count: 0 },
    ];
    const trendRows = Array.isArray(trendBySemester?.[selectedSemester])
      ? trendBySemester[selectedSemester]
      : [];

    if (!trendRows.length) {
      return fallback;
    }

    const monthOrderBySemester = {
      "1st Sem": ["Jun", "Jul", "Aug", "Sep", "Oct", "Nov"],
      "2nd Sem": ["Dec", "Jan", "Feb", "Mar", "Apr", "May"],
      Summer: ["May", "Jun"],
    };

    const aggregate = trendRows.reduce((acc, row) => {
      const label = String(row?.label || "").trim();
      if (!label) return acc;
      const count = Number(row?.count) || 0;
      acc.set(label, (acc.get(label) || 0) + count);
      return acc;
    }, new Map());

    const ordered = monthOrderBySemester[selectedSemester] || [];
    const normalized = ordered
      .filter((label) => aggregate.has(label))
      .map((label) => ({ label, count: aggregate.get(label) || 0 }));

    return normalized.length ? normalized : trendRows;
  }, [selectedSemester, trendBySemester]);

  const selectedTrendRawData = useMemo(
    () => (Array.isArray(trendBySemester?.[selectedSemester]) ? trendBySemester[selectedSemester] : []),
    [selectedSemester, trendBySemester],
  );

  const selectedTrendTerm = useMemo(() => {
    const term = trendTermBySemester[selectedSemester] || null;
    if (term && ongoingSemesters[selectedSemester]) {
      return {
        ...term,
        label: `${term.label} (Ongoing)`,
        isOngoing: true,
      };
    }
    return term;
  }, [selectedSemester, trendTermBySemester, ongoingSemesters]);

  const selectedTrendTermLabel = useMemo(() => {
    const fallbackLabel = selectedSchoolYear
      ? `${selectedSemester} (S.Y. ${selectedSchoolYear})`
      : selectedSemester;

    if (!selectedTrendTerm?.label) {
      return ongoingSemesters[selectedSemester]
        ? `${fallbackLabel} (Ongoing)`
        : fallbackLabel;
    }

    return selectedTrendTerm.label;
  }, [selectedTrendTerm, selectedSemester, selectedSchoolYear, ongoingSemesters]);

  const selectedTrendGraphData = useMemo(
    () => selectedTrendData.map((entry) => Number(entry.count) || 0),
    [selectedTrendData],
  );

  const trendSummary = useMemo(() => {
    if (!selectedTrendData.length) {
      return {
        first: { label: "-", count: 0 },
        peak: { label: "-", count: 0 },
        latest: { label: "-", count: 0 },
      };
    }

    const first = selectedTrendData[0];
    const latest = selectedTrendData[selectedTrendData.length - 1];
    const peak = selectedTrendData.reduce((best, current) =>
      (Number(current.count) || 0) > (Number(best.count) || 0) ? current : best,
    );

    return { first, peak, latest };
  }, [selectedTrendData]);

  const dashboardTrendChart = useMemo(() => {
    const width = 920;
    const height = 250;
    const left = 38;
    const right = 18;
    const top = 14;
    const bottom = 36;
    const chartWidth = width - left - right;
    const chartHeight = height - top - bottom;

    const counts = selectedTrendData.map((entry) => Number(entry.count) || 0);
    const maxCount = Math.max(...counts, 1);
    const maxTick = Math.max(4, Math.ceil(maxCount / 2) * 2);
    const yTicks = Array.from(
      new Set([0, Math.round(maxTick / 3), Math.round((maxTick * 2) / 3), maxTick]),
    ).sort((a, b) => a - b);

    const points = counts.map((count, index) => {
      const x =
        counts.length <= 1
          ? left + chartWidth / 2
          : left + (index / (counts.length - 1)) * chartWidth;
      const y = top + ((maxTick - count) / maxTick) * chartHeight;
      return {
        x,
        y,
        count,
        label: selectedTrendData[index]?.label || "",
        index,
      };
    });

    const linePath = points.reduce((acc, point, index) => {
      if (index === 0) {
        return `M ${point.x} ${point.y}`;
      }
      const prev = points[index - 1];
      const cpX = (prev.x + point.x) / 2;
      return `${acc} Q ${cpX} ${prev.y}, ${point.x} ${point.y}`;
    }, "");

    const areaPath = points.length
      ? `${linePath} L ${points[points.length - 1].x} ${top + chartHeight} L ${points[0].x} ${top + chartHeight} Z`
      : "";

    const peakIndex = counts.reduce((bestIndex, value, index) =>
      value > counts[bestIndex] ? index : bestIndex,
    0);

    const startPoint = points[0] || { label: "-", count: 0 };
    const peakPoint = points[peakIndex] || startPoint;
    const latestPoint = points[points.length - 1] || startPoint;

    return {
      width,
      height,
      left,
      right,
      top,
      bottom,
      chartHeight,
      yTicks,
      points,
      linePath,
      areaPath,
      startPoint,
      peakPoint,
      latestPoint,
      peakIndex,
    };
  }, [selectedTrendData]);

  const createTrendChartCanvasImage = useCallback(() => {
    const width = 920;
    const height = 300;
    const scale = 3;
    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Unable to create export canvas.");
    }
    ctx.scale(scale, scale);
    ctx.imageSmoothingEnabled = true;

    const wrapperRadius = 24;
    const wrapperBackground = "#222427";
    const wrapperBorder = "rgba(255,255,255,0.12)";
    const chartGridColor = "rgba(255,255,255,0.12)";
    const chartLineColor = "#d1d5db";
    const chartPointFill = "#e5e7eb";
    const chartPointBorder = "#222427";
    const gradientTopColor = "rgba(209,213,219,0.08)";
    const gradientBottomColor = "rgba(34,36,39,0)";
    const labelTextColor = "rgba(156,163,175,0.9)";
    const summaryBg = "rgba(255,255,255,0.05)";
    const summaryBorder = "rgba(255,255,255,0.1)";
    const summaryLabelColor = "#9ca3af";
    const summaryValueColor = "#ffffff";

    const drawRoundedRect = (x, y, w, h, r) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    };

    // Card background
    drawRoundedRect(0.5, 0.5, width - 1, height - 1, wrapperRadius);
    ctx.fillStyle = wrapperBackground;
    ctx.fill();

    const svgOffsetY = 6;
    const chartTop = svgOffsetY + dashboardTrendChart.top;
    const chartBottom = svgOffsetY + dashboardTrendChart.top + dashboardTrendChart.chartHeight + 20;
    const chartLeft = dashboardTrendChart.left + 48;
    const chartRight = width - dashboardTrendChart.right - 12;
    const chartWidth = chartRight - chartLeft;

    const counts = dashboardTrendChart.points.map((point) => point.count);
    const maxTick = Math.max(...dashboardTrendChart.yTicks, 1);
    const minorStep = Math.max(1, Math.ceil(maxTick / 10));
    const detailedYValues = [];
    for (let value = 0; value <= maxTick; value += minorStep) {
      detailedYValues.push(value);
    }
    if (detailedYValues[detailedYValues.length - 1] !== maxTick) {
      detailedYValues.push(maxTick);
    }

    const minorValueSet = new Set(detailedYValues);
    const majorValueSet = new Set(dashboardTrendChart.yTicks);

    const exportPoints = counts.map((count, index) => {
      const x =
        counts.length <= 1
          ? chartLeft + chartWidth / 2
          : chartLeft + (index / (counts.length - 1)) * chartWidth;
      const y = chartTop + ((maxTick - count) / maxTick) * dashboardTrendChart.chartHeight;
      return {
        x,
        y,
        count,
        label: dashboardTrendChart.points[index]?.label || "",
      };
    });

    // Horizontal guide lines for all detailed Y values
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 0.5;
    detailedYValues.forEach((value) => {
      const y =
        chartTop +
        ((maxTick - value) / maxTick) *
          dashboardTrendChart.chartHeight;
      ctx.beginPath();
      ctx.moveTo(chartLeft, y);
      ctx.lineTo(chartRight, y);
      ctx.stroke();
    });

    // Major Y-axis labels (bold)
    ctx.font = "bold 11px Inter, sans-serif";
    ctx.fillStyle = labelTextColor;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    dashboardTrendChart.yTicks.forEach((tick) => {
      const y =
        chartTop +
        ((maxTick - tick) / maxTick) *
          dashboardTrendChart.chartHeight;
      ctx.fillText(String(tick), chartLeft - 24, y);
    });

    // Minor Y-axis values (smaller, lighter)
    ctx.font = "10px Inter, sans-serif";
    ctx.fillStyle = "rgba(156,163,175,0.55)";
    detailedYValues.forEach((value) => {
      if (majorValueSet.has(value)) return;
      const y =
        chartTop +
        ((maxTick - value) / maxTick) *
          dashboardTrendChart.chartHeight;
      ctx.fillText(String(value), chartLeft - 24, y);
    });

    // Axis lines
    ctx.strokeStyle = chartGridColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(chartLeft, chartTop);
    ctx.lineTo(chartLeft, chartBottom);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(chartLeft, chartBottom);
    ctx.lineTo(chartRight, chartBottom);
    ctx.stroke();

    // X-axis labels
    ctx.font = "11px Inter, sans-serif";
    ctx.fillStyle = labelTextColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    exportPoints.forEach((point) => {
      const label = point.label || "";
      ctx.fillText(label, point.x, chartBottom + 12);
    });

    // Axis titles
    ctx.font = "12px Inter, sans-serif";
    ctx.fillStyle = labelTextColor;
    ctx.textAlign = "center";
    ctx.fillText("Months", (chartLeft + chartRight) / 2, chartBottom + 32);

    ctx.save();
    ctx.translate(chartLeft - 50, chartTop + dashboardTrendChart.chartHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Violations", 0, 0);
    ctx.restore();

    ctx.font = "11px Inter, sans-serif";
    ctx.fillStyle = labelTextColor;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";

    if (exportPoints.length) {
      const gradient = ctx.createLinearGradient(0, chartTop, 0, chartBottom);
      gradient.addColorStop(0, gradientTopColor);
      gradient.addColorStop(1, gradientBottomColor);

      ctx.beginPath();
      exportPoints.forEach((point, index) => {
        const x = point.x;
        const y = point.y;
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          const prev = exportPoints[index - 1];
          const cpX = (prev.x + point.x) / 2;
          ctx.quadraticCurveTo(cpX, prev.y, x, y);
        }
      });
      const lastPoint = exportPoints[exportPoints.length - 1];
      const firstPoint = exportPoints[0];
      ctx.lineTo(lastPoint.x, chartBottom);
      ctx.lineTo(firstPoint.x, chartBottom);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();

      ctx.beginPath();
      exportPoints.forEach((point, index) => {
        const x = point.x;
        const y = point.y;
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          const prev = exportPoints[index - 1];
          const cpX = (prev.x + point.x) / 2;
          ctx.quadraticCurveTo(cpX, prev.y, x, y);
        }
      });
      ctx.strokeStyle = chartLineColor;
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();

      exportPoints.forEach((point, index) => {
        const x = point.x;
        const y = point.y;
        const radius = index === exportPoints.length - 1 ? 4.8 : 3.4;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = chartPointFill;
        ctx.fill();
        ctx.strokeStyle = chartPointBorder;
        ctx.lineWidth = 1.8;
        ctx.stroke();
      });
    }

    return canvas.toDataURL("image/png");
  }, [dashboardTrendChart]);

  const renderInteractiveTrendChart = useCallback(
    ({ compact = false } = {}) => {
      const activePoint =
        dashboardTrendChart.points[hoveredTrendPointIndex] ||
        dashboardTrendChart.latestPoint;
      const chartHeightClass = compact ? "h-[80%]" : "h-[83%]";
      const wrapperHeightClass = compact ? "h-[286px]" : "h-[472px]";

      const handlePointerMove = (event) => {
        const svg = event.currentTarget;
        const rect = svg.getBoundingClientRect();
        const ratioX = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0;
        const xInViewBox = ratioX * dashboardTrendChart.width;

        if (!dashboardTrendChart.points.length) {
          setHoveredTrendPointIndex(null);
          return;
        }

        const nearestIndex = dashboardTrendChart.points.reduce(
          (bestIndex, point, index) => {
            const currentDistance = Math.abs(point.x - xInViewBox);
            const bestDistance = Math.abs(
              dashboardTrendChart.points[bestIndex].x - xInViewBox,
            );
            return currentDistance < bestDistance ? index : bestIndex;
          },
          0,
        );

        setHoveredTrendPointIndex(nearestIndex);
      };

      return (
        <div
          className={`relative ${wrapperHeightClass} overflow-hidden rounded-2xl border border-white/12 bg-[#222427] px-6 pt-6 pb-12 shadow-[0_8px_24px_rgba(0,0,0,0.4)]`}
        >
          <svg
            viewBox={`0 0 ${dashboardTrendChart.width} ${dashboardTrendChart.height}`}
            className={`${chartHeightClass} w-full`}
            preserveAspectRatio="none"
            onMouseMove={handlePointerMove}
            onMouseLeave={() => setHoveredTrendPointIndex(null)}
          >
            <defs>
              <linearGradient id="dashTrendArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#d1d5db" stopOpacity="0.08" />
                <stop offset="100%" stopColor="#222427" stopOpacity="0" />
              </linearGradient>
            </defs>

            {dashboardTrendChart.yTicks.map((tick) => {
              const y =
                dashboardTrendChart.top +
                ((dashboardTrendChart.yTicks[dashboardTrendChart.yTicks.length - 1] - tick) /
                  dashboardTrendChart.yTicks[dashboardTrendChart.yTicks.length - 1]) *
                  dashboardTrendChart.chartHeight;
              return (
                <g key={`tick-${tick}`}>
                  <line
                    x1={dashboardTrendChart.left}
                    y1={y}
                    x2={dashboardTrendChart.width - dashboardTrendChart.right}
                    y2={y}
                    stroke="rgba(209,213,219,0.12)"
                    strokeWidth="0.8"
                  />
                  <text
                    x={dashboardTrendChart.left - 16}
                    y={y + 5}
                    fill="rgba(156,163,175,0.8)"
                    fontSize="11"
                    textAnchor="end"
                  >
                    {tick}
                  </text>
                </g>
              );
            })}

            {dashboardTrendChart.areaPath ? (
              <path d={dashboardTrendChart.areaPath} fill="url(#dashTrendArea)" />
            ) : null}

            {dashboardTrendChart.linePath ? (
              <path
                d={dashboardTrendChart.linePath}
                fill="none"
                stroke="#d1d5db"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {dashboardTrendChart.points.map((point, index) => {
              const isActive = activePoint?.index === index;
              const isLatest = index === dashboardTrendChart.points.length - 1;
              return (
                <g key={`point-${index}`}>
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={9}
                    fill="transparent"
                  />
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={isActive ? 5.8 : isLatest ? 4.8 : 3.4}
                    fill="#e5e7eb"
                    stroke="#222427"
                    strokeWidth={isActive ? 2.2 : 1.8}
                    fillOpacity={1}
                  />
                </g>
              );
            })}

            {activePoint ? (
              <g transform={`translate(${-60}, 0)`}>
                <rect
                  x={Math.max(
                    dashboardTrendChart.left + 12,
                    Math.min(
                      dashboardTrendChart.width - dashboardTrendChart.right - 120,
                      activePoint.x,
                    ),
                  )}
                  y={Math.max(16, Math.min(dashboardTrendChart.height - 70, activePoint.y - 76))}
                  rx="6"
                  width="120"
                  height="48"
                  fill="#222427"
                  stroke="rgba(156,163,175,0.3)"
                  pointerEvents="none"
                />
                <text
                  x={Math.max(
                    dashboardTrendChart.left + 24,
                    Math.min(
                      dashboardTrendChart.width - dashboardTrendChart.right - 108,
                      activePoint.x + 12,
                    ),
                  )}
                  y={Math.max(32, Math.min(dashboardTrendChart.height - 54, activePoint.y - 60))}
                  fill="#f3f4f6"
                  fontSize="12"
                  fontWeight="600"
                  pointerEvents="none"
                >
                  {activePoint.count} violations
                </text>
                <text
                  x={Math.max(
                    dashboardTrendChart.left + 24,
                    Math.min(
                      dashboardTrendChart.width - dashboardTrendChart.right - 108,
                      activePoint.x + 12,
                    ),
                  )}
                  y={Math.max(49, Math.min(dashboardTrendChart.height - 37, activePoint.y - 43))}
                  fill="rgba(243,244,246,0.85)"
                  fontSize="12"
                  pointerEvents="none"
                >
                  {activePoint.label}
                </text>
              </g>
            ) : null}
          </svg>

          <div className="grid grid-cols-3 gap-4 px-7 pt-7 mt-3 pb-2">
            <div className="text-center">
              <p className="text-[11px] font-medium tracking-wide text-gray-400 mb-2">Start ({dashboardTrendChart.startPoint.label || "-"})</p>
              <p className="text-xl font-semibold text-white">{dashboardTrendChart.startPoint.count || 0}</p>
            </div>
            <div className="text-center">
              <p className="text-[11px] font-medium tracking-wide text-gray-400 mb-2">Peak ({dashboardTrendChart.peakPoint.label || "-"})</p>
              <p className="text-xl font-semibold text-white">{dashboardTrendChart.peakPoint.count || 0}</p>
            </div>
            <div className="text-center">
              <p className="text-[11px] font-medium tracking-wide text-gray-400 mb-2">Latest ({dashboardTrendChart.latestPoint.label || "-"})</p>
              <p className="text-xl font-semibold text-white">{dashboardTrendChart.latestPoint.count || 0}</p>
            </div>
          </div>
        </div>
      );
    },
    [dashboardTrendChart, hoveredTrendPointIndex],
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

  const resolveRankingHeaderImage = useCallback(async () => {
    const response = await fetch(RANKING_EXPORT_HEADER_IMAGE_PATH);
    if (!response.ok) {
      throw new Error(`Required header image not found: ${RANKING_EXPORT_HEADER_IMAGE_PATH}`);
    }

    const blob = await response.blob();
    const dataUrl = await blobToDataUrl(blob);
    const dimensions = await getDataUrlDimensions(dataUrl);
    const extension = String(blob.type || "").toLowerCase().includes("png") ? "png" : "jpeg";
    const imageFormat = extension === "png" ? "PNG" : "JPEG";

    return { dataUrl, dimensions, extension, imageFormat };
  }, []);

  const exportRankingAsExcel = useCallback(async () => {
    const [{ Workbook }, { dataUrl, dimensions, extension }] = await Promise.all([
      import("exceljs"),
      resolveRankingHeaderImage(),
    ]);

    const workbook = new Workbook();
    const sheet = workbook.addWorksheet("Violation Ranking", {
      views: [{ state: "frozen", ySplit: 6 }],
    });

    sheet.columns = [
      { key: "rank", width: 10 },
      { key: "studentName", width: 30 },
      { key: "schoolId", width: 18 },
      { key: "program", width: 14 },
      { key: "year", width: 10 },
      { key: "section", width: 10 },
      { key: "totalViolations", width: 20 },
    ];

    sheet.mergeCells("A1:G3");
    sheet.mergeCells("A4:G4");
    sheet.mergeCells("A5:G5");
    sheet.getRow(1).height = 26;
    sheet.getRow(2).height = 26;
    sheet.getRow(3).height = 26;
    sheet.getRow(4).height = 28;
    sheet.getRow(5).height = 18;

    const titleCell = sheet.getCell("A4");
    titleCell.value = "Student Violation Ranking Report";
    titleCell.font = { name: "Calibri", size: 18, bold: true };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };

    const subtitleCell = sheet.getCell("A5");
    subtitleCell.value = `Generated: ${new Date().toLocaleString()}`;
    subtitleCell.font = { name: "Calibri", size: 11, color: { argb: "FF4B5563" } };
    subtitleCell.alignment = { horizontal: "center", vertical: "middle" };

    const headerRegionWidthPx = sheet.columns.reduce(
      (total, column) => total + Number(column.width || 10) * 7.5,
      0,
    );
    const headerRegionHeightPx = [1, 2, 3].reduce(
      (total, rowNumber) => total + Number(sheet.getRow(rowNumber).height || 15) * 1.333,
      0,
    );
    const imageScale = Math.min(
      (headerRegionWidthPx - 24) / dimensions.width,
      (headerRegionHeightPx - 6) / dimensions.height,
      EXCEL_HEADER_IMAGE_WIDTH_PX / dimensions.width,
      EXCEL_HEADER_IMAGE_HEIGHT_PX / dimensions.height,
      1,
    );
    const imageWidthPx = Math.max(8, Math.round(dimensions.width * imageScale));
    const imageHeightPx = Math.max(8, Math.round(dimensions.height * imageScale));
    const leftOffsetPx = Math.max((headerRegionWidthPx - imageWidthPx) / 2, 0);
    const topOffsetPx = Math.max((headerRegionHeightPx - imageHeightPx) / 2, 0);

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
          return rowIndex - 1 + remaining / rowPx;
        }
        remaining -= rowPx;
      }
      return 2;
    };

    const imageId = workbook.addImage({ base64: dataUrl, extension });
    sheet.addImage(imageId, {
      tl: {
        col: toColCoordinate(leftOffsetPx),
        row: toRowCoordinate(topOffsetPx),
      },
      ext: {
        width: imageWidthPx,
        height: imageHeightPx,
      },
    });

    const headerRowNumber = 6;
    const headerRow = sheet.getRow(headerRowNumber);
    headerRow.values = [
      "Rank",
      "Student Name",
      "School ID",
      "Program",
      "Year",
      "Section",
      "Total Violations",
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
    for (const [index, row] of rankingExportRows.entries()) {
      const excelRowNumber = firstDataRow + index;
      const excelRow = sheet.getRow(excelRowNumber);
      excelRow.values = [
        row.rank,
        row.studentName,
        row.schoolId,
        row.program,
        row.year,
        row.section,
        row.totalViolations,
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
    downloadBlob(blob, `student_violation_ranking_${formatDateForFileName()}.xlsx`);
  }, [downloadBlob, rankingExportRows, resolveRankingHeaderImage]);

  const exportRankingAsPdf = useCallback(async () => {
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);

    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const { dataUrl, dimensions, imageFormat } = await resolveRankingHeaderImage();
    const tableMarginLeft = 10;
    const tableMarginRight = 10;
    const pageWidth = doc.internal.pageSize.getWidth();
    const tableWidth = pageWidth - tableMarginLeft - tableMarginRight;
    const baseColumnWidths = [14, 58, 30, 24, 16, 16, 28];
    const baseTotalWidth = baseColumnWidths.reduce((sum, width) => sum + width, 0);
    const widthScale = tableWidth / baseTotalWidth;
    const tableColumnWidths = baseColumnWidths.map((width) => width * widthScale);
    const tableCenterX = tableMarginLeft + tableWidth / 2;
    let startY = 22;

    if (dataUrl) {
      const headerWidth = tableWidth;
      const headerHeight = (dimensions.height * headerWidth) / dimensions.width;
      const headerX = tableMarginLeft;
      doc.addImage(dataUrl, imageFormat, headerX, 8, headerWidth, headerHeight);
      startY = 8 + headerHeight + 8;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Student Violation Ranking Report", tableCenterX, startY, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`Generated: ${new Date().toLocaleString()}`, tableCenterX, startY + 5, {
      align: "center",
    });

    autoTable(doc, {
      startY: startY + 9,
      head: [["Rank", "Student Name", "School ID", "Program", "Year", "Section", "Total Violations"]],
      body: rankingExportRows.map((row) => [
        row.rank,
        row.studentName,
        row.schoolId,
        row.program,
        row.year,
        row.section,
        row.totalViolations,
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

    doc.save(`student_violation_ranking_${formatDateForFileName()}.pdf`);
  }, [rankingExportRows, resolveRankingHeaderImage]);

  const exportTrendAsPdf = useCallback(async () => {
    if (!selectedTrendRawData.length) {
      setTrendExportAlertMessage("There's no record to export");
      setShowTrendExportAlertModal(true);
      return;
    }

    setIsTrendExporting(true);
    try {
      const [{ jsPDF }] = await Promise.all([import("jspdf")]);

        const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const { dataUrl, dimensions, imageFormat } = await resolveRankingHeaderImage();
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 20;
      const contentWidth = pageWidth - margin * 2;
      const centerX = pageWidth / 2;
      let cursorY = margin;

      if (dataUrl) {
        const headerWidth = contentWidth;
        const headerHeight = (dimensions.height * headerWidth) / dimensions.width;
        doc.addImage(dataUrl, imageFormat, margin, cursorY, headerWidth, headerHeight);
        cursorY += headerHeight + 10;
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("Violation Trends Over the Semester", centerX, cursorY, { align: "center" });
      const schoolYearText = selectedSchoolYear
        ? ` | S.Y. ${selectedSchoolYear}`
        : selectedTrendTerm?.schoolYear
          ? ` | S.Y. ${selectedTrendTerm.schoolYear}`
          : "";
      const semesterText = selectedTrendTermLabel || selectedSemester;
      doc.text(
        `Semester: ${semesterText}${schoolYearText}`,
        centerX,
        cursorY + 8,
        { align: "center" },
      );
      doc.text(`Generated: ${new Date().toLocaleString()}`, centerX, cursorY + 16, { align: "center" });
      cursorY += 28;

      const chartImageDataUrl = createTrendChartCanvasImage();
      const chartImageWidth = contentWidth * 0.86;
      const chartImageHeight = (260 / 920) * chartImageWidth;
      const chartImageLeft = margin + (contentWidth - chartImageWidth) / 2;
      const chartImageTop = cursorY;
      doc.addImage(chartImageDataUrl, "PNG", chartImageLeft, chartImageTop, chartImageWidth, chartImageHeight);

      const statsY = chartImageTop + chartImageHeight + 12;
      const statsSpacing = chartImageWidth / 3;
      const statsX = [chartImageLeft + statsSpacing * 0.5, chartImageLeft + statsSpacing * 1.5, chartImageLeft + statsSpacing * 2.5];

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(`Start (${trendSummary.first.label || "-"})`, statsX[0], statsY, { align: "center" });
      doc.text(`Peak (${trendSummary.peak.label || "-"})`, statsX[1], statsY, { align: "center" });
      doc.text(`Latest (${trendSummary.latest.label || "-"})`, statsX[2], statsY, { align: "center" });

      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      const valueY = statsY + 6;
      doc.text(String(trendSummary.first.count || 0), statsX[0], valueY, { align: "center" });
      doc.text(String(trendSummary.peak.count || 0), statsX[1], valueY, { align: "center" });
      doc.text(String(trendSummary.latest.count || 0), statsX[2], valueY, { align: "center" });

      const cleanedSemester = selectedSemester
        .replace(/\s+/g, "_")
        .replace(/[^a-zA-Z0-9_-]/g, "");
      doc.save(`violation_trends_${cleanedSemester}_${formatDateForFileName()}.pdf`);
    } catch (error) {
      setTrendExportAlertMessage(error?.message || "Unable to export report.");
      setShowTrendExportAlertModal(true);
    } finally {
      setIsTrendExporting(false);
    }
  }, [selectedTrendData, selectedSemester, resolveRankingHeaderImage, selectedTrendRawData, createTrendChartCanvasImage, trendSummary]);

  const handleConfirmRankingExport = async () => {
    if (rankingExportRows.length === 0) {
      setRankingExportAlertMessage("There's no record to export");
      setShowRankingExportAlertModal(true);
      return;
    }

    setIsExportingRanking(true);
    try {
      if (rankingExportFormat === "excel") {
        await exportRankingAsExcel();
      } else {
        await exportRankingAsPdf();
      }
      setShowRankingExportModal(false);
    } catch (error) {
      alert(error?.message || "Unable to export report.");
    } finally {
      setIsExportingRanking(false);
    }
  };

  // Fetch available school years
  useEffect(() => {
    const fetchSchoolYears = async () => {
      try {
        const result = await cachedFetchJSON("/api/archive/school-years", {}, {
          ttlMs: 30000,
          staleWhileRevalidate: true,
        });
        if (result.status === "ok") {
          const payload = result.data || {};
          if (payload.status === "ok" && Array.isArray(payload.schoolYears)) {
            setAvailableSchoolYears(payload.schoolYears);
            setAvailableSemestersBySchoolYear(payload.semestersBySchoolYear || {});
          }
        }
      } catch (error) {
        console.warn("Failed to fetch school years:", error);
      }
    };

    fetchSchoolYears();
  }, []);

  useEffect(() => {
    let isMounted = true;

    const degreeRank = {
      "First Degree": 1,
      "Second Degree": 2,
      "Third Degree": 3,
      "Fourth Degree": 4,
      "Fifth Degree": 5,
      "Sixth Degree": 6,
      "Seventh Degree": 7,
    };

    const getRiskColor = (rank) => {
      if (rank >= 5 && rank <= 7) return "bg-red-500";
      if (rank >= 3 && rank <= 4) return "bg-orange-500";
      if (rank === 2) return "bg-yellow-500";
      if (rank === 1) return "bg-green-500";
      return "bg-gray-500";
    };

    const fetchDashboardViolationData = async () => {
      setIsLoadingMetrics(true);
      setIsLoadingRanking(true);

      try {
        const [currentSettingsRes, studentsRes, violationsRes] = await Promise.all([
          cachedFetchJSON("/api/archive/current-settings", {}, {
            ttlMs: 30000,
            staleWhileRevalidate: true,
          }),
          cachedFetchJSON("/api/students", {}, {
            ttlMs: 12000,
            staleWhileRevalidate: true,
          }),
          cachedFetchJSON("/api/student-violations", {}, {
            ttlMs: 12000,
            staleWhileRevalidate: true,
          }),
        ]);

        const currentSettings = currentSettingsRes.data || {};
        const normalizedCurrentSem = String(currentSettings.currentSemester || "").trim();
        const currentSY = String(currentSettings.currentSchoolYear || "").trim();

        if (currentSettingsRes.status === "ok" && currentSettings?.status === "ok") {
          setCurrentSemester(normalizedCurrentSem);
          setCurrentSchoolYear(currentSY);
        }

        const analyticsUrl = selectedSchoolYear && selectedSemester
          ? `/api/violation-analytics?schoolYear=${encodeURIComponent(selectedSchoolYear)}&semester=${encodeURIComponent(selectedSemester)}`
          : "/api/violation-analytics";

        const analyticsRes = await cachedFetchJSON(analyticsUrl, {}, {
          ttlMs: 12000,
          staleWhileRevalidate: true,
        });

        const studentsResult = studentsRes.data || {};
        const violationsResult = violationsRes.data || {};
        const analyticsResult = analyticsRes.data || {};

        const isSelectedCurrentTerm =
          selectedSchoolYear &&
          selectedSemester &&
          selectedSchoolYear === currentSY &&
          normalizeSemester(selectedSemester) === normalizeSemester(normalizedCurrentSem);

        console.log("Violation Trends Debug:", {
          selectedSY: selectedSchoolYear,
          selectedSem: selectedSemester,
          currentSY,
          currentSem: normalizedCurrentSem,
          dataSource: isSelectedCurrentTerm ? "StudentViolations" : "Archives",
          ongoingLabel: isSelectedCurrentTerm,
          analyticsUrl,
          analyticsStatus: analyticsResult?.status,
        });

        if (studentsRes.status !== "ok" || !Array.isArray(studentsResult?.students)) {
          throw new Error("Failed to load students.");
        }
        if (violationsRes.status !== "ok" || !Array.isArray(violationsResult?.records)) {
          throw new Error("Failed to load violations.");
        }

        const students = studentsResult.students || [];
        const activeRecords = violationsResult.records.filter((rec) => !rec.cleared_at);

        const studentById = new Map(students.map((student) => [Number(student.id), student]));

        const studentMaxDegree = activeRecords.reduce((acc, rec) => {
          const studentId = Number(rec.student_id);
          if (!studentId) return acc;

          const rank = degreeRank[String(rec.violation_degree)] || 0;
          acc[studentId] = Math.max(acc[studentId] || 0, rank);
          return acc;
        }, {});

        const violationCountMap = {};
        students.forEach((student) => {
          violationCountMap[student.id] = Number(student.violation_count) || 0;
        });

        let warningStudents = 0;
        let atRiskStudents = 0;
        let highRiskStudents = 0;

        Object.entries(studentMaxDegree).forEach(([studentId, degree]) => {
          const count = violationCountMap[studentId] || 0;

          if (count >= 5 || (degree >= 5 && degree <= 7)) {
            highRiskStudents += 1;
          } else if ((count >= 3 && count <= 4) || (degree >= 3 && degree <= 4)) {
            atRiskStudents += 1;
          } else if (count === 2 || degree === 2) {
            warningStudents += 1;
          }
        });

        const rankingStats = activeRecords.reduce((acc, rec) => {
          const studentId = Number(rec.student_id);
          if (!studentId || !studentById.has(studentId)) return acc;

          if (!acc[studentId]) {
            acc[studentId] = {
              count: 0,
              maxDegreeRank: 0,
            };
          }

          acc[studentId].count += 1;
          const rank = degreeRank[String(rec.violation_degree)] || 0;
          if (rank > acc[studentId].maxDegreeRank) {
            acc[studentId].maxDegreeRank = rank;
          }
          return acc;
        }, {});

        const newRankingData = Object.entries(rankingStats)
          .map(([studentId, data]) => {
            const student = studentById.get(Number(studentId));
            const parsedYearSection = parseYearSection(student?.year_section);
            return {
              rank: "",
              name: student?.full_name || student?.username || "Unknown",
              violations: data.count,
              color: getRiskColor(data.maxDegreeRank),
              id: student?.school_id || "",
              program: student?.program || "",
              year: parsedYearSection.year,
              section: parsedYearSection.section,
              yearSection: parsedYearSection.normalized,
              maxDegreeRank: data.maxDegreeRank,
            };
          })
          .sort((a, b) => b.violations - a.violations || b.maxDegreeRank - a.maxDegreeRank)
          .map((item, index) => ({
            ...item,
            rank: String(index + 1).padStart(2, "0"),
          }));

        if (isMounted) {
          setViolationMetrics({
            activeViolations: activeRecords.length,
            warningStudents,
            atRiskStudents,
            highRiskStudents,
          });

          setMetricComparisons({
            activeViolations:
              Number(analyticsResult?.cards?.activeViolations?.percentChange) || 0,
            warningStudents:
              Number(analyticsResult?.cards?.warningStudents?.percentChange) || 0,
            atRiskStudents:
              Number(analyticsResult?.cards?.atRiskStudents?.percentChange) || 0,
            highRiskStudents:
              Number(analyticsResult?.cards?.highRiskStudents?.percentChange) || 0,
          });

          setTrendBySemester({
            "1st Sem": Array.isArray(analyticsResult?.trendBySemester?.["1st Sem"])
              ? analyticsResult.trendBySemester["1st Sem"]
              : [],
            "2nd Sem": Array.isArray(analyticsResult?.trendBySemester?.["2nd Sem"])
              ? analyticsResult.trendBySemester["2nd Sem"]
              : [],
            Summer: Array.isArray(analyticsResult?.trendBySemester?.Summer)
              ? analyticsResult.trendBySemester.Summer
              : [],
          });
          setTrendTermBySemester(analyticsResult?.trendTermBySemester || {});
          setOngoingSemesters(analyticsResult?.ongoingSemesters || {});

          setRankingData(newRankingData);
        }
      } catch (_error) {
        if (isMounted) {
          setViolationMetrics({
            activeViolations: 0,
            warningStudents: 0,
            atRiskStudents: 0,
            highRiskStudents: 0,
          });
          setMetricComparisons({
            activeViolations: 0,
            warningStudents: 0,
            atRiskStudents: 0,
            highRiskStudents: 0,
          });
          setTrendBySemester({
            "1st Sem": [],
            "2nd Sem": [],
            Summer: [],
          });
          setRankingData([]);
        }
      } finally {
        if (isMounted) {
          setIsLoadingMetrics(false);
          setIsLoadingRanking(false);
        }
      }
    };

    fetchDashboardViolationData();

    return () => {
      isMounted = false;
    };
  }, [selectedSchoolYear, selectedSemester]);

  useEffect(() => {
    if (hasInitializedTrendSelectionRef.current) return;
    if (!currentSchoolYear || !currentSemester) return;

    hasInitializedTrendSelectionRef.current = true;
    setSelectedSchoolYear(currentSchoolYear);
    setSelectedSemester(formatSemesterLabel(currentSemester) || "1st Sem");
  }, [currentSchoolYear, currentSemester]);

  useEffect(() => {
    if (!selectedSchoolYear) return;
    if (availableSemesterOptions.length === 0) return;
    if (!availableSemesterOptions.includes(selectedSemester)) {
      setSelectedSemester(availableSemesterOptions[0]);
    }
  }, [availableSemesterOptions, selectedSchoolYear, selectedSemester]);

  useEffect(() => {
    let isMounted = true;

    const formatAuditDateTime = (isoValue) => {
      const dateObj = isoValue ? new Date(isoValue) : new Date();
      if (Number.isNaN(dateObj.getTime())) {
        return { date: "-", time: "-" };
      }

      return {
        date: dateObj.toLocaleDateString("en-GB"),
        time: dateObj.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        }),
      };
    };

    const fetchRecentActivity = async ({ silent = false } = {}) => {
      if (!silent && isMounted) {
        setIsLoadingActivity(true);
      }

      try {
        const result = await cachedFetchJSON("/api/audit-logs?limit=100", {}, {
          ttlMs: 10000,
          staleWhileRevalidate: true,
        });

        if (result.status !== "ok" || result?.data?.status !== "ok") {
          throw new Error(result?.error || result?.data?.message || "Failed to load activity logs.");
        }

        if (!isMounted) {
          return;
        }

        const logs = Array.isArray(result.data?.logs) ? result.data.logs : [];
        const mapped = logs.map((log) => {
          const { date, time } = formatAuditDateTime(log.created_at);
          return {
            id: log.id,
            date,
            time,
            actorName: log.actor_name || "Admin User",
            actorRole: log.actor_role || "admin",
            action: String(log.action || "").replaceAll("_", " "),
            target:
              log.target_id != null && String(log.target_id).length > 0
                ? `${log.target_type} #${log.target_id}`
                : log.target_type || "system",
            details: log.details || "No additional details",
          };
        });

        setRecentActivity(mapped);
      } catch (_error) {
        if (isMounted) {
          setRecentActivity([]);
        }
      } finally {
        if (isMounted) {
          setIsLoadingActivity(false);
        }
      }
    };

    fetchRecentActivity();

    const intervalId = setInterval(() => {
      fetchRecentActivity({ silent: true });
    }, 15000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, []);

  const recentActivityColumns = [
    {
      key: "date",
      label: "Date",
      render: (_, row) => <TableCellDateTime date={row.date} time={row.time} />,
    },
    {
      key: "actorName",
      label: "Admin",
      render: (_, row) => (
        <TableCellText
          primary={row.actorName}
          secondary={String(row.actorRole || "").toUpperCase()}
        />
      ),
    },
    { key: "target", label: "Target" },
    {
      key: "action",
      label: "Action",
      render: (value) => (
        <TableCellBadge
          label={value}
          variant={
            String(value || "").includes("DELETE")
              ? "danger"
              : String(value || "").includes("CREATE") ||
                String(value || "").includes("UPLOAD")
                ? "success"
                : String(value || "").includes("UPDATE")
                  ? "warning"
                  : "info"
          }
        />
      ),
    },
    { key: "details", label: "Details" },
  ];

  const recentActivityPreview = recentActivity.slice(0, 5);

  return (
    <div className="text-white">
      {/* Header */}
      <AnimatedContent
        distance={50}
        direction="vertical"
        duration={0.6}
        delay={0}
      >
        <div className="mb-6">
          <h1 className="text-page-title">Dashboard</h1>
          <p className="text-page-subtitle mt-1">
            Monitor violations and student activity at a glance
          </p>
        </div>
      </AnimatedContent>

      {/* Stats and Actions Row */}
      <AnimatedContent
        distance={50}
        direction="vertical"
        duration={0.6}
        delay={0.1}
      >
        <div className="flex gap-4 mb-6">
          {/* Stats Cards */}
          <div className="flex gap-4 flex-1">
            <AdminStatCard
              title="Active Violations"
              value={
                isLoadingMetrics ? "-" : violationMetrics.activeViolations.toString()
              }
              percentage={metricComparisons.activeViolations}
              comparisonLabel="vs last semester"
              icon={<AlertTriangle className="w-5 h-5 text-orange-400" />}
              iconBgColor="bg-orange-500/20"
              className="flex-1"
            />
            <AdminStatCard
              title="Warning Students"
              value={
                isLoadingMetrics ? "-" : violationMetrics.warningStudents.toString()
              }
              percentage={metricComparisons.warningStudents}
              comparisonLabel="vs last semester"
              icon={<AlertTriangle className="w-5 h-5 text-yellow-400" />}
              iconBgColor="bg-yellow-500/20"
              className="flex-1"
            />
            <AdminStatCard
              title="At-Risk Students"
              value={
                isLoadingMetrics ? "-" : violationMetrics.atRiskStudents.toString()
              }
              percentage={metricComparisons.atRiskStudents}
              comparisonLabel="vs last semester"
              icon={<Users className="w-5 h-5 text-orange-400" />}
              iconBgColor="bg-orange-500/20"
              className="flex-1"
            />
            <AdminStatCard
              title="High-Risk Students"
              value={
                isLoadingMetrics ? "-" : violationMetrics.highRiskStudents.toString()
              }
              percentage={metricComparisons.highRiskStudents}
              comparisonLabel="vs last semester"
              icon={<AlertTriangle className="w-5 h-5 text-red-400" />}
              iconBgColor="bg-red-500/20"
              className="flex-1"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-4">
            <AddViolationButton
              onClick={() =>
                navigate("/admin/student-violation", {
                  state: { openLogModal: true },
                })
              }
              className="flex-1"
            />
            <ViewStudentsButton
              onClick={() => navigate("/admin/user-management")}
              className="flex-1"
            />
          </div>
        </div>
      </AnimatedContent>

      {/* Charts Row */}
      <AnimatedContent
        distance={50}
        direction="vertical"
        duration={0.6}
        delay={0.2}
      >
        <div className="flex gap-4 mb-6">
          {/* Violation Trends Chart */}
          <Card variant="glass" padding="md" className="flex-1">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-section-title">
                  Violation trends over the semester
                </h3>
                {selectedTrendTermLabel ? (
                  <p className="text-xs text-gray-400 mt-1">
                    {selectedTrendTermLabel}
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-2 bg-white/10 backdrop-blur-sm text-white text-sm px-3 py-1.5 rounded-lg border border-white/10">
                      {selectedSchoolYear || "Select Year"}
                      <ChevronDown className="w-4 h-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {availableSchoolYears.map((year) => (
                      <DropdownMenuItem
                        key={year}
                        onClick={() => setSelectedSchoolYear(year)}
                      >
                        {year}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-2 bg-white/10 backdrop-blur-sm text-white text-sm px-3 py-1.5 rounded-lg border border-white/10">
                      {selectedSemester}
                      <ChevronDown className="w-4 h-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {availableSemesterOptions.map((semester) => (
                      <DropdownMenuItem
                        key={semester}
                        onClick={() => setSelectedSemester(semester)}
                      >
                        {semester}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <button
                  className="text-gray-400 hover:text-white transition-colors"
                  onClick={() => setTrendModalOpen(true)}
                >
                  <Maximize2 className="ml-5 w-5 h-5" />
                </button>
              </div>
            </div>
            {renderInteractiveTrendChart({ compact: true })}
          </Card>

          {/* Student Violation Ranking */}
          <Card variant="glass" padding="md" className="w-[460px]">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-section-title">Student Violation Ranking</h3>
              <button
                className="text-gray-400 hover:text-white transition-colors"
                onClick={() => setRankingModalOpen(true)}
              >
                <Maximize2 className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-[32px_1fr_160px] text-table-header mt-7 mb-2">
                <span>#</span>
                <span>Name</span>
                <span className="text-right">Total of Violations</span>
              </div>
              {rankingData.slice(0, 5).map((student) => {
                const textSize =
                  student.rank === "01"
                    ? "text-lg font-semibold"
                    : student.rank === "02"
                      ? "text-base font-medium"
                      : student.rank === "03"
                        ? "text-[15px] font-medium"
                        : "text-[15px]";
                const rankNumSize =
                  student.rank === "01"
                    ? "text-lg font-bold text-white"
                    : student.rank === "02"
                      ? "text-base font-semibold text-gray-300"
                      : student.rank === "03"
                        ? "text-[15px] font-medium text-gray-400"
                        : "text-[15px] text-gray-400";
                const barHeight =
                  student.rank === "01"
                    ? "h-3"
                    : student.rank === "02"
                      ? "h-2.5"
                      : "h-2";

                return (
                  <div
                    key={student.rank}
                    className="grid grid-cols-[32px_1fr_160px] items-center"
                  >
                    <span className={rankNumSize}>{student.rank}</span>
                    <span className={textSize}>{student.name}</span>
                    <div className="flex items-center gap-2">
                      <div
                        className={`flex-1 bg-white/10 rounded-full ${barHeight}`}
                      >
                        <div
                          className={`${student.color} ${barHeight} rounded-full`}
                          style={{
                            width: `${(student.violations / 6) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="text-[13px] bg-white/10 px-2 py-1 rounded min-w-[28px] text-center">
                        {student.violations}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </AnimatedContent>

      {/* Recent Activity Table */}
      <AnimatedContent
        distance={50}
        direction="vertical"
        duration={0.6}
        delay={0.3}
      >
        <Card variant="glass" padding="md">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-section-title">Recent Activity</h3>
            <button
              type="button"
              onClick={() => setActivityModalOpen(true)}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10 border border-white/15 text-gray-200 hover:text-white hover:bg-white/15 transition-colors"
            >
              <Maximize2 className="w-4 h-4" />
              View All
            </button>
          </div>
          <DataTable
            columns={recentActivityColumns}
            data={isLoadingActivity ? [] : recentActivityPreview}
            onRowClick={(row) => console.log("Row clicked", row)}
          />
        </Card>
      </AnimatedContent>

      {/* Modals */}
      {/* Violation Trends Modal */}
      <Modal
        isOpen={trendModalOpen}
        onClose={() => setTrendModalOpen(false)}
        title={
          selectedTrendTermLabel
            ? `Violation Trends Over the Semester (${selectedTrendTermLabel})`
            : "Violation Trends Over the Semester"
        }
        size="2xl"
        className="max-w-[1100px] max-h-[80vh] overflow-y-auto custom-scrollbar"
      >
        <p className="text-sm text-gray-400 mb-5">
          This chart visualizes violation trends for the selected semester.
        </p>
        {/* Semester Dropdown & Actions */}
        <div className="flex items-center gap-3 mb-6">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 bg-white/8 backdrop-blur-sm text-white text-sm px-4 py-2.5 rounded-lg border border-white/12 h-10">
                {selectedSemester}
                <ChevronDown className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {availableSemesterOptions.map((semester) => (
                <DropdownMenuItem
                  key={semester}
                  onClick={() => setSelectedSemester(semester)}
                >
                  {semester}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            className="inline-flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-gray-100 text-sm font-medium px-4 py-2.5 rounded-lg border border-gray-600 shadow transition-colors h-10"
            onClick={() => {
              if (!selectedTrendRawData.length) {
                setTrendExportAlertMessage("There's no record to export");
                setShowTrendExportAlertModal(true);
                return;
              }
              setShowTrendExportConfirmModal(true);
            }}
            disabled={isTrendExporting}
          >
            <Download className="w-4 h-4" />
            {isTrendExporting ? "Exporting PDF..." : "Export PDF"}
          </button>
        </div>
        {renderInteractiveTrendChart({ compact: false })}
        {/* Analytics Description */}
        <div className="bg-white/5 border border-white/10 rounded-lg p-4 text-sm text-gray-300">
          This chart visualizes the trend of recorded student violations
          throughout the selected semester. Administrators can analyze patterns
          of misconduct over time and identify months where violations increase,
          allowing earlier intervention strategies.
        </div>
      </Modal>

      {/* Student Violation Ranking Modal */}
      <Modal
        isOpen={rankingModalOpen}
        onClose={() => setRankingModalOpen(false)}
        title={"Student Violation Ranking"}
        size="2xl"
        className="max-w-[1100px] max-h-[80vh] overflow-y-auto scrollbar-hide"
      >
        <div className="flex items-center justify-between mb-6">
          <p className="text-sm text-gray-400">
            This list shows the ranking of students based on recorded
            violations.
          </p>
          <button
            className="bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium px-4 py-2 rounded-lg border border-cyan-700 shadow transition-colors inline-flex items-center gap-2"
            onClick={() => {
              setRankingExportFormat("excel");
              setShowRankingExportModal(true);
            }}
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
        {/* Filter Row */}
        <div className="flex gap-3 mb-6">
          <SearchBar
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by student name"
            className="flex-1"
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 bg-white/10 backdrop-blur-sm text-white text-sm px-3 py-2 rounded-lg border border-white/10 whitespace-nowrap">
                Program: {programFilter}
                <ChevronDown className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setProgramFilter("All")}>
                All
              </DropdownMenuItem>
              {programFilterOptions.map((program) => (
                <DropdownMenuItem key={program} onClick={() => setProgramFilter(program)}>
                  {program}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 bg-white/10 backdrop-blur-sm text-white text-sm px-3 py-2 rounded-lg border border-white/10 whitespace-nowrap">
                Year: {yearLevelFilter}
                <ChevronDown className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setYearLevelFilter("All")}>
                All
              </DropdownMenuItem>
              {yearFilterOptions.map((year) => (
                <DropdownMenuItem key={year} onClick={() => setYearLevelFilter(year)}>
                  {year}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 bg-white/10 backdrop-blur-sm text-white text-sm px-3 py-2 rounded-lg border border-white/10 whitespace-nowrap">
                Section: {sectionFilter}
                <ChevronDown className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setSectionFilter("All")}>
                All
              </DropdownMenuItem>
              {sectionFilterOptions.map((section) => (
                <DropdownMenuItem key={section} onClick={() => setSectionFilter(section)}>
                  {section}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {/* Ranking List Section */}
        <div className="space-y-4">
          {filteredRankingData.length > 0 ? (
            filteredRankingData.map((student) => {
              const textSize =
                student.rank === "01"
                  ? "text-lg font-semibold"
                  : student.rank === "02"
                    ? "text-base font-medium"
                    : student.rank === "03"
                      ? "text-[15px] font-medium"
                      : "text-[15px]";
              const rankNumSize =
                student.rank === "01"
                  ? "text-lg font-bold text-white"
                  : student.rank === "02"
                    ? "text-base font-semibold text-gray-300"
                    : student.rank === "03"
                      ? "text-[15px] font-medium text-gray-400"
                      : "text-[15px] text-gray-400";
              const barHeight =
                student.rank === "01"
                  ? "h-3"
                  : student.rank === "02"
                    ? "h-2.5"
                    : "h-2";

              return (
                <div
                  key={student.rank}
                  className="border-b border-white/5 pb-4 last:border-b-0"
                >
                  {/* Rank and Name */}
                  <div className="flex items-start gap-3 mb-2">
                    <span className={rankNumSize}>{student.rank}</span>
                    <div>
                      <p className={textSize}>{student.name}</p>
                      <p className="text-[12px] text-gray-400 mt-0.5">
                        Program: {student.program} | Year/Section: {student.yearSection || `${student.year}${student.section}`}
                      </p>
                    </div>
                  </div>
                  {/* Progress Bar */}
                  <div className="flex items-center gap-2 ml-7">
                    <div
                      className={`flex-1 bg-white/10 rounded-full ${barHeight}`}
                    >
                      <div
                        className={`${student.color} ${barHeight} rounded-full`}
                        style={{
                          width: `${(student.violations / 6) * 100}%`,
                        }}
                      />
                    </div>
                    <span className="text-[13px] bg-white/10 px-2 py-1 rounded min-w-[28px] text-center">
                      {student.violations}
                    </span>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center py-12">
              <div className="text-gray-400 text-lg mb-2">
                No students found
              </div>
              <div className="text-gray-500 text-sm">
                Try adjusting your search or filter criteria
              </div>
            </div>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={activityModalOpen}
        onClose={() => setActivityModalOpen(false)}
        title={"Recent Activity"}
        size="2xl"
        className="max-w-[1200px] max-h-[80vh]"
      >
        <p className="text-sm text-gray-400 mb-4">
          Full audit trail of recent admin actions.
        </p>
        <div className="max-h-[60vh] overflow-auto rounded-xl">
          <DataTable
            columns={recentActivityColumns}
            data={isLoadingActivity ? [] : recentActivity}
            onRowClick={(row) => console.log("Row clicked", row)}
          />
        </div>
      </Modal>

      <Modal
        isOpen={showRankingExportModal}
        onClose={() => {
          if (!isExportingRanking) {
            setShowRankingExportModal(false);
          }
        }}
        title={<span className="font-black font-inter">Export Student Violation Ranking Report</span>}
        size="md"
        showCloseButton={!isExportingRanking}
      >
        <p className="text-sm text-gray-300 mb-3">
          Choose a format for exporting the current table view.
        </p>
        <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 mb-4">
          <p className="text-xs text-gray-300">
            Rows to export: <span className="font-semibold text-white">{rankingExportRows.length}</span>
          </p>
        </div>

        <label className="block text-sm font-medium text-white mb-2">Format</label>
        <div className="relative">
          <select
            value={rankingExportFormat}
            onChange={(event) => setRankingExportFormat(event.target.value)}
            disabled={isExportingRanking}
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
            onClick={() => setShowRankingExportModal(false)}
            disabled={isExportingRanking}
            className="px-6 py-2.5"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={handleConfirmRankingExport}
            disabled={isExportingRanking}
            className="px-6 py-2.5"
          >
            {isExportingRanking ? "Exporting..." : "Export"}
          </Button>
        </ModalFooter>
      </Modal>

      <Modal
        isOpen={showTrendExportConfirmModal}
        onClose={() => {
          if (!isTrendExporting) {
            setShowTrendExportConfirmModal(false);
          }
        }}
        title={<span className="font-black font-inter">Confirm Trend Export</span>}
        size="sm"
        showCloseButton={!isTrendExporting}
      >
        <p className="text-sm text-gray-300 mb-4">
          Export the current violation trends chart and summary for {selectedSemester}?
        </p>
        <ModalFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowTrendExportConfirmModal(false)}
            disabled={isTrendExporting}
            className="px-6 py-2.5"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => {
              setShowTrendExportConfirmModal(false);
              exportTrendAsPdf();
            }}
            disabled={isTrendExporting}
            className="px-6 py-2.5"
          >
            {isTrendExporting ? "Exporting..." : "Confirm"}
          </Button>
        </ModalFooter>
      </Modal>

      <AlertModal
        isOpen={showRankingExportAlertModal}
        onClose={() => setShowRankingExportAlertModal(false)}
        title="Export unavailable"
        message={rankingExportAlertMessage}
        confirmLabel="Okay"
      />
      <AlertModal
        isOpen={showTrendExportAlertModal}
        onClose={() => setShowTrendExportAlertModal(false)}
        title="Export unavailable"
        message={trendExportAlertMessage}
        confirmLabel="Okay"
      />
    </div>
  );
};

export default Dashboard;
