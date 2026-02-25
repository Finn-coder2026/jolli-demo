/**
 * Image bundling utilities for site generation.
 *
 * Downloads images from S3, transforms URLs in article content,
 * and returns FileTree entries for bundled images.
 *
 * Framework-agnostic: can be used with any site generator.
 *
 * Security: Images are validated at multiple layers:
 * 1. Tenant validation - ImageBundler ensures images belong to the correct tenant
 * 2. Space validation - Handled at article save time (image reference validation)
 *    prevents articles from referencing images in other spaces
 *
 * By the time content reaches site generation, cross-space image references
 * have already been blocked, so no additional space validation is needed here.
 */

import type { FileTree } from "../github/DocsiteGitHub";
import type { ImageStorageService } from "../services/ImageStorageService";
import { getLog } from "./Logger";
import { createHash } from "node:crypto";

const log = getLog(import.meta);

/**
 * Match markdown image refs: ![alt](/api/images/tenant/org/_default/uuid.ext)
 * Capture group 1: full S3 key path (tenant/org/_default/uuid.ext)
 */
const MARKDOWN_IMAGE_REGEX = /!\[[^\]]*\]\(\/api\/images\/([^)]+)\)/g;

/**
 * Match HTML image refs: <img src="/api/images/tenant/org/_default/uuid.ext" ...>
 * Capture group 1: full S3 key path
 */
const HTML_IMAGE_REGEX = /<img[^>]+src=["']\/api\/images\/([^"']+)["'][^>]*>/gi;

/**
 * Result of bundling images for site generation.
 */
export interface BundleSiteImagesResult {
	/** Image files to add to public/images/ */
	imageFiles: Array<FileTree>;
	/** Articles with transformed URLs (same order as input) */
	transformedArticles: Array<{ content: string }>;
}

/**
 * Generate a unique bundled filename from an S3 key.
 * Uses hash prefix to prevent collisions across different orgs/tenants.
 *
 * Example: "tenant/org/_default/abc123.png" -> "a1b2c3d4-abc123.png"
 *
 * @param s3Key - Full S3 key path
 * @returns Hash-prefixed filename
 */
export function getBundledFilename(s3Key: string): string {
	const parts = s3Key.split("/");
	const filename = parts[parts.length - 1];
	// Use first 8 chars of SHA256 hash to prevent collisions
	const hash = createHash("sha256").update(s3Key).digest("hex").slice(0, 8);
	return `${hash}-${filename}`;
}

/**
 * Remove fenced code blocks from content to avoid extracting image refs
 * that are documentation examples rather than actual images.
 */
function removeFencedCodeBlocks(content: string): string {
	// Match ```...``` blocks (with optional language specifier)
	return content.replace(/```[\s\S]*?```/g, "");
}

/**
 * Extract all image references from content.
 * Skips images inside fenced code blocks.
 *
 * @param content - Article content (markdown/MDX)
 * @returns Deduplicated array of S3 key paths
 */
export function extractImageReferences(content: string): Array<string> {
	const refs = new Set<string>();

	// Remove code blocks to avoid extracting example image refs
	const contentWithoutCodeBlocks = removeFencedCodeBlocks(content);

	// Extract markdown image refs
	for (const match of contentWithoutCodeBlocks.matchAll(MARKDOWN_IMAGE_REGEX)) {
		refs.add(match[1]);
	}

	// Extract HTML image refs
	for (const match of contentWithoutCodeBlocks.matchAll(HTML_IMAGE_REGEX)) {
		refs.add(match[1]);
	}

	return Array.from(refs);
}

/**
 * Transform image URLs in content from API paths to static paths.
 *
 * For markdown images: ![alt](/api/images/...) -> <img src="/images/..." alt="alt" />
 * For markdown images with width percentage: ![alt](/api/images/...){width=XX%} -> <img src="/images/..." alt="alt" style="width: XX%" />
 * For HTML images: src="/api/images/..." -> src="/images/..."
 *
 * Markdown images are converted to HTML to bypass Next.js/Nextra image optimization,
 * which would otherwise try to process the images at build time and fail.
 * This is also consistent with JOLLI-324 which uses HTML img tags for resized images.
 *
 * Only transforms URLs in the filenameMap (those we extracted and validated).
 * This avoids corrupting prose or code examples.
 *
 * @param content - The article content to transform
 * @param filenameMap - Map from S3 key to bundled filename (with hash prefix)
 * @returns Content with transformed image URLs
 */
