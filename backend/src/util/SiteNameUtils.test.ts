import {
	generateGitHubRepoName,
	generateJolliSiteDomain,
	getLocalHostname,
	getTenantSlug,
	sanitizeHostname,
} from "./SiteNameUtils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock Config
vi.mock("../config/Config", () => ({
	getConfig: vi.fn(),
}));

// Mock TenantContext
vi.mock("../tenant/TenantContext", () => ({
	getTenantContext: vi.fn(),
}));

// Mock os module
vi.mock("node:os", () => ({
	default: {
		hostname: vi.fn(),
	},
}));

import { getConfig } from "../config/Config";
import { getTenantContext } from "../tenant/TenantContext";
import os from "node:os";

const mockGetConfig = vi.mocked(getConfig);
const mockGetTenantContext = vi.mocked(getTenantContext);
const mockOsHostname = vi.mocked(os.hostname);

describe("SiteNameUtils", () => {
	beforeEach(() => {
		mockGetTenantContext.mockReturnValue(undefined);
		mockOsHostname.mockReturnValue("test-machine");
		// Default to prod
		mockGetConfig.mockReturnValue({ SITE_ENV: "prod" } as ReturnType<typeof getConfig>);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe("sanitizeHostname", () => {
		it("should convert to lowercase", () => {
			expect(sanitizeHostname("DESKTOP-ABC123")).toBe("desktop-abc123");
			expect(sanitizeHostname("MyMacBook")).toBe("mymacbook");
		});

		it("should remove invalid characters", () => {
			expect(sanitizeHostname("my_computer")).toBe("mycomputer");
			expect(sanitizeHostname("test!@#$%host")).toBe("testhost");
		});

		it("should preserve hyphens", () => {
			expect(sanitizeHostname("desktop-abc123")).toBe("desktop-abc123");
			expect(sanitizeHostname("aidans-macbook")).toBe("aidans-macbook");
		});

		it("should trim leading and trailing hyphens", () => {
			expect(sanitizeHostname("-test-machine-")).toBe("test-machine");
			expect(sanitizeHostname("---test---")).toBe("test");
		});

		it("should collapse multiple hyphens", () => {
			expect(sanitizeHostname("test---host")).toBe("test-host");
			expect(sanitizeHostname("my--computer")).toBe("my-computer");
		});

		it("should handle simple hostnames", () => {
			expect(sanitizeHostname("localhost")).toBe("localhost");
			expect(sanitizeHostname("myserver")).toBe("myserver");
		});

		it("should handle empty string", () => {
			expect(sanitizeHostname("")).toBe("");
		});

		it("should handle hostname with only invalid characters", () => {
			expect(sanitizeHostname("@#$%^&*")).toBe("");
		});
	});

	describe("getLocalHostname", () => {
		it("should return the os hostname", () => {
			mockOsHostname.mockReturnValue("DESKTOP-ABC123");
			expect(getLocalHostname()).toBe("DESKTOP-ABC123");
		});

		it("should return different hostnames", () => {
			mockOsHostname.mockReturnValue("aidans-macbook");
			expect(getLocalHostname()).toBe("aidans-macbook");

			mockOsHostname.mockReturnValue("production-server-01");
			expect(getLocalHostname()).toBe("production-server-01");
		});
	});

	describe("getTenantSlug", () => {
		it("should use tenant slug from TenantContext when available", () => {
			mockGetTenantContext.mockReturnValue({
				tenant: {
					id: "tenant-123",
					slug: "acme-corp",
					displayName: "Acme Corp",
					status: "active",
					deploymentType: "shared",
					databaseProviderId: "provider-1",
					configs: {},
					configsUpdatedAt: null,
					featureFlags: {},
					primaryDomain: null,
					createdAt: new Date(),
					updatedAt: new Date(),
					provisionedAt: null,
				},
				org: {
					id: "org-123",
					tenantId: "tenant-123",
					slug: "engineering",
					displayName: "Engineering",
					status: "active",
					schemaName: "org_engineering",
					isDefault: true,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
				schemaName: "org_engineering",
				database: {} as never,
			});

			expect(getTenantSlug()).toBe("acme-corp");
		});

		it("should fall back to sanitized local hostname when no tenant context", () => {
			mockOsHostname.mockReturnValue("DESKTOP-ABC123");
			mockGetTenantContext.mockReturnValue(undefined);

			expect(getTenantSlug()).toBe("desktop-abc123");
		});

		it("should fall back to sanitized local hostname when tenant has no slug", () => {
			mockOsHostname.mockReturnValue("aidans-macbook");

			// Tenant context exists but tenant has no slug
			mockGetTenantContext.mockReturnValue({
				tenant: {
					id: "tenant-123",
					slug: "",
					displayName: "Test",
					status: "active",
					deploymentType: "shared",
					databaseProviderId: "provider-1",
					configs: {},
					configsUpdatedAt: null,
					featureFlags: {},
					primaryDomain: null,
					createdAt: new Date(),
					updatedAt: new Date(),
					provisionedAt: null,
				},
				org: {
					id: "org-123",
					tenantId: "tenant-123",
					slug: "default",
					displayName: "Default",
					status: "active",
					schemaName: "org_default",
					isDefault: true,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
				schemaName: "org_default",
				database: {} as never,
			});

			expect(getTenantSlug()).toBe("aidans-macbook");
		});

		it("should use fallback when hostname sanitizes to empty string", () => {
			// Hostname with only invalid characters
			mockOsHostname.mockReturnValue("@#$%^&*");
			mockGetTenantContext.mockReturnValue(undefined);

			expect(getTenantSlug()).toBe("no-hostname");
		});

		it("should use fallback when tenant slug sanitizes to empty string", () => {
			mockGetTenantContext.mockReturnValue({
				tenant: {
					id: "tenant-123",
					slug: "@#$%^&*", // Invalid characters only
					displayName: "Test",
					status: "active",
					deploymentType: "shared",
					databaseProviderId: "provider-1",
					configs: {},
					configsUpdatedAt: null,
					featureFlags: {},
					primaryDomain: null,
					createdAt: new Date(),
					updatedAt: new Date(),
					provisionedAt: null,
				},
				org: {
					id: "org-123",
					tenantId: "tenant-123",
					slug: "default",
					displayName: "Default",
					status: "active",
					schemaName: "org_default",
					isDefault: true,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
				schemaName: "org_default",
				database: {} as never,
			});

			expect(getTenantSlug()).toBe("no-hostname");
		});

		it("should sanitize tenant slug with special characters", () => {
			mockGetTenantContext.mockReturnValue({
				tenant: {
					id: "tenant-123",
					slug: "ACME_Corp!@#", // Needs sanitization
					displayName: "Acme Corp",
					status: "active",
					deploymentType: "shared",
					databaseProviderId: "provider-1",
					configs: {},
					configsUpdatedAt: null,
					featureFlags: {},
					primaryDomain: null,
					createdAt: new Date(),
					updatedAt: new Date(),
					provisionedAt: null,
				},
				org: {
					id: "org-123",
					tenantId: "tenant-123",
					slug: "engineering",
					displayName: "Engineering",
					status: "active",
					schemaName: "org_engineering",
					isDefault: true,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
				schemaName: "org_engineering",
				database: {} as never,
			});

			expect(getTenantSlug()).toBe("acmecorp");
		});
	});

	describe("generateGitHubRepoName", () => {
		beforeEach(() => {
			mockOsHostname.mockReturnValue("test-machine");
			mockGetTenantContext.mockReturnValue(undefined);
		});

		it("should generate repo name in correct format", () => {
			expect(generateGitHubRepoName("docs", 42)).toBe("test-machine-docs-42");
		});

		it("should handle different site names", () => {
			expect(generateGitHubRepoName("my-site", 1)).toBe("test-machine-my-site-1");
			expect(generateGitHubRepoName("customer-portal", 999)).toBe("test-machine-customer-portal-999");
		});

		it("should handle different site IDs", () => {
			expect(generateGitHubRepoName("docs", 1)).toBe("test-machine-docs-1");
			expect(generateGitHubRepoName("docs", 12345)).toBe("test-machine-docs-12345");
		});

		it("should use tenant slug from TenantContext", () => {
			mockGetTenantContext.mockReturnValue({
				tenant: {
					id: "tenant-123",
					slug: "acme",
					displayName: "Acme",
					status: "active",
					deploymentType: "shared",
					databaseProviderId: "provider-1",
					configs: {},
					configsUpdatedAt: null,
					featureFlags: {},
					primaryDomain: null,
					createdAt: new Date(),
					updatedAt: new Date(),
					provisionedAt: null,
				},
				org: {
					id: "org-123",
					tenantId: "tenant-123",
					slug: "default",
					displayName: "Default",
					status: "active",
					schemaName: "org_default",
					isDefault: true,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
				schemaName: "org_default",
				database: {} as never,
			});

			expect(generateGitHubRepoName("docs", 42)).toBe("acme-docs-42");
		});

		it("should sanitize machine hostname", () => {
			mockOsHostname.mockReturnValue("DESKTOP-ABC123");
			expect(generateGitHubRepoName("docs", 42)).toBe("desktop-abc123-docs-42");
		});

		it("should throw error when repo name exceeds 100 characters", () => {
			// Create a very long hostname
			mockOsHostname.mockReturnValue("a".repeat(80));

			// This will create: "aaaa...(80)...-very-long-site-name-1234567890" = 80 + 1 + 20 + 1 + 10 = 112 chars
			expect(() => generateGitHubRepoName("very-long-site-name", 1234567890)).toThrow(
				/exceeds GitHub's 100 character limit/,
			);
		});

		it("should allow repo names at exactly 100 characters", () => {
			// Create a hostname that results in exactly 100 chars
			// Format: {slug}-{name}-{id} = slug + 1 + name + 1 + id
			// 100 = 85 + 1 + 4 + 1 + 9 = 85 char slug + "docs" + 9 digit id
			mockOsHostname.mockReturnValue("a".repeat(85));

			// 85 + 1 + 4 + 1 + 9 = 100 chars exactly
			const result = generateGitHubRepoName("docs", 123456789);
			expect(result.length).toBe(100);
			expect(result).toBe(`${"a".repeat(85)}-docs-123456789`);
		});

		it("should add local prefix when SITE_ENV is local", () => {
			mockGetConfig.mockReturnValue({ SITE_ENV: "local" } as ReturnType<typeof getConfig>);
			expect(generateGitHubRepoName("docs", 42)).toBe("local-test-machine-docs-42");
		});

		it("should add dev prefix when SITE_ENV is dev", () => {
			mockGetConfig.mockReturnValue({ SITE_ENV: "dev" } as ReturnType<typeof getConfig>);
			expect(generateGitHubRepoName("docs", 42)).toBe("dev-test-machine-docs-42");
		});

		it("should add preview prefix when SITE_ENV is preview", () => {
			mockGetConfig.mockReturnValue({ SITE_ENV: "preview" } as ReturnType<typeof getConfig>);
			expect(generateGitHubRepoName("docs", 42)).toBe("preview-test-machine-docs-42");
		});

		it("should not add prefix when SITE_ENV is 'prod'", () => {
			mockGetConfig.mockReturnValue({ SITE_ENV: "prod" } as ReturnType<typeof getConfig>);
			expect(generateGitHubRepoName("docs", 42)).toBe("test-machine-docs-42");
		});

		it("should enforce max length accounting for local prefix (6 chars)", () => {
			mockGetConfig.mockReturnValue({ SITE_ENV: "local" } as ReturnType<typeof getConfig>);
			// local- = 6 chars, effective max for content = 94
			// 85 char slug + 1 + 4 + 1 + 9 = 100 content chars, exceeds 94 limit
			mockOsHostname.mockReturnValue("a".repeat(85));
			expect(() => generateGitHubRepoName("docs", 123456789)).toThrow(/exceeds GitHub's 100 character limit/);
		});

		it("should allow content at exactly effective max with local prefix", () => {
			mockGetConfig.mockReturnValue({ SITE_ENV: "local" } as ReturnType<typeof getConfig>);
			// local- = 6 chars, effective max for content = 94
			// 79 char slug + 1 + 4 + 1 + 9 = 94 content chars (exactly at limit)
			mockOsHostname.mockReturnValue("a".repeat(79));
			const result = generateGitHubRepoName("docs", 123456789);
			expect(result.length).toBe(100); // 6 prefix + 94 content
			expect(result).toBe(`local-${"a".repeat(79)}-docs-123456789`);
		});

		it("should enforce max length accounting for dev prefix (4 chars)", () => {
			mockGetConfig.mockReturnValue({ SITE_ENV: "dev" } as ReturnType<typeof getConfig>);
			// dev- = 4 chars, effective max for content = 96
			// 85 char slug + 1 + 4 + 1 + 9 = 100 content chars, exceeds 96 limit
			mockOsHostname.mockReturnValue("a".repeat(85));
			expect(() => generateGitHubRepoName("docs", 123456789)).toThrow(/exceeds GitHub's 100 character limit/);
		});

		it("should allow content at exactly effective max with dev prefix", () => {
			mockGetConfig.mockReturnValue({ SITE_ENV: "dev" } as ReturnType<typeof getConfig>);
			// dev- = 4 chars, effective max for content = 96
			// 81 char slug + 1 + 4 + 1 + 9 = 96 content chars (exactly at limit)
			mockOsHostname.mockReturnValue("a".repeat(81));
			const result = generateGitHubRepoName("docs", 123456789);
			expect(result.length).toBe(100); // 4 prefix + 96 content
			expect(result).toBe(`dev-${"a".repeat(81)}-docs-123456789`);
		});

		it("should enforce max length accounting for preview prefix (8 chars)", () => {
			mockGetConfig.mockReturnValue({ SITE_ENV: "preview" } as ReturnType<typeof getConfig>);
			// preview- = 8 chars, effective max for content = 92
			// 85 char slug + 1 + 4 + 1 + 9 = 100 content chars, exceeds 92 limit
			mockOsHostname.mockReturnValue("a".repeat(85));
			expect(() => generateGitHubRepoName("docs", 123456789)).toThrow(/exceeds GitHub's 100 character limit/);
		});

		it("should allow content at exactly effective max with preview prefix", () => {
			mockGetConfig.mockReturnValue({ SITE_ENV: "preview" } as ReturnType<typeof getConfig>);
			// preview- = 8 chars, effective max for content = 92
			// 77 char slug + 1 + 4 + 1 + 9 = 92 content chars (exactly at limit)
			mockOsHostname.mockReturnValue("a".repeat(77));
			const result = generateGitHubRepoName("docs", 123456789);
			expect(result.length).toBe(100); // 8 prefix + 92 content
			expect(result).toBe(`preview-${"a".repeat(77)}-docs-123456789`);
		});

		it("should include env prefix info in error message", () => {
			mockGetConfig.mockReturnValue({ SITE_ENV: "preview" } as ReturnType<typeof getConfig>);
			mockOsHostname.mockReturnValue("a".repeat(85));
			expect(() => generateGitHubRepoName("docs", 123456789)).toThrow(/env prefix "preview-" uses 8 chars/);
		});
	});

	describe("generateJolliSiteDomain", () => {
		beforeEach(() => {
			mockOsHostname.mockReturnValue("test-machine");
			mockGetTenantContext.mockReturnValue(undefined);
		});

		it("should generate domain in correct format", () => {
			expect(generateJolliSiteDomain("docs", "jolli.site")).toBe("docs-test-machine.jolli.site");
		});

		it("should handle different site names", () => {
			expect(generateJolliSiteDomain("my-docs", "jolli.site")).toBe("my-docs-test-machine.jolli.site");
			expect(generateJolliSiteDomain("customer-portal", "jolli.site")).toBe(
				"customer-portal-test-machine.jolli.site",
			);
		});

		it("should handle different base domains", () => {
			expect(generateJolliSiteDomain("docs", "jolli.test")).toBe("docs-test-machine.jolli.test");
			expect(generateJolliSiteDomain("docs", "example.com")).toBe("docs-test-machine.example.com");
		});

		it("should use tenant slug from TenantContext", () => {
			mockGetTenantContext.mockReturnValue({
				tenant: {
					id: "tenant-123",
					slug: "acme",
					displayName: "Acme",
					status: "active",
					deploymentType: "shared",
					databaseProviderId: "provider-1",
					configs: {},
					configsUpdatedAt: null,
					featureFlags: {},
					primaryDomain: null,
					createdAt: new Date(),
					updatedAt: new Date(),
					provisionedAt: null,
				},
				org: {
					id: "org-123",
					tenantId: "tenant-123",
					slug: "default",
					displayName: "Default",
					status: "active",
					schemaName: "org_default",
					isDefault: true,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
				schemaName: "org_default",
				database: {} as never,
			});

			expect(generateJolliSiteDomain("docs", "jolli.site")).toBe("docs-acme.jolli.site");
		});

		it("should use sanitized machine hostname when no tenant context", () => {
			mockOsHostname.mockReturnValue("DESKTOP-ABC123");
			expect(generateJolliSiteDomain("docs", "jolli.site")).toBe("docs-desktop-abc123.jolli.site");
		});

		it("should add local subdomain when SITE_ENV is local", () => {
			mockGetConfig.mockReturnValue({ SITE_ENV: "local" } as ReturnType<typeof getConfig>);
			expect(generateJolliSiteDomain("docs", "jolli.site")).toBe("docs-test-machine.local.jolli.site");
		});

		it("should add dev subdomain when SITE_ENV is dev", () => {
			mockGetConfig.mockReturnValue({ SITE_ENV: "dev" } as ReturnType<typeof getConfig>);
			expect(generateJolliSiteDomain("docs", "jolli.site")).toBe("docs-test-machine.dev.jolli.site");
		});

		it("should add preview subdomain when SITE_ENV is preview", () => {
			mockGetConfig.mockReturnValue({ SITE_ENV: "preview" } as ReturnType<typeof getConfig>);
			expect(generateJolliSiteDomain("docs", "jolli.site")).toBe("docs-test-machine.preview.jolli.site");
		});

		it("should not add subdomain when SITE_ENV is 'prod'", () => {
			mockGetConfig.mockReturnValue({ SITE_ENV: "prod" } as ReturnType<typeof getConfig>);
			expect(generateJolliSiteDomain("docs", "jolli.site")).toBe("docs-test-machine.jolli.site");
		});
	});
});
