import { createMockChangedArticle, createMockSite } from "./__testUtils__/SiteTestFactory";
import { getChangeCount, getChangeTypeStyle, needsRebuild } from "./SiteDetailUtils";
import { SitePendingChangesTab } from "./SitePendingChangesTab";
import { fireEvent, render, screen } from "@testing-library/preact";
import type { SiteWithUpdate } from "jolli-common";
import { Pencil } from "lucide-react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock content returned by useIntlayer for "site-pending-changes-tab"
const mockContent = {
	noChangesTitle: "No Changes",
	noChangesDescription: "Your site is up to date",
	buildingTitle: "Building",
	buildingDescription: "Your site is being built",
	title: "Pending Changes",
	description: vi.fn().mockReturnValue("3 changes"),
	brandingChanges: "Branding Changes",
	brandingChangedDescription: "Branding has been modified",
	folderStructureChanges: "Navigation Structure",
	folderStructureChangedDescription: "Folder structure setting has been changed",
	authChanges: "Auth Changes",
	authEnabled: "Enabled",
	authDisabled: "Disabled",
	configChanges: "Config Changes",
	articleChanges: "Article Changes",
	newArticles: "New Articles",
	updatedArticles: "Updated Articles",
	deletedArticles: "Deleted Articles",
	changeNew: "New",
	changeUpdated: "Updated",
	changeDeleted: "Deleted",
	publishNow: "Publish Now",
	publishing: "Publishing...",
	savingChanges: "Saving...",
	unsavedChangesNote: "Save changes first",
	reasonContent: { value: "Content changed" },
	reasonSelection: { value: "Selection changed" },
	reasonConfig: { value: "Config changed" },
};

vi.mock("react-intlayer", () => ({
	useIntlayer: () => mockContent,
}));

// Mock lucide-react icons with data-testid
vi.mock("lucide-react", async importOriginal => {
	const actual = await importOriginal<typeof import("lucide-react")>();
	return {
		...actual,
		CheckCircle: (props: Record<string, unknown>) => (
			<div data-testid="check-circle-icon" className={props.className as string} />
		),
		FileJson: (props: Record<string, unknown>) => (
			<div data-testid="file-json-icon" className={props.className as string} />
		),
		FileText: (props: Record<string, unknown>) => (
			<div data-testid="file-text-icon" className={props.className as string} />
		),
		KeyRound: (props: Record<string, unknown>) => (
			<div data-testid="key-round-icon" className={props.className as string} />
		),
		Palette: (props: Record<string, unknown>) => (
			<div data-testid="palette-icon" className={props.className as string} />
		),
		Pencil: (props: Record<string, unknown>) => (
			<div data-testid="pencil-icon" className={props.className as string} />
		),
		Plus: (props: Record<string, unknown>) => <div data-testid="plus-icon" className={props.className as string} />,
		RefreshCw: (props: Record<string, unknown>) => (
			<div data-testid="refresh-icon" className={props.className as string} />
		),
		Settings: (props: Record<string, unknown>) => (
			<div data-testid="settings-icon" className={props.className as string} />
		),
		Trash2: (props: Record<string, unknown>) => (
			<div data-testid="trash2-icon" className={props.className as string} />
		),
	};
});

// Mock SiteDetailUtils
vi.mock("./SiteDetailUtils", () => ({
	needsRebuild: vi.fn(),
	getChangeCount: vi.fn(),
	getChangeTypeStyle: vi.fn().mockReturnValue({ textClass: "text-mock", badgeClass: "badge-mock" }),
}));

/** Renders the component with default props and common overrides */
function renderTab(
	siteOverrides: Partial<SiteWithUpdate> = {},
	props: { rebuilding?: boolean; hasUnsavedChanges?: boolean } = {},
) {
	const mockOnRebuild = vi.fn();
	const { metadata: metadataOverride, ...rest } = siteOverrides;
	const site = createMockSite({ metadata: metadataOverride ?? null, ...rest });
	const result = render(
		<SitePendingChangesTab
			site={site}
			rebuilding={props.rebuilding ?? false}
			hasUnsavedChanges={props.hasUnsavedChanges ?? false}
			onRebuild={mockOnRebuild}
		/>,
	);
	return { ...result, mockOnRebuild, site };
}

