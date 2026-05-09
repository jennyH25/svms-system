import React, { useState, useEffect } from "react";
import Modal, { ModalFooter } from "@/components/ui/Modal";
import GlassInput from "@/components/ui/GlassInput";
import Button from "@/components/ui/Button";
import { AlertCircle } from "lucide-react";
import SelectField from "@/components/ui/SelectField";

function extractNameFromFullName(fullName) {
  const normalized = String(fullName || "").trim();
  if (!normalized) {
    return { firstName: "", middleInitial: "", lastName: "" };
  }

  const commaMatch = normalized.match(/^([^,]+),\s*(.+)$/);
  if (commaMatch) {
    const lastName = String(commaMatch[1] || "").trim();
    const remaining = String(commaMatch[2] || "").trim();
    const remainingParts = remaining.split(/\s+/).filter(Boolean);

    if (remainingParts.length === 0) {
      return { firstName: "", middleInitial: "", lastName };
    }

    if (remainingParts.length === 1) {
      return {
        firstName: remainingParts[0],
        middleInitial: "",
        lastName,
      };
    }

    const trailingToken = String(
      remainingParts[remainingParts.length - 1] || "",
    ).replace(/\./g, "");
    const hasTrailingInitial = /^[a-z]$/i.test(trailingToken);

    return {
      firstName: hasTrailingInitial
        ? remainingParts.slice(0, -1).join(" ")
        : remaining,
      middleInitial: hasTrailingInitial
        ? trailingToken.charAt(0).toUpperCase()
        : "",
      lastName,
    };
  }

  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return { firstName: parts[0], middleInitial: "", lastName: "" };
  }

  if (parts.length === 2) {
    return {
      firstName: parts[0],
      middleInitial: "",
      lastName: parts[1],
    };
  }

  const middleTokenRaw = String(parts[parts.length - 2] || "").trim();
  const middleToken = middleTokenRaw.replace(/\./g, "");
  const hasMiddleInitial = /^[a-z]$/i.test(middleToken);

  return {
    firstName: hasMiddleInitial
      ? parts.slice(0, -2).join(" ")
      : parts.slice(0, -1).join(" "),
    middleInitial: hasMiddleInitial ? middleToken.charAt(0).toUpperCase() : "",
    lastName: parts[parts.length - 1],
  };
}

function splitMiddleInitialFromFirstName(firstName, middleInitial) {
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

  if (tokens.length >= 2) {
    const tail = String(tokens[tokens.length - 1] || "").replace(/\./g, "");
    if (/^[a-z]$/i.test(tail)) {
      return {
        firstName: normalizedFirst,
        middleInitial: tail.toUpperCase(),
      };
    }
  }

  return {
    firstName: normalizedFirst,
    middleInitial: "",
  };
}

