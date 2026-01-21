/**
 * Centralized preferences service with tenant-aware key generation.
 *
 * Key generation strategy:
 * - Global scope: Use key as-is (e.g., "LOG_LEVEL")
 * - Tenant scope (multi-tenant): "jolli:{tenantSlug}:{key}"
 * - Tenant scope (single-tenant): "{key}" (backwards compatible)
 * - Tenant-org scope (multi-tenant): "jolli:{tenantSlug}:{orgSlug}:{key}"
 * - Tenant-org scope (single-tenant): "{key}" (backwards compatible)
 */

import type { PreferenceDefinition, StorageBackend, TenantContext } from "./PreferencesTypes";

/**
 * Callback type for preference change listeners.
 */
export type PreferenceChangeCallback<T> = (value: T) => void;

/**
 * Service for managing user preferences with multi-tenant support.
 *
 * @example
 * ```typescript
 * const service = new PreferencesService(localStorageBackend, {
 *   isMultiTenant: true,
 *   tenantSlug: "acme",
 *   orgSlug: "engineering",
 * });
 *
 * // Get a preference
 * const theme = service.get(PREFERENCES.theme);
 *
 * // Set a preference
 * service.set(PREFERENCES.theme, "dark");
 * ```
 */
export class PreferencesService {
	private storage: StorageBackend;
	private tenantContext: TenantContext;
	private listeners: Map<string, Set<PreferenceChangeCallback<unknown>>> = new Map();
	private storageEventHandler: ((event: StorageEvent) => void) | null = null;

	constructor(storage: StorageBackend, tenantContext: TenantContext) {
		this.storage = storage;
		this.tenantContext = tenantContext;
		this.setupStorageEventListener();
	}

	/**
	 * Sets up a listener for storage events to handle cross-tab synchronization.
	 */
	private setupStorageEventListener(): void {
		if (typeof window === "undefined") {
			return;
		}

		this.storageEventHandler = (event: StorageEvent) => {
			if (!event.key) {
				return;
			}

			// Find which preference this key belongs to and notify listeners
			for (const [prefKey, callbacks] of this.listeners.entries()) {
				if (event.key === prefKey && callbacks.size > 0) {
					// Notify all listeners with the new value
					for (const callback of callbacks) {
						try {
							callback(event.newValue);
						} catch {
							// Ignore callback errors
						}
					}
				}
			}
		};

		window.addEventListener("storage", this.storageEventHandler);
	}

	/**
	 * Cleans up event listeners. Call this when the service is no longer needed.
	 */
	destroy(): void {
		if (this.storageEventHandler && typeof window !== "undefined") {
			window.removeEventListener("storage", this.storageEventHandler);
			this.storageEventHandler = null;
		}
		this.listeners.clear();
	}

	/**
	 * Updates the tenant context. This should be called when the user switches
	 * tenants or orgs.
	 */
	setTenantContext(context: TenantContext): void {
		this.tenantContext = context;
	}

	/**
	 * Gets the current tenant context.
	 */
	getTenantContext(): TenantContext {
		return this.tenantContext;
	}

	/**
	 * Generates the storage key based on scope and tenant context.
	 *
	 * @param baseKey - The base preference key
	 * @param scope - The preference scope
	 * @returns The full storage key with appropriate prefix
	 */
	generateKey(baseKey: string, scope: "global" | "tenant" | "tenant-org"): string {
		// Global scope keys are never prefixed
		if (scope === "global") {
			return baseKey;
		}

		// In single-tenant mode, use unprefixed keys for backwards compatibility
		if (!this.tenantContext.isMultiTenant) {
			return baseKey;
		}

		const { tenantSlug, orgSlug } = this.tenantContext;

		// In multi-tenant mode, prefix with tenant (and optionally org)
		if (scope === "tenant") {
			return `jolli:${tenantSlug}:${baseKey}`;
		}

		// tenant-org scope
		return `jolli:${tenantSlug}:${orgSlug}:${baseKey}`;
	}

	/**
	 * Gets a preference value.
	 *
	 * @param definition - The preference definition
	 * @returns The stored value, or the default value if not found
	 */
	get<T>(definition: PreferenceDefinition<T>): T {
		const key = this.generateKey(definition.key, definition.scope);
		const stored = this.storage.getItem(key);

		if (stored === null) {
			return definition.defaultValue;
		}

		try {
			const value = definition.deserialize(stored);

			// Validate if validator is provided
			if (definition.validate && !definition.validate(value)) {
				return definition.defaultValue;
			}

			return value;
		} catch {
			// If deserialization fails, return default
			return definition.defaultValue;
		}
	}

	/**
	 * Sets a preference value.
	 *
	 * @param definition - The preference definition
	 * @param value - The value to store
	 */
	set<T>(definition: PreferenceDefinition<T>, value: T): void {
		// Validate before storing
		if (definition.validate && !definition.validate(value)) {
			return;
		}

		const key = this.generateKey(definition.key, definition.scope);
		const serialized = definition.serialize(value);
		this.storage.setItem(key, serialized);

		// Notify listeners (for same-tab updates; cross-tab is handled by storage event)
		this.notifyListeners(key, value);
	}

	/**
	 * Removes a preference, resetting it to the default value.
	 *
	 * @param definition - The preference definition
	 */
	remove<T>(definition: PreferenceDefinition<T>): void {
		const key = this.generateKey(definition.key, definition.scope);
		this.storage.removeItem(key);
		this.notifyListeners(key, definition.defaultValue);
	}

	/**
	 * Subscribes to changes for a specific preference.
	 * The callback is called when the preference changes (including from other tabs).
	 *
	 * @param definition - The preference definition
	 * @param callback - Function called when the preference changes
	 * @returns Unsubscribe function
	 */
	subscribe<T>(definition: PreferenceDefinition<T>, callback: PreferenceChangeCallback<T>): () => void {
		const key = this.generateKey(definition.key, definition.scope);

		if (!this.listeners.has(key)) {
			this.listeners.set(key, new Set());
		}

		const callbacks = this.listeners.get(key);
		callbacks?.add(callback as PreferenceChangeCallback<unknown>);

		// Return unsubscribe function
		return () => {
			callbacks?.delete(callback as PreferenceChangeCallback<unknown>);
			if (callbacks?.size === 0) {
				this.listeners.delete(key);
			}
		};
	}

	/**
	 * Notifies all listeners for a specific key.
	 */
	private notifyListeners<T>(key: string, value: T): void {
		const callbacks = this.listeners.get(key);
		if (!callbacks) {
			return;
		}

		for (const callback of callbacks) {
			try {
				callback(value);
			} catch {
				// Ignore callback errors
			}
		}
	}
}
