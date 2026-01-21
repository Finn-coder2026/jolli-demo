import { ClientProvider } from "../contexts/ClientContext";
import { Preview } from "./Preview";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			json: async () => mockDoc,
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

		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			json: async () => mockDoc,
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

		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			json: async () => mockDoc,
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
		// Test doc uses v1 (path-based) JRN format in frontmatter
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

		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			json: async () => mockDoc,
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

		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			json: async () => mockDoc,
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
});
