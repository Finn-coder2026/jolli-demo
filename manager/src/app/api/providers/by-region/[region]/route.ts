import { isValidRegion } from "../../../../../lib/constants/Regions";
import { getDatabase } from "../../../../../lib/db/getDatabase";
import { NextResponse } from "next/server";

interface RouteParams {
	params: Promise<{ region: string }>;
}

/**
 * GET /api/providers/by-region/[region] - Get providers for a specific region
 *
 * Returns all active providers in the specified region, along with the default provider ID
 * for that region (if one exists).
 */
export async function GET(_request: Request, { params }: RouteParams) {
	try {
		const { region } = await params;

		// Validate region
		if (!isValidRegion(region)) {
			return NextResponse.json({ error: "Invalid region" }, { status: 400 });
		}

		const db = await getDatabase();
		const providers = await db.providerDao.getProvidersByRegion(region);

		// Don't expose encrypted config or database password
		const safeProviders = providers.map(({ configEncrypted, databasePasswordEncrypted, ...p }) => ({
			...p,
			hasConfig: !!configEncrypted,
			hasCredentials: !!databasePasswordEncrypted,
		}));

		const defaultProvider = providers.find(p => p.isDefault);

		return NextResponse.json({
			providers: safeProviders,
			defaultProviderId: defaultProvider?.id ?? null,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
