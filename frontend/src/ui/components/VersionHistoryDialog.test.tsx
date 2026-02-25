import { VersionHistoryProvider } from "../../contexts/VersionHistoryContext";
import type { CurrentDocInfo, DocHistoryDetailResponse, DocHistoryPaginatedResult } from "./VersionHistoryDialog";
import { VersionHistoryDialog } from "./VersionHistoryDialog";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock diff2html
vi.mock("diff2html", () => ({
	html: vi.fn((diff: string) => `<div class="mock-diff">${diff}</div>`),
}));

// Mock the CSS import
vi.mock("diff2html/bundles/css/diff2html.min.css", () => ({}));

describe("VersionHistoryDialog", () => {
	const mockDocId = 123;
	const mockOnSelectVersion = vi.fn();
	const mockOnConfirmRestore = vi.fn();

	const mockCurrentDoc: CurrentDocInfo = {
		title: "Current Document",
		content: "# Current Content\n\nThis is the current version.",
		version: 4,
	};

	const mockHistoryData: DocHistoryPaginatedResult = {
		items: [
			{ id: 1, docId: 123, userId: 1, version: 3, createdAt: "2024-01-03T10:00:00Z" },
			{ id: 2, docId: 123, userId: 2, version: 2, createdAt: "2024-01-02T10:00:00Z" },
			{ id: 3, docId: 123, userId: 1, version: 1, createdAt: "2024-01-01T10:00:00Z" },
		],
		total: 3,
		page: 1,
		pageSize: 20,
		totalPages: 1,
	};

	const mockHistoryDetail: DocHistoryDetailResponse = {
		id: 1,
		docId: 123,
		userId: 1,
		version: 3,
		createdAt: "2024-01-03T10:00:00Z",
		docSnapshot: {
			id: 123,
			jrn: "test-doc-jrn",
			content: "# Historical Content\n\nThis is the historical version.",
			contentType: "text/markdown",
			contentMetadata: { title: "Historical Document" },
			version: 3,
		},
	};

	/** Renders the component and opens the popover by clicking the trigger */
	function renderAndOpen(props: Partial<Parameters<typeof VersionHistoryDialog>[0]> = {}) {
		render(
			<VersionHistoryDialog
				docId={mockDocId}
				currentDoc={mockCurrentDoc}
				onSelectVersion={mockOnSelectVersion}
				{...props}
			>
				<button data-testid="history-trigger">History</button>
			</VersionHistoryDialog>,
		);

		// Open the popover
		fireEvent.click(screen.getByTestId("history-trigger"));
	}

	beforeEach(() => {
		vi.clearAllMocks();
		// Default mock: return list data for paginated endpoint
		mockFetch.mockImplementation((url: string) => {
			if (url.includes("/api/doc-histories?")) {
				return Promise.resolve({
					ok: true,
					json: () => Promise.resolve(mockHistoryData),
				});
			}
			if (url.includes("/api/doc-histories/")) {
				return Promise.resolve({
					ok: true,
					json: () => Promise.resolve(mockHistoryDetail),
				});
			}
			return Promise.resolve({ ok: false });
		});
	});

	it("should render trigger button", () => {
		render(
			<VersionHistoryDialog docId={mockDocId} currentDoc={mockCurrentDoc}>
				<button data-testid="history-trigger">History</button>
			</VersionHistoryDialog>,
		);

		expect(screen.getByTestId("history-trigger")).toBeDefined();
	});

	it("should show popover content when trigger is clicked", async () => {
		await renderAndOpen();

		expect(screen.getByTestId("version-history-dialog")).toBeDefined();
		expect(screen.getByTestId("version-history-title")).toBeDefined();
	});

	it("should display version history items after fetch", async () => {
		await renderAndOpen();

		await waitFor(() => {
			expect(screen.getByTestId("version-item-3")).toBeDefined();
			expect(screen.getByTestId("version-item-2")).toBeDefined();
			expect(screen.getByTestId("version-item-1")).toBeDefined();
		});
	});

	it("should call onSelectVersion when a version item is clicked", async () => {
		await renderAndOpen();

		await waitFor(() => {
			expect(screen.getByTestId("version-item-2")).toBeDefined();
		});

		fireEvent.click(screen.getByTestId("version-item-2"));

		await waitFor(() => {
			expect(mockOnSelectVersion).toHaveBeenCalledWith(mockHistoryData.items[1]);
		});
	});

	it("should fetch version history with correct parameters", async () => {
		await renderAndOpen();

		await waitFor(() => {
			expect(mockFetch).toHaveBeenCalled();
		});

		const fetchCall = mockFetch.mock.calls[0];
		expect(fetchCall[0]).toContain("/api/doc-histories");
		expect(fetchCall[0]).toContain(`docId=${mockDocId}`);
		expect(fetchCall[0]).toContain("page=1");
		expect(fetchCall[0]).toContain("pageSize=20");
	});

	it("should display empty state when no history items", async () => {
		mockFetch.mockImplementation((url: string) => {
			if (url.includes("/api/doc-histories?")) {
				return Promise.resolve({
					ok: true,
					json: () =>
						Promise.resolve({
							items: [],
							total: 0,
							page: 1,
							pageSize: 20,
							totalPages: 0,
						}),
				});
			}
			return Promise.resolve({ ok: false });
		});

		await renderAndOpen();

		await waitFor(() => {
			expect(screen.getByText("No data available")).toBeDefined();
		});
	});

	it("should handle fetch error gracefully", async () => {
		mockFetch.mockImplementation((url: string) => {
			if (url.includes("/api/doc-histories?")) {
				return Promise.resolve({
					ok: false,
					statusText: "Internal Server Error",
				});
			}
			return Promise.resolve({ ok: false });
		});

		await renderAndOpen();

		await waitFor(() => {
			expect(screen.getByText("Failed to load data")).toBeDefined();
		});
	});

	it("should display version numbers correctly", async () => {
		await renderAndOpen();

		await waitFor(() => {
			expect(screen.getByText("v3")).toBeDefined();
			expect(screen.getByText("v2")).toBeDefined();
			expect(screen.getByText("v1")).toBeDefined();
		});
	});

	it("should work without onSelectVersion callback", async () => {
		render(
			<VersionHistoryDialog docId={mockDocId} currentDoc={mockCurrentDoc}>
				<button data-testid="history-trigger">History</button>
			</VersionHistoryDialog>,
		);

		fireEvent.click(screen.getByTestId("history-trigger"));

		await waitFor(() => {
			expect(screen.getByTestId("version-item-2")).toBeDefined();
		});

		// Should not throw when clicking without onSelectVersion
		fireEvent.click(screen.getByTestId("version-item-2"));
	});

	describe("Current version badge", () => {
		it("should display current version badge when currentReferVersion matches a history item", async () => {
			await renderAndOpen({ currentReferVersion: 2 });

			await waitFor(() => {
				expect(screen.getByTestId("version-item-2")).toBeDefined();
			});

			// Badge should be shown for version 2
			expect(screen.getByTestId("current-version-badge-2")).toBeDefined();
			// Badge should not exist for other versions
			expect(screen.queryByTestId("current-version-badge-3")).toBe(null);
			expect(screen.queryByTestId("current-version-badge-1")).toBe(null);
		});

		it("should not display current version badge when currentReferVersion is undefined", async () => {
			await renderAndOpen({ currentReferVersion: undefined });

			await waitFor(() => {
				expect(screen.getByTestId("version-item-3")).toBeDefined();
			});

			// No badge should be shown
			expect(screen.queryByTestId("current-version-badge-3")).toBe(null);
			expect(screen.queryByTestId("current-version-badge-2")).toBe(null);
			expect(screen.queryByTestId("current-version-badge-1")).toBe(null);
		});

		it("should not display current version badge when currentReferVersion does not match any item", async () => {
			await renderAndOpen({ currentReferVersion: 99 });

			await waitFor(() => {
				expect(screen.getByTestId("version-item-3")).toBeDefined();
			});

			// No badge should be shown since version 99 doesn't exist
			expect(screen.queryByTestId("current-version-badge-3")).toBe(null);
			expect(screen.queryByTestId("current-version-badge-2")).toBe(null);
			expect(screen.queryByTestId("current-version-badge-1")).toBe(null);
		});

		it("should not allow clicking on current version item", async () => {
			await renderAndOpen({ currentReferVersion: 2 });

			await waitFor(() => {
				expect(screen.getByTestId("version-item-2")).toBeDefined();
			});

			// Click on the current version (version 2)
			fireEvent.click(screen.getByTestId("version-item-2"));

			// Should not trigger onSelectVersion
			expect(mockOnSelectVersion).not.toHaveBeenCalled();

			// Should not show DiffDialog
			expect(screen.queryByTestId("diff-dialog")).toBe(null);

			// But clicking on a different version should work
			fireEvent.click(screen.getByTestId("version-item-3"));

			await waitFor(() => {
				expect(mockOnSelectVersion).toHaveBeenCalledWith(mockHistoryData.items[0]);
			});
		});
	});

	describe("DiffDialog integration", () => {
		it("should fetch history detail when clicking a version item", async () => {
			await renderAndOpen();

			await waitFor(() => {
				expect(screen.getByTestId("version-item-3")).toBeDefined();
			});

			fireEvent.click(screen.getByTestId("version-item-3"));

			await waitFor(() => {
				// Should have called the detail API
				expect(mockFetch).toHaveBeenCalledWith("/api/doc-histories/1", expect.objectContaining({}));
			});
		});

		it("should show DiffDialog after fetching history detail", async () => {
			await renderAndOpen();

			await waitFor(() => {
				expect(screen.getByTestId("version-item-3")).toBeDefined();
			});

			fireEvent.click(screen.getByTestId("version-item-3"));

			await waitFor(() => {
				expect(screen.getByTestId("diff-dialog")).toBeDefined();
			});
		});

		it("should show correct title in DiffDialog", async () => {
			await renderAndOpen();

			await waitFor(() => {
				expect(screen.getByTestId("version-item-3")).toBeDefined();
			});

			fireEvent.click(screen.getByTestId("version-item-3"));

			await waitFor(() => {
				const title = screen.getByTestId("diff-dialog-title");
				expect(title.textContent).toContain("Current Document");
				expect(title.textContent).toContain("v4");
				expect(title.textContent).toContain("Historical Document");
				expect(title.textContent).toContain("v3");
			});
		});

		it("should close DiffDialog when cancel is clicked", async () => {
			await renderAndOpen();

			await waitFor(() => {
				expect(screen.getByTestId("version-item-3")).toBeDefined();
			});

			fireEvent.click(screen.getByTestId("version-item-3"));

			await waitFor(() => {
				expect(screen.getByTestId("diff-dialog")).toBeDefined();
			});

			fireEvent.click(screen.getByTestId("diff-dialog-cancel"));

			await waitFor(() => {
				expect(screen.queryByTestId("diff-dialog")).toBe(null);
			});
		});

		it("should show confirm button in DiffDialog", async () => {
			await renderAndOpen();

			await waitFor(() => {
				expect(screen.getByTestId("version-item-3")).toBeDefined();
			});

			fireEvent.click(screen.getByTestId("version-item-3"));

			await waitFor(() => {
				expect(screen.getByTestId("diff-dialog-confirm")).toBeDefined();
			});
		});

		it("should show secondary confirm dialog when clicking confirm in DiffDialog", async () => {
			await renderAndOpen({ onConfirmRestore: mockOnConfirmRestore });

			await waitFor(() => {
				expect(screen.getByTestId("version-item-3")).toBeDefined();
			});

			fireEvent.click(screen.getByTestId("version-item-3"));

			await waitFor(() => {
				expect(screen.getByTestId("diff-dialog-confirm")).toBeDefined();
			});

			fireEvent.click(screen.getByTestId("diff-dialog-confirm"));

			await waitFor(() => {
				expect(screen.getByTestId("confirm-restore-dialog")).toBeDefined();
				expect(screen.getByTestId("confirm-restore-title")).toBeDefined();
			});
		});

		it("should close secondary confirm dialog when cancel is clicked", async () => {
			await renderAndOpen({ onConfirmRestore: mockOnConfirmRestore });

			await waitFor(() => {
				expect(screen.getByTestId("version-item-3")).toBeDefined();
			});

			fireEvent.click(screen.getByTestId("version-item-3"));

			await waitFor(() => {
				expect(screen.getByTestId("diff-dialog-confirm")).toBeDefined();
			});

			fireEvent.click(screen.getByTestId("diff-dialog-confirm"));

			await waitFor(() => {
				expect(screen.getByTestId("confirm-restore-dialog")).toBeDefined();
			});

			fireEvent.click(screen.getByTestId("confirm-restore-cancel"));

			await waitFor(() => {
				expect(screen.queryByTestId("confirm-restore-dialog")).toBe(null);
			});

			// DiffDialog should still be visible
			expect(screen.getByTestId("diff-dialog")).toBeDefined();
		});

		it("should call restore API and close all dialogs on confirm", async () => {
			mockFetch.mockImplementation((url: string, options?: RequestInit) => {
				if (url.includes("/api/doc-histories?")) {
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve(mockHistoryData),
					});
				}
				if (url.includes("/api/doc-histories/") && options?.method === "POST") {
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve({ success: true }),
					});
				}
				if (url.includes("/api/doc-histories/")) {
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve(mockHistoryDetail),
					});
				}
				return Promise.resolve({ ok: false });
			});

			await renderAndOpen({ onConfirmRestore: mockOnConfirmRestore });

			await waitFor(() => {
				expect(screen.getByTestId("version-item-3")).toBeDefined();
			});

			fireEvent.click(screen.getByTestId("version-item-3"));

			await waitFor(() => {
				expect(screen.getByTestId("diff-dialog-confirm")).toBeDefined();
			});

			fireEvent.click(screen.getByTestId("diff-dialog-confirm"));

			await waitFor(() => {
				expect(screen.getByTestId("confirm-restore-confirm")).toBeDefined();
			});

			fireEvent.click(screen.getByTestId("confirm-restore-confirm"));

			await waitFor(() => {
				expect(mockFetch).toHaveBeenCalledWith(
					"/api/doc-histories/1/restore",
					expect.objectContaining({
						method: "POST",
						credentials: "include",
					}),
				);
				expect(mockOnConfirmRestore).toHaveBeenCalledWith(mockHistoryDetail);
			});
		});

		it("should handle restore API error gracefully", async () => {
			mockFetch.mockImplementation((url: string, options?: RequestInit) => {
				if (url.includes("/api/doc-histories?")) {
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve(mockHistoryData),
					});
				}
				if (url.includes("/api/doc-histories/") && options?.method === "POST") {
					return Promise.resolve({
						ok: false,
						statusText: "Internal Server Error",
					});
				}
				if (url.includes("/api/doc-histories/")) {
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve(mockHistoryDetail),
					});
				}
				return Promise.resolve({ ok: false });
			});

			await renderAndOpen({ onConfirmRestore: mockOnConfirmRestore });

			await waitFor(() => {
				expect(screen.getByTestId("version-item-3")).toBeDefined();
			});

			fireEvent.click(screen.getByTestId("version-item-3"));

			await waitFor(() => {
				expect(screen.getByTestId("diff-dialog-confirm")).toBeDefined();
			});

			fireEvent.click(screen.getByTestId("diff-dialog-confirm"));

			await waitFor(() => {
				expect(screen.getByTestId("confirm-restore-confirm")).toBeDefined();
			});

			fireEvent.click(screen.getByTestId("confirm-restore-confirm"));

			// onConfirmRestore should not be called on error
			await waitFor(() => {
				expect(mockOnConfirmRestore).not.toHaveBeenCalled();
			});
		});

		it("should handle detail fetch error gracefully", async () => {
			mockFetch.mockImplementation((url: string) => {
				if (url.includes("/api/doc-histories?")) {
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve(mockHistoryData),
					});
				}
				if (url.includes("/api/doc-histories/")) {
					return Promise.resolve({
						ok: false,
						statusText: "Not Found",
					});
				}
				return Promise.resolve({ ok: false });
			});

			await renderAndOpen();

			await waitFor(() => {
				expect(screen.getByTestId("version-item-3")).toBeDefined();
			});

			fireEvent.click(screen.getByTestId("version-item-3"));

			// Should not show DiffDialog on error
			await waitFor(() => {
				expect(screen.queryByTestId("diff-dialog")).toBe(null);
			});
		});

		it("should call onVersionRestored from context after successful restore", async () => {
			const mockOnVersionRestored = vi.fn();

			mockFetch.mockImplementation((url: string, options?: RequestInit) => {
				if (url.includes("/api/doc-histories?")) {
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve(mockHistoryData),
					});
				}
				if (url.includes("/api/doc-histories/") && options?.method === "POST") {
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve({ success: true }),
					});
				}
				if (url.includes("/api/doc-histories/")) {
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve(mockHistoryDetail),
					});
				}
				return Promise.resolve({ ok: false });
			});

			render(
				<VersionHistoryProvider onVersionRestored={mockOnVersionRestored}>
					<VersionHistoryDialog docId={mockDocId} currentDoc={mockCurrentDoc}>
						<button data-testid="history-trigger">History</button>
					</VersionHistoryDialog>
				</VersionHistoryProvider>,
			);

			// Open the popover
			fireEvent.click(screen.getByTestId("history-trigger"));

			await waitFor(() => {
				expect(screen.getByTestId("version-item-3")).toBeDefined();
			});

			fireEvent.click(screen.getByTestId("version-item-3"));

			await waitFor(() => {
				expect(screen.getByTestId("diff-dialog-confirm")).toBeDefined();
			});

			fireEvent.click(screen.getByTestId("diff-dialog-confirm"));

			await waitFor(() => {
				expect(screen.getByTestId("confirm-restore-confirm")).toBeDefined();
			});

			fireEvent.click(screen.getByTestId("confirm-restore-confirm"));

			await waitFor(() => {
				expect(mockOnVersionRestored).toHaveBeenCalledTimes(1);
			});
		});

		it("should not call onVersionRestored from context on restore API error", async () => {
			const mockOnVersionRestored = vi.fn();

			mockFetch.mockImplementation((url: string, options?: RequestInit) => {
				if (url.includes("/api/doc-histories?")) {
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve(mockHistoryData),
					});
				}
				if (url.includes("/api/doc-histories/") && options?.method === "POST") {
					return Promise.resolve({
						ok: false,
						statusText: "Internal Server Error",
					});
				}
				if (url.includes("/api/doc-histories/")) {
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve(mockHistoryDetail),
					});
				}
				return Promise.resolve({ ok: false });
			});

			render(
				<VersionHistoryProvider onVersionRestored={mockOnVersionRestored}>
					<VersionHistoryDialog docId={mockDocId} currentDoc={mockCurrentDoc}>
						<button data-testid="history-trigger">History</button>
					</VersionHistoryDialog>
				</VersionHistoryProvider>,
			);

			// Open the popover
			fireEvent.click(screen.getByTestId("history-trigger"));

			await waitFor(() => {
				expect(screen.getByTestId("version-item-3")).toBeDefined();
			});

			fireEvent.click(screen.getByTestId("version-item-3"));

			await waitFor(() => {
				expect(screen.getByTestId("diff-dialog-confirm")).toBeDefined();
			});

			fireEvent.click(screen.getByTestId("diff-dialog-confirm"));

			await waitFor(() => {
				expect(screen.getByTestId("confirm-restore-confirm")).toBeDefined();
			});

			fireEvent.click(screen.getByTestId("confirm-restore-confirm"));

			// Should not call onVersionRestored on error
			await waitFor(() => {
				expect(mockOnVersionRestored).not.toHaveBeenCalled();
			});
		});
	});
});
