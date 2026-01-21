import { createDocDraftClient, type DocDraftClient } from "./DocDraftClient";
import { beforeEach, describe, expect, it, vi } from "vitest";

global.fetch = vi.fn();
global.EventSource = vi.fn() as unknown as {
	new (url: string | URL, eventSourceInitDict?: EventSourceInit): EventSource;
	readonly CONNECTING: 0;
	readonly OPEN: 1;
	readonly CLOSED: 2;
};

const mockFetch = vi.mocked(fetch);

interface MockAuth {
	createRequest: ReturnType<typeof vi.fn>;
	getAuthToken: ReturnType<typeof vi.fn>;
	checkUnauthorized?: (response: Response) => boolean;
}

function createMockAuth(checkUnauthorized?: (response: Response) => boolean): MockAuth {
	const auth: MockAuth = {
		createRequest: vi.fn((method: string, body?: unknown) => {
			const req: RequestInit = { method };
			if (body) {
				req.body = JSON.stringify(body);
				req.headers = { "Content-Type": "application/json" };
			}
			return req;
		}),
		getAuthToken: vi.fn().mockReturnValue("mock-token"),
	};
	if (checkUnauthorized) {
		auth.checkUnauthorized = checkUnauthorized;
	}
	return auth;
}

describe("DocDraftClient", () => {
	let client: DocDraftClient;
	let mockAuth: ReturnType<typeof createMockAuth>;

	beforeEach(() => {
		vi.clearAllMocks();
		mockAuth = createMockAuth();
		client = createDocDraftClient("http://localhost:3000", mockAuth);
	});

	describe("createDocDraft", () => {
		it("creates a draft successfully", async () => {
			const mockDraft = {
				id: 1,
				docId: undefined,
				title: "Test Draft",
				content: "Content",
				createdBy: 100,
				createdAt: "2025-01-01T00:00:00Z",
				updatedAt: "2025-01-01T00:00:00Z",
			};

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => mockDraft,
			} as Response);

			const result = await client.createDocDraft({
				title: "Test Draft",
				content: "Content",
			});

			expect(result).toEqual(mockDraft);
			expect(mockFetch).toHaveBeenCalledWith(
				"http://localhost:3000/api/doc-drafts",
				expect.objectContaining({ method: "POST" }),
			);
		});

		it("throws error when creation fails", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				statusText: "Bad Request",
			} as Response);

			await expect(client.createDocDraft({ title: "Test", content: "Content" })).rejects.toThrow(
				"Failed to create draft: Bad Request",
			);
		});
	});

	describe("listDocDrafts", () => {
		it("lists drafts without pagination", async () => {
			const mockDrafts = [
				{ id: 1, title: "Draft 1" },
				{ id: 2, title: "Draft 2" },
			];

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => mockDrafts,
			} as Response);

			const result = await client.listDocDrafts();

			expect(result).toEqual(mockDrafts);
			expect(mockFetch).toHaveBeenCalledWith(
				"http://localhost:3000/api/doc-drafts",
				expect.objectContaining({ method: "GET" }),
			);
		});

		it("lists drafts with pagination", async () => {
			const mockDrafts = [{ id: 1, title: "Draft 1" }];

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => mockDrafts,
			} as Response);

			const result = await client.listDocDrafts(10, 5);

			expect(result).toEqual(mockDrafts);
			expect(mockFetch).toHaveBeenCalledWith(
				"http://localhost:3000/api/doc-drafts?limit=10&offset=5",
				expect.objectContaining({ method: "GET" }),
			);
		});

		it("throws error when listing fails", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				statusText: "Internal Server Error",
			} as Response);

			await expect(client.listDocDrafts()).rejects.toThrow("Failed to list drafts: Internal Server Error");
		});
	});

	describe("getDocDraft", () => {
		it("gets a draft successfully", async () => {
			const mockDraft = { id: 1, title: "Draft 1" };

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => mockDraft,
			} as Response);

			const result = await client.getDocDraft(1);

			expect(result).toEqual(mockDraft);
			expect(mockFetch).toHaveBeenCalledWith(
				"http://localhost:3000/api/doc-drafts/1",
				expect.objectContaining({ method: "GET" }),
			);
		});

		it("throws error when get fails", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				statusText: "Not Found",
			} as Response);

			await expect(client.getDocDraft(1)).rejects.toThrow("Failed to get draft: Not Found");
		});
	});

	describe("updateDocDraft", () => {
		it("updates a draft successfully", async () => {
			const mockDraft = { id: 1, title: "Updated Draft" };

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => mockDraft,
			} as Response);

			const result = await client.updateDocDraft(1, { title: "Updated Draft" });

			expect(result).toEqual(mockDraft);
			expect(mockFetch).toHaveBeenCalledWith(
				"http://localhost:3000/api/doc-drafts/1",
				expect.objectContaining({ method: "PATCH" }),
			);
		});

		it("throws error when update fails", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				statusText: "Bad Request",
			} as Response);

			await expect(client.updateDocDraft(1, { title: "Updated" })).rejects.toThrow(
				"Failed to update draft: Bad Request",
			);
		});
	});

	describe("saveDocDraft", () => {
		it("saves a draft successfully", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ success: true }),
			} as Response);

			const result = await client.saveDocDraft(1);

			expect(result).toEqual({ success: true });
			expect(mockFetch).toHaveBeenCalledWith(
				"http://localhost:3000/api/doc-drafts/1/save",
				expect.objectContaining({ method: "POST" }),
			);
		});

		it("throws error when save fails", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				statusText: "Internal Server Error",
			} as Response);

			await expect(client.saveDocDraft(1)).rejects.toThrow("Failed to save draft: Internal Server Error");
		});
	});

	describe("deleteDocDraft", () => {
		it("deletes a draft successfully", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ success: true }),
			} as Response);

			const result = await client.deleteDocDraft(1);

			expect(result).toEqual({ success: true });
			expect(mockFetch).toHaveBeenCalledWith(
				"http://localhost:3000/api/doc-drafts/1",
				expect.objectContaining({ method: "DELETE" }),
			);
		});

		it("throws error when delete fails", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				statusText: "Not Found",
			} as Response);

			await expect(client.deleteDocDraft(1)).rejects.toThrow("Failed to delete draft: Not Found");
		});
	});

	describe("undoDocDraft", () => {
		it("undoes a change successfully", async () => {
			const mockResponse = {
				draft: { id: 1, content: "Undone content" },
				canUndo: false,
				canRedo: true,
			};

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => mockResponse,
			} as Response);

			const result = await client.undoDocDraft(1);

			expect(result).toEqual(mockResponse);
			expect(mockFetch).toHaveBeenCalledWith(
				"http://localhost:3000/api/doc-drafts/1/undo",
				expect.objectContaining({ method: "POST" }),
			);
		});

		it("throws error when undo fails", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				statusText: "Bad Request",
			} as Response);

			await expect(client.undoDocDraft(1)).rejects.toThrow("Failed to undo: Bad Request");
		});
	});

	describe("redoDocDraft", () => {
		it("redoes a change successfully", async () => {
			const mockResponse = {
				draft: { id: 1, content: "Redone content" },
				canUndo: true,
				canRedo: false,
			};

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => mockResponse,
			} as Response);

			const result = await client.redoDocDraft(1);

			expect(result).toEqual(mockResponse);
			expect(mockFetch).toHaveBeenCalledWith(
				"http://localhost:3000/api/doc-drafts/1/redo",
				expect.objectContaining({ method: "POST" }),
			);
		});

		it("throws error when redo fails", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				statusText: "Bad Request",
			} as Response);

			await expect(client.redoDocDraft(1)).rejects.toThrow("Failed to redo: Bad Request");
		});
	});

	describe("getRevisions", () => {
		it("gets revisions successfully", async () => {
			const mockRevisions = {
				revisions: [
					{ id: 1, content: "Revision 1", createdAt: "2025-01-01T00:00:00Z" },
					{ id: 2, content: "Revision 2", createdAt: "2025-01-02T00:00:00Z" },
				],
			};

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => mockRevisions,
			} as Response);

			const result = await client.getRevisions(1);

			expect(result).toEqual(mockRevisions);
			expect(mockFetch).toHaveBeenCalledWith(
				"http://localhost:3000/api/doc-drafts/1/revisions",
				expect.objectContaining({ method: "GET" }),
			);
		});

		it("throws error when get revisions fails", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				statusText: "Not Found",
			} as Response);

			await expect(client.getRevisions(1)).rejects.toThrow("Failed to get revisions: Not Found");
		});
	});

	describe("streamDraftUpdates", () => {
		it("creates EventSource with correct URL and credentials", () => {
			const mockEventSource = {} as EventSource;
			global.EventSource = vi.fn().mockReturnValue(mockEventSource) as unknown as {
				new (url: string | URL, eventSourceInitDict?: EventSourceInit): EventSource;
				readonly CONNECTING: 0;
				readonly OPEN: 1;
				readonly CLOSED: 2;
			};

			const result = client.streamDraftUpdates(1);

			expect(result).toBe(mockEventSource);
			expect(global.EventSource).toHaveBeenCalledWith("http://localhost:3000/api/doc-drafts/1/stream", {
				withCredentials: true,
			});
		});
	});

	describe("searchByTitle", () => {
		it("should search drafts by title", async () => {
			const mockDrafts = [
				{
					id: 1,
					title: "My Test Article",
					content: "content1",
				},
				{
					id: 2,
					title: "Another Test Article",
					content: "content2",
				},
			];

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => mockDrafts,
			} as Response);

			const result = await client.searchByTitle("test");

			expect(result).toEqual(mockDrafts);
			expect(mockFetch).toHaveBeenCalledWith(
				"http://localhost:3000/api/doc-drafts/search-by-title",
				expect.objectContaining({
					method: "POST",
					body: JSON.stringify({ title: "test" }),
				}),
			);
		});

		it("throws error when searchByTitle fails", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				statusText: "Internal Server Error",
			} as Response);

			await expect(client.searchByTitle("test")).rejects.toThrow(
				"Failed to search drafts by title: Internal Server Error",
			);
		});
	});

	describe("getSectionChanges", () => {
		it("gets section changes successfully", async () => {
			const mockResponse = {
				changes: [
					{
						id: 1,
						draftId: 123,
						changeType: "update",
						path: "/overview",
						content: "test content",
						proposed: [],
						comments: [],
						applied: false,
					},
				],
				annotations: [
					{
						id: "1",
						path: "/overview",
						title: "Overview",
						startLine: 0,
						endLine: 5,
						changeIds: [1],
					},
				],
			};

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => mockResponse,
			} as Response);

			const result = await client.getSectionChanges(123);

			expect(result).toEqual(mockResponse);
			expect(mockFetch).toHaveBeenCalledWith(
				"http://localhost:3000/api/doc-drafts/123/section-changes",
				expect.objectContaining({ method: "GET" }),
			);
		});

		it("throws error when getSectionChanges fails", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				statusText: "Not Found",
			} as Response);

			await expect(client.getSectionChanges(123)).rejects.toThrow("Failed to get section changes: Not Found");
		});
	});

	describe("applySectionChange", () => {
		it("applies section change successfully", async () => {
			const mockResponse = {
				content: "Updated content",
				sections: [],
				changes: [],
				canUndo: true,
				canRedo: false,
			};

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => mockResponse,
			} as Response);

			const result = await client.applySectionChange(123, 1);

			expect(result).toEqual(mockResponse);
			expect(mockFetch).toHaveBeenCalledWith(
				"http://localhost:3000/api/doc-drafts/123/section-changes/1/apply",
				expect.objectContaining({ method: "POST" }),
			);
		});

		it("throws error when applySectionChange fails", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				statusText: "Bad Request",
			} as Response);

			await expect(client.applySectionChange(123, 1)).rejects.toThrow(
				"Failed to apply section change: Bad Request",
			);
		});
	});

	describe("dismissSectionChange", () => {
		it("dismisses section change successfully", async () => {
			const mockResponse = {
				content: "Current content",
				sections: [],
				changes: [],
				canUndo: true,
				canRedo: false,
			};

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => mockResponse,
			} as Response);

			const result = await client.dismissSectionChange(123, 1);

			expect(result).toEqual(mockResponse);
			expect(mockFetch).toHaveBeenCalledWith(
				"http://localhost:3000/api/doc-drafts/123/section-changes/1/dismiss",
				expect.objectContaining({ method: "POST" }),
			);
		});

		it("throws error when dismissSectionChange fails", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				statusText: "Not Found",
			} as Response);

			await expect(client.dismissSectionChange(123, 1)).rejects.toThrow(
				"Failed to dismiss section change: Not Found",
			);
		});
	});

	describe("getDraftsWithPendingChanges", () => {
		it("returns drafts with pending changes successfully", async () => {
			const mockResponse = [
				{
					draft: {
						id: 1,
						docId: 100,
						title: "Test Draft",
						content: "Content",
						createdAt: "2024-01-01",
						updatedAt: "2024-01-02",
					},
					pendingChangesCount: 3,
					lastChangeUpdatedAt: "2024-01-02T12:00:00Z",
				},
				{
					draft: {
						id: 2,
						docId: 200,
						title: "Another Draft",
						content: "More content",
						createdAt: "2024-01-01",
						updatedAt: "2024-01-02",
					},
					pendingChangesCount: 1,
					lastChangeUpdatedAt: "2024-01-02T14:00:00Z",
				},
			];

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => mockResponse,
			} as Response);

			const result = await client.getDraftsWithPendingChanges();

			expect(result).toEqual(mockResponse);
			expect(mockFetch).toHaveBeenCalledWith(
				"http://localhost:3000/api/doc-drafts/with-pending-changes",
				expect.objectContaining({ method: "GET" }),
			);
		});

		it("throws error when getDraftsWithPendingChanges fails", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				statusText: "Internal Server Error",
			} as Response);

			await expect(client.getDraftsWithPendingChanges()).rejects.toThrow(
				"Failed to get drafts with pending changes: Internal Server Error",
			);
		});
	});

	describe("validateDocDraft", () => {
		it("validates a draft successfully", async () => {
			const mockResponse = {
				isValid: true,
				isOpenApiSpec: true,
				version: "3.0.0",
				title: "Test API",
				errors: [],
			};

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => mockResponse,
			} as Response);

			const result = await client.validateDocDraft(1);

			expect(result).toEqual(mockResponse);
			expect(mockFetch).toHaveBeenCalledWith(
				"http://localhost:3000/api/doc-drafts/1/validate",
				expect.objectContaining({ method: "POST" }),
			);
		});

		it("throws error when validation fails", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				statusText: "Internal Server Error",
			} as Response);

			await expect(client.validateDocDraft(1)).rejects.toThrow("Failed to validate draft: Internal Server Error");
		});
	});

	describe("validateContent", () => {
		it("validates content successfully", async () => {
			const mockResponse = {
				isValid: true,
				errors: [],
			};

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => mockResponse,
			} as Response);

			const result = await client.validateContent("# Hello", "text/markdown");

			expect(result).toEqual(mockResponse);
			expect(mockFetch).toHaveBeenCalledWith(
				"http://localhost:3000/api/doc-drafts/validate",
				expect.objectContaining({
					method: "POST",
					body: JSON.stringify({ content: "# Hello", contentType: "text/markdown" }),
				}),
			);
		});

		it("validates content without contentType", async () => {
			const mockResponse = {
				isValid: true,
				errors: [],
			};

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => mockResponse,
			} as Response);

			const result = await client.validateContent("# Hello");

			expect(result).toEqual(mockResponse);
			expect(mockFetch).toHaveBeenCalledWith(
				"http://localhost:3000/api/doc-drafts/validate",
				expect.objectContaining({
					method: "POST",
					body: JSON.stringify({ content: "# Hello", contentType: undefined }),
				}),
			);
		});

		it("returns validation errors for invalid content", async () => {
			const mockResponse = {
				isValid: false,
				errors: [
					{
						message: "Unexpected end of file",
						line: 3,
						column: 1,
						severity: "error",
					},
				],
			};

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => mockResponse,
			} as Response);

			const result = await client.validateContent("<Component");

			expect(result).toEqual(mockResponse);
			expect(result.isValid).toBe(false);
			expect(result.errors).toHaveLength(1);
		});

		it("throws error when validateContent fails", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				statusText: "Internal Server Error",
			} as Response);

			await expect(client.validateContent("# Hello")).rejects.toThrow(
				"Failed to validate content: Internal Server Error",
			);
		});
	});

	describe("checkUnauthorized callback", () => {
		it("should call checkUnauthorized for createDocDraft", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = {
				ok: true,
				json: async () => ({ id: 1, docId: 1, title: "Test", content: "", createdAt: "", updatedAt: "" }),
			};
			mockFetch.mockResolvedValueOnce(mockResponse as Response);

			const clientWithCheck = createDocDraftClient("http://localhost:3000", createMockAuth(checkUnauthorized));
			await clientWithCheck.createDocDraft({ title: "Test", content: "" });

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});

		it("should call checkUnauthorized for getDocDraft", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = {
				ok: true,
				json: async () => ({ id: 1, docId: 1, title: "Test", content: "", createdAt: "", updatedAt: "" }),
			};
			mockFetch.mockResolvedValueOnce(mockResponse as Response);

			const clientWithCheck = createDocDraftClient("http://localhost:3000", createMockAuth(checkUnauthorized));
			await clientWithCheck.getDocDraft(1);

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});

		it("should call checkUnauthorized for listDocDrafts", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = { ok: true, json: async () => [] };
			mockFetch.mockResolvedValueOnce(mockResponse as Response);

			const clientWithCheck = createDocDraftClient("http://localhost:3000", createMockAuth(checkUnauthorized));
			await clientWithCheck.listDocDrafts();

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});

		it("should call checkUnauthorized for updateDocDraft", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = {
				ok: true,
				json: async () => ({ id: 1, docId: 1, title: "Updated", content: "", createdAt: "", updatedAt: "" }),
			};
			mockFetch.mockResolvedValueOnce(mockResponse as Response);

			const clientWithCheck = createDocDraftClient("http://localhost:3000", createMockAuth(checkUnauthorized));
			await clientWithCheck.updateDocDraft(1, { title: "Updated" });

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});

		it("should call checkUnauthorized for deleteDocDraft", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = { ok: true, json: async () => ({ success: true }) };
			mockFetch.mockResolvedValueOnce(mockResponse as Response);

			const clientWithCheck = createDocDraftClient("http://localhost:3000", createMockAuth(checkUnauthorized));
			await clientWithCheck.deleteDocDraft(1);

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});

		it("should call checkUnauthorized for saveDocDraft", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = {
				ok: true,
				json: async () => ({ success: true }),
			};
			mockFetch.mockResolvedValueOnce(mockResponse as Response);

			const clientWithCheck = createDocDraftClient("http://localhost:3000", createMockAuth(checkUnauthorized));
			await clientWithCheck.saveDocDraft(1);

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});

		it("should call checkUnauthorized for validateDocDraft", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = {
				ok: true,
				json: async () => ({ isValid: true, errors: [] }),
			};
			mockFetch.mockResolvedValueOnce(mockResponse as Response);

			const clientWithCheck = createDocDraftClient("http://localhost:3000", createMockAuth(checkUnauthorized));
			await clientWithCheck.validateDocDraft(1);

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});

		it("should call checkUnauthorized for applySectionChange", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = {
				ok: true,
				json: async () => ({ success: true }),
			};
			mockFetch.mockResolvedValueOnce(mockResponse as Response);

			const clientWithCheck = createDocDraftClient("http://localhost:3000", createMockAuth(checkUnauthorized));
			await clientWithCheck.applySectionChange(1, 1);

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});

		it("should call checkUnauthorized for dismissSectionChange", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = {
				ok: true,
				json: async () => ({ pendingCount: 0, changes: [] }),
			};
			mockFetch.mockResolvedValueOnce(mockResponse as Response);

			const clientWithCheck = createDocDraftClient("http://localhost:3000", createMockAuth(checkUnauthorized));
			await clientWithCheck.dismissSectionChange(1, 1);

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});

		it("should call checkUnauthorized for getDraftsWithPendingChanges", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = {
				ok: true,
				json: async () => [],
			};
			mockFetch.mockResolvedValueOnce(mockResponse as Response);

			const clientWithCheck = createDocDraftClient("http://localhost:3000", createMockAuth(checkUnauthorized));
			await clientWithCheck.getDraftsWithPendingChanges();

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});

		it("should call checkUnauthorized for validateContent", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = {
				ok: true,
				json: async () => ({ isValid: true, errors: [] }),
			};
			mockFetch.mockResolvedValueOnce(mockResponse as Response);

			const clientWithCheck = createDocDraftClient("http://localhost:3000", createMockAuth(checkUnauthorized));
			await clientWithCheck.validateContent("# Hello");

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});

		it("should call checkUnauthorized for undoDocDraft", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = {
				ok: true,
				json: async () => ({ success: true }),
			};
			mockFetch.mockResolvedValueOnce(mockResponse as Response);

			const clientWithCheck = createDocDraftClient("http://localhost:3000", createMockAuth(checkUnauthorized));
			await clientWithCheck.undoDocDraft(1);

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});

		it("should call checkUnauthorized for redoDocDraft", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = {
				ok: true,
				json: async () => ({ success: true }),
			};
			mockFetch.mockResolvedValueOnce(mockResponse as Response);

			const clientWithCheck = createDocDraftClient("http://localhost:3000", createMockAuth(checkUnauthorized));
			await clientWithCheck.redoDocDraft(1);

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});

		it("should call checkUnauthorized for getRevisions", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = {
				ok: true,
				json: async () => ({ revisions: [], canUndo: false, canRedo: false }),
			};
			mockFetch.mockResolvedValueOnce(mockResponse as Response);

			const clientWithCheck = createDocDraftClient("http://localhost:3000", createMockAuth(checkUnauthorized));
			await clientWithCheck.getRevisions(1);

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});

		it("should call checkUnauthorized for searchByTitle", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = {
				ok: true,
				json: async () => [],
			};
			mockFetch.mockResolvedValueOnce(mockResponse as Response);

			const clientWithCheck = createDocDraftClient("http://localhost:3000", createMockAuth(checkUnauthorized));
			await clientWithCheck.searchByTitle("Test");

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});

		it("should call checkUnauthorized for getSectionChanges", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = {
				ok: true,
				json: async () => ({ pendingCount: 0, changes: [] }),
			};
			mockFetch.mockResolvedValueOnce(mockResponse as Response);

			const clientWithCheck = createDocDraftClient("http://localhost:3000", createMockAuth(checkUnauthorized));
			await clientWithCheck.getSectionChanges(1);

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});
	});

	describe("shareDraft", () => {
		it("shares draft successfully", async () => {
			const mockResponse = {
				id: 123,
				docId: undefined,
				title: "Shared Draft",
				content: "Content",
				isShared: true,
				sharedAt: "2024-01-01T12:00:00Z",
				sharedBy: 1,
				createdByAgent: false,
			};

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => mockResponse,
			} as Response);

			const result = await client.shareDraft(123);

			expect(result).toEqual(mockResponse);
			expect(result.isShared).toBe(true);
			expect(mockFetch).toHaveBeenCalledWith(
				"http://localhost:3000/api/doc-drafts/123/share",
				expect.objectContaining({ method: "POST" }),
			);
		});

		it("throws error when shareDraft fails", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				statusText: "Forbidden",
			} as Response);

			await expect(client.shareDraft(123)).rejects.toThrow("Failed to share draft: Forbidden");
		});
	});

	describe("getDraftHistory", () => {
		it("returns draft history successfully", async () => {
			const mockResponse = [
				{
					id: 1,
					draftId: 123,
					userId: 1,
					editType: "content",
					description: "Updated introduction",
					editedAt: "2024-01-01T12:00:00Z",
				},
				{
					id: 2,
					draftId: 123,
					userId: 2,
					editType: "title",
					description: "Changed title",
					editedAt: "2024-01-02T10:00:00Z",
				},
			];

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => mockResponse,
			} as Response);

			const result = await client.getDraftHistory(123);

			expect(result).toEqual(mockResponse);
			expect(mockFetch).toHaveBeenCalledWith(
				"http://localhost:3000/api/doc-drafts/123/history",
				expect.objectContaining({ method: "GET" }),
			);
		});

		it("throws error when getDraftHistory fails", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				statusText: "Not Found",
			} as Response);

			await expect(client.getDraftHistory(123)).rejects.toThrow("Failed to get draft history: Not Found");
		});
	});

	describe("getDraftCounts", () => {
		it("returns draft counts successfully", async () => {
			const mockResponse = {
				all: 10,
				myNewDrafts: 3,
				sharedWithMe: 4,
				suggestedUpdates: 2,
			};

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => mockResponse,
			} as Response);

			const result = await client.getDraftCounts();

			expect(result).toEqual(mockResponse);
			expect(mockFetch).toHaveBeenCalledWith(
				"http://localhost:3000/api/doc-drafts/counts",
				expect.objectContaining({ method: "GET" }),
			);
		});

		it("throws error when getDraftCounts fails", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				statusText: "Internal Server Error",
			} as Response);

			await expect(client.getDraftCounts()).rejects.toThrow("Failed to get draft counts: Internal Server Error");
		});
	});

	describe("listDocDraftsFiltered", () => {
		it("returns filtered drafts successfully", async () => {
			const mockResponse = {
				drafts: [
					{ id: 1, title: "Draft 1" },
					{ id: 2, title: "Draft 2" },
				],
				total: 10,
			};

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => mockResponse,
			} as Response);

			const result = await client.listDocDraftsFiltered("my-new-drafts");

			expect(result).toEqual(mockResponse);
			expect(mockFetch).toHaveBeenCalledWith(
				"http://localhost:3000/api/doc-drafts?filter=my-new-drafts",
				expect.objectContaining({ method: "GET" }),
			);
		});

		it("includes limit and offset when provided", async () => {
			const mockResponse = {
				drafts: [{ id: 1, title: "Draft 1" }],
				total: 100,
			};

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => mockResponse,
			} as Response);

			const result = await client.listDocDraftsFiltered("shared-with-me", 10, 20);

			expect(result).toEqual(mockResponse);
			expect(mockFetch).toHaveBeenCalledWith(
				"http://localhost:3000/api/doc-drafts?filter=shared-with-me&limit=10&offset=20",
				expect.objectContaining({ method: "GET" }),
			);
		});

		it("handles all filter types", async () => {
			const filters = ["all", "my-new-drafts", "shared-with-me", "suggested-updates"] as const;

			for (const filter of filters) {
				mockFetch.mockResolvedValueOnce({
					ok: true,
					json: async () => ({ drafts: [], total: 0 }),
				} as Response);

				await client.listDocDraftsFiltered(filter);

				expect(mockFetch).toHaveBeenLastCalledWith(
					`http://localhost:3000/api/doc-drafts?filter=${filter}`,
					expect.objectContaining({ method: "GET" }),
				);
			}
		});

		it("throws error when listDocDraftsFiltered fails", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				statusText: "Bad Request",
			} as Response);

			await expect(client.listDocDraftsFiltered("all")).rejects.toThrow(
				"Failed to list filtered drafts: Bad Request",
			);
		});
	});
});
