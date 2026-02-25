/**
 * Validates image references in markdown content.
 *
 * This module provides utilities to detect and validate image references in markdown,
 * ensuring they use valid absolute URLs rather than relative paths that would break
 * during site generation.
 *
 * Valid image references:
 * - Absolute URLs: https://example.com/image.png, http://example.com/image.png
 * - Internal API images: /api/images/{imageId}
 *
 * Invalid image references:
 * - Relative paths: ./img/image.png, ../img/image.png, img/image.png
 * - Root-relative paths that aren't /api/images: /img/image.png, /assets/image.png
 * - Protocol-relative URLs: //example.com/image.png (Nextra treats as local paths)
 * - Data URLs: data:image/png;base64,... (Webpack tries to parse as modules)
 * - Uppercase protocols: HTTPS://... (not universally supported)
 */

/**
 * Error codes for image reference validation.
 */
export type ImageReferenceErrorCode = "RELATIVE_PATH" | "IMAGE_NOT_FOUND";

/**
 * An error found during image reference validation.
 */
export interface ImageReferenceError {
	/** Human-readable error message */
	message: string;
	/** The invalid image URL/path */
	src: string;
	/** Line number in the content (1-based) */
	line: number;
	/** Column number in the content (1-based) */
	column: number;
	/** Error code for programmatic handling */
	errorCode: ImageReferenceErrorCode;
}

/**
 * Result of validating image references in content.
 */
export interface ImageReferenceValidationResult {
	/** Whether all image references are valid */
	isValid: boolean;
	/** List of validation errors found */
	errors: Array<ImageReferenceError>;
	/** Image IDs extracted from /api/images/* URLs for existence verification */
	imageIdsToVerify: Array<string>;
}

/**
 * A parsed image reference from markdown content.
 */
export interface ImageReference {
	/** The image source URL/path */
	src: string;
	/** The alt text for the image */
	alt: string;
	/** Line number in the content (1-based) */
	line: number;
	/** Column number in the content (1-based) */
	column: number;
	/** The character offset in the original content */
	offset: number;
}

/**
 * Patterns for valid absolute URLs that are allowed in image references.
 *
 * Note: We intentionally do NOT support:
 * - Protocol-relative URLs (//example.com) - Nextra treats these as local paths
 * - Data URLs (data:image/...) - Webpack tries to parse these as modules
 * - Uppercase protocols (HTTPS://) - Not universally supported
 */
const VALID_URL_PATTERNS: Array<RegExp> = [
	/^https?:\/\//, // http:// or https:// (lowercase only)
	/^\/api\/images\//, // Internal API images (/api/images/...)
];

/**
 * Pattern to extract the full S3 key from /api/images/ URLs.
 * The S3 key includes tenant/org/_default/uuid.ext
 */
const API_IMAGE_KEY_PATTERN = /^\/api\/images\/(.+)$/;

/**
 * Extracts all image references from markdown content.
 * Ignores images that appear inside code blocks (fenced or inline).
 *
 * @param content - The markdown content to parse
 * @returns Array of image references found in the content
 */
