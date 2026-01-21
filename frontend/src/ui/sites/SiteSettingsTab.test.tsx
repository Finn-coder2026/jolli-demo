import { createMockIntlayerValue, renderWithProviders } from "../../test/TestUtils";
import { SiteSettingsTab } from "./SiteSettingsTab";
import { fireEvent, screen } from "@testing-library/preact";
import type { SiteMetadata, SiteWithUpdate } from "jolli-common";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock lucide-react icons
vi.mock("lucide-react", async importOriginal => {
	const actual = await importOriginal<typeof import("lucide-react")>();
	return {
		...actual,
		AlertTriangle: () => <div data-testid="alert-triangle-icon" />,
		Globe: () => <div data-testid="globe-icon" />,
		Info: () => <div data-testid="info-icon" />,
		KeyRound: () => <div data-testid="key-round-icon" />,
		Trash2: () => <div data-testid="trash-icon" />,
	};
});

// Mock CustomDomainManager
vi.mock("./CustomDomainManager", () => ({
	CustomDomainManager: ({ site }: { site: SiteWithUpdate }) => (
		<div data-testid="custom-domain-manager">CustomDomainManager for {site.name}</div>
	),
}));

describe("SiteSettingsTab", () => {
	const mockOnDocsiteUpdate = vi.fn();
	const mockOnJwtAuthUpdate = vi.fn();
	const mockOnDeleteRequest = vi.fn();

	const defaultMetadata = {
		githubRepo: "owner/repo",
		githubUrl: "https://github.com/owner/repo",
		framework: "nextra",
		articleCount: 5,
		jolliSiteDomain: "test-site.jolli.site",
	};

	function createMockDocsite(
		overrides: Omit<Partial<SiteWithUpdate>, "metadata"> & { metadata?: Partial<SiteMetadata> } = {},
	): SiteWithUpdate {
		const { metadata: metadataOverrides, ...rest } = overrides;
		return {
			id: 1,
			name: "test-site",
			displayName: "Test Site",
			status: "active",
			visibility: "external",
			framework: "nextra",
			createdAt: "2024-01-01T00:00:00Z",
			updatedAt: "2024-01-02T00:00:00Z",
			metadata: { ...defaultMetadata, ...metadataOverrides },
			...rest,
		} as SiteWithUpdate;
	}

	beforeEach(() => {
		vi.clearAllMocks();
	});

	function renderSettingsTab(
		docsite: SiteWithUpdate,
		props: Partial<React.ComponentProps<typeof SiteSettingsTab>> = {},
	) {
		return renderWithProviders(
			<SiteSettingsTab
				docsite={docsite}
				onDocsiteUpdate={mockOnDocsiteUpdate}
				onJwtAuthUpdate={mockOnJwtAuthUpdate}
				onDeleteRequest={mockOnDeleteRequest}
				{...props}
			/>,
			{ initialPath: createMockIntlayerValue("/sites/1") },
		);
	}

	describe("authentication section", () => {
		it("should render auth settings section", () => {
			const docsite = createMockDocsite();
			renderSettingsTab(docsite);

			expect(screen.getByTestId("auth-settings-section")).toBeDefined();
			expect(screen.getByTestId("enable-auth-checkbox")).toBeDefined();
		});

		it("should show auth checkbox unchecked by default", () => {
			const docsite = createMockDocsite();
			renderSettingsTab(docsite);

			const checkbox = screen.getByTestId("enable-auth-checkbox") as HTMLInputElement;
			expect(checkbox.checked).toBe(false);
		});

		it("should show auth checkbox checked when JWT auth is enabled", () => {
			const docsite = createMockDocsite({
				metadata: {
					jolliSiteDomain: "test.jolli.site",
					jwtAuth: { enabled: true, mode: "full", loginUrl: "https://auth.test.com", publicKey: "test-key" },
				},
			});
			renderSettingsTab(docsite);

			const checkbox = screen.getByTestId("enable-auth-checkbox") as HTMLInputElement;
			expect(checkbox.checked).toBe(true);
		});

		it("should call onJwtAuthUpdate when checkbox is toggled", () => {
			const docsite = createMockDocsite();
			renderSettingsTab(docsite);

			const checkbox = screen.getByTestId("enable-auth-checkbox");
			fireEvent.click(checkbox);

			expect(mockOnJwtAuthUpdate).toHaveBeenCalledWith(true, "full");
		});

		it("should show auth method section when auth is enabled", () => {
			const docsite = createMockDocsite({
				metadata: {
					jolliSiteDomain: "test.jolli.site",
					jwtAuth: { enabled: true, mode: "full", loginUrl: "https://auth.test.com", publicKey: "test-key" },
				},
			});
			renderSettingsTab(docsite);

			expect(screen.getByTestId("auth-method-section")).toBeDefined();
			expect(screen.getByTestId("auth-method-select")).toBeDefined();
		});

		it("should not show auth method section when auth is disabled", () => {
			const docsite = createMockDocsite();
			renderSettingsTab(docsite);

			expect(screen.queryByTestId("auth-method-section")).toBeNull();
		});

		it("should show login URL when available", () => {
			const docsite = createMockDocsite({
				metadata: {
					jolliSiteDomain: "test.jolli.site",
					jwtAuth: {
						enabled: true,
						mode: "full",
						loginUrl: "https://test.jolli.site/api/auth/login",
						publicKey: "test-key",
					},
				},
			});
			renderSettingsTab(docsite);

			expect(screen.getByTestId("login-url")).toBeDefined();
			expect(screen.getByText("https://test.jolli.site/api/auth/login")).toBeDefined();
		});

		it("should disable checkbox when site is not active", () => {
			const docsite = createMockDocsite({ status: "building" });
			renderSettingsTab(docsite);

			const checkbox = screen.getByTestId("enable-auth-checkbox") as HTMLInputElement;
			expect(checkbox.disabled).toBe(true);
		});

		it("should disable checkbox when saving", () => {
			const docsite = createMockDocsite();
			renderSettingsTab(docsite, { savingJwtAuth: true });

			const checkbox = screen.getByTestId("enable-auth-checkbox") as HTMLInputElement;
			expect(checkbox.disabled).toBe(true);
		});

		it("should show saving indicator", () => {
			const docsite = createMockDocsite();
			renderSettingsTab(docsite, { savingJwtAuth: true });

			expect(screen.getByText("Saving...")).toBeDefined();
		});

		it("should show rebuild note", () => {
			const docsite = createMockDocsite();
			renderSettingsTab(docsite);

			expect(screen.getByTestId("auth-rebuild-note")).toBeDefined();
		});
	});

	describe("domain section", () => {
		it("should render domain settings section", () => {
			const docsite = createMockDocsite();
			renderSettingsTab(docsite);

			expect(screen.getByTestId("domain-settings-section")).toBeDefined();
		});

		it("should show default domain", () => {
			const docsite = createMockDocsite({
				metadata: {
					jolliSiteDomain: "test-site.jolli.site",
				},
			});
			renderSettingsTab(docsite);

			expect(screen.getByText("test-site.jolli.site")).toBeDefined();
		});

		it("should show verified custom domain", () => {
			const docsite = createMockDocsite({
				metadata: {
					jolliSiteDomain: "test.jolli.site",
					customDomains: [
						{ domain: "docs.example.com", status: "verified", addedAt: "2024-01-01T00:00:00Z" },
					],
				},
			});
			renderSettingsTab(docsite);

			expect(screen.getByText("docs.example.com")).toBeDefined();
		});

		it("should show toggle domain manager button for active sites", () => {
			const docsite = createMockDocsite({ status: "active" });
			renderSettingsTab(docsite);

			expect(screen.getByTestId("toggle-domain-manager")).toBeDefined();
		});

		it("should not show toggle domain manager button for non-active sites", () => {
			const docsite = createMockDocsite({ status: "building" });
			renderSettingsTab(docsite);

			expect(screen.queryByTestId("toggle-domain-manager")).toBeNull();
		});

		it("should expand domain manager when toggle clicked", () => {
			const docsite = createMockDocsite({ status: "active" });
			renderSettingsTab(docsite);

			expect(screen.queryByTestId("domain-manager-expanded")).toBeNull();

			fireEvent.click(screen.getByTestId("toggle-domain-manager"));

			expect(screen.getByTestId("domain-manager-expanded")).toBeDefined();
			expect(screen.getByTestId("custom-domain-manager")).toBeDefined();
		});

		it("should collapse domain manager when toggle clicked again", () => {
			const docsite = createMockDocsite({ status: "active" });
			renderSettingsTab(docsite);

			// Expand
			fireEvent.click(screen.getByTestId("toggle-domain-manager"));
			expect(screen.getByTestId("domain-manager-expanded")).toBeDefined();

			// Collapse
			fireEvent.click(screen.getByTestId("toggle-domain-manager"));
			expect(screen.queryByTestId("domain-manager-expanded")).toBeNull();
		});
	});

	describe("danger zone", () => {
		it("should show danger zone for active sites with delete handler", () => {
			const docsite = createMockDocsite({ status: "active" });
			renderSettingsTab(docsite);

			expect(screen.getByTestId("danger-zone-section")).toBeDefined();
			expect(screen.getByTestId("delete-site-button")).toBeDefined();
		});

		it("should show danger zone for error sites with delete handler", () => {
			const docsite = createMockDocsite({ status: "error" });
			renderSettingsTab(docsite);

			expect(screen.getByTestId("danger-zone-section")).toBeDefined();
		});

		it("should not show danger zone for building sites", () => {
			const docsite = createMockDocsite({ status: "building" });
			renderSettingsTab(docsite);

			expect(screen.queryByTestId("danger-zone-section")).toBeNull();
		});

		it("should not show danger zone for pending sites", () => {
			const docsite = createMockDocsite({ status: "pending" });
			renderSettingsTab(docsite);

			expect(screen.queryByTestId("danger-zone-section")).toBeNull();
		});

		it("should not show danger zone without delete handler", () => {
			const docsite = createMockDocsite({ status: "active" });
			renderWithProviders(<SiteSettingsTab docsite={docsite} onDocsiteUpdate={mockOnDocsiteUpdate} />, {
				initialPath: createMockIntlayerValue("/sites/1"),
			});

			expect(screen.queryByTestId("danger-zone-section")).toBeNull();
		});

		it("should call onDeleteRequest when delete button clicked", () => {
			const docsite = createMockDocsite({ status: "active" });
			renderSettingsTab(docsite);

			fireEvent.click(screen.getByTestId("delete-site-button"));

			expect(mockOnDeleteRequest).toHaveBeenCalled();
		});
	});
});
