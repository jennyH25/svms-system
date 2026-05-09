import React, { useEffect, useMemo, useState } from "react";
import Modal, { ModalFooter, ModalDivider } from "@/components/ui/Modal";
import GlassInput from "@/components/ui/GlassInput";
import Button from "@/components/ui/Button";
import { getAuditHeaders } from "@/lib/auditHeaders";
import ViolationPickerModal from "@/components/modals/ViolationPickerModal";
import { CheckCircle, AlertTriangle } from "lucide-react";
import { formatStudentDisplayName } from "@/lib/utils";

const getTodayDateInputValue = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getInitialForm = () => ({
  studentId: "",
  studentName: "",
  studentNo: "",
  yearSection: "",
  violationCatalogId: "",
  violationLabel: "",
  dateLogged: getTodayDateInputValue(),
  reportedBy: "",
  remarks: "",
});

const formatProgramYearSection = (program, yearSection) => {
  const programText = String(program || "").trim();
  const yearSectionText = String(yearSection || "").trim();

  if (programText && yearSectionText) {
    return `${programText}-${yearSectionText}`;
  }

  return programText || yearSectionText || "";
};

const LogNewViolationModal = ({ isOpen, onClose, onSaved }) => {
  const [students, setStudents] = useState([]);
  const [allViolations, setAllViolations] = useState([]);
  const [studentQuery, setStudentQuery] = useState("");
  const [showStudentSuggestions, setShowStudentSuggestions] = useState(false);
  const [showViolationPicker, setShowViolationPicker] = useState(false);
  const [formData, setFormData] = useState(getInitialForm);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [successModalOpen, setSuccessModalOpen] = useState(false);
  const [showDuplicateViolationModal, setShowDuplicateViolationModal] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const bootstrap = async () => {
      try {
        const [studentsRes, violationsRes] = await Promise.all([
          fetch("/api/students"),
          fetch("/api/violations"),
        ]);

        const studentsData = await studentsRes.json().catch(() => ({}));
        const violationsData = await violationsRes.json().catch(() => ({}));

        if (studentsRes.ok && Array.isArray(studentsData.students)) {
          setStudents(studentsData.students);
        }

        if (violationsRes.ok && Array.isArray(violationsData.violations)) {
          setAllViolations(violationsData.violations);
        }
      } catch {
        setStudents([]);
        setAllViolations([]);
      }
    };

    bootstrap();

    setStudentQuery("");
    setShowStudentSuggestions(false);
    setShowViolationPicker(false);
    setError("");
    setSuccessModalOpen(false);
    setFormData(getInitialForm());
  }, [isOpen]);

  const filteredStudents = useMemo(() => {
    const q = studentQuery.trim().toLowerCase();
    if (!q) return [];

    return students
      .filter((student) => {
        const fullName = String(student.full_name || "").toLowerCase();
        const formattedName = formatStudentDisplayName({
          firstName: student.first_name,
          lastName: student.last_name,
          middleInitial: student.middle_initial,
          fullName: student.full_name,
        }).toLowerCase();
        const schoolId = String(student.school_id || "").toLowerCase();
        const program = String(student.program || "").toLowerCase();
        const yearSection = String(student.year_section || "").toLowerCase();
        return (
          fullName.includes(q) ||
          formattedName.includes(q) ||
          schoolId.includes(q) ||
          program.includes(q) ||
          yearSection.includes(q)
        );
      })
      .slice(0, 8);
  }, [studentQuery, students]);

  const matchedStudent = useMemo(() => {
    return students.find((student) => Number(student.id) === Number(formData.studentId));
  }, [students, formData.studentId]);

  const rightYearSection = formatProgramYearSection(
    matchedStudent?.program,
    matchedStudent?.year_section,
  );

  const selectStudent = (student) => {
    const formattedName = formatStudentDisplayName({
      firstName: student.first_name,
      lastName: student.last_name,
      middleInitial: student.middle_initial,
      fullName: student.full_name,
    });
    setFormData((prev) => ({
      ...prev,
      studentId: String(student.id),
      studentName: formattedName,
      studentNo: student.school_id || "",
      yearSection: formatProgramYearSection(student.program, student.year_section),
    }));
    setStudentQuery(formattedName);
    setShowStudentSuggestions(false);
    setError("");
  };

  const handleViolationPicked = (selected) => {
    if (!selected) {
      return;
    }

    const label = `${selected.name} (${selected.category} | ${selected.degree})`;
    setFormData((prev) => ({
      ...prev,
      violationCatalogId: String(selected.id),
      violationLabel: label,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!formData.studentId) {
      setError("Select an existing student from search first.");
      return;
    }

    if (!formData.violationLabel) {
      setError("Select a violation type.");
      return;
    }

    if (!formData.dateLogged) {
      setError("Select the violation date.");
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      const response = await fetch("/api/student-violations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuditHeaders(),
        },
        body: JSON.stringify({
          studentId: Number(formData.studentId),
          violationCatalogId: formData.violationCatalogId
            ? Number(formData.violationCatalogId)
            : null,
          violationLabel: formData.violationLabel,
          dateLogged: formData.dateLogged,
          reportedBy: formData.reportedBy,
          remarks: formData.remarks,
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (
          response.status === 409 &&
          String(result?.message || "").includes("same violation type and date already exists")
        ) {
          setShowDuplicateViolationModal(true);
          return;
        }

        throw new Error(result?.message || "Unable to log violation.");
      }

      await onSaved?.(result.record);
      onClose?.();
      setSuccessModalOpen(true);
    } catch (submitError) {
      setError(submitError.message || "Unable to log violation.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
    <Modal
      isOpen={isOpen}
      onClose={isSaving ? () => {} : onClose}
      title={<span className="font-black font-inter">Log New Violation</span>}
      size="2xl"
      showCloseButton={!isSaving}
    >
      <form onSubmit={handleSubmit}>
        <p className="text-sm text-gray-300 mb-4">
          Search a student and log a violation entry.
        </p>

        <div className="mb-4 relative">
          <label className="block text-sm font-medium text-white mb-2">Student Search</label>
          <div className="relative">
            <input
              value={studentQuery}
              onChange={(event) => {
                setStudentQuery(event.target.value);
                setShowStudentSuggestions(true);
              }}
              onFocus={() => setShowStudentSuggestions(true)}
              className="w-full backdrop-blur-md border border-white/5 rounded-xl pl-4 pr-40 py-3 text-[15px] text-white bg-[rgba(45,47,52,0.8)] placeholder-gray-500 focus:outline-none focus:border-white/20 transition-all"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-cyan-200 font-semibold truncate max-w-[130px] text-right">
              {rightYearSection || "Program-Year/Section"}
            </span>
          </div>

          {showStudentSuggestions && filteredStudents.length > 0 && (
            <div className="absolute z-20 mt-2 w-full rounded-xl border border-white/10 bg-[#1f232a] shadow-xl max-h-56 overflow-auto">
              {filteredStudents.map((student) => {
                const formattedName = formatStudentDisplayName({
                  firstName: student.first_name,
                  lastName: student.last_name,
                  middleInitial: student.middle_initial,
                  fullName: student.full_name,
                });
                return (
                  <button
                    key={student.id}
                    type="button"
                    className="w-full text-left px-4 py-2.5 hover:bg-white/10 transition-colors"
                    onClick={() => selectStudent(student)}
                  >
                    <div className="text-sm text-white font-semibold">{formattedName}</div>
                    <div className="text-xs text-gray-300">
                      {student.school_id} | {formatProgramYearSection(student.program, student.year_section)}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <GlassInput
            label={<span className="text-sm font-medium text-white mb-2">Student Name</span>}
            value={formData.studentName}
            readOnly
          />
          <GlassInput
            label={<span className="text-sm font-medium text-white mb-2">Student No.</span>}
            value={formData.studentNo}
            readOnly
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <GlassInput
            label={<span className="text-sm font-medium text-white mb-2">Program-Year/Section</span>}
            value={formData.yearSection}
            readOnly
          />

          <div>
            <label className="block text-sm font-medium text-white mb-2">Type of Violation</label>
            <input
              value={formData.violationLabel}
              readOnly
              className="w-full backdrop-blur-md border border-white/5 rounded-xl px-4 py-3 text-[15px] text-white bg-[rgba(45,47,52,0.8)] placeholder-gray-500 focus:outline-none mb-2"
            />
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={() => setShowViolationPicker(true)}
              disabled={isSaving}
            >
              Choose Violation
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-white mb-2">Date</label>
            <input
              type="date"
              value={formData.dateLogged}
              onChange={(event) =>
                setFormData((prev) => ({ ...prev, dateLogged: event.target.value }))
              }
              disabled={isSaving}
              className="w-full backdrop-blur-md border border-white/5 rounded-xl px-4 py-3 text-[15px] text-white bg-[rgba(45,47,52,0.8)] focus:outline-none focus:border-white/20 transition-all"
            />
          </div>

          <GlassInput
            label={<span className="text-sm font-medium text-white mb-2">Reported by</span>}
            value={formData.reportedBy}
            onChange={(event) =>
              setFormData((prev) => ({ ...prev, reportedBy: event.target.value }))
            }
          />
        </div>

        <ModalDivider />

        <div className="mb-1">
          <label className="block text-sm font-medium text-white mb-2">Remarks</label>
          <textarea
            value={formData.remarks}
            onChange={(event) =>
              setFormData((prev) => ({ ...prev, remarks: event.target.value }))
            }
            rows={4}
            style={{ backgroundColor: "rgba(45, 47, 52, 0.8)" }}
            className="w-full backdrop-blur-md border border-white/5 rounded-xl px-4 py-3 text-[15px] text-white placeholder-gray-500 focus:outline-none focus:border-white/20 transition-all resize-y min-h-[80px]"
          />
        </div>

        {error ? <p className="text-sm text-red-300 mt-2">{error}</p> : null}

        <ModalFooter>
          <Button
            variant="outline"
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="px-8 py-2 bg-white text-[#1a1a1a] border-0 hover:bg-gray-100"
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            className="px-8 py-2 bg-[#556987] text-white hover:bg-[#3d4654]"
            disabled={isSaving}
          >
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
    <ViolationPickerModal
      isOpen={showViolationPicker}
      onClose={() => setShowViolationPicker(false)}
      violations={allViolations}
      onSelect={handleViolationPicked}
    />

    <Modal
      isOpen={isSaving}
      onClose={() => {}}
      title={<span className="font-black font-inter">Logging Violation</span>}
      size="sm"
      showCloseButton={false}
    >
      <div className="flex flex-col items-center justify-center py-8 gap-4">
        <div className="animate-spin">
          <div className="w-10 h-10 border-4 border-blue-500/20 border-t-blue-500 rounded-full"></div>
        </div>
        <p className="text-gray-300 text-sm">Saving the new violation record...</p>
      </div>
    </Modal>

    <Modal
      isOpen={successModalOpen}
      onClose={() => setSuccessModalOpen(false)}
      title={
        <span className="font-black font-inter flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-green-400" />
          Violation Logged
        </span>
      }
      size="sm"
      showCloseButton
    >
      <div className="rounded-lg border border-green-400/25 bg-green-500/10 px-4 py-3 mb-4">
        <p className="text-sm font-medium text-green-300">
          The student violation was logged successfully.
        </p>
      </div>
      <ModalFooter>
        <Button
          variant="primary"
          onClick={() => setSuccessModalOpen(false)}
          className="px-6"
        >
          OK
        </Button>
      </ModalFooter>
    </Modal>

    <Modal
      isOpen={showDuplicateViolationModal}
      onClose={() => setShowDuplicateViolationModal(false)}
      title={
        <span className="font-black font-inter flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-red-400" />
          Duplicate Violation
        </span>
      }
      size="sm"
      showCloseButton
    >
      <div className="text-base space-y-3">
  <div className="bg-red-500/10 border border-red-500/30 text-red-300 font-semibold px-3 py-2 rounded-md">
    A violation for this student with the same type and date already exists.
  </div>

  <p className="text-slate-300 text-sm leading-relaxed">
    Select another violation or review the student’s record for other incidents.
  </p>
</div>
      <ModalFooter>
        <Button
          variant="primary"
          onClick={() => setShowDuplicateViolationModal(false)}
          className="px-6"
        >
          OK
        </Button>
      </ModalFooter>
    </Modal>
    </>
  );
};

export default LogNewViolationModal;
