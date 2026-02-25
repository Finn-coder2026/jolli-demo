import { env } from "../../../../../../../lib/Config";
import { getDatabase } from "../../../../../../../lib/db/getDatabase";
import { getLog } from "../../../../../../../lib/util/Logger";
import { sendOwnerInvitationEmail } from "../../../../../../../lib/util/OwnerInvitationEmailUtil";
import { type NextRequest, NextResponse } from "next/server";
import { forbiddenResponse, getUserFromRequest, isSuperAdmin, unauthorizedResponse } from "@/lib/auth";

const log = getLog(import.meta.url);

interface RouteParams {
	params: Promise<{ tenantId: string; orgId: string }>;
}

/**
 * POST /api/tenants/[tenantId]/orgs/[orgId]/owner - Invite owner for an org
 * Sends an owner invitation email. The backend handles creating the verification record.
 * The actual owner is created only when the invitation is accepted.
 * Requires: SuperAdmin
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
	const user = getUserFromRequest(request);
	if (!user) {
		return unauthorizedResponse();
	}
	if (!isSuperAdmin(user.role)) {
		return forbiddenResponse("SuperAdmin access required");
	}

	try {
		const { tenantId, orgId } = await params;
		const body = (await request.json()) as { email: string; name?: string };

		// Validate email
		if (!body.email || typeof body.email !== "string") {
			return NextResponse.json({ error: "Email is required" }, { status: 400 });
		}
		const email = body.email.trim().toLowerCase();
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
		}
		const name = body.name?.trim() || null;

		const db = await getDatabase();

		// Check if tenant exists
		const tenant = await db.tenantDao.getTenant(tenantId);
		if (!tenant) {
			return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
		}

		// Check if org exists and belongs to tenant
		const org = await db.orgDao.getOrg(orgId);
		if (!org || org.tenantId !== tenantId) {
			return NextResponse.json({ error: "Org not found" }, { status: 404 });
		}

		// Check if org already has an owner
		const existingOwner = await db.userOrgDao.findOwnerByOrg(tenantId, orgId);
		if (existingOwner) {
			return NextResponse.json({ error: "Org already has an owner. Use PUT to change owner." }, { status: 409 });
		}

		// Check if there's already a pending invitation for this org
		const pendingInvitation = await db.ownerInvitationDao.findPendingByOrg(tenantId, orgId);
		if (pendingInvitation) {
			return NextResponse.json(
				{
					error: "A pending owner invitation already exists for this org",
					pendingEmail: pendingInvitation.email,
				},
				{ status: 409 },
			);
		}

		// Check if user already exists in the system
		const existingUser = await db.globalUserDao.findByEmail(email);
		const userExists = !!existingUser;

		// Send email via backend - backend creates verification record and sends email
		await sendOwnerInvitationEmail({
			tenantId,
			orgId,
			email,
			name,
			invitedBy: user.userId,
			previousOwnerId: null,
		});

		log.info({ tenantId, orgId, email, userExists }, "Owner invitation email sent");

		return NextResponse.json({
			success: true,
			email,
			userExists,
			message: `Owner invitation sent to ${email}`,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		log.error({ err: error }, "Error sending owner invitation");
		return NextResponse.json({ error: message }, { status: 500 });
	}
}

/**
 * PUT /api/tenants/[tenantId]/orgs/[orgId]/owner - Change owner for an org
 * Sends an owner change invitation email. Backend cancels existing invitations and creates new one.
 * The actual ownership transfer happens when the invitation is accepted.
 * Requires: SuperAdmin
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
	const user = getUserFromRequest(request);
	if (!user) {
		return unauthorizedResponse();
	}
	if (!isSuperAdmin(user.role)) {
		return forbiddenResponse("SuperAdmin access required");
	}

	try {
		const { tenantId, orgId } = await params;
		const body = (await request.json()) as { email: string; name?: string };

		// Validate email
		if (!body.email || typeof body.email !== "string") {
			return NextResponse.json({ error: "Email is required" }, { status: 400 });
		}
		const email = body.email.trim().toLowerCase();
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
		}
		const name = body.name?.trim() || null;

		const db = await getDatabase();

		// Check if tenant exists
		const tenant = await db.tenantDao.getTenant(tenantId);
		if (!tenant) {
			return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
		}

		// Check if org exists and belongs to tenant
		const org = await db.orgDao.getOrg(orgId);
		if (!org || org.tenantId !== tenantId) {
			return NextResponse.json({ error: "Org not found" }, { status: 404 });
		}

		// Get existing owner (if any) for tracking
		const existingOwner = await db.userOrgDao.findOwnerByOrg(tenantId, orgId);
		const previousOwnerId = existingOwner?.userId ?? null;

		// Check if user already exists in the system
		const existingUser = await db.globalUserDao.findByEmail(email);
		const userExists = !!existingUser;

		// Don't allow assigning to current owner
		if (existingOwner && existingUser && existingOwner.userId === existingUser.id) {
			return NextResponse.json({ error: "User is already the owner of this org" }, { status: 400 });
		}

		// When auto-accepting, demote the previous owner to "member" first
		if (env.AUTO_ACCEPT_OWNER_INVITATIONS && previousOwnerId) {
			await db.userOrgDao.updateRole(previousOwnerId, tenantId, orgId, "member");
			log.info({ tenantId, orgId, previousOwnerId }, "Previous owner demoted to member (auto-accept)");
		}

		// Send email via backend - backend cancels existing invitations, creates verification, and sends email
		// When AUTO_ACCEPT_OWNER_INVITATIONS is true, this directly creates the records instead
		await sendOwnerInvitationEmail({
			tenantId,
			orgId,
			email,
			name,
			invitedBy: user.userId,
			previousOwnerId,
		});

		log.info({ tenantId, orgId, email, previousOwnerId, userExists }, "Owner change invitation email sent");

		return NextResponse.json({
			success: true,
			email,
			userExists,
			previousOwnerId,
			message: `Owner change invitation sent to ${email}`,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		log.error({ err: error }, "Error sending owner change invitation");
		return NextResponse.json({ error: message }, { status: 500 });
	}
}

/**
 * GET /api/tenants/[tenantId]/orgs/[orgId]/owner - Get owner status
 * Returns current owner info and any pending invitations.
 * Requires: SuperAdmin
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
	const user = getUserFromRequest(request);
	if (!user) {
		return unauthorizedResponse();
	}
	if (!isSuperAdmin(user.role)) {
		return forbiddenResponse("SuperAdmin access required");
	}

	try {
		const { tenantId, orgId } = await params;
		const db = await getDatabase();

		// Check if tenant exists
		const tenant = await db.tenantDao.getTenant(tenantId);
		if (!tenant) {
			return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
		}

		// Check if org exists and belongs to tenant
		const org = await db.orgDao.getOrg(orgId);
		if (!org || org.tenantId !== tenantId) {
			return NextResponse.json({ error: "Org not found" }, { status: 404 });
		}

		// Get current owner
		const existingOwner = await db.userOrgDao.findOwnerByOrg(tenantId, orgId);
		let ownerInfo = null;
		if (existingOwner) {
			const ownerUser = await db.globalUserDao.findById(existingOwner.userId);
			if (ownerUser) {
				ownerInfo = {
					userId: ownerUser.id,
					email: ownerUser.email,
					name: ownerUser.name,
				};
			}
		}

		// Get pending invitation from owner_invitations table
		const pendingInvitation = await db.ownerInvitationDao.findPendingByOrg(tenantId, orgId);
		let pendingInvitationInfo = null;
		if (pendingInvitation?.verificationId) {
			// Look up verification record to get expiration date
			const verification = await db.verificationDao.findById(pendingInvitation.verificationId);
			if (verification && verification.expiresAt > new Date()) {
				pendingInvitationInfo = {
					id: pendingInvitation.id,
					email: pendingInvitation.email,
					name: pendingInvitation.name,
					expiresAt: verification.expiresAt.toISOString(),
					createdAt: pendingInvitation.createdAt.toISOString(),
				};
			}
		}

		return NextResponse.json({
			owner: ownerInfo,
			pendingInvitation: pendingInvitationInfo,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		log.error({ err: error }, "Error getting owner status");
		return NextResponse.json({ error: message }, { status: 500 });
	}
}

/**
 * DELETE /api/tenants/[tenantId]/orgs/[orgId]/owner - Cancel pending invitation
 * Cancels any pending owner invitations for the org.
 * Requires: SuperAdmin
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
	const user = getUserFromRequest(request);
	if (!user) {
		return unauthorizedResponse();
	}
	if (!isSuperAdmin(user.role)) {
		return forbiddenResponse("SuperAdmin access required");
	}

	try {
		const { tenantId, orgId } = await params;
		const db = await getDatabase();

		// Check if tenant exists
		const tenant = await db.tenantDao.getTenant(tenantId);
		if (!tenant) {
			return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
		}

		// Check if org exists and belongs to tenant
		const org = await db.orgDao.getOrg(orgId);
		if (!org || org.tenantId !== tenantId) {
			return NextResponse.json({ error: "Org not found" }, { status: 404 });
		}

		// Find pending invitation first to get verificationId for cleanup
		const pendingInvitation = await db.ownerInvitationDao.findPendingByOrg(tenantId, orgId);

		// Cancel pending invitations - delete owner_invitation records
		const cancelledCount = await db.ownerInvitationDao.cancelByOrg(tenantId, orgId);

		// Also delete the associated verification record if it exists
		if (pendingInvitation?.verificationId) {
			await db.verificationDao.delete(pendingInvitation.verificationId);
		}

		log.info({ tenantId, orgId, cancelledCount }, "Cancelled pending owner invitations");

		return NextResponse.json({
			success: true,
			cancelledCount,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		log.error({ err: error }, "Error cancelling owner invitation");
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
