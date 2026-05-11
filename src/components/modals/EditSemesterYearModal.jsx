import React, { useState, useEffect } from "react";
import Modal, { ModalFooter } from "@/components/ui/Modal";
import GlassInput from "@/components/ui/GlassInput";
import Button from "@/components/ui/Button";
import { AlertCircle, Loader2 } from "lucide-react";
import SelectField from "@/components/ui/SelectField";

const EditSemesterYearModal = ({ isOpen, onClose, currentSemester, currentSchoolYear, onSave, onSuccess }) => {
  const [formData, setFormData] = useState({
    semester: currentSemester || "1ST SEM",
    schoolYear: currentSchoolYear || "2025-2026",
  });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setFormData({
        semester: currentSemester || "1ST SEM",
        schoolYear: currentSchoolYear || "2025-2026",
      });
      setError("");
    }
  }, [isOpen, currentSemester, currentSchoolYear]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    if (!formData.semester?.trim()) {
      setError("Semester is required");
      setIsLoading(false);
      return;
    }

    if (!formData.schoolYear?.trim()) {
      setError("School Year is required");
      setIsLoading(false);
      return;
    }

    try {
      await onSave(formData.semester.trim(), formData.schoolYear.trim());
      onClose();
      onSuccess?.();
    } catch (err) {
      setError(err.message || "Failed to save changes");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={isLoading ? () => {} : onClose}
      title={
        <span className="font-black font-inter">Edit Semester & School Year</span>
      }
      size="md"
      showCloseButton={!isLoading}
    >
      <form onSubmit={handleSubmit}>
        <p className="text-sm text-gray-400 mb-4">
          Update the current semester and school year. This will be updated across all pages.
        </p>

        {error && (
          <div className="mb-4 bg-red-500/10 border border-red-500/40 rounded-lg p-3 flex gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}
        <div className="space-y-4 mb-4">
          <SelectField
            label="Semester"
            name="semester"
            value={formData.semester}
            onChange={handleChange}
            disabled={isLoading}
            className="bg-[rgba(45,47,52,0.8)] border-white/5 focus:border-white/20 focus:ring-white/10"
          >
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
            disabled={isLoading}
          />
        </div>

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
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Saving Changes...</span>
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

export default EditSemesterYearModal;
