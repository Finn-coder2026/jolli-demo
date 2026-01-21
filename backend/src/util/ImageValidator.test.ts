import {
	ALLOWED_IMAGE_TYPES,
	detectImageType,
	getExtensionForMimeType,
	isAllowedMimeType,
	validateImage,
} from "./ImageValidator";
import { describe, expect, it } from "vitest";

describe("ImageValidator", () => {
	// Real image magic bytes for testing
	const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
	const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
	const GIF_HEADER = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00]);
	const WEBP_HEADER = Buffer.from([
		0x52,
		0x49,
		0x46,
		0x46, // RIFF
		0x00,
		0x00,
		0x00,
		0x00, // file size (placeholder)
		0x57,
		0x45,
		0x42,
		0x50, // WEBP
	]);
	const INVALID_HEADER = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]);

	describe("ALLOWED_IMAGE_TYPES", () => {
		it("should have correct extensions for each MIME type", () => {
			expect(ALLOWED_IMAGE_TYPES["image/png"].extension).toBe("png");
			expect(ALLOWED_IMAGE_TYPES["image/jpeg"].extension).toBe("jpg");
			expect(ALLOWED_IMAGE_TYPES["image/gif"].extension).toBe("gif");
			expect(ALLOWED_IMAGE_TYPES["image/webp"].extension).toBe("webp");
		});

		it("should not include SVG (security risk)", () => {
			expect("image/svg+xml" in ALLOWED_IMAGE_TYPES).toBe(false);
		});
	});

	describe("isAllowedMimeType", () => {
		it("should return true for allowed MIME types", () => {
			expect(isAllowedMimeType("image/png")).toBe(true);
			expect(isAllowedMimeType("image/jpeg")).toBe(true);
			expect(isAllowedMimeType("image/gif")).toBe(true);
			expect(isAllowedMimeType("image/webp")).toBe(true);
		});

		it("should return false for disallowed MIME types", () => {
			expect(isAllowedMimeType("image/svg+xml")).toBe(false);
			expect(isAllowedMimeType("application/pdf")).toBe(false);
			expect(isAllowedMimeType("text/html")).toBe(false);
			expect(isAllowedMimeType("image/bmp")).toBe(false);
		});
	});

	describe("getExtensionForMimeType", () => {
		it("should return correct extension for each MIME type", () => {
			expect(getExtensionForMimeType("image/png")).toBe("png");
			expect(getExtensionForMimeType("image/jpeg")).toBe("jpg");
			expect(getExtensionForMimeType("image/gif")).toBe("gif");
			expect(getExtensionForMimeType("image/webp")).toBe("webp");
		});
	});

	describe("detectImageType", () => {
		it("should detect PNG from magic bytes", () => {
			expect(detectImageType(PNG_HEADER)).toBe("image/png");
		});

		it("should detect JPEG from magic bytes", () => {
			expect(detectImageType(JPEG_HEADER)).toBe("image/jpeg");
		});

		it("should detect GIF from magic bytes", () => {
			expect(detectImageType(GIF_HEADER)).toBe("image/gif");
		});

		it("should detect WebP from magic bytes", () => {
			expect(detectImageType(WEBP_HEADER)).toBe("image/webp");
		});

		it("should return null for unknown format", () => {
			expect(detectImageType(INVALID_HEADER)).toBeNull();
		});

		it("should return null for empty buffer", () => {
			expect(detectImageType(Buffer.alloc(0))).toBeNull();
		});

		it("should return null for buffer too short for WebP check", () => {
			// RIFF header alone is not enough for WebP
			const shortRiff = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00]);
			expect(detectImageType(shortRiff)).toBeNull();
		});

		it("should return null for RIFF that is not WebP", () => {
			// RIFF header with AVI marker instead of WEBP
			const aviFile = Buffer.from([
				0x52,
				0x49,
				0x46,
				0x46, // RIFF
				0x00,
				0x00,
				0x00,
				0x00, // file size
				0x41,
				0x56,
				0x49,
				0x20, // AVI (not WEBP)
			]);
			expect(detectImageType(aviFile)).toBeNull();
		});

		it("should return null for 12+ byte buffer that is not any known format", () => {
			// 12+ bytes but doesn't match any magic bytes - tests isWebP false branch at line 69
			const unknownFile = Buffer.from([
				0x00,
				0x01,
				0x02,
				0x03, // Not RIFF, PNG, JPEG, or GIF
				0x04,
				0x05,
				0x06,
				0x07,
				0x08,
				0x09,
				0x0a,
				0x0b,
			]);
			expect(detectImageType(unknownFile)).toBeNull();
		});
	});

	describe("validateImage", () => {
		const MAX_SIZE = 10 * 1024 * 1024; // 10MB

		it("should validate a valid PNG image", () => {
			const result = validateImage(PNG_HEADER, "image/png", MAX_SIZE);
			expect(result.valid).toBe(true);
			if (result.valid) {
				expect(result.mimeType).toBe("image/png");
				expect(result.extension).toBe("png");
			}
		});

		it("should validate a valid JPEG image", () => {
			const result = validateImage(JPEG_HEADER, "image/jpeg", MAX_SIZE);
			expect(result.valid).toBe(true);
			if (result.valid) {
				expect(result.mimeType).toBe("image/jpeg");
				expect(result.extension).toBe("jpg");
			}
		});

		it("should validate a valid GIF image", () => {
			const result = validateImage(GIF_HEADER, "image/gif", MAX_SIZE);
			expect(result.valid).toBe(true);
			if (result.valid) {
				expect(result.mimeType).toBe("image/gif");
				expect(result.extension).toBe("gif");
			}
		});

		it("should validate a valid WebP image", () => {
			const result = validateImage(WEBP_HEADER, "image/webp", MAX_SIZE);
			expect(result.valid).toBe(true);
			if (result.valid) {
				expect(result.mimeType).toBe("image/webp");
				expect(result.extension).toBe("webp");
			}
		});

		it("should reject file exceeding size limit", () => {
			const largeBuffer = Buffer.concat([PNG_HEADER, Buffer.alloc(MAX_SIZE)]);
			const result = validateImage(largeBuffer, "image/png", MAX_SIZE);
			expect(result.valid).toBe(false);
			if (!result.valid) {
				expect(result.error).toContain("exceeds maximum");
			}
		});

		it("should reject disallowed MIME type", () => {
			const result = validateImage(PNG_HEADER, "image/svg+xml", MAX_SIZE);
			expect(result.valid).toBe(false);
			if (!result.valid) {
				expect(result.error).toContain("not allowed");
			}
		});

		it("should reject when magic bytes don't match any format", () => {
			const result = validateImage(INVALID_HEADER, "image/png", MAX_SIZE);
			expect(result.valid).toBe(false);
			if (!result.valid) {
				expect(result.error).toContain("Could not verify file type");
			}
		});

		it("should reject when claimed type doesn't match detected type", () => {
			// Claiming JPEG but providing PNG data
			const result = validateImage(PNG_HEADER, "image/jpeg", MAX_SIZE);
			expect(result.valid).toBe(false);
			if (!result.valid) {
				expect(result.error).toContain("does not match claimed type");
			}
		});

		it("should include size info in error message", () => {
			const twoMB = 2 * 1024 * 1024;
			const largeBuffer = Buffer.concat([PNG_HEADER, Buffer.alloc(twoMB)]);
			const result = validateImage(largeBuffer, "image/png", 1024 * 1024); // 1MB limit
			expect(result.valid).toBe(false);
			if (!result.valid) {
				expect(result.error).toContain("MB");
			}
		});
	});
});
