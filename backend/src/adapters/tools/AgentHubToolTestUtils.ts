/**
 * Shared test utilities for agent hub tool tests.
 * Provides mock factories and helpers used across individual tool test files.
 */

import type { DaoProvider } from "../../dao/DaoProvider";
import type { DocDao } from "../../dao/DocDao";
import type { DocDraftDao } from "../../dao/DocDraftDao";
import type { IntegrationDao } from "../../dao/IntegrationDao";
import type { SourceDao } from "../../dao/SourceDao";
import type { SpaceDao } from "../../dao/SpaceDao";
import type { IntegrationsManager } from "../../integrations/IntegrationsManager";
import type { PermissionService } from "../../services/PermissionService";
import type { AgentHubToolDeps } from "./AgentHubTools";
import { vi } from "vitest";

/** Creates a mock PermissionService with stub methods. */
export function createMockPermissionService(): PermissionService {
	return {
		hasPermission: vi.fn(),
		getUserPermissions: vi.fn(),
		hasAnyPermission: vi.fn(),
		hasAllPermissions: vi.fn(),
		getUserRole: vi.fn(),
	} as unknown as PermissionService;
}

/** Creates a mock SpaceDao with stub methods. */
export function createMockSpaceDao(): SpaceDao {
	return {
		listSpaces: vi.fn(),
		createSpace: vi.fn(),
		getSpace: vi.fn(),
		getSpaceByJrn: vi.fn(),
		getSpaceBySlug: vi.fn(),
		updateSpace: vi.fn(),
		deleteSpace: vi.fn(),
		migrateContent: vi.fn(),
		getSpaceStats: vi.fn(),
		getDefaultSpace: vi.fn(),
		createDefaultSpaceIfNeeded: vi.fn(),
		migrateOrphanedDocs: vi.fn(),
	} as unknown as SpaceDao;
}

/** Creates a mock DocDao with stub methods. */
export function createMockDocDao(): DocDao {
	return {
		createDoc: vi.fn(),
		readDoc: vi.fn(),
		readDocById: vi.fn(),
		listDocs: vi.fn(),
		updateDoc: vi.fn(),
		searchDocsByTitle: vi.fn(),
		searchArticlesForLink: vi.fn(),
		getTreeContent: vi.fn(),
		getTrashContent: vi.fn(),
		softDelete: vi.fn(),
		restore: vi.fn(),
		permanentlyDelete: vi.fn(),
		permanentlyDeleteOldItems: vi.fn(),
		searchInSpace: vi.fn(),
		reorderDoc: vi.fn(),
		moveDoc: vi.fn(),
		reorderAt: vi.fn(),
		bulkMoveToSpace: vi.fn(),
	} as unknown as DocDao;
}

/** Creates a mock DocDraftDao with stub methods. */
export function createMockDocDraftDao(): DocDraftDao {
	return {
		createDocDraft: vi.fn(),
		getDocDraft: vi.fn(),
		updateDocDraft: vi.fn(),
		deleteDocDraft: vi.fn(),
		deleteAllDocDrafts: vi.fn(),
		listDocDrafts: vi.fn(),
		listDocDraftsByUser: vi.fn(),
		findByDocId: vi.fn(),
		searchDocDraftsByTitle: vi.fn(),
		getDraftsWithPendingChanges: vi.fn(),
		listAccessibleDrafts: vi.fn(),
		findDraftsByExactTitle: vi.fn(),
		findDraftByDocId: vi.fn(),
		shareDraft: vi.fn(),
		listSharedDrafts: vi.fn(),
		countMyNewDrafts: vi.fn(),
		countMySharedNewDrafts: vi.fn(),
		countSharedWithMeDrafts: vi.fn(),
		countArticlesWithAgentSuggestions: vi.fn(),
		getAllContent: vi.fn(),
	} as unknown as DocDraftDao;
}

/** Creates a mock IntegrationDao with stub methods. */
export function createMockIntegrationDao(): IntegrationDao {
	return {
		listIntegrations: vi.fn(),
		createIntegration: vi.fn(),
		getIntegration: vi.fn(),
		countIntegrations: vi.fn(),
		updateIntegration: vi.fn(),
		deleteIntegration: vi.fn(),
		removeAllGitHubIntegrations: vi.fn(),
		removeDuplicateGitHubIntegrations: vi.fn(),
		getGitHubRepoIntegration: vi.fn(),
		lookupIntegration: vi.fn(),
	} as unknown as IntegrationDao;
}

/** Creates a mock SourceDao with stub methods. */
export function createMockSourceDao(): SourceDao {
	return {
		listSourcesForSpace: vi.fn(),
		listSpacesForSource: vi.fn(),
		findSourcesMatchingJrn: vi.fn(),
	} as unknown as SourceDao;
}

/** Creates a mock IntegrationsManager with stub methods. */
export function createMockIntegrationsManager(): IntegrationsManager {
	return {
		getIntegrationTypes: vi.fn(),
		getIntegrationTypeBehavior: vi.fn(),
		createIntegration: vi.fn(),
		getIntegration: vi.fn(),
		listIntegrations: vi.fn(),
		countIntegrations: vi.fn(),
		updateIntegration: vi.fn(),
		deleteIntegration: vi.fn(),
		handleAccessCheck: vi.fn(),
		getJobDefinitions: vi.fn(),
	} as unknown as IntegrationsManager;
}

/** Wraps a DAO mock in a DaoProvider that returns it from getDao(). */
export function wrapInProvider<T>(dao: T): DaoProvider<T> {
	return { getDao: () => dao };
}

/** Creates a full AgentHubToolDeps with all mock DAOs and services. */
export function createMockDeps(): {
	deps: AgentHubToolDeps;
	mockPermissionService: PermissionService;
	mockSpaceDao: SpaceDao;
	mockDocDao: DocDao;
	mockDocDraftDao: DocDraftDao;
	mockIntegrationDao: IntegrationDao;
	mockSourceDao: SourceDao;
	mockIntegrationsManager: IntegrationsManager;
} {
	const mockPermissionService = createMockPermissionService();
	const mockSpaceDao = createMockSpaceDao();
	const mockDocDao = createMockDocDao();
	const mockDocDraftDao = createMockDocDraftDao();
	const mockIntegrationDao = createMockIntegrationDao();
	const mockSourceDao = createMockSourceDao();
	const mockIntegrationsManager = createMockIntegrationsManager();

	const deps: AgentHubToolDeps = {
		spaceDaoProvider: wrapInProvider(mockSpaceDao),
		docDaoProvider: wrapInProvider(mockDocDao),
		docDraftDaoProvider: wrapInProvider(mockDocDraftDao),
		integrationDaoProvider: wrapInProvider(mockIntegrationDao),
		sourceDaoProvider: wrapInProvider(mockSourceDao),
		permissionService: mockPermissionService,
		integrationsManager: mockIntegrationsManager,
	};

	return {
		deps,
		mockPermissionService,
		mockSpaceDao,
		mockDocDao,
		mockDocDraftDao,
		mockIntegrationDao,
		mockSourceDao,
		mockIntegrationsManager,
	};
}
