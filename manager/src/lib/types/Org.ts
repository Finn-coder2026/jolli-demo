/** Status of an org in the provisioning lifecycle */
export type OrgStatus = "provisioning" | "active" | "suspended" | "archived";

/** Organization information stored in the registry */
export interface Org {
	id: string;
	tenantId: string;
	slug: string;
	displayName: string;
	schemaName: string;
	status: OrgStatus;
	/**
	 * Indicates if this is the default org for the tenant.
	 * Only one default org per tenant (always slug="default").
	 * Cannot be changed after creation.
	 * Default org lifecycle is tied to tenant lifecycle:
	 * - Can only be archived when tenant is archived
	 * - Can only be activated when tenant is activated
	 * - Can only be deleted when tenant is deleted
	 */
	isDefault: boolean;
	schemaRetained: boolean;
	createdAt: Date;
	updatedAt: Date;
}

/** Data required to create a new org */
export interface NewOrg {
	slug: string;
	displayName: string;
	isDefault?: boolean;
}

/** Summary of an org for list views */
export interface OrgSummary {
	id: string;
	tenantId: string;
	slug: string;
	displayName: string;
	schemaName: string;
	status: OrgStatus;
	isDefault: boolean;
	createdAt: Date;
}
