/**
 * Database - Central DAO factory and initialization.
 *
 * ## Multi-Tenant Support
 *
 * This module supports multi-tenant schema isolation:
 *
 * - In multi-tenant mode, TenantOrgConnectionManager creates a Sequelize instance
 *   per tenant-org pair with `SET search_path TO "${schemaName}", public`
 * - The search_path is set BEFORE calling createDatabase()
 * - All model definitions and queries automatically use the org's schema
 * - No explicit schema configuration is needed in model definitions
 *
 * This approach leverages PostgreSQL's search_path mechanism:
 * - Each org has its own schema (e.g., "org_engineering")
 * - Tables exist in each schema (e.g., "org_engineering.docs", "org_marketing.docs")
 * - The same model definitions work for all schemas
 *
 * @module Database
 */

import { type ActiveUserDao, createActiveUserDao, createActiveUserDaoProvider } from "../dao/ActiveUserDao";
import { type ArchivedUserDao, createArchivedUserDao, createArchivedUserDaoProvider } from "../dao/ArchivedUserDao";
import { type AssetDao, createAssetDao, createAssetDaoProvider } from "../dao/AssetDao";
import { type AuditEventDao, createAuditEventDao, createAuditEventDaoProvider } from "../dao/AuditEventDao";
import { type CollabConvoDao, createCollabConvoDao, createCollabConvoDaoProvider } from "../dao/CollabConvoDao";
import type { DaoProvider } from "../dao/DaoProvider";
import { createDocDao, createDocDaoProvider, type DocDao } from "../dao/DocDao";
import { createDocDraftDao, createDocDraftDaoProvider, type DocDraftDao } from "../dao/DocDraftDao";
import {
	createDocDraftEditHistoryDao,
	createDocDraftEditHistoryDaoProvider,
	type DocDraftEditHistoryDao,
} from "../dao/DocDraftEditHistoryDao";
import {
	createDocDraftSectionChangesDao,
	createDocDraftSectionChangesDaoProvider,
	type DocDraftSectionChangesDao,
} from "../dao/DocDraftSectionChangesDao";
import { createDocHistoryDao, createDocHistoryDaoProvider, type DocHistoryDao } from "../dao/DocHistoryDao";
import { createDocsiteDao, createDocsiteDaoProvider, type DocsiteDao } from "../dao/DocsiteDao";
import {
	createGitHubInstallationDao,
	createGitHubInstallationDaoProvider,
	type GitHubInstallationDao,
} from "../dao/GitHubInstallationDao";
import { createIntegrationDao, createIntegrationDaoProvider, type IntegrationDao } from "../dao/IntegrationDao";
import { createJobDao, createJobDaoProvider, type JobDao } from "../dao/JobDao.js";
import { createLegacyTableCleanupDao, type LegacyTableCleanupDao } from "../dao/LegacyTableCleanupDao";
import { createPermissionDao, createPermissionDaoProvider, type PermissionDao } from "../dao/PermissionDao";
import { createRoleDao, createRoleDaoProvider, type RoleDao } from "../dao/RoleDao";
import { createSiteDao, createSiteDaoProvider, type SiteDao } from "../dao/SiteDao";
import { createSourceDao, createSourceDaoProvider, type SourceDao } from "../dao/SourceDao";
import { createSpaceDao, createSpaceDaoProvider, type SpaceDao } from "../dao/SpaceDao";
import { createSyncArticleDao, createSyncArticleDaoProvider, type SyncArticleDao } from "../dao/SyncArticleDao";
import { createSyncCommitDao, createSyncCommitDaoProvider, type SyncCommitDao } from "../dao/SyncCommitDao";
import {
	createUserInvitationDao,
	createUserInvitationDaoProvider,
	type UserInvitationDao,
} from "../dao/UserInvitationDao";
import {
	createUserOnboardingDao,
	createUserOnboardingDaoProvider,
	type UserOnboardingDao,
} from "../dao/UserOnboardingDao";
import {
	createUserPreferenceDao,
	createUserPreferenceDaoProvider,
	type UserPreferenceDao,
} from "../dao/UserPreferenceDao";
import {
	createUserSpacePreferenceDao,
	createUserSpacePreferenceDaoProvider,
	type UserSpacePreferenceDao,
} from "../dao/UserSpacePreferenceDao";
import { createVisitDao, createVisitDaoProvider, type VisitDao } from "../dao/VisitDao";
import { defineActiveUsers } from "../model/ActiveUser";
import { defineArchivedUsers } from "../model/ArchivedUser";
import { defineDocs } from "../model/Doc";
import { defineDocDrafts } from "../model/DocDraft";
import { defineDocDraftChanges } from "../model/DocDraftSectionChanges";
import { defineDocHistories } from "../model/DocHistory";
import { defineIntegrations } from "../model/Integration";
import { definePermissions } from "../model/Permission";
import { defineRoles } from "../model/Role";
import { defineRolePermissions } from "../model/RolePermission";
import { defineSources, defineSpaceSources } from "../model/Source";
import { defineSpaces } from "../model/Space";
import { defineSyncArticles } from "../model/SyncArticle";
import { defineSyncCommits } from "../model/SyncCommit";
import { defineSyncCommitFiles } from "../model/SyncCommitFile";
import { defineSyncCommitFileReviews } from "../model/SyncCommitFileReview";
import { defineUserInvitations } from "../model/UserInvitation";
import { defineUserOnboarding } from "../model/UserOnboarding";
import { defineUserPreferences } from "../model/UserPreference";
import { defineUserSpacePreferences } from "../model/UserSpacePreference";
import { getLog } from "../util/Logger";
import { QueryTypes, type Sequelize } from "sequelize";

