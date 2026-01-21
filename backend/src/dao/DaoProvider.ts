import type { TenantOrgContext } from "../tenant/TenantContext";

/**
 * Provider interface for getting DAOs with multi-tenant support.
 * Returns the tenant-specific DAO when context is available,
 * otherwise falls back to the default DAO.
 */
export interface DaoProvider<DaoT> {
	/**
	 * Get the appropriate DAO based on the tenant/org context.
	 * @param context the tenant/org context, or undefined for default
	 */
	getDao(context: TenantOrgContext | undefined): DaoT;
}
