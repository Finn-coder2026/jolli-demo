/**
 * Reserved subdomains that cannot be used as tenant slugs.
 * These are system-level subdomains used for infrastructure.
 */
export const RESERVED_SUBDOMAINS = [
	"auth", // OAuth gateway
	"api", // API (if used separately)
	"www", // Main website
	"manager", // Tenant management
	"admin", // Administration
	"app", // Application
	"static", // Static assets
	"cdn", // Content delivery
	"mail", // Email
	"smtp", // SMTP
	"ftp", // FTP (legacy)
	"ns1", // Name server
	"ns2", // Name server
	"mx", // Mail exchange
	"staging", // Staging environment
	"dev", // Development
	"test", // Testing
	"demo", // Demo environment
	"status", // Status page
	"help", // Help/support
	"support", // Support
	"docs", // Documentation
	"blog", // Blog
	"shop", // E-commerce
	"store", // E-commerce
	"billing", // Billing
	"dashboard", // Dashboard
	"portal", // Portal
	"login", // Login page
	"signup", // Signup page
	"register", // Registration
	"account", // Account management
	"accounts", // Account management
	"user", // User management
	"users", // User management
	"assets", // Assets
	"media", // Media files
	"images", // Image files
	"img", // Image files
	"files", // File storage
	"download", // Downloads
	"downloads", // Downloads
	"upload", // Uploads
	"uploads", // Uploads
] as const;

export type ReservedSubdomain = (typeof RESERVED_SUBDOMAINS)[number];

/**
 * Check if a subdomain/slug is reserved.
 * @param slug - The slug to check
 * @returns true if the slug is reserved
 */
export function isReservedSubdomain(slug: string): boolean {
	return RESERVED_SUBDOMAINS.includes(slug.toLowerCase() as ReservedSubdomain);
}
