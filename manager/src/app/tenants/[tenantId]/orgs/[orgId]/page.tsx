"use client";

import { Breadcrumb } from "../../../../../components/Breadcrumb";
import { DangerZoneDialog } from "../../../../../components/DangerZoneDialog";
import type { Org } from "../../../../../lib/types";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// Org without any sensitive fields
type SafeOrg = Org;

export default function OrgDetailPage() {
	const params = useParams();
	const router = useRouter();
	const tenantId = params.tenantId as string;
	const orgId = params.orgId as string;

	const [tenantName, setTenantName] = useState<string>("");
	const [org, setOrg] = useState<SafeOrg | null>(null);
	const [loading, setLoading] = useState(true);
	const [actionLoading, setActionLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [actionError, setActionError] = useState<string | null>(null);
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const [allowHardDelete, setAllowHardDelete] = useState(false);

	async function loadTenant() {
		try {
			const response = await fetch(`/api/tenants/${tenantId}`);
			if (!response.ok) {
				if (response.status === 404) {
					throw new Error("Tenant not found");
				}
				throw new Error("Failed to load tenant");
			}
			const data = await response.json();
			setTenantName(data.tenant.displayName);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Unknown error");
		}
	}

	async function loadOrg() {
		try {
			const response = await fetch(`/api/tenants/${tenantId}/orgs/${orgId}`);
			if (!response.ok) {
				if (response.status === 404) {
					throw new Error("Organization not found");
				}
				throw new Error("Failed to load organization");
			}
			const data = await response.json();
			setOrg(data.org);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Unknown error");
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => {
		loadTenant();
		loadOrg();
	}, [tenantId, orgId]);

	useEffect(() => {
		async function loadConfig() {
			try {
				const response = await fetch("/api/config");
				if (response.ok) {
					const config = await response.json();
					setAllowHardDelete(config.allowHardDelete);
				}
			} catch {
				// Ignore errors - will default to false
			}
		}
		loadConfig();
	}, []);

	async function handleProvision() {
		setActionLoading(true);
		setActionError(null);
		try {
			const response = await fetch(`/api/tenants/${tenantId}/orgs/${orgId}/provision`, { method: "POST" });
			const data = await response.json();
			if (!response.ok) {
				throw new Error(data.error ?? "Failed to provision");
			}
			await loadOrg(); // Reload org data
		} catch (err) {
			setActionError(err instanceof Error ? err.message : "Unknown error");
		} finally {
			setActionLoading(false);
		}
	}

	async function handleArchive() {
		if (
			!confirm(
				"Are you sure you want to archive this organization? This will make it inaccessible. You can reactivate it later.",
			)
		) {
			return;
		}
		setActionLoading(true);
		setActionError(null);
		try {
			const response = await fetch(`/api/tenants/${tenantId}/orgs/${orgId}?mode=archive`, {
				method: "DELETE",
			});
			const data = await response.json();
			if (!response.ok) {
				throw new Error(data.error ?? "Failed to archive");
			}
			await loadOrg();
		} catch (err) {
			setActionError(err instanceof Error ? err.message : "Unknown error");
		} finally {
			setActionLoading(false);
		}
	}

	async function handleActivate() {
		if (!confirm("Are you sure you want to reactivate this organization? This will make it accessible again.")) {
			return;
		}
		setActionLoading(true);
		setActionError(null);
		try {
			const response = await fetch(`/api/tenants/${tenantId}/orgs/${orgId}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ status: "active" }),
			});
			const data = await response.json();
			if (!response.ok) {
				throw new Error(data.error ?? "Failed to activate");
			}
			await loadOrg();
		} catch (err) {
			setActionError(err instanceof Error ? err.message : "Unknown error");
		} finally {
			setActionLoading(false);
		}
	}

	async function handleDelete(mode: "soft" | "hard") {
		setActionError(null);
		try {
			const response = await fetch(`/api/tenants/${tenantId}/orgs/${orgId}?mode=${mode}&confirm=${org?.slug}`, {
				method: "DELETE",
			});
			const data = await response.json();
			if (!response.ok) {
				throw new Error(data.error ?? "Failed to delete");
			}
			router.push(`/tenants/${tenantId}/orgs`);
		} catch (err) {
			setActionError(err instanceof Error ? err.message : "Unknown error");
			throw err; // Re-throw so dialog knows deletion failed
		}
	}

	if (loading) {
		return (
			<main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
				<p>Loading...</p>
			</main>
		);
	}

	if (error || !org) {
		return (
			<main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
				<p style={{ color: "red" }}>Error: {error ?? "Organization not found"}</p>
				<Link href={`/tenants/${tenantId}/orgs`}>Back to Organizations</Link>
			</main>
		);
	}

	return (
		<main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif", maxWidth: "800px" }}>
			<Breadcrumb
				items={[
					{ label: "Dashboard", href: "/" },
					{ label: "Tenants", href: "/tenants" },
					{ label: tenantName || "Tenant", href: `/tenants/${tenantId}` },
					{ label: "Organizations", href: `/tenants/${tenantId}/orgs` },
					{ label: org.displayName },
				]}
			/>
			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
				<h1>{org.displayName}</h1>
				<div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
					<StatusBadge status={org.status} />
					{org.isDefault && <DefaultBadge />}
				</div>
			</div>

			<p style={{ color: "#666" }}>
				Slug: <code>{org.slug}</code>
			</p>

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

			{org.status === "provisioning" && (
				<section
					style={{ marginTop: "1rem", padding: "1rem", backgroundColor: "#fff3cd", borderRadius: "4px" }}
				>
					<p style={{ margin: "0 0 1rem 0", color: "#856404" }}>
						This organization needs to be provisioned. Click the button below to create the schema.
					</p>
					<button
						type="button"
						onClick={handleProvision}
						disabled={actionLoading}
						style={{
							padding: "0.5rem 1rem",
							backgroundColor: actionLoading ? "#ccc" : "#28a745",
							color: "white",
							border: "none",
							borderRadius: "4px",
							cursor: actionLoading ? "not-allowed" : "pointer",
						}}
					>
						{actionLoading ? "Provisioning..." : "Provision Schema"}
					</button>
				</section>
			)}

			{org.status === "archived" && (
				<section
					style={{ marginTop: "1rem", padding: "1rem", backgroundColor: "#e2e3e5", borderRadius: "4px" }}
				>
					<p style={{ margin: "0 0 1rem 0", color: "#383d41" }}>
						This organization is archived. You can reactivate it to make it active again.
					</p>
					<button
						type="button"
						onClick={handleActivate}
						disabled={actionLoading}
						style={{
							padding: "0.5rem 1rem",
							backgroundColor: actionLoading ? "#ccc" : "#28a745",
							color: "white",
							border: "none",
							borderRadius: "4px",
							cursor: actionLoading ? "not-allowed" : "pointer",
						}}
					>
						{actionLoading ? "Activating..." : "Activate Organization"}
					</button>
				</section>
			)}

			<section style={{ marginTop: "2rem" }}>
				<h2>Organization Information</h2>
				<dl style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: "0.5rem" }}>
					<dt style={{ fontWeight: "bold" }}>ID</dt>
					<dd style={{ margin: 0 }}>
						<code>{org.id}</code>
					</dd>

					<dt style={{ fontWeight: "bold" }}>Tenant ID</dt>
					<dd style={{ margin: 0 }}>
						<Link href={`/tenants/${tenantId}`} style={{ color: "#007bff" }}>
							{org.tenantId}
						</Link>
					</dd>

					<dt style={{ fontWeight: "bold" }}>Slug</dt>
					<dd style={{ margin: 0 }}>{org.slug}</dd>

					<dt style={{ fontWeight: "bold" }}>Schema Name</dt>
					<dd style={{ margin: 0 }}>
						<code>{org.schemaName}</code>
					</dd>

					<dt style={{ fontWeight: "bold" }}>Default Organization</dt>
					<dd style={{ margin: 0 }}>{org.isDefault ? "Yes" : "No"}</dd>

					<dt style={{ fontWeight: "bold" }}>Created</dt>
					<dd style={{ margin: 0 }}>{new Date(org.createdAt).toLocaleString()}</dd>

					<dt style={{ fontWeight: "bold" }}>Updated</dt>
					<dd style={{ margin: 0 }}>{new Date(org.updatedAt).toLocaleString()}</dd>
				</dl>
			</section>

			{!org.isDefault && (
				<section style={{ marginTop: "2rem", paddingTop: "1rem", borderTop: "1px solid #eee" }}>
					<h2>Actions</h2>
					<div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
						{org.status === "active" && (
							<button
								type="button"
								onClick={handleArchive}
								disabled={actionLoading}
								style={{
									padding: "0.5rem 1rem",
									backgroundColor: actionLoading ? "#ccc" : "#6c757d",
									color: "white",
									border: "none",
									borderRadius: "4px",
									cursor: actionLoading ? "not-allowed" : "pointer",
								}}
							>
								Archive Organization
							</button>
						)}
						{allowHardDelete && (
							<button
								type="button"
								onClick={() => setDeleteDialogOpen(true)}
								disabled={actionLoading}
								style={{
									padding: "0.5rem 1rem",
									backgroundColor: actionLoading ? "#ccc" : "#dc3545",
									color: "white",
									border: "none",
									borderRadius: "4px",
									cursor: actionLoading ? "not-allowed" : "pointer",
								}}
							>
								Delete Organization
							</button>
						)}
					</div>
				</section>
			)}

			{org.isDefault && (
				<section style={{ marginTop: "2rem", paddingTop: "1rem", borderTop: "1px solid #eee" }}>
					<div
						style={{
							padding: "1rem",
							backgroundColor: "#e7f3ff",
							borderRadius: "4px",
							border: "1px solid #b3d9ff",
						}}
					>
						<p style={{ margin: 0, color: "#004085" }}>
							The default organization cannot be archived or deleted independently. Archive or delete the
							tenant to affect the default org.
						</p>
					</div>
				</section>
			)}

			<DangerZoneDialog
				isOpen={deleteDialogOpen}
				onClose={() => setDeleteDialogOpen(false)}
				onConfirm={handleDelete}
				title="Delete Organization"
				resourceName="organization"
				confirmationSlug={org.slug}
				warningMessage={
					allowHardDelete
						? `This will permanently delete the organization "${org.displayName}" and drop its schema. This cannot be undone.`
						: `Archive the organization "${org.displayName}". Hard delete is disabled.`
				}
				showSoftDelete={false}
				showHardDelete={allowHardDelete}
			/>
		</main>
	);
}

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
				padding: "0.25rem 0.75rem",
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
