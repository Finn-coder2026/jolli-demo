"use client";

import { Breadcrumb } from "../../../../components/Breadcrumb";
import type { OrgSummary } from "../../../../lib/types";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function OrgListPage() {
	const params = useParams();
	const tenantId = params.tenantId as string;

	const [tenantName, setTenantName] = useState<string>("");
	const [orgs, setOrgs] = useState<Array<OrgSummary>>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		async function loadData() {
			try {
				// Load tenant and orgs in parallel
				const [tenantResponse, orgsResponse] = await Promise.all([
					fetch(`/api/tenants/${tenantId}`),
					fetch(`/api/tenants/${tenantId}/orgs`),
				]);

				if (!tenantResponse.ok || !orgsResponse.ok) {
					if (tenantResponse.status === 404 || orgsResponse.status === 404) {
						throw new Error("Tenant not found");
					}
					throw new Error("Failed to load data");
				}

				const tenantData = await tenantResponse.json();
				const orgsData = await orgsResponse.json();

				setTenantName(tenantData.tenant.displayName);
				setOrgs(orgsData.orgs);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Unknown error");
			} finally {
				setLoading(false);
			}
		}
		loadData();
	}, [tenantId]);

	if (loading) {
		return (
			<main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
				<p>Loading...</p>
			</main>
		);
	}

	if (error) {
		return (
			<main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
				<p style={{ color: "red" }}>Error: {error}</p>
				<Link href={`/tenants/${tenantId}`}>Back to Tenant</Link>
			</main>
		);
	}

	return (
		<main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif", maxWidth: "1200px" }}>
			<Breadcrumb
				items={[
					{ label: "Tenants", href: "/tenants" },
					{ label: tenantName || "Tenant", href: `/tenants/${tenantId}` },
					{ label: "Organizations" },
				]}
			/>
			<div
				style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}
			>
				<h1>Organizations for {tenantName}</h1>
				<Link
					href={`/tenants/${tenantId}/orgs/new`}
					style={{
						padding: "0.5rem 1rem",
						backgroundColor: "#007bff",
						color: "white",
						textDecoration: "none",
						borderRadius: "4px",
					}}
				>
					New Org
				</Link>
			</div>

			<p style={{ color: "#666", marginBottom: "1.5rem" }}>
				Manage organizations within this tenant. Each org has its own PostgreSQL schema for data isolation.
			</p>

			{orgs.length === 0 ? (
				<div
					style={{
						padding: "2rem",
						textAlign: "center",
						backgroundColor: "#f8f9fa",
						borderRadius: "4px",
					}}
				>
					<p style={{ margin: 0, color: "#666" }}>
						No organizations found. Create your first org to get started.
					</p>
				</div>
			) : (
				<table
					style={{
						width: "100%",
						borderCollapse: "collapse",
						backgroundColor: "white",
						boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
					}}
				>
					<thead>
						<tr style={{ backgroundColor: "#f8f9fa" }}>
							<th style={thStyle}>Name</th>
							<th style={thStyle}>Slug</th>
							<th style={thStyle}>Schema</th>
							<th style={thStyle}>Status</th>
							<th style={thStyle}>Default</th>
							<th style={thStyle}>Created</th>
						</tr>
					</thead>
					<tbody>
						{orgs.map(org => (
							<tr key={org.id} style={{ borderBottom: "1px solid #eee" }}>
								<td style={tdStyle}>
									<Link
										href={`/tenants/${tenantId}/orgs/${org.id}`}
										style={{ color: "#007bff", textDecoration: "none" }}
									>
										{org.displayName}
									</Link>
								</td>
								<td style={tdStyle}>
									<code>{org.slug}</code>
								</td>
								<td style={tdStyle}>
									<code>{org.schemaName}</code>
								</td>
								<td style={tdStyle}>
									<StatusBadge status={org.status} />
								</td>
								<td style={tdStyle}>{org.isDefault && <DefaultBadge />}</td>
								<td style={tdStyle}>{new Date(org.createdAt).toLocaleDateString()}</td>
							</tr>
						))}
					</tbody>
				</table>
			)}
		</main>
	);
}

const thStyle: React.CSSProperties = {
	padding: "0.75rem 1rem",
	textAlign: "left",
	fontWeight: "bold",
	borderBottom: "2px solid #dee2e6",
};

const tdStyle: React.CSSProperties = {
	padding: "0.75rem 1rem",
};

function StatusBadge({ status }: { status: string }) {
	const colors: Record<string, { bg: string; text: string }> = {
		provisioning: { bg: "#fff3cd", text: "#856404" },
		active: { bg: "#d4edda", text: "#155724" },
		suspended: { bg: "#f8d7da", text: "#721c24" },
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

function DefaultBadge() {
	return (
		<span
			style={{
				padding: "0.125rem 0.375rem",
				borderRadius: "4px",
				backgroundColor: "#007bff",
				color: "white",
				fontSize: "0.75rem",
			}}
		>
			Default
		</span>
	);
}
