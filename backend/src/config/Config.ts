import { getTenantOrigin } from "../tenant/DomainUtils";
import { getTenantContext } from "../tenant/TenantContext";
import { getLog } from "../util/Logger";
import type { ParameterStoreLoader } from "./ParameterStoreLoader";
import { AWSParameterStoreProvider, ConfigProviderChain, LocalEnvProvider } from "./providers";
import { createHash } from "node:crypto";
import { createEnv } from "@t3-oss/env-core";
import { config as dotenvConfig } from "dotenv";
import type { Tenant } from "jolli-common";
import type { Algorithm } from "jsonwebtoken";
import type { StringValue } from "ms";
import { z } from "zod";

const log = getLog(import.meta);

export interface WorkflowConfig {
	e2bApiKey: string;
	e2bTemplateId: string;
	e2bEnabled: boolean;
	anthropicApiKey: string;
	githubToken?: string;
	/** Sync server URL for CLI sync operations inside sandbox (derived from JOLLI_PUBLIC_URL + "/api") */
	syncServerUrl: string;
	jolliAuthToken?: string;
	jolliSpace?: string;
	debug: boolean;
	vercelToken?: string;
	tavilyApiKey?: string;
}

const BooleanSchema = z
	.string()
	// only allow "true" or "false"
	.refine(s => s === "true" || s === "false")
	// transform to boolean
	.transform(s => s === "true")
	.default("false");

const JWTAlgorithmSchema = z.string().transform(s => s as Algorithm);

const MSStringValueSchema = z.string().transform(s => s as StringValue);

const GithubAppInfoSchema = z.object({
	id: z.number().optional(),
	app_id: z.number(),
	slug: z.string(),
	client_id: z.string(),
	client_secret: z.string(),
	webhook_secret: z.string(),
	private_key: z.string(),
	name: z.string(),
	html_url: z.string().url(),
	created_at: z.string().datetime({ offset: true }).optional(),
	updated_at: z.string().datetime({ offset: true }).optional(),
});

const GithubAppInfoJsonSchema = z.string().pipe(
	z.preprocess((input, ctx) => {
		try {
			return JSON.parse(input as string); // Attempt to parse the string
		} catch (_e) {
			ctx.addIssue({
				code: "custom",
				message: "Invalid JSON string",
			});
			return z.NEVER; // Indicate a parsing failure
		}
	}, GithubAppInfoSchema),
);

/**
 * Configuration schema definition
 */
/**
 * Keys that can be overridden at tenant level from tenant.configs
 */
export const ALLOWED_TENANT_CONFIG_KEYS = [
	"ANTHROPIC_API_KEY",
	// Tenant-level auth configuration
	"AUTH_EMAILS", // Email regex patterns, or "*" to allow all emails
	"AWS_OIDC_ROLE_ARN",
	"AWS_REGION",
	"DEV_TOOLS_GITHUB_APP_NAME",
	"E2B_API_KEY",
	"E2B_TEMPLATE_ID",
	// Enabled auth providers for this tenant (e.g., "jolli_google,jolli_github")
	"ENABLED_AUTH_PROVIDERS",
	// Maximum users allowed, or "unlimited" for paid customers
	"MAX_SEATS",
	"TOKEN_ALGORITHM",
	"TOKEN_EXPIRES_IN",
	"USE_DEVELOPER_TOOLS",
	"USE_DEV_TOOLS_GITHUB_APP_CREATED",
	"USE_DEV_TOOLS_JOB_TESTER",
	"USE_DEV_TOOLS_DATA_CLEARER",
	"USE_TENANT_SWITCHER",
] as const;

export type AllowedTenantConfigKey = (typeof ALLOWED_TENANT_CONFIG_KEYS)[number];

