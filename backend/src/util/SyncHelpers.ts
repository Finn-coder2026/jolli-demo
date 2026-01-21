import { wyhash_str } from "wyhash";

/** Default seed for wyhash - matches Bun.hash() default */
const DEFAULT_SEED = 0n;

/**
 * Computes an integrity hash from content using wyhash.
 * This matches Bun's native Bun.hash() for CLI compatibility.
 * @param content The content string to hash.
 * @returns The hash as a hexadecimal string.
 */
export function integrityHashFromContent(content: string): string {
	return wyhash_str(content, DEFAULT_SEED).toString(16);
}
