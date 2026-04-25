/**
 * Password validation utility
 * Requirements:
 * - At least 12 characters
 * - Uppercase letter (A–Z)
 * - Lowercase letter (a–z)
 * - Number (0–9)
 * - Special character (! @ # $ % ^ & *)
 */

export const PASSWORD_REQUIREMENTS = {
  minLength: 12,
  hasUppercase: /[A-Z]/,
  hasLowercase: /[a-z]/,
  hasNumber: /[0-9]/,
  hasSpecial: /[!@#$%^&*]/,
};

export const PASSWORD_REQUIREMENT_LABELS = {
  minLength: 'At least 12 characters',
  hasUppercase: 'Uppercase letter (A–Z)',
  hasLowercase: 'Lowercase letter (a–z)',
  hasNumber: 'Number (0–9)',
  hasSpecial: 'Special character (! @ # $ % ^ & *)',
};

/**
 * Validate password against all requirements
 * @param {string} password - The password to validate
 * @returns {Object} Object with validation results for each requirement
 */
export const validatePassword = (password) => {
  const pwd = String(password || '');

  return {
    minLength: pwd.length >= PASSWORD_REQUIREMENTS.minLength,
    hasUppercase: PASSWORD_REQUIREMENTS.hasUppercase.test(pwd),
    hasLowercase: PASSWORD_REQUIREMENTS.hasLowercase.test(pwd),
    hasNumber: PASSWORD_REQUIREMENTS.hasNumber.test(pwd),
    hasSpecial: PASSWORD_REQUIREMENTS.hasSpecial.test(pwd),
  };
};

/**
 * Check if password meets all requirements
 * @param {string} password - The password to validate
 * @returns {boolean} True if password meets all requirements
 */
export const isPasswordValid = (password) => {
  const validation = validatePassword(password);
  return Object.values(validation).every(v => v === true);
};

/**
 * Get validation error message if password is invalid
 * @param {string} password - The password to validate
 * @returns {string|null} Error message or null if valid
 */
export const getPasswordErrorMessage = (password) => {
  const pwd = String(password || '');

  if (pwd.length === 0) {
    return 'Password is required';
  }

  const validation = validatePassword(pwd);
  const failedRequirements = [];

  if (!validation.minLength) {
    failedRequirements.push(PASSWORD_REQUIREMENT_LABELS.minLength);
  }
  if (!validation.hasUppercase) {
    failedRequirements.push(PASSWORD_REQUIREMENT_LABELS.hasUppercase);
  }
  if (!validation.hasLowercase) {
    failedRequirements.push(PASSWORD_REQUIREMENT_LABELS.hasLowercase);
  }
  if (!validation.hasNumber) {
    failedRequirements.push(PASSWORD_REQUIREMENT_LABELS.hasNumber);
  }
  if (!validation.hasSpecial) {
    failedRequirements.push(PASSWORD_REQUIREMENT_LABELS.hasSpecial);
  }

  if (failedRequirements.length > 0) {
    return `Password must contain: ${failedRequirements.join(', ')}`;
  }

  return null;
};
