import React from "react";
import Modal from "@/components/ui/Modal";

const SignaturePreviewModal = ({
  isOpen,
  onClose,
  imageSrc,
  alt = "Signature preview",
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="2xl"
      showCloseButton
      className="max-w-4xl"
    >
      <div className="flex min-h-[280px] items-center justify-center rounded-2xl border border-white/10 bg-black/20 p-4 sm:p-6">
        {imageSrc ? (
          <img
            src={imageSrc}
            alt={alt}
            className="max-h-[70vh] w-auto max-w-full rounded-xl bg-white object-contain shadow-2xl"
          />
        ) : (
          <p className="text-sm text-gray-300">No signature image available.</p>
        )}
      </div>
    </Modal>
  );
};

export default SignaturePreviewModal;
