import type { OrgSummary, Tenant, TenantDomain } from "../../../../lib/types";
import { useEffect, useState } from "react";

type SafeTenant = Omit<Tenant, "databasePasswordEncrypted">;

export function useTenantData(tenantId: string) {
	const [tenant, setTenant] = useState<SafeTenant | null>(null);
	const [orgs, setOrgs] = useState<Array<OrgSummary>>([]);
	const [domains, setDomains] = useState<Array<TenantDomain>>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

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
			setTenant(data.tenant);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Unknown error");
		} finally {
			setLoading(false);
		}
	}

	async function loadOrgs() {
		try {
			const response = await fetch(`/api/tenants/${tenantId}/orgs`);
			if (response.ok) {
				const data = await response.json();
				setOrgs(data.orgs);
			}
		} catch {
			// Ignore errors loading orgs - they'll just not be displayed
		}
	}

	async function loadDomains() {
		try {
			const response = await fetch(`/api/tenants/${tenantId}/domains`);
			if (response.ok) {
				const data = await response.json();
				setDomains(data.domains);
			}
		} catch {
			// Ignore errors loading domains - they'll just not be displayed
		}
	}

	async function reload() {
		await Promise.all([loadTenant(), loadOrgs()]);
	}

	useEffect(() => {
		loadTenant();
		loadOrgs();
		loadDomains();
	}, [tenantId]);

	return {
		tenant,
		orgs,
		domains,
		loading,
		error,
		reload,
	};
}
