import type { ActiveUserDao } from "../dao/ActiveUserDao";
import { mockActiveUserDao } from "../dao/ActiveUserDao.mock";
import type { ArchivedUserDao } from "../dao/ArchivedUserDao";
import { mockArchivedUserDao } from "../dao/ArchivedUserDao.mock";
import type { AssetDao } from "../dao/AssetDao";
import { mockAssetDao } from "../dao/AssetDao.mock";
import type { AuditEventDao } from "../dao/AuditEventDao";
import { mockAuditEventDao } from "../dao/AuditEventDao.mock";
import type { CollabConvoDao } from "../dao/CollabConvoDao";
import { mockCollabConvoDao } from "../dao/CollabConvoDao.mock";
import type { DaoProvider } from "../dao/DaoProvider";
import type { DocDao } from "../dao/DocDao";
import { mockDocDao } from "../dao/DocDao.mock";
import type { DocDraftDao } from "../dao/DocDraftDao";
import { mockDocDraftDao } from "../dao/DocDraftDao.mock";
import type { DocDraftEditHistoryDao } from "../dao/DocDraftEditHistoryDao";
import { mockDocDraftEditHistoryDao } from "../dao/DocDraftEditHistoryDao.mock";
import type { DocDraftSectionChangesDao } from "../dao/DocDraftSectionChangesDao";
import { mockDocDraftSectionChangesDao } from "../dao/DocDraftSectionChangesDao.mock";
import type { DocHistoryDao } from "../dao/DocHistoryDao";
import { mockDocHistoryDao } from "../dao/DocHistoryDao.mock";
import type { DocsiteDao } from "../dao/DocsiteDao";
import { mockDocsiteDao } from "../dao/DocsiteDao.mock";
import type { GitHubInstallationDao } from "../dao/GitHubInstallationDao";
import { mockGitHubInstallationDao } from "../dao/GitHubInstallationDao.mock";
import type { IntegrationDao } from "../dao/IntegrationDao";
import { mockIntegrationDao } from "../dao/IntegrationDao.mock";
import type { JobDao } from "../dao/JobDao";
import { mockJobDao } from "../dao/JobDao.mock";
import type { LegacyTableCleanupDao } from "../dao/LegacyTableCleanupDao";
import type { PermissionDao } from "../dao/PermissionDao";
import type { RoleDao } from "../dao/RoleDao";
import type { SiteDao } from "../dao/SiteDao";
import { mockSiteDao } from "../dao/SiteDao.mock";
import type { SourceDao } from "../dao/SourceDao";
import { mockSourceDao } from "../dao/SourceDao.mock";
import type { SpaceDao } from "../dao/SpaceDao";
import { mockSpaceDao } from "../dao/SpaceDao.mock";
import type { SyncArticleDao } from "../dao/SyncArticleDao";
import { mockSyncArticleDao } from "../dao/SyncArticleDao.mock";
import type { SyncCommitDao } from "../dao/SyncCommitDao";
import { mockSyncCommitDao } from "../dao/SyncCommitDao.mock";
import type { UserInvitationDao } from "../dao/UserInvitationDao";
import { mockUserInvitationDao } from "../dao/UserInvitationDao.mock";
import type { UserOnboardingDao } from "../dao/UserOnboardingDao";
import { mockUserOnboardingDao } from "../dao/UserOnboardingDao.mock";
import type { UserPreferenceDao } from "../dao/UserPreferenceDao";
import { mockUserPreferenceDao } from "../dao/UserPreferenceDao.mock";
import type { UserSpacePreferenceDao } from "../dao/UserSpacePreferenceDao";
import { mockUserSpacePreferenceDao } from "../dao/UserSpacePreferenceDao.mock";
import type { VisitDao } from "../dao/VisitDao";
import { mockVisitDao } from "../dao/VisitDao.mock";
import type { Database } from "./Database";
import type { Sequelize } from "sequelize";

/**
 * Creates a mock DaoProvider that always returns the given DAO.
 */
function mockDaoProvider<T>(dao: T): DaoProvider<T> {
	return { getDao: () => dao };
}

