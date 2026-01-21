"use client";

import { Breadcrumb } from "../../components/Breadcrumb";
import { DEFAULT_REGION, getRegionName, PROVIDER_REGIONS, type RegionSlug } from "../../lib/constants/Regions";
import type { DatabaseProvider, NewDatabaseProvider, ProviderType } from "../../lib/types";
import Link from "next/link";
import { useEffect, useState } from "react";

/** Display names for provider types */
const providerTypeDisplayNames: Record<ProviderType, string> = {
	connection_string: "Connection String",
	neon: "Neon",
	local: "Connection String", // Legacy alias
};

/**
 * Main providers page.
 */
export default function ProvidersPage() {
	const [providers, setProviders] = useState<Array<DatabaseProvider>>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [actionError, setActionError] = useState<string | null>(null);
	const [successMessage, setSuccessMessage] = useState<string | null>(null);
	const [showForm, setShowForm] = useState(false);
	const [deleting, setDeleting] = useState<string | null>(null);

	async function loadProviders() {
		try {
			const response = await fetch("/api/providers");
			if (!response.ok) {
				throw new Error("Failed to load providers");
			}
			const data = await response.json();
			setProviders(data.providers);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Unknown error");
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => {
		loadProviders();
	}, []);

	async function handleCreateProvider(data: NewDatabaseProvider) {
		const response = await fetch("/api/providers", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(data),
		});

		if (!response.ok) {
			const result = await response.json();
			throw new Error(result.error ?? "Failed to create provider");
		}

		setShowForm(false);
		setSuccessMessage("Provider created successfully!");
		await loadProviders();
	}

	async function handleDeleteProvider(provider: DatabaseProvider) {
		if (!confirm(`Are you sure you want to delete the provider "${provider.name}"?`)) {
			return;
		}

		setDeleting(provider.id);
		setActionError(null);

		try {
			const response = await fetch(`/api/providers/${provider.id}`, { method: "DELETE" });
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error ?? "Failed to delete provider");
			}

			await loadProviders();
		} catch (err) {
			setActionError(err instanceof Error ? err.message : "Unknown error");
		} finally {
			setDeleting(null);
		}
	}

	if (loading) {
		return (
			<main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
				<h1>Database Providers</h1>
				<p>Loading...</p>
			</main>
		);
	}

	return (
		<main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
			<Breadcrumb items={[{ label: "Dashboard", href: "/" }, { label: "Database Providers" }]} />
			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
				<h1>Database Providers</h1>
				<button
					type="button"
					onClick={() => {
						setShowForm(!showForm);
						setActionError(null);
						setSuccessMessage(null);
					}}
					style={{
						padding: "0.5rem 1rem",
						backgroundColor: "#0070f3",
						color: "white",
						border: "none",
						borderRadius: "4px",
						cursor: "pointer",
					}}
				>
					{showForm ? "Cancel" : "Add Provider"}
				</button>
			</div>

			{error && (
				<div
					style={{
						padding: "1rem",
						backgroundColor: "#f8d7da",
						color: "#721c24",
						borderRadius: "4px",
						marginTop: "1rem",
					}}
				>
					{error}
				</div>
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

			{successMessage && (
				<div
					style={{
						padding: "1rem",
						backgroundColor: "#d4edda",
						color: "#155724",
						borderRadius: "4px",
						marginTop: "1rem",
					}}
				>
					{successMessage}
				</div>
			)}

			{showForm && (
				<div style={{ marginTop: "1rem", padding: "1rem", border: "1px solid #ccc", borderRadius: "4px" }}>
					<ProviderForm onSubmit={handleCreateProvider} onCancel={() => setShowForm(false)} />
				</div>
			)}

			{providers.length === 0 ? (
				<p style={{ marginTop: "1rem" }}>
					No database providers configured. Add one to start provisioning tenants.
				</p>
			) : (
				<table style={{ width: "100%", borderCollapse: "collapse", marginTop: "1rem" }}>
					<thead>
						<tr style={{ borderBottom: "2px solid #eee" }}>
							<th style={{ textAlign: "left", padding: "0.5rem" }}>Name</th>
							<th style={{ textAlign: "left", padding: "0.5rem" }}>Type</th>
							<th style={{ textAlign: "left", padding: "0.5rem" }}>Region</th>
							<th style={{ textAlign: "left", padding: "0.5rem" }}>Default</th>
							<th style={{ textAlign: "left", padding: "0.5rem" }}>Created</th>
							<th style={{ textAlign: "left", padding: "0.5rem" }}>Actions</th>
						</tr>
					</thead>
					<tbody>
						{providers.map(provider => (
							<tr key={provider.id} style={{ borderBottom: "1px solid #eee" }}>
								<td style={{ padding: "0.5rem" }}>
									<Link
										href={`/providers/${provider.id}`}
										style={{ color: "#007bff", textDecoration: "none" }}
									>
										{provider.name}
									</Link>
								</td>
								<td style={{ padding: "0.5rem" }}>
									<TypeBadge type={provider.type} />
								</td>
								<td style={{ padding: "0.5rem" }}>{getRegionName(provider.region)}</td>
								<td style={{ padding: "0.5rem" }}>{provider.isDefault ? "Yes" : "No"}</td>
								<td style={{ padding: "0.5rem" }}>
									{new Date(provider.createdAt).toLocaleDateString()}
								</td>
								<td style={{ padding: "0.5rem" }}>
									<button
										type="button"
										onClick={() => handleDeleteProvider(provider)}
										disabled={deleting === provider.id}
										title="Delete provider"
										style={{
											padding: "0.25rem 0.5rem",
											backgroundColor: deleting === provider.id ? "#ccc" : "#dc3545",
											color: "white",
											border: "none",
											borderRadius: "4px",
											cursor: deleting === provider.id ? "not-allowed" : "pointer",
											fontSize: "0.875rem",
										}}
									>
										{deleting === provider.id ? "Deleting..." : "Delete"}
									</button>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			)}
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
				padding: "0.25rem 0.5rem",
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

interface ProviderFormProps {
	onSubmit: (data: NewDatabaseProvider) => Promise<void>;
	onCancel: () => void;
}

interface AppConfig {
	allowHardDelete: boolean;
	allowedNeonOrgIds: Array<string>;
}

function ProviderForm({ onSubmit, onCancel }: ProviderFormProps) {
	const [name, setName] = useState("");
	const [type, setType] = useState<ProviderType>("connection_string");
	const [region, setRegion] = useState<RegionSlug>(DEFAULT_REGION);
	const [isDefault, setIsDefault] = useState(false);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [config, setConfig] = useState<AppConfig | null>(null);

	// Connection string specific
	const [adminConnectionUrl, setAdminConnectionUrl] = useState("");

	// Neon specific
	const [neonApiKey, setNeonApiKey] = useState("");
	const [neonOrgId, setNeonOrgId] = useState("");

	// Fetch config on mount
	useEffect(() => {
		fetch("/api/config")
			.then(r => r.json())
			.then(setConfig)
			.catch(() => setConfig({ allowHardDelete: false, allowedNeonOrgIds: [] }));
	}, []);

	// Auto-fill neonOrgId when there's exactly one allowed org
	useEffect(() => {
		if (type === "neon" && config?.allowedNeonOrgIds.length === 1) {
			setNeonOrgId(config.allowedNeonOrgIds[0]);
		}
	}, [type, config]);

	function validateForm(): void {
		if (type === "connection_string" && !adminConnectionUrl.trim()) {
			throw new Error("Admin connection URL is required");
		}
		if (type === "neon") {
			if (!neonApiKey.trim()) {
				throw new Error("Neon API key is required");
			}
			if (!neonOrgId.trim()) {
				throw new Error("Neon Organization ID is required");
			}
		}
	}

	function buildProviderConfig(): Record<string, unknown> | undefined {
		if (type === "connection_string") {
			return { adminConnectionUrl };
		}
		if (type === "neon") {
			// Region is now a top-level provider field, not in the config
			return {
				apiKey: neonApiKey,
				orgId: neonOrgId,
			};
		}
		return;
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setLoading(true);
		setError(null);

		try {
			validateForm();

			const config = buildProviderConfig();
			const data: NewDatabaseProvider = {
				name,
				type,
				region,
				isDefault,
				...(config ? { config } : {}),
			};

			await onSubmit(data);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Unknown error");
		} finally {
			setLoading(false);
		}
	}

	return (
		<form onSubmit={handleSubmit}>
			<h3 style={{ marginTop: 0 }}>Add Database Provider</h3>

			<div style={{ marginBottom: "1rem" }}>
				<label htmlFor="name" style={{ display: "block", marginBottom: "0.5rem", fontWeight: "bold" }}>
					Name
				</label>
				<input
					type="text"
					id="name"
					value={name}
					onChange={e => setName(e.target.value)}
					placeholder="My Database Provider"
					required
					style={{
						width: "100%",
						padding: "0.5rem",
						fontSize: "1rem",
						border: "1px solid #ccc",
						borderRadius: "4px",
					}}
				/>
			</div>

			<div style={{ marginBottom: "1rem" }}>
				<label htmlFor="type" style={{ display: "block", marginBottom: "0.5rem", fontWeight: "bold" }}>
					Type
				</label>
				<select
					id="type"
					value={type}
					onChange={e => {
						setType(e.target.value as ProviderType);
						setError(null);
					}}
					style={{
						width: "100%",
						padding: "0.5rem",
						fontSize: "1rem",
						border: "1px solid #ccc",
						borderRadius: "4px",
					}}
				>
					<option value="connection_string">Connection String</option>
					<option value="neon">Neon</option>
				</select>
			</div>

			<div style={{ marginBottom: "1rem" }}>
				<label htmlFor="region" style={{ display: "block", marginBottom: "0.5rem", fontWeight: "bold" }}>
					Region
				</label>
				<select
					id="region"
					value={region}
					onChange={e => setRegion(e.target.value as RegionSlug)}
					style={{
						width: "100%",
						padding: "0.5rem",
						fontSize: "1rem",
						border: "1px solid #ccc",
						borderRadius: "4px",
					}}
				>
					{PROVIDER_REGIONS.map(r => (
						<option key={r.slug} value={r.slug}>
							{r.name}
							{r.slug === DEFAULT_REGION ? " (Default)" : ""}
						</option>
					))}
				</select>
				<p style={{ fontSize: "0.875rem", color: "#666", marginTop: "0.25rem" }}>
					Geographic region for this provider. Tenants in this region will use this provider.
				</p>
			</div>

			{/* Connection String specific fields */}
			{type === "connection_string" && (
				<div style={{ marginBottom: "1rem" }}>
					<label
						htmlFor="adminConnectionUrl"
						style={{ display: "block", marginBottom: "0.5rem", fontWeight: "bold" }}
					>
						Admin Connection URL
					</label>
					<input
						type="text"
						id="adminConnectionUrl"
						value={adminConnectionUrl}
						onChange={e => setAdminConnectionUrl(e.target.value)}
						placeholder="postgres://postgres:password@localhost:5432/postgres"
						style={{
							width: "100%",
							padding: "0.5rem",
							fontSize: "1rem",
							border: "1px solid #ccc",
							borderRadius: "4px",
							fontFamily: "monospace",
						}}
					/>
					<p style={{ fontSize: "0.875rem", color: "#666", marginTop: "0.25rem" }}>
						Connection string with admin privileges for provisioning databases.
					</p>
				</div>
			)}

			{/* Neon specific fields */}
			{type === "neon" && (
				<>
					<div style={{ marginBottom: "1rem" }}>
						<label
							htmlFor="neonApiKey"
							style={{ display: "block", marginBottom: "0.5rem", fontWeight: "bold" }}
						>
							Neon API Key
						</label>
						<input
							type="password"
							id="neonApiKey"
							value={neonApiKey}
							onChange={e => setNeonApiKey(e.target.value)}
							placeholder="Enter your Neon API key"
							style={{
								width: "100%",
								padding: "0.5rem",
								fontSize: "1rem",
								border: "1px solid #ccc",
								borderRadius: "4px",
								fontFamily: "monospace",
							}}
						/>
						<p style={{ fontSize: "0.875rem", color: "#666", marginTop: "0.25rem" }}>
							You can generate an API key from the{" "}
							<a
								href="https://console.neon.tech/app/settings/api-keys"
								target="_blank"
								rel="noopener noreferrer"
								style={{ color: "#0070f3" }}
							>
								Neon Console
							</a>
							.
						</p>
					</div>
					{/* Organization ID field - hidden when exactly 1 allowed org */}
					{config?.allowedNeonOrgIds.length !== 1 && (
						<div style={{ marginBottom: "1rem" }}>
							<label
								htmlFor="neonOrgId"
								style={{ display: "block", marginBottom: "0.5rem", fontWeight: "bold" }}
							>
								Organization ID
							</label>
							{config && config.allowedNeonOrgIds.length > 1 ? (
								<>
									<select
										id="neonOrgId"
										value={neonOrgId}
										onChange={e => setNeonOrgId(e.target.value)}
										style={{
											width: "100%",
											padding: "0.5rem",
											fontSize: "1rem",
											border: "1px solid #ccc",
											borderRadius: "4px",
										}}
									>
										<option value="">Select an organization...</option>
										{config.allowedNeonOrgIds.map(orgId => (
											<option key={orgId} value={orgId}>
												{orgId}
											</option>
										))}
									</select>
									{neonOrgId && (
										<p style={{ fontSize: "0.875rem", color: "#666", marginTop: "0.25rem" }}>
											<a
												href={`https://console.neon.tech/app/orgs/${neonOrgId}`}
												target="_blank"
												rel="noopener noreferrer"
												style={{ color: "#0070f3" }}
											>
												View organization in Neon Console
											</a>
										</p>
									)}
								</>
							) : (
								<>
									<input
										type="text"
										id="neonOrgId"
										value={neonOrgId}
										onChange={e => setNeonOrgId(e.target.value)}
										placeholder="org-xxxx-xxxx"
										style={{
											width: "100%",
											padding: "0.5rem",
											fontSize: "1rem",
											border: "1px solid #ccc",
											borderRadius: "4px",
											fontFamily: "monospace",
										}}
									/>
									<p style={{ fontSize: "0.875rem", color: "#666", marginTop: "0.25rem" }}>
										You can find your Organization ID on the{" "}
										<a
											href="https://console.neon.tech/app/settings/organization"
											target="_blank"
											rel="noopener noreferrer"
											style={{ color: "#0070f3" }}
										>
											Neon Organization Settings
										</a>{" "}
										page.
									</p>
								</>
							)}
						</div>
					)}
				</>
			)}

			<div style={{ marginBottom: "1rem" }}>
				<label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
					<input type="checkbox" checked={isDefault} onChange={e => setIsDefault(e.target.checked)} />
					Set as default provider for this region
				</label>
			</div>

			{error && (
				<div
					style={{
						padding: "1rem",
						backgroundColor: "#f8d7da",
						color: "#721c24",
						borderRadius: "4px",
						marginBottom: "1rem",
					}}
				>
					{error}
				</div>
			)}

			<div style={{ display: "flex", gap: "1rem" }}>
				<button
					type="submit"
					disabled={loading}
					style={{
						padding: "0.5rem 1rem",
						backgroundColor: loading ? "#ccc" : "#0070f3",
						color: "white",
						border: "none",
						borderRadius: "4px",
						cursor: loading ? "not-allowed" : "pointer",
					}}
				>
					{loading ? "Creating..." : "Create Provider"}
				</button>
				<button
					type="button"
					onClick={onCancel}
					style={{
						padding: "0.5rem 1rem",
						backgroundColor: "#e2e3e5",
						color: "#383d41",
						border: "none",
						borderRadius: "4px",
						cursor: "pointer",
					}}
				>
					Cancel
				</button>
			</div>
		</form>
	);
}