const log = getLog(import.meta);

log.debug("Database module loaded");

export interface Database {
	// Sequelize instance (for transactions and advanced queries)
	readonly sequelize: Sequelize;

	// DAOs (for backwards compatibility and direct access in single-tenant mode)
	readonly auditEventDao: AuditEventDao;
	readonly assetDao: AssetDao;
	readonly collabConvoDao: CollabConvoDao;
	readonly docDao: DocDao;
	readonly docDraftDao: DocDraftDao;
	readonly docDraftEditHistoryDao: DocDraftEditHistoryDao;
	readonly docHistoryDao: DocHistoryDao;
	readonly docDraftSectionChangesDao: DocDraftSectionChangesDao;
	readonly docsiteDao: DocsiteDao;
	readonly siteDao: SiteDao;
	readonly githubInstallationDao: GitHubInstallationDao;
	readonly integrationDao: IntegrationDao;
	readonly jobDao: JobDao;
	readonly legacyTableCleanupDao: LegacyTableCleanupDao;
	readonly syncCommitDao: SyncCommitDao;
	readonly syncArticleDao: SyncArticleDao;
	readonly visitDao: VisitDao;
	readonly activeUserDao: ActiveUserDao;
	readonly archivedUserDao: ArchivedUserDao;
	readonly userInvitationDao: UserInvitationDao;
	readonly userOnboardingDao: UserOnboardingDao;
	readonly userSpacePreferenceDao: UserSpacePreferenceDao;
	readonly userPreferenceDao: UserPreferenceDao;
	readonly sourceDao: SourceDao;
	readonly spaceDao: SpaceDao;
	readonly roleDao: RoleDao;
	readonly permissionDao: PermissionDao;

	// Providers (for multi-tenant support - use these in routers)
	readonly auditEventDaoProvider: DaoProvider<AuditEventDao>;
	readonly assetDaoProvider: DaoProvider<AssetDao>;
	readonly collabConvoDaoProvider: DaoProvider<CollabConvoDao>;
	readonly docDaoProvider: DaoProvider<DocDao>;
	readonly docDraftDaoProvider: DaoProvider<DocDraftDao>;
	readonly docDraftEditHistoryDaoProvider: DaoProvider<DocDraftEditHistoryDao>;
	readonly docHistoryDaoProvider: DaoProvider<DocHistoryDao>;
	readonly docDraftSectionChangesDaoProvider: DaoProvider<DocDraftSectionChangesDao>;
	readonly docsiteDaoProvider: DaoProvider<DocsiteDao>;
	readonly siteDaoProvider: DaoProvider<SiteDao>;
	readonly githubInstallationDaoProvider: DaoProvider<GitHubInstallationDao>;
	readonly integrationDaoProvider: DaoProvider<IntegrationDao>;
	readonly jobDaoProvider: DaoProvider<JobDao>;
	readonly syncCommitDaoProvider: DaoProvider<SyncCommitDao>;
	readonly syncArticleDaoProvider: DaoProvider<SyncArticleDao>;
	readonly visitDaoProvider: DaoProvider<VisitDao>;
	readonly activeUserDaoProvider: DaoProvider<ActiveUserDao>;
	readonly archivedUserDaoProvider: DaoProvider<ArchivedUserDao>;
	readonly userInvitationDaoProvider: DaoProvider<UserInvitationDao>;
	readonly userOnboardingDaoProvider: DaoProvider<UserOnboardingDao>;
	readonly userSpacePreferenceDaoProvider: DaoProvider<UserSpacePreferenceDao>;
	readonly userPreferenceDaoProvider: DaoProvider<UserPreferenceDao>;
	readonly sourceDaoProvider: DaoProvider<SourceDao>;
	readonly spaceDaoProvider: DaoProvider<SpaceDao>;
	readonly roleDaoProvider: DaoProvider<RoleDao>;
	readonly permissionDaoProvider: DaoProvider<PermissionDao>;
}