const configSchema = {
	server: {
		ANTHROPIC_API_KEY: z.string().optional(),
		// Multi-tenant auth gateway configuration
		// Encryption key for auth codes (32-byte key for AES-256-GCM, base64 encoded)
		AUTH_CODE_ENCRYPTION_KEY: z.string().optional(),
		// Expiry time for auth codes (default: 60s)
		AUTH_CODE_EXPIRY: MSStringValueSchema.default("60s"),
		// Signing key for auth codes (HMAC-SHA256)
		AUTH_CODE_SIGNING_KEY: z.string().optional(),
		// Encryption key for tenant database passwords (32-byte key, base64 encoded)
		// Must match ENCRYPTION_KEY in the manager app for password encryption/decryption
		DB_PASSWORD_ENCRYPTION_KEY: z.string().optional(),
		// Database connection retry configuration
		// Maximum number of retries for initial database connection (default: 5)
		DB_CONNECT_MAX_RETRIES: z.coerce.number().default(5),
		// Base delay in milliseconds for connection retry backoff (default: 2000)
		DB_CONNECT_RETRY_BASE_DELAY_MS: z.coerce.number().default(2000),
		// Maximum delay in milliseconds for connection retry backoff (default: 30000)
		DB_CONNECT_RETRY_MAX_DELAY_MS: z.coerce.number().default(30000),
		// Email regex patterns for allowed emails (comma-separated, or "*" for all)
		// In single-tenant mode, this is used directly. In multi-tenant mode, can be overridden per tenant.
		AUTH_EMAILS: z.string().default(".*"),
		// Auth gateway origin for OAuth callbacks (e.g., "https://auth.jolli-local.me")
		// Used by better-auth for OAuth redirect URIs
		// Defaults to ORIGIN when not set
		AUTH_GATEWAY_ORIGIN: z.string().url().optional(),
		// AWS OIDC Role ARN for Web Identity federation
		AWS_OIDC_ROLE_ARN: z.string().optional(),
		AWS_REGION: z.string().default("us-west-2"),
		// Base domain for tenant subdomains (e.g., "jolli.ai"). When not set, localhost is used.
		BASE_DOMAIN: z.string().optional(),
		// Cookie domain for setting cookies (e.g., ".jolli.ai" for sharing across subdomains).
		// If not set, defaults to ".{BASE_DOMAIN}" when BASE_DOMAIN is configured, otherwise no domain is set.
		COOKIE_DOMAIN: z.string().optional(),
		// Connect gateway domain for external integration callbacks (e.g., "connect.jolli.ai")
		// Defaults to connect.{BASE_DOMAIN} when BASE_DOMAIN is set
		CONNECT_GATEWAY_DOMAIN: z.string().optional(),
		// When true, enables HTTPS gateway mode - uses HTTPS without port, validates CORS against BASE_DOMAIN
		USE_GATEWAY: BooleanSchema,
		// When true, allows localhost origins in CORS even when USE_GATEWAY is enabled
		// Useful for local development with gateway mode pointing to a real domain
		ALLOW_LOCALHOST_ORIGIN: BooleanSchema,
		DEV_TOOLS_GITHUB_APP_NAME: z.string().optional(),
		E2B_API_KEY: z.string().optional(),
		E2B_TEMPLATE_ID: z.string().optional(),
		// Enabled auth providers for multi-tenant mode (e.g., "jolli_google,jolli_github")
		// Default: jolli_google,jolli_github (Jolli's shared OAuth apps via central gateway)
		ENABLED_AUTH_PROVIDERS: z.string().default("jolli_google,jolli_github"),
		GITHUB_APP_NAME: z.string().default("Jolli"),
		// Github App Info for Jolli
		GITHUB_APPS_INFO: GithubAppInfoJsonSchema.optional(),
		GITHUB_CLIENT_ID: z.string().optional(),
		GITHUB_CLIENT_SECRET: z.string().optional(),
		// GitHub Connect keys for multi-tenant GitHub integration flow
		// Encryption key for GitHub installation state/code (32-byte key for AES-256-GCM, base64 encoded)
		GITHUB_CONNECT_ENCRYPTION_KEY: z.string().optional(),
		// Signing key for GitHub installation state/code (HMAC-SHA256)
		GITHUB_CONNECT_SIGNING_KEY: z.string().optional(),
		GITHUB_ORG: z.string().optional(),
		// GitLab Connect keys for multi-tenant GitLab integration flow (future use)
		GITLAB_CONNECT_ENCRYPTION_KEY: z.string().optional(),
		GITLAB_CONNECT_SIGNING_KEY: z.string().optional(),
		GITHUB_TOKEN: z.string().optional(),
		GOOGLE_CLIENT_ID: z.string().optional(),
		GOOGLE_CLIENT_SECRET: z.string().optional(),
		// SendGrid configuration for email sending (password reset, notifications)
		SENDGRID_API_KEY: z.string().optional(),
		SENDGRID_FROM_EMAIL: z.string().email().optional(),
		SENDGRID_FROM_NAME: z.string().default("Jolli Support"),
		JOBS_STORE_FOR_DAYS: z.coerce.number().default(30),
		// Public backend URL reachable from external sandboxes (E2B).
		// Falls back to ORIGIN when not set.
		JOLLI_PUBLIC_URL: z.string().url().optional(),
		// Default log level for all loggers (can be changed at runtime via admin API)
		LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
		// Persist log level overrides to Redis (survives restarts when Redis is configured)
		LOG_LEVEL_PERSIST_TO_REDIS: BooleanSchema.default("true"),
		// TTL for persisted log level state in Redis in seconds (0 = no expiry, default: 24 hours)
		LOG_LEVEL_PERSIST_TTL_SECONDS: z.coerce.number().int().min(0).default(86400),
		MAX_VISIBLE_DRAFTS: z.coerce.number().default(5),
		// Maximum seats (users) allowed per tenant. Use "unlimited" for paid customers.
		// Default: 5 for sandbox tenants
		MAX_SEATS: z.string().default("5"),
		// Mercure Hub Configuration for distributed SSE
		MERCURE_ENABLED: BooleanSchema,
		MERCURE_HUB_BASE_URL: z.string().url().optional(),
		MERCURE_PUBLISHER_JWT_SECRET: z.string().optional(),
		MERCURE_SUBSCRIBER_JWT_SECRET: z.string().optional(),
		// Multi-tenant mode configuration
		MULTI_TENANT_ENABLED: BooleanSchema,
		// URL for the tenant registry database (manager's database)
		MULTI_TENANT_REGISTRY_URL: z.string().optional(),
		// Maximum number of tenant/org connections to cache
		MULTI_TENANT_CONNECTION_POOL_MAX: z.coerce.number().default(100),
		// TTL for cached connections in milliseconds (default: 30 minutes)
		MULTI_TENANT_CONNECTION_TTL_MS: z.coerce.number().default(1800000),
		// Pool max per tenant connection
		MULTI_TENANT_POOL_MAX_PER_CONNECTION: z.coerce.number().default(5),
		// Skip schema migrations during deployment (used for testing/debugging)
		SKIP_SCHEMA_MIGRATIONS: BooleanSchema,
		// Skip automatic dev migrations on backend startup (for local development)
		SKIP_DEV_MIGRATIONS: BooleanSchema,
		// Canary tenant slug for migration dry-run and actual migrations (requires CANARY_ORG_SLUG)
		CANARY_TENANT_SLUG: z.string().optional(),
		// Canary org slug for migration dry-run and actual migrations (requires CANARY_TENANT_SLUG)
		CANARY_ORG_SLUG: z.string().optional(),
		// Shared secret for the /api/admin/bootstrap endpoint (used during org provisioning)
		BOOTSTRAP_SECRET: z.string().optional(),
		// Timestamp tolerance window for bootstrap request signatures in milliseconds (default: 5 minutes)
		BOOTSTRAP_TIMESTAMP_TOLERANCE_MS: z.coerce.number().default(300000),
		NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
		ORIGIN: z.string().url().default("http://localhost:8034"),
		POSTGRES_DATABASE: z.string().default(""),
		POSTGRES_HOST: z.string().default(""),
		POSTGRES_LOGGING: BooleanSchema,
		POSTGRES_NO_PORT: BooleanSchema,
		POSTGRES_PASSWORD: z.string().default(""),
		POSTGRES_POOL_MAX: z.coerce.number().default(5),
		POSTGRES_PORT: z.coerce.number().default(5432),
		POSTGRES_QUERY: z.string().default(""),
		POSTGRES_SCHEME: z.enum(["postgres", "postgresql"]).default("postgres"),
		POSTGRES_SSL: BooleanSchema,
		POSTGRES_USERNAME: z.string().default(""),
		// Parameter Store environment (e.g., "prod", "dev", "staging")
		// Used to load parameters from /jolli/{pathBase}/${PSTORE_ENV}/*
		PSTORE_ENV: z.string().optional(),
		// Parameter Store path base override
		// Controls which path prefix is used: /jolli/{PSTORE_PATH_BASE}/{PSTORE_ENV}/*
		// "app" is the default for ECS deployments, "backend" is for local/legacy use
		PSTORE_PATH_BASE: z.enum(["app", "backend"]).optional(),
		// Skip AWS Parameter Store loading for faster cold starts
		// This eliminates 500-1500ms of cold start latency from AWS API calls
		SKIP_PSTORE: BooleanSchema,
		ROOT_PATH: z.string().default("/"),
		SEED_DATABASE: BooleanSchema,
		// Enable demo jobs (test document generation). Set to "false" in production for faster cold starts.
		ENABLE_DEMO_JOBS: BooleanSchema.default("true"),
		SEQUELIZE: z.enum(["memory", "postgres"]).default("memory"),
		SMEE_API_URL: z.string().url().optional(),
		// Super admin email patterns that can access any tenant (e.g., "@jolli\\.ai$")
		// Comma-separated regex patterns. Global only - not configurable per tenant.
		SUPER_ADMIN_EMAILS: z.string().optional(),
		TAVILY_API_KEY: z.string().optional(),
		// Session timeout configuration
		// @deprecated Frontend idle timeout removed. Kept for backwards compatibility.
		// Previously used for client-side inactivity tracking, now handled via TOKEN_EXPIRES_IN.
		SESSION_IDLE_TIMEOUT: MSStringValueSchema.default("1h"),
		// Master secret for deriving per-tenant TOKEN_SECRET values
		TENANT_TOKEN_MASTER_SECRET: z.string().optional(),
		TOKEN_ALGORITHM: JWTAlgorithmSchema.default("HS256"),
		// Cookie lifetime - should match TOKEN_EXPIRES_IN
		TOKEN_COOKIE_MAX_AGE: MSStringValueSchema.default("2h"),
		// Token lifetime - controls session expiration (backend 401 response on expiry)
		TOKEN_EXPIRES_IN: MSStringValueSchema.default("2h"),
		// Refresh token when this much time remains before expiration
		TOKEN_REFRESH_WINDOW: MSStringValueSchema.default("45m"),
		TOKEN_SECRET: z.string(),
		// Remember-me token configuration
		// Duration for remember-me tokens (default: 30 days)
		REMEMBER_ME_DURATION: MSStringValueSchema.default("30d"),
		// Enable remember-me feature (default: true)
		REMEMBER_ME_ENABLED: BooleanSchema.default("true"),
		// Rotate token on each use for security (default: true)
		REMEMBER_ME_ROTATION: BooleanSchema.default("true"),
		// Maximum number of remember-me tokens per user (default: 10)
		// Oldest tokens are removed when limit is exceeded
		REMEMBER_ME_MAX_TOKENS_PER_USER: z.coerce.number().int().min(1).default(10),
		TOOLS_PATH: z.string().default("../tools"),
		USE_DEVELOPER_TOOLS: BooleanSchema,
		USE_DEV_TOOLS_GITHUB_APP_CREATED: BooleanSchema.default("true"),
		USE_DEV_TOOLS_JOB_TESTER: BooleanSchema.default("true"),
		USE_DEV_TOOLS_DATA_CLEARER: BooleanSchema.default("true"),
		// Enable multi-tenant auth gateway mode
		// When true: OAuth flows go through auth.{BASE_DOMAIN} gateway, tenant-specific config is used
		// When false: Direct OAuth like current single-tenant mode, AUTH_EMAILS env var is used
		USE_MULTI_TENANT_AUTH: BooleanSchema,
		// Enable the tenant switcher component in the frontend header
		USE_TENANT_SWITCHER: BooleanSchema,
		VERCEL_TOKEN: z.string().optional(),
		// Vercel team ID for domain API calls (optional, for team accounts)
		VERCEL_TEAM_ID: z.string().optional(),
		// Maximum number of concurrent scheduler instances for worker
		WORKER_MAX_SCHEDULERS: z.coerce.number().default(100),
		// Polling interval for discovering new tenant/org pairs in milliseconds
		WORKER_POLL_INTERVAL_MS: z.coerce.number().default(30000),
		// Worker retry configuration for scheduler initialization
		// Maximum consecutive failures before giving up on a tenant-org for the polling cycle
		WORKER_RETRY_MAX_RETRIES: z.coerce.number().default(5),
		// Base delay in milliseconds for exponential backoff
		WORKER_RETRY_BASE_DELAY_MS: z.coerce.number().default(1000),
		// Maximum delay in milliseconds for backoff
		WORKER_RETRY_MAX_DELAY_MS: z.coerce.number().default(30000),
		// Time in milliseconds after which to reset the failure count
		WORKER_RETRY_RESET_AFTER_MS: z.coerce.number().default(60000),
		// Image upload configuration
		// Environment suffix for S3 bucket naming (e.g., "prod", "dev", "local")
		// Bucket name format: jolli-images-{IMAGE_S3_ENV}
		IMAGE_S3_ENV: z.string().default("local"),
		// Region for S3 image buckets (defaults to AWS_REGION if not set)
		IMAGE_S3_REGION: z.string().optional(),
		// Signed URL expiry time in seconds (default: 15 minutes)
		IMAGE_SIGNED_URL_EXPIRY_SECONDS: z.coerce.number().default(900),
		// Maximum image file size in bytes (default: 10MB)
		IMAGE_MAX_SIZE_BYTES: z.coerce.number().default(10485760),
		// jolli.site subdomain feature configuration
		// Base domain for jolli.site subdomains (e.g., jolli.site)
		JOLLI_SITE_DOMAIN: z.string().default("jolli.site"),
		// Whether jolli.site subdomain feature is enabled (defaults to false)
		JOLLI_SITE_ENABLED: BooleanSchema.default("false"),
		// Site deployment environment (local, dev, preview, prod)
		// Used to prefix Vercel project names and GitHub repo names for non-prod environments
		SITE_ENV: z.enum(["local", "dev", "preview", "prod"]).default("prod"),
		// GitHub organization for non-prod site deployments (local, dev, preview)
		// Prod uses GITHUB_ORG instead
		GITHUB_ORG_NONPROD: z.string().default("Jolli-Sample-Repos"),
		// Audit trail configuration
		// Whether audit event logging is enabled (defaults to true)
		AUDIT_ENABLED: BooleanSchema.default("true"),
		// Encryption key for PII fields in audit logs (32-byte key for AES-256-GCM, base64 encoded)
		AUDIT_PII_ENCRYPTION_KEY: z.string().optional(),
		// Number of days to retain audit logs (default: 365 days)
		AUDIT_RETENTION_DAYS: z.coerce.number().default(365),
		// Redis configuration (optional - falls back to in-memory storage if not set)
		REDIS_URL: z.string().url().optional(),
		// Login security configuration
		LOGIN_MAX_ATTEMPTS: z.coerce.number().default(5),
		LOGIN_LOCK_DURATION_MINUTES: z.coerce.number().default(15),
		LOGIN_RATE_LIMIT_PER_MINUTE: z.coerce.number().default(10),
		// Better-auth secret for signing session tokens
		// This should be a strong random secret (at least 32 characters)
		// If not set, falls back to TOKEN_SECRET for backwards compatibility
		BETTER_AUTH_SECRET: z.string().optional(),
		// Asset cleanup configuration
		// Days to wait before orphaning newly uploaded images (default: 7 days)
		ASSET_CLEANUP_RECENT_UPLOAD_BUFFER_DAYS: z.coerce.number().default(7),
		// Days to wait after marking orphaned before deleting (default: 30 days)
		ASSET_CLEANUP_GRACE_PERIOD_DAYS: z.coerce.number().default(30),
		// Health check configuration
		// Timeout in milliseconds for each individual health check (default: 2000ms)
		HEALTH_CHECK_TIMEOUT_MS: z.coerce.number().default(2000),
		// OAuth timeout configuration
		// Timeout for OAuth token exchange requests to provider APIs (Google, GitHub)
		// Passed to better-auth socialProviders.request.timeout
		OAUTH_TOKEN_TIMEOUT_MS: z.coerce.number().default(30000),
		// Better Stack heartbeat URL for health monitoring
		// When set, the /api/cron/heartbeat endpoint will ping this URL if healthy
		BETTER_STACK_HEARTBEAT_URL: z.string().url().optional(),
		// Secret for authenticating cron job requests
		CRON_SECRET: z.string().optional(),
		// Heartbeat interval in milliseconds for worker process (default: 5 minutes)
		// The worker sends heartbeats to Better Stack on this interval
		HEARTBEAT_INTERVAL_MS: z.coerce.number().default(5 * 60 * 1000),
		// Sync configuration
		// JRN prefix for sync-enabled documents (CLI bi-directional sync)
		// Documents with this prefix are tracked in sync_articles and can be pushed/pulled via CLI
		SYNC_JRN_PREFIX: z.string().default("jrn:/global:docs:article/sync-"),
	},
	/**
	 * What object holds the environment variables at runtime. This is usually
	 * `process.env` or `import.meta.env`.
	 */
	runtimeEnv: process.env,

	/**
	 * By default, this library will feed the environment variables directly to
	 * the Zod validator.
	 *
	 * This means that if you have an empty string for a value that is supposed
	 * to be a number (e.g. `PORT=` in a ".env" file), Zod will incorrectly flag
	 * it as a type mismatch violation. Additionally, if you have an empty string
	 * for a value that is supposed to be a string with a default value (e.g.
	 * `DOMAIN=` in an ".env" file), the default value will never be applied.
	 *
	 * In order to solve these issues, we recommend that all new projects
	 * explicitly specify this option as true.
	 */
	emptyStringAsUndefined: true,
};

