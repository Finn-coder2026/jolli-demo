/**
 * Audit Trail
 *
 * Records impact agent runs for debugging and Phase 2 integration.
 * Stores audit records in .jolli/impact-audit.json in the workspace root.
 */

import { getLog } from "../../../shared/logger";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

const logger = getLog(import.meta);

/**
 * Evidence for why an article was flagged for update.
 */
export interface ArticleEvidence {
	readonly changedFile: string;
	readonly pattern: string;
	readonly matchType: "exact" | "glob";
	readonly source: string;
}

/**
 * Status of an article after processing by the impact agent.
 */
export type ArticleStatus = "updated" | "unchanged" | "skipped" | "error";

/**
 * Result of processing a single article.
 */
export interface ArticleAuditEntry {
	readonly jrn: string;
	readonly path: string;
	readonly status: ArticleStatus;
	readonly evidence: ReadonlyArray<ArticleEvidence>;
	readonly patch?: string;
	readonly reasoning?: string;
	readonly error?: string;
	readonly editReasons?: ReadonlyArray<string>;
}

/**
 * Commit information for the audit record.
 */
export interface AuditCommit {
	readonly sha: string;
	readonly message: string;
}

/**
 * Trigger information for the audit record.
 */
export interface AuditTrigger {
	readonly base?: string;
	readonly commits: ReadonlyArray<AuditCommit>;
	readonly changedFiles: ReadonlyArray<string>;
}

/**
 * A single audit record for an impact agent run.
 */
export interface ImpactAuditRecord {
	readonly id: string;
	readonly timestamp: string;
	readonly source: "git" | "sync";
	readonly trigger: AuditTrigger;
	readonly articles: Array<ArticleAuditEntry>;
}

/**
 * The full audit log file structure.
 */
export interface ImpactAuditLog {
	readonly version: 1;
	readonly records: Array<ImpactAuditRecord>;
}

// Constants
const AUDIT_DIR = ".jolli";
const AUDIT_FILE = "impact-audit.json";
const MAX_RECORDS = 50;

/**
 * Gets the full path to the audit file.
 */
function getAuditFilePath(workspaceRoot: string): string {
	return path.join(workspaceRoot, AUDIT_DIR, AUDIT_FILE);
}

/**
 * Ensures the .jolli directory exists.
 */
async function ensureAuditDir(workspaceRoot: string): Promise<void> {
	const auditDir = path.join(workspaceRoot, AUDIT_DIR);
	try {
		await fs.mkdir(auditDir, { recursive: true });
	} catch {
		// Directory may already exist
		const stats = await fs.stat(auditDir);
		if (!stats.isDirectory()) {
			throw new Error(`${AUDIT_DIR} exists but is not a directory`);
		}
	}
}

/**
 * Loads the audit log from disk.
 * Returns a default empty log if the file doesn't exist.
 */
export async function loadAuditLog(workspaceRoot: string): Promise<ImpactAuditLog> {
	const filePath = getAuditFilePath(workspaceRoot);

	try {
		const content = await fs.readFile(filePath, "utf8");
		const parsed = JSON.parse(content) as ImpactAuditLog;

		// Validate version
		if (parsed.version !== 1) {
			logger.warn("Unsupported audit log version: %d, starting fresh", parsed.version);
			return { version: 1, records: [] };
		}

		return parsed;
	} catch (error) {
		// File doesn't exist or is invalid - return empty log
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return { version: 1, records: [] };
		}
		logger.warn("Failed to load audit log, starting fresh: %s", (error as Error).message);
		return { version: 1, records: [] };
	}
}

/**
 * Saves an audit record to the log.
 * Prunes old records to maintain MAX_RECORDS limit.
 */
export async function saveAuditRecord(workspaceRoot: string, record: ImpactAuditRecord): Promise<void> {
	await ensureAuditDir(workspaceRoot);

	const log = await loadAuditLog(workspaceRoot);
	const records = [...log.records, record];

	// Prune old records if needed
	const prunedRecords = records.slice(-MAX_RECORDS);

	const updatedLog: ImpactAuditLog = {
		version: 1,
		records: prunedRecords,
	};

	const filePath = getAuditFilePath(workspaceRoot);
	await fs.writeFile(filePath, JSON.stringify(updatedLog, null, 2), "utf8");

	logger.debug("Saved audit record %s (total records: %d)", record.id, prunedRecords.length);
}

/**
 * Creates a new audit record with a unique ID and timestamp.
 */
export function createAuditRecord(source: "git" | "sync", trigger: AuditTrigger): ImpactAuditRecord {
	return {
		id: randomUUID(),
		timestamp: new Date().toISOString(),
		source,
		trigger,
		articles: [],
	};
}

/**
 * Adds an article result to an audit record.
 * Returns a new record with the article added (immutable).
 */
export function addArticleToRecord(record: ImpactAuditRecord, entry: ArticleAuditEntry): ImpactAuditRecord {
	return {
		...record,
		articles: [...record.articles, entry],
	};
}

/**
 * Gets the most recent audit record from the log.
 * Returns null if the log is empty.
 */
export function getLatestRecord(log: ImpactAuditLog): ImpactAuditRecord | null {
	if (log.records.length === 0) {
		return null;
	}
	return log.records[log.records.length - 1] ?? null;
}

/**
 * Gets articles that were updated in a specific audit record.
 */
export function getUpdatedArticles(record: ImpactAuditRecord): ReadonlyArray<ArticleAuditEntry> {
	return record.articles.filter(a => a.status === "updated");
}

/**
 * Gets the most recent git-based audit record from the log.
 * Used by Phase 2 to find the Phase 1 results to propagate from.
 * @param log - The audit log to search
 * @returns The most recent git-based record, or null if none found
 */
export function getLatestGitRecord(log: ImpactAuditLog): ImpactAuditRecord | null {
	for (let i = log.records.length - 1; i >= 0; i--) {
		const record = log.records[i];
		if (record && record.source === "git") {
			return record;
		}
	}
	return null;
}

/**
 * Gets the file paths of articles that were updated in a record.
 * @param record - The audit record
 * @returns Array of file paths for updated articles
 */
export function getUpdatedArticlePaths(record: ImpactAuditRecord): ReadonlyArray<string> {
	return record.articles.filter(a => a.status === "updated").map(a => a.path);
}
