/**
 * Shared validation utilities for folder and document names.
 * These rules ensure names are compatible with Windows, macOS, Linux,
 * and cloud services like OneDrive/SharePoint.
 */

/**
 * Characters not allowed in folder/document names.
 * Based on Windows filesystem restrictions (most restrictive common standard):
 * - / \ : * ? " < > |
 *
 * @see https://support.microsoft.com/en-us/office/restrictions-and-limitations-in-onedrive-and-sharepoint-64883a5d-228e-48f5-b3d2-eb39e07630fa
 */
export const INVALID_NAME_CHARS = /[/\\:*?"<>|]/;

/** Error types for name validation */
export type NameValidationError = "empty" | "invalidChars";

/** Result of name validation */
export interface NameValidationResult {
	valid: boolean;
	error?: NameValidationError;
}

/**
 * Validates that a name is non-empty and doesn't contain invalid characters.
 * @param name - The name to validate
 * @returns Validation result with error type if invalid
 */
export function validateItemName(name: string): NameValidationResult {
	const trimmed = name.trim();
	if (!trimmed) {
		return { valid: false, error: "empty" };
	}
	if (INVALID_NAME_CHARS.test(trimmed)) {
		return { valid: false, error: "invalidChars" };
	}
	return { valid: true };
}
