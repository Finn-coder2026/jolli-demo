"use client";

import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";

interface MainLayoutProps {
	children: ReactNode;
}

/** Pages that should not show the main layout (login, etc.) */
const NO_LAYOUT_PATHS = ["/login"];

export function MainLayout({ children }: MainLayoutProps) {
	const pathname = usePathname();
	const router = useRouter();
	const { user, loading } = useAuth();

	// Don't show layout on login page or while loading
	const isNoLayoutPage = NO_LAYOUT_PATHS.some(path => pathname === path || pathname.startsWith(`${path}/`));

	// Redirect to login when not authenticated (handles client-side navigation)
	useEffect(() => {
		if (!loading && !user && !isNoLayoutPage) {
			router.push("/login");
		}
	}, [loading, user, isNoLayoutPage, router]);

	// Show simple container for no-layout pages
	if (isNoLayoutPage) {
		return <>{children}</>;
	}

	// Show loading state while checking auth
	if (loading) {
		return (
			<div style={styles.loadingContainer}>
				<div style={styles.loadingSpinner} />
				<span style={styles.loadingText}>Loading...</span>
			</div>
		);
	}

	// If not logged in and not on login page, the middleware will redirect
	// But we still show a minimal loading state just in case
	if (!user) {
		return (
			<div style={styles.loadingContainer}>
				<div style={styles.loadingSpinner} />
				<span style={styles.loadingText}>Redirecting...</span>
			</div>
		);
	}

	// Main layout with sidebar and header
	return (
		<div style={styles.container}>
			{/* Top Header */}
			<Header />

			{/* Content area with sidebar */}
			<div style={styles.contentWrapper}>
				{/* Sidebar */}
				<Sidebar />

				{/* Main content */}
				<main style={styles.main}>{children}</main>
			</div>
		</div>
	);
}

/** Inline styles */
const styles: Record<string, React.CSSProperties> = {
	container: {
		display: "flex",
		flexDirection: "column",
		height: "100vh",
		overflow: "hidden",
		backgroundColor: "#ffffff",
	},
	contentWrapper: {
		display: "flex",
		flex: 1,
		overflow: "hidden",
	},
	main: {
		flex: 1,
		overflow: "auto",
		padding: 24,
		backgroundColor: "#ffffff",
	},
	loadingContainer: {
		display: "flex",
		flexDirection: "column",
		alignItems: "center",
		justifyContent: "center",
		height: "100vh",
		gap: 16,
	},
	loadingSpinner: {
		width: 40,
		height: 40,
		border: "3px solid #e5e7eb",
		borderTopColor: "#4f46e5",
		borderRadius: "50%",
		animation: "spin 1s linear infinite",
	},
	loadingText: {
		fontSize: 14,
		color: "#6b7280",
	},
};
