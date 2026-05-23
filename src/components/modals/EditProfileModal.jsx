import React, { useEffect, useState } from "react";
import { Eye, EyeOff, Loader2, CheckCircle } from "lucide-react";
import Modal, { ModalFooter, ModalDivider } from "../ui/Modal";
import GlassInput from "../ui/GlassInput";
import Button from "../ui/Button";
import PasswordRequirements from "../ui/PasswordRequirements";
import {
  isPasswordValid,
  getPasswordErrorMessage,
} from "../../lib/passwordValidator";

/**
 * EditProfileModal - Modal for editing user profile
 *
 * @param {boolean} isOpen - Whether the modal is open
 * @param {Function} onClose - Callback when modal is closed
 * @param {Object} initialData - Initial user data { username, schoolId, firstName, lastName, email }
 * @param {Function} onSave - Callback when save is clicked with form data
 * @param {string} serverError - Error message from server
 * @param {Function} onClearError - Callback to clear server error
 */
const EditProfileModal = ({
  isOpen,
  onClose,
  initialData = {},
  onSave,
  isSaving = false,
  showSuccessModal = false,
  onCloseSuccessModal,
  serverError = "",
  onClearError,
}) => {
  const allowedEmailDomain = "@plpasig.edu.ph";

  const buildInitialFormData = () => ({
    username: initialData.username || "",
    schoolId: initialData.schoolId || "",
    firstName: initialData.firstName || "",
    middleInitial: String(initialData.middleInitial || "")
      .trim()
      .toUpperCase(),
    lastName: initialData.lastName || "",
    email: initialData.email || "",
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [formData, setFormData] = useState({
    ...buildInitialFormData(),
  });

  useEffect(() => {
    if (isOpen) {
      setFormData(buildInitialFormData());
      setValidationErrors({});
      setEmailError("");
      setCurrentPasswordError("");
      setCurrentPasswordValid(false);
      setShowPasswordRequirements(false);
      setShowPassword({
        currentPassword: false,
        newPassword: false,
        confirmPassword: false,
      });
      onClearError?.();
    }
  }, [isOpen]);

  // Handle server error for incorrect current password
  useEffect(() => {
    if (serverError && serverError.toLowerCase().includes("current password")) {
      setCurrentPasswordError(serverError);
    }
  }, [serverError]);

  const isStudent = initialData.role === "student";

  const [showPassword, setShowPassword] = useState({
    currentPassword: false,
    newPassword: false,
    confirmPassword: false,
  });

  const [showPasswordRequirements, setShowPasswordRequirements] =
    useState(false);
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [validationErrors, setValidationErrors] = useState({});
  const [currentPasswordError, setCurrentPasswordError] = useState("");
  const [currentPasswordValid, setCurrentPasswordValid] = useState(false);
  const [checkingPassword, setCheckingPassword] = useState(false);
  const [passwordCheckTimeout, setPasswordCheckTimeout] = useState(null);
  const [showValidationModal, setShowValidationModal] = useState(false);

  const togglePasswordVisibility = (field) => {
    setShowPassword((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  const handlePasswordInputChange = (e) => {
    const { name, value } = e.target;
    handleChange(name)(e);

    // Clear validation error when user starts typing
    if (validationErrors[name]) {
      setValidationErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }

    // Handle current password change
    if (name === "currentPassword") {
      if (currentPasswordError) {
        setCurrentPasswordError("");
      }
      if (currentPasswordValid) {
        setCurrentPasswordValid(false);
      }

      // Clear previous timeout
      if (passwordCheckTimeout) {
        clearTimeout(passwordCheckTimeout);
      }

      // If password field is empty, don't validate
      if (!value) {
        setCurrentPasswordValid(false);
        setCheckingPassword(false);
        return;
      }

      // Set timeout to validate after user stops typing
      setCheckingPassword(true);
      const timeout = setTimeout(() => {
        validateCurrentPasswordWithServer(value);
      }, 500);

      setPasswordCheckTimeout(timeout);
    }
  };

  // Validate current password with server
  const validateCurrentPasswordWithServer = async (password) => {
    if (!password) {
      setCheckingPassword(false);
      return;
    }

    try {
      const currentUser = JSON.parse(localStorage.getItem("svms_user") || "{}");
      const response = await fetch("/api/verify-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": currentUser?.id || "",
        },
        body: JSON.stringify({
          password: password,
        }),
      });

      const result = await response.json();

      if (response.ok && result.isValid) {
        setCurrentPasswordValid(true);
        setCurrentPasswordError("");
      } else {
        setCurrentPasswordValid(false);
        setCurrentPasswordError("Current password is incorrect.");
      }
    } catch (error) {
      console.error("Error validating password:", error);
      setCurrentPasswordValid(false);
      setCurrentPasswordError("Error verifying password. Please try again.");
    } finally {
      setCheckingPassword(false);
    }
  };

  // Check if user is entering a new password
  const isEnteringNewPassword = Boolean(
    formData.newPassword || formData.confirmPassword,
  );

  // Determine if Save button should be disabled
  const isSaveDisabled = () => {
    // Always disable if saving
    if (isSaving) return true;

    // If user is trying to change password
    if (isEnteringNewPassword) {
      // Must verify current password first
      if (!currentPasswordValid) return true;
      // Must not be checking password
      if (checkingPassword) return true;
      // Must have all required fields for password change
      const errors = validatePasswordFields();
      return Object.keys(errors).length > 0;
    }

    return false;
  };

  const validatePasswordFields = () => {
    const errors = {};
    const { currentPassword, newPassword, confirmPassword } = formData;

    // Only validate if user entered new password
    // If newPassword is empty, password change is optional
    const wantsPasswordChange = Boolean(newPassword || confirmPassword);

    if (wantsPasswordChange) {
      // Current password must be validated and correct
      if (!currentPassword) {
        errors.currentPassword =
          "Current password is required to change password";
      } else if (!currentPasswordValid) {
        errors.currentPassword = "Please verify your current password first";
      }

      // New password is required if trying to change
      if (!newPassword) {
        errors.newPassword = "New password is required";
      }
      // Confirm password is required if changing
      if (!confirmPassword) {
        errors.confirmPassword = "Confirm password is required";
      }

      // Validate password strength only if new password is entered
      if (newPassword && !isPasswordValid(newPassword)) {
        errors.newPassword = getPasswordErrorMessage(newPassword);
      }

      // Check if passwords match
      if (newPassword && confirmPassword && newPassword !== confirmPassword) {
        errors.confirmPassword = "Passwords do not match";
      }
    }

    return errors;
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

  const handleChange = (field) => (e) => {
    const nextValue = e.target.value;

    setFormData((prev) => ({ ...prev, [field]: nextValue }));

    if (field === "email") {
      setEmailError(nextValue ? validateEmail(nextValue) : "");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const nextEmailError = validateEmail(formData.email);

    // Validate password fields
    const errors = validatePasswordFields();
    if (nextEmailError) {
      errors.email = nextEmailError;
      setEmailError(nextEmailError);
    } else {
      setEmailError("");
    }

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      setShowValidationModal(true);
      return;
    }

    const normalizedFormData = {
      ...formData,
      middleInitial: String(formData.middleInitial || "")
        .trim()
        .toUpperCase(),
    };

    setFormData(normalizedFormData);
    setValidationErrors({});
    await onSave?.(normalizedFormData);
  };

  const handleCancel = () => {
    // Clear timeout if pending
    if (passwordCheckTimeout) {
      clearTimeout(passwordCheckTimeout);
    }

    setFormData(buildInitialFormData());
    setValidationErrors({});
    setEmailError("");
    setCurrentPasswordError("");
    setCurrentPasswordValid(false);
    setCheckingPassword(false);
    setShowValidationModal(false);
    setShowPasswordRequirements(false);
    setShowPassword({
      currentPassword: false,
      newPassword: false,
      confirmPassword: false,
    });
    onClearError?.();
    onClose?.();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={<span className="font-black font-inter">Edit User Profile</span>}
      size="lg"
      className="max-w-3xl"
      showCloseButton={true}
    >
      <form onSubmit={handleSubmit} autoComplete="off">
        {/* Server Error Message */}
        {serverError &&
          !serverError.toLowerCase().includes("current password") && (
            <div className="mb-4 bg-red-500/20 border border-red-500 text-red-400 px-4 py-3 rounded-lg text-sm">
              {serverError}
            </div>
          )}

        {/* Full Name */}
        <div className="mb-4">
          <p className="text-sm font-semibold text-white mb-2">Full Name</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                First Name
              </label>
              <GlassInput
                value={formData.firstName}
                onChange={handleChange("firstName")}
                placeholder="Enter first name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Middle Initial
              </label>
              <GlassInput
                value={formData.middleInitial}
                onChange={handleChange("middleInitial")}
                placeholder="Enter middle initial"
                maxLength={5}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Last Name
              </label>
              <GlassInput
                value={formData.lastName}
                onChange={handleChange("lastName")}
                placeholder="Enter last name"
              />
            </div>
          </div>
        </div>

        {/* Username and School ID (student only) */}
        <div className="mb-4">
          <div className={isStudent ? "grid grid-cols-1 gap-4 sm:grid-cols-2" : ""}>
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Username
              </label>
              <GlassInput
                value={formData.username}
                onChange={handleChange("username")}
                placeholder="Enter username"
              />
            </div>

            {isStudent && (
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  School ID
                </label>
                <GlassInput
                  value={formData.schoolId}
                  onChange={handleChange("schoolId")}
                  placeholder="Enter school ID"
                />
              </div>
            )}
          </div>
        </div>

        {/* Email */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-white mb-2">
            Email
          </label>
          <GlassInput
            type="email"
            value={formData.email}
            onChange={handleChange("email")}
            placeholder={`name${allowedEmailDomain}`}
            aria-describedby="edit-profile-email-error"
          />
          {emailError && (
            <p id="edit-profile-email-error" className="mt-2 text-sm text-red-300">
              {emailError}
            </p>
          )}
        </div>

        {/* Divider */}
        <ModalDivider />

        {/* Change Password Section */}
        <p className="text-sm text-gray-400 mb-4">Change Password</p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Current Password
            </label>
            <div className="relative">
              <GlassInput
                type={showPassword.currentPassword ? "text" : "password"}
                name="currentPassword"
                value={formData.currentPassword}
                onChange={handlePasswordInputChange}
                placeholder="Enter your current password"
                autoComplete="off"
                disabled={isSaving}
                className={`pr-10 ${
                  currentPasswordValid
                    ? "border-green-400/50"
                    : validationErrors.currentPassword || currentPasswordError
                      ? "border-red-400/50"
                      : checkingPassword
                        ? "border-yellow-400/50"
                        : ""
                }`}
              />
              <button
                type="button"
                onClick={() => togglePasswordVisibility("currentPassword")}
                disabled={isSaving}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
              >
                {showPassword.currentPassword ? (
                  <EyeOff className="w-5 h-5" />
                ) : (
                  <Eye className="w-5 h-5" />
                )}
              </button>
            </div>
            {checkingPassword && (
              <p className="text-yellow-400 text-xs mt-1">
                Verifying password...
              </p>
            )}
            {currentPasswordValid && !checkingPassword && (
              <p className="text-green-400 text-xs mt-1">
                ✓ Current password is correct
              </p>
            )}
            {validationErrors.currentPassword &&
              !checkingPassword &&
              !currentPasswordValid && (
                <p className="text-red-400 text-xs mt-1">
                  {validationErrors.currentPassword}
                </p>
              )}
            {currentPasswordError &&
              !checkingPassword &&
              !currentPasswordValid && (
                <p className="text-red-400 text-xs mt-1">
                  {currentPasswordError}
                </p>
              )}
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-2">
              New Password
              {isEnteringNewPassword && <span className="text-red-400">*</span>}
            </label>
            <div className="relative">
              <GlassInput
                type={showPassword.newPassword ? "text" : "password"}
                name="newPassword"
                value={formData.newPassword}
                onChange={handlePasswordInputChange}
                onFocus={() => setShowPasswordRequirements(true)}
                onBlur={() =>
                  formData.newPassword === "" &&
                  setShowPasswordRequirements(false)
                }
                placeholder="Enter new password"
                autoComplete="new-password"
                disabled={!currentPasswordValid}
                className={`pr-10 ${validationErrors.newPassword ? "border-red-400/50" : ""} ${!currentPasswordValid ? "opacity-50 cursor-not-allowed" : ""}`}
              />
              <button
                type="button"
                onClick={() => togglePasswordVisibility("newPassword")}
                disabled={!currentPasswordValid}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {showPassword.newPassword ? (
                  <EyeOff className="w-5 h-5" />
                ) : (
                  <Eye className="w-5 h-5" />
                )}
              </button>
            </div>
            {validationErrors.newPassword && (
              <p className="text-red-400 text-xs mt-1">
                {validationErrors.newPassword}
              </p>
            )}
            <PasswordRequirements
              password={formData.newPassword}
              showRequirements={showPasswordRequirements}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Confirm Password
            </label>
            <div className="relative">
              <GlassInput
                type={showPassword.confirmPassword ? "text" : "password"}
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handlePasswordInputChange}
                placeholder="Confirm new password"
                autoComplete="new-password"
                disabled={!currentPasswordValid}
                className={`pr-10 ${validationErrors.confirmPassword ? "border-red-400/50" : ""} ${!currentPasswordValid ? "opacity-50 cursor-not-allowed" : ""}`}
              />
              <button
                type="button"
                onClick={() => togglePasswordVisibility("confirmPassword")}
                disabled={!currentPasswordValid}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {showPassword.confirmPassword ? (
                  <EyeOff className="w-5 h-5" />
                ) : (
                  <Eye className="w-5 h-5" />
                )}
              </button>
            </div>
            {validationErrors.confirmPassword && (
              <p className="text-red-400 text-xs mt-1">
                {validationErrors.confirmPassword}
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <ModalFooter>
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={isSaving}
            className="w-full sm:w-auto px-6 py-2.5 rounded-lg bg-white text-[#1a1a1a] border-0 hover:bg-gray-100"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={isSaveDisabled()}
            className="w-full sm:w-auto px-6 py-2.5 rounded-lg bg-[#4A5568] text-white hover:bg-[#3d4654] disabled:opacity-50 disabled:cursor-not-allowed"
            title={
              isSaveDisabled() && isEnteringNewPassword
                ? "Please verify your current password first"
                : ""
            }
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </ModalFooter>
      </form>

      <Modal
        isOpen={showSuccessModal}
        onClose={onCloseSuccessModal}
        title={
          <span className="font-black font-inter flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-400" />
            Profile Saved
          </span>
        }
        size="sm"
        showCloseButton
      >
        <div className="rounded-lg border border-green-400/25 bg-green-500/10 px-4 py-3 mb-4">
          <p className="text-sm font-medium text-green-300">
            Your profile changes were saved successfully.
          </p>
        </div>
        <ModalFooter>
          <Button
            type="button"
            variant="primary"
            onClick={onCloseSuccessModal}
            className="px-6 py-2.5"
          >
            OK
          </Button>
        </ModalFooter>
      </Modal>

      <Modal
        isOpen={showValidationModal}
        onClose={() => setShowValidationModal(false)}
        title={<span className="font-black font-inter">Validation Error</span>}
        size="sm"
        showCloseButton
      >
        <div className="rounded-lg border border-red-400/25 bg-red-500/10 px-4 py-3 mb-4">
          <p className="text-sm font-medium text-red-300">
            Please answer all the required fields
          </p>
        </div>
        {Object.keys(validationErrors).length > 0 && (
          <div className="mb-4 space-y-2">
            {Object.entries(validationErrors).map(([field, error]) => (
              <p key={field} className="text-xs text-red-400">
                • {error}
              </p>
            ))}
          </div>
        )}
        <ModalFooter>
          <Button
            type="button"
            variant="primary"
            onClick={() => setShowValidationModal(false)}
            className="px-6 py-2.5"
          >
            OK
          </Button>
        </ModalFooter>
      </Modal>
    </Modal>
  );
};

export default EditProfileModal;
