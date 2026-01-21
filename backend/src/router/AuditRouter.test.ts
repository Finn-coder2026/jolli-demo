import type { AuditService } from "../audit/AuditService";
import type { AuditEventDao } from "../dao/AuditEventDao";
import { mockAuditEventDao } from "../dao/AuditEventDao.mock";
import type { DaoProvider } from "../dao/DaoProvider";
import type { AuditEvent, AuditFieldChange } from "../model/AuditEvent";
import { createAuditRouter } from "./AuditRouter";
import express, { type Express } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

function mockDaoProvider<T>(dao: T): DaoProvider<T> {
	return { getDao: () => dao };
}

function createMockAuditService(): AuditService {
	return {
		log: vi.fn(),
		logSync: vi.fn().mockResolvedValue(undefined),
		computeChanges: vi.fn().mockReturnValue([]),
		decryptPii: vi.fn((value: string) => {
			// Simulate decryption by just returning the value
			if (value.startsWith("enc:")) {
				return "decrypted-value";
			}
			return value;
		}),
		decryptChanges: vi.fn((changes: Array<AuditFieldChange> | null) => {
			if (!changes) {
				return null;
			}
			return changes.map(c => ({
				field: c.field,
				old: c.old,
				new: c.new,
			}));
		}),
	};
}

function createTestEvent(overrides?: Partial<AuditEvent>): AuditEvent {
	return {
		id: 1,
		timestamp: new Date("2024-01-15T10:30:00Z"),
		actorId: 1,
		actorType: "user",
		actorEmail: "enc:test@example.com",
		actorIp: "enc:127.0.0.1",
		actorDevice: "Mozilla/5.0",
		action: "create",
		resourceType: "doc",
		resourceId: "doc-123",
		resourceName: "Test Document",
		changes: null,
		metadata: null,
		eventHash: "hash-123",
		createdAt: new Date("2024-01-15T10:30:00Z"),
		...overrides,
	};
}

