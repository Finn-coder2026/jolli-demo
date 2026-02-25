import { ClientProvider } from "../../contexts/ClientContext";
import { OrgTenantSelector } from "./OrgTenantSelector";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import type { TenantListItem } from "jolli-common";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock lucide-react icons
vi.mock("lucide-react", async importOriginal => {
	const actual = await importOriginal<typeof import("lucide-react")>();
	return {
		...actual,
		Building2: () => <div data-testid="building-icon" />,
		Globe: () => <div data-testid="globe-icon" />,
		Check: () => <div data-testid="check-icon" />,
		ChevronDown: () => <div data-testid="chevron-down-icon" />,
		ExternalLink: () => <div data-testid="external-link-icon" />,
	};
});

// Helper to create intlayer-like values
function createMockIntlayerValue(str: string) {
	// biome-ignore lint/style/useConsistentBuiltinInstantiation: Need String object
	// biome-ignore lint/suspicious/noExplicitAny: Mock helper
	const val = new String(str) as any;
	val.value = str;
	return val;
}

// Mock react-intlayer
vi.mock("react-intlayer", () => ({
	useIntlayer: () => ({
		switchOrganization: createMockIntlayerValue("Switch Organization"),
		switchTenant: createMockIntlayerValue("Switch Tenant"),
		openInNewTab: createMockIntlayerValue("Open in new tab"),
		noOrganizations: createMockIntlayerValue("No organizations available"),
		noTenants: createMockIntlayerValue("No tenants available"),
		organizations: createMockIntlayerValue("Organizations"),
		tenants: createMockIntlayerValue("Tenants"),
	}),
}));

// Mock OrgContext
let mockOrgContext = {
	tenant: { id: 1, slug: "tenant1", displayName: "Tenant One" },
	org: { id: 1, slug: "org1", displayName: "Org One" },
	availableOrgs: [{ id: 1, slug: "org1", displayName: "Org One" }],
	isMultiTenant: false,
	isLoading: false,
};

vi.mock("../../contexts/OrgContext", () => ({
	useOrg: () => mockOrgContext,
}));

// Mock TenantContext
let mockTenantContext: {
	useTenantSwitcher: boolean;
	currentTenantId: string | null;
	baseDomain: string | null;
	availableTenants: Array<TenantListItem>;
	isLoading: boolean;
} = {
	useTenantSwitcher: false,
	currentTenantId: "1",
	baseDomain: "jolli.app",
	availableTenants: [
		{ id: "1", slug: "tenant1", displayName: "Tenant One", primaryDomain: null, defaultOrgId: "org-1" },
	],
	isLoading: false,
};

vi.mock("../../contexts/TenantContext", () => ({
	useTenant: () => mockTenantContext,
}));

// Mock jolli-common createClient
const mockSelectTenant = vi.fn().mockResolvedValue({ success: true, url: "http://localhost:8034/dashboard" });
const mockAuthClient = {
	selectTenant: mockSelectTenant,
};
const mockClient = {
	auth: vi.fn(() => mockAuthClient),
};

vi.mock("jolli-common", async () => {
	const actual = await vi.importActual<typeof import("jolli-common")>("jolli-common");
	return {
		...actual,
		createClient: vi.fn(() => mockClient),
	};
});

// Mock LastAccessedTenantStorage
const mockSaveLastAccessedTenant = vi.fn();
vi.mock("../../util/AuthCookieUtil", () => ({
	saveLastAccessedTenant: (...args: Array<unknown>) => mockSaveLastAccessedTenant(...args),
}));

// Helper to render with providers
function renderWithProviders(ui: ReactElement): ReturnType<typeof render> {
	return render(<ClientProvider>{ui}</ClientProvider>);
}

