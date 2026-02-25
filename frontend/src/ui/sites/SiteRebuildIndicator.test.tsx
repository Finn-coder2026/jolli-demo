import { createMockSite } from "./__testUtils__/SiteTestFactory";
import type { SiteRebuildIndicatorProps } from "./SiteRebuildIndicator";
import { SiteRebuildIndicator } from "./SiteRebuildIndicator";
import { fireEvent, render, screen } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock react-intlayer - uses String objects that render in JSX like Intlayer Proxy objects
const { mockIntlayer } = vi.hoisted(() => {
	// biome-ignore lint/suspicious/noExplicitAny: Mock helper returns any to match Intlayer's flexible types
	function val(s: string): any {
		// biome-ignore lint/style/useConsistentBuiltinInstantiation: Need String object (not primitive) for .value property
		// biome-ignore lint/suspicious/noExplicitAny: Intlayer proxy objects have dynamic shape
		const str = new String(s) as any;
		str.value = s;
		return str;
	}
	return {
		mockIntlayer: {
			building: val("Building..."),
			upToDate: val("Up to date"),
			buildError: val("Build Error"),
			changesAvailable: val("Changes Available"),
			buildErrorTitle: val("Build Error"),
			buildErrorDescription: val("The last build failed"),
			pendingChangesTitle: val("Pending Changes"),
			pendingChangesDescription: val("Changes waiting to be published"),
			brandingChanged: val("Branding Changed"),
			authChanged: val("Auth Changed"),
			enabled: val("Enabled"),
			disabled: val("Disabled"),
			configChanges: val("Config Changes"),
			articleChanges: val("Article Changes"),
			new: val("New"),
			updated: val("Updated"),
			deleted: val("Deleted"),
			andMore: vi.fn().mockReturnValue("and 2 more..."),
			errorDetails: val("Error Details"),
			rebuildNow: val("Rebuild Now"),
			rebuilding: val("Rebuilding..."),
			savingChanges: val("Saving..."),
			reviewAll: val("Review All"),
			folderStructureChanged: val("Folder Structure Changed"),
		},
	};
});
vi.mock("react-intlayer", () => ({
	useIntlayer: () => mockIntlayer,
}));

// Mock lucide-react icons
vi.mock("lucide-react", async importOriginal => {
	const actual = await importOriginal<typeof import("lucide-react")>();
	return {
		...actual,
		AlertCircle: ({ className }: { className?: string }) => (
			<div data-testid="alert-circle-icon" className={className} />
		),
		CheckCircle: ({ className }: { className?: string }) => (
			<div data-testid="check-circle-icon" className={className} />
		),
		FileJson: ({ className }: { className?: string }) => <div data-testid="file-json-icon" className={className} />,
		FileText: ({ className }: { className?: string }) => <div data-testid="file-text-icon" className={className} />,
		KeyRound: ({ className }: { className?: string }) => <div data-testid="key-round-icon" className={className} />,
		Palette: ({ className }: { className?: string }) => <div data-testid="palette-icon" className={className} />,
		Pencil: ({ className }: { className?: string }) => <div data-testid="pencil-icon" className={className} />,
		RefreshCw: ({ className }: { className?: string }) => <div data-testid="refresh-icon" className={className} />,
		Settings: ({ className }: { className?: string }) => <div data-testid="settings-icon" className={className} />,
	};
});

// Mock SiteDetailUtils
const mockNeedsRebuild = vi.fn().mockReturnValue(false);
const mockGetChangeCount = vi.fn().mockReturnValue(0);
const mockGetChangeTypeStyle = vi.fn().mockReturnValue({
	Icon: () => <div />,
	bgClass: "bg-amber-500/10",
	textClass: "text-amber-600",
	borderClass: "border-amber-500/20",
	badgeClass: "bg-amber-500/20 text-amber-700",
});
vi.mock("./SiteDetailUtils", () => ({
	needsRebuild: (...args: Array<unknown>) => mockNeedsRebuild(...args),
	getChangeCount: (...args: Array<unknown>) => mockGetChangeCount(...args),
	getChangeTypeStyle: (...args: Array<unknown>) => mockGetChangeTypeStyle(...args),
}));

