/**
 * PermissionContext - Context provider for user permissions (RBAC).
 *
 * Provides access to the current user's permissions and helper functions
 * to check if the user has specific permissions.
 */

import { useClient } from "./ClientContext";
import type { RoleWithPermissions } from "jolli-common";
import { createContext, type ReactElement, type ReactNode, useCallback, useContext, useEffect, useState } from "react";

/**
 * Permission context shape with permissions and helper functions.
 */
interface PermissionContextType {
	/** List of permission slugs the current user has */
	permissions: Array<string>;
	/** Current user's role with permissions (if loaded) */
	role: RoleWithPermissions | null;
	/** Whether permission data is currently loading */
	isLoading: boolean;
	/** Error message if fetching permissions failed */
	error: string | undefined;
	/** Check if user has a specific permission */
	hasPermission: (permission: string) => boolean;
	/** Check if user has any of the specified permissions */
	hasAnyPermission: (...permissions: Array<string>) => boolean;
	/** Check if user has all of the specified permissions */
	hasAllPermissions: (...permissions: Array<string>) => boolean;
	/** Refresh permissions from the server */
	refresh: () => Promise<void>;
}

const PermissionContext = createContext<PermissionContextType | undefined>(undefined);

export interface PermissionProviderProps {
	children: ReactNode;
}

/**
 * Provider component that fetches and provides permission context to children.
 *
 * @example
 * ```tsx
 * <ClientProvider>
 *   <PermissionProvider>
 *     <App />
 *   </PermissionProvider>
 * </ClientProvider>
 * ```
 */
export function PermissionProvider({ children }: PermissionProviderProps): ReactElement {
	const client = useClient();
	const [permissions, setPermissions] = useState<Array<string>>([]);
	const [role, setRole] = useState<RoleWithPermissions | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | undefined>(undefined);

	const loadPermissions = useCallback(async (): Promise<void> => {
		try {
			setIsLoading(true);
			setError(undefined);
			const response = await client.roles().getCurrentUserPermissions();
			setPermissions(response.permissions);
			setRole(response.role);
		} catch (err) {
			console.error("[PermissionContext] Failed to load permissions:", err);
			setError(err instanceof Error ? err.message : "Failed to load permissions");
			// Set empty permissions on error to prevent blocking UI
			setPermissions([]);
			setRole(null);
		} finally {
			setIsLoading(false);
		}
	}, [client]);

	useEffect(() => {
		loadPermissions().then();
	}, [loadPermissions]);

	const hasPermission = useCallback(
		(permission: string): boolean => {
			/* v8 ignore next - defensive fallback, permissions is always an array */
			return (permissions || []).includes(permission);
		},
		[permissions],
	);

	const hasAnyPermission = useCallback(
		(...perms: Array<string>): boolean => {
			/* v8 ignore next - defensive fallback, permissions is always an array */
			return perms.some(p => (permissions || []).includes(p));
		},
		[permissions],
	);

	const hasAllPermissions = useCallback(
		(...perms: Array<string>): boolean => {
			/* v8 ignore next - defensive fallback, permissions is always an array */
			return perms.every(p => (permissions || []).includes(p));
		},
		[permissions],
	);

	const value: PermissionContextType = {
		permissions,
		role,
		isLoading,
		error,
		hasPermission,
		hasAnyPermission,
		hasAllPermissions,
		refresh: loadPermissions,
	};

	return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>;
}

/**
 * Hook to access the permission context.
 *
 * @returns The permission context with permissions and helper functions
 * @throws Error if used outside of PermissionProvider
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { hasPermission } = usePermissions();
 *   if (hasPermission('users.invite')) {
 *     return <InviteButton />;
 *   }
 *   return null;
 * }
 * ```
 */
export function usePermissions(): PermissionContextType {
	const context = useContext(PermissionContext);
	if (context === undefined) {
		throw new Error("usePermissions must be used within a PermissionProvider");
	}
	return context;
}

/**
 * Hook to check if the current user has a specific permission.
 *
 * @param permission - The permission slug to check
 * @returns True if the user has the permission
 * @throws Error if used outside of PermissionProvider
 *
 * @example
 * ```tsx
 * function InviteButton() {
 *   const canInvite = useHasPermission('users.invite');
 *   if (!canInvite) return null;
 *   return <Button>Invite User</Button>;
 * }
 * ```
 */
export function useHasPermission(permission: string): boolean {
	const { hasPermission } = usePermissions();
	return hasPermission(permission);
}

/**
 * Hook to check if the current user has any of the specified permissions.
 *
 * @param permissions - The permission slugs to check
 * @returns True if the user has any of the permissions
 * @throws Error if used outside of PermissionProvider
 *
 * @example
 * ```tsx
 * function UserActions() {
 *   const canManage = useHasAnyPermission('users.edit_other', 'users.remove');
 *   if (!canManage) return null;
 *   return <UserActionsMenu />;
 * }
 * ```
 */
export function useHasAnyPermission(...permissions: Array<string>): boolean {
	const { hasAnyPermission } = usePermissions();
	return hasAnyPermission(...permissions);
}
