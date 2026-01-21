import type { ClientAuth } from "./Client";
import { createTenantClient } from "./TenantClient";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("TenantClient", () => {
	let mockAuth: ClientAuth;

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

	describe("listTenants", () => {
		it("should fetch list of tenants", async () => {
			const mockResponse = {
				useTenantSwitcher: true,
				currentTenantId: "tenant-1",
				baseDomain: "jolli.app",
				tenants: [
					{
						id: "tenant-1",
						slug: "acme",
						displayName: "Acme Corp",
						primaryDomain: null,
					},
					{
						id: "tenant-2",
						slug: "beta",
						displayName: "Beta Inc",
						primaryDomain: "beta.example.com",
					},
				],
			};

			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
				ok: true,
				json: async () => mockResponse,
			});

			const client = createTenantClient("http://localhost:8080", mockAuth);
			const result = await client.listTenants();

			expect(global.fetch).toHaveBeenCalledWith(
				"http://localhost:8080/api/tenant/list",
				expect.objectContaining({ method: "GET" }),
			);
			expect(result).toEqual(mockResponse);
		});

		it("should throw error when listTenants fails", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
				ok: false,
				status: 500,
			});

			const client = createTenantClient("http://localhost:8080", mockAuth);

			await expect(client.listTenants()).rejects.toThrow("Failed to list tenants: 500");
		});

		it("should check for unauthorized response", async () => {
			const mockResponse = {
				useTenantSwitcher: false,
				currentTenantId: null,
				baseDomain: null,
				tenants: [],
			};

			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
				ok: true,
				json: async () => mockResponse,
			});

			const client = createTenantClient("http://localhost:8080", mockAuth);
			await client.listTenants();

			expect(mockAuth.checkUnauthorized).toHaveBeenCalled();
		});

		it("should handle tenant switcher disabled response", async () => {
			const mockResponse = {
				useTenantSwitcher: false,
				currentTenantId: null,
				baseDomain: null,
				tenants: [],
			};

			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
				ok: true,
				json: async () => mockResponse,
			});

			const client = createTenantClient("http://localhost:8080", mockAuth);
			const result = await client.listTenants();

			expect(result.useTenantSwitcher).toBe(false);
			expect(result.tenants).toEqual([]);
		});

		it("should work when checkUnauthorized is not provided", async () => {
			// Create auth without checkUnauthorized property
			const authWithoutCheck = {
				authToken: undefined,
				createRequest: vi.fn((method: string, body?: unknown) => ({
					method,
					headers: body ? { "Content-Type": "application/json" } : {},
					body: body ? JSON.stringify(body) : null,
					credentials: "include" as RequestCredentials,
				})),
			} as ClientAuth;

			const mockResponse = {
				useTenantSwitcher: true,
				currentTenantId: "tenant-1",
				baseDomain: "jolli.app",
				tenants: [],
			};

			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
				ok: true,
				json: async () => mockResponse,
			});

			const client = createTenantClient("http://localhost:8080", authWithoutCheck);
			const result = await client.listTenants();

			expect(result).toEqual(mockResponse);
		});
	});
});
