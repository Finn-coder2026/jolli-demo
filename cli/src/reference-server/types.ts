// API types shared with clients
import { z } from "zod";

// =============================================================================
// Schemas
// =============================================================================

export const PushOpTypeSchema = z.enum(["upsert", "delete"]);

export const PushOpSchema = z.object({
	type: PushOpTypeSchema,
	fileId: z.string(),
	serverPath: z.string(),
	baseVersion: z.number(),
	content: z.string().optional(),
	contentHash: z.string().optional(),
});

export const PushRequestSchema = z.object({
	requestId: z.string().optional(),
	ops: z.array(PushOpSchema),
});

export const PullChangeSchema = z.object({
	fileId: z.string(),
	serverPath: z.string(),
	version: z.number(),
	deleted: z.boolean(),
	content: z.string().optional(),
	contentHash: z.string().optional(),
});

export const PushResultStatusSchema = z.enum(["ok", "conflict", "bad_hash"]);

export const PushResultSchema = z.object({
	fileId: z.string(),
	status: PushResultStatusSchema,
	newVersion: z.number().optional(),
	serverVersion: z.number().optional(),
});

export const PushResponseSchema = z.object({
	results: z.array(PushResultSchema),
	newCursor: z.number(),
});

export const PullResponseSchema = z.object({
	newCursor: z.number(),
	changes: z.array(PullChangeSchema),
});

// =============================================================================
// Inferred Types
// =============================================================================

export type PushOpType = z.infer<typeof PushOpTypeSchema>;
export type PushOp = z.infer<typeof PushOpSchema>;
export type PushRequest = z.infer<typeof PushRequestSchema>;
export type PullChange = z.infer<typeof PullChangeSchema>;
export type PushResultStatus = z.infer<typeof PushResultStatusSchema>;
export type PushResult = z.infer<typeof PushResultSchema>;
export type PushResponse = z.infer<typeof PushResponseSchema>;
export type PullResponse = z.infer<typeof PullResponseSchema>;
