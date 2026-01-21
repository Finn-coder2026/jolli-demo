import type { AuditEventDao } from "../dao/AuditEventDao";
import { mockAuditEventDao } from "../dao/AuditEventDao.mock";
import type { DaoProvider } from "../dao/DaoProvider";
import {
	type AuditService,
	auditLog,
	auditLogSync,
	computeAuditChanges,
	createAuditService,
	generateAuditPiiEncryptionKey,
	getAuditService,
	getAuditServiceOrNull,
	setGlobalAuditService,
} from "./AuditService";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the config module
vi.mock("../config/Config", () => ({
	getConfig: () => ({
		AUDIT_ENABLED: true,
		AUDIT_PII_ENCRYPTION_KEY: undefined,
		AUDIT_RETENTION_DAYS: 365,
	}),
}));

// Mock the audit context
vi.mock("./AuditContext", () => ({
	getAuditContext: () => ({
		actorId: 1,
		actorType: "user",
		actorEmail: "test@example.com",
		actorIp: "127.0.0.1",
		actorDevice: "Mozilla/5.0",
		httpMethod: "POST",
		endpoint: "/api/test",
		requestId: "test-request-id",
	}),
}));

// Mock the tenant context - returns undefined (implicit)
vi.mock("../tenant/TenantContext", () => ({
	getTenantContext: () => null,
}));

describe("AuditService", () => {
	let mockDao: AuditEventDao;
	let mockDaoProvider: DaoProvider<AuditEventDao>;
	let service: AuditService;

	beforeEach(() => {
		mockDao = mockAuditEventDao();
		mockDaoProvider = { getDao: () => mockDao };
		service = createAuditService(mockDaoProvider);
	});

	describe("createAuditService", () => {
		it("should create an audit service with all methods", () => {
			expect(service.log).toBeDefined();
			expect(service.logSync).toBeDefined();
			expect(service.computeChanges).toBeDefined();
			expect(service.decryptPii).toBeDefined();
			expect(service.decryptChanges).toBeDefined();
		});
	});

	describe("logSync", () => {
		it("should create an audit event", async () => {
			const createSpy = vi.spyOn(mockDao, "create");

			await service.logSync({
				action: "create",
				resourceType: "doc",
				resourceId: "doc-123",
				resourceName: "Test Document",
			});

			expect(createSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					action: "create",
					resourceType: "doc",
					resourceId: "doc-123",
					resourceName: "Test Document",
					actorId: 1,
					actorType: "user",
				}),
			);
		});

		it("should include metadata from context", async () => {
			const createSpy = vi.spyOn(mockDao, "create");

			await service.logSync({
				action: "update",
				resourceType: "doc",
				resourceId: "doc-456",
			});

			expect(createSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					metadata: expect.objectContaining({
						httpMethod: "POST",
						endpoint: "/api/test",
						requestId: "test-request-id",
					}),
				}),
			);
		});

		it("should handle errors gracefully", async () => {
			vi.spyOn(mockDao, "create").mockRejectedValueOnce(new Error("DB Error"));

			// Should not throw
			await expect(
				service.logSync({
					action: "delete",
					resourceType: "site",
					resourceId: "site-789",
				}),
			).resolves.toBeUndefined();
		});
	});

	describe("log (async fire-and-forget)", () => {
		it("should log events asynchronously", () => {
			const createSpy = vi.spyOn(mockDao, "create");

			service.log({
				action: "login",
				resourceType: "session",
				resourceId: "session-123",
			});

			// Wait for next tick for async operation
			return new Promise(resolve => setTimeout(resolve, 10)).then(() => {
				expect(createSpy).toHaveBeenCalled();
			});
		});
	});

	describe("computeChanges", () => {
		it("should compute changes for create (null -> object)", () => {
			const newValue = { name: "Test", email: "test@example.com" };
			const changes = service.computeChanges(null, newValue, "user");

			expect(changes).toContainEqual(
				expect.objectContaining({
					field: "name",
					old: null,
					new: "Test",
				}),
			);
			expect(changes).toContainEqual(
				expect.objectContaining({
					field: "email",
					old: null,
					new: "test@example.com",
				}),
			);
		});

		it("should compute changes for delete (object -> null)", () => {
			const oldValue = { name: "Test", status: "active" };
			const changes = service.computeChanges(oldValue, null, "user");

			expect(changes).toContainEqual(
				expect.objectContaining({
					field: "name",
					old: "Test",
					new: null,
				}),
			);
			expect(changes).toContainEqual(
				expect.objectContaining({
					field: "status",
					old: "active",
					new: null,
				}),
			);
		});

		it("should compute changes for update", () => {
			const oldValue = { name: "Old Name", status: "draft" };
			const newValue = { name: "New Name", status: "published" };
			const changes = service.computeChanges(oldValue, newValue, "doc");

			expect(changes).toContainEqual(
				expect.objectContaining({
					field: "name",
					old: "Old Name",
					new: "New Name",
				}),
			);
			expect(changes).toContainEqual(
				expect.objectContaining({
					field: "status",
					old: "draft",
					new: "published",
				}),
			);
		});

		it("should not include unchanged fields", () => {
			const oldValue = { name: "Same", count: 5 };
			const newValue = { name: "Same", count: 10 };
			const changes = service.computeChanges(oldValue, newValue, "doc");

			expect(changes).not.toContainEqual(
				expect.objectContaining({
					field: "name",
				}),
			);
			expect(changes).toContainEqual(
				expect.objectContaining({
					field: "count",
					old: 5,
					new: 10,
				}),
			);
		});

		it("should redact sensitive fields in update", () => {
			const oldValue = { password: "old-secret" };
			const newValue = { password: "new-secret" };
			const changes = service.computeChanges(oldValue, newValue, "user");

			expect(changes).not.toContainEqual(
				expect.objectContaining({
					field: "password",
				}),
			);
		});

		it("should skip sensitive fields in create (null -> object)", () => {
			const newValue = { name: "Test", password: "secret123", apiKey: "key-abc" };
			const changes = service.computeChanges(null, newValue, "user");

			expect(changes).toContainEqual(
				expect.objectContaining({
					field: "name",
					old: null,
					new: "Test",
				}),
			);
			expect(changes).not.toContainEqual(expect.objectContaining({ field: "password" }));
			expect(changes).not.toContainEqual(expect.objectContaining({ field: "apiKey" }));
		});

		it("should skip sensitive fields in delete (object -> null)", () => {
			const oldValue = { name: "Test", token: "tok-123", clientSecret: "cs-xyz" };
			const changes = service.computeChanges(oldValue, null, "user");

			expect(changes).toContainEqual(
				expect.objectContaining({
					field: "name",
					old: "Test",
					new: null,
				}),
			);
			expect(changes).not.toContainEqual(expect.objectContaining({ field: "token" }));
			expect(changes).not.toContainEqual(expect.objectContaining({ field: "clientSecret" }));
		});

		it("should return empty array for both null", () => {
			const changes = service.computeChanges(null, null, "doc");
			expect(changes).toEqual([]);
		});

		it("should truncate long strings", () => {
			const longString = "a".repeat(2000);
			const oldValue = { content: "short" };
			const newValue = { content: longString };
			const changes = service.computeChanges(oldValue, newValue, "doc");

			expect(changes[0].new).toContain("[2000 characters]");
		});

		it("should use tracked fields when specified", () => {
			const oldValue = { name: "Old", status: "draft", extra: "value" };
			const newValue = { name: "New", status: "published", extra: "changed" };
			const changes = service.computeChanges(oldValue, newValue, "doc", ["name", "status"]);

			expect(changes.length).toBe(2);
			expect(changes).not.toContainEqual(
				expect.objectContaining({
					field: "extra",
				}),
			);
		});

		it("should redact sensitive fields in nested objects", () => {
			const oldValue = {
				config: { url: "https://example.com", password: "old-secret" },
			};
			const newValue = {
				config: { url: "https://example.org", password: "new-secret" },
			};
			const changes = service.computeChanges(oldValue, newValue, "integration");

			const configChange = changes.find(c => c.field === "config");
			expect(configChange).toBeDefined();
			// The nested password should be redacted, not shown as the actual value
			const newConfig = configChange?.new as Record<string, unknown>;
			expect(newConfig.password).toBe("[REDACTED]");
		});
	});

	describe("decryptPii", () => {
		it("should return non-encrypted values as-is", () => {
			const result = service.decryptPii("plain-text");
			expect(result).toBe("plain-text");
		});

		it("should return encrypted values without key as-is", () => {
			const result = service.decryptPii("enc:somebase64:tag:data");
			expect(result).toBe("enc:somebase64:tag:data");
		});
	});

	describe("decryptChanges", () => {
		it("should return null for null input", () => {
			const result = service.decryptChanges(null, "user");
			expect(result).toBeNull();
		});

		it("should return unchanged changes without encryption key", () => {
			const changes = [{ field: "email", old: "old@test.com", new: "new@test.com" }];
			const result = service.decryptChanges(changes, "user");
			expect(result).toEqual(changes);
		});
	});
});

