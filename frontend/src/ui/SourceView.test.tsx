import { ClientProvider } from "../contexts/ClientContext";
import { SourceView } from "./SourceView";
import { render, screen, waitFor } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("SourceView", () => {
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
				<SourceView jrn="doc:test" />
			</ClientProvider>,
		);

		expect(screen.getByText(/Loading original source for/)).toBeDefined();
	});

	it("should show not found message when article doesn't exist", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: false,
			status: 404,
		});

		render(
			<ClientProvider>
				<SourceView jrn="doc:nonexistent" />
			</ClientProvider>,
		);

		await waitFor(() => {
			expect(screen.getByText("Original Source Not Available")).toBeDefined();
		});
	});

	it("should show not available message when article has no source", async () => {
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

		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			json: async () => mockDoc,
		});

		render(
			<ClientProvider>
				<SourceView jrn="doc:test-article" />
			</ClientProvider>,
		);

		await waitFor(() => {
			expect(screen.getByText("Original Source Not Available")).toBeDefined();
		});

		expect(screen.getByText("This article does not have original source content available.")).toBeDefined();
	});

	it("should display source content and metadata", async () => {
		const mockDoc = {
			id: 1,
			jrn: "doc:test-article",
			createdAt: "2025-10-01T00:00:00Z",
			updatedAt: "2025-10-02T00:00:00Z",
			updatedBy: "system",
			content: "# Test Article\n\nThis is processed content.",
			contentType: "text/markdown",
			source: "# Original Article\n\nThis is the original source content.",
			sourceMetadata: {
				author: "John Doe",
				sourceUrl: "https://example.com/doc",
				lastFetched: "2025-10-01T00:00:00Z",
			},
			version: 1,
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
				<SourceView jrn="doc:test-article" />
			</ClientProvider>,
		);

		await waitFor(() => {
			expect(screen.getByText("Original Source")).toBeDefined();
		});

		expect(screen.getByText("JRN: doc:test-article")).toBeDefined();
		expect(screen.getByText("Source Metadata")).toBeDefined();
		expect(screen.getByText(/"author"/)).toBeDefined();
		expect(screen.getByText(/"John Doe"/)).toBeDefined();
		expect(screen.getByText("Source Content")).toBeDefined();
		expect(screen.getByText(/# Original Article/)).toBeDefined();
		expect(screen.getByText(/This is the original source content/)).toBeDefined();
	});

	it("should display source content without metadata", async () => {
		const mockDoc = {
			id: 1,
			jrn: "doc:test",
			createdAt: "2025-10-01T00:00:00Z",
			updatedAt: "2025-10-01T00:00:00Z",
			updatedBy: "system",
			content: "Processed content",
			contentType: "text/markdown",
			source: "Original source content",
			version: 1,
		};

		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			json: async () => mockDoc,
		});

		render(
			<ClientProvider>
				<SourceView jrn="doc:test" />
			</ClientProvider>,
		);

		await waitFor(() => {
			expect(screen.getByText("Original Source")).toBeDefined();
		});

		expect(screen.getByText("Original source content")).toBeDefined();
		// Should not show metadata section
		expect(screen.queryByText("Source Metadata")).toBeNull();
	});

	it("should handle fetch errors gracefully", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Network error"));

		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {
			// Suppress error logging during test
		});

		render(
			<ClientProvider>
				<SourceView jrn="doc:test" />
			</ClientProvider>,
		);

		await waitFor(() => {
			expect(screen.getByText("Original Source Not Available")).toBeDefined();
		});

		consoleSpy.mockRestore();
	});

	it("should handle non-string source content", async () => {
		const mockDoc = {
			id: 1,
			jrn: "doc:test",
			createdAt: "2025-10-01T00:00:00Z",
			updatedAt: "2025-10-01T00:00:00Z",
			updatedBy: "system",
			content: "Processed content",
			contentType: "application/json",
			source: {
				data: "test data",
				items: ["item1", "item2"],
			},
			version: 1,
		};

		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			json: async () => mockDoc,
		});

		render(
			<ClientProvider>
				<SourceView jrn="doc:test" />
			</ClientProvider>,
		);

		await waitFor(() => {
			expect(screen.getByText("Original Source")).toBeDefined();
		});

		// Should display JSON-stringified content
		expect(screen.getByText(/"data"/)).toBeDefined();
		expect(screen.getByText(/"test data"/)).toBeDefined();
	});

	it("should display created and updated dates", async () => {
		const mockDoc = {
			id: 1,
			jrn: "doc:test",
			createdAt: "2025-10-01T00:00:00Z",
			updatedAt: "2025-10-05T00:00:00Z",
			updatedBy: "system",
			content: "Content",
			contentType: "text/markdown",
			source: "Source content",
			version: 1,
		};

		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			json: async () => mockDoc,
		});

		render(
			<ClientProvider>
				<SourceView jrn="doc:test" />
			</ClientProvider>,
		);

		await waitFor(() => {
			expect(screen.getByText(/Created:/)).toBeDefined();
			expect(screen.getByText(/Updated:/)).toBeDefined();
		});
	});
});
