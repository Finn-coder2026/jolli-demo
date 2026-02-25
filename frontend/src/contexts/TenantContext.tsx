/**
 * TenantContext - Context provider for tenant switcher functionality.
 *
 * Provides access to the list of available tenants and the current tenant.
 * Only active when USE_TENANT_SWITCHER is enabled in the backend config.
 */

import { useClient } from "./ClientContext";
import type { TenantListItem, TenantListResponse } from "jolli-common";
import { createContext, type ReactElement, type ReactNode, useContext, useEffect, useState } from "react";

/**
 * URL mode for the current access pattern.
 * - 'path': Path-based multi-tenancy (e.g., jolli.ai/tenant/dashboard)
 * - 'subdomain': Subdomain-based (e.g., tenant.jolli.ai/dashboard)
 * - 'custom': Custom domain (e.g., docs.acme.com/dashboard)
 */
export type UrlMode = "path" | "subdomain" | "custom";

/**
 * Tenant context shape with available tenants and switcher state.
 */
interface TenantContextType {
	/** Whether the tenant switcher feature is enabled */
	useTenantSwitcher: boolean;
	/** Current tenant ID (null if not in multi-tenant mode) */
	currentTenantId: string | null;
	/** Current tenant slug extracted from URL */
	currentTenantSlug: string | null;
	/** Base domain for constructing subdomain URLs */
	baseDomain: string | null;
	/** List of available tenants */
	availableTenants: Array<TenantListItem>;
	/** Whether tenant data is currently loading */
	isLoading: boolean;
	/** Error message if fetching tenant data failed */
	error: string | undefined;
	/** Refresh tenant data from the server */
	refresh: () => Promise<void>;
	/** Current URL mode (path/subdomain/custom) */
	urlMode: UrlMode;
	/** Whether the current domain is a custom domain */
	isCustomDomain: boolean;
	/** Whether the current domain is a subdomain */
	isSubdomain: boolean;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export interface TenantProviderProps {
	children: ReactNode;
}

/**
 * Detect if the current hostname is a subdomain of the base domain.
 */
function isSubdomainOf(hostname: string, baseDomain: string | null): boolean {
	if (!baseDomain) {
		return false;
	}
	return hostname !== baseDomain && hostname.endsWith(`.${baseDomain}`);
}

/**
 * Detect if the current hostname is a custom domain (not base domain or subdomain).
 */
function isCustomDomainOf(hostname: string, baseDomain: string | null): boolean {
	if (!baseDomain) {
		return false;
	}
	return hostname !== baseDomain && !hostname.endsWith(`.${baseDomain}`);
}

/**
 * Extract tenant slug from URL based on the current domain type.
 * - Custom domain: returns null (tenant resolved by backend via domain lookup)
 * - Subdomain: extracts from subdomain (e.g., "acme" from "acme.jolli.ai")
 * - Path-based: extracts from first path segment (e.g., "acme" from "/acme/dashboard")
 */
function extractTenantSlugFromUrl(hostname: string, pathname: string, baseDomain: string | null): string | null {
	if (!baseDomain) {
		return null;
	}

	// Custom domain: tenant resolved by backend
	if (isCustomDomainOf(hostname, baseDomain)) {
		return null;
	}

	// Subdomain: extract from hostname
	if (isSubdomainOf(hostname, baseDomain)) {
		const suffix = `.${baseDomain}`;
		const prefix = hostname.slice(0, -suffix.length);
		const parts = prefix.split(".");
		// Return the last part (tenant slug)
		return parts[parts.length - 1];
	}

	// Path-based: extract from first path segment
	const segments = pathname.split("/").filter(Boolean);
	if (segments.length > 0) {
		return segments[0];
	}

	return null;
}

/**
 * Provider component that fetches and provides tenant context to children.
 *
 * @example
 * ```tsx
 * <ClientProvider>
 *   <TenantProvider>
 *     <App />
 *   </TenantProvider>
 * </ClientProvider>
 * ```
 */
export function TenantProvider({ children }: TenantProviderProps): ReactElement {
	const client = useClient();
	const [useTenantSwitcher, setUseTenantSwitcher] = useState(false);
	const [currentTenantId, setCurrentTenantId] = useState<string | null>(null);
	const [baseDomain, setBaseDomain] = useState<string | null>(null);
	const [availableTenants, setAvailableTenants] = useState<Array<TenantListItem>>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | undefined>(undefined);

	// Detect domain type and URL mode
	const hostname = window.location.hostname;
	const pathname = window.location.pathname;

	const isCustomDomain = isCustomDomainOf(hostname, baseDomain);
	const isSubdomain = isSubdomainOf(hostname, baseDomain);
	const currentTenantSlug = extractTenantSlugFromUrl(hostname, pathname, baseDomain);

	// Determine URL mode
	let urlMode: UrlMode;
	if (isCustomDomain) {
		urlMode = "custom";
	} else if (isSubdomain) {
		urlMode = "subdomain";
	} else {
		urlMode = "path";
	}

	async function loadTenantInfo(): Promise<void> {
		try {
			setIsLoading(true);
			setError(undefined);
			const response: TenantListResponse = await client.tenants().listTenants();
			setUseTenantSwitcher(response.useTenantSwitcher);
			setCurrentTenantId(response.currentTenantId);
			setBaseDomain(response.baseDomain);
			setAvailableTenants(response.tenants);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load tenant info");
		} finally {
			setIsLoading(false);
		}
	}

	useEffect(() => {
		loadTenantInfo().then();
	}, [client]);

	const value: TenantContextType = {
		useTenantSwitcher,
		currentTenantId,
		currentTenantSlug,
		baseDomain,
		availableTenants,
		isLoading,
		error,
		refresh: loadTenantInfo,
		urlMode,
		isCustomDomain,
		isSubdomain,
	};

	return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

/**
 * Hook to access the tenant context.
 *
 * @returns The tenant context with available tenants and switcher state
 * @throws Error if used outside of TenantProvider
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { useTenantSwitcher, availableTenants } = useTenant();
 *   if (useTenantSwitcher && availableTenants.length > 1) {
 *     return <TenantSwitcher />;
 *   }
 *   return null;
 * }
 * ```
 */
export function useTenant(): TenantContextType {
	const context = useContext(TenantContext);
	if (context === undefined) {
		throw new Error("useTenant must be used within a TenantProvider");
	}
	return context;
}

/**
 * Hook to access available tenants for tenant switching.
 *
 * @returns Array of available tenants
 * @throws Error if used outside of TenantProvider
 */
export function useAvailableTenants(): Array<TenantListItem> {
	const context = useTenant();
	return context.availableTenants;
}

/**
 * Hook to get URL builder configuration from tenant context.
 * Use this with the UrlBuilder utility class to generate URLs.
 *
 * @returns UrlBuilder configuration object
 * @throws Error if used outside of TenantProvider
 *
 * @example
 * ```tsx
 * import { createUrlBuilder } from "../util/UrlBuilder";
 * import { useUrlBuilderConfig } from "../contexts/TenantContext";
 *
 * function MyComponent() {
 *   const config = useUrlBuilderConfig();
 *   const urlBuilder = createUrlBuilder(config);
 *   const dashboardUrl = urlBuilder.buildUrl('/dashboard');
 *   return <a href={dashboardUrl}>Dashboard</a>;
 * }
 * ```
 */
export function useUrlBuilderConfig() {
	const context = useTenant();
	return {
		urlMode: context.urlMode,
		tenantSlug: context.currentTenantSlug,
		baseDomain: context.baseDomain,
		isCustomDomain: context.isCustomDomain,
		isSubdomain: context.isSubdomain,
	};
}
