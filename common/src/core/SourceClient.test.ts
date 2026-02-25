import type { ClientAuth } from "./Client";
import { createSourceClient } from "./SourceClient";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("SourceClient", () => {
	let mockAuth: ClientAuth;
	const baseUrl = "http://localhost:8080";

	beforeEach(() => {
		mockAuth = {
			authToken: undefined,
			createRequest: vi.fn((method, body) => ({
				method,
				headers: body ? { "Content-Type": "application/json" } : {},
				body: body ? JSON.stringify(body) : null,
				credentials: "include" as RequestCredentials,
			})),
			checkUnauthorized: vi.fn().mockReturnValue(false),
		};
		global.fetch = vi.fn();
	});

	describe("listSources", () => {
		it("should fetch all sources", async () => {
			const mockSources = [{ id: 1, name: "backend", type: "git" }];
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
				ok: true,
				json: async () => mockSources,
			});

			const client = createSourceClient(baseUrl, mockAuth);
			const result = await client.listSources();

			expect(global.fetch).toHaveBeenCalledWith(
				`${baseUrl}/api/v1/sources`,
				expect.objectContaining({ method: "GET" }),
			);
			expect(result).toEqual(mockSources);
		});

		it("should throw on failure", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
				ok: false,
				statusText: "Internal Server Error",
			});

			const client = createSourceClient(baseUrl, mockAuth);
			await expect(client.listSources()).rejects.toThrow("Failed to list sources: Internal Server Error");
		});
	});

	describe("createSource", () => {
		it("should create a source", async () => {
			const newSource = { name: "backend", type: "git" as const };
			const mockResponse = { id: 1, ...newSource };
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
				ok: true,
				json: async () => mockResponse,
			});

			const client = createSourceClient(baseUrl, mockAuth);
			const result = await client.createSource(newSource);

			expect(global.fetch).toHaveBeenCalledWith(
				`${baseUrl}/api/v1/sources`,
				expect.objectContaining({ method: "POST" }),
			);
			expect(result).toEqual(mockResponse);
		});

		it("should throw on failure", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
				ok: false,
				statusText: "Bad Request",
			});

			const client = createSourceClient(baseUrl, mockAuth);
			await expect(client.createSource({ name: "x", type: "git" })).rejects.toThrow(
				"Failed to create source: Bad Request",
			);
		});
	});

	describe("getSource", () => {
		it("should fetch a source by id", async () => {
			const mockSource = { id: 1, name: "backend", type: "git" };
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
				ok: true,
				json: async () => mockSource,
			});

			const client = createSourceClient(baseUrl, mockAuth);
			const result = await client.getSource(1);

			expect(global.fetch).toHaveBeenCalledWith(
				`${baseUrl}/api/v1/sources/1`,
				expect.objectContaining({ method: "GET" }),
			);
			expect(result).toEqual(mockSource);
		});

		it("should return undefined for 404", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
				ok: false,
				status: 404,
			});

			const client = createSourceClient(baseUrl, mockAuth);
			const result = await client.getSource(999);
			expect(result).toBeUndefined();
		});

		it("should throw on non-404 failure", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
				ok: false,
				status: 500,
				statusText: "Server Error",
			});

			const client = createSourceClient(baseUrl, mockAuth);
			await expect(client.getSource(1)).rejects.toThrow("Failed to get source: Server Error");
		});
	});

	describe("updateSource", () => {
		it("should update a source", async () => {
			const updated = { id: 1, name: "updated", type: "git" };
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
				ok: true,
				json: async () => updated,
			});

			const client = createSourceClient(baseUrl, mockAuth);
			const result = await client.updateSource(1, { name: "updated" });

			expect(global.fetch).toHaveBeenCalledWith(
				`${baseUrl}/api/v1/sources/1`,
				expect.objectContaining({ method: "PATCH" }),
			);
			expect(result).toEqual(updated);
		});

		it("should return undefined for 404", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
				ok: false,
				status: 404,
			});

			const client = createSourceClient(baseUrl, mockAuth);
			const result = await client.updateSource(999, { name: "x" });
			expect(result).toBeUndefined();
		});

		it("should throw on non-404 failure", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
				ok: false,
				status: 500,
				statusText: "Server Error",
			});

			const client = createSourceClient(baseUrl, mockAuth);
			await expect(client.updateSource(1, { name: "x" })).rejects.toThrow(
				"Failed to update source: Server Error",
			);
		});
	});

	describe("deleteSource", () => {
		it("should delete a source", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });

			const client = createSourceClient(baseUrl, mockAuth);
			await client.deleteSource(1);

			expect(global.fetch).toHaveBeenCalledWith(
				`${baseUrl}/api/v1/sources/1`,
				expect.objectContaining({ method: "DELETE" }),
			);
		});

		it("should throw on failure", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
				ok: false,
				statusText: "Forbidden",
			});

			const client = createSourceClient(baseUrl, mockAuth);
			await expect(client.deleteSource(1)).rejects.toThrow("Failed to delete source: Forbidden");
		});
	});

	describe("updateCursor", () => {
		it("should update the cursor", async () => {
			const updated = { id: 1, cursor: { value: "abc123", updatedAt: "2024-01-01" } };
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
				ok: true,
				json: async () => updated,
			});

			const client = createSourceClient(baseUrl, mockAuth);
			const result = await client.updateCursor(1, { value: "abc123" });

			expect(global.fetch).toHaveBeenCalledWith(
				`${baseUrl}/api/v1/sources/1/cursor`,
				expect.objectContaining({ method: "PATCH" }),
			);
			expect(result).toEqual(updated);
		});

		it("should return undefined for 404", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
				ok: false,
				status: 404,
			});

			const client = createSourceClient(baseUrl, mockAuth);
			const result = await client.updateCursor(999, { value: "abc" });
			expect(result).toBeUndefined();
		});

		it("should throw on non-404 failure", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
				ok: false,
				status: 500,
				statusText: "Server Error",
			});

			const client = createSourceClient(baseUrl, mockAuth);
			await expect(client.updateCursor(1, { value: "abc" })).rejects.toThrow(
				"Failed to update cursor: Server Error",
			);
		});
	});

	describe("listSpaceSources", () => {
		it("should fetch sources for a space", async () => {
			const mockSources = [{ id: 1, name: "backend", binding: { spaceId: 10, sourceId: 1 } }];
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
				ok: true,
				json: async () => mockSources,
			});

			const client = createSourceClient(baseUrl, mockAuth);
			const result = await client.listSpaceSources(10);

			expect(global.fetch).toHaveBeenCalledWith(
				`${baseUrl}/api/v1/spaces/10/sources`,
				expect.objectContaining({ method: "GET" }),
			);
			expect(result).toEqual(mockSources);
		});

		it("should throw on failure", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
				ok: false,
				statusText: "Not Found",
			});

			const client = createSourceClient(baseUrl, mockAuth);
			await expect(client.listSpaceSources(10)).rejects.toThrow("Failed to list space sources: Not Found");
		});
	});

	describe("bindSource", () => {
		it("should bind a source to a space", async () => {
			const mockBinding = { spaceId: 10, sourceId: 1, enabled: true };
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
				ok: true,
				json: async () => mockBinding,
			});

			const client = createSourceClient(baseUrl, mockAuth);
			const result = await client.bindSource(10, { sourceId: 1 });

			expect(global.fetch).toHaveBeenCalledWith(
				`${baseUrl}/api/v1/spaces/10/sources`,
				expect.objectContaining({ method: "POST" }),
			);
			expect(result).toEqual(mockBinding);
		});

		it("should throw on failure", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
				ok: false,
				statusText: "Conflict",
			});

			const client = createSourceClient(baseUrl, mockAuth);
			await expect(client.bindSource(10, { sourceId: 1 })).rejects.toThrow("Failed to bind source: Conflict");
		});
	});

	describe("unbindSource", () => {
		it("should unbind a source from a space", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });

			const client = createSourceClient(baseUrl, mockAuth);
			await client.unbindSource(10, 1);

			expect(global.fetch).toHaveBeenCalledWith(
				`${baseUrl}/api/v1/spaces/10/sources/1`,
				expect.objectContaining({ method: "DELETE" }),
			);
		});

		it("should throw on failure", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
				ok: false,
				statusText: "Forbidden",
			});

			const client = createSourceClient(baseUrl, mockAuth);
			await expect(client.unbindSource(10, 1)).rejects.toThrow("Failed to unbind source: Forbidden");
		});
	});

	describe("checkUnauthorized callback", () => {
		it("should call checkUnauthorized for listSources", async () => {
			const mockResponse = { ok: true, json: async () => [] };
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

			const client = createSourceClient(baseUrl, mockAuth);
			await client.listSources();

			expect(mockAuth.checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});

		it("should call checkUnauthorized for createSource", async () => {
			const mockResponse = { ok: true, json: async () => ({ id: 1 }) };
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

			const client = createSourceClient(baseUrl, mockAuth);
			await client.createSource({ name: "x", type: "git" });

			expect(mockAuth.checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});
	});
});
