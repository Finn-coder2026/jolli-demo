import { createMockClient, renderWithProviders } from "../../test/TestUtils";
import { ArticleSitesBadge } from "./ArticleSitesBadge";
import { fireEvent, screen, waitFor } from "@testing-library/preact";
import type { ArticleSiteInfo, SiteClient } from "jolli-common";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Creates a mock ArticleSiteInfo with sensible defaults.
 */
function createMockSiteInfo(overrides: Partial<ArticleSiteInfo> = {}): ArticleSiteInfo {
	return {
		id: 1,
		name: "test-site",
		displayName: "Test Site",
		visibility: "external",
		...overrides,
	};
}

/**
 * Builds a mock SiteClient with vi.fn() for getSitesForArticle (and no-ops for other methods).
 * We only need to control getSitesForArticle for these tests.
 */
const mockSiteClient = {
	getSitesForArticle: vi.fn<(articleJrn: string) => Promise<Array<ArticleSiteInfo>>>(),
};

/**
 * Renders ArticleSitesBadge with the shared mock client injected via renderWithProviders.
 */
function renderBadge(articleJrn = "article:test-article-1") {
	const mockClient = createMockClient();
	mockClient.sites = vi.fn(() => mockSiteClient as unknown as SiteClient);
	return renderWithProviders(<ArticleSitesBadge articleJrn={articleJrn} />, { client: mockClient });
}

