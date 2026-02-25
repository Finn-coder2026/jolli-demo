import { usePreference } from "../hooks/usePreference";
import { PREFERENCES } from "./PreferencesContext";
import { createContext, type ReactElement, type ReactNode, useContext, useEffect, useMemo, useState } from "react";

export type ThemeMode = "system" | "light" | "dark";

interface ThemeContextType {
	isDarkMode: boolean;
	themeMode: ThemeMode;
	setThemeMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

/**
 * Provides theme context with system, light, and dark mode support.
 *
 * Uses the preferences service for tenant-aware theme persistence.
 * When theme is "system", follows the system preference.
 */
export function ThemeProvider({ children }: { children: ReactNode }): ReactElement {
	const [themeMode, setThemeMode] = usePreference(PREFERENCES.theme);
	const [systemPrefersDark, setSystemPrefersDark] = useState(
		window.matchMedia("(prefers-color-scheme: dark)").matches,
	);

	// Listen for system theme changes
	useEffect(() => {
		const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
		function handleChange(e: MediaQueryListEvent) {
			setSystemPrefersDark(e.matches);
		}
		mediaQuery.addEventListener("change", handleChange);
		return () => mediaQuery.removeEventListener("change", handleChange);
	}, []);

	// Determine if dark mode should be active
	const isDarkMode = themeMode === "dark" || (themeMode === "system" && systemPrefersDark);

	// Apply dark class to document
	useEffect(() => {
		if (isDarkMode) {
			document.documentElement.classList.add("dark");
		} else {
			document.documentElement.classList.remove("dark");
		}
	}, [isDarkMode]);

	const value = useMemo(() => ({ isDarkMode, themeMode, setThemeMode }), [isDarkMode, themeMode]);

	return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextType {
	const context = useContext(ThemeContext);
	if (context === undefined) {
		throw new Error("useTheme must be used within a ThemeProvider");
	}
	return context;
}