/**
 * Creates a new configuration object from the current environment
 */
function createConfig() {
	return createEnv(configSchema);
}

/**
 * Current configuration object (internal mutable reference)
 */
let currentConfig: ReturnType<typeof createConfig> | undefined;

/**
 * Cache for tenant-specific config objects
 * Key: tenant ID, Value: { config, configsUpdatedAt }
 */
interface TenantConfigCacheEntry {
	config: ReturnType<typeof createConfig>;
	configsUpdatedAt: Date | null;
}
const tenantConfigCache = new Map<string, TenantConfigCacheEntry>();

/**
 * Gets the global configuration object, ignoring any active tenant context.
 * Use this when you need the base config regardless of tenant (e.g., signing
 * sandbox service tokens that will be verified outside tenant context).
 */
export function getGlobalConfig() {
	if (!currentConfig) {
		currentConfig = createConfig();
	}
	return currentConfig;
}

/**
 * Gets the current configuration object.
 * When called within a tenant context (via AsyncLocalStorage), returns tenant-specific
 * config with overrides applied. Otherwise returns the global config.
 */
export function getConfig() {
	// Check for tenant context
	const tenantContext = getTenantContext();

	if (!tenantContext) {
		// No tenant context - return global config
		if (!currentConfig) {
			currentConfig = createConfig();
		}
		return currentConfig;
	}

	const { tenant } = tenantContext;
	const tenantId = tenant.id;
	const cached = tenantConfigCache.get(tenantId);

	// Check if cache is valid:
	// - Cache exists AND
	// - configsUpdatedAt matches (both null, or same timestamp)
	const cacheValid =
		cached &&
		((cached.configsUpdatedAt === null && tenant.configsUpdatedAt === null) ||
			cached.configsUpdatedAt?.getTime() === tenant.configsUpdatedAt?.getTime());

	if (cacheValid) {
		return cached.config;
	}

	// Ensure global config is initialized first
	if (!currentConfig) {
		currentConfig = createConfig();
	}

	// Build tenant config by merging overrides onto process.env
	const overrides = computeTenantOverrides(tenant, currentConfig);

	// Temporarily apply overrides to process.env
	const originalEnv: Record<string, string | undefined> = {};
	for (const key of Object.keys(overrides)) {
		originalEnv[key] = process.env[key];
		process.env[key] = overrides[key];
	}

	try {
		const tenantConfig = createConfig();
		tenantConfigCache.set(tenantId, {
			config: tenantConfig,
			configsUpdatedAt: tenant.configsUpdatedAt,
		});
		return tenantConfig;
	} finally {
		// Restore original process.env
		for (const key of Object.keys(overrides)) {
			/* v8 ignore next 2 -- defensive cleanup for tenant overrides that weren't in original env */
			if (originalEnv[key] === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = originalEnv[key];
			}
		}
	}
}