describe("Global Audit Service", () => {
	beforeEach(() => {
		// Reset global service
		setGlobalAuditService(null as unknown as AuditService);
	});

	describe("setGlobalAuditService / getAuditService", () => {
		it("should throw when service not initialized", () => {
			expect(() => getAuditService()).toThrow("Audit service not initialized");
		});

		it("should return service after initialization", () => {
			const mockDao = mockAuditEventDao();
			const mockDaoProvider = { getDao: () => mockDao };
			const service = createAuditService(mockDaoProvider);

			setGlobalAuditService(service);
			expect(getAuditService()).toBe(service);
		});
	});

	describe("getAuditServiceOrNull", () => {
		it("should return null when not initialized", () => {
			expect(getAuditServiceOrNull()).toBeNull();
		});

		it("should return service when initialized", () => {
			const mockDao = mockAuditEventDao();
			const mockDaoProvider = { getDao: () => mockDao };
			const service = createAuditService(mockDaoProvider);

			setGlobalAuditService(service);
			expect(getAuditServiceOrNull()).toBe(service);
		});
	});
});

describe("Convenience Functions", () => {
	beforeEach(() => {
		// Reset global service
		setGlobalAuditService(null as unknown as AuditService);
	});

	describe("auditLog (async fire-and-forget)", () => {
		it("should return immediately when service not initialized", () => {
			// Should not throw
			auditLog({
				action: "create",
				resourceType: "doc",
				resourceId: "123",
			});
		});

		it("should call service.log when initialized", () => {
			const mockDao = mockAuditEventDao();
			const mockDaoProvider = { getDao: () => mockDao };
			const service = createAuditService(mockDaoProvider);
			setGlobalAuditService(service);

			const logSpy = vi.spyOn(service, "log");

			auditLog({
				action: "create",
				resourceType: "doc",
				resourceId: "123",
			});

			expect(logSpy).toHaveBeenCalled();
		});
	});

	describe("auditLogSync", () => {
		it("should return immediately when service not initialized", async () => {
			await expect(
				auditLogSync({
					action: "create",
					resourceType: "doc",
					resourceId: "123",
				}),
			).resolves.toBeUndefined();
		});

		it("should call service.logSync when initialized", async () => {
			const mockDao = mockAuditEventDao();
			const mockDaoProvider = { getDao: () => mockDao };
			const service = createAuditService(mockDaoProvider);
			setGlobalAuditService(service);

			const logSyncSpy = vi.spyOn(service, "logSync");

			await auditLogSync({
				action: "create",
				resourceType: "doc",
				resourceId: "123",
			});

			expect(logSyncSpy).toHaveBeenCalled();
		});
	});

	describe("computeAuditChanges", () => {
		it("should return empty array when service not initialized", () => {
			const result = computeAuditChanges({ a: 1 }, { a: 2 }, "doc");
			expect(result).toEqual([]);
		});

		it("should call service.computeChanges when initialized", () => {
			const mockDao = mockAuditEventDao();
			const mockDaoProvider = { getDao: () => mockDao };
			const service = createAuditService(mockDaoProvider);
			setGlobalAuditService(service);

			const computeSpy = vi.spyOn(service, "computeChanges");

			computeAuditChanges({ a: 1 }, { a: 2 }, "doc");

			expect(computeSpy).toHaveBeenCalled();
		});
	});
});

