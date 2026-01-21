import { env } from "../../../../lib/Config";
import { PRECONFIGURED_PROVIDER_SLUG } from "../../../../lib/db/Database";
import { getDatabase } from "../../../../lib/db/getDatabase";
import { createProviderAdapter } from "../../../../lib/providers/ProviderFactory";
import type { DatabaseCredentials } from "../../../../lib/types";
import { decryptPassword } from "jolli-common/server";
import { NextResponse } from "next/server";

interface RouteParams {
	params: Promise<{ providerId: string }>;
}

/**
 * GET /api/providers/[providerId] - Get a specific provider with its tenants
 */
export async function GET(_request: Request, { params }: RouteParams) {
	try {
		const { providerId } = await params;
		const db = await getDatabase();
		const provider = await db.providerDao.getProvider(providerId);

		if (!provider) {
			return NextResponse.json({ error: "Provider not found" }, { status: 404 });
		}

		// Get tenants associated with this provider
		const tenants = await db.tenantDao.getTenantsByProviderId(providerId);

		// Don't expose encrypted config or database password
		const { configEncrypted, databasePasswordEncrypted, ...safeProvider } = provider;

		return NextResponse.json({
			provider: {
				...safeProvider,
				hasConfig: !!configEncrypted,
				hasCredentials: !!databasePasswordEncrypted,
			},
			tenants,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}

/**
 * DELETE /api/providers/[providerId] - Delete a provider and optionally deprovision its database
 *
 * Query params:
 * - mode: "archive" to keep database, "drop" to delete database (default: "archive")
 * - confirm: Must match provider slug to proceed with "drop" mode
 */
export async function DELETE(request: Request, { params }: RouteParams) {
	try {
		const { providerId } = await params;
		const { searchParams } = new URL(request.url);
		const mode = (searchParams.get("mode") ?? "archive") as "archive" | "drop";
		const confirm = searchParams.get("confirm");

		const db = await getDatabase();

		// Check if provider exists
		const provider = await db.providerDao.getProvider(providerId);
		if (!provider) {
			return NextResponse.json({ error: "Provider not found" }, { status: 404 });
		}

		// Cannot delete the pre-configured provider when default provider is enabled
		if (!env.DISABLE_DEFAULT_PROVIDER && provider.slug === PRECONFIGURED_PROVIDER_SLUG) {
			return NextResponse.json(
				{
					error: "Cannot delete the pre-configured provider. Set DISABLE_DEFAULT_PROVIDER=true to allow deletion.",
				},
				{ status: 400 },
			);
		}

		// Cannot delete provider with associated tenants
		const tenants = await db.tenantDao.getTenantsByProviderId(providerId);
		if (tenants.length > 0) {
			return NextResponse.json(
				{
					error: `Cannot delete provider with ${tenants.length} associated tenant${tenants.length === 1 ? "" : "s"}. Delete or migrate the tenants first.`,
				},
				{ status: 400 },
			);
		}

		// For "drop" mode, require confirmation
		if (mode === "drop" && confirm !== provider.slug) {
			return NextResponse.json(
				{
					error: `To permanently delete the database, pass confirm=${provider.slug}`,
					requiresConfirmation: true,
				},
				{ status: 400 },
			);
		}

		// Deprovision database if provider has credentials and mode is "drop"
		if (provider.databaseHost && provider.databasePasswordEncrypted) {
			// Decrypt password
			let password = provider.databasePasswordEncrypted;
			if (env.ENCRYPTION_KEY) {
				password = decryptPassword(provider.databasePasswordEncrypted, env.ENCRYPTION_KEY);
			}

			const credentials: DatabaseCredentials = {
				host: provider.databaseHost,
				port: provider.databasePort,
				database: provider.databaseName ?? "",
				username: provider.databaseUsername ?? "",
				password,
				ssl: provider.databaseSsl,
			};

			const adapter = await createProviderAdapter(provider, env.ADMIN_POSTGRES_URL);
			await adapter.deprovisionDatabase(provider.slug, credentials, mode === "drop" ? "drop" : "retain");
		}

		// Delete provider record
		const deleted = await db.providerDao.deleteProvider(providerId);
		if (!deleted) {
			return NextResponse.json({ error: "Failed to delete provider" }, { status: 500 });
		}

		return NextResponse.json({ success: true, databaseDropped: mode === "drop" });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}

/** Request body for PATCH - update provider settings */
interface PatchProviderRequest {
	/** Set provider as default for its region */
	isDefault?: boolean;
}

/**
 * PATCH /api/providers/[providerId] - Update provider settings
 * Note: Region cannot be changed after provider creation.
 */
export async function PATCH(request: Request, { params }: RouteParams) {
	try {
		const { providerId } = await params;
		const body = (await request.json()) as PatchProviderRequest;

		const db = await getDatabase();

		// Check if provider exists
		const provider = await db.providerDao.getProvider(providerId);
		if (!provider) {
			return NextResponse.json({ error: "Provider not found" }, { status: 404 });
		}

		// Update isDefault if provided
		if (body.isDefault !== undefined) {
			if (body.isDefault) {
				await db.providerDao.setDefault(providerId);
			} else {
				await db.providerDao.updateProvider(providerId, { isDefault: false });
			}
		}

		// Fetch updated provider
		const updated = await db.providerDao.getProvider(providerId);
		if (!updated) {
			return NextResponse.json({ error: "Failed to update provider" }, { status: 500 });
		}

		// Return safe provider (without encrypted config)
		const { configEncrypted, databasePasswordEncrypted, ...safeProvider } = updated;
		return NextResponse.json({
			provider: {
				...safeProvider,
				hasConfig: !!configEncrypted,
				hasCredentials: !!databasePasswordEncrypted,
			},
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
