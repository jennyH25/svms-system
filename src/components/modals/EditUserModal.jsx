import React, { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import Modal, { ModalFooter, ModalDivider } from "@/components/ui/Modal";
import GlassInput from "@/components/ui/GlassInput";
import Button from "@/components/ui/Button";
import SelectField from "@/components/ui/SelectField";

const SCHOOL_ID_PATTERN = /^\d{2}-\d{5}$/;
const YEAR_SECTION_PATTERN = /^[1-4][A-Z]$/;

const EditUserModal = ({ isOpen, onClose, user, onSave, isSaving = false }) => {
  const allowedEmailDomain = "@plpasig.edu.ph";
  const [formData, setFormData] = useState({
    username: "",
    firstName: "",
    middleInitial: "",
    lastName: "",
    schoolId: "",
    program: "",
    yearSection: "",
    email: "",
    status: "",
    violationCount: 0,
  });
  const [emailError, setEmailError] = useState("");
  const [schoolIdError, setSchoolIdError] = useState("");
  const [yearSectionError, setYearSectionError] = useState("");

  useEffect(() => {
    if (user) {
      setFormData({
        username: user.username || "",
        firstName: user.firstName || "",
        middleInitial: user.middleInitial || "",
        lastName: user.lastName || "",
        schoolId: user.schoolId || "",
        program: user.program || "",
        yearSection: user.yearSection || "",
        email: user.email || "",
        status: user.status || "",
        violationCount: Number(user.violationCount) || 0,
      });
      setEmailError("");
      setSchoolIdError("");
      setYearSectionError("");
    }
  }, [user]);

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
    const normalizedEmail = String(value || "").trim().toLowerCase();

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
    await onSave(user.id, formData);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={<span className="font-black font-inter">Edit User</span>}
      size="lg"
      showCloseButton={true}
    >
      <form onSubmit={handleSubmit}>
        <p className="text-sm text-gray-400 mb-4">Edit the user details.</p>
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
            placeholder="First Name"
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
            placeholder="Last Name"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <GlassInput
            label={
              <span className="text-sm font-medium text-white mb-2">
                School ID
              </span>
            }
            name="schoolId"
            value={formData.schoolId}
            onChange={handleChange}
            placeholder="00-0000"
            maxLength={8}
            aria-describedby="edit-user-school-id-error"
          />
          {schoolIdError && (
            <p id="edit-user-school-id-error" className="mt-2 text-sm text-red-300 md:col-span-2">
              {schoolIdError}
            </p>
          )}
          <GlassInput
            label={
              <span className="text-sm font-medium text-white mb-2">
                Username
              </span>
            }
            name="username"
            value={formData.username}
            onChange={handleChange}
            placeholder="Username"
          />
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
            aria-describedby="edit-user-year-section-error"
          />
          {yearSectionError && (
            <p id="edit-user-year-section-error" className="mt-2 text-sm text-red-300 md:col-span-2">
              {yearSectionError}
            </p>
          )}
          <SelectField
            label="Program"
            name="program"
            value={formData.program}
            onChange={handleChange}
            className="bg-[rgba(45,47,52,0.8)] border-white/5 focus:border-white/20 focus:ring-white/10"
          >
              <option value="">Select...</option>
              <option value="BSIT">BSIT</option>
              <option value="BSCS">BSCS</option>
          </SelectField>
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
            aria-describedby="edit-user-email-error"
          />
          {emailError && (
            <p id="edit-user-email-error" className="mt-2 text-sm text-red-300">
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
            <option value="">Select...</option>
            <option value="Regular">Regular</option>
            <option value="Irregular">Irregular</option>
          </SelectField>
        </div>
        <div className="mb-4">
          <GlassInput
            label={
              <span className="text-sm font-medium text-white mb-2">
                Violation Count
              </span>
            }
            name="violationCount"
            type="number"
            min="0"
            value={formData.violationCount}
            onChange={handleChange}
            placeholder="Violation Count"
            disabled={true}
          />
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
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
};

export default EditUserModal;
