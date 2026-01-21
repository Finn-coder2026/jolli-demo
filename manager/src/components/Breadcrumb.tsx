"use client";

import Link from "next/link";

export interface BreadcrumbItem {
	label: string;
	href?: string;
}

interface BreadcrumbProps {
	items: Array<BreadcrumbItem>;
}

export function Breadcrumb({ items }: BreadcrumbProps) {
	return (
		<nav style={{ marginBottom: "1rem", fontSize: "0.875rem" }}>
			{items.map((item, index) => (
				<span key={item.label}>
					{index > 0 && <span style={{ margin: "0 0.5rem", color: "#666" }}>/</span>}
					{item.href ? (
						<Link href={item.href} style={{ color: "#007bff", textDecoration: "none" }}>
							{item.label}
						</Link>
					) : (
						<span style={{ color: "#666" }}>{item.label}</span>
					)}
				</span>
			))}
		</nav>
	);
}
