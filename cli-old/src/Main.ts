import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

import { version } from "../package.json";
import { clearAuthToken, loadAuthToken } from "./util/Config";
import { getLog } from "./util/Logger";
import { browserLogin } from "./util/Login";
import { Command } from "commander";
import { createClient } from "jolli-common";

const log = getLog(import.meta);
const program = new Command();
program.name("jolli").description("Jolli CLI tool").version(version);

log.info(`Jolli CLI tool v${version} starting on Node ${process.version}`);

const url = process.env.JOLLI_URL ?? "http://localhost:8034";
const client = createClient(url, await loadAuthToken());

program
	.command("login")
	.description("Login to Jolli via browser OAuth")
	.action(async () => {
		await browserLogin(url);
		console.log("Successfully logged in!");
	});

program
	.command("logout")
	.description("Logout and clear stored credentials")
	.action(async () => {
		await clearAuthToken();
		console.log("Successfully logged out");
	});

program
	.command("status")
	.description("Get the status of the Jolli API")
	.action(async () => {
		const status = await client.status();
		console.log(status);
	});

program
	.command("sync")
	.description("Sync a GitHub repository URL to ingest markdown files")
	.argument("<url>", "GitHub repository URL to sync")
	.action(async (url: string) => {
		await client.sync(url);
		console.log(`Successfully synced ${url}`);
	});

program
	.command("interactive")
	.alias("i")
	.description("Start interactive chat mode")
	.action(async () => {
		const { startInteractiveMode } = await import("./interactive/index.js");
		await startInteractiveMode(client, url);
	});

program.parse();
