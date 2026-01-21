import { formatConflictMarkers, hasConflictMarkers, normalizeClientPath, normalizeGlobPattern } from "./sync-helpers";
import { describe, expect, test } from "vitest";

describe("normalizeClientPath", () => {
	test("converts backslashes to slashes", () => {
		expect(normalizeClientPath("docs\\readme.md")).toBe("docs/readme.md");
	});

	test("removes leading ./", () => {
		expect(normalizeClientPath("./docs/readme.md")).toBe("docs/readme.md");
	});

	test("collapses duplicate slashes", () => {
		expect(normalizeClientPath("docs//nested///file.md")).toBe("docs/nested/file.md");
	});
});

describe("normalizeGlobPattern", () => {
	test("converts backslashes to slashes", () => {
		expect(normalizeGlobPattern("docs\\**\\*.md")).toBe("docs/**/*.md");
	});
});

describe("conflict markers", () => {
	test("formats conflict markers with both sides", () => {
		const result = formatConflictMarkers("local", "server");
		expect(result).toContain("<<<<<<< LOCAL");
		expect(result).toContain("local");
		expect(result).toContain("=======");
		expect(result).toContain("server");
		expect(result).toContain(">>>>>>> SERVER");
	});

	test("detects conflict markers in content", () => {
		const content = formatConflictMarkers("local", "server");
		expect(hasConflictMarkers(content)).toBe(true);
		expect(hasConflictMarkers("plain content")).toBe(false);
	});
});