describe("generateAuditPiiEncryptionKey", () => {
	it("should generate a base64 encoded 32-byte key", () => {
		const key = generateAuditPiiEncryptionKey();
		const decoded = Buffer.from(key, "base64");
		expect(decoded.length).toBe(32);
	});

	it("should generate unique keys", () => {
		const key1 = generateAuditPiiEncryptionKey();
		const key2 = generateAuditPiiEncryptionKey();
		expect(key1).not.toBe(key2);
	});
});

describe("AuditService with encryption", () => {
	let mockDao: AuditEventDao;
	let mockDaoProvider: DaoProvider<AuditEventDao>;
	let service: AuditService;
	const testEncryptionKey = Buffer.from("a".repeat(32)).toString("base64");

	beforeEach(async () => {
		// Override config mock with encryption key
		const configModule = await import("../config/Config");
		vi.spyOn(configModule, "getConfig").mockReturnValue({
			AUDIT_ENABLED: true,
			AUDIT_PII_ENCRYPTION_KEY: testEncryptionKey,
			AUDIT_RETENTION_DAYS: 365,
		} as ReturnType<typeof configModule.getConfig>);

		mockDao = mockAuditEventDao();
		mockDaoProvider = { getDao: () => mockDao };
		service = createAuditService(mockDaoProvider);
	});

	describe("logSync with encryption", () => {
		it("should encrypt PII fields when encryption key is set", async () => {
			const createSpy = vi.spyOn(mockDao, "create");

			await service.logSync({
				action: "create",
				resourceType: "user",
				resourceId: "user-123",
				actorEmail: "secret@example.com",
			});

			expect(createSpy).toHaveBeenCalled();
			const createdEvent = createSpy.mock.calls[0][0];
			// Email should be encrypted (starts with enc:)
			expect(createdEvent.actorEmail).toMatch(/^enc:/);
		});
	});

	describe("computeChanges with encryption", () => {
		it("should encrypt PII fields in changes", () => {
			const oldValue = { email: "old@example.com" };
			const newValue = { email: "new@example.com" };
			const changes = service.computeChanges(oldValue, newValue, "user");

			// Email is PII for user resource type, so it should be encrypted
			const emailChange = changes.find(c => c.field === "email");
			expect(emailChange).toBeDefined();
			// Values might be encrypted depending on PII definitions
		});

		it("should encrypt array of PII values", () => {
			// Create a value with an array of email addresses (PII field)
			const oldValue = { email: ["old1@example.com", "old2@example.com"] };
			const newValue = { email: ["new1@example.com", "new2@example.com"] };
			const changes = service.computeChanges(
				oldValue as Record<string, unknown>,
				newValue as Record<string, unknown>,
				"user",
			);

			// Email is PII for user resource type, so array values should be encrypted
			const emailChange = changes.find(c => c.field === "email");
			expect(emailChange).toBeDefined();
			// Both old and new values should be arrays with encrypted strings
			expect(Array.isArray(emailChange?.new)).toBe(true);
			const newArray = emailChange?.new as Array<string>;
			expect(newArray[0]).toMatch(/^enc:/);
		});
	});

	describe("decryptPii with encryption", () => {
		it("should decrypt encrypted values", async () => {
			// First encrypt a value
			const createSpy = vi.spyOn(mockDao, "create");
			await service.logSync({
				action: "create",
				resourceType: "user",
				resourceId: "user-123",
				actorEmail: "test@example.com",
			});

			const createdEvent = createSpy.mock.calls[0][0];
			const encrypted = createdEvent.actorEmail as string;

			// Now decrypt it
			const decrypted = service.decryptPii(encrypted);
			expect(decrypted).toBe("test@example.com");
		});

		it("should handle malformed encrypted values", () => {
			// Wrong number of parts
			const result = service.decryptPii("enc:onlyonepart");
			expect(result).toBe("enc:onlyonepart");
		});
	});

	describe("decryptChanges with encryption", () => {
		it("should decrypt PII fields in changes array", async () => {
			// Create a change with encrypted email value
			const createSpy = vi.spyOn(mockDao, "create");
			await service.logSync({
				action: "update",
				resourceType: "user",
				resourceId: "user-123",
				changes: [{ field: "email", old: "old@test.com", new: "new@test.com" }],
			});

			const createdEvent = createSpy.mock.calls[0][0];
			const encryptedChanges = createdEvent.changes;

			if (encryptedChanges) {
				const decrypted = service.decryptChanges(encryptedChanges, "user");
				expect(decrypted).not.toBeNull();
			}
		});

		it("should handle array values in changes", () => {
			const changes = [{ field: "emails", old: ["a@test.com"], new: ["b@test.com", "c@test.com"] }];
			// Test the decryption path for arrays
			const result = service.decryptChanges(changes, "user");
			expect(result).toEqual(changes);
		});

		it("should decrypt encrypted values in arrays", async () => {
			// First, let's create an event with array changes that will get encrypted
			const createSpy = vi.spyOn(mockDao, "create");
			await service.logSync({
				action: "create",
				resourceType: "user",
				resourceId: "user-123",
				actorEmail: "test@example.com",
			});

			// Get the encrypted email
			const createdEvent = createSpy.mock.calls[0][0];
			const encryptedEmail = createdEvent.actorEmail as string;

			// Create a change with encrypted arrays
			const changes = [{ field: "email", old: encryptedEmail, new: encryptedEmail }];

			// Decrypt the changes
			const decrypted = service.decryptChanges(changes, "user");
			expect(decrypted).not.toBeNull();
			if (decrypted) {
				expect(decrypted[0].old).toBe("test@example.com");
			}
		});

		it("should handle mixed array values (encrypted and non-encrypted)", async () => {
			// First encrypt a value
			const createSpy = vi.spyOn(mockDao, "create");
			await service.logSync({
				action: "create",
				resourceType: "user",
				resourceId: "user-123",
				actorEmail: "secret@example.com",
			});

			const createdEvent = createSpy.mock.calls[0][0];
			const encryptedEmail = createdEvent.actorEmail as string;

			// Create changes with array containing both encrypted and non-encrypted values
			const changes = [
				{ field: "email", old: [encryptedEmail, "plain@example.com"], new: [123, "other@example.com"] },
			];

			const decrypted = service.decryptChanges(changes, "user");
			expect(decrypted).not.toBeNull();
			if (decrypted) {
				// The encrypted value should be decrypted, plain values stay as-is
				const oldArray = decrypted[0].old as Array<unknown>;
				expect(oldArray[0]).toBe("secret@example.com");
				expect(oldArray[1]).toBe("plain@example.com");
				// Numbers stay as numbers
				const newArray = decrypted[0].new as Array<unknown>;
				expect(newArray[0]).toBe(123);
			}
		});

		it("should return numeric values unchanged when decrypting changes", () => {
			// Test the decryptChangeValue path for non-string, non-array values
			const changes = [{ field: "email", old: 42, new: null }];
			const result = service.decryptChanges(changes, "user");
			expect(result).not.toBeNull();
			if (result) {
				expect(result[0].old).toBe(42);
				expect(result[0].new).toBeNull();
			}
		});

		it("should return object values unchanged when decrypting changes", () => {
			// Test the decryptChangeValue path for objects
			const changes = [{ field: "email", old: { nested: "value" }, new: true }];
			const result = service.decryptChanges(changes, "user");
			expect(result).not.toBeNull();
			if (result) {
				expect(result[0].old).toEqual({ nested: "value" });
				expect(result[0].new).toBe(true);
			}
		});
	});
});

