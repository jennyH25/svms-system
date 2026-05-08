import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import Modal, { ModalDivider, ModalFooter } from "@/components/ui/Modal";
import GlassInput from "@/components/ui/GlassInput";
import Button from "@/components/ui/Button";
import SelectField from "@/components/ui/SelectField";

const DEFAULT_FORM = {
  firstName: "",
  lastName: "",
  email: "",
  role: "admin",
  isActive: true,
};

const AdminAccountModal = ({
  isOpen,
  onClose,
  onSave,
  isSaving = false,
  mode = "create",
  initialData = null,
}) => {
  const [formData, setFormData] = useState(DEFAULT_FORM);

  useEffect(() => {
    if (!isOpen) {
      setFormData(DEFAULT_FORM);
      return;
    }

    if (initialData) {
      setFormData({
        firstName: initialData.firstName || "",
        lastName: initialData.lastName || "",
        email: initialData.email || "",
        role: initialData.role || "admin",
        isActive:
          typeof initialData.isActive === "boolean"
            ? initialData.isActive
            : true,
      });
      return;
    }

    setFormData(DEFAULT_FORM);
  }, [initialData, isOpen]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSaving) {
      return;
    }

    const saved = await onSave?.(formData);
    if (saved) {
      onClose?.();
    }
  };

  const isEditMode = mode === "edit";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <span className="font-black font-inter">
          {isEditMode ? "Edit Admin Account" : "Add Admin Account"}
        </span>
      }
      size="lg"
      showCloseButton={!isSaving}
    >
      <form onSubmit={handleSubmit}>
        <p className="mb-5 text-sm text-gray-400">
          {isEditMode
            ? "Update this administrator account."
            : "Create a new admin or super admin account."}
        </p>

        <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <GlassInput
            label={<span className="text-sm font-medium text-white">First Name</span>}
            name="firstName"
            value={formData.firstName}
            onChange={handleChange}
            required
          />
          <GlassInput
            label={<span className="text-sm font-medium text-white">Last Name</span>}
            name="lastName"
            value={formData.lastName}
            onChange={handleChange}
            required
          />
        </div>

        <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <SelectField
            label="Type of User"
            name="role"
            value={formData.role}
            onChange={handleChange}
          >
            <option value="admin">Admin</option>
            <option value="super_admin">Super Admin</option>
          </SelectField>
          <GlassInput
            label={<span className="text-sm font-medium text-white">Email</span>}
            name="email"
            type="email"
            value={formData.email}
            onChange={handleChange}
            required
          />
        </div>

        {isEditMode && (
          <>
            <ModalDivider />
            <div className="mb-4">
              <SelectField
                label="Account Status"
                name="isActive"
                value={String(formData.isActive)}
                onChange={(event) =>
                  setFormData((prev) => ({
                    ...prev,
                    isActive: event.target.value === "true",
                  }))
                }
              >
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </SelectField>
            </div>
          </>
        )}

        <ModalFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSaving}
            className="px-8 py-2 bg-white text-[#1a1a1a] border-0 hover:bg-gray-100"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={isSaving}
            className="px-8 py-2 bg-[#556987] text-white hover:bg-[#3d4654]"
          >
            {isSaving
              ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {isEditMode ? "Saving..." : "Creating..."}
                </>
              )
              : isEditMode
                ? "Save Changes"
                : "Create Account"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
};

export default AdminAccountModal;
