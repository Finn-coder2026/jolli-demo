"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import type { UserRole } from "@/lib/db/models";

/** User information from the auth API */
interface User {
	id: number;
	email: string;
	name: string | null;
	picture: string | null;
	role: UserRole;
}

/** Auth context value */
interface AuthContextValue {
	user: User | null;
	loading: boolean;
	error: string | null;
	login: () => Promise<void>;
	logout: () => Promise<void>;
	refresh: () => Promise<void>;
	isSuperAdmin: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface AuthProviderProps {
	children: ReactNode;
}

/**
 * Auth provider component that manages authentication state.
 */
export function AuthProvider({ children }: AuthProviderProps) {
	const [user, setUser] = useState<User | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	/**
	 * Fetch current user from API.
	 */
	const fetchUser = useCallback(async () => {
		try {
			const response = await fetch("/api/auth/me");

			if (response.status === 401) {
				// Not authenticated
				setUser(null);
				setError(null);
				return;
			}

			if (!response.ok) {
				throw new Error("Failed to fetch user");
			}

			const data = (await response.json()) as User;
			setUser(data);
			setError(null);
		} catch (err) {
			setUser(null);
			setError(err instanceof Error ? err.message : "Unknown error");
		}
	}, []);

	/**
	 * Initial fetch on mount.
	 */
	useEffect(() => {
		fetchUser().finally(() => setLoading(false));
	}, [fetchUser]);

	/**
	 * Initiate login flow.
	 */
	const login = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);

			const response = await fetch("/api/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
			});

			if (!response.ok) {
				const data = (await response.json()) as { error?: string };
				throw new Error(data.error || "Failed to initiate login");
			}

			const { redirectUrl } = (await response.json()) as { redirectUrl: string };

			// Redirect to OAuth provider
			window.location.href = redirectUrl;
		} catch (err) {
			setError(err instanceof Error ? err.message : "Unknown error");
			setLoading(false);
		}
	}, []);

	/**
	 * Logout current user.
	 */
	const logout = useCallback(async () => {
		try {
			setLoading(true);

			await fetch("/api/auth/logout", {
				method: "POST",
			});

			setUser(null);
			setError(null);

			// Redirect to login page
			window.location.href = "/login";
		} catch (err) {
			setError(err instanceof Error ? err.message : "Unknown error");
		} finally {
			setLoading(false);
		}
	}, []);

	/**
	 * Refresh user data.
	 */
	const refresh = useCallback(async () => {
		setLoading(true);
		await fetchUser();
		setLoading(false);
	}, [fetchUser]);

	const isSuperAdmin = user?.role === "super_admin";

	const value: AuthContextValue = {
		user,
		loading,
		error,
		login,
		logout,
		refresh,
		isSuperAdmin,
	};

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook to access auth context.
 * Must be used within an AuthProvider.
 */
export function useAuth(): AuthContextValue {
	const context = useContext(AuthContext);
	if (context === undefined) {
		throw new Error("useAuth must be used within an AuthProvider");
	}
	return context;
}