// Mock Popover to simplify testing
vi.mock("../../components/ui/Popover", () => ({
	Popover: ({ children, open }: { children: React.ReactNode; open: boolean }) => (
		<div data-testid="popover" data-open={open}>
			{children}
		</div>
	),
	PopoverTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	PopoverContent: ({ children }: { children: React.ReactNode }) => (
		<div data-testid="rebuild-indicator-popover">{children}</div>
	),
}));

describe("SiteRebuildIndicator", () => {
	const mockOnRebuild = vi.fn();
	const mockOnReviewChanges = vi.fn();

	/** Renders the SiteRebuildIndicator with default props, accepting optional overrides. */
	function renderIndicator(overrides: Partial<SiteRebuildIndicatorProps> = {}) {
		const props: SiteRebuildIndicatorProps = {
			site: createMockSite(),
			rebuilding: false,
			hasUnsavedChanges: false,
			onRebuild: mockOnRebuild,
			...overrides,
		};
		return render(<SiteRebuildIndicator {...props} />);
	}

	beforeEach(() => {
		vi.clearAllMocks();
		mockNeedsRebuild.mockReturnValue(false);
		mockGetChangeCount.mockReturnValue(0);
		mockGetChangeTypeStyle.mockReturnValue({
			Icon: () => <div />,
			bgClass: "bg-amber-500/10",
			textClass: "text-amber-600",
			borderClass: "border-amber-500/20",
			badgeClass: "bg-amber-500/20 text-amber-700",
		});
		mockIntlayer.andMore.mockReturnValue("and 2 more...");
	});

	// -------------------------------------------------------------------------
	// Building state
	// -------------------------------------------------------------------------
	describe("building state", () => {
		it("should show building indicator when status is 'building'", () => {
			const site = createMockSite({ status: "building" });
			renderIndicator({ site });

			expect(screen.getByTestId("build-status-label")).toBeDefined();
			expect(screen.getByTestId("build-status-label").textContent).toContain("Building...");
			expect(screen.getByTestId("refresh-icon")).toBeDefined();
		});

		it("should show building indicator when status is 'pending'", () => {
			const site = createMockSite({ status: "pending" });
			renderIndicator({ site });

			expect(screen.getByTestId("build-status-label")).toBeDefined();
			expect(screen.getByTestId("build-status-label").textContent).toContain("Building...");
		});

		it("should display build progress percentage when buildProgress prop is provided", () => {
			const site = createMockSite({ status: "building" });
			renderIndicator({ site, buildProgress: 42 });

			expect(screen.getByTestId("build-progress-percent")).toBeDefined();
			expect(screen.getByTestId("build-progress-percent").textContent).toContain("42%");
		});

		it("should use metadata buildProgress when buildProgress prop is not provided", () => {
			const site = createMockSite({
				status: "building",
				metadata: { buildProgress: "75" },
			});
			renderIndicator({ site });

			expect(screen.getByTestId("build-progress-percent")).toBeDefined();
			expect(screen.getByTestId("build-progress-percent").textContent).toContain("75%");
		});

		it("should not show percentage text when progress is zero", () => {
			const site = createMockSite({ status: "building" });
			renderIndicator({ site, buildProgress: 0 });

			expect(screen.queryByTestId("build-progress-percent")).toBeNull();
		});

		it("should apply spinning animation to the refresh icon", () => {
			const site = createMockSite({ status: "building" });
			renderIndicator({ site });

			const icon = screen.getByTestId("refresh-icon");
			expect(icon.className).toContain("animate-spin");
		});
	});

	// -------------------------------------------------------------------------
	// Up-to-date state
	// -------------------------------------------------------------------------
	describe("up-to-date state", () => {
		it("should show 'Up to date' when no changes and no error", () => {
			mockNeedsRebuild.mockReturnValue(false);
			const site = createMockSite({ status: "active" });
			renderIndicator({ site });

			expect(screen.getByTestId("up-to-date-label")).toBeDefined();
			expect(screen.getByTestId("up-to-date-label").textContent).toContain("Up to date");
			expect(screen.getByTestId("check-circle-icon")).toBeDefined();
		});

		it("should not render the popover trigger when up to date", () => {
			mockNeedsRebuild.mockReturnValue(false);
			const site = createMockSite({ status: "active" });
			renderIndicator({ site });

			expect(screen.queryByTestId("rebuild-indicator-trigger")).toBeNull();
		});
	});

	// -------------------------------------------------------------------------
	// Changes available state
	// -------------------------------------------------------------------------
	describe("changes available state", () => {
		it("should show 'Changes Available' text when changes exist", () => {
			mockNeedsRebuild.mockReturnValue(true);
			mockGetChangeCount.mockReturnValue(3);
			const site = createMockSite({ status: "active", needsUpdate: true });
			renderIndicator({ site });

			expect(screen.getByTestId("trigger-status-label")).toBeDefined();
			expect(screen.getByTestId("trigger-status-label").textContent).toContain("Changes Available");
		});

		it("should show change count badge when changeCount > 0", () => {
			mockNeedsRebuild.mockReturnValue(true);
			mockGetChangeCount.mockReturnValue(5);
			const site = createMockSite({ status: "active", needsUpdate: true });
			renderIndicator({ site });

			expect(screen.getByTestId("change-count-badge")).toBeDefined();
			expect(screen.getByTestId("change-count-badge").textContent).toContain("5");
		});

		it("should render the trigger button with data-testid", () => {
			mockNeedsRebuild.mockReturnValue(true);
			mockGetChangeCount.mockReturnValue(2);
			const site = createMockSite({ status: "active", needsUpdate: true });
			renderIndicator({ site });

			expect(screen.getByTestId("rebuild-indicator-trigger")).toBeDefined();
		});

		it("should show the amber alert icon for changes", () => {
			mockNeedsRebuild.mockReturnValue(true);
			const site = createMockSite({ status: "active", needsUpdate: true });
			renderIndicator({ site });

			expect(screen.getByTestId("alert-circle-icon")).toBeDefined();
		});
	});

	// -------------------------------------------------------------------------
	// Error state
	// -------------------------------------------------------------------------
	describe("error state", () => {
		it("should show 'Build Error' when status is error", () => {
			mockNeedsRebuild.mockReturnValue(false);
			const site = createMockSite({ status: "error" });
			renderIndicator({ site });

			expect(screen.getByTestId("rebuild-indicator-trigger")).toBeDefined();
			// "Build Error" appears in the trigger label and the popover header title
			expect(screen.getByTestId("trigger-status-label").textContent).toContain("Build Error");
			expect(screen.getByTestId("popover-header-title").textContent).toContain("Build Error");
		});

		it("should show error title and description in popover header", () => {
			mockNeedsRebuild.mockReturnValue(false);
			const site = createMockSite({ status: "error" });
			renderIndicator({ site });

			expect(screen.getByTestId("popover-header-description").textContent).toContain("The last build failed");
		});

		it("should show build error details when metadata contains lastBuildError", () => {
			mockNeedsRebuild.mockReturnValue(false);
			const site = createMockSite({
				status: "error",
				metadata: { lastBuildError: "Module not found: @acme/lib" },
			});
			renderIndicator({ site });

			expect(screen.getByTestId("error-details-label")).toBeDefined();
			expect(screen.getByTestId("error-details-label").textContent).toContain("Error Details");
			expect(screen.getByTestId("error-details-message").textContent).toContain("Module not found: @acme/lib");
		});

		it("should not show error details section when no lastBuildError", () => {
			mockNeedsRebuild.mockReturnValue(false);
			const site = createMockSite({ status: "error" });
			renderIndicator({ site });

			expect(screen.queryByTestId("error-details-section")).toBeNull();
		});
	});

	// -------------------------------------------------------------------------
	// Popover content - branding, auth, config, articles
	// -------------------------------------------------------------------------
	describe("popover content", () => {
		it("should show branding changed section when brandingChanged is true", () => {
			mockNeedsRebuild.mockReturnValue(true);
			const site = createMockSite({
				status: "active",
				needsUpdate: true,
				brandingChanged: true,
			});
			renderIndicator({ site });

			// Branding changed text is rendered via the BrandingChangeItem sub-component
			const popover = screen.getByTestId("rebuild-indicator-popover");
			expect(popover.textContent).toContain("Branding Changed");
			expect(screen.getByTestId("palette-icon")).toBeDefined();
		});

		it("should show auth change section when authChange is present", () => {
			mockNeedsRebuild.mockReturnValue(true);
			const site = createMockSite({
				status: "active",
				needsUpdate: true,
				authChange: { from: false, to: true },
			});
			renderIndicator({ site });

			const popover = screen.getByTestId("rebuild-indicator-popover");
			expect(popover.textContent).toContain("Auth Changed");
			expect(screen.getByTestId("key-round-icon")).toBeDefined();
		});

		it("should show correct auth transition from disabled to enabled", () => {
			mockNeedsRebuild.mockReturnValue(true);
			const site = createMockSite({
				status: "active",
				needsUpdate: true,
				authChange: { from: false, to: true },
			});
			renderIndicator({ site });

			// from=false => "Disabled", to=true => "Enabled"
			const textContent = screen.getByTestId("rebuild-indicator-popover").textContent;
			expect(textContent).toContain("Disabled");
			expect(textContent).toContain("Enabled");
		});

		it("should show config file changes when changedConfigFiles has entries", () => {
			mockNeedsRebuild.mockReturnValue(true);
			const site = createMockSite({
				status: "active",
				needsUpdate: true,
				changedConfigFiles: [
					{ path: "next.config.mjs", displayName: "Next Config" },
					{ path: "content/_meta.ts", displayName: "Navigation Meta" },
				],
			});
			renderIndicator({ site });

			const popover = screen.getByTestId("rebuild-indicator-popover");
			expect(popover.textContent).toContain("Next Config");
			expect(popover.textContent).toContain("Navigation Meta");
		});

		it("should show article changes with correct change type badges", () => {
			mockNeedsRebuild.mockReturnValue(true);
			mockGetChangeTypeStyle.mockReturnValue({
				textClass: "text-green-600",
				badgeClass: "bg-green-500/20 text-green-700",
			});
			const site = createMockSite({
				status: "active",
				needsUpdate: true,
				changedArticles: [
					{
						id: 1,
						title: "Getting Started",
						jrn: "jrn:article:1",
						updatedAt: "2024-01-01T00:00:00Z",
						contentType: "text/markdown",
						changeType: "new",
					},
				],
			});
			renderIndicator({ site });

			const popover = screen.getByTestId("rebuild-indicator-popover");
			expect(popover.textContent).toContain("Getting Started");
			expect(popover.textContent).toContain("New");
		});

		it("should show at most 5 articles and then 'and more' text", () => {
			mockNeedsRebuild.mockReturnValue(true);
			const articles = Array.from({ length: 7 }, (_, i) => ({
				id: i + 1,
				title: `Article ${i + 1}`,
				jrn: `jrn:article:${i + 1}`,
				updatedAt: "2024-01-01T00:00:00Z",
				contentType: "text/markdown" as const,
				changeType: "updated" as const,
			}));
			const site = createMockSite({
				status: "active",
				needsUpdate: true,
				changedArticles: articles,
			});
			renderIndicator({ site });

			// First 5 should be visible, 6th and 7th should not
			const popover = screen.getByTestId("rebuild-indicator-popover");
			expect(popover.textContent).toContain("Article 1");
			expect(popover.textContent).toContain("Article 5");
			expect(popover.textContent).not.toContain("Article 6");
			expect(popover.textContent).not.toContain("Article 7");
			// "and more" text should appear
			expect(screen.getByTestId("and-more-text")).toBeDefined();
			expect(screen.getByTestId("and-more-text").textContent).toContain("and 2 more...");
		});

		it("should not show 'and more' text when articles count is 5 or fewer", () => {
			mockNeedsRebuild.mockReturnValue(true);
			const articles = Array.from({ length: 5 }, (_, i) => ({
				id: i + 1,
				title: `Article ${i + 1}`,
				jrn: `jrn:article:${i + 1}`,
				updatedAt: "2024-01-01T00:00:00Z",
				contentType: "text/markdown" as const,
				changeType: "updated" as const,
			}));
			const site = createMockSite({
				status: "active",
				needsUpdate: true,
				changedArticles: articles,
			});
			renderIndicator({ site });

			expect(screen.queryByTestId("and-more-text")).toBeNull();
		});

		it("should show FileJson icon for application/json articles", () => {
			mockNeedsRebuild.mockReturnValue(true);
			const site = createMockSite({
				status: "active",
				needsUpdate: true,
				changedArticles: [
					{
						id: 1,
						title: "API Reference",
						jrn: "jrn:article:1",
						updatedAt: "2024-01-01T00:00:00Z",
						contentType: "application/json",
						changeType: "updated",
					},
				],
			});
			renderIndicator({ site });

			expect(screen.getByTestId("file-json-icon")).toBeDefined();
		});

		it("should show FileJson icon for application/yaml articles", () => {
			mockNeedsRebuild.mockReturnValue(true);
			const site = createMockSite({
				status: "active",
				needsUpdate: true,
				changedArticles: [
					{
						id: 2,
						title: "OpenAPI Spec",
						jrn: "jrn:article:2",
						updatedAt: "2024-01-01T00:00:00Z",
						contentType: "application/yaml",
						changeType: "new",
					},
				],
			});
			renderIndicator({ site });

			expect(screen.getByTestId("file-json-icon")).toBeDefined();
		});

		it("should show FileText icon for text/markdown articles", () => {
			mockNeedsRebuild.mockReturnValue(true);
			const site = createMockSite({
				status: "active",
				needsUpdate: true,
				changedArticles: [
					{
						id: 3,
						title: "Readme",
						jrn: "jrn:article:3",
						updatedAt: "2024-01-01T00:00:00Z",
						contentType: "text/markdown",
						changeType: "updated",
					},
				],
			});
			renderIndicator({ site });

			expect(screen.getByTestId("file-text-icon")).toBeDefined();
		});
	});

	// -------------------------------------------------------------------------
	// Rebuild button
	// -------------------------------------------------------------------------
	describe("rebuild button", () => {
		it("should call onRebuild when rebuild button is clicked", () => {
			mockNeedsRebuild.mockReturnValue(true);
			const site = createMockSite({ status: "active", needsUpdate: true });
			renderIndicator({ site });

			fireEvent.click(screen.getByTestId("rebuild-button"));
			expect(mockOnRebuild).toHaveBeenCalledOnce();
		});

		it("should disable rebuild button when rebuilding is true", () => {
			mockNeedsRebuild.mockReturnValue(true);
			const site = createMockSite({ status: "active", needsUpdate: true });
			renderIndicator({ site, rebuilding: true });

			const button = screen.getByTestId("rebuild-button");
			expect(button.hasAttribute("disabled")).toBe(true);
		});

		it("should disable rebuild button when hasUnsavedChanges is true", () => {
			mockNeedsRebuild.mockReturnValue(true);
			const site = createMockSite({ status: "active", needsUpdate: true });
			renderIndicator({ site, hasUnsavedChanges: true });

			const button = screen.getByTestId("rebuild-button");
			expect(button.hasAttribute("disabled")).toBe(true);
		});

		it("should show 'Rebuilding...' text when rebuilding", () => {
			mockNeedsRebuild.mockReturnValue(true);
			const site = createMockSite({ status: "active", needsUpdate: true });
			renderIndicator({ site, rebuilding: true });

			expect(screen.getByTestId("rebuild-button").textContent).toContain("Rebuilding...");
		});

		it("should show 'Saving...' text when hasUnsavedChanges is true", () => {
			mockNeedsRebuild.mockReturnValue(true);
			const site = createMockSite({ status: "active", needsUpdate: true });
			renderIndicator({ site, hasUnsavedChanges: true });

			expect(screen.getByTestId("rebuild-button").textContent).toContain("Saving...");
		});

		it("should show 'Rebuild Now' text in normal state", () => {
			mockNeedsRebuild.mockReturnValue(true);
			const site = createMockSite({ status: "active", needsUpdate: true });
			renderIndicator({ site });

			expect(screen.getByTestId("rebuild-button").textContent).toContain("Rebuild Now");
		});
	});

	// -------------------------------------------------------------------------
	// Review all link
	// -------------------------------------------------------------------------
	describe("review all link", () => {
		it("should show review all link when onReviewChanges is provided and changeCount > 0", () => {
			mockNeedsRebuild.mockReturnValue(true);
			mockGetChangeCount.mockReturnValue(3);
			const site = createMockSite({ status: "active", needsUpdate: true });
			renderIndicator({ site, onReviewChanges: mockOnReviewChanges });

			expect(screen.getByTestId("review-all-link")).toBeDefined();
			expect(screen.getByTestId("review-all-link").textContent).toContain("Review All");
		});

		it("should not show review all link when onReviewChanges is not provided", () => {
			mockNeedsRebuild.mockReturnValue(true);
			mockGetChangeCount.mockReturnValue(3);
			const site = createMockSite({ status: "active", needsUpdate: true });
			renderIndicator({ site });

			expect(screen.queryByTestId("review-all-link")).toBeNull();
		});

		it("should not show review all link when changeCount is 0", () => {
			mockNeedsRebuild.mockReturnValue(true);
			mockGetChangeCount.mockReturnValue(0);
			const site = createMockSite({ status: "active", needsUpdate: true });
			renderIndicator({ site, onReviewChanges: mockOnReviewChanges });

			expect(screen.queryByTestId("review-all-link")).toBeNull();
		});

		it("should call onReviewChanges when review all link is clicked", () => {
			mockNeedsRebuild.mockReturnValue(true);
			mockGetChangeCount.mockReturnValue(3);
			const site = createMockSite({ status: "active", needsUpdate: true });
			renderIndicator({ site, onReviewChanges: mockOnReviewChanges });

			fireEvent.click(screen.getByTestId("review-all-link"));
			expect(mockOnReviewChanges).toHaveBeenCalledOnce();
		});
	});

	// -------------------------------------------------------------------------
	// Popover header content
	// -------------------------------------------------------------------------
	describe("popover header", () => {
		it("should show pending changes title and description when changes are available", () => {
			mockNeedsRebuild.mockReturnValue(true);
			const site = createMockSite({ status: "active", needsUpdate: true });
			renderIndicator({ site });

			expect(screen.getByTestId("popover-header-title").textContent).toContain("Pending Changes");
			expect(screen.getByTestId("popover-header-description").textContent).toContain(
				"Changes waiting to be published",
			);
		});

		it("should show error title and description when status is error", () => {
			mockNeedsRebuild.mockReturnValue(false);
			const site = createMockSite({ status: "error" });
			renderIndicator({ site });

			// Both trigger badge and popover header show "Build Error"
			expect(screen.getByTestId("trigger-status-label").textContent).toContain("Build Error");
			expect(screen.getByTestId("popover-header-title").textContent).toContain("Build Error");
			expect(screen.getByTestId("popover-header-description").textContent).toContain("The last build failed");
		});
	});

	// -------------------------------------------------------------------------
	// Edge cases: no change count badge when count is 0
	// -------------------------------------------------------------------------
	describe("edge cases", () => {
		it("should not show change count badge when changeCount is 0 in error state", () => {
			mockNeedsRebuild.mockReturnValue(false);
			mockGetChangeCount.mockReturnValue(0);
			const site = createMockSite({ status: "error" });
			renderIndicator({ site });

			// The trigger should exist but not have a numeric badge
			expect(screen.getByTestId("rebuild-indicator-trigger")).toBeDefined();
			expect(screen.queryByTestId("change-count-badge")).toBeNull();
		});

		it("should not show config changes section when changedConfigFiles is empty", () => {
			mockNeedsRebuild.mockReturnValue(true);
			const site = createMockSite({
				status: "active",
				needsUpdate: true,
				changedConfigFiles: [],
			});
			renderIndicator({ site });

			const popover = screen.getByTestId("rebuild-indicator-popover");
			expect(popover.textContent).not.toContain("Config Changes");
		});

		it("should not show article changes section when changedArticles is empty", () => {
			mockNeedsRebuild.mockReturnValue(true);
			const site = createMockSite({
				status: "active",
				needsUpdate: true,
				changedArticles: [],
			});
			renderIndicator({ site });

			expect(screen.queryByTestId("article-changes-header")).toBeNull();
		});
	});
});
