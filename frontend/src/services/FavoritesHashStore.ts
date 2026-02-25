/**
 * Simple store for the favorites hash received from the auth endpoint.
 * Used by useUserPreferences hook to detect if local cache is stale.
 *
 * Tracks both the hash value and whether it has been loaded from the server.
 * This distinction is important to avoid race conditions where the hook
 * reads the hash before OrgContext has finished loading.
 */

let serverFavoritesHash = "EMPTY";
let hashLoaded = false;

/**
 * Set the favorites hash received from server auth response.
 * Also marks the hash as loaded.
 */
export function setServerFavoritesHash(hash: string): void {
	serverFavoritesHash = hash;
	hashLoaded = true;
}

/**
 * Get the current server favorites hash.
 */
export function getServerFavoritesHash(): string {
	return serverFavoritesHash;
}

/**
 * Check if the server favorites hash has been loaded.
 * Returns false until setServerFavoritesHash has been called.
 */
export function isServerFavoritesHashLoaded(): boolean {
	return hashLoaded;
}

/**
 * Reset the hash store state. Used for testing.
 */
export function resetFavoritesHashStore(): void {
	serverFavoritesHash = "EMPTY";
	hashLoaded = false;
}
