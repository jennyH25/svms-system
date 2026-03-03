import React, { useState } from "react";
import {
  Plus,
  Archive,
  Download,
  ChevronDown,
  Edit,
  Trash2,
  Eye,
  Gift,
} from "lucide-react";
import Button from "../components/ui/Button";
import SearchBar from "../components/ui/SearchBar";
import DataTable from "../components/ui/DataTable";
import TableTabs from "../components/ui/TableTabs";
import AnimatedContent from "../components/ui/AnimatedContent";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "../components/ui/dropdown-menu";

const UserManagement = () => {
  const [activeTab, setActiveTab] = useState("regular");
  const [selectedProgram, setSelectedProgram] = useState("");
  const [selectedYear, setSelectedYear] = useState("");
  const [selectedSection, setSelectedSection] = useState("");

  // Sample student data
  const studentData = [
    {
      id: 1,
      no: 1,
      schoolId: "23-00000",
      studentName: "Arman Jeresano",
      program: "BSIT",
      yearSection: "3B",
      status: "Regular",
      violationCount: 5,
    },
    {
      id: 2,
      no: 2,
      schoolId: "23-00000",
      studentName: "Arman Jeresano",
      program: "BSIT",
      yearSection: "3A",
      status: "Regular",
      violationCount: 1,
    },
    {
      id: 3,
      no: 3,
      schoolId: "23-00000",
      studentName: "Arman Jeresano",
      program: "BSIT",
      yearSection: "2C",
      status: "Regular",
      violationCount: 2,
    },
    {
      id: 4,
      no: 4,
      schoolId: "23-00000",
      studentName: "Arman Jeresano",
      program: "BSIT",
      yearSection: "1B",
      status: "Regular",
      violationCount: 5,
    },
    {
      id: 5,
      no: 5,
      schoolId: "23-00000",
      studentName: "Arman Jeresano",
      program: "BSIT",
      yearSection: "4B",
      status: "Regular",
      violationCount: 1,
    },
    {
      id: 6,
      no: 6,
      schoolId: "23-00000",
      studentName: "Arman Jeresano",
      program: "BSIT",
      yearSection: "3A",
      status: "Regular",
      violationCount: 2,
    },
    {
      id: 7,
      no: 7,
      schoolId: "23-00000",
      studentName: "Arman Jeresano",
      program: "BSIT",
      yearSection: "3C",
      status: "Regular",
      violationCount: 1,
    },
    {
      id: 8,
      no: 8,
      schoolId: "23-00000",
      studentName: "Arman Jeresano",
      program: "BSIT",
      yearSection: "2D",
      status: "Regular",
      violationCount: 5,
    },
    {
      id: 9,
      no: 9,
      schoolId: "23-00000",
      studentName: "Arman Jeresano",
      program: "BSIT",
      yearSection: "1E",
      status: "Regular",
      violationCount: 1,
    },
    {
      id: 10,
      no: 10,
      schoolId: "23-00000",
      studentName: "Arman Jeresano",
      program: "BSIT",
      yearSection: "4D",
      status: "Regular",
      violationCount: 2,
    },
    {
      id: 11,
      no: 11,
      schoolId: "23-00000",
      studentName: "Arman Jeresano",
      program: "BSIT",
      yearSection: "3A",
      status: "Regular",
      violationCount: 5,
    },
    {
      id: 12,
      no: 12,
      schoolId: "23-00000",
      studentName: "Arman Jeresano",
      program: "BSIT",
      yearSection: "3C",
      status: "Regular",
      violationCount: 1,
    },
  ];

  const columns = [
    { key: "no", label: "No", width: "w-12" },
    { key: "schoolId", label: "School ID" },
    {
      key: "studentName",
      label: "Student Name",
      render: (value) => (
        <span className="text-black-500 font-bold">{value}</span>
      ),
    },
    { key: "program", label: "Program" },
    { key: "yearSection", label: "Year/Section" },
    { key: "status", label: "Status" },
    {
      key: "violationCount",
      label: "Violation Count",
      render: (value) => {
        let bgColor = "bg-green-500";
        if (value >= 5) bgColor = "bg-red-500";
        else if (value >= 2) bgColor = "bg-yellow-500";
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
      onClick: (row) => console.log("Edit", row),
    },
    {
      label: "Delete",
      icon: <Trash2 className="w-4 h-4" />,
      onClick: (row) => console.log("Delete", row),
      variant: "danger",
    },
  ];

  const tabs = [
    { key: "regular", label: "Regular" },
    { key: "irregular", label: "Irregular" },
  ];

  return (
    <div className="text-white">
      <AnimatedContent>
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-xl font-semibold tracking-wide">
            USER MANAGEMENT
          </h2>
          <div className="flex gap-3">
            <Button
              variant="secondary"
              size="sm"
              className="gap-2 bg-[#4A5568] hover:bg-[#3d4654] border-0"
            >
              <Plus className="w-4 h-4" />
              Import
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="gap-2 bg-[#4A5568] hover:bg-[#3d4654] border-0"
            >
              <Plus className="w-4 h-4" />
              Add User
            </Button>
          </div>
        </div>
      </AnimatedContent>

      <AnimatedContent distance={40} delay={0.1}>
        <p className="text-white font-semibold mb-4">Students (2025-2026)</p>
      </AnimatedContent>

      <AnimatedContent distance={40} delay={0.2}>
        <div className="flex items-center gap-3 mb-4">
          <SearchBar placeholder="Search User" className="w-64" />
          {/* Program Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="secondary"
                size="sm"
                className="min-w-[120px] justify-between"
              >
                {selectedProgram ? selectedProgram.toUpperCase() : "Program"}
                <ChevronDown className="ml-2 w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => setSelectedProgram("bsit")}>
                BSIT
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSelectedProgram("bscs")}>
                BSCS
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSelectedProgram("bsis")}>
                BSIS
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
                {selectedYear ? `${selectedYear} Year` : "Year"}
                <ChevronDown className="ml-2 w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
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
                  : "Section"}
                <ChevronDown className="ml-2 w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
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
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-6 text-sm">
            <span className="text-gray-400">
              Total Students:{" "}
              <span className="text-white font-medium">1423</span>
            </span>
            <span className="text-gray-400">
              Students with Violations:{" "}
              <span className="text-white font-medium">78</span>
            </span>
            <span className="text-gray-400">
              High-Risk Students:{" "}
              <span className="text-white font-medium">21</span>
            </span>
          </div>
          <div className="flex gap-3">
            <Button
              variant="secondary"
              size="sm"
              className="gap-2 bg-[#4A9B9B] hover:bg-[#3d8585] border-0"
            >
              <Gift className="w-4 h-4" />
              Promote
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="gap-2 bg-[#4A5568] hover:bg-[#3d4654] border-0"
            >
              <Archive className="w-4 h-4" />
              Archive
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="gap-2 bg-[#4A5568] hover:bg-[#3d4654] border-0"
            >
              <Download className="w-4 h-4" />
              Export
            </Button>
          </div>
        </div>
      </AnimatedContent>

      <AnimatedContent distance={40} delay={0.5}>
        <DataTable columns={columns} data={studentData} actions={actions} />
      </AnimatedContent>
    </div>
  );
};

export default UserManagement;
