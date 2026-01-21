import { usePreference } from "../hooks/usePreference";
import { PREFERENCES, usePreferencesService } from "./PreferencesContext";
import { createContext, type ReactElement, type ReactNode, useContext, useEffect, useMemo, useState } from "react";

interface ThemeContextType {
	isDarkMode: boolean;
	toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

/**
 * Provides theme context with dark mode toggle.
 *
 * Uses the preferences service for tenant-aware theme persistence.
 * Falls back to system preference when no saved theme exists.
 */
export function ThemeProvider({ children }: { children: ReactNode }): ReactElement {
	const [theme, setTheme] = usePreference(PREFERENCES.theme);

	// Check system preference for initial value if no saved theme
	const [hasCheckedSystem, setHasCheckedSystem] = useState(false);
	const service = usePreferencesService();

	useEffect(() => {
		// Only check system preference once on mount
		if (!hasCheckedSystem) {
			setHasCheckedSystem(true);
			const savedTheme = service.get(PREFERENCES.theme);
			// If using default value (not explicitly saved), check system preference
			if (savedTheme === PREFERENCES.theme.defaultValue) {
				const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
				if (systemPrefersDark) {
					setTheme("dark");
				}
			}
		}
	}, [hasCheckedSystem, service, setTheme]);

	const isDarkMode = theme === "dark";

	// Apply dark class to document
	useEffect(() => {
		if (isDarkMode) {
			document.documentElement.classList.add("dark");
		} else {
			document.documentElement.classList.remove("dark");
		}
	}, [isDarkMode]);

	function toggleTheme(): void {
		setTheme(isDarkMode ? "light" : "dark");
	}

	const value = useMemo(() => ({ isDarkMode, toggleTheme }), [isDarkMode]);

	return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextType {
	const context = useContext(ThemeContext);
	if (context === undefined) {
		throw new Error("useTheme must be used within a ThemeProvider");
	}
	return context;
}
