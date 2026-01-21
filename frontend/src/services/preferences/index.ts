/**
 * Preferences service public API.
 *
 * @example
 * ```typescript
 * import { PreferencesService, PREFERENCES, localStorageBackend } from "../services/preferences";
 *
 * const service = new PreferencesService(localStorageBackend, {
 *   isMultiTenant: false,
 *   tenantSlug: null,
 *   orgSlug: null,
 * });
 *
 * // Get a preference
 * const theme = service.get(PREFERENCES.theme);
 *
 * // Set a preference
 * service.set(PREFERENCES.theme, "dark");
 * ```
 */

// Storage backends
export { LocalStorageBackend, localStorageBackend } from "./LocalStorageBackend";
export type { PreferenceValue } from "./PreferencesRegistry";
// Preference definitions
export { PREFERENCES } from "./PreferencesRegistry";
// Service
export type { PreferenceChangeCallback } from "./PreferencesService";
export { PreferencesService } from "./PreferencesService";
// Core types
export type { PreferenceDefinition, PreferenceScope, StorageBackend, TenantContext } from "./PreferencesTypes";
// Type utilities
export { createDynamicPreference, definePreference, Serializers } from "./PreferencesTypes";
