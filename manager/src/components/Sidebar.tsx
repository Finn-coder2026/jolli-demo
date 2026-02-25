"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

/** Navigation item configuration */
interface NavItem {
	name: string;
	href: string;
	icon: React.ReactNode;
	requiresSuperAdmin?: boolean;
}

/** SVG Icons */
function UsersIcon() {
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
			<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
			<circle cx="9" cy="7" r="4" />
			<path d="M22 21v-2a4 4 0 0 0-3-3.87" />
			<path d="M16 3.13a4 4 0 0 1 0 7.75" />
		</svg>
	);
}

function BuildingIcon() {
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
			<rect width="16" height="20" x="4" y="2" rx="2" ry="2" />
			<path d="M9 22v-4h6v4" />
			<path d="M8 6h.01" />
			<path d="M16 6h.01" />
			<path d="M12 6h.01" />
			<path d="M12 10h.01" />
			<path d="M12 14h.01" />
			<path d="M16 10h.01" />
			<path d="M16 14h.01" />
			<path d="M8 10h.01" />
			<path d="M8 14h.01" />
		</svg>
	);
}

function DatabaseIcon() {
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
			<ellipse cx="12" cy="5" rx="9" ry="3" />
			<path d="M3 5V19A9 3 0 0 0 21 19V5" />
			<path d="M3 12A9 3 0 0 0 21 12" />
		</svg>
	);
}

function SearchUsersIcon() {
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
			<circle cx="11" cy="11" r="8" />
			<path d="m21 21-4.3-4.3" />
			<path d="M11 8a3 3 0 0 0-3 3" />
		</svg>
	);
}

/** Navigation items */
const navItems: Array<NavItem> = [
	{
		name: "Tenants",
		href: "/tenants",
		icon: <BuildingIcon />,
	},
	{
		name: "Database Providers",
		href: "/providers",
		icon: <DatabaseIcon />,
	},
	{
		name: "Manager Users",
		href: "/users",
		icon: <UsersIcon />,
		requiresSuperAdmin: true,
	},
	{
		name: "Tenant Users",
		href: "/tenant-users",
		icon: <SearchUsersIcon />,
	},
];

export function Sidebar() {
	const pathname = usePathname();
	const { isSuperAdmin } = useAuth();

	// Filter nav items based on user role
	const visibleNavItems = navItems.filter(item => !item.requiresSuperAdmin || isSuperAdmin);

	return (
		<aside style={styles.sidebar}>
			{/* Navigation header */}
			<div style={styles.navHeader}>NAVIGATION</div>

			{/* Navigation items */}
			<nav style={styles.nav}>
				{visibleNavItems.map(item => {
					const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
					return (
						<Link
							key={item.href}
							href={item.href}
							style={{
								...styles.navItem,
								...(isActive ? styles.navItemActive : {}),
							}}
						>
							<span style={styles.navIcon}>{item.icon}</span>
							<span>{item.name}</span>
						</Link>
					);
				})}
			</nav>
		</aside>
	);
}

/** Inline styles */
const styles: Record<string, React.CSSProperties> = {
	sidebar: {
		width: 260,
		minWidth: 260,
		backgroundColor: "#f8f9fa",
		borderRight: "1px solid #e5e7eb",
		display: "flex",
		flexDirection: "column",
		height: "100%",
	},
	navHeader: {
		padding: "24px 20px 12px",
		fontSize: 11,
		fontWeight: 600,
		color: "#6b7280",
		letterSpacing: "0.05em",
	},
	nav: {
		display: "flex",
		flexDirection: "column",
		padding: "0 12px",
		gap: 4,
	},
	navItem: {
		display: "flex",
		alignItems: "center",
		gap: 12,
		padding: "12px 16px",
		borderRadius: 8,
		fontSize: 14,
		fontWeight: 400,
		color: "#374151",
		textDecoration: "none",
		transition: "background-color 0.15s ease",
	},
	navItemActive: {
		backgroundColor: "#e0e7ff",
		color: "#3730a3",
		fontWeight: 500,
	},
	navIcon: {
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		width: 20,
		height: 20,
	},
};