/**
 * Interface for DAOs that need to run post-sync operations.
 *
 * IMPORTANT: postSync hooks MUST be idempotent (safe to run multiple times).
 * In multi-tenant serverless environments, multiple instances may call postSync
 * concurrently for the same tenant database.
 *
 * Idempotency patterns:
 * - Use `CREATE INDEX IF NOT EXISTS` / `CREATE SEQUENCE IF NOT EXISTS`
 * - Check state before making changes (e.g., query if already partitioned)
 * - Wrap operations in try-catch to handle concurrent execution gracefully
 * - Fire-and-forget async operations should be safe for duplicate execution
 */
export interface DaoPostSyncHook {
	postSync(sequelize: Sequelize, db: Database): Promise<void>;
}

export interface CreateDatabaseOptions {
	/**
	 * Force sequelize.sync() to run even in Vercel/serverless environments.
	 * Use this during bootstrap operations where we need to create tables.
	 */
	forceSync?: boolean;
	/**
	 * Skip postSync hooks. Use this during dev migrations where connections are
	 * closed after each migration and fire-and-forget postSync tasks would fail.
	 */
	skipPostSync?: boolean;
}

/**
 * Logs current database schema state for debugging purposes.
 */
async function logDatabaseState(sequelize: Sequelize): Promise<void> {
	const [schemaResult] = (await sequelize.query("SELECT current_schema()")) as [
		Array<{ current_schema: string }>,
		unknown,
	];
	const [searchPathResult] = (await sequelize.query("SHOW search_path")) as [Array<{ search_path: string }>, unknown];
	log.debug(
		"Database state - current_schema: %s, search_path: %s",
		schemaResult[0]?.current_schema,
		searchPathResult[0]?.search_path,
	);
}

/**
 * Syncs database models based on whether the schema is empty or has existing tables.
 * Partitioned models are excluded as they're managed by postSync hooks.
 */
async function syncDatabaseModels(sequelize: Sequelize): Promise<void> {
	const [results] = (await sequelize.query(
		"SELECT COUNT(*)::text as table_count FROM information_schema.tables WHERE table_schema = current_schema()",
	)) as [Array<{ table_count: string }>, unknown];
	const tableCount = Number.parseInt(results[0]?.table_count ?? "0", 10);

	const partitionedModels = ["audit_event"];

	if (tableCount === 0) {
		log.info("Empty schema detected, creating tables with sync()");
		await syncModelsExcludingPartitioned(sequelize, partitionedModels);
	} else {
		log.info("Existing schema with %d tables, checking for missing tables and updating", tableCount);
		await syncModelsWithMissingTableCheck(sequelize, partitionedModels);
	}
}

/**
 * Syncs all models except partitioned ones (creates tables without alter).
 * Used when schema is empty and all tables need to be created fresh.
 */
async function syncModelsExcludingPartitioned(sequelize: Sequelize, partitionedModels: Array<string>): Promise<void> {
	for (const modelName of Object.keys(sequelize.models)) {
		if (!partitionedModels.includes(modelName)) {
			await sequelize.models[modelName].sync();
			log.info("Synced model: %s", modelName);
		}
	}
}

/**
 * Syncs models with check for missing tables in existing schemas.
 * Uses a two-pass approach to handle foreign key dependencies correctly:
 * 1. First pass: CREATE all missing tables (ensures parent tables exist)
 * 2. Second pass: ALTER existing tables (now all FK targets exist)
 *
 * This prevents errors like "relation 'spaces' does not exist" when altering
 * a table (like 'docs') that has a FK to a table (like 'spaces') that hasn't
 * been created yet.
 */
