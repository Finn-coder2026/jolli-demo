import { ClientProvider } from "./ClientContext";
import { TenantProvider, useAvailableTenants, useTenant } from "./TenantContext";
import { render, waitFor } from "@testing-library/preact";
import type { TenantListItem, TenantListResponse } from "jolli-common";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockTenants: Array<TenantListItem> = [
	{
		id: "tenant-1",
		slug: "acme",
		displayName: "Acme Corp",
		primaryDomain: null,
	},
	{
		id: "tenant-2",
		slug: "beta",
		displayName: "Beta Inc",
		primaryDomain: "beta.example.com",
	},
];

const mockTenantListResponse: TenantListResponse = {
	useTenantSwitcher: true,
	currentTenantId: "tenant-1",
	baseDomain: "jolli.app",
	tenants: mockTenants,
};

const mockTenantClient = {
	listTenants: vi.fn().mockResolvedValue(mockTenantListResponse),
};

const mockClient = {
	tenants: vi.fn(() => mockTenantClient),
};

vi.mock("jolli-common", async () => {
	const actual = await vi.importActual<typeof import("jolli-common")>("jolli-common");
	return {
		...actual,
		createClient: vi.fn(() => mockClient),
	};
});

describe("TenantContext", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockTenantClient.listTenants.mockResolvedValue(mockTenantListResponse);
	});

	describe("useTenant", () => {
		it("should provide tenant info when tenant switcher is enabled", async () => {
			let context: ReturnType<typeof useTenant> | undefined;

			function TestComponent(): ReactElement {
				context = useTenant();
				return <div>Test</div>;
			}

			render(
				<ClientProvider>
					<TenantProvider>
						<TestComponent />
					</TenantProvider>
				</ClientProvider>,
			);

			await waitFor(() => {
				expect(context?.isLoading).toBe(false);
				expect(context?.useTenantSwitcher).toBe(true);
				expect(context?.currentTenantId).toBe("tenant-1");
				expect(context?.baseDomain).toBe("jolli.app");
				expect(context?.availableTenants).toHaveLength(2);
				expect(context?.error).toBeUndefined();
			});
		});

		it("should handle tenant switcher disabled", async () => {
			mockTenantClient.listTenants.mockResolvedValue({
				useTenantSwitcher: false,
				currentTenantId: null,
				baseDomain: null,
				tenants: [],
			});

			let context: ReturnType<typeof useTenant> | undefined;

			function TestComponent(): ReactElement {
				context = useTenant();
				return <div>Test</div>;
			}

			render(
				<ClientProvider>
					<TenantProvider>
						<TestComponent />
					</TenantProvider>
				</ClientProvider>,
			);

			await waitFor(() => {
				expect(context?.isLoading).toBe(false);
				expect(context?.useTenantSwitcher).toBe(false);
				expect(context?.currentTenantId).toBeNull();
				expect(context?.baseDomain).toBeNull();
				expect(context?.availableTenants).toEqual([]);
			});
		});

		it("should handle loading state", () => {
			let context: ReturnType<typeof useTenant> | undefined;

			function TestComponent(): ReactElement {
				context = useTenant();
				return <div>Test</div>;
			}

			render(
				<ClientProvider>
					<TenantProvider>
						<TestComponent />
					</TenantProvider>
				</ClientProvider>,
			);

			// Initially should be loading
			expect(context?.isLoading).toBe(true);
		});

		it("should handle errors when fetching tenant info", async () => {
			mockTenantClient.listTenants.mockRejectedValue(new Error("Network error"));

			let context: ReturnType<typeof useTenant> | undefined;

			function TestComponent(): ReactElement {
				context = useTenant();
				return <div>Test</div>;
			}

			render(
				<ClientProvider>
					<TenantProvider>
						<TestComponent />
					</TenantProvider>
				</ClientProvider>,
			);

			await waitFor(() => {
				expect(context?.error).toBe("Network error");
				expect(context?.isLoading).toBe(false);
				expect(context?.useTenantSwitcher).toBe(false);
			});
		});

		it("should handle non-Error exceptions", async () => {
			mockTenantClient.listTenants.mockRejectedValue("String error");

			let context: ReturnType<typeof useTenant> | undefined;

			function TestComponent(): ReactElement {
				context = useTenant();
				return <div>Test</div>;
			}

			render(
				<ClientProvider>
					<TenantProvider>
						<TestComponent />
					</TenantProvider>
				</ClientProvider>,
			);

			await waitFor(() => {
				expect(context?.error).toBe("Failed to load tenant info");
				expect(context?.isLoading).toBe(false);
			});
		});

		it("should throw error when useTenant is used outside provider", () => {
			function TestComponent(): ReactElement {
				useTenant();
				return <div>Test</div>;
			}

			expect(() => {
				render(<TestComponent />);
			}).toThrow("useTenant must be used within a TenantProvider");
		});

		it("should provide refresh function to reload tenant info", async () => {
			let context: ReturnType<typeof useTenant> | undefined;

			function TestComponent(): ReactElement {
				context = useTenant();
				return <div>Test</div>;
			}

			render(
				<ClientProvider>
					<TenantProvider>
						<TestComponent />
					</TenantProvider>
				</ClientProvider>,
			);

			await waitFor(() => {
				expect(context?.isLoading).toBe(false);
			});

			// Call refresh
			expect(mockTenantClient.listTenants).toHaveBeenCalledTimes(1);
			await context?.refresh();
			expect(mockTenantClient.listTenants).toHaveBeenCalledTimes(2);
		});

		it("should return tenant data with primary domain", async () => {
			let context: ReturnType<typeof useTenant> | undefined;

			function TestComponent(): ReactElement {
				context = useTenant();
				return <div>Test</div>;
			}

			render(
				<ClientProvider>
					<TenantProvider>
						<TestComponent />
					</TenantProvider>
				</ClientProvider>,
			);

			await waitFor(() => {
				expect(context?.isLoading).toBe(false);
			});

			// Verify tenant with primary domain
			const betaTenant = context?.availableTenants.find(t => t.slug === "beta");
			expect(betaTenant?.primaryDomain).toBe("beta.example.com");

			// Verify tenant without primary domain
			const acmeTenant = context?.availableTenants.find(t => t.slug === "acme");
			expect(acmeTenant?.primaryDomain).toBeNull();
		});
	});

	describe("useAvailableTenants", () => {
		it("should return available tenants list", async () => {
			let tenants: Array<TenantListItem> | undefined;

			function TestComponent(): ReactElement {
				tenants = useAvailableTenants();
				return <div>Test</div>;
			}

			render(
				<ClientProvider>
					<TenantProvider>
						<TestComponent />
					</TenantProvider>
				</ClientProvider>,
			);

			await waitFor(() => {
				expect(tenants).toHaveLength(2);
				expect(tenants?.[0].slug).toBe("acme");
				expect(tenants?.[1].slug).toBe("beta");
			});
		});

		it("should return empty array when tenant switcher is disabled", async () => {
			mockTenantClient.listTenants.mockResolvedValue({
				useTenantSwitcher: false,
				currentTenantId: null,
				baseDomain: null,
				tenants: [],
			});

			let tenants: Array<TenantListItem> | undefined;

			function TestComponent(): ReactElement {
				tenants = useAvailableTenants();
				return <div>Test</div>;
			}

			render(
				<ClientProvider>
					<TenantProvider>
						<TestComponent />
					</TenantProvider>
				</ClientProvider>,
			);

			await waitFor(() => {
				expect(tenants).toEqual([]);
			});
		});

		it("should throw error when useAvailableTenants is used outside provider", () => {
			function TestComponent(): ReactElement {
				useAvailableTenants();
				return <div>Test</div>;
			}

			expect(() => {
				render(<TestComponent />);
			}).toThrow("useTenant must be used within a TenantProvider");
		});
	});
});
