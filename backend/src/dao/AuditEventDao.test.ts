import type { AuditEvent, NewAuditEvent } from "../model/AuditEvent";
import type { TenantOrgContext } from "../tenant/TenantContext";
import type { ModelDef } from "../util/ModelDef";
import { type AuditEventDao, createAuditEventDao, createAuditEventDaoProvider } from "./AuditEventDao";
import { mockAuditEventDao } from "./AuditEventDao.mock";
import type { Sequelize } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

function createTestEvent(overrides?: Partial<NewAuditEvent>): NewAuditEvent {
	return {
		timestamp: new Date("2024-01-15T10:30:00Z"),
		actorId: 1,
		actorType: "user",
		actorEmail: "test@example.com",
		actorIp: "127.0.0.1",
		actorDevice: "Mozilla/5.0 Test Browser",
		action: "create",
		resourceType: "doc",
		resourceId: "doc-123",
		resourceName: "Test Document",
		changes: null,
		metadata: null,
		...overrides,
	};
}

function createTestAuditEvent(overrides?: Partial<AuditEvent>): AuditEvent {
	return {
		id: 1,
		timestamp: new Date("2024-01-15T10:30:00Z"),
		actorId: 1,
		actorType: "user",
		actorEmail: "test@example.com",
		actorIp: "127.0.0.1",
		actorDevice: "Mozilla/5.0 Test Browser",
		action: "create",
		resourceType: "doc",
		resourceId: "doc-123",
		resourceName: "Test Document",
		changes: null,
		metadata: null,
		eventHash: "testhash123",
		createdAt: new Date("2024-01-15T10:30:00Z"),
		...overrides,
	};
}

