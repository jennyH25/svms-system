import React, { useEffect, useMemo, useState } from "react";
import Modal, { ModalDivider, ModalFooter } from "@/components/ui/Modal";
import GlassInput from "@/components/ui/GlassInput";
import Button from "@/components/ui/Button";
import ViolationPickerModal from "@/components/modals/ViolationPickerModal";
import { AlertCircle, CheckCircle, PenTool, RotateCcw } from "lucide-react";

const initialForm = {
  violationLabel: "",
  reportedBy: "",
  remarks: "",
  dateLogged: "",
};

const EditViolationModal = ({
  isOpen,
  onClose,
  record,
  onSave,
  onUnclear,
  isUnclearing = false,
  onUpdateSignature,
}) => {
  const [formData, setFormData] = useState(initialForm);
  const [error, setError] = useState("");
  const [showViolationPicker, setShowViolationPicker] = useState(false);
  const [allViolations, setAllViolations] = useState([]);
  const [selectedCatalogId, setSelectedCatalogId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [alertModal, setAlertModal] = useState(null);

  useEffect(() => {
    if (!isOpen || !record) return;

    const bootstrap = async () => {
      try {
        const response = await fetch("/api/violations");
        const data = await response.json().catch(() => ({}));
        if (response.ok && Array.isArray(data.violations)) {
          setAllViolations(data.violations);
        } else {
          setAllViolations([]);
        }
      } catch {
        setAllViolations([]);
      }
    };

    bootstrap();

    const parsed = new Date(record.created_at);
    const dateStr = Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().split("T")[0];

    setError("");
    setIsSaving(false);
    setShowViolationPicker(false);
    setAlertModal(null);
    setSelectedCatalogId(record.violation_catalog_id || null);
    setFormData({
      violationLabel: record.violation_label || "",
      reportedBy: record.reported_by || "",
      remarks: record.remarks || "",
      dateLogged: dateStr,
    });
  }, [isOpen, record]);

  const displayDate = useMemo(() => {
    if (!record?.created_at) return "-";
    const parsed = new Date(record.created_at);
    return Number.isNaN(parsed.getTime()) ? "-" : parsed.toLocaleDateString();
  }, [record?.created_at]);

  const ReadOnlyInput = ({ label, value }) => (
    <div>
      <label className="block text-sm font-medium text-white mb-2">
        {label} <span className="text-gray-500 text-xs">(Read-only)</span>
      </label>
      <input
        value={value || ""}
        readOnly
        disabled
        className="w-full bg-gray-800/50 border border-gray-700/50 rounded-xl px-4 py-3 text-[15px] text-white/80 cursor-not-allowed"
      />
    </div>
  );

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!record?.id) {
      setError("Invalid record selected.");
      return;
    }

    if (!formData.violationLabel.trim()) {
      setError("Violation label is required.");
      return;
    }

    setError("");
    setIsSaving(true);

    await onSave?.(record.id, {
      violationCatalogId: selectedCatalogId,
      violationLabel: formData.violationLabel.trim(),
      reportedBy: formData.reportedBy,
      remarks: formData.remarks,
      dateLogged: formData.dateLogged,
    });

    setIsSaving(false);
    setAlertModal({
      type: "success",
      title: "Changes Saved",
      message: "The violation record has been successfully updated.",
    });
  };

  const handleViolationPicked = (selected) => {
    if (!selected) return;

    const label = `${selected.name} (${selected.category} | ${selected.degree})`;
    setSelectedCatalogId(selected.id);
    setFormData((prev) => ({ ...prev, violationLabel: label }));
  };

  const handleSignatureClick = () => {
    onUpdateSignature?.();
  };

  const handleUnclearClick = () => {
    setAlertModal({
      type: "confirm",
      title: "Unclear Violation",
      message: "Are you sure you want to reopen this violation? This action will change the status from Cleared to Pending.",
      onConfirm: async () => {
        setAlertModal(null);
        await onUnclear?.();
        setAlertModal({
          type: "success",
          title: "Violation Reopened",
          message: "The violation status has been changed to Pending.",
        });
      },
    });
  };

  const hasAttachedSignature = Boolean(
    record?.signature_image || record?.has_signature,
  );

  return (
    <>
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={<span className="font-black font-inter">Edit Violation</span>}
      size="xl"
      showCloseButton
      className="max-h-[calc(100vh-1rem)] sm:max-h-[calc(100vh-1.5rem)]"
    >
      <form onSubmit={handleSubmit} className="flex max-h-[calc(100vh-11rem)] flex-col">
        <div className="modal-scrollbar flex-1 overflow-y-auto pr-2">
          <p className="text-sm text-gray-300 mb-4">Edit this student violation record.</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <ReadOnlyInput label="Student Name" value={record?.full_name} />
            <ReadOnlyInput label="Student No." value={record?.school_id} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <GlassInput
              label={<span className="text-sm font-medium text-white mb-2">Date Logged</span>}
              name="dateLogged"
              type="date"
              value={formData.dateLogged}
              onChange={handleChange}
              placeholder="Select date"
            />
            <ReadOnlyInput label="Program" value={record?.program} />
          </div>

          <div className="mb-6">
            <ReadOnlyInput label="Year/Section" value={record?.year_section} />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-white mb-2">Type of Violation</label>
            <input
              value={formData.violationLabel}
              readOnly
              placeholder="Select from violations list"
              className="w-full backdrop-blur-md border border-white/5 rounded-xl px-4 py-3 text-[15px] text-white bg-[rgba(45,47,52,0.8)] placeholder-gray-500 focus:outline-none mb-2"
            />
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={() => setShowViolationPicker(true)}
              disabled={isSaving || isUnclearing}
            >
              Change Violation
            </Button>
          </div>

          <div className="mb-4">
            <GlassInput
              label={<span className="text-sm font-medium text-white mb-2">Reported by</span>}
              name="reportedBy"
              value={formData.reportedBy}
              onChange={handleChange}
              placeholder="Reported by"
            />
          </div>

          <ModalDivider />

          <div className="mb-6">
            <label className="block text-sm font-medium text-white mb-2">Remarks</label>
            <textarea
              name="remarks"
              value={formData.remarks}
              onChange={handleChange}
              rows={4}
              placeholder="Remarks"
              style={{ backgroundColor: "rgba(45, 47, 52, 0.8)" }}
              className="w-full backdrop-blur-md border border-white/5 rounded-xl px-4 py-3 text-[15px] text-white placeholder-gray-500 focus:outline-none focus:border-white/20 transition-all resize-y min-h-[80px]"
            />
          </div>

          {record?.signature_image && (
            <div className="mb-6">
              <label className="block text-sm font-medium text-white mb-2">Signature</label>
              <div className="rounded-xl border border-white/10 bg-black/20 p-4 flex items-center justify-center min-h-[120px]">
                <img
                  src={record.signature_image}
                  alt="Student signature"
                  className="max-h-[250px] max-w-full object-contain"
                />
              </div>
            </div>
          )}

          {error ? <p className="text-sm text-red-300 mb-4">{error}</p> : null}

          <div className="mb-6 p-4 bg-blue-500/5 border border-blue-400/20 rounded-lg flex flex-col gap-3">
            <Button
              type="button"
              variant="primary"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white gap-2"
              onClick={handleSignatureClick}
              disabled={isSaving || isUnclearing}
            >
              <PenTool className="w-4 h-4" />
              {hasAttachedSignature ? "Update E-Signature" : "Attach E-Signature"}
            </Button>

            {record?.cleared_at ? (
              <Button
                type="button"
                variant="secondary"
                className="w-full bg-amber-600/20 border border-amber-400/30 hover:bg-amber-600/30 text-amber-200 gap-2"
                onClick={handleUnclearClick}
                disabled={isSaving || isUnclearing}
              >
                <RotateCcw className="w-4 h-4" />
                {isUnclearing ? "Unclearing..." : "Unclear Violation"}
              </Button>
            ) : null}
          </div>
        </div>

        <ModalFooter className="sticky bottom-0 -mx-6 -mb-6 border-t border-white/10 bg-[#1a1c20]/95 px-6 py-4 backdrop-blur">
          <Button
            variant="outline"
            type="button"
            onClick={onClose}
            disabled={isSaving || isUnclearing}
            className="px-8 py-2 bg-white text-[#1a1a1a] border-0 hover:bg-gray-100"
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            disabled={isSaving || isUnclearing}
            className="px-8 py-2 bg-[#556987] text-white hover:bg-[#3d4654]"
          >
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>

    {/* Alert Modal */}
    {alertModal && (alertModal.type === "success" || alertModal.type === "confirm" || alertModal.type === "signature") && (
      <Modal
        isOpen={Boolean(alertModal)}
        onClose={() => setAlertModal(null)}
        title={<span className="font-black font-inter flex items-center gap-2">
          {alertModal.type === "success" && <CheckCircle className="w-5 h-5 text-green-400" />}
          {alertModal.type === "confirm" && <AlertCircle className="w-5 h-5 text-amber-400" />}
          {alertModal.type === "signature" && <PenTool className="w-5 h-5 text-blue-400" />}
          {alertModal.title}
        </span>}
        size="sm"
        showCloseButton
      >
        <div className={`rounded-lg border px-4 py-3 mb-4 ${
          alertModal.type === "success"
            ? "border-green-400/25 bg-green-500/10"
            : alertModal.type === "signature"
              ? "border-blue-400/25 bg-blue-500/10"
              : "border-amber-400/25 bg-amber-500/10"
        }`}
        >
          <p className={`text-sm font-medium ${
            alertModal.type === "success"
              ? "text-green-300"
              : alertModal.type === "signature"
                ? "text-blue-300"
                : "text-amber-200"
          }`}
          >
            {alertModal.message}
          </p>
        </div>
        <ModalFooter>
          {alertModal.type === "confirm" && (
            <Button
              variant="outline"
              onClick={() => setAlertModal(null)}
              className="px-6"
            >
              Cancel
            </Button>
          )}
          {alertModal.type === "signature" && (
            <Button
              variant="outline"
              onClick={() => setAlertModal(null)}
              className="px-6"
            >
              Cancel
            </Button>
          )}
          <Button
            variant={alertModal.type === "success" ? "primary" : alertModal.type === "signature" ? "primary" : "danger"}
            onClick={() => {
              if (alertModal.onConfirm) {
                alertModal.onConfirm();
              } else {
                setAlertModal(null);
              }
            }}
            className="px-6"
          >
            {alertModal.type === "signature" ? "Open Signature Pad" : "OK"}
          </Button>
        </ModalFooter>
      </Modal>
    )}

    <ViolationPickerModal
      isOpen={showViolationPicker}
      onClose={() => setShowViolationPicker(false)}
      violations={allViolations}
      onSelect={handleViolationPicked}
    />
  </>
  );
};

export default EditViolationModal;