export function extractImageReferences(content: string): Array<ImageReference> {
	const images: Array<ImageReference> = [];

	// Step 1: Extract and replace code blocks with placeholders to ignore them
	const fencedCodeBlocks: Array<string> = [];
	const inlineCode: Array<string> = [];

	let processedContent = content;

	// Extract fenced code blocks (```...```)
	processedContent = processedContent.replace(/```[\s\S]*?```/g, match => {
		fencedCodeBlocks.push(match);
		// Use a placeholder that won't match image patterns
		return `\x00FENCED_${fencedCodeBlocks.length - 1}\x00`;
	});

	// Extract inline code (`...`)
	processedContent = processedContent.replace(/`+[^`]+`+/g, match => {
		inlineCode.push(match);
		return `\x00INLINE_${inlineCode.length - 1}\x00`;
	});

	// Step 2: Extract markdown images: ![alt](src) or ![alt](src "title")
	const markdownImageRegex = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
	for (const match of processedContent.matchAll(markdownImageRegex)) {
		const [, alt, src] = match;
		/* v8 ignore next - match.index is always defined with matchAll() */
		const offset = match.index ?? 0;
		const { line, column } = getLineAndColumn(processedContent, offset);

		images.push({
			src,
			alt: alt || "",
			line,
			column,
			offset,
		});
	}

	// Step 3: Extract HTML images: <img src="..." /> or <img src='...' />
	const htmlImageRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
	for (const match of processedContent.matchAll(htmlImageRegex)) {
		const [fullMatch, src] = match;
		/* v8 ignore next - match.index is always defined with matchAll() */
		const offset = match.index ?? 0;
		const { line, column } = getLineAndColumn(processedContent, offset);

		// Extract alt text if present
		const altMatch = fullMatch.match(/alt=["']([^"']*)["']/i);
		const alt = altMatch ? altMatch[1] : "";

		images.push({
			src,
			alt,
			line,
			column,
			offset,
		});
	}

	// Step 4: Adjust line/column numbers to account for removed code blocks
	// This is necessary because we removed code blocks from the content
	return images.map(img => adjustForRemovedContent(img, content));
}

/**
 * Calculates line and column number from a character offset.
 *
 * @param content - The content string
 * @param offset - Character offset (0-based)
 * @returns Object with line (1-based) and column (1-based)
 */
function getLineAndColumn(content: string, offset: number): { line: number; column: number } {
	const lines = content.substring(0, offset).split("\n");
	const line = lines.length;
	const column = lines[lines.length - 1].length + 1;
	return { line, column };
}

/**
 * Adjusts an image reference's line/column to account for content that was
 * temporarily removed during parsing (code blocks).
 *
 * @param img - The image reference with line/column from processed content
 * @param originalContent - The original unprocessed content
 * @returns Image reference with adjusted line/column for original content
 */
function adjustForRemovedContent(img: ImageReference, originalContent: string): ImageReference {
	// Find the image in the original content by searching for its pattern
	// We need to find ![alt](src) or <img src="src"
	const markdownPattern = new RegExp(`!\\[${escapeRegex(img.alt)}\\]\\(${escapeRegex(img.src)}(?:\\s+"[^"]*")?\\)`);
	const htmlPattern = new RegExp(`<img[^>]+src=["']${escapeRegex(img.src)}["'][^>]*>`, "i");

	let originalOffset = originalContent.search(markdownPattern);
	if (originalOffset === -1) {
		originalOffset = originalContent.search(htmlPattern);
	}

	/* v8 ignore next 4 - defensive fallback for edge case */
	if (originalOffset === -1) {
		// Fallback: return original values if we can't find it
		return img;
	}

	const { line, column } = getLineAndColumn(originalContent, originalOffset);
	return { ...img, line, column, offset: originalOffset };
}

/**
 * Escapes special regex characters in a string.
 */
function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Checks if an image URL is a valid absolute URL.
 *
 * @param src - The image source URL to check
 * @returns True if the URL is valid (absolute), false if invalid (relative)
 */
export function isValidImageUrl(src: string): boolean {
	return VALID_URL_PATTERNS.some(pattern => pattern.test(src));
}

/**
 * Extracts the S3 key from an /api/images/ URL.
 *
 * @param src - The image source URL
 * @returns The S3 key if it's an /api/images/ URL, undefined otherwise
 */
export function extractApiImageKey(src: string): string | undefined {
	const match = src.match(API_IMAGE_KEY_PATTERN);
	return match ? match[1] : undefined;
}

/**
 * Validates all image references in markdown content.
 *
 * This function:
 * 1. Extracts all image references (ignoring code blocks)
 * 2. Validates each reference is an absolute URL
 * 3. Collects /api/images/ keys for existence verification
 *
 * Note: This function does NOT verify that /api/images/ URLs actually exist.
 * The caller should use the imageIdsToVerify array to check existence via AssetDao.
 *
 * @param content - The markdown content to validate
 * @returns Validation result with errors and image IDs to verify
 */
export function validateImageReferences(content: string): ImageReferenceValidationResult {
	const images = extractImageReferences(content);
	const errors: Array<ImageReferenceError> = [];
	const imageIdsToVerify: Array<string> = [];

	for (const image of images) {
		// Check if it's a valid absolute URL
		if (!isValidImageUrl(image.src)) {
			errors.push({
				message: `Invalid image reference: "${image.src}". Use absolute URLs (https://) or uploaded images (/api/images/).`,
				src: image.src,
				line: image.line,
				column: image.column,
				errorCode: "RELATIVE_PATH",
			});
			continue;
		}

		// For /api/images/ URLs, collect the key for existence verification
		const apiImageKey = extractApiImageKey(image.src);
		if (apiImageKey) {
			imageIdsToVerify.push(apiImageKey);
		}
	}

	return {
		isValid: errors.length === 0,
		errors,
		imageIdsToVerify,
	};
}

/**
 * Creates an IMAGE_NOT_FOUND error for a missing /api/images/ URL.
 *
 * @param src - The /api/images/ URL that was not found
 * @param line - Line number (1-based)
 * @param column - Column number (1-based)
 * @returns An ImageReferenceError for the missing image
 */
export function createImageNotFoundError(src: string, line: number, column: number): ImageReferenceError {
	return {
		message: `Image not found: "${src}". The image may have been deleted.`,
		src,
		line,
		column,
		errorCode: "IMAGE_NOT_FOUND",
	};
}
