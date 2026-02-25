/**
 * OrgTenantSelector - Combined organization and tenant selector for the unified sidebar.
 *
 * Displays current org/tenant and provides a dropdown to switch between them.
 * Adapts to both single-tenant and multi-tenant modes.
 * Supports collapsed state showing only an icon.
 */

import { cn } from "../../common/ClassNameUtils";
import { SimpleDropdown, SimpleDropdownItem, SimpleDropdownSeparator } from "../../components/ui/SimpleDropdown";
import { useClient } from "../../contexts/ClientContext";
import { useOrg } from "../../contexts/OrgContext";
import { useTenant } from "../../contexts/TenantContext";
import { saveLastAccessedTenant } from "../../util/AuthCookieUtil";
import type { TenantListItem } from "jolli-common";
import { TenantSelectionError } from "jolli-common";
import { Building2, Check, ChevronsUpDown, ExternalLink, Globe } from "lucide-react";
import type { ReactElement } from "react";
import { useIntlayer } from "react-intlayer";

export interface OrgTenantSelectorProps {
	/** Whether to show collapsed state (icon only) */
	collapsed?: boolean;
	/** Additional CSS classes to apply */
	className?: string;
}

/**
 * Computes the URL for a tenant based on its domain info.
 */
function getTenantUrl(tenant: TenantListItem, baseDomain: string | null): string {
	const isLocalhost = typeof window !== "undefined" && window.location.hostname === "localhost";
	const protocol = isLocalhost ? window.location.protocol : "https:";

	if (tenant.primaryDomain) {
		return `${protocol}//${tenant.primaryDomain}`;
	}
	if (baseDomain) {
		return `${protocol}//${tenant.slug}.${baseDomain}`;
	}
	return window.location.origin;
}

/**
 * Combined org/tenant selector component for the unified sidebar.
 *
 * Features:
 * - Shows current org and tenant (in multi-tenant mode)
 * - Dropdown with available orgs and tenants
 * - Supports switching between orgs and tenants
 * - Collapsed state shows just icon
 * - Ctrl/Cmd+click to open tenant in new tab
 *
 * @example
 * ```tsx
 * <OrgTenantSelector />
 * <OrgTenantSelector collapsed />
 * ```
 */
