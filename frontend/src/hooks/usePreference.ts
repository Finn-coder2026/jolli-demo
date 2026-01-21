/**
 * React hooks for working with preferences.
 *
 * These hooks provide a convenient way to read and write preferences
 * with automatic re-rendering when preferences change.
 */

import { usePreferencesContextKey, usePreferencesService } from "../contexts/PreferencesContext";
import type { PreferenceDefinition } from "../services/preferences";
import { useCallback, useEffect, useState } from "react";

/**
 * Hook to read and write a single preference with automatic re-renders.
 *
 * @param definition - The preference definition
 * @returns A tuple of [value, setValue] similar to useState
 *
 * @example
 * ```tsx
 * function ThemeToggle() {
 *   const [theme, setTheme] = usePreference(PREFERENCES.theme);
 *   return (
 *     <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
 *       Current: {theme}
 *     </button>
 *   );
 * }
 * ```
 */
export function usePreference<T>(definition: PreferenceDefinition<T>): [T, (value: T) => void] {
	const service = usePreferencesService();
	const contextKey = usePreferencesContextKey();
	const [value, setValue] = useState<T>(() => service.get(definition));

	// Subscribe to changes (including from other tabs)
	// Also re-read when contextKey changes (tenant context updated)
	useEffect(() => {
		// Re-read the value when the component mounts, definition changes,
		// or tenant context changes (contextKey updates)
		setValue(service.get(definition));

		const unsubscribe = service.subscribe(definition, (newValue: T) => {
			setValue(newValue);
		});

		return unsubscribe;
	}, [service, definition, contextKey]);

	// Memoized setter function
	const setPreference = useCallback(
		(newValue: T) => {
			service.set(definition, newValue);
			setValue(newValue);
		},
		[service, definition],
	);

	return [value, setPreference];
}

/**
 * Hook to read a preference value only (no setter).
 *
 * Use this when you only need to read a preference and don't need to update it.
 *
 * @param definition - The preference definition
 * @returns The current preference value
 *
 * @example
 * ```tsx
 * function ThemeDisplay() {
 *   const theme = usePreferenceValue(PREFERENCES.theme);
 *   return <div>Current theme: {theme}</div>;
 * }
 * ```
 */
export function usePreferenceValue<T>(definition: PreferenceDefinition<T>): T {
	const [value] = usePreference(definition);
	return value;
}

/**
 * Hook to get just the setter for a preference without tracking its value.
 *
 * Use this when you only need to update a preference and don't need to read it.
 * This avoids unnecessary re-renders when the preference changes.
 *
 * @param definition - The preference definition
 * @returns A setter function for the preference
 *
 * @example
 * ```tsx
 * function ThemeSetter() {
 *   const setTheme = usePreferenceSetter(PREFERENCES.theme);
 *   return <button onClick={() => setTheme("dark")}>Set Dark</button>;
 * }
 * ```
 */
export function usePreferenceSetter<T>(definition: PreferenceDefinition<T>): (value: T) => void {
	const service = usePreferencesService();

	return useCallback(
		(value: T) => {
			service.set(definition, value);
		},
		[service, definition],
	);
}
