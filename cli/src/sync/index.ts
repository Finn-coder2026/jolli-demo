// Sync module - Bidirectional file synchronization
// This module provides the core sync engine, merge utilities, and helpers

// Pending Operations
export { clearPendingOps, DEFAULT_PENDING_OPS_PATH, loadPendingOps, savePendingOps } from "./Pending";
// Smart Merge
export type { DiffOp, DiffOpType, Edit, MergeHunk, MergeHunkType } from "./SmartMerge";
export {
	computeHunks,
	DiffOpSchema,
	DiffOpTypeSchema,
	EditSchema,
	MergeHunkSchema,
	MergeHunkTypeSchema,
	renderWithConflictMarkers,
	smartMerge,
	threeWayMerge,
} from "./SmartMerge";
// Sync Engine
export type {
	FileStore,
	PendingOps,
	PushMetadata,
	PendingOpsStore,
	SnapshotStore,
	StateStore,
	SyncDependencies,
	SyncTransport,
} from "./SyncEngine";
export { conflictMarkerStrategy, PendingOpsSchema, sync } from "./SyncEngine";
export { rewindAllStateFingerprints, rewindStateForPendingOps } from "./StateRewind";
// Sync Helpers
export {
	extractJrn,
	fingerprintFromContent,
	formatConflictMarkers,
	hasConflictMarkers,
	injectJrn,
	integrityHashFromContent,
	normalizeClientPath,
	normalizeGlobPattern,
	removeJrnFromContent,
} from "./SyncHelpers";
// Types
export type {
	ConflictInfo,
	FileEntry,
	FileScanner,
	FingerprintStrategy,
	MergeAction,
	MergeResult,
	MergeStrategy,
	PathObfuscator,
	SyncConfig,
	SyncMode,
	SyncState,
} from "./Types";
export {
	ConflictInfoSchema,
	FileEntrySchema,
	MergeActionSchema,
	MergeResultSchema,
	SyncConfigSchema,
	SyncModeSchema,
	SyncStateSchema,
} from "./Types";
