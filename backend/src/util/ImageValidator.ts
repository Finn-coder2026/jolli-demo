/**
 * Image validation utilities for upload security.
 * Validates MIME types and magic bytes without external dependencies.
 */

import { getLog } from "./Logger";

const log = getLog(import.meta);

/**
 * Supported image MIME types and their file extensions.
 * SVG is intentionally excluded due to XSS risks (requires sanitization library).
 */
export const ALLOWED_IMAGE_TYPES = {
	"image/png": { extension: "png", magicBytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
	"image/jpeg": { extension: "jpg", magicBytes: [0xff, 0xd8, 0xff] },
	"image/gif": { extension: "gif", magicBytes: [0x47, 0x49, 0x46, 0x38] }, // GIF87a or GIF89a
	"image/webp": { extension: "webp", magicBytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF header, need to check for WEBP
} as const;

export type AllowedImageMimeType = keyof typeof ALLOWED_IMAGE_TYPES;

/**
 * Result of image validation - discriminated union for type safety.
 */
export type ImageValidationResult =
	| { valid: true; mimeType: AllowedImageMimeType; extension: string }
	| { valid: false; error: string };

/**
 * Validates that a MIME type is in our allowed list.
 */
export function isAllowedMimeType(mimeType: string): mimeType is AllowedImageMimeType {
	return mimeType in ALLOWED_IMAGE_TYPES;
}

/**
 * Gets the file extension for a given MIME type.
 */
export function getExtensionForMimeType(mimeType: AllowedImageMimeType): string {
	return ALLOWED_IMAGE_TYPES[mimeType].extension;
}

/**
 * Checks if buffer starts with the expected magic bytes.
 */
function bufferStartsWith(buffer: Buffer, magicBytes: ReadonlyArray<number>): boolean {
	if (buffer.length < magicBytes.length) {
		return false;
	}
	for (let i = 0; i < magicBytes.length; i++) {
		if (buffer[i] !== magicBytes[i]) {
			return false;
		}
	}
	return true;
}

/**
 * Special check for WebP format.
 * WebP files have RIFF header followed by file size, then "WEBP" at bytes 8-11.
 */
function isWebP(buffer: Buffer): boolean {
	if (buffer.length < 12) {
		return false;
	}
	// Check RIFF header
	if (!bufferStartsWith(buffer, ALLOWED_IMAGE_TYPES["image/webp"].magicBytes)) {
		return false;
	}
	// Check for "WEBP" at offset 8
	return buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50;
}

/**
 * Detects the actual image type from file content using magic bytes.
 * Returns null if the format is not recognized or not allowed.
 */
export function detectImageType(buffer: Buffer): AllowedImageMimeType | null {
	// Check PNG
	if (bufferStartsWith(buffer, ALLOWED_IMAGE_TYPES["image/png"].magicBytes)) {
		return "image/png";
	}

	// Check JPEG
	if (bufferStartsWith(buffer, ALLOWED_IMAGE_TYPES["image/jpeg"].magicBytes)) {
		return "image/jpeg";
	}

	// Check GIF
	if (bufferStartsWith(buffer, ALLOWED_IMAGE_TYPES["image/gif"].magicBytes)) {
		return "image/gif";
	}

	// Check WebP (special case - need to verify WEBP marker)
	if (isWebP(buffer)) {
		return "image/webp";
	}

	return null;
}

/**
 * Validates an image file for upload.
 *
 * Checks:
 * 1. File size is within limit
 * 2. Claimed MIME type is in allowed list
 * 3. Actual file content matches claimed MIME type (magic byte validation)
 *
 * @param buffer - The file content as a Buffer
 * @param claimedMimeType - The MIME type claimed by the client (from Content-Type header)
 * @param maxSizeBytes - Maximum allowed file size in bytes
 * @returns Validation result with error message if invalid
 */
export function validateImage(buffer: Buffer, claimedMimeType: string, maxSizeBytes: number): ImageValidationResult {
	// Check file size
	if (buffer.length > maxSizeBytes) {
		const maxSizeMB = (maxSizeBytes / (1024 * 1024)).toFixed(1);
		const actualSizeMB = (buffer.length / (1024 * 1024)).toFixed(2);
		log.warn(
			{ actualSize: buffer.length, maxSize: maxSizeBytes },
			"Image rejected: size %s MB exceeds limit of %s MB",
			actualSizeMB,
			maxSizeMB,
		);
		return {
			valid: false,
			error: `File size (${actualSizeMB} MB) exceeds maximum allowed size (${maxSizeMB} MB)`,
		};
	}

	// Check claimed MIME type is allowed
	if (!isAllowedMimeType(claimedMimeType)) {
		log.warn({ claimedMimeType }, "Image rejected: MIME type %s is not allowed", claimedMimeType);
		return {
			valid: false,
			error: `File type '${claimedMimeType}' is not allowed. Allowed types: ${Object.keys(ALLOWED_IMAGE_TYPES).join(", ")}`,
		};
	}

	// Detect actual type from magic bytes
	const detectedType = detectImageType(buffer);
	if (!detectedType) {
		log.warn({ claimedMimeType }, "Image rejected: could not detect image type from file content");
		return {
			valid: false,
			error: "Could not verify file type. The file may be corrupted or not a valid image.",
		};
	}

	// Verify claimed type matches detected type
	if (detectedType !== claimedMimeType) {
		log.warn(
			{ claimedMimeType, detectedType },
			"Image rejected: claimed type %s does not match detected type %s",
			claimedMimeType,
			detectedType,
		);
		return {
			valid: false,
			error: `File content does not match claimed type. Claimed: ${claimedMimeType}, Detected: ${detectedType}`,
		};
	}

	// All checks passed
	return {
		valid: true,
		mimeType: detectedType,
		extension: getExtensionForMimeType(detectedType),
	};
}
