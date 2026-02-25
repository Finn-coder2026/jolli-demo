import "./Main.css";
import { MainElement } from "./ui/MainElement";
import { TenantNotFound, type TenantNotFoundError } from "./ui/TenantNotFound";
import { getLog } from "./util/Logger";
import { buildValidationRequest, detectTenantMode, type TenantDetectionResult } from "./util/TenantDetection";
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
				log.debug({ returnTo: data.returnTo, error }, "Auth gateway redirecting error to tenant");
				window.location.href = returnUrl.toString();
				return true;
			}
		} catch {
			// If we can't get gateway info, just show the error on the gateway
			log.warn("Could not get gateway info to redirect error");
		}
	}

	// Let the app render normally to show OAuth login page
	return false;
}

/**
 * Known public paths that can be accessed without a tenant prefix.
 * In path-based mode, the first path segment is normally the tenant slug.
 * These paths must be recognized so they aren't misinterpreted as tenant slugs.
 */
const KNOWN_PUBLIC_PATHS = new Set(["/login", "/select-tenant", "/forgot-password", "/reset-password"]);
const KNOWN_PUBLIC_PATH_PREFIXES = ["/invite/", "/owner-invite/"];

function isKnownPublicPath(pathname: string): boolean {
	if (KNOWN_PUBLIC_PATHS.has(pathname)) {
		return true;
	}
	return KNOWN_PUBLIC_PATH_PREFIXES.some(prefix => pathname.startsWith(prefix));
}

/** Result of tenant validation */
interface TenantValidResult {
	valid: boolean;
	error?: TenantNotFoundError;
	redirectTo?: string;
	/** Detected tenant information for router configuration */
	tenantDetection?: TenantDetectionResult;
}

/**
 * Get the auth gateway login URL.
 * For example: four.jolli-local.me -> auth.jolli-local.me/login
 */
function getAuthLoginUrl(): string {
	const hostname = window.location.hostname;
	const parts = hostname.split(".");

	// If there are more than 2 parts (e.g., tenant.jolli.app), replace subdomain with "auth"
	if (parts.length > 2) {
		const baseDomain = parts.slice(1).join(".");
		return `${window.location.protocol}//auth.${baseDomain}/login`;
	}

	// Otherwise, prepend auth subdomain to current domain
	return `${window.location.protocol}//auth.${hostname}/login`;
}

/**
 * Check if the current tenant/domain is valid.
 * This validates the subdomain or custom domain against the tenant registry
 * when multi-tenant mode is enabled.
 *
 * Returns { valid: true } in single-tenant mode (MULTI_TENANT_ENABLED=false).
 * Returns { valid: false, error } when the tenant is not found or inactive.
 * Returns { valid: false, redirectTo } when user is logged into a different tenant (mismatch).
 */
async function checkTenantValid(): Promise<TenantValidResult> {
	// Detect tenant mode from URL
	// Use a base domain from env, or fallback to detecting from hostname
	const baseDomain =
		import.meta.env.VITE_BASE_DOMAIN ||
		(window.location.hostname.includes(".")
			? window.location.hostname.split(".").slice(-2).join(".")
			: window.location.hostname);

	const tenantDetection = detectTenantMode(baseDomain);

	// Skip validation on localhost (dev mode without multi-tenant)
	if (window.location.hostname === "localhost") {
		return { valid: true, tenantDetection };
	}

	// Skip validation on auth gateway (it's not a tenant)
	if (isAuthGateway()) {
		return { valid: true, tenantDetection };
	}

	// Skip validation for known public paths that may appear without a tenant prefix
	// in path-based mode. Without this, detectTenantMode would misinterpret route names
	// like "invite" or "login" as tenant slugs, causing validation to fail.
	// When skipped, we override tenantDetection to use an empty basename so React Router
	// renders the correct page at the root level.
	if (isKnownPublicPath(window.location.pathname)) {
		if (tenantDetection.mode === "path" && tenantDetection.basename) {
			return {
				valid: true,
				tenantDetection: { ...tenantDetection, tenantSlug: null, basename: "" },
			};
		}
		return { valid: true, tenantDetection };
	}

	try {
		// Build validation request with X-Tenant-Slug header for path-based mode
		const requestInit = buildValidationRequest(tenantDetection);
		const response = await fetch("/api/tenant/validate", requestInit);
		if (response.ok) {
			return { valid: true, tenantDetection };
		}
		if (response.status === 401) {
			// Session invalid (tenant/org deleted) - redirect to login
			log.warn("Session invalid (tenant/org may have been deleted), redirecting to login");
			return { valid: false, redirectTo: "/login" };
		}
		if (response.status === 404) {
			// Tenant not found - redirect to auth gateway login
			log.warn("Tenant not found, redirecting to auth gateway login");
			try {
				const data = (await response.json()) as { error?: string; redirectTo?: string };
				if (data.redirectTo) {
					return { valid: false, error: "not_found", redirectTo: data.redirectTo };
				}
			} catch {
				// JSON parse failed, use fallback URL
			}
			// Fallback to constructing URL locally if backend doesn't provide redirectTo
			return { valid: false, error: "not_found", redirectTo: getAuthLoginUrl() };
		}
		if (response.status === 403) {
			// Check if this is a tenant mismatch with redirect
			try {
				const data = (await response.json()) as { error?: string; redirectTo?: string };
				if (data.redirectTo) {
					return { valid: false, redirectTo: data.redirectTo, tenantDetection };
				}
			} catch {
				// JSON parse failed, treat as inactive
			}
			return { valid: false, error: "inactive" };
		}
		// For other errors, fail open (let normal app handle it)
		return { valid: true };
	} catch {
		// Network error - fail open (let normal app handle it)
		return { valid: true };
	}
}

