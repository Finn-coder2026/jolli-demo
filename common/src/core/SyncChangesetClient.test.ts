import type { ClientAuth } from "./Client";
import { createSyncChangesetClient } from "./SyncChangesetClient";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("SyncChangesetClient", () => {
	let mockAuth: ClientAuth;
	const baseUrl = "http://localhost:8080";

	beforeEach(() => {
		mockAuth = {
			authToken: undefined,
			createRequest: vi.fn((method, body) => ({
				method,
				headers: {
					...(body ? { "Content-Type": "application/json" } : {}),
					Authorization: "Bearer test-token",
				},
				body: body ? JSON.stringify(body) : null,
				credentials: "include" as RequestCredentials,
			})),
			checkUnauthorized: vi.fn().mockReturnValue(false),
		};
		global.fetch = vi.fn();
	});

	it("lists changesets and adds X-Jolli-Space header when scope is provided", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			json: async () => ({ changesets: [{ id: 1 }], hasMore: false }),
		});

		const client = createSyncChangesetClient(baseUrl, mockAuth);
		const result = await client.listChangesets({ spaceSlug: "docs" });

		expect(result).toEqual([{ id: 1 }]);
		const [, request] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
		const headers = new Headers(request.headers as HeadersInit);
		expect(headers.get("Authorization")).toBe("Bearer test-token");
		expect(headers.get("X-Jolli-Space")).toBe("docs");
		expect(request.method).toBe("GET");
	});

	it("lists paged changesets with pagination query params", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			json: async () => ({ changesets: [{ id: 5 }], hasMore: true, nextBeforeId: 5 }),
		});

		const client = createSyncChangesetClient(baseUrl, mockAuth);
		const result = await client.listChangesetsPage({ limit: 25, beforeId: 100, spaceSlug: "docs" });

		expect(result).toEqual({
			changesets: [{ id: 5 }],
			hasMore: true,
			nextBeforeId: 5,
		});
		expect(global.fetch).toHaveBeenCalledWith(
			`${baseUrl}/api/v1/sync/changesets?limit=25&beforeId=100`,
			expect.objectContaining({ method: "GET" }),
		);
	});

	it("returns undefined on getChangeset 404", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: false,
			status: 404,
			statusText: "Not Found",
		});

		const client = createSyncChangesetClient(baseUrl, mockAuth);
		const result = await client.getChangeset(999);

		expect(result).toBeUndefined();
	});

	it("throws when listing changesets fails", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: false,
			statusText: "Internal Server Error",
		});

		const client = createSyncChangesetClient(baseUrl, mockAuth);
		await expect(client.listChangesets()).rejects.toThrow("Failed to list changesets: Internal Server Error");
	});

	it("gets changeset files", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			json: async () => ({ files: [{ id: 10, fileId: "a" }] }),
		});

		const client = createSyncChangesetClient(baseUrl, mockAuth);
		const result = await client.getChangesetFiles(12);

		expect(result).toEqual([{ id: 10, fileId: "a" }]);
		expect(global.fetch).toHaveBeenCalledWith(
			`${baseUrl}/api/v1/sync/changesets/12/files`,
			expect.objectContaining({ method: "GET" }),
		);
	});

	it("reviews a file with PATCH payload", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			json: async () => ({ changeset: { id: 1 }, commit: { id: 1 }, review: { id: 2 } }),
		});

		const client = createSyncChangesetClient(baseUrl, mockAuth);
		await client.reviewChangesetFile(3, 4, { decision: "accept" });

		expect(global.fetch).toHaveBeenCalledWith(
			`${baseUrl}/api/v1/sync/changesets/3/files/4/review`,
			expect.objectContaining({
				method: "PATCH",
				body: JSON.stringify({ decision: "accept" }),
			}),
		);
	});

	it("publishes a changeset with POST payload", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			json: async () => ({ changeset: { id: 5 }, commit: { id: 5 }, files: [], hasConflicts: false }),
		});

		const client = createSyncChangesetClient(baseUrl, mockAuth);
		await client.publishChangeset(5);

		expect(global.fetch).toHaveBeenCalledWith(
			`${baseUrl}/api/v1/sync/changesets/5/publish`,
			expect.objectContaining({
				method: "POST",
				body: JSON.stringify({}),
			}),
		);
	});

	it("throws when reviewing a changeset file fails", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: false,
			statusText: "Bad Request",
		});

		const client = createSyncChangesetClient(baseUrl, mockAuth);
		await expect(client.reviewChangesetFile(1, 2, { decision: "accept" })).rejects.toThrow(
			"Failed to review changeset file: Bad Request",
		);
	});

	it("throws when publishing a changeset fails", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: false,
			statusText: "Conflict",
		});

		const client = createSyncChangesetClient(baseUrl, mockAuth);
		await expect(client.publishChangeset(5)).rejects.toThrow("Failed to publish changeset: Conflict");
	});

	it("gets a changeset by ID", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			json: async () => ({ changeset: { id: 7, status: "open" } }),
		});

		const client = createSyncChangesetClient(baseUrl, mockAuth);
		const result = await client.getChangeset(7);

		expect(result).toEqual({ id: 7, status: "open" });
		expect(global.fetch).toHaveBeenCalledWith(
			`${baseUrl}/api/v1/sync/changesets/7`,
			expect.objectContaining({ method: "GET" }),
		);
	});

	it("throws when getChangeset fails with non-404 error", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: false,
			status: 500,
			statusText: "Internal Server Error",
		});

		const client = createSyncChangesetClient(baseUrl, mockAuth);
		await expect(client.getChangeset(1)).rejects.toThrow("Failed to get changeset: Internal Server Error");
	});

	it("throws when getChangesetFiles fails", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: false,
			statusText: "Not Found",
		});

		const client = createSyncChangesetClient(baseUrl, mockAuth);
		await expect(client.getChangesetFiles(1)).rejects.toThrow("Failed to get changeset files: Not Found");
	});

	it("lists changesets page without query params when none provided", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			json: async () => ({}),
		});

		const client = createSyncChangesetClient(baseUrl, mockAuth);
		const result = await client.listChangesetsPage();

		expect(result).toEqual({ changesets: [], hasMore: false });
		expect(global.fetch).toHaveBeenCalledWith(
			`${baseUrl}/api/v1/sync/changesets`,
			expect.objectContaining({ method: "GET" }),
		);
	});

	it("works when checkUnauthorized is undefined", async () => {
		const authNoCheck: ClientAuth = {
			authToken: undefined,
			createRequest: vi.fn((method, body) => ({
				method,
				headers: body ? { "Content-Type": "application/json" } : {},
				body: body ? JSON.stringify(body) : null,
				credentials: "include" as RequestCredentials,
			})),
		};
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			json: async () => ({ changesets: [], hasMore: false }),
		});

		const client = createSyncChangesetClient(baseUrl, authNoCheck);
		await expect(client.listChangesets()).resolves.toEqual([]);
	});

	it("calls checkUnauthorized on requests", async () => {
		const response = {
			ok: true,
			json: async () => ({ changesets: [], hasMore: false }),
		};
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(response);

		const client = createSyncChangesetClient(baseUrl, mockAuth);
		await client.listChangesets();

		expect(mockAuth.checkUnauthorized).toHaveBeenCalledWith(response);
	});
});
