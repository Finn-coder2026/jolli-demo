import { getConfig } from "../config/Config";
import type { Database } from "../core/Database";
import type { ImageStorageService } from "../services/ImageStorageService";
import { getTenantContext } from "../tenant/TenantContext";
import type { JobDefinition } from "../types/JobTypes";
import { extractImageReferences } from "../util/ImageBundler";
import { getLog } from "../util/Logger";
import type { JobScheduler } from "./JobScheduler.js";
import { z } from "zod";

const log = getLog(import.meta);

export const DETECT_ORPHANED_IMAGES = "asset:detect-orphaned-images";
export const CLEANUP_ORPHANED_IMAGES = "asset:cleanup-orphaned-images";

/**
 * Asset cleanup jobs for detecting and removing orphaned images.
 */
export interface AssetCleanupJobs {
	/**
	 * Get all asset cleanup job definitions.
	 */
	getDefinitions(): Array<JobDefinition>;

	/**
	 * Register all asset cleanup jobs with the scheduler.
	 */
	registerJobs(jobScheduler: JobScheduler): void;

	/**
	 * Queue asset cleanup jobs that should be scheduled on startup.
	 */
	queueJobs(jobScheduler: JobScheduler): Promise<void>;
}

/**
 * Create asset cleanup jobs.
 * @param defaultDb - The default Database to use when no tenant context is available.
 * @param imageStorageService - Service for deleting images from S3.
 */