describe("SitePendingChangesTab", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(needsRebuild).mockReturnValue(false);
		vi.mocked(getChangeCount).mockReturnValue(0);
		vi.mocked(getChangeTypeStyle).mockReturnValue({
			textClass: "text-mock",
			badgeClass: "badge-mock",
			Icon: Pencil,
			bgClass: "bg-mock",
			borderClass: "border-mock",
		});
		mockContent.description.mockReturnValue("3 changes");
	});

	// =========================================================================
	// Empty state (no changes, not building)
	// =========================================================================
	describe("empty state", () => {
		it("should show up-to-date state when no changes and not building", () => {
			vi.mocked(needsRebuild).mockReturnValue(false);
			renderTab({ status: "active" });

			expect(screen.getByTestId("check-circle-icon")).toBeDefined();
			expect(screen.getByText("No Changes")).toBeDefined();
			expect(screen.getByText("Your site is up to date")).toBeDefined();
		});

		it("should not show publish button in empty state", () => {
			vi.mocked(needsRebuild).mockReturnValue(false);
			renderTab({ status: "active" });

			expect(screen.queryByTestId("publish-button")).toBeNull();
		});
	});

	// =========================================================================
	// Building state
	// =========================================================================
	describe("building state", () => {
		it("should show building state when status is 'building'", () => {
			renderTab({ status: "building" });

			expect(screen.getByTestId("refresh-icon")).toBeDefined();
			expect(screen.getByText("Building")).toBeDefined();
			expect(screen.getByText("Your site is being built")).toBeDefined();
		});

		it("should show building state when status is 'pending'", () => {
			renderTab({ status: "pending" });

			expect(screen.getByText("Building")).toBeDefined();
			expect(screen.getByText("Your site is being built")).toBeDefined();
		});

		it("should not show publish button in building state", () => {
			renderTab({ status: "building" });

			expect(screen.queryByTestId("publish-button")).toBeNull();
		});

		it("should prioritize building state over hasChanges", () => {
			vi.mocked(needsRebuild).mockReturnValue(true);
			vi.mocked(getChangeCount).mockReturnValue(5);
			renderTab({ status: "building" });

			// Should show building UI, not changes UI
			expect(screen.getByText("Building")).toBeDefined();
			expect(screen.queryByText("Pending Changes")).toBeNull();
		});
	});

	// =========================================================================
	// Changes view header
	// =========================================================================
	describe("changes view", () => {
		it("should show title and call description with change count", () => {
			vi.mocked(needsRebuild).mockReturnValue(true);
			vi.mocked(getChangeCount).mockReturnValue(3);
			renderTab({ status: "active" });

			expect(screen.getByText("Pending Changes")).toBeDefined();
			expect(mockContent.description).toHaveBeenCalledWith({ count: 3 });
		});

		it("should show branding changes section when brandingChanged is true", () => {
			vi.mocked(needsRebuild).mockReturnValue(true);
			vi.mocked(getChangeCount).mockReturnValue(1);
			renderTab({ status: "active", brandingChanged: true });

			expect(screen.getByTestId("palette-icon")).toBeDefined();
			expect(screen.getByText("Branding Changes")).toBeDefined();
			expect(screen.getByText("Branding has been modified")).toBeDefined();
		});

		it("should not show branding section when brandingChanged is falsy", () => {
			vi.mocked(needsRebuild).mockReturnValue(true);
			vi.mocked(getChangeCount).mockReturnValue(1);
			renderTab({ status: "active", brandingChanged: false });

			expect(screen.queryByText("Branding Changes")).toBeNull();
		});

		it("should show auth changes section with KeyRound icon", () => {
			vi.mocked(needsRebuild).mockReturnValue(true);
			vi.mocked(getChangeCount).mockReturnValue(1);
			renderTab({ status: "active", authChange: { from: false, to: true } });

			expect(screen.getByTestId("key-round-icon")).toBeDefined();
			expect(screen.getByText("Auth Changes")).toBeDefined();
		});

		it("should show auth disabled to enabled transition", () => {
			vi.mocked(needsRebuild).mockReturnValue(true);
			vi.mocked(getChangeCount).mockReturnValue(1);
			const { container } = renderTab({
				status: "active",
				authChange: { from: false, to: true },
			});

			// The full text content should include both "Disabled" and "Enabled"
			const fullText = container.textContent ?? "";
			expect(fullText).toContain("Disabled");
			expect(fullText).toContain("Enabled");
		});

		it("should show auth enabled to disabled transition", () => {
			vi.mocked(needsRebuild).mockReturnValue(true);
			vi.mocked(getChangeCount).mockReturnValue(1);
			const { container } = renderTab({
				status: "active",
				authChange: { from: true, to: false },
			});

			// The full text content should include both "Enabled" and "Disabled"
			const fullText = container.textContent ?? "";
			expect(fullText).toContain("Enabled");
			expect(fullText).toContain("Disabled");
		});

		it("should not show auth section when authChange is undefined", () => {
			vi.mocked(needsRebuild).mockReturnValue(true);
			vi.mocked(getChangeCount).mockReturnValue(1);
			renderTab({ status: "active" });

			expect(screen.queryByText("Auth Changes")).toBeNull();
		});

		it("should show config file changes with count badge", () => {
			vi.mocked(needsRebuild).mockReturnValue(true);
			vi.mocked(getChangeCount).mockReturnValue(2);
			renderTab({
				status: "active",
				changedConfigFiles: [
					{ path: "content/_meta.ts", displayName: "Navigation Config" },
					{ path: "next.config.mjs", displayName: "Next.js Config" },
				],
			});

			expect(screen.getByText("Config Changes")).toBeDefined();
			expect(screen.getByText("Navigation Config")).toBeDefined();
			expect(screen.getByText("Next.js Config")).toBeDefined();
			expect(screen.getByText("2")).toBeDefined();
		});

		it("should not show config section when changedConfigFiles is empty", () => {
			vi.mocked(needsRebuild).mockReturnValue(true);
			vi.mocked(getChangeCount).mockReturnValue(1);
			renderTab({ status: "active", changedConfigFiles: [] });

			expect(screen.queryByText("Config Changes")).toBeNull();
		});

		it("should not show config section when changedConfigFiles is undefined", () => {
			vi.mocked(needsRebuild).mockReturnValue(true);
			vi.mocked(getChangeCount).mockReturnValue(1);
			renderTab({ status: "active" });

			expect(screen.queryByText("Config Changes")).toBeNull();
		});
	});

	// =========================================================================
	// Article changes grouped by type
	// =========================================================================
	describe("article changes", () => {
		it("should show article changes section with count badge", () => {
			vi.mocked(needsRebuild).mockReturnValue(true);
			vi.mocked(getChangeCount).mockReturnValue(2);
			renderTab({
				status: "active",
				changedArticles: [
					createMockChangedArticle({ id: 1, jrn: "jrn:doc:1", title: "Article 1", changeType: "new" }),
					createMockChangedArticle({ id: 2, jrn: "jrn:doc:2", title: "Article 2", changeType: "updated" }),
				],
			});

			expect(screen.getByText("Article Changes")).toBeDefined();
			expect(screen.getByText("Article 1")).toBeDefined();
			expect(screen.getByText("Article 2")).toBeDefined();
		});

		it("should group new articles under New Articles heading", () => {
			vi.mocked(needsRebuild).mockReturnValue(true);
			vi.mocked(getChangeCount).mockReturnValue(1);
			renderTab({
				status: "active",
				changedArticles: [
					createMockChangedArticle({ id: 1, jrn: "jrn:doc:1", title: "New Article", changeType: "new" }),
				],
			});

			expect(screen.getByText(/New Articles/)).toBeDefined();
			expect(screen.getByText("New Article")).toBeDefined();
		});

		it("should group updated articles under Updated Articles heading", () => {
			vi.mocked(needsRebuild).mockReturnValue(true);
			vi.mocked(getChangeCount).mockReturnValue(1);
			renderTab({
				status: "active",
				changedArticles: [
					createMockChangedArticle({
						id: 1,
						jrn: "jrn:doc:1",
						title: "Updated Article",
						changeType: "updated",
					}),
				],
			});

			expect(screen.getByText(/Updated Articles/)).toBeDefined();
			expect(screen.getByText("Updated Article")).toBeDefined();
		});

		it("should group deleted articles under Deleted Articles heading", () => {
			vi.mocked(needsRebuild).mockReturnValue(true);
			vi.mocked(getChangeCount).mockReturnValue(1);
			renderTab({
				status: "active",
				changedArticles: [
					createMockChangedArticle({
						id: 1,
						jrn: "jrn:doc:1",
						title: "Deleted Article",
						changeType: "deleted",
					}),
				],
			});

			expect(screen.getByText(/Deleted Articles/)).toBeDefined();
			expect(screen.getByText("Deleted Article")).toBeDefined();
		});

		it("should show all three groups when articles of each type exist", () => {
			vi.mocked(needsRebuild).mockReturnValue(true);
			vi.mocked(getChangeCount).mockReturnValue(3);
			renderTab({
				status: "active",
				changedArticles: [
					createMockChangedArticle({ id: 1, jrn: "jrn:doc:1", title: "Added", changeType: "new" }),
					createMockChangedArticle({ id: 2, jrn: "jrn:doc:2", title: "Modified", changeType: "updated" }),
					createMockChangedArticle({ id: 3, jrn: "jrn:doc:3", title: "Removed", changeType: "deleted" }),
				],
			});

			expect(screen.getByText(/New Articles/)).toBeDefined();
			expect(screen.getByText(/Updated Articles/)).toBeDefined();
			expect(screen.getByText(/Deleted Articles/)).toBeDefined();
		});

		it("should not show article section when changedArticles is empty", () => {
			vi.mocked(needsRebuild).mockReturnValue(true);
			vi.mocked(getChangeCount).mockReturnValue(1);
			renderTab({ status: "active", changedArticles: [] });

			expect(screen.queryByText("Article Changes")).toBeNull();
		});

		it("should not show article section when changedArticles is undefined", () => {
			vi.mocked(needsRebuild).mockReturnValue(true);
			vi.mocked(getChangeCount).mockReturnValue(1);
			renderTab({ status: "active" });

			expect(screen.queryByText("Article Changes")).toBeNull();
		});
	});

	// =========================================================================
	// ArticleChangeRow rendering
	// =========================================================================
	describe("ArticleChangeRow", () => {
		it("should show FileText icon for markdown articles", () => {
			vi.mocked(needsRebuild).mockReturnValue(true);
			vi.mocked(getChangeCount).mockReturnValue(1);
			renderTab({
				status: "active",
				changedArticles: [
					createMockChangedArticle({
						id: 1,
						jrn: "jrn:doc:1",
						title: "MD Article",
						contentType: "text/markdown",
						changeType: "new",
					}),
				],
			});

			// FileText icon is used for both the section header and the article row
			expect(screen.getAllByTestId("file-text-icon").length).toBeGreaterThanOrEqual(1);
		});

		it("should show FileJson icon for JSON articles", () => {
			vi.mocked(needsRebuild).mockReturnValue(true);
			vi.mocked(getChangeCount).mockReturnValue(1);
			renderTab({
				status: "active",
				changedArticles: [
					createMockChangedArticle({
						id: 1,
						jrn: "jrn:doc:1",
						title: "JSON Article",
						contentType: "application/json",
						changeType: "updated",
					}),
				],
			});

			expect(screen.getByTestId("file-json-icon")).toBeDefined();
		});

		it("should show FileJson icon for YAML articles", () => {
			vi.mocked(needsRebuild).mockReturnValue(true);
			vi.mocked(getChangeCount).mockReturnValue(1);
			renderTab({
				status: "active",
				changedArticles: [
					createMockChangedArticle({
						id: 1,
						jrn: "jrn:doc:1",
						title: "YAML Article",
						contentType: "application/yaml",
						changeType: "new",
					}),
				],
			});

			expect(screen.getByTestId("file-json-icon")).toBeDefined();
		});

		it("should show 'Content changed' reason label for content change reason", () => {
			vi.mocked(needsRebuild).mockReturnValue(true);
			vi.mocked(getChangeCount).mockReturnValue(1);
			renderTab({
				status: "active",
				changedArticles: [
					createMockChangedArticle({
						id: 1,
						jrn: "jrn:doc:1",
						changeType: "updated",
						changeReason: "content",
					}),
				],
			});

			expect(screen.getByText("Content changed")).toBeDefined();
		});

		it("should show 'Selection changed' reason label for selection change reason", () => {
			vi.mocked(needsRebuild).mockReturnValue(true);
			vi.mocked(getChangeCount).mockReturnValue(1);
			renderTab({
				status: "active",
				changedArticles: [
					createMockChangedArticle({ id: 1, jrn: "jrn:doc:1", changeType: "new", changeReason: "selection" }),
				],
			});

			expect(screen.getByText("Selection changed")).toBeDefined();
		});

		it("should show 'Config changed' reason label for config change reason", () => {
			vi.mocked(needsRebuild).mockReturnValue(true);
			vi.mocked(getChangeCount).mockReturnValue(1);
			renderTab({
				status: "active",
				changedArticles: [
					createMockChangedArticle({
						id: 1,
						jrn: "jrn:doc:1",
						changeType: "updated",
						changeReason: "config",
					}),
				],
			});

			expect(screen.getByText("Config changed")).toBeDefined();
		});

		it("should not show reason label when changeReason is undefined", () => {
			vi.mocked(needsRebuild).mockReturnValue(true);
			vi.mocked(getChangeCount).mockReturnValue(1);
			renderTab({
				status: "active",
				changedArticles: [createMockChangedArticle({ id: 1, jrn: "jrn:doc:1", changeType: "updated" })],
			});

			expect(screen.queryByText("Content changed")).toBeNull();
			expect(screen.queryByText("Selection changed")).toBeNull();
			expect(screen.queryByText("Config changed")).toBeNull();
		});

		it("should call getChangeTypeStyle for each article", () => {
			vi.mocked(needsRebuild).mockReturnValue(true);
			vi.mocked(getChangeCount).mockReturnValue(2);
			renderTab({
				status: "active",
				changedArticles: [
					createMockChangedArticle({ id: 1, jrn: "jrn:doc:1", title: "A1", changeType: "new" }),
					createMockChangedArticle({ id: 2, jrn: "jrn:doc:2", title: "A2", changeType: "deleted" }),
				],
			});

			expect(getChangeTypeStyle).toHaveBeenCalledWith("new");
			expect(getChangeTypeStyle).toHaveBeenCalledWith("deleted");
		});
	});

	// =========================================================================
	// Publish button
	// =========================================================================
	describe("publish button", () => {
		it("should show 'Publish Now' text when not rebuilding and no unsaved changes", () => {
			vi.mocked(needsRebuild).mockReturnValue(true);
			vi.mocked(getChangeCount).mockReturnValue(1);
			renderTab({ status: "active" });

			const button = screen.getByTestId("publish-button");
			expect(button.textContent).toContain("Publish Now");
		});

		it("should show 'Publishing...' text when rebuilding", () => {
			vi.mocked(needsRebuild).mockReturnValue(true);
			vi.mocked(getChangeCount).mockReturnValue(1);
			renderTab({ status: "active" }, { rebuilding: true });

			const button = screen.getByTestId("publish-button");
			expect(button.textContent).toContain("Publishing...");
		});

		it("should show 'Saving...' text when hasUnsavedChanges is true", () => {
			vi.mocked(needsRebuild).mockReturnValue(true);
			vi.mocked(getChangeCount).mockReturnValue(1);
			renderTab({ status: "active" }, { hasUnsavedChanges: true });

			const button = screen.getByTestId("publish-button");
			expect(button.textContent).toContain("Saving...");
		});

		it("should be enabled when not rebuilding and no unsaved changes", () => {
			vi.mocked(needsRebuild).mockReturnValue(true);
			vi.mocked(getChangeCount).mockReturnValue(1);
			renderTab({ status: "active" });

			const button = screen.getByTestId("publish-button") as HTMLButtonElement;
			expect(button.disabled).toBe(false);
		});

		it("should be disabled when rebuilding", () => {
			vi.mocked(needsRebuild).mockReturnValue(true);
			vi.mocked(getChangeCount).mockReturnValue(1);
			renderTab({ status: "active" }, { rebuilding: true });

			const button = screen.getByTestId("publish-button") as HTMLButtonElement;
			expect(button.disabled).toBe(true);
		});

		it("should be disabled when hasUnsavedChanges is true", () => {
			vi.mocked(needsRebuild).mockReturnValue(true);
			vi.mocked(getChangeCount).mockReturnValue(1);
			renderTab({ status: "active" }, { hasUnsavedChanges: true });

			const button = screen.getByTestId("publish-button") as HTMLButtonElement;
			expect(button.disabled).toBe(true);
		});

		it("should call onRebuild when clicked and enabled", () => {
			vi.mocked(needsRebuild).mockReturnValue(true);
			vi.mocked(getChangeCount).mockReturnValue(1);
			const { mockOnRebuild } = renderTab({ status: "active" });

			fireEvent.click(screen.getByTestId("publish-button"));
			expect(mockOnRebuild).toHaveBeenCalledTimes(1);
		});

		it("should be disabled when both rebuilding and hasUnsavedChanges are true", () => {
			vi.mocked(needsRebuild).mockReturnValue(true);
			vi.mocked(getChangeCount).mockReturnValue(1);
			renderTab({ status: "active" }, { rebuilding: true, hasUnsavedChanges: true });

			const button = screen.getByTestId("publish-button") as HTMLButtonElement;
			expect(button.disabled).toBe(true);
		});
	});

	// =========================================================================
	// Unsaved changes note
	// =========================================================================
	describe("unsaved changes note", () => {
		it("should show unsaved changes note when hasUnsavedChanges is true", () => {
			vi.mocked(needsRebuild).mockReturnValue(true);
			vi.mocked(getChangeCount).mockReturnValue(1);
			renderTab({ status: "active" }, { hasUnsavedChanges: true });

			expect(screen.getByText("Save changes first")).toBeDefined();
		});

		it("should not show unsaved changes note when hasUnsavedChanges is false", () => {
			vi.mocked(needsRebuild).mockReturnValue(true);
			vi.mocked(getChangeCount).mockReturnValue(1);
			renderTab({ status: "active" });

			expect(screen.queryByText("Save changes first")).toBeNull();
		});
	});
});
