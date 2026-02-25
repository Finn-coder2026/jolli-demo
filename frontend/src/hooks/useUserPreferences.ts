/**
 * useUserPreferences - Hook for managing user favorites with hybrid caching.
 *
 * Features:
 * - Instant UI from localStorage cache
 * - Hash-based sync detection (compares with server hash from auth)
 * - Only fetches full data when hash differs
 * - Optimistic updates with rollback on error
 * - Debounced rapid toggles
 * - Cross-tab sync via BroadcastChannel
 */

import { useClient } from "../contexts/ClientContext";
import { useOrg } from "../contexts/OrgContext";
import { getServerFavoritesHash, isServerFavoritesHashLoaded } from "../services/FavoritesHashStore";
import { getLog } from "../util/Logger";
import { useCallback, useEffect, useRef, useState } from "react";

const log = getLog(import.meta);

/** localStorage key for user preferences */
const PREFERENCES_STORAGE_KEY = "jolli:userPreferences";

/** Special hash value indicating no preferences exist */
const EMPTY_HASH = "EMPTY";

/** Debounce delay for rapid toggles (ms) */
const DEBOUNCE_DELAY = 100;

/** BroadcastChannel name for cross-tab sync */
const BROADCAST_CHANNEL = "jolli-user-preferences";

interface StoredPreferences {
	favoriteSpaces: Array<number>;
	favoriteSites: Array<number>;
	hash: string;
}

interface UseUserPreferencesResult {
	favoriteSpaces: Array<number>;
	favoriteSites: Array<number>;
	isLoading: boolean;
	/** Error from last failed save operation (cleared on next successful save) */
	saveError: Error | null;
	toggleSpaceFavorite: (spaceId: number) => void;
	toggleSiteFavorite: (siteId: number) => void;
	isSpaceFavorite: (spaceId: number) => boolean;
	isSiteFavorite: (siteId: number) => boolean;
}

/**
 * Read preferences from localStorage.
 */
function readFromStorage(): StoredPreferences {
	try {
		const stored = localStorage.getItem(PREFERENCES_STORAGE_KEY);
		if (stored) {
			return JSON.parse(stored) as StoredPreferences;
		}
	} catch (error) {
		log.warn(error, "Failed to read preferences from localStorage");
	}
	return { favoriteSpaces: [], favoriteSites: [], hash: EMPTY_HASH };
}

/**
 * Write preferences to localStorage.
 */
function writeToStorage(prefs: StoredPreferences): void {
	try {
		localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(prefs));
	} catch (error) {
		log.warn(error, "Failed to write preferences to localStorage");
	}
}

/**
 * Hook for managing user favorites with hybrid caching strategy.
 */
