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
	clientChangesetId: z.string(),
	targetBranch: z.literal("main"),
	message: z.string().optional(),
	mergePrompt: z.string().optional(),
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
	changeset: z
		.object({
			id: z.number(),
			clientChangesetId: z.string(),
			status: z.string(),
			commitScopeKey: z.string(),
			targetBranch: z.string(),
			payloadHash: z.string(),
			message: z.string().optional(),
			mergePrompt: z.string().optional(),
			createdAt: z.string().or(z.date()),
		})
		.optional(),
	commit: z
		.object({
			id: z.number(),
			clientChangesetId: z.string(),
			status: z.string(),
			commitScopeKey: z.string(),
			targetBranch: z.string(),
			payloadHash: z.string(),
			message: z.string().optional(),
			mergePrompt: z.string().optional(),
			createdAt: z.string().or(z.date()),
		})
		.optional(),
	files: z
		.array(
			z.object({
				id: z.number(),
				fileId: z.string(),
				docJrn: z.string(),
				serverPath: z.string(),
				baseVersion: z.number(),
				opType: z.string(),
			}),
		)
		.optional(),
	replayed: z.boolean().optional(),
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
