import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import logo from "../../assets/css_logo.png";
import GradientText from "../../components/ui/GradientText";
import AnimatedContent from "../../components/ui/AnimatedContent";
import GlassInput from "../../components/ui/GlassInput";

const Login = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
  const navigate = useNavigate();

  useEffect(() => {
    if (resendTimer <= 0) {
      return undefined;
    }

    const timerId = setInterval(() => {
      setResendTimer((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);

    return () => clearInterval(timerId);
  }, [resendTimer]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });

      let result = {};
      try {
        result = await response.json();
      } catch {
        result = {};
      }

      if (!response.ok) {
        setError(result?.message || `Login failed (${response.status})`);
        return;
      }

      const userRole = result?.user?.role;

      localStorage.setItem("svms_user", JSON.stringify(result.user));

      if (userRole === "admin") {
        navigate("/admin");
        return;
      }

      if (userRole === "student") {
        navigate("/student/dashboard");
        return;
      }

      setError("Account role is not recognized.");
    } catch (_error) {
      setError("Unable to connect to the login server.");
    }
  };

  const handleForgotPasswordReset = () => {
    setIsForgotPassword(false);
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
      setResendTimer(Number(result?.retryAfterSeconds) || 15);
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
      setResendTimer(Number(result?.retryAfterSeconds) || 15);
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
    if (!newPassword.trim() || !confirmPassword.trim()) {
      setForgotPasswordError("Please fill in all fields");
      return;
    }
    if (newPassword.length < 6) {
      setForgotPasswordError("Password must be at least 6 characters");
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

  return (
    <div className="min-h-screen bg-[#1a1a1a] flex items-center justify-center p-4 font-inter">
      <div className="w-full max-w-[1100px] h-[650px] bg-[#0d0d0d] rounded-3xl overflow-hidden flex shadow-2xl border border-white/[0.30]">
        {/* Left Panel */}
        <div className="w-[45%] bg-gradient-to-b from-[#1a1a1a] to-[#0d0d0d] p-12 flex flex-col justify-between relative">
          {/* Logo */}
          <AnimatedContent
            distance={30}
            direction="vertical"
            duration={0.6}
            delay={0}
          >
            <div>
              <img src={logo} alt="Logo" className="h-14 w-auto" />
            </div>
          </AnimatedContent>
          {/* Welcome Text */}
          <div className="flex-1 flex flex-col justify-center -mt-16">
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
            <div className="text-gray-500 text-xs leading-relaxed">
              Track, manage, and resolve student
              <br />
              violations efficiently. Maintain accurate
              <br />
              records and promote a safe learning
              <br />
              environment.
            </div>
          </AnimatedContent>
        </div>

        {/* Right Panel */}
        <div className="w-[55%] bg-[#0F1113]/30 p-12 relative overflow-y-auto">
          {!isForgotPassword ? (
            // Login Form
            <div className="mt-10">
              <AnimatedContent
                distance={30}
                direction="horizontal"
                reverse
                duration={0.6}
                delay={0.2}
              >
                <h2 className="text-white text-4xl font-bold mb-12">Login</h2>
              </AnimatedContent>
              {error && (
                <div className="bg-red-500/20 border border-red-500 text-red-400 px-4 py-3 rounded-lg mb-6 text-sm">
                  {error}
                </div>
              )}
              <AnimatedContent
                distance={30}
                direction="horizontal"
                reverse
                duration={0.6}
                delay={0.3}
              >
                <form onSubmit={handleLogin} className="space-y-8">
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
                          className="text-gray-400 hover:text-white transition-colors"
                        >
                          {showPassword ? (
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
                    className="w-full bg-[#c4c4c4] hover:bg-[#e4e4e4] text-[#1a1a1a] font-bold py-4 rounded-lg tracking-widest mt-6 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-white/10 active:scale-[0.98]"
                  >
                    LOGIN
                  </button>
                </form>
              </AnimatedContent>
            </div>
          ) : (
            // Forgot Password Flow
            <div className="mt-10">
              <div className="flex items-center gap-3 mb-12">
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
                <h2 className="text-white text-4xl font-bold">
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
                    <form onSubmit={handleSendEmail} className="space-y-8">
                      <GlassInput
                        label="EMAIL ADDRESS"
                        type="email"
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                      />
                      <button
                        type="submit"
                        disabled={isSendingCode}
                        className="w-full bg-[#c4c4c4] hover:bg-[#e4e4e4] text-[#1a1a1a] font-bold py-4 rounded-lg tracking-widest transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-white/10 active:scale-[0.98]"
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
                    <form onSubmit={handleVerifyCode} className="space-y-8">
                      <GlassInput
                        label="VERIFICATION CODE"
                        type="text"
                        value={verificationCode}
                        onChange={(e) =>
                          setVerificationCode(
                            e.target.value.replace(/\D/g, "").slice(0, 6),
                          )
                        }
                        placeholder="000000"
                      />
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={handleResendCode}
                          disabled={resendTimer > 0 || isSendingCode}
                          className="text-xs text-gray-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                        className="w-full bg-[#c4c4c4] hover:bg-[#e4e4e4] text-[#1a1a1a] font-bold py-4 rounded-lg tracking-widest transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-white/10 active:scale-[0.98]"
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
                    <form onSubmit={handleNewPassword} className="space-y-8">
                      <div>
                        <GlassInput
                          label="NEW PASSWORD"
                          type={showNewPassword ? "text" : "password"}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
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
                      </div>
                      <div>
                        <GlassInput
                          label="CONFIRM PASSWORD"
                          type={showConfirmPassword ? "text" : "password"}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
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
                        className="w-full bg-[#c4c4c4] hover:bg-[#e4e4e4] text-[#1a1a1a] font-bold py-4 rounded-lg tracking-widest transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-white/10 active:scale-[0.98]"
                      >
                        {isResettingPassword ? "SAVING..." : "RESET PASSWORD"}
                      </button>
                    </form>
                  </div>
                )}

                {forgotPasswordStep === 4 && (
                  <div className="text-center py-12">
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
                      className="w-full bg-[#c4c4c4] hover:bg-[#e4e4e4] text-[#1a1a1a] font-bold py-4 rounded-lg tracking-widest transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-white/10 active:scale-[0.98]"
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
    </div>
  );
};

export default Login;
