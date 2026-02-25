"use client";

import { Breadcrumb } from "../../../../../components/Breadcrumb";
import { DangerZoneDialog } from "../../../../../components/DangerZoneDialog";
import type { Org } from "../../../../../lib/types";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// Org without any sensitive fields
type SafeOrg = Org;

/** Owner information from the API */
interface OwnerInfo {
	userId: number;
	email: string;
	name: string | null;
}

/** Pending invitation information from the API */
interface PendingInvitation {
	id: number;
	email: string;
	name: string | null;
	expiresAt: string;
	createdAt: string;
}

export default function OrgDetailPage() {
	const params = useParams();
	const router = useRouter();
	const tenantId = params.tenantId as string;
	const orgId = params.orgId as string;

	const [tenantName, setTenantName] = useState<string>("");
	const [org, setOrg] = useState<SafeOrg | null>(null);
	const [ownerInfo, setOwnerInfo] = useState<OwnerInfo | null>(null);
	const [pendingInvitation, setPendingInvitation] = useState<PendingInvitation | null>(null);
	const [loading, setLoading] = useState(true);
	const [actionLoading, setActionLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [actionError, setActionError] = useState<string | null>(null);
	const [actionSuccess, setActionSuccess] = useState<string | null>(null);
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const [allowHardDelete, setAllowHardDelete] = useState(false);
	const [showOwnerForm, setShowOwnerForm] = useState(false);
	const [newOwnerEmail, setNewOwnerEmail] = useState("");
	const [ownerSaving, setOwnerSaving] = useState(false);

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

	async function loadOwnerStatus() {
		try {
			const response = await fetch(`/api/tenants/${tenantId}/orgs/${orgId}/owner`);
			if (response.ok) {
				const data = await response.json();
				setOwnerInfo(data.owner ?? null);
				setPendingInvitation(data.pendingInvitation ?? null);
			}
		} catch (err) {
			// Silently ignore errors loading owner status - the page still works without it
			console.error("Failed to load owner status:", err);
		}
	}

	async function handleInviteOwner() {
		if (!newOwnerEmail.trim()) {
			return;
		}
		setOwnerSaving(true);
		setActionError(null);
		setActionSuccess(null);
		try {
			const response = await fetch(`/api/tenants/${tenantId}/orgs/${orgId}/owner`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email: newOwnerEmail.trim() }),
			});
			const data = await response.json();
			if (!response.ok) {
				throw new Error(data.error ?? "Failed to send owner invitation");
			}
			setActionSuccess(data.message ?? `Invitation sent to ${data.email}`);
			setShowOwnerForm(false);
			setNewOwnerEmail("");
			await loadOwnerStatus();
		} catch (err) {
			setActionError(err instanceof Error ? err.message : "Unknown error");
		} finally {
			setOwnerSaving(false);
		}
	}

	async function handleChangeOwner() {
		if (!newOwnerEmail.trim()) {
			return;
		}
		setOwnerSaving(true);
		setActionError(null);
		setActionSuccess(null);
		try {
			const response = await fetch(`/api/tenants/${tenantId}/orgs/${orgId}/owner`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email: newOwnerEmail.trim() }),
			});
			const data = await response.json();
			if (!response.ok) {
				throw new Error(data.error ?? "Failed to send owner change invitation");
			}
			setActionSuccess(data.message ?? `Owner change invitation sent to ${data.email}`);
			setShowOwnerForm(false);
			setNewOwnerEmail("");
			await loadOwnerStatus();
		} catch (err) {
			setActionError(err instanceof Error ? err.message : "Unknown error");
		} finally {
			setOwnerSaving(false);
		}
	}

	async function handleCancelInvitation() {
		if (!confirm("Are you sure you want to cancel the pending owner invitation?")) {
			return;
		}
		setActionLoading(true);
		setActionError(null);
		setActionSuccess(null);
		try {
			const response = await fetch(`/api/tenants/${tenantId}/orgs/${orgId}/owner`, {
				method: "DELETE",
			});
			const data = await response.json();
			if (!response.ok) {
				throw new Error(data.error ?? "Failed to cancel invitation");
			}
			setActionSuccess("Owner invitation cancelled");
			await loadOwnerStatus();
		} catch (err) {
			setActionError(err instanceof Error ? err.message : "Unknown error");
		} finally {
			setActionLoading(false);
		}
	}

	async function handleResendInvitation() {
		if (!pendingInvitation) {
			return;
		}
		setActionLoading(true);
		setActionError(null);
		setActionSuccess(null);
		try {
			// Cancel existing and create new invitation with same email
			await fetch(`/api/tenants/${tenantId}/orgs/${orgId}/owner`, {
				method: "DELETE",
			});
			const response = await fetch(`/api/tenants/${tenantId}/orgs/${orgId}/owner`, {
				method: ownerInfo ? "PUT" : "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email: pendingInvitation.email, name: pendingInvitation.name }),
			});
			const data = await response.json();
			if (!response.ok) {
				throw new Error(data.error ?? "Failed to resend invitation");
			}
			setActionSuccess(`Invitation resent to ${pendingInvitation.email}`);
			await loadOwnerStatus();
		} catch (err) {
			setActionError(err instanceof Error ? err.message : "Unknown error");
		} finally {
			setActionLoading(false);
		}
	}

	function handleCancelOwnerForm() {
		setShowOwnerForm(false);
		setNewOwnerEmail("");
		setActionError(null);
	}

	useEffect(() => {
		loadTenant();
		loadOrg();
		loadOwnerStatus();
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
					{ label: "Tenants", href: "/tenants" },
					{ label: tenantName || "Tenant", href: `/tenants/${tenantId}` },
					{ label: "Organizations", href: `/tenants/${tenantId}/orgs` },
					{ label: org.displayName },
				]}
			/>

			<PageHeader org={org} />

			{actionError && <ErrorAlert message={actionError} />}
			{actionSuccess && <SuccessAlert message={actionSuccess} />}

			<ProvisioningSection status={org.status} actionLoading={actionLoading} onProvision={handleProvision} />

			<ArchivedSection status={org.status} actionLoading={actionLoading} onActivate={handleActivate} />

			<OrganizationInfoSection
				org={org}
				tenantId={tenantId}
				ownerInfo={ownerInfo}
				pendingInvitation={pendingInvitation}
				showOwnerForm={showOwnerForm}
				newOwnerEmail={newOwnerEmail}
				ownerSaving={ownerSaving}
				actionLoading={actionLoading}
				onShowOwnerForm={() => {
					setShowOwnerForm(true);
					setActionSuccess(null);
				}}
				onOwnerEmailChange={setNewOwnerEmail}
				onSaveOwner={ownerInfo ? handleChangeOwner : handleInviteOwner}
				onCancelOwnerForm={handleCancelOwnerForm}
				onCancelInvitation={handleCancelInvitation}
				onResendInvitation={handleResendInvitation}
			/>

			<ActionsSection
				isDefault={org.isDefault}
				status={org.status}
				actionLoading={actionLoading}
				allowHardDelete={allowHardDelete}
				onArchive={handleArchive}
				onDelete={() => setDeleteDialogOpen(true)}
			/>

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

