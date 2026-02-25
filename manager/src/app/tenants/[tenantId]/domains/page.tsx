"use client";

import { Breadcrumb } from "../../../../components/Breadcrumb";
import type { TenantDomain } from "../../../../lib/types";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function DomainListPage() {
	const params = useParams();
	const tenantId = params.tenantId as string;

	const [tenantName, setTenantName] = useState<string>("");
	const [domains, setDomains] = useState<Array<TenantDomain>>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		async function loadData() {
			try {
				const [tenantResponse, domainsResponse] = await Promise.all([
					fetch(`/api/tenants/${tenantId}`),
					fetch(`/api/tenants/${tenantId}/domains`),
				]);

				if (!tenantResponse.ok || !domainsResponse.ok) {
					if (tenantResponse.status === 404 || domainsResponse.status === 404) {
						throw new Error("Tenant not found");
					}
					throw new Error("Failed to load data");
				}

				const tenantData = await tenantResponse.json();
				const domainsData = await domainsResponse.json();

				setTenantName(tenantData.tenant.displayName);
				setDomains(domainsData.domains);
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
					{ label: "Custom Domains" },
				]}
			/>
			<div
				style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}
			>
				<h1>Custom Domains for {tenantName}</h1>
				<Link
					href={`/tenants/${tenantId}/domains/new`}
					style={{
						padding: "0.5rem 1rem",
						backgroundColor: "#007bff",
						color: "white",
						textDecoration: "none",
						borderRadius: "4px",
					}}
				>
					Add Domain
				</Link>
			</div>

			<p style={{ color: "#666", marginBottom: "1.5rem" }}>
				Add custom domains to access this tenant. Custom domains require DNS verification before they can be
				used.
			</p>

			{domains.length === 0 ? (
				<div
					style={{
						padding: "2rem",
						textAlign: "center",
						backgroundColor: "#f8f9fa",
						borderRadius: "4px",
					}}
				>
					<p style={{ margin: 0, color: "#666" }}>
						No custom domains configured. Add a domain to enable custom domain access.
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
							<th style={thStyle}>Domain</th>
							<th style={thStyle}>Primary</th>
							<th style={thStyle}>Verified</th>
							<th style={thStyle}>SSL Status</th>
							<th style={thStyle}>Created</th>
						</tr>
					</thead>
					<tbody>
						{domains.map(domain => (
							<tr key={domain.id} style={{ borderBottom: "1px solid #eee" }}>
								<td style={tdStyle}>
									<Link
										href={`/tenants/${tenantId}/domains/${domain.id}`}
										style={{ color: "#007bff", textDecoration: "none" }}
									>
										{domain.domain}
									</Link>
								</td>
								<td style={tdStyle}>{domain.isPrimary && <PrimaryBadge />}</td>
								<td style={tdStyle}>
									<VerifiedBadge verified={!!domain.verifiedAt} />
								</td>
								<td style={tdStyle}>
									<SslStatusBadge status={domain.sslStatus} />
								</td>
								<td style={tdStyle}>{new Date(domain.createdAt).toLocaleDateString()}</td>
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

function PrimaryBadge() {
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
			Primary
		</span>
	);
}

function VerifiedBadge({ verified }: { verified: boolean }) {
	return (
		<span
			style={{
				padding: "0.25rem 0.5rem",
				borderRadius: "4px",
				fontSize: "0.875rem",
				backgroundColor: verified ? "#d4edda" : "#fff3cd",
				color: verified ? "#155724" : "#856404",
			}}
		>
			{verified ? "Verified" : "Pending"}
		</span>
	);
}

function SslStatusBadge({ status }: { status: string }) {
	const colors: Record<string, { bg: string; text: string }> = {
		pending: { bg: "#fff3cd", text: "#856404" },
		active: { bg: "#d4edda", text: "#155724" },
		failed: { bg: "#f8d7da", text: "#721c24" },
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
