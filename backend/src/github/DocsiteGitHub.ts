import { isBinaryFile } from "../util/FileTypeUtil";
import { getLog } from "../util/Logger";
import type { Octokit } from "@octokit/rest";

const log = getLog(import.meta);

export interface FileTree {
	path: string;
	content: string;
	/** Encoding for content. Defaults to "utf-8". Use "base64" for binary files. */
	encoding?: "utf-8" | "base64";
}

/**
 * Data returned by getConsistencyCheckData for fast consistency validation.
 * Only fetches what's needed: file paths and _meta.ts content.
 */
export interface ConsistencyCheckData {
	/** All file paths in the repository (no content) */
	filePaths: Array<string>;
	/** Content of content/_meta.ts if it exists */
	metaContent?: string;
}

export interface DocsiteGitHubClient {
	createRepository(orgName: string, repoName: string, isPrivate: boolean): Promise<string>;
	uploadDocusaurusProject(owner: string, repo: string, files: Array<FileTree>): Promise<void>;
	/**
	 * Uploads files to a repository while preserving non-MD/MDX files.
	 * Returns the new commit SHA for immediate download (avoids GitHub API race conditions).
	 */
	uploadDocusaurusProjectPreservingNonMdFiles(
		owner: string,
		repo: string,
		files: Array<FileTree>,
		additionalPathsToDelete?: Array<string>,
	): Promise<string>;
	updateRepositoryFile(
		owner: string,
		repo: string,
		filePath: string,
		content: string,
		commitMessage: string,
	): Promise<void>;
	/**
	 * Downloads all files from a repository.
	 * @param commitSha - Optional specific commit SHA to download from (avoids race conditions)
	 */
	downloadRepository(owner: string, repo: string, commitSha?: string): Promise<Array<FileTree>>;
	/**
	 * Fast consistency check data retrieval.
	 * Only fetches file paths (from tree) and _meta.ts content (single blob).
	 * Much faster than downloadRepository which downloads all file contents.
	 */
	getConsistencyCheckData(owner: string, repo: string): Promise<ConsistencyCheckData>;
	deleteRepository(owner: string, repo: string): Promise<void>;
	/**
	 * Creates a folder in the repository by creating a .gitkeep file inside it.
	 * Users can manually add _meta.ts files if needed for navigation configuration.
	 * @param owner - Repository owner
	 * @param repo - Repository name
	 * @param folderPath - Path of the folder to create (e.g., "content/guides")
	 */
	createFolder(owner: string, repo: string, folderPath: string): Promise<void>;
	/**
	 * Deletes a folder and all its contents from the repository.
	 * @param owner - Repository owner
	 * @param repo - Repository name
	 * @param folderPath - Path of the folder to delete (e.g., "content/guides")
	 */
	deleteFolder(owner: string, repo: string, folderPath: string): Promise<void>;
	/**
	 * Renames a folder in the repository by moving all files to a new path.
	 * @param owner - Repository owner
	 * @param repo - Repository name
	 * @param folderPath - Current path of the folder (e.g., "content/guides")
	 * @param newName - New name for the folder (just the name, not full path)
	 */
	renameFolder(owner: string, repo: string, folderPath: string, newName: string): Promise<void>;
	/**
	 * Moves a file to a different folder in the repository.
	 * @param owner - Repository owner
	 * @param repo - Repository name
	 * @param filePath - Current path of the file (e.g., "content/intro.mdx")
	 * @param destinationFolder - Destination folder path (e.g., "content/guides")
	 */
	moveFile(owner: string, repo: string, filePath: string, destinationFolder: string): Promise<void>;
	/**
	 * Lists all files in a folder.
	 * @param owner - Repository owner
	 * @param repo - Repository name
	 * @param folderPath - Path of the folder to list
	 */
	listFolderContents(owner: string, repo: string, folderPath: string): Promise<Array<string>>;
}

/**
 * Creates a GitHub client specifically for managing docsite repositories.
 * Provides methods to create repositories and upload Docusaurus projects via the GitHub API.
 */
