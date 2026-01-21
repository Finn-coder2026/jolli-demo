/** SSL certificate status for a custom domain */
export type SslStatus = "pending" | "active" | "failed";

/** Custom domain configuration for a tenant */
export interface TenantDomain {
	id: string;
	tenantId: string;
	domain: string;
	isPrimary: boolean;
	sslStatus: SslStatus;
	verificationToken: string | null;
	verifiedAt: Date | null;
	createdAt: Date;
}

/** Data required to add a new domain */
export interface NewTenantDomain {
	tenantId: string;
	domain: string;
	isPrimary?: boolean;
}