interface PageHeaderProps {
	org: SafeOrg;
}

function PageHeader({ org }: PageHeaderProps) {
	return (
		<>
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
		</>
	);
}

interface ErrorAlertProps {
	message: string;
}

function ErrorAlert({ message }: ErrorAlertProps) {
	return (
		<div
			style={{
				padding: "1rem",
				backgroundColor: "#f8d7da",
				color: "#721c24",
				borderRadius: "4px",
				marginTop: "1rem",
			}}
		>
			{message}
		</div>
	);
}

interface SuccessAlertProps {
	message: string;
}

function SuccessAlert({ message }: SuccessAlertProps) {
	return (
		<div
			style={{
				padding: "1rem",
				backgroundColor: "#d4edda",
				color: "#155724",
				borderRadius: "4px",
				marginTop: "1rem",
			}}
		>
			{message}
		</div>
	);
}

interface ProvisioningSectionProps {
	status: string;
	actionLoading: boolean;
	onProvision: () => void;
}

function ProvisioningSection({ status, actionLoading, onProvision }: ProvisioningSectionProps) {
	if (status !== "provisioning") {
		return null;
	}

	return (
		<section style={{ marginTop: "1rem", padding: "1rem", backgroundColor: "#fff3cd", borderRadius: "4px" }}>
			<p style={{ margin: "0 0 1rem 0", color: "#856404" }}>
				This organization needs to be provisioned. Click the button below to create the schema.
			</p>
			<button
				type="button"
				onClick={onProvision}
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
	);
}

