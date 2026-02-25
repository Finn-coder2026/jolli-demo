import { getConfig } from "../config/Config";
import type { OrgUserRole } from "../model/ActiveUser";
import { createHash, randomUUID } from "node:crypto";
import jwt, { type Algorithm, type SignOptions } from "jsonwebtoken";

/**
 * Hash a token using SHA256 for secure storage.
 * Used for storing tokens in database to protect against database compromise.
 */
export function hashToken(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}

/**
 * JWT payload for invitation tokens.
 * Contains all information needed to process an invitation acceptance.
 */
export interface InvitationTokenPayload {
	/** JWT ID - unique identifier for replay prevention */
	jti: string;
	/** Token type - always 'invitation' for this utility */
	type: "invitation";
	/** Invitee email address */
	email: string;
	/** Tenant ID */
	tenantId: string;
	/** Organization ID */
	orgId: string;
	/** User ID of the person who sent the invitation */
	invitedBy: number;
	/** Role being granted to the invitee */
	role: OrgUserRole;
	/** Invitation ID in user_invitations table */
	invitationId: number;
	/** Issued at timestamp (auto-added by JWT) */
	iat?: number;
	/** Expiration timestamp (auto-added by JWT) */
	exp?: number;
}

/**
 * Parameters for generating an invitation token
 */
export interface GenerateInvitationTokenParams {
	email: string;
	tenantId: string;
	orgId: string;
	invitedBy: number;
	role: OrgUserRole;
	invitationId: number;
	expiresInSeconds: number;
}

/**
 * Result of token generation
 */
export interface InvitationTokenResult {
	/** The plain JWT token (to be sent in email URL) */
	token: string;
	/** SHA-256 hash of the token (for storage in database) */
	tokenHash: string;
	/** Unique JWT ID */
	jti: string;
}

/**
 * Interface for invitation token utility
 */
export interface InvitationTokenUtil {
	/**
	 * Generate a new invitation token
	 */
	generateToken(params: GenerateInvitationTokenParams): InvitationTokenResult;

	/**
	 * Verify and decode an invitation token
	 * Returns undefined if token is invalid or expired
	 */
	verifyToken(token: string): InvitationTokenPayload | undefined;

	/**
	 * Hash a token for storage comparison
	 */
	hashToken(token: string): string;
}

/**
 * Create an invitation token utility using environment configuration
 */
export function createInvitationTokenUtilFromEnv(): InvitationTokenUtil {
	return createInvitationTokenUtil();
}

/**
 * Create an invitation token utility with optional custom secret (for testing)
 */
export function createInvitationTokenUtil(secret?: string, algorithm?: Algorithm): InvitationTokenUtil {
	return {
		generateToken,
		verifyToken,
		hashToken, // Use the exported hashToken function
	};

	function generateToken(params: GenerateInvitationTokenParams): InvitationTokenResult {
		const jti = randomUUID();
		const payload: Omit<InvitationTokenPayload, "iat" | "exp"> = {
			jti,
			type: "invitation",
			email: params.email,
			tenantId: params.tenantId,
			orgId: params.orgId,
			invitedBy: params.invitedBy,
			role: params.role,
			invitationId: params.invitationId,
		};

		const tokenSecret = secret || getConfig().TOKEN_SECRET;
		const tokenAlgorithm = algorithm || getConfig().TOKEN_ALGORITHM;

		const token = jwt.sign(payload, tokenSecret, {
			algorithm: tokenAlgorithm,
			expiresIn: params.expiresInSeconds,
		} as SignOptions);

		const tokenHash = hashToken(token);

		return { token, tokenHash, jti };
	}

	function verifyToken(token: string): InvitationTokenPayload | undefined {
		try {
			const tokenSecret = secret || getConfig().TOKEN_SECRET;
			const decoded = jwt.verify(token, tokenSecret) as InvitationTokenPayload;

			// Verify this is an invitation token
			if (decoded.type !== "invitation") {
				return;
			}

			return decoded;
		} catch {
			return;
		}
	}
}
