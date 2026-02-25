import type { DaoPostSyncHook, Database } from "../core/Database";
import {
	defineSources,
	defineSpaceSources,
	type NewSource,
	type Source,
	type SpaceSourceBinding,
} from "../model/Source";
import type { TenantOrgContext } from "../tenant/TenantContext";
import { getLog } from "../util/Logger";
import type { DaoProvider } from "./DaoProvider";
import { jrnParserV3, matchesAnyJrnPattern, type SourceCursor } from "jolli-common";
import type { Sequelize } from "sequelize";

const log = getLog(import.meta);

/**
 * Sources DAO — CRUD for sources, cursor management, and space-source bindings.
 */
export interface SourceDao {
	/** Creates a new source. */
	createSource(source: NewSource): Promise<Source>;
	/** Gets a source by ID. */
	getSource(id: number): Promise<Source | undefined>;
	/** Lists all sources in the current org. */
	listSources(): Promise<Array<Source>>;
	/** Updates a source by ID. */
	updateSource(id: number, update: Partial<NewSource>): Promise<Source | undefined>;
	/** Deletes a source by ID. */
	deleteSource(id: number): Promise<void>;
	/** Advances the cursor for a source after successful processing. */
	updateCursor(id: number, cursor: SourceCursor): Promise<Source | undefined>;
	/** Binds a source to a space. */
	bindSourceToSpace(
		spaceId: number,
		sourceId: number,
		jrnPattern?: string,
		enabled?: boolean,
	): Promise<SpaceSourceBinding>;
	/** Unbinds a source from a space. */
	unbindSourceFromSpace(spaceId: number, sourceId: number): Promise<void>;
	/** Lists all sources bound to a space (with binding info). */
	listSourcesForSpace(spaceId: number): Promise<Array<Source & { binding: SpaceSourceBinding }>>;
	/** Lists all spaces bound to a source. */
	listSpacesForSource(sourceId: number): Promise<Array<SpaceSourceBinding>>;
	/**
	 * Finds sources and their space bindings that match an event JRN.
	 * Replaces SpaceDao.findSpacesMatchingJrn.
	 * Returns an array of { source, binding } for each match.
	 */
	findSourcesMatchingJrn(eventJrn: string): Promise<Array<{ source: Source; binding: SpaceSourceBinding }>>;
}

