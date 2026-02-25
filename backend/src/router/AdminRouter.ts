import { auditLog } from "../audit";
import type { GlobalUserDao } from "../dao/GlobalUserDao";
import type { OwnerInvitationDao } from "../dao/OwnerInvitationDao";
import type { VerificationDao } from "../dao/VerificationDao";
import type { TenantOrgConnectionManager } from "../tenant/TenantOrgConnectionManager";
import type { TenantRegistryClient } from "../tenant/TenantRegistryClient";
import { sendOwnerInvitationEmail } from "../util/EmailService";
import { getLog } from "../util/Logger";
import type { OwnerInvitationTokenUtil } from "../util/OwnerInvitationTokenUtil";
import express, { type Router } from "express";
import {
	DEFAULT_BOOTSTRAP_TIMESTAMP_TOLERANCE_MS,
	isTimestampValid,
	verifyBootstrapSignature,
} from "jolli-common/server";

const log = getLog(import.meta);

/** Default invitation expiry in days */
const DEFAULT_EXPIRY_DAYS = 7;

/** Seconds per day for token expiration calculation */
const SECONDS_PER_DAY = 24 * 60 * 60;

export interface AdminRouterOptions {
	registryClient: TenantRegistryClient;
	connectionManager: TenantOrgConnectionManager;
	bootstrapSecret: string;
	bootstrapTimestampToleranceMs?: number | undefined;
	/** Manager DB DAOs for owner invitation handling */
	verificationDao?: VerificationDao | undefined;
	ownerInvitationDao?: OwnerInvitationDao | undefined;
	globalUserDao?: GlobalUserDao | undefined;
	ownerInvitationTokenUtil?: OwnerInvitationTokenUtil | undefined;
	/** Gateway domain for building invitation URLs (e.g., "jolli.app") */
	gatewayDomain?: string | undefined;
	/** Invitation expiry in days (default: 7) */
	ownerInvitationExpiryDays?: number | undefined;
}

/**
 * Creates the admin router with internal endpoints for multi-tenant operations.
 * These endpoints are secured by HMAC-SHA256 signature and are NOT subject to TenantMiddleware.
 */