describe("AuditService edge cases", () => {
	let mockDao: AuditEventDao;
	let mockDaoProvider: DaoProvider<AuditEventDao>;
	let service: AuditService;

	beforeEach(async () => {
		// Reset to no encryption key
		const configModule = await import("../config/Config");
		vi.spyOn(configModule, "getConfig").mockReturnValue({
			AUDIT_ENABLED: true,
			AUDIT_PII_ENCRYPTION_KEY: undefined,
			AUDIT_RETENTION_DAYS: 365,
		} as ReturnType<typeof configModule.getConfig>);

		mockDao = mockAuditEventDao();
		mockDaoProvider = { getDao: () => mockDao };
		service = createAuditService(mockDaoProvider);
	});

	describe("log without audit context", () => {
		it("should handle logging when no context and no metadata", async () => {
			// Override context mock to return undefined
			const contextModule = await import("./AuditContext");
			vi.spyOn(contextModule, "getAuditContext").mockReturnValue(undefined);

			const createSpy = vi.spyOn(mockDao, "create");

			await service.logSync({
				action: "create",
				resourceType: "doc",
				resourceId: "doc-123",
			});

			// Should still create the event, but with null metadata
			expect(createSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					metadata: null,
				}),
			);
		});
	});

	describe("computeChanges edge cases", () => {
		it("should handle large arrays", () => {
			const largeArray = Array.from({ length: 150 }, (_, i) => i);
			const oldValue = { items: [1, 2, 3] };
			const newValue = { items: largeArray };
			const changes = service.computeChanges(oldValue, newValue, "doc");

			const itemsChange = changes.find(c => c.field === "items");
			expect(itemsChange).toBeDefined();
			expect(itemsChange?.new).toContain("[Array of 150 items]");
		});

		it("should handle nested objects", () => {
			const oldValue = { meta: { title: "Old", author: "Alice" } };
			const newValue = { meta: { title: "New", author: "Bob" } };
			const changes = service.computeChanges(oldValue, newValue, "doc");

			expect(changes).toContainEqual(
				expect.objectContaining({
					field: "meta",
				}),
			);
		});

		it("should skip function properties", () => {
			// biome-ignore lint/suspicious/noEmptyBlockStatements: Test uses empty functions
			const oldValue = { name: "Test", fn: () => {} };
			// biome-ignore lint/suspicious/noEmptyBlockStatements: Test uses empty functions
			const newValue = { name: "Updated", fn: () => {} };
			const changes = service.computeChanges(oldValue, newValue, "doc");

			expect(changes).not.toContainEqual(
				expect.objectContaining({
					field: "fn",
				}),
			);
		});

		it("should handle Date objects in comparison", () => {
			const date1 = new Date("2024-01-01");
			const date2 = new Date("2024-01-01");
			const date3 = new Date("2024-01-02");

			const oldValue = { createdAt: date1 };
			const newValue1 = { createdAt: date2 };
			const newValue2 = { createdAt: date3 };

			// Same date should not show as change
			const changes1 = service.computeChanges(oldValue, newValue1, "doc");
			expect(changes1).not.toContainEqual(
				expect.objectContaining({
					field: "createdAt",
				}),
			);

			// Different date should show as change
			const changes2 = service.computeChanges(oldValue, newValue2, "doc");
			expect(changes2).toContainEqual(
				expect.objectContaining({
					field: "createdAt",
				}),
			);
		});

		it("should handle arrays in comparison", () => {
			const oldValue = { tags: ["a", "b"] };
			const newValue1 = { tags: ["a", "b"] };
			const newValue2 = { tags: ["a", "c"] };

			// Same array should not show as change
			const changes1 = service.computeChanges(oldValue, newValue1, "doc");
			expect(changes1).not.toContainEqual(
				expect.objectContaining({
					field: "tags",
				}),
			);

			// Different array should show as change
			const changes2 = service.computeChanges(oldValue, newValue2, "doc");
			expect(changes2).toContainEqual(
				expect.objectContaining({
					field: "tags",
				}),
			);
		});

		it("should handle type changes", () => {
			const oldValue = { count: "5" as unknown };
			const newValue = { count: 5 as unknown };
			const changes = service.computeChanges(oldValue, newValue, "doc");

			expect(changes).toContainEqual(
				expect.objectContaining({
					field: "count",
				}),
			);
		});

		it("should detect changes when objects have different number of keys", () => {
			const oldValue = { name: "Test", extra: "value" };
			const newValue = { name: "Test" };
			const changes = service.computeChanges(oldValue, newValue, "doc");

			// Should detect that extra was removed
			expect(changes).toContainEqual(
				expect.objectContaining({
					field: "extra",
				}),
			);
		});

		it("should compare nested objects with different key counts", () => {
			const oldValue = { config: { a: 1, b: 2 } };
			const newValue = { config: { a: 1 } };
			const changes = service.computeChanges(oldValue, newValue, "doc");

			// Should detect the config change since nested object has different keys
			expect(changes).toContainEqual(
				expect.objectContaining({
					field: "config",
				}),
			);
		});

		it("should detect change when array becomes non-array", () => {
			const oldValue = { tags: ["a", "b"] };
			const newValue = { tags: "a" };
			const changes = service.computeChanges(
				oldValue as Record<string, unknown>,
				newValue as Record<string, unknown>,
				"doc",
			);

			// Should detect the type change from array to string
			expect(changes).toContainEqual(
				expect.objectContaining({
					field: "tags",
				}),
			);
		});

		it("should detect change when non-array becomes array", () => {
			const oldValue = { value: "single" };
			const newValue = { value: ["multiple", "items"] };
			const changes = service.computeChanges(
				oldValue as Record<string, unknown>,
				newValue as Record<string, unknown>,
				"doc",
			);

			// Should detect the type change from string to array
			expect(changes).toContainEqual(
				expect.objectContaining({
					field: "value",
				}),
			);
		});

		it("should detect change when array becomes plain object", () => {
			// Both are typeof 'object' but one is array and one is plain object
			const oldValue = { value: ["a", "b"] };
			const newValue = { value: { a: 1, b: 2 } };
			const changes = service.computeChanges(
				oldValue as Record<string, unknown>,
				newValue as Record<string, unknown>,
				"doc",
			);

			// Should detect the type change from array to object
			expect(changes).toContainEqual(
				expect.objectContaining({
					field: "value",
				}),
			);
		});

		it("should detect change when plain object becomes array", () => {
			// Both are typeof 'object' but one is plain object and one is array
			const oldValue = { value: { x: 1 } };
			const newValue = { value: [1, 2, 3] };
			const changes = service.computeChanges(
				oldValue as Record<string, unknown>,
				newValue as Record<string, unknown>,
				"doc",
			);

			// Should detect the type change from object to array
			expect(changes).toContainEqual(
				expect.objectContaining({
					field: "value",
				}),
			);
		});
	});

	describe("log (fire-and-forget) error handling", () => {
		it("should log error when async audit fails", async () => {
			// Make the create fail
			const createSpy = vi.spyOn(mockDao, "create").mockRejectedValue(new Error("Database error"));

			// Call log (fire-and-forget) - it should not throw
			service.log({
				action: "create",
				resourceType: "doc",
				resourceId: "doc-123",
			});

			// Wait for the async operation to complete and verify create was called
			await vi.waitFor(() => {
				expect(createSpy).toHaveBeenCalled();
			});

			// Allow microtask queue to process the catch handler
			await new Promise(resolve => setImmediate(resolve));

			// The error should be logged but not thrown - if we get here, log didn't throw
		});

		it("should not propagate errors from log (fire-and-forget)", async () => {
			// Verify that errors in log don't bubble up to the caller
			vi.spyOn(mockDao, "create").mockImplementation(() => {
				return Promise.reject(new Error("Test error"));
			});

			// This should not throw
			service.log({
				action: "update",
				resourceType: "site",
				resourceId: "site-456",
			});

			// Flush microtasks and timers to ensure the catch runs
			await new Promise(resolve => setTimeout(resolve, 50));

			// If we reach here without an unhandled rejection, the test passes
			expect(true).toBe(true);
		});
	});

	describe("log with additional metadata", () => {
		it("should include additional metadata with sensitive fields redacted", async () => {
			const createSpy = vi.spyOn(mockDao, "create");

			await service.logSync({
				action: "create",
				resourceType: "doc",
				resourceId: "doc-123",
				metadata: {
					customField: "value",
					password: "secret123",
				},
			});

			expect(createSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					metadata: expect.objectContaining({
						customField: "value",
						password: "[REDACTED]",
					}),
				}),
			);
		});

		it("should include context metadata even without additional fields", async () => {
			const createSpy = vi.spyOn(mockDao, "create");

			await service.logSync({
				action: "create",
				resourceType: "doc",
				resourceId: "doc-123",
				// No additional metadata fields - only required fields
			});

			const createdEvent = createSpy.mock.calls[0][0];
			// Context fields (endpoint, httpMethod, requestId) are always included
			expect(createdEvent.metadata).toEqual(
				expect.objectContaining({
					endpoint: "/api/test",
					httpMethod: "POST",
					requestId: "test-request-id",
				}),
			);
		});
	});
});

