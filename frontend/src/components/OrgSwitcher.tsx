/**
 * OrgSwitcher - Component for switching between organizations in multi-tenant mode.
 *
 * Only renders when in multi-tenant mode. Displays the current org and provides
 * a dropdown to switch between available orgs.
 */

import { cn } from "../common/ClassNameUtils";
import { useOrg } from "../contexts/OrgContext";
import { SimpleDropdown, SimpleDropdownItem, SimpleDropdownSeparator } from "./ui/SimpleDropdown";
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
 * - Org switching triggers page reload to ensure fresh data
 *
 * @example
 * ```tsx
 * <OrgSwitcher />
 * <OrgSwitcher compact />
 * ```
 */
export function OrgSwitcher({ className, compact = false }: OrgSwitcherProps): ReactElement | null {
	const { tenant, org, availableOrgs, isMultiTenant, isLoading } = useOrg();

	// Don't render anything if not in multi-tenant mode, still loading, or only one org
	if (!isMultiTenant || isLoading || availableOrgs.length <= 1) {
		return null;
	}

	function handleOrgSwitch(orgSlug: string): void {
		if (org?.slug === orgSlug) {
			return; // Already on this org
		}

		// Store the selected org in session storage for the middleware to pick up
		sessionStorage.setItem("selectedOrgSlug", orgSlug);

		// Reload the page to apply the org change
		window.location.reload();
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
					onClick={() => handleOrgSwitch(availableOrg.slug)}
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
