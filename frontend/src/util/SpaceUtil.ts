/**
 * Space utility functions for consistent space icon handling
 */

/**
 * Get a color class for a space based on its first letter.
 * Uses a consistent color palette that maps letters to colors.
 *
 * @param name - The space name
 * @returns Tailwind CSS background color class (e.g., "bg-blue-500")
 */
export function getSpaceColor(name: string): string {
	const colors = [
		"bg-blue-500",
		"bg-green-500",
		"bg-yellow-500",
		"bg-red-500",
		"bg-purple-500",
		"bg-pink-500",
		"bg-indigo-500",
		"bg-cyan-500",
		"bg-orange-500",
		"bg-teal-500",
	];

	// Handle empty string - return first color
	if (!name) {
		return colors[0];
	}

	// Use first character's code point to select color
	const firstChar = name.charAt(0).toUpperCase();
	const index = firstChar.charCodeAt(0) % colors.length;
	return colors[index];
}

/**
 * Get the initial letter to display in a space icon.
 *
 * @param name - The space name
 * @returns Uppercase first letter
 */
export function getSpaceInitial(name: string): string {
	return name.charAt(0).toUpperCase();
}
