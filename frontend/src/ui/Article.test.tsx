import { createMockDevToolsInfo, renderWithProviders } from "../test/TestUtils";
import { Article } from "./Article";
import { fireEvent, screen, waitFor } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the markdown-to-jsx library since it doesn't work well with Preact testing
vi.mock("markdown-to-jsx", () => ({
	default: ({ children }: { children: string }) => <div data-testid="markdown-mock">{children}</div>,
}));

// Helper to create a fetch mock that handles both devTools and test-specific endpoints
function createFetchMock(testMock?: (url: string | URL | Request) => Promise<Response>) {
	return vi.fn((url: string | URL | Request) => {
		const urlString = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

		// Always handle devTools endpoint first
		if (urlString.includes("/api/dev-tools/info")) {
			return Promise.resolve({
				ok: true,
				json: async () => createMockDevToolsInfo(),
			} as Response);
		}

		// Use test-specific mock if provided
		if (testMock) {
			return testMock(url);
		}

		// Default fallback
		return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
	});
}

describe("Article", () => {
	beforeEach(() => {
		// Mock window.open
		global.window.open = vi.fn();

		// Set up default fetch mock
		global.fetch = createFetchMock();
	});

	it("should show loading state initially", () => {
		global.fetch = createFetchMock(
			() =>
				new Promise(() => {
					// Never resolves - testing loading state
				}),
		);

		renderWithProviders(<Article jrn="doc:test" />, { initialPath: "/articles/doc:test" });

		expect(screen.getByText("Loading article...")).toBeDefined();
	});

	it("should show not found message when article doesn't exist", async () => {
		global.fetch = createFetchMock(() =>
			Promise.resolve({
				ok: false,
				status: 404,
			} as Response),
		);

		renderWithProviders(<Article jrn="doc:nonexistent" />, { initialPath: "/articles/doc:nonexistent" });

		await waitFor(() => {
			expect(screen.getByText("Article not found")).toBeDefined();
		});
	});

	it("should display article content when loaded", async () => {
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
				status: "upToDate",
				qualityScore: 87,
				lastUpdated: "2025-10-01T00:00:00Z",
			},
		};

		global.fetch = createFetchMock(() =>
			Promise.resolve({
				ok: true,
				json: async () => mockDoc,
			} as Response),
		);

		renderWithProviders(<Article jrn="doc:test-article" />, { initialPath: "/articles/doc:test-article" });

		await waitFor(() => {
			const titleElements = screen.queryAllByText("Test Article");
			expect(titleElements.length).toBeGreaterThan(0);
		});

		expect(screen.getAllByText("GitHub Docs").length).toBeGreaterThan(0);
		expect(screen.getAllByText("87%").length).toBeGreaterThan(0);
		// Verify JRN is displayed (appears twice - in header and sidebar)
		expect(screen.getAllByText("doc:test-article").length).toBe(2);
	});

	it("should open article preview in new window", async () => {
		const mockDoc = {
			id: 1,
			jrn: "doc:test",
			createdAt: "2025-10-01T00:00:00Z",
			updatedAt: "2025-10-01T00:00:00Z",
			updatedBy: "system",
			content: "Test",
			contentType: "text/markdown",
			version: 1,
			contentMetadata: {
				title: "Test Article",
			},
		};

		global.fetch = createFetchMock(() =>
			Promise.resolve({
				ok: true,
				json: async () => mockDoc,
			} as Response),
		);

		renderWithProviders(<Article jrn="doc:test" />, { initialPath: "/articles/doc:test" });

		await waitFor(() => {
			expect(screen.getByText("Test Article")).toBeDefined();
		});

		const viewButton = screen.getByText("View Article");
		fireEvent.click(viewButton);

		expect(global.window.open).toHaveBeenCalledWith("/articles/doc%3Atest/preview", "_blank");
	});

	it("should open original source view when View Original is clicked", async () => {
		const mockDoc = {
			id: 1,
			jrn: "doc:test",
			createdAt: "2025-10-01T00:00:00Z",
			updatedAt: "2025-10-01T00:00:00Z",
			updatedBy: "system",
			content: "Test content",
			contentType: "text/markdown",
			version: 1,
			contentMetadata: {
				title: "Test Article",
			},
		};

		global.fetch = createFetchMock(() =>
			Promise.resolve({
				ok: true,
				json: async () => mockDoc,
			} as Response),
		);

		global.window.open = vi.fn();

		renderWithProviders(<Article jrn="doc:test" />, { initialPath: "/articles/doc:test" });

		await waitFor(() => {
			expect(screen.getByText("Test Article")).toBeDefined();
		});

		const viewOriginalButton = screen.getByText("View Original");
		fireEvent.click(viewOriginalButton);

		expect(global.window.open).toHaveBeenCalledWith("/articles/doc%3Atest/source", "_blank");
	});

	it("should display status badge and info", async () => {
		const mockDoc = {
			id: 1,
			jrn: "doc:test",
			createdAt: "2025-10-01T00:00:00Z",
			updatedAt: "2025-10-01T00:00:00Z",
			updatedBy: "system",
			content: "Test",
			contentType: "text/markdown",
			version: 1,
			contentMetadata: {
				title: "Test Article",
				status: "upToDate",
			},
		};

		global.fetch = createFetchMock(() =>
			Promise.resolve({
				ok: true,
				json: async () => mockDoc,
			} as Response),
		);

		renderWithProviders(<Article jrn="doc:test" />, { initialPath: "/articles/doc:test" });

		await waitFor(() => {
			expect(screen.getByText("Article is Up to Date")).toBeDefined();
			expect(screen.getByText("Up to Date")).toBeDefined();
		});
	});

	it("should display quality assessment for up-to-date articles", async () => {
		const mockDoc = {
			id: 1,
			jrn: "doc:test",
			createdAt: "2025-10-01T00:00:00Z",
			updatedAt: "2025-10-01T00:00:00Z",
			updatedBy: "system",
			content: "Test",
			contentType: "text/markdown",
			version: 1,
			contentMetadata: {
				title: "Test Article",
				status: "upToDate",
			},
		};

		global.fetch = createFetchMock(() =>
			Promise.resolve({
				ok: true,
				json: async () => mockDoc,
			} as Response),
		);

		renderWithProviders(<Article jrn="doc:test" />, { initialPath: "/articles/doc:test" });

		await waitFor(() => {
			expect(screen.getByText("Quality Assessment")).toBeDefined();
			expect(screen.getByText("Content is accurate and up-to-date")).toBeDefined();
		});
	});

	it("should handle fetch errors gracefully", async () => {
		global.fetch = createFetchMock(() => Promise.reject(new Error("Network error")));

		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {
			// Suppress error logging during test
		});

		renderWithProviders(<Article jrn="doc:test" />, { initialPath: "/articles/doc:test" });

		await waitFor(() => {
			expect(screen.getByText("Article not found")).toBeDefined();
		});

		consoleSpy.mockRestore();
	});

	it("should display needsUpdate status", async () => {
		const mockDoc = {
			id: 1,
			jrn: "doc:test",
			createdAt: "2025-10-01T00:00:00Z",
			updatedAt: "2025-10-01T00:00:00Z",
			updatedBy: "system",
			content: "Test",
			contentType: "text/markdown",
			version: 1,
			contentMetadata: {
				title: "Test Article",
				status: "needsUpdate",
			},
		};

		global.fetch = createFetchMock(() =>
			Promise.resolve({
				ok: true,
				json: async () => mockDoc,
			} as Response),
		);

		renderWithProviders(<Article jrn="doc:test" />, { initialPath: "/articles/doc:test" });

		await waitFor(() => {
			expect(screen.getByText("Article Needs Update")).toBeDefined();
			expect(screen.getByText("Needs Update")).toBeDefined();
		});
	});

	it("should display underReview status", async () => {
		const mockDoc = {
			id: 1,
			jrn: "doc:test",
			createdAt: "2025-10-01T00:00:00Z",
			updatedAt: "2025-10-01T00:00:00Z",
			updatedBy: "system",
			content: "Test",
			contentType: "text/markdown",
			version: 1,
			contentMetadata: {
				title: "Test Article",
				status: "underReview",
			},
		};

		global.fetch = createFetchMock(() =>
			Promise.resolve({
				ok: true,
				json: async () => mockDoc,
			} as Response),
		);

		renderWithProviders(<Article jrn="doc:test" />, { initialPath: "/articles/doc:test" });

		await waitFor(() => {
			expect(screen.getByText("Article Under Review")).toBeDefined();
			expect(screen.getByText("Under Review")).toBeDefined();
		});
	});

	it("should display article without status", async () => {
		const mockDoc = {
			id: 1,
			jrn: "doc:test",
			createdAt: "2025-10-01T00:00:00Z",
			updatedAt: "2025-10-01T00:00:00Z",
			updatedBy: "system",
			content: "Test content here",
			contentType: "text/markdown",
			version: 1,
			contentMetadata: {
				title: "Test Article",
			},
		};

		global.fetch = createFetchMock(() =>
			Promise.resolve({
				ok: true,
				json: async () => mockDoc,
			} as Response),
		);

		renderWithProviders(<Article jrn="doc:test" />, { initialPath: "/articles/doc:test" });

		await waitFor(() => {
			expect(screen.getByText("Test content here")).toBeDefined();
		});
	});

	it("should display yellow quality score for medium scores (40-69)", async () => {
		const mockDoc = {
			id: 1,
			jrn: "doc:test",
			createdAt: "2025-10-01T00:00:00Z",
			updatedAt: "2025-10-01T00:00:00Z",
			updatedBy: "system",
			content: "Test content",
			contentType: "text/markdown",
			version: 1,
			contentMetadata: {
				title: "Test Article",
				qualityScore: 55,
			},
		};

		global.fetch = createFetchMock(() =>
			Promise.resolve({
				ok: true,
				json: async () => mockDoc,
			} as Response),
		);

		renderWithProviders(<Article jrn="doc:test" />, { initialPath: "/articles/doc:test" });

		await waitFor(() => {
			expect(screen.getAllByText("55%").length).toBeGreaterThan(0);
		});
	});

	it("should display red quality score for low scores (< 40)", async () => {
		const mockDoc = {
			id: 1,
			jrn: "doc:test",
			createdAt: "2025-10-01T00:00:00Z",
			updatedAt: "2025-10-01T00:00:00Z",
			updatedBy: "system",
			content: "Test content",
			contentType: "text/markdown",
			version: 1,
			contentMetadata: {
				title: "Test Article",
				qualityScore: 25,
			},
		};

		global.fetch = createFetchMock(() =>
			Promise.resolve({
				ok: true,
				json: async () => mockDoc,
			} as Response),
		);

		renderWithProviders(<Article jrn="doc:test" />, { initialPath: "/articles/doc:test" });

		await waitFor(() => {
			expect(screen.getAllByText("25%").length).toBeGreaterThan(0);
		});
	});

	it("should handle doc with undefined contentMetadata", async () => {
		const mockDoc = {
			id: 1,
			jrn: "doc:no-metadata",
			createdAt: "2025-10-01T00:00:00Z",
			updatedAt: "2025-10-01T00:00:00Z",
			updatedBy: "system",
			content: "Test content",
			contentType: "text/markdown",
			version: 1,
			contentMetadata: undefined,
		};

		global.fetch = createFetchMock(() =>
			Promise.resolve({
				ok: true,
				json: async () => mockDoc,
			} as Response),
		);

		renderWithProviders(<Article jrn="doc:no-metadata" />, { initialPath: "/articles/doc:no-metadata" });

		await waitFor(() => {
			expect(screen.getAllByText("Untitled").length).toBeGreaterThan(0);
		});
	});

	it("should handle doc with undefined title in metadata", async () => {
		const mockDoc = {
			id: 1,
			jrn: "doc:no-title",
			createdAt: "2025-10-01T00:00:00Z",
			updatedAt: "2025-10-01T00:00:00Z",
			updatedBy: "system",
			content: "Test content",
			contentType: "text/markdown",
			version: 1,
			contentMetadata: {
				sourceName: "Test Source",
			},
		};

		global.fetch = createFetchMock(() =>
			Promise.resolve({
				ok: true,
				json: async () => mockDoc,
			} as Response),
		);

		renderWithProviders(<Article jrn="doc:no-title" />, { initialPath: "/articles/doc:no-title" });

		await waitFor(() => {
			expect(screen.getAllByText("Untitled").length).toBeGreaterThan(0);
		});
	});

	it("should display JRN in header and sidebar", async () => {
		const mockDoc = {
			id: 1,
			jrn: "/docsite/123/getting-started",
			createdAt: "2025-10-01T00:00:00Z",
			updatedAt: "2025-10-01T00:00:00Z",
			updatedBy: "system",
			content: "Test content",
			contentType: "text/markdown",
			version: 1,
			contentMetadata: {
				title: "Getting Started Guide",
				sourceName: "Documentation",
			},
		};

		global.fetch = createFetchMock(() =>
			Promise.resolve({
				ok: true,
				json: async () => mockDoc,
			} as Response),
		);

		const { container } = renderWithProviders(<Article jrn="/docsite/123/getting-started" />, {
			initialPath: "/articles//docsite/123/getting-started",
		});

		await waitFor(() => {
			expect(screen.getByText("Getting Started Guide")).toBeDefined();
		});

		// Check that JRN appears in both locations
		const arnElements = screen.getAllByText("/docsite/123/getting-started");
		expect(arnElements.length).toBe(2);

		// Verify one is in the header (with specific styling)
		const headerJrn = container.querySelector(".text-sm.text-muted-foreground\\/70.font-mono");
		expect(headerJrn).toBeDefined();
		expect(headerJrn?.textContent).toBe("/docsite/123/getting-started");

		// Verify one is in the sidebar Article Info section
		const sidebarJrn = container.querySelector(".font-mono.text-xs.break-all");
		expect(sidebarJrn).toBeDefined();
		expect(sidebarJrn?.textContent).toBe("/docsite/123/getting-started");
	});

	it("should toggle between rendered and raw view modes", async () => {
		const mockDoc = {
			id: 1,
			jrn: "doc:test",
			createdAt: "2025-10-01T00:00:00Z",
			updatedAt: "2025-10-01T00:00:00Z",
			updatedBy: "system",
			content: "# Test Heading\n\nTest content",
			contentType: "text/markdown",
			version: 1,
			contentMetadata: {
				title: "Test Article",
			},
		};

		global.fetch = createFetchMock(() =>
			Promise.resolve({
				ok: true,
				json: async () => mockDoc,
			} as Response),
		);

		const { container } = renderWithProviders(<Article jrn="doc:test" />, { initialPath: "/articles/doc:test" });

		await waitFor(() => {
			expect(screen.getByText("Test Article")).toBeDefined();
		});

		// Initially should be in rendered mode
		expect(container.querySelector('[data-testid="markdown-mock"]')).toBeDefined();

		// Find the toggle pill container and click Source button
		const toggleButtons = container.querySelectorAll("button");
		let sourceButton: Element | null = null;
		for (const button of Array.from(toggleButtons)) {
			// Look for button that contains "Source" and has a parent with role group
			if (button.textContent === "Source" && button.parentElement?.getAttribute("role") === "group") {
				sourceButton = button;
				break;
			}
		}

		expect(sourceButton).toBeDefined();
		if (sourceButton) {
			fireEvent.click(sourceButton);
		}

		// Should now show raw content in a <pre><code> block
		await waitFor(() => {
			const preElement = container.querySelector("pre");
			expect(preElement).toBeDefined();
			expect(preElement?.textContent).toContain("# Test Heading");
		});

		// Find Rendered button and click it
		let renderedButton: Element | null = null;
		for (const button of Array.from(toggleButtons)) {
			if (button.textContent === "Rendered" && button.parentElement?.getAttribute("role") === "group") {
				renderedButton = button;
				break;
			}
		}

		expect(renderedButton).toBeDefined();
		if (renderedButton) {
			fireEvent.click(renderedButton);
		}

		// Should show markdown mock again
		await waitFor(() => {
			expect(container.querySelector('[data-testid="markdown-mock"]')).toBeDefined();
		});
	});

	it("should display Update Doc button", async () => {
		const mockDoc = {
			id: 1,
			jrn: "doc:test",
			createdAt: "2025-10-01T00:00:00Z",
			updatedAt: "2025-10-01T00:00:00Z",
			updatedBy: "system",
			content: "Test content",
			contentType: "text/markdown",
			version: 1,
			contentMetadata: {
				title: "Test Article",
			},
		};

		global.fetch = createFetchMock(() =>
			Promise.resolve({
				ok: true,
				json: async () => mockDoc,
			} as Response),
		);

		renderWithProviders(<Article jrn="doc:test" />, { initialPath: "/articles/doc:test" });

		await waitFor(() => {
			expect(screen.getByText("Test Article")).toBeDefined();
		});

		expect(screen.getByRole("button", { name: /Update Doc/ })).toBeDefined();
	});

	it("should call triggerDemoJob when Update Doc is clicked", async () => {
		const mockDoc = {
			id: 1,
			jrn: "doc:test",
			createdAt: "2025-10-01T00:00:00Z",
			updatedAt: "2025-10-01T00:00:00Z",
			updatedBy: "system",
			content: "Test content",
			contentType: "text/markdown",
			version: 1,
			contentMetadata: {
				title: "Test Article",
			},
		};

		let callCount = 0;
		global.fetch = createFetchMock(url => {
			const _urlString = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

			// First call: fetch document
			if (callCount === 0) {
				callCount++;
				return Promise.resolve({
					ok: true,
					json: async () => mockDoc,
				} as Response);
			}

			// Second call: trigger demo job
			return Promise.resolve({
				ok: true,
				json: async () => ({}),
			} as Response);
		});

		renderWithProviders(<Article jrn="doc:test" />, { initialPath: "/articles/doc:test" });

		await waitFor(() => {
			expect(screen.getByText("Test Article")).toBeDefined();
		});

		const runButton = screen.getByRole("button", { name: /Update Doc/ });
		fireEvent.click(runButton);

		await waitFor(() => {
			expect(global.fetch).toHaveBeenCalledWith(
				"/api/dev-tools/trigger-demo-job",
				expect.objectContaining({
					method: "POST",
					body: JSON.stringify({
						jobName: "demo:run-jolliscript",
						params: {
							docJrn: "doc:test",
							syncUp: false,
							syncDown: false,
							useUpdatePrompt: true,
						},
					}),
				}),
			);
		});
	});

	it("should show Updating... when Update Doc is running", async () => {
		const mockDoc = {
			id: 1,
			jrn: "doc:test",
			createdAt: "2025-10-01T00:00:00Z",
			updatedAt: "2025-10-01T00:00:00Z",
			updatedBy: "system",
			content: "Test content",
			contentType: "text/markdown",
			version: 1,
			contentMetadata: {
				title: "Test Article",
			},
		};

		let callCount = 0;
		global.fetch = createFetchMock(_url => {
			// First call: fetch document
			if (callCount === 0) {
				callCount++;
				return Promise.resolve({
					ok: true,
					json: async () => mockDoc,
				} as Response);
			}

			// Second call: trigger demo job (delayed)
			return new Promise(resolve =>
				setTimeout(
					() =>
						resolve({
							ok: true,
							json: async () => ({}),
						} as Response),
					100,
				),
			);
		});

		renderWithProviders(<Article jrn="doc:test" />, { initialPath: "/articles/doc:test" });

		await waitFor(() => {
			expect(screen.getByText("Test Article")).toBeDefined();
		});

		const runButton = screen.getByRole("button", { name: /Update Doc/ });
		fireEvent.click(runButton);

		await waitFor(() => {
			expect(screen.getByRole("button", { name: /Updating.../ })).toBeDefined();
		});
	});

	it("should disable button while Update Doc is running", async () => {
		const mockDoc = {
			id: 1,
			jrn: "doc:test",
			createdAt: "2025-10-01T00:00:00Z",
			updatedAt: "2025-10-01T00:00:00Z",
			updatedBy: "system",
			content: "Test content",
			contentType: "text/markdown",
			version: 1,
			contentMetadata: {
				title: "Test Article",
			},
		};

		let callCount = 0;
		global.fetch = createFetchMock(_url => {
			// First call: fetch document
			if (callCount === 0) {
				callCount++;
				return Promise.resolve({
					ok: true,
					json: async () => mockDoc,
				} as Response);
			}

			// Second call: trigger demo job (delayed)
			return new Promise(resolve =>
				setTimeout(
					() =>
						resolve({
							ok: true,
							json: async () => ({}),
						} as Response),
					100,
				),
			);
		});

		renderWithProviders(<Article jrn="doc:test" />, { initialPath: "/articles/doc:test" });

		await waitFor(() => {
			expect(screen.getByText("Test Article")).toBeDefined();
		});

		const runButton = screen.getByRole("button", { name: /Update Doc/ });
		fireEvent.click(runButton);

		await waitFor(() => {
			const button = screen.getByRole("button", { name: /Updating.../ });
			expect(button.hasAttribute("disabled")).toBe(true);
		});

		// Wait for button to return to normal state after setTimeout
		await waitFor(
			() => {
				const button = screen.getByRole("button", { name: /Update Doc/ });
				expect(button.hasAttribute("disabled")).toBe(false);
			},
			{ timeout: 3000 },
		);
	});

	it("should display Markdown content type in Article Info", async () => {
		const mockDoc = {
			id: 1,
			jrn: "doc:test",
			createdAt: "2025-10-01T00:00:00Z",
			updatedAt: "2025-10-01T00:00:00Z",
			updatedBy: "system",
			content: "# Test",
			contentType: "text/markdown",
			version: 1,
			contentMetadata: {
				title: "Test Article",
			},
		};

		global.fetch = createFetchMock(() =>
			Promise.resolve({
				ok: true,
				json: async () => mockDoc,
			} as Response),
		);

		renderWithProviders(<Article jrn="doc:test" />, { initialPath: "/articles/doc:test" });

		await waitFor(() => {
			expect(screen.getByText("Content Type")).toBeDefined();
			expect(screen.getByText("Markdown")).toBeDefined();
		});
	});

	it("should display JSON content type with OpenAPI badge", async () => {
		const mockDoc = {
			id: 1,
			jrn: "doc:test-api",
			createdAt: "2025-10-01T00:00:00Z",
			updatedAt: "2025-10-01T00:00:00Z",
			updatedBy: "system",
			content: '{"openapi": "3.0.0"}',
			contentType: "application/json",
			version: 1,
			contentMetadata: {
				title: "API Spec",
			},
		};

		global.fetch = createFetchMock(() =>
			Promise.resolve({
				ok: true,
				json: async () => mockDoc,
			} as Response),
		);

		renderWithProviders(<Article jrn="doc:test-api" />, { initialPath: "/articles/doc:test-api" });

		await waitFor(() => {
			expect(screen.getByText("Content Type")).toBeDefined();
			expect(screen.getByText("JSON")).toBeDefined();
			expect(screen.getByText("OpenAPI")).toBeDefined();
		});
	});

	it("should display YAML content type with OpenAPI badge", async () => {
		const mockDoc = {
			id: 1,
			jrn: "doc:test-yaml",
			createdAt: "2025-10-01T00:00:00Z",
			updatedAt: "2025-10-01T00:00:00Z",
			updatedBy: "system",
			content: "openapi: 3.0.0",
			contentType: "application/yaml",
			version: 1,
			contentMetadata: {
				title: "YAML API Spec",
			},
		};

		global.fetch = createFetchMock(() =>
			Promise.resolve({
				ok: true,
				json: async () => mockDoc,
			} as Response),
		);

		renderWithProviders(<Article jrn="doc:test-yaml" />, { initialPath: "/articles/doc:test-yaml" });

		await waitFor(() => {
			expect(screen.getByText("Content Type")).toBeDefined();
			expect(screen.getByText("YAML")).toBeDefined();
			expect(screen.getByText("OpenAPI")).toBeDefined();
		});
	});

	it("should display source doc badge for source documents", async () => {
		const mockDoc = {
			id: 1,
			jrn: "doc:source-doc",
			createdAt: "2025-10-01T00:00:00Z",
			updatedAt: "2025-10-01T00:00:00Z",
			updatedBy: "system",
			content: "Test content",
			contentType: "text/markdown",
			version: 1,
			contentMetadata: {
				title: "Source Document",
				sourceName: "My Uploads",
				isSourceDoc: true,
				permissions: {
					read: true,
					write: false,
					execute: false,
				},
			},
		};

		global.fetch = createFetchMock(() =>
			Promise.resolve({
				ok: true,
				json: async () => mockDoc,
			} as Response),
		);

		renderWithProviders(<Article jrn="doc:source-doc" />, { initialPath: "/articles/doc:source-doc" });

		await waitFor(() => {
			expect(screen.getByText("Source Document")).toBeDefined();
			expect(screen.getByTestId("source-doc-badge")).toBeDefined();
		});
	});

	it("should hide Edit button for source documents", async () => {
		const mockDoc = {
			id: 1,
			jrn: "doc:source-no-edit",
			createdAt: "2025-10-01T00:00:00Z",
			updatedAt: "2025-10-01T00:00:00Z",
			updatedBy: "system",
			content: "Test content",
			contentType: "text/markdown",
			version: 1,
			contentMetadata: {
				title: "Source No Edit",
				sourceName: "My Uploads",
				isSourceDoc: true,
				permissions: {
					read: true,
					write: false,
					execute: false,
				},
			},
		};

		global.fetch = createFetchMock(() =>
			Promise.resolve({
				ok: true,
				json: async () => mockDoc,
			} as Response),
		);

		renderWithProviders(<Article jrn="doc:source-no-edit" />, { initialPath: "/articles/doc:source-no-edit" });

		await waitFor(() => {
			expect(screen.getByText("Source No Edit")).toBeDefined();
		});

		// Edit button should not be present
		expect(screen.queryByTestId("edit-article-button")).toBeNull();
	});

	it("should show Edit button for non-source documents", async () => {
		const mockDoc = {
			id: 1,
			jrn: "doc:normal-edit",
			createdAt: "2025-10-01T00:00:00Z",
			updatedAt: "2025-10-01T00:00:00Z",
			updatedBy: "system",
			content: "Test content",
			contentType: "text/markdown",
			version: 1,
			contentMetadata: {
				title: "Normal Document",
				sourceName: "GitHub",
			},
		};

		global.fetch = createFetchMock(() =>
			Promise.resolve({
				ok: true,
				json: async () => mockDoc,
			} as Response),
		);

		renderWithProviders(<Article jrn="doc:normal-edit" />, { initialPath: "/articles/doc:normal-edit" });

		await waitFor(() => {
			expect(screen.getByText("Normal Document")).toBeDefined();
		});

		// Edit button should be present
		expect(screen.getByTestId("edit-article-button")).toBeDefined();
	});
});
