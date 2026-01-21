import { ClientProvider } from "./ClientContext";
import { OrgProvider, useAvailableOrgs, useOrg } from "./OrgContext";
import { render, waitFor } from "@testing-library/preact";
import type { CurrentOrgResponse, OrgSummary } from "jolli-common";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockTenant = {
	id: "tenant-123",
	slug: "test-tenant",
	displayName: "Test Tenant",
};

const mockOrg = {
	id: "org-123",
	slug: "engineering",
	displayName: "Engineering",
	schemaName: "org_engineering",
};

const mockAvailableOrgs: Array<OrgSummary> = [
	{
		id: "org-1",
		tenantId: "tenant-123",
		slug: "engineering",
		displayName: "Engineering",
		schemaName: "org_engineering",
		status: "active",
		isDefault: true,
		createdAt: new Date("2024-01-01"),
	},
	{
		id: "org-2",
		tenantId: "tenant-123",
		slug: "marketing",
		displayName: "Marketing",
		schemaName: "org_marketing",
		status: "active",
		isDefault: false,
		createdAt: new Date("2024-01-01"),
	},
];

const mockCurrentOrgResponse: CurrentOrgResponse = {
	tenant: mockTenant,
	org: mockOrg,
	availableOrgs: mockAvailableOrgs,
};

const mockOrgClient = {
	getCurrent: vi.fn().mockResolvedValue(mockCurrentOrgResponse),
	listOrgs: vi.fn().mockResolvedValue({ orgs: mockAvailableOrgs }),
};

const mockClient = {
	orgs: vi.fn(() => mockOrgClient),
};

vi.mock("jolli-common", async () => {
	const actual = await vi.importActual<typeof import("jolli-common")>("jolli-common");
	return {
		...actual,
		createClient: vi.fn(() => mockClient),
	};
});

