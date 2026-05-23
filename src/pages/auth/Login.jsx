import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { CheckCircle2, Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import logo from "../../assets/css_logo.png";
import GradientText from "../../components/ui/GradientText";
import AnimatedContent from "../../components/ui/AnimatedContent";
import GlassInput from "../../components/ui/GlassInput";
import PasswordRequirements from "../../components/ui/PasswordRequirements";
import Modal, { ModalFooter } from "../../components/ui/Modal";
import Button from "../../components/ui/Button";
import { isPasswordValid, getPasswordErrorMessage } from "../../lib/passwordValidator";

const SUPER_ADMIN_TRUSTED_DEVICE_KEY = "svms_super_admin_trusted_device";
const GOOGLE_AUTH_RESULT_STORAGE_KEY = "svms_google_auth_result";
const GOOGLE_AUTH_RESULT_FALLBACK_STORAGE_KEY = "svms_google_auth_result_fallback";

const preloadStudentRouteModules = () =>
  Promise.allSettled([
    import("../../components/layout/StudentLayout"),
    import("../student/StudentDashboard"),
  ]);

const preloadAdminRouteModules = () =>
  Promise.allSettled([
    import("../../components/layout/AdminLayout"),
    import("../admin/Dashboard"),
  ]);

const preloadSuperAdminRouteModules = () =>
  Promise.allSettled([
    import("../../components/layout/AdminLayout"),
    import("../superAdmin/SuperAdminDashboard"),
  ]);

function preloadRoutesForRole(role) {
  if (role === "student") {
    void preloadStudentRouteModules();
    return;
  }

  if (role === "super_admin") {
    void preloadSuperAdminRouteModules();
    return;
  }

  if (role === "admin") {
    void preloadAdminRouteModules();
    return;
  }

  void Promise.allSettled([
    preloadAdminRouteModules(),
    preloadSuperAdminRouteModules(),
    preloadStudentRouteModules(),
  ]);
}

function decodeGoogleAuthPayload(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return null;
  }

  try {
    const base64 = normalized.replace(/-/g, "+").replace(/_/g, "/");
    const padded = `${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`;
    return JSON.parse(window.atob(padded));
  } catch {
    return null;
  }
}