const EditArchiveModal = ({ isOpen, onClose, record, editType = "user", onSave }) => {
  const [formData, setFormData] = useState({});
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Initialize form data based on record type
  useEffect(() => {
    if (record) {
      setError("");
      if (editType === "user") {
        const fullName = record.full_name || record.fullName || "";
        const fallbackNames = extractNameFromFullName(fullName);
        const normalizedName = splitMiddleInitialFromFirstName(
          record.firstName || record.first_name || fallbackNames.firstName || "",
          record.middleInitial || record.middle_initial || fallbackNames.middleInitial || "",
        );

        // For archived users
        setFormData({
          firstName: normalizedName.firstName || "",
          middleInitial: normalizedName.middleInitial || "",
          lastName:
            record.lastName ||
            record.last_name ||
            fallbackNames.lastName ||
            "",
          email: record.email || "",
          program: record.program || "",
          yearSection: record.yearSection || "",
          status:
            record.archivedReason ||
            record.archived_reason ||
            record.status ||
            "IMPORTED",
        });
      } else if (editType === "violation") {
        // For archived violations - extract student name from JSX
        const studentName =
          record.studentName?.props?.children?.[0]?.props?.children ||
          record.student_name ||
          "";
        const nameParts = extractNameFromFullName(studentName);
        const normalizedName = splitMiddleInitialFromFirstName(
          record.firstName || record.first_name || nameParts.firstName || "",
          record.middleInitial || record.middle_initial || nameParts.middleInitial || "",
        );
        const schoolId =
          record.studentName?.props?.children?.[1]?.props?.children ||
          record.school_id ||
          "";
        setFormData({
          firstName: normalizedName.firstName || "",
          middleInitial: normalizedName.middleInitial || "",
          lastName:
            record.lastName ||
            record.last_name ||
            nameParts.lastName ||
            "",
          schoolId: schoolId,
          yearSection: record.yearSection || "",
          violation: record.violation || "",
          type: record.type || "",
          reportedBy: record.reportedBy || "",
          remarks: record.remarks || "",
          semester: record.semester || "",
          schoolYear: record.schoolYear || record.school_year || "",
        });
      }
    }
  }, [record, editType, isOpen]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      if (editType === "user") {
        const normalizedName = splitMiddleInitialFromFirstName(
          formData.firstName,
          formData.middleInitial,
        );
        const updatedRecord = {
          firstName: normalizedName.firstName || "",
          middleInitial: normalizedName.middleInitial || "",
          lastName: formData.lastName?.trim() || "",
          program: formData.program?.trim() || "",
          yearSection: formData.yearSection?.trim() || "",
        };
        await onSave(record.id, updatedRecord);
      } else if (editType === "violation") {
        const normalizedName = splitMiddleInitialFromFirstName(
          formData.firstName,
          formData.middleInitial,
        );
        const updatedRecord = {
          remarks: formData.remarks?.trim() || "",
          reportedBy: formData.reportedBy?.trim() || "",
          semester: formData.semester?.trim() || "",
          schoolYear: formData.schoolYear?.trim() || "",
          firstName: normalizedName.firstName || "",
          middleInitial: normalizedName.middleInitial || "",
          lastName: formData.lastName?.trim() || "",
        };
        await onSave(record.id, updatedRecord);
      }
    } catch (err) {
      setError(err.message || "Failed to save changes");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <span className="font-black font-inter">
          {editType === "user" ? "Edit Archived User" : "Edit Archived Violation"}
        </span>
      }
      size="lg"
      showCloseButton={true}
    >
      <form onSubmit={handleSubmit}>
        <p className="text-sm text-gray-400 mb-4">
          {editType === "user"
            ? "Update the archived student's information."
            : "Update the archived violation record."}
        </p>

        {error && (
          <div className="mb-4 bg-red-500/10 border border-red-500/40 rounded-lg p-3 flex gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}

        {editType === "user" ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <GlassInput
                label={<span className="text-sm font-medium text-white mb-2">First Name</span>}
                name="firstName"
                value={formData.firstName}
                onChange={handleChange}
                placeholder="First Name"
              />
              <GlassInput
                label={<span className="text-sm font-medium text-white mb-2">Middle Initial</span>}
                name="middleInitial"
                value={formData.middleInitial}
                onChange={handleChange}
                placeholder="M"
                maxLength={2}
              />
              <GlassInput
                label={<span className="text-sm font-medium text-white mb-2">Last Name</span>}
                name="lastName"
                value={formData.lastName}
                onChange={handleChange}
                placeholder="Last Name"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <GlassInput
                label={<span className="text-sm font-medium text-white mb-2">Email</span>}
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="Email"
                disabled
              />
              <GlassInput
                label={<span className="text-sm font-medium text-white mb-2">Program</span>}
                name="program"
                value={formData.program}
                onChange={handleChange}
                placeholder="Program"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <GlassInput
                label={<span className="text-sm font-medium text-white mb-2">Year/Section</span>}
                name="yearSection"
                value={formData.yearSection}
                onChange={handleChange}
                placeholder="e.g., 1A, 2B, 3C"
              />
              <GlassInput
                label={<span className="text-sm font-medium text-white mb-2">Status</span>}
                name="status"
                value={formData.status}
                placeholder="Status"
                disabled
              />
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <GlassInput
                label={<span className="text-sm font-medium text-white mb-2">First Name</span>}
                name="firstName"
                value={formData.firstName}
                onChange={handleChange}
                placeholder="First Name"
              />
              <GlassInput
                label={<span className="text-sm font-medium text-white mb-2">Middle Initial</span>}
                name="middleInitial"
                value={formData.middleInitial}
                onChange={handleChange}
                placeholder="M"
                maxLength={2}
              />
              <GlassInput
                label={<span className="text-sm font-medium text-white mb-2">Last Name</span>}
                name="lastName"
                value={formData.lastName}
                onChange={handleChange}
                placeholder="Last Name"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <GlassInput
                label={<span className="text-sm font-medium text-white mb-2">School ID</span>}
                name="schoolId"
                value={formData.schoolId}
                onChange={handleChange}
                placeholder="School ID"
                disabled
              />
              <GlassInput
                label={<span className="text-sm font-medium text-white mb-2">Program-Year/Section</span>}
                name="yearSection"
                value={formData.yearSection}
                onChange={handleChange}
                placeholder="Program-Year/Section"
                disabled
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <GlassInput
                label={<span className="text-sm font-medium text-white mb-2">Violation</span>}
                name="violation"
                value={formData.violation}
                onChange={handleChange}
                placeholder="Violation"
                disabled
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <GlassInput
                label={<span className="text-sm font-medium text-white mb-2">Reported By</span>}
                name="reportedBy"
                value={formData.reportedBy}
                onChange={handleChange}
                placeholder="Reported By"
              />
              <GlassInput
                label={<span className="text-sm font-medium text-white mb-2">Type</span>}
                name="type"
                value={formData.type}
                onChange={handleChange}
                placeholder="Type"
                disabled
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <SelectField
                label="Semester"
                name="semester"
                value={formData.semester}
                onChange={handleChange}
                className="bg-[rgba(45,47,52,0.8)] border-white/5 focus:border-white/20 focus:ring-white/10"
              >
                  <option value="">Select semester</option>
                  <option value="1ST SEM">1ST SEM</option>
                  <option value="2ND SEM">2ND SEM</option>
                  <option value="SUMMER">SUMMER</option>
              </SelectField>
              <GlassInput
                label={<span className="text-sm font-medium text-white mb-2">School Year</span>}
                name="schoolYear"
                value={formData.schoolYear}
                onChange={handleChange}
                placeholder="e.g., 2025-2026"
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-white mb-2">Remarks</label>
              <textarea
                name="remarks"
                value={formData.remarks}
                onChange={handleChange}
                placeholder="Remarks"
                rows={4}
                className="w-full backdrop-blur-md border border-white/5 rounded-xl px-4 py-3 text-[15px] text-white bg-[rgba(45,47,52,0.8)] placeholder-gray-500 focus:outline-none focus:border-white/20 transition-all resize-none"
              />
            </div>
            {record?.signatureImage && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-white mb-2">Signature</label>
                <div className="w-full border border-white/10 rounded-xl p-4 bg-[rgba(45,47,52,0.5)]">
                  <img
                    src={record.signatureImage}
                    alt="Signature"
                    className="max-h-48 mx-auto border border-white/5 rounded"
                  />
                </div>
              </div>
            )}
          </>
        )}

        <ModalFooter>
          <Button
            variant="outline"
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="px-8 py-2 bg-white text-[#1a1a1a] border-0 hover:bg-gray-100"
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            disabled={isLoading}
            className="px-8 py-2 bg-[#556987] text-white hover:bg-[#3d4654]"
          >
            {isLoading ? "Saving..." : "Save Changes"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
};

export default EditArchiveModal;
