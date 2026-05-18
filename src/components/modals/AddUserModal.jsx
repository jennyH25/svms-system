import React, { useState, useEffect } from "react";
import Modal, { ModalFooter, ModalDivider } from "@/components/ui/Modal";
import GlassInput from "@/components/ui/GlassInput";
import Button from "@/components/ui/Button";
import SelectField from "@/components/ui/SelectField";

const SCHOOL_ID_PATTERN = /^\d{2}-\d{5}$/;
const YEAR_SECTION_PATTERN = /^[1-4][A-Z]$/;

const AddUserModal = ({ isOpen, onClose, onSave, isSaving = false }) => {
  const allowedEmailDomain = "@plpasig.edu.ph";
  const [formData, setFormData] = useState({
    firstName: "",
    middleInitial: "",
    lastName: "",
    schoolId: "",
    program: "BSIT",
    yearSection: "",
    email: "",
    status: "Regular",
  });
  const [emailError, setEmailError] = useState("");
  const [schoolIdError, setSchoolIdError] = useState("");
  const [yearSectionError, setYearSectionError] = useState("");

  useEffect(() => {
    if (!isOpen) {
      // Reset form when modal closes
      setFormData({
        firstName: "",
        middleInitial: "",
        lastName: "",
        schoolId: "",
        program: "BSIT",
        yearSection: "",
        email: "",
        status: "Regular",
      });
      setEmailError("");
      setSchoolIdError("");
      setYearSectionError("");
    }
  }, [isOpen]);

  const normalizeSchoolIdInput = (value) => {
    const digitsOnly = String(value || "").replace(/\D/g, "").slice(0, 7);
    if (digitsOnly.length <= 2) {
      return digitsOnly;
    }
    return `${digitsOnly.slice(0, 2)}-${digitsOnly.slice(2)}`;
  };

  const normalizeYearSectionInput = (value) => {
    const sanitized = String(value || "")
      .replace(/[^0-9a-z]/gi, "")
      .toUpperCase()
      .slice(0, 2);
    if (!sanitized) {
      return "";
    }
    const yearChar = sanitized.charAt(0).replace(/[^1-4]/g, "");
    const sectionChar = sanitized.slice(1).replace(/[^A-Z]/g, "");
    return `${yearChar}${sectionChar}`.slice(0, 2);
  };

  const handleChange = (e) => {
    const { name } = e.target;
    let { value } = e.target;
    if (name === "email" && emailError) {
      setEmailError("");
    }
    if (name === "schoolId") {
      value = normalizeSchoolIdInput(value);
      if (schoolIdError) {
        setSchoolIdError("");
      }
    }
    if (name === "yearSection") {
      value = normalizeYearSectionInput(value);
      if (yearSectionError) {
        setYearSectionError("");
      }
    }
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const validateEmail = (value) => {
    const normalizedEmail = value.trim().toLowerCase();

    if (!normalizedEmail) {
      return "Please enter an email address.";
    }

    if (!normalizedEmail.includes("@")) {
      return "Please enter a valid email address.";
    }

    if (!normalizedEmail.endsWith(allowedEmailDomain)) {
      return `Email must end with ${allowedEmailDomain}.`;
    }

    return "";
  };

  const validateSchoolId = (value) => {
    const normalized = String(value || "").trim();
    if (!normalized) {
      return "Please enter a school ID.";
    }
    if (!SCHOOL_ID_PATTERN.test(normalized)) {
      return "School ID must use the format 23-00164.";
    }
    return "";
  };

  const validateYearSection = (value) => {
    const normalized = String(value || "").trim().toUpperCase();
    if (!normalized) {
      return "Please enter a year/section.";
    }
    if (!YEAR_SECTION_PATTERN.test(normalized)) {
      return "Year/Section must use the format 1A, 2B, or 3C.";
    }
    return "";
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSaving) {
      return;
    }

    const errorMessage = validateEmail(formData.email);
    const schoolIdValidation = validateSchoolId(formData.schoolId);
    const yearSectionValidation = validateYearSection(formData.yearSection);
    if (errorMessage) {
      setEmailError(errorMessage);
    }
    if (schoolIdValidation) {
      setSchoolIdError(schoolIdValidation);
    }
    if (yearSectionValidation) {
      setYearSectionError(yearSectionValidation);
    }
    if (errorMessage || schoolIdValidation || yearSectionValidation) {
      return;
    }

    setEmailError("");
    setSchoolIdError("");
    setYearSectionError("");
    const saved = await onSave(formData);
    if (saved) {
      onClose();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={<span className="font-black font-inter">Add New User</span>}
      size="lg"
      showCloseButton={true}
    >
      <form onSubmit={handleSubmit}>
        <p className="text-sm text-gray-400 mb-4">
          Add a new student to the system.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <GlassInput
            label={
              <span className="text-sm font-medium text-white mb-2">
                First Name
              </span>
            }
            name="firstName"
            value={formData.firstName}
            onChange={handleChange}
            required
          />
          <GlassInput
            label={
              <span className="text-sm font-medium text-white mb-2">
                Middle Initial
              </span>
            }
            name="middleInitial"
            value={formData.middleInitial}
            onChange={handleChange}
            maxLength={3}
          />
          <GlassInput
            label={
              <span className="text-sm font-medium text-white mb-2">
                Last Name
              </span>
            }
            name="lastName"
            value={formData.lastName}
            onChange={handleChange}
            required
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <GlassInput
            label={
              <span className="text-sm font-medium text-white mb-2">
                Student ID
              </span>
            }
            name="schoolId"
            value={formData.schoolId}
            onChange={handleChange}
            placeholder="00-0000"
            maxLength={8}
            required
            aria-describedby="add-user-school-id-error"
          />
          {schoolIdError && (
            <p id="add-user-school-id-error" className="mt-2 text-sm text-red-300 md:col-span-2">
              {schoolIdError}
            </p>
          )}
          <SelectField label="Program" name="program" value={formData.program} onChange={handleChange}>
              <option value="BSIT">BSIT</option>
              <option value="BSCS">BSCS</option>
          </SelectField>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <GlassInput
            label={
              <span className="text-sm font-medium text-white mb-2">
                Year/Section
              </span>
            }
            name="yearSection"
            value={formData.yearSection}
            onChange={handleChange}
            placeholder="1A"
            maxLength={2}
            required
            aria-describedby="add-user-year-section-error"
          />
          {yearSectionError && (
            <p id="add-user-year-section-error" className="mt-2 text-sm text-red-300 md:col-span-2">
              {yearSectionError}
            </p>
          )}
        </div>

        <div className="mb-4">
          <GlassInput
            label={
              <span className="text-sm font-medium text-white mb-2">Email</span>
            }
            name="email"
            type="email"
            value={formData.email}
            onChange={handleChange}
            placeholder={`name${allowedEmailDomain}`}
            required
            aria-describedby="add-user-email-error"
          />
          {emailError && (
            <p id="add-user-email-error" className="mt-2 text-sm text-red-300">
              {emailError}
            </p>
          )}
        </div>

        <ModalDivider />

        <div className="mb-4">
          <SelectField
            label="Status"
            name="status"
            value={formData.status}
            onChange={handleChange}
            className="bg-[rgba(45,47,52,0.8)] border-white/5 focus:border-white/20 focus:ring-white/10"
          >
            <option value="Regular">Regular</option>
            <option value="Irregular">Irregular</option>
          </SelectField>
        </div>
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
            disabled={isSaving}
            className="px-8 py-2 bg-[#556987] text-white hover:bg-[#3d4654]"
          >
            {isSaving ? "Adding User..." : "Add User"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
};

export default AddUserModal;
