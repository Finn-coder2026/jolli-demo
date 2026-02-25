/**
 * OrgSwitcher - Component for switching between organizations in multi-tenant mode.
 *
 * Only renders when in multi-tenant mode. Displays the current org and provides
 * a dropdown to switch between available orgs.
 */

import { cn } from "../common/ClassNameUtils";
import { useClient } from "../contexts/ClientContext";
import { useOrg } from "../contexts/OrgContext";
import { useTenant } from "../contexts/TenantContext";
import { SimpleDropdown, SimpleDropdownItem, SimpleDropdownSeparator } from "./ui/SimpleDropdown";
import { TenantSelectionError } from "jolli-common";
import { Building2, Check, ChevronDown } from "lucide-react";
import type { ReactElement } from "react";

interface OrgSwitcherProps {
	/** Additional CSS classes to apply */
	className?: string;
	/** Whether to show the full org name or just the icon */
	compact?: boolean;
}

/**
 * Organization switcher component for multi-tenant deployments.
 *
 * Features:
 * - Shows current org name
 * - Dropdown with all available orgs
 * - Org switching calls /auth/tenants/select to rebuild JWT with new org context
 *
 * @example
 * ```tsx
 * <OrgSwitcher />
 * <OrgSwitcher compact />
 * ```
 */
export function OrgSwitcher({ className, compact = false }: OrgSwitcherProps): ReactElement | null {
	const client = useClient();
	const { tenant, org, availableOrgs, isMultiTenant, isLoading } = useOrg();
	const { currentTenantId } = useTenant();

	// Don't render anything if not in multi-tenant mode, still loading, or only one org
	if (!isMultiTenant || isLoading || availableOrgs.length <= 1) {
		return null;
	}

	function handleOrgSwitch(orgSlug: string, orgId: string): void {
		if (org?.id === orgId) {
			return; // Already on this org
		}

		/* v8 ignore next 4 - defensive check: currentTenantId always exists when component renders */
		if (!currentTenantId) {
			console.error("Cannot switch org: no current tenant");
			return;
		}

		// Store the selected org slug in session storage (backward compatibility)
		sessionStorage.setItem("selectedOrgSlug", orgSlug);

		// Rebuild authToken with same tenant but new org
		client
			.auth()
			.selectTenant(currentTenantId, orgId)
			.then(result => {
				if (result.success) {
					// When switching orgs within same tenant, URL may be the same
					// Add a timestamp to force navigation and ensure cookie is set
					const resultUrlNormalized = result.url.split("?")[0];
					const currentUrlNormalized = window.location.href.split("?")[0];
					const isSameUrl = resultUrlNormalized === currentUrlNormalized;

					/* v8 ignore next 8 - browser navigation code, tested via integration tests */
					if (isSameUrl) {
						// Add timestamp to force full navigation and cookie processing
						const separator = result.url.includes("?") ? "&" : "?";
						window.location.href = `${result.url}${separator}_t=${Date.now()}`;
					} else {
						window.location.href = result.url;
					}
				}
			})
			/* v8 ignore next 6 - error handling for network failures and inactive users */
			.catch(error => {
				if (error instanceof TenantSelectionError && error.code === "user_inactive") {
					window.location.href = "/login?error=user_inactive";
					return;
				}
				console.error("Failed to switch org:", error);
			});
	}

	const trigger = (
		<button
			type="button"
			className={cn(
				"flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
				"hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				className,
			)}
			data-testid="org-switcher-trigger"
		>
			<Building2 className="h-4 w-4" />
			{!compact && <span className="max-w-[150px] truncate">{org?.displayName}</span>}
			<ChevronDown className="h-4 w-4 opacity-50" />
		</button>
	);

	return (
		<SimpleDropdown trigger={trigger} align="start">
			{/* Tenant name header */}
			<div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">{tenant?.displayName}</div>
			<SimpleDropdownSeparator />

			{/* Org list */}
			{availableOrgs.map(availableOrg => (
				<SimpleDropdownItem
					key={availableOrg.id}
					onClick={() => handleOrgSwitch(availableOrg.slug, availableOrg.id)}
					className="justify-between"
				>
					<span className="truncate">{availableOrg.displayName}</span>
					{org?.id === availableOrg.id && <Check className="h-4 w-4 ml-2 flex-shrink-0" />}
				</SimpleDropdownItem>
			))}

			{/* v8 ignore start -- unreachable: component returns null when availableOrgs.length <= 1 */}
			{availableOrgs.length === 0 && (
				<div className="px-2 py-1.5 text-sm text-muted-foreground">No organizations available</div>
			)}
			{/* v8 ignore stop */}
		</SimpleDropdown>
	);
}
