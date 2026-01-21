import { LocalStorageBackend } from "./LocalStorageBackend";
import { PREFERENCES } from "./PreferencesRegistry";
import { PreferencesService } from "./PreferencesService";
import { definePreference, Serializers, type StorageBackend, type TenantContext } from "./PreferencesTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("PreferencesService", () => {
	let mockStorage: StorageBackend;
	let storageData: Map<string, string>;

	beforeEach(() => {
		storageData = new Map();
		mockStorage = {
			getItem: (key: string) => storageData.get(key) ?? null,
			setItem: (key: string, value: string) => storageData.set(key, value),
			removeItem: (key: string) => storageData.delete(key),
		};
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("key generation", () => {
		it("should use unprefixed keys in single-tenant mode", () => {
			const context: TenantContext = {
				isMultiTenant: false,
				tenantSlug: null,
				orgSlug: null,
			};
			const service = new PreferencesService(mockStorage, context);

			expect(service.generateKey("theme", "tenant")).toBe("theme");
			expect(service.generateKey("filter", "tenant-org")).toBe("filter");
			expect(service.generateKey("LOG_LEVEL", "global")).toBe("LOG_LEVEL");

			service.destroy();
		});

		it("should prefix tenant-scope keys with tenant slug in multi-tenant mode", () => {
			const context: TenantContext = {
				isMultiTenant: true,
				tenantSlug: "acme",
				orgSlug: "engineering",
			};
			const service = new PreferencesService(mockStorage, context);

			expect(service.generateKey("theme", "tenant")).toBe("jolli:acme:theme");

			service.destroy();
		});

		it("should prefix tenant-org-scope keys with tenant and org slugs in multi-tenant mode", () => {
			const context: TenantContext = {
				isMultiTenant: true,
				tenantSlug: "acme",
				orgSlug: "engineering",
			};
			const service = new PreferencesService(mockStorage, context);

			expect(service.generateKey("filter", "tenant-org")).toBe("jolli:acme:engineering:filter");

			service.destroy();
		});

		it("should never prefix global-scope keys", () => {
			const context: TenantContext = {
				isMultiTenant: true,
				tenantSlug: "acme",
				orgSlug: "engineering",
			};
			const service = new PreferencesService(mockStorage, context);

			expect(service.generateKey("LOG_LEVEL", "global")).toBe("LOG_LEVEL");

			service.destroy();
		});
	});

	describe("get/set operations", () => {
		it("should return default value when preference is not set", () => {
			const context: TenantContext = {
				isMultiTenant: false,
				tenantSlug: null,
				orgSlug: null,
			};
			const service = new PreferencesService(mockStorage, context);

			expect(service.get(PREFERENCES.theme)).toBe("light");
			expect(service.get(PREFERENCES.sidebarCollapsed)).toBe(false);
			expect(service.get(PREFERENCES.chatWidth)).toBe(600);

			service.destroy();
		});

		it("should store and retrieve preference values", () => {
			const context: TenantContext = {
				isMultiTenant: false,
				tenantSlug: null,
				orgSlug: null,
			};
			const service = new PreferencesService(mockStorage, context);

			service.set(PREFERENCES.theme, "dark");
			expect(service.get(PREFERENCES.theme)).toBe("dark");

			service.set(PREFERENCES.sidebarCollapsed, true);
			expect(service.get(PREFERENCES.sidebarCollapsed)).toBe(true);

			service.set(PREFERENCES.chatWidth, 700);
			expect(service.get(PREFERENCES.chatWidth)).toBe(700);

			service.destroy();
		});

		it("should use correct storage keys in multi-tenant mode", () => {
			const context: TenantContext = {
				isMultiTenant: true,
				tenantSlug: "acme",
				orgSlug: "engineering",
			};
			const service = new PreferencesService(mockStorage, context);

			service.set(PREFERENCES.theme, "dark");
			expect(storageData.get("jolli:acme:theme")).toBe("dark");

			service.set(PREFERENCES.articlesDraftFilter, "my-new-drafts");
			expect(storageData.get("jolli:acme:engineering:articles.draftFilter")).toBe("my-new-drafts");

			service.destroy();
		});

		it("should validate values before storing", () => {
			const context: TenantContext = {
				isMultiTenant: false,
				tenantSlug: null,
				orgSlug: null,
			};
			const service = new PreferencesService(mockStorage, context);

			// Chat width must be between 300 and 800
			service.set(PREFERENCES.chatWidth, 1000);
			expect(service.get(PREFERENCES.chatWidth)).toBe(600); // Should return default

			// Theme must be "light" or "dark"
			// @ts-expect-error - testing invalid value
			service.set(PREFERENCES.theme, "invalid");
			expect(service.get(PREFERENCES.theme)).toBe("light"); // Should return default

			service.destroy();
		});

		it("should return default value when deserialization fails", () => {
			const context: TenantContext = {
				isMultiTenant: false,
				tenantSlug: null,
				orgSlug: null,
			};
			const service = new PreferencesService(mockStorage, context);

			// Store invalid data directly
			storageData.set("chatWidth", "not-a-number");

			// Should return default because NaN fails validation
			expect(service.get(PREFERENCES.chatWidth)).toBe(600);

			service.destroy();
		});

		it("should return default value when stored value fails validation", () => {
			const context: TenantContext = {
				isMultiTenant: false,
				tenantSlug: null,
				orgSlug: null,
			};
			const service = new PreferencesService(mockStorage, context);

			// Store a value that deserializes but fails validation
			storageData.set("chatWidth", "100"); // Below minimum of 300

			expect(service.get(PREFERENCES.chatWidth)).toBe(600);

			service.destroy();
		});
	});

	describe("remove operation", () => {
		it("should remove preference and return default value", () => {
			const context: TenantContext = {
				isMultiTenant: false,
				tenantSlug: null,
				orgSlug: null,
			};
			const service = new PreferencesService(mockStorage, context);

			service.set(PREFERENCES.theme, "dark");
			expect(service.get(PREFERENCES.theme)).toBe("dark");

			service.remove(PREFERENCES.theme);
			expect(service.get(PREFERENCES.theme)).toBe("light");
			expect(storageData.has("theme")).toBe(false);

			service.destroy();
		});
	});

	describe("tenant context updates", () => {
		it("should update tenant context", () => {
			const context: TenantContext = {
				isMultiTenant: false,
				tenantSlug: null,
				orgSlug: null,
			};
			const service = new PreferencesService(mockStorage, context);

			expect(service.getTenantContext().isMultiTenant).toBe(false);

			service.setTenantContext({
				isMultiTenant: true,
				tenantSlug: "acme",
				orgSlug: "engineering",
			});

			expect(service.getTenantContext().isMultiTenant).toBe(true);
			expect(service.getTenantContext().tenantSlug).toBe("acme");

			service.destroy();
		});

		it("should use new context for key generation after update", () => {
			const context: TenantContext = {
				isMultiTenant: false,
				tenantSlug: null,
				orgSlug: null,
			};
			const service = new PreferencesService(mockStorage, context);

			// Set value in single-tenant mode
			service.set(PREFERENCES.theme, "dark");
			expect(storageData.get("theme")).toBe("dark");

			// Switch to multi-tenant mode
			service.setTenantContext({
				isMultiTenant: true,
				tenantSlug: "acme",
				orgSlug: "engineering",
			});

			// New value should use prefixed key
			service.set(PREFERENCES.theme, "light");
			expect(storageData.get("jolli:acme:theme")).toBe("light");
			expect(storageData.get("theme")).toBe("dark"); // Old key unchanged

			service.destroy();
		});
	});

	describe("subscriptions", () => {
		it("should notify subscribers when preference changes", () => {
			const context: TenantContext = {
				isMultiTenant: false,
				tenantSlug: null,
				orgSlug: null,
			};
			const service = new PreferencesService(mockStorage, context);
			const callback = vi.fn();

			service.subscribe(PREFERENCES.theme, callback);
			service.set(PREFERENCES.theme, "dark");

			expect(callback).toHaveBeenCalledWith("dark");

			service.destroy();
		});

		it("should allow unsubscribing", () => {
			const context: TenantContext = {
				isMultiTenant: false,
				tenantSlug: null,
				orgSlug: null,
			};
			const service = new PreferencesService(mockStorage, context);
			const callback = vi.fn();

			const unsubscribe = service.subscribe(PREFERENCES.theme, callback);
			unsubscribe();

			service.set(PREFERENCES.theme, "dark");
			expect(callback).not.toHaveBeenCalled();

			service.destroy();
		});

		it("should notify subscribers on remove", () => {
			const context: TenantContext = {
				isMultiTenant: false,
				tenantSlug: null,
				orgSlug: null,
			};
			const service = new PreferencesService(mockStorage, context);
			const callback = vi.fn();

			service.set(PREFERENCES.theme, "dark");
			service.subscribe(PREFERENCES.theme, callback);
			service.remove(PREFERENCES.theme);

			expect(callback).toHaveBeenCalledWith("light"); // Default value

			service.destroy();
		});

		it("should handle callback errors gracefully", () => {
			const context: TenantContext = {
				isMultiTenant: false,
				tenantSlug: null,
				orgSlug: null,
			};
			const service = new PreferencesService(mockStorage, context);
			const errorCallback = vi.fn(() => {
				throw new Error("Callback error");
			});
			const normalCallback = vi.fn();

			service.subscribe(PREFERENCES.theme, errorCallback);
			service.subscribe(PREFERENCES.theme, normalCallback);

			// Should not throw and should call both callbacks
			service.set(PREFERENCES.theme, "dark");

			expect(errorCallback).toHaveBeenCalled();
			expect(normalCallback).toHaveBeenCalled();

			service.destroy();
		});
	});

	describe("dynamic preferences", () => {
		it("should work with dynamic preference definitions", () => {
			const context: TenantContext = {
				isMultiTenant: false,
				tenantSlug: null,
				orgSlug: null,
			};
			const service = new PreferencesService(mockStorage, context);

			service.set(PREFERENCES.panelWidth("leftPanel"), 40);
			expect(service.get(PREFERENCES.panelWidth("leftPanel"))).toBe(40);

			service.set(PREFERENCES.panelWidth("rightPanel"), 60);
			expect(service.get(PREFERENCES.panelWidth("rightPanel"))).toBe(60);

			// Each panel has its own value
			expect(service.get(PREFERENCES.panelWidth("leftPanel"))).toBe(40);

			service.destroy();
		});

		it("should generate correct keys for dynamic preferences in multi-tenant mode", () => {
			const context: TenantContext = {
				isMultiTenant: true,
				tenantSlug: "acme",
				orgSlug: "engineering",
			};
			const service = new PreferencesService(mockStorage, context);

			service.set(PREFERENCES.panelWidth("leftPanel"), 40);
			expect(storageData.get("jolli:acme:leftPanel")).toBe("40");

			service.destroy();
		});
	});

	describe("destroy", () => {
		it("should clean up listeners on destroy", () => {
			const context: TenantContext = {
				isMultiTenant: false,
				tenantSlug: null,
				orgSlug: null,
			};
			const service = new PreferencesService(mockStorage, context);
			const callback = vi.fn();

			service.subscribe(PREFERENCES.theme, callback);
			service.destroy();

			// After destroy, setting should not notify
			service.set(PREFERENCES.theme, "dark");
			expect(callback).not.toHaveBeenCalled();
		});
	});
});

