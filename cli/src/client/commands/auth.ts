// Auth Commands Module
// Handles authentication-related CLI commands (login, logout, status, space, init)

import { getConfig } from "../../shared/config";
import { findProjectRoot } from "../../shared/ProjectRoot";
import { clearAuthToken, loadAuthToken, loadSpace, saveSpace } from "../auth/config";
import { browserLogin } from "../auth/login";
import { selectSpace } from "../auth/SpaceSelector";
import type { Command } from "commander";

const config = getConfig();

// =============================================================================
// SECTION: Helpers
// =============================================================================

/**
 * Ensures the user is authenticated, triggering browser login if needed.
 * Returns the auth token on success.
 */
async function ensureAuthenticated(): Promise<string> {
	let token = await loadAuthToken();
	if (!token) {
		await browserLogin(config.JOLLI_URL);
		console.log("Successfully logged in!");
		token = await loadAuthToken();
	}
	if (!token) {
		throw new Error("Authentication failed — no token received.");
	}
	return token;
}

/**
 * Prompts the user to select a space and saves it.
 * When a `projectRoot` is provided the space is written to that root's
 * `.jolli/space.json`; otherwise it is written relative to cwd.
 */
async function pickAndSaveSpace(token: string, projectRoot?: string): Promise<void> {
	const selectedSlug = await selectSpace(token, config.JOLLI_URL);
	await saveSpace(selectedSlug, projectRoot);
	console.log(`Space set to: ${selectedSlug}`);
}

// =============================================================================
// SECTION: Command Registration
// =============================================================================

/**
 * Registers the top-level `init` command on the provided Commander program.
 * Ensures the user is authenticated and selects a space for this directory.
 */
export function registerInitCommand(program: Command): void {
	program
		.command("init")
		.description("Initialize this directory: login (if needed) and select a space")
		.action(async () => {
			try {
				// Non-interactive mode: when env vars provide auth and space,
				// just create .jolli/ and save the space config (for CI/E2B).
				const envToken = process.env.JOLLI_AUTH_TOKEN?.trim();
				const envSpace = process.env.JOLLI_SPACE?.trim();
				if (envToken && envSpace) {
					await saveSpace(envSpace);
					console.log(`Initialized with space: ${envSpace}`);
					return;
				}

				const token = await ensureAuthenticated();
				await pickAndSaveSpace(token);
			} catch (error) {
				console.error("Init failed:", error instanceof Error ? error.message : error);
				process.exit(1);
			}
		});
}

/**
 * Registers auth commands on the provided Commander program.
 */
export function registerAuthCommands(program: Command): void {
	const authCommand = program.command("auth").description("Authentication commands");

	authCommand
		.command("login")
		.description("Login to Jolli via browser OAuth")
		.action(async () => {
			try {
				const token = await ensureAuthenticated();
				const projectRoot = await findProjectRoot();
				await pickAndSaveSpace(token, projectRoot ?? undefined);
			} catch (error) {
				console.error("Login failed:", error instanceof Error ? error.message : error);
				process.exit(1);
			}
		});

	authCommand
		.command("logout")
		.description("Logout and clear stored credentials")
		.action(async () => {
			await clearAuthToken();
			console.log("Successfully logged out");
		});

	authCommand
		.command("status")
		.description("Check authentication status")
		.action(async () => {
			const token = await loadAuthToken();
			const projectRoot = await findProjectRoot();
			const space = await loadSpace(projectRoot ?? undefined);
			if (token) {
				console.log("Authenticated");
				console.log(`Space: ${space ?? "(none selected)"}`);
			} else {
				console.log("Not authenticated");
			}
		});

	authCommand
		.command("space")
		.description("Select active space for sync in this directory")
		.action(async () => {
			try {
				const token = await ensureAuthenticated();
				const projectRoot = await findProjectRoot();
				await pickAndSaveSpace(token, projectRoot ?? undefined);
			} catch (error) {
				console.error("Failed to select space:", error instanceof Error ? error.message : error);
				process.exit(1);
			}
		});
}
