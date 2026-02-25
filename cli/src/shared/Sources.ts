import { promises as fs } from "node:fs";
import path from "node:path";

const SOURCES_DIR = ".jolli";
const SOURCES_FILE = "sources.json";

export type LocalSourceType = "git";

export interface LocalSourceEntry {
	readonly type: LocalSourceType;
	readonly path: string;
	readonly sourceId?: number;
}

export interface SourcesConfig {
	readonly version: 1;
	readonly sources: Record<string, LocalSourceEntry>;
}

export type SourcePathStatus = "resolved" | "missing-path" | "invalid-git-root";

function createDefaultConfig(): SourcesConfig {
	return { version: 1, sources: {} };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeString(value: unknown): string | undefined {
	if (typeof value !== "string") {
		return;
	}
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeSourceId(value: unknown): number | undefined {
	if (!Number.isInteger(value)) {
		return;
	}
	const asNumber = value as number;
	return asNumber > 0 ? asNumber : undefined;
}

function sanitizeSourceEntry(raw: unknown): LocalSourceEntry | undefined {
	if (!isRecord(raw)) {
		return;
	}
	const type = normalizeString(raw.type);
	const sourcePath = normalizeString(raw.path);
	if (!type || !sourcePath || type !== "git") {
		return;
	}
	const sourceId = normalizeSourceId(raw.sourceId);
	return sourceId ? { type, path: sourcePath, sourceId } : { type, path: sourcePath };
}

function sanitizeConfig(raw: unknown): SourcesConfig {
	if (!isRecord(raw)) {
		return createDefaultConfig();
	}
	const version = 1 as const;
	const rawSources = raw.sources;
	if (!isRecord(rawSources)) {
		return { version, sources: {} };
	}

	const sources: Record<string, LocalSourceEntry> = {};
	for (const [rawName, rawEntry] of Object.entries(rawSources)) {
		const name = normalizeSourceName(rawName);
		const entry = sanitizeSourceEntry(rawEntry);
		if (!name || !entry) {
			continue;
		}
		sources[name] = entry;
	}
	return { version, sources };
}

async function ensureSourcesDir(projectRoot: string): Promise<void> {
	await fs.mkdir(path.join(projectRoot, SOURCES_DIR), { recursive: true });
}

async function pathExists(targetPath: string): Promise<boolean> {
	try {
		const stats = await fs.stat(targetPath);
		return stats.isDirectory();
	} catch {
		return false;
	}
}

async function execGit(args: Array<string>): Promise<{ ok: boolean; stdout: string }> {
	const proc = Bun.spawn(["git", ...args], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const stdout = await new Response(proc.stdout).text();
	const exitCode = await proc.exited;
	return {
		ok: exitCode === 0,
		stdout: stdout.trim(),
	};
}

export function normalizeSourceName(name: string): string {
	return name.trim();
}

export function assertValidSourceName(name: string): void {
	const normalized = normalizeSourceName(name);
	if (!normalized) {
		throw new Error("Source name cannot be empty.");
	}
	if (!/^[A-Za-z0-9._-]+$/.test(normalized)) {
		throw new Error("Source name must match /^[A-Za-z0-9._-]+$/.");
	}
}

export function getSourcesFilePath(projectRoot: string): string {
	return path.join(projectRoot, SOURCES_DIR, SOURCES_FILE);
}

export async function loadSources(projectRoot: string): Promise<SourcesConfig> {
	const filePath = getSourcesFilePath(projectRoot);
	try {
		const raw = await fs.readFile(filePath, "utf8");
		const parsed = JSON.parse(raw) as unknown;
		return sanitizeConfig(parsed);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return createDefaultConfig();
		}
		throw new Error(`Failed to load sources config: ${(error as Error).message}`);
	}
}

export async function saveSources(projectRoot: string, config: SourcesConfig): Promise<void> {
	await ensureSourcesDir(projectRoot);
	const filePath = getSourcesFilePath(projectRoot);
	await fs.writeFile(filePath, JSON.stringify(config, null, 2), "utf8");
}

export async function setSource(projectRoot: string, name: string, source: LocalSourceEntry): Promise<SourcesConfig> {
	assertValidSourceName(name);
	const normalizedName = normalizeSourceName(name);
	const existing = await loadSources(projectRoot);
	const next: SourcesConfig = {
		version: 1,
		sources: {
			...existing.sources,
			[normalizedName]: source,
		},
	};
	await saveSources(projectRoot, next);
	return next;
}

export async function removeSource(
	projectRoot: string,
	name: string,
): Promise<{ removed: boolean; config: SourcesConfig }> {
	assertValidSourceName(name);
	const normalizedName = normalizeSourceName(name);
	const existing = await loadSources(projectRoot);
	if (!existing.sources[normalizedName]) {
		return { removed: false, config: existing };
	}
	const { [normalizedName]: _removed, ...rest } = existing.sources;
	const next: SourcesConfig = {
		version: 1,
		sources: rest,
	};
	await saveSources(projectRoot, next);
	return { removed: true, config: next };
}

/**
 * Resolves a path to a git repository root.
 * Returns undefined when the path is not inside a git work tree.
 */
export async function resolveGitRoot(inputPath: string): Promise<string | undefined> {
	const absolute = path.resolve(inputPath);
	const result = await execGit(["-C", absolute, "rev-parse", "--show-toplevel"]);
	if (!result.ok || !result.stdout) {
		return;
	}
	return path.resolve(result.stdout);
}

/**
 * Normalizes a user-provided source path to an absolute git root path.
 */
export async function normalizeSourcePath(inputPath: string): Promise<string> {
	const absolute = path.resolve(inputPath);
	if (!(await pathExists(absolute))) {
		throw new Error(`Source path does not exist: ${absolute}`);
	}
	const gitRoot = await resolveGitRoot(absolute);
	if (!gitRoot) {
		throw new Error(`Path is not inside a git repository: ${absolute}`);
	}
	return gitRoot;
}

export async function getSourcePathStatus(sourcePath: string): Promise<SourcePathStatus> {
	const absolute = path.resolve(sourcePath);
	if (!(await pathExists(absolute))) {
		return "missing-path";
	}
	const gitRoot = await resolveGitRoot(absolute);
	if (!gitRoot || path.resolve(gitRoot) !== absolute) {
		return "invalid-git-root";
	}
	return "resolved";
}