describe("OrgContext", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockOrgClient.getCurrent.mockResolvedValue(mockCurrentOrgResponse);
		sessionStorage.clear();
	});

	describe("useOrg", () => {
		it("should provide org info when in multi-tenant mode", async () => {
			let context: ReturnType<typeof useOrg> | undefined;

			function TestComponent(): ReactElement {
				context = useOrg();
				return <div>Test</div>;
			}

			render(
				<ClientProvider>
					<OrgProvider>
						<TestComponent />
					</OrgProvider>
				</ClientProvider>,
			);

			await waitFor(() => {
				expect(context?.isLoading).toBe(false);
				expect(context?.tenant).toEqual(mockTenant);
				expect(context?.org).toEqual(mockOrg);
				expect(context?.availableOrgs).toHaveLength(2);
				expect(context?.isMultiTenant).toBe(true);
				expect(context?.error).toBeUndefined();
			});
		});

		it("should handle single-tenant mode with null values", async () => {
			mockOrgClient.getCurrent.mockResolvedValue({
				tenant: null,
				org: null,
				availableOrgs: [],
			});

			let context: ReturnType<typeof useOrg> | undefined;

			function TestComponent(): ReactElement {
				context = useOrg();
				return <div>Test</div>;
			}

			render(
				<ClientProvider>
					<OrgProvider>
						<TestComponent />
					</OrgProvider>
				</ClientProvider>,
			);

			await waitFor(() => {
				expect(context?.isLoading).toBe(false);
				expect(context?.tenant).toBeNull();
				expect(context?.org).toBeNull();
				expect(context?.availableOrgs).toEqual([]);
				expect(context?.isMultiTenant).toBe(false);
			});
		});

		it("should handle loading state", () => {
			let context: ReturnType<typeof useOrg> | undefined;

			function TestComponent(): ReactElement {
				context = useOrg();
				return <div>Test</div>;
			}

			render(
				<ClientProvider>
					<OrgProvider>
						<TestComponent />
					</OrgProvider>
				</ClientProvider>,
			);

			// Initially should be loading
			expect(context?.isLoading).toBe(true);
		});

		it("should handle errors when fetching org info", async () => {
			mockOrgClient.getCurrent.mockRejectedValue(new Error("Network error"));

			let context: ReturnType<typeof useOrg> | undefined;

			function TestComponent(): ReactElement {
				context = useOrg();
				return <div>Test</div>;
			}

			render(
				<ClientProvider>
					<OrgProvider>
						<TestComponent />
					</OrgProvider>
				</ClientProvider>,
			);

			await waitFor(() => {
				expect(context?.error).toBe("Network error");
				expect(context?.isLoading).toBe(false);
				expect(context?.isMultiTenant).toBe(false);
			});
		});

		it("should handle non-Error exceptions", async () => {
			mockOrgClient.getCurrent.mockRejectedValue("String error");

			let context: ReturnType<typeof useOrg> | undefined;

			function TestComponent(): ReactElement {
				context = useOrg();
				return <div>Test</div>;
			}

			render(
				<ClientProvider>
					<OrgProvider>
						<TestComponent />
					</OrgProvider>
				</ClientProvider>,
			);

			await waitFor(() => {
				expect(context?.error).toBe("Failed to load org info");
				expect(context?.isLoading).toBe(false);
			});
		});

		it("should throw error when useOrg is used outside provider", () => {
			function TestComponent(): ReactElement {
				useOrg();
				return <div>Test</div>;
			}

			expect(() => {
				render(<TestComponent />);
			}).toThrow("useOrg must be used within an OrgProvider");
		});

		it("should clear selectedOrgSlug and retry when org request fails", async () => {
			// Set an invalid org slug in session storage
			sessionStorage.setItem("selectedOrgSlug", "archived-org");

			// First call fails (simulating archived/deleted org), second call succeeds
			mockOrgClient.getCurrent
				.mockRejectedValueOnce(new Error("Failed to get current org: 403"))
				.mockResolvedValueOnce(mockCurrentOrgResponse);

			let context: ReturnType<typeof useOrg> | undefined;

			function TestComponent(): ReactElement {
				context = useOrg();
				return <div>Test</div>;
			}

			render(
				<ClientProvider>
					<OrgProvider>
						<TestComponent />
					</OrgProvider>
				</ClientProvider>,
			);

			await waitFor(() => {
				expect(context?.isLoading).toBe(false);
				expect(context?.error).toBeUndefined();
				expect(context?.tenant).toEqual(mockTenant);
				expect(context?.org).toEqual(mockOrg);
			});

			// Should have cleared the invalid org slug from session storage
			expect(sessionStorage.getItem("selectedOrgSlug")).toBeNull();
			// Should have called getCurrent twice (original + retry)
			expect(mockOrgClient.getCurrent).toHaveBeenCalledTimes(2);
		});

		it("should show error if retry also fails after clearing selectedOrgSlug", async () => {
			// Set an invalid org slug in session storage
			sessionStorage.setItem("selectedOrgSlug", "archived-org");

			// Both calls fail
			mockOrgClient.getCurrent.mockRejectedValue(new Error("Network error"));

			let context: ReturnType<typeof useOrg> | undefined;

			function TestComponent(): ReactElement {
				context = useOrg();
				return <div>Test</div>;
			}

			render(
				<ClientProvider>
					<OrgProvider>
						<TestComponent />
					</OrgProvider>
				</ClientProvider>,
			);

			await waitFor(() => {
				expect(context?.isLoading).toBe(false);
				expect(context?.error).toBe("Network error");
			});

			// Should have cleared the invalid org slug from session storage
			expect(sessionStorage.getItem("selectedOrgSlug")).toBeNull();
			// Should have called getCurrent twice (original + retry)
			expect(mockOrgClient.getCurrent).toHaveBeenCalledTimes(2);
		});

		it("should provide refresh function to reload org info", async () => {
			let context: ReturnType<typeof useOrg> | undefined;

			function TestComponent(): ReactElement {
				context = useOrg();
				return <div>Test</div>;
			}

			render(
				<ClientProvider>
					<OrgProvider>
						<TestComponent />
					</OrgProvider>
				</ClientProvider>,
			);

			await waitFor(() => {
				expect(context?.isLoading).toBe(false);
			});

			// Call refresh
			expect(mockOrgClient.getCurrent).toHaveBeenCalledTimes(1);
			await context?.refresh();
			expect(mockOrgClient.getCurrent).toHaveBeenCalledTimes(2);
		});
	});

	describe("useAvailableOrgs", () => {
		it("should return available orgs list", async () => {
			let orgs: Array<OrgSummary> | undefined;

			function TestComponent(): ReactElement {
				orgs = useAvailableOrgs();
				return <div>Test</div>;
			}

			render(
				<ClientProvider>
					<OrgProvider>
						<TestComponent />
					</OrgProvider>
				</ClientProvider>,
			);

			await waitFor(() => {
				expect(orgs).toHaveLength(2);
				expect(orgs?.[0].slug).toBe("engineering");
				expect(orgs?.[1].slug).toBe("marketing");
			});
		});

		it("should return empty array when in single-tenant mode", async () => {
			mockOrgClient.getCurrent.mockResolvedValue({
				tenant: null,
				org: null,
				availableOrgs: [],
			});

			let orgs: Array<OrgSummary> | undefined;

			function TestComponent(): ReactElement {
				orgs = useAvailableOrgs();
				return <div>Test</div>;
			}

			render(
				<ClientProvider>
					<OrgProvider>
						<TestComponent />
					</OrgProvider>
				</ClientProvider>,
			);

			await waitFor(() => {
				expect(orgs).toEqual([]);
			});
		});

		it("should throw error when useAvailableOrgs is used outside provider", () => {
			function TestComponent(): ReactElement {
				useAvailableOrgs();
				return <div>Test</div>;
			}

			expect(() => {
				render(<TestComponent />);
			}).toThrow("useOrg must be used within an OrgProvider");
		});
	});
});
