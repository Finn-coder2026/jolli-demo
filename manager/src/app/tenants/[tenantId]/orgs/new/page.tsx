"use client";

import { Breadcrumb } from "../../../../../components/Breadcrumb";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function NewOrgPage() {
	const params = useParams();
	const router = useRouter();
	const tenantId = params.tenantId as string;

	const [tenantName, setTenantName] = useState<string>("");
	const [tenantSlug, setTenantSlug] = useState<string>("");
	const [slug, setSlug] = useState("");
	const [displayName, setDisplayName] = useState("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		async function loadTenant() {
			try {
				const response = await fetch(`/api/tenants/${tenantId}`);
				if (response.ok) {
					const data = await response.json();
					setTenantName(data.tenant.displayName);
					setTenantSlug(data.tenant.slug);
				}
			} catch {
				// Ignore errors - breadcrumb will just show "Tenant"
			}
		}
		loadTenant();
	}, [tenantId]);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setLoading(true);
		setError(null);

		try {
			const response = await fetch(`/api/tenants/${tenantId}/orgs`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ slug, displayName }),
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error ?? "Failed to create org");
			}

			router.push(`/tenants/${tenantId}/orgs/${data.org.id}`);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Unknown error");
			setLoading(false);
		}
	}

	function handleSlugChange(value: string) {
		// Auto-format slug: lowercase, replace spaces with hyphens, remove invalid chars
		const formatted = value
			.toLowerCase()
			.replace(/\s+/g, "-")
			.replace(/[^a-z0-9-]/g, "");
		setSlug(formatted);
	}

	return (
		<main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif", maxWidth: "600px" }}>
			<Breadcrumb
				items={[
					{ label: "Tenants", href: "/tenants" },
					{ label: tenantName || "Tenant", href: `/tenants/${tenantId}` },
					{ label: "Organizations", href: `/tenants/${tenantId}/orgs` },
					{ label: "New Organization" },
				]}
			/>
			<h1>Create New Organization</h1>

			<p style={{ color: "#666", marginBottom: "1.5rem" }}>
				Create a new organization within this tenant. A PostgreSQL schema will be created for this org.
			</p>

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

			<form onSubmit={handleSubmit}>
				<div style={{ marginBottom: "1rem" }}>
					<label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "bold" }}>
						Display Name *
					</label>
					<input
						type="text"
						value={displayName}
						onChange={e => setDisplayName(e.target.value)}
						required
						placeholder="e.g., Engineering Team"
						style={{
							width: "100%",
							padding: "0.5rem",
							borderRadius: "4px",
							border: "1px solid #ccc",
							fontSize: "1rem",
						}}
					/>
					<p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem", color: "#666" }}>
						Human-readable name for the organization
					</p>
				</div>

				<div style={{ marginBottom: "1rem" }}>
					<label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "bold" }}>Slug *</label>
					<input
						type="text"
						value={slug}
						onChange={e => handleSlugChange(e.target.value)}
						required
						placeholder="e.g., engineering"
						pattern="^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$"
						style={{
							width: "100%",
							padding: "0.5rem",
							borderRadius: "4px",
							border: "1px solid #ccc",
							fontSize: "1rem",
							fontFamily: "monospace",
						}}
					/>
					<p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem", color: "#666" }}>
						URL-safe identifier (lowercase letters, numbers, hyphens). Schema will be:{" "}
						<code>
							org_{tenantSlug || "tenant"}_{(slug || "slug").replace(/-/g, "_")}
						</code>
					</p>
				</div>

				<div style={{ display: "flex", gap: "0.5rem" }}>
					<button
						type="submit"
						disabled={loading}
						style={{
							padding: "0.5rem 1rem",
							backgroundColor: loading ? "#ccc" : "#28a745",
							color: "white",
							border: "none",
							borderRadius: "4px",
							cursor: loading ? "not-allowed" : "pointer",
							fontSize: "1rem",
						}}
					>
						{loading ? "Creating..." : "Create Org"}
					</button>
					<Link
						href={`/tenants/${tenantId}/orgs`}
						style={{
							padding: "0.5rem 1rem",
							backgroundColor: "#6c757d",
							color: "white",
							textDecoration: "none",
							borderRadius: "4px",
						}}
					>
						Cancel
					</Link>
				</div>
			</form>
		</main>
	);
}
