/**
 * PermissionGuard - Component to conditionally render children based on permissions.
 *
 * Use this component to wrap UI elements that should only be visible to users
 * with specific permissions.
 */

import { usePermissions } from "../contexts/PermissionContext";
import type { ReactElement, ReactNode } from "react";

export interface PermissionGuardProps {
	/** Single permission or array of permissions to check */
	permissions: string | Array<string>;
	/** If true, user must have ALL permissions. If false, user needs ANY permission. Default: false */
	requireAll?: boolean;
	/** Content to render if user has required permissions */
	children: ReactNode;
	/** Optional fallback content when user lacks permissions */
	fallback?: ReactNode;
}

/**
 * Guard component that conditionally renders children based on user permissions.
 *
 * @example
 * ```tsx
 * // Single permission
 * <PermissionGuard permissions="users.invite">
 *   <InviteButton />
 * </PermissionGuard>
 *
 * // Multiple permissions (any)
 * <PermissionGuard permissions={["users.edit_other", "users.remove"]}>
 *   <UserActionsMenu />
 * </PermissionGuard>
 *
 * // Multiple permissions (all required)
 * <PermissionGuard permissions={["users.list", "users.invite"]} requireAll>
 *   <UserManagement />
 * </PermissionGuard>
 *
 * // With fallback
 * <PermissionGuard
 *   permissions="roles.manage"
 *   fallback={<span>You do not have permission to manage roles</span>}
 * >
 *   <RoleEditor />
 * </PermissionGuard>
 * ```
 */
export function PermissionGuard({
	permissions,
	requireAll = false,
	children,
	fallback = null,
}: PermissionGuardProps): ReactElement | null {
	const { hasPermission, hasAnyPermission, hasAllPermissions, isLoading } = usePermissions();

	// While loading, don't render anything (or show fallback)
	if (isLoading) {
		return fallback as ReactElement | null;
	}

	const permissionList = Array.isArray(permissions) ? permissions : [permissions];

	let hasAccess: boolean;
	if (permissionList.length === 1) {
		hasAccess = hasPermission(permissionList[0]);
	} else if (requireAll) {
		hasAccess = hasAllPermissions(...permissionList);
	} else {
		hasAccess = hasAnyPermission(...permissionList);
	}

	if (hasAccess) {
		return children as ReactElement;
	}

	return fallback as ReactElement | null;
}

/**
 * Higher-order component to wrap a component with permission check.
 *
 * @example
 * ```tsx
 * const ProtectedInviteButton = withPermission(InviteButton, 'users.invite');
 *
 * // Usage
 * <ProtectedInviteButton onClick={handleInvite} />
 * ```
 */
export function withPermission<P extends object>(
	Component: React.ComponentType<P>,
	permissions: string | Array<string>,
	requireAll = false,
): React.FC<P> {
	return function PermissionWrappedComponent(props: P) {
		return (
			<PermissionGuard permissions={permissions} requireAll={requireAll}>
				<Component {...props} />
			</PermissionGuard>
		);
	};
}
