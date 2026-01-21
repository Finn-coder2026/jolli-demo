import type { AssetDao } from "../dao/AssetDao";
import { mockAssetDao } from "../dao/AssetDao.mock";
import type { AuditEventDao } from "../dao/AuditEventDao";
import { mockAuditEventDao } from "../dao/AuditEventDao.mock";
import type { AuthDao } from "../dao/AuthDao";
import { mockAuthDao } from "../dao/AuthDao.mock";
import type { CollabConvoDao } from "../dao/CollabConvoDao";
import { mockCollabConvoDao } from "../dao/CollabConvoDao.mock";
import type { ConvoDao } from "../dao/ConvoDao";
import { mockConvoDao } from "../dao/ConvoDao.mock";
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
import type { SiteDao } from "../dao/SiteDao";
import { mockSiteDao } from "../dao/SiteDao.mock";
import type { SpaceDao } from "../dao/SpaceDao";
import { mockSpaceDao } from "../dao/SpaceDao.mock";
import type { SyncArticleDao } from "../dao/SyncArticleDao";
import { mockSyncArticleDao } from "../dao/SyncArticleDao.mock";
import type { UserDao } from "../dao/UserDao";
import { mockUserDao } from "../dao/UserDao.mock";
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
	const authDao = mockAuthDao();
	const collabConvoDao = mockCollabConvoDao();
	const convoDao = mockConvoDao();
	const docDao = mockDocDao();
	const docDraftDao = mockDocDraftDao();
	const docDraftEditHistoryDao = mockDocDraftEditHistoryDao();
	const docDraftSectionChangesDao = mockDocDraftSectionChangesDao();
	const docHistoryDao = mockDocHistoryDao();
	const docsiteDao = mockDocsiteDao();
	const siteDao = mockSiteDao();
	const syncArticleDao = mockSyncArticleDao();
	const spaceDao = mockSpaceDao();
	const githubInstallationDao = mockGitHubInstallationDao();
	const integrationDao = mockIntegrationDao();
	const jobDao = mockJobDao();
	const visitDao = mockVisitDao();
	const userDao = mockUserDao();

	return {
		// Sequelize instance (mock)
		sequelize: {} as Sequelize,

		// DAOs
		auditEventDao,
		assetDao,
		authDao,
		collabConvoDao,
		convoDao,
		docDao,
		docDraftDao,
		docDraftEditHistoryDao,
		docDraftSectionChangesDao,
		docHistoryDao,
		docsiteDao,
		siteDao,
		syncArticleDao,
		spaceDao,
		githubInstallationDao,
		integrationDao,
		jobDao,
		visitDao,
		userDao,

		// Providers (return the same mock DAOs)
		auditEventDaoProvider: mockDaoProvider<AuditEventDao>(auditEventDao),
		assetDaoProvider: mockDaoProvider<AssetDao>(assetDao),
		authDaoProvider: mockDaoProvider<AuthDao>(authDao),
		collabConvoDaoProvider: mockDaoProvider<CollabConvoDao>(collabConvoDao),
		convoDaoProvider: mockDaoProvider<ConvoDao>(convoDao),
		docDaoProvider: mockDaoProvider<DocDao>(docDao),
		docDraftDaoProvider: mockDaoProvider<DocDraftDao>(docDraftDao),
		docDraftEditHistoryDaoProvider: mockDaoProvider<DocDraftEditHistoryDao>(docDraftEditHistoryDao),
		docDraftSectionChangesDaoProvider: mockDaoProvider<DocDraftSectionChangesDao>(docDraftSectionChangesDao),
		docHistoryDaoProvider: mockDaoProvider<DocHistoryDao>(docHistoryDao),
		docsiteDaoProvider: mockDaoProvider<DocsiteDao>(docsiteDao),
		siteDaoProvider: mockDaoProvider<SiteDao>(siteDao),
		syncArticleDaoProvider: mockDaoProvider<SyncArticleDao>(syncArticleDao),
		spaceDaoProvider: mockDaoProvider<SpaceDao>(spaceDao),
		githubInstallationDaoProvider: mockDaoProvider<GitHubInstallationDao>(githubInstallationDao),
		integrationDaoProvider: mockDaoProvider<IntegrationDao>(integrationDao),
		jobDaoProvider: mockDaoProvider<JobDao>(jobDao),
		visitDaoProvider: mockDaoProvider<VisitDao>(visitDao),
		userDaoProvider: mockDaoProvider<UserDao>(userDao),

		...partial,
	};
}
