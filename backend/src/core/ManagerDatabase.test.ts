import { createManagerDatabase, getGlobalManagerDatabase, setGlobalManagerDatabase } from "./ManagerDatabase";
import type { Sequelize } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("ManagerDatabase", () => {
	let mockSequelize: Sequelize;

	beforeEach(() => {
		mockSequelize = {
			define: vi.fn().mockReturnValue({
				name: "MockModel",
			}),
			sync: vi.fn().mockResolvedValue(undefined),
			query: vi.fn().mockResolvedValue(undefined),
			models: {},
			fn: vi.fn((fnName: string, ...args: Array<unknown>) => ({ fn: fnName, args })),
		} as unknown as Sequelize;
	});

	describe("createManagerDatabase", () => {
		it("should create all DAOs", () => {
			const managerDb = createManagerDatabase(mockSequelize);

			expect(managerDb.globalUserDao).toBeDefined();
			expect(managerDb.globalAuthDao).toBeDefined();
			expect(managerDb.userOrgDao).toBeDefined();
			expect(managerDb.verificationDao).toBeDefined();
			expect(managerDb.passwordHistoryDao).toBeDefined();
			expect(managerDb.sequelize).toBe(mockSequelize);
		});

		it("should not sync models (Manager app owns schema lifecycle)", () => {
			createManagerDatabase(mockSequelize);

			// Backend no longer syncs - Manager app owns table creation
			expect(mockSequelize.sync).not.toHaveBeenCalled();
		});

		it("should define indexes via model options", () => {
			createManagerDatabase(mockSequelize);

			// Verify models are defined with indexes option
			const defineCalls = vi.mocked(mockSequelize.define).mock.calls;
			expect(defineCalls.length).toBeGreaterThan(0);

			// Check that at least one model has indexes defined
			const hasIndexes = defineCalls.some(call => {
				const options = call[2] as { indexes?: Array<unknown> } | undefined;
				return options?.indexes !== undefined;
			});
			expect(hasIndexes).toBe(true);
		});
	});

	describe("Global ManagerDatabase singleton", () => {
		it("should set and get global manager database", () => {
			const managerDb = createManagerDatabase(mockSequelize);

			setGlobalManagerDatabase(managerDb);
			const retrieved = getGlobalManagerDatabase();

			expect(retrieved).toBe(managerDb);
			expect(retrieved?.globalUserDao).toBeDefined();
			expect(retrieved?.globalAuthDao).toBeDefined();
			expect(retrieved?.sequelize).toBe(mockSequelize);
		});

		it("should return null when global manager database not initialized", () => {
			// Reset to null
			setGlobalManagerDatabase(null as never);
			const result = getGlobalManagerDatabase();
			expect(result).toBeNull();
		});

		it("should allow overwriting the global manager database", () => {
			const managerDb1 = createManagerDatabase(mockSequelize);
			const managerDb2 = createManagerDatabase(mockSequelize);

			setGlobalManagerDatabase(managerDb1);
			expect(getGlobalManagerDatabase()).toBe(managerDb1);

			setGlobalManagerDatabase(managerDb2);
			expect(getGlobalManagerDatabase()).toBe(managerDb2);
			expect(getGlobalManagerDatabase()).not.toBe(managerDb1);
		});

		it("should initialize all DAOs with correct structure", () => {
			const managerDb = createManagerDatabase(mockSequelize);

			// Verify all required DAOs are present
			expect(managerDb.globalUserDao).toBeDefined();
			expect(managerDb.globalAuthDao).toBeDefined();
			expect(managerDb.userOrgDao).toBeDefined();
			expect(managerDb.verificationDao).toBeDefined();
			expect(managerDb.passwordHistoryDao).toBeDefined();

			// Verify DAOs are objects (not null/undefined)
			expect(typeof managerDb.globalUserDao).toBe("object");
			expect(typeof managerDb.globalAuthDao).toBe("object");
			expect(typeof managerDb.userOrgDao).toBe("object");
			expect(typeof managerDb.verificationDao).toBe("object");
			expect(typeof managerDb.passwordHistoryDao).toBe("object");
		});

		it("should maintain sequelize reference", () => {
			const managerDb = createManagerDatabase(mockSequelize);

			expect(managerDb.sequelize).toBe(mockSequelize);
			expect(managerDb.sequelize).toBeDefined();
		});
	});
});
