import {
	getLastAccessedTenant,
	type LastAccessedTenantInfo,
	saveLastAccessedTenant,
	setLastAccessedTenantCookieDomain,
} from "./AuthCookieUtil";
import { beforeEach, describe, expect, it } from "vitest";

// Helper to clear all cookies
function clearCookies(): void {
	const cookies = document.cookie.split(";");
	for (const cookie of cookies) {
		const name = cookie.split("=")[0].trim();
		// biome-ignore lint/suspicious/noDocumentCookie: Required for test cleanup
		document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
	}
}

// Helper to get cookie value by name
function getCookie(name: string): string | null {
	const cookies = document.cookie.split(";");
	for (const cookie of cookies) {
		const [cookieName, cookieValue] = cookie.trim().split("=");
		if (cookieName === name) {
			return decodeURIComponent(cookieValue);
		}
	}
	return null;
}

describe("LastAccessedTenantStorage", () => {
	beforeEach(() => {
		clearCookies();
		// Reset cookie domain to undefined before each test
		setLastAccessedTenantCookieDomain(undefined);
		// Mock localhost for tests
		Object.defineProperty(window, "location", {
			value: {
				hostname: "localhost",
				protocol: "http:",
			},
			writable: true,
			configurable: true,
		});
	});

	describe("getLastAccessedTenant", () => {
		it("should return null when no cookie is set", () => {
			const result = getLastAccessedTenant();
			expect(result).toBeNull();
		});

		it("should return stored tenant info from cookie", () => {
			const testData: LastAccessedTenantInfo = {
				tenantId: "tenant-123",
				orgId: "org-456",
			};
			// biome-ignore lint/suspicious/noDocumentCookie: Required for test setup
			document.cookie = `jolli:last_accessed_tenant=${encodeURIComponent(JSON.stringify(testData))}; path=/`;

			const result = getLastAccessedTenant();
			expect(result).toEqual(testData);
		});

		it("should return null when cookie contains invalid JSON", () => {
			// biome-ignore lint/suspicious/noDocumentCookie: Required for test setup
			document.cookie = "jolli:last_accessed_tenant=invalid-json; path=/";

			const result = getLastAccessedTenant();
			expect(result).toBeNull();
		});

		it("should handle URL-encoded cookie values", () => {
			const testData: LastAccessedTenantInfo = {
				tenantId: "tenant-with-special-chars",
				orgId: "org-with-special-chars",
			};
			const encoded = encodeURIComponent(JSON.stringify(testData));
			// biome-ignore lint/suspicious/noDocumentCookie: Required for test setup
			document.cookie = `jolli:last_accessed_tenant=${encoded}; path=/`;

			const result = getLastAccessedTenant();
			expect(result).toEqual(testData);
		});
	});

	describe("saveLastAccessedTenant", () => {
		it("should save tenant info to cookie", () => {
			saveLastAccessedTenant("tenant-123", "org-456");

			const cookieValue = getCookie("jolli:last_accessed_tenant");
			expect(cookieValue).toBeDefined();
			const parsed = JSON.parse(cookieValue as string);
			expect(parsed.tenantId).toBe("tenant-123");
			expect(parsed.orgId).toBe("org-456");
		});

		it("should overwrite existing cookie data", () => {
			saveLastAccessedTenant("tenant-old", "org-old");
			saveLastAccessedTenant("tenant-new", "org-new");

			const cookieValue = getCookie("jolli:last_accessed_tenant");
			const parsed = JSON.parse(cookieValue as string);
			expect(parsed.tenantId).toBe("tenant-new");
			expect(parsed.orgId).toBe("org-new");
		});

		it("should set cookie without domain when no domain is configured", () => {
			// No domain configured (default)
			saveLastAccessedTenant("tenant-123", "org-456");

			// Cookie should be set without domain attribute
			const cookie = document.cookie;
			expect(cookie).toContain("jolli:last_accessed_tenant");
			expect(cookie).not.toContain("domain=");
		});

		it("should set cookie with configured domain", () => {
			// Configure the cookie domain (as would be done by MainElement.tsx)
			// Note: In test environment on localhost, setting domain=.jolli.app will prevent
			// the cookie from being readable, but the function should not throw
			setLastAccessedTenantCookieDomain(".jolli.app");

			// Should not throw error
			expect(() => saveLastAccessedTenant("tenant-123", "org-456")).not.toThrow();
		});

		it("should set Secure flag for HTTPS", () => {
			// Mock HTTPS
			Object.defineProperty(window, "location", {
				value: {
					hostname: "localhost",
					protocol: "https:",
				},
				writable: true,
				configurable: true,
			});

			saveLastAccessedTenant("tenant-123", "org-456");

			// Cookie should be set (Secure flag won't be visible in document.cookie)
			const cookieValue = getCookie("jolli:last_accessed_tenant");
			expect(cookieValue).toBeDefined();
		});

		it("should handle errors gracefully", () => {
			// Mock document.cookie to throw error
			const originalCookie = Object.getOwnPropertyDescriptor(Document.prototype, "cookie");
			Object.defineProperty(document, "cookie", {
				set: () => {
					throw new Error("Cookie error");
				},
				configurable: true,
			});

			// Should not throw error
			expect(() => {
				saveLastAccessedTenant("tenant-123", "org-456");
			}).not.toThrow();

			// Restore original
			if (originalCookie) {
				Object.defineProperty(document, "cookie", originalCookie);
			}
		});
	});

	describe("setLastAccessedTenantCookieDomain", () => {
		it("should allow setting cookie domain to undefined", () => {
			setLastAccessedTenantCookieDomain(undefined);
			saveLastAccessedTenant("test", "test");
			// Should not throw and should work without domain
			const result = getLastAccessedTenant();
			expect(result).toBeDefined();
			expect(result?.tenantId).toBe("test");
			expect(result?.orgId).toBe("test");
		});

		it("should not throw when using configured cookie domain", () => {
			// Note: In test environment on localhost, setting domain=.jolli.app
			// will prevent the cookie from being readable, but should not throw
			setLastAccessedTenantCookieDomain(".jolli.app");
			expect(() => saveLastAccessedTenant("test", "test")).not.toThrow();
		});

		it("should allow changing cookie domain configuration", () => {
			// Setting different domains should not throw
			setLastAccessedTenantCookieDomain(".example.com");
			expect(() => saveLastAccessedTenant("test1", "test1")).not.toThrow();

			setLastAccessedTenantCookieDomain(".jolli.app");
			expect(() => saveLastAccessedTenant("test2", "test2")).not.toThrow();

			// Resetting to undefined should work normally
			setLastAccessedTenantCookieDomain(undefined);
			saveLastAccessedTenant("test3", "test3");
			const result = getLastAccessedTenant();
			expect(result?.tenantId).toBe("test3");
		});
	});
});
