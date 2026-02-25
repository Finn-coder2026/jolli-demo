/**
 * ColorUtils - Utility functions for generating consistent colors.
 */

/**
 * Color palette for generating consistent colors based on names.
 * Uses Tailwind color classes.
 */
const SITE_COLOR_PALETTE = [
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

/**
 * Gets a consistent color class for a site based on its name.
 * Uses the first character to determine the color from a fixed palette.
 *
 * @param name - The name to generate a color for
 * @returns A Tailwind background color class
 *
 * @example
 * ```ts
 * getSiteColor("Acme Corp") // returns "bg-purple-500" (based on 'A')
 * getSiteColor("My Site")   // returns "bg-pink-500" (based on 'M')
 * ```
 */
export function getSiteColor(name: string): string {
	const firstChar = name.charAt(0).toUpperCase();
	const index = firstChar.charCodeAt(0) % SITE_COLOR_PALETTE.length;
	return SITE_COLOR_PALETTE[index];
}
