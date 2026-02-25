/**
 * OwnerInvitationTokenUtil - Utility for generating and verifying owner invitation JWT tokens.
 *
 * This is used by the backend to generate tokens for owner invitations and verify them.
 * Both backend and Manager must use the same TOKEN_SECRET.
 */

import { getLog } from "./Logger";
import { createHash, randomUUID } from "node:crypto";
import jwt, { type Algorithm, type SignOptions } from "jsonwebtoken";

const { JsonWebTokenError, TokenExpiredError } = jwt;

const log = getLog(import.meta);

/**
 * JWT payload for owner invitation tokens.
 * Contains all metadata needed to process the invitation.
 * The invitationId enables direct lookup of the owner_invitation record.
 */
export interface OwnerInvitationTokenPayload {
	/** JWT ID - unique identifier for replay prevention */
	jti: string;
	/** Token type - always 'owner_invitation' for this utility */
	type: "owner_invitation";
	/** Invitee email address */
	email: string;
	/** Tenant ID */
	tenantId: string;
	/** Organization ID */
	orgId: string;
	/** Manager user ID of the person who sent the invitation (SuperAdmin) */
	invitedBy: number;
	/** Optional name for the invitee */
	name: string | null;
	/** Previous owner ID (for owner change flow) */
	previousOwnerId: number | null;
	/** Invitation ID in owner_invitations table (for direct lookup) */
	invitationId: number;
	/** Issued at timestamp (auto-added by JWT) */
	iat?: number;
	/** Expiration timestamp (auto-added by JWT) */
	exp?: number;
}

/**
 * Parameters for generating an owner invitation token
 */
export interface GenerateOwnerInvitationTokenParams {
	email: string;
	tenantId: string;
	orgId: string;
	invitedBy: number;
	name: string | null;
	previousOwnerId: number | null;
	/** Invitation ID in owner_invitations table (for direct lookup) */
	invitationId: number;
	expiresInSeconds: number;
}

/**
 * Result of token generation
 */
export interface OwnerInvitationTokenResult {
	/** The plain JWT token (to be sent in email URL) */
	token: string;
	/** SHA-256 hash of the token (for storage in database) */
	tokenHash: string;
	/** Unique JWT ID */
	jti: string;
}

/**
 * Interface for owner invitation token utility
 */
export interface OwnerInvitationTokenUtil {
	/**
	 * Generate a new owner invitation token
	 */
	generateToken(params: GenerateOwnerInvitationTokenParams): OwnerInvitationTokenResult;

	/**
	 * Verify and decode an owner invitation token
	 * Returns undefined if token is invalid or expired
	 */
	verifyToken(token: string): OwnerInvitationTokenPayload | undefined;

	/**
	 * Hash a token for storage comparison
	 */
	hashToken(token: string): string;
}

/** Default token algorithm */
const DEFAULT_ALGORITHM: Algorithm = "HS256";

/**
 * Create an owner invitation token utility
 */
export function createOwnerInvitationTokenUtil(secret: string): OwnerInvitationTokenUtil {
	return {
		generateToken,
		verifyToken,
		hashToken,
	};

	function generateToken(params: GenerateOwnerInvitationTokenParams): OwnerInvitationTokenResult {
		const jti = randomUUID();
		const payload: Omit<OwnerInvitationTokenPayload, "iat" | "exp"> = {
			jti,
			type: "owner_invitation",
			email: params.email,
			tenantId: params.tenantId,
			orgId: params.orgId,
			invitedBy: params.invitedBy,
			name: params.name,
			previousOwnerId: params.previousOwnerId,
			invitationId: params.invitationId,
		};

		const token = jwt.sign(payload, secret, {
			algorithm: DEFAULT_ALGORITHM,
			expiresIn: params.expiresInSeconds,
		} as SignOptions);

		const tokenHash = hashToken(token);

		return { token, tokenHash, jti };
	}

	function verifyToken(token: string): OwnerInvitationTokenPayload | undefined {
		try {
			const decoded = jwt.verify(token, secret) as OwnerInvitationTokenPayload;

			// Verify this is an owner invitation token
			if (decoded.type !== "owner_invitation") {
				log.warn("Token verification failed: wrong token type (expected 'owner_invitation')");
				return;
			}

			return decoded;
		} catch (error) {
			if (error instanceof TokenExpiredError) {
				log.warn("Token verification failed: token expired");
			} else if (error instanceof JsonWebTokenError) {
				// Covers invalid signature, malformed token, etc.
				log.warn({ errorMessage: error.message }, "Token verification failed: invalid JWT");
			} else {
				log.error(error, "Token verification failed: unexpected error");
			}
			return;
		}
	}

	function hashToken(token: string): string {
		return createHash("sha256").update(token).digest("hex");
	}
}
