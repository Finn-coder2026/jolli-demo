import type { PendingOps } from "./SyncEngine";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export type { PendingOps } from "./SyncEngine";

import { normalizeClientPath } from "./SyncHelpers";

export const DEFAULT_PENDING_OPS_PATH = ".jolli/pending-ops.json";

async function ensurePendingDir(pendingPath: string): Promise<void> {
	const normalized = normalizeClientPath(pendingPath);
	const dir = path.posix.dirname(normalized);
	await mkdir(dir, { recursive: true });
}

function isPendingOps(value: unknown): value is PendingOps {
	if (!value || typeof value !== "object") {
		return false;
	}
	const data = value as PendingOps;
	const hasValidMessage = data.message === undefined || typeof data.message === "string";
	const hasValidMergePrompt = data.mergePrompt === undefined || typeof data.mergePrompt === "string";
	return (
		typeof data.clientChangesetId === "string" &&
		typeof data.createdAt === "number" &&
		Array.isArray(data.ops) &&
		hasValidMessage &&
		hasValidMergePrompt
	);
}

export async function savePendingOps(
	pending: PendingOps,
	pendingPath: string = DEFAULT_PENDING_OPS_PATH,
): Promise<void> {
	await ensurePendingDir(pendingPath);
	await writeFile(pendingPath, JSON.stringify(pending, null, 2));
}

export async function loadPendingOps(pendingPath: string = DEFAULT_PENDING_OPS_PATH): Promise<PendingOps | null> {
	try {
		const data = await readFile(pendingPath, "utf8");
		const parsed = JSON.parse(data);
		return isPendingOps(parsed) ? parsed : null;
	} catch (err) {
		if (err && typeof err === "object" && "code" in err) {
			const code = (err as { code?: string }).code;
			if (code === "ENOENT") {
				return null;
			}
		}
		throw err;
	}
}

export async function clearPendingOps(pendingPath: string = DEFAULT_PENDING_OPS_PATH): Promise<void> {
	await rm(pendingPath, { force: true });
}
