import { useState } from "react";

export function useTenantActions(tenantId: string, onSuccess: () => Promise<void>) {
	const [actionLoading, setActionLoading] = useState(false);
	const [actionError, setActionError] = useState<string | null>(null);
	const [reuseExisting, setReuseExisting] = useState(false);
	const [schemaConflict, setSchemaConflict] = useState(false);

	async function handleProvision() {
		setActionLoading(true);
		setActionError(null);
		const wasConflict = schemaConflict;
		setSchemaConflict(false);
		try {
			const shouldReuse = wasConflict || reuseExisting;
			const url = `/api/tenants/${tenantId}/provision${shouldReuse ? "?reuseExisting=true" : ""}`;
			const response = await fetch(url, { method: "POST" });
			const data = await response.json();

			if (response.status === 409 && data.schemaExists) {
				setSchemaConflict(true);
				setActionError(
					data.error ?? "A schema from a previously deleted tenant exists. Choose to reuse or recreate.",
				);
				setActionLoading(false);
				return;
			}

			if (!response.ok) {
				throw new Error(data.error ?? "Failed to provision");
			}
			await onSuccess();
		} catch (err) {
			setActionError(err instanceof Error ? err.message : "Unknown error");
		} finally {
			setActionLoading(false);
		}
	}

	async function handleProvisionWithForce() {
		setActionLoading(true);
		setActionError(null);
		setSchemaConflict(false);
		try {
			const response = await fetch(`/api/tenants/${tenantId}/provision?force=true`, { method: "POST" });
			const data = await response.json();
			if (!response.ok) {
				throw new Error(data.error ?? "Failed to provision");
			}
			await onSuccess();
		} catch (err) {
			setActionError(err instanceof Error ? err.message : "Unknown error");
		} finally {
			setActionLoading(false);
		}
	}

	async function handleReset() {
		if (
			!confirm(
				"Are you sure you want to reset this tenant to provisioning status? This will reset the tenant's status and may require reprovisioning.",
			)
		) {
			return;
		}
		setActionLoading(true);
		setActionError(null);
		try {
			const response = await fetch(`/api/tenants/${tenantId}/reset`, { method: "POST" });
			const data = await response.json();
			if (!response.ok) {
				throw new Error(data.error ?? "Failed to reset");
			}
			await onSuccess();
		} catch (err) {
			setActionError(err instanceof Error ? err.message : "Unknown error");
		} finally {
			setActionLoading(false);
		}
	}

	async function handleArchive() {
		if (
			!confirm(
				"Are you sure you want to archive this tenant? This will archive the tenant and all its organizations, making them inaccessible. You can reactivate it later.",
			)
		) {
			return;
		}
		setActionLoading(true);
		setActionError(null);
		try {
			const response = await fetch(`/api/tenants/${tenantId}?mode=archive`, { method: "DELETE" });
			const data = await response.json();
			if (!response.ok) {
				throw new Error(data.error ?? "Failed to archive");
			}
			await onSuccess();
		} catch (err) {
			setActionError(err instanceof Error ? err.message : "Unknown error");
		} finally {
			setActionLoading(false);
		}
	}

	async function handleActivate() {
		if (
			!confirm(
				"Are you sure you want to reactivate this tenant? This will make the tenant and all its archived organizations accessible again.",
			)
		) {
			return;
		}
		setActionLoading(true);
		setActionError(null);
		try {
			const response = await fetch(`/api/tenants/${tenantId}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ status: "active" }),
			});
			const data = await response.json();
			if (!response.ok) {
				throw new Error(data.error ?? "Failed to activate");
			}
			await onSuccess();
		} catch (err) {
			setActionError(err instanceof Error ? err.message : "Unknown error");
		} finally {
			setActionLoading(false);
		}
	}

	return {
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
	};
}
