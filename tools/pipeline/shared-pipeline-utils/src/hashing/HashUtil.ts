/**
 * Content hashing utilities for generating stable SHA256 hashes.
 */

import { createHash } from "node:crypto";

/**
 * Normalize content before hashing.
 *
 * - Trims leading/trailing whitespace
 * - Normalizes line endings to \n
 * - Collapses multiple consecutive newlines to single newline
 *
 * @param content - Content to normalize
 * @returns Normalized content
 */
export function normalizeContent(content: string): string {
	return content
		.trim()
		.replace(/\r\n/g, "\n") // Windows → Unix line endings
		.replace(/\n{3,}/g, "\n\n"); // Collapse 3+ newlines to 2
}

/**
 * Generate SHA256 hash of content.
 *
 * Content is normalized before hashing to ensure stability:
 * - Trimmed
 * - Normalized line endings
 * - Collapsed extra newlines
 *
 * Returns hash in format: "sha256:<hex>"
 *
 * @param content - Content to hash
 * @returns SHA256 hash with "sha256:" prefix
 */
export function hashContent(content: string): string {
	const normalized = normalizeContent(content);
	const hash = createHash("sha256");
	hash.update(normalized, "utf-8");
	return `sha256:${hash.digest("hex")}`;
}

/**
 * Verify if a hash matches content.
 *
 * @param content - Content to verify
 * @param expectedHash - Expected hash (with or without "sha256:" prefix)
 * @returns True if hash matches
 */
export function verifyHash(content: string, expectedHash: string): boolean {
	const actualHash = hashContent(content);
	const normalizedExpected = expectedHash.startsWith("sha256:") ? expectedHash : `sha256:${expectedHash}`;
	return actualHash === normalizedExpected;
}
