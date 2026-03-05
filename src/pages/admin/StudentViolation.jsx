import React, { useState } from "react";
import AnimatedContent from "../../components/ui/AnimatedContent";
import Card from "../../components/ui/Card";
import AnalyticsLineGraph from "../../components/ui/AnalyticsLineGraph";
import StatCard from "../../components/ui/StatCard";
import Button from "../../components/ui/Button";
import DataTable from "../../components/ui/DataTable";
import { Edit } from "lucide-react";
import {
  Plus,
  TrendingUp,
  TrendingDown,
  Search,
  ChevronDown,
  Download,
  Paperclip,
  Check,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "../../components/ui/dropdown-menu";
import SearchBar from "@/components/ui/SearchBar";
import LogNewViolationModal from "@/components/modals/LogNewViolationModal";

const StudentViolation = () => {
  const [showLogModal, setShowLogModal] = useState(false);
  // Example data for table and stats
  const columns = [
    { key: "no", label: "No", width: "w-10" },
    { key: "date", label: "Date" },
    {
      key: "studentNameText",
      label: "Student Name",
      render: (value, row) => (
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
    { key: "remarks", label: "Remarks" },
    { key: "signature", label: "Signature" },
    { key: "status", label: "Status" },
  ];

  const actions = [
    {
      label: "Edit",
      icon: <Edit className="w-4 h-4" />,
      onClick: (row) => console.log("Edit", row),
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
      onClick: (row) => console.log("Delete", row),
      variant: "danger",
    },
  ];
  // Search and filter states
  const [searchTerm, setSearchTerm] = useState("");
  const [sortOrder, setSortOrder] = useState("Asc");
  const [selectedYear, setSelectedYear] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  // Date dropdown handler
  const handleDateChange = (range) => {
    setSelectedDate(range);
  };
  const [selectedStatus, setSelectedStatus] = useState("");

  const handleSearchChange = (e) => setSearchTerm(e.target.value);
  const handleSortOrder = (order) => setSortOrder(order);
  const handleYearChange = (year) => setSelectedYear(year);

  // Helper to match yearSection to dropdown
  const yearMatches = (row, selectedYear) => {
    if (!selectedYear) return true;
    const yearMap = {
      "1st Year": /^BSIT\s*-\s*1/i,
      "2nd Year": /^BSIT\s*-\s*2/i,
      "3rd Year": /^BSIT\s*-\s*3/i,
      "4th Year": /^BSIT\s*-\s*4/i,
    };
    const regex = yearMap[selectedYear];
    return regex ? regex.test(row.yearSection) : true;
  };
  const handleStatusChange = (status) => setSelectedStatus(status);

  // Helper to match status
  const statusMatches = (row, selectedStatus) => {
    if (!selectedStatus) return true;
    if (!row.status || !row.status.type) return false;
    const typeName =
      row.status.type.displayName || row.status.type.name || row.status.type;
    if (selectedStatus === "Cleared") {
      return typeName === "span";
    }
    if (selectedStatus === "Pending") {
      return typeName === "Button";
    }
    return true;
  };

  const [clearedRows, setClearedRows] = useState({});

  const handleClearStatus = (rowId) => {
    if (
      window.confirm("Are you sure you want to mark this violation as cleared?")
    ) {
      const now = new Date();
      const dateStr = now.toLocaleDateString();
      const timeStr = now.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      setClearedRows((prev) => ({
        ...prev,
        [rowId]: `${dateStr} ${timeStr}`,
      }));
    }
  };

  const sampleUsers = [
    {
      id: 1,
      no: 1,
      date: "02/02/26\n11:00AM",
      studentNameText: "Arman Jeresano",
      studentIdText: "23-00000",
      yearSection: "BSIT - 3B",
      violation: "Academic",
      reportedBy: "Jenny Hernandez",
      remarks: "Lorem Ipsum",
      signature: (
        <Button
          size="sm"
          variant="secondary"
          className="px-3 py-1 gap-2"
          onClick={() => handleAttachSignature(1)}
        >
          <Paperclip className="w-4 h-4" /> Attach
        </Button>
      ),
      status: clearedRows[1] ? (
        <span className="flex flex-col items-start">
          <span className="flex items-center gap-2 text-green-600 font-semibold">
            <Check className="w-4 h-4" /> Cleared
          </span>
          <span className="text-xs text-gray-500">{clearedRows[1]}</span>
        </span>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          className="bg-[#A3AED0] text-white px-3 py-1 gap-2"
          onClick={() => handleClearStatus(1)}
        >
          <Check className="w-4 h-4" /> Cleared
        </Button>
      ),
    },
    {
      id: 2,
      no: 2,
      date: "02/02/26\n11:00AM",
      studentNameText: "Maria Santos",
      studentIdText: "23-00001",
      yearSection: "BSIT - 3A",
      violation: "Behavioral",
      reportedBy: "Jhun Alvarez",
      remarks: "Late submission",
      signature: (
        <Button
          size="sm"
          variant="secondary"
          className="px-3 py-1 gap-2"
          onClick={() => handleAttachSignature(2)}
        >
          <Paperclip className="w-4 h-4" /> Attach
        </Button>
      ),
      status: clearedRows[2] ? (
        <span className="flex flex-col items-start">
          <span className="flex items-center gap-2 text-green-600 font-semibold">
            <Check className="w-4 h-4" /> Cleared
          </span>
          <span className="text-xs text-gray-500">{clearedRows[2]}</span>
        </span>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          className="bg-[#A3AED0] text-white px-3 py-1 gap-2"
          onClick={() => handleClearStatus(2)}
        >
          <Check className="w-4 h-4" /> Cleared
        </Button>
      ),
    },
    {
      id: 3,
      no: 3,
      date: "02/02/26\n11:00AM",
      studentNameText: "John Dela Cruz",
      studentIdText: "23-00002",
      yearSection: "BSIT - 2A",
      violation: "Academic",
      reportedBy: "Jenny Hernandez",
      remarks: "Cheating",
      signature: (
        <Button
          size="sm"
          variant="secondary"
          className="px-3 py-1 gap-2"
          onClick={() => handleAttachSignature(3)}
        >
          <Paperclip className="w-4 h-4" /> Attach
        </Button>
      ),
      status: clearedRows[3] ? (
        <span className="flex flex-col items-start">
          <span className="flex items-center gap-2 text-green-600 font-semibold">
            <Check className="w-4 h-4" /> Cleared
          </span>
          <span className="text-xs text-gray-500">{clearedRows[3]}</span>
        </span>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          className="bg-[#A3AED0] text-white px-3 py-1 gap-2"
          onClick={() => handleClearStatus(3)}
        >
          <Check className="w-4 h-4" /> Cleared
        </Button>
      ),
    },
    {
      id: 4,
      no: 4,
      date: "02/02/26\n11:00AM",
      studentNameText: "Ana Bautista",
      studentIdText: "23-00003",
      yearSection: "BSIT - 1B",
      violation: "Behavioral",
      reportedBy: "Jhun Alvarez",
      remarks: "Absent",
      signature: (
        <Button
          size="sm"
          variant="secondary"
          className="px-3 py-1 gap-2"
          onClick={() => handleAttachSignature(4)}
        >
          <Paperclip className="w-4 h-4" /> Attach
        </Button>
      ),
      status: clearedRows[4] ? (
        <span className="flex flex-col items-start">
          <span className="flex items-center gap-2 text-green-600 font-semibold">
            <Check className="w-4 h-4" /> Cleared
          </span>
          <span className="text-xs text-gray-500">{clearedRows[4]}</span>
        </span>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          className="bg-[#A3AED0] text-white px-3 py-1 gap-2"
          onClick={() => handleClearStatus(4)}
        >
          <Check className="w-4 h-4" /> Cleared
        </Button>
      ),
    },
    {
      id: 5,
      no: 5,
      date: "02/02/26\n11:00AM",
      studentNameText: "Mark Reyes",
      studentIdText: "23-00004",
      yearSection: "BSIT - 4A",
      violation: "Academic",
      reportedBy: "Jenny Hernandez",
      remarks: "Plagiarism",
      signature: (
        <Button
          size="sm"
          variant="secondary"
          className="px-3 py-1 gap-2"
          onClick={() => handleAttachSignature(5)}
        >
          <Paperclip className="w-4 h-4" /> Attach
        </Button>
      ),
      status: clearedRows[5] ? (
        <span className="flex flex-col items-start">
          <span className="flex items-center gap-2 text-green-600 font-semibold">
            <Check className="w-4 h-4" /> Cleared
          </span>
          <span className="text-xs text-gray-500">{clearedRows[5]}</span>
        </span>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          className="bg-[#A3AED0] text-white px-3 py-1 gap-2"
          onClick={() => handleClearStatus(5)}
        >
          <Check className="w-4 h-4" /> Cleared
        </Button>
      ),
    },
  ];

  const rawData = sampleUsers;

  // Filter and sort data by search, date, and sortOrder
  const filteredData = rawData.filter((row) => {
    const term = searchTerm.toLowerCase();
    let matchesSearch =
      row.studentNameText.toLowerCase().includes(term) ||
      row.studentIdText.toLowerCase().includes(term);
    let matchesDate = true;
    let matchesYear = yearMatches(row, selectedYear);
    let matchesStatus = statusMatches(row, selectedStatus);
    if (selectedDate) {
      const today = new Date();
      const rowDate = new Date(row.date.split("\n")[0]);
      switch (selectedDate) {
        case "Today":
          matchesDate = rowDate.toDateString() === today.toDateString();
          break;
        case "This Week":
          const startOfWeek = new Date(today);
          startOfWeek.setDate(today.getDate() - today.getDay());
          const endOfWeek = new Date(startOfWeek);
          endOfWeek.setDate(startOfWeek.getDate() + 6);
          matchesDate = rowDate >= startOfWeek && rowDate <= endOfWeek;
          break;
        case "This Month":
          matchesDate =
            rowDate.getMonth() === today.getMonth() &&
            rowDate.getFullYear() === today.getFullYear();
          break;
        case "This Year":
          matchesDate = rowDate.getFullYear() === today.getFullYear();
          break;
        default:
          matchesDate = true;
      }
    }
    return matchesSearch && matchesDate && matchesYear && matchesStatus;
  });

  const data = [...filteredData].sort((a, b) => {
    if (sortOrder === "Asc") {
      return a.no - b.no;
    } else {
      return b.no - a.no;
    }
  });

  return (
    <div className="text-white">
      <AnimatedContent>
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-xl font-semibold tracking-wide">
            STUDENT VIOLATION
          </h2>
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
          <Card className="h-full min-h-[110px] col-span-3 flex flex-col justify-between items-start px-6 py-5 w-full ransition-all duration-300 hover:shadow-lg hover:shadow-white/5 hover:border-white/20 hover:scale-[1.02] ">
            <div className="flex w-full justify-between items-center mb-2">
              <span className="text-lg font-black font-inter">
                Student Analytics
              </span>
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
              value={0}
              percentage={0}
              icon={<TrendingUp />}
              className="col-span-1 min-w-[220px] h-full w-full"
            />
          </AnimatedContent>
          <AnimatedContent delay={0.2}>
            <StatCard
              title="Violations"
              value={0}
              percentage={11.01}
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
              type="text"
              placeholder="Student Name or School ID"
              className="w-64"
              value={searchTerm}
              onChange={handleSearchChange}
            />
            {/* Asc/Desc Dropdown */}
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
                <DropdownMenuItem onClick={() => handleSortOrder("Asc")}>
                  Asc
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleSortOrder("Desc")}>
                  Desc
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {/* Date Dropdown (after Asc/Desc) */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="secondary"
                  size="sm"
                  className="min-w-[90px] justify-between"
                >
                  {selectedDate ? selectedDate : "Date"}
                  <ChevronDown className="ml-2 w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => handleDateChange("")}>
                  All
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleDateChange("Today")}>
                  Today
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleDateChange("This Week")}>
                  This Week
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleDateChange("This Month")}
                >
                  This Month
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleDateChange("This Year")}>
                  This Year
                </DropdownMenuItem>
                <DropdownMenuItem disabled>Custom Range</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {/* Year Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="secondary"
                  size="sm"
                  className="min-w-[90px] justify-between"
                >
                  {selectedYear ? selectedYear : "Year"}
                  <ChevronDown className="ml-2 w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => handleYearChange("")}>
                  All
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleYearChange("1st Year")}>
                  1st Year
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleYearChange("2nd Year")}>
                  2nd Year
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleYearChange("3rd Year")}>
                  3rd Year
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleYearChange("4th Year")}>
                  4th Year
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {/* Status Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="secondary"
                  size="sm"
                  className="min-w-[90px] justify-between"
                >
                  {selectedStatus ? selectedStatus : "Status"}
                  <ChevronDown className="ml-2 w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => handleStatusChange("")}>
                  All
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleStatusChange("Cleared")}>
                  Cleared
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleStatusChange("Pending")}>
                  Pending
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <Button variant="secondary" size="sm" className="px-6 gap-2">
            <Download className="w-4 h-4" />
            Generate
          </Button>
        </div>
      </AnimatedContent>

      <AnimatedContent delay={0.5}>
        <DataTable columns={columns} data={data} actions={actions} />
      </AnimatedContent>
      {/* Log New Violation Modal */}
      <LogNewViolationModal
        isOpen={showLogModal}
        onClose={() => setShowLogModal(false)}
      />
    </div>
  );
};

export default StudentViolation;