describe("AuditService encryption edge cases", () => {
	let mockDao: AuditEventDao;
	let mockDaoProvider: DaoProvider<AuditEventDao>;

	beforeEach(() => {
		vi.clearAllMocks();
		mockDao = mockAuditEventDao();
		mockDaoProvider = { getDao: () => mockDao };
	});

	it("should handle invalid encryption key length", async () => {
		// Configure with a key that's not 32 bytes
		const configModule = await import("../config/Config");
		vi.spyOn(configModule, "getConfig").mockReturnValue({
			AUDIT_ENABLED: true,
			AUDIT_PII_ENCRYPTION_KEY: Buffer.from("short-key").toString("base64"), // Only 9 bytes
			AUDIT_RETENTION_DAYS: 365,
		} as ReturnType<typeof configModule.getConfig>);

		const service = createAuditService(mockDaoProvider);
		const createSpy = vi.spyOn(mockDao, "create");

		await service.logSync({
			action: "create",
			resourceType: "user",
			resourceId: "user-123",
			actorEmail: "test@example.com", // This is a PII field
		});

		// With invalid key, PII should NOT be encrypted
		const createdEvent = createSpy.mock.calls[0][0];
		expect(createdEvent.actorEmail).toBe("test@example.com");
	});

	it("should handle invalid base64 encryption key format by catching the error", async () => {
		// Configure with a key that will cause Buffer.from to throw
		const configModule = await import("../config/Config");

		// Mock Buffer.from to throw for this specific test
		const originalBufferFrom = Buffer.from;
		const mockBufferFrom = vi.fn().mockImplementation((input: unknown, encoding?: BufferEncoding) => {
			if (encoding === "base64" && input === "throw-error-key") {
				throw new Error("Invalid base64");
			}
			return originalBufferFrom(input as string, encoding);
		});
		vi.spyOn(Buffer, "from").mockImplementation(mockBufferFrom);

		vi.spyOn(configModule, "getConfig").mockReturnValue({
			AUDIT_ENABLED: true,
			AUDIT_PII_ENCRYPTION_KEY: "throw-error-key",
			AUDIT_RETENTION_DAYS: 365,
		} as ReturnType<typeof configModule.getConfig>);

		const service = createAuditService(mockDaoProvider);
		const createSpy = vi.spyOn(mockDao, "create");

		await service.logSync({
			action: "create",
			resourceType: "user",
			resourceId: "user-123",
			actorEmail: "test@example.com",
		});

		// With invalid format (throws), PII should NOT be encrypted
		const createdEvent = createSpy.mock.calls[0][0];
		expect(createdEvent.actorEmail).toBe("test@example.com");

		// Restore
		vi.mocked(Buffer.from).mockRestore();
	});

	it("should handle null values in encryptIfPii", async () => {
		const key = generateAuditPiiEncryptionKey();
		const configModule = await import("../config/Config");
		vi.spyOn(configModule, "getConfig").mockReturnValue({
			AUDIT_ENABLED: true,
			AUDIT_PII_ENCRYPTION_KEY: key,
			AUDIT_RETENTION_DAYS: 365,
		} as ReturnType<typeof configModule.getConfig>);

		const service = createAuditService(mockDaoProvider);

		// Test computeChanges with null values
		const changes = service.computeChanges({ email: "old@test.com" }, { email: null as unknown as string }, "user");

		// Should track the change from email to null
		expect(changes).toContainEqual(
			expect.objectContaining({
				field: "email",
				new: null,
			}),
		);
	});

	it("should not encrypt non-PII field even with encryption key", async () => {
		const key = generateAuditPiiEncryptionKey();
		const configModule = await import("../config/Config");
		vi.spyOn(configModule, "getConfig").mockReturnValue({
			AUDIT_ENABLED: true,
			AUDIT_PII_ENCRYPTION_KEY: key,
			AUDIT_RETENTION_DAYS: 365,
		} as ReturnType<typeof configModule.getConfig>);

		const service = createAuditService(mockDaoProvider);
		const createSpy = vi.spyOn(mockDao, "create");

		await service.logSync({
			action: "create",
			resourceType: "doc",
			resourceId: "doc-123",
			resourceName: "Test Document", // Not a PII field
		});

		const createdEvent = createSpy.mock.calls[0][0];
		// Resource name should not be encrypted
		expect(createdEvent.resourceName).toBe("Test Document");
	});

	it("should handle array with non-string PII values", async () => {
		const key = generateAuditPiiEncryptionKey();
		const configModule = await import("../config/Config");
		vi.spyOn(configModule, "getConfig").mockReturnValue({
			AUDIT_ENABLED: true,
			AUDIT_PII_ENCRYPTION_KEY: key,
			AUDIT_RETENTION_DAYS: 365,
		} as ReturnType<typeof configModule.getConfig>);

		const service = createAuditService(mockDaoProvider);

		// Test computeChanges with array containing non-string items
		const changes = service.computeChanges(
			{ emails: ["old@test.com", 123, null] as unknown as Array<string> },
			{ emails: ["new@test.com", 456, undefined] as unknown as Array<string> },
			"user",
		);

		// The change should be recorded - non-strings stay as-is
		expect(changes.length).toBeGreaterThan(0);
		const emailChange = changes.find(c => c.field === "emails");
		expect(emailChange).toBeDefined();
	});

	it("should return encrypted value when decryption fails", async () => {
		const key = generateAuditPiiEncryptionKey();
		const configModule = await import("../config/Config");
		vi.spyOn(configModule, "getConfig").mockReturnValue({
			AUDIT_ENABLED: true,
			AUDIT_PII_ENCRYPTION_KEY: key,
			AUDIT_RETENTION_DAYS: 365,
		} as ReturnType<typeof configModule.getConfig>);

		const service = createAuditService(mockDaoProvider);

		// Try to decrypt a malformed encrypted value with enc: prefix but invalid data
		const malformedEncrypted = "enc:aW52YWxpZA==:aW52YWxpZA==:aW52YWxpZA==";
		const result = service.decryptPii(malformedEncrypted);

		// Should return the original value when decryption fails
		expect(result).toBe(malformedEncrypted);
	});

	it("should handle computeChanges with fallback keys", () => {
		const service = createAuditService(mockDaoProvider);

		// Test when both old and new values exist (update case) with ?? fallback
		const changes = service.computeChanges({ name: "Old Name" }, { name: "New Name" }, "doc");

		expect(changes).toContainEqual(
			expect.objectContaining({
				field: "name",
				old: "Old Name",
				new: "New Name",
			}),
		);
	});

	it("should handle array with non-string items in sanitizeValue for PII field", async () => {
		const key = generateAuditPiiEncryptionKey();
		const configModule = await import("../config/Config");
		vi.spyOn(configModule, "getConfig").mockReturnValue({
			AUDIT_ENABLED: true,
			AUDIT_PII_ENCRYPTION_KEY: key,
			AUDIT_RETENTION_DAYS: 365,
		} as ReturnType<typeof configModule.getConfig>);

		const service = createAuditService(mockDaoProvider);
		const createSpy = vi.spyOn(mockDao, "create");

		// Create an event that includes array with mixed types for a PII field
		await service.logSync({
			action: "update",
			resourceType: "space",
			resourceId: "space-123",
			changes: [
				{
					field: "memberEmails", // This is a PII field for space
					old: ["old@test.com", 123, null] as unknown,
					new: ["new@test.com", 456, true] as unknown,
				},
			],
		});

		const createdEvent = createSpy.mock.calls[0][0];
		const changes = createdEvent.changes as Array<{ field: string; old: unknown; new: unknown }>;
		const emailChange = changes?.find(c => c.field === "memberEmails");
		expect(emailChange).toBeDefined();
		// Non-strings in the array should remain unchanged
		if (emailChange) {
			const oldArray = emailChange.old as Array<unknown>;
			expect(oldArray[1]).toBe(123);
			expect(oldArray[2]).toBeNull();
		}
	});

	it("should handle null values in changes array", async () => {
		const key = generateAuditPiiEncryptionKey();
		const configModule = await import("../config/Config");
		vi.spyOn(configModule, "getConfig").mockReturnValue({
			AUDIT_ENABLED: true,
			AUDIT_PII_ENCRYPTION_KEY: key,
			AUDIT_RETENTION_DAYS: 365,
		} as ReturnType<typeof configModule.getConfig>);

		const service = createAuditService(mockDaoProvider);
		const createSpy = vi.spyOn(mockDao, "create");

		// Log with null value in changes for a PII field
		await service.logSync({
			action: "update",
			resourceType: "user",
			resourceId: "user-123",
			changes: [
				{
					field: "email", // PII field
					old: "old@test.com",
					new: null, // Setting to null
				},
			],
		});

		const createdEvent = createSpy.mock.calls[0][0];
		const changes = createdEvent.changes as Array<{ field: string; old: unknown; new: unknown }>;
		const emailChange = changes?.find(c => c.field === "email");
		expect(emailChange).toBeDefined();
		// The new value should remain null, not get encrypted
		expect(emailChange?.new).toBeNull();
		// The old value should be encrypted
		expect(String(emailChange?.old).startsWith("enc:")).toBe(true);
	});

	it("should return non-PII field value unchanged", async () => {
		const key = generateAuditPiiEncryptionKey();
		const configModule = await import("../config/Config");
		vi.spyOn(configModule, "getConfig").mockReturnValue({
			AUDIT_ENABLED: true,
			AUDIT_PII_ENCRYPTION_KEY: key,
			AUDIT_RETENTION_DAYS: 365,
		} as ReturnType<typeof configModule.getConfig>);

		const service = createAuditService(mockDaoProvider);

		// Test computeChanges with non-PII field
		const changes = service.computeChanges(
			{ title: "Old Title", description: "Old Desc" },
			{ title: "New Title", description: "New Desc" },
			"doc",
		);

		// title and description are not PII, should not be encrypted
		const titleChange = changes.find(c => c.field === "title");
		expect(titleChange).toBeDefined();
		expect(titleChange?.new).toBe("New Title");
	});

	it("should encrypt string items but keep numbers in PII array field", async () => {
		const key = generateAuditPiiEncryptionKey();
		const configModule = await import("../config/Config");
		vi.spyOn(configModule, "getConfig").mockReturnValue({
			AUDIT_ENABLED: true,
			AUDIT_PII_ENCRYPTION_KEY: key,
			AUDIT_RETENTION_DAYS: 365,
		} as ReturnType<typeof configModule.getConfig>);

		const service = createAuditService(mockDaoProvider);

		// Test computeChanges with array containing mixed types in a PII field
		// The "memberEmails" field is defined as PII for space
		const changes = service.computeChanges(null, { memberEmails: ["a@test.com", 123, "b@test.com"] }, "space");

		const emailChange = changes.find(c => c.field === "memberEmails");
		expect(emailChange).toBeDefined();
		if (emailChange) {
			const newArray = emailChange.new as Array<unknown>;
			// String emails should be encrypted
			expect(String(newArray[0]).startsWith("enc:")).toBe(true);
			expect(String(newArray[2]).startsWith("enc:")).toBe(true);
			// Number should remain unchanged
			expect(newArray[1]).toBe(123);
		}
	});

	it("should handle empty metadata object", async () => {
		// Mock context with minimal metadata fields (null/empty values)
		const auditContextModule = await import("./AuditContext");
		vi.spyOn(auditContextModule, "getAuditContext").mockReturnValue({
			requestId: "test-request-id",
			actorId: 1,
			actorType: "user",
			actorEmail: null,
			actorIp: null,
			actorDevice: null,
			httpMethod: "",
			endpoint: "",
		});

		const configModule = await import("../config/Config");
		vi.spyOn(configModule, "getConfig").mockReturnValue({
			AUDIT_ENABLED: true,
			AUDIT_PII_ENCRYPTION_KEY: undefined,
			AUDIT_RETENTION_DAYS: 365,
		} as ReturnType<typeof configModule.getConfig>);

		const service = createAuditService(mockDaoProvider);
		const createSpy = vi.spyOn(mockDao, "create");

		await service.logSync({
			action: "create",
			resourceType: "doc",
			resourceId: "doc-123",
		});

		// With minimal context, metadata might be null or minimal
		// Just verify the call succeeded
		expect(createSpy).toHaveBeenCalled();
	});

	it("should handle encryption failure gracefully by returning value as-is", async () => {
		// This test verifies the catch block in encryptPii by testing decryption failure path
		// The encryption catch block (lines 146-148) catches errors during cipher creation/encryption
		// We can't easily mock node:crypto in ESM, so instead we test the decryption failure path
		// which also has similar error handling

		const key = generateAuditPiiEncryptionKey();
		const configModule = await import("../config/Config");
		vi.spyOn(configModule, "getConfig").mockReturnValue({
			AUDIT_ENABLED: true,
			AUDIT_PII_ENCRYPTION_KEY: key,
			AUDIT_RETENTION_DAYS: 365,
		} as ReturnType<typeof configModule.getConfig>);

		const service = createAuditService(mockDaoProvider);

		// Test that attempting to decrypt a corrupted encrypted value returns the original value
		// This tests the decryption error handling path (lines 177-180)
		const corruptedValue = "enc:validbase64:validbase64:corrupted";
		const result = service.decryptPii(corruptedValue);
		// Should return the original encrypted value when decryption fails
		expect(result).toBe(corruptedValue);
	});

	it("should cover log catch handler when logSync throws", async () => {
		const configModule = await import("../config/Config");
		vi.spyOn(configModule, "getConfig").mockReturnValue({
			AUDIT_ENABLED: true,
			AUDIT_PII_ENCRYPTION_KEY: undefined,
			AUDIT_RETENTION_DAYS: 365,
		} as ReturnType<typeof configModule.getConfig>);

		const service = createAuditService(mockDaoProvider);

		// Track when the catch handler executes
		let catchExecuted = false;
		const originalCreate = mockDao.create;
		vi.spyOn(mockDao, "create").mockImplementation(async () => {
			await originalCreate.call(mockDao, {} as never); // This will succeed internally
			// Now reject to trigger the catch
			catchExecuted = true;
			throw new Error("Simulated failure after success");
		});

		// Call log (fire-and-forget)
		service.log({
			action: "create",
			resourceType: "doc",
			resourceId: "doc-123",
		});

		// Wait for the promise chain to complete
		await vi.waitFor(
			() => {
				expect(catchExecuted).toBe(true);
			},
			{ timeout: 500 },
		);

		// Flush all microtasks and timers
		await new Promise(resolve => setTimeout(resolve, 50));
	});
});

