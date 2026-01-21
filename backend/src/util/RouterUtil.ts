import type { DocDraftDao } from "../dao/DocDraftDao";
import type { CollabConvo } from "../model/CollabConvo";
import type { DocDraft } from "../model/DocDraft";
import type { TokenUtil } from "./TokenUtil";
import type { Request, Response } from "express";
import { isPrimitiveNumber, type UserInfo } from "jolli-common";

/**
 * Helper to extract optional user ID from request.
 * Similar to getUserId but returns undefined instead of LookupError when user is not authenticated.
 * Useful for endpoints that work with or without authentication.
 * @param tokenUtil the token utility
 * @param req the request
 * @returns user ID if found, otherwise undefined
 */
export function getOptionalUserId(tokenUtil: TokenUtil<UserInfo>, req: Request): number | undefined {
	// Prefer org-specific user ID (set by UserProvisioningMiddleware in multi-tenant mode)
	if (req.orgUser?.id !== undefined) {
		return req.orgUser.id;
	}
	// Fall back to JWT userId (single-tenant mode)
	return tokenUtil.decodePayload(req)?.userId;
}

export interface LookupError {
	readonly status: number;
	readonly message: string;
}

export interface DraftInfo {
	readonly userId: number;
	readonly draft: DocDraft;
}

export interface CollabConvoDraftInfo {
	readonly userId: number;
	readonly convo: CollabConvo;
	readonly draft: DocDraft;
}

/**
 * Type guard to check if a value is a LookupError
 * @param value the value to check
 * @returns true if value is a LookupError, false otherwise
 */
export function isLookupError(value: number | DraftInfo | CollabConvoDraftInfo | LookupError): value is LookupError {
	return !isPrimitiveNumber(value) && "status" in value;
}

/**
 * Helper to handle lookup errors in responses
 * @param res the response
 * @param lookupError the lookup error
 */
export function handleLookupError(res: Response, lookupError: LookupError) {
	const { status, message } = lookupError;
	return res.status(status).json({ error: message });
}

/**
 * Helper to extract user ID from request.
 * In multi-tenant mode, prefers the org-specific user ID from req.orgUser (set by UserProvisioningMiddleware).
 * Falls back to the JWT userId for single-tenant mode or when orgUser is not set.
 * @param tokenUtil the token utility
 * @param req the request
 * @returns user ID if found, otherwise a LookupError
 */
export function getUserId(tokenUtil: TokenUtil<UserInfo>, req: Request): number | LookupError {
	// Prefer org-specific user ID (set by UserProvisioningMiddleware in multi-tenant mode)
	if (req.orgUser?.id !== undefined) {
		return req.orgUser.id;
	}
	// Fall back to JWT userId (single-tenant mode)
	return (
		tokenUtil.decodePayload(req)?.userId ?? {
			status: 401,
			message: "Unauthorized",
		}
	);
}

/**
 * Determines if a user can access a draft based on visibility rules:
 * - User owns the draft (createdBy = userId) OR
 * - Draft is shared (isShared = true) OR
 * - Draft was created by an agent (createdByAgent = true) OR
 * - Draft has a docId (existing article edit - always visible)
 * @param draft the draft to check
 * @param userId the user ID to check access for
 * @returns true if the user can access the draft
 */
export function canAccessDraft(draft: DocDraft, userId: number): boolean {
	return (
		draft.createdBy === userId || // User owns it
		draft.isShared || // Draft is shared
		draft.createdByAgent || // Created by agent
		draft.docId !== undefined // Existing article edit (has docId)
	);
}

/**
 * Lookup a draft by ID and ensure the user has access based on visibility rules
 * @param docDraftDao the doc draft DAO
 * @param tokenUtil the token utility
 * @param req the request
 * @returns DraftInfo if found and authorized, otherwise a LookupError
 */
export async function lookupDraft(
	docDraftDao: DocDraftDao,
	tokenUtil: TokenUtil<UserInfo>,
	req: Request,
): Promise<DraftInfo | LookupError> {
	const userId = getUserId(tokenUtil, req);
	if (isLookupError(userId)) {
		return userId;
	}
	const id = Number.parseInt(req.params.id);
	if (Number.isNaN(id)) {
		return {
			status: 400,
			message: "Invalid draft ID",
		};
	}
	const draft = await docDraftDao.getDocDraft(id);

	if (!draft) {
		return {
			status: 404,
			message: "Draft not found",
		};
	}

	// Check access based on visibility rules
	if (!canAccessDraft(draft, userId)) {
		return {
			status: 403,
			message: "Forbidden",
		};
	}
	return {
		userId,
		draft,
	};
}
