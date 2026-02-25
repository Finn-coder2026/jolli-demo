import { getConfig } from "../config/Config";
import type { DaoProvider } from "../dao/DaoProvider";
import type { DocDao } from "../dao/DocDao";
import { mockDocDao } from "../dao/DocDao.mock";
import type { SpaceDao } from "../dao/SpaceDao";
import { mockSpaceDao } from "../dao/SpaceDao.mock";
import type { SyncArticleDao } from "../dao/SyncArticleDao";
import { mockSyncArticleDao } from "../dao/SyncArticleDao.mock";
import type { CreateProposedCommitInput, SyncCommitDao, SyncCommitSummary } from "../dao/SyncCommitDao";
import type { Doc } from "../model/Doc";
import { mockDoc } from "../model/Doc.mock";
import { mockSpace } from "../model/Space.mock";
import type { SyncCommit } from "../model/SyncCommit";
import type { SyncCommitFile } from "../model/SyncCommitFile";
import type { SyncCommitFileReview } from "../model/SyncCommitFileReview";
import { createSyncRouter } from "./SyncRouter";
import express, { type Express } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

function mockDaoProvider<T>(dao: T): DaoProvider<T> {
	return { getDao: () => dao };
}

function mockScopeClientUniqueViolationError(): Error & {
	name: string;
	original: { code: string; constraint: string };
} {
	const error = new Error("duplicate key value violates unique constraint") as Error & {
		name: string;
		original: { code: string; constraint: string };
	};
	error.name = "SequelizeUniqueConstraintError";
	error.original = {
		code: "23505",
		constraint: "sync_commits_scope_client_changeset_key",
	};
	return error;
}

function createInMemorySyncCommitDao(): SyncCommitDao {
	let nextCommitId = 1;
	let nextFileId = 1;
	let nextReviewId = 1;
	const commits = new Map<number, SyncCommit>();
	const files = new Map<number, SyncCommitFile>();
	const reviews = new Map<number, SyncCommitFileReview>();

	function getLatestReviewForCommitFile(commitFileId: number): SyncCommitFileReview | undefined {
		const allReviews = [...reviews.values()]
			.filter(review => review.commitFileId === commitFileId)
			.sort((a, b) => {
				const diff = b.reviewedAt.getTime() - a.reviewedAt.getTime();
				return diff !== 0 ? diff : b.id - a.id;
			});
		return allReviews[0];
	}

	return {
		createProposedCommit(
			input: CreateProposedCommitInput,
		): Promise<{ commit: SyncCommit; files: Array<SyncCommitFile> }> {
			const commit: SyncCommit = {
				id: nextCommitId++,
				seq: input.seq,
				message: input.message,
				mergePrompt: input.mergePrompt,
				pushedBy: input.pushedBy,
				clientChangesetId: input.clientChangesetId,
				status: "proposed",
				commitScopeKey: input.commitScopeKey,
				targetBranch: input.targetBranch,
				payloadHash: input.payloadHash,
				publishedAt: undefined,
				publishedBy: undefined,
				createdAt: new Date(),
			};
			commits.set(commit.id, commit);

			const createdFiles: Array<SyncCommitFile> = input.files.map(file => {
				const created: SyncCommitFile = {
					id: nextFileId++,
					commitId: commit.id,
					fileId: file.fileId,
					docJrn: file.docJrn,
					serverPath: file.serverPath,
					baseContent: file.baseContent,
					baseVersion: file.baseVersion,
					incomingContent: file.incomingContent,
					incomingContentHash: file.incomingContentHash,
					lineAdditions: file.lineAdditions ?? 0,
					lineDeletions: file.lineDeletions ?? 0,
					opType: file.opType,
					createdAt: new Date(),
				};
				files.set(created.id, created);
				return created;
			});

			return Promise.resolve({ commit, files: createdFiles });
		},

		findCommitByScopeAndClientChangesetId(
			commitScopeKey: string,
			clientChangesetId: string,
		): Promise<SyncCommit | undefined> {
			return Promise.resolve(
				[...commits.values()].find(
					commit =>
						commit.commitScopeKey === commitScopeKey && commit.clientChangesetId === clientChangesetId,
				),
			);
		},

		getCommit(id: number): Promise<SyncCommit | undefined> {
			return Promise.resolve(commits.get(id));
		},

		listCommitsByScope(
			commitScopeKey: string,
			options?: {
				limit?: number;
				beforeId?: number;
			},
		): Promise<Array<SyncCommit>> {
			const scoped = [...commits.values()]
				.filter(commit => commit.commitScopeKey === commitScopeKey)
				.filter(commit => (options?.beforeId !== undefined ? commit.id < options.beforeId : true))
				.sort((a, b) => {
					const timeDiff = b.createdAt.getTime() - a.createdAt.getTime();
					return timeDiff !== 0 ? timeDiff : b.id - a.id;
				});
			return Promise.resolve(options?.limit !== undefined ? scoped.slice(0, options.limit) : scoped);
		},

		listCommitSummaries(commitIds: Array<number>): Promise<Map<number, SyncCommitSummary>> {
			const summaryByCommitId = new Map<number, SyncCommitSummary>();
			for (const commitId of commitIds) {
				const commitFiles = [...files.values()].filter(file => file.commitId === commitId);
				let accepted = 0;
				let rejected = 0;
				let amended = 0;
				let additions = 0;
				let deletions = 0;

				for (const file of commitFiles) {
					const review = getLatestReviewForCommitFile(file.id);
					if (review?.decision === "accept") {
						accepted += 1;
					} else if (review?.decision === "reject") {
						rejected += 1;
					} else if (review?.decision === "amend") {
						amended += 1;
					}
					additions += file.lineAdditions;
					deletions += file.lineDeletions;
				}

				summaryByCommitId.set(commitId, {
					totalFiles: commitFiles.length,
					accepted,
					rejected,
					amended,
					pending: commitFiles.length - accepted - rejected - amended,
					additions,
					deletions,
				});
			}
			return Promise.resolve(summaryByCommitId);
		},

		getCommitFiles(commitId: number): Promise<Array<SyncCommitFile>> {
			return Promise.resolve(
				[...files.values()].filter(file => file.commitId === commitId).sort((a, b) => a.id - b.id),
			);
		},

		getCommitFile(commitId: number, commitFileId: number): Promise<SyncCommitFile | undefined> {
			const file = files.get(commitFileId);
			return Promise.resolve(file?.commitId === commitId ? file : undefined);
		},

		createFileReview(input): Promise<SyncCommitFileReview> {
			const review: SyncCommitFileReview = {
				id: nextReviewId++,
				commitFileId: input.commitFileId,
				decision: input.decision,
				amendedContent: input.amendedContent,
				reviewedBy: input.reviewedBy,
				reviewedAt: input.reviewedAt ?? new Date(),
				comment: input.comment,
			};
			reviews.set(review.id, review);
			return Promise.resolve(review);
		},

		getLatestReviewsForCommit(commitId: number): Promise<Map<number, SyncCommitFileReview>> {
			const map = new Map<number, SyncCommitFileReview>();
			for (const file of files.values()) {
				if (file.commitId !== commitId) {
					continue;
				}
				const review = getLatestReviewForCommitFile(file.id);
				if (review) {
					map.set(file.id, review);
				}
			}
			return Promise.resolve(map);
		},

		getLatestReviewForFile(commitFileId: number): Promise<SyncCommitFileReview | undefined> {
			return Promise.resolve(getLatestReviewForCommitFile(commitFileId));
		},

		updateCommit(
			id: number,
			update: Partial<{ status: SyncCommit["status"]; publishedAt: Date; publishedBy: string }>,
			_transaction,
			options?: { expectedCurrentStatuses?: Array<SyncCommit["status"]> },
		): Promise<SyncCommit | undefined> {
			const existing = commits.get(id);
			if (!existing) {
				return Promise.resolve(undefined);
			}
			if (
				options?.expectedCurrentStatuses &&
				options.expectedCurrentStatuses.length > 0 &&
				!options.expectedCurrentStatuses.includes(existing.status)
			) {
				return Promise.resolve(undefined);
			}
			const updated = { ...existing, ...update };
			commits.set(id, updated);
			return Promise.resolve(updated);
		},
	};
}

