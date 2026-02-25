import type { JobDefinition, QueueJobRequest } from "../types/JobTypes";
import type { JobScheduler } from "./JobScheduler";
import { createTenantOrgJobScheduler } from "./TenantOrgJobScheduler";
import type { Org, Tenant } from "jolli-common";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

describe("TenantOrgJobScheduler", () => {
	const mockTenant: Tenant = {
		id: "tenant-1",
		slug: "test-tenant",
		displayName: "Test Tenant",
		status: "active",
		deploymentType: "shared",
		databaseProviderId: "default",
		configs: {},
		configsUpdatedAt: null,
		featureFlags: {},
		primaryDomain: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		provisionedAt: new Date(),
	};

	const mockOrg: Org = {
		id: "org-1",
		tenantId: "tenant-1",
		slug: "test-org",
		displayName: "Test Org",
		schemaName: "public",
		isDefault: true,
		status: "active",
		createdAt: new Date(),
		updatedAt: new Date(),
	};

	function createMockScheduler(): JobScheduler {
		return {
			start: vi.fn().mockResolvedValue(undefined),
			stop: vi.fn().mockResolvedValue(undefined),
			registerJob: vi.fn(),
			queueJob: vi.fn().mockResolvedValue({ jobId: "job-123" }),
			getJobExecution: vi.fn().mockResolvedValue(undefined),
			getEventEmitter: vi.fn().mockReturnValue({
				on: vi.fn(),
				off: vi.fn(),
				emit: vi.fn(),
			}),
		} as unknown as JobScheduler;
	}

	it("should expose tenant and org properties", () => {
		const mockScheduler = createMockScheduler();
		const tenantOrgScheduler = createTenantOrgJobScheduler({
			tenant: mockTenant,
			org: mockOrg,
			scheduler: mockScheduler,
		});

		expect(tenantOrgScheduler.tenant).toBe(mockTenant);
		expect(tenantOrgScheduler.org).toBe(mockOrg);
		expect(tenantOrgScheduler.scheduler).toBe(mockScheduler);
	});

	it("should delegate queueJob to underlying scheduler", async () => {
		const mockScheduler = createMockScheduler();
		const tenantOrgScheduler = createTenantOrgJobScheduler({
			tenant: mockTenant,
			org: mockOrg,
			scheduler: mockScheduler,
		});

		const request: QueueJobRequest = {
			name: "test-job",
			params: { foo: "bar" },
		};

		const result = await tenantOrgScheduler.queueJob(request);

		expect(mockScheduler.queueJob).toHaveBeenCalledWith(request);
		expect(result).toEqual({ jobId: "job-123" });
	});

	it("should delegate registerJob to underlying scheduler", () => {
		const mockScheduler = createMockScheduler();
		const tenantOrgScheduler = createTenantOrgJobScheduler({
			tenant: mockTenant,
			org: mockOrg,
			scheduler: mockScheduler,
		});

		const definition: JobDefinition = {
			name: "test-job",
			description: "Test job",
			category: "test",
			schema: z.object({}),
			handler: vi.fn(),
		};

		tenantOrgScheduler.registerJob(definition);

		expect(mockScheduler.registerJob).toHaveBeenCalledWith(definition);
	});

	it("should delegate start to underlying scheduler", async () => {
		const mockScheduler = createMockScheduler();
		const tenantOrgScheduler = createTenantOrgJobScheduler({
			tenant: mockTenant,
			org: mockOrg,
			scheduler: mockScheduler,
		});

		await tenantOrgScheduler.start();

		expect(mockScheduler.start).toHaveBeenCalled();
	});

	it("should delegate getJobExecution to underlying scheduler", async () => {
		const mockScheduler = createMockScheduler();
		const mockExecution = { id: "job-456", state: "completed" };
		vi.mocked(mockScheduler.getJobExecution).mockResolvedValue(mockExecution as never);

		const tenantOrgScheduler = createTenantOrgJobScheduler({
			tenant: mockTenant,
			org: mockOrg,
			scheduler: mockScheduler,
		});

		const result = await tenantOrgScheduler.getJobExecution("job-456");

		expect(mockScheduler.getJobExecution).toHaveBeenCalledWith("job-456");
		expect(result).toBe(mockExecution);
	});

	it("should delegate stop to underlying scheduler", async () => {
		const mockScheduler = createMockScheduler();
		const tenantOrgScheduler = createTenantOrgJobScheduler({
			tenant: mockTenant,
			org: mockOrg,
			scheduler: mockScheduler,
		});

		await tenantOrgScheduler.stop();

		expect(mockScheduler.stop).toHaveBeenCalled();
	});
});
