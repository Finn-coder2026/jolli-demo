import { getLog } from "./Logger";
import { spawn } from "node:child_process";

const log = getLog(import.meta);

/**
 * Result of running a command
 */
export interface CommandResult {
	/** Exit code (0 = success) */
	exitCode: number;
	/** Standard output */
	stdout: string;
	/** Standard error */
	stderr: string;
}

/**
 * Options for running a command
 */
export interface CommandOptions {
	/** Working directory */
	cwd: string;
	/** Timeout in milliseconds (default: 120000 = 2 minutes) */
	timeout?: number;
	/** Environment variables to add/override */
	env?: Record<string, string>;
}

/**
 * Runs a command and captures its output
 *
 * @param command - The command to run (e.g., 'npm')
 * @param args - Arguments to pass to the command
 * @param options - Options including cwd and timeout
 * @returns Promise resolving to the command result
 */
export function runCommand(command: string, args: Array<string>, options: CommandOptions): Promise<CommandResult> {
	const { cwd, timeout = 120000, env } = options;

	log.info({ command, args, cwd }, "Running command");

	return new Promise(resolve => {
		const proc = spawn(command, args, {
			cwd,
			shell: true,
			env: { ...process.env, ...env },
		});

		let stdout = "";
		let stderr = "";
		let timedOut = false;

		// Set up timeout
		const timeoutId = setTimeout(() => {
			timedOut = true;
			proc.kill("SIGTERM");
			log.warn({ command, args, cwd, timeout }, "Command timed out");
		}, timeout);

		proc.stdout.on("data", (data: Buffer) => {
			const chunk = data.toString();
			stdout += chunk;
			// Log output in chunks for debugging
			if (chunk.trim()) {
				log.debug({ command }, chunk.trim());
			}
		});

		proc.stderr.on("data", (data: Buffer) => {
			const chunk = data.toString();
			stderr += chunk;
			// Log stderr as warnings
			if (chunk.trim()) {
				log.debug({ command, isStderr: true }, chunk.trim());
			}
		});

		proc.on("error", error => {
			clearTimeout(timeoutId);
			log.error({ command, args, error }, "Command failed to start");
			resolve({
				exitCode: 1,
				stdout,
				stderr: `${stderr}\nFailed to start command: ${error.message}`,
			});
		});

		proc.on("close", code => {
			clearTimeout(timeoutId);

			const exitCode = timedOut ? 124 : (code ?? 1);

			if (exitCode !== 0) {
				log.warn({ command, args, cwd, exitCode }, "Command exited with non-zero code");
			} else {
				log.info({ command, args, cwd }, "Command completed successfully");
			}

			resolve({
				exitCode,
				stdout,
				stderr: timedOut ? `${stderr}\nCommand timed out` : stderr,
			});
		});
	});
}

/**
 * Callback type for streaming command output
 */
export type OutputCallback = (data: string) => void;

/**
 * Runs a command with real-time output streaming via callbacks.
 * Used for streaming command progress to SSE clients.
 *
 * @param command - The command to run (e.g., 'npm')
 * @param args - Arguments to pass to the command
 * @param options - Options including cwd and timeout
 * @param onStdout - Callback invoked for each stdout chunk
 * @param onStderr - Callback invoked for each stderr chunk
 * @returns Promise resolving to the command result
 */
export function runCommandWithStreaming(
	command: string,
	args: Array<string>,
	options: CommandOptions,
	onStdout?: OutputCallback,
	onStderr?: OutputCallback,
): Promise<CommandResult> {
	const { cwd, timeout = 120000, env } = options;

	log.info({ command, args, cwd }, "Running command with streaming");

	return new Promise(resolve => {
		const proc = spawn(command, args, {
			cwd,
			shell: true,
			env: { ...process.env, ...env },
		});

		let stdout = "";
		let stderr = "";
		let timedOut = false;

		// Set up timeout
		const timeoutId = setTimeout(() => {
			timedOut = true;
			proc.kill("SIGTERM");
			log.warn({ command, args, cwd, timeout }, "Command timed out");
		}, timeout);

		proc.stdout.on("data", (data: Buffer) => {
			const chunk = data.toString();
			stdout += chunk;
			// Stream to callback
			if (onStdout) {
				onStdout(chunk);
			}
			// Log output in chunks for debugging
			if (chunk.trim()) {
				log.debug({ command }, chunk.trim());
			}
		});

		proc.stderr.on("data", (data: Buffer) => {
			const chunk = data.toString();
			stderr += chunk;
			// Stream to callback
			if (onStderr) {
				onStderr(chunk);
			}
			// Log stderr as warnings
			if (chunk.trim()) {
				log.debug({ command, isStderr: true }, chunk.trim());
			}
		});

		proc.on("error", error => {
			clearTimeout(timeoutId);
			log.error({ command, args, error }, "Command failed to start");
			resolve({
				exitCode: 1,
				stdout,
				stderr: `${stderr}\nFailed to start command: ${error.message}`,
			});
		});

		proc.on("close", code => {
			clearTimeout(timeoutId);

			const exitCode = timedOut ? 124 : (code ?? 1);

			if (exitCode !== 0) {
				log.warn({ command, args, cwd, exitCode }, "Command exited with non-zero code");
			} else {
				log.info({ command, args, cwd }, "Command completed successfully");
			}

			resolve({
				exitCode,
				stdout,
				stderr: timedOut ? `${stderr}\nCommand timed out` : stderr,
			});
		});
	});
}