export function createDocsiteGitHub(octokit: Octokit): DocsiteGitHubClient {
	return {
		createRepository,
		uploadDocusaurusProject,
		uploadDocusaurusProjectPreservingNonMdFiles,
		updateRepositoryFile,
		downloadRepository,
		getConsistencyCheckData,
		deleteRepository,
		createFolder,
		deleteFolder,
		renameFolder,
		moveFile,
		listFolderContents,
	};

	/**
	 * Creates a new repository in the specified GitHub organization.
	 *
	 * @param orgName - The organization name (e.g., "Jolli-sample-repos")
	 * @param repoName - The repository name (must be unique within the org)
	 * @param isPrivate - Whether the repository should be private
	 * @returns The clone URL of the created repository
	 */
	async function createRepository(orgName: string, repoName: string, isPrivate: boolean): Promise<string> {
		const visibility = isPrivate ? "private" : "public";
		try {
			const response = await octokit.rest.repos.createInOrg({
				org: orgName,
				name: repoName,
				private: isPrivate,
				auto_init: true, // Initialize with README
				description: "Docusaurus documentation site generated by Jolli",
			});

			log.info(
				{ action: "github_repo_created", org: orgName, repo: repoName, visibility },
				"Created GitHub repository %s/%s (visibility: %s)",
				orgName,
				repoName,
				visibility,
			);

			return response.data.clone_url;
		} catch (error) {
			if (isConflict(error)) {
				throw new Error(`Repository ${orgName}/${repoName} already exists`);
			}
			throw error;
		}
	}

	/**
	 * Updates a single file in a GitHub repository with an automatic commit message.
	 *
	 * @param owner - The repository owner (organization or user)
	 * @param repo - The repository name
	 * @param filePath - The path of the file to update
	 * @param content - The new file content
	 * @param commitMessage - The commit message
	 */
	async function updateRepositoryFile(
		owner: string,
		repo: string,
		filePath: string,
		content: string,
		commitMessage: string,
	): Promise<void> {
		try {
			// Step 1: Get the latest commit SHA from the main branch
			const { data: refData } = await octokit.rest.git.getRef({
				owner,
				repo,
				ref: "heads/main",
			});
			const latestCommitSha = refData.object.sha;

			// Step 2: Get the tree SHA of the latest commit
			const { data: commitData } = await octokit.rest.git.getCommit({
				owner,
				repo,
				commit_sha: latestCommitSha,
			});
			const baseTreeSha = commitData.tree.sha;

			// Step 3: Create a blob with the new file content
			const { data: blobData } = await octokit.rest.git.createBlob({
				owner,
				repo,
				content,
				encoding: "utf-8",
			});

			// Step 4: Create a new tree with the updated file
			const { data: newTree } = await octokit.rest.git.createTree({
				owner,
				repo,
				tree: [
					{
						path: filePath,
						mode: "100644",
						type: "blob",
						sha: blobData.sha,
					},
				],
				base_tree: baseTreeSha,
			});

			// Step 5: Create a new commit pointing to the new tree
			const { data: newCommit } = await octokit.rest.git.createCommit({
				owner,
				repo,
				message: commitMessage,
				tree: newTree.sha,
				parents: [latestCommitSha],
			});

			// Step 6: Update the main branch reference to point to the new commit
			await octokit.rest.git.updateRef({
				owner,
				repo,
				ref: "heads/main",
				sha: newCommit.sha,
			});
			/* v8 ignore start - error handling for unexpected errors is difficult to test */
		} catch (error) {
			if (isNotFound(error)) {
				throw new Error(`Repository ${owner}/${repo} or file ${filePath} not found`);
			}
			throw error;
		}
		/* v8 ignore stop */
	}

	/**
	 * Uploads a complete Docusaurus project to a GitHub repository.
	 * Creates a single commit with all files using the Git Trees API.
	 *
	 * @param owner - The repository owner (organization or user)
	 * @param repo - The repository name
	 * @param files - Array of files with paths and content
	 */
	async function uploadDocusaurusProject(owner: string, repo: string, files: Array<FileTree>): Promise<void> {
		try {
			// Step 1: Get the latest commit SHA from the main branch
			const { data: refData } = await octokit.rest.git.getRef({
				owner,
				repo,
				ref: "heads/main",
			});
			const latestCommitSha = refData.object.sha;

			// Step 2: Get the tree SHA of the latest commit
			const { data: commitData } = await octokit.rest.git.getCommit({
				owner,
				repo,
				commit_sha: latestCommitSha,
			});
			const baseTreeSha = commitData.tree.sha;

			// Step 3: Create blobs for binary files in parallel, build tree entries
			type TreeEntry =
				| { path: string; mode: "100644"; type: "blob"; content: string }
				| { path: string; mode: "100644"; type: "blob"; sha: string };

			const binaryFiles = files.filter(f => f.encoding === "base64");
			const textFiles = files.filter(f => f.encoding !== "base64");

			// Create blobs for all binary files in parallel
			const blobResults = await Promise.all(
				binaryFiles.map(async file => {
					const { data: blobData } = await octokit.rest.git.createBlob({
						owner,
						repo,
						content: file.content,
						encoding: "base64",
					});
					return { path: file.path, sha: blobData.sha };
				}),
			);

			// Build tree entries: text files with inline content, binary files with blob SHA
			const tree: Array<TreeEntry> = [
				...textFiles.map(file => ({
					path: file.path,
					mode: "100644" as const,
					type: "blob" as const,
					content: file.content,
				})),
				...blobResults.map(blob => ({
					path: blob.path,
					mode: "100644" as const,
					type: "blob" as const,
					sha: blob.sha,
				})),
			];

			const { data: newTree } = await octokit.rest.git.createTree({
				owner,
				repo,
				tree,
				base_tree: baseTreeSha, // Preserve existing files like README
			});

			// Step 4: Create a new commit pointing to the new tree
			const { data: newCommit } = await octokit.rest.git.createCommit({
				owner,
				repo,
				message: "Add Docusaurus documentation site",
				tree: newTree.sha,
				parents: [latestCommitSha],
			});

			// Step 5: Update the main branch reference to point to the new commit
			await octokit.rest.git.updateRef({
				owner,
				repo,
				ref: "heads/main",
				sha: newCommit.sha,
			});
		} catch (error) {
			if (isNotFound(error)) {
				throw new Error(`Repository ${owner}/${repo} not found`);
			}
			throw error;
		}
	}

	/**
	 * Uploads a Docusaurus project while preserving non-MD/MDX files.
	 * This is used during regeneration to keep custom files intact.
	 *
	 * @param owner - The repository owner (organization or user)
	 * @param repo - The repository name
	 * @param files - Array of new files with paths and content
	 * @param additionalPathsToDelete - Optional array of additional file paths to delete (e.g., deleted JSON/YAML articles)
	 * @returns The new commit SHA for immediate download (avoids GitHub API race conditions)
	 */
	async function uploadDocusaurusProjectPreservingNonMdFiles(
		owner: string,
		repo: string,
		files: Array<FileTree>,
		additionalPathsToDelete?: Array<string>,
	): Promise<string> {
		try {
			// Step 1: Get the latest commit SHA from the main branch
			const { data: refData } = await octokit.rest.git.getRef({
				owner,
				repo,
				ref: "heads/main",
			});
			const latestCommitSha = refData.object.sha;

			// Step 2: Get the tree SHA of the latest commit
			const { data: commitData } = await octokit.rest.git.getCommit({
				owner,
				repo,
				commit_sha: latestCommitSha,
			});
			const baseTreeSha = commitData.tree.sha;

			// Step 3: Get the full current tree to identify existing non-MD/MDX files
			const { data: currentTree } = await octokit.rest.git.getTree({
				owner,
				repo,
				tree_sha: baseTreeSha,
				recursive: "true",
			});

			// Step 4: Build a map of new files to upload
			const newFileMap = new Map<string, FileTree>();
			for (const file of files) {
				newFileMap.set(file.path, file);
			}

			// Step 5: Identify MD/MDX files in the current tree that should be removed
			const mdMdxFilesToRemove = currentTree.tree
				.filter(item => {
					/* v8 ignore next 3 - defensive: item.type and item.path are always present in tree items */
					if (item.type !== "blob" || !item.path) {
						return false;
					}
					const ext = item.path.split(".").pop()?.toLowerCase();
					return (ext === "md" || ext === "mdx") && !newFileMap.has(item.path);
				})
				.map(item => item.path as string);

			// Step 6: Create tree entries for new files (handle binary files via parallel blob creation)
			type TreeEntry =
				| { path: string; mode: "100644"; type: "blob"; content: string }
				| { path: string; mode: "100644"; type: "blob"; sha: string | null };

			const binaryFiles = files.filter(f => f.encoding === "base64");
			const textFiles = files.filter(f => f.encoding !== "base64");

			// Create blobs for all binary files in parallel
			const blobResults = await Promise.all(
				binaryFiles.map(async file => {
					const { data: blobData } = await octokit.rest.git.createBlob({
						owner,
						repo,
						content: file.content,
						encoding: "base64",
					});
					return { path: file.path, sha: blobData.sha };
				}),
			);

			// Build tree entries: text files with inline content, binary files with blob SHA
			const tree: Array<TreeEntry> = [
				...textFiles.map(file => ({
					path: file.path,
					mode: "100644" as const,
					type: "blob" as const,
					content: file.content,
				})),
				...blobResults.map(blob => ({
					path: blob.path,
					mode: "100644" as const,
					type: "blob" as const,
					sha: blob.sha,
				})),
			];

			// Step 7: Add entries to explicitly delete old MD/MDX files
			for (const pathToRemove of mdMdxFilesToRemove) {
				tree.push({
					path: pathToRemove,
					mode: "100644" as const,
					type: "blob" as const,
					// Setting sha to null deletes the file
					sha: null,
				});
			}

			// Step 7b: Add entries to delete additional files (e.g., deleted JSON/YAML articles)
			if (additionalPathsToDelete && additionalPathsToDelete.length > 0) {
				// Get existing paths in the repository to only delete files that actually exist
				const existingPaths = new Set(currentTree.tree.map(item => item.path));

				for (const pathToRemove of additionalPathsToDelete) {
					// Only add deletion entries for files that exist and aren't in the new files
					if (existingPaths.has(pathToRemove) && !newFileMap.has(pathToRemove)) {
						tree.push({
							path: pathToRemove,
							mode: "100644" as const,
							type: "blob" as const,
							sha: null,
						});
					}
				}
			}

			// Step 8: Create new tree
			const { data: newTree } = await octokit.rest.git.createTree({
				owner,
				repo,
				tree,
				base_tree: baseTreeSha, // Preserve all other files
			});

			// Step 9: Create a new commit
			const { data: newCommit } = await octokit.rest.git.createCommit({
				owner,
				repo,
				message: "Update documentation (preserve custom files)",
				tree: newTree.sha,
				parents: [latestCommitSha],
			});

			// Step 10: Update the main branch reference
			await octokit.rest.git.updateRef({
				owner,
				repo,
				ref: "heads/main",
				sha: newCommit.sha,
			});

			// Return the new commit SHA for immediate download (avoids race conditions)
			return newCommit.sha;
			/* v8 ignore start - error handling for unexpected errors is difficult to test */
		} catch (error) {
			if (isNotFound(error)) {
				throw new Error(`Repository ${owner}/${repo} not found`);
			}
			throw error;
		}
		/* v8 ignore stop */
	}

	/**
	 * Downloads all files from a GitHub repository.
	 *
	 * @param owner - The repository owner (organization or user)
	 * @param repo - The repository name
	 * @param commitSha - Optional specific commit SHA to download from (avoids race conditions)
	 * @returns Array of files with paths and content
	 */
	async function downloadRepository(owner: string, repo: string, commitSha?: string): Promise<Array<FileTree>> {
		try {
			// Use provided commit SHA or fetch the latest from main branch
			let targetCommitSha: string;
			if (commitSha) {
				targetCommitSha = commitSha;
			} else {
				const { data: refData } = await octokit.rest.git.getRef({
					owner,
					repo,
					ref: "heads/main",
				});
				targetCommitSha = refData.object.sha;
			}

			// Get the tree SHA of the target commit
			const { data: commitData } = await octokit.rest.git.getCommit({
				owner,
				repo,
				commit_sha: targetCommitSha,
			});
			const treeSha = commitData.tree.sha;

			// Get the full tree recursively
			const { data: treeData } = await octokit.rest.git.getTree({
				owner,
				repo,
				tree_sha: treeSha,
				recursive: "true",
			});

			// Download all blobs (files)
			const files: Array<FileTree> = [];
			for (const item of treeData.tree) {
				// Only process files (blobs), skip directories (trees)
				if (item.type === "blob" && item.sha && item.path) {
					// Get blob content
					const { data: blobData } = await octokit.rest.git.getBlob({
						owner,
						repo,
						file_sha: item.sha,
					});

					// Binary files (images, fonts, etc.) should stay as base64 to avoid corruption
					// Text files are decoded to UTF-8 for easier manipulation
					if (isBinaryFile(item.path)) {
						// Strip newlines from GitHub's base64 response (they chunk it)
						const cleanBase64 = blobData.content.replace(/\n/g, "");
						files.push({ path: item.path, content: cleanBase64, encoding: "base64" });
					} else {
						const content = Buffer.from(blobData.content, "base64").toString("utf-8");
						files.push({ path: item.path, content });
					}
				}
			}

			return files;
		} catch (error) {
			if (isNotFound(error)) {
				throw new Error(`Repository ${owner}/${repo} not found`);
			}
			throw error;
		}
	}

	/**
	 * Fast consistency check data retrieval for _meta.ts validation.
	 * Only fetches:
	 * 1. File paths from the tree (single API call with recursive=true)
	 * 2. Content of content/_meta.ts if it exists (single blob fetch)
	 *
	 * This is MUCH faster than downloadRepository() which downloads every file's content.
	 * For a repo with 50 files: 2-3 API calls vs 53+ API calls.
	 *
	 * @param owner - The repository owner (organization or user)
	 * @param repo - The repository name
	 * @returns File paths and optionally _meta.ts content
	 */
	async function getConsistencyCheckData(owner: string, repo: string): Promise<ConsistencyCheckData> {
		try {
			// Get the latest commit SHA from main branch
			const { data: refData } = await octokit.rest.git.getRef({
				owner,
				repo,
				ref: "heads/main",
			});
			const commitSha = refData.object.sha;

			// Get the tree SHA of the commit
			const { data: commitData } = await octokit.rest.git.getCommit({
				owner,
				repo,
				commit_sha: commitSha,
			});
			const treeSha = commitData.tree.sha;

			// Get the full tree recursively (single API call for all paths)
			const { data: treeData } = await octokit.rest.git.getTree({
				owner,
				repo,
				tree_sha: treeSha,
				recursive: "true",
			});

			// Extract file paths (no content download needed for most files)
			const filePaths: Array<string> = [];
			let metaFileSha: string | undefined;

			for (const item of treeData.tree) {
				if (item.type === "blob" && item.path) {
					filePaths.push(item.path);
					// Remember the SHA of _meta.ts for content download
					if (item.path === "content/_meta.ts" && item.sha) {
						metaFileSha = item.sha;
					}
				}
			}

			// Only download content of _meta.ts if it exists (single blob fetch)
			if (metaFileSha) {
				const { data: blobData } = await octokit.rest.git.getBlob({
					owner,
					repo,
					file_sha: metaFileSha,
				});
				const metaContent = Buffer.from(blobData.content, "base64").toString("utf-8");
				return { filePaths, metaContent };
			}

			return { filePaths };
		} catch (error) {
			if (isNotFound(error)) {
				throw new Error(`Repository ${owner}/${repo} not found`);
			}
			throw error;
		}
	}

	/**
	 * Deletes a GitHub repository.
	 *
	 * @param owner - The repository owner (organization or user)
	 * @param repo - The repository name
	 */
	async function deleteRepository(owner: string, repo: string): Promise<void> {
		try {
			await octokit.rest.repos.delete({
				owner,
				repo,
			});
		} catch (error) {
			if (isNotFound(error)) {
				// Repository doesn't exist, consider it already deleted
				return;
			}
			if (isForbidden(error)) {
				// GitHub token lacks delete_repo permission
				throw new Error(
					`GitHub token does not have permission to delete repositories. ` +
						`Please add the 'delete_repo' scope to your GitHub token. ` +
						`Repository ${owner}/${repo} must be deleted manually.`,
				);
			}
			throw error;
		}
	}

	/**
	 * Helper function to get the latest commit SHA and tree SHA from the main branch.
	 * Used by folder operations to avoid code duplication.
	 */
	async function getLatestTreeInfo(owner: string, repo: string): Promise<{ commitSha: string; treeSha: string }> {
		const { data: refData } = await octokit.rest.git.getRef({
			owner,
			repo,
			ref: "heads/main",
		});
		const commitSha = refData.object.sha;

		const { data: commitData } = await octokit.rest.git.getCommit({
			owner,
			repo,
			commit_sha: commitSha,
		});
		const treeSha = commitData.tree.sha;

		return { commitSha, treeSha };
	}

	/**
	 * Helper function to create a tree, commit, and update the branch reference.
	 * Used by folder operations to avoid code duplication.
	 */
	async function commitTreeChanges(
		owner: string,
		repo: string,
		tree: Array<{ path: string; mode: "100644"; type: "blob"; sha: string | null }>,
		baseTreeSha: string,
		latestCommitSha: string,
		message: string,
	): Promise<void> {
		const { data: newTree } = await octokit.rest.git.createTree({
			owner,
			repo,
			tree,
			base_tree: baseTreeSha,
		});

		const { data: newCommit } = await octokit.rest.git.createCommit({
			owner,
			repo,
			message,
			tree: newTree.sha,
			parents: [latestCommitSha],
		});

		await octokit.rest.git.updateRef({
			owner,
			repo,
			ref: "heads/main",
			sha: newCommit.sha,
		});
	}

	/**
	 * Creates a folder in the repository by creating a .gitkeep file inside it.
	 * In Git, folders don't exist on their own - they're implied by files within them.
	 * Users can manually add _meta.ts files if needed for navigation configuration.
	 */
	async function createFolder(owner: string, repo: string, folderPath: string): Promise<void> {
		// Normalize path - remove trailing slash if present
		const normalizedPath = folderPath.replace(/\/$/, "");

		// Create a .gitkeep file to establish the folder (standard Git convention for empty folders)
		const gitkeepPath = `${normalizedPath}/.gitkeep`;

		await updateRepositoryFile(owner, repo, gitkeepPath, "", `Create folder ${normalizedPath}`);
	}

	/**
	 * Deletes a folder and all its contents from the repository.
	 */
	async function deleteFolder(owner: string, repo: string, folderPath: string): Promise<void> {
		try {
			// Normalize path
			const normalizedPath = folderPath.replace(/\/$/, "");

			// Get all files in the folder
			const folderContents = await listFolderContents(owner, repo, normalizedPath);

			if (folderContents.length === 0) {
				// Folder doesn't exist or is empty
				return;
			}

			// Get tree info using helper
			const { commitSha, treeSha } = await getLatestTreeInfo(owner, repo);

			// Create tree entries to delete all files in the folder
			const tree = folderContents.map(filePath => ({
				path: filePath,
				mode: "100644" as const,
				type: "blob" as const,
				sha: null as string | null,
			}));

			// Commit the changes using helper
			await commitTreeChanges(owner, repo, tree, treeSha, commitSha, `Delete folder ${normalizedPath}`);
		} catch (error) {
			if (isNotFound(error)) {
				throw new Error(`Repository ${owner}/${repo} not found`);
			}
			throw error;
		}
	}

	/**
	 * Renames a folder by moving all its files to a new path.
	 */
	async function renameFolder(owner: string, repo: string, folderPath: string, newName: string): Promise<void> {
		try {
			// Normalize path
			const normalizedPath = folderPath.replace(/\/$/, "");

			// Calculate new folder path
			const pathParts = normalizedPath.split("/");
			pathParts[pathParts.length - 1] = newName;
			const newFolderPath = pathParts.join("/");

			// Get all files in the folder
			const folderContents = await listFolderContents(owner, repo, normalizedPath);

			if (folderContents.length === 0) {
				throw new Error(`Folder ${normalizedPath} is empty or doesn't exist`);
			}

			// Get tree info using helper
			const { commitSha, treeSha } = await getLatestTreeInfo(owner, repo);

			// Get current tree to read file SHAs
			const { data: currentTree } = await octokit.rest.git.getTree({
				owner,
				repo,
				tree_sha: treeSha,
				recursive: "true",
			});

			// Build a map of file SHA by path
			const fileShaMap = new Map<string, string>();
			for (const item of currentTree.tree) {
				if (item.type === "blob" && item.path && item.sha) {
					fileShaMap.set(item.path, item.sha);
				}
			}

			// Build tree entries for rename (add new paths, delete old paths)
			const tree: Array<{ path: string; mode: "100644"; type: "blob"; sha: string | null }> = [];

			for (const oldPath of folderContents) {
				const relativePath = oldPath.substring(normalizedPath.length + 1);
				const newPath = `${newFolderPath}/${relativePath}`;
				const fileSha = fileShaMap.get(oldPath);

				if (fileSha) {
					// Add file at new location
					tree.push({
						path: newPath,
						mode: "100644" as const,
						type: "blob" as const,
						sha: fileSha,
					});
				}

				// Delete old file
				tree.push({
					path: oldPath,
					mode: "100644" as const,
					type: "blob" as const,
					sha: null,
				});
			}

			// Commit the changes using helper
			await commitTreeChanges(
				owner,
				repo,
				tree,
				treeSha,
				commitSha,
				`Rename folder ${normalizedPath} to ${newFolderPath}`,
			);
		} catch (error) {
			if (isNotFound(error)) {
				throw new Error(`Repository ${owner}/${repo} not found`);
			}
			throw error;
		}
	}

	/**
	 * Moves a file to a different folder.
	 */
	async function moveFile(owner: string, repo: string, filePath: string, destinationFolder: string): Promise<void> {
		try {
			// Normalize destination path
			const normalizedDestination = destinationFolder.replace(/\/$/, "");

			// Get the filename from the original path
			const fileName = filePath.split("/").pop();
			if (!fileName) {
				throw new Error(`Invalid file path: ${filePath}`);
			}

			// Calculate new path
			const newPath = `${normalizedDestination}/${fileName}`;

			// Get tree info using helper
			const { commitSha, treeSha } = await getLatestTreeInfo(owner, repo);

			// Get current tree to find file SHA
			const { data: currentTree } = await octokit.rest.git.getTree({
				owner,
				repo,
				tree_sha: treeSha,
				recursive: "true",
			});

			// Find the file SHA
			let fileSha: string | undefined;
			for (const item of currentTree.tree) {
				if (item.type === "blob" && item.path === filePath && item.sha) {
					fileSha = item.sha;
					break;
				}
			}

			if (!fileSha) {
				throw new Error(`File ${filePath} not found`);
			}

			// Create tree entries: add file at new location, delete at old location
			const tree: Array<{ path: string; mode: "100644"; type: "blob"; sha: string | null }> = [
				{
					path: newPath,
					mode: "100644" as const,
					type: "blob" as const,
					sha: fileSha,
				},
				{
					path: filePath,
					mode: "100644" as const,
					type: "blob" as const,
					sha: null,
				},
			];

			// Commit the changes using helper
			await commitTreeChanges(owner, repo, tree, treeSha, commitSha, `Move ${filePath} to ${newPath}`);
		} catch (error) {
			if (isNotFound(error)) {
				throw new Error(`Repository ${owner}/${repo} not found`);
			}
			throw error;
		}
	}

	/**
	 * Lists all files in a folder.
	 */
	async function listFolderContents(owner: string, repo: string, folderPath: string): Promise<Array<string>> {
		try {
			// Normalize path
			const normalizedPath = folderPath.replace(/\/$/, "");
			const prefix = `${normalizedPath}/`;

			// Get tree info using helper
			const { treeSha } = await getLatestTreeInfo(owner, repo);

			// Get the full tree recursively
			const { data: treeData } = await octokit.rest.git.getTree({
				owner,
				repo,
				tree_sha: treeSha,
				recursive: "true",
			});

			// Filter to only files within the folder
			const files: Array<string> = [];
			for (const item of treeData.tree) {
				if (item.type === "blob" && item.path && item.path.startsWith(prefix)) {
					files.push(item.path);
				}
			}

			return files;
		} catch (error) {
			if (isNotFound(error)) {
				throw new Error(`Repository ${owner}/${repo} not found`);
			}
			throw error;
		}
	}
}

/**
 * Checks if an error is a 404 Not Found error.
 */
function isNotFound(error: unknown): boolean {
	return !!error && typeof error === "object" && "status" in error && error.status === 404;
}

/**
 * Checks if an error is a 403 Forbidden error.
 */
function isForbidden(error: unknown): boolean {
	return !!error && typeof error === "object" && "status" in error && error.status === 403;
}

/**
 * Checks if an error is a 409 Conflict error (e.g., repository already exists).
 */
function isConflict(error: unknown): boolean {
	return !!error && typeof error === "object" && "status" in error && error.status === 409;
}
