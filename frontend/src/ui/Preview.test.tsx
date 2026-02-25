import { ClientProvider } from "../contexts/ClientContext";
import { Preview } from "./Preview";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockNavigate = vi.fn();

vi.mock("../contexts/NavigationContext", async () => {
	const actual = await vi.importActual("../contexts/NavigationContext");
	return {
		...actual,
		useNavigation: () => ({
			navigate: mockNavigate,
		}),
	};
});

/**
 * JRN Format History:
 * - v1 (path-based): /root/integrations/{org}/{repo}/{branch}
 * - v2 (structured): jrn:/global:sources:github/{org}/{repo}/{branch}
 *
 * Test fixtures in this file use v1 format. Use DEMO_MIGRATE_JRNS job
 * to migrate from v1 to v2 format.
 */

// Mock markdown-to-jsx to render as plain text in tests
vi.mock("markdown-to-jsx", () => ({
	default: ({ children }: { children: string }) => <div>{children}</div>,
}));

describe("Preview", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		global.fetch = vi.fn();
	});

	it("should show loading state initially", () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
			() =>
				new Promise(() => {
					// Never resolves - testing loading state
				}),
		);

		render(
			<ClientProvider>
				<Preview jrn="doc:test" />
			</ClientProvider>,
		);

		expect(screen.getByText(/Loading preview for/)).toBeDefined();
	});

	it("should show not found message when article doesn't exist", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: false,
			status: 404,
		});

		render(
			<ClientProvider>
				<Preview jrn="doc:nonexistent" />
			</ClientProvider>,
		);

		await waitFor(() => {
			expect(screen.getByText("Article Not Found")).toBeDefined();
		});
	});

	it("should display article content in preview format", async () => {
		const mockDoc = {
			id: 1,
			jrn: "doc:test-article",
			createdAt: "2025-10-01T00:00:00Z",
			updatedAt: "2025-10-01T00:00:00Z",
			updatedBy: "system",
			content: "# Test Article\n\nThis is test content.",
			contentType: "text/markdown",
			version: 1,
			contentMetadata: {
				title: "Test Article",
				sourceName: "GitHub Docs",
				lastUpdated: "2025-10-01T00:00:00Z",
			},
		};

		(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(url => {
			if (String(url).includes("/api/doc-drafts/with-pending-changes")) {
				return Promise.resolve({
					ok: true,
					json: async () => [],
				});
			}
			return Promise.resolve({
				ok: true,
				json: async () => mockDoc,
			});
		});

		render(
			<ClientProvider>
				<Preview jrn="doc:test-article" />
			</ClientProvider>,
		);

		await waitFor(() => {
			expect(screen.getByText("Test Article")).toBeDefined();
		});

		expect(screen.getByText("Source: GitHub Docs")).toBeDefined();
		// By default, markdown is rendered (no # prefix shown)
		expect(screen.getAllByText("Test Article").length).toBeGreaterThan(0);
		expect(screen.getByText(/This is test content/)).toBeDefined();
		expect(screen.getByText("Version 1")).toBeDefined();

		// Toggle pills should be present
		const renderedPill = screen.getByText("Rendered").closest("button");
		const sourcePill = screen.getByText("Source").closest("button");
		expect(renderedPill).toBeDefined();
		expect(sourcePill).toBeDefined();

		// By default, "Rendered" should be active
		expect(renderedPill?.getAttribute("aria-pressed")).toBe("true");
		expect(sourcePill?.getAttribute("aria-pressed")).toBe("false");

		// Click to show raw markdown
		if (sourcePill) {
			fireEvent.click(sourcePill);
		}

		// Now the raw markdown should be visible
		await waitFor(() => {
			expect(screen.getByText(/# Test Article/)).toBeDefined();
		});

		// Source pill should now be active
		const sourcePillAfter = screen.getByText("Source").closest("button");
		const renderedPillAfter = screen.getByText("Rendered").closest("button");
		expect(sourcePillAfter?.getAttribute("aria-pressed")).toBe("true");
		expect(renderedPillAfter?.getAttribute("aria-pressed")).toBe("false");
	});

	it("should handle fetch errors gracefully", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Network error"));

		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {
			// Suppress error logging during test
		});

		render(
			<ClientProvider>
				<Preview jrn="doc:test" />
			</ClientProvider>,
		);

		await waitFor(() => {
			expect(screen.getByText("Article Not Found")).toBeDefined();
		});

		consoleSpy.mockRestore();
	});

	it("should display article without source name", async () => {
		const mockDoc = {
			id: 1,
			jrn: "doc:test",
			createdAt: "2025-10-01T00:00:00Z",
			updatedAt: "2025-10-01T00:00:00Z",
			updatedBy: "system",
			content: "Test content",
			contentType: "text/markdown",
			version: 2,
			contentMetadata: {
				title: "Test Article",
			},
		};

		(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(url => {
			if (String(url).includes("/api/doc-drafts/with-pending-changes")) {
				return Promise.resolve({
					ok: true,
					json: async () => [],
				});
			}
			return Promise.resolve({
				ok: true,
				json: async () => mockDoc,
			});
		});

		render(
			<ClientProvider>
				<Preview jrn="doc:test" />
			</ClientProvider>,
		);

		await waitFor(() => {
			expect(screen.getByText("Test Article")).toBeDefined();
		});

		expect(screen.getByText("Test content")).toBeDefined();
		expect(screen.getByText("Version 2")).toBeDefined();
	});

	it("should display article without metadata", async () => {
		const mockDoc = {
			id: 1,
			jrn: "doc:test",
			createdAt: "2025-10-01T00:00:00Z",
			updatedAt: "2025-10-01T00:00:00Z",
			updatedBy: "system",
			content: "Simple content",
			contentType: "text/markdown",
			version: 1,
		};

		(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(url => {
			if (String(url).includes("/api/doc-drafts/with-pending-changes")) {
				return Promise.resolve({
					ok: true,
					json: async () => [],
				});
			}
			return Promise.resolve({
				ok: true,
				json: async () => mockDoc,
			});
		});

		render(
			<ClientProvider>
				<Preview jrn="doc:test" />
			</ClientProvider>,
		);

		await waitFor(() => {
			expect(screen.getByText("Untitled")).toBeDefined();
		});

		expect(screen.getByText("Simple content")).toBeDefined();
	});

	it("should strip jolliscript frontmatter from preview", async () => {
		const mockDoc = {
			id: 1,
			jrn: "doc:automation-test",
			createdAt: "2025-10-01T00:00:00Z",
			updatedAt: "2025-10-01T00:00:00Z",
			updatedBy: "system",
			content: `---
article_type: jolliscript
on:
  - jrn: /root/integrations/*/*/*
    verb: GIT_PUSH
job:
  steps:
    - name: "Update Article"
      run_prompt: |
        check out the repo
---

# My Automated Article

This is the visible content.`,
			contentType: "text/markdown",
			version: 1,
			contentMetadata: {
				title: "Automation Test",
			},
		};

		(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(url => {
			if (String(url).includes("/api/doc-drafts/with-pending-changes")) {
				return Promise.resolve({
					ok: true,
					json: async () => [],
				});
			}
			return Promise.resolve({
				ok: true,
				json: async () => mockDoc,
			});
		});

		render(
			<ClientProvider>
				<Preview jrn="doc:automation-test" />
			</ClientProvider>,
		);

		await waitFor(() => {
			expect(screen.getByText("Automation Test")).toBeDefined();
		});

		// Content should be visible (jolliscript stripped, so article content shows)
		expect(screen.getByText(/This is the visible content/)).toBeDefined();

		// Jolliscript frontmatter keywords should NOT be visible
		expect(screen.queryByText(/article_type/)).toBeNull();
		expect(screen.queryByText(/GIT_PUSH/)).toBeNull();
		expect(screen.queryByText(/run_prompt/)).toBeNull();
	});

	it("should strip jolliscript frontmatter in raw view mode", async () => {
		const mockDoc = {
			id: 1,
			jrn: "doc:jolliscript-raw",
			createdAt: "2025-10-01T00:00:00Z",
			updatedAt: "2025-10-01T00:00:00Z",
			updatedBy: "system",
			content: `---
article_type: jolliscript
on:
  - jrn: /root/*
---

# Raw View Test

Content here.`,
			contentType: "text/markdown",
			version: 1,
			contentMetadata: {
				title: "Raw View Test",
			},
		};

		(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(url => {
			if (String(url).includes("/api/doc-drafts/with-pending-changes")) {
				return Promise.resolve({
					ok: true,
					json: async () => [],
				});
			}
			return Promise.resolve({
				ok: true,
				json: async () => mockDoc,
			});
		});

		render(
			<ClientProvider>
				<Preview jrn="doc:jolliscript-raw" />
			</ClientProvider>,
		);

		await waitFor(() => {
			expect(screen.getByText("Raw View Test")).toBeDefined();
		});

		// Switch to raw/source view
		const sourcePill = screen.getByText("Source").closest("button");
		if (sourcePill) {
			fireEvent.click(sourcePill);
		}

		// Wait for raw view to show content
		await waitFor(() => {
			expect(screen.getByText(/# Raw View Test/)).toBeDefined();
		});

		// Jolliscript frontmatter should NOT be in raw view either
		expect(screen.queryByText(/article_type/)).toBeNull();
		expect(screen.queryByText(/GIT_PUSH/)).toBeNull();
	});

	it("should display Edit button", async () => {
		const mockDoc = {
			id: 1,
			jrn: "doc:test-article",
			createdAt: "2025-10-01T00:00:00Z",
			updatedAt: "2025-10-01T00:00:00Z",
			updatedBy: "system",
			content: "# Test Article\n\nThis is test content.",
			contentType: "text/markdown",
			version: 1,
			contentMetadata: {
				title: "Test Article",
			},
		};

		(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(url => {
			if (String(url).includes("/api/docs/")) {
				return Promise.resolve({
					ok: true,
					json: async () => mockDoc,
				});
			}
			if (String(url).includes("/api/doc-drafts/with-pending-changes")) {
				return Promise.resolve({
					ok: true,
					json: async () => [],
				});
			}
			return Promise.resolve({ ok: true, json: async () => ({}) });
		});

		render(
			<ClientProvider>
				<Preview jrn="doc:test-article" />
			</ClientProvider>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("edit-article-button")).toBeDefined();
		});

		expect(screen.getByText("Edit")).toBeDefined();
	});

	it("should display Edit button with suggestion count when draft has pending changes", async () => {
		const mockDoc = {
			id: 42,
			jrn: "doc:article-with-suggestions",
			createdAt: "2025-10-01T00:00:00Z",
			updatedAt: "2025-10-01T00:00:00Z",
			updatedBy: "system",
			content: "# Article with Suggestions\n\nContent here.",
			contentType: "text/markdown",
			version: 1,
			contentMetadata: {
				title: "Article with Suggestions",
			},
		};

		const mockDraftsWithPendingChanges = [
			{
				draft: {
					id: 100,
					docId: 42,
					title: "Article with Suggestions",
					content: "content",
					contentType: "text/markdown",
					createdBy: 1,
					createdAt: "2025-10-01T00:00:00Z",
					updatedAt: "2025-10-01T00:00:00Z",
					isShared: false,
					createdByAgent: true,
				},
				pendingChangesCount: 3,
				lastChangeUpdatedAt: "2025-10-01T00:00:00Z",
			},
		];

		(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(url => {
			if (String(url).includes("/api/docs/")) {
				return Promise.resolve({
					ok: true,
					json: async () => mockDoc,
				});
			}
			if (String(url).includes("/api/doc-drafts/with-pending-changes")) {
				return Promise.resolve({
					ok: true,
					json: async () => mockDraftsWithPendingChanges,
				});
			}
			return Promise.resolve({ ok: true, json: async () => ({}) });
		});

		render(
			<ClientProvider>
				<Preview jrn="doc:article-with-suggestions" />
			</ClientProvider>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("edit-article-button")).toBeDefined();
		});

		expect(screen.getByText(/Edit.*3.*suggestions/)).toBeDefined();
	});

	it("should display singular 'suggestion' when count is 1", async () => {
		const mockDoc = {
			id: 42,
			jrn: "doc:article-one-suggestion",
			createdAt: "2025-10-01T00:00:00Z",
			updatedAt: "2025-10-01T00:00:00Z",
			updatedBy: "system",
			content: "# Article\n\nContent.",
			contentType: "text/markdown",
			version: 1,
			contentMetadata: {
				title: "Article",
			},
		};

		const mockDraftsWithPendingChanges = [
			{
				draft: {
					id: 100,
					docId: 42,
					title: "Article",
					content: "content",
					contentType: "text/markdown",
					createdBy: 1,
					createdAt: "2025-10-01T00:00:00Z",
					updatedAt: "2025-10-01T00:00:00Z",
					isShared: false,
					createdByAgent: true,
				},
				pendingChangesCount: 1,
				lastChangeUpdatedAt: "2025-10-01T00:00:00Z",
			},
		];

		(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(url => {
			if (String(url).includes("/api/docs/")) {
				return Promise.resolve({
					ok: true,
					json: async () => mockDoc,
				});
			}
			if (String(url).includes("/api/doc-drafts/with-pending-changes")) {
				return Promise.resolve({
					ok: true,
					json: async () => mockDraftsWithPendingChanges,
				});
			}
			return Promise.resolve({ ok: true, json: async () => ({}) });
		});

		render(
			<ClientProvider>
				<Preview jrn="doc:article-one-suggestion" />
			</ClientProvider>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("edit-article-button")).toBeDefined();
		});

		expect(screen.getByText(/Edit.*1.*suggestion[^s]/)).toBeDefined();
	});

	it("should navigate to edit page with existing draft when clicking Edit with suggestions", async () => {
		const mockDoc = {
			id: 42,
			jrn: "doc:article-with-draft",
			createdAt: "2025-10-01T00:00:00Z",
			updatedAt: "2025-10-01T00:00:00Z",
			updatedBy: "system",
			content: "# Article\n\nContent.",
			contentType: "text/markdown",
			version: 1,
			contentMetadata: {
				title: "Article",
			},
		};

		const mockDraftsWithPendingChanges = [
			{
				draft: {
					id: 100,
					docId: 42,
					title: "Article",
					content: "content",
					contentType: "text/markdown",
					createdBy: 1,
					createdAt: "2025-10-01T00:00:00Z",
					updatedAt: "2025-10-01T00:00:00Z",
					isShared: false,
					createdByAgent: true,
				},
				pendingChangesCount: 2,
				lastChangeUpdatedAt: "2025-10-01T00:00:00Z",
			},
		];

		(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(url => {
			if (String(url).includes("/api/docs/")) {
				return Promise.resolve({
					ok: true,
					json: async () => mockDoc,
				});
			}
			if (String(url).includes("/api/doc-drafts/with-pending-changes")) {
				return Promise.resolve({
					ok: true,
					json: async () => mockDraftsWithPendingChanges,
				});
			}
			return Promise.resolve({ ok: true, json: async () => ({}) });
		});

		render(
			<ClientProvider>
				<Preview jrn="doc:article-with-draft" />
			</ClientProvider>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("edit-article-button")).toBeDefined();
		});

		fireEvent.click(screen.getByTestId("edit-article-button"));

		await waitFor(() => {
			expect(mockNavigate).toHaveBeenCalledWith("/articles?edit=100");
		});
	});

	it("should create draft and navigate when clicking Edit without existing draft", async () => {
		const mockDoc = {
			id: 42,
			jrn: "doc:article-no-draft",
			createdAt: "2025-10-01T00:00:00Z",
			updatedAt: "2025-10-01T00:00:00Z",
			updatedBy: "system",
			content: "# Article\n\nContent.",
			contentType: "text/markdown",
			version: 1,
			contentMetadata: {
				title: "Article",
			},
		};

		const mockCreatedDraft = {
			id: 200,
			docId: 42,
			title: "Article",
			content: "# Article\n\nContent.",
			contentType: "text/markdown",
			createdBy: 1,
			createdAt: "2025-10-01T00:00:00Z",
			updatedAt: "2025-10-01T00:00:00Z",
			isShared: false,
			createdByAgent: false,
		};

		(global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url, options) => {
			const method = options?.method || "GET";
			if (String(url).includes("/api/docs/") && !String(url).includes("create-draft")) {
				return Promise.resolve({
					ok: true,
					json: async () => mockDoc,
				});
			}
			if (String(url).includes("/api/doc-drafts/with-pending-changes")) {
				return Promise.resolve({
					ok: true,
					json: async () => [],
				});
			}
			if (String(url).includes("create-draft") && method === "POST") {
				return Promise.resolve({
					ok: true,
					json: async () => mockCreatedDraft,
				});
			}
			return Promise.resolve({ ok: true, json: async () => ({}) });
		});

		render(
			<ClientProvider>
				<Preview jrn="doc:article-no-draft" />
			</ClientProvider>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("edit-article-button")).toBeDefined();
		});

		fireEvent.click(screen.getByTestId("edit-article-button"));

		await waitFor(() => {
			expect(mockNavigate).toHaveBeenCalledWith("/articles?edit=200");
		});
	});

	it("should apply amber text styling and container border when there are suggestions", async () => {
		const mockDoc = {
			id: 42,
			jrn: "doc:article-amber",
			createdAt: "2025-10-01T00:00:00Z",
			updatedAt: "2025-10-01T00:00:00Z",
			updatedBy: "system",
			content: "# Article\n\nContent.",
			contentType: "text/markdown",
			version: 1,
			contentMetadata: {
				title: "Article",
			},
		};

		const mockDraftsWithPendingChanges = [
			{
				draft: {
					id: 100,
					docId: 42,
					title: "Article",
					content: "content",
					contentType: "text/markdown",
					createdBy: 1,
					createdAt: "2025-10-01T00:00:00Z",
					updatedAt: "2025-10-01T00:00:00Z",
					isShared: false,
					createdByAgent: true,
				},
				pendingChangesCount: 2,
				lastChangeUpdatedAt: "2025-10-01T00:00:00Z",
			},
		];

		(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(url => {
			if (String(url).includes("/api/docs/")) {
				return Promise.resolve({
					ok: true,
					json: async () => mockDoc,
				});
			}
			if (String(url).includes("/api/doc-drafts/with-pending-changes")) {
				return Promise.resolve({
					ok: true,
					json: async () => mockDraftsWithPendingChanges,
				});
			}
			return Promise.resolve({ ok: true, json: async () => ({}) });
		});

		render(
			<ClientProvider>
				<Preview jrn="doc:article-amber" />
			</ClientProvider>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("edit-button-container")).toBeDefined();
		});

		const container = screen.getByTestId("edit-button-container");
		expect(container.className).toContain("border");
		expect(container.className).toContain("border-input");

		const editButton = screen.getByTestId("edit-article-button");
		expect(editButton.className).toContain("text-amber-600");
	});

	it("should show toggle button when there are suggestions", async () => {
		const mockDoc = {
			id: 42,
			jrn: "doc:article-toggle",
			createdAt: "2025-10-01T00:00:00Z",
			updatedAt: "2025-10-01T00:00:00Z",
			updatedBy: "system",
			content: "# Article\n\nContent.",
			contentType: "text/markdown",
			version: 1,
			contentMetadata: {
				title: "Article",
			},
		};

		const mockDraftsWithPendingChanges = [
			{
				draft: {
					id: 100,
					docId: 42,
					title: "Article",
					content: "content",
					contentType: "text/markdown",
					createdBy: 1,
					createdAt: "2025-10-01T00:00:00Z",
					updatedAt: "2025-10-01T00:00:00Z",
					isShared: false,
					createdByAgent: true,
				},
				pendingChangesCount: 3,
				lastChangeUpdatedAt: "2025-10-01T00:00:00Z",
			},
		];

		(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(url => {
			if (String(url).includes("/api/docs/")) {
				return Promise.resolve({
					ok: true,
					json: async () => mockDoc,
				});
			}
			if (String(url).includes("/api/doc-drafts/with-pending-changes")) {
				return Promise.resolve({
					ok: true,
					json: async () => mockDraftsWithPendingChanges,
				});
			}
			return Promise.resolve({ ok: true, json: async () => ({}) });
		});

		render(
			<ClientProvider>
				<Preview jrn="doc:article-toggle" />
			</ClientProvider>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("toggle-suggestions-button")).toBeDefined();
		});
	});

	it("should not show toggle button when there are no suggestions", async () => {
		const mockDoc = {
			id: 42,
			jrn: "doc:article-no-toggle",
			createdAt: "2025-10-01T00:00:00Z",
			updatedAt: "2025-10-01T00:00:00Z",
			updatedBy: "system",
			content: "# Article\n\nContent.",
			contentType: "text/markdown",
			version: 1,
			contentMetadata: {
				title: "Article",
			},
		};

		(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(url => {
			if (String(url).includes("/api/docs/")) {
				return Promise.resolve({
					ok: true,
					json: async () => mockDoc,
				});
			}
			if (String(url).includes("/api/doc-drafts/with-pending-changes")) {
				return Promise.resolve({
					ok: true,
					json: async () => [],
				});
			}
			return Promise.resolve({ ok: true, json: async () => ({}) });
		});

		render(
			<ClientProvider>
				<Preview jrn="doc:article-no-toggle" />
			</ClientProvider>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("edit-article-button")).toBeDefined();
		});

		expect(screen.queryByTestId("toggle-suggestions-button")).toBeNull();
	});

	it("should expand suggestion navigation when toggle is clicked", async () => {
		const mockDoc = {
			id: 42,
			jrn: "doc:article-expand",
			createdAt: "2025-10-01T00:00:00Z",
			updatedAt: "2025-10-01T00:00:00Z",
			updatedBy: "system",
			content: "# Article\n\nContent.",
			contentType: "text/markdown",
			version: 1,
			contentMetadata: {
				title: "Article",
			},
		};

		const mockDraftsWithPendingChanges = [
			{
				draft: {
					id: 100,
					docId: 42,
					title: "Article",
					content: "content",
					contentType: "text/markdown",
					createdBy: 1,
					createdAt: "2025-10-01T00:00:00Z",
					updatedAt: "2025-10-01T00:00:00Z",
					isShared: false,
					createdByAgent: true,
				},
				pendingChangesCount: 5,
				lastChangeUpdatedAt: "2025-10-01T00:00:00Z",
			},
		];

		(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(url => {
			if (String(url).includes("/api/docs/")) {
				return Promise.resolve({
					ok: true,
					json: async () => mockDoc,
				});
			}
			if (String(url).includes("/api/doc-drafts/with-pending-changes")) {
				return Promise.resolve({
					ok: true,
					json: async () => mockDraftsWithPendingChanges,
				});
			}
			return Promise.resolve({ ok: true, json: async () => ({}) });
		});

		render(
			<ClientProvider>
				<Preview jrn="doc:article-expand" />
			</ClientProvider>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("toggle-suggestions-button")).toBeDefined();
		});

		expect(screen.queryByTestId("suggestion-counter")).toBeNull();
		expect(screen.queryByTestId("suggestion-divider")).toBeNull();

		fireEvent.click(screen.getByTestId("toggle-suggestions-button"));

		await waitFor(() => {
			expect(screen.getByTestId("suggestion-counter")).toBeDefined();
		});

		expect(screen.getByTestId("suggestion-divider")).toBeDefined();
		expect(screen.getByTestId("previous-suggestion-button")).toBeDefined();
		expect(screen.getByTestId("next-suggestion-button")).toBeDefined();
		expect(screen.getByText("1/5")).toBeDefined();
	});

	it("should collapse suggestion navigation when toggle is clicked again", async () => {
		const mockDoc = {
			id: 42,
			jrn: "doc:article-collapse",
			createdAt: "2025-10-01T00:00:00Z",
			updatedAt: "2025-10-01T00:00:00Z",
			updatedBy: "system",
			content: "# Article\n\nContent.",
			contentType: "text/markdown",
			version: 1,
			contentMetadata: {
				title: "Article",
			},
		};

		const mockDraftsWithPendingChanges = [
			{
				draft: {
					id: 100,
					docId: 42,
					title: "Article",
					content: "content",
					contentType: "text/markdown",
					createdBy: 1,
					createdAt: "2025-10-01T00:00:00Z",
					updatedAt: "2025-10-01T00:00:00Z",
					isShared: false,
					createdByAgent: true,
				},
				pendingChangesCount: 3,
				lastChangeUpdatedAt: "2025-10-01T00:00:00Z",
			},
		];

		(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(url => {
			if (String(url).includes("/api/docs/")) {
				return Promise.resolve({
					ok: true,
					json: async () => mockDoc,
				});
			}
			if (String(url).includes("/api/doc-drafts/with-pending-changes")) {
				return Promise.resolve({
					ok: true,
					json: async () => mockDraftsWithPendingChanges,
				});
			}
			return Promise.resolve({ ok: true, json: async () => ({}) });
		});

		render(
			<ClientProvider>
				<Preview jrn="doc:article-collapse" />
			</ClientProvider>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("toggle-suggestions-button")).toBeDefined();
		});

		fireEvent.click(screen.getByTestId("toggle-suggestions-button"));

		await waitFor(() => {
			expect(screen.getByTestId("suggestion-counter")).toBeDefined();
		});

		fireEvent.click(screen.getByTestId("toggle-suggestions-button"));

		await waitFor(() => {
			expect(screen.queryByTestId("suggestion-counter")).toBeNull();
		});

		expect(screen.queryByTestId("suggestion-divider")).toBeNull();
	});

	it("should navigate to next suggestion when clicking next button", async () => {
		const mockDoc = {
			id: 42,
			jrn: "doc:article-next",
			createdAt: "2025-10-01T00:00:00Z",
			updatedAt: "2025-10-01T00:00:00Z",
			updatedBy: "system",
			content: "# Article\n\nContent.",
			contentType: "text/markdown",
			version: 1,
			contentMetadata: {
				title: "Article",
			},
		};

		const mockDraftsWithPendingChanges = [
			{
				draft: {
					id: 100,
					docId: 42,
					title: "Article",
					content: "content",
					contentType: "text/markdown",
					createdBy: 1,
					createdAt: "2025-10-01T00:00:00Z",
					updatedAt: "2025-10-01T00:00:00Z",
					isShared: false,
					createdByAgent: true,
				},
				pendingChangesCount: 3,
				lastChangeUpdatedAt: "2025-10-01T00:00:00Z",
			},
		];

		(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(url => {
			if (String(url).includes("/api/docs/")) {
				return Promise.resolve({
					ok: true,
					json: async () => mockDoc,
				});
			}
			if (String(url).includes("/api/doc-drafts/with-pending-changes")) {
				return Promise.resolve({
					ok: true,
					json: async () => mockDraftsWithPendingChanges,
				});
			}
			return Promise.resolve({ ok: true, json: async () => ({}) });
		});

		render(
			<ClientProvider>
				<Preview jrn="doc:article-next" />
			</ClientProvider>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("toggle-suggestions-button")).toBeDefined();
		});

		fireEvent.click(screen.getByTestId("toggle-suggestions-button"));

		await waitFor(() => {
			expect(screen.getByText("1/3")).toBeDefined();
		});

		fireEvent.click(screen.getByTestId("next-suggestion-button"));

		await waitFor(() => {
			expect(screen.getByText("2/3")).toBeDefined();
		});
	});

	it("should navigate to previous suggestion when clicking previous button", async () => {
		const mockDoc = {
			id: 42,
			jrn: "doc:article-prev",
			createdAt: "2025-10-01T00:00:00Z",
			updatedAt: "2025-10-01T00:00:00Z",
			updatedBy: "system",
			content: "# Article\n\nContent.",
			contentType: "text/markdown",
			version: 1,
			contentMetadata: {
				title: "Article",
			},
		};

		const mockDraftsWithPendingChanges = [
			{
				draft: {
					id: 100,
					docId: 42,
					title: "Article",
					content: "content",
					contentType: "text/markdown",
					createdBy: 1,
					createdAt: "2025-10-01T00:00:00Z",
					updatedAt: "2025-10-01T00:00:00Z",
					isShared: false,
					createdByAgent: true,
				},
				pendingChangesCount: 3,
				lastChangeUpdatedAt: "2025-10-01T00:00:00Z",
			},
		];

		(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(url => {
			if (String(url).includes("/api/docs/")) {
				return Promise.resolve({
					ok: true,
					json: async () => mockDoc,
				});
			}
			if (String(url).includes("/api/doc-drafts/with-pending-changes")) {
				return Promise.resolve({
					ok: true,
					json: async () => mockDraftsWithPendingChanges,
				});
			}
			return Promise.resolve({ ok: true, json: async () => ({}) });
		});

		render(
			<ClientProvider>
				<Preview jrn="doc:article-prev" />
			</ClientProvider>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("toggle-suggestions-button")).toBeDefined();
		});

		fireEvent.click(screen.getByTestId("toggle-suggestions-button"));

		await waitFor(() => {
			expect(screen.getByText("1/3")).toBeDefined();
		});

		fireEvent.click(screen.getByTestId("next-suggestion-button"));

		await waitFor(() => {
			expect(screen.getByText("2/3")).toBeDefined();
		});

		fireEvent.click(screen.getByTestId("previous-suggestion-button"));

		await waitFor(() => {
			expect(screen.getByText("1/3")).toBeDefined();
		});
	});

	it("should disable previous button when at first suggestion", async () => {
		const mockDoc = {
			id: 42,
			jrn: "doc:article-first",
			createdAt: "2025-10-01T00:00:00Z",
			updatedAt: "2025-10-01T00:00:00Z",
			updatedBy: "system",
			content: "# Article\n\nContent.",
			contentType: "text/markdown",
			version: 1,
			contentMetadata: {
				title: "Article",
			},
		};

		const mockDraftsWithPendingChanges = [
			{
				draft: {
					id: 100,
					docId: 42,
					title: "Article",
					content: "content",
					contentType: "text/markdown",
					createdBy: 1,
					createdAt: "2025-10-01T00:00:00Z",
					updatedAt: "2025-10-01T00:00:00Z",
					isShared: false,
					createdByAgent: true,
				},
				pendingChangesCount: 3,
				lastChangeUpdatedAt: "2025-10-01T00:00:00Z",
			},
		];

		(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(url => {
			if (String(url).includes("/api/docs/")) {
				return Promise.resolve({
					ok: true,
					json: async () => mockDoc,
				});
			}
			if (String(url).includes("/api/doc-drafts/with-pending-changes")) {
				return Promise.resolve({
					ok: true,
					json: async () => mockDraftsWithPendingChanges,
				});
			}
			return Promise.resolve({ ok: true, json: async () => ({}) });
		});

		render(
			<ClientProvider>
				<Preview jrn="doc:article-first" />
			</ClientProvider>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("toggle-suggestions-button")).toBeDefined();
		});

		fireEvent.click(screen.getByTestId("toggle-suggestions-button"));

		await waitFor(() => {
			expect(screen.getByTestId("previous-suggestion-button")).toBeDefined();
		});

		const prevButton = screen.getByTestId("previous-suggestion-button") as HTMLButtonElement;
		expect(prevButton.disabled).toBe(true);
	});

	it("should disable next button when at last suggestion", async () => {
		const mockDoc = {
			id: 42,
			jrn: "doc:article-last",
			createdAt: "2025-10-01T00:00:00Z",
			updatedAt: "2025-10-01T00:00:00Z",
			updatedBy: "system",
			content: "# Article\n\nContent.",
			contentType: "text/markdown",
			version: 1,
			contentMetadata: {
				title: "Article",
			},
		};

		const mockDraftsWithPendingChanges = [
			{
				draft: {
					id: 100,
					docId: 42,
					title: "Article",
					content: "content",
					contentType: "text/markdown",
					createdBy: 1,
					createdAt: "2025-10-01T00:00:00Z",
					updatedAt: "2025-10-01T00:00:00Z",
					isShared: false,
					createdByAgent: true,
				},
				pendingChangesCount: 2,
				lastChangeUpdatedAt: "2025-10-01T00:00:00Z",
			},
		];

		(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(url => {
			if (String(url).includes("/api/docs/")) {
				return Promise.resolve({
					ok: true,
					json: async () => mockDoc,
				});
			}
			if (String(url).includes("/api/doc-drafts/with-pending-changes")) {
				return Promise.resolve({
					ok: true,
					json: async () => mockDraftsWithPendingChanges,
				});
			}
			return Promise.resolve({ ok: true, json: async () => ({}) });
		});

		render(
			<ClientProvider>
				<Preview jrn="doc:article-last" />
			</ClientProvider>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("toggle-suggestions-button")).toBeDefined();
		});

		fireEvent.click(screen.getByTestId("toggle-suggestions-button"));

		await waitFor(() => {
			expect(screen.getByText("1/2")).toBeDefined();
		});

		fireEvent.click(screen.getByTestId("next-suggestion-button"));

		await waitFor(() => {
			expect(screen.getByText("2/2")).toBeDefined();
		});

		const nextButton = screen.getByTestId("next-suggestion-button") as HTMLButtonElement;
		expect(nextButton.disabled).toBe(true);
	});

	it("should not change index when clicking disabled previous button at first suggestion", async () => {
		const mockDoc = {
			id: 42,
			jrn: "doc:article-boundary-prev",
			createdAt: "2025-10-01T00:00:00Z",
			updatedAt: "2025-10-01T00:00:00Z",
			updatedBy: "system",
			content: "# Article\n\nContent.",
			contentType: "text/markdown",
			version: 1,
			contentMetadata: {
				title: "Article",
			},
		};

		const mockDraftsWithPendingChanges = [
			{
				draft: {
					id: 100,
					docId: 42,
					title: "Article",
					content: "content",
					contentType: "text/markdown",
					createdBy: 1,
					createdAt: "2025-10-01T00:00:00Z",
					updatedAt: "2025-10-01T00:00:00Z",
					isShared: false,
					createdByAgent: true,
				},
				pendingChangesCount: 3,
				lastChangeUpdatedAt: "2025-10-01T00:00:00Z",
			},
		];

		(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(url => {
			if (String(url).includes("/api/docs/")) {
				return Promise.resolve({
					ok: true,
					json: async () => mockDoc,
				});
			}
			if (String(url).includes("/api/doc-drafts/with-pending-changes")) {
				return Promise.resolve({
					ok: true,
					json: async () => mockDraftsWithPendingChanges,
				});
			}
			return Promise.resolve({ ok: true, json: async () => ({}) });
		});

		render(
			<ClientProvider>
				<Preview jrn="doc:article-boundary-prev" />
			</ClientProvider>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("toggle-suggestions-button")).toBeDefined();
		});

		fireEvent.click(screen.getByTestId("toggle-suggestions-button"));

		await waitFor(() => {
			expect(screen.getByText("1/3")).toBeDefined();
		});

		fireEvent.click(screen.getByTestId("previous-suggestion-button"));

		expect(screen.getByText("1/3")).toBeDefined();
	});

	it("should not change index when clicking disabled next button at last suggestion", async () => {
		const mockDoc = {
			id: 42,
			jrn: "doc:article-boundary-next",
			createdAt: "2025-10-01T00:00:00Z",
			updatedAt: "2025-10-01T00:00:00Z",
			updatedBy: "system",
			content: "# Article\n\nContent.",
			contentType: "text/markdown",
			version: 1,
			contentMetadata: {
				title: "Article",
			},
		};

		const mockDraftsWithPendingChanges = [
			{
				draft: {
					id: 100,
					docId: 42,
					title: "Article",
					content: "content",
					contentType: "text/markdown",
					createdBy: 1,
					createdAt: "2025-10-01T00:00:00Z",
					updatedAt: "2025-10-01T00:00:00Z",
					isShared: false,
					createdByAgent: true,
				},
				pendingChangesCount: 2,
				lastChangeUpdatedAt: "2025-10-01T00:00:00Z",
			},
		];

		(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(url => {
			if (String(url).includes("/api/docs/")) {
				return Promise.resolve({
					ok: true,
					json: async () => mockDoc,
				});
			}
			if (String(url).includes("/api/doc-drafts/with-pending-changes")) {
				return Promise.resolve({
					ok: true,
					json: async () => mockDraftsWithPendingChanges,
				});
			}
			return Promise.resolve({ ok: true, json: async () => ({}) });
		});

		render(
			<ClientProvider>
				<Preview jrn="doc:article-boundary-next" />
			</ClientProvider>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("toggle-suggestions-button")).toBeDefined();
		});

		fireEvent.click(screen.getByTestId("toggle-suggestions-button"));

		await waitFor(() => {
			expect(screen.getByText("1/2")).toBeDefined();
		});

		fireEvent.click(screen.getByTestId("next-suggestion-button"));

		await waitFor(() => {
			expect(screen.getByText("2/2")).toBeDefined();
		});

		fireEvent.click(screen.getByTestId("next-suggestion-button"));

		expect(screen.getByText("2/2")).toBeDefined();
	});

	it("should handle error when creating draft from article", async () => {
		const mockDoc = {
			id: 42,
			jrn: "doc:article-error",
			createdAt: "2025-10-01T00:00:00Z",
			updatedAt: "2025-10-01T00:00:00Z",
			updatedBy: "system",
			content: "# Article\n\nContent.",
			contentType: "text/markdown",
			version: 1,
			contentMetadata: {
				title: "Article",
			},
		};

		(global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url, options) => {
			const method = options?.method || "GET";
			if (String(url).includes("/api/docs/") && !String(url).includes("create-draft")) {
				return Promise.resolve({
					ok: true,
					json: async () => mockDoc,
				});
			}
			if (String(url).includes("/api/doc-drafts/with-pending-changes")) {
				return Promise.resolve({
					ok: true,
					json: async () => [],
				});
			}
			if (String(url).includes("create-draft") && method === "POST") {
				return Promise.resolve({
					ok: false,
					status: 500,
					statusText: "Internal Server Error",
				});
			}
			return Promise.resolve({ ok: true, json: async () => ({}) });
		});

		render(
			<ClientProvider>
				<Preview jrn="doc:article-error" />
			</ClientProvider>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("edit-article-button")).toBeDefined();
		});

		const editButton = screen.getByTestId("edit-article-button") as HTMLButtonElement;
		fireEvent.click(editButton);

		await waitFor(() => {
			expect(editButton.disabled).toBe(false);
		});

		expect(mockNavigate).not.toHaveBeenCalled();
	});
});
