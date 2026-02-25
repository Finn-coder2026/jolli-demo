import { auditLog, computeAuditChanges } from "../audit";
import { getConfig } from "../config/Config";
import type { DaoProvider } from "../dao/DaoProvider";
import type { SiteDao } from "../dao/SiteDao";
/* v8 ignore next */
import { createDocsiteGitHub, type FileTree } from "../github/DocsiteGitHub";
import { createOctokitGitHub } from "../github/OctokitGitHub";
import type { PermissionMiddlewareFactory } from "../middleware/PermissionMiddleware";
import type { Doc } from "../model/Doc";
import {
	type CustomDomainInfo,
	getMetadataForUpdate,
	getSiteMetadata,
	type NewSite,
	requireSiteMetadata,
	type Site,
	type SiteMetadata,
} from "../model/Site";
import {
	addBuildConnection,
	broadcastBuildEvent,
	clearEventBuffer,
	getBuildTempDir,
	registerBuildTempDir,
	removeBuildConnection,
	sendBuildEvent,
	unregisterBuildTempDir,
} from "../services/BuildStreamService";
import type { ImageStorageService } from "../services/ImageStorageService";
import { getTenantContext } from "../tenant/TenantContext";
import { resolveArticleLinks, validateArticleLinks } from "../util/ArticleLinkResolver";
import { validateSiteBranding } from "../util/BrandingValidation";
import { deepEquals } from "../util/DeepEquals";
import { checkDnsConfiguration } from "../util/DnsUtil";
import {
	checkDeploymentStatus,
	cleanupTempDirectory,
	type DeploymentResult,
	deployToVercel,
} from "../util/DocGenerationUtil";
import {
	createDocGenerator,
	type DocFramework,
	type DocGenerator,
	type DocGeneratorOptions,
	isValidFramework,
	type MigrationContext,
} from "../util/DocGeneratorFactory";
import { validateCustomDomain } from "../util/domain/DomainValidator";
import { getCachedAvailability, setCachedAvailability } from "../util/domain/SubdomainCache";
import { generateSubdomainSuggestion, validateSubdomain } from "../util/domain/SubdomainValidator";
import { bundleSiteImages } from "../util/ImageBundler";
import { getLog } from "../util/Logger";
import {
	convertToNextra4Config,
	formatPreGenerationErrors,
	getNextra3xFilesToDelete,
	getOrphanedContentFiles,
	MetaMerger,
	parseNextra3ThemeConfig,
	slugify,
	validateArticlesForGeneration,
} from "../util/NextraGenerationUtil";
import { createOctokit } from "../util/OctokitUtil";
import { generateGitHubRepoName, generateJolliSiteDomain } from "../util/SiteNameUtils";
import type { TokenUtil } from "../util/TokenUtil";
import { createBuildEventHandlers, VercelDeployer } from "../util/VercelDeployer";
import { createSiteAuthRouter } from "./SiteAuthRouter";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express, { type Router } from "express";
import type {
	ChangedArticle,
	ChangedConfigFile,
	ExistingNavMeta,
	ExistingNavMetaEntry,
	FileTreeNode,
	SiteBranding,
	UserInfo,
} from "jolli-common";

const log = getLog(import.meta);

interface NeedsUpdateResult {
	needsUpdate: boolean;
	hasAuthChange: boolean;
	hasBrandingChange: boolean;
	hasFolderStructureChange: boolean;
}

/**
 * Strips sensitive secrets (JWT private key and public key) from a site object
 * before returning it in an API response. These keys must remain in the DB for
 * server-side JWT signing/verification but must never be exposed to clients.
 * @internal Exported for testing
 */
export function stripSiteSecrets<T extends { metadata?: SiteMetadata | undefined }>(
	site: T | undefined,
): T | undefined {
	if (!site || !site.metadata?.jwtAuth) {
		return site;
	}
	const { privateKey: _priv, publicKey: _pub, ...jwtAuthWithoutKeys } = site.metadata.jwtAuth;
	return {
		...site,
		metadata: {
			...site.metadata,
			jwtAuth: jwtAuthWithoutKeys,
		},
	};
}

/**
 * Builds a site response object with needsUpdate status and granular change flags.
 * Centralizes the response shape used by list, detail, and update-articles endpoints.
 * Automatically strips secrets before returning.
 * @internal Exported for testing
 */
export function buildSiteUpdateResponse<T extends { metadata?: SiteMetadata | undefined }>(
	site: T,
	updateResult: NeedsUpdateResult,
	changedArticles?: Array<ChangedArticle>,
): T & { needsUpdate: boolean } {
	const { needsUpdate, hasAuthChange, hasBrandingChange, hasFolderStructureChange } = updateResult;
	const currentAuthEnabled = (site.metadata as SiteMetadata | undefined)?.jwtAuth?.enabled ?? false;
	const generatedAuthEnabled = (site.metadata as SiteMetadata | undefined)?.generatedJwtAuthEnabled ?? false;
	const expanded = {
		...site,
		needsUpdate,
		...(changedArticles !== undefined && { changedArticles: needsUpdate ? changedArticles : [] }),
		...(hasAuthChange && { authChange: { from: generatedAuthEnabled, to: currentAuthEnabled } }),
		...(hasBrandingChange && { brandingChanged: true }),
		...(hasFolderStructureChange && { folderStructureChanged: true }),
	};
	// stripSiteSecrets only returns undefined for undefined input; expanded is always defined
	return stripSiteSecrets(expanded) as T & { needsUpdate: boolean };
}

/**
 * Checks whether a file path contains path traversal sequences (e.g., "..", backslashes).
 * @internal Exported for testing
 */
export function hasPathTraversal(filePath: string): boolean {
	return filePath.includes("..") || filePath.includes("/") || filePath.includes("\\") || filePath.startsWith("/");
}

/**
 * Recursively validates that no node in a file tree contains path traversal sequences.
 * @internal Exported for testing
 */
export function hasTreePathTraversal(nodes: Array<FileTreeNode>): boolean {
	for (const node of nodes) {
		if (hasPathTraversal(node.name)) {
			return true;
		}
		if (node.children && hasTreePathTraversal(node.children)) {
			return true;
		}
	}
	return false;
}

/**
 * Computes whether a site needs a rebuild based on article changes and config drift.
 * Shared by the list, detail, and update-articles endpoints.
 * @internal Exported for testing
 */
export function computeNeedsUpdate(
	metadata: SiteMetadata | undefined,
	articleChangesNeeded: boolean,
): NeedsUpdateResult {
	const currentAuthEnabled = metadata?.jwtAuth?.enabled ?? false;
	const generatedAuthEnabled = metadata?.generatedJwtAuthEnabled ?? false;
	const hasAuthChange = currentAuthEnabled !== generatedAuthEnabled;

	const hasBrandingChange = !deepEquals(metadata?.branding, metadata?.generatedBranding);

	const hasFolderStructureChange =
		(metadata?.useSpaceFolderStructure ?? false) !== (metadata?.generatedUseSpaceFolderStructure ?? false);

	return {
		needsUpdate: articleChangesNeeded || hasAuthChange || hasBrandingChange || hasFolderStructureChange,
		hasAuthChange,
		hasBrandingChange,
		hasFolderStructureChange,
	};
}

/**
 * Builds a map of JRN -> article title for storing alongside generated article JRNs.
 * This allows correct slug derivation for articles that are later deleted from the DB.
 * The title is extracted from contentMetadata (where the nextra generator gets it from).
 * @internal Exported for testing
 */
export function buildArticleTitleMap(articles: Array<Doc>): Record<string, string> {
	const titles: Record<string, string> = {};
	for (const article of articles) {
		const metadata = article.contentMetadata as { title?: string } | undefined;
		const title = metadata?.title;
		if (title) {
			titles[article.jrn] = title;
		}
	}
	return titles;
}

/**
 * Validates that the GitHub token has access to the configured organization.
 * Should be called at startup to fail fast if misconfigured.
 *
 * @param config - The application configuration
 * @throws Error if the GitHub token cannot access the required organization
 * @internal Exported for testing
 */
export async function validateGitHubOrgAccess(config: ReturnType<typeof getConfig>): Promise<void> {
	// Skip validation if no GitHub token configured (Sites feature disabled)
	if (!config.GITHUB_TOKEN) {
		log.info("Skipping GitHub org validation: GITHUB_TOKEN not configured");
		return;
	}

	const githubOrg = getGitHubOrg(config);
	const octokit = createOctokit();

	try {
		// Try to get the org - this will fail if token doesn't have access
		await octokit.orgs.get({ org: githubOrg });
		log.info({ org: githubOrg, siteEnv: config.SITE_ENV }, "GitHub org access validated");
	} catch (error) {
		const message =
			`GitHub token does not have access to organization "${githubOrg}". ` +
			`SITE_ENV is "${config.SITE_ENV}", which requires access to ` +
			`${config.SITE_ENV !== "prod" ? "GITHUB_ORG_NONPROD" : "GITHUB_ORG"} organization. ` +
			`Please verify your GITHUB_TOKEN has the correct permissions.`;
		log.error({ org: githubOrg, siteEnv: config.SITE_ENV, error }, message);
		throw new Error(message);
	}
}

/**
 * Gets the GitHub organization to use for site repositories.
 *
 * Non-prod environments (local, dev, preview) use GITHUB_ORG_NONPROD (default: Jolli-Sample-Repos).
 * Production uses GITHUB_ORG or falls back to Jolli-Sites.
 *
 * @param config - The application configuration
 * @returns The GitHub organization name
 * @internal Exported for testing
 */
export function getGitHubOrg(config: ReturnType<typeof getConfig>): string {
	if (config.SITE_ENV !== "prod") {
		// Non-prod environments use configurable non-prod org
		return config.GITHUB_ORG_NONPROD;
	}
	// Prod uses configured org or falls back to production org
	return config.GITHUB_ORG || "Jolli-Sites";
}

/**
 * Computes SHA-256 hash of content (truncated to first 16 chars for storage)
 * @internal Exported for testing
 */
export function computeHash(content: string): string {
	return createHash("sha256").update(content, "utf8").digest("hex").substring(0, 16);
}

/**
 * Writes a FileTree entry to disk, handling both text and binary (base64-encoded) files.
 * @internal Exported for testing
 */
export async function writeFileTreeEntry(filePath: string, file: FileTree): Promise<void> {
	if (file.encoding === "base64") {
		await writeFile(filePath, Buffer.from(file.content, "base64"));
	} else {
		await writeFile(filePath, file.content, "utf-8");
	}
}

/**
 * Result of image bundling operation.
 * @internal Exported for testing
 */
export interface ImageBundleResult {
	/** Files with transformed content and new images added */
	files: Array<FileTree>;
	/** Paths of orphaned images to delete from the repo */
	orphanedImagePaths: Array<string>;
}

/**
 * Bundle images from article content files into static files.
 * Downloads images from S3, transforms URLs in the content,
 * and identifies orphaned images to delete.
 *
 * This is a standalone function that can be called from both the create and regenerate flows.
 * The version inside createSiteRouter delegates to this function.
 *
 * @param files - Generated files including content files
 * @param siteId - Site ID for build event broadcasting
 * @param docsiteId - Docsite ID for logging
 * @param imageStorageService - Service for downloading images from S3
 * @param tenantId - Tenant ID for security validation
 * @param existingFilePaths - Optional list of existing file paths in the repo (for orphan detection)
 * @internal Exported for testing
 */
export async function bundleImagesIntoFilesImpl(
	files: Array<FileTree>,
	siteId: number,
	docsiteId: number,
	imageStorageService: ImageStorageService | undefined,
	tenantId: string | undefined,
	existingFilePaths?: Array<string>,
): Promise<ImageBundleResult> {
	if (!imageStorageService || !tenantId) {
		log.debug({ docsiteId }, "Skipping image bundling: no image storage service or tenant context");
		return { files, orphanedImagePaths: [] };
	}

	// Find content files (MDX/MD) that may contain image references
	const contentFiles = files.filter(
		f => f.path.startsWith("content/") && (f.path.endsWith(".mdx") || f.path.endsWith(".md")),
	);

	if (contentFiles.length === 0) {
		// Even with no content files, we may need to clean up orphaned images
		const orphanedImagePaths = existingFilePaths
			? existingFilePaths.filter(p => p.startsWith("public/images/"))
			: [];
		return { files, orphanedImagePaths };
	}

	const { imageFiles, transformedArticles } = await bundleSiteImages(
		contentFiles.map(f => ({ content: f.content })),
		imageStorageService,
		tenantId,
	);

	// Detect orphaned images (images in repo but not in current bundle)
	let orphanedImagePaths: Array<string> = [];
	if (existingFilePaths && existingFilePaths.length > 0) {
		const existingImagePaths = existingFilePaths.filter(p => p.startsWith("public/images/"));
		const newImagePaths = new Set(imageFiles.map(f => f.path));

		orphanedImagePaths = existingImagePaths.filter(p => !newImagePaths.has(p));

		if (orphanedImagePaths.length > 0) {
			log.info(
				{ docsiteId, orphanedImagePaths },
				"Detected %d orphaned image(s) to delete",
				orphanedImagePaths.length,
			);
		}
	}

	if (imageFiles.length === 0) {
		return { files, orphanedImagePaths };
	}

	broadcastBuildEvent(siteId, {
		type: "build:stdout",
		step: 3,
		output: `Bundling ${imageFiles.length} image(s) into site:`,
	});
	for (const img of imageFiles) {
		broadcastBuildEvent(siteId, {
			type: "build:stdout",
			step: 3,
			output: `  - ${img.path}`,
		});
	}

	// Update content files with transformed URLs
	const contentFileMap = new Map<string, string>();
	contentFiles.forEach((f, i) => {
		contentFileMap.set(f.path, transformedArticles[i].content);
	});

	// Rebuild files array with transformed content and added images
	const transformedFiles = files.map(f => {
		const transformed = contentFileMap.get(f.path);
		return transformed !== undefined ? { ...f, content: transformed } : f;
	});

	log.info({ docsiteId, imageCount: imageFiles.length }, "Bundled %d images into site", imageFiles.length);

	return { files: [...transformedFiles, ...imageFiles], orphanedImagePaths };
}

export function extractConfigFileHashes(files: Array<FileTree>): SiteMetadata["configFileHashes"] {
	const hashes: SiteMetadata["configFileHashes"] = {};

	for (const file of files) {
		if (file.path === "content/_meta.ts") {
			hashes.metaTs = computeHash(file.content);
		} else if (file.path === "next.config.mjs") {
			hashes.nextConfig = computeHash(file.content);
		}
	}

	return Object.keys(hashes).length > 0 ? hashes : undefined;
}

/**
 * Registers the jolli.site domain with Vercel after deployment.
 * Failures are logged but don't fail the deployment - vercel.app fallback still works.
 *
 * @param subdomain - Optional custom subdomain. If not provided, siteName is used.
 * @returns Object with subdomain and jolliSiteDomain if successful, empty object if disabled/failed
 */
export async function registerJolliSiteDomain(
	deployer: VercelDeployer,
	siteName: string,
	projectName: string,
	siteId: number,
	config: ReturnType<typeof getConfig>,
	subdomain?: string,
): Promise<{ subdomain?: string; jolliSiteDomain?: string }> {
	if (!config.JOLLI_SITE_ENABLED) {
		return {};
	}

	// Use custom subdomain if provided, otherwise fall back to siteName
	const effectiveSubdomain = subdomain || siteName;
	const jolliSiteDomain = generateJolliSiteDomain(effectiveSubdomain, config.JOLLI_SITE_DOMAIN);
	log.info({ siteId, domain: jolliSiteDomain }, "Registering jolli.site domain with Vercel");

	try {
		const result = await deployer.addDomainToProject(projectName, jolliSiteDomain);

		// Check for error result (409 conflict, 403 forbidden, etc.)
		if (result.error) {
			log.warn(
				{ siteId, domain: jolliSiteDomain, error: result.error },
				"Failed to register jolli.site domain - site will use vercel.app fallback",
			);
			return {};
		}

		log.info({ siteId, domain: jolliSiteDomain }, "Jolli.site domain registered successfully");
		return { subdomain: effectiveSubdomain, jolliSiteDomain };
	} catch (error) {
		log.warn(
			{ siteId, domain: jolliSiteDomain, error: error instanceof Error ? error.message : "Unknown error" },
			"Failed to register jolli.site domain - site will use vercel.app fallback",
		);
		return {};
	}
}

/**
 * Helper to extract folder path and filename from a content-relative path.
 * @internal Exported for testing
 */
export function extractFolderAndFile(relativePath: string): { folderPath: string; fileName: string } {
	const lastSlash = relativePath.lastIndexOf("/");
	return {
		folderPath: lastSlash === -1 ? "" : relativePath.substring(0, lastSlash),
		fileName: lastSlash === -1 ? relativePath : relativePath.substring(lastSlash + 1),
	};
}

/**
 * Folder contents collected during content file processing.
 */
export interface FolderContent {
	meta?: string;
	slugs: Array<string>;
}

/**
 * Helper to process a single content file and update folder contents map.
 * Returns root meta content if this file is the root _meta.ts.
 * @internal Exported for testing
 */
export function processContentFile(file: FileTree, folderContents: Map<string, FolderContent>): string | undefined {
	const relativePath = file.path.substring("content/".length);
	const { folderPath, fileName } = extractFolderAndFile(relativePath);

	// Get or create folder entry
	let folder = folderContents.get(folderPath);
	if (!folder) {
		folder = { slugs: [] };
		folderContents.set(folderPath, folder);
	}

	// Check if this is a _meta.ts file
	if (fileName === "_meta.ts") {
		folder.meta = file.content;
		return folderPath === "" ? file.content : undefined;
	}

	// Check if this is a content file (extract slug from any supported extension)
	const contentExtensions = [".mdx", ".md", ".json", ".yaml", ".yml"];
	for (const ext of contentExtensions) {
		if (fileName.endsWith(ext)) {
			folder.slugs.push(fileName.slice(0, -ext.length));
			break;
		}
	}

	return;
}

/**
 * Helper to convert folder contents map to allFolderMetas array.
 * @internal Exported for testing
 */
export function convertToFolderMetasArray(
	folderContents: Map<string, FolderContent>,
): Array<{ folderPath: string; metaContent: string; slugs: Array<string> }> {
	return Array.from(folderContents.entries())
		.filter(([_, content]) => content.meta || content.slugs.length > 0)
		.map(([folderPath, content]) => ({
			folderPath,
			metaContent: content.meta || "",
			slugs: content.slugs,
		}));
}

/**
 * Config file paths and their display names for change detection
 */
const CONFIG_FILES: Array<{
	path: string;
	hashKey: keyof NonNullable<SiteMetadata["configFileHashes"]>;
	displayName: string;
}> = [
	{ path: "content/_meta.ts", hashKey: "metaTs", displayName: "Navigation Config (_meta.ts)" },
	{ path: "next.config.mjs", hashKey: "nextConfig", displayName: "Next.js Config (next.config.mjs)" },
];

/**
 * Checks for manually edited config files by comparing current GitHub hashes with stored hashes.
 * Returns list of config files that have been manually modified since last build.
 *
 * This optimized version fetches only the specific config files instead of downloading
 * the entire repository. Uses OctokitGitHub.getContent() to fetch individual files,
 * making it much faster (~100-300ms vs 1-5s for full repo download).
 */
async function getChangedConfigFiles(docsite: Site): Promise<Array<ChangedConfigFile>> {
	const metadata = getSiteMetadata(docsite);
	if (!metadata?.configFileHashes || !metadata.githubRepo) {
		return []; // No stored hashes to compare against
	}

	const changedFiles: Array<ChangedConfigFile> = [];
	const [owner, repo] = metadata.githubRepo.split("/");
	const octokit = createOctokit();
	const githubClient = createOctokitGitHub(octokit, owner, repo);

	for (const configFile of CONFIG_FILES) {
		const storedHash = metadata.configFileHashes[configFile.hashKey];
		if (!storedHash) {
			continue; // No stored hash for this file
		}

		try {
			const contentData = await githubClient.getContent(configFile.path);
			if (!contentData || !("content" in contentData)) {
				continue; // File doesn't exist or is a directory
			}

			const content = Buffer.from(contentData.content, "base64").toString("utf-8");
			const currentHash = computeHash(content);

			if (currentHash !== storedHash) {
				changedFiles.push({
					path: configFile.path,
					displayName: configFile.displayName,
				});
			}
		} catch (error) {
			// Log but don't fail - config change detection is optional
			log.warn({ docsiteId: docsite.id, path: configFile.path, error }, "Failed to fetch config file");
		}
	}

	return changedFiles;
}

