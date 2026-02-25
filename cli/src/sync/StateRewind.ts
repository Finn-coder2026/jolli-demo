import type { PushOp } from "../reference-server/types";
import type { SyncState } from "./Types";

type PendingOpsLike = {
	ops: Array<Pick<PushOp, "type" | "fileId">>;
};

export function rewindStateForPendingOps(state: SyncState, pending: PendingOpsLike, marker: string): number {
	const upsertFileIds = new Set<string>();
	for (const op of pending.ops) {
		if (op.type === "upsert") {
			upsertFileIds.add(op.fileId);
		}
	}
	if (upsertFileIds.size === 0) {
		return 0;
	}

	let rewound = 0;
	for (const file of state.files) {
		if (!upsertFileIds.has(file.fileId)) {
			continue;
		}
		file.fingerprint = marker;
		rewound += 1;
	}
	return rewound;
}

export function rewindAllStateFingerprints(state: SyncState, marker: string): number {
	let rewound = 0;
	for (const file of state.files) {
		if (file.deleted) {
			continue;
		}
		file.fingerprint = marker;
		rewound += 1;
	}
	return rewound;
}

