import React, { useState, useMemo } from "react";
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
import Button from "../../components/ui/Button";
import SearchBar from "../../components/ui/SearchBar";
import DataTable from "../../components/ui/DataTable";
import TableTabs from "../../components/ui/TableTabs";
import AnimatedContent from "../../components/ui/AnimatedContent";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "../../components/ui/dropdown-menu";
import Modal, { ModalFooter, ModalDivider } from "../../components/ui/Modal";

const UserManagement = () => {
  const [activeTab, setActiveTab] = useState("regular");
  const [selectedProgram, setSelectedProgram] = useState("");
  const [selectedYear, setSelectedYear] = useState("");
  const [selectedSection, setSelectedSection] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);

  const emptyUser = {
    id: null,
    schoolId: "",
    studentName: "",
    program: "BSIT",
    yearSection: "",
    status: "Regular",
    violationCount: 0,
  };

  const [newUser, setNewUser] = useState(emptyUser);

  // Sample student data
  const [studentData, setStudentData] = useState([
    {
      id: 1,
      no: 1,
      schoolId: "23-00001",
      studentName: "Arman Jeresano",
      program: "BSIT",
      yearSection: "3B",
      status: "Regular",
      violationCount: 5,
    },
    {
      id: 2,
      no: 2,
      schoolId: "23-00002",
      studentName: "Maria Santos",
      program: "BSCS",
      yearSection: "3A",
      status: "Regular",
      violationCount: 1,
    },
    {
      id: 3,
      no: 3,
      schoolId: "23-00003",
      studentName: "John Doe",
      program: "BSIT",
      yearSection: "2C",
      status: "Irregular",
      violationCount: 2,
    },
    {
      id: 4,
      no: 4,
      schoolId: "23-00004",
      studentName: "Jane Smith",
      program: "BSCS",
      yearSection: "1B",
      status: "Regular",
      violationCount: 5,
    },
    {
      id: 5,
      no: 5,
      schoolId: "23-00005",
      studentName: "Peter Pan",
      program: "BSIT",
      yearSection: "4B",
      status: "Regular",
      violationCount: 1,
    },
    {
      id: 6,
      no: 6,
      schoolId: "23-00006",
      studentName: "Wendy Darling",
      program: "BSCS",
      yearSection: "3A",
      status: "Irregular",
      violationCount: 2,
    },
    {
      id: 7,
      no: 7,
      schoolId: "23-00007",
      studentName: "James Hook",
      program: "BSIT",
      yearSection: "3C",
      status: "Regular",
      violationCount: 1,
    },
    {
      id: 8,
      no: 8,
      schoolId: "23-00008",
      studentName: "Alice Wonder",
      program: "BSCS",
      yearSection: "2D",
      status: "Regular",
      violationCount: 5,
    },
    {
      id: 9,
      no: 9,
      schoolId: "23-00009",
      studentName: "Bob Builder",
      program: "BSIT",
      yearSection: "1E",
      status: "Irregular",
      violationCount: 1,
    },
    {
      id: 10,
      no: 10,
      schoolId: "23-00010",
      studentName: "Charlie Brown",
      program: "BSCS",
      yearSection: "4D",
      status: "Regular",
      violationCount: 2,
    },
    {
      id: 11,
      no: 11,
      schoolId: "23-00011",
      studentName: "Lucy Liu",
      program: "BSIT",
      yearSection: "3A",
      status: "Regular",
      violationCount: 5,
    },
    {
      id: 12,
      no: 12,
      schoolId: "23-00012",
      studentName: "Snoopy Dog",
      program: "BSCS",
      yearSection: "3C",
      status: "Irregular",
      violationCount: 1,
    },
  ]);

  // Filters
  const filteredStudents = useMemo(() => {
    return studentData.filter((student) => {
      // Tab filter
      if (activeTab === "regular" && student.status !== "Regular") return false;
      if (activeTab === "irregular" && student.status !== "Irregular")
        return false;

      // Program filter
      if (
        selectedProgram &&
        student.program.toLowerCase() !== selectedProgram.toLowerCase()
      )
        return false;

      // Year filter
      if (selectedYear) {
        const studentYear = student.yearSection.charAt(0);
        if (studentYear !== selectedYear) return false;
      }

      // Section filter
      if (selectedSection) {
        const studentSection = student.yearSection.slice(1).toLowerCase();
        if (studentSection !== selectedSection.toLowerCase()) return false;
      }

      // Search query
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          student.studentName.toLowerCase().includes(query) ||
          student.schoolId.toLowerCase().includes(query) ||
          student.program.toLowerCase().includes(query) ||
          student.yearSection.toLowerCase().includes(query)
        );
      }

      return true;
    });
  }, [
    studentData,
    activeTab,
    selectedProgram,
    selectedYear,
    selectedSection,
    searchQuery,
  ]);

  const statistics = useMemo(() => {
    const total = filteredStudents.length;
    const withViolations = filteredStudents.filter(
      (s) => s.violationCount > 0,
    ).length;
    const highRisk = filteredStudents.filter(
      (s) => s.violationCount >= 5,
    ).length;

    return { total, withViolations, highRisk };
  }, [filteredStudents]);

  const columns = [
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
      onClick: (row) => {
        setSelectedUser(row);
        setIsEditOpen(true);
      },
    },
    {
      label: "Delete",
      icon: <Trash2 className="w-4 h-4" />,
      onClick: (row) => {
        if (
          window.confirm(`Are you sure you want to delete ${row.studentName}?`)
        ) {
          setStudentData((prev) =>
            prev.filter((student) => student.id !== row.id),
          );
        }
      },
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
    setSearchQuery("");
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
              className="gap-2 bg-[#4A5568] hover:bg-[#3d4654] border-0"
            >
              <Plus className="w-4 h-4" />
              Import
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setNewUser(emptyUser);
                setIsAddOpen(true);
              }}
              className="gap-2 bg-[#4A5568] hover:bg-[#3d4654] border-0"
            >
              <Plus className="w-4 h-4" />
              Add User
            </Button>
          </div>
        </div>
      </AnimatedContent>

      <AnimatedContent distance={40} delay={0.1}>
        <p className="text-white font-semibold mb-4">S.Y. 2025-2026</p>
      </AnimatedContent>

      <AnimatedContent distance={40} delay={0.2}>
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <SearchBar
            placeholder="Search by name, ID, program, or section"
            className="w-80"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

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

          {(selectedProgram ||
            selectedYear ||
            selectedSection ||
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
              High-Risk Students:{" "}
              <span className="text-white font-medium">
                {statistics.highRisk}
              </span>
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
        <DataTable
          columns={columns}
          data={filteredStudents}
          actions={actions}
        />
      </AnimatedContent>

      {/* Add Modal */}
      <Modal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        title="Add New Student"
        size="xl"
      >
        <div className="grid grid-cols-2 gap-4 p-6">
          {/* Student Name */}
          <div>
            <label className="text-sm text-gray-300">Student Name</label>
            <input
              type="text"
              value={newUser.studentName}
              onChange={(e) =>
                setNewUser({ ...newUser, studentName: e.target.value })
              }
              className="w-full mt-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white focus:ring-2 focus:ring-[#4A9B9B] focus:outline-none"
              placeholder="Enter student name"
            />
          </div>

          {/* Student ID */}
          <div>
            <label className="text-sm text-gray-300">Student ID</label>
            <input
              type="text"
              value={newUser.schoolId}
              onChange={(e) =>
                setNewUser({ ...newUser, schoolId: e.target.value })
              }
              className="w-full mt-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white focus:ring-2 focus:ring-[#4A9B9B] focus:outline-none"
              placeholder="Enter student ID"
            />
          </div>

          {/* Program */}
          <div>
            <label className="text-sm text-gray-300">Program</label>
            <select
              value={newUser.program}
              onChange={(e) =>
                setNewUser({ ...newUser, program: e.target.value })
              }
              className="w-full mt-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white focus:ring-2 focus:ring-[#4A9B9B] focus:outline-none"
            >
              <option value="BSIT">BSIT</option>
              <option value="BSCS">BSCS</option>
            </select>
          </div>

          {/* Year/Section */}
          <div>
            <label className="text-sm text-gray-300">Year/Section</label>
            <input
              type="text"
              value={newUser.yearSection}
              onChange={(e) =>
                setNewUser({ ...newUser, yearSection: e.target.value })
              }
              className="w-full mt-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white focus:ring-2 focus:ring-[#4A9B9B] focus:outline-none"
              placeholder="e.g., 3A"
            />
          </div>

          {/* Status */}
          <div>
            <label className="text-sm text-gray-300">Status</label>
            <select
              value={newUser.status}
              onChange={(e) =>
                setNewUser({ ...newUser, status: e.target.value })
              }
              className="w-full mt-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white focus:ring-2 focus:ring-[#4A9B9B] focus:outline-none"
            >
              <option value="Regular">Regular</option>
              <option value="Irregular">Irregular</option>
            </select>
          </div>
        </div>

        <ModalDivider />

        <ModalFooter>
          <button
            onClick={() => setIsAddOpen(false)}
            className="px-6 py-2 rounded-xl bg-white/10 text-gray-300 hover:bg-white/20 transition-colors"
          >
            Cancel
          </button>

          <button
            onClick={() => {
              const newId = Date.now();
              const newEntry = {
                ...newUser,
                id: newId,
                no: studentData.length + 1,
              };
              setStudentData((prev) => [...prev, newEntry]);
              setIsAddOpen(false);
              setNewUser(emptyUser);
            }}
            className="px-6 py-2 rounded-xl bg-[#4A9B9B] hover:bg-[#3d8585] text-white transition-colors"
          >
            Add Student
          </button>
        </ModalFooter>
      </Modal>

      {/* Edit Modal */}
      <Modal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        title="Edit Student Profile"
        size="xl"
      >
        {selectedUser && (
          <>
            <div className="grid grid-cols-2 gap-4 p-6">
              {/* Student Name */}
              <div>
                <label className="text-sm text-gray-300">Student Name</label>
                <input
                  type="text"
                  value={selectedUser.studentName}
                  onChange={(e) =>
                    setSelectedUser({
                      ...selectedUser,
                      studentName: e.target.value,
                    })
                  }
                  className="w-full mt-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white focus:ring-2 focus:ring-[#4A9B9B] focus:outline-none"
                />
              </div>

              {/* Student ID */}
              <div>
                <label className="text-sm text-gray-300">Student ID</label>
                <input
                  type="text"
                  value={selectedUser.schoolId}
                  onChange={(e) =>
                    setSelectedUser({
                      ...selectedUser,
                      schoolId: e.target.value,
                    })
                  }
                  className="w-full mt-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white focus:ring-2 focus:ring-[#4A9B9B] focus:outline-none"
                />
              </div>

              {/* Program Dropdown */}
              <div>
                <label className="text-sm text-gray-300">Program</label>
                <select
                  value={selectedUser.program}
                  onChange={(e) =>
                    setSelectedUser({
                      ...selectedUser,
                      program: e.target.value,
                    })
                  }
                  className="w-full mt-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white focus:ring-2 focus:ring-[#4A9B9B] focus:outline-none"
                >
                  <option value="BSIT">BSIT</option>
                  <option value="BSCS">BSCS</option>
                </select>
              </div>

              {/* Year / Section */}
              <div>
                <label className="text-sm text-gray-300">Year/Section</label>
                <input
                  type="text"
                  value={selectedUser.yearSection}
                  onChange={(e) =>
                    setSelectedUser({
                      ...selectedUser,
                      yearSection: e.target.value,
                    })
                  }
                  className="w-full mt-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white focus:ring-2 focus:ring-[#4A9B9B] focus:outline-none"
                />
              </div>

              {/* Status */}
              <div>
                <label className="text-sm text-gray-300">Status</label>
                <select
                  value={selectedUser.status}
                  onChange={(e) =>
                    setSelectedUser({
                      ...selectedUser,
                      status: e.target.value,
                    })
                  }
                  className="w-full mt-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white focus:ring-2 focus:ring-[#4A9B9B] focus:outline-none"
                >
                  <option value="Regular">Regular</option>
                  <option value="Irregular">Irregular</option>
                </select>
              </div>

              {/* Violation Count */}
              <div>
                <label className="text-sm text-gray-300">Violation Count</label>
                <input
                  type="number"
                  min="0"
                  value={selectedUser.violationCount}
                  onChange={(e) =>
                    setSelectedUser({
                      ...selectedUser,
                      violationCount: Number(e.target.value),
                    })
                  }
                  className="w-full mt-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white focus:ring-2 focus:ring-[#4A9B9B] focus:outline-none"
                />
              </div>
            </div>

            <ModalDivider />

            <ModalFooter>
              <button
                onClick={() => setIsEditOpen(false)}
                className="px-6 py-2 rounded-xl bg-white/10 text-gray-300 hover:bg-white/20 transition-colors"
              >
                Cancel
              </button>

              <button
                onClick={() => {
                  setStudentData((prev) =>
                    prev.map((student) =>
                      student.id === selectedUser.id ? selectedUser : student,
                    ),
                  );
                  setIsEditOpen(false);
                }}
                className="px-6 py-2 rounded-xl bg-[#4A9B9B] hover:bg-[#3d8585] text-white transition-colors"
              >
                Save Changes
              </button>
            </ModalFooter>
          </>
        )}
      </Modal>
    </div>
  );
};

export default UserManagement;
