/**
 * Unified cookie utilities for auth-related frontend flows:
 * - remember-me preference
 * - last accessed tenant/org
 * - GitHub email-selection flow
 */

/** Cookie name for remember-me checkbox preference */
export const REMEMBER_ME_COOKIE_NAME = "jolli_rememberMe_pref";

/** Cookie name for pending GitHub email selection */
const EMAIL_SELECTION_COOKIE_NAME = "email_selection";

/** Cookie key for last accessed tenant/org pair */
const LAST_ACCESSED_TENANT_KEY = "jolli:last_accessed_tenant";

/** Max-age for remember-me cookie: 10 years in seconds */
const REMEMBER_ME_COOKIE_MAX_AGE = 10 * 365 * 24 * 60 * 60;

let configuredCookieDomain: string | undefined;

interface CookieOptions {
	path?: string;
	maxAge?: number;
	sameSite?: "Lax" | "Strict" | "None";
	domain?: string;
	secure?: boolean;
	encodeValue?: boolean;
}

function setCookieDomain(domain: string | undefined): void {
	configuredCookieDomain = domain;
}

function getCookieDomain(): string | undefined {
	return configuredCookieDomain;
}

function readCookie(name: string): string | undefined {
	try {
		const cookies = document.cookie.split(";");
		for (const cookie of cookies) {
			const [cookieName, cookieValue] = cookie.trim().split("=");
			if (cookieName === name) {
				return cookieValue;
			}
		}
		return;
	} catch {
		return;
	}
}

function setCookie(name: string, value: string, options: CookieOptions = {}): void {
	const { path = "/", maxAge, sameSite = "Lax", domain, secure = false, encodeValue = false } = options;

	try {
		const serializedValue = encodeValue ? encodeURIComponent(value) : value;
		const maxAgePart = typeof maxAge === "number" ? `; max-age=${maxAge}` : "";
		const domainPart = domain ? `; domain=${domain}` : "";
		const securePart = secure ? "; Secure" : "";
		// biome-ignore lint/suspicious/noDocumentCookie: Cookie API is required for browser-side persistence
		document.cookie = `${name}=${serializedValue}; path=${path}; SameSite=${sameSite}${maxAgePart}${domainPart}${securePart}`;
	} catch {
		// Ignore cookie write errors.
	}
}

function clearCookie(name: string, options: Omit<CookieOptions, "maxAge" | "encodeValue"> = {}): void {
	setCookie(name, "", { ...options, maxAge: 0 });
}

export interface LastAccessedTenantInfo {
	tenantId: string;
	orgId: string;
}

export interface EmailSelectionCookieData {
	code: string;
	primary?: string;
}

/**
 * Set shared auth cookie domain from backend configuration.
 * Should be called once when session config is fetched.
 */
export function setAuthCookieDomain(domain: string | undefined): void {
	setCookieDomain(domain);
}

/**
 * Backward-compatible aliases. All three now share the same domain store.
 */
export function setRememberMeCookieDomain(domain: string | undefined): void {
	setAuthCookieDomain(domain);
}

export function setLastAccessedTenantCookieDomain(domain: string | undefined): void {
	setAuthCookieDomain(domain);
}

export function setEmailSelectionCookieDomain(domain: string | undefined): void {
	setAuthCookieDomain(domain);
}

/**
 * Remember-me preference helpers.
 */
export function getRememberMePreference(): boolean {
	return readCookie(REMEMBER_ME_COOKIE_NAME) === "true";
}

export function saveRememberMePreference(value: boolean): void {
	const cookieDomain = getCookieDomain();
	setCookie(REMEMBER_ME_COOKIE_NAME, String(value), {
		maxAge: REMEMBER_ME_COOKIE_MAX_AGE,
		...(cookieDomain ? { domain: cookieDomain } : {}),
	});
}

export function clearRememberMePreference(): void {
	const cookieDomain = getCookieDomain();
	clearCookie(REMEMBER_ME_COOKIE_NAME, cookieDomain ? { domain: cookieDomain } : {});
}

/**
 * Last accessed tenant helpers.
 */
export function getLastAccessedTenant(): LastAccessedTenantInfo | null {
	try {
		const value = readCookie(LAST_ACCESSED_TENANT_KEY);
		if (!value) {
			return null;
		}
		const decoded = decodeURIComponent(value);
		return JSON.parse(decoded) as LastAccessedTenantInfo;
	} catch {
		return null;
	}
}

export function saveLastAccessedTenant(tenantId: string, orgId: string): void {
	try {
		const value = JSON.stringify({ tenantId, orgId });
		const maxAge = 365 * 24 * 60 * 60;
		const cookieDomain = getCookieDomain();

		setCookie(LAST_ACCESSED_TENANT_KEY, value, {
			maxAge,
			...(cookieDomain ? { domain: cookieDomain } : {}),
			secure: window.location.protocol === "https:",
			encodeValue: true,
		});
	} catch {
		// Ignore cookie write errors.
	}
}

/**
 * GitHub email-selection flow helper.
 */
export function hasEmailSelectionCookie(): boolean {
	return !!readCookie(EMAIL_SELECTION_COOKIE_NAME);
}

export function getEmailSelectionCookieData(): EmailSelectionCookieData | undefined {
	const rawValue = readCookie(EMAIL_SELECTION_COOKIE_NAME);
	if (!rawValue) {
		return;
	}

	try {
		const parsed = JSON.parse(decodeURIComponent(rawValue)) as Partial<EmailSelectionCookieData>;
		if (typeof parsed.code !== "string" || parsed.code.length === 0) {
			return;
		}
		if (typeof parsed.primary === "string") {
			return {
				code: parsed.code,
				primary: parsed.primary,
			};
		}
		return { code: parsed.code };
	} catch {
		return;
	}
}

export function clearEmailSelectionCookie(): void {
	// Clear host-only variant first.
	clearCookie(EMAIL_SELECTION_COOKIE_NAME);

	// Clear configured-domain variant when present.
	const cookieDomain = getCookieDomain();
	if (cookieDomain) {
		clearCookie(EMAIL_SELECTION_COOKIE_NAME, { domain: cookieDomain });
	}
}
