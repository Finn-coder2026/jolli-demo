import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

interface Config {
	authToken?: string;
}

const CONFIG_DIR = join(homedir(), ".jolli");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export async function saveAuthToken(token: string): Promise<void> {
	await mkdir(CONFIG_DIR, { recursive: true });
	const config: Config = { authToken: token };
	await writeFile(CONFIG_FILE, JSON.stringify(config, undefined, 2), "utf-8");
}

export async function loadAuthToken(): Promise<string | undefined> {
	try {
		const content = await readFile(CONFIG_FILE, "utf-8");
		const config: Config = JSON.parse(content);
		return config.authToken;
	} catch {
		return;
	}
}

export async function clearAuthToken(): Promise<void> {
	try {
		await unlink(CONFIG_FILE);
	} catch {
		// File might not exist, which is fine
	}
}
