import type { DaoPostSyncHook } from "../core/Database";
import type { Source, SpaceSourceBinding } from "../model/Source";
import type { TenantOrgContext } from "../tenant/TenantContext";
import type { ModelDef } from "../util/ModelDef";
import { createSourceDao, createSourceDaoProvider, type SourceDao } from "./SourceDao";
import { jrnParserV3 } from "jolli-common";
import type { Sequelize } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

function mockSource(partial?: Partial<Source>): Source {
	return {
		id: 1,
		name: "source-a",
		type: "git",
		repo: "repo-a-org/repo-a",
		branch: "main",
		integrationId: 1,
		enabled: true,
		createdAt: new Date(0),
		updatedAt: new Date(0),
		...partial,
	};
}

function mockBinding(partial?: Partial<SpaceSourceBinding>): SpaceSourceBinding {
	return {
		spaceId: 100,
		sourceId: 1,
		enabled: true,
		createdAt: new Date(0),
		...partial,
	};
}

function toModelInstance<T>(value: T) {
	return {
		get: vi.fn().mockReturnValue(value),
	} as never;
}

describe("SourceDao", () => {
	let sourcesModel: ModelDef<Source>;
	let spaceSourcesModel: ModelDef<SpaceSourceBinding>;
	let sourceDao: SourceDao & DaoPostSyncHook;
	let mockSequelize: Sequelize;

	beforeEach(() => {
		sourcesModel = {
			create: vi.fn(),
			findByPk: vi.fn(),
			findAll: vi.fn(),
			update: vi.fn(),
			destroy: vi.fn(),
		} as unknown as ModelDef<Source>;

		spaceSourcesModel = {
			create: vi.fn(),
			findOne: vi.fn(),
			findAll: vi.fn(),
			update: vi.fn(),
			destroy: vi.fn(),
		} as unknown as ModelDef<SpaceSourceBinding>;

		mockSequelize = {
			models: {},
			define: vi.fn((name: string) => {
				if (name === "source") {
					return sourcesModel;
				}
				if (name === "space_source") {
					return spaceSourcesModel;
				}
				throw new Error(`Unexpected model: ${name}`);
			}),
			query: vi.fn(),
		} as unknown as Sequelize;

		sourceDao = createSourceDao(mockSequelize);
	});

	// ────────────────────────────────────────────────────────────────────
	// createSource
	// ────────────────────────────────────────────────────────────────────

	describe("createSource", () => {
		it("creates a source and returns the plain object", async () => {
			const newSource = {
				name: "my-source",
				type: "git" as const,
				repo: "org/repo",
				branch: "main",
				enabled: true,
			};
			const created = mockSource({ id: 5, ...newSource });
			vi.mocked(sourcesModel.create).mockResolvedValue(toModelInstance(created));

			const result = await sourceDao.createSource(newSource);

			expect(sourcesModel.create).toHaveBeenCalledWith(newSource);
			expect(result).toEqual(created);
		});
	});

	// ────────────────────────────────────────────────────────────────────
	// getSource
	// ────────────────────────────────────────────────────────────────────

	describe("getSource", () => {
		it("returns a plain source when found", async () => {
			const source = mockSource({ id: 7 });
			vi.mocked(sourcesModel.findByPk).mockResolvedValue(toModelInstance(source));

			const result = await sourceDao.getSource(7);

			expect(sourcesModel.findByPk).toHaveBeenCalledWith(7);
			expect(result).toEqual(source);
		});

		it("returns undefined when source is not found", async () => {
			vi.mocked(sourcesModel.findByPk).mockResolvedValue(null as never);

			const result = await sourceDao.getSource(999);

			expect(result).toBeUndefined();
		});
	});

	// ────────────────────────────────────────────────────────────────────
	// listSources
	// ────────────────────────────────────────────────────────────────────

	describe("listSources", () => {
		it("returns all sources ordered by createdAt DESC", async () => {
			const s1 = mockSource({ id: 1, name: "first" });
			const s2 = mockSource({ id: 2, name: "second" });
			vi.mocked(sourcesModel.findAll).mockResolvedValue([toModelInstance(s1), toModelInstance(s2)] as never);

			const result = await sourceDao.listSources();

			expect(sourcesModel.findAll).toHaveBeenCalledWith({ order: [["createdAt", "DESC"]] });
			expect(result).toEqual([s1, s2]);
		});

		it("returns empty array when no sources exist", async () => {
			vi.mocked(sourcesModel.findAll).mockResolvedValue([] as never);

			const result = await sourceDao.listSources();

			expect(result).toEqual([]);
		});
	});

	// ────────────────────────────────────────────────────────────────────
	// updateSource
	// ────────────────────────────────────────────────────────────────────

	describe("updateSource", () => {
		it("updates a source and returns the refreshed plain object", async () => {
			const updatedSource = mockSource({ id: 3, name: "renamed" });
			vi.mocked(sourcesModel.update).mockResolvedValue([1] as never);
			vi.mocked(sourcesModel.findByPk).mockResolvedValue(toModelInstance(updatedSource));

			const result = await sourceDao.updateSource(3, { name: "renamed" });

			expect(sourcesModel.update).toHaveBeenCalledWith({ name: "renamed" }, { where: { id: 3 } });
			expect(sourcesModel.findByPk).toHaveBeenCalledWith(3);
			expect(result).toEqual(updatedSource);
		});

		it("returns undefined when no rows are affected", async () => {
			vi.mocked(sourcesModel.update).mockResolvedValue([0] as never);

			const result = await sourceDao.updateSource(999, { name: "nope" });

			expect(result).toBeUndefined();
			expect(sourcesModel.findByPk).not.toHaveBeenCalled();
		});
	});

	// ────────────────────────────────────────────────────────────────────
	// deleteSource
	// ────────────────────────────────────────────────────────────────────

	describe("deleteSource", () => {
		it("destroys space bindings first, then the source", async () => {
			vi.mocked(spaceSourcesModel.destroy).mockResolvedValue(2 as never);
			vi.mocked(sourcesModel.destroy).mockResolvedValue(1 as never);

			await sourceDao.deleteSource(5);

			expect(spaceSourcesModel.destroy).toHaveBeenCalledWith({ where: { sourceId: 5 } });
			expect(sourcesModel.destroy).toHaveBeenCalledWith({ where: { id: 5 } });
			// Space bindings must be destroyed before the source itself
			const bindingCallOrder = vi.mocked(spaceSourcesModel.destroy).mock.invocationCallOrder[0];
			const sourceCallOrder = vi.mocked(sourcesModel.destroy).mock.invocationCallOrder[0];
			expect(bindingCallOrder).toBeLessThan(sourceCallOrder as number);
		});
	});

	// ────────────────────────────────────────────────────────────────────
	// updateCursor
	// ────────────────────────────────────────────────────────────────────

	describe("updateCursor", () => {
		it("updates the cursor field and returns the refreshed source", async () => {
			const cursor = { value: "abc123", updatedAt: "2025-01-01T00:00:00Z" };
			const updatedSource = mockSource({ id: 4, cursor });
			vi.mocked(sourcesModel.update).mockResolvedValue([1] as never);
			vi.mocked(sourcesModel.findByPk).mockResolvedValue(toModelInstance(updatedSource));

			const result = await sourceDao.updateCursor(4, cursor);

			expect(sourcesModel.update).toHaveBeenCalledWith({ cursor }, { where: { id: 4 } });
			expect(result).toEqual(updatedSource);
		});

		it("returns undefined when no rows are affected", async () => {
			const cursor = { value: "xyz", updatedAt: "2025-06-01T00:00:00Z" };
			vi.mocked(sourcesModel.update).mockResolvedValue([0] as never);

			const result = await sourceDao.updateCursor(999, cursor);

			expect(result).toBeUndefined();
			expect(sourcesModel.findByPk).not.toHaveBeenCalled();
		});
	});

	// ────────────────────────────────────────────────────────────────────
	// bindSourceToSpace
	// ────────────────────────────────────────────────────────────────────

	describe("bindSourceToSpace", () => {
		it("creates a new binding when none exists", async () => {
			const binding = mockBinding({ spaceId: 10, sourceId: 3 });
			vi.mocked(spaceSourcesModel.findOne).mockResolvedValue(null as never);
			vi.mocked(spaceSourcesModel.create).mockResolvedValue(toModelInstance(binding));

			const result = await sourceDao.bindSourceToSpace(10, 3);

			expect(spaceSourcesModel.findOne).toHaveBeenCalledWith({ where: { spaceId: 10, sourceId: 3 } });
			expect(spaceSourcesModel.create).toHaveBeenCalledWith({
				spaceId: 10,
				sourceId: 3,
				jrnPattern: undefined,
				enabled: true,
			});
			expect(result).toEqual(binding);
		});

		it("creates a new binding with jrnPattern when provided", async () => {
			const binding = mockBinding({ spaceId: 10, sourceId: 3, jrnPattern: "jrn:*:**" });
			vi.mocked(spaceSourcesModel.findOne).mockResolvedValue(null as never);
			vi.mocked(spaceSourcesModel.create).mockResolvedValue(toModelInstance(binding));

			const result = await sourceDao.bindSourceToSpace(10, 3, "jrn:*:**");

			expect(spaceSourcesModel.create).toHaveBeenCalledWith({
				spaceId: 10,
				sourceId: 3,
				jrnPattern: "jrn:*:**",
				enabled: true,
			});
			expect(result).toEqual(binding);
		});

		it("creates a new binding with enabled=false when specified", async () => {
			const binding = mockBinding({ spaceId: 10, sourceId: 3, enabled: false });
			vi.mocked(spaceSourcesModel.findOne).mockResolvedValue(null as never);
			vi.mocked(spaceSourcesModel.create).mockResolvedValue(toModelInstance(binding));

			const result = await sourceDao.bindSourceToSpace(10, 3, undefined, false);

			expect(spaceSourcesModel.create).toHaveBeenCalledWith({
				spaceId: 10,
				sourceId: 3,
				jrnPattern: undefined,
				enabled: false,
			});
			expect(result).toEqual(binding);
		});

		it("updates an existing binding without jrnPattern when not provided", async () => {
			const existingBinding = mockBinding({ spaceId: 10, sourceId: 3 });
			const updatedBinding = mockBinding({ spaceId: 10, sourceId: 3, enabled: true });
			vi.mocked(spaceSourcesModel.findOne)
				.mockResolvedValueOnce(toModelInstance(existingBinding))
				.mockResolvedValueOnce(toModelInstance(updatedBinding));
			vi.mocked(spaceSourcesModel.update).mockResolvedValue([1] as never);

			const result = await sourceDao.bindSourceToSpace(10, 3);

			expect(spaceSourcesModel.update).toHaveBeenCalledWith(
				{ enabled: true },
				{ where: { spaceId: 10, sourceId: 3 } },
			);
			expect(result).toEqual(updatedBinding);
		});

		it("updates an existing binding with jrnPattern when provided", async () => {
			const existingBinding = mockBinding({ spaceId: 10, sourceId: 3 });
			const updatedBinding = mockBinding({ spaceId: 10, sourceId: 3, jrnPattern: "jrn:v3:**" });
			vi.mocked(spaceSourcesModel.findOne)
				.mockResolvedValueOnce(toModelInstance(existingBinding))
				.mockResolvedValueOnce(toModelInstance(updatedBinding));
			vi.mocked(spaceSourcesModel.update).mockResolvedValue([1] as never);

			const result = await sourceDao.bindSourceToSpace(10, 3, "jrn:v3:**");

			expect(spaceSourcesModel.update).toHaveBeenCalledWith(
				{ enabled: true, jrnPattern: "jrn:v3:**" },
				{ where: { spaceId: 10, sourceId: 3 } },
			);
			expect(result).toEqual(updatedBinding);
		});
	});

	// ────────────────────────────────────────────────────────────────────
	// unbindSourceFromSpace
	// ────────────────────────────────────────────────────────────────────

	describe("unbindSourceFromSpace", () => {
		it("destroys the binding between a space and source", async () => {
			vi.mocked(spaceSourcesModel.destroy).mockResolvedValue(1 as never);

			await sourceDao.unbindSourceFromSpace(10, 3);

			expect(spaceSourcesModel.destroy).toHaveBeenCalledWith({ where: { spaceId: 10, sourceId: 3 } });
		});
	});

	// ────────────────────────────────────────────────────────────────────
	// listSourcesForSpace
	// ────────────────────────────────────────────────────────────────────

	describe("listSourcesForSpace", () => {
		it("returns sources with their bindings for a given space", async () => {
			const binding1 = mockBinding({ spaceId: 50, sourceId: 1 });
			const binding2 = mockBinding({ spaceId: 50, sourceId: 2 });
			const source1 = mockSource({ id: 1, name: "src-1" });
			const source2 = mockSource({ id: 2, name: "src-2" });

			vi.mocked(spaceSourcesModel.findAll).mockResolvedValue([
				toModelInstance(binding1),
				toModelInstance(binding2),
			] as never);

			vi.mocked(sourcesModel.findAll).mockResolvedValue([
				toModelInstance(source1),
				toModelInstance(source2),
			] as never);

			const result = await sourceDao.listSourcesForSpace(50);

			expect(spaceSourcesModel.findAll).toHaveBeenCalledWith({
				where: { spaceId: 50 },
				order: [["createdAt", "ASC"]],
			});
			expect(sourcesModel.findAll).toHaveBeenCalledWith({
				where: { id: [1, 2] },
			});
			expect(result).toHaveLength(2);
			expect(result[0]).toEqual({ ...source1, binding: binding1 });
			expect(result[1]).toEqual({ ...source2, binding: binding2 });
		});

		it("skips bindings whose source no longer exists", async () => {
			const binding = mockBinding({ spaceId: 50, sourceId: 99 });
			vi.mocked(spaceSourcesModel.findAll).mockResolvedValue([toModelInstance(binding)] as never);
			vi.mocked(sourcesModel.findAll).mockResolvedValue([] as never);

			const result = await sourceDao.listSourcesForSpace(50);

			expect(result).toEqual([]);
			expect(sourcesModel.findAll).toHaveBeenCalledWith({
				where: { id: [99] },
			});
		});

		it("returns empty array when space has no bindings", async () => {
			vi.mocked(spaceSourcesModel.findAll).mockResolvedValue([] as never);

			const result = await sourceDao.listSourcesForSpace(50);

			expect(result).toEqual([]);
			expect(sourcesModel.findAll).not.toHaveBeenCalled();
		});
	});

	// ────────────────────────────────────────────────────────────────────
	// listSpacesForSource
	// ────────────────────────────────────────────────────────────────────

	describe("listSpacesForSource", () => {
		it("returns all bindings for a given source", async () => {
			const b1 = mockBinding({ spaceId: 10, sourceId: 5 });
			const b2 = mockBinding({ spaceId: 20, sourceId: 5 });
			vi.mocked(spaceSourcesModel.findAll).mockResolvedValue([toModelInstance(b1), toModelInstance(b2)] as never);

			const result = await sourceDao.listSpacesForSource(5);

			expect(spaceSourcesModel.findAll).toHaveBeenCalledWith({
				where: { sourceId: 5 },
				order: [["createdAt", "ASC"]],
			});
			expect(result).toEqual([b1, b2]);
		});

		it("returns empty array when source has no space bindings", async () => {
			vi.mocked(spaceSourcesModel.findAll).mockResolvedValue([] as never);

			const result = await sourceDao.listSpacesForSource(5);

			expect(result).toEqual([]);
		});
	});

	// ────────────────────────────────────────────────────────────────────
	// findSourcesMatchingJrn
	// ────────────────────────────────────────────────────────────────────

	describe("findSourcesMatchingJrn", () => {
		it("does not match by branch alone when repository differs", async () => {
			const matchingSource = mockSource({
				id: 1,
				name: "repo-a",
				repo: "repo-a-org/repo-a",
				branch: "main",
			});
			const unrelatedSourceSameBranch = mockSource({
				id: 2,
				name: "repo-b",
				repo: "repo-b-org/repo-b",
				branch: "main",
			});

			vi.mocked(sourcesModel.findAll).mockResolvedValue([
				toModelInstance(matchingSource),
				toModelInstance(unrelatedSourceSameBranch),
			] as never);

			vi.mocked(spaceSourcesModel.findAll).mockResolvedValue([
				toModelInstance(mockBinding({ spaceId: 101, sourceId: 1 })),
			] as never);

			const eventJrn = jrnParserV3.githubSource({
				orgId: "global",
				org: "repo-a-org",
				repo: "repo-a",
				branch: "main",
			});

			const result = await sourceDao.findSourcesMatchingJrn(eventJrn);

			expect(result).toHaveLength(1);
			expect(result[0]?.source.id).toBe(1);
			expect(result[0]?.binding.spaceId).toBe(101);
			expect(spaceSourcesModel.findAll).toHaveBeenCalledWith({
				where: { sourceId: [1], enabled: true },
				order: [["createdAt", "ASC"]],
			});
		});

		it("skips disabled sources", async () => {
			const disabledSource = mockSource({
				id: 1,
				repo: "org/repo",
				branch: "main",
				enabled: false,
			});
			vi.mocked(sourcesModel.findAll).mockResolvedValue([toModelInstance(disabledSource)] as never);

			const eventJrn = jrnParserV3.githubSource({
				orgId: "global",
				org: "org",
				repo: "repo",
				branch: "main",
			});

			const result = await sourceDao.findSourcesMatchingJrn(eventJrn);

			expect(result).toEqual([]);
			// Should not attempt to fetch bindings for disabled sources
			expect(spaceSourcesModel.findAll).not.toHaveBeenCalled();
		});

		it("skips sources without a repo (no JRN pattern can be built)", async () => {
			const { repo: _, ...noRepoFields } = mockSource({ id: 1, enabled: true });
			const noRepoSource = noRepoFields as Source;
			vi.mocked(sourcesModel.findAll).mockResolvedValue([toModelInstance(noRepoSource)] as never);

			const eventJrn = jrnParserV3.githubSource({
				orgId: "global",
				org: "org",
				repo: "repo",
				branch: "main",
			});

			const result = await sourceDao.findSourcesMatchingJrn(eventJrn);

			expect(result).toEqual([]);
			expect(spaceSourcesModel.findAll).not.toHaveBeenCalled();
		});

		it("skips disabled bindings", async () => {
			const source = mockSource({ id: 1, repo: "org/repo", branch: "main" });
			vi.mocked(sourcesModel.findAll).mockResolvedValue([toModelInstance(source)] as never);
			vi.mocked(spaceSourcesModel.findAll).mockResolvedValue([
				toModelInstance(mockBinding({ spaceId: 10, sourceId: 1, enabled: false })),
			] as never);

			const eventJrn = jrnParserV3.githubSource({
				orgId: "global",
				org: "org",
				repo: "repo",
				branch: "main",
			});

			const result = await sourceDao.findSourcesMatchingJrn(eventJrn);

			expect(result).toEqual([]);
		});

		it("skips bindings whose jrnPattern does not match the event JRN", async () => {
			const source = mockSource({ id: 1, repo: "org/repo", branch: "main" });
			vi.mocked(sourcesModel.findAll).mockResolvedValue([toModelInstance(source)] as never);

			// Binding has a jrnPattern that restricts to a different repo
			const restrictiveBinding = mockBinding({
				spaceId: 10,
				sourceId: 1,
				jrnPattern: jrnParserV3.githubSource({
					orgId: "*",
					org: "other-org",
					repo: "other-repo",
					branch: "**",
				}),
			});
			vi.mocked(spaceSourcesModel.findAll).mockResolvedValue([toModelInstance(restrictiveBinding)] as never);

			const eventJrn = jrnParserV3.githubSource({
				orgId: "global",
				org: "org",
				repo: "repo",
				branch: "main",
			});

			const result = await sourceDao.findSourcesMatchingJrn(eventJrn);

			expect(result).toEqual([]);
		});

		it("matches bindings without a jrnPattern (wildcard)", async () => {
			const source = mockSource({ id: 1, repo: "org/repo", branch: "main" });
			vi.mocked(sourcesModel.findAll).mockResolvedValue([toModelInstance(source)] as never);

			// Binding has no jrnPattern — should match all events the source matches
			const wildcardBinding = mockBinding({ spaceId: 10, sourceId: 1 });
			vi.mocked(spaceSourcesModel.findAll).mockResolvedValue([toModelInstance(wildcardBinding)] as never);

			const eventJrn = jrnParserV3.githubSource({
				orgId: "global",
				org: "org",
				repo: "repo",
				branch: "main",
			});

			const result = await sourceDao.findSourcesMatchingJrn(eventJrn);

			expect(result).toHaveLength(1);
			expect(result[0]?.source.id).toBe(1);
			expect(result[0]?.binding.spaceId).toBe(10);
		});

		it("handles source with github.com/org/repo format", async () => {
			const source = mockSource({
				id: 1,
				repo: "github.com/myorg/myrepo",
				branch: "develop",
			});
			vi.mocked(sourcesModel.findAll).mockResolvedValue([toModelInstance(source)] as never);

			const binding = mockBinding({ spaceId: 20, sourceId: 1 });
			vi.mocked(spaceSourcesModel.findAll).mockResolvedValue([toModelInstance(binding)] as never);

			const eventJrn = jrnParserV3.githubSource({
				orgId: "global",
				org: "myorg",
				repo: "myrepo",
				branch: "develop",
			});

			const result = await sourceDao.findSourcesMatchingJrn(eventJrn);

			expect(result).toHaveLength(1);
			expect(result[0]?.source.id).toBe(1);
		});

		it("uses ** wildcard for branch when source has no branch set", async () => {
			const { branch: _, ...noBranchFields } = mockSource({ id: 1, repo: "org/repo" });
			const source = noBranchFields as Source;
			vi.mocked(sourcesModel.findAll).mockResolvedValue([toModelInstance(source)] as never);

			const binding = mockBinding({ spaceId: 30, sourceId: 1 });
			vi.mocked(spaceSourcesModel.findAll).mockResolvedValue([toModelInstance(binding)] as never);

			// Should match any branch since source has no branch restriction
			const eventJrn = jrnParserV3.githubSource({
				orgId: "global",
				org: "org",
				repo: "repo",
				branch: "feature/xyz",
			});

			const result = await sourceDao.findSourcesMatchingJrn(eventJrn);

			expect(result).toHaveLength(1);
			expect(result[0]?.source.id).toBe(1);
		});

		it("skips source with single-part repo (no org/repo separator)", async () => {
			const source = mockSource({
				id: 1,
				repo: "just-a-name",
				enabled: true,
			});
			vi.mocked(sourcesModel.findAll).mockResolvedValue([toModelInstance(source)] as never);

			const eventJrn = jrnParserV3.githubSource({
				orgId: "global",
				org: "org",
				repo: "repo",
				branch: "main",
			});

			const result = await sourceDao.findSourcesMatchingJrn(eventJrn);

			// "just-a-name" has only one part, so org and repo are both undefined => no pattern
			expect(result).toEqual([]);
		});

		it("returns multiple results when multiple sources and bindings match", async () => {
			const source1 = mockSource({ id: 1, repo: "org/repo", branch: "main" });
			const source2 = mockSource({ id: 2, name: "source-b", repo: "org/repo", branch: "main" });
			vi.mocked(sourcesModel.findAll).mockResolvedValue([
				toModelInstance(source1),
				toModelInstance(source2),
			] as never);

			vi.mocked(spaceSourcesModel.findAll).mockResolvedValue([
				toModelInstance(mockBinding({ spaceId: 10, sourceId: 1 })),
				toModelInstance(mockBinding({ spaceId: 20, sourceId: 1 })),
				toModelInstance(mockBinding({ spaceId: 30, sourceId: 2 })),
			] as never);

			const eventJrn = jrnParserV3.githubSource({
				orgId: "global",
				org: "org",
				repo: "repo",
				branch: "main",
			});

			const result = await sourceDao.findSourcesMatchingJrn(eventJrn);

			expect(result).toHaveLength(3);
			expect(result.map(r => r.binding.spaceId)).toEqual([10, 20, 30]);
			expect(spaceSourcesModel.findAll).toHaveBeenCalledTimes(1);
			expect(spaceSourcesModel.findAll).toHaveBeenCalledWith({
				where: { sourceId: [1, 2], enabled: true },
				order: [["createdAt", "ASC"]],
			});
		});

		it("returns empty array when no sources exist", async () => {
			vi.mocked(sourcesModel.findAll).mockResolvedValue([] as never);

			const eventJrn = jrnParserV3.githubSource({
				orgId: "global",
				org: "org",
				repo: "repo",
				branch: "main",
			});

			const result = await sourceDao.findSourcesMatchingJrn(eventJrn);

			expect(result).toEqual([]);
		});
	});

	// ────────────────────────────────────────────────────────────────────
	// postSync
	// ────────────────────────────────────────────────────────────────────

	describe("postSync", () => {
		it("drops the legacy sources column when it exists in the spaces table", async () => {
			vi.mocked(mockSequelize.query as ReturnType<typeof vi.fn>)
				.mockResolvedValueOnce([[{ column_name: "sources" }]])
				.mockResolvedValueOnce(undefined);

			await sourceDao.postSync(mockSequelize, {} as never);

			expect(mockSequelize.query).toHaveBeenCalledTimes(2);
			expect(mockSequelize.query).toHaveBeenNthCalledWith(
				1,
				expect.stringContaining("information_schema.columns"),
			);
			expect(mockSequelize.query).toHaveBeenNthCalledWith(
				2,
				expect.stringContaining("ALTER TABLE spaces DROP COLUMN IF EXISTS sources"),
			);
		});

		it("does not drop column when it does not exist", async () => {
			vi.mocked(mockSequelize.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce([[]]);

			await sourceDao.postSync(mockSequelize, {} as never);

			// Only the check query should be called, not the ALTER TABLE
			expect(mockSequelize.query).toHaveBeenCalledTimes(1);
		});

		it("handles errors gracefully without throwing", async () => {
			vi.mocked(mockSequelize.query as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("query failed"));

			// Should not throw — errors are caught and logged
			await expect(sourceDao.postSync(mockSequelize, {} as never)).resolves.toBeUndefined();
		});
	});

	// ────────────────────────────────────────────────────────────────────
	// createSourceDaoProvider
	// ────────────────────────────────────────────────────────────────────

	describe("createSourceDaoProvider", () => {
		it("returns the default DAO when context is undefined", () => {
			const defaultDao = sourceDao as SourceDao;
			const provider = createSourceDaoProvider(defaultDao);

			const result = provider.getDao(undefined);

			expect(result).toBe(defaultDao);
		});

		it("returns the context DAO when a tenant context is provided", () => {
			const defaultDao = sourceDao as SourceDao;
			const contextDao = { ...defaultDao } as SourceDao;
			const context = {
				database: { sourceDao: contextDao },
			} as unknown as TenantOrgContext;

			const provider = createSourceDaoProvider(defaultDao);
			const result = provider.getDao(context);

			expect(result).toBe(contextDao);
		});

		it("falls back to default DAO when context database has no sourceDao", () => {
			const defaultDao = sourceDao as SourceDao;
			const context = {
				database: {},
			} as unknown as TenantOrgContext;

			const provider = createSourceDaoProvider(defaultDao);
			const result = provider.getDao(context);

			expect(result).toBe(defaultDao);
		});
	});
});