/**
 * Compute tenant-specific config overrides.
 */
function computeTenantOverrides(tenant: Tenant, globalConfig: ReturnType<typeof createConfig>): Record<string, string> {
	const result: Record<string, string> = {};

	// Use HTTPS when gateway is enabled OR in production
	const useHttps = globalConfig.USE_GATEWAY || globalConfig.NODE_ENV === "production";
	// Extract port from global origin (empty string if no port)
	const originPort = new URL(globalConfig.ORIGIN).port;

	// ORIGIN: Use centralized domain utility for consistent URL construction
	result.ORIGIN = getTenantOrigin({
		primaryDomain: tenant.primaryDomain,
		tenantSlug: tenant.slug,
		baseDomain: globalConfig.BASE_DOMAIN,
		useHttps,
		port: originPort || undefined,
		fallbackOrigin: globalConfig.ORIGIN,
	});

	// TOKEN_SECRET: HMAC of master secret + tenant ID
	if (globalConfig.TENANT_TOKEN_MASTER_SECRET) {
		const hmac = createHash("sha256");
		hmac.update(globalConfig.TENANT_TOKEN_MASTER_SECRET);
		hmac.update(tenant.id);
		result.TOKEN_SECRET = hmac.digest("hex");
	}

	// Allowed overrides from tenant.configs
	const configs = tenant.configs as Record<string, unknown> | undefined;
	if (configs) {
		for (const key of ALLOWED_TENANT_CONFIG_KEYS) {
			const value = configs[key];
			if (value !== undefined && value !== null) {
				result[key] = String(value);
			}
		}
	}

	return result;
}

