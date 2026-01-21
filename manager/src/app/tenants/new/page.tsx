"use client";

import { Breadcrumb } from "../../../components/Breadcrumb";
import { DEFAULT_REGION, getRegionName, PROVIDER_REGIONS, type RegionSlug } from "../../../lib/constants/Regions";
import type { DatabaseProvider } from "../../../lib/types";
import { useConfig } from "../[tenantId]/hooks/useConfig";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** Provider selection UI based on available providers */
function ProviderSelector({
	providers,
	providerId,
	onProviderChange,
	selectedRegion,
	loadingProviders,
}: {
	providers: Array<DatabaseProvider>;
	providerId: string;
	onProviderChange: (id: string) => void;
	selectedRegion: RegionSlug;
	loadingProviders: boolean;
}) {
	if (loadingProviders) {
		return <p style={{ color: "#666", marginBottom: "1rem" }}>Loading providers...</p>;
	}

	if (providers.length === 0) {
		return (
			<div
				style={{
					padding: "1rem",
					backgroundColor: "#f8d7da",
					color: "#721c24",
					borderRadius: "4px",
					marginBottom: "1rem",
				}}
			>
				<strong>No providers available</strong>
				<p style={{ marginTop: "0.5rem", marginBottom: 0 }}>
					No database providers configured for {getRegionName(selectedRegion)}.{" "}
					<Link href="/providers">Add a provider</Link> first.
				</p>
			</div>
		);
	}

	if (providers.length === 1) {
		return (
			<p style={{ color: "#666", marginBottom: "1rem" }}>
				Using provider: <strong>{providers[0].name}</strong>
			</p>
		);
	}

	return (
		<div style={{ marginBottom: "1rem" }}>
			<label htmlFor="provider" style={{ display: "block", marginBottom: "0.5rem", fontWeight: "bold" }}>
				Database Provider
			</label>
			<select
				id="provider"
				value={providerId}
				onChange={e => onProviderChange(e.target.value)}
				style={{
					width: "100%",
					padding: "0.5rem",
					fontSize: "1rem",
					border: "1px solid #ccc",
					borderRadius: "4px",
				}}
			>
				{providers.map(provider => (
					<option key={provider.id} value={provider.id}>
						{provider.name} ({provider.type}){provider.isDefault ? " - Default" : ""}
					</option>
				))}
			</select>
		</div>
	);
}