describe("AuditEventDao", () => {
	let mockAuditEvents: ModelDef<AuditEvent>;
	let auditEventDao: AuditEventDao;

	beforeEach(() => {
		mockAuditEvents = {
			create: vi.fn(),
			bulkCreate: vi.fn(),
			findByPk: vi.fn(),
			findAll: vi.fn(),
			count: vi.fn(),
			destroy: vi.fn(),
		} as unknown as ModelDef<AuditEvent>;

		const mockSequelize = {
			define: vi.fn().mockReturnValue(mockAuditEvents),
		} as unknown as Sequelize;

		auditEventDao = createAuditEventDao(mockSequelize);
	});

	describe("create", () => {
		it("should create an audit event with computed hash", async () => {
			const newEvent = createTestEvent();
			const createdEvent = createTestAuditEvent();

			vi.mocked(mockAuditEvents.create).mockResolvedValue({
				get: () => createdEvent,
			} as never);

			const result = await auditEventDao.create(newEvent);

			expect(mockAuditEvents.create).toHaveBeenCalledWith(
				expect.objectContaining({
					...newEvent,
					eventHash: expect.any(String),
				}),
			);
			expect(result).toEqual(createdEvent);
		});
	});

	describe("createBatch", () => {
		it("should create multiple events with hashes", async () => {
			const events = [createTestEvent({ resourceId: "doc-1" }), createTestEvent({ resourceId: "doc-2" })];

			vi.mocked(mockAuditEvents.bulkCreate).mockResolvedValue([] as never);

			await auditEventDao.createBatch(events);

			expect(mockAuditEvents.bulkCreate).toHaveBeenCalledWith(
				expect.arrayContaining([
					expect.objectContaining({ resourceId: "doc-1", eventHash: expect.any(String) }),
					expect.objectContaining({ resourceId: "doc-2", eventHash: expect.any(String) }),
				]),
			);
		});

		it("should handle empty array without calling bulkCreate", async () => {
			await auditEventDao.createBatch([]);

			expect(mockAuditEvents.bulkCreate).not.toHaveBeenCalled();
		});
	});

	describe("getById", () => {
		it("should return event when found", async () => {
			const event = createTestAuditEvent();
			vi.mocked(mockAuditEvents.findByPk).mockResolvedValue({
				get: () => event,
			} as never);

			const result = await auditEventDao.getById(1);

			expect(mockAuditEvents.findByPk).toHaveBeenCalledWith(1);
			expect(result).toEqual(event);
		});

		it("should return undefined when not found", async () => {
			vi.mocked(mockAuditEvents.findByPk).mockResolvedValue(null as never);

			const result = await auditEventDao.getById(99999);

			expect(result).toBeUndefined();
		});
	});

	describe("getByResource", () => {
		it("should query by resource type and id", async () => {
			const events = [createTestAuditEvent()];
			vi.mocked(mockAuditEvents.findAll).mockResolvedValue(events.map(e => ({ get: () => e })) as never);

			const result = await auditEventDao.getByResource("doc", "doc-123");

			expect(mockAuditEvents.findAll).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { resourceType: "doc", resourceId: "doc-123" },
				}),
			);
			expect(result).toEqual(events);
		});

		it("should apply query options", async () => {
			vi.mocked(mockAuditEvents.findAll).mockResolvedValue([] as never);

			await auditEventDao.getByResource("doc", "doc-123", {
				limit: 10,
				offset: 5,
				orderBy: "id",
				orderDir: "ASC",
			});

			expect(mockAuditEvents.findAll).toHaveBeenCalledWith(
				expect.objectContaining({
					limit: 10,
					offset: 5,
					order: [["id", "ASC"]],
				}),
			);
		});
	});

	describe("getByActor", () => {
		it("should query by actor id", async () => {
			const events = [createTestAuditEvent()];
			vi.mocked(mockAuditEvents.findAll).mockResolvedValue(events.map(e => ({ get: () => e })) as never);

			const result = await auditEventDao.getByActor(1);

			expect(mockAuditEvents.findAll).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { actorId: 1 },
				}),
			);
			expect(result).toEqual(events);
		});
	});

	describe("getByAction", () => {
		it("should query by action type", async () => {
			const events = [createTestAuditEvent()];
			vi.mocked(mockAuditEvents.findAll).mockResolvedValue(events.map(e => ({ get: () => e })) as never);

			const result = await auditEventDao.getByAction("create");

			expect(mockAuditEvents.findAll).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { action: "create" },
				}),
			);
			expect(result).toEqual(events);
		});
	});

	describe("getByDateRange", () => {
		it("should query by date range", async () => {
			const startDate = new Date("2024-01-01");
			const endDate = new Date("2024-01-31");
			const events = [createTestAuditEvent()];
			vi.mocked(mockAuditEvents.findAll).mockResolvedValue(events.map(e => ({ get: () => e })) as never);

			const result = await auditEventDao.getByDateRange(startDate, endDate);

			expect(mockAuditEvents.findAll).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({
						timestamp: expect.any(Object),
					}),
				}),
			);
			expect(result).toEqual(events);
		});
	});

	describe("query", () => {
		it("should build where clause from filters", async () => {
			const events = [createTestAuditEvent()];
			vi.mocked(mockAuditEvents.findAll).mockResolvedValue(events.map(e => ({ get: () => e })) as never);

			const result = await auditEventDao.query({
				actorId: 1,
				action: "create",
				resourceType: "doc",
				resourceId: "doc-123",
			});

			expect(mockAuditEvents.findAll).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({
						actorId: 1,
						action: "create",
						resourceType: "doc",
						resourceId: "doc-123",
					}),
				}),
			);
			expect(result).toEqual(events);
		});

		it("should handle date range in filters", async () => {
			vi.mocked(mockAuditEvents.findAll).mockResolvedValue([] as never);

			await auditEventDao.query({
				startDate: new Date("2024-01-01"),
				endDate: new Date("2024-01-31"),
			});

			expect(mockAuditEvents.findAll).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({
						timestamp: expect.any(Object),
					}),
				}),
			);
		});

		it("should apply pagination options", async () => {
			vi.mocked(mockAuditEvents.findAll).mockResolvedValue([] as never);

			await auditEventDao.query({
				limit: 20,
				offset: 10,
				orderBy: "timestamp",
				orderDir: "DESC",
			});

			expect(mockAuditEvents.findAll).toHaveBeenCalledWith(
				expect.objectContaining({
					limit: 20,
					offset: 10,
					order: [["timestamp", "DESC"]],
				}),
			);
		});
	});

	describe("count", () => {
		it("should count all events when no filters", async () => {
			vi.mocked(mockAuditEvents.count).mockResolvedValue(42 as never);

			const result = await auditEventDao.count();

			expect(mockAuditEvents.count).toHaveBeenCalledWith({ where: {} });
			expect(result).toBe(42);
		});

		it("should count with filters", async () => {
			vi.mocked(mockAuditEvents.count).mockResolvedValue(10 as never);

			const result = await auditEventDao.count({ action: "create" });

			expect(mockAuditEvents.count).toHaveBeenCalledWith({
				where: { action: "create" },
			});
			expect(result).toBe(10);
		});
	});

	describe("verifyEventIntegrity", () => {
		it("should return false when event not found", async () => {
			vi.mocked(mockAuditEvents.findByPk).mockResolvedValue(null as never);

			const result = await auditEventDao.verifyEventIntegrity(99999);

			expect(result).toBe(false);
		});

		it("should return true when hash matches", async () => {
			// Create an event and compute its hash
			const event = createTestEvent();
			// Use the same hash computation logic
			const { createHash } = await import("node:crypto");
			const payload = JSON.stringify({
				timestamp: event.timestamp.toISOString(),
				actorId: event.actorId,
				actorType: event.actorType,
				action: event.action,
				resourceType: event.resourceType,
				resourceId: event.resourceId,
				changes: event.changes,
			});
			const expectedHash = createHash("sha256").update(payload).digest("hex");

			const storedEvent = createTestAuditEvent({
				...event,
				eventHash: expectedHash,
			});

			vi.mocked(mockAuditEvents.findByPk).mockResolvedValue({
				get: () => storedEvent,
			} as never);

			const result = await auditEventDao.verifyEventIntegrity(1);

			expect(result).toBe(true);
		});

		it("should return false when hash does not match", async () => {
			const storedEvent = createTestAuditEvent({
				eventHash: "tampered-hash",
			});

			vi.mocked(mockAuditEvents.findByPk).mockResolvedValue({
				get: () => storedEvent,
			} as never);

			const result = await auditEventDao.verifyEventIntegrity(1);

			expect(result).toBe(false);
		});
	});

	describe("deleteOlderThan", () => {
		it("should delete events older than specified days", async () => {
			vi.mocked(mockAuditEvents.destroy).mockResolvedValue(5 as never);

			const result = await auditEventDao.deleteOlderThan(30);

			expect(mockAuditEvents.destroy).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({
						timestamp: expect.any(Object),
					}),
				}),
			);
			expect(result).toBe(5);
		});
	});
});