/**
 * Clear tenant config cache (for testing or manual invalidation)
 */
export function clearTenantConfigCache(tenantId?: string) {
	if (tenantId) {
		tenantConfigCache.delete(tenantId);
	} else {
		tenantConfigCache.clear();
	}
}

/**
 * Global parameter store loader instance (lazily initialized)
 * @deprecated Use the provider chain instead. This is always null now.
 */
const parameterStoreLoader: ParameterStoreLoader | null = null;

/**
 * Global config provider chain instance
 */
let configProviderChain: ConfigProviderChain | null = null;

/**
 * Creates the default config provider chain with all available providers.
 * Provider priority (lower = higher priority):
 * 1. AWS Parameter Store (PSTORE_ENV set)
 * 2. Local .env files (always available)
 *
 * In production with PSTORE_ENV set, the AWS Parameter Store provider is marked
 * as critical — if it's available but fails to load, the chain throws instead
 * of silently continuing with incomplete configuration.
 */
function createDefaultProviderChain(): ConfigProviderChain {
	const isProduction = process.env.NODE_ENV === "production";
	const hasPstoreEnv = Boolean(process.env.PSTORE_ENV);
	const providers = [new AWSParameterStoreProvider(), new LocalEnvProvider()];

	if (isProduction && hasPstoreEnv) {
		return new ConfigProviderChain(providers, {
			criticalProviders: ["aws-parameter-store"],
		});
	}

	return new ConfigProviderChain(providers);
}