interface ArchivedSectionProps {
	status: string;
	actionLoading: boolean;
	onActivate: () => void;
}

function ArchivedSection({ status, actionLoading, onActivate }: ArchivedSectionProps) {
	if (status !== "archived") {
		return null;
	}

	return (
		<section style={{ marginTop: "1rem", padding: "1rem", backgroundColor: "#e2e3e5", borderRadius: "4px" }}>
			<p style={{ margin: "0 0 1rem 0", color: "#383d41" }}>
				This organization is archived. You can reactivate it to make it active again.
			</p>
			<button
				type="button"
				onClick={onActivate}
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
	);
}

interface OrganizationInfoSectionProps {
	org: SafeOrg;
	tenantId: string;
	ownerInfo: OwnerInfo | null;
	pendingInvitation: PendingInvitation | null;
	showOwnerForm: boolean;
	newOwnerEmail: string;
	ownerSaving: boolean;
	actionLoading: boolean;
	onShowOwnerForm: () => void;
	onOwnerEmailChange: (email: string) => void;
	onSaveOwner: () => void;
	onCancelOwnerForm: () => void;
	onCancelInvitation: () => void;
	onResendInvitation: () => void;
}

function OrganizationInfoSection({
	org,
	tenantId,
	ownerInfo,
	pendingInvitation,
	showOwnerForm,
	newOwnerEmail,
	ownerSaving,
	actionLoading,
	onShowOwnerForm,
	onOwnerEmailChange,
	onSaveOwner,
	onCancelOwnerForm,
	onCancelInvitation,
	onResendInvitation,
}: OrganizationInfoSectionProps) {
	return (
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

				<dt style={{ fontWeight: "bold" }}>Owner</dt>
				<dd style={{ margin: 0 }}>
					<OwnerStatusField
						ownerInfo={ownerInfo}
						pendingInvitation={pendingInvitation}
						showOwnerForm={showOwnerForm}
						newOwnerEmail={newOwnerEmail}
						ownerSaving={ownerSaving}
						actionLoading={actionLoading}
						onShowForm={onShowOwnerForm}
						onEmailChange={onOwnerEmailChange}
						onSave={onSaveOwner}
						onCancel={onCancelOwnerForm}
						onCancelInvitation={onCancelInvitation}
						onResendInvitation={onResendInvitation}
					/>
				</dd>

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
	);
}

interface ActionsSectionProps {
	isDefault: boolean;
	status: string;
	actionLoading: boolean;
	allowHardDelete: boolean;
	onArchive: () => void;
	onDelete: () => void;
}

