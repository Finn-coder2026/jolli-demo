import {
	normalizeOptionalChangesetId,
	registerSyncCommands,
	rewindAllStateFingerprints,
	rewindStateForPendingOps,
} from "./sync";
import { Command } from "commander";
import { describe, expect, it } from "vitest";

describe("sync command options", () => {
	it("adds --changeset to sync up", () => {
		const program = new Command();
		registerSyncCommands(program);

		const syncCommand = program.commands.find(command => command.name() === "sync");
		const upCommand = syncCommand?.commands.find(command => command.name() === "up");
		const changesetOption = upCommand?.options.find(option => option.long === "--changeset");
		const forceOption = upCommand?.options.find(option => option.long === "--force");

		expect(changesetOption).toBeDefined();
		expect(changesetOption?.short).toBe("-c");
		expect(forceOption).toBeDefined();
	});

	it("adds sync pending clear command", () => {
		const program = new Command();
		registerSyncCommands(program);

		const syncCommand = program.commands.find(command => command.name() === "sync");
		const pendingCommand = syncCommand?.commands.find(command => command.name() === "pending");
		const clearCommand = pendingCommand?.commands.find(command => command.name() === "clear");

		expect(pendingCommand).toBeDefined();
		expect(clearCommand).toBeDefined();
	});

	it("normalizes changeset ids", () => {
		expect(normalizeOptionalChangesetId(undefined)).toBeUndefined();
		expect(normalizeOptionalChangesetId("   ")).toBeUndefined();
		expect(normalizeOptionalChangesetId(" MLV4QT1DBMSFRTM5 ")).toBe("MLV4QT1DBMSFRTM5");
		expect(() => normalizeOptionalChangesetId("A".repeat(513))).toThrow("changeset exceeds 512 characters");
	});

	it("rewinds fingerprints for upsert files when clearing pending ops", () => {
		const state = {
			lastCursor: 0,
			files: [
				{
					clientPath: "README.md",
					fileId: "README",
					serverPath: "README.md",
					fingerprint: "HASH_A",
					serverVersion: 2,
				},
				{
					clientPath: "notes/a.md",
					fileId: "A",
					serverPath: "notes/a.md",
					fingerprint: "HASH_B",
					serverVersion: 1,
				},
			],
		};

		const pending = {
			clientChangesetId: "CID-1",
			createdAt: Date.now(),
			targetBranch: "main",
			ops: [
				{
					type: "upsert",
					fileId: "README",
					serverPath: "README.md",
					baseVersion: 2,
					content: "updated",
					contentHash: "h",
				},
			],
		};

		const rewound = rewindStateForPendingOps(state, pending, "MARKER");
		expect(rewound).toBe(1);
		expect(state.files[0]?.fingerprint).toBe("MARKER");
		expect(state.files[1]?.fingerprint).toBe("HASH_B");
	});

	it("rewinds fingerprints for all active files for force push", () => {
		const state = {
			lastCursor: 0,
			files: [
				{
					clientPath: "README.md",
					fileId: "README",
					serverPath: "README.md",
					fingerprint: "HASH_A",
					serverVersion: 2,
				},
				{
					clientPath: "deleted.md",
					fileId: "DELETED",
					serverPath: "deleted.md",
					fingerprint: "HASH_D",
					serverVersion: 1,
					deleted: true,
				},
			],
		};

		const rewound = rewindAllStateFingerprints(state, "FORCE");
		expect(rewound).toBe(1);
		expect(state.files[0]?.fingerprint).toBe("FORCE");
		expect(state.files[1]?.fingerprint).toBe("HASH_D");
	});
});