describe("AuditEventDao (mock)", () => {
	describe("create", () => {
		it("should create an audit event and return it with id", async () => {
			const dao = mockAuditEventDao();
			const event = createTestEvent();
			const created = await dao.create(event);

			expect(created.id).toBeDefined();
			expect(created.id).toBeGreaterThan(0);
			expect(created.action).toBe("create");
			expect(created.resourceType).toBe("doc");
			expect(created.resourceId).toBe("doc-123");
		});
	});

	describe("createBatch", () => {
		it("should create multiple events in a batch", async () => {
			const dao = mockAuditEventDao();
			const events = [
				createTestEvent({ resourceId: "doc-1" }),
				createTestEvent({ resourceId: "doc-2" }),
				createTestEvent({ resourceId: "doc-3" }),
			];

			await dao.createBatch(events);

			const count = await dao.count();
			expect(count).toBe(3);
		});

		it("should handle empty array", async () => {
			const dao = mockAuditEventDao();
			await dao.createBatch([]);
			const count = await dao.count();
			expect(count).toBe(0);
		});
	});

	describe("getById", () => {
		it("should return event by id", async () => {
			const dao = mockAuditEventDao();
			const event = createTestEvent();
			const created = await dao.create(event);

			const found = await dao.getById(created.id);

			expect(found).toBeDefined();
			expect(found?.id).toBe(created.id);
			expect(found?.resourceId).toBe("doc-123");
		});

		it("should return undefined for non-existent id", async () => {
			const dao = mockAuditEventDao();
			const found = await dao.getById(99999);
			expect(found).toBeUndefined();
		});
	});

	describe("getByResource", () => {
		it("should return events for a specific resource", async () => {
			const dao = mockAuditEventDao();
			await dao.create(createTestEvent({ resourceType: "doc", resourceId: "doc-1" }));
			await dao.create(createTestEvent({ resourceType: "doc", resourceId: "doc-1" }));
			await dao.create(createTestEvent({ resourceType: "doc", resourceId: "doc-2" }));

			const events = await dao.getByResource("doc", "doc-1");

			expect(events.length).toBe(2);
			expect(events.every(e => e.resourceId === "doc-1")).toBe(true);
		});
	});

	describe("getByActor", () => {
		it("should return events for a specific actor", async () => {
			const dao = mockAuditEventDao();
			await dao.create(createTestEvent({ actorId: 1 }));
			await dao.create(createTestEvent({ actorId: 1 }));
			await dao.create(createTestEvent({ actorId: 2 }));

			const events = await dao.getByActor(1);

			expect(events.length).toBe(2);
			expect(events.every(e => e.actorId === 1)).toBe(true);
		});
	});

	describe("getByAction", () => {
		it("should return events for a specific action", async () => {
			const dao = mockAuditEventDao();
			await dao.create(createTestEvent({ action: "create" }));
			await dao.create(createTestEvent({ action: "update" }));
			await dao.create(createTestEvent({ action: "delete" }));

			const events = await dao.getByAction("create");

			expect(events.length).toBe(1);
			expect(events[0].action).toBe("create");
		});
	});

	describe("getByDateRange", () => {
		it("should return events within date range", async () => {
			const dao = mockAuditEventDao();
			const now = new Date();
			const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
			const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

			await dao.create(createTestEvent({ timestamp: now }));

			const events = await dao.getByDateRange(yesterday, tomorrow);

			expect(events.length).toBe(1);
		});
	});

	describe("query", () => {
		it("should filter by multiple criteria", async () => {
			const dao = mockAuditEventDao();
			await dao.create(createTestEvent({ actorId: 1, action: "create", resourceType: "doc" }));
			await dao.create(createTestEvent({ actorId: 1, action: "update", resourceType: "doc" }));
			await dao.create(createTestEvent({ actorId: 2, action: "create", resourceType: "doc" }));

			const events = await dao.query({
				actorId: 1,
				action: "create",
			});

			expect(events.length).toBe(1);
			expect(events[0].actorId).toBe(1);
			expect(events[0].action).toBe("create");
		});

		it("should support pagination", async () => {
			const dao = mockAuditEventDao();
			for (let i = 0; i < 10; i++) {
				await dao.create(createTestEvent({ resourceId: `doc-${i}` }));
			}

			const page1 = await dao.query({ limit: 3, offset: 0 });
			const page2 = await dao.query({ limit: 3, offset: 3 });

			expect(page1.length).toBe(3);
			expect(page2.length).toBe(3);
		});
	});

	describe("count", () => {
		it("should count all events", async () => {
			const dao = mockAuditEventDao();
			await dao.create(createTestEvent());
			await dao.create(createTestEvent());
			await dao.create(createTestEvent());

			const count = await dao.count();

			expect(count).toBe(3);
		});

		it("should count with filters", async () => {
			const dao = mockAuditEventDao();
			await dao.create(createTestEvent({ action: "create" }));
			await dao.create(createTestEvent({ action: "create" }));
			await dao.create(createTestEvent({ action: "update" }));

			const count = await dao.count({ action: "create" });

			expect(count).toBe(2);
		});
	});

	describe("verifyEventIntegrity", () => {
		it("should return true (mock always returns true)", async () => {
			const dao = mockAuditEventDao();
			const isValid = await dao.verifyEventIntegrity(1);
			expect(isValid).toBe(true);
		});
	});

	describe("deleteOlderThan", () => {
		it("should return 0 (mock always returns 0)", async () => {
			const dao = mockAuditEventDao();
			const deleted = await dao.deleteOlderThan(30);
			expect(deleted).toBe(0);
		});
	});
});

