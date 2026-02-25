import { createDatabaseCheck } from "./DatabaseCheck";
import type { Sequelize } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("DatabaseCheck", () => {
	let mockSequelize: Sequelize;

	beforeEach(() => {
		mockSequelize = {
			authenticate: vi.fn(),
		} as unknown as Sequelize;
	});

	it("returns healthy with latency when connection succeeds", async () => {
		vi.mocked(mockSequelize.authenticate).mockResolvedValue(undefined);

		const check = createDatabaseCheck(mockSequelize);
		const result = await check.check();

		expect(result.status).toBe("healthy");
		expect(result.latencyMs).toBeGreaterThanOrEqual(0);
		expect(result.message).toBeUndefined();
	});

	it("returns unhealthy when connection fails", async () => {
		vi.mocked(mockSequelize.authenticate).mockRejectedValue(new Error("Connection refused"));

		const check = createDatabaseCheck(mockSequelize);
		const result = await check.check();

		expect(result.status).toBe("unhealthy");
		expect(result.latencyMs).toBeGreaterThanOrEqual(0);
		expect(result.message).toBe("Database connection failed");
	});

	it("has correct name and critical flag", () => {
		const check = createDatabaseCheck(mockSequelize);

		expect(check.name).toBe("database");
		expect(check.critical).toBe(true);
	});
});