async function syncModelsWithMissingTableCheck(sequelize: Sequelize, partitionedModels: Array<string>): Promise<void> {
	const modelsToCreate: Array<string> = [];
	const modelsToAlter: Array<string> = [];

	// First, categorize all models as needing create or alter
	for (const modelName of Object.keys(sequelize.models)) {
		if (partitionedModels.includes(modelName)) {
			continue;
		}

		const model = sequelize.models[modelName];
		const tableName = model.tableName as string;

		// Check if table exists in current schema
		const tableCheck = (await sequelize.query(
			"SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = :tableName",
			{
				replacements: { tableName },
				type: QueryTypes.SELECT,
			},
		)) as Array<{ table_name: string }>;

		if (!tableCheck || tableCheck.length === 0) {
			modelsToCreate.push(modelName);
		} else {
			modelsToAlter.push(modelName);
		}
	}

	// Pass 1: Create all missing tables first
	// This ensures parent tables (like 'spaces') exist before child tables
	// (like 'docs') try to create FK constraints
	for (const modelName of modelsToCreate) {
		const model = sequelize.models[modelName];
		log.info("Creating missing table: %s", model.tableName);
		await model.sync();
	}

	// Pass 2: Alter existing tables
	// Now all tables exist, so FK constraint validation will succeed
	for (const modelName of modelsToAlter) {
		const model = sequelize.models[modelName];
		await model.sync({ alter: true });
	}
}

/**
 * Runs postSync hooks for all DAOs that have them.
 */
async function runPostSyncHooks(sequelize: Sequelize, db: Database): Promise<void> {
	for (const daoKey of Object.keys(db)) {
		// biome-ignore lint/suspicious/noExplicitAny: Dynamic DAO access requires any type
		const dao = (db as any)[daoKey];
		if (typeof dao.postSync === "function") {
			log.info(`Running postSync for DAO: ${daoKey}`);
			await (dao as DaoPostSyncHook).postSync(sequelize, db);
		}
	}
}

