/**
 * TenantSwitcher - Component for switching between tenants.
 *
 * Only renders when USE_TENANT_SWITCHER is enabled and there are multiple tenants.
 * Displays the current tenant and provides a dropdown to switch between available tenants.
 * Supports opening tenant in new tab via Ctrl/Cmd+click or external link icon.
 */

import { cn } from "../common/ClassNameUtils";
import { useTenant } from "../contexts/TenantContext";
import { SimpleDropdown, SimpleDropdownItem, SimpleDropdownSeparator } from "./ui/SimpleDropdown";
import type { TenantListItem } from "jolli-common";
import { Check, ChevronDown, ExternalLink, Globe } from "lucide-react";
import type { ReactElement } from "react";
import { useIntlayer } from "react-intlayer";

interface TenantSwitcherProps {
	/** Additional CSS classes to apply */
	className?: string;
	/** Whether to show the full tenant name or just the icon */
	compact?: boolean;
}

/**
 * Computes the URL for a tenant based on its domain info.
 *
 * @param tenant - The tenant to get the URL for
 * @param baseDomain - The base domain for constructing subdomain URLs
 * @returns The full URL to the tenant
 */
function getTenantUrl(tenant: TenantListItem, baseDomain: string | null): string {
	// Use HTTPS for production, but handle localhost for development
	const isLocalhost = typeof window !== "undefined" && window.location.hostname === "localhost";
	const protocol = isLocalhost ? window.location.protocol : "https:";

	if (tenant.primaryDomain) {
		return `${protocol}//${tenant.primaryDomain}`;
	}
	if (baseDomain) {
		return `${protocol}//${tenant.slug}.${baseDomain}`;
	}
	// Fallback for local development - stay on same origin
	return window.location.origin;
}

/**
 * Tenant switcher component for multi-tenant deployments.
 *
 * Features:
 * - Shows current tenant name
 * - Dropdown with all available tenants
 * - Click to navigate to tenant in same tab
 * - Ctrl/Cmd+click to open in new tab
 * - External link icon to open in new tab
 *
 * @example
 * ```tsx
 * <TenantSwitcher />
 * <TenantSwitcher compact />
 * ```
 */
export function TenantSwitcher({ className, compact = false }: TenantSwitcherProps): ReactElement | null {
	const { useTenantSwitcher, currentTenantId, baseDomain, availableTenants, isLoading } = useTenant();
	const { switchTenant, openInNewTab } = useIntlayer("tenant-switcher");

	// Don't render if tenant switcher is disabled, still loading, or only one tenant
	if (!useTenantSwitcher || isLoading || availableTenants.length <= 1) {
		return null;
	}

	// Find current tenant for display
	const currentTenant = availableTenants.find(t => t.id === currentTenantId);

	/**
	 * Handles clicking on a tenant item to navigate to it.
	 */
	function handleTenantClick(tenant: TenantListItem): void {
		// Don't navigate if clicking on current tenant
		if (tenant.id === currentTenantId) {
			return;
		}

		const url = getTenantUrl(tenant, baseDomain);
		window.location.href = url;
	}

	/**
	 * Handles clicking the external link icon to open tenant in new tab.
	 */
	function handleOpenInNewTab(tenant: TenantListItem): void {
		const url = getTenantUrl(tenant, baseDomain);
		window.open(url, "_blank");
	}

	const trigger = (
		<button
			type="button"
			className={cn(
				"flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
				"hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				className,
			)}
			data-testid="tenant-switcher-trigger"
		>
			<Globe className="h-4 w-4" />
			{!compact && <span className="max-w-[150px] truncate">{currentTenant?.displayName ?? switchTenant}</span>}
			<ChevronDown className="h-4 w-4 opacity-50" />
		</button>
	);

	return (
		<SimpleDropdown trigger={trigger} align="start">
			{/* Header */}
			<div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">{switchTenant}</div>
			<SimpleDropdownSeparator />

			{/* Tenant list */}
			{availableTenants.map(tenant => (
				<SimpleDropdownItem
					key={tenant.id}
					onClick={() => handleTenantClick(tenant)}
					className="justify-between group"
				>
					<span className="flex items-center gap-2 truncate">
						{currentTenantId === tenant.id && <Check className="h-4 w-4 flex-shrink-0" />}
						{currentTenantId !== tenant.id && <span className="w-4" />}
						<span className="truncate">{tenant.displayName}</span>
					</span>
					{/* External link button - only show for non-current tenants */}
					{currentTenantId !== tenant.id && (
						<button
							type="button"
							onClick={e => {
								e.stopPropagation();
								handleOpenInNewTab(tenant);
							}}
							className="ml-2 p-1 rounded hover:bg-accent opacity-0 group-hover:opacity-100 transition-opacity"
							title={openInNewTab.value}
							data-testid={`tenant-open-new-tab-${tenant.slug}`}
						>
							<ExternalLink className="h-3 w-3" />
						</button>
					)}
				</SimpleDropdownItem>
			))}
		</SimpleDropdown>
	);
}
