"use client";

import { Breadcrumb } from "../../../components/Breadcrumb";
import { DangerZoneDialog } from "../../../components/DangerZoneDialog";
import { ActionsSection } from "./components/ActionsSection";
import { ProvisioningSection } from "./components/ProvisioningSection";
import { TenantConfigForm } from "./components/TenantConfigForm";
import { useConfig } from "./hooks/useConfig";
import { useTenantActions } from "./hooks/useTenantActions";
import { useTenantData } from "./hooks/useTenantData";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

export default function TenantDetailPage() {
	const params = useParams();
	const router = useRouter();
	const tenantId = params.tenantId as string;

	const { tenant, orgs, domains, loading, error, reload } = useTenantData(tenantId);
	const { allowHardDelete, gatewayDomain } = useConfig();
	const {
		actionLoading,
		actionError,
		setActionError,
		reuseExisting,
		setReuseExisting,
		schemaConflict,
		handleProvision,
		handleProvisionWithForce,
		handleReset,
		handleArchive,
		handleActivate,
	} = useTenantActions(tenantId, reload);

	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

	async function handleDelete(mode: "soft" | "hard") {
		setActionError(null);
		try {
			const response = await fetch(`/api/tenants/${tenantId}?mode=${mode}&confirm=${tenant?.slug}`, {
				method: "DELETE",
			});
			const data = await response.json();
			if (!response.ok) {
				throw new Error(data.error ?? "Failed to delete");
			}
			router.push("/tenants");
		} catch (err) {
			setActionError(err instanceof Error ? err.message : "Unknown error");
			throw err;
		}
	}

	if (loading) {
		return (
			<main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
				<p>Loading...</p>
			</main>
		);
	}

	if (error || !tenant) {
		return (
			<main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
				<p style={{ color: "red" }}>Error: {error ?? "Tenant not found"}</p>
				<Link href="/tenants">Back to Tenants</Link>
			</main>
		);
	}

	return (
		<main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif", maxWidth: "800px" }}>
			<Breadcrumb
				items={[
					{ label: "Dashboard", href: "/" },
					{ label: "Tenants", href: "/tenants" },
					{ label: tenant.displayName },
				]}
			/>
			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
				<h1>{tenant.displayName}</h1>
				<StatusBadge status={tenant.status} />
			</div>

			<p style={{ color: "#666" }}>
				Subdomain:{" "}
				<code>
					{tenant.slug}.{gatewayDomain}
				</code>
			</p>

			{actionError && (
				<div
					style={{
						padding: "1rem",
						backgroundColor: schemaConflict ? "#fff3cd" : "#f8d7da",
						color: schemaConflict ? "#856404" : "#721c24",
						borderRadius: "4px",
						marginTop: "1rem",
						border: schemaConflict ? "2px solid #ffc107" : "none",
					}}
				>
					<strong>{schemaConflict ? "⚠️ Schema Conflict" : "Error"}</strong>
					<p style={{ marginTop: "0.5rem", marginBottom: schemaConflict ? "0.5rem" : 0 }}>{actionError}</p>
					{schemaConflict && (
						<p style={{ marginTop: "0.5rem", marginBottom: 0, fontSize: "0.9rem" }}>
							Choose whether to reuse the existing schema or drop it and create a new one.
						</p>
					)}
				</div>
			)}

			{tenant.status === "provisioning" && (
				<ProvisioningSection
					actionLoading={actionLoading}
					schemaConflict={schemaConflict}
					reuseExisting={reuseExisting}
					setReuseExisting={setReuseExisting}
					handleProvision={handleProvision}
					handleProvisionWithForce={handleProvisionWithForce}
				/>
			)}

			{tenant.status === "archived" && (
				<section
					style={{ marginTop: "1rem", padding: "1rem", backgroundColor: "#e2e3e5", borderRadius: "4px" }}
				>
					<p style={{ margin: "0 0 1rem 0", color: "#383d41" }}>
						This tenant is archived. You can reactivate it to make it active again.
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
						{actionLoading ? "Activating..." : "Activate Tenant"}
					</button>
				</section>
			)}

			<section style={{ marginTop: "2rem" }}>
				<h2>Tenant Information</h2>
				<dl style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: "0.5rem" }}>
					<dt style={{ fontWeight: "bold" }}>ID</dt>
					<dd style={{ margin: 0 }}>
						<code>{tenant.id}</code>
					</dd>

					<dt style={{ fontWeight: "bold" }}>Slug</dt>
					<dd style={{ margin: 0 }}>{tenant.slug}</dd>

					<dt style={{ fontWeight: "bold" }}>Deployment Type</dt>
					<dd style={{ margin: 0 }}>{tenant.deploymentType}</dd>

					<dt style={{ fontWeight: "bold" }}>Database Provider</dt>
					<dd style={{ margin: 0 }}>
						{tenant.databaseProvider ? (
							<>
								<Link
									href={`/providers/${tenant.databaseProviderId}`}
									style={{ textDecoration: "none", color: "#0070f3" }}
								>
									{tenant.databaseProvider.name}
								</Link>{" "}
								<span style={{ color: "#666" }}>({tenant.databaseProvider.type})</span>
							</>
						) : (
							<span style={{ color: "#999" }}>Unknown</span>
						)}
					</dd>

					<dt style={{ fontWeight: "bold" }}>Created</dt>
					<dd style={{ margin: 0 }}>{new Date(tenant.createdAt).toLocaleString()}</dd>

					{tenant.provisionedAt && (
						<>
							<dt style={{ fontWeight: "bold" }}>Provisioned</dt>
							<dd style={{ margin: 0 }}>{new Date(tenant.provisionedAt).toLocaleString()}</dd>
						</>
					)}
				</dl>
			</section>

			{tenant.status === "active" && tenant.databaseProvider?.databaseHost && (
				<section style={{ marginTop: "2rem" }}>
					<h2>Database Connection</h2>
					<dl style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: "0.5rem" }}>
						<dt style={{ fontWeight: "bold" }}>Provider</dt>
						<dd style={{ margin: 0 }}>{tenant.databaseProvider.name}</dd>

						<dt style={{ fontWeight: "bold" }}>Host</dt>
						<dd style={{ margin: 0 }}>{tenant.databaseProvider.databaseHost}</dd>

						<dt style={{ fontWeight: "bold" }}>Port</dt>
						<dd style={{ margin: 0 }}>{tenant.databaseProvider.databasePort}</dd>

						<dt style={{ fontWeight: "bold" }}>Database</dt>
						<dd style={{ margin: 0 }}>{tenant.databaseProvider.databaseName}</dd>

						<dt style={{ fontWeight: "bold" }}>Username</dt>
						<dd style={{ margin: 0 }}>{tenant.databaseProvider.databaseUsername}</dd>

						<dt style={{ fontWeight: "bold" }}>SSL</dt>
						<dd style={{ margin: 0 }}>{tenant.databaseProvider.databaseSsl ? "Enabled" : "Disabled"}</dd>

						<dt style={{ fontWeight: "bold" }}>Pool Max</dt>
						<dd style={{ margin: 0 }}>{tenant.databaseProvider.databasePoolMax}</dd>
					</dl>
				</section>
			)}

			<section style={{ marginTop: "2rem" }}>
				<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
					<h2 style={{ margin: 0 }}>Organizations</h2>
					<Link
						href={`/tenants/${tenantId}/orgs`}
						style={{
							padding: "0.25rem 0.75rem",
							backgroundColor: "#007bff",
							color: "white",
							textDecoration: "none",
							borderRadius: "4px",
							fontSize: "0.875rem",
						}}
					>
						Manage Orgs
					</Link>
				</div>
				{orgs.length === 0 ? (
					<p style={{ color: "#666", marginTop: "0.5rem" }}>No organizations yet.</p>
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
									Schema
								</th>
								<th style={{ padding: "0.5rem", textAlign: "left", borderBottom: "2px solid #dee2e6" }}>
									Status
								</th>
							</tr>
						</thead>
						<tbody>
							{orgs.map(org => (
								<tr key={org.id} style={{ borderBottom: "1px solid #eee" }}>
									<td style={{ padding: "0.5rem" }}>
										<Link
											href={`/tenants/${tenantId}/orgs/${org.id}`}
											style={{ color: "#007bff", textDecoration: "none" }}
										>
											{org.displayName}
										</Link>
										{org.isDefault && (
											<span
												style={{
													marginLeft: "0.5rem",
													padding: "0.125rem 0.375rem",
													borderRadius: "4px",
													backgroundColor: "#007bff",
													color: "white",
													fontSize: "0.625rem",
												}}
											>
												Default
											</span>
										)}
									</td>
									<td style={{ padding: "0.5rem" }}>
										<code style={{ fontSize: "0.875rem" }}>{org.schemaName}</code>
									</td>
									<td style={{ padding: "0.5rem" }}>
										<StatusBadge status={org.status} />
									</td>
								</tr>
							))}
						</tbody>
					</table>
				)}
			</section>

			<section style={{ marginTop: "2rem" }}>
				<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
					<h2 style={{ margin: 0 }}>Custom Domains</h2>
					<Link
						href={`/tenants/${tenantId}/domains`}
						style={{
							padding: "0.25rem 0.75rem",
							backgroundColor: "#007bff",
							color: "white",
							textDecoration: "none",
							borderRadius: "4px",
							fontSize: "0.875rem",
						}}
					>
						Manage Domains
					</Link>
				</div>
				{domains.length === 0 ? (
					<p style={{ color: "#666", marginTop: "0.5rem" }}>No custom domains configured.</p>
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
									Domain
								</th>
								<th style={{ padding: "0.5rem", textAlign: "left", borderBottom: "2px solid #dee2e6" }}>
									Status
								</th>
								<th style={{ padding: "0.5rem", textAlign: "left", borderBottom: "2px solid #dee2e6" }}>
									SSL
								</th>
							</tr>
						</thead>
						<tbody>
							{domains.map(domain => (
								<tr key={domain.id} style={{ borderBottom: "1px solid #eee" }}>
									<td style={{ padding: "0.5rem" }}>
										<Link
											href={`/tenants/${tenantId}/domains/${domain.id}`}
											style={{ color: "#007bff", textDecoration: "none" }}
										>
											{domain.domain}
										</Link>
										{domain.isPrimary && (
											<span
												style={{
													marginLeft: "0.5rem",
													padding: "0.125rem 0.375rem",
													borderRadius: "4px",
													backgroundColor: "#007bff",
													color: "white",
													fontSize: "0.625rem",
												}}
											>
												Primary
											</span>
										)}
									</td>
									<td style={{ padding: "0.5rem" }}>
										<StatusBadge status={domain.verifiedAt ? "verified" : "pending"} />
									</td>
									<td style={{ padding: "0.5rem" }}>
										<StatusBadge status={domain.sslStatus} />
									</td>
								</tr>
							))}
						</tbody>
					</table>
				)}
			</section>

			<section style={{ marginTop: "2rem" }}>
				<h2>Configuration Overrides</h2>
				<p style={{ color: "#666", marginBottom: "1rem" }}>
					Override global configuration values for this tenant. Empty values will use the global defaults.
				</p>
				<TenantConfigForm tenantId={tenantId} configs={tenant.configs ?? {}} onSaved={reload} />
			</section>

			<section style={{ marginTop: "2rem" }}>
				<h2>Feature Flags</h2>
				<pre
					style={{
						backgroundColor: "#f5f5f5",
						padding: "1rem",
						borderRadius: "4px",
						overflow: "auto",
					}}
				>
					{JSON.stringify(tenant.featureFlags, null, 2)}
				</pre>
			</section>

			<ActionsSection
				tenant={tenant}
				actionLoading={actionLoading}
				handleReset={handleReset}
				handleArchive={handleArchive}
				setDeleteDialogOpen={setDeleteDialogOpen}
			/>

			<DangerZoneDialog
				isOpen={deleteDialogOpen}
				onClose={() => setDeleteDialogOpen(false)}
				onConfirm={handleDelete}
				title="Delete Tenant"
				resourceName="tenant"
				confirmationSlug={tenant.slug}
				warningMessage={
					allowHardDelete
						? `This will permanently remove the tenant "${tenant.displayName}" from the registry. Choose whether to keep or delete the database.`
						: `Archive or soft delete the tenant "${tenant.displayName}". Hard delete is disabled.`
				}
				showSoftDelete={true}
				showHardDelete={allowHardDelete}
			/>
		</main>
	);
}

function StatusBadge({ status }: { status: string }) {
	const colors: Record<string, { bg: string; text: string }> = {
		provisioning: { bg: "#fff3cd", text: "#856404" },
		pending: { bg: "#fff3cd", text: "#856404" },
		active: { bg: "#d4edda", text: "#155724" },
		verified: { bg: "#d4edda", text: "#155724" },
		suspended: { bg: "#f8d7da", text: "#721c24" },
		failed: { bg: "#f8d7da", text: "#721c24" },
		migrating: { bg: "#cce5ff", text: "#004085" },
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