/**
 * Initializes the configuration system using the provider chain.
 *
 * The provider chain loads configuration in priority order:
 * 1. AWS Parameter Store (if PSTORE_ENV is set) - highest priority
 * 2. Local .env files (always available) - lowest priority
 *
 * Higher priority providers override values from lower priority ones.
 *
 * Example:
 * ```typescript
 * await initializeConfig();
 * console.log(Configs.GITHUB_APPS_INFO); // Now includes values from provider chain
 * ```
 *
 * @returns The initialized configuration object
 */
export async function initializeConfig() {
	// Load .env files first so they're available to the provider chain
	reloadEnvFiles();

	try {
		// Create and use the provider chain
		configProviderChain = createDefaultProviderChain();
		log.info("Initializing configuration using provider chain");

		const result = await configProviderChain.load();

		// Log which providers contributed
		for (const providerResult of result.providerResults) {
			log.info(
				{ provider: providerResult.providerName, varCount: providerResult.count },
				"Loaded %d variables from %s",
				providerResult.count,
				providerResult.providerName,
			);
		}

		log.info({ totalVars: Object.keys(result.config).length }, "Configuration loaded from provider chain");
	} catch (error) {
		log.error(error, "Failed to load configuration from provider chain. Using process.env only.");
	}

	// Create config from process.env (which now includes provider chain values)
	currentConfig = createConfig();

	// Log which GitHub App info source is being used
	if (currentConfig.GITHUB_APPS_INFO) {
		log.info({ appId: currentConfig.GITHUB_APPS_INFO.app_id }, "GitHub App configuration loaded");
	} else {
		log.warn("GITHUB_APPS_INFO is not configured - GitHub App features will not work");
	}

	return currentConfig;
}

