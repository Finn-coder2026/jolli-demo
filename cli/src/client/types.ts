// Client types
import { z } from "zod";

// =============================================================================
// Schemas
// =============================================================================

export const FileEntrySchema = z.object({
	clientPath: z.string(),
	fileId: z.string(),
	serverPath: z.string(),
	fingerprint: z.string(),
	serverVersion: z.number(),
	deleted: z.boolean().optional(),
	deletedAt: z.number().optional(),
	trashPath: z.string().optional(),
	conflicted: z.boolean().optional(),
	conflictAt: z.number().optional(),
	conflictServerVersion: z.number().optional(),
});

export const SyncConfigSchema = z.object({
	include: z.array(z.string()).optional(), // glob patterns to include (default: ["**/*.md"])
	exclude: z.array(z.string()).optional(), // glob patterns to exclude (gitignore style)
});

export const SyncStateSchema = z.object({
	lastCursor: z.number(),
	config: SyncConfigSchema.optional(),
	files: z.array(FileEntrySchema),
});

export const ConflictInfoSchema = z.object({
	fileId: z.string(),
	clientPath: z.string(),
	localContent: z.string(),
	serverContent: z.string(),
	serverVersion: z.number(),
	baseContent: z.string().nullable().optional(),
});

export const MergeActionSchema = z.enum(["keep-local", "keep-server", "merged", "keep-both", "conflict-marker"]);

export const MergeResultSchema = z.object({
	fileId: z.string(),
	clientPath: z.string(),
	resolved: z.string(),
	action: MergeActionSchema,
});

export const SyncModeSchema = z.enum(["full", "up-only", "down-only"]);

// =============================================================================
// Inferred Types
// =============================================================================

export type FileEntry = z.infer<typeof FileEntrySchema>;
export type SyncConfig = z.infer<typeof SyncConfigSchema>;
export type SyncState = z.infer<typeof SyncStateSchema>;
export type ConflictInfo = z.infer<typeof ConflictInfoSchema>;
export type MergeAction = z.infer<typeof MergeActionSchema>;
export type MergeResult = z.infer<typeof MergeResultSchema>;
export type SyncMode = z.infer<typeof SyncModeSchema>;

// =============================================================================
// Strategy Interfaces (not zodified - these are runtime contracts)
// =============================================================================

export interface PathObfuscator {
	obfuscate(clientPath: string): string;
	deobfuscate(serverPath: string): string;
}

export interface FingerprintStrategy {
	compute(filePath: string): Promise<string>;
	computeFromContent(content: string): string;
}

export interface FileScanner {
	getFiles(config?: SyncConfig): Promise<Array<string>>;
}

export interface MergeStrategy {
	merge(conflicts: Array<ConflictInfo>): Promise<Array<MergeResult>>;
}
