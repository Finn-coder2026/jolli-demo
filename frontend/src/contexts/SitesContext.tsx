/**
 * SitesContext - Context provider for managing sites (docsites).
 *
 * Provides:
 * - Current site information
 * - List of available sites
 * - Favorite sites tracking
 * - Actions to manage sites
 */

import { useUserPreferences } from "../hooks/useUserPreferences";
import { getLog } from "../util/Logger";
import { useClient } from "./ClientContext";
import type { SiteWithUpdate } from "jolli-common";
import {
	createContext,
	type ReactElement,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

const log = getLog(import.meta);

/**
 * Context type for site management.
 */
export interface SitesContextType {
	/** Current site (undefined while loading or if no site selected) */
	currentSite: SiteWithUpdate | undefined;
	/** List of all available sites */
	sites: Array<SiteWithUpdate>;
	/** Array of favorite site IDs */
	favoriteSites: Array<number>;
	/** Whether site data is loading */
	isLoading: boolean;
	/** Error message if loading failed */
	error: string | undefined;
	/** Set the current site by ID */
	setCurrentSite: (siteId: number | undefined) => void;
	/** Refresh the site list */
	refreshSites: () => Promise<void>;
	/** Toggle a site as favorite */
	toggleSiteFavorite: (siteId: number) => void;
	/** Check if a site is favorited */
	isFavorite: (siteId: number) => boolean;
}

const SitesContext = createContext<SitesContextType | undefined>(undefined);

export interface SitesProviderProps {
	children: ReactNode;
}

/**
 * Provider component for sites context.
 * Manages the site list and provides methods to manage sites.
 */
export function SitesProvider({ children }: SitesProviderProps): ReactElement {
	const client = useClient();
	// favoriteSites now uses database-backed storage with cross-device sync
	const { favoriteSites, toggleSiteFavorite, isSiteFavorite } = useUserPreferences();
	const [currentSite, setCurrentSiteState] = useState<SiteWithUpdate | undefined>(undefined);
	const [sites, setSites] = useState<Array<SiteWithUpdate>>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | undefined>(undefined);
	const isInitialized = useRef(false);

	// Load sites on mount
	const loadSites = useCallback(async () => {
		try {
			setIsLoading(true);
			setError(undefined);

			// Load all sites
			const allSites = await client.sites().listSites();
			setSites(allSites);
		} catch (err) {
			log.error(err, "Failed to load sites.");
			setError(err instanceof Error ? err.message : "Failed to load sites");
		} finally {
			setIsLoading(false);
		}
	}, [client]);

	// Load on mount only
	useEffect(() => {
		if (!isInitialized.current) {
			isInitialized.current = true;
			loadSites();
		}
	}, [loadSites]);

	const setCurrentSite = useCallback(
		(siteId: number | undefined) => {
			if (siteId === undefined) {
				setCurrentSiteState(undefined);
				return;
			}

			const targetSite = sites.find(s => s.id === siteId);
			if (targetSite) {
				setCurrentSiteState(targetSite);
			} else {
				log.warn("Site %d not found in list.", siteId);
				setCurrentSiteState(undefined);
			}
		},
		[sites],
	);

	const refreshSites = useCallback(async () => {
		try {
			const allSites = await client.sites().listSites();
			setSites(allSites);
			// Update current site if it's in the list
			if (currentSite) {
				const updatedSite = allSites.find(s => s.id === currentSite.id);
				setCurrentSiteState(updatedSite);
			}
		} catch (err) {
			log.error(err, "Failed to refresh sites.");
		}
	}, [client, currentSite]);

	// toggleSiteFavorite and isSiteFavorite are provided by useUserPreferences hook
	// isFavorite is an alias for isSiteFavorite for backwards compatibility
	const isFavorite = isSiteFavorite;

	const value = useMemo<SitesContextType>(
		() => ({
			currentSite,
			sites,
			favoriteSites,
			isLoading,
			error,
			setCurrentSite,
			refreshSites,
			toggleSiteFavorite,
			isFavorite,
		}),
		[
			currentSite,
			sites,
			favoriteSites,
			isLoading,
			error,
			setCurrentSite,
			refreshSites,
			toggleSiteFavorite,
			isFavorite,
		],
	);

	return <SitesContext.Provider value={value}>{children}</SitesContext.Provider>;
}

/**
 * Hook to access the sites context.
 * Must be used within a SitesProvider.
 */
export function useSites(): SitesContextType {
	const context = useContext(SitesContext);
	if (context === undefined) {
		throw new Error("useSites must be used within a SitesProvider");
	}
	return context;
}

/**
 * Hook to get just the current site.
 * Convenience wrapper around useSites().
 */
export function useCurrentSite(): SiteWithUpdate | undefined {
	const { currentSite } = useSites();
	return currentSite;
}
