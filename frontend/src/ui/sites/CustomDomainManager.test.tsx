import { createMockClient, renderWithProviders } from "../../test/TestUtils";
import {
	CustomDomainManager,
	DOMAIN_PATTERN,
	getSimplifiedDnsInstruction,
	POLLING_INTERVAL_MS,
	simplifyDnsRecordName,
	validateDomain,
} from "./CustomDomainManager";
import { act, fireEvent, screen, waitFor } from "@testing-library/preact";
import type { CustomDomainInfo, SiteClient, SiteMetadata, SiteWithUpdate } from "jolli-common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface MockSiteOverrides extends Omit<Partial<SiteWithUpdate>, "metadata"> {
	metadata?: Partial<SiteMetadata>;
}

// Mock lucide-react icons
vi.mock("lucide-react", async importOriginal => {
	const actual = await importOriginal<typeof import("lucide-react")>();
	return {
		...actual,
		CheckCircle: () => <div data-testid="status-verified" />,
		Clock: () => <div data-testid="status-pending" />,
		XCircle: () => <div data-testid="status-failed" />,
		Copy: () => <div data-testid="copy-icon" />,
		Plus: () => <div data-testid="plus-icon" />,
		RefreshCw: () => <div data-testid="refresh-icon" />,
		Trash2: () => <div data-testid="trash-icon" />,
	};
});

const mockSiteClient = {
	getSite: vi.fn(),
	addCustomDomain: vi.fn(),
	removeCustomDomain: vi.fn(),
	verifyCustomDomain: vi.fn(),
	refreshDomainStatuses: vi.fn(),
};

function createMockSite(overrides: MockSiteOverrides = {}): SiteWithUpdate {
	const defaultMetadata: SiteMetadata = {
		githubRepo: "test-org/test-site",
		githubUrl: "https://github.com/test-org/test-site",
		framework: "nextra",
		articleCount: 5,
		customDomains: [],
	};

	// Extract metadata from overrides to merge properly
	const { metadata: overrideMetadata, ...restOverrides } = overrides;

	return {
		id: 1,
		name: "test-site",
		displayName: "Test Site",
		userId: 1,
		visibility: "external",
		status: "active",
		needsUpdate: false,
		metadata: overrideMetadata ? { ...defaultMetadata, ...overrideMetadata } : defaultMetadata,
		lastGeneratedAt: "2024-01-01T00:00:00Z",
		createdAt: "2024-01-01T00:00:00Z",
		updatedAt: "2024-01-01T00:00:00Z",
		...restOverrides,
	};
}

function createMockDomain(overrides: Partial<CustomDomainInfo> = {}): CustomDomainInfo {
	return {
		domain: "docs.example.com",
		status: "pending",
		addedAt: "2024-01-01T00:00:00Z",
		...overrides,
	};
}