describe("ArticleSitesBadge", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Default: no sites — component returns null
		mockSiteClient.getSitesForArticle.mockResolvedValue([]);
	});

	describe("when no sites are returned", () => {
		it("should render nothing when getSitesForArticle returns an empty array", async () => {
			renderBadge();

			// Wait for the async fetch to resolve, then confirm nothing is rendered
			await waitFor(() => {
				expect(screen.queryByTestId("article-sites-badge")).toBeNull();
			});
		});
	});

	describe("when sites are returned", () => {
		it("should show the badge button with a count of 1 for a single site", async () => {
			mockSiteClient.getSitesForArticle.mockResolvedValue([createMockSiteInfo()]);

			renderBadge();

			await waitFor(() => {
				expect(screen.getByTestId("article-sites-badge")).toBeDefined();
			});

			expect(screen.getByTestId("article-sites-badge").textContent).toContain("1");
		});

		it("should show the correct count for multiple sites", async () => {
			mockSiteClient.getSitesForArticle.mockResolvedValue([
				createMockSiteInfo({ id: 1, name: "site-a", displayName: "Site A" }),
				createMockSiteInfo({ id: 2, name: "site-b", displayName: "Site B" }),
				createMockSiteInfo({ id: 3, name: "site-c", displayName: "Site C" }),
			]);

			renderBadge();

			await waitFor(() => {
				expect(screen.getByTestId("article-sites-badge").textContent).toContain("3");
			});
		});

		it("should render a Globe icon inside the badge trigger", async () => {
			mockSiteClient.getSitesForArticle.mockResolvedValue([createMockSiteInfo()]);

			const { container } = renderBadge();

			await waitFor(() => {
				expect(screen.getByTestId("article-sites-badge")).toBeDefined();
			});

			// lucide-react is mocked globally — icons render as <svg data-lucide-icon="...">
			const globeInsideBadge = container.querySelector(
				'[data-testid="article-sites-badge"] [data-lucide-icon="Globe"]',
			);
			expect(globeInsideBadge).not.toBeNull();
		});
	});

	describe("popover interaction", () => {
		it("should open the popover and show the site list on click", async () => {
			mockSiteClient.getSitesForArticle.mockResolvedValue([
				createMockSiteInfo({ id: 1, name: "my-site", displayName: "My Site" }),
			]);

			renderBadge();

			await waitFor(() => {
				expect(screen.getByTestId("article-sites-badge")).toBeDefined();
			});

			fireEvent.click(screen.getByTestId("article-sites-badge"));

			await waitFor(() => {
				expect(screen.getByTestId("article-sites-popover")).toBeDefined();
			});

			expect(screen.getByText("My Site")).toBeDefined();
		});

		it("should show a Globe icon and 'Public' label for external sites", async () => {
			mockSiteClient.getSitesForArticle.mockResolvedValue([
				createMockSiteInfo({ id: 1, name: "public-site", displayName: "Public Site", visibility: "external" }),
			]);

			renderBadge();

			await waitFor(() => {
				expect(screen.getByTestId("article-sites-badge")).toBeDefined();
			});

			fireEvent.click(screen.getByTestId("article-sites-badge"));

			await waitFor(() => {
				expect(screen.getByTestId("article-sites-popover")).toBeDefined();
			});

			// Should display the "Public" i18n label for external sites
			expect(screen.getByText("Public")).toBeDefined();

			// Should show a Globe icon inside the popover content (not the Lock icon)
			const popover = screen.getByTestId("article-sites-popover");
			const globeInPopover = popover.querySelector('[data-lucide-icon="Globe"]');
			expect(globeInPopover).not.toBeNull();
		});

		it("should show a Lock icon and 'Internal' label for internal sites", async () => {
			mockSiteClient.getSitesForArticle.mockResolvedValue([
				createMockSiteInfo({
					id: 2,
					name: "internal-site",
					displayName: "Internal Site",
					visibility: "internal",
				}),
			]);

			renderBadge();

			await waitFor(() => {
				expect(screen.getByTestId("article-sites-badge")).toBeDefined();
			});

			fireEvent.click(screen.getByTestId("article-sites-badge"));

			await waitFor(() => {
				expect(screen.getByTestId("article-sites-popover")).toBeDefined();
			});

			// Should display the "Internal" i18n label for internal sites
			expect(screen.getByText("Internal")).toBeDefined();

			// Should show a Lock icon inside the popover
			const popover = screen.getByTestId("article-sites-popover");
			const lockInPopover = popover.querySelector('[data-lucide-icon="Lock"]');
			expect(lockInPopover).not.toBeNull();
		});

		it("should show correct icons and labels for a mix of external and internal sites", async () => {
			mockSiteClient.getSitesForArticle.mockResolvedValue([
				createMockSiteInfo({ id: 1, name: "ext-site", displayName: "External Site", visibility: "external" }),
				createMockSiteInfo({ id: 2, name: "int-site", displayName: "Internal Site", visibility: "internal" }),
			]);

			renderBadge();

			await waitFor(() => {
				expect(screen.getByTestId("article-sites-badge")).toBeDefined();
			});

			// Badge count should reflect both sites
			expect(screen.getByTestId("article-sites-badge").textContent).toContain("2");

			fireEvent.click(screen.getByTestId("article-sites-badge"));

			await waitFor(() => {
				expect(screen.getByTestId("article-sites-popover")).toBeDefined();
			});

			const popover = screen.getByTestId("article-sites-popover");

			expect(screen.getByText("External Site")).toBeDefined();
			expect(screen.getByText("Internal Site")).toBeDefined();
			expect(screen.getByText("Public")).toBeDefined();
			expect(screen.getByText("Internal")).toBeDefined();

			// Both icon types should appear inside the popover
			expect(popover.querySelector('[data-lucide-icon="Globe"]')).not.toBeNull();
			expect(popover.querySelector('[data-lucide-icon="Lock"]')).not.toBeNull();
		});

		it("should display the site name when displayName is provided", async () => {
			mockSiteClient.getSitesForArticle.mockResolvedValue([
				createMockSiteInfo({ id: 1, name: "slug-name", displayName: "Human Friendly Name" }),
			]);

			renderBadge();

			await waitFor(() => {
				expect(screen.getByTestId("article-sites-badge")).toBeDefined();
			});

			fireEvent.click(screen.getByTestId("article-sites-badge"));

			await waitFor(() => {
				expect(screen.getByTestId("article-sites-popover")).toBeDefined();
			});

			// displayName takes precedence over name
			expect(screen.getByText("Human Friendly Name")).toBeDefined();
		});

		it("should fall back to name when displayName is an empty string", async () => {
			mockSiteClient.getSitesForArticle.mockResolvedValue([
				// The component uses `site.displayName || site.name`, so an empty displayName falls back
				createMockSiteInfo({ id: 1, name: "fallback-name", displayName: "" }),
			]);

			renderBadge();

			await waitFor(() => {
				expect(screen.getByTestId("article-sites-badge")).toBeDefined();
			});

			fireEvent.click(screen.getByTestId("article-sites-badge"));

			await waitFor(() => {
				expect(screen.getByTestId("article-sites-popover")).toBeDefined();
			});

			expect(screen.getByText("fallback-name")).toBeDefined();
		});

		it("should fall back to name when displayName is empty for an internal site", async () => {
			mockSiteClient.getSitesForArticle.mockResolvedValue([
				createMockSiteInfo({ id: 3, name: "internal-slug", displayName: "", visibility: "internal" }),
			]);

			renderBadge();

			await waitFor(() => {
				expect(screen.getByTestId("article-sites-badge")).toBeDefined();
			});

			fireEvent.click(screen.getByTestId("article-sites-badge"));

			await waitFor(() => {
				expect(screen.getByTestId("article-sites-popover")).toBeDefined();
			});

			expect(screen.getByText("internal-slug")).toBeDefined();
		});

		it("should display the 'Published Sites' section header inside the popover", async () => {
			mockSiteClient.getSitesForArticle.mockResolvedValue([createMockSiteInfo()]);

			renderBadge();

			await waitFor(() => {
				expect(screen.getByTestId("article-sites-badge")).toBeDefined();
			});

			fireEvent.click(screen.getByTestId("article-sites-badge"));

			await waitFor(() => {
				expect(screen.getByTestId("article-sites-popover")).toBeDefined();
			});

			// The i18n key "publishedSites" maps to "Published Sites" in the IntlayerMock
			expect(screen.getByText("Published Sites")).toBeDefined();
		});
	});

	describe("error handling", () => {
		it("should return null and not throw when getSitesForArticle rejects", async () => {
			mockSiteClient.getSitesForArticle.mockRejectedValue(new Error("Network error"));

			renderBadge();

			// After the error the sites array stays empty, so the component renders nothing
			await waitFor(() => {
				expect(screen.queryByTestId("article-sites-badge")).toBeNull();
			});
		});

		it("should call getSitesForArticle with the provided articleJrn", async () => {
			const testJrn = "article:my-specific-article";
			mockSiteClient.getSitesForArticle.mockResolvedValue([]);

			renderBadge(testJrn);

			await waitFor(() => {
				expect(mockSiteClient.getSitesForArticle).toHaveBeenCalledWith(testJrn);
			});
		});
	});

	describe("re-fetching when articleJrn changes", () => {
		it("should re-fetch sites when articleJrn prop changes", async () => {
			const firstJrn = "article:first-article";
			const secondJrn = "article:second-article";

			mockSiteClient.getSitesForArticle
				.mockResolvedValueOnce([createMockSiteInfo({ id: 1, displayName: "First Site" })])
				.mockResolvedValueOnce([createMockSiteInfo({ id: 2, displayName: "Second Site" })]);

			const mockClient = createMockClient();
			mockClient.sites = vi.fn(() => mockSiteClient as unknown as SiteClient);

			const { rerender } = renderWithProviders(<ArticleSitesBadge articleJrn={firstJrn} />, {
				client: mockClient,
			});

			await waitFor(() => {
				expect(screen.getByTestId("article-sites-badge").textContent).toContain("1");
			});

			expect(mockSiteClient.getSitesForArticle).toHaveBeenCalledWith(firstJrn);

			rerender(<ArticleSitesBadge articleJrn={secondJrn} />);

			await waitFor(() => {
				expect(mockSiteClient.getSitesForArticle).toHaveBeenCalledWith(secondJrn);
			});

			expect(mockSiteClient.getSitesForArticle).toHaveBeenCalledTimes(2);
		});
	});
});
