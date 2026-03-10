import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Card from "../../components/ui/Card";
import AdminStatCard from "../../components/ui/AdminStatCard";
import {
  AddViolationButton,
  ViewStudentsButton,
} from "../../components/ui/QuickActionButton";
import AnimatedContent from "../../components/ui/AnimatedContent";
import Modal from "../../components/ui/Modal";
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

  const rankingData = [
    {
      rank: "01",
      name: "Jenny Hernandez",
      violations: 6,
      color: "bg-cyan-500",
      id: "23-0001",
      program: "BSIT",
      year: "1",
      section: "A",
    },
    {
      rank: "02",
      name: "Edrianne Lumabas",
      violations: 4,
      color: "bg-cyan-500",
      id: "23-0002",
      program: "BSIT",
      year: "2",
      section: "A",
    },
    {
      rank: "03",
      name: "Jessa Marie Balnig",
      violations: 3,
      color: "bg-cyan-500",
      id: "23-0003",
      program: "BSCS",
      year: "3",
      section: "A",
    },
    {
      rank: "04",
      name: "Raiza Roces",
      violations: 2,
      color: "bg-cyan-500",
      id: "23-0004",
      program: "BSCS",
      year: "4",
      section: "A",
    },
    {
      rank: "05",
      name: "Lyrika Hermozo",
      violations: 5,
      color: "bg-cyan-500",
      id: "23-0005",
      program: "BSIT",
      year: "1",
      section: "B",
    },
    {
      rank: "06",
      name: "Mark Anthony Reyes",
      violations: 4,
      color: "bg-cyan-500",
      id: "23-0006",
      program: "BSCS",
      year: "2",
      section: "B",
    },
    {
      rank: "07",
      name: "Samantha Cruz",
      violations: 3,
      color: "bg-cyan-500",
      id: "23-0007",
      program: "BSIT",
      year: "3",
      section: "C",
    },
    {
      rank: "08",
      name: "Carlos Mendoza",
      violations: 2,
      color: "bg-cyan-500",
      id: "23-0008",
      program: "BSCS",
      year: "4",
      section: "C",
    },
    {
      rank: "09",
      name: "Angelica Santos",
      violations: 4,
      color: "bg-cyan-500",
      id: "23-0009",
      program: "BSIT",
      year: "1",
      section: "D",
    },
    {
      rank: "10",
      name: "Ramon Garcia",
      violations: 3,
      color: "bg-cyan-500",
      id: "23-0010",
      program: "BSCS",
      year: "2",
      section: "D",
    },
    {
      rank: "11",
      name: "Patricia Lopez",
      violations: 2,
      color: "bg-cyan-500",
      id: "23-0011",
      program: "BSIT",
      year: "3",
      section: "E",
    },
    {
      rank: "12",
      name: "Jose Martinez",
      violations: 1,
      color: "bg-cyan-500",
      id: "23-0012",
      program: "BSCS",
      year: "4",
      section: "E",
    },
  ];

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
        const response = await fetch("/api/audit-logs?limit=100");
        const result = await response.json().catch(() => ({}));

        if (!response.ok || result?.status !== "ok") {
          throw new Error(result?.message || "Failed to load activity logs.");
        }

        if (!isMounted) {
          return;
        }

        const logs = Array.isArray(result.logs) ? result.logs : [];
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
              value="0"
              percentage={0}
              comparisonLabel="vs last semester"
              icon={<AlertTriangle className="w-5 h-5 text-orange-400" />}
              iconBgColor="bg-orange-500/20"
              className="flex-1"
            />
            <AdminStatCard
              title="At-Risk Students"
              value="0"
              percentage={0}
              comparisonLabel="vs last semester"
              icon={<Users className="w-5 h-5 text-cyan-400" />}
              iconBgColor="bg-cyan-500/20"
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
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-section-title">
                Violation trends over the semester
              </h3>
              <div className="flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-2 bg-white/10 backdrop-blur-sm text-white text-sm px-3 py-1.5 rounded-lg border border-white/10">
                      {selectedSemester}
                      <ChevronDown className="w-4 h-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => setSelectedSemester("1st Sem")}
                    >
                      1st Sem
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setSelectedSemester("2nd Sem")}
                    >
                      2nd Sem
                    </DropdownMenuItem>
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
            {/* Chart Placeholder */}
            <div className="h-48 flex items-end justify-between px-4 relative">
              <svg
                className="w-full h-full absolute inset-0"
                preserveAspectRatio="none"
              >
                <defs>
                  <linearGradient
                    id="lineGradient"
                    x1="0%"
                    y1="0%"
                    x2="100%"
                    y2="0%"
                  >
                    <stop offset="0%" stopColor="#06b6d4" />
                    <stop offset="100%" stopColor="#06b6d4" />
                  </linearGradient>
                </defs>
                <path
                  d="M 20 140 Q 80 120, 120 130 T 200 80 T 280 90 T 360 60 T 440 70"
                  fill="none"
                  stroke="url(#lineGradient)"
                  strokeWidth="2"
                />
                <circle
                  cx="120"
                  cy="130"
                  r="6"
                  fill="#fff"
                  stroke="#06b6d4"
                  strokeWidth="2"
                />
                <circle
                  cx="200"
                  cy="80"
                  r="6"
                  fill="#fff"
                  stroke="#06b6d4"
                  strokeWidth="2"
                />
                <circle
                  cx="360"
                  cy="60"
                  r="6"
                  fill="#fff"
                  stroke="#06b6d4"
                  strokeWidth="2"
                />
              </svg>
              <div className="absolute bottom-0 left-0 right-0 flex justify-between text-muted px-2">
                <span>Jan</span>
                <span>Feb</span>
                <span>Mar</span>
                <span>Apr</span>
                <span>May</span>
                <span>Jun</span>
              </div>
            </div>
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
        title={"Violation Trends Over the Semester"}
        size="2xl"
        className="max-w-[1100px] max-h-[80vh] overflow-y-auto scrollbar-hide"
      >
        <p className="text-sm text-gray-400 mb-4">
          This chart visualizes violation trends for the selected semester.
        </p>
        {/* Semester Dropdown & Actions */}
        <div className="flex items-center gap-2 mb-6">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 bg-white/10 backdrop-blur-sm text-white text-sm px-4 py-2 rounded-lg border border-white/10 h-10">
                {selectedSemester}
                <ChevronDown className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setSelectedSemester("1st Sem")}>
                1st Sem
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSelectedSemester("2nd Sem")}>
                2nd Sem
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            className="bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium px-4 py-2 rounded-lg border border-cyan-700 shadow transition-colors h-10"
            onClick={() => {
              /* Add export logic here */
            }}
          >
            Export
          </button>
        </div>
        {/* Chart Area */}
        <div className="h-[320px] flex items-end justify-between px-4 relative mb-6">
          <svg
            className="w-full h-full absolute inset-0"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient
                id="modalLineGradient"
                x1="0%"
                y1="0%"
                x2="100%"
                y2="0%"
              >
                <stop offset="0%" stopColor="#06b6d4" />
                <stop offset="100%" stopColor="#06b6d4" />
              </linearGradient>
            </defs>
            <path
              d="M 10 140 Q 100 120, 150 130 T 250 80 T 350 90 T 450 60 T 550 75 T 650 50 T 750 65 T 850 55 T 950 70"
              fill="none"
              stroke="url(#modalLineGradient)"
              strokeWidth="2"
            />
            <circle
              cx="150"
              cy="130"
              r="6"
              fill="#fff"
              stroke="#06b6d4"
              strokeWidth="2"
            />
            <circle
              cx="250"
              cy="80"
              r="6"
              fill="#fff"
              stroke="#06b6d4"
              strokeWidth="2"
            />
            <circle
              cx="450"
              cy="60"
              r="6"
              fill="#fff"
              stroke="#06b6d4"
              strokeWidth="2"
            />
            <circle
              cx="650"
              cy="50"
              r="6"
              fill="#fff"
              stroke="#06b6d4"
              strokeWidth="2"
            />
            <circle
              cx="850"
              cy="55"
              r="6"
              fill="#fff"
              stroke="#06b6d4"
              strokeWidth="2"
            />
          </svg>
          <div className="absolute bottom-0 left-0 right-0 flex justify-between text-muted px-2">
            <span>Jan</span>
            <span>Feb</span>
            <span>Mar</span>
            <span>Apr</span>
            <span>May</span>
            <span>Jun</span>
          </div>
        </div>
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
            className="bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium px-4 py-2 rounded-lg border border-cyan-700 shadow transition-colors"
            onClick={() => {
              // Export functionality - create CSV from filtered data
              const csvContent = [
                [
                  "Rank",
                  "Student Name",
                  "ID",
                  "Program",
                  "Year",
                  "Section",
                  "Total Violations",
                ],
                ...filteredRankingData.map((student) => [
                  student.rank,
                  student.name,
                  student.id,
                  student.program,
                  student.year,
                  student.section,
                  student.violations,
                ]),
              ]
                .map((row) => row.join(","))
                .join("\n");

              const blob = new Blob([csvContent], {
                type: "text/csv;charset=utf-8;",
              });
              const link = document.createElement("a");
              const url = URL.createObjectURL(blob);
              link.setAttribute("href", url);
              link.setAttribute(
                "download",
                `student_violation_ranking_${new Date().toISOString().split("T")[0]}.csv`,
              );
              link.style.visibility = "hidden";
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
            }}
          >
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
              <DropdownMenuItem onClick={() => setProgramFilter("BSIT")}>
                BSIT
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setProgramFilter("BSCS")}>
                BSCS
              </DropdownMenuItem>
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
              <DropdownMenuItem onClick={() => setYearLevelFilter("1")}>
                1
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setYearLevelFilter("2")}>
                2
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setYearLevelFilter("3")}>
                3
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setYearLevelFilter("4")}>
                4
              </DropdownMenuItem>
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
              <DropdownMenuItem onClick={() => setSectionFilter("A")}>
                A
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSectionFilter("B")}>
                B
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSectionFilter("C")}>
                C
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSectionFilter("D")}>
                D
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSectionFilter("E")}>
                E
              </DropdownMenuItem>
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
                        Program: {student.program} | Year: {student.year} |
                        Section: {student.section}
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
    </div>
  );
};

export default Dashboard;