describe("CustomDomainManager", () => {
	const mockOnUpdate = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
		mockSiteClient.getSite.mockResolvedValue(createMockSite());
		mockSiteClient.addCustomDomain.mockResolvedValue({ domain: createMockDomain() });
		mockSiteClient.removeCustomDomain.mockResolvedValue({});
		mockSiteClient.verifyCustomDomain.mockResolvedValue({ domain: createMockDomain({ status: "verified" }) });
		mockSiteClient.refreshDomainStatuses.mockResolvedValue({ domains: [] });
		// Mock clipboard
		Object.assign(navigator, {
			clipboard: {
				writeText: vi.fn().mockResolvedValue(undefined),
			},
		});
	});

	function renderCustomDomainManager(site: SiteWithUpdate = createMockSite()) {
		const mockClient = createMockClient();
		mockClient.sites = vi.fn(() => mockSiteClient as unknown as SiteClient);

		return renderWithProviders(<CustomDomainManager site={site} onUpdate={mockOnUpdate} />, {
			client: mockClient,
		});
	}

	describe("helper functions", () => {
		describe("validateDomain", () => {
			it("should accept valid domains", () => {
				expect(validateDomain("example.com")).toBe(true);
				expect(validateDomain("docs.example.com")).toBe(true);
				expect(validateDomain("my-docs.example.co.uk")).toBe(true);
			});

			it("should reject invalid domains", () => {
				expect(validateDomain("example")).toBe(false);
				expect(validateDomain("example.")).toBe(false);
				expect(validateDomain(".example.com")).toBe(false);
				expect(validateDomain("example..com")).toBe(false);
				expect(validateDomain("-example.com")).toBe(false);
			});
		});

		describe("DOMAIN_PATTERN", () => {
			it("should match valid domain patterns", () => {
				expect(DOMAIN_PATTERN.test("example.com")).toBe(true);
				expect(DOMAIN_PATTERN.test("sub.example.com")).toBe(true);
				expect(DOMAIN_PATTERN.test("my-site.example.co.uk")).toBe(true);
			});

			it("should not match invalid patterns", () => {
				expect(DOMAIN_PATTERN.test("example")).toBe(false);
				expect(DOMAIN_PATTERN.test("example.c")).toBe(false);
			});
		});

		describe("getSimplifiedDnsInstruction", () => {
			it("should return CNAME for subdomain", () => {
				const result = getSimplifiedDnsInstruction("docs.example.com");
				expect(result).toEqual({
					type: "CNAME",
					name: "docs",
					value: "cname.vercel-dns.com",
				});
			});

			it("should return CNAME for deeply nested subdomain", () => {
				const result = getSimplifiedDnsInstruction("api.docs.example.com");
				expect(result).toEqual({
					type: "CNAME",
					name: "api.docs",
					value: "cname.vercel-dns.com",
				});
			});

			it("should return CNAME for triple nested subdomain", () => {
				const result = getSimplifiedDnsInstruction("v2.api.docs.example.com");
				expect(result).toEqual({
					type: "CNAME",
					name: "v2.api.docs",
					value: "cname.vercel-dns.com",
				});
			});

			it("should return A record for apex domain", () => {
				const result = getSimplifiedDnsInstruction("example.com");
				expect(result).toEqual({
					type: "A",
					name: "@",
					value: "76.76.21.21",
				});
			});
		});

		describe("POLLING_INTERVAL_MS", () => {
			it("should be 10 seconds", () => {
				expect(POLLING_INTERVAL_MS).toBe(10000);
			});
		});

		describe("simplifyDnsRecordName", () => {
			it("should strip apex domain from TXT record name", () => {
				expect(simplifyDnsRecordName("_vercel.aidancrosbie.com", "aidancrosbie.com")).toBe("_vercel");
			});

			it("should strip apex domain when user domain is a subdomain", () => {
				expect(simplifyDnsRecordName("_vercel.example.com", "docs.example.com")).toBe("_vercel");
			});

			it("should preserve subdomain prefix in TXT record", () => {
				expect(simplifyDnsRecordName("_vercel.docs.example.com", "docs.example.com")).toBe("_vercel.docs");
			});

			it("should return @ when record name equals apex domain", () => {
				expect(simplifyDnsRecordName("example.com", "example.com")).toBe("@");
			});

			it("should return unchanged if no domain suffix match", () => {
				expect(simplifyDnsRecordName("_vercel", "example.com")).toBe("_vercel");
			});

			it("should handle deeply nested subdomains", () => {
				expect(simplifyDnsRecordName("_vercel.api.docs.example.com", "api.docs.example.com")).toBe(
					"_vercel.api.docs",
				);
			});
		});
	});

	describe("rendering", () => {
		it("should render title", () => {
			renderCustomDomainManager();
			expect(screen.getByText("Custom Domain")).toBeDefined();
		});

		it("should show add button when no domains exist", () => {
			renderCustomDomainManager();
			expect(screen.getByTestId("add-domain-button")).toBeDefined();
		});

		it("should show no domains message when empty", () => {
			renderCustomDomainManager();
			expect(screen.getByTestId("no-domains")).toBeDefined();
		});

		it("should hide add button when max domains reached", () => {
			const site = createMockSite({
				metadata: {
					customDomains: [createMockDomain()],
				},
			});
			renderCustomDomainManager(site);
			expect(screen.queryByTestId("add-domain-button")).toBeNull();
		});

		it("should show refresh button when domains exist", () => {
			const site = createMockSite({
				metadata: {
					customDomains: [createMockDomain()],
				},
			});
			renderCustomDomainManager(site);
			expect(screen.getByTestId("refresh-all-button")).toBeDefined();
		});
	});

	describe("domain display", () => {
		it("should display domain with pending status badge", () => {
			const site = createMockSite({
				metadata: {
					customDomains: [createMockDomain({ domain: "docs.test.com", status: "pending" })],
				},
			});
			renderCustomDomainManager(site);

			expect(screen.getByTestId("domain-name").textContent).toBe("docs.test.com");
			expect(screen.getByTestId("domain-status-badge").textContent).toBe("Awaiting DNS");
		});

		it("should display verified status badge", () => {
			const site = createMockSite({
				metadata: {
					customDomains: [createMockDomain({ domain: "docs.test.com", status: "verified" })],
				},
			});
			renderCustomDomainManager(site);

			expect(screen.getByTestId("domain-status-badge").textContent).toBe("Connected");
			expect(screen.getByTestId("status-verified")).toBeDefined();
		});

		it("should display failed status badge", () => {
			const site = createMockSite({
				metadata: {
					customDomains: [createMockDomain({ domain: "docs.test.com", status: "failed" })],
				},
			});
			renderCustomDomainManager(site);

			expect(screen.getByTestId("domain-status-badge").textContent).toBe("Check DNS");
			expect(screen.getByTestId("status-failed")).toBeDefined();
		});

		it("should handle unknown status gracefully", () => {
			const site = createMockSite({
				metadata: {
					// Force unknown status by casting
					customDomains: [createMockDomain({ domain: "docs.test.com", status: "unknown" as "pending" })],
				},
			});
			renderCustomDomainManager(site);

			// Should use the raw status value as label when status is unrecognized
			expect(screen.getByTestId("domain-status-badge").textContent).toBe("unknown");
			// The icon mock returns a generic testid, so we just verify the domain item renders
			expect(screen.getByTestId("domain-item")).toBeDefined();
		});

		it("should show verify button for pending domains", () => {
			const site = createMockSite({
				metadata: {
					customDomains: [createMockDomain({ domain: "docs.test.com", status: "pending" })],
				},
			});
			renderCustomDomainManager(site);

			expect(screen.getByTestId("verify-docs.test.com")).toBeDefined();
		});

		it("should not show verify button for verified domains", () => {
			const site = createMockSite({
				metadata: {
					customDomains: [createMockDomain({ domain: "docs.test.com", status: "verified" })],
				},
			});
			renderCustomDomainManager(site);

			expect(screen.queryByTestId("verify-docs.test.com")).toBeNull();
		});

		it("should show last checked timestamp when available", () => {
			const site = createMockSite({
				metadata: {
					customDomains: [createMockDomain({ lastCheckedAt: "2024-01-15T10:30:00Z" })],
				},
			});
			renderCustomDomainManager(site);

			expect(screen.getByTestId("last-checked")).toBeDefined();
		});

		it("should show verification error for failed domains", () => {
			const site = createMockSite({
				metadata: {
					customDomains: [
						createMockDomain({
							status: "failed",
							verificationError: "DNS record not found",
						}),
					],
				},
			});
			renderCustomDomainManager(site);

			expect(screen.getByTestId("verification-error").textContent).toBe("DNS record not found");
		});
	});

	describe("DNS instructions", () => {
		it("should show simplified DNS instructions when no verification data exists", () => {
			const site = createMockSite({
				metadata: {
					customDomains: [
						createMockDomain({
							domain: "docs.example.com",
							status: "pending",
							// No verification array - will use simplified instruction
						}),
					],
				},
			});
			renderCustomDomainManager(site);

			expect(screen.getByTestId("dns-instructions")).toBeDefined();
			expect(screen.getByTestId("dns-record")).toBeDefined();
			// Should show CNAME for subdomain
			expect(screen.getByText("CNAME")).toBeDefined();
			expect(screen.getByText("docs")).toBeDefined();
			expect(screen.getByText("cname.vercel-dns.com")).toBeDefined();
		});

		it("should show A record for apex domains when no verification data exists", () => {
			const site = createMockSite({
				metadata: {
					customDomains: [
						createMockDomain({
							domain: "example.com",
							status: "pending",
							// No verification array - will use simplified instruction
						}),
					],
				},
			});
			renderCustomDomainManager(site);

			expect(screen.getByTestId("dns-instructions")).toBeDefined();
			expect(screen.getByText("A")).toBeDefined();
			expect(screen.getByText("@")).toBeDefined();
			expect(screen.getByText("76.76.21.21")).toBeDefined();
		});

		it("should show both Step 1 CNAME and Step 2 TXT when verification exists", () => {
			const site = createMockSite({
				metadata: {
					customDomains: [
						createMockDomain({
							domain: "docs.example.com",
							status: "pending",
							verification: [
								{
									type: "TXT",
									domain: "_vercel.docs.example.com",
									value: "vc-domain-verify=abc123",
									reason: "Verify domain ownership",
								},
							],
						}),
					],
				},
			});
			renderCustomDomainManager(site);

			expect(screen.getByTestId("dns-instructions")).toBeDefined();
			// Step 1: Should always show CNAME for subdomain
			expect(screen.getByTestId("dns-step-1")).toBeDefined();
			expect(screen.getByTestId("dns-record")).toBeDefined();
			expect(screen.getByText("CNAME")).toBeDefined();
			expect(screen.getByText("docs")).toBeDefined();
			expect(screen.getByText("cname.vercel-dns.com")).toBeDefined();
			// Step 2: Should show TXT verification record with simplified name
			expect(screen.getByTestId("dns-step-2")).toBeDefined();
			expect(screen.getByTestId("dns-record-1")).toBeDefined();
			expect(screen.getByText("TXT")).toBeDefined();
			// The domain suffix is stripped so users just enter "_vercel.docs" in their DNS provider
			expect(screen.getByText("_vercel.docs")).toBeDefined();
			expect(screen.getByText("vc-domain-verify=abc123")).toBeDefined();
		});

		it("should only show TXT records in Step 2, ignoring non-TXT verification records", () => {
			const site = createMockSite({
				metadata: {
					customDomains: [
						createMockDomain({
							domain: "docs.example.com",
							status: "pending",
							verification: [
								{
									type: "TXT",
									domain: "_vercel.docs.example.com",
									value: "vc-domain-verify=abc123",
								},
								{
									type: "CNAME",
									domain: "docs.example.com",
									value: "cname.vercel-dns.com",
								},
							],
						}),
					],
				},
			});
			renderCustomDomainManager(site);

			expect(screen.getByTestId("dns-instructions")).toBeDefined();
			// Step 1: Simplified CNAME (index 0)
			expect(screen.getByTestId("dns-step-1")).toBeDefined();
			expect(screen.getByTestId("dns-record")).toBeDefined();
			// Step 2: Only TXT record (index 1), CNAME from verification[] is filtered out
			expect(screen.getByTestId("dns-step-2")).toBeDefined();
			expect(screen.getByTestId("dns-record-1")).toBeDefined();
			// Should NOT have a third record (dns-record-2)
			expect(screen.queryByTestId("dns-record-2")).toBeNull();
		});

		it("should use simplified instruction when verification array is empty", () => {
			const site = createMockSite({
				metadata: {
					customDomains: [
						createMockDomain({
							domain: "docs.example.com",
							status: "pending",
							verification: [], // Empty array - should fall back to simplified
						}),
					],
				},
			});
			renderCustomDomainManager(site);

			expect(screen.getByTestId("dns-instructions")).toBeDefined();
			// Should use simplified CNAME instruction
			expect(screen.getByText("CNAME")).toBeDefined();
			expect(screen.getByText("docs")).toBeDefined();
			expect(screen.getByText("cname.vercel-dns.com")).toBeDefined();
		});

		it("should not show DNS instructions for verified domains", () => {
			const site = createMockSite({
				metadata: {
					customDomains: [
						createMockDomain({
							status: "verified",
						}),
					],
				},
			});
			renderCustomDomainManager(site);

			expect(screen.queryByTestId("dns-instructions")).toBeNull();
		});
	});

	describe("add domain flow", () => {
		it("should show add form when add button clicked", () => {
			renderCustomDomainManager();

			fireEvent.click(screen.getByTestId("add-domain-button"));

			expect(screen.getByTestId("add-domain-form")).toBeDefined();
			expect(screen.getByTestId("new-domain-input")).toBeDefined();
		});

		it("should hide add button when form is shown", () => {
			renderCustomDomainManager();

			fireEvent.click(screen.getByTestId("add-domain-button"));

			expect(screen.queryByTestId("add-domain-button")).toBeNull();
		});

		it("should cancel adding when cancel clicked", () => {
			renderCustomDomainManager();

			fireEvent.click(screen.getByTestId("add-domain-button"));
			fireEvent.click(screen.getByTestId("cancel-add-button"));

			expect(screen.queryByTestId("add-domain-form")).toBeNull();
			expect(screen.getByTestId("add-domain-button")).toBeDefined();
		});

		it("should validate domain format before adding", async () => {
			renderCustomDomainManager();

			fireEvent.click(screen.getByTestId("add-domain-button"));

			const input = screen.getByTestId("new-domain-input") as HTMLInputElement;
			fireEvent.change(input, { target: { value: "invalid" } });

			fireEvent.click(screen.getByTestId("confirm-add-button"));

			await waitFor(() => {
				expect(screen.getByTestId("error-message")).toBeDefined();
			});

			expect(mockSiteClient.addCustomDomain).not.toHaveBeenCalled();
		});

		it("should call addCustomDomain API with valid domain", async () => {
			const updatedSite = createMockSite({
				metadata: {
					customDomains: [createMockDomain({ domain: "docs.example.com" })],
				},
			});
			mockSiteClient.getSite.mockResolvedValue(updatedSite);

			renderCustomDomainManager();

			fireEvent.click(screen.getByTestId("add-domain-button"));

			const input = screen.getByTestId("new-domain-input") as HTMLInputElement;
			fireEvent.change(input, { target: { value: "docs.example.com" } });

			fireEvent.click(screen.getByTestId("confirm-add-button"));

			await waitFor(() => {
				expect(mockSiteClient.addCustomDomain).toHaveBeenCalledWith(1, "docs.example.com");
			});

			await waitFor(() => {
				expect(mockOnUpdate).toHaveBeenCalledWith(updatedSite);
			});
		});

		it("should show error when add fails", async () => {
			mockSiteClient.addCustomDomain.mockRejectedValue(new Error("Domain already in use"));

			renderCustomDomainManager();

			fireEvent.click(screen.getByTestId("add-domain-button"));

			const input = screen.getByTestId("new-domain-input") as HTMLInputElement;
			fireEvent.change(input, { target: { value: "docs.example.com" } });

			fireEvent.click(screen.getByTestId("confirm-add-button"));

			await waitFor(() => {
				expect(screen.getByTestId("error-message").textContent).toBe("Domain already in use");
			});
		});

		it("should disable buttons while submitting", async () => {
			mockSiteClient.addCustomDomain.mockImplementation(
				() => new Promise(resolve => setTimeout(() => resolve({ domain: createMockDomain() }), 100)),
			);

			renderCustomDomainManager();

			fireEvent.click(screen.getByTestId("add-domain-button"));

			const input = screen.getByTestId("new-domain-input") as HTMLInputElement;
			fireEvent.change(input, { target: { value: "docs.example.com" } });

			fireEvent.click(screen.getByTestId("confirm-add-button"));

			await waitFor(() => {
				expect((screen.getByTestId("confirm-add-button") as HTMLButtonElement).disabled).toBe(true);
				expect((screen.getByTestId("cancel-add-button") as HTMLButtonElement).disabled).toBe(true);
			});
		});
	});

	describe("remove domain", () => {
		it("should show confirmation dialog before removing", () => {
			const site = createMockSite({
				metadata: {
					customDomains: [createMockDomain({ domain: "docs.test.com" })],
				},
			});
			renderCustomDomainManager(site);

			fireEvent.click(screen.getByTestId("remove-docs.test.com"));

			expect(screen.getByTestId("remove-confirm-dialog")).toBeDefined();
		});

		it("should not remove if confirmation cancelled", () => {
			const site = createMockSite({
				metadata: {
					customDomains: [createMockDomain({ domain: "docs.test.com" })],
				},
			});
			renderCustomDomainManager(site);

			fireEvent.click(screen.getByTestId("remove-docs.test.com"));
			fireEvent.click(screen.getByTestId("cancel-remove"));

			expect(mockSiteClient.removeCustomDomain).not.toHaveBeenCalled();
			expect(screen.queryByTestId("remove-confirm-dialog")).toBeNull();
		});

		it("should call removeCustomDomain API when confirmed", async () => {
			const site = createMockSite({
				metadata: {
					customDomains: [createMockDomain({ domain: "docs.test.com" })],
				},
			});
			const updatedSite = createMockSite({ metadata: { customDomains: [] } });
			mockSiteClient.getSite.mockResolvedValue(updatedSite);

			renderCustomDomainManager(site);

			fireEvent.click(screen.getByTestId("remove-docs.test.com"));
			fireEvent.click(screen.getByTestId("confirm-remove"));

			await waitFor(() => {
				expect(mockSiteClient.removeCustomDomain).toHaveBeenCalledWith(1, "docs.test.com");
			});

			await waitFor(() => {
				expect(mockOnUpdate).toHaveBeenCalledWith(updatedSite);
			});
		});

		it("should show error when remove fails", async () => {
			mockSiteClient.removeCustomDomain.mockRejectedValue(new Error("Cannot remove domain"));

			const site = createMockSite({
				metadata: {
					customDomains: [createMockDomain({ domain: "docs.test.com" })],
				},
			});
			renderCustomDomainManager(site);

			fireEvent.click(screen.getByTestId("remove-docs.test.com"));
			fireEvent.click(screen.getByTestId("confirm-remove"));

			await waitFor(() => {
				expect(screen.getByTestId("error-message").textContent).toBe("Cannot remove domain");
			});
		});
	});

	describe("verify domain", () => {
		it("should call verifyCustomDomain API", async () => {
			const site = createMockSite({
				metadata: {
					customDomains: [createMockDomain({ domain: "docs.test.com", status: "pending" })],
				},
			});
			const updatedSite = createMockSite({
				metadata: {
					customDomains: [createMockDomain({ domain: "docs.test.com", status: "verified" })],
				},
			});
			mockSiteClient.getSite.mockResolvedValue(updatedSite);

			renderCustomDomainManager(site);

			fireEvent.click(screen.getByTestId("verify-docs.test.com"));

			await waitFor(() => {
				expect(mockSiteClient.verifyCustomDomain).toHaveBeenCalledWith(1, "docs.test.com");
			});

			await waitFor(() => {
				expect(mockOnUpdate).toHaveBeenCalledWith(updatedSite);
			});
		});

		it("should show error when verify fails", async () => {
			mockSiteClient.verifyCustomDomain.mockRejectedValue(new Error("Verification failed"));

			const site = createMockSite({
				metadata: {
					customDomains: [createMockDomain({ domain: "docs.test.com", status: "pending" })],
				},
			});
			renderCustomDomainManager(site);

			fireEvent.click(screen.getByTestId("verify-docs.test.com"));

			await waitFor(() => {
				expect(screen.getByTestId("error-message").textContent).toBe("Verification failed");
			});
		});
	});

	describe("refresh all", () => {
		it("should call refreshDomainStatuses API", async () => {
			const site = createMockSite({
				metadata: {
					customDomains: [createMockDomain()],
				},
			});
			const updatedSite = createMockSite({
				metadata: {
					customDomains: [createMockDomain({ status: "verified" })],
				},
			});
			mockSiteClient.getSite.mockResolvedValue(updatedSite);

			renderCustomDomainManager(site);

			fireEvent.click(screen.getByTestId("refresh-all-button"));

			await waitFor(() => {
				expect(mockSiteClient.refreshDomainStatuses).toHaveBeenCalledWith(1);
			});

			await waitFor(() => {
				expect(mockOnUpdate).toHaveBeenCalledWith(updatedSite);
			});
		});

		it("should show error when refresh fails", async () => {
			mockSiteClient.refreshDomainStatuses.mockRejectedValue(new Error("Refresh failed"));

			const site = createMockSite({
				metadata: {
					customDomains: [createMockDomain()],
				},
			});
			renderCustomDomainManager(site);

			fireEvent.click(screen.getByTestId("refresh-all-button"));

			await waitFor(() => {
				expect(screen.getByTestId("error-message").textContent).toBe("Refresh failed");
			});
		});
	});

	describe("copy to clipboard", () => {
		it("should copy DNS record name to clipboard (simplified)", async () => {
			const site = createMockSite({
				metadata: {
					customDomains: [
						createMockDomain({
							domain: "docs.example.com",
							status: "pending",
							// No verification - uses simplified instruction
						}),
					],
				},
			});
			renderCustomDomainManager(site);

			// Step 1 CNAME record uses index 0
			fireEvent.click(screen.getByTestId("copy-name"));

			await waitFor(() => {
				// Simplified instruction uses subdomain name
				expect(navigator.clipboard.writeText).toHaveBeenCalledWith("docs");
			});
		});

		it("should copy DNS record value to clipboard (simplified)", async () => {
			const site = createMockSite({
				metadata: {
					customDomains: [
						createMockDomain({
							domain: "docs.example.com",
							status: "pending",
							// No verification - uses simplified instruction
						}),
					],
				},
			});
			renderCustomDomainManager(site);

			// Step 1 CNAME record uses index 0
			fireEvent.click(screen.getByTestId("copy-value"));

			await waitFor(() => {
				expect(navigator.clipboard.writeText).toHaveBeenCalledWith("cname.vercel-dns.com");
			});
		});

		it("should copy Vercel verification record name (simplified) to clipboard", async () => {
			const site = createMockSite({
				metadata: {
					customDomains: [
						createMockDomain({
							domain: "docs.example.com",
							status: "pending",
							verification: [
								{
									type: "TXT",
									domain: "_vercel.docs.example.com",
									value: "vc-domain-verify=abc123",
								},
							],
						}),
					],
				},
			});
			renderCustomDomainManager(site);

			// TXT record is in Step 2, which uses index 1 (Step 1 CNAME uses index 0)
			// The name is simplified by stripping the domain suffix
			fireEvent.click(screen.getByTestId("copy-name-1"));

			await waitFor(() => {
				expect(navigator.clipboard.writeText).toHaveBeenCalledWith("_vercel.docs");
			});
		});

		it("should copy Vercel verification record value to clipboard", async () => {
			const site = createMockSite({
				metadata: {
					customDomains: [
						createMockDomain({
							domain: "docs.example.com",
							status: "pending",
							verification: [
								{
									type: "TXT",
									domain: "_vercel.docs.example.com",
									value: "vc-domain-verify=abc123",
								},
							],
						}),
					],
				},
			});
			renderCustomDomainManager(site);

			// TXT record is in Step 2, which uses index 1 (Step 1 CNAME uses index 0)
			fireEvent.click(screen.getByTestId("copy-value-1"));

			await waitFor(() => {
				expect(navigator.clipboard.writeText).toHaveBeenCalledWith("vc-domain-verify=abc123");
			});
		});
	});

	describe("auto-polling", () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it("should poll for verification status when there are pending domains", async () => {
			const site = createMockSite({
				metadata: {
					customDomains: [createMockDomain({ domain: "docs.test.com", status: "pending" })],
				},
			});
			const updatedSite = createMockSite({
				metadata: {
					customDomains: [createMockDomain({ domain: "docs.test.com", status: "verified" })],
				},
			});
			mockSiteClient.getSite.mockResolvedValue(updatedSite);

			renderCustomDomainManager(site);

			// Advance timer by polling interval
			await act(() => {
				vi.advanceTimersByTime(POLLING_INTERVAL_MS);
			});

			await waitFor(() => {
				expect(mockSiteClient.refreshDomainStatuses).toHaveBeenCalledWith(1);
			});
		});

		it("should not poll when there are no pending domains", async () => {
			const site = createMockSite({
				metadata: {
					customDomains: [createMockDomain({ domain: "docs.test.com", status: "verified" })],
				},
			});

			renderCustomDomainManager(site);

			// Advance timer by polling interval
			await act(() => {
				vi.advanceTimersByTime(POLLING_INTERVAL_MS);
			});

			// Should not call refresh since no pending domains
			expect(mockSiteClient.refreshDomainStatuses).not.toHaveBeenCalled();
		});

		it("should show auto-checking indicator during polling", async () => {
			const site = createMockSite({
				metadata: {
					customDomains: [createMockDomain({ domain: "docs.test.com", status: "pending" })],
				},
			});
			// Make the refresh take some time
			mockSiteClient.refreshDomainStatuses.mockImplementation(
				() => new Promise(resolve => setTimeout(() => resolve({ domains: [] }), 100)),
			);
			mockSiteClient.getSite.mockResolvedValue(site);

			renderCustomDomainManager(site);

			// Start polling
			await act(() => {
				vi.advanceTimersByTime(POLLING_INTERVAL_MS);
			});

			// The indicator should appear during polling
			await waitFor(() => {
				expect(screen.getByTestId("auto-checking-indicator")).toBeDefined();
			});

			// Complete the refresh
			await act(() => {
				vi.advanceTimersByTime(100);
			});
		});

		it("should handle polling errors gracefully", async () => {
			const site = createMockSite({
				metadata: {
					customDomains: [createMockDomain({ domain: "docs.test.com", status: "pending" })],
				},
			});
			mockSiteClient.refreshDomainStatuses.mockRejectedValue(new Error("Network error"));

			renderCustomDomainManager(site);

			// Advance timer - should not throw
			await act(() => {
				vi.advanceTimersByTime(POLLING_INTERVAL_MS);
			});

			// Should have attempted the call
			await waitFor(() => {
				expect(mockSiteClient.refreshDomainStatuses).toHaveBeenCalled();
			});

			// Component should still be rendered (no crash)
			expect(screen.getByTestId("domain-item")).toBeDefined();
		});
	});
});
