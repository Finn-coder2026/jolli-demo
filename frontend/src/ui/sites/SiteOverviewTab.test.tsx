import type { BuildStreamState } from "../../hooks/useBuildStream";
import { createMockIntlayerValue, renderWithProviders } from "../../test/TestUtils";
import { SiteOverviewTab } from "./SiteOverviewTab";
import { fireEvent, screen, waitFor } from "@testing-library/preact";
import type { SiteMetadata, SiteWithUpdate } from "jolli-common";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock lucide-react icons
vi.mock("lucide-react", async importOriginal => {
	const actual = await importOriginal<typeof import("lucide-react")>();
	return {
		...actual,
		Check: () => <div data-testid="check-icon" />,
		ChevronRight: () => <div data-testid="chevron-right-icon" />,
		Copy: () => <div data-testid="copy-icon" />,
		ExternalLink: () => <div data-testid="external-link-icon" />,
		FileText: () => <div data-testid="file-text-icon" />,
		Lock: () => <div data-testid="lock-icon" />,
		RefreshCw: () => <div data-testid="refresh-icon" />,
		ScrollText: () => <div data-testid="scroll-text-icon" />,
		Settings: () => <div data-testid="settings-icon" />,
	};
});

// Mock clipboard API
const mockClipboard = {
	writeText: vi.fn().mockResolvedValue(undefined),
};
Object.assign(navigator, { clipboard: mockClipboard });

