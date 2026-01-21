"use client";

import { Breadcrumb } from "../../components/Breadcrumb";
import type { TenantSummary } from "../../lib/types";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function TenantsPage() {
	const [tenants, setTenants] = useState<Array<TenantSummary>>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		async function loadTenants() {
			try {
				const response = await fetch("/api/tenants");
				if (!response.ok) {
					throw new Error("Failed to load tenants");
				}
				const data = await response.json();
				setTenants(data.tenants);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Unknown error");
			} finally {
				setLoading(false);
			}
		}
		loadTenants();
	}, []);

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
			<Breadcrumb items={[{ label: "Dashboard", href: "/" }, { label: "Tenants" }]} />
			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
				<h1>Tenants</h1>
				<Link
					href="/tenants/new"
					style={{
						padding: "0.5rem 1rem",
						backgroundColor: "#0070f3",
						color: "white",
						textDecoration: "none",
						borderRadius: "4px",
					}}
				>
					New Tenant
				</Link>
			</div>

			{tenants.length === 0 ? (
				<p>No tenants yet. Create your first tenant to get started.</p>
			) : (
				<table style={{ width: "100%", borderCollapse: "collapse", marginTop: "1rem" }}>
					<thead>
						<tr style={{ borderBottom: "2px solid #eee" }}>
							<th style={{ textAlign: "left", padding: "0.5rem" }}>Slug</th>
							<th style={{ textAlign: "left", padding: "0.5rem" }}>Name</th>
							<th style={{ textAlign: "left", padding: "0.5rem" }}>Status</th>
							<th style={{ textAlign: "left", padding: "0.5rem" }}>Provider</th>
							<th style={{ textAlign: "left", padding: "0.5rem" }}>Type</th>
							<th style={{ textAlign: "left", padding: "0.5rem" }}>Created</th>
							<th style={{ textAlign: "left", padding: "0.5rem" }}>Actions</th>
						</tr>
					</thead>
					<tbody>
						{tenants.map(tenant => (
							<tr key={tenant.id} style={{ borderBottom: "1px solid #eee" }}>
								<td style={{ padding: "0.5rem" }}>
									<code>{tenant.slug}</code>
								</td>
								<td style={{ padding: "0.5rem" }}>{tenant.displayName}</td>
								<td style={{ padding: "0.5rem" }}>
									<StatusBadge status={tenant.status} />
								</td>
								<td style={{ padding: "0.5rem" }}>
									{tenant.databaseProvider ? (
										<Link
											href={`/providers/${tenant.databaseProviderId}`}
											style={{ textDecoration: "none", color: "#0070f3" }}
										>
											{tenant.databaseProvider.name}
										</Link>
									) : (
										<span style={{ color: "#999" }}>Unknown</span>
									)}
									{tenant.databaseProvider && (
										<span style={{ marginLeft: "0.25rem", color: "#666", fontSize: "0.875rem" }}>
											({tenant.databaseProvider.type})
										</span>
									)}
								</td>
								<td style={{ padding: "0.5rem" }}>{tenant.deploymentType}</td>
								<td style={{ padding: "0.5rem" }}>{new Date(tenant.createdAt).toLocaleDateString()}</td>
								<td style={{ padding: "0.5rem" }}>
									<Link href={`/tenants/${tenant.id}`}>View</Link>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			)}
		</main>
	);
}

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
