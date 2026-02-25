import type { NewUserOrg, UserOrg, UserOrgRow } from "../models";
import { defineUserOrgs, toUserOrg } from "../models";
import { QueryTypes, type Sequelize } from "sequelize";

/** Tenant user search result with joined tenant/org info */
export interface TenantUserSearchResult {
	userId: number;
	userName: string | null;
	userEmail: string;
	userIsActive: boolean;
	tenantId: string;
	tenantName: string;
	orgId: string;
	orgName: string;
	role: string;
	createdAt: Date;
}

export interface UserOrgDao {
	findByUserAndOrg(userId: number, tenantId: string, orgId: string): Promise<UserOrg | undefined>;
	findOwnerByOrg(tenantId: string, orgId: string): Promise<UserOrg | undefined>;
	findOwnerByTenant(tenantId: string): Promise<UserOrg | undefined>;
	create(userOrg: NewUserOrg): Promise<UserOrg>;
	findOrCreate(userOrg: NewUserOrg): Promise<UserOrg>;
	updateRole(userId: number, tenantId: string, orgId: string, role: string): Promise<boolean>;
	searchTenantUsersByEmail(email: string): Promise<Array<TenantUserSearchResult>>;
}

export function createUserOrgDao(sequelize: Sequelize): UserOrgDao {
	const UserOrgs = defineUserOrgs(sequelize);

	async function findByUserAndOrg(userId: number, tenantId: string, orgId: string): Promise<UserOrg | undefined> {
		const row = await UserOrgs.findOne({
			where: { userId, tenantId, orgId },
		});
		if (!row) {
			return;
		}
		return toUserOrg(row.dataValues);
	}

	async function findOwnerByOrg(tenantId: string, orgId: string): Promise<UserOrg | undefined> {
		const row = await UserOrgs.findOne({
			where: { tenantId, orgId, role: "owner" },
		});
		if (!row) {
			return;
		}
		return toUserOrg(row.dataValues);
	}

	async function findOwnerByTenant(tenantId: string): Promise<UserOrg | undefined> {
		const row = await UserOrgs.findOne({
			where: { tenantId, role: "owner" },
		});
		if (!row) {
			return;
		}
		return toUserOrg(row.dataValues);
	}

	async function create(userOrg: NewUserOrg): Promise<UserOrg> {
		const row = await UserOrgs.create({
			userId: userOrg.userId,
			tenantId: userOrg.tenantId,
			orgId: userOrg.orgId,
			role: userOrg.role ?? "member",
			isDefault: userOrg.isDefault ?? false,
		} as unknown as UserOrgRow);
		return toUserOrg(row.dataValues);
	}

	/**
	 * Find an existing user-org relationship, or create a new one if not found.
	 * If the relationship exists, the existing record is returned (role is NOT updated).
	 */
	async function findOrCreate(userOrg: NewUserOrg): Promise<UserOrg> {
		const existing = await findByUserAndOrg(userOrg.userId, userOrg.tenantId, userOrg.orgId);
		if (existing) {
			return existing;
		}
		return create(userOrg);
	}

	/**
	 * Update the role of a user-org relationship.
	 * Returns true if a record was updated, false if no matching record was found.
	 */
	async function updateRole(userId: number, tenantId: string, orgId: string, role: string): Promise<boolean> {
		const [affectedCount] = await UserOrgs.update({ role } as unknown as UserOrgRow, {
			where: { userId, tenantId, orgId },
		});
		return affectedCount > 0;
	}

	/**
	 * Search for tenant users by email address.
	 * Returns all tenant/org associations for the user with joined tenant and org names.
	 */
	async function searchTenantUsersByEmail(email: string): Promise<Array<TenantUserSearchResult>> {
		// Normalize email to lowercase for case-insensitive lookup
		const normalizedEmail = email.toLowerCase();
		const query = `
			SELECT
				gu.id as "userId",
				gu.name as "userName",
				gu.email as "userEmail",
				gu.is_active as "userIsActive",
				uo.tenant_id as "tenantId",
				t.display_name as "tenantName",
				uo.org_id as "orgId",
				o.display_name as "orgName",
				uo.role,
				uo.created_at as "createdAt"
			FROM global_users gu
			INNER JOIN user_orgs uo ON gu.id = uo.user_id
			INNER JOIN tenants t ON uo.tenant_id = t.id
			INNER JOIN orgs o ON uo.org_id = o.id AND uo.tenant_id = o.tenant_id
			WHERE gu.email = :email
			ORDER BY t.display_name, o.display_name
			LIMIT 100
		`;

		const results = await sequelize.query<TenantUserSearchResult>(query, {
			replacements: { email: normalizedEmail },
			type: QueryTypes.SELECT,
		});

		return results;
	}

	return {
		findByUserAndOrg,
		findOwnerByOrg,
		findOwnerByTenant,
		create,
		findOrCreate,
		updateRole,
		searchTenantUsersByEmail,
	};
}
