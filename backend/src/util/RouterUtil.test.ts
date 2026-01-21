import type { DocDraftDao } from "../dao/DocDraftDao";
import type { DocDraft } from "../model/DocDraft";
import {
	canAccessDraft,
	getOptionalUserId,
	getUserId,
	handleLookupError,
	isLookupError,
	lookupDraft,
} from "./RouterUtil";
import { createTokenUtil } from "./TokenUtil";
import type { Request, Response } from "express";
import type { UserInfo } from "jolli-common";
import { describe, expect, it, vi } from "vitest";

describe("RouterUtil", () => {
	const tokenUtil = createTokenUtil<UserInfo>("test-secret", {
		algorithm: "HS256",
		expiresIn: "1h",
	});

	describe("getOptionalUserId", () => {
		it("should return orgUser.id in multi-tenant mode", () => {
			const req = {
				orgUser: { id: 42 },
			} as unknown as Request;

			const result = getOptionalUserId(tokenUtil, req);

			expect(result).toBe(42);
		});

		it("should fall back to JWT userId in single-tenant mode", () => {
			const token = tokenUtil.generateToken({
				userId: 99,
				name: "Test User",
				email: "test@example.com",
				picture: "https://example.com/pic.jpg",
			});

			const req = {
				cookies: { authToken: token },
				headers: {},
			} as unknown as Request;

			const result = getOptionalUserId(tokenUtil, req);

			expect(result).toBe(99);
		});

		it("should return undefined when no auth is present", () => {
			const req = {
				cookies: {},
				headers: {},
			} as unknown as Request;

			const result = getOptionalUserId(tokenUtil, req);

			expect(result).toBeUndefined();
		});
	});

	describe("getUserId", () => {
		it("should return orgUser.id in multi-tenant mode", () => {
			const req = {
				orgUser: { id: 123 },
			} as unknown as Request;

			const result = getUserId(tokenUtil, req);

			expect(result).toBe(123);
		});

		it("should fall back to JWT userId in single-tenant mode", () => {
			const token = tokenUtil.generateToken({
				userId: 456,
				name: "Test User",
				email: "test@example.com",
				picture: "https://example.com/pic.jpg",
			});

			const req = {
				cookies: { authToken: token },
				headers: {},
			} as unknown as Request;

			const result = getUserId(tokenUtil, req);

			expect(result).toBe(456);
		});

		it("should return LookupError when no auth is present", () => {
			const req = {
				cookies: {},
				headers: {},
			} as unknown as Request;

			const result = getUserId(tokenUtil, req);

			expect(isLookupError(result)).toBe(true);
			if (isLookupError(result)) {
				expect(result.status).toBe(401);
				expect(result.message).toBe("Unauthorized");
			}
		});
	});

	describe("isLookupError", () => {
		it("should return true for LookupError objects", () => {
			const error = { status: 404, message: "Not found" };
			expect(isLookupError(error)).toBe(true);
		});

		it("should return false for numbers", () => {
			expect(isLookupError(123)).toBe(false);
		});

		it("should return false for DraftInfo objects", () => {
			const draftInfo = {
				userId: 1,
				draft: { id: 1, createdBy: 1 } as DocDraft,
			};
			expect(isLookupError(draftInfo)).toBe(false);
		});
	});

	describe("handleLookupError", () => {
		it("should send error response with status and message", () => {
			const res = {
				status: vi.fn().mockReturnThis(),
				json: vi.fn().mockReturnThis(),
			} as unknown as Response;

			const error = { status: 403, message: "Forbidden" };
			handleLookupError(res, error);

			expect(res.status).toHaveBeenCalledWith(403);
			expect(res.json).toHaveBeenCalledWith({ error: "Forbidden" });
		});
	});

	describe("canAccessDraft", () => {
		it("should return true when user owns the draft", () => {
			const draft = { createdBy: 5, isShared: false, createdByAgent: false } as DocDraft;
			expect(canAccessDraft(draft, 5)).toBe(true);
		});

		it("should return true when draft is shared", () => {
			const draft = { createdBy: 5, isShared: true, createdByAgent: false } as DocDraft;
			expect(canAccessDraft(draft, 99)).toBe(true);
		});

		it("should return true when draft was created by agent", () => {
			const draft = { createdBy: 5, isShared: false, createdByAgent: true } as DocDraft;
			expect(canAccessDraft(draft, 99)).toBe(true);
		});

		it("should return true when draft has a docId", () => {
			const draft = { createdBy: 5, isShared: false, createdByAgent: false, docId: 10 } as DocDraft;
			expect(canAccessDraft(draft, 99)).toBe(true);
		});

		it("should return false when user cannot access draft", () => {
			const draft = { createdBy: 5, isShared: false, createdByAgent: false } as DocDraft;
			expect(canAccessDraft(draft, 99)).toBe(false);
		});
	});

	describe("lookupDraft", () => {
		const createMockRequest = (userId: number, draftId: string): Request => {
			const token = tokenUtil.generateToken({
				userId,
				name: "Test User",
				email: "test@example.com",
				picture: "https://example.com/pic.jpg",
			});
			return {
				cookies: { authToken: token },
				headers: {},
				params: { id: draftId },
			} as unknown as Request;
		};

		it("should return DraftInfo when user can access draft", async () => {
			const draft = { id: 1, createdBy: 10, isShared: false, createdByAgent: false } as DocDraft;
			const mockDao = {
				getDocDraft: vi.fn().mockResolvedValue(draft),
			} as unknown as DocDraftDao;

			const req = createMockRequest(10, "1");
			const result = await lookupDraft(mockDao, tokenUtil, req);

			expect(isLookupError(result)).toBe(false);
			if (!isLookupError(result)) {
				expect(result.userId).toBe(10);
				expect(result.draft).toBe(draft);
			}
		});

		it("should return 401 when user is not authenticated", async () => {
			const mockDao = {} as DocDraftDao;
			const req = {
				cookies: {},
				headers: {},
				params: { id: "1" },
			} as unknown as Request;

			const result = await lookupDraft(mockDao, tokenUtil, req);

			expect(isLookupError(result)).toBe(true);
			if (isLookupError(result)) {
				expect(result.status).toBe(401);
				expect(result.message).toBe("Unauthorized");
			}
		});

		it("should return 400 when draft ID is invalid", async () => {
			const mockDao = {} as DocDraftDao;
			const req = createMockRequest(10, "invalid");

			const result = await lookupDraft(mockDao, tokenUtil, req);

			expect(isLookupError(result)).toBe(true);
			if (isLookupError(result)) {
				expect(result.status).toBe(400);
				expect(result.message).toBe("Invalid draft ID");
			}
		});

		it("should return 404 when draft is not found", async () => {
			const mockDao = {
				getDocDraft: vi.fn().mockResolvedValue(null),
			} as unknown as DocDraftDao;

			const req = createMockRequest(10, "999");
			const result = await lookupDraft(mockDao, tokenUtil, req);

			expect(isLookupError(result)).toBe(true);
			if (isLookupError(result)) {
				expect(result.status).toBe(404);
				expect(result.message).toBe("Draft not found");
			}
		});

		it("should return 403 when user cannot access draft", async () => {
			const draft = { id: 1, createdBy: 5, isShared: false, createdByAgent: false } as DocDraft;
			const mockDao = {
				getDocDraft: vi.fn().mockResolvedValue(draft),
			} as unknown as DocDraftDao;

			const req = createMockRequest(99, "1");
			const result = await lookupDraft(mockDao, tokenUtil, req);

			expect(isLookupError(result)).toBe(true);
			if (isLookupError(result)) {
				expect(result.status).toBe(403);
				expect(result.message).toBe("Forbidden");
			}
		});
	});
});
