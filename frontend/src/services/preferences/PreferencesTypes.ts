/**
 * Types and interfaces for the preferences service.
 *
 * The preferences service provides a centralized way to manage user preferences
 * with support for multi-tenancy and different storage backends.
 */

/**
 * Storage backend interface - allows for different implementations
 * (localStorage, sessionStorage, remote API, etc.)
 */
export interface StorageBackend {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

/**
 * Tenant context for key generation.
 * Used to prefix storage keys in multi-tenant mode.
 */
export interface TenantContext {
	/** Whether the app is running in multi-tenant mode */
	isMultiTenant: boolean;
	/** The current tenant's slug (e.g., "acme-corp") */
	tenantSlug: string | null;
	/** The current org's slug (e.g., "engineering") */
	orgSlug: string | null;
}

/**
 * Preference scope determines the key prefix strategy.
 *
 * - "global": Never tenant-prefixed (e.g., logging config, session tracking)
 * - "tenant": Prefixed with tenant slug when in multi-tenant mode
 * - "tenant-org": Prefixed with tenant and org slugs when in multi-tenant mode
 */
export type PreferenceScope = "global" | "tenant" | "tenant-org";

/**
 * Serializer functions for converting between stored strings and typed values.
 */
export interface PreferenceSerializer<T> {
	serialize: (value: T) => string;
	deserialize: (value: string) => T;
}

/**
 * Common serializers for standard data types.
 */
export const Serializers = {
	string: {
		serialize: (value: string): string => value,
		deserialize: (value: string): string => value,
	},
	boolean: {
		serialize: (value: boolean): string => String(value),
		deserialize: (value: string): boolean => value === "true",
	},
	number: {
		serialize: (value: number): string => String(value),
		deserialize: (value: string): number => Number.parseFloat(value),
	},
	nullableString: {
		serialize: (value: string | null): string => value ?? "",
		deserialize: (value: string): string | null => (value === "" ? null : value),
	},
	nullableNumber: {
		serialize: (value: number | null): string => (value === null ? "" : String(value)),
		deserialize: (value: string): number | null => (value === "" ? null : Number.parseInt(value, 10)),
	},
	numberArray: {
		serialize: (value: Array<number>): string => JSON.stringify(value),
		deserialize: (value: string): Array<number> => {
			try {
				const parsed = JSON.parse(value);
				return Array.isArray(parsed) ? parsed : [];
			} catch {
				return [];
			}
		},
	},
} as const;

/**
 * Definition of a preference with metadata for storage and type safety.
 *
 * @template T - The type of the preference value
 */
export interface PreferenceDefinition<T> {
	/** The base key used for storage (will be prefixed based on scope) */
	key: string;
	/** Determines how the key is prefixed in multi-tenant mode */
	scope: PreferenceScope;
	/** Default value when preference is not set */
	defaultValue: T;
	/** Function to convert value to string for storage */
	serialize: (value: T) => string;
	/** Function to convert stored string back to typed value */
	deserialize: (value: string) => T;
	/** Optional validation function */
	validate?: (value: T) => boolean;
}

/**
 * Helper to create a preference definition with type inference.
 */
export function definePreference<T>(definition: PreferenceDefinition<T>): PreferenceDefinition<T> {
	return definition;
}

/**
 * Creates a dynamic preference definition factory for preferences with variable keys.
 * Useful for things like panel widths where each panel has its own key.
 *
 * @example
 * const panelWidth = createDynamicPreference((storageKey) => ({
 *   key: `panels:${storageKey}`,
 *   scope: "tenant",
 *   defaultValue: 50,
 *   ...Serializers.number,
 * }));
 *
 * // Usage:
 * service.get(panelWidth("leftPanel"));
 */
export function createDynamicPreference<T, Args extends Array<unknown>>(
	factory: (...args: Args) => PreferenceDefinition<T>,
): (...args: Args) => PreferenceDefinition<T> {
	return factory;
}
