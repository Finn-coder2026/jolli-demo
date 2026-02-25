import { isReservedSubdomain } from "../../../lib/constants/ReservedSubdomains";
import { getDatabase } from "../../../lib/db/getDatabase";
import type { NewTenant } from "../../../lib/types";
import { getLog } from "../../../lib/util/Logger";
import { sendOwnerInvitationEmail } from "../../../lib/util/OwnerInvitationEmailUtil";
import { type NextRequest, NextResponse } from "next/server";
import { forbiddenResponse, getUserFromRequest, isSuperAdmin, unauthorizedResponse } from "@/lib/auth";

const log = getLog(import.meta.url);

/**
 * GET /api/tenants - List or search tenants
 * Query params:
 *   - slug: Search by tenant slug (partial match)
 *   - ownerEmail: Search by default org owner email (partial match)
 * Requires: Authenticated (SuperAdmin or User with read-only access)
 */
export async function GET(request: NextRequest) {
	const user = getUserFromRequest(request);
	if (!user) {
		return unauthorizedResponse();
	}

	try {
		const { searchParams } = new URL(request.url);
		const slug = searchParams.get("slug") || undefined;
		const ownerEmail = searchParams.get("ownerEmail") || undefined;

		const db = await getDatabase();

		// If search params provided, use search; otherwise list all
		const tenants =
			slug || ownerEmail
				? await db.tenantDao.searchTenants({
						...(slug && { slug }),
						...(ownerEmail && { ownerEmail }),
					})
				: await db.tenantDao.listTenants();

		return NextResponse.json({ tenants });
	} catch (error) {
		log.error({ err: error }, "Failed to list tenants");
		const message = error instanceof Error ? error.message : "Unknown error";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}

/**
 * POST /api/tenants - Create a new tenant
 * Requires: SuperAdmin
 */
export async function POST(request: NextRequest) {
	const user = getUserFromRequest(request);
	if (!user) {
		return unauthorizedResponse();
	}
	if (!isSuperAdmin(user.role)) {
		return forbiddenResponse("SuperAdmin access required");
	}
	try {
		const body = (await request.json()) as NewTenant;

		// Validate required fields
		if (!body.slug || !body.displayName) {
			return NextResponse.json({ error: "slug and displayName are required" }, { status: 400 });
		}

		// Validate ownerEmail if provided
		if (body.ownerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.ownerEmail)) {
			return NextResponse.json({ error: "Invalid owner email format" }, { status: 400 });
		}

		// Validate slug format
		if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(body.slug)) {
			return NextResponse.json(
				{ error: "slug must be lowercase alphanumeric with optional hyphens, cannot start or end with hyphen" },
				{ status: 400 },
			);
		}

		// Check for reserved subdomains
		if (isReservedSubdomain(body.slug)) {
			return NextResponse.json(
				{ error: `"${body.slug}" is a reserved subdomain and cannot be used as a tenant slug` },
				{ status: 400 },
			);
		}

		const db = await getDatabase();

		// Check if slug is already taken
		const existing = await db.tenantDao.getTenantBySlug(body.slug);
		if (existing) {
			return NextResponse.json({ error: "Tenant with this slug already exists" }, { status: 409 });
		}

		// Get default provider or specified provider
		let providerId = body.databaseProviderId;
		if (!providerId) {
			const defaultProvider = await db.providerDao.getDefaultProvider();
			if (!defaultProvider) {
				return NextResponse.json({ error: "No default database provider configured" }, { status: 400 });
			}
			providerId = defaultProvider.id;
		}

		// Note: We don't check for existing databases here anymore.
		// If a database exists from a soft-deleted tenant, it will be detected during provisioning
		// and the user will be prompted to either reuse it or drop and recreate.

		// Create the tenant (initially in "provisioning" status)
		const tenant = await db.tenantDao.createTenant(body, providerId);

		// Create the default org for this tenant (schema name will be org_{tenantSlug})
		const defaultOrg = await db.orgDao.createOrg(tenant.id, tenant.slug, {
			slug: "default",
			displayName: "Default",
			isDefault: true,
		});

		// If ownerEmail is provided, send an owner invitation email
		// DO NOT create global_user or user_orgs here - that happens when the invitation is accepted
		if (body.ownerEmail) {
			try {
				await sendOwnerInvitationEmail({
					tenantId: tenant.id,
					orgId: defaultOrg.id,
					email: body.ownerEmail,
					name: null,
					invitedBy: user.userId,
					previousOwnerId: null,
				});
				log.info("Sent owner invitation email for tenant %s to %s", tenant.slug, body.ownerEmail);
			} catch (emailError) {
				// Log the error but don't fail tenant creation - admin can resend invitation later
				log.error({ err: emailError }, "Failed to send owner invitation email for tenant %s", tenant.slug);
			}
		}

		return NextResponse.json({ tenant }, { status: 201 });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
