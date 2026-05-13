import React, { useState, useEffect } from "react";
import Modal, { ModalFooter, ModalDivider } from "@/components/ui/Modal";
import GlassInput from "@/components/ui/GlassInput";
import Button from "@/components/ui/Button";
import SelectField from "@/components/ui/SelectField";

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
    }
  }, [isOpen]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === "email" && emailError) {
      setEmailError("");
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSaving) {
      return;
    }

    const errorMessage = validateEmail(formData.email);
    if (errorMessage) {
      setEmailError(errorMessage);
      return;
    }

    setEmailError("");
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
            placeholder="M"
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
            required
          />
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
            required
          />
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
            {isSaving ? "Sending Credentials..." : "Add User"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
};

export default AddUserModal;
