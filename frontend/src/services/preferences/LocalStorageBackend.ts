/**
 * LocalStorage implementation of the StorageBackend interface.
 *
 * Provides a safe wrapper around localStorage with error handling
 * for environments where localStorage may be unavailable or restricted.
 */

import type { StorageBackend } from "./PreferencesTypes";

/**
 * StorageBackend implementation using browser's localStorage.
 *
 * All operations are wrapped in try-catch blocks to handle cases where:
 * - localStorage is disabled (private browsing, security settings)
 * - Storage quota is exceeded
 * - Other browser-specific restrictions
 */
export class LocalStorageBackend implements StorageBackend {
	/**
	 * Gets an item from localStorage.
	 *
	 * @param key - The storage key
	 * @returns The stored value, or null if not found or on error
	 */
	getItem(key: string): string | null {
		try {
			return localStorage.getItem(key);
		} catch {
			// localStorage may be unavailable (private browsing, security settings, etc.)
			return null;
		}
	}

	/**
	 * Sets an item in localStorage.
	 *
	 * @param key - The storage key
	 * @param value - The value to store
	 */
	setItem(key: string, value: string): void {
		try {
			localStorage.setItem(key, value);
		} catch {
			// Silently fail - storage may be full or unavailable
		}
	}

	/**
	 * Removes an item from localStorage.
	 *
	 * @param key - The storage key to remove
	 */
	removeItem(key: string): void {
		try {
			localStorage.removeItem(key);
		} catch {
			// Silently fail - storage may be unavailable
		}
	}
}

/**
 * Singleton instance of LocalStorageBackend for convenience.
 */
export const localStorageBackend = new LocalStorageBackend();