/**
 * Broadcast article validation results (Step 1 of build process)
 */
/* c8 ignore start - Only called from buildDocsiteAsync which is already ignored */
function broadcastArticleValidation(siteId: number, articles: Array<Doc>): void {
	if (articles.length === 0) {
		broadcastBuildEvent(siteId, {
			type: "build:stdout",
			step: 1,
			output: "No articles selected - site will show a placeholder page",
		});
	} else {
		broadcastBuildEvent(siteId, {
			type: "build:stdout",
			step: 1,
			output: `Found ${articles.length} article(s) to include:`,
		});
		for (const article of articles) {
			const articleTitle = article.contentMetadata?.title || article.jrn;
			broadcastBuildEvent(siteId, {
				type: "build:stdout",
				step: 1,
				output: `  - ${articleTitle}`,
			});
		}
	}
}

/**
 * Broadcast warnings about article cross-reference links that cannot be resolved.
 * Non-blocking: the build continues even when unresolvable links are found.
 */
function broadcastArticleLinkWarnings(
	siteId: number,
	warnings: Array<{ articleTitle: string; linkText: string; unresolvedJrn: string }>,
	step: number,
): void {
	broadcastBuildEvent(siteId, {
		type: "build:stderr",
		step,
		output: `Warning: ${warnings.length} cross-reference link(s) point to articles not included in this site:`,
	});
	for (const warning of warnings) {
		broadcastBuildEvent(siteId, {
			type: "build:stderr",
			step,
			output: `  - "${warning.linkText}" in "${warning.articleTitle}" links to ${warning.unresolvedJrn}`,
		});
	}
}

/**
 * Pre-build: validate article cross-reference links and broadcast warnings.
 * Returns without blocking the build.
 *
 * Note: this intentionally duplicates warnings that also appear during
 * post-generation resolution. The pre-build pass gives early feedback
 * before the (slower) file generation step; the post-generation pass
 * is the authoritative transform that converts/strips the actual links.
 */
function validateAndBroadcastArticleLinks(siteId: number, articles: Array<Doc>, step: number): void {
	const siteArticleJrns = new Set(articles.map(a => a.jrn));
	const warnings = validateArticleLinks(articles, siteArticleJrns);
	if (warnings.length > 0) {
		broadcastArticleLinkWarnings(siteId, warnings, step);
	}
}

/**
 * Post-generation: resolve JRN links to site URLs and broadcast any warnings.
 * Returns the files with links transformed.
 */
function resolveAndBroadcastArticleLinks(
	siteId: number,
	files: Array<FileTree>,
	articles: Array<Doc>,
	step: number,
): Array<FileTree> {
	const { transformedFiles, warnings } = resolveArticleLinks(files, articles);
	if (warnings.length > 0) {
		broadcastArticleLinkWarnings(siteId, warnings, step);
	}
	return transformedFiles;
}
/* c8 ignore stop */

/**
 * Builds the success metadata object for a completed docsite build.
 * Extracted to reduce cognitive complexity in buildDocsiteAsync.
 */
/* c8 ignore start */
function buildSuccessMetadata(
	deployment: DeploymentResult,
	githubOrg: string,
	githubRepoName: string,
	githubUrl: string,
	selectedFramework: DocFramework,
	articles: Array<Doc>,
	protectionStatus: { isProtected: boolean; protectionType: string },
	protectionTypeValue: string,
	allowedDomain: string | undefined,
	docsiteVisibility: string,
	initialMetadata: SiteMetadata,
	configFileHashes: SiteMetadata["configFileHashes"],
): SiteMetadata {
	return {
		githubRepo: `${githubOrg}/${githubRepoName}`,
		githubUrl,
		productionUrl: deployment.productionDomain || deployment.url,
		productionDeploymentId: deployment.deploymentId,
		deploymentStatus: "building",
		vercelUrl: deployment.productionDomain || deployment.url,
		vercelDeploymentId: deployment.deploymentId,
		framework: selectedFramework,
		...(selectedFramework === "nextra" ? { nextraVersion: "4" as const } : {}),
		articleCount: articles.length,
		lastDeployedAt: new Date().toISOString(),
		isProtected: protectionStatus.isProtected,
		protectionType: protectionTypeValue,
		lastProtectionCheck: new Date().toISOString(),
		generatedArticleJrns: articles.map(a => a.jrn),
		generatedArticleTitles: buildArticleTitleMap(articles),
		generatedJwtAuthEnabled: initialMetadata.jwtAuth?.enabled ?? false,
		generatedUseSpaceFolderStructure: initialMetadata.useSpaceFolderStructure ?? false,
		// Save branding at generation time for change detection
		...(initialMetadata.branding
			? { branding: initialMetadata.branding, generatedBranding: initialMetadata.branding }
			: {}),
		...(docsiteVisibility === "internal" && allowedDomain ? { allowedDomain } : {}),
		...(initialMetadata.selectedArticleJrns ? { selectedArticleJrns: initialMetadata.selectedArticleJrns } : {}),
		...(configFileHashes ? { configFileHashes } : {}),
		...(initialMetadata.jwtAuth ? { jwtAuth: initialMetadata.jwtAuth } : {}),
		...(initialMetadata.useSpaceFolderStructure !== undefined
			? { useSpaceFolderStructure: initialMetadata.useSpaceFolderStructure }
			: {}),
	};
}
/* c8 ignore stop */

/**
 * Builds the error metadata object for a failed docsite build.
 * Extracted to reduce cognitive complexity in buildDocsiteAsync.
 */
/* c8 ignore start */
function buildErrorMetadata(
	githubOrg: string,
	errorRepoName: string,
	capturedGithubUrl: string,
	selectedFramework: DocFramework,
	articleCount: number,
	errorMessage: string,
	initialMetadata: SiteMetadata,
): SiteMetadata {
	return {
		githubRepo: `${githubOrg}/${errorRepoName}`,
		githubUrl: capturedGithubUrl,
		framework: selectedFramework,
		...(selectedFramework === "nextra" ? { nextraVersion: "4" as const } : {}),
		articleCount,
		lastBuildError: errorMessage,
		...(initialMetadata.jwtAuth ? { jwtAuth: initialMetadata.jwtAuth } : {}),
		...(initialMetadata.useSpaceFolderStructure !== undefined
			? { useSpaceFolderStructure: initialMetadata.useSpaceFolderStructure }
			: {}),
	};
}
/* c8 ignore stop */

/**
 * Build docsite asynchronously after initial creation
 */
/* c8 ignore start */
async function buildDocsiteAsync(
	docsite: Site,
	articles: Array<Doc>,
	name: string,
	displayName: string,
	selectedFramework: DocFramework,
	allowedDomain: string | undefined,
	initialMetadata: SiteMetadata,
	config: ReturnType<typeof getConfig>,
	siteDao: SiteDao,
	imageStorageService: ImageStorageService | undefined,
	tenantId: string | undefined,
	subdomain?: string,
): Promise<void> {
	// Track githubUrl and repoName so we can preserve them in error handler if repo was created
	let capturedGithubUrl = "";
	let capturedGithubRepoName = "";
	// Track tempDir for cleanup in finally block
	let tempDir: string | undefined;
	const totalSteps = 5;
	const siteId = docsite.id;

	// Clear previous build output before starting new build
	clearEventBuffer(siteId);
	broadcastBuildEvent(siteId, { type: "build:clear" });

	// Broadcast build mode
	broadcastBuildEvent(siteId, { type: "build:mode", mode: "create", totalSteps });

	try {
		// Step 1: Validate articles
		const step1Message = "[1/5] Validating articles...";
		await siteDao.updateSite({
			...docsite,
			metadata: { ...initialMetadata, buildProgress: step1Message },
		});
		broadcastBuildEvent(siteId, { type: "build:step", step: 1, total: totalSteps, message: step1Message });
		log.info({ docsiteId: docsite.id, articleCount: articles.length }, "[1/5] Validating articles");

		// Output list of articles being included (zero articles is valid - generates a placeholder page)
		broadcastArticleValidation(siteId, articles);

		// Validate image references before generation (fail early if relative paths found)
		const imageValidationResult = validateArticlesForGeneration(articles);
		if (!imageValidationResult.isValid) {
			const errorMessage = formatPreGenerationErrors(imageValidationResult);
			log.error(
				{ docsiteId: docsite.id, invalidArticles: imageValidationResult.invalidArticles.length },
				"Site generation failed: invalid image references found",
			);
			broadcastBuildEvent(siteId, { type: "build:failed", error: errorMessage });
			// Throw error to let catch block handle site status update
			throw new Error(errorMessage);
		}

		// Validate article cross-reference links (non-blocking warning)
		validateAndBroadcastArticleLinks(siteId, articles, 1);

		// Step 2: Generate documentation project files
		const step2Message = "[2/5] Generating documentation files...";
		await siteDao.updateSite({
			...docsite,
			metadata: { ...initialMetadata, buildProgress: step2Message },
		});
		broadcastBuildEvent(siteId, { type: "build:step", step: 2, total: totalSteps, message: step2Message });
		log.info({ docsiteId: docsite.id, framework: selectedFramework }, "[2/5] Generating documentation files");
		const generator = createDocGenerator(selectedFramework);
		const generationResult = generator.generateFromArticles(
			articles,
			name,
			displayName,
			docsite.visibility === "internal" && allowedDomain ? { allowedDomain } : undefined,
		);
		const { files: generatedFiles } = generationResult;
		log.info(
			{ docsiteId: docsite.id, framework: selectedFramework, fileCount: generatedFiles.length },
			"Generated documentation files",
		);

		// Resolve article cross-reference links (JRN -> site URL)
		const linkResolvedFiles = resolveAndBroadcastArticleLinks(siteId, generatedFiles, articles, 2);

		// Bundle images from articles into static files (no orphan detection on create - no existing files)
		const { files } = await bundleImagesIntoFilesImpl(
			linkResolvedFiles,
			siteId,
			docsite.id,
			imageStorageService,
			tenantId,
		);

		// Step 3: Create GitHub repository and upload files
		const step3Message = "[3/5] Creating GitHub repository and uploading files...";
		await siteDao.updateSite({
			...docsite,
			metadata: { ...initialMetadata, buildProgress: step3Message },
		});
		broadcastBuildEvent(siteId, { type: "build:step", step: 3, total: totalSteps, message: step3Message });
		const octokit = createOctokit();
		const githubClient = createDocsiteGitHub(octokit);
		const githubOrg = getGitHubOrg(config);

		// Generate tenant-aware GitHub repo name: {tenantSlug}-{siteName}-{siteId}
		const githubRepoName = generateGitHubRepoName(name, docsite.id);
		capturedGithubRepoName = githubRepoName; // Capture for error handler

		log.info({ docsiteId: docsite.id, org: githubOrg, repo: githubRepoName }, "[3/5] Creating GitHub repository");
		const githubUrl = await githubClient.createRepository(githubOrg, githubRepoName, true);
		capturedGithubUrl = githubUrl; // Capture URL for error handler
		log.info(
			{ docsiteId: docsite.id, githubUrl, visibility: "private" },
			"[3/5] Created GitHub repository (private)",
		);

		log.info({ docsiteId: docsite.id }, "[3/5] Uploading files to GitHub");
		await githubClient.uploadDocusaurusProject(githubOrg, githubRepoName, files);
		log.info({ docsiteId: docsite.id }, "[3/5] Uploaded files to GitHub");

		// Write files to temp directory for Vercel deployment
		tempDir = join(tmpdir(), `newdocsite-${docsite.id}-${Date.now()}`);
		await mkdir(tempDir, { recursive: true });
		registerBuildTempDir(siteId, tempDir);
		broadcastBuildEvent(siteId, { type: "build:stdout", step: 3, output: `Created temp directory: ${tempDir}` });

		for (const file of files) {
			const filePath = join(tempDir, file.path);
			const dirPath = join(filePath, "..");
			await mkdir(dirPath, { recursive: true });
			await writeFileTreeEntry(filePath, file);
		}
		log.info({ docsiteId: docsite.id, tempDir }, "Wrote files to temp directory");

		// Step 4: Deploy to Vercel and stream build logs
		const step4Message = "[4/5] Deploying to Vercel and building...";
		await siteDao.updateSite({
			...docsite,
			metadata: { ...initialMetadata, buildProgress: step4Message, githubUrl },
		});
		broadcastBuildEvent(siteId, { type: "build:step", step: 4, total: totalSteps, message: step4Message });
		const vercelToken = config.VERCEL_TOKEN;
		if (!vercelToken) {
			throw new Error("VERCEL_TOKEN is not configured");
		}

		// Create deployer early so we can set up env vars before deployment
		const deployer = new VercelDeployer(vercelToken);

		// If JWT auth is enabled, ensure project exists and set env vars BEFORE deployment
		// This ensures env vars are available during the first build
		if (initialMetadata.jwtAuth?.enabled && initialMetadata.jwtAuth.publicKey) {
			log.info(
				{ docsiteId: docsite.id, projectName: githubRepoName },
				"[4/5] Setting up JWT auth env vars before deployment",
			);
			broadcastBuildEvent(siteId, { type: "build:stdout", step: 4, output: "Setting up JWT authentication..." });

			await deployer.ensureProjectExists(githubRepoName);
			await deployer.syncJwtAuthEnvVars(
				githubRepoName,
				true,
				initialMetadata.jwtAuth.mode || "full",
				initialMetadata.jwtAuth.publicKey,
				initialMetadata.jwtAuth.loginUrl || "",
			);
			log.info({ docsiteId: docsite.id, projectName: githubRepoName }, "[4/5] JWT auth env vars configured");
		}

		log.info({ docsiteId: docsite.id }, "[4/5] Deploying to Vercel as PRODUCTION");
		// Deploy directly to production - pass framework type for correct Vercel settings
		// Use tenant-aware repo name for Vercel project name to match GitHub
		const deployment: DeploymentResult = await deployToVercel(
			tempDir,
			githubRepoName,
			vercelToken,
			"production",
			selectedFramework === "nextra" ? "nextra" : "docusaurus",
		);

		// Check if deployment creation failed immediately
		if (deployment.status === "error") {
			const errorDetails = deployment.error || "Unknown deployment error";
			log.error({ docsiteId: docsite.id, errorDetails }, "Vercel deployment creation failed");
			await siteDao.updateSite({
				...docsite,
				status: "error",
				metadata: {
					...initialMetadata,
					buildProgress: "[4/5] Deployment failed",
					validationErrors: errorDetails,
					lastBuildError: "Vercel deployment failed",
					githubUrl,
				},
			});
			broadcastBuildEvent(siteId, { type: "build:failed", step: 4, error: errorDetails });
			throw new Error(`Deployment failed: ${errorDetails}`);
		}

		// Wait for Vercel build to complete, streaming events back to frontend
		log.info({ docsiteId: docsite.id, deploymentId: deployment.deploymentId }, "[4/5] Waiting for Vercel build");
		const buildResult = await deployer.waitForDeployment(
			deployment.deploymentId,
			createBuildEventHandlers(broadcastBuildEvent, siteId, 4),
		);

		if (buildResult.status === "error") {
			const errorDetails = buildResult.error || "Vercel build failed";
			log.error({ docsiteId: docsite.id, errorDetails }, "Vercel build failed");
			await siteDao.updateSite({
				...docsite,
				status: "error",
				metadata: {
					...initialMetadata,
					buildProgress: "[4/5] Build failed - see error details",
					validationErrors: errorDetails,
					lastBuildError: "Vercel build failed",
					githubUrl,
				},
			});
			broadcastBuildEvent(siteId, { type: "build:failed", step: 4, error: errorDetails });
			throw new Error(`Build failed:\n${errorDetails}`);
		}

		log.info({ docsiteId: docsite.id, productionUrl: deployment.url }, "[4/5] Vercel build completed");

		// Step 5: Configure site protection
		const step5Message = "[5/5] Configuring site protection...";
		await siteDao.updateSite({
			...docsite,
			metadata: {
				...initialMetadata,
				buildProgress: step5Message,
				githubUrl,
				previewUrl: deployment.url,
			},
		});
		broadcastBuildEvent(siteId, { type: "build:step", step: 5, total: totalSteps, message: step5Message });
		log.info({ docsiteId: docsite.id, visibility: docsite.visibility }, "[5/5] Setting protection");

		const { protectionStatus, protectionTypeValue } = await setDocsiteProtection(
			docsite,
			githubRepoName,
			vercelToken,
		);

		// Final: Update docsite record with metadata
		// Compute config file hashes for change detection
		const configFileHashes = extractConfigFileHashes(files);

		const metadata: SiteMetadata = buildSuccessMetadata(
			deployment,
			githubOrg,
			githubRepoName,
			githubUrl,
			selectedFramework,
			articles,
			protectionStatus,
			protectionTypeValue,
			allowedDomain,
			docsite.visibility,
			initialMetadata,
			configFileHashes,
		);

		// Register jolli.site domain with Vercel if enabled
		const jolliDomainResult = await registerJolliSiteDomain(
			deployer,
			name,
			githubRepoName,
			docsite.id,
			config,
			subdomain,
		);
		if (jolliDomainResult.subdomain) {
			metadata.subdomain = jolliDomainResult.subdomain;
		}
		if (jolliDomainResult.jolliSiteDomain) {
			metadata.jolliSiteDomain = jolliDomainResult.jolliSiteDomain;
		}

		await siteDao.updateSite({
			...docsite,
			status: "active",
			metadata,
			lastGeneratedAt: new Date(),
		});

		// Note: JWT auth env vars are now set BEFORE deployment (see above),
		// so they are available during the first build. No need to sync here.

		// Broadcast completion event
		broadcastBuildEvent(siteId, {
			type: "build:completed",
			status: "active",
			url: metadata.productionUrl || metadata.vercelUrl || "",
		});

		log.info({ docsiteId: docsite.id }, "Docsite creation completed successfully");
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : /* v8 ignore next */ "Unknown error";
		log.error(
			{
				docsiteId: docsite.id,
				errorMessage,
				errorStack: error instanceof Error ? error.stack : /* v8 ignore next */ undefined,
			},
			"Failed to generate docsite",
		);

		// Update status to "error" - preserve githubUrl and repoName if repo was created
		// Use captured repo name if available (tenant-aware), fall back to legacy format
		const errorRepoName = capturedGithubRepoName || name;
		const githubOrg = getGitHubOrg(config);
		const metadata: SiteMetadata = buildErrorMetadata(
			githubOrg,
			errorRepoName,
			capturedGithubUrl,
			selectedFramework,
			articles.length,
			errorMessage,
			initialMetadata,
		);

		await siteDao.updateSite({
			...docsite,
			status: "error",
			metadata,
		});

		// Broadcast failure event (only if not already broadcast from a specific step)
		broadcastBuildEvent(siteId, { type: "build:failed", error: errorMessage });
	} finally {
		// Clean up temp directory
		if (tempDir) {
			await cleanupTempDirectory(tempDir);
			unregisterBuildTempDir(siteId);
			broadcastBuildEvent(siteId, {
				type: "build:stdout",
				step: 5,
				output: `Removed temp directory: ${tempDir}`,
			});
		}
	}
}

/**
 * Set protection for a docsite based on its visibility
 */
async function setDocsiteProtection(
	docsite: Site,
	name: string,
	vercelToken: string,
): Promise<{ protectionStatus: { isProtected: boolean; protectionType: string }; protectionTypeValue: string }> {
	let protectionStatus: { isProtected: boolean; protectionType: string };
	let protectionTypeValue: string;
	const deployer = new VercelDeployer(vercelToken);

	if (docsite.visibility === "internal") {
		// Internal sites use app-level authentication, no Vercel protection
		try {
			await deployer.setProjectProtection(name, false);
			protectionStatus = { isProtected: true, protectionType: "app-level" };
			protectionTypeValue = "app-level";
			log.info({ docsiteId: docsite.id }, "Internal site: Using application-level authentication");
		} catch (error) {
			// If setting protection fails (e.g., plan limitations), continue without it
			log.warn(
				{
					docsiteId: docsite.id,
					error: error instanceof Error ? error.message : String(error),
				},
				"Failed to set Vercel protection, continuing without it",
			);
			protectionStatus = { isProtected: true, protectionType: "app-level" };
			protectionTypeValue = "app-level";
		}
	} else {
		// External sites: Do NOT set protection on creation (preview deployments are separate from production)
		// Production site will be a different deployment, so no protection needed on preview
		try {
			await deployer.setProjectProtection(name, false);
			protectionStatus = { isProtected: false, protectionType: "none" };
			protectionTypeValue = "none";
			log.info({ docsiteId: docsite.id }, "External site: No protection (preview deployment)");
		} catch (error) {
			// If setting protection fails (e.g., plan limitations), continue without it
			log.warn(
				{
					docsiteId: docsite.id,
					error: error instanceof Error ? error.message : String(error),
				},
				"Failed to disable Vercel protection, continuing",
			);
			protectionStatus = { isProtected: false, protectionType: "none" };
			protectionTypeValue = "none";
		}
	}

	return { protectionStatus, protectionTypeValue };
}
/* c8 ignore stop */

