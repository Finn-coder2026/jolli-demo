"use client";

import { useState } from "react";

/** Tenant user search result from API */
interface TenantUserResult {
	userId: number;
	userName: string | null;
	userEmail: string;
	tenantId: string;
	tenantName: string;
	orgId: string;
	orgName: string;
	role: string;
	isActive: boolean;
	createdAt: string;
}

export default function TenantUsersPage() {
	const [email, setEmail] = useState("");
	const [results, setResults] = useState<Array<TenantUserResult>>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [searched, setSearched] = useState(false);

	async function handleSearch(e: React.FormEvent) {
		e.preventDefault();

		if (!email.trim()) {
			setError("Please enter an email address");
			return;
		}

		setLoading(true);
		setError(null);

		try {
			const response = await fetch(`/api/tenant-users?email=${encodeURIComponent(email.trim())}`);

			if (!response.ok) {
				const data = (await response.json()) as { error?: string };
				throw new Error(data.error || "Failed to search tenant users");
			}

			const data = (await response.json()) as { results: Array<TenantUserResult> };
			setResults(data.results);
			setSearched(true);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Unknown error");
		} finally {
			setLoading(false);
		}
	}

	return (
		<div style={styles.container}>
			<h1 style={styles.title}>Search Tenant Users</h1>

			{/* Search form */}
			<form onSubmit={handleSearch} style={styles.searchForm}>
				<input
					id="email"
					type="email"
					value={email}
					onChange={e => setEmail(e.target.value)}
					placeholder="Enter email address"
					style={styles.input}
				/>
				<button
					type="submit"
					disabled={loading}
					style={{ ...styles.searchButton, ...(loading ? styles.searchButtonDisabled : {}) }}
				>
					{loading ? "Searching..." : "Search"}
				</button>
			</form>

			{error && <div style={styles.errorBanner}>{error}</div>}

			{/* Results */}
			{searched &&
				!loading &&
				(results.length === 0 ? (
					<div style={styles.noResults}>No tenant users found for this email.</div>
				) : (
					<table style={styles.table}>
						<thead>
							<tr>
								<th style={styles.th}>USER</th>
								<th style={styles.th}>TENANT</th>
								<th style={styles.th}>ORG</th>
								<th style={styles.th}>ROLE</th>
								<th style={styles.th}>STATUS</th>
								<th style={styles.th}>CREATED</th>
							</tr>
						</thead>
						<tbody>
							{results.map((result, index) => (
								<tr key={`${result.tenantId}-${result.orgId}-${index}`} style={styles.tr}>
									<td style={styles.td}>
										<div style={styles.userCell}>
											<div style={styles.userName}>{result.userName || "No name"}</div>
											<div style={styles.userEmail}>{result.userEmail}</div>
										</div>
									</td>
									<td style={styles.td}>
										<a
											href={`/tenants/${result.tenantId}`}
											target="_blank"
											rel="noopener noreferrer"
											style={styles.link}
										>
											{result.tenantName}
										</a>
									</td>
									<td style={styles.td}>
										<a
											href={`/tenants/${result.tenantId}/orgs/${result.orgId}`}
											target="_blank"
											rel="noopener noreferrer"
											style={styles.link}
										>
											{result.orgName}
										</a>
									</td>
									<td style={styles.td}>
										<span style={styles.roleBadge}>{result.role || "—"}</span>
									</td>
									<td style={styles.td}>
										<span
											style={{
												...styles.statusBadge,
												backgroundColor: result.isActive ? "#dcfce7" : "#fee2e2",
												color: result.isActive ? "#166534" : "#dc2626",
											}}
										>
											{result.isActive ? "Active" : "Inactive"}
										</span>
									</td>
									<td style={styles.td}>{new Date(result.createdAt).toLocaleDateString()}</td>
								</tr>
							))}
						</tbody>
					</table>
				))}
		</div>
	);
}

/** Inline styles */
const styles: Record<string, React.CSSProperties> = {
	container: {
		padding: "2rem",
		fontFamily: "system-ui, sans-serif",
	},
	title: {
		margin: 0,
		marginBottom: 24,
		fontSize: 24,
		fontWeight: 600,
	},
	searchForm: {
		display: "flex",
		gap: 12,
		alignItems: "center",
		marginBottom: 24,
	},
	input: {
		width: 300,
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
	errorBanner: {
		backgroundColor: "#fee2e2",
		color: "#dc2626",
		padding: 12,
		borderRadius: 6,
		marginBottom: 16,
		fontSize: 14,
	},
	noResults: {
		textAlign: "center",
		padding: 40,
		color: "#6b7280",
		fontSize: 14,
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
		color: "#6b7280",
	},
	tr: {
		borderBottom: "1px solid #e5e7eb",
	},
	td: {
		padding: 12,
		fontSize: 14,
	},
	userCell: {
		display: "flex",
		flexDirection: "column",
	},
	userName: {
		fontWeight: 500,
	},
	userEmail: {
		fontSize: 12,
		color: "#6b7280",
	},
	statusBadge: {
		display: "inline-block",
		padding: "4px 8px",
		borderRadius: 9999,
		fontSize: 12,
		fontWeight: 500,
	},
	roleBadge: {
		display: "inline-block",
		padding: "4px 8px",
		borderRadius: 9999,
		fontSize: 12,
		fontWeight: 500,
		backgroundColor: "#f3f4f6",
		color: "#374151",
		textTransform: "capitalize",
	},
	link: {
		color: "#3b82f6",
		textDecoration: "none",
	},
};