export default function NewTenantPage() {
	const router = useRouter();
	const { gatewayDomain } = useConfig();
	const [slug, setSlug] = useState("");
	const [displayName, setDisplayName] = useState("");
	const [selectedRegion, setSelectedRegion] = useState<RegionSlug>(DEFAULT_REGION);
	const [providerId, setProviderId] = useState("");
	const [providers, setProviders] = useState<Array<DatabaseProvider>>([]);
	const [loadingProviders, setLoadingProviders] = useState(false);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [schemaConflict, setSchemaConflict] = useState(false);
	const [pendingTenantId, setPendingTenantId] = useState<string | null>(null);

	// Load providers when region changes
	useEffect(() => {
		async function loadProvidersForRegion() {
			setLoadingProviders(true);
			try {
				const response = await fetch(`/api/providers/by-region/${selectedRegion}`);
				if (!response.ok) {
					throw new Error("Failed to load providers");
				}
				const data = await response.json();
				setProviders(data.providers);

				// Auto-select logic:
				// - If only one provider, select it
				// - If multiple, select the default for this region
				// - Otherwise, select first provider
				if (data.providers.length === 1) {
					setProviderId(data.providers[0].id);
				} else if (data.defaultProviderId) {
					setProviderId(data.defaultProviderId);
				} else if (data.providers.length > 0) {
					setProviderId(data.providers[0].id);
				} else {
					setProviderId("");
				}
			} catch {
				setProviders([]);
				setProviderId("");
			} finally {
				setLoadingProviders(false);
			}
		}
		loadProvidersForRegion();
	}, [selectedRegion]);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setLoading(true);
		setError(null);
		setSchemaConflict(false);
		setPendingTenantId(null);

		try {
			// Create tenant
			const createResponse = await fetch("/api/tenants", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					slug,
					displayName,
					databaseProviderId: providerId || undefined,
				}),
			});

			if (!createResponse.ok) {
				const data = await createResponse.json();
				throw new Error(data.error ?? "Failed to create tenant");
			}

			const { tenant } = await createResponse.json();

			// Provision the database - this may detect a conflict
			await provisionTenant(tenant.id, false);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Unknown error");
			setLoading(false);
		}
	}

	async function provisionTenant(tenantId: string, reuseExisting: boolean) {
		try {
			const provisionResponse = await fetch(
				`/api/tenants/${tenantId}/provision${reuseExisting ? "?reuseExisting=true" : ""}`,
				{ method: "POST" },
			);

			if (!provisionResponse.ok) {
				const data = await provisionResponse.json();

				// Check if this is a schema conflict (409 status with schemaExists flag)
				if (provisionResponse.status === 409 && data.schemaExists) {
					setPendingTenantId(tenantId);
					setSchemaConflict(true);
					setError(data.error ?? "A schema from a previously deleted tenant exists.");
					setLoading(false);
					return;
				}

				throw new Error(data.error ?? "Failed to provision database");
			}

			// Redirect to tenant details
			router.push(`/tenants/${tenantId}`);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Unknown error");
		} finally {
			setLoading(false);
		}
	}

	async function handleReuseDatabase() {
		if (!pendingTenantId) {
			return;
		}
		setLoading(true);
		setError(null);
		setSchemaConflict(false);
		await provisionTenant(pendingTenantId, true);
	}

	async function handleRecreateDatabase() {
		if (!pendingTenantId) {
			return;
		}
		setLoading(true);
		setError(null);
		setSchemaConflict(false);
		// Force drop and recreate
		await provisionTenantWithForce(pendingTenantId);
	}

	async function provisionTenantWithForce(tenantId: string) {
		try {
			const provisionResponse = await fetch(`/api/tenants/${tenantId}/provision?force=true`, { method: "POST" });

			if (!provisionResponse.ok) {
				const data = await provisionResponse.json();
				throw new Error(data.error ?? "Failed to provision database");
			}

			// Redirect to tenant details
			router.push(`/tenants/${tenantId}`);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Unknown error");
		} finally {
			setLoading(false);
		}
	}

	async function handleCancelConflict() {
		if (!pendingTenantId) {
			router.push("/tenants");
			return;
		}

		// Delete the orphaned tenant that was created but not provisioned
		try {
			await fetch(`/api/tenants/${pendingTenantId}?mode=hard&confirm=${slug}`, { method: "DELETE" });
		} catch {
			// Ignore errors - we're canceling anyway
		}

		router.push("/tenants");
	}

	function handleSlugChange(e: React.ChangeEvent<HTMLInputElement>) {
		// Auto-format slug to lowercase, alphanumeric with hyphens
		const value = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "");
		setSlug(value);
	}

	return (
		<main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif", maxWidth: "600px" }}>
			<Breadcrumb
				items={[
					{ label: "Dashboard", href: "/" },
					{ label: "Tenants", href: "/tenants" },
					{ label: "New Tenant" },
				]}
			/>
			<h1>Create New Tenant</h1>

			<form onSubmit={handleSubmit} style={{ marginTop: "1rem" }}>
				<div style={{ marginBottom: "1rem" }}>
					<label htmlFor="slug" style={{ display: "block", marginBottom: "0.5rem", fontWeight: "bold" }}>
						Slug (subdomain)
					</label>
					<input
						type="text"
						id="slug"
						value={slug}
						onChange={handleSlugChange}
						placeholder="acme"
						required
						pattern="^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$"
						style={{
							width: "100%",
							padding: "0.5rem",
							fontSize: "1rem",
							border: "1px solid #ccc",
							borderRadius: "4px",
						}}
					/>
					<small style={{ color: "#666" }}>
						Lowercase letters, numbers, and hyphens only. This will be the subdomain: {slug || "slug"}.
						{gatewayDomain}
					</small>
				</div>

				<div style={{ marginBottom: "1rem" }}>
					<label
						htmlFor="displayName"
						style={{ display: "block", marginBottom: "0.5rem", fontWeight: "bold" }}
					>
						Display Name
					</label>
					<input
						type="text"
						id="displayName"
						value={displayName}
						onChange={e => setDisplayName(e.target.value)}
						placeholder="Acme Corporation"
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
					<label htmlFor="region" style={{ display: "block", marginBottom: "0.5rem", fontWeight: "bold" }}>
						Region
					</label>
					<select
						id="region"
						value={selectedRegion}
						onChange={e => setSelectedRegion(e.target.value as RegionSlug)}
						style={{
							width: "100%",
							padding: "0.5rem",
							fontSize: "1rem",
							border: "1px solid #ccc",
							borderRadius: "4px",
						}}
					>
						{PROVIDER_REGIONS.map(region => (
							<option key={region.slug} value={region.slug}>
								{region.name}
							</option>
						))}
					</select>
					<small style={{ color: "#666" }}>Select the geographic region for your tenant's database.</small>
				</div>

				<ProviderSelector
					providers={providers}
					providerId={providerId}
					onProviderChange={setProviderId}
					selectedRegion={selectedRegion}
					loadingProviders={loadingProviders}
				/>

				{error && (
					<div
						style={{
							padding: "1rem",
							backgroundColor: schemaConflict ? "#fff3cd" : "#f8d7da",
							color: schemaConflict ? "#856404" : "#721c24",
							borderRadius: "4px",
							marginBottom: "1rem",
							border: schemaConflict ? "2px solid #ffc107" : "none",
						}}
					>
						<strong>{schemaConflict ? "⚠️ Schema Conflict" : "Error"}</strong>
						<p style={{ marginTop: "0.5rem", marginBottom: "0.5rem" }}>{error}</p>
						{schemaConflict && (
							<p style={{ marginTop: "0.5rem", marginBottom: 0, fontSize: "0.9rem" }}>
								Choose whether to reuse the existing schema or drop it and create a new one.
							</p>
						)}
					</div>
				)}

				{schemaConflict ? (
					<div style={{ display: "flex", gap: "1rem", flexDirection: "column" }}>
						<div style={{ display: "flex", gap: "1rem" }}>
							<button
								type="button"
								onClick={handleReuseDatabase}
								disabled={loading}
								style={{
									padding: "0.5rem 1rem",
									backgroundColor: loading ? "#ccc" : "#28a745",
									color: "white",
									border: "none",
									borderRadius: "4px",
									fontSize: "1rem",
									cursor: loading ? "not-allowed" : "pointer",
									flex: 1,
								}}
							>
								{loading ? "Processing..." : "Reuse Existing Schema"}
							</button>
							<button
								type="button"
								onClick={handleRecreateDatabase}
								disabled={loading}
								style={{
									padding: "0.5rem 1rem",
									backgroundColor: loading ? "#ccc" : "#dc3545",
									color: "white",
									border: "none",
									borderRadius: "4px",
									fontSize: "1rem",
									cursor: loading ? "not-allowed" : "pointer",
									flex: 1,
								}}
							>
								{loading ? "Processing..." : "Drop and Recreate"}
							</button>
						</div>
						<button
							type="button"
							onClick={handleCancelConflict}
							style={{
								padding: "0.5rem 1rem",
								backgroundColor: "#e2e3e5",
								color: "#383d41",
								border: "none",
								borderRadius: "4px",
								fontSize: "1rem",
								cursor: "pointer",
							}}
						>
							Cancel
						</button>
					</div>
				) : (
					<div style={{ display: "flex", gap: "1rem" }}>
						<button
							type="submit"
							disabled={loading || providers.length === 0}
							style={{
								padding: "0.5rem 1rem",
								backgroundColor: loading || providers.length === 0 ? "#ccc" : "#0070f3",
								color: "white",
								border: "none",
								borderRadius: "4px",
								fontSize: "1rem",
								cursor: loading || providers.length === 0 ? "not-allowed" : "pointer",
							}}
						>
							{loading ? "Creating..." : "Create Tenant"}
						</button>
						<Link
							href="/tenants"
							style={{
								padding: "0.5rem 1rem",
								backgroundColor: "#e2e3e5",
								color: "#383d41",
								textDecoration: "none",
								borderRadius: "4px",
								fontSize: "1rem",
							}}
						>
							Cancel
						</Link>
					</div>
				)}
			</form>
		</main>
	);
}