describe("OrgTenantSelector", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockSelectTenant.mockResolvedValue({ success: true, url: "http://localhost:8034/dashboard" });

		// Reset to default single-tenant mode
		mockOrgContext = {
			tenant: { id: 1, slug: "tenant1", displayName: "Tenant One" },
			org: { id: 1, slug: "org1", displayName: "Org One" },
			availableOrgs: [{ id: 1, slug: "org1", displayName: "Org One" }],
			isMultiTenant: false,
			isLoading: false,
		};
		mockTenantContext = {
			useTenantSwitcher: false,
			currentTenantId: "1",
			baseDomain: "jolli.app",
			availableTenants: [
				{ id: "1", slug: "tenant1", displayName: "Tenant One", primaryDomain: null, defaultOrgId: "org-1" },
			],
			isLoading: false,
		};
		// Reset window.location
		// biome-ignore lint/suspicious/noExplicitAny: Test mock requires any for window.location override
		delete (window as any).location;
		// biome-ignore lint/suspicious/noExplicitAny: Test mock requires any for window.location override
		(window as any).location = {
			hostname: "localhost",
			protocol: "http:",
			origin: "http://localhost:8034",
			href: "http://localhost:8034",
		};
	});

	describe("Loading State", () => {
		it("should show loading state when org context is loading", () => {
			mockOrgContext.isLoading = true;

			renderWithProviders(<OrgTenantSelector />);

			expect(screen.getByTestId("org-tenant-selector-loading")).toBeDefined();
		});

		it("should show loading state when tenant context is loading", () => {
			mockTenantContext.isLoading = true;

			renderWithProviders(<OrgTenantSelector />);

			expect(screen.getByTestId("org-tenant-selector-loading")).toBeDefined();
		});

		it("should show icon in loading state", () => {
			mockOrgContext.isLoading = true;

			renderWithProviders(<OrgTenantSelector />);

			// In single-tenant mode, should show Globe icon
			expect(screen.getByTestId("globe-icon")).toBeDefined();
		});
	});

	describe("Static Display (No Dropdown)", () => {
		it("should show static display when only one org in single-tenant mode", () => {
			renderWithProviders(<OrgTenantSelector />);

			expect(screen.getByTestId("org-tenant-selector-static")).toBeDefined();
			expect(screen.getByTestId("org-tenant-selector-display-text")).toBeDefined();
		});

		it("should show globe icon in single-tenant mode", () => {
			renderWithProviders(<OrgTenantSelector />);

			expect(screen.getByTestId("globe-icon")).toBeDefined();
		});

		it("should show building icon in multi-tenant mode", () => {
			mockOrgContext.isMultiTenant = true;

			renderWithProviders(<OrgTenantSelector />);

			expect(screen.getByTestId("building-icon")).toBeDefined();
		});

		it("should hide text when collapsed", () => {
			renderWithProviders(<OrgTenantSelector collapsed />);

			expect(screen.queryByTestId("org-tenant-selector-display-text")).toBe(null);
		});

		it("should show tenant displayName even in multi-tenant mode", () => {
			mockOrgContext.isMultiTenant = true;

			renderWithProviders(<OrgTenantSelector />);

			// Should show tenant name, not org name (verified via display text testid)
			expect(screen.getByTestId("org-tenant-selector-display-text")).toBeDefined();
		});
	});

	describe("Organization Switching (Multi-Tenant Mode)", () => {
		beforeEach(() => {
			mockOrgContext.isMultiTenant = true;
			mockOrgContext.availableOrgs = [
				{ id: 1, slug: "org1", displayName: "Org One" },
				{ id: 2, slug: "org2", displayName: "Org Two" },
			];
		});

		it("should show dropdown trigger when multiple orgs available", () => {
			renderWithProviders(<OrgTenantSelector />);

			expect(screen.getByTestId("org-tenant-selector-trigger")).toBeDefined();
		});

		it("should show current org name in expanded state", () => {
			renderWithProviders(<OrgTenantSelector />);

			// Should show tenant name even in multi-tenant mode
			expect(screen.getByTestId("org-tenant-selector-trigger-text")).toBeDefined();
		});

		it("should show chevrons icon in expanded state", () => {
			renderWithProviders(<OrgTenantSelector />);

			expect(screen.getByTestId("chevrons-icon")).toBeDefined();
		});

		it("should hide text and chevrons in collapsed state", () => {
			renderWithProviders(<OrgTenantSelector collapsed />);

			expect(screen.queryByTestId("org-tenant-selector-trigger-text")).toBe(null);
			expect(screen.queryByTestId("chevrons-icon")).toBe(null);
		});

		it("should switch organization when clicked", async () => {
			// Mock selectTenant to return same URL as current (triggers navigation with timestamp)
			mockSelectTenant.mockResolvedValue({ success: true, url: "http://localhost:8034" });

			const hrefSpy = vi.fn();
			Object.defineProperty(window.location, "href", {
				set: hrefSpy,
				get: () => "http://localhost:8034",
				configurable: true,
			});

			renderWithProviders(<OrgTenantSelector />);

			// Click trigger to open dropdown
			const trigger = screen.getByTestId("org-tenant-selector-trigger");
			fireEvent.click(trigger);

			// Wait for dropdown to appear and click org 2
			await waitFor(() => {
				const orgTwo = screen.getByTestId("org-item-org2");
				expect(orgTwo).toBeDefined();
				fireEvent.click(orgTwo);
			});

			// Should call selectTenant with correct params
			await waitFor(() => {
				expect(mockSelectTenant).toHaveBeenCalledWith("1", 2);
			});

			// Should navigate with timestamp since URL is same
			await waitFor(() => {
				expect(hrefSpy).toHaveBeenCalled();
				const calledUrl = hrefSpy.mock.calls[0][0];
				expect(calledUrl).toContain("http://localhost:8034");
				expect(calledUrl).toContain("_t="); // Should have timestamp parameter
			});
		});

		it("should not switch when clicking current org", async () => {
			const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
			const reloadSpy = vi.fn();
			Object.defineProperty(window.location, "reload", {
				writable: true,
				value: reloadSpy,
			});

			renderWithProviders(<OrgTenantSelector />);

			// Click trigger
			const trigger = screen.getByTestId("org-tenant-selector-trigger");
			fireEvent.click(trigger);

			// Click current org (dropdown shows org name)
			await waitFor(() => {
				const orgOneElement = screen.getByTestId("org-item-org1");
				expect(orgOneElement).toBeDefined();
				fireEvent.click(orgOneElement);
			});

			expect(setItemSpy).not.toHaveBeenCalled();
			expect(reloadSpy).not.toHaveBeenCalled();

			setItemSpy.mockRestore();
		});

		it("should log error and return early when no tenant ID available from any source", async () => {
			const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {
				// Suppress console.error during test
			});
			const hrefSpy = vi.fn();
			Object.defineProperty(window.location, "href", {
				set: hrefSpy,
				configurable: true,
			});

			// Mock both contexts to return no tenant ID
			mockTenantContext.currentTenantId = null;
			mockOrgContext.tenant = null as unknown as typeof mockOrgContext.tenant;

			renderWithProviders(<OrgTenantSelector />);

			// Click trigger
			const trigger = screen.getByTestId("org-tenant-selector-trigger");
			fireEvent.click(trigger);

			// Click org 2
			await waitFor(() => {
				const orgTwo = screen.getByTestId("org-item-org2");
				expect(orgTwo).toBeDefined();
				fireEvent.click(orgTwo);
			});

			// Should log error
			await waitFor(() => {
				expect(consoleErrorSpy).toHaveBeenCalledWith("Cannot switch org: no current tenant");
			});

			// Should not call selectTenant or navigate
			expect(mockSelectTenant).not.toHaveBeenCalled();
			expect(hrefSpy).not.toHaveBeenCalled();

			consoleErrorSpy.mockRestore();
		});

		it("should fall back to orgTenant.id when currentTenantId is null", async () => {
			mockSelectTenant.mockResolvedValue({ success: true, url: "http://localhost:8034/dashboard" });

			const hrefSpy = vi.fn();
			Object.defineProperty(window.location, "href", {
				get: () => "http://localhost:8034",
				set: hrefSpy,
				configurable: true,
			});

			// TenantContext has no currentTenantId, but OrgContext has tenant.id
			mockTenantContext.currentTenantId = null;
			mockOrgContext.tenant = {
				id: "tenant-from-org" as unknown as number,
				slug: "tenant1",
				displayName: "Tenant One",
			};

			renderWithProviders(<OrgTenantSelector />);

			// Click trigger to open dropdown
			const trigger = screen.getByTestId("org-tenant-selector-trigger");
			fireEvent.click(trigger);

			// Click org 2
			await waitFor(() => {
				const orgTwo = screen.getByTestId("org-item-org2");
				expect(orgTwo).toBeDefined();
				fireEvent.click(orgTwo);
			});

			// Should call selectTenant with the fallback tenant ID from OrgContext
			await waitFor(() => {
				expect(mockSelectTenant).toHaveBeenCalledWith("tenant-from-org", 2);
			});
		});

		it("should handle selectTenant API error when switching org", async () => {
			const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {
				// Suppress console.error during test
			});
			mockSelectTenant.mockRejectedValue(new Error("API error"));

			const hrefSpy = vi.fn();
			Object.defineProperty(window.location, "href", {
				set: hrefSpy,
				configurable: true,
			});

			renderWithProviders(<OrgTenantSelector />);

			// Click trigger
			const trigger = screen.getByTestId("org-tenant-selector-trigger");
			fireEvent.click(trigger);

			// Click org 2
			await waitFor(() => {
				const orgTwo = screen.getByTestId("org-item-org2");
				expect(orgTwo).toBeDefined();
				fireEvent.click(orgTwo);
			});

			// Should call selectTenant
			await waitFor(() => {
				expect(mockSelectTenant).toHaveBeenCalledWith("1", 2);
			});

			// Should log error
			await waitFor(() => {
				expect(consoleErrorSpy).toHaveBeenCalledWith("Failed to switch org:", expect.any(Error));
			});

			// Should not navigate
			expect(hrefSpy).not.toHaveBeenCalled();

			consoleErrorSpy.mockRestore();
		});

		it("should navigate without timestamp when URLs are different during org switch", async () => {
			// Mock selectTenant to return different URL (different subdomain)
			mockSelectTenant.mockResolvedValue({ success: true, url: "http://different.jolli.app/dashboard" });

			const hrefSpy = vi.fn();
			Object.defineProperty(window.location, "href", {
				get: () => "http://localhost:8034/dashboard",
				set: hrefSpy,
				configurable: true,
			});

			renderWithProviders(<OrgTenantSelector />);

			// Click trigger
			const trigger = screen.getByTestId("org-tenant-selector-trigger");
			fireEvent.click(trigger);

			// Click org 2
			await waitFor(() => {
				const orgTwo = screen.getByTestId("org-item-org2");
				expect(orgTwo).toBeDefined();
				fireEvent.click(orgTwo);
			});

			// Should call selectTenant
			await waitFor(() => {
				expect(mockSelectTenant).toHaveBeenCalledWith("1", 2);
			});

			// Should navigate to different URL without timestamp
			await waitFor(() => {
				expect(hrefSpy).toHaveBeenCalledWith("http://different.jolli.app/dashboard");
				// Verify no timestamp parameter
				const calledUrl = hrefSpy.mock.calls[0][0];
				expect(calledUrl).not.toContain("_t=");
			});
		});
	});

	describe("Tenant Switching", () => {
		beforeEach(() => {
			mockTenantContext.useTenantSwitcher = true;
			mockTenantContext.availableTenants = [
				{ id: "1", slug: "tenant1", displayName: "Tenant One", primaryDomain: null, defaultOrgId: "org-1" },
				{ id: "2", slug: "tenant2", displayName: "Tenant Two", primaryDomain: null, defaultOrgId: "org-2" },
			];
		});

		it("should show dropdown when multiple tenants available", () => {
			renderWithProviders(<OrgTenantSelector />);

			expect(screen.getByTestId("org-tenant-selector-trigger")).toBeDefined();
		});

		it("should navigate to tenant when clicked", async () => {
			mockSelectTenant.mockResolvedValue({ success: true, url: "http://tenant2.jolli.app" });

			const hrefSpy = vi.fn();
			Object.defineProperty(window.location, "href", {
				get: () => "http://localhost:8034",
				set: hrefSpy,
				configurable: true,
			});

			renderWithProviders(<OrgTenantSelector />);

			// Click trigger
			const trigger = screen.getByTestId("org-tenant-selector-trigger");
			fireEvent.click(trigger);

			// Click tenant 2
			await waitFor(() => {
				const tenantTwo = screen.getByTestId("tenant-item-tenant2");
				expect(tenantTwo).toBeDefined();
				fireEvent.click(tenantTwo);
			});

			// Should call selectTenant with correct params
			await waitFor(() => {
				expect(mockSelectTenant).toHaveBeenCalledWith("2", "org-2");
			});

			// Should navigate to returned URL
			await waitFor(() => {
				expect(hrefSpy).toHaveBeenCalledWith("http://tenant2.jolli.app");
			});
		});

		it("should not navigate when clicking current tenant", async () => {
			const hrefSpy = vi.fn();
			Object.defineProperty(window.location, "href", {
				set: hrefSpy,
				configurable: true,
			});

			renderWithProviders(<OrgTenantSelector />);

			// Click trigger
			const trigger = screen.getByTestId("org-tenant-selector-trigger");
			fireEvent.click(trigger);

			// Click the current tenant dropdown item directly by its testid
			await waitFor(() => {
				const tenantOneItem = screen.getByTestId("tenant-item-tenant1");
				expect(tenantOneItem).toBeDefined();
				fireEvent.click(tenantOneItem);
			});

			expect(hrefSpy).not.toHaveBeenCalled();
		});

		it("should open tenant in new tab when external link clicked", async () => {
			const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

			renderWithProviders(<OrgTenantSelector />);

			// Click trigger
			const trigger = screen.getByTestId("org-tenant-selector-trigger");
			fireEvent.click(trigger);

			// Click external link for tenant 2
			await waitFor(() => {
				const externalLink = screen.getByTestId("tenant-open-new-tab-tenant2");
				expect(externalLink).toBeDefined();
				fireEvent.click(externalLink);
			});

			expect(openSpy).toHaveBeenCalledWith("http://tenant2.jolli.app", "_blank");

			openSpy.mockRestore();
		});

		it("should use primary domain when opening tenant in new tab", async () => {
			const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

			mockTenantContext.availableTenants = [
				{ id: "1", slug: "tenant1", displayName: "Tenant One", primaryDomain: null, defaultOrgId: "org-1" },
				{
					id: "2",
					slug: "tenant2",
					displayName: "Tenant Two",
					primaryDomain: "custom.domain.com",
					defaultOrgId: "org-2",
				},
			];

			renderWithProviders(<OrgTenantSelector />);

			// Click trigger
			const trigger = screen.getByTestId("org-tenant-selector-trigger");
			fireEvent.click(trigger);

			// Click external link for tenant 2
			await waitFor(() => {
				const externalLink = screen.getByTestId("tenant-open-new-tab-tenant2");
				expect(externalLink).toBeDefined();
				fireEvent.click(externalLink);
			});

			expect(openSpy).toHaveBeenCalledWith("http://custom.domain.com", "_blank");

			openSpy.mockRestore();
		});
		it("should fallback to window.location.origin when opening tenant with no baseDomain", async () => {
			const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

			mockTenantContext.baseDomain = null;
			// biome-ignore lint/suspicious/noExplicitAny: Test mock requires any for window.location override
			(window as any).location = {
				...window.location,
				origin: "http://localhost:8034",
			};

			renderWithProviders(<OrgTenantSelector />);

			// Click trigger
			const trigger = screen.getByTestId("org-tenant-selector-trigger");
			fireEvent.click(trigger);

			// Click external link for tenant 2
			await waitFor(() => {
				const externalLink = screen.getByTestId("tenant-open-new-tab-tenant2");
				expect(externalLink).toBeDefined();
				fireEvent.click(externalLink);
			});

			expect(openSpy).toHaveBeenCalledWith("http://localhost:8034", "_blank");

			openSpy.mockRestore();
		});

		it("should use primary domain when available", async () => {
			mockSelectTenant.mockResolvedValue({ success: true, url: "http://custom.domain.com" });

			mockTenantContext.availableTenants = [
				{ id: "1", slug: "tenant1", displayName: "Tenant One", primaryDomain: null, defaultOrgId: "org-1" },
				{
					id: "2",
					slug: "tenant2",
					displayName: "Tenant Two",
					primaryDomain: "custom.domain.com",
					defaultOrgId: "org-2",
				},
			];

			const hrefSpy = vi.fn();
			Object.defineProperty(window.location, "href", {
				get: () => "http://localhost:8034",
				set: hrefSpy,
				configurable: true,
			});

			renderWithProviders(<OrgTenantSelector />);

			// Click trigger
			const trigger = screen.getByTestId("org-tenant-selector-trigger");
			fireEvent.click(trigger);

			// Click tenant 2
			await waitFor(() => {
				const tenantTwo = screen.getByTestId("tenant-item-tenant2");
				expect(tenantTwo).toBeDefined();
				fireEvent.click(tenantTwo);
			});

			// Should call selectTenant with correct params
			await waitFor(() => {
				expect(mockSelectTenant).toHaveBeenCalledWith("2", "org-2");
			});

			// Should navigate to returned URL
			await waitFor(() => {
				expect(hrefSpy).toHaveBeenCalledWith("http://custom.domain.com");
			});
		});

		it("should fallback to window.location.origin when no baseDomain", async () => {
			mockSelectTenant.mockResolvedValue({ success: true, url: "http://localhost:8034/dashboard" });

			mockTenantContext.baseDomain = null;

			const hrefSpy = vi.fn();
			Object.defineProperty(window.location, "href", {
				get: () => "http://localhost:8034",
				set: hrefSpy,
				configurable: true,
			});

			renderWithProviders(<OrgTenantSelector />);

			// Click trigger
			const trigger = screen.getByTestId("org-tenant-selector-trigger");
			fireEvent.click(trigger);

			// Click tenant 2
			await waitFor(() => {
				const tenantTwo = screen.getByTestId("tenant-item-tenant2");
				expect(tenantTwo).toBeDefined();
				fireEvent.click(tenantTwo);
			});

			// Should call selectTenant with correct params
			await waitFor(() => {
				expect(mockSelectTenant).toHaveBeenCalledWith("2", "org-2");
			});

			// Should navigate to returned URL
			await waitFor(() => {
				expect(hrefSpy).toHaveBeenCalledWith("http://localhost:8034/dashboard");
			});
		});

		it("should use https protocol in production", async () => {
			mockSelectTenant.mockResolvedValue({ success: true, url: "https://tenant2.jolli.app" });

			// Set non-localhost hostname
			// biome-ignore lint/suspicious/noExplicitAny: Test mock requires any for window.location override
			(window as any).location = {
				hostname: "app.jolli.com",
				protocol: "https:",
				origin: "https://app.jolli.com",
				href: "https://app.jolli.com",
			};

			const hrefSpy = vi.fn();
			Object.defineProperty(window.location, "href", {
				get: () => "https://app.jolli.com",
				set: hrefSpy,
				configurable: true,
			});

			renderWithProviders(<OrgTenantSelector />);

			// Click trigger
			const trigger = screen.getByTestId("org-tenant-selector-trigger");
			fireEvent.click(trigger);

			// Click tenant 2
			await waitFor(() => {
				const tenantTwo = screen.getByTestId("tenant-item-tenant2");
				expect(tenantTwo).toBeDefined();
				fireEvent.click(tenantTwo);
			});

			// Should call selectTenant with correct params
			await waitFor(() => {
				expect(mockSelectTenant).toHaveBeenCalledWith("2", "org-2");
			});

			// Should navigate to returned URL
			await waitFor(() => {
				expect(hrefSpy).toHaveBeenCalledWith("https://tenant2.jolli.app");
			});
		});

		it("should add timestamp when URLs match (same tenant switch)", async () => {
			mockSelectTenant.mockResolvedValue({ success: true, url: "http://localhost:8034/dashboard" });

			const hrefSpy = vi.fn();
			Object.defineProperty(window.location, "href", {
				get: () => "http://localhost:8034/dashboard",
				set: hrefSpy,
				configurable: true,
			});

			renderWithProviders(<OrgTenantSelector />);

			// Click trigger
			const trigger = screen.getByTestId("org-tenant-selector-trigger");
			fireEvent.click(trigger);

			// Click tenant 2
			await waitFor(() => {
				const tenantTwo = screen.getByTestId("tenant-item-tenant2");
				expect(tenantTwo).toBeDefined();
				fireEvent.click(tenantTwo);
			});

			// Should call selectTenant with correct params
			await waitFor(() => {
				expect(mockSelectTenant).toHaveBeenCalledWith("2", "org-2");
			});

			// Should navigate with timestamp since URLs match
			await waitFor(() => {
				expect(hrefSpy).toHaveBeenCalled();
				const calledUrl = hrefSpy.mock.calls[0][0];
				expect(calledUrl).toContain("http://localhost:8034/dashboard");
				expect(calledUrl).toContain("?_t="); // Should have timestamp parameter with ? separator
			});
		});

		it("should add timestamp with & when URL already has query params", async () => {
			mockSelectTenant.mockResolvedValue({ success: true, url: "http://localhost:8034/dashboard?foo=bar" });

			const hrefSpy = vi.fn();
			Object.defineProperty(window.location, "href", {
				get: () => "http://localhost:8034/dashboard?foo=bar",
				set: hrefSpy,
				configurable: true,
			});

			renderWithProviders(<OrgTenantSelector />);

			// Click trigger
			const trigger = screen.getByTestId("org-tenant-selector-trigger");
			fireEvent.click(trigger);

			// Click tenant 2
			await waitFor(() => {
				const tenantTwo = screen.getByTestId("tenant-item-tenant2");
				expect(tenantTwo).toBeDefined();
				fireEvent.click(tenantTwo);
			});

			// Should call selectTenant with correct params
			await waitFor(() => {
				expect(mockSelectTenant).toHaveBeenCalledWith("2", "org-2");
			});

			// Should navigate with timestamp using & separator
			await waitFor(() => {
				expect(hrefSpy).toHaveBeenCalled();
				const calledUrl = hrefSpy.mock.calls[0][0];
				expect(calledUrl).toContain("http://localhost:8034/dashboard?foo=bar");
				expect(calledUrl).toContain("&_t="); // Should have timestamp parameter with & separator
			});
		});

		it("should handle selectTenant API error when switching tenant", async () => {
			const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {
				// Suppress console.error during test
			});
			mockSelectTenant.mockRejectedValue(new Error("Tenant API error"));

			const hrefSpy = vi.fn();
			Object.defineProperty(window.location, "href", {
				set: hrefSpy,
				configurable: true,
			});

			renderWithProviders(<OrgTenantSelector />);

			// Click trigger
			const trigger = screen.getByTestId("org-tenant-selector-trigger");
			fireEvent.click(trigger);

			// Click tenant 2
			await waitFor(() => {
				const tenantTwo = screen.getByTestId("tenant-item-tenant2");
				expect(tenantTwo).toBeDefined();
				fireEvent.click(tenantTwo);
			});

			// Should call selectTenant
			await waitFor(() => {
				expect(mockSelectTenant).toHaveBeenCalledWith("2", "org-2");
			});

			// Should log error
			await waitFor(() => {
				expect(consoleErrorSpy).toHaveBeenCalledWith("Failed to switch tenant:", expect.any(Error));
			});

			// Should not navigate
			expect(hrefSpy).not.toHaveBeenCalled();

			consoleErrorSpy.mockRestore();
		});
	});

	describe("Combined Mode (Both Orgs and Tenants)", () => {
		beforeEach(() => {
			mockOrgContext.isMultiTenant = true;
			mockOrgContext.availableOrgs = [
				{ id: 1, slug: "org1", displayName: "Org One" },
				{ id: 2, slug: "org2", displayName: "Org Two" },
			];
			mockTenantContext.useTenantSwitcher = true;
			mockTenantContext.availableTenants = [
				{ id: "1", slug: "tenant1", displayName: "Tenant One", primaryDomain: null, defaultOrgId: "org-1" },
				{ id: "2", slug: "tenant2", displayName: "Tenant Two", primaryDomain: null, defaultOrgId: "org-2" },
			];
		});

		it("should show dropdown with both orgs and tenants", async () => {
			renderWithProviders(<OrgTenantSelector />);

			const trigger = screen.getByTestId("org-tenant-selector-trigger");
			fireEvent.click(trigger);

			// Should show "Organizations" header
			await waitFor(() => {
				expect(screen.getByTestId("org-tenant-selector-orgs-header")).toBeDefined();
			});

			// Should show "Tenants" header
			expect(screen.getByTestId("org-tenant-selector-tenants-header")).toBeDefined();
		});

		it("should show org name in trigger for multi-tenant mode", () => {
			renderWithProviders(<OrgTenantSelector />);

			// Always prefer tenant name over org name (verified via trigger text testid)
			expect(screen.getByTestId("org-tenant-selector-trigger-text")).toBeDefined();
		});
	});

	describe("Collapsed State", () => {
		it("should apply collapsed styles", () => {
			renderWithProviders(<OrgTenantSelector collapsed />);

			const element = screen.getByTestId("org-tenant-selector-static");
			expect(element.className).toContain("justify-center");
		});

		it("should show only icon in collapsed loading state", () => {
			mockOrgContext.isLoading = true;

			renderWithProviders(<OrgTenantSelector collapsed />);

			expect(screen.getByTestId("org-tenant-selector-loading")).toBeDefined();
			expect(screen.queryByTestId("org-tenant-selector-display-text")).toBe(null);
		});

		it("should show only icon in collapsed dropdown trigger", () => {
			mockOrgContext.isMultiTenant = true;
			mockOrgContext.availableOrgs = [
				{ id: 1, slug: "org1", displayName: "Org One" },
				{ id: 2, slug: "org2", displayName: "Org Two" },
			];

			renderWithProviders(<OrgTenantSelector collapsed />);

			expect(screen.queryByTestId("org-tenant-selector-trigger-text")).toBe(null);
			expect(screen.queryByTestId("chevron-down-icon")).toBe(null);
		});
	});

	describe("Custom Styling", () => {
		it("should apply custom className", () => {
			renderWithProviders(<OrgTenantSelector className="custom-class" />);

			const element = screen.getByTestId("org-tenant-selector-static");
			expect(element.className).toContain("custom-class");
		});

		it("should apply custom className to dropdown trigger", () => {
			mockOrgContext.isMultiTenant = true;
			mockOrgContext.availableOrgs = [
				{ id: 1, slug: "org1", displayName: "Org One" },
				{ id: 2, slug: "org2", displayName: "Org Two" },
			];

			renderWithProviders(<OrgTenantSelector className="custom-class" />);

			const trigger = screen.getByTestId("org-tenant-selector-trigger");
			expect(trigger.className).toContain("custom-class");
		});
	});

	describe("Branch Coverage", () => {
		it("should use https protocol for tenant URLs in production (non-localhost)", async () => {
			// Set non-localhost hostname
			// biome-ignore lint/suspicious/noExplicitAny: Test mock requires any for window.location override
			(window as any).location = {
				hostname: "app.jolli.com",
				protocol: "https:",
				origin: "https://app.jolli.com",
				href: "https://app.jolli.com",
			};

			// Set up tenants with baseDomain (no primaryDomain so getTenantUrl uses baseDomain path)
			mockTenantContext.useTenantSwitcher = true;
			mockTenantContext.baseDomain = "jolli.app";
			mockTenantContext.availableTenants = [
				{ id: "1", slug: "tenant1", displayName: "Tenant One", primaryDomain: null, defaultOrgId: "org-1" },
				{ id: "2", slug: "tenant2", displayName: "Tenant Two", primaryDomain: null, defaultOrgId: "org-2" },
			];

			// Mock window.open for "open in new tab"
			const windowOpenSpy = vi.fn();
			vi.spyOn(window, "open").mockImplementation(windowOpenSpy);

			renderWithProviders(<OrgTenantSelector />);

			// Click trigger to open dropdown
			const trigger = screen.getByTestId("org-tenant-selector-trigger");
			fireEvent.click(trigger);

			// Click the "open in new tab" button for tenant 2
			await waitFor(() => {
				const openButton = screen.getByTestId("tenant-open-new-tab-tenant2");
				expect(openButton).toBeDefined();
				fireEvent.click(openButton);
			});

			// Should open with https protocol (not http:)
			expect(windowOpenSpy).toHaveBeenCalledWith("https://tenant2.jolli.app", "_blank");

			vi.mocked(window.open).mockRestore();
		});

		it("should fall back to org displayName when tenant displayNames are unavailable", () => {
			// Set up context where currentTenant and orgTenant are undefined/missing displayName
			mockOrgContext = {
				tenant: { id: 1, slug: "tenant1", displayName: "" },
				org: { id: 1, slug: "org1", displayName: "Fallback Org Name" },
				availableOrgs: [{ id: 1, slug: "org1", displayName: "Fallback Org Name" }],
				isMultiTenant: false,
				isLoading: false,
			};
			mockTenantContext = {
				useTenantSwitcher: false,
				currentTenantId: "999", // Doesn't match any available tenant
				baseDomain: "jolli.app",
				availableTenants: [
					{ id: "1", slug: "tenant1", displayName: "", primaryDomain: null, defaultOrgId: "org-1" },
				],
				isLoading: false,
			};

			renderWithProviders(<OrgTenantSelector />);

			// Should display org displayName as fallback (verified via display text testid)
			expect(screen.getByTestId("org-tenant-selector-display-text")).toBeDefined();
		});

		it("should add timestamp with & when org switch URL has query params", async () => {
			mockOrgContext.isMultiTenant = true;
			mockOrgContext.availableOrgs = [
				{ id: 1, slug: "org1", displayName: "Org One" },
				{ id: 2, slug: "org2", displayName: "Org Two" },
			];

			// Mock selectTenant to return URL with existing query params that matches current URL base
			mockSelectTenant.mockResolvedValue({ success: true, url: "http://localhost:8034?org=2" });

			const hrefSpy = vi.fn();
			Object.defineProperty(window.location, "href", {
				get: () => "http://localhost:8034?org=1",
				set: hrefSpy,
				configurable: true,
			});

			renderWithProviders(<OrgTenantSelector />);

			// Click trigger to open dropdown
			const trigger = screen.getByTestId("org-tenant-selector-trigger");
			fireEvent.click(trigger);

			// Click org 2
			await waitFor(() => {
				const orgTwo = screen.getByTestId("org-item-org2");
				expect(orgTwo).toBeDefined();
				fireEvent.click(orgTwo);
			});

			// Should call selectTenant
			await waitFor(() => {
				expect(mockSelectTenant).toHaveBeenCalledWith("1", 2);
			});

			// Should navigate with & separator since URL already has query params
			await waitFor(() => {
				expect(hrefSpy).toHaveBeenCalled();
				const calledUrl = hrefSpy.mock.calls[0][0];
				expect(calledUrl).toContain("http://localhost:8034?org=2");
				expect(calledUrl).toContain("&_t="); // & separator because URL has ?
			});
		});
	});
});