/**
 * Re-parses .env and .env.local files, updating process.env with new values.
 * This function can be called independently to refresh env file values without
 * reloading from other providers (AWS Parameter Store, etc.).
 *
 * Note: This uses dotenv's `override: true` option to force re-reading values,
 * overwriting any existing process.env values.
 */
export function reloadEnvFiles(): void {
	// Load .env first (defaults), then .env.local (local overrides take precedence)
	dotenvConfig({ path: ".env", override: true, quiet: true });
	dotenvConfig({ path: ".env.local", override: true, quiet: true });
	log.info("Reloaded .env and .env.local files");
}

/**
 * Reloads the entire configuration system by:
 * 1. Re-parsing .env and .env.local files
 * 2. Reloading all providers in the chain
 * 3. Recreating the Configs object with the new values
 *
 * This allows runtime configuration updates without restarting the application.
 *
 * Example:
 * ```typescript
 * await reloadConfig();
 * console.log(Configs.GITHUB_APPS_INFO); // Now has updated values from providers
 * ```
 *
 * @returns The reloaded configuration object
 */
export async function reloadConfig() {
	try {
		// Re-parse .env and .env.local files first
		reloadEnvFiles();

		// Re-create and load from provider chain
		if (configProviderChain) {
			await configProviderChain.load();
		} else {
			// If chain wasn't initialized yet, create it
			configProviderChain = createDefaultProviderChain();
			await configProviderChain.load();
		}
		// Reset config so it gets recreated on next getConfig() call
		currentConfig = undefined;
	} catch (error) {
		log.error(error, "Failed to reload configuration from provider chain. Keeping values as they were.");
	}

	return getConfig();
}