export function useUserPreferences(): UseUserPreferencesResult {
	const client = useClient();
	const { isLoading: isOrgLoading } = useOrg();
	const [favoriteSpaces, setFavoriteSpaces] = useState<Array<number>>([]);
	const [favoriteSites, setFavoriteSites] = useState<Array<number>>([]);
	const [currentHash, setCurrentHash] = useState<string>(EMPTY_HASH);
	const [isLoading, setIsLoading] = useState(true);
	const [saveError, setSaveError] = useState<Error | null>(null);

	// Refs for debouncing and pending updates
	const pendingUpdateRef = useRef<NodeJS.Timeout | null>(null);
	const broadcastChannelRef = useRef<BroadcastChannel | null>(null);
	// Store last server-confirmed state for rollback on error
	const confirmedStateRef = useRef<StoredPreferences>({ favoriteSpaces: [], favoriteSites: [], hash: EMPTY_HASH });
	// Track latest state values to avoid stale closures in toggle callbacks
	const latestSpacesRef = useRef<Array<number>>([]);
	const latestSitesRef = useRef<Array<number>>([]);
	const latestHashRef = useRef<string>(EMPTY_HASH);

	// Keep refs in sync with state to avoid stale closures
	useEffect(() => {
		latestSpacesRef.current = favoriteSpaces;
		latestSitesRef.current = favoriteSites;
		latestHashRef.current = currentHash;
	}, [favoriteSpaces, favoriteSites, currentHash]);

	// Cleanup pending timeout on unmount
	useEffect(() => {
		return () => {
			if (pendingUpdateRef.current) {
				clearTimeout(pendingUpdateRef.current);
			}
		};
	}, []);

	// Initialize from localStorage and sync with server
	useEffect(() => {
		// Read from localStorage immediately for instant UI
		const stored = readFromStorage();
		setFavoriteSpaces(stored.favoriteSpaces);
		setFavoriteSites(stored.favoriteSites);
		setCurrentHash(stored.hash);
		// Save as confirmed state for rollback
		confirmedStateRef.current = stored;

		// Wait for org context to finish loading before comparing with server hash.
		// This prevents a race condition where we check the hash before OrgContext
		// has fetched and set it, which would incorrectly treat "not yet loaded"
		// as "user has no preferences".
		if (isOrgLoading || !isServerFavoritesHashLoaded()) {
			// Still loading - keep isLoading true and wait for next effect run
			return;
		}

		// Compare with server hash
		const serverHash = getServerFavoritesHash();

		if (serverHash === EMPTY_HASH) {
			// User has no preferences on server, use empty state
			setIsLoading(false);
			return;
		}

		if (stored.hash === serverHash) {
			// Hash matches, no need to fetch
			setIsLoading(false);
			return;
		}

		// Hash differs, fetch from server
		client
			.profile()
			.getPreferences()
			.then(prefs => {
				setFavoriteSpaces(prefs.favoriteSpaces);
				setFavoriteSites(prefs.favoriteSites);
				setCurrentHash(prefs.hash);
				const newState = {
					favoriteSpaces: prefs.favoriteSpaces,
					favoriteSites: prefs.favoriteSites,
					hash: prefs.hash,
				};
				writeToStorage(newState);
				// Update confirmed state
				confirmedStateRef.current = newState;
			})
			.catch(error => {
				log.warn(error, "Failed to fetch preferences from server");
			})
			.finally(() => {
				setIsLoading(false);
			});
	}, [client, isOrgLoading]);

	// Set up BroadcastChannel for cross-tab sync
	useEffect(() => {
		if (typeof BroadcastChannel === "undefined") {
			return;
		}

		const channel = new BroadcastChannel(BROADCAST_CHANNEL);
		broadcastChannelRef.current = channel;

		channel.onmessage = (event: MessageEvent<StoredPreferences>) => {
			const { favoriteSpaces: spaces, favoriteSites: sites, hash } = event.data;
			setFavoriteSpaces(spaces);
			setFavoriteSites(sites);
			setCurrentHash(hash);
			// Also update localStorage to stay in sync
			writeToStorage({ favoriteSpaces: spaces, favoriteSites: sites, hash });
		};

		return () => {
			channel.close();
			broadcastChannelRef.current = null;
		};
	}, []);

	// Broadcast changes to other tabs
	const broadcastChanges = useCallback((prefs: StoredPreferences) => {
		broadcastChannelRef.current?.postMessage(prefs);
	}, []);

	// Listen for external space changes (e.g., from onboarding creating a space)
	useEffect(() => {
		function handleSpacesChanged(): void {
			client
				.profile()
				.getPreferences()
				.then(prefs => {
					setFavoriteSpaces(prefs.favoriteSpaces);
					setFavoriteSites(prefs.favoriteSites);
					setCurrentHash(prefs.hash);
					const newState = {
						favoriteSpaces: prefs.favoriteSpaces,
						favoriteSites: prefs.favoriteSites,
						hash: prefs.hash,
					};
					writeToStorage(newState);
					confirmedStateRef.current = newState;
					broadcastChanges(newState);
				})
				.catch(error => {
					log.warn(error, "Failed to refresh preferences after external change");
				});
		}

		window.addEventListener("jolli:spaces-changed", handleSpacesChanged);
		return () => window.removeEventListener("jolli:spaces-changed", handleSpacesChanged);
	}, [client, broadcastChanges]);

	// Save to server with debouncing
	const saveToServer = useCallback(
		(spaces: Array<number>, sites: Array<number>) => {
			// Clear any pending update
			if (pendingUpdateRef.current) {
				clearTimeout(pendingUpdateRef.current);
			}

			// Debounce the server update
			pendingUpdateRef.current = setTimeout(() => {
				client
					.profile()
					.updatePreferences({ favoriteSpaces: spaces, favoriteSites: sites })
					.then(response => {
						// Update hash from server response
						setCurrentHash(response.hash);
						const prefs = {
							favoriteSpaces: response.favoriteSpaces,
							favoriteSites: response.favoriteSites,
							hash: response.hash,
						};
						writeToStorage(prefs);
						broadcastChanges(prefs);
						// Update confirmed state on success
						confirmedStateRef.current = prefs;
						// Clear any previous error on success
						setSaveError(null);
					})
					.catch(error => {
						log.error(error, "Failed to save preferences to server");
						// Set error for UI feedback
						setSaveError(error instanceof Error ? error : new Error(String(error)));
						// Rollback to last confirmed state (not optimistically updated localStorage)
						const confirmed = confirmedStateRef.current;
						setFavoriteSpaces(confirmed.favoriteSpaces);
						setFavoriteSites(confirmed.favoriteSites);
						setCurrentHash(confirmed.hash);
						// Also restore localStorage
						writeToStorage(confirmed);
					});
			}, DEBOUNCE_DELAY);
		},
		[client, broadcastChanges],
	);

	const toggleSpaceFavorite = useCallback(
		(spaceId: number) => {
			setFavoriteSpaces(prev => {
				const newSpaces = prev.includes(spaceId) ? prev.filter(id => id !== spaceId) : [...prev, spaceId];

				// Use refs for latest values to avoid stale closures
				const currentSites = latestSitesRef.current;
				const hash = latestHashRef.current;

				// Optimistic update to localStorage
				const prefs = { favoriteSpaces: newSpaces, favoriteSites: currentSites, hash };
				writeToStorage(prefs);
				broadcastChanges(prefs);

				// Schedule server update with current values from refs
				saveToServer(newSpaces, currentSites);

				return newSpaces;
			});
		},
		[saveToServer, broadcastChanges],
	);

	const toggleSiteFavorite = useCallback(
		(siteId: number) => {
			setFavoriteSites(prev => {
				const newSites = prev.includes(siteId) ? prev.filter(id => id !== siteId) : [...prev, siteId];

				// Use refs for latest values to avoid stale closures
				const currentSpaces = latestSpacesRef.current;
				const hash = latestHashRef.current;

				// Optimistic update to localStorage
				const prefs = { favoriteSpaces: currentSpaces, favoriteSites: newSites, hash };
				writeToStorage(prefs);
				broadcastChanges(prefs);

				// Schedule server update with current values from refs
				saveToServer(currentSpaces, newSites);

				return newSites;
			});
		},
		[saveToServer, broadcastChanges],
	);

	const isSpaceFavorite = useCallback(
		(spaceId: number): boolean => {
			return favoriteSpaces.includes(spaceId);
		},
		[favoriteSpaces],
	);

	const isSiteFavorite = useCallback(
		(siteId: number): boolean => {
			return favoriteSites.includes(siteId);
		},
		[favoriteSites],
	);

	return {
		favoriteSpaces,
		favoriteSites,
		isLoading,
		saveError,
		toggleSpaceFavorite,
		toggleSiteFavorite,
		isSpaceFavorite,
		isSiteFavorite,
	};
}
