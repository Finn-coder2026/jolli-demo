import type { ClientAuth } from "./Client";
import { createOrgClient } from "./OrgClient";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("OrgClient", () => {
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

	describe("getCurrent", () => {
		it("should fetch current org context", async () => {
			const mockResponse = {
				tenant: {
					id: "tenant-123",
					slug: "test-tenant",
					displayName: "Test Tenant",
				},
				org: {
					id: "org-123",
					slug: "engineering",
					displayName: "Engineering",
					schemaName: "org_engineering",
				},
				availableOrgs: [],
			};

			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
				ok: true,
				json: async () => mockResponse,
			});

			const client = createOrgClient("http://localhost:8080", mockAuth);
			const result = await client.getCurrent();

			expect(global.fetch).toHaveBeenCalledWith(
				"http://localhost:8080/api/org/current",
				expect.objectContaining({ method: "GET" }),
			);
			expect(result).toEqual(mockResponse);
		});

		it("should throw error when getCurrent fails", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
				ok: false,
				status: 500,
			});

			const client = createOrgClient("http://localhost:8080", mockAuth);

			await expect(client.getCurrent()).rejects.toThrow("Failed to get current org: 500");
		});
	});

	describe("listOrgs", () => {
		it("should fetch list of orgs", async () => {
			const mockResponse = {
				orgs: [
					{
						id: "org-1",
						tenantId: "tenant-123",
						slug: "engineering",
						displayName: "Engineering",
						schemaName: "org_engineering",
						status: "active",
						isDefault: true,
						createdAt: new Date("2024-01-01").toISOString(),
					},
					{
						id: "org-2",
						tenantId: "tenant-123",
						slug: "marketing",
						displayName: "Marketing",
						schemaName: "org_marketing",
						status: "active",
						isDefault: false,
						createdAt: new Date("2024-01-01").toISOString(),
					},
				],
			};

			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
				ok: true,
				json: async () => mockResponse,
			});

			const client = createOrgClient("http://localhost:8080", mockAuth);
			const result = await client.listOrgs();

			expect(global.fetch).toHaveBeenCalledWith(
				"http://localhost:8080/api/org/list",
				expect.objectContaining({ method: "GET" }),
			);
			expect(result.orgs).toHaveLength(2);
			expect(result.orgs[0].slug).toBe("engineering");
			expect(result.orgs[1].slug).toBe("marketing");
		});

		it("should throw error when listOrgs fails", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
				ok: false,
				status: 403,
			});

			const client = createOrgClient("http://localhost:8080", mockAuth);

			await expect(client.listOrgs()).rejects.toThrow("Failed to list orgs: 403");
		});
	});

	describe("checkUnauthorized callback", () => {
		it("should call checkUnauthorized for getCurrent", async () => {
			const mockResponse = { ok: true, json: async () => ({ tenant: null, org: null, availableOrgs: [] }) };
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

			const client = createOrgClient("http://localhost:8080", mockAuth);
			await client.getCurrent();

			expect(mockAuth.checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});

		it("should call checkUnauthorized for listOrgs", async () => {
			const mockResponse = { ok: true, json: async () => ({ orgs: [] }) };
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

			const client = createOrgClient("http://localhost:8080", mockAuth);
			await client.listOrgs();

			expect(mockAuth.checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});
	});
});
