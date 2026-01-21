import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

const BooleanSchema = z
	.string()
	// only allow "true" or "false"
	.refine(s => s === "true" || s === "false")
	// transform to boolean
	.transform(s => s === "true")
	.default("false");

export const env = createEnv({
	server: {
		ADMIN_DOMAIN: z.string().optional(),
		ALLOW_HARD_DELETE: BooleanSchema,
		// Domain used for tenant subdomains (e.g., "jolli.app" or "dougschroeder.dev")
		GATEWAY_DOMAIN: z.string().default("jolli.app"),
		// When true, no default provider is created - you must explicitly create providers
		DISABLE_DEFAULT_PROVIDER: BooleanSchema,
		REGISTRY_DATABASE_URL: z.string().url(),
		ADMIN_POSTGRES_URL: z.string().url(),
		ADMIN_EMAIL_PATTERN: z.string().default("^.*@jolli\\.ai$"),
		ENCRYPTION_KEY: z.string().optional(),
		NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
		// Backend internal URL for calling bootstrap endpoint during org provisioning
		BACKEND_INTERNAL_URL: z.string().url().optional(),
		// Shared secret for authenticating with backend bootstrap endpoint
		BOOTSTRAP_SECRET: z.string().optional(),
		// Vercel protection bypass secret for programmatic API access
		VERCEL_BYPASS_SECRET: z.string().optional(),
		// Allowed Neon Organization IDs for environment isolation (comma-separated)
		// Empty means no restrictions (for development). In production, restrict to specific org IDs.
		ALLOWED_NEON_ORG_IDS: z
			.string()
			.optional()
			.transform(val =>
				val
					? val
							.split(",")
							.map(s => s.trim())
							.filter(Boolean)
					: [],
			),
		// Allowed PostgreSQL hosts for connection_string providers (comma-separated)
		// Empty means no restrictions (for development). In production, restrict to specific hosts.
		ALLOWED_POSTGRES_HOSTS: z
			.string()
			.optional()
			.transform(val =>
				val
					? val
							.split(",")
							.map(s => s.trim())
							.filter(Boolean)
					: [],
			),
	},
	runtimeEnv: {
		ADMIN_DOMAIN: process.env.ADMIN_DOMAIN,
		ALLOW_HARD_DELETE: process.env.ALLOW_HARD_DELETE,
		GATEWAY_DOMAIN: process.env.GATEWAY_DOMAIN,
		DISABLE_DEFAULT_PROVIDER: process.env.DISABLE_DEFAULT_PROVIDER,
		REGISTRY_DATABASE_URL: process.env.REGISTRY_DATABASE_URL,
		ADMIN_POSTGRES_URL: process.env.ADMIN_POSTGRES_URL,
		ADMIN_EMAIL_PATTERN: process.env.ADMIN_EMAIL_PATTERN,
		ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
		NODE_ENV: process.env.NODE_ENV,
		BACKEND_INTERNAL_URL: process.env.BACKEND_INTERNAL_URL,
		BOOTSTRAP_SECRET: process.env.BOOTSTRAP_SECRET,
		VERCEL_BYPASS_SECRET: process.env.VERCEL_BYPASS_SECRET,
		ALLOWED_NEON_ORG_IDS: process.env.ALLOWED_NEON_ORG_IDS,
		ALLOWED_POSTGRES_HOSTS: process.env.ALLOWED_POSTGRES_HOSTS,
	},
	// Skip validation during CI builds (GitHub Actions sets CI=true)
	// or when explicitly requested via SKIP_ENV_VALIDATION
	skipValidation: !!process.env.SKIP_ENV_VALIDATION || !!process.env.CI,
});

export type Config = typeof env;
