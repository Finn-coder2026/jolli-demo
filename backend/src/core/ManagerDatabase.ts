/**
 * ManagerDatabase - DAO factory for Manager DB (registry database).
 *
 * The Manager DB stores centralized authentication data and tenant registry information.
 * This is separate from tenant-specific databases which store business data.
 *
 * @module ManagerDatabase
 */

import { createGlobalAuthDao, type GlobalAuthDao } from "../dao/GlobalAuthDao.js";
import { createGlobalUserDao, type GlobalUserDao } from "../dao/GlobalUserDao.js";
import { createOwnerInvitationDao, type OwnerInvitationDao } from "../dao/OwnerInvitationDao.js";
import { createPasswordHistoryDao, type PasswordHistoryDao } from "../dao/PasswordHistoryDao.js";
import { createRememberMeTokenDao, type RememberMeTokenDao } from "../dao/RememberMeTokenDao.js";
import { createUserOrgDao, type UserOrgDao } from "../dao/UserOrgDao.js";
import { createVerificationDao, type VerificationDao } from "../dao/VerificationDao.js";
import { defineGlobalAuths } from "../model/GlobalAuth.js";
import { defineGlobalUsers } from "../model/GlobalUser.js";
import { defineOwnerInvitations } from "../model/OwnerInvitation.js";
import { definePasswordHistory } from "../model/PasswordHistory.js";
import { defineRememberMeTokens } from "../model/RememberMeToken.js";
import { defineSessions } from "../model/Session.js";
import { defineUserOrgs } from "../model/UserOrg.js";
import { defineVerifications } from "../model/Verification.js";
import { getLog } from "../util/Logger.js";
import type { Sequelize } from "sequelize";

const log = getLog(import.meta);

// Module-level singleton for global access
let globalManagerDb: ManagerDatabase | null = null;

/**
 * Set the global ManagerDatabase instance.
 * Called during app startup in AppFactory.ts.
 */
export function setGlobalManagerDatabase(db: ManagerDatabase): void {
	globalManagerDb = db;
}

/**
 * Get the global ManagerDatabase instance.
 * Returns null if not initialized (single-tenant mode without Manager DB).
 */
export function getGlobalManagerDatabase(): ManagerDatabase | null {
	return globalManagerDb;
}

/**
 * Manager database interface containing all authentication-related DAOs
 */
export interface ManagerDatabase {
	readonly sequelize: Sequelize;
	readonly globalUserDao: GlobalUserDao;
	readonly globalAuthDao: GlobalAuthDao;
	readonly userOrgDao: UserOrgDao;
	readonly verificationDao: VerificationDao;
	readonly passwordHistoryDao: PasswordHistoryDao;
	readonly ownerInvitationDao: OwnerInvitationDao;
	readonly rememberMeTokenDao: RememberMeTokenDao;
}

/**
 * Create the Manager Database instance with all authentication DAOs.
 *
 * Note: Backend does NOT sync tables - manager app owns the schema lifecycle.
 * Backend only defines models and creates DAOs for read/write access.
 */
export function createManagerDatabase(sequelize: Sequelize): ManagerDatabase {
	log.info("Initializing Manager Database");

	// Define all models
	defineGlobalUsers(sequelize);
	defineGlobalAuths(sequelize);
	defineUserOrgs(sequelize);
	defineVerifications(sequelize);
	defineSessions(sequelize);
	definePasswordHistory(sequelize);
	defineOwnerInvitations(sequelize);
	defineRememberMeTokens(sequelize);

	// Create DAOs
	const globalUserDao = createGlobalUserDao(sequelize);
	const globalAuthDao = createGlobalAuthDao(sequelize);
	const userOrgDao = createUserOrgDao(sequelize);
	const verificationDao = createVerificationDao(sequelize);
	const passwordHistoryDao = createPasswordHistoryDao(sequelize);
	const ownerInvitationDao = createOwnerInvitationDao(sequelize);
	const rememberMeTokenDao = createRememberMeTokenDao(sequelize);

	const managerDb: ManagerDatabase = {
		sequelize,
		globalUserDao,
		globalAuthDao,
		userOrgDao,
		verificationDao,
		passwordHistoryDao,
		ownerInvitationDao,
		rememberMeTokenDao,
	};

	// Backend no longer syncs these tables - manager owns the schema lifecycle
	// Tables are created when manager starts up via manager/src/lib/db/Database.ts
	// Backend only defines models for DAO access (read/write operations)

	/*
	// Sync models (create tables if they don't exist)
	// NOTE: Commented out - Manager app now owns table creation
	const skipSync = process.env.SKIP_SEQUELIZE_SYNC === "true";
	if (!skipSync) {
		log.info("Syncing Manager DB models");
		await sequelize.sync({ alter: false });
		log.info("Manager DB sync completed");
	} else {
		log.info("Skipping Manager DB sync (SKIP_SEQUELIZE_SYNC=true)");
	}
	*/

	log.info("Skipping Manager DB sync (tables owned by Manager app)");

	return managerDb;
}
