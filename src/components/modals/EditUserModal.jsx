import React, { useState, useEffect } from "react";
import Modal, { ModalFooter, ModalDivider } from "@/components/ui/Modal";
import GlassInput from "@/components/ui/GlassInput";
import Button from "@/components/ui/Button";

const EditUserModal = ({ isOpen, onClose, user, onSave }) => {
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    schoolId: "",
    program: "",
    yearSection: "",
    email: "",
    status: "",
    violationCount: 0,
  });

  useEffect(() => {
    if (user) {
      setFormData({
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        schoolId: user.schoolId,
        program: user.program,
        yearSection: user.yearSection,
        email: user.email || "",
        status: user.status,
        violationCount: user.violationCount,
      });
    }
  }, [user]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const saved = await onSave(user.id, formData);
    if (saved) {
      onClose();
    }
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
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
                Student ID
              </span>
            }
            name="schoolId"
            value={formData.schoolId}
            onChange={handleChange}
            placeholder="Student ID"
          />

          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Program
            </label>
            <select
              name="program"
              value={formData.program}
              onChange={handleChange}
              className="w-full backdrop-blur-md border border-white/5 rounded-xl px-4 py-3 text-[15px] text-white bg-[rgba(45,47,52,0.8)] placeholder-gray-500 focus:outline-none focus:border-white/20 transition-all appearance-none"
            >
              <option value="">Select...</option>
              <option value="BSIT">BSIT</option>
              <option value="BSCS">BSCS</option>
            </select>
          </div>
          <GlassInput
            label={
              <span className="text-sm font-medium text-white mb-2">
                Year/Section
              </span>
            }
            name="yearSection"
            value={formData.yearSection}
            onChange={handleChange}
            placeholder="Year/Section"
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
            placeholder="student@email.com"
          />
        </div>

        <ModalDivider />

        <div className="mb-4">
          <label className="block text-sm font-medium text-white mb-2">
            Status
          </label>
          <select
            name="status"
            value={formData.status}
            onChange={handleChange}
            className="w-full backdrop-blur-md border border-white/5 rounded-xl px-4 py-3 text-[15px] text-white bg-[rgba(45,47,52,0.8)] placeholder-gray-500 focus:outline-none focus:border-white/20 transition-all appearance-none"
          >
            <option value="">Select...</option>
            <option value="Regular">Regular</option>
            <option value="Irregular">Irregular</option>
          </select>
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
          />
        </div>
        <ModalFooter>
          <Button
            variant="outline"
            type="button"
            onClick={onClose}
            className="px-8 py-2 bg-white text-[#1a1a1a] border-0 hover:bg-gray-100"
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            className="px-8 py-2 bg-[#556987] text-white hover:bg-[#3d4654]"
          >
            Save Changes
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
};

export default EditUserModal;
