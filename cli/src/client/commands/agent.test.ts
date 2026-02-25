import {
	CLIENT_VERSION,
	createDefaultToolManifest,
	getWorkspaceRoot,
} from "./agent";
import { createToolHost } from "./AgentToolHost";
import { describe, expect, test } from "vitest";

describe("agent module", () => {
	test("CLIENT_VERSION is defined", () => {
		expect(CLIENT_VERSION).toBeDefined();
		expect(typeof CLIENT_VERSION).toBe("string");
	});

	test("getWorkspaceRoot returns a directory", async () => {
		const root = await getWorkspaceRoot();
		expect(typeof root).toBe("string");
		expect(root.length).toBeGreaterThan(0);
	});

	test("createDefaultToolManifest returns tool manifest", () => {
		const toolHost = createToolHost(process.cwd());
		const manifest = createDefaultToolManifest(toolHost);
		expect(manifest.tools).toBeDefined();
		expect(Array.isArray(manifest.tools)).toBe(true);
	});

	test("createDefaultToolManifest includes expected tools", () => {
		const toolHost = createToolHost(process.cwd());
		const manifest = createDefaultToolManifest(toolHost);
		const toolNames = manifest.tools.map(t => t.name);
		expect(toolNames).toContain("read_file");
		expect(toolNames).toContain("write_file");
		expect(toolNames).toContain("upsert_frontmatter");
		expect(toolNames).toContain("ls");
	});

	test("tool definitions have required fields", () => {
		const toolHost = createToolHost(process.cwd());
		const manifest = createDefaultToolManifest(toolHost);
		for (const tool of manifest.tools) {
			expect(tool.name).toBeTruthy();
			expect(tool.description).toBeTruthy();
			expect(tool.inputSchema).toBeTruthy();
			expect(tool.inputSchema.type).toBe("object");
			expect(tool.inputSchema.properties).toBeTruthy();
		}
	});

	test("read_file tool has path property", () => {
		const toolHost = createToolHost(process.cwd());
		const manifest = createDefaultToolManifest(toolHost);
		const readFile = manifest.tools.find(t => t.name === "read_file");
		expect(readFile).toBeDefined();
		expect(readFile?.inputSchema.properties.path).toBeDefined();
		expect(readFile?.inputSchema.required).toContain("path");
	});

	test("write_file tool has path and content properties", () => {
		const toolHost = createToolHost(process.cwd());
		const manifest = createDefaultToolManifest(toolHost);
		const writeFile = manifest.tools.find(t => t.name === "write_file");
		expect(writeFile).toBeDefined();
		expect(writeFile?.inputSchema.properties.path).toBeDefined();
		expect(writeFile?.inputSchema.properties.content).toBeDefined();
		expect(writeFile?.inputSchema.required).toContain("path");
		expect(writeFile?.inputSchema.required).toContain("content");
	});

	test("ls tool has path property", () => {
		const toolHost = createToolHost(process.cwd());
		const manifest = createDefaultToolManifest(toolHost);
		const ls = manifest.tools.find(t => t.name === "ls");
		expect(ls).toBeDefined();
		expect(ls?.inputSchema.properties.path).toBeDefined();
	});
});
