"use client";

import type { TenantSummary } from "../../lib/types";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

export default function TenantsPage() {
	const [tenants, setTenants] = useState<Array<TenantSummary>>([]);
	const [loading, setLoading] = useState(true);
	const [searching, setSearching] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [slugFilter, setSlugFilter] = useState("");
	const [ownerEmailFilter, setOwnerEmailFilter] = useState("");
	const [searched, setSearched] = useState(false);

	const loadTenants = useCallback(async (slug?: string, ownerEmail?: string) => {
		try {
			const params = new URLSearchParams();
			if (slug) {
				params.set("slug", slug);
			}
			if (ownerEmail) {
				params.set("ownerEmail", ownerEmail);
			}

			const url = params.toString() ? `/api/tenants?${params.toString()}` : "/api/tenants";
			const response = await fetch(url);
			if (!response.ok) {
				throw new Error("Failed to load tenants");
			}
			const data = await response.json();
			setTenants(data.tenants);
			setError(null);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Unknown error");
		}
	}, []);

	useEffect(() => {
		loadTenants().finally(() => setLoading(false));
	}, [loadTenants]);

	async function handleSearch(e: React.FormEvent) {
		e.preventDefault();
		setSearching(true);
		setSearched(true);
		await loadTenants(slugFilter.trim() || undefined, ownerEmailFilter.trim() || undefined);
		setSearching(false);
	}

	if (loading) {
		return (
			<main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
				<h1>Tenants</h1>
				<p>Loading...</p>
			</main>
		);
	}

	if (error) {
		return (
			<main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
				<h1>Tenants</h1>
				<p style={{ color: "red" }}>Error: {error}</p>
			</main>
		);
	}

	return (
		<main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
			<h1 style={{ margin: 0, marginBottom: 24 }}>Tenants</h1>
			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
				<form onSubmit={handleSearch} style={styles.searchForm}>
					<input
						type="text"
						value={slugFilter}
						onChange={e => setSlugFilter(e.target.value)}
						placeholder="Enter slug"
						style={styles.input}
					/>
					<input
						type="text"
						value={ownerEmailFilter}
						onChange={e => setOwnerEmailFilter(e.target.value)}
						placeholder="Enter owner email"
						style={styles.input}
					/>
					<button
						type="submit"
						disabled={searching}
						style={{ ...styles.searchButton, ...(searching ? styles.searchButtonDisabled : {}) }}
					>
						{searching ? "Searching..." : "Search"}
					</button>
				</form>
				<Link href="/tenants/new" style={styles.newButton}>
					New Tenant
				</Link>
			</div>

			{tenants.length === 0 ? (
				<p>{searched ? "No tenants found." : "No tenants yet. Create your first tenant to get started."}</p>
			) : (
				<table style={styles.table}>
					<thead>
						<tr>
							<th style={styles.th}>Slug</th>
							<th style={styles.th}>Name</th>
							<th style={styles.th}>Status</th>
							<th style={styles.th}>Provider</th>
							<th style={styles.th}>Type</th>
							<th style={styles.th}>Created</th>
						</tr>
					</thead>
					<tbody>
						{tenants.map(tenant => (
							<tr key={tenant.id} style={styles.tr}>
								<td style={styles.td}>
									<Link href={`/tenants/${tenant.id}`} style={styles.link}>
										<code>{tenant.slug}</code>
									</Link>
								</td>
								<td style={styles.td}>
									<Link href={`/tenants/${tenant.id}`} style={styles.link}>
										{tenant.displayName}
									</Link>
								</td>
								<td style={styles.td}>
									<StatusBadge status={tenant.status} />
								</td>
								<td style={styles.td}>
									{tenant.databaseProvider ? (
										<Link href={`/providers/${tenant.databaseProviderId}`} style={styles.link}>
											{tenant.databaseProvider.name}
										</Link>
									) : (
										<span style={{ color: "#999" }}>Unknown</span>
									)}
									{tenant.databaseProvider && (
										<span style={{ marginLeft: 4, color: "#666", fontSize: 12 }}>
											({tenant.databaseProvider.type})
										</span>
									)}
								</td>
								<td style={styles.td}>{tenant.deploymentType}</td>
								<td style={styles.td}>{new Date(tenant.createdAt).toLocaleDateString()}</td>
							</tr>
						))}
					</tbody>
				</table>
			)}
		</main>
	);
}

/** Inline styles */
const styles: Record<string, React.CSSProperties> = {
	searchForm: {
		display: "flex",
		gap: 12,
		alignItems: "center",
		margin: 0,
	},
	input: {
		width: 200,
		padding: "8px 12px",
		borderRadius: 6,
		border: "1px solid #d1d5db",
		fontSize: 14,
	},
	searchButton: {
		width: 100,
		padding: "8px 20px",
		backgroundColor: "#3b82f6",
		color: "white",
		border: "none",
		borderRadius: 6,
		cursor: "pointer",
		fontSize: 14,
		fontWeight: 500,
		height: 38,
	},
	searchButtonDisabled: {
		backgroundColor: "#9ca3af",
		cursor: "not-allowed",
	},
	newButton: {
		padding: "8px 16px",
		backgroundColor: "#3b82f6",
		color: "white",
		textDecoration: "none",
		borderRadius: 6,
		fontSize: 14,
		fontWeight: 500,
		height: 38,
		display: "flex",
		alignItems: "center",
	},
	table: {
		width: "100%",
		borderCollapse: "collapse",
		backgroundColor: "white",
	},
	th: {
		textAlign: "left",
		padding: 12,
		borderBottom: "1px solid #e5e7eb",
		fontSize: 12,
		fontWeight: 600,
		textTransform: "uppercase",
		color: "#6b7280",
	},
	tr: {
		borderBottom: "1px solid #e5e7eb",
	},
	td: {
		padding: 12,
		fontSize: 14,
	},
	link: {
		color: "#3b82f6",
		textDecoration: "none",
	},
};

function StatusBadge({ status }: { status: string }) {
	const colors: Record<string, { bg: string; text: string }> = {
		provisioning: { bg: "#fff3cd", text: "#856404" },
		active: { bg: "#d4edda", text: "#155724" },
		suspended: { bg: "#f8d7da", text: "#721c24" },
		migrating: { bg: "#cce5ff", text: "#004085" },
		archived: { bg: "#e2e3e5", text: "#383d41" },
	};

	const style = colors[status] ?? { bg: "#e2e3e5", text: "#383d41" };

	return (
		<span
			style={{
				padding: "0.25rem 0.5rem",
				borderRadius: "4px",
				fontSize: "0.875rem",
				backgroundColor: style.bg,
				color: style.text,
			}}
		>
			{status}
		</span>
	);
}
