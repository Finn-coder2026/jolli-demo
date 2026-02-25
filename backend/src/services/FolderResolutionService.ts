import type { DocDao } from "../dao/DocDao";
import type { Doc } from "../model/Doc";
import { getLog } from "../util/Logger";

const log = getLog(import.meta);

/**
 * Result of resolving a folder hierarchy.
 */
export interface FolderResolutionResult {
	/** The resolved space ID */
	spaceId: number;
	/** The resolved parent folder ID (undefined for root level) */
	parentId: number | undefined;
	/** Path to the containing folder (e.g., "docs/guide") */
	folderPath: string;
}

/**
 * Service for resolving and creating folder hierarchies from file paths.
 * Used by sync operations to place files in the correct folder structure.
 */
export class FolderResolutionService {
	private folderCache: Map<string, Doc> = new Map();

	/**
	 * Resolves or creates the folder hierarchy for a given server path.
	 *
	 * @param serverPath Full path like "docs/guide/intro.md"
	 * @param spaceId The space to create folders in
	 * @param docDao The DocDao for database operations
	 * @returns The resolved folder information
	 */
	async resolveFolderHierarchy(serverPath: string, spaceId: number, docDao: DocDao): Promise<FolderResolutionResult> {
		// Extract folder path from server path (e.g., "docs/guide" from "docs/guide/intro.md")
		const folderPath = this.extractFolderPath(serverPath);

		if (!folderPath) {
			// File is at root level
			return { spaceId, parentId: undefined, folderPath: "" };
		}

		// Parse folder names from path
		const folderNames = folderPath.split("/").filter(Boolean);

		// Resolve each folder level, creating as needed
		let parentId: number | undefined;

		for (let i = 0; i < folderNames.length; i++) {
			const folderName = folderNames[i];
			const currentPath = folderNames.slice(0, i + 1).join("/");

			const folder = await this.getOrCreateFolder(spaceId, parentId ?? null, folderName, currentPath, docDao);

			parentId = folder.id;
		}

		return { spaceId, parentId, folderPath };
	}

	/**
	 * Extracts the folder path from a full file path.
	 * "docs/guide/intro.md" -> "docs/guide"
	 * "intro.md" -> ""
	 */
	extractFolderPath(serverPath: string): string {
		const lastSlash = serverPath.lastIndexOf("/");
		return lastSlash === -1 ? "" : serverPath.substring(0, lastSlash);
	}

	/**
	 * Gets an existing folder or creates it if it doesn't exist.
	 */
	private async getOrCreateFolder(
		spaceId: number,
		parentId: number | null,
		folderName: string,
		folderPath: string,
		docDao: DocDao,
	): Promise<Doc> {
		// Check cache first
		const cacheKey = `${spaceId}:${parentId ?? "null"}:${folderName}`;
		const cached = this.folderCache.get(cacheKey);
		if (cached) {
			log.debug("Folder cache hit for '%s' (key: %s)", folderName, cacheKey);
			return cached;
		}

		// Try to find existing folder
		let folder = await docDao.findFolderByName(spaceId, parentId, folderName);

		if (!folder) {
			// Create new folder
			log.info(
				"Creating folder '%s' at path '%s' in space %d under parent %s",
				folderName,
				folderPath,
				spaceId,
				parentId ?? "root",
			);

			const sortOrder = (await docDao.getMaxSortOrder(spaceId, parentId)) + 1;

			folder = await docDao.createDoc({
				content: "",
				contentType: "application/folder",
				updatedBy: "sync-server",
				contentMetadata: { title: folderName },
				source: undefined,
				sourceMetadata: undefined,
				spaceId,
				parentId: parentId ?? undefined,
				docType: "folder",
				sortOrder,
				createdBy: "sync-server",
			});
		}

		// Cache the folder
		this.folderCache.set(cacheKey, folder);

		return folder;
	}

	/**
	 * Clears the folder cache. Call this at the end of a sync batch.
	 */
	clearCache(): void {
		this.folderCache.clear();
	}
}

/**
 * Computes the serverPath for a document given its parentId and filename.
 * Walks up the folder hierarchy to build the full path.
 *
 * @param parentId The parent folder ID (undefined for root level)
 * @param filename The document's filename (e.g., "intro.md")
 * @param docDao The DocDao for database operations
 * @returns The full serverPath (e.g., "docs/guide/intro.md")
 */
export async function computeServerPathFromParent(
	parentId: number | undefined,
	filename: string,
	docDao: DocDao,
): Promise<string> {
	if (parentId === undefined) {
		// File is at root level
		return filename;
	}

	// Walk up the folder hierarchy to build the path
	const folderNames: Array<string> = [];
	let currentId: number | undefined = parentId;

	while (currentId !== undefined) {
		const folder = await docDao.readDocById(currentId);
		if (!folder || folder.docType !== "folder") {
			log.warn("Parent %d is not a folder or doesn't exist, stopping hierarchy walk", currentId);
			break;
		}

		const folderName = (folder.contentMetadata as { title?: string })?.title;
		if (folderName) {
			folderNames.unshift(folderName);
		}

		currentId = folder.parentId;
	}

	// Build the full path
	if (folderNames.length === 0) {
		return filename;
	}

	return `${folderNames.join("/")}/${filename}`;
}

/**
 * Creates a new FolderResolutionService instance.
 */
export function createFolderResolutionService(): FolderResolutionService {
	return new FolderResolutionService();
}