describe("LocalStorageBackend", () => {
	let backend: LocalStorageBackend;

	beforeEach(() => {
		localStorage.clear();
		backend = new LocalStorageBackend();
	});

	afterEach(() => {
		localStorage.clear();
	});

	it("should get and set items", () => {
		backend.setItem("test-key", "test-value");
		expect(backend.getItem("test-key")).toBe("test-value");
	});

	it("should return null for non-existent keys", () => {
		expect(backend.getItem("non-existent")).toBeNull();
	});

	it("should remove items", () => {
		backend.setItem("test-key", "test-value");
		backend.removeItem("test-key");
		expect(backend.getItem("test-key")).toBeNull();
	});

	it("should handle localStorage errors gracefully", () => {
		// Mock localStorage to throw errors
		const originalGetItem = localStorage.getItem;
		const originalSetItem = localStorage.setItem;
		const originalRemoveItem = localStorage.removeItem;

		vi.spyOn(localStorage, "getItem").mockImplementation(() => {
			throw new Error("Storage error");
		});
		vi.spyOn(localStorage, "setItem").mockImplementation(() => {
			throw new Error("Storage error");
		});
		vi.spyOn(localStorage, "removeItem").mockImplementation(() => {
			throw new Error("Storage error");
		});

		// Should not throw and should return null/undefined gracefully
		expect(backend.getItem("test-key")).toBeNull();
		expect(() => backend.setItem("test-key", "value")).not.toThrow();
		expect(() => backend.removeItem("test-key")).not.toThrow();

		// Restore original implementations
		localStorage.getItem = originalGetItem;
		localStorage.setItem = originalSetItem;
		localStorage.removeItem = originalRemoveItem;
	});
});