/**
 * Handle tenant validation redirect (tenant mismatch, session invalid, auth gateway).
 * Returns the final redirect URL based on the tenant mode and redirect target.
 */
function buildTenantRedirectUrl(redirectTo: string, detection: TenantDetectionResult | undefined): string {
	// Simple path redirect (e.g., "/login")
	if (redirectTo.startsWith("/")) {
		return redirectTo;
	}

	// Path-based tenant mismatch: redirectTo already includes tenant prefix
	// (e.g., "https://jolli-local.me/flyer6"). Extract the remaining app path
	// from the current URL and append it to preserve the user's navigation.
	if (detection?.mode === "path" && detection.tenantSlug) {
		const oldPrefix = `/${detection.tenantSlug}`;
		const currentFullPath = window.location.pathname;
		let remainingPath = "";
		if (currentFullPath.startsWith(oldPrefix)) {
			remainingPath = currentFullPath.slice(oldPrefix.length);
		}
		if (!remainingPath || remainingPath === "/") {
			remainingPath = "/dashboard";
		}
		return `${redirectTo}${remainingPath}`;
	}

	// No tenant detection (e.g., 404 auth gateway redirect) — check if URL already
	// has a meaningful page path (e.g., "auth.jolli.app/login"). If so, return as-is.
	// We only do this when detection is undefined because for 403 tenant mismatch,
	// path-based URLs like "jolli-local.me/flyer6" have a path that is a tenant slug,
	// not a page path, and we need to append the actual page path.
	if (!detection) {
		try {
			const url = new URL(redirectTo);
			if (url.pathname && url.pathname !== "/") {
				return redirectTo;
			}
		} catch {
			// Not a valid URL, treat as origin
		}
	}

	// Subdomain/custom domain tenant mismatch: append current page path to origin
	const currentPath = window.location.pathname || "/dashboard";
	const redirectPath = currentPath === "/" ? "/dashboard" : currentPath;
	return `${redirectTo}${redirectPath}`;
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
		// Handle redirect scenarios
		if (tenantResult.redirectTo) {
			const redirectUrl = buildTenantRedirectUrl(tenantResult.redirectTo, tenantResult.tenantDetection);
			log.debug({ redirectTo: redirectUrl }, "Tenant validation failed, redirecting");
			window.location.href = redirectUrl;
			return;
		}

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

	// Get basename from tenant detection for router configuration
	const basename = tenantResult.tenantDetection?.basename || "";
	log.debug({ basename, mode: tenantResult.tenantDetection?.mode }, "Tenant detection complete");

	// Store tenant slug in sessionStorage so Client can send X-Tenant-Slug header
	// on every API request. This is critical for path-based multi-tenancy: when the
	// JWT cookie expires or is cleared, the backend still needs to identify the tenant
	// to return a proper 401 (instead of 404).
	if (tenantResult.tenantDetection?.tenantSlug) {
		sessionStorage.setItem("tenantSlug", tenantResult.tenantDetection.tenantSlug);
	}

	// Render the main app with basename for router
	if (process.env.NODE_ENV === "development") {
		createRoot(app).render(
			<IntlayerProvider>
				<MainElement basename={basename} />
			</IntlayerProvider>,
		);
	} else {
		render(
			<IntlayerProvider>
				<MainElement basename={basename} />
			</IntlayerProvider>,
			app,
		);
	}
}

init();
