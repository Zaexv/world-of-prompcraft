/**
 * FormValidator — Reusable form validation utilities.
 *
 * Centralized validation logic for character creation, settings, login forms.
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate username (3-20 chars, alphanumeric + underscore).
 */
export function validateUsername(username: string): ValidationResult {
  const errors: string[] = [];

  if (!username || username.trim().length === 0) {
    errors.push('Username is required');
  } else if (username.length < 3) {
    errors.push('Username must be at least 3 characters');
  } else if (username.length > 20) {
    errors.push('Username must not exceed 20 characters');
  } else if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    errors.push('Username can only contain letters, numbers, and underscores');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate email format.
 */
export function validateEmail(email: string): ValidationResult {
  const errors: string[] = [];

  if (!email || email.trim().length === 0) {
    errors.push('Email is required');
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push('Please enter a valid email address');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate password strength.
 */
export function validatePassword(password: string): ValidationResult {
  const errors: string[] = [];

  if (!password || password.length === 0) {
    errors.push('Password is required');
  } else if (password.length < 6) {
    errors.push('Password must be at least 6 characters');
  } else if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  } else if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate that two values match (e.g., password confirmation).
 */
export function validateMatch(value1: string, value2: string, fieldName = 'Values'): ValidationResult {
  const errors: string[] = [];

  if (value1 !== value2) {
    errors.push(`${fieldName} do not match`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate required field is not empty.
 */
export function validateRequired(value: string, fieldName = 'Field'): ValidationResult {
  const errors: string[] = [];

  if (!value || value.trim().length === 0) {
    errors.push(`${fieldName} is required`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate string length is within range.
 */
export function validateLength(
  value: string,
  minLength: number,
  maxLength: number,
  fieldName = 'Value'
): ValidationResult {
  const errors: string[] = [];

  if (value.length < minLength) {
    errors.push(`${fieldName} must be at least ${minLength} characters`);
  } else if (value.length > maxLength) {
    errors.push(`${fieldName} must not exceed ${maxLength} characters`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Combine multiple validation results.
 */
export function combineResults(...results: ValidationResult[]): ValidationResult {
  const allErrors = results.flatMap((r) => r.errors);
  return { valid: allErrors.length === 0, errors: allErrors };
}