/* c8 ignore next 8 */
export function createSiteRouter(
	siteDaoProvider: DaoProvider<SiteDao>,
	tokenUtil: TokenUtil<UserInfo>,
	permissionMiddleware: PermissionMiddlewareFactory,
	imageStorageService?: ImageStorageService,
): Router {
	const router = express.Router();

	// Mount the site auth router for authentication endpoints
	router.use("/", createSiteAuthRouter(siteDaoProvider, tokenUtil));

	// List all sites
	/* c8 ignore next 2 */
	router.get("/", permissionMiddleware.requirePermission("sites.view"), async (_req, res) => {
		try {
			const siteDao = siteDaoProvider.getDao(getTenantContext());
			const docsites = await siteDao.listSites();

			// Add needsUpdate flag and granular change flags to each docsite
			const docsitesWithUpdateStatus = await Promise.all(
				docsites.map(async docsite => {
					const articleChangesNeeded = await siteDao.checkIfNeedsUpdate(docsite.id);
					const updateResult = computeNeedsUpdate(docsite.metadata, articleChangesNeeded);
					return buildSiteUpdateResponse(docsite, updateResult);
				}),
			);

			res.json(docsitesWithUpdateStatus);
		} catch (error) {
			log.error(error, "Failed to list sites");
			res.status(500).json({ error: "Failed to list sites" });
		}
	});

	/**
	 * GET /sites/for-article/:jrn
	 * Gets all sites that include a given article (by JRN).
	 * Returns lightweight site info for the article sites badge.
	 */
	router.get("/for-article/:jrn", permissionMiddleware.requirePermission("sites.view"), async (req, res) => {
		try {
			const jrn = req.params.jrn;
			if (!jrn || jrn.length > 2048) {
				res.status(400).json({ error: "Invalid JRN" });
				return;
			}
			const siteDao = siteDaoProvider.getDao(getTenantContext());
			const sites = await siteDao.getSitesForArticle(jrn);
			res.json({ sites });
		} catch (error) {
			log.error({ jrn: req.params.jrn, error }, "Failed to get sites for article");
			res.status(500).json({ error: "Failed to get sites for article" });
		}
	});

	/**
	 * GET /sites/check-subdomain?subdomain=xxx
	 * Check if a subdomain is available.
	 * Uses in-memory cache (10 second TTL) to reduce DB queries.
	 */
	router.get("/check-subdomain", permissionMiddleware.requirePermission("sites.view"), async (req, res) => {
		try {
			const siteDao = siteDaoProvider.getDao(getTenantContext());
			const { subdomain } = req.query;

			if (!subdomain || typeof subdomain !== "string") {
				res.status(400).json({ error: "subdomain query parameter is required" });
				return;
			}

			// Validate format
			const validation = validateSubdomain(subdomain);
			if (!validation.valid) {
				res.status(400).json({
					available: false,
					error: validation.error,
				});
				return;
			}

			const sanitized = validation.sanitized as string;

			const cachedResult = getCachedAvailability(sanitized);
			if (cachedResult !== undefined) {
				log.debug("Subdomain availability cache hit: %s (available: %s)", sanitized, cachedResult);
				res.json({ available: cachedResult });
				return;
			}

			const existing = await siteDao.getSiteBySubdomain(sanitized);

			if (existing) {
				setCachedAvailability(sanitized, false);

				let suggestion: string | undefined;
				for (let i = 1; i <= 10; i++) {
					const candidate = generateSubdomainSuggestion(sanitized, i);
					const exists = await siteDao.getSiteBySubdomain(candidate);
					if (!exists) {
						suggestion = candidate;
						break;
					}
				}

				res.json({
					available: false,
					suggestion,
				});
				return;
			}

			setCachedAvailability(sanitized, true);
			res.json({ available: true });
		} catch (error) {
			log.error(error, "Failed to check subdomain availability");
			res.status(500).json({ error: "Failed to check subdomain" });
		}
	});

	// Get site by ID
	router.get("/:id", permissionMiddleware.requirePermission("sites.view"), async (req, res) => {
		try {
			const siteDao = siteDaoProvider.getDao(getTenantContext());
			const id = Number.parseInt(req.params.id, 10);
			if (Number.isNaN(id)) {
				res.status(400).json({ error: "Invalid docsite ID" });
				return;
			}

			let docsite = await siteDao.getSite(id);
			if (docsite) {
				// Check deployment status if it's currently building
				const metadata = getSiteMetadata(docsite);
				if (metadata?.deploymentStatus === "building" && metadata.productionDeploymentId) {
					const config = getConfig();
					const vercelToken = config.VERCEL_TOKEN;
					if (vercelToken) {
						// checkDeploymentStatus is imported statically at the top to avoid Vite code-splitting warnings
						const deploymentStatus = await checkDeploymentStatus(
							metadata.productionDeploymentId,
							vercelToken,
						);

						// Update deployment status if it changed
						if (deploymentStatus !== "building") {
							const updatedMetadata = { ...metadata, deploymentStatus };
							docsite = (await siteDao.updateSite({
								...docsite,
								metadata: updatedMetadata,
							})) as Site;
						}
					}
				}

				// Add needsUpdate flag and changed articles if update is needed
				// Note: changedConfigFiles is fetched separately via /:id/changed-config-files endpoint
				// for better page load performance (avoids blocking on GitHub API calls)
				const changedArticles = await siteDao.getChangedArticles(id);
				const updateResult = computeNeedsUpdate(docsite.metadata, changedArticles.length > 0);
				res.json(buildSiteUpdateResponse(docsite, updateResult, changedArticles));
			} else {
				res.status(404).json({ error: "Docsite not found" });
			}
		} catch (error) {
			log.error(error, "Failed to get site");
			res.status(500).json({ error: "Failed to get site" });
		}
	});

	// Get changed config files for a site (async endpoint for performance)
	router.get("/:id/changed-config-files", permissionMiddleware.requirePermission("sites.view"), async (req, res) => {
		try {
			const siteDao = siteDaoProvider.getDao(getTenantContext());
			const id = Number.parseInt(req.params.id, 10);
			if (Number.isNaN(id)) {
				res.status(400).json({ error: "Invalid site ID" });
				return;
			}

			const docsite = await siteDao.getSite(id);
			if (!docsite) {
				res.status(404).json({ error: "Site not found" });
				return;
			}

			const changedConfigFiles = await getChangedConfigFiles(docsite);
			res.json({ changedConfigFiles });
		} catch (error) {
			log.error(error, "Failed to check config file changes");
			res.status(500).json({ error: "Failed to check config file changes" });
		}
	});

	// SSE endpoint for build progress streaming
	/* c8 ignore start */
	router.get("/:id/build-stream", permissionMiddleware.requirePermission("sites.view"), async (req, res) => {
		try {
			const siteDao = siteDaoProvider.getDao(getTenantContext());
			const id = Number.parseInt(req.params.id, 10);
			if (Number.isNaN(id)) {
				res.status(400).json({ error: "Invalid site ID" });
				return;
			}

			const site = await siteDao.getSite(id);
			if (!site) {
				res.status(404).json({ error: "Site not found" });
				return;
			}

			// Setup SSE and add to connections
			addBuildConnection(id, res);

			// Send current status immediately (for reconnection)
			const metadata = getSiteMetadata(site);
			if (site.status === "building") {
				sendBuildEvent(res, {
					type: "build:step",
					step: 0,
					total: 0,
					message: metadata?.buildProgress || "Building...",
				});
			} else if (site.status === "active") {
				sendBuildEvent(res, {
					type: "build:completed",
					status: "active",
					url: metadata?.vercelUrl || "",
				});
			} else if (site.status === "error") {
				sendBuildEvent(res, {
					type: "build:failed",
					error: metadata?.lastBuildError || "Unknown error",
				});
			}

			// Handle disconnect
			req.on("close", () => {
				removeBuildConnection(id, res);
			});
		} catch (error) {
			log.error(error, "Failed to setup build stream");
			res.status(500).json({ error: "Failed to setup build stream" });
		}
	});
	/* c8 ignore stop */

	/** Result type for site creation input validation */
	type CreateSiteValidationResult =
		| { valid: true; framework: DocFramework; subdomain?: string }
		| { valid: false; status: number; error: string };

	/**
	 * Validates input fields for site creation.
	 * Extracted to reduce cognitive complexity in POST handler.
	 */
	/* c8 ignore start */
	async function validateCreateSiteInput(
		siteDao: SiteDao,
		name: string | undefined,
		displayName: string | undefined,
		visibility: string | undefined,
		framework: string | undefined,
		allowedDomain: string | undefined,
		subdomain: string | undefined,
	): Promise<CreateSiteValidationResult> {
		// Validate required fields
		if (!name || !displayName) {
			return { valid: false, status: 400, error: "name and displayName are required" };
		}

		// Validate allowedDomain for internal sites
		if (visibility === "internal" && allowedDomain && !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(allowedDomain)) {
			return { valid: false, status: 400, error: "allowedDomain must be a valid domain (e.g., jolli.ai)" };
		}

		// Validate framework (default to docusaurus-2 if not specified)
		const rawFramework = framework || "docusaurus-2";
		if (!isValidFramework(rawFramework)) {
			return { valid: false, status: 400, error: "Invalid framework specified" };
		}
		const selectedFramework = rawFramework;

		// Validate name format (lowercase alphanumeric + hyphens only)
		if (!/^[a-z0-9-]+$/.test(name)) {
			return { valid: false, status: 400, error: "name must be lowercase alphanumeric with hyphens only" };
		}

		// Check if name already exists
		const existing = await siteDao.getSiteByName(name);
		if (existing) {
			return { valid: false, status: 409, error: "A docsite with this name already exists" };
		}

		// Validate subdomain if provided
		let validatedSubdomain: string | undefined;
		if (subdomain) {
			const subdomainValidation = validateSubdomain(subdomain);
			if (!subdomainValidation.valid) {
				return { valid: false, status: 400, error: subdomainValidation.error as string };
			}
			validatedSubdomain = subdomainValidation.sanitized;

			// Check if subdomain is already taken
			const existingBySubdomain = await siteDao.getSiteBySubdomain(validatedSubdomain as string);
			if (existingBySubdomain) {
				return { valid: false, status: 409, error: "This subdomain is already taken" };
			}
		}

		return {
			valid: true,
			framework: selectedFramework,
			...(validatedSubdomain ? { subdomain: validatedSubdomain } : {}),
		};
	}

	/** Generates JWT auth config keys if JWT auth is requested. */
	async function generateJwtAuthConfig(
		jwtAuth: { enabled?: boolean; mode?: "full" | "partial" } | undefined,
		origin: string,
		siteId: number,
	): Promise<SiteMetadata["jwtAuth"] | undefined> {
		if (!jwtAuth?.enabled) {
			return;
		}
		const { generateKeyPairSync } = await import("node:crypto");
		const keyPair = generateKeyPairSync("ec", {
			namedCurve: "prime256v1",
			publicKeyEncoding: { type: "spki", format: "pem" },
			privateKeyEncoding: { type: "pkcs8", format: "pem" },
		});
		return {
			enabled: true,
			mode: jwtAuth.mode || "full",
			loginUrl: `${origin}/api/sites/${siteId}/auth/jwt`,
			publicKey: keyPair.publicKey,
			privateKey: keyPair.privateKey,
		};
	}

	/**
	 * Builds the initial "pending" metadata for a newly created site record.
	 * Returns only the user-selected fields; the full metadata is populated during the build.
	 */
	function buildPendingMetadata(
		selectedArticles: Array<string> | undefined,
		useSpaceFolderStructure: boolean | undefined,
		branding: SiteBranding | undefined,
	): Partial<SiteMetadata> | undefined {
		if (selectedArticles === undefined && useSpaceFolderStructure === undefined && !branding) {
			return;
		}
		return {
			...(selectedArticles !== undefined ? { selectedArticleJrns: selectedArticles } : {}),
			...(useSpaceFolderStructure !== undefined ? { useSpaceFolderStructure } : {}),
			...(branding ? { branding } : {}),
		};
	}

	/**
	 * Validates the optional fields in a create-site request body.
	 * Returns validated branding or an error response tuple.
	 */
	function validateCreateSiteBodyOptions(
		body: Record<string, unknown>,
	):
		| { valid: true; branding: SiteBranding | undefined }
		| { valid: false; status: number; error: string; details?: Array<string> } {
		if (body.useSpaceFolderStructure !== undefined && typeof body.useSpaceFolderStructure !== "boolean") {
			return { valid: false, status: 400, error: "useSpaceFolderStructure must be a boolean" };
		}
		if (body.branding && typeof body.branding === "object") {
			const brandingValidation = validateSiteBranding(body.branding);
			if (!brandingValidation.isValid) {
				return {
					valid: false,
					status: 400,
					error: "Invalid branding data",
					details: brandingValidation.errors,
				};
			}
			return { valid: true, branding: body.branding as SiteBranding };
		}
		return { valid: true, branding: undefined };
	}

	// Create site
	router.post("/", permissionMiddleware.requirePermission("sites.edit"), async (req, res) => {
		const siteDao = siteDaoProvider.getDao(getTenantContext());
		const {
			name,
			displayName,
			visibility,
			framework,
			allowedDomain,
			selectedArticleJrns,
			subdomain,
			jwtAuth,
			useSpaceFolderStructure,
		} = req.body;

		// Validate optional body fields (branding, useSpaceFolderStructure)
		const optionsValidation = validateCreateSiteBodyOptions(req.body);
		if (!optionsValidation.valid) {
			res.status(optionsValidation.status).json({
				error: optionsValidation.error,
				...(optionsValidation.details ? { details: optionsValidation.details } : {}),
			});
			return;
		}
		const validatedBranding = optionsValidation.branding;

		// Prefer org-specific user ID (set by UserProvisioningMiddleware in multi-tenant mode)
		const userId = req.orgUser?.id ?? tokenUtil.decodePayload(req)?.userId;

		const config = getConfig();

		try {
			// Validate all input fields
			const validation = await validateCreateSiteInput(
				siteDao,
				name,
				displayName,
				visibility,
				framework,
				allowedDomain,
				subdomain,
			);
			if (!validation.valid) {
				res.status(validation.status).json({ error: validation.error });
				return;
			}
			const { framework: selectedFramework, subdomain: validatedSubdomain } = validation;

			// Create initial docsite record with "pending" status
			// Include selectedArticleJrns in metadata if provided
			// null/undefined = include all articles
			// [] (empty array) = zero articles selected
			// non-empty array = specific articles selected
			const initialSelectedArticles =
				selectedArticleJrns && Array.isArray(selectedArticleJrns) ? selectedArticleJrns : undefined;

			const newDocsite: NewSite = {
				name,
				displayName,
				userId,
				visibility: (visibility as "internal" | "external") || "internal",
				status: "pending",
				// Pending metadata only has user-selected fields; full metadata is built during site generation
				metadata: buildPendingMetadata(initialSelectedArticles, useSpaceFolderStructure, validatedBranding) as
					| SiteMetadata
					| undefined,
				lastGeneratedAt: undefined,
			};

			let docsite = await siteDao.createSite(newDocsite);
			log.info({ docsiteId: docsite.id, name }, "Created site record");

			// Fetch articles based on selection
			const articles = await siteDao.getArticlesForSite(docsite.id);

			// Generate JWT auth config if enabled
			const jwtAuthConfig = await generateJwtAuthConfig(jwtAuth, config.ORIGIN, docsite.id);
			if (jwtAuthConfig) {
				log.info({ docsiteId: docsite.id }, "Generated JWT auth keys for new site");
			}

			// Update status to "building" with initial metadata including article count
			const initialMetadata: SiteMetadata = {
				githubRepo: `${getGitHubOrg(config)}/${name}`,
				githubUrl: "",
				framework: selectedFramework,
				articleCount: articles.length,
				buildProgress: "Preparing to build...",
				...(initialSelectedArticles ? { selectedArticleJrns: initialSelectedArticles } : {}),
				...(jwtAuthConfig ? { jwtAuth: jwtAuthConfig } : {}),
				...(useSpaceFolderStructure !== undefined ? { useSpaceFolderStructure } : {}),
				...(validatedBranding ? { branding: validatedBranding } : {}),
			};

			docsite = (await siteDao.updateSite({
				...docsite,
				status: "building",
				metadata: initialMetadata,
			})) as Site;

			// Audit log site creation
			auditLog({
				action: "create",
				resourceType: "site",
				resourceId: String(docsite.id),
				resourceName: docsite.displayName || docsite.name,
				actorId: typeof userId === "number" ? userId : null,
				changes: computeAuditChanges(null, docsite as unknown as Record<string, unknown>, "site"),
			});

			// Return immediately with the docsite
			res.status(201).json(stripSiteSecrets(docsite));

			// Continue processing asynchronously
			const tenantContext = getTenantContext();
			/* v8 ignore next 14 */
			buildDocsiteAsync(
				docsite,
				articles,
				name,
				displayName,
				selectedFramework,
				allowedDomain,
				initialMetadata,
				config,
				siteDao,
				imageStorageService,
				tenantContext?.tenant.id,
				validatedSubdomain,
			).catch(() => {
				/* Error already logged in buildDocsiteAsync */
			});
		} catch (error) {
			log.error(error, "Failed to create site");
			res.status(500).json({ error: "Failed to create site" });
		}
	});
	/* c8 ignore stop */

	/**
	 * Checks if a site needs Nextra 3.x to 4.x migration.
	 */
	/* c8 ignore start */
	function needsNextraMigration(docsite: Site): boolean {
		const existingMetadata = getSiteMetadata(docsite);
		const frameworkFromMetadata = existingMetadata?.framework || "docusaurus-2";
		const framework: DocFramework = isValidFramework(frameworkFromMetadata)
			? frameworkFromMetadata
			: "docusaurus-2";
		return framework === "nextra" && existingMetadata?.nextraVersion !== "4";
	}
	/* c8 ignore stop */

	/**
	 * Fetches existing config files for migration from Nextra 3.x to 4.x.
	 * Returns parsed theme config and navigation meta.
	 */
	/* c8 ignore start */
	async function fetchMigrationContext(
		owner: string,
		repo: string,
		siteName: string,
		displayName: string,
		changedArticles: Array<ChangedArticle>,
	): Promise<MigrationContext> {
		const octokit = createOctokit();
		const githubClient = createDocsiteGitHub(octokit);

		// Try to download theme.config.jsx and _meta.js
		let themeConfigContent: string | undefined;
		let metaContent: string | undefined;

		try {
			const files = await githubClient.downloadRepository(owner, repo);
			for (const file of files) {
				if (file.path === "theme.config.jsx" || file.path === "theme.config.tsx") {
					themeConfigContent = file.content;
				}
				if (file.path === "pages/_meta.js" || file.path === "pages/_meta.global.js") {
					metaContent = file.content;
				}
			}
		} catch (error) {
			log.warn({ owner, repo, error }, "Failed to download files for migration context");
		}

		// Parse theme config if found
		let parsedThemeConfig: Record<string, unknown> | undefined;
		if (themeConfigContent) {
			const { config, warnings } = parseNextra3ThemeConfig(themeConfigContent);
			if (warnings.length > 0) {
				log.info({ warnings }, "Nextra 3.x migration warnings");
			}
			// Convert to Nextra 4.x format and cast to Record<string, unknown>
			parsedThemeConfig = convertToNextra4Config(config, siteName, displayName) as unknown as Record<
				string,
				unknown
			>;
		}

		// Parse nav meta if found (supports nested virtual groups)
		const metaMerger = new MetaMerger();
		const existingNavMeta = metaContent ? metaMerger.parse(metaContent) : undefined;

		// Get deleted slugs from changed articles (using slugify for consistency with nextra generator)
		const deletedSlugs = changedArticles.filter(a => a.changeType === "deleted").map(a => slugify(a.title));

		// Build context object without undefined values (exactOptionalPropertyTypes)
		const context: MigrationContext = { deletedSlugs };
		if (parsedThemeConfig !== undefined) {
			context.themeConfig = parsedThemeConfig;
		}
		if (existingNavMeta !== undefined) {
			context.existingNavMeta = existingNavMeta;
		}
		return context;
	}
	/* c8 ignore stop */

	/**
	 * Fetches existing _meta.ts files from a Nextra 4.x site for incremental regeneration.
	 * This preserves user customizations when navigation changes (new/deleted articles).
	 * Supports multi-folder content structure by collecting all _meta.ts files.
	 */
	/* c8 ignore start */
	async function fetchExistingNavMeta(
		owner: string,
		repo: string,
		changedArticles: Array<ChangedArticle>,
	): Promise<MigrationContext | undefined> {
		const octokit = createOctokit();
		const githubClient = createDocsiteGitHub(octokit);

		let rootMetaContent: string | undefined;
		const folderContents = new Map<string, { meta?: string; slugs: Array<string> }>();

		try {
			const files = await githubClient.downloadRepository(owner, repo);

			for (const file of files) {
				if (!file.path.startsWith("content/")) {
					continue;
				}
				const rootContent = processContentFile(file, folderContents);
				if (rootContent) {
					rootMetaContent = rootContent;
				}
			}
		} catch (error) {
			log.warn({ owner, repo, error }, "Failed to download _meta.ts files for nav preservation");
			return;
		}

		const allFolderMetas = convertToFolderMetasArray(folderContents);

		if (!rootMetaContent && allFolderMetas.length === 0) {
			return;
		}

		// Parse the root _meta.ts for backward compatibility
		const metaMerger = new MetaMerger();
		const existingNavMeta = rootMetaContent ? metaMerger.parse(rootMetaContent) : undefined;

		// Get deleted slugs from changed articles
		const deletedSlugs = changedArticles.filter(a => a.changeType === "deleted").map(a => slugify(a.title));

		// Build context object
		const context: MigrationContext = { deletedSlugs };
		if (existingNavMeta !== undefined) {
			context.existingNavMeta = existingNavMeta;
		}
		if (allFolderMetas.length > 0) {
			context.allFolderMetas = allFolderMetas;
		}
		return context;
	}
	/* c8 ignore stop */

	interface RegenerationContexts {
		migrationContext?: MigrationContext;
		existingNavMetaContext?: MigrationContext;
	}

	/**
	 * Determines and fetches appropriate migration/nav meta context for site regeneration.
	 * Reduces complexity by extracting branching logic from the main regeneration route.
	 */
	/* c8 ignore start */
	async function fetchRegenerationContexts(
		docsite: Site,
		changedArticles: Array<ChangedArticle>,
	): Promise<RegenerationContexts> {
		const metadata = requireSiteMetadata(docsite);
		const [owner, repo] = metadata.githubRepo.split("/");

		// Check if Nextra 3.x to 4.x migration is needed
		if (needsNextraMigration(docsite)) {
			log.info({ docsiteId: docsite.id }, "Detected Nextra 3.x site - starting automatic migration to 4.x");
			const migrationContext = await fetchMigrationContext(
				owner,
				repo,
				docsite.name,
				docsite.displayName,
				changedArticles,
			);
			log.info(
				{
					docsiteId: docsite.id,
					hasThemeConfig: !!migrationContext.themeConfig,
					hasNavMeta: !!migrationContext.existingNavMeta,
					deletedSlugs: migrationContext.deletedSlugs?.length ?? 0,
				},
				"Parsed Nextra 3.x config for migration",
			);
			return { migrationContext };
		}

		// For Nextra 4.x sites, always fetch existing _meta.ts to detect and remove orphaned entries.
		// This ensures we catch:
		// 1. Articles deselected by the user (but not detected as "deleted" in changedArticles)
		// 2. Entries manually added to _meta.ts that don't correspond to any article
		// 3. Any other mismatch between _meta.ts and actual article files
		if (metadata.framework === "nextra") {
			log.info({ docsiteId: docsite.id }, "Fetching existing _meta.ts for orphan detection");
			const existingNavMetaContext = await fetchExistingNavMeta(owner, repo, changedArticles);
			if (existingNavMetaContext?.existingNavMeta) {
				log.info(
					{
						docsiteId: docsite.id,
						entryCount: Object.keys(existingNavMetaContext.existingNavMeta).length,
					},
					"Fetched existing nav meta for preservation and orphan detection",
				);
			}
			return existingNavMetaContext ? { existingNavMetaContext } : {};
		}

		return {};
	}

	/**
	 * Helper to fetch existing file paths from GitHub for orphaned file detection.
	 * Returns empty array if fetch fails (non-blocking error).
	 */
	async function fetchExistingFilePaths(owner: string, repo: string, docsiteId: number): Promise<Array<string>> {
		try {
			const octokit = createOctokit();
			const githubClient = createDocsiteGitHub(octokit);
			const existingFiles = await githubClient.downloadRepository(owner, repo);
			const paths = existingFiles.map(f => f.path);
			log.info(
				{ docsiteId, existingFileCount: paths.length },
				"Fetched existing file list for orphaned file detection",
			);
			return paths;
		} catch (error) {
			log.warn({ docsiteId, error }, "Failed to fetch existing files, skipping orphaned file detection");
			return [];
		}
	}
	/* c8 ignore stop */

	/**
	 * Helper to generate files and compute deleted paths for regeneration.
	 * Reduces complexity in the main regeneration route.
	 * Also handles migration from Nextra 3.x to 4.x when needed.
	 *
	 * @param docsite - The site being regenerated
	 * @param articles - All articles for the site
	 * @param changedArticles - Articles that have changed since last generation
	 * @param migrationContext - Context for Nextra 3.x to 4.x migration (if migrating)
	 * @param existingNavMetaContext - Existing _meta.ts content for preserving customizations
	 * @param existingFilePaths - List of file paths currently in the repository (for orphaned file detection)
	 */
	/* c8 ignore start */
	function generateFilesAndDeletedPaths(
		docsite: Site,
		articles: Array<Doc>,
		changedArticles: Array<ChangedArticle>,
		migrationContext?: MigrationContext,
		existingNavMetaContext?: MigrationContext,
		existingFilePaths?: Array<string>,
	): {
		files: Array<FileTree>;
		deletedFilePaths: Array<string>;
		orphanedFiles: Array<string>; // Orphaned content files being removed
		removedNavEntries: Array<string>; // Orphaned nav entries being removed from _meta.ts
		emptyFolders: Array<string>; // Content folders that became empty and should be deleted
		warnings: Array<string>; // Warnings about potential issues (e.g., slug collisions)
		generator: DocGenerator;
		migratedToNextra4: boolean;
	} {
		const existingMetadata = getSiteMetadata(docsite);
		const frameworkFromMetadata = existingMetadata?.framework || "docusaurus-2";
		const framework: DocFramework = isValidFramework(frameworkFromMetadata)
			? frameworkFromMetadata
			: "docusaurus-2";

		// Check if this is a Nextra site that needs migration to 4.x
		const needsMigration = needsNextraMigration(docsite);

		// Determine which context to use for preserving nav customizations:
		// - Migration context takes priority (for 3.x to 4.x migration)
		// - Otherwise use existing nav meta context (for normal regeneration with nav changes)
		const contextToUse = needsMigration ? migrationContext : existingNavMetaContext;

		const generator = createDocGenerator(framework);
		// When the user has manually selected articles (auto-sync off), preserve their
		// existing _meta.ts ordering so Navigation tab customizations survive publish.
		const hasManualSelection = Array.isArray(existingMetadata?.selectedArticleJrns);

		const generatorOptions: DocGeneratorOptions = {
			regenerationMode: true,
			// Enable migration mode if upgrading from Nextra 3.x to 4.x
			migrationMode: needsMigration,
			...(docsite.visibility === "internal" && existingMetadata?.allowedDomain
				? { allowedDomain: existingMetadata.allowedDomain }
				: {}),
			// Pass context for preserving nav customizations (migration or regeneration)
			...(contextToUse !== undefined ? { migrationContext: contextToUse } : {}),
			// Pass branding/theme configuration for site styling
			...(existingMetadata?.branding !== undefined ? { theme: existingMetadata.branding } : {}),
			// Preserve existing _meta.ts order when auto-sync is off (manual selection)
			...(hasManualSelection ? { preserveNavOrder: true } : {}),
			// When auto-nav is ON, force articles into their space-derived folders
			// (overrides any manual file moves made while auto-nav was off)
			...(existingMetadata?.useSpaceFolderStructure ? { useSpaceFolderStructure: true } : {}),
		};

		const generationResult = generator.generateFromArticles(
			articles,
			docsite.name,
			docsite.displayName,
			generatorOptions,
		);
		const { files, removedNavEntries, foldersToDelete, warnings, relocatedFilePaths } = generationResult;

		let deletedFilePaths = generator.getDeletedFilePaths(changedArticles);

		// Delete old file paths for articles relocated by useSpaceFolderStructure.
		// GitHub API ignores deletions for files that don't exist.
		if (relocatedFilePaths.length > 0) {
			deletedFilePaths = [...deletedFilePaths, ...relocatedFilePaths];
		}
		let orphanedFiles: Array<string> = [];

		// For ALL Nextra sites, always delete old Pages Router files to ensure clean state.
		// This handles cases where:
		// 1. Site is migrating from Nextra 3.x to 4.x (needsMigration=true)
		// 2. Site was previously migrated but old files still exist in repo
		// The GitHub API ignores deletion requests for files that don't exist.
		if (framework === "nextra") {
			const nextra3xFiles = getNextra3xFilesToDelete();
			deletedFilePaths = [...deletedFilePaths, ...nextra3xFiles];

			// Delete API docs infrastructure when OpenAPI specs are removed from a site.
			// This handles the case where a site previously had OpenAPI specs but they've been
			// deselected/removed. We check if the current generation includes API docs files -
			// if not, we delete the old infrastructure. GitHub API ignores deletions for non-existent files.
			const hasApiDocs = files.some(f => f.path === "app/api-docs/[[...slug]]/page.tsx");
			if (!hasApiDocs) {
				deletedFilePaths.push("app/api-docs/[[...slug]]/page.tsx", "components/ApiReference.tsx");
			}

			// Detect and delete orphaned content files (files that don't correspond to any article)
			// This handles cases where files were incorrectly saved with wrong extension
			if (existingFilePaths && existingFilePaths.length > 0) {
				const expectedSlugs = articles.map(article => {
					const metadata = article.contentMetadata as { title?: string } | undefined;
					const title = metadata?.title || article.jrn;
					return slugify(title);
				});
				orphanedFiles = getOrphanedContentFiles(existingFilePaths, expectedSlugs);
				if (orphanedFiles.length > 0) {
					log.info({ orphanedFiles }, "Detected orphaned content files to delete");
					deletedFilePaths = [...deletedFilePaths, ...orphanedFiles];
				}
			}
		}

		return {
			files,
			deletedFilePaths,
			orphanedFiles,
			removedNavEntries,
			emptyFolders: foldersToDelete,
			warnings,
			generator,
			migratedToNextra4: needsMigration,
		};
	}

	/**
	 * Builds updated metadata after deployment.
	 * Extracts complex conditional logic from the regeneration route.
	 */
	function buildUpdatedMetadata(
		existingMetadata: SiteMetadata,
		deployment: DeploymentResult,
		protectionStatus: { isProtected: boolean; protectionType?: string },
		articles: Array<Doc>,
		migratedToNextra4: boolean,
		configFileHashes?: SiteMetadata["configFileHashes"],
	): SiteMetadata {
		// Ensure githubUrl is populated (reconstruct from githubRepo if missing)
		const githubUrl = existingMetadata.githubUrl || `https://github.com/${existingMetadata.githubRepo}`;

		return {
			githubRepo: existingMetadata.githubRepo,
			githubUrl,
			framework: existingMetadata.framework,
			// Update nextraVersion to "4" if migration occurred
			...(migratedToNextra4
				? { nextraVersion: "4" as const }
				: existingMetadata.nextraVersion
					? { nextraVersion: existingMetadata.nextraVersion }
					: {}),
			// Update production URL
			productionUrl: deployment.productionDomain || deployment.url,
			productionDeploymentId: deployment.deploymentId,
			deploymentStatus: "building", // Deployment is still building on Vercel
			// Deprecated fields for backward compatibility
			vercelUrl: deployment.productionDomain || deployment.url,
			vercelDeploymentId: deployment.deploymentId,
			articleCount: articles.length,
			lastDeployedAt: new Date().toISOString(),
			isProtected: protectionStatus.isProtected,
			lastProtectionCheck: new Date().toISOString(),
			...(protectionStatus.protectionType !== undefined
				? { protectionType: protectionStatus.protectionType }
				: {}),
			generatedArticleJrns: articles.map(a => a.jrn),
			generatedArticleTitles: buildArticleTitleMap(articles),
			generatedJwtAuthEnabled: existingMetadata.jwtAuth?.enabled ?? false,
			generatedUseSpaceFolderStructure: existingMetadata.useSpaceFolderStructure ?? false,
			// Preserve optional fields if they exist
			...(existingMetadata.allowedDomain ? { allowedDomain: existingMetadata.allowedDomain } : {}),
			...(existingMetadata.selectedArticleJrns
				? { selectedArticleJrns: existingMetadata.selectedArticleJrns }
				: {}),
			// Store config file hashes for detecting manual edits
			...(configFileHashes ? { configFileHashes } : {}),
			// Preserve jolli.site domain fields
			...(existingMetadata.subdomain ? { subdomain: existingMetadata.subdomain } : {}),
			...(existingMetadata.jolliSiteDomain ? { jolliSiteDomain: existingMetadata.jolliSiteDomain } : {}),
			// Preserve custom domains
			...(existingMetadata.customDomains ? { customDomains: existingMetadata.customDomains } : {}),
			// Preserve JWT auth configuration across redeployments
			...(existingMetadata.jwtAuth ? { jwtAuth: existingMetadata.jwtAuth } : {}),
			// Preserve branding and update generatedBranding to reflect this build
			...(existingMetadata.branding
				? { branding: existingMetadata.branding, generatedBranding: existingMetadata.branding }
				: {}),
			// Preserve folder structure setting
			...(existingMetadata.useSpaceFolderStructure !== undefined
				? { useSpaceFolderStructure: existingMetadata.useSpaceFolderStructure }
				: {}),
		};
	}
	/* c8 ignore stop */

	/**
	 * Regenerate docsite asynchronously after API response.
	 * Extracted from route handler to reduce complexity.
	 */
	/* c8 ignore start */
	async function regenerateDocsiteAsync(
		siteDao: SiteDao,
		docsite: Site,
		config: ReturnType<typeof getConfig>,
	): Promise<void> {
		const siteId = docsite.id;
		const totalSteps = 7;

		// Clear previous build output before starting new build
		clearEventBuffer(siteId);
		broadcastBuildEvent(siteId, { type: "build:clear" });
		broadcastBuildEvent(siteId, { type: "build:mode", mode: "rebuild", totalSteps });

		try {
			const existingMetadata = requireSiteMetadata(docsite);

			// Step 1: Fetch articles
			const { articles, changedArticles } = await executeStep1FetchArticles(
				siteDao,
				docsite,
				siteId,
				totalSteps,
				existingMetadata,
			);

			// Step 2: Fetch migration/nav context
			const { migrationContext, existingNavMetaContext } = await executeStep2FetchContext(
				siteDao,
				docsite,
				siteId,
				totalSteps,
				existingMetadata,
				changedArticles,
			);

			// Validate image references before generation (fail early if relative paths found)
			const imageValidationResult = validateArticlesForGeneration(articles);
			if (!imageValidationResult.isValid) {
				const errorMessage = formatPreGenerationErrors(imageValidationResult);
				log.error(
					{ docsiteId: docsite.id, invalidArticles: imageValidationResult.invalidArticles.length },
					"Site regeneration failed: invalid image references found",
				);
				broadcastBuildEvent(siteId, { type: "build:failed", error: errorMessage });
				// Throw error to let catch block handle site status update
				throw new Error(errorMessage);
			}

			// Validate article cross-reference links (non-blocking warning)
			validateAndBroadcastArticleLinks(siteId, articles, 2);

			// Step 3: Generate files
			const { files, deletedFilePaths, emptyFolders, migratedToNextra4 } = await executeStep3GenerateFiles(
				siteDao,
				docsite,
				siteId,
				totalSteps,
				existingMetadata,
				articles,
				changedArticles,
				migrationContext,
				existingNavMetaContext,
			);

			// Step 4: Upload to GitHub and download complete repo
			const { allFiles, metadata } = await executeStep4GitHubOperations(
				siteDao,
				docsite,
				siteId,
				totalSteps,
				existingMetadata,
				files,
				deletedFilePaths,
				emptyFolders,
			);

			// Step 5: Write files and deploy to Vercel with streaming
			const deployment = await executeStep5DeployWithStreaming(
				siteDao,
				docsite,
				siteId,
				totalSteps,
				existingMetadata,
				allFiles,
				config,
			);

			// Step 6-7: Configure protection and finalize
			// Compute config file hashes from the generated files for change detection
			const configFileHashes = extractConfigFileHashes(files);
			await executeStep6And7Finalize(
				siteDao,
				docsite,
				siteId,
				totalSteps,
				existingMetadata,
				metadata,
				deployment,
				articles,
				migratedToNextra4,
				config,
				configFileHashes,
			);
		} catch (error) {
			await handleRegenerationError(siteDao, docsite, siteId, error);
		}
	}

	async function executeStep1FetchArticles(
		siteDao: SiteDao,
		docsite: Site,
		siteId: number,
		totalSteps: number,
		existingMetadata: SiteMetadata,
	): Promise<{ articles: Array<Doc>; changedArticles: Array<ChangedArticle> }> {
		const step1Message = "[1/7] Fetching articles...";
		log.info({ docsiteId: docsite.id }, "Fetching articles for regeneration");
		await siteDao.updateSite({
			...docsite,
			metadata: { ...existingMetadata, buildProgress: step1Message },
		});
		broadcastBuildEvent(siteId, { type: "build:step", step: 1, total: totalSteps, message: step1Message });

		const articles = await siteDao.getArticlesForSite(docsite.id);
		const changedArticles = await siteDao.getChangedArticles(docsite.id);
		log.info(
			{
				docsiteId: docsite.id,
				articleCount: articles.length,
				changedCount: changedArticles.length,
				selectedJrns: getSiteMetadata(docsite)?.selectedArticleJrns,
				articleJrns: articles.map(a => a.jrn),
			},
			"Fetched articles and change info for rebuild",
		);
		// Broadcast article list (zero articles is valid - generates a placeholder page)
		if (articles.length === 0) {
			broadcastBuildEvent(siteId, {
				type: "build:stdout",
				step: 1,
				output: "No articles selected - site will show a placeholder page",
			});
		} else {
			const selectionMode = existingMetadata.selectedArticleJrns?.length ? `${articles.length} selected` : "all";
			broadcastBuildEvent(siteId, {
				type: "build:stdout",
				step: 1,
				output: `Found ${articles.length} article(s) to include (${selectionMode}):`,
			});
			for (const article of articles) {
				const articleTitle = (article.contentMetadata as { title?: string } | undefined)?.title || article.jrn;
				broadcastBuildEvent(siteId, { type: "build:stdout", step: 1, output: `  - ${articleTitle}` });
			}
		}

		return { articles, changedArticles };
	}

	async function executeStep2FetchContext(
		siteDao: SiteDao,
		docsite: Site,
		siteId: number,
		totalSteps: number,
		existingMetadata: SiteMetadata,
		changedArticles: Array<ChangedArticle>,
	): Promise<RegenerationContexts> {
		const isMigration = needsNextraMigration(docsite);
		const step2Message = isMigration
			? "[2/7] Detected Nextra 3.x site - migrating to 4.x..."
			: "[2/7] Checking existing configuration...";
		await siteDao.updateSite({
			...docsite,
			metadata: { ...existingMetadata, buildProgress: step2Message },
		});
		broadcastBuildEvent(siteId, { type: "build:step", step: 2, total: totalSteps, message: step2Message });

		return fetchRegenerationContexts(docsite, changedArticles);
	}

	/**
	 * Bundle images from article content files into static files.
	 * Delegates to the standalone implementation with router-scoped dependencies.
	 */
	function bundleImagesIntoFiles(
		files: Array<FileTree>,
		siteId: number,
		docsiteId: number,
		existingFilePaths?: Array<string>,
	): Promise<ImageBundleResult> {
		const tenantContext = getTenantContext();
		return bundleImagesIntoFilesImpl(
			files,
			siteId,
			docsiteId,
			imageStorageService,
			tenantContext?.tenant.id,
			existingFilePaths,
		);
	}

	async function executeStep3GenerateFiles(
		siteDao: SiteDao,
		docsite: Site,
		siteId: number,
		totalSteps: number,
		existingMetadata: SiteMetadata,
		articles: Array<Doc>,
		changedArticles: Array<ChangedArticle>,
		migrationContext: MigrationContext | undefined,
		existingNavMetaContext: MigrationContext | undefined,
	): Promise<{
		files: Array<FileTree>;
		deletedFilePaths: Array<string>;
		emptyFolders: Array<string>;
		migratedToNextra4: boolean;
	}> {
		const step3Message = "[3/7] Generating documentation files...";
		log.info({ docsiteId: docsite.id }, "Regenerating documentation project");
		await siteDao.updateSite({
			...docsite,
			metadata: { ...existingMetadata, buildProgress: step3Message },
		});
		broadcastBuildEvent(siteId, { type: "build:step", step: 3, total: totalSteps, message: step3Message });

		const metadata = requireSiteMetadata(docsite);
		const [owner, repo] = metadata.githubRepo.split("/");
		const existingFilePaths = await fetchExistingFilePaths(owner, repo, docsite.id);

		const { files, deletedFilePaths, orphanedFiles, removedNavEntries, emptyFolders, warnings, migratedToNextra4 } =
			generateFilesAndDeletedPaths(
				docsite,
				articles,
				changedArticles,
				migrationContext,
				existingNavMetaContext,
				existingFilePaths,
			);
		log.info(
			{ docsiteId: docsite.id, fileCount: files.length, migratedToNextra4 },
			"Regenerated documentation files",
		);

		// Broadcast orphaned files being removed
		if (orphanedFiles.length > 0) {
			broadcastBuildEvent(siteId, {
				type: "build:stdout",
				step: 3,
				output: `Cleaning up ${orphanedFiles.length} orphaned file(s):`,
			});
			for (const file of orphanedFiles) {
				broadcastBuildEvent(siteId, { type: "build:stdout", step: 3, output: `  - Removing: ${file}` });
			}
		}

		// Broadcast orphaned nav entries being removed
		if (removedNavEntries.length > 0) {
			broadcastBuildEvent(siteId, {
				type: "build:stdout",
				step: 3,
				output: `Cleaning up ${removedNavEntries.length} orphaned navigation entry/entries from _meta.ts:`,
			});
			for (const entry of removedNavEntries) {
				broadcastBuildEvent(siteId, { type: "build:stdout", step: 3, output: `  - Removing: ${entry}` });
			}
		}

		// Broadcast empty folders being removed
		if (emptyFolders.length > 0) {
			broadcastBuildEvent(siteId, {
				type: "build:stdout",
				step: 3,
				output: `Cleaning up ${emptyFolders.length} empty folder(s):`,
			});
			for (const folder of emptyFolders) {
				broadcastBuildEvent(siteId, { type: "build:stdout", step: 3, output: `  - Removing: ${folder}` });
			}
		}

		// Log and broadcast warnings (e.g., slug collisions)
		if (warnings.length > 0) {
			log.warn({ docsiteId: docsite.id, warnings }, "Generation produced %d warning(s)", warnings.length);
			broadcastBuildEvent(siteId, {
				type: "build:stdout",
				step: 3,
				output: `Warning: ${warnings.length} issue(s) detected during generation:`,
			});
			for (const warning of warnings) {
				broadcastBuildEvent(siteId, { type: "build:stdout", step: 3, output: `  ⚠ ${warning}` });
			}
		}

		// Resolve article cross-reference links (JRN -> site URL)
		const linkResolvedFiles = resolveAndBroadcastArticleLinks(siteId, files, articles, 3);

		// Bundle images from articles into static files and detect orphaned images
		const { files: finalFiles, orphanedImagePaths } = await bundleImagesIntoFiles(
			linkResolvedFiles,
			siteId,
			docsite.id,
			existingFilePaths,
		);

		// Broadcast orphaned images being removed
		if (orphanedImagePaths.length > 0) {
			broadcastBuildEvent(siteId, {
				type: "build:stdout",
				step: 3,
				output: `Cleaning up ${orphanedImagePaths.length} orphaned image(s):`,
			});
			for (const imagePath of orphanedImagePaths) {
				broadcastBuildEvent(siteId, { type: "build:stdout", step: 3, output: `  - Removing: ${imagePath}` });
			}
		}

		// Include orphaned images in files to delete
		const allDeletedFilePaths = [...deletedFilePaths, ...orphanedImagePaths];

		// Add _meta.ts files from empty folders to deletedFilePaths so they're removed in the same commit
		// This prevents race conditions where Vercel builds before folder deletion completes
		for (const folderPath of emptyFolders) {
			allDeletedFilePaths.push(`${folderPath}/_meta.ts`);
		}

		return { files: finalFiles, deletedFilePaths: allDeletedFilePaths, emptyFolders, migratedToNextra4 };
	}

	async function executeStep4GitHubOperations(
		siteDao: SiteDao,
		docsite: Site,
		siteId: number,
		totalSteps: number,
		existingMetadata: SiteMetadata,
		files: Array<FileTree>,
		deletedFilePaths: Array<string>,
		emptyFolders: Array<string>,
	): Promise<{ allFiles: Array<FileTree>; metadata: SiteMetadata; owner: string; repo: string }> {
		const metadata = requireSiteMetadata(docsite);
		const [owner, repo] = metadata.githubRepo.split("/");

		// Step 4: Upload to GitHub and download complete repo
		const step4Message = "[4/7] Uploading files to GitHub...";
		const octokit = createOctokit();
		const githubClient = createDocsiteGitHub(octokit);

		log.info({ docsiteId: docsite.id, repo: metadata.githubRepo }, "Updating GitHub repository");
		await siteDao.updateSite({
			...docsite,
			metadata: { ...existingMetadata, buildProgress: step4Message },
		});
		broadcastBuildEvent(siteId, { type: "build:step", step: 4, total: totalSteps, message: step4Message });

		if (deletedFilePaths.length > 0) {
			log.info({ docsiteId: docsite.id, deletedFilePaths }, "Will delete files for removed articles");
		}

		const newCommitSha = await githubClient.uploadDocusaurusProjectPreservingNonMdFiles(
			owner,
			repo,
			files,
			deletedFilePaths,
		);
		log.info(
			{ docsiteId: docsite.id, commitSha: newCommitSha },
			"Updated GitHub repository (preserved custom files)",
		);

		// Delete empty folders (folders with only _meta.ts or completely empty after article removal)
		// This must happen after the main upload to avoid conflicts
		if (emptyFolders.length > 0) {
			log.info({ docsiteId: docsite.id, emptyFolders }, "Deleting empty content folders");
			for (const folderPath of emptyFolders) {
				try {
					await githubClient.deleteFolder(owner, repo, folderPath);
					log.info({ docsiteId: docsite.id, folderPath }, "Deleted empty folder");
				} catch (error) {
					// Log but don't fail - folder might already be gone or have other issues
					log.warn(
						{ docsiteId: docsite.id, folderPath, error },
						"Failed to delete empty folder (may not exist)",
					);
				}
			}
		}

		log.info({ docsiteId: docsite.id, commitSha: newCommitSha }, "Downloading all files from specific commit");
		const allFiles = await githubClient.downloadRepository(owner, repo, newCommitSha);
		log.info({ docsiteId: docsite.id, fileCount: allFiles.length }, "Downloaded all files");

		return { allFiles, metadata, owner, repo };
	}

	async function executeStep5DeployWithStreaming(
		siteDao: SiteDao,
		docsite: Site,
		siteId: number,
		totalSteps: number,
		existingMetadata: SiteMetadata,
		allFiles: Array<FileTree>,
		config: ReturnType<typeof getConfig>,
	): Promise<DeploymentResult> {
		// Step 5: Write files to temp directory and deploy to Vercel with streaming
		const step5Message = "[5/7] Deploying to Vercel and building...";
		await siteDao.updateSite({
			...docsite,
			metadata: { ...existingMetadata, buildProgress: step5Message },
		});
		broadcastBuildEvent(siteId, { type: "build:step", step: 5, total: totalSteps, message: step5Message });

		// Write files to temp directory for Vercel deployment
		const tempDir = join(tmpdir(), `newdocsite-${docsite.id}-${Date.now()}`);
		await mkdir(tempDir, { recursive: true });
		registerBuildTempDir(siteId, tempDir);
		broadcastBuildEvent(siteId, { type: "build:stdout", step: 5, output: `Created temp directory: ${tempDir}` });

		try {
			for (const file of allFiles) {
				const filePath = join(tempDir, file.path);
				const dirPath = join(filePath, "..");
				await mkdir(dirPath, { recursive: true });
				// Binary files (images) are base64-encoded, text files are UTF-8
				if (file.encoding === "base64") {
					await writeFile(filePath, Buffer.from(file.content, "base64"));
				} else {
					await writeFile(filePath, file.content, "utf-8");
				}
			}
			log.info({ docsiteId: docsite.id, tempDir }, "Wrote all files to temp directory");

			const vercelToken = config.VERCEL_TOKEN;
			if (!vercelToken) {
				throw new Error("VERCEL_TOKEN is not configured");
			}

			log.info({ docsiteId: docsite.id }, "Redeploying to Vercel as PRODUCTION");

			// Extract repo name from existing metadata for backwards compatibility
			// Old sites have format "org/sitename", new sites have "org/tenantSlug-sitename-siteId"
			const [, repoName] = existingMetadata.githubRepo.split("/");
			const framework = existingMetadata.framework || "nextra";
			const deployment = await deployToVercel(
				tempDir,
				repoName,
				vercelToken,
				"production",
				framework === "nextra" ? "nextra" : "docusaurus",
			);

			// Check if deployment creation failed immediately
			if (deployment.status === "error") {
				const errorDetails = deployment.error || "Unknown deployment error";
				log.error({ docsiteId: docsite.id, errorDetails }, "Vercel deployment creation failed");
				await siteDao.updateSite({
					...docsite,
					status: "error",
					metadata: {
						...existingMetadata,
						buildProgress: "[5/7] Deployment failed",
						validationErrors: errorDetails,
						lastBuildError: "Vercel deployment failed",
					},
				});
				broadcastBuildEvent(siteId, { type: "build:failed", step: 5, error: errorDetails });
				throw new Error(`Deployment failed: ${errorDetails}`);
			}

			// Wait for Vercel build to complete, streaming events back to frontend
			log.info(
				{ docsiteId: docsite.id, deploymentId: deployment.deploymentId },
				"[5/7] Waiting for Vercel build",
			);
			const deployer = new VercelDeployer(vercelToken);
			const buildResult = await deployer.waitForDeployment(
				deployment.deploymentId,
				createBuildEventHandlers(broadcastBuildEvent, siteId, 5),
			);

			if (buildResult.status === "error") {
				const errorDetails = buildResult.error || "Vercel build failed";
				log.error({ docsiteId: docsite.id, errorDetails }, "Vercel build failed");
				await siteDao.updateSite({
					...docsite,
					status: "error",
					metadata: {
						...existingMetadata,
						buildProgress: "[5/7] Build failed - see error details",
						validationErrors: errorDetails,
						lastBuildError: "Vercel build failed",
					},
				});
				broadcastBuildEvent(siteId, { type: "build:failed", step: 5, error: errorDetails });
				throw new Error(`Build failed:\n${errorDetails}`);
			}

			log.info({ docsiteId: docsite.id, productionUrl: deployment.url }, "Vercel build completed");
			return deployment;
		} finally {
			// Clean up temp directory
			await cleanupTempDirectory(tempDir);
			unregisterBuildTempDir(siteId);
			broadcastBuildEvent(siteId, {
				type: "build:stdout",
				step: 5,
				output: `Removed temp directory: ${tempDir}`,
			});
		}
	}

	async function executeStep6And7Finalize(
		siteDao: SiteDao,
		docsite: Site,
		siteId: number,
		totalSteps: number,
		existingMetadata: SiteMetadata,
		metadata: SiteMetadata,
		deployment: DeploymentResult,
		articles: Array<Doc>,
		migratedToNextra4: boolean,
		config: ReturnType<typeof getConfig>,
		configFileHashes?: SiteMetadata["configFileHashes"],
	): Promise<void> {
		// Step 6: Configure site protection
		const step6Message = "[6/7] Configuring site protection...";
		log.info({ docsiteId: docsite.id }, "Setting protection based on visibility");
		await siteDao.updateSite({
			...docsite,
			metadata: { ...existingMetadata, buildProgress: step6Message },
		});
		broadcastBuildEvent(siteId, { type: "build:step", step: 6, total: totalSteps, message: step6Message });

		const vercelToken = config.VERCEL_TOKEN;
		if (!vercelToken) {
			throw new Error("VERCEL_TOKEN is not configured");
		}

		// Use repo name from metadata for Vercel project operations (backwards compatible)
		const [, vercelProjectName] = existingMetadata.githubRepo.split("/");
		const { protectionStatus } = await setDocsiteProtection(docsite, vercelProjectName, vercelToken);
		log.info({ docsiteId: docsite.id, protectionStatus }, "Protection configured");

		// Register jolli.site domain if not already set (e.g., initial build failed before domain registration)
		let jolliDomainFields: { subdomain?: string; jolliSiteDomain?: string } = {};
		if (!existingMetadata.jolliSiteDomain && config.JOLLI_SITE_ENABLED) {
			log.info({ docsiteId: docsite.id }, "Jolli.site domain missing - attempting to register on rebuild");
			const deployer = new VercelDeployer(vercelToken);
			// Use existing subdomain if available, otherwise fall back to site name
			const effectiveSubdomain = existingMetadata.subdomain || docsite.name;
			jolliDomainFields = await registerJolliSiteDomain(
				deployer,
				docsite.name,
				vercelProjectName,
				docsite.id,
				config,
				effectiveSubdomain,
			);
			if (jolliDomainFields.jolliSiteDomain) {
				log.info(
					{ docsiteId: docsite.id, domain: jolliDomainFields.jolliSiteDomain },
					"Jolli.site domain registered on rebuild",
				);
			}
		}

		const updatedMetadata = buildUpdatedMetadata(
			metadata,
			deployment,
			protectionStatus,
			articles,
			migratedToNextra4,
			configFileHashes,
		);

		// Merge in jolli.site domain fields if they were just registered
		if (jolliDomainFields.subdomain) {
			updatedMetadata.subdomain = jolliDomainFields.subdomain;
		}
		if (jolliDomainFields.jolliSiteDomain) {
			updatedMetadata.jolliSiteDomain = jolliDomainFields.jolliSiteDomain;
		}

		// Step 7: Finalize
		const step7Message = "[7/7] Done!";
		broadcastBuildEvent(siteId, { type: "build:step", step: 7, total: totalSteps, message: step7Message });

		await siteDao.updateSite({
			...docsite,
			status: "active",
			metadata: updatedMetadata,
			lastGeneratedAt: new Date(),
		});

		broadcastBuildEvent(siteId, {
			type: "build:completed",
			status: "active",
			url: updatedMetadata.productionUrl || updatedMetadata.vercelUrl || "",
		});

		log.info({ docsiteId: docsite.id }, "Docsite regeneration completed successfully");
	}

	async function handleRegenerationError(
		siteDao: SiteDao,
		docsite: Site,
		siteId: number,
		error: unknown,
	): Promise<void> {
		const errorMessage = error instanceof Error ? error.message : /* v8 ignore next */ "Unknown error";
		log.error(
			{
				docsiteId: docsite.id,
				errorMessage,
				errorStack: error instanceof Error ? error.stack : /* v8 ignore next */ undefined,
			},
			"Failed to regenerate docsite",
		);

		const errorMetadata = requireSiteMetadata(docsite);
		const updatedMetadata: SiteMetadata = {
			...errorMetadata,
			lastBuildError: errorMessage,
		};

		await siteDao.updateSite({
			...docsite,
			status: "error",
			metadata: updatedMetadata,
		});

		broadcastBuildEvent(siteId, { type: "build:failed", error: errorMessage });
	}
	/* c8 ignore stop */

	// Regenerate docsite (update site with latest articles)
	/* c8 ignore start */
	router.put("/:id/regenerate", permissionMiddleware.requirePermission("sites.edit"), async (req, res) => {
		try {
			const siteDao = siteDaoProvider.getDao(getTenantContext());
			const id = Number.parseInt(req.params.id, 10);
			if (Number.isNaN(id)) {
				res.status(400).json({ error: "Invalid docsite ID" });
				return;
			}

			let docsite = await siteDao.getSite(id);
			if (!docsite) {
				res.status(404).json({ error: "Docsite not found" });
				return;
			}

			const config = getConfig();

			// Get user ID for audit log
			const userId = req.orgUser?.id ?? tokenUtil.decodePayload(req)?.userId;
			const oldDocsite = { ...docsite };

			// Update status to "building"
			docsite = (await siteDao.updateSite({
				...docsite,
				status: "building",
			})) as Site;

			// Audit log site regeneration
			auditLog({
				action: "update",
				resourceType: "site",
				resourceId: String(id),
				resourceName: docsite.displayName || docsite.name,
				actorId: typeof userId === "number" ? userId : null,
				changes: computeAuditChanges(
					oldDocsite as unknown as Record<string, unknown>,
					docsite as unknown as Record<string, unknown>,
					"site",
				),
				metadata: { operation: "regenerate" },
			});

			// Return immediately
			res.json(stripSiteSecrets(docsite));

			// Continue processing asynchronously
			regenerateDocsiteAsync(siteDao, docsite, config);
		} catch (error) {
			log.error(error, "Failed to regenerate docsite");
			res.status(500).json({ error: "Failed to regenerate docsite" });
		}
	});
	/* c8 ignore stop */

	// Update site articles (change article selection)
	router.put("/:id/articles", permissionMiddleware.requirePermission("sites.edit"), async (req, res) => {
		try {
			const siteDao = siteDaoProvider.getDao(getTenantContext());
			const id = Number.parseInt(req.params.id, 10);
			if (Number.isNaN(id)) {
				res.status(400).json({ error: "Invalid site ID" });
				return;
			}

			const { selectedArticleJrns } = req.body;

			// Validate input: null means "all articles", array means specific selection
			if (selectedArticleJrns !== null && !Array.isArray(selectedArticleJrns)) {
				res.status(400).json({ error: "selectedArticleJrns must be an array or null" });
				return;
			}

			const oldDocsite = await siteDao.getSite(id);
			if (!oldDocsite) {
				res.status(404).json({ error: "Site not found" });
				return;
			}

			// Update metadata with new article selection
			const metadata = getMetadataForUpdate(oldDocsite);
			const updatedMetadata: SiteMetadata = {
				...metadata,
			};

			// null means "all articles" - remove the field
			// empty array [] means "zero articles selected" - store as empty array
			// non-empty array means specific selection
			if (selectedArticleJrns === null) {
				delete updatedMetadata.selectedArticleJrns;
			} else {
				updatedMetadata.selectedArticleJrns = selectedArticleJrns;
			}

			const updatedDocsite = await siteDao.updateSite({
				...oldDocsite,
				metadata: updatedMetadata,
			});
			if (!updatedDocsite) {
				res.status(404).json({ error: "Site not found after update" });
				return;
			}

			// Audit log
			const userId = req.orgUser?.id ?? tokenUtil.decodePayload(req)?.userId;
			auditLog({
				action: "update",
				resourceType: "site",
				resourceId: String(id),
				resourceName: oldDocsite.displayName || oldDocsite.name,
				actorId: typeof userId === "number" ? userId : null,
				changes: computeAuditChanges(
					oldDocsite as unknown as Record<string, unknown>,
					updatedDocsite as unknown as Record<string, unknown>,
					"site",
				),
				metadata: {
					operation: "update_articles",
					selectedCount: selectedArticleJrns?.length ?? "all",
				},
			});

			// Return site with needsUpdate flag and change detection
			const changedArticles = await siteDao.getChangedArticles(id);
			const updateResult = computeNeedsUpdate(updatedMetadata, changedArticles.length > 0);

			log.info(
				{
					siteId: id,
					selectedCount: selectedArticleJrns?.length ?? "all",
					selectedJrns: selectedArticleJrns,
					savedMetadata: updatedDocsite?.metadata,
				},
				"Updated site article selection",
			);

			res.json(buildSiteUpdateResponse(updatedDocsite, updateResult, changedArticles));
		} catch (error) {
			log.error(error, "Failed to update site articles");
			res.status(500).json({ error: "Failed to update site articles" });
		}
	});

	// Update repository file
	/* c8 ignore start */
	router.put("/:id/repository-file", permissionMiddleware.requirePermission("sites.edit"), async (req, res) => {
		try {
			const siteDao = siteDaoProvider.getDao(getTenantContext());
			const id = Number.parseInt(req.params.id, 10);
			if (Number.isNaN(id)) {
				res.status(400).json({ error: "Invalid site ID" });
				return;
			}

			const { filePath, content } = req.body;
			if (!filePath || content === undefined) {
				res.status(400).json({ error: "filePath and content are required" });
				return;
			}

			// Validate filePath doesn't contain path traversal sequences
			if (hasPathTraversal(filePath)) {
				res.status(400).json({ error: "Invalid file path" });
				return;
			}

			// Check if file is .md or .mdx
			const extension = filePath.split(".").pop()?.toLowerCase();
			if (extension === "md" || extension === "mdx") {
				res.status(400).json({
					error: "Cannot edit MD/MDX files directly. Use regenerate to update articles.",
				});
				return;
			}

			const docsite = await siteDao.getSite(id);
			if (!docsite) {
				res.status(404).json({ error: "Site not found" });
				return;
			}

			const metadata = getSiteMetadata(docsite);
			if (!metadata?.githubRepo) {
				res.status(400).json({ error: "Site does not have a GitHub repository" });
				return;
			}

			const [owner, repo] = metadata.githubRepo.split("/");
			const octokit = createOctokit();
			const githubClient = createDocsiteGitHub(octokit);

			// Create automatic commit message
			const commitMessage = `Update ${filePath}

Updated via Jolli repository editor`;

			await githubClient.updateRepositoryFile(owner, repo, filePath, content, commitMessage);

			log.info({ siteId: id, filePath }, "Updated repository file");

			// Audit log
			const userId = req.orgUser?.id ?? tokenUtil.decodePayload(req)?.userId;
			auditLog({
				action: "update",
				resourceType: "site",
				resourceId: String(id),
				resourceName: docsite.displayName || docsite.name,
				actorId: typeof userId === "number" ? userId : null,
				changes: [],
				metadata: {
					operation: "update_repository_file",
					filePath,
				},
			});

			res.json({ success: true });
		} catch (error) {
			log.error(error, "Failed to update repository file");
			res.status(500).json({ error: "Failed to update repository file" });
		}
	});
	/* c8 ignore stop */

	// Format code using Biome
	router.post("/format-code", permissionMiddleware.requirePermission("sites.edit"), async (req, res) => {
		try {
			const { content, filePath } = req.body;

			if (content === undefined || content === null) {
				res.status(400).json({ error: "content is required" });
				return;
			}

			if (!filePath) {
				res.status(400).json({ error: "filePath is required" });
				return;
			}

			// Only allow formatting TypeScript/JavaScript files
			const extension = filePath.split(".").pop()?.toLowerCase();
			const supportedExtensions = ["ts", "tsx", "js", "jsx", "json"];
			if (!extension || !supportedExtensions.includes(extension)) {
				res.status(400).json({
					error: `Unsupported file type. Supported: ${supportedExtensions.join(", ")}`,
				});
				return;
			}

			/* c8 ignore start - Biome dynamic import is hard to mock in tests */
			// Use Biome to format the code
			const { Biome, Distribution } = await import("@biomejs/js-api");
			const biome = await Biome.create({ distribution: Distribution.NODE });

			// Open a project to get a project key
			const { projectKey } = biome.openProject();

			// Apply formatting config for user content (2-space indentation)
			biome.applyConfiguration(projectKey, {
				formatter: {
					indentStyle: "space",
					indentWidth: 2,
					lineWidth: 120,
				},
			});

			const result = biome.formatContent(projectKey, content, { filePath });

			if (result.diagnostics && result.diagnostics.length > 0) {
				// Return first error if formatting failed
				const firstError = result.diagnostics[0];
				res.status(400).json({
					error: `Format error: ${firstError.message || "Unknown formatting error"}`,
				});
				return;
			}

			// Post-process the formatted content:
			// 1. Remove all blank lines (lines with only whitespace)
			// 2. Trim trailing whitespace/newlines
			const cleaned = result.content
				.split("\n")
				.filter((line: string) => line.trim() !== "")
				.join("\n")
				.trimEnd();
			res.json({ formatted: cleaned });
		} catch (error) {
			log.error(error, "Failed to format code");
			res.status(500).json({ error: "Failed to format code" });
		}
		/* c8 ignore stop */
	});

	// Cancel build - allows users to stop a stuck or in-progress build
	router.post("/:id/cancel-build", permissionMiddleware.requirePermission("sites.edit"), async (req, res) => {
		try {
			const siteDao = siteDaoProvider.getDao(getTenantContext());
			const id = Number.parseInt(req.params.id, 10);
			if (Number.isNaN(id)) {
				res.status(400).json({ error: "Invalid site ID" });
				return;
			}

			const docsite = await siteDao.getSite(id);
			if (!docsite) {
				res.status(404).json({ error: "Site not found" });
				return;
			}

			// Only allow cancelling if currently building or pending
			if (docsite.status !== "building" && docsite.status !== "pending") {
				res.status(400).json({ error: "Site is not currently building" });
				return;
			}

			// Clean up temp directory if one exists for this build
			const tempDir = getBuildTempDir(id);
			if (tempDir) {
				await cleanupTempDirectory(tempDir);
				unregisterBuildTempDir(id);
				broadcastBuildEvent(id, {
					type: "build:stdout",
					step: 0,
					output: `Removed temp directory: ${tempDir}`,
				});
				log.info({ siteId: id, tempDir }, "Cleaned up temp directory on build cancel");
			}

			// Update status to error with cancellation message
			const existingMetadata = getMetadataForUpdate(docsite);
			// Remove buildProgress by destructuring and omitting it
			const { buildProgress: _unused, ...metadataWithoutProgress } = existingMetadata;
			const updatedDocsite = await siteDao.updateSite({
				...docsite,
				status: "error",
				metadata: {
					...metadataWithoutProgress,
					lastBuildError: "Build cancelled by user",
				},
			});

			// Broadcast cancellation via SSE
			broadcastBuildEvent(id, {
				type: "build:failed",
				error: "Build cancelled by user",
			});

			log.info({ siteId: id }, "Build cancelled by user");

			res.json(stripSiteSecrets(updatedDocsite));
		} catch (error) {
			log.error(error, "Failed to cancel build");
			res.status(500).json({ error: "Failed to cancel build" });
		}
	});

	// Validate _meta.ts syntax - called when saving in RepositoryViewer
	router.post("/:id/validate-meta", permissionMiddleware.requirePermission("sites.edit"), async (req, res) => {
		try {
			const siteDao = siteDaoProvider.getDao(getTenantContext());
			const id = Number.parseInt(req.params.id, 10);
			if (Number.isNaN(id)) {
				res.status(400).json({ error: "Invalid site ID" });
				return;
			}

			const { content } = req.body;
			if (content === undefined || typeof content !== "string") {
				res.status(400).json({ error: "content is required and must be a string" });
				return;
			}

			const docsite = await siteDao.getSite(id);
			if (!docsite) {
				res.status(404).json({ error: "Site not found" });
				return;
			}

			const merger = new MetaMerger();
			const result = merger.validateSyntax(content);

			if (!result.valid) {
				res.json({
					valid: false,
					error: result.error,
					line: result.line,
					column: result.column,
				});
				return;
			}

			res.json({ valid: true });
		} catch (error) {
			log.error(error, "Failed to validate _meta.ts syntax");
			res.status(500).json({ error: "Failed to validate _meta.ts syntax" });
		}
	});

	// Validate consistency between _meta.ts and content folder - called before rebuild
	/* c8 ignore start */
	router.post("/:id/validate-consistency", permissionMiddleware.requirePermission("sites.edit"), async (req, res) => {
		try {
			const siteDao = siteDaoProvider.getDao(getTenantContext());
			const id = Number.parseInt(req.params.id, 10);
			if (Number.isNaN(id)) {
				res.status(400).json({ error: "Invalid site ID" });
				return;
			}

			const docsite = await siteDao.getSite(id);
			if (!docsite) {
				res.status(404).json({ error: "Site not found" });
				return;
			}

			const metadata = getSiteMetadata(docsite);
			if (!metadata?.githubRepo) {
				res.status(400).json({ error: "Site does not have a GitHub repository" });
				return;
			}

			const [owner, repo] = metadata.githubRepo.split("/");
			const octokit = createOctokit();
			const githubClient = createDocsiteGitHub(octokit);

			// Use fast consistency check (only fetches paths + _meta.ts content, not all file contents)
			const checkData = await githubClient.getConsistencyCheckData(owner, repo);

			if (!checkData.metaContent) {
				// No _meta.ts file means no consistency issues to check
				res.json({
					valid: true,
					orphanedEntries: [],
					missingEntries: [],
					canProceed: true,
				});
				return;
			}

			// Get content folder slugs (MDX files in content directory)
			const contentSlugs = checkData.filePaths
				.filter(p => p.startsWith("content/") && p.endsWith(".mdx"))
				.map(p => p.replace("content/", "").replace(".mdx", ""));

			const merger = new MetaMerger();
			const result = merger.validateConsistency(checkData.metaContent, contentSlugs);

			res.json({
				valid: result.valid,
				orphanedEntries: result.orphanedEntries,
				missingEntries: result.missingEntries,
				canProceed: result.canProceed,
			});
		} catch (error) {
			log.error(error, "Failed to validate _meta.ts consistency");
			res.status(500).json({ error: "Failed to validate _meta.ts consistency" });
		}
	});
	/* c8 ignore stop */

	// Delete site
	/* c8 ignore start */
	router.delete("/:id", permissionMiddleware.requirePermission("sites.edit"), async (req, res) => {
		try {
			const siteDao = siteDaoProvider.getDao(getTenantContext());
			const id = Number.parseInt(req.params.id, 10);
			if (Number.isNaN(id)) {
				res.status(400).json({ error: "Invalid docsite ID" });
				return;
			}

			const docsite = await siteDao.getSite(id);
			if (!docsite) {
				res.status(404).json({ error: "Docsite not found" });
				return;
			}

			// Get user ID for audit log
			const userId = req.orgUser?.id ?? tokenUtil.decodePayload(req)?.userId;

			// Delete from database first
			await siteDao.deleteSite(id);

			// Audit log site deletion
			auditLog({
				action: "delete",
				resourceType: "site",
				resourceId: String(id),
				resourceName: docsite.displayName || docsite.name,
				actorId: typeof userId === "number" ? userId : null,
				changes: computeAuditChanges(docsite as unknown as Record<string, unknown>, null, "site"),
			});

			// Return immediately
			res.status(204).send();

			// Clean up resources asynchronously
			(async () => {
				const config = getConfig();
				const metadata = getSiteMetadata(docsite);

				if (metadata?.githubRepo) {
					try {
						const [owner, repo] = metadata.githubRepo.split("/");
						const octokit = createOctokit();
						const githubClient = createDocsiteGitHub(octokit);
						await githubClient.deleteRepository(owner, repo);
						log.info({ docsiteId: id, repo: metadata.githubRepo }, "Deleted GitHub repository");
					} catch (error) {
						log.error(
							{ docsiteId: id, repo: metadata.githubRepo, error },
							"Failed to delete GitHub repository",
						);
					}
				}

				if (config.VERCEL_TOKEN && metadata?.githubRepo) {
					try {
						// Use repo name from metadata for Vercel project (backwards compatible)
						const [, vercelProjectName] = metadata.githubRepo.split("/");
						const deployer = new VercelDeployer(config.VERCEL_TOKEN);
						await deployer.deleteProject(vercelProjectName);
						log.info({ docsiteId: id, projectName: vercelProjectName }, "Deleted Vercel project");
					} catch (error) {
						log.error(
							{ docsiteId: id, projectName: metadata.githubRepo, error },
							"Failed to delete Vercel project",
						);
					}
				}
			})().catch(error => {
				log.error({ docsiteId: id, error }, "Unexpected error during async site cleanup");
			});
		} catch (error) {
			log.error(error, "Failed to delete site");
			res.status(500).json({ error: "Failed to delete site" });
		}
	});
	/* c8 ignore stop */

	// Create folder in site repository
	/* c8 ignore start */
	router.post("/:id/folders", permissionMiddleware.requirePermission("sites.edit"), async (req, res) => {
		try {
			const id = Number.parseInt(req.params.id, 10);
			if (Number.isNaN(id)) {
				res.status(400).json({ error: "Invalid site ID" });
				return;
			}

			const siteDao = siteDaoProvider.getDao(getTenantContext());
			const { path: folderPath } = req.body;
			if (!folderPath || typeof folderPath !== "string") {
				res.status(400).json({ error: "path is required and must be a string" });
				return;
			}

			// Validate folder path doesn't contain dangerous patterns
			if (folderPath.includes("..") || folderPath.startsWith("/")) {
				res.status(400).json({ error: "Invalid folder path" });
				return;
			}

			const docsite = await siteDao.getSite(id);
			if (!docsite) {
				res.status(404).json({ error: "Site not found" });
				return;
			}

			const metadata = getSiteMetadata(docsite);
			if (!metadata?.githubRepo) {
				res.status(400).json({ error: "Site does not have a GitHub repository" });
				return;
			}

			const [owner, repo] = metadata.githubRepo.split("/");
			const octokit = createOctokit();
			const githubClient = createDocsiteGitHub(octokit);

			await githubClient.createFolder(owner, repo, folderPath);

			log.info({ siteId: id, folderPath }, "Created folder in repository");

			// Audit log
			const userId = req.orgUser?.id ?? tokenUtil.decodePayload(req)?.userId;
			auditLog({
				action: "update",
				resourceType: "site",
				resourceId: String(id),
				resourceName: docsite.displayName || docsite.name,
				actorId: typeof userId === "number" ? userId : null,
				changes: [],
				metadata: {
					operation: "create_folder",
					folderPath,
				},
			});

			res.json({ success: true, path: folderPath });
		} catch (error) {
			log.error(error, "Failed to create folder");
			res.status(500).json({ error: "Failed to create folder" });
		}
	});
	/* c8 ignore stop */

	// Delete folder from site repository
	/* c8 ignore start */
	router.delete("/:id/folders", permissionMiddleware.requirePermission("sites.edit"), async (req, res) => {
		try {
			const id = Number.parseInt(req.params.id, 10);
			if (Number.isNaN(id)) {
				res.status(400).json({ error: "Invalid site ID" });
				return;
			}

			const siteDao = siteDaoProvider.getDao(getTenantContext());

			// Get folder path from query parameter
			const folderPath = req.query.path as string | undefined;
			if (!folderPath) {
				res.status(400).json({ error: "path query parameter is required" });
				return;
			}

			// Validate folder path doesn't contain dangerous patterns
			if (folderPath.includes("..") || folderPath.startsWith("/")) {
				res.status(400).json({ error: "Invalid folder path" });
				return;
			}

			// Prevent deleting critical root folders
			const protectedFolders = ["content", "app", "pages", "public", "src", "node_modules", ".git"];
			if (protectedFolders.includes(folderPath) || protectedFolders.includes(folderPath.replace(/\/$/, ""))) {
				res.status(400).json({ error: "Cannot delete this protected folder" });
				return;
			}

			const docsite = await siteDao.getSite(id);
			if (!docsite) {
				res.status(404).json({ error: "Site not found" });
				return;
			}

			const metadata = getSiteMetadata(docsite);
			if (!metadata?.githubRepo) {
				res.status(400).json({ error: "Site does not have a GitHub repository" });
				return;
			}

			const [owner, repo] = metadata.githubRepo.split("/");
			const octokit = createOctokit();
			const githubClient = createDocsiteGitHub(octokit);

			await githubClient.deleteFolder(owner, repo, folderPath);

			log.info({ siteId: id, folderPath }, "Deleted folder from repository");

			// Audit log
			const userId = req.orgUser?.id ?? tokenUtil.decodePayload(req)?.userId;
			auditLog({
				action: "update",
				resourceType: "site",
				resourceId: String(id),
				resourceName: docsite.displayName || docsite.name,
				actorId: typeof userId === "number" ? userId : null,
				changes: [],
				metadata: {
					operation: "delete_folder",
					folderPath,
				},
			});

			res.json({ success: true });
		} catch (error) {
			log.error(error, "Failed to delete folder");
			res.status(500).json({ error: "Failed to delete folder" });
		}
	});
	/* c8 ignore stop */

	// Rename folder in site repository
	/* c8 ignore start */
	router.put("/:id/folders/rename", permissionMiddleware.requirePermission("sites.edit"), async (req, res) => {
		try {
			const id = Number.parseInt(req.params.id, 10);
			if (Number.isNaN(id)) {
				res.status(400).json({ error: "Invalid site ID" });
				return;
			}

			const siteDao = siteDaoProvider.getDao(getTenantContext());
			const { path: folderPath, newName } = req.body;
			if (!folderPath || typeof folderPath !== "string") {
				res.status(400).json({ error: "path is required and must be a string" });
				return;
			}

			if (!newName || typeof newName !== "string") {
				res.status(400).json({ error: "newName is required and must be a string" });
				return;
			}

			// Validate folder path doesn't contain dangerous patterns
			if (folderPath.includes("..") || folderPath.startsWith("/")) {
				res.status(400).json({ error: "Invalid folder path" });
				return;
			}

			// Prevent renaming critical root folders
			const protectedFolders = ["content", "app", "pages", "public", "src", "node_modules", ".git"];
			if (protectedFolders.includes(folderPath) || protectedFolders.includes(folderPath.replace(/\/$/, ""))) {
				res.status(400).json({ error: "Cannot rename this protected folder" });
				return;
			}

			// Validate new name doesn't contain path separators
			if (newName.includes("/") || newName.includes("\\")) {
				res.status(400).json({ error: "New name cannot contain path separators" });
				return;
			}

			const docsite = await siteDao.getSite(id);
			if (!docsite) {
				res.status(404).json({ error: "Site not found" });
				return;
			}

			const metadata = getSiteMetadata(docsite);
			if (!metadata?.githubRepo) {
				res.status(400).json({ error: "Site does not have a GitHub repository" });
				return;
			}

			const [owner, repo] = metadata.githubRepo.split("/");
			const octokit = createOctokit();
			const githubClient = createDocsiteGitHub(octokit);

			await githubClient.renameFolder(owner, repo, folderPath, newName);

			// Calculate new path
			const pathParts = folderPath.split("/");
			pathParts[pathParts.length - 1] = newName;
			const newPath = pathParts.join("/");

			log.info({ siteId: id, folderPath, newName, newPath }, "Renamed folder in repository");

			// Audit log
			const userId = req.orgUser?.id ?? tokenUtil.decodePayload(req)?.userId;
			auditLog({
				action: "update",
				resourceType: "site",
				resourceId: String(id),
				resourceName: docsite.displayName || docsite.name,
				actorId: typeof userId === "number" ? userId : null,
				changes: [],
				metadata: {
					operation: "rename_folder",
					oldPath: folderPath,
					newPath,
				},
			});

			res.json({ success: true, newPath });
		} catch (error) {
			log.error(error, "Failed to rename folder");
			res.status(500).json({ error: "Failed to rename folder" });
		}
	});
	/* c8 ignore stop */

	// Move file to different folder in site repository
	/* c8 ignore start */
	router.put("/:id/files/move", permissionMiddleware.requirePermission("sites.edit"), async (req, res) => {
		try {
			const id = Number.parseInt(req.params.id, 10);
			if (Number.isNaN(id)) {
				res.status(400).json({ error: "Invalid site ID" });
				return;
			}

			const siteDao = siteDaoProvider.getDao(getTenantContext());
			const { path: filePath, destination } = req.body;
			if (!filePath || typeof filePath !== "string") {
				res.status(400).json({ error: "path is required and must be a string" });
				return;
			}
			if (!destination || typeof destination !== "string") {
				res.status(400).json({ error: "destination is required and must be a string" });
				return;
			}

			// Validate file path is within content directory
			if (!filePath.startsWith("content/")) {
				res.status(400).json({ error: "File path must be within the content directory" });
				return;
			}

			// Validate destination is within content directory
			if (!destination.startsWith("content/") && destination !== "content") {
				res.status(400).json({ error: "Destination must be within the content directory" });
				return;
			}

			const docsite = await siteDao.getSite(id);
			if (!docsite) {
				res.status(404).json({ error: "Site not found" });
				return;
			}

			const metadata = getSiteMetadata(docsite);
			if (!metadata?.githubRepo) {
				res.status(400).json({ error: "Site does not have a GitHub repository" });
				return;
			}

			const [owner, repo] = metadata.githubRepo.split("/");
			const octokit = createOctokit();
			const githubClient = createDocsiteGitHub(octokit);

			// First move the file
			await githubClient.moveFile(owner, repo, filePath, destination);

			// Calculate new path
			const fileName = filePath.split("/").pop() || "";
			const newPath = `${destination}/${fileName}`;

			// Now sync the _meta.ts files
			// Extract slug from filename (remove .mdx extension)
			const slug = fileName.replace(/\.mdx$/, "");
			if (slug && fileName.endsWith(".mdx")) {
				await syncMetaFilesOnMove(octokit, owner, repo, filePath, destination, slug, githubClient);
			}

			log.info({ siteId: id, filePath, destination, newPath }, "Moved file in repository");

			// Audit log
			const userId = req.orgUser?.id ?? tokenUtil.decodePayload(req)?.userId;
			auditLog({
				action: "update",
				resourceType: "site",
				resourceId: String(id),
				resourceName: docsite.displayName || docsite.name,
				actorId: typeof userId === "number" ? userId : null,
				changes: [],
				metadata: {
					operation: "move_file",
					oldPath: filePath,
					newPath,
				},
			});

			res.json({ success: true, newPath });
		} catch (error) {
			log.error(error, "Failed to move file");
			res.status(500).json({ error: "Failed to move file" });
		}
	});
	/* c8 ignore stop */

	// List folder contents in site repository
	/* c8 ignore start */
	router.get("/:id/folders/contents", permissionMiddleware.requirePermission("sites.view"), async (req, res) => {
		try {
			const id = Number.parseInt(req.params.id, 10);
			if (Number.isNaN(id)) {
				res.status(400).json({ error: "Invalid site ID" });
				return;
			}

			const siteDao = siteDaoProvider.getDao(getTenantContext());

			// Get folder path from query parameter
			const folderPath = req.query.path as string | undefined;
			if (!folderPath) {
				res.status(400).json({ error: "path query parameter is required" });
				return;
			}

			const docsite = await siteDao.getSite(id);
			if (!docsite) {
				res.status(404).json({ error: "Site not found" });
				return;
			}

			const metadata = getSiteMetadata(docsite);
			if (!metadata?.githubRepo) {
				res.status(400).json({ error: "Site does not have a GitHub repository" });
				return;
			}

			const [owner, repo] = metadata.githubRepo.split("/");
			const octokit = createOctokit();
			const githubClient = createDocsiteGitHub(octokit);

			const contents = await githubClient.listFolderContents(owner, repo, folderPath);

			res.json({ files: contents });
		} catch (error) {
			log.error(error, "Failed to list folder contents");
			res.status(500).json({ error: "Failed to list folder contents" });
		}
	});
	/* c8 ignore stop */

	// GitHub Repository Viewer Proxy Endpoints
	// These endpoints proxy GitHub API requests to allow viewing private repositories.
	// Authorization: Uses tenant-level isolation via getTenantContext() - all users within
	// an org can view all sites in that org (consistent with other site endpoints).
	// Rate limiting: These endpoints proxy to GitHub API which has its own rate limits.
	// Consider adding application-level rate limiting if abuse becomes an issue.
	// ============================================================================

	/**
	 * GET /sites/:id/github/tree
	 * Get the full file tree for a site's GitHub repository.
	 * This proxies the GitHub API request using the server's GITHUB_TOKEN,
	 * allowing the frontend to access private repositories.
	 */
	router.get("/:id/github/tree", permissionMiddleware.requirePermission("sites.view"), async (req, res) => {
		const id = Number.parseInt(req.params.id, 10);
		if (Number.isNaN(id)) {
			res.status(400).json({ error: "Invalid site ID" });
			return;
		}

		try {
			const siteDao = siteDaoProvider.getDao(getTenantContext());
			const docsite = await siteDao.getSite(id);
			if (!docsite) {
				res.status(404).json({ error: "Site not found" });
				return;
			}

			const metadata = getSiteMetadata(docsite);
			if (!metadata?.githubRepo) {
				res.status(400).json({ error: "Site does not have a GitHub repository" });
				return;
			}

			const branch = (req.query.branch as string) || "main";
			const [owner, repo] = metadata.githubRepo.split("/");
			const octokit = createOctokit();

			const response = await octokit.rest.git.getTree({
				owner,
				repo,
				tree_sha: branch,
				recursive: "1",
			});

			res.json(response.data);
		} catch (error) {
			log.error({ siteId: id, error }, "Failed to get repository tree");
			res.status(500).json({ error: "Failed to get repository tree" });
		}
	});

	/**
	 * GET /sites/:id/github/content
	 * Get the content of a file in a site's GitHub repository.
	 * This proxies the GitHub API request using the server's GITHUB_TOKEN,
	 * allowing the frontend to access private repositories.
	 */
	router.get("/:id/github/content", permissionMiddleware.requirePermission("sites.view"), async (req, res) => {
		const id = Number.parseInt(req.params.id, 10);
		if (Number.isNaN(id)) {
			res.status(400).json({ error: "Invalid site ID" });
			return;
		}

		const filePath = req.query.path as string | undefined;
		if (!filePath) {
			res.status(400).json({ error: "path query parameter is required" });
			return;
		}

		if (filePath.includes("..") || filePath.startsWith("/")) {
			res.status(400).json({ error: "Invalid file path" });
			return;
		}

		try {
			const siteDao = siteDaoProvider.getDao(getTenantContext());
			const docsite = await siteDao.getSite(id);
			if (!docsite) {
				res.status(404).json({ error: "Site not found" });
				return;
			}

			const metadata = getSiteMetadata(docsite);
			if (!metadata?.githubRepo) {
				res.status(400).json({ error: "Site does not have a GitHub repository" });
				return;
			}

			const branch = (req.query.branch as string) || "main";
			const [owner, repo] = metadata.githubRepo.split("/");
			const octokit = createOctokit();

			const response = await octokit.rest.repos.getContent({
				owner,
				repo,
				path: filePath,
				ref: branch,
			});

			res.json(response.data);
		} catch (error) {
			log.error({ siteId: id, filePath, error }, "Failed to get file content");
			res.status(500).json({ error: "Failed to get file content" });
		}
	});

	// Custom Domain Management Endpoints
	// ============================================================================

	/**
	 * Helper to get Vercel project name from site metadata.
	 */
	function getVercelProjectName(site: Site): string | null {
		const metadata = getSiteMetadata(site);
		if (!metadata?.githubRepo) {
			return null;
		}
		const [, projectName] = metadata.githubRepo.split("/");
		return projectName;
	}

	/**
	 * POST /sites/:id/domains
	 * Add a custom domain to a site.
	 */
	router.post("/:id/domains", permissionMiddleware.requirePermission("sites.edit"), async (req, res) => {
		try {
			const siteDao = siteDaoProvider.getDao(getTenantContext());
			const id = Number.parseInt(req.params.id, 10);
			if (Number.isNaN(id)) {
				res.status(400).json({ error: "Invalid site ID" });
				return;
			}

			const { domain } = req.body;
			if (!domain || typeof domain !== "string") {
				res.status(400).json({ error: "domain is required" });
				return;
			}

			// Validate domain format
			const validation = validateCustomDomain(domain);
			if (!validation.valid) {
				res.status(400).json({ error: validation.error });
				return;
			}

			// Get site (fail fast if site doesn't exist)
			const site = await siteDao.getSite(id);
			if (!site) {
				res.status(404).json({ error: "Site not found" });
				return;
			}

			// Check if domain is already in use by another site (per-tenant uniqueness)
			const existingSite = await siteDao.getSiteByCustomDomain(domain);
			if (existingSite && existingSite.id !== id) {
				res.status(409).json({ error: "Custom domain already in use by another site" });
				return;
			}

			const metadata = getMetadataForUpdate(site);

			// Check limit (1 custom domain per site)
			if (metadata.customDomains && metadata.customDomains.length >= 1) {
				res.status(400).json({ error: "Site already has a custom domain. Remove it first." });
				return;
			}

			// Get Vercel deployer
			const config = getConfig();
			const vercelToken = config.VERCEL_TOKEN;
			if (!vercelToken) {
				res.status(500).json({ error: "Vercel integration not configured" });
				return;
			}

			const projectName = getVercelProjectName(site);
			if (!projectName) {
				res.status(400).json({ error: "Site has no Vercel project configured" });
				return;
			}

			const vercelDeployer = new VercelDeployer(vercelToken);

			// Add to Vercel FIRST (can fail)
			const result = await vercelDeployer.addDomainToProject(projectName, domain.toLowerCase());

			if (result.error) {
				res.status(400).json({ error: result.error });
				return;
			}

			// Check if DNS is actually configured to point to Vercel
			const dnsCheck = await checkDnsConfiguration(domain.toLowerCase());

			// Status is "verified" only if DNS is configured AND Vercel is happy
			// If DNS is not configured, always show as "pending" so user sees setup instructions
			const isFullyVerified = dnsCheck.configured && result.verified;

			const now = new Date().toISOString();
			const domainInfo: CustomDomainInfo = {
				domain: domain.toLowerCase(),
				status: isFullyVerified ? "verified" : "pending",
				addedAt: now,
				lastCheckedAt: now,
				...(isFullyVerified && { verifiedAt: now }),
				...(result.verification && { verification: result.verification }),
			};

			const updatedMetadata: SiteMetadata = {
				...metadata,
				customDomains: [domainInfo],
			};

			const updatedSite = await siteDao.updateSite({
				...site,
				metadata: updatedMetadata,
			});

			// Audit log
			const userId = req.orgUser?.id ?? tokenUtil.decodePayload(req)?.userId;
			auditLog({
				action: "update",
				resourceType: "site",
				resourceId: String(id),
				resourceName: site.displayName || site.name,
				actorId: typeof userId === "number" ? userId : null,
				changes: computeAuditChanges(
					site as unknown as Record<string, unknown>,
					updatedSite as unknown as Record<string, unknown>,
					"site",
				),
				metadata: {
					operation: "add_custom_domain",
					domain: domain.toLowerCase(),
					verified: isFullyVerified,
				},
			});

			log.info({ siteId: id, domain: domain.toLowerCase(), verified: result.verified }, "Added custom domain");
			res.status(201).json({ domain: domainInfo });
		} catch (error) {
			log.error(error, "Failed to add custom domain");
			res.status(500).json({ error: "Failed to add domain" });
		}
	});

	/**
	 * DELETE /sites/:id/domains/:domain
	 * Remove a custom domain from a site.
	 */
	router.delete("/:id/domains/:domain", permissionMiddleware.requirePermission("sites.edit"), async (req, res) => {
		try {
			const siteDao = siteDaoProvider.getDao(getTenantContext());
			const id = Number.parseInt(req.params.id, 10);
			if (Number.isNaN(id)) {
				res.status(400).json({ error: "Invalid site ID" });
				return;
			}

			const { domain } = req.params;

			// Get site
			const site = await siteDao.getSite(id);
			if (!site) {
				res.status(404).json({ error: "Site not found" });
				return;
			}

			const metadata = getMetadataForUpdate(site);

			// Check if domain exists on site
			if (!metadata.customDomains?.some(d => d.domain === domain.toLowerCase())) {
				res.status(404).json({ error: "Domain not found on this site" });
				return;
			}

			// Remove from Vercel
			const config = getConfig();
			const vercelToken = config.VERCEL_TOKEN;
			if (vercelToken) {
				const projectName = getVercelProjectName(site);
				if (projectName) {
					const vercelDeployer = new VercelDeployer(vercelToken);
					await vercelDeployer.removeDomainFromProject(projectName, domain);
				}
			}

			// Update database
			const updatedMetadata: SiteMetadata = {
				...metadata,
				customDomains: metadata.customDomains?.filter(d => d.domain !== domain.toLowerCase()),
			};

			const updatedSite = await siteDao.updateSite({
				...site,
				metadata: updatedMetadata,
			});

			// Audit log
			const userId = req.orgUser?.id ?? tokenUtil.decodePayload(req)?.userId;
			auditLog({
				action: "update",
				resourceType: "site",
				resourceId: String(id),
				resourceName: site.displayName || site.name,
				actorId: typeof userId === "number" ? userId : null,
				changes: computeAuditChanges(
					site as unknown as Record<string, unknown>,
					updatedSite as unknown as Record<string, unknown>,
					"site",
				),
				metadata: {
					operation: "remove_custom_domain",
					domain: domain.toLowerCase(),
				},
			});

			log.info({ siteId: id, domain }, "Removed custom domain");
			res.status(204).send();
		} catch (error) {
			log.error(error, "Failed to remove custom domain");
			res.status(500).json({ error: "Failed to remove domain" });
		}
	});

	/**
	 * GET /sites/:id/domains/:domain/status
	 * Check verification status of a custom domain.
	 */
	router.get(
		"/:id/domains/:domain/status",
		permissionMiddleware.requirePermission("sites.view"),
		async (req, res) => {
			try {
				const siteDao = siteDaoProvider.getDao(getTenantContext());
				const id = Number.parseInt(req.params.id, 10);
				if (Number.isNaN(id)) {
					res.status(400).json({ error: "Invalid site ID" });
					return;
				}

				const { domain } = req.params;

				const site = await siteDao.getSite(id);
				if (!site) {
					res.status(404).json({ error: "Site not found" });
					return;
				}

				const metadata = getMetadataForUpdate(site);
				const domainInfo = metadata.customDomains?.find(d => d.domain === domain.toLowerCase());

				if (!domainInfo) {
					res.status(404).json({ error: "Domain not found on this site" });
					return;
				}

				// Get fresh status from Vercel
				const config = getConfig();
				const vercelToken = config.VERCEL_TOKEN;
				if (!vercelToken) {
					res.json({ domain: domainInfo });
					return;
				}

				const projectName = getVercelProjectName(site);
				if (!projectName) {
					res.json({ domain: domainInfo });
					return;
				}

				const vercelDeployer = new VercelDeployer(vercelToken);

				try {
					const status = await vercelDeployer.getDomainStatus(projectName, domain);

					// Check if DNS is actually configured to point to Vercel
					const dnsCheck = await checkDnsConfiguration(domain.toLowerCase());

					// Status is "verified" only if DNS is configured AND Vercel is happy
					const isFullyVerified = dnsCheck.configured && status.verified;

					const now = new Date().toISOString();

					if (isFullyVerified && domainInfo.status !== "verified") {
						const updatedDomain: CustomDomainInfo = {
							domain: domainInfo.domain,
							status: "verified",
							addedAt: domainInfo.addedAt,
							verifiedAt: now,
							lastCheckedAt: now,
						};

						const updatedMetadata: SiteMetadata = {
							...metadata,
							customDomains: [updatedDomain],
						};

						await siteDao.updateSite({ ...site, metadata: updatedMetadata });
						res.json({ domain: updatedDomain });
						return;
					}

					// If not fully verified, ensure we return pending status with verification info
					if (!isFullyVerified && domainInfo.status === "verified") {
						// Domain was verified but DNS is no longer configured - update to pending
						const updatedDomain: CustomDomainInfo = {
							domain: domainInfo.domain,
							status: "pending",
							addedAt: domainInfo.addedAt,
							lastCheckedAt: now,
							...(status.verification && { verification: status.verification }),
						};

						const updatedMetadata: SiteMetadata = {
							...metadata,
							customDomains: [updatedDomain],
						};

						await siteDao.updateSite({ ...site, metadata: updatedMetadata });
						res.json({ domain: updatedDomain });
						return;
					}

					res.json({ domain: domainInfo, verification: status.verification });
				} catch (vercelError) {
					log.warn(vercelError, "Failed to get domain status from Vercel, returning cached status");
					res.json({ domain: domainInfo });
				}
			} catch (error) {
				log.error(error, "Failed to check domain status");
				res.status(500).json({ error: "Failed to check status" });
			}
		},
	);

	/**
	 * POST /sites/:id/domains/:domain/verify
	 * Trigger verification check for a custom domain.
	 */
	router.post(
		"/:id/domains/:domain/verify",
		permissionMiddleware.requirePermission("sites.edit"),
		async (req, res) => {
			try {
				const siteDao = siteDaoProvider.getDao(getTenantContext());
				const id = Number.parseInt(req.params.id, 10);
				if (Number.isNaN(id)) {
					res.status(400).json({ error: "Invalid site ID" });
					return;
				}

				const { domain } = req.params;

				const site = await siteDao.getSite(id);
				if (!site) {
					res.status(404).json({ error: "Site not found" });
					return;
				}

				const metadata = getMetadataForUpdate(site);
				const domainInfo = metadata.customDomains?.find(d => d.domain === domain.toLowerCase());

				if (!domainInfo) {
					res.status(404).json({ error: "Domain not found on this site" });
					return;
				}

				const config = getConfig();
				const vercelToken = config.VERCEL_TOKEN;
				if (!vercelToken) {
					res.status(500).json({ error: "Vercel integration not configured" });
					return;
				}

				const projectName = getVercelProjectName(site);
				if (!projectName) {
					res.status(400).json({ error: "Site has no Vercel project configured" });
					return;
				}

				const vercelDeployer = new VercelDeployer(vercelToken);
				const status = await vercelDeployer.verifyDomain(projectName, domain);

				// Check if DNS is actually configured to point to Vercel
				const dnsCheck = await checkDnsConfiguration(domain.toLowerCase());

				// Status is "verified" only if DNS is configured AND Vercel is happy
				const isFullyVerified = dnsCheck.configured && status.verified;

				const now = new Date().toISOString();
				const updatedDomain: CustomDomainInfo = {
					domain: domainInfo.domain,
					status: isFullyVerified ? "verified" : "pending",
					addedAt: domainInfo.addedAt,
					lastCheckedAt: now,
					...(isFullyVerified && { verifiedAt: now }),
					...(!isFullyVerified && domainInfo.verifiedAt && { verifiedAt: domainInfo.verifiedAt }),
					...(status.verification && { verification: status.verification }),
				};

				const updatedMetadata: SiteMetadata = {
					...metadata,
					customDomains: [updatedDomain],
				};

				const updatedSite = await siteDao.updateSite({ ...site, metadata: updatedMetadata });

				// Audit log
				const userId = req.orgUser?.id ?? tokenUtil.decodePayload(req)?.userId;
				auditLog({
					action: "update",
					resourceType: "site",
					resourceId: String(id),
					resourceName: site.displayName || site.name,
					actorId: typeof userId === "number" ? userId : null,
					changes: computeAuditChanges(
						site as unknown as Record<string, unknown>,
						updatedSite as unknown as Record<string, unknown>,
						"site",
					),
					metadata: {
						operation: "verify_custom_domain",
						domain: domain.toLowerCase(),
						verified: isFullyVerified,
					},
				});

				log.info({ siteId: id, domain, verified: status.verified }, "Verified custom domain");
				res.json({ domain: updatedDomain });
			} catch (error) {
				log.error(error, "Failed to verify domain");
				res.status(500).json({ error: "Failed to verify domain" });
			}
		},
	);

	/**
	 * Process a single domain refresh and return updated domain info
	 * @internal Helper for domain refresh endpoint
	 */
	async function processSingleDomainRefresh(
		vercelDeployer: VercelDeployer,
		projectName: string,
		domainInfo: CustomDomainInfo,
	): Promise<CustomDomainInfo> {
		const now = new Date().toISOString();

		try {
			const status = await vercelDeployer.getDomainStatus(projectName, domainInfo.domain);

			// Check if DNS is actually configured to point to Vercel
			const dnsCheck = await checkDnsConfiguration(domainInfo.domain);

			// Status is "verified" only if DNS is configured AND Vercel is happy
			const isFullyVerified = dnsCheck.configured && status.verified;

			return {
				domain: domainInfo.domain,
				status: isFullyVerified ? "verified" : "pending",
				addedAt: domainInfo.addedAt,
				lastCheckedAt: now,
				...(isFullyVerified && { verifiedAt: domainInfo.verifiedAt || now }),
				...(!isFullyVerified && domainInfo.verifiedAt && { verifiedAt: domainInfo.verifiedAt }),
				...(status.verification && { verification: status.verification }),
			};
		} catch (vercelError) {
			const errorMessage = vercelError instanceof Error ? vercelError.message : "Unknown error";
			log.warn({ domain: domainInfo.domain, error: errorMessage }, "Failed to refresh domain status");

			return {
				domain: domainInfo.domain,
				status: "failed",
				addedAt: domainInfo.addedAt,
				lastCheckedAt: now,
				verificationError: errorMessage,
				...(domainInfo.verifiedAt && { verifiedAt: domainInfo.verifiedAt }),
			};
		}
	}

	/**
	 * POST /sites/:id/domains/refresh
	 * Refresh verification status of all custom domains on a site.
	 */
	router.post("/:id/domains/refresh", permissionMiddleware.requirePermission("sites.edit"), async (req, res) => {
		try {
			const siteDao = siteDaoProvider.getDao(getTenantContext());
			const id = Number.parseInt(req.params.id, 10);
			if (Number.isNaN(id)) {
				res.status(400).json({ error: "Invalid site ID" });
				return;
			}

			const site = await siteDao.getSite(id);
			if (!site) {
				res.status(404).json({ error: "Site not found" });
				return;
			}

			const metadata = getMetadataForUpdate(site);
			const customDomains = metadata.customDomains || [];

			if (customDomains.length === 0) {
				res.json({ domains: [] });
				return;
			}

			const config = getConfig();
			const vercelToken = config.VERCEL_TOKEN;
			if (!vercelToken) {
				res.status(500).json({ error: "Vercel integration not configured" });
				return;
			}

			const projectName = getVercelProjectName(site);
			if (!projectName) {
				res.status(400).json({ error: "Site has no Vercel project configured" });
				return;
			}

			const vercelDeployer = new VercelDeployer(vercelToken);
			const updatedDomains: Array<CustomDomainInfo> = [];

			for (const domainInfo of customDomains) {
				const updatedDomain = await processSingleDomainRefresh(vercelDeployer, projectName, domainInfo);
				updatedDomains.push(updatedDomain);
			}

			const updatedMetadata: SiteMetadata = {
				...metadata,
				customDomains: updatedDomains,
			};

			const updatedSite = await siteDao.updateSite({ ...site, metadata: updatedMetadata });

			// Audit log
			const userId = req.orgUser?.id ?? tokenUtil.decodePayload(req)?.userId;
			auditLog({
				action: "update",
				resourceType: "site",
				resourceId: String(id),
				resourceName: site.displayName || site.name,
				actorId: typeof userId === "number" ? userId : null,
				changes: computeAuditChanges(
					site as unknown as Record<string, unknown>,
					updatedSite as unknown as Record<string, unknown>,
					"site",
				),
				metadata: {
					operation: "refresh_custom_domains",
					domainCount: updatedDomains.length,
				},
			});

			log.info({ siteId: id, domainCount: updatedDomains.length }, "Refreshed all custom domain statuses");
			res.json({ domains: updatedDomains });
		} catch (error) {
			log.error(error, "Failed to refresh domain statuses");
			res.status(500).json({ error: "Failed to refresh domain statuses" });
		}
	});

	/**
	 * POST /sites/:id/auth/keys
	 * Generate ES256 key pair for site-specific JWT signing.
	 * Idempotent: returns existing public key if keys already exist.
	 *
	 * Response:
	 * - publicKey: The public key in PEM format (for doc site to verify JWTs)
	 */
	router.post("/:id/auth/keys", permissionMiddleware.requirePermission("sites.edit"), async (req, res) => {
		try {
			const siteDao = siteDaoProvider.getDao(getTenantContext());
			const id = Number.parseInt(req.params.id, 10);
			if (Number.isNaN(id)) {
				res.status(400).json({ error: "Invalid site ID" });
				return;
			}

			const site = await siteDao.getSite(id);
			if (!site) {
				res.status(404).json({ error: "Site not found" });
				return;
			}

			const metadata = getMetadataForUpdate(site);

			// If keys already exist, return existing public key (idempotent).
			// Note: This endpoint intentionally returns the public key — it is not
			// sensitive and clients need it for JWT verification. stripSiteSecrets
			// is not used here because this returns only { publicKey }, not a site object.
			if (metadata.jwtAuth?.publicKey && metadata.jwtAuth?.privateKey) {
				res.json({ publicKey: metadata.jwtAuth.publicKey });
				return;
			}

			// Generate ES256 key pair
			const { generateKeyPairSync } = await import("node:crypto");
			const { publicKey, privateKey } = generateKeyPairSync("ec", {
				namedCurve: "prime256v1",
				publicKeyEncoding: { type: "spki", format: "pem" },
				privateKeyEncoding: { type: "pkcs8", format: "pem" },
			});

			// Update site metadata with keys
			const updatedMetadata: SiteMetadata = {
				...metadata,
				jwtAuth: {
					...metadata.jwtAuth,
					enabled: metadata.jwtAuth?.enabled ?? false,
					mode: metadata.jwtAuth?.mode ?? "full",
					loginUrl: metadata.jwtAuth?.loginUrl ?? "",
					publicKey,
					privateKey,
				},
			};

			const updatedSite = await siteDao.updateSite({ ...site, metadata: updatedMetadata });

			// Audit log
			const userId = req.orgUser?.id ?? tokenUtil.decodePayload(req)?.userId;
			auditLog({
				action: "update",
				resourceType: "site",
				resourceId: String(id),
				resourceName: site.displayName || site.name,
				actorId: typeof userId === "number" ? userId : null,
				changes: computeAuditChanges(
					site as unknown as Record<string, unknown>,
					updatedSite as unknown as Record<string, unknown>,
					"site",
				),
				metadata: {
					operation: "generate_auth_keys",
				},
			});

			log.info({ siteId: id }, "Generated site auth keys");
			res.json({ publicKey });
		} catch (error) {
			log.error(error, "Failed to generate site auth keys");
			res.status(500).json({ error: "Failed to generate site auth keys" });
		}
	});

	/**
	 * PUT /sites/:id/auth/config
	 * Update JWT auth configuration for a site.
	 * If enabling for the first time (no keys), generates ES256 keys automatically.
	 *
	 * Request body:
	 * - enabled: boolean - Whether to enable JWT auth
	 * - mode: "full" | "partial" - Auth mode (required if enabled is true)
	 * - loginUrl: string (optional) - Custom login URL (defaults to Jolli endpoint)
	 *
	 * Response: Updated Site object
	 */
	router.put("/:id/auth/config", permissionMiddleware.requirePermission("sites.edit"), async (req, res) => {
		try {
			const siteDao = siteDaoProvider.getDao(getTenantContext());
			const id = Number.parseInt(req.params.id, 10);
			if (Number.isNaN(id)) {
				res.status(400).json({ error: "Invalid site ID" });
				return;
			}

			const site = await siteDao.getSite(id);
			if (!site) {
				res.status(404).json({ error: "Site not found" });
				return;
			}

			const { enabled, mode, loginUrl: customLoginUrl } = req.body;

			// Validate enabled is a boolean
			if (typeof enabled !== "boolean") {
				res.status(400).json({ error: "enabled must be a boolean" });
				return;
			}

			// Validate mode if enabled
			if (enabled && mode !== "full" && mode !== "partial") {
				res.status(400).json({ error: "mode must be 'full' or 'partial' when enabled" });
				return;
			}

			/* v8 ignore next */
			const metadata = getMetadataForUpdate(site);
			/* v8 ignore next */
			let { publicKey, privateKey } = metadata.jwtAuth || {};

			// Generate keys if enabling and no keys exist
			if (enabled && (!publicKey || !privateKey)) {
				const { generateKeyPairSync } = await import("node:crypto");
				const keyPair = generateKeyPairSync("ec", {
					namedCurve: "prime256v1",
					publicKeyEncoding: { type: "spki", format: "pem" },
					privateKeyEncoding: { type: "pkcs8", format: "pem" },
				});
				publicKey = keyPair.publicKey;
				privateKey = keyPair.privateKey;
				log.info({ siteId: id }, "Generated JWT auth keys for site");
			}

			// Compute default login URL if not provided
			const config = getConfig();
			const defaultLoginUrl = `${config.ORIGIN}/api/sites/${id}/auth/jwt`;
			const loginUrl = customLoginUrl || defaultLoginUrl;

			// Update site metadata with JWT auth config
			const jwtAuthConfig: SiteMetadata["jwtAuth"] = {
				enabled,
				/* v8 ignore next */
				mode: mode || metadata.jwtAuth?.mode || "full",
				loginUrl,
				/* v8 ignore next */
				publicKey: publicKey || "",
				/* v8 ignore next */
				privateKey: privateKey || "",
			};
			const updatedMetadata: SiteMetadata = {
				...metadata,
				jwtAuth: jwtAuthConfig,
			};

			const updatedSite = await siteDao.updateSite({ ...site, metadata: updatedMetadata });

			// Audit log
			/* v8 ignore next */
			const userId = req.orgUser?.id ?? tokenUtil.decodePayload(req)?.userId;
			auditLog({
				action: "update",
				resourceType: "site",
				resourceId: String(id),
				/* v8 ignore next */
				resourceName: site.displayName || site.name,
				/* v8 ignore next */
				actorId: typeof userId === "number" ? userId : null,
				changes: computeAuditChanges(
					site as unknown as Record<string, unknown>,
					updatedSite as unknown as Record<string, unknown>,
					"site",
				),
				metadata: {
					operation: "update_auth_config",
					enabled,
					/* v8 ignore next */
					mode: mode || metadata.jwtAuth?.mode || "full",
				},
			});

			// Sync JWT auth config to Vercel environment variables
			// This allows the middleware to read config at runtime without rebuilding
			const vercelToken = config.VERCEL_TOKEN;
			const projectName = getVercelProjectName(site);
			if (vercelToken && projectName && publicKey) {
				try {
					const deployer = new VercelDeployer(vercelToken);
					/* v8 ignore next */
					await deployer.syncJwtAuthEnvVars(projectName, enabled, mode || "full", publicKey, loginUrl);
					log.info({ siteId: id, projectName }, "Synced JWT auth config to Vercel env vars");
				} catch (syncError) {
					// Log but don't fail - database update succeeded
					log.warn(
						{ siteId: id, projectName, error: syncError },
						"Failed to sync JWT auth config to Vercel env vars",
					);
				}
			}

			log.info({ siteId: id, enabled, mode }, "Updated JWT auth config");
			res.json(stripSiteSecrets(updatedSite));
		} catch (error) {
			log.error(error, "Failed to update JWT auth config");
			res.status(500).json({ error: "Failed to update JWT auth config" });
		}
	});

	/**
	 * PUT /sites/:id/branding
	 * Update branding configuration for a site.
	 *
	 * Request body: SiteBranding object with branding properties
	 *
	 * Response: Updated Site object
	 */
	router.put("/:id/branding", permissionMiddleware.requirePermission("sites.edit"), async (req, res) => {
		try {
			const siteDao = siteDaoProvider.getDao(getTenantContext());
			const id = Number.parseInt(req.params.id, 10);
			if (Number.isNaN(id)) {
				res.status(400).json({ error: "Invalid site ID" });
				return;
			}

			const site = await siteDao.getSite(id);
			if (!site) {
				res.status(404).json({ error: "Site not found" });
				return;
			}

			// Validate branding input
			const validation = validateSiteBranding(req.body);
			if (!validation.isValid) {
				log.warn({ siteId: id, errors: validation.errors }, "Invalid branding data");
				res.status(400).json({ error: "Invalid branding data", details: validation.errors });
				return;
			}

			const branding = req.body as SiteBranding;

			// Update site metadata with branding config
			/* v8 ignore next */
			const metadata = getMetadataForUpdate(site);
			const updatedMetadata: SiteMetadata = {
				...metadata,
				branding,
			};

			const updatedSite = await siteDao.updateSite({ ...site, metadata: updatedMetadata });

			// Audit log
			/* v8 ignore next */
			const userId = req.orgUser?.id ?? tokenUtil.decodePayload(req)?.userId;
			auditLog({
				action: "update",
				resourceType: "site",
				resourceId: String(id),
				/* v8 ignore next */
				resourceName: site.displayName || site.name,
				/* v8 ignore next */
				actorId: typeof userId === "number" ? userId : null,
				changes: computeAuditChanges(
					site as unknown as Record<string, unknown>,
					updatedSite as unknown as Record<string, unknown>,
					"site",
				),
				metadata: {
					operation: "update_branding",
				},
			});

			log.info({ siteId: id }, "Updated site branding");
			res.json(stripSiteSecrets(updatedSite));
		} catch (error) {
			const siteId = Number.parseInt(req.params.id, 10);
			log.error(
				{ err: error, siteId: Number.isNaN(siteId) ? req.params.id : siteId },
				"Failed to update site branding",
			);
			res.status(500).json({ error: "Failed to update site branding" });
		}
	});

	/**
	 * PUT /api/sites/:id/folder-structure
	 * Updates whether the site uses space folder structure for navigation.
	 * When enabled, site navigation mirrors the space folder structure instead of being manually editable.
	 */
	router.put("/:id/folder-structure", permissionMiddleware.requirePermission("sites.edit"), async (req, res) => {
		try {
			const siteDao = siteDaoProvider.getDao(getTenantContext());
			const id = Number.parseInt(req.params.id, 10);
			if (Number.isNaN(id)) {
				res.status(400).json({ error: "Invalid site ID" });
				return;
			}

			const site = await siteDao.getSite(id);
			if (!site) {
				res.status(404).json({ error: "Site not found" });
				return;
			}

			const { useSpaceFolderStructure } = req.body as { useSpaceFolderStructure: boolean };
			if (typeof useSpaceFolderStructure !== "boolean") {
				res.status(400).json({ error: "useSpaceFolderStructure must be a boolean" });
				return;
			}

			/* v8 ignore next */
			const metadata = getMetadataForUpdate(site);
			const updatedMetadata: SiteMetadata = {
				...metadata,
				useSpaceFolderStructure,
			};

			const updatedSite = await siteDao.updateSite({ ...site, metadata: updatedMetadata });
			log.info({ siteId: id, useSpaceFolderStructure }, "Updated site folder structure setting");

			// Audit log
			/* v8 ignore next */
			const userId = req.orgUser?.id ?? tokenUtil.decodePayload(req)?.userId;
			auditLog({
				action: "update",
				resourceType: "site",
				resourceId: String(id),
				/* v8 ignore next */
				resourceName: site.displayName || site.name,
				/* v8 ignore next */
				actorId: typeof userId === "number" ? userId : null,
				changes: computeAuditChanges(
					site as unknown as Record<string, unknown>,
					updatedSite as unknown as Record<string, unknown>,
					"site",
				),
				metadata: {
					operation: "update_folder_structure",
				},
			});

			res.json(stripSiteSecrets(updatedSite));
		} catch (error) {
			const siteId = Number.parseInt(req.params.id, 10);
			log.error(
				{ err: error, siteId: Number.isNaN(siteId) ? req.params.id : siteId },
				"Failed to update folder structure setting",
			);
			res.status(500).json({ error: "Failed to update folder structure setting" });
		}
	});

	/**
	 * POST /api/sites/:id/repository/sync
	 * Syncs the entire file tree to GitHub in a single atomic commit.
	 * Replaces the old batch operations approach with a simpler tree-based sync.
	 */
	/* c8 ignore start */
	router.post("/:id/repository/sync", permissionMiddleware.requirePermission("sites.edit"), async (req, res) => {
		try {
			const siteDao = siteDaoProvider.getDao(getTenantContext());
			const id = Number.parseInt(req.params.id, 10);
			if (Number.isNaN(id)) {
				res.status(400).json({ error: "Invalid site ID" });
				return;
			}

			const { tree, commitMessage } = req.body as {
				tree: Array<FileTreeNode>;
				commitMessage?: string;
			};

			if (!tree || !Array.isArray(tree)) {
				res.status(400).json({ error: "tree array is required" });
				return;
			}

			// Validate tree paths don't contain traversal sequences
			if (hasTreePathTraversal(tree)) {
				res.status(400).json({ error: "Invalid file path in tree" });
				return;
			}

			const docsite = await siteDao.getSite(id);
			if (!docsite) {
				res.status(404).json({ error: "Site not found" });
				return;
			}

			const metadata = getSiteMetadata(docsite);
			if (!metadata?.githubRepo) {
				res.status(400).json({ error: "Site does not have a GitHub repository" });
				return;
			}

			const [owner, repo] = metadata.githubRepo.split("/");
			const octokit = createOctokit();
			const githubClient = createDocsiteGitHub(octokit);

			// Count files in tree for logging
			function countFiles(nodes: Array<FileTreeNode>): number {
				let count = 0;
				for (const node of nodes) {
					if (node.type === "file") {
						count++;
					}
					if (node.children) {
						count += countFiles(node.children);
					}
				}
				return count;
			}
			const fileCount = countFiles(tree);

			// Build commit message
			const message =
				commitMessage ||
				`Update repository via Jolli

${fileCount} file(s) synced`;

			// Sync tree to GitHub
			const newCommitSha = await githubClient.syncTreeToGitHub(owner, repo, tree, message);

			log.info({ siteId: id, fileCount, commitSha: newCommitSha }, "Synced repository tree");

			// Audit log
			const userId = req.orgUser?.id ?? tokenUtil.decodePayload(req)?.userId;
			auditLog({
				action: "update",
				resourceType: "site",
				resourceId: String(id),
				resourceName: docsite.displayName || docsite.name,
				actorId: typeof userId === "number" ? userId : null,
				changes: [],
				metadata: {
					operation: "sync_repository_tree",
					fileCount,
				},
			});

			res.json({ success: true, commitSha: newCommitSha });
		} catch (error) {
			log.error(error, "Failed to sync repository tree");
			res.status(500).json({ error: "Failed to sync repository tree" });
		}
	});
	/* c8 ignore stop */

	return router;
}

