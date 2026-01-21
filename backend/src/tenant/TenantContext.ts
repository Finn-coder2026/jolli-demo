import type { Database } from "../core/Database";
import { AsyncLocalStorage } from "node:async_hooks";
import type { Org, Tenant } from "jolli-common";

/**
 * Context for the current tenant and org within a request.
 * This is stored in AsyncLocalStorage and available throughout the request lifecycle.
 */
export interface TenantOrgContext {
	/** The tenant for the current request */
	readonly tenant: Tenant;
	/** The org for the current request */
	readonly org: Org;
	/** Convenience accessor for org.schemaName */
	readonly schemaName: string;
	/** Schema-scoped Database instance */
	readonly database: Database;
}

/** AsyncLocalStorage instance for request-scoped tenant context */
const tenantContextStorage = new AsyncLocalStorage<TenantOrgContext>();

/**
 * Get the current tenant context, if available.
 * Returns undefined if called outside of a tenant context.
 */
export function getTenantContext(): TenantOrgContext | undefined {
	return tenantContextStorage.getStore();
}

/**
 * Get the current tenant context, throwing if not available.
 * Use this when tenant context is required.
 */
export function requireTenantContext(): TenantOrgContext {
	const ctx = tenantContextStorage.getStore();
	if (!ctx) {
		throw new Error("Tenant context not initialized. This endpoint requires multi-tenant mode.");
	}
	return ctx;
}

/**
 * Get the current schema name, throwing if not in a tenant context.
 * Shorthand for requireTenantContext().schemaName
 */
export function requireSchemaName(): string {
	return requireTenantContext().schemaName;
}

/**
 * Get the current database, throwing if not in a tenant context.
 * Shorthand for requireTenantContext().database
 */
export function requireDatabase(): Database {
	return requireTenantContext().database;
}

/**
 * Run a function within a tenant context.
 * The context will be available to all code executed within the function,
 * including async operations.
 */
export function runWithTenantContext<T>(context: TenantOrgContext, fn: () => T): T {
	return tenantContextStorage.run(context, fn);
}

/**
 * Create a TenantOrgContext from its components.
 * This is a convenience function to ensure the schemaName is set correctly.
 */
export function createTenantOrgContext(tenant: Tenant, org: Org, database: Database): TenantOrgContext {
	return {
		tenant,
		org,
		schemaName: org.schemaName,
		database,
	};
}