export function createAssetCleanupJobs(
	defaultDb: Database,
	imageStorageService: ImageStorageService,
): AssetCleanupJobs {
	/**
	 * Get the Database to use - prefers tenant context, falls back to default.
	 */
	function getDatabase(): Database {
		const tenantContext = getTenantContext();
		if (tenantContext?.database) {
			return tenantContext.database;
		}
		return defaultDb;
	}

	/**
	 * Get all image references from all docs and drafts.
	 * Returns a deduplicated set of S3 keys.
	 */
	async function getAllImageReferences(db: Database): Promise<Set<string>> {
		const refs = new Set<string>();

		// Get all published article content
		const docContents = await db.docDao.getAllContent();
		for (const { content } of docContents) {
			for (const ref of extractImageReferences(content)) {
				refs.add(ref);
			}
		}

		// Get all draft content
		const draftContents = await db.docDraftDao.getAllContent();
		for (const { content } of draftContents) {
			for (const ref of extractImageReferences(content)) {
				refs.add(ref);
			}
		}

		return refs;
	}

	/**
	 * Get all job definitions.
	 */
	function getDefinitions(): Array<JobDefinition> {
		/**
		 * Job to detect and mark orphaned images.
		 * Runs daily to find images not referenced in any doc or draft.
		 */
		const detectOrphanedImagesDefinition: JobDefinition<Record<string, never>> = {
			name: DETECT_ORPHANED_IMAGES,
			description: "Detects unreferenced images and marks them as orphaned",
			category: "asset",
			schema: z.object({}),
			statsSchema: z.object({
				activeAssetsScanned: z.number(),
				orphanedAssetsScanned: z.number(),
				recentlyUploadedProtected: z.number(),
				newlyOrphaned: z.number(),
				restored: z.number(),
				totalReferences: z.number(),
			}),
			handler: async (_params, context) => {
				context.log("starting", {}, "info");

				const db = getDatabase();
				const config = getConfig();

				// Get all image references from docs and drafts
				const referencedKeys = await getAllImageReferences(db);
				context.log("collected-references", { count: referencedKeys.size }, "info");

				// Get all active assets
				const activeAssets = await db.assetDao.listActiveAssets();
				context.log("found-active-assets", { count: activeAssets.length }, "info");

				// Calculate cutoff date for recently uploaded protection
				const recentUploadCutoff = new Date();
				recentUploadCutoff.setDate(
					recentUploadCutoff.getDate() - config.ASSET_CLEANUP_RECENT_UPLOAD_BUFFER_DAYS,
				);

				// Find recently uploaded assets to protect
				const recentlyUploaded = await db.assetDao.findRecentlyUploaded(recentUploadCutoff);
				const recentlyUploadedKeys = new Set(recentlyUploaded.map(a => a.s3Key));
				context.log("protecting-recent-uploads", { count: recentlyUploadedKeys.size }, "info");

				// Find active assets that are not referenced (candidates for orphaning)
				const toOrphan: Array<string> = [];
				for (const asset of activeAssets) {
					// Skip recently uploaded assets
					if (recentlyUploadedKeys.has(asset.s3Key)) {
						continue;
					}
					// Mark as orphan if not referenced
					if (!referencedKeys.has(asset.s3Key)) {
						toOrphan.push(asset.s3Key);
					}
				}

				// Mark unreferenced assets as orphaned
				const orphanedCount = await db.assetDao.markAsOrphaned(toOrphan);
				context.log("marked-orphaned", { count: orphanedCount }, "info");

				// Find orphaned assets that are now referenced (restore them)
				const orphanedAssets = await db.assetDao.listAssets({ status: "orphaned" });
				const toRestore: Array<string> = [];
				for (const asset of orphanedAssets) {
					if (referencedKeys.has(asset.s3Key)) {
						toRestore.push(asset.s3Key);
					}
				}

				// Restore re-referenced assets
				const restoredCount = await db.assetDao.restoreToActive(toRestore);
				if (restoredCount > 0) {
					context.log("restored-assets", { count: restoredCount }, "info");
				}

				await context.setCompletionInfo({
					messageKey: "success",
					context: {
						scanned: activeAssets.length,
						orphaned: orphanedCount,
						restored: restoredCount,
					},
				});

				await context.updateStats({
					activeAssetsScanned: activeAssets.length,
					orphanedAssetsScanned: orphanedAssets.length,
					recentlyUploadedProtected: recentlyUploadedKeys.size,
					newlyOrphaned: orphanedCount,
					restored: restoredCount,
					totalReferences: referencedKeys.size,
				});
			},
			showInDashboard: true,
		};

		/**
		 * Job to delete orphaned images that have been orphaned beyond the grace period.
		 * Deletes from S3 first, then soft-deletes the DB record.
		 */
		const cleanupOrphanedImagesDefinition: JobDefinition<Record<string, never>> = {
			name: CLEANUP_ORPHANED_IMAGES,
			description: "Deletes orphaned images that have exceeded the grace period",
			category: "asset",
			schema: z.object({}),
			statsSchema: z.object({
				candidatesFound: z.number(),
				deletedFromS3: z.number(),
				deletedFromDb: z.number(),
				errors: z.number(),
			}),
			handler: async (_params, context) => {
				context.log("starting", {}, "info");

				const db = getDatabase();
				const config = getConfig();

				// Calculate cutoff date for grace period
				const gracePeriodCutoff = new Date();
				gracePeriodCutoff.setDate(gracePeriodCutoff.getDate() - config.ASSET_CLEANUP_GRACE_PERIOD_DAYS);

				// Find orphans that have exceeded the grace period
				const orphansToDelete = await db.assetDao.findOrphanedOlderThan(gracePeriodCutoff);
				context.log("found-orphans-to-delete", { count: orphansToDelete.length }, "info");

				let deletedFromS3 = 0;
				let deletedFromDb = 0;
				let errors = 0;

				// Delete each orphan: S3 first, then DB
				for (const asset of orphansToDelete) {
					try {
						// Delete from S3
						await imageStorageService.deleteImage(asset.s3Key);
						deletedFromS3++;

						// Soft-delete from DB
						const deleted = await db.assetDao.softDelete(asset.s3Key);
						if (deleted) {
							deletedFromDb++;
						}

						context.log("deleted-asset", { s3Key: asset.s3Key }, "info");
					} catch (error) {
						// Log error and continue - will retry on next run
						const errorMsg = error instanceof Error ? error.message : String(error);
						log.error(
							{ s3Key: asset.s3Key, error: errorMsg },
							"Failed to delete orphaned asset %s: %s",
							asset.s3Key,
							errorMsg,
						);
						context.log("delete-error", { s3Key: asset.s3Key, error: errorMsg }, "error");
						errors++;
					}
				}

				context.log("cleanup-complete", { deletedFromS3, deletedFromDb, errors }, "info");

				await context.setCompletionInfo({
					messageKey: "success",
					context: {
						deleted: deletedFromDb,
						errors,
					},
				});

				await context.updateStats({
					candidatesFound: orphansToDelete.length,
					deletedFromS3,
					deletedFromDb,
					errors,
				});
			},
			showInDashboard: true,
		};

		return [detectOrphanedImagesDefinition, cleanupOrphanedImagesDefinition] as Array<JobDefinition>;
	}

	function registerJobs(jobScheduler: JobScheduler): void {
		for (const definition of getDefinitions()) {
			jobScheduler.registerJob(definition);
		}
	}

	/**
	 * Queue asset cleanup jobs that should be scheduled on startup.
	 */
	async function queueJobs(jobScheduler: JobScheduler): Promise<void> {
		// Schedule the detection job to run daily at 3 AM
		await jobScheduler.queueJob({
			name: DETECT_ORPHANED_IMAGES,
			params: {},
			options: {
				cron: "0 3 * * *",
				singletonKey: DETECT_ORPHANED_IMAGES,
			},
		});
		log.debug("Scheduled %s to run daily at 3 AM", DETECT_ORPHANED_IMAGES);

		// Schedule the cleanup job to run daily at 4 AM
		await jobScheduler.queueJob({
			name: CLEANUP_ORPHANED_IMAGES,
			params: {},
			options: {
				cron: "0 4 * * *",
				singletonKey: CLEANUP_ORPHANED_IMAGES,
			},
		});
		log.debug("Scheduled %s to run daily at 4 AM", CLEANUP_ORPHANED_IMAGES);
	}

	return {
		getDefinitions,
		registerJobs,
		queueJobs,
	};
}