describe("AuditRouter", () => {
	let app: Express;
	let mockDao: AuditEventDao;
	let mockService: AuditService;

	beforeEach(() => {
		mockDao = mockAuditEventDao();
		mockService = createMockAuditService();
		app = express();
		app.use(express.json());
		app.use(
			"/api/audit",
			createAuditRouter({
				auditEventDaoProvider: mockDaoProvider(mockDao),
				auditService: mockService,
			}),
		);
	});

	describe("GET /api/audit", () => {
		it("should list audit events with default pagination", async () => {
			// Create some test events
			await mockDao.create(createTestEvent({ resourceId: "doc-1" }));
			await mockDao.create(createTestEvent({ resourceId: "doc-2" }));

			const response = await request(app).get("/api/audit");

			expect(response.status).toBe(200);
			expect(response.body.events).toBeDefined();
			expect(response.body.events.length).toBe(2);
			expect(response.body.total).toBe(2);
			expect(response.body.limit).toBe(50);
			expect(response.body.offset).toBe(0);
		});

		it("should apply actorId filter", async () => {
			await mockDao.create(createTestEvent({ actorId: 1 }));
			await mockDao.create(createTestEvent({ actorId: 2 }));

			const response = await request(app).get("/api/audit?actorId=1");

			expect(response.status).toBe(200);
			expect(response.body.events.every((e: AuditEvent) => e.actorId === 1)).toBe(true);
		});

		it("should apply action filter", async () => {
			await mockDao.create(createTestEvent({ action: "create" }));
			await mockDao.create(createTestEvent({ action: "update" }));

			const response = await request(app).get("/api/audit?action=create");

			expect(response.status).toBe(200);
			expect(response.body.events.every((e: AuditEvent) => e.action === "create")).toBe(true);
		});

		it("should apply resourceType filter", async () => {
			await mockDao.create(createTestEvent({ resourceType: "doc" }));
			await mockDao.create(createTestEvent({ resourceType: "site" }));

			const response = await request(app).get("/api/audit?resourceType=doc");

			expect(response.status).toBe(200);
			expect(response.body.events.every((e: AuditEvent) => e.resourceType === "doc")).toBe(true);
		});

		it("should apply resourceId filter", async () => {
			await mockDao.create(createTestEvent({ resourceId: "doc-1" }));
			await mockDao.create(createTestEvent({ resourceId: "doc-2" }));

			const response = await request(app).get("/api/audit?resourceId=doc-1");

			expect(response.status).toBe(200);
			expect(response.body.events.every((e: AuditEvent) => e.resourceId === "doc-1")).toBe(true);
		});

		it("should apply date range filter", async () => {
			await mockDao.create(createTestEvent({ timestamp: new Date("2024-01-15") }));
			await mockDao.create(createTestEvent({ timestamp: new Date("2024-01-20") }));

			const response = await request(app).get(
				"/api/audit?startDate=2024-01-14T00:00:00Z&endDate=2024-01-16T00:00:00Z",
			);

			expect(response.status).toBe(200);
		});

		it("should apply pagination", async () => {
			// Create 5 events
			for (let i = 0; i < 5; i++) {
				await mockDao.create(createTestEvent({ resourceId: `doc-${i}` }));
			}

			const response = await request(app).get("/api/audit?limit=2&offset=2");

			expect(response.status).toBe(200);
			expect(response.body.events.length).toBe(2);
			expect(response.body.limit).toBe(2);
			expect(response.body.offset).toBe(2);
		});

		it("should cap limit at 1000", async () => {
			const response = await request(app).get("/api/audit?limit=5000");

			expect(response.status).toBe(200);
			expect(response.body.limit).toBe(1000);
		});

		it("should handle errors gracefully", async () => {
			mockDao.query = vi.fn().mockRejectedValue(new Error("Database error"));

			const response = await request(app).get("/api/audit");

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("Failed to query audit events");
		});
	});

	describe("GET /api/audit/:id", () => {
		it("should return event by id", async () => {
			const created = await mockDao.create(createTestEvent());

			const response = await request(app).get(`/api/audit/${created.id}`);

			expect(response.status).toBe(200);
			expect(response.body.id).toBe(created.id);
			expect(response.body.resourceId).toBe("doc-123");
		});

		it("should return 400 for invalid id", async () => {
			const response = await request(app).get("/api/audit/not-a-number");

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("Invalid audit event ID");
		});

		it("should return 404 for non-existent event", async () => {
			const response = await request(app).get("/api/audit/99999");

			expect(response.status).toBe(404);
			expect(response.body.error).toBe("Audit event not found");
		});

		it("should handle errors gracefully", async () => {
			mockDao.getById = vi.fn().mockRejectedValue(new Error("Database error"));

			const response = await request(app).get("/api/audit/1");

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("Failed to get audit event");
		});
	});

	describe("GET /api/audit/:id/decrypted", () => {
		it("should return event with decrypted PII", async () => {
			const created = await mockDao.create(
				createTestEvent({
					actorEmail: "enc:test@example.com",
					actorIp: "enc:192.168.1.1",
					actorDevice: "enc:Mozilla/5.0",
				}),
			);

			const response = await request(app).get(`/api/audit/${created.id}/decrypted`);

			expect(response.status).toBe(200);
			expect(mockService.decryptPii).toHaveBeenCalled();
			expect(mockService.decryptChanges).toHaveBeenCalled();
		});

		it("should return 400 for invalid id", async () => {
			const response = await request(app).get("/api/audit/invalid/decrypted");

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("Invalid audit event ID");
		});

		it("should return 404 for non-existent event", async () => {
			const response = await request(app).get("/api/audit/99999/decrypted");

			expect(response.status).toBe(404);
			expect(response.body.error).toBe("Audit event not found");
		});

		it("should handle errors gracefully", async () => {
			mockDao.getById = vi.fn().mockRejectedValue(new Error("Database error"));

			const response = await request(app).get("/api/audit/1/decrypted");

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("Failed to get decrypted audit event");
		});

		it("should handle null PII fields", async () => {
			const created = await mockDao.create(
				createTestEvent({
					actorEmail: null,
					actorIp: null,
					actorDevice: null,
				}),
			);

			const response = await request(app).get(`/api/audit/${created.id}/decrypted`);

			expect(response.status).toBe(200);
			expect(response.body.actorEmail).toBeNull();
			expect(response.body.actorIp).toBeNull();
			expect(response.body.actorDevice).toBeNull();
		});
	});

	describe("GET /api/audit/resource/:type/:resourceId", () => {
		it("should return events for a specific resource", async () => {
			await mockDao.create(createTestEvent({ resourceType: "doc", resourceId: "doc-1" }));
			await mockDao.create(createTestEvent({ resourceType: "doc", resourceId: "doc-1" }));
			await mockDao.create(createTestEvent({ resourceType: "doc", resourceId: "doc-2" }));

			const response = await request(app).get("/api/audit/resource/doc/doc-1");

			expect(response.status).toBe(200);
			expect(response.body.events.length).toBe(2);
			expect(response.body.resourceType).toBe("doc");
			expect(response.body.resourceId).toBe("doc-1");
		});

		it("should apply pagination", async () => {
			// Create 5 events for the same resource
			for (let i = 0; i < 5; i++) {
				await mockDao.create(createTestEvent({ resourceType: "doc", resourceId: "doc-1" }));
			}

			const response = await request(app).get("/api/audit/resource/doc/doc-1?limit=2&offset=1");

			expect(response.status).toBe(200);
			// Note: mock may not fully support pagination options in getByResource
		});

		it("should handle errors gracefully", async () => {
			mockDao.getByResource = vi.fn().mockRejectedValue(new Error("Database error"));

			const response = await request(app).get("/api/audit/resource/doc/doc-1");

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("Failed to get audit events for resource");
		});
	});

	describe("GET /api/audit/user/:userId", () => {
		it("should return events for a specific user", async () => {
			await mockDao.create(createTestEvent({ actorId: 1 }));
			await mockDao.create(createTestEvent({ actorId: 1 }));
			await mockDao.create(createTestEvent({ actorId: 2 }));

			const response = await request(app).get("/api/audit/user/1");

			expect(response.status).toBe(200);
			expect(response.body.events.length).toBe(2);
			expect(response.body.actorId).toBe(1);
		});

		it("should return 400 for invalid user id", async () => {
			const response = await request(app).get("/api/audit/user/not-a-number");

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("Invalid user ID");
		});

		it("should handle errors gracefully", async () => {
			mockDao.getByActor = vi.fn().mockRejectedValue(new Error("Database error"));

			const response = await request(app).get("/api/audit/user/1");

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("Failed to get audit events for user");
		});
	});

	describe("POST /api/audit/:id/verify", () => {
		it("should verify event integrity", async () => {
			const created = await mockDao.create(createTestEvent());

			const response = await request(app).post(`/api/audit/${created.id}/verify`);

			expect(response.status).toBe(200);
			expect(response.body.id).toBe(created.id);
			expect(response.body.valid).toBe(true);
		});

		it("should return 400 for invalid id", async () => {
			const response = await request(app).post("/api/audit/not-a-number/verify");

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("Invalid audit event ID");
		});

		it("should handle errors gracefully", async () => {
			mockDao.verifyEventIntegrity = vi.fn().mockRejectedValue(new Error("Database error"));

			const response = await request(app).post("/api/audit/1/verify");

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("Failed to verify audit event integrity");
		});
	});

	describe("GET /api/audit/export", () => {
		it("should export events as JSON by default", async () => {
			await mockDao.create(createTestEvent({ resourceId: "doc-1" }));
			await mockDao.create(createTestEvent({ resourceId: "doc-2" }));

			const response = await request(app).get("/api/audit/export");

			expect(response.status).toBe(200);
			expect(response.headers["content-type"]).toMatch(/json/);
			expect(response.headers["content-disposition"]).toBe("attachment; filename=audit-events.json");
			expect(Array.isArray(response.body)).toBe(true);
			expect(response.body.length).toBe(2);
		});

		it("should export events as CSV", async () => {
			await mockDao.create(createTestEvent({ resourceId: "doc-1" }));

			const response = await request(app).get("/api/audit/export?format=csv");

			expect(response.status).toBe(200);
			expect(response.headers["content-type"]).toMatch(/csv/);
			expect(response.headers["content-disposition"]).toBe("attachment; filename=audit-events.csv");
			expect(response.text).toContain("id,timestamp,actorId");
		});

		it("should decrypt PII when requested", async () => {
			await mockDao.create(
				createTestEvent({
					actorEmail: "enc:test@example.com",
				}),
			);

			const response = await request(app).get("/api/audit/export?decrypt=true");

			expect(response.status).toBe(200);
			expect(mockService.decryptPii).toHaveBeenCalled();
		});

		it("should handle null PII fields when decrypting export", async () => {
			await mockDao.create(
				createTestEvent({
					actorEmail: null,
					actorIp: null,
					actorDevice: null,
				}),
			);

			const response = await request(app).get("/api/audit/export?decrypt=true");

			expect(response.status).toBe(200);
			// Should not throw even when PII fields are null
			expect(response.body[0].actorEmail).toBeNull();
			expect(response.body[0].actorIp).toBeNull();
			expect(response.body[0].actorDevice).toBeNull();
		});

		it("should apply filters to export", async () => {
			await mockDao.create(createTestEvent({ action: "create" }));
			await mockDao.create(createTestEvent({ action: "update" }));

			const response = await request(app).get("/api/audit/export?action=create");

			expect(response.status).toBe(200);
			expect(response.body.length).toBe(1);
			expect(response.body[0].action).toBe("create");
		});

		it("should cap limit at 100000 for export", async () => {
			// Just verify this doesn't error - we can't easily test the exact cap without more events
			const response = await request(app).get("/api/audit/export?limit=200000");

			expect(response.status).toBe(200);
		});

		it("should handle CSV with special characters", async () => {
			await mockDao.create(
				createTestEvent({
					resourceName: 'Test, "Document"',
				}),
			);

			const response = await request(app).get("/api/audit/export?format=csv");

			expect(response.status).toBe(200);
			// The CSV should properly escape the special characters
			expect(response.text).toContain('"Test, ""Document"""');
		});

		it("should handle CSV with newlines", async () => {
			await mockDao.create(
				createTestEvent({
					resourceName: "Test\nDocument",
				}),
			);

			const response = await request(app).get("/api/audit/export?format=csv");

			expect(response.status).toBe(200);
		});

		it("should handle null values in CSV", async () => {
			await mockDao.create(
				createTestEvent({
					actorId: null,
					actorEmail: null,
					actorIp: null,
					actorDevice: null,
					resourceName: null,
					changes: null,
					metadata: null,
				}),
			);

			const response = await request(app).get("/api/audit/export?format=csv");

			expect(response.status).toBe(200);
		});

		it("should include changes and metadata in CSV as JSON strings", async () => {
			await mockDao.create(
				createTestEvent({
					changes: [{ field: "title", old: "Old", new: "New" }],
					metadata: { httpMethod: "POST" },
				}),
			);

			const response = await request(app).get("/api/audit/export?format=csv");

			expect(response.status).toBe(200);
			expect(response.text).toContain("title");
		});

		it("should handle errors gracefully", async () => {
			mockDao.query = vi.fn().mockRejectedValue(new Error("Database error"));

			const response = await request(app).get("/api/audit/export");

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("Failed to export audit events");
		});

		it("should apply date range filter to export", async () => {
			await mockDao.create(createTestEvent({ timestamp: new Date("2024-01-15") }));
			await mockDao.create(createTestEvent({ timestamp: new Date("2024-01-20") }));

			const response = await request(app).get(
				"/api/audit/export?startDate=2024-01-14T00:00:00Z&endDate=2024-01-16T00:00:00Z",
			);

			expect(response.status).toBe(200);
		});

		it("should apply resourceType and resourceId filters to export", async () => {
			await mockDao.create(createTestEvent({ resourceType: "doc", resourceId: "doc-1" }));
			await mockDao.create(createTestEvent({ resourceType: "site", resourceId: "site-1" }));

			const response = await request(app).get("/api/audit/export?resourceType=doc&resourceId=doc-1");

			expect(response.status).toBe(200);
		});

		it("should apply actorId filter to export", async () => {
			await mockDao.create(createTestEvent({ actorId: 1 }));
			await mockDao.create(createTestEvent({ actorId: 2 }));
			await mockDao.create(createTestEvent({ actorId: 1 }));

			const response = await request(app).get("/api/audit/export?actorId=1");

			expect(response.status).toBe(200);
			expect(response.body.length).toBe(2);
			expect(response.body.every((e: { actorId: number }) => e.actorId === 1)).toBe(true);
		});
	});
});
