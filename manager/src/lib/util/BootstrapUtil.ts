import { env } from "../Config";
import type { DatabaseCredentials, ProviderType } from "../types";
import { getLog } from "./Logger";
import { createBootstrapAuthHeaders } from "jolli-common/server";
import pg from "pg";

const { Client } = pg;
const log = getLog(import.meta.url);

/** Owner user information to create in tenant database */
export interface OwnerUserInfo {
	id: number;
	email: string;
	name: string;
}

interface BootstrapOptions {
	tenantId: string;
	orgId: string;
	username: string;
	providerType: ProviderType;
	/** Credentials for the tenant database (needed for Neon providers) */
	credentials?: DatabaseCredentials;
	/** Owner user to create in tenant database after bootstrap */
	ownerUser?: OwnerUserInfo;
}

/**
 * Bootstrap the database by:
 * 1. Granting superuser privileges to the tenant user (needed for pgvector extension)
 *    - For connection_string: uses ADMIN_POSTGRES_URL
 *    - For Neon: pgvector is already available, skip superuser grant
 * 2. Calling the backend bootstrap endpoint with HMAC-signed request
 * 3. Revoking superuser privileges (even if bootstrap fails)
 *
 * @param options - Bootstrap options including tenant info and provider type
 */
export async function bootstrapDatabaseWithSuperuser(options: BootstrapOptions): Promise<void> {
	const { tenantId, orgId, username, providerType, ownerUser } = options;

	// For Neon providers, pgvector is already available without superuser
	// Just call the bootstrap endpoint directly
	if (providerType === "neon") {
		log.info("Neon provider detected, skipping superuser grant (pgvector is built-in)");
		await callBootstrapEndpoint(tenantId, orgId, ownerUser);
		return;
	}

	// For connection_string/local providers, use admin connection to grant superuser
	const adminClient = new Client({ connectionString: env.ADMIN_POSTGRES_URL });

	try {
		await adminClient.connect();

		// Grant superuser temporarily
		log.info("Granting temporary superuser privileges to %s", username);
		await adminClient.query(`ALTER USER ${quoteIdent(username)} WITH SUPERUSER`);

		try {
			await callBootstrapEndpoint(tenantId, orgId, ownerUser);
		} finally {
			// ALWAYS revoke superuser, even if bootstrap fails
			log.info("Revoking superuser privileges from %s", username);
			await adminClient.query(`ALTER USER ${quoteIdent(username)} WITH NOSUPERUSER`);
		}
	} finally {
		await adminClient.end();
	}
}

/**
 * Call the backend bootstrap endpoint with HMAC authentication.
 */
async function callBootstrapEndpoint(tenantId: string, orgId: string, ownerUser?: OwnerUserInfo): Promise<void> {
	log.info("Calling backend bootstrap endpoint for tenant %s, org %s", tenantId, orgId);

	const authHeaders = createBootstrapAuthHeaders(tenantId, orgId, env.BOOTSTRAP_SECRET as string);

	// Build headers with optional Vercel bypass
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		...authHeaders,
	};

	// Add Vercel protection bypass header if configured
	if (env.VERCEL_BYPASS_SECRET) {
		headers["x-vercel-protection-bypass"] = env.VERCEL_BYPASS_SECRET;
	}

	// Build request body with optional ownerUser
	const body: { tenantId: string; orgId: string; ownerUser?: OwnerUserInfo } = { tenantId, orgId };
	if (ownerUser) {
		body.ownerUser = ownerUser;
	}

	let response: Response;
	try {
		response = await fetch(`${env.BACKEND_INTERNAL_URL}/api/admin/bootstrap`, {
			method: "POST",
			headers,
			body: JSON.stringify(body),
		});
	} catch (fetchError) {
		// Network error - backend not reachable
		const message = fetchError instanceof Error ? fetchError.message : String(fetchError);
		throw new Error(`Bootstrap failed: Could not connect to backend at ${env.BACKEND_INTERNAL_URL} - ${message}`);
	}

	if (!response.ok) {
		const responseText = await response.text().catch(() => "");
		let errorMessage: string;
		try {
			const errorBody = JSON.parse(responseText);
			// Prefer details over error - 'error' is often generic like "Bootstrap failed"
			// while 'details' contains the actual error message
			errorMessage = errorBody.details || errorBody.error || response.statusText;
		} catch {
			// Response is not JSON - include status and partial body for debugging
			const truncatedBody = responseText.slice(0, 200);
			errorMessage = `HTTP ${response.status}: ${truncatedBody || response.statusText}`;
		}
		throw new Error(`Bootstrap failed: ${errorMessage}`);
	}

	const result = await response.json();
	log.info("Bootstrap completed successfully: %o", result);
}

/**
 * Quote an identifier for use in SQL.
 * PostgreSQL identifier quoting: double any double quotes, wrap in double quotes.
 *
 * @param identifier - The SQL identifier to quote
 * @returns The quoted identifier safe for use in SQL
 */
export function quoteIdent(identifier: string): string {
	return `"${identifier.replace(/"/g, '""')}"`;
}
