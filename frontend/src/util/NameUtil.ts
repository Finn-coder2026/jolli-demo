/**
 * Intelligently parse a user's name from their email address.
 * Handles common email patterns like firstname.lastname, first_last, etc.
 *
 * @param email - The email address to parse
 * @returns A formatted name string
 *
 * @example
 * parseNameFromEmail("john.doe@example.com") // "John Doe"
 * parseNameFromEmail("jane_smith@example.com") // "Jane Smith"
 * parseNameFromEmail("bob.a.jones@example.com") // "Bob A Jones"
 * parseNameFromEmail("user123@example.com") // "User123"
 */
export function parseNameFromEmail(email: string): string {
	// Extract the local part (before @)
	const localPart = email.split("@")[0];

	if (!localPart) {
		return "";
	}

	// Split by common separators: dot, underscore, hyphen, plus
	const parts = localPart.split(/[._\-+]/);

	// Filter out empty parts and numbers-only parts
	const nameParts = parts.filter(part => {
		if (!part) {
			return false;
		}
		// Keep parts that have at least one letter
		return /[a-zA-Z]/.test(part);
	});

	if (nameParts.length === 0) {
		// If no valid parts after filtering, check if original has letters
		/* v8 ignore next 3 - theoretically unreachable: if localPart has letters, at least one split part would contain them */
		if (/[a-zA-Z]/.test(localPart)) {
			return capitalizeFirstLetter(localPart.toLowerCase());
		}
		// Completely invalid, return empty string
		return "";
	}

	// Capitalize each part intelligently
	const capitalizedParts = nameParts.map(part => {
		// Handle single letter parts (initials)
		if (part.length === 1) {
			return part.toUpperCase();
		}

		// Handle parts that are all uppercase (might be acronyms)
		if (part === part.toUpperCase() && part.length > 1) {
			// If it's a 2-letter uppercase string, keep it (e.g., IT, US)
			if (part.length === 2) {
				return part;
			}
			// Otherwise, capitalize normally (DOE -> Doe)
			return capitalizeFirstLetter(part.toLowerCase());
		}

		// Normal capitalization (handle mixed case)
		return capitalizeFirstLetter(part.toLowerCase());
	});

	// Join with spaces
	return capitalizedParts.join(" ");
}

/**
 * Capitalize the first letter of a string.
 * Note: This function is only called internally with non-empty strings,
 * as empty cases are handled before reaching this function.
 *
 * @param str - The string to capitalize (must be non-empty)
 * @returns The capitalized string
 */
function capitalizeFirstLetter(str: string): string {
	/* v8 ignore next 3 - defensive check, callers always pass non-empty strings */
	if (!str) {
		return str;
	}
	return str.charAt(0).toUpperCase() + str.slice(1);
}
