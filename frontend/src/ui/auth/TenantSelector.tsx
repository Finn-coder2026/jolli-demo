import {
	clearEmailSelectionCookie,
	getLastAccessedTenant,
	type LastAccessedTenantInfo,
	saveLastAccessedTenant,
} from "../../util/AuthCookieUtil";
import { getLog } from "../../util/Logger";
import styles from "./TenantSelector.module.css";
import { type ReactElement, useEffect, useState } from "react";
import { useIntlayer } from "react-intlayer";

const log = getLog(import.meta);

interface Tenant {
	tenantId: string;
	orgId: string;
	tenantSlug: string; // Tenant slug
	tenantName: string; // Tenant display name
	orgSlug: string; // Organization slug
	orgName: string; // Organization display name
	role: string;
	isDefault: boolean;
	lastAccessedAt?: string;
	url: string; // Full URL to access this tenant
}

export function TenantSelector(): ReactElement {
	const [tenants, setTenants] = useState<Array<Tenant>>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [selectingTenant, setSelectingTenant] = useState(false);
	const [signingOut, setSigningOut] = useState(false);
	const [lastAccessedTenant] = useState<LastAccessedTenantInfo | null>(() => getLastAccessedTenant());
	const content = useIntlayer("tenantSelector");

	/** Check if tenant is the last accessed one */
	function isLastAccessed(tenant: Tenant): boolean {
		return (
			!!lastAccessedTenant &&
			tenant.tenantId === lastAccessedTenant.tenantId &&
			tenant.orgId === lastAccessedTenant.orgId
		);
	}

	/** Sign out and redirect to login page */
	async function handleSignOut() {
		setSigningOut(true);
		try {
			// Clear any pending email-selection state before switching account.
			clearEmailSelectionCookie();

			// Use the standard logout endpoint (same as client.logout() in jolli-common)
			await fetch("/api/auth/logout", {
				method: "POST",
				credentials: "include",
			});
			clearEmailSelectionCookie();
			window.location.href = "/login";
		} catch (err) {
			log.error(err, "Error signing out");
			setSigningOut(false);
		}
	}

	useEffect(() => {
		fetchTenants();
		// Note: auto-redirect for single tenant is handled in fetchTenants
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	async function fetchTenants() {
		try {
			log.debug("Fetching tenants from /api/auth/tenants");
			const response = await fetch("/api/auth/tenants", {
				credentials: "include",
			});

			log.debug({ status: response.status, statusText: response.statusText }, "Response status");

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({ error: "unknown" }));
				log.error({ status: response.status, errorData }, "Failed to fetch tenants");

				// If not authenticated (401), redirect to login page
				if (response.status === 401 || errorData.error === "not_authenticated") {
					log.debug("User not authenticated, redirecting to login");
					window.location.href = "/login";
					return;
				}

				setError(content.fetchError.value);
				setLoading(false);
				return;
			}

			const data = await response.json();
			const tenantList = data.tenants ?? [];
			log.debug({ tenants: tenantList }, "Fetched tenants");

			// Store tenants first, then attempt auto-select for single tenant
			// This ensures the tenant list is shown if auto-select fails (e.g., email not authorized)
			setTenants(tenantList);
			setLoading(false);

			// Auto-select if there is exactly one tenant
			if (tenantList.length === 1) {
				log.debug("Single tenant detected, attempting auto-select");
				await selectTenant(tenantList[0]);
				// If selectTenant returns without redirect, an error occurred and will be shown
			}
		} catch (err) {
			log.error(err, "Error fetching tenants");
			setError(content.fetchError.value);
			setLoading(false);
		}
	}

	async function selectTenant(tenant: Tenant) {
		try {
			setSelectingTenant(true);

			// Get redirect param from URL if present
			const params = new URLSearchParams(window.location.search);
			const redirectParam = params.get("redirect");

			// Call the API to regenerate token with tenant context
			const response = await fetch("/api/auth/tenants/select", {
				method: "POST",
				credentials: "include",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					tenantId: tenant.tenantId,
					orgId: tenant.orgId,
					...(redirectParam && { redirect: redirectParam }),
				}),
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({ error: "unknown" }));
				log.error({ status: response.status, errorData }, "Failed to select tenant");

				// If not authenticated (401), redirect to login page
				if (response.status === 401 || errorData.error === "not_authenticated") {
					log.debug("Session expired during tenant selection, redirecting to login");
					window.location.href = "/login";
					return;
				}

				// Redirect to login with error for inactive users
				if (errorData.error === "user_inactive") {
					window.location.href = "/login?error=user_inactive";
					return;
				}

				// Show specific error message for unauthorized email
				if (errorData.error === "email_not_authorized") {
					setError(content.emailNotAuthorizedError.value);
				} else {
					setError(content.fetchError.value);
				}
				setSelectingTenant(false);
				return;
			}

			const data = await response.json();
			log.debug({ url: data.url }, "Tenant selected, redirecting");

			// Save last accessed tenant to cookie
			saveLastAccessedTenant(tenant.tenantId, tenant.orgId);

			// Use the URL from API response
			window.location.href = data.url || tenant.url;
		} catch (err) {
			log.error(err, "Error selecting tenant");
			setError(content.fetchError.value);
			setSelectingTenant(false);
		}
	}

	if (loading || selectingTenant || signingOut) {
		const loadingMessage = signingOut ? content.signingOut : content.loading;
		return (
			<div className={styles.container}>
				<div className={styles.card}>
					<div className={styles.loading} data-testid="tenant-selector-loading">
						{loadingMessage}
					</div>
				</div>
			</div>
		);
	}

	// If error occurred but no tenants loaded, show just the error
	if (error && tenants.length === 0) {
		return (
			<div className={styles.container}>
				<div className={styles.card}>
					<div className={styles.error} data-testid="tenant-selector-error">
						{error}
					</div>
				</div>
			</div>
		);
	}

	if (tenants.length === 0) {
		return (
			<div className={styles.container}>
				<div className={styles.card}>
					<div className={styles.titleWithIcon}>
						<div className={styles.iconBox}>📄</div>
						<h1 className={styles.title} data-testid="tenant-selector-no-tenants-title">
							{content.noTenantsTitle}
						</h1>
					</div>
					<p className={styles.noTenantsMessage} data-testid="tenant-selector-no-tenants-message">
						{content.noTenantsMessage}
					</p>
					<button
						type="button"
						onClick={handleSignOut}
						className={styles.switchAccountButton}
						data-testid="switch-account-button"
					>
						<span data-testid="switch-account-text">{content.loginWithAnotherAccount}</span>
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className={styles.container}>
			<div className={styles.card}>
				<h1 className={styles.title} data-testid="tenant-selector-title">
					{content.selectTenantTitle}
				</h1>
				<p className={styles.subtitle} data-testid="tenant-selector-subtitle">
					{content.selectTenantSubtitle}
				</p>

				{/* Show error message if selection failed */}
				{error && (
					<div className={styles.error} data-testid="tenant-selector-inline-error">
						{error}
					</div>
				)}

				<div className={styles.tenantList}>
					{tenants.map(tenant => (
						<button
							key={`${tenant.tenantId}-${tenant.orgId}`}
							type="button"
							onClick={() => selectTenant(tenant)}
							className={`${styles.tenantButton} ${isLastAccessed(tenant) ? styles.lastAccessedTenant : ""}`}
							data-testid={`tenant-button-${tenant.tenantSlug}`}
						>
							{isLastAccessed(tenant) && (
								<span className={styles.lastUsedBadge} data-testid="tenant-last-used-badge">
									{content.lastUsed}
								</span>
							)}
							<div className={styles.tenantInfo}>
								<div className={styles.tenantName} data-testid={`tenant-name-${tenant.tenantSlug}`}>
									{tenant.tenantName}
									{tenant.isDefault && (
										<span className={styles.defaultBadge} data-testid="tenant-default-badge">
											{content.default}
										</span>
									)}
								</div>
								<div className={styles.orgName} data-testid={`tenant-org-${tenant.tenantSlug}`}>
									{content.orgLabel}: {tenant.orgName}
								</div>
								<div className={styles.tenantRole} data-testid={`tenant-role-${tenant.tenantSlug}`}>
									{content.roleLabel}: {tenant.role}
								</div>
							</div>
							<svg className={styles.arrowIcon} viewBox="0 0 20 20" fill="currentColor">
								<path
									fillRule="evenodd"
									d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
									clipRule="evenodd"
								/>
							</svg>
						</button>
					))}
				</div>
			</div>
		</div>
	);
}
