"use client";

import { Breadcrumb } from "../../../../../components/Breadcrumb";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";

export default function NewDomainPage() {
	const params = useParams();
	const router = useRouter();
	const tenantId = params.tenantId as string;

	const [tenantName, setTenantName] = useState<string>("");
	const [domain, setDomain] = useState("");
	const [isPrimary, setIsPrimary] = useState(false);
	const [loading, setLoading] = useState(true);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		async function loadTenant() {
			try {
				const response = await fetch(`/api/tenants/${tenantId}`);
				if (!response.ok) {
					throw new Error("Tenant not found");
				}
				const data = await response.json();
				setTenantName(data.tenant.displayName);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Unknown error");
			} finally {
				setLoading(false);
			}
		}
		loadTenant();
	}, [tenantId]);

	async function handleSubmit(e: FormEvent) {
		e.preventDefault();
		setSubmitting(true);
		setError(null);

		try {
			const response = await fetch(`/api/tenants/${tenantId}/domains`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ domain, isPrimary }),
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "Failed to create domain");
			}

			// Redirect to domain detail page for verification
			router.push(`/tenants/${tenantId}/domains/${data.domain.id}`);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Unknown error");
			setSubmitting(false);
		}
	}

	if (loading) {
		return (
			<main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
				<p>Loading...</p>
			</main>
		);
	}

	if (error && !domain) {
		return (
			<main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
				<p style={{ color: "red" }}>Error: {error}</p>
				<Link href={`/tenants/${tenantId}/domains`}>Back to Domains</Link>
			</main>
		);
	}

	return (
		<main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif", maxWidth: "600px" }}>
			<Breadcrumb
				items={[
					{ label: "Tenants", href: "/tenants" },
					{ label: tenantName || "Tenant", href: `/tenants/${tenantId}` },
					{ label: "Domains", href: `/tenants/${tenantId}/domains` },
					{ label: "Add Domain" },
				]}
			/>
			<h1>Add Custom Domain</h1>

			<p style={{ color: "#666", marginBottom: "1.5rem" }}>
				Add a custom domain to access this tenant. You will need to verify domain ownership by adding a DNS TXT
				record.
			</p>

			<form onSubmit={handleSubmit}>
				<div style={{ marginBottom: "1rem" }}>
					<label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "bold" }}>
						Domain Name <span style={{ color: "red" }}>*</span>
					</label>
					<input
						type="text"
						value={domain}
						onChange={e => setDomain(e.target.value)}
						placeholder="docs.example.com"
						required
						style={{
							width: "100%",
							padding: "0.5rem",
							border: "1px solid #ccc",
							borderRadius: "4px",
							fontSize: "1rem",
						}}
					/>
					<small style={{ color: "#666" }}>Enter your custom domain (e.g., docs.example.com)</small>
				</div>

				<div style={{ marginBottom: "1.5rem" }}>
					<label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
						<input
							type="checkbox"
							checked={isPrimary}
							onChange={e => setIsPrimary(e.target.checked)}
							style={{ width: "18px", height: "18px" }}
						/>
						<span>Set as primary domain</span>
					</label>
					<small style={{ color: "#666", marginLeft: "1.75rem", display: "block" }}>
						Primary domains are used as the default when multiple domains are configured.
					</small>
				</div>

				{error && (
					<div
						style={{
							padding: "0.75rem",
							marginBottom: "1rem",
							backgroundColor: "#f8d7da",
							color: "#721c24",
							borderRadius: "4px",
						}}
					>
						{error}
					</div>
				)}

				<div style={{ display: "flex", gap: "1rem" }}>
					<button
						type="submit"
						disabled={submitting}
						style={{
							padding: "0.5rem 1rem",
							backgroundColor: submitting ? "#6c757d" : "#007bff",
							color: "white",
							border: "none",
							borderRadius: "4px",
							cursor: submitting ? "not-allowed" : "pointer",
						}}
					>
						{submitting ? "Adding..." : "Add Domain"}
					</button>
					<Link
						href={`/tenants/${tenantId}/domains`}
						style={{
							padding: "0.5rem 1rem",
							backgroundColor: "#f8f9fa",
							color: "#333",
							textDecoration: "none",
							borderRadius: "4px",
							border: "1px solid #ccc",
						}}
					>
						Cancel
					</Link>
				</div>
			</form>
		</main>
	);
}
