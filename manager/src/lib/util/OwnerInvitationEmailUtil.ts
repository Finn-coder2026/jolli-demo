import { env } from "../Config";
import { getDatabase } from "../db/getDatabase";
import { getLog } from "./Logger";
import { createBootstrapAuthHeaders } from "jolli-common/server";

const log = getLog(import.meta.url);

export interface SendOwnerInvitationEmailParams {
	tenantId: string;
	orgId: string;
	email: string;
	name: string | null;
	invitedBy: number;
	previousOwnerId: number | null;
}

/**
 * Auto-accept an owner invitation by directly creating the global_user
 * and user_org records in the manager DB. Used in local dev environments
 * where email infrastructure is not available.
 */
async function autoAcceptOwnerInvitation(params: SendOwnerInvitationEmailParams): Promise<void> {
	const db = await getDatabase();

	// Create (or find existing) global user
	const globalUser = await db.globalUserDao.findOrCreate({
		email: params.email,
		name: params.name ?? params.email,
		isActive: true,
	});

	// Create (or find existing) user-org binding with owner role
	await db.userOrgDao.findOrCreate({
		userId: globalUser.id,
		tenantId: params.tenantId,
		orgId: params.orgId,
		role: "owner",
		isDefault: true,
	});

	log.info(
		{ tenantId: params.tenantId, orgId: params.orgId, email: params.email, userId: globalUser.id },
		"Owner invitation auto-accepted",
	);
}

/**
 * Call the backend API to send an owner invitation email.
 * Uses HMAC authentication for secure internal communication.
 *
 * When AUTO_ACCEPT_OWNER_INVITATIONS is enabled, bypasses the email flow
 * and directly creates global_user and user_org records.
 *
 * The backend handles:
 * - Canceling any existing pending invitations for the org
 * - Creating a verification record with the invitation metadata
 * - Generating the token and URL
 * - Checking if user exists
 * - Sending the email
 */
export async function sendOwnerInvitationEmail(params: SendOwnerInvitationEmailParams): Promise<void> {
	if (env.AUTO_ACCEPT_OWNER_INVITATIONS) {
		await autoAcceptOwnerInvitation(params);
		return;
	}

	if (!env.BACKEND_INTERNAL_URL || !env.BOOTSTRAP_SECRET) {
		log.warn("BACKEND_INTERNAL_URL or BOOTSTRAP_SECRET not configured, skipping owner invitation email");
		return;
	}

	const authHeaders = createBootstrapAuthHeaders(params.tenantId, params.orgId, env.BOOTSTRAP_SECRET);

	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		...authHeaders,
	};

	// Add Vercel protection bypass header if configured
	if (env.VERCEL_BYPASS_SECRET) {
		headers["x-vercel-protection-bypass"] = env.VERCEL_BYPASS_SECRET;
	}

	// Send all invitation data - backend creates verification record and sends email
	const body = {
		tenantId: params.tenantId,
		orgId: params.orgId,
		email: params.email,
		name: params.name,
		invitedBy: params.invitedBy,
		previousOwnerId: params.previousOwnerId,
	};

	let response: Response;
	try {
		response = await fetch(`${env.BACKEND_INTERNAL_URL}/api/admin/send-owner-invitation-email`, {
			method: "POST",
			headers,
			body: JSON.stringify(body),
		});
	} catch (fetchError) {
		const message = fetchError instanceof Error ? fetchError.message : String(fetchError);
		throw new Error(`Failed to send owner invitation email: Could not connect to backend - ${message}`);
	}

	if (!response.ok) {
		const responseText = await response.text().catch(() => "");
		let errorMessage: string;
		try {
			const errorBody = JSON.parse(responseText);
			errorMessage = errorBody.details || errorBody.error || response.statusText;
		} catch {
			const truncatedBody = responseText.slice(0, 200);
			errorMessage = `HTTP ${response.status}: ${truncatedBody || response.statusText}`;
		}
		throw new Error(`Failed to send owner invitation email: ${errorMessage}`);
	}

	log.info({ tenantId: params.tenantId, orgId: params.orgId, email: params.email }, "Owner invitation email sent");
}
