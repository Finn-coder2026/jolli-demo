import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

interface GlobalConfig {
	authToken?: string;
	space?: string;
}

interface LocalSpaceConfig {
	space: string;
}

const GLOBAL_CONFIG_DIR = join(homedir(), ".jolli");
const GLOBAL_CONFIG_FILE = join(GLOBAL_CONFIG_DIR, "config.json");

/** Local per-directory space file, stored alongside sync state. */
const LOCAL_JOLLI_DIR = ".jolli";
const LOCAL_SPACE_FILE = join(LOCAL_JOLLI_DIR, "space.json");

export async function saveAuthToken(token: string): Promise<void> {
	await mkdir(GLOBAL_CONFIG_DIR, { recursive: true });
	const config: GlobalConfig = { authToken: token };
	await writeFile(GLOBAL_CONFIG_FILE, JSON.stringify(config, undefined, 2), "utf-8");
}

export async function loadAuthToken(): Promise<string | undefined> {
	// Environment variable takes priority for CI/E2B non-interactive usage.
	const envToken = process.env.JOLLI_AUTH_TOKEN?.trim();
	if (envToken) {
		return envToken;
	}

	try {
		const content = await readFile(GLOBAL_CONFIG_FILE, "utf-8");
		const config: GlobalConfig = JSON.parse(content);
		return config.authToken;
	} catch {
		return;
	}
}

/**
 * Resolves the local space file path. When a `projectRoot` is provided
 * the path is resolved relative to that root; otherwise the default
 * cwd-relative path is used.
 */
function resolveSpaceFile(projectRoot?: string): string {
	if (projectRoot) {
		return join(resolve(projectRoot), LOCAL_JOLLI_DIR, "space.json");
	}
	return LOCAL_SPACE_FILE;
}

/**
 * Loads the active space for the current directory (or given project root).
 * Checks the local .jolli/space.json first, then falls back to the
 * global ~/.jolli/config.json for backward compatibility.
 *
 * @param projectRoot - Optional absolute path to the project root containing `.jolli/`.
 *                      When omitted the cwd-relative `.jolli/space.json` is used.
 */
export async function loadSpace(projectRoot?: string): Promise<string | undefined> {
	// Environment variable takes priority for CI/E2B non-interactive usage.
	const envSpace = process.env.JOLLI_SPACE?.trim();
	if (envSpace) {
		return envSpace;
	}

	// Try local per-directory space first
	const spaceFile = resolveSpaceFile(projectRoot);
	try {
		const content = await readFile(spaceFile, "utf-8");
		const config: LocalSpaceConfig = JSON.parse(content);
		if (config.space) {
			return config.space;
		}
	} catch {
		// Local file doesn't exist, fall through to global
	}

	// Fall back to global config for backward compatibility
	try {
		const content = await readFile(GLOBAL_CONFIG_FILE, "utf-8");
		const config: GlobalConfig = JSON.parse(content);
		return config.space;
	} catch {
		return;
	}
}

/**
 * Saves the space to the local .jolli/space.json.
 *
 * @param space - The space slug to save.
 * @param projectRoot - Optional absolute path to the project root containing `.jolli/`.
 *                      When omitted the cwd-relative `.jolli/` directory is used.
 */
export async function saveSpace(space: string, projectRoot?: string): Promise<void> {
	const dir = projectRoot ? join(resolve(projectRoot), LOCAL_JOLLI_DIR) : LOCAL_JOLLI_DIR;
	await mkdir(dir, { recursive: true });
	const spaceFile = resolveSpaceFile(projectRoot);
	const config: LocalSpaceConfig = { space };
	await writeFile(spaceFile, JSON.stringify(config, undefined, 2), "utf-8");
}

export async function clearAuthToken(): Promise<void> {
	try {
		await unlink(GLOBAL_CONFIG_FILE);
	} catch {
		// File might not exist, which is fine
	}
}
