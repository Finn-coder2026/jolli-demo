import type { ImageStorageService } from "../services/ImageStorageService";
import { bundleSiteImages, extractImageReferences, getBundledFilename, transformImageUrls } from "./ImageBundler";
import { beforeEach, describe, expect, test, vi } from "vitest";

// Mock the Logger
vi.mock("./Logger", () => ({
	getLog: () => ({
		info: vi.fn(),
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	}),
}));

describe("ImageBundler", () => {
	describe("getBundledFilename", () => {
		test("generates hash-prefixed filename from S3 key", () => {
			const result = getBundledFilename("tenant123/org456/_default/abc123.png");

			// Should have format: {8-char-hash}-{original-filename}
			expect(result).toMatch(/^[a-f0-9]{8}-abc123\.png$/);
		});

		test("different S3 keys produce different hashes", () => {
			const result1 = getBundledFilename("tenant1/org1/_default/image.png");
			const result2 = getBundledFilename("tenant2/org2/_default/image.png");

			// Same filename but different paths -> different hashes
			expect(result1).not.toBe(result2);
			expect(result1).toMatch(/-image\.png$/);
			expect(result2).toMatch(/-image\.png$/);
		});

		test("same S3 key produces same hash (deterministic)", () => {
			const s3Key = "tenant/org/_default/logo.jpg";
			const result1 = getBundledFilename(s3Key);
			const result2 = getBundledFilename(s3Key);

			expect(result1).toBe(result2);
		});

		test("handles various file extensions", () => {
			expect(getBundledFilename("t/o/_default/image.png")).toMatch(/-image\.png$/);
			expect(getBundledFilename("t/o/_default/photo.jpg")).toMatch(/-photo\.jpg$/);
			expect(getBundledFilename("t/o/_default/icon.gif")).toMatch(/-icon\.gif$/);
			expect(getBundledFilename("t/o/_default/diagram.svg")).toMatch(/-diagram\.svg$/);
			expect(getBundledFilename("t/o/_default/photo.webp")).toMatch(/-photo\.webp$/);
		});
	});

	describe("extractImageReferences", () => {
		test("extracts markdown image refs", () => {
			const content = `
# Hello

![Screenshot](/api/images/tenant/org/_default/screenshot.png)

Some text here.

![Another image](/api/images/tenant/org/_default/diagram.svg)
			`;

			const refs = extractImageReferences(content);

			expect(refs).toHaveLength(2);
			expect(refs).toContain("tenant/org/_default/screenshot.png");
			expect(refs).toContain("tenant/org/_default/diagram.svg");
		});

		test("extracts HTML image refs", () => {
			const content = `
<p>Check out this image:</p>
<img src="/api/images/tenant/org/_default/logo.png" alt="Logo" />
<img src="/api/images/tenant/org/_default/banner.jpg" width="100">
			`;

			const refs = extractImageReferences(content);

			expect(refs).toHaveLength(2);
			expect(refs).toContain("tenant/org/_default/logo.png");
			expect(refs).toContain("tenant/org/_default/banner.jpg");
		});

		test("extracts both markdown and HTML refs", () => {
			const content = `
![MD Image](/api/images/t/o/_default/md.png)
<img src="/api/images/t/o/_default/html.png" />
			`;

			const refs = extractImageReferences(content);

			expect(refs).toHaveLength(2);
			expect(refs).toContain("t/o/_default/md.png");
			expect(refs).toContain("t/o/_default/html.png");
		});

		test("deduplicates repeated image refs", () => {
			const content = `
![First](/api/images/t/o/_default/same.png)
![Second](/api/images/t/o/_default/same.png)
<img src="/api/images/t/o/_default/same.png" />
			`;

			const refs = extractImageReferences(content);

			expect(refs).toHaveLength(1);
			expect(refs[0]).toBe("t/o/_default/same.png");
		});

		test("returns empty array when no image refs found", () => {
			const content = `
# No images here
Just some text.
			`;

			const refs = extractImageReferences(content);

			expect(refs).toEqual([]);
		});

		test("ignores image refs in fenced code blocks", () => {
			const content = `
Here's a real image:
![Real](/api/images/t/o/_default/real.png)

Here's how to use images:
\`\`\`markdown
![Example](/api/images/t/o/_default/example.png)
\`\`\`

\`\`\`html
<img src="/api/images/t/o/_default/code-example.png" />
\`\`\`
			`;

			const refs = extractImageReferences(content);

			// Should only extract the real image, not the code block examples
			expect(refs).toHaveLength(1);
			expect(refs[0]).toBe("t/o/_default/real.png");
		});

		test("handles images with alt text containing special characters", () => {
			const content = `
![Image with "quotes" and 'apostrophes' & symbols](/api/images/t/o/_default/special.png)
			`;

			const refs = extractImageReferences(content);

			expect(refs).toHaveLength(1);
			expect(refs[0]).toBe("t/o/_default/special.png");
		});

		test("handles double-quoted HTML attributes", () => {
			const content = `<img src="/api/images/t/o/_default/double.png" alt="test">`;

			const refs = extractImageReferences(content);

			expect(refs).toHaveLength(1);
			expect(refs[0]).toBe("t/o/_default/double.png");
		});

		test("handles single-quoted HTML attributes", () => {
			const content = `<img src='/api/images/t/o/_default/single.png' alt='test'>`;

			const refs = extractImageReferences(content);

			expect(refs).toHaveLength(1);
			expect(refs[0]).toBe("t/o/_default/single.png");
		});

		test("does not extract external URLs", () => {
			const content = `
![External](https://example.com/image.png)
![Local](/api/images/t/o/_default/local.png)
<img src="https://cdn.example.com/photo.jpg" />
			`;

			const refs = extractImageReferences(content);

			expect(refs).toHaveLength(1);
			expect(refs[0]).toBe("t/o/_default/local.png");
		});
	});

	describe("transformImageUrls", () => {
		test("transforms markdown images to HTML img tags", () => {
			const content = `![Screenshot](/api/images/t/o/_default/shot.png)`;
			const filenameMap = new Map([["t/o/_default/shot.png", "abc12345-shot.png"]]);

			const result = transformImageUrls(content, filenameMap);

			// Markdown images are converted to HTML to bypass Next.js image optimization
			expect(result).toBe(`<img src="/images/abc12345-shot.png" alt="Screenshot" />`);
		});

		test("transforms HTML image URLs (keeps as HTML)", () => {
			const content = `<img src="/api/images/t/o/_default/logo.png" alt="Logo">`;
			const filenameMap = new Map([["t/o/_default/logo.png", "def67890-logo.png"]]);

			const result = transformImageUrls(content, filenameMap);

			expect(result).toBe(`<img src="/images/def67890-logo.png" alt="Logo">`);
		});

		test("transforms multiple image URLs", () => {
			const content = `
![First](/api/images/t/o/_default/first.png)
![Second](/api/images/t/o/_default/second.jpg)
			`;
			const filenameMap = new Map([
				["t/o/_default/first.png", "aaa11111-first.png"],
				["t/o/_default/second.jpg", "bbb22222-second.jpg"],
			]);

			const result = transformImageUrls(content, filenameMap);

			expect(result).toContain(`<img src="/images/aaa11111-first.png" alt="First" />`);
			expect(result).toContain(`<img src="/images/bbb22222-second.jpg" alt="Second" />`);
			expect(result).not.toContain("/api/images/");
		});

		test("transforms all occurrences of same image", () => {
			const content = `
![First](/api/images/t/o/_default/same.png)
![Again](/api/images/t/o/_default/same.png)
			`;
			const filenameMap = new Map([["t/o/_default/same.png", "ccc33333-same.png"]]);

			const result = transformImageUrls(content, filenameMap);

			expect(result.match(/\/images\/ccc33333-same\.png/g)?.length).toBe(2);
		});

		test("leaves URLs not in filenameMap unchanged", () => {
			const content = `
![Known](/api/images/t/o/_default/known.png)
![Unknown](/api/images/t/o/_default/unknown.png)
			`;
			const filenameMap = new Map([["t/o/_default/known.png", "known-hash.png"]]);

			const result = transformImageUrls(content, filenameMap);

			expect(result).toContain(`<img src="/images/known-hash.png" alt="Known" />`);
			expect(result).toContain("![Unknown](/api/images/t/o/_default/unknown.png)");
		});

		test("handles empty filenameMap", () => {
			const content = `![Image](/api/images/t/o/_default/image.png)`;
			const filenameMap = new Map<string, string>();

			const result = transformImageUrls(content, filenameMap);

			expect(result).toBe(content);
		});

		test("escapes special regex characters in S3 keys", () => {
			// S3 keys can contain characters like + and . that are regex special chars
			const content = `![Image](/api/images/t/o/_default/file+name.test.png)`;
			const filenameMap = new Map([["t/o/_default/file+name.test.png", "hash-file+name.test.png"]]);

			const result = transformImageUrls(content, filenameMap);

			expect(result).toBe(`<img src="/images/hash-file+name.test.png" alt="Image" />`);
		});

		test("preserves empty alt text", () => {
			const content = `![](/api/images/t/o/_default/no-alt.png)`;
			const filenameMap = new Map([["t/o/_default/no-alt.png", "hash-no-alt.png"]]);

			const result = transformImageUrls(content, filenameMap);

			expect(result).toBe(`<img src="/images/hash-no-alt.png" alt="" />`);
		});

		test("handles HTML with single quotes", () => {
			const content = `<img src='/api/images/t/o/_default/single.png' alt='Test'>`;
			const filenameMap = new Map([["t/o/_default/single.png", "hash-single.png"]]);

			const result = transformImageUrls(content, filenameMap);

			expect(result).toBe(`<img src="/images/hash-single.png" alt='Test'>`);
		});

		test("preserves HTML attributes like width and height", () => {
			const content = `<img src="/api/images/t/o/_default/sized.png" alt="Sized" width="400" height="300">`;
			const filenameMap = new Map([["t/o/_default/sized.png", "hash-sized.png"]]);

			const result = transformImageUrls(content, filenameMap);

			expect(result).toBe(`<img src="/images/hash-sized.png" alt="Sized" width="400" height="300">`);
		});

		test("transforms markdown images with width percentage to HTML with style", () => {
			const content = `![Resized Image](/api/images/t/o/_default/resized.png){width=50%}`;
			const filenameMap = new Map([["t/o/_default/resized.png", "hash-resized.png"]]);

			const result = transformImageUrls(content, filenameMap);

			expect(result).toBe(`<img src="/images/hash-resized.png" alt="Resized Image" style="width: 50%" />`);
		});

		test("transforms markdown images with various width percentages", () => {
			const content = `
![Small](/api/images/t/o/_default/small.png){width=25%}
![Medium](/api/images/t/o/_default/medium.png){width=50%}
![Large](/api/images/t/o/_default/large.png){width=100%}
			`;
			const filenameMap = new Map([
				["t/o/_default/small.png", "hash-small.png"],
				["t/o/_default/medium.png", "hash-medium.png"],
				["t/o/_default/large.png", "hash-large.png"],
			]);

			const result = transformImageUrls(content, filenameMap);

			expect(result).toContain(`<img src="/images/hash-small.png" alt="Small" style="width: 25%" />`);
			expect(result).toContain(`<img src="/images/hash-medium.png" alt="Medium" style="width: 50%" />`);
			expect(result).toContain(`<img src="/images/hash-large.png" alt="Large" style="width: 100%" />`);
		});

		test("transforms mix of images with and without width percentage", () => {
			const content = `
![With Width](/api/images/t/o/_default/with-width.png){width=75%}
![Without Width](/api/images/t/o/_default/without-width.png)
			`;
			const filenameMap = new Map([
				["t/o/_default/with-width.png", "hash-with-width.png"],
				["t/o/_default/without-width.png", "hash-without-width.png"],
			]);

			const result = transformImageUrls(content, filenameMap);

			expect(result).toContain(`<img src="/images/hash-with-width.png" alt="With Width" style="width: 75%" />`);
			expect(result).toContain(`<img src="/images/hash-without-width.png" alt="Without Width" />`);
		});

		test("preserves empty alt text with width percentage", () => {
			const content = `![](/api/images/t/o/_default/no-alt.png){width=60%}`;
			const filenameMap = new Map([["t/o/_default/no-alt.png", "hash-no-alt.png"]]);

			const result = transformImageUrls(content, filenameMap);

			expect(result).toBe(`<img src="/images/hash-no-alt.png" alt="" style="width: 60%" />`);
		});
	});

	describe("bundleSiteImages", () => {
		let mockImageStorageService: ImageStorageService;

		beforeEach(() => {
			mockImageStorageService = {
				uploadImage: vi.fn(),
				getSignedUrl: vi.fn(),
				downloadImage: vi.fn(),
				deleteImage: vi.fn(),
				imageExists: vi.fn(),
			};
		});

		test("bundles images from multiple articles", async () => {
			const articles = [
				{ content: `![Image1](/api/images/tenant1/org1/_default/img1.png)` },
				{ content: `![Image2](/api/images/tenant1/org1/_default/img2.jpg)` },
			];

			vi.mocked(mockImageStorageService.downloadImage)
				.mockResolvedValueOnce({ buffer: Buffer.from("png-data-1"), mimeType: "image/png" })
				.mockResolvedValueOnce({ buffer: Buffer.from("jpg-data-2"), mimeType: "image/jpeg" });

			const result = await bundleSiteImages(articles, mockImageStorageService, "tenant1");

			expect(result.imageFiles).toHaveLength(2);
			expect(result.transformedArticles).toHaveLength(2);

			// Verify images are base64 encoded
			expect(result.imageFiles[0].encoding).toBe("base64");
			expect(result.imageFiles[1].encoding).toBe("base64");

			// Verify paths are in public/images/
			expect(result.imageFiles[0].path).toMatch(/^public\/images\/[a-f0-9]{8}-img1\.png$/);
			expect(result.imageFiles[1].path).toMatch(/^public\/images\/[a-f0-9]{8}-img2\.jpg$/);

			// Verify URLs are transformed
			expect(result.transformedArticles[0].content).toContain("/images/");
			expect(result.transformedArticles[0].content).not.toContain("/api/images/");
		});

		test("deduplicates images used in multiple articles", async () => {
			const articles = [
				{ content: `![Shared](/api/images/tenant1/org1/_default/shared.png)` },
				{ content: `![Also Shared](/api/images/tenant1/org1/_default/shared.png)` },
			];

			vi.mocked(mockImageStorageService.downloadImage).mockResolvedValue({
				buffer: Buffer.from("shared-data"),
				mimeType: "image/png",
			});

			const result = await bundleSiteImages(articles, mockImageStorageService, "tenant1");

			// Should only download once even though used in multiple articles
			expect(mockImageStorageService.downloadImage).toHaveBeenCalledTimes(1);
			expect(result.imageFiles).toHaveLength(1);

			// Both articles should have transformed URLs
			expect(result.transformedArticles[0].content).toContain("/images/");
			expect(result.transformedArticles[1].content).toContain("/images/");
		});

		test("returns original content when no images found", async () => {
			const articles = [{ content: "No images here" }, { content: "Just text" }];

			const result = await bundleSiteImages(articles, mockImageStorageService, "tenant1");

			expect(result.imageFiles).toEqual([]);
			expect(result.transformedArticles[0].content).toBe("No images here");
			expect(result.transformedArticles[1].content).toBe("Just text");
			expect(mockImageStorageService.downloadImage).not.toHaveBeenCalled();
		});

		test("skips cross-tenant image references", async () => {
			const articles = [
				{ content: `![Own](/api/images/tenant1/org1/_default/own.png)` },
				{ content: `![Other](/api/images/tenant2/org2/_default/other.png)` },
			];

			vi.mocked(mockImageStorageService.downloadImage).mockResolvedValue({
				buffer: Buffer.from("own-data"),
				mimeType: "image/png",
			});

			const result = await bundleSiteImages(articles, mockImageStorageService, "tenant1");

			// Should only download the image belonging to tenant1
			expect(mockImageStorageService.downloadImage).toHaveBeenCalledTimes(1);
			expect(mockImageStorageService.downloadImage).toHaveBeenCalledWith("tenant1/org1/_default/own.png");

			expect(result.imageFiles).toHaveLength(1);

			// Cross-tenant URL should be left unchanged
			expect(result.transformedArticles[1].content).toContain("/api/images/tenant2/");
		});

		test("throws error when image download fails with Error instance", async () => {
			const articles = [{ content: `![Image](/api/images/tenant1/org1/_default/broken.png)` }];

			vi.mocked(mockImageStorageService.downloadImage).mockRejectedValue(new Error("S3 error: not found"));

			await expect(bundleSiteImages(articles, mockImageStorageService, "tenant1")).rejects.toThrow(
				"Failed to download image for bundling: tenant1/org1/_default/broken.png",
			);
		});

		test("throws error when image download fails with non-Error value", async () => {
			const articles = [{ content: `![Image](/api/images/tenant1/org1/_default/broken.png)` }];

			// Some code might throw strings or other non-Error values
			vi.mocked(mockImageStorageService.downloadImage).mockRejectedValue("Network timeout");

			await expect(bundleSiteImages(articles, mockImageStorageService, "tenant1")).rejects.toThrow(
				"Failed to download image for bundling: tenant1/org1/_default/broken.png. Error: Network timeout",
			);
		});

		test("preserves article order in transformed output", async () => {
			const articles = [
				{ content: `Article 1: ![](/api/images/tenant1/org1/_default/a.png)` },
				{ content: `Article 2: no image` },
				{ content: `Article 3: ![](/api/images/tenant1/org1/_default/b.png)` },
			];

			vi.mocked(mockImageStorageService.downloadImage).mockResolvedValue({
				buffer: Buffer.from("data"),
				mimeType: "image/png",
			});

			const result = await bundleSiteImages(articles, mockImageStorageService, "tenant1");

			expect(result.transformedArticles).toHaveLength(3);
			expect(result.transformedArticles[0].content).toContain("Article 1:");
			expect(result.transformedArticles[1].content).toBe("Article 2: no image");
			expect(result.transformedArticles[2].content).toContain("Article 3:");
		});

		test("handles empty articles array", async () => {
			const result = await bundleSiteImages([], mockImageStorageService, "tenant1");

			expect(result.imageFiles).toEqual([]);
			expect(result.transformedArticles).toEqual([]);
		});

		test("generates base64 content for binary images", async () => {
			const articles = [{ content: `![Img](/api/images/tenant1/org/_default/test.png)` }];
			const imageBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG magic bytes

			vi.mocked(mockImageStorageService.downloadImage).mockResolvedValue({
				buffer: imageBuffer,
				mimeType: "image/png",
			});

			const result = await bundleSiteImages(articles, mockImageStorageService, "tenant1");

			expect(result.imageFiles[0].content).toBe(imageBuffer.toString("base64"));
			expect(result.imageFiles[0].encoding).toBe("base64");
		});
	});
});
