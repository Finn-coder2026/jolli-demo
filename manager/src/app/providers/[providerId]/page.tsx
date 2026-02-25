"use client";

import { Breadcrumb } from "../../../components/Breadcrumb";
import { getRegionName } from "../../../lib/constants/Regions";
import type { DatabaseProvider, ProviderType, TenantSummary } from "../../../lib/types";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** Display names for provider types */
const providerTypeDisplayNames: Record<ProviderType, string> = {
	connection_string: "Connection String",
	neon: "Neon",
	local: "Connection String", // Legacy alias
};

// Provider without the encrypted config, but with config status
interface SafeProvider extends Omit<DatabaseProvider, "configEncrypted"> {
	hasConfig: boolean;
}

/**
 * Provider detail page.
 */
export default function ProviderDetailPage() {
	const params = useParams();
	const router = useRouter();
	const providerId = params.providerId as string;

	const [provider, setProvider] = useState<SafeProvider | null>(null);
	const [tenants, setTenants] = useState<Array<TenantSummary>>([]);
	const [loading, setLoading] = useState(true);
	const [actionLoading, setActionLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [actionError, setActionError] = useState<string | null>(null);

	async function loadProvider() {
		try {
			const response = await fetch(`/api/providers/${providerId}`);
			if (!response.ok) {
				if (response.status === 404) {
					throw new Error("Provider not found");
				}
				throw new Error("Failed to load provider");
			}
			const data = await response.json();
			setProvider(data.provider);
			setTenants(data.tenants ?? []);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Unknown error");
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => {
		loadProvider();
	}, [providerId]);

	async function handleDelete() {
		if (!confirm("Are you sure you want to delete this provider? This cannot be undone.")) {
			return;
		}
		setActionLoading(true);
		setActionError(null);
		try {
			const response = await fetch(`/api/providers/${providerId}`, { method: "DELETE" });
			const data = await response.json();
			if (!response.ok) {
				throw new Error(data.error ?? "Failed to delete");
			}
			router.push("/providers");
		} catch (err) {
			setActionError(err instanceof Error ? err.message : "Unknown error");
			setActionLoading(false);
		}
	}

	if (loading) {
		return (
			<main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
				<p>Loading...</p>
			</main>
		);
	}

	if (error || !provider) {
		return (
			<main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
				<p style={{ color: "red" }}>Error: {error ?? "Provider not found"}</p>
				<Link href="/providers">Back to Providers</Link>
			</main>
		);
	}

	const canDelete = tenants.length === 0;

	return (
		<main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif", maxWidth: "800px" }}>
			<Breadcrumb items={[{ label: "Database Providers", href: "/providers" }, { label: provider.name }]} />
			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
				<h1>{provider.name}</h1>
				<TypeBadge type={provider.type} />
			</div>

			{provider.isDefault && (
				<p
					style={{
						display: "inline-block",
						padding: "0.25rem 0.5rem",
						backgroundColor: "#007bff",
						color: "white",
						borderRadius: "4px",
						fontSize: "0.75rem",
					}}
				>
					Default Provider
				</p>
			)}

			{actionError && (
				<div
					style={{
						padding: "1rem",
						backgroundColor: "#f8d7da",
						color: "#721c24",
						borderRadius: "4px",
						marginTop: "1rem",
					}}
				>
					{actionError}
				</div>
			)}

			<section style={{ marginTop: "2rem" }}>
				<h2>Provider Information</h2>
				<dl style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: "0.5rem" }}>
					<dt style={{ fontWeight: "bold" }}>ID</dt>
					<dd style={{ margin: 0 }}>
						<code>{provider.id}</code>
					</dd>

					<dt style={{ fontWeight: "bold" }}>Type</dt>
					<dd style={{ margin: 0 }}>{provider.type}</dd>

					<dt style={{ fontWeight: "bold" }}>Default</dt>
					<dd style={{ margin: 0 }}>{provider.isDefault ? "Yes" : "No"}</dd>

					<dt style={{ fontWeight: "bold" }}>Region</dt>
					<dd style={{ margin: 0 }}>{getRegionName(provider.region)}</dd>

					<dt style={{ fontWeight: "bold" }}>Created</dt>
					<dd style={{ margin: 0 }}>{new Date(provider.createdAt).toLocaleString()}</dd>

					{provider.connectionTemplate && (
						<>
							<dt style={{ fontWeight: "bold" }}>Connection Template</dt>
							<dd style={{ margin: 0 }}>
								<code>{JSON.stringify(provider.connectionTemplate)}</code>
							</dd>
						</>
					)}

					{provider.type === "neon" && (
						<>
							<dt style={{ fontWeight: "bold" }}>Configuration</dt>
							<dd style={{ margin: 0 }}>
								{provider.hasConfig ? (
									<span style={{ color: "#155724" }}>Configured</span>
								) : (
									<span style={{ color: "#721c24" }}>Not configured</span>
								)}
							</dd>
						</>
					)}
				</dl>
			</section>

			{/* Neon-specific configuration */}
			{provider.type === "neon" && <NeonConfigSection provider={provider} />}

			<section style={{ marginTop: "2rem" }}>
				<h2>Associated Tenants ({tenants.length})</h2>
				{tenants.length === 0 ? (
					<p style={{ color: "#666" }}>No tenants are using this provider.</p>
				) : (
					<table
						style={{
							width: "100%",
							borderCollapse: "collapse",
							marginTop: "1rem",
						}}
					>
						<thead>
							<tr style={{ backgroundColor: "#f8f9fa" }}>
								<th style={{ padding: "0.5rem", textAlign: "left", borderBottom: "2px solid #dee2e6" }}>
									Name
								</th>
								<th style={{ padding: "0.5rem", textAlign: "left", borderBottom: "2px solid #dee2e6" }}>
									Slug
								</th>
								<th style={{ padding: "0.5rem", textAlign: "left", borderBottom: "2px solid #dee2e6" }}>
									Status
								</th>
								<th style={{ padding: "0.5rem", textAlign: "left", borderBottom: "2px solid #dee2e6" }}>
									Created
								</th>
							</tr>
						</thead>
						<tbody>
							{tenants.map(tenant => (
								<tr key={tenant.id} style={{ borderBottom: "1px solid #eee" }}>
									<td style={{ padding: "0.5rem" }}>
										<Link
											href={`/tenants/${tenant.id}`}
											style={{ color: "#007bff", textDecoration: "none" }}
										>
											{tenant.displayName}
										</Link>
									</td>
									<td style={{ padding: "0.5rem" }}>
										<code style={{ fontSize: "0.875rem" }}>{tenant.slug}</code>
									</td>
									<td style={{ padding: "0.5rem" }}>
										<StatusBadge status={tenant.status} />
									</td>
									<td style={{ padding: "0.5rem" }}>
										{new Date(tenant.createdAt).toLocaleDateString()}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				)}
			</section>

			<section style={{ marginTop: "2rem", paddingTop: "1rem", borderTop: "1px solid #eee" }}>
				<h2>Actions</h2>
				<div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
					<button
						type="button"
						onClick={handleDelete}
						disabled={actionLoading || !canDelete}
						title={
							tenants.length > 0
								? `Cannot delete provider with ${tenants.length} associated tenant${tenants.length === 1 ? "" : "s"}`
								: "Delete this provider"
						}
						style={{
							padding: "0.5rem 1rem",
							backgroundColor: actionLoading || !canDelete ? "#ccc" : "#dc3545",
							color: "white",
							border: "none",
							borderRadius: "4px",
							cursor: actionLoading || !canDelete ? "not-allowed" : "pointer",
						}}
					>
						Delete Provider
					</button>
				</div>
				{!canDelete && (
					<p style={{ color: "#666", fontSize: "0.875rem", marginTop: "0.5rem" }}>
						{`Cannot delete provider with ${tenants.length} associated tenant${tenants.length === 1 ? "" : "s"}. Delete or migrate the tenants first.`}
					</p>
				)}
			</section>
		</main>
	);
}

function TypeBadge({ type }: { type: ProviderType }) {
	const colors: Record<ProviderType, { bg: string; text: string }> = {
		local: { bg: "#e2e3e5", text: "#383d41" },
		connection_string: { bg: "#e2e3e5", text: "#383d41" },
		neon: { bg: "#d4edda", text: "#155724" },
	};

	const style = colors[type] ?? colors.connection_string;
	const displayName = providerTypeDisplayNames[type] ?? type;

	return (
		<span
			style={{
				padding: "0.25rem 0.75rem",
				borderRadius: "4px",
				fontSize: "0.875rem",
				backgroundColor: style.bg,
				color: style.text,
			}}
		>
			{displayName}
		</span>
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

interface NeonConfigSectionProps {
	provider: SafeProvider;
}

function NeonConfigSection({ provider }: NeonConfigSectionProps) {
	if (!provider.hasConfig) {
		return (
			<section style={{ marginTop: "2rem" }}>
				<h2>Neon Configuration</h2>
				<p style={{ color: "#721c24", marginBottom: "1rem" }}>
					This provider is missing API key configuration. Delete this provider and create a new one with a
					valid Neon API key and Organization ID.
				</p>
			</section>
		);
	}

	return (
		<section style={{ marginTop: "2rem" }}>
			<h2>Neon Configuration</h2>
			<p style={{ color: "#155724", marginBottom: "1rem" }}>
				This provider is configured and ready to provision Neon databases.
			</p>
		</section>
	);
}