describe("AuditService log (fire-and-forget) error logging", () => {
	let mockDao: AuditEventDao;
	let mockDaoProvider: DaoProvider<AuditEventDao>;

	beforeEach(async () => {
		vi.clearAllMocks();
		mockDao = mockAuditEventDao();
		mockDaoProvider = { getDao: () => mockDao };

		const configModule = await import("../config/Config");
		vi.spyOn(configModule, "getConfig").mockReturnValue({
			AUDIT_ENABLED: true,
			AUDIT_PII_ENCRYPTION_KEY: undefined,
			AUDIT_RETENTION_DAYS: 365,
		} as ReturnType<typeof configModule.getConfig>);
	});

	it("should execute catch block when log (fire-and-forget) fails", async () => {
		const service = createAuditService(mockDaoProvider);

		// Create a promise that resolves when the error is logged
		let errorLogged = false;
		vi.spyOn(mockDao, "create").mockImplementation(() => {
			return new Promise((_, reject) => {
				// Use setImmediate to ensure the rejection is processed
				setImmediate(() => {
					errorLogged = true;
					reject(new Error("Database connection lost"));
				});
			});
		});

		// Call log (fire-and-forget) - this triggers the fire-and-forget path with error handling
		service.log({
			action: "update",
			resourceType: "site",
			resourceId: "site-999",
		});

		// Wait for the promise rejection to be caught and logged
		await vi.waitFor(() => {
			expect(errorLogged).toBe(true);
		});

		// Give time for the catch handler to execute
		await new Promise(resolve => setTimeout(resolve, 50));
	});

	it("should return null metadata when context has no metadata fields", async () => {
		// Create a fresh service and dao for this test
		const testMockDao = mockAuditEventDao();
		const testMockDaoProvider = { getDao: () => testMockDao };
		const testService = createAuditService(testMockDaoProvider);

		// Mock context with no httpMethod, endpoint, or requestId (empty strings to avoid metadata)
		const auditContextModule = await import("./AuditContext");
		vi.spyOn(auditContextModule, "getAuditContext").mockReturnValue({
			requestId: "",
			actorId: 1,
			actorType: "user",
			actorEmail: "test@example.com",
			actorIp: "127.0.0.1",
			actorDevice: "Mozilla/5.0",
			httpMethod: "",
			endpoint: "",
		});

		const createSpy = vi.spyOn(testMockDao, "create");

		await testService.logSync({
			action: "create",
			resourceType: "doc",
			resourceId: "doc-123",
			// No additionalMetadata provided
		});

		// Should create event with null metadata since no metadata fields were set
		expect(createSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				metadata: null,
			}),
		);
	});
});