/**
 * Synchronize _meta.ts files when a file is moved between folders.
 * Removes the entry from source folder's _meta.ts and adds it to destination folder's _meta.ts.
 * This is a best-effort operation - if it fails, the file move has already completed.
 *
 * @param octokit - Octokit instance
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param sourcePath - Original file path (e.g., "content/intro.mdx")
 * @param destination - Destination folder path (e.g., "content/guides")
 * @param slug - File slug without extension (e.g., "intro")
 * @param githubClient - DocsiteGitHub client for file operations
 */
/* c8 ignore start */
async function syncMetaFilesOnMove(
	octokit: ReturnType<typeof createOctokit>,
	owner: string,
	repo: string,
	sourcePath: string,
	destination: string,
	slug: string,
	githubClient: ReturnType<typeof createDocsiteGitHub>,
): Promise<void> {
	const merger = new MetaMerger();

	// Calculate source and destination meta file paths
	const sourceDir = sourcePath.substring(0, sourcePath.lastIndexOf("/"));
	const sourceMetaPath = `${sourceDir}/_meta.ts`;
	const destMetaPath = `${destination}/_meta.ts`;

	try {
		// Get source _meta.ts content
		const sourceMetaContent = await getFileContent(octokit, owner, repo, sourceMetaPath);

		let entryValue: ExistingNavMetaEntry | undefined;

		if (sourceMetaContent) {
			// Parse source _meta.ts to find and extract the entry
			const sourceMeta = merger.parse(sourceMetaContent);

			// Find and remove the entry for the moved file
			if (slug in sourceMeta) {
				entryValue = sourceMeta[slug];
				delete sourceMeta[slug];

				// Save updated source _meta.ts
				const updatedSourceMeta = merger.serializeNavMeta(sourceMeta);
				await githubClient.updateRepositoryFile(
					owner,
					repo,
					sourceMetaPath,
					updatedSourceMeta,
					`Remove ${slug} from ${sourceDir} _meta.ts (file moved)`,
				);
			}
		}

		// Get destination _meta.ts content (may not exist)
		const destMetaContent = await getFileContent(octokit, owner, repo, destMetaPath);
		let destMeta: ExistingNavMeta;

		if (destMetaContent) {
			destMeta = merger.parse(destMetaContent);
		} else {
			destMeta = {};
		}

		// Add the entry to destination _meta.ts
		// Use the extracted entry if available, otherwise use slug as title
		if (entryValue !== undefined) {
			destMeta[slug] = entryValue;
		} else {
			destMeta[slug] = slug;
		}

		// Save updated destination _meta.ts
		const updatedDestMeta = merger.serializeNavMeta(destMeta);
		await githubClient.updateRepositoryFile(
			owner,
			repo,
			destMetaPath,
			updatedDestMeta,
			`Add ${slug} to ${destination} _meta.ts (file moved)`,
		);

		log.info({ sourceMetaPath, destMetaPath, slug }, "Synchronized _meta.ts files after file move");
	} catch (error) {
		// Best-effort operation - log error but don't fail the move
		log.warn(error, "Failed to sync _meta.ts files after file move (non-fatal)");
	}
}
/* c8 ignore stop */

/**
 * Get file content from GitHub repository.
 * Returns undefined if file doesn't exist.
 */
/* c8 ignore start */
async function getFileContent(
	octokit: ReturnType<typeof createOctokit>,
	owner: string,
	repo: string,
	path: string,
): Promise<string | undefined> {
	try {
		const response = await octokit.rest.repos.getContent({ owner, repo, path });
		const data = response.data;

		// Handle single file response (not directory)
		if (!Array.isArray(data) && "content" in data && data.content) {
			return Buffer.from(data.content, "base64").toString("utf-8");
		}
		return;
	} catch (error) {
		// File doesn't exist - return undefined
		if (error && typeof error === "object" && "status" in error && error.status === 404) {
			return;
		}
		throw error;
	}
}
/* c8 ignore stop */