function ActionsSection({
	isDefault,
	status,
	actionLoading,
	allowHardDelete,
	onArchive,
	onDelete,
}: ActionsSectionProps) {
	if (isDefault) {
		return (
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
		);
	}

	return (
		<section style={{ marginTop: "2rem", paddingTop: "1rem", borderTop: "1px solid #eee" }}>
			<h2>Actions</h2>
			<div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
				{status === "active" && (
					<button
						type="button"
						onClick={onArchive}
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
						onClick={onDelete}
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
	);
}

interface OwnerStatusFieldProps {
	ownerInfo: OwnerInfo | null;
	pendingInvitation: PendingInvitation | null;
	showOwnerForm: boolean;
	newOwnerEmail: string;
	ownerSaving: boolean;
	actionLoading: boolean;
	onShowForm: () => void;
	onEmailChange: (email: string) => void;
	onSave: () => void;
	onCancel: () => void;
	onCancelInvitation: () => void;
	onResendInvitation: () => void;
}

function OwnerStatusField({
	ownerInfo,
	pendingInvitation,
	showOwnerForm,
	newOwnerEmail,
	ownerSaving,
	actionLoading,
	onShowForm,
	onEmailChange,
	onSave,
	onCancel,
	onCancelInvitation,
	onResendInvitation,
}: OwnerStatusFieldProps) {
	// Show form for inviting new owner (when no owner exists)
	if (showOwnerForm && !ownerInfo) {
		const canSave = !ownerSaving && newOwnerEmail.trim();
		return (
			<div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
				<input
					type="email"
					value={newOwnerEmail}
					onChange={e => onEmailChange(e.target.value)}
					placeholder="owner@example.com"
					disabled={ownerSaving}
					style={{
						padding: "0.25rem 0.5rem",
						border: "1px solid #ccc",
						borderRadius: "4px",
						fontSize: "0.875rem",
						width: "200px",
					}}
				/>
				<button
					type="button"
					onClick={onSave}
					disabled={!canSave}
					style={{
						padding: "0.25rem 0.5rem",
						backgroundColor: canSave ? "#28a745" : "#ccc",
						color: "white",
						border: "none",
						borderRadius: "4px",
						cursor: canSave ? "pointer" : "not-allowed",
						fontSize: "0.875rem",
					}}
				>
					{ownerSaving ? "Sending..." : "Send Invite"}
				</button>
				<button
					type="button"
					onClick={onCancel}
					disabled={ownerSaving}
					style={{
						padding: "0.25rem 0.5rem",
						backgroundColor: "#6c757d",
						color: "white",
						border: "none",
						borderRadius: "4px",
						cursor: ownerSaving ? "not-allowed" : "pointer",
						fontSize: "0.875rem",
					}}
				>
					Cancel
				</button>
			</div>
		);
	}

	// Show current owner with option to change
	if (ownerInfo) {
		const canSave = !ownerSaving && newOwnerEmail.trim();
		return (
			<div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
				<div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
					<span>{ownerInfo.email}</span>
					{ownerInfo.name && <span style={{ color: "#666" }}>({ownerInfo.name})</span>}
				</div>
				{pendingInvitation && (
					<PendingInvitationBadge
						invitation={pendingInvitation}
						actionLoading={actionLoading}
						onCancel={onCancelInvitation}
						onResend={onResendInvitation}
					/>
				)}
				{showOwnerForm ? (
					<div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
						<input
							type="email"
							value={newOwnerEmail}
							onChange={e => onEmailChange(e.target.value)}
							placeholder="new-owner@example.com"
							disabled={ownerSaving}
							style={{
								padding: "0.25rem 0.5rem",
								border: "1px solid #ccc",
								borderRadius: "4px",
								fontSize: "0.875rem",
								width: "200px",
							}}
						/>
						<button
							type="button"
							onClick={onSave}
							disabled={!canSave}
							style={{
								padding: "0.25rem 0.5rem",
								backgroundColor: canSave ? "#28a745" : "#ccc",
								color: "white",
								border: "none",
								borderRadius: "4px",
								cursor: canSave ? "pointer" : "not-allowed",
								fontSize: "0.875rem",
							}}
						>
							{ownerSaving ? "Saving..." : "Save"}
						</button>
						<button
							type="button"
							onClick={onCancel}
							disabled={ownerSaving}
							style={{
								padding: "0.25rem 0.5rem",
								backgroundColor: "#6c757d",
								color: "white",
								border: "none",
								borderRadius: "4px",
								cursor: ownerSaving ? "not-allowed" : "pointer",
								fontSize: "0.875rem",
							}}
						>
							Cancel
						</button>
					</div>
				) : (
					!pendingInvitation && (
						<button
							type="button"
							onClick={onShowForm}
							style={{
								padding: "0.125rem 0.5rem",
								backgroundColor: "transparent",
								color: "#007bff",
								border: "1px solid #007bff",
								borderRadius: "4px",
								cursor: "pointer",
								fontSize: "0.75rem",
								alignSelf: "flex-start",
							}}
						>
							Change Owner
						</button>
					)
				)}
			</div>
		);
	}

	// Show pending invitation if exists
	if (pendingInvitation) {
		return (
			<PendingInvitationBadge
				invitation={pendingInvitation}
				actionLoading={actionLoading}
				onCancel={onCancelInvitation}
				onResend={onResendInvitation}
			/>
		);
	}

	// No owner, no pending invitation - show invite button
	return (
		<button
			type="button"
			onClick={onShowForm}
			style={{
				padding: "0.125rem 0.5rem",
				backgroundColor: "transparent",
				color: "#007bff",
				border: "1px solid #007bff",
				borderRadius: "4px",
				cursor: "pointer",
				fontSize: "0.875rem",
			}}
		>
			Invite Owner
		</button>
	);
}

interface PendingInvitationBadgeProps {
	invitation: PendingInvitation;
	actionLoading: boolean;
	onCancel: () => void;
	onResend: () => void;
}

function PendingInvitationBadge({ invitation, actionLoading, onCancel, onResend }: PendingInvitationBadgeProps) {
	const expiresAt = new Date(invitation.expiresAt);
	const isExpired = expiresAt < new Date();
	const timeLeft = getTimeUntilExpiry(expiresAt);

	return (
		<div
			style={{
				padding: "0.5rem 0.75rem",
				backgroundColor: isExpired ? "#f8d7da" : "#fff3cd",
				borderRadius: "4px",
				fontSize: "0.875rem",
			}}
		>
			<div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
				<span
					style={{
						padding: "0.125rem 0.375rem",
						backgroundColor: isExpired ? "#dc3545" : "#ffc107",
						color: isExpired ? "white" : "#212529",
						borderRadius: "4px",
						fontSize: "0.75rem",
						fontWeight: "bold",
					}}
				>
					{isExpired ? "EXPIRED" : "PENDING"}
				</span>
				<span>Invitation to {invitation.email}</span>
			</div>
			<div style={{ color: "#666", fontSize: "0.75rem", marginBottom: "0.5rem" }}>
				{isExpired ? "Expired" : `Expires ${timeLeft}`}
			</div>
			<div style={{ display: "flex", gap: "0.25rem" }}>
				<button
					type="button"
					onClick={onResend}
					disabled={actionLoading}
					style={{
						padding: "0.125rem 0.375rem",
						backgroundColor: actionLoading ? "#ccc" : "#007bff",
						color: "white",
						border: "none",
						borderRadius: "4px",
						cursor: actionLoading ? "not-allowed" : "pointer",
						fontSize: "0.75rem",
					}}
				>
					Resend
				</button>
				<button
					type="button"
					onClick={onCancel}
					disabled={actionLoading}
					style={{
						padding: "0.125rem 0.375rem",
						backgroundColor: actionLoading ? "#ccc" : "#6c757d",
						color: "white",
						border: "none",
						borderRadius: "4px",
						cursor: actionLoading ? "not-allowed" : "pointer",
						fontSize: "0.75rem",
					}}
				>
					Cancel
				</button>
			</div>
		</div>
	);
}

function getTimeUntilExpiry(expiresAt: Date): string {
	const now = new Date();
	const diffMs = expiresAt.getTime() - now.getTime();
	if (diffMs <= 0) {
		return "expired";
	}
	const totalHours = diffMs / (1000 * 60 * 60);
	// Show days if more than 24 hours, using ceil to round up
	if (totalHours >= 24) {
		const days = Math.ceil(totalHours / 24);
		return `in ${days} day${days > 1 ? "s" : ""}`;
	}
	// Show hours if less than 24 hours
	const hours = Math.ceil(totalHours);
	if (hours > 0) {
		return `in ${hours} hour${hours > 1 ? "s" : ""}`;
	}
	return "soon";
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