describe("createAuditEventDaoProvider", () => {
	it("should return default DAO when no context", () => {
		const mockDao = { name: "default" } as unknown as AuditEventDao;

		const provider = createAuditEventDaoProvider(mockDao);
		const dao = provider.getDao(undefined);

		expect(dao).toBe(mockDao);
	});

	it("should return context DAO when available", () => {
		const defaultDao = { name: "default" } as unknown as AuditEventDao;
		const contextDao = { name: "context" } as unknown as AuditEventDao;

		const provider = createAuditEventDaoProvider(defaultDao);
		const context = {
			database: { auditEventDao: contextDao },
		};

		const dao = provider.getDao(context as TenantOrgContext);

		expect(dao).toBe(contextDao);
	});
});

describe("AuditEventDao postSync", () => {
	const mockDb = {} as never;

	it("should have a postSync hook", () => {
		const mockAuditEvents = {
			create: vi.fn(),
			bulkCreate: vi.fn(),
			findByPk: vi.fn(),
			findAll: vi.fn(),
			count: vi.fn(),
			destroy: vi.fn(),
		} as unknown as ModelDef<AuditEvent>;

		const mockSequelize = {
			define: vi.fn().mockReturnValue(mockAuditEvents),
		} as unknown as Sequelize;

		const dao = createAuditEventDao(mockSequelize);

		// Verify postSync exists and is a function
		expect(typeof dao.postSync).toBe("function");
	});

	it("should call postSync without throwing when partitioning check fails", async () => {
		const mockAuditEvents = {
			create: vi.fn(),
			bulkCreate: vi.fn(),
			findByPk: vi.fn(),
			findAll: vi.fn(),
			count: vi.fn(),
			destroy: vi.fn(),
		} as unknown as ModelDef<AuditEvent>;

		const mockSequelize = {
			define: vi.fn().mockReturnValue(mockAuditEvents),
			query: vi.fn().mockRejectedValue(new Error("Test error")),
		} as unknown as Sequelize;

		const dao = createAuditEventDao(mockSequelize);

		// postSync should not throw even if partitioning fails
		await expect(dao.postSync(mockSequelize, mockDb)).resolves.not.toThrow();
	});

	it("should create partitioned table when table does not exist", async () => {
		const mockAuditEvents = {
			create: vi.fn(),
			bulkCreate: vi.fn(),
			findByPk: vi.fn(),
			findAll: vi.fn(),
			count: vi.fn(),
			destroy: vi.fn(),
		} as unknown as ModelDef<AuditEvent>;

		const mockSequelize = {
			define: vi.fn().mockReturnValue(mockAuditEvents),
			query: vi
				.fn()
				// First call: table existence check - doesn't exist
				.mockResolvedValueOnce([[{ exists: false }], undefined])
				// Second call: CREATE TABLE and indexes
				.mockResolvedValueOnce([[], undefined])
				// Following calls: create partitions for current + next 2 months
				.mockResolvedValue([[{ exists: false }], undefined]),
		} as unknown as Sequelize;

		const dao = createAuditEventDao(mockSequelize);

		await dao.postSync(mockSequelize, mockDb);

		// Should have called query multiple times for setup
		expect(mockSequelize.query).toHaveBeenCalled();

		// Verify CREATE TABLE was called
		const calls = vi.mocked(mockSequelize.query).mock.calls;
		const createTableCalls = calls.filter(
			call => typeof call[0] === "string" && call[0].includes("CREATE TABLE IF NOT EXISTS audit_events"),
		);
		expect(createTableCalls.length).toBeGreaterThan(0);
	});

	it("should setup partitioning when table exists but is not yet partitioned", async () => {
		const mockAuditEvents = {
			create: vi.fn(),
			bulkCreate: vi.fn(),
			findByPk: vi.fn(),
			findAll: vi.fn(),
			count: vi.fn(),
			destroy: vi.fn(),
		} as unknown as ModelDef<AuditEvent>;

		const mockSequelize = {
			define: vi.fn().mockReturnValue(mockAuditEvents),
			query: vi
				.fn()
				// First call: table existence check - table exists
				.mockResolvedValueOnce([[{ exists: true }], undefined])
				// Second call: partition check - return empty (not partitioned)
				.mockResolvedValueOnce([[], undefined])
				// Third call: CREATE TABLE and indexes
				.mockResolvedValueOnce([[], undefined])
				// Fourth call: check if old table exists
				.mockResolvedValueOnce([[{ exists: false }], undefined])
				// Following calls: create partitions for current + next 2 months
				.mockResolvedValue([[{ exists: false }], undefined]),
		} as unknown as Sequelize;

		const dao = createAuditEventDao(mockSequelize);

		await dao.postSync(mockSequelize, mockDb);

		// Should have called query multiple times for setup
		expect(mockSequelize.query).toHaveBeenCalled();
	});

	it("should skip conversion when table is already partitioned", async () => {
		const mockAuditEvents = {
			create: vi.fn(),
			bulkCreate: vi.fn(),
			findByPk: vi.fn(),
			findAll: vi.fn(),
			count: vi.fn(),
			destroy: vi.fn(),
		} as unknown as ModelDef<AuditEvent>;

		const mockSequelize = {
			define: vi.fn().mockReturnValue(mockAuditEvents),
			query: vi
				.fn()
				// First call: table existence check - table exists
				.mockResolvedValueOnce([[{ exists: true }], undefined])
				// Second call: partition check - return existing partition (already partitioned)
				.mockResolvedValueOnce([[{ partition_name: "audit_events_2024_01" }], undefined])
				// Following calls: check if partition exists
				.mockResolvedValue([[{ exists: true }], undefined]),
		} as unknown as Sequelize;

		const dao = createAuditEventDao(mockSequelize);

		await dao.postSync(mockSequelize, mockDb);

		// Verify it was called but didn't try to create partitioned table
		const calls = vi.mocked(mockSequelize.query).mock.calls;
		const createTableCalls = calls.filter(
			call => typeof call[0] === "string" && call[0].includes("CREATE TABLE IF NOT EXISTS audit_events"),
		);
		// Should not have called CREATE TABLE for main partitioned table (only partition checks)
		expect(createTableCalls.length).toBe(0);
	});

	it("should migrate data when old table exists with data", async () => {
		const mockAuditEvents = {
			create: vi.fn(),
			bulkCreate: vi.fn(),
			findByPk: vi.fn(),
			findAll: vi.fn(),
			count: vi.fn(),
			destroy: vi.fn(),
		} as unknown as ModelDef<AuditEvent>;

		let queryCallCount = 0;
		const mockSequelize = {
			define: vi.fn().mockReturnValue(mockAuditEvents),
			query: vi.fn().mockImplementation((sql: string) => {
				queryCallCount++;
				// First call: table existence check - table exists
				if (queryCallCount === 1) {
					return Promise.resolve([[{ exists: true }], undefined]);
				}
				// Second call: partition check - not partitioned
				if (queryCallCount === 2) {
					return Promise.resolve([[], undefined]);
				}
				// Third call: CREATE TABLE and indexes
				if (queryCallCount === 3) {
					return Promise.resolve([[], undefined]);
				}
				// Fourth call: count rows in old table
				if (queryCallCount === 4) {
					return Promise.resolve([[{ count: "5" }], undefined]); // Has 5 rows
				}
				// Fifth call: get date range
				if (queryCallCount === 5) {
					return Promise.resolve([
						[
							{
								min_month: new Date("2024-01-01"),
								max_month: new Date("2024-03-01"),
							},
						],
						undefined,
					]);
				}
				// Calls for creating partitions and checking existence
				if (typeof sql === "string" && sql.includes("information_schema.tables")) {
					return Promise.resolve([[{ exists: false }], undefined]);
				}
				// Default: success
				return Promise.resolve([[], undefined]);
			}),
		} as unknown as Sequelize;

		const dao = createAuditEventDao(mockSequelize);

		await dao.postSync(mockSequelize, mockDb);

		// Verify that migration occurred
		const calls = vi.mocked(mockSequelize.query).mock.calls;

		// Should have queried for data migration
		const insertCalls = calls.filter(
			call => typeof call[0] === "string" && call[0].includes("INSERT INTO audit_events"),
		);
		expect(insertCalls.length).toBeGreaterThan(0);

		// Should have dropped old table
		const dropCalls = calls.filter(
			call => typeof call[0] === "string" && call[0].includes("DROP TABLE IF EXISTS audit_events_old"),
		);
		expect(dropCalls.length).toBeGreaterThan(0);
	});

	it("should handle old table with zero rows", async () => {
		const mockAuditEvents = {
			create: vi.fn(),
			bulkCreate: vi.fn(),
			findByPk: vi.fn(),
			findAll: vi.fn(),
			count: vi.fn(),
			destroy: vi.fn(),
		} as unknown as ModelDef<AuditEvent>;

		let queryCallCount = 0;
		const mockSequelize = {
			define: vi.fn().mockReturnValue(mockAuditEvents),
			query: vi.fn().mockImplementation((sql: string) => {
				queryCallCount++;
				// First call: table existence check - table exists
				if (queryCallCount === 1) {
					return Promise.resolve([[{ exists: true }], undefined]);
				}
				// Second call: partition check - not partitioned
				if (queryCallCount === 2) {
					return Promise.resolve([[], undefined]);
				}
				// Third call: CREATE TABLE and indexes
				if (queryCallCount === 3) {
					return Promise.resolve([[], undefined]);
				}
				// Fourth call: count rows in old table - zero rows
				if (queryCallCount === 4) {
					return Promise.resolve([[{ count: "0" }], undefined]);
				}
				// Calls for checking partition existence
				if (typeof sql === "string" && sql.includes("information_schema.tables")) {
					return Promise.resolve([[{ exists: false }], undefined]);
				}
				// Default: success
				return Promise.resolve([[], undefined]);
			}),
		} as unknown as Sequelize;

		const dao = createAuditEventDao(mockSequelize);

		await dao.postSync(mockSequelize, mockDb);

		// Verify that no data migration occurred (no INSERT)
		const calls = vi.mocked(mockSequelize.query).mock.calls;
		const insertCalls = calls.filter(
			call => typeof call[0] === "string" && call[0].includes("INSERT INTO audit_events"),
		);
		expect(insertCalls.length).toBe(0);

		// Should still drop old table
		const dropCalls = calls.filter(
			call => typeof call[0] === "string" && call[0].includes("DROP TABLE IF EXISTS audit_events_old"),
		);
		expect(dropCalls.length).toBeGreaterThan(0);
	});

	it("should create partitions for multiple months during migration", async () => {
		const mockAuditEvents = {
			create: vi.fn(),
			bulkCreate: vi.fn(),
			findByPk: vi.fn(),
			findAll: vi.fn(),
			count: vi.fn(),
			destroy: vi.fn(),
		} as unknown as ModelDef<AuditEvent>;

		let queryCallCount = 0;
		const mockSequelize = {
			define: vi.fn().mockReturnValue(mockAuditEvents),
			query: vi.fn().mockImplementation((sql: string) => {
				queryCallCount++;
				// First call: table existence check - table exists
				if (queryCallCount === 1) {
					return Promise.resolve([[{ exists: true }], undefined]);
				}
				// Second call: partition check - not partitioned
				if (queryCallCount === 2) {
					return Promise.resolve([[], undefined]);
				}
				// Third call: CREATE TABLE and indexes
				if (queryCallCount === 3) {
					return Promise.resolve([[], undefined]);
				}
				// Fourth call: count rows in old table
				if (queryCallCount === 4) {
					return Promise.resolve([[{ count: "10" }], undefined]);
				}
				// Fifth call: get date range - spanning 3 months
				if (queryCallCount === 5) {
					return Promise.resolve([
						[
							{
								min_month: new Date("2024-01-01"),
								max_month: new Date("2024-03-15"),
							},
						],
						undefined,
					]);
				}
				// Calls for checking partition existence - return false to trigger creation
				if (typeof sql === "string" && sql.includes("information_schema.tables")) {
					return Promise.resolve([[{ exists: false }], undefined]);
				}
				// Default: success
				return Promise.resolve([[], undefined]);
			}),
		} as unknown as Sequelize;

		const dao = createAuditEventDao(mockSequelize);

		await dao.postSync(mockSequelize, mockDb);

		// Verify partitions were created - should have multiple CREATE TABLE calls for partitions
		const calls = vi.mocked(mockSequelize.query).mock.calls;
		const partitionCalls = calls.filter(
			call => typeof call[0] === "string" && call[0].includes("PARTITION OF audit_events"),
		);
		// Should have created partitions for Jan, Feb, Mar from old data + current and next 2 months
		expect(partitionCalls.length).toBeGreaterThanOrEqual(3);
	});

	it("should skip partition creation when partition already exists", async () => {
		const mockAuditEvents = {
			create: vi.fn(),
			bulkCreate: vi.fn(),
			findByPk: vi.fn(),
			findAll: vi.fn(),
			count: vi.fn(),
			destroy: vi.fn(),
		} as unknown as ModelDef<AuditEvent>;

		const mockSequelize = {
			define: vi.fn().mockReturnValue(mockAuditEvents),
			query: vi
				.fn()
				// First call: table existence check - table exists
				.mockResolvedValueOnce([[{ exists: true }], undefined])
				// Second call: partition check - already partitioned
				.mockResolvedValueOnce([[{ partition_name: "audit_events_2024_01" }], undefined])
				// All partition existence checks - all exist
				.mockResolvedValue([[{ exists: true }], undefined]),
		} as unknown as Sequelize;

		const dao = createAuditEventDao(mockSequelize);

		await dao.postSync(mockSequelize, mockDb);

		// Should not have created any new partitions
		const calls = vi.mocked(mockSequelize.query).mock.calls;
		const createPartitionCalls = calls.filter(
			call => typeof call[0] === "string" && call[0].includes("PARTITION OF audit_events"),
		);
		expect(createPartitionCalls.length).toBe(0);
	});

	it("should handle null count result from old table query", async () => {
		const mockAuditEvents = {
			create: vi.fn(),
			bulkCreate: vi.fn(),
			findByPk: vi.fn(),
			findAll: vi.fn(),
			count: vi.fn(),
			destroy: vi.fn(),
		} as unknown as ModelDef<AuditEvent>;

		let queryCallCount = 0;
		const mockSequelize = {
			define: vi.fn().mockReturnValue(mockAuditEvents),
			query: vi.fn().mockImplementation((sql: string) => {
				queryCallCount++;
				// First call: table existence check - table exists
				if (queryCallCount === 1) {
					return Promise.resolve([[{ exists: true }], undefined]);
				}
				// Second call: partition check - not partitioned
				if (queryCallCount === 2) {
					return Promise.resolve([[], undefined]);
				}
				// Third call: CREATE TABLE and indexes
				if (queryCallCount === 3) {
					return Promise.resolve([[], undefined]);
				}
				// Fourth call: count rows in old table - return null/empty result
				if (queryCallCount === 4) {
					return Promise.resolve([[{}], undefined]); // No count property - tests ?? "0" fallback
				}
				// Calls for checking partition existence
				if (typeof sql === "string" && sql.includes("information_schema.tables")) {
					return Promise.resolve([[{ exists: false }], undefined]);
				}
				// Default: success
				return Promise.resolve([[], undefined]);
			}),
		} as unknown as Sequelize;

		const dao = createAuditEventDao(mockSequelize);

		await dao.postSync(mockSequelize, mockDb);

		// With null count, should not migrate any data (same as 0 rows)
		const calls = vi.mocked(mockSequelize.query).mock.calls;
		const insertCalls = calls.filter(
			call => typeof call[0] === "string" && call[0].includes("INSERT INTO audit_events"),
		);
		expect(insertCalls.length).toBe(0);

		// Should still drop old table
		const dropCalls = calls.filter(
			call => typeof call[0] === "string" && call[0].includes("DROP TABLE IF EXISTS audit_events_old"),
		);
		expect(dropCalls.length).toBeGreaterThan(0);
	});
});