export function createAdminRouter(options: AdminRouterOptions): Router {
	const {
		registryClient,
		connectionManager,
		bootstrapSecret,
		bootstrapTimestampToleranceMs,
		verificationDao,
		ownerInvitationDao,
		globalUserDao,
		ownerInvitationTokenUtil,
		gatewayDomain,
		ownerInvitationExpiryDays,
	} = options;
	const toleranceMs = bootstrapTimestampToleranceMs ?? DEFAULT_BOOTSTRAP_TIMESTAMP_TOLERANCE_MS;
	const expiryDays = ownerInvitationExpiryDays ?? DEFAULT_EXPIRY_DAYS;
	const router = express.Router();

	/**
	 * POST /api/admin/bootstrap
	 *
	 * Bootstraps the database schema for a tenant's org.
	 * This endpoint is called by the manager app during org provisioning,
	 * after temporarily granting the tenant user superuser privileges.
	 *
	 * Security: Requires HMAC-SHA256 signature via X-Bootstrap-Signature header,
	 * with timestamp validation via X-Bootstrap-Timestamp header.
	 *
	 * Request headers:
	 *   - X-Bootstrap-Signature: HMAC-SHA256 signature in format sha256=<hex>
	 *   - X-Bootstrap-Timestamp: ISO 8601 timestamp
	 *
	 * Request body:
	 *   - tenantId: string - The tenant ID
	 *   - orgId: string - The org ID
	 *   - ownerUser?: { id: number; email: string; name: string } - Optional owner user to create
	 *
	 * Response:
	 *   - 200: { success: true, tenantId, orgId, schemaName, ownerCreated?: boolean }
	 *   - 400: { error: "tenantId and orgId required" }
	 *   - 401: { error: "invalid_request" }
	 *   - 404: { error: "Tenant not found: <id>" } or { error: "Org not found: <id>" }
	 *   - 500: { error: "Bootstrap failed", details: ... }
	 */
	router.post("/bootstrap", async (req, res) => {
		try {
			// 1. Extract auth headers
			const signature = req.headers["x-bootstrap-signature"] as string | undefined;
			const timestamp = req.headers["x-bootstrap-timestamp"] as string | undefined;

			// 2. Validate request body first (needed for signature verification)
			const { tenantId, orgId, ownerUser } = req.body as {
				tenantId?: string;
				orgId?: string;
				ownerUser?: { id: number; email: string; name: string };
			};
			if (!tenantId || !orgId) {
				return res.status(400).json({ error: "tenantId and orgId required" });
			}

			// 3. Validate timestamp is within acceptable window
			if (!isTimestampValid(timestamp, toleranceMs)) {
				log.warn("Bootstrap request with invalid or expired timestamp");
				return res.status(401).json({ error: "invalid_request" });
			}

			// 4. Verify HMAC signature
			const signatureParams = {
				tenantId,
				orgId,
				timestamp: timestamp as string, // Already validated above
			};
			if (!verifyBootstrapSignature(signatureParams, signature, bootstrapSecret)) {
				log.warn("Bootstrap request with invalid signature");
				return res.status(401).json({ error: "invalid_request" });
			}

			log.info({ tenantId, orgId, ownerUser }, "Bootstrap request authenticated successfully");

			// 5. Look up tenant and org from registry
			const tenant = await registryClient.getTenant(tenantId);
			if (!tenant) {
				log.warn({ tenantId }, "Tenant not found for bootstrap");
				return res.status(404).json({ error: `Tenant not found: ${tenantId}` });
			}

			const org = await registryClient.getOrg(orgId);
			if (!org) {
				log.warn({ orgId }, "Org not found for bootstrap");
				return res.status(404).json({ error: `Org not found: ${orgId}` });
			}

			// Verify org belongs to tenant
			if (org.tenantId !== tenantId) {
				log.warn({ tenantId, orgId, orgTenantId: org.tenantId }, "Org does not belong to tenant");
				return res.status(400).json({ error: "Org does not belong to specified tenant" });
			}

			// 6. Get/create database connection with forceSync to create tables
			// This calls createDatabase() which:
			//   - Runs sequelize.sync({ alter: true }) to create/alter tables (forceSync overrides Vercel skip)
			//   - Runs postSync hooks for additional initialization
			log.info({ tenantId, orgId, schemaName: org.schemaName }, "Bootstrapping database schema");
			const database = await connectionManager.getConnection(tenant, org, { forceSync: true });

			log.info({ tenantId, orgId, schemaName: org.schemaName }, "Bootstrap completed successfully");

			// 7. If ownerUser is provided, create the active_user record
			let ownerCreated = false;
			if (ownerUser) {
				try {
					// Check if user already exists
					const existingUser = await database.activeUserDao.findById(ownerUser.id);
					if (!existingUser) {
						await database.activeUserDao.create({
							id: ownerUser.id,
							email: ownerUser.email,
							name: ownerUser.name,
							role: "owner",
							roleId: null, // Will be assigned when RBAC is fully configured
							isActive: true,
							image: null,
							jobTitle: null,
							phone: null,
							language: "en",
							timezone: "UTC",
							location: null,
						});
						ownerCreated = true;
						log.info({ tenantId, orgId, userId: ownerUser.id }, "Created owner user in tenant database");
					} else {
						log.info(
							{ tenantId, orgId, userId: ownerUser.id },
							"Owner user already exists in tenant database",
						);
					}
				} catch (ownerError) {
					log.error(ownerError, "Failed to create owner user, but bootstrap succeeded");
					// Don't fail the entire bootstrap if owner creation fails
				}
			}

			// 8. Create default space if owner was created or already exists
			if (ownerUser) {
				try {
					const spaceDao = database.spaceDao;
					const defaultSpace = await spaceDao.createDefaultSpaceIfNeeded(ownerUser.id);
					log.info(
						{ tenantId, orgId, userId: ownerUser.id, spaceId: defaultSpace.id },
						"Created default space for org",
					);

					// 9. Migrate orphaned docs to the default space
					// This is done here (not in postSync) because active_users must exist first
					try {
						await spaceDao.migrateOrphanedDocs(defaultSpace.id);
						log.info(
							{ tenantId, orgId, spaceId: defaultSpace.id },
							"Migrated orphaned docs to default space",
						);
					} catch (migrateError) {
						log.error(migrateError, "Failed to migrate orphaned docs, but bootstrap succeeded");
					}
				} catch (spaceError) {
					log.error(spaceError, "Failed to create default space, but bootstrap succeeded");
					// Don't fail the entire bootstrap if space creation fails
					// Frontend fallback will handle this case
				}
			}

			// Audit log bootstrap operation
			auditLog({
				action: "create",
				resourceType: "org",
				resourceId: orgId,
				resourceName: org.displayName,
				actorType: "superadmin",
				metadata: { tenantId, orgId, ownerCreated, schemaName: org.schemaName },
			});

			return res.json({
				success: true,
				tenantId,
				orgId,
				schemaName: org.schemaName,
				ownerCreated,
			});
		} catch (error) {
			log.error(error, "Bootstrap failed");
			const message = error instanceof Error ? error.message : "Unknown error";
			return res.status(500).json({ error: "Bootstrap failed", details: message });
		}
	});

	/**
	 * POST /api/admin/send-owner-invitation-email
	 *
	 * Sends an owner invitation email to a specified recipient.
	 * This endpoint is called by the manager app to create an owner invitation and send the email.
	 * The backend handles verification record creation, token generation, URL building, and email sending.
	 *
	 * Security: Requires HMAC-SHA256 signature via X-Bootstrap-Signature header,
	 * with timestamp validation via X-Bootstrap-Timestamp header.
	 *
	 * Request headers:
	 *   - X-Bootstrap-Signature: HMAC-SHA256 signature in format sha256=<hex>
	 *   - X-Bootstrap-Timestamp: ISO 8601 timestamp
	 *
	 * Request body:
	 *   - tenantId: string - The tenant ID
	 *   - orgId: string - The org ID
	 *   - email: string - Recipient email address
	 *   - name: string | null - Recipient name (optional)
	 *   - invitedBy: number - Global user ID of the inviter
	 *   - previousOwnerId: number | null - Previous owner's global user ID (for ownership transfer)
	 *
	 * Response:
	 *   - 200: { success: true }
	 *   - 400: { error: "Missing required fields" } or { error: "Owner invitation feature not configured" }
	 *   - 401: { error: "invalid_request" }
	 *   - 404: { error: "Tenant not found" } or { error: "Org not found" }
	 *   - 500: { error: "Failed to send email", details: ... }
	 */
	router.post("/send-owner-invitation-email", async (req, res) => {
		try {
			// 1. Extract auth headers
			const signature = req.headers["x-bootstrap-signature"] as string | undefined;
			const timestamp = req.headers["x-bootstrap-timestamp"] as string | undefined;

			// 2. Validate request body - all invitation data comes from Manager
			const { tenantId, orgId, email, name, invitedBy, previousOwnerId } = req.body as {
				tenantId?: string;
				orgId?: string;
				email?: string;
				name?: string | null;
				invitedBy?: number;
				previousOwnerId?: number | null;
			};

			if (!tenantId || !orgId || !email || invitedBy === undefined) {
				return res.status(400).json({ error: "tenantId, orgId, email, and invitedBy are required" });
			}

			// 3. Validate timestamp is within acceptable window
			if (!isTimestampValid(timestamp, toleranceMs)) {
				log.warn("Owner invitation email request with invalid or expired timestamp");
				return res.status(401).json({ error: "invalid_request" });
			}

			// 4. Verify HMAC signature
			const signatureParams = {
				tenantId,
				orgId,
				timestamp: timestamp as string,
			};
			if (!verifyBootstrapSignature(signatureParams, signature, bootstrapSecret)) {
				log.warn("Owner invitation email request with invalid signature");
				return res.status(401).json({ error: "invalid_request" });
			}

			log.info({ tenantId, orgId, email }, "Owner invitation email request authenticated successfully");

			// 5. Check required dependencies
			if (!verificationDao || !ownerInvitationDao || !ownerInvitationTokenUtil || !gatewayDomain) {
				log.error("Owner invitation feature not configured - missing dependencies");
				return res.status(400).json({ error: "Owner invitation feature not configured" });
			}

			// 6. Look up tenant and org from registry
			const tenant = await registryClient.getTenant(tenantId);
			if (!tenant) {
				log.warn({ tenantId }, "Tenant not found for owner invitation email");
				return res.status(404).json({ error: `Tenant not found: ${tenantId}` });
			}

			const org = await registryClient.getOrg(orgId);
			if (!org) {
				log.warn({ orgId }, "Org not found for owner invitation email");
				return res.status(404).json({ error: `Org not found: ${orgId}` });
			}

			// 7. Cancel any existing pending invitations for this org
			// This deletes both owner_invitation records AND their associated verification records
			const existingInvitation = await ownerInvitationDao.findPendingByOrg(tenantId, orgId);
			if (existingInvitation) {
				// Delete the associated verification record first
				if (existingInvitation.verificationId) {
					await verificationDao.deleteVerification(existingInvitation.verificationId);
				}
				// Delete the owner invitation
				await ownerInvitationDao.delete(existingInvitation.id);
				log.info({ tenantId, orgId }, "Canceled existing pending owner invitation");
			}

			// 8. Create owner_invitation record (verificationId = null initially)
			const invitation = await ownerInvitationDao.create({
				email,
				name: name ?? null,
				tenantId,
				orgId,
				invitedBy,
				previousOwnerId: previousOwnerId ?? null,
			});

			// 9. Generate JWT token with invitationId
			const expiresInSeconds = expiryDays * SECONDS_PER_DAY;
			const tokenResult = ownerInvitationTokenUtil.generateToken({
				email,
				tenantId,
				orgId,
				invitedBy,
				name: name ?? null,
				previousOwnerId: previousOwnerId ?? null,
				invitationId: invitation.id,
				expiresInSeconds,
			});

			// 10. Create verification record (tokenHash, type="owner_invitation", value=null)
			const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
			const verification = await verificationDao.createVerification({
				identifier: email.toLowerCase(),
				tokenHash: tokenResult.tokenHash,
				type: "owner_invitation",
				expiresAt,
				value: null, // No longer storing metadata in verification - it's in owner_invitations table
			});

			// 11. Update owner_invitation.verificationId
			await ownerInvitationDao.updateVerificationId(invitation.id, verification.id);

			// 12. Build invitation URL (respects tenant tier: custom domain > subdomain > path-based)
			const tenantBaseUrl = buildOwnerInvitationBaseUrl(tenant, gatewayDomain);
			const invitationUrl = `${tenantBaseUrl}/owner-invite/accept?token=${tokenResult.token}`;

			// 13. Check if user already exists
			const existingUser = globalUserDao ? await globalUserDao.findUserByEmail(email) : undefined;
			const userExists = !!existingUser;

			// 14. Send the email
			await sendOwnerInvitationEmail({
				toEmail: email,
				toName: name ?? null,
				invitationUrl,
				tenantName: tenant.displayName,
				organizationName: org.displayName,
				inviterName: "Jolli Admin", // Default inviter name since we don't have this info
				expiresInDays: expiryDays,
				userExists,
			});

			// Audit log owner invitation
			auditLog({
				action: "invite",
				resourceType: "owner_invitation",
				resourceId: invitation.id,
				resourceName: email,
				actorType: "superadmin",
				metadata: { tenantId, orgId, invitedBy, previousOwnerId: previousOwnerId ?? null },
			});

			log.info(
				{ tenantId, orgId, email, invitationId: invitation.id },
				"Owner invitation email sent successfully",
			);

			return res.json({ success: true, invitationId: invitation.id });
		} catch (error) {
			log.error(error, "Failed to send owner invitation email");
			const message = error instanceof Error ? error.message : "Unknown error";
			return res.status(500).json({ error: "Failed to send email", details: message });
		}
	});

	return router;
}

/**
 * Build the base URL for an owner invitation link, respecting the tenant's feature flags.
 *
 * Priority:
 * 1. Custom domain (enterprise tier) — e.g., https://docs.acme.com
 * 2. Subdomain (pro tier) — e.g., https://acme.jolli.app
 * 3. Path-based (free tier) — e.g., https://jolli.app/acme
 */
function buildOwnerInvitationBaseUrl(
	tenant: {
		slug: string;
		primaryDomain: string | null;
		featureFlags: { customDomain?: boolean; subdomain?: boolean };
	},
	gatewayDomain: string,
): string {
	if (tenant.featureFlags.customDomain && tenant.primaryDomain) {
		return `https://${tenant.primaryDomain}`;
	}
	if (tenant.featureFlags.subdomain) {
		return `https://${tenant.slug}.${gatewayDomain}`;
	}
	return `https://${gatewayDomain}/${tenant.slug}`;
}