export async function createDatabase(sequelize: Sequelize, options?: CreateDatabaseOptions): Promise<Database> {
	// Pre-define models with foreign key dependencies in the correct order.
	// Sequelize sync() creates tables in model definition order, so parent tables
	// must be defined BEFORE child tables that reference them.
	//
	// Foreign key dependencies:
	// - integrations (no dependencies)
	// - spaces (no dependencies)
	// - sources -> integrations (integrationId FK)
	// - space_sources -> spaces, sources
	// - docs -> spaces (spaceId FK)
	// - doc_drafts -> docs
	// - doc_draft_section_changes -> doc_drafts, docs
	// - doc_histories -> docs
	// - user_space_preferences -> spaces
	//
	// By calling define functions in order BEFORE any DAO creation,
	// we ensure Sequelize creates tables in dependency order during sync().
	defineRoles(sequelize); // RBAC: Must come before active_users (active_users.roleId FK)
	definePermissions(sequelize); // RBAC: No dependencies
	defineRolePermissions(sequelize); // RBAC: references roles and permissions
	defineActiveUsers(sequelize); // FK to roles (roleId)
	defineUserInvitations(sequelize); // FK to active_users
	defineArchivedUsers(sequelize); // FK to active_users
	defineIntegrations(sequelize); // Must come before sources (sources.integrationId references integrations)
	defineSpaces(sequelize); // Must come before docs (docs references spaces)
	defineSources(sequelize); // Source records (references integrations)
	defineSpaceSources(sequelize); // Junction table for space-source bindings (references spaces + sources)
	defineDocs(sequelize); // Must come before doc_drafts and doc_histories
	defineDocDrafts(sequelize); // Must come before doc_draft_section_changes
	defineDocDraftChanges(sequelize);
	defineDocHistories(sequelize); // References docs
	defineSyncArticles(sequelize);
	defineSyncCommits(sequelize);
	defineSyncCommitFiles(sequelize);
	defineSyncCommitFileReviews(sequelize);
	defineUserOnboarding(sequelize); // References active_users
	defineUserSpacePreferences(sequelize); // References spaces
	defineUserPreferences(sequelize); // User favorites (no FK dependencies)

	// Create section changes DAO first since DocDraftDao needs it as a parameter
	const docDraftSectionChangesDao = createDocDraftSectionChangesDao(sequelize);

	// Create all DAOs (order doesn't matter now since models are pre-defined)
	const auditEventDao = createAuditEventDao(sequelize);
	const assetDao = createAssetDao(sequelize);
	const collabConvoDao = createCollabConvoDao(sequelize);
	const docDao = createDocDao(sequelize);
	const docDraftDao = createDocDraftDao(sequelize, docDraftSectionChangesDao);
	const docDraftEditHistoryDao = createDocDraftEditHistoryDao(sequelize);
	const docHistoryDao = createDocHistoryDao(sequelize);
	const docsiteDao = createDocsiteDao(sequelize);
	const siteDao = createSiteDao(sequelize);
	const githubInstallationDao = createGitHubInstallationDao(sequelize);
	const integrationDao = createIntegrationDao(sequelize);
	const jobDao = createJobDao(sequelize);
	const legacyTableCleanupDao = createLegacyTableCleanupDao(sequelize);
	const syncCommitDao = createSyncCommitDao(sequelize);
	const syncArticleDao = createSyncArticleDao(sequelize);
	const visitDao = createVisitDao(sequelize);
	const activeUserDao = createActiveUserDao(sequelize);
	const archivedUserDao = createArchivedUserDao(sequelize);
	const userInvitationDao = createUserInvitationDao(sequelize);
	const userOnboardingDao = createUserOnboardingDao(sequelize);
	const userSpacePreferenceDao = createUserSpacePreferenceDao(sequelize);
	const userPreferenceDao = createUserPreferenceDao(sequelize);
	const sourceDao = createSourceDao(sequelize);
	const spaceDao = createSpaceDao(sequelize);
	const roleDao = createRoleDao(sequelize);
	const permissionDao = createPermissionDao(sequelize);

	const db = {
		// Sequelize instance
		sequelize,

		// DAOs
		auditEventDao,
		assetDao,
		collabConvoDao,
		docDao,
		docDraftDao,
		docDraftEditHistoryDao,
		docHistoryDao,
		docDraftSectionChangesDao,
		docsiteDao,
		siteDao,
		githubInstallationDao,
		integrationDao,
		jobDao,
		legacyTableCleanupDao,
		syncCommitDao,
		syncArticleDao,
		visitDao,
		activeUserDao,
		archivedUserDao,
		userInvitationDao,
		userOnboardingDao,
		userSpacePreferenceDao,
		userPreferenceDao,
		sourceDao,
		spaceDao,
		roleDao,
		permissionDao,

		// Providers (for multi-tenant support - pass default DAO to each provider)
		auditEventDaoProvider: createAuditEventDaoProvider(auditEventDao),
		assetDaoProvider: createAssetDaoProvider(assetDao),
		collabConvoDaoProvider: createCollabConvoDaoProvider(collabConvoDao),
		docDaoProvider: createDocDaoProvider(docDao),
		docDraftDaoProvider: createDocDraftDaoProvider(docDraftDao),
		docDraftEditHistoryDaoProvider: createDocDraftEditHistoryDaoProvider(docDraftEditHistoryDao),
		docHistoryDaoProvider: createDocHistoryDaoProvider(docHistoryDao),
		docDraftSectionChangesDaoProvider: createDocDraftSectionChangesDaoProvider(docDraftSectionChangesDao),
		docsiteDaoProvider: createDocsiteDaoProvider(docsiteDao),
		siteDaoProvider: createSiteDaoProvider(siteDao),
		githubInstallationDaoProvider: createGitHubInstallationDaoProvider(githubInstallationDao),
		integrationDaoProvider: createIntegrationDaoProvider(integrationDao),
		jobDaoProvider: createJobDaoProvider(jobDao),
		syncCommitDaoProvider: createSyncCommitDaoProvider(syncCommitDao),
		syncArticleDaoProvider: createSyncArticleDaoProvider(syncArticleDao),
		visitDaoProvider: createVisitDaoProvider(visitDao),
		activeUserDaoProvider: createActiveUserDaoProvider(activeUserDao),
		archivedUserDaoProvider: createArchivedUserDaoProvider(archivedUserDao),
		userInvitationDaoProvider: createUserInvitationDaoProvider(userInvitationDao),
		userOnboardingDaoProvider: createUserOnboardingDaoProvider(userOnboardingDao),
		userSpacePreferenceDaoProvider: createUserSpacePreferenceDaoProvider(userSpacePreferenceDao),
		userPreferenceDaoProvider: createUserPreferenceDaoProvider(userPreferenceDao),
		sourceDaoProvider: createSourceDaoProvider(sourceDao),
		spaceDaoProvider: createSpaceDaoProvider(spaceDao),
		roleDaoProvider: createRoleDaoProvider(roleDao),
		permissionDaoProvider: createPermissionDaoProvider(permissionDao),
	};

	// Log current schema and search_path for debugging
	await logDatabaseState(sequelize);

	// Skip sync when SKIP_SEQUELIZE_SYNC is set (e.g., ECS deployments)
	// Unless forceSync is true (used during bootstrap to explicitly create tables)
	const skipSync = !options?.forceSync && process.env.SKIP_SEQUELIZE_SYNC === "true";

	if (!skipSync) {
		await syncDatabaseModels(sequelize);
	} else {
		log.info("Skipping sequelize.sync() - SKIP_SEQUELIZE_SYNC=true (forceSync=%s)", options?.forceSync ?? false);
	}

	// Run postSync hooks unless skipped (e.g., during dev migrations)
	if (!options?.skipPostSync) {
		await runPostSyncHooks(sequelize, db);
	}

	return db;
}
