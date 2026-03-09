import React, { useEffect, useMemo, useState } from "react";
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
import Modal, { ModalFooter } from "../../components/ui/Modal";
import EditUserModal from "@/components/modals/EditUserModal";
import AddUserModal from "@/components/modals/AddUserModal";
import { getAuditHeaders } from "@/lib/auditHeaders";

const UserManagement = () => {
  const [activeTab, setActiveTab] = useState("regular");
  const [selectedProgram, setSelectedProgram] = useState("");
  const [selectedYear, setSelectedYear] = useState("");
  const [selectedSection, setSelectedSection] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [showEditSuccessModal, setShowEditSuccessModal] = useState(false);
  const [showCreateSuccessModal, setShowCreateSuccessModal] = useState(false);

  const [studentData, setStudentData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchStudents = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/students");
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result?.message || "Failed to load students.");
      }

      const rows = Array.isArray(result.students) ? result.students : [];
      setStudentData(
        rows.map((student) => ({
          id: Number(student.id),
          userId: student.user_id ? Number(student.user_id) : null,
          username: student.username || "",
          email: student.email || "",
          schoolId: student.school_id,
          studentName: student.full_name,
          firstName: student.first_name,
          lastName: student.last_name,
          program: student.program,
          yearSection: student.year_section,
          status: student.status,
          violationCount: Number(student.violation_count) || 0,
        })),
      );
    } catch (error) {
      alert(error.message || "Unable to fetch students.");
      setStudentData([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, []);

  const handleSaveEdit = async (id, updatedData) => {
    try {
      const response = await fetch(`/api/students/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...getAuditHeaders(),
        },
        body: JSON.stringify({
          username: updatedData.username,
          schoolId: updatedData.schoolId,
          email: updatedData.email,
          firstName: updatedData.firstName,
          lastName: updatedData.lastName,
          program: updatedData.program,
          yearSection: updatedData.yearSection,
          status: updatedData.status,
          violationCount: Number(updatedData.violationCount),
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.message || "Failed to update student.");
      }

      await fetchStudents();
      setShowEditSuccessModal(true);
      return true;
    } catch (error) {
      alert(error.message || "Unable to update student.");
      return false;
    }
  };

  const handleSaveNewUser = async (userData) => {
    setIsAddingUser(true);
    try {
      const response = await fetch("/api/students", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuditHeaders(),
        },
        body: JSON.stringify({
          schoolId: userData.schoolId,
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          program: userData.program,
          yearSection: userData.yearSection,
          status: userData.status,
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.message || "Failed to add student.");
      }

      await fetchStudents();
      setShowCreateSuccessModal(true);
      return true;
    } catch (error) {
      alert(error.message || "Unable to add student.");
      return false;
    } finally {
      setIsAddingUser(false);
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

      await fetchStudents();
      setDeleteCandidate(null);
    } catch (error) {
      alert(error.message || "Unable to delete student.");
    } finally {
      setIsDeleting(false);
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
          data={isLoading ? [] : filteredStudents}
          actions={actions}
        />
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
      />

      <Modal
        isOpen={Boolean(deleteCandidate)}
        onClose={() => {
          if (!isDeleting) {
            setDeleteCandidate(null);
          }
        }}
        title={<span className="font-black font-inter">Delete Student</span>}
        size="md"
        showCloseButton={!isDeleting}
      >
        <div className="rounded-xl border border-red-400/25 bg-red-500/10 px-4 py-3 mb-4">
          <p className="text-red-300 text-sm font-medium">
            This action permanently removes the student record from the database.
          </p>
        </div>
        <p className="text-gray-200 text-sm">
          Delete <span className="font-semibold text-white">{deleteCandidate?.studentName}</span>?
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
        isOpen={showEditSuccessModal}
        onClose={() => setShowEditSuccessModal(false)}
        title={<span className="font-black font-inter">Saved Successfully</span>}
        size="sm"
      >
        <p className="text-sm text-gray-300">User changes were saved to the database.</p>
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
        isOpen={showCreateSuccessModal}
        onClose={() => setShowCreateSuccessModal(false)}
        title={<span className="font-black font-inter">Successfully Created</span>}
        size="sm"
      >
        <p className="text-sm text-gray-300">Student account was created and credentials were sent.</p>
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
    </div>
  );
};

export default UserManagement;