/**
 * Resets the configuration cache, forcing it to be recreated on the next call to getConfig().
 * This is primarily useful for testing when environment variables change between tests.
 */
export function resetConfig() {
	currentConfig = undefined;
	tenantConfigCache.clear();
}

/**
 * Gets the current parameter store loader instance (for testing/debugging).
 * Returns the loader from the AWSParameterStoreProvider in the provider chain.
 * @internal
 */
export function getParameterStoreLoaderInstance(): ParameterStoreLoader | null {
	// If provider chain hasn't been initialized yet, return legacy loader (null if not set)
	if (!configProviderChain) {
		return parameterStoreLoader;
	}

	/* c8 ignore start - unreachable: default chain always includes AWSParameterStoreProvider */
	// Find the AWSParameterStoreProvider in the chain and get its loader
	for (const provider of configProviderChain.getProviders()) {
		if (provider instanceof AWSParameterStoreProvider) {
			/* c8 ignore stop */
			return provider.getLoader();
			/* c8 ignore start */
		}
	}
	return parameterStoreLoader;
}
/* c8 ignore stop */

/**
 * Resolve the origin URL that E2B sandboxes should use to reach the backend.
 *
 * Priority:
 * 1. JOLLI_PUBLIC_URL (explicit override, e.g. for local dev with ngrok)
 * 2. Tenant-specific subdomain derived from the current tenant context
 * 3. ORIGIN (fallback, e.g. http://localhost:8034)
 */
function resolveSyncServerOrigin(config: ReturnType<typeof getConfig>): string {
	if (config.JOLLI_PUBLIC_URL) {
		return config.JOLLI_PUBLIC_URL;
	}

	const tenantContext = getTenantContext();
	if (tenantContext?.tenant) {
		const useHttps = config.USE_GATEWAY || config.NODE_ENV === "production";
		const originPort = new URL(config.ORIGIN).port;
		const tenantOrigin = getTenantOrigin({
			primaryDomain: tenantContext.tenant.primaryDomain,
			tenantSlug: tenantContext.tenant.slug,
			baseDomain: config.BASE_DOMAIN,
			useHttps,
			port: originPort || undefined,
			fallbackOrigin: config.ORIGIN,
		});
		return tenantOrigin;
	}

	return config.ORIGIN;
}

/**
 * Gets a workflow config, needed to run workflows in an E2B sandbox.
 * @param accessToken github access token,
 * to be provided if the workflow(s) need github access that requies an access token.
 */
export function getWorkflowConfig(accessToken?: string): WorkflowConfig {
	const config = getConfig();
	if (!config.E2B_API_KEY) {
		throw new Error("E2B_API_KEY environment variable is not set");
	}
	if (!config.E2B_TEMPLATE_ID) {
		throw new Error("E2B_TEMPLATE_ID environment variable is not set");
	}
	if (!config.ANTHROPIC_API_KEY) {
		throw new Error("ANTHROPIC_API_KEY environment variable is not set");
	}
	const e2bApiKey = config.E2B_API_KEY;
	const e2bTemplateId = config.E2B_TEMPLATE_ID;
	const cfg: WorkflowConfig = {
		e2bApiKey,
		e2bTemplateId,
		e2bEnabled: Boolean(e2bApiKey && e2bTemplateId),
		anthropicApiKey: config.ANTHROPIC_API_KEY,
		syncServerUrl: `${resolveSyncServerOrigin(config)}/api`,
		debug: true,
	};
	if (accessToken) {
		cfg.githubToken = accessToken;
		// Debug logging for GitHub token in workflow config
		const tokenPreview = `${accessToken.substring(0, 8)}...${accessToken.substring(accessToken.length - 4)}`;
		log.debug(`getWorkflowConfig: Setting githubToken in config: ${tokenPreview} (length: ${accessToken.length})`);
	} else {
		log.debug("getWorkflowConfig: No access token provided, githubToken will be undefined");
	}
	if (config.VERCEL_TOKEN) {
		cfg.vercelToken = config.VERCEL_TOKEN;
	}
	if (config.TAVILY_API_KEY) {
		cfg.tavilyApiKey = config.TAVILY_API_KEY;
	}
	return cfg;
}

/**
 * Parse a comma-separated list of regex patterns.
 * Each pattern is trimmed and compiled into a RegExp.
 * @param value - Comma-separated regex patterns (e.g., "@company\\.com$,admin@.*")
 * @returns Array of compiled RegExp objects
 */
export function parseRegexList(value: string): Array<RegExp> {
	return value.split(",").map(pattern => new RegExp(pattern.trim()));
}