const VerificationCodeInput = ({
  value,
  onChange,
  length = 6,
  disabled = false,
  label = "VERIFICATION CODE",
}) => {
  const inputRefs = useRef([]);

  const digits = Array.from({ length }, (_, index) => value[index] || "");

  const focusInput = (index) => {
    const nextInput = inputRefs.current[index];
    if (nextInput) {
      nextInput.focus();
      nextInput.select();
    }
  };

  const handleDigitChange = (index, nextValue) => {
    const numericValue = String(nextValue || "").replace(/\D/g, "");

    if (!numericValue) {
      const updated = digits.slice();
      updated[index] = "";
      onChange(updated.join(""));
      return;
    }

    const updated = digits.slice();
    const incomingDigits = numericValue.slice(0, length - index).split("");

    incomingDigits.forEach((digit, digitOffset) => {
      updated[index + digitOffset] = digit;
    });

    onChange(updated.join(""));
    focusInput(Math.min(index + incomingDigits.length, length - 1));
  };

  const handleKeyDown = (event, index) => {
    if (event.key === "Backspace") {
      if (digits[index]) {
        const updated = digits.slice();
        updated[index] = "";
        onChange(updated.join(""));
      } else if (index > 0) {
        const updated = digits.slice();
        updated[index - 1] = "";
        onChange(updated.join(""));
        focusInput(index - 1);
      }
      event.preventDefault();
      return;
    }

    if (event.key === "ArrowLeft" && index > 0) {
      focusInput(index - 1);
      event.preventDefault();
      return;
    }

    if (event.key === "ArrowRight" && index < length - 1) {
      focusInput(index + 1);
      event.preventDefault();
    }
  };

  const handlePaste = (event) => {
    const pastedDigits = event.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, length);

    if (!pastedDigits) {
      return;
    }

    onChange(pastedDigits);
    focusInput(Math.min(pastedDigits.length, length - 1));
    event.preventDefault();
  };

  return (
    <div>
      <label className="mb-3 block text-sm font-medium text-gray-300">
        {label}
      </label>
      <div className="flex w-full items-center gap-2 sm:gap-3">
        {digits.map((digit, index) => (
          <input
            key={`${label}-${index}`}
            ref={(element) => {
              inputRefs.current[index] = element;
            }}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={1}
            value={digit}
            disabled={disabled}
            onChange={(event) => handleDigitChange(index, event.target.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            onPaste={handlePaste}
            onFocus={(event) => event.target.select()}
            className="verification-code-slot h-14 min-w-0 flex-1 rounded-xl border border-white/12 bg-white/[0.04] px-0 text-center text-lg font-bold tracking-[0.12em] text-white outline-none transition-all focus:border-cyan-300/70 focus:bg-white/[0.08] focus:shadow-[0_0_0_3px_rgba(103,232,249,0.12)] disabled:cursor-not-allowed disabled:opacity-60 sm:h-[68px] sm:text-xl sm:tracking-[0.22em]"
            aria-label={`${label} digit ${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
};

const Login = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [forgotPasswordStep, setForgotPasswordStep] = useState(1);
  const [forgotPasswordError, setForgotPasswordError] = useState("");
  const [forgotPasswordSuccess, setForgotPasswordSuccess] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [resetToken, setResetToken] = useState("");
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [showPasswordRequirements, setShowPasswordRequirements] = useState(false);
  const [passwordValidationError, setPasswordValidationError] = useState("");
  const [isSuperAdminVerification, setIsSuperAdminVerification] = useState(false);
  const [superAdminChallengeId, setSuperAdminChallengeId] = useState("");
  const [superAdminCode, setSuperAdminCode] = useState("");
  const [superAdminMessage, setSuperAdminMessage] = useState("");
  const [superAdminResendTimer, setSuperAdminResendTimer] = useState(0);
  const [isResendingSuperAdminCode, setIsResendingSuperAdminCode] = useState(false);
  const [verifiedSuperAdminUser, setVerifiedSuperAdminUser] = useState(null);
  const [showSuperAdminSuccessModal, setShowSuperAdminSuccessModal] = useState(false);
  const [trustThisDevice, setTrustThisDevice] = useState(false);
  const [isFinalizingSuperAdminLogin, setIsFinalizingSuperAdminLogin] = useState(false);
  const [isStartingGoogleLogin, setIsStartingGoogleLogin] = useState(false);
  const [pendingAccountSetupUser, setPendingAccountSetupUser] = useState(null);
  const [setupUsername, setSetupUsername] = useState("");
  const [setupPassword, setSetupPassword] = useState("");
  const [setupConfirmPassword, setSetupConfirmPassword] = useState("");
  const [showSetupPassword, setShowSetupPassword] = useState(false);
  const [showSetupConfirmPassword, setShowSetupConfirmPassword] = useState(false);
  const [showSetupPasswordRequirements, setShowSetupPasswordRequirements] = useState(false);
  const [setupError, setSetupError] = useState("");
  const [setupPasswordValidationError, setSetupPasswordValidationError] = useState("");
  const [isSubmittingAccountSetup, setIsSubmittingAccountSetup] = useState(false);
  const [pendingRoleChoiceUser, setPendingRoleChoiceUser] = useState(null);
  const processedGoogleExchangeRef = useRef("");
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const isGoogleExchangeView = searchParams.get("googleAuth") === "exchange";

  const handleAuthenticatedLoginSuccess = (user) => {
    preloadRoutesForRole(user?.role);

    if (user?.role === "both") {
      setPendingRoleChoiceUser(user);
      setIsLoading(false);
      return;
    }

    if (user?.requiresAccountSetup) {
      setPendingAccountSetupUser(user);
      setSetupUsername(user?.username || "");
      setSetupPassword("");
      setSetupConfirmPassword("");
      setSetupError("");
      setSetupPasswordValidationError("");
      setShowSetupPassword(false);
      setShowSetupConfirmPassword(false);
      setShowSetupPasswordRequirements(false);
      setIsLoading(false);
      return;
    }

    localStorage.setItem("svms_user", JSON.stringify(user));
    routeAuthenticatedUser(user);
  };

  const routeAuthenticatedUser = (user) => {
    const userRole = user?.role;

    if (userRole === "admin") {
      navigate("/admin");
      return;
    }

    if (userRole === "super_admin") {
      navigate("/super-admin");
      return;
    }

    if (userRole === "student") {
      navigate("/student/dashboard");
      return;
    }

    setIsLoading(false);
    setError("Account role is not recognized.");
  };

  const handleCloseRoleChoiceModal = () => {
    setPendingRoleChoiceUser(null);
  };

  const handleCloseAccountSetupModal = () => {
    setPendingAccountSetupUser(null);
    setSetupUsername("");
    setSetupPassword("");
    setSetupConfirmPassword("");
    setSetupError("");
    setSetupPasswordValidationError("");
    setShowSetupPassword(false);
    setShowSetupConfirmPassword(false);
    setShowSetupPasswordRequirements(false);
    setIsSubmittingAccountSetup(false);
  };

  const handleChooseLoginRole = async (selectedRole) => {
    if (!pendingRoleChoiceUser) {
      return;
    }

    if (selectedRole === "super_admin") {
      setIsLoading(true);
      setError("");
      setSuperAdminMessage("");

      try {
        const trustedDeviceToken = localStorage.getItem(
          SUPER_ADMIN_TRUSTED_DEVICE_KEY,
        ) || "";
        const response = await fetch("/api/auth/super-admin/access", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userId: pendingRoleChoiceUser.id,
            sessionToken: pendingRoleChoiceUser.sessionToken,
            trustedDeviceToken,
          }),
        });

        const result = await response.json().catch(() => ({}));

        if (response.status === 202 && result?.requiresVerification) {
          setPendingRoleChoiceUser(null);
          setIsForgotPassword(false);
          setIsSuperAdminVerification(true);
          setSuperAdminChallengeId(result?.challengeId || "");
          setSuperAdminResendTimer(Number(result?.retryAfterSeconds) || 60);
          setSuperAdminCode("");
          setSuperAdminMessage(
            result?.message ||
              "A 6-digit verification code was sent to your email. Enter it to finish signing in.",
          );
          setIsLoading(false);
          return;
        }

        if (!response.ok) {
          throw new Error(result?.message || "Unable to continue as super admin.");
        }

        setPendingRoleChoiceUser(null);
        handleAuthenticatedLoginSuccess(result.user);
        return;
      } catch (roleChoiceError) {
        setError(roleChoiceError.message || "Unable to continue as super admin.");
        setIsLoading(false);
        return;
      }
    }

    const nextUser = {
      ...pendingRoleChoiceUser,
      role: selectedRole,
      accountRole: pendingRoleChoiceUser.accountRole || pendingRoleChoiceUser.role || "both",
    };

    setPendingRoleChoiceUser(null);
    localStorage.setItem("svms_user", JSON.stringify(nextUser));
    routeAuthenticatedUser(nextUser);
  };

  useEffect(() => {
    if (resendTimer > 0 || superAdminResendTimer > 0) {
      const timerId = setInterval(() => {
        if (resendTimer > 0) {
          setResendTimer((prev) => (prev <= 1 ? 0 : prev - 1));
        }
        if (superAdminResendTimer > 0) {
          setSuperAdminResendTimer((prev) => (prev <= 1 ? 0 : prev - 1));
        }
      }, 1000);

      return () => clearInterval(timerId);
    }

    return undefined;
  }, [resendTimer, superAdminResendTimer]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const googleAuthStatus = params.get("googleAuth");
    if (!googleAuthStatus) {
      return;
    }

    const cleanLoginUrl = `${location.pathname}${window.location.hash || ""}`;
    window.history.replaceState(null, "", cleanLoginUrl);

    const nextMessage = params.get("message") || "";
    if (googleAuthStatus === "resolved") {
      let storedGoogleResult = decodeGoogleAuthPayload(params.get("payload"));

      if (!storedGoogleResult) {
        try {
          const rawValue =
            sessionStorage.getItem(GOOGLE_AUTH_RESULT_STORAGE_KEY) ||
            localStorage.getItem(GOOGLE_AUTH_RESULT_FALLBACK_STORAGE_KEY);
          storedGoogleResult = rawValue ? JSON.parse(rawValue) : null;
          sessionStorage.removeItem(GOOGLE_AUTH_RESULT_STORAGE_KEY);
          localStorage.removeItem(GOOGLE_AUTH_RESULT_FALLBACK_STORAGE_KEY);
        } catch {
          storedGoogleResult = null;
        }
      }

      if (storedGoogleResult?.user) {
        setError("");
        setSuperAdminMessage("");
        setIsStartingGoogleLogin(false);
        setIsLoading(false);
        handleAuthenticatedLoginSuccess(storedGoogleResult.user);
        return;
      }

      setError("Unable to continue with Google login.");
      setIsStartingGoogleLogin(false);
      setIsLoading(false);
      navigate(location.pathname, { replace: true });
      return;
    }

    if (googleAuthStatus === "exchange") {
      const exchangeCode = params.get("code") || "";
      const exchangeState = params.get("state") || "";
      const exchangeKey = `${exchangeCode}:${exchangeState}`;

      if (
        !exchangeCode ||
        !exchangeState ||
        processedGoogleExchangeRef.current === exchangeKey
      ) {
        return;
      }

      processedGoogleExchangeRef.current = exchangeKey;

      const completeGoogleLogin = async () => {
        let completedNavigation = false;
        setError("");
        setSuperAdminMessage("");
        setIsLoading(true);
        setIsStartingGoogleLogin(true);

        try {
          const response = await fetch("/api/auth/google/exchange", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              code: exchangeCode,
              state: exchangeState,
            }),
          });

          const result = await response.json().catch(() => ({}));

          if (response.status === 202 && result?.requiresVerification) {
            setIsForgotPassword(false);
            setIsSuperAdminVerification(true);
            setSuperAdminChallengeId(result?.challengeId || "");
            setSuperAdminResendTimer(Number(result?.retryAfterSeconds) || 60);
            setSuperAdminCode("");
            setSuperAdminMessage(
              result?.message ||
                "A 6-digit verification code was sent to your email. Enter it to finish signing in.",
            );
            setError("");
            return;
          }

          if (!response.ok) {
            if (response.status === 404) {
                throw new Error(
                  result?.message ||
                  "No SVMS account is linked to this PLP Google account. Please contact an administrator for assistance.",
                );
            }
            throw new Error(result?.message || "Unable to continue with Google login.");
          }

          handleAuthenticatedLoginSuccess(result.user);
          completedNavigation = true;
        } catch (exchangeError) {
          setIsForgotPassword(false);
          setIsSuperAdminVerification(false);
          setSuperAdminChallengeId("");
          setSuperAdminCode("");
          setSuperAdminMessage("");
          setError(exchangeError.message || "Unable to continue with Google login.");
        } finally {
          setIsLoading(false);
          setIsStartingGoogleLogin(false);
          if (!completedNavigation) {
            navigate(location.pathname, { replace: true });
          }
        }
      };

      completeGoogleLogin();
      return;
    } else if (googleAuthStatus === "pending_verification") {
      setIsForgotPassword(false);
      setIsSuperAdminVerification(true);
      setSuperAdminChallengeId(params.get("challengeId") || "");
      setSuperAdminResendTimer(Number(params.get("retryAfterSeconds")) || 60);
      setSuperAdminCode("");
      setSuperAdminMessage(
        nextMessage ||
          "A 6-digit verification code was sent to your email. Enter it to finish signing in.",
      );
      setError("");
    } else if (googleAuthStatus === "error") {
      setIsForgotPassword(false);
      setIsSuperAdminVerification(false);
      setSuperAdminChallengeId("");
      setSuperAdminCode("");
      setSuperAdminMessage("");
      setError(nextMessage || "Unable to continue with Google login.");
    }

    setIsStartingGoogleLogin(false);
    setIsLoading(false);
    navigate(location.pathname, { replace: true });
  }, [location.pathname, location.search, navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setSuperAdminMessage("");
    setIsLoading(true);
    preloadRoutesForRole("both");

    try {
      const trustedDeviceToken = localStorage.getItem(
        SUPER_ADMIN_TRUSTED_DEVICE_KEY,
      ) || "";
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password, trustedDeviceToken }),
      });

      let result = {};
      try {
        result = await response.json();
      } catch {
        result = {};
      }

      if (response.status === 202 && result?.requiresVerification) {
        setIsSuperAdminVerification(true);
        setSuperAdminChallengeId(result?.challengeId || "");
        setSuperAdminResendTimer(Number(result?.retryAfterSeconds) || 60);
        setSuperAdminCode("");
        setSuperAdminMessage(
          result?.message ||
            "A verification code was sent to your email. Enter it to continue.",
        );
        setIsLoading(false);
        return;
      }

      if (!response.ok) {
        setError(result?.message || `Login failed (${response.status})`);
        setIsLoading(false);
        return;
      }

      handleAuthenticatedLoginSuccess(result.user);
    } catch (_error) {
      setError("Unable to connect to the login server.");
      setIsLoading(false);
    }
  };

  const handleForgotPasswordReset = () => {
    setIsForgotPassword(false);
    setIsSuperAdminVerification(false);
    setForgotPasswordStep(1);
    setForgotPasswordError("");
    setForgotPasswordSuccess("");
    setForgotEmail("");
    setVerificationCode("");
    setNewPassword("");
    setConfirmPassword("");
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    setResendTimer(0);
    setResetToken("");
    setIsSendingCode(false);
    setIsVerifyingCode(false);
    setIsResettingPassword(false);
    setShowPasswordRequirements(false);
    setPasswordValidationError("");
    setSuperAdminChallengeId("");
    setSuperAdminCode("");
    setSuperAdminMessage("");
    setSuperAdminResendTimer(0);
    setIsResendingSuperAdminCode(false);
    setVerifiedSuperAdminUser(null);
    setShowSuperAdminSuccessModal(false);
    setTrustThisDevice(false);
    setIsFinalizingSuperAdminLogin(false);
    setIsStartingGoogleLogin(false);
    setIsLoading(false);
  };

  const requestForgotPasswordCode = async () => {
    const response = await fetch("/api/auth/forgot-password/request", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: forgotEmail.trim() }),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        result?.message || `Unable to send verification code (${response.status})`,
      );
    }

    return result;
  };

  const handleSuperAdminVerifyCode = async (e) => {
    e.preventDefault();
    setError("");
    setSuperAdminMessage("");

    if (!superAdminCode.trim()) {
      setError("Please enter the verification code");
      return;
    }

    setIsVerifyingCode(true);
    try {
      const response = await fetch("/api/auth/super-admin/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          challengeId: superAdminChallengeId,
          code: superAdminCode.trim(),
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.message || "Invalid verification code");
      }

      setVerifiedSuperAdminUser(result?.user || null);
      setShowSuperAdminSuccessModal(true);
      setTrustThisDevice(false);
      setSuperAdminMessage("Verification successful.");
    } catch (verifyError) {
      setError(verifyError.message || "Unable to verify code.");
    } finally {
      setIsVerifyingCode(false);
    }
  };

  const handleResendSuperAdminCode = async () => {
    if (
      superAdminResendTimer > 0 ||
      isResendingSuperAdminCode ||
      !superAdminChallengeId
    ) {
      return;
    }

    setError("");
    setSuperAdminMessage("");
    setIsResendingSuperAdminCode(true);

    try {
      const response = await fetch("/api/auth/super-admin/resend-code", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          challengeId: superAdminChallengeId,
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          result?.message || "Unable to resend verification code.",
        );
      }

      setSuperAdminMessage("A new verification code has been sent.");
      setSuperAdminResendTimer(Number(result?.retryAfterSeconds) || 60);
    } catch (requestError) {
      setError(
        requestError.message || "Unable to resend verification code.",
      );
    } finally {
      setIsResendingSuperAdminCode(false);
    }
  };

  const finalizeSuperAdminLogin = async () => {
    if (!verifiedSuperAdminUser) {
      return;
    }

    setIsFinalizingSuperAdminLogin(true);
    setError("");

    try {
      let nextTrustedDeviceToken = "";

      if (trustThisDevice) {
        const trustResponse = await fetch("/api/auth/super-admin/trust-device", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userId: verifiedSuperAdminUser.id,
            sessionToken: verifiedSuperAdminUser.sessionToken,
          }),
        });

        const trustResult = await trustResponse.json().catch(() => ({}));
        if (!trustResponse.ok) {
          throw new Error(
            trustResult?.message || "Unable to trust this device.",
          );
        }

        nextTrustedDeviceToken = trustResult?.trustedDeviceToken || "";
      }

      if (nextTrustedDeviceToken) {
        localStorage.setItem(
          SUPER_ADMIN_TRUSTED_DEVICE_KEY,
          nextTrustedDeviceToken,
        );
      } else if (!trustThisDevice) {
        localStorage.removeItem(SUPER_ADMIN_TRUSTED_DEVICE_KEY);
      }

      handleAuthenticatedLoginSuccess(verifiedSuperAdminUser);
      setShowSuperAdminSuccessModal(false);
    } catch (finalizeError) {
      setError(finalizeError.message || "Unable to complete login.");
      setShowSuperAdminSuccessModal(false);
    } finally {
      setIsFinalizingSuperAdminLogin(false);
    }
  };

  const handleSendEmail = async (e) => {
    e.preventDefault();
    setForgotPasswordError("");
    setForgotPasswordSuccess("");

    if (!forgotEmail.trim()) {
      setForgotPasswordError("Please enter your email");
      return;
    }
    if (!forgotEmail.includes("@")) {
      setForgotPasswordError("Please enter a valid email");
      return;
    }

    setIsSendingCode(true);
    try {
      const result = await requestForgotPasswordCode();
      setResetToken("");
      setVerificationCode("");
      setForgotPasswordSuccess("Email sent! Check your inbox for the verification code.");
      setResendTimer(Number(result?.retryAfterSeconds) || 60);
      setForgotPasswordStep(2);
    } catch (requestError) {
      setForgotPasswordError(requestError.message || "Unable to send verification code.");
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleResendCode = async () => {
    if (resendTimer > 0 || isSendingCode) {
      return;
    }

    setForgotPasswordError("");
    setForgotPasswordSuccess("");
    setIsSendingCode(true);

    try {
      const result = await requestForgotPasswordCode();
      setForgotPasswordSuccess("A new verification code has been sent.");
      setResendTimer(Number(result?.retryAfterSeconds) || 60);
    } catch (requestError) {
      setForgotPasswordError(requestError.message || "Unable to resend verification code.");
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleVerifyCode = async (e) => {
    e.preventDefault();
    setForgotPasswordError("");
    setForgotPasswordSuccess("");
    if (!verificationCode.trim()) {
      setForgotPasswordError("Please enter the verification code");
      return;
    }

    setIsVerifyingCode(true);
    try {
      const response = await fetch("/api/auth/forgot-password/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: forgotEmail.trim(),
          code: verificationCode.trim(),
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.message || "Invalid verification code");
      }

      setResetToken(result?.resetToken || "");
      setForgotPasswordSuccess("Code verified! Proceed to reset your password.");
      setForgotPasswordStep(3);
    } catch (verifyError) {
      setForgotPasswordError(verifyError.message || "Unable to verify code.");
    } finally {
      setIsVerifyingCode(false);
    }
  };

  const handleNewPassword = async (e) => {
    e.preventDefault();
    setForgotPasswordError("");
    setForgotPasswordSuccess("");
    setPasswordValidationError("");

    if (!newPassword.trim() || !confirmPassword.trim()) {
      setForgotPasswordError("Please fill in all fields");
      return;
    }

    if (!isPasswordValid(newPassword)) {
      setPasswordValidationError(getPasswordErrorMessage(newPassword));
      return;
    }

    if (newPassword !== confirmPassword) {
      setForgotPasswordError("Passwords do not match");
      return;
    }

    if (!resetToken) {
      setForgotPasswordError("Please verify your code first.");
      return;
    }

    setIsResettingPassword(true);
    try {
      const response = await fetch("/api/auth/forgot-password/reset", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: forgotEmail.trim(),
          newPassword,
          confirmPassword,
          resetToken,
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.message || "Unable to reset password.");
      }

      setForgotPasswordSuccess("Password reset successfully!");
      setForgotPasswordStep(4);
    } catch (resetError) {
      setForgotPasswordError(resetError.message || "Unable to reset password.");
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleBackToLogin = () => {
    handleForgotPasswordReset();
  };

  const handleAccountSetup = async (event) => {
    event.preventDefault();
    setSetupError("");
    setSetupPasswordValidationError("");

    if (!pendingAccountSetupUser?.id || !pendingAccountSetupUser?.sessionToken) {
      setSetupError("Your account setup session expired. Please sign in again.");
      return;
    }

    if (!setupUsername.trim()) {
      setSetupError("Please enter a username.");
      return;
    }

    if (!setupPassword.trim() || !setupConfirmPassword.trim()) {
      setSetupError("Please fill in all fields.");
      return;
    }

    if (!isPasswordValid(setupPassword)) {
      setSetupPasswordValidationError(getPasswordErrorMessage(setupPassword));
      return;
    }

    if (setupPassword !== setupConfirmPassword) {
      setSetupError("Passwords do not match.");
      return;
    }

    setIsSubmittingAccountSetup(true);

    try {
      const response = await fetch("/api/auth/account-setup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: pendingAccountSetupUser.id,
          sessionToken: pendingAccountSetupUser.sessionToken,
          username: setupUsername.trim(),
          newPassword: setupPassword,
          confirmPassword: setupConfirmPassword,
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.message || "Unable to complete account setup.");
      }

      setPendingAccountSetupUser(null);
      setSetupUsername("");
      setSetupPassword("");
      setSetupConfirmPassword("");
      setSetupError("");
      setSetupPasswordValidationError("");
      localStorage.setItem("svms_user", JSON.stringify(result.user));
      routeAuthenticatedUser(result.user);
    } catch (setupRequestError) {
      setSetupError(
        setupRequestError.message || "Unable to complete account setup.",
      );
    } finally {
      setIsSubmittingAccountSetup(false);
    }
  };

  const handleGoogleLogin = () => {
    setError("");
    setSuperAdminMessage("");
    setIsStartingGoogleLogin(true);
    preloadRoutesForRole("student");
    localStorage.removeItem("svms_user");

    const returnTo = `${window.location.origin}/login`;
    window.location.assign(
      `/api/auth/google/start?returnTo=${encodeURIComponent(returnTo)}`,
    );
  };

  const legalLinksBlock = (
    <>
      <div className="max-w-md text-gray-500 text-xs sm:text-sm leading-relaxed">
        Track, manage, and resolve student violations efficiently. Maintain
        accurate records and promote a safe learning environment.
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-white/8 pt-4 text-xs text-gray-400">
        <Link to="/privacy" className="transition-colors hover:text-white">
          Privacy Policy
        </Link>
        <Link to="/terms" className="transition-colors hover:text-white">
          Terms of Service
        </Link>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-[#1a1a1a] flex items-center justify-center p-3 sm:p-4 lg:p-6 font-inter">
      <div className="w-full max-w-[1100px] bg-[#0d0d0d] rounded-[28px] lg:rounded-3xl overflow-hidden flex flex-col lg:min-h-[650px] lg:flex-row shadow-2xl border border-white/[0.30]">
        {/* Left Panel */}
        <div className="w-full lg:w-[45%] bg-gradient-to-b from-[#1a1a1a] to-[#0d0d0d] px-6 py-6 sm:px-8 sm:py-8 lg:p-12 flex flex-col justify-start lg:justify-between relative gap-4 sm:gap-6 lg:gap-0">
          {/* Logo */}
          <AnimatedContent
            distance={30}
            direction="vertical"
            duration={0.6}
            delay={0}
          >
            <div>
              <img src={logo} alt="Logo" className="h-12 w-auto sm:h-14" />
            </div>
          </AnimatedContent>
          {/* Welcome Text */}
          <div className="flex flex-col lg:flex-1 lg:justify-center lg:-mt-12">
            <AnimatedContent
              distance={30}
              direction="vertical"
              duration={0.6}
              delay={0.1}
            >
              <p className="text-gray-400 font-semibold mb-1">Welcome to</p>
            </AnimatedContent>
            <AnimatedContent
              distance={30}
              direction="vertical"
              duration={0.6}
              delay={0.2}
            >
              <GradientText
                colors={["#ffffff", "#c9ccd1", "#828587", "#ffffff"]}
                animationSpeed={5}
                showBorder={false}
                className="text-login-title !mx-0"
              >
                Student Violation
                <br />
                System
              </GradientText>
            </AnimatedContent>
          </div>
          {/* Description */}
          <AnimatedContent
            distance={30}
            direction="vertical"
            duration={0.6}
            delay={0.3}
          >
            <div className="hidden lg:block">{legalLinksBlock.props.children[0]}</div>
          </AnimatedContent>
          <AnimatedContent
            distance={20}
            direction="vertical"
            duration={0.6}
            delay={0.4}
          >
            <div className="hidden lg:block lg:mt-8 lg:border-t-0 lg:pt-0">
              {legalLinksBlock.props.children[1]}
            </div>
          </AnimatedContent>
        </div>

        {/* Right Panel */}
        <div className="w-full lg:w-[55%] bg-[#0F1113]/30 px-6 pt-2 pb-8 sm:px-8 sm:pt-6 sm:pb-10 lg:p-12 relative overflow-y-auto">
          {!isForgotPassword ? (
            <div className="lg:mt-6">
              <div className="mb-6 sm:mb-8 lg:mb-10 flex items-center gap-3">
                {isSuperAdminVerification && (
                  <button
                    type="button"
                    onClick={handleBackToLogin}
                    className="text-gray-400 hover:text-white transition-colors"
                  >
                    <svg
                      className="w-6 h-6"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 19l-7-7 7-7"
                      />
                    </svg>
                  </button>
                )}
                <AnimatedContent
                  distance={30}
                  direction="horizontal"
                  reverse
                  duration={0.6}
                  delay={0.2}
                >
                  <h2 className="text-white text-3xl sm:text-4xl font-bold">
                    {isSuperAdminVerification
                      ? "Verify Super Admin"
                      : isGoogleExchangeView
                        ? "Signing In"
                        : "Login"}
                  </h2>
                </AnimatedContent>
              </div>
              {error && (
                <div className="bg-red-500/20 border border-red-500 text-red-400 px-4 py-3 rounded-lg mb-6 text-sm">
                  {error}
                </div>
              )}
              {superAdminMessage && isSuperAdminVerification && (
                <div className="bg-cyan-500/15 border border-cyan-400/30 text-cyan-200 px-4 py-3 rounded-lg mb-6 text-sm">
                  {superAdminMessage}
                </div>
              )}
              <AnimatedContent
                distance={30}
                direction="horizontal"
                reverse
                duration={0.6}
                delay={0.3}
              >
                {!isSuperAdminVerification ? (
                  isGoogleExchangeView ? (
                    <div className="space-y-6">
                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-6 text-center text-gray-300">
                        <div className="mx-auto mb-4 h-8 w-8 rounded-full border-2 border-white/60 border-t-transparent animate-spin" />
                        <p className="text-sm">Completing your Google sign-in...</p>
                      </div>
                    </div>
                  ) : (
                  <form onSubmit={handleLogin} className="space-y-6 sm:space-y-8">
                    <GlassInput
                      label="USERNAME OR EMAIL"
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                    />
                    <div>
                      <GlassInput
                        label="PASSWORD"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        endIcon={
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            aria-label={showPassword ? "Hide password" : "Show password"}
                            className="flex items-center justify-center text-gray-400 hover:text-white transition-colors"
                          >
                            {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                          </button>
                        }
                      />
                      <div className="flex justify-end mt-3">
                        <button
                          type="button"
                          onClick={() => setIsForgotPassword(true)}
                          className="text-sm text-gray-400 hover:text-white transition-colors duration-200 
               relative after:absolute after:bottom-0 after:left-0 after:right-0 
               after:h-px after:bg-white after:scale-x-0 hover:after:scale-x-100 
               after:transition-transform after:duration-300"
                        >
                          Forgot Password?
                        </button>
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full bg-[#c4c4c4] hover:bg-[#e4e4e4] text-[#1a1a1a] text-sm sm:text-base font-bold py-4 rounded-lg tracking-[0.2em] sm:tracking-widest mt-6 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-white/10 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                    >
                      {isLoading && (
                        <div className="w-5 h-5 border-3 border-[#1a1a1a] border-t-transparent rounded-full animate-spin" />
                      )}
                      {isLoading ? "LOGGING IN..." : "LOGIN"}
                    </button>
                    <div className="flex items-center gap-3">
                      <div className="h-px flex-1 bg-white/10" />
                      <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-gray-500">
                        or
                      </span>
                      <div className="h-px flex-1 bg-white/10" />
                    </div>
                    <button
                      type="button"
                      onClick={handleGoogleLogin}
                      disabled={isLoading || isStartingGoogleLogin}
                      className="w-full rounded-lg border border-white/15 bg-white/[0.04] px-4 py-4 text-left text-sm sm:text-base font-semibold text-white transition-all duration-300 hover:border-white/30 hover:bg-white/[0.08] hover:shadow-lg hover:shadow-white/5 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        <span className="flex items-center justify-center gap-3">
                        {isStartingGoogleLogin ? (
                          <div className="w-5 h-5 border-2 border-white/70 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <svg
                            aria-hidden="true"
                            viewBox="0 0 24 24"
                            className="h-5 w-5"
                          >
                            <path
                              fill="#EA4335"
                              d="M12 10.2v3.9h5.4c-.2 1.3-1.6 3.9-5.4 3.9-3.2 0-5.9-2.7-5.9-6s2.7-6 5.9-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.5 14.6 2.7 12 2.7 6.9 2.7 2.8 6.8 2.8 12s4.1 9.3 9.2 9.3c5.3 0 8.9-3.7 8.9-8.9 0-.6-.1-1.1-.1-1.5H12Z"
                            />
                            <path
                              fill="#34A853"
                              d="M2.8 7.1 6 9.5c.9-1.8 2.7-3 5-3 1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.5 14.6 2.7 12 2.7c-3.5 0-6.6 2-8.1 4.4Z"
                            />
                            <path
                              fill="#FBBC05"
                              d="M12 21.3c2.5 0 4.7-.8 6.3-2.3l-3-2.4c-.8.6-1.9 1.1-3.3 1.1-3.7 0-5.1-2.5-5.4-3.7L3.4 16c1.5 3 4.6 5.3 8.6 5.3Z"
                            />
                            <path
                              fill="#4285F4"
                              d="M20.9 12.4c0-.6-.1-1.1-.1-1.5H12v3.9h5.4c-.3 1.1-1.1 2.1-2.1 2.8l3 2.4c1.8-1.7 2.6-4.1 2.6-7.6Z"
                            />
                          </svg>
                        )}
                        <span>
                          {isStartingGoogleLogin
                            ? "Redirecting to Google..."
                            : "Continue with Google (PLP Account)"}
                        </span>
                      </span>
                    </button>
                    <div className="space-y-4 pt-4 lg:hidden">
                      {legalLinksBlock}
                    </div>
                  </form>
                  )
                ) : (
                  <div>
                    {!superAdminMessage && (
                      <p className="text-gray-400 text-sm mb-6">
                        Enter the verification code to continue your super admin login.
                      </p>
                    )}
                    <form onSubmit={handleSuperAdminVerifyCode} className="space-y-6 sm:space-y-8">
                      <VerificationCodeInput
                        label="VERIFICATION CODE"
                        value={superAdminCode}
                        onChange={(nextValue) =>
                          setSuperAdminCode(nextValue.replace(/\D/g, "").slice(0, 6))
                        }
                        disabled={isVerifyingCode}
                      />
                      <div className="flex justify-end pr-1">
                        <button
                          type="button"
                          onClick={handleResendSuperAdminCode}
                          disabled={superAdminResendTimer > 0 || isResendingSuperAdminCode}
                          className="text-sm sm:text-base font-medium text-gray-300 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {superAdminResendTimer > 0
                            ? `Resend code in ${superAdminResendTimer}s`
                            : isResendingSuperAdminCode
                              ? "Sending..."
                              : "Resend code"}
                        </button>
                      </div>
                      <button
                        type="submit"
                        disabled={isVerifyingCode}
                        className="w-full bg-[#c4c4c4] hover:bg-[#e4e4e4] text-[#1a1a1a] text-sm sm:text-base font-bold py-4 rounded-lg tracking-[0.2em] sm:tracking-widest transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-white/10 active:scale-[0.98] disabled:opacity-60"
                      >
                        {isVerifyingCode ? "VERIFYING..." : "VERIFY CODE"}
                      </button>
                    </form>
                  </div>
                )}
              </AnimatedContent>
            </div>
          ) : (
            // Forgot Password Flow
            <div className="lg:mt-6">
              <div className="flex items-center gap-3 mb-6 sm:mb-8 lg:mb-10">
                <button
                  onClick={handleBackToLogin}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 19l-7-7 7-7"
                    />
                  </svg>
                </button>
                <h2 className="text-white text-3xl sm:text-4xl font-bold">
                  Reset Password
                </h2>
              </div>

              {forgotPasswordError && (
                <div className="bg-red-500/20 border border-red-500 text-red-400 px-4 py-3 rounded-lg mb-6 text-sm">
                  {forgotPasswordError}
                </div>
              )}
              {forgotPasswordSuccess && (
                <div className="bg-green-500/20 border border-green-500 text-green-400 px-4 py-3 rounded-lg mb-6 text-sm">
                  {forgotPasswordSuccess}
                </div>
              )}

              {/* Step Indicator */}
              <div className="flex justify-between mb-8 gap-2">
                {[1, 2, 3, 4].map((step) => (
                  <div
                    key={step}
                    className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                      step <= forgotPasswordStep
                        ? "bg-[#c4c4c4]"
                        : "bg-gray-700"
                    }`}
                  />
                ))}
              </div>

              <AnimatedContent
                distance={30}
                direction="horizontal"
                reverse
                duration={0.6}
                delay={0.3}
              >
                {forgotPasswordStep === 1 && (
                  <div>
                    <p className="text-gray-400 text-sm mb-6">
                      Enter your email address to receive a verification code
                    </p>
                    <form onSubmit={handleSendEmail} className="space-y-6 sm:space-y-8">
                      <GlassInput
                        label="EMAIL ADDRESS"
                        type="email"
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                      />
                      <button
                        type="submit"
                        disabled={isSendingCode}
                        className="w-full bg-[#c4c4c4] hover:bg-[#e4e4e4] text-[#1a1a1a] text-sm sm:text-base font-bold py-4 rounded-lg tracking-[0.2em] sm:tracking-widest transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-white/10 active:scale-[0.98]"
                      >
                        {isSendingCode ? "SENDING..." : "SEND EMAIL"}
                      </button>
                    </form>
                  </div>
                )}

                {forgotPasswordStep === 2 && (
                  <div>
                    <p className="text-gray-400 text-sm mb-6">
                      Enter the 6-digit verification code sent to your email
                    </p>
                    <form onSubmit={handleVerifyCode} className="space-y-6 sm:space-y-8">
                      <VerificationCodeInput
                        label="VERIFICATION CODE"
                        value={verificationCode}
                        onChange={(nextValue) =>
                          setVerificationCode(nextValue.replace(/\D/g, "").slice(0, 6))
                        }
                        disabled={isVerifyingCode}
                      />
                      <div className="flex justify-end pr-1">
                        <button
                          type="button"
                          onClick={handleResendCode}
                          disabled={resendTimer > 0 || isSendingCode}
                          className="text-sm sm:text-base font-medium text-gray-300 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {resendTimer > 0
                            ? `Resend code in ${resendTimer}s`
                            : isSendingCode
                              ? "Sending..."
                              : "Resend code"}
                        </button>
                      </div>
                      <button
                        type="submit"
                        disabled={isVerifyingCode}
                        className="w-full bg-[#c4c4c4] hover:bg-[#e4e4e4] text-[#1a1a1a] text-sm sm:text-base font-bold py-4 rounded-lg tracking-[0.2em] sm:tracking-widest transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-white/10 active:scale-[0.98]"
                      >
                        {isVerifyingCode ? "VERIFYING..." : "VERIFY CODE"}
                      </button>
                    </form>
                  </div>
                )}

                {forgotPasswordStep === 3 && (
                  <div>
                    <p className="text-gray-400 text-sm mb-6">
                      Enter your new password
                    </p>
                    {passwordValidationError && (
                      <div className="bg-red-500/20 border border-red-500 text-red-400 px-4 py-3 rounded-lg mb-6 text-sm">
                        {passwordValidationError}
                      </div>
                    )}
                    <form onSubmit={handleNewPassword} className="space-y-6 sm:space-y-8">
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                          NEW PASSWORD <span className="text-red-400">*</span> <span className="text-xs text-gray-500">(Required)</span>
                        </label>
                        <GlassInput
                          type={showNewPassword ? "text" : "password"}
                          value={newPassword}
                          onChange={(e) => {
                            setNewPassword(e.target.value);
                            setPasswordValidationError("");
                          }}
                          onFocus={() => setShowPasswordRequirements(true)}
                          onBlur={() => newPassword === "" && setShowPasswordRequirements(false)}
                          placeholder="Enter new password (must be strong)"
                          endIcon={
                            <button
                              type="button"
                              onClick={() =>
                                setShowNewPassword(!showNewPassword)
                              }
                              className="text-gray-400 hover:text-white transition-colors"
                            >
                              {showNewPassword ? (
                                <svg
                                  className="w-5 h-5"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c-4.478 0-8.268 2.943-9.543 7a10.025 10.025 0 014.132 5.411m0 0L21 21"
                                  />
                                </svg>
                              ) : (
                                <svg
                                  className="w-5 h-5"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                  />
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                                  />
                                </svg>
                              )}
                            </button>
                          }
                        />
                        <PasswordRequirements 
                          password={newPassword} 
                          showRequirements={showPasswordRequirements}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                          CONFIRM PASSWORD <span className="text-red-400">*</span> <span className="text-xs text-gray-500">(Required)</span>
                        </label>
                        <GlassInput
                          type={showConfirmPassword ? "text" : "password"}
                          value={confirmPassword}
                          onChange={(e) => {
                            setConfirmPassword(e.target.value);
                            setPasswordValidationError("");
                          }}
                          placeholder="Confirm your password"
                          endIcon={
                            <button
                              type="button"
                              onClick={() =>
                                setShowConfirmPassword(!showConfirmPassword)
                              }
                              className="text-gray-400 hover:text-white transition-colors"
                            >
                              {showConfirmPassword ? (
                                <svg
                                  className="w-5 h-5"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c-4.478 0-8.268 2.943-9.543 7a10.025 10.025 0 014.132 5.411m0 0L21 21"
                                  />
                                </svg>
                              ) : (
                                <svg
                                  className="w-5 h-5"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                  />
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                                  />
                                </svg>
                              )}
                            </button>
                          }
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={isResettingPassword}
                        className="w-full bg-[#c4c4c4] hover:bg-[#e4e4e4] text-[#1a1a1a] text-sm sm:text-base font-bold py-4 rounded-lg tracking-[0.2em] sm:tracking-widest transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-white/10 active:scale-[0.98]"
                      >
                        {isResettingPassword ? "SAVING..." : "RESET PASSWORD"}
                      </button>
                    </form>
                  </div>
                )}

                {forgotPasswordStep === 4 && (
                  <div className="text-center py-8 sm:py-12">
                    <div className="mb-6">
                      <svg
                        className="w-16 h-16 mx-auto text-green-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    </div>
                    <h3 className="text-white text-2xl font-bold mb-2">
                      Password Reset Successful!
                    </h3>
                    <p className="text-gray-400 text-sm mb-8">
                      Your password has been reset. You can now login with your
                      new password.
                    </p>
                    <button
                      onClick={handleBackToLogin}
                      className="w-full bg-[#c4c4c4] hover:bg-[#e4e4e4] text-[#1a1a1a] text-sm sm:text-base font-bold py-4 rounded-lg tracking-[0.2em] sm:tracking-widest transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-white/10 active:scale-[0.98]"
                    >
                      BACK TO LOGIN
                    </button>
                  </div>
                )}
              </AnimatedContent>
            </div>
          )}
        </div>
      </div>

      <Modal
        isOpen={Boolean(pendingRoleChoiceUser)}
        onClose={handleCloseRoleChoiceModal}
        title={<span className="font-black font-inter">Login as</span>}
        size="md"
        showCloseButton
      >
        <div className="rounded-lg border border-white/10 bg-white/[0.04] px-4 py-4 mb-5">
          <p className="text-sm text-gray-200">
            This account has access to both admin areas. Choose which workspace you want to enter for this session.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => handleChooseLoginRole("admin")}
            className="w-full py-3"
          >
            Admin
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => handleChooseLoginRole("super_admin")}
            className="w-full py-3"
          >
            Super Admin
          </Button>
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(pendingAccountSetupUser)}
        onClose={handleCloseAccountSetupModal}
        title={<span className="font-black font-inter">Set-up your Account</span>}
        size="lg"
        showCloseButton
      >
        <div className="rounded-lg border border-cyan-400/25 bg-cyan-500/10 px-4 py-3 mb-4">
          <p className="text-sm font-medium text-cyan-100">
            Choose your preferred username and password before continuing.
          </p>
          <p className="text-xs text-cyan-200/80 mt-2">
            Note: Set these for quicker login when you sign in manually next time.
          </p>
        </div>

        {setupError && (
          <div className="bg-red-500/20 border border-red-500 text-red-400 px-4 py-3 rounded-lg mb-4 text-sm">
            {setupError}
          </div>
        )}

        {setupPasswordValidationError && (
          <div className="bg-red-500/20 border border-red-500 text-red-400 px-4 py-3 rounded-lg mb-4 text-sm">
            {setupPasswordValidationError}
          </div>
        )}

        <form onSubmit={handleAccountSetup} className="space-y-5">
          <GlassInput
            label="CHOSEN USERNAME"
            type="text"
            value={setupUsername}
            onChange={(e) => {
              setSetupUsername(e.target.value);
              setSetupError("");
            }}
            placeholder="Enter your preferred username"
          />

          <div>
            <GlassInput
              label="CHOSEN PASSWORD"
              type={showSetupPassword ? "text" : "password"}
              value={setupPassword}
              onChange={(e) => {
                setSetupPassword(e.target.value);
                setSetupError("");
                setSetupPasswordValidationError("");
              }}
              onFocus={() => setShowSetupPasswordRequirements(true)}
              onBlur={() =>
                setupPassword === "" && setShowSetupPasswordRequirements(false)
              }
              placeholder="Create your password"
              endIcon={
                <button
                  type="button"
                  onClick={() => setShowSetupPassword(!showSetupPassword)}
                  className="flex items-center justify-center text-gray-400 hover:text-white transition-colors"
                >
                  {showSetupPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              }
            />
            <PasswordRequirements
              password={setupPassword}
              showRequirements={showSetupPasswordRequirements}
            />
          </div>

          <GlassInput
            label="CONFIRM PASSWORD"
            type={showSetupConfirmPassword ? "text" : "password"}
            value={setupConfirmPassword}
            onChange={(e) => {
              setSetupConfirmPassword(e.target.value);
              setSetupError("");
              setSetupPasswordValidationError("");
            }}
            placeholder="Confirm your password"
            endIcon={
              <button
                type="button"
                onClick={() =>
                  setShowSetupConfirmPassword(!showSetupConfirmPassword)
                }
                className="flex items-center justify-center text-gray-400 hover:text-white transition-colors"
              >
                {showSetupConfirmPassword ? (
                  <EyeOff className="w-5 h-5" />
                ) : (
                  <Eye className="w-5 h-5" />
                )}
              </button>
            }
          />

          <ModalFooter>
            <Button
              type="submit"
              variant="primary"
              disabled={isSubmittingAccountSetup}
              className="w-full py-3"
            >
              {isSubmittingAccountSetup ? "Saving..." : "Save and Continue"}
            </Button>
          </ModalFooter>
        </form>
      </Modal>

      <Modal
        isOpen={showSuperAdminSuccessModal}
        onClose={() => {}}
        title={
          <span className="font-black font-inter flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-400" />
            Verification Successful
          </span>
        }
        size="lg"
        showCloseButton={false}
      >
        <div className="rounded-lg border border-green-400/25 bg-green-500/10 px-4 py-3 mb-4">
          <p className="text-sm font-medium text-green-300">
            Your super admin login has been verified successfully.
          </p>
        </div>

        <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 cursor-pointer">
          <input
            type="checkbox"
            checked={trustThisDevice}
            onChange={(e) => setTrustThisDevice(e.target.checked)}
            disabled={isFinalizingSuperAdminLogin}
            className="mt-1 h-4 w-4 rounded border-white/20 bg-transparent text-cyan-300 focus:ring-cyan-300/30"
          />
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <ShieldCheck className="w-4 h-4 text-cyan-300" />
              Trust this device
            </div>
            <p className="mt-1 text-xs leading-relaxed text-gray-400">
              Skip the 6-digit verification code on this device next time.
            </p>
          </div>
        </label>

        <ModalFooter>
          <Button
            type="button"
            variant="primary"
            onClick={finalizeSuperAdminLogin}
            disabled={isFinalizingSuperAdminLogin}
            className="px-6 py-2.5"
          >
            {isFinalizingSuperAdminLogin ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Finishing...
              </>
            ) : (
              "Continue"
            )}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
};

export default Login;
