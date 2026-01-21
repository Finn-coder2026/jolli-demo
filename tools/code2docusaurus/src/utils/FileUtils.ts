import path from "node:path";
import fs from "fs-extra";

export async function ensureDir(dirPath: string): Promise<void> {
	await fs.ensureDir(dirPath);
}

export async function writeJSON(filePath: string, data: unknown): Promise<void> {
	await ensureDir(path.dirname(filePath));
	await fs.writeJSON(filePath, data, { spaces: 2 });
}

export async function readJSON<T = unknown>(filePath: string): Promise<T> {
	return await fs.readJSON(filePath);
}

export async function fileExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

export async function copyDirectory(src: string, dest: string): Promise<void> {
	await fs.copy(src, dest);
}

export async function writeFile(filePath: string, content: string): Promise<void> {
	await ensureDir(path.dirname(filePath));
	await fs.writeFile(filePath, content, "utf-8");
}

export async function readFile(filePath: string): Promise<string> {
	return await fs.readFile(filePath, "utf-8");
}
