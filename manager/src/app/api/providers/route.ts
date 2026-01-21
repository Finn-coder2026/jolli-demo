import { env } from "../../../lib/Config";
import { DEFAULT_REGION, isValidRegion, PROVIDER_REGIONS } from "../../../lib/constants/Regions";
import type { Database } from "../../../lib/db/Database";
import { getDatabase } from "../../../lib/db/getDatabase";
import type { DatabaseProviderAdapter } from "../../../lib/providers/DatabaseProviderInterface";
import { createProviderAdapter } from "../../../lib/providers/ProviderFactory";
import type { DatabaseProvider, NeonProviderConfig, NewDatabaseProvider } from "../../../lib/types";
import { encrypt } from "../../../lib/util/Encryption";
import { generateProviderSlug, isValidProviderSlug } from "../../../lib/util/SlugUtils";
import { encryptPassword } from "jolli-common/server";
import { NextResponse } from "next/server";

/**
 * GET /api/providers - List all database providers
 */
export async function GET() {
	try {
		const db = await getDatabase();
		const providers = await db.providerDao.listProviders();

		// Don't expose encrypted config or database password, but include hasConfig flag
		const safeProviders = providers.map(({ configEncrypted, databasePasswordEncrypted, ...p }) => ({
			...p,
			hasConfig: !!configEncrypted,
			hasCredentials: !!databasePasswordEncrypted,
		}));
		return NextResponse.json({ providers: safeProviders });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}

/** Request body config for provider creation */
interface ProviderConfig {
	// Connection string provider
	adminConnectionUrl?: string;
	// Neon provider
	apiKey?: string;
	orgId?: string;
}

/** Request body for provider creation */
interface CreateProviderRequest extends Omit<NewDatabaseProvider, "config"> {
	config?: ProviderConfig;
	/** Region slug (e.g., "us-west-2") - defaults to DEFAULT_REGION if not provided */
	region?: string;
	reuseExisting?: boolean;
	force?: boolean;
}

/** Validation result type */
type ValidationResult = { valid: true; slug: string } | { valid: false; response: NextResponse };

const VALID_PROVIDER_TYPES = ["connection_string", "neon"];

/** Validates the provider creation request */
async function validateProviderRequest(body: CreateProviderRequest, db: Database): Promise<ValidationResult> {
	if (!body.name || !body.type) {
		return { valid: false, response: NextResponse.json({ error: "name and type are required" }, { status: 400 }) };
	}

	if (!VALID_PROVIDER_TYPES.includes(body.type)) {
		return {
			valid: false,
			response: NextResponse.json(
				{ error: `Invalid type. Must be one of: ${VALID_PROVIDER_TYPES.join(", ")}` },
				{ status: 400 },
			),
		};
	}

	// Validate region if provided
	if (body.region && !isValidRegion(body.region)) {
		return {
			valid: false,
			response: NextResponse.json(
				{ error: `Invalid region. Must be one of: ${PROVIDER_REGIONS.map(r => r.slug).join(", ")}` },
				{ status: 400 },
			),
		};
	}

	const existingByName = await db.providerDao.getProviderByName(body.name);
	if (existingByName) {
		return {
			valid: false,
			response: NextResponse.json({ error: "A provider with this name already exists" }, { status: 409 }),
		};
	}

	const slug = body.slug ?? generateProviderSlug(body.name);
	if (!isValidProviderSlug(slug)) {
		return {
			valid: false,
			response: NextResponse.json(
				{ error: "Invalid slug. Must be lowercase alphanumeric with underscores only, max 50 chars" },
				{ status: 400 },
			),
		};
	}

	const existingBySlug = await db.providerDao.getProviderBySlug(slug);
	if (existingBySlug) {
		return {
			valid: false,
			response: NextResponse.json({ error: "A provider with this slug already exists" }, { status: 409 }),
		};
	}

	return { valid: true, slug };
}

/** Builds provider data and handles type-specific configuration */
function buildProviderData(
	body: CreateProviderRequest,
	slug: string,
): { data: NewDatabaseProvider & { configEncrypted?: string }; neonConfig?: NeonProviderConfig; error?: NextResponse } {
	// Use provided region or default to DEFAULT_REGION
	const region = body.region ?? DEFAULT_REGION;

	const providerData: NewDatabaseProvider & { configEncrypted?: string } = {
		name: body.name,
		slug,
		type: body.type,
		region,
		...(body.isDefault !== undefined ? { isDefault: body.isDefault } : {}),
		...(body.connectionTemplate ? { connectionTemplate: body.connectionTemplate } : {}),
	};

	let neonConfig: NeonProviderConfig | undefined;

	if (body.type === "neon" && body.config) {
		if (!env.ENCRYPTION_KEY) {
			return {
				data: providerData,
				error: NextResponse.json({ error: "ENCRYPTION_KEY is not configured" }, { status: 500 }),
			};
		}
		if (!body.config.apiKey || !body.config.orgId) {
			return {
				data: providerData,
				error: NextResponse.json({ error: "apiKey and orgId are required for Neon provider" }, { status: 400 }),
			};
		}
		// Region comes from the provider's region field (stored without aws- prefix)
		// The Neon provider will add the aws- prefix when calling Neon API
		neonConfig = {
			apiKey: body.config.apiKey,
			orgId: body.config.orgId,
			regionId: region,
		};
		providerData.configEncrypted = encrypt(JSON.stringify(neonConfig), env.ENCRYPTION_KEY);
	} else if (body.type === "connection_string" && body.config?.adminConnectionUrl && env.ENCRYPTION_KEY) {
		providerData.configEncrypted = encrypt(
			JSON.stringify({ adminConnectionUrl: body.config.adminConnectionUrl }),
			env.ENCRYPTION_KEY,
		);
	}

	return { data: providerData, ...(neonConfig ? { neonConfig } : {}) };
}

/** Cleans up resources after a failed provisioning attempt */
async function cleanupFailedProvisioning(
	db: Database,
	providerId: string,
	adapter: DatabaseProviderAdapter,
	resourceId?: string,
): Promise<void> {
	await db.providerDao.deleteProvider(providerId);
	if (resourceId && adapter.deleteResource) {
		try {
			await adapter.deleteResource(resourceId);
		} catch {
			// Ignore cleanup errors
		}
	}
}

/**
 * Result of validating a Neon organization.
 */
interface NeonOrgValidationResult {
	valid: boolean;
	error?: string;
}

/**
 * Validates that a Neon organization exists and is accessible using the Neon API.
 * Uses the /projects endpoint with org_id query param, which works with org-scoped API keys.
 * @param apiKey - The Neon API key
 * @param orgId - The organization ID to validate
 * @returns validation result with error details if failed
 */
async function validateNeonOrg(apiKey: string, orgId: string): Promise<NeonOrgValidationResult> {
	try {
		// Use /projects endpoint with org_id query param - this works with org-scoped API keys
		// The /orgs/{orgId} endpoint may not be accessible with org-scoped keys
		const response = await fetch(`https://console.neon.tech/api/v2/projects?org_id=${encodeURIComponent(orgId)}`, {
			headers: {
				Authorization: `Bearer ${apiKey}`,
				Accept: "application/json",
			},
		});
		if (response.ok) {
			return { valid: true };
		}
		// Try to get error details from response
		let errorDetail = `HTTP ${response.status}`;
		try {
			const errorBody = await response.json();
			if (errorBody.message) {
				errorDetail = errorBody.message;
			} else if (errorBody.error) {
				errorDetail = errorBody.error;
			}
		} catch {
			// Ignore JSON parse errors
		}
		return { valid: false, error: errorDetail };
	} catch (err) {
		const message = err instanceof Error ? err.message : "Unknown error";
		return { valid: false, error: `Network error: ${message}` };
	}
}

/** Converts a provider to a safe response object (without sensitive data) */
function toSafeProvider(provider: DatabaseProvider): Record<string, unknown> {
	const { configEncrypted, databasePasswordEncrypted, ...safeProvider } = provider;
	return {
		...safeProvider,
		hasConfig: !!configEncrypted,
		hasCredentials: !!databasePasswordEncrypted,
	};
}

/**
 * POST /api/providers - Create a new database provider and provision its database
 *
 * This endpoint:
 * 1. Validates the provider configuration
 * 2. Generates a slug from the name (or uses provided slug)
 * 3. Creates the provider record with status "pending"
 * 4. Provisions the database for the provider
 * 5. Stores the credentials and marks provider as "active"
 */
export async function POST(request: Request) {
	try {
		const body = (await request.json()) as CreateProviderRequest;
		const db = await getDatabase();

		// Validate request and get slug
		const validation = await validateProviderRequest(body, db);
		if (!validation.valid) {
			return validation.response;
		}
		const { slug } = validation;

		// Build provider data with type-specific configuration
		const { data: providerData, neonConfig, error: buildError } = buildProviderData(body, slug);
		if (buildError) {
			return buildError;
		}

		// Validate Neon org exists before creating provider
		if (body.type === "neon" && neonConfig) {
			const orgValidation = await validateNeonOrg(neonConfig.apiKey, neonConfig.orgId);
			if (!orgValidation.valid) {
				return NextResponse.json(
					{
						error: `Invalid Neon Organization ID: ${neonConfig.orgId}. ${orgValidation.error ?? "Please verify the org ID exists and your API key has access to it."}`,
					},
					{ status: 400 },
				);
			}
		}

		// Create provider record with status "pending"
		const provider = await db.providerDao.createProvider(providerData);
		const adapter = await createProviderAdapter(provider, env.ADMIN_POSTGRES_URL);

		// Check if database already exists
		const dbName = `jolli_${slug}`;
		const dbExists = await adapter.checkDatabaseExists(dbName);

		if (dbExists && !body.reuseExisting && !body.force) {
			await db.providerDao.deleteProvider(provider.id);
			return NextResponse.json(
				{
					error: "A database for this provider already exists. Set reuseExisting=true to reuse it or force=true to recreate it.",
					databaseExists: true,
					canReuse: true,
				},
				{ status: 409 },
			);
		}

		// Provision the database
		await db.providerDao.updateProviderStatus(provider.id, "provisioning");
		const result = await adapter.provisionDatabase(slug, {
			...(body.reuseExisting !== undefined && { reuseExisting: body.reuseExisting }),
			...(body.force !== undefined && { force: body.force }),
		});

		if (!result.success || !result.credentials) {
			await cleanupFailedProvisioning(db, provider.id, adapter, result.resourceId);
			return NextResponse.json({ error: result.error ?? "Failed to provision database" }, { status: 500 });
		}

		// Store credentials and mark as active
		const encryptedPassword = env.ENCRYPTION_KEY
			? encryptPassword(result.credentials.password, env.ENCRYPTION_KEY)
			: result.credentials.password;

		await db.providerDao.setProviderCredentials(provider.id, {
			...result.credentials,
			password: encryptedPassword,
		});
		await db.providerDao.markProviderProvisioned(provider.id);

		// Fetch and return the updated provider
		const updatedProvider = await db.providerDao.getProvider(provider.id);
		if (!updatedProvider) {
			return NextResponse.json({ error: "Provider created but could not be retrieved" }, { status: 500 });
		}

		return NextResponse.json(
			{ provider: toSafeProvider(updatedProvider), reused: result.reused ?? false },
			{ status: 201 },
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