export function mockDatabase(partial?: Partial<Database>): Database {
	const auditEventDao = mockAuditEventDao();
	const assetDao = mockAssetDao();
	const collabConvoDao = mockCollabConvoDao();
	const docDao = mockDocDao();
	const docDraftDao = mockDocDraftDao();
	const docDraftEditHistoryDao = mockDocDraftEditHistoryDao();
	const docDraftSectionChangesDao = mockDocDraftSectionChangesDao();
	const docHistoryDao = mockDocHistoryDao();
	const docsiteDao = mockDocsiteDao();
	const siteDao = mockSiteDao();
	const syncCommitDao = mockSyncCommitDao();
	const syncArticleDao = mockSyncArticleDao();
	const sourceDao = mockSourceDao();
	const spaceDao = mockSpaceDao();
	const githubInstallationDao = mockGitHubInstallationDao();
	const integrationDao = mockIntegrationDao();
	const jobDao = mockJobDao();
	const userPreferenceDao = mockUserPreferenceDao();
	const userSpacePreferenceDao = mockUserSpacePreferenceDao();
	const visitDao = mockVisitDao();
	const activeUserDao = mockActiveUserDao();
	const archivedUserDao = mockArchivedUserDao();
	const userInvitationDao = mockUserInvitationDao();
	const userOnboardingDao = mockUserOnboardingDao();

	// RBAC DAOs (simple mocks)
	const roleDao = {} as RoleDao;
	const permissionDao = {} as PermissionDao;
	const legacyTableCleanupDao = {} as LegacyTableCleanupDao;

	return {
		// Sequelize instance (mock)
		sequelize: {} as Sequelize,

		// DAOs
		auditEventDao,
		assetDao,
		collabConvoDao,
		docDao,
		docDraftDao,
		docDraftEditHistoryDao,
		docDraftSectionChangesDao,
		docHistoryDao,
		docsiteDao,
		siteDao,
		syncCommitDao,
		syncArticleDao,
		sourceDao,
		spaceDao,
		githubInstallationDao,
		integrationDao,
		jobDao,
		legacyTableCleanupDao,
		userPreferenceDao,
		userSpacePreferenceDao,
		visitDao,
		activeUserDao,
		archivedUserDao,
		userInvitationDao,
		userOnboardingDao,
		roleDao,
		permissionDao,

		// Providers (return the same mock DAOs)
		auditEventDaoProvider: mockDaoProvider<AuditEventDao>(auditEventDao),
		assetDaoProvider: mockDaoProvider<AssetDao>(assetDao),
		collabConvoDaoProvider: mockDaoProvider<CollabConvoDao>(collabConvoDao),
		docDaoProvider: mockDaoProvider<DocDao>(docDao),
		docDraftDaoProvider: mockDaoProvider<DocDraftDao>(docDraftDao),
		docDraftEditHistoryDaoProvider: mockDaoProvider<DocDraftEditHistoryDao>(docDraftEditHistoryDao),
		docDraftSectionChangesDaoProvider: mockDaoProvider<DocDraftSectionChangesDao>(docDraftSectionChangesDao),
		docHistoryDaoProvider: mockDaoProvider<DocHistoryDao>(docHistoryDao),
		docsiteDaoProvider: mockDaoProvider<DocsiteDao>(docsiteDao),
		siteDaoProvider: mockDaoProvider<SiteDao>(siteDao),
		syncCommitDaoProvider: mockDaoProvider<SyncCommitDao>(syncCommitDao),
		syncArticleDaoProvider: mockDaoProvider<SyncArticleDao>(syncArticleDao),
		sourceDaoProvider: mockDaoProvider<SourceDao>(sourceDao),
		spaceDaoProvider: mockDaoProvider<SpaceDao>(spaceDao),
		githubInstallationDaoProvider: mockDaoProvider<GitHubInstallationDao>(githubInstallationDao),
		integrationDaoProvider: mockDaoProvider<IntegrationDao>(integrationDao),
		jobDaoProvider: mockDaoProvider<JobDao>(jobDao),
		userPreferenceDaoProvider: mockDaoProvider<UserPreferenceDao>(userPreferenceDao),
		userSpacePreferenceDaoProvider: mockDaoProvider<UserSpacePreferenceDao>(userSpacePreferenceDao),
		visitDaoProvider: mockDaoProvider<VisitDao>(visitDao),
		activeUserDaoProvider: mockDaoProvider<ActiveUserDao>(activeUserDao),
		archivedUserDaoProvider: mockDaoProvider<ArchivedUserDao>(archivedUserDao),
		userInvitationDaoProvider: mockDaoProvider<UserInvitationDao>(userInvitationDao),
		userOnboardingDaoProvider: mockDaoProvider<UserOnboardingDao>(userOnboardingDao),
		roleDaoProvider: mockDaoProvider<RoleDao>(roleDao),
		permissionDaoProvider: mockDaoProvider<PermissionDao>(permissionDao),

		...partial,
	};
}
