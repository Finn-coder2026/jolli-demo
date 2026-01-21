import { isBinaryFile } from "./FileTypeUtil";
import { describe, expect, it } from "vitest";

describe("FileTypeUtil", () => {
	describe("isBinaryFile", () => {
		it("returns true for image files", () => {
			expect(isBinaryFile("image.png")).toBe(true);
			expect(isBinaryFile("photo.jpg")).toBe(true);
			expect(isBinaryFile("photo.jpeg")).toBe(true);
			expect(isBinaryFile("animation.gif")).toBe(true);
			expect(isBinaryFile("modern.webp")).toBe(true);
			expect(isBinaryFile("favicon.ico")).toBe(true);
			expect(isBinaryFile("bitmap.bmp")).toBe(true);
			expect(isBinaryFile("scan.tiff")).toBe(true);
		});

		it("returns false for SVG files (text-based XML)", () => {
			expect(isBinaryFile("icon.svg")).toBe(false);
			expect(isBinaryFile("logo.SVG")).toBe(false);
		});

		it("returns true for font files", () => {
			expect(isBinaryFile("font.woff")).toBe(true);
			expect(isBinaryFile("font.woff2")).toBe(true);
			expect(isBinaryFile("font.ttf")).toBe(true);
			expect(isBinaryFile("font.otf")).toBe(true);
			expect(isBinaryFile("font.eot")).toBe(true);
		});

		it("returns true for archive files", () => {
			expect(isBinaryFile("archive.zip")).toBe(true);
			expect(isBinaryFile("archive.gz")).toBe(true);
			expect(isBinaryFile("archive.tar")).toBe(true);
		});

		it("returns true for PDF files", () => {
			expect(isBinaryFile("document.pdf")).toBe(true);
		});

		it("returns false for text files", () => {
			expect(isBinaryFile("readme.md")).toBe(false);
			expect(isBinaryFile("code.ts")).toBe(false);
			expect(isBinaryFile("code.tsx")).toBe(false);
			expect(isBinaryFile("code.js")).toBe(false);
			expect(isBinaryFile("styles.css")).toBe(false);
			expect(isBinaryFile("page.html")).toBe(false);
			expect(isBinaryFile("data.json")).toBe(false);
			expect(isBinaryFile("config.yaml")).toBe(false);
			expect(isBinaryFile("config.yml")).toBe(false);
			expect(isBinaryFile("doc.txt")).toBe(false);
		});

		it("handles case-insensitive extensions", () => {
			expect(isBinaryFile("image.PNG")).toBe(true);
			expect(isBinaryFile("image.Png")).toBe(true);
			expect(isBinaryFile("font.WOFF2")).toBe(true);
		});

		it("handles files in directories", () => {
			expect(isBinaryFile("public/images/photo.png")).toBe(true);
			expect(isBinaryFile("src/assets/icon.svg")).toBe(false);
			expect(isBinaryFile("deep/nested/path/file.jpg")).toBe(true);
		});

		it("handles files with multiple dots in name", () => {
			expect(isBinaryFile("my.image.file.png")).toBe(true);
			expect(isBinaryFile("config.backup.json")).toBe(false);
		});
	});
});
