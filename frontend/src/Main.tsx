import "./Main.css";
import { MainElement } from "./ui/MainElement";
import { TenantNotFound, type TenantNotFoundError } from "./ui/TenantNotFound";
import { getLog } from "./util/Logger";
import { render } from "preact";
import { createRoot } from "react-dom/client";
import { IntlayerProvider } from "react-intlayer";

const log = getLog(import.meta);

log.info(`Jolli running on ${navigator.userAgent}`);

/**
 * Check if we need to redirect to a tenant-specific domain.
 * Only redirects when DEV_TENANT_ID is configured on the backend
 * and we're currently on localhost.
 */
async function checkDevRedirect(): Promise<boolean> {
	try {
		const response = await fetch("/api/dev-tools/redirect");
		if (!response.ok) {
			return false;
		}
		const data = (await response.json()) as { redirectTo: string | null; useHttps?: boolean; port?: string };
		if (data.redirectTo && window.location.hostname === "localhost") {
			const newUrl = new URL(window.location.href);
			newUrl.hostname = data.redirectTo;
			// When useHttps is true (GATEWAY_DOMAIN is set), use https and default port
			if (data.useHttps) {
				newUrl.protocol = "https:";
				newUrl.port = ""; // Use default port (443 for https)
			}
			window.location.href = newUrl.toString();
			return true;
		}
	} catch {
		// Ignore errors - backend might not be running yet or endpoint doesn't exist
	}
	return false;
}

/**
 * Check if we're on the auth gateway subdomain.
 * The auth gateway is used for centralized OAuth in multi-tenant mode.
 */
function isAuthGateway(): boolean {
	const hostname = window.location.hostname;
	// Check if subdomain is "auth" (e.g., auth.jolli.ai, auth.dougschroeder.dev)
	const parts = hostname.split(".");
	return parts.length >= 2 && parts[0] === "auth";
}

/**
 * Handle auth gateway special cases.
 * Returns true if we handled the request and should not render the normal app.
 */
async function handleAuthGateway(): Promise<boolean> {
	if (!isAuthGateway()) {
		return false;
	}

	const params = new URLSearchParams(window.location.search);
	const error = params.get("error");

	// If there's an OAuth error, redirect it back to the tenant
	if (error) {
		try {
			const response = await fetch("/api/auth/gateway-info");
			if (response.ok) {
				const data = (await response.json()) as { returnTo: string };
				const returnUrl = new URL("/", data.returnTo);
				returnUrl.searchParams.set("error", error);
				const errorDescription = params.get("error_description");
				if (errorDescription) {
					returnUrl.searchParams.set("error_description", errorDescription);
				}
				log.info({ returnTo: data.returnTo, error }, "Auth gateway redirecting error to tenant");
				window.location.href = returnUrl.toString();
				return true;
			}
		} catch {
			// If we can't get gateway info, just show the error on the gateway
			log.warn("Could not get gateway info to redirect error");
		}
	}

	// For select_email flow, let the app render normally
	// The AuthElement component will handle email selection
	return false;
}

/**
 * Check if the current tenant/domain is valid.
 * This validates the subdomain or custom domain against the tenant registry
 * when multi-tenant mode is enabled.
 *
 * Returns { valid: true } in single-tenant mode (MULTI_TENANT_ENABLED=false).
 * Returns { valid: false, error } when the tenant is not found or inactive.
 */
async function checkTenantValid(): Promise<{ valid: boolean; error?: TenantNotFoundError }> {
	// Skip validation on localhost (dev mode without multi-tenant)
	if (window.location.hostname === "localhost") {
		return { valid: true };
	}

	// Skip validation on auth gateway (it's not a tenant)
	if (isAuthGateway()) {
		return { valid: true };
	}

	try {
		const response = await fetch("/api/tenant/validate");
		if (response.ok) {
			return { valid: true };
		}
		if (response.status === 404) {
			return { valid: false, error: "not_found" };
		}
		if (response.status === 403) {
			return { valid: false, error: "inactive" };
		}
		// For other errors, fail open (let normal app handle it)
		return { valid: true };
	} catch {
		// Network error - fail open (let normal app handle it)
		return { valid: true };
	}
}

async function init() {
	// Check for dev redirect before rendering
	const redirected = await checkDevRedirect();
	if (redirected) {
		return; // Don't render, we're redirecting
	}

	// Handle auth gateway special cases (error redirect, etc.)
	const handledByGateway = await handleAuthGateway();
	if (handledByGateway) {
		return; // Don't render, we're redirecting
	}

	const app = document.querySelector("#app");
	if (!(app instanceof HTMLElement)) {
		return;
	}

	// Check if the tenant/domain is valid
	const tenantResult = await checkTenantValid();
	if (!tenantResult.valid) {
		// Show 404 page for invalid tenant
		log.warn({ error: tenantResult.error }, "Invalid tenant, showing TenantNotFound page");
		if (process.env.NODE_ENV === "development") {
			createRoot(app).render(
				<IntlayerProvider>
					<TenantNotFound error={tenantResult.error} />
				</IntlayerProvider>,
			);
		} else {
			render(
				<IntlayerProvider>
					<TenantNotFound error={tenantResult.error} />
				</IntlayerProvider>,
				app,
			);
		}
		return;
	}

	// Render the main app
	if (process.env.NODE_ENV === "development") {
		createRoot(app).render(
			<IntlayerProvider>
				<MainElement />
			</IntlayerProvider>,
		);
	} else {
		render(
			<IntlayerProvider>
				<MainElement />
			</IntlayerProvider>,
			app,
		);
	}
}

init();
