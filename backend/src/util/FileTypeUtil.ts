/**
 * File type utilities for determining binary vs text files.
 * Used by both GitHub operations and Vercel deployment.
 */

/**
 * Binary file extensions that should be base64 encoded.
 * These files cannot be represented as UTF-8 strings without corruption.
 *
 * Note: SVG is intentionally excluded as it's a text-based XML format.
 */
const BINARY_EXTENSIONS = new Set([
	// Images (excluding SVG which is text-based XML)
	".png",
	".jpg",
	".jpeg",
	".gif",
	".webp",
	".ico",
	".bmp",
	".tiff",
	// Fonts
	".woff",
	".woff2",
	".ttf",
	".otf",
	".eot",
	// Other binary formats
	".pdf",
	".zip",
	".gz",
	".tar",
]);

/**
 * Check if a file path represents a binary file based on extension.
 * @param filePath - The file path to check
 * @returns true if the file is binary, false if it's text
 */
export function isBinaryFile(filePath: string): boolean {
	const ext = filePath.substring(filePath.lastIndexOf(".")).toLowerCase();
	return BINARY_EXTENSIONS.has(ext);
}