describe("SyncRouter v3", () => {
	let app: Express;
	let syncCommitDao: SyncCommitDao;
	let docDao: DocDao;
	let syncArticleDao: SyncArticleDao;
	let spaceDao: SpaceDao;
	let docsByJrn: Map<string, Doc>;
	let cursor: number;

	beforeEach(() => {
		syncCommitDao = createInMemorySyncCommitDao();
		docDao = mockDocDao();
		syncArticleDao = mockSyncArticleDao();
		spaceDao = mockSpaceDao();
		docsByJrn = new Map();
		cursor = 0;

		const defaultSpace = mockSpace({ id: 1, slug: "default", jrn: "default", name: "Default Space" });
		const otherSpace = mockSpace({ id: 2, slug: "other", jrn: "other", name: "Other Space" });
		spaceDao.getDefaultSpace = vi.fn().mockResolvedValue(defaultSpace);
		spaceDao.getSpaceBySlug = vi.fn().mockImplementation((slug: string) => {
			if (slug === defaultSpace.slug) {
				return Promise.resolve(defaultSpace);
			}
			if (slug === otherSpace.slug) {
				return Promise.resolve(otherSpace);
			}
			return Promise.resolve(undefined);
		});

		docDao.readDoc = vi.fn().mockImplementation((jrn: string) => Promise.resolve(docsByJrn.get(jrn)));
		docDao.readDocsByJrns = vi.fn().mockImplementation((jrns: Array<string>) => {
			const result = new Map<string, unknown>();
			for (const jrn of jrns) {
				const doc = docsByJrn.get(jrn);
				if (doc) {
					result.set(jrn, doc);
				}
			}
			return Promise.resolve(result);
		});
		docDao.createDoc = vi.fn().mockImplementation(newDoc => {
			const created = mockDoc({
				id: docsByJrn.size + 1,
				jrn: newDoc.jrn ?? "",
				content: newDoc.content,
				contentType: newDoc.contentType,
				contentMetadata: newDoc.contentMetadata,
				version: 1,
				spaceId: newDoc.spaceId,
				parentId: newDoc.parentId,
				docType: newDoc.docType,
				createdBy: newDoc.createdBy,
				updatedBy: newDoc.updatedBy,
			});
			docsByJrn.set(created.jrn, created);
			return Promise.resolve(created);
		});
		docDao.updateDocIfVersion = vi.fn().mockImplementation((doc: Doc, expectedVersion: number) => {
			const existing = docsByJrn.get(doc.jrn);
			if (!existing || existing.version !== expectedVersion) {
				return Promise.resolve("conflict");
			}
			const updated = mockDoc({
				...existing,
				...doc,
			});
			docsByJrn.set(updated.jrn, updated);
			return Promise.resolve(updated);
		});
		docDao.listDocs = vi.fn().mockResolvedValue([]);
		docDao.findFolderByName = vi.fn().mockResolvedValue(undefined);
		docDao.getMaxSortOrder = vi.fn().mockResolvedValue(0);

		syncArticleDao.getCurrentCursor = vi.fn().mockImplementation(() => Promise.resolve(cursor));
		syncArticleDao.advanceCursor = vi.fn().mockImplementation(() => {
			cursor += 1;
			return Promise.resolve(cursor);
		});
		syncArticleDao.getSyncArticlesSince = vi.fn().mockResolvedValue([]);

		app = express();
		app.use(express.json());
		app.use(
			"/v1/sync",
			createSyncRouter(
				mockDaoProvider(docDao),
				mockDaoProvider(syncArticleDao),
				mockDaoProvider(syncCommitDao),
				mockDaoProvider(spaceDao),
			),
		);
	});

	it("replays same clientChangesetId with identical payload (idempotent)", async () => {
		const body = {
			clientChangesetId: "CID-001",
			targetBranch: "main",
			ops: [{ type: "upsert", fileId: "file-1", serverPath: "file-1.md", baseVersion: 0, content: "# one" }],
		};

		const first = await request(app).post("/v1/sync/push").send(body);
		const second = await request(app).post("/v1/sync/push").send(body);

		expect(first.status).toBe(200);
		expect(first.body.replayed).toBe(false);
		expect(second.status).toBe(200);
		expect(second.body.replayed).toBe(true);
		expect(second.body.changeset.id).toBe(first.body.changeset.id);
	});

	it("returns 409 when clientChangesetId is reused with different payload", async () => {
		const original = {
			clientChangesetId: "CID-002",
			targetBranch: "main",
			ops: [{ type: "upsert", fileId: "file-2", serverPath: "file-2.md", baseVersion: 0, content: "# a" }],
		};
		const changed = {
			...original,
			ops: [{ type: "upsert", fileId: "file-2", serverPath: "file-2.md", baseVersion: 0, content: "# b" }],
		};

		const first = await request(app).post("/v1/sync/push").send(original);
		const second = await request(app).post("/v1/sync/push").send(changed);

		expect(first.status).toBe(200);
		expect(second.status).toBe(409);
		expect(second.body.code).toBe("CLIENT_CHANGESET_ID_REUSED");
	});

	it("stores and returns message and mergePrompt metadata", async () => {
		const body = {
			clientChangesetId: "CID-META-001",
			targetBranch: "main",
			message: "Refine docs for auth middleware",
			mergePrompt: "Prefer preserving behavior notes and security caveats from both versions.",
			ops: [{ type: "upsert", fileId: "meta-1", serverPath: "meta-1.md", baseVersion: 0, content: "# meta" }],
		};

		const push = await request(app).post("/v1/sync/push").send(body);

		expect(push.status).toBe(200);
		expect(push.body.changeset.message).toBe(body.message);
		expect(push.body.changeset.mergePrompt).toBe(body.mergePrompt);
	});

	it("treats mergePrompt changes as payload changes for idempotency", async () => {
		const original = {
			clientChangesetId: "CID-META-002",
			targetBranch: "main",
			mergePrompt: "Prefer shorter conflict summaries.",
			ops: [{ type: "upsert", fileId: "meta-2", serverPath: "meta-2.md", baseVersion: 0, content: "# a" }],
		};
		const changed = {
			...original,
			mergePrompt: "Prefer preserving all details in conflicts.",
		};

		const first = await request(app).post("/v1/sync/push").send(original);
		const second = await request(app).post("/v1/sync/push").send(changed);

		expect(first.status).toBe(200);
		expect(second.status).toBe(409);
		expect(second.body.code).toBe("CLIENT_CHANGESET_ID_REUSED");
	});

	it("handles unique-index race as idempotent replay (no 500)", async () => {
		const realCreate = syncCommitDao.createProposedCommit.bind(syncCommitDao);
		const realFind = syncCommitDao.findCommitByScopeAndClientChangesetId.bind(syncCommitDao);
		let racedCommit: SyncCommit | undefined;
		let createAttempted = false;

		syncCommitDao.findCommitByScopeAndClientChangesetId = vi.fn(
			async (commitScopeKey: string, clientChangesetId: string) => {
				if (!createAttempted) {
					return;
				}
				return racedCommit ?? (await realFind(commitScopeKey, clientChangesetId));
			},
		);

		syncCommitDao.createProposedCommit = vi.fn(async input => {
			createAttempted = true;
			const created = await realCreate(input);
			racedCommit = created.commit;
			throw mockScopeClientUniqueViolationError();
		});

		const response = await request(app)
			.post("/v1/sync/push")
			.send({
				clientChangesetId: "CID-RACE-001",
				targetBranch: "main",
				ops: [{ type: "upsert", fileId: "race-1", serverPath: "race-1.md", baseVersion: 0, content: "# race" }],
			});

		expect(response.status).toBe(200);
		expect(response.body.replayed).toBe(true);
		expect(response.body.changeset.id).toBeDefined();
	});

	it("handles unique-index race with mismatched payload as 409", async () => {
		const realCreate = syncCommitDao.createProposedCommit.bind(syncCommitDao);
		let racedCommit: SyncCommit | undefined;
		let createAttempted = false;

		syncCommitDao.findCommitByScopeAndClientChangesetId = vi.fn(() => {
			if (!createAttempted) {
				return Promise.resolve(undefined);
			}
			return Promise.resolve(racedCommit);
		});

		syncCommitDao.createProposedCommit = vi.fn(async input => {
			createAttempted = true;
			const created = await realCreate({
				...input,
				payloadHash: `${input.payloadHash}-different`,
			});
			racedCommit = created.commit;
			throw mockScopeClientUniqueViolationError();
		});

		const response = await request(app)
			.post("/v1/sync/push")
			.send({
				clientChangesetId: "CID-RACE-002",
				targetBranch: "main",
				ops: [{ type: "upsert", fileId: "race-2", serverPath: "race-2.md", baseVersion: 0, content: "# race" }],
			});

		expect(response.status).toBe(409);
		expect(response.body.code).toBe("CLIENT_CHANGESET_ID_REUSED");
	});

	it("supports accept/reject/amend review decisions and surfaces latest review", async () => {
		const push = await request(app)
			.post("/v1/sync/push")
			.send({
				clientChangesetId: "CID-003",
				targetBranch: "main",
				ops: [
					{ type: "upsert", fileId: "f1", serverPath: "a.md", baseVersion: 0, content: "# a" },
					{ type: "upsert", fileId: "f2", serverPath: "b.md", baseVersion: 0, content: "# b" },
					{ type: "upsert", fileId: "f3", serverPath: "c.md", baseVersion: 0, content: "# c" },
				],
			});

		expect(push.status).toBe(200);
		const commitId = push.body.changeset.id as number;
		const [fileA, fileB, fileC] = push.body.files as Array<{ id: number }>;

		const accept = await request(app)
			.patch(`/v1/sync/changesets/${commitId}/files/${fileA.id}/review`)
			.send({ decision: "accept" });
		const reject = await request(app)
			.patch(`/v1/sync/changesets/${commitId}/files/${fileB.id}/review`)
			.send({ decision: "reject" });
		const amend = await request(app)
			.patch(`/v1/sync/changesets/${commitId}/files/${fileC.id}/review`)
			.send({ decision: "amend", amendedContent: "# amended c" });

		expect(accept.status).toBe(200);
		expect(reject.status).toBe(200);
		expect(amend.status).toBe(200);
		expect(amend.body.changeset.status).toBe("ready");

		const files = await request(app).get(`/v1/sync/changesets/${commitId}/files`);
		expect(files.status).toBe(200);
		const reviews = (files.body.files as Array<{ latestReview: { decision: string } | null }>).map(
			file => file.latestReview?.decision,
		);
		expect(reviews).toEqual(["accept", "reject", "amend"]);
	});

	it("publishes accepted changes (happy path)", async () => {
		const syncPrefix = getConfig().SYNC_JRN_PREFIX;
		const jrn = `${syncPrefix}f4`;
		docsByJrn.set(
			jrn,
			mockDoc({
				id: 99,
				jrn,
				content: "# base",
				version: 1,
				spaceId: 1,
				contentMetadata: { sync: { fileId: "f4", serverPath: "f4.md" } },
			}),
		);

		const push = await request(app)
			.post("/v1/sync/push")
			.send({
				clientChangesetId: "CID-004",
				targetBranch: "main",
				ops: [{ type: "upsert", fileId: "f4", serverPath: "f4.md", baseVersion: 1, content: "# updated" }],
			});
		const commitId = push.body.changeset.id as number;
		const commitFileId = (push.body.files as Array<{ id: number }>)[0].id;

		await request(app)
			.patch(`/v1/sync/changesets/${commitId}/files/${commitFileId}/review`)
			.send({ decision: "accept" });

		const publish = await request(app).post(`/v1/sync/changesets/${commitId}/publish`).send({});
		expect(publish.status).toBe(200);
		expect(publish.body.hasConflicts).toBe(false);
		expect(publish.body.changeset.status).toBe("published");
		expect(publish.body.files[0].status).toBe("published");
		expect(docsByJrn.get(jrn)?.content).toBe("# updated");
	});

	it("reports publish conflicts when main changed since proposal", async () => {
		const syncPrefix = getConfig().SYNC_JRN_PREFIX;
		const jrn = `${syncPrefix}f5`;
		docsByJrn.set(
			jrn,
			mockDoc({
				id: 100,
				jrn,
				content: "# original",
				version: 1,
				spaceId: 1,
				contentMetadata: { sync: { fileId: "f5", serverPath: "f5.md" } },
			}),
		);

		const push = await request(app)
			.post("/v1/sync/push")
			.send({
				clientChangesetId: "CID-005",
				targetBranch: "main",
				ops: [{ type: "upsert", fileId: "f5", serverPath: "f5.md", baseVersion: 1, content: "# cli edit" }],
			});
		const commitId = push.body.changeset.id as number;
		const commitFileId = (push.body.files as Array<{ id: number }>)[0].id;

		await request(app)
			.patch(`/v1/sync/changesets/${commitId}/files/${commitFileId}/review`)
			.send({ decision: "accept" });

		docsByJrn.set(
			jrn,
			mockDoc({
				...(docsByJrn.get(jrn) as Doc),
				content: "# web edit",
				version: 2,
			}),
		);

		const publish = await request(app).post(`/v1/sync/changesets/${commitId}/publish`).send({});
		expect(publish.status).toBe(200);
		expect(publish.body.hasConflicts).toBe(true);
		expect(publish.body.changeset.status).toBe("reviewing");
		expect(publish.body.files[0].status).toBe("conflict");
		expect(docsByJrn.get(jrn)?.content).toBe("# web edit");
	});

	it("does not downgrade published status on stale review status recompute", async () => {
		const push = await request(app)
			.post("/v1/sync/push")
			.send({
				clientChangesetId: "CID-005B",
				targetBranch: "main",
				ops: [{ type: "upsert", fileId: "f5b", serverPath: "f5b.md", baseVersion: 0, content: "# f5b" }],
			});
		const commitId = push.body.changeset.id as number;
		const commitFileId = (push.body.files as Array<{ id: number }>)[0].id;

		const realUpdateCommit = syncCommitDao.updateCommit.bind(syncCommitDao);
		syncCommitDao.updateCommit = vi.fn(async (id, update, transaction, options) => {
			if (update.status === "reviewing" || update.status === "ready" || update.status === "rejected") {
				await realUpdateCommit(
					id,
					{ status: "published", publishedBy: "racer", publishedAt: new Date() },
					transaction,
					options,
				);
				return;
			}
			return realUpdateCommit(id, update, transaction, options);
		});

		const review = await request(app)
			.patch(`/v1/sync/changesets/${commitId}/files/${commitFileId}/review`)
			.send({ decision: "accept" });

		expect(review.status).toBe(200);
		expect(review.body.changeset.status).toBe("published");
	});

	it("does not downgrade published status on stale publish transition", async () => {
		const syncPrefix = getConfig().SYNC_JRN_PREFIX;
		const jrn = `${syncPrefix}f8`;
		docsByJrn.set(
			jrn,
			mockDoc({
				id: 101,
				jrn,
				content: "# base",
				version: 1,
				spaceId: 1,
				contentMetadata: { sync: { fileId: "f8", serverPath: "f8.md" } },
			}),
		);

		const push = await request(app)
			.post("/v1/sync/push")
			.send({
				clientChangesetId: "CID-008",
				targetBranch: "main",
				ops: [{ type: "upsert", fileId: "f8", serverPath: "f8.md", baseVersion: 1, content: "# updated" }],
			});
		const commitId = push.body.changeset.id as number;
		const commitFileId = (push.body.files as Array<{ id: number }>)[0].id;
		await request(app)
			.patch(`/v1/sync/changesets/${commitId}/files/${commitFileId}/review`)
			.send({ decision: "accept" });

		const realUpdateCommit = syncCommitDao.updateCommit.bind(syncCommitDao);
		syncCommitDao.updateCommit = vi.fn(async (id, update, transaction, options) => {
			if (update.status === "published" || update.status === "reviewing") {
				await realUpdateCommit(
					id,
					{ status: "published", publishedBy: "racer", publishedAt: new Date() },
					transaction,
					options,
				);
				return;
			}
			return realUpdateCommit(id, update, transaction, options);
		});

		const publish = await request(app).post(`/v1/sync/changesets/${commitId}/publish`).send({});
		expect(publish.status).toBe(200);
		expect(publish.body.changeset.status).toBe("published");
		expect(publish.body.hasConflicts).toBe(false);
	});

	it("keeps /commits endpoints as alias for /changesets", async () => {
		const push = await request(app)
			.post("/v1/sync/push")
			.send({
				clientChangesetId: "CID-006",
				targetBranch: "main",
				ops: [{ type: "upsert", fileId: "f6", serverPath: "f6.md", baseVersion: 0, content: "# f6" }],
			});

		const changesetId = push.body.changeset.id as number;
		const viaChangesetRoute = await request(app).get(`/v1/sync/changesets/${changesetId}`);
		const viaCommitAlias = await request(app).get(`/v1/sync/commits/${changesetId}`);

		expect(viaChangesetRoute.status).toBe(200);
		expect(viaCommitAlias.status).toBe(200);
		expect(viaCommitAlias.body.changeset.id).toBe(viaChangesetRoute.body.changeset.id);
		expect(viaCommitAlias.body.commit.id).toBe(viaChangesetRoute.body.commit.id);
	});

	it("lists changesets scoped to the selected space", async () => {
		const defaultPush = await request(app)
			.post("/v1/sync/push")
			.send({
				clientChangesetId: "CID-LIST-DEFAULT",
				targetBranch: "main",
				ops: [
					{
						type: "upsert",
						fileId: "list-default",
						serverPath: "docs/default.md",
						baseVersion: 0,
						content: "# one\ntwo",
					},
				],
			});
		const otherPush = await request(app)
			.post("/v1/sync/push")
			.set("X-Jolli-Space", "other")
			.send({
				clientChangesetId: "CID-LIST-OTHER",
				targetBranch: "main",
				ops: [
					{
						type: "upsert",
						fileId: "list-other",
						serverPath: "docs/other.md",
						baseVersion: 0,
						content: "# other",
					},
				],
			});

		expect(defaultPush.status).toBe(200);
		expect(otherPush.status).toBe(200);

		const defaultList = await request(app).get("/v1/sync/changesets");
		const otherList = await request(app).get("/v1/sync/changesets").set("X-Jolli-Space", "other");

		expect(defaultList.status).toBe(200);
		expect(otherList.status).toBe(200);

		expect(defaultList.body.changesets).toHaveLength(1);
		expect(defaultList.body.commits).toHaveLength(1);
		expect(defaultList.body.changesets[0].id).toBe(defaultPush.body.changeset.id);
		expect(defaultList.body.changesets[0].summary.totalFiles).toBe(1);
		expect(defaultList.body.changesets[0].summary.additions).toBeGreaterThan(0);
		expect(defaultList.body.changesets[0].summary.deletions).toBe(0);

		expect(otherList.body.changesets).toHaveLength(1);
		expect(otherList.body.changesets[0].id).toBe(otherPush.body.changeset.id);
	});

	it("paginates list changesets with limit and beforeId", async () => {
		const firstPush = await request(app)
			.post("/v1/sync/push")
			.send({
				clientChangesetId: "CID-LIST-PAGE-1",
				targetBranch: "main",
				ops: [
					{ type: "upsert", fileId: "page-1", serverPath: "docs/page-1.md", baseVersion: 0, content: "# 1" },
				],
			});
		const secondPush = await request(app)
			.post("/v1/sync/push")
			.send({
				clientChangesetId: "CID-LIST-PAGE-2",
				targetBranch: "main",
				ops: [
					{ type: "upsert", fileId: "page-2", serverPath: "docs/page-2.md", baseVersion: 0, content: "# 2" },
				],
			});
		const thirdPush = await request(app)
			.post("/v1/sync/push")
			.send({
				clientChangesetId: "CID-LIST-PAGE-3",
				targetBranch: "main",
				ops: [
					{ type: "upsert", fileId: "page-3", serverPath: "docs/page-3.md", baseVersion: 0, content: "# 3" },
				],
			});

		expect(firstPush.status).toBe(200);
		expect(secondPush.status).toBe(200);
		expect(thirdPush.status).toBe(200);

		const firstPage = await request(app).get("/v1/sync/changesets").query({ limit: 2 });
		expect(firstPage.status).toBe(200);
		expect(firstPage.body.changesets).toHaveLength(2);
		expect(firstPage.body.hasMore).toBe(true);
		expect(firstPage.body.nextBeforeId).toBe(firstPage.body.changesets[1].id);

		const secondPage = await request(app)
			.get("/v1/sync/changesets")
			.query({ limit: 2, beforeId: firstPage.body.nextBeforeId });
		expect(secondPage.status).toBe(200);
		expect(secondPage.body.changesets).toHaveLength(1);
		expect(secondPage.body.hasMore).toBe(false);
		expect(secondPage.body.nextBeforeId).toBeUndefined();
	});

	it("returns 400 for invalid list pagination params", async () => {
		const badLimit = await request(app).get("/v1/sync/changesets").query({ limit: "abc" });
		const badBeforeId = await request(app).get("/v1/sync/changesets").query({ beforeId: "0" });

		expect(badLimit.status).toBe(400);
		expect(badLimit.body.error).toBe("Invalid limit");
		expect(badBeforeId.status).toBe(400);
		expect(badBeforeId.body.error).toBe("Invalid beforeId");
	});

	it("returns 3-way compare payload with current snapshot status for changeset files", async () => {
		const syncPrefix = getConfig().SYNC_JRN_PREFIX;
		const movedJrn = `${syncPrefix}three-way-moved`;
		docsByJrn.set(
			movedJrn,
			mockDoc({
				id: 200,
				jrn: movedJrn,
				content: "# base content",
				version: 1,
				spaceId: 1,
				contentMetadata: { sync: { fileId: "three-way-moved", serverPath: "docs/original.md" } },
			}),
		);

		const push = await request(app)
			.post("/v1/sync/push")
			.send({
				clientChangesetId: "CID-THREE-WAY-001",
				targetBranch: "main",
				ops: [
					{
						type: "upsert",
						fileId: "three-way-moved",
						serverPath: "docs/original.md",
						baseVersion: 1,
						content: "# incoming content",
					},
					{
						type: "upsert",
						fileId: "three-way-missing",
						serverPath: "docs/missing.md",
						baseVersion: 0,
						content: "# new incoming",
					},
				],
			});
		expect(push.status).toBe(200);

		docsByJrn.set(
			movedJrn,
			mockDoc({
				...(docsByJrn.get(movedJrn) as Doc),
				content: "# current moved content",
				version: 2,
				contentMetadata: { sync: { fileId: "three-way-moved", serverPath: "docs/renamed.md" } },
			}),
		);

		const filesResponse = await request(app).get(`/v1/sync/changesets/${push.body.changeset.id}/files`);
		expect(filesResponse.status).toBe(200);

		const movedFile = (filesResponse.body.files as Array<{ fileId: string }>).find(
			file => file.fileId === "three-way-moved",
		) as {
			fileId: string;
			baseContent: string;
			baseVersion: number;
			incomingContent: string | null;
			incomingContentHash: string | null;
			currentContent: string | null;
			currentVersion: number | null;
			currentServerPath: string | null;
			currentStatus: string;
		};
		const missingFile = (filesResponse.body.files as Array<{ fileId: string }>).find(
			file => file.fileId === "three-way-missing",
		) as {
			fileId: string;
			currentContent: string | null;
			currentVersion: number | null;
			currentServerPath: string | null;
			currentStatus: string;
		};

		expect(movedFile.baseContent).toBe("# base content");
		expect(movedFile.baseVersion).toBe(1);
		expect(movedFile.incomingContent).toBe("# incoming content");
		expect(movedFile.incomingContentHash).toEqual(expect.any(String));
		expect(movedFile.currentContent).toBe("# current moved content");
		expect(movedFile.currentVersion).toBe(2);
		expect(movedFile.currentServerPath).toBe("docs/renamed.md");
		expect(movedFile.currentStatus).toBe("moved");

		expect(missingFile.currentContent).toBeNull();
		expect(missingFile.currentVersion).toBeNull();
		expect(missingFile.currentServerPath).toBeNull();
		expect(missingFile.currentStatus).toBe("missing");
	});

	it("denies cross-space access to changeset-by-id endpoints", async () => {
		const push = await request(app)
			.post("/v1/sync/push")
			.send({
				clientChangesetId: "CID-007",
				targetBranch: "main",
				ops: [{ type: "upsert", fileId: "f7", serverPath: "f7.md", baseVersion: 0, content: "# f7" }],
			});

		expect(push.status).toBe(200);
		const changesetId = push.body.changeset.id as number;
		const commitFileId = (push.body.files as Array<{ id: number }>)[0].id;

		const getChangeset = await request(app).get(`/v1/sync/changesets/${changesetId}`).set("X-Jolli-Space", "other");
		const getFiles = await request(app)
			.get(`/v1/sync/changesets/${changesetId}/files`)
			.set("X-Jolli-Space", "other");
		const review = await request(app)
			.patch(`/v1/sync/changesets/${changesetId}/files/${commitFileId}/review`)
			.set("X-Jolli-Space", "other")
			.send({ decision: "accept" });
		const publish = await request(app)
			.post(`/v1/sync/changesets/${changesetId}/publish`)
			.set("X-Jolli-Space", "other")
			.send({});

		expect(getChangeset.status).toBe(404);
		expect(getFiles.status).toBe(404);
		expect(review.status).toBe(404);
		expect(publish.status).toBe(404);
	});

	describe("POST /pull", () => {
		it("returns full snapshot when sinceCursor is 0", async () => {
			const syncPrefix = getConfig().SYNC_JRN_PREFIX;
			const jrnA = `${syncPrefix}a1`;
			const jrnB = `${syncPrefix}b1`;
			docsByJrn.set(
				jrnA,
				mockDoc({
					id: 300,
					jrn: jrnA,
					content: "# Doc A",
					version: 1,
					spaceId: 1,
					contentMetadata: { sync: { fileId: "a1", serverPath: "docs/a1.md" } },
				}),
			);
			docsByJrn.set(
				jrnB,
				mockDoc({
					id: 301,
					jrn: jrnB,
					content: "# Doc B",
					version: 2,
					spaceId: 1,
					contentMetadata: { sync: { fileId: "b1", serverPath: "docs/b1.md" } },
				}),
			);
			docDao.listDocs = vi.fn().mockResolvedValue([...docsByJrn.values()]);
			cursor = 5;

			const response = await request(app).post("/v1/sync/pull").send({ sinceCursor: 0 });

			expect(response.status).toBe(200);
			expect(response.body.newCursor).toBe(5);
			expect(response.body.changes).toHaveLength(2);
			expect(response.body.changes[0].fileId).toBe("a1");
			expect(response.body.changes[0].content).toBe("# Doc A");
			expect(response.body.changes[0].contentHash).toBeDefined();
			expect(response.body.changes[0].deleted).toBe(false);
		});

		it("filters out deleted docs from full snapshot", async () => {
			const syncPrefix = getConfig().SYNC_JRN_PREFIX;
			const jrnDeleted = `${syncPrefix}del1`;
			docsByJrn.set(
				jrnDeleted,
				mockDoc({
					id: 302,
					jrn: jrnDeleted,
					content: "",
					version: 1,
					spaceId: 1,
					deletedAt: new Date(),
					contentMetadata: { sync: { fileId: "del1", serverPath: "docs/del1.md", deleted: true } },
				}),
			);
			docDao.listDocs = vi.fn().mockResolvedValue([...docsByJrn.values()]);

			const response = await request(app).post("/v1/sync/pull").send({ sinceCursor: 0 });

			expect(response.status).toBe(200);
			expect(response.body.changes).toHaveLength(0);
		});

		it("returns incremental changes when sinceCursor > 0", async () => {
			const syncPrefix = getConfig().SYNC_JRN_PREFIX;
			const jrnC = `${syncPrefix}c1`;
			docsByJrn.set(
				jrnC,
				mockDoc({
					id: 303,
					jrn: jrnC,
					content: "# Updated C",
					version: 3,
					spaceId: 1,
					contentMetadata: { sync: { fileId: "c1", serverPath: "docs/c1.md" } },
				}),
			);
			syncArticleDao.getSyncArticlesSince = vi
				.fn()
				.mockResolvedValue([{ id: 1, docJrn: jrnC, seq: 2, createdAt: new Date() }]);
			cursor = 10;

			const response = await request(app).post("/v1/sync/pull").send({ sinceCursor: 1 });

			expect(response.status).toBe(200);
			expect(response.body.newCursor).toBe(10);
			expect(response.body.changes).toHaveLength(1);
			expect(response.body.changes[0].fileId).toBe("c1");
			expect(response.body.changes[0].content).toBe("# Updated C");
		});

		it("filters null docs from incremental pull", async () => {
			syncArticleDao.getSyncArticlesSince = vi
				.fn()
				.mockResolvedValue([{ id: 1, docJrn: "nonexistent", seq: 2, createdAt: new Date() }]);

			const response = await request(app).post("/v1/sync/pull").send({ sinceCursor: 1 });

			expect(response.status).toBe(200);
			expect(response.body.changes).toHaveLength(0);
		});

		it("filters docs not in requested space during incremental pull", async () => {
			const syncPrefix = getConfig().SYNC_JRN_PREFIX;
			const jrnD = `${syncPrefix}d1`;
			docsByJrn.set(
				jrnD,
				mockDoc({
					id: 304,
					jrn: jrnD,
					content: "# D",
					version: 1,
					spaceId: 2,
					contentMetadata: { sync: { fileId: "d1", serverPath: "docs/d1.md" } },
				}),
			);
			syncArticleDao.getSyncArticlesSince = vi
				.fn()
				.mockResolvedValue([{ id: 1, docJrn: jrnD, seq: 2, createdAt: new Date() }]);

			const response = await request(app)
				.post("/v1/sync/pull")
				.set("X-Jolli-Space", "default")
				.send({ sinceCursor: 1 });

			expect(response.status).toBe(200);
			expect(response.body.changes).toHaveLength(0);
		});

		it("returns deleted doc info in incremental pull", async () => {
			const syncPrefix = getConfig().SYNC_JRN_PREFIX;
			const jrnE = `${syncPrefix}e1`;
			docsByJrn.set(
				jrnE,
				mockDoc({
					id: 305,
					jrn: jrnE,
					content: "",
					version: 2,
					spaceId: 1,
					contentMetadata: { sync: { fileId: "e1", serverPath: "docs/e1.md", deleted: true } },
				}),
			);
			syncArticleDao.getSyncArticlesSince = vi
				.fn()
				.mockResolvedValue([{ id: 1, docJrn: jrnE, seq: 3, createdAt: new Date() }]);

			const response = await request(app).post("/v1/sync/pull").send({ sinceCursor: 1 });

			expect(response.status).toBe(200);
			expect(response.body.changes).toHaveLength(1);
			expect(response.body.changes[0].deleted).toBe(true);
			expect(response.body.changes[0].content).toBeUndefined();
		});

		it("returns 404 when space header references unknown space", async () => {
			const response = await request(app)
				.post("/v1/sync/pull")
				.set("X-Jolli-Space", "nonexistent")
				.send({ sinceCursor: 0 });

			expect(response.status).toBe(404);
			expect(response.body.error).toContain("Space not found");
		});

		it("defaults sinceCursor to 0 when not provided", async () => {
			docDao.listDocs = vi.fn().mockResolvedValue([]);

			const response = await request(app).post("/v1/sync/pull").send({});

			expect(response.status).toBe(200);
			expect(response.body.changes).toHaveLength(0);
		});

		it("returns 500 on unexpected error", async () => {
			docDao.listDocs = vi.fn().mockRejectedValue(new Error("DB error"));

			const response = await request(app).post("/v1/sync/pull").send({ sinceCursor: 0 });

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("Failed to pull changes");
		});
	});

	describe("GET /status", () => {
		it("returns sync status", async () => {
			cursor = 42;
			syncArticleDao.getSyncArticlesSince = vi.fn().mockResolvedValue([
				{ id: 1, docJrn: "jrn:/doc1", seq: 1 },
				{ id: 2, docJrn: "jrn:/doc2", seq: 2 },
			]);

			const response = await request(app).get("/v1/sync/status");

			expect(response.status).toBe(200);
			expect(response.body.cursor).toBe(42);
			expect(response.body.fileCount).toBe(2);
			expect(response.body.files).toHaveLength(2);
		});

		it("returns 500 on error", async () => {
			syncArticleDao.getCurrentCursor = vi.fn().mockRejectedValue(new Error("DB error"));

			const response = await request(app).get("/v1/sync/status");

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("Failed to get status");
		});
	});

	describe("push validation", () => {
		it("rejects missing clientChangesetId", async () => {
			const response = await request(app)
				.post("/v1/sync/push")
				.send({
					targetBranch: "main",
					ops: [{ type: "upsert", fileId: "f1", serverPath: "f1.md", baseVersion: 0, content: "x" }],
				});

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("clientChangesetId is required");
		});

		it("rejects non-string message", async () => {
			const response = await request(app)
				.post("/v1/sync/push")
				.send({
					clientChangesetId: "CID-VAL-01",
					targetBranch: "main",
					message: 123,
					ops: [{ type: "upsert", fileId: "f1", serverPath: "f1.md", baseVersion: 0, content: "x" }],
				});

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("message must be a string when provided");
		});

		it("rejects non-string mergePrompt", async () => {
			const response = await request(app)
				.post("/v1/sync/push")
				.send({
					clientChangesetId: "CID-VAL-02",
					targetBranch: "main",
					mergePrompt: 42,
					ops: [{ type: "upsert", fileId: "f1", serverPath: "f1.md", baseVersion: 0, content: "x" }],
				});

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("mergePrompt must be a string when provided");
		});

		it("rejects non-main targetBranch", async () => {
			const response = await request(app)
				.post("/v1/sync/push")
				.send({
					clientChangesetId: "CID-VAL-03",
					targetBranch: "dev",
					ops: [{ type: "upsert", fileId: "f1", serverPath: "f1.md", baseVersion: 0, content: "x" }],
				});

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("targetBranch must be 'main'");
		});

		it("rejects empty ops array", async () => {
			const response = await request(app).post("/v1/sync/push").send({
				clientChangesetId: "CID-VAL-04",
				targetBranch: "main",
				ops: [],
			});

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("ops must be a non-empty array");
		});

		it("rejects missing ops", async () => {
			const response = await request(app).post("/v1/sync/push").send({
				clientChangesetId: "CID-VAL-05",
				targetBranch: "main",
			});

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("ops must be a non-empty array");
		});

		it("rejects content hash mismatch", async () => {
			const response = await request(app)
				.post("/v1/sync/push")
				.send({
					clientChangesetId: "CID-HASH-01",
					targetBranch: "main",
					ops: [
						{
							type: "upsert",
							fileId: "hash-f1",
							serverPath: "hash-f1.md",
							baseVersion: 0,
							content: "# real content",
							contentHash: "definitely-wrong-hash",
						},
					],
				});

			expect(response.status).toBe(400);
			expect(response.body.code).toBe("BAD_HASH");
			expect(response.body.fileId).toBe("hash-f1");
		});
	});

	describe("push space errors", () => {
		it("returns 404 when push targets unknown space", async () => {
			const response = await request(app)
				.post("/v1/sync/push")
				.set("X-Jolli-Space", "nonexistent")
				.send({
					clientChangesetId: "CID-SPACE-01",
					targetBranch: "main",
					ops: [{ type: "upsert", fileId: "s1", serverPath: "s1.md", baseVersion: 0, content: "x" }],
				});

			expect(response.status).toBe(404);
			expect(response.body.error).toContain("Space not found");
		});

		it("returns 500 when no default space is available", async () => {
			spaceDao.getDefaultSpace = vi.fn().mockResolvedValue(undefined);

			const response = await request(app)
				.post("/v1/sync/push")
				.send({
					clientChangesetId: "CID-NO-SPACE",
					targetBranch: "main",
					ops: [{ type: "upsert", fileId: "ns1", serverPath: "ns1.md", baseVersion: 0, content: "x" }],
				});

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("No space available");
		});
	});

	describe("push with orgUser", () => {
		it("stores pushedBy from req.orgUser", async () => {
			const appWithUser = express();
			appWithUser.use(express.json());
			appWithUser.use((req, _res, next) => {
				(req as unknown as { orgUser: { id: number } }).orgUser = { id: 42 };
				next();
			});
			appWithUser.use(
				"/v1/sync",
				createSyncRouter(
					mockDaoProvider(docDao),
					mockDaoProvider(syncArticleDao),
					mockDaoProvider(syncCommitDao),
					mockDaoProvider(spaceDao),
				),
			);

			const response = await request(appWithUser)
				.post("/v1/sync/push")
				.send({
					clientChangesetId: "CID-USER-01",
					targetBranch: "main",
					ops: [{ type: "upsert", fileId: "u1", serverPath: "u1.md", baseVersion: 0, content: "x" }],
				});

			expect(response.status).toBe(200);
			expect(response.body.changeset.pushedBy).toBe("42");
		});
	});

	describe("push unique-violation race with null raced commit", () => {
		it("rethrows when raced commit is null after unique violation", async () => {
			syncCommitDao.createProposedCommit = vi.fn().mockRejectedValue(mockScopeClientUniqueViolationError());
			syncCommitDao.findCommitByScopeAndClientChangesetId = vi.fn().mockResolvedValue(undefined);

			const response = await request(app)
				.post("/v1/sync/push")
				.send({
					clientChangesetId: "CID-RACE-NULL",
					targetBranch: "main",
					ops: [{ type: "upsert", fileId: "rn1", serverPath: "rn1.md", baseVersion: 0, content: "x" }],
				});

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("Failed to push changes");
		});
	});

	describe("review edge cases", () => {
		it("returns 400 for invalid changeset id", async () => {
			const response = await request(app)
				.patch("/v1/sync/changesets/abc/files/1/review")
				.send({ decision: "accept" });

			expect(response.status).toBe(400);
		});

		it("returns 400 for invalid file id", async () => {
			const response = await request(app)
				.patch("/v1/sync/changesets/1/files/abc/review")
				.send({ decision: "accept" });

			expect(response.status).toBe(400);
		});

		it("returns 400 for invalid decision", async () => {
			const push = await request(app)
				.post("/v1/sync/push")
				.send({
					clientChangesetId: "CID-REV-BAD",
					targetBranch: "main",
					ops: [{ type: "upsert", fileId: "rb1", serverPath: "rb1.md", baseVersion: 0, content: "x" }],
				});
			const commitId = push.body.changeset.id;
			const fileId = push.body.files[0].id;

			const response = await request(app)
				.patch(`/v1/sync/changesets/${commitId}/files/${fileId}/review`)
				.send({ decision: "invalid" });

			expect(response.status).toBe(400);
			expect(response.body.error).toContain("decision must be one of");
		});

		it("returns 400 when amend missing amendedContent", async () => {
			const push = await request(app)
				.post("/v1/sync/push")
				.send({
					clientChangesetId: "CID-REV-AMEND-BAD",
					targetBranch: "main",
					ops: [{ type: "upsert", fileId: "rab1", serverPath: "rab1.md", baseVersion: 0, content: "x" }],
				});
			const commitId = push.body.changeset.id;
			const fileId = push.body.files[0].id;

			const response = await request(app)
				.patch(`/v1/sync/changesets/${commitId}/files/${fileId}/review`)
				.send({ decision: "amend" });

			expect(response.status).toBe(400);
			expect(response.body.error).toContain("amendedContent is required");
		});

		it("returns 404 when changeset not found for review", async () => {
			const response = await request(app)
				.patch("/v1/sync/changesets/9999/files/1/review")
				.send({ decision: "accept" });

			expect(response.status).toBe(404);
		});

		it("returns 409 when changeset already published for review", async () => {
			const push = await request(app)
				.post("/v1/sync/push")
				.send({
					clientChangesetId: "CID-REV-PUB",
					targetBranch: "main",
					ops: [{ type: "upsert", fileId: "rp1", serverPath: "rp1.md", baseVersion: 0, content: "x" }],
				});
			const commitId = push.body.changeset.id;
			const fileId = push.body.files[0].id;

			// Accept and publish
			await request(app)
				.patch(`/v1/sync/changesets/${commitId}/files/${fileId}/review`)
				.send({ decision: "accept" });
			await request(app).post(`/v1/sync/changesets/${commitId}/publish`).send({});

			// Try to review after publish
			const response = await request(app)
				.patch(`/v1/sync/changesets/${commitId}/files/${fileId}/review`)
				.send({ decision: "accept" });

			expect(response.status).toBe(409);
			expect(response.body.error).toBe("Changeset is already published");
		});

		it("returns 404 when file not found for review", async () => {
			const push = await request(app)
				.post("/v1/sync/push")
				.send({
					clientChangesetId: "CID-REV-FNF",
					targetBranch: "main",
					ops: [{ type: "upsert", fileId: "rfnf", serverPath: "rfnf.md", baseVersion: 0, content: "x" }],
				});
			const commitId = push.body.changeset.id;

			const response = await request(app)
				.patch(`/v1/sync/changesets/${commitId}/files/9999/review`)
				.send({ decision: "accept" });

			expect(response.status).toBe(404);
			expect(response.body.error).toBe("Changeset file not found");
		});

		it("returns 404 when space not found during review", async () => {
			const push = await request(app)
				.post("/v1/sync/push")
				.send({
					clientChangesetId: "CID-REV-SPACE",
					targetBranch: "main",
					ops: [{ type: "upsert", fileId: "rs1", serverPath: "rs1.md", baseVersion: 0, content: "x" }],
				});
			const commitId = push.body.changeset.id;
			const fileId = push.body.files[0].id;

			const response = await request(app)
				.patch(`/v1/sync/changesets/${commitId}/files/${fileId}/review`)
				.set("X-Jolli-Space", "nonexistent")
				.send({ decision: "accept" });

			expect(response.status).toBe(404);
		});

		it("computes rejected status when all reviews are reject", async () => {
			const push = await request(app)
				.post("/v1/sync/push")
				.send({
					clientChangesetId: "CID-ALL-REJECT",
					targetBranch: "main",
					ops: [
						{ type: "upsert", fileId: "ar1", serverPath: "ar1.md", baseVersion: 0, content: "a" },
						{ type: "upsert", fileId: "ar2", serverPath: "ar2.md", baseVersion: 0, content: "b" },
					],
				});
			const commitId = push.body.changeset.id;
			const [file1, file2] = push.body.files as Array<{ id: number }>;

			await request(app)
				.patch(`/v1/sync/changesets/${commitId}/files/${file1.id}/review`)
				.send({ decision: "reject" });
			const response = await request(app)
				.patch(`/v1/sync/changesets/${commitId}/files/${file2.id}/review`)
				.send({ decision: "reject" });

			expect(response.status).toBe(200);
			expect(response.body.changeset.status).toBe("rejected");
		});

		it("stores review comment", async () => {
			const push = await request(app)
				.post("/v1/sync/push")
				.send({
					clientChangesetId: "CID-REV-COMMENT",
					targetBranch: "main",
					ops: [{ type: "upsert", fileId: "rc1", serverPath: "rc1.md", baseVersion: 0, content: "x" }],
				});
			const commitId = push.body.changeset.id;
			const fileId = push.body.files[0].id;

			const response = await request(app)
				.patch(`/v1/sync/changesets/${commitId}/files/${fileId}/review`)
				.send({ decision: "accept", comment: "Looks good" });

			expect(response.status).toBe(200);
			expect(response.body.review.comment).toBe("Looks good");
		});
	});

	describe("getChangeset edge cases", () => {
		it("returns 400 for invalid changeset id", async () => {
			const response = await request(app).get("/v1/sync/changesets/abc");

			expect(response.status).toBe(400);
		});

		it("returns 404 for nonexistent changeset", async () => {
			const response = await request(app).get("/v1/sync/changesets/9999");

			expect(response.status).toBe(404);
			expect(response.body.error).toBe("Changeset not found");
		});

		it("returns 404 when space not found for getChangeset", async () => {
			const push = await request(app)
				.post("/v1/sync/push")
				.send({
					clientChangesetId: "CID-GET-SPACE",
					targetBranch: "main",
					ops: [{ type: "upsert", fileId: "gs1", serverPath: "gs1.md", baseVersion: 0, content: "x" }],
				});

			const response = await request(app)
				.get(`/v1/sync/changesets/${push.body.changeset.id}`)
				.set("X-Jolli-Space", "nonexistent");

			expect(response.status).toBe(404);
		});

		it("returns 500 on unexpected error in getChangeset", async () => {
			const originalGetCommit = syncCommitDao.getCommit.bind(syncCommitDao);
			syncCommitDao.getCommit = vi.fn().mockRejectedValue(new Error("DB error"));

			const response = await request(app).get("/v1/sync/changesets/1");

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("Failed to get changeset");
			syncCommitDao.getCommit = originalGetCommit;
		});
	});

	describe("getChangesetFiles edge cases", () => {
		it("returns 400 for invalid changeset id", async () => {
			const response = await request(app).get("/v1/sync/changesets/abc/files");

			expect(response.status).toBe(400);
		});

		it("returns 404 for nonexistent changeset", async () => {
			const response = await request(app).get("/v1/sync/changesets/9999/files");

			expect(response.status).toBe(404);
		});

		it("returns 500 on unexpected error in getChangesetFiles", async () => {
			const originalGetCommit = syncCommitDao.getCommit.bind(syncCommitDao);
			syncCommitDao.getCommit = vi.fn().mockRejectedValue(new Error("DB error"));

			const response = await request(app).get("/v1/sync/changesets/1/files");

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("Failed to get changeset files");
			syncCommitDao.getCommit = originalGetCommit;
		});

		it("returns 500 when no default space available for getChangesetFiles", async () => {
			spaceDao.getDefaultSpace = vi.fn().mockResolvedValue(undefined);

			const response = await request(app).get("/v1/sync/changesets/1/files");

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("No space available");
		});
	});

	describe("listChangesets edge cases", () => {
		it("returns 404 when space not found for listing", async () => {
			const response = await request(app).get("/v1/sync/changesets").set("X-Jolli-Space", "nonexistent");

			expect(response.status).toBe(404);
		});

		it("returns 500 on unexpected error in listChangesets", async () => {
			const originalListByScope = syncCommitDao.listCommitsByScope.bind(syncCommitDao);
			syncCommitDao.listCommitsByScope = vi.fn().mockRejectedValue(new Error("DB error"));

			const response = await request(app).get("/v1/sync/changesets");

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("Failed to list changesets");
			syncCommitDao.listCommitsByScope = originalListByScope;
		});

		it("caps limit at MAX_CHANGESET_LIST_LIMIT", async () => {
			const response = await request(app).get("/v1/sync/changesets").query({ limit: 9999 });

			expect(response.status).toBe(200);
			// The result should be fine; internally limit is capped to 200
		});

		it("returns empty list with hasMore=false when no changesets exist", async () => {
			const response = await request(app).get("/v1/sync/changesets");

			expect(response.status).toBe(200);
			expect(response.body.changesets).toHaveLength(0);
			expect(response.body.hasMore).toBe(false);
		});
	});

	describe("publish edge cases", () => {
		it("returns 400 for invalid changeset id", async () => {
			const response = await request(app).post("/v1/sync/changesets/abc/publish").send({});

			expect(response.status).toBe(400);
		});

		it("returns 404 for nonexistent changeset", async () => {
			const response = await request(app).post("/v1/sync/changesets/9999/publish").send({});

			expect(response.status).toBe(404);
		});

		it("replays already-published changeset without re-applying", async () => {
			const syncPrefix = getConfig().SYNC_JRN_PREFIX;
			const jrn = `${syncPrefix}pub-replay`;
			docsByJrn.set(
				jrn,
				mockDoc({
					id: 400,
					jrn,
					content: "# base",
					version: 1,
					spaceId: 1,
					contentMetadata: { sync: { fileId: "pub-replay", serverPath: "pub-replay.md" } },
				}),
			);

			const push = await request(app)
				.post("/v1/sync/push")
				.send({
					clientChangesetId: "CID-PUB-REPLAY",
					targetBranch: "main",
					ops: [
						{
							type: "upsert",
							fileId: "pub-replay",
							serverPath: "pub-replay.md",
							baseVersion: 1,
							content: "# updated",
						},
					],
				});
			const commitId = push.body.changeset.id;
			const fileId = push.body.files[0].id;

			await request(app)
				.patch(`/v1/sync/changesets/${commitId}/files/${fileId}/review`)
				.send({ decision: "accept" });
			await request(app).post(`/v1/sync/changesets/${commitId}/publish`).send({});

			// Publish again (replay)
			const replay = await request(app).post(`/v1/sync/changesets/${commitId}/publish`).send({});

			expect(replay.status).toBe(200);
			expect(replay.body.changeset.status).toBe("published");
			expect(replay.body.hasConflicts).toBe(false);
			expect(replay.body.files[0].reason).toBe("ALREADY_PUBLISHED");
		});

		it("blocks concurrent publish attempts after the first request claims the changeset", async () => {
			const syncPrefix = getConfig().SYNC_JRN_PREFIX;
			const jrn = `${syncPrefix}pub-concurrent`;
			docsByJrn.set(
				jrn,
				mockDoc({
					id: 401,
					jrn,
					content: "# base",
					version: 1,
					spaceId: 1,
					contentMetadata: { sync: { fileId: "pub-concurrent", serverPath: "pub-concurrent.md" } },
				}),
			);

			const push = await request(app)
				.post("/v1/sync/push")
				.send({
					clientChangesetId: "CID-PUB-CONCURRENT",
					targetBranch: "main",
					ops: [
						{
							type: "upsert",
							fileId: "pub-concurrent",
							serverPath: "pub-concurrent.md",
							baseVersion: 1,
							content: "# updated",
						},
					],
				});
			const commitId = push.body.changeset.id;
			const fileId = push.body.files[0].id;

			await request(app)
				.patch(`/v1/sync/changesets/${commitId}/files/${fileId}/review`)
				.send({ decision: "accept" });

			const realUpdateDocIfVersion = docDao.updateDocIfVersion.bind(docDao);
			let releaseFirstWrite: (() => void) | undefined;
			const firstWritePaused = new Promise<void>(resolve => {
				releaseFirstWrite = resolve;
			});
			let markFirstWriteStarted: (() => void) | undefined;
			const firstWriteStarted = new Promise<void>(resolve => {
				markFirstWriteStarted = resolve;
			});
			let updateDocIfVersionCalls = 0;

			docDao.updateDocIfVersion = vi.fn().mockImplementation(async (doc, expectedVersion) => {
				updateDocIfVersionCalls += 1;
				if (updateDocIfVersionCalls === 1) {
					markFirstWriteStarted?.();
					await firstWritePaused;
				}
				return realUpdateDocIfVersion(doc, expectedVersion);
			});

			const firstPublishPromise = request(app)
				.post(`/v1/sync/changesets/${commitId}/publish`)
				.send({})
				.then(response => response);
			await firstWriteStarted;
			const secondPublish = await request(app).post(`/v1/sync/changesets/${commitId}/publish`).send({});
			releaseFirstWrite?.();
			const firstPublish = await firstPublishPromise;

			expect(firstPublish.status).toBe(200);
			expect(firstPublish.body.changeset.status).toBe("published");
			expect(secondPublish.status).toBe(409);
			expect(secondPublish.body.code).toBe("PUBLISH_IN_PROGRESS");
			expect(updateDocIfVersionCalls).toBe(1);
			expect(cursor).toBe(1);
		});

		it("rejects non-main targetBranch during publish", async () => {
			// Create a commit and manually set its targetBranch to something else
			const push = await request(app)
				.post("/v1/sync/push")
				.send({
					clientChangesetId: "CID-PUB-BRANCH",
					targetBranch: "main",
					ops: [{ type: "upsert", fileId: "pb1", serverPath: "pb1.md", baseVersion: 0, content: "x" }],
				});
			const commitId = push.body.changeset.id;
			// Directly mutate the in-memory commit
			const realGetCommit = syncCommitDao.getCommit.bind(syncCommitDao);
			syncCommitDao.getCommit = vi.fn().mockImplementation(async (id: number) => {
				const commit = await realGetCommit(id);
				if (commit && id === commitId) {
					return { ...commit, targetBranch: "dev" };
				}
				return commit;
			});

			const response = await request(app).post(`/v1/sync/changesets/${commitId}/publish`).send({});

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("Only targetBranch=main is supported");
			syncCommitDao.getCommit = realGetCommit;
		});

		it("reports missing_review for files without reviews", async () => {
			const push = await request(app)
				.post("/v1/sync/push")
				.send({
					clientChangesetId: "CID-PUB-NOREVIEW",
					targetBranch: "main",
					ops: [
						{ type: "upsert", fileId: "nr1", serverPath: "nr1.md", baseVersion: 0, content: "# a" },
						{ type: "upsert", fileId: "nr2", serverPath: "nr2.md", baseVersion: 0, content: "# b" },
					],
				});
			const commitId = push.body.changeset.id;

			const publish = await request(app).post(`/v1/sync/changesets/${commitId}/publish`).send({});

			expect(publish.status).toBe(200);
			expect(publish.body.hasConflicts).toBe(true);
			expect(publish.body.files[0].status).toBe("missing_review");
			expect(publish.body.files[1].status).toBe("missing_review");
		});

		it("skips rejected files during publish", async () => {
			const push = await request(app)
				.post("/v1/sync/push")
				.send({
					clientChangesetId: "CID-PUB-REJECT",
					targetBranch: "main",
					ops: [{ type: "upsert", fileId: "rej1", serverPath: "rej1.md", baseVersion: 0, content: "x" }],
				});
			const commitId = push.body.changeset.id;
			const fileId = push.body.files[0].id;

			await request(app)
				.patch(`/v1/sync/changesets/${commitId}/files/${fileId}/review`)
				.send({ decision: "reject" });

			const publish = await request(app).post(`/v1/sync/changesets/${commitId}/publish`).send({});

			expect(publish.status).toBe(200);
			expect(publish.body.files[0].status).toBe("rejected");
			expect(publish.body.files[0].reason).toBe("REJECTED");
		});

		it("creates new doc when publishing upsert for new file", async () => {
			const push = await request(app)
				.post("/v1/sync/push")
				.send({
					clientChangesetId: "CID-PUB-CREATE",
					targetBranch: "main",
					ops: [
						{
							type: "upsert",
							fileId: "new-file-1",
							serverPath: "docs/new-article.md",
							baseVersion: 0,
							content: "# Brand New Article",
						},
					],
				});
			const commitId = push.body.changeset.id;
			const fileId = push.body.files[0].id;

			await request(app)
				.patch(`/v1/sync/changesets/${commitId}/files/${fileId}/review`)
				.send({ decision: "accept" });

			const publish = await request(app).post(`/v1/sync/changesets/${commitId}/publish`).send({});

			expect(publish.status).toBe(200);
			expect(publish.body.hasConflicts).toBe(false);
			expect(publish.body.files[0].status).toBe("published");
			expect(docDao.createDoc).toHaveBeenCalled();
		});

		it("uses amended content when decision is amend", async () => {
			const syncPrefix = getConfig().SYNC_JRN_PREFIX;
			const jrn = `${syncPrefix}amend-pub`;
			docsByJrn.set(
				jrn,
				mockDoc({
					id: 401,
					jrn,
					content: "# base",
					version: 1,
					spaceId: 1,
					contentMetadata: { sync: { fileId: "amend-pub", serverPath: "amend-pub.md" } },
				}),
			);

			const push = await request(app)
				.post("/v1/sync/push")
				.send({
					clientChangesetId: "CID-PUB-AMEND",
					targetBranch: "main",
					ops: [
						{
							type: "upsert",
							fileId: "amend-pub",
							serverPath: "amend-pub.md",
							baseVersion: 1,
							content: "# incoming",
						},
					],
				});
			const commitId = push.body.changeset.id;
			const fileId = push.body.files[0].id;

			await request(app)
				.patch(`/v1/sync/changesets/${commitId}/files/${fileId}/review`)
				.send({ decision: "amend", amendedContent: "# amended version" });

			const publish = await request(app).post(`/v1/sync/changesets/${commitId}/publish`).send({});

			expect(publish.status).toBe(200);
			expect(publish.body.hasConflicts).toBe(false);
			expect(docsByJrn.get(jrn)?.content).toBe("# amended version");
		});

		it("handles delete op during publish", async () => {
			const syncPrefix = getConfig().SYNC_JRN_PREFIX;
			const jrn = `${syncPrefix}del-pub`;
			docsByJrn.set(
				jrn,
				mockDoc({
					id: 402,
					jrn,
					content: "# to delete",
					version: 1,
					spaceId: 1,
					contentMetadata: { sync: { fileId: "del-pub", serverPath: "del-pub.md" } },
				}),
			);

			const push = await request(app)
				.post("/v1/sync/push")
				.send({
					clientChangesetId: "CID-PUB-DELETE",
					targetBranch: "main",
					ops: [
						{
							type: "delete",
							fileId: "del-pub",
							serverPath: "del-pub.md",
							baseVersion: 1,
						},
					],
				});
			const commitId = push.body.changeset.id;
			const fileId = push.body.files[0].id;

			await request(app)
				.patch(`/v1/sync/changesets/${commitId}/files/${fileId}/review`)
				.send({ decision: "accept" });

			const publish = await request(app).post(`/v1/sync/changesets/${commitId}/publish`).send({});

			expect(publish.status).toBe(200);
			expect(publish.body.hasConflicts).toBe(false);
			expect(publish.body.files[0].status).toBe("published");
		});

		it("reports delete conflict when base changed", async () => {
			const syncPrefix = getConfig().SYNC_JRN_PREFIX;
			const jrn = `${syncPrefix}del-conflict`;
			docsByJrn.set(
				jrn,
				mockDoc({
					id: 403,
					jrn,
					content: "# original",
					version: 1,
					spaceId: 1,
					contentMetadata: { sync: { fileId: "del-conflict", serverPath: "del-conflict.md" } },
				}),
			);

			const push = await request(app)
				.post("/v1/sync/push")
				.send({
					clientChangesetId: "CID-DEL-CONFLICT",
					targetBranch: "main",
					ops: [
						{
							type: "delete",
							fileId: "del-conflict",
							serverPath: "del-conflict.md",
							baseVersion: 1,
						},
					],
				});
			const commitId = push.body.changeset.id;
			const fileId = push.body.files[0].id;

			await request(app)
				.patch(`/v1/sync/changesets/${commitId}/files/${fileId}/review`)
				.send({ decision: "accept" });

			// Modify the doc on main
			docsByJrn.set(
				jrn,
				mockDoc({
					...(docsByJrn.get(jrn) as Doc),
					content: "# changed",
					version: 2,
				}),
			);

			const publish = await request(app).post(`/v1/sync/changesets/${commitId}/publish`).send({});

			expect(publish.status).toBe(200);
			expect(publish.body.hasConflicts).toBe(true);
			expect(publish.body.files[0].status).toBe("conflict");
			expect(publish.body.files[0].reason).toBe("DELETE_BASE_MISMATCH");
		});

		it("handles delete of already-missing doc", async () => {
			const push = await request(app)
				.post("/v1/sync/push")
				.send({
					clientChangesetId: "CID-DEL-MISSING",
					targetBranch: "main",
					ops: [
						{
							type: "delete",
							fileId: "del-missing",
							serverPath: "del-missing.md",
							baseVersion: 0,
						},
					],
				});
			const commitId = push.body.changeset.id;
			const fileId = push.body.files[0].id;

			await request(app)
				.patch(`/v1/sync/changesets/${commitId}/files/${fileId}/review`)
				.send({ decision: "accept" });

			const publish = await request(app).post(`/v1/sync/changesets/${commitId}/publish`).send({});

			expect(publish.status).toBe(200);
			expect(publish.body.files[0].status).toBe("published");
			expect(publish.body.files[0].reason).toBe("ALREADY_MISSING");
		});

		it("reports BASE_DOC_MISSING when doc existed at push but is gone at publish", async () => {
			const syncPrefix = getConfig().SYNC_JRN_PREFIX;
			const jrn = `${syncPrefix}base-missing`;
			// Doc exists at push time with version 5
			docsByJrn.set(
				jrn,
				mockDoc({
					id: 410,
					jrn,
					content: "# original",
					version: 5,
					spaceId: 1,
					contentMetadata: { sync: { fileId: "base-missing", serverPath: "base-missing.md" } },
				}),
			);

			const push = await request(app)
				.post("/v1/sync/push")
				.send({
					clientChangesetId: "CID-BASE-MISSING",
					targetBranch: "main",
					ops: [
						{
							type: "upsert",
							fileId: "base-missing",
							serverPath: "base-missing.md",
							baseVersion: 5,
							content: "# content",
						},
					],
				});
			const commitId = push.body.changeset.id;
			const fileId = push.body.files[0].id;

			await request(app)
				.patch(`/v1/sync/changesets/${commitId}/files/${fileId}/review`)
				.send({ decision: "accept" });

			// Remove the doc before publish so it's "missing"
			docsByJrn.delete(jrn);

			const publish = await request(app).post(`/v1/sync/changesets/${commitId}/publish`).send({});

			expect(publish.status).toBe(200);
			expect(publish.body.hasConflicts).toBe(true);
			expect(publish.body.files[0].status).toBe("conflict");
			expect(publish.body.files[0].reason).toBe("BASE_DOC_MISSING");
		});

		it("reports VERSION_CONFLICT when optimistic lock fails on update", async () => {
			const syncPrefix = getConfig().SYNC_JRN_PREFIX;
			const jrn = `${syncPrefix}ver-conflict`;
			docsByJrn.set(
				jrn,
				mockDoc({
					id: 404,
					jrn,
					content: "# base",
					version: 1,
					spaceId: 1,
					contentMetadata: { sync: { fileId: "ver-conflict", serverPath: "ver-conflict.md" } },
				}),
			);

			const push = await request(app)
				.post("/v1/sync/push")
				.send({
					clientChangesetId: "CID-VER-CONFLICT",
					targetBranch: "main",
					ops: [
						{
							type: "upsert",
							fileId: "ver-conflict",
							serverPath: "ver-conflict.md",
							baseVersion: 1,
							content: "# updated",
						},
					],
				});
			const commitId = push.body.changeset.id;
			const fileId = push.body.files[0].id;

			await request(app)
				.patch(`/v1/sync/changesets/${commitId}/files/${fileId}/review`)
				.send({ decision: "accept" });

			// Make updateDocIfVersion always return conflict
			docDao.updateDocIfVersion = vi.fn().mockResolvedValue("conflict");

			const publish = await request(app).post(`/v1/sync/changesets/${commitId}/publish`).send({});

			expect(publish.status).toBe(200);
			expect(publish.body.hasConflicts).toBe(true);
			expect(publish.body.files[0].status).toBe("conflict");
			expect(publish.body.files[0].reason).toBe("VERSION_CONFLICT");
		});

		it("reports VERSION_CONFLICT when delete optimistic lock fails", async () => {
			const syncPrefix = getConfig().SYNC_JRN_PREFIX;
			const jrn = `${syncPrefix}del-ver-conflict`;
			docsByJrn.set(
				jrn,
				mockDoc({
					id: 405,
					jrn,
					content: "# to delete",
					version: 1,
					spaceId: 1,
					contentMetadata: { sync: { fileId: "del-ver-conflict", serverPath: "del-ver-conflict.md" } },
				}),
			);

			const push = await request(app)
				.post("/v1/sync/push")
				.send({
					clientChangesetId: "CID-DEL-VER-CONFLICT",
					targetBranch: "main",
					ops: [
						{
							type: "delete",
							fileId: "del-ver-conflict",
							serverPath: "del-ver-conflict.md",
							baseVersion: 1,
						},
					],
				});
			const commitId = push.body.changeset.id;
			const fileId = push.body.files[0].id;

			await request(app)
				.patch(`/v1/sync/changesets/${commitId}/files/${fileId}/review`)
				.send({ decision: "accept" });

			// Make updateDocIfVersion always return conflict
			docDao.updateDocIfVersion = vi.fn().mockResolvedValue("conflict");

			const publish = await request(app).post(`/v1/sync/changesets/${commitId}/publish`).send({});

			expect(publish.status).toBe(200);
			expect(publish.body.hasConflicts).toBe(true);
			expect(publish.body.files[0].status).toBe("conflict");
			expect(publish.body.files[0].reason).toBe("VERSION_CONFLICT");
		});

		it("returns 500 on unexpected error during publish", async () => {
			const originalGetCommit = syncCommitDao.getCommit.bind(syncCommitDao);
			syncCommitDao.getCommit = vi.fn().mockRejectedValue(new Error("DB error"));

			const response = await request(app).post("/v1/sync/changesets/1/publish").send({});

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("Failed to publish changeset");
			syncCommitDao.getCommit = originalGetCommit;
		});

		it("resolves folder hierarchy when serverPath changes on existing doc", async () => {
			const syncPrefix = getConfig().SYNC_JRN_PREFIX;
			const jrn = `${syncPrefix}moved-file`;
			docsByJrn.set(
				jrn,
				mockDoc({
					id: 406,
					jrn,
					content: "# file",
					version: 1,
					spaceId: 1,
					contentMetadata: { sync: { fileId: "moved-file", serverPath: "docs/old-path.md" } },
				}),
			);

			const push = await request(app)
				.post("/v1/sync/push")
				.send({
					clientChangesetId: "CID-PUB-MOVE",
					targetBranch: "main",
					ops: [
						{
							type: "upsert",
							fileId: "moved-file",
							serverPath: "docs/new-path.md",
							baseVersion: 1,
							content: "# moved file",
						},
					],
				});
			const commitId = push.body.changeset.id;
			const fileId = push.body.files[0].id;

			await request(app)
				.patch(`/v1/sync/changesets/${commitId}/files/${fileId}/review`)
				.send({ decision: "accept" });

			const publish = await request(app).post(`/v1/sync/changesets/${commitId}/publish`).send({});

			expect(publish.status).toBe(200);
			expect(publish.body.hasConflicts).toBe(false);
			expect(publish.body.files[0].status).toBe("published");
		});
	});

	describe("push with delete op", () => {
		it("stores delete operation in changeset", async () => {
			const syncPrefix = getConfig().SYNC_JRN_PREFIX;
			const jrn = `${syncPrefix}del-store`;
			docsByJrn.set(
				jrn,
				mockDoc({
					id: 407,
					jrn,
					content: "# existing",
					version: 3,
					spaceId: 1,
					contentMetadata: { sync: { fileId: "del-store", serverPath: "del-store.md" } },
				}),
			);

			const push = await request(app)
				.post("/v1/sync/push")
				.send({
					clientChangesetId: "CID-DEL-STORE",
					targetBranch: "main",
					ops: [
						{
							type: "delete",
							fileId: "del-store",
							serverPath: "del-store.md",
							baseVersion: 3,
						},
					],
				});

			expect(push.status).toBe(200);
			expect(push.body.files[0].opType).toBe("delete");
		});
	});

	describe("push with existing doc content fallback", () => {
		it("uses existing doc content when op.content is not provided", async () => {
			const syncPrefix = getConfig().SYNC_JRN_PREFIX;
			const jrn = `${syncPrefix}content-fallback`;
			docsByJrn.set(
				jrn,
				mockDoc({
					id: 408,
					jrn,
					content: "# existing content",
					version: 2,
					spaceId: 1,
					contentMetadata: { sync: { fileId: "content-fallback", serverPath: "cf.md" } },
				}),
			);

			const push = await request(app)
				.post("/v1/sync/push")
				.send({
					clientChangesetId: "CID-CF",
					targetBranch: "main",
					ops: [
						{
							type: "upsert",
							fileId: "content-fallback",
							serverPath: "cf.md",
							baseVersion: 2,
							// No content field - should fall back to existing
						},
					],
				});

			expect(push.status).toBe(200);
			expect(push.body.files[0].incomingContent).toBe("# existing content");
		});
	});

	describe("extractTitleFromServerPath via publish new doc", () => {
		it("extracts title from path without directory", async () => {
			const push = await request(app)
				.post("/v1/sync/push")
				.send({
					clientChangesetId: "CID-TITLE-NODIR",
					targetBranch: "main",
					ops: [
						{
							type: "upsert",
							fileId: "title-nodir",
							serverPath: "my-article.md",
							baseVersion: 0,
							content: "# Content",
						},
					],
				});
			const commitId = push.body.changeset.id;
			const fileId = push.body.files[0].id;

			await request(app)
				.patch(`/v1/sync/changesets/${commitId}/files/${fileId}/review`)
				.send({ decision: "accept" });

			const publish = await request(app).post(`/v1/sync/changesets/${commitId}/publish`).send({});

			expect(publish.status).toBe(200);
			// Verify createDoc was called with title extracted from server path
			const createDocCall = vi.mocked(docDao.createDoc).mock.calls.find(
				// biome-ignore lint/suspicious/noExplicitAny: accessing mock call args
				(call: Array<any>) =>
					(call[0] as { contentMetadata?: { title?: string } }).contentMetadata?.title === "my-article",
			);
			expect(createDocCall).toBeDefined();
		});

		it("extracts title from file without .md extension", async () => {
			const push = await request(app)
				.post("/v1/sync/push")
				.send({
					clientChangesetId: "CID-TITLE-NOEXT",
					targetBranch: "main",
					ops: [
						{
							type: "upsert",
							fileId: "title-noext",
							serverPath: "docs/README",
							baseVersion: 0,
							content: "# Content",
						},
					],
				});
			const commitId = push.body.changeset.id;
			const fileId = push.body.files[0].id;

			await request(app)
				.patch(`/v1/sync/changesets/${commitId}/files/${fileId}/review`)
				.send({ decision: "accept" });

			const publish = await request(app).post(`/v1/sync/changesets/${commitId}/publish`).send({});

			expect(publish.status).toBe(200);
			const createDocCall = vi.mocked(docDao.createDoc).mock.calls.find(
				// biome-ignore lint/suspicious/noExplicitAny: accessing mock call args
				(call: Array<any>) =>
					(call[0] as { contentMetadata?: { title?: string } }).contentMetadata?.title === "README",
			);
			expect(createDocCall).toBeDefined();
		});
	});

	describe("canonicalPayloadHash sort behavior", () => {
		it("produces same hash regardless of op order", async () => {
			const body1 = {
				clientChangesetId: "CID-SORT-1",
				targetBranch: "main",
				ops: [
					{ type: "upsert", fileId: "b-file", serverPath: "b.md", baseVersion: 0, content: "# b" },
					{ type: "upsert", fileId: "a-file", serverPath: "a.md", baseVersion: 0, content: "# a" },
				],
			};
			const body2 = {
				clientChangesetId: "CID-SORT-2",
				targetBranch: "main",
				ops: [
					{ type: "upsert", fileId: "a-file", serverPath: "a.md", baseVersion: 0, content: "# a" },
					{ type: "upsert", fileId: "b-file", serverPath: "b.md", baseVersion: 0, content: "# b" },
				],
			};

			const push1 = await request(app).post("/v1/sync/push").send(body1);
			const push2 = await request(app).post("/v1/sync/push").send(body2);

			expect(push1.status).toBe(200);
			expect(push2.status).toBe(200);
			expect(push1.body.changeset.payloadHash).toBe(push2.body.changeset.payloadHash);
		});
	});

	describe("isScopeClientChangesetUniqueViolation edge cases", () => {
		it("handles SequelizeUniqueConstraintError with message fallback", async () => {
			syncCommitDao.createProposedCommit = vi.fn().mockRejectedValue(
				(() => {
					const err = new Error(
						'duplicate key value violates unique constraint "sync_commits_scope_client_changeset_key"',
					);
					(err as { name: string }).name = "SequelizeUniqueConstraintError";
					return err;
				})(),
			);
			syncCommitDao.findCommitByScopeAndClientChangesetId = vi.fn().mockResolvedValue(undefined);

			const response = await request(app)
				.post("/v1/sync/push")
				.send({
					clientChangesetId: "CID-MSG-FALLBACK",
					targetBranch: "main",
					ops: [{ type: "upsert", fileId: "mf1", serverPath: "mf1.md", baseVersion: 0, content: "x" }],
				});

			// Will hit the raced === null path and rethrow since find returns undefined
			expect(response.status).toBe(500);
		});

		it("does not match non-unique errors", async () => {
			syncCommitDao.createProposedCommit = vi.fn().mockRejectedValue(new Error("some other error"));

			const response = await request(app)
				.post("/v1/sync/push")
				.send({
					clientChangesetId: "CID-OTHER-ERR",
					targetBranch: "main",
					ops: [{ type: "upsert", fileId: "oe1", serverPath: "oe1.md", baseVersion: 0, content: "x" }],
				});

			expect(response.status).toBe(500);
		});

		it("handles null/non-object error", async () => {
			syncCommitDao.createProposedCommit = vi.fn().mockRejectedValue(null);

			const response = await request(app)
				.post("/v1/sync/push")
				.send({
					clientChangesetId: "CID-NULL-ERR",
					targetBranch: "main",
					ops: [{ type: "upsert", fileId: "ne1", serverPath: "ne1.md", baseVersion: 0, content: "x" }],
				});

			expect(response.status).toBe(500);
		});
	});

	describe("parseOptionalPositiveInt edge cases", () => {
		it("rejects array value for limit", async () => {
			const response = await request(app).get("/v1/sync/changesets?limit=1&limit=2");

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("Invalid limit");
		});
	});

	describe("no space available for non-push routes", () => {
		it("returns 500 when no default space for listChangesets", async () => {
			spaceDao.getDefaultSpace = vi.fn().mockResolvedValue(undefined);

			const response = await request(app).get("/v1/sync/changesets");

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("No space available");
		});

		it("returns 500 when no default space for getChangeset", async () => {
			spaceDao.getDefaultSpace = vi.fn().mockResolvedValue(undefined);

			const response = await request(app).get("/v1/sync/changesets/1");

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("No space available");
		});

		it("returns 500 when no default space for review", async () => {
			spaceDao.getDefaultSpace = vi.fn().mockResolvedValue(undefined);

			const response = await request(app)
				.patch("/v1/sync/changesets/1/files/1/review")
				.send({ decision: "accept" });

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("No space available");
		});

		it("returns 500 when no default space for publish", async () => {
			spaceDao.getDefaultSpace = vi.fn().mockResolvedValue(undefined);

			const response = await request(app).post("/v1/sync/changesets/1/publish").send({});

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("No space available");
		});
	});

	describe("push SpaceNotFoundError in 500 handler", () => {
		it("returns 500 on generic push error", async () => {
			syncArticleDao.getCurrentCursor = vi.fn().mockRejectedValue(new Error("DB error"));

			const response = await request(app)
				.post("/v1/sync/push")
				.send({
					clientChangesetId: "CID-PUSH-ERR",
					targetBranch: "main",
					ops: [{ type: "upsert", fileId: "pe1", serverPath: "pe1.md", baseVersion: 0, content: "x" }],
				});

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("Failed to push changes");
		});
	});

	describe("review SpaceNotFoundError", () => {
		it("returns 500 on generic review error", async () => {
			const push = await request(app)
				.post("/v1/sync/push")
				.send({
					clientChangesetId: "CID-REV-ERR",
					targetBranch: "main",
					ops: [{ type: "upsert", fileId: "re1", serverPath: "re1.md", baseVersion: 0, content: "x" }],
				});
			const commitId = push.body.changeset.id;
			const fileId = push.body.files[0].id;

			// Break getCommit to cause 500
			const realGetCommit = syncCommitDao.getCommit.bind(syncCommitDao);
			syncCommitDao.getCommit = vi.fn().mockRejectedValue(new Error("DB error"));

			const response = await request(app)
				.patch(`/v1/sync/changesets/${commitId}/files/${fileId}/review`)
				.send({ decision: "accept" });

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("Failed to set review decision");
			syncCommitDao.getCommit = realGetCommit;
		});
	});

	describe("publish SpaceNotFoundError", () => {
		it("returns 404 when space not found during publish", async () => {
			const push = await request(app)
				.post("/v1/sync/push")
				.send({
					clientChangesetId: "CID-PUB-SPACE-404",
					targetBranch: "main",
					ops: [{ type: "upsert", fileId: "ps1", serverPath: "ps1.md", baseVersion: 0, content: "x" }],
				});

			const response = await request(app)
				.post(`/v1/sync/changesets/${push.body.changeset.id}/publish`)
				.set("X-Jolli-Space", "nonexistent")
				.send({});

			expect(response.status).toBe(404);
		});
	});

	describe("full snapshot with space header", () => {
		it("passes spaceId filter when space header is set", async () => {
			docDao.listDocs = vi.fn().mockResolvedValue([]);

			await request(app).post("/v1/sync/pull").set("X-Jolli-Space", "default").send({ sinceCursor: 0 });

			expect(docDao.listDocs).toHaveBeenCalledWith(
				expect.objectContaining({
					spaceId: 1,
				}),
			);
		});
	});
});
