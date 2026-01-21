/**
 * OrgContext - Context provider for multi-tenant org information.
 *
 * Provides access to the current tenant/org context and list of available orgs.
 * In single-tenant mode, returns null values gracefully.
 */

import { useClient } from "./ClientContext";
import type { CurrentOrgResponse, OrgSummary } from "jolli-common";
import { createContext, type ReactElement, type ReactNode, useContext, useEffect, useState } from "react";

/**
 * Org context shape with tenant info, current org, and available orgs.
 */
interface OrgContextType {
	/** Current tenant info (null if not in multi-tenant mode) */
	tenant: CurrentOrgResponse["tenant"] | null;
	/** Current org info (null if not in multi-tenant mode) */
	org: CurrentOrgResponse["org"] | null;
	/** List of available orgs for the current tenant */
	availableOrgs: Array<OrgSummary>;
	/** Whether org data is currently loading */
	isLoading: boolean;
	/** Error message if fetching org data failed */
	error: string | undefined;
	/** Whether we're in multi-tenant mode */
	isMultiTenant: boolean;
	/** Refresh org data from the server */
	refresh: () => Promise<void>;
}

const OrgContext = createContext<OrgContextType | undefined>(undefined);

export interface OrgProviderProps {
	children: ReactNode;
}

/**
 * Provider component that fetches and provides org context to children.
 *
 * @example
 * ```tsx
 * <ClientProvider>
 *   <OrgProvider>
 *     <App />
 *   </OrgProvider>
 * </ClientProvider>
 * ```
 */
export function OrgProvider({ children }: OrgProviderProps): ReactElement {
	const client = useClient();
	const [tenant, setTenant] = useState<CurrentOrgResponse["tenant"] | null>(null);
	const [org, setOrg] = useState<CurrentOrgResponse["org"] | null>(null);
	const [availableOrgs, setAvailableOrgs] = useState<Array<OrgSummary>>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | undefined>(undefined);

	async function loadOrgInfo(isRetry = false): Promise<void> {
		try {
			setIsLoading(true);
			setError(undefined);
			const response = await client.orgs().getCurrent();
			setTenant(response.tenant);
			setOrg(response.org);
			setAvailableOrgs(response.availableOrgs);
		} catch (err) {
			// If we have a selected org in session storage and this is not already a retry,
			// clear it and retry - the org may have been archived/deleted
			const selectedOrgSlug = sessionStorage.getItem("selectedOrgSlug");
			if (selectedOrgSlug && !isRetry) {
				sessionStorage.removeItem("selectedOrgSlug");
				// Retry without the invalid org slug
				return loadOrgInfo(true);
			}
			setError(err instanceof Error ? err.message : "Failed to load org info");
		} finally {
			setIsLoading(false);
		}
	}

	useEffect(() => {
		loadOrgInfo().then();
	}, [client]);

	const value: OrgContextType = {
		tenant,
		org,
		availableOrgs,
		isLoading,
		error,
		isMultiTenant: tenant !== null && org !== null,
		refresh: loadOrgInfo,
	};

	return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

/**
 * Hook to access the org context.
 *
 * @returns The org context with tenant, org, and available orgs info
 * @throws Error if used outside of OrgProvider
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { org, isMultiTenant } = useOrg();
 *   if (isMultiTenant) {
 *     return <div>Current org: {org?.displayName}</div>;
 *   }
 *   return <div>Single-tenant mode</div>;
 * }
 * ```
 */
export function useOrg(): OrgContextType {
	const context = useContext(OrgContext);
	if (context === undefined) {
		throw new Error("useOrg must be used within an OrgProvider");
	}
	return context;
}

/**
 * Hook to access available orgs for org switching.
 *
 * @returns Array of available orgs for the current tenant
 * @throws Error if used outside of OrgProvider
 *
 * @example
 * ```tsx
 * function OrgSwitcher() {
 *   const orgs = useAvailableOrgs();
 *   return (
 *     <Select>
 *       {orgs.map(org => (
 *         <Option key={org.id} value={org.slug}>
 *           {org.displayName}
 *         </Option>
 *       ))}
 *     </Select>
 *   );
 * }
 * ```
 */
export function useAvailableOrgs(): Array<OrgSummary> {
	const context = useOrg();
	return context.availableOrgs;
}
