/**
 * PreferencesContext - React context provider for the preferences service.
 *
 * Provides access to the centralized preferences service with tenant-aware
 * key generation. Must be used within an OrgProvider.
 */

import { localStorageBackend, PREFERENCES, PreferencesService, type TenantContext } from "../services/preferences";
import { useOrg } from "./OrgContext";
import { createContext, type ReactElement, type ReactNode, useContext, useEffect, useMemo, useRef } from "react";

/**
 * PreferencesContext provides access to the preferences service instance.
 */
interface PreferencesContextType {
	/** The preferences service instance */
	service: PreferencesService;
	/** Key that changes when tenant context changes, used to trigger re-reads */
	contextKey: string;
}

const PreferencesContext = createContext<PreferencesContextType | undefined>(undefined);

export interface PreferencesProviderProps {
	children: ReactNode;
}

/**
 * Provider component that creates and provides the preferences service to children.
 *
 * Must be placed inside OrgProvider to access tenant/org context.
 *
 * @example
 * ```tsx
 * <OrgProvider>
 *   <PreferencesProvider>
 *     <ThemeProvider>
 *       <App />
 *     </ThemeProvider>
 *   </PreferencesProvider>
 * </OrgProvider>
 * ```
 */
export function PreferencesProvider({ children }: PreferencesProviderProps): ReactElement {
	const { tenant, org, isMultiTenant } = useOrg();

	// Build tenant context from org context
	const tenantContext: TenantContext = useMemo(
		() => ({
			isMultiTenant,
			tenantSlug: tenant?.slug ?? null,
			orgSlug: org?.slug ?? null,
		}),
		[isMultiTenant, tenant?.slug, org?.slug],
	);

	// Create service instance once, then update its context as needed
	const serviceRef = useRef<PreferencesService | null>(null);

	if (!serviceRef.current) {
		serviceRef.current = new PreferencesService(localStorageBackend, tenantContext);
	}

	// Update tenant context synchronously on every render to ensure it's current
	// before any child components access the service
	serviceRef.current.setTenantContext(tenantContext);

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			serviceRef.current?.destroy();
		};
	}, []);

	// Create a context key that changes when tenant context changes
	// This is used by usePreference to know when to re-read values
	const contextKey = useMemo(
		() => `${isMultiTenant ? "mt" : "st"}:${tenant?.slug ?? ""}:${org?.slug ?? ""}`,
		[isMultiTenant, tenant?.slug, org?.slug],
	);

	const value: PreferencesContextType = useMemo(
		() => ({
			service: serviceRef.current as PreferencesService,
			contextKey,
		}),
		[contextKey],
	);

	return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

/**
 * Hook to access the preferences context.
 *
 * @returns The preferences context with service and context key
 * @throws Error if used outside of PreferencesProvider
 */
function usePreferencesContext(): PreferencesContextType {
	const context = useContext(PreferencesContext);
	if (context === undefined) {
		throw new Error("usePreferencesService must be used within a PreferencesProvider");
	}
	return context;
}

/**
 * Hook to access the preferences service.
 *
 * @returns The preferences service instance
 * @throws Error if used outside of PreferencesProvider
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const service = usePreferencesService();
 *   const theme = service.get(PREFERENCES.theme);
 *   return <div>Current theme: {theme}</div>;
 * }
 * ```
 */
export function usePreferencesService(): PreferencesService {
	return usePreferencesContext().service;
}

/**
 * Hook to access the context key that changes when tenant context changes.
 * Used internally by usePreference to trigger re-reads.
 */
export function usePreferencesContextKey(): string {
	return usePreferencesContext().contextKey;
}

// Re-export PREFERENCES for convenience
export { PREFERENCES };
