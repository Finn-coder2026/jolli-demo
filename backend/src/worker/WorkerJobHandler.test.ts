import * as TenantContextModule from "../tenant/TenantContext";
import type { JobContext } from "../types/JobTypes";
// Import from index to ensure it's covered
import * as WorkerModule from "./index";
import { getJobConfig, logJobExecutionContext, validateTenantContext, wrapJobHandler } from "./WorkerJobHandler";
import type { Org, Tenant } from "jolli-common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock TenantContext module
vi.mock("../tenant/TenantContext", async () => {
	const actual = await vi.importActual<typeof import("../tenant/TenantContext")>("../tenant/TenantContext");
	return {
		...actual,
		getTenantContext: vi.fn(),
	};
});

// Mock Config
vi.mock("../config/Config", () => ({
	getConfig: vi.fn(() => ({
		ANTHROPIC_API_KEY: "test-key",
		E2B_API_KEY: "e2b-key",
	})),
}));

describe("Worker module exports", () => {
	it("should export all worker utilities from index", () => {
		expect(WorkerModule.startWorkerPolling).toBeDefined();
		expect(WorkerModule.validateTenantContext).toBeDefined();
		expect(WorkerModule.getJobConfig).toBeDefined();
		expect(WorkerModule.logJobExecutionContext).toBeDefined();
		expect(WorkerModule.wrapJobHandler).toBeDefined();
	});
});

describe("WorkerJobHandler", () => {
	const now = new Date();

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
		createdAt: now,
		updatedAt: now,
		provisionedAt: now,
	};

	const mockOrg: Org = {
		id: "org-1",
		tenantId: "tenant-1",
		slug: "test-org",
		displayName: "Test Org",
		schemaName: "public",
		isDefault: true,
		status: "active",
		createdAt: now,
		updatedAt: now,
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe("validateTenantContext", () => {
		it("should not throw when context matches expected tenant and org", () => {
			vi.mocked(TenantContextModule.getTenantContext).mockReturnValue({
				tenant: mockTenant,
				org: mockOrg,
				schemaName: mockOrg.schemaName,
				database: {} as never,
			});

			expect(() => validateTenantContext(mockTenant, mockOrg)).not.toThrow();
		});

		it("should warn when no tenant context is set", () => {
			vi.mocked(TenantContextModule.getTenantContext).mockReturnValue(undefined);

			// Should not throw, just log warning
			expect(() => validateTenantContext(mockTenant, mockOrg)).not.toThrow();
		});

		it("should warn when tenant context has different tenant", () => {
			const differentTenant: Tenant = {
				...mockTenant,
				id: "tenant-2",
			};

			vi.mocked(TenantContextModule.getTenantContext).mockReturnValue({
				tenant: differentTenant,
				org: mockOrg,
				schemaName: mockOrg.schemaName,
				database: {} as never,
			});

			// Should not throw, just log warning
			expect(() => validateTenantContext(mockTenant, mockOrg)).not.toThrow();
		});

		it("should warn when tenant context has different org", () => {
			const differentOrg: Org = {
				...mockOrg,
				id: "org-2",
			};

			vi.mocked(TenantContextModule.getTenantContext).mockReturnValue({
				tenant: mockTenant,
				org: differentOrg,
				schemaName: differentOrg.schemaName,
				database: {} as never,
			});

			// Should not throw, just log warning
			expect(() => validateTenantContext(mockTenant, mockOrg)).not.toThrow();
		});
	});

	describe("getJobConfig", () => {
		it("should return the current configuration", () => {
			const config = getJobConfig();

			expect(config.ANTHROPIC_API_KEY).toBe("test-key");
			expect(config.E2B_API_KEY).toBe("e2b-key");
		});
	});

	describe("logJobExecutionContext", () => {
		it("should log job execution context without throwing", () => {
			// Should not throw
			expect(() => logJobExecutionContext("test-job", mockTenant, mockOrg)).not.toThrow();
		});
	});

	describe("wrapJobHandler", () => {
		it("should wrap a job handler and log execution context", async () => {
			vi.mocked(TenantContextModule.getTenantContext).mockReturnValue({
				tenant: mockTenant,
				org: mockOrg,
				schemaName: mockOrg.schemaName,
				database: {} as never,
			});

			const originalHandler = vi.fn();
			const wrappedHandler = wrapJobHandler(originalHandler);

			const mockContext: JobContext = {
				jobId: "job-123",
				jobName: "test-job",
				emitEvent: vi.fn(),
				log: vi.fn(),
				updateStats: vi.fn(),
				setCompletionInfo: vi.fn(),
			};

			await wrappedHandler({ foo: "bar" }, mockContext);

			expect(originalHandler).toHaveBeenCalledWith({ foo: "bar" }, mockContext);
		});

		it("should call original handler even without tenant context", async () => {
			vi.mocked(TenantContextModule.getTenantContext).mockReturnValue(undefined);

			const originalHandler = vi.fn();
			const wrappedHandler = wrapJobHandler(originalHandler);

			const mockContext: JobContext = {
				jobId: "job-123",
				jobName: "test-job",
				emitEvent: vi.fn(),
				log: vi.fn(),
				updateStats: vi.fn(),
				setCompletionInfo: vi.fn(),
			};

			await wrappedHandler({ foo: "bar" }, mockContext);

			expect(originalHandler).toHaveBeenCalledWith({ foo: "bar" }, mockContext);
		});

		it("should propagate errors from the original handler", async () => {
			vi.mocked(TenantContextModule.getTenantContext).mockReturnValue(undefined);

			const error = new Error("Handler failed");
			const originalHandler = vi.fn().mockRejectedValue(error);
			const wrappedHandler = wrapJobHandler(originalHandler);

			const mockContext: JobContext = {
				jobId: "job-123",
				jobName: "test-job",
				emitEvent: vi.fn(),
				log: vi.fn(),
				updateStats: vi.fn(),
				setCompletionInfo: vi.fn(),
			};

			await expect(wrappedHandler({ foo: "bar" }, mockContext)).rejects.toThrow("Handler failed");
		});
	});
});