export function createSourceDao(sequelize: Sequelize): SourceDao & DaoPostSyncHook {
	const Sources = defineSources(sequelize);
	const SpaceSources = defineSpaceSources(sequelize);

	return {
		postSync,
		createSource,
		getSource,
		listSources,
		updateSource,
		deleteSource,
		updateCursor,
		bindSourceToSpace,
		unbindSourceFromSpace,
		listSourcesForSpace,
		listSpacesForSource,
		findSourcesMatchingJrn,
	};

	/**
	 * Post-sync hook — drops the legacy sources JSONB column from spaces if present.
	 * Idempotent: safe to run multiple times.
	 */
	async function postSync(_sequelize: Sequelize, _db: Database): Promise<void> {
		try {
			// Drop legacy sources JSONB column from spaces table if it still exists
			const [columns] = await sequelize.query(
				`SELECT column_name FROM information_schema.columns
				 WHERE table_schema = current_schema()
				   AND table_name = 'spaces'
				   AND column_name = 'sources'`,
			);
			if ((columns as Array<{ column_name: string }>).length > 0) {
				await sequelize.query(`ALTER TABLE spaces DROP COLUMN IF EXISTS sources`);
				log.info("Dropped legacy sources JSONB column from spaces table");
			}
		} catch (error) {
			log.error(error, "Error during source postSync migration");
		}
	}

	async function createSource(source: NewSource): Promise<Source> {
		// biome-ignore lint/suspicious/noExplicitAny: Sequelize auto-generates id, createdAt, updatedAt
		const created = await Sources.create(source as any);
		return created.get({ plain: true });
	}

	async function getSource(id: number): Promise<Source | undefined> {
		const source = await Sources.findByPk(id);
		return source ? source.get({ plain: true }) : undefined;
	}

	async function listSources(): Promise<Array<Source>> {
		const sources = await Sources.findAll({ order: [["createdAt", "DESC"]] });
		return sources.map(s => s.get({ plain: true }));
	}

	async function updateSource(id: number, update: Partial<NewSource>): Promise<Source | undefined> {
		const [affectedCount] = await Sources.update(update, { where: { id } });
		if (affectedCount === 0) {
			return;
		}
		return getSource(id);
	}

	async function deleteSource(id: number): Promise<void> {
		// Remove all space bindings for this source first
		await SpaceSources.destroy({ where: { sourceId: id } });
		await Sources.destroy({ where: { id } });
	}

	async function updateCursor(id: number, cursor: SourceCursor): Promise<Source | undefined> {
		const [affectedCount] = await Sources.update({ cursor } as Partial<Source>, { where: { id } });
		if (affectedCount === 0) {
			return;
		}
		return getSource(id);
	}

	async function bindSourceToSpace(
		spaceId: number,
		sourceId: number,
		jrnPattern?: string,
		enabled = true,
	): Promise<SpaceSourceBinding> {
		// Upsert: if binding exists, update it; otherwise create it
		const existing = await SpaceSources.findOne({ where: { spaceId, sourceId } });
		if (existing) {
			const updateFields: Record<string, unknown> = { enabled };
			if (jrnPattern !== undefined) {
				updateFields.jrnPattern = jrnPattern;
			}
			await SpaceSources.update(updateFields, { where: { spaceId, sourceId } });
			const updated = await SpaceSources.findOne({ where: { spaceId, sourceId } });
			return updated?.get({ plain: true }) as SpaceSourceBinding;
		}
		// biome-ignore lint/suspicious/noExplicitAny: Sequelize composite PK handling
		const created = await SpaceSources.create({ spaceId, sourceId, jrnPattern, enabled } as any);
		return created.get({ plain: true });
	}

	async function unbindSourceFromSpace(spaceId: number, sourceId: number): Promise<void> {
		await SpaceSources.destroy({ where: { spaceId, sourceId } });
	}

	async function listSourcesForSpace(spaceId: number): Promise<Array<Source & { binding: SpaceSourceBinding }>> {
		const bindings = await SpaceSources.findAll({ where: { spaceId }, order: [["createdAt", "ASC"]] });
		if (bindings.length === 0) {
			return [];
		}

		const bindingRecords = bindings.map(binding => binding.get({ plain: true }));
		const sourceIds = [...new Set(bindingRecords.map(binding => binding.sourceId))];
		const sourceRows = await Sources.findAll({
			where: { id: sourceIds },
		});
		const sourceById = new Map<number, Source>(
			sourceRows.map(row => {
				const source = row.get({ plain: true });
				return [source.id, source];
			}),
		);

		const results: Array<Source & { binding: SpaceSourceBinding }> = [];
		for (const binding of bindingRecords) {
			const source = sourceById.get(binding.sourceId);
			if (source) {
				results.push({ ...source, binding });
			}
		}
		return results;
	}

	async function listSpacesForSource(sourceId: number): Promise<Array<SpaceSourceBinding>> {
		const bindings = await SpaceSources.findAll({ where: { sourceId }, order: [["createdAt", "ASC"]] });
		return bindings.map(b => b.get({ plain: true }));
	}

	async function findSourcesMatchingJrn(
		eventJrn: string,
	): Promise<Array<{ source: Source; binding: SpaceSourceBinding }>> {
		const sourceRows = await Sources.findAll({
			where: {
				enabled: true,
			},
			order: [["createdAt", "DESC"]],
		});
		const candidateSources = sourceRows.map(row => row.get({ plain: true }));
		const matchingSources: Array<Source> = [];
		const matchingSourceIds: Array<number> = [];

		for (const source of candidateSources) {
			// Defensive guard for test mocks and partial legacy data.
			if (!source.enabled) {
				continue;
			}

			const pattern = buildJrnPatternForSource(source);
			if (!pattern || !matchesAnyJrnPattern(eventJrn, pattern)) {
				continue;
			}

			matchingSources.push(source);
			matchingSourceIds.push(source.id);
		}

		if (matchingSourceIds.length === 0) {
			return [];
		}

		const bindingRows = await SpaceSources.findAll({
			where: {
				sourceId: matchingSourceIds,
				enabled: true,
			},
			order: [["createdAt", "ASC"]],
		});

		const bindingsBySourceId = new Map<number, Array<SpaceSourceBinding>>();
		for (const row of bindingRows) {
			const binding = row.get({ plain: true });

			// Defensive guard for test mocks and any inconsistent rows.
			if (!binding.enabled) {
				continue;
			}

			if (binding.jrnPattern && !matchesAnyJrnPattern(eventJrn, binding.jrnPattern)) {
				continue;
			}

			const sourceBindings = bindingsBySourceId.get(binding.sourceId) ?? [];
			sourceBindings.push(binding);
			bindingsBySourceId.set(binding.sourceId, sourceBindings);
		}

		const results: Array<{ source: Source; binding: SpaceSourceBinding }> = [];
		for (const source of matchingSources) {
			const sourceBindings = bindingsBySourceId.get(source.id) ?? [];
			for (const binding of sourceBindings) {
				results.push({ source, binding });
			}
		}

		return results;
	}
}

/**
 * Builds a JRN pattern from the source's repo and branch metadata.
 */
function buildJrnPatternForSource(source: Source): string | undefined {
	if (!source.repo) {
		return;
	}
	const parts = source.repo.split("/");
	// Expect "org/repo" or "github.com/org/repo" format
	let org: string | undefined;
	let repo: string | undefined;

	if (parts.length === 2) {
		org = parts[0];
		repo = parts[1];
	} else if (parts.length >= 3) {
		// e.g., "github.com/org/repo"
		org = parts[parts.length - 2];
		repo = parts[parts.length - 1];
	}

	if (!org || !repo) {
		return;
	}

	const branch = source.branch || "**";
	return jrnParserV3.githubSource({ orgId: "*", org, repo, branch });
}

export function createSourceDaoProvider(defaultDao: SourceDao): DaoProvider<SourceDao> {
	return {
		getDao(context: TenantOrgContext | undefined): SourceDao {
			return context?.database.sourceDao ?? defaultDao;
		},
	};
}