export function OrgTenantSelector({ collapsed = false, className }: OrgTenantSelectorProps): ReactElement {
	const client = useClient();
	const { tenant: orgTenant, org, availableOrgs, isMultiTenant, isLoading: orgLoading } = useOrg();
	const { useTenantSwitcher, currentTenantId, baseDomain, availableTenants, isLoading: tenantLoading } = useTenant();

	const content = useIntlayer("org-tenant-selector");

	const isLoading = orgLoading || tenantLoading;

	// Determine what to display
	const hasMultipleOrgs = isMultiTenant && availableOrgs.length > 1;
	const hasMultipleTenants = useTenantSwitcher && availableTenants.length > 1;
	const showDropdown = hasMultipleOrgs || hasMultipleTenants;

	// Resolve tenant ID: prefer TenantContext (tenant switcher), fall back to OrgContext
	const effectiveTenantId = currentTenantId || orgTenant?.id || null;

	// Find current tenant for display
	const currentTenant = availableTenants.find(t => t.id === effectiveTenantId);

	// Determine display text and icon
	// Priority: tenant name from switcher list > tenant name from org context > org name
	const displayText = currentTenant?.displayName || orgTenant?.displayName || org?.displayName;
	const Icon = isMultiTenant ? Building2 : Globe;

	/**
	 * Handles switching to a different organization.
	 */
	function handleOrgSwitch(orgSlug: string, orgId: string): void {
		if (org?.id === orgId) {
			return;
		}

		if (!effectiveTenantId) {
			console.error("Cannot switch org: no current tenant");
			return;
		}

		// Store the selected org slug in session storage (backward compatibility)
		sessionStorage.setItem("selectedOrgSlug", orgSlug);

		// Rebuild authToken with same tenant but new org
		client
			.auth()
			.selectTenant(effectiveTenantId, orgId)
			.then(result => {
				if (result.success) {
					// Save last accessed tenant/org to cookie
					saveLastAccessedTenant(effectiveTenantId, orgId);

					// When switching orgs within same tenant, URL may be the same
					// Add a timestamp to force navigation and ensure cookie is set
					const resultUrlNormalized = result.url.split("?")[0];
					const currentUrlNormalized = window.location.href.split("?")[0];
					const isSameUrl = resultUrlNormalized === currentUrlNormalized;

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

	/**
	 * Handles clicking on a tenant to navigate to it.
	 */
	function handleTenantClick(tenant: TenantListItem): void {
		if (tenant.id === effectiveTenantId) {
			return;
		}

		// Rebuild authToken with new tenant/org before navigating
		client
			.auth()
			.selectTenant(tenant.id, tenant.defaultOrgId)
			.then(result => {
				if (result.success) {
					// Save last accessed tenant/org to cookie
					saveLastAccessedTenant(tenant.id, tenant.defaultOrgId);

					// When switching tenants, URL should be different, but check anyway
					const resultUrlNormalized = result.url.split("?")[0];
					const currentUrlNormalized = window.location.href.split("?")[0];
					const isSameUrl = resultUrlNormalized === currentUrlNormalized;

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
				console.error("Failed to switch tenant:", error);
			});
	}

	/**
	 * Handles opening a tenant in a new tab.
	 */
	function handleOpenInNewTab(tenant: TenantListItem): void {
		const url = getTenantUrl(tenant, baseDomain);
		window.open(url, "_blank");
	}

	if (isLoading) {
		return (
			<div
				className={cn(
					"flex items-center gap-2 rounded-md px-2 py-1.5 animate-pulse",
					collapsed ? "justify-center" : "",
					className,
				)}
				data-testid="org-tenant-selector-loading"
			>
				<div className="flex h-6 w-6 items-center justify-center rounded bg-sidebar-accent">
					<Icon className="h-3.5 w-3.5 opacity-50" />
				</div>
			</div>
		);
	}

	// If no dropdown needed, just show the current org/tenant
	if (!showDropdown) {
		return (
			<div
				className={cn(
					"flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-semibold",
					collapsed && "justify-center",
					className,
				)}
				data-testid="org-tenant-selector-static"
			>
				<div className="flex h-6 w-6 items-center justify-center rounded bg-sidebar-accent shrink-0">
					<Icon className="h-3.5 w-3.5" />
				</div>
				{!collapsed && (
					<span className="truncate text-sidebar-foreground" data-testid="org-tenant-selector-display-text">
						{displayText}
					</span>
				)}
			</div>
		);
	}

	const trigger = (
		<button
			type="button"
			className={cn(
				"flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-semibold transition-colors",
				"hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				collapsed && "justify-center",
				className,
			)}
			data-testid="org-tenant-selector-trigger"
		>
			<div className="flex h-6 w-6 items-center justify-center rounded bg-sidebar-accent shrink-0">
				<Icon className="h-3.5 w-3.5" />
			</div>
			{!collapsed && (
				<>
					<span
						className="flex-1 truncate text-left text-sidebar-foreground"
						data-testid="org-tenant-selector-trigger-text"
					>
						{displayText}
					</span>
					<ChevronsUpDown className="h-4 w-4 ml-auto opacity-50 shrink-0" data-testid="chevrons-icon" />
				</>
			)}
		</button>
	);

	return (
		<div className="w-full" data-testid="org-tenant-selector">
			<SimpleDropdown trigger={trigger} align="start" className="w-[240px]">
				{/* Organizations section (if multi-tenant and multiple orgs) */}
				{hasMultipleOrgs && (
					<>
						<div
							className="px-2 py-1.5 text-xs font-semibold text-muted-foreground"
							data-testid="org-tenant-selector-orgs-header"
						>
							{content.organizations.value}
						</div>
						<SimpleDropdownSeparator />
						{availableOrgs.map(availableOrg => (
							<SimpleDropdownItem
								key={availableOrg.id}
								onClick={() => handleOrgSwitch(availableOrg.slug, availableOrg.id)}
								className="justify-between"
								data-testid={`org-item-${availableOrg.slug}`}
							>
								<span className="truncate">{availableOrg.displayName}</span>
								{org?.id === availableOrg.id && <Check className="h-4 w-4 ml-2 flex-shrink-0" />}
							</SimpleDropdownItem>
						))}
					</>
				)}

				{/* Separator between sections if both exist */}
				{hasMultipleOrgs && hasMultipleTenants && <SimpleDropdownSeparator />}

				{/* Tenants section (if tenant switcher enabled and multiple tenants) */}
				{hasMultipleTenants && (
					<>
						<div
							className="px-2 py-1.5 text-xs font-semibold text-muted-foreground"
							data-testid="org-tenant-selector-tenants-header"
						>
							{content.tenants.value}
						</div>
						<SimpleDropdownSeparator />
						{availableTenants.map(tenant => (
							<SimpleDropdownItem
								key={tenant.id}
								onClick={() => handleTenantClick(tenant)}
								className="justify-between group"
								data-testid={`tenant-item-${tenant.slug}`}
							>
								<span className="flex items-center gap-2 truncate">
									{effectiveTenantId === tenant.id && <Check className="h-4 w-4 flex-shrink-0" />}
									{effectiveTenantId !== tenant.id && <span className="w-4" />}
									<span className="truncate">{tenant.displayName}</span>
								</span>
								{/* External link button - only show for non-current tenants */}
								{effectiveTenantId !== tenant.id && (
									<button
										type="button"
										onClick={e => {
											e.stopPropagation();
											handleOpenInNewTab(tenant);
										}}
										className="ml-2 p-1 rounded hover:bg-accent opacity-0 group-hover:opacity-100 transition-opacity"
										title={content.openInNewTab.value}
										data-testid={`tenant-open-new-tab-${tenant.slug}`}
									>
										<ExternalLink className="h-3 w-3" />
									</button>
								)}
							</SimpleDropdownItem>
						))}
					</>
				)}
			</SimpleDropdown>
		</div>
	);
}