describe("SiteOverviewTab", () => {
	const mockOnNavigateToTab = vi.fn();

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
			lastGeneratedAt: "2024-01-03T00:00:00Z",
			metadata: { ...defaultMetadata, ...metadataOverrides },
			...rest,
		} as SiteWithUpdate;
	}

	beforeEach(() => {
		vi.clearAllMocks();
	});

	function renderOverviewTab(docsite: SiteWithUpdate, buildStream?: BuildStreamState) {
		const props = buildStream
			? { docsite, buildStream, onNavigateToTab: mockOnNavigateToTab }
			: { docsite, onNavigateToTab: mockOnNavigateToTab };
		return renderWithProviders(<SiteOverviewTab {...props} />, {
			initialPath: createMockIntlayerValue("/sites/1"),
		});
	}

	describe("preview window", () => {
		it("should show building status when site is building", () => {
			const docsite = createMockDocsite({ status: "building" });
			renderOverviewTab(docsite);

			expect(screen.getByTestId("refresh-icon")).toBeDefined();
			expect(screen.getByText("Build in Progress")).toBeDefined();
		});

		it("should show building status with progress when buildStream has progress", () => {
			const docsite = createMockDocsite({ status: "building" });
			const buildStream: BuildStreamState = {
				connected: true,
				mode: "create",
				logs: [],
				currentStep: 2,
				totalSteps: 5,
				currentMessage: "Installing dependencies...",
				completed: false,
				failed: false,
				finalUrl: null,
				errorMessage: null,
			};
			renderOverviewTab(docsite, buildStream);

			expect(screen.getByText("Installing dependencies...")).toBeDefined();
		});

		it("should show pending status", () => {
			const docsite = createMockDocsite({ status: "pending" });
			renderOverviewTab(docsite);

			expect(screen.getByTestId("refresh-icon")).toBeDefined();
		});

		it("should show unavailable when no URL", () => {
			// Create docsite without jolliSiteDomain by not merging defaultMetadata for this test
			const docsite = {
				id: 1,
				name: "test-site",
				displayName: "Test Site",
				status: "active",
				visibility: "external",
				createdAt: "2024-01-01T00:00:00Z",
				updatedAt: "2024-01-02T00:00:00Z",
				lastGeneratedAt: "2024-01-03T00:00:00Z",
				metadata: { articleCount: 0, githubRepo: "", githubUrl: "", framework: "nextra" },
				needsUpdate: false,
				userId: 1,
			} as SiteWithUpdate;
			renderOverviewTab(docsite);

			expect(screen.getByText("Preview Unavailable")).toBeDefined();
		});

		it("should show deployment building state", () => {
			const docsite = createMockDocsite({
				status: "active",
				metadata: {
					jolliSiteDomain: "test.jolli.site",
					deploymentStatus: "building",
				},
			});
			renderOverviewTab(docsite);

			expect(screen.getByText("Deployment Building")).toBeDefined();
		});

		it("should show auth placeholder for sites with JWT auth enabled", () => {
			const docsite = createMockDocsite({
				status: "active",
				metadata: {
					jolliSiteDomain: "test.jolli.site",
					jwtAuth: { enabled: true, mode: "full", loginUrl: "https://auth.test.com", publicKey: "test-key" },
				},
			});
			renderOverviewTab(docsite);

			expect(screen.getByText("Preview Unavailable")).toBeDefined();
			expect(screen.getByText("Site requires authentication")).toBeDefined();
		});

		it("should show iframe preview for active sites without auth", () => {
			const docsite = createMockDocsite({
				status: "active",
				metadata: {
					jolliSiteDomain: "test.jolli.site",
					articleCount: 5,
				},
			});
			renderOverviewTab(docsite);

			// Should have copy and open buttons
			expect(screen.getByTestId("copy-url-button")).toBeDefined();
			expect(screen.getByTestId("open-site-button")).toBeDefined();
		});

		it("should show custom domain when verified", () => {
			const docsite = createMockDocsite({
				status: "active",
				metadata: {
					jolliSiteDomain: "test.jolli.site",
					customDomains: [
						{ domain: "docs.example.com", status: "verified", addedAt: "2024-01-01T00:00:00Z" },
					],
				},
			});
			renderOverviewTab(docsite);

			// URL bar should show custom domain
			expect(screen.getByText("docs.example.com")).toBeDefined();
		});
	});

	describe("stats cards", () => {
		it("should display article count", () => {
			const docsite = createMockDocsite({
				metadata: { jolliSiteDomain: "test.jolli.site", articleCount: 10 },
			});
			renderOverviewTab(docsite);

			expect(screen.getByText("10")).toBeDefined();
		});

		it("should display status badge", () => {
			const docsite = createMockDocsite({ status: "active" });
			renderOverviewTab(docsite);

			expect(screen.getByText("Active")).toBeDefined();
		});

		it("should display last built date", () => {
			const docsite = createMockDocsite({
				lastGeneratedAt: "2024-01-15T10:30:00Z",
			});
			renderOverviewTab(docsite);

			// Should show formatted date label
			expect(screen.getByText("Last Built")).toBeDefined();
		});

		it("should show dash when no last built date", () => {
			const docsite = createMockDocsite({
				lastGeneratedAt: undefined,
			});
			renderOverviewTab(docsite);

			// Should show "—" for no date
			expect(screen.getAllByText("—").length).toBeGreaterThan(0);
		});
	});

	describe("quick actions", () => {
		it("should render quick action buttons", () => {
			const docsite = createMockDocsite();
			renderOverviewTab(docsite);

			expect(screen.getByTestId("quick-action-content")).toBeDefined();
			expect(screen.getByTestId("quick-action-settings")).toBeDefined();
			expect(screen.getByTestId("quick-action-logs")).toBeDefined();
		});

		it("should call onNavigateToTab when content button is clicked", () => {
			const docsite = createMockDocsite();
			renderOverviewTab(docsite);

			fireEvent.click(screen.getByTestId("quick-action-content"));
			expect(mockOnNavigateToTab).toHaveBeenCalledWith("content");
		});

		it("should call onNavigateToTab when settings button is clicked", () => {
			const docsite = createMockDocsite();
			renderOverviewTab(docsite);

			fireEvent.click(screen.getByTestId("quick-action-settings"));
			expect(mockOnNavigateToTab).toHaveBeenCalledWith("settings");
		});

		it("should call onNavigateToTab when logs button is clicked", () => {
			const docsite = createMockDocsite();
			renderOverviewTab(docsite);

			fireEvent.click(screen.getByTestId("quick-action-logs"));
			expect(mockOnNavigateToTab).toHaveBeenCalledWith("logs");
		});

		it("should not render quick actions when onNavigateToTab is not provided", () => {
			const docsite = createMockDocsite();
			renderWithProviders(<SiteOverviewTab docsite={docsite} />, {
				initialPath: createMockIntlayerValue("/sites/1"),
			});

			expect(screen.queryByTestId("quick-action-content")).toBeNull();
		});
	});

	describe("copy URL functionality", () => {
		it("should copy URL when copy button is clicked", async () => {
			const docsite = createMockDocsite({
				status: "active",
				metadata: {
					jolliSiteDomain: "test.jolli.site",
				},
			});
			renderOverviewTab(docsite);

			const copyButton = screen.getByTestId("copy-url-button");
			fireEvent.click(copyButton);

			await waitFor(() => {
				expect(mockClipboard.writeText).toHaveBeenCalledWith("test.jolli.site");
			});
		});

		it("should show check icon after copying", async () => {
			const docsite = createMockDocsite({
				status: "active",
				metadata: {
					jolliSiteDomain: "test.jolli.site",
				},
			});
			renderOverviewTab(docsite);

			const copyButton = screen.getByTestId("copy-url-button");
			fireEvent.click(copyButton);

			await waitFor(() => {
				expect(screen.getByTestId("check-icon")).toBeDefined();
			});
		});
	});
});