export function transformImageUrls(content: string, filenameMap: Map<string, string>): string {
	let result = content;

	for (const [s3Key, bundledFilename] of filenameMap) {
		const escaped = s3Key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const newPath = `/images/${bundledFilename}`;

		// Transform markdown images with width percentage to HTML img tags with style
		// Match: ![alt text](/api/images/s3Key){width=XX%}
		const markdownWithWidthRegex = new RegExp(
			`!\\[([^\\]]*)\\]\\(/api/images/${escaped}\\)\\{width=(\\d+)%\\}`,
			"g",
		);
		result = result.replace(markdownWithWidthRegex, `<img src="${newPath}" alt="$1" style="width: $2%" />`);

		// Transform markdown images without width to HTML img tags
		// Match: ![alt text](/api/images/s3Key) (not followed by {width=...})
		const markdownRegex = new RegExp(`!\\[([^\\]]*)\\]\\(/api/images/${escaped}\\)(?!\\{width=)`, "g");
		result = result.replace(markdownRegex, `<img src="${newPath}" alt="$1" />`);

		// Transform HTML image src attributes (already HTML, just update the path)
		// Match: src="/api/images/s3Key" or src='/api/images/s3Key'
		result = result.replace(new RegExp(`src=["']/api/images/${escaped}["']`, "g"), `src="${newPath}"`);
	}

	return result;
}

/** Maximum number of concurrent image downloads to avoid overwhelming S3 */
const MAX_CONCURRENT_DOWNLOADS = 5;

/**
 * Download a single image from S3 and return the FileTree entry.
 * @internal Exported for testing
 */
export async function downloadImage(
	imageId: string,
	imageStorageService: ImageStorageService,
): Promise<{ imageId: string; file: FileTree }> {
	const bundledFilename = getBundledFilename(imageId);
	const { buffer } = await imageStorageService.downloadImage(imageId);

	log.debug(
		{ imageId, bundledFilename, size: buffer.length },
		"Downloaded image %s (%d bytes)",
		bundledFilename,
		buffer.length,
	);

	return {
		imageId,
		file: {
			path: `public/images/${bundledFilename}`,
			content: buffer.toString("base64"),
			encoding: "base64",
		},
	};
}

/**
 * Bundle images for site generation.
 *
 * Downloads images from S3 in parallel (with concurrency limit),
 * transforms URLs in article content, and returns FileTree entries for the bundled images.
 *
 * @param articles - Articles with content containing image refs
 * @param imageStorageService - Service for downloading images from S3
 * @param tenantId - Tenant ID for security validation
 * @returns Image files and transformed articles
 * @throws Error if any image download fails (fail-fast to prevent broken deployments)
 */
export async function bundleSiteImages(
	articles: Array<{ content: string }>,
	imageStorageService: ImageStorageService,
	tenantId: string,
): Promise<BundleSiteImagesResult> {
	// 1. Collect all unique image refs across all articles
	const allRefs = new Set<string>();
	for (const article of articles) {
		for (const ref of extractImageReferences(article.content)) {
			allRefs.add(ref);
		}
	}

	if (allRefs.size === 0) {
		log.debug("No images to bundle");
		return {
			imageFiles: [],
			transformedArticles: articles.map(a => ({ content: a.content })),
		};
	}

	log.info({ imageCount: allRefs.size }, "Found %d unique images to bundle", allRefs.size);

	// 2. Filter valid refs and build filename map
	const validRefs: Array<string> = [];
	const skippedRefs: Array<string> = [];
	const filenameMap = new Map<string, string>();

	for (const imageId of allRefs) {
		// Security: verify image belongs to this tenant
		if (!imageId.startsWith(`${tenantId}/`)) {
			log.warn(
				{ imageId, tenantId },
				"Skipping cross-tenant image reference: %s (expected tenant: %s)",
				imageId,
				tenantId,
			);
			skippedRefs.push(imageId);
			continue;
		}

		validRefs.push(imageId);
		filenameMap.set(imageId, getBundledFilename(imageId));
	}

	// 3. Download images in parallel with concurrency limit
	const imageFiles: Array<FileTree> = [];

	// Process in batches to limit concurrency
	for (let i = 0; i < validRefs.length; i += MAX_CONCURRENT_DOWNLOADS) {
		const batch = validRefs.slice(i, i + MAX_CONCURRENT_DOWNLOADS);

		const results = await Promise.all(
			batch.map(async imageId => {
				try {
					return await downloadImage(imageId, imageStorageService);
				} catch (error) {
					const errorMsg = error instanceof Error ? error.message : String(error);
					log.error({ imageId, error: errorMsg }, "Failed to download image %s: %s", imageId, errorMsg);
					// FAIL generation - don't deploy sites with broken images
					throw new Error(`Failed to download image for bundling: ${imageId}. Error: ${errorMsg}`);
				}
			}),
		);

		for (const result of results) {
			imageFiles.push(result.file);
		}
	}

	if (skippedRefs.length > 0) {
		log.warn(
			{ skippedCount: skippedRefs.length, skippedRefs },
			"Skipped %d cross-tenant image references",
			skippedRefs.length,
		);
	}

	// 4. Transform URLs in all articles using the filename map
	// Note: articles[i] corresponds to transformedArticles[i] by array index
	const transformedArticles = articles.map(article => ({
		content: transformImageUrls(article.content, filenameMap),
	}));

	log.info(
		{ downloaded: imageFiles.length, skipped: skippedRefs.length },
		"Bundled %d images successfully (%d skipped)",
		imageFiles.length,
		skippedRefs.length,
	);

	return { imageFiles, transformedArticles };
}
