/**
 * Password validation rules - shared between frontend and backend.
 * These rules match the BetterAuthConfig password requirements.
 */

/**
 * Password validation error codes.
 */
export type PasswordValidationError =
	| "required"
	| "too_short"
	| "too_long"
	| "needs_uppercase"
	| "needs_lowercase"
	| "needs_number"
	| "needs_special"
	| "contains_email";

/**
 * Password validation result.
 */
export interface PasswordValidationResult {
	valid: boolean;
	error?: PasswordValidationError;
}

/**
 * Password validation constants.
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 36;
export const PASSWORD_SPECIAL_CHARS = "!@#$%^&*()_+-=[]{}';:\"\\|,.<>/?";

/**
 * Validate password against rules.
 *
 * @param password - The password to validate
 * @param email - Optional email to check for substring (prevents password containing email prefix)
 * @returns Validation result with error code if invalid
 */
export function validatePassword(password: string, email?: string): PasswordValidationResult {
	if (!password) {
		return { valid: false, error: "required" };
	}

	if (password.length < PASSWORD_MIN_LENGTH) {
		return { valid: false, error: "too_short" };
	}

	if (password.length > PASSWORD_MAX_LENGTH) {
		return { valid: false, error: "too_long" };
	}

	if (!/[A-Z]/.test(password)) {
		return { valid: false, error: "needs_uppercase" };
	}

	if (!/[a-z]/.test(password)) {
		return { valid: false, error: "needs_lowercase" };
	}

	if (!/\d/.test(password)) {
		return { valid: false, error: "needs_number" };
	}

	// Check for at least one special character
	const hasSpecialChar = [...password].some(char => PASSWORD_SPECIAL_CHARS.includes(char));
	if (!hasSpecialChar) {
		return { valid: false, error: "needs_special" };
	}

	// Check for email substring in password
	if (email) {
		const emailPrefix = email.split("@")[0];
		if (emailPrefix && password.toLowerCase().includes(emailPrefix.toLowerCase())) {
			return { valid: false, error: "contains_email" };
		}
	}

	return { valid: true };
}
