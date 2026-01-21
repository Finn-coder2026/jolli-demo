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
 * Tenant context shape with available tenants and switcher state.
 */
interface TenantContextType {
	/** Whether the tenant switcher feature is enabled */
	useTenantSwitcher: boolean;
	/** Current tenant ID (null if not in multi-tenant mode) */
	currentTenantId: string | null;
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
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export interface TenantProviderProps {
	children: ReactNode;
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
		baseDomain,
		availableTenants,
		isLoading,
		error,
		refresh: loadTenantInfo,
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