describe("PreferencesTypes utilities", () => {
	describe("Serializers", () => {
		it("should serialize and deserialize strings", () => {
			expect(Serializers.string.serialize("hello")).toBe("hello");
			expect(Serializers.string.deserialize("hello")).toBe("hello");
		});

		it("should serialize and deserialize booleans", () => {
			expect(Serializers.boolean.serialize(true)).toBe("true");
			expect(Serializers.boolean.serialize(false)).toBe("false");
			expect(Serializers.boolean.deserialize("true")).toBe(true);
			expect(Serializers.boolean.deserialize("false")).toBe(false);
		});

		it("should serialize and deserialize numbers", () => {
			expect(Serializers.number.serialize(42)).toBe("42");
			expect(Serializers.number.serialize(3.14)).toBe("3.14");
			expect(Serializers.number.deserialize("42")).toBe(42);
			expect(Serializers.number.deserialize("3.14")).toBe(3.14);
		});

		it("should serialize and deserialize nullable strings", () => {
			expect(Serializers.nullableString.serialize("hello")).toBe("hello");
			expect(Serializers.nullableString.serialize(null)).toBe("");
			expect(Serializers.nullableString.deserialize("hello")).toBe("hello");
			expect(Serializers.nullableString.deserialize("")).toBeNull();
		});
	});

	describe("definePreference", () => {
		it("should create preference definitions", () => {
			const pref = definePreference({
				key: "test",
				scope: "global",
				defaultValue: "default",
				...Serializers.string,
			});

			expect(pref.key).toBe("test");
			expect(pref.scope).toBe("global");
			expect(pref.defaultValue).toBe("default");
		});
	});
});
