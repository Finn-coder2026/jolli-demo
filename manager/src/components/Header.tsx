"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

/** User icon SVG */
function UserIcon() {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="20"
			height="20"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
			<circle cx="12" cy="7" r="4" />
		</svg>
	);
}

/** Logout icon SVG */
function LogoutIcon() {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
			<polyline points="16 17 21 12 16 7" />
			<line x1="21" y1="12" x2="9" y2="12" />
		</svg>
	);
}

/** Chevron down icon SVG */
function ChevronDownIcon() {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<path d="m6 9 6 6 6-6" />
		</svg>
	);
}

export function Header() {
	const { user, logout } = useAuth();
	const router = useRouter();
	const [dropdownOpen, setDropdownOpen] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);

	// Close dropdown when clicking outside
	useEffect(() => {
		function handleClickOutside(event: MouseEvent) {
			if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
				setDropdownOpen(false);
			}
		}

		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	const handleLogout = useCallback(async () => {
		setDropdownOpen(false);
		await logout();
		router.push("/login");
	}, [logout, router]);

	return (
		<header style={styles.header}>
			{/* Left side - Logo and title */}
			<div style={styles.logoSection}>
				<div style={styles.logoIcon}>
					<svg width="28" height="28" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
						<rect width="32" height="32" rx="8" fill="#4f46e5" />
						<path d="M8 10h6v12H8V10zm10 0h6v12h-6V10z" fill="white" opacity="0.9" />
					</svg>
				</div>
				<span style={styles.logoText}>Jolli Manager</span>
			</div>

			{/* Right side - User menu */}
			<div style={styles.rightSection}>
				<div style={styles.userMenu} ref={dropdownRef}>
					<button type="button" onClick={() => setDropdownOpen(!dropdownOpen)} style={styles.userButton}>
						<div style={styles.userAvatar}>
							<UserIcon />
						</div>
						<ChevronDownIcon />
					</button>

					{dropdownOpen && (
						<div style={styles.dropdown}>
							{/* User info */}
							<div style={styles.dropdownUserInfo}>
								{user?.name && <div style={styles.dropdownName}>{user.name}</div>}
								<div style={styles.dropdownEmail}>{user?.email || "Unknown"}</div>
							</div>

							{/* Separator */}
							<div style={styles.dropdownSeparator} />

							{/* Logout button */}
							<button type="button" onClick={handleLogout} style={styles.dropdownItem}>
								<LogoutIcon />
								<span>Sign Out</span>
							</button>
						</div>
					)}
				</div>
			</div>
		</header>
	);
}

/** Inline styles */
const styles: Record<string, React.CSSProperties> = {
	header: {
		height: 64,
		minHeight: 64,
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
		padding: "0 24px",
		backgroundColor: "#ffffff",
		borderBottom: "1px solid #e5e7eb",
	},
	logoSection: {
		display: "flex",
		alignItems: "center",
		gap: 12,
	},
	logoIcon: {
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
	},
	logoText: {
		fontSize: 18,
		fontWeight: 600,
		color: "#111827",
	},
	rightSection: {
		display: "flex",
		alignItems: "center",
		gap: 16,
	},
	userMenu: {
		position: "relative",
	},
	userButton: {
		display: "flex",
		alignItems: "center",
		gap: 8,
		padding: "8px 12px",
		backgroundColor: "transparent",
		border: "none",
		borderRadius: 8,
		cursor: "pointer",
		transition: "background-color 0.15s ease",
	},
	userAvatar: {
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		width: 32,
		height: 32,
		backgroundColor: "#f3f4f6",
		borderRadius: "50%",
		color: "#6b7280",
	},
	dropdown: {
		position: "absolute",
		top: "calc(100% + 8px)",
		right: 0,
		minWidth: 180,
		backgroundColor: "#ffffff",
		border: "1px solid #e5e7eb",
		borderRadius: 8,
		boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
		zIndex: 50,
		overflow: "hidden",
	},
	dropdownUserInfo: {
		padding: "12px 16px",
	},
	dropdownName: {
		fontSize: 14,
		fontWeight: 600,
		color: "#111827",
		marginBottom: 2,
	},
	dropdownEmail: {
		fontSize: 13,
		color: "#6b7280",
		fontWeight: 400,
	},
	dropdownSeparator: {
		height: 1,
		backgroundColor: "#e5e7eb",
		margin: "0 12px",
	},
	dropdownItem: {
		display: "flex",
		alignItems: "center",
		gap: 8,
		width: "100%",
		padding: "12px 16px",
		fontSize: 14,
		color: "#374151",
		backgroundColor: "transparent",
		border: "none",
		cursor: "pointer",
		textAlign: "left",
		transition: "background-color 0.15s ease",
	},
};
